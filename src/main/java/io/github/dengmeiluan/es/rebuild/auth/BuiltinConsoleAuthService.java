package io.github.dengmeiluan.es.rebuild.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 内置控制台账号服务（R34）：账号存 ES 索引 {@code es_console_user}，无任何外部依赖。
 *
 * <p>核心语义（与用户约定一致）：<b>用户索引里一个账号都没有时，用兜底默认账号
 * {@code admin / es-console}（可配置）登录，角色 ADMIN；一旦 ES 里建立了任何账号，
 * 兜底账号即失效，一切以 ES 里的用户为准。</b></p>
 *
 * <ul>
 *   <li>密码：PBKDF2WithHmacSHA256（纯 JDK，salt 16B + 迭代 31000），不落明文。</li>
 *   <li>token：无状态 HMAC-SHA256 签名（username.role.expires.sig），TTL 可配置；
 *       secret 未配置时启动随机生成（重启后 token 全失效，需重新登录）。</li>
 *   <li>ES IO 全部走 low-level REST（不碰 spring-data-es 版本敏感面，利于跨 SB 2.3~2.7 宿主）。</li>
 * </ul>
 *
 * @author aicoding
 */
public class BuiltinConsoleAuthService implements EsConsoleAuthorizer {

    private static final Logger LOG = LoggerFactory.getLogger(BuiltinConsoleAuthService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 请求头（前端 api.ts 统一附带）。 */
    public static final String TOKEN_HEADER = "X-Es-Console-Token";

    private static final int PBKDF2_ITERATIONS = 31_000;
    private static final int PBKDF2_KEY_BITS = 256;
    private static final int SALT_BYTES = 16;

    private final java.util.function.Supplier<RestHighLevelClient> client;
    private final String userIndex;
    private final String fallbackUsername;
    private final String fallbackPassword;
    private final long tokenTtlMs;
    private final byte[] hmacSecret;

    public BuiltinConsoleAuthService(java.util.function.Supplier<RestHighLevelClient> client, String userIndex,
                                     String fallbackUsername, String fallbackPassword,
                                     long tokenTtlMs, String configuredSecret) {
        this.client = client;
        this.userIndex = userIndex;
        this.fallbackUsername = fallbackUsername;
        this.fallbackPassword = fallbackPassword;
        this.tokenTtlMs = tokenTtlMs;
        if (configuredSecret != null && !configuredSecret.trim().isEmpty()) {
            this.hmacSecret = configuredSecret.trim().getBytes(StandardCharsets.UTF_8);
        } else {
            byte[] random = new byte[32];
            new SecureRandom().nextBytes(random);
            this.hmacSecret = random;
            LOG.info("[es-console-auth] 未配置 token secret，已随机生成（实例重启后需重新登录；" +
                    "多实例部署请配置 es.rebuild.console.auth.token-secret 保证 token 互通）");
        }
    }

    /* ==================================================================================== */
    /* 登录 / token                                                                          */
    /* ==================================================================================== */

    /**
     * 登录：ES 有账号按 ES 校验；一个账号都没有时按兜底默认账号。
     *
     * @return {token, username, role, fallback, expiresAt}；凭证错误返回 null
     */
    public Map<String, Object> login(String username, String password) throws IOException {
        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty()) {
            // 空用户名会拼出 /_doc/ 空 id 请求导致 ES 405，此处直接按凭证错误处理
            return null;
        }
        Map<String, Object> user = findUser(username);
        ConsolePrincipal principal = null;
        if (user != null) {
            if (verifyPassword(username, password, user)) {
                principal = new ConsolePrincipal(username, ConsoleRole.parse(String.valueOf(user.get("role"))), false);
            }
        } else if (!hasAnyUser() && fallbackUsername.equals(username) && fallbackPassword.equals(password)) {
            // 兜底默认账号：仅在用户索引完全为空时生效
            principal = new ConsolePrincipal(username, ConsoleRole.ADMIN, true);
        }
        if (principal == null) {
            return null;
        }
        long expiresAt = System.currentTimeMillis() + tokenTtlMs;
        String token = issueToken(principal, expiresAt);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        out.put("username", principal.getUsername());
        out.put("role", principal.getRole().name());
        out.put("fallback", principal.isFallback());
        out.put("expiresAt", expiresAt);
        return out;
    }

    @Override
    public ConsolePrincipal authenticate(HttpServletRequest request) {
        String token = request.getHeader(TOKEN_HEADER);
        if (token == null || token.isEmpty()) {
            String auth = request.getHeader("Authorization");
            if (auth != null && auth.startsWith("Bearer ")) {
                token = auth.substring(7);
            }
        }
        return verifyToken(token);
    }

    /** 签发 token：b64(username).role.expires.b64(hmac(username|role|expires))。 */
    private String issueToken(ConsolePrincipal p, long expiresAt) {
        String userB64 = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(p.getUsername().getBytes(StandardCharsets.UTF_8));
        String flag = p.isFallback() ? "F" : "N";
        String payload = userB64 + "." + p.getRole().name() + "." + expiresAt + "." + flag;
        return payload + "." + hmac(payload);
    }

    /** 校验 token：签名 + TTL + 兜底账号仍有效性（有真实账号后兜底 token 立即作废）。 */
    public ConsolePrincipal verifyToken(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 5) {
            return null;
        }
        String payload = parts[0] + "." + parts[1] + "." + parts[2] + "." + parts[3];
        if (!constantTimeEquals(hmac(payload), parts[4])) {
            return null;
        }
        long expiresAt;
        try {
            expiresAt = Long.parseLong(parts[2]);
        } catch (NumberFormatException e) {
            return null;
        }
        if (System.currentTimeMillis() > expiresAt) {
            return null;
        }
        String username = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
        boolean fallback = "F".equals(parts[3]);
        if (fallback) {
            // 兜底 token 只在「仍然没有任何账号」时有效，防止建号后旧兜底 token 越权
            try {
                if (hasAnyUser()) {
                    return null;
                }
            } catch (IOException e) {
                /* 五百四十七批：静默拒绝→WARN——合法兜底 token 被用户索引 IO 失败静默拒绝
                   =用户锁死且零日志（登录失败与「建号后兜底失效」从外表无法分辨）；拒绝语义
                   本身不变（吞异常契约：校验失败一律 null），只补留痕与 username 上下文 */
                LOG.warn("[es-console-auth] 兜底 token 因用户索引 IO 失败被按无效拒绝 username={}：{}",
                        username, e.getMessage());
                return null;
            }
        }
        return new ConsolePrincipal(username, ConsoleRole.parse(parts[1]), fallback);
    }

    /* ==================================================================================== */
    /* 用户管理（ADMIN）                                                                      */
    /* ==================================================================================== */

    /** 用户列表（不含密码哈希）。 */
    public List<Map<String, Object>> listUsers() throws IOException {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Object> resp = perform("POST", "/" + userIndex + "/_search",
                "{\"size\":100,\"sort\":[{\"username.keyword\":{\"order\":\"asc\",\"unmapped_type\":\"keyword\"}}]}");
        if (resp == null) {
            return out;
        }
        for (Map<String, Object> hit : extractHits(resp)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> src = (Map<String, Object>) hit.get("_source");
            if (src == null) {
                continue;
            }
            Map<String, Object> u = new LinkedHashMap<>();
            u.put("username", src.get("username"));
            u.put("role", src.get("role"));
            u.put("updatedAt", src.get("updatedAt"));
            u.put("updatedBy", src.get("updatedBy"));
            out.add(u);
        }
        return out;
    }

    /** 新建/覆盖用户（password 为空表示只改角色）。 */
    public void upsertUser(ConsolePrincipal actor, String username, String password, ConsoleRole role) throws IOException {
        if (username == null || username.trim().isEmpty()) {
            throw new IllegalArgumentException("username 不可为空");
        }
        username = username.trim();
        Map<String, Object> existing = findUser(username);
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("username", username);
        doc.put("role", role.name());
        doc.put("updatedAt", System.currentTimeMillis());
        doc.put("updatedBy", actor == null ? "system" : actor.getUsername());
        if (password != null && !password.isEmpty()) {
            byte[] salt = new byte[SALT_BYTES];
            new SecureRandom().nextBytes(salt);
            doc.put("salt", Base64.getEncoder().encodeToString(salt));
            doc.put("iterations", PBKDF2_ITERATIONS);
            doc.put("passwordHash", Base64.getEncoder().encodeToString(pbkdf2(password, salt, PBKDF2_ITERATIONS)));
        } else if (existing != null) {
            // 只改角色：保留原密码要素
            doc.put("salt", existing.get("salt"));
            doc.put("iterations", existing.get("iterations"));
            doc.put("passwordHash", existing.get("passwordHash"));
        } else {
            throw new IllegalArgumentException("新建用户必须提供密码");
        }
        // 降级/删除保护：不能把最后一个 ADMIN 降级
        if (existing != null && ConsoleRole.parse(String.valueOf(existing.get("role"))) == ConsoleRole.ADMIN
                && role != ConsoleRole.ADMIN && countAdmins() <= 1) {
            throw new IllegalStateException("不能降级最后一个 ADMIN 账号");
        }
        perform("PUT", "/" + userIndex + "/_doc/" + urlEncode(username) + "?refresh=true",
                MAPPER.writeValueAsString(doc));
    }

    /** 修改自己的密码（校验旧密码；兜底账号引导为「建立首个真实账号」）。 */
    public void changePassword(ConsolePrincipal actor, String oldPassword, String newPassword) throws IOException {
        if (newPassword == null || newPassword.length() < 6) {
            throw new IllegalArgumentException("新密码至少 6 位");
        }
        if (actor.isFallback()) {
            // 兜底账号改密 = 建立首个真实账号（admin/ADMIN），此后兜底失效
            if (!fallbackPassword.equals(oldPassword)) {
                throw new IllegalArgumentException("旧密码不正确");
            }
            upsertUser(actor, actor.getUsername(), newPassword, ConsoleRole.ADMIN);
            return;
        }
        Map<String, Object> user = findUser(actor.getUsername());
        if (user == null || !verifyPassword(actor.getUsername(), oldPassword, user)) {
            throw new IllegalArgumentException("旧密码不正确");
        }
        upsertUser(actor, actor.getUsername(), newPassword, ConsoleRole.parse(String.valueOf(user.get("role"))));
    }

    /** 删除用户（保护最后一个 ADMIN）。 */
    public void deleteUser(String username) throws IOException {
        Map<String, Object> existing = findUser(username);
        if (existing == null) {
            return;
        }
        if (ConsoleRole.parse(String.valueOf(existing.get("role"))) == ConsoleRole.ADMIN && countAdmins() <= 1) {
            throw new IllegalStateException("不能删除最后一个 ADMIN 账号");
        }
        perform("DELETE", "/" + userIndex + "/_doc/" + urlEncode(username) + "?refresh=true", null);
    }

    /** 用户索引是否为空（决定兜底账号是否生效）。 */
    public boolean hasAnyUser() throws IOException {
        Map<String, Object> resp = perform("GET", "/" + userIndex + "/_count", null);
        if (resp == null) {
            return false;
        }
        Object count = resp.get("count");
        return count instanceof Number && ((Number) count).longValue() > 0;
    }

    /* ==================================================================================== */
    /* 内部工具                                                                              */
    /* ==================================================================================== */

    private Map<String, Object> findUser(String username) throws IOException {
        Map<String, Object> resp = perform("GET", "/" + userIndex + "/_doc/" + urlEncode(username), null);
        if (resp == null || !Boolean.TRUE.equals(resp.get("found"))) {
            return null;
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> src = (Map<String, Object>) resp.get("_source");
        return src;
    }

    private long countAdmins() throws IOException {
        Map<String, Object> resp = perform("POST", "/" + userIndex + "/_count",
                "{\"query\":{\"term\":{\"role.keyword\":\"ADMIN\"}}}");
        if (resp == null) {
            return 0;
        }
        Object count = resp.get("count");
        return count instanceof Number ? ((Number) count).longValue() : 0;
    }

    private boolean verifyPassword(String username, String password, Map<String, Object> user) {
        try {
            byte[] salt = Base64.getDecoder().decode(String.valueOf(user.get("salt")));
            int iterations = user.get("iterations") instanceof Number
                    ? ((Number) user.get("iterations")).intValue() : PBKDF2_ITERATIONS;
            byte[] expected = Base64.getDecoder().decode(String.valueOf(user.get("passwordHash")));
            byte[] actual = pbkdf2(password, salt, iterations);
            return MessageDigest.isEqual(expected, actual);
        } catch (Exception e) {
            // 五百五十一批：全静默→WARN——档案要素损坏（坏 Base64/迭代数坏值等）时登录失败
            // 与「密码错误」从外表无法分辨且零日志；拒绝语义不变（吞异常契约：一律 false），
            // 只补留痕。密码材料零入日志：仅 username + throwable（哈希/salt 绝不打）
            LOG.warn("[es-console-auth] 密码校验失败（用户档案要素损坏?，按凭证错误拒绝）username={}",
                    username, e);
            return false;
        }
    }

    private static byte[] pbkdf2(String password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, PBKDF2_KEY_BITS);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException("PBKDF2 计算失败", e);
        }
    }

    private String hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 计算失败", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        return a != null && b != null
                && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static String urlEncode(String s) {
        try {
            return java.net.URLEncoder.encode(s, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return s;
        }
    }

    /** 低层 REST 调用；404（索引不存在/文档不存在）宽容返回 null 或 found=false 原文。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> perform(String method, String path, String body) throws IOException {
        Request req = new Request(method, path);
        if (body != null) {
            req.setJsonEntity(body);
        }
        try {
            Response resp = client.get().getLowLevelClient().performRequest(req);
            String text = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            return text == null || text.isEmpty() ? null : MAPPER.readValue(text, Map.class);
        } catch (org.elasticsearch.client.ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return null;
            }
            throw e;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> extractHits(Map<String, Object> searchResp) {
        Object hitsWrap = searchResp.get("hits");
        if (!(hitsWrap instanceof Map)) {
            return java.util.Collections.emptyList();
        }
        Object hits = ((Map<String, Object>) hitsWrap).get("hits");
        return hits instanceof List ? (List<Map<String, Object>>) hits : java.util.Collections.emptyList();
    }
}
