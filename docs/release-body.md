## ESQueryStudio 查询工作台 · 初版（滚动更新）

**为 Spring Boot 而生的 Elasticsearch 查询工作台。** 一套原生 Vue 控制台，两种 transport：Spring Boot 服务端模式与 Chrome MV3 扩展浏览器模式。

### 为什么是 ESQueryStudio

- **六模式共用一个现场** —— DSL 构建器 + 原始编辑器、ES-SQL、Lucene、查询沙盒、PIT 深分页、SQL ⇄ DSL 语法桥共享条件树、JSON、结果、直方图、历史、收藏与草稿。
- **真正懂 ES 的语义层** —— 实时 mapping、analyzer、字段角色、可排序性与集群版本共同驱动补全、lint、值枚举和执行前检查；树 ⇄ 文本双向同步，未知子句退回原文。
- **相关性实验室** —— 打分解剖（BM25 因子树）、排名侦探、查询 X 光、子句命中矩阵、Boost 调参、Profile 火焰图。
- **一套源码，两种形态** —— 同一套 52 页 Vue 控制台运行在 Spring Boot 服务端与 Chrome MV3 扩展；浏览器模式直连 Elasticsearch，多本机连接档案、本机监控（关闭标签页后仍写集群 / 每节点 / Top 索引行并继续判定阈值告警）/ 审计 / 作业 / 护栏执行。
- **MCP 接入** —— 服务端 `POST /mcp` JSON-RPC 2.0（服务 token / 按用户与角色签发的 API key，19 个工具含 settings/aliases/templates/nodes/tasks/stats 与按路径语义精确分类的原始 REST 透传）与 stdio 桥；ADMIN 可为 key 指定连接集合、**连接级 read/write（一把 key：QA/UAT 可写、生产只读）**、工具白名单、频率、日/月配额与有效期；key 发版后在面板/API 实时签发、立即生效，可持久化到控制集群 ES 或宿主 JDBC；控制台内置「密钥与用量」管理面；浏览器模式安装 `window.ESQueryStudioMCP`；另附本地 Node MCP（多连接、stdio、无第三方依赖、可 `npm install -g`，浏览器可导出连接配置，写工具默认关闭），本地 Claude Desktop / Cursor 无需 Spring Boot 或浏览器。
- **宿主优先、可裁剪** —— 52 页、13 分组、11 功能包；页面契约是导航、页面门与宿主菜单的唯一事实源；`ConsoleHostIntegration` + 认证 / 连接目录 / 审计 SPI。
- **可验证的工程交付** —— 前端 1,521 个文件 / 12,226 例全绿，Java 全量测试覆盖认证、页面授权、重建状态机、映射对账、跨集群迁移、MCP key 权限/配额/持久化与 REST 语义分类；真实浏览器探针、权限矩阵、可复现构建、SBOM、CodeQL、OpenSSF Scorecard。

### 交付物

- **Chrome 扩展** —— `esquerystudio-chrome-1.0.7.zip`：同一套 Vue 控制台在扩展内直连 ES；解压后在 `chrome://extensions` 加载已解压的扩展程序。浏览器模式保留索引 / Mapping / Setting / 别名 / 模板、快照 / ILM / SLM / Watcher、任务 / 节点 / REST / SQL / PIT / Reindex / Bulk、托管重建、跨集群迁移、配置校验、配置漂移、系统作业锁与护栏执行。
- **独立服务端** —— `esquerystudio-server-1.0.7.jar`：JDK 8+，`java -jar` 后打开 `http://localhost:5601/esquerystudio.html`。
- **嵌入式模块** —— `esquerystudio-console-1.0.7.jar` + `esquerystudio-platform-1.0.7.jar`：接入 Spring Boot 宿主，认证、连接目录、审计与品牌均可通过 SPI 接管。
- **可复现材料** —— sources / javadoc / SBOM 与 `SHA256SUMS` 一并附上；ES 客户端栈由宿主以 provided 契约自备。

### 链接

- 在线演示（合成数据，点开即玩）：<https://dengmeiluan.github.io/esquerystudio/>
- GitHub：<https://github.com/dengmeiluan/esquerystudio>
- 文档索引：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/README.md>
- 宿主接入：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/integration/README.md>
- LINUX DO 社区：<https://linux.do>

> 发布线约定：「初版（滚动更新）」是唯一 Release；版本号可递增，但只保留一个标签、一个提交，资产直接覆盖更新。
