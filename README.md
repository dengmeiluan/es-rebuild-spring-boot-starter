# es-rebuild-spring-boot-starter

> Elasticsearch 索引**零停机重建** Spring Boot Starter：别名写索引翻转 + 服务端 `_reindex`，
> 内置作业状态追踪、删除复活补偿，以及开箱即用的运维控制台。实现一个 `ManagedEsIndex` 接口即可接入。

[![Release](https://img.shields.io/github/v/release/dengmeiluan/es-rebuild-spring-boot-starter)](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/releases)
[![CI](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/actions/workflows/ci.yml)
[![Java](https://img.shields.io/badge/Java-8+-007396?logo=openjdk&logoColor=white)](https://openjdk.java.net)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-2.3.x-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-7.6+-005571?logo=elasticsearch&logoColor=white)](https://www.elastic.co)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

[English README](README_EN.md) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md)

## 它解决什么问题

Elasticsearch 的索引 mapping/分词/配置**不可原地修改**——改一行 mapping 的传统做法是停机、
导数据、切流量。本 starter 把这件事产品化成一行依赖：

```
建新索引(新 mapping) → 服务端 _reindex 回填 → 别名原子翻转写索引 → 观察期 → 旧索引下线
```

全过程**读写不停**：写入始终走别名、由写索引翻转承接；查询走别名双索引过渡；
重建期间发生的删除在回填后自动补偿（删除复活补偿）；作业状态落库可追踪、可恢复。

## 特性

- **零停机重建**：别名写索引原子翻转 + 服务端 `_reindex`，观察期双写过渡，旧索引安全下线
- **删除复活补偿**：重建窗口内被删除的文档在回填后自动再次删除，不留幽灵数据
- **作业可追踪**：状态机落库（JDBC 存储），进程重启可恢复，历史可审计
- **开箱即用的运维控制台**：内置 60+ 页 ES 运维控制台（重建向导/数据浏览/查询工作台/
  集群治理/权限审计/实时监控），静态资源随 jar 分发，零前端构建接入
- **多集群**：连接目录 + SPI 托管，控制台可纳管多个 ES 集群
- **ES 栈契约校验**：启动期比对类型签名（不比版本号），ES 栈错配拒绝启动并给出可操作报文
- **版本兼容层**：`compat` 包处理 7.x 前后的 total hits/ bulk NDJSON 等形态差异
- **两种部署形态**：独立部署（Kibana 式 `java -jar` 即全套控制台）或嵌入式 starter（嵌进宿主
  Spring Boot 应用共享其认证与路由）——同一份能力，两种交付

## 两种部署形态

### 独立部署（standalone，Kibana 式）

```bash
java -jar es-rebuild-standalone-1.0.2.jar
```

内置 web 服务器（默认端口 `5601`）与 ES 客户端栈，不依赖任何宿主应用。启动后打开
`http://localhost:5601/es-rebuild.html`，首次使用按 Setup 向导完成控制集群首连，
全部能力（多集群纳管/重建向导/数据浏览/查询工作台/实时监控）即可用；首连档案持久在
`~/.es-console/`，重启即达。构建方式见 [standalone/README.md](standalone/README.md)。

### 嵌入式部署（Spring Boot starter，下文快速开始）

把 starter 作为依赖加进宿主 Spring Boot 应用，控制台静态资源与 HTTP 端点由 starter
自动注册，认证可委托宿主（iframe 共享登录态），适合与业务系统一体化交付。

## 快速开始

### 1. 引入依赖

```xml
<dependency>
    <groupId>io.github.dengmeiluan</groupId>
    <artifactId>es-rebuild-spring-boot-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

> ### ⚠ ES 栈由接入方自备（provided 契约）
>
> starter **不传递** ES 栈。你必须在 pom 里同时声明配套的两件：
>
> ```xml
> <dependency>
>     <groupId>org.springframework.boot</groupId>
>     <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
> </dependency>
> <dependency>
>     <groupId>org.elasticsearch.client</groupId>
>     <artifactId>elasticsearch-rest-high-level-client</artifactId>
> </dependency>
> ```
>
> **为什么**：宿主几乎必然自带 ES 栈，starter 若也用 `compile` 声明，两套版本会被
> Maven 就近原则**静默**裁决。真实事故形态：只把 ES 客户端降级到与服务端配套、
> 却没动 `spring-data-elasticsearch`（仍由 BOM 仲裁为另一版本）——运行时抛
> `NoSuchFieldError: INDEX_CONTENT_TYPE`，**且炸在建出目标索引之后，留下半拷贝**。
>
> **配错也不会静默**：启动期 `EsStackContractValidator` 比对真实类型签名（不比版本号），
> 错配即拒绝启动并给出两条可操作的修复路径（升客户端 / 降 spring-data-elasticsearch，
> 二者不等价，报文里写明适用条件）。配套时只打一行 INFO。

### 2. 声明 @Document 实体

starter 自动扫描基础包内的 `@Document` 实体，启动时把新增字段安全登记到既有 ES 索引（mapping auto-register）——零接口实现、零手写 mapping：

```java
@Document(indexName = "bond_quote")
public class BondQuoteES {
    @Id
    private String id;

    @Field(type = FieldType.Keyword)
    private String bondCode;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String shortName;
}
```

首次启动新增字段时日志形如 `[MappingReconcile] status=UPDATED`；冲突与边界语义详见 [mapping-auto-register.md](docs/integration/mapping-auto-register.md)。

### 3. 零停机重建

需要改既有字段类型、analyzer 或建新物理索引时，走**托管重建**四步：

1. 业务应用打开 `/internal/es/index/desired-state.html`，核对实体、settings、mapping 与字段信息，**复制期望配置**。
2. 宿主应用进入 **Adhoc 托管重建**，粘贴期望配置。
3. 先跑配置校验与 dry-run，确认执行计划后执行。
4. 观察复制、追平、别名切换和收尾状态——全程读写不停。

### 4. 配置（application.yml）

```yaml
es:
  rebuild:
    mode: console          # rebuild-only：纯重建；console：重建+运维控制台
    console:
      store: sqlite        # 作业+审计存哪：control-es（默认，控制集群 ES 索引，重启后仍在）/
                           # sqlite（本地库文件，零外部依赖）/ jdbc（宿主数据库）
```

全部配置项带 IDE 提示（`spring-boot-configuration-processor` 元数据随 jar 分发）。

### 5. HTTP 端点与映射自动对账

重建/期望态入口由 `InternalEsIndexRebuildController` 暴露在 `/internal/es/index/` 路径前缀下：

| 端点 | 用途 |
|---|---|
| `POST /internal/es/index/rebuild` | 触发一次零停机重建 |
| `GET /internal/es/index/keys` | 枚举已注册的 `ManagedEsIndex` 键 |
| `GET /internal/es/index/desired-state.html` | 期望配置页：业务侧声明 mapping 期望，宿主应用确认后受控执行 |

启动期映射自动对账由 `MappingReconcile` 承担（`es.rebuild.mapping.auto-register` 开启）：
新字段自动补入、冲突按 `es.rebuild.mapping.conflict-policy` 处置（`fail` 拒绝启动/
`warn` 仅提交无冲突 additions），冲突修复建议返回 `USE_ADHOC_REBUILD` 走托管重建。
详见[接入文档](docs/integration/README.md)。

## 可运行示例

[examples/demo-host](examples/demo-host/) 是快速开始的可运行版：一个 `@Document` 实体 +
`@SpringBootApplication`，即得全套运维控制台（Setup 向导 / mapping 自动对账 / 托管重建 /
实时监控），作业与审计落本地 SQLite。两步跑通，详见其 [README](examples/demo-host/README.md)。

## 运维控制台

`es.rebuild.mode=console` 时启用。单页应用随 jar 分发，宿主零前端构建：

- **托管重建**：向导式零停机重建（选索引 → 审值 settings/mapping → 追平策略 → 确认预览 → 执行监控）
- **索引工作区**：索引列表 + 内嵌文档网格（筛选/列统计/快照/导出/直改）
- **查询工作台**：DSL / ES-SQL / Lucene / 沙盒 / PIT 分页 / 语法桥 六模式，带智能提示与高亮
- **数据浏览器**：文档 CRUD、列统计、多格式导出
- **集群治理**：索引/别名/mapping/ILM/快照/任务树/设置漂移检测/健康报告
- **权限审计**：控制台操作审计（类型化 12 列）+ SPI 接入宿主账号体系
- **实时监控**：节点 KPI/告警/慢请求/Top 索引，多集群视角

### 控制台一览

**实时监控大屏** —— 节点 KPI、集群趋势、告警与慢请求一屏尽览：

![实时监控大屏](docs/screenshots/console-live.png)

**索引工作区** —— 索引列表 + 内嵌文档网格，筛选/列统计/快照/导出一体：

![索引工作区](docs/screenshots/console-indices.png)

**数据浏览器** —— 索引目录与文档级 CRUD，CSV/Markdown/XLSX 多格式导出：

![数据浏览器](docs/screenshots/console-browser.png)

**集群概览** —— 健康/存储/文档分布与集群监控历史：

![集群概览](docs/screenshots/console-overview.png)

## 从源码构建

```bash
git clone https://github.com/dengmeiluan/es-rebuild-spring-boot-starter.git
cd es-rebuild-spring-boot-starter
# 前端（Node 18+）
cd console && npm ci && npm run build && cd ..
# 后端（JDK 8+，会自动复用 console 构建产物）
mvn clean package
```

测试口径：

```bash
mvn clean test -Dconsole.build.skip=true   # 后端全量（约 990 用例；需先有前端产物）
cd console && npm test                     # 前端全量（约 8200 用例）
```

## 兼容性

| 依赖 | 版本 | 说明 |
|---|---|---|
| Java | 8+ | |
| Spring Boot | 2.3.x 基线 | ES 栈 provided，宿主 2.3.x/2.4.x 配套自备 |
| Elasticsearch | 7.6+ 服务端 | `compat` 层兼容 7.x 前后形态差异 |

## 设计文档

- [控制台设计语言与交互宪法](docs/design.md)
- [ES 栈契约（provided）FAQ](docs/es-stack-contract.md)

## License

[Apache-2.0](LICENSE)
