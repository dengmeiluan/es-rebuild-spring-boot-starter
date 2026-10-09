# ES Mapping 集成文档索引

业务应用接入方先读 client 侧自动登记与启动对账，宿主应用 运维方只在收到期望配置后进入控制台执行受控重建。

| 文档 | 什么时候读 |
|---|---|
| [快速接入](quickstart.md) | 第一次给业务应用接入 starter，或升级到 `2.6.5.RELEASE` |
| [配置参考](configuration-reference.md) | 确认开关、默认值、允许值和失败语义 |
| [故障排查](troubleshooting.md) | 根据 `[MappingReconcile]` 状态或缺失日志定位问题 |
| [Mapping 自动登记](mapping-auto-register.md) | 评估启动时机、写入边界、多实例行为与依赖边界 |
| [实体 Mapping 写法](entity-mapping.md) | 用 Spring Data Elasticsearch 4.0.9 注解声明字段语义 |
| [期望配置交给 宿主应用](desired-state.md) | 从业务应用复制期望配置并安全选择真实目标集群 |
| [冲突转 Adhoc 重建](mapping-conflict-to-adhoc.md) | 日志出现 `CONFLICT` / `USE_ADHOC_REBUILD`，需要改变既有字段定义 |

默认接入从[快速接入](quickstart.md)开始；不要把 client 侧启动对账当成索引重建器。
