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

package io.github.dengmeiluan.es.rebuild.core;

import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.fail;

/**
 * DevTools/REST 非 ADMIN raw 的系统边界：
 * 数据面检索与文档写入保留；集群设置、reroute、账号、快照创建删除、ILM/SLM、脚本、管道、
 * watcher/transform/CCR 与索引结构管理一律拒绝。尾斜杠、百分号编码、重复斜杠、矩阵参数
 * 不得改变判定结果。
 */
public class EsIndexAdminRawSystemGuard976Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private static void assertRejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    private static void assertAllowed(Runnable r, String why) {
        try {
            r.run();
        } catch (RuntimeException e) {
            fail("不应拒绝：" + why + "，实际=" + e.getMessage());
        }
    }

    @Test
    public void 集群与系统管理写一律拒绝() {
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_cluster/settings",
                "{\"persistent\":{\"cluster.routing.allocation.exclude._name\":\"*\"}}"), "集群设置");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_cluster/reroute",
                "{\"commands\":[]}"), "reroute");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_security/user/evil",
                "{\"password\":\"x\",\"roles\":[\"superuser\"]}"), "账号提权");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_snapshot/repo", "{}"), "快照仓库");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap", "{\"indices\":\"logs-*\"}"), "创建快照");
        assertRejected(() -> admin.guardRawGuarded("DELETE", "/_snapshot/repo/snap", null), "删除快照");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_ilm/policy/p", "{}"), "ILM 策略");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_ilm/move/logs", "{}"), "ILM move");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_slm/policy/p", "{}"), "SLM 策略");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_slm/policy/p/_execute", null), "SLM 执行");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_scripts/x", "{\"script\":{\"source\":\"1\"}}"), "脚本");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_ingest/pipeline/x", "{}"), "管道");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_tasks/x/_cancel", null), "取消任务");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_watcher/watch/x", "{}"), "watcher");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_transform/x", "{}"), "transform");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_ccr/auto_follow/x", "{}"), "CCR");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_data_stream/x", "{}"), "data stream");
    }

    @Test
    public void 索引结构管理写必须走专用页面() {
        assertRejected(() -> admin.guardRawGuarded("PUT", "/logs", "{}"), "建索引");
        assertRejected(() -> admin.guardRawGuarded("DELETE", "/logs", null), "删索引");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/logs/_mapping", "{}"), "改 mapping");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/logs/_settings", "{}"), "改 settings");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_alias/a", "{}"), "建别名");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_close", null), "关索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_forcemerge", null), "force merge");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_rollover", "{}"), "rollover");
    }

    @Test
    public void 数据面读写保留() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_doc", "{\"message\":\"hi\"}"), "新增文档");
        assertAllowed(() -> admin.guardRawGuarded("PUT", "/logs/_doc/1", "{\"message\":\"hi\"}"), "覆盖文档");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_update/1", "{\"doc\":{\"message\":\"hi\"}}"), "部分更新");
        assertAllowed(() -> admin.guardRawGuarded("DELETE", "/logs/_doc/1", null), "删除文档");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_delete_by_query",
                "{\"query\":{\"match_all\":{}}}"), "delete by query");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                "{\"query\":{\"match_all\":{}}}"), "update by query");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search",
                "{\"query\":{\"match_all\":{}}}"), "检索");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_bulk",
                "{\"index\":{\"_index\":\"logs\",\"_id\":\"1\"}}\n{\"message\":\"hi\"}\n"), "bulk");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_pit?keep_alive=1m", null), "PIT");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_cluster/health", null), "健康只读");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_cat/indices", null), "索引目录只读");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_security/_authenticate", null), "身份自检");
    }

    @Test
    public void 非管理员快照仓库视图脱敏云凭据() {
        Map<String, Object> repo = new java.util.LinkedHashMap<>();
        Map<String, Object> settings = new java.util.LinkedHashMap<>();
        settings.put("bucket", "logs");
        settings.put("access_key", "AK");
        settings.put("secret_key", "SK");
        settings.put("session_token", "TOK");
        repo.put("name", "s3");
        repo.put("settings", settings);
        java.util.List<Map<String, Object>> masked = EsIndexAdmin.maskSnapshotRepoSecrets(
                java.util.Collections.singletonList(repo));
        @SuppressWarnings("unchecked")
        Map<String, Object> ms = (Map<String, Object>) masked.get(0).get("settings");
        org.junit.Assert.assertEquals("***", ms.get("access_key"));
        org.junit.Assert.assertEquals("***", ms.get("secret_key"));
        org.junit.Assert.assertEquals("***", ms.get("session_token"));
        org.junit.Assert.assertEquals("logs", ms.get("bucket"));
    }

    @Test
    public void 空索引参数不得退化成全量() {
        assertRejected(() -> {
            try { admin.queryDsl("", "{}", 10); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "空索引 query");
        assertRejected(() -> {
            try { admin.getIndexSettings(""); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "空索引 settings");
        assertRejected(() -> {
            try { admin.searchTemplate("", "{}"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "空索引 search template");
        assertRejected(() -> {
            try { admin.profile("", "{}"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "空索引 profile");
        assertRejected(() -> {
            try { admin.count("", "{}"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "空索引 count");
    }

    @Test
    public void 敏感系统读不向非管理员开放() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_security/user", null), "用户列表");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_snapshot/repo", null), "仓库配置");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_scripts/x", null), "脚本内容");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_nodes/stats", null), "节点环境");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cluster/state", null), "全量集群元数据");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_watcher/watch/_execute", null), "watcher");
    }

    @Test
    public void 控制面与系统索引读取仍然拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/indices/es_console*", null), "cat 控制面");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/indices/.kibana", null), "点号系统索引");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/indices/es_console_validate_1", null), "校验临时索引");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search?index=es_console_validate_*", null), "校验临时索引查询");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_msearch",
                "{\"index\":\"es_console_validate_*\"}\n{}\n"), "校验临时索引 msearch");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search?index=es_console*", null), "查询控制面");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_field_caps?index=es_console_user", null), "字段控制面");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cluster/state/metadata/es_console_user", null), "元数据控制面");
        assertRejected(() -> admin.guardRawGuarded("GET", "/remote1:es_console_user/_search", null), "跨集群控制面");
    }

    @Test
    public void xpackSQL与控制面查询参数同样受守卫() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_xpack/sql",
                "{\"query\":\"SELECT * FROM es_console_users\"}"), "_xpack/sql 控制面");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_xpack/sql",
                "{\"query\":\"SELECT * FROM .security\"}"), "_xpack/sql 系统索引");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search?%69ndex=es_console_users", null),
                "编码参数名");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_mapping", null), "全量 mapping");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_settings", null), "全量 settings");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/repositories", null), "快照仓库目录");
    }

    @Test
    public void SQL通配不得借unicode注释或反引号绕过() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_xpack/sql",
                "{\"query\":\"SELECT * FROM " + "\\" + "u0065*\"}"), "unicode 转义通配");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_xpack/sql",
                "{\"query\":\"SELECT * FROM/**/e*\"}"), "块注释通配");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_xpack/sql",
                "{\"query\":\"SELECT * FROM `e*`\"}"), "反引号通配");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_xpack/sql",
                "{\"query\":\"SELECT * FROM -- x\ne*\"}"), "行注释通配");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_xpack/sql",
                "{\"query\":\"SELECT * FROM logs-*\"}"), "业务索引通配");
    }

    @Test
    public void 索引前缀的msearch_mget_bulk同样逐条守卫() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_msearch",
                "{\"index\":\"*\"}\n{}\n"), "前缀 msearch 通配头");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_msearch",
                "{\"index\":\"es_console_users\"}\n{}\n"), "前缀 msearch 控制面头");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_msearch",
                "{}\n{}\n"), "前缀 msearch 继承路径索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_mget",
                "{\"docs\":[{\"_index\":\".security\",\"_id\":\"x\"}]}"), "前缀 mget 系统索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_bulk",
                "{\"index\":{\"_index\":\".watches\",\"_id\":\"x\"}}\n{}\n"), "前缀 bulk 系统索引");
    }

    @Test
    public void 纯排除索引表达式不得隐式全量() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search?index=-logs", null), "全量减 logs");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_msearch",
                "{\"index\":\"-logs\"}\n{}\n"), "msearch 纯排除");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_reindex",
                "{\"source\":{\"index\":\"-logs\"},\"dest\":{\"index\":\"copy\"}}"), "reindex 纯排除");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_search?index=logs-*,-logs-archive", null), "正索引+排除");
    }

    @Test
    public void 路径变形不得绕过系统守卫() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_search/",
                "{\"query\":{\"match_all\":{}}}"), "尾斜杠全量搜索");
        assertRejected(() -> admin.guardRawGuarded("POST", "/%5Fsearch",
                "{\"query\":{\"match_all\":{}}}"), "编码系统段全量搜索");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/%5Fcluster/settings", "{}"), "编码集群设置");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_cluster;x=y/settings", "{}"), "矩阵参数");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap/_restore/", "{}"), "尾斜杠恢复全部");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/%2e%2e/_cluster/settings", "{}"), "目录穿越");
        assertRejected(() -> admin.guardRawGuarded("POST", "//__search", "{}"), "重复斜杠");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_all/_search", null), "全量别名");
    }

    @Test
    public void 结构化读与bulk同样不得触达控制面() {
        assertRejected(() -> {
            try { admin.searchRaw("es_console_users", "{}"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "search-raw 控制面");
        assertRejected(() -> {
            try { admin.searchRaw("remote:es_console_users", "{}"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "search-raw 跨集群");
        assertRejected(() -> {
            try { admin.getMappingDetail(".security"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "mapping 系统索引");
        assertRejected(() -> {
            try { admin.getAnalysisSettings("es_console_users"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "analysis 控制面");
        assertRejected(() -> {
            try { admin.getIndexSettings("es_console_users"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "settings 控制面");
        assertRejected(() -> {
            try { admin.luceneSearch("es_console_users", "*", 10, 0, null, null); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "lucene 控制面");
        assertRejected(() -> {
            try { admin.resolveSchema("es_console_users"); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "schema 控制面");
        assertRejected(() -> {
            try { admin.sqlLenient("{\"query\":\"SELECT * FROM es_console_users\"}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "sql lenient 控制面");
        assertRejected(() -> {
            try { admin.bulk(null, "{\"index\":{\"_index\":\".security\",\"_id\":\"x\"}}\n{}\n", null); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "bulk 系统索引");
    }

    @Test
    public void 快照恢复与reindex远程源补强() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap/_restore",
                "{\"indices\":\"logs-*\",\"include_global_state\":true}"), "恢复全局状态");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap/_restore",
                "{\"indices\":\"logs-*\",\"include_global_state\":\"true\"}"), "字符串布尔全局状态");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap/_restore",
                "{\"indices\":\"logs-*\",\"feature_states\":[\"security\"]}"), "恢复安全 feature state");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap/_restore",
                "{\"indices\":\"logs-*\"}"), "恢复业务索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_reindex",
                "{\"source\":{\"remote\":{\"host\":\"http://169.254.169.254\"},\"index\":\"logs\"},\"dest\":{\"index\":\"copy\"}}"),
                "reindex 远程源");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_reindex",
                "{\"source\":{\"index\":\"logs-*\"},\"dest\":{\"index\":\"copy\"}}"), "业务 reindex");
    }

    @Test
    public void 非管理员创建快照必须显式业务索引且不含全局状态() {
        assertRejected(() -> admin.guardSnapshotCreateBody(null), "空 body=全量");
        assertRejected(() -> admin.guardSnapshotCreateBody("{}"), "缺 indices=全量");
        assertRejected(() -> admin.guardSnapshotCreateBody("{\"indices\":\"*\"}"), "通配");
        assertRejected(() -> admin.guardSnapshotCreateBody("{\"indices\":\"es_console_*\"}"), "控制面");
        assertRejected(() -> admin.guardSnapshotCreateBody(
                "{\"indices\":\"logs-*\",\"include_global_state\":true}"), "全局状态");
        assertRejected(() -> admin.guardSnapshotCreateBody(
                "{\"indices\":\"logs-*\",\"include_global_state\":\"true\"}"), "字符串全局状态");
        assertRejected(() -> admin.guardSnapshotCreateBody(
                "{\"indices\":\"logs-*\",\"feature_states\":[\"security\"]}"), "feature state");
        assertAllowed(() -> admin.guardSnapshotCreateBody("{\"indices\":\"logs-*\"}"), "业务索引");
        assertAllowed(() -> admin.guardSnapshotCreateBody("{\"indices\":[\"logs-2026\",\"orders-*\"]}"), "业务索引数组");
    }

    @Test
    public void 合法别名与模板写入保留_删除模板拒绝() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_aliases",
                "{\"actions\":[{\"add\":{\"index\":\"logs-*\",\"alias\":\"rest\"}}]}"), "业务别名");
        assertAllowed(() -> admin.guardRawGuarded("PUT", "/_index_template/x",
                "{\"index_patterns\":[\"logs-*\"],\"template\":{}}"), "业务模板");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_index_template/x",
                "{\"template\":{}}"), "模板缺 patterns=catch-all");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_template/x",
                "{\"settings\":{}}"), "旧模板缺 patterns=catch-all");
        assertRejected(() -> admin.guardRawGuarded("DELETE", "/_index_template/x", null), "删模板");
    }
}
