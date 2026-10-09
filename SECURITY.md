# 安全策略

## 数据与凭据边界

- starter 是**库**：不持有、不存储任何 ES 凭据。连接凭据完全由宿主的
  `spring.data.elasticsearch.*` 与 `ElasticsearchRestClient` 配置供给，starter 只消费
  宿主容器里现成的 client bean。
- 运维控制台（`es.rebuild.mode=console`）**自带鉴权是可选的**：默认 `client` 模式
  无 starter 级鉴权，依赖部署网络隔离。暴露到共享网络前，务必：
  - 实现 `ConsoleAuthDelegate` SPI 接入宿主账号体系（`mode=console` 下的审计/角色面）；
  - 或在网关层拦截 `/internal/es/**`。
- 控制台是静态单页 + 内部 JSON API，**不外发任何数据**；审计记录落宿主自己的 ES/数据库。
- 前端构建产物随 jar 分发，不含遥测、不含外链脚本。

## 报告漏洞

请勿公开 issue 披露可被利用的问题。通过 GitHub
[Security Advisories](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/security/advisories/new)
私密报告，或私信仓库所有者。预计 7 天内回应。

## 已知取舍

- starter 的 HTTP 面以「部署在内网/受网关保护」为威胁模型：`/internal/es/**` 前缀
  表明这些端点不该裸露公网。`mode=console` 下请务必接入鉴权 SPI 或网关拦截。
- 控制台的数据面能力（文档 CRUD/DSL 查询/删除复活）等价于你授予 ES 账号的权限——
  最小权限原则请在 ES 侧落实，starter 不做第二套权限模型。
