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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * MCP (Model Context Protocol) endpoint for the server-mode console.
 *
 * <p>Transport: JSON-RPC 2.0 over HTTP POST at {@code /mcp}; a GET on the same path
 * returns the server card and tool catalog for discovery. The endpoint is disabled
 * unless {@code esquerystudio.mcp.enabled=true}, and every request must carry
 * {@code Authorization: Bearer <esquerystudio.mcp.token>}.</p>
 *
 * <p>Tools are deliberately read-only by default. Mutating tools can be added later
 * behind the same token and an explicit configuration switch; an MCP client should
 * never be able to delete an index just because it can list one.</p>
 */
@RestController
@RequestMapping("/mcp")
@ConditionalOnProperty(prefix = "esquerystudio.mcp", name = "enabled", havingValue = "true")
public class McpController {

    private static final String PROTOCOL_VERSION = "2025-06-18";
    private static final String SERVER_NAME = "ESQueryStudio";
    /** 服务端与 UI 共用的工具名（顺序即 tools/list 顺序）；后三个是写工具。 */
    public static final List<String> TOOL_NAMES = Collections.unmodifiableList(Arrays.asList(
            "es_list_connections",
            "es_list_indices", "es_cluster_health", "es_get_mapping", "es_get_doc",
            "es_get_settings", "es_get_aliases", "es_list_templates", "es_list_nodes", "es_list_tasks",
            "es_search", "es_count", "es_sql", "es_explain_doc", "es_get_index_stats",
            "es_index_doc", "es_update_doc", "es_delete_doc", "es_rest"));
    public static final List<String> WRITE_TOOLS = Collections.unmodifiableList(Arrays.asList(
            "es_index_doc", "es_update_doc", "es_delete_doc"));

    private final EsIndexAdmin esIndexAdmin;
    private final String token;
    private final McpAccessService accessService;
    private final io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter clientRouter;
    private final ConnStore connStore;
    private boolean hostClusterVisible = true;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public McpController(EsIndexAdmin esIndexAdmin,
                         @Value("${esquerystudio.mcp.token:}") String token) {
        this(esIndexAdmin, token, null, null, null);
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService) {
        this(esIndexAdmin, token, accessService, null, null);
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter clientRouter) {
        this(esIndexAdmin, token, accessService, clientRouter, null);
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter clientRouter,
                         ConnStore connStore) {
        this.esIndexAdmin = esIndexAdmin;
        this.token = token == null ? "" : token.trim();
        this.accessService = accessService;
        this.clientRouter = clientRouter;
        this.connStore = connStore;
    }

    /** 与宿主的 host-cluster-visible 同口径；纯管理平台不把控制集群当数据面目标。 */
    public void setHostClusterVisible(boolean hostClusterVisible) {
        this.hostClusterVisible = hostClusterVisible;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> discover(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        try {
            AuthContext auth = authenticate(authorization);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("protocolVersion", PROTOCOL_VERSION);
            out.put("serverInfo", serverInfo());
            out.put("transport", "json-rpc-over-http");
            out.put("endpoint", "/mcp");
            out.put("auth", auth.key == null ? "service-token" : "api-key");
            if (auth.key != null) {
                out.put("connections", auth.key.connections == null || auth.key.connections.isEmpty()
                        ? Collections.singletonList("host") : auth.key.connections);
                out.put("permissions", auth.key.permissions == null || auth.key.permissions.isEmpty()
                        ? Collections.singletonList("read") : auth.key.permissions);
            }
            out.put("tools", tools(auth.allowedTools));
            return ResponseEntity.ok(out);
        } catch (McpAccessException e) {
            return deny(e, null);
        }
    }

    @PostMapping
    public ResponseEntity<?> rpc(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) Map<String, Object> request) {
        final AuthContext auth;
        try {
            auth = authenticate(authorization);
        } catch (McpAccessException e) {
            return deny(e, null);
        }
        if (request == null) return ResponseEntity.badRequest().body(error(null, -32600, "Invalid Request"));

        Object id = request.get("id");
        String method = String.valueOf(request.get("method") == null ? "" : request.get("method"));
        if (method.isEmpty()) return ResponseEntity.ok(error(id, -32600, "Invalid Request"));

        try {
            switch (method) {
                case "initialize":
                    return ResponseEntity.ok(result(id, initializeResult()));
                case "notifications/initialized":
                    return ResponseEntity.status(HttpStatus.ACCEPTED).build();
                case "ping":
                    return ResponseEntity.ok(result(id, Collections.<String, Object>emptyMap()));
                case "tools/list":
                    return ResponseEntity.ok(result(id,
                            Collections.<String, Object>singletonMap("tools", tools(auth.allowedTools))));
                case "tools/call":
                    /* MCP 语义：工具执行失败是 result.isError，不是 JSON-RPC error；
                       与纯前端 browserMcp 的返回形状保持一致，客户端才能统一渲染。 */
                    String toolName = toolName(request.get("params"));
                    /* 静态服务 token 保留「未知工具」原语义；只有受限 key 才提前给 not-allowed。 */
                    if (auth.key != null && !auth.allowedTools.contains(toolName)) {
                        return ResponseEntity.ok(result(id, toolError("Tool not allowed for this key: " + toolName)));
                    }
                    try {
                        if (auth.key != null) accessService.consume(auth.key);
                    } catch (McpAccessException e) {
                        return deny(e, id);
                    }
                    String target = "host";
                    boolean targetAware = !"es_list_connections".equals(toolName);
                    if (targetAware) {
                        try {
                            target = resolveTarget(auth, request.get("params"));
                            enforceTargetPermission(auth, target, toolName, request.get("params"));
                        } catch (IllegalArgumentException e) {
                            return ResponseEntity.ok(result(id, toolError(e.getMessage())));
                        }
                    }
                    io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter.TargetScope scope = null;
                    if (targetAware && clientRouter != null) scope = clientRouter.openScope(target);
                    try {
                        return ResponseEntity.ok(result(id, callTool(request.get("params"), auth)));
                    } catch (Exception e) {
                        if (auth.key != null) accessService.recordError(auth.key);
                        return ResponseEntity.ok(result(id, toolError(String.valueOf(e.getMessage()))));
                    } finally {
                        if (scope != null) scope.close();
                    }
                default:
                    return ResponseEntity.ok(error(id, -32601, "Method not found: " + method));
            }
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(error(id, -32602, e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.ok(error(id, -32603, String.valueOf(e.getMessage())));
        }
    }

    private static final class AuthContext {
        private final McpKeyRecord key;
        private final List<String> allowedTools;

        private AuthContext(McpKeyRecord key, List<String> allowedTools) {
            this.key = key;
            this.allowedTools = allowedTools == null ? Collections.<String>emptyList()
                    : Collections.unmodifiableList(new ArrayList<>(allowedTools));
        }
    }

    private AuthContext authenticate(String authorization) {
        if (authorization == null || authorization.trim().isEmpty()) {
            if (token.isEmpty() && accessService == null) {
                throw new McpAccessException(503, "MCP_TOKEN_NOT_CONFIGURED",
                        "MCP is enabled but neither esquerystudio.mcp.token nor an API key store is configured");
            }
            throw new McpAccessException(401, "MCP_UNAUTHORIZED", "Missing MCP bearer token");
        }
        if (!token.isEmpty() && tokenMatches(authorization)) {
            return new AuthContext(null, TOOL_NAMES);
        }
        String raw = authorization.startsWith("Bearer ") ? authorization.substring(7).trim() : "";
        /* 不按用户可控的 key 前缀决定是否进入认证；任何非静态 token 都交给 key store
           校验，由 store 做哈希查找并返回统一的 401。 */
        if (accessService != null) {
            try {
                McpKeyRecord key = accessService.authenticate(raw);
                List<String> allowed = new ArrayList<>();
                /* 工具目录按「任意连接」汇总；真正执行时按目标连接的有效权限再判一次。 */
                boolean anyRead = key.hasAnyRead();
                boolean anyWrite = key.hasAnyWrite();
                for (String tool : TOOL_NAMES) {
                    if (key.allowedTools != null && key.allowedTools.contains(tool)
                            && (WRITE_TOOLS.contains(tool) ? anyWrite : anyRead)) {
                        allowed.add(tool);
                    }
                }
                return new AuthContext(key, allowed);
            } catch (McpAccessException e) {
                if (token.isEmpty()) throw e;
                throw new McpAccessException(401, "MCP_UNAUTHORIZED", "Missing or invalid MCP bearer token");
            }
        }
        if (token.isEmpty()) {
            throw new McpAccessException(503, "MCP_TOKEN_NOT_CONFIGURED",
                    "MCP is enabled but esquerystudio.mcp.token is not configured");
        }
        throw new McpAccessException(401, "MCP_UNAUTHORIZED", "Missing or invalid MCP bearer token");
    }

    private ResponseEntity<Map<String, Object>> deny(McpAccessException e, Object id) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("code", -32000);
        err.put("message", e.getMessage());
        err.put("data", e.getCode());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jsonrpc", "2.0");
        body.put("id", id);
        body.put("error", err);
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(e.getStatus());
        if (e.getRetryAfterSeconds() > 0) builder.header("Retry-After", String.valueOf(e.getRetryAfterSeconds()));
        return builder.body(body);
    }

    private String toolName(Object paramsValue) {
        if (!(paramsValue instanceof Map)) return "";
        Object name = ((Map<?, ?>) paramsValue).get("name");
        return name == null ? "" : String.valueOf(name);
    }

    /** 解析本次工具调用的连接目标；key 的连接集合是硬边界，不能靠参数越界。 */
    private String resolveTarget(AuthContext auth, Object paramsValue) {
        String requested = "";
        if (paramsValue instanceof Map) {
            Object arguments = ((Map<?, ?>) paramsValue).get("arguments");
            if (arguments instanceof Map) {
                Object value = ((Map<?, ?>) arguments).get("connection");
                if (value != null) requested = String.valueOf(value).trim();
            }
        }
        List<String> allowed = null;
        if (auth.key != null) {
            allowed = auth.key.connections == null || auth.key.connections.isEmpty()
                    ? Collections.singletonList("host") : auth.key.connections;
            if (requested.isEmpty()) return allowed.get(0);
            if (!allowed.contains(requested)) {
                throw new IllegalArgumentException("Connection not allowed for this key: " + requested);
            }
        }
        if (requested.isEmpty()) return "host";
        if ("host".equalsIgnoreCase(requested) && !hostClusterVisible) {
            throw new IllegalArgumentException("Host cluster is disabled in this deployment; choose a connection");
        }
        if (!"host".equalsIgnoreCase(requested)) {
            if (clientRouter == null) {
                throw new IllegalArgumentException("Connection routing is not available in this deployment");
            }
            if (connStore != null) {
                RemoteClusterConn conn = connStore.get(requested);
                if (conn == null) throw new IllegalArgumentException("Connection not found: " + requested);
                if (auth.key != null) {
                    ConsoleRole keyRole = ConsoleRole.parse(auth.key.role);
                    ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
                    if (!keyRole.atLeast(required)) {
                        throw new IllegalArgumentException("Key role " + keyRole.name()
                                + " is below connection minRole " + required.name() + ": " + requested);
                    }
                }
            }
        }
        return requested;
    }

    /**
     * 连接级权限闸：同一个 key 可以「QA/UAT 可写、生产只读」。
     * 工具清单只证明 key 拥有某种能力，真正落到哪个连接由这里判定。
     */
    private void enforceTargetPermission(AuthContext auth, String target, String toolName, Object paramsValue) {
        if (auth.key == null) return;
        Map<?, ?> args = Collections.emptyMap();
        if (paramsValue instanceof Map) {
            Object raw = ((Map<?, ?>) paramsValue).get("arguments");
            if (raw instanceof Map) args = (Map<?, ?>) raw;
        }
        boolean write = requiresWrite(toolName, args);
        List<String> permissions = auth.key.permissionsFor(target);
        if (write && !permissions.contains("write")) {
            throw new IllegalArgumentException("Connection " + target
                    + " is read-only for this key; write is not allowed");
        }
        if (!write && !permissions.contains("read")) {
            throw new IllegalArgumentException("Connection " + target
                    + " has no read permission for this key");
        }
    }

    private boolean requiresWrite(String toolName, Map<?, ?> args) {
        if (WRITE_TOOLS.contains(toolName)) return true;
        if ("es_rest".equals(toolName)) {
            String method = args.get("method") == null ? "" : String.valueOf(args.get("method"));
            String path = args.get("path") == null ? "" : String.valueOf(args.get("path"));
            return !McpRestClassifier.isReadOnly(method, path);
        }
        return false;
    }

    /** 服务级 token 即部署级管理员；API key 以签发时角色快照判定。 */
    private boolean isAdmin(AuthContext auth) {
        return auth.key == null || "ADMIN".equalsIgnoreCase(auth.key.role);
    }

    /** 定长时间比较，避免 token 逐字符比较的时序侧信道。 */
    private boolean tokenMatches(String authorization) {
        if (authorization == null) return false;
        byte[] expected = ("Bearer " + token).getBytes(StandardCharsets.UTF_8);
        byte[] actual = authorization.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, actual);
    }

    private Map<String, Object> initializeResult() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("protocolVersion", PROTOCOL_VERSION);
        result.put("capabilities", Collections.<String, Object>singletonMap("tools",
                Collections.<String, Object>singletonMap("listChanged", false)));
        result.put("serverInfo", serverInfo());
        return result;
    }

    private Map<String, Object> serverInfo() {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("name", SERVER_NAME);
        info.put("version", "1.0.11");
        info.put("mode", "server");
        return info;
    }

    private Map<String, Object> callTool(Object paramsValue, AuthContext auth) throws IOException {
        if (!(paramsValue instanceof Map)) throw new IllegalArgumentException("params must be an object");
        Map<?, ?> params = (Map<?, ?>) paramsValue;
        String name = String.valueOf(params.get("name") == null ? "" : params.get("name"));
        Object argsValue = params.get("arguments");
        Map<?, ?> args = argsValue instanceof Map ? (Map<?, ?>) argsValue : Collections.emptyMap();
        Object data;
        switch (name) {
            case "es_list_connections":
                data = listConnections(auth);
                break;
            case "es_list_indices":
                data = esIndexAdmin.listClusterIndices();
                break;
            case "es_cluster_health":
                data = esIndexAdmin.clusterHealth();
                break;
            case "es_get_mapping":
                data = esIndexAdmin.getMappingDetail(requiredString(args, "index"));
                break;
            case "es_get_doc":
                data = esIndexAdmin.getDoc(requiredString(args, "index"), requiredString(args, "id"));
                break;
            case "es_get_settings":
                data = esIndexAdmin.rawGuarded("GET", "/" + encodeIndex(args) + "/_settings", "");
                break;
            case "es_get_aliases":
                data = esIndexAdmin.rawGuarded("GET", "/_cat/aliases?format=json", "");
                break;
            case "es_list_templates":
                data = esIndexAdmin.listTemplates();
                break;
            case "es_list_nodes":
                if (isAdmin(auth)) {
                    /* ADMIN key 与浏览器/本地 Node 形态同形：原始 _cat/nodes 行。 */
                    data = esIndexAdmin.raw("GET", "/_cat/nodes?format=json", "");
                } else {
                    /* 非 ADMIN 不给 host/节点拓扑，只给指标行（与拓扑页脱敏同口径）。 */
                    java.util.List<Map<String, Object>> nodes = esIndexAdmin.nodesStatsBrief();
                    for (Map<String, Object> node : nodes) node.remove("host");
                    data = nodes;
                }
                break;
            case "es_list_tasks":
                data = esIndexAdmin.listTasks(optionalString(args, "actions"), true);
                break;
            case "es_get_index_stats":
                if (isAdmin(auth)) {
                    data = esIndexAdmin.raw("GET", "/" + encodeIndex(args) + "/_stats", "");
                } else {
                    data = esIndexAdmin.indexStatsSummary(requiredString(args, "index"));
                }
                break;
            case "es_search":
                data = esIndexAdmin.searchDsl(
                        requiredString(args, "index"),
                        searchBody(args),
                        Boolean.TRUE.equals(args.get("explain")),
                        Boolean.TRUE.equals(args.get("profile")));
                break;
            case "es_count":
                data = esIndexAdmin.count(requiredString(args, "index"), countBody(args));
                break;
            case "es_sql":
                data = esIndexAdmin.sqlQuery(sqlBody(args));
                break;
            case "es_explain_doc":
                data = esIndexAdmin.explainDoc(
                        requiredString(args, "index"),
                        requiredString(args, "id"),
                        explainBody(args));
                break;
            case "es_index_doc":
                data = esIndexAdmin.putDoc(
                        requiredString(args, "index"),
                        requiredString(args, "id"),
                        documentJson(args.get("document"), "document"),
                        "true");
                break;
            case "es_update_doc":
                data = esIndexAdmin.updatePartial(
                        requiredString(args, "index"),
                        requiredString(args, "id"),
                        documentJson(args.get("document"), "document"));
                break;
            case "es_delete_doc":
                data = esIndexAdmin.deleteById(
                        requiredString(args, "index"),
                        requiredString(args, "id"));
                break;
            case "es_rest":
                /* ADMIN key 与 ADMIN 登录同权（raw 逃生通道）；非 ADMIN 仍走控制面守卫。
                   连接级读写已在 resolveTarget 后按目标连接判定，不会因 raw 放开越界到只读生产。 */
                String restMethod = requiredString(args, "method");
                String restPath = requiredString(args, "path");
                String restBody = bodyText(args.get("body"));
                data = isAdmin(auth)
                        ? esIndexAdmin.raw(restMethod, restPath, restBody)
                        : esIndexAdmin.rawGuarded(restMethod, restPath, restBody);
                break;
            default:
                throw new IllegalArgumentException("Unknown tool: " + name);
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "text");
        content.put("text", objectMapper.writeValueAsString(data));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", Collections.singletonList(content));
        result.put("isError", false);
        return result;
    }

    private String searchBody(Map<?, ?> args) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        Object size = args.get("size");
        body.put("size", size instanceof Number
                ? Math.max(1, Math.min(100, ((Number) size).intValue())) : 10);
        Object clause = queryClause(args.get("query"));
        body.put("query", clause == null
                ? Collections.<String, Object>singletonMap("match_all", Collections.emptyMap()) : clause);
        return objectMapper.writeValueAsString(body);
    }

    private String sqlBody(Map<?, ?> args) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("query", requiredString(args, "query"));
        Object fetchSize = args.get("fetchSize");
        if (fetchSize instanceof Number) body.put("fetch_size", Math.max(1, Math.min(5000, ((Number) fetchSize).intValue())));
        return objectMapper.writeValueAsString(body);
    }

    /**
     * 接受查询子句对象，或 JSON 字符串（可以是子句本身，也可以是完整的
     * {@code {"query": ...}} 搜索体）。统一返回子句，供 _search / _explain 包装。
     */
    private Object queryClause(Object raw) throws IOException {
        if (raw == null) return null;
        Object parsed = raw;
        if (raw instanceof String) {
            String text = ((String) raw).trim();
            if (text.isEmpty()) return null;
            parsed = objectMapper.readValue(text, Object.class);
        }
        if (!(parsed instanceof Map)) throw new IllegalArgumentException("query must be an object or a JSON object string");
        Map<?, ?> map = (Map<?, ?>) parsed;
        return map.containsKey("query") ? map.get("query") : map;
    }

    private List<Map<String, Object>> listConnections(AuthContext auth) {
        List<String> allowed = auth.key == null ? null
                : (auth.key.connections == null || auth.key.connections.isEmpty()
                ? Collections.singletonList("host") : auth.key.connections);
        List<Map<String, Object>> out = new ArrayList<>();
        if (hostClusterVisible && (allowed == null || allowed.contains("host"))) {
            Map<String, Object> host = new LinkedHashMap<>();
            host.put("id", "host");
            host.put("name", "Host / control cluster");
            host.put("active", true);
            out.add(host);
        }
        if (connStore != null) {
            for (Map<String, Object> conn : connStore.list()) {
                String id = String.valueOf(conn.get("id"));
                if (allowed != null && !allowed.contains(id)) continue;
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", id);
                item.put("name", conn.get("name"));
                item.put("env", conn.get("env"));
                item.put("minRole", conn.get("minRole"));
                item.put("active", false);
                out.add(item);
            }
        }
        return out;
    }

    private String countBody(Map<?, ?> args) throws IOException {
        Object clause = queryClause(args.get("query"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("query", clause == null
                ? Collections.<String, Object>singletonMap("match_all", Collections.emptyMap()) : clause);
        return objectMapper.writeValueAsString(body);
    }

    private String bodyText(Object raw) throws IOException {
        if (raw == null) return "";
        if (raw instanceof String) return (String) raw;
        return objectMapper.writeValueAsString(raw);
    }

    private String documentJson(Object raw, String key) throws IOException {
        if (raw == null) throw new IllegalArgumentException("Missing required argument: " + key);
        Object parsed = raw instanceof String ? objectMapper.readValue((String) raw, Object.class) : raw;
        if (!(parsed instanceof Map)) throw new IllegalArgumentException(key + " must be an object or a JSON object string");
        return objectMapper.writeValueAsString(parsed);
    }

    private String explainBody(Map<?, ?> args) throws IOException {
        Object clause = queryClause(args.get("query"));
        if (clause == null) clause = Collections.singletonMap("match_all", Collections.emptyMap());
        return objectMapper.writeValueAsString(Collections.singletonMap("query", clause));
    }

    private String encodeIndex(Map<?, ?> args) {
        try {
            return java.net.URLEncoder.encode(requiredString(args, "index"), "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String optionalString(Map<?, ?> args, String key) {
        Object value = args.get(key);
        return value == null ? null : String.valueOf(value).trim();
    }

    private String requiredString(Map<?, ?> args, String key) {
        Object value = args.get(key);
        if (value == null || String.valueOf(value).trim().isEmpty()) {
            throw new IllegalArgumentException("Missing required argument: " + key);
        }
        return String.valueOf(value).trim();
    }

    private Map<String, Object> toolError(String message) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "text");
        content.put("text", message == null || message.isEmpty() ? "Tool execution failed" : message);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", Collections.singletonList(content));
        result.put("isError", true);
        return result;
    }

    private Map<String, Object> result(Object id, Object result) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jsonrpc", "2.0");
        out.put("id", id);
        out.put("result", result);
        return out;
    }

    private Map<String, Object> error(Object id, int code, String message) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("code", code);
        err.put("message", message);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jsonrpc", "2.0");
        out.put("id", id);
        out.put("error", err);
        return out;
    }

    private List<Map<String, Object>> tools(List<String> allowed) {
        List<Map<String, Object>> tools = new ArrayList<>();
        tools.add(tool("es_list_connections", "List connections this MCP client may target.",
                objectSchema(new LinkedHashMap<String, Object>())));
        tools.add(tool("es_list_indices", "List non-system Elasticsearch indices.",
                objectSchema(new LinkedHashMap<String, Object>())));
        tools.add(tool("es_cluster_health", "Return cluster health, version and shard counts.",
                objectSchema(new LinkedHashMap<String, Object>())));
        tools.add(tool("es_get_mapping", "Return the live mapping, field tree and field types for an index.",
                objectSchema(props("index", string("string", "Index or alias name.")), "index")));
        tools.add(tool("es_get_doc", "Get one document by id.",
                objectSchema(props(
                        "index", string("string", "Index or alias name."),
                        "id", string("string", "Document id.")), "index", "id")));
        tools.add(tool("es_get_settings", "Return index settings.",
                objectSchema(props("index", string("string", "Index or alias name.")), "index")));
        tools.add(tool("es_get_aliases", "List aliases and their indices.",
                objectSchema(new LinkedHashMap<String, Object>())));
        tools.add(tool("es_list_templates", "List index templates, with legacy-template normalization.",
                objectSchema(new LinkedHashMap<String, Object>())));
        tools.add(tool("es_list_nodes", "List cluster nodes and their roles/health.",
                objectSchema(new LinkedHashMap<String, Object>())));
        tools.add(tool("es_list_tasks", "List running cluster tasks.",
                objectSchema(props("actions", string("string", "Optional task action filter.")))));
        tools.add(tool("es_search", "Run an Elasticsearch DSL search and return the raw response.",
                objectSchema(props(
                        "index", string("string", "Index or alias name."),
                        "query", string("object", "Elasticsearch query object, or a JSON string."),
                        "size", string("integer", "Number of hits, 1-100."),
                        "explain", string("boolean", "Include _explanation in hits."),
                        "profile", string("boolean", "Include the profile tree.")), "index")));
        tools.add(tool("es_count", "Count documents matching a query.",
                objectSchema(props(
                        "index", string("string", "Index or alias name."),
                        "query", string("object", "Query object, or a JSON string.")), "index")));
        tools.add(tool("es_sql", "Run an Elasticsearch SQL query and return columns, rows and cursor.",
                objectSchema(props(
                        "query", string("string", "SQL text."),
                        "fetchSize", string("integer", "Fetch size, 1-5000.")), "query")));
        tools.add(tool("es_explain_doc", "Explain one document against a query using _explain.",
                objectSchema(props(
                        "index", string("string", "Index or alias name."),
                        "id", string("string", "Document id."),
                        "query", string("object", "Query object, or a JSON string.")), "index", "id")));
        tools.add(tool("es_get_index_stats", "Return index stats.",
                objectSchema(props("index", string("string", "Index or alias name.")), "index")));
        tools.add(tool("es_index_doc", "Create or overwrite a document by id.",
                objectSchema(props(
                        "index", string("string", "Index or alias name."),
                        "id", string("string", "Document id."),
                        "document", string("object", "Document body object, or a JSON object string.")), "index", "id", "document")));
        tools.add(tool("es_update_doc", "Partially update fields of a document by id.",
                objectSchema(props(
                        "index", string("string", "Index or alias name."),
                        "id", string("string", "Document id."),
                        "document", string("object", "Partial document object, or a JSON object string.")), "index", "id", "document")));
        tools.add(tool("es_delete_doc", "Delete a document by id.",
                objectSchema(props(
                        "index", string("string", "Index or alias name."),
                        "id", string("string", "Document id.")), "index", "id")));
        tools.add(tool("es_rest", "Run a raw Elasticsearch REST request; write methods require write permission.",
                objectSchema(props(
                        "method", string("string", "GET, HEAD, POST, PUT or DELETE."),
                        "path", string("string", "REST path starting with /."),
                        "body", string("object", "Optional JSON body object or string.")), "method", "path")));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> definition : tools) {
            if (allowed != null && allowed.contains(String.valueOf(definition.get("name")))) out.add(definition);
        }
        return out;
    }

    private Map<String, Object> tool(String name, String description, Map<String, Object> inputSchema) {
        Map<String, Object> tool = new LinkedHashMap<>();
        tool.put("name", name);
        tool.put("description", description);
        tool.put("inputSchema", inputSchema);
        return tool;
    }

    private Map<String, Object> objectSchema(Map<String, Object> properties, String... required) {
        Map<String, Object> schema = new LinkedHashMap<>();
        /* 服务端 key 可被授权多个连接；客户端用这个可选参数选择目标。浏览器模式
           没有服务端 key/连接集合，忽略该参数并使用当前连接档案。 */
        properties.put("connection", string("string",
                "Connection id; optional. Use host for the control cluster, or an id returned by discovery."));
        schema.put("type", "object");
        schema.put("properties", properties);
        if (required.length > 0) schema.put("required", Arrays.asList(required));
        return schema;
    }

    private Map<String, Object> props(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return out;
    }

    private Map<String, Object> string(String type, String description) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", type);
        out.put("description", description);
        return out;
    }
}
