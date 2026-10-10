package io.github.dengmeiluan.es.rebuild.auth;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * (内部) ES 控制台鉴权端点（）：登录 / 自助 / 用户管理 / 操作审计流水。
 *
 * <p>仅在使用内置 {@link BuiltinConsoleAuthService} 时装配；宿主用自己的
 * {@link EsConsoleAuthorizer} 替换后，登录发生在宿主体系里，本控制器不再出现。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/auth")
public class ConsoleAuthController {

    private final BuiltinConsoleAuthService authService;
    private final ConsoleOpsAuditStore opsAuditStore;
    private final boolean pageAuthEnabled;
    /** 页面契约全量载荷（组→页），构造期预建；前端 Forbidden 页取名 / 运行时对账用。 */
    private final Map<String, Object> pagesPayload;

    public ConsoleAuthController(BuiltinConsoleAuthService authService, ConsoleOpsAuditStore opsAuditStore,
                                 ConsolePageCatalog pageCatalog, boolean pageAuthEnabled) {
        this.authService = authService;
        this.opsAuditStore = opsAuditStore;
        this.pageAuthEnabled = pageAuthEnabled;
        this.pagesPayload = buildPagesPayload(pageCatalog);
    }

    /** 页面契约 → me 响应载荷（apiPrefixes 随契约下发：前端用同一份数据镜像 pageOf 定端点归属；hotkey/icon 前端走构建期 JSON）。 */
    private static Map<String, Object> buildPagesPayload(ConsolePageCatalog catalog) {
        List<Map<String, Object>> groups = new ArrayList<>();
        for (ConsolePageCatalog.Group g : catalog.getGroups()) {
            Map<String, Object> gm = new LinkedHashMap<>();
            gm.put("id", g.getId());
            gm.put("name", g.getName());
            gm.put("sort", g.getSort());
            List<Map<String, Object>> ps = new ArrayList<>();
            for (ConsolePageCatalog.Page p : catalog.pagesOf(g.getId())) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("key", p.getKey());
                pm.put("name", p.getName());
                pm.put("route", p.getRoute());
                pm.put("minVer", p.getMinVer());
                pm.put("apiPrefixes", p.getApiPrefixes());
                ps.add(Collections.unmodifiableMap(pm));
            }
            gm.put("pages", Collections.unmodifiableList(ps));
            groups.add(Collections.unmodifiableMap(gm));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("groups", Collections.unmodifiableList(groups));
        return Collections.unmodifiableMap(out);
    }

    /** 登录（免鉴权白名单）。凭证错误回 401 结构化 code。：登录审计带来源 IP。 */
    @PostMapping("login")
    public Map<String, Object> login(@RequestBody Map<String, String> body,
                                     HttpServletRequest request,
                                     javax.servlet.http.HttpServletResponse response) throws IOException {
        Map<String, Object> result = authService.login(body.get("username"), body.get("password"));
        if (result == null) {
            response.setStatus(401);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "BAD_CREDENTIALS");
            err.put("message", "用户名或密码错误");
            opsAuditStore.record(ConsoleOpsAuditEvent.builder()
                    .username(body.get("username")).role("-")
                    .method("POST").uri("/internal/es/index/auth/login")
                    .action("LOGIN_FAIL").httpStatus(401)
                    .ip(clientIp(request))
                    .build());
            return err;
        }
        opsAuditStore.record(ConsoleOpsAuditEvent.builder()
                .username(String.valueOf(result.get("username")))
                .displayName(String.valueOf(result.get("role")))
                .method("POST").uri("/internal/es/index/auth/login")
                .action("LOGIN").httpStatus(200)
                .detail(Boolean.TRUE.equals(result.get("fallback")) ? "fallback 默认账号登录" : null)
                .ip(clientIp(request))
                .build());
        return result;
    }

    /** 来源地址（与 ConsoleAuthInterceptor.clientIp 同口径；登录端点在拦截器白名单外自采）。 */
    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.trim().isEmpty()) {
            String first = xff.split(",")[0].trim();
            if (!first.isEmpty()) {
                return first;
            }
        }
        String real = request.getHeader("X-Real-IP");
        if (real != null && !real.trim().isEmpty()) {
            return real.trim();
        }
        return request.getRemoteAddr();
    }

    /** 当前身份（前端启动时探测 token 是否仍有效）。 */
    @GetMapping("me")
    public Map<String, Object> me(HttpServletRequest request) throws IOException {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("username", p.getUsername());
        out.put("role", p.getRole().name());
        out.put("fallback", p.isFallback());
        out.put("delegated", p.isDelegated());
        // 身份档案位——人名 + 来源 + 宿主扩展属性，顶栏身份卡产品化的数据源
        out.put("displayName", p.getDisplayName());
        out.put("authSource", p.isDelegated() ? "delegate" : "builtin");
        // 2.5.0 菜单 SPI：页面白名单三态下发（null=不启用；空列表=全拒，不得折叠成 null）+ 契约全量
        out.put("grantedPages", pageAuthEnabled && p.isDelegated() && p.getGrantedPages() != null
                ? new ArrayList<>(new TreeSet<>(p.getGrantedPages())) : null);
        // 契约非秘密，无条件下发——逃生阀只关授权判定与 grantedPages，不关 Forbidden 取名数据源
        out.put("pages", pagesPayload);
        if (!p.getAttributes().isEmpty()) {
            out.put("attributes", p.getAttributes());
        }
        out.put("hasAnyUser", authService.hasAnyUser());
        return out;
    }

    /** 改自己的密码（兜底账号改密 = 建立首个真实账号；宿主委托身份无内置密码可改）。 */
    @PostMapping("change-password")
    public Map<String, Object> changePassword(HttpServletRequest request,
                                              javax.servlet.http.HttpServletResponse response,
                                              @RequestBody Map<String, String> body) throws IOException {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (p.isDelegated()) {
            // 委托身份由宿主体系管理凭证，控制台无密码可改
            response.setStatus(400);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "DELEGATED");
            err.put("message", "当前身份由宿主系统委托鉴权，请在宿主系统修改密码");
            return err;
        }
        authService.changePassword(p, body.get("oldPassword"), body.get("newPassword"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("relogin", p.isFallback());
        return out;
    }

    /* ------------------------------- 用户管理（ADMIN，拦截器已卡） ------------------------------- */

    /** 用户列表。 */
    @GetMapping("users")
    public List<Map<String, Object>> listUsers() throws IOException {
        return authService.listUsers();
    }

    /** 新建/更新用户。body: {username, password?, role}。 */
    @PostMapping("users/upsert")
    public Map<String, Object> upsertUser(HttpServletRequest request,
                                          @RequestBody Map<String, String> body) throws IOException {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        authService.upsertUser(p, body.get("username"), body.get("password"), ConsoleRole.parse(body.get("role")));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    /** 删除用户。 */
    @PostMapping("users/delete")
    public Map<String, Object> deleteUser(@RequestParam String username) throws IOException {
        authService.deleteUser(username);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    /** 操作审计流水（倒序，支持 from 分页）。：线缆 {records:[...]}——
     *  旧「ES search 响应形态直通」的契约泄漏在此单点终结，记录键即 {@link ConsoleOpsAuditEvent} 维度全集。
     *  20260922 快筛批：全维筛选下推（时间范围/集群/角色/方法/HTTP/来源/IP/耗时阈值/URI 前缀/关键词），
     *  旧 since 参数保持兼容（fromMs 未传时落 since）。 */
    @GetMapping("ops-audit")
    public Map<String, Object> opsAudit(@RequestParam(required = false) String username,
                                        @RequestParam(required = false) String action,
                                        @RequestParam(required = false, defaultValue = "100") int size,
                                        @RequestParam(required = false, defaultValue = "0") int from,
                                        @RequestParam(required = false) Long since,
                                        @RequestParam(required = false) Long fromMs,
                                        @RequestParam(required = false) Long toMs,
                                        @RequestParam(required = false) String connId,
                                        @RequestParam(required = false) String connName,
                                        @RequestParam(required = false) String role,
                                        @RequestParam(required = false) String method,
                                        @RequestParam(required = false) Integer httpStatus,
                                        @RequestParam(required = false) String source,
                                        @RequestParam(required = false) String ip,
                                        @RequestParam(required = false) Long minCostMs,
                                        @RequestParam(required = false) String uriPrefix,
                                        @RequestParam(required = false) String kw) {
        /* 时间范围下推；20260922：全维结构化查询对象 */
        return wire(opsAuditStore.search(ConsoleOpsAuditQuery.builder()
                .username(username).action(action)
                .fromMs(fromMs != null ? fromMs : since).toMs(toMs)
                .connId(connId).connName(connName).role(role).method(method)
                .httpStatus(httpStatus).source(source).ip(ip).minCostMs(minCostMs)
                .uriPrefix(uriPrefix).kw(kw)
                .size(size).from(from)
                .build()));
    }

    /** 自助操作流水——任何已认证身份（VIEWER+，拦截器已放行）查「自己的」操作。
        username 强制取服务端身份，请求参数不可注入——越权看他人流水在结构上不可能；
        非审计角色（非 AUDIT_OP/ADMIN）无法进安全中心全量表，这里给「我做了什么」的最小回溯。
        20260922 快筛批：自助安全子集=时间范围/动作/方法/HTTP/耗时阈值/URI 前缀/关键词。 */
    @GetMapping("ops-audit/mine")
    public Map<String, Object> opsAuditMine(HttpServletRequest request,
                                            @RequestParam(required = false) String action,
                                            @RequestParam(required = false, defaultValue = "50") int size,
                                            @RequestParam(required = false, defaultValue = "0") int from,
                                            @RequestParam(required = false) Long since,
                                            @RequestParam(required = false) Long fromMs,
                                            @RequestParam(required = false) Long toMs,
                                            @RequestParam(required = false) String method,
                                            @RequestParam(required = false) Integer httpStatus,
                                            @RequestParam(required = false) Long minCostMs,
                                            @RequestParam(required = false) String uriPrefix,
                                            @RequestParam(required = false) String kw,
                                            @RequestParam(required = false) String connName) {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return wire(opsAuditStore.search(ConsoleOpsAuditQuery.builder()
                .username(p.getUsername()).action(action).connName(connName)
                .fromMs(fromMs != null ? fromMs : since).toMs(toMs)
                .method(method).httpStatus(httpStatus).minCostMs(minCostMs)
                .uriPrefix(uriPrefix).kw(kw)
                .size(size).from(from)
                .build()));
    }

    /** 类型化记录 → 线缆载荷（扁平键，与 {@link ConsoleOpsAuditEvent} 维度一一对应；null 省略）。 */
    private static Map<String, Object> wire(List<ConsoleOpsAuditEvent> records) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (ConsoleOpsAuditEvent e : records) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("timestamp", e.getTimestamp());
            r.put("username", e.getUsername());
            if (e.getDisplayName() != null) {
                r.put("displayName", e.getDisplayName());
            }
            r.put("role", e.getRole());
            r.put("method", e.getMethod());
            r.put("uri", e.getUri());
            r.put("action", e.getAction());
            r.put("httpStatus", e.getHttpStatus());
            if (e.getDetail() != null) {
                r.put("detail", e.getDetail());
            }
            if (e.getConnId() != null) {
                r.put("connId", e.getConnId());
            }
            if (e.getConnName() != null) {
                r.put("connName", e.getConnName());
            }
            if (e.getIp() != null) {
                r.put("ip", e.getIp());
            }
            if (e.getCostMs() != null) {
                r.put("costMs", e.getCostMs());
            }
            r.put("source", e.getSource() == null ? "console" : e.getSource());
            rows.add(Collections.unmodifiableMap(r));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", Collections.unmodifiableList(rows));
        return Collections.unmodifiableMap(out);
    }
}
