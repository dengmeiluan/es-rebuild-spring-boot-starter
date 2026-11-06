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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class McpControllerTest {

    private static class FakeAdmin extends EsIndexAdmin {
        String lastSearchBody;
        String lastExplainBody;
        String lastRaw;
        int indexStatsSummaryCalls;

        FakeAdmin() { super(null); }

        @Override
        public Map<String, Object> raw(String method, String path, String body) {
            lastRaw = method + " " + path;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("path", path);
            return out;
        }

        @Override
        public List<Map<String, Object>> nodesStatsBrief() {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("nodeId", "n1");
            node.put("name", "node-1");
            node.put("host", "10.0.0.1");
            node.put("heapPct", 42);
            return Collections.singletonList(node);
        }

        @Override
        public Map<String, Object> indexStatsSummary(String index) {
            indexStatsSummaryCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("trimmed", Boolean.TRUE);
            return out;
        }

        @Override
        public Map<String, Object> putDoc(String index, String id, String body, String refresh) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("id", id);
            out.put("body", body);
            return out;
        }

        @Override
        public List<Map<String, Object>> listClusterIndices() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("index", "research_report");
            return Collections.singletonList(row);
        }

        @Override
        public Map<String, Object> clusterHealth() {
            return Collections.<String, Object>singletonMap("status", "green");
        }

        @Override
        public Map<String, Object> searchDsl(String index, String bodyJson, boolean explain, boolean profile) {
            lastSearchBody = bodyJson;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("explain", explain);
            out.put("profile", profile);
            return out;
        }

        @Override
        public Map<String, Object> explainDoc(String index, String id, String body) {
            lastExplainBody = body;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("id", id);
            return out;
        }
    }

    private McpController controller() {
        return new McpController(new FakeAdmin(), "secret");
    }

    @Test
    public void httpMappingRoutesJsonRpcThroughMockMvc() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller()).build();
        ObjectMapper mapper = new ObjectMapper();
        MvcResult ok = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":11,\"method\":\"initialize\"}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = mapper.readTree(ok.getResponse().getContentAsString());
        assertEquals("2025-06-18", body.path("result").path("protocolVersion").asText());
        assertEquals(11, body.path("id").asInt());
        MvcResult denied = mvc.perform(post("/mcp").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":12,\"method\":\"ping\"}"))
                .andExpect(status().isUnauthorized())
                .andReturn();
        assertEquals(401, denied.getResponse().getStatus());
    }

    @Test
    public void discoveryRequiresBearerTokenAndListsReadOnlyTools() {
        McpController c = controller();
        assertEquals(401, c.discover(null).getStatusCodeValue());
        ResponseEntity<Map<String, Object>> ok = c.discover("Bearer secret");
        assertEquals(200, ok.getStatusCodeValue());
        List<?> tools = (List<?>) ok.getBody().get("tools");
        assertTrue(tools.size() >= 5);
    }

    @Test
    public void jsonRpcInitializeAndToolsListKeepIds() {
        McpController c = controller();
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 7);
        req.put("method", "initialize");
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertEquals("2.0", body.get("jsonrpc"));
        assertEquals(7, body.get("id"));
        assertNotNull(body.get("result"));

        req.put("method", "tools/list");
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertEquals(7, body.get("id"));
        assertTrue(((List<?>) ((Map<?, ?>) body.get("result")).get("tools")).size() >= 5);
    }

    @Test
    public void searchAndExplainAcceptAQueryObjectOrAFullBodyString() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");

        Map<String, Object> searchArgs = new LinkedHashMap<>();
        searchArgs.put("index", "research_report");
        searchArgs.put("query", "{\"query\":{\"term\":{\"status\":\"published\"}},\"size\":99}");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_search");
        params.put("arguments", searchArgs);
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 1);
        req.put("method", "tools/call");
        req.put("params", params);
        c.rpc("Bearer secret", req);

        JsonNode searchBody = new ObjectMapper().readTree(admin.lastSearchBody);
        assertEquals("published", searchBody.path("query").path("term").path("status").asText());
        assertEquals("schema default size is 10", 10, searchBody.path("size").asInt());

        Map<String, Object> explainArgs = new LinkedHashMap<>();
        explainArgs.put("index", "research_report");
        explainArgs.put("id", "doc-1");
        explainArgs.put("query", "{\"query\":{\"term\":{\"status\":\"published\"}}}");
        params.put("name", "es_explain_doc");
        params.put("arguments", explainArgs);
        req.put("id", 2);
        c.rpc("Bearer secret", req);

        JsonNode explainBody = new ObjectMapper().readTree(admin.lastExplainBody);
        assertEquals("published", explainBody.path("query").path("term").path("status").asText());
    }

    @Test
    public void toolFailureIsAnMcpResultNotAProtocolError() {
        McpController c = controller();
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_unknown_tool");
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "bad-tool");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertNull(body.get("error"));
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        assertEquals(true, result.get("isError"));
        assertTrue(((String) ((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text")).contains("Unknown tool"));
    }

    @Test
    public void toolCallReturnsTextContentAndIsReadOnly() {
        McpController c = controller();
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_list_indices");
        params.put("arguments", Collections.emptyMap());
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "call-1");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        assertEquals(false, result.get("isError"));
        assertTrue(((String) ((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text")).contains("research_report"));
    }

    @Test
    public void nodesAndIndexStatsToolsUseUnguardedRawForAdminAndTrimmedViewForViewer() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController adminController = new McpController(admin, "secret");
        callTool(adminController, "Bearer secret", "es_list_nodes", Collections.emptyMap());
        assertTrue(admin.lastRaw.endsWith(" /_cat/nodes?format=json"));
        callTool(adminController, "Bearer secret", "es_get_index_stats",
                Collections.<String, Object>singletonMap("index", "research_report"));
        assertTrue(admin.lastRaw.endsWith(" /research_report/_stats"));
        assertEquals(0, admin.indexStatsSummaryCalls);

        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String viewerSecret = (String) store.create("viewer", "alice", "VIEWER",
                Arrays.asList("es_list_nodes", "es_get_index_stats"),
                Collections.singletonList("host"), Collections.singletonList("read"),
                60, 100, 100, null).get("secret");
        McpController viewerController = new McpController(admin, "", new McpAccessService(store));
        JsonNode nodes = callTool(viewerController, "Bearer " + viewerSecret, "es_list_nodes",
                Collections.emptyMap());
        assertTrue(nodes.isArray());
        assertFalse(nodes.get(0).has("host"));

        JsonNode stats = callTool(viewerController, "Bearer " + viewerSecret, "es_get_index_stats",
                Collections.<String, Object>singletonMap("index", "research_report"));
        assertEquals(1, admin.indexStatsSummaryCalls);
        assertTrue(stats.path("trimmed").asBoolean());
    }

    @Test
    public void perConnectionPermissionsAllowQaWriteWhileProdStaysReadOnly() throws Exception {
        McpKeyRecord record = new McpKeyRecord();
        record.permissions = Collections.singletonList("read");
        record.connectionPermissions.put("qa", Arrays.asList("read", "write"));
        record.connectionPermissions.put("prod", Collections.singletonList("read"));
        assertTrue(record.canWrite("qa"));
        assertTrue(record.canRead("qa"));
        assertFalse(record.canWrite("prod"));
        assertTrue(record.canRead("prod"));
        assertTrue(record.hasAnyWrite());

        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("host", Collections.singletonList("read"));
        String secret = (String) store.create("raw-read", "alice", "VIEWER",
                Collections.singletonList("es_rest"), Collections.singletonList("host"),
                Collections.singletonList("read"), scoped, 60, 100, 100, null).get("secret");
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));

        JsonNode read = callTool(controller, "Bearer " + secret, "es_rest",
                args("method", "GET", "path", "/research_report/_count"));
        assertEquals("/research_report/_count", read.path("path").asText());

        String write = callToolRaw(controller, "Bearer " + secret, "es_rest",
                args("method", "PUT", "path", "/probe/_doc/1", "body", Collections.singletonMap("a", 1)));
        assertTrue(write.contains("read-only"));

        Map<String, List<String>> rw = new LinkedHashMap<>();
        rw.put("host", Arrays.asList("read", "write"));
        String adminSecret = (String) store.create("admin-raw", "root", "ADMIN",
                Collections.singletonList("es_rest"), Collections.singletonList("host"),
                Collections.singletonList("read"), rw, 60, 100, 100, null).get("secret");
        McpController adminController = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        JsonNode allowedWrite = callTool(adminController, "Bearer " + adminSecret, "es_rest",
                args("method", "PUT", "path", "/probe/_doc/1", "body", Collections.singletonMap("a", 1)));
        assertEquals("/probe/_doc/1", allowedWrite.path("path").asText());
    }

    private static String callToolRaw(McpController controller, String auth, String name,
                                      Map<String, Object> arguments) throws Exception {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", name);
        params.put("arguments", arguments);
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "call");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc(auth, req).getBody();
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        return String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return out;
    }

    private static JsonNode callTool(McpController controller, String auth, String name,
                                     Map<String, Object> arguments) throws Exception {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", name);
        params.put("arguments", arguments);
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "call");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc(auth, req).getBody();
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        assertNotNull(result);
        assertEquals(false, result.get("isError"));
        String text = String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
        return new ObjectMapper().readTree(text);
    }
}
