# 配置参考（es.rebuild.*）

全部配置键来自 `EsRebuildProperties` 属性树，本页逐键对账 Java 默认值；
`ConfigurationReferenceContractTest` 反射遍历属性树与本页逐键核对——**新增配置键忘写本页即测试红**。

键名遵循 Spring Boot 宽松绑定：文档按 kebab-case 书写，`application.yml` / 环境变量（`ES_REBUILD_...`）等价。

## 基础

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.mode` | `client` | 装配模式：`client`=业务应用侧只装索引声明；`console`=宿主侧全量装配（控制台+AOP 切面+控制集群解析）。允许值 `client` / `console`，拼写错误拒绝启动 |
| `es.rebuild.web-enabled` | `true` | 是否启用内置运维 Controller 与静态面板 |
| `es.rebuild.version-format` | `yyyyMMddHHmmss` | 物理索引版本号时间格式（物理索引名为 原名_v时间戳），非法 pattern 拒绝启动 |
| `es.rebuild.env-pages` | （空 Map） | 连接环境 → 页面 key 白名单集合（键=PROD/STAGING/QA/DEV）；空=不启用，未配置的 env 原样透传 |

## 写入重试（es.rebuild.retry）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.retry.max-attempts` | `5` | 最大尝试次数（**含首次**）：`1`=只调用一次=完全关闭重试，这也是关闭重试的唯一方式（刻意不设 enabled，避免双开关语义重叠） |
| `es.rebuild.retry.init-backoff-ms` | `500` | 首次退避毫秒；须 ≤ max-backoff-ms |
| `es.rebuild.retry.max-backoff-ms` | `8000` | 退避上限毫秒 |

## 重建锁（es.rebuild.lock）

ES 文档锁（以 indexKey 为锁文档 _id）。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.lock.enabled` | `true` | 是否启用分布式锁；单实例或测试场景可关 |
| `es.rebuild.lock.index-name` | （空串） | 锁索引名；空=按默认规则自动推导（唯一推导处在自动配置） |
| `es.rebuild.lock.lease-ms` | `3600000` | 锁租约毫秒；必须 ≥ `orchestration.timeout-ms`，否则长 reindex 中途锁被强夺（启动期校验） |

## 一键编排（es.rebuild.orchestration）

编程式一键重建的轮询/超时参数。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.orchestration.poll-interval-ms` | `2000` | reindex 进度轮询间隔毫秒 |
| `es.rebuild.orchestration.timeout-ms` | `1800000` | 单次编排总超时毫秒（默认 30 分钟） |

## 托管重建确认门（es.rebuild.adhoc）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.adhoc.confirm-timeout-ms` | `1800000` | 人工确认切换的等待超时（默认 30 分钟，上限 7 天）。超时按 abort 处理且对 WRITE_BLOCK 策略强制解除写阻断——绝不允许业务因「忘了点确认」永久写不进 |

## 跨集群迁移（es.rebuild.migrate）

客户端 scroll+bulk 迁移参数。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.migrate.enabled` | `true` | 迁移能力子开关（与 web-enabled 同时为 true 才暴露接口/面板） |
| `es.rebuild.migrate.default-slices` | `4` | sliced scroll 路数/worker 数（建议 ≈ 源索引主分片数） |
| `es.rebuild.migrate.default-batch-size` | `2000` | 每 scroll/bulk 批大小 |
| `es.rebuild.migrate.scroll-keep-alive-sec` | `120` | scroll 上下文存活秒 |
| `es.rebuild.migrate.connect-timeout-ms` | `5000` | 临时旧集群 client 连接超时毫秒 |
| `es.rebuild.migrate.socket-timeout-ms` | `60000` | 临时旧集群 client socket 超时毫秒 |
| `es.rebuild.migrate.job-index-name` | （空串） | 迁移作业索引名；空=由实体 @Document SpEL 自动拼装 |

## 索引映射对账（es.rebuild.mapping）

这些键来自 `EsRebuildProperties.Mapping` 的 Java 默认值。启动自动对账要求宿主处于 `es.rebuild.mode=client`；`console` 模式不装配对账 runner。

| 配置键 | Java 默认值 | 允许值 | 行为 |
|---|---|---|---|
| `es.rebuild.mapping.auto-register` | `startup` | `startup`, `off` | `startup` 在 ApplicationReady 后异步执行一次；`off` 不装配启动 runner |
| `es.rebuild.mapping.conflict-policy` | `fail` | `fail`, `warn` | `fail` 不提交含冲突的 additions；`warn` 仅可继续提交独立兼容 additions，冲突字段仍不改 |
| `es.rebuild.mapping.missing-index-policy` | `skip` | `skip`, `fail` | `skip` 报 `SKIPPED_INDEX_MISSING`；`fail` 报 `FAILED_INDEX_MISSING` |

## 索引配置校验（es.rebuild.config-validation）

启动期对所有注册 provider 实体的 @Setting/@Mapping JSON 做 L1 静态 Lint + L2 临时索引 Dry-run，把「代码里写错索引配置、发到服务上建索引才炸」提前到启动那一刻暴露。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.config-validation.mode` | `strict` | `strict`=确定性配置错误挡启动 / `warn`=只告警 / `off`=关闭 |
| `es.rebuild.config-validation.dry-run-on-startup` | `true` | 启动期是否追加 L2 dry-run（临时索引试建）；ES 不可达降级 WARN 不误杀启动 |

## 日期兼容（es.rebuild.compat）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.compat.date-converters` | `false` | 注册 epoch↔日期转换器。⚠ 只救**不带**日期注解而存储形态为 epoch 数值的 Timestamp/Date/Instant 字段；带 `@Field(type=Date)` 的字段由属性级转换器接管，打开开关什么也不会发生且不报错 |

## 控制台（es.rebuild.console）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.conn-index-name` | `es_console_conn` | 多集群连接档案索引名（存控制集群，密码只留服务端） |
| `es.rebuild.console.home-dir` | （空串） | 控制集群自举档案目录；空=用户目录下 `.es-console/<appName>/` |
| `es.rebuild.console.control-mode` | `auto` | 控制集群解析模式：`auto`（自举档案→spring 探测→Setup 向导）/ `spring`（钉死宿主 ES，向导永不出现） |
| `es.rebuild.console.conn-probe-enabled` | `true` | 连接档案后台周期探活开关（列表/顶栏状态点数据源） |
| `es.rebuild.console.conn-probe-interval-seconds` | `60` | 探活间隔秒（最小 10） |
| `es.rebuild.console.host-cluster-visible` | `true` | 数据面是否暴露「宿主集群」目标；纯管理平台形态设 `false`——控制集群降级为纯元数据存储，后端同步拒绝 host 目标直捣 |
| `es.rebuild.console.store` | `control-es` | 元数据存储模式：`control-es`（落控制集群 ES 索引）/ `jdbc`（落宿主 DataSource 数据库表）；宿主自注册 ConnStore/ConsoleOpsAuditStore Bean 则完全接管 |

## 控制台鉴权（es.rebuild.console.auth）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.auth.enabled` | `true` | 控制台鉴权开关；关闭后恢复无鉴权行为，仅限内网/演示 |
| `es.rebuild.console.auth.fallback-username` | `admin` | 兜底账号：仅当用户索引一个账号都没有时可登录（角色 ADMIN） |
| `es.rebuild.console.auth.fallback-password` | `es-console` | 兜底密码；enabled=true 时账号/密码不可为空（启动期校验）——**上线务必修改** |
| `es.rebuild.console.auth.token-ttl-ms` | `43200000` | token 有效期毫秒（默认 12 小时） |
| `es.rebuild.console.auth.token-secret` | （空串） | token HMAC secret；空=启动随机生成（重启后需重新登录）；多实例部署必须显式配置保证互通 |
| `es.rebuild.console.auth.user-index-name` | `es_console_user` | 控制台用户索引名 |
| `es.rebuild.console.auth.ops-audit-index-name` | `es_console_ops_audit` | 操作审计索引名：环形开启时为日期索引前缀，关闭时为固定单索引名 |
| `es.rebuild.console.auth.host-audit-merge` | `false` | 宿主审计并入开关：开启后宿主注册的 ConsoleAuditContributor 记录才并入控制台审计视图 |

## 审计环形保留（es.rebuild.console.auth.audit-retention）

审计写日期索引（`<索引名前缀>-yyyy.MM.dd`），双闸（超龄+总量）整索引删最旧；`enabled=false` 一键回退固定单索引行为（发版期回退开关）。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.auth.audit-retention.enabled` | `true` | 按日环形写+周期双闸清理；false=旧固定单索引行为 |
| `es.rebuild.console.auth.audit-retention.max-days` | `90` | 超龄闸（天）：严格早于「今天-N 天」的日期索引整索引删除 |
| `es.rebuild.console.auth.audit-retention.max-total-bytes` | `32212254720` | 总量闸（字节，默认 30GB）：日期索引族 store.size 合计上限，超限从最旧删起 |
| `es.rebuild.console.auth.audit-retention.dry-run` | `false` | 演练模式：清理轮只记待删清单不执行删除（上线初期观察面） |

## 页面级授权（es.rebuild.console.page-auth）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.page-auth.enabled` | `true` | 页面级授权开关（仅 delegated 身份+宿主下发 grantedPages 时生效）；false=逃生阀，紧急回退纯角色档 |

## 连接中心自动同步（es.rebuild.console.conn-sync）

双门设计：宿主注册 ClusterConnContributor Bean **且** enabled=true 才启用；任一缺席=零行为（不建线程、不落库）。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.conn-sync.enabled` | `false` | 总开关（默认关） |
| `es.rebuild.console.conn-sync.interval-seconds` | `3600` | 同步周期秒（引擎侧下限钳 60）；默认对齐连接中心 1h 快照节奏 |
| `es.rebuild.console.conn-sync.initial-delay-seconds` | `30` | 启动后首跑延迟秒 |
| `es.rebuild.console.conn-sync.min-role` | `VIEWER` | 同步档案默认 minRole（贡献者未显式给时） |

## 监控落库（es.rebuild.console.monitor）

多集群监控历史的唯一写入方是服务端定时任务（每轮落全部连接的最近探活结果）；用户页面轮询只读不入库。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.monitor.enabled` | `true` | 落库总开关；false=不启动监控落库调度（探活展示不受影响） |
| `es.rebuild.console.monitor.interval-seconds` | `60` | 落库节奏秒（下限钳 10；与探活间隔解耦） |
| `es.rebuild.console.monitor.metrics-interval-seconds` | `60` | 指标采集节奏秒（下限 30，由采集器侧钳制） |
| `es.rebuild.console.monitor.index-name` | `es_console_monitor` | 监控日期索引前缀（查询/清理打 `<前缀>-*`） |

## 宿主鉴权委托（es.rebuild.console.auth.delegate）

不写一行 Java 即可把控制台登录接到宿主凭据体系；宿主若注册 ConsoleAuthDelegate 代码 SPI Bean，代码 SPI 优先（本配置被忽略）。mode 不配 = 不启用。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.auth.delegate.mode` | （空串） | 委托模式：`jwt`（本地验签宿主 JWT）/ `endpoint`（回调宿主校验接口）/ `header`（信任网关注入头） |
| `es.rebuild.console.auth.delegate.token-header` | `Authorization` | 携带宿主凭据的请求头（jwt/endpoint 模式取 token 用，Bearer 前缀自动剥离） |
| `es.rebuild.console.auth.delegate.role-mapping` | （空 Map） | 角色映射：console 角色 → 宿主角色逗号串（如 ADMIN=admin,superuser）；宿主角色未命中一律 VIEWER |

### jwt 模式（本地验签宿主 JWT，HS256 共享密钥 / RS256 公钥二选一，同配以 alg 为准）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.auth.delegate.jwt.secret` | （空串） | HS256 共享密钥（支持 `${ENV}` 环境变量引用） |
| `es.rebuild.console.auth.delegate.jwt.public-key` | （空串） | RS256 PEM 公钥 |
| `es.rebuild.console.auth.delegate.jwt.username-claim` | `sub` | 用户名 claim（支持 a.b.c 点分路径） |
| `es.rebuild.console.auth.delegate.jwt.roles-claim` | `roles` | 角色 claim（数组或逗号串） |
| `es.rebuild.console.auth.delegate.jwt.display-name-claim` | （空串） | 展示名 claim（点分路径）；空=不取，顶栏回落 username |

### endpoint 模式（凭据转发宿主校验接口，2xx 即认）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.auth.delegate.endpoint.verify-url` | （空串） | 宿主校验接口 URL（POST） |
| `es.rebuild.console.auth.delegate.endpoint.forward-headers` | （空串） | 透传请求头白名单（逗号分隔；默认只透传 token-header） |
| `es.rebuild.console.auth.delegate.endpoint.username-path` | `username` | 返回 JSON 里用户名字段路径（a.b.c） |
| `es.rebuild.console.auth.delegate.endpoint.roles-path` | `roles` | 返回 JSON 里角色字段路径（数组或逗号串） |
| `es.rebuild.console.auth.delegate.endpoint.display-name-path` | （空串） | 返回 JSON 里展示名字段路径；空=不取 |
| `es.rebuild.console.auth.delegate.endpoint.cache-seconds` | `30` | 校验结果短缓存秒数（按 token 缓存，降低宿主接口压力） |

### header 模式（信任网关/上游代理注入的身份头；必须配合网关剥离外部同名头，否则可伪造）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `es.rebuild.console.auth.delegate.header.user-header` | （空串） | 用户名头（非空即信任） |
| `es.rebuild.console.auth.delegate.header.roles-header` | （空串） | 角色头（逗号分隔，经 role-mapping 映射） |
| `es.rebuild.console.auth.delegate.header.display-name-header` | （空串） | 展示名头；值若经 URL 编码可携中文，服务端自动解码 |

## 完整默认配置

```yaml
es:
  rebuild:
    mode: client
    version-format: yyyyMMddHHmmss
    web-enabled: true
    retry:
      max-attempts: 5
      init-backoff-ms: 500
      max-backoff-ms: 8000
    lock:
      enabled: true
      index-name: ""
      lease-ms: 3600000
    orchestration:
      poll-interval-ms: 2000
      timeout-ms: 1800000
    migrate:
      enabled: true
      default-slices: 4
      default-batch-size: 2000
      scroll-keep-alive-sec: 120
      connect-timeout-ms: 5000
      socket-timeout-ms: 60000
      job-index-name: ""
    adhoc:
      confirm-timeout-ms: 1800000
    compat:
      date-converters: false
    config-validation:
      mode: strict
      dry-run-on-startup: true
    mapping:
      auto-register: startup
      conflict-policy: fail
      missing-index-policy: skip
    console:
      conn-index-name: es_console_conn
      home-dir: ""
      control-mode: auto
      conn-probe-enabled: true
      conn-probe-interval-seconds: 60
      host-cluster-visible: true
      store: control-es
      page-auth:
        enabled: true
      conn-sync:
        enabled: false
        interval-seconds: 3600
        initial-delay-seconds: 30
        min-role: VIEWER
      monitor:
        enabled: true
        interval-seconds: 60
        metrics-interval-seconds: 60
        index-name: es_console_monitor
      auth:
        enabled: true
        fallback-username: admin
        fallback-password: es-console
        token-ttl-ms: 43200000
        token-secret: ""
        user-index-name: es_console_user
        ops-audit-index-name: es_console_ops_audit
        host-audit-merge: false
        audit-retention:
          enabled: true
          max-days: 90
          max-total-bytes: 32212254720
          dry-run: false
        delegate:
          mode: ""
          token-header: Authorization
          jwt:
            secret: ""
            public-key: ""
            username-claim: sub
            roles-claim: roles
            display-name-claim: ""
          endpoint:
            verify-url: ""
            forward-headers: ""
            username-path: username
            roles-path: roles
            display-name-path: ""
            cache-seconds: 30
          header:
            user-header: ""
            roles-header: ""
            display-name-header: ""
```

## 行为边界

- 键名允许值在属性校验阶段检查，拼写错误会拒绝 Spring 上下文启动（含 retry 退避区间、lock 租约 ≥ 编排超时等不变量）。
- `auto-register=startup` 的 ES I/O 发生在 ApplicationReady 后的 daemon 单线程中，不阻塞 ready。
- `mapping.conflict-policy=fail` 中的 fail 表示本轮 mapping addition 不写入，不表示关闭应用。
- `mapping.missing-index-policy=fail` 也发生在应用 ready 之后；`FAILED_INDEX_MISSING` 是对账报告，不会终止已经 ready 的 Spring Boot 应用。
- `skip` 与 `fail` 都不会创建缺失索引。需要建新物理索引或改变既有字段定义时走 宿主应用 Adhoc 托管重建。
- 对账 runner 仅在 client 模式装配，并要求宿主存在可用的 `ElasticsearchOperations`；缺失时记录 `SKIPPED_NO_CLIENT`。
