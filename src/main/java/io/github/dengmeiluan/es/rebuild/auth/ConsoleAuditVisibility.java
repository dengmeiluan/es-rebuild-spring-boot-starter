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

import io.github.dengmeiluan.es.rebuild.multicluster.ConnStore;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 全量审计流水读侧连接隔离：security 页读键可能只授予某个连接
 * （{@code conn:{id}:security}），此时不得看到其它连接/宿主的事件。
 * 纯连接模型下无连接标识的会话级事件（LOGIN 等）也不下发；静态全局页授权
 * 与 ADMIN 保持全量视图。
 */
public final class ConsoleAuditVisibility {

    private ConsoleAuditVisibility() {
    }

    public static List<ConsoleOpsAuditEvent> filter(List<ConsoleOpsAuditEvent> records,
                                                    ConsolePrincipal p, ConnStore store) {
        if (records == null || records.isEmpty()) return records;
        if (p == null || p.getRole().atLeast(ConsoleRole.ADMIN)) return records;
        Set<String> gp = p.getGrantedPages();
        if (gp == null) return records;
        /* 静态 security 是全局审计授权：保留全量（含已删除连接/会话级事件）。 */
        if (gp.contains("security")) return records;
        ConsoleConnVisibility.Snapshot snap = ConsoleConnVisibility.snapshot(p, store);
        if (snap.visibleIds == null) return records;
        List<ConsoleOpsAuditEvent> out = new ArrayList<>();
        for (ConsoleOpsAuditEvent e : records) {
            String id = e.getConnId();
            if (id != null && !id.trim().isEmpty()) {
                if (snap.seesId(id)) out.add(e);
                continue;
            }
            String name = e.getConnName();
            if (name != null && !name.trim().isEmpty()) {
                Set<String> ids = snap.nameToIds.get(name.trim());
                if (ids != null && snap.visibleIds.containsAll(ids)) {
                    out.add(e);
                } else if (ids == null && snap.complete && snap.storeReadable && snap.hostVisible) {
                    out.add(e);
                }
            }
            /* 纯连接模型不下发无连接标识的会话级事件。 */
        }
        return out;
    }
}
