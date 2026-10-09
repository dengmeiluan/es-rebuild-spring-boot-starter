package io.github.dengmeiluan.es.rebuild.auth;

import java.util.List;

/**
 * 控制台操作审计存储 SPI（R34 落 ES；R63 抽象化；五百五十五批不留余地类型化）：
 * 谁在什么时候对哪个端点、针对哪个集群做了什么。
 *
 * <p>存储可插拔（平台化底座）：独立部署默认落控制集群 ES 索引
 * （{@link EsConsoleOpsAuditStore}）；嵌入宿主时可切宿主数据库表
 * （{@link JdbcConsoleOpsAuditStore}，配置 {@code es.rebuild.console.store=jdbc}）；
 * 宿主注册自定义本接口 Bean 则完全接管。</p>
 *
 * <p>契约红线：审计永不反噬业务——record 必须异步/尽力而为，任何失败只记日志不上抛。</p>
 *
 * <p><b>五百五十五批契约收紧（不留余地）</b>：写入唯一入口为
 * {@link #record(ConsoleOpsAuditEvent)}（旧 8 参/7 参签名删除）；查询唯一入口为
 * {@link #search(String, String, int, int, Long)}，出参为类型化记录列表——旧
 * 「ES search 响应 Map 形态」不再是 SPI 契约，线缆形态由控制器单点组装。</p>
 *
 * @author aicoding
 */
public interface ConsoleOpsAuditStore {

    /**
     * 记一笔操作（异步，永不抛）。
     *
     * @param event 富维度审计事件——身份/动作/所属集群/来源 IP/耗时全集
     */
    void record(ConsoleOpsAuditEvent event);

    /**
     * 审计流水查询（按 timestamp 倒序）。
     *
     * @param username 用户过滤（null/空=不过滤）
     * @param action   动作过滤（null/空=不过滤）
     * @param size     最大条数（实现应钳制 ≤500）
     * @param from     起始偏移
     * @param sinceMs  时间下界（毫秒 epoch，null=不限）
     * @return 记录列表（timestamp 必填，其余按档位实况；空档返回空列表）
     */
    List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs);

    /**
     * 结构化查询入口（20260922 快筛批）：全维筛选下推存储档。
     *
     * <p>default 桥接保证宿主自定义实现零破坏——未重写本方法的实现自动退化为
     * 基线三过滤（username/action/fromMs），扩维（集群/角色/方法/HTTP/来源/IP/
     * 耗时阈值/URI 前缀/关键词）被静默忽略。内置 ES 档全量下推；
     * JDBC 档维持基线（统一只用 ES 单载体立法后，快筛能力仅在 ES 档承诺）。</p>
     *
     * @param query 结构化查询（null 视为全量首查）
     * @return 记录列表（timestamp 必填，其余按档位实况；空档返回空列表）
     */
    default List<ConsoleOpsAuditEvent> search(ConsoleOpsAuditQuery query) {
        ConsoleOpsAuditQuery q = query != null ? query
                : ConsoleOpsAuditQuery.legacy(null, null, 100, 0, null);
        return search(q.getUsername(), q.getAction(), q.getSize(), q.getFrom(), q.getFromMs());
    }
}
