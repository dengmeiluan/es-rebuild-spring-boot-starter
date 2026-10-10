package io.github.dengmeiluan.es.rebuild.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicLong;

/**
 * 控制台三级角色（）。
 *
 * <p>rank 越大权限越高：VIEWER 只读（GET）、OPERATOR 低危写（普通 POST）、
 * ADMIN 高危操作（重建/迁移/别名切换/删除/集群 settings 等）。
 * 拦截规则见 {@link ConsoleAuthInterceptor}。</p>
 *
 * @author aicoding
 */
public enum ConsoleRole {

    /** 只读：全部 GET 查询/观测。 */
    VIEWER(1),
    /** 操作员：低危写操作（文档编辑、analyze、模板渲染等普通 POST）。 */
    OPERATOR(2),
    /** w66:重建/迁移专项 — 可发起/中止/确认重建与跨集群迁移,不管集群 settings/用户。 */
    REBUILD_OP(3),
    /** w66:索引/集群管理专项 — 可管理索引(mapping/settings/alias/模板/快照),不管重建/用户。 */
    CLUSTER_OP(3),
    /** w66:安全管理专项 — 可查看审计日志,不管重建/集群/用户。 */
    AUDIT_OP(3),
    /** 超级管理员：一切(含用户管理、raw 透传)。 */
    ADMIN(4);

    private static final Logger LOG = LoggerFactory.getLogger(ConsoleRole.class);

    /** 解析失败 WARN 节流间隔。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    /**
     * 解析失败 WARN 节流计数。枚举天然 JVM 单例，静态即实例；
     * 刻意<b>非 final</b>——测试需反射复位（Observability558Test），产线无碍。
     */
    private static AtomicLong lastParseWarnAt = new AtomicLong(0);

    private final int rank;

    ConsoleRole(int rank) {
        this.rank = rank;
    }

    /** 当前角色是否 ≥ 要求角色。 */
    public boolean atLeast(ConsoleRole required) {
        return this.rank >= required.rank;
    }

    /** 宽容解析（大小写不敏感，无法识别回退 VIEWER）。 */
    public static ConsoleRole parse(String s) {
        if (s == null) {
            return VIEWER;
        }
        try {
            return valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            // 静默降 VIEWER 会让「宿主发了陌生角色串」零痕（静默掉权）——
            // 补节流 WARN 带原始串（仅角色名，不落 token/凭据）；返回 VIEWER 契约不变
            long now = System.currentTimeMillis();
            long last = lastParseWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastParseWarnAt.compareAndSet(last, now)) {
                LOG.warn("[ConsoleRole] 无法识别的角色串「{}」，回退 VIEWER（{}s 内不再重复告警；"
                        + "请核对角色下发方与 role-mapping 配置）", s, WARN_THROTTLE_MS / 1000);
            }
            return VIEWER;
        }
    }
}
