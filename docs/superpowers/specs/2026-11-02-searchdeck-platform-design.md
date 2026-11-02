# SearchDeck 平台化重定位设计

> 日期：2026-11-02
> 状态：已定稿，分阶段实施
> 关联：QuoteHub 首个接入、页面交互体验持续优化

## 1. 为什么重定位

当前仓库以「ES 索引零停机重建 starter」命名，但实际交付物已经是一个 52 页的 Elasticsearch
运维控制台 + 重建/迁移引擎 + 宿主嵌入协议。继续用 `es-rebuild` 命名会带来三个问题：

1. **能力被名字低估**：查询工作台、相关性实验室、观测治理等能力不在名字里；
2. **场景被名字锁死**：宿主（首个是 QuoteHub）需要按自己的业务裁剪菜单与品牌，而不是接受一个重建工具的附属面板；
3. **开源叙事不成立**：开源用户需要的是「可嵌入、可裁剪、可配置的搜索运维平台」，而不是一个只解决单点问题的 starter。

新定位：**SearchDeck —— 可嵌入的 Elasticsearch 运维平台**。
「Deck」是驾驶舱/操作台，既指控制台，也指一组可插拔的模块。

英文 tagline：**Search operations, on deck.**
中文副标题：**搜索运维，即刻上甲板。**

## 2. 命名与坐标迁移

用户明确要求：**文件名/目录层级不能再简单粗暴地沿用 `es-rebuild` 或 `spring-starter`**。
因此 2.0 改为多模块、按职责命名的结构，不提供 `*-spring-boot-starter` 命名的单一巨大 jar。

| 面 | 旧 | 新 | 阶段 |
|---|---|---|---|
| GitHub 仓库 | `es-rebuild-spring-boot-starter` | `searchdeck` | 阶段 3（远端重命名，需最终确认） |
| 平台内核 | 无（混在 starter 内） | `io.github.dengmeiluan:searchdeck-platform:2.0.0` | 阶段 2 |
| 控制台/嵌入应用 | `io.github.dengmeiluan:es-rebuild-spring-boot-starter` | `io.github.dengmeiluan:searchdeck-console:2.0.0` | 阶段 2 |
| 独立应用 | `io.github.dengmeiluan:es-rebuild-standalone` | `io.github.dengmeiluan:searchdeck-server:2.0.0` | 阶段 2 |
| QuoteHub 适配器 | 宿主内散落 | `io.github.dengmeiluan:searchdeck-quotehub:2.0.0` | 阶段 2 |
| Java 基础包 | `io.github.dengmeiluan.es.rebuild` | `io.github.dengmeiluan.searchdeck.{platform,console,engine,server,quotehub}` | 阶段 2 |
| 前端包名 | `es-rebuild-console` | `@searchdeck/ui`（目录 `ui/`） | 阶段 2 |
| 控制台入口 | `/es-rebuild.html` | `/searchdeck.html`（旧入口保留跳转别名） | 阶段 1 已落 |
| 平台配置前缀 | — | `searchdeck.console.*` | 阶段 1 已落 |
| 引擎配置前缀 | `es.rebuild.*` | 阶段 2 迁移到 `searchdeck.elasticsearch.*`，保留一代兼容桥 | 阶段 2 |
| 静态资源目录 | `static/console` | `static/searchdeck`（旧路径保留别名） | 阶段 2 |
| 浏览器事件/存储键 | `es-console.*` | 阶段 3 统一迁移（需一次性迁移脚本，避免丢用户草稿） | 阶段 3 |

**原则**：品牌面先行，坐标面和存储/事件协议后行；每一阶段都必须可构建、可回滚。
阶段 1 不改 Java 包、不改 Maven 坐标、不改浏览器存储键，避免把「定位升级」变成一次不可验证的大爆炸。

## 3. 目标架构

```
searchdeck/                         仓库根（聚合 POM，packaging=pom）
├─ platform/                        searchdeck-platform：零 ES 依赖的内核
│  ├─ feature/功能包合约 + 页面契约 searchdeck-pages.json
│  ├─ branding/PlatformUiProperties
│  ├─ integration/ConsoleHostIntegration（宿主适配 SPI）
│  ├─ security/页面授权 SPI（ConsolePrincipal/AuthDelegate/AuditContributor）
│  └─ spi/ManagedEsIndex 等宿主扩展点
├─ modules/
│  ├─ console/                      searchdeck-console：引擎 + 控制台 + UI 资源
│  │  ├─ engine/                    core/adhoc/xmigrate/mapping/validate/compat/lock
│  │  ├─ console/                   auth/web/control/multicluster/insight/store/monitor
│  │  ├─ config/                    Spring Boot 自动装配
│  │  └─ src/main/resources/static/searchdeck/
│  └─ (未来) engine/                待环依赖用接口反转后可独立
├─ apps/server/                     searchdeck-server：Kibana 式独立应用
├─ integrations/quotehub/           searchdeck-quotehub：首个宿主适配器
├─ ui/                              @searchdeck/ui：Vue 3 前端源码
│  ├─ app/                          启动、路由、布局
│  ├─ platform/                     导航/功能包/表格内核/主题
│  ├─ features/<pack>/              按功能包组织页面与组件
│  └─ integrations/quotehub/        宿主前端适配
└─ examples/demo-host/              可运行宿主示例
```

依赖方向：`platform ← console ← server`；`quotehub → platform`。
`engine` 暂住在 console 内（现有包之间存在 auth↔multicluster↔xmigrate↔config 的环，
独立成 artifact 需要先做接口反转；目录先隔离，避免假模块）。

### 3.1 功能包（Feature Packs）

功能包是**部署时可选择的最小产品单元**，不是权限系统（权限仍是页面级 `grantedPages`）。
页面契约 `META-INF/es-console-pages.json` 增加 `packs` 数组，分组（groups）归属唯一 pack：

| Pack | 分组 | 内容 |
|---|---|---|
| `platform` | core | 概览、索引工作区、工作台、实时大屏、收藏 |
| `search` | search | 查询工作台、搜索模板、数据浏览器 |
| `index` | index | Mapping/设计器、热 Setting、别名、系统索引 |
| `quality` | quality | 模板、模板画廊、配置校验、配置漂移、优化向导 |
| `data` | data | Bulk、Update By Query、文档 Diff |
| `text` | text | 分词验证、分词实验室、同义词、Analysis 全景 |
| `relevance` | rank | 打分解剖、排名侦探、Boost 沙盘、命中矩阵、查询 X 光、Profile 火焰图 |
| `lifecycle` | rebuild + protect | 托管重建、跨集群迁移、Reindex、快照、SLM、ILM、生命周期 |
| `observe` | health + cluster | 诊断、体检、拓扑、Watcher、任务、集群设置、插件、远程集群 |
| `security` | security | 安全中心（用户、权限面、操作审计） |
| `devtools` | devx | REST 直连、Dev Tools、Painless 沙盒 |

- 配置 `searchdeck.console.features.packs` 为空 = 全部启用；显式列表 = 只启用列出的包。
- `searchdeck.console.features.exclude-pages` 可再隐藏单页（例如 QuoteHub 不要审计页时可排除 `security`）。
- 前端导航、命令面板、数字/字母快捷键、深链守卫、模块停用页全部从同一份运行时配置派生。
- 后端页面级授权仍使用完整契约（不能因 UI 隐藏而放行/拒绝错页）；功能包只影响「暴露面」。

### 3.2 宿主集成 SPI

```java
public interface ConsoleHostIntegration {
    String id();                       // quotehub / generic / ...
    String displayName();              // QuoteHub
    default String tagline() { return null; }
    default List<String> preferredPacks() { return Collections.emptyList(); }
    default Map<String, String> metadata() { return Collections.emptyMap(); }
}
```

- 宿主注册一个 Spring Bean 即完成品牌与默认功能包接入；显式 `searchdeck.console.branding.*`
  与 `features.packs` 优先级更高。
- 既有 `ConsoleAuthDelegate`、`ConsoleAuditContributor`、`ConnStore`/`LinkLifecycleEvent`
  继续作为细粒度 SPI 存在；`ConsoleHostIntegration` 是它们的「目录 + 品牌」聚合入口。
- QuoteHub 的首个适配器放在宿主侧（`com.quotehub.admin.integration.SearchDeckIntegration`），
  本仓库提供契约、示例与集成文档，不反向依赖 QuoteHub 业务类。

## 4. QuoteHub 首个接入

QuoteHub 现有接入面（已产线验证）：

| QuoteHub 类 | 作用 | SearchDeck 对应契约 |
|---|---|---|
| `EsConsoleAuthDelegate` | 宿主 JWT → 控制台身份 | `ConsoleAuthDelegate` |
| `LinkMenuProvisioner` | 页面契约 → 宿主菜单/角色 | `ConsolePageCatalog`（新增 packs 不影响 page key） |
| `ConnectionCenterEsConnContributor` | 连接中心 → 控制台连接目录 | `ConnStore` / `ClusterConnContributor` |
| `EsConsoleConnSyncWiring` | 连接目录同步 | `LinkLifecycleEvent` |
| `EsConsoleAuditContributor` | 宿主审计流水并入 | `ConsoleAuditContributor` |

首个接入目标：

1. QuoteHub 依赖改为 `searchdeck-console`（传递 `searchdeck-platform`），按需启用 pack 列表；
2. 注册 `SearchDeckIntegration` Bean（`id=quotehub`、`displayName=QuoteHub`）；
3. 页面契约零 key 变更，`LinkMenuProvisioner` 继续按 page key 派生菜单；
4. 若不再需要 QA 期的操作审计流水，移除宿主审计贡献 Bean 并排除 `security` pack（或保留只读账号页）；
5. 产线三账号权限矩阵与连接切换矩阵回归。

## 5. 交互体验目标

- **品牌一致**：侧栏、登录层、欢迎向导、标签页标题、静态入口都读同一份运行时品牌配置。
- **菜单收敛**：宿主只开需要的 pack，侧栏从 12 组收敛到实际业务面；搜索、折叠、快捷键不退化。
- **停用可解释**：深链访问未启用模块时进入 `ModuleOff` 页，说明「模块未启用」而非 404/空白，并给出已启用模块入口。
- **快捷键同源**：数字键、字母键、命令面板、速查表都只列出当前启用的页面。
- **默认全开、配置即收敛**：开源用户零配置获得完整能力；宿主配置后得到自己的产品面。

## 6. README 与开源叙事

参考 `ticket-monitoring` 的呈现密度：

- 顶部徽章 + 品牌 SVG banner + 一句话定位 + 在线能力矩阵；
- 「它是什么 / 不是什么」边界说明；
- 三种形态：独立部署、嵌入式 starter、宿主集成（QuoteHub 首个）；
- 功能包矩阵（11 pack × 能力），每格真实可用，不写未实现能力；
- 真实控制台截图（复用 `docs/screenshots/`，按 pack 分组）；
- 架构图（Mermaid 或 SVG）；
- 5 分钟接入（Maven + application.yml + 宿主 SPI）；
- 配置参考（平台层 vs 引擎层）、迁移指南、路线图；
- 构建/测试命令与验证口径。

## 7. 分阶段实施

| 阶段 | 内容 | 验收 |
|---|---|---|
| **1（本次）** | 品牌/定位文档；合约 packs；`searchdeck.console.*`；`ConsoleHostIntegration` SPI；UI 配置端点；前端 pack 感知导航/快捷键/停用页；QuoteHub 接入文档；README/SVG | tsc 0；新增单测绿；Maven 定向测试绿；真实浏览器验证品牌/裁剪/停用页 |
| 2 | 多模块骨架（platform/console/server/quotehub）、Maven 坐标、Java 包、配置前缀桥、前端 `ui/` 目录；QuoteHub 同步升级 | 全量后端 + 前端门禁绿；QuoteHub 编译与启动通过 |
| 3 | 远端仓库更名、静态入口/事件/存储键迁移、截图与发布资产更新 | 匿名访问新入口；旧链接跳转；发版验证 |

## 8. 验证口径

- 前端：`npx vue-tsc --noEmit`；`node scripts/test-parallel.mjs`；新增 `uiConfig` / pack 导航单测。
- 后端：`mvnw -q -Dtest=ConsolePageCatalogTest,ConsoleUiConfigServiceTest test`；至少一次全量 `mvn test`。
- 真浏览器：mock 5210 + 5174/5211 + CDP；验证默认全开、配置裁剪、QuoteHub 品牌、`ModuleOff` 深链、快捷键过滤。
- 证据：配置前后的侧栏组数/条目数、`/ui/config` 响应、停用页可达性、浏览器截图。
