# 更新日志

所有重要变更记录在此文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/)；
版本号遵循 [语义化版本](https://semver.org/)；
详细差异见 [GitHub Releases](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/releases)。

## [1.0.58]

### 修复

- 冻结首行全站推广（产线实报：行冻结只落在索引工作区/QueryHub/DevTools 等五处，
  未贯穿全项目）：theme.css 新增 .lr-bar.freeze 页级工具行冻结配方（sticky top0 +
  实底 + 负边距拉满 .page 内容宽 + z20 让位弹层，1023 qh-top 同语义收口单源），
  八个页级工具条视图挂类——查询工作台/别名管控/集群设置/索引设置/检索沙盒/
  任务/任务树/拓扑。长页滚动时工具行恒悬：检索参数/执行/过滤永远可达；
  高度链页（工作台 fill 态）无滚动时 sticky 惰性零开销

## [1.0.57]

### 修复

- 模板删除补齐非 ADMIN 守卫（写有守卫、删无守卫的口径破口）：`/cluster/templates/delete`
  原先只校验模板名格式，持 templates 页写键即可删掉任意集群模板——包括 index_patterns
  覆盖控制面索引的那些（模板是集群级、影响未来所有匹配索引的建索引行为）。改为
  **先读回模板定义、按其 index_patterns 过与写入同款的守卫再删**：catch-all / 控制面通配 /
  缺 patterns（部分版本等同 catch-all）/ 读不出定义一律拒绝；模板不存在交给 DELETE 自然 404。
  组件模板无 patterns：非 ADMIN 的写/删另需 rank3 或 `w:cluster-settings`（见 1007 段）
- 集群级动作补 rank 硬门（连接模型不再短路）：`/cluster/ilm/start|stop` 启停的是**整集群**
  的 ILM 执行、`/cluster/reroute/retry-failed` 触发的是**全集群**未分配分片重试，两者都不带
  索引参数，却被挂在 lifecycle / diag 这种「单索引操作」「只读诊断」页的写键上——rank2 的
  `w:lifecycle` 能停掉整集群滚动与过期删除。现补回静态模型已有的 rank3 档位
  （`REBUILD_OP`/`CLUSTER_OP`/`AUDIT_OP` 同 rank 或 ADMIN），并保留**第二放行通道**
  `w:cluster-settings`（集群设置页的语义本就是集群级操作）——宿主显式授了集群设置写权的
  rank2 运维不被一刀切拦住（quotehub 的 `manager→OPERATOR` 映射即此档）；单索引 rollover /
  `ilm/move` / 全部诊断读能力不缩水；前端 LifecycleView / DiagView 同源前置（不可用态 +
  原因说明，不再是「能点、点下去 403」）
- 热 Setting 两个入口页集对齐：`/cluster/update-settings`（mapping 页前缀）与
  `/cluster/index-settings/update`（index-settings/indices/optimizer 共享写）做的是同一个
  `PUT /{index}/_settings`，但前者只认 mapping 写键——真正持有热更写键的人在「保存」处被
  403。现登记为共享写（mapping + index-settings + indices + optimizer），两入口同权
- 连接档案根路径写形态纳入系统管理域：`"/clusters/"` 依赖尾斜杠只覆盖子路径，根路径的
  批量导入/同步写会漏到 OPERATOR；按「方法非 GET」补根路径判据，GET 列表仍是脱敏只读
  （VIEWER 可读，不被一刀切拦下）

### 加固

- **读侧端点归属完整性补上测试护栏**：976 只保证「每个写端点都有页面/共享归属」，读侧一直
  没人守。而读侧的失败模式更隐蔽——连接模型下 `pageOf=null` 且未登记 `SHARED_READ_PAGES` 的
  读端点会跳过页面门直接落到角色门（VIEWER 即可），即**持任意一页授权就能读**。新增
  `ReadEndpointOwnership1006Test`：反射扫描全部 GET + **只读 POST**（`isReadonlyPost` 与 GET
  同权，同样跳角色门），要求每个读端点归属某页 / 登记共享读 / 落在运行时审计器同一张
  `INTENTIONAL_SHARED` 表上。当前 62 个读端点全部有归属（无实际缺口），此后新增读端点
  漏登记会直接红。**副产物**：扫描器自身发现「注解 value 不带前导斜杠导致只读 POST 被静默
  漏检」——这类“测试通过但没测到”的坑，用一条锚点断言（必须扫到 `/cluster/query`）钉死
- **开发者工具越权矩阵固化为可执行测试**（`DevtoolsEscalationMatrix1004Test`，约 60 条向量）：
  A 集群/系统管理写全拒、B 索引结构写全拒、C 控制面索引「路径/通配/请求体」三通道全拒
  （bulk 动作行 / msearch 头 / mget docs / SQL FROM / `_index` 改写脚本）、D 路径与方法变形
  （`//`、`/./`、`..`、`%5F`、大写、绝对 URL、TRACE/PATCH）、E 数据面放行、F 根级 PIT/scroll
  仅 DELETE 释放形态放行。此前这些边界只存在于守卫代码里，无回归锚——放宽 allowlist 或
  新增穿透项时不会红；现在会
- **根级检索的索引范围规则前后端对齐，且不接受查询参数充当范围**：非 ADMIN 的 `/_search`、
  `/_count`、`/_field_caps`、`/_async_search`、`/_terms_enum`、`/_rank_eval`、`/_search/template`
  必须把索引放在路径里（`/{index}/_search`）或走 PIT（body 带 `pit.id`）。原先守卫接受
  `?index=`/`?indices=` 作为「已限定」凭据——但 REST 层路径/查询参数的合并与优先级随版本实现
  而变，目标端一旦忽略该参数就是一次全量读（控制面索引一并读出），守卫却以为安全；
  索引级路径带同名参数还会造成目标二义。现非 ADMIN 一律拒绝该参数（标准写法在所有版本生效，
  能力不缺）。前端 `devtoolsScope` 镜像同一规则并**带 body 判定**（否则 PIT 搜索会被误禁），
  DevTools / REST 两页提示分档（根级检索 / 查询参数 / 控制面索引三种原因各自说明改法）
- PIT 资源上限：非 ADMIN 的 `POST /cluster/pit/open` 把 `keep_alive` 夹到
  `-Des.rebuild.console.pit.max-keep-alive-minutes`（默认 60 分钟）——只读身份可继续用 PIT
  深度分页，但不能用 `999d` 把搜索上下文无限期钉在集群（低成本 DoS）。无法识别的
  keep-alive 字面量 fail-closed 拒绝；响应回填 requested/applied/clamped 供前端提示
- 审计分级补 `/cluster/scripts/put|delete`：已存脚本是集群级共享件，装卸即时改变他人查询
  行为、删除不可逆，按 HIGH_RISK 留痕
- `/auth/permissions` 对 rest / devtools 页回 `writeScope: DATA_PLANE`：两者共用透传内核，
  非 ADMIN 被 `guardRawGuarded` 收窄到数据面（管理面写全拒），但**数据面内是全权**
  （含任意业务索引的 bulk / DBQ）。面板与 SecurityView 明示范围，避免把
  「调试工具」当小权限授出整个数据面；lifecycle 页在 rank2 连接模型下回
  `CLUSTER_SCOPE_REQUIRED`（可写但集群开关受限）
- 复核后**保留**护栏动作 estimate/dry-run 的写档裁决：estimate 成功即签发 confirmToken
  （写意图凭证），且只有走共享写分支才会置位 `ATTR_CONN_WRITE_GRANTED`——误判为只读会让持
  `w:index-settings` 的低角色用户在「影响预估」处被动作 minRole 拦下。本批以回归锚
  （`PermMapHarden1002Test`）锁死这条边界，防后续「优化只读清单」时反向打破

### 文档

- 配置参考补「授权键与判定顺序」：三种 grantedPages 键形态、七步判定序、共享写端点表、
  集群级动作 rank 硬门、DevTools/REST 数据面全权、PIT 上限——开源集成与 quotehub 侧
  宿主授权都按这一节对齐（不再只有一句 enabled 开关）

### 安全（跨站与凭据面，1003 二轮审计）

- **跨站写防护（CSRF）**：全仓此前对 `Origin`/`Referer`/`Sec-Fetch-Site` 零处理。委托
  `header` 模式下身份=网关注入头 + 浏览器自动携带的宿主 cookie，跨站表单 POST 属 CORS
  simple request（不触发预检），一个 `<form>` 即可借用户身份 abort 迁移 / 取消任务 / 删账号。
  现所有状态变更请求在鉴权前先判 `Sec-Fetch-Site`：`cross-site` → 403 `CSRF_BLOCKED` 并落
  审计（`action=CSRF_BLOCKED`）；`same-origin`/`same-site`/`none`/缺省放行——**只拒 cross-site**
  是刻意的，iframe 嵌入（iframe 内请求即 same-origin）与同站子域集成不受影响
- **审计来源 IP 收窄**：`delegate.header.trusted-proxies` 此前只约束身份采信，审计 IP 与登录
  节流仍按「私网即代理」硬编码判断——内网直连者可伪造 `X-Forwarded-For` 污染审计、并以
  「换 IP 即换配额」绕过登录节流（10 次/5 分钟）。现清单非空时**只有清单内直连方**可声明
  客户端地址（拦截器与登录控制器共用同一份配置）；清单为空维持历史启发式，既有部署零变更
- **setup-token 覆盖委托与重绑**：原实现 `delegate != null` 时跳过令牌校验，只要求委托认出
  ADMIN——header 模式身份可伪造，「把控制面指向哪个 ES」不能只凭角色。现配置了
  `setup-token` 后，委托模式的 `test/apply` 与 `setup/rebind` **同样校验**（第二因子）；
  未配置时行为不变。`/setup/status` 的 `setupTokenRequired` 与实际守卫同口径
  （委托模式配置令牌时报 true，向导才会显示输入框）

### 工具

- 新增**前后端共用的作用域金标准** `console/src/__tests__/fixtures/devtoolsScope.golden.json`
  （66 条向量：`allow`=内核裁决、`ui`=前端应有态）。后端 `DevtoolsScopeGolden1005Test`
  断言内核与 `allow` 逐条一致，前端 `devtoolsScopeGolden1005.spec` 断言 UI 与 `ui` 逐条一致，
  并把核心不变量写成断言：**allow=true ⇒ 前端必须可执行（有权限的人不能被拦）**。
  改任一侧规则未同步样例 → 该侧立刻红，彻底消除「后端允许、前端禁用」与反向漂移

- 新增 `console/scripts/perm-scan.mjs`（`npm run perm:scan`）：以**后端源码为唯一真源**
  反向校验前端——①`SHARED_WRITE_PAGE_KEYS`/`SHARED_READ_PAGE_KEYS` 与 Java 两表逐条比对
  （多出/缺失都报）；②视图里 `canEndpoint(cap, method, path)` 的能力档与路径真实档位比对
  （过宽=亮出必 403 的按钮）；③`canPage` 页 key 必须存在于页面契约；④有写调用的文件必须有
  权限门 token。解析失败即报错（结构变了必须同步脚本，不允许静默通过）。当前读数：
  共享写 21 / 共享读 41 / 页契约 52 页 / 扫描 295 文件，0 处不一致。CI 可直接接（退出码 1）
- **本批零页面契约变更**：未新增/改名任何页 key，quotehub 侧菜单（`LinkMenuProvisioner`
  按契约派生）与既有授权无需迁移；`manager→OPERATOR` 用户若要保住集群级开关，勾上该连接的
  「集群设置」写权即可（第二通道）

### 安全（账号切换与写面同权，1007 二轮并发审计）

- **账号切换不再污染内存态**：此前只清 localStorage/sessionStorage，Pinia 单例里的
  目标连接/索引清单/收藏/通知/查询历史/作业清单/监控序列全部保留——换人后界面仍显示
  上一账号的「生产集群」而请求不带 `X-Es-Target`（写入落宿主），下一次写入还会把旧账号的
  收藏/历史重新落盘。现登录换人/宿主 token 换人时广播 `es-console:identity-changed`，
  内存态同步归零并按新身份重拉；目标双键（id/name）一并复位。同名账号被降权/撤页时，
  403、窗口聚焦、标签页恢复会触发 30s 节流的身份重探，菜单/按钮尽快与后端同口径。
  委托令牌登出改为用**宿主令牌原文**登记本地拒绝表（此前误用内置 token，等于没吊销）
- **宿主凭证被拒不回落内置身份**：`DelegatingConsoleAuthorizer` 在「带了宿主凭证但未被接受」
  时返回未认证，不再回落到浏览器里可能残留的内置 ADMIN token（宿主撤销会话后 iframe
  不得静默升级）。「没带宿主凭证」仍按既有语义回退内置登录
- **删号重建不再复活旧 token**：新建账号 `epoch` 改为随机正值（原固定 1）；同名重建后，
  旧账号未变更时签发的 token 不会重新通过纪元校验。改密/改角色仍递增 epoch
- **出厂默认口令只允许本机登录**：用户库为空时 `admin/es-console` 仅在 loopback 可用
  （默认口令是公开已知凭据）；远程首启请先本机改密或配置强 `fallback-password`。口令比较
  改常量时间。文档补 SSH/curl-localhost 引导路径
- **委托模式配置启动即校验**：`delegate.mode` 拼错或必填项缺失（jwt 无密钥/公钥、
  endpoint 无 verify-url、header 无 user-header）直接拒绝启动——否则内置登录已关闭而所有
  身份都 401，连 ADMIN 都进不来
- **setup-token 重绑打通前端**：配置 `setup-token` 后安全中心重绑表单显示令牌输入并发送
  `X-Setup-Token`（此前仅后端要求，ADMIN 重绑必 403）
- **写面与读面同口径**：`w:search-templates` 只能写 mustache 脚本，painless 源码写入/按 id
  删除需 `painless-lab`（删除前读回真实 lang，未知 id fail-closed）；组件模板（无
  index_patterns、被索引模板引用）写/删需 rank3 或 `w:cluster-settings`；ILM 策略、
  SLM 立即执行、任务取消补入集群级 rank 硬门（与 start/stop、retry-failed 同档）
- **作业变更前端前置**：AdhocRebuildView 的中止/确认切换、XmigrateView 的续跑/中止
  对非创建者隐藏并说明「由 X 创建，仅创建者或 ADMIN」；同连接成员仍可观测进度/报告
- **已存脚本守卫不再误拦 mustache**：`putStoredScript` 此前复用 update 脚本守卫
  （只接受 painless），导致 search-templates 页持写键写 mustache 模板被 403（生产实测）。
  现改为 stored-script 专用守卫：mustache 静态模板放行，painless/缺省按可静态审计口径检查
  `_index` 改写；控制面字面量仍由入口 `guardControlBody` 拦截
- **PIT id 归属**：控制台内打开的 PIT 绑定开启者；同 PIT 仅开启者本人或 ADMIN 可用于
  search/close，账号切换后的旧标签页不再续用（控制台外打开不登记，能力不变）
- **raw 残余通道**：`pit.keep_alive` 嵌套形态纳入上限（页面 `/cluster/pit/search` 同源校验，
  防止用搜索 body 无限续期 PIT）；根级 `_analyze` 的 body.index 过
  控制面守卫；`_cat/shards` 同时摘除 `n`/`id` 列别名与 `unassigned.*`，`ilm-history-*` /
  `slm-history-*` 行过滤；`/clusters/sync` 的 notes 按连接可见性下发
- **前端前置与所见即所得**：SecurityView 不再向页面授权身份亮出必 400 的用户管理表单；
  CmdPalette 的 raw 数据面命令按 rest/devtools 写键放行（reroute 仍 ADMIN）；PROD 徽标
  不再谎称「已封顶只读」；Snapshots 的 DevTools 入口改用 sessionStorage 契约（原 `?_prefill=`
  无人消费，点了空 Tab）；Watcher 入口按系统管理面 ADMIN 收口；脚本/模板覆盖加确认；
  角色自述补全三个专项角色；DevTools 前端镜像对 JSONC/SQL 注释先剥离，消除「注释里出现
  控制面词就误禁」的有权限者被拦

### 真实产线验证（QuoteHub，2026-10-24）

- **部署**：新 starter 安装到本机 Maven 仓库后，仅部署 QuoteHub 后端（控制台静态资源在 starter
  jar 内）并等待 `Started QuoteHubAdminApplication`。部署前备份原 jar
  （`quote-hub-admin-0.0.1-SNAPSHOT.jar.bak-20261024141542`，原 sha256 `f4c8ce82…`），
  本次上线 jar sha256 `f0628674…`；启动健康检查通过。
- **三账号后端矩阵 25/25**：
  - `deng_test_x3`（零页集）：连接目录空、读/写/DevTools 全 403；
  - `deng_test_x1`（飞书委托 VIEWER）：PROD 读 200，文档/脚本/DevTools/ILM 策略写全 403；
    QA 建索引、文档增删读、mustache 脚本增删、DevTools 数据面、painless 执行、
    `ilm/start`（集群设置写键第二通道）全放行；DevTools 管理面写仍 403；
  - `deng_test_x2`（ADMIN）：PROD `_cat/indices`、`_nodes` raw 读放行。
- **前端所见即所得（浏览器 iframe 实测）**：x3 只出「无可访问页面」+ 页面 key/身份/目标/拒绝原因/
  复制申请信息；x1 在 PROD 的 DevTools 显示「当前身份只读：执行需要 ADMIN，或该连接的
  DevTools/REST 写权限」，执行钮不出现；切到 QA 后执行钮出现并提示「当前为数据面写权限…」；
  PROD 搜索模板页隐藏保存/删除并给出只读原因；x2 菜单完整、PROD DevTools 执行钮可用。
- **清理**：探针索引/脚本/组件模板均已删除；本地开发后端与 SSH 隧道已恢复。

### 兼容性

- 无新增必填配置、页面契约零变更（quotehub 菜单派生与既有授权无需迁移）；
  `ConsoleAuthDelegate` 只新增 default 方法（`hasCredential`/`tokenOf`），自定义实现不受影响。
  控制器内部方法为接收 `HttpServletRequest` 调整了签名（非宿主 SPI）；`EsClusterConnController.syncStatus()`
  保留无参直调重载。quotehub 的 `manager→OPERATOR` 仍可通过自动授予的 `w:cluster-settings`
  执行集群级动作。

### 门禁

- 后端：**1507 例 0 失败 0 错误 / 2 跳过**（新增 1007：`RawScope1007Test` 4 /
  `InternalEsIndexRebuildScope1007Test` 3 / `AuthSwitchHardening1007Test` 5 /
  `PitOwnership1007Test` 3 / 跨集群作业归属 2；1002~1006 既有锚全部保留；
  `BuiltinConsoleAuthRevocation990Test` 的「新建 epoch=1」按随机纪元反转；
  `InternalEsIndexRebuildControlReadScope979Test` 补页面可见性所需的 header 桩）；
  前端 `vue-tsc` 0 错；全量 **1102 文件 / 9534 例全绿**（含 1007 新增
  `identitySwitch1007` 11 例与权限/DevTools/REST/审计相关 spec 全绿）；
  `perm:scan` 0 不一致（共享写 23 / 共享读 41 / 页契约 52 / 扫描 298 文件 /
  集群级动作 6；3 条 cluster-scope 端点无页面前缀为刻意设计，靠关键词+共享表裁决）

## [1.0.56]

### 修复

- 构建树字段选择器：指针聚焦全选现值（产线浏览器实测发现——点进已选字段的输入框
  直接打字会追加拼出「_classbond」式零匹配怪字段名）。改字段的用户心智=原值要被
  换掉：鼠标点入即全选，打字首字符自然覆盖；Tab 键盘聚焦保持尾部追加（a11y 惯例）。
  覆盖全部编辑器字段位（子句/聚合/建议器/护栏面板统一走 FieldSelect 单源）。
  全选同步执行：初版经 requestAnimationFrame 异步——后台页签 rAF 恒不触发会静默
  失效（IAB 后台节流实测），聚焦处理器内同步 select() 对前台行为一致且后台可测

## [1.0.55]

### 修复

- insight 护栏动作 fail-closed（并发审计发现的结构性漂移面）：动态 actionId 的写
  请求在授权层双查——①未注册动作直接拒绝（执行器只会 400，授权层提前给出确定
  语义）；②已注册但共享写映射漏登：拒绝（否则静态/混合模型回落 OPERATOR 角色门，
  未来新增动作 minRole≤OPERATOR 即失控——配置漂移显式拦下逼登记）。注册表新增
  contains 判据，装配注入拦截器；前端写门镜像同判。本批含双代理并发审计报告：
  前端写门镜像 96 写形态全覆盖无越权组合；后端写端点全映射，兜底角色门支仅剩
  登出/改密两个自助端点，isReadonlyPost 18 条逐条核验无提权路径

## [1.0.54]

### 修复

- 连接不可见文案分层（产线实报混用误导）：角色低于连接 minRole=提示升角色；
  角色达标但页面授权缺失=提示去宿主系统勾选该连接的页面授权（升角色根本
  解决不了）。授权拦截器与数据面拦截器两处同口径，前端 CONN_FORBIDDEN 优先
  采用后端精确文案（旧后端退回通用文案）。同批全量交叉核对页面归属×宿主
  绑定授权（/overview 同类）：确认无剩余漏网实例——inspect/status/system-inspect
  无前端调用方，config-drift/system 为前后端一致的主机绑定页

## [1.0.53]

### 新增

- 查询构建树富化七连（1010-1019）：function_score 评分函数 filter 升完整查询树 +
  衰减函数字段作键合法形态 + span_last 撤册（1010）；intervals 六类规则一等递归
  编辑器（all_of/any_of 递归子规则 + 八关系位置过滤槽，修正 allOf/anyOf 伪键名，
  1011）；geo_distance/geo_bounding_box 专用坐标输入（distance+经纬度/corners/edges
  + 越界警示，1012）；pinned 置顶 ids chips（回车/逗号/粘贴拆分/IME 安全，1016）；
  percolate document 一等 JSON 编辑位（draft/标红/回流三件套，1017）；more_like_this
  like 混合形态编辑器（对象 JSON 区 + 数组 chips 逐文档编辑，1018）；terms lookup
  三具名输入（index/id/path 语义句式，1019）——查询算子复杂形态全部脱离裸键值表
- 聚合与高亮 schema 化（1020/1021/1026）：常用聚合 body 具名参数表单（枚举/布尔/
  数值档）+ 低频族补录 + 聚合建议表扩员 30+；highlight 字段级 type 三档枚举与
  fragment 系数值档；date_range ranges 三元组行编辑 + filters 命名桶完整查询树（1022）
- 索引上下文行冻结全站（1024/1025/1027，Excel 冻结窗格语义）：查询工作台页头行、
  26 个视图的当前索引 chip 行、索引工作区索引名行——长页滚动时集群/索引上下文恒悬
  可视区顶

### 修复

- vitest/vite 解析器 .ts 优先（并行迁移 .js 快照遮蔽正源——新导出在测试与产线包
  静默失效的根因，1020）
- SideNav 空闲态圆点 fallback 误写 `--text3`（全站 token 为 `--tx3`）带硬编码色——
  浅色主题必然色错（1022）

## [1.0.52]

### 修复

- 拒绝面板自报前端版本（+身份确认中标记）：「改了没生效」类报告可一眼定界——
  面板版本号低于发版单即浏览器缓存了旧 bundle（iframe 资源按部署版本参数缓存，
  旧标签页不重开拿不到新前端）

## [1.0.51]

### 修复

- /forbidden 停车自愈兜底（产线实报 x1 跨分钟停车）：回迁依赖 watch 触发，若连接
  目录加载曾失败/后端瞬态不可用，之后无状态变化即永久停车。停车期间每 5s 用当前
  输入有界重判（≤12 次），记录页放行即回迁；离开 /forbidden 或次数用尽即停，
  真被拒时纯函数重判零成本

## [1.0.50]

### 修复

- 后台目标纠正全静默（产线实报最后两条历史残留被当脏数据）：autoPick 的
  「宿主集群未授权任何页面，已切到…」与目录回落的「目标集群连接已删除，已切回
  宿主集群」不再弹也不再入史——切到哪个连接顶栏切换器如实可见，「已删除」对
  权限场景（连接没删、只是该身份不可见）是错误表述；回落行为本身照走

## [1.0.49]

### 修复

- 「上次工作现场」提示时机移到身份确认后：现场记录是账号视角产物，换号清理挂在
  probe 成功路径——此前提示在探测前发出，x3 会收到 x1 的「查询工作台」现场
  （产线实报）；同账号场景不变（身份确认后照常一键回）

## [1.0.48]

### 修复

- 换号脏数据清零（产线实报 x3/x1 互见对方的通知与工作现场）：通知历史/已读位/
  工作现场是账号视角产物，换号清理清单补齐三类键——x3 不再看到 x1 的「已切到
  es_excel_conn」等历史，恢复提示不再把 x1 的「查询工作台」现场弹给 x3
- 作业轮询器「未被授权任何集群连接」记录加目录就绪前置：连接目录未到（开屏
  竞态窗）时不记录不弹，目录已加载仍不就绪（真·未授权）才留一条聚合记录

## [1.0.47]

### 修复

- 作业轮询器的「未被授权任何集群连接」提示改为只入史不弹（产线实报 x1：有授权、
  数据全渲染，仍被弹此条）——该判定在「身份已到、目标未钉选」的开屏竞态窗内
  对有授权的人误报，下一拍目标落位即自动恢复；后台自愈对称静默，历史留聚合记录

## [1.0.46]

### 修复

- 目标回落的后台自愈改为只入史不弹：跨账号残留目标（换号后 localStorage 按域共享）
  触发的「目标集群连接已删除，已切回宿主集群」对权限场景是错误表述（连接没删，
  只是该身份不可见）——自愈行为由顶栏切换器如实呈现，通知历史保留一条聚合记录
- 概览页监控历史区块的权限类失败走空态而非「加载失败+重试」错误条（产线实报：
  零授权身份进概览的过渡窗口内，/monitor-history 必 403 渲染成区块级报错）；
  真实故障照常报错可重试

## [1.0.45]

### 修复

- 跨账号残留目标头毒化鉴权链（产线实报：同浏览器换号进入，上一账号的
  es-console.target 以 X-Es-Target 随请求发出——零页集身份对该连接不可见，
  /auth/me 与 /clusters 被连接可见性闸打成 CONN_FORBIDDEN：身份探测失败呈现
  「身份未确认」全量菜单假态+连接目录加载失败，要等兜底重置目标才自愈）。
  三层修：①后端自救通道（bootstrap：身份/连接目录/健康/setup）豁免连接可见性
  检查——目录本身按可见性过滤行级，数据面另有 EsTargetInterceptor 独立闸，安全
  不减；②前端身份/管理面请求（auth/clusters/setup）不发目标头；③换人清理清单
  补目标选择键（目标选择是账号可见性产物，不得跨账号携带）

## [1.0.44]

### 修复

- 拒绝页自动回迁的提交竞态（产线实报：x1 误拒后停车 /forbidden 35 秒，手点「回到
  概览」才恢复）：误拒 replace('/forbidden') 是异步导航，提交时身份/连接目录可能已
  收敛——App 复核 watch 先于 replace 提交跑完且走放行分支（当时路由还是原页面），
  之后无新触发即永久停车。回迁裁决下沉到路由守卫：每次 /forbidden 落地用当前输入
  重判记录中的被拒页，已放行则原地回迁（与落地同帧输入，竞态免疫）
- 「上次工作现场：/forbidden」不再记录也不再提示（产线实报：拒绝页被当工作现场
  记住，「继续上次」把人带回错误页）：/forbidden 是错误态不是工作现场；已写入的
  存量记录同样过滤

## [1.0.43]

### 修复

- 构建解析序修正（1.0.42 产线实锤：部分修复静默失效）：src 下存在并行迁移产生的
  整树 .js 快照（untracked 中间态，内容冻结于生成时刻），vite 默认 .js 优先解析
  让快照遮蔽 .ts 正源——app 层（读拒绝入史、索引列表 403 态）的 1.0.41/1.0.42
  修复实际未进产线 bundle。现 .ts 优先解析；.vue 组件不受遮蔽（故侧栏/概览部分
  修复在 1.0.42 已生效）

## [1.0.42]

### 修复

- 无授权身份的菜单闪现（产线实报：进页面先渲染全量菜单、身份到达后再全部隐藏）：
  侧栏与命令面板在身份探测完成前不出任何导航项（grantedPages 的 null=全量可见
  语义只有探测完成后才可信），探测在途显示「身份确认中…」中性态，完成后按授权
  精确渲染
- 读拒绝不再写入通知历史（产线实报：零授权用户的通知历史被 /cluster/indices、
  /cluster/shards、/cluster/health 等引导读的拒绝记录刷屏）：GET/HEAD/OPTIONS 的
  403 完全静默——无授权全屏已在讲同一件事；写拒绝保持弹窗+入史（用户主动动作）
- 拒绝页时序补偿（产线实报：x1 进入时身份/连接目录未收敛被误拒停在 /forbidden，
  授权明明已生效却不自动恢复）：拒绝页现被记录（仅内存），身份/连接目录/环境
  收敛后自动回迁原页面；用户主动离开 /forbidden 即作废，刷新停 /forbidden 不突发跳转
- 零授权身份侧栏底态改报「未授权任何集群」（灰点中性态）：此前 clusterOk 保持
  未知态导致「连接中…」永久挂着像卡死

## [1.0.41]

### 修复

- 无授权身份开屏的视图级提示收口（产线实报：v1.0.40 零授权用户进控制台仍有 3 条
  失败弹窗）：上一批静音了全局 403 通道，但各视图自己的 catch 仍在逐条弹——
  概览页（概览接口/集群健康）与索引列表加载对权限类失败（403 或带 page/denied
  归因）不再弹窗，真实故障（网络/超时/ES 错误）保持必弹；概览页集群健康探测
  与概览/健康接口同门槛，空集=全拒身份零发出
- 零授权身份不再显示「集群连接失败，部分功能不可用」横幅与侧栏红点：索引列表
  403（无授权）此前与真故障同路置 clusterOk=false，现与 401 同路保持未知态——
  连接没坏，只是对该身份不可见

## [1.0.40]

### 修复

- 概览聚合读的授权目标修正（产线实报：概览接口 403 而同页 monitor-history 200）：
  GET /overview 执行恒在宿主（登记 indexKey 状态摘要+本实例 owner），但授权此前被
  宿主绑定路径兜底钉死在 host——纯连接授权用户（grantedPages 全是 conn:{id}:* 键）
  在 host 维度落空页集，被页面门 403。现与 /keys、/desired-state 同例：读请求授权
  随目标头取 conn:{id}:{page} 键，写仍按 host；无目标头时维持宿主裁决不变
- 权限拒绝提示的读静音（产线实报：无授权身份进控制台右下角并发弹 5+ 条 403）：
  全局 forbidden 通道对 GET/HEAD/OPTIONS 读拒绝只落通知历史不再逐条弹 toast——
  开屏并行引导（索引选择器/健康探针/概览聚合/监控历史）对无页面授权身份一次挂一串，
  而页面自身的禁用态/空态/无授权全屏已在讲同一件事；写请求保持必弹（用户主动动作）

## [1.0.39]

### 修复

- 空页面授权的自救通道豁免（产线实报：纯连接授权用户全屏 403 死锁）：连接目录
  （GET /clusters）与基础健康探针（/health）此前被空页集拒绝——纯连接授权用户
  （授权全在 conn:{id}:* 键、宿主维度无键）既看不到菜单也拿不到可切换连接列表，
  前端的授权目标自动落位（autoPickConnTarget）因目录为空永远无法触发，形成
  「454 个授权键在手却满屏无任何页面授权」的死锁环。两通道放行后，用户首次进入
  即自动落到第一个有授权的连接；列表本身仍按 minRole+可见性过滤，不泄露未授权连接

## [1.0.38]

### 安全

- 空页面授权拒绝（`PAGE_DENIED`）文案可操作化：宿主委托部署下「当前身份无任何页面授权」
  最常见根因是委托侧实体未拿到授权（如飞书 SSO 自动新建账号只挂默认角色，授权配置留在
  另一实体上）——文案直接指引到宿主系统角色菜单勾选 ES 控制台连接授权，SSO 登录需确认
  绑定的是被授权账号（配合 quotehub 侧同批的飞书实体分裂 WARN，产线用户实报
  「配置了只读授权仍被拒」的自助排查闭环）

## [1.0.37]

### 安全

- 连接档案凭据静态加密（AES-256-GCM）：连接密码/ApiKey 此前以明文落控制集群索引
  （或 JDBC 表）——任何能直连控制存储的主体即取得全部目标集群凭据。现在落库统一
  加密（`enc:v1:` 前缀）；密钥显式配置 `conn-secret` 优先（多实例共享），未配置时自动
  生成落自举档案目录（单实例零配置）；存量明文档案读取透明兼容、带新凭据的保存自动
  升级为密文；密钥不一致显性报错绝不静默降级；编辑留空沿用旧密码时存储形态原样
  （绝不二次加密）。控制集群索引泄露事件的爆炸半径从「全部集群凭据」收窄为
  「需要同时拿到密钥文件/配置」
- raw 通道分号拒绝收窄到路径段：此前对含 query 的全串检查，`q=foo;bar` 这类合法检索
  值被误杀（非管理员在 DevTools 执行带分号查询参数的检索直接被拒）——矩阵参数防护
  语义不变（路径部分的 `;x=1` 仍拒），query 值里的分号不再误伤
- 迁移续跑并发双发收口（`registerIfAbsent` 原子占位）：`isRunning` 检查与注册之间的
  窗口里并发 resume 同一作业会建双执行器双写目标索引；即席重建新增全局在途作业上限
  （8 个，超限明确拒绝）——worker 是无界线程池，此前批量提交数百索引即数百并发重建
- 权限关键词档新增前后端对拍守卫：rank3 写关键词（`OPS_WRITE_HINTS` ↔
  `REBUILD∪CLUSTER_KEYWORDS` 并集全等）与 ADMIN 档双向对拍（前端不得超出后端；
  后端缺项必须被 BOOTSTRAP 豁免覆盖）——此前共享读写表与只读 POST 有对拍锁，
  关键词档位表漂移只能靠人工核对
- ES highlight 片段净化的 class 白名单收紧（合法类名字符集）：引号虽已排除无法逃逸
  属性造事件，但任意 class 名仍可命中本站样式类造成视觉混淆
- 换人清理补六个一次性前缀（pit 过滤/rebuild-paste/search-templates.carry/flame/
  lifecycle.rollover/link 深链）——换身份后不再自动回填上一用户的预填载荷；
  登出吊销表与登录节流的多实例语义补文档（实例内存态，多实例登出只吊销单实例）
- 迁移作业持久化补 `srcConnId` 透传：连接模型下迁移作业的查看/中止/续跑授权全部按
  `job.srcConnId` 对写键，快照丢失该字段后发起者「发得出、收不了」——作业列表不可见、
  无法中止自己发起的迁移（宿主写入端失控写到自然终态）
- 吊销表/登录节流表封顶改驱逐腾位：持任一有效凭据循环登录-登出即可灌满吊销表封顶
  （成功登录不节流、token 唯一），旧的「满了拒绝新吊销」会让所有人的被盗 token 在
  TTL 内无法吊销；节流键空间同理（海量随机用户名各失败一次可让全部计数静默失效）——
  两者改为清过期后驱逐最早到期/最旧窗口条目，新吊销与新计数恒生效
- 跨集群迁移 `slices`/`batchSize` 服务端钳制（≤32/≤10000）：slices 直接映射线程池大小，
  一次请求即可建十万线程（认证后的资源耗尽面）；resume 从持久化文档读取同钳
- 带 body 请求统一 32MB 体积上限（拦截器层）：raw 通道原有 32M 字符守卫，其余
  `@RequestBody` 端点此前无任何应用层限制，数百 MB JSON 会被 Jackson 全量读入
- 账号管理读-改-写竞态收口（`upsertUser`/`deleteUser` 同步化）：并发降级/删除可双双
  通过「最后一个 ADMIN」检查后落写，零管理员锁死；用户名拒绝控制字符（token 载荷、
  审计档与日志共用，防伪造日志行），审计用户名钳制同步清洗 CR/LF
- `xmigrate/dest-indices` 补宿主隐藏检查：xmigrate 不经数据面目标拦截器，
  `host-cluster-visible=false` 的纯管理平台形态下成为宿主索引元数据的旁路泄露口
  （对齐 `/cluster/**` 的 HOST_DISABLED 行为）；作业列表 `limit` 封顶 500（对齐审计域）
- 端点覆盖自检反射失明时不再打「覆盖完整」的假通过 INFO（区别空集与失明，降级标记）
- 演示宿主默认绑回环（与 standalone 同款）：用户索引为空期间兜底账号窗口不再暴露给
  全部内网网卡
- 命令面板三处体验断裂修复：「把当前 DSL 送去火焰图分析」「实时大屏全屏切换」的
  一次性载荷此前无人消费（空跳转假动作）——目标页接线读后即清；「快速 SQL」
  「DevTools 新开标签」改为先判页权再写预填键（无权被拒时键不残留，避免下次合法
  进入时意外执行陈旧预填）
- typed 兼容路由收口（非管理员 raw）：旧版 ES 路由把操作动词后置到第 3/4 段
  （`/logs/_doc/_bulk`、`/logs/_doc/1/_update`、`/logs/_doc/_search`），按第 2 段分派的
  body 守卫全部失明——bulk 动作行 `_index`、update 脚本 `ctx._index`、search 跨索引
  terms lookup 可直写/直读控制面索引；后置动词段（含 `_mapping`/`_alias` 管理形态）一律
  拒绝，前端 devtoolsScope 同口径镜像（不再亮「可执行」）。矩阵参数路径（`;x=1`）与
  单数 `_termvectors` 的 `docs[]` 跨索引 body 同批收口
- `/setup/status` 的 `builtinLogin` 改按 `isLoginEnabled()` 口径下发：此前取「内置服务
  Bean 是否存在」，委托部署（内置登录自动关闭）的登录遮罩会展示永远登不进的本地表单，
  而不是宿主鉴权指引面板
- 登录失败节流（10 次/5 分钟锁 10 分钟，键=用户名|IP，灌水防护）+ `/auth/logout` 端点与
  token 指纹吊销表（SHA-256 指纹，封顶 1 万，TTL 检查后回查）；审计 IP 取 XFF 最右非受信跳
- 非 ADMIN raw 响应信封脱敏（bulk failure/_msearch item error 的拓扑信息）；索引级
  `_recovery/_shard_stores/_segments/_stats` 拓扑读与根形态同权拒绝（前后端清单镜像）；
  reindex 强制 `source.index` 在场；嵌套 `template.id` 已存模板引用同权拒绝
- 安全响应头过滤器（nosniff/no-referrer 全量，auth 域 no-store，`frame-ancestors` 仅显式
  配置时下发且覆盖控制台 HTML/静态资源——只下发到 API 路径对被嵌的文档无效）；透传
  body 32M 上限；鉴权关闭告警改无条件启动检查（原挂在审计条件链里永不发声）
- 端点授权覆盖自检兼容 Spring Boot 2.6+ 的 PathPatternParser（原 `getPatternsCondition()`
  恒 null 时自检全量失明还报「覆盖完整」）；header 委托拒识 WARN 附 remote 地址与
  trusted-proxies 配置写法（容器网段/CGNAT/IPv6 直连网关误配即锁死的排障入口）；委派身份
  修改密码不再误报「旧密码不正确」（提示在宿主系统改密）
- 控制台 iframe 宿主握手消息加同源 origin 校验（quotehub 等同源嵌入不受影响；宿主页面
  被 XSS 时攻击脚本拿不到本源消息通道）
- 授权口径统一剥末段扩展名（`/cluster/doc.json` 曾绕过整个页面门：Spring 5.x 后缀模式匹配把它
  路由到 `cluster/doc`，而页面门/共享映射按严格段边界失配 → 落角色门 VIEWER 放行，只读页用户可读
  任意业务文档）。`desired-state.html` 等真实带点端点剥后仍落同一归属，纯扩展名段 fail-closed
- `X-Es-Target` 的角色闸从数据面扩展到全部按目标头取页键的路径（`adhoc-rebuild/abort|status|jobs`、
  `desired-state`、`es/index/keys`、`mapping-reconcile/report`、`config-lab/drift` 原先只查页键、
  不查连接 minRole：持 `conn:B:w:adhoc-rebuild` 但角色低于 B.minRole 者可中止 B 上的重建）
- 委托部署默认关闭内置账号登录（`es.rebuild.console.auth.builtin-login-enabled` 三态）：此前默认
  兜底账号 `admin/es-console` 可经免鉴权的 `/auth/login` 直接拿本地 ADMIN（`grantedPages=null`
  绕过全部页面门），等于宿主鉴权之外的永久后门；默认口令仍生效时启动 ERROR
- 账号管理防提权：非 ADMIN 只能授予不高于自身的角色、不能改写更高角色账号、不能重置他人密码
  （建号给初始密码除外）；非 ADMIN 不能删除同级或更高角色；委派会话（含委派 ADMIN）不得创建/提升
  本地 ADMIN（本地账号可绕过宿主鉴权，属持久化后门）
- JWT 委托：`exp` 缺失即拒（`require-exp` 默认 true，旧宿主可显式关闭并 WARN）、非数值 `exp`/
  `nbf` 一律拒绝、补 60s 时钟偏移与 `nbf` 生效校验
- 全量审计 rank3 硬门改前缀匹配（精确相等会让未来 `/auth/ops-audit/export` 类子路径被 security
  读键静默短路），`/auth/ops-audit/mine` 保持自助可用
- 页面授权逃生阀关闭时保留真实身份形态（此前硬编码 `delegated=true` 会把内置身份误标成委派，
  导致 `/auth/me` 来源错误、改密被只读规则挡下）
- 审计 detail 清洗 CR/LF 与控制符（日志注入）；EXEC 事件记录真实响应码（原硬编码 200 会把失败
  执行记成成功）；去重装饰层吞掉委托方异常（审计永不反噬请求）
- 权限面板与执行门对齐：security 写只读判定改按 `isDelegated`（原 `!admin` 把所有非超管都标成
  委派只读，面板说不可写、实际可写）；`xmigrate` 面板区分「源写键」与「宿主写键」（只可中止的
  用户不再被报成完全不可写）；`config-drift` 读按 host+目标双作用域取并集；新增 `readScopes`
  与 `writeScope`（aliases add-only）细粒度字段
- 环境页面模板值归一化（`Indices`/`indices ` 不再静默失配）；`effectivePages` 与 `inConnModel`
  共用同一套连接键判定（畸形 `conn:x` 键不再两边各说各话）
- 新增启动期端点授权覆盖自检：扫描全部 `/internal/es/**` 映射，把「无页面/共享归属」的写端点
  （连接模型下必 403 的假入口）与读端点（VIEWER 可读的越权面）汇总 WARN

- DevTools/raw 纵深加固：路径拒绝 `#` 片段与 `%23`（守卫看 `index#`、HTTP 客户端只发 `index`，曾可绕过
  `DELETE /index` 与精确系统读拒绝）；所有 JSON 守卫入口统一剥离 BOM（`_bulk` 动作行/`_index`、
  search/reindex/alias/template/restore/mget/SQL 不再因解析失败被静默跳过）；`wrapper.query`
  base64（标准/URL-safe）解码后递归过二级索引守卫；系统读新增拒绝 `_aliases`、`_tasks`、
  `_cat/tasks|pending_tasks|templates`、`_cluster/allocation|pending_tasks`、`_index_template|_template`；
  `_cat` 重复 `h` 参数必须每组都保留 index 列；`_render/template` 禁止按已存 id 回显模板体；
  合法 PIT 搜索按 ES 契约免显式 index（空 `pit.id` 仍拒绝），`DELETE /_pit` 恢复可用
- 非 ADMIN 删除快照前解析快照真实索引，含控制面/系统索引或无法证明内容一律拒绝；快照仓库凭据
  脱敏改为点号/连字符归一后匹配，覆盖 `conf.fs.s3a.access.key`、Azure account key、`api_key` 等插件写法
- 迁移面收口：`resolve-preview` 不再允许 `es.rebuild.console.*`（token-secret 泄露可伪造 ADMIN），
  由敏感 ref/占位符解析出的 scheme/host/port/username 一律不回显，`portRef` 报错不回声原值；
  源/目标索引必须是精确业务索引（拒绝控制面/系统/通配/列表/date-math），续跑对历史作业同样校验；
  `connect-check` 与 `dest-indices` 过滤控制面索引名
- 全量审计行级隔离只认 security 授权：其它连接/任意静态页面读键不再放大 `conn:{id}:security`
  的可见范围；宿主专属端点带远端 `X-Es-Target` 时审计归属记宿主，不再记到远端连接账上
- 环境页面模板键大小写不敏感；显式空模板=该环境静态页全拒（未配置该环境仍原样透传）。
  `/cluster/inspect` 样本文档只下发给 indices/search/browser/doc-diff 页面，mapping 等纯元数据页
  只回结构；`browser` 从文档写归属移除（保留文档读面），`w:browser` 不再隐式获得覆盖权；
  权限面板对 `system`/`config-drift` 按 host 授权回显，不再出现「面板说可读、实际 403」的假入口
- 前端：宿主换发 token 或 401 时立即撤旧身份（`invalidateIdentity`），probe 落地前写门 fail-closed；
  同一标签页换人登录清除上一用户 DevTools/REST 草稿、历史、收藏与查询历史；迁移中止 3s 定时器
  离页即清空且回调内重新校验权限
- DevTools/raw `?source=` 与请求体同权过守卫：SQL/mget/msearch/search/template 不再能借查询参数
  直读控制面；`_msearch` 同时校验 `index`/`indices` 且拒绝空数组（空数组会退化为全量），搜索 DSL
  的 `indices` 二级查询、模板 `inline/template` 字段与 BOM 前缀 id 一并收口；GET 携带 body 不再被
  静默丢弃；业务检索正文里出现 `es_console`/`.security` 字样不再被误杀
- env 页模板同时封顶静态键与 conn 读写键；conn 读键不得把 env 排除的静态页重新并入写权；
  低角色静态 aliases + config-validator 写键强制 add-only；护栏动作仅在 conn 写键直接授权时跳过
  minRole（混合模型静态回落仍按角色档）
- 审计行按连接 minRole 二次收口，零页面授权不再拿到 audit-facets 全量建议；迁移/托管重建
  审计归属请求目标连接；宿主 security 键在连接目标下仍保留宿主审计入口（行级仍只看 host 事件）；
  已删除连接的监控实名不再回落宿主；快照列表/状态对非 ADMIN 去除控制面索引名，仓库凭据脱敏
  覆盖 URL userinfo 与 `Authorization` 头
- 前端：跨标签页目标/令牌变更同步并重探身份；DevTools 权限撤销量在途 busy 自动复位；
  `/auth/me` 404 仅在 setup/status 明确 `authEnabled=false` 时视为无鉴权；browser 静态页不再
  回显文档写权；别名面板对 add-only 授权隐藏切换/解绑/扩展参数（只保留 index+alias 创建）
- 读档纠偏：`GET /cluster/ilm/policies` 不再因写关键词子串误提 rank3；混合模型的静态
  xmigrate 写档与 ADMIN 不再被源/宿主写键检查拦死；未绑定窗口的 `/setup/test` 在宿主委托
  部署下要求 ADMIN（关闭匿名 SSRF 探测）；连接模型 ADMIN 发起/续跑迁移保持全局放行

### 安全（985 校准轮）

- DevTools/raw：`index`/`indices` 查询参数拒绝空值、裸参数与重复项（ES 只取首值，空首值会
  退化为全量索引搜索）；搜索模板拒绝 lookup 结构键/索引值中的 Mustache 占位符、对象 source
  内的子句键占位符与分隔符切换（防渲染后把 `index/id/path` 或子句类型伪装成控制面查找）；
  `/_render/template/{id}` 路径形态、`/_cluster/health/{index}?level=indices|shards` 与
  `_update_by_query` 脚本改写 `_index` 一并拒绝；`_terms_enum`/`_rank_eval`/`_knn_search`
  的 body 同过二级索引守卫；`pipeline` 参数与 reindex `dest.pipeline` 解析管道定义，
  含 `reroute`/`_index` 或无法确认时拒绝（防管道把文档改写到控制面）；系统读补充拒绝
  `_cat/nodes|nodeattrs|thread_pool|plugins|transforms|ml|component_templates`、
  `_data_stream`、`_features`、`_license`、`_xpack/license|usage`、`_cluster/stats`、
  `_enrich`、`_monitoring`
- 前后端所见即所得：`/auth/me` 下发 `envPages` 环境页模板，菜单/路由/按钮/轮询与后端
  `EnvPagesResolver` 同口径收缩（显式空模板=全拒，未配置 env=不收缩）；权限面板
  `sharedWriteAllowed`/`rawAllowed`/`devtoolsAllowed` 过 env 模板，不再虚报「可写」；
  host-scope security 与源连接 xmigrate 授权在顶栏目标不同时仍显示入口；静态 rest/devtools
  页不再给非 ADMIN 露必 403 的死入口（连接写键仍可见）；表格文档写只认
  search/indices/doc-diff 写键（aliases/optimizer 写键不再放大为文档编辑权）；
  UpdateByQuery 删除模式按 delete-by-query 端点单独授权（`w:search` 用户不再被误拦），
  快照/ILM 弹窗在权限撤销后同步禁用提交
- 未绑定首连窗口新增可选 `es.rebuild.console.setup-token`：配置后 `/setup/test|apply`
  必须携带 `X-Setup-Token`（常量时间比较）；默认空时匿名首连只允许本机回环且无转发头，
  远程/反向代理初始化必须配置令牌；委托部署仍要求宿主 ADMIN
- 自定义 `EsConsoleAuthorizer` 部署新增 `/auth/me` 兜底端点：回显拦截器已认证的角色/页面授权/
  env 模板，前端不再把 404 误判为「无鉴权部署」而全开菜单（后端执法与前端所见重新对齐）
- 审计：删除索引/快照恢复/模板删除/ILM 停止/迁移启停等破坏性写落 `HIGH_RISK`（仅审计分级，
  不改变授权）；raw 法证摘要剥离换行控制符；来源 IP 仅在直连方为回环/私网代理时才信
  `X-Forwarded-For`/`X-Real-IP`，公网直连伪造转发头不再污染审计法证

### 安全（986 终审轮）

- DevTools/raw：`_bulk` 动作行 `pipeline`、`_update`/`_update_by_query` 脚本（含拼接、
  动态 `ctx[...]`、已存脚本 id）、SQL `filter` 二级查询、`_mtermvectors`
  的 `docs[]._index`/`parameters.index`、`_rank_eval.template_id`、快照恢复逗号通配
  逐项解析；pipeline 定义拒绝嵌套 `pipeline`/`reroute`/`date_index_name`/`script`
  与定义内控制面索引名（无法确认一律 fail-closed）
- 自定义 `EsConsoleAuthorizer` 返回的非委托 `grantedPages` 与委托同权执法：
  拦截器/连接可见性/审计聚合/权限面板/前端菜单共用同一白名单；env 模板收缩为空集时，
  pageOf=null 的共享端点读写同样全拒
- 前端预暴露补齐：DevTools 非 ADMIN 仅数据面可执行（系统管理/别名/快照/模板/脚本
  提前禁用并给出原因）；命令面板动作按目标页过滤；收藏重放先过页面门；任务轮询按
  tasks/task-tree 页授权；Watcher/ILM 的 DevTools 入口按 DevTools 页权提示；
  REST 只读身份显示内联说明；无内置登录的部署在登录遮罩给出宿主认证指引
- 前端预暴露收官（只读说明条六视图 → 十四视图）：高级重建/别名/集群设置/映射/ILM 策略/
  生命周期/快照策略/快照八个写操作视图补页面级只读横幅（身份已探测且无写权限时出现，
  解释哪些操作不可用）——此前这些页面的写钮按 v-if 隐藏、页面无任何解释，用户只看到
  功能凭空消失；权限拒绝的全局出口统一给出「缺什么 + 怎么办 + 一键复制申请信息」，
  连接目录加载失败保留上次清单并告警（不再清空成无法区分「故障/被删/被撤权」的空壳）

### 新增（1027 批：索引工作区上下文行冻结）

- 索引工作区（/indices）的**索引名行**（健康点/索引名/状态 pill/Setting·别名·Mapping·
  重建动作/docs·size·分片·创建·别名元信息）升级为冻结窗格（sticky）——吸附滚动容器
  `.ih-right` 顶：文档检索/DSL 查询结果滚深后仍知道「在看哪个索引」、随时可切运维动作；
  实底 + 负边距拉满 `.ih-ws` 内宽防内容缝隙滚过（行冻结全站推广收尾——至此带索引
  上下文的页面全覆盖：26 个 chip 视图 + 查询工作台页头 + 索引工作区名行）

### 新增（1026 批：低频聚合族 schema 补录 + 建议表扩员）

- 聚合参数 schema 补录低频族：percentiles（hdr/tdigest 布尔档、compression/
  number_of_sigmas 数值档、keyed）、percentile_ranks、extended_stats（sigma）、
  significant_terms（size/min_doc_count/exclude_frequent）、rare_terms
  （max_doc_count）、sampler 族（shard_size）——percents/values 等数组键留自由表
- 聚合类型建议表（datalist）扩员 14 项至 30+（百分位排名/显著词项/稀有词项/采样/
  Top 指标/缺值聚合/地理边界/地理质心/复合分桶/脚本聚合/绝对中位差/箱线图/
  字符串统计/加权平均）——低频聚合不用手打名字
- field 行 FieldSelect 扩员 13 个单字段聚合（percentiles/extended_stats/
  significant_terms/missing/geo_bounds/加权平均 等）——字段候选+类型徽标+置顶
  同步获得；随迁 flattenWave560 错误盒锁面（概览三源硬编码已重构为 pushErr 循环
  单源，friendlyEsError 行为保留，锁面按现实现更新）

### 新增（1025 批：索引上下文行冻结全站推广——26 个视图一次覆盖）

- 批 1024 的查询工作台页头冻结推广到全部带当前索引 chip 的视图（分词验证/相关性
  实验室/Update By Query/Reindex 预估等 26 个）：CurrentIdxChip 挂载时给所在页头行
  注入全局 `.cic-row-sticky`（theme.css 统一 sticky/实底/负边距拉满宽）——一处组件
  改动覆盖存量、新视图自动获得
- 注入规则：父行是左右布局左段（lr-bar-l）时上提一层冻整行；父已 sticky/fixed
  （查询工作台页头等）跳过不叠加；watch 驱动而非挂载钩子——「先开页后选索引」场景
  同样生效（组件挂载时 chip 尚未渲染的空档不丢注入）；幂等（视图内重复渲染不重复注）
- 浏览器抽查：分词验证（普通行）/Reindex 预估（统一页头+索引行双层冻）/查询沙盒
  （由工作台页头冻结覆盖）注入与吸附全部实测通过

### 新增（1024 批：查询工作台页头行冻结——集群/索引上下文恒悬）

（批号勘误：初记 1023，与 a30c407（先占）撞号，按先占方保持惯例改记 1024。）

- 查询工作台页头行（模式胶囊 + 当前索引 chip：健康点/索引名/docs·size/深链动作）升级为
  **冻结窗格（sticky）**：长页滚动时恒悬可视区顶——翻到结果深处仍知道「在哪个索引上查」，
  集群/索引选择器（TopBar）本就恒固定，两行合一构成完整的上下文冻结
- 实现要点：sticky 挂 `.qh-top`（父 `.qh` 贯穿整页高度保证吸附行程）；实底 `--bg0` +
  横向负边距拉满 `.page` 内容宽（token 同源 `--sp-5`）防内容从缝隙滚过；z-index 压内容
  让位弹层；浏览器实测滚动 1200px 后行恒在吸附位、chip 全程可见

### 新增（1022 批：date_range/range ranges 行编辑 + filters 命名桶查询树）

- `date_range` 与 `range` 聚合的 `ranges` 数组从递归键值表升为**三元组行编辑**：每行
  from → to → key 三输入（from/to 接受 date-math 串或数值、开区间 from-only/to-only
  半成品合法、key 空删键）、行级增删；`filters` 聚合的桶升为**一等查询树编辑**——
  命名形态每桶 = 桶名输入 + MiniTreeEditor（bool/nested 全套树编辑，与主树同语言），
  匿名数组形态逐项树行；other_bucket 等参数走 schema 表，畸形 filters 键保真退化
- date_range 补齐 field 行 FieldSelect（date 类型置顶）与 format/time_zone/keyed
  schema；corpus 补 ranges 混合区间与 filters 两形态往返语料
- 顺手修：SideNav 空闲态圆点 fallback 误写 `--text3`（全站 token 实为 `--tx3`）带
  硬编码色后备——token 守卫红多轮，改用正版 token（行为零变，浅色主题下取同源色）

### 新增（1021 批：highlight 字段参数 schema 化）

- 高亮字段级参数从裸键值表升为 **schema 驱动具名控件**：`type` 三档枚举下拉
  （plain 普通高亮 / postings 词项高亮 / fvh 快速向量高亮——高亮器选型不用记拼写）、
  fragment_size / number_of_fragments / fragment_offset / no_match_size 数值档；
  未登记键（matched_fields / highlight_query / 字段级 pre_tags 覆盖等）维持自由表
  加键零丢失；全局参数表（pre_tags/post_tags/order…）不受影响
- 至此构建器三面（查询算子 / 聚合 body / highlight 字段）全部 schema 化收口，
  GenericParams 的 enum/boolean/number 具名控件语言全站统一

### 新增（1020 批：聚合 body 按类型 schema 富表单 + vitest 解析解堵）

- 常用聚合（terms/date_histogram/histogram/range/avg/sum/min/max/cardinality/top_hits）
  的参数体从裸键值表升为 **schema 驱动具名表单**：execution_hint 三档枚举下拉、
  keyed 布尔档、size/interval/min_doc_count/precision_threshold 等数值档、
  calendar_interval/format 等文本档——键名不用记、合法取值点选即得；field 行
  FieldSelect（字段候选+类型置顶）既有不受影响；未登记键维持自由表加键零丢失，
  未登记聚合类型零 schema 裸表（现状不变），body 直通零 AST 改动
- 测试基建解堵：src 下并行迁移的整树 .js 快照在 vitest 解析里遮蔽 .ts 正源
  （queryAstOps 新导出在 vitest 读成冻结快照实锤）——vitest.config 补
  `resolve.extensions` .ts 优先（与 d469e2c 的 vite.config 修复同语义另一半），
  tracked .ts 恒为正源

### 新增（1019 批：terms lookup 远程词项一等编辑位）

- `terms` 的远程词项形态（值对象 `{index, id, path}`）从递归键值表升为**三具名输入**：
  「远程词项 —— 从 [索引名] 索引的文档 [文档 _id] 取 [字段路径] 字段的值集合」的
  语义提示句内嵌输入位（读句子即懂语义，不用查文档）；空串删键（半成品中间态）、
  空值对象直接给输入位
- 分派边界：普通数组 terms 维持既有 chips 编辑；未知键/非字符串值退化通用键值表保真
  （零丢失契约不变）；至此 terms 的数组/lookup 两形态均为专用编辑

### 新增（1018 批：more_like_this 的 like 混合形态一等编辑位）

- `more_like_this` 的 like 从通用文本输入升为**按形态分派的专用编辑**——对象（文档引用
  `{_index,_id}` / 内联 `{doc:{…}}`）= JSON 文档编辑区；数组（串+文档混合）= chips 列表
  （串项显示文本、文档项显示摘要如 `demo-logs/1`，点击选中展开该位 JSON 编辑）+ 回车
  追加文本项 + 逐项可删；字符串 like 维持既有输入。此前对象/数组 like 直落 String()
  显示成 `[object Object]` 不可编辑——本批起三种形态全部可编辑，fields 列表输入不受影响
- JSON 编辑语义与全站 JSON 控件同款三件套（本批抽 `useJsonDraft` 组合式统一：
  percolate document 随迁共用）；非法/非对象标红不写树、外部 DSL 变更同比较回流

### 新增（1017 批：percolate document 一等 JSON 编辑位）

- `percolate` 反查文档的 `document` 对象从递归键值表升为 **JSON 文档编辑位**（多行等宽
  文本域）：整份文档粘贴/编辑即时解析写回——反查「这份文档会命中哪些已存查询」的核心
  输入从逐键点表变成自然的 JSON 编辑体验
- 交互语言与既有 JSON 控件（检索参数/knn 向量）同款三件套：非法 JSON 标红不写树
  （半截输入容忍，树保持上次合法值）、非对象（串/数组）同样标红（document 必须对象）、
  外部 DSL 变更经序列化同比较守卫回流文本（不打断输入）；field 在行头字段选择器、
  name/preference 等参数走既有「更多参数」

### 新增（1016 批：pinned 置顶 ids chips 编辑位）

（批号勘误：初记 1015，与 d0367b1（先占）撞号，按先占方保持惯例改记 1016。）

- `pinned` 置顶优选的 `ids` 数组从参数表原样 JSON 升为 **chip 标签编辑位**（terms/ids 值
  chips 同款交互）：回车/逗号提交、粘贴含逗号按项拆分、IME 拼音态 Enter 守卫、空输入
  退格删末项、chip 一键删——置顶文档 id 的增删从手改 JSON 数组变成点选操作
- 分账守卫：ids 由 chips 权威编辑（参数表视图剥离防双编辑位冲突，表内改出 ids 路由回
  params 不丢）；`docs` 文档形态与 ids 非数组不走 chips 位（params 表保真）；AST 零改动
  直通，organic 子查询树编辑不受影响

### 新增（1012 批：geo_distance / geo_bounding_box 专用坐标编辑位）

- 地理距离与地理矩形两算子从通用键值表升为**专用坐标编辑位**：geo_distance =
  distance 输入（带常用单位 datalist 提示）+ 圆心 lat/lon 双数值输入；
  geo_bounding_box 两形态——corners（top_left/bottom_right 各 lat/lon 四输入，分组
  标签引导）与 edges 平铺四数值（top/left/right/bottom）；空值直接给输入位（不再
  需要先点 chips 加键），更多参数（distance_type/validation_method/boost…）折叠
  schema 表
- 编辑语义与 range 四输入同语言：空串删键（半成品中间态）、非数值不写、lat/lon
  越界（>90/>180）黄点轻警示（不拦截，title 说明 ES 将按 validation_method 处置）；
  字段选择器收窄 geo_point 候选既有（STRICT_TYPE_OPS）
- 保真退化契约：串坐标（"40,-70"）/geohash/数组坐标等合法 ES 形态不进编辑位
  （标量输入/通用键值表原样保真编辑）；混合形态（corners+edges 并存）整体退化；
  corpus 补 bbox edges 往返案例与串坐标 raw 退化断言

### 新增（1011 批：intervals 间隔规则专用递归编辑位）

- `intervals` 查询的规则体从通用键值表升为**一等递归编辑器**：规则类型下拉（match/prefix/
  wildcard/fuzzy/all_of/any_of 六类）+ 主值输入 + `_name` 命名 + 参数 schema 表
  （max_gaps/ordered/analyzer/fuzziness/use_field…）——all_of/any_of 的 `intervals`
  子规则行递归渲染可增删，规则级 `filter` 给八关系槽（六位置关系 + before/after，
  槽内子规则再递归），`script` 等其余 filter 键走小键值表；此前这类复杂规则只能在
  递归键值表里逐层手改 JSON 键值
- 零丢失退化契约：畸形/未知形态（多类型键、未知类型键等）整体退回通用键值表；
  容器内子规则或 filter 槽值畸形 → 自定义行原样保真（嵌套深处不牵连整树退化）；
  参数表里加出 filter/intervals 专用键会路由回流专用控件而非静默丢弃
- 修正通用路径骨架键名：`allOf`/`anyOf` 驼峰写法并非 ES 键（ES 是 `all_of`/`any_of`），
  chips 快捷添加不再引导产出 ES 必拒的 DSL；语料新增递归容器与位置过滤往返案例

### 新增（1010 批：评分函数 filter 一等查询树 + 衰减函数合法形态 + span_last 撤册）

- function_score 评分函数面板两处升级：每个函数的 `filter` 从键值表升为**完整查询树**
  （MiniTreeEditor，与 post_filter/rescore/retriever 同一编辑语言——布尔组/嵌套等复杂
  过滤条件从此树编辑，左右双向映射覆盖到评分函数内部）；filter 缺席态展开只读展示
  match_all 骨架不写回（不污染 DSL 文本），已有 filter 可一键移除
- 衰减函数（gauss/linear/exp）形态修正：ES 合法形态是**字段作键**
  （`{gauss:{字段:{origin,scale,…}}}`），换类型骨架与快径编辑位按该形态给值——
  此前默认体是 `field` 属性写法，产出的 DSL ES 必拒；快径编辑位 = 字段选择 +
  origin/scale/offset/decay + multi_value_mode 下拉，多字段体自动退化递归键值表零丢失
- span_last 撤册：ES 无此算子（官方文档 404），「+ 高级」菜单不再提供 ES 必拒的选项；
  存量 DSL 中的 span_last 走未知算子 raw 退化（GenericNode 递归表可编辑，往返仍一致）

### 新增（1008 批：DSL 光标 → 条件行反向联动，定位闭环）

- 右侧 DSL 编辑器**光标移动**时，左侧条件树对应行同步滚动+脉冲高亮——与语句条
  正向定位（点片段 → 编辑器滚动）构成完整双向闭环；光标落在节点间隙（逗号/键名
  等不属于任何条件的位置）时静默不打扰，DSL 冻结态跳过
- 反查内核（`nodeAtOffset`）：包含偏移的最内层节点命中（嵌套时叶子优先于父组），
  span 集按树身份 WeakMap 缓存——光标高频移动零重复序列化；反向入口不回弹
  正向事件、不抢编辑器焦点（无反馈环）；折叠中的目标行自动展开后定位

### 新增（1007 批：语句条片段联动 DSL 编辑器定位）

- 点语句摘要条片段的「行内定位」升级为**双链联动**：条件树行脉冲之外，右侧 DSL
  编辑器同步滚动到对应节点文本、置于视口中心并短闪高亮（1.8s 品牌色淡出，
  reduced-motion 静态底色档）——左右两栏的对应关系从「树↔树」扩展到「树↔DSL 文本」
- 定位内核（`queryLocate`）纯函数化：按序列化书写序先序走查询树，在紧凑文本里用
  前向游标逐节点定字符 span（同形重复条件按文档序分位、父子嵌套内搜索），
  再把紧凑偏移映射到美化文本行列（字符串字面量内的空格/转义逐字比对不漂移）；
  DSL 冻结态（手改未解析）自动跳过定位防指错

### 新增（1006 批：terms/ids 值 chip 视觉化）

> 撞号勘误：commit 683a641 的 message 误标 batch 1005（与 95977c7 连接凭据加密批同号，
> 先占方保持 1005，本批顺延记 1006）。

- 多值精确（terms）与文档 ID（ids）的数组值从「逗号分隔文本框」升级为 **chip 标签编辑**：
  值即标签逐个可删（×）、输入框回车/中英文逗号即刻提交、粘贴含逗号自动拆项、
  空输入退格删末项、IME 组合态 Enter 守卫——半截值不写树（提交才整项入账）
- 值候选 datalist（keyword 字段 terms-agg top20 + 历史值双源）原样保留；非数组形态
  （如 terms-lookup 对象）不走 chip 分支=原输入路径不变；placeholder 随 chip 形态
  换为「输入值后回车或逗号添加」（旧逗号话术防回潮）

### 新增（1004 批：字段候选虚拟列表——超大索引全量可达）

- 字段选择器弹层从「最多渲染 30 个候选」硬顶改为**可视区窗口化渲染**：超大索引
  （几千字段）的全部匹配都可滚动浏览，DOM 只渲染可视窗口（统一行高 + 上下垫片 +
  滚动方向缓冲），页脚计数从「N / M 个匹配，仅显示前 30 个」改为真实的「N 个匹配」
- rank 排序（精确>前缀>包含）/ 类型分组组头 / 近似纠错徽标 / mark 高亮 / 键盘
  ↑↓/Home/End 导航 / IME 守卫 / per-index 最近使用全部语义不变；光标移动时窗口
  跟随（End 直达末项并选中可用）；窗口化下补全列表盒无障碍语义
  （`aria-setsize`/`aria-posinset` 标注全集与真实序）；小列表窗口全覆盖 = DOM
  与旧全量渲染一致

### 新增（1003 批：撤销流扩全树域——extras 编辑可撤销）

> 撞号勘误：commit cbc543a 的 message 误标 batch 1002（与 ebbfc1a 补盲批同号，
> 先占方保持 1002，本批顺延记 1003）。

- 撤销/重做栈快照从「条件树 root」升级为「整树」：排序 / 查询参数 / 检索器 / 重打分
  等检索参数面板的全部编辑经条件树面板的历史栈合流，与条件树编辑共用同一条
  Ctrl+Z 流（跨域逐级回退不串域）；旧实现 extras 编辑不仅不进栈，还会被来源甄别
  当成外部换树**清空全部撤销历史**——任何一次参数编辑都会抹掉整条撤销链
- 无根树（排序/参数-only 现场）编辑后撤销入口随历史出现（与头行互斥的窄条，
  只含 undo/redo——整排条件树控件对无根现场是噪声），撤销后回到参数编辑前状态；
  外部 DSL 手改仍清栈防跨源串撤销（993 甄别语义原样保留），栈深 50 与首建根
  不入栈语义不变

### 新增（1000 批：检索器 retriever 一等化——8.14+ 检索面全结构化）

- 顶层 `retriever` 键（8.14+ `query` 的继任检索面）六变体全结构化递归编辑：
  **bm25**（内嵌完整查询树，走 post_filter 同款 MiniTreeEditor）/ **knn**（平面字段+向量，
  字段候选收窄 dense_vector）/ **rrf**（多路子检索器融合，rank_constant 等）/ **linear**
  （线性加权，每路行内 weight 编辑，子项伴随键往返保真）/ **text_similarity_reranker**
  （重排源子检索器+字段）/ **rule**（规则路由+未命中回退子检索器）；未注册变体与畸形体
  整键落「其他顶层键」零丢失
- 深嵌套组合全支持（rrf→linear→重排→bm25 任意深度递归），十六组合法语料 + 七组畸形
  往返无损门禁；切换变体换新节点（六变体载荷语义互斥，保留旧载荷只会造出脏 DSL）
- 交互质感：RootExtrasPane 新增「检索器」chip（解析含 retriever 自动展开）；knn 向量
  JSON 框非法只标红不写树、清空移除键；语句摘要条尾部新增「检索器 retriever」元信息
- 至此查询构建树对 ES 检索面的覆盖收口：query 子句层（65 算子）+ 查询体参数（18 键）+
  顶层检索键（sort/_source/highlight/aggs/post_filter/collapse/knn/suggest/rescore/
  script_fields/runtime_mappings/retriever）全结构化，双向映射无断层

### 新增（998 批：全量 DSL 双向映射与语句阅读层）

- 双向映射保真补三处：field 形态 inner 对象写法记忆（`{match:{f:{query:'x'}}}` 不再被树编辑改写成
  `{match:{f:'x'}}`）；sort 多键项整项保真（旧实现只取首键、其余键静默丢弃）；knn / rescore 数组形态
  （多向量混合检索、多段重打分）逐项结构化，单元素与空数组也保形
- 查询体参数一等分账：`min_score` / `track_total_hits` / `search_after` / `fields` / `docvalue_fields` /
  `stored_fields` / `indices_boost` / `slice` / `pit` / `explain` / `version` / `seq_no_primary_term` /
  `track_scores` / `timeout` / `allow_partial_search_results` / `preference` / `stats` / `profile` 共 18 键
  不再落「其他顶层键」裸键值表，改由 schema 驱动表单编辑（布尔/数字/字符串/JSON 四档控件，
  JSON 非法只标红不写树，避免半截 JSON 打断查询）
- 算子补齐 `rank_features`（多特征打分）与 `flattened` 字段推荐档；算子按语义族着色
  （全文/精确/范围/空间/向量/跨度/脚本），下拉外壳升级为胶囊但保留原生 select 的键盘与无障碍语义
- 语句阅读层：条件树顶部新增「一句话摘要」——must/filter→且、should→或、must_not→非，
  复合子组按优先级自动加括号；点任一片段定位到对应条件行并打高亮脉冲；检索级元信息
  （取几条 / 排序 / 聚合数 / 游标 / PIT / 最低分）单列一行
- 智能字段匹配：高特异算子（geo / 向量 / 特征 / 形状 / 间隔）字段候选按 mapping 类型收窄；
  其余算子维持「只置顶不过滤」（term 打 text、range 打 keyword 仍有合法语义）
- 条件行视觉重构：行尾动作收成右对齐图标组（空间不足整组折行，不再散落行首）；
  参与开关静息中性色、已停用转绿色常亮；range 四操作符输入收窄，行内控件密度重排
- 跨度族收口与规则查询：补 `span_last`（尾位锚定）、`span_gap`（span_near 子句内的间隙占位，
  width 主值）、`rule`（8.14+ 检索规则，ruleset_id 主值、match_criteria 走参数表）三员——
  跨度族全谱齐员，全 DSL 查询算子面就此收口（未注册算子仍走原样保真兜底）
- 具名参数大扩员（高频调优参数不再埋进「更多参数」自由表）：match 系 / multi_match /
  query_string / simple_query_string 补 minimum_should_match、analyzer、tie_breaker、lenient、
  flags、phrase_slop、analyze_wildcard 等；range 补 relation（WITHIN/INTERSECTS/CONTAINS 枚举）、
  time_zone、format；regexp 补 flags / max_determinized_states / case_insensitive；fuzzy 补
  prefix_length / max_expansions / transpositions；geo_distance / geo_bounding_box 补
  validation_method；prefix 补 case_insensitive；terms / exists / knn / text_expansion /
  weighted_tokens / more_like_this / combined_fields 各补常用档
- wrap 容器具名参数表（WRAP_PARAMS）：nested / has_child / has_parent 的 score_mode（含
  min_children / max_children / ignore_unmapped）、function_score 的 boost_mode / score_mode /
  min_score / max_boost、constant_score 的 boost、span_first / span_last 的 end——
  枚举档参数从自由文本升级为官方取值下拉
- 门禁：新增 `queryAstCorpus.spec`（ES 8.x 全量语料往返无损 + 结构化覆盖普查 + 数组形态边界）、
  `querySentence998.spec`（摘要文法 25 例）、`builder998.spec`（组件契约 + 参数面板/数组形态/
  语义族胶囊/语句条/包装参数下拉 15 例）

### 新增（996 批：脚本字段与运行时字段一等化轮）

- `script_fields`（脚本字段）与 `runtime_mappings`（运行时字段）一等化：命名项行列表编辑
  （字段名 + 脚本体/映射体递归表），新建项给可用默认体（script source / type:keyword）；
  非常规形态（项体非对象）落「其他顶层键」零丢失
### 新增（993 批：条件树撤销/重做与菜单键盘导航轮）

- 条件树撤销/重做：面板内全部写操作可撤销（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 或面板头按钮），
  栈深 50 步；直接手改右侧 DSL 后历史栈自动清空（防撤销覆盖手改内容）
- 「+ 高级」算子菜单补 ↑↓ 键盘导航（跨分组游标 + 高亮跟随 + 滚动跟随），Enter 插入游标项，
  未导航时 Enter 仍插入首个命中（既有语义不变）
### 新增（991 批：构建树重打分与行级拖拽轮）

- `rescore`（重打分）一等化：window_size + 重打分查询直接以条件树编辑（与后置过滤同款
  全通道），query_weight 等参数走递归表；数组多段等非常规形态落「其他顶层键」零丢失
- 条件拖拽行级落点：拖拽悬停到某条件行后亮插入线，松手即插到该行之后（此前只能追加到
  分区尾部）；分区尾部兜底语义不变
- 对象值算子常用键骨架扩员：地理网格/形状过滤/文本扩展/加权词元（8.x 新算子族）
### 新增（989 批：构建树评分函数与搜索建议编辑轮）

- `function_score` 评分函数结构化编辑：函数行列表（类型下拉七种/weight/主参数/filter
  递归子表/增删），自定义形态类型位锁定防丢数据；`functions` 数组仍原样往返零降级
- `suggest`（搜索建议）一等化：term/phrase/completion 建议项行级编辑（名称/text/建议器
  体/全局 text），畸形形态整键落「其他顶层键」零丢失
- 条件过滤修复：命中条件在折叠的嵌套组内时此前完全不可见（折叠内容不渲染），过滤框旁
  现给出「折叠内 N」提示并可一键展开全部定位
### 新增（987 批：查询构建器 DSL 全量覆盖轮）

- 条件树算子补齐 ES 8.x 新语法九员：整词前缀（`match_int_prefix`）、地理网格（`geo_grid`）、
  形状过滤（`shape`）、稀疏向量（`sparse_vector`）、文本扩展（`text_expansion`）、加权词元
  （`weighted_tokens`）、语义查询（`semantic`）、向量近邻（`knn`）、字段掩码跨度
  （`field_masking_span`），全部富表单编辑且序列化往返无损；「+ 高级」菜单新增「向量与语义」
  分组，`dense_vector`/`sparse_vector` 字段自动推荐对应算子
- 顶层检索键一等化：`post_filter`（后置过滤）直接以条件树编辑（增删/拖拽/复制/启停全通道），
  `collapse`（字段折叠）与 `knn`（向量检索）升级为独立结构化分区（向量走 JSON 编辑、非法
  中间态标黄不落树），不再混入「其他顶层键」键值表；畸形形态仍原样保留零丢失
- 交互修复：折叠后的嵌套组组头常显（此前 hover 才浮现，触屏无法再展开）；字段选择器对不在
  当前索引 mapping 的手输字段给黄点提示（无 mapping 部署不受影响）；DSL 手改导致条件树冻结
  期间补键盘惰性（此前鼠标已挡但键盘仍可触发写树覆盖手改）

### 安全（988 批：并发审计收口）

- `_bulk` update 动作的伴生文档行 `script` 与 `_update` 通道同权过脚本守卫：此前动作行
  `_index` 合法即可借 `ctx._index='es_console_user'` 脚本把文档改写到控制面索引
  （`_update`/`_update_by_query` 均已堵，唯 bulk 漏网）；已存脚本 `id`、params 携带
  `_index`、非 painless 语言同样拒绝，普通字段累加脚本不受影响
- REST 直连页补非 ADMIN 数据面预暴露（与 DevTools 双门同口径、后端同执行内核）：越权形态
  在客户端即禁用+提示，不再「RestView 亮钮、发出才 403」的双口径分裂
- DevTools 前端 `/_pit`、`/_search/scroll` 白名单按方法收口对齐后端 987 契约：POST 开
  全集群 PIT/续读 scroll 前端即拒（仅 DELETE 清理资源放行），限定索引的 `POST /logs/_pit`
  照旧
- 已绑定后 `setup/apply|test` 与 `setup/rebind` 同档 ADMIN（控制面归属/凭据流转；未绑定
  bootstrap 窗口在 SETUP 短路放行，不受影响），不再依赖控制器 `alreadyBound` 单层兜底
- 只读 POST 清单前后端同步段边界化（`isReadonlyPost`/`matchReadonlyKeyword` 同源）：
  裸 `contains` 会把未来落在 `/cluster/counter-reset` 等前缀内的新写端点静默归为
  VIEWER 只读档
- 登录失败审计的用户名钳制 128 字符（攻击者可控串防撑爆审计索引/污染合规流水）；登录
  成功审计 role 字段落位修正（此前误占 displayName 位，人名列显示 "ADMIN"）
- 前端体验：收藏夹空态导航按钮接 `pageAllowed` 同源门（无权限禁用+提示，不再裸跳
  /forbidden）；任务取消守卫提示文案档位修正（REBUILD_OP/CLUSTER_OP 或 ADMIN，
  此前误写 OPERATOR 及以上）

### 安全（990 批：token 吊销面与受信代理清单）

- 内置账号 token 纪元回查（吊销面）：用户档案新增 `epoch` 纪元字段，任何账号变更
  （改密/改角色/重建）递增纪元，`verifyToken` 对非兜底 token 回查——不符或账号已删
  即立即作废，不再等到 TTL 过期（默认 12h）；角色以最新档案为准（降权后旧 token
  即使绕过纪元也不沿用签发时的旧角色）。改密会吊销自己的全部会话（安全惯例）；
  升级部署后未变更账号的存量五段 token 会话不中断（隐含纪元 0），首次变更后一并吊销
- header 委托模式新增 `trusted-proxies` 受信代理清单（精确 IP / IPv4 CIDR）：
  配置后身份头仅在 remoteAddr 命中清单时采信，把「私网整体信任」收窄到具体网关
  地址（防私网 LB 后的任意客户端伪造身份/角色头）；清单留空维持既有行为，升级零破坏

### 安全（992 批：读侧所见即所得与错误拓扑脱敏）

- DevTools/REST 前端读侧镜像后端系统读拒绝清单（`RAW_SYSTEM_READ_DENY` 同源）：
  非 ADMIN 的系统管理读（`_security`/`_nodes`/`_tasks`/`_snapshot`/`_cat/nodes` 等
  40+ 前缀）在客户端即禁用并提示，不再「亮钮发送后端才 403」；索引级读不受限，
  `_security/_authenticate` 自省特例与索引级 mutating GET（`GET /logs/_refresh` 等）
  镜像同权；`OPTIONS` 等 UI 外方法按后端方法白名单拒绝
- 前端路径判定规范化对齐后端 `canonicalRawPath`：尾斜杠/双斜杠折叠、URL 百分号
  编码解码后再走白名单（`/_%73ql/close` 与 `/_sql/close` 同判）、`.` 段折叠；非法
  编码序列保持字面（与后端 fail-closed 方向一致）
- 错误体内网拓扑脱敏：RHLC message 内嵌的完整 URL（`http://10.1.2.3:9200`）与
  ES 节点坐标（`[10.8.0.5:9300]`）不再随响应外发（VIEWER 级只读端点错误体同样
  可达）；root_cause 语义与裸地址诊断粒度保留（前端友好文案链路与连接异常定位
  不受影响）；控制集群不可达与跨集群连接失败的错误拼接点同款收口

### 安全（994 批：扫盲轮收口——长连接/审计自身/部署形态）

- 审计归属防伪造：迁移/托管重建族（xmigrate/adhoc-rebuild）的 `X-Es-Target`
  归属头不经过目标拦截器校验，未知 id 此前被直接记入连接账（connId/实名）——
  现在仅在连接档案真实存在时落账，伪造头不再能把写操作记到他人连接名下误导法证
- `desired-state` 族端点尊重 `web-enabled=false`：该开关承诺关闭内置运维端点，
  此前这三个无鉴权元数据端点（受管索引/字段/mapping 全量）在关闭后残挂
- standalone 默认只听回环（`server.address: 127.0.0.1`）：绑定控制集群到建立
  首个真实账号之间存在兜底 ADMIN 窗口期，全网卡监听把该窗口暴露给内网；对外
  服务显式覆盖地址即可
- Top 业务索引榜单不收录控制面索引：监控索引自写自读会把自身刷上榜，且控制面
  索引名不应随 top-indexes 下发给 overview/live 页读者（与 clusterIndices/
  ring-usage 同口径）
- 监控断链根因落档前拓扑脱敏（992 口径的文档通道补漏）：连接失败消息内嵌的
  URL/节点坐标不再随 monitor-history/monitor-metrics 长留存外发；同时修正坐标
  脱敏正则漏掉的 Apache `[host/ip:port]` 形态
- 前端登出/token 吊销后全局双轮询器（实时监控/作业跟踪）逐拍短路：身份已知且
  无会话时不再每 5~20 秒发注定 401 的请求，重登后自动续采
- header 委托模式空受信清单启动 WARN（默认私网整体信任的收窄提醒）；示例宿主
  冒烟测试的 sqlite 配置键修正（`sqlite.path`→`sqlite-path`，错键是 no-op 会被照抄）

## [1.0.36]

### 安全

- 索引表达式拒绝 date-math 包装（`<es_console_user>`/`<es_consol?_*>`）：精确名、通配模式、
  raw 路径、SQL/alias/reindex/模板/快照 body 全部覆盖；通配模式先经 `_cat/indices` 解析真实
  目标并拒绝后缀控制索引（`*_es_rebuild_lock`/`*_es_xmigrate_job`），只读搜索与 PIT 不再能扫出控制面
- 搜索 DSL 二级数据源结构守卫：`terms/terms_set` lookup、`percolate`、`indexed_shape`、
  `more_like_this`、内嵌文档 `_index` 均过统一索引表达式校验；搜索模板必须内联 source
  （按已存 id 执行直接拒绝），reindex 预估/`source.query` 同样受控
- 非 ADMIN raw 的 `_cat/indices|aliases|shards` 只允许 `format=json` 且必须保留 index 列，
  返回前逐行剔除控制面索引；`_stats`/`_cat/count|segments|recovery|allocation`、
  `_search_shards`/`_segments`/`_recovery`/`_shard_stores`/`_resolve`/`_alias` 与
  索引级 `_cluster/health` 一律拒绝；健康报告、分片存储、分配诊断响应同步脱敏
- 快照创建/恢复/删除只接受精确 repo/snapshot 名，`name=*` 不再清空整个仓库；别名 add-only
  叠加 env 页模板收缩，静态 aliases 键在环境未开放该页时不能执行 remove/remove_index
- 本地账号管理 `auth/users` 改为宿主绑定：远端连接的 security 授权不能读写宿主账号库；
  审计流水仍按目标连接行级过滤。`/xmigrate/progress` 归 xmigrate 专属读取，
  宿主锁健康只对 overview/diag/health-report 开放
- DevTools 预填自动执行只允许 GET/HEAD 与搜索类只读 POST，且必须仍是当初预填的那个 tab；
  写预填一律只回填不自动发送。请求原文记录对 password/token/secret 等字段脱敏，
  退出登录、用户切换（含 401→新登录）立即清空
- 前端宿主页判定与后端对齐：`system`/`config-drift` 按宿主授权，`conn:{id}:w:rest` 可进入
  DevTools，静态 rest 不再向低角色暴露死入口；概览/诊断/后台轮询按各自端点页授权跳过，
  权限降档时安全中心立即清空已加载的全量审计行
- 无权限用户没有可用写通道：新增回归测试覆盖 date-math/通配/模板/reindex/raw cat/快照/
  别名/宿主页/DevTools 预填，前端 980 规格锁定 host-bound 与 REST→DevTools 可见性；
  后端全量 1235 项、前端全量套件均通过

- 非 ADMIN raw 进一步收敛到文档/检索/批量面：别名切换、reindex、快照恢复、模板写入一律改走
  aliases/reindex-advanced/snapshots/templates 专属页写键；GET 形态的 refresh/flush/
  forcemerge/close 与 `_cluster/settings` 读取同样拒绝，rest/devtools 写键不再跨页扩权
- 删除索引精确名守卫拒绝逗号列表与通配（堵住 `index=logs,es_console_user` 夹带控制索引）、
  拒绝 `#`/`%` 等 URL 特殊字符；模板名/SLM 策略/任务 ID 拼路径前统一白名单校验，rollover 别名
  服务端编码，settings 含默认值读取拒绝双重编码
- reindex 禁止脚本（`ctx._index` 可字符串拼接改写目标写入控制面）；快照恢复
  `rename_replacement` 的 `$1` 按真实源索引展开后逐个判定，通配源禁止占位符重命名
- 快照仓库凭据递归脱敏：Azure `key`、GCS `service_account` 与嵌套 map/list 中的密钥不再下发给
  非 ADMIN
- 权限面板不泄露未授权连接名/环境；混合静态页+连接键的连接可见性前后端同口径；零页面授权
  仍可改密/退出；静态 `adhoc-rebuild` 可走向导配置校验；`workspace` 页可读任务/远程集群卡片；
  静态与内置 OPERATOR 的共享写能力如实回显；连接目录、权限面板与监控接口共用
  `ConsoleConnVisibility` 单一可见性判定
- 监控读侧后端行级隔离：曲线/告警/历史按 `connId/connName` 过滤，Top 索引与节点聚合在非全量
  权限下要求显式已授权集群，前端过滤只作第二层
- 数据面目标绑定点补连接可见性硬门：`X-Es-Target` 与省略目标头回落宿主都必须同时通过
  minRole 与 `conn:{id}:` 页面键；宿主专属端点（provider 重建/系统索引/`/overview` 等）一律按
  `host` 授权，持远端连接写键不能再改宿主；`/progress` 改为跟随目标集群查任务进度
- SQL 守卫改为词法扫描：`FROM"e*"`、引号逗号列表、引号别名、块/行注释、反引号、未闭合注释
  与非法 JSON 全部覆盖；文档/脚本路径 ID 统一拒绝 `..`/斜杠并编码，低层路径守卫逐段拒绝穿越
- 破坏性通配（`_delete_by_query`/`_update_by_query`）与快照通配恢复先解析真实索引名再逐个判定，
  `logs-2026*` 不再命中 `*_es_rebuild_lock`/后缀控制索引；Painless 执行从只读 POST 升为写档，
  `context_setup.index` 同样过控制面守卫
- 权限面板目标不可见时读写/共享写/raw/devtools 能力一律回 false；JDBC 连接档案 `get()` 回填
  `env`（环境页模板不再被静默跳过）；目录 200 条截断或读取失败时未知实名不再回落宿主
- 连接目录 ADMIN/无鉴权分支恢复完整列表（可见性快照不再清空管理员数据）；无鉴权部署不再按
  minRole 过滤连接/探活；监控聚合“全量可见”必须有可读且完整的目录证明，目录失败时节点/Top
  聚合保持 fail-closed
- 任务进度端点 `/progress` 跟随目标集群并登记为跨页共享读（DBQ/UBQ/reindex/DSL 轮询不再 403）
- SQL 元数据枚举（SHOW/DESCRIBE）拒绝；通配表与快照创建同样解析真实索引名后再判定；
  `_mget` 路径形式允许省略文档 `_index`（根路径仍拒绝全量）
- 共享读片段匹配修正：`index-settings-defaults` 归 mapping 页、`/es/index/keys` 不再误吞
  config-drift；mapping-detail 覆盖 search/browser/doc-diff；宿主侧只读辅助面（keys/
  desired-state/mapping-reconcile）按当前目标页面授权，不再把已授权连接用户挡在页面外
- raw 管理域入口统一走身份感知门（探测中/失败关闭）；Painless 试跑补写档 UI 门；
  DevTools 挂起预填在页面失活时丢弃、首探 401 后等待宿主令牌重探；安全中心用户列表在
  探测中/失败时不再读取
- 全量审计归 security 页（rank3 + 页面读键）：`security` 页仅授权单连接时行级按
  `ConsoleConnVisibility` 过滤，连接/宿主外事件不下发；audit-facets 跨连接聚合对
  非全局授权回空建议；连接目录、集群索引/别名/分片列表对非 ADMIN 隐藏控制面索引名
- config-validator 页借 alias-actions 只允许单条 `add{index,alias}`：remove/remove_index、
  `is_write_index`/`indices`/routing 等扩权参数一律拒绝；aliases 页写权不受限
- PIT 搜索必须携带非空 `pit.id` 且不得携带 `index/indices`（裸 body 会退化为全集群
  `_search` 读出账号/连接凭据/审计索引）；PIT open 通配解析真实索引名后逐个过控制面守卫；
  raw 通配 `_delete_by_query/_update_by_query` 同样解析真实索引名（堵住 `logs-*` 命中
  `*_es_rebuild_lock`/`*_es_xmigrate_job` 后缀控制索引）
- 混合授权（conn 键 + 静态页键）写门回落静态页语义：静态页可见 + 角色档即放行，
  不再因任一 conn 读键把有权限用户整体拦死；未登记写端点仅在纯 conn 模型默认拒绝
- 前端 API 层写门：`request()` 在 fetch 前按身份×目标×端点归属页裁决，未授权写请求
  零发出（CLIENT_WRITE_DENIED）；命令面板导航全部走页面门，DevTools 重试/空态快捷入口
  按写权隐藏，杜绝“看得见点得着但必 403”的死入口

### 修复

- 监控曲线/告警/历史/Top 索引按连接授权过滤，Top 索引下推改为集群实名参数；集群切换器宿主
  项在纯连接模型下隐藏；DSL 查询页 KeepAlive 离页摘除 Ctrl+Enter/Ctrl+S 全局键
- 组件模板不再被 `index_patterns` 必填误伤；监控聚合行不再在前端二次按 `connId` 过滤
  （连接隔离由后端行级完成，避免连接模型大屏空白）；含默认值 settings 保持 `{status,body}` 契约
- 前端身份探测启动后 fail-closed：`me` 未到达/探测失败时写门不把 `me=null` 当无鉴权，
  瞬时失败指数退避重探；仅明确 404 无鉴权部署全放行。DevTools 预填 `run:true` 挂起至身份
  确认后只执行一次，`GuardedActionButton` 权限门缺省改为 false
- 静态页模型共享写映射优先于页前缀（`indices` 建索引、`ilm` 移步、`config-validator` 写别名
  不再被另一页前缀 403）；无页前缀读端点（settings/aliases/scripts/mapping/analysis/节点）
  按真实调用页收口；HEAD 按只读判定；角色门拒绝同样落审计
- Overview/Diag 在身份确认且无 host 授权时跳过恒定宿主的概览/健康请求，纯连接用户不再看到
  必 403 的错误条；权限面板目标不可见时不再虚报可读

## [1.0.35]

### 安全

- DevTools/REST 非 ADMIN 透传收敛为数据面白名单：先规范化路径再默认拒绝集群/系统管理写
  （`_cluster`/`_security`/`_snapshot`/`_scripts`/`_ingest`/`_ilm`/`_slm` 等），堵住尾斜杠、
  `%XX` 编码、矩阵参数、纯排除索引、跨集群 `remote:index`、带索引前缀的
  `_msearch/_mget/_bulk`、`_xpack/sql`、remote reindex 与快照 `feature_states` 旁路；
  快照仓库云凭据对非 ADMIN 脱敏
- 控制面读取补守卫：`search-raw`/`query`/`profile`/`count`/`mapping`/`analysis`/`settings`/
  `lucene`/`schema`/`ilm-explain`/`reload`/PIT/bulk/SQL 均不得触达控制索引与校验临时索引；
  空索引参数 fail-closed
- 页面授权补齐共享读写归属页（`create-index`、`inspect`、`ilm/policies`、`templates`、
  `shards`、`task-detail`、`sql`、`health-report`、`live ring-usage`）；连接模型下未登记
  页面归属的写端点默认拒绝；静态页白名单写入口同时校验页面与角色；ADMIN 与持精确页写键者
  保持通行
- 迁移发起/续跑/预检/目标索引必须同时持有源连接与宿主 `w:xmigrate`；`resolve-preview` 补源
  写门；续跑钉死作业源档案；连接目录与探活按连接授权过滤
- 权限面板拆分 REST 直连与 DevTools 执行档；前端路由大小写/尾斜杠归一；DevTools 预填在身份
  未确认时只填入不自动执行；IndexHub Ctrl+S 离页摘除；文档删除按 `delete-by-id` 端点独立门控
- 前后端权限矩阵/只读 POST 清单逐项对拍测试 + raw 系统边界测试：后续新增写端点漏登记页面
  归属会直接测试失败

## [1.0.34]

### 安全

- DevTools 改为独立执行端点 `/cluster/devtools/execute`：权限面板不再显示「无写操作」，
  可单独授予 `w:devtools`（兼容 `w:rest`），ADMIN 全局通行；未授权用户仍被页面门拦截
- 查询读权限按页面读键收口：`/cluster/query`、`search-dsl`、`search-raw`、`monitor-*`、
  `ring-usage`、`/cluster/tasks` 等无页面归属读端点按归属页裁决；空页面授权除身份/健康
  自举外一律拒绝，不能再借角色门直读业务数据
- 结构化 SQL 与控制面搜索加固：SQL 的 FROM/JOIN 通配/控制索引在发往 ES 前拦截；
  非 ADMIN 无索引 DSL 搜索必须显式指定索引，防止扫出控制面用户/连接文档
- 诊断页重试分片改走固定 `/cluster/reroute/retry-failed`，`w:diag` 不再能执行任意
  reroute commands；任意 reroute 仍归 cluster-settings 写键
- 迁移环境变量解析仅允许 `SOURCE_/ES_/MIGRATE_/QUOTEHUB_` 或 `es.rebuild.*` 源连接变量，
  敏感变量被误用作 username 时不再回显，堵住借 resolve-preview 读取任意应用配置
- 命令面板的设置下发/ILM 起停/分词重载动作补执行体权限门；共享写映射优先于单一页面前缀
  （ILM move、建索引带别名等不再误拦另一页写键）
- 委派非 ADMIN 的安全页显示只读（本地账号仅 ADMIN 可管理）；auth 关闭时不再注册权限
  查询控制器，避免误弹登录遮罩

## [1.0.33]

### 安全

- 开发者工具写发起链路收口：REST 直连/DevTools/Painless 的写操作在按钮、执行体
  与后端接口三层校验；DevTools 全局 Ctrl+Enter 随 KeepAlive 失活摘除，离页不再
  触发隐藏写请求；raw 透传非 ADMIN 版本补齐 reindex、快照恢复、别名、模板、SQL、
  无索引搜索/msearch/mget、unicode 转义与控制面索引守卫
- host/缺省目标与空页面授权不再回落全局角色门：连接模型写宿主必须持有目标连接
  写键；静态页白名单未授予归属页的共享写一律拒绝
- 路径与目标绑定加固：矩阵参数按归一化路径判定数据面；跨集群迁移请求绑定源连接，
  连接模型下拒绝手输源连接；控制集群重绑/连接档案等系统管理端点维持 ADMIN 专属
- 委派会话不得创建/修改/删除本地全局账号，堵死“security 写键创建本地账号再以
  全局角色登录”的越权链；安全中心读键可只读查看用户列表
- insight 护栏动作接入页面写键表，未登记动作在连接模型下拒绝；动作执行器仅在页面
  门实际启用时按连接写键放行，页面门关闭时仍按 rank3
- 权限面板补齐共享写页（ILM/tasks/index-settings/optimizer）、force-merge 与
  insight 动作写能力，宿主可正确下发 `w:` 键

### 修复

- 托管重建写键可直接执行向导内的配置校验；配置校验页同样接受 adhoc 写键
- 诊断页分片重试改走结构化 reroute，`w:diag` 或 rank3 即可执行，不再只能借
  ADMIN raw
- 迁移发起/预检/作业列表/中止显式携带源连接目标，源写键持有者不再被顶栏目标误拒

## [1.0.32]

### 安全

- 全站权限面系统加固：页面授权、连接授权与角色档在前后端逐端点对齐，未授权角色
  在索引/查询工作台、重建迁移、开发者工具、快照、安全中心等入口的按钮与执行体
  双重拦截（含键盘/深链等旁路通道），无权限者无法再触发写请求
- 跨集群迁移按源连接隔离作业：列表/进度/中止/恢复仅对作业所属源连接可见可操作，
  恢复时强制沿用原源连接档案；连接探测按档案 minRole 校验
- 重建/迁移作业列表与状态按目标集群隔离，跨连接不可见不可操作
- 控制面索引（`es_console_*`、校验/锁/作业后缀）在非 ADMIN 的 REST/SQL/reindex/
  快照恢复/模板写入通道统一拦截，防止越权改写控制面数据
- 用户管理防提权：非 ADMIN 不得授予或修改 ADMIN 角色、不得删除 ADMIN 用户
- 权限判定统一小写化与路径规范化（拒绝 `..`、`//`、反斜杠/NUL 旁路），共享写端点
  按归属页面写键裁决，移除"任意连接写键放行全部共享写端点"的过度授权
- ADMIN 保留全局通行：页面授权、连接可见性与各写入口不再误拦超级管理员

### 修复

- 静态页权限与连接模型混用时，静态页键仍受环境模板收缩、连接页键正常保留

## [1.0.31]

### 修复

- 实时大屏明细「⋯」浮层的阴影并入全局弹层阴影令牌：浅/深主题切换时阴影深浅随
  主题联动，与历史「⋯」浮层、导出菜单的弹层质感保持一致，不再使用固定深色阴影

## [1.0.30]

### 修复

- 拓扑页长主机名节点不再与角色标签文字重叠：名称超出卡片宽度时按预算截断
  （省略号收尾），悬浮节点名可看完整主机名；短名称与未分配卡片不受影响

## [1.0.29]

### 修复

- 全新独立部署实例的审计页恢复正常（SQLite 方言建表语句修正，首查不再整页报错）
- 跨集群迁移作业列表与集群索引清单按拍序丢弃过期响应：快速连点刷新、切换集群或
  深链双开时，迟到的旧响应不再覆盖新数据、误报错误或抢走定位高亮
- 概览、安全中心、迁移校验等页面的加载/检查动作拒收在途重入与双击重复触发

## [1.0.28]

### 新增

- 索引工作台 JSON/Tree 档补齐文档导航条（‹ ›/ _id 下拉/打开/编辑文档）——两个
  工作台四视图文档触达能力对齐；导航条置于内容上方，长结果列表不再把入口挤出可视区
- 渲染数据直达编辑：单击 Tree 文档行（或其 _id 行）/JSON 文档块/卡片即打开该文档，
  双击直达编辑器；表格行内新增编辑钮。导航条保留为遍历与按 _id 精确选择入口
- 索引工作台 JSON 视图与查询工作台同款逐文档块化，点击即可精确落在目标文档

### 修复

- Tree 档文档编辑保存不再被 Elasticsearch 元数据字段校验拒绝（行首 _id 不再混入
  文档体）
- 放大（全屏）态四视图保持同屏：索引工作台的 JSON/Tree/卡片视图体随表格插槽移动
- 空结果的导出如实报告而非静默失败；工作台入口按钮保持其位置

## [1.0.27]

### 新增

- Tree 档（节点结构视图）补齐文档导航条（‹ ›/ _id 下拉/打开文档）——
  与 JSON/卡片档同享文档触达（914 能力矩阵统一收口）

## [1.0.26]

### 新增

- 查询工作台 JSON 视图文档块点击：每个命中的 JSON 块可点击，点击即打开该
  文档抽屉（树视图预览 / Monaco 编辑 raw JSON / 保存）——四视图文档触达统一

## [1.0.25]

### 修复

- 查询工作台放大态切视图不再空白：JSON/Tree/卡片三档视图体移入放大容器
  （ResultTable 默认插槽）——放大（全屏）态下切换任意视图即所见即所得，
  不再出现「表格档放大正常、其余档全屏空白」的割裂

## [1.0.24]

### 新增

- JSON 视图文档块点击触达（能力矩阵贯通收口）：每个命中的 JSON 块可点击，
  点击即打开该文档的抽屉（树视图预览 / Monaco 编辑 raw JSON / 保存全量
  覆盖）——与表格、卡片同一 openDoc 链路；块级 hover 高亮辅助定位

## [1.0.23]

### 修复

- 实时 KPI 卡绘图域右移 36px 让出 Y 轴刻度列（刻度右对齐贴域，历史卡同语言），
  曲线/面积不再横穿刻度文字；悬浮命中（frac）改按绘图域取值，右移后零偏移；
  十字线/圆点/读数包进悬浮层与绘图域同域
- 节点对比末端采样点列右移 4px 至图区外，与曲线终点分离不再叠压

## [1.0.22]

### 修复

- PIT 开启（Point-in-Time）失败甄别：keepAlive 格式错误、索引不存在等请求级
  错误不再误报成「集群不支持 PIT」，直传错误面板可回看全文并重试；仅旧版本 ES
  无此端点或连接不可达时才维持「能力不可用」提示
- PIT 深分页排序指引可执行：部分 ES 版本对显式 _shard_doc 排序返回 400 时，
  原指引「清空 sort field 后重新拉取」实际无效（清空后仍回退同一排序形态、
  同样 400）；指引改为「在 sort field 选一个可排序字段（date/keyword 等）后
  重新拉取」，该路径已实测分页推进正常
- PIT 预览 CSV 导出收编全站单一出处：表头引号转义/BOM/换行统一，含引号列名
  不再产出破格文件；空值 ∅ 与对象 JSON 序列化语义不变

## [1.0.21]

### 修复

- 阈值标签防竖排遮挡：右缘「80%」阈值标签声明 nowrap 并加面板底色抠线，
  窄可用宽度下不再折行成竖条与阈值虚线交叠（全屏展开态实测场景）

## [1.0.20]

### 新增

- 图卡展开（放大）能力全站统一：历史趋势卡（37 张）、节点对比面板、Top 索引
  曲线全部获得与顶部 KPI 卡同款的全屏展开——历史卡卡头新增展开钮（hc-full
  fixed 覆盖），节点对比面板头部 seg 旁新增展开钮（ld-ncmp-full），Top 曲线
  工具行新增展开钮（ld-top-full 包层）；全部接入同一 expandedCard 状态机、
  body 遮罩与 Esc/再点还原链路

## [1.0.19]

### 新增

- 节点对比悬浮贴线圆点：滑动时每条可见序列在十字线 x 处的曲线上各钉一颗
  身份色圆点（lineYAtFrac 插值定位，与历史卡/顶部卡同一套语言）——滑动
  读数「点在曲线上」可见，不再只有光秃秃的十字线

### 变更

- 节点对比曲线丝滑三件：滑动平均窗口 25s→50s（悬崖磨成圆缓波峰）、曲线
  豁免过冲钳位（陡变段保持全张力圆弧不退化成直角，极值读数由图例峰值直读
  承担）、每序列末端常驻采样点（右缘一列色点，不悬停也看得到当前点）

## [1.0.18]

### 变更

- 节点对比卡 Heap 档改为 step-after 阶梯线（GC 锯齿这类 gauge 指标的专业形态：
  台阶=采样格点、悬崖=真实回收），5s 采样下原始折线的杂乱毛刺变成整齐的台阶
  节奏；CPU/磁盘/QPS/写入档保持平滑曲线；悬浮联动高亮面积与折线同走阶梯形态，
  贴合不穿帮

## [1.0.17]

### 修复

- 控制台前端构建产物的版本契约守卫：面板徽标版本在构建期从 pom 注入，
  此前 pom 升版后若未重跑前端构建，旧产物会带着旧版本号打进包（面板左下角
  徽标停旧版）；新增契约测试钉住「产物烧录版本=pom 版本、无旧版本残留」，
  并随本版重新构建同步 1.0.17

## [1.0.16]

### 修复

- 实时大屏节点对比：悬停节点的渐变面积边缘与平滑曲线完全贴合。
  此前面积边缘为逐点直连折线，曲线波动处出现穿出或缩进的毛边；现与主图卡、
  历史图卡共用同一平滑面积路径，面积上边缘即曲线本身（新增贴合契约守卫测试）
- 异常日志堆栈保真：多处告警/信息级日志记录异常时丢失堆栈，排障无法定位根因，
  已全部补齐（消息文本不变，仅追加异常对象）

## [1.0.15]

### 新增

- 节点对比面板质感补齐（对标历史卡/顶部卡三件套）：悬停节点图例或读出行时，
  该节点曲线下方出现唯一身份色渐变面积（polygon 锚点折线实现，不触碰
  「每节点一条折线」源码锁），曲线末端挂呼吸动画点——配合既有的升亮/退灰
  联动，多节点叠图一眼聚焦单节点

## [1.0.14]

### 新增

- Top 索引宽度参数化：`/monitor-metrics/top-indexes` 端点加 `limit` 参数
  （缺省 8 兼容旧前端，钳 1..20；快照层截断宽度 8→20），曲线视图新增
  Top N 选择（8/12/16/20，偏好跨会话记忆）
- 索引级查询延迟曲线：Top 采样快照新增每索引查询延迟（Δquery_time ÷
  Δquery_count，ms/次），指标切换扩展第三档「查询延迟」——对标阿里云
  「索引端到端查询延迟」；无查询增量的拍保持上一拍读数（不落 0 假谷）
- 节点对比面板新增「仅 master」视角：只对比 master 角色节点（role 口径与
  节点汇总同源）——主节点的堆/磁盘水位是集群稳定性的关键少数

## [1.0.13]

### 新增

- 按索引维度监控对齐（对标阿里云「index bulk 写入 tps / index 查询 qps」双卡）：
  Top 索引曲线支持写入速率/查询 QPS 指标切换（同一 5s 快照双支序列），
  并新增逐序列「最小/最大/均值/当前」统计表（按当前值降序）
- 采样维度七连扩（对标阿里云基础监控对应组）：
  Force Merge 线程池运行/排队/拒绝三卡（拒绝为增量差分）、OS 侧内存使用率、
  ES 业务进程 CPU%、节点剩余可用存储 MB、集群可搜索文档总数
- 历史图 Old GC 频次卡（gcOldPerMin 字段落库已有，本轮补卡；G1 旧代采集器
  ≈FullGC 口径）

### 修复

- 悬浮十字线圆点「无法到达曲线最高点」根治：平滑曲线控制点不再越过本段数据
  锚点（视觉极值=数据极值），悬浮圆点改贴十字线 x 处的曲线插值高度，
  历史图补横向十字线；采样窄刺峰的读数改由图例峰值直读承接

## [1.0.12]

### 新增

- 节点对比图例与悬浮读出行的超长节点名缩名（前 10 位 + … + 后 6 位，全名
  悬停可见，与节点最新水位表同一缩名规则）——32 位节点 id 不再把图例撑满整行
- 实时 KPI 卡与节点对比卡的 25/50/75 网格线补上同位刻度数字，与历史趋势
  五档轴语言对齐，任何卡的峰顶都能对着网格读出数值

## [1.0.11]

### 新增

- 全站图表十字线统一为横竖双线：顶部实时卡、节点对比卡、Top 索引曲线全部
  升级（此前仅历史趋势有横线），双线交点恒=指针位置
- 峰值直读覆盖每张卡：历史趋势图例 chip 标注该序列全窗最大值，实时 KPI 卡
  卡头新增「最大/均值」窗内统计——降采样窄刺峰（屏幕上仅 1-2px 宽）鼠标难以
  停驻刺顶，最高点读数不再依赖十字线命中精度
- 历史趋势 tooltip 行按当前值降序排列，多序列叠图先读到最高的序列

## [1.0.10]

### 新增

- 实时大屏历史趋势联动高亮：悬停/键盘聚焦图例时该序列获得唯一渐变面积、线条
  升亮与末端呼吸点，其余序列退灰——多序列叠加图一眼聚焦单序列（Datadog/Grafana
  图例语言）；节点对比图例/悬浮读出行悬停时对应节点曲线升亮、其余退灰
- 历史趋势图十字线升级为横竖双线：横线跟随指针 y，与竖线交点即指针位置，
  读数 tooltip 与各序列圆点贴线呈现
- 历史趋势版面重排：图卡网格上移至筛选头之后（选范围→看曲线零滚动），
  监控明细与节点最新水位下沉为次级区块

### 修复

- 监控曲线悬浮圆点「无法到达最高点」根治：平滑曲线控制点不再越过本段数据
  锚点（曲线视觉最高/最低点=数据极值，圆点沿曲线必达），悬浮圆点从「吸附
  最近采样点」改为「十字线 x 处的曲线插值高度」——指针沿曲线移动时圆点恒
  贴线、不再横向错位；断档时段与序列时间域之外不出圆点

### 优化

- 历史趋势多序列常态不再叠加各序列渐变面积（九层半透明互相渗染的浑浊根源），
  线宽与主卡/对比卡统一为 1.5px，网格换用主卡同款实线底座

## [1.0.9]

### 新增

- 「我的权限」自查面板：REST 直连 / Dev Tools / Painless 沙盒三页新增「我的权限」
  入口，随时查看当前身份在当前连接下各页面允许的读/写操作、REST 直连执行档与
  共享写端点档位，并给出每项拒绝原因——判定与后端拦截器同一套逻辑，所见即所执行，
  不必再凭角色猜测哪些操作会被拒绝
- 新增 `GET /auth/permissions` 查询端点（按目标连接返回逐页读/写判定矩阵），
  供面板与外部集成消费

### 修复

- 异常路径日志堆栈保真扩展：分布式锁操作失败与连接探测路径的告警日志补齐异常
  堆栈，锁互斥失败与探测失明的根因可直接从日志定位，不再只有一行消息文本
- 清理配置元数据中描述不存在配置项（`env-role-cap`）的注释段落，避免按注释
  误配无效键

## [1.0.8]

### 修复

- 监控历史趋势图多序列共享坐标系——各序列折线此前按自身数据范围拉伸满宽满高，
  序列间时间窗或量级错位时曲线视觉位置与悬浮读数错位（悬浮点挪不到曲线最高点/
  最低点）；折线绘制改与十字线/悬浮圆点/tooltip 同源的时间域+值域，同刻各线落位
  一致，悬浮读数与视觉曲线逐点重合
- 实时监控节点对比卡 QPS/写入（绝对值档）折线改按全体可见节点共享峰值归一，
  曲线高度横向可比且与 Y 轴顶刻度同一坐标系——按刻度读任意线的峰高不再失真
- 探活/集群连接测试端点在连接串解析失败时返回与统一异常通道同构的错误体
  （code+endpoint 键齐全），前端内联错误提示与异常路径同一渲染轨道
- 异常路径日志堆栈保真：error 级、节流首次告警（「首次/此后不再尝试/永久降级/
  间隔节流」全措辞族）的日志在消息文本不变的前提下追加异常对象——ES 客户端异常
  的根因（超时/拒连/鉴权失败）从此带完整堆栈，排障不再只有一行 message
- 配置元数据补齐 3 个缺失项的描述文本（env-pages 与 retry 退避两键），IDE 配置
  提示覆盖全部配置项

## [1.0.7]

### 修复

- 实时大盘节点对比卡悬浮十字线/读出与鼠标错位——监听原挂整个对比面板（面板 padding+
  头部高度计入 Y 原点=读出恒坠约 40px，面板全宽计入分数分母=X 向右偏），下沉绘图域后
  命中域=量测域=定位父级三者同体；拓扑分片格 tip 同律修 1px border 原点恒偏
- 历史趋势卡标题单位双写（「Heap % %」「CPU % %」等六处）——标题已含单位串时单位尾注
  组件级防重，Y 轴/tooltip 单位格式化不受影响
- 节点最新水位表列头与数值共右轴（原表头贴列左缘/数值贴列右缘隔半列空白）；重建轮次表
  表体数字与 Σ 合计共右轴；生命周期图例色点 vertical-align 魔法数退役改 flex 结构居中

## [1.0.6]

### 修复

- 监控历史趋势图（Heap %/CPU % 等多序列卡）悬浮十字线/最近点圆点/tooltip 与鼠标
  实际位置错位——36px 左刻度列让位改造后指针分数仍按图区全宽取值，悬浮装配整体
  右偏（左缘最大 36px 向右缘收敛）；指针命中域改挂绘图域本体，命中域=绘图域=
  定位父级三者同源零漂移
- 索引浏览/索引工作区健康筛选 chips 色点对称对齐——BrowserView 手调
  vertical-align 魔法数与 IndexHubView 基线搁置两套口径统一为 seg 钮 flex 结构
  居中（图例 chips 同语言），圆点右距归 --sp-1、尺寸归全站 8px 单源

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
