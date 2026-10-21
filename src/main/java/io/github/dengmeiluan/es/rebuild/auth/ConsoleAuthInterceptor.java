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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/**
 * 控制台鉴权拦截器（覆盖 {@code /internal/es/index/**} 与 {@code /internal/es/xmigrate/**}。
 *
 * <p>分级规则（傻瓜化默认，无需配置）：</p>
 * <ul>
 *   <li>GET → {@link ConsoleRole#VIEWER}（只读观测全放行给最低角色）</li>
 *   <li>POST/PUT/DELETE → {@link ConsoleRole#OPERATOR}（普通写：文档编辑、analyze、渲染等）</li>
 *   <li>高危清单 → {@link ConsoleRole#ADMIN}（重建/迁移/删索引/别名切换/集群 settings/raw 透传/用户管理）</li>
 *   <li>2.5.0 页面门（菜单 SPI）：delegated 身份且宿主下发 grantedPages 时，页面专属端点须命中白名单，
 *   先于角色门判定；共享端点（auth/setup/全局引导/多页共用）不吃页面级</li>
 * </ul>
 *
 * <p>未认证回 401 {@code {code:"UNAUTHORIZED"}}，权限不足回 403 {@code {code:"FORBIDDEN",required:"ADMIN"}}，
 * 前端据此弹登录框/提示升权。写操作在 afterCompletion 异步落 {@link ConsoleOpsAuditStore}。</p>
 *
 * @author aicoding
 */
public class ConsoleAuthInterceptor implements HandlerInterceptor {

    private static final Logger LOG = LoggerFactory.getLogger(ConsoleAuthInterceptor.class);

    /** connName 解析失败 WARN 节流间隔（审计是每写请求路径，防刷屏）。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    /** request attribute：已认证身份，供 auth controller / 审计复用。 */
    public static final String ATTR_PRINCIPAL = "es.console.principal";

    /** request attribute：归一化路径（canonicalize 后），供 afterCompletion 审计口径复用。 */
    public static final String ATTR_NORMALIZED_PATH = "es.console.normalizedPath";

    /** request attribute：拦截器入口时刻（毫秒）——审计耗时维度（。 */
    static final String ATTR_START_MS = "es.console.audit.startMs";

    /** request attribute：raw 透传执行摘要（"GET /_cat/indices" 形态）——由 /cluster/raw
     *  端点解析请求体后回填，afterCompletion 落入 HIGH_RISK detail（*  高危操作从「零法证」到「谁对哪个集群执行了什么」）。 */
    public static final String ATTR_RAW_SUMMARY = "es.console.raw.summary";

    /** 免鉴权路径（登录本身 +  Setup 状态查询）。 */
    private static final List<String> WHITELIST = Arrays.asList(
            "/internal/es/index/auth/login",
            "/internal/es/index/setup/status");

    /**
     * 高危路径关键字（uri contains 匹配）→ ADMIN。
     * 覆盖：重建生命周期 / 跨集群迁移写 / 删索引删数据 / 别名与模板与脚本变更 /
     * 集群级 settings/reroute / raw 透传 / snapshot restore / 用户管理。
     */
    /* w66:ADMIN 一把抓拆为独立权限域 — 每域可独立授权,不再全靠超管。
     * REBUILD_OP:重建/迁移/回滚/锁/合并/副本/批量写
     * CLUSTER_OP:索引生命周期(mapping/settings/alias/模板/脚本/快照/ILM/分析器)
     * AUDIT_OP:审计日志查看
     * ADMIN(超管):用户管理 + raw 透传(安全底线不拆) */
    private static final List<String> REBUILD_KEYWORDS = Arrays.asList(
            "/rebuild", "/first-migrate", "/full-reload", "/cleanup", "/abort",
            "/lock/release", "/force-merge", "/replicas",
            "/cluster/update-by-query", "/cluster/bulk",
            /* reindex-advanced（@PostMapping，无 GET 形态）与 /rebuild 同族的
               重建写端点，原先落缺省 OPERATOR，升 rank3 */
            "/reindex-advanced",
            "/xmigrate/start", "/xmigrate/resume", "/xmigrate/abort",
            /* 迁移探测面（连接自检/取源配置/变量解析/预检）接受任意连接串并让服务端建连，
               属 SSRF/环境变量读取面——与迁移写同档 rank3，不再对 VIEWER 开放。 */
            "/xmigrate/connect-check", "/xmigrate/fetch-config", "/xmigrate/resolve-preview",
            "/xmigrate/preflight",
            /* 裸词 "/adhoc-rebuild" 退役（危险级重划）——adhoc 的 GET（任务列表/
               就绪检查）是观测面，裸 contains 把静态模型 VIEWER 也拦在门外（历史 403 噪声源）；
               写动词逐一列出即可覆盖全部写端点（start/abort/confirm-switch）。 */
            "adhoc-rebuild/start", "adhoc-rebuild/abort", "adhoc-rebuild/confirm-switch");

    private static final List<String> CLUSTER_KEYWORDS = Arrays.asList(
            "/cluster/delete-index", "/cluster/create-index",
            "/cluster/delete-by-id", "/cluster/delete-by-query",
            "/cluster/settings/put", "/cluster/reroute",
            "/cluster/alias-actions", "/cluster/rollover",
            "/cluster/templates/put", "/cluster/templates/delete",
            "/cluster/scripts/put", "/cluster/scripts/delete",
            /* 危险级重划补漏：删备份/改 ILM 策略/执行 SLM 原先落在缺省 rank2
               （OPERATOR 即可）——删快照毁备份、ILM 策略变更影响全索引生命周期，升 rank3。 */
            "/cluster/snapshot/delete",
            "/cluster/snapshot/restore", "/cluster/snapshot/create",
            "/cluster/ilm/policy", "/cluster/ilm/move", "/cluster/ilm/start", "/cluster/ilm/stop",
            "/cluster/slm/execute",
            "/cluster/index-settings/update", "/cluster/update-settings",
            "/cluster/mapping-put", "/cluster/put-mapping", "/cluster/analysis-update",
            "/cluster/synonyms-upsert", "/cluster/reload-analyzers");

    private static final List<String> AUDIT_KEYWORDS = Arrays.asList(
            "/auth/ops-audit", "/auth/audit-facets");

    /* 仅超管:用户管理 + raw 透传 + 系统管理(requiredRole 档位/审计分级用) */
    private static final List<String> ADMIN_KEYWORDS = Arrays.asList(
            "/auth/users",
            "/cluster/raw",
            "/setup/rebind",  //  重绑控制集群（高危：控制面数据归属切换）
            "/clusters/");  //  多集群连接保存/删除/测试（凭据流转）；GET /clusters 列表脱敏，VIEWER 可读
    /** 系统管理层（重绑/连接档案）：ADMIN 角色专属。用户管理归 security 页写键，
     *  由页面门裁决；账号服务再限制非 ADMIN 不得授予/修改/删除 ADMIN（防提权）。 */
    private static final List<String> SYSTEM_ADMIN_KEYWORDS = Arrays.asList(
            "/setup/rebind",
            "/clusters/");
    /** 执行类只读 POST（零数据写入但执行脚本/消耗资源）——落 EXEC 审计留痕。 */
    private static final List<String> EXEC_AUDIT_POST_KEYWORDS = Arrays.asList(
            "/cluster/painless/execute", "/cluster/analyze", "/cluster/reindex-preview",
            "/config-lab/validate");

    private static boolean isSystemAdminUri(String uri) {
        // 探活是只读观测（POST 但零副作用），不受系统管理 ADMIN 门约束（requiredRole 特判 VIEWER）
        if (uri != null && uri.endsWith("/probe")) return false;
        for (String kw : SYSTEM_ADMIN_KEYWORDS) {
            if (uri.contains(kw)) return true;
        }
        return false;
    }

    /**
     * -C1 只读 POST 清单（DSL/SQL 必须走 body 才用 POST，零副作用）。
     * 审计与 GET 同策略——不落流水：查询类每翻一页就一条，噪音会把真正的写操作淹没（产线截图实锤：
     * 三条 POST /cluster/query 被记成 WRITE，合规回溯时误导「谁改了数据」）。
     */
    private static final List<String> READONLY_POST_KEYWORDS = Arrays.asList(
            "/cluster/query", "/cluster/profile", "/cluster/count",
            "/cluster/search-dsl", "/cluster/search-raw", "/cluster/search-template", "/cluster/render-template",
            "/cluster/validate-query", "/cluster/explain-doc", "/cluster/allocation-explain",
            "/cluster/analyze", "/cluster/reindex-preview",
            "/cluster/sql", "/cluster/pit/", "/cluster/painless/execute",
            "/insight/settings-impact");

    /**
     * 共享写端点 → 合法页面写键归属（conn 模型）。
     *
     * <p>这些端点没有独占的页面前缀（文档 CRUD/任务取消/ILM 策略等被多页复用），原实现
     * 按“任意写键”放行——持 optimizer 写键即可删文档/取消重建任务/改 ILM 策略。
     * 改为：必须持有至少一个真实使用该端点的页面写键；未登记的共享写回落角色门（保守）。
     * 前端 auth.canEndpoint 必须镜像同一张表（防“看得见点不了/看不见能直调”）。</p>
     */
    private static final java.util.Map<String, List<String>> SHARED_WRITE_PAGES;
    static {
        java.util.Map<String, List<String>> m = new java.util.LinkedHashMap<>();
        m.put("/cluster/doc/update", Arrays.asList("search", "indices", "doc-diff", "browser"));
        m.put("/cluster/doc", Arrays.asList("search", "indices", "doc-diff", "browser"));
        m.put("/cluster/update-document", Arrays.asList("search", "indices", "doc-diff", "browser"));
        m.put("/cluster/update-partial", Arrays.asList("search", "indices", "doc-diff", "browser"));
        m.put("/cluster/delete-by-id", Arrays.asList("search", "indices"));
        m.put("/cluster/delete-by-query", Arrays.asList("search", "update-by-query"));
        m.put("/cluster/tasks/cancel", Arrays.asList("tasks", "task-tree"));
        m.put("/cluster/ilm/policy", java.util.Collections.singletonList("ilm"));
        m.put("/cluster/index-settings/update", Arrays.asList("index-settings", "indices", "optimizer"));
        m.put("/cluster/reload-analyzers", Arrays.asList("analysis-settings", "synonyms"));
        m.put("/cluster/reroute", Arrays.asList("cluster-settings", "diag"));
        m.put("/cluster/scripts/put", Arrays.asList("search-templates", "painless-lab"));
        m.put("/cluster/scripts/delete", Arrays.asList("search-templates", "painless-lab"));
        /* 护栏动作按动作归属页裁决：apply-index-settings 是 index-settings 页的保存出口；
           未登记的新动作在连接模型下一律拒绝（防未来动作回落角色门绕过页面写键）。 */
        m.put("/insight/actions/apply-index-settings", java.util.Collections.singletonList("index-settings"));
        SHARED_WRITE_PAGES = java.util.Collections.unmodifiableMap(m);
    }

    /** 最长片段匹配的共享写页面集合；无登记返回 null（调用方回落角色门）。 */
    static List<String> sharedWritePages(String path) {
        List<String> best = null;
        int bestLen = -1;
        for (java.util.Map.Entry<String, List<String>> e : SHARED_WRITE_PAGES.entrySet()) {
            if (path.contains(e.getKey()) && e.getKey().length() > bestLen) {
                best = e.getValue();
                bestLen = e.getKey().length();
            }
        }
        return best;
    }

    /** conn 模型下是否持有任一共享写端点的合法页面写键（权限面板 sharedWriteAllowed 用）。 */
    static boolean hasSharedWriteGrant(String targetId, java.util.Set<String> grantedPages) {
        if (targetId == null || targetId.isEmpty() || grantedPages == null) return false;
        for (List<String> pages : SHARED_WRITE_PAGES.values()) {
            for (String page : pages) {
                if (grantedPages.contains(EnvPagesResolver.CONN_KEY_PREFIX + targetId + ":w:" + page)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 矩阵参数（每个路径段的 {@code ;...}）：与 Spring UrlPathHelper.removeSemicolonContent 同口径。 */
    private static final Pattern MATRIX_PARAM = Pattern.compile(";[^/]*");

    private final EsConsoleAuthorizer authorizer;
    private final ConsoleOpsAuditStore opsAuditStore;
    private final io.github.dengmeiluan.es.rebuild.control.ControlClusterResolver resolver;
    private final ConsolePageCatalog pageCatalog;
    private final boolean pageAuthEnabled;
    /*  P2-4 v2：连接环境页面模板（env-pages profile）——纯 grantedPages 同构方案 */
    private final EnvPagesResolver envPagesResolver;
    /* 连接档案——审计的集群实名维度（connId → connName）；可为 null（测试桩） */
    private final io.github.dengmeiluan.es.rebuild.multicluster.ConnStore connStore;
    /** connName 解析失败 WARN 节流计数（实例级——拦截器产线单例）。 */
    private final AtomicLong lastConnNameWarnAt = new AtomicLong(0);
    /* 委托令牌首见登记（会话 LOGIN 审计去重）——LRU 封顶防长期运行膨胀；
       令牌即会话标识（宿主 会话期内令牌稳定，换发即新会话）。 */
    private final java.util.Map<String, Long> seenDelegateTokens =
            java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<String, Long>(16, 0.75f, false) {
                @Override
                protected boolean removeEldestEntry(java.util.Map.Entry<String, Long> eldest) {
                    return size() > 500;
                }
            });

    public ConsoleAuthInterceptor(EsConsoleAuthorizer authorizer, ConsoleOpsAuditStore opsAuditStore,
                                  io.github.dengmeiluan.es.rebuild.control.ControlClusterResolver resolver,
                                  ConsolePageCatalog pageCatalog, boolean pageAuthEnabled,
                                  EnvPagesResolver envPagesResolver,
                                  io.github.dengmeiluan.es.rebuild.multicluster.ConnStore connStore) {
        this.authorizer = authorizer;
        this.opsAuditStore = opsAuditStore;
        this.resolver = resolver;
        this.pageCatalog = pageCatalog;
        this.pageAuthEnabled = pageAuthEnabled;
        this.envPagesResolver = envPagesResolver;
        this.connStore = connStore;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 审计耗时起点（覆盖拒绝/放行全程）
        request.setAttribute(ATTR_START_MS, System.currentTimeMillis());
        // 授权判定一律走归一化路径：raw requestURI 直接匹配会被 ;矩阵参数 与 %编码 变形绕过
        // （pageOf 失配误判「共享端点」放行、/%72ebuild 逃 ADMIN 提档）
        String path = normalizePath(request);
        if (path == null) {
            // 畸形路径（非法 % 序列/UTF-8 解码失败/.. 越界）fail-closed：非授权事件，不落 PAGE_DENIED 审计
            deny(response, 400, "{\"code\":\"BAD_PATH\",\"message\":\"请求路径非法：无法解码或含非法 % 序列\"}");
            return false;
        }
        request.setAttribute(ATTR_NORMALIZED_PATH, path);
        //  SETUP 短路：未绑定控制集群时，除 setup 三端点外统一 409（前端据此弹首连向导）
        if (!resolver.bound()) {
            if ("/internal/es/index/setup/status".equals(path)
                    || "/internal/es/index/setup/test".equals(path)
                    || "/internal/es/index/setup/apply".equals(path)
                    || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
                return true;
            }
            deny(response, 409, "{\"code\":\"SETUP_REQUIRED\",\"message\":\"控制台尚未绑定控制集群\"}");
            return false;
        }
        if ("OPTIONS".equalsIgnoreCase(request.getMethod()) || isWhitelisted(path)) {
            return true;
        }
        ConsolePrincipal principal;
        try {
            principal = authorizer.authenticate(request);
        } catch (io.github.dengmeiluan.es.rebuild.control.SetupRequiredException e) {
            deny(response, 409, "{\"code\":\"SETUP_REQUIRED\",\"message\":\"控制台尚未绑定控制集群\"}");
            return false;
        } catch (Exception e) {
            // 已绑定但控制集群不可达：明确 503（绝不回落 SETUP，防拒绝服务骗出重绑向导）
            deny(response, 503, "{\"code\":\"CONTROL_CLUSTER_DOWN\",\"message\":\"控制集群不可达: "
                    + jsonEscape(e.getMessage()) + "\"}");
            return false;
        }
        if (principal == null) {
            deny(response, 401, "{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录 ES 控制台\"}");
            return false;
        }
        request.setAttribute(ATTR_PRINCIPAL, principal);
        /* 委托会话 LOGIN 审计——宿主 iframe 流没有控制台登录动作（历史 LOGIN
           事件全来自独立部署的内置登录），「正常登录的审计日志」在宿主形态下一直缺位。
           以宿主令牌首见为会话建立点落一笔 LOGIN（实名/角色/IP 全维；令牌换发=新会话再落）。
           GET 观测不审计的原则不破例——这是会话级事件，不是请求级观测。 */
        if (principal.isDelegated()) {
            String hostTok = request.getHeader("X-Es-Host-Token");
            if (hostTok != null && !hostTok.isEmpty()
                    && seenDelegateTokens.put(Integer.toHexString(hostTok.hashCode()),
                            System.currentTimeMillis()) == null) {
                opsAuditStore.record(auditEvent(principal, request, "-", "-",
                        "LOGIN", 200, "宿主委托会话建立"));
            }
        }
        // 2.5.0 菜单 SPI 页面门（先于角色门）：delegated 且宿主下发了白名单（含空集=全拒）时，
        // 页面专属端点必须在白名单内；共享端点（pageOf 返回 null）不吃页面级，维持角色档
        /* 2.5.0 页面门 × 连接写门(合并):delegated 且宿主下发 grantedPages 时,
           conn:{connId}:{page} 键按连接判定页面可见;conn 模型用户的读写判定即为最终裁决
           (写请求须 conn:{target}:w:{page} 写键),短路角色门——菜单授权即权限,无二次推导。
           静态 key(无 conn: 前缀)=全局页,对所有连接生效,仍受 env 模板收缩;无 conn 键=现状行为。 */
        if (pageAuthEnabled && principal.isDelegated() && principal.getGrantedPages() != null) {
            /* 超管域优先裁决：用户管理/重绑/连接档案是授权载体本身，任何连接写键都不放行；
               必须 ADMIN 角色；ADMIN 不受页面写键限制（全局管理权）。 */
            if (isSystemAdminUri(path)) {
                if (!principal.getRole().atLeast(ConsoleRole.ADMIN)) {
                    deny(response, 403, "{\"code\":\"FORBIDDEN\",\"message\":\"该操作属管理员专属（用户管理/连接档案/重绑），连接页面授权不放行\",\"required\":\"ADMIN\"}");
                    return false;
                }
                return true;
            }
            /* 超级管理员是全局权限：不受宿主页面白名单/连接写键限制（“有权限的人不能被门禁拖懒”）。
               非 ADMIN 仍严格走页面/连接写键门。 */
            if (principal.getRole().atLeast(ConsoleRole.ADMIN)) {
                return true;
            }
            String targetHeader = request.getHeader("X-Es-Target");
            /* host/缺省目标也必须参与连接模型写键裁决：conn 用户不该因「没带目标头」
               落到全局角色门，从而改写宿主集群。 */
            String targetId = targetHeader == null || targetHeader.trim().isEmpty()
                    ? "host" : targetHeader.trim();
            ConsolePageCatalog.Page page = pageCatalog.pageOf(path);
            java.util.Set<String> effectivePages = envPagesResolver.effectivePages(
                    targetId, principal.getGrantedPages());
            boolean writeReq = !"GET".equalsIgnoreCase(request.getMethod())
                    && !"OPTIONS".equalsIgnoreCase(request.getMethod())
                    && !isReadonlyPost(path);
            /* 空集=全拒：不得借无页面归属的共享写端点回落角色门（OPERATOR 也能写）。 */
            if (writeReq && principal.getGrantedPages().isEmpty()) {
                opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                        "WRITE_DENIED", 403, "pageGrants=empty target=" + targetId));
                deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"当前身份无任何页面授权，写操作一律拒绝\"}");
                return false;
            }
            /* 托管重建向导的「校验并继续」是 adhoc 流程内步骤：持 adhoc 写键即可调用
               config-lab/validate 的 dry-run，不要求再勾 config-validator 页（否则向导
               第 1 步永远无法前进）。校验器页自身的写键仍按原页面门裁决。 */
            if (writeReq && "/internal/es/index/config-lab/validate".equals(path)
                    && envPagesResolver.inConnModel(principal.getGrantedPages())
                    && envPagesResolver.writeAllowed(targetId, "adhoc-rebuild", principal.getGrantedPages())) {
                return true;
            }
            if (page != null) {
                if (!effectivePages.contains(page.getKey())) {
                    /* 页面不可见:拒绝事件显式落审计(:带目标集群/实名/来源 IP 维度) */
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "PAGE_DENIED", 403, "page=" + page.getKey()));
                    deny(response, 403, "{\"code\":\"FORBIDDEN\",\"page\":\"" + jsonEscape(page.getKey())
                            + "\",\"message\":\"暂无「" + jsonEscape(page.getName()) + "」功能权限,请联系管理员在宿主系统中授权\"}");
                    return false;
                }
                /* 连接模型:该连接的读写授权即最终裁决,跳过角色门 */
                if (envPagesResolver.inConnModel(principal.getGrantedPages())) {
                    if (writeReq && !envPagesResolver.writeAllowed(targetId, page.getKey(), principal.getGrantedPages())) {
                        opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                                "WRITE_DENIED", 403, "conn=" + targetId + " page=" + page.getKey()));
                        deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"page\":\"" + jsonEscape(page.getKey())
                                + "\",\"message\":\"暂无「" + jsonEscape(page.getName()) + "」的写权限,请联系管理员在宿主系统中授权\"}");
                        return false;
                    }
                    return true;
                }
            }
            /* 无页面归属的共享写端点：必须持有真实使用该端点的页面写键（共享端点被多页
               复用，不能按“任意写键”放行——optimizer 写键不应能删文档/改 ILM 策略）。
               未登记共享写回落角色门（保守）；已登记但无对应页写键直接 WRITE_DENIED。 */
            if (writeReq && envPagesResolver.inConnModel(principal.getGrantedPages())) {
                List<String> allowedPages = sharedWritePages(path);
                if (allowedPages == null && path.contains("/insight/actions/")) {
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "WRITE_DENIED", 403, "target=" + targetId + " unregisteredInsightAction"));
                    deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"该护栏动作未登记页面归属，连接模型下拒绝执行\"}");
                    return false;
                }
                if (allowedPages != null) {
                    for (String pageKey : allowedPages) {
                        if (envPagesResolver.writeAllowed(targetId, pageKey, principal.getGrantedPages())) {
                            return true;
                        }
                    }
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "WRITE_DENIED", 403, "conn=" + targetId + " sharedPages=" + String.join(",", allowedPages)));
                    deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"暂无该共享写端点的页面写权限（需 "
                            + jsonEscape(String.join("/", allowedPages)) + " 之一），请联系管理员授权\"}");
                    return false;
                }
            } else if (writeReq) {
                /* 静态页白名单（无 conn 键）：共享写端点至少要能看到一个归属页，
                   否则「只授 overview」的 OPERATOR 仍可直调文档写。写档仍由角色门兜底。 */
                List<String> allowedPages = sharedWritePages(path);
                if (allowedPages != null) {
                    boolean visible = false;
                    for (String pageKey : allowedPages) {
                        if (effectivePages.contains(pageKey)) { visible = true; break; }
                    }
                    if (!visible) {
                        opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                                "WRITE_DENIED", 403, "target=" + targetId + " sharedPages=" + String.join(",", allowedPages)));
                        deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"暂无该共享写端点归属页面的访问权限（需 "
                                + jsonEscape(String.join("/", allowedPages)) + " 之一），请联系管理员授权\"}");
                        return false;
                    }
                }
            }
        }
        ConsoleRole required = requiredRole(request.getMethod(), path);
        if (!principal.getRole().atLeast(required)) {
            deny(response, 403, "{\"code\":\"FORBIDDEN\",\"message\":\"权限不足，需要 " + required.name()
                    + " 角色\",\"required\":\"" + required.name() + "\"}");
            return false;
        }
        return true;
    }

    /** 命中执行类清单的只读 POST 落 EXEC 审计（谁在哪个集群执行了脚本/预估）。 */
    private void recordExecAuditIfNeeded(HttpServletRequest request, String uri) {
        boolean isExec = false;
        for (String kw : EXEC_AUDIT_POST_KEYWORDS) {
            if (uri.contains(kw)) { isExec = true; break; }
        }
        if (!isExec) return;
        Object p = request.getAttribute(ATTR_PRINCIPAL);
        if (!(p instanceof ConsolePrincipal)) return;
        opsAuditStore.record(auditEvent((ConsolePrincipal) p, request, request.getMethod(), uri, "EXEC", 200, null));
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // 只审计写操作（GET 观测太密，无回溯价值）
        if ("GET".equalsIgnoreCase(request.getMethod()) || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return;
        }
        String uri = stripContextPath(request);
        // 归一化路径优先（preHandle 已 canonicalize）——避免 /cluster/sql/../raw 之流在审计口径露出裸形；
        // 测试直调 afterCompletion（无 preHandle）时 attr 缺失，回落 raw 剥 context 口径
        Object normalizedPath = request.getAttribute(ATTR_NORMALIZED_PATH);
        if (normalizedPath instanceof String) {
            uri = (String) normalizedPath;
        }
        // -C1：只读查询类 POST（含 /probe 探活）与 GET 同策略，不算 WRITE
        if (isReadonlyPost(uri)) {
            /* ·可审计补全：执行类只读 POST（painless 脚本执行/analyze 分词验证/
               reindex 预估/config-lab dry-run）零数据写入但执行脚本或消耗集群资源——落 EXEC
               审计留痕（谁在哪个集群跑了什么），其余只读查询维持零噪音。 */
            recordExecAuditIfNeeded(request, uri);
            return;
        }
        Object p = request.getAttribute(ATTR_PRINCIPAL);
        if (!(p instanceof ConsolePrincipal)) {
            return;
        }
        ConsolePrincipal principal = (ConsolePrincipal) p;
        String action = isAdminUri(uri) ? "HIGH_RISK" : "WRITE";
        String qs = request.getQueryString();
        /* 高危 raw 透传的法证摘要（端点回填）——detail 从空到「raw=GET /_cat/indices」 */
        String detail = null;
        Object rawSummary = request.getAttribute(ATTR_RAW_SUMMARY);
        if (rawSummary instanceof String && !((String) rawSummary).isEmpty()) {
            detail = "raw=" + rawSummary;
        }
        if (ex != null && ex.getMessage() != null) {
            detail = detail == null ? "err=" + ex.getMessage() : detail + " err=" + ex.getMessage();
        }
        opsAuditStore.record(auditEvent(principal, request, request.getMethod(),
                qs == null ? uri : uri + "?" + qs, action, response.getStatus(), detail));
    }

    /**
     * 审计事件组装（目标集群（connId/connName）+来源 IP+耗时三维采集单点。
     * connId 取 X-Es-Target（"host"/空=无连接上下文→null）；connName 经 ConnStore 实名，
     * 查不到留 null；耗时覆盖拒绝（preHandle 记录点）与写完成（afterCompletion）两路。
     */
    private ConsoleOpsAuditEvent auditEvent(ConsolePrincipal principal, HttpServletRequest request,
                                            String method, String uri, String action, int httpStatus,
                                            String detail) {
        String targetId = request.getHeader("X-Es-Target");
        boolean targetIsConn = targetId != null && !targetId.isEmpty() && !"host".equalsIgnoreCase(targetId.trim());
        String connName = null;
        if (targetIsConn && connStore != null) {
            try {
                connName = connStore.getName(targetId.trim());
            } catch (Exception e) {
                /* 连接档案瞬态不可用：审计维度尽力而为，绝不反噬；
                   补节流 WARN——connName 恒 null 会让审计集群列失真且此前零痕 */
                long now = System.currentTimeMillis();
                long last = lastConnNameWarnAt.get();
                if (now - last > WARN_THROTTLE_MS && lastConnNameWarnAt.compareAndSet(last, now)) {
                    LOG.warn("[ConsoleAuthInterceptor] 审计集群实名解析失败 connId={}（审计 connName 留空，"
                            + "{}s 内不再重复告警）: {}", targetId.trim(), WARN_THROTTLE_MS / 1000, e.getMessage(), e);
                }
            }
        }
        Object start = request.getAttribute(ATTR_START_MS);
        Long costMs = start instanceof Long ? System.currentTimeMillis() - (Long) start : null;
        return ConsoleOpsAuditEvent.builder()
                .username(principal.getUsername())
                .displayName(principal.getDisplayName())
                .role(principal.getRole().name())
                .method(method)
                .uri(uri)
                .action(action)
                .httpStatus(httpStatus)
                .detail(detail)
                .connId(targetIsConn ? targetId.trim() : null)
                .connName(connName)
                .ip(clientIp(request))
                .costMs(costMs)
                .build();
    }

    /** 来源地址：反向代理链取 X-Forwarded-For 首跳 → X-Real-IP → remoteAddr。 */
    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.trim().isEmpty()) {
            String first = xff.split(",")[0].trim();
            if (!first.isEmpty()) {
                return first;
            }
        }
        String real = request.getHeader("X-Real-IP");
        if (real != null && !real.trim().isEmpty()) {
            return real.trim();
        }
        return request.getRemoteAddr();
    }

    /** URI + 方法 → 所需最低角色。 */
    static ConsoleRole requiredRole(String method, String uri) {
        // 探活是只读观测（POST 但零副作用），从 /clusters/ 高危清单中豁免给 VIEWER
        if (uri.contains("/clusters/") && uri.endsWith("/probe")) {
            return ConsoleRole.VIEWER;
        }
        /* w66:多域判定 — 按命中顺序取最高要求(超管域>专项域)。
         * ADMIN(rank 4)自然涵盖所有专项(rank 3);专项之间互不覆盖。 */
        if (isAdminUri(uri)) {
            return ConsoleRole.ADMIN;
        }
        /* 自助流水「只看自己」给全角色——username 由服务端身份强制（见 controller），
           须在 AUDIT_KEYWORDS(/auth/ops-audit 前缀包含)命中前特例，否则被提 rank3 */
        if (uri.endsWith("/auth/ops-audit/mine")) {
            return ConsoleRole.VIEWER;
        }
        if (containsAny(uri, REBUILD_KEYWORDS) || containsAny(uri, CLUSTER_KEYWORDS)
                || containsAny(uri, AUDIT_KEYWORDS)) {
            return ConsoleRole.REBUILD_OP; /* 三个专项同 rank,任一命中都返回 rank3;
                                              atLeast 判定保证 CLUSTER_OP/AUDIT_OP 也能过 */
        }
        if ("GET".equalsIgnoreCase(method)) {
            return ConsoleRole.VIEWER;
        }
        // -C1：只读查询类 POST 与 GET 同权——UI 承诺「VIEWER 仅查询观测」，查询却要 OPERATOR 是自相矛盾
        if (isReadonlyPost(uri)) {
            return ConsoleRole.VIEWER;
        }
        // auth 自助端点：登录后任何角色都能看自己/改自己密码
        if (uri.endsWith("/auth/me") || uri.endsWith("/auth/change-password") || uri.endsWith("/auth/logout")) {
            return ConsoleRole.VIEWER;
        }
        return ConsoleRole.OPERATOR;
    }

    /**
     * 授权判定专用路径归一化：剥 contextPath → 剥 servletPath → %XX 单趟解码（UTF-8）→ 去每段矩阵参数
     * → canonicalize（折叠 {@code .}/{@code ..} 与重复斜杠）。
     *
     * <p><b>先解码后剥矩阵参数</b>：{@code %3B}（编码分号）经容器解码 + Spring removeSemicolonContent
     * 后照样路由到 controller，顺序反过来会让 {@code /cluster/bulk%3Bx=y} 漏出页面门。</p>
     *
     * <p><b>canonicalize 必须在解码之后</b>：{@code %2e%2e} 解码后才是 {@code ..}；同时拒绝反斜杠与
     * NUL（Tomcat 之外容器的路径分隔歧义），{@code ..} 越过根直接 fail-closed。
     * 白名单/高危清单/页面归属全部使用归一化结果，{@code /auth/login/../users/upsert} 不再能
     * 借白名单 contains 短路。</p>
     *
     * <p>归一化只会让变形路径被正确识别（单调变严），不会让原本拒绝的变放行。</p>
     *
     * @return 归一化路径；非法 % 序列 / UTF-8 解码失败 / 反斜杠 / NUL / {@code ..} 越界返回
     *         {@code null}（调用方必须 fail-closed）
     */
    static String normalizePath(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path == null) {
            return null;
        }
        String ctx = request.getContextPath();
        if (ctx != null && !ctx.isEmpty() && path.startsWith(ctx)) {
            path = path.substring(ctx.length());
        }
        // 宿主配 spring.mvc.servlet.path 时 DispatcherServlet 前缀必须剥掉，否则页面门整体静默失效。
        // 但判据必须是 pathInfo 非 null：仅前缀映射（/api/*）时容器才拆出 pathInfo；
        // Tomcat 默认映射（/）下 getServletPath() 返回完整请求路径且 pathInfo=null，
        // 此时剥离会吞掉整条路径（377fed0 真机事故：归一化恒为 "" → 白名单失效 → 全端点 401）
        String servletPath = request.getServletPath();
        if (servletPath != null && !servletPath.isEmpty() && !"/".equals(servletPath)
                && request.getPathInfo() != null && path.startsWith(servletPath)) {
            path = path.substring(servletPath.length());
        }
        path = percentDecode(path);
        if (path == null) {
            return null;
        }
        return canonicalizePath(MATRIX_PARAM.matcher(path).replaceAll(""));
    }

    /**
     * 路径 canonicalize（fail-closed）：拒绝 {@code \} 与 NUL；按 {@code /} 分段丢弃空段与 {@code .}，
     * {@code ..} 弹栈（栈空=越过根，返回 null）；重建为以 {@code /} 开头、段间单斜杠、无尾部斜杠的路径。
     * 根路径返回 {@code /}。
     */
    static String canonicalizePath(String path) {
        if (path == null || path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) {
            return null;
        }
        java.util.ArrayDeque<String> segments = new java.util.ArrayDeque<>();
        int start = 0;
        int len = path.length();
        while (start <= len) {
            int slash = path.indexOf('/', start);
            int end = slash < 0 ? len : slash;
            String segment = path.substring(start, end);
            if (segment.isEmpty() || ".".equals(segment)) {
                // 空段（//）与 . 直接丢弃
            } else if ("..".equals(segment)) {
                if (segments.isEmpty()) {
                    return null; // 越过根：拒绝（不回绕到根，防白名单/页面门被归一化制造命中）
                }
                segments.removeLast();
            } else {
                segments.addLast(segment);
            }
            if (slash < 0) {
                break;
            }
            start = slash + 1;
        }
        StringBuilder sb = new StringBuilder(path.length());
        for (String segment : segments) {
            sb.append('/').append(segment);
        }
        return sb.length() == 0 ? "/" : sb.toString();
    }

    /**
     * 单趟 %XX 解码（路径语义：{@code +} 是字面量不是表单空格，故不用 URLDecoder）。
     * 连续 %XX 聚合成字节段按 UTF-8 严格解码（多字节字符横跨多个 %XX）；非法序列/解码失败返回 null。
     */
    private static String percentDecode(String s) {
        if (s.indexOf('%') < 0) {
            return s;
        }
        StringBuilder out = new StringBuilder(s.length());
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(16);
        int i = 0;
        int len = s.length();
        while (i < len) {
            char c = s.charAt(i);
            if (c == '%') {
                bytes.reset();
                while (i < len && s.charAt(i) == '%') {
                    if (i + 2 >= len) {
                        return null; // 孤立 % 尾
                    }
                    int hi = Character.digit(s.charAt(i + 1), 16);
                    int lo = Character.digit(s.charAt(i + 2), 16);
                    if (hi < 0 || lo < 0) {
                        return null; // 非法 % 序列
                    }
                    bytes.write((hi << 4) | lo);
                    i += 3;
                }
                String decoded = decodeUtf8Strict(bytes.toByteArray());
                if (decoded == null) {
                    return null;
                }
                out.append(decoded);
            } else {
                out.append(c);
                i++;
            }
        }
        return out.toString();
    }

    /** UTF-8 严格解码：malformed/不可映射输入返回 null（不作 U+FFFD 替换放行）。 */
    private static String decodeUtf8Strict(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            return null;
        }
    }

    /** -C1：审计 URI 统一剥 servlet context（宿主部署在 /宿主 时与登录记录口径一致）。 */
    private static String stripContextPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String ctx = request.getContextPath();
        if (ctx != null && !ctx.isEmpty() && uri.startsWith(ctx)) {
            return uri.substring(ctx.length());
        }
        return uri;
    }

    /** 只读 POST 判定（清单 contains + 三个精确尾缀）。 */
    static boolean isReadonlyPost(String uri) {
        for (String kw : READONLY_POST_KEYWORDS) {
            if (uri.contains(kw)) {
                return true;
            }
        }
        return uri.endsWith("/index/query") || uri.endsWith("/index/system-query") || uri.endsWith("/probe");
    }

    private static boolean containsAny(String uri, List<String> keywords) {
        for (String kw : keywords) {
            if (uri.contains(kw)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isAdminUri(String uri) {
        for (String kw : ADMIN_KEYWORDS) {
            if (uri.contains(kw)) {
                return true;
            }
        }
        return false;
    }

    /** 白名单精确匹配（不再 endsWith/contains——{@code /auth/login/../users/upsert} 曾借此短路鉴权）。 */
    static boolean isWhitelisted(String uri) {
        if (uri == null) {
            return false;
        }
        for (String w : WHITELIST) {
            if (uri.equals(w)) {
                return true;
            }
        }
        return false;
    }

    private static void deny(HttpServletResponse response, int status, String body) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
    }

    private static String jsonEscape(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ");
    }
}
