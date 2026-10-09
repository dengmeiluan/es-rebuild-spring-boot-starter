package io.github.dengmeiluan.es.rebuild.auth;

import io.github.dengmeiluan.es.rebuild.control.ControlClusterResolver;
import io.github.dengmeiluan.es.rebuild.multicluster.ConnStore;
import io.github.dengmeiluan.es.rebuild.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.es.rebuild.config.EsRebuildProperties;
import org.junit.Test;

import javax.servlet.ServletOutputStream;
import javax.servlet.WriteListener;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 2.5.0 菜单 SPI 页面门：delegated + 宿主下发 grantedPages 时，页面专属端点必须在白名单内。
 * 矩阵钉死三态语义（null=不启用 / 空集=全拒 / 非空=白名单）、共享端点豁免、逃生阀、
 * 页面门先于角色门、context-path 剥离。
 */
public class ConsoleAuthInterceptorPageAuthTest {

    /* ---------------- 桩设施（JDK 动态代理，仓内无 mockito/spring-test） ---------------- */

    /**
     * 只实现拦截器用到的方法：URI/contextPath/servletPath/method/queryString + attribute 存取。
     * default 分支抛 UnsupportedOperationException：拦截器新增任何读取都必须在这里显式登记，
     * 让「实现读了桩没覆盖的方法」以测试红显性化，而非静默拿到默认值。
     */
    private static HttpServletRequest stubRequest(String method, String uri, String contextPath) {
        // 默认 servletPath=""/pathInfo=null（/* 空前缀映射语义），既有用例零改动
        return stubRequest(method, uri, contextPath, "", null);
    }

    /** 五百五十八批：带请求头的桩（委托令牌/目标头）——LOGIN 审计事件用例专用。 */
    private static HttpServletRequest stubRequest(String method, String uri, Map<String, String> headers) {
        Map<String, Object> attrs = new HashMap<>();
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": return "";
                case "getServletPath": return "";
                case "getPathInfo": return null;
                case "getMethod": return method;
                case "getQueryString": return null;
                case "getAttribute": return attrs.get(args[0]);
                case "setAttribute": attrs.put((String) args[0], args[1]); return null;
                case "getHeader": return headers.get((String) args[0]);
                case "getRemoteAddr": return "10.1.2.3";
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthInterceptorPageAuthTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    /**
     * servletPath/pathInfo 可按用例配置：Tomcat 默认映射（/）下 servletPath=完整请求路径且 pathInfo=null；
     * 前缀映射（spring.mvc.servlet.path=/api → /api/*）下 servletPath=/api、pathInfo=前缀之后剩余路径。
     */
    private static HttpServletRequest stubRequest(String method, String uri, String contextPath,
                                                  String servletPath, String pathInfo) {
        Map<String, Object> attrs = new HashMap<>();
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": return contextPath;
                case "getServletPath": return servletPath;
                case "getPathInfo": return pathInfo;
                case "getMethod": return method;
                case "getQueryString": return null;
                case "getAttribute": return attrs.get(args[0]);
                case "setAttribute": attrs.put((String) args[0], args[1]); return null;
                case "getHeader": return null;
                case "getRemoteAddr": return "10.1.2.3";
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthInterceptorPageAuthTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    /** 捕获 status + body 的响应桩。 */
    private static class StubResponse {
        int status = 200;
        final ByteArrayOutputStream body = new ByteArrayOutputStream();
        final HttpServletResponse proxy;

        StubResponse() {
            InvocationHandler h = (p, m, args) -> {
                switch (m.getName()) {
                    case "setStatus": status = (Integer) args[0]; return null;
                    case "getStatus": return status;
                    case "setContentType": case "setCharacterEncoding": return null;
                    case "getOutputStream":
                        return new ServletOutputStream() {
                            @Override public void write(int b) { body.write(b); }
                            @Override public boolean isReady() { return true; }
                            @Override public void setWriteListener(WriteListener l) { }
                        };
                    default: throw new UnsupportedOperationException(m.getName());
                }
            };
            proxy = (HttpServletResponse) Proxy.newProxyInstance(
                    ConsoleAuthInterceptorPageAuthTest.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, h);
        }

        String bodyText() { return new String(body.toByteArray(), StandardCharsets.UTF_8); }
    }

    /** 审计捕获桩（五百五十五批：唯一写入口=富事件）。 */
    private static class CapturingAudit implements ConsoleOpsAuditStore {
        String action; int httpStatus; String uri; ConsoleOpsAuditEvent last;
        @Override public void record(ConsoleOpsAuditEvent event) {
            this.uri = event.getUri(); this.action = event.getAction(); this.httpStatus = event.getHttpStatus();
            this.last = event;
        }
        @Override public java.util.List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    }

    private static ConsolePrincipal delegated(Set<String> grantedPages) {
        return new ConsolePrincipal("host-u1", ConsoleRole.ADMIN, false, true, "宿主用户", null, grantedPages);
    }

    /** 五百五十八批：可指定角色的委托身份（超管域优先裁决用例——conn 模型用户恒非 ADMIN）。 */
    private static ConsolePrincipal delegatedAs(ConsoleRole role, Set<String> grantedPages) {
        return new ConsolePrincipal("host-u1", role, false, true, "宿主用户", null, grantedPages);
    }

    private static ConsoleAuthInterceptor interceptor(ConsolePrincipal principal, boolean pageAuthEnabled,
                                                      CapturingAudit audit) {
        EsConsoleAuthorizer authorizer = req -> principal;
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConnStore stubStore = new ConnStore() {
            @Override public java.util.List<java.util.Map<String, Object>> list() { return java.util.Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public java.util.Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) { throw new UnsupportedOperationException(); }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        EnvPagesResolver envPagesResolver = new EnvPagesResolver(stubStore, new EsRebuildProperties());
        return new ConsoleAuthInterceptor(authorizer, audit, resolver, ConsolePageCatalog.load(), pageAuthEnabled,
                envPagesResolver, stubStore);
    }

    /* ---------------- 拦截矩阵 ---------------- */

    @Test
    public void 内置身份_grantedPages为null_页面端点放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("admin", ConsoleRole.ADMIN, true, false), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 委托身份_宿主未下发null_放行_向后兼容() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(null), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 委托身份_白名单含目标页_放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(new HashSet<>(Arrays.asList("overview", "search"))), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 委托身份_白名单不含目标页_403带page且审计PAGE_DENIED() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("search")), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"page\":\"overview\""));
        // preHandle 返回 false 后 afterCompletion 不回调，拒绝事件必须在页面门内显式落审计
        assertEquals("PAGE_DENIED", audit.action);
        assertEquals(403, audit.httpStatus);
        assertEquals("/internal/es/index/overview", audit.uri);
    }

    @Test
    public void 委托身份_空集_页面端点全拒() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.<String>emptySet()), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void 委托身份_空集_共享端点放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.<String>emptySet()), true, audit);
        // /cluster/health 是全局引导共享端点（pageOf=null），不吃页面级
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/health", ""), new StubResponse().proxy, null));
        // /auth/me 共享（角色档 VIEWER 兜底）
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/auth/me", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 五百九十三批_管理域放开_security读键可见用户列表_无键仍PAGE_DENIED() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        /* 五百九十三批语义升格：users 归属 security 页（pages.json apiPrefixes），读按页读键
           可见（用户列表）——558 批的 ADMIN 一刀切拦截随「管理域放开」退役；写操作仍须
           w:security 写键（本文件「users 归 security 页_写键放行_无写键仍拒」用例钉死） */
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:security", "conn:c1:overview"))), true, audit);
        /* 真实前端形态：api.ts 全局附带 X-Es-Target（security 读键按该 target 组 effectivePages） */
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/auth/users",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        /* 负锚（判别力保留）：无任何键的 conn 模型用户 GET /auth/users → PAGE_DENIED */
        ConsoleAuthInterceptor it2 = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:overview"))), true, audit);
        StubResponse resp2 = new StubResponse();
        assertFalse(it2.preHandle(stubRequest("GET", "/internal/es/index/auth/users",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp2.proxy, null));
        assertEquals(403, resp2.status);
        assertEquals("PAGE_DENIED", audit.action);
        /* 五百七十四批：ops-audit 移出 security 页归属——回归共享端点走角色门（rank3），
           conn 读键不再放行 VIEWER 的全量审计（auth/users 同款收权） */
        StubResponse respAudit = new StubResponse();
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/auth/ops-audit",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), respAudit.proxy, null));
        assertEquals(403, respAudit.status);
        assertTrue(respAudit.bodyText().contains("\"required\""));
    }

    @Test
    public void 五百五十八批_委托会话首见落LOGIN审计_同令牌去重() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:overview"))), true, audit);
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Host-Token", "host-jwt-token-a");
        headers.put("X-Es-Target", "c1");
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", headers), new StubResponse().proxy, null));
        assertEquals("LOGIN", audit.action);
        assertEquals("宿主委托会话建立", audit.last.getDetail());
        audit.action = null;
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", headers), new StubResponse().proxy, null));
        assertEquals(null, audit.action); /* 同令牌第二次请求不再落 LOGIN */
        headers.put("X-Es-Host-Token", "host-jwt-token-b"); /* 换发=新会话 */
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", headers), new StubResponse().proxy, null));
        assertEquals("LOGIN", audit.action);
    }

    @Test
    public void 逃生阀关闭_空集也放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.<String>emptySet()), false, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
        assertNull("逃生阀关闭时页面门不得落审计", audit.action);
    }

    @Test
    public void 页面门先于角色门_报page而非required() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // VIEWER + 白名单仅 search：POST /cluster/bulk 页面不在白名单（角色档 OPERATOR 也不够）
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.singleton("search"));
        ConsoleAuthInterceptor it = interceptor(p, true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/bulk", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"page\":\"bulk\""));
        assertFalse("页面门必须先于角色门响", resp.bodyText().contains("\"required\""));
    }

    @Test
    public void 分号矩阵参数变形_归一化后命中页面门_403带page() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("search")), true, audit);
        StubResponse resp = new StubResponse();
        // raw URI 含 ;x=y 矩阵参数时 pageOf 字面失配会误判「共享端点」放行——归一化后必须命中 bulk 页
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/bulk;x=y", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"page\":\"bulk\""));
    }

    @Test
    public void 百分号编码变形_归一化后命中页面门_403带page() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("search")), true, audit);
        StubResponse resp = new StubResponse();
        // %62 = 'b'：raw URI 字面失配即逃逸，归一化解码后必须命中 bulk 页
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/%62ulk", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"page\":\"bulk\""));
    }

    @Test
    public void 非委托身份_带grantedPages_页面门不生效_放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 畸形身份（非 delegated 但 grantedPages 非 null）：AND 短路门不生效——Task 11 依赖此语义
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.ADMIN, true, false, null, null,
                Collections.singleton("search"));
        ConsoleAuthInterceptor it = interceptor(p, true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
        assertNull("非委托身份页面门不生效，不得落 PAGE_DENIED 审计", audit.action);
    }

    @Test
    public void 页面门通过_角色门接管_报required而非page() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // delegated VIEWER 白名单含 bulk：页面门放行，POST /cluster/bulk 属高危清单，角色门必须正常接管
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.singleton("bulk"));
        ConsoleAuthInterceptor it = interceptor(p, true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/bulk", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\""));
        assertFalse("页面门已通过，拒绝必须来自角色门", resp.bodyText().contains("\"page\""));
    }

    /* ---------------- 五百七十四批：conn 模型写门 WRITE_DENIED + 内置 VIEWER 角色门强制 ---------------- */

    @Test
    public void 五百七十四批_conn模型只有读键_写请求WRITE_DENIED403() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // conn 模型 VIEWER 只授 indices 页读键（conn:c1:indices）：delete-index 写请求须写键
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:indices"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-index",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("WRITE_DENIED"));
        assertTrue(resp.bodyText().contains("\"page\":\"indices\""));
        // preHandle 返回 false 后 afterCompletion 不回调，写门拒绝必须显式落审计
        assertEquals("WRITE_DENIED", audit.action);
        assertEquals(403, audit.httpStatus);
    }

    @Test
    public void 五百七十四批_conn模型写键_写请求放行_短路角色门() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 同请求换写键 conn:c1:w:indices：连接模型的写授权即最终裁决——VIEWER 角色门不再二次否决
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:w:indices"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-index",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull("conn 写键放行不得落拒绝审计", audit.action);
    }

    @Test
    public void 五百七十四批_内置VIEWER角色门强制_高危写端点403报required() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 内置（非 delegated）身份 grantedPages=null：页面门不启用，角色门全量强制
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("viewer", ConsoleRole.VIEWER, true, false), true, audit);
        // POST bulk → REBUILD_KEYWORDS rank3
        StubResponse respBulk = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/bulk", ""), respBulk.proxy, null));
        assertEquals(403, respBulk.status);
        assertTrue(respBulk.bodyText().contains("\"required\":\"REBUILD_OP\""));
        assertFalse("内置身份不走页面门，不得报 page", respBulk.bodyText().contains("\"page\""));
        // DELETE snapshot/delete → CLUSTER_KEYWORDS rank3
        StubResponse respSnap = new StubResponse();
        assertFalse(it.preHandle(stubRequest("DELETE", "/internal/es/index/cluster/snapshot/delete", ""),
                respSnap.proxy, null));
        assertEquals(403, respSnap.status);
        assertTrue(respSnap.bodyText().contains("\"required\":\"REBUILD_OP\""));
        // PUT ilm/policy → CLUSTER_KEYWORDS rank3
        StubResponse respIlm = new StubResponse();
        assertFalse(it.preHandle(stubRequest("PUT", "/internal/es/index/cluster/ilm/policy", ""),
                respIlm.proxy, null));
        assertEquals(403, respIlm.status);
        assertTrue(respIlm.bodyText().contains("\"required\":\"REBUILD_OP\""));
        assertNull("拒绝路径在 preHandle 内落审计前不产生动作", audit.action);
    }

    /* ------------- 五百七十五批·用户实报打通：共享低危写端点认 conn 写键（角色×授权形态×端点档位全矩阵） -------------
       用户实报：飞书授权用户（宿主角色映射恒 VIEWER）持 QA 集群写键，表格编辑提交
       （POST /cluster/update-partial，共享端点无页面归属）被角色门拦——前端 canWriteOn 认
       conn:{tid}:w:* 通配写键开放编辑入口，后端共享端点却不认写键 = 有权限写不进。
       575 批打通语义（已被 584 升格取代）：conn 模型写键持有者可执行「缺省低危写档」的共享端点；
       584 起不限档位（任意写键放行共享写，ADMIN 管理域除外），strict 已随语义升格整体退役。
       五百八十四批语义升格（用户裁决「按照角色菜单配置的勾选来，按照真正的连接权限菜单 spi 来」）：
       conn 模型下勾选即权限——共享写端点不再限 OPERATOR 档（任意写键放行，ADMIN 管理域除外），
       strict 双因子开关整体退役（角色门在连接模型下不复辟）。 */

    @Test
    public void 五百七十五批打通_conn写键VIEWER_共享低危写端点放行_表格编辑提交() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 断点锚（用户实报场景）：VIEWER + docs 页写键 + POST update-partial（共享端点）→ 放行
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:docs", "conn:c1:w:docs"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull("打通放行不得落拒绝审计", audit.action);
    }

    @Test
    public void 五百七十五批打通_仅读键无写键_共享写端点维持角色门403() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 只授 docs 读键（无 w: 键）：共享写端点仍落角色门——收紧面不因打通扩大
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:docs"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\":\"OPERATOR\""));
    }

    @Test
    public void 五百八十四批_连接勾选即权限_写键放行共享高危档deleteById() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 584 语义升格：delete-by-id（删文档，CLUSTER→REBUILD_OP 共享端点）不再限 OPERATOR 档——
        // 连接菜单勾了写（任意 w: 键）即可做，角色档在连接模型下不参与裁决
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:docs", "conn:c1:w:docs"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-by-id",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull(audit.action);
    }

    @Test
    public void 五百八十四批_连接勾选即权限_写键放行共享ilmPolicy写端点() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // PUT /cluster/ilm/policy（CLUSTER→REBUILD_OP 共享端点）：同语义放行
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:docs", "conn:c1:w:docs"))), true, audit);
        assertTrue(it.preHandle(stubRequest("PUT", "/internal/es/index/cluster/ilm/policy",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull(audit.action);
    }

    /* ------------- 五百九十三批·管理域放开（用户裁决「管理域放」）：raw/users 归属菜单页按勾选裁决 -------------
       raw 归 rest 页（POST /cluster/raw 归 REST 直连页写勾选）、users 归 security 页（用户管理
       归安全中心写勾选）——es-console-pages.json apiPrefixes 归属后页面门自然接管（读键可见+
       写键 WRITE_DENIED）；系统管理（/setup/rebind 重绑、/clusters/ 连接档案）无菜单勾选项
       对应且为授权体系载体，维持 ADMIN 专属。静态模型（SPI 未启用）维持角色档 ADMIN。 */
    @Test
    public void 五百九十三批_管理域放开_raw归rest页_写键放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:rest", "conn:c1:w:rest"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/raw",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull(audit.action);
    }

    @Test
    public void 五百九十三批_管理域放开_users归security页_写键放行_无写键仍拒() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 有 security 写键：用户管理（POST /auth/users/upsert）放行
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:security", "conn:c1:w:security"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/auth/users/upsert",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        // 仅读键（无 w:security）：写请求 WRITE_DENIED（页面门接管，不再是 ADMIN 一刀切）
        ConsoleAuthInterceptor it2 = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:security"))), true, audit);
        StubResponse resp2 = new StubResponse();
        assertFalse(it2.preHandle(stubRequest("POST", "/internal/es/index/auth/users/upsert",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp2.proxy, null));
        assertEquals(403, resp2.status);
        assertTrue(resp2.bodyText().contains("WRITE_DENIED"));
    }

    /* ------------- 五百九十四批·系统管理端点也按连接勾选放开（用户裁决「rebind/clusters 这个也要」）-------------
       语义：conn 模型写键持有人（hasAnyWriteKey）=宿主授过写权的管理者，可管理连接档案
       （save/delete/sync）与重绑控制集群（rebind）；无写键维持 403（负锚保判别力）。 */
    @Test
    public void 五百九十四批_系统管理放开_写键持有人可管连接档案() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:rest", "conn:c1:w:rest", "conn:c1:security", "conn:c1:w:security"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/clusters/save",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull(audit.action);
    }

    @Test
    public void 五百九十四批_系统管理放开_写键持有人可重绑控制集群() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:rest", "conn:c1:w:rest"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/setup/rebind",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull(audit.action);
    }

    @Test
    public void 五百九十批_系统管理无写键_维持ADMIN角色档403_负锚() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 仅读键（无任意 w: 键）：系统管理端点维持 ADMIN 档拒绝（静态/连接模型同语义）
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:rest", "conn:c1:security"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/clusters/save",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\":\"ADMIN\""));
        StubResponse resp2 = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/setup/rebind",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp2.proxy, null));
        assertEquals(403, resp2.status);
    }

    @Test
    public void 五百九十三批_静态模型管理域维持角色档_raw无授权VIEWER仍拒() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 静态模型（grantedPages=null，SPI 未启用）：raw 维持 ADMIN 角色档兜底
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("viewer", ConsoleRole.VIEWER, true, false), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/raw", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\":\"ADMIN\""));
    }

    @Test
    public void 五百七十五批打通_OPERATOR纯角色无写键_低危共享写端点角色门放行不回归() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // OPERATOR（无任何 grantedPages=null，非 conn 模型）：角色门既有放行路径不回归
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("ops-u1", ConsoleRole.OPERATOR, true, false), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial", ""),
                new StubResponse().proxy, null));
    }

    /* ---------------- 五百七十八批：打通面角落矩阵（target 错配 / 桶成员逐一 / 静态模型 / 读请求不受扰） ---------------- */

    @Test
    public void 五百七十八批打通_target错配_c1写键救不了c2的共享写请求() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // hasAnyWriteKey 按 targetId 查（conn:{target}:w: 前缀）：c1 的写键对 c2 的请求无效
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:docs", "conn:c1:w:docs"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial",
                java.util.Collections.singletonMap("X-Es-Target", "c2")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\":\"OPERATOR\""));
        assertNull("角色门拒绝走 deny()，打通分支未命中不得落共享写审计", audit.action);
    }

    @Test
    public void 五百七十八批打通_共享低危写桶成员逐一放行锚() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 桶成员=pageOf==null（契约核实共享）且 requiredRole==OPERATOR（不在 rank3/readonly/admin 清单）的写端点
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:docs", "conn:c1:w:docs"))), true, audit);
        Map<String, String> target = java.util.Collections.singletonMap("X-Es-Target", "c1");
        // 表格编辑·整文档更新（InternalEsIndexRebuildController:226）
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-document", target),
                new StubResponse().proxy, null));
        // 文档写入·新建（:746）
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/doc", target),
                new StubResponse().proxy, null));
        // 文档更新（:754）
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/doc/update", target),
                new StubResponse().proxy, null));
        // 任务取消（:375）
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/tasks/cancel", target),
                new StubResponse().proxy, null));
        // 洞察预估（InsightController actions/{actionId}/estimate；任务原列 /insight/estimate 无此端点）
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/insight/actions/a1/estimate", target),
                new StubResponse().proxy, null));
        assertNull("桶成员放行不得落拒绝审计", audit.action);
    }

    @Test
    public void 五百七十八批打通_静态键模型_共享写端点维持角色门() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // grantedPages 全静态键（无 conn: 前缀）→ inConnModel=false：静态键本就不授写，永不因写键语义放行
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(java.util.Collections.singletonList("docs"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\":\"OPERATOR\""));
    }

    @Test
    public void 五百七十八批打通_写键持有人读请求不受扰_GET照旧放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // GET 本就 VIEWER 放行（requiredRole=VIEWER 先于一切），打通分支只动写路径——防回归
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:docs", "conn:c1:w:docs"))), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/indices",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull("读请求放行不得落拒绝审计", audit.action);
    }

    @Test
    public void contextPath剥离后才匹配页面() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("overview")), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/宿主/internal/es/index/overview", "/宿主"),
                new StubResponse().proxy, null));
        ConsoleAuthInterceptor it2 = interceptor(delegated(Collections.<String>emptySet()), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it2.preHandle(stubRequest("GET", "/宿主/internal/es/index/overview", "/宿主"),
                resp.proxy, null));
        assertEquals(403, resp.status);
    }

    /* ---------------- servletPath 归一化（377fed0 真机事故回归钉） ---------------- */

    @Test
    public void 默认映射_servletPath为完整路径_pathInfo为null_归一化不得吞掉整条路径() {
        // Tomcat 默认映射（/）：getServletPath() 返回完整请求路径、pathInfo=null。
        // 若按「非 / 即剥」处理，path 会被剥成空串——377fed0 事故根因
        HttpServletRequest req = stubRequest("GET", "/internal/es/index/setup/status", "",
                "/internal/es/index/setup/status", null);
        assertEquals("/internal/es/index/setup/status", ConsoleAuthInterceptor.normalizePath(req));
    }

    @Test
    public void 默认映射_白名单端点_未登录也必须放行_真机401事故复现() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // authorizer 返回 null（未登录）：白名单命中必须先于 authenticate 短路；
        // 归一化吞路径 → isWhitelisted("")=false → 走到 authenticate → 401（真机实锤）
        ConsoleAuthInterceptor it = interceptor(null, true, audit);
        StubResponse resp = new StubResponse();
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/setup/status", "",
                "/internal/es/index/setup/status", null), resp.proxy, null));
        assertEquals("白名单端点不得写 401", 200, resp.status);
    }

    @Test
    public void 前缀映射_servletPath为api_pathInfo非空_归一化剥掉前缀_页面门口径不变() {
        // 377fed0 目标场景保住：spring.mvc.servlet.path=/api → 映射 /api/*，
        // servletPath=/api、pathInfo=/internal/...，前缀必须剥掉否则页面门静默失效
        HttpServletRequest req = stubRequest("GET", "/api/internal/es/index/overview", "",
                "/api", "/internal/es/index/overview");
        assertEquals("/internal/es/index/overview", ConsoleAuthInterceptor.normalizePath(req));
    }
}
