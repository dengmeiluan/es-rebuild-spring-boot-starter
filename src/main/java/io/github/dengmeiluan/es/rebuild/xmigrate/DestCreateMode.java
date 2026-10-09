package io.github.dengmeiluan.es.rebuild.xmigrate;

/**
 * 目标索引创建模式。
 *
 * <ul>
 *   <li>{@link #NONE}：目标索引已由新应用（@Document 启动建索引）建好，迁移工具只校验存在、只灌数；</li>
 *   <li>{@link #COPY_FROM_SOURCE}：从旧集群源索引拷贝 mapping 到新集群建目标索引；</li>
 *   <li>{@link #FROM_ENTITY}：按已注册 {@code ManagedEsIndex} 的 entityClass 解析 settings+mapping 建目标索引。</li>
 * </ul>
 */
public enum DestCreateMode {
    NONE,
    COPY_FROM_SOURCE,
    FROM_ENTITY,
    /** 删除已有目标索引(含数据),再按源结构建新索引 */
    REBUILD
}
