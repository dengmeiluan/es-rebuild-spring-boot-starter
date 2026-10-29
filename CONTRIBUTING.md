# 贡献指南

感谢关注 es-rebuild-spring-boot-starter！这是一个克制而专注的项目：**零停机重建 + 开箱即用的运维控制台**，
一个 jar 交付，宿主实现一个接口即可接入。提交贡献前请先读完本页，能省掉一轮返工。

## 环境准备

```bash
git clone https://github.com/dengmeiluan/es-rebuild-spring-boot-starter.git
cd es-rebuild-spring-boot-starter

# 前端（Node 18+；产物 git-ignored，构建时现生成）
cd console && npm ci && cd ..

# 后端（JDK 8+；默认构建会在 generate-resources 阶段自动调 vite）
mvn clean test
```

要求：JDK 8+、Node 18+、Maven 3.6+。

## 提交前必须全绿

一条命令并行跑完全部门禁（构建 → 后端测试 / 前端分片 / typecheck / 权限扫描）：

```bash
node scripts/verify.mjs               # 本地全量（后端 fork 并行 + 前端分片并行）
node scripts/verify.mjs --standalone  # 发版前追加 standalone 构建与冒烟
```

也可以按需单跑：

```bash
cd console && npm test             # 前端全量（自动分片；失败文件自动串行复验）
cd console && npm run test:serial  # 前端串行基准（排障/确认并发伪失败）
mvn clean test -Dconsole.build.skip=true  # 后端全量（默认 4 fork；低核/CI 用 -DforkCount=N 覆盖）
```

> 并发不是无脑加线程：前端仍保持 `fileParallelism:false`（242 批的稳定性决定），
> 并发度来自进程级分片；分片内 20s 超时只吸收并发慢时钟，失败文件会在全部分片退出后
> 用原始 5s 串行基准复验，复验通过会明确标注，不会静默放行。
> 后端用 Surefire `forkCount`（独立 JVM）而非同 JVM 多线程，避免测试静态状态串扰。
> 实测（28 核）：前端串行 15–17min → 8 分片 5.2min；后端 clean 串行 74s → 4 fork 30s；
> 统一门禁（构建 + typecheck + 权限扫描 + 后端 + 前端）5.9min。
> 分片数用 `VITEST_SHARDS` 或 `--shards=N` 覆盖；`--serial` 可随时退回串行基准。
> CI 前端为 8 路 matrix，每个作业只跑一个分片（`--only-shard=i/8`）；本地 `npm test`
> 仍是一个进程编排 8 分片。矩阵是 CI 墙钟优化，不改变测试语义。
> 共享工作区里若还有并行 vite/dev server、视觉测试或 chrome-headless 在跑，全量会被
> 外部进程拖慢，并可能让挂载用例触发慢时钟超时；跑本地门禁前先停掉这些进程，
> 或直接以 CI 矩阵结果为准。

> 后端测试里有若干**源码契约锁**（readFileSync 读源码/文档断言形态），
> 改包名、改文件路径、改文档结构时它们会红——红即提醒你随迁锁面，不是环境问题。

## TDD 纪律（Iron Law）

- **bug 先写复现测试，看它红，再修到绿**——没有复现测试的修复不接受。
- 新功能测试先行；重构前后测试必须同绿。
- 前端新能力配 `*.spec.ts`；后端新能力配 JUnit 用例。守卫类 spec（如键盘可达、
  死代码清扫、文档契约）是本项目的骨架，随刀随迁，永不删除断言了事。

## 代码与设计约定

- **Java 8 语法基线**：不用 `String.isBlank()`/`Map.of()`/var 等 9+ API。
- **ES 栈 provided 契约不可破**：不要把 `spring-boot-starter-data-elasticsearch`
  或 RHLC 改回 `compile`——版本裁决权必须留在宿主（README「ES 栈契约」节）。
- **库 jar 不可 repackage**：`spring-boot-maven-plugin` 的 `<skip>true</skip>` 不可删
  （删了打出 fat jar，宿主引不到任何类）。
- **前端设计语言**：扁平、克制、信息密度优先；间距走 `--sp` 阶梯、语义色走 token、
  禁私造第五种字号。新页面先过「扁平化自查」再加样式。
- **纯视觉重构不引入新高度反例**：改布局前后页面总高必须恒定。

## 提交规范

- 提交信息一句话说清「改了什么、为什么」；一个提交一个主题。
- 构建产物（`src/main/resources/static/console/`）、IDE 文件、本地日志不入库（`.gitignore` 已拦）。
- 文档现在时、无时间线、无占位符（`TODO`/`TBD`/`待补充` 会被文档契约测试拦截）。

## 报告问题

提 issue 时请附：Spring Boot / ES 服务端与客户端版本、复现步骤、期望与实际行为、
相关日志（`[EsStackContract]`/`[MappingReconcile]`/rebuild 前缀）。**不要贴凭据。**
