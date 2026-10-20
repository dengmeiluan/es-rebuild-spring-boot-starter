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

package io.github.dengmeiluan.es.rebuild.auth;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 「我的权限面」查询端点：当前身份 × 目标连接的逐页读/写判定 + raw 直连档 + 共享写档。
 *
 * <p>判定序列与 {@link ConsoleAuthInterceptor} 的门序同源（页面门 → 连接写门 → 角色门），
 * 判定原子复用拦截器静态口径与 {@link EnvPagesResolver}；只披露本人权限面（页面目录本就随
 * {@code /auth/me} 下发，无新增敏感面）。GET 只读端点，VIEWER 即可自查。</p>
 */
@RestController
@RequestMapping("internal/es/index/auth")
public class ConsolePermissionsController {

    private final ConsolePageCatalog pageCatalog;
    private final EnvPagesResolver envPagesResolver;
    private final io.github.dengmeiluan.es.rebuild.multicluster.ConnStore connStore;
    private final boolean pageAuthEnabled;

    public ConsolePermissionsController(ConsolePageCatalog pageCatalog, EnvPagesResolver envPagesResolver,
            io.github.dengmeiluan.es.rebuild.multicluster.ConnStore connStore, boolean pageAuthEnabled) {
        this.pageCatalog = pageCatalog;
        this.envPagesResolver = envPagesResolver;
        this.connStore = connStore;
        this.pageAuthEnabled = pageAuthEnabled;
    }

    /** REST 直连 / DevTools 执行走的透传端点（rest 页归属），raw 档判定的代表路径。 */
    static final String RAW_PATH = "/internal/es/index/cluster/raw";

    /**
     * 真实写端点路径（非 GET，且不是只读 POST）——页面写面判定的唯一依据。
     *
     * <p>不能再用 {@code requiredRole("POST", prefix)} 推断：GET-only 页面的前缀不在任何
     * 关键词表里，会被误判成 OPERATOR 可写，宿主据此下发 {@code w:} 键后
     * {@code hasAnyWriteKey} 会解锁全部共享写端点（权限面误报→提权链）。</p>
     */
    private static final List<String> WRITE_ENDPOINT_PATHS = java.util.Arrays.asList(
            "/internal/es/index/rebuild",
            "/internal/es/index/rebuild-empty",
            "/internal/es/index/force-merge",
            "/internal/es/index/replicas",
            "/internal/es/index/config-lab/validate",
            "/internal/es/index/cluster/delete-index",
            "/internal/es/index/cluster/create-index",
            "/internal/es/index/cluster/delete-by-id",
            "/internal/es/index/cluster/delete-by-query",
            "/internal/es/index/cluster/doc",
            "/internal/es/index/cluster/doc/update",
            "/internal/es/index/cluster/update-document",
            "/internal/es/index/cluster/update-partial",
            "/internal/es/index/cluster/put-mapping",
            "/internal/es/index/cluster/mapping-put",
            "/internal/es/index/cluster/update-settings",
            "/internal/es/index/cluster/index-settings/update",
            "/internal/es/index/cluster/bulk",
            "/internal/es/index/cluster/update-by-query",
            "/internal/es/index/cluster/alias-actions",
            "/internal/es/index/cluster/rollover",
            "/internal/es/index/cluster/templates/put",
            "/internal/es/index/cluster/templates/delete",
            "/internal/es/index/cluster/scripts/put",
            "/internal/es/index/cluster/scripts/delete",
            "/internal/es/index/cluster/snapshot/create",
            "/internal/es/index/cluster/snapshot/restore",
            "/internal/es/index/cluster/snapshot/delete",
            "/internal/es/index/cluster/ilm/policy",
            "/internal/es/index/cluster/ilm/move",
            "/internal/es/index/cluster/ilm/start",
            "/internal/es/index/cluster/ilm/stop",
            "/internal/es/index/cluster/slm/execute",
            "/internal/es/index/cluster/settings/put",
            "/internal/es/index/cluster/reroute",
            "/internal/es/index/cluster/tasks/cancel",
            "/internal/es/index/cluster/analysis-update",
            "/internal/es/index/cluster/synonyms-upsert",
            "/internal/es/index/cluster/reload-analyzers",
            "/internal/es/index/cluster/reindex-advanced",
            "/internal/es/index/cluster/raw",
            "/internal/es/index/auth/users/upsert",
            "/internal/es/index/auth/users/delete",
            "/internal/es/index/setup/rebind",
            "/internal/es/index/clusters/save",
            "/internal/es/index/clusters/delete",
            "/internal/es/index/clusters/test",
            "/internal/es/index/clusters/sync/run",
            "/internal/es/index/adhoc-rebuild/start",
            "/internal/es/index/adhoc-rebuild/abort",
            "/internal/es/index/adhoc-rebuild/confirm-switch",
            "/internal/es/xmigrate/start",
            "/internal/es/xmigrate/resume",
            "/internal/es/xmigrate/abort",
            "/internal/es/xmigrate/connect-check",
            "/internal/es/xmigrate/fetch-config",
            "/internal/es/xmigrate/resolve-preview",
            "/internal/es/xmigrate/preflight");

    @GetMapping("permissions")
    public Map<String, Object> permissions(HttpServletRequest request,
            @RequestParam(required = false) String target) {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        Map<String, Object> out = new LinkedHashMap<>();
        if (p == null) {
            // 拦截器在前面 principal 恒在场；此臂=拦截器被旁路的部署形态，fail-closed
            out.put("code", "UNAUTHORIZED");
            out.put("message", "请先登录 ES 控制台");
            return out;
        }
        String tid = (target == null || target.isEmpty() || "host".equalsIgnoreCase(target.trim()))
                ? "host" : target.trim();
        boolean targetIsConn = !"host".equals(tid);
        boolean admin = p.getRole().atLeast(ConsoleRole.ADMIN);
        Set<String> gp = pageAuthEnabled && p.isDelegated() ? p.getGrantedPages() : null;
        boolean pageGateActive = gp != null;
        boolean connModel = pageGateActive && envPagesResolver.inConnModel(gp);
        Set<String> effective = pageGateActive ? envPagesResolver.effectivePages(tid, gp) : null;

        // raw 直连档：ADMIN 全局可用；连接模型=精确 rest 页写键；静态模型=角色档
        boolean rawAllowed = admin || ((pageGateActive && connModel)
                ? envPagesResolver.writeAllowed(tid, "rest", gp)
                : p.getRole().atLeast(ConsoleAuthInterceptor.requiredRole("POST", RAW_PATH)));
        // 共享写档：ADMIN 全局可用；连接模型需持有真实使用共享端点的页面写键
        boolean sharedWriteAllowed = admin || (pageGateActive && connModel && targetIsConn
                && ConsoleAuthInterceptor.hasSharedWriteGrant(tid, gp));

        String connName = null;
        String env = null;
        if (targetIsConn) {
            try {
                connName = connStore.getName(tid);
            } catch (Exception e) {
                // 连接档案瞬态不可用：查询面尽力而为，绝不反噬
            }
            try {
                io.github.dengmeiluan.es.rebuild.xmigrate.RemoteClusterConn conn = connStore.get(tid);
                if (conn != null) {
                    env = conn.getEnv();
                }
            } catch (Exception e) {
                // 同上
            }
        }
        boolean envPagesApplied = targetIsConn && envPagesResolver.pagesFor(tid) != null;

        out.put("role", p.getRole().name());
        out.put("delegated", p.isDelegated());
        out.put("pageAuthEnabled", pageAuthEnabled);
        out.put("pageGateActive", pageGateActive);
        out.put("target", tid);
        out.put("connName", connName);
        out.put("env", env);
        out.put("connModel", connModel);
        out.put("envPagesApplied", envPagesApplied);
        out.put("rawAllowed", rawAllowed);
        out.put("sharedWriteAllowed", sharedWriteAllowed);

        List<Map<String, Object>> groups = new ArrayList<>();
        for (ConsolePageCatalog.Group g : pageCatalog.getGroups()) {
            List<Map<String, Object>> pages = new ArrayList<>();
            for (ConsolePageCatalog.Page pg : pageCatalog.pagesOf(g.getId())) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("key", pg.getKey());
                pm.put("name", pg.getName());
                boolean read = admin || !pageGateActive || effective.contains(pg.getKey());
                List<String> prefixes = pg.getApiPrefixes();
                ConsoleRole writeRole = requiredWriteRole(prefixes);
                boolean hasWriteEndpoint = writeRole != null;
                Boolean write = null;
                String writeDeny = null;
                if (hasWriteEndpoint) {
                    if (!read) {
                        write = Boolean.FALSE;
                        writeDeny = "PAGE_DENIED";
                    } else if (pageGateActive && connModel) {
                        write = admin || envPagesResolver.writeAllowed(tid, pg.getKey(), gp);
                        if (!write) {
                            writeDeny = "WRITE_DENIED";
                        }
                    } else {
                        /* 页面写键在 conn 模型是最终裁决（一次授权覆盖该页全部写端点）——
                           必须按该页最高危写端点判定，不能“任一可写即 true”，否则 OPERATOR
                           拿到含 rank3 端点的页写键后可直接执行 rank3 操作。 */
                        write = p.getRole().atLeast(writeRole);
                        if (!write) {
                            writeDeny = "ROLE_INSUFFICIENT:" + writeRole.name();
                        }
                    }
                }
                pm.put("read", read);
                pm.put("write", write);
                if (writeDeny != null) {
                    pm.put("writeDeny", writeDeny);
                }
                pages.add(pm);
            }
            Map<String, Object> gm = new LinkedHashMap<>();
            gm.put("id", g.getId());
            gm.put("name", g.getName());
            gm.put("pages", pages);
            groups.add(gm);
        }
        out.put("groups", groups);
        return out;
    }

    /** 该页真实写端点的最高角色档；无写端点返回 null。 */
    private static ConsoleRole requiredWriteRole(List<String> prefixes) {
        if (prefixes == null || prefixes.isEmpty()) return null;
        ConsoleRole need = null;
        for (String prefix : prefixes) {
            for (String write : WRITE_ENDPOINT_PATHS) {
                if (!covers(prefix, write) || ConsoleAuthInterceptor.isReadonlyPost(write)) {
                    continue;
                }
                ConsoleRole r = ConsoleAuthInterceptor.requiredRole("POST", write);
                if (need == null || r.ordinal() > need.ordinal()) {
                    need = r;
                }
            }
        }
        return need;
    }

    /** 页面前缀是否覆盖写端点（段边界：前缀等于端点或为端点父路径）。 */
    private static boolean covers(String prefix, String write) {
        if (write.equals(prefix)) return true;
        if (prefix.endsWith("/")) return write.startsWith(prefix);
        return write.startsWith(prefix + "/");
    }
}
