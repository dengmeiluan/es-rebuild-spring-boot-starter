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

package io.github.dengmeiluan.es.rebuild.multicluster;

import io.github.dengmeiluan.es.rebuild.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.es.rebuild.auth.ConsoleConnVisibility;
import io.github.dengmeiluan.es.rebuild.auth.ConsolePrincipal;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 监控读侧连接隔离：曲线/告警/历史的行必须按 ConsoleConnVisibility 收口。 */
final class MonitorRecordVisibility {

    private MonitorRecordVisibility() {
    }

    static ConsolePrincipal principal(HttpServletRequest request) {
        Object p = request == null ? null : request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return p instanceof ConsolePrincipal ? (ConsolePrincipal) p : null;
    }

    /** 按行内 connId/connName 过滤；无连接标识的行（节点聚合）由调用方先要求显式集群过滤。 */
    static List<Map<String, Object>> filterByIdentity(List<Map<String, Object>> records,
                                                      ConsolePrincipal p, ConnStore store) {
        return filterByIdentity(records, ConsoleConnVisibility.snapshot(p, store));
    }

    static List<Map<String, Object>> filterByIdentity(List<Map<String, Object>> records,
                                                      ConsoleConnVisibility.Snapshot snap) {
        if (snap.visibleIds == null) return records;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> rec : records) {
            Object rawId = rec.get("connId");
            if (rawId != null && !String.valueOf(rawId).trim().isEmpty()) {
                if (snap.seesId(String.valueOf(rawId))) out.add(rec);
                continue;
            }
            Object rawName = rec.get("connName");
            if (rawName != null && !String.valueOf(rawName).trim().isEmpty()) {
                java.util.Set<String> ids = snap.nameToIds.get(String.valueOf(rawName));
                if (ids != null && snap.visibleIds.containsAll(ids)) {
                    out.add(rec);
                } else if (ids == null && snap.complete && snap.storeReadable && snap.hostVisible) {
                    /* 目录外的实名视为宿主；目录不可读/被截断时 fail-closed */
                    out.add(rec);
                }
            }
        }
        return out;
    }
}
