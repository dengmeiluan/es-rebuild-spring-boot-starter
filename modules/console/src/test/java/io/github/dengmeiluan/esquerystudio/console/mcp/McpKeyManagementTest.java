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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.*;

public class McpKeyManagementTest {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }

        @Override
        public Map<String, Object> clusterHealth() {
            return Collections.<String, Object>singletonMap("status", "green");
        }
    }

    private ConsolePrincipal principal(String username, ConsoleRole role, String... pages) {
        Set<String> granted = pages.length == 0 ? null : new LinkedHashSet<>(Arrays.asList(pages));
        return new ConsolePrincipal(username, role, false, false, null, Collections.emptyMap(), granted);
    }

    private MockHttpServletRequest request(ConsolePrincipal principal) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        return request;
    }

    private Map<String, Object> body(Object... pairs) {
        Map<String, Object> body = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) body.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return body;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(ResponseEntity<?> response) {
        return (Map<String, Object>) response.getBody();
    }

    private ConnStore connStore(String... ids) {
        Map<String, RemoteClusterConn> byId = new LinkedHashMap<>();
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        for (String id : ids) {
            RemoteClusterConn conn = new RemoteClusterConn("http", "127.0.0.1", 9200, null, null);
            conn.setMinRole("VIEWER");
            conn.setEnv("QA");
            byId.put(id, conn);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id);
            row.put("name", id);
            row.put("env", "QA");
            rows.add(row);
        }
        return (ConnStore) java.lang.reflect.Proxy.newProxyInstance(
                ConnStore.class.getClassLoader(), new Class<?>[]{ConnStore.class},
                (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "list": return rows;
                        case "get": return byId.get(String.valueOf(args[0]));
                        case "getName": return String.valueOf(args[0]);
                        default: return null;
                    }
                });
    }

    @Test
    public void connScopedDevtoolsGrantAllowsMcpListAndScopedCatalog() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"));
        MockHttpServletRequest req = request(principal("x1", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:w:devtools", "conn:prod:devtools"));

        ResponseEntity<?> list = controller.list(req);
        assertEquals(200, list.getStatusCodeValue());
        Map<String, Object> body = asMap(list);
        List<?> tools = (List<?>) body.get("availableTools");
        assertTrue("DevTools grant must surface the raw REST tool", tools.contains("es_rest"));

        ResponseEntity<?> create = controller.create(body(
                "name", "viewer-agent",
                "allowedTools", Arrays.asList("es_search")), req);
        assertEquals(403, create.getStatusCodeValue()); /* es_search 未在该连接授权 */
    }

    @Test
    public void operatorWithConnScopedPagesGetsCatalogButNotUngrantedTools() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        ResponseEntity<?> list = controller.list(request(principal("op", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:search")));
        assertEquals(200, list.getStatusCodeValue());
        List<?> tools = (List<?>) asMap(list).get("availableTools");
        assertTrue("connection-scoped search should be selectable", tools.contains("es_search"));
        assertFalse("write tools need a write grant", tools.contains("es_index_doc"));
    }

    @Test
    public void viewerCanIssueKeyScopedToOwnConnectionGrants() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"));
        MockHttpServletRequest req = request(principal("x1", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:w:devtools", "conn:qa:search",
                "conn:prod:devtools", "conn:prod:search"));
        Map<String, Object> scoped = body(
                "qa", Arrays.asList("read", "write"),
                "prod", Collections.singletonList("read"));
        ResponseEntity<?> response = controller.create(body(
                "name", "viewer-scoped",
                "connections", Arrays.asList("qa", "prod"),
                "connectionPermissions", scoped,
                "allowedTools", Arrays.asList("es_search", "es_rest", "es_index_doc"),
                "requestsPerMinute", 60,
                "dailyQuota", 1000,
                "monthlyQuota", 5000), req);
        assertEquals(201, response.getStatusCodeValue());
        Map<String, Object> key = (Map<String, Object>) asMap(response).get("key");
        assertEquals("VIEWER", key.get("role"));
        McpKeyRecord record = store.find(String.valueOf(key.get("id")));
        assertEquals("VIEWER", record.role);
        assertTrue(record.canWrite("qa"));
        assertFalse(record.canWrite("prod"));
        assertTrue(record.allowedTools.contains("es_index_doc"));
    }

    @Test
    public void viewerCannotWriteAConnectionWithNoWriteGrant() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"));
        MockHttpServletRequest req = request(principal("x1", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:prod:devtools"));
        ResponseEntity<?> response = controller.create(body(
                "name", "bad-write",
                "connections", Arrays.asList("prod"),
                "connectionPermissions", body("prod", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_search")), req);
        assertEquals(403, response.getStatusCodeValue());
    }

    @Test
    public void adminCanIssueOneKeyWithQaUatWriteAndProdReadOnly() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "uat", "prod"));
        Map<String, Object> scoped = body(
                "qa", Arrays.asList("read", "write"),
                "uat", Arrays.asList("read", "write"),
                "prod", Collections.singletonList("read"));
        ResponseEntity<?> response = controller.create(body(
                "name", "qa-uat-rw-prod-ro",
                "role", "ADMIN",
                "connections", Arrays.asList("qa", "uat", "prod"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", scoped,
                "allowedTools", Arrays.asList("es_search", "es_index_doc", "es_rest"),
                "requestsPerMinute", 60,
                "dailyQuota", 1000,
                "monthlyQuota", 5000), request(principal("root", ConsoleRole.ADMIN)));
        assertEquals(201, response.getStatusCodeValue());
        Map<String, Object> created = asMap(response);
        Map<String, Object> key = (Map<String, Object>) created.get("key");
        Map<String, List<String>> perms = (Map<String, List<String>>) key.get("connectionPermissions");
        assertTrue(perms.get("qa").contains("write"));
        assertTrue(perms.get("uat").contains("write"));
        assertFalse(perms.get("prod").contains("write"));
        McpKeyRecord record = store.find(String.valueOf(key.get("id")));
        assertTrue(record.canWrite("qa"));
        assertTrue(record.canWrite("uat"));
        assertFalse(record.canWrite("prod"));
        assertTrue(record.canRead("prod"));
        assertTrue(record.hasAnyWrite());
    }

    @Test
    public void operatorCanIssueAPersonalKeyButCannotEscalateOrUseUngrantedTools() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        MockHttpServletRequest req = request(principal("alice", ConsoleRole.OPERATOR,
                "devtools", "search", "overview"));

        Map<String, Object> created = asMap(controller.create(body(
                "name", "alice-agent",
                "allowedTools", Arrays.asList("es_search", "es_cluster_health"),
                "requestsPerMinute", 20,
                "dailyQuota", 100,
                "monthlyQuota", 1000), req));
        assertNotNull(created.get("secret"));
        Map<String, Object> key = (Map<String, Object>) created.get("key");
        assertEquals("alice", key.get("owner"));
        assertEquals("OPERATOR", key.get("role"));
        assertFalse(String.valueOf(key.get("prefix")).isEmpty());
        assertFalse(String.valueOf(created.get("secret")).equals(key.get("keyHash")));

        ResponseEntity<?> escalated = controller.create(body("name", "bad", "role", "ADMIN"), req);
        assertEquals(403, escalated.getStatusCodeValue());

        ResponseEntity<?> unGranted = controller.create(body(
                "name", "bad", "allowedTools", Arrays.asList("es_get_mapping")), req);
        assertEquals(403, unGranted.getStatusCodeValue());

        ResponseEntity<?> emptyTools = controller.create(body(
                "name", "none", "allowedTools", Collections.emptyList()), req);
        assertEquals(400, emptyTools.getStatusCodeValue());

        Map<String, Object> listed = asMap(controller.list(req));
        assertEquals(1, ((List<?>) listed.get("keys")).size());
        assertFalse(listed.get("canManageAll").equals(Boolean.TRUE));
    }

    @Test
    public void adminSeesAllKeysAndCanRevokeAnotherUsersKey() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        ConsolePrincipal alice = principal("alice", ConsoleRole.OPERATOR, "devtools", "search");
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);

        Map<String, Object> created = asMap(controller.create(body(
                "name", "alice-agent",
                "allowedTools", Arrays.asList("es_search")), request(alice)));
        String id = String.valueOf(((Map<?, ?>) created.get("key")).get("id"));

        Map<String, Object> listed = asMap(controller.list(request(admin)));
        assertTrue(Boolean.TRUE.equals(listed.get("canManageAll")));
        assertEquals(1, ((List<?>) listed.get("keys")).size());

        ResponseEntity<?> denied = controller.revoke(id, request(principal("bob", ConsoleRole.OPERATOR, "devtools")));
        assertEquals(403, denied.getStatusCodeValue());
        assertEquals(200, controller.revoke(id, request(admin)).getStatusCodeValue());
        assertFalse(((McpKeyRecord) store.find(id)).enabled);
    }

    @Test
    public void managementEndpointRoutesThroughHttp() throws Exception {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore());
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(get("/internal/es/index/mcp/keys")
                        .requestAttr(ConsoleAuthInterceptor.ATTR_PRINCIPAL,
                                principal("alice", ConsoleRole.OPERATOR, "devtools")))
                .andExpect(status().isOk());
    }

    @Test
    public void adminCanIssueAWriteKeyScopedToConnections() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);
        Map<String, Object> created = asMap(controller.create(body(
                "name", "writer",
                "permissions", Arrays.asList("read", "write"),
                "connections", Collections.singletonList("host"),
                "allowedTools", Arrays.asList("es_search", "es_index_doc")), request(admin)));
        Map<String, Object> key = (Map<String, Object>) created.get("key");
        assertEquals(Arrays.asList("read", "write"), key.get("permissions"));
        assertEquals(Collections.singletonList("host"), key.get("connections"));

        ResponseEntity<?> operatorWrite = controller.create(body(
                "name", "operator-write", "permissions", Arrays.asList("write")),
                request(principal("alice", ConsoleRole.OPERATOR, "devtools", "search")));
        assertEquals(403, operatorWrite.getStatusCodeValue());
    }

    @Test
    public void rotationInvalidatesOldSecretAndKeepsScopes() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        ConsolePrincipal alice = principal("alice", ConsoleRole.OPERATOR, "devtools", "search");
        Map<String, Object> created = asMap(controller.create(body(
                "name", "rotate-me", "allowedTools", Arrays.asList("es_search")), request(alice)));
        String oldSecret = String.valueOf(created.get("secret"));
        String id = String.valueOf(((Map<?, ?>) created.get("key")).get("id"));
        Map<String, Object> rotated = asMap(controller.rotate(id, request(alice)));
        String newSecret = String.valueOf(rotated.get("secret"));
        assertFalse(oldSecret.equals(newSecret));
        assertEquals("alice", ((Map<?, ?>) rotated.get("key")).get("owner"));
        assertNull(store.authenticate(oldSecret));
        assertNotNull(store.authenticate(newSecret));
    }

    @Test
    public void viewerWithoutDevtoolsGrantCannotIssueKeys() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore());
        ResponseEntity<?> response = controller.create(body("name", "viewer-agent"),
                request(principal("viewer", ConsoleRole.VIEWER, "overview")));
        assertEquals(403, response.getStatusCodeValue());
    }

    @Test
    public void keyAuthenticationScopesToolsAndEnforcesRateLimit() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpAccessService access = new McpAccessService(store);
        Map<String, Object> created = store.create("limited", "alice", "VIEWER",
                Arrays.asList("es_cluster_health"), Collections.singletonList("host"),
                Collections.singletonList("read"), 1, 100, 1000, null);
        String secret = String.valueOf(created.get("secret"));
        McpController controller = new McpController(new FakeAdmin(), "", access);

        Map<String, Object> listRequest = body("jsonrpc", "2.0", "id", 1, "method", "tools/list");
        Map<String, Object> listBody = (Map<String, Object>) controller.rpc("Bearer " + secret, listRequest).getBody();
        List<?> tools = (List<?>) ((Map<?, ?>) listBody.get("result")).get("tools");
        assertEquals(1, tools.size());
        assertEquals("es_cluster_health", ((Map<?, ?>) tools.get(0)).get("name"));

        Map<String, Object> call = body("jsonrpc", "2.0", "id", 2, "method", "tools/call",
                "params", body("name", "es_cluster_health", "arguments", Collections.emptyMap()));
        assertEquals(200, controller.rpc("Bearer " + secret, call).getStatusCodeValue());
        ResponseEntity<?> limited = controller.rpc("Bearer " + secret, call);
        assertEquals(429, limited.getStatusCodeValue());
        assertNotNull(limited.getHeaders().getFirst("Retry-After"));
        assertTrue(Long.parseLong(limited.getHeaders().getFirst("Retry-After")) > 0L);
        McpKeyRecord record = store.authenticate(secret);
        assertEquals(1L, record.requestCount);
        assertEquals(1L, record.toolCounts.get("es_cluster_health").longValue());
        assertEquals("es_cluster_health", record.lastTool);
    }

    @Test
    public void writeToolsRequireWritePermissionAndConnectionScopeIsHard() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpAccessService access = new McpAccessService(store);
        Map<String, Object> created = store.create("read-only", "alice", "VIEWER",
                Arrays.asList("es_search", "es_index_doc"), Collections.singletonList("host"),
                Collections.singletonList("read"), 60, 100, 1000, null);
        String secret = String.valueOf(created.get("secret"));
        McpController controller = new McpController(new FakeAdmin(), "", access);

        Map<String, Object> listBody = (Map<String, Object>) controller.rpc("Bearer " + secret,
                body("jsonrpc", "2.0", "id", 1, "method", "tools/list")).getBody();
        List<?> tools = (List<?>) ((Map<?, ?>) listBody.get("result")).get("tools");
        assertEquals(1, tools.size());
        assertEquals("es_search", ((Map<?, ?>) tools.get(0)).get("name"));

        Map<String, Object> denied = (Map<String, Object>) controller.rpc("Bearer " + secret,
                body("jsonrpc", "2.0", "id", 2, "method", "tools/call",
                        "params", body("name", "es_search",
                                "arguments", body("index", "i", "connection", "other")))).getBody();
        Map<?, ?> result = (Map<?, ?>) denied.get("result");
        assertEquals(true, result.get("isError"));
        assertTrue(((String) ((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"))
                .contains("Connection not allowed"));
    }

    @Test
    public void revokedAndExpiredKeysAreRejected() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpAccessService access = new McpAccessService(store);
        Map<String, Object> created = store.create("k", "alice", "VIEWER",
                Arrays.asList("es_cluster_health"), Collections.singletonList("host"),
                Collections.singletonList("read"), 60, 100, 1000, null);
        String secret = String.valueOf(created.get("secret"));
        McpKeyRecord record = store.authenticate(secret);
        record.expiresAt = System.currentTimeMillis() - 1000L;
        try {
            access.authenticate(secret);
            fail("expired key must be rejected");
        } catch (McpAccessException e) {
            assertEquals(401, e.getStatus());
            assertEquals("MCP_KEY_EXPIRED", e.getCode());
        }
        record.expiresAt = null;
        store.revoke(record.id);
        try {
            access.authenticate(secret);
            fail("revoked key must be rejected");
        } catch (McpAccessException e) {
            assertEquals("MCP_KEY_REVOKED", e.getCode());
        }
    }
}
