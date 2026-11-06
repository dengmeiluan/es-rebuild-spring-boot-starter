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
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * MCP API key 管理面（服务端模式）。
 *
 * <p>权限模型：
 * <ul>
 *   <li>VIEWER 只能查看自己的 key（GET），不能签发；</li>
 *   <li>OPERATOR 及以上可为本人签发低配额 key；</li>
 *   <li>ADMIN 可代任意用户签发、查看全部、撤销任意 key；</li>
 *   <li>非 ADMIN 的可用工具受本人页面授权收窄（search / mapping / score-explain 等）。</li>
 * </ul>
 * 路由挂在 {@code /internal/es/index/**} 下，登录态、角色门、审计与环境封顶沿用控制台既有拦截器；
 * 本类只补充业务级的所有权与页面校验，不另造一套认证。</p>
 */
@RestController
@RequestMapping("/internal/es/index/mcp/keys")
public class McpKeyController {

    private static final Map<String, String> TOOL_PAGE = new LinkedHashMap<>();

    static {
        TOOL_PAGE.put("es_list_connections", "overview");
        TOOL_PAGE.put("es_list_indices", "indices");
        TOOL_PAGE.put("es_cluster_health", "overview");
        TOOL_PAGE.put("es_get_mapping", "mapping");
        TOOL_PAGE.put("es_get_doc", "browser");
        TOOL_PAGE.put("es_get_settings", "mapping");
        TOOL_PAGE.put("es_get_aliases", "aliases");
        TOOL_PAGE.put("es_list_templates", "templates");
        TOOL_PAGE.put("es_list_nodes", "topology");
        TOOL_PAGE.put("es_list_tasks", "tasks");
        TOOL_PAGE.put("es_get_index_stats", "indices");
        TOOL_PAGE.put("es_search", "search");
        TOOL_PAGE.put("es_count", "search");
        TOOL_PAGE.put("es_sql", "search");
        TOOL_PAGE.put("es_explain_doc", "score-explain");
        TOOL_PAGE.put("es_index_doc", "browser");
        TOOL_PAGE.put("es_update_doc", "browser");
        TOOL_PAGE.put("es_delete_doc", "browser");
        TOOL_PAGE.put("es_rest", "devtools");
    }

    private final McpKeyStore store;
    private final ConnStore connStore;
    private boolean hostClusterVisible = true;

    public McpKeyController(McpKeyStore store) {
        this(store, null);
    }

    public McpKeyController(McpKeyStore store, ConnStore connStore) {
        this.store = store;
        this.connStore = connStore;
    }

    public void setHostClusterVisible(boolean hostClusterVisible) {
        this.hostClusterVisible = hostClusterVisible;
    }

    @GetMapping
    public ResponseEntity<?> list(HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;

        boolean admin = isAdmin(principal);
        List<Map<String, Object>> keys = new ArrayList<>();
        for (Map<String, Object> key : store.list()) {
            if (admin || principal.getUsername().equals(key.get("owner"))) keys.add(enrichConnectionNames(key));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("keys", keys);
        out.put("canManageAll", admin);
        out.put("caller", caller(principal));
        out.put("limits", limits(principal));
        out.put("availableTools", availableTools(principal));
        out.put("availableConnections", availableConnections(principal));
        return ResponseEntity.ok(out);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody(required = false) Map<String, Object> body,
                                    HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;
        if (body == null) return error(400, "BAD_REQUEST", "缺少请求体");

        boolean admin = isAdmin(principal);
        String name = text(body.get("name"));
        if (name.isEmpty()) return error(400, "BAD_REQUEST", "密钥名称不能为空");
        if (name.length() > 80) return error(400, "BAD_REQUEST", "密钥名称最长 80 字符");

        String owner = text(body.get("owner"));
        if (owner.isEmpty()) owner = principal.getUsername();
        if (!admin && !principal.getUsername().equals(owner)) {
            return error(403, "FORBIDDEN", "只有 ADMIN 可以为其他用户签发 key");
        }

        ConsoleRole role;
        try {
            String roleText = text(body.get("role"));
            role = roleText.isEmpty()
                    ? (admin ? ConsoleRole.VIEWER : principal.getRole())
                    : parseRole(roleText);
        } catch (IllegalArgumentException e) {
            return error(400, "BAD_REQUEST", e.getMessage());
        }
        if (!admin && !principal.getRole().atLeast(role)) {
            return error(403, "FORBIDDEN", "不能签发高于本人角色的 key");
        }

        List<String> permissions;
        List<String> connections;
        Map<String, List<String>> connectionPermissions;
        try {
            permissions = parsePermissions(body.get("permissions"), principal);
            connections = parseConnections(body.get("connections"), principal);
            connectionPermissions = parseConnectionPermissions(
                    body.get("connectionPermissions"), connections, principal);
        } catch (IllegalArgumentException e) {
            return error(400, "BAD_REQUEST", e.getMessage());
        } catch (SecurityException e) {
            return error(403, "FORBIDDEN", e.getMessage());
        }

        String connectionRoleError = validateConnectionRoles(connections, role);
        if (connectionRoleError != null) return error(400, "BAD_REQUEST", connectionRoleError);

        List<String> tools;
        try {
            tools = allowedTools(body.get("allowedTools"), principal, permissions, connectionPermissions, connections);
        } catch (IllegalArgumentException e) {
            return error(400, "BAD_REQUEST", e.getMessage());
        } catch (SecurityException e) {
            return error(403, "FORBIDDEN", e.getMessage());
        }
        if (tools.isEmpty()) return error(400, "BAD_REQUEST", "至少选择一个工具");

        Map<String, Object> caps = limits(principal);
        int rpm = intValue(body.get("requestsPerMinute"), 60);
        long daily = longValue(body.get("dailyQuota"), 5000L);
        long monthly = longValue(body.get("monthlyQuota"), 100000L);
        if (rpm < 1 || rpm > ((Number) caps.get("maxRequestsPerMinute")).intValue()) {
            return error(400, "BAD_REQUEST", "requestsPerMinute 超出当前角色上限");
        }
        if (daily < 1 || daily > ((Number) caps.get("maxDailyQuota")).longValue()) {
            return error(400, "BAD_REQUEST", "dailyQuota 超出当前角色上限");
        }
        if (monthly < 1 || monthly > ((Number) caps.get("maxMonthlyQuota")).longValue()) {
            return error(400, "BAD_REQUEST", "monthlyQuota 超出当前角色上限");
        }

        long expiresInDays = longValue(body.get("expiresInDays"), 0L);
        long maxDays = admin ? 3650L : 90L;
        if (expiresInDays < 0 || expiresInDays > maxDays) {
            return error(400, "BAD_REQUEST", "expiresInDays 超出当前角色上限（0=不过期）");
        }
        Long expiresAt = expiresInDays <= 0 ? null
                : System.currentTimeMillis() + expiresInDays * 86_400_000L;

        int ownedActive = 0;
        for (Map<String, Object> existing : store.list()) {
            if (owner.equals(existing.get("owner")) && Boolean.TRUE.equals(existing.get("enabled"))
                    && !Boolean.TRUE.equals(existing.get("expired"))) {
                ownedActive++;
            }
        }
        int maxKeys = admin ? 100 : 10;
        if (ownedActive >= maxKeys) {
            return error(429, "MCP_KEY_LIMIT",
                    "每个用户的活跃 key 上限为 " + maxKeys + "；请先撤销不再使用的 key");
        }

        Map<String, Object> created = store.create(name, owner, role.name(), tools, connections, permissions,
                connectionPermissions, rpm, daily, monthly, expiresAt);
        store.invalidate();
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping("/{id}/rotate")
    public ResponseEntity<?> rotate(@PathVariable("id") String id, HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;
        McpKeyRecord record = store.find(id);
        if (record == null) return error(404, "NOT_FOUND", "密钥不存在");
        if (!isAdmin(principal) && !principal.getUsername().equals(record.owner)) {
            return error(403, "FORBIDDEN", "只能轮换自己的 key");
        }
        if (!record.enabled) return error(409, "MCP_KEY_REVOKED", "已撤销的 key 不能轮换");
        if (record.expired(System.currentTimeMillis())) return error(409, "MCP_KEY_EXPIRED", "已过期的 key 不能轮换");
        Map<String, Object> rotated = store.rotate(id);
        if (rotated == null) return error(404, "NOT_FOUND", "密钥不存在");
        store.invalidate();
        return ResponseEntity.ok(rotated);
    }

    @PostMapping("/{id}/revoke")
    public ResponseEntity<?> revoke(@PathVariable("id") String id, HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;

        McpKeyRecord record = store.find(id);
        if (record == null) return error(404, "NOT_FOUND", "密钥不存在");
        if (!isAdmin(principal) && !principal.getUsername().equals(record.owner)) {
            return error(403, "FORBIDDEN", "只能撤销自己的 key");
        }
        if (!store.revoke(id)) return error(404, "NOT_FOUND", "密钥不存在");
        store.invalidate();
        McpKeyRecord after = store.find(id);
        return ResponseEntity.ok(after == null ? new LinkedHashMap<String, Object>() : after.redacted(System.currentTimeMillis()));
    }

    private ConsolePrincipal principal(HttpServletRequest request) {
        Object value = request == null ? null : request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return value instanceof ConsolePrincipal ? (ConsolePrincipal) value : null;
    }

    private boolean isAdmin(ConsolePrincipal principal) {
        return principal.getRole().atLeast(ConsoleRole.ADMIN);
    }

    private ResponseEntity<?> requireDevtoolsPage(ConsolePrincipal principal, boolean hostOnly) {
        if (isAdmin(principal)) return null;
        Set<String> pages = principal.getGrantedPages();
        if (pages == null) return null;
        if (!hasPageGrant(pages, "devtools", hostOnly)) {
            return error(403, "FORBIDDEN", hostOnly
                    ? "当前授权不含宿主连接的 DevTools，不能签发宿主 MCP key"
                    : "当前授权不含 DevTools，不能管理 MCP key");
        }
        return null;
    }

    /** 页面授权同时接受静态键与 conn:{id}:{page}（含写变体）——宿主菜单模型只下发后者。 */
    private boolean hasPageGrant(Set<String> pages, String page, boolean hostOnly) {
        for (String grant : pages) {
            if (grant == null) continue;
            if (grant.equals(page)) return true;
            if (hostOnly) {
                if (grant.equals("conn:host:" + page) || grant.equals("conn:host:w:" + page)) return true;
            } else if (grant.startsWith("conn:") && grant.endsWith(":" + page)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasPageGrantForConn(Set<String> pages, String page, String connId) {
        if (pages == null) return true;
        return pages.contains(page)
                || pages.contains("conn:" + connId + ":" + page)
                || pages.contains("conn:" + connId + ":w:" + page);
    }

    private Map<String, Object> caller(ConsolePrincipal principal) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("username", principal.getUsername());
        out.put("role", principal.getRole().name());
        out.put("canManageAll", isAdmin(principal));
        return out;
    }

    private Map<String, Object> enrichConnectionNames(Map<String, Object> key) {
        Object raw = key.get("connections");
        if (!(raw instanceof List)) return key;
        List<String> names = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            String id = String.valueOf(item);
            if ("host".equalsIgnoreCase(id)) {
                names.add("宿主 / 控制集群");
            } else {
                String name = connStore == null ? null : connStore.getName(id);
                names.add(name == null ? id : name);
            }
        }
        key.put("connectionNames", names);
        return key;
    }

    private List<Map<String, Object>> availableConnections(ConsolePrincipal principal) {
        List<Map<String, Object>> out = new ArrayList<>();
        boolean admin = isAdmin(principal);
        Set<String> pages = principal.getGrantedPages();
        /* ADMIN：宿主 + 全部连接，读写全开。非 ADMIN：只列自己拿到页面授权的连接；
           内置身份（grantedPages=null）保留宿主连接，按角色档。 */
        if (hostClusterVisible && (admin || pages == null || hasPageGrant(pages, "devtools", true))) {
            Map<String, Object> host = new LinkedHashMap<>();
            host.put("id", "host");
            host.put("name", "宿主 / 控制集群");
            host.put("env", "HOST");
            host.put("read", true);
            host.put("write", admin || (pages == null
                    ? principal.getRole().atLeast(ConsoleRole.OPERATOR)
                    : hasConnWrite(pages, "host")));
            out.add(host);
        }
        if (connStore == null) return out;
        for (Map<String, Object> conn : connStore.list()) {
            String id = String.valueOf(conn.get("id"));
            if (!admin && pages != null && !hasConnRead(pages, id)) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", id);
            item.put("name", conn.get("name"));
            item.put("env", conn.get("env"));
            item.put("read", admin || pages == null || hasConnRead(pages, id));
            item.put("write", admin || (pages == null
                    ? principal.getRole().atLeast(ConsoleRole.OPERATOR)
                    : hasConnWrite(pages, id)));
            out.add(item);
        }
        return out;
    }

    /** conn:{id}:{page} / conn:{id}:w:{page} 的读可见性；静态页键对所有连接可见。 */
    private boolean hasConnRead(Set<String> pages, String connId) {
        if (pages == null) return true;
        for (String grant : pages) {
            if (grant == null) continue;
            if (!grant.startsWith("conn:")) return true;
            String prefix = "conn:" + connId + ":";
            if (grant.startsWith(prefix)) return true;
        }
        return false;
    }

    /** 该连接是否至少有任一页面写键（DevTools 写键即数据面写全权）。 */
    private boolean hasConnWrite(Set<String> pages, String connId) {
        if (pages == null) return false;
        String prefix = "conn:" + connId + ":w:";
        for (String grant : pages) {
            if (grant != null && grant.startsWith(prefix)) return true;
        }
        return false;
    }

    private Map<String, Object> limits(ConsolePrincipal principal) {
        ConsoleRole role = principal.getRole();
        Map<String, Object> out = new LinkedHashMap<>();
        if (role.atLeast(ConsoleRole.ADMIN)) {
            out.put("maxRequestsPerMinute", 600);
            out.put("maxDailyQuota", 200000L);
            out.put("maxMonthlyQuota", 5000000L);
            out.put("maxExpiresInDays", 3650);
        } else if (role.atLeast(ConsoleRole.REBUILD_OP)) {
            out.put("maxRequestsPerMinute", 300);
            out.put("maxDailyQuota", 50000L);
            out.put("maxMonthlyQuota", 1000000L);
            out.put("maxExpiresInDays", 90);
        } else {
            out.put("maxRequestsPerMinute", 120);
            out.put("maxDailyQuota", 20000L);
            out.put("maxMonthlyQuota", 500000L);
            out.put("maxExpiresInDays", 90);
        }
        out.put("defaultRequestsPerMinute", 60);
        out.put("defaultDailyQuota", 5000L);
        out.put("defaultMonthlyQuota", 100000L);
        return out;
    }

    private List<String> availableTools(ConsolePrincipal principal) {
        Set<String> pages = principal.getGrantedPages();
        if (isAdmin(principal) || pages == null) return new ArrayList<>(McpController.TOOL_NAMES);
        List<String> out = new ArrayList<>();
        for (String tool : McpController.TOOL_NAMES) {
            String page = TOOL_PAGE.get(tool);
            if (page == null || hasPageGrant(pages, page, false)) out.add(tool);
        }
        return out;
    }

    private List<String> allowedTools(Object raw, ConsolePrincipal principal, List<String> permissions,
                                      Map<String, List<String>> connectionPermissions,
                                      List<String> connections) {
        if (raw != null && !(raw instanceof List)) {
            throw new IllegalArgumentException("allowedTools 必须是数组");
        }
        boolean canRead = permissions.contains("read");
        boolean canWrite = permissions.contains("write");
        if (connectionPermissions != null) {
            for (List<String> scoped : connectionPermissions.values()) {
                if (scoped == null) continue;
                canRead = canRead || scoped.contains("read");
                canWrite = canWrite || scoped.contains("write");
            }
        }
        List<String> requested = new ArrayList<>();
        if (raw instanceof List) {
            for (Object item : (List<?>) raw) {
                String tool = text(item);
                if (tool.isEmpty()) continue;
                if (!McpController.TOOL_NAMES.contains(tool)) {
                    throw new IllegalArgumentException("未知工具: " + tool);
                }
                if (McpController.WRITE_TOOLS.contains(tool) && !canWrite) {
                    throw new IllegalArgumentException("写工具 " + tool + " 需要 write 权限");
                }
                if (!McpController.WRITE_TOOLS.contains(tool) && !canRead) {
                    throw new IllegalArgumentException("读工具 " + tool + " 需要 read 权限");
                }
                if (!requested.contains(tool)) requested.add(tool);
            }
        } else {
            for (String tool : availableTools(principal)) {
                if (McpController.WRITE_TOOLS.contains(tool) ? canWrite : canRead) requested.add(tool);
            }
        }
        if (!isAdmin(principal)) {
            Set<String> pages = principal.getGrantedPages();
            if (pages != null) {
                for (String tool : requested) {
                    String page = TOOL_PAGE.get(tool);
                    if (page == null) continue;
                    if (McpController.WRITE_TOOLS.contains(tool)) {
                        /* 写工具只要求至少一个所选连接可写；真正执行时按目标连接再判。 */
                        boolean anyWritable = false;
                        for (String connId : connections) {
                            if (hasConnWrite(pages, connId)) { anyWritable = true; break; }
                        }
                        if (!anyWritable) {
                            throw new SecurityException("当前身份没有所选连接的页面写授权，不能签发写工具 " + tool);
                        }
                    } else {
                        /* 读工具必须每个所选连接都可读，防止借 A 连接授权读 B 连接页面。 */
                        for (String connId : connections) {
                            if (!hasPageGrantForConn(pages, page, connId)) {
                                throw new SecurityException("连接 " + connId + " 的页面授权不包含工具 "
                                        + tool + " 所需页面 " + page);
                            }
                        }
                    }
                }
            }
        }
        return requested;
    }

    private List<String> parsePermissions(Object raw, ConsolePrincipal principal) {
        if (!isAdmin(principal)) {
            if (raw instanceof List) {
                for (Object item : (List<?>) raw) {
                    if ("write".equalsIgnoreCase(text(item))) {
                        throw new SecurityException("只有 ADMIN 可以签发写权限 key");
                    }
                }
            }
            return Collections.singletonList("read");
        }
        if (raw == null) return Collections.singletonList("read");
        if (!(raw instanceof List)) throw new IllegalArgumentException("permissions 必须是数组");
        List<String> out = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            String permission = text(item).toLowerCase(java.util.Locale.ROOT);
            if (permission.isEmpty()) continue;
            if (!"read".equals(permission) && !"write".equals(permission)) {
                throw new IllegalArgumentException("未知权限: " + permission);
            }
            if (!out.contains(permission)) out.add(permission);
        }
        if (out.isEmpty()) throw new IllegalArgumentException("至少选择 read 或 write 权限");
        return out;
    }

    /**
     * 连接级权限覆盖：{"qaConn":["read","write"], "prodConn":["read"]}。
     * 未列出的连接回落到全局 permissions；用于一把 key 覆盖「测试可写、生产只读」。
     */
    private Map<String, List<String>> parseConnectionPermissions(Object raw, List<String> connections,
                                                                 ConsolePrincipal principal) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        if (raw == null) return out;
        if (!(raw instanceof Map)) throw new IllegalArgumentException("connectionPermissions 必须是对象");
        for (Map.Entry<?, ?> e : ((Map<?, ?>) raw).entrySet()) {
            String connectionId = text(e.getKey());
            if (connectionId.isEmpty()) continue;
            if (!connections.contains(connectionId)) {
                throw new IllegalArgumentException("连接权限中的连接不在本次 connections 内: " + connectionId);
            }
            if (!(e.getValue() instanceof List)) {
                throw new IllegalArgumentException("连接权限 " + connectionId + " 必须是数组");
            }
            List<String> perms = new ArrayList<>();
            for (Object item : (List<?>) e.getValue()) {
                String permission = text(item).toLowerCase(java.util.Locale.ROOT);
                if (permission.isEmpty()) continue;
                if (!"read".equals(permission) && !"write".equals(permission)) {
                    throw new IllegalArgumentException("未知权限: " + permission);
                }
                if (!isAdmin(principal)) {
                    Set<String> pages = principal.getGrantedPages();
                    if ("write".equals(permission) && !hasConnWrite(pages, connectionId)) {
                        throw new SecurityException("当前身份在连接 " + connectionId + " 没有页面写授权");
                    }
                    if ("read".equals(permission) && !hasConnRead(pages, connectionId)) {
                        throw new SecurityException("当前身份在连接 " + connectionId + " 没有页面读授权");
                    }
                }
                if (!perms.contains(permission)) perms.add(permission);
            }
            if (perms.isEmpty()) {
                throw new IllegalArgumentException("连接权限 " + connectionId + " 至少选择 read 或 write");
            }
            out.put(connectionId, perms);
        }
        return out;
    }

    private String validateConnectionRoles(List<String> connections, ConsoleRole role) {
        if (connStore == null) return null;
        for (String id : connections) {
            if ("host".equalsIgnoreCase(id)) continue;
            RemoteClusterConn conn = connStore.get(id);
            if (conn == null) return "连接不存在或已删除: " + id;
            ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
            if (!role.atLeast(required)) {
                return "key 角色 " + role.name() + " 低于连接 " + id + " 的 minRole " + required.name();
            }
        }
        return null;
    }

    private List<String> parseConnections(Object raw, ConsolePrincipal principal) {
        List<Map<String, Object>> available = availableConnections(principal);
        Set<String> allowed = new java.util.LinkedHashSet<>();
        for (Map<String, Object> connection : available) allowed.add(String.valueOf(connection.get("id")));
        if (allowed.isEmpty()) {
            throw new SecurityException("当前身份没有可签发 MCP key 的连接页面授权");
        }
        if (raw == null) {
            String first = String.valueOf(available.get(0).get("id"));
            return Collections.singletonList(first);
        }
        if (!(raw instanceof List)) throw new IllegalArgumentException("connections 必须是数组");
        List<String> out = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            String id = text(item);
            if (id.isEmpty()) continue;
            if (!allowed.contains(id)) {
                throw new SecurityException("连接不在当前身份的页面授权范围内: " + id);
            }
            if (!out.contains(id)) out.add(id);
        }
        if (out.isEmpty()) throw new IllegalArgumentException("至少选择一个连接");
        return out;
    }

    private ConsoleRole parseRole(String raw) {
        if (raw.isEmpty()) return ConsoleRole.VIEWER;
        for (ConsoleRole role : ConsoleRole.values()) {
            if (role.name().equalsIgnoreCase(raw)) return role;
        }
        throw new IllegalArgumentException("未知角色: " + raw);
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private int intValue(Object value, int fallback) {
        if (!(value instanceof Number)) return fallback;
        return ((Number) value).intValue();
    }

    private long longValue(Object value, long fallback) {
        if (!(value instanceof Number)) return fallback;
        return ((Number) value).longValue();
    }

    private ResponseEntity<Map<String, Object>> error(int status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}
