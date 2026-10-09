package io.github.dengmeiluan.es.rebuild.auth;

import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 2.5.0 菜单 SPI：/auth/me 下发 grantedPages 三态 + 页面契约全量（前端导航过滤/Forbidden 取名用）。 */
public class ConsoleAuthControllerMeTest {

    /** hasAnyUser 固定 true 的桩（client supplier 给 null——me 路径不触 ES）。 */
    private static BuiltinConsoleAuthService stubAuthService() {
        return new BuiltinConsoleAuthService(() -> null, "es_console_user", "admin", "es-console", 1000L, "s") {
            @Override public boolean hasAnyUser() { return true; }
        };
    }

    private static final ConsoleOpsAuditStore NOOP_AUDIT = new ConsoleOpsAuditStore() {
        @Override public void record(ConsoleOpsAuditEvent event) { }
        @Override public java.util.List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    };

    private static HttpServletRequest requestWith(ConsolePrincipal p) {
        InvocationHandler h = (proxy, m, args) -> {
            if ("getAttribute".equals(m.getName())
                    && ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0])) return p;
            Class<?> rt = m.getReturnType();
            return rt == boolean.class ? false : rt == int.class ? 0 : null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthControllerMeTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsoleAuthController controller(boolean pageAuthEnabled) {
        return new ConsoleAuthController(stubAuthService(), NOOP_AUDIT, ConsolePageCatalog.load(), pageAuthEnabled);
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 委托身份_白名单_下发排序数组() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                new HashSet<>(Arrays.asList("search", "overview")));
        Map<String, Object> out = controller(true).me(requestWith(p));
        assertEquals(Arrays.asList("overview", "search"), out.get("grantedPages"));
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        assertEquals(12, ((List<Object>) pages.get("groups")).size());
    }

    @Test
    public void 委托身份_空集_下发空数组不折叠成null() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.<String>emptySet());
        Map<String, Object> out = controller(true).me(requestWith(p));
        // 前端 Array.isArray([]) === true → 全拒语义生效；折叠成 null 会变成「未启用」全量放行
        assertEquals(Collections.emptyList(), out.get("grantedPages"));
    }

    @Test
    public void 委托身份_未下发null_输出null() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null, null);
        assertNull(controller(true).me(requestWith(p)).get("grantedPages"));
    }

    @Test
    public void 内置身份_即使带集合也不下发() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("admin", ConsoleRole.ADMIN, true, false, null, null,
                Collections.singleton("overview"));
        assertNull(controller(true).me(requestWith(p)).get("grantedPages"));
    }

    @Test
    public void 逃生阀关闭_输出null() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.singleton("overview"));
        assertNull(controller(false).me(requestWith(p)).get("grantedPages"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 逃生阀关闭_pages仍下发() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.singleton("overview"));
        Map<String, Object> out = controller(false).me(requestWith(p));
        // 逃生阀只关授权判定与 grantedPages；pages 契约非秘密，无条件下发（Forbidden 取名数据源）
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        assertNotNull(pages);
        assertEquals(12, ((List<Object>) pages.get("groups")).size());
    }

    @Test
    @SuppressWarnings("unchecked")
    public void pages契约全量下发_组带页_页带route() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.ADMIN, false, true, null, null, null);
        Map<String, Object> out = controller(true).me(requestWith(p));
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        List<Map<String, Object>> groups = (List<Map<String, Object>>) pages.get("groups");
        assertEquals(12, groups.size());
        int total = 0;
        for (Map<String, Object> g : groups) {
            List<Map<String, Object>> ps = (List<Map<String, Object>>) g.get("pages");
            total += ps.size();
            for (Map<String, Object> pm : ps) {
                assertTrue(pm.get("key") != null && pm.get("route") != null && pm.get("name") != null);
                // minVer 显式为 null 也在键集中——前端按契约消费键集，不判值
                assertTrue(pm.containsKey("minVer"));
            }
        }
        assertEquals(52, total);
        // 全链不可变加固：浅尝一层，groups 列表不可改（内层 pm/ps/gm 同样已在构造期冻结）
        try {
            groups.clear();
            fail("pages.groups 应为不可变列表");
        } catch (UnsupportedOperationException expected) {
            // 预期
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void pages契约_页条目下发apiPrefixes() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.ADMIN, false, true, null, null, null);
        Map<String, Object> out = controller(true).me(requestWith(p));
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        List<Map<String, Object>> groups = (List<Map<String, Object>>) pages.get("groups");
        Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (Map<String, Object> g : groups) {
            for (Map<String, Object> pm : (List<Map<String, Object>>) g.get("pages")) {
                byKey.put((String) pm.get("key"), pm);
            }
        }
        // 键集在场：每个页条目都带 apiPrefixes 键（值可为空数组）——前端用同一份数据镜像 pageOf 定端点归属
        for (Map<String, Object> pm : byKey.values()) {
            assertTrue("页 " + pm.get("key") + " 缺 apiPrefixes 键", pm.containsKey("apiPrefixes"));
        }
        // 已知页：indices 的端点归属前缀原样下发（与契约 META-INF/es-console-pages.json 一致）
        List<String> indicesPrefixes = (List<String>) byKey.get("indices").get("apiPrefixes");
        assertNotNull(indicesPrefixes);
        assertTrue(indicesPrefixes.contains("/internal/es/index/cluster/delete-index"));
        // 空 apiPrefixes 页：下发空数组而非省略键（前端 Array.isArray 校验需要数组在场）
        assertEquals(Collections.emptyList(), byKey.get("workspace").get("apiPrefixes"));
    }
}
