# 更新日志

所有重要变更记录在此文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/)；
版本号遵循 [语义化版本](https://semver.org/)；
详细差异见 [GitHub Releases](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/releases)。

## [1.0.37]

### 安全

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
