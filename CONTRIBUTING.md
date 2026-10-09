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

```bash
mvn clean test -Dconsole.build.skip=true   # 后端全量（需先有 console 构建产物）
cd console && npm run typecheck && npm test  # 前端：类型零错 + 全量用例
cd console && npm run build                 # 前端产物（package 会校验其在场）
```

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
