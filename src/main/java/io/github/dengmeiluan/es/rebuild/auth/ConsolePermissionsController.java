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

import org.springframework.http.ResponseEntity;
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

    /** REST 直连走的透传端点（rest 页归属），raw 档判定的代表路径。 */
    static final String RAW_PATH = "/internal/es/index/cluster/raw";
    /** DevTools 独立执行端点（devtools/rest 页写键均可）。 */
    static final String DEVTOOLS_PATH = "/internal/es/index/cluster/devtools/execute";

    /**
     * 真实写端点路径（非 GET，且不是只读 POST）——页面写面判定的唯一依据。
     *
     * <p>不能再用 {@code requiredRole("POST", prefix)} 推断：GET-only 页面的前缀不在任何
     * 关键词表里，会被误判成 OPERATOR 可写，宿主据此下发 {@code w:} 键后会解锁共享写端点
     * （权限面误报→提权链）。</p>
     */
    private static final List<String> WRITE_ENDPOINT_PATHS = java.util.Arrays.asList(
            "/internal/es/index/rebuild",
            "/internal/es/index/rebuild-empty",
            "/internal/es/index/force-merge",
            "/internal/es/index/cluster/force-merge",
            "/internal/es/index/insight/actions/apply-index-settings",
            "/internal/es/index/replicas",
            "/internal/es/index/config-lab/validate",
            "/internal/es/index/cluster/delete-index",
            "/internal/es/index/cluster/create-index",
            "/internal/es/index/cluster/delete-by-id",
            "/internal/es/index/cluster/delete-by-query",
            "/internal/es/index/cluster/devtools/execute",
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
            "/internal/es/index/cluster/painless/execute",
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
            "/internal/es/index/cluster/reroute/retry-failed",
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
    public ResponseEntity<Map<String, Object>> permissions(HttpServletRequest request,
            @RequestParam(required = false) String target) {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        Map<String, Object> out = new LinkedHashMap<>();
        if (p == null) {
            // 拦截器在前面 principal 恒在场；此臂=拦截器被旁路的部署形态，fail-closed。
            // 状态码对齐拦截器未认证拒绝（401 {code:"UNAUTHORIZED"}）——200 包体带错误码
            // 会让前端登录遮罩广播（api.ts 401 通道）失效
            out.put("code", "UNAUTHORIZED");
            out.put("message", "请先登录 ES 控制台");
            return ResponseEntity.status(401).body(out);
        }
        String tid = (target == null || target.isEmpty() || "host".equalsIgnoreCase(target.trim()))
                ? "host" : target.trim();
        boolean targetIsConn = !"host".equals(tid);
        boolean admin = p.getRole().atLeast(ConsoleRole.ADMIN);
        Set<String> gp = pageAuthEnabled ? p.getGrantedPages() : null;
        boolean pageGateActive = gp != null;
        boolean connModel = pageGateActive && envPagesResolver.inConnModel(gp);
        Set<String> effective = pageGateActive ? envPagesResolver.effectivePages(tid, gp) : null;

        /* 目标连接名/环境按 canSeeConn 同口径过滤：/auth/permissions 是自举端点，
           任意已认证用户都能带 target 探测，不能借此枚举未授权连接档案。 */
        boolean targetVisible = targetIsConn && canSeeTarget(p, tid);
        boolean targetAccessible = !targetIsConn || targetVisible;

        // raw 直连档：ADMIN 全局可用；连接模型=精确 rest 页写键（混入静态页时按静态写权+角色）；
        // 静态模型=环境模板收缩后的页可见 + 角色档。
        // DevTools 走独立端点，w:devtools 不能顺带解锁 REST 直连（/cluster/raw 仍是 rest 页）。
        ConsoleRole rawRole = ConsoleAuthInterceptor.requiredRole("POST", RAW_PATH);
        ConsoleRole devtoolsRole = ConsoleAuthInterceptor.requiredRole("POST", DEVTOOLS_PATH);
        boolean rawAllowed = targetAccessible && (admin || (pageGateActive && connModel
                ? (envPagesResolver.writeAllowed(tid, "rest", gp)
                    || (envPagesResolver.staticWriteAllowed(tid, "rest", gp)
                        && p.getRole().atLeast(rawRole)))
                : p.getRole().atLeast(rawRole)
                    && (!pageGateActive || effective.contains("rest"))));
        boolean devtoolsAllowed = targetAccessible && (admin || (pageGateActive && connModel
                ? (envPagesResolver.writeAllowed(tid, "devtools", gp)
                    || envPagesResolver.writeAllowed(tid, "rest", gp)
                    || ((envPagesResolver.staticWriteAllowed(tid, "devtools", gp)
                        || envPagesResolver.staticWriteAllowed(tid, "rest", gp))
                        && p.getRole().atLeast(devtoolsRole)))
                : p.getRole().atLeast(devtoolsRole)
                    && (!pageGateActive || effective.contains("devtools") || effective.contains("rest"))));
        // 共享写档：ADMIN 全局可用；连接模型需持有真实使用共享端点的页面写键；
        // 静态/内置模型按「页面可见 + 角色档」判定（不能只对 conn 模型报可用）
        boolean sharedWriteAllowed = targetAccessible && (admin
                || (pageGateActive && connModel
                    && (ConsoleAuthInterceptor.hasSharedWriteGrant(tid, gp, effective)
                        || ConsoleAuthInterceptor.hasStaticSharedWriteGrant(gp, effective, p.getRole())))
                || (pageGateActive && !connModel
                    && ConsoleAuthInterceptor.hasStaticSharedWriteGrant(gp, effective, p.getRole()))
                || (!pageGateActive && p.getRole().atLeast(ConsoleRole.OPERATOR)));
        String connName = null;
        String env = null;
        if (targetVisible) {
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
        boolean envPagesApplied = targetVisible && envPagesResolver.pagesFor(tid) != null;

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
        out.put("devtoolsAllowed", devtoolsAllowed);
        out.put("sharedWriteAllowed", sharedWriteAllowed);

        Set<String> hostEffective = pageGateActive
                ? envPagesResolver.effectivePages("host", gp) : null;
        List<Map<String, Object>> groups = new ArrayList<>();
        for (ConsolePageCatalog.Group g : pageCatalog.getGroups()) {
            List<Map<String, Object>> pages = new ArrayList<>();
            for (ConsolePageCatalog.Page pg : pageCatalog.pagesOf(g.getId())) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("key", pg.getKey());
                pm.put("name", pg.getName());
                /* system/config-drift 的执行恒定宿主：面板必须按 host 授权回显，
                   否则 conn:c1:system 会显示可读、实际端点 403（与拦截器 isHostBoundPath 同源）。 */
                boolean hostPage = "system".equals(pg.getKey()) || "config-drift".equals(pg.getKey());
                Set<String> pageEffective = pageGateActive
                        ? envPagesResolver.effectivePages(hostPage ? "host" : tid, gp) : null;
                boolean read = admin || !pageGateActive
                        || (hostPage
                            /* config-drift 的共享读（desired-state / mapping-reconcile）跟随目标，
                               system 的端点恒宿主——两者取并集才不会虚报不可读。 */
                            ? (pageEffective.contains(pg.getKey())
                                || (targetAccessible && effective != null && effective.contains(pg.getKey())))
                            : targetAccessible && pageEffective.contains(pg.getKey()))
                        /* security 页的审计读是 host-scope：目标不可见/不持有该连接键时，
                           持 conn:host:security 仍能看到宿主审计入口。 */
                        || ("security".equals(pg.getKey()) && hostEffective != null
                            && hostEffective.contains("security"));
                /* 安全中心两个作用域必须分开回显：/auth/users 恒宿主、/auth/ops-audit 跟随目标。
                   面板 read=true 只表示「本页至少有一个可读面」，具体 tab 由 readScopes 标注，
                   避免把「只能看宿主流水」误读成「能看该连接全部审计」。 */
                boolean usersRead = admin || !pageGateActive
                        || (hostEffective != null && hostEffective.contains("security"));
                boolean auditRead = admin || !pageGateActive
                        || (targetAccessible && pageEffective.contains("security"))
                        || (hostEffective != null && hostEffective.contains("security"));
                if (!admin && "rest".equals(pg.getKey())) {
                    read = pageGateActive && hasConnKey(gp, tid, "rest")
                            && pageEffective.contains("rest");
                } else if (!admin && "devtools".equals(pg.getKey())) {
                    boolean devtoolsKey = pageGateActive && hasConnKey(gp, tid, "devtools")
                            && pageEffective.contains("devtools");
                    boolean restKey = pageGateActive && gp != null
                            && gp.contains("conn:" + tid + ":w:rest")
                            && pageEffective.contains("rest");
                    read = devtoolsKey || restKey;
                }
                List<String> prefixes = pg.getApiPrefixes();
                ConsoleRole writeRole = requiredWriteRole(pg.getKey(), prefixes);
                boolean hasWriteEndpoint = writeRole != null;
                Boolean write = null;
                String writeDeny = null;
                if (hasWriteEndpoint) {
                    if (!read) {
                        write = Boolean.FALSE;
                        writeDeny = "PAGE_DENIED";
                    } else if (pageGateActive && connModel) {
                        /* security 的写端点（auth/users）与 system/config-drift 一样恒定宿主：
                           面板必须按 host 写键回显，不能把 conn:c1:w:security 报成可写。 */
                        String writeTid = ("security".equals(pg.getKey()) || hostPage) ? "host" : tid;
                        /* 与拦截器同序：conn 写键优先；混合模型静态页写权 = 静态键 + 角色档。 */
                        write = admin || envPagesResolver.writeAllowed(writeTid, pg.getKey(), gp)
                                || (envPagesResolver.staticWriteAllowed(writeTid, pg.getKey(), gp)
                                    && p.getRole().atLeast(writeRole));
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
                    /* DevTools 专用端点同时接受 devtools/rest 写键（兼容），页行必须同口径。 */
                    /* 只有「委派身份」的 security 写键不能管理本地账号（服务端按 isDelegated 判定）；
                       非委派的页面写键持有人后端实际可写——面板不能把所有非 ADMIN 都标成只读，
                       否则会出现「面板说不可写、实际能改账号」（与拦截器分叉）。 */
                    if (pageGateActive && connModel && p.isDelegated() && !admin
                            && "security".equals(pg.getKey())) {
                        write = Boolean.FALSE;
                        writeDeny = "DELEGATED_SECURITY_READONLY";
                    }
                    if (pageGateActive && connModel && "devtools".equals(pg.getKey())) {
                        write = admin || envPagesResolver.writeAllowed(tid, "devtools", gp)
                                || envPagesResolver.writeAllowed(tid, "rest", gp);
                        writeDeny = write ? null : "WRITE_DENIED";
                        /* REST 写键可执行 DevTools（后端共享写映射同口径）：面板读能力不得显示 false，
                           否则前端路由/侧栏与权限面板自相矛盾。 */
                        if (Boolean.TRUE.equals(write)) {
                            read = true;
                        }
                    }
                    /* 迁移写入端恒为宿主：start/resume/preflight 需要「源写键 + 宿主写键」双证；
                       abort/connect-check/fetch-config/resolve-preview 只需源写键。
                       面板 write 表示「本页写操作至少有一部分可用」，缺宿主写键时用 writeDeny
                       标注限制（而不是一律 false 把只能中止在途作业的人报成完全不可写）。 */
                    if (pageGateActive && connModel && !admin && "xmigrate".equals(pg.getKey())) {
                        boolean sourceWrite = Boolean.TRUE.equals(write);
                        boolean hostWrite = envPagesResolver.writeAllowed("host", "xmigrate", gp)
                                || (envPagesResolver.staticWriteAllowed("host", "xmigrate", gp)
                                    && p.getRole().atLeast(writeRole));
                        if (!sourceWrite) {
                            write = Boolean.FALSE;
                            writeDeny = "WRITE_DENIED";
                        } else if (!hostWrite) {
                            writeDeny = "HOST_DEST_WRITE_REQUIRED";
                        }
                    }
                }
                pm.put("read", read);
                pm.put("write", write);
                if (writeDeny != null) {
                    pm.put("writeDeny", writeDeny);
                }
                /* 细粒度说明（前端按需消费，不影响既有布尔契约）：
                   security 的两个读作用域（users=宿主、audit=目标）实际不可互换；
                   aliases 在 config-validator 归属下只有 add-only 写权（后端 aliasActionsAddOnly 同源）。 */
                if ("security".equals(pg.getKey())) {
                    Map<String, Object> scopes = new LinkedHashMap<>();
                    scopes.put("users", usersRead);
                    scopes.put("audit", auditRead);
                    pm.put("readScopes", scopes);
                }
                if ("aliases".equals(pg.getKey()) && Boolean.TRUE.equals(write)) {
                    String writeTid = "host".equals(tid) ? "host" : tid;
                    boolean fullAlias = envPagesResolver.writeAllowed(writeTid, "aliases", gp)
                            || (envPagesResolver.staticWriteAllowed(writeTid, "aliases", gp)
                                && writeRole != null && p.getRole().atLeast(writeRole));
                    pm.put("writeScope", fullAlias ? "FULL" : "ADD_ONLY");
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
        return ResponseEntity.ok(out);
    }

    /** 与前端 canSeeConn / 连接目录 / 监控接口同口径。 */
    private boolean canSeeTarget(ConsolePrincipal p, String tid) {
        return ConsoleConnVisibility.canSee(p, tid, connStore);
    }

    /**
     * 该页真实写端点的最高角色档；无写端点返回 null。
     * 除页面 apiPrefixes 直连端点外，还要识别 SHARED_WRITE_PAGES 里声明本页为归属页的
     * 共享写端点（ilm/tasks/index-settings/optimizer 等页仅靠共享映射拥有写能力）——
     * 否则宿主的权限面板不给 w: 键，已授权用户永远无法被授权。
     */
    private static boolean hasConnKey(Set<String> gp, String tid, String page) {
        return gp != null && (gp.contains("conn:" + tid + ":" + page)
                || gp.contains("conn:" + tid + ":w:" + page));
    }

    private static ConsoleRole requiredWriteRole(String pageKey, List<String> prefixes) {
        ConsoleRole need = null;
        for (String write : WRITE_ENDPOINT_PATHS) {
            if (ConsoleAuthInterceptor.isReadonlyPost(write)) continue;
            boolean owned = false;
            if (prefixes != null) {
                for (String prefix : prefixes) {
                    if (covers(prefix, write)) { owned = true; break; }
                }
            }
            if (!owned) {
                List<String> shared = ConsoleAuthInterceptor.sharedWritePages(write);
                owned = shared != null && shared.contains(pageKey);
            }
            if (!owned) continue;
            ConsoleRole r = ConsoleAuthInterceptor.requiredRole("POST", write);
            if (need == null || r.ordinal() > need.ordinal()) {
                need = r;
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
