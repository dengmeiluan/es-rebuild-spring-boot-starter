# 更新日志

所有重要变更记录在此文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/)；
版本号遵循 [语义化版本](https://semver.org/)；
详细差异见 [GitHub Releases](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/releases)。

## [1.0.69]（未发布）

### 修复：DevTools / REST 透传按内层请求分读、写两档（1133）

**缺陷（产线 1.0.68 实测发现）**：宿主授权体系本来就分读写键
（`conn:{id}:devtools` 读 / `conn:{id}:w:devtools` 写），但执行端点
`/cluster/devtools/execute`、`/cluster/raw` 的外层恒为 POST，被 `isReadonlyPost`
判成写请求后只认 `w:` 那一半——**读键被整段丢弃**。结果 `deng_test_x1` 在 PROD
连接上（只授了 devtools/rest 读键）连 `GET /_cluster/health` 都执行不了，
「生产只读」退化成「生产完全不可用」。前端同源镜像（`canAdmin` 按 admin 写档判定），
执行钮对只读身份整块灰掉。

**改法**：权限层与执行层分离，读判据仍在服务端、仍在真正执行之前。

- 拦截器只判「能否进这个端点」：写键持有者走原写门（不变）；无写键但有归属页读键者
  先行准入并打标 `ATTR_PASSTHROUGH_READ_ONLY`（只放宽「能否进入」，不改变「能否写」）。
  提前到页面前缀裁决之前——`raw` 靠 `rest` 页的 apiPrefixes、`devtools` 靠共享写表，
  两者页面归属来源不同，必须同口径拦截
- 执行端 `executePassthrough` 拿到内层 `method`/`path` 后做最终裁决：
  内层只读 → 执行；内层写 → 只有写键或 ADMIN 才执行，否则 403（`ControlPlaneGuardException`）。
  属性缺失（老路径/未打标）走原有严格口径，fail-closed
- 内层只读口径（A 方案白名单，宁可判写）：`GET`/`HEAD`/`OPTIONS`；`POST` 仅放行
  尾匹配名单内无副作用的读端点（`_search`/`_msearch`/`_count`/`_field_caps`/`_sql`/
  `_mget`/`_pit`/`_cat/*` 等 34 条）。名单没覆盖到的读会被拦（用户可申请），
  名单外的写绝不会被误放
- 前端 `utils/passthroughScope.ts` 与后端逐条同源；`auth` 新增
  `canPassthroughRead/Write` 与 `canExecutePassthrough`。`canEmitWrite` 对透传端点
  改为「读写都不行才拦」（外层 POST 不可据以判死只读请求）
- DevToolsView / RestView：执行钮按**当前 tab 的内层方法**点亮，提示条拆成
  「无法执行 / 只读可用 / 数据面写」三档；三处执行体守卫（run/runSmart/execSend 与
  RestView send/doSend）全部改为按内层方法分档，首句早退强度不变
- 权限面板新增 `rawReadAllowed`/`devtoolsReadAllowed`，显示「可读可写 / 只读 / 不可用」，
  与真实执行门同裁

**验证**

- 后端新增 `PassthroughReadOnly1133Test`（15 条）：内层判定口径 9 条 + 拦截器打标 6 条，
  并**真正驱动控制器**证明「只读标记 + 内层 PUT」被拒且不触达 ES
- 负向自验：把 `_search` 从白名单删掉 → 2 条失败；把执行端守卫改成 `if (false)` → 1 条 error。
  两处都能准确报出，随后还原
- 既有「对拍锁」测试升级为读写两档（面板字段 ⇔ 拦截器同裁），并补一条
  「无 rest 键必须拒绝」的负向对照
- 前端新增 `passthroughReadWrite1133.spec.ts`（11 条）；`vue-tsc` 零错；`perm:scan` 通过
- 全量：后端 1608+15 通过；前端 1246/1247 文件通过（唯一失败在
  `AdhocRebuildView.vue` 的「本轮数据」文案触发注释卫生门，属另一工作流的在途改动，
  与本轮无关）

## [1.0.68]（2026-10-27）

### 产线复验（2026-10-27，QuoteHub 生产 20261027175234）

已用三账号矩阵在真实产线按**真实发送通道**逐项复验（`/cluster/devtools/execute`、
`/cluster/raw`、页面读端点），不是直连 ES 路径的伪入口：

- `deng_test_x1`（飞书授权，生产只读）：PROD 连接读端点 200（`/cluster/indices`、
  `/cluster/health`），写端点 403 `WRITE_DENIED`（`delete-by-query`/`create-index`），
  DevTools 403；QA/STAGING 连接 DevTools 执行 200 —— 读写分档与「测试可写、生产只读」一致
- `deng_test_x2`（超管）：PROD 读 200、建索引/删索引 200，`/auth/users/upsert` 被
  `forbidDelegatedLocalUserWrite` 拒（委派身份不得管本地全局账号），`/setup/rebind` 参数校验
- `deng_test_x3`（零权限）：所有数据面 403 `FORBIDDEN`/`CONN_FORBIDDEN`，连接目录为空
- 三账号的「体积未知写请求」全部 411 `LENGTH_REQUIRED`，补丁在产线生效
- 探测期间创建的 `qh_denied_probe_1068` 已删除，`/_cat/indices/qh_*probe*` 回空

注：x1 的 DevTools 在 PROD 被拒**不是误拦**——DevTools 执行端点按设计需要 `w:devtools`
写键（前端 `当前身份只读：执行需要 … DevTools / REST 直连写权限` 与后端同源）；
「生产只读」由宿主未授予 PROD 连接的 `w:` 键实现，读路径（各页面读端点）正常放行。

### 修复（权限加固续批）

- 宿主鉴权抛异常时不再回落到浏览器里残留的内置 token：此前委托 `authenticate` 一次 500
  就会让「已被宿主撤销的会话」静默升级成本地 ADMIN（委托异常分支绕过了 `hasCredential`
  判定）。现在异常路径同样裁决：带宿主凭证 → 拒绝；凭证探测本身异常 → fail-closed。
  「没带宿主凭证」的独立部署仍照常走内置登录，有权限的人不被误拦
- 「是否带宿主凭证」改双信号并集（`hasCredential` 或 `tokenOf` 有值）：只实现 `tokenOf`
  的自定义委托（quotehub 常见形态）此前 `hasCredential` 走默认 false，被宿主拒绝/宿主故障
  时仍会回落内置 ADMIN——通用 SPI 层面的升级路径已封堵，任一探测异常一律 fail-closed
- 自定义委托（只实现 `tokenOf`、不实现 `revoke`）的登出真正生效：控制台 `/auth/logout`
  此前回 200 但令牌在 TTL 内继续可用（产线实测 200 → 复用 200）。委托报出令牌而自身未登记
  拒绝时，由内核按保守上界（max(内置 TTL, 24h)）兜底登记；委托已自行吊销时不重复登记
- 索引工作区三条自动执行链补身份门：「挂载即检索 / 切到文档页 / 切索引自动重拉」此前
  不看身份探测状态，宿主换 token 的窗口里会用旧目标把上一账号的结果拉进新账号界面。
  自动入口统一走 `runDocsAuto/runDslAuto`（身份已落地 + 当前目标可读才发，否则挂起并在
  身份/目标收敛后补跑）；手动「检索/重试/执行查询」保持直发，有权限用户不被探测窗口挡住
- 索引工作区历史回放（lucene/dsl）改走同一自动门，并保留原来「回第 1 页」的语义
- 语法桥、模板库、Lucene 检索、检索沙盒、SQL 控制台四个视图的历史回放自动执行补同一
  读页门：回放载荷可能来自上一账号，探测未落地时旧 target 的只读请求会先发出去（403
  审计噪声 + 结果串号）。六处回放入口统一为 `if (runIt) xxxAuto()`，直调执行函数的旧形态
  清零；`perm:scan` 新增机械规则（回放通道直调执行函数即失败），防止旧形态回潮
- `perm:scan` 再补一条机械规则：任何页面/通用件写 `es-console.devtools.open`（含 `run: true`
  自动执行档）必须带 `canDevtools` 或 `canOpen(path)` 前置门——收藏回放这类通用件用注入式
  页面门同样算已门控。规则用正反两向自验（注入违规必报、恢复后即通过）
- **修复前后端 DevTools 判定的一处真实分叉**（1124）：根路径 `POST /_msearch` 的空头行
  `{}` 等于「不限索引」，后端 `guardMsearchBody` 会拒，但前端 scope 只查头部有没有写控制面
  索引，判定为可执行——「亮着可执行、点下去 403」。现前端补齐同一规则：根路径空头禁用；
  `/{index}/_msearch` 空头仍放行（ES 把路径索引当头的默认索引，非全量）。
  金标准补 10 条向量（`?q=*`、`?source=`、`/_search_shards`、msearch 根/前缀、bulk 继承、
  `_cat/aliases|shards` JSON 行式、`_cat/count`），前后端各侧一致性断言同时收紧
- 远程集群卡右键「在 Dev Tools 看 cluster.settings」补入口门：此前带 `run: true` 直接跳转，
  只读身份进去只会看到「已填入未执行」；现在无 DevTools/REST 写权限即在来源页说明并取消跳转
- `perm:scan` 的 DevTools carry 规则改按「写入点前 1500 字符窗口」判定并要求注入门**被实际调用**
  （原实现只要文件里出现过 `canEndpoint('admin'` 就算通过，把能力定义行本身当成了守卫——
  删掉调用处仍绿，实测踩到）。注入式页面门（收藏回放的 `canOpen(dest)`）按调用形态单独放行；
  两处负向自验（删 RemoteClusters 守卫、删 favReplay 调用）均能准确报出
- `perm:scan` 的 DevTools carry 规则补认「页面读门」形态：TemplatesView「在 DevTools 打开」
  用的是 `auth.canReadPage('devtools', target)`（与 canDevtools 同一裁决源），原规则只认
  `canDevtools`/`canOpen(`，把一道真实存在的门判成缺失。只认 `canReadPage` 第一实参为字面量
  `'devtools'` 的调用（不把任意页面读门当门），并做了负向自验——把该门改成 `if (false)` 后
  规则立刻报出 TemplatesView:253，还原后回绿
- DevTools **账号切换实测**（真实路径，非合成事件）：operator 身份造现场（路径含
  `secretA`、三个 Tab、`es_devtools_draft:host` 落盘）→ 宿主侧换成 x3 → 前端触发重探后
  **Tab 数 3→0、路径清空、磁盘草稿键 0 条**；角色降到只读时执行钮同时消失。账号切换
  不留上一身份的表单/标签现场
- DevTools 请求行控件高度统一（Kibana 对齐的第一处视觉毛刺）：此前同排五档高度混排
  （路径框 36px / 主执行钮 25px / ghost 钮 22–23px / 方法下拉 26px），基线参差；现整行
  统一 26px（`box-sizing` + 定高，路径框内 input 撑满）。实测高度直方图 `{22:2,23:1,25:1,26:1,36:1}`
  → `{26:6}`，1440/1024 均无横向溢出与裁切
- 集成指南抽屉的 `drawer-style` 弃用告警清零（naive-ui 新版改用 `:style`），视口钳制
  `maxWidth: 94vw` 原样保留；`responsiveGuard239` 的锚⑤同步接受新写法，9 例全绿
- 无写权限的只读身份不再看到「工具栏少一半却无处可查」：任务管理、任务树、数据浏览器、
  一键优化向导补页头只读说明条（隐藏取消/删除/新建/应用钮时说明缺什么、怎么申请），
  与 Aliases/ILM/Rest 既有只读说明同一语言；身份未探测完成前不闪现
- DevTools 跳转在来源页就说清缺口：DSL 工作台（就地/历史）、索引工作区（就地/历史）、
  ILM 示例策略的「到 DevTools」入口按 `devtools/execute` 能力先行判定，无权限直接提示
  「需要 DevTools/REST 页写权限或 ADMIN」，不再把人送进一个只会「填入不执行」的页面
- 安全中心账号写操作（保存/删除用户）的权限拦截补提示：此前静默 `return` 会让键盘/程序化
  入口表现为「点了没反应」，现在明确说明需要 ADMIN 角色
- **委派超管（产线 `deng_test_x2` = role=ADMIN + delegated=true）不再看到必失败的用户管理表单**：
  后端 `forbidDelegatedLocalUserWrite` 现在先判委派再判角色（本地账号是宿主体系外的全局身份，
  只有内置 ADMIN 能建/改/删），前端 `canWriteUsers` / `canEmitWrite` 同步把委派判断提到
  `isAdmin()` 之前——旧顺序在超管档提前放行，表单亮着、点下去必 400。拒绝理由按身份来源给出
  （「宿主委派身份只读」而非「需要 ADMIN 角色」，后者对委派超管是错的方向）；
  用户列表读取与其它 ADMIN 域写（重绑以外的管理动作）不受影响，不误拦有权限的人
- 委派超管越权的**端到端链路证明**（1132）：新增 `DelegatedAdminEscalation1132Test`，
  把「拦截器裁决 → 控制器 → 真实 service → 存储接缝」串成一条链跑通。
  结论澄清了一个易误判的分层事实：**拦截器对委派超管的用户管理写是放行的**（`isSystemAdminUri`
  对 ADMIN 放行，而委派超管角色就是 ADMIN），真正的否决点在 `BuiltinConsoleAuthService`。
  因此把断言写成「拦截器 403」是错的预期——会把正常链路判成漏洞。当前断言为「必然在
  service 层被 `IllegalArgumentException` 拒绝，且未触达存储」。
  负向自验：移除 service 守卫 → 2 例转红（请求穿过守卫抵达存储接缝）；
  内置 ADMIN 用例保持绿（未被误拦）。
- SQL 执行口径整族纳入换号清理：`es-console.pref.sql.params` 单键扩为
  `es-console.pref.sql.`（时区/超时/取数/列式/图表开关）——换人后沿用上一账号的时区会让
  日期列口径与 cursor 续页前后不一致

### 修复（结果表遮挡与检索报错）

- **表头点击排序不再报「操作失败」**：排序字段统一走 `resolveSortField` 裁决。`text` 字段
  （`title`/`issuer_name` 这类最常见的列）没有 doc_values，直接下发 `sort` 必然 400
  「Fielddata is disabled」——文档检索/DSL 工作台此前把列名原样透传。现在有 `.keyword`
  子域就改打子域，没有就拦下并提示「换成 keyword/date/数值字段」，查询现场不动；
  映射表补登 multi-field 子域（`title.keyword`），否则可排的 text 列会被误判为不可排
- **检索失败不再用右下角弹窗盖住结果表**：有旧结果时再检索失败，错误条现在压在结果表
  正上方（限高 132px），标注「下方仍是上一次检索成功的结果」并给重试/收起；首次失败仍走
  整页错误态。toast 改为只入通知历史——它原本正好盖在表格正文上
- 错误原因继续下潜到分片级叶子（`root_cause` / `caused_by`），不再只显示
  「all shards failed」这类包装词；只剩包装词时提示「展开『原始 IO』可看分片级原因」
- **工具行窄档只留图标（真修复）**：`ColPicker` / `TablePresetMenu` 的文案标签在子组件
  模板里，原来的 `.rt-bar .cp-label` 写在 `scoped` 样式里永远打不中（子组件元素不带父组件
  scopeId），窄档「只留图标」对这两颗钮从未生效。改为 `:deep()` 后 1280px 以下即收成图标，
  右簇从 392px 降到 ~263px
- **快滤框不再压住「刷新/导出」**：检索框 160px 固宽不参与收缩，容器让位后仍有 49px 溢出盖在
  相邻按钮上（截图里「按钮文案互相遮挡」的源头之一）。地板宽改放容器上、输入框 `width:100%`
  跟随收缩，1280px 以下地板 90px。实测 1148px：工具行零重叠、末尾按钮完整可见
- 「更多」菜单收纳：`表格快照 PNG` 由工具行移入「视图 ⋯」；文档检索动作行与索引工作区
  行操作同步收进菜单（能力不减少，权限门与原钮同源）
- **列头不再为「看不见的元素」让宽**：类型徽标与未排序 ⇅ 用 `opacity:0` 隐藏时仍参与
  flex 宽度分配——110px 的 `status` 列里，看不见的 `keyword` 徽标吃掉 42px、⇅ 再吃 10px，
  列名只剩 30px（文字实际需要 34px）→ 列名被截断/挤压。现在静息 `display:none` 让宽度
  全归列名（同列可用宽 30px → 90px），类型改由列头 tooltip 首行「类型 · 列名」承载
  （悬停浮出的徽标带底色会把 `status` 盖成 `sta`，已撤），⇅ 悬停时出现在漏斗左侧固定槽位
  并给列名让 34px 沟槽；列名常驻右内衬 14px 让开筛选漏斗。两表（结果表/SQL 结果表）同口径

- **换算子不再静默丢参数**：`paramsForOp` 此前只按 `OPS_META`（叶子算子）白名单清洗，
  wrap 族参数表 `WRAP_PARAMS` 没参与——`script_score` 的 `min_score`、`nested` 的
  `score_mode`/`inner_hits`、`function_score` 的 `boost`/`boost_mode` 等合法参数会被当成
  「旧算子参数」丢掉，用户切一次算子就白配。现在两表并集裁决，非法键仍照旧剔除
- 非常用语法往返再补一批审计：`function_score` 各 function 形态（含 `interpolate`
  的 linear/exp/gauss）、`script_score` 全文形态、8.14+ retriever（knn 带 filter /
  rrf 带 rank_window_size / standard 带 min_score）经 parse→serialize 均逐字节保真；
  新增 `dslRoundTripFunc1152.spec`（12 例，含「每个已注册算子都有可读标签」防裸英文回潮）

- **Watcher 告警卡补右键，行内动作不再平铺**：卡片右侧原有三颗钮（编辑 / DevTools / 复制），
  窄屏把 watch id 挤成省略号，整页也没有右键。现在卡片右键与新增的「⋯」共用一份两级菜单
  （一级：在 DevTools 编辑 / 复制 metadata；二级：`复制…`（watch id / 整条定义）、
  `在 DevTools 打开…`（查看定义 / 编辑定义）），行内收成「编辑 + ⋯」。DevTools 权限门
  仍走原函数，不因换入口而放宽。新增 `watcherCardMenu1153.spec`（4 例），
  真实浏览器实测：卡片右侧 3 钮 → 2 钮，右键一级 4 项 + 2 个二级分组

- **SQL 结果表窄档同样只留图标**：此前只有「列选 / 布局」两颗掉文字，「导出 ▾」「视图 ⋯」
  仍是整词，1148 窗口把右簇顶宽、末尾钮贴边。文案包进 `.qrt-tool-t`，1280px 以下统一收起
  （字符串保留，读屏与旧源码锚不变）。实测 1440 显示文字、1280/1148/1024 收起，四档零溢出零重叠
- **宽表列头实测复核**（SQL 结果表，8 字段真实返回）：9 个列头高度统一 **25px**，
  类型徽标在静息态 `display:none`（不占宽），**列名零截断**，横向 `scrollWidth === clientWidth`
- **模板库卡片补右键**：卡片底部五颗钮（复制 / 沙盒 / DSL / 收藏 / 展开）平铺，与「表格右键
  太多功能平铺」同病。右键按能力语义分两级——一级两个去向（沙盒 / 查询工作台）+ 复制…、
  收藏…、代码区… 三个分组父行，二级承载具体动作（含新增「复制模板标题」「复制为 cURL」）；
  底部按钮行原样保留（触屏无右键）

- **实时监控屏三张表补行右键**：Top 索引 / 慢请求 / 告警历史此前是纯展示 `<table>`，既无排序筛选
  也没有右键。现在行右键按各行心智给一级动作（Top=在数据浏览器打开该索引、慢请求=复制 URI、
  告警=复制告警文案），整行 JSON / TSV 收进「复制…」二级；跳转仍走既有的 `canSeeConn` +
  `setTarget` 权限门，菜单内**不含任何写动作**（监控屏不能变成误操作面）
- **列头在极窄列（60px）下的复核**：列名按字符截断成 `st…`，筛选漏斗与文字零重叠——
  上一批的「静息不占位」在极限宽度下同样成立

- **`inner_hits` 不再只能手写 JSON**：nested / has_child 结果里几乎必用的 `inner_hits`，
  此前是一个裸 JSON 文本框。现在值确实是对象时，`from` / `size` / `name` 给结构化输入
  （数字控件回写 number 类型、清空即删键，不留 `from: 0` 这种脏值），JSON 位保留整段编辑
  能力（`sort` / `highlight` / `_source` 等其余键照旧可写）；数组/标量形态不给快捷行，
  回落原 JSON 单通道。新增 `innerHitsQuick1159.spec`（6 例）

- **DevTools 响应表格补行右键**：响应 JSON 的「表格」视图此前只能单击复制整行，想拿单个字段值
  或整张响应原文得回 JSON 档自己找。现在行右键按两级给：一级「复制该行 JSON」（与单击同义），
  二级「复制…」（TSV / `key=value` / 前若干字段逐值）与「整表…」（复制全量 / 导出响应原文，
  导出走服务端原文不重排）。这是临时预览表，不接查询结果内核（内核会持久化列宽/列选偏好，
  预览表不应写维度记忆），但复用同一套两级菜单语言。新增 `devtoolsRespRowMenu1160.spec`（5 例）

- **全算子结构往返审计（新增长期回归网）**：此前只抽查若干算子；现在把注册表里
  **每一个**算子（61 个叶子 + 8 个 wrap 容器 + 8 个 multi 子句）与 6 个 retriever 变体
  逐一过「工厂造节点 → 序列化 → 反解析 → 再序列化」，两轮必须逐字节一致。
  72 例全通过——即「用户能把这个算子放进树里并原样取回」不存在结构断裂；
  后续新增算子时这条网会自动覆盖（注册表驱动，无需补用例）

- **工具行（「表格格式 / 表格操作那个表头」）补右键**：此前右键只覆盖列头与单元格，工具行
  这条带子完全没有右键。现在 `TableShell`（两表共用的卡头壳）统一转发 `bar-contextmenu`，
  RT/QRT 各自给菜单：一级只放最常用的「导出 / 行高切换 / 快照」，「重置全部列宽 / 全列适应 /
  聚合行 / 转置视图 / 语义格式化」收进「更多…」二级（能力零删除）。
  实测 RT 与 QRT 均二级可展开；顺带修掉一个真实渲染缺陷：菜单里 `rowHLabel` 少了 `.value`，
  行高文案显示成 `[object Object]`（浏览器实测发现，已修并加锁）

- **工具行在 1100~1180 窗口被裁切（截图「按钮文案操作遮挡」的最后一处真实原因）**：
  列头/工具行的元素平铺此前已从「标签掉文字 + 窄档换行」治过，但换行断点定在 1100，
  而实测（逐 20px 扫描）内容溢出起点是 **1180px**——1180 起 `scrollWidth` 就超过
  `clientWidth`（1160 溢出 21px、1148 溢出 41px、1120 溢出 61px），这段区间两个断点都不触发，
  于是右簇末尾钮**直接被切掉**，命中数 `rt-info` 被压缩到 **0 宽**（1120 下整块消失，
  用户看到的就是「检索引擎报了什么」完全不见了）。现在换行阈值提到 1180（≥实测溢出起点，
  测试里加了「断点不得低于 1180」的假修复防线），并把右簇 `margin-left:auto` 压回右缘
  （换行后右簇是第二行唯一 flex item，`space-between` 会把它甩到最左）。实测 1180/1148/1024
  三档：`overflow=0`、右缘间距恒 11px、15 颗钮零裁切、命中数 65px 常显。新增 2 例源码锁
  （含「规则写在内核 scoped 里即失败」的反断言——`.rt-bar-r` 是 `TableShell` 模板元素，
  1164 实测写在内核 scoped 里 100% 不生效，必须住壳全局 style）

- **命中数被省略号吃掉（同一张截图里的「1/1 · 1…」）**：1440 宽档左簇只超出 15px，
  而当时唯一可收缩的是 `rt-info`——实测容器 **64.8px** / 内容 **65px**，差 0.2px
  就把耗时徽标最后一段替换成省略号（高倍截图确认渲染成 `1/1 · 1…`）。
  两处一起改：① 快滤框地板 160→90px 并**常驻**（不再只在 ≤1280 档），
  收缩优先级 `flex: 0 100 auto` 让它第一个让位（placeholder 是空态装饰，
  命中数才是这条带子的主信息）；② `rt-info` 改 `flex-shrink: 0`，计数不再参与收缩。
  实测 1440：`scrollWidth === clientWidth === 65`，徽标完整。

- **SQL 结果表工具行两个一模一样的 ↗**：`bar-extra` 里宿主注入的「结果表高度档」与内核自带的
  「放大结果表」用了同一个 `Maximize2`、同尺寸、相邻，实测并排两个几乎无法区分的图标——
  点错就是「以为全屏，结果只改了高度」。高度档改用 `UnfoldVertical`（⇕=上下展开），
  与 ↗（横向铺满）语义正交。字号/尺寸/aria-label/`data-sq-result-h` 全不变

- **Lucene / PIT 的 sort 输入框是「操作报错」的漏网通道**：1149 只把「表头点击排序」
  统一走了 `resolveSortField`，但这两个页面的排序字段是**输入框**——`FieldPicker`
  只过滤下拉候选，挡不住 `?sort=title`、粘贴、历史回放。实测在 Lucene 页把 `?sort=title`
  带进 URL 并执行：`title` 是 text 且无 `.keyword` 子域 → ES 直接 400
  「Fielddata is disabled on text fields」，用户看到的就是「操作报错」。
  现在两处都在**发请求之前**解析：能解析就换成 `.keyword` 子域（PIT 还会回写输入框并
  在日志说明），解析不了就地拦下并给可行动提示，不发注定 400 的请求。
  PIT 的 `_shard_doc` 快排豁免不参与映射判定（否则默认档会被误拦）。
  实测：Lucene 带 `?sort=title` 执行 → 弹出「「title」是 text 字段且没有 .keyword 子域，
  ES 无法对它排序；请换成 keyword/date/数值字段」，**发往后端的搜索请求 = 0 个**。
  新增 `sortFieldManualInput1169.spec`（3 例，含「解析器必须在拉取循环之外」的锁），
  并用注入违规（删解析/删豁免）证伪过

- **生命周期甘特策略行补右键**：这条列表此前只能「看」——想拿策略名或阶段表只能手抄。
  现在行右键按两级给：一级「复制策略名」「复制整条策略 JSON」，「复制…」二级承载
  「阶段表（中文（english） min_age）」「阶段英文原名（逗号分隔）」。
  只读数据 → 菜单内**不含任何写动作**（推进/启停仍走页内既有按钮，避免监控面变误操作面）。
  实测一级 3 项、二级 2 项、标题 `ILM 策略 · <name>`。新增 `lifecycleRowMenu1169.spec`（3 例）

- **`terms_set.minimum_should_match_script` 的 `source` 不再只能手写 JSON**：这是
  terms_set 里几乎必改的一项（painless 表达式），此前整段 JSON 文本框。现在对象形态
  给结构化快捷行，`source` 单独一个**文本**输入位（脚本是字符串——数字框会把它降级成
  `NaN`），其余键（`params` 等）仍走 JSON 位保留类型。清空即删键，不留空串脏值；
  标量/数组形态不出快捷行，回落 JSON 单通道。`dslInnerHits1094.spec` 扩到 7 例，
  负控证明：把 `source` 输入框改回 `type="number"` → 2 例转红

- **索引/组件模板列表行补右键**：一行此前只有一个删除钮，想拿模板名、`index_patterns`
  或整段定义只能手抄。现在行右键（含键盘 Menu 键）两级：一级「复制模板名」「复制模板定义
  JSON」，「更多…」二级承载「复制匹配模式（N 条）」与「在 DevTools 打开（只读 GET）」。
  **破坏性删除不进右键**，仍留行内按钮。DevTools 入口门与 `DevToolsView` 页门同源
  （`canReadPage`）——无读权时不跳转、不写 `es-console.devtools.open`
  （否则等于把不可用动作放进可达路径）。新增 `templatesRowMenu1169.spec`（4 例，
  含「删除不得进右键」「无读权不得写 open 键」两条负向锁）

- **Lucene 页的「文档 JSON」视图没有行右键**（右键补齐的下一处）。查询工作台的结果表
  有两种视图：表格（走 TableKernel，单元格右键齐全）和「文档 JSON」（手写三列表 +
  JsonTree 嵌套）——后者没有右键，于是「切个视图就丢了复制文档的能力」。
  现在命中行可右键：一级「复制 _id / 复制文档 JSON（_id + _source）」，二级「复制…」
  里是 _source（不含 _id）/ _score / **用 _id 在 DSL 工作台查此文档**（跳转带
  `{"query":{"ids":{"values":[...]}}}`，不是空 DSL）。只读安全：menu 内只有复制与跳转。
  实测（headless Chrome 1440×900 + mock）：切到「文档 JSON」，右键第三行 →
  标题 `命中文档 · rr-1`，一级恰为三项，二级三项，菜单盒 708–941 / 435–565 全在视口内。
  `luceneRowMenu1207.spec` 4 例；原有 `luceneJsonFind374` 的行锚点跟着放宽
  （锁的仍是「该行由 jsonHits 驱动」，不是「行上没有别的属性」）

- **Adhoc 托管重建的两张只读表不能取数**（全站右键补齐的下一处）。「期望 vs 实际」
  差异表和轮次表此前只能看：比对出「哪个字段类型不对」之后，要拿路径/期望值去改注解、
  贴工单或回给业务方，只能手拖选中再复制。
  现在两表行都挂右键，一级只留最常用的两项（差异：复制路径 / 复制整行 TSV；轮次：
  复制本轮 TSV / 复制本轮 JSON），其余收进「复制…／更多…」二级——与全站右键同一规矩，
  不把动作平铺一级。标题带定位（`差异 · properties.x.type` / `第 N 轮 · 阶段`）。
  只读安全：菜单只含复制语义，负控锁住 `runRollover/startJob/api.reindex/askConfirm`
  这类写动词不得出现（差异行右键不能让人以为能直接改集群）。
  验证：真挂载 `AdhocRebuildView` 走完整流程（粘贴期望 → 探测 → 校验并继续 → 策略步），
  对差异行派发真 `contextmenu`，断言菜单开、标题含路径、一级恰为三项且分组项
  `aria-haspopup="menu"`、点开后二级才出现「复制期望值 JSON / 复制实际值 JSON」；
  负控：删掉行上的 `@contextmenu` → 该例转红。`adhocRowMenu1205.spec` 另有 4 条源码锁

- **导出档位两内核分叉：索引工作区比 SQL 结果表少一个 NDJSON**（回答「为什么表格能力没有
  完全共享」的实查结论）。逐项核对 `ResultTable` / `QueryResultTable` 的导出面：
  QRT 早就有 `exportNdjson`（每行一个对象，给 jq / `_bulk` / 逐行 ingest），
  RT 只有 CSV/XLSX/JSON/MD 四档——同样的数据在 SQL 那边能流式导、在索引工作台导不了。
  现在 RT 补齐 `ndjson` 分支与「导出格式：NDJSON」菜单项，语义与 JSON 档对齐
  （整文档 `_id + _source`，不经 exportCell 矩阵加工，只是行间换行、无外层数组）。
  实测单元格右键 →「列与导出…」二级里出现「导出格式：NDJSON」。
  新增 `exportParity1169.spec`（4 例，含「两侧格式集合必须一致」的分叉防线）

- **反向缺口：SQL 结果表的单元格右键只能导 CSV**（同一次排查里发现的另一半）。
  RT 的单元格右键一直能就地切默认导出格式；QRT 只有一条「导出当前视图（CSV）」，
  想导 XLSX/JSON/MD/NDJSON 得另开工具行菜单——同一张表两套操作路径。
  现在 QRT 的二级分组补齐五档导出（CSV/XLSX/JSON/Markdown + `exportNdjson` 开时的 NDJSON），
  **复用工具行「导出 ▾」同一批函数，能力零新增，只是把入口补齐**。
  两条容易做错的边界：
  ① 标签写「导出当前视图（XLSX）」而不是「导出格式：XLSX」——QRT 没有 RT 那个
  「默认格式」偏好（工具行是五档直选），写成「格式」会让用户以为点一下只改设置不下载。
  RT 那五条 `fmt-*` 是 `setExpFmt()`（只改偏好，真正的下载走「⬇ 导出」），QRT 这五条是直接下载，
  语义不同不能照抄标签。
  ② 列管理项仍在「有记忆维度」门内（SQL 通道无 storageKey 时不出）；
  补导出不能把这道门拆了，也不能让分组还叫「列与导出…」却没列可管——
  无记忆时组名回落「导出…」、图标换下载。
  实测（headless Chrome + mock 后端，1440×900）：SQL 结果表右键 →「列与导出…」二级十项
  `隐藏此列 / 此列置首 / 此列适应内容 / 全列适应内容 / 导出当前视图（CSV|XLSX|JSON|Markdown|NDJSON）`；
  点 XLSX 落「已导出 5 行（XLSX，含 meta 页）」（证明是下载而非改设置）。
  `exportParity1169.spec` 扩到 6 例（含「QRT 不得出现『导出格式：』」「五档必须复用同一批函数」
  「无记忆时组名回落」三条负向锁）

- **只读身份进 DevTools/REST 直接崩页面（空指针）**：`grantedPages` 三态里 `null` 表示
  「菜单 SPI 未启用」，但透传写门 `canPassthroughWrite` 直接用 `gp!.includes(...)`——
  null 时 `Cannot read properties of null`，整个视图 setup 抛错、白屏。
  同文件其余入口（`canEndpoint` / `canPage` / `canSeeConn`）都按 null 回落，只有这处漏了。
  修为：null 时回落全局角色档（与 `canEndpoint` 同口径），并补 `me == null`（未启用鉴权）放行
  分支——否则无鉴权部署会把透传整段关死。修复前两分片共 15 文件 / 67 例转红（绝大多数是同一个空指针），
  修复后受影响的 `devtoolsSmartAssist` / `devtoolsResp561` / `dtSelectPresence947` /
  `devtoolsGateCancel942` / `devxThreeState` 单跑 54 例全绿，两分片全量亦全绿

- **窄列悬停时列名反而被吃掉（`title` → `t…`）**：1151 给悬停态加了 34px 右内衬，
  让 ⇅ 提示不压住列名——但那是按 110px 列算的。实测 70px 的 `title` 列内容盒只有 50px，
  让完只剩 16px，**悬停比静息更糟：想看名字，名字被省略号吃了**（高倍截图确认）。
  现在窄列（内容盒 ≤96px）悬停只保留常驻的 14px 漏斗内衬，⇅ 仍从漏斗左侧浮出
  （短暂叠在文字尾部，可接受；截掉列名不可接受），宽列行为完全不变。
  实现用 `@container`，锚点必须在 `.rt-th-in` 上：实测把 `container-type` 挂在 `<th>`
  （table-cell）上**阈值放到 5000px 都不命中**，挂内层 flex 立即生效；两种挂法都不改几何
  （列宽 70/60、行高 26 逐项不变）

### 验证

- 委派超管取舍双向验证（1132）：注入旧顺序（`isAdmin()` 先于委派判断）后
  `securityDelegatedAdmin1132` 挂载用例转红（`.new-user` 表单被渲染）、能力层用例转红
  （`canEndpoint` 放行写本地账号）；恢复后复绿。内置 ADMIN 分支同批断言「表单照常渲染 +
  其它管理域写不被误拦」，确保修复不是把有权限的人一起拦掉
- `BuiltinConsoleAuthServicePrivilegeTest` 8 例（含委派 ADMIN 建号/删号必须失败、
  内置 ADMIN 仍可管理），`ConsoleAuthInterceptorPageAuthTest` 71 例，全绿
- 后端全量 `mvn test`：**1566 例 / 0 失败 / 2 跳过**，exit 0。首轮暴露两例版本指针漂移
  （`standalone/pom.xml`、`docs/integration/quickstart.md`、`README.md` 仍写 `1.0.66`），
  已随根 pom 一并升到 `1.0.68`，`QuickstartSnippetContractTest` / `StandalonePinGuard1035Test` /
  `ReadmeBilingualContractTest` 复跑全绿
  12 例测试（行尾/行首/块注释/字符串保护/转义引号/混排/纯注释/空输入），另加两例边界：
  未闭合块注释**不吞后续正文**、未闭合字符串不把后面当注释（宁可保留原文，也不静默扩大删除面）。
  配套源码锁 `devtoolsSendBoundary1132`（4 例）：历史与跨 Tab 镜像必须存**原稿** `t.body`
  （回放时注释不丢），只有发出去的字节用 `bodyFinal`；且剥离必须晚于变量展开。
  负向自验：把历史改成写 `bodyFinal` → 锁转红。
- **DevTools 发送时未剥离注释**（1132，Kibana 对齐）：Kibana 把 `//`、`#`、`/* */` 当语法，
  发送前自动剔除，所以用户可以在请求里写说明。我们只在**导入导出**时把注释当文本保留，
  发送却原样透传——照 Kibana 习惯写一行 `// 查订单` 就拿到 `Unexpected character ('/')`，
  看着像控制台坏了。新增 `utils/devtoolsComments.ts`：字符串字面量内的 `//` `#` `/* */`
  不动（URL/正则/文本不被误删）、转义引号正确处理、剥完只剩空白则送空串。
  接在 `execSend`（全量/分段/键盘/历史回放唯一发送点）里，变量展开之后再剥离；
  范围判定用的也是剥离后的 body，与实际发出的内容一致。
  12 例测试（行尾/行首/块注释/字符串保护/转义引号/混排/纯注释/空输入）。
- **客户端写门「门在、线没接」无人盯**（1132）：`api.request` 的写门是「无权限零网络请求」的
  唯一保证，但它靠 `main.ts` 注入 `setApiWriteGuard(...)`——一旦这行被删或改名，守卫变量
  保持 null，**整条客户端写门静默失效**，而所有现有单测仍绿（那些测试自己调
  `setApiWriteGuard` 装桩，测的是 api 层，不是装配）。`perm:scan` 新增机械规则：
  `main.ts` 必须出现 `setApiWriteGuard(` 且指向 `canEmitWrite`。
  负向自验：删掉装配行 → 两条断言同时报红；恢复后复绿。
- **发版兼容性前置核对**（1132，1.0.68 vs QuoteHub 现有接入）：逐类确认 QuoteHub 引用的
  15 个 starter 类型（`ConsoleAuthDelegate`/`ConsolePrincipal`/`ConsoleRole`/
  `DelegatedTokenRevocations`/`ConnStore`/`EsClientRouter`/`LinkLifecycleEvent` 等）
  在 1.0.68 jar 中全部存在；再用 `javap` 核对它实际调用的方法签名
  （`authenticate`/`hasCredential`/`tokenOf`/`revoke`/`isRevoked` 与 7 参
  `ConsolePrincipal` 构造器）**逐一保留、无破坏性变更**。结论：升级 1.0.68 不会让宿主编译失败。
- **非 ADMIN 探测系统管理域不再「无痕」**（1132）：`/clusters/`、`/setup/rebind|apply`
  这类授权载体端点，非 ADMIN 被拒时**直接 deny、不落审计**——而这正是攻击者最爱试的
  高价值端点，「有人试过但事后查不到」。现已补 `ADMIN_DENIED` 审计（含 uri 与 required）。
  同批核对：25 处 4xx 拒绝点中 22 处已有审计，剩下 5 处属认证前拒绝
  （`BAD_PATH`/`CSRF_BLOCKED`/`SETUP_REQUIRED`/`UNAUTHORIZED`），无身份可记，保持原样。
  注：`/auth/users` 不在系统管理域白名单里（它走 security 页写键），写测试时踩到过这个误解。
- **32MB 请求体上限可被 chunked 绕过**（1132）：拦截器只用
  `request.getContentLengthLong()` 判体积，而 chunked transfer-encoding **不带
  Content-Length**（容器返回 -1），旧实现把 -1 当成「没超限」直接放行——换一个传输编码
  就能把任意体积推给 Jackson 全量读入，正是这条限制要挡的内存耗尽面。
  现在「容器明确回了 -1」= 拒绝（411 `LENGTH_REQUIRED`）；`getContentLengthLong()`
  抛 `UnsupportedOperationException` 的极老容器/最小桩**不在此列**（真实 Servlet 容器都实现它，
  那不是攻击面）——首版没区分这两者，把 50 个既有用例一起打成 411，已修正。
  两件事同时钉住：① 这 20 行此前**没有任何测试**（规则存在但从未被证明有效）；
  ② 修复不能误拦正常业务——用**真实 Chrome**（headless + 本地 HTTP 页 + 5 种写法）
  **全部带 Content-Length**，所以 411 不会打到 `clustersDelete`/`deleteById` 这类
  参数走 query string 的正常写请求。4 例单测（超限 413 / 正常放行 / chunked 411 / GET 不受影响）。
- **增量构建把每一轮旧 bundle 都留在 classpath 里，且可直接 HTTP 访问**（1132）：
  `maven-resources-plugin` 只覆盖式复制、**从不删除**目标目录多出的文件，vite 每次构建又换哈希名，
  于是不跑 `mvn clean` 的增量构建会让 `target/classes/static/console/assets/` 越堆越多
  （实测 **5849 个 vs 源码 278 个**）。这些文件经 `/console/assets/**`（直连 classpath）是
  **可被直接请求**的——旧 bundle 仍能访问，等于把修复前的控制台代码继续对外提供；jar 也被撑到 **37.6MB**。
  修法：antrun 在 `initialize` 阶段先删 `target/classes/static/console`，再由 resources 复制干净的一份。
  结果：assets 5849→**278**（与源码一致）、jar 37.6MB→**3.3MB**，且三项本批修复
  （环境模板提示 / 三引号 vars / Ctrl 请求边界）均确认在新 jar 内。
  踩坑记录：首版把清理绑在 `process-resources`，同阶段按声明序排在复制**之后**，
  打出 797KB 空 jar（控制台整体丢失）——已改为 `initialize` 并复验。
- 新增守卫 `ConsoleAssetFreshness1132Test`（demo-host，真实 Spring Boot + 真实 HTTP）：
  入口页 200、starter jar 内 assets 与源码侧**双向比对**（多一个少一个都红）、
  不存在的哈希名 404。负向自验：往 jar 里塞一个陈旧 bundle → 用例转红；移除后复绿。
  写这条时的教训：最初只「逐个请求源码里的文件名」，塞入陈旧 bundle 后**依然全绿**——
  那种写法只能证明「该有的都有」，证不出「没有多余的」，属假通过；改成枚举 jar 条目再做差集才有效
- 开源集成示例（`examples/demo-host`）跟随主版本：其 starter 依赖指针仍停在 `1.0.66`，
  与根 pom / standalone 脱节；已同步到 `1.0.68` 并实跑 `DemoHostSmokeTest`（真实 Spring
  Boot 随机端口启动 + 真实 HTTP 请求 `/es-rebuild.html`、`/setup/status`）**exit 0**，
  证明本批改动没有破坏嵌入式接入形态
- 真实 HTTP 层权限验证的**环境限制**（如实记录）：`ConsoleAuthInterceptor` 在「控制集群
  未绑定」时对除 setup 外的所有端点返回 409，短路先于身份认证。因此本地不接真实 ES 时，
  无法用真实 HTTP 验证页面门/环境封顶——这部分证据目前来自拦截器级 E2E
  （`DelegatedAdminEscalation1132Test`，真实拦截器 + 真实 service）与单元矩阵，
  产线级验证仍需 1.0.68 发布后执行
- 产线（1.0.67，修复前）无副作用基线：委派超管 x2 对 `/auth/users/upsert` 的
  空用户名探针返回「username 不可为空」——说明请求已越过权限门进到参数校验，
  确认该越权路径在发版前真实存在（发版后同一探针应返回委派拒绝语义）
- **raw 透传守卫的红队复验**（1132）：新增 `EsIndexAdminRawBypass1132Test` 11 例，
  针对此前批次未覆盖的编码/构造手法做主动绕过尝试——大小写变体（`ES_CONSOLE_USERS`）、
  百分号编码（`%65s_console_users`、`es_console%5Fusers`、`%69ndex` 参数名）、双斜杠与点段
  （`//`、`/logs/../`、`/./`）、逗号多索引与中段通配（`logs,es_console_users`、`es_cons*le_users`）、
  体内容器（`_mget.docs[]._index`、`terms` lookup、`_reindex` 源与目标、快照 `indices`、
  `_index_template.index_patterns`）、`?source=` 体旁路、`index|indices` 查询参数。
  **全部被守卫拒绝**，无一绕过。负向自验：移除「首段索引 token 检查」与「query index-ref
  检查」→ 恰好 4 例转红，确认用例真正覆盖守卫而非空转。
  过程中修正一处**测试预期错误**：原本把 `?routing=es_console_users` 也要求拒绝——
  routing 是分片路由值、ES 不会拿它当索引读取，拒掉反而是误拦（正常写入带 routing 很常见）。
- 后端 mutating 端点全量对账（1132）：静态枚举 95 个 `@Post/@Put/@Delete/@Patch` 映射，
  与权限清单逐条比对，5 个未被直接列出者均已被覆盖（`rebuild-empty`/`clusters/save`
  在前缀白名单、`insight/actions/*` 走动态 actionId 裁决、`cluster/sql/translate|lenient`
  属只读 POST 段匹配）——**无未登记写端点**
- **环境模板（env）对 ADMIN 失效**（1132）：`pagesFor` 收缩原先只出现在
  `grantedPages != null` 分支内、且排在 `if (role >= ADMIN) return true;` 之后——
  内置 ADMIN（`grantedPages=null`）与委派 ADMIN 都不走 env 判定，连接标了 PROD 也照写。
  现在 env 封顶提到一切角色/页面裁决之前：按「请求所属页面」与连接 env 模板比对，
  共享写端点取任一归属页在模板内即放行；**判不出页归属的基础读（keys/indices）不封顶**
  （否则有权限的人在 PROD 下连索引列表都看不到），宿主目标恒不受连接模板影响。
  负向自验：把封顶条件改为 `false` → 恰好 3 例转红（raw 写 / devtools 执行 / search 页读），
  2 例防误拦用例保持绿；恢复后 77 例全绿。
  **适用边界（产线实测修正）**：当前 `deng_test_x1` 在产线是 `VIEWER + delegated` 且
  宿主未下发 `envPages`，它的「PROD 只读」由 `grantedPages` 的 conn 写键实现、不经 env
  模板——实测 PROD `cluster/raw` 403、QA 200，本就符合预期。本项修的是「角色档为 ADMIN
  且连接配了 env 模板」这条路径（此前无人覆盖测试），不是产线现状的回归修复
- 前端同口径补齐（1132）：`canEndpoint` 的 `isAdmin()` 分支也不再直接 `return true`，
  改为按页前缀 → 共享读写表（raw 归 devtools/rest）判定环境封顶。否则 PROD 连接下
  DevTools 执行钮、运维入口全部亮着，点下去才 403——违反「可操作性在前端提前暴露」。
  负向自验：把共享表分支改成立即 `true` → 2 例转红、4 例防误拦保持绿
- **换号后 DevTools 仍显示上一账号的跨 Tab 历史**（1132）：`histAll` 是「全部 Tab 历史」
  的内存镜像，磁盘键 `es_devtools_hist_all:*` 已被 `purgeUserRequestState` 按
  `es_devtools_` 前缀清掉，但 `onIdentityReset` 没有重置 ref——**同一会话内换号**后，
  新用户进来仍能看到上一个账号执行过的方法/路径/请求体，直到切目标或刷新才消失。
  现在换号同时清 `histAll` 与历史作用域（回到「本 Tab」档）。注入移除该两行 → 用例转红。
- **DevTools 补两条 Kibana 键位**（1132）：`Ctrl+↑/↓`（previous/next request end）与
  `Ctrl+L`（跳到行号）。我们的每个 Tab 已是一条请求，所以上下键语义收敛为「跳到相邻请求
  的起始行」——同一心智模型下在请求之间移动，而不是逐行移动；找不到相邻请求时光标不动
  （不弹回文件头）。解析复用导入用的 `METHOD_LINE` 规则，注释行并入下一条请求不单独成点。
  `Ctrl+L` 由 Monaco 原生提供，本次只登记到快捷键面板（「有功能没人知道」防重演）。
  6 例边界跳转测试（中间/末尾/注释/首尾边界/空内容）。
- **Console Variables 补上三引号强制字符串替换**（1132，Kibana 对齐）：官方文档明确
  「Triple quotes force string substitution」——值是合法 JSON（如 `5`、`{"a":1}`）但用户
  希望它作为**字符串**注入时的唯一写法。此前只有「引号内=字符串 / 裸值=按 JSON 注入」两档，
  `{"code": """${n}"""}` 会被原样发出（含三引号），ES 直接报语法错。
  实现要点：三引号必须**先于**常规替换单独扫一遍——`replace` 回调只能改 `${}` 自身，
  没法同时吃掉外侧两个引号；内部值经 `JSON.stringify` 转义，保证产出仍是合法 JSON。
  4 例测试（数字/对象/与单引号混排/路径档不受影响）。过程中修正了自己写错的两条期望：
  含引号的值必须转义（`"{\"a\":1}"`），以及多余空格。
- **403 提示把「环境限制」说成了「账号没授权」**（1132）：`ENV_PAGE_DENIED` 与
  `PAGE_DENIED` 都带 `page` 字段，前端按 `page` 分支统一渲染成「暂无『X』页面权限，
  请联系管理员勾选」，而前者是连接的 env 模板限制——用户照提示去申请页面权限，
  申请完仍然被拒。现在单列环境文案（说明由 env 模板限制、与账号授权无关、该调模板或换环境），
  「复制申请信息」也改为「环境模板调整申请」。修的过程中还发现分支判据写错：
  事件 detail 里后端 code 映射到 `denied` 字段而非 `code`，按 `code` 判永远不成立。
  4 例行为测试（环境/页面/客户端硬门/读静默）；注入改回 `d.code` → 环境用例转红
- 审计分级补登（1132 发现）：`rebuild-empty`（删索引后重建，数据不可逆）与
  `adhoc-rebuild/confirm-switch`（写别名切换）此前只落 `WRITE`，与 `delete-index` /
  `xmigrate/start` 同危害却低一档留痕。已补入 `HIGH_RISK_AUDIT_KEYWORDS`（只影响审计标签，
  不参与授权）。注入移除该两关键词 → 2 例转红、「普通写仍落 WRITE」保持绿（防过度标记）；
  恢复后 11 例 + 页面门 71 例全绿
- `perm:scan` 通过（写调用文件 30 个，全部具备能力门）；`vue-tsc --noEmit` 零错
- 前端全量 `vitest run`：**1229 文件 / 10552 例**，其中 1 例失败来自测试运行期间别处
  正在改的 `tableKernelWave540`（陈旧排序锚点），该文件现态单跑 7 例全绿；本批新增/改动的
  5 个 spec 单跑与合跑均绿
- 前端全量 2 分片（**串行 + 代码冻结**）：**624 文件 / 5459 例** +
  **623 文件 / 5289 例全绿**，`vue-tsc --noEmit` 零错。三处已知的「非代码」假红都已定位并单跑复绿：
  ① `reindexCancel538`（挂载 2.7s 超时）、`devtoolsFileIO1128` 属 CPU 争用；
  ② `permScanSelfCheck1124` 会往 `src/views` 写探针文件并扫描整个仓库——
  **它必须独占 views 目录**，与其它并发跑的用例互斥（单跑 6 例全绿，落盘后 perm-scan 自检通过）
  ③ 运行中继续改源码会让 Vite 读到半写文件（实测 5 例假红报
  `Identifier 'stripJsonComments' has already been declared`，静态检查无重复声明）。
  结论：门禁必须**代码冻结 + 串行**再起，这也是本批采用的取数口径
- **新增 4 例源码锁并逐条负控**：① 模板根注释守卫（注入根注释 → 转红）；
  ② RT 换行断点 ≥1180（低阈值即失败）；③ 壳级 1180 档右簇贴右 + 内核 scoped
  持有同规则即失败（scopeId 打不中）；④ 窄列 `@container` 规则 + 容器锚必须挂
  `.rt-th-in`（改挂 `<th>` 或删窄档规则均转红）
- 真实浏览器（headless Chrome CDP，1440×900 / 1024×820，mock 后端）逐项验收本批改动：
  ILM 策略卡一级 5 项 + 3 个二级分组（贴父行右缘 x=549）；收藏卡一级 4 项、点「勾选此项」
  后卡片进选中态且菜单自关；远程集群卡一级 3 项、复制二级按卡片出 3/2 项；
  SQL 结果「视图 ⋯」出「表格视图」三项（聚合行/转置/语义格式化，aria-checked 正确），
  列头右键一级 4 项且**不再含**表格级开关；SQL 补全 `GROUP BY c` 首位即别名候选
  （`SELECT 别名（GROUP BY 可用）`），函数族不再倾泻；
  结果表 `thead` 高度 **44px → 26px**（单行 + 收紧内衬）；工具行 1440 下右簇
  **674px → 475px → 418px**、无溢出，1024 下自动换两行（`scrollWidth === clientWidth`，
  此前 1283 vs 756 且「快照」被裁）
- **本批逐 20px 扫描定位裁切区间**（1440/1280/1260…1080 共 14 档）：旧 1100 断点下
  1180/1160/1140/1120 四档 `overflow` 分别 1/21/41/61px 且右簇末尾钮被切；
  断点提到 1180 后四档全部 `overflow=0`、右缘间距恒 11px、15 颗钮零裁切
- **高倍截图验收（deviceScaleFactor 2–4，裁工具行/列头单元素）**：命中数从
  `1/1 · 1…` 变为完整 `1/1 · 1ms`（容器 65px = 内容 65px）；窄列 `title` 悬停从
  `t…` 变为完整 `title`（内衬 34px → 14px，`⇅` 与漏斗互不压）；QRT 工具行两颗
  原本同形的 ↗ 变为 `⇕`+`↗` 可区分
- **浮层压表实测**：视口内与结果表区域相交的 fixed/absolute 浮层 = **0 个**
  （此前画布悬停浮层 + 失败 toast 是压表来源，已分别改为就地展开 / `logOnly` 收进日志）
- **工具行右键在改版后复测**：RT 一级 `导出当前页（CSV）/ 行高：标准（点击切换）/
  快照 PNG（当前页）/ 更多…(二级)`，二级真实鼠标 hover 出 5 项，点「聚合行」菜单自关；
  QRT 一级 3 项含二级。全程 `Runtime.exceptionThrown` **0**；路由来回切换后
  工具行残留数 **0**、`nextSibling` 类卸载异常 **0**
  （顺带修掉一个真事故：`TableShell` 模板根注释使其成为 fragment 根，
  路由切走时卸载抛 `Cannot read properties of null (reading 'nextSibling')`——
  注释已移入元素内部，并加源码锁「模板第一个有效节点不得是注释」，
  用注入违规证伪过）
- 宽表逐列量测（数据浏览器 8 列）：**列内容互相重叠 = 0 处**，操作列 313px → 163px，
  索引名列回到 259px；「更多」弹层四项与 ForceMerge 二次确认在真实浏览器点通
- 新增 `clauseRowMenu1147.spec`（7 例：条件行右键一级收口/复制二级三项/结构二级/
  删除走既有 emit/停用文案翻转/输入框内不接管）；
  `rtBreakthrough235`（快照移入视图菜单）、`permGating`（BrowserView 行钮入菜单）、
  `browserIdxMenu`（操作列两钮 + 更多四项）、`qrtRowsSwap529`（ForceMerge 经更多菜单）
  的旧锚按新入口更新
- **遮挡与报错本批实测**（headless Chrome CDP，mock 后端，索引工作区 / 数据浏览器 /
  DSL 工作台三处）：1148px 窗口工具行 `overflow = 0`、按钮间重叠 **0 处**（修复前
  快滤框压「刷新」49px）；1440/1148 两档列头高均 25px、零重叠。点 `title`（text 列）：
  索引工作区与 DSL 工作台都**不再发出请求**，只出一条可行动提示；点 `status`（keyword）
  正常写入 `"sort":[{"status":{"order":"asc"}}]`。人为制造 400 后错误条压在结果表上方
  （`errBottom 331 < table.y 380`，重叠 0），文案带出分片级叶子原因，右下角无遮挡 toast，
  「收起」后表格恢复。新增 `sortField1149.spec`（7 例）、`toolbarHeaderDeclutter1150.spec`
  （7 例，含「裸选择器=假修复」反锚）；`dslSortPush804`、`tableKernelWave540`、
  `notifyActions246` 的旧锚按新实现更新
- 新增 `favCardMenu1144.spec`（5 例）、`ilmCardMenu1144.spec`（5 例）、
  `remoteClusterCardMenu1145.spec`（5 例）、`sqlAliasSuggest1145.spec`（9 例）；
  `cellMenuColMgmt` / `healthTablesGraft` / `qrtPagerExportTranspose525` 的旧锚按新入口更新
  （并修掉「两表共页时按 document 找视图钮 → 开关落到错表」的测试自身缺陷）
- 新增 `DelegateAuthFailClosed1124Test`（9 例：异常不回落/无凭证可内置登录/探测异常
  fail-closed/只实现 tokenOf 的委托被拒与异常两条路径均不回落/委托正常零干扰/
  自定义委托兜底吊销/重复吊销幂等/无令牌不登记）
- 新增 `autoRunIdentityGate1124.spec`（11 例，覆盖六个回放入口、五处只读说明条、
  DevTools 入口前置判定与安全中心拒绝提示）；`identitySwitch1008` 断言更新为整族前缀
- `perm:matrix` 增加「控制台登出 → 同一委托令牌 401」探针（真实产线跑时顺带验证自定义
  委托的兜底吊销，无需宿主改代码）；退出码改为设 `process.exitCode` 而非强退——Windows 上
  fetch keep-alive 套接字未收敛时 `process.exit(1)` 会触发 libuv 断言变成 127，CI 读错状态。
  再补**写探针**：只读连接上对不存在索引发一次 `DELETE`，必须被授权层拒绝（403）；
  授权若被绕过只会得到 ES 404，产线零副作用但能区分「拦住」与「放行」，把「只读=只测读」
  的覆盖盲区补上。
  用契约 harness 正反双验：合规部署 27/27 且 exit 0；注入「x3/只读连接写被放行」后
  9 项 FAIL、exit 1（确认脚本不会假绿）
- 后端认证范围 **15 例全绿**（含 1007 切换硬化）；前端权限相关定向 **123 例全绿**
- 前端全量 2 分片（串行避免 CPU 争用）：**605 + 604 文件 / 5055 + 4996 例全绿**，
  唯一 1 例失败是并行 lane 新增 DevTools 标签右键后失效的旧「禁止出现」锁——已按新形态
  改为锁「items + close 接线」，重跑 5/5 通过
- `perm:scan` 0 不一致（共享写 23 / 共享读 41 / 页 52 / 扫描 317 文件，回放门规则生效）；
  打包静态资产已重建并逐文件确认含新门与新说明条
- 真实浏览器双向验收（mock 身份 + Vite 热载，5210/5211）：
  · 只读身份（VIEWER，仅 overview/indices/tasks/task-tree/browser/optimizer 连接键）：
    任务管理/任务树/数据浏览器/优化向导四页均渲染只读说明条、写按钮为 0、无横向溢出；
    直接开 `#/devtools` 落到 `/forbidden?page=devtools`（无 DevTools DOM），
    Forbidden 页给出「未授予该功能页面 + 申请信息发给管理员」的说明；
    绕过前端直接 `POST /cluster/devtools/execute` 被后端 **403** 拒绝
  · 切到 ADMIN：说明条消失、工具栏恢复、DevTools「执行 Ctrl⏎」出现（带快捷键提示）；
    真实填写路径后点击执行，响应含 `took: 1`、无错误，网络日志确认请求真的发出并 **200**
  · 账号切换双向（不刷新整页，仅触发 focus/visibilitychange）：VIEWER→ADMIN 执行钮实时出现、
    提示条消失；ADMIN→VIEWER 执行钮消失、侧栏隐藏 DevTools 入口、深链被挡到 Forbidden
- 60 个视图逐个核对「写控件 × 能力门 × 拒绝说明」：所有写/运维动作的执行体首行都有门，
  只读身份不再出现静默消失的控件；DevTools 入口门与 Snapshots/Ilm 同源
- **QuoteHub 产线三账号矩阵实跑通过（139.196.51.46:7788/quotehub，34/34，exit 0）**：
  · x1：7 条连接全部 52 读；PROD 四连（国内/国际生产、es_excel_conn、es_price_conn）**0 写**，
    QA/UAT 三连（腾讯云QA、腾讯云UAT、阿里云UAT）**23 写**——与「测试可读写、生产只读」一致；
    可写连 DevTools 数据面 200 / 管理面读 403；只读连数据面读 **403**、写探针 **403**
  · 新增两条矩阵项一并转绿：根级 `_msearch` 空头 **403**、带索引前缀同类请求 **不被拒**（200/404），
    以及「x1 连接 id + x3 令牌」→ 403（连接可见性只认身份）
  · x2：ADMIN、管理面读 200；宿主登出后同一 token **401**
  · x3：grantedPages 0、连接目录 0 条、目标连接 403；控制台登出后同一委托 token **401**
- **产线写端点扫描（x3 零授权 + x1）**：12 个高危写端点（文档写删/DBQ/bulk/建删索引/raw/
  devtools/模板/painless/adhoc/xmigrate）**全部 403 或 405**，无一个 200
- **产线后端语义抽验**：根级 `POST /_msearch` 空头 → 403「每个请求必须显式指定 index（不允许全量）」，
  带索引前缀空头 → 200，与本轮单测/金标准锁定的语义一致（说明产线已含该守卫）
- **产线换号污染探针**：x1（7 连、454 授权）→ x3（0 连、0 授权）后，用 x1 的连接 id
  配 x3 的令牌请求 DevTools → **403 CONN_FORBIDDEN**（「该集群连接未授权给当前身份」），
  说明连接可见性只认当前身份，不认残留目标头
- **已发版到 QuoteHub 产线并复验**（版本 `20261026204412`，控制台显示 `v1.0.67`）：
  后端 starter 1.0.67 安装 → QuoteHub `backend/pom.xml` 从 1.0.66 升到 1.0.67 → 后端编译通过
  → `release.py --mode deploy --target all` 成功（`Started QuoteHubApplication` +
  `端点授权覆盖自检通过`）→ 发版后矩阵复跑仍 **34/34**；产线控制台 bundle 已含本轮改动
  （`es-console.pref.sql.` 生效），DevTools 请求行实测 `{26:5, 13:1}`（五控件全 26px）
- 发版注意：`py` 启动器指向不存在的 Python 3.13，须用 `python`（3.11）；且必须
  `PYTHONIOENCODING=utf-8`，否则前端构建在 GBK 下无法输出 `✓` 而失败（后端 jar 仍会先打包成功）
- **产线页面内三账号 DevTools 实测**（宿主 iframe 握手，非直接改存储）：x1 开屏自动落
  `es_excel_conn`（PROD）→ 只读提示条在、执行钮**无**；经顶栏切换器真实点选「腾讯云QA」
  → 执行钮出现、`disabled=false`、提示改为「当前为数据面写权限」。x2 同一路径直接可执行、
  无只读提示。x3 无任何连接可切，整页为授权指引（页面键 `devtools`、身份、目标、拒绝原因、
  版本、复制申请信息）。同一宿主页把宿主 token 从 x1 换成 x3：target 清空、执行钮消失、
  chip 回落「宿主集群」、localStorage 无 auth/token 残留、无 devtools 草稿残留
- 排障结论（避免误判为代码缺陷）：早期探针在多个残留标签页共享同一 `localStorage` 的浏览器里
  直接写 `es-console.target`，会被各标签页的身份清洗（`purgeIfUserChanged`，`last-user` 为空
  即视为换人）反复清空并回落到首个授权连接。关闭其余标签页、只保留单页并走真实切换器后，
  行为与后端授权完全一致——该现象是探针污染，不是跨目标污染缺陷
- **产线真实写端点矩阵（19 个 + 5 个文档写）**：x3 与 x1@PROD 均 **0 放行**（19 项里除
  `ilm/policy`、`clusters` 因方法不匹配回 405 外全为 403；文档写 5 项全 403，含
  `doc`/`doc/update` 提示「需 search/indices/doc-diff 之一」、`bulk`/`update-by-query` 提示
  具体缺哪个页面写键）；x1@QA 的 `doc`/`doc/update`/`bulk`/`delete-by-query` **200**、
  `update-by-query` **409**（索引不存在→ES 业务错，说明授权层已放行）。有权限用户不被误拦、
  无权限用户无一放行，均为绕过前端直连后端所得
- 说明：`doc-bulk` / `dbq` 并非产品端点（前端真实路径是 `cluster/bulk`、
  `cluster/delete-by-query`），探针用错路径时会命中「该写端点未登记页面归属」兜底——
  这正是未知写路径的 fail-closed 行为，不要据此当成误拦；`devtools/execute` 用对象型
  `body` 会得到 500（契约要求字符串），也属探针形状问题
- **全站 52 个页面逐页写按钮扫描（x1 只读 PROD 目标，真实宿主 iframe 渲染）**：主内容区
  可点击的写语义按钮仅 6 处，逐条点击核验后全部无写请求——收藏「导入」只合并本地白名单键、
  分词实验室「删除分词通道」是删本地对比列（`lanes.splice`）、检索模板「新建模板」只清空
  编辑器进入新建态（真正落盘由 `canOps` 把守的 `save`）、迁移与 Watcher 的「重试」只是重读、
  「运行」仅发 `POST cluster/analyze`（后端只读 POST 白名单内的分析端点）
- **同一套页面在可写 QA 上反向验证**：别名「新建别名」、模板「新建/删除」、DevTools「执行」
  均可用且 `disabled=false`——证明只读目标的「无写入口」来自授权收缩，不是全站一刀切隐藏
- **x3 零权限同套点击验证**：四个候选按钮全部不存在或已禁用，未发出任何写请求
- 逐页审计收口的四处「看得见却发不出去 / 缺解释」问题（违反第 5 条，已修）：
  · ILM 空态「在 Dev Tools 创建示例策略」写过 DevTools 的 PUT 策略草稿，此前对只读身份
    照常渲染——点了只得到一条 toast；现与 `canDevtools` 同门，无权限时不渲染动作文案并给出 hint
  · ILM 只读说明条按 `!canOps && !canMove` 判定，漏掉「策略可写、`ilm/move` 不可用」这一
    组合态，导致「重试 step」无故消失；补第二档说明，讲清缺哪一项
  · 快照「恢复」的 `openRestore` 只有模板 `v-if` 与菜单剪辑，执行体首行缺门（键盘/程序化直调
    可绕过）；补 `canOps` 首行门
  · 安全中心「重绑控制集群」是 ADMIN 专属，非 ADMIN 时整块凭空消失；现补只读说明。
    别名页同理：只有新增权限（config-validator 写键）的身份原先看不到任何说明，现说明
    切换/设写/解绑为何缺席
  · 新增 `pageEntryGating1125.spec.ts`（7 例）锁死上述四处门控与说明，`perm:scan` /
    `vue-tsc` 与相关页面既有 46 例全绿
- 并发审计第二批（检索/数据类视图）收口的五处**自动读取缺身份门**（第 7 条：换号污染）：
  · DSL 工作台「结果自动刷新」定时器此前直调 `execQuery`，绕过 `autoRunAllowed`——
    宿主换 token 的窗口里会带着旧 target 发查询；现定时器内联同一判定，不放行即跳过本拍
  · 数据浏览器深链 `?doc=` 挂载即拉原文档：补 `linkDocAllowed`，不放行则挂起并在身份落地后补跑
  · 文档 Diff 页 `onMounted` 直调 `doFetch` / `fetchCompare`（URL 可带 idx+id 直达）：同上收门
  · 检索模板页 `setup` 期裸调 `load()`：改 `loadGuarded`，未识别身份不发清单请求
  · 门式公式统一：检索模板回放门、SQL 控制台预填门补 `!auth.probeStarted`
    （缺它会在探测永不启动的宿主里把回放永久挂起；其余四个视图本就是三句式）
  · 新增 `autoReadIdentityGate1125.spec.ts`（8 例）；相关既有 24 例全绿
- 并发审计第三批（工作台/迁移/优化/漂移/索引工作台）收口的六处**挂载期读取无门**：
  索引工作台（别名清单 + 当前索引详情）、索引优化向导（挂载即扫描）、配置漂移
  （key 清单 + 分享现场）、临时重建（作业清单 + 入口裁决里的 prepare/体检采样）、
  跨集群迁移（作业清单一/二/三口 + 目标索引清单 + indexKey）、文档 Diff 与数据浏览器
  已在上一批同批修完。统一成同一三句式门（`authDisabled || !probeStarted ||
  (probed && me && canReadPage(page, target))`），未放行则挂起并在身份/目标落地后补跑一次
  ——换号窗口不再把上一账号的别名/mapping/作业行/漂移结果先拉进新界面
  · 回归扩到 **13 例**（`autoReadIdentityGate1125.spec.ts`），相关既有 38 例全绿
  · 说明：`adhoc-rebuild/prepare` 是 GET 只读端点（非写），审计初稿把它当写端点属误判；
    本次补的是「换号窗口读到旧数据」而非越权写
- 并发审计第四批（剩余 21 个视图全部扫完）——把前三批反复手写的三句式身份门抽成
  **`composables/usePageIdentityGate.ts`**（`usePageIdentityGate` / `useGatedBootRead`），
  并接入 17 个视图：分析器验证、分词实验室、Painless 沙盒、系统信息、诊断、
  拓扑、工作台、同义词、火焰图、打分解剖、匹配矩阵、Boost 调参、查询 X 光、
  排名侦探、实时大屏（含轮询 tick）、索引优化、配置漂移、临时重建、跨集群迁移、
  索引工作台、文档 Diff、数据浏览器、检索模板、DSL 工作台
  · 抽共享件的原因不是「少写几行」：同一段条件在前几批里已经漂移过两次（漏
    `!probeStarted` 会让探测永不启动的宿主里回放永久挂起），单点定义后
    这类漂移不可能再发生；门的方向（fail-closed，**不得**写成 `!probed ||`）也一并锁进单测
  · carry 回放（查询 X 光 / 排名侦探）改为「取后暂存 → 门放行才消费」，避免为了等身份把联动载荷丢掉
  · 新增 `composables/__tests__/pageIdentityGate.spec.ts`（10 例，含 fail-closed 方向与
    挂起/补跑恰好一次）+ 批次 E/F 接线断言 19 例（`autoReadIdentityGate1125.spec.ts` 共 32 例）
- **DevTools 补 Kibana 的「过滤响应」档**（对齐官方 Console 工具栏清单里唯一缺失的高频能力）：
  响应工具行新增 `JQ / 正则` 双档 + 表达式输入，只作用于展示层——原文 `cur.result` 不动，
  清空表达式即恢复完整响应；渲染的 Monaco 与「表格」视图同源读过滤结果
  · 自实现 JQ 子集求值器（`utils/jqFilter.ts`，零新增依赖）：字段/数组下标/迭代 `[]`/
    递归下降 `..`/管道 `|`/逗号多值/`select`/比较/`and·or·not`/`//` 替代/数组与对象构造/
    `length·keys·values·type·map·add·join·tostring·tonumber·contains·startswith·endswith·has`
  · **算不对就报错，不许给错值**：不支持的语法（动态键、未知函数、类型不匹配的运算）
    一律抛错，界面显式标红并把原因挂在 title 上；非 JSON 响应会提示改用正则档
  · 正则档逐行匹配（不含分隔符与 flags，与 Kibana 一致），非 JSON 响应同样可用
  · 真实浏览器验证（mock 后端）：JQ `.hits.hits[]._id` → 3 条、非法 `.hits[` → 标红
    「方括号内只支持数字下标或键名字符串」、正则「北京」→ 2 条、清除后过滤标记消失；
    1440 与 1024 两档工具行零横向溢出、行高恒 26px（搜响应框给 96px 下限，压缩预算优先
    让给可选动作）
  · 新增 `jqFilter1126.spec.ts`（62 例：求值语义 51 + 接线 6 + UI 契约 5）
- **DevTools 补 Console Variables（Kibana「Variables」对位）**——此前 `${var}` 插值只接在 DSL 页，
  REST 控制台里写 `${idx}` 会**原样发给 ES**，用户只得到难懂的语法错误：
  · 页头新增「变量」入口 + 计数徽标 + 管理弹窗（与 DSL 页共用同一 `es_vars` 表，改完全站生效）
  · 插值接进**唯一发送内核 `execSend`**，覆盖全量/分段/键盘/历史回放所有执行路径；
    放在权限与范围判定**之后**（判定看原始请求）、发车**之前**（发送用展开值）
  · 区分上下文：**路径档一律字符串替换**（`/${idx}/_search` → `/orders/_search`，绝不加引号）；
    JSON 体内 `"${var}"` 按字符串、裸 `${var}` 按类型注入
  · **未定义变量显式拦下**并列出名字（静默把 `${var}` 发出去只会换来难懂的 ES 语法错误）
  · 修正 `applyVars` 的既有缺陷：原实现无上下文感知，路径里的变量会被加引号
    （`/${idx}/_search` 变成 `/"orders"/_search`——合法但错误的路径）
  · 真实浏览器验证（mock 后端）：加变量→保存→徽标 `1`；`GET /${idx}/_search` 实际发送
    **`/orders/_search`**；`${nope}` 被拦下、提示「变量未定义：${nope}——请先在「变量」里填值」
    且请求数 **0**；历史里仍保留原文（草稿零触）
  · 新增 `vars1127.spec.ts`（21 例：插值语义/路径档/未定义检测/持久化）+ 接线性断言
  · **REST 直连页同源补接**：RestView 是同一类执行入口（`/cluster/raw`），此前同样不识别变量；
    两页现共用同一套语义与提示，避免「DevTools 能用、REST 页不能用」的认知割裂
  · 接线回归扩到 **28 例**（含「路径档必须用 pathMode」「未定义先拦后发」「判定先于展开」三条契约）
- **DevTools 补「导出 / 导入请求」（Kibana Console 同名能力）**——此前只有「从 curl 导入」与
  历史 JSON 导出，用户无法把自己的多请求脚本整份带走、也打不开同事发来的脚本文件：
  · 导出为**纯文本 .http**（方法行 + 请求体，段间空行），人可读、可改、可进版本库；
    不使用 JSON 包一层，避免注释与排版在往返中被吃掉
  · 导入按空行切段，每段成为一个 Tab，标题取段首注释（`//` 或 `#`）；
    **先确认再整份替换**（不静默覆盖用户现有 Tab），无法识别的段明确报告而非猜测成请求
  · 导出→导入**幂等**：再导出一次文本完全一致（有测试锁）
  · 真实浏览器验证：工具栏三钮并存；导入样例文件后两个 Tab 名为「集群健康」「查订单」、
    首 Tab 路径 `/_cluster/health`、次 Tab `/orders/_search`，右下提示「已导入 2 个请求」
  · 新增 `devtoolsFileIO1128.spec.ts`（25 例：往返/容错/接线）
- **审计发现并修复一处由变量功能引入的越权面**（第 2 条）：守卫判定的是「用户写的原始路径」，
  而发车用的是「变量展开后的路径」——非 ADMIN 写 `/${v}/_snapshot`、变量值含控制面段时，
  前端会放行一个越权请求（后端仍会拦，但前端不该放）。两页均补「展开前后不等则**再过一次**
  `requestInScope`」，并新增 4 条回归断言；**已做负向验证**（删掉修复后测试确实转红，恢复即绿）
- **补全前端的审计覆盖面**（此前只扫了 views，漏了 components 与 stores）：
  · 机器清点：**30 个视图/组件文件**含变更型 `api.*` 调用，逐一核对后**全部带能力门**
    （`ClusterSwitcher` 的档案增删改由 `canAdmin` 把守、`CreateIndexModal` 的执行体首行有门
    且别名挂载单独判权、`CmdPalette` 的 raw 五命令走 `canAdminOps`；stores 层无直接写调用）
  · 把这条变成常驻机械规则并入 `perm:scan`：任何 `.vue` 出现写调用而全文无能力判定即报错，
    摘要行新增「写调用文件」计数（当前 30）
  · 规则做了正反自验（`permScanSelfCheck1124.spec.ts` 扩到 6 例：注入「有写调用无门」必须报红、
    同文件补上门后必须转绿）——避免又出现「规则写了但拦不住」的假绿
- **修正一处与 Kibana 相反的键位**：`Ctrl/Cmd+I` 我们一直绑成「唤起补全」，而 Kibana 官方
  Console 键位表里 `Ctrl+I` 是 **Auto-indent**（补全由 `Ctrl+Space`/Enter/Tab 承担）——
  从 Kibana 过来的人按 Ctrl+I 想整理 JSON，却弹出候选框。现改为格式化当前请求体
  （与「发送时自动格式化」共用同一 formatter，草稿同步更新，等价用户手改），
  快捷键面板文案同步；补全保留 Monaco 默认 `Ctrl+Space`
  · 真实浏览器验证（CDP 真实按键，非合成事件）：单行
    `{"query":{"match_all":{}},"size":3}` 按 Ctrl+I 后变成 6 行缩进格式
- **修复 DevTools 换号未清理内存草稿**（第 7 条）：`App.vue` 的 `onIdentityChanged` 只清
  store/ioRecorder/模块缓存，而 DevTools 组件内的 **Tab 草稿、变量弹窗草稿、响应过滤表达式
  都是内存态**——不落盘也照样在屏幕上，换号后下一个用户点执行会带着上一个账号的路径与变量发出去。
  现监听 `es-console:identity-changed`：重建默认三标签（顺带丢掉旧响应）、变量草稿清零、
  过滤表达式清空、两个弹窗关闭并给出提示；卸载时摘除监听
  · 真实浏览器验证：造现场（路径改 `/secretA/_search`、加变量 `tok`、多开一个 Tab）
    → 派发换号事件 → Tab 4→3、路径归 `/_cluster/health`、变量徽标消失、变量弹窗关闭
  · 新增 `devtoolsIdentityReset1130.spec.ts`（4 例）
- 同批核查了**其余视图的换号现场**（RestView / ILM / 索引工作台 / 模板 / 高级 Reindex）：
  它们有内存草稿但未自己监听换号，靠 `App.vue` 的 `<component :key>` 含 `username`
  在换号时强制重挂载兜底；存储侧 `es-console.draft2:` 也已在换号清理清单内。
  这条兜底是那些视图不污染的唯一依据，故新增 2 条断言把它钉死（key 必须含
  `username` + `route.path` + `target`）
- **修复 DevTools 缺少页级可见性门**（第 5 条）：路由守卫在「身份尚未落地」窗口会放行
  （`pageAllowed` 对 `grantedPages=null` 且 `role=null` 返回 true），零授权用户因此在探测
  完成前就能进 `/devtools` 并**实际点到工具栏**（导出/导入/变量，实测 `elementFromPoint`
  命中的就是按钮本身）。后端仍会拦写请求，但「可操作性必须与授权一致」要求前端也不露。
  · 修法取**组件内门**而非路由跳转：`pageVisible = canReadPage('devtools', store.target)`，
    身份落地后自动重算——有权限的人不会被误拦（曾试过在路由守卫里直接拒，实测把
    x1（有 `conn:qa:devtools`）也挡在 /forbidden，已回滚）
  · 无读权时整页让位给授权说明（点明缺什么、去哪开通），不渲染任何工具栏
  · 真实浏览器双向验证：x3 → 无「导出」、显示拒绝说明；x1（目标 QA）→ 正常进入、
    「执行」可用且 `disabled=false`
  · 新增 `guardProbeFailClosed1131.spec.ts`（4 例）
- **写方法面补测：换动词不能绕过控制面守卫**（第 2 条）
  · 单测（`DevtoolsEscalationMatrix1004Test` 增至 11 例）：PATCH/PUT/DELETE/POST 对
    `.security`、`es_console_jobs` 一律拦（含小写 `patch` 变体）；业务索引维持放行
  · **产线实测**（139.196.51.46，3 身份 × 5 组合 = 15 项，**全部 403，零放行**）：
    x3 全部「当前身份无任何页面授权」；x1@PROD 全部「暂无该共享写端点的页面写权限」；
    最关键的是 **x1@QA（有写权限）仍拿不到**——`.security` 返回「非管理员 raw 不允许访问
    系统/校验索引」，`es_console_jobs` 返回「控制面索引不对通用数据接口开放」，
    说明控制面隔离是**独立于页面写权限**的第二道防线
  · 同时复跑产线三账号矩阵：**34/34 全绿**
- **补测「页面级授权逃生阀」关闭时的底线**（第 1 条要求覆盖所有可选加固项）：
  `es.rebuild.console.page-auth.enabled=false` 是运维逃生阀（关闭后回退纯角色档，启动期有
  WARN 留痕）。审计要确认这个回退**不会**把写端点一并放开——否则误配一次等于全站放开写。
  · 新增 4 例（`ConsoleAuthInterceptorPageAuthTest` 增至 **71 例全绿**）：
    VIEWER 写文档 → 403；VIEWER / OPERATOR 走 DevTools 透传 → 403（ADMIN 专属）；
    **ADMIN 仍可写**（有权限的人不因逃生阀被误拦）
  · 产线配置核查：QuoteHub 未设该键 → 走默认 `true`（页面级授权启用），与矩阵结果一致
- **修复一个真实越权缺陷：委派 ADMIN 可创建/删除本地账号**（第 1、2 条）
  · `forbidDelegatedLocalUserWrite` 原实现第一行 `if (role >= ADMIN) return;` 把
    「委派 ADMIN」一并放行——**产线实证** `deng_test_x2` 正是 `role=ADMIN + delegated=true
    + authSource=delegate`。它因此可以创建本地账号，在宿主授权体系之外另造一个不受宿主
    管控的全局身份（本地账号 `grantedPages=null`，走内置登录，可绕过页面门与连接写键）
  · 产线探针复现：以 x2 调 `/auth/users/upsert`（空用户名）返回的是「username 不可为空」
    而非「页面授权/委派会话不得…」——说明**凭证门已放行**，只是被参数校验偶然挡住；
    换合法用户名即建号成功
  · 修法：把「委派 / 页面模型身份」判定提到角色判定**之前**，本地账号只允许**内置**
    （非委派、无 grantedPages）ADMIN 管理
  · 新增 3 例并**加固断言**（只接受「权限拒绝」文案；越过权限门进入存储层一律判失败）。
    过程中发现旧写法是**假绿**——mock 存储抛 `IllegalState` 逃过 `catch` 被当通过；
    加固后立刻转红，证明缺陷真实存在
  · **负向验证**：回滚修复 → 测试转红（1 Failure）；恢复 → 全绿
- `examples/demo-host`（不在根 reactor 内，单独跑）：**5 例全绿**——原有开箱冒烟 1 例
  + 新增委托契约 4 例；其 starter 依赖已对齐 1.0.66 后重新编译通过

### 新增（开源接入样板）

- `examples/demo-host` 补**委托 SPI 完整参考实现** `SampleHostAuthDelegate`：四个方法
  （`authenticate` / `hasCredential` / `tokenOf` / `revoke`）全实现，含宿主角色→控制台角色
  映射（未知角色降 VIEWER，不升权）、页面授权下发、登出登记拒绝表。默认关闭
  （`demo.host-delegate.enabled=true` 才注册），开箱冒烟行为不变
- 配套 `SampleHostAuthDelegateTest`（4 例）把「最容易漏且运行时无感」的契约钉死：
  未知角色不得升权、只读/运维身份必须下发页面集而非 null、坏令牌也算「带宿主凭证」
  （必须阻断回落内置身份）、登出后同一令牌进拒绝表且不误伤他人
- demo 的 starter 依赖从 1.0.39 提到 1.0.66：旧版没有 `hasCredential`/`tokenOf`/`revoke`，
  照抄参考实现会编译失败；README 已写明版本下限与启用方式

## [1.0.60]

### 修复

- 查询工作台结果区保底升 505px（用户裁决「最小至少 10 行」——320 档在构建器
  展开时被压缩到只剩 5 行没法读，产线截图实报；470=直方图展开态下也保 10 行
  数据，直方图与分页器占用已计入预算）。构建器收起态（默认）结果区吃满视口余量 ≈20+ 行，与索引工作区
  「结果表主导」同口径。结果表本体 flex 填充无硬顶，行数随视口与档位自然扩展
- 切换集群后残留索引选择清零（产线实报「切换集群连接的时候，索引选择信息没有
  置空」——带着 A 集群的索引名查 B 集群，索引工作区与检索全部 index_not_found）：
  索引清单加载成功且已选索引不在清单=当前集群不可查（别名也在清单内），置空并
  提示重选；清单加载失败（空清单）不误清
- 切集群同时清掉按视图记忆的「上次索引」（dsl/lucene/sandbox/sql/flame 各自
  记住上一集群的索引名，切集群后视图预填旧索引名=同类 index_not_found）；
  sql 桥的会话域键一并覆盖，跨标签同步路径同清；目标未变（不触发 setTarget）
  的启动场景按索引清单校验逐键清理（通配符模式保留，加载失败不误清）
- 查询工作台「满」档语义反转为结果优先（产线实报「点满都看不到 20 条」——
  旧满档把编辑器撑满视口，结果区只剩十几行）：满档=构建区收 160px 细条
  （查询仍可微调），结果区吃满其余视口 ≈20+ 行；要写长查询点 L 档还原
- SQL 控制台响应形态不再「猜」：首查缺 `rows/values` 直接报形态异常（不当 0 行成功）；
  分页缺形态时保留 cursor 并提示可重试（实测第二页响应缺字段后重试成功），不再把
  空数组拼进结果或静默丢页
- SQL 取消后旧结果标「已过期」：取消不再让表里旧行看起来像新结果；导出 CSV/NDJSON
  的 toast 同步注明「cursor 未取完，仅导出已加载行／结果已过期，请重新执行」
- 通知 toast 改为点击穿透：分页失败提示停留期间不再挡住结果栏「下一页」等控件
  （真实浏览器实测重试点击被 toast 正文吃掉）；toast 内动作按钮（继续上次/撤销/
  复制原始）与关闭钮仍可点，完整消息回看仍走通知中心
- SQL 字段源自动跟随语句的 `FROM`：SQL 查询另一个索引时，字段补全、列名纠错建议、
  字段体检都按 `FROM` 的 mapping 匹配（实测纠错从另一索引的 `bond_code` 给出），
  不再错用顶栏选中索引；通配/逗号多表/派生表仍回落顶栏。与顶栏不一致时编辑器上方
  出现一行换源说明（含 `FROM xxx` 徽标），不做暗改
- SQL 场景模板同样绑定语句目标索引：字段角色取自 `FROM` 索引，表名也写该索引，
  不再出现「字段来自 A、表名写顶栏 B」的注定报错 SQL；缺字段提示同时给出「顶栏选择
  或改写 FROM」两条出路，绑定 toast 标注「跟随 FROM」
- SQL 旧结果过期判定补齐无 cursor 场景：改 SQL、改参数、套模板或补 LIMIT 后，表里
  上一轮的行立即标「已过期 · SQL 已修改」，不再冒充当前结果；重新执行成功即清除，
  执行期间继续改稿也会在回包时标过期
- SQL「到 DSL 页」跳转携带语句目标索引（`FROM` 优先）：DSL 页自动切到该索引执行，
  不再出现「翻译对了、却在顶栏旧索引上跑」；实测切到另一索引后跳转，顶栏与查询目标
  都随之为新索引
- DSL 历史回放还原索引现场：历史条目记录的索引会先切过去并等 mapping 到位再执行，
  不再把 A 索引的历史按顶栏 B 索引跑；保存的搜索跨索引切换同步写入本地选择
- SQL 页内历史回放切回条目记录的索引并可回填执行：顶栏、字段补全与字段体检底稿
  同步换源，并提示「已切到历史记录索引 …」；实测从 `research_report` 顶栏回放
  `bond_issuer` 的历史，执行上下文与顶栏一起变为 `bond_issuer`
- SQL 收藏保存索引与参数现场：收藏夹/命令面板打开时按原索引、原参数恢复并自动执行，
  不再落到当前顶栏索引或丢参数。查询工作台 KeepAlive 回页时也能识别 SQL/Lucene/
  沙盒/PIT 的一次性预填键并重挂对应模式（此前只认 DSL，缓存页会「点了没反应」）
- SQL 收藏同时还原执行选项：`fetch_size` / `time_zone` / `page_timeout` / 列式 /
  宽容模式随收藏恢复，回放请求体实测与收藏时一致；旧收藏仅有 `fetch_size` 也能降级还原
- SQL 切换时区即作废旧 cursor（续页日期列口径不能新旧混用），并保留已加载行标「已过期」；
  过期徽标改为说明真实原因（时区/参数/列式/取消/失败/执行期间改稿），不再一律写「SQL 已修改」
- SQL 历史记录保存并还原执行选项（`fetch_size` / `time_zone` / `page_timeout` / 列式 /
  宽容）：页内历史与跨模式抽屉回放都按当时上下文执行；同语句重跑以最近一次选项为准，
  旧历史/导入条目缺少选项时按当前设置执行
- SQL 工具行窄宽度可读性：1024 档「宽容模式/列式」不再被挤成单字竖排，右组占满剩余
  宽度并整体换行、标签保持整词；1440 单行布局零变化
- SQL 执行上下文可见：非默认时区时结果区显示时区徽标（日期列口径有据可查）；
  页内与跨模式历史行显示非默认执行选项摘要（时区/取数/超时/列式/非宽容），
  点开前就知道会以什么上下文回放
- DSL 构建器补齐高频官方参数：`term.case_insensitive`，`match` / `multi_match` /
  `query_string` 的模糊与前缀/同义词控制，`geo_shape` / `shape` 的
  `relation` / `orientation` / `ignore_unmapped`；参数在「+键名」建议中可发现并带正确控件
- 修复构建器新增数值/布尔 schema 参数的类型：此前「+键名」添加的 `prefix_length` 等
  落成字符串、布尔落成空串；现数值用数字控件（DSL 输出数字），布尔显式 `false`
- `nested` / `has_child` / `has_parent` 参数支持 `inner_hits`：参数建议中可直接添加，
  JSON 文本位保留数字/布尔类型（实测 `{"size":5}` 输出数字 5），非法中间态只标红不写树；
  GenericParams 同步新增通用 `json` 参数类型
- SQL 数组字段报错自救：宽容模式关闭时命中 `Arrays are not supported`，错误面板直接给
  「开启宽容模式并重试」——自动开 `field_multi_value_leniency` 并重跑，不必改 SQL 或
  自己找开关；实测点击后改走 `/sql/lenient` 并成功返回
- 继续铺开 JSON 参数面：`knn.filter`（向量近邻的布尔过滤）与 `collapse.inner_hits`
  （折叠时返回代表文档）/ `max_concurrent_group_searches` 可在参数建议中直接添加，
  复用 JSON 文本位保留数字/布尔类型
- DSL 索引不存在一键纠错：错误面板从 `no such index` / `Unknown index` 提取索引并给出
  相近索引 chips，点击切换顶栏索引并自动重试；索引名纠错抽为通用工具（SQL 面板同源）
- DSL 保存的搜索跨索引回放与历史回放统一：先切索引、等 mapping 到位再执行（修复保存
  回放首查直方图猜不到字段），提示按来源区分「保存时 / 历史记录」
- DSL 全文本参数继续补齐：`more_like_this` 的文档频率/词长/停用词、`simple_query_string`
  的通配与模糊档、`match_bool_prefix` 模糊档、`combined_fields` 同义词开关；均可发现
  并带正确控件（实测 `max_doc_freq` 输出数字 5）
- DSL 加排序默认字段按「可排序 + 时间优先」选择：不再取字典序第一个字段（text 会直接
  fielddata 报错），有 date 时优先时间词根字段并默认 desc（实测 bond_issuer 落 publish_date）
- SQL 常用模板在列表中直接显示自动绑定字段（如「最近 7 天 · publish_time」），点击前
  即可确认会用到哪个 mapping 字段，不再只能点完看 toast
- SQL nested 字段硬限制不再留死胡同：错误面板识别 `Nested fields not supported`，
  给「去 Lucene 面板 / 去 PIT 分页」两个真正能完成查询的通道入口（保留其余 URL 现场）
- SQL 函数补全覆盖时间/分桶/常用标量：`NOW()`、`CURRENT_DATE`、`DATE_ADD`/`DATE_DIFF`/
  `DATE_PART`、`DAY_OF_WEEK`/`WEEK_OF_YEAR`/时分秒、`HISTOGRAM` 等；零参函数直接落
  完整调用，选中即用（实测输入 `N` 出现 `NOW()` 候选）
- DSL 工具行 1024 档不再裁切：左组允许换行，「新文档 / 在构建器中打开 / DSL→Lucene /
  索引工作区」全部可达（实测无 clipped、页面无横向溢出）；1440 单行锁定不变
- SQL `SELECT *` 一键展开为字段清单（按当前 mapping，去 `.keyword` 子域、上限 60、
  双引号转义、不伪造字段）；提示条在字段源就绪时出现，展开后即时标注结果已过期
- DSL 深分页预检：`from+size > 10000` 本地拦截并给「去 PIT 分页」，自动把当前 query
  与简单字段排序接力到 PIT；分页输入框在被拒后回显真实页（不再残留 501/1000）
- SQL 结果列类型直连表格：`_sql` 返回的列类型显式传给结果表（列头类型徽标、数值对齐、
  date 本地化不再只靠值采样；全 null/混合列也有类型），聚合表达式列仍排除
- SQL 报错一键定位到行列：解析 ES 错误里的 `line X:Y` 锚点，错误面板标题出现「定位 X:Y」
  chip，点击把编辑器滚到该处并落光标（真实浏览器实测光标 0→3 行，落点即第 4 行），
  同时对应行标红；静态体检的「第 N 行」也变成可点跳转（实测 0→2 行）。长 SQL/多行
  查询不必自己数行
- SQL 错误位置只对失败时那一版 SQL 有效：改稿后定位 chip 与红线立即撤下，面板保留全文
  并标「错误来自上一版 SQL」，不再用旧行号指认当前稿（实测改稿后红线 1→0、chip 消失）
- SQL 函数面按官方目录补齐（数学/字符串/日期/条件/转换 + 分布聚合）：`CBRT`/`LOG10`/
  `SQRT`/`TRUNCATE`、`LENGTH`/`CONCAT`/`TRIM`/`POSITION`/`UCASE`、`CURRENT_TIMESTAMP`/
  `DATE_PARSE`/`QUARTER`/`DAY_NAME`/`ISO_WEEK_OF_YEAR`、`IFNULL`/`GREATEST`/`NULLIF`、
  `PERCENTILE`/`STDDEV_POP` 等可直接补全；零参函数（`PI()`/`RANDOM()`/`TODAY`/
  `CURRENT_TIMESTAMP`）落完整调用。已敲前缀命中字段前缀时字段仍占第一屏，不并列倾泻函数
  （`SELECT o` 行为不变，真实浏览器实测 `DATE_TR` 出 `DATE_TRUNC(`）
- SQL 未知函数一键纠错：`Unknown function [DATE_TRUNCC]` / `Scalar function [...]` 错误给出
  相近函数 chips（编辑距离 top-3），点击按词边界替换（实测真实鼠标点击后 SQL 变为
  `DATE_TRUNC`，重试返回结果）；改稿后面板标「错误来自上一版 SQL」，不把旧函数名当当前错误
- SQL 报错定位兼容 JSON 串化形态：错误 reason 里的换行常以字面 `\n` 出现在错误全文里，
  `line 1:8` 此前漏判；现在「定位 1:8」照常出现（真实浏览器实测），`deadline`/`online`
  词尾仍不误判
- 语法桥页与 SQL 控制台同口径自救：试跑失败条出现「定位 1:8」、未知函数相近 chips、
  改稿后标「错误来自上一版 SQL」；静态体检行号可点跳转。实测真实点击修正
  `DATE_TRUNCC → DATE_TRUNC` 后再次试跑返回 1 行 × 1 列，成功回包即清错误红线
- DSL 运行时 unknown-field 一键改名：查询报 `No field found for [titl]` 时，错误面板按
  mapping 给出相近字段 top-3（编辑距离），点「改为 title」只改出错条件的字段并重试；
  实测真实点击后 DSL 从 `"titl"` 变为 `"title"`、重试返回命中。sort/agg 类错误不误指，
  条件树未同步时不暗改
- 构建器未知字段黄点不再溢出：8px 提示圆点内原带可见「字段不在 mapping」文案，在窄行里
  逐字竖排压住算子/值行；现语义只走 title/aria-label、圆点保持 8px（真实浏览器 1440 复核，
  竖排残字消失）
- 构建区默认收起（用户裁决）时点 S/M/L/满 不再「无反馈」：档位点击同时展开构建区并应用
  该高度（实测 `.dq-main` 0×0 → 1184×532、编辑器可见且 L 档激活）；不点仍维持默认收起
- DSL 错误锚点只对失败时那一版 DSL 有效：改稿后「定位条件 / 停用该条件 / 改为 title」立即
  撤下，面板保留错误全文并标「错误来自上一版 DSL」，不再用旧字段/旧条件指认当前稿
  （真实浏览器实测：插入空格后 chips/定位消失、上一版标记出现、错误全文仍在）
- DSL 稀疏子句纳入字段体检：`regexp` / `match_phrase_prefix` / `match_bool_prefix` /
  `span_term` / `text_expansion` / `weighted_tokens` / `shape` / `geo_shape` / `geo_grid` /
  `terms_set` 的字段键，以及 `rank_feature` / `distance_feature` / `percolate` / `semantic` /
  `sparse_vector` / `bitmap_terms` 的值位 `field`，写错字段会给最近字段提示（实测
  `regexp.titl` 在编辑器出现 hint 下划线）；`span_term.boost`、`terms_set.minimum_should_match_*`、
  `regexp.flags` 等参数键不误判
- DSL 稀疏子句补字段类型体检：`rank_feature` 只接受 rank_feature(s)、`distance_feature`
  只接受 date/date_nanos/geo_point、`percolate` 只接受 percolator、`sparse_vector` 只接受
  sparse_vector、`regexp` 只接受 keyword/text/wildcard、`match_phrase_prefix`/
  `match_bool_prefix` 只接受 text/keyword；类型明确不符给 warning（实测 `rank_feature`
  打 `title` 出现警告下划线），不确定组合（terms_set 等）不判
- `rank_feature` 不再被误判「未填值」：boost 是可选主值，字段本身即完整查询；主值占位改为
  「boost（可选，默认 1）」，`distance_feature` 显示 pivot 提示、`bitmap_terms` 显示位图值
  提示（实测未填值徽标消失、占位文案正确）
- `terms_set` 结构化修正：官方体是「字段键持词项数组 + `minimum_should_match_field`/
  `minimum_should_match_script` 与字段同层」——此前带 msm 的合法 DSL 整条落 raw、新建条件
  会把 msm 写进字段对象（ES 400）。现解析为字段 + 数组 + 兄弟参数，构建器用 chips 编词项、
  msm 走参数面板（实测 chips=es/search、参数表含 msm、DSL 原样保持）
- 换算子不再携带旧算子参数：match 的 operator/fuzziness 切到 term 会写出非法体（ES 400）；
  现按新算子参数 schema + `_name` 白名单保留，实测 match→term 后 DSL 仅剩 value，
  旧参数零残留
- `distance_feature` 新建/切换即可跑：origin 默认 `now`、pivot 默认 `7d`，字段沿用当前字段，
  origin 可在参数表修改（实测切换后 DSL 为 `pivot:7d / origin:now / field:title`）
- SQL 结果窗口超限就地自救：`Result window is too large … [10000]` 时错误面板给
  「去掉 OFFSET 用 cursor」/「把 LIMIT 降到 10000」；点击改写失败那一版 SQL 并重跑
  （实测 `LIMIT 10 OFFSET 20000` 改为 `LIMIT 10` 后返回结果，并提示从首行用「下一页」
  cursor 深入）；改稿后旧自救不再出现
- SQL 失败语句也入历史：条目带索引/参数/执行选项与 `ok=false` + 错误摘要，历史行红点
  tooltip 直接显示失败原因；刷新后失败标记不再丢（加载归一此前把 `ok` 丢掉），同语句
  重跑成功自动清掉错误。实测 `Unknown column` 失败后去掉预填刷新，历史仍显示红点与原因
- 语法桥历史回放补齐现场：跟随历史索引切换、历史行显示执行选项摘要；带位置参数/非默认
  选项的条目只回填不自动试跑（语法桥试跑只发送 `{query}`，避免用不同时区或无参数跑出
  「回放结果」），并明确提示回 SQL 控制台回放。实测切到 research_report、无 `/sql` 请求、
  不产生结果条
- 稀疏算子字段选择器类型修正：`rank_feature` 候选含 rank_features、`distance_feature` 含
  geo_point（此前合法字段被类型过滤隐藏）；`percolate`/`semantic`/`text_expansion`/
  `weighted_tokens` 只列 percolator / semantic_text / text+sparse_vector / sparse_vector 字段
- 字段输入与算子切换解耦：此前每敲一个字符（半截字段 type 未知）都会把已选算子静默降成
  exists；现在输入只改字段名，只有从候选下拉明确选中 mapping 字段才按类型智能换算子。
  实测 rank_feature 输入 `rank` 时算子保持、候选只列 rank_features/rank_score；
  distance_feature→rank_feature 的 pivot 字符串同时回落 boost=1
- SQL→DSL 预览绑定生成时的 SQL 快照：改稿后标题标「预览来自上一版 SQL」、正文降透明，
  「到 DSL 页 / 复制」禁用（避免带着旧 FROM/旧索引跳转或复制）；点顶部「转 DSL」重新生成
  即恢复。实测改稿后两钮 disabled、预览 dim，重转后 stale 标记消失、跳转恢复
- SQL 结果单元格下钻：右键「以此值筛选并重查」——简单 SELECT 自动追加 `WHERE`/`AND`
  条件并重查（字符串转义、NULL→`IS NULL`、ORDER BY/LIMIT/分号原样保留；
  GROUP BY/JOIN/UNION/派生表不猜，降级为复制条件）。实测 SQL 变为
  `… WHERE "title" = '第一页结果' LIMIT 5` 并自动重跑
- 修复「程序化改稿 + 立即重跑」的过期竞态：成功回包按快照重算 stale，下钻/窗口自救
  重跑后的新结果不再被误标「已过期」（实测下钻重跑后无过期标记）
- 结果表本地筛选与查询下钻语义分开：单元格菜单改为「仅筛选当前结果（不改查询）」与
  「加入查询条件并重查（改 SQL）」；无偏好工具行的 SQL 结果表新增筛选态条
  （已筛选 N 列 · M/K 行 + AND/OR + 清除，tooltip 说明仅前端不改查询）。
  实测本地筛选后 SQL 文本不变、提示条出现；下钻仍改写 WHERE

### 新增

- SQL 控制台支持「只跑选中片段」：编辑器里选中若干行后执行按钮变「执行选段」，
  Ctrl+Enter 只发送选段（客户端尾分号不发送），整篇原文不动；请求体、历史、
  转 DSL、结果来源徽标都绑定选段及其 FROM，报错 `line X:Y` 按选区锚点换算回
  全文坐标；选段结果下钻不猜整篇（还有别的语句时降级复制条件）。
  实测两条语句并排时只选第二条执行，返回选段结果，编辑器全文保持两条不变
- SQL 控制台多语句稿支持「按光标语句执行」：稿内有多个顶层语句时执行按钮变
  「执行当前语句」，按钮原因标注第 N 条 / 共 M 条，Ctrl+Enter 只发送光标所在
  那一条（引号/注释内的分号不误切）；显式选区优先，单语句稿仍按整篇（零变化）。
  转 DSL 同源；结果来源标「语句 · 仅执行当前语句」，报错行列按语句锚点换算回
  全文。实测两条并排时光标分别落在第 1/2 条只返回对应结果，编辑器全文不动
- SQL 就地建议与纠错跟随当前段：展开 `SELECT *`、补 LIMIT、列/索引/函数纠错、
  结果窗口自救只改「选区或光标所在语句」，其他语句原文不动（多语句稿不再因另一条
  已有 LIMIT 而漏提示，也不会把 LIMIT 加到另一条尾部）；改稿后旧错误的纠错建议
  同步撤下。实测两条语句时只给第 1 条补 LIMIT/展开字段，第 2 条 LIMIT/WHERE 原样
- 原始 DSL 编辑器补全目录与算子注册表全量对齐（此前 query 键位只有 8 个常用算子）：
  现可选 63 类（term/全文/geo/join/复合容器/span/向量/语义/规则/模板等），每类带
  官方体骨架与字段/值占位，高频算子保持首屏顺序；稀缺算子不再盲打。实测输入
  `"rank_feature` / `"span_near` / `"knn` 均出对应骨架，接受后仍是合法 JSON
- SQL 结果表新增查询级排序：单元格菜单「按此列升序/降序并重查（改 SQL）」——改写
  顶层 ORDER BY（已有则替换；没有则插在 LIMIT/FETCH/; 之前）并自动重跑，与表头
  本地排序明确分开；UNION/派生表/不安全列名不改写，降级复制排序子句；选段/光标
  语句的局部结果同样不猜整篇。实测连续点升/降序只保留一个 ORDER BY，LIMIT 原位保留
- 原始 DSL 补全的 63 个算子候选补中文语义（全文匹配 / 精确匹配 / 近邻跨度 /
  向量近邻 / 排序特征…），不再只有英文键；悬停或方向键选中时直接显示对应说明
- SQL 结果表头点击语义讲清：SQL 宿主下表头提示「点击本地排序（不改 SQL）」；
  右键列头新增「按此列升/降序并重查（改 SQL）」，与本地升/降序同菜单分组。
  实测列头菜单点降序后 SQL 变 `ORDER BY "title" DESC` 并自动重跑
- 局部执行的 SQL 结果下钻/排序不再一律降级复制：选段/光标语句的结果在稿未改时
  只改写执行过的那条语句并强制重跑它（追加条件与 ORDER BY 均原位），其他语句
  原文不动；稿已改/UNION/派生表/不安全列名才回退复制。实测两条语句并排只跑
  第 2 条后下钻/排序，第 1 条完全不变，第 2 条自动重查
- 表格首行减法（DBX/DBeaver 式数据网格）：列头恢复单行 25px（原双层 41px），
  类型收进 title/列详情；排序 ⇅ 与筛选漏斗改为悬停/聚焦/生效时出现且绝对定位于
  列右侧，不再占列宽（8 列宽表 1262→1150px，1440 下不用横滚）；长列名 220px 截断；
  结果工具行原始 IO/高度档改图标钮，无 cursor 时不渲染两个禁用翻页钮。
  实测表头 41→25px，结果表头上移 113px
- 列宽拖拽对 SQL 结果表可用（无 storageKey 走内存态、不落盘）：首次拖拽固化当前
  列宽并按内容宽展开，拖多少宽多少（横向滚动），双击柄自适应内容。实测 title
  285→405px，表宽随之扩展
- SQL 结果列管理（内存态）：列头右键可隐藏/置首/重置列序/适应内容，列名拖拽重排
  同样生效；隐藏后出现「已隐藏 N 列 · 恢复全部列」提示条。全部不落盘，新查询回到
  全列；隐藏列上的本地筛选同步清除。实测隐藏 issuer_name 后提示出现、恢复后 8 列
  全回，localStorage 零写入
- SQL 结果工具行新增行高档位（紧凑/标准/宽松）：无偏好工具行的 SQL 结果也能切换，
  走全局 `es_tbl_rowh` 记忆（与 RT/QRT 同源）。实测行高 26→42→22px，跨表一致
- 原始 DSL 根键补全补齐树已支持的结构化顶层键：post_filter / knn / collapse /
  rescore / retriever / suggest / script_fields / runtime_mappings / search_after /
  min_score（各带官方骨架，前八键顺序不变）；post_filter 与顶层 knn.filter 内部
  也识别为查询位。实测根键列表出 10 个新键，post_filter 内出 match/term 等候选
- SQL 结果优先布局：DSL 预览自动生成但默认折叠为头部（手动「转 DSL」才展开，
  头部可随时展开/收起/到 DSL/复制），编辑器高 42vh→34vh；1024 单栏时模板侧栏
  排到结果区之后。实测结果表头位置：1440 794→605px，1024 1140→672px
- SQL 值位补全支持否定谓词（`col NOT IN (...)` / `NOT LIKE` / `NOT BETWEEN`）：
  此前 `NOT` 被当作列名左扫，类型分派必落空——否定写法一律零候选。现主正则前置
  可选 `NOT`、IN 列表第 2+ 项支路统一剥尾，列名还原到真实字段后与正向候选/格式档
  完全一致（keyword 走 terms、date 走 date-math、数值 BETWEEN 出区间形态）；
  正向写法零漂移，未知列仍零候选
- SQL 结果表与查询/索引工作台共用同一套表格内核（不再各写一份）：结果工具行并入
  表格 `tableBar` 内存态——计数/搜索/导出▾（CSV/XLSX/JSON/PNG/MD/NDJSON）/
  视图⋯（行高三档+重置列宽）/列选/布局方案/放大 全部走共享组件；列宽、冻结、
  列隐藏/置首/适应内容在 SQL 结果上同样可用（内存态不落盘，与既有 1137 语义一致）。
  宿主手写 CSV/NDJSON 导出退役，导出注脚（cursor 未取完/结果过期）经内核统一出口。
  实测 SQL 结果工具行由两行降为单行 36px，表头 21px，结果表顶 604px
- 表格右键菜单分层（用户实报「右键跟首行一样太多功能平铺」）：一级只留「复制值 /
  查看完整值」两项，其余按心智收进「复制… / 行操作… / 筛选与排序… / 列与导出…」
  四个二级分组（RT/QRT 同语言，能力零删除）；二级跟随父行右缘，右/下溢出自动翻转，
  → 开二级、← 关二级、Esc 先关二级再关整菜单。实测一级 6 项、二级列管理 5 项
- 列头右键同款分层：17 项平铺收成「列详情 + 排序与筛选… / 复制… / 列与视图…」，
  二级面板常驻 DOM 仅切换显隐（悬停零重挂载、键盘与读屏同刻可达）。实测列头一级 4 项、
  3 个二级分组，列管理二级 5 项、列与视图二级 10 项
- 用户菜单健壮性：委托身份缺 `role`/`username` 字段时页面整屏白屏（`toLowerCase`
  读 undefined）——改为统一出口按 VIEWER 档渲染，昵称缺省显示「未命名身份」
- Dev Tools 请求标签补右键（此前只能逐点 × 关闭）：切到此标签 / 重命名 / 复制…
  （标签名·路径·该标签 cURL）/ 关闭…（当前·其他 N 个·全部 N 个，批量关闭一次落盘）。
  实测一级 4 项、关闭二级 3 项（关闭其他 2 个 / 关闭全部 3 个）
- SQL 补全新增 `CASE WHEN` 骨架（ES-SQL 官方支持，可作 GROUP BY 自定义分桶键）：
  SELECT / WHERE / GROUP BY / HAVING / ORDER BY 五个词位敲 `ca` 即出多行骨架
  （WHEN/THEN/ELSE/END 占位符可跳转）；空前缀位仍先给字段不抢首屏。
  实测编辑器直接落 `SELECT CASE … END`
- DSL 往返巡检（注册表驱动，替代手写语料抽样）：遍历 OPS_META 62 个算子 +
  9 个包装容器 + 7 个多查询容器 + 全部已注册参数，逐项断言
  parse→serialize 深等往返（234 项）；另锁 22 种生产中最常见的真实写法
  （terms lookup、function_score 无 query、span_near、intervals、geo_distance、
  knn、pinned、bool 混合 occurs…）。巡检同时锁「标签表无孤儿算子」
- 右键能力补齐到此前没有入口的列表：索引工作区索引列表行（选中/复制索引名/
  打开分页…六个 tab/到查询工作台·数据浏览器·别名管理）、查询历史行（回放/填入/
  复制为 curl + 复制…/更多操作…两组）、搜索模板行（载入编辑器/复制…/更多操作…，
  删除仍走二次确认）。实测索引行 4 项一级 + 分页二级 6 项，历史行 3 项一级，
  模板行 3 项一级
- 收藏卡片补右键（此前只能逐点右侧三个钮）：打开（标签直接写去向：查询工作台 ·
  DSL / Dev Tools / REST…）+ 复制…/选择…/删除… 三组二级，批量删除与「勾选当前 N 条」
  只在真有其它选中项时出现；删除仍走原二次确认，卡片常驻钮保持原样能力零删除
- ILM 策略卡补右键：查看相位时间线 / 查看策略 JSON / 复制…（策略名·策略体）/
  生命周期解释…（当前索引·到 Dev Tools）；「策略写操作…」二级只在有写权限时出现，
  编辑/删除仍走原入口与 guardText 二次确认。实测一级 5 项、三个二级分组
- 远程集群卡补右键：跨集群查询（带 `别名:*`）+ 复制…（别名·种子地址·整卡 JSON）/
  去查看…（Dev Tools 的 cluster.settings·查询工作台沙盒）。种子项按数据出没——
  代理模式的集群没有 seeds 就不出该项。实测一级 3 项、复制二级按卡片出 2~3 项
- SQL 补全支持 SELECT 输出别名（ES-SQL 官方：GROUP BY 可写 alias、ORDER BY 可写
  output column、HAVING 示例即用别名）：`SELECT status AS s, COUNT(*) AS c … GROUP BY c`
  里敲 `c` 直接出别名候选（detail 标「SELECT 别名（GROUP BY 可用）」）。显式 AS 与
  隐式 `ts d` 两种写法都解析，括号/引号内逗号不切分，`… END` / `INTERVAL 1 DAY` 不当别名；
  WHERE 位不出别名（该处写别名 ES-SQL 直接报错）。别名前缀命中时不再并列倾泻
  CBRT/CTAN 一大屏函数
- 查询构建器条件行补右键（此前行尾 7 个 22px 图标钮，窄栏逐个点准成本高，且「复制为
  DSL 片段 / 条件 JSON」根本没有入口）：一级给「停用切换 + 参数 + 复制… + 结构… + 删除」，
  复制二级给「条件 JSON / DSL 片段 / 子树」，结构二级给「复制条件 / 包成 bool 组」；
  标题写明「条件 · 算子 · 字段」。值输入框内的右键不接管（原生复制粘贴仍归输入框），
  写动作全部复用既有 emit / TREE_BUS，不新增通道
- 查询工作台结果工具行减负：1024 档下工具行原本要挤进 1283px（视口只有 756px），
  「快照」被裁掉半个。现在把「导出本页 JSON / 全量导出（PIT）/ 按查询删除」三个低频
  宽钮收进工具行「更多 ⋯」菜单（每项带一句用途说明），右簇宽度 674px → 475px；
  1024 及以下工具行自动换行成两行（宽档仍单行），全部钮可达、无裁切、无横向溢出
- 结果表列头改单行（QRT 1136 的口径补齐到 RT）：类型徽标不再独占第二行。
  实测 1440 下 `thead` 44px → **26px**，表头不再虚高
- 列头静息态只留列名（用户实报「表头第一行还是太多元素平铺，互相遮挡」）：类型徽标与
  未排序 ⇅ 改为悬停/聚焦才出现、已排序箭头常亮；列名占满列宽并按字符截断。
  实测宽表逐列量测 **overlaps = 0**（此前 `source_id ⇅ long` 会压到相邻列名上），
  类型全称仍可从列头 title / 列详情读到
- 结果表工具行再减两处常驻：① 窄档（≤1100px）工具钮只显示图标（文案进 title/aria，
  宽度让给结果区）；② 表格快照 PNG 从工具行移进「视图 ⋯」菜单（低频分享动作），
  工具行右簇 475px → **418px**，1024 下换行两行但不再裁切任何钮
- 查询报错不再只说「all shards failed」（截图里详情只有一句 DSL 语法或字段类型不匹配）：
  `friendlyEsError` 取原因时沿 `root_cause[]` 与 `caused_by` 链继续下潜，跳过
  「all shards failed」这类包装词，带出真正的叶子原因（如
  `Cannot search on field [status] since it is not indexed.`）；连叶子都没有时
  兜底文案补一句「展开原始 IO 可看分片级原因」，不再让人无从下手
- 数据浏览器「操作」列行内按钮收敛（用户实报「表格罗列的元素太多在平铺」）：原本每行
  5 颗图标钮把操作列撑到 313px，索引名列被挤到截断；现在常驻只剩「打开工作区 + 更多」，
  DSL 查询 / Mapping / ForceMerge / 删除索引 收进「更多」弹层（逐项带图标，删除仍 danger
  且二次确认）。实测操作列 **313px → 163px**，索引名列回到 259px，列间重叠 0；
  同时修掉末列注入钮换行（「复制行信息」原被挤到第二行、把整行撑高一倍）——
  行高回到 **32px**、四个行尾钮同排
- 表格级视图开关归位：聚合行 / 转置视图 / 语义格式化原先混在列头右键「列与视图…」里
  （这三个作用于整张表，不属于某一列，列头菜单里出现就是心智错位）。现统一收进工具行
  「视图 ⋯」的「表格视图」分节，与行高/列宽同处一口径；没有工具行的内存态通道
  （诊断表、SQL 无偏好结果表等）在表体左上给出同一组开关的悬浮「视图」钮，
  归位不等于能力消失。转置仍只对 rows 型出现（hit 型转置无语义）

## [1.0.59]（未发布）

> 权限加固续批（1046）：在 1.0.58 的页面/连接授权基础上，补齐「凭据类资源」与
> 「模板/脚本/系统临时索引」的旁路，并把账号切换的工作现场清理扩到模块级缓存。

### 安全

- **PIT 归属覆盖两种旁路形态**：`GET /{index}/_search?source={"pit":...}` 的 `source`
  与 body 同权、`DELETE /_pit` 的 id 在根级（不是 `pit.id`）——旧实现只解析 body 里的
  `pit.id`，导致他人可借 source 续读、或关闭别人（含 ADMIN）的 PIT。现 `source`/根级 `id`
  都过 `PitOwnership`，关闭时同步释放登记
- **SQL cursor 归属绑定**（`SqlCursorOwnership`，与 PIT 同一 IDOR 类）：cursor 即结果集
  凭据，页面端点与 raw `_sql` 的开启/续页/关闭都必须同人（ADMIN 可应急接管）；cursor
  轮换时登记新 id 并释放旧 id。此前持 search/workspace 读键即可拿别人 cursor 翻页
- **嵌套 legacy template 控制面旁路**：`query.template.inline` 等 Mustache 字符串解析失败时
  旧实现只对根级 fail-closed，嵌套形态可把 `{{#x}}.security{{/x}}` 渲染成 terms lookup /
  wrapper 指向控制面。现任意深度模板串都做去标签后的字面扫描（含拆词拼接）并拒绝分隔符切换；
  正常含 `{{q}}` 的业务模板不误杀
- **校验器临时索引前缀不再对通用写通道豁免**：`es_console_validate_*` 曾让任意持
  create-index/doc 写键的人创建非 ADMIN 不可见的控制面命名索引。现通用 `guardIndexName`
  一律按控制面拒绝，校验器改走 `createValidatorTempIndex/deleteValidatorTempIndex` 专用通道
- **已存脚本覆盖写同口径收口**：put 原先只看新 body（mustache 即放行），搜索模板页可覆盖
  ADMIN 的 painless 脚本。现在目标 id 已存在且非 mustache 时，put 与 delete 一样要求
  painless-lab 页写权
- **委托部署关闭内置登录后存量 token 立即失效**：内置 token 的 `grantedPages=null` 会整体
  关闭页面门；宿主撤销会话后浏览器残留的旧 token 不能经回落通道继续生效
- **`host-cluster-visible=false` 覆盖宿主专属 provider**：`/cluster/inspect|query|force-merge`、
  `rebuild-empty`、`replicas` 等恒定执行在宿主的端点，此前只有数据面拦截器检查宿主可见性，
  残留 `conn:host` 页键可绕过；现非 ADMIN 在宿主隐藏时按 `HOST_DISABLED` 拒绝（自举端点仍放行）
- **`search-raw` 不再授予 aliases 页文档读**：别名页只做元数据管理，不应凭页键读取业务文档原文
- **控制器主动拒绝的状态码不再被兜底拉平成 500**：`ResponseStatusException`（PIT/SQL cursor
  归属、作业归属等）现保留其 403 等业务状态码，错误体只回 reason 文案（此前前端会把
  「无权限」误判为服务端故障并重试）
- **方法/媒体类型不匹配还原为 405/415（1048）**：Spring 找不到匹配 handler 时拦截器不执行，
  宿主全局包装会把 405 变成 HTTP 200 + `code:500`。新增仅作用于 `/internal/es/**` 的
  `InternalEsMethodNotAllowedResolver`：405 带 `Allow`，415 带明确文案；没有 handler
  即没有业务动作执行，授权边界不变
- **DevTools/REST 通配目标前置提示（1048）**：通配/日期数学/跨集群目标由后端解析真实索引，
  前端不预拒合法 `logs-*`，但在执行钮 tooltip 提前说明「命中控制面会被拒绝」
- **宿主登出/跨标签换人立即清工作现场（1050）**：host token 变空时此前只 invalidate 身份，
  旧账号草稿/目标/词项仍留在 localStorage 直到下一次登录。现空 token 分支立即
  `purgeLocalUserState()`（工作现场键 + `last-user` + ioRecorder + identity-changed）并回到
  登录态；宿主 auth store 监听 persist key 的 storage 事件，跨标签换人/登出同步 token、
  重拉档案，iframe 收到新 token 或空 token 后立即失效旧身份
- **页面契约漂移启动期 fail-fast（1050）**：QuoteHub `LinkMenuProvisioner` 启动时校验
  starter 契约 key 集 == 宿主 PAGES key 集，缺页/多页直接拒绝启动，杜绝新页面在宿主
  静默无菜单（非 ADMIN 永远授不到、ADMIN 绕过掩盖）
- **管理面只读元数据补拒绝**：`_logstash` / `_connector` / `_synonyms` / `_query_rules` /
  `_autoscaling` / `_searchable_snapshots` 可带出管道凭据、连接器密钥与容量信息，
  非 ADMIN raw 与 DevTools 前端镜像同步拒绝
- 读者可写面复核：`_render/template` 的已存模板 id、`_msearch` 的字符串 `indices`、
  SQL `FROM a, b` 逗号列表、检索 body 的 terms/wrapper/MLT/indices_boost 目标，前端
  `devtoolsScope` 全部与后端同口径预检（金标准新增 14 条向量，50+ 条双向断言）
- **选主/拓扑读面补漏（1007 复核）**：`/_cluster/voting_config_exclusions` 此前因拒绝清单按
  段边界匹配（`/_cluster/voting` 匹配不到下划线续词）仍可被非 ADMIN raw 读出节点 id/name；
  现按精确端点拒绝。同时把索引级 `_search_shards`（自带 `transport_address`）、`_cat/master`、
  按 id 取回异步结果、`_sql` 具名子路由、PIT/scroll `keep_alive` 上限、`_cat` 投影缺失
  写进前后端共读金标准（+13 向量），改守卫时两侧同时红
- **账号切换污染二次收口（1008）**：查询工作台新增的现场键 `es-console.pref.sql.params`
  （SQL 位置参数原文）、`es-console.pref.dq.req.*`（routing/preference）、`ss_dsl_body`
  （沙盒 body）、`es-console.live.*` 纳入换人清理；内置登出也立即清盘并清连接 env 映射。
  模块级 ref 同步归零：子树剪贴、字段检索上下文、SQL 补全单例、命令面板「最近使用」、
  监控作业数曲线（且换号不再恢复旧快照）。词项/字段/别名缓存加**换号代际**：清理后在飞
  请求不得再写回（否则新账号零网络命中上一账号读出的邮箱/ID）。深链/预填/会话恢复/KeepAlive
  自动执行前必须已探测到身份与读页权限，宿主换 token 的窗口不再用旧目标发查询。集成文档的
  iframe 握手示例不再用 `'*'` 作 targetOrigin，并要求校验 `e.source`
- **自定义委托的控制台登出也生效**：此前只有 `PropertiesAuthDelegate`（jwt/endpoint）查
  本地拒绝表，自定义 `ConsoleAuthDelegate`（如 quotehub）默认 `revoke=false`、
  `tokenOf=null`，`/auth/logout` 回 200 但令牌在 TTL 内继续可用。现内核在认证前按
  `tokenOf` 报出的原始令牌统一查拒绝表（`revoke` 未实现也能拦住），quotehub 侧补齐
  `tokenOf`/`revoke`（按宿主 JWT exp 登记）；未实现 `tokenOf` 的旧委托仍以宿主登出为准

### 修复

- **账号切换：登录先换令牌再触发换人清理**：旧顺序让新账号的作业/监控轮询带着上一账号
  的令牌与授权跑第一拍（x3 登录后短暂看到 x1 的在跑作业/告警）
- **换号清理覆盖工作现场与词项缓存**：新增 `es-console.qw.session:`（DSL 会话自动恢复）、
  `es_console_terms_stash`（字段词项持久档）、`es-console.qb.subtree`、`es-console.pref.sqlbridge.sql`、
  `es-console.health-report.last`、`es_vars`、`es_confirm_skip:`；App 换人时清模块级
  词项/字段/别名缓存并剥掉当前路由 query（防 `?dsl=` 深链用新身份自动执行旧查询）
- **app 内存重置补未消费通知与在飞世代**：`notifyQueue` 归零、`indicesSeq/connsSeq` 前移、
  `verInflight/esVersion` 复位，防旧账号迟到回包/Toast 串到新账号
- **客户端写门补用户管理/重绑**：非 ADMIN 不再把 `/auth/users`、已绑定后的 `/setup/apply|test|rebind`
  发出（后端本就 ADMIN-only）；初始化窗口不受影响
- **客户端拦截提示可操作**：明确「请求未发出」并给出「核对当前页面/目标连接写授权、刚被撤权时刷新页面」下一步

### 测试

- 新增 `RawPitOwnership1046Test`、`SearchTemplateGuard1046Test`、`SharedReadGrant1046Test`、
  `SqlCursorOwnership1046Test`、`DelegatedBuiltinToken1046Test`、`permissionDrift1046.spec`；
  `ConsoleAuthInterceptorPageAuthTest` 增宿主隐藏三例；DevTools 金标准增 14 条向量并同步前端断言
- 1048：`InternalEsMethodNotAllowedResolverTest`（405+Allow/非控制台不拦/415）、
  `pageRouteMatrix1048.spec`（零授权 52 路由全 forbidden、全读授权 52 路由全可达）、
  `ConsolePermissionsEndpoint888Test` 增 52 页只读矩阵（read 全 true / write 全 false）
- 1050：`hostLogoutPurge1050.spec`（8 类工作现场键 + last-user 清零、空 token 分支源码锁）、
  `LinkMenuProvisionerTest` 增契约缺页/多页用例（7 例全绿）；产线空 token 复验
  11 键→3 键（仅新会话提示/空历史/设备向导标记），`last-user=null`，会话结束提示+登录态
- 产线机械扫描：56 个写端点，x3 与 x1-PROD 均 **54×403 + 2×405**（方法不匹配语义化），
  0 意外；逐页矩阵 x3 **0读/0写**、x1-PROD **52读/0写**、x1-QA **52读/23写**、
  x2-PROD **52读/30写**；SQL cursor 跨身份 x1 403、x2 续页/关闭 200
- 权限一致性扫描：共享写 23 / 共享读 41 / 页 52 / 299 文件，0 不一致；`vue-tsc` 0 错

### 真实产线验证（QuoteHub，2026-10-24）

- starter 1.0.58 干净 worktree 构建（排除并行 lane WIP）→ 本机 Maven 安装 → QuoteHub
  `release.py --mode deploy --target backend` 上线，`Started QuoteHubAdminApplication` 健康；
  收尾轮 `--target all`（后端 + 宿主前端）发版 **20261024182511** 验证通过。
- 1048 收尾轮 `--target all` 发版 **20261024183959**：405/415、通配提示随 console bundle 上线；
  56 写端点/52 页矩阵/SQL cursor 复验通过。
- 1050 发版 **20261024194551**（all）：跨标签会话同步、宿主登出清理、契约 fail-fast 上线；
  QuoteHub 启动通过（契约 52/52），空 token 产线复验通过。
- 宿主侧：`LinkMenuProvisioner` 默认授权改为仅新连接首次注册时补授（撤销跨重启持久），
  iframe `postMessage` 改同源 targetOrigin 并校验 `e.origin`（防 iframe 被导航到跨源页后 JWT 外泄）；
  新建 **PROD** 连接默认只授读叶子（不自动授 `:write:` 生产写权），QA/STAGING 维持全量默认，
  存量连接授权不变（管理员可显式勾选生产写权）。
- 收尾复核：非 ADMIN 的 `_logstash/_connector/_synonyms/_query_rules/_autoscaling/
  _searchable_snapshots` 六个管理面读端点全部 403，ADMIN 放行。
- `deng_test_x3`（零页集）：连接目录空、`/cluster/indices`、文档写、DevTools 读写、
  `auth/users` 全 403；浏览器只出「无可访问页面/未授权任何集群」+ 申请信息。
- `deng_test_x1`（VIEWER，QA/STAGING 全写、PROD 无写）：QA 文档删除过授权门（ES 404）、
  DevTools QA 执行钮可见且标注「数据面」；PROD 文档写/DevTools 写 403，DevTools 页只出
  「只读」无执行钮。
- `deng_test_x2`（ADMIN）：PROD 文档写、raw `_cat/indices`、`auth/users` 均放行。
- PIT 跨身份：x2 在 QA 开启 PIT 后，x1 经 `pit/search`、`?source=`、`DELETE /_pit` 三种
  通道全部 403；x2 仍可续用并正常关闭（`source`/根级 id 归属校验实锤）。
- 换号污染：同标签页 x2→x3，预置 17 个账号视角键（DevTools 草稿/历史、DSL 会话、词项
  持久档、目标、收藏、健康快照、确认免打扰等）全部清空，仅剩 `last-user` 与空的历史数组；
  x3 菜单为空且无 DevTools 入口（收尾轮 11 键复测同样 2 键收口）。
- 宿主侧：`LinkMenuProvisioner` 默认授权改为仅新连接首次注册时补授（撤销跨重启持久），
  iframe `postMessage` 改同源 targetOrigin 并校验 `e.origin`。

## [1.0.59]

### 修复

- 查询工作台高度链改精确占满（产线实报「工作台有遮挡」）：嵌入壳视口收缩 48px 后，
  100vh-vh-offset 硬预算比可视区高出一截——内容溢出引发外层滚动，冻结工具行悬浮
  盖住构建树首行、底部执行行被裁。现 .dq-fill 精确占满 .page 内容盒并自成滚动容器：
  最小高不敷时在工具行以下滚动，冻结工具行恒悬不遮挡，顶栏与外层永不动

## [1.0.58]

> 本版包含原 `1.0.57`（未发布，无远端 tag）的全部权限加固与 1007 生产验证内容，
> 见下方「1.0.57 未发布内容（已并入本版）」。

### 修复

- 冻结首行全站推广（产线实报：行冻结只落在索引工作区/QueryHub/DevTools 等五处，
  未贯穿全项目）：theme.css 新增 .lr-bar.freeze 页级工具行冻结配方（sticky top0 +
  实底 + 负边距拉满 .page 内容宽 + z20 让位弹层，1023 qh-top 同语义收口单源），
  八个页级工具条视图挂类——查询工作台/别名管控/集群设置/索引设置/检索沙盒/
  任务/任务树/拓扑。长页滚动时工具行恒悬：检索参数/执行/过滤永远可达；
  高度链页（工作台 fill 态）无滚动时 sticky 惰性零开销

### 1.0.57 未发布内容（已并入本版）

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
- **force merge 同步语义**：ES 7.10 的 `_forcemerge` 不支持 `wait_for_completion`
  （请求 400），此前结构化端点/命令面板/索引工作区都带该参数，导致授权用户执行必失败。
  现统一移除参数：结构化端点、命令面板、索引工作区按同步语义提示「已完成/耗时取决于索引大小」；
  raw 维护写（refresh/flush/cache/forcemerge）仍按 976/1004 金标准保持 ADMIN 专属
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
  最终上线 jar sha256 `8c4cd7b1…`（中间版均已备份为 `.bak-*`）；启动健康检查通过。
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
- **DevTools 向量矩阵**（x1 QA 持数据面写键）：文档 CRUD/count/PIT/`_cat` JSON 放行；
  控制面索引（路径/通配/body）、根级 search、`?index=`、health 枚举、scripts/snapshot/watcher/
  nodes/cluster state/settings、已存模板 id、SQL/msearch/bulk、PIT 超限/嵌套 keep_alive 全 403；
  raw refresh/flush/cache/forcemerge 仍 ADMIN 专属；x1 PROD、x3 全 403；x2 ADMIN `_nodes`/
  `_cluster/state`/`_cat/nodes` 放行。
- **真实换号污染**：同一浏览器以 x2 打开控制台并写入 DevTools 草稿/查询历史/目标/索引选择，登出后
  x3 登录并打开控制台——上述键全部被清除（`es_devtools_*`、`es-console.draft2:*`、
  `es_query_hist_v2`、`es_picked`、`es-console.target*`），身份/目标显示为 x3、无上一账号菜单残留。
- **清理**：探针索引/脚本/组件模板均已删除；本地开发后端与 SSH 隧道已恢复。

### 真实产线验证（QuoteHub，2026-10-25 权限矩阵复核）

- **三账号矩阵 26/26**（`npm --prefix console run perm:matrix`，产线版本 `20261024.234826`）：
  - **x1**（VIEWER / 页面授权）：生产连接 **52 读 / 0 写**，DevTools 全拒；QA/UAT
    **52 读 / 23 写**，DevTools 数据面 200、管理面读/写 403；未授权连接 403。
  - **x2**（ADMIN）：连接目录 8 条、管理面 `_nodes` 200、用户管理与全量审计 200。
  - **x3**（零页集）：连接目录 0 条、`grantedPages` 0、用户管理/全量审计 403、
    目标连接 `CONN_FORBIDDEN`（仅身份/连接目录/健康等自举端点 200）。
  - 宿主 `/api/auth/logout` 后旧 token 再访问控制台 **401**。控制台 `/auth/logout` 对
    自定义委托不承诺吊销（无令牌原文/未实现 `tokenOf`），账号切换以宿主登出为准——文档已写明。
- **1008 前端切换修复本地门禁**：`vue-tsc` 0 错；权限/身份切换 **7 spec / 93 例全绿**
  （含新增 `identitySwitch1008` 8 例）。因当前工作树含并行 lane 的查询工作台 WIP，
  **未用混合工作树发版**；1008 随下一次干净 release 上线后复跑同一矩阵。

### 兼容性

- 无新增必填配置、页面契约零变更（quotehub 菜单派生与既有授权无需迁移）；
  `ConsoleAuthDelegate` 只新增 default 方法（`hasCredential`/`tokenOf`），自定义实现不受影响。
  控制器内部方法为接收 `HttpServletRequest` 调整了签名（非宿主 SPI）；`EsClusterConnController.syncStatus()`
  保留无参直调重载。quotehub 的 `manager→OPERATOR` 仍可通过自动授予的 `w:cluster-settings`
  执行集群级动作。

### 门禁

- 后端：**1508 例 0 失败 0 错误 / 2 跳过**（新增 1007：`RawScope1007Test` 4 /
  `InternalEsIndexRebuildScope1007Test` 3 / `AuthSwitchHardening1007Test` 5 /
  `PitOwnership1007Test` 3 / 跨集群作业归属 2；1002~1006 既有锚全部保留；
  `BuiltinConsoleAuthRevocation990Test` 的「新建 epoch=1」按随机纪元反转；
  `InternalEsIndexRebuildControlReadScope979Test` 补页面可见性所需的 header 桩）；
  前端 `vue-tsc` 0 错；全量 **1103 文件 / 9539 例全绿**（含 1007 新增
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
