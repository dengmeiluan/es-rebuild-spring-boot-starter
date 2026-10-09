package io.github.dengmeiluan.es.rebuild.multicluster;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 多集群监控历史端点（20260922 批④前端配套）：只读查询服务端定时任务落库的
 * 连接探活快照（{@code es_console_monitor-yyyy.MM.dd}）。
 *
 * <p>路径刻意挂在 {@code /internal/es/index/monitor-history}（避开 {@code /clusters/}
 * ADMIN 关键字与 {@code /cluster/} 透传白名单），并登记进 overview 页 apiPrefixes——
 * 看得见概览的角色即看得见监控历史，授权随页面走。GET 对 VIEWER 开放（纯只读观测）。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/monitor-history")
public class MonitorHistoryController {

    private final MonitorHistoryStore store;

    public MonitorHistoryController(MonitorHistoryStore store) {
        this.store = store;
    }

    /** 监控历史（timestamp 倒序）。线缆 {records:[...]}，与 ops-audit 同款单点组装。 */
    @GetMapping
    public Map<String, Object> history(@RequestParam(required = false) String connId,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(required = false, defaultValue = "200") int size,
                                       @RequestParam(required = false, defaultValue = "0") int from,
                                       @RequestParam(required = false) Long fromMs,
                                       @RequestParam(required = false) Long toMs) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", store.search(connId, status, size, from, fromMs, toMs));
        return Collections.unmodifiableMap(out);
    }
}
