# Mapping 配置参考

这些配置来自 `EsRebuildProperties.Mapping` 的 Java 默认值。启动自动对账还要求宿主处于 `es.rebuild.mode=client`；`console` 模式不会装配 `MappingReconcileBootstrapRunner`。

| 配置键 | Java 默认值 | 允许值 | 行为 |
|---|---|---|---|
| `es.rebuild.mapping.auto-register` | `startup` | `startup`, `off` | `startup` 在 ApplicationReady 后异步执行一次；`off` 不装配启动 runner |
| `es.rebuild.mapping.conflict-policy` | `fail` | `fail`, `warn` | `fail` 不提交含冲突的 additions；`warn` 仅可继续提交独立兼容 additions，冲突字段仍不改 |
| `es.rebuild.mapping.missing-index-policy` | `skip` | `skip`, `fail` | `skip` 报 `SKIPPED_INDEX_MISSING`；`fail` 报 `FAILED_INDEX_MISSING` |

完整默认配置：

```yaml
es:
  rebuild:
    mode: client
    mapping:
      auto-register: startup
      conflict-policy: fail
      missing-index-policy: skip
```

## 行为边界

- 三个键会在属性校验阶段检查允许值，拼写错误会拒绝 Spring 上下文启动。
- `auto-register=startup` 的 ES I/O 发生在 ApplicationReady 后的 daemon 单线程中，不阻塞 ready。
- `conflict-policy=fail` 中的 fail 表示本轮 mapping addition 不写入，不表示关闭应用。
- `missing-index-policy=fail` 也发生在应用 ready 之后；`FAILED_INDEX_MISSING` 是对账报告，不会终止已经 ready 的 Spring Boot 应用。
- `skip` 与 `fail` 都不会创建缺失索引。需要建新物理索引或改变既有字段定义时走 宿主应用 Adhoc 托管重建。
- 该 runner 仅在 client 模式装配，并要求宿主存在可用的 `ElasticsearchOperations`；缺失时记录 `SKIPPED_NO_CLIENT`。
