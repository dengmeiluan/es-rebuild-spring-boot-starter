# Changelog

ESQueryStudio 采用「初版（滚动更新）」发布线：版本号可以递增，但仓库只保留一个初版提交、一个标签和一个滚动更新的 Release；每次发布直接覆盖，不追加历史版本。

## 初版（滚动更新）— 2026-11-07

首个公开版本：为 Spring Boot 而生的 Elasticsearch 查询工作台。六种查询模式共用一个现场，同一套 Vue 控制台同时运行在 Spring Boot 服务端与 Chrome MV3 扩展浏览器模式。

### 查询工作台

- 六模式同页：DSL 构建器、ES-SQL、Lucene、查询沙盒、PIT 深分页与 SQL ⇄ DSL 语法桥；条件树、JSON、结果、直方图、历史与草稿不丢。
- mapping 感知补全、值枚举与语义 lint：字段类型、`text` / `keyword` 子字段、分词器、日期格式与可排序性都来自实时索引。
- 树 ⇄ 文本双向同步，含未知子句原文回退与嵌套 `bool`；一边无法结构化时不静默丢内容。
- 跨模式历史、收藏、草稿与可分享的 base64 DSL 深链。
- 结果面：表格 / JSON / Tree / 卡片视图、直方图、`took` / `_shards` / `totalGte` 诚实展示，CSV / Markdown / XLSX / NDJSON 导出。
- 相关性实验室：打分解剖（BM25 因子树）、排名侦探、查询 X 光、子句命中矩阵、Boost 调参、Profile 火焰图。
- SQL 控制台默认严格模式：数组字段不再被静默压成首值；宽容模式显式开启并标注「数组/多值字段只显示首值」；SQL 结果列保持原始值，数组以 JSON 展示，long / boolean 不再被值推断改写成 `410.0s` / `0%`。

### Chrome 扩展 / 浏览器模式

- 同一套 Vue 52 页控制台，在扩展内以 `browser` 构建直连 Elasticsearch；服务端模式与浏览器模式只切换 transport。
- 多个本机连接档案与顶栏切换，BASIC / API Key 认证，保存前真实 `ConnHealth` 探活；旧单档存储自动迁移。
- 索引 / Mapping / Setting / 别名 / 模板、快照 / ILM / SLM / Watcher、任务 / 节点 / REST / SQL / PIT / Reindex / Bulk、托管重建与跨集群迁移（客户端 scroll + bulk）均可用。
- 本机监控（IndexedDB 采样 + service worker 全档采样，关闭标签页后仍为每条连接写集群 / 每节点 / Top 索引行；受限账号只硬依赖集群健康，节点/索引明细失败时降级为空而不是把整条采样标红；关闭标签页后仍做阈值告警判定；监控环形保留 60k 行，覆盖 7 天窗口）、本机告警、操作审计（20k 行上限）、配置校验（L1 + temp-index dry-run）、配置漂移本机基线与系统索引本机作业锁。
- 浏览器模式的设置影响预估与护栏执行：本机 ES 7.10 DYNAMIC / STATIC / ILLEGAL 分类、L1 值校验、静态重建预估、页面内 confirmToken、真实 `PUT /{index}/_settings` 与本地 `GUARDED_ACTION` 审计。
- 首次启动只挂载一个浏览器连接对话框；地址 / 密钥错误留在对话框并显示真实错误，不再三套全屏引导同时出现。
- 诚实的边界：没有跨实例分布式锁与代码 provider，跨集群迁移在关闭标签页后需显式恢复，监控与审计只覆盖本机，不伪造离线历史。

### MCP 接入

- 服务端模式提供 `POST /mcp` JSON-RPC 2.0 端点（服务级 Bearer token，默认关闭；同时受 `web-enabled` 约束）与 `mcp/esquerystudio-mcp-stdio.mjs` stdio 桥，支持 Claude Desktop / Cursor 等 MCP 客户端。
- 服务端 MCP API key 管理：按登录人/角色签发与撤销、SHA-256 摘要存储、连接集合、**连接级 read/write（`connectionPermissions`，一把 key 可 QA/UAT 可写、生产只读）**、工具白名单、每分钟频率、日/月配额、有效期；发版后在面板/API 实时签发、立即生效、无需重启或改配置；`console.store=jdbc` 时落宿主 `esquerystudio_mcp_key` 表（自动补列迁移），`control-es` 时落控制集群索引，宿主可替换 `McpKeyStore` SPI（旧实现无覆盖时明确失败，不静默丢权限）；控制台 **Dev Tools → MCP → 密钥与用量** 提供管理面与用量视图，非 ADMIN 只能管理本人 key 且受页面授权收窄。
- 浏览器模式在页面内安装 `window.ESQueryStudioMCP`，页面内 AI / Agent 可直接处理 `initialize`、`tools/list`、`tools/call`；外部进程客户端不能直连浏览器标签页，HTTP key/限流只在服务端模式生效，边界与替代路径见 `docs/mcp.md`。
- 新增本地 Node MCP（`mcp/esquerystudio-local-mcp.mjs`）：Node 18+、无第三方依赖、stdio，支持多连接配置与 `es_list_connections`；可 `npm install -g .` 安装为 `esquerystudio-mcp` 命令，浏览器 MCP 面板可导出本机连接配置；本地 Claude Desktop / Cursor 不需要 Spring Boot 或浏览器即可直连 ES，写工具默认关闭，需 `--allow-write`。
- 三种接入面共用 25 个工具契约：连接发现、索引/mapping/文档/计数/DSL/SQL/explain、文档写入、原始 REST 透传；`es_rest` 按“方法 + 路径”精确分类，POST `_search` / `_msearch` / `_count` / `_mget` / `_sql` / `_field_caps` 等查询不需要 write，未知 POST 与写 API fail-closed；浏览器/本地 Node 采用同一分类。
- ES 6 / 7 / 8 / 9 兼容：服务端沿用 `EsIndexAdmin` 版本感知路径；本地 Node 探测版本并对 6.x SQL/explain/update typed 路由回退，7/8/9 使用 typeless；`es_rest` 跨版本逃生。

### 平台

- 可嵌入 Spring Boot starter 与独立 server：同一能力集，三种交付形态（独立 jar、嵌入式模块、宿主 SPI）；README 新增「三种交付形态」「宿主集成」「MCP 三接入面」三张矢量架构图，宿主安全放行 `/mcp` 的边界同步写入文档。
- 52 页 / 13 分组 / 11 功能包，支持按包与单页裁剪；功能包是部署选择，页面级读 / 写授权独立执法。
- 页面契约 `META-INF/esquerystudio-pages.json` 是前端导航、后端页面门与宿主菜单注册器的唯一事实源。
- `ConsoleHostIntegration`、`ConsoleAuthDelegate`、`ConnStore`、`ConsoleAuditContributor` SPI；不硬编码任何宿主业务模型。
- 索引生命周期：零停机别名翻转重建、跨集群迁移、Reindex 预估、快照 / SLM / ILM 与删除复活补偿。

### 质量与安全

- 前端 1,521 个文件 / 12,226 例全绿；Java 全量测试覆盖认证、页面授权、重建状态机、映射对账、跨集群迁移、MCP key 权限/配额/持久化与 REST 语义分类。
- 真实浏览器验证：Mock ES + 真实控制台，覆盖补全、lint、导航裁剪、深链停用页与权限矩阵。
- 反向对照：非法契约、未知功能包、空页面授权等失败样本先红后绿，不靠「没报错」证明正确。
- 可复现发布：固定 `project.build.outputTimestamp`，release profile 产出 sources / javadoc / SBOM，同一源码重复构建 SHA-256 一致。
- 纯前端对齐门 `scripts/check-browser-parity.mjs`：`api.ts` 端点、后端 Controller 映射与页面契约前缀必须由 `browserApi` 覆盖，或登记到有原因的服务端独占白名单；CI 阻断，避免只实现服务端。
- MCP 契约对齐门 `scripts/check-mcp-parity.mjs`：服务端 `McpController`、纯前端 `browserMcp.ts` 与 `docs/mcp.md` 的工具名/描述必须一致；附负控，CI 阻断。
- 本地 Node MCP 冒烟门 `scripts/verify-local-mcp.mjs`：无 Spring Boot 启动 stdio，验证多连接发现、读工具、写工具默认关闭与 `--allow-write` 后直连 ES HTTP。
- CodeQL、OpenSSF Scorecard、Dependency Review 与 Dependabot 已启用；安全更新保持开启，版本更新 PR 在 1.x 发布线暂停。
