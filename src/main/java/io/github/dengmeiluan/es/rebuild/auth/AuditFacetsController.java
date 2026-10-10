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
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.Map;

/**
 * 审计下拉值建议端点（ terms agg）：返回审计索引族里真实出现过的动作/集群值与计数，
 * 供安全中心审计筛选下拉做「值建议」（数据里没有的值不出现在下拉里）。
 *
 * <p>VIEWER 只读；失败/空档回空建议，前端回落硬编码词表，绝不反噬。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/auth/audit-facets")
public class AuditFacetsController {

    private final AuditFacetsStore store;

    public AuditFacetsController(AuditFacetsStore store) {
        this.store = store;
    }

    @GetMapping
    public Map<String, Object> facets() {
        return Collections.unmodifiableMap(store.facets());
    }
}
