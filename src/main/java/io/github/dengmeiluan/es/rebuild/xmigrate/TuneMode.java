package io.github.dengmeiluan.es.rebuild.xmigrate;

/**
 * 迁移期目标索引调优档（全部作用于 dynamic settings，运行时可改、收尾还原，不重启）。
 *
 * <ul>
 *   <li>{@link #AGGRESSIVE}：{@code refresh_interval=-1} + {@code number_of_replicas=0}
 *       + {@code translog.durability=async} + 调大 {@code flush_threshold_size}。
 *       吞吐最大化，适合「目标索引尚未对外查询、先回填后切流」。</li>
 *   <li>{@link #GENTLE}：仅把 {@code refresh_interval} 拉长（如 30s），保留副本与 translog。
 *       适合「目标索引已对外查询、边查边回填」，吞吐让步于可见性/可用性。</li>
 * </ul>
 */
public enum TuneMode {
    AGGRESSIVE,
    GENTLE
}
