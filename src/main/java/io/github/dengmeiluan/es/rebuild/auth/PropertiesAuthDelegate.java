package io.github.dengmeiluan.es.rebuild.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.es.rebuild.config.EsRebuildProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 配置式宿主鉴权委托（R38）：{@code es.rebuild.console.auth.delegate.*} 纯 properties
 * 即可对接宿主凭据体系，不写一行 Java——与 R37 代码 SPI（{@link ConsoleAuthDelegate}）
 * 同一插槽，代码 SPI 优先（AutoConfiguration 用 {@code @ConditionalOnMissingBean} 让位）。
 *
 * <p>三模式：<b>jwt</b>（本地验签 {@link JwtVerifier}）/ <b>endpoint</b>（POST 回调宿主校验接口，
 * 结果按 token 短缓存）/ <b>header</b>（信任网关注入头）。任何模式认不出都返回 null
 * 交回内置鉴权（两套并存语义与代码 SPI 完全一致）。</p>
 *
 * @author aicoding
 */
public class PropertiesAuthDelegate implements ConsoleAuthDelegate {

    private static final Logger LOG = LoggerFactory.getLogger(PropertiesAuthDelegate.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int HTTP_TIMEOUT_MS = 5_000;
    /** endpoint 故障 warn 日志节流间隔（避免宿主接口宕机刷屏）。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    private final EsRebuildProperties.Delegate props;
    private final HostRoleMapper roleMapper;
    /** jwt 模式验签器（其余模式为 null）。 */
    private final JwtVerifier jwtVerifier;
    /** endpoint 模式：token → 缓存的校验结果。 */
    private final Map<String, CachedVerdict> verdictCache = new ConcurrentHashMap<>();
    private final AtomicLong lastEndpointWarnAt = new AtomicLong(0);
    /** 五百五十八批：jwt 验签失败 WARN 节流计数（同 endpoint 臂 lastEndpointWarnAt 范式）。 */
    private final AtomicLong lastJwtWarnAt = new AtomicLong(0);

    public PropertiesAuthDelegate(EsRebuildProperties.Delegate props) {
        this.props = props;
        this.roleMapper = new HostRoleMapper(props.getRoleMapping());
        this.jwtVerifier = "jwt".equalsIgnoreCase(props.getMode())
                ? new JwtVerifier(props.getJwt().getSecret(), props.getJwt().getPublicKey()) : null;
        LOG.info("[PropertiesAuthDelegate] 配置式宿主鉴权已启用 mode={} tokenHeader={}",
                props.getMode(), props.getTokenHeader());
    }

    @Override
    public ConsolePrincipal authenticate(HttpServletRequest request) {
        String mode = props.getMode() == null ? "" : props.getMode().toLowerCase(Locale.ROOT);
        switch (mode) {
            case "jwt":
                return byJwt(request);
            case "endpoint":
                return byEndpoint(request);
            case "header":
                return byHeader(request);
            default:
                return null;
        }
    }

    // ---------------- jwt ----------------

    private ConsolePrincipal byJwt(HttpServletRequest request) {
        String token = extractToken(request);
        if (token == null) {
            return null;
        }
        JsonNode claims = jwtVerifier.verify(token);
        if (claims == null) {
            // 五百五十八批：debug→节流 WARN——secret/publicKey 配错（全量验签失败）此前无痕，
            // 交回内置鉴权后运营无从排查；复用 endpoint 臂同款节流器防无效 token 高频探测刷屏
            long now = System.currentTimeMillis();
            long last = lastJwtWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastJwtWarnAt.compareAndSet(last, now)) {
                LOG.warn("[PropertiesAuthDelegate] jwt 验签失败/过期（交回内置鉴权，{}s 内不再重复告警；"
                                + "持续出现请核对 jwt secret/public-key 配置与 token 签发方算法）",
                        WARN_THROTTLE_MS / 1000);
            }
            return null;
        }
        String username = JwtVerifier.claimText(claims, props.getJwt().getUsernameClaim());
        if (username == null || username.isEmpty()) {
            return null;
        }
        List<String> hostRoles = JwtVerifier.claimRoles(claims, props.getJwt().getRolesClaim());
        // R63：取展示名 claim（配了才取），顶栏/审计从哈希变人话
        String displayName = props.getJwt().getDisplayNameClaim().isEmpty() ? null
                : JwtVerifier.claimText(claims, props.getJwt().getDisplayNameClaim());
        return new ConsolePrincipal(username, roleMapper.map(hostRoles), false, true, displayName, null);
    }

    // ---------------- endpoint ----------------

    private ConsolePrincipal byEndpoint(HttpServletRequest request) {
        String token = extractToken(request);
        if (token == null || props.getEndpoint().getVerifyUrl().isEmpty()) {
            return null;
        }
        long now = System.currentTimeMillis();
        CachedVerdict cached = verdictCache.get(token);
        if (cached != null && now < cached.expireAt) {
            return cached.principal;
        }
        ConsolePrincipal principal = callVerifyEndpoint(request, token);
        long ttl = Math.max(1, props.getEndpoint().getCacheSeconds()) * 1000L;
        verdictCache.put(token, new CachedVerdict(principal, now + ttl));
        if (verdictCache.size() > 10_000) {
            verdictCache.clear(); // 简单防膨胀：极端 token 洪泛时整体重置
        }
        return principal;
    }

    private ConsolePrincipal callVerifyEndpoint(HttpServletRequest request, String token) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(props.getEndpoint().getVerifyUrl()).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(HTTP_TIMEOUT_MS);
            conn.setReadTimeout(HTTP_TIMEOUT_MS);
            conn.setRequestProperty(props.getTokenHeader(), request.getHeader(props.getTokenHeader()));
            for (String h : props.getEndpoint().getForwardHeaders().split(",")) {
                String name = h.trim();
                if (!name.isEmpty() && request.getHeader(name) != null) {
                    conn.setRequestProperty(name, request.getHeader(name));
                }
            }
            conn.setDoOutput(true);
            conn.getOutputStream().close(); // 空 body POST
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                // 五百五十批：debug→节流 WARN——401/5xx 等故障此前无痕（交回内置鉴权运营无从排查）；
                // 401 高频回退场景复用 exception 臂节流器防刷屏（首条留痕，60s 内不再重复告警）
                long now = System.currentTimeMillis();
                long last = lastEndpointWarnAt.get();
                if (now - last > WARN_THROTTLE_MS && lastEndpointWarnAt.compareAndSet(last, now)) {
                    LOG.warn("[PropertiesAuthDelegate] endpoint 校验未通过 http={}（交回内置鉴权，{}s 内不再重复告警）",
                            code, WARN_THROTTLE_MS / 1000);
                }
                return null;
            }
            try (InputStream is = conn.getInputStream()) {
                JsonNode body = MAPPER.readTree(readAll(is));
                String username = JwtVerifier.claimText(body, props.getEndpoint().getUsernamePath());
                if (username == null || username.isEmpty()) {
                    // 2xx 但无 username=宿主接口的协议内否定裁决（正常应答、语义=凭据不通过，
                    // 负结果照契约入缓存）；与基础设施故障（非 2xx/异常臂）不同档，维持静默
                    return null;
                }
                List<String> hostRoles = JwtVerifier.claimRoles(body, props.getEndpoint().getRolesPath());
                // R63：宿主校验接口可同时下发展示名
                String displayName = props.getEndpoint().getDisplayNamePath().isEmpty() ? null
                        : JwtVerifier.claimText(body, props.getEndpoint().getDisplayNamePath());
                return new ConsolePrincipal(username, roleMapper.map(hostRoles), false, true, displayName, null);
            }
        } catch (Exception e) {
            long now = System.currentTimeMillis();
            long last = lastEndpointWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastEndpointWarnAt.compareAndSet(last, now)) {
                LOG.warn("[PropertiesAuthDelegate] endpoint 校验接口异常（交回内置鉴权，{}s 内不再重复告警）: {}",
                        WARN_THROTTLE_MS / 1000, e.getMessage());
            }
            return null;
        }
    }

    // ---------------- header ----------------

    private ConsolePrincipal byHeader(HttpServletRequest request) {
        String userHeader = props.getHeader().getUserHeader();
        if (userHeader.isEmpty()) {
            return null;
        }
        String username = request.getHeader(userHeader);
        if (username == null || username.trim().isEmpty()) {
            return null;
        }
        ConsoleRole role = ConsoleRole.VIEWER;
        String rolesHeader = props.getHeader().getRolesHeader();
        if (!rolesHeader.isEmpty()) {
            String raw = request.getHeader(rolesHeader);
            if (raw != null) {
                role = roleMapper.map(java.util.Arrays.asList(raw.split(",")));
            }
        }
        // R63：展示名头（网关注入）；含 % 视为 URL 编码过——HTTP 头携中文需编码，服务端兜底解
        String displayName = null;
        String dnHeader = props.getHeader().getDisplayNameHeader();
        if (!dnHeader.isEmpty()) {
            displayName = decodeMaybe(request.getHeader(dnHeader));
        }
        return new ConsolePrincipal(username.trim(), role, false, true, displayName, null);
    }

    // ---------------- helpers ----------------

    /** 展示名头解码：含 % 才尝试 URL 解码（纯 ASCII 人名直透），解码失败退回原值不报错。 */
    private static String decodeMaybe(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        String v = raw.trim();
        if (v.indexOf('%') >= 0) {
            try {
                return java.net.URLDecoder.decode(v, StandardCharsets.UTF_8.name());
            } catch (Exception ignore) {
                return v;
            }
        }
        return v;
    }

    /** 从 token-header 取凭据，剥 {@code Bearer } 前缀；无 → null。 */
    private String extractToken(HttpServletRequest request) {
        String raw = request.getHeader(props.getTokenHeader());
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        String token = raw.trim();
        if (token.regionMatches(true, 0, "Bearer ", 0, 7)) {
            token = token.substring(7).trim();
        }
        return token.isEmpty() ? null : token;
    }

    private static String readAll(InputStream is) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) > 0) {
            out.write(buf, 0, n);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    /** endpoint 模式短缓存条目（principal 可为 null——负结果同样缓存，防打穿宿主接口）。 */
    private static final class CachedVerdict {
        final ConsolePrincipal principal;
        final long expireAt;

        CachedVerdict(ConsolePrincipal principal, long expireAt) {
            this.principal = principal;
            this.expireAt = expireAt;
        }
    }
}
