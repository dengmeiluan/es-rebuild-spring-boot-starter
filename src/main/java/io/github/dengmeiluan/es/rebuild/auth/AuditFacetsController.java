package io.github.dengmeiluan.es.rebuild.auth;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.Map;

/**
 * 审计下拉值建议端点（R12 terms agg）：返回审计索引族里真实出现过的动作/集群值与计数，
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
