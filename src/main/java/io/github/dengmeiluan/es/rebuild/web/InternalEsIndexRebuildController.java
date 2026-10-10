package io.github.dengmeiluan.es.rebuild.web;

import io.github.dengmeiluan.es.rebuild.core.EsIndexRebuildService;
import io.github.dengmeiluan.es.rebuild.core.ReindexProgress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * (内部) ES 索引控制台运维接口。
 *
 * <p> 阶段⑤：SPI 驱动的重建端点（first-migrate / rebuild / finish / full-reload /
 * cleanup / abort / jobs / lock-release / diagnostics）已整体退役，重建改由
 * {@code adhoc} 路径按索引名执行。本类保留索引诊断、巡检查询与集群级只读能力。</p>
 *
 * <p>由 {@code es.rebuild.web-enabled=false} 可整体关闭本接口与静态面板。</p>
 *
 * @author aicoding
 **/
@RestController
@RequestMapping("internal/es/index")
public class InternalEsIndexRebuildController {

    private static final Logger log = LoggerFactory.getLogger(InternalEsIndexRebuildController.class);

    private final EsIndexRebuildService esIndexRebuildService;
    private final io.github.dengmeiluan.es.rebuild.core.EsIndexAdmin esIndexAdmin;

    public InternalEsIndexRebuildController(EsIndexRebuildService esIndexRebuildService,
                                            io.github.dengmeiluan.es.rebuild.core.EsIndexAdmin esIndexAdmin) {
        this.esIndexRebuildService = esIndexRebuildService;
        this.esIndexAdmin = esIndexAdmin;
    }

    /**
     * 列出已登记的可重建索引 indexKey。
     */
    @GetMapping("keys")
    public List<String> listIndexKeys() {
        return esIndexRebuildService.listIndexKeys();
    }

    /**
     * 全局总览：一次返回所有已登记 indexKey 的 status 摘要 + 本实例 owner。
     * 前端 hero 一次拉完、少 N 次 RTT。
     */
    @GetMapping("overview")
    public Map<String, Object> overview() {
        return esIndexRebuildService.overview();
    }

    /**
     * 健康度仪表（C7）：动态运行时关键风险快照——锁汇总（本持/他持/过期）。
     * 前端按需刷新。
     */
    @GetMapping("health")
    public Map<String, Object> health() {
        return esIndexRebuildService.health();
    }

    /** Q1: 索引详情快照（mapping/settings/docCount/aliases/sample N 条文档）。 */
    @GetMapping("inspect")
    public Map<String, Object> inspect(@RequestParam String indexKey,
                                       @RequestParam(required = false, defaultValue = "5") int sampleSize) throws IOException {
        return esIndexRebuildService.inspect(indexKey, sampleSize);
    }

    /** Q1: starter 自家系统索引详情（ 阶段⑤后仅剩 lock；job / audit 已随 SPI 重建路径退役）。闸门见 {@link EsIndexRebuildService#inspectSystem}。 */
    @GetMapping("system-inspect")
    public Map<String, Object> systemInspect(@RequestParam String which) throws IOException {
        return esIndexRebuildService.inspectSystem(which);
    }

    /** Q1: 自由 query DSL（运维调试）。 */
    @PostMapping("query")
    public Map<String, Object> queryDsl(@RequestParam String indexKey,
                                        @RequestParam(required = false, defaultValue = "10") int size,
                                        @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws IOException {
        return esIndexRebuildService.queryDsl(indexKey, dslJson, size);
    }

    /** 系统索引 Query DSL（ 阶段⑤后 which 仅接受 lock，其余值 400）。闸门见 {@link EsIndexRebuildService#querySystem}。 */
    @PostMapping("system-query")
    public Map<String, Object> systemQuery(@RequestParam String which,
                                           @RequestParam(required = false, defaultValue = "10") int size,
                                           @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws IOException {
        return esIndexRebuildService.querySystem(which, dslJson, size);
    }

    /** 空索引重建/清空数据：基于 provider 配置重建空索引 → alias swap → 删旧。 */
    @PostMapping("rebuild-empty")
    public Map<String, Object> rebuildEmpty(@RequestParam String indexKey) throws IOException {
        return esIndexRebuildService.rebuildEmpty(indexKey);
    }

    /** Force merge 合并 segment。 */
    @PostMapping("force-merge")
    public Map<String, Object> forceMerge(@RequestParam String indexKey,
                           @RequestParam(required = false, defaultValue = "1") int maxSegments) throws IOException {
        Map<String, Object> r = esIndexRebuildService.forceMerge(indexKey, maxSegments);
        r.put("ok", true);
        return r;
    }

    /** 热更新副本数。 */
    @PostMapping("replicas")
    public void updateReplicas(@RequestParam String indexKey,
                               @RequestParam int count) throws IOException {
        esIndexRebuildService.updateReplicas(indexKey, count);
    }

    /**
     * 查看索引/别名当前状态（用于零停机验证与排障）。
     */
    @GetMapping("status")
    public Map<String, Object> status(@RequestParam String indexKey) throws IOException {
        return esIndexRebuildService.status(indexKey);
    }

    /**
     * 查询 reindex 异步任务进度。
     *
     * @param taskId reindex 任务 id（nodeId:taskNum）
     */
    @GetMapping("progress")
    public ReindexProgress progress(@RequestParam String taskId) throws IOException {
        return esIndexRebuildService.progress(taskId);
    }

    // ═══ 集群级只读查询（不限于 provider 注册的索引）═══

    /** 列出集群全部索引（排除系统索引）。 */
    @GetMapping("cluster/indices")
    public java.util.List<Map<String, Object>> clusterIndices() throws java.io.IOException {
        return esIndexAdmin.listClusterIndices();
    }

    /** 集群级任意索引 inspect（只读）。自动解析 indexKey→alias。 */
    @GetMapping("cluster/inspect")
    public Map<String, Object> clusterInspect(@RequestParam String index,
                                              @RequestParam(required = false, defaultValue = "5") int sampleSize) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.inspect(resolved, Math.max(0, Math.min(sampleSize, 50)));
    }

    /**
     * 采样 date 字段的实际存储形态（只读）。
     *
     * <p>响应带 {@code sampling} 说明取样口径——前端必须一并展示：一份不说明自己怎么取样的
     * 报告，读者会默认它是随机的。</p>
     */
    @GetMapping("cluster/date-forms")
    public Map<String, Object> dateForms(@RequestParam("index") String index,
                                         @RequestParam(value = "size", defaultValue = "50") int size)
            throws java.io.IOException {
        return esIndexRebuildService.dateForms(index, size);
    }

    /** 集群级任意索引 Query DSL（只读）。自动解析 indexKey→alias。 */
    @PostMapping("cluster/query")
    public Map<String, Object> clusterQuery(@RequestParam String index,
                                            @RequestParam(required = false, defaultValue = "10") int size,
                                            @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.queryDsl(resolved, dslJson, Math.max(0, Math.min(size, 100)));
    }

    /** ES SQL 查询（集群级，只读）。body 为裸 SQL 文本。自动解析 indexKey→物理索引名。 */
    @PostMapping(value = "cluster/sql", consumes = {"text/plain", "application/json"})
    public Map<String, Object> clusterSql(@org.springframework.web.bind.annotation.RequestBody String sql) throws java.io.IOException {
        if (sql == null || sql.trim().isEmpty()) {
            throw new IllegalArgumentException("SQL 不能为空");
        }
        String cleaned = sql.trim();
        if (cleaned.startsWith("\"") && cleaned.endsWith("\"")) {
            cleaned = cleaned.substring(1, cleaned.length() - 1);
        }
        cleaned = resolveFromInSql(cleaned);
        return esIndexAdmin.executeSql(cleaned, 100);
    }

    private String resolveFromInSql(String sql) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(?i)\\bFROM\\s+\"?([\\w\\-.*]+)\"?")
                .matcher(sql);
        if (!m.find()) return sql;
        String tableName = m.group(1);
        String physical = esIndexRebuildService.resolveToPhysical(tableName);
        if (physical.contains("-") || physical.contains("*")) {
            return sql.substring(0, m.start(1) - (sql.charAt(m.start(1)-1)=='"'?1:0))
                    + "\"" + physical + "\""
                    + sql.substring(m.end(1) + (m.end(1)<sql.length() && sql.charAt(m.end(1))=='"'?1:0));
        }
        return sql.substring(0, m.start(1)) + physical + sql.substring(m.end(1));
    }

    // ═══ 集群健康 ═══

    @GetMapping("cluster/health")
    public Map<String, Object> clusterHealth() throws java.io.IOException {
        return esIndexAdmin.clusterHealth();
    }

    // ═══ 文档操作（需要 resolve indexKey） ═══

    @PostMapping("cluster/delete-by-id")
    public Map<String, Object> deleteById(@RequestParam String index, @RequestParam String id) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.deleteById(resolved, id);
    }

    /**
     * 全量覆盖写入单个文档（运维修正脏数据）。body 为完整 _source JSON（整体替换，非字段级合并）。
     * 自动解析 indexKey→alias/物理索引。
     */
    @PostMapping("cluster/update-document")
    public Map<String, Object> updateDocument(@RequestParam String index, @RequestParam String id,
                                              @org.springframework.web.bind.annotation.RequestBody String docJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.updateDocument(resolved, id, docJson);
    }

    // ═══ 索引设置热更新 ═══

    @PostMapping("cluster/update-settings")
    public Map<String, Object> updateSettings(@RequestParam String index,
                                              @org.springframework.web.bind.annotation.RequestBody String settingsJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        @SuppressWarnings("unchecked")
        Map<String, Object> settings = new com.fasterxml.jackson.databind.ObjectMapper().readValue(settingsJson, Map.class);
        return esIndexAdmin.updateSettingsDynamic(resolved, settings);
    }

    // ═══ Mapping 字段管理（PUT _mapping） ═══

    /**
     * 向已有索引添加字段 mapping。ES 仅允许新增字段，不支持删除或修改已有字段类型。
     * body 为 mapping JSON，如 {"properties":{"new_field":{"type":"keyword"}}}
     */
    @PostMapping("cluster/put-mapping")
    public Map<String, Object> putMapping(@RequestParam String index,
                                           @org.springframework.web.bind.annotation.RequestBody String mappingJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.putMapping(resolved, mappingJson);
    }

    /** 手动创建索引（带 settings + mapping），供迁移前先建好目标索引。body: {"settings":"...","mapping":"..."} */
    @PostMapping("cluster/create-index")
    public Map<String, Object> createIndex(@RequestParam String index,
                                           @org.springframework.web.bind.annotation.RequestBody(required = false) Map<String, String> body) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        if (esIndexAdmin.indexExists(resolved)) {
            /* 200-with-{error:true,message} 错误体补 code+endpoint（additive，
               EsErrorMapper.body 口径）——error:true 既有键保留（前端 api.ts 200-with-error
               分支零破坏），code 供前端精确分流，endpoint 定位失败端点 */
            return EsErrorMapper.body("INDEX_EXISTS", "索引已存在: " + resolved, EsErrorMapper.endpointOf(currentRequest()));
        }
        String settingsJson = body != null ? body.get("settings") : null;
        String mappingJson = body != null ? body.get("mapping") : null;
        esIndexAdmin.createIndex(resolved, settingsJson, mappingJson);
        Map<String, Object> r = new java.util.LinkedHashMap<>();
        r.put("ok", true);
        r.put("index", resolved);
        return r;
    }

    /** 手动删除索引（高危，不可恢复）。 */
    @PostMapping("cluster/delete-index")
    public Map<String, Object> deleteIndex(@RequestParam String index) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        if (!esIndexAdmin.indexExists(resolved)) {
            /* 错误体补 code+endpoint（additive，EsErrorMapper.body 口径，同 create-index 注） */
            return EsErrorMapper.body("INDEX_NOT_FOUND", "索引不存在: " + resolved, EsErrorMapper.endpointOf(currentRequest()));
        }
        esIndexAdmin.deleteIndex(resolved);
        Map<String, Object> r = new java.util.LinkedHashMap<>();
        r.put("ok", true);
        r.put("index", resolved);
        return r;
    }

    /**
     * 对任意集群索引/别名执行 force_merge（受管索引走上面的 force-merge?indexKey=）。
     * 重操作：重写段文件、大量 IO、期间搜索延迟升高；不要对仍在写入的索引执行。
     * 合并出的大于 5GB 的单段不再参与后续 merge，大索引不应盲目合到 1 段。
     */
    @PostMapping("cluster/force-merge")
    public Map<String, Object> clusterForceMerge(@RequestParam String index,
                                                 @RequestParam(required = false, defaultValue = "1") int maxSegments) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        Map<String, Object> r = new java.util.LinkedHashMap<>();
        if (!esIndexAdmin.indexExists(resolved)) {
            /* 错误体补 code+endpoint（additive，EsErrorMapper.body 口径，同 create-index 注） */
            return EsErrorMapper.body("INDEX_NOT_FOUND", "索引不存在: " + resolved, EsErrorMapper.endpointOf(currentRequest()));
        }
        if (maxSegments < 1) {
            return EsErrorMapper.body("BAD_REQUEST", "maxSegments 必须大于等于 1，当前: " + maxSegments,
                    EsErrorMapper.endpointOf(currentRequest()));
        }
        Map<String, Object> fm = esIndexAdmin.forceMerge(resolved, maxSegments);
        r.put("ok", true);
        r.put("index", resolved);
        r.put("maxSegments", maxSegments);
        r.put("taskId", fm.get("task"));
        return r;
    }

    // ═══ : Query Profiler / Count 预估 / REST Playground / 部分更新 ═══

    /** Profile 查询：注入 profile:true 执行 _search，返回完整原始响应（含 profile breakdown）。 */
    @PostMapping(value = "cluster/profile", produces = "application/json")
    public String clusterProfile(@RequestParam String index,
                                 @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.profile(resolved, dslJson);
    }

    /** dry-run 计数：提取 dsl.query 执行 _count（删除预估等高危操作前置）。 */
    @PostMapping("cluster/count")
    public Map<String, Object> clusterCount(@RequestParam String index,
                                            @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.count(resolved, dslJson);
    }

    /** REST Playground：透传任意 ES REST 调用（method 白名单 + path 校验）。body: {method, path, body}
     *  执行摘要回填 request attribute（拦截器 afterCompletion 落入 HIGH_RISK detail）——
     *  高危操作审计从「谁调过 raw」到「谁执行了什么」。 */
    @PostMapping("cluster/raw")
    public Map<String, Object> clusterRaw(@org.springframework.web.bind.annotation.RequestBody Map<String, String> req) throws IOException {
        try {
            org.springframework.web.context.request.RequestAttributes ra =
                    org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (ra != null) {
                ra.setAttribute(io.github.dengmeiluan.es.rebuild.auth.ConsoleAuthInterceptor.ATTR_RAW_SUMMARY,
                        req.get("method") + " " + req.get("path"),
                        org.springframework.web.context.request.RequestAttributes.SCOPE_REQUEST);
            }
        } catch (Exception e) {
            // 原 catch(Exception ignore) 整段静默——本次高危审计将缺执行摘要
            // 且无痕（审计链断点）。低频用户路径直接 WARN 不节流；回填失败不影响执行契约不变
            log.warn("[es-console-raw] 审计摘要回填失败(本次高危审计缺执行摘要): {}", e.getMessage());
        }
        return esIndexAdmin.raw(req.get("method"), req.get("path"), req.get("body"));
    }

    /** 字段级部分更新：body 为 {"field":val,...}（_update partial doc，非整体覆盖）。 */
    @PostMapping("cluster/update-partial")
    public Map<String, Object> updatePartial(@RequestParam String index, @RequestParam String id,
                                             @org.springframework.web.bind.annotation.RequestBody String partialDocJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.updatePartial(resolved, id, partialDocJson);
    }

    // ═══ : 集群运维观测端点（tasks/allocation/hot_threads/pending/nodes_stats/analyze/aliases） ═══

    /** 列出集群当前运行中的任务（_tasks）。actions 可用、寒开列过滤 */
    @GetMapping("cluster/tasks")
    public java.util.List<Map<String, Object>> clusterTasks(@RequestParam(required = false) String actions,
                                                            @RequestParam(required = false, defaultValue = "true") boolean detailed) throws java.io.IOException {
        return esIndexAdmin.listTasks(actions, detailed);
    }

    /** 取消集群任务（仅对 cancellable=true 生效） */
    @PostMapping("cluster/tasks/cancel")
    public Map<String, Object> clusterCancelTask(@RequestParam String taskId) throws java.io.IOException {
        return esIndexAdmin.cancelTask(taskId);
    }

    /** 分片分配诊断。body 可选 {index,shard,primary}；为空则按 unassigned 自选 */
    @PostMapping("cluster/allocation-explain")
    public Map<String, Object> clusterAllocationExplain(@org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.allocationExplain(body);
    }

    /** 热点线程（纯文本，可选 nodeId 过滤单节点） */
    @GetMapping(value = "cluster/hot-threads", produces = "text/plain;charset=UTF-8")
    public String clusterHotThreads(@RequestParam(required = false, defaultValue = "3") int threads,
                                    @RequestParam(required = false, defaultValue = "500ms") String interval,
                                    @RequestParam(required = false, defaultValue = "cpu") String type,
                                    @RequestParam(required = false) String nodeId) throws java.io.IOException {
        return esIndexAdmin.hotThreads(Math.max(1, Math.min(threads, 10)), interval, type, nodeId);
    }

    /** Master 待处理任务 */
    @GetMapping("cluster/pending-tasks")
    public Map<String, Object> clusterPendingTasks() throws java.io.IOException {
        return esIndexAdmin.pendingTasks();
    }

    /** 节点运行时 stats（jvm/fs/os/thread_pool） */
    @GetMapping("cluster/nodes-stats")
    public java.util.List<Map<String, Object>> clusterNodesStats() throws java.io.IOException {
        return esIndexAdmin.nodesStats();
    }

    /** 分词器测试。index 可空或 _analyze 走全局；body 为自由 _analyze DSL */
    @PostMapping("cluster/analyze")
    public Map<String, Object> clusterAnalyze(@RequestParam(required = false) String index,
                                              @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        String resolved = (index == null || index.isEmpty()) ? null : esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.analyze(resolved, body);
    }

    /** 别名全图（排除系统索引，扁平列表） */
    @GetMapping("cluster/aliases")
    public java.util.List<Map<String, Object>> clusterAliases() throws java.io.IOException {
        return esIndexAdmin.listAllAliases();
    }

    // ═══ : 平台/分布式能力端点（templates / snapshot / shards distribution） ═══

    /** 列出索引模板 + 组件模板并集 */
    @GetMapping("cluster/templates")
    public Map<String, Object> clusterTemplates() throws java.io.IOException {
        return esIndexAdmin.listTemplates();
    }

    /** 创建/更新模板。kind 取值 index|component；body 为完整的模板 JSON */
    @PostMapping("cluster/templates/put")
    public Map<String, Object> clusterPutTemplate(@RequestParam String name,
                                                  @RequestParam(defaultValue = "index") String kind,
                                                  @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.putTemplate(kind, name, body);
    }

    /** 删除模板 */
    @PostMapping("cluster/templates/delete")
    public Map<String, Object> clusterDeleteTemplate(@RequestParam String name,
                                                     @RequestParam(defaultValue = "index") String kind) throws java.io.IOException {
        return esIndexAdmin.deleteTemplate(kind, name);
    }

    /** Snapshot repositories 列表 */
    @GetMapping("cluster/snapshot/repos")
    public java.util.List<Map<String, Object>> clusterSnapshotRepos() throws java.io.IOException {
        return esIndexAdmin.listSnapshotRepositories();
    }

    /** 指定 repo 下快照列表 */
    @GetMapping("cluster/snapshot/list")
    public java.util.List<Map<String, Object>> clusterSnapshotList(@RequestParam String repo) throws java.io.IOException {
        return esIndexAdmin.listSnapshots(repo);
    }

    /** 创建快照（非阻塞）。body 可传 indices/include_global_state/partial 等 */
    @PostMapping("cluster/snapshot/create")
    public Map<String, Object> clusterCreateSnapshot(@RequestParam String repo,
                                                     @RequestParam String name,
                                                     @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.createSnapshot(repo, name, body);
    }

    /** 恢复快照（非阻塞）。body 可传 indices/rename_pattern/rename_replacement/include_global_state 等 */
    @PostMapping("cluster/snapshot/restore")
    public Map<String, Object> clusterRestoreSnapshot(@RequestParam String repo,
                                                      @RequestParam String name,
                                                      @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.restoreSnapshot(repo, name, body);
    }

    /** 删除快照（过期快照清理） */
    @DeleteMapping("cluster/snapshot/delete")
    public Map<String, Object> clusterDeleteSnapshot(@RequestParam String repo,
                                                     @RequestParam String name) throws java.io.IOException {
        return esIndexAdmin.deleteSnapshot(repo, name);
    }

    /** 分片分布（_cat/shards）结构化 */
    @GetMapping("cluster/shards")
    public java.util.List<Map<String, Object>> clusterShards(@RequestParam(required = false) String index) throws java.io.IOException {
        return esIndexAdmin.shardsDistribution(index);
    }

    /* ================= : 搜索沙盒 / 热Setting / Reroute / ILM ================= */

    /** DSL 沙盒（支持 explain / profile） */
    @PostMapping("cluster/search-dsl")
    public Map<String, Object> clusterSearchDsl(@RequestParam(required = false) String index,
                                                @RequestParam(defaultValue = "false") boolean explain,
                                                @RequestParam(defaultValue = "false") boolean profile,
                                                @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.searchDsl(index, body, explain, profile);
    }

    /** 获取索引 settings（含默认） */
    @GetMapping("cluster/index-settings")
    public Map<String, Object> clusterGetIndexSettings(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.getIndexSettings(index);
    }

    /** 热更新索引 settings */
    @PostMapping("cluster/index-settings/update")
    public Map<String, Object> clusterUpdateIndexSettings(@RequestParam String index,
                                                          @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.updateIndexSettings(index, body);
    }

    /** 集群 reroute（手工搜片） */
    @PostMapping("cluster/reroute")
    public Map<String, Object> clusterReroute(@RequestParam(defaultValue = "false") boolean dryRun,
                                              @RequestParam(defaultValue = "true") boolean explain,
                                              @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.clusterReroute(body, dryRun, explain);
    }

    /** ILM 策略列表 */
    @GetMapping("cluster/ilm/policies")
    public java.util.List<Map<String, Object>> clusterIlmPolicies() throws java.io.IOException {
        return esIndexAdmin.listIlmPolicies();
    }

    /** 创建/更新 ILM 策略 */
    @PutMapping("cluster/ilm/policy")
    public Map<String, Object> clusterPutIlmPolicy(@RequestParam String name,
                                                   @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.putIlmPolicy(name, body);
    }

    /** 删除 ILM 策略 */
    @DeleteMapping("cluster/ilm/policy")
    public Map<String, Object> clusterDeleteIlmPolicy(@RequestParam String name) throws java.io.IOException {
        return esIndexAdmin.deleteIlmPolicy(name);
    }

    /** 索引 ILM explain */
    @GetMapping("cluster/ilm/explain")
    public Map<String, Object> clusterIlmExplain(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.explainIlm(index);
    }

    /* =============================================================
     * 集群设置 / Task 详情 / Shard Stores / Snapshot Status / Reindex Preview
     * ============================================================= */

    /** 集群级设置全景（persistent/transient/defaults）*/
    @GetMapping("cluster/settings")
    public Map<String, Object> clusterSettings() throws java.io.IOException {
        return esIndexAdmin.getClusterSettings();
    }

    /** 索引 settings 含集群默认值（include_defaults）——Settings 面板「看全」手段；
     *  只读透传，不在 ADMIN 关键词内，VIEWER 可用（raw 是 ADMIN-only，不能拿它兼职）。 */
    @GetMapping("cluster/index-settings-defaults")
    public Map<String, Object> indexSettingsWithDefaults(@RequestParam String index) throws java.io.IOException {
        if (index == null || index.trim().isEmpty() || index.contains("/") || index.contains("..")) {
            throw new IllegalArgumentException("index 非法");
        }
        return esIndexAdmin.raw("GET", "/" + index.trim() + "/_settings?include_defaults=true&flat_settings=true", null);
    }

    /** 集群级设置下发（传 null 重置）*/
    @PostMapping("cluster/settings/put")
    public Map<String, Object> clusterSettingsPut(
            @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.putClusterSettings(body);
    }

    /** 分片存储分布 */
    @GetMapping("cluster/shard-stores")
    public Map<String, Object> clusterShardStores(@RequestParam(required = false) String index,
                                                  @RequestParam(required = false) String status) throws java.io.IOException {
        return esIndexAdmin.shardStores(index, status);
    }

    /** 快照进度详情（缺省原始透传逐字节不变；{@code ?summary=true} 走分片级归一化摘要，前端进度条直接可用） */
    @GetMapping("cluster/snapshot/status")
    public Map<String, Object> clusterSnapshotStatus(@RequestParam(required = false) String repo,
                                                     @RequestParam(required = false) String name,
                                                     @RequestParam(required = false, defaultValue = "false") boolean summary) throws java.io.IOException {
        if (summary) {
            return esIndexAdmin.snapshotStatusSummary(repo, name);
        }
        return esIndexAdmin.snapshotStatus(repo, name);
    }

    /** 单任务详情 */
    @GetMapping("cluster/task-detail")
    public Map<String, Object> clusterTaskDetail(@RequestParam String taskId) throws java.io.IOException {
        return esIndexAdmin.taskDetail(taskId);
    }

    /** Reindex 预估（不写入任何数据）*/
    @PostMapping("cluster/reindex-preview")
    public Map<String, Object> clusterReindexPreview(@RequestParam String source,
                                                     @org.springframework.web.bind.annotation.RequestBody(required = false) String query) throws java.io.IOException {
        return esIndexAdmin.reindexPreview(source, query);
    }

    /* ======== ：一键综合体检 ======== */
    /** 一键集群体检：聚合 cluster health + 不健康索引 + pending tasks + 节点负载，产出评分与建议 */
    @GetMapping("cluster/health-report")
    public Map<String, Object> clusterHealthReport() throws java.io.IOException {
        return esIndexAdmin.healthReport();
    }

    /* ======== ：分布式运维 - SLM / Watcher / Remote Clusters ======== */
    /** SLM 快照策略列表 */
    @GetMapping("cluster/slm/policies")
    public Map<String, Object> clusterSlmPolicies() throws java.io.IOException {
        return esIndexAdmin.slmPolicies();
    }

    /** SLM 立即执行某策略 */
    @PostMapping("cluster/slm/execute")
    public Map<String, Object> clusterSlmExecute(@RequestParam String policyId) throws java.io.IOException {
        return esIndexAdmin.slmExecute(policyId);
    }

    /** SLM 全局运行状态 + 统计 */
    @GetMapping("cluster/slm/status")
    public Map<String, Object> clusterSlmStatus() throws java.io.IOException {
        return esIndexAdmin.slmStatus();
    }

    /** Watcher 告警列表 + 统计 */
    @GetMapping("cluster/watcher")
    public Map<String, Object> clusterWatcherList() throws java.io.IOException {
        return esIndexAdmin.watcherList();
    }

    /** 远程集群配置 + 连接状态（CCS/CCR） */
    @GetMapping("cluster/remote-clusters")
    public Map<String, Object> clusterRemoteClusters() throws java.io.IOException {
        return esIndexAdmin.remoteClusters();
    }

    /** ➕：高级 Reindex — 自定义目标集群 / 自由 body / 全参数开放 */
    @PostMapping("cluster/reindex-advanced")
    public Map<String, Object> clusterReindexAdvanced(
            @RequestParam(required = false) String slices,
            @RequestParam(required = false) String refresh,
            @RequestParam(required = false) String waitForCompletion,
            @RequestParam(required = false) String requestsPerSecond,
            @RequestParam(required = false) String scroll,
            @RequestParam(required = false) String timeout,
            @RequestParam(required = false) String waitForActiveShards,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        Map<String, String> opts = new java.util.LinkedHashMap<>();
        opts.put("slices", slices);
        opts.put("refresh", refresh);
        opts.put("waitForCompletion", waitForCompletion);
        opts.put("requestsPerSecond", requestsPerSecond);
        opts.put("scroll", scroll);
        opts.put("timeout", timeout);
        opts.put("waitForActiveShards", waitForActiveShards);
        return esIndexAdmin.reindexAdvanced(body, opts);
    }

    /* ======== ：分布式自定义 - 批量编辑 / SQL / 文档直编 ======== */

    /** _update_by_query：按自定义 query 批量更新 */
    @PostMapping("cluster/update-by-query")
    public Map<String, Object> clusterUpdateByQuery(
            @RequestParam String index,
            @RequestParam(required = false) String conflicts,
            @RequestParam(required = false) String slices,
            @RequestParam(required = false) String refresh,
            @RequestParam(required = false) String waitForCompletion,
            @RequestParam(required = false) String requestsPerSecond,
            @RequestParam(required = false) String scroll,
            @RequestParam(required = false) String timeout,
            @RequestParam(required = false) String waitForActiveShards,
            @RequestParam(required = false) String maxDocs,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        Map<String, String> opts = new java.util.LinkedHashMap<>();
        opts.put("conflicts", conflicts); opts.put("slices", slices); opts.put("refresh", refresh);
        opts.put("waitForCompletion", waitForCompletion); opts.put("requestsPerSecond", requestsPerSecond);
        opts.put("scroll", scroll); opts.put("timeout", timeout);
        opts.put("waitForActiveShards", waitForActiveShards); opts.put("maxDocs", maxDocs);
        return esIndexAdmin.updateByQuery(index, body, opts);
    }

    /** _delete_by_query：按自定义 query 批量删除 */
    @PostMapping("cluster/delete-by-query")
    public Map<String, Object> clusterDeleteByQuery(
            @RequestParam String index,
            @RequestParam(required = false) String conflicts,
            @RequestParam(required = false) String slices,
            @RequestParam(required = false) String refresh,
            @RequestParam(required = false) String waitForCompletion,
            @RequestParam(required = false) String requestsPerSecond,
            @RequestParam(required = false) String scroll,
            @RequestParam(required = false) String timeout,
            @RequestParam(required = false) String maxDocs,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        Map<String, String> opts = new java.util.LinkedHashMap<>();
        opts.put("conflicts", conflicts); opts.put("slices", slices); opts.put("refresh", refresh);
        opts.put("waitForCompletion", waitForCompletion); opts.put("requestsPerSecond", requestsPerSecond);
        opts.put("scroll", scroll); opts.put("timeout", timeout); opts.put("maxDocs", maxDocs);
        return esIndexAdmin.deleteByQuery(index, body, opts);
    }

    /** _bulk：直接下发 NDJSON（无 index 时只进行 collection） */
    @PostMapping("cluster/bulk")
    public Map<String, Object> clusterBulk(
            @RequestParam(required = false) String index,
            @RequestParam(required = false) String refresh,
            @RequestParam(required = false) String pipeline,
            @RequestParam(required = false) String timeout,
            @RequestParam(required = false) String waitForActiveShards,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        Map<String, String> opts = new java.util.LinkedHashMap<>();
        opts.put("refresh", refresh); opts.put("pipeline", pipeline);
        opts.put("timeout", timeout); opts.put("waitForActiveShards", waitForActiveShards);
        return esIndexAdmin.bulk(index, body, opts);
    }

    /** _sql 查询（JSON body）—— 与 cluster/sql（纯文本 SQL）区分 */
    @PostMapping("cluster/sql/query")
    public Map<String, Object> clusterSqlJson(@org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.sqlQuery(body);
    }
    /** _sql/translate 把 SQL 转成 DSL */
    @PostMapping("cluster/sql/translate")
    public Map<String, Object> clusterSqlTranslate(@org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.sqlTranslate(body);
    }
    /** _sql 分页 cursor */
    @PostMapping("cluster/sql/cursor")
    public Map<String, Object> clusterSqlCursor(@RequestParam String cursor) throws java.io.IOException {
        return esIndexAdmin.sqlCursor(cursor);
    }
    /** _sql 关闭 cursor */
    @PostMapping("cluster/sql/close")
    public Map<String, Object> clusterSqlClose(@RequestParam String cursor) throws java.io.IOException {
        return esIndexAdmin.sqlClose(cursor);
    }

    /** 单文档 GET（供 diff editor 拉取原文） */
    @GetMapping("cluster/doc")
    public Map<String, Object> clusterGetDoc(@RequestParam String index, @RequestParam String id) throws java.io.IOException {
        return esIndexAdmin.getDoc(index, id);
    }
    /** 单文档 PUT/index（幂等覆盖） */
    @PostMapping("cluster/doc")
    public Map<String, Object> clusterPutDoc(
            @RequestParam String index, @RequestParam String id,
            @RequestParam(required = false) String refresh,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.putDoc(index, id, body, refresh);
    }
    /** 单文档 _update partial */
    @PostMapping("cluster/doc/update")
    public Map<String, Object> clusterUpdateDoc(
            @RequestParam String index, @RequestParam String id,
            @RequestParam(required = false) String refresh,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.updateDoc(index, id, body, refresh);
    }

    /* ====================================================================
     *  —— painless / stored scripts / rollover / ILM ops / nodes stats brief
     * ==================================================================== */

    /** POST /_scripts/painless/_execute —— 脚本沙盒 */
    @PostMapping("cluster/painless/execute")
    public Map<String, Object> painlessExecute(@org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.painlessExecute(body);
    }
    /** 已存储脚本列表 */
    @GetMapping("cluster/scripts")
    public Map<String, Object> listStoredScripts() throws java.io.IOException {
        return esIndexAdmin.listStoredScripts();
    }
    /** 保存脚本 PUT /_scripts/{id} */
    @PostMapping("cluster/scripts/put")
    public Map<String, Object> putStoredScript(@RequestParam String id,
                                                @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.putStoredScript(id, body);
    }
    /** 删除脚本 DELETE /_scripts/{id} */
    @PostMapping("cluster/scripts/delete")
    public Map<String, Object> deleteStoredScript(@RequestParam String id) throws java.io.IOException {
        return esIndexAdmin.deleteStoredScript(id);
    }
    /** 手动 rollover */
    @PostMapping("cluster/rollover")
    public Map<String, Object> rolloverAlias(@RequestParam String alias,
                                              @RequestParam(defaultValue = "false") boolean dryRun,
                                              @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.rolloverAlias(alias, body, dryRun);
    }
    /** ILM move step */
    @PostMapping("cluster/ilm/move")
    public Map<String, Object> ilmMove(@RequestParam String index,
                                        @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.ilmMove(index, body);
    }
    @PostMapping("cluster/ilm/start")
    public Map<String, Object> ilmStart() throws java.io.IOException { return esIndexAdmin.ilmStart(); }
    @PostMapping("cluster/ilm/stop")
    public Map<String, Object> ilmStop() throws java.io.IOException { return esIndexAdmin.ilmStop(); }
    @GetMapping("cluster/ilm/status")
    public Map<String, Object> ilmStatus() throws java.io.IOException { return esIndexAdmin.ilmStatus(); }
    /** 实时监控大屏——简化 nodes stats */
    @GetMapping("cluster/nodes-stats-brief")
    public java.util.List<Map<String, Object>> nodesStatsBrief() throws java.io.IOException {
        return esIndexAdmin.nodesStatsBrief();
    }

    /* =========================================================
     *  —— 查询能力全通道 Query Bridge：SQL 宽容 / Lucene / PIT / schema 探测
     * ========================================================= */
    /** SQL 宽容执行（自动注入 field_multi_value_leniency=true） */
    @PostMapping("cluster/sql/lenient")
    public Map<String, Object> sqlLenient(@org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.sqlLenient(body == null ? "" : body);
    }
    /** Lucene query_string 通用查询：数组/nested/text 全友好 */
    @GetMapping("cluster/lucene-search")
    public Map<String, Object> luceneSearch(@RequestParam String index,
                                            @RequestParam(defaultValue = "*") String q,
                                            @RequestParam(defaultValue = "100") int size,
                                            @RequestParam(defaultValue = "0") int from,
                                            @RequestParam(required = false) String sortField,
                                            @RequestParam(required = false) String sortOrder) throws java.io.IOException {
        return esIndexAdmin.luceneSearch(index, q, size, from, sortField, sortOrder);
    }
    /** 开启 Point-in-Time（深度分页基石） */
    @PostMapping("cluster/pit/open")
    public Map<String, Object> pitOpen(@RequestParam String index,
                                       @RequestParam(defaultValue = "5m") String keepAlive) throws java.io.IOException {
        return esIndexAdmin.pitOpen(index, keepAlive);
    }
    /** PIT + search_after 分页搜索 */
    @PostMapping("cluster/pit/search")
    public Map<String, Object> pitSearch(@org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.pitSearch(body);
    }
    /** 关闭 PIT */
    @PostMapping("cluster/pit/close")
    public Map<String, Object> pitClose(@RequestParam String pitId) throws java.io.IOException {
        return esIndexAdmin.pitClose(pitId);
    }
    /** 字段结构探测（前端教育） */
    @GetMapping("cluster/resolve-schema")
    public Map<String, Object> resolveSchema(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.resolveSchema(index);
    }

    /* =========================================================================
     *  —— 索引运维中枢：mapping / analysis / synonyms / plugins
     * ========================================================================= */

    /** Mapping 详情树（nested/object/multi-fields 展开） */
    @GetMapping("cluster/mapping-detail")
    public Map<String, Object> mappingDetail(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.getMappingDetail(index);
    }

    /** 为索引新增字段（只能加，不能改/删） */
    @PostMapping("cluster/mapping-put")
    public Map<String, Object> mappingPut(@RequestParam String index,
                                          @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.putMappingField(index, body);
    }

    /** 读索引 analysis 全景 */
    @GetMapping("cluster/analysis-settings")
    public Map<String, Object> analysisSettings(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.getAnalysisSettings(index);
    }

    /** 更新 analysis（close→PUT→open 自动） */
    @PostMapping("cluster/analysis-update")
    public Map<String, Object> analysisUpdate(@RequestParam String index,
                                              @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.updateAnalysisSettings(index, body);
    }

    /** 搜索分词器热重载 */
    @PostMapping("cluster/reload-analyzers")
    public Map<String, Object> reloadAnalyzers(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.reloadSearchAnalyzers(index);
    }

    /** 插件矩阵 */
    @GetMapping("cluster/plugins")
    public Map<String, Object> plugins() throws java.io.IOException {
        return esIndexAdmin.pluginsList();
    }

    /** 便捷 —— 同义词 upsert (index-level inline synonym_graph filter) */
    @PostMapping("cluster/synonyms-upsert")
    public Map<String, Object> synonymsUpsert(@RequestParam String index,
                                              @RequestParam(defaultValue = "custom_synonyms") String filter,
                                              @RequestParam(defaultValue = "true") boolean expand,
                                              @org.springframework.web.bind.annotation.RequestBody(required = false) java.util.List<String> entries) throws java.io.IOException {
        return esIndexAdmin.synonymsGraphUpsert(index, filter, entries, expand);
    }

    /* =========================================================================
     *  —— 相关性打分实验室：explain / validate / termvectors / search 透传
     * ========================================================================= */

    /** 搜索透传（body 可含 explain:true / _name 命名子句） */
    @PostMapping("cluster/search-raw")
    public Map<String, Object> searchRaw(@RequestParam String index,
                                         @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.searchRaw(index, body);
    }

    /** 单文档打分解释 / why-not 诊断 */
    @PostMapping("cluster/explain-doc")
    public Map<String, Object> explainDoc(@RequestParam String index,
                                          @RequestParam String id,
                                          @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.explainDoc(index, id, body);
    }

    /** 查询校验 + Lucene 改写透视 */
    @PostMapping("cluster/validate-query")
    public Map<String, Object> validateQuery(@RequestParam String index,
                                             @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.validateQuery(index, body);
    }

    /** 词频取证 _termvectors */
    @GetMapping("cluster/term-vectors")
    public Map<String, Object> termVectors(@RequestParam String index,
                                           @RequestParam String id,
                                           @RequestParam(required = false) String fields) throws java.io.IOException {
        return esIndexAdmin.termVectors(index, id, fields);
    }

    /* =========================================================================
*  —— 搜索模板中心 + 别名管控台
     * ========================================================================= */

/** mustache 模板渲染预览 _render/template */
    @PostMapping("cluster/render-template")
    public Map<String, Object> renderTemplate(
            @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.renderTemplate(body);
    }

/** 执行搜索模板 _search/template */
    @PostMapping("cluster/search-template")
    public Map<String, Object> searchTemplate(@RequestParam String index,
            @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.searchTemplate(index, body);
    }

/** 别名原子操作 POST /_aliases */
    @PostMapping("cluster/alias-actions")
    public Map<String, Object> aliasActions(
            @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.aliasActions(body);
    }

    /** 当前 HTTP 请求（供错误体带 endpoint 上下文，EsClusterConnController 同款）；无 web 上下文返回 null，绝不抛异常。 */
    private static javax.servlet.http.HttpServletRequest currentRequest() {
        org.springframework.web.context.request.RequestAttributes ra =
                org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        return ra instanceof org.springframework.web.context.request.ServletRequestAttributes
                ? ((org.springframework.web.context.request.ServletRequestAttributes) ra).getRequest() : null;
    }

    /* 控制器本地 handler 优先于 @RestControllerAdvice：若只留 Exception 兼容兜底，advice 的 400/409 映射永远轮不到。
       故这里显式声明同类型 handler 委派给 advice，保证业务拒绝码（LOCK_CONFLICT/STAGE_GUARD/BAD_REQUEST）语义一致 */
    private static final InternalEsRebuildExceptionAdvice EX_ADVICE = new InternalEsRebuildExceptionAdvice();

    @org.springframework.web.bind.annotation.ExceptionHandler(IllegalStateException.class)
    public org.springframework.http.ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException e) {
        return EX_ADVICE.illegalState(e);
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(IllegalArgumentException.class)
    public org.springframework.http.ResponseEntity<Map<String, Object>> handleIllegalArg(IllegalArgumentException e) {
        return EX_ADVICE.illegalArg(e);
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(Exception.class)
    @org.springframework.web.bind.annotation.ResponseBody
    public org.springframework.http.ResponseEntity<Map<String, Object>> handleError(Exception e,
            javax.servlet.http.HttpServletRequest request) {
        /* -C2：状态码映射与 message 组装统一走 EsErrorMapper（与全包兜底 advice 同口径）——
           ES 端 4xx 透传原状态码不拉平成 500，5xx/网络故障映射 502，message 保留 ES 原始报错体供前端提 root_cause；
           错误体补 endpoint（method + " " + requestURI），与兜底 advice 同步 */
        return org.springframework.http.ResponseEntity.status(EsErrorMapper.httpStatusOf(e))
                .body(EsErrorMapper.esErrorBody(e, EsErrorMapper.endpointOf(request)));
    }
}
