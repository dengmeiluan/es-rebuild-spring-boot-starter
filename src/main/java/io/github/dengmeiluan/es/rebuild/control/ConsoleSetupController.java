package io.github.dengmeiluan.es.rebuild.control;

import io.github.dengmeiluan.es.rebuild.auth.ConsoleAuthDelegate;
import io.github.dengmeiluan.es.rebuild.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.es.rebuild.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.es.rebuild.auth.ConsolePrincipal;
import io.github.dengmeiluan.es.rebuild.auth.ConsoleRole;
import io.github.dengmeiluan.es.rebuild.web.EsErrorMapper;
import io.github.dengmeiluan.es.rebuild.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.es.rebuild.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 控制集群 Setup 端点（R37）：{@code /internal/es/index/setup}。
 *
 * <p>与 Kibana 首连体验对齐：宿主无 ES（NONE 模式）时前端弹首连向导，
 * 用户录入控制集群连接串 → test 探测 → apply 绑定（幂等初始化控制索引 + 本地自举档案）。</p>
 *
 * <p><b>防劫持</b>：{@code test}/{@code apply} 仅在未绑定时开放（绑定后 403 ALREADY_BOUND，
 * 即便控制集群暂时不可达也不重开——见 {@link ControlClusterResolver} 语义）；重绑走
 * {@code rebind}（常规鉴权 ADMIN 高危清单）。宿主注册了 {@link ConsoleAuthDelegate} 时，
 * apply 还要求委托认出的 ADMIN 身份（宿主 场景：绑定动作只有宿主管理员能做）。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/setup")
public class ConsoleSetupController {

    private final ControlClusterResolver resolver;
    private final RemoteEsClientFactory clientFactory;
    private final ConsoleOpsAuditStore opsAuditStore;
    private final ConsoleAuthDelegate delegate;
    private final String appName;
    private final boolean hostClusterVisible;

    public ConsoleSetupController(ControlClusterResolver resolver, RemoteEsClientFactory clientFactory,
                                  ConsoleOpsAuditStore opsAuditStore, ConsoleAuthDelegate delegate,
                                  String appName, boolean hostClusterVisible) {
        this.resolver = resolver;
        this.clientFactory = clientFactory;
        this.opsAuditStore = opsAuditStore;
        this.delegate = delegate;
        this.appName = appName;
        this.hostClusterVisible = hostClusterVisible;
    }

    /** 绑定状态（免鉴权：前端启动即查，决定是否弹向导）。 */
    @GetMapping("status")
    public Map<String, Object> status() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("bound", resolver.bound());
        r.put("mode", resolver.mode().name());
        r.put("endpoint", resolver.endpoint());
        r.put("appName", appName);
        // R39.2：纯管理平台形态下前端藏掉「宿主集群」入口（后端 EsTargetInterceptor 同步拒绝）
        r.put("hostVisible", hostClusterVisible);
        return r;
    }

    /** 连通性测试（仅未绑定开放）。body: {url, username?, password?}。失败 HTTP 200 {ok:false}。 */
    @PostMapping("test")
    public ResponseEntity<Map<String, Object>> test(@RequestBody Map<String, String> body) {
        if (resolver.bound()) {
            return alreadyBound();
        }
        return ResponseEntity.ok(probe(body));
    }

    /** 绑定控制集群（仅未绑定开放；有委托时要求宿主 ADMIN）。body: {url, username?, password?}。 */
    @PostMapping("apply")
    public ResponseEntity<Map<String, Object>> apply(@RequestBody Map<String, String> body,
                                                     HttpServletRequest request) {
        if (resolver.bound()) {
            return alreadyBound();
        }
        String operator = "setup";
        if (delegate != null) {
            ConsolePrincipal p = delegate.authenticate(request);
            if (p == null || !p.getRole().atLeast(ConsoleRole.ADMIN)) {
                Map<String, Object> b = new LinkedHashMap<>();
                b.put("code", "FORBIDDEN");
                b.put("message", "绑定控制集群需要宿主管理员身份");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(b);
            }
            operator = p.getUsername();
        }
        RemoteClusterConn conn = parseConn(body);
        resolver.bindBootstrap(conn);
        opsAuditStore.record(io.github.dengmeiluan.es.rebuild.auth.ConsoleOpsAuditEvent.builder()
                .username(operator).role(ConsoleRole.ADMIN.name()).method("POST")
                .uri("/internal/es/index/setup/apply").action("SETUP").httpStatus(200)
                .detail("bind " + conn.endpoint())
                .build());
        return ResponseEntity.ok(status());
    }

    /** 重绑控制集群（高危：常规鉴权 ADMIN，见拦截器高危清单 /setup/rebind）。 */
    @PostMapping("rebind")
    public Map<String, Object> rebind(@RequestBody Map<String, String> body, HttpServletRequest request) {
        RemoteClusterConn conn = parseConn(body);
        resolver.bindBootstrap(conn);
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        String operator = p instanceof ConsolePrincipal ? ((ConsolePrincipal) p).getUsername() : "unknown";
        opsAuditStore.record(io.github.dengmeiluan.es.rebuild.auth.ConsoleOpsAuditEvent.builder()
                .username(operator).role(ConsoleRole.ADMIN.name()).method("POST")
                .uri("/internal/es/index/setup/rebind").action("REBIND").httpStatus(200)
                .detail("rebind " + conn.endpoint())
                .build());
        return status();
    }

    // ---------------- internal ----------------

    private static ResponseEntity<Map<String, Object>> alreadyBound() {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("code", "ALREADY_BOUND");
        b.put("message", "控制台已绑定控制集群；重绑请由 ADMIN 走 setup/rebind");
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(b);
    }

    private static RemoteClusterConn parseConn(Map<String, String> body) {
        RemoteClusterConn conn = RemoteClusterConn.parse(body.get("url"));
        if (body.get("username") != null && !body.get("username").trim().isEmpty()) {
            conn.setUsername(body.get("username").trim());
        }
        if (body.get("password") != null && !body.get("password").isEmpty()) {
            conn.setPassword(body.get("password"));
        }
        return conn;
    }

    /** 与 EsClusterConnController.test 同款探测：临时 client 用完即关。 */
    private Map<String, Object> probe(Map<String, String> body) {
        Map<String, Object> r = new LinkedHashMap<>();
        RemoteClusterConn conn;
        try {
            conn = parseConn(body);
        } catch (IllegalArgumentException e) {
            r.put("ok", false);
            r.put("message", e.getMessage());
            return r;
        }
        try (RestHighLevelClient probe = clientFactory.build(conn)) {
            Response info = probe.getLowLevelClient().performRequest(new Request("GET", "/"));
            @SuppressWarnings("unchecked")
            Map<String, Object> infoMap = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                    org.apache.http.util.EntityUtils.toString(info.getEntity()), Map.class);
            r.put("ok", true);
            r.put("clusterName", infoMap.get("cluster_name"));
            Object ver = infoMap.get("version");
            r.put("version", ver instanceof Map ? ((Map<?, ?>) ver).get("number") : null);
            try {
                Response health = probe.getLowLevelClient().performRequest(new Request("GET", "/_cluster/health"));
                @SuppressWarnings("unchecked")
                Map<String, Object> h = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                        org.apache.http.util.EntityUtils.toString(health.getEntity()), Map.class);
                r.put("status", h.get("status"));
                r.put("nodes", h.get("number_of_nodes"));
            } catch (Exception ignore) {
                // 有的账号无 health 权限：info 已通即算连通
            }
        } catch (Exception e) {
            r.put("ok", false);
            // 五百五十八批：与 EsClusterConnController.test 及 advice 路径 {code,message} 双轨对齐
            // ——错误体补 code 键（ok/message 既有键保留，前端消费零破坏）；message null 兜底改中文
            r.put("code", "PROBE_FAILED");
            r.put("message", e.getMessage() == null ? "连接探测失败(未知异常类型)" : e.getMessage());
            // 五百六十一批：补 endpoint 键（additive）——与 advice 路径 EsErrorMapper.body 同口径
            // （method + " " + requestURI），失败端点一眼可定位；RequestContextHolder 取当前请求，
            // 非 web 线程/单测无上下文时宁缺勿炸不输出该键（endpointOf 空白口径同源）
            String endpoint = EsErrorMapper.endpointOf(currentRequest());
            if (endpoint != null) {
                r.put("endpoint", endpoint);
            }
        }
        return r;
    }

    /** 当前 HTTP 请求（供探测错误体带 endpoint 上下文）；无 web 上下文返回 null，绝不抛异常。 */
    private static javax.servlet.http.HttpServletRequest currentRequest() {
        org.springframework.web.context.request.RequestAttributes ra =
                RequestContextHolder.getRequestAttributes();
        return ra instanceof ServletRequestAttributes
                ? ((ServletRequestAttributes) ra).getRequest() : null;
    }
}
