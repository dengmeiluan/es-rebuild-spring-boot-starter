# 更新日志

所有重要变更记录在此文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/)；
版本号遵循 [语义化版本](https://semver.org/)；
详细差异见 [GitHub Releases](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/releases)。

## [1.0.5]

### 修复

- 监控页悬浮读出在鼠标快速移出图表后不再残留——新增坐标巡检兜底（悬浮激活期间
  鼠标离开图区即收起十字线与读数，不依赖可能丢失的 mouseleave 事件），六卡/
  节点对比/Top 索引三条悬浮链统一接

## [1.0.4]

### 修复

- 实时监控六张走势卡的悬浮十字线/读出直钉跟随指针——原阻尼滑行（每帧收敛 65%）
  在低帧率环境拖影成倍放大，读数始终落在指针后方；圆点抖动本就由线性插值消化，
  阻尼只剩拖影，四条悬浮链统一「指针在哪、读出在哪」

## [1.0.3]

### 新增

- **独立部署形态**（`standalone/` 模块）：`java -jar es-rebuild-standalone` 即拥有全套控制台——
  自带 web 服务器（默认端口 `5601`）与 ES 客户端栈，无需宿主应用；Setup 向导完成首连后档案
  持久在 `~/.es-console/`。与 starter 同版本线发布（`StandalonePomContractTest` 防漂移），
  CI 双构建步恒守；README 双语「两种部署形态」节
- **本地 SQLite 存储档**（`es.rebuild.console.store=sqlite`）：作业与操作审计落同一本地库文件
  （默认 `~/.es-console/<appName>/jobs.db`，`es.rebuild.console.sqlite.path` 可改址），
  重启后历史可查、零外部服务依赖。驱动 `org.xerial:sqlite-jdbc` 为 optional 不传染嵌入宿主，
  缺驱动时回落 `control-es` 并 WARN；standalone 默认启用 sqlite 档
- standalone 首启体验契约：未绑定控制集群时登录以 `409 SETUP_REQUIRED` 优雅引导（先 Setup
  后登录，无死锁）；README 明示默认凭据 `admin / es-console`（仅用户索引为空时生效）与公网暴露安全指引
- 常驻线程池生命周期守卫：内置五处线程池/执行器补齐关闭策略，随 Spring 上下文关停释放
  （`ExecutorLifecycleGuardTest` 常驻看守）

### 修复

- 实时监控「节点对比」卡悬浮读数与十字线共用同一数据窗——读数头部时刻不再滞后于指针位置
- 表格 XLSX 导出 meta「导出时间」改本地时（原 UTC 串在东八区比本地钟慢 8 小时），
  与导出文件名时间戳同源可互核
- 查询编辑器 Ctrl+I 智能补全的动态模块加载失败不再产生未处理异常（四条接线兜底补齐）

## [1.0.2]

### 修复

- `npm.cmd` 可执行物跨平台：POSIX（Linux/macOS）fresh clone 跑 `mvn clean package` 在 generate-resources 阶段必炸——改用双 OS profile 喂 `${npm.executable}`
- CI backend job 不再跳过内置前端构建，ubuntu 默认路径真跑 npm 分支（跨平台回归守卫）

### 新增

- 配置参考文档全量对账守卫（`ConfigurationReferenceContractTest`）：属性树 67 叶键逐键核对文档与 Java 默认值一致，新增配置键忘写文档即构建红
- 快速开始文档与实际 SPI 零漂移守卫（`QuickstartSnippetContractTest`）：禁教已退役 SPI、版本号与 pom 对表

### 文档

- configuration-reference.md 从 3 键扩展到 67 键全量（14 分节含完整默认 yaml）
- README 双语快速开始重写：@Document 实体声明 + mapping auto-register + 零停机重建四步
- 控制台四张实景截图入册双语 README

## [1.0.1]

### 修复

- QRT 查询结果表工具行密度：导出格式五连（CSV/MD/XLSX/PNG/JSON）收编「导出 ▾」聚合菜单；
  行高三档循环+列宽重置收编「视图 ⋯」聚合菜单——右簇常驻 10→5 颗，窄分栏不再结构性溢出
- RT 索引工作区同步「视图 ⋯」聚合（双内核同构）
- POSIX（Linux/macOS）fresh clone 跑 `mvn clean package` 必炸：npm 可执行物跨平台修复

### 新增

- 工具行聚合菜单 8 用例守卫（`qrtToolbarAgg835`）：五格式 aria 逐字保留、三档直选、
  空态禁用、放大常驻、Esc 关闭

## [1.0.0]

### 新增

- 首次公开发布
- 零停机 Elasticsearch 索引重建：别名写索引翻转 + 服务端 `_reindex`，
  删除复活补偿，作业状态落库可恢复
- 开箱即用运维控制台（60+ 页）随 jar 分发
- 多集群连接目录 + SPI 托管
- 启动期 ES 栈契约校验（类型签名比对，错配拒绝启动）
- 版本兼容层（7.x 形态差异处理）
