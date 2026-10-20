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

import static org.junit.Assert.fail;

/**
 * 控制面索引守卫（通用数据端点不得触达 es_console_*）。
 *
 * <p>风险：VIEWER 可通过 /cluster/query、文档 CRUD、bulk/SQL/reindex 读写控制集群里的
 * es_console_user（密码哈希）/ es_console_ops_audit，绕过安全中心与审计权限。守卫覆盖
 * 精确名、通配模式、SQL FROM/JOIN、批量/重索引/模板/ILM/快照 body 与目录穿越编码。</p>
 */
public class EsIndexAdminControlGuard963Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private static void assertRejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void 控制索引路径拒绝_通配与穿越编码也不放过() {
        assertRejected(() -> admin.guardControlPath("/es_console_user/_doc/1"), "精确控制索引");
        assertRejected(() -> admin.guardControlPath("/ES_CONSOLE_USER/_search"), "大小写变体");
        assertRejected(() -> admin.guardControlPath("/%65s_console_user/_doc/1"), "百分号编码");
        assertRejected(() -> admin.guardControlPath("/%2e%2e/es_console_user/_search"), "目录穿越");
        assertRejected(() -> admin.guardControlPath("/es_console*/_search"), "通配控制索引");
        assertRejected(() -> admin.guardControlPath("/%2A/_search"), "全量通配");
        admin.guardControlPath("/es_console_validate_123/_mapping");
        admin.guardControlPath("/logs-*/_search");
        assertRejected(() -> admin.guardControlPath("/_all/_search"), "全量别名路径");
        admin.guardControlPath("/_cluster/health");
    }

    @Test
    public void 控制索引名与模式_校验临时索引放行() {
        admin.guardIndexName("es_console_validate_1");
        admin.guardIndexName("logs-2026");
        assertRejected(() -> admin.guardIndexName("es_console_user"), "用户库");
        assertRejected(() -> admin.guardIndexName("../es_console_user"), "穿越名");

        assertRejected(() -> admin.guardIndexPattern("*"), "全量");
        assertRejected(() -> admin.guardIndexPattern("_all"), "全量别名");
        assertRejected(() -> admin.guardIndexPattern("es_*"), "es 前缀通配");
        assertRejected(() -> admin.guardIndexPattern("e*"), "e 前缀通配");
        assertRejected(() -> admin.guardIndexPattern("logs-*,es_console_user"), "逗号列表夹带");
        admin.guardIndexPattern("logs-*");
        admin.guardIndexPattern("es_console_validate_*");
    }

    @Test
    public void 请求体与SQL守卫() {
        assertRejected(() -> admin.guardControlBody("{\"query\":\"SELECT * FROM es_console_user\"}"), "body 字面");
        assertRejected(() -> admin.guardControlBody("{\"source\":{\"index\":\"es_console_ops_audit\"}}"), "reindex body");
        assertRejected(() -> admin.guardSql("SELECT * FROM es_console_user"), "SQL 精确");
        assertRejected(() -> admin.guardSql("SELECT * FROM *"), "SQL 全量通配");
        assertRejected(() -> admin.guardSql("SELECT * FROM logs-* JOIN es_console_audit ON 1=1"), "SQL JOIN");
        admin.guardSql("SELECT * FROM logs-*");
        admin.guardControlBody("{\"doc\":{\"message\":\"hello\"}}");
        assertRejected(() -> admin.guardReindexBody("{\"source\":{\"index\":\"*\"},\"dest\":{\"index\":\"copy\"}}"),
                "reindex 全量通配");
        assertRejected(() -> admin.guardReindexBody("{\"source\":{\"index\":[\"logs-*\",\"es_console_user\"]},\"dest\":{\"index\":\"copy\"}}"),
                "reindex 数组夹带");
        admin.guardReindexBody("{\"source\":{\"index\":\"logs-*\"},\"dest\":{\"index\":\"copy\"}}");
        assertRejected(() -> {
            try { admin.rawGuarded("GET", "/_all/_search", null); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "raw 全量路径");
        assertRejected(() -> {
            try { admin.rawGuarded("GET", "/es_console_user/_search", null); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "raw 控制索引");
        assertRejected(() -> {
            try { admin.rawGuarded("POST", "/_bulk",
                    "{\"index\":{\"_index\":\"es_console_ops_audit\"}}\n{}\n"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "raw bulk 控制索引");
        assertRejected(() -> admin.guardRestoreBody(null), "restore 全部（空 body）");
        assertRejected(() -> admin.guardRestoreBody("{\"include_global_state\":true}"), "restore 缺 indices");
        assertRejected(() -> admin.guardRestoreBody("{\"indices\":\"*\"}"), "restore 全量通配");
        assertRejected(() -> admin.guardRestoreBody("{\"indices\":[\"logs-*\",\"es_console_user\"]}"), "restore 夹带控制索引");
        admin.guardRestoreBody("{\"indices\":\"logs-*\"}");
        admin.guardRestoreBody("{\"indices\":[\"logs-2026\",\"orders-*\"]}");
        assertRejected(() -> admin.guardIndexTemplateBody("{\"index_patterns\":[\"*\"]}"), "模板全量通配");
        assertRejected(() -> admin.guardIndexTemplateBody("{\"index_patterns\":[\"es_console_*\"]}"), "模板控制面通配");
        admin.guardIndexTemplateBody("{\"index_patterns\":[\"logs-*\",\"orders-*\"]}");
        admin.guardIndexTemplateBody("{\"template\":{\"settings\":{}}}");
    }

    @Test
    public void 宿主自定义控制索引实名同样受保护() {
        EsIndexAdmin custom = new EsIndexAdmin(null);
        custom.setExtraControlIndexNames(java.util.Arrays.asList("custom_users", "custom-monitor"));
        assertRejected(() -> custom.guardIndexName("custom_users"), "自定义用户库");
        assertRejected(() -> custom.guardIndexName("custom-monitor-2026.10.20"), "自定义监控日期索引");
        assertRejected(() -> custom.guardIndexPattern("custom_users*"), "自定义名通配");
        assertRejected(() -> custom.guardControlBody("{\"source\":{\"index\":\"custom_users\"}}"), "自定义名 body");
        custom.guardIndexName("logs-2026");
    }
}
