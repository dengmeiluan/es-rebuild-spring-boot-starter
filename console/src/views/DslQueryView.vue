<template>
  <div class="dq" :class="{ 'dq-fill': !!store.pickedIdx }">
    <!-- 无索引提示 -->
    <EmptyState v-if="!store.pickedIdx" :icon="Database" text="先在顶栏选择一个索引" centered />

    <template v-else>
      <div class="dq-progress ind-bar" :class="{ on: running }"></div>
      <!-- 工具条 -->
      <!-- 三行合一（用户截图裁决「这三个应该在一行」）——场景条（QueryHub 经
           #toolbar-prepend 注入）+构建节头（折叠钮+条件数）+工具组+分栏档位 seg 合并单行；
           dq-build-hd 独立行退役，独占态还原入口（分栏 seg）常驻工具行右段 -->
      <div class="dq-toolbar lr-bar">
        <div class="dq-tb-l lr-bar-l">
          <!-- 构建节头先行（实报「日常场景应该跟查询构建器位置换一下」——
               构建节头与场景下拉（QueryHub 经 slot 注入）对调；542 三行合一顺序锁随迁）。
               入口大气化升级（实报「查询构建器这个按钮感觉不够大气美观，
               没有凸显出来比较重要的能力」）——打开条件树构建器（QueryTreePane）是本页高频
               核心能力，原无框文字钮视觉权重失配。升级=553 六「检索参数」终审胶囊语言
               （细描边同族）：Workflow icon+「查询构建器」文案+条件计数徽标（「· 条件 N 个」摘要
               紧凑化，ac-soft 计数 chip、0 灰态）+展开态激活柔底（.on=「当前在编辑构建器」
               状态感知）+chevron 旋转保留；计数源 queryCondCount 同源复用；收展行为
               （buildCollapsed 机制与缺省值）零变化 -->
          <button type="button" class="dq-sec-tg dq-build-tg" :class="{ on: !buildCollapsed }"
            :aria-expanded="!buildCollapsed" title="查询构建器：展开/收起条件树与编辑器（徽标=当前条件数）"
            @click="buildCollapsed = !buildCollapsed">
            <Workflow :size="13" />
            查询构建器
            <span class="dq-build-n" :class="{ zero: queryCondCount === 0 }">{{ queryCondCount }}</span>
            <ChevronDown :size="13" :style="{ transform: buildCollapsed ? 'rotate(-90deg)' : '', transition: 'transform var(--tr)' }" />
          </button>
          <slot name="toolbar-prepend" />
          <button class="btn sm" @click="tplOpen = true" title="查询模板"><LayoutTemplate :size="13" /> 模板</button>
          <button class="btn sm" @click="varsOpen = true" title="变量 ${var}"><Variable :size="13" /> 变量</button>
          <button class="btn sm" @click="histOpen = true" title="查询历史"><History :size="13" /> 历史</button>
          <button class="btn sm" @click="saveQuery" title="保存当前搜索（DSL+表格布局，Ctrl+S）"><Save :size="13" /> 保存</button>
          <!-- 在 DevTools 打开（_prefill 会话契约与 Snapshots/Ilm 同通道）——
               当前索引+DSL 组装 POST /{index}/_search 带到多标签控制台微调 -->
          <button class="btn sm" @click="openInDevTools" :disabled="!resp" title="把当前索引与 DSL 带到 DevTools 多标签控制台（微调 headers/方法后重发）">
            <TerminalSquare :size="13" /> DevTools
          </button>
          <button aria-label="保存的搜索" class="btn sm" @click="savedOpen = true" title="保存的搜索（DSL+布局一体快照）"><Bookmark :size="13" /></button>
          <!-- 文档新增一等入口（此前全站只能写 NDJSON 或手写 REST 造数据）；：OPERATOR+ 可见（普通写档） -->
          <button v-if="canWrite" class="btn sm pri" @click="openNewDoc()" title="新建文档（mapping 骨架预填，ID 留空自动生成）"><FilePlus2 :size="13" /> 新文档</button>
          <!-- W4-T14：构建器前置入口——携带当前 DSL 跳查询工作台（?dsl= 互转通道，URL 固化现场） -->
          <button class="btn sm ghost" @click="openInBuilder" title="在查询工作台构建器中打开当前 DSL（深链可分享）"><ListTree :size="13" /> 在构建器中打开</button>
          <!-- DSL→Lucene 一键翻译（dslToLucene 纯函数直连；结果复用命令面板
               r30-dsl-to-lucene 既有展示出口——es-console.lucene.q/index 会话键 → Lucene 通道回显） -->
          <button class="btn sm ghost" @click="openInLucene" title="把当前 DSL 翻译为 Lucene query_string（跳转 Lucene 通道查看/执行）"><ArrowLeftRight :size="13" /> DSL→Lucene</button>
          <!--  联动性：对齐 IndexHub→查询工作台的既有反向入口——查完想看 docs/settings/mapping 一键直达（IndexHub 跟随全局选中索引）。
               文案统一「索引工作区」（页面注册名与 PageHeader 同名，此前「工作台」是孤例） -->
          <button aria-label="在索引工作区打开（docs/settings/mapping/就地查询）" class="btn sm ghost" title="在索引工作区打开当前索引（docs/settings/mapping/就地查询）" @click="router.push('/indices')"><ExternalLink :size="13" /> 索引工作区</button>
        </div>
        <div class="dq-tb-r lr-bar-r">
          <!-- 分栏档位 seg 进工具行右段首（独占态还原入口常驻可点）。
               激活档 title 动态明示「再点还原」（toggle 语义自带说明） -->
          <div class="dq-split-seg" role="group" aria-label="分栏档位（条件树与编辑器互覆盖）" title="分栏档位：激活档再点还原对半；独占态另一侧还有「还原对半」竖轨">
            <button type="button" :class="{ on: splitTier === 'none' }" :aria-pressed="splitTier === 'none'" title="恢复对半分栏" @click="setSplitTier('none')">对半</button>
            <button type="button" :class="{ on: splitTier === 'tree' }" :aria-pressed="splitTier === 'tree'" :title="splitTier === 'tree' ? '条件树独占中——再点还原对半分栏' : '条件树独占（编辑器收起）'" @click="setSplitTier('tree')">条件树</button>
            <button type="button" :class="{ on: splitTier === 'ws' }" :aria-pressed="splitTier === 'ws'" :title="splitTier === 'ws' ? '编辑器独占中——再点还原对半分栏' : '编辑器独占（条件树收起）'" @click="setSplitTier('ws')">编辑器</button>
          </div>
          <n-popover trigger="click" placement="bottom-end" :width="340">
            <template #trigger><button class="btn sm" title="时间戳 ↔ 标准时间互转（多种格式自适应）"><Clock :size="13" /> 时间转换</button></template>
            <div style="display:flex;flex-direction:column;gap:var(--sp-2);padding:var(--sp-1)">
              <input v-model="tcInput" class="inp mono" placeholder="输入标准时间或 epoch 毫秒/秒" style="height:26px;font-size: var(--fs-xs)" @keyup.enter="tcConvert" />
              <button class="btn sm" @click="tcConvert">转换</button>
              <div v-if="tcOut" class="mono" style="font-size: var(--fs-xs);line-height:1.7;word-break:break-all">
                <div v-for="(line, i) in tcOut" :key="i" style="display:flex;justify-content:space-between;gap:var(--sp-2)">
                  <span>{{ line.k }}</span>
                  <button class="btn xs ghost" @click="copyText(line.v).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制：' + line.k : '复制失败'))">{{ line.v }}</button>
                </div>
              </div>
              <div v-if="!tcOut" style="font-size: var(--fs-xs);color:var(--tx2)">支持 2026-08-19 00:00:00 / 2026/08/19 / epoch 秒（10 位） / 毫秒（13 位） / ISO(T) 等格式互转</div>
            </div>
          </n-popover>
          <n-popover trigger="click" placement="bottom-end">
            <template #trigger><button class="btn sm" title="复制为代码"><Code2 :size="13" /> 复制为</button></template>
            <div class="codegen">
              <button v-for="l in langs" :key="l.k" class="btn sm" :class="{ pri: store.settings.defaultLang === l.k }" @click="copyAs(l.k)">{{ l.t }}</button>
            </div>
          </n-popover>
          <button aria-label="导出 DSL" class="btn sm" @click="exportDsl" title="导出 DSL"><FileDown :size="13" /></button>
          <button aria-label="导入 DSL" class="btn sm" @click="importDsl" title="导入 DSL"><FileUp :size="13" /></button>
          <button aria-label="复制分享链接" class="btn sm" @click="shareUrl" title="复制分享链接"><Share2 :size="13" /></button>
          <button aria-label="格式化" class="btn sm" @click="monacoRef?.format()" title="格式化"><AlignLeft :size="13" /></button>
          <!-- 原始 IO 常驻入口——此前钮只在 RT #bar-extra（resp 在场才渲染），
               查询失败（queryErr、resp=null）全页无取数入口；工具行右段常驻 Terminal 钮
               （打开同一 RawIoModal，openRawIo 取数逻辑零触；RT 结果行钮保留成功态就地快查） -->
          <button class="btn sm" aria-label="查看原始 IO（DSL 查询）"
            title="最近一次查询的请求/响应原文（语义分档高亮 + 复制/curl 回放）" @click="openRawIo"><Terminal :size="13" /></button>
        </div>
      </div>

      <!-- 20260920 三轮重排：双栏整体折叠节（裁决「查询条件树和 DSL 编辑器可以整体折叠」）——
           节头=「查询构建与编辑」+条件数摘要+chevron；收起=dq-main v-show 隐藏，
           结果表格自动吃满（flex 骨架锚定，其余区块位置不跳）。高度链安全：
           display:none 移除高度贡献（非 height:0 占位），展开恢复 flex 分配。 -->
      <!-- dq-build-hd 独立行退役——折叠钮与分栏 seg 已并入顶部工具行单行
           （状态读写仍走 WorkbenchLayout expose 的 maximizedId/setMaximize） -->
      <div class="dq-main" ref="dqMainEl" v-show="!buildCollapsed" :style="dqMainStyle">
        <!-- P1 workbench：tree/workspace 进统一可调布局；旧 es_console_qb_split 一次性迁移（只读兼容）。
             fill-viewport=false：本页自建真高度链（.dq-fill 定高 flex 分配），.wl 视口兜底会让
             常规流的结果区 res-bar 被顶到视口底沿（P0 实报）。
             预设钮换「条件区/编辑器」口径：editor-first 实调条件树拉宽、result-first 实调
             编辑器拉宽（[sized tree, flex workspace] 下 result-first 反向把 sized 压向 min），
             通用「编辑/结果优先」文案在本页是反的。 -->
        <WorkbenchLayout ref="wlRef" :scope="wbScope" :panes="DSL_PANES" axis="vertical" mode="builder" class="dq-wl"
          :fill-viewport="false"
          preset-editor-label="条件优先" preset-editor-title="条件树优先（编辑器收窄）"
          preset-result-label="编辑优先" preset-result-title="编辑器优先（条件树收窄）">
          <template #pane-query-builder-tree>
        <!-- 左：条件树构建器（一等面板，始终显示，与 DSL 双向同步） -->
        <div class="dq-tree">
          <!-- W4-T14：builder 字段源并轨 useIndexFields（mappingDetail 出口），消除 clusterInspect 双管线漂移 -->
          <QueryTreePane
            :tree="queryTree" :fields="builderFields" :types="builderTypes" :stale="treeStale"
            :index="store.pickedIdx"
            @update:tree="onTreeUpdate"
          />
          <!-- 零降级：mapping 缺失只影响字段候选/类型徽标，字段名仍可手输 -->
          <div v-if="!fieldList.length" class="dq-tree-map">
            {{ mappingState === 'loading' ? '正在加载 mapping…' : mappingState === 'err' ? 'mapping 加载失败' : '该索引暂无字段——字段名可手输' }}
            <button v-if="mappingState === 'err'" class="btn sm ghost" @click="preloadMapping">重试</button>
          </div>
        </div>
          </template>
          <template #pane-query-builder-workspace>
        <!-- 右：编辑器独立占栏（裁决二轮：RootExtrasPane 参数条与 Profile 树
             迁出右 pane → 执行行区域的可折叠「检索参数」块——原参数条在编辑器 pane 内
             展开（分页表单/track_total_hits/Profile 树）纵向撑爆右栏，编辑器本体被挤没；
             现在 pane 全高只给编辑器，参数作为「检索条件快速填充」跟执行行同块可折叠） -->
        <!-- 高度链合一（实报「对半默认编辑器高度有问题/拉伸没用」）——
             Monaco 恒在 pane 内 flex 填满（原 full 档特化泛化），双栏区高度=编辑器实际高度：
             档位钮驱动 .dq-main 高度（DQ_MAIN_H），拖柄拖动=自定义态，空白带根治 -->
        <div class="dq-editor">
          <MonacoEditor
            ref="monacoRef"
            v-model="dsl"
            height="100%"
            :dsl-assist="dslAssist"
            :font-size="dqFont"
            @execute="runQuery"
          />
        </div>
          </template>
        </WorkbenchLayout>
      </div>

      <!-- 双栏区/结果区高度拖拽柄（实报「表格高度无法调节、条件树/dsl 容器高度无法调节」）——
           横向 SplitHandle 拖拽调 dq-main 高（dq.mainH 偏好落盘 px），缺省 0=原 34vh 档零增量；
           结果区 flex:1 吃剩余，表格高度随双栏高度此消彼长 -->
      <SplitHandle
        v-show="!buildCollapsed"
        class="dq-height-handle"
        axis="horizontal"
        :size="mainHandleSize"
        :min="220"
        :max="mainHandleMax"
        :label="'调整条件树/编辑器区高度'"
        @resize="onMainResize"
        @resize-end="onMainResizeEnd"
      />

      <!-- 执行统一容器（裁决「检索条件没有和执行按钮是在统一容器设计」）——
           执行行与检索参数折叠块同区块：执行行动线优先顶置，参数折叠块紧随（展开时
           RootExtrasPane chips+Profile 树在此容器内），扁平化不加框，分组靠区块间距 -->
      <div class="dq-run-sec">
      <!-- 执行行单组化（用户真机反馈「Profile 开关应该统一放到右边」）——
           左段 dq-run-left 退役，Profile 开关+自动刷新档位迁右组最左端起头（执行参数与
           执行动线同一水平线）；口径延续：右段 dq-run-end=执行/取消/JQ
           （执行动线贴右缘）；：直方图开关四迁回执行行 Profile 旁（用户终审） -->
        <div class="dq-run-row">
        <div class="dq-run-end">
        <label class="dq-sw" :class="{ on: profileOn }" title="Query Profiler：返回 breakdown 耗时树">
          <input type="checkbox" v-model="profileOn" /> Profile
        </label>
        <!-- 直方图开关四迁执行行右组 Profile 旁（用户终审「直方图按钮应该跟
             Profile 按钮样式一样，位置一块」——同款 .dq-sw 激活胶囊；立法史记档：542 执行行→
             547 表格工具行→549 节头→553 执行行 Profile 旁终态）。柱状图本体仍在结果区节头下 -->
        <label class="dq-sw dq-bar-hist" :class="{ on: autoHist }"
          title="自动注入直方图聚合（date 型走时间直方图，keyword 型 ISO 串走词条分布；mapping 无 date 字段时自动从结果值形态嗅探）">
          <input type="checkbox" v-model="autoHist" /> 直方图
          <span v-if="histNoDateField" class="dq-hist-none"
            title="当前索引 mapping 无 date 字段：执行后将尝试从结果值形态嗅探（epoch 毫秒/秒/ISO 串）；均不匹配则不生成直方图">无时间字段</span>
        </label>
        <!--  P1-4：自动刷新档位（重放当前查询不入历史；编辑挂起自动暂停）。
             手写 select 档换 AutoRefreshSelect 统一件（LiveDashboardView v-model:ms
             同款形态；默认档位表即 关/10s/30s/60s；原 title 语义走 label 承担；
             class="dq-ar" 保 run-row 内 nowrap/不收缩语义） -->
        <AutoRefreshSelect v-model:ms="autoRefreshMs" class="dq-ar mono"
          :label="'自动重放当前查询（不入查询历史；有未提交编辑时自动暂停）'" />
        <!-- 只留 A/B 对比增量——总条数与耗时已并入 RT 工具行计数条（与索引工作区同口径），
             此处双份统计且形态不同（「条 ·」vs「/」）曾让两台读数不一致 -->
        <!-- A/B 增量手写 chip（.dq-delta bg2+边框小胶囊）收编 MetaStrip 统一件
             （dot/text 形态——dot 随 faster/slower 走 ok/warn 冗余色标，text 承接 Δ 串；DiagView
             dgMeta dot 先例）。外层 span 字面=workbenchParity402:28 锁面保形，收编发生在其内 -->
        <span v-if="resp && runDelta" class="dq-meta mono">
          <MetaStrip class="dq-delta-ms" :items="[{ dot: runDelta.cls === 'faster' ? 'var(--ok)' : runDelta.cls === 'slower' ? 'var(--warn)' : undefined, text: runDelta.txt, tip: runDelta.tip }]" />
        </span>
        <!-- W-A：编辑器高度四档（S/M/L/满），usePref 记忆；：档位=驱动双栏区高度
             （Monaco flex 填满 pane），拖柄拖动=自定义态（四钮全灭），点档位钮=重置回档位高度
             （实报「回不去了」的显性重置入口） -->
        <div class="dq-eh" role="group" aria-label="编辑器高度档位" title="编辑器高度档位：S/M/L/满（拖动下方分隔条可自定义高度，点档位钮恢复）">
          <button v-for="eh in EDITOR_H_TIERS" :key="eh.k" type="button" class="dq-eh-btn"
            :class="{ on: editorH === eh.k && dqMainH <= 0 }" :aria-pressed="editorH === eh.k && dqMainH <= 0"
            :title="'编辑器高度：' + eh.t" @click="editorH = eh.k; dqMainH = 0">{{ eh.t }}</button>
        </div>
        <!-- 编辑器字号三档 seg（dq.font 落盘；DevTools dt.font 同源
             EDITOR_FONT_TIERS 单源，编辑器设置族与高度档同排同语义；
             响应缺角=MonacoEditor fontSize watch 同批补齐） -->
        <span class="seg dq-font-seg" role="group" aria-label="编辑器字号档">
          <button v-for="f in EDITOR_FONT_TIERS" :key="f" type="button" :class="{ on: dqFont === f }"
            :title="'编辑器字号 ' + f + 'px'" @click="dqFont = f">{{ f }}</button>
        </span>
        <!-- 长查询可取消——重度用户天天跑大查询，慢查询只能干等是硬伤 -->
        <button v-if="running" class="btn sm" @click="cancelQuery"><X :size="13" /> 取消</button>
        <!-- JQ 过滤（随执行行同排，窄容器自然换行） -->
        <div v-if="resp" class="dq-jq">
          <Filter :size="13" style="color:var(--tx2);flex-shrink:0" />
          <input
            v-model="jqExpr"
            class="inp mono"
            style="height:26px;font-size: var(--fs-xs)"
            placeholder="JQ 过滤响应，如 .hits.hits[] | ._source  （留空显示原始结果）"
            @keydown.enter="applyJq"
          @keydown.esc.prevent="jqExpr = ''" />
          <!-- 应用钮 ghost→描边实底次级钮+icon（终审「太廉价」翻案 dqFix552 三件全 ghost；清除钮仍 ghost=次次级） -->
          <button class="btn sm" @click="applyJq"><Check :size="13" /> 应用</button>
          <button v-if="jqResult !== null" class="btn sm ghost" @click="jqResult = null; jqExpr = ''">清除</button>
          <span v-if="jqError" class="il-hint il-err">{{ jqError }}</span>
        </div>
        <!-- 二刀：检索参数开关钮进执行行（执行左侧），执行保持最右（裁决「执行应该在最右边」）；
             参数展开区仍在执行行下方独立块。
             无框档被用户终审「太廉价」翻案→细描边胶囊+激活柔底（样式见 scoped）。
             收起态摘要串（条件数+顶层已设参数速览，展开态不显示——面板本体即摘要） -->
        <button type="button" class="dq-params-tg" :class="{ on: paramsOpen }" :aria-expanded="paramsOpen"
          title="检索条件快速填充：分页 / 排序 / 字段裁剪 / 高亮 / 聚合 / 其他顶层键"
          @click="paramsOpen = !paramsOpen">
          <SlidersHorizontal :size="13" /> 检索参数
          <span v-if="paramsSummary" class="dq-params-sum mono">{{ paramsSummary }}</span>
          <ChevronDown :size="13" :style="{ transform: paramsOpen ? 'rotate(180deg)' : '', transition: 'transform var(--tr)' }" />
        </button>
        <button class="btn primary sm btn-run-lock" :disabled="running" @click="runQuery">
          <Play :size="13" /> {{ running ? '执行中 ' + (elapsedMs / 1000).toFixed(1) + 's' : '执行' }} <span class="kbd" style="margin-left:var(--sp-1)">Ctrl⏎</span>
        </button>
        </div>
      </div>

        <!-- 检索参数展开区（开关钮已迁执行行内执行左侧）；
             默认收起，展开态 usePref 记忆。
             展开区移出 run-row 成 run-sec 直接子级——run-row 是 flex row
             （align-items:center），参数块作其 flex item 只占内容宽靠左、右侧留白
             （「参数面板不铺满/未执行时更诡异」总根因）；width:100% 铺满统一容器
             （注释宣称的结构自此成真） -->
        <div v-show="paramsOpen" class="dq-params-body dq-params-standalone">
            <RootExtrasPane
              :tree="queryTree" :fields="builderFields" :types="builderTypes" :index="store.pickedIdx"
              @update:tree="onTreeUpdate"
            />
        </div>
        <!-- Profile 树移出参数面板（实报「看不到 profile」根因=树藏在
             paramsOpen 缺省 false 的参数面板内；Profile 树属执行结果观测，不该随参数折叠藏显）——
             成 run-sec 独立块，只受 profileTree 数据门控（queryFlat534 字面锁保形）。
             限高升三档（dq.profH 落盘，首档=531 冻结值 max(240px,42vh) 零漂移；
             CSS 规则字面零触仍在册=缺省档同值，运行时档经内联 max-height 覆盖；档钮在树域头） -->
        <div v-if="profileTree" class="dq-profile" :style="profStyle">
          <div class="sec-t dq-sec-hd"><Flame :size="13" /> Profile 耗时树 <button class="btn sm ghost" :title="'耗时树限高档：' + profH + '（点击循环）'" @click="cycleProfH">高</button><button aria-label="关闭 Profile 耗时树" class="btn sm ghost" style="margin-left:auto" @click="profileTree = null"><X :size="11" /></button></div>
          <ProfileNode :node="profileTree" :total="profileTotal" :depth="0" />
        </div>
      </div>

      <!-- W2-2：定位不到编辑器位置的 finding 降级列在这里，不静默丢弃（随执行行独立行化迁出 pane）。
           私造降级壳退役，换装 theme.css .lint-bar/.lint-bar-warn 单源
           （soft 底语义等值；类名锚随迁见 dqFix552/tableBarUnify541） -->
      <div v-if="lintUnplaced.length" class="lint-bar lint-bar-warn">
        <OctagonX :size="12" />
        <span v-for="(f, i) in lintUnplaced" :key="i" class="dq-lint-item">
          {{ f.message }}（{{ f.suggestion }}）
        </span>
      </div>

      <!-- 直方图 / Terms 聚合并入结果卡内分区（独立 .card 卡墙退役） -->

      <!-- 查询失败持久错误面板（重试重发执行）。
           私造 .dq-err 四边框壳+独立标题行退役，收编全局 .err-bar 范式
           （theme.css :553；XmigrateView :60 errPreHtml+errMeta 双参先例）——err-soft 底+
           err-line 边归全局单源，重试钮与 pre max(240px,42vh) 钳制保留（531 口径冻结面）；
           原始错误对象旁路喂 errMeta（code/endpoint 一眼可辨），queryFlat534 字面锁随迁 -->
      <div v-if="queryErr" role="alert" class="err-bar dq-err">
        <pre class="mono" v-html="errPreHtml(queryErr, errMeta(queryErrRaw))"></pre>
        <button class="btn sm" :disabled="running" @click="runQuery">重试</button>
      </div>

      <!-- 按查询删除异步任务引导条（taskId + 查进度三态拉取，一次性不挂轮询；
           黄条语言同 .dq-partial 可关闭） -->
      <div v-if="dbqTaskId" class="dq-dbq mono" role="status">
        <span>按查询删除已提交（异步）：taskId <code>{{ dbqTaskId }}</code></span>
        <button class="btn sm ghost" data-test="dq-dbq-progress" :disabled="dbqProgLoading"
          title="拉取该任务当前进度（一次性查询，不挂轮询）" @click="queryDbqProgress">查进度</button>
        <span v-if="dbqProgLoading || dbqProgText" class="dq-dbq-prog">{{ dbqProgLoading ? '进度查询中…' : dbqProgText }}</span>
        <button class="dq-partial-x" aria-label="关闭删除任务进度条" title="关闭" @click="dbqTaskId = ''"><X :size="11" /></button>
      </div>

      <!-- 结果区高度拖柄（实报「表格无法手动调高」）——双柄分工：
           上柄调双栏构建区（dq.mainH 自定义态），本柄调结果区（dq.resultH 偏好落盘）；
           缺省 0=.dq-result 维持 flex 消化零增量；双击柄=重置回 flex 态。
           ⚠dqRunRowPolish543 的首个 dq-height-handle indexOf 锚=上柄，本柄在其后不扰动。
           pointerdown/focus 快照锚（结果柄方向反转换算，见 onResultDragAnchor） -->
      <SplitHandle
        v-show="resp"
        class="dq-height-handle"
        axis="horizontal"
        :size="resultHandleSize"
        :min="320"
        :max="resultHandleMax"
        :label="'调整结果区高度'"
        @pointerdown.capture="onResultDragAnchor"
        @focus.capture="onResultDragAnchor"
        @resize="onResultResize"
        @resize-end="onResultResizeEnd"
        @reset="onResultReset"
      />

      <!-- 结果区 -->
      <div v-if="resp" class="dq-result" :style="resultStyle">
        <!-- .card 大卡壳退役（真机反馈卡壳与 rt-bar/alt-body 双层框线冗余）——
             dq-res-body 只留布局容器职责（flex 链+--dq-view-cap 契约不动），
             边界由 rt-bar 自带边框与 alt-body border-top 分节承接 -->
        <!-- alt-view 分档类——RT 根 起是 FocusableSurface 的 section.fs，
             宿主无法用后代/子选择器感知 hideBody 分档，view 状态在此显式落类供 CSS 分档 -->
        <div class="dq-res-body" :class="{ 'alt-view': view !== 'table' }">
          <!-- dq-res-head 退役——视图 seg+分页器寄居 RT 自带工具行（#bar-prepend
               槽，bar-left 最前），命中数/耗时走 RT rt-info（MetaStrip 本地复制品退役）；
               「翻页、展示形式统一在表格头」裁决，且 JSON/Tree/卡片视图下工具行常驻
               （hideBody 只隐表格体），视图切换不再连工具行一起消失 -->

          <!-- 直方图分区：换装 HistogramSection 统一件（组件化「DQ 侧同位
               替换下批做」遗留双形态就此收口）。toggle-slot="host"：开关不渲染于节头，仍由
               执行行承载（553 终审落位零触）；节头恒在场 549 立法由组件承接。数据链原样直喂：
               histHeadMeta（557 MetaStrip 形态归一组件）/brushRange/onBrush/clearBrush，
               柱状图 :height="80" @brush 透传保形（六拍哨兵：节壳/节头/图体三层高度链等值） -->
          <HistogramSection toggle-slot="host" :buckets="histBuckets" :open="histSecOpen"
            :meta="histHeadMeta" :brush-range="brushRange"
            @toggle="histSecOpen = !histSecOpen" @brush="onBrush" @clear-brush="clearBrush" />
          <!-- Terms 聚合分区（原独立卡并入） -->
          <!-- W-A：Terms 聚合分区并入 metric 聚合值卡（hits 空时结果区不再空白）；
               桶行点击=下钻追加 term filter，Alt+点击=must_not 排除 -->
          <div v-if="termsAggs.length || metricAggs.length" class="dq-aggs">
            <!-- terms 桶行 kw 快滤胞（宿主侧过滤，占比/合计分母仍吃全量桶不重算；
                 形态对齐 Xmigrate xm-jobs-kw 最小 input 胞，Esc 清空） -->
            <div v-if="termsAggs.length" class="dq-agg-kwbar">
              <!-- 轨4：terms 桶行 kw 快滤换装 SearchFilterBar 单源（sfbUnify650 锁）——
                   Esc 清空转组件内建（原 @keydown.esc 行为等价） -->
              <SearchFilterBar v-model="aggKw" class="dq-agg-kw mono" placeholder="过滤聚合桶…" />
            </div>
            <div v-for="a in termsAggsView" :key="a.name" class="dq-agg">
              <div class="dq-agg-t mono">{{ a.name }}</div>
              <div v-for="b in a.buckets" :key="String(b.key)" class="dq-agg-row dq-agg-drill" role="button" tabindex="0"
                :title="'点击下钻「' + (b.key_as_string || b.key) + '」追加 term 过滤；Alt+点击=排除（must_not）'"
                @click="drillAgg(a, b, $event.altKey)" @keydown.enter.prevent="drillAgg(a, b, false)" @keydown.space.prevent="drillAgg(a, b, false)">
                <span class="mono dq-agg-k" :title="String(b.key)">{{ b.key_as_string || b.key }}</span>
                <div class="dq-agg-track"><i :style="{ width: (b.doc_count / maxOf(a) * 100) + '%' }"></i></div>
                <span class="mono dq-agg-n">{{ fmtNum(b.doc_count) }}</span>
                <span class="mono dq-agg-pct">{{ pctOf(a, b) }}</span>
              </div>
              <div v-if="a.rest" class="dq-agg-more mono">其余 {{ a.rest }} 桶已折叠（合计 {{ fmtNum(a.total) }} 条）</div>
            </div>
            <div v-for="m in metricAggs" :key="m.name" class="dq-agg">
              <div class="dq-agg-t mono">{{ m.name }}<span class="dq-agg-kind">{{ m.kindLabel }}</span></div>
              <div v-for="r in m.rows" :key="r.k" class="dq-agg-row dq-agg-mrow">
                <span class="mono dq-agg-k" :title="r.k">{{ r.k }}</span>
                <span class="mono dq-agg-mv">{{ r.v }}</span>
              </div>
            </div>
          </div>
          <!--  P1-7：部分分片失败黄条（Kibana partial results 对位——诚实呈现结果完整性） -->
          <div v-if="partialHint && !partialDismissed" class="dq-partial mono">
            <AlertTriangle :size="12" />
            <span>{{ partialHint }}</span>
            <button class="dq-partial-x" aria-label="关闭提示" title="关闭提示" @click="partialDismissed = true"><X :size="11" /></button>
          </div>
          <!-- 实报 semOn 推断误伤下线（sem-on 退役）：id(long 标识符)被判
               duration 显示「1328.4s」、0/1 状态值被判 percent 显示「0%/100%」——查询结果
               表的值域（ID/状态/布尔/epoch 毫秒主键）与语义推断假设全面冲突，且 mapping
               类型已知（integer/long 徽标照常显示），自动推断净误导。原则=类型已知不猜，
               推断只留给无类型信息且用户明确要求的场景（随 2.9.123 显式类型抑制同原则） -->
          <!-- 快滤框表格档唯一在场（双搜索框合一）——json 档 dq-json-find、
               cards 档 dq-cards-kw 各自伴生搜索，快滤管线只作用于表格行，非表格档恒真
               接线=死 UI 双框并排（实报图1）；表格档行为零变，切档往返 kw 保留 -->
          <ResultTable ref="resultTbl"
            :hide-body="view !== 'table'"
            :loading="running"
            refreshable
            :hits="resp.hits"
            :total="resp.total"
            :total-gte="resp.totalGte"
            :took="resp.took"
            :index="store.pickedIdx"
            :field-types="fieldTypes"
            show-relevance
            :searchable="view === 'table'"
            remote-sort
            :sync-sort="hitsSortSync"
            @sort-change="onHitsSortChange"
            @open-doc="openDoc"
            @delete-doc="askDeleteDoc"
            @batch-delete="askBatchDelete"
            @refresh="runQuery"
            @explain-hit="gotoWhy"
            @xray-hit="gotoXray"
            @filter-hit="onFilterHit"
          >
            <!-- 视图 seg+分页器寄居表格工具行（#bar-prepend）——
                 「展示形式/翻页统一在表格头」（裁决）；JSON/Tree 视图无翻页语义故分页器
                 仅表格/卡片视图在场；工具行随 hideBody 常驻，视图切换不丢工具行。
                 直方图开关同步进表格头（执行行不再承载展示类控制） -->
            <template #bar-prepend>
              <div class="seg">
                <button v-for="v in views" :key="v.k" :class="{ on: view === v.k }" @click="view = v.k">{{ v.t }}</button>
              </div>
              <!-- 表格顶满当前页快捷（实报「没看到顶满当前页的快捷键，
                   放大按钮是全局，不一样的」——RT 内建 ⤢ 是全局聚焦面覆盖整页，本钮=本页级：
                   收起条件树/编辑器构建区，结果区吃满页面 flex；再点还原。动线=构建区整体
                   折叠既有机制（buildCollapsed），此处只是把入口放进表格头常驻可达） -->
              <button type="button" class="btn sm ghost dq-fillpage" :class="{ on: buildCollapsed }"
                :title="buildCollapsed ? '还原条件树与编辑器（退出表格顶满）' : '表格顶满当前页（收起条件树与编辑器）'"
                @click="buildCollapsed = !buildCollapsed">
                <PanelBottomClose v-if="buildCollapsed" :size="13" /><PanelBottomOpen v-else :size="13" /> {{ buildCollapsed ? '还原' : '顶满' }}
              </button>
              <Pagination v-if="view !== 'json' && view !== 'tree'"
                :page="page" :total-pages="totalPages" :page-size="pageSize" :disabled="running"
                @update:page="goPage" @update:page-size="setPageSize" />
              <!-- JSON 视图搜索/导航组寄居工具行（用户真机反馈：浮动搜索条遮挡内容
                   且与 rt-bar 割裂）——原浮在内容上方的 dq-json-find 收编 bar-prepend 视图段后，
                   仅 JSON 档在场，工具行一行连贯零浮动；jsonFind 计数/上下导航行为零触碰 -->
              <div v-if="view === 'json'" class="dq-json-find">
                <input v-model="jsonKw" class="inp mono" placeholder="搜结果 JSON…" @input="jsonFindRun"
                  @keydown.enter.prevent="jsonKw.trim() && ($event.shiftKey ? jsonFind.prev() : jsonFind.next())" />
                <span class="mono dq-json-mc">{{ jsonFind.current.value }}/{{ jsonFind.count.value }}</span>
                <button type="button" class="btn ghost xs" :disabled="!jsonFind.count.value" title="上一个 (Shift+Enter)" @click="jsonFind.prev()">↑</button>
                <button type="button" class="btn ghost xs" :disabled="!jsonFind.count.value" title="下一个 (Enter)" @click="jsonFind.next()">↓</button>
              </div>
              <!-- 卡片视图 kw 快滤（宿主侧过滤卡片集，DSL/查询不动；dq-json-find
                   同胞形态仅卡片档在场，Esc 清空；不引统一搜索件——那归其他批次改造） -->
              <div v-if="view === 'cards'" class="dq-cards-kw">
                <!-- 轨4：卡片 kw 快滤换装 SearchFilterBar 单源（sfbUnify650 锁）；
                     外胞 div+计数 span 结构保留（561 锚），Esc 清空转组件内建 -->
                <SearchFilterBar v-model="cardsKw" class="dq-cards-kw-sfb mono" input-class="dq-cards-kw-i" placeholder="过滤卡片（_id / 字段值）…" />
                <span v-if="cardsKw.trim()" class="mono dq-json-mc">{{ cardHits.length }}/{{ resp.hits.length }}</span>
              </div>
            </template>
            <!-- 裁决「为什么不直接集成」:导出/全量导出/按查询删除收编表格
                 自带工具行(#bar-extra),独立底排重复按钮退役;RT 的导出本页=exportJson 事件桥 -->
            <template #bar-extra>
              <!-- 直方图开关三迁至直方图分布节头（被控对象旁）——
                   542/547 两代的 bar-extra 段首位退役，本段只留工具钮族 -->
              <!-- 原始 IO 快查——最近一次 /cluster/query 请求/响应原文（IndexHub docs/query 同款钮形） -->
              <button class="btn sm ghost rt-tool-btn" aria-label="查看原始 IO（DSL 查询）"
                title="最近一次查询的请求/响应原文（语义分档高亮 + 复制/curl 回放）" @click="openRawIo"><Terminal :size="13" /></button>
              <button class="btn sm ghost rt-tool-btn" title="导出当前页为 JSON" @click="exportJson"><FileDown :size="13" /> 导出本页</button>
              <n-popover v-if="!expRunning" trigger="click" placement="bottom-end" :show="expOpen" @update:show="(v: boolean) => (expOpen = v)">
                <template #trigger>
                  <button class="btn sm ghost rt-tool-btn" title="全量导出当前查询全部命中（PIT + search_after，破 10000 上限）"><FileDown :size="13" /> 全量导出</button>
                </template>
                <div class="exp-pop">
                  <div class="exp-t">全量导出 · PIT + search_after · 破 10000 上限</div>
                  <label class="exp-opt"><input type="radio" value="jsonl" v-model="expMode" /> 全文档 JSONL（每行一条，逐行导入/批处理）</label>
                  <label class="exp-opt"><input type="radio" value="values" v-model="expMode" /> 指定字段值数组（如 [1,2,3]，业务线下直用）</label>
                  <!-- 导出字段场景 keyword 置顶（值数组导出常打 keyword 业务字段；_id 非 mapping
                       字段不进候选集，手输保留） -->
                  <FieldPicker v-if="expMode === 'values'" v-model="expField" :index="store.pickedIdx" placeholder="字段，如 _id / order_id" :type-priority="['keyword']" :to="false" width="100%" class="exp-fp" />
                  <div class="exp-hint">
                    {{ expMode === 'values'
                      ? '导出该字段全部值的纯数组，缺失该字段的文档自动跳过'
                      : '每行 { _id, …源文档 }，单次上限 20 万条' }}
                  </div>
                  <button class="btn pri sm" style="width:100%" @click="expOpen = false; exportAll()">开始导出</button>
                </div>
              </n-popover>
              <button v-else class="btn sm danger rt-tool-btn" @click="cancelExport" title="取消本次全量导出">
                <X :size="13" /> 导出中 {{ fmtNum(expFetched) }}/{{ expTotal ? fmtNum(expTotal) : '…' }} 条
              </button>
              <button v-if="canOps" class="btn sm danger rt-tool-btn" @click="askDeleteByQuery" title="按当前 query 删除"><Trash2 :size="13" /> 按查询删除</button>
            </template>
          </ResultTable>
          <!-- alt 三视图体换装 AltHitsViews 统一件（与 IH docs/query 逐字重复
               三处的收口件；包裹 div 留宿主——类串与 --dq-view-cap 高度链是 551 黑名单/
               W1·402 字面锁面零触，56vh 现值不变；卡片内脏样式随迁组件 scoped）。
               json 件 ref="jsonBox" 承接 preEl expose——jsonFind 定位链等价迁移 -->
          <div v-show="view === 'json'" class="scroll-y dq-json-wrap dq-alt-body">
            <AltHitsViews ref="jsonBox" view="json" :json-html="jsonMarkedHtml" />
          </div>
          <div v-show="view === 'tree'" class="scroll-y dq-tree-view dq-alt-body">
            <AltHitsViews view="tree" :tree-data="jqResult !== null ? jqResult : (resp.hits || []).map(h => ({ _id: h._id, ...h._source }))" />
          </div>
          <div v-show="view === 'cards'" class="dq-cards scroll-y dq-alt-body">
            <!-- 卡片集走 cardHits 快滤（kw 空即全量）；565 换装共享件 -->
            <AltHitsViews view="cards" :hits="cardHits" @open-doc="openDoc" />
          </div>
        </div>
      </div>

      <!--  §1：未执行时的就绪空态，不留空白。：裸 .empty 收编 EmptyState 统一件 -->
      <EmptyState v-else-if="!queryErr" :icon="FileSearch"
        text="编写 DSL 后点击「执行」或按 Ctrl+Enter，命中结果、聚合与直方图将显示在这里" />
    </template>

    <!-- 文档详情 -->
    <n-modal v-model:show="docOpen" preset="card" :title="'文档 ' + (activeDoc?._id || '')" style="width:760px;max-width:94vw" :bordered="false">
      <template #header-extra>
        <div style="display:flex;gap:var(--sp-1h)">
          <!-- 克隆——复制一条改几个字段是高频造数据场景 -->
          <button class="btn sm" @click="cloneDoc" title="以此文档为模板新建（ID 重新生成）"><CopyPlus :size="13" /> 克隆</button>
          <!-- W2-3：情境入口——正看着这条文档时才会想到要跟另一个索引对比 -->
          <button class="btn sm" title="与另一个索引的同 ID 文档做字段级对比（只读）" @click="gotoCompare">
            <GitCompareArrows :size="13" /> 跨索引对比
          </button>
          <button class="btn sm" @click="docEditMode = !docEditMode">{{ docEditMode ? '预览' : '编辑' }}</button>
          <!-- 编辑器高度档钮（dq.docH useTierCycle 循环，title 实时回显当前档） -->
          <button v-if="docEditMode" class="btn sm ghost" :title="'编辑器高度档：' + docH + '（点击循环）'" @click="cycleDocH">高</button>
          <button v-if="docEditMode" class="btn sm pri" @click="saveDoc" title="全量替换该文档的 _source">保存（全量覆盖 _source）</button>
        </div>
      </template>
      <!-- 弹窗编辑器定高改视口弹性：min(60vh, 原值兜底)——矮屏不再顶出视口要滚两层，
           高屏保留原 420/360 上限不无限拉伸。
           两处定高升 useTierCycle 档（dq.docH/dq.docHNew 落盘，首档=原值
           零漂移），档钮在弹窗头/表单行（adhoc.piH 同范式，弹窗档位不算高度链变动） -->
      <MonacoEditor v-if="docEditMode" v-model="docEditText" :height="docH" :font-size="dqFont" />
      <div v-else class="scroll-y" style="max-height:48vh"><JsonTree :data="activeDoc?._source" tools /></div>
    </n-modal>

    <!-- 新建文档（克隆复用同一弹窗） -->
    <n-modal v-model:show="newDocOpen" preset="card" :title="newDocFrom ? '克隆文档（源 ' + newDocFrom + '）' : '新建文档 · ' + store.pickedIdx" style="width:760px;max-width:94vw" :bordered="false">
      <div class="nd-row">
        <label class="nd-lb">_id</label>
        <input v-model="newDocId" class="inp mono" placeholder="留空自动生成 UUID" style="flex:1" />
        <button class="btn sm ghost" title="用 mapping 字段类型生成 JSON 骨架（覆盖当前内容）" @click="newDocText = skeletonJson()">
          <Wand2 :size="12" /> 骨架预填
        </button>
        <!-- 编辑器高度档钮（dq.docHNew useTierCycle 循环） -->
        <button class="btn sm ghost" :title="'编辑器高度档：' + docHNew + '（点击循环）'" @click="cycleDocHNew">高</button>
      </div>
      <MonacoEditor v-model="newDocText" :height="docHNew" :font-size="dqFont" />
      <div class="nd-tip">
        <span v-if="!newDocValid" class="nd-bad">JSON 不合法，修正后才可写入</span>
        <template v-else>保存带 <span class="mono">refresh=true</span>，写入后自动重查立即可见；若 _id 已存在将覆盖同 ID 文档。</template>
      </div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="newDocOpen = false">取消</button>
          <button class="btn pri" :disabled="newDocSaving || !newDocValid" :title="newDocValid ? '' : 'JSON 不合法，无法写入'" @click="saveNewDoc">{{ newDocSaving ? '写入中…' : '写入文档' }}</button>
        </div>
      </template>
    </n-modal>

    <!--  W4：删除确认三处直挂 ConfirmModal 退役，收编全局 askConfirm
         （composables/confirm.ts）；facts 具名行/critical 守卫语义原样保留 -->

    <!-- 变量面板 -->
    <n-modal v-model:show="varsOpen" preset="card" title="查询变量 ${var}" style="width:520px;max-width:92vw" :bordered="false">
      <div class="vars-list">
        <div v-for="(v, k) in varsMap" :key="k" class="vars-row">
          <span class="mono vars-k">${{ '{' + k + '}' }}</span>
          <input class="inp mono" :value="v" @input="varsMap[k] = ($event.target as HTMLInputElement).value" />
          <button aria-label="删除该变量（仅影响本地模板变量，不碰索引）" class="btn sm ghost danger" title="删除该变量（仅影响本地模板变量，不碰索引）" @click="delete varsMap[k]"><X :size="11" /></button>
        </div>
        <div class="vars-row">
          <input class="inp mono" v-model="newVarK" placeholder="变量名" style="width:150px" />
          <input class="inp mono" v-model="newVarV" placeholder="值（JSON 或字符串）" @keydown.enter="addVar" />
          <button class="btn sm" @click="addVar">添加</button>
        </div>
      </div>
      <div class="vars-tip">用法：DSL 中写 <span class="mono">${'{field}'}</span>；引号内按字符串替换，裸值按 JSON 注入。</div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn pri" @click="saveVarsAll">保存</button>
        </div>
      </template>
    </n-modal>

    <!-- 历史面板 -->
    <n-modal v-model:show="histOpen" preset="card" title="查询历史" style="width:640px;max-width:92vw" :bordered="false">
      <!--  面板收编 QueryHistoryPanel 共享件（新增过滤/复制/清空；回放与删除仍走本视图逻辑）。
           actions 加 'curl'——行级一键复制 curl（面板行级仅 emit，命令组装归宿主 histCurl）。
           actions 加 'newtab'——历史行带到 DevTools 新 Tab（本页 openInDevTools
           _prefill 通道，历史行组装 body；面板行级仅 emit，组装归宿主 histNewTab） -->
      <QueryHistoryPanel
        :items="histRows" :actions="['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']"
        empty-text="执行查询（Ctrl+Enter）后自动记录，可一键回填重跑"
        @play="h => replayRow(h, true)" @fill="h => replayRow(h, false)" @del="removeRow" @clear="askClearHist"
        @fav="favHistRow" @curl="histCurl" @newtab="histNewTab"
      />
    </n-modal>

    <!-- 已保存：起为「保存的搜索」语义——DSL+表格布局一体快照，回放即还原现场 -->
    <n-modal v-model:show="savedOpen" preset="card" title="保存的搜索（DSL + 表格布局）" style="width:640px;max-width:92vw" :bordered="false">
      <!--  收编 QueryHistoryPanel 共享件（name 徽标 + 过滤 + 复制；重放/删除仍走本视图逻辑）。
           actions 加 'curl'（@curl 与历史面板共用 histCurl——两面板行同形自持 query/index） -->
      <QueryHistoryPanel
        :items="savedRows" :actions="['play', 'copy', 'rename', 'curl', 'del']" :clearable="false"
        empty-text="点工具条「保存」或按 Ctrl+S，把当前 DSL 存成常用查询"
        @play="row => replaySavedRow(row, true)" @del="removeSavedRow" @rename="renameSavedRow" @curl="histCurl"
      />
    </n-modal>

    <!-- 模板 -->
    <n-modal v-model:show="tplOpen" preset="card" title="查询模板" style="width:560px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel
        :items="tplRows" :actions="['play']" :clearable="false" clickable
        empty-text="暂无查询模板"
        @play="row => applyTpl(row.query)"
      />
    </n-modal>

    <!-- 保存查询命名 -->
    <!-- 保存查询命名：起同时快照表格布局 -->
    <n-modal v-model:show="saveOpen" preset="card" title="保存搜索" style="width:380px;max-width:92vw" :bordered="false">
      <input class="inp" v-model="saveName" placeholder="搜索名称" style="width:100%" @keydown.enter="confirmSave" @keydown.esc.prevent="saveName = ''" />
      <div style="font-size: var(--fs-xs);color:var(--tx2);margin-top:var(--sp-2)">将连同当前表格布局（排序 / 筛选 / 列选 / 冻结）一起保存，回放时还原现场。</div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn pri" :disabled="!saveName.trim()" @click="confirmSave">保存</button>
        </div>
      </template>
    </n-modal>

    <!-- 原始 IO 快查弹窗（IndexHub docs/query 同款——记录环取最近一次 /cluster/query） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, onActivated, nextTick, h, defineComponent, type PropType, type Ref } from 'vue';
import { NModal, NPopover } from 'naive-ui';
import {
  Database, Play, Save, History, Variable, Code2, FileDown, FileUp, Share2, AlignLeft, SlidersHorizontal, ChevronDown, Check, Workflow,
  LayoutTemplate, Filter, Flame, X, Trash2, Bookmark, OctagonX,
  FilePlus2, CopyPlus, Wand2, GitCompareArrows, ListTree, Clock, ExternalLink,
  ArrowLeftRight,
  AlertTriangle, FileSearch,
  TerminalSquare, Terminal, PanelBottomClose, PanelBottomOpen, } from 'lucide-vue-next';
import MonacoEditor from '../components/MonacoEditor.vue';
import ResultTable from '../components/ResultTable.vue';
import JsonTree from '../components/JsonTree.vue';
import AltHitsViews from '../components/AltHitsViews.vue'; /* ：alt 三视图体共享件（与 IH 同构体收口；IH 已于 换装接入） */
import Pagination from '../components/Pagination.vue';
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue'; /* ：手写 select 档统一件化 */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* 轨4：agg/cards kw 快滤胞换装统一件（sfbUnify650 锁；561「统一件归其他批次改造」预告兑现） */
/* AggBarChart 直引随直方图节换装 HistogramSection 退役（柱状图本体归组件内引） */
import HistogramSection from '../components/HistogramSection.vue';
import EmptyState from '../components/EmptyState.vue';
import RawIoModal from '../components/RawIoModal.vue';
/* 死导入清理：MetaStrip 已随清退役（无模板引用、无 spec 锚）；TookBadge 虽同为
   无模板引用死导入，但 queryWorkbenchW1.spec「P1 命中数常驻」源锚逐字钉死本 import 行
   （语义演进保留的面），契约锁在册故保留——删它属锁随迁职责（spec 非本批可改面）。 */
import TookBadge from '../components/TookBadge.vue';
/* MetaStrip 回归为本页活组件——执行行 A/B 增量与直方图节头 meta 两处手写
   「·」元信息串收编统一件（dot/text 形态，上方 「已随清退役」记档自此作废） */
import MetaStrip from '../components/MetaStrip.vue';
import { useRouter } from 'vue-router';
import { api, ioRecorder, type RawIoRec } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useQueryHistoryStore } from '../stores/queryHistory';
import { stripJsonComments, tryParse, prettyJson, highlightJson } from '../utils/jsonc';
import { friendlyEsError } from '../utils/esError'; /* ：六写路径裸 err 收编单源翻译 */
import { loadVars, saveVars, applyVars } from '../utils/vars';
import { useUrlState, usePref } from '../composables/urlState';
import { askConfirm } from '../composables/confirm';
import { generate, type CodeLang } from '../utils/codegen';
import { jq } from '../utils/minijq';
import { exportStamp, stdTimeToEpochMs, fmtNum, copyText, downloadText, totalOf  } from '../utils/format'; /* ：trunc 随卡片内脏迁 AltHitsViews（本页零引用退役） */
import { buildDocsDsl } from '../utils/workbench';
import { buildDsl } from '../utils/dslFromCell';
import { shardsHint } from '../utils/shardsHint';
import { pickHistField, buildHistAgg, sniffDateField } from '../utils/histField';
import { walkMappingTypes } from '../utils/mappingTypes';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest';
import { useIndexFieldTypes } from '../composables/useIndexFieldTypes';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { usePagerSize, PAGER_SIZES } from '../composables/usePagerSize';
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面板 pre v-html 内核；：errMeta 双参（错误码/失败端点一眼可辨） */
/* DSL→Lucene 一键翻译（语法桥纯函数，CmdPalette r30 出口同源） */
import { dslToLucene } from '../utils/dslToLucene';
import { encodeDslParam } from '../utils/queryHub';
import { EDITOR_H_TIERS, EDITOR_FONT_TIERS, type EditorHKey } from '../utils/editorTiers';
import { lintDsl, type Finding } from '../utils/dslLint';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import RootExtrasPane from '../components/builder/RootExtrasPane.vue';
import WorkbenchLayout from '../components/WorkbenchLayout.vue';
import SplitHandle from '../components/SplitHandle.vue';
import FieldPicker from '../components/FieldPicker.vue';
import { useTreeDslSync } from '../composables/useTreeDslSync';
/* 文档弹窗两处 Monaco 定高接档循环统一件（adhoc.piH/ih.settingsH·mapH 同范式） */
import { useTierCycle } from '../composables/useTierCycle';
import { useDebounceFn } from '../composables/useDebounceFn'; /* ：防抖统一件（卸载自动清 timer） */
import { useLinkCarry } from '../composables/useLinkCarry'; /* ：跨页一次性值携带统一件 */
import type { SearchHit, SearchResp } from '../types';

import { useHitNav } from '../composables/useHitNav';
import { useModalEnter } from '../composables/useModalEnter';
/* JSON 视图内搜索 mark 内核收编 respMark 单源（escapeRe/markHtmlAll，与 RestView 同源） */
import { markHtmlAll } from '../utils/respMark';
const store = useAppStore();
/* 权限门禁——新建文档/写入类入口需 OPERATOR+（VIEWER 不再看到会 403 的按钮） */
const auth = useAuthStore();
const canWrite = computed(() => auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/doc', store.target));
/* 权限写门——按查询删除是破坏性批量删，归 ops 档（与删除文档同档） */
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-by-query', store.target)); /* ：端点级连接感知——按查询删除走 delete-by-query 归属页 */
const router = useRouter();
/* DSL 结果表对齐索引工作区——双层列头类型徽标（field-types 数据源） */
const fieldTypes = useIndexFieldTypes(computed(() => store.pickedIdx || ''));

/* ═══ DSL 与执行 ═══ */
const DEFAULT_DSL = `{
  "query": { "match_all": {} },
  // 支持注释与 \${变量}
  "size": 20,
  "sort": []
}`;
/* DSL 草稿迁移 useScopedDraft（IndexHubView dslDraft 同语义；scope 含 index 维度，
   挂载时按 route+target+index 维度读取一次，之后只写不读）。
   旧 localStorage['es_dsl:<idx>'] 键做一次性读取迁移：新键为空且旧键有值时读旧键写入新键
   （写侧由 useScopedDraft 内建 watch 承担，凭据样键值落盘前掩埋），此后不再读旧键。 */
const dslScope = { route: 'query', index: () => store.pickedIdx || '' };
const dslDraft = useScopedDraft('dsl', dslScope, DEFAULT_DSL);
const dsl = dslDraft.text;
if (!dslDraft.restored.value && store.pickedIdx) {
  const legacy = localStorage.getItem('es_dsl:' + store.pickedIdx);
  if (legacy) dsl.value = legacy;
}
const running = ref(false);
/* ═══  P1-4：结果自动刷新（dbx auto-refresh 对位）═══
   档位 关/10s/30s/60s（usePref 记忆，不默认开——产线查询默认自动刷新是事故源）；
   重放走 execQuery(false)：不入查询历史（防 30s 一条刷爆历史面板）；
   guard=执行中或有待提交编辑时跳过本轮（编辑挂起重放会踩掉用户输入）；
   KeepAlive/页面隐藏/卸载的生命周期收口在 useAutoRefresh 内置 */
const autoRefreshSec = usePref('dq.autorefresh', 0) as Ref<number>;
const autoRefresh = useAutoRefresh(() => execQuery(false), {
  ms: () => autoRefreshSec.value * 1000,
  guard: () => !running.value && !(resultTbl.value as any)?.hasPending?.(),
});
watch(autoRefreshSec, v => autoRefresh.setOn(v > 0), { immediate: true });
/* 手写 select 退役换 AutoRefreshSelect 统一件——秒/毫秒换算桥
   （usePref 存秒的既有落盘键不变，组件 v-model:ms 契约是毫秒） */
const autoRefreshMs = computed<number>({
  get: () => autoRefreshSec.value * 1000,
  set: ms => { autoRefreshSec.value = Math.round(ms / 1000); },
});
const resp = ref<SearchResp | null>(null);
/*  P1-7：部分分片失败黄条（可关闭；新查询自动重新出现） */
const partialDismissed = ref(false);
const partialHint = computed(() => shardsHint(resp.value?.shards));
watch(() => resp.value, () => { partialDismissed.value = false; });
const queryErr = ref('');
/* 原始错误对象旁路（errMeta 读 code/endpoint，Xmigrate checkErrRaw 同款——
   catch 压串丢结构化字段，错误面板双参换装要喂原对象） */
const queryErrRaw = ref<unknown>(null);
/* URL 即现场：?page= 深链/刷新/分享恢复页码（q 同款 useUrlState；默认页 1 不占 URL）。
   urlPagePending：URL 带入的页码由首次 runQuery 消费（豁免一次「回页首」），
   否则挂载时恢复现场的自动重查会把恢复的页码踩回 1 */
const pageLink = useUrlState('page', '1');
let urlPagePending = (parseInt(pageLink.value, 10) || 0) > 1;
const page = ref(urlPagePending ? parseInt(pageLink.value, 10) : 1);
watch(page, v => { pageLink.value = String(v); });
/*  每页条数全站记忆——用户在任一表格改 pageSize，所有表格跟随
   （统一体验预期：用户设了 50/页，期望所有结果表都是 50/页）
   收编：手写裸读/裸写 es_pager_size 退役——读写+档位钳制（越档/坏值回落 20、
   旧 ihub.docsSize 兼容读）统一归 composables/usePagerSize，与 IndexHub docs/query tab 同源 */
const { size: pageSize, set: writePageSize } = usePagerSize();
const monacoRef = ref<InstanceType<typeof MonacoEditor>>();
/* ═══ ：Ctrl+I 唤起补全（DevTools 同键第二落点，Kibana 控制台同键）═══
   MonacoEditor getEditor() expose 出口接线（组件黑名单零改）。挂载时序：editor 在子组件
   onMounted 创建，watch(ref)+nextTick 后置取防 undefined；happy-dom stub 无 getEditor/
   addCommand 出口 → 守卫跳过（DevToolsView 同口径）。monaco 包走回调内动态 import——
   IndexHubView 1417 先例：本页行为锁 spec vi.mock MonacoEditor「斩断 monaco 导入链」，
   静态 import 会把真 monaco 拉进测试链。键位已登记 HotkeyPanel「查询与编辑」组。 */
watch(monacoRef, (mc) => {
  if (!mc) return;
  nextTick(() => {
    const ed = mc.getEditor?.();
    if (!ed || typeof ed.addCommand !== 'function') return;
    void import('monaco-editor/esm/vs/editor/editor.api').then((m) => {
      ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyI, () => {
        ed.trigger('', 'editor.action.triggerSuggest', null);
      });
    });
  });
}, { immediate: true });
/* ═══ W-A：编辑器高度四档（usePref 记忆，同 profileOn/autoHist 体系）═══
   EDITOR_HEIGHTS/EDITOR_H_TIERS 抽到 utils/editorTiers.ts（IndexHubView 后续复用）。
   高度链合一（实报「对半默认编辑器高度有问题/拉伸没用/回不去了」）——
   原双轨分裂：.dq-main 高度（CSS 34vh/拖柄落盘）与 Monaco 档位固定 px 是两套独立系统，
   dq-main 34vh 高但编辑器只 200px，余下全变空白带；拖柄调 dq-main 时编辑器不动。
   现 Monaco 恒在 pane 内 flex 填满，档位=S/M/L/满 驱动 .dq-main 高度档；拖柄拖动=自定义态
   （dq.mainH 落盘，四档钮全灭），点档位钮=重置回档位高度（显性还原入口）。 */
const DQ_MAIN_H: Record<EditorHKey, string> = {
  s: '260px',
  m: 'max(360px, 40vh)',
  l: 'max(480px, 56vh)',
  /* 满=视口高减顶部工具行/执行行/直方图节头/表格保底预算（dq-result min 320 仍可读） */
  full: 'max(360px, calc(100vh - var(--vh-offset, 210px) - 380px))',
};
const editorH = usePref<EditorHKey>('query.editorH', 's');
/* 编辑器字号三档（dq.font 落盘，默认 12.5=MonacoEditor 组件既有默认零漂移；
   DevTools dt.font 同源 EDITOR_FONT_TIERS 单源） */
const dqFont = usePref<number>('dq.font', 12.5);
/* 裁决二轮：检索参数块（RootExtrasPane+Profile 树）默认收起，展开态记忆 */
const paramsOpen = usePref('query.paramsOpen', false);
/* 20260920 三轮重排：双栏整体折叠节（裁决「查询条件树和 DSL 编辑器可整体折叠」）。
   缺省值裁决 false→true（实报「默认就应该是这样高度才对人」——表格默认
   吃满视口余量；行为变更记档：构建区默认收起，展开入口=工具行「查询构建与编辑」节头钮+
   表格头「还原」钮双入口常驻，usePref 记忆展开意图一次即永续） */
const buildCollapsed = usePref('query.buildCollapsed', true);
/* 折叠联动（「未执行+收起态打开参数更诡异」修治）——顶层构建区收起时
   检索参数块自动随之收起（子级展开态残留是诡异感来源）；展开侧不自动展开，还原动作
   交还用户显式操作。新交互立法记档。 */
watch(buildCollapsed, (collapsed) => { if (collapsed) paramsOpen.value = false; });
const queryCondCount = computed(() => queryTree.value?.root ? countNodes(queryTree.value.root) : 0);
/* QueryNode 子节点计数（bool 组递归；叶子计 1）——摘要展示用，与构建器条件数同口径 */
function countNodes(n: any): number {
  if (!n) return 0;
  if (n.type && n.type !== 'bool') return 1;
  const kids = [...(n.must || []), ...(n.should || []), ...(n.filter || []), ...(n.must_not || []), ...(n.children || [])];
  return kids.length ? kids.reduce((s: number, c: any) => s + countNodes(c), 0) : 1;
}
/* ═══ ：检索参数开关钮收起态摘要 ═══
   折叠时在「检索参数」文字旁渲染摘要串（从 queryTree 条件数 + DSL 顶层已设参数推导；
   展开态不显示——面板本体即摘要，返回空串 v-if 拦截）。形态「已设置 · size=20 · 其余默认」：
   非默认参数逐项点名（size 与每页条数不同/非零 from/非空 sort 才算已设），超出 3 项收敛
   「等」防挤爆执行行；全默认出「其余默认」单段。纯展示零交互（点击仍开合面板）。 */
const paramsSummary = computed(() => {
  if (paramsOpen.value) return '';
  const obj = (tryParse(applyVars(stripJsonComments(dsl.value))) || {}) as any;
  const parts: string[] = [];
  if (queryCondCount.value) parts.push(`条件 ${queryCondCount.value} 个`);
  if (typeof obj.size === 'number' && obj.size !== pageSize.value) parts.push('size=' + obj.size);
  /* ·实报「无效控制」：from 段退役——执行链恒 obj.from=(page-1)*pageSize
     覆盖，DSL 文本里的 from 是假信息（size 段保留：档外值如 500 不被注入，真实生效） */
  if (Array.isArray(obj.sort) && obj.sort.length) parts.push('sort');
  if (obj._source != null) parts.push('_source');
  if (obj.highlight && typeof obj.highlight === 'object' && Object.keys(obj.highlight).length) parts.push('highlight');
  if (obj.aggs && typeof obj.aggs === 'object' && Object.keys(obj.aggs).length) parts.push('aggs');
  if (obj.track_total_hits != null) parts.push('track_total_hits');
  /* 其余顶层键（collapse/profile/timeout 等少数派参数）原样点名 */
  const KNOWN = ['query', 'size', 'from', 'sort', '_source', 'highlight', 'aggs', 'track_total_hits'];
  for (const k of Object.keys(obj)) {
    if (KNOWN.includes(k) || obj[k] == null) continue;
    if (typeof obj[k] === 'object' && !Object.keys(obj[k]).length) continue;
    parts.push(k);
  }
  if (!parts.length) return '其余默认';
  return '已设置 · ' + parts.slice(0, 3).join(' · ') + (parts.length > 3 ? ' 等' : '') + ' · 其余默认';
});
/* 查询偏好持久化重构——手写 es_qry_prefs 收敛到既有 usePref
   封装（es-console.pref.*，SqlConsole lenient/Tasks·Topology autoRefresh 同款），
   复用纪律：Ref 直接供 v-model，usePref 内部 watch 落盘。profile 默认关、直方图默认开。 */
const profileOn = usePref('query.profile', false);
const autoHist = usePref('query.autoHist', true);
// 直方图聚合被 ES 拒过的索引（降级后本 session 不再注入）
const histBrokenIdx = new Set<string>();
// 手动重开直方图开关 = 明确要求重试，清掉当前索引的降级标记
watch(autoHist, (on) => { if (on) histBrokenIdx.delete(store.pickedIdx); });

/* dsl 实时镜像到 sessionStorage——命令面板「收藏当前 DSL / 送火焰图 / 翻译 Lucene」
   都读 es-console.dsl.body，此前无人写过，三个命令恒报「无内容」。
   同时镜像所属索引（es-console.dsl.index）——用户在别的页收藏/送火焰图时
   store.pickedIdx 可能已切到别的索引，payload 带错 index 会让 DSL 回放到错误的索引上。
   原 localStorage['es_dsl:<idx>'] 写侧退役（草稿持久化归 useScopedDraft），本 watch 只留镜像。 */
watch(dsl, (v) => {
  try {
    sessionStorage.setItem('es-console.dsl.body', v);
    if (store.pickedIdx) sessionStorage.setItem('es-console.dsl.index', store.pickedIdx);
  } catch { /* 存储满容忍 */ }
}, { immediate: true });

/* W2-2：反模式提示。debounce 250ms 避免每敲一个字符全量 lint；
   定位不到的 finding 收进 lintUnplaced，由模板降级成行内提示条列出（不静默丢）
   W-A：lintDsl 传入 mapping 字段表（idxFields 同源）启用字段类型错配四规则；
   'info' 级 finding（keyword-range）喂 setMarkers 前降级为 hint——MonacoEditor
   setMarkers 的结构类型只收 warning/hint（锁定文件，不改签名）。 */
const lintUnplaced = ref<Finding[]>([]);
const lintCtx = computed(() => ({ fields: idxFields.value }));
/* 手写 lintTimer 防抖换 useDebounceFn 统一件（尾值语义不变，250ms 同口径；
   卸载自动清 timer——原手写版靠 onBeforeUnmount 手清，统一件收编后该清理点退役） */
const queueLint = useDebounceFn((v: string) => {
  const parsed = tryParse(applyVars(stripJsonComments(v)));
  const findings = parsed ? lintDsl(parsed, lintCtx.value) : [];   // 非法 JSON 时不 lint（语法 marker 已在报）
  const r = monacoRef.value?.setMarkers(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
  lintUnplaced.value = r ? r.unplaced : [];
}, 250);
watch(dsl, (v) => queueLint(v), { immediate: true });

/* W1：条件树 ↔ DSL 双向同步（useTreeDslSync 承载防环/回解/冻结，dslTreeSync.spec 覆盖）。 */
const { tree: queryTree, stale: treeStale, onTreeUpdate, resyncNow } = useTreeDslSync(dsl);

/* P1 workbench：tree 宽度交 WorkbenchLayout 管理（偏好 key 含 target/route/mode/档位），
   旧 es_console_qb_split 由 useLayoutPreferences 在 route='/search' 首建时一次性迁移。 */
const wbScope = { target: store.target || 'host', route: '/search', mode: 'builder', profile: 'standard' as const };
const DSL_PANES: import('../components/WorkbenchLayout.vue').WorkbenchPaneSpec[] = [
  /*  v4: title 置空+不可折叠——竖排侧标退役，条件树即左面板本体；
     参数区(RootExtrasPane)移至右侧编辑器 pane，左树右参不再割裂。
     双栏互覆盖（裁决「条件树和 DSL 编辑器互相左右放大覆盖对方」）——
     两 pane 都声明 maximizable，柄档位钮循环 对半→条件树独占→编辑器独占。 */
  { id: 'query-builder.tree', role: 'tree', minSize: 360, defaultSize: 470, maxSize: 'available', maximizable: true, maxName: '条件树' },
  { id: 'query-builder.workspace', role: 'workspace', minSize: 360, defaultSize: 'flex', focusable: true, maximizable: true, maxName: '编辑器' },
];

/* 分栏档位 seg（节头行右侧点选）——柄上循环钮之外的显性档位入口，
   状态读写走 WorkbenchLayout expose（实报独占态「回不去」的根治）。
   toggle 语义补完（实报「按了就不显示/无法还原」穷举修治）——
   激活档再点=还原对半（分段控件通用心智）；还原双通道=本 seg + WL 独占隐藏侧还原竖轨。 */
const wlRef = ref<{ maximizedId: string | null; setMaximize: (id: string | null) => void } | null>(null);
function setSplitTier(tier: 'none' | 'tree' | 'ws') {
  if (tier !== 'none' && splitTier.value === tier) { wlRef.value?.setMaximize(null); return; }
  wlRef.value?.setMaximize(tier === 'tree' ? 'query-builder.tree' : tier === 'ws' ? 'query-builder.workspace' : null);
}
/* 双栏区高度拖拽（dq.mainH px 偏好落盘；语义=自定义态：
   >0 时覆写档位值，档位钮全灭；点档位钮清零回 DQ_MAIN_H 档位高度=「回不去」根治） */
const dqMainH = usePref<number>('dq.mainH', 0);
const dqMainStyle = computed(() => ({ height: dqMainH.value > 0 ? dqMainH.value + 'px' : DQ_MAIN_H[editorH.value] }));
const mainHandleSize = computed(() => dqMainH.value || Math.round(window.innerHeight * 0.34));
const mainHandleMax = computed(() => Math.round(window.innerHeight * 0.78));
function onMainResize(size: number) {
  dqMainH.value = Math.round(Math.max(220, size));
}
function onMainResizeEnd(size: number) {
  onMainResize(size);
}
/* 结果区高度拖拽（dq.resultH px 偏好落盘，实报「表格无法手动调高」
   ——双柄分工：上柄调双栏构建区=自定义态，本柄调结果区）。>0 时 .dq-result 定高
   （flex:0 0 auto + height，min-height:320 CSS 钳制保留），0=flex 消化零增量。
   拖动落盘 clamp：上限=视口高-260（vh-offset 210+余量 50）——flex 态下结果区本就占
   视口余量，定高语义=「拖大优先、页面滚动兜底」（probe-552 实证 1080p 视口按
   innerH-mainH-CHROME 扣双份会把上限压到恰好 min-height 320=拖柄无效，故不扣 mainH）；
   负值/极矮视口归 320 保底可读 */
const resultH = usePref<number>('dq.resultH', 0);
const dqMainEl = ref<HTMLElement | null>(null); /* 模板 ref：dq-main 实高供高度哨兵/其他观测（552 clamp 改版后 resize 不再扣 mainH，保留声明防模板 ref 悬空） */
const resultHandleSize = computed(() => resultH.value || Math.round(window.innerHeight * 0.4));
const resultHandleMax = computed(() => Math.max(320, Math.round(window.innerHeight - 260)));
const resultStyle = computed(() => resultH.value > 0 ? { flex: '0 0 auto', height: resultH.value + 'px' } : {});
/* 结果柄方向语义修正（实报「往下拉表格反而大了」根因实证）——SplitHandle
   增量=柄自身坐标基线+Δ，而结果柄在结果区上方：边界应随指针（VS Code 面板惯例），
   向下拖=结果区顶缘下移=高度应减，此前直接把柄增量当高度=方向反转。组件黑名单不可改，
   宿主侧 pointerdown/focus 快照锚做反向换算：resultH = 快照高 -（柄原始目标 - 快照柄位）。
   键盘路径（方向键）无 pointerdown，以 focus 快照补锚（柄 tabindex=0）。 */
let resultDragBaseH = 0;
let resultDragBaseRaw = 0;
function onResultDragAnchor() {
  resultDragBaseH = resultH.value > 0 ? resultH.value : resultHandleSize.value;
  resultDragBaseRaw = Math.round(Math.min(Math.max(320, resultHandleSize.value), resultHandleMax.value));
}
function onResultResize(raw: number) {
  const desired = resultDragBaseH - (raw - resultDragBaseRaw);
  const room = Math.round(window.innerHeight - 260);
  resultH.value = Math.round(Math.min(Math.max(320, desired), Math.max(320, room)));
}
function onResultResizeEnd(raw: number) { onResultResize(raw); }
function onResultReset() { resultH.value = 0; }
const splitTier = computed<'none' | 'tree' | 'ws'>(() => {
  const m = wlRef.value?.maximizedId ?? null;
  if (m === 'query-builder.tree') return 'tree';
  if (m === 'query-builder.workspace') return 'ws';
  return 'none';
});

/* 查询现场会话级恢复：最近一次主动执行的 DSL 按 target+索引 落 sessionStorage，
   切页签/切菜单/刷新/宿主 iframe 重建回到本页时自动重查，结果现场重现。
   sessionStorage 作用域=当前标签页会话：新开标签/次日进站不自动执行，不越权。 */
/* 时间转换器状态: 输入任意常见时间格式/epoch → 输出毫秒/秒/标准时间三行 */
const tcInput = ref('');
const tcOut = ref<Array<{ k: string; v: string }>>([]);
function tcConvert() {
  const t = tcInput.value.trim();
  if (!t) return;
  const out: Array<{ k: string; v: string }> = [];
  if (/^\d{10}$/.test(t)) out.push({ k: 'epoch 秒 → 毫秒', v: String(parseInt(t, 10) * 1000) });
  if (/^\d{13}$/.test(t)) out.push({ k: 'epoch 毫秒（原值）', v: t });
  const ms = stdTimeToEpochMs(t);
  if (ms != null) {
    out.push({ k: 'epoch 毫秒', v: String(ms) });
    out.push({ k: 'epoch 秒', v: String(Math.floor(ms / 1000)) });
    out.push({ k: 'ISO(UTC)', v: new Date(ms).toISOString() });
  }
  tcOut.value = out;
}

function qwSessionKey() { return 'es-console.qw.session:' + (store.target || 'host') + ':' + (store.pickedIdx || ''); }
function saveQwSession(d: string) {
  try { sessionStorage.setItem(qwSessionKey(), d); } catch { /* 存储满容忍 */ }
}
function restoreQwSession(): boolean {
  if (!store.pickedIdx) return false;
  let saved: string | null = null;
  try { saved = sessionStorage.getItem(qwSessionKey()); } catch { return false; }
  if (saved && saved !== dsl.value) { dsl.value = saved; return true; }
  return saved != null;
}
let suppressIdxDslLoad = false; // 分享还原时跳过一次 DSL 载入与自动重查
watch(() => store.pickedIdx, (n, o) => {
  if (n === o) return;
  const suppressed = suppressIdxDslLoad;
  suppressIdxDslLoad = false;
  /* DSL 草稿归 useScopedDraft（挂载时按索引维度读一次、之后只写不读）——
     切索引不再读 localStorage['es_dsl:<idx>'] 换稿，编辑器保留当前稿（未提交编辑不被切换
     覆盖丢失）；新索引的持久稿由下次进页挂载时的 scope 读取承担。 */
  resp.value = null;
  page.value = 1;
  hitsSort.value = null; /* 件2：切索引清排序态（RT 箭头随 syncSort 同步清） */
  jqResult.value = null;
  profileTree.value = null;
  brushRange.value = '';
  preBrushDsl = '';
  brushField = '';
  mappingFields.value = [];
  mappingDateFields.value = [];
  mappingFieldTypes.value = {};
  if (n) {
    /* 20260920 直方图竞态根治（切索引路径同款）：切索引即重查时等 mapping 到位再发，
       否则 guessDateField() 空 → __hist 不注入（直方图静默消失）；失败不阻塞 */
    const rerun = () => { if (o && !suppressed) runQuery(); };
    preloadMapping().then(rerun).catch(rerun);
  }
});

async function runQuery() {
  /* ?page= 深链恢复的首查豁免一次「回页首」（见 pageLink 处注释） */
  if (urlPagePending) urlPagePending = false;
  else page.value = 1;
  await execQuery(true);
}

/* 分页 */
const totalPages = computed(() => Math.max(1, Math.ceil((resp.value?.total || 0) / pageSize.value)));
/* P1 命中数常驻（res-bar）：总命中 + gte 下界标注 + 端到端耗时（TookBadge）。
   JSON/Tree 视图无翻页语义时 RT 工具行计数不可见，此处常驻兜底读数。
   记档：resMeta 现无模板消费（读数由 rt-info 常驻承担），但
   queryWorkbenchW1.spec「P1 命中数常驻」源锚逐字钉死本 computed 体
   （与 TookBadge import 行同批语义）——删除属锁随迁职责，非本批可删面 */
const resMeta = computed(() => {
  const r = resp.value;
  if (!r) return [];
  return [{ value: fmtNum(r.total) + (r.totalGte ? '+' : ''), label: '命中', tip: r.totalGte ? '命中数为下界（track_total_hits 截断）' : undefined }];
});
/* URL 即现场：页码超出总页数（深链页码过大/新查询命中变少）静默回 1，URL 参数随 useUrlState 默认值口径自动清出 */
watch(totalPages, tp => { if (page.value > tp) page.value = 1; });

/* 连续两次执行的 took/total 差值——调参/改写 DSL 前后的 A/B 对比直接可见 */
let prevRun: { took: number; total: number } | null = null;
const runDelta = computed(() => {
  if (!resp.value || !prevRun) return null;
  const dt = (resp.value.took ?? 0) - prevRun.took;
  const dtot = (resp.value.total ?? 0) - prevRun.total;
  if (!dt && !dtot) return null;
  const parts: string[] = [];
  if (dt) parts.push(`${dt > 0 ? '+' : ''}${dt}ms`);
  if (dtot) parts.push(`${dtot > 0 ? '+' : ''}${fmtNum(dtot)} 条`);
  return {
    txt: 'Δ ' + parts.join(' · '),
    cls: dt < 0 ? 'faster' : dt > 0 ? 'slower' : '',
    tip: `与上次执行对比（A/B 调参参考）：上次 ${prevRun.took}ms / ${fmtNum(prevRun.total)} 条`,
  };
});
async function goPage(p: number) {
  const np = Math.min(Math.max(1, p), totalPages.value);
  if (np === page.value || running.value) return;
  page.value = np;
  await execQuery();
}
/* （实报「点每页条数不生效」）：执行发起方仲裁标志——分页器发起的执行
   （setPageSize 链路）里，DSL 顶层旧 size 不得反向回滚用户刚点的分页档；DSL size 反向
   同步（）仅在非分页驱动的执行生效。execQuery 同步段（含 size 同步块）在
   首个 await 前执行完毕，置位窗恰好覆盖。 */
let pagerDrivenRun = false;
function setPageSize(s: number) {
  pagerDrivenRun = true;
  try {
    writePageSize(s); /* 统一件写侧：同步 ref + 落 es_pager_size 共享键 */
    page.value = 1;
    execQuery();
  } finally {
    pagerDrivenRun = false;
  }
}
/* ══ 件2（实报「这些排序能不能真实查询语句命中，而不是可视窗口」）：表头排序
   下推 DSL sort 子句真实重查——此前 RT 本地排序链只排当前页可视行（770 条/39 页=假排序）；
   接线 535/ remote 契约（IndexHub docs 表同范式）。写侧回写编辑器文本=点名
   「真实查询语句」可见（796「分页不回写文本」裁决系 size 数字档语境，sort 由令升级
   推翻记档——797 推翻 556 同构）；text 列写 .keyword 子字段（fielddata 400 预防）。══ */
const hitsSort = ref<{ f: string; d: 'asc' | 'desc' } | null>(null);
const hitsSortSync = computed(() => hitsSort.value
  ? { f: hitsSort.value.f, d: (hitsSort.value.d === 'asc' ? 1 : -1) as 1 | -1 }
  : null);
function writeSortToDsl(s: { f: string; d: 'asc' | 'desc' } | null): boolean {
  const cleaned = applyVars(stripJsonComments(dsl.value));
  const obj = tryParse(cleaned) as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    store.notify('error', 'DSL 不是合法 JSON（已剥离注释后校验），无法写入排序');
    return false;
  }
  if (!s) delete obj.sort;
  else {
    const f = mappingFieldTypes.value[s.f] === 'text' ? s.f + '.keyword' : s.f;
    obj.sort = [{ [f]: { order: s.d, unmapped_type: 'long' } }];
  }
  dsl.value = JSON.stringify(obj, null, 2);
  return true;
}
function onHitsSortChange(s: { f: string; d: 'asc' | 'desc' } | null) {
  hitsSort.value = s;
  if (!writeSortToDsl(s)) return;
  page.value = 1; /* 排序变更后旧页码无意义（真分页序变） */
  void execQuery();
}

async function execQuery(recordHist = false) {
  if (running.value) return; /* ：并发重入守卫——Monaco @execute 与 RT @refresh 路径此前无守卫，连按 Ctrl+Enter 会覆盖 abortCtl 丢请求（window 全局键路径 onGlobalRunKey 已有同款守卫） */
  if (!store.pickedIdx) return;
  const cleaned = applyVars(stripJsonComments(dsl.value));
  if (!tryParse(cleaned)) {
    store.notify('error', 'DSL 不是合法 JSON（已剥离注释后校验）');
    return;
  }
  running.value = true;
  queryErr.value = '';
  queryErrRaw.value = null;
  jqResult.value = null;
  profileTree.value = null;
  // 执行中读秒 + 可取消——慢查询不再只能干等
  // 后台标签页短路（useNow 561 范式，本视图内本地 timer 副本）——hidden 时 tick 纯属空转
  abortCtl = new AbortController();
  elapsedMs.value = 0;
  const t0 = Date.now();
  elapsedTimer = window.setInterval(() => { if (document.hidden) return; elapsedMs.value = Date.now() - t0; }, 100);
  // 记下上次执行的 took/total，本轮回来后显示差值——调参前后 A/B 对比不靠肉眼记
  if (resp.value) prevRun = { took: resp.value.took ?? 0, total: resp.value.total ?? 0 };
  if (recordHist) pushHistory(dsl.value);
  try {
    /* 直方图注入双分支共用（Profile 模式此前漏注入——实报「直方图还没显示」截图实证：
       Profile 勾选下 MatchAllDocsQuery 耗时树在而直方图无）。
       Profile 端点=body 透传 _search+profile:true，aggregations 原样返回，注入无副作用。 */
    const obj = tryParse(cleaned) || {};
    // 该索引直方图聚合已被 ES 拒过（字段类型不支持）则本 session 不再注入
    let injectedHist = false;
    if (autoHist.value && !histBrokenIdx.has(store.pickedIdx) && !cleaned.includes('date_histogram')) {
      const dateField = guessDateField();
      if (dateField) {
        obj.aggs = obj.aggs || {};
        // 字段类型分档选聚合体（keyword→terms，其余→date_histogram 系），纯函数见 histField.ts
        obj.aggs.__hist = buildHistAgg(dateField, mappingFieldTypes.value[dateField], store.verBelow('6.5.0'));
        injectedHist = true;
      }
    }
    /* ·实报：DSL 顶层显式档内 size 反向驱动分页档——此前 size 恒被下行
       静默覆盖为分页档，执行行摘要串「size=20」与实际执行窗口（分页档 100）不符；
       现档内（PAGER_SIZES）显式 size 先落共享键同步分页器，from/size 全链按同一档生成，
       摘要/编辑器/分页器三处一致。档外（500 等）或缺席照旧注入分页档（现状语义不变）。
       分页器改档不回写 DSL 文本（程序化改手排 JSON 有毁稿风险，记档不做）。 */
    /* 分页驱动执行（setPageSize）时让位：DSL 旧 size:20 不得回滚用户刚点的档（796 根因刀） */
    if (!pagerDrivenRun && typeof obj.size === 'number' && PAGER_SIZES.includes(obj.size) && obj.size !== pageSize.value) {
      writePageSize(obj.size);
    }
    /* 件2：DSL sort 反向同步——手改语句/模板重放执行后表头箭头随真实 sort 态
       （obj.sort[0] 双形态兼容：{f:{order}} 对象档与 {f:'desc'} 简写档；.keyword 剥壳回列名） */
    const so = Array.isArray(obj.sort) && obj.sort[0] ? obj.sort[0] as Record<string, unknown> : null;
    if (so) {
      const sf = Object.keys(so).find(k => k !== 'unmapped_type') || '';
      const inner = so[sf];
      const d = ((inner && typeof inner === 'object' ? (inner as Record<string, unknown>).order : inner) === 'desc') ? 'desc' : 'asc';
      const bare = sf.endsWith('.keyword') ? sf.slice(0, -'.keyword'.length) : sf;
      if (bare) hitsSort.value = { f: bare, d };
    } else if (hitsSort.value) hitsSort.value = null;
    obj.from = (page.value - 1) * pageSize.value;
    obj.size = pageSize.value;
    const bodyJson = JSON.stringify(obj);
    try {
      if (profileOn.value) {
        const raw = await api.profile(store.pickedIdx, bodyJson, abortCtl.signal);
        const parsed = tryParse(typeof raw === 'string' ? raw : JSON.stringify(raw));
        resp.value = normalizeResp(parsed);
        if (parsed?.profile?.shards?.[0]?.searches?.[0]?.query?.[0]) {
          profileTree.value = parsed.profile.shards[0].searches[0].query[0];
          profileTotal.value = profileTree.value.time_in_nanos || 1;
        }
      } else {
        /* 过 normalizeResp 归一——此前裸赋值，缺 hits 键（mock/后端异常形态）直落模板炸 .map（544 交接 prod 炸点） */
        resp.value = normalizeResp(await api.clusterQuery(store.pickedIdx, bodyJson, 100, abortCtl.signal));
      }
    } catch (e: any) {
      // 我们自动注入的辅助直方图聚合失败不许连坐主查询——剥掉 __hist 降级重试一次
      //（产线事故：嗅探选错字段/字段非日期型时，ES 400 把成功的主查询也报成「查询失败」）
      if (!injectedHist || e?.name === 'AbortError') throw e;
      delete obj.aggs.__hist;
      if (!Object.keys(obj.aggs).length) delete obj.aggs;
      const bareJson = JSON.stringify(obj);
      if (profileOn.value) {
        const raw = await api.profile(store.pickedIdx, bareJson, abortCtl.signal);
        const parsed = tryParse(typeof raw === 'string' ? raw : JSON.stringify(raw));
        resp.value = normalizeResp(parsed);
        if (parsed?.profile?.shards?.[0]?.searches?.[0]?.query?.[0]) {
          profileTree.value = parsed.profile.shards[0].searches[0].query[0];
          profileTotal.value = profileTree.value.time_in_nanos || 1;
        }
      } else {
        resp.value = normalizeResp(await api.clusterQuery(store.pickedIdx, bareJson, 100, abortCtl.signal));
      }
      histBrokenIdx.add(store.pickedIdx);
      brushField = '';
      store.notify('info', '直方图聚合不适用于该索引（字段类型不支持），已自动降级为纯查询');
    }
    /* 20260920 直方图二次补齐（真机产线实报「未识别到可作直方图的字段」）：inspect 被权限
       拒绝（403，mappingDateFields 空）时首查无法预注入——响应回来后从 hits 值形态补嗅探
       （epoch 毫秒/秒/ISO 串），命中则自动重放一次带 __hist 的查询（不重复记历史；重放失败
       走既有降级拉黑，天然收敛无死循环）。deng_test_x1 产线实锤 issueTime/createTime 均为
       epoch 毫秒可画。 */
    if (!injectedHist && autoHist.value && resp.value && !histBrokenIdx.has(store.pickedIdx)) {
      const sniffed = sniffDateField(resp.value.hits as any);
      if (sniffed) {
        const obj2 = tryParse(cleaned) || {};
        obj2.aggs = obj2.aggs || {};
        obj2.aggs.__hist = buildHistAgg(sniffed, mappingFieldTypes.value[sniffed], store.verBelow('6.5.0'));
        obj2.from = (page.value - 1) * pageSize.value;
        obj2.size = pageSize.value;
        try {
          const r2 = await api.clusterQuery(store.pickedIdx, JSON.stringify(obj2), 100, abortCtl.signal);
          /* 同过 normalizeResp 双形态归一——clusterQuery 返回 Java 转换形态
             （hits 已是行数组），归一函数按行数组形态透传 rows（ES 双层包裹口径不受影响）；
             此前裸赋值在缺 hits 键时直落模板炸 .map（544 交接 prod 炸点同族） */
          resp.value = normalizeResp(r2);
        } catch {
          histBrokenIdx.add(store.pickedIdx);
          store.notify('info', '直方图聚合不适用于该索引（字段类型不支持），已自动降级为纯查询');
        }
      }
    }
    /* 执行成功（try 未抛）才记跨模式历史，与旧 DSL 历史（pushHistory 先记）并存 */
    /* 记录查询耗时用于慢查询回溯与调优对比 */
    if (recordHist) {
      const took = resp.value?.took;
      useQueryHistoryStore().push('dsl', dsl.value, store.pickedIdx, took);
      const h0 = history.value.find(h => h.dsl === dsl.value && h.idx === store.pickedIdx);
      if (h0 && took != null) h0.took = took; /* 534 P1：耗时回填（pushHistory 先记后补口径） */
      if (h0?.ok === false) { h0.ok = true; localStorage.setItem(HIST_KEY, JSON.stringify(history.value)); } /* ：重试成功翻转红点 */
      saveQwSession(dsl.value);
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      // 用户主动取消：不算错误，给个轻提示即可
      store.notify('info', `已取消查询（${(elapsedMs.value / 1000).toFixed(1)}s）`);
    } else {
      queryErr.value = e?.message || String(e);
      queryErrRaw.value = e; /* ：原始对象旁路（errMeta 读 code/endpoint） */
      /* 失败也标记历史（旧历史条目+跨模式 store 双路 ok:false 红点）——重试有入口，失败不该消失 */
      if (recordHist) {
        try {
          const h0 = history.value.find(h => h.dsl === dsl.value && h.idx === store.pickedIdx);
          if (h0) { h0.ok = false; localStorage.setItem(HIST_KEY, JSON.stringify(history.value)); }
          useQueryHistoryStore().push('dsl', dsl.value, store.pickedIdx, -1, false);
        } catch { /* 历史失败不阻塞错误提示 */ }
      }
      /* 失败 toast 行动化——msg 传原始错误（friendlyEsError 翻译+
         自动「复制原始」），再并「查看诊断」直达 /diag；旧文案「查询失败」两字经
         友好化原样返回，恰好绕过了自动 action（shown===msg），是全站唯一光杆错误 toast */
      store.notify('error', queryErr.value, {
        actions: [{ label: '查看诊断', onClick: () => { router.push('/diag'); } }],
      });
    }
  } finally {
    running.value = false;
    abortCtl = null;
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = 0; }
  }
}

/* 长查询取消 */
const elapsedMs = ref(0);
let elapsedTimer = 0;
let abortCtl: AbortController | null = null;
function cancelQuery() { abortCtl?.abort(); }

function normalizeResp(parsed: any): SearchResp {
  /* 双形态归一——ES 原始双层包裹（hits 为 {total, hits:[…]} 信封）与
     Java 转换形态（hits 已是行数组，api.clusterQuery 直返）同收。此前 870/888/911 三处
     clusterQuery 裸赋值绕过归一，缺 hits 键（mock/后端异常形态）直落模板炸 .map
     （交接在册 prod 炸点）；归一后缺 hits 补 []，行数组形态 total 取 parsed.total
     （totalOf 只认信封 total 字段，数组属主上没有）。 */
  const hitsWrap = parsed?.hits;
  const rows = Array.isArray(hitsWrap) ? hitsWrap : (hitsWrap?.hits || []);
  const norm = Array.isArray(hitsWrap)
    ? { value: Number(parsed?.total) || 0, gte: !!parsed?.totalGte }
    : totalOf(hitsWrap);
  /* W-A：透传 highlight——RootExtrasPane 配的 pre_tags/fragment_size 此前在 normalize 被丢弃，
     结果表永远看不到高亮片段；片段含 ES 直出 HTML，渲染侧 ResultTable.hlSafe 净化后展示 */
  const hits = rows.map((h: any) => ({ _id: h._id, _index: h._index, _score: h._score, _source: h._source || {}, ...(h.highlight ? { highlight: h.highlight } : {}) }));
  /*  P1-7：透传分片统计——failed/timed_out>0 时结果可能不完整，UI 诚实呈现 */
  return { total: norm.value, totalGte: norm.gte, hits, aggregations: parsed?.aggregations, took: parsed?.took, shards: parsed?._shards ?? null };
}

/* ═══ 字段面板 + 补全（mapping 预载 + hits 补充） ═══ */
const mappingFields = ref<string[]>([]);
const mappingDateFields = ref<string[]>([]);
/* 直方图 terms 回退用：字段名 → mapping 声明类型（date 才走 date_histogram，其余走 terms） */
const mappingFieldTypes = ref<Record<string, string>>({});
const mappingProps = ref<any>(null); // ：保留原始 properties 树，新建文档骨架预填用
const mappingState = ref<'loading' | 'ok' | 'err'>('loading');
/* W4-T14：builder 字段源并轨 useIndexFields（mappingDetail 出口）——与 FieldPicker/LuceneInput
   统一管线，消除 clusterInspect 双管线漂移；dslAssist 字段档吃同一 fields 闭包现调现读。
   clusterInspect 管线保留：直方图 date 字段、新文档骨架、字段提示条（职责不同，非双轨）。 */
const { fields: idxFields, ensure: ensureIdxFields } = useIndexFields(() => store.pickedIdx);
const builderFields = computed(() => idxFields.value.map(f => f.path));
const builderTypes = computed(() => Object.fromEntries(idxFields.value.map(f => [f.path, f.type])));
/* dslAssist 闭包必须在 setup 作用域声明：模板内联对象字面量的箭头函数在非 inline 编译下
   走 _ctx 代理，ref 被顶层 unwrap 后 .value 取到 undefined（渗透 spec ①a 红灯实证）。
   setup 常量对象的函数字段不被 unwrap，闭包内引用 setup 局部 ref——两种编译模式都正确。 */
/* P2 接线（655 设计记档 D4 首发消费面=QueryHub dsl 模式面板）——useTermsSuggest
   suggestAsync 直挂 terms 通道（防抖/缓存/stash 全套白得）；未选索引/通道异常恒 resolve []
   （535 契约），MonacoEditor 侧窄守卫 fields 查无亦零请求零候选。 */
const termsSuggest = useTermsSuggest(() => store.pickedIdx);
const dslAssist = { fields: () => idxFields.value, terms: (f: string, p: string) => termsSuggest.suggestAsync(f, p) };
async function preloadMapping() {
  if (!store.pickedIdx) return;
  ensureIdxFields(); // 并轨字段源同点预载（不 await——零降级，失败仅 builder 无候选）
  mappingState.value = 'loading';
  try {
    const r = await api.clusterInspect(store.pickedIdx, 1);
    const fields: string[] = [];
    const dates: string[] = [];
    const types: Record<string, string> = {};
    mappingProps.value = null;
    for (const idx of Object.keys(r?.mappings || {})) {
      const props = (r as any).mappings[idx]?.properties;
      const got = walkMappingTypes(props);
      fields.push(...got.fields);
      dates.push(...got.dates);
      Object.assign(types, got.types);
      if (!mappingProps.value && props) mappingProps.value = props;
    }
    mappingFields.value = [...new Set(fields)].sort();
    mappingDateFields.value = [...new Set(dates)];
    mappingFieldTypes.value = types;
    mappingState.value = 'ok';
  } catch { mappingState.value = 'err'; /* inspect 失败不阻塞字段面板，但要如实告知可重试 */ }
}
const fieldList = computed(() => {
  const set = new Set<string>(mappingFields.value);
  /* 同族守卫——hits 缺键/行缺 _source 不炸（normalizeResp 已归一，此为防御冗余） */
  (resp.value?.hits || []).forEach(h => Object.keys(h._source || {}).forEach(k => set.add(k)));
  return [...set].sort();
});

/* ═══ 直方图 + brush ═══ */
const histBuckets = computed(() => {
  const b = (resp.value?.aggregations as any)?.__hist?.buckets;
  return Array.isArray(b) ? b : [];
});
/* 裁决「无时间索引要有提示」：mapping 已加载且无 date 字段 → 开关旁即时标注
   （选索引即提示，不用等执行后看说明条；hits 值形态嗅探兜底仍在） */
const histNoDateField = computed(() => mappingState.value === 'ok' && !mappingDateFields.value.length);
/* 20260920 二轮：直方图节可折叠（默认展开，usePref 记忆；histSecOpen 避让历史面板 histOpen） */
const histSecOpen = usePref('query.histSecOpen', true);
/* 20260920 直方图可见性自证：执行了查询但无直方图时给出原因（此前静默不渲染，
   用户无法区分「没有直方图字段」还是「坏了」——实报「仍然看不到直方图」体验病灶） */
const histWhy = computed(() => {
  if (!resp.value || histBuckets.value.length) return '';
  if (!autoHist.value) return '直方图开关未勾选——勾选后执行查询将自动注入聚合';
  if (histBrokenIdx.has(store.pickedIdx)) return '该索引直方图聚合此前被 ES 拒绝（session 内自动降级）——重开「直方图」开关可重试';
  if (mappingState.value === 'err') return 'mapping 加载失败或无索引工作区权限——已自动从结果值形态嗅探日期字段（epoch/ISO），无匹配则无直方图';
  if ((resp.value.aggregations && Object.keys(resp.value.aggregations).length)) return 'DSL 自带聚合，未注入辅助直方图';
  return '未识别到可作直方图的字段（需 date / keyword / 数值型，且值形态匹配）——若预期有请检查 mapping';
});
/* 节头 meta 三态（桶数/原因/未执行）——hist-why 独立行并入节头后由它承接
   消静默语义（无桶时节头恒在场，原因直接读得见） */
const histHeadMeta = computed(() => {
  if (histBuckets.value.length) return histBuckets.value.length + ' 桶';
  if (!resp.value) return '执行查询后生成';
  return histWhy.value || '未生成';
});
const brushRange = ref('');
let brushField = '';
let preBrushDsl = '';
function guessDateField(): string {
  if (brushField) return brushField;
  // 选字段交给纯函数——mapping date 字段优先，hits 嗅探只认值形态，
  // 根治 sen「time」ntId 这类字段名误伤（长 ID 被当日期塞进 date_histogram 直接 400）
  brushField = pickHistField(mappingDateFields.value, resp.value?.hits || []);
  return brushField;
}
function onBrush(from: any, to: any) {
  const field = guessDateField();
  if (!field) return;
  if (!brushRange.value) preBrushDsl = dsl.value;
  const obj = tryParse(applyVars(stripJsonComments(dsl.value))) || {};
  obj.query = obj.query && Object.keys(obj.query).length
    ? { bool: { must: [obj.query], filter: [{ range: { [field]: { gte: from.key, lte: to.key } } }] } }
    : { range: { [field]: { gte: from.key, lte: to.key } } };
  dsl.value = JSON.stringify(obj, null, 2);
  brushRange.value = `${from.key_as_string || from.key} → ${to.key_as_string || to.key}`;
  runQuery();
}
function clearBrush() {
  brushRange.value = '';
  if (preBrushDsl) {
    dsl.value = preBrushDsl;
    preBrushDsl = '';
    runQuery();
  }
}

/* ═══ Terms 聚合面板 ═══
   W-A：TermsAgg 增 total（全部桶 doc_count 合计，占比分母）与 rest（slice 折叠掉的桶数） */
interface TermsAgg { name: string; buckets: { key: any; key_as_string?: string; doc_count: number }[]; total: number; rest: number }
const TERMS_SLICE = 12;
const termsAggs = computed<TermsAgg[]>(() => {
  const aggs = resp.value?.aggregations as any;
  if (!aggs || typeof aggs !== 'object') return [];
  const out: TermsAgg[] = [];
  for (const [name, v] of Object.entries<any>(aggs)) {
    if (name === '__hist') continue;
    if (Array.isArray(v?.buckets) && v.buckets.length) {
      const total = v.buckets.reduce((s: number, b: any) => s + (b?.doc_count || 0), 0);
      out.push({ name, buckets: v.buckets.slice(0, TERMS_SLICE), total, rest: Math.max(0, v.buckets.length - TERMS_SLICE) });
    }
  }
  return out;
});
function maxOf(a: TermsAgg) { return Math.max(1, ...a.buckets.map(b => b.doc_count)); }
/** W-A：桶占比（分母=该聚合全部桶合计，含折叠部分；空聚合不出百分号） */
function pctOf(a: TermsAgg, b: TermsAgg['buckets'][number]): string {
  if (!a.total || !b.doc_count) return '';
  return ((b.doc_count / a.total) * 100).toFixed(1) + '%';
}

/* ═══ ：卡片视图/terms 桶行 kw 快滤（宿主侧过滤，纯展示层——DSL/查询不动）═══
   形态对齐 Xmigrate xm-jobs-kw 胞（最小 input + Esc 清空）。cardsKw 卡片集过滤
   （_id 或任一 _source 值含子串即保留，大小写不敏感）；aggKw terms 桶行过滤（key 含子串，
   全空聚合节整体隐去；占比/合计分母仍吃全量桶不重算）。 */
const cardsKw = ref('');
const cardHits = computed(() => {
  const hits = resp.value?.hits || [];
  const k = cardsKw.value.trim().toLowerCase();
  if (!k) return hits;
  return hits.filter(h =>
    String(h._id ?? '').toLowerCase().includes(k) ||
    Object.values(h._source || {}).some(v => String(v ?? '').toLowerCase().includes(k)));
});
const aggKw = ref('');
const termsAggsView = computed(() => {
  const k = aggKw.value.trim().toLowerCase();
  if (!k) return termsAggs.value;
  return termsAggs.value
    .map(a => ({ ...a, buckets: a.buckets.filter(b => String(b.key_as_string ?? b.key).toLowerCase().includes(k)) }))
    .filter(a => a.buckets.length);
});

/* ═══ W-A：metric 聚合值卡 ═══
   avg/sum/min/max/cardinality 等单值、stats/extended_stats 多键、percentiles 迷你表、
   top_hits 只报条数——此前这些聚合结果完全不可见（hits 空时结果区空白） */
interface MetricAgg { name: string; kindLabel: string; rows: { k: string; v: string }[] }
const metricAggs = computed<MetricAgg[]>(() => {
  const aggs = resp.value?.aggregations as any;
  if (!aggs || typeof aggs !== 'object') return [];
  const out: MetricAgg[] = [];
  for (const [name, v] of Object.entries<any>(aggs)) {
    if (name === '__hist' || !v || typeof v !== 'object') continue;
    if (Array.isArray(v.buckets)) continue; // terms/date_histogram 已由 termsAggs 渲染
    if (v.values && typeof v.values === 'object' && !Array.isArray(v.values)) {
      out.push({ name, kindLabel: '分位', rows: Object.entries<any>(v.values).map(([k, n]) => ({ k: k + '%', v: fmtNum(Number(n)) })) });
      continue;
    }
    if (v.hits && typeof v.hits === 'object') {
      const n = typeof v.hits.total?.value === 'number' ? v.hits.total.value : (Array.isArray(v.hits.hits) ? v.hits.hits.length : 0);
      out.push({ name, kindLabel: 'TopHits', rows: [{ k: '命中条数', v: fmtNum(n) }] });
      continue;
    }
    const statKeys = ['count', 'min', 'max', 'avg', 'sum'].filter(k => typeof v[k] === 'number');
    if (statKeys.length >= 3) {
      out.push({ name, kindLabel: '统计', rows: statKeys.map(k => ({ k, v: fmtNum(v[k]) })) });
      continue;
    }
    if (typeof v.value === 'number') {
      out.push({ name, kindLabel: '指标', rows: [{ k: '值', v: fmtNum(v.value) }] });
      continue;
    }
    if (typeof v.doc_count === 'number') {
      // filter/global 等单桶包装——至少让计数可见
      out.push({ name, kindLabel: '桶', rows: [{ k: 'doc_count', v: fmtNum(v.doc_count) }] });
    }
  }
  return out;
});

/* ═══ W-A：聚合桶下钻 ═══
   点击=向当前 query 追加 term filter（复用 dslFromCell.buildDsl：text 字段自动转 match），
   Alt+点击=must_not 排除；组装手法与 onBrush 同款（既有 query 整体入 must），notify 提示可撤销感 */
function drillAgg(a: TermsAgg, b: TermsAgg['buckets'][number], exclude: boolean) {
  const obj = (tryParse(applyVars(stripJsonComments(dsl.value))) || {}) as any;
  const field = obj.aggs?.[a.name]?.terms?.field;
  if (typeof field !== 'string' || !field) {
    store.notify('warning', `聚合「${a.name}」未找到 terms 字段，无法生成下钻条件`);
    return;
  }
  const key = b.key_as_string ?? b.key;
  const built = buildDsl(field, [key], builderTypes.value[field]);
  if (!built) return;
  if (obj.query && Object.keys(obj.query).length) {
    obj.query = { bool: exclude ? { must: [obj.query], must_not: [built] } : { must: [obj.query], filter: [built] } };
  } else {
    obj.query = exclude ? { bool: { must_not: [built] } } : built;
  }
  dsl.value = JSON.stringify(obj, null, 2);
  store.notify('info', (exclude ? '已排除 ' : '已下钻 ') + field + '=' + key + '（条件已追加进 DSL，编辑器内可撤销）');
  runQuery();
}

/* ═══ RT 行内标签下钻消费端（filter-hit）═══
   emit 由 ResultTable 新增（W7 批：cell 右键「以此值过滤并重查」，payload={field,value,op}；
   W7 未合流时本监听 inert 无害）。组装与 drillAgg 同款：buildDsl → 并入当前 query → 重查；
   op（term/match）语义由 buildDsl 按字段类型路由（text→match、其余→term）承担 */
function onFilterHit(p: { field: string; value: unknown; op?: 'term' | 'match' }) {
  if (!p?.field) return;
  const obj = (tryParse(applyVars(stripJsonComments(dsl.value))) || {}) as any;
  const built = buildDsl(p.field, [p.value], builderTypes.value[p.field]);
  if (!built) return;
  if (obj.query && Object.keys(obj.query).length) {
    obj.query = { bool: { must: [obj.query], filter: [built] } };
  } else {
    obj.query = built;
  }
  dsl.value = JSON.stringify(obj, null, 2);
  store.notify('info', '已下钻 ' + p.field + '=' + String(p.value) + '（条件已追加进 DSL，编辑器内可撤销）');
  runQuery();
}

/* ═══ 视图切换 ═══ */
const views = [
  { k: 'table', t: '表格' }, { k: 'json', t: 'JSON' }, { k: 'tree', t: 'Tree' }, { k: 'cards', t: '卡片' },
] as const;
/*  结果视图选择进草稿（route 维度、会话级）——偏好的视图不再每次回表格 */
const view = useScopedDraft('result-view', { route: 'query' }, 'table').text as Ref<'table' | 'json' | 'tree' | 'cards'>;

/* ═══ JQ 过滤 ═══ */
/* JQ 过滤表达式草稿化（useScopedDraft 按索引维度）——同索引刷新/切页
   回来表达式保留；切索引由 draft scope 自动隔离（替代原 pickedIdx watch 里的显式清空）。 */
const jqExpr = useScopedDraft('jq', { route: 'query', index: () => store.pickedIdx || '' }, '').text;
const jqResult = ref<any>(null);
const jqError = ref('');
function applyJq() {
  /* jqError 死状态修复——失败写了 ref 但模板零渲染点，toast 即逝后原因无处回看；
     JQ 行尾 span 渲染（DevToolsView curlErr 同形 il-hint il-err），成功路径零动 */
  if (!jqExpr.value.trim()) { jqResult.value = null; return; }
  try {
    jqResult.value = jq(rawRespObj(), jqExpr.value.trim());
    jqError.value = '';
    view.value = 'tree';
  } catch (e: any) {
    jqError.value = e.message;
    store.notify('error', e.message);
  }
}
function rawRespObj() {
  if (!resp.value) return {};
  return { total: resp.value.total, took: resp.value.took, hits: { hits: resp.value.hits }, aggregations: resp.value.aggregations };
}
const jsonViewHtml = computed(() => {
  const data = jqResult.value !== null ? jqResult.value : rawRespObj();
  return highlightJson(prettyJson(data));
});

/* 搜索定位轮:json 结果视图真定位——文本节点 mark 序号 + 当前命中滚动到视口中心。
   计数独立于渲染链(避免 matchCount→marked→hitCur→matchCount 的 TDZ 环);
   jq 切换/新查询后计数变化自动回到首个命中。 */
const jsonKw = ref('');
/* json 视图体换装 AltHitsViews——ref 承接组件 preEl expose（旧直挂 pre 的
   定位链等价迁移：querySelector data-hit-idx + scrollTop 归零两处消费位不变） */
const jsonBox = ref<{ preEl: HTMLElement | null } | null>(null);
/* 本地转义/计数/标记三件退役，收编 utils/respMark.markHtmlAll 单源
   （RestView markHtml 同构实现；j-mark/j-mark-cur/data-hit-idx 逐字保形，cur=0 纯计数
   模式承接原计数函数——计数独立于渲染链（matchCount→marked→hitCur→matchCount TDZ
   环防环语义不变）） */
const jsonMatchCount = computed(() => markHtmlAll(jsonViewHtml.value, jsonKw.value.trim(), 0).count);
const { current: jsonFindCur, next: jsonFindNext, prev: jsonFindPrev } = useHitNav(() => jsonMatchCount.value);
const jsonFind = { current: jsonFindCur, next: jsonFindNext, prev: jsonFindPrev, count: jsonMatchCount };
const jsonMarkedHtml = computed(() => markHtmlAll(jsonViewHtml.value, jsonKw.value.trim(), jsonFindCur.value).html);
function jsonFindRun() { jsonFindCur.value = 1; }
watch(jsonFindCur, () => nextTick(() => {
  jsonBox.value?.preEl?.querySelector<HTMLElement>(`[data-hit-idx="${jsonFindCur.value}"]`)
    ?.scrollIntoView({ block: 'center' });
}));
/* 滚动位归零（「JSON 显示不全」另一半）——上次命中 scrollIntoView 把
   jsonBox 停在中途，切视图再进 JSON/新查询完成后顶部内容「消失」。切视图进 JSON 与
   新查询落定（resp 引用更替）两时机归零；jsonKw 保留（命中导航语义在途）时不重置 */
watch([view, resp], () => {
  if (resp.value && view.value === 'json' && !jsonKw.value.trim()) {
    nextTick(() => { const el = jsonBox.value?.preEl; if (el) el.scrollTop = 0; });
  }
});

/* ═══ Profile 树 ═══ */
const profileTree = ref<any>(null);
const profileTotal = ref(1);
/* Profile 树限高三档（dq.profH 落盘，useTierCycle 统一件）——首档=531 冻结值
   max(240px, 42vh) 零漂移；queryFlat534 冻结 CSS 规则字面零触（仍在册=缺省档同值），运行时
   档经内联 max-height 覆盖（弹窗档位不算高度链变动、恒高块自身 max+内滚语义不变）。 */
const PROF_H_TIERS: string[] = ['max(240px, 42vh)', 'max(360px, 56vh)', 'max(480px, 70vh)'];
const { v: profH, cycle: cycleProfH } = useTierCycle('dq.profH', PROF_H_TIERS);
const profStyle = computed(() => ({ maxHeight: profH.value }));
const ProfileNode = defineComponent({
  name: 'ProfileNode',
  props: { node: { type: Object as PropType<any>, required: true }, total: { type: Number, required: true }, depth: { type: Number, default: 0 } },
  setup(p) {
    const pct = computed(() => Math.min(100, ((p.node.time_in_nanos || 0) / p.total) * 100));
    return () =>
      h('div', { class: 'pf-node' }, [
        h('div', { class: 'pf-row', style: '--d:' + p.depth }, [
          h('span', { class: 'pf-type mono' }, p.node.type),
          h('span', { class: 'pf-desc mono', title: p.node.description }, p.node.description),
          h('span', { class: 'pf-time mono' }, ((p.node.time_in_nanos || 0) / 1e6).toFixed(2) + 'ms'),
          h('div', { class: 'pf-bar' }, [h('i', { style: `width:${pct.value}%` })]),
        ]),
        ...(p.node.children || []).map((c: any) => h(ProfileNode, { node: c, total: p.total, depth: p.depth + 1 })),
      ]);
  },
});

/* ═══ 文档详情/编辑 ═══ */
const docOpen = ref(false);
const activeDoc = ref<SearchHit | null>(null);
const docEditMode = ref(false);
/* 草稿治理轮：文档编辑/新建文档草稿（按 集群/索引 隔离——写类场景） */
const dqDocScope = { route: 'query', index: () => store.pickedIdx };
const docEditText = useScopedDraft('doc-edit', dqDocScope, '').text;
/* ═══ ：文档弹窗两处 Monaco 定高接 useTierCycle 档钮 ═══
   首档=原值零漂移（编辑弹窗 min(60vh,420px) / 新建弹窗 min(60vh,360px) 原定高不同故
   分双键落盘——ih.settingsH/ih.mapH 双键先例），刷新/回开弹窗保持（usePref 落盘）；
   档钮 title 实时回显当前档（adhoc.piH 同款）。 */
const DOC_H_TIERS: string[] = ['min(60vh,420px)', 'min(70vh,560px)', 'min(80vh,700px)'];
const DOC_NEW_H_TIERS: string[] = ['min(60vh,360px)', 'min(70vh,480px)', 'min(80vh,600px)'];
const { v: docH, cycle: cycleDocH } = useTierCycle('dq.docH', DOC_H_TIERS);
const { v: docHNew, cycle: cycleDocHNew } = useTierCycle('dq.docHNew', DOC_NEW_H_TIERS);
function openDoc(hit: SearchHit) {
  activeDoc.value = hit;
  docEditText.value = prettyJson(hit._source);
  docEditMode.value = false;
  docOpen.value = true;
}
/* 结果表相关性调试入口：带当前 index+_id+dsl 送去排名侦探 / 查询 X 光（复用实验室 sessionStorage 契约）。
   手写 sessionStorage.setItem 换 useLinkCarry 统一件——键名与 payload 结构逐字保持
   （es-console.link.rankdebug={index,id,query} / es-console.link.xray={index,id}），消费端零感 */
const rankDebugCarry = useLinkCarry<{ index: string; id: string; query: string }>('rankdebug');
const xrayCarry = useLinkCarry<{ index: string; id: string }>('xray');
function gotoWhy(hit: SearchHit) {
  rankDebugCarry.send({ index: store.pickedIdx, id: hit._id, query: dsl.value });
  router.push('/rank-debug');
}
function gotoXray(hit: SearchHit) {
  xrayCarry.send({ index: store.pickedIdx, id: hit._id });
  router.push('/query-xray');
}
async function saveDoc() {
  if (!activeDoc.value) return;
  if (!tryParse(docEditText.value)) { store.notify('error', 'JSON 不合法'); return; }
  try {
    await api.updateDocument(store.pickedIdx, activeDoc.value._id, docEditText.value);
    store.notify('success', '文档已更新');
    docOpen.value = false;
    runQuery();
  } catch (e: any) { store.notify('error', '更新文档失败：' + friendlyEsError(String(e?.message ?? e))); }
}

/* ═══ ：新建/克隆文档（CRUD 里「增」此前全站无入口） ═══ */
const newDocOpen = ref(false);
const newDocId = ref('');
const newDocText = useScopedDraft('new-doc', dqDocScope, '{\n}').text;
const newDocFrom = ref(''); // 克隆源 _id（空=全新）
const newDocSaving = ref(false);
/* 合法性前置——非法 JSON 直接禁用按钮+行内提示，不让用户点了才知道 */
const newDocValid = computed(() => tryParse(newDocText.value) !== null);

/* ═══ ：文档双弹窗 Ctrl+I 唤起补全（561 主编辑器同键第三落点）═══
   ⚠弹窗两枚 Monaco 标签字面被 docModalHeightsAssist 黑名单锁冻结（ref 不入标签）——
   改经 monaco.editor.getEditors() 拾取弹窗内实例宿主侧 addCommand，组件零触、高度零触。
   弹窗开时内层 editor 已在子组件 onMounted 创建（nextTick 后置取），按模型值匹配弹窗稿
   （getValue===v-model 稿）防误配主编辑器，匹配不到回退末创建实例；编辑态关闭（docEditMode=false
   弹窗只有 JsonTree）时拾取不到即静默跳过。happy-dom stub 无 getEditors 出口 → 守卫跳过。 */
function wireDocModalCtrlI(modelText: () => string) {
  void import('monaco-editor/esm/vs/editor/editor.api').then((m) => {
    const eds: any[] = typeof (m.editor as any)?.getEditors === 'function' ? (m.editor as any).getEditors() : [];
    const ed = [...eds].reverse().find((e) => typeof e?.getValue === 'function' && e.getValue() === modelText())
      ?? eds[eds.length - 1];
    if (!ed || typeof ed.addCommand !== 'function') return;
    ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyI, () => {
      ed.trigger('', 'editor.action.triggerSuggest', null);
    });
  }).catch(() => { /* 测试 stub 面/包缺失时静默：补全仍有 Ctrl+Space 既有键 */ });
}
watch(docOpen, (o) => { if (o) nextTick(() => wireDocModalCtrlI(() => docEditText.value)); });
watch(newDocOpen, (o) => { if (o) nextTick(() => wireDocModalCtrlI(() => newDocText.value)); });

/* ?newdoc=1 深链直开弹窗（命令面板跨页直达/可分享可重入，与索引工作区 ?create=1 同模式）。
   事件总线是 watch 型，跨页时监听器晚于 emit 注册会丢事件，深链才是可靠载体 */
const newDocLink = useUrlState('newdoc');
/* ?q= 深链预填——索引工作区「在查询工作台打开」带 Lucene 词过来，
   包成 query_string DSL 填入（newdoc 同模式；消费即清参数防刷新重灌） */
const qLink = useUrlState('q');
watch(qLink, v => {
  const kw = (v || '').trim();
  if (!kw) return;
  try {
    const parsed = JSON.parse(buildDocsDsl(kw, 20));
    dsl.value = JSON.stringify(parsed, null, 2);
    store.notify('info', '已从索引工作区带入查询词并转为 DSL');
  } catch { /* 转换失败不动草稿 */ }
  qLink.value = '';
}, { immediate: true });
function mappingReady(): Promise<void> {
  return new Promise(res => {
    const stop = watch(mappingState, s => { if (s !== 'loading') { stop(); res(); } }, { immediate: true });
  });
}
async function openNewDocFromLink() {
  if (!store.pickedIdx) { store.notify('warning', '请先选中一个索引'); newDocLink.value = ''; return; }
  await mappingReady(); // 深链进入时 mapping 可能还在路上，等一拍再预填骨架，避免误降级空模板
  if (!newDocOpen.value) openNewDoc();
}
watch(newDocLink, v => { if (v === '1') openNewDocFromLink(); });
watch(newDocOpen, v => { newDocLink.value = v ? '1' : ''; }); // 开/关同步 URL，刷新可重入

/* mapping 类型→JSON 骨架：文本 ''、数值 0、boolean false、date 当前 ISO、nested 包数组、object 递归 */
function buildSkeleton(props: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(props || {}) as [string, any][]) {
    if (v.properties) {
      const child = buildSkeleton(v.properties);
      out[k] = v.type === 'nested' ? [child] : child;
    } else if (['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float'].includes(v.type)) {
      out[k] = 0;
    } else if (v.type === 'boolean') {
      out[k] = false;
    } else if (v.type === 'date') {
      out[k] = new Date().toISOString();
    } else if (['keyword', 'text', 'wildcard', 'ip'].includes(v.type)) {
      out[k] = '';
    } else {
      out[k] = null;
    }
  }
  return out;
}
function skeletonJson(): string {
  if (!mappingProps.value || !Object.keys(mappingProps.value).length) {
    store.notify('warning', '该索引无 mapping 字段（或尚未加载），已给空模板');
    return '{\n}';
  }
  return prettyJson(buildSkeleton(mappingProps.value));
}
function openNewDoc(source?: any, fromId = '') {
  newDocFrom.value = fromId;
  newDocId.value = '';
  newDocText.value = source ? prettyJson(source) : skeletonJson();
  newDocOpen.value = true;
}
function cloneDoc() {
  if (!activeDoc.value) return;
  docOpen.value = false;
  openNewDoc(activeDoc.value._source, activeDoc.value._id);
}
/* W2-3：带当前索引 + 文档 ID 跳只读对比页，目标索引在对比页选。
   query 用 idx= 而非 a=：对比页的 index 走 useIdxState()，保留顶栏索引联动。 */
function gotoCompare() {
  const id = activeDoc.value?._id;
  if (!id) return;
  docOpen.value = false;
  router.push({ path: '/doc-diff', query: { mode: 'compare', idx: store.pickedIdx, id } });
}
async function saveNewDoc() {
  if (!tryParse(newDocText.value)) { store.notify('error', 'JSON 不合法'); return; }
  /* raw POST 自动 ID 是 ADMIN 级通道，客户端 UUID 走 OPERATOR 级 putDoc 即可 */
  const id = newDocId.value.trim() || crypto.randomUUID();
  newDocSaving.value = true;
  try {
    await api.putDoc(store.pickedIdx, id, newDocText.value, 'true');
    store.notify('success', '文档已写入：' + id);
    newDocOpen.value = false;
    runQuery();
  } catch (e: any) { store.notify('error', '写入失败：' + friendlyEsError(String(e?.message ?? e))); }
  finally { newDocSaving.value = false; }
}
/* 新建文档弹窗 Enter=写入（can 与主按钮 disabled 同口径——JSON 合法且非写入中；
   文档 JSON 是 TEXTAREA，tagName 检查天然放行，_id 的单行 INPUT 才触发提交） */
useModalEnter(newDocOpen, saveNewDoc, () => newDocValid.value && !newDocSaving.value);

/* ═══ 删除（三级安全）。 W4：直挂 ConfirmModal 收编 askConfirm——
   确认弹层走全局服务（App.vue 唯一宿主），本地 show ref / @confirm 回调退役，
   facts 具名行与 critical 守卫语义原样迁入 ═══ */
const resultTbl = ref<InstanceType<typeof ResultTable> | null>(null);
async function askDeleteDoc(hit: SearchHit) {
  if (!await askConfirm({
    title: '删除文档',
    message: '将删除该文档，此操作不可撤销。',
    level: 'warn',
    okText: '删除',
    dismissable: true,
    facts: [{ label: '索引', value: store.pickedIdx || '' }, { label: '文档 ID', value: hit._id || '' }],
  })) return;
  try {
    await api.deleteById(store.pickedIdx, hit._id);
    store.notify('success', '已删除文档 ' + hit._id);
    /*  删除成功即从结果表勾选集剔除，防幽灵勾选流入批量操作 */
    resultTbl.value?.clearSelected([hit._id]);
    runQuery();
  } catch (e: any) { store.notify('error', '删除文档失败：' + friendlyEsError(String(e?.message ?? e))); }
}

async function askBatchDelete(ids: string[]) {
  if (!await askConfirm({
    title: '批量删除文档',
    message: '将永久删除勾选的全部文档，此操作不可撤销。',
    level: 'critical',
    guardText: store.pickedIdx,
    okText: '永久删除',
    facts: [{ label: '索引', value: store.pickedIdx || '' }, { label: '文档数', value: String(ids.length) }],
  })) return;
  const failures: string[] = [];
  for (const id of ids) {
    try { await api.deleteById(store.pickedIdx, id); } catch { failures.push(id); }
  }
  if (failures.length) store.notify('error', `失败 ${failures.length} 条`);
  else store.notify('success', `已删除 ${ids.length} 条`);
  /* 只剔除删除成功的 id；失败的保留勾选供重试 */
  resultTbl.value?.clearSelected(ids.filter(id => !failures.includes(id)));
  runQuery();
}

async function askDeleteByQuery() {
  const cleaned = applyVars(stripJsonComments(dsl.value));
  let count = 0;
  try {
    const c = await api.count(store.pickedIdx, cleaned);
    count = c.count ?? 0;
  } catch (e: any) { store.notify('error', 'count 预估失败: ' + friendlyEsError(String(e?.message ?? e))); return; }
  if (!await askConfirm({
    title: '按查询删除',
    message: '将按 DSL 当前 query 执行 _delete_by_query 永久删除，此操作不可撤销。',
    level: 'critical',
    guardText: store.pickedIdx,
    okText: '永久删除',
    facts: [{ label: '预估命中', value: fmtNum(count) + ' 条' }],
  })) return;
  try {
    /* 异步化（wait_for_completion=false）——大结果集删除不再占死请求通道，
       立返 taskId 引导「查进度」三态拉取（ReindexAdvanced/UpdateByQuery 557 判例同款）；
       后端不认该参数直返同步体（无 taskId 有 deleted）时回落既有同步提示零降级。 */
    const r = await api.deleteByQuery(store.pickedIdx, cleaned, { waitForCompletion: 'false' });
    const tid = r?.taskId != null ? String(r.taskId) : '';
    if (tid) {
      dbqTaskId.value = tid;
      dbqProgress.value = null;
      dbqProgFailed.value = false;
      store.notify('success', '按查询删除已提交（异步执行），可用「查进度」跟踪任务');
    } else {
      store.notify('success', `已删除 ${fmtNum(r?.deleted)} 条`);
    }
    runQuery();
  } catch (e: any) { store.notify('error', '删除失败：' + friendlyEsError(String(e?.message ?? e))); }
}

/* ═══ ：deleteByQuery 异步任务进度 ═══
   api.progress(taskId) 一次性拉取（不挂轮询，盯进度走「到任务树」深链），三态中文：
   RUNNING=进行中 x/y、COMPLETED=已完成、UNKNOWN/拉取失败=查不到降级（任务完成后从
   _tasks 消失/过期是常态路径，降级是预期分支不是异常，不 toast 轰炸）。 */
const dbqTaskId = ref('');
const dbqProgress = ref<any>(null);
const dbqProgLoading = ref(false);
const dbqProgFailed = ref(false);
async function queryDbqProgress() {
  if (!dbqTaskId.value || dbqProgLoading.value) return;
  dbqProgLoading.value = true;
  dbqProgFailed.value = false;
  try { dbqProgress.value = await api.progress(dbqTaskId.value); }
  catch { dbqProgFailed.value = true; }
  finally { dbqProgLoading.value = false; }
}
const dbqProgText = computed(() => {
  const p = dbqProgress.value;
  if (dbqProgFailed.value || !p || p.status === 'UNKNOWN') return '查不到进度（任务可能已过期或 taskId 无效）';
  const counts = ` ${p.deleted ?? p.created ?? 0}/${p.total ?? '?'}`;
  return p.status === 'COMPLETED' ? '已完成' + counts : '进行中' + counts;
});

/* ═══ 变量 ═══ */
const varsOpen = ref(false);
const varsMap = ref<Record<string, string>>({});
const newVarK = ref('');
const newVarV = ref('');
watch(varsOpen, (v) => { if (v) varsMap.value = { ...loadVars() }; });
function addVar() {
  if (newVarK.value.trim()) {
    varsMap.value[newVarK.value.trim()] = newVarV.value;
    newVarK.value = ''; newVarV.value = '';
  }
}
function saveVarsAll() {
  saveVars(varsMap.value);
  varsOpen.value = false;
  store.notify('success', '变量已保存');
}

/* ═══ 历史 / 保存 ═══ */
/*  P2-11：HistItem 扩 layout（ResultTable.captureLayout 产物）——
   保存的搜索=DSL+表格布局（排序/筛选/列选/列宽/冻结/转置/密度/行高）一体快照；
   旧条目无 layout 字段自动回落纯 DSL 回放（向后兼容）。 */
interface HistItem { dsl: string; ts: number; idx: string; name?: string; layout?: Record<string, unknown> | null; ok?: boolean; took?: number }
const HIST_KEY = 'es_query_hist';
const SAVED_KEY = 'es_query_saved';
const histOpen = ref(false);
const savedOpen = ref(false);
/* 读侧统一过 try + Array.isArray 守卫（DevToolsView histAllRead 先例同口径）——
   此前裸 JSON.parse，历史键存非数组 JSON 炸 histRows 映射、损坏串直接炸 setup */
function readHistList(key: string): HistItem[] {
  try {
    const r = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(r) ? r : [];
  } catch { return []; }
}
const history = ref<HistItem[]>(readHistList(HIST_KEY));
const savedQueries = ref<HistItem[]>(readHistList(SAVED_KEY));

function pushHistory(d: string) {
  if (history.value[0]?.dsl === d && history.value[0]?.idx === store.pickedIdx) return;
  history.value.unshift({ dsl: d, ts: Date.now(), idx: store.pickedIdx });
  history.value = history.value.slice(0, store.settings.histSize);
  localStorage.setItem(HIST_KEY, JSON.stringify(history.value));
}
function replayHist(hst: HistItem, run: boolean) {
  dsl.value = hst.dsl;
  histOpen.value = false;
  savedOpen.value = false;
  if (run) runQuery();
}
function removeHis(i: number) {
  history.value.splice(i, 1);
  localStorage.setItem(HIST_KEY, JSON.stringify(history.value));
}

/*  历史面板收编 QueryHistoryPanel 共享件——旧条目形状（dsl/idx）映射为组件行（query/index），
   事件按 ts+文本反查原条目，回放/删除仍走本视图既有逻辑 */
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
const histRows = computed(() => history.value.map(h => ({ query: h.dsl, index: h.idx, took: h.took, ts: h.ts, ok: h.ok })));
function histIdxOf(row: { query: string; ts?: number }): number {
  return history.value.findIndex(h => h.dsl === row.query && (row.ts === undefined || h.ts === row.ts));
}
function replayRow(row: { query: string; ts?: number }, run: boolean) {
  const i = histIdxOf(row);
  if (i >= 0) replayHist(history.value[i], run);
}
function removeRow(row: { query: string; ts?: number }) {
  const i = histIdxOf(row);
  if (i >= 0) removeHis(i);
}
/* 历史行一键转收藏——「回放 → Ctrl+S 另存」压缩为一步。行 DSL 装入编辑器
   （跨索引连带切换，suppress 旋钮防 watch 连锁重查，replaySavedRow 同套路），随后走既有
   saveQuery 命名弹窗链（confirmSave 的覆盖确认/布局重捕获语义原样保留，零新存储零新弹窗） */
function favHistRow(row: { query: string; ts?: number }) {
  const i = histIdxOf(row);
  if (i < 0) return;
  const hst = history.value[i];
  if (hst.idx && hst.idx !== store.pickedIdx) { suppressIdxDslLoad = true; store.pickedIdx = hst.idx; }
  dsl.value = hst.dsl;
  histOpen.value = false;
  saveQuery();
}
/* 历史/保存面板行级一键复制 curl（QueryHistoryPanel 'curl' 行级 emit，
   命令组装归宿主——DevToolsView histCurl 先例手法平移；两面板行同形自持 query/index，
   组 POST /{idx}/_search -d '{dsl}' 写剪贴板，单引号转义同款） */
function histCurl(h: any) {
  const idxPath = h.index ? '/' + h.index + '/_search' : '/_search';
  const c = `curl -X POST '${window.location.origin}${idxPath}'` +
    (h.query ? ` -H 'Content-Type: application/json' -d '${h.query.replace(/'/g, "'\\''")}'` : '');
  copyText(c).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'curl 已复制' : '复制失败'));
}
/*  已保存查询/查询模板两弹窗同步收编 QueryHistoryPanel（与历史弹窗同款交互面） */
const savedRows = computed(() => savedQueries.value.map(sq => ({ name: sq.name, query: sq.dsl, index: sq.idx, ts: sq.ts }))); /* ：随迁补 index（行自持 query/index 喂 histCurl） */
/* 重命名=预填旧名打开保存弹窗，confirmSave 的 284 覆盖链原位更新（含布局重捕获） */
let renameTarget: HistItem | null = null;
function renameSavedRow(row: { name?: string }) {
  const sq = savedQueries.value.find(sq => sq.name === row.name);
  if (!sq) return;
  renameTarget = sq;
  saveName.value = sq.name ?? '';
  saveOpen.value = true;
}
function savedIdxOf(row: { name?: string; query: string }): number {
  return savedQueries.value.findIndex(sq => sq.name === row.name && sq.dsl === row.query);
}
function replaySavedRow(row: { name?: string; query: string }, run: boolean) {
  const i = savedIdxOf(row);
  if (i < 0) return;
  const sq = savedQueries.value[i];
  /*  P2-11：保存的搜索=现场还原——跨索引连带切过去（suppress 旋钮跳过
     watch 的 DSL 覆盖与自动重查，与  applyTask 同款套路），布局在 RT
     偏好重读后二次 nextTick 恢复，最后按面板 run 意图执行查询。 */
  const crossIdx = !!sq.idx && sq.idx !== store.pickedIdx;
  if (crossIdx) { suppressIdxDslLoad = true; store.pickedIdx = sq.idx; }
  replayHist(sq, run);
  if (sq.layout) {
    nextTick(() => { nextTick(() => { (resultTbl.value as any)?.applyLayout?.(sq.layout); }); });
  }
  if (crossIdx) store.notify('info', `已切到保存时索引 ${sq.idx} 并还原查询`);
}
function removeSavedRow(row: { name?: string; query: string }) {
  const i = savedIdxOf(row);
  if (i >= 0) { savedQueries.value.splice(i, 1); persistSaved(); }
}
const tplRows = computed(() => templates.value.map(tp => ({ name: tp.name, query: tp.dsl })));

async function askClearHist() {
  const ok = await askConfirm({
    title: '清空本页查询历史',
    message: `将删除 DSL 通道的全部 ${history.value.length} 条本地历史记录，此操作不可撤销。`,
    level: 'warn',
    okText: '清空',
  });
  if (!ok) return;
  history.value = [];
  localStorage.setItem(HIST_KEY, JSON.stringify(history.value));
}
const saveOpen = ref(false);
const saveName = ref('');
/* 在 DevTools 打开——当前索引+DSL 组装 POST _search 经 _prefill 会话契约带入 */
function openInDevTools() {
  if (!resp.value) return;
  const idxPath = store.pickedIdx ? `/${store.pickedIdx}/_search` : '/_search';
  sessionStorage.setItem('es-console.devtools.open', JSON.stringify({
    title: store.pickedIdx || '_search',
    method: 'POST',
    path: idxPath,
    body: JSON.stringify(JSON.parse(stripJsonComments(dsl.value)), null, 2),
    run: true,
  }));
  router.push('/devtools');
}
/* 历史行带到 DevTools 新 Tab（openInDevTools _prefill 通道，历史行组装
   body=行自持 query 的 pretty DSL；行无 resp 依赖——openInDevTools 的 !resp 门不适用于历史回放） */
function histNewTab(h: { query: string; index?: string }) {
  const idxPath = (h.index ? '/' + h.index : '') + '/_search';
  let body = h.query || '';
  try { body = JSON.stringify(JSON.parse(stripJsonComments(body)), null, 2); } catch { /* 非 JSON 原样带过去 */ }
  sessionStorage.setItem('es-console.devtools.open', JSON.stringify({
    title: h.index || '_search',
    method: 'POST',
    path: idxPath,
    body,
    run: true,
  }));
  histOpen.value = false;
  router.push('/devtools');
}
function saveQuery() {
  saveName.value = '';
  saveOpen.value = true;
}

/* ==== ：原始 IO 快查（表格工具行钮共用） ====
   与 IndexHub docs/query 同一 api.clusterQuery（/cluster/query）记录环特征，取最近一条开弹窗；
   判空随迁（Adhoc 546 口径，rawIoPave546 十五视图同款）——无记录 notify 引导
   不再以空 rec 开空弹窗（EmptyState 仍归 RawIoModal 自身兜底）。 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
/* Profile 态双特征回退——Profile 执行走 /cluster/profile（api.cluster.profile），
   单特征 last('/cluster/query') 在纯 Profile 调试流取不到记录；先 query 未命中再 profile，
   两段过滤各自 includes 收口（api.ts ioRecorder.last(pathSub) 单参签名）。
   二段特征链扩容——写路径动作入环后现场也可回看（每类动作命名在册）：
   文档保存 updateDocument（/cluster/update-document）·新建文档 putDoc（/cluster/doc）·
   删文档 deleteById 单条/批量（/cluster/delete-by-id）·按查询删除 deleteByQuery
   （/cluster/delete-by-query）·PIT 导出 pitOpen/pitSearch（/cluster/pit/ 前缀含 close）；
   首段 551 锁面零触，首段命中不重复扫描（rec 空档才走二段），五段全未命中才判空引导
   （550 口径文案零触）。 */
function openRawIo() {
  const rec = ioRecorder.last('/cluster/query') ?? ioRecorder.last('/cluster/profile');
  const rec2 = rec
    ?? ioRecorder.last('/cluster/update-document')   /* 文档保存 */
    ?? ioRecorder.last('/cluster/doc')               /* 新建文档 */
    ?? ioRecorder.last('/cluster/delete-by-id')      /* 删文档（单条/批量） */
    ?? ioRecorder.last('/cluster/delete-by-query')   /* 按查询删除 */
    ?? ioRecorder.last('/cluster/pit/');             /* PIT 导出 */
  if (!rec2) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec2;
  rawIoShow.value = true;
}
async function confirmSave() {
  const name = saveName.value.trim();
  if (!name) return;
  /* 同名已存 → 覆盖确认（此前 unshift 产生重复同名条目，回放/删除歧义） */
  const existing = renameTarget ?? savedQueries.value.find(sq => sq.name === name);
  if (existing && !(await askConfirm({ title: '覆盖已存查询', message: `「${name}」已存在，覆盖为当前查询与布局？`, level: 'info', okText: '覆盖' }))) return;
  /*  P2-11：一并快照当前表格布局（无表格实例如查询未跑时回落 null=纯 DSL） */
  const layout = (resultTbl.value as any)?.captureLayout?.() ?? null;
  if (existing) {
    existing.name = name; /* ：重命名场景=改名为弹窗输入的新名 */
    existing.dsl = dsl.value; existing.ts = Date.now(); existing.idx = store.pickedIdx; existing.layout = layout;
  } else {
    savedQueries.value.unshift({ dsl: dsl.value, ts: Date.now(), idx: store.pickedIdx, name, layout });
  }
  persistSaved();
  saveOpen.value = false;
  renameTarget = null;
  store.notify('success', (existing ? '已覆盖「' + name + '」' : '已保存') + (layout ? '（含表格布局：排序/筛选/列选）' : ''));
}
function persistSaved() { localStorage.setItem(SAVED_KEY, JSON.stringify(savedQueries.value)); }

/* ═══ 代码生成 / 导入导出 / 分享 ═══ */
const langs = [
  { k: 'curl' as CodeLang, t: 'cURL' }, { k: 'js' as CodeLang, t: 'JavaScript' }, { k: 'python' as CodeLang, t: 'Python' },
];
async function copyAs(lang: CodeLang) {
  store.settings.defaultLang = lang;
  store.saveSettings();
  const cleaned = applyVars(stripJsonComments(dsl.value));
  const code = generate(lang, 'POST', `/${store.pickedIdx}/_search`, cleaned);
  const ok = await copyText(code);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${lang} 代码` : '复制失败'); /*  */
}
function exportDsl() {
  /* 手搓 <a>+createObjectURL 收敛 downloadText（与 exportAll 同通道） */
  downloadText('query.txt', dsl.value, 'text/plain');
}
function importDsl() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.txt,.json';
  inp.onchange = async () => {
    const f = inp.files?.[0];
    if (f) dsl.value = await f.text();
  };
  inp.click();
}
/* ═══ ：DSL→Lucene 一键翻译（工具行钮）═══
   CmdPalette r30-dsl-to-lucene 既有出口同线：dslToLucene 纯函数（启发式抽取 query_string）
   → es-console.lucene.q/index 会话键 → 跳 /search?mode=lucene（QueryHub lucene 通道经
   useUrlState 响应式切档，LuceneQueryView 挂载消费 carry 回显）。DSL 非法 notify 不跳。 */
function openInLucene() {
  const obj = tryParse(applyVars(stripJsonComments(dsl.value)));
  if (!obj) { store.notify('error', 'DSL 不是合法 JSON（已剥离注释后校验），无法翻译'); return; }
  sessionStorage.setItem('es-console.lucene.q', dslToLucene(obj));
  if (store.pickedIdx) sessionStorage.setItem('es-console.lucene.index', store.pickedIdx);
  router.push({ path: '/search', query: { mode: 'lucene' } });
}

/* W4-T14：在构建器中打开——复用 ?dsl= 互转通道（同 shareUrl/QueryHubView.applyTask 契约）。
   修复「按钮点不动」：本按钮只存在于 /search?mode=dsl 页内，router.push 同路由
   query 变化不重挂 QueryHubView/DslQueryView（KeepAlive+同 key），?dsl= 落 URL 无人消费、
   页面零反馈。改 applyTask 同款 history.replaceState 落参（不触发导航/不压历史栈，
   编辑器与条件树本就实时同步、无需重挂）+ notify 显性反馈。
   （用户「这是什么意思」反馈）：文案人话化+提示条直接带「复制链接」动作（点提示
   即拿分享链接，replaceState 后 location.href 已是带参链接）；同参连点防重——2.2s 内
   URL 未变化就不重复弹（success 类全局刻意不去重（连续复制场景），此处局部防抖）。 */
let lastBuilderToastAt = 0;
function openInBuilder() {
  const usp = new URLSearchParams(location.hash.split('?')[1] || '');
  usp.set('dsl', encodeDslParam(dsl.value));
  if (store.pickedIdx) usp.set('idx', store.pickedIdx);
  usp.set('mode', 'dsl');
  /* window.history 显式全局——本文件 1054 行 const history（查询历史）遮蔽全局 */
  window.history.replaceState(null, '', (location.hash.split('?')[0] || '#/search') + '?' + usp.toString());
  const now = Date.now();
  if (now - lastBuilderToastAt < 2200) return;
  lastBuilderToastAt = now;
  store.notify('success', '查询已写入链接，刷新页面或发给别人都能还原现在的查询', {
    duration: 4200,
    action: { label: '复制链接', onClick: () => { copyText(location.href).then(ok => { if (ok) store.notify('success', '链接已复制'); }); } },
  });
}
async function shareUrl() {
  const u = new URL(location.href);
  u.hash = `/search?mode=dsl&idx=${encodeURIComponent(store.pickedIdx)}&dsl=${encodeURIComponent(btoa(unescape(encodeURIComponent(dsl.value))))}` + (page.value > 1 ? `&page=${page.value}` : '');
  const ok = await copyText(u.toString());
  store.notify(ok ? 'success' : 'error', ok ? '分享链接已复制' : '复制失败'); /*  */
}
function exportJson() {
  if (!resp.value) return;
  /* 行集经 RT getExportRows（排序序+勾选过滤，与表格所见一致）——
     此前用 resp.hits 原始序且无视勾选，与 RT 内导出入口语义割裂。
      M3：补带 _id（此前 rows.map(h => h._source) 丢文档身份，
     与 RT 内 JSON 导出 {_id, ..._source} 同口径） */
  const rows = (resultTbl.value?.getExportRows?.() ?? resp.value.hits) as SearchHit[];
  /* 手搓 <a>+createObjectURL 收敛 downloadText（与 exportAll 同通道） */
  downloadText(store.pickedIdx + '-results.json', JSON.stringify(rows.map(r => ({ _id: r._id, ...r._source })), null, 2), 'application/json');
}

/* ═══ 全量导出：PIT + search_after 遍历当前 query 全部命中（from+size 10000 上限不适用） ═══ */
const expOpen = ref(false);
const expRunning = ref(false);
const expFetched = ref(0);
const expTotal = ref(0);
/* 导出格式偏好 usePref 持久化——高频弹窗选项免每次重选 */
const expMode = usePref<'jsonl' | 'values'>('query.expMode', 'jsonl');
/* 导出字段偏好记忆化（usePref）——values 模式高频重复输入（业务主键
   如 order_id 跨次导出常同字段）；默认 _id 不变，用户改过才落盘。 */
const expField = usePref('query.expField', '_id');
let expAbort = false;
function cancelExport() { expAbort = true; }
/* 按点分路径取嵌套值（a.b.c）；路径中断返回 undefined */
function getPath(src: any, path: string): any {
  let cur = src;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}
async function exportAll() {
  if (!store.pickedIdx || expRunning.value) return;
  const parsed = tryParse(applyVars(stripJsonComments(dsl.value))) || {};
  const query = parsed.query && Object.keys(parsed.query).length ? parsed.query : { match_all: {} };
  expRunning.value = true;
  expAbort = false;
  expFetched.value = 0;
  expTotal.value = 0;
  const MAX = 200000; // 与「PIT 分页」通道互补：单次导出上限，防大索引拖爆内存
  const rows: string[] = [];
  const vals: any[] = [];
  let pitId = '';
  try {
    const open: any = await api.pitOpen(store.pickedIdx);
    pitId = open?.id || open?.pit_id || '';
    if (!pitId && open?.available === false) throw new Error('该集群 ES 版本不支持 PIT（需 7.10+），无法全量导出');
    if (!pitId) throw new Error('PIT 打开失败（连接异常）');
    let after: any[] | null = null;
    /* 排序键：_shard_doc 是 PIT + search_after 的最优 tie-break，但 ES 7.0~7.9 不认（400）——
       首选 _shard_doc、被拒自动降级 _doc（全版本兼容；esVersion 未加载完时 verBelow 判不准，实测兜底才可靠） */
    let sortKey = store.verBelow('7.10.0') ? '_doc' : '_shard_doc';
    while (!expAbort) {
      const body: any = {
        size: 2000,
        query,
        pit: { id: pitId, keep_alive: '5m' },
        sort: [{ [sortKey]: 'asc' }],
        track_total_hits: after === null,
      };
      if (after) body.search_after = after;
      let r: any;
      try {
        r = await api.pitSearch(JSON.stringify(body));
      } catch (e: any) {
        if (sortKey === '_shard_doc') { sortKey = '_doc'; continue; }
        throw e;
      }
      if (after === null) expTotal.value = typeof r?.hits?.total === 'object' ? (r.hits.total.value || 0) : (r?.hits?.total || 0);
      const hits = r?.hits?.hits || [];
      if (!hits.length) break;
      if (expMode.value === 'values') {
        for (const h of hits) {
          const v = expField.value === '_id' ? h._id : getPath(h._source, expField.value);
          if (v !== undefined && v !== null) vals.push(v);
        }
      } else {
        for (const h of hits) rows.push(JSON.stringify({ _id: h._id, ...h._source }));
      }
      expFetched.value += hits.length;
      after = hits[hits.length - 1].sort;
      if (expFetched.value >= MAX) { store.notify('warning', `已达单次导出上限 ${fmtNum(MAX)} 条；更大量请用「PIT 分页」通道分批导出`); break; }
      await new Promise(res => setTimeout(res, 0));
    }
    if (expAbort) { store.notify('info', `已取消导出（已拉取 ${fmtNum(expFetched.value)} 条）`); return; }
    if (expMode.value === 'values') {
      if (!vals.length) { store.notify('warning', '没有取到任何值——检查字段名是否存在于命中文档'); return; }
      const text = JSON.stringify(vals);
      downloadText(`${store.pickedIdx}-${expField.value.replace(/[^\w.-]/g, '_')}-values-${exportStamp()}.json`, text, 'application/json');
      store.notify('success', `已导出 ${fmtNum(vals.length)} 个「${expField.value}」值（纯数组）`, {
        duration: 8000,
        ...(vals.length <= 50000 ? { action: { label: '复制数组', onClick: () => { copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? '数组已复制' : '复制失败')); } } /*  */ } : {}),
      });
    } else {
      if (!rows.length) { store.notify('info', '当前查询没有命中任何文档'); return; }
      downloadText(`${store.pickedIdx}-all-${exportStamp()}.jsonl`, rows.join('\n'), 'application/x-ndjson');
      store.notify('success', `全量导出完成：${fmtNum(rows.length)} 条 JSONL`);
    }
  } catch (e: any) {
    store.notify('error', '全量导出失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    if (pitId) api.pitClose(pitId).catch(() => {});
    expRunning.value = false;
    expAbort = false;
  }
}

/* ═══ 外部 DSL（快捷任务/分享/回放）覆盖本地草稿前快照，toast 一键找回 ═══ */
function protectDraftBeforeOverride(incoming: string) {
  /* 草稿迁 useScopedDraft 后不再读旧 es_dsl: 键——快照对象=当前编辑器稿
     （挂载时已从新键/一次性迁移载入）；默认模板视同无稿不暂存（对齐旧「无持久稿」语义）。 */
  const cur = dsl.value;
  if (!cur || cur === incoming || cur === DEFAULT_DSL) return;
  try { sessionStorage.setItem('es-console.dsl.prev', JSON.stringify({ idx: store.pickedIdx, dsl: cur })); } catch { /* 存储满容忍 */ }
  store.notify('info', '已载入新查询，你之前编辑的 DSL 已暂存', {
    action: { label: '恢复我的 DSL', onClick: () => { dsl.value = cur; runQuery(); } },
    duration: 10000,
  });
}

/* ═══ 模板 ═══ */
const tplOpen = ref(false);
const templates = computed(() => [
  { name: 'match_all + 排序', dsl: '{\n  "query": { "match_all": {} },\n  "size": 20,\n  "sort": []\n}' },
  { name: 'term 精确匹配', dsl: '{\n  "query": { "term": { "FIELD": "VALUE" } },\n  "size": 20\n}' },
  { name: 'range 时间范围', dsl: '{\n  "query": { "range": { "DATE_FIELD": { "gte": "now-7d/d", "lte": "now" } } },\n  "size": 20\n}' },
  { name: 'bool 组合', dsl: '{\n  "query": {\n    "bool": {\n      "must": [{ "match": { "FIELD": "VALUE" } }],\n      "filter": [{ "term": { "status": "active" } }],\n      "must_not": []\n    }\n  },\n  "size": 20\n}' },
  { name: 'terms 聚合 TopN', dsl: '{\n  "size": 0,\n  "aggs": { "top": { "terms": { "field": "FIELD", "size": 10 } } }\n}' },
  // calendar_interval 是 7.x 语法，6.x 只认 interval，模板跟着当前集群版本出
  { name: 'date_histogram 时间线', dsl: '{\n  "size": 0,\n  "aggs": { "over_time": { "date_histogram": { "field": "DATE_FIELD", "' + (store.verBelow('7.0.0') ? 'interval' : 'calendar_interval') + '": "1d" } } }\n}' },
]);
function applyTpl(t: string) {
  dsl.value = t;
  tplOpen.value = false;
}

/* ═══ 命令面板事件 + URL 分享还原 ═══ */
watch(() => store.eventBus, (ev) => {
  if (ev.name === 'run-query') runQuery();
  else if (ev.name === 'save-query') saveQuery();
  else if (ev.name === 'open-history') histOpen.value = true;
  else if (ev.name === 'open-vars') varsOpen.value = true;
  else if (ev.name === 'export-json') exportJson();
  else if (ev.name === 'new-doc') { if (store.pickedIdx) openNewDoc(); else store.notify('warning', '请先选中一个索引'); }
});

function onKeySave(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveQuery();
  }
}

/* P1：视图级全局执行——工作台任意处 Ctrl+Enter 即跑（执行钮/编辑器内 action 之外的可发现入口）。
   输入守卫对齐 RT onGridKeydown：INPUT/TEXTAREA/SELECT/contentEditable 让路（原生换行/提交语义优先）；
   Monaco 内已有同名 execute action 且 .monaco-editor 判定让路（不重复触发）；执行中让路防并发重入 */
function onGlobalRunKey(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.monaco-editor'))) return;
  if (running.value) return;
  e.preventDefault();
  runQuery();
}

onMounted(() => {
  /* 分栏宽度防呆：localStorage 记忆的宽屏值在小窗会把编辑器推出视口，挂载时按容器实宽 clamp */
  resyncNow();
  /* 收藏夹/命令面板重放通道（一次性 carry 键，用后即删）——此前重放只有写侧无读侧 */
  const carry = sessionStorage.getItem('es-console.dsl.carry');
  const carryIdx = sessionStorage.getItem('es-console.dsl.carry.index');
  sessionStorage.removeItem('es-console.dsl.carry');
  sessionStorage.removeItem('es-console.dsl.carry.index');
  if (carry != null) {
    if (carryIdx && carryIdx !== store.pickedIdx) { suppressIdxDslLoad = true; store.pick(carryIdx); }
    protectDraftBeforeOverride(carry);
    dsl.value = carry;
    /* 20260920 直方图竞态根治：首查必须等 mapping 到位——runQuery 与 preloadMapping 并行时
       查询先发，guessDateField() 拿空列表 → __hist 不注入（产线「直方图又不生效」真凶，
       真机时序实锤 queryAt < inspectAt）。失败不阻塞查询（降级为不注入，与原行为一致） */
    preloadMapping().then(() => runQuery()).catch(() => runQuery());
    window.addEventListener('keydown', onKeySave);
    window.addEventListener('keydown', onGlobalRunKey);
    return;
  }
  const usp = new URLSearchParams(location.hash.split('?')[1] || '');
  const sharedDsl = usp.get('dsl');
  if (sharedDsl) {
    try {
      const decoded = decodeURIComponent(escape(atob(sharedDsl)));
      protectDraftBeforeOverride(decoded);
      dsl.value = decoded;
      /*  G145：预填语句必须可见——构建器缺省收起会把送入的语句藏进
         display:none（场景任务/分享链 toast「看看语句就学会了」与可见性断裂），预填
         即自展开一次；用户此后手动收起照常落盘 */
      buildCollapsed.value = false;
    } catch { store.notify('warning', '分享链接中的 DSL 解析失败（可能被截断），已保留当前编辑内容'); }
  }
  const idx = usp.get('idx');
  if (idx && idx !== store.pickedIdx) { suppressIdxDslLoad = true; store.pick(idx); }
  /* 20260920 直方图竞态根治（同 carry 路径）：深链/会话恢复首查统一等 mapping 到位再发，
     消除「查询先发→guessDateField 空→__hist 不注入」竞态；失败不阻塞（降级为不注入） */
  const firstRun = () => {
    if (sharedDsl || idx) {
      /* 还原后清理 URL，避免刷新再次覆盖编辑器（：嵌入查询工作台，回写 /search 保 mode） */
      window.history.replaceState(null, '', location.pathname + location.search + '#/search?mode=dsl');
      runQuery();
    }
    /* 查询现场会话恢复：无深链意图（?dsl=/carry）进站时，恢复本 target+索引最近一次执行的查询并自动重查——
       切页签/切菜单/刷新/宿主 iframe 重建回到本页，结果现场自动重现，不再回到空态 */
    if (!sharedDsl && carry == null && restoreQwSession()) {
      runQuery();
    }
  };
  preloadMapping().then(firstRun).catch(firstRun);
  window.addEventListener('keydown', onKeySave);
  window.addEventListener('keydown', onGlobalRunKey);
  if (newDocLink.value === '1') openNewDocFromLink(); // 跨页深链：挂载即开新建文档弹窗
});
/* KeepAlive/门户切页签回来时若查询结果丢失(实例重建/缓存淘汰),用会话现场自动重查——
   仅在「会话保存的 DSL 与当前编辑器一致」时兜底(用户改过未执行的草稿绝不覆盖);
   首次挂载的 activated 由 onMounted 链路负责,跳过防双重执行 */
let activatedRestoreArmed = false;
onActivated(() => {
  if (!activatedRestoreArmed) { activatedRestoreArmed = true; return; }
  if (running.value || resp.value || !store.pickedIdx) return;
  let saved: string | null = null;
  try { saved = sessionStorage.getItem(qwSessionKey()); } catch { return; }
  if (saved != null && saved === dsl.value) {
    runQuery();
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeySave);
  window.removeEventListener('keydown', onGlobalRunKey);
  /* lintTimer 手清点退役——useDebounceFn 统一件卸载自动清（W2-2 语义不变） */
});
</script>

<style scoped>
/* JSON 搜索/导航组寄居 rt-bar（bar-prepend 视图段后）——浮动条形态退役：
   去 sticky/边框/内边距浮层（遮挡内容且与工具行割裂），行内控件组与 seg/分页同排等高
   （输入 26px 对齐  ctl-h 口径） */
.dq-json-find { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
.dq-json-find input { width: 170px; height: 26px; padding: var(--sp-0) var(--sp-2); font-size: var(--fs-xs); }
/* 卡片/聚合桶 kw 快滤胞（dq-json-find 同款行内控件组形态） */
.dq-cards-kw { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
/* 轨4：kw 胞换装 SFB——落位/内衬归 wrap 类（父 scoped 照常命中），input-class 仅运行时锚 */
.dq-cards-kw-sfb { width: 170px; height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-xs); }
.dq-agg-kwbar { grid-column: 1 / -1; display: flex; align-items: center; }
.dq-agg-kw { width: 200px; height: 24px; padding: 0 var(--sp-2); font-size: var(--fs-xs); flex-shrink: 0; }
.dq-json-mc { font-size: var(--fs-xs); color: var(--muted); min-width: 36px; text-align: center; }
/* v3.0.0 高亮纠错：普通命中弱底色（对齐 RestView .j-mark 口径）——此前只有当前命中
   j-mark-cur 有样式，其余命中隐形，用户只能靠计数猜命中在哪 */
:deep(.j-mark) { background: var(--warn-soft); color: inherit; border-radius: 2px; padding: 0 1px; }
:deep(.j-mark-cur) { background: var(--dv-orange); color: var(--tx-on-strong); border-radius: 2px; box-shadow: var(--focus-ring); }
.dq { display: flex; flex-direction: column; gap: 0; min-height: 0; position: relative; }
/* P0 高度链：.dq-fill（选中索引时）定高 + 纵向 flex 分配——此前 .wl 视口兜底把常规流的
   .dq-result 顶到视口底沿（2000px 宽屏 res-bar 只露分页条，实报）。
   口径：--vh-offset（全站页头+页边距预留 210px）+ 本页专属 chrome ≈ 120px
   （qh-top 模式卡 ~41 + qh-tasks 场景行 ~22 + qh 两级 gap 20 + dq-toolbar 工具条 ~32 + 缓冲）
   20260914→20260920 两次修正合并：本页 chrome 实测远超 120px（模式卡两排+语法桥行+场景行
   +工具条两排 ≈ 350px），硬编码预留屡次失真——改为只减全局 vh-offset，本页 chrome 全部
   进 flex 收缩链（工具条/场景/执行行 flex-shrink:0，dq-main 可收缩 0 1，dq-result
   min-height 320 保底），高度分配由 flex 实时求解，不再手算预算。 */
.dq.dq-fill { height: calc(100vh - var(--vh-offset, 210px)); }
.dq-progress { position: absolute; top: calc(-1 * var(--sp-4)); left: calc(-1 * var(--sp-5)); right: calc(-1 * var(--sp-5)); color: var(--ac); }
/* 三行合一后强单行——lr-bar 的 wrap 在按钮总量增大后会把工具行折两行（真机 98px 实测）；
   nowrap+子段不收缩保单行，窄屏溢出由按钮 ghost 化/图标化自然让位（不再回退双行形态） */
.dq-toolbar { margin-bottom: var(--sp-2h); flex-shrink: 0; }
/* 三行合一后单行保持——不声明 flex-wrap（骨架职责属 lr-bar 单轨），
   子段自身 nowrap+左段弹性吸收，lr-bar 的 wrap 只作用于两个子盒排列（不再折行） */
.dq-toolbar .lr-bar-l, .dq-toolbar .lr-bar-r { flex-wrap: nowrap; white-space: nowrap; }
.dq-toolbar .lr-bar-l { flex: 1 1 auto; overflow: hidden; }
/* 记档：左段窄屏静默裁切（overflow:hidden 吞溢出钮）确认存在，但 dqBuilderEntry554:121
   逐字锁 overflow:hidden 在对方 lane 在途 spec（untracked 只读）手上，改 overflow-x 破锁不新增红灯
   硬红线裁决回退——待其解禁随迁批再实施（Track2-560 记档） */

.codegen { display: flex; gap: var(--sp-1h); }

/* 高度链主区：编辑区约 52%（min-height:0 防内容撑破），WorkbenchLayout 在其中吃满 */
/* 裁决「默认表格太窄，跟索引工作区没保持一致」：条件/编辑器区从弹性 52% 改
   定高档 max(300px, 38vh)（S/M/L/满 档位仍可在行内调编辑器），结果区 flex:1 吃满剩余——
   与索引工作区「查询区有限高、结果表主导」同构；执行行独立行后 dq-main 定高不再二分配 */
/* 20260920 二修（实报「表格这么点高度，人怎么操作」）：38vh 硬定高在结果区参与分配后
   把表格挤到两行——改「可收缩优先」：dq-main 以 34vh 为期望basis但允许被压缩（flex 0 1），
   结果区保底 min-height 320px 可读；两者由 flex 实时求解，RootExtrasPane 展开内容在
   rp-content 内自滚不外溢 */
/* 高度链合一：.dq-main 不再 CSS 定高（原 max(260px,34vh) 与编辑器档位双轨
   分裂=空白带真凶），高度恒由内联 style 承接（DQ_MAIN_H 档位值或拖柄自定义 px）；
   flex-shrink:0=档位/拖柄声明高不被结果区内容挤压（真机 P3/P4 实证 shrink:1 时恒被
   压回 min-height 220，档位与拖柄全失效），矮视口回退由 dq-result 先收缩承担 */
.dq-main { display: flex; gap: 0; align-items: stretch; flex: 0 0 auto; min-height: 220px; }
/* 树随 pane 滚（rp-content overflow:auto 承担），原 720px 硬顶退役——pane 高由高度链给定 */
.dq-tree { flex-shrink: 0; min-width: 0; overflow-y: auto; max-height: 100%; padding-right: var(--sp-2); }
.dq-tree-map { margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); display: flex; align-items: center; gap: var(--sp-2); }
/* 编辑器 pane 恒 flex 列（原 full 档特化泛化）——Monaco 在 pane 内弹性
   填满，双栏区高度=编辑器实际高度，空白带根治；height:100%=拿满 pane 高（rp-content 是
   block 容器无 flex 上下文，缺省塌缩为内容高，真机 P2 实证），basis 0 强制吃满，
   min-height 200 与 S 档原值一致 */
.dq-editor { flex: 1; min-width: 0; min-height: 0; height: 100%; display: flex; flex-direction: column; overflow-y: auto; }
.dq-editor :deep(.monaco-host) { flex: 1 1 0; height: auto !important; min-height: 200px; }
/* 旧 1100px 媒体查询的 stacked 布局语句退役（.dq-main 纵排、树 width:100% !important、
   分隔条隐藏均由 WorkbenchLayout 宽度驱动 stacked 机制承担——双 !important 叠加曾压过 pane 恢复宽）；
   仅保留 stacked 态条件树限高可滚动（原 max-height:none 会把长树整棵铺开顶走编辑器） */
@media (max-width: 1100px) {
  .dq-tree { max-height: 40vh; }
}

.dq-split-seg { display: inline-flex; margin-left: auto; border: 1px solid var(--border); border-radius: var(--r-s); overflow: hidden; flex-shrink: 0; }
/* 10px → var(--sp-2h)（token 同值 10px 零视觉变化；3px 刻意值保字面） */
.dq-split-seg button { padding: 3px var(--sp-2h); font-size: var(--fs-xs); background: var(--bg2); color: var(--tx2); border: 0; cursor: pointer; transition: background var(--tr), color var(--tr); }
.dq-split-seg button + button { border-left: 1px solid var(--border); }
.dq-split-seg button:hover { color: var(--tx1); }
.dq-split-seg button.on { background: var(--ac-soft); color: var(--ac); font-weight: 600; }
.dq-bar-hist { flex-shrink: 0; }
.dq-run-end { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
.dq-run-sec { margin-top: var(--sp-2h); flex-shrink: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
/* 执行行控制盒统一 26px（图标/文字/输入同高对齐）+开关勾选态语义高亮。
   arf-sel 漏网收编——AutoRefreshSelect 统一件自身定高 25px（组件黑名单
   不可改），宿主侧 deep 覆盖到 ctl-h，「S M L 满/关档/应用/执行」真机一条水平线收口 */
.dq-run-row { --ctl-h: 26px; }
.dq-run-row .dq-sw { height: var(--ctl-h); display: inline-flex; align-items: center; padding: 0 var(--sp-2); border-radius: var(--r-s); border: 1px solid transparent; transition: background var(--tr), color var(--tr), border-color var(--tr); }
.dq-run-row .dq-sw.on { background: var(--ac-soft); color: var(--ac); border-color: var(--ac-line); font-weight: 600; }
.dq-run-row .dq-sw.on input { accent-color: var(--ac); }
.dq-run-row .dq-eh-btn { height: var(--ctl-h); }
/* 字号 seg 尺寸锚（DevTools .dt-font-seg 同形——.seg 全局基类+本页档钮压尺寸） */
.dq-font-seg { flex-shrink: 0; }
.dq-font-seg button { padding: 0 var(--sp-1h); font-size: var(--fs-xs); line-height: 1.8; }
.dq-run-row .dq-jq .inp { height: var(--ctl-h); }
.dq-run-row :deep(.btn.sm) { height: var(--ctl-h); }
.dq-run-row :deep(.arf-sel) { height: var(--ctl-h); }
.dq-height-handle { flex-shrink: 0; margin: var(--sp-1) 0; }
.dq-run-row .dq-params-tg { height: var(--ctl-h); }
.dq-run-sec .dq-run-row { margin-top: 0; }
.dq-run-row { display: flex; align-items: center; gap: 14px; }
/* 20260920 二轮：检索参数独立可折叠块（虚线开关暗示可展开；展开内容限高自滚防撑爆结果区） */
.dq-params-sec { flex-shrink: 0; }
/* 20260920 二轮：检索参数开关钮进执行行（执行左侧）。：节头钮 border+bg2 小卡
   档退役 → 对齐 .dq-sec-tg 无框档。：无框档被用户终审「太廉价不美观无质感」
   翻案——升细描边胶囊（bg1 实底+1px 线+圆角+激活柔底，与 .dq-eh-btn/顶栏按钮同语言），
   track2Wave551 无框形字面锁随迁翻案记档；执行行高度链 .dq-run-row .dq-params-tg 定高零触 */
.dq-params-tg { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); font-weight: 600; padding: 0 var(--sp-2); border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg1); color: var(--tx1); cursor: pointer; transition: background var(--tr), color var(--tr), border-color var(--tr); }
/* 收起态摘要串（次级弱化档不抢主文案；超长省略号收敛防挤爆执行行） */
.dq-params-sum { font-weight: 400; color: var(--tx2); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dq-params-tg:hover { color: var(--ac); border-color: var(--ac-line); }
.dq-params-tg.on { background: var(--ac-soft); border-color: var(--ac-line); color: var(--ac); }
/* width:100% 铺满统一容器（原误嵌 run-row 只占内容宽，移出后保底声明） */
.dq-params-body { width: 100%; padding-top: var(--sp-1h); max-height: max(240px, 30vh); overflow: auto; }
/* 节头开关基类（同检索参数开关语言：实线节头+chevron）。：直方图节头换装
   HistogramSection 后本基类在 DQ 仅构建入口钮本地继承（组件侧自持同源副本）；
   .dq-sec-meta 基规则随 557 节头 meta 换装组件退役 */
.dq-sec-tg { display: flex; align-items: center; gap: var(--sp-1); width: 100%; font-size: var(--fs-xs); font-weight: 600; color: var(--tx1); background: none; border: none; padding: var(--sp-1) 0; cursor: pointer; text-align: left; }
/* 构建器入口大气化（实报「不够大气美观、没凸显重要能力」）——553 六
   检索参数终审胶囊语言同族（细描边+bg1 实底+激活柔底）。.dq-sec-tg 基类为直方图
   节头共用（dqFix552 锁面）零触，覆写只落 .dq-build-tg 侧；26px=全站控制线档
   （执行行 --ctl-h 同值不同域：本钮在 dq-toolbar 非执行行，控制线机制零触） */
.dq-build-tg { width: auto; flex: 0 0 auto; gap: var(--sp-1h); height: 26px; padding: 0 var(--sp-2h); border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg1); font-weight: 650; transition: background var(--tr), color var(--tr), border-color var(--tr); }
.dq-build-tg:hover { color: var(--ac); border-color: var(--ac-line); }
/* 展开态激活柔底=「当前在编辑构建器」状态感知（.dq-sw.on/.dq-params-tg.on 同语义） */
.dq-build-tg.on { background: var(--ac-soft); border-color: var(--ac-line); color: var(--ac); }
/* 条件计数徽标：ac-soft 圆角计数 chip（>0=ac 字+650 数字徽标档），0=bg2 灰态；
   展开态胶囊柔底下徽标反白底保分离；flex-shrink:0 防窄容器挤压变形 */
.dq-build-n { min-width: 15px; height: 16px; padding: 0 var(--sp-1h); display: inline-flex; align-items: center; justify-content: center; border-radius: 99px; font-size: var(--fs-2xs); font-weight: 650; color: var(--ac); background: var(--ac-soft); flex-shrink: 0; }
.dq-build-n.zero { color: var(--tx2); background: var(--bg2); }
.dq-build-tg.on .dq-build-n { background: var(--bg1); }
/* 窄栏（workspace 被拖窄/最小 360）下执行行可换行、开关标签不逐字断行
   （用户截图「直方图」三字竖排堆叠）；执行钮锁宽优先保完整。 */
.dq-run-row { flex-wrap: wrap; row-gap: var(--sp-2); }
.dq-run-row .dq-sw, .dq-run-row .dq-ar, .dq-run-row > .btn { white-space: nowrap; flex-shrink: 0; }
.dq-sw { display: flex; align-items: center; gap: 5px; font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; user-select: none; }
/* .dq-ar 本地定高规则随 AutoRefreshSelect 换装退役（含其上一行「」
   注释的落点——形态由统一件 .arf-sel 承担；run-row 收缩语义保留，dq-ar 类仍在模板上） */
.dq-meta { font-size: var(--fs-sm); color: var(--tx1); }
.dq-meta b { color: var(--ac-hi); }
/* W-A：编辑器高度档位钮组（S/M/L/满） */
.dq-eh { display: flex; gap: var(--sp-0); flex-shrink: 0; }
.dq-eh-btn { border: 1px solid var(--line); background: var(--bg1); color: var(--tx2); font-size: var(--fs-xs); line-height: 1; padding: var(--sp-1) var(--sp-2); cursor: pointer; border-radius: 3px; }
.dq-eh-btn:hover { color: var(--tx1); border-color: var(--ac-line); }
.dq-eh-btn.on { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
/* full 档：编辑器在工作区 pane 内弹性拉伸（MonacoEditor 内置 RO 自适应容器）；min-height 防塌。
   补 overflow-y:auto——full 档 run-row/参数区/lint 降级条同在 pane 内，
   矮视口下面内容可滚达不裁切（52/48 外层高度分配不动，queryWorkbenchW1 契约） */
/* .dq-editor-full 特化随高度链合一退役（弹性范式泛化进 .dq-editor） */
/* 上次执行差值徽章——变快绿 / 变慢黄。
   .dq-delta 手写 chip 三条规则随 MetaStrip 收编退役（dot 冗余色标/tone 归统一件，
   DiagView dgMeta 先例；执行行模板换装 MetaStrip dq-delta-ms） */

/* W2-2：定位失败 finding 的降级提示条——：私造降级规则
   （flex-wrap 横排/warn 12% 透明底）随换装 theme.css .lint-bar/.lint-bar-warn 单源退役 */

/* JQ 行容器化（与参数条/场景条同语言：面板底+边框+圆角），输入聚焦品牌描边 */
.dq-jq {
  display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2);
}
/* JQ 组在 26px 控制线内下沉 8px 错位修治（ 遗产 margin-top 在执行行
   上下文归零）。裸排锁面（queryFlat534:33 字面锁 .dq-jq 规则含 margin-top）保形
   不拆：JQ 恒渲染于 run-row 内，基规则 margin-top 成纯锁面遗产，生效值恒为 0 */
.dq-run-row .dq-jq { margin-top: 0; }
/* input 定宽防超长 placeholder 挤行（flex-shrink:0 保形态，窄容器换行
   由 run-row wrap 承担） */
.dq-jq input { width: min(320px, 30vw); flex-shrink: 0; }
.dq-jq .inp:focus { outline: none; border-color: var(--ac); box-shadow: 0 0 0 3px var(--ac-soft); }
/* profile 树限高 300px → 视口弹性档 max(240px, 42vh)——矮屏不再顶出视口、高屏不无限拉伸 */
.dq-profile { margin-top: var(--sp-2h); max-height: max(240px, 42vh); overflow-y: auto; border-top: 1px solid var(--line); padding-top: var(--sp-2); }
:deep(.pf-node) { margin-left: 0; }
:deep(.pf-row) { display: flex; align-items: center; gap: var(--sp-2h); padding: var(--sp-0) 0 var(--sp-0) calc(var(--d, 0) * 16px); }
:deep(.pf-type) { color: var(--ac-hi); font-size: var(--fs-xs); min-width: 120px; }
:deep(.pf-desc) { flex: 1; font-size: var(--fs-xs); color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.pf-time) { font-size: var(--fs-xs); color: var(--warn); }
:deep(.pf-bar) { width: 120px; height: 4px; background: var(--bg2); border-radius: 2px; overflow: hidden; flex-shrink: 0; }
:deep(.pf-bar i) { display: block; height: 100%; background: linear-gradient(90deg, var(--ok), var(--warn), var(--err)); }

/* 直方图节壳/节头样式（.dq-hist-sec margin-bottom/.dq-hist-head 及其
   .dq-sec-tg/.dq-sec-meta 修治三件）随换装 HistogramSection 退役——margin-bottom 由组件
   scoped 同值承担，552 ⑥ 形态三件随迁组件源；本页只留执行行开关伴生徽标 */
/* 无 date 字段弱化徽标（嗅探语义 title 随开关在执行行承担，视觉降档不抢行） */
.dq-hist-none { font-size: var(--fs-xs); color: var(--tx2); padding: 0 var(--sp-1); }
.dq-fillpage.on { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }

/* 错误详情限高 200px → 视口弹性档 max(240px, 42vh)（与 profile 树同一口径）。
   .dq-err 私造壳（padding+err-line 边框+radius）与独立标题行退役——
   收编全局 .err-bar 范式（err-soft 底+err-line 边归 theme.css :553 单源）；本页只留落位
   差异（margin-top 节奏 + 长文顶对齐 uq-err 先例 + err-bar 兜底 margin-bottom 归零），
   pre 弹性让宽（flex+min-width:0）+ max(240px,42vh) 钳制冻结面零触（queryFlat534 随迁） */
.dq-err { margin-top: var(--sp-3); margin-bottom: 0; align-items: flex-start; }
.dq-err pre { flex: 1 1 auto; min-width: 0; font-size: var(--fs-xs); color: var(--tx1); white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; max-height: max(240px, 42vh); overflow: auto; margin: 0; }

/* 按查询删除异步任务引导条（warn 柔底可关闭，与 .dq-partial 同语言） */
.dq-dbq { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-1h); margin-top: var(--sp-2); padding: 5px var(--sp-2h); font-size: var(--fs-xs); color: var(--tx1); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-s); }
.dq-dbq code { color: var(--ac-hi); word-break: break-all; }
.dq-dbq-prog { color: var(--tx2); }

/* Terms 聚合分区（原独立卡并入结果卡） */
.dq-aggs { margin-bottom: var(--sp-2h); display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--sp-2) var(--sp-5); }
.dq-agg-t { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-1h); }
.dq-agg-row { display: flex; align-items: center; gap: var(--sp-2h); padding: var(--sp-0) 0; }
.dq-agg-k { width: 140px; flex-shrink: 0; font-size: var(--fs-xs); color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dq-agg-track { flex: 1; height: 5px; background: var(--bg2); border-radius: 3px; overflow: hidden; }
.dq-agg-track i { display: block; height: 100%; background: linear-gradient(90deg, var(--info), var(--ac)); border-radius: 3px; }
.dq-agg-n { width: 64px; text-align: right; font-size: var(--fs-xs); color: var(--tx1); flex-shrink: 0; }
/* W-A：聚合桶下钻（可点）+ 占比 + 折叠提示 + metric 值卡 */
.dq-agg-drill { cursor: pointer; border-radius: var(--r-xs); padding: 0 var(--sp-1); margin: 0 calc(-1 * var(--sp-1)); transition: background var(--tr); }
.dq-agg-drill:hover, .dq-agg-drill:focus-visible { background: var(--bg2); outline: none; }
.dq-agg-pct { width: 52px; text-align: right; font-size: var(--fs-xs); color: var(--tx2); flex-shrink: 0; }
.dq-agg-more { font-size: var(--fs-xs); color: var(--tx2); padding: 3px 0 0; }
.dq-agg-kind { margin-left: var(--sp-2); font-size: var(--fs-2xs); color: var(--ac-hi); border: 1px solid var(--ac-line); border-radius: 3px; padding: 0 var(--sp-1); }
.dq-agg-mrow .dq-agg-k { width: auto; flex: 1; }
.dq-agg-mv { font-size: var(--fs-xs); color: var(--tx1); }

/* 结果区约 48%：res-bar 常驻可见，res-body 吃剩余（P0：结果区/命中数不再出视口）。
   min-height:260px 保底（矮视口下结果区仍可用，页面回退可滚） */
/* 20260920：结果区从 48% 弹性改主导吃满（对齐索引工作区「结果表主导」口径） */
/* 20260920 二修：结果区保底 320px 可读（实报「表格这么点高度人怎么操作」），
   直方图分区 + 表格工具行 + 至少数行数据在此预算内 */
.dq-result { margin-top: var(--sp-2h); flex: 1 1 auto; min-height: 320px; display: flex; flex-direction: column; }
/* 视图段钮+分页器窄容器可换行（.dq-toolbar 的换行由 lr-bar 骨架自带，本条非骨架消费方自行补） */
/* 结果区视图 seg 禁换行（实报「点击时表头布局变形」——seg 四钮被挤成
   两行的第一参差源；seg 自身 nowrap，工具行整体仍由 rt-bar 换行策略兜底） */
.dq-res-body :deep(.seg) { flex-wrap: nowrap; }

/* 全量导出弹层 */
.exp-pop { display: flex; flex-direction: column; gap: var(--sp-2); width: 300px; }
.exp-t { font-size: var(--fs-xs); color: var(--tx2); }
.exp-opt { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; }
.exp-fp { width: 100%; }
.exp-hint { font-size: var(--fs-xs); color: var(--tx2); line-height: 1.5; }
/* JSON/Tree/卡片视图高度封顶统一为局部变量（原 56vh 与 560px 两口径，
   切视图页面高度跳变）；值保留  vh 契约（固定 px 小屏溢出视口）。
   P0 高度链：res-body 转确定高容器（overflow:hidden），各视图分支自滚——
   table 分支 RT 在确定高内自滚（.rt-wrap overflow:auto + 回顶钮），其余分支
   flex 收缩 + 保留 --dq-view-cap 兜底（容器高时封顶，容器矮时随容器） */
/* padding 退役（556 设计稿——rt-bar 自带边框+alt-body margin 承接分界，
   外圈留白带是「卡壳影子」）；--dq-view-cap 与 flex 链逐字保留（queryWorkbenchW1:108 正则锁
   随迁、workbenchParity402 cap 锚零触） */
.dq-res-body { --dq-view-cap: 56vh; flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
/* 附属分区固定块：直方图/黄条不参与收缩；聚合区过高时内滚不吃光结果 */
.dq-hist-sec, .dq-partial { flex-shrink: 0; }
.dq-aggs { flex-shrink: 1; min-height: 0; overflow-y: auto; max-height: 40%; }
/* 分档命中——起 RT 根=FocusableSurface 的 section.fs（.rt 下沉为
   fs-body 后代），原 rt 直接子选择器死规则退役（本批 spec 负锚看守，注释不复述其字面）；
   改锚 .fs 按视图分档：
   table 档吃满剩余内滚（flex-basis 0 压过 .fs:not(.fs-active) 的 height:100% basis 引用）；
   alt 档 RT 只剩 rt-bar 自然高（height:auto 压过同款 height:100%），alt 三视图容器吃满
   ——四视图切换跳变/JSON 顶部被裁根治 */
.dq-res-body > :deep(.fs) { flex: 1 1 0; min-height: 0; }
.dq-res-body.alt-view > :deep(.fs) { flex: 0 0 auto; height: auto; }
/* 聚焦态结果区充满聚焦面。记档： FS 收编进 RT 后
   fs-active 是 dq-res-body 后代非祖先，本规则已死不命中；dslFocus435.spec:30 字面锁
   在场保形（删除属锁随迁职责，非本批所有权），聚焦态高度语义由 FocusableSurface
   .fs-active fixed 定位自带承担 */
.fs-active .dq-res-body { height: 100%; overflow: auto; }
/* json/tree 视图高度封顶（原内联 56vh 迁类）；同款：聚焦态解除封顶随聚焦面拉伸。
   高度链下 flex 收缩随容器（min-height:0），cap 仅作容器富余时的兜底封顶 */
/* 547 独立四边框分节框（border+radius+bg1）退役 → border-top 分节
   （DevTools dt-hist 534 同语言；结果工具行/表格自带边框承接分界，卡中卡降层；
   tableBarUnify541/dqRunRowUnify547 两处字面锁随迁；max-height cap 高度语义零触） */
.dq-alt-body { border-top: 1px solid var(--line); margin-top: var(--sp-2); padding-top: var(--sp-1h); }
/* 原连体耦合规则（rt-bar 顶圆角）随壳退役删除——rt-bar 圆角归 ResultTable 自带样式所有 */
.dq-json-wrap { max-height: var(--dq-view-cap); flex: 1 1 auto; min-height: 0; }
.dq-tree-view { max-height: var(--dq-view-cap); padding: var(--sp-2); flex: 1 1 auto; min-height: 0; }
/* fs-active 后代化的 json/tree 解封顶规则（选择器永不命中的死规则）
   全仓零锁面 grep 实证后删（本批 spec 负锚看守，注释不复述其字面）。
   alt 分支 --dq-view-cap 退役评估结论=保留记档：queryWorkbenchW1:109-110/
   workbenchParity402:41-42 字面锁 alt 容器 max-height: var(--dq-view-cap) 在场（非本批
   所有权不可动）；alt-view 分档后 flex 收缩为主，cap 仅容器富余时封顶（矮视口 alt 可读保底） */
/*  P1-7：部分分片失败黄条（warn 柔底、可关闭——横幅纪律） */
.dq-partial { display: flex; align-items: center; gap: var(--sp-1h); padding: 5px var(--sp-2h); margin-bottom: var(--sp-2); font-size: var(--fs-xs); color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-s); }
.dq-partial span { flex: 1; }
.dq-partial-x { border: 0; background: none; color: var(--tx2); cursor: pointer; padding: 0 var(--sp-0); display: inline-flex; }
.dq-partial-x:hover { color: var(--err); }
.dq-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-2h); max-height: var(--dq-view-cap); flex: 1 1 auto; min-height: 0; }
/* 卡片内脏五件样式（.dq-card/.dq-card-id/.dq-card-row/.dq-card-k/.dq-card-v）
   随 alt 体换装 AltHitsViews 统一件迁组件 scoped（类名逐字保形，DOM 查询面零漂移）；
   .dq-cards 容器规则留宿主（包裹 div 在场，W1:112 字面锁面） */

/* .hist-item/.hist-dsl/.hist-meta/.hist-acts 四条死样式退役——
   历史行渲染自 QueryHistoryPanel 共享件（ 收编），本文件模板零引用（grep 实证） */

.vars-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.vars-row { display: flex; align-items: center; gap: var(--sp-2); }
.vars-k { min-width: 120px; font-size: var(--fs-sm); color: var(--ac-hi); }
.vars-tip { margin-top: var(--sp-3); font-size: var(--fs-xs); color: var(--tx2); }

/* 新建文档弹窗 */
.nd-row { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2h); }
.nd-lb { font-size: var(--fs-sm); color: var(--tx1); flex-shrink: 0; }
.nd-tip { margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); }
.nd-bad { color: var(--err); }

/* 900 紧凑微调档（§9.3 口径；§6q 遗留补齐，W-D）——本页分栏/高度链已由
   WorkbenchLayout 宽度驱动 stacked 机制与 P0 定高链接管（1100 档只留条件树限高，
   不在此重复），窄档仅把聚合分区 auto-fit 的 320px 下限收单列防极窄溢出；
   执行行换行由 .dq-run-row 自带 wrap 承担 */
@media (max-width: 900px) {
  .dq-aggs { grid-template-columns: minmax(0, 1fr); }
}
</style>
