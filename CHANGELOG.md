# 更新日志

所有重要变更记录在此文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/)；
版本号遵循 [语义化版本](https://semver.org/)；
详细差异见 [GitHub Releases](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/releases)。

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
