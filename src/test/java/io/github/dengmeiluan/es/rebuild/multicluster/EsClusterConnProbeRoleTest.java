/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.es.rebuild.multicluster;

import io.github.dengmeiluan.es.rebuild.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.es.rebuild.auth.ConsolePrincipal;
import io.github.dengmeiluan.es.rebuild.auth.ConsoleRole;
import io.github.dengmeiluan.es.rebuild.xmigrate.RemoteClusterConn;
import org.junit.Test;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

/**
 * 探活 IDOR 收口：连接列表按 minRole 过滤后，probe 端点也必须按同一档案 minRole 裁决，
 * 否则 VIEWER 知道 id 就能探活 ADMIN 级连接并读取集群名/版本/健康。
 */
public class EsClusterConnProbeRoleTest {

    private static ConnStore store(String minRole) {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) {
                RemoteClusterConn c = new RemoteClusterConn();
                c.setMinRole(minRole);
                return c;
            }
            @Override public String getName(String id) { return id; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static HttpServletRequest request(ConsoleRole role) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL,
                new ConsolePrincipal("u", role, false));
        InvocationHandler h = (proxy, method, args) -> {
            if ("getAttribute".equals(method.getName())) return attrs.get(args[0]);
            throw new UnsupportedOperationException(method.getName());
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                EsClusterConnProbeRoleTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static EsClusterConnController controller(String minRole) {
        return new EsClusterConnController(store(minRole), null, null, null);
    }

    @Test
    public void viewer不能探活ADMIN级连接() {
        try {
            controller("ADMIN").probe("c-admin", request(ConsoleRole.VIEWER));
            fail("应拒绝低于档案 minRole 的探活");
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
    }

    @Test
    public void ADMIN可探活ADMIN级连接_无探活器时回禁用态() {
        Map<String, Object> r = controller("ADMIN").probe("c-admin", request(ConsoleRole.ADMIN));
        assertEquals("UNKNOWN", r.get("status"));
        assertEquals("PROBE_DISABLED", r.get("code"));
    }
}
