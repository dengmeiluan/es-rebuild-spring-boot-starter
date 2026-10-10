package io.github.dengmeiluan.es.rebuild.multicluster;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 多集群告警端点（R7）：只读查询服务端阈值评估落库的告警/恢复事件
 * （{@code es_console_monitor-yyyy.MM.dd} 里 kind=alert 的 doc），供概览页告警面板。
 *
 * <p>路径刻意挂在 {@code /internal/es/index/monitor-alerts}（与 monitor-metrics 同族，
 * 避开 {@code /clusters/} ADMIN 关键字与 {@code /cluster/} 透传白名单），并登记进
 * overview 页 apiPrefixes——看得见概览的角色即看得见告警，授权随页面走。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/monitor-alerts")
public class MonitorAlertsController {

    private final MonitorMetricsStore store;

    public MonitorAlertsController(MonitorMetricsStore store) {
        this.store = store;
    }

    /** 告警事件（timestamp 倒序，最新打头）。线缆 {records:[...]}，与 monitor-metrics 同款单点组装。
     *   时间窗：fromMs/toMs 供图卡事件标记与可见时间域对齐（缺省不限）。 */
    @GetMapping
    public Map<String, Object> alerts(@RequestParam(required = false, defaultValue = "50") int size,
                                      @RequestParam(required = false) Long fromMs,
                                      @RequestParam(required = false) Long toMs) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", store.searchAlerts(size, fromMs, toMs));
        return Collections.unmodifiableMap(out);
    }
}
