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

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * date-math 索引表达式加固：ES 会把 {@code <es_console_user>} 解析回控制索引，
 * 只按字面前缀判定时全部守卫失明；数据面端点必须拒绝 date-math 包装。
 */
public class EsIndexAdminDateMathGuard980Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private interface Throwing {
        void run() throws Exception;
    }

    private static void rejected(Throwing r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (Exception expected) {
            // ok
        }
    }

    @Test
    public void dateMath包装不得绕过精确名与模式守卫() {
        rejected(() -> admin.guardIndexName("<es_console_user>"), "date-math 用户库");
        rejected(() -> admin.guardIndexName("<.security>"), "date-math 系统索引");
        rejected(() -> admin.guardIndexPattern("<es_consol?_*>"), "date-math 通配控制面");
        rejected(() -> admin.guardIndexPattern("logs-<es_console_user>"), "date-math 嵌在模式中");
    }

    @Test
    public void dateMath包装不得绕过路径守卫() {
        rejected(() -> admin.guardControlPath("/<es_console_user>/_doc/admin"), "裸 date-math 路径");
        rejected(() -> admin.guardControlPath("/%3Ces_console_user%3E/_search"), "编码 date-math 路径");
        rejected(() -> admin.guardRawGuarded("PUT", "/<es_consol?_user>/_doc/evil", "{}"), "raw date-math 写入");
    }

    @Test
    public void dateMath与通配不得绕过body类守卫() {
        rejected(() -> admin.guardSearchBody(
                "{\"query\":{\"terms\":{\"p\":{\"index\":\"<es_consol?_user>\"}}}}"), "terms lookup date-math");
        rejected(() -> admin.guardSearchBody(
                "{\"query\":{\"terms\":{\"p\":{\"index\":\".securit*\"}}}}"), "terms lookup 系统通配");
        rejected(() -> admin.guardSearchBody(
                "{\"query\":{\"pinned\":{\"docs\":[{\"_index\":\"es_console_user\",\"_id\":\"x\"}]}}}"),
                "pinned 内嵌文档 _index");
        rejected(() -> admin.guardSearchBody(
                "{\"query\":{\"geo_shape\":{\"loc\":{\"indexed_shape\":"
                        + "{\"index\":\"es_console_user\",\"id\":\"x\",\"path\":\"loc\"}}}}}"),
                "geo_shape indexed_shape");
        rejected(() -> admin.guardReindexBody(
                "{\"source\":{\"index\":\"<es_consol?_*>\"},\"dest\":{\"index\":\"copy\"}}"), "reindex date-math");
        rejected(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"add\":{\"index\":\"<es_consol?_*>\",\"alias\":\"pub\"}}]}"), "alias date-math");
        rejected(() -> admin.guardSql("SELECT * FROM \"<es_consol?_user>\""), "SQL date-math");
    }

    @Test
    public void raw元数据枚举与快照通配不得下发控制面() {
        rejected(() -> admin.guardRawGuarded("GET", "/_cat/indices", null), "_cat/indices 非 JSON 文本无法过滤");
        rejected(() -> admin.guardRawGuarded("GET", "/_stats", null), "_stats 控制面枚举");
        rejected(() -> admin.deleteSnapshot("repo", "*"), "删除快照通配");
        rejected(() -> admin.createSnapshot("repo", "*", null), "创建快照通配");
    }

    @Test
    public void rawCat目录JSON行级过滤控制面索引() {
        admin.guardRawGuarded("GET", "/_cat/indices?format=json", null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("body", "[{\"index\":\"logs-2026\"},{\"index\":\"es_console_user\"},"
                + "{\"index\":\".security\"},{\"index\":\"mig_es_xmigrate_job\"}]");
        Map<String, Object> filtered = admin.filterCatControlRows("/_cat/indices", result);
        String body = String.valueOf(filtered.get("body"));
        assertTrue(body.contains("logs-2026"));
        assertFalse(body.contains("es_console_user"));
        assertFalse(body.contains(".security"));
        assertFalse(body.contains("mig_es_xmigrate_job"));
    }

    @Test
    public void 模板与reindex查询不得夹带控制面lookup() {
        rejected(() -> admin.searchTemplate("logs",
                "{\"source\":\"{\\\"query\\\":{\\\"terms\\\":{\\\"p\\\":{\\\"index\\\":\\\"es_console_user\\\"}}}}\"}"),
                "template source terms lookup");
        rejected(() -> admin.searchTemplate("logs", "{\"id\":\"stored-template\"}"),
                "按已存 id 执行模板");
        rejected(() -> admin.guardRawGuarded("POST", "/_search/template", "{\"id\":\"stored-template\"}"),
                "raw 按 id 执行模板");
        rejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template", "{\"id\":\"stored-template\"}"),
                "索引前缀 raw 按 id 执行模板");
        rejected(() -> admin.guardRawGuarded("POST", "/_msearch/template",
                "{\"index\":\"logs\"}\n{\"id\":\"stored-template\"}\n"), "msearch 按 id 执行模板");
        rejected(() -> admin.reindexPreview("logs",
                "{\"query\":{\"terms\":{\"p\":{\"index\":\"es_console_user\"}}}}"), "reindex 预估 query lookup");
        rejected(() -> admin.guardReindexBody(
                "{\"source\":{\"index\":\"logs\",\"query\":{\"terms\":{\"p\":{\"index\":\"es_console_user\"}}}},"
                        + "\"dest\":{\"index\":\"copy\"}}"), "reindex body query lookup");
    }

    @Test
    public void cat目录列别名不得绕过行过滤() {
        rejected(() -> admin.guardRawGuarded("GET", "/_cat/indices?format=json&h=i", null), "h=i 隐藏 index 列");
        rejected(() -> admin.guardRawGuarded("GET", "/_cat/aliases?format=json&h=alias", null), "aliases 只取 alias 列");
        admin.guardRawGuarded("GET", "/_cat/indices?format=json&h=index,health", null);
    }

    @Test
    public void 业务索引与请求体正文保持可用() {
        admin.guardIndexName("logs-2026");
        admin.guardIndexPattern("logs-*");
        admin.guardSearchBody("{\"query\":{\"terms\":{\"status\":[\"a\",\"b\"]}}}");
        admin.guardSearchBody("{\"query\":{\"match\":{\"message\":\"<not-index>\"}}}");
        admin.guardControlPath("/logs-2026/_search");
    }
}
