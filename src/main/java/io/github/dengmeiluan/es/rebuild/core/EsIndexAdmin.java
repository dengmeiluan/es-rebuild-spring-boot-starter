package io.github.dengmeiluan.es.rebuild.core;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.action.admin.indices.alias.IndicesAliasesRequest;
import org.elasticsearch.action.admin.indices.alias.get.GetAliasesRequest;
import org.elasticsearch.action.admin.indices.delete.DeleteIndexRequest;
import org.elasticsearch.action.admin.indices.settings.put.UpdateSettingsRequest;
import org.elasticsearch.client.GetAliasesResponse;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.RestHighLevelClient;
import org.elasticsearch.client.indices.CreateIndexRequest;
import org.elasticsearch.client.indices.GetIndexRequest;
import org.elasticsearch.client.tasks.GetTaskRequest;
import org.elasticsearch.client.tasks.GetTaskResponse;
import org.elasticsearch.client.tasks.TaskSubmissionResponse;
import org.elasticsearch.common.settings.Settings;
import org.elasticsearch.common.xcontent.XContentType;
import org.elasticsearch.index.reindex.ReindexRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * ES 索引/别名/reindex 底层操作封装，基于原生 {@link RestHighLevelClient}（与 spring-data-es 版本解耦）。
 *
 * <p>所有方法直接透传 ES 客户端异常（{@link IOException}），由编排层处理。</p>
 */
public class EsIndexAdmin {

    private static final Logger logger = LoggerFactory.getLogger(EsIndexAdmin.class);

    /** 复用单例 ObjectMapper 解析 reindex status 的 JSON 文本（ES {@code RawTaskStatus.toString()}）。 */
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 宿主集群 client（单集群时代的唯一通道，仍是兼容兜底）。 */
    private final RestHighLevelClient hostClient;

    /**  多集群路由（setter 可选注入）：非空时数据面操作跟随请求上下文的目标集群。 */
    private volatile io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter clientRouter;

    public EsIndexAdmin(RestHighLevelClient restHighLevelClient) {
        this.hostClient = restHighLevelClient;
    }

    /** 注入多集群路由（自动装配时调；不注入则恒用宿主 client，行为与旧版完全一致）。 */
    public void setClientRouter(io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter clientRouter) {
        this.clientRouter = clientRouter;
    }

    /** 当前请求应使用的 client：无路由/无目标 → 宿主；有目标 → 路由器长连接。 */
    private RestHighLevelClient restHighLevelClient() {
        io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter r = clientRouter;
        return r == null ? hostClient : r.current();
    }

    /**
     * 物理索引是否存在
     */
    public boolean indexExists(String index) throws IOException {
        return restHighLevelClient().indices().exists(new GetIndexRequest(index), RequestOptions.DEFAULT);
    }

    /**
     * 显式创建物理索引（带 settings + mapping），不依赖 ES 自动建索引。
     *
     * <p> 版本感知：目标是 6.x 集群时 mappings 必须带 type 包一层，走低层 REST 分叉；
     * 7.x+/版本未知走既有 typeless 路径（行为与旧版完全一致）。</p>
     *
     * @param mappingJson 可为 null（无 @Mapping 的实体）
     */
    public void createIndex(String index, String settingsJson, String mappingJson) throws IOException {
        io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter r = clientRouter;
        String targetVersion = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.es.rebuild.multicluster.EsVersionCaps.requiresMappingType(targetVersion)) {
            createIndexLegacy6(index, settingsJson, mappingJson, targetVersion);
            return;
        }
        CreateIndexRequest request = new CreateIndexRequest(index);
        if (settingsJson != null && !settingsJson.isEmpty()) {
            request.settings(settingsJson, XContentType.JSON);
        }
        if (mappingJson != null && !mappingJson.isEmpty()) {
            request.mapping(mappingJson, XContentType.JSON);
        }
        restHighLevelClient().indices().create(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] createIndex done: {}", index);
    }

    /**
     * 6.x 目标建索引：低层 PUT /{index}，mappings 用 {@code _doc} type 包层
     * （typed CreateIndexRequest 的 typeless body 对 6.x 会报 mapping type 缺失）。
     */
    private void createIndexLegacy6(String index, String settingsJson, String mappingJson, String version) throws IOException {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        if (settingsJson != null && !settingsJson.isEmpty()) {
            body.put("settings", OBJECT_MAPPER.readValue(settingsJson, Map.class));
        }
        if (mappingJson != null && !mappingJson.isEmpty()) {
            Map<String, Object> mapping = OBJECT_MAPPER.readValue(mappingJson, Map.class);
            // 已是 typed 形态（如从 6.x 旧索引 getMapping 拷来：单 type 键且内层才是 mapping 体）则直接用，
            // typeless 才包 _doc。判定：单键 + 值是 Map + 内层含 properties（或键本身是 _doc）
            boolean alreadyTyped = false;
            if (mapping.size() == 1 && !mapping.containsKey("properties")) {
                Map.Entry<String, Object> only = mapping.entrySet().iterator().next();
                alreadyTyped = only.getValue() instanceof Map
                        && ("_doc".equals(only.getKey()) || ((Map<?, ?>) only.getValue()).containsKey("properties"));
            }
            body.put("mappings", alreadyTyped ? mapping
                    : java.util.Collections.singletonMap("_doc", mapping));
        }
        performJson("PUT", "/" + index, OBJECT_MAPPER.writeValueAsString(body));
        logger.info("[EsIndexAdmin] createIndex done (legacy6 target v{}): {}", version, index);
    }

    /**
     * mapping body 归一化——6.x 目标集群的 {@code _mapping} 响应多一层 type 包裹
     * （{@code mappings.{type}.properties}），剥掉后与 7.x 同构，避免控制台字段视图对 6.x 集群误报「无字段」。
     * <p>包级可见：-C1 单测锁双形态行为（见 EsResponseShapeTest）。</p>
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> unwrapTypeLayer(Map<String, Object> mappings) {
        if (mappings == null || mappings.containsKey("properties")) return mappings;
        if (mappings.size() == 1) {
            Object only = mappings.values().iterator().next();
            if (only instanceof Map && ((Map<?, ?>) only).containsKey("properties")) {
                return (Map<String, Object>) only;
            }
        }
        return mappings;
    }

    /**
     * -C1：hits.total 双形态归一——6.x 是数字，7.x+ 是 {@code {value,relation}} 对象，
     * 统一取出数值。未知形态（null/异构）原样透传，不在这里拦。
     * <p>注：searchDsl/pitSearch 等透传原始响应的路径不走本方法——前端已统一
     * {@code total?.value ?? total} 双形态消费，那是既定契约。</p>
     */
    static Object parseHitsTotal(Object total) {
        if (total instanceof Map) return ((Map<?, ?>) total).get("value");
        return total;
    }

    /**
     * 读取物理索引当前 mapping 的 JSON（{@code {"properties":...}} body，可直接用作 {@link #createIndex} 的 mappingJson）。
     * <p>用于实体无 {@code @Mapping} 时从旧索引复制 mapping，避免新物理索引退化为 ES 动态映射、与旧索引漂移。</p>
     *
     * @return mapping JSON；索引无 mapping 时返回 null
     */
    public String getMapping(String index) throws IOException {
        // 低层 REST 直取：避开 MappingMetaData（7.7 改名 MappingMetadata）的类名变更，兼容宿主锁任意 7.x client
        Map<String, Object> resp = performJson("GET", "/" + index + "/_mapping", null);
        Object idxEntry = resp.get(index);
        if (!(idxEntry instanceof Map)) {
            // 传入别名时响应键为物理索引名，取第一个
            idxEntry = resp.values().stream().filter(v -> v instanceof Map).findFirst().orElse(null);
        }
        if (idxEntry == null) return null;
        Object mappings = ((Map<?, ?>) idxEntry).get("mappings");
        if (!(mappings instanceof Map) || ((Map<?, ?>) mappings).isEmpty()) return null;
        return OBJECT_MAPPER.writeValueAsString(unwrapTypeLayer((Map<String, Object>) mappings));
    }

    /**
     * 别名是否存在
     */
    public boolean aliasExists(String alias) throws IOException {
        return restHighLevelClient().indices().existsAlias(new GetAliasesRequest(alias), RequestOptions.DEFAULT);
    }

    /**
     * 返回别名当前指向的物理索引集合（别名不存在时返回空集）
     */
    public Set<String> getIndicesByAlias(String alias) throws IOException {
        if (!aliasExists(alias)) {
            return Collections.emptySet();
        }
        GetAliasesResponse response =
                restHighLevelClient().indices().getAlias(new GetAliasesRequest(alias), RequestOptions.DEFAULT);
        return response.getAliases() == null ? Collections.emptySet() : response.getAliases().keySet();
    }

    /**
     * 返回别名当前的 write 物理索引（is_write_index=true）。
     * 若无显式 write 标志但别名仅指向单个索引，则返回该唯一索引；否则返回 null。
     */
    public String getWriteIndex(String alias) throws IOException {
        if (!aliasExists(alias)) {
            return null;
        }
        // 低层 REST：GET /_alias/{alias}，避开 AliasMetaData（7.7 改名 AliasMetadata）的类名变更
        Map<String, Object> resp = performJson("GET", "/_alias/" + alias, null);
        if (resp.isEmpty()) {
            return null;
        }
        for (Map.Entry<String, Object> entry : resp.entrySet()) {
            Object aliasesObj = entry.getValue() instanceof Map ? ((Map<?, ?>) entry.getValue()).get("aliases") : null;
            if (!(aliasesObj instanceof Map)) continue;
            Object meta = ((Map<?, ?>) aliasesObj).get(alias);
            if (meta instanceof Map && Boolean.TRUE.equals(((Map<?, ?>) meta).get("is_write_index"))) {
                return entry.getKey();
            }
        }
        return resp.size() == 1 ? resp.keySet().iterator().next() : null;
    }

    /**
     * 首次创建别名并指向物理索引（is_write_index=true）
     */
    public void createWriteAlias(String alias, String physicalIndex) throws IOException {
        IndicesAliasesRequest request = new IndicesAliasesRequest();
        request.addAliasAction(IndicesAliasesRequest.AliasActions.add()
                .index(physicalIndex).alias(alias).writeIndex(true));
        restHighLevelClient().indices().updateAliases(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] createWriteAlias: {} -> {}", alias, physicalIndex);
    }

    /**
     * 原子切换写索引：新物理索引设为 write，旧物理索引（若有）取消 write 但保留可读。
     * 切换后增量自动写入新物理索引。
     */
    public void switchWriteIndex(String alias, String newPhysical, String oldPhysical) throws IOException {
        IndicesAliasesRequest request = new IndicesAliasesRequest();
        request.addAliasAction(IndicesAliasesRequest.AliasActions.add()
                .index(newPhysical).alias(alias).writeIndex(true));
        if (oldPhysical != null && !oldPhysical.isEmpty()) {
            request.addAliasAction(IndicesAliasesRequest.AliasActions.add()
                    .index(oldPhysical).alias(alias).writeIndex(false));
        }
        restHighLevelClient().indices().updateAliases(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] switchWriteIndex alias={} newWrite={} oldReadOnly={}", alias, newPhysical, oldPhysical);
    }

    /**
     * 从别名原子移除某物理索引
     */
    public void removeAlias(String alias, String physicalIndex) throws IOException {
        IndicesAliasesRequest request = new IndicesAliasesRequest();
        request.addAliasAction(IndicesAliasesRequest.AliasActions.remove()
                .index(physicalIndex).alias(alias));
        restHighLevelClient().indices().updateAliases(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] removeAlias: {} x {}", alias, physicalIndex);
    }

    /**
     * 提交 reindex 异步任务。dest op_type=create + conflicts=proceed：
     * 切 write_index 后已写入目标的增量（同 _id）会因 create 冲突被跳过，不被旧存量覆盖。
     *
     * @return taskId，格式 {@code nodeId:taskNum}
     */
    public String submitReindex(String sourceIndex, String destIndex) throws IOException {
        ReindexRequest request = new ReindexRequest();
        request.setSourceIndices(sourceIndex);
        request.setDestIndex(destIndex);
        request.setDestOpType("create");
        request.setConflicts("proceed");
        TaskSubmissionResponse response = restHighLevelClient().submitReindexTask(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] submitReindex {} -> {} taskId={}", sourceIndex, destIndex, response.getTask());
        return response.getTask();
    }

    /**
     * 查询 reindex 任务进度。把 ES status 的 JSON 文本解析为结构化计数（{@link ReindexProgress}），
     * 前端直接读字段、不再自行解析；解析失败或 task 已消失时回退原文/兜底状态。
     */
    public ReindexProgress getReindexProgress(String taskId) throws IOException {
        int idx = taskId.lastIndexOf(':');
        if (idx <= 0) {
            return new ReindexProgress(false, "invalid taskId: " + taskId);
        }
        String nodeId = taskId.substring(0, idx);
        long taskNum = Long.parseLong(taskId.substring(idx + 1));
        Optional<GetTaskResponse> resp =
                restHighLevelClient().tasks().get(new GetTaskRequest(nodeId, taskNum), RequestOptions.DEFAULT);
        if (!resp.isPresent()) {
            // 任务已从 _tasks 列表消失，通常表示已完成
            return new ReindexProgress(true, "task not found (likely completed)");
        }
        GetTaskResponse taskResponse = resp.get();
        boolean completed = taskResponse.isCompleted();
        String detail = "running";
        if (taskResponse.getTaskInfo() != null && taskResponse.getTaskInfo().getStatus() != null) {
            detail = taskResponse.getTaskInfo().getStatus().toString();
        }
        Map<String, Object> statusMap = tryParseStatus(detail);
        if (statusMap == null) {
            // 拿不到 status JSON（如 task 刚起无 status），仍据 completed 给 RUNNING/COMPLETED，计数留空
            return ReindexProgress.of(completed, detail, null, null, null, null, null);
        }
        return ReindexProgress.of(completed, detail,
                asLong(statusMap.get("total")), asLong(statusMap.get("created")),
                asLong(statusMap.get("updated")), asLong(statusMap.get("deleted")),
                asLong(statusMap.get("version_conflicts")));
    }

    /**
     * 解析 reindex status 的 JSON 文本为 Map，非 JSON / 解析失败返回 null（调用方回退原文）。
     */
    private static Map<String, Object> tryParseStatus(String json) {
        if (json == null || json.isEmpty() || json.charAt(0) != '{') {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = OBJECT_MAPPER.readValue(json, Map.class);
            return map;
        } catch (Exception e) {
            // 状态体解析失败回 null（调用方回退原文，契约不变）——debug 带 reason 摘要留痕
            logger.debug("[EsIndexAdmin] tryParseStatus 解析失败回退原文：{}: {}",
                    e.getClass().getSimpleName(), e.getMessage());
            return null;
        }
    }

    /**
     * status JSON 数值字段转 {@link Long}（Jackson 可能解析为 Integer/Long），非数值返回 null。
     */
    private static Long asLong(Object v) {
        return v instanceof Number ? ((Number) v).longValue() : null;
    }

    /**
     * 设置/解除物理索引写阻塞（{@code index.blocks.write}）。
     * <p>常规重建把别名 write 切到新索引后，对旧物理索引加写阻塞（true），使残余写请求在 old 被拒、
     * 由可重试写入模板重试到新 write 索引（物理只读契约）；删除旧索引或回滚前解除（false）。</p>
     * <p>注意：仅阻塞写，读不受影响，reindex 读取 old 存量正常。</p>
     */
    public void setIndexWriteBlock(String index, boolean writeBlocked) throws IOException {
        UpdateSettingsRequest request = new UpdateSettingsRequest(index);
        request.settings(Settings.builder().put("index.blocks.write", writeBlocked).build());
        restHighLevelClient().indices().putSettings(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] setIndexWriteBlock index={} writeBlocked={}", index, writeBlocked);
    }

    /**
     * 删除物理索引（高危，仅在确认不被任何别名指向后调用）
     */
    public void deleteIndex(String index) throws IOException {
        restHighLevelClient().indices().delete(new DeleteIndexRequest(index), RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] deleteIndex: {}", index);
    }

    /**
     * 强制合并索引 segment，减少碎片。大量删除后调用以回收磁盘空间。
     */
    public Map<String, Object> forceMerge(String index, int maxNumSegments) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "POST", "/" + index + "/_forcemerge?wait_for_completion=false");
        req.setJsonEntity("{\"max_num_segments\":" + maxNumSegments + ",\"flush\":true}");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] forceMerge async index={} maxSegments={} result={}", index, maxNumSegments, result);
        return result;
    }

    /**
     * 热更新索引 settings（仅限动态参数如 number_of_replicas）。
     */
    public void updateSettings(String index, String settingsJson) throws IOException {
        UpdateSettingsRequest req = new UpdateSettingsRequest(index);
        req.settings(settingsJson, XContentType.JSON);
        restHighLevelClient().indices().putSettings(req, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] updateSettings index={}", index);
    }

    /**
     * 索引详情快照：mapping / settings / docCount / aliases / sample N 条文档。
     * Q1 面板"索引详情卡 + Multi-head 风格"用。
     */
    public Map<String, Object> inspect(String indexOrAlias, int sampleSize) throws IOException {
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("name", indexOrAlias);
        // mappings（低层 REST，避开 MappingMetaData 类名在 7.7 的变更）
        try {
            Map<String, Object> mresp = performJson("GET", "/" + indexOrAlias + "/_mapping", null);
            Map<String, Object> mapByIndex = new java.util.LinkedHashMap<>();
            mresp.forEach((idx, v) -> {
                if (v instanceof Map) {
                    Object mm = ((Map<?, ?>) v).get("mappings");
                    @SuppressWarnings("unchecked")
                    Map<String, Object> normalized = mm instanceof Map ? unwrapTypeLayer((Map<String, Object>) mm) : null;
                    mapByIndex.put(idx, normalized != null ? normalized : mm);
                }
            });
            result.put("mappings", mapByIndex);
        } catch (Exception e) {
            result.put("mappingsError", e.getMessage());
        }
        // settings
        try {
            org.elasticsearch.action.admin.indices.settings.get.GetSettingsRequest sr =
                    new org.elasticsearch.action.admin.indices.settings.get.GetSettingsRequest().indices(indexOrAlias);
            org.elasticsearch.action.admin.indices.settings.get.GetSettingsResponse sresp =
                    restHighLevelClient().indices().getSettings(sr, RequestOptions.DEFAULT);
            Map<String, Object> settingsMap = new java.util.LinkedHashMap<>();
            org.elasticsearch.common.collect.ImmutableOpenMap<String, Settings> all = sresp.getIndexToSettings();
            for (java.util.Iterator<String> it = all.keysIt(); it.hasNext(); ) {
                String idx = it.next();
                Settings s = all.get(idx);
                Map<String, String> mm = new java.util.LinkedHashMap<>();
                for (String k : s.keySet()) mm.put(k, s.get(k));
                settingsMap.put(idx, mm);
            }
            result.put("settings", settingsMap);
        } catch (Exception e) {
            result.put("settingsError", e.getMessage());
        }
        // count + aliases
        try {
            org.elasticsearch.action.search.SearchRequest cnt = new org.elasticsearch.action.search.SearchRequest(indexOrAlias);
            cnt.source().size(0).trackTotalHits(true);
            org.elasticsearch.action.search.SearchResponse cresp = restHighLevelClient().search(cnt, RequestOptions.DEFAULT);
            result.put("docCount", cresp.getHits().getTotalHits() == null ? -1 : cresp.getHits().getTotalHits().value);
        } catch (Exception e) {
            result.put("docCountError", e.getMessage());
        }
        try {
            // 低层 REST：GET /{index}/_alias，避开 AliasMetaData 类名在 7.7 的变更
            Map<String, Object> aresp = performJson("GET", "/" + indexOrAlias + "/_alias", null);
            Map<String, java.util.List<String>> aliases = new java.util.LinkedHashMap<>();
            aresp.forEach((idx, v) -> {
                java.util.List<String> names = new java.util.ArrayList<>();
                Object as = v instanceof Map ? ((Map<?, ?>) v).get("aliases") : null;
                if (as instanceof Map) ((Map<?, ?>) as).keySet().forEach(a -> names.add(String.valueOf(a)));
                aliases.put(idx, names);
            });
            result.put("aliases", aliases);
        } catch (Exception e) {
            result.put("aliasesError", e.getMessage());
        }
        // sample
        if (sampleSize > 0) {
            try {
                org.elasticsearch.action.search.SearchRequest sr = new org.elasticsearch.action.search.SearchRequest(indexOrAlias);
                sr.source().size(sampleSize).trackTotalHits(false);
                org.elasticsearch.action.search.SearchResponse sresp = restHighLevelClient().search(sr, RequestOptions.DEFAULT);
                java.util.List<Map<String, Object>> docs = new java.util.ArrayList<>();
                for (org.elasticsearch.search.SearchHit h : sresp.getHits().getHits()) {
                    Map<String, Object> d = new java.util.LinkedHashMap<>();
                    d.put("_id", h.getId());
                    d.put("_index", h.getIndex());
                    d.put("_source", h.getSourceAsMap());
                    docs.add(d);
                }
                result.put("sample", docs);
            } catch (Exception e) {
                result.put("sampleError", e.getMessage());
            }
        }
        return result;
    }

    /**
     * 自由 query DSL：用 raw JSON 查任意索引。仅用于运维调试。
     */
    public Map<String, Object> queryDsl(String indexOrAlias, String dslJson, int size) throws IOException {
        String body = dslJson;
        if (body == null || body.trim().isEmpty()) {
            body = "{\"query\":{\"match_all\":{}},\"size\":" + size + "}";
        } else if (!body.contains("\"size\"")) {
            body = body.trim();
            body = body.substring(0, body.length() - 1) + ",\"size\":" + size + "}";
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/" + indexOrAlias + "/_search");
        req.setJsonEntity(body);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(respBody, Map.class);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        @SuppressWarnings("unchecked")
        Map<String, Object> hitsWrap = (Map<String, Object>) raw.get("hits");
        if (hitsWrap != null) {
            Object totalRaw = hitsWrap.get("total");
            result.put("total", parseHitsTotal(totalRaw));
            /* 300+ 批：relation 透传——gte=下界（track_total_hits 默认 10000 截断）。
               此前 parseHitsTotal 归一后 relation 丢失，前端 totalGte 恒 false，
               「10,000」永远不带「+（命中数为下界）」标注，与索引工作区精确计数形态割裂 */
            if (totalRaw instanceof Map && "gte".equals(((Map<?, ?>) totalRaw).get("relation"))) {
                result.put("totalGte", Boolean.TRUE);
            }
            @SuppressWarnings("unchecked")
            java.util.List<Map<String, Object>> hitsList = (java.util.List<Map<String, Object>>) hitsWrap.get("hits");
            java.util.List<Map<String, Object>> hits = new java.util.ArrayList<>();
            if (hitsList != null) {
                for (Map<String, Object> h : hitsList) {
                    Map<String, Object> d = new java.util.LinkedHashMap<>();
                    d.put("_id", h.get("_id"));
                    d.put("_index", h.get("_index"));
                    d.put("_score", h.get("_score"));
                    d.put("_source", h.get("_source"));
                    hits.add(d);
                }
            }
            result.put("hits", hits);
        } else {
            result.put("total", 0);
            result.put("hits", java.util.Collections.emptyList());
        }
        Object aggregations = raw.get("aggregations");
        if (aggregations != null) {
            result.put("aggregations", aggregations);
        }
        result.put("took", raw.get("took"));
        return result;
    }

    /**
     * 列出集群全部索引（排除 . 开头的系统索引）。
     * segments.count / docs.deleted 供段碎片体检用（force_merge 判据）；
     * 注意 _cat 返回值均为字符串，且关闭的索引这两列可能缺失或为空，消费端需容错。
     */
    public java.util.List<Map<String, Object>> listClusterIndices() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep,creation.date.string,segments.count,docs.deleted");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        java.util.List<Map<String, Object>> list = OBJECT_MAPPER.readValue(body,
                OBJECT_MAPPER.getTypeFactory().constructCollectionType(java.util.List.class, Map.class));
        java.util.List<Map<String, Object>> filtered = new java.util.ArrayList<>();
        for (Map<String, Object> item : list) {
            String name = String.valueOf(item.get("index"));
            if (!name.startsWith(".")) filtered.add(item);
        }
        filtered.sort((a, b) -> String.valueOf(a.get("index")).compareTo(String.valueOf(b.get("index"))));
        return filtered;
    }

    /**
     * 执行 ES SQL（_sql API，ES 6.3+ 支持）。返回 columns + rows 原始结构。
     * 遇到数组字段报错时自动检测并排除数组字段后重试。
     */
    public Map<String, Object> executeSql(String sql, int fetchSize) throws IOException {
        try {
            return doExecuteSql(sql);
        } catch (org.elasticsearch.client.ResponseException e) {
            String body = org.apache.http.util.EntityUtils.toString(e.getResponse().getEntity());
            if (body != null && body.contains("are not supported")) {
                String rewritten = rewriteSqlExcludingArrays(sql, body);
                if (rewritten != null) {
                    Map<String, Object> result = doExecuteSql(rewritten);
                    result.put("_rewrittenSql", rewritten);
                    result.put("_arrayFieldsExcluded", detectArrayFieldsFromIndex(sql));
                    return result;
                }
            }
            throw e;
        }
    }

    private Map<String, Object> doExecuteSql(String sql) throws IOException {
        String body = OBJECT_MAPPER.writeValueAsString(java.util.Collections.singletonMap("query", sql));
        /* 经版本感知 SQL 路径（6.x 是 /_xpack/sql） */
        return performSqlVersionAware("?format=json", body);
    }

    private String rewriteSqlExcludingArrays(String originalSql, String errorBody) {
        java.util.regex.Matcher fm = java.util.regex.Pattern
                .compile("(?i)\\bFROM\\s+\"?([\\w\\-.*]+)\"?").matcher(originalSql);
        if (!fm.find()) return null;
        String index = fm.group(1);
        java.util.Set<String> arrayFields = detectArrayFieldsFromIndex(index);
        if (arrayFields.isEmpty()) return null;

        java.util.List<String> safeCols = new java.util.ArrayList<>();
        try {
            // 低层 REST 直取 mapping，避开 MappingMetaData 类名在 7.7 的变更
            Map<String, Object> resp = performJson("GET", "/" + index + "/_mapping", null);
            for (Object idxEntry : resp.values()) {
                if (!(idxEntry instanceof Map)) continue;
                Object mappings = ((Map<?, ?>) idxEntry).get("mappings");
                if (!(mappings instanceof Map)) continue;
                @SuppressWarnings("unchecked")
                Map<String, Object> props = (Map<String, Object>) unwrapTypeLayer((Map<String, Object>) mappings).get("properties");
                if (props != null) {
                    for (String field : props.keySet()) {
                        if (!arrayFields.contains(field)) safeCols.add(field);
                    }
                }
            }
        } catch (Exception e) {
            /* 静默吞补 debug 留痕（异常类名+message）——「重写放弃」与「没触发重写」
               在日志上可区分；返回 null 契约不变（重写放弃，原始错误照常透传）。 */
            logger.debug("[EsIndexAdmin] rewriteSqlExcludingArrays mapping 探测失败（放弃重写）：{}: {}",
                    e.getClass().getSimpleName(), e.getMessage());
            return null;
        }
        if (safeCols.isEmpty()) return null;

        String limit = "20";
        java.util.regex.Matcher lm = java.util.regex.Pattern.compile("(?i)\\bLIMIT\\s+(\\d+)").matcher(originalSql);
        if (lm.find()) limit = lm.group(1);

        StringBuilder sb = new StringBuilder("SELECT ");
        for (int i = 0; i < safeCols.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append("\"").append(safeCols.get(i)).append("\"");
        }
        sb.append(" FROM \"").append(index).append("\" LIMIT ").append(limit);
        return sb.toString();
    }

    private java.util.Set<String> detectArrayFieldsFromIndex(String index) {
        java.util.Set<String> arrayFields = new java.util.LinkedHashSet<>();

        // 首选：scripted_metric 聚合全量扫描（精确但需要 script 权限）
        try {
            String aggBody = "{"
                + "\"size\":0,"
                + "\"aggs\":{"
                + "\"_array_detect\":{"
                + "\"scripted_metric\":{"
                + "\"init_script\":\"state.arrays = new HashSet()\","
                + "\"map_script\":\"for (entry in params._source.entrySet()) { if (entry.getValue() instanceof List) { state.arrays.add(entry.getKey()) } }\","
                + "\"combine_script\":\"return state.arrays\","
                + "\"reduce_script\":\"def result = new HashSet(); for (s in states) { result.addAll(s) } return result\""
                + "}}}}";
            org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/" + index + "/_search");
            req.setJsonEntity(aggBody);
            org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
            String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> aggs = (Map<String, Object>) result.get("aggregations");
            if (aggs != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> detect = (Map<String, Object>) aggs.get("_array_detect");
                if (detect != null && detect.get("value") instanceof java.util.List) {
                    @SuppressWarnings("unchecked")
                    java.util.List<String> fields = (java.util.List<String>) detect.get("value");
                    arrayFields.addAll(fields);
                    logger.info("[EsIndexAdmin] detectArrayFields via scripted_metric for : found {} array fields", index, arrayFields.size());
                    return arrayFields;
                }
            }
        } catch (Exception e) {
            logger.warn("[EsIndexAdmin] scripted_metric detection failed for {}, fallback to sampling: {}", index, e.getMessage());
        }

        // Fallback：样本检测（抽 30 条）
        try {
            org.elasticsearch.action.search.SearchRequest sr = new org.elasticsearch.action.search.SearchRequest(index);
            sr.source().size(30).trackTotalHits(false);
            org.elasticsearch.action.search.SearchResponse resp = restHighLevelClient().search(sr, RequestOptions.DEFAULT);
            for (org.elasticsearch.search.SearchHit hit : resp.getHits().getHits()) {
                Map<String, Object> src = hit.getSourceAsMap();
                if (src == null) continue;
                for (Map.Entry<String, Object> entry : src.entrySet()) {
                    if (entry.getValue() instanceof java.util.List) {
                        arrayFields.add(entry.getKey());
                    }
                }
            }
            logger.info("[EsIndexAdmin] detectArrayFields via sampling for {}: found {} array fields", index, arrayFields.size());
        } catch (Exception e) {
            logger.warn("[EsIndexAdmin] sampling detection also failed for {}: {}", index, e.getMessage());
        }
        return arrayFields;
    }

    /** 集群健康概览。 */
    public Map<String, Object> clusterHealth() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_cluster/health");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        /* 顺带版本号（伴随 GET /，best-effort）——控制台版本识别回落原先走
           raw 透传（ADMIN 域），每次开屏被记成 HIGH_RISK「raw=GET /」刷屏（实报
           「我只是打开页面却出现高危操作」）。共享端点带版本后前端弃 raw 回落。 */
        try {
            org.elasticsearch.client.Request root = new org.elasticsearch.client.Request("GET", "/");
            org.elasticsearch.client.Response rootResp = restHighLevelClient().getLowLevelClient().performRequest(root);
            mergeVersion(result, org.apache.http.util.EntityUtils.toString(rootResp.getEntity()));
        } catch (Exception e) {
            logger.debug("[EsIndexAdmin] health 版本伴随探测失败（健康概览照常返回）: {}", e.getMessage());
        }
        return result;
    }

    /** 版本合并（包内可见=可测）：root JSON 的 version.number 并入健康概览；无版本静默不动。 */
    static void mergeVersion(Map<String, Object> health, String rootJson) throws IOException {
        if (rootJson == null || rootJson.isEmpty()) return;
        @SuppressWarnings("unchecked")
        Map<String, Object> root = OBJECT_MAPPER.readValue(rootJson, Map.class);
        Object version = root.get("version");
        if (version instanceof Map) {
            Object number = ((Map<String, Object>) version).get("number");
            if (number != null) health.put("version", String.valueOf(number));
        }
    }

    /** 按 _id 删除单条文档。 */
    public Map<String, Object> deleteById(String index, String id) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("DELETE", "/" + index + "/_doc/" + id);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        return result;
    }

    /**
     * 全量覆盖写入单个文档（_source 整体替换，运维修正脏数据用）。
     * <p>注意：这是<b>整体覆盖</b>语义（PUT _doc），非字段级合并；调用方须传完整 _source。
     * refresh=true 保证写入后立即可搜，便于控制台编辑后刷新验证。</p>
     *
     * @return ES 响应（result: created/updated）
     */
    public Map<String, Object> updateDocument(String index, String id, String docJson) throws IOException {
        String encodedId;
        try {
            encodedId = java.net.URLEncoder.encode(id, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            encodedId = id;
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", "/" + index + "/_doc/" + encodedId + "?refresh=true");
        req.setJsonEntity(docJson);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        logger.info("[EsIndexAdmin] updateDocument index={} id={} result={}", index, id, result.get("result"));
        return result;
    }

    /** 按 query 批量删除文档 (_delete_by_query)。 */
    public Map<String, Object> deleteByQuery(String index, String queryDsl) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/" + index + "/_delete_by_query");
        req.setJsonEntity(queryDsl);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        return result;
    }

    /** 热更新索引 settings（不关闭索引）。 */
    public Map<String, Object> updateSettingsDynamic(String index, Map<String, Object> settings) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", "/" + index + "/_settings");
        req.setJsonEntity(OBJECT_MAPPER.writeValueAsString(settings));
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        return result;
    }

    /**
     * 向已有索引添加/更新字段 mapping（ES PUT _mapping API）。
     * <p>ES 仅允许<b>新增</b>字段或为已有 text 字段追加 multi-field；<b>不支持</b>删除字段或修改已有字段类型（需 reindex）。
     * 调用方应确保传入的 properties 不含对已有字段的破坏性修改。</p>
     *
     * @param index       物理索引名（或别名，ES 自动路由到 write index）
     * @param mappingJson mapping JSON body，如 {@code {"properties":{"new_field":{"type":"keyword"}}}}
     * @return ES 响应（含 acknowledged 字段）
     */
    public Map<String, Object> putMapping(String index, String mappingJson) throws IOException {
        Map<String, Object> result = putMappingVersionAware(index, mappingJson);
        logger.info("[EsIndexAdmin] putMapping index={} body={}", index, mappingJson);
        return result;
    }

    /**
     *  版本感知 PUT _mapping：6.x 目标 typeless 会报 400 mapping type is missing，
     * 必须走 {@code PUT /{index}/_mapping/{type}}（type 从现有 mapping 反查，老索引可能是自定义 type，
     * 拿不到回退 {@code _doc}，与 {@link #createIndexLegacy6} 同构）。
     * 版本未探到但目标实为 6.x 时，typeless 首发 400 再用 typed 路径重试一次兜底。
     */
    private Map<String, Object> putMappingVersionAware(String index, String mappingJson) throws IOException {
        io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter r = clientRouter;
        String version = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.es.rebuild.multicluster.EsVersionCaps.requiresMappingType(version)) {
            return performJson("PUT", "/" + index + "/_mapping/" + legacyMappingType(index), mappingJson);
        }
        try {
            return performJson("PUT", "/" + index + "/_mapping", mappingJson);
        } catch (org.elasticsearch.client.ResponseException e) {
            boolean typeMissing = e.getResponse().getStatusLine().getStatusCode() == 400
                    && String.valueOf(e.getMessage()).contains("mapping type is missing");
            if (!typeMissing) throw e;
            logger.info("[EsIndexAdmin] putMapping typeless 400（目标疑似 6.x），typed 路径重试: {}", index);
            return performJson("PUT", "/" + index + "/_mapping/" + legacyMappingType(index), mappingJson);
        }
    }

    /**
     * 6.x typed 路径的 type 名：从现有 mapping 反查首个非 {@code _default_} type；无 mapping（新索引）回退 {@code _doc}。
     */
    private String legacyMappingType(String index) {
        try {
            Map<String, Object> resp = performJson("GET", "/" + index + "/_mapping", null);
            for (Object idxEntry : resp.values()) {
                if (!(idxEntry instanceof Map)) continue;
                Object mappings = ((Map<?, ?>) idxEntry).get("mappings");
                if (!(mappings instanceof Map)) continue;
                for (Object k : ((Map<?, ?>) mappings).keySet()) {
                    String key = String.valueOf(k);
                    if (!"_default_".equals(key) && !"properties".equals(key)) return key;
                }
            }
        } catch (Exception e) {
            // 裁决（三态之②冷路径 WARN）：反查失败回退 _doc 的降级有真实代价——
            // 6.x 索引若实为自定义 type，后续 PUT _mapping/_doc 会以「more than 1 type」类
            // 错误失败，运营者看到的将是误导性下游根因；此处 WARN 把反查失败的真因留在日志
            // 因果链里。冷路径（用户触发的 putMapping / 文档级操作才走到），直接 WARN 无需
            // 节流；返回 _doc 契约不变（Observability552Test 反锁）。
            logger.warn("[EsIndexAdmin] 反查 6.x legacy mapping type 失败，回退 _doc: index={}",
                    index, e);
        }
        return "_doc";
    }

    /**
     *  版本感知文档级子路由：{@code _update}/{@code _explain}/{@code _termvectors} 的 typeless 形态
     * （{@code /{index}/_update/{id}}）是 7.0 才有的路由，6.x 会把 {@code _update} 段误解析成 type 名报
     * 400 invalid_type_name，必须走 {@code /{index}/{type}/{id}/_update}（type 同 {@link #legacyMappingType} 反查）。
     * 版本未探到时 typeless 首发 400 再 typed 路径重试一次兜底，与 {@link #putMappingVersionAware} 同构。
     *
     * @param op 子操作名（带下划线，如 {@code _update}）
     * @param qs 查询串（含前导 {@code ?}，无则传空串）
     */
    private Map<String, Object> performDocOpVersionAware(String method, String index, String encodedId,
                                                          String op, String qs, String body) throws IOException {
        String typeless = "/" + index + "/" + op + "/" + encodedId + qs;
        io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter r = clientRouter;
        String version = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.es.rebuild.multicluster.EsVersionCaps.requiresMappingType(version)) {
            return performJson(method, legacyDocOpPath(index, encodedId, op, qs), body);
        }
        try {
            return performJson(method, typeless, body);
        } catch (org.elasticsearch.client.ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() != 400) {
                throw e;
            }
            logger.info("[EsIndexAdmin] {} typeless 400（目标疑似 6.x），typed 路径重试: {}", op, index);
            return performJson(method, legacyDocOpPath(index, encodedId, op, qs), body);
        }
    }

    /** 6.x 文档级 typed 路径：{@code /{index}/{type}/{id}/{op}}。 */
    private String legacyDocOpPath(String index, String encodedId, String op, String qs) {
        return "/" + index + "/" + legacyMappingType(index) + "/" + encodedId + "/" + op + qs;
    }

    /**
     * 把 {@code "profile":true} 注入 DSL body，返回新的 body JSON。
     *
     * <p><b>为什么必须进 body、不能进 URL</b>：ES 的 {@code _search} 不接受 {@code profile}
     * 作为 URL 查询参数，传了会直接报
     * {@code illegal_argument_exception: request [...] contains unrecognized parameter: [profile]}。
     * 已对 ES 7.10.1 实测：{@code _search?profile=true} 报上述错，
     * 而 body 里带 {@code "profile":true} 正常返回 {@code profile.shards}。
     * 注意 {@code explain} 恰好相反 —— 它<b>是</b>合法的 URL 参数（实测可用），故不走这里。
     *
     * <p><b>为什么用 Jackson 解析回写、不用字符串拼接</b>：原先的
     * {@code substring(0, lastIndexOf('}')) + ",\"profile\":true}"} 在 body 为 {@code {}} 时
     * 会产出 {@code {,"profile":true}} 这种非法 JSON。
     * 非法 JSON 按本类 {@code count()} 的既有约定抛 {@link IllegalArgumentException}，
     * 而不是丢给 ES —— 否则用户拿到的是一次没有 profile 数据的普通搜索，且不知道为什么。
     *
     * <p>包可见 + static 是为了让 {@code ProfileFlagTest} 在无 ES 客户端的情况下直接测它。
     */
    static String withProfileFlag(String dslJson) {
        String body = dslJson == null || dslJson.trim().isEmpty() ? "{}" : dslJson.trim();
        Map<String, Object> dsl;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = OBJECT_MAPPER.readValue(body, Map.class);
            dsl = parsed;
        } catch (Exception e) {
            throw new IllegalArgumentException("DSL 不是合法 JSON: " + e.getMessage());
        }
        dsl.put("profile", true);
        try {
            return OBJECT_MAPPER.writeValueAsString(dsl);
        } catch (Exception e) {
            throw new IllegalArgumentException("DSL 序列化失败: " + e.getMessage());
        }
    }

    /**
     * Profile 查询（Query Profiler）：注入 {@code "profile":true} 后执行 _search，
     * 返回完整原始响应 JSON 文本（含 profile breakdown 段），由前端渲染火焰树。
     */
    public String profile(String indexOrAlias, String dslJson) throws IOException {
        String body = withProfileFlag(dslJson);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/" + indexOrAlias + "/_search");
        req.setJsonEntity(body);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        return org.apache.http.util.EntityUtils.toString(resp.getEntity());
    }

    /**
     * _count 预估（dry-run）：提取 dsl 中的 query 子树执行 _count；无 query 则 match_all。
     * 用于 delete-by-query 等高危操作前的「将影响 N 条」预估。
     */
    public Map<String, Object> count(String indexOrAlias, String dslJson) throws IOException {
        Object query = null;
        if (dslJson != null && !dslJson.trim().isEmpty()) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> dsl = OBJECT_MAPPER.readValue(dslJson.trim(), Map.class);
                query = dsl.get("query");
            } catch (Exception e) {
                throw new IllegalArgumentException("DSL 不是合法 JSON: " + e.getMessage());
            }
        }
        String body = query == null ? "{\"query\":{\"match_all\":{}}}"
                : "{\"query\":" + OBJECT_MAPPER.writeValueAsString(query) + "}";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/" + indexOrAlias + "/_count");
        req.setJsonEntity(body);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        return result;
    }

    /**
     * REST Playground：透传任意 ES REST 调用。path 必须以 "/" 开头且不含 ".."；
     * method 白名单 GET/POST/PUT/DELETE/HEAD。返回 {status, body(原始文本)}。
     */
    public Map<String, Object> raw(String method, String path, String body) throws IOException {
        if (path == null || !path.startsWith("/") || path.contains("..")) {
            throw new IllegalArgumentException("path 非法：须以 / 开头且不含 ..");
        }
        String m = method == null ? "GET" : method.trim().toUpperCase();
        if (!java.util.Arrays.asList("GET", "POST", "PUT", "DELETE", "HEAD").contains(m)) {
            throw new IllegalArgumentException("method 不支持: " + method);
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(m, path);
        if (body != null && !body.trim().isEmpty() && !"GET".equals(m) && !"HEAD".equals(m)) {
            req.setJsonEntity(body);
        }
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("status", resp.getStatusLine().getStatusCode());
        result.put("body", resp.getEntity() == null ? "" : org.apache.http.util.EntityUtils.toString(resp.getEntity()));
        return result;
    }

    // ═══ : 集群级运维观测能力（tasks/allocation/hot_threads/pending/nodes_stats/analyze/aliases） ═══

    /**
     * 列出集群任务（{@code GET /_tasks}）。返回结构化 {@code [{taskId,node,action,description,parentTaskId,startTimeMillis,runningTimeNanos,tookMs,cancellable}]}。
     * 支持 actions 过滤（如 {@code indices:data/write/reindex}）与 detailed。
     * tookMs=已运行毫秒（running_time_in_nanos 折算；ES _tasks 无 finished 概念，任务完成即从列表消失，
     * 语义与 AdhocRebuildJob「运行中=-1」不同，前端 TasksView 口径注释已同步）。
     */
    public java.util.List<Map<String, Object>> listTasks(String actions, boolean detailed) throws IOException {
        StringBuilder path = new StringBuilder("/_tasks?");
        path.append("detailed=").append(detailed);
        if (actions != null && !actions.trim().isEmpty()) {
            path.append("&actions=").append(java.net.URLEncoder.encode(actions.trim(), "UTF-8"));
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path.toString());
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> nodesMap = (Map<String, Object>) raw.get("nodes");
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        if (nodesMap == null) return out;
        for (Map.Entry<String, Object> ne : nodesMap.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> nodeInfo = (Map<String, Object>) ne.getValue();
            String nodeName = String.valueOf(nodeInfo.getOrDefault("name", ne.getKey()));
            @SuppressWarnings("unchecked")
            Map<String, Object> tasksMap = (Map<String, Object>) nodeInfo.get("tasks");
            if (tasksMap == null) continue;
            for (Map.Entry<String, Object> te : tasksMap.entrySet()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> t = (Map<String, Object>) te.getValue();
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("taskId", te.getKey());
                row.put("node", nodeName);
                row.put("action", t.get("action"));
                row.put("description", t.get("description"));
                row.put("parentTaskId", t.get("parent_task_id"));
                row.put("startTimeMillis", t.get("start_time_in_millis"));
                row.put("runningTimeNanos", t.get("running_time_in_nanos"));
                Object runningNanos = t.get("running_time_in_nanos");
                row.put("tookMs", runningNanos instanceof Number
                        ? ((Number) runningNanos).longValue() / 1_000_000L : -1L);
                row.put("cancellable", t.get("cancellable"));
                row.put("status", t.get("status"));
                out.add(row);
            }
        }
        return out;
    }

    /**
     * 取消集群任务（{@code POST /_tasks/{taskId}/_cancel}）。仅对 cancellable=true 的任务生效。
     */
    public Map<String, Object> cancelTask(String taskId) throws IOException {
        if (taskId == null || taskId.isEmpty() || !taskId.contains(":")) {
            throw new IllegalArgumentException("taskId 非法：应为 nodeId:taskNum 形式");
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/_tasks/" + taskId + "/_cancel");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        logger.info("[EsIndexAdmin] cancelTask taskId={}", taskId);
        return result;
    }

    /**
     * 分片分配诊断（{@code POST /_cluster/allocation/explain}）。body 可选：{@code {index, shard, primary}}；
     * 为 null/空则让 ES 自选第一个 unassigned shard 解释。返回原始 explain 结构，前端渲染 decisions 决策链。
     */
    public Map<String, Object> allocationExplain(String bodyJson) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/_cluster/allocation/explain");
        if (bodyJson != null && !bodyJson.trim().isEmpty()) {
            req.setJsonEntity(bodyJson);
        }
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        return result;
    }

    /**
     * 热点线程（{@code GET /_nodes/hot_threads}）。返回纯文本报告（多节点堆叠），前端 mono 字体渲染。
     */
    public String hotThreads(int threads, String interval, String type, String nodeId) throws IOException {
        StringBuilder path = new StringBuilder("/_nodes/");
        if (nodeId != null && !nodeId.trim().isEmpty()) {
            path.append(java.net.URLEncoder.encode(nodeId.trim(), "UTF-8")).append("/");
        }
        path.append("hot_threads?threads=").append(threads);
        if (interval != null && !interval.trim().isEmpty()) path.append("&interval=").append(interval.trim());
        if (type != null && !type.trim().isEmpty()) path.append("&type=").append(type.trim());
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path.toString());
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        return org.apache.http.util.EntityUtils.toString(resp.getEntity());
    }

    /**
     * Master 待处理任务（{@code GET /_cluster/pending_tasks}）。tasks 数组含 priority/insert_order/time_in_queue 等。
     */
    public Map<String, Object> pendingTasks() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_cluster/pending_tasks");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        return result;
    }

    /**
     * 节点 stats（{@code GET /_nodes/stats/jvm,fs,os,thread_pool}）。精简为每节点 {jvm.mem, fs.total, os.cpu, thread_pool.search/write/bulk}。
     */
    public java.util.List<Map<String, Object>> nodesStats() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_nodes/stats/jvm,fs,os,thread_pool");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> nodesMap = (Map<String, Object>) raw.get("nodes");
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        if (nodesMap == null) return out;
        for (Map.Entry<String, Object> ne : nodesMap.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> n = (Map<String, Object>) ne.getValue();
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("nodeId", ne.getKey());
            row.put("name", n.get("name"));
            row.put("host", n.get("host"));
            row.put("roles", n.get("roles"));
            @SuppressWarnings("unchecked")
            Map<String, Object> jvm = (Map<String, Object>) n.get("jvm");
            if (jvm != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> mem = (Map<String, Object>) jvm.get("mem");
                if (mem != null) {
                    Map<String, Object> j = new java.util.LinkedHashMap<>();
                    j.put("heapUsedBytes", mem.get("heap_used_in_bytes"));
                    j.put("heapMaxBytes", mem.get("heap_max_in_bytes"));
                    j.put("heapUsedPercent", mem.get("heap_used_percent"));
                    row.put("jvm", j);
                }
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> fs = (Map<String, Object>) n.get("fs");
            if (fs != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> total = (Map<String, Object>) fs.get("total");
                if (total != null) {
                    Map<String, Object> f = new java.util.LinkedHashMap<>();
                    f.put("totalBytes", total.get("total_in_bytes"));
                    f.put("freeBytes", total.get("free_in_bytes"));
                    f.put("availableBytes", total.get("available_in_bytes"));
                    row.put("fs", f);
                }
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> os = (Map<String, Object>) n.get("os");
            if (os != null) {
                Object cpu = os.get("cpu");
                // ES 5.x+ 把 load_average 挪到了 os.cpu.load_average（{1m,5m,15m}），旧位置 os.load_average 仅作兼容
                Object loadAvg = os.get("load_average");
                if (loadAvg == null && cpu instanceof Map) loadAvg = ((Map<?, ?>) cpu).get("load_average");
                Map<String, Object> o = new java.util.LinkedHashMap<>();
                if (cpu instanceof Map) o.put("cpuPercent", ((Map<?,?>) cpu).get("percent"));
                o.put("loadAverage", loadAvg);
                row.put("os", o);
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> tp = (Map<String, Object>) n.get("thread_pool");
            if (tp != null) {
                Map<String, Object> tpOut = new java.util.LinkedHashMap<>();
                for (String pool : new String[]{"search", "write", "bulk", "get", "flush", "refresh"}) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> p = (Map<String, Object>) tp.get(pool);
                    if (p != null) {
                        Map<String, Object> pp = new java.util.LinkedHashMap<>();
                        pp.put("active", p.get("active"));
                        pp.put("queue", p.get("queue"));
                        pp.put("rejected", p.get("rejected"));
                        pp.put("completed", p.get("completed"));
                        tpOut.put(pool, pp);
                    }
                }
                row.put("threadPool", tpOut);
            }
            out.add(row);
        }
        return out;
    }

    /**
     * 分词器测试（{@code POST /{index}/_analyze}）。index 可为 "_analyze" 走全局；
     * body 形如 {@code {"analyzer":"ik_smart","text":"..."}} 或 {@code {"tokenizer":"...","filter":[...]}}。
     */
    public Map<String, Object> analyze(String index, String bodyJson) throws IOException {
        String path = (index == null || index.isEmpty() || "_analyze".equals(index)) ? "/_analyze" : "/" + index + "/_analyze";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", path);
        req.setJsonEntity(bodyJson == null || bodyJson.trim().isEmpty() ? "{}" : bodyJson);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        return result;
    }

    /**
     * 别名全图（{@code GET /_alias}）。返回 {@code [{alias, index, isWriteIndex, filter, routing}]} 扁平列表，
     * 前端可自行按 alias 聚合展示指向关系。排除 . 开头系统索引。
     */
    public java.util.List<Map<String, Object>> listAllAliases() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_alias");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            String idx = e.getKey();
            if (idx.startsWith(".")) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> aliasesWrap = (Map<String, Object>) ((Map<String, Object>) e.getValue()).get("aliases");
            if (aliasesWrap == null || aliasesWrap.isEmpty()) continue;
            for (Map.Entry<String, Object> ae : aliasesWrap.entrySet()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> aMeta = (Map<String, Object>) ae.getValue();
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("alias", ae.getKey());
                row.put("index", idx);
                row.put("isWriteIndex", aMeta.get("is_write_index"));
                row.put("filter", aMeta.get("filter"));
                row.put("routing", aMeta.get("index_routing"));
                out.add(row);
            }
        }
        out.sort((a, b) -> {
            int c = String.valueOf(a.get("alias")).compareTo(String.valueOf(b.get("alias")));
            return c != 0 ? c : String.valueOf(a.get("index")).compareTo(String.valueOf(b.get("index")));
        });
        return out;
    }

    /**
     * 字段级部分更新（_update partial doc）：body 形如 {"doc":{...}}，
     * 与 {@link #updateDocument} 的整体覆盖语义区分，供表格单元格 Pending Changes 批量提交。
     * refresh=true 保证提交后立即可搜。
     */
    public Map<String, Object> updatePartial(String index, String id, String partialDocJson) throws IOException {
        String encodedId;
        try {
            encodedId = java.net.URLEncoder.encode(id, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            encodedId = id;
        }
        /* typeless _update 是 7.0 才有的路由，经版本感知路径兼容 6.x */
        Map<String, Object> result = performDocOpVersionAware("POST", index, encodedId,
                "_update", "?refresh=true", "{\"doc\":" + partialDocJson + "}");
        logger.info("[EsIndexAdmin] updatePartial index={} id={} result={}", index, id, result.get("result"));
        return result;
    }

    // ═══ : 平台/分布式能力（templates / snapshot / shards distribution） ═══

    /**
     * 列出所有索引模板（{@code _index_template}）与组件模板（{@code _component_template}）并集。
     * 返回 {@code {index_templates:[{name,index_patterns,priority,version,composed_of,template}], component_templates:[{name,template,version}]}}。
     * <p>：composable template 是 7.8+ 才有的 API，目标集群更低版本（6.x / 7.7-）时
     * 降级读 legacy {@code /_template}，归一化成同构形状并附 {@code legacy:true} 标记。
     */
    public Map<String, Object> listTemplates() throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        if (!supportsComposableTemplateNow()) {
            org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_template");
            org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
            java.util.List<Map<String, Object>> list = new java.util.ArrayList<>();
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("name", e.getKey());
                row.put("index_template", e.getValue());
                list.add(row);
            }
            out.put("index_templates", list);
            out.put("component_templates", Collections.emptyList());
            out.put("legacy", Boolean.TRUE);
            return out;
        }
        out.put("index_templates", performGetJsonList("/_index_template", "index_templates"));
        out.put("component_templates", performGetJsonList("/_component_template", "component_templates"));
        return out;
    }

    @SuppressWarnings("unchecked")
    private java.util.List<Map<String, Object>> performGetJsonList(String path, String field) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        Object list = raw.get(field);
        return list instanceof java.util.List ? (java.util.List<Map<String, Object>>) list : Collections.emptyList();
    }

    /**
     * 创建/更新索引或组件模板。
     * @param kind 取值 {@code index} 或 {@code component}
     */
    public Map<String, Object> putTemplate(String kind, String name, String bodyJson) throws IOException {
        String base = resolveTemplateBase(kind);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", base + "/" + name);
        req.setJsonEntity(bodyJson);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] putTemplate kind={} name={} result={}", kind, name, result);
        return result;
    }

    /** 删除索引或组件模板。 */
    public Map<String, Object> deleteTemplate(String kind, String name) throws IOException {
        String base = resolveTemplateBase(kind);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("DELETE", base + "/" + name);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] deleteTemplate kind={} name={} result={}", kind, name, result);
        return result;
    }

    /* 模板端点版本感知——路由到目标集群时按其版本选 composable / legacy API */
    private boolean supportsComposableTemplateNow() {
        io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter r = clientRouter;
        String v = r == null ? null : r.currentEsVersion();
        return io.github.dengmeiluan.es.rebuild.multicluster.EsVersionCaps.supportsComposableTemplate(v);
    }

    private String resolveTemplateBase(String kind) {
        boolean composable = supportsComposableTemplateNow();
        if ("component".equalsIgnoreCase(kind)) {
            if (!composable) {
                throw new IllegalStateException("目标集群不支持 component_template（需 7.8+），请改用 legacy 索引模板");
            }
            return "/_component_template";
        }
        return composable ? "/_index_template" : "/_template";
    }

    /** 列出已注册的 snapshot repositories。返回 {@code [{name,type,settings}]}。 */
    public java.util.List<Map<String, Object>> listSnapshotRepositories() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_snapshot");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) e.getValue();
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("name", e.getKey());
            row.put("type", meta.get("type"));
            row.put("settings", meta.get("settings"));
            out.add(row);
        }
        return out;
    }

    /** 列出指定 repo 下所有 snapshot。 */
    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> listSnapshots(String repo) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_snapshot/" + repo + "/_all?ignore_unavailable=true");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        Object list = raw.get("snapshots");
        return list instanceof java.util.List ? (java.util.List<Map<String, Object>>) list : Collections.emptyList();
    }

    /** 创建 snapshot（非阻塞，wait_for_completion=false）。body 可传 indices/include_global_state 等。 */
    public Map<String, Object> createSnapshot(String repo, String name, String bodyJson) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", "/_snapshot/" + repo + "/" + name + "?wait_for_completion=false");
        if (bodyJson != null && !bodyJson.trim().isEmpty()) req.setJsonEntity(bodyJson);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] createSnapshot repo={} name={} result={}", repo, name, result);
        return result;
    }

    /** 恢复 snapshot（非阻塞）。body 可传 indices/rename_pattern/rename_replacement/include_global_state 等。 */
    public Map<String, Object> restoreSnapshot(String repo, String name, String bodyJson) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/_snapshot/" + repo + "/" + name + "/_restore?wait_for_completion=false");
        if (bodyJson != null && !bodyJson.trim().isEmpty()) req.setJsonEntity(bodyJson);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] restoreSnapshot repo={} name={} result={}", repo, name, result);
        return result;
    }

    /** 删除 snapshot（过期快照清理）。 */
    public Map<String, Object> deleteSnapshot(String repo, String name) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("DELETE", "/_snapshot/" + repo + "/" + name);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] deleteSnapshot repo={} name={} result={}", repo, name, result);
        return result;
    }

    /**
     * 分片分布（{@code _cat/shards}）结构化返回。
     * <p>返回 {@code [{index,shard,prirep,state,docs,storeBytes,node,ip}]}，供前端分布式拓扑 SVG 渲染。</p>
     */
    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> shardsDistribution(String indexPattern) throws IOException {
        String path = "/_cat/shards" + (indexPattern != null && !indexPattern.trim().isEmpty()
                ? "/" + java.net.URLEncoder.encode(indexPattern.trim(), "UTF-8")
                : "") + "?format=json&bytes=b&h=index,shard,prirep,state,docs,store,node,ip";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        java.util.List<Map<String, Object>> raw = OBJECT_MAPPER.readValue(body, java.util.List.class);
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>(raw.size());
        for (Map<String, Object> row : raw) {
            String idx = String.valueOf(row.get("index"));
            if (idx == null || idx.startsWith(".")) continue;
            Map<String, Object> shard = new java.util.LinkedHashMap<>();
            shard.put("index", idx);
            shard.put("shard", parseIntSafe(row.get("shard")));
            shard.put("prirep", row.get("prirep"));
            shard.put("state", row.get("state"));
            shard.put("docs", parseLongSafe(row.get("docs")));
            shard.put("storeBytes", parseLongSafe(row.get("store")));
            shard.put("node", row.get("node"));
            shard.put("ip", row.get("ip"));
            out.add(shard);
        }
        return out;
    }

    private static Integer parseIntSafe(Object o) {
        if (o == null) return null;
        try { return Integer.parseInt(o.toString()); } catch (Exception e) { return null; }
    }
    private static Long parseLongSafe(Object o) {
        if (o == null) return null;
        try { return Long.parseLong(o.toString()); } catch (Exception e) { return null; }
    }

    /* =========================================================
     * 深度产品化 - 搜索沙盒/热Setting/Reroute/ILM
     * ========================================================= */

    /**
     * DSL 沙盒：执行 _search，可启 explain、profile、高亮。
     * <p>前端传入 body。后端透传到 {@code POST /{index}/_search}。</p>
     *
     * @param index    目标索引（可空=全局）
     * @param bodyJson DSL JSON
     * @param explain  是否带 explain
     * @param profile  是否带 profile
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> searchDsl(String index, String bodyJson, boolean explain, boolean profile) throws IOException {
        String path = (index == null || index.trim().isEmpty() ? "" : "/" + java.net.URLEncoder.encode(index.trim(), "UTF-8"))
                + "/_search";
        java.util.List<String> qp = new java.util.ArrayList<>();
        if (explain) qp.add("explain=true");
        /* profile 绝不能进 URL —— ES 会报 unrecognized parameter: [profile]，
           这条路径下 Profile 火焰图从来没能用过。它必须进 body，见 withProfileFlag 的说明。
           explain 留在 URL 是对的：实测它是合法的 URL 参数。 */
        if (!qp.isEmpty()) path += "?" + String.join("&", qp);
        String effectiveBody = bodyJson == null || bodyJson.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : bodyJson;
        if (profile) effectiveBody = withProfileFlag(effectiveBody);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", path);
        req.setJsonEntity(effectiveBody);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 获取索引当前 settings（结合默认值，include_defaults=true）。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getIndexSettings(String index) throws IOException {
        String path = "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_settings?include_defaults=true&flat_settings=false";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 热更新索引 settings（{@code PUT /{index}/_settings}）。
     * <p>仅支持可动态变更的参数（refresh_interval, number_of_replicas, blocks.*, routing.*）；
     * static setting 需 close-open 不在此接口范围内。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> updateIndexSettings(String index, String bodyJson) throws IOException {
        if (bodyJson == null || bodyJson.trim().isEmpty()) throw new IllegalArgumentException("settings body 为空");
        String path = "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_settings";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", path);
        req.setJsonEntity(bodyJson);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 集群 reroute（手工换盘分片）。
     * <p>body 样例：
     * <pre>{"commands":[{"move":{"index":"i","shard":0,"from_node":"A","to_node":"B"}}]}</pre>
     * 支持 dry_run=true 预览。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> clusterReroute(String bodyJson, boolean dryRun, boolean explain) throws IOException {
        java.util.List<String> qp = new java.util.ArrayList<>();
        if (dryRun) qp.add("dry_run=true");
        if (explain) qp.add("explain=true");
        String path = "/_cluster/reroute" + (qp.isEmpty() ? "" : "?" + String.join("&", qp));
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", path);
        req.setJsonEntity(bodyJson == null || bodyJson.trim().isEmpty() ? "{\"commands\":[]}" : bodyJson);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * ILM 策略列表（{@code GET /_ilm/policy}）。
     * <p>返回 {@code [{name, policy, version, modified_date}]} 列表化。</p>
     */
    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> listIlmPolicies() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_ilm/policy");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        Map<String, Object> map = OBJECT_MAPPER.readValue(body, Map.class);
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : map.entrySet()) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("name", e.getKey());
            if (e.getValue() instanceof Map) row.putAll((Map<String, Object>) e.getValue());
            out.add(row);
        }
        return out;
    }

    /** PUT /_ilm/policy/{name} 创建/更新 ILM 策略（此前策略变更只能去 REST 手写 JSON）。 */
    public Map<String, Object> putIlmPolicy(String name, String bodyJson) throws IOException {
        return performJson("PUT", "/_ilm/policy/" + java.net.URLEncoder.encode(name, "UTF-8"), bodyJson);
    }

    /** DELETE /_ilm/policy/{name} 删除 ILM 策略。 */
    public Map<String, Object> deleteIlmPolicy(String name) throws IOException {
        return performJson("DELETE", "/_ilm/policy/" + java.net.URLEncoder.encode(name, "UTF-8"), null);
    }

    /**
     * 索引 ILM explain（{@code GET /{index}/_ilm/explain}）。
     * <p>列出当前 phase / action / step 以及 step_info。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> explainIlm(String index) throws IOException {
        String path = "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_ilm/explain";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /* ================================================================
     * 深度产品化 - Cluster Settings / Task Manager /
     *      Shard Stores / Snapshot Status / Reindex Preview
     * ================================================================ */

    /**
     * 集群级设置全景（{@code GET /_cluster/settings?include_defaults=true&flat_settings=false}）。
     * <p>返回三层：{@code persistent} / {@code transient} / {@code defaults}。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getClusterSettings() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "GET", "/_cluster/settings?include_defaults=true&flat_settings=false");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 集群级设置下发（{@code PUT /_cluster/settings}）。
     * <p>bodyJson 需包含 {@code persistent} 和/或 {@code transient} 两层。传 {@code null} 将重置到默认。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> putClusterSettings(String bodyJson) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", "/_cluster/settings");
        req.setJsonEntity(bodyJson == null || bodyJson.trim().isEmpty() ? "{}" : bodyJson);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 分片存储分布（{@code GET /{index}/_shard_stores}），支持 {@code status=red,yellow} 过滤。
     * <p>返回每个 shard 在哪些 node 上有副本及其健康状态，用于定位失联/丢失分片。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> shardStores(String index, String status) throws IOException {
        StringBuilder path = new StringBuilder();
        if (index != null && !index.trim().isEmpty()) {
            path.append('/').append(java.net.URLEncoder.encode(index.trim(), "UTF-8"));
        }
        path.append("/_shard_stores");
        if (status != null && !status.trim().isEmpty()) path.append("?status=").append(status.trim());
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path.toString());
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 快照进度详情（{@code GET /_snapshot/{repo}/{name}/_status}）。
     * <p>较 GET /_snapshot/{repo}/{name} 多出实时进度（started_at / stats / shards）。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> snapshotStatus(String repo, String name) throws IOException {
        String path;
        if (repo == null || repo.trim().isEmpty()) {
            path = "/_snapshot/_status";
        } else if (name == null || name.trim().isEmpty()) {
            path = "/_snapshot/" + java.net.URLEncoder.encode(repo.trim(), "UTF-8") + "/_current/_status";
        } else {
            path = "/_snapshot/" + java.net.URLEncoder.encode(repo.trim(), "UTF-8")
                    + "/" + java.net.URLEncoder.encode(name.trim(), "UTF-8") + "/_status";
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 快照进度归一化摘要：与 {@link #snapshotStatus(String, String)} 同请求路径、同 client 通道，
     * 只是把原始深层体（{@code snapshots[0].indices.<name>.shards.<n>.stage}）压平成前端可直接渲染的
     * 聚合视图（见 {@link #normalizeSnapshotStatus(Map, String, String)}）。
     * <p>控制台经 {@code GET internal/es/index/cluster/snapshot/status?summary=true} 分派到本方法；
     * 缺省端点仍走 {@link #snapshotStatus(String, String)} 原始透传，零破坏兼容。</p>
     */
    public Map<String, Object> snapshotStatusSummary(String repo, String name) throws IOException {
        return normalizeSnapshotStatus(snapshotStatus(repo, name), repo, name);
    }

    /**
     * 快照 _status 归一化（纯静态、无 IO、容错优先——缺字段/类型不符/null 一律按 0/空集合兜底，不抛异常）。
     * <p>输出形状：</p>
     * <pre>{ repository, snapshot, state, startTimeMillis,
     *   shardsStats: { total, done, failed },   // 快照级：优先取体内 shards_stats，缺失时回退为逐索引聚合
     *   pct,                                    // done/total*100 四舍五入，total=0 记 0
     *   indices: [ { index, shardsTotal, shardsDone, shardsFailed,
     *                stageCounts: { INIT, STARTED, START, FINALIZE, DONE, FAILURE } } ] }</pre>
     * <p>indices 保持原始响应顺序；shardsTotal/Done/Failed 与 stageCounts 均按逐分片 stage 计数
     * （shards 为 ES 实际形状——按分片号 keyed 的对象，List 形状一并兼容）。六个 stage 键恒存在（0 兜底），
     * 未知 stage 按原样追加计数键；体内自带 repository/snapshot 时以体内为准。</p>
     *
     * @param raw        {@code GET /_snapshot/{repo}/{name}/_status} 原始响应（可为 null）
     * @param repository 请求参数仓库名；体内缺 repository 时兜底
     * @param snapshot   请求参数快照名；体内缺 snapshot 时兜底
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> normalizeSnapshotStatus(Map<String, Object> raw, String repository, String snapshot) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        String repoName = repository == null ? "" : repository.trim();
        String snapName = snapshot == null ? "" : snapshot.trim();
        String state = "";
        long startTimeMillis = 0L;
        long total = 0L;
        long done = 0L;
        long failed = 0L;
        java.util.List<Map<String, Object>> indices = new java.util.ArrayList<>();
        if (raw != null && raw.get("snapshots") instanceof java.util.List) {
            java.util.List<?> snapshots = (java.util.List<?>) raw.get("snapshots");
            if (!snapshots.isEmpty() && snapshots.get(0) instanceof Map) {
                Map<String, Object> snap = (Map<String, Object>) snapshots.get(0);
                repoName = firstNonBlank(stringOf(snap.get("repository")), repoName);
                snapName = firstNonBlank(stringOf(snap.get("snapshot")), snapName);
                state = stringOf(snap.get("state"));
                Long stm = asLong(snap.get("start_time_millis"));
                if (stm != null) startTimeMillis = stm;
                Map<String, Object> snapShardsStats = asObjectMap(snap.get("shards_stats"));
                if (snapShardsStats != null) {
                    total = orZero(asLong(snapShardsStats.get("total")));
                    done = orZero(asLong(snapShardsStats.get("done")));
                    failed = orZero(asLong(snapShardsStats.get("failed")));
                }
                Map<String, Object> idxMap = asObjectMap(snap.get("indices"));
                if (idxMap != null) {
                    for (Map.Entry<String, Object> e : idxMap.entrySet()) {
                        if (!(e.getValue() instanceof Map)) continue;
                        indices.add(normalizeSnapshotIndexStatus(e.getKey(), (Map<String, Object>) e.getValue()));
                    }
                }
                if (snapShardsStats == null && !indices.isEmpty()) {
                    /* 快照级 shards_stats 缺失：回退为逐索引聚合，保证 shardsStats 与 indices 自洽 */
                    for (Map<String, Object> idx : indices) {
                        total += orZero(asLong(idx.get("shardsTotal")));
                        done += orZero(asLong(idx.get("shardsDone")));
                        failed += orZero(asLong(idx.get("shardsFailed")));
                    }
                }
            }
        }
        out.put("repository", repoName);
        out.put("snapshot", snapName);
        out.put("state", state);
        out.put("startTimeMillis", startTimeMillis);
        Map<String, Object> shardsStats = new java.util.LinkedHashMap<>();
        shardsStats.put("total", total);
        shardsStats.put("done", done);
        shardsStats.put("failed", failed);
        out.put("shardsStats", shardsStats);
        out.put("pct", total <= 0L ? 0L : Math.round(done * 100.0d / total));
        out.put("indices", indices);
        return out;
    }

    /**
     * 单索引快照进度归一化：逐分片按 stage 计数（缺 shards / 缺 stage 按 0 兜底）。
     */
    private static Map<String, Object> normalizeSnapshotIndexStatus(String index, Map<String, Object> idx) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("index", index);
        Map<String, Object> stageCounts = new java.util.LinkedHashMap<>();
        stageCounts.put("INIT", 0L);
        stageCounts.put("STARTED", 0L);
        stageCounts.put("START", 0L);
        stageCounts.put("FINALIZE", 0L);
        stageCounts.put("DONE", 0L);
        stageCounts.put("FAILURE", 0L);
        long shardsTotal = countShardsByStage(idx.get("shards"), stageCounts);
        out.put("shardsTotal", shardsTotal);
        out.put("shardsDone", stageCounts.get("DONE"));
        out.put("shardsFailed", stageCounts.get("FAILURE"));
        out.put("stageCounts", stageCounts);
        return out;
    }

    /**
     * 逐分片按 stage 计数并累计总数：shards 兼容对象（ES 实际形状，按分片号 keyed）与数组两种形状；
     * 未知 stage 按原样追加键，缺 stage 的分片只计入总数。返回分片总数。
     */
    private static long countShardsByStage(Object shardsObj, Map<String, Object> stageCounts) {
        java.util.Collection<?> shards = null;
        if (shardsObj instanceof Map) {
            shards = ((Map<?, ?>) shardsObj).values();
        } else if (shardsObj instanceof java.util.List) {
            shards = (java.util.List<?>) shardsObj;
        }
        if (shards == null) {
            return 0L;
        }
        long total = 0L;
        for (Object v : shards) {
            if (!(v instanceof Map)) continue;
            total++;
            String stage = stringOf(((Map<?, ?>) v).get("stage"));
            if (stage.isEmpty()) continue;
            Object prev = stageCounts.get(stage);
            stageCounts.put(stage, (prev instanceof Number ? ((Number) prev).longValue() : 0L) + 1L);
        }
        return total;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asObjectMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : null;
    }

    /** Object → 去空白 String，非 String 一律空串（缺字段兜底）。 */
    private static String stringOf(Object o) {
        return o instanceof String ? ((String) o).trim() : "";
    }

    /** 取第一个非空白串（体内值优先于请求参数兜底）。 */
    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isEmpty() ? a : b;
    }

    private static long orZero(Long v) {
        return v == null ? 0L : v;
    }

    /**
     * 单任务详情（{@code GET /_tasks/{taskId}}），包含 description / status.total / running_time_in_nanos。
     * <p>{@code waitForCompletion=false} 即时返回，只看当前快照。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> taskDetail(String taskId) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "GET", "/_tasks/" + java.net.URLEncoder.encode(taskId, "UTF-8") + "?wait_for_completion=false");
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * Reindex 预估：对 source 跑 {@code POST /{src}/_count?body=query} 获 doc 数，再
     * 取 {@code GET /{src}/_stats/store} 获 primary size，经验公式估算目标索引将写入的 doc 数与 size。
     * <p>完全不写任何数据，安全。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> reindexPreview(String source, String queryJson) throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        String enc = java.net.URLEncoder.encode(source, "UTF-8");
        /* 1) count with optional query */
        org.elasticsearch.client.Request cnt = new org.elasticsearch.client.Request("POST", "/" + enc + "/_count");
        cnt.setJsonEntity(queryJson == null || queryJson.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : queryJson);
        org.elasticsearch.client.Response cntResp = restHighLevelClient().getLowLevelClient().performRequest(cnt);
        Map<String, Object> cntMap = OBJECT_MAPPER.readValue(
                org.apache.http.util.EntityUtils.toString(cntResp.getEntity()), Map.class);
        long docs = ((Number) cntMap.getOrDefault("count", 0)).longValue();
        out.put("docs", docs);

        /* 2) primary store size + total docs */
        org.elasticsearch.client.Request st = new org.elasticsearch.client.Request(
                "GET", "/" + enc + "/_stats/store,docs");
        org.elasticsearch.client.Response stResp = restHighLevelClient().getLowLevelClient().performRequest(st);
        Map<String, Object> stMap = OBJECT_MAPPER.readValue(
                org.apache.http.util.EntityUtils.toString(stResp.getEntity()), Map.class);
        long totalDocs = 0L;
        long primaryBytes = 0L;
        Object indicesObj = stMap.get("indices");
        if (indicesObj instanceof Map) {
            for (Object v : ((Map<String, Object>) indicesObj).values()) {
                if (!(v instanceof Map)) continue;
                Map<String, Object> ent = (Map<String, Object>) v;
                Object primaries = ent.get("primaries");
                if (primaries instanceof Map) {
                    Map<String, Object> pri = (Map<String, Object>) primaries;
                    Object docsBlk = pri.get("docs");
                    if (docsBlk instanceof Map) {
                        Object c = ((Map<String, Object>) docsBlk).get("count");
                        if (c instanceof Number) totalDocs += ((Number) c).longValue();
                    }
                    Object storeBlk = pri.get("store");
                    if (storeBlk instanceof Map) {
                        Object sib = ((Map<String, Object>) storeBlk).get("size_in_bytes");
                        if (sib instanceof Number) primaryBytes += ((Number) sib).longValue();
                    }
                }
            }
        }
        out.put("sourceTotalDocs", totalDocs);
        out.put("sourcePrimaryBytes", primaryBytes);
        double avg = totalDocs > 0 ? (double) primaryBytes / (double) totalDocs : 0.0;
        out.put("avgDocBytes", avg);
        out.put("estimatedTargetBytes", Math.round(avg * docs));
        return out;
    }

    /* ================================================================
     * 一键综合体检 healthReport
     * ================================================================ */

    /**
     * 一键集群体检：聚合 cluster/health + 不健康索引 + pending tasks + 节点负载，
     * 打分并产出固定结构报告（前端可直接渲染 / 导出 Markdown）。
     * <p>评分规则：初始 100 分，每项 critical -25、warn -10、info 不扣，min 0。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> healthReport() throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("generatedAt", java.time.OffsetDateTime.now().toString());
        java.util.List<Map<String, Object>> checks = new java.util.ArrayList<>();
        int score = 100;

        /* 1) cluster/health
            信噪比：按「根因」计罚一次，不再让同一件事（yellow=副本未分配）在
           cluster.status / shards.unassigned / indices.yellow 三处重复扣分把常态打成「严重问题」。
           且区分 red（主分片不可用=事故）与 yellow（副本未分配）：单数据节点集群任何 rep>=1
           的索引恒 yellow，属拓扑常态而非异常，只提示不扣分。 */
        Map<String, Object> ch = performJson("GET", "/_cluster/health", null);
        out.put("clusterHealth", ch);
        String status = String.valueOf(ch.getOrDefault("status", "unknown"));
        int dataNodes = intOf(ch.get("number_of_data_nodes"));
        boolean singleDataNode = dataNodes <= 1;
        boolean red = "red".equalsIgnoreCase(status);
        boolean yellow = "yellow".equalsIgnoreCase(status);
        if (red) {
            checks.add(check("critical", "cluster.status", "集群状态 RED，存在不可用主分片（数据面事故，立即处置）", null));
            score -= 40;
        } else if (yellow && !singleDataNode) {
            checks.add(check("warn", "cluster.status", "集群状态 YELLOW，副本分片未分配（多节点集群应排查：节点掉线/磁盘水位/分配规则）", null));
            score -= 20;
        } else if (yellow) {
            checks.add(check("info", "cluster.status",
                    "集群状态 YELLOW：单数据节点无法放置副本分片（拓扑常态，非异常）；如需 GREEN 可将索引副本数调为 0", null));
        } else {
            checks.add(check("info", "cluster.status", "集群状态 GREEN", null));
        }
        int unassigned = intOf(ch.get("unassigned_shards"));
        int initializing = intOf(ch.get("initializing_shards"));
        int relocating = intOf(ch.get("relocating_shards"));
        int pending = intOf(ch.get("number_of_pending_tasks"));
        long queueWaitMs = longOf(ch.get("task_max_waiting_in_queue_millis"));
        if (unassigned > 0) {
            /* 未分配数是 status 的细化说明，不再独立扣分（根因已计罚一次） */
            if (red) {
                checks.add(check("critical", "shards.unassigned", unassigned + " 个分片未分配（含主分片）", null));
            } else if (singleDataNode) {
                checks.add(check("info", "shards.unassigned", unassigned + " 个副本分片未分配（单数据节点无处放置副本，常态）", null));
            } else {
                checks.add(check("warn", "shards.unassigned", unassigned + " 个副本分片未分配", null));
            }
        }
        if (initializing > 0) {
            checks.add(check("info", "shards.initializing", initializing + " 个分片初始化中", null));
        }
        if (relocating > 0) {
            checks.add(check("info", "shards.relocating", relocating + " 个分片重定位中", null));
        }
        if (pending > 0) {
            String lvl = pending > 20 ? "critical" : "warn";
            checks.add(check(lvl, "pending.tasks", pending + " 个 pending task", null));
            score -= "critical".equals(lvl) ? 25 : 10;
        }
        if (queueWaitMs > 30_000L) {
            checks.add(check("warn", "queue.wait", "任务队列最大等待 " + (queueWaitMs / 1000) + "s", null));
            score -= 10;
        }

        /* 2) 不健康索引列表（部分发行版 _cat/indices 的 health 参数不支持逗号多值→拉全量后代码侧过滤） */
        java.util.List<Map<String, Object>> allIdx = performJsonArray(
                "GET", "/_cat/indices?format=json&h=index,health,pri,rep,docs.count,store.size");
        java.util.List<Map<String, Object>> unhealthy = new java.util.ArrayList<>();
        for (Map<String, Object> m : allIdx) {
            String h = String.valueOf(m.get("health"));
            if ("red".equalsIgnoreCase(h) || "yellow".equalsIgnoreCase(h)) unhealthy.add(m);
        }
        out.put("unhealthyIndices", unhealthy);
        if (!unhealthy.isEmpty()) {
            long reds = unhealthy.stream().filter(m -> "red".equalsIgnoreCase(String.valueOf(m.get("health")))).count();
            long yellows = unhealthy.size() - reds;
            /* 索引级红黄就是集群 status 的构成因子，列表供定位，不再叠加扣分 */
            if (reds > 0) {
                checks.add(check("critical", "indices.red", reds + " 个索引 RED（主分片不可用，见下方清单）", null));
            }
            if (yellows > 0) {
                checks.add(check(singleDataNode ? "info" : "warn", "indices.yellow",
                        yellows + " 个索引 YELLOW（副本未分配" + (singleDataNode ? "，单数据节点常态" : "") + "）", null));
            }
        } else {
            checks.add(check("info", "indices.health", "全部索引 GREEN", null));
        }

        /* 3) allocation explain（仅在有未分配时） */
        if (unassigned > 0) {
            try {
                Map<String, Object> exp = performJson("POST", "/_cluster/allocation/explain", "{}");
                out.put("allocationExplain", exp);
                Object canAlloc = exp.get("can_allocate");
                if (canAlloc != null) {
                    checks.add(check("info", "allocation.explain",
                            "can_allocate=" + canAlloc, null));
                }
            } catch (IOException ignored) { /* 无内容时 ES 会 400 */ }
        }

        /* 4) pending tasks 详情 */
        try {
            Map<String, Object> pt = performJson("GET", "/_cluster/pending_tasks", null);
            out.put("pendingTasks", pt.getOrDefault("tasks", java.util.Collections.emptyList()));
        } catch (IOException e) {
            // 原裸 ignored{} 整段静默——pending 面失明时报告只显示「没有
            // pending task」，与集群真没任务无法区分。错误键与同方法 mappingsError/
            // settingsError/docCountError/aliasesError 兄弟键齐平；报告照常返回契约不变
            out.put("pendingTasksError", e.getMessage());
        }

        /* 5) 节点负载 */
        java.util.List<Map<String, Object>> nodes = performJsonArray(
                "GET", "/_cat/nodes?format=json&h=name,heap.percent,cpu,load_1m,disk.used_percent,ram.percent");
        out.put("nodes", nodes);
        int hotHeap = 0, hotDisk = 0, hotCpu = 0;
        for (Map<String, Object> n : nodes) {
            if (intOf(n.get("heap.percent")) >= 85) hotHeap++;
            if (intOf(n.get("disk.used_percent")) >= 85) hotDisk++;
            if (intOf(n.get("cpu")) >= 90) hotCpu++;
        }
        if (hotHeap > 0) { checks.add(check("warn", "nodes.heap", hotHeap + " 个节点 heap>=85%", null)); score -= 10; }
        if (hotDisk > 0) { checks.add(check("critical", "nodes.disk", hotDisk + " 个节点磁盘>=85%", null)); score -= 25; }
        if (hotCpu > 0) { checks.add(check("warn", "nodes.cpu", hotCpu + " 个节点 CPU>=90%", null)); score -= 10; }

        out.put("score", Math.max(0, score));
        out.put("checks", checks);
        Map<String, Object> summary = new java.util.LinkedHashMap<>();
        summary.put("status", status);
        summary.put("unassigned", unassigned);
        summary.put("initializing", initializing);
        summary.put("relocating", relocating);
        summary.put("pending", pending);
        summary.put("unhealthyIndices", unhealthy.size());
        summary.put("nodes", nodes.size());
        summary.put("hotNodes", hotHeap + hotDisk + hotCpu);
        out.put("summary", summary);
        return out;
    }

    private Map<String, Object> check(String level, String name, String message, Map<String, Object> details) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("level", level);
        m.put("name", name);
        m.put("message", message);
        if (details != null) m.put("details", details);
        return m;
    }
    @SuppressWarnings("unchecked")
    private Map<String, Object> performJson(String method, String path, String body) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(method, path);
        if (body != null) req.setJsonEntity(body);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        return OBJECT_MAPPER.readValue(org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
    }
    @SuppressWarnings("unchecked")
    private java.util.List<Map<String, Object>> performJsonArray(String method, String path) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(method, path);
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        return OBJECT_MAPPER.readValue(org.apache.http.util.EntityUtils.toString(resp.getEntity()), java.util.List.class);
    }
    private int intOf(Object v) {
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof String) {
            try { return Integer.parseInt((String) v); }
            catch (Exception e) {
                // 伪 0 兜底此前与合法 0 静默合流（解析失败不可见）——debug 留痕，返回值语义零变
                logger.debug("[EsIndexAdmin] intOf 解析失败按 0 兜底：{}: {}", e.getClass().getSimpleName(), e.getMessage());
                return 0;
            }
        }
        return 0;
    }
    private long longOf(Object v) {
        if (v instanceof Number) return ((Number) v).longValue();
        if (v instanceof String) {
            try { return Long.parseLong((String) v); }
            catch (Exception e) {
                // 同 intOf——debug 留痕，伪 0 兜底语义零变
                logger.debug("[EsIndexAdmin] longOf 解析失败按 0 兜底：{}: {}", e.getClass().getSimpleName(), e.getMessage());
                return 0L;
            }
        }
        return 0L;
    }

    /* ======== ：分布式运维 - SLM / Watcher / Remote Clusters ======== */

    /** SLM 快照策略列表（含最近执行时间/下次执行时间/统计）。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> slmPolicies() throws IOException {
        try {
            return performJson("GET", "/_slm/policy", null);
        } catch (Exception ex) {
            Map<String, Object> fallback = new java.util.LinkedHashMap<>();
            fallback.put("available", false);
            fallback.put("reason", ex.getMessage());
            fallback.put("policies", java.util.Collections.emptyMap());
            return fallback;
        }
    }

    /** SLM 立即执行某策略（业务侧手动兜底）。 */
    public Map<String, Object> slmExecute(String policyId) throws IOException {
        return performJson("POST", "/_slm/policy/" + policyId + "/_execute", null);
    }

    /** SLM 汇总状态（运行/停用/统计）。 */
    public Map<String, Object> slmStatus() throws IOException {
        try {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("status", performJson("GET", "/_slm/status", null));
            out.put("stats", performJson("GET", "/_slm/stats", null));
            return out;
        } catch (Exception ex) {
            Map<String, Object> fallback = new java.util.LinkedHashMap<>();
            fallback.put("available", false);
            fallback.put("reason", ex.getMessage());
            return fallback;
        }
    }

    /** Watcher 列表（仅 Elastic 版本商业授权可用，未启用时返回 available=false）。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> watcherList() throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        try {
            Map<String, Object> stats = performJson("GET", "/_watcher/stats", null);
            out.put("available", true);
            out.put("stats", stats);
            /* 尝试通过 .watches 索引读取列表，失败则忽略。 */
            try {
                Map<String, Object> body = new java.util.LinkedHashMap<>();
                body.put("size", 200);
                body.put("_source", new String[]{"metadata", "trigger", "actions"});
                Map<String, Object> hits = performJson("POST", "/.watches/_search", OBJECT_MAPPER.writeValueAsString(body));
                out.put("watches", hits);
            } catch (Exception ignore) {
                /* .watches 子查询失败升 WARN + 回填 reason（原静默置空）——
                 * 「没配任何 watch」与「.watches 索引读失败」须可分辨（.watches 不存在的 404
                 * 也走此路径，WARN 即「列表为空的原因留痕」）；低频（仅 Watcher 面板打开触发），
                 * 单条 WARN 不刷屏。字段名照抄本方法外层 catch 的 reason 形态。 */
                logger.warn("[EsIndexAdmin] .watches 列表读取失败，watches 置空（watcher 主体统计不受影响）: {}",
                        ignore.getMessage());
                out.put("watches", java.util.Collections.emptyMap());
                out.put("reason", ignore.getMessage());
            }
        } catch (Exception ex) {
            out.put("available", false);
            out.put("reason", ex.getMessage());
        }
        return out;
    }

    /** 远程集群配置 + 连接状态（CCS/CCR 依赖）。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> remoteClusters() throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        try {
            Map<String, Object> info = performJson("GET", "/_remote/info", null);
            out.put("remotes", info);
            /* 若没有配置任何远端，也返回一个空 map 保证前端渲染 */
            if (info == null || info.isEmpty()) {
                out.put("count", 0);
            } else {
                out.put("count", info.size());
            }
        } catch (Exception ex) {
            out.put("remotes", java.util.Collections.emptyMap());
            out.put("count", 0);
            out.put("reason", ex.getMessage());
        }
        /* 附带集群自身 name，用于前端展示 local vs remote */
        try {
            Map<String, Object> self = performJson("GET", "/", null);
            out.put("localClusterName", self.get("cluster_name"));
            out.put("localVersion", self.get("version"));
        } catch (Exception ex) {
            /* 本端信息失败升 WARN 留痕（原 catch (ignored) 完全空体）——远端列表
             * 正常而本端 name/version 静默缺列时无从排查。只加日志、不动返回结构：
             * remotes/count/localClusterName 形态是前端 RemoteClustersView 消费面，禁改。 */
            logger.warn("[EsIndexAdmin] remoteClusters 本端信息（GET /）读取失败，localClusterName/localVersion 缺省: {}",
                    ex.getMessage());
        }
        return out;
    }

    /* ======== ➕ /  自定义化扩展 ======== */

    /**
     * 高级 Reindex——完全自定义。
     * body 自由（可含 source.remote / source.query / dest.pipeline / script / conflicts 等），opts 支持
     * slices / refresh / wait_for_completion / requests_per_second / scroll / timeout / wait_for_active_shards。
     * 不强制幂等、不预检、不校验存在性。高级用户模式。
     */
    public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) throws IOException {
        if (body == null || body.trim().isEmpty()) {
            throw new IllegalArgumentException("reindex body 不能为空，至少包含 source.index / dest.index");
        }
        Map<String, String> o = opts == null ? java.util.Collections.emptyMap() : opts;
        StringBuilder path = new StringBuilder("/_reindex");
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "slices", o.get("slices"));
        addQ(qs, "refresh", o.get("refresh"));
        addQ(qs, "wait_for_completion", o.get("waitForCompletion"));
        addQ(qs, "requests_per_second", o.get("requestsPerSecond"));
        addQ(qs, "scroll", o.get("scroll"));
        addQ(qs, "timeout", o.get("timeout"));
        addQ(qs, "wait_for_active_shards", o.get("waitForActiveShards"));
        if (!qs.isEmpty()) path.append('?').append(String.join("&", qs));
        Map<String, Object> resp = performJson("POST", path.toString(), body);
        Map<String, Object> out = new java.util.LinkedHashMap<>(resp);
        Object t = resp.get("task");
        if (t != null) out.put("taskId", String.valueOf(t));
        out.put("finalPath", path.toString());
        return out;
    }

    /** _update_by_query —— 按 query 批量更新。body: {query, script?}。opts 同 reindex。 */
    public Map<String, Object> updateByQuery(String indexPattern, String body, Map<String, String> opts) throws IOException {
        if (indexPattern == null || indexPattern.trim().isEmpty()) throw new IllegalArgumentException("indexPattern 不能为空");
        Map<String, String> o = opts == null ? java.util.Collections.emptyMap() : opts;
        StringBuilder path = new StringBuilder("/").append(indexPattern).append("/_update_by_query");
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "conflicts", o.get("conflicts"));
        addQ(qs, "slices", o.get("slices"));
        addQ(qs, "refresh", o.get("refresh"));
        addQ(qs, "wait_for_completion", o.get("waitForCompletion"));
        addQ(qs, "requests_per_second", o.get("requestsPerSecond"));
        addQ(qs, "scroll", o.get("scroll"));
        addQ(qs, "timeout", o.get("timeout"));
        addQ(qs, "wait_for_active_shards", o.get("waitForActiveShards"));
        addQ(qs, "max_docs", o.get("maxDocs"));
        if (!qs.isEmpty()) path.append('?').append(String.join("&", qs));
        Map<String, Object> resp = performJson("POST", path.toString(), body == null || body.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : body);
        Map<String, Object> out = new java.util.LinkedHashMap<>(resp);
        Object t = resp.get("task");
        if (t != null) out.put("taskId", String.valueOf(t));
        out.put("finalPath", path.toString());
        return out;
    }

    /** _delete_by_query —— 按 query 批量删除。 */
    public Map<String, Object> deleteByQuery(String indexPattern, String body, Map<String, String> opts) throws IOException {
        if (indexPattern == null || indexPattern.trim().isEmpty()) throw new IllegalArgumentException("indexPattern 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("delete_by_query body 不能为空，必须显式 query（防误删）");
        Map<String, String> o = opts == null ? java.util.Collections.emptyMap() : opts;
        StringBuilder path = new StringBuilder("/").append(indexPattern).append("/_delete_by_query");
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "conflicts", o.get("conflicts"));
        addQ(qs, "slices", o.get("slices"));
        addQ(qs, "refresh", o.get("refresh"));
        addQ(qs, "wait_for_completion", o.get("waitForCompletion"));
        addQ(qs, "requests_per_second", o.get("requestsPerSecond"));
        addQ(qs, "scroll", o.get("scroll"));
        addQ(qs, "timeout", o.get("timeout"));
        addQ(qs, "max_docs", o.get("maxDocs"));
        if (!qs.isEmpty()) path.append('?').append(String.join("&", qs));
        Map<String, Object> resp = performJson("POST", path.toString(), body);
        Map<String, Object> out = new java.util.LinkedHashMap<>(resp);
        Object t = resp.get("task");
        if (t != null) out.put("taskId", String.valueOf(t));
        out.put("finalPath", path.toString());
        return out;
    }

    /**
     * _bulk 直接下发，完全自定义。body 必须已经是 NDJSON（行尾换行）。
     * 前端已确保结尾添加换行，后端只作轻量健全。
     */
    public Map<String, Object> bulk(String indexOrNull, String ndjson, Map<String, String> opts) throws IOException {
        if (ndjson == null || ndjson.trim().isEmpty()) throw new IllegalArgumentException("bulk body 不能为空");
        if (!ndjson.endsWith("\n")) ndjson = ndjson + "\n";
        Map<String, String> o = opts == null ? java.util.Collections.emptyMap() : opts;
        StringBuilder path = new StringBuilder();
        if (indexOrNull != null && !indexOrNull.trim().isEmpty()) path.append('/').append(indexOrNull);
        path.append("/_bulk");
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "refresh", o.get("refresh"));
        addQ(qs, "pipeline", o.get("pipeline"));
        addQ(qs, "timeout", o.get("timeout"));
        addQ(qs, "wait_for_active_shards", o.get("waitForActiveShards"));
        if (!qs.isEmpty()) path.append('?').append(String.join("&", qs));
        /* 6.x bulk action 行强制要求 _type，7.x 形态 NDJSON（无 _type）会整请求 400——版本感知注入；
         * 版本未探到时首发 400 type is missing 再注入重试一次兜底（400 表示整请求被拒未执行，重试安全） */
        io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter r = clientRouter;
        String version = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.es.rebuild.multicluster.EsVersionCaps.requiresMappingType(version)) {
            ndjson = legacyBulkNdjson(indexOrNull, ndjson, this::legacyMappingType);
        }
        Map<String, Object> raw;
        try {
            raw = doBulkRequest(path.toString(), ndjson);
        } catch (org.elasticsearch.client.ResponseException e) {
            boolean typeMissing = e.getResponse().getStatusLine().getStatusCode() == 400
                    && String.valueOf(e.getMessage()).contains("type is missing");
            if (!typeMissing) throw e;
            logger.info("[EsIndexAdmin] bulk typeless 400（目标疑似 6.x），action 行注入 _type 重试");
            raw = doBulkRequest(path.toString(), legacyBulkNdjson(indexOrNull, ndjson, this::legacyMappingType));
        }
        /* 提取概要，方便前端直接 toast */
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("took", raw.get("took"));
        out.put("errors", raw.get("errors"));
        java.util.List<Map<String,Object>> items = (java.util.List<Map<String,Object>>) raw.getOrDefault("items", java.util.Collections.emptyList());
        int ok = 0, err = 0;
        java.util.List<Map<String,Object>> failed = new java.util.ArrayList<>();
        for (Map<String,Object> it : items) {
            Map<String,Object> op = it.values().stream().findFirst().map(v -> (Map<String,Object>) v).orElse(null);
            if (op == null) continue;
            Integer status = op.get("status") instanceof Number ? ((Number) op.get("status")).intValue() : null;
            if (status != null && status < 300) ok++;
            else { err++; if (failed.size() < 20) failed.add(op); }
        }
        out.put("okCount", ok);
        out.put("errCount", err);
        out.put("total", items.size());
        out.put("failedSample", failed);
        out.put("finalPath", path.toString());
        return out;
    }

    private Map<String, Object> doBulkRequest(String path, String ndjson) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", path);
        /* ContentType 不能带 charset——6.x 严格校验拒收 "application/x-ndjson; charset=UTF-8"（406） */
        req.setEntity(new org.apache.http.entity.StringEntity(ndjson,
                org.apache.http.entity.ContentType.create("application/x-ndjson")));
        org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
        return OBJECT_MAPPER.readValue(org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
    }

    /**
     * 6.x bulk 兼容——逐行解析 NDJSON，action 行（index/create/update/delete）meta 缺 {@code _type}
     * 时注入（type 由 typeResolver 反查，按索引缓存）；source 行原样透传。
     * 解析失败的行原样透传留给 ES 报错，不在这里拦。
     * <p>-C1 抽静态 + type 反查函数注入：剥离 REST 依赖，单测直接锁 NDJSON 改写行为。</p>
     */
    @SuppressWarnings("unchecked")
    static String legacyBulkNdjson(String indexOrNull, String ndjson,
                                   java.util.function.Function<String, String> typeResolver) {
        StringBuilder out = new StringBuilder();
        Map<String, String> typeCache = new java.util.HashMap<>();
        boolean expectSource = false;
        for (String line : ndjson.split("\n")) {
            if (line.trim().isEmpty()) continue;
            if (expectSource) {
                out.append(line).append('\n');
                expectSource = false;
                continue;
            }
            try {
                Map<String, Object> action = OBJECT_MAPPER.readValue(line, Map.class);
                String op = action.keySet().stream().findFirst().orElse("");
                if (!"index".equals(op) && !"create".equals(op) && !"update".equals(op) && !"delete".equals(op)) {
                    out.append(line).append('\n');
                    continue;
                }
                Map<String, Object> meta = action.get(op) instanceof Map
                        ? (Map<String, Object>) action.get(op) : new java.util.LinkedHashMap<>();
                action.put(op, meta);
                if (!meta.containsKey("_type")) {
                    String idx = meta.get("_index") != null ? String.valueOf(meta.get("_index")) : indexOrNull;
                    meta.put("_type", idx == null || idx.trim().isEmpty()
                            ? "_doc" : typeCache.computeIfAbsent(idx, typeResolver));
                }
                out.append(OBJECT_MAPPER.writeValueAsString(action)).append('\n');
                expectSource = !"delete".equals(op);
            } catch (Exception parseErr) {
                out.append(line).append('\n');
            }
        }
        return out.toString();
    }

    /**
     * ES SQL / _sql?format=json —— 分布式 SQL。
     * body: {"query":"SELECT ...","fetch_size":100} 或 {"cursor":"xx"} 分页。
     * <p>：6.x 的 SQL 端点挂在 {@code /_xpack/sql} 前缀下（6.3+ 就有 SQL 能力），
     * 打 7.x 路径 {@code /_sql} 会 405/400——此前被当成「未启用 _sql」假降级，
     * 实际 QA 6.7 实测 {@code POST /_xpack/sql} 可用，经 {@link #performSqlVersionAware} 修复。
     */
    public Map<String, Object> sqlQuery(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("sql body 不能为空");
        try {
            return performSqlVersionAware("?format=json", body);
        } catch (Exception ex) {
            /* 商业版才有 SQL，降级不抛 500 */
            Map<String, Object> fallback = new java.util.LinkedHashMap<>();
            fallback.put("available", false);
            fallback.put("reason", ex.getMessage());
            fallback.put("hint", "当前集群未启用 _sql 接口（OSS/未授权），请使用 DSL 查询面板");
            return fallback;
        }
    }

    /**
     *  版本感知 SQL 请求：6.x 走 {@code /_xpack/sql}，7+ 走 {@code /_sql}；
     * 版本未探到时 {@code /_sql} 首发 405（或 400 invalid_index_name，6.x 把 /_sql/translate
     * 误解析成索引名）再用 xpack 前缀重试一次兜底，与 {@link #putMappingVersionAware} 同构。
     *
     * @param subPath 端点后缀，如 {@code ?format=json}、{@code /translate}、{@code /close}
     */
    private Map<String, Object> performSqlVersionAware(String subPath, String body) throws IOException {
        io.github.dengmeiluan.es.rebuild.multicluster.EsClientRouter r = clientRouter;
        String version = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.es.rebuild.multicluster.EsVersionCaps.requiresMappingType(version)) {
            return performJson("POST", "/_xpack/sql" + subPath, body);
        }
        try {
            return performJson("POST", "/_sql" + subPath, body);
        } catch (org.elasticsearch.client.ResponseException e) {
            int sc = e.getResponse().getStatusLine().getStatusCode();
            boolean legacyShape = sc == 405
                    || (sc == 400 && String.valueOf(e.getMessage()).contains("invalid_index_name"));
            if (!legacyShape) throw e;
            logger.info("[EsIndexAdmin] /_sql{} 失败（目标疑似 6.x），/_xpack/sql 路径重试", subPath);
            return performJson("POST", "/_xpack/sql" + subPath, body);
        }
    }

    /** _sql/translate —— 把 SQL 转为 DSL，供前端一键“转为 DSL”。 */
    public Map<String, Object> sqlTranslate(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("sql body 不能为空");
        try {
            return performSqlVersionAware("/translate", body);
        } catch (Exception ex) {
            Map<String, Object> fallback = new java.util.LinkedHashMap<>();
            fallback.put("available", false);
            fallback.put("reason", ex.getMessage());
            return fallback;
        }
    }

    /** 若已开 fetch_size，SQL 可能返回 cursor，分页取下一页。 */
    public Map<String, Object> sqlCursor(String cursor) throws IOException {
        if (cursor == null || cursor.isEmpty()) throw new IllegalArgumentException("cursor 不能为空");
        return performSqlVersionAware("?format=json", "{\"cursor\":\"" + cursor.replace("\"", "\\\"") + "\"}");
    }

    /** 关闭 SQL cursor。 */
    public Map<String, Object> sqlClose(String cursor) throws IOException {
        if (cursor == null || cursor.isEmpty()) throw new IllegalArgumentException("cursor 不能为空");
        return performSqlVersionAware("/close", "{\"cursor\":\"" + cursor.replace("\"", "\\\"") + "\"}");
    }

    /** 单文档 GET，供前端 diff+patch 编辑器获取原文。 */
    public Map<String, Object> getDoc(String index, String id) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (id == null || id.isEmpty()) throw new IllegalArgumentException("id 不能为空");
        return performJson("GET", "/" + index + "/_doc/" + java.net.URLEncoder.encode(id, "UTF-8"), null);
    }

    /** 单文档 PUT/index（幂等覆盖）。 */
    public Map<String, Object> putDoc(String index, String id, String body, String refresh) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (id == null || id.isEmpty()) throw new IllegalArgumentException("id 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String p = "/" + index + "/_doc/" + java.net.URLEncoder.encode(id, "UTF-8");
        if (refresh != null && !refresh.isEmpty()) p += "?refresh=" + refresh;
        return performJson("PUT", p, body);
    }

    /** _update partial doc —— 局部更新。body: {"doc":{...}} 或 {"script":{...}}。：版本感知路径兼容 6.x。 */
    public Map<String, Object> updateDoc(String index, String id, String body, String refresh) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (id == null || id.isEmpty()) throw new IllegalArgumentException("id 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String encodedId = java.net.URLEncoder.encode(id, "UTF-8");
        String qs = refresh != null && !refresh.isEmpty() ? "?refresh=" + refresh : "";
        return performDocOpVersionAware("POST", index, encodedId, "_update", qs, body);
    }

    private static void addQ(java.util.List<String> qs, String k, String v) {
        if (v != null && !v.trim().isEmpty()) {
            try {
                qs.add(k + '=' + java.net.URLEncoder.encode(v, "UTF-8"));
            } catch (java.io.UnsupportedEncodingException e) {
                qs.add(k + '=' + v);
            }
        }
    }

    /* ============================================================
     *  深度产品化 —— painless / stored scripts / rollover / ILM ops / nodes stats brief
     * ============================================================ */

    /** POST /_scripts/painless/_execute —— 脚本沙盒试跑。 */
    public Map<String, Object> painlessExecute(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        try {
            return performJson("POST", "/_scripts/painless/_execute", body);
        } catch (Exception ex) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", ex.getMessage());
            out.put("hint", "当前集群未启用 painless _execute（可能是 OSS 或权限不足）");
            return out;
        }
    }

    /** 已存储脚本列表——从 cluster state metadata 中取出 stored_scripts。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listStoredScripts() throws IOException {
        Map<String, Object> resp = performJson("GET",
                "/_cluster/state/metadata?filter_path=metadata.stored_scripts", null);
        Map<String, Object> md = (Map<String, Object>) resp.getOrDefault("metadata", java.util.Collections.emptyMap());
        Object sc = md.get("stored_scripts");
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("scripts", sc == null ? java.util.Collections.emptyMap() : sc);
        int count = (sc instanceof Map) ? ((Map<?, ?>) sc).size() : 0;
        out.put("count", count);
        return out;
    }

    /** PUT /_scripts/{id} 保存脚本。body 形如 {"script":{"lang":"painless","source":"..."}} */
    public Map<String, Object> putStoredScript(String id, String body) throws IOException {
        if (id == null || id.trim().isEmpty()) throw new IllegalArgumentException("id 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        return performJson("PUT", "/_scripts/" + java.net.URLEncoder.encode(id, "UTF-8"), body);
    }

    /** DELETE /_scripts/{id} */
    public Map<String, Object> deleteStoredScript(String id) throws IOException {
        if (id == null || id.trim().isEmpty()) throw new IllegalArgumentException("id 不能为空");
        return performJson("DELETE", "/_scripts/" + java.net.URLEncoder.encode(id, "UTF-8"), null);
    }

    /** POST /{alias}/_rollover —— 手动滚动。body 可为 {"conditions":{...}} 或 null；dryRun 参数控制预检。 */
    public Map<String, Object> rolloverAlias(String alias, String body, boolean dryRun) throws IOException {
        if (alias == null || alias.trim().isEmpty()) throw new IllegalArgumentException("alias 不能为空");
        String path = "/" + alias + "/_rollover" + (dryRun ? "?dry_run" : "");
        return performJson("POST", path, body);
    }

    /** POST /_ilm/move/{index} 手动推进 ILM 到指定 step。 */
    public Map<String, Object> ilmMove(String index, String body) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        try {
            return performJson("POST", "/_ilm/move/" + java.net.URLEncoder.encode(index, "UTF-8"), body);
        } catch (Exception ex) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", ex.getMessage());
            return out;
        }
    }

    /** POST /_ilm/start */
    public Map<String, Object> ilmStart() throws IOException {
        try { return performJson("POST", "/_ilm/start", null); }
        catch (Exception ex) { Map<String, Object> o = new java.util.LinkedHashMap<>(); o.put("available", false); o.put("reason", ex.getMessage()); return o; }
    }

    /** POST /_ilm/stop */
    public Map<String, Object> ilmStop() throws IOException {
        try { return performJson("POST", "/_ilm/stop", null); }
        catch (Exception ex) { Map<String, Object> o = new java.util.LinkedHashMap<>(); o.put("available", false); o.put("reason", ex.getMessage()); return o; }
    }

    /** GET /_ilm/status */
    public Map<String, Object> ilmStatus() throws IOException {
        try { return performJson("GET", "/_ilm/status", null); }
        catch (Exception ex) { Map<String, Object> o = new java.util.LinkedHashMap<>(); o.put("available", false); o.put("reason", ex.getMessage()); return o; }
    }

    /** 实时监控大屏简化统计——只取 name/jvm.heap%/os.cpu.load/fs.total/indexing rate/search rate/线程池即时值（ 对标 Thread_pool Rows）。 */
    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> nodesStatsBrief() throws IOException {
        Map<String, Object> resp = performJson("GET",
                "/_nodes/stats/jvm,os,fs,indices,thread_pool?filter_path=nodes.*.name,nodes.*.host,nodes.*.roles,"
                        + "nodes.*.jvm.mem.heap_used_percent,nodes.*.jvm.mem.heap_used_in_bytes,nodes.*.jvm.mem.heap_max_in_bytes,"
                        + "nodes.*.os.cpu.percent,nodes.*.os.cpu.load_average,"
                        + "nodes.*.fs.total.total_in_bytes,nodes.*.fs.total.free_in_bytes,nodes.*.fs.total.available_in_bytes,"
                        + "nodes.*.indices.docs.count,nodes.*.indices.store.size_in_bytes,"
                        + "nodes.*.indices.indexing.index_total,nodes.*.indices.search.query_total,"
                        + "nodes.*.thread_pool.search.active,nodes.*.thread_pool.search.queue", null);
        Map<String, Object> nodes = (Map<String, Object>) resp.getOrDefault("nodes", java.util.Collections.emptyMap());
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : nodes.entrySet()) {
            Map<String, Object> n = (Map<String, Object>) e.getValue();
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("nodeId", e.getKey());
            row.put("name", n.get("name"));
            row.put("host", n.get("host"));
            row.put("roles", n.get("roles"));
            Map<String, Object> jvm = (Map<String, Object>) n.getOrDefault("jvm", java.util.Collections.emptyMap());
            Map<String, Object> mem = (Map<String, Object>) jvm.getOrDefault("mem", java.util.Collections.emptyMap());
            row.put("heapPct", mem.get("heap_used_percent"));
            row.put("heapUsed", mem.get("heap_used_in_bytes"));
            row.put("heapMax", mem.get("heap_max_in_bytes"));
            Map<String, Object> os = (Map<String, Object>) n.getOrDefault("os", java.util.Collections.emptyMap());
            Map<String, Object> cpu = (Map<String, Object>) os.getOrDefault("cpu", java.util.Collections.emptyMap());
            row.put("cpuPct", cpu.get("percent"));
            row.put("load", cpu.get("load_average"));
            Map<String, Object> fs = (Map<String, Object>) n.getOrDefault("fs", java.util.Collections.emptyMap());
            Map<String, Object> ft = (Map<String, Object>) fs.getOrDefault("total", java.util.Collections.emptyMap());
            row.put("diskTotal", ft.get("total_in_bytes"));
            row.put("diskFree", ft.get("free_in_bytes"));
            row.put("diskAvail", ft.get("available_in_bytes"));
            Map<String, Object> idx = (Map<String, Object>) n.getOrDefault("indices", java.util.Collections.emptyMap());
            Map<String, Object> docs = (Map<String, Object>) idx.getOrDefault("docs", java.util.Collections.emptyMap());
            Map<String, Object> store = (Map<String, Object>) idx.getOrDefault("store", java.util.Collections.emptyMap());
            Map<String, Object> indexing = (Map<String, Object>) idx.getOrDefault("indexing", java.util.Collections.emptyMap());
            Map<String, Object> search = (Map<String, Object>) idx.getOrDefault("search", java.util.Collections.emptyMap());
            row.put("docCount", docs.get("count"));
            row.put("storeSize", store.get("size_in_bytes"));
            row.put("indexTotal", indexing.get("index_total"));
            row.put("queryTotal", search.get("query_total"));
            /* 查询线程池即时值（对标阿里云 Thread_pool Rows；写入拒绝前兆，历史管道  同口径） */
            Map<String, Object> tp = (Map<String, Object>) n.getOrDefault("thread_pool", java.util.Collections.emptyMap());
            Map<String, Object> tpSearch = (Map<String, Object>) tp.getOrDefault("search", java.util.Collections.emptyMap());
            row.put("tpSearchActive", tpSearch.get("active"));
            row.put("tpSearchQueue", tpSearch.get("queue"));
            out.add(row);
        }
        return out;
    }

    /* ============================================================
     *  查询能力全通道（Query Bridge）
     *   专治 ES-SQL 硬伤：数组字段报错 / nested 不支持 / text 禁 GROUP BY / 翻页上限。
     *   新增 6 个 low-level：
     *     1. sqlLenient    — SQL 宽容模式（自动包 field_multi_value_leniency + 可选 runtime_mappings 拍平数组）
     *     2. luceneSearch  — query_string 通用查询（对数组/nested/text 全部友好）
     *     3. pitOpen       — Point-in-Time 开射（距离 10000 限制）
     *     4. pitSearch     — PIT + search_after 分布式深度分页
     *     5. pitClose      — 关闭 PIT
     *     6. resolveSchema — 字段结构探测，前端提示（哪些多值/nested/text）
     * ============================================================ */

    /**
     * SQL 宽容执行：自动注入 field_multi_value_leniency=true，允许对数组字段 SELECT 不报错（取首值）。
     * 也欢迎传入 runtime_mappings 拍平中间的多值/对象字段。
     * body: 任意 _sql 支持的 body，方法会自动将 field_multi_value_leniency 合入（如未显式提供）。
     */
    public Map<String, Object> sqlLenient(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String finalBody = body.trim();
        /* 小小的优雅注入：如果使用者未传 field_multi_value_leniency，帮他自动加。
         * 不依赖 Jackson，按字符串位置插入（普通 JSON 根为单层，可接受）。 */
        if (finalBody.startsWith("{") && !finalBody.contains("field_multi_value_leniency")) {
            finalBody = "{\"field_multi_value_leniency\":true," + finalBody.substring(1);
        }
        try {
            /* 经版本感知 SQL 路径（6.x 是 /_xpack/sql） */
            return performSqlVersionAware("?format=json", finalBody);
        } catch (Exception ex) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", ex.getMessage());
            out.put("hint", "当前集群未启用 _sql，或该查询违反 SQL 限制；建议改用 Lucene / DSL 接口");
            return out;
        }
    }

    /**
     * Lucene query_string 通用查询——对数组、nested、text 全部友好，不受 ES-SQL 硬伤影响。
     * 支持全部 Lucene 语法（+field:val AND status:ACTIVE tags:(red OR blue) name:hello*）。
     */
    public Map<String, Object> luceneSearch(String index, String q, int size, int from,
                                            String sortField, String sortOrder) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (q == null) q = "*";
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "q", q);
        if (size > 0) qs.add("size=" + size);
        if (from > 0) qs.add("from=" + from);
        if (sortField != null && !sortField.trim().isEmpty()) {
            String order = (sortOrder != null && sortOrder.equalsIgnoreCase("asc")) ? "asc" : "desc";
            qs.add("sort=" + java.net.URLEncoder.encode(sortField + ":" + order, "UTF-8"));
        }
        qs.add("lenient=true");
        qs.add("analyze_wildcard=true");
        qs.add("track_total_hits=true");
        String path = "/" + index + "/_search?" + String.join("&", qs);
        return performJson("GET", path, null);
    }

    /** 开启 Point-in-Time——分布式深度分页基石，keepAlive 如 "5m"。 */
    public Map<String, Object> pitOpen(String index, String keepAlive) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        String ka = (keepAlive == null || keepAlive.trim().isEmpty()) ? "5m" : keepAlive.trim();
        try {
            return performJson("POST", "/" + index + "/_pit?keep_alive="
                    + java.net.URLEncoder.encode(ka, "UTF-8"), null);
        } catch (Exception ex) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", ex.getMessage());
            out.put("hint", "当前集群不支持 Point-in-Time（需 ES 7.10+），可回退到 scroll");
            return out;
        }
    }

    /** PIT + search_after 分页：body 包含 pit.id、sort、可选 search_after 。 */
    public Map<String, Object> pitSearch(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        return performJson("POST", "/_search", body);
    }

    /** 关闭 PIT：释放集群保留的搜索上下文。 */
    public Map<String, Object> pitClose(String pitId) throws IOException {
        if (pitId == null || pitId.trim().isEmpty()) throw new IllegalArgumentException("pitId 不能为空");
        String bodyStr = "{\"id\":\"" + pitId.replace("\"", "\\\"") + "\"}";
        return performJson("DELETE", "/_pit", bodyStr);
    }

    /**
     * 字段结构探测——从 mapping 抓类型，从一行样本只当前实际多值/nested，前端能鼓胁提示。
     * 返回: { index, fields:[{name,type,isArray,isText,isNested,isKeyword,supportsSql}], warnings:[...] }
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> resolveSchema(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        /* 1. 拉 mapping */
        Map<String, Object> mResp = performJson("GET", "/" + index + "/_mapping", null);
        Map<String, Object> firstIdx = null;
        for (Map.Entry<String, Object> e : mResp.entrySet()) { firstIdx = (Map<String, Object>) e.getValue(); break; }
        Map<String, Object> mappings = firstIdx == null ? java.util.Collections.emptyMap()
                : unwrapTypeLayer((Map<String, Object>) firstIdx.getOrDefault("mappings", java.util.Collections.emptyMap()));
        Map<String, Object> props = (Map<String, Object>) mappings.getOrDefault("properties", java.util.Collections.emptyMap());

        /* 2. 拉一行样本探测实际多值 */
        java.util.Set<String> observedArrayFields = new java.util.HashSet<>();
        try {
            Map<String, Object> sample = performJson("POST", "/" + index + "/_search?size=1", "{\"query\":{\"match_all\":{}}}");
            Map<String, Object> hits = (Map<String, Object>) sample.getOrDefault("hits", java.util.Collections.emptyMap());
            java.util.List<Map<String, Object>> hitList = (java.util.List<Map<String, Object>>) hits.getOrDefault("hits", java.util.Collections.emptyList());
            if (!hitList.isEmpty()) {
                Map<String, Object> src = (Map<String, Object>) hitList.get(0).getOrDefault("_source", java.util.Collections.emptyMap());
                scanArrays(src, "", observedArrayFields);
            }
        } catch (Exception e) {
            // 裁决（三态之②冷路径 WARN）：样本行探测失败 → observedArrayFields 恒空
            // → isArray/isNested 判定降级 → supportsSql 启发式可能把「SQL 会破」的字段误报为
            // 安全，用户拿着错误结论去写 SQL 且无痕可查。冷路径（控制台显式触发 schema 解析
            // 才走到），直接 WARN 带 index 与堆栈；主流程返回契约不变（fields 仍按 mapping 给出，
            // Observability552Test 反锁）。
            logger.warn("[EsIndexAdmin] 样本行探测失败，数组/nested 识别降级"
                    + "（supportsSql 可能误判）: index={}", index, e);
        }

        /* 3. 展开字段 */
        java.util.List<Map<String, Object>> fields = new java.util.ArrayList<>();
        java.util.List<String> warnings = new java.util.ArrayList<>();
        walkFields(props, "", fields, warnings, observedArrayFields);

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("index", index);
        out.put("fields", fields);
        out.put("warnings", warnings);
        out.put("arrayFieldCount", observedArrayFields.size());
        return out;
    }

    @SuppressWarnings("unchecked")
    private static void scanArrays(Map<String, Object> src, String prefix, java.util.Set<String> out) {
        for (Map.Entry<String, Object> e : src.entrySet()) {
            String name = prefix.isEmpty() ? e.getKey() : (prefix + "." + e.getKey());
            Object v = e.getValue();
            if (v instanceof java.util.List) {
                out.add(name);
            } else if (v instanceof Map) {
                scanArrays((Map<String, Object>) v, name, out);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static void walkFields(Map<String, Object> props, String prefix,
                                   java.util.List<Map<String, Object>> out,
                                   java.util.List<String> warnings,
                                   java.util.Set<String> arrayFields) {
        for (Map.Entry<String, Object> e : props.entrySet()) {
            String name = prefix.isEmpty() ? e.getKey() : (prefix + "." + e.getKey());
            Map<String, Object> def = (Map<String, Object>) e.getValue();
            String type = String.valueOf(def.getOrDefault("type", "object"));
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("name", name);
            row.put("type", type);
            boolean isText = "text".equals(type);
            boolean isNested = "nested".equals(type);
            boolean isKeyword = "keyword".equals(type);
            boolean isArray = arrayFields.contains(name);
            row.put("isText", isText);
            row.put("isNested", isNested);
            row.put("isKeyword", isKeyword);
            row.put("isArray", isArray);
            /* supportsSql 启发式判断：数组/nested 在 SQL 中会破。 */
            boolean sqlOk = !(isArray || isNested);
            row.put("supportsSql", sqlOk);
            if (!sqlOk) {
                warnings.add("字段 [" + name + "] 为 " + (isNested ? "nested" : "array") + "，ES-SQL SELECT 将报错，建议改用 Lucene / DSL / PIT");
            }
            /* subfields (multi-fields) */
            Map<String, Object> subs = (Map<String, Object>) def.get("fields");
            if (subs != null && !subs.isEmpty()) {
                for (Map.Entry<String, Object> se : subs.entrySet()) {
                    Map<String, Object> sd = (Map<String, Object>) se.getValue();
                    Map<String, Object> sub = new java.util.LinkedHashMap<>();
                    sub.put("name", name + "." + se.getKey());
                    sub.put("type", sd.get("type"));
                    sub.put("isSubField", true);
                    sub.put("supportsSql", true);
                    out.add(sub);
                }
            }
            /* nested 内层 properties */
            Map<String, Object> childProps = (Map<String, Object>) def.get("properties");
            out.add(row);
            if (childProps != null && !childProps.isEmpty()) {
                walkFields(childProps, name, out, warnings, arrayFields);
            }
        }
    }

    /* ============ ：索引运维中枢（mapping / analysis / synonyms / plugins） ============ */

    /**
     * Mapping 详情——结构化返回字段树。
     * 每个字段：name / type / analyzer / search_analyzer / format / isNested / isObject / isMultiField / children[]。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getMappingDetail(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        Map<String, Object> raw = performJson("GET", "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_mapping", null);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("index", index);
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            Map<String, Object> body = (Map<String, Object>) e.getValue();
            Map<String, Object> mappings = body == null ? null : unwrapTypeLayer((Map<String, Object>) body.get("mappings"));
            Map<String, Object> props = mappings == null ? null : (Map<String, Object>) mappings.get("properties");
            java.util.List<Map<String, Object>> tree = new java.util.ArrayList<>();
            if (props != null) buildFieldTree(props, tree);
            out.put("tree", tree);
            out.put("raw", mappings);
            /* 快速统计 */
            int total = 0, nested = 0, text = 0, kw = 0, obj = 0;
            java.util.Deque<java.util.List<Map<String, Object>>> stk = new java.util.ArrayDeque<>();
            stk.push(tree);
            while (!stk.isEmpty()) {
                for (Map<String, Object> n : stk.pop()) {
                    total++;
                    String t = String.valueOf(n.get("type"));
                    if ("nested".equals(t)) nested++;
                    else if ("object".equals(t)) obj++;
                    else if ("text".equals(t)) text++;
                    else if ("keyword".equals(t)) kw++;
                    java.util.List<Map<String, Object>> ch = (java.util.List<Map<String, Object>>) n.get("children");
                    if (ch != null && !ch.isEmpty()) stk.push(ch);
                }
            }
            Map<String, Object> stats = new java.util.LinkedHashMap<>();
            stats.put("total", total); stats.put("nested", nested); stats.put("text", text); stats.put("keyword", kw); stats.put("object", obj);
            out.put("stats", stats);
            break;
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static void buildFieldTree(Map<String, Object> props, java.util.List<Map<String, Object>> out) {
        for (Map.Entry<String, Object> e : props.entrySet()) {
            String name = e.getKey();
            Map<String, Object> def = (Map<String, Object>) e.getValue();
            if (def == null) continue;
            Map<String, Object> node = new java.util.LinkedHashMap<>();
            node.put("name", name);
            String type = String.valueOf(def.getOrDefault("type", def.get("properties") != null ? "object" : "unknown"));
            node.put("type", type);
            if (def.get("analyzer") != null)         node.put("analyzer", def.get("analyzer"));
            if (def.get("search_analyzer") != null)  node.put("searchAnalyzer", def.get("search_analyzer"));
            if (def.get("format") != null)           node.put("format", def.get("format"));
            if (def.get("index") != null)            node.put("indexed", def.get("index"));
            if (def.get("doc_values") != null)       node.put("docValues", def.get("doc_values"));
            if (def.get("copy_to") != null)          node.put("copyTo", def.get("copy_to"));
            if (def.get("null_value") != null)       node.put("nullValue", def.get("null_value"));
            node.put("isNested", "nested".equals(type));
            node.put("isObject", "object".equals(type) || def.get("properties") != null);
            /* multi-fields */
            Map<String, Object> subs = (Map<String, Object>) def.get("fields");
            if (subs != null && !subs.isEmpty()) {
                java.util.List<Map<String, Object>> subList = new java.util.ArrayList<>();
                for (Map.Entry<String, Object> se : subs.entrySet()) {
                    Map<String, Object> sd = (Map<String, Object>) se.getValue();
                    Map<String, Object> sn = new java.util.LinkedHashMap<>();
                    sn.put("name", se.getKey());
                    sn.put("type", sd.get("type"));
                    sn.put("isMultiField", true);
                    if (sd.get("analyzer") != null) sn.put("analyzer", sd.get("analyzer"));
                    subList.add(sn);
                }
                node.put("multiFields", subList);
            }
            /* nested / object 递归 */
            Map<String, Object> childProps = (Map<String, Object>) def.get("properties");
            if (childProps != null && !childProps.isEmpty()) {
                java.util.List<Map<String, Object>> children = new java.util.ArrayList<>();
                buildFieldTree(childProps, children);
                node.put("children", children);
            }
            out.add(node);
        }
    }

    /**
     * Mapping 增加字段（只允许 add，不允许改/删；ES 硬性约束）。
     * body 期望是标准 mapping 片段 {"properties":{"newField":{"type":"keyword"}}}
     */
    public Map<String, Object> putMappingField(String index, String body) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        // 与 putMapping 同走版本感知路径（6.x 必须 typed，否则 400 mapping type is missing）
        return putMappingVersionAware(java.net.URLEncoder.encode(index, "UTF-8"), body);
    }

    /**
     * 读取索引 analysis 全景——analyzer / tokenizer / filter / char_filter / normalizer。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getAnalysisSettings(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        Map<String, Object> raw = performJson("GET",
            "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_settings?include_defaults=false&flat_settings=false", null);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("index", index);
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            Map<String, Object> body = (Map<String, Object>) e.getValue();
            Map<String, Object> settings = body == null ? null : (Map<String, Object>) body.get("settings");
            Map<String, Object> idx = settings == null ? null : (Map<String, Object>) settings.get("index");
            Map<String, Object> analysis = idx == null ? null : (Map<String, Object>) idx.get("analysis");
            out.put("analysis", analysis == null ? new java.util.LinkedHashMap<>() : analysis);
            /* 摘要计数 */
            Map<String, Object> summary = new java.util.LinkedHashMap<>();
            summary.put("analyzers",   analysis == null ? 0 : sizeOf(analysis.get("analyzer")));
            summary.put("tokenizers",  analysis == null ? 0 : sizeOf(analysis.get("tokenizer")));
            summary.put("filters",     analysis == null ? 0 : sizeOf(analysis.get("filter")));
            summary.put("charFilters", analysis == null ? 0 : sizeOf(analysis.get("char_filter")));
            summary.put("normalizers", analysis == null ? 0 : sizeOf(analysis.get("normalizer")));
            out.put("summary", summary);
            break;
        }
        return out;
    }

    private static int sizeOf(Object m) { return (m instanceof Map) ? ((Map<?, ?>) m).size() : 0; }

    /**
     * 更新 analysis 配置——自动执行 close→PUT settings→open 三步曲。
     * body 示例：{"analysis":{"filter":{"my_syn":{"type":"synonym_graph","synonyms":["car,auto"]}}}}
     */
    public Map<String, Object> updateAnalysisSettings(String index, String body) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        Map<String, Object> log = new java.util.LinkedHashMap<>();
        java.util.List<String> steps = new java.util.ArrayList<>();
        try {
            performJson("POST", "/" + enc + "/_close", null); steps.add("close-ok");
            performJson("PUT",  "/" + enc + "/_settings", body); steps.add("put-settings-ok");
        } finally {
            try { performJson("POST", "/" + enc + "/_open", null); steps.add("open-ok"); }
            catch (Exception ex) { steps.add("open-FAILED: " + ex.getMessage()); }
        }
        log.put("steps", steps);
        log.put("ok", steps.contains("put-settings-ok") && steps.contains("open-ok"));
        return log;
    }

    /**
     * 分词 API 试跑。body 支持指定 analyzer 或即席组合（tokenizer + filter + char_filter）。
     * 若 index 为空则走 /_analyze（builtin analyzer 才有效）。
     */
    public Map<String, Object> analyzeText(String index, String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String path = (index == null || index.trim().isEmpty())
            ? "/_analyze"
            : "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_analyze";
        return performJson("POST", path, body);
    }

    /**
     * 热重载搜索分词器（同义词/文件字典变更后无需 close-index）。
     * ES 7.3+ 支持；仅对 search_analyzer 生效，index_analyzer 变更仍需 close-open。
     */
    public Map<String, Object> reloadSearchAnalyzers(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        return performJson("POST", "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_reload_search_analyzers", null);
    }

    /**
     * 集群插件矩阵——`_cat/plugins?format=json`。
     * 返回：{ nodes:[{name, plugin, version, description}], summary:{pluginName:{installedOn:[node...], count}}, mismatches:[] }
     * mismatches 会标出"某插件未在所有节点上安装"这种脏 setup。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> pluginsList() throws IOException {
        Object raw;
        try {
            org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_cat/plugins?format=json&v=true");
            org.elasticsearch.client.Response resp = restHighLevelClient().getLowLevelClient().performRequest(req);
            String txt = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            raw = OBJECT_MAPPER.readValue(txt, java.util.List.class);
        } catch (Exception ex) {
            Map<String, Object> err = new java.util.LinkedHashMap<>();
            err.put("available", false);
            err.put("reason", ex.getMessage());
            return err;
        }
        java.util.List<Map<String, Object>> nodes = (java.util.List<Map<String, Object>>) raw;
        /* 汇总：某插件安装在哪几个节点 */
        java.util.Map<String, java.util.Set<String>> byPlugin = new java.util.LinkedHashMap<>();
        java.util.Set<String> allNodes = new java.util.LinkedHashSet<>();
        for (Map<String, Object> r : nodes) {
            String nn = String.valueOf(r.get("name"));
            String pn = String.valueOf(r.get("component"));
            if (nn == null || pn == null) continue;
            allNodes.add(nn);
            byPlugin.computeIfAbsent(pn, k -> new java.util.LinkedHashSet<>()).add(nn);
        }
        java.util.List<Map<String, Object>> summary = new java.util.ArrayList<>();
        java.util.List<String> mismatches = new java.util.ArrayList<>();
        for (Map.Entry<String, java.util.Set<String>> en : byPlugin.entrySet()) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("plugin", en.getKey());
            row.put("installedOn", new java.util.ArrayList<>(en.getValue()));
            row.put("count", en.getValue().size());
            row.put("complete", en.getValue().size() == allNodes.size());
            summary.add(row);
            if (en.getValue().size() != allNodes.size()) {
                java.util.Set<String> miss = new java.util.LinkedHashSet<>(allNodes);
                miss.removeAll(en.getValue());
                mismatches.add(en.getKey() + " 缺少节点：" + String.join(",", miss));
            }
        }
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("available", true);
        out.put("nodes", nodes);
        out.put("summary", summary);
        out.put("mismatches", mismatches);
        out.put("nodeCount", allNodes.size());
        out.put("pluginCount", byPlugin.size());
        return out;
    }

    /**
     * 便捷方法——把同义词列表写入索引级 synonym_graph filter。
     * 自动执行 close→PUT→open。字典编辑器专用。
     */
    public Map<String, Object> synonymsGraphUpsert(String index, String filterName, java.util.List<String> entries, boolean expand) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (filterName == null || filterName.trim().isEmpty()) filterName = "custom_synonyms";
        if (entries == null) entries = java.util.Collections.emptyList();
        StringBuilder body = new StringBuilder();
        body.append("{\"analysis\":{\"filter\":{\"").append(filterName).append("\":{\"type\":\"synonym_graph\",\"expand\":")
            .append(expand ? "true" : "false").append(",\"synonyms\":[");
        boolean first = true;
        for (String s : entries) {
            if (s == null || s.trim().isEmpty()) continue;
            if (!first) body.append(',');
            body.append('"').append(s.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
            first = false;
        }
        body.append("]}}}}");
        return updateAnalysisSettings(index, body.toString());
    }

    /* ==================== ：相关性打分实验室 ==================== */

    /**
     * 带 explain 的搜索透传。body 由前端自由控制（可含 explain:true / _name 命名子句）。
     */
    public Map<String, Object> searchRaw(String index, String body) throws IOException {
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        return performJson("POST", "/" + enc + "/_search", body);
    }

    /**
     * 对指定文档问“为什么得这个分 / 为什么没命中”。
     * body 形如 {"query":{...}}，命中时返回完整 BM25 解释树，未命中时 matched=false。
     */
    public Map<String, Object> explainDoc(String index, String id, String body) throws IOException {
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        String encId = java.net.URLEncoder.encode(id, "UTF-8");
        /* typeless _explain 是 7.0 才有的路由，经版本感知路径兼容 6.x */
        return performDocOpVersionAware("POST", enc, encId, "_explain", "", body);
    }

    /**
     * 查询校验 + Lucene 改写透视。看“我写的 match 实际被改写成什么”。
     */
    public Map<String, Object> validateQuery(String index, String body) throws IOException {
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        return performJson("POST", "/" + enc + "/_validate/query?explain=true&rewrite=true", body);
    }

    /**
     * 词频取证。指定文档指定字段的 term 统计（tf/ttf/doc_freq），打分调试的微观证据。
     */
    public Map<String, Object> termVectors(String index, String id, String fields) throws IOException {
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        String encId = java.net.URLEncoder.encode(id, "UTF-8");
        StringBuilder qs = new StringBuilder("?term_statistics=true&field_statistics=true&positions=false&offsets=false");
        if (fields != null && !fields.trim().isEmpty()) {
            qs.append("&fields=").append(java.net.URLEncoder.encode(fields.trim(), "UTF-8"));
        }
        /* typeless _termvectors 是 7.0 才有的路由，经版本感知路径兼容 6.x */
        return performDocOpVersionAware("GET", enc, encId, "_termvectors", qs.toString(), null);
    }

    /* ==================== ：搜索模板中心 + 别名管控台 ==================== */

    /**
     * mustache 模板渲染预览。body 形如 {"id":"tpl","params":{...}} 或 {"source":{...},"params":{...}}，
     * 返回渲染后的最终 DSL（template_output），不真正执行搜索。
     */
    public Map<String, Object> renderTemplate(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        return performJson("POST", "/_render/template", body);
    }

    /**
     * 执行搜索模板。POST /{index}/_search/template，body 同 _render/template。
     */
    public Map<String, Object> searchTemplate(String index, String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        return performJson("POST", "/" + enc + "/_search/template", body);
    }

    /**
     * 别名原子操作。POST /_aliases，body 形如 {"actions":[{"add":{...}},{"remove":{...}}]}，
     * 所有 action 在 ES 内部一次元数据变更中完成——零停机切流量的根基。
     */
    public Map<String, Object> aliasActions(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        return performJson("POST", "/_aliases", body);
    }
}
