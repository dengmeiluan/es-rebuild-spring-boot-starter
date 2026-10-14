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
        Set<String> gp = pageAuthEnabled && p.isDelegated() ? p.getGrantedPages() : null;
        boolean pageGateActive = gp != null;
        boolean connModel = pageGateActive && envPagesResolver.inConnModel(gp);
        Set<String> effective = pageGateActive ? envPagesResolver.effectivePages(tid, gp) : null;

        // raw 直连档：连接模型=精确 rest 页写键（canEndpoint('admin', POST, raw) 的后端镜像）；
        // 静态模型=角色档（/cluster/raw 属 ADMIN 关键字清单）
        boolean rawAllowed = (pageGateActive && connModel)
                ? envPagesResolver.writeAllowed(tid, "rest", gp)
                : p.getRole().atLeast(ConsoleAuthInterceptor.requiredRole("POST", RAW_PATH));
        // 共享写端点档：仅连接模型且目标是具体连接时有意义（拦截器对共享写端点的放行口径）
        boolean sharedWriteAllowed = pageGateActive && connModel && targetIsConn
                && envPagesResolver.hasAnyWriteKey(tid, gp);

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
                boolean read = !pageGateActive || effective.contains(pg.getKey());
                List<String> prefixes = pg.getApiPrefixes();
                boolean hasWriteEndpoint = prefixes != null && !prefixes.isEmpty() && hasNonReadonlyPost(prefixes);
                Boolean write = null;
                String writeDeny = null;
                if (hasWriteEndpoint) {
                    if (!read) {
                        write = Boolean.FALSE;
                        writeDeny = "PAGE_DENIED";
                    } else if (pageGateActive && connModel) {
                        write = envPagesResolver.writeAllowed(tid, pg.getKey(), gp);
                        if (!write) {
                            writeDeny = "WRITE_DENIED";
                        }
                    } else {
                        write = Boolean.FALSE;
                        ConsoleRole need = null;
                        for (String prefix : prefixes) {
                            if (ConsoleAuthInterceptor.isReadonlyPost(prefix)) {
                                continue;
                            }
                            ConsoleRole r = ConsoleAuthInterceptor.requiredRole("POST", prefix);
                            if (need == null || r.ordinal() > need.ordinal()) {
                                need = r;
                            }
                            if (p.getRole().atLeast(r)) {
                                write = Boolean.TRUE;
                            }
                        }
                        if (!write) {
                            writeDeny = "ROLE_INSUFFICIENT:" + need.name();
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

    /** 该页端点里是否存在非只读 POST（只读查询 POST 与 GET 同权，不构成写面）。 */
    private static boolean hasNonReadonlyPost(List<String> prefixes) {
        for (String prefix : prefixes) {
            if (!ConsoleAuthInterceptor.isReadonlyPost(prefix)) {
                return true;
            }
        }
        return false;
    }
}
