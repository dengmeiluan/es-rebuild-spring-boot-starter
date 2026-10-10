package io.github.dengmeiluan.es.rebuild.multicluster;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 多集群指标端点（指标时序批）：只读查询服务端定时任务落库的 cluster/node 指标时序
 * （{@code es_console_monitor-yyyy.MM.dd} 里 kind=metrics 的 doc），供概览页图表。
 *
 * <p>路径刻意挂在 {@code /internal/es/index/monitor-metrics}（与 monitor-history 同族，
 * 避开 {@code /clusters/} ADMIN 关键字与 {@code /cluster/} 透传白名单），并登记进
 * overview 页 apiPrefixes——看得见概览的角色即看得见指标，授权随页面走。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/monitor-metrics")
public class MonitorMetricsController {

    private final MonitorMetricsStore store;

    public MonitorMetricsController(MonitorMetricsStore store) {
        this.store = store;
    }

    /** interval 桶宽合法性（缺省不聚合走原始 doc；给了必须形如 60s/10m/1h/1d）。 */
    private static final String INTERVAL_PATTERN = "\\d+[smhd]";

    /**  聚合方式合法性（仅 avg|max；非法抛异常回前端，不静默当 avg 用）。
     *  637 三值同返后，{@code agg} 仅决定标量别名 {@code <field>} 取哪个值；
     *  每字段另平铺 {@code <field>Avg/Max/Min} 三键，故校验面不变（仍仅 avg|max）。 */
    private static final String AGG_PATTERN = "avg|max";

    /**
     * 指标时序（timestamp 升序）。线缆 {records:[...]}，与 monitor-history 同款单点组装。
     *
     * <p>{@code interval} 缺省 → 原始 doc 查询（老前端零改动）；给了合法 interval →
     * 服务端 date_histogram 聚合（7d 长窗不截断，见 {@link MonitorMetricsStore#searchAgg}）；
     * 给了非法 interval → 抛异常（错误回给前端），不静默当缺省用。
     * {@code agg} 聚合方式（avg 缺省|max）仅聚合模式生效；637 三值同返后它只决定标量别名
     * {@code <field>} 的取值，每字段同时平铺 {@code <field>Avg/Max/Min}（前端逐卡零请求切换）。</p>
     */
    @GetMapping
    public Map<String, Object> metrics(@RequestParam(required = false) String connId,
                                       @RequestParam(required = false) String connName,
                                       @RequestParam(required = false, defaultValue = "cluster") String scope,
                                       @RequestParam(required = false, defaultValue = "2000") int size,
                                       @RequestParam(required = false, defaultValue = "0") int from,
                                       @RequestParam(required = false) Long fromMs,
                                       @RequestParam(required = false) Long toMs,
                                       @RequestParam(required = false) String interval,
                                       @RequestParam(required = false, defaultValue = "avg") String agg) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (interval == null || interval.isEmpty()) {
            /* 缺省不聚合：原始 doc 形态，前端零改动兼容 */
            out.put("records", store.search(connId, connName, scope, size, from, fromMs, toMs));
        } else {
            if (!interval.matches(INTERVAL_PATTERN)) {
                throw new IllegalStateException("非法 interval（须形如 60s/10m/1h/1d）: " + interval);
            }
            if (!agg.matches(AGG_PATTERN)) {
                throw new IllegalStateException("非法 agg（仅 avg|max）: " + agg);
            }
            out.put("records", store.searchAgg(connId, connName, scope, fromMs, toMs, interval, agg));
        }
        return Collections.unmodifiableMap(out);
    }

    /**
     *  最新 Top 索引快照（对标阿里云 Grafana Index 索引行）：取带 topIndexes 的最新
     * cluster doc，返回 {index,qps,idxRate,storeMb}×≤8；无快照（首次采集/索引全静）回空数组。
     */
    @GetMapping("top-indexes")
    public Map<String, Object> topIndexes(@RequestParam(required = false) String connName) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", store.searchTopIndexes(connName));
        return Collections.unmodifiableMap(out);
    }
}
