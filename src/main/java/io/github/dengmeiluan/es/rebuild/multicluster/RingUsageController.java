package io.github.dengmeiluan.es.rebuild.multicluster;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.Map;

/**
 * 环形治理用量端点（20260923 R6）：只读返回审计+监控两个日期索引族的 store.size
 * 合计与分族占用、总量上限——治理透明化（30GB 口径看得见，不再是黑盒承诺）。
 *
 * <p>VIEWER 只读；overview 页 apiPrefixes 覆盖（同 monitor-metrics）。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/ring-usage")
public class RingUsageController {

    private final MonitorMetricsStore store;
    private final String auditPrefix;
    private final long capBytes;

    public RingUsageController(MonitorMetricsStore store, String auditPrefix, long capBytes) {
        this.store = store;
        this.auditPrefix = auditPrefix;
        this.capBytes = capBytes;
    }

    @GetMapping
    public Map<String, Object> usage() {
        return Collections.unmodifiableMap(store.usage(auditPrefix, capBytes));
    }
}
