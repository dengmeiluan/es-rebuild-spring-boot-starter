<template>
  <FocusableSurface pane-id="qrt.table" title="结果表" headless :enabled="focused" @update:enabled="focused = $event">
  <!-- 五百一十六批用户裁决:放大收编表格内建(FS headless 包根),与 RT 同构——消费方不再各自包 FS。
       ⚠注释必须在 FS 内:根级注释=fragment 根,T39 卸载断裂 -->
  <div ref="rootEl" class="qrt" :class="{ 'is-hscrolled': hScrolled }" data-flex-fill tabindex="-1" role="region" aria-label="查询结果表格（Tab 聚焦后：↑↓ 行导航、Ctrl+F 查找、Esc 退出）"
       @keydown="onQKeydown" @keydown.esc="onEscBlur" @keydown.ctrl.f.prevent="openSearch" @focus="tblFocus = true" @blur="tblFocus = false">
    <!-- 二百六十九批：结果内查找（RT 229 批 P0-1 同款收编，useGridSearch 共用件）——
         absolute 悬浮（kbd-hint 同区，prefsOn=false 的 SQL 通道同样可用）
         六百二十一批·单框双效（620 稿 D1~D5 裁决）：searchable 档 HitNav 挂载点退役——
         查找并入常驻快筛框（词桥见脚本层）；非 searchable 档原样保留
         （269 批「表格必有查找」立法不回退，546 缺省零增量不破） -->
    <template v-if="searchOpen && !searchable">
      <HitNav v-model="searchKw" :count="searchMatches.length" :current="searchCur" class="qrt-hn"
              placeholder="结果内查找…" @next="searchNext" @prev="searchPrev" @keydown.esc.stop="closeSearch" />
      <span v-if="renderTruncated" class="qrt-search-note mono" :title="`结果已截断渲染——查找仅覆盖已渲染的前 ${renderRows.length} 行`">≈ 前 {{ renderRows.length }} 行</span>
    </template>
    <!-- 第五十五批：键盘行导航接入（useRowNav 共享内核，48 批 ResultTable 范式）——
         容器获焦后 ↑↓/Home/End 移动高亮行，深结果集滚动跟随；输入框聚焦不接管。
         行导航快捷键提示（49 批口径——获焦才显示，未聚焦常显反成噪音）；
         absolute 悬浮不依赖 qrt-bar（prefsOn=false 的 SQL 通道同样有提示）。
         注意：55 批注释不得放 template 根级（.qrt 外）——根级注释会让单根组件
         编译成 fragment，happy-dom 叠挂测试触发卸载链断裂（T39）。 -->
    <span v-if="tblFocus && renderRows.length" class="qrt-kbd-hint mono" title="表格已获焦：↑↓ 切换行、Home/End 跳首末行、Ctrl+C 复制行 JSON、Ctrl+F 结果内查找、Esc 退出；滚动到底自动加载后续行">↑↓ Home/End · Ctrl+F</span>
    <!-- R130 二十八批：偏好工具行（密度/列选），仅启用记忆维度时渲染（SQL 通道 R54 不启用，保持零增量）。
         五百二十七批：容器结构随壳收编 TableShell（卡头语言单一出处），类名经 props 注入、
         内容经槽注入，DOM 与既有逐字节一致（291 批守卫锚内核源码字面量，钮组不进壳） -->
    <TableShell v-if="prefsOn" bar-class="qrt-bar" bar-r-class="qrt-bar-r">
      <template #bar-left>
        <!-- 六百零七批：内建视图档分段（bar-left 最前——「展示形式统一在表格头」内核化收编，
             DQ/IH 寄居 seg 同位序；数据驱动出档：jsonHtml/treeData/cardHits 提供哪档出哪档，
             表格档恒在；aria-pressed 可达。缺省 viewSeg=false 不渲染（全站零增量） -->
        <div v-if="viewSegOn" class="seg qrt-view-seg" role="group" aria-label="展示形式">
          <button type="button" :class="{ on: effView === 'table' }" :aria-pressed="effView === 'table'" @click="altView = 'table'">表格</button>
          <button v-if="jsonHtml != null" type="button" :class="{ on: effView === 'json' }" :aria-pressed="effView === 'json'" @click="altView = 'json'">JSON</button>
          <button v-if="treeData != null" type="button" :class="{ on: effView === 'tree' }" :aria-pressed="effView === 'tree'" @click="altView = 'tree'">Tree</button>
          <button v-if="cardHits != null" type="button" :class="{ on: effView === 'cards' }" :aria-pressed="effView === 'cards'" @click="altView = 'cards'">卡片</button>
        </div>
        <!-- 五百四十七批：bar-prepend 槽（bar-left 最前段，RT 541 同款平移）——QRT 宿主视图
             （SystemView/LuceneQueryView）的视图切换 seg/分页器寄居入口（「翻页、展示形式
             统一在表格头」用户裁决）。UI 寄居 prefsOn（storageKey）门控的 qrt-bar，接线宿主
             须同传 storageKey（546 批 searchable/refreshable 同口径）。 -->
        <slot name="bar-prepend" />
        <!-- 五百六十二批 T3②：迁头档内建分页（RT :25 bar-left 同款形态）——pagerInHead=true
             且三参齐备时寄居工具行（翻页/改页大小只 emit，取数归宿主）；底部 qrt-pgr 独立行
             随 pagerOn 互斥退役。缺省 false 不渲染（525 既有链零增量） -->
        <Pagination v-if="pagerHeadOn" :page="pagerPage" :total-pages="pagerTotalPages" :page-size="pagerSize" :disabled="pagerDisabled"
          @update:page="emit('update:page', $event)" @update:page-size="emit('update:pageSize', $event)" />
        <!-- 五百二十五批：计数条补 took（RT rt-info 同款「 · TookBadge」内嵌形态，缺省不渲染） -->
        <span v-if="props.total != null" class="qrt-coln mono">{{ sortedRows.length }}/{{ props.total }}{{ props.totalGte ? '+' : '' }}<template v-if="props.took != null && props.took >= 0"> · <TookBadge :ms="props.took" /></template></span>
        <span class="qrt-coln mono">{{ visibleCols.length }}/{{ columns.length }} 列</span>
        <!-- 一百六十九批：筛选态提示（暗状态可见性——有筛选时行数与清除入口常驻）；
             五百三十四批：组合档切换钮（AND=全部命中 / OR=任一列命中，就地翻转零跳转）
             五百六十一批：同构段收编 TableFilteredHint 片段组件（RT 同款单一出处，DOM 逐字节） -->
        <TableFilteredHint :active="activeFilterCount" :shown="filteredRows.length" :total="rawRows.length"
          :mode="filterModeLive" span-cls="qrt-filtered mono" fmode-cls="qrt-fmode mono" clear-cls="qrt-filtered-clear"
          @toggle-mode="toggleFilterMode" @clear="clearAllFilters" />
        <!-- 五百四十六批 W3：searchable 内建搜索框（与既有钮同排；双绑驱动既有 quickFilter
             过滤链——计数条行数即滤后所见）；Esc 清词。缺省 false 不渲染（全站零增量）
             五百六十一批：同构段收编 TableQSearch 片段组件（RT 同款单一出处，DOM 逐字节）
             六百二十一批·单框双效：@enter 桥接滚动下一命中行（620 稿 D2） -->
        <TableQSearch :on="searchable" q-cls="qrt-qsearch" v-model:kw="searchableKw" @enter="bridgeNext" />
        <!-- 五百四十六批 W3：refreshable 刷新钮——只 emit 'refresh' 意图（对齐 RT 既有事件名；
             525 分页同构：取数归宿主）。缺省 false 不渲染
             五百六十一批：同构段收编 TableRefreshBtn 片段组件（RT 同款单一出处，DOM 逐字节） -->
        <TableRefreshBtn :on="refreshable" btn-cls="qrt-tool-btn" @refresh="emit('refresh')" />
      </template>
      <template #bar-right>
        <!-- 二百七十二批：导出钮（RT 五件套对齐——导出/行高/列选/列宽）；五百二十五批：补 MD/XLSX/PNG
             三档（行集/列集与 CSV 同走 csvBlock()——可见列+排序后全量，所见即所得） -->
        <button :aria-label="'导出当前视图 CSV'" class="btn sm ghost qrt-tool-btn"
          title="导出当前视图 CSV（筛选/排序所见即所得）" :disabled="!rawRows.length" @click="exportCsv">
          <FileDown :size="13" /> CSV
        </button>
        <!-- 五百二十五批：Markdown 档（RT 121 批同格式——表格直贴文档/聊天） -->
        <button :aria-label="'导出当前视图 Markdown'" class="btn sm ghost qrt-tool-btn"
          title="导出当前视图 Markdown 表格" :disabled="!rawRows.length" @click="exportMd">
          <FileText :size="13" /> MD
        </button>
        <!-- 五百二十五批：XLSX 档（xlsxMini 手写零依赖，data+meta 双 sheet，RT 同款） -->
        <button :aria-label="'导出当前视图 XLSX'" class="btn sm ghost qrt-tool-btn"
          title="导出当前视图 XLSX（含 meta 页）" :disabled="!rawRows.length" @click="exportXlsx">
          <Table :size="13" /> XLSX
        </button>
        <!-- 五百二十五批：PNG 快照档（tableSnapshot 2x 像素，html-to-image 动态 import） -->
        <button :aria-label="'导出表格快照 PNG'" class="btn sm ghost qrt-tool-btn"
          title="导出表格快照 PNG（所见即所得截图）" :disabled="isEmpty" @click="exportPng">
          <Camera :size="13" /> PNG
        </button>
        <!-- 五百六十批：JSON 第五导出钮（RT 五格式+快照对位收尾）——QRT 矩阵 JSON 即正解：
            与 RT exportRows('json') 的 _id+_source 文档语义有意分工（rows 型无 _source，
            行集=sortedRows 全量、列=shownCols，与「复制整表 JSON」同口径） -->
        <button :aria-label="'导出当前视图 JSON'" class="btn sm ghost qrt-tool-btn"
          title="导出当前视图 JSON（矩阵，与复制整表 JSON 同口径）" :disabled="isEmpty" @click="exportJson">
          <Braces :size="13" /> JSON
        </button>
        <!-- 二百四十五批：与 RT 同一颗「行高」三档钮（useTablePrefs 内核循环）——
             旧「密度」两态钮与 RT 三档行高不一致（行高一致性用户实报的收尾半边） -->
        <button :aria-label="`行高：当前${rowHLabel}，点击循环三档`" class="btn sm ghost qrt-tool-btn"
          :title="`行高：${rowHLabel}（点击循环 紧凑→标准→宽松）`" @click="cycleRowH">
          <AlignJustify :size="13" /> 行高·{{ rowHLabel }}
        </button>
        <!-- R130 三十二批：列选收编 ColPicker 共享件（与 ResultTable 同一实现）；
             五百四十六批：types 透传（工蚁3 契约）——弹层字段名旁类型徽标与列头徽标同源 -->
        <ColPicker :cols="columns" :selected="visibleCols" label="列选" :types="cpTypes" @update:selected="visibleCols = $event" @locate="locateCol" />
        <!-- 七十一批：列宽批量重置（与 ResultTable 同钮同语义） -->
        <button :aria-label="'重置全部列宽'" class="btn sm ghost qrt-tool-btn" title="重置全部列宽（拖拽过的列回原始宽）" :disabled="!Object.keys(colWidths).length" @click="resetColWidths">
          <RotateCcw :size="13" /> 列宽
        </button>
        <!-- 六百五十三批：列布局方案收纳（TablePresetMenu 单钮+弹层，铁律 C）——652 内核
             preset 三操作消费面；ColPicker 同款共享件，位次=列宽后（291 钮序锁兼容追加）；
             寄居 prefsOn 主壳（storageKey 通道），SQL 独立壳分支不出钮（652 维度关闭=零落盘） -->
        <TablePresetMenu :presets="presets" :save="savePreset" :apply="applyPreset" :del="deletePreset" btn-cls="qrt-tool-btn" />
        <!-- v3.0.1:消费方注入位——与 RT 同排 -->
        <slot name="bar-extra" />
        <!-- 五百一十六批:内建放大/还原(表格自带) -->
        <template v-if="focusable !== false">
          <span class="rt-bar-div" role="separator" />
          <button class="btn sm ghost qrt-tool-btn" :aria-label="focused ? '还原结果表' : '放大结果表'"
            :title="focused ? '还原（Esc 也可退出）' : '放大结果表（整表铺满全屏）'"
            @click="focused = !focused">
            <Minimize2 v-if="focused" :size="13" />
            <Maximize2 v-else :size="13" />
          </button>
        </template>
      </template>
    </TableShell>
    <!-- 五百六十二批 T3①：bar-prepend 槽脱 prefsOn 门控的独立壳分支——无 storageKey 通道
         （SQL/rows 型等）槽内容仍寄居同一 qrt-bar 形态工具行（「翻页、展示形式统一在表格头」
         收尾），迁头档分页器（pagerHeadOn）在此同样可达；工具行其余内容（计数条/筛选提示/
         搜索/刷新/导出钮簇）维持 prefsOn 门控不变，故本分支只承载槽与迁头分页器。有槽或
         迁头档才渲染（缺省零增量）；v-if/v-else-if 与主壳互斥，槽内容只渲染一次 -->
    <TableShell v-else-if="hasPrepend || pagerHeadOn || viewSegOn" bar-class="qrt-bar" bar-r-class="qrt-bar-r">
      <template #bar-left>
        <!-- 六百零七批：内建视图档分段（独立壳分支同挂载——无 storageKey 通道 seg 同样可达，
             pagerInHead 同口径；注释详见 prefsOn 主壳分支） -->
        <div v-if="viewSegOn" class="seg qrt-view-seg" role="group" aria-label="展示形式">
          <button type="button" :class="{ on: effView === 'table' }" :aria-pressed="effView === 'table'" @click="altView = 'table'">表格</button>
          <button v-if="jsonHtml != null" type="button" :class="{ on: effView === 'json' }" :aria-pressed="effView === 'json'" @click="altView = 'json'">JSON</button>
          <button v-if="treeData != null" type="button" :class="{ on: effView === 'tree' }" :aria-pressed="effView === 'tree'" @click="altView = 'tree'">Tree</button>
          <button v-if="cardHits != null" type="button" :class="{ on: effView === 'cards' }" :aria-pressed="effView === 'cards'" @click="altView = 'cards'">卡片</button>
        </div>
        <slot name="bar-prepend" />
        <Pagination v-if="pagerHeadOn" :page="pagerPage" :total-pages="pagerTotalPages" :page-size="pagerSize" :disabled="pagerDisabled"
          @update:page="emit('update:page', $event)" @update:page-size="emit('update:pageSize', $event)" />
      </template>
    </TableShell>
    <!-- 非 prefsOn 通道（SQL R54 零增量工具行不渲染）:悬浮放大钮,查找条打开时让位其左 -->
    <button v-if="focusable !== false && !prefsOn" class="btn sm ghost qrt-fs-btn" :class="{ open: searchOpen }"
      :aria-label="focused ? '还原结果表' : '放大结果表'"
      :title="focused ? '还原（Esc 也可退出）' : '放大结果表（整表铺满全屏）'"
      @click="focused = !focused">
      <Minimize2 v-if="focused" :size="13" />
      <Maximize2 v-else :size="13" />
    </button>
    <!-- 五百二十五批：rows 型转置态提示行（仅转置激活时渲染，默认关=各通道零增量；
         行数档位 select + 退出钮——转置表无列头菜单入口，退出必须在此可达） -->
    <div v-if="transposeOn && !bodyHidden" class="qrt-tr-bar" :class="{ 'after-bar': prefsOn }">
      <span class="qrt-coln mono">转置视图 · 前 {{ transposeCount }} 行做列</span>
      <select class="qrt-t-n mono" :value="transposeN" aria-label="转置显示的行数" title="转置显示的行数"
        @change="setTransposeN(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="n in transposeNs" :key="n" :value="n">{{ n }} 行</option>
      </select>
      <button class="qrt-tr-off" aria-label="退出转置视图" title="退出转置视图" @click="toggleTranspose">✕ 退出转置</button>
    </div>
    <!-- 六百零七批：内建 alt 视图体（viewSeg 非表格档）——AltHitsViews 单源三档（565 共享件），
         容器=border-top 分节+滚动区（ih-alt-body 同语言），maxHeight 与 qrt-wrap 一口径无新
         高度链；卡片档网格容器（ih-cards 同构）+@open-doc 透传宿主。表格档（缺省/回落）恒
         不渲染（零增量） -->
    <div v-if="viewSegOn && effView !== 'table'" class="qrt-alt-body scroll-y" :class="{ 'is-cards': effView === 'cards' }" :style="{ maxHeight }">
      <AltHitsViews v-if="effView === 'json'" view="json" :json-html="jsonHtml" />
      <AltHitsViews v-else-if="effView === 'tree'" view="tree" :tree-data="treeData" />
      <AltHitsViews v-else view="cards" :hits="cardHitsAdapted" @open-doc="emit('open-doc', $event)" />
    </div>
    <!-- 一百六十三批：loading 骨架态（消费方执行中传 :loading——四态互斥 G1-B1 同款，骨架优先于空态）；
         五百四十七批：hideBody（RT 541 同款平移）——三分支链各加缺省恒真的 !hideBody 守卫，
         缺省路径 DOM 逐字节不变（硬契约）；hideBody=true 时表格体区块整体退场 -->
    <!-- 五百五十二批：回顶锚点壳（RT rt-wrap-shell 同款平移）——qrt-backtop 此前锚 .qrt 整卡
         底沿，压住卡底流内 qrt-pgr 分页行右端 Pagination（同病同修）；loading/empty/wrap
         三分支随壳包入保 v-else-if 相邻。QRT 根非 flex 布局，壳只承接定位（最小形态） -->
    <div class="qrt-wrap-shell">
    <template v-if="loading && !bodyHidden">
      <div class="qrt-loading" :style="{ maxHeight }">
        <!-- 五百五十二批：骨架行数/行高参数化（RT 528 批同款形态对齐）——缺省 3 行 30px=163 批
             现状（缺省路径 DOM 逐字节不变） -->
        <SkeletonBox v-for="i in skeletonRows" :key="i" :height="skeletonH" round />
      </div>
    </template>
    <EmptyState v-else-if="isEmpty && !bodyHidden" :icon="Inbox" :text="emptyText" :hint="emptyHint" />
    <div v-else-if="!bodyHidden" ref="wrapRef" class="qrt-wrap" :class="{ 'has-pgr': pagerOn }" :style="{ maxHeight }" @scroll.passive="onWrapScroll">
      <!-- 五百二十五批：rows 型转置视图（RT 231 批同款语言）——列名做首列（sticky），排序后前 N 行
           做横向列；只读镜像（排序/漏斗/行展开在转置态不渲染，退出即回主表） -->
      <table v-if="transposeOn" class="qrt-tbl qrt-transposed">
        <thead>
          <tr>
            <th class="qrt-t-field">字段</th>
            <th v-for="(r, ti) in transposeRows" :key="ti" class="mono qrt-t-hid" :title="'第 ' + (ti + 1) + ' 行'">r{{ ti + 1 }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, ci) in shownCols" :key="c">
            <td class="qrt-t-key mono" :title="c">{{ c }}</td>
            <td v-for="(r, ti) in transposeRows" :key="ci + ':' + ti" class="qrt-t-val mono">{{ r[ci] == null ? '∅' : cellText(r[ci]) }}</td>
          </tr>
        </tbody>
      </table>
      <table v-else class="qrt-tbl" :class="{ dense: rowH === 'compact', cozy: rowH === 'cozy' }">
        <thead>
          <tr>
            <!-- 五百三十批 W-B：selectable 行多选通道——表头全选（口径=当前视图全量）；
                 缺省 false 不渲染（零增量） -->
            <th v-if="selectable" class="qrt-sel-col">
              <input type="checkbox" :checked="allSel" aria-label="全选当前视图行" title="全选/取消全选（当前视图全部行）" @click.stop @change="toggleAllSel" />
            </th>
            <!-- 一百六十七批：冻结序号列（对齐 RT 131 批 dbx 冻结窗格）——宽表横向滚动时行身份不滚走 -->
            <th class="qrt-idx">#</th>
            <th
              v-for="(c, i) in shownCols"
              :key="c"
              :data-col="c"
              :class="{ sortable, on: chainHas(c), 'qrt-col-frozen': prefsOn && isFrozenCol(c), 'qrt-col-flash': flashCol === c, 'qrt-drop-before': prefsOn && qDragOver === c && qDragPlace === 'before' && qDragCol !== c, 'qrt-drop-after': prefsOn && qDragOver === c && qDragPlace === 'after' && qDragCol !== c }"
              :style="prefsOn ? frozenStyle(c) : undefined"
              :title="thTitle(c)"
              :aria-sort="sortable && chainCount > 0 && dispChain[0].f === c ? (dispChain[0].d === 'asc' ? 'ascending' : 'descending') : undefined"
              :tabindex="sortable ? 0 : undefined"
              @keydown.enter.prevent.stop="onSort(i)"
              @keydown.space.prevent.stop="onSort(i)"
              @keydown="onColMenuKey($event, c)"
              @dragover="qOnDragOver($event, c)" @drop="qOnDrop($event, c)"
              @click="onSort(i, $event.shiftKey)"
              @contextmenu.prevent="openColMenu($event, c)"
            >
              <span class="qrt-th-name" :class="{ 'qrt-drag-src': qDragCol === c }" draggable="true"
                :title="prefsOn && isFrozenCol(c) ? '冻结列不可拖动（先取消冻结再移动）' : '拖动重排此列'"
                @dragstart="qOnDragStart($event, c)" @dragend="qOnDragEnd">{{ c }}</span>
              <span v-if="sortable" class="qrt-sort-i">{{ sortInd(i) }}</span><sup v-if="sortable && chainHas(c) && chainCount > 1" class="qrt-sort-ord">{{ chainOrd(c) + 1 }}</sup>
              <!-- 一百六十九批：列头筛选漏斗（激活实色高亮；keydown.stop 防冒泡触发排序；置于 sub 行前防被 block 换行挤下）；
                   五百五十二批：激活高亮并集口径——等值勾选 ∪ 区间 ∪ 包含（此前只认等值勾选，
                   区间/包含档生效漏斗不亮是暗状态可见性缺口） -->
              <button class="qrt-funnel" :class="{ on: funnelOn(c) }" :aria-label="'筛选 ' + c + ' 列'" title="筛选此列"
                @click.stop="openFilter($event, c)" @keydown.stop>
<Filter :size="10" />
</button>
              <!-- 一百七十一批：双层列头（RT 156 批同款）——有类型映射时下行徽标（无类型列留空位对齐）；
                   无映射整体单层零增量。五百二十八批 Lead 裁决扩权：类型读取改走 effType
                   （显式 fieldTypes ∪ 按值采样档）——rows 型采样出类型也白得徽标；
                   hit 型 inferredTypes 恒空零增量 -->
              <span v-if="hasTypes" class="qrt-th-sub"><span v-if="effType(c)" class="qrt-th-type" :class="typeCls(effType(c))">{{ effType(c) }}</span></span>
              <span
                v-if="prefsOn"
                class="qrt-rs" role="slider" tabindex="0" :aria-label="'调整 ' + c + ' 列宽（←/→ 微调，Enter 自适应）'" title="拖拽调整列宽；双击自适应内容（重置走「列宽」钮）"
                @click.stop @dblclick="fitCol(c)" @mousedown="startResize($event, c)"
                @keydown.left.prevent.stop="nudgeColWidth(c, -32)" @keydown.right.prevent.stop="nudgeColWidth(c, 32)" @keydown.enter.prevent.stop="fitCol(c)"
              ></span>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- 一百六十九批：筛选后空集提示（防「空得诡异」——数据明明有、全被筛没了） -->
          <tr v-if="!filteredRows.length" class="qrt-nomatch">
            <td :colspan="selSpan">
              筛选条件无匹配行
              <!-- 四百六十三批：就地一键清除（此前只引导找列头图标，多两跳） -->
              <button class="btn sm ghost" style="margin-left:var(--sp-2h)" @click="clearAllFilters">清除全部筛选</button>
            </td>
          </tr>
          <!-- W7：template v-for 包行+行内展开行（key 移至 template，渲染结果不变） -->
          <template v-for="(row, ri) in renderRows" :key="ri">
          <!-- 五百二十七批：tr class 改数组形态——第二位接 rowClass 契约（undefined 时零附加，渲染不变）；
               五百三十批 W-B：第三位 selectable 选中类（缺省 undefined 零附加，与 rowClass 并存） -->
          <tr :class="[{ 'qrt-row-focus': tblFocus && ri === focusIdx }, rowCls(row, ri), selectable && isSelRow(ri) ? 'qrt-sel' : undefined]">
            <td v-if="selectable" class="qrt-sel-col">
              <input type="checkbox" :checked="isSelRow(ri)" :aria-label="'选中第 ' + (ri + 1) + ' 行'" @click.stop @change="toggleSelRow(ri)" />
            </td>
            <td class="qrt-idx mono">{{ ri + 1 }}</td>
            <td
              v-for="(cell, ci) in row" :key="ci"
              class="qrt-cell" :class="{ expanded: isExpanded(ri, ci), 'qrt-col-frozen': prefsOn && isFrozenCol(shownCols[ci]), 'qrt-hit': isSearchHit(ri, ci), 'rt-hit-cur': isSearchCur(ri, ci), 'num-col': isNumericCol(shownCols[ci]), 'ip-col': semPref && isIpCol(shownCols[ci] ?? ''), ...semToneCls(cell, ci) }" :title="cell === null || cell === undefined ? '' : fullText(cell)"
              @click.exact="onCellClick(cell, ri, ci)"
              @keydown.enter.exact.prevent="onCellClick(cell, ri, ci)"
              @contextmenu.prevent="openCellMenu($event, ri, ci)"
            >
              <!-- R130 三十六批：空值与 ResultTable 统一为灰 ∅（原 '-'）；值照旧展示，单击复制全文。
                   R130 四十二批：epoch 毫秒人性化（title/复制保留原始值），与 ResultTable 同口径。
                   五百二十七批：#cell-<key> 作用域槽首位接管（传 row/value/col）——无槽走既有语义渲染链，
                   行尾悬浮钮/跳转芯片/行级行动注入位不受槽影响 -->
              <template v-if="hasCellSlot(shownCols[ci])"><slot :name="cellSlotName(shownCols[ci])" :row="row" :value="cell" :col="shownCols[ci]"></slot></template>
              <span v-else-if="cell === null || cell === undefined" class="qrt-null">∅</span>
              <!-- 五百六十二批 T2：ES highlight 片段优先（opt-in highlight prop；RT rt-hl 链同源
                   下沉）——hlSegment 净化（em/mark 放行，其余转义 fail-closed）后 v-html；
                   缺省 false 本分支恒不渲染（零行为变） -->
              <span v-else-if="qHlHtml(ri, ci)" class="qrt-hl" v-html="qHlHtml(ri, ci)"></span>
              <template v-else-if="isSearchHit(ri, ci)"><template v-for="(seg, si) in splitMark(displayText(cell, ri, ci), searchDeferred)" :key="si"><mark v-if="seg.m" class="qrt-mark">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></template>
              <!-- W7：长 JSON 对象折叠预览 chip——点击开既有单元格详情弹窗；title 恒 raw 全串 -->
              <button v-else-if="objChip(cell)" class="rt-json-chip" :title="fullText(cell)"
                      :aria-label="'查看完整值（对象 ' + (objChip(cell)?.n ?? 0) + ' 键）'"
                      @click.stop="cellDetail = { ri, ci }">
                <span class="rt-json-chip-p">{{ objChip(cell)?.label }}</span>
                <span class="rt-json-chip-n">{…}{{ objChip(cell)?.n }} 键</span>
              </button>
              <template v-else>{{ displayText(cell, ri, ci) }}</template>
              <!-- 一百六十八批：hover 行内快捷钮（dbx 悬浮行内钮）——浮在行尾格右缘，移出行消失 -->
              <button v-if="ci === row.length - 1" class="qrt-row-copy" :aria-label="'复制行 JSON（第 ' + (ri + 1) + ' 行）'" title="复制行 JSON" @click.stop="copyRowJson(ri)"><Copy :size="11" /></button>
              <!-- W7：行内展开详情钮（行尾 hover，与复制钮同语言） -->
              <button v-if="ci === row.length - 1" class="qrt-row-expand" :aria-label="expandedRows.has(qRowKey(ri)) ? '收起此行详情' : '展开此行详情'"
                :title="expandedRows.has(qRowKey(ri)) ? '收起此行详情（Esc 全部收起）' : '展开此行详情（焦点行按 E）'"
                @click.stop="toggleRowExpand(qRowKey(ri))">
                <ChevronDown v-if="expandedRows.has(qRowKey(ri))" :size="11" />
                <ChevronRight v-else :size="11" />
              </button>
              <!-- 二百四十七批：_index 格跳转芯片（AliasesView/SnapshotsView 同语义）——
                   单击复制语义不变，芯片专职跳转索引工作区 -->
              <button v-if="shownCols[ci] === '_index' && typeof cell === 'string' && cell" class="qrt-idx-go" :aria-label="'打开索引工作区：' + cell" title="打开索引工作区" @click.stop="gotoIndex(cell)"><ExternalLink :size="11" /></button>
              <!-- W7：消费方行级行动注入位（行尾，hover 复制钮旁）——无注入零占位 -->
              <slot v-if="ci === row.length - 1" name="row-actions" :row="row" :ri="ri" />
            </td>
          </tr>
          <!-- W7：行内展开详情行——整行嵌 JsonTree（防爆参数与详情弹窗同款 200/4000）；
               五百二十七批：随壳收编 TableExpandRow（RT 同构段单一出处），DOM 逐字节不变 -->
          <TableExpandRow :open="expandedRows.has(qRowKey(ri))" :colspan="selSpan"
            :label="qRowKey(ri)" :data="qRowObj(ri)" @close="toggleRowExpand(qRowKey(ri))" />
          </template>
          <!-- 二百二十八批 M4：截断保护提示行（与 RT 196 批同文案语义——导出不受影响） -->
          <tr v-if="renderTruncated" ref="truncSentinel" class="qrt-trunc-row">
<td :colspan="selSpan">
            已渲染前 {{ renderRows.length }} 行（共 {{ sortedRows.length }} 行命中排序与筛选）
            <button class="btn sm ghost" style="margin-left:var(--sp-2h)" @click="renderMore">继续渲染下 {{ MAX_RENDER }} 行</button>
            ——完整数据请用「导出」
          </td>
</tr>
        </tbody>
        <!-- 五百二十批：聚合 footer 行（RT 同款；列头菜单「聚合行」开关，es_tbl_agg:<dim> 记忆
             仅 prefsOn 落盘，SQL 通道内存态零增量）——数值列 Σ/avg 复用 useColStats.statsOf 口径；
             冻结列 sticky 经既有 qrt-col-frozen 机制同步（frozenStyle 内联 left 一致）
             五百六十一批：同构段收编 TableAggFoot 片段组件（RT 同款单一出处；列源/冻结判定/
             内联 style 经 props 收口，DOM 逐字节；样式随迁组件全局单源）
             五百六十五批件①：:dist="aggDist" 接线（563 批 TableAggFoot dist 可选 prop 消费——
             此前 QRT 调用点未传缺省零渲染，本批启用；数据面 useAggRow 第 5 参 statsOf(c).dist） -->
        <TableAggFoot v-if="aggOn" prefix="qrt" :cols="shownCols" :foot="aggFoot" :spark="aggSpark"
          :dist="aggDist"
          :empty-pct="aggEmptyPct" :frozen-of="(c) => prefsOn && isFrozenCol(c)"
          :style-of="(c) => (prefsOn ? frozenStyle(c) : undefined)" :sel-hint="aggSelHint" />
      </table>
    </div>
    <!-- 二百五十八批：长列表回顶（RT 同款）——根级独立 v-if，不混入 loading/empty/wrap 渲染链；
         五百二十七批：随壳收编 TableBacktop（258 批双表同款单一出处），class 透传 DOM 不变；
         五百五十二批：移入 qrt-wrap-shell 定位壳（分支链之后兄弟），锚滚动视口底沿不再盖壳外分页行 -->
    <TableBacktop v-if="showTop" class="rt-backtop qrt-backtop" aria-label="回到顶部" title="回到顶部" @top="backToTop" />
    </div>

    <!-- 五百二十五批：内建分页行（tfoot 后表格底部常驻）——共享 Pagination 组件；翻页/改页大小
         只 emit（update:page / update:pageSize），取数归宿主（远端分页契约）。骨架/空态不渲染，
         has-pgr 联动收 wrap 底圆角（分页行接管表格卡底缘）；
         五百四十七批：hideBody 时分页行常驻（工具行同款——展示形式切换不收分页） -->
    <div v-if="pagerOn && ((!loading && !isEmpty) || bodyHidden)" class="qrt-pgr">
      <Pagination :page="pagerPage" :total-pages="pagerTotalPages" :page-size="pagerSize" :disabled="pagerDisabled"
        @update:page="emit('update:page', $event)" @update:page-size="emit('update:pageSize', $event)" />
    </div>

    <!-- 一百二十四批：单元格右键菜单（共享 CellContextMenu，与 RT 同款交互） -->
    <CellContextMenu
      v-if="cellMenu"
      :x="cellMenu.x" :y="cellMenu.y" :title="cellMenu.ci != null && shownCols[cellMenu.ci] ? `按「${shownCols[cellMenu.ci]}」` : ''"
      :items="cellMenuItems"
      @close="closeCellMenu"
    />
    <!-- 一百四十八批：列头右键=列管理菜单（与 RT 同款） -->
    <CellContextMenu
      v-if="colMenu"
      :x="colMenu.x" :y="colMenu.y" :title="colMenu.col"
      :items="colMenuItems"
      @close="colMenu = null"
    />
    <!-- 二百七十批：单元格详情弹层（RT 302 行同款形态） -->
    <n-modal v-model:show="detailOpen" preset="card" title="单元格详情" style="width:680px;max-width:92vw" :bordered="false">
      <div class="qrt-d-meta mono">{{ detailMeta }}</div>
      <JsonTree :data="detailData" tools :max-children="200" :max-str-len="4000" />
    </n-modal>

    <!-- 五百一十九批：列详情弹层（RT 236 批 P2-3 同款形态收编共享件，统计走共享 useColStats） -->
    <ColDetailModal v-model:show="colDetailOpen" :stats="colDetailStats" :label-of="filterLabel" />

    <!-- 五百三十一批 W-B：rowDrawer 行详情侧拉（对标 dbx 行钻取；ReconcileReportDrawer
         n-drawer 范式）——整行键值对 + 逐格复制 + 页脚「复制整行 JSON」（copyRowJson 同一口径）；
         仅 rowDrawer prop 开启且右键「行详情」后可达，缺省整块零渲染（零增量） -->
    <n-drawer v-model:show="rdwOpen" :width="rdwW" placement="right">
      <n-drawer-content title="行详情" closable>
        <div v-if="rdwRow" class="qrt-rdw-body">
          <div class="qrt-rdw-meta mono">第 {{ rdwRow.ri + 1 }} 行 · {{ shownCols.length }} 列</div>
          <div v-for="(c, i) in shownCols" :key="c" class="qrt-rdw-row">
            <span class="qrt-rdw-k mono" :title="c">{{ c }}</span>
            <span class="qrt-rdw-v mono" :title="rdwRow ? fullText(renderRows[rdwRow.ri]?.[i]) : ''">{{ rdwRow ? cellText(renderRows[rdwRow.ri]?.[i]) : '' }}</span>
            <button class="btn ghost xs" :aria-label="'复制 ' + c" title="复制该格全文" @click="copyDrawerCell(rdwRow.ri, i)"><Copy :size="11" /></button>
          </div>
        </div>
        <template #footer>
          <button v-if="rdwRow" class="btn sm" :aria-label="'复制行 JSON（第 ' + (rdwRow.ri + 1) + ' 行）'" @click="copyRowJson(rdwRow.ri)"><Braces :size="12" /> 复制整行 JSON</button>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- 一百六十九批：列筛选弹层（去重值勾选）；五百二十四批：壳收编共享件 ColFilterPopover
         （五处同构壳 qfp/rfp/bw-fp/pl-afp/afp 一处实现），useColFilters 逻辑零改动；
         二百二十二批 fitPopupPos 碰撞自适应+开层聚焦随组件 fit 内建（语义平移不变）；
         五百三十四批：default 注入位放组合档切换钮（AND/OR 就地翻转，与提示行同钮）
         五百五十四批：contains 静态渲染收 isContainsCol 守卫（此前 binary/geo_point/nested/
         object/ip 列照出包含行——base64 串无文本包含语义）
         五百六十五批件③：组合档钮改走 ColFilterPopover 内建 chip（563 批 filterMode 可选
         prop 消费）——默认槽手搓钮退役（aria/title 同语汇随迁组件单源，filterModeToggle561
         行为锚同串保真），提示行 TableFilteredHint 同档切换面不动 -->
    <ColFilterPopover
      v-if="filterPop"
      :col="filterPop.col" :x="filterPop.x" :y="filterPop.y" fit
      :vals="fvals.vals" :total="fvals.total" :has-more="fvals.hasMore" show-has-more bars
      :selected="colFilters[filterPop.col] ?? []" :norm-of="normVal" :label-of="filterLabel"
      search :kw="filterKw" @update:kw="filterKw = $event"
      :range="isRangeCol(filterPop.col)"
      :range-min="rangeFilters[filterPop.col]?.min ?? ''" :range-max="rangeFilters[filterPop.col]?.max ?? ''"
      :range-min-ph="rangePlaceholder(filterPop.col, 'min')" :range-max-ph="rangePlaceholder(filterPop.col, 'max')"
      :contains="isContainsCol(filterPop.col)" :contains-val="containsFilters[filterPop.col] ?? ''"
      :filter-mode="filterModeLive" @toggle-filter-mode="toggleFilterMode"
      @toggle="toggleFilterVal(filterPop.col, $event)" @clear="clearFilter(filterPop.col)"
      @set-range="(side, v) => filterPop && setRangeFilter(filterPop.col, side, v)"
      @set-contains="(v) => filterPop && setContainsFilter(filterPop.col, v)"
      @close="filterPop = null"
    />
    <!-- 五百五十二批：TableBacktop 迁往 qrt-wrap-shell 定位壳内（原位锚 .qrt 整卡底沿盖 qrt-pgr 分页行，翻案记档） -->
  </div>
  </FocusableSurface>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount, useSlots, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { AlignJustify, Inbox, RotateCcw, Copy, Braces, ArrowDown, ArrowUp, EyeOff, Pin, MoveHorizontal, Filter, ExternalLink, Search, FileDown, FileText, Camera, ClipboardList, Maximize2, Minimize2, Table, ChevronDown, ChevronRight } from 'lucide-vue-next';
import FocusableSurface from './FocusableSurface.vue';
import EmptyState from './EmptyState.vue';
import SkeletonBox from './SkeletonBox.vue';
import CellContextMenu from './CellContextMenu.vue';
import JsonTree from './JsonTree.vue';
import AltHitsViews from './AltHitsViews.vue'; /* 六百零七批：alt 三视图体共享件单源（565 立法，内建视图档消费，勿再造壳） */
import ColDetailModal from './ColDetailModal.vue';
import { NModal, NDrawer, NDrawerContent } from 'naive-ui';
import ColPicker from './ColPicker.vue';
/* 六百五十三批：列布局方案共享件（652 preset 内核消费面，RT/QRT 单一出处） */
import TablePresetMenu from './TablePresetMenu.vue';
import Pagination from './Pagination.vue';
import TookBadge from './TookBadge.vue';
import TableShell, { TableExpandRow, TableBacktop } from './TableShell.vue';
import { buildXlsx } from '../utils/xlsxMini';
import { snapshotTableToPng } from '../utils/tableSnapshot';
import { useTablePrefs } from '../composables/useTablePrefs';
import { usePref } from '../composables/urlState';
import { useRowNav } from '../composables/useRowNav';
/* 五百二十八批 W-A：TableShell 第二刀——渲染截断/聚合底行随壳收编共享 composable，
   typeCls 语义色档收 utils/typeTiers 单一出处（RT 同源） */
import { useRenderMore, MAX_RENDER } from '../composables/useRenderMore';
import { useAggRow } from '../composables/useAggRow';
/* 五百六十二批 T1：IP 型判据随迁 typeTiers 单源（isIpType；本地 IP_TYPE_RE 字面退役） */
import { typeCls, isNonSemanticType, RANGE_DATE_RE, isRangeType, rangePlaceholderTxt, isIpType } from '../utils/typeTiers';
/* 五百五十一批：聚合行迷你走势（零依赖纯 SVG 组件复用）——五百六十一批随 tfoot 收编
   TableAggFoot 片段组件（内核模板不再直用，import 随迁） */
import TableAggFoot from './TableAggFoot.vue';
/* 五百六十一批：bar-left 同构段三件收编（筛选态提示/内建搜索/刷新钮——RT 同款单一出处） */
import TableFilteredHint from './TableFilteredHint.vue';
import TableQSearch from './TableQSearch.vue';
import TableRefreshBtn from './TableRefreshBtn.vue';
import { useColFilters, useFilterMode, quickFilterRows } from '../composables/useColFilters';
import { useColStats } from '../composables/useColStats';
/* 五百三十批 W-B：语义格式化共享件（bytes/duration/percent 三型，纯函数） */
import { semFormat } from '../composables/useSemFormat';
import { useColFit, COL_W_MIN, COL_W_MAX, frozenStyleOf } from '../composables/useColFit';
/* 五百六十批：比较器收编 tableSort.compareVals 单源（parseFloat 双试退役——千分位/单位/
   科学计数字符串按值纠错；numeric() 科学计数/时长新档经此双内核生效）
   五百六十五批件②：sortableGuard 随接线引入（显式非语义列排序抑制单源） */
import { compareVals, sortableGuard, useSortChain } from '../composables/tableSort';
import { useColDrag } from '../composables/useColDrag';
import HitNav from './HitNav.vue';
import { useGridSearch, splitMark } from '../composables/useGridSearch';
import { registerTable, unregisterTable } from '../utils/tableRegistry';
import { useAppStore } from '../stores/app';
import { exportStamp, copyText, epochMsText, fmtNum, csvCell, downloadText, downloadBlob } from '../utils/format';
import { matrixText } from '../utils/copyMatrix';
/* 五百六十批：XLSX 双 sheet 装配收编 exportSheets.buildExportSheets 单源（RT 同源） */
import { buildExportSheets } from '../utils/exportSheets';
/* 五百六十二批 T2：highlight 片段装配收编 highlightSanitize.hlSegment 单源（RT hlHtml 同源） */
import { hlSegment } from '../utils/highlightSanitize';
import ColFilterPopover from './ColFilterPopover.vue';

/* 轻量只读通用结果表：统一「表格化展示」共性，不承担编辑/聚合/行内展开等通道特定能力。
   hit 型（ES 文档命中）自动抽 _id/_index/_score + _source 扁平字段为列；
   rows 型（SQL cols+二维 rows）直接直渲；二者二选一，内部按 hits 是否传入自动判定。
   R130 二十八批：传 storageKey（如 'lucene:<index>' / 'pit:<index>'）启用列选/密度/列宽
   三件套按维度记忆（useTablePrefs，与 ResultTable 同键空间口径）；不传则保持轻量无状态。 */
interface Hit {
  _id: string;
  _index: string;
  _score?: number | null;
  _source: Record<string, any>;
  /* 五百六十二批 T2：ES highlight 片段（normalizeResp 透传形态，types.SearchHit 同款）——
     highlight prop 开启时经 hlSegment 净化渲染；不传=无片段回落普通渲染 */
  highlight?: Record<string, string[]>;
}

interface Props {
  /* hit 型：ES 文档命中，自动抽 _index/_id/_score + _source 扁平字段为列 */
  hits?: Hit[];
  /* 三百六十七批：命中总数+下界标注（hit 型可选；传了才在工具行显示，对齐 RT 计数条） */
  total?: number;
  totalGte?: boolean;
  /* rows 型：SQL 的 cols + 二维 rows */
  cols?: string[];
  rows?: (string | number | boolean | null)[][];
  /* 通用 */
  maxHeight?: string;   // 默认 '420px'，超限滚动
  emptyText?: string;   // 默认 '无数据'
  /* 一百七十二批：空态下一步指引（EmptyState 三件套 hint）——不传不渲染，保持零增量 */
  emptyHint?: string;
  sortable?: boolean;   // 是否支持点击表头排序（SQL 通道需要，hit 型可 false）
  /* 五百三十五批：remoteSort 远端排序契约（dbx 对标，525 批分页同构——只 emit 意图、
     排序/取数归宿主）。缺省 false=客户端排序逐字节不变；true 时表头排序入口（点击/键盘/
     右键直选）不改本地行序，只 emit 'sort-change'（载荷 {f,d:'asc'|'desc'}，null=取消排序）；
     多键链是本地排序特性，远端档塌缩为单键三态（升→降→取消） */
  remoteSort?: boolean;
  /* 记忆维度键（如 'lucene:idx-a'）；不传 = 不启用记忆（SQL 通道 R54 特例） */
  storageKey?: string;
  /* 五百五十五批：默认可见列全集——列选无记忆时的缺省集（缺省=前 8 列启发式）。
     列数多于 8 的表（如审计表）传全列，避免尾列（详情/集群）默认被藏 */
  defaultCols?: string[];
  /* 一百六十三批：执行中骨架态——消费方 running/busy 时传 true，渲染骨架行优先于空态 */
  loading?: boolean;
  /* 一百七十一批：字段类型映射（列名→ES 类型）——有值时列头启用双层结构（RT 156 批同款
     下行类型徽标）；不传保持单层零增量（SQL 通道）。数据源 useIndexFieldTypes */
  fieldTypes?: Record<string, string>;
  /* 五百一十六批：内建放大（FocusableSurface）开关——默认开 */
  focusable?: boolean;
  /* 五百二十五批：内建分页（可选）——page/pageSize（+既有 total）三者齐备才渲染 tfoot 后
     分页行（共享 Pagination 组件）；翻页/改页大小只 emit 不取数，远端分页语义归宿主
     （内核不切片）。任一缺省即不渲染，既有消费方零破坏 */
  page?: number;
  pageSize?: number;
  /* 五百二十五批：分页器禁用（宿主执行中传 running/busy） */
  pagerDisabled?: boolean;
  /* 五百二十五批：查询耗时 ms——计数条 TookBadge 对齐 RT 计数条口径；缺省不渲染 */
  took?: number | null;
  /* 五百二十七批 W-D 契约：行级条件色档——返回值追加到每个数据行 tr class（空格拼接，
     与既有选中/焦点类并存）；undefined/null/空串跳过。row=当前渲染行单元（hit 型=hit、
     rows 型=矩阵行），index=渲染行序。缺省零增量 */
  rowClass?: (row: any, index: number) => string | undefined;
  /* 七百四十一批 G149：列头中文语义 tip（列名→中文语义）——可选通道缺省零增量；
       悬浮两段拼接（中文语义+内建排序/列管理提示，thTitle 单源），列名显示与
       导出 CSV/TSV 表头同源口径不动（717 G60/736 G133 双语同款落法） */
  colTips?: Record<string, string>;
  /* 五百二十七批 W-D 契约：导出加工——exportName=下载文件名主段（缺省维持 table-export- 现状）；
     exportCell=导出/复制矩阵单元格值加工（仅 csvBlock/matrixText 管道消费，不改表格显示）。
     两者缺省均零增量 */
  exportName?: string;
  exportCell?: (value: unknown, col: { key: string }, row: any) => unknown;
  /* ═══ 五百三十批 W-B：表格内核扩展四件（全部缺省零增量）═══
     quickFilter=跨可见列 contains 过滤（与既有列筛选 AND 叠加；生效且 0 行走既有空态链）；
     selectable=行多选通道（首列勾选/表头全选/tr 挂 qrt-sel/emit selection-change）；
     semOn=语义渲染扩展（bytes/duration/percent，共享件 useSemFormat；显示加工、
     title/复制/导出恒 raw）；exportRowFilter=导出三管道行级过滤（exportCell 只管格，此只管行） */
  quickFilter?: string;
  selectable?: boolean;
  semOn?: boolean;
  exportRowFilter?: (row: unknown) => boolean;
  /* 五百三十一批 W-B：rowDrawer 行详情侧拉（对标 dbx 行钻取）——开启时单元格右键菜单增
     「行详情」项，侧拉抽屉展示整行键值对+逐格复制+「复制整行 JSON」；缺省 false 零增量 */
  rowDrawer?: boolean;
  /* ═══ 五百三十四批 W3：semRawCols 显式非语义类型抑制守卫（531/533 两次记档主项）═══
     命中列名跳过 semFormat「按值推断」链（裸数字 ≥1000 判 ms / 0..1 判 percent 的误伤面），
     显式 fieldTypes 语义标注（bytes/duration/percent）不受影响；缺省 undefined 全链零增量 */
  semRawCols?: string[];
  /* 五百三十四批 W3：filterMode 跨列筛选组合档——'AND'（缺省）既有行为逐字节不变，
     'OR'=任一筛选列命中即保留（跨列并集档）；prop 播种运行档，弹层/提示行切换钮就地翻转 */
  filterMode?: 'AND' | 'OR';
  /* ═══ 五百四十六批 W3：searchable/refreshable 工具行内建 opt-in（quickFilter/refresh 的 UI 面）═══
     searchable=true → 工具行（bar-left，与既有钮同排）内建搜索输入框，双绑驱动既有
     quickFilter 过滤链（quickFilter 是单向 prop——内部 ref 合成：输入非空以输入为准，
     空输入回落外部 quickFilter 播种值，既有 prop 契约不破）；Esc 清词；placeholder 中文；
     缺省 false=无输入框（全站零增量，530 批「无输入 UI、全站 0 接线」悬空能力落地入口）。
     refreshable=true → 工具行刷新钮，点击只 emit 'refresh' 意图（事件名对齐 RT 既有
     refresh；525 分页同构：只上报意图、取数归宿主）；缺省 false 零增量。
     ⚠ UI 寄居 storageKey 记忆启用的 qrt-bar（prefsOn 门控）——无 storageKey 的通道传
     本组 prop 不出 UI（工具行不在场），接线宿主须同传 storageKey。 */
  searchable?: boolean;
  refreshable?: boolean;
  /* 五百四十七批：hideBody 表格体隐藏（RT 541 同款平移）——消费方实现 JSON/Tree/卡片视图时
     表格体区块（loading/empty/wrap/转置主体分支）与转置态提示行隐藏、工具行与分页行常驻：
     视图切换 seg 寄居 bar-prepend 槽，展示形式切换不再连工具行一起消失。缺省 false 零增量 */
  hideBody?: boolean;
  /* ═══ 五百五十二批：syncSort 宿主权威排序态回填（RT 543 批同款平移）═══
     remote 档箭头此前只随内部意图态 remoteSortCur（用户点击三态循环），宿主无从回填/重置。
     接线后：有值→回填 remoteSortCur（箭头/aria-sort 同步该态，此后用户点击仍走既有三态
     循环只 emit 意图）；null=清态（箭头清+循环基点清）。d 按契约收 1|-1。缺省 undefined=
     未接线零增量（不读不写 remoteSortCur）；本地（客户端）档不消费本 prop——箭头权威仍是
     sortSpec。与五百三十八批「remote 档挂载不读排序落盘」正交兼容：回填只走 prop 不触 LS。 */
  syncSort?: { f: string; d: 1 | -1 } | null;
  /* 五百五十二批：骨架行数/行高参数化（RT 528 批同款形态对齐）——缺省 3 行 30px=163 批现状，
     缺省路径 DOM 逐字节不变 */
  skeletonRows?: number;
  skeletonH?: string;
  /* ═══ 五百六十二批 T2：ES highlight 片段渲染 opt-in（RT W-A 链同源下沉）═══
     true 且 hit 型行带 hit.highlight[col] 片段时，片段经 highlightSanitize.hlSegment
     （join ' … ' + 净化，em/mark 放行、其余转义 fail-closed）v-html 渲染（.qrt-hl），
     优先于普通文本渲染链（空值之后、命中切 mark 之前，与 RT rt-hl 同位序）；
     缺省 false 零行为变（rows 型恒短路——矩阵无 highlight 概念）。 */
  highlight?: boolean;
  /* ═══ 五百六十二批 T3②：分页器迁工具行 opt-in（「翻页统一在表格头」收尾，RT :25 同款）═══
     true 且 page/pageSize/total 三参齐备时：内建 Pagination 寄居工具行 bar-left，
     底部 qrt-pgr 独立分页行退役（互斥收编在 pagerOn 判定，行 v-if 字面不动）。
     ⚠ 与 546 searchable/refreshable 同口径的注意点不适用本 prop：迁头分页器在
     prefsOn 主壳与独立壳分支双挂载（v-if 互斥渲染），无 storageKey 通道同样可达。 */
  pagerInHead?: boolean;
  /* ═══ 六百零七批：内建视图档 opt-in（dbx 差距 #2 收编——「展示形式统一在表格头」内核化）═══
     viewSeg=true → 工具行 bar-left 最前内建 表格/JSON/Tree/卡片 分段（prefsOn 主壳与独立壳
     双通道可达）；非表格档表格体隐藏（hideBody 语义内化进 bodyHidden——工具行常驻、547
     立法不破）、内建 alt 体区渲染 AltHitsViews（565 共享件单源，DQ/IH 自造 seg+hideBody
     联动的两份重复实现自此可退役收编）。缺省 false 全站零增量。
     viewPrefKey 提供时档位 usePref 落盘（跨会话记忆，es-console.pref.* 命名空间）；缺省仅
     内存态（KeepAlive 下组件实例常驻=状态不重置）。
     alt 三档数据源=数据驱动出档（提供哪档出哪档，表格档恒在）：jsonHtml=高亮 pretty HTML
     （宿主 markHtmlAll/highlightJson 链产出，DQ/IH 同构）；treeData=行集（{_id,..._source}，
     JsonTree tools 档）；cardHits=卡片行集（@open-doc 透传宿主开文档，DQ openDoc 同构）。 */
  viewSeg?: boolean;
  viewPrefKey?: string;
  jsonHtml?: string;
  treeData?: unknown;
  cardHits?: Hit[];
}

/* 五百一十六批：内建聚焦面状态(FS headless 双向绑定) */
const focused = ref(false);
const props = withDefaults(defineProps<Props>(), {
  focusable: true,
  hits: undefined,
  cols: undefined,
  rows: undefined,
  maxHeight: '420px',
  emptyText: '无数据',
  emptyHint: undefined,
  sortable: false,
  remoteSort: false,
  storageKey: undefined,
  loading: false,
  fieldTypes: undefined,
  page: undefined,
  pageSize: undefined,
  pagerDisabled: false,
  took: undefined,
  rowClass: undefined,
  colTips: undefined,
  exportName: undefined,
  exportCell: undefined,
  quickFilter: undefined,
  selectable: false,
  semOn: undefined,
  exportRowFilter: undefined,
  rowDrawer: false,
  semRawCols: undefined,
  filterMode: 'AND',
  /* 五百四十六批 W3：内建 UI opt-in 缺省关（全站零增量）；
     五百四十七批：hideBody 缺省 false（RT 541 同款平移） */
  searchable: false,
  refreshable: false,
  hideBody: false,
  /* 五百五十二批：syncSort 缺省 undefined=未接线零增量；骨架缺省 3 行 30px=163 批现状 */
  syncSort: undefined,
  skeletonRows: 3,
  skeletonH: '30px',
  /* 五百六十二批：highlight/pagerInHead 缺省关（全站零增量，消费侧接线下批） */
  highlight: false,
  pagerInHead: false,
  /* 六百零七批：内建视图档缺省关（全站零增量，首消费面 SearchTemplates 本批接线） */
  viewSeg: false,
  viewPrefKey: undefined,
  jsonHtml: undefined,
  treeData: undefined,
  cardHits: undefined,
});

/* ═══ 六百零七批：内建视图档状态机（dbx 差距 #2 收编——「展示形式统一在表格头」内核化）═══
   altView=用户档位（viewPrefKey 提供时 usePref 落盘跨会话记忆，缺省仅内存态——KeepAlive
   下组件实例常驻，状态不重置）；effView=数据驱动生效档——持久化/手选档位的数据源缺席时
   诚实回落表格（偏好保留不回写，数据重回即恢复）；bodyHidden=宿主 hideBody ∪ 内建非表格
   档（547 hideBody 语义内化，561 退聚焦 watch 源随之升级——viewSeg=false 时 bodyHidden≡
   hideBody 单独流转行为等值）。⚠声明必须在 props 之后（usePref/computed 依赖 props） */
const viewSegOn = computed(() => props.viewSeg === true);
const altView: Ref<'table' | 'json' | 'tree' | 'cards'> = props.viewPrefKey
  ? usePref<'table' | 'json' | 'tree' | 'cards'>(props.viewPrefKey, 'table')
  : ref<'table' | 'json' | 'tree' | 'cards'>('table');
const effView = computed<'table' | 'json' | 'tree' | 'cards'>(() => {
  const v = altView.value;
  if (v === 'json' && props.jsonHtml == null) return 'table';
  if (v === 'tree' && props.treeData == null) return 'table';
  if (v === 'cards' && props.cardHits == null) return 'table';
  return v;
});
const bodyHidden = computed(() => props.hideBody === true || (viewSegOn.value && effView.value !== 'table'));
/* 卡片档 AltHitsViews SearchHit 契约桥——本地 Hit._score 可选，补缺省 null（结构补全非类型断言） */
const cardHitsAdapted = computed(() => props.cardHits?.map(h => ({ ...h, _score: h._score ?? null })));

/* 五百六十一批：hideBody→true 自动退出聚焦（RT 552 批 rtFix552 对称件平移）——宿主切走
   表格视图（JSON/Tree 档）时聚焦面不能悬在隐藏表体上。只在 false→true 流转且聚焦中触发
   （immediate 缺省不触发，初始 hideBody=true 挂载零影响）。⚠声明必须在 props 之后
   （watch getter 注册即收集依赖，前置会 TDZ ReferenceError——W6 实报同款课）。
   六百零七批：watch 源升 bodyHidden（hideBody ∪ 内建非表格档）——内建档切换同样自动退
   聚焦，561 语义对 alt 档全覆盖 */
watch(bodyHidden, h => { if (h && focused.value) focused.value = false; });

/* 五百二十五批：内建分页事件——只上报意图，取数/切片由宿主接线（LuceneQueryView 远端分页先例）；
   五百三十批 W-B：selection-change=selectable 行多选通道（rows=选中行原始行对象数组） */
const emit = defineEmits<{
  (e: 'update:page', p: number): void;
  (e: 'update:pageSize', s: number): void;
  (e: 'selection-change', rows: unknown[]): void;
  /* 五百三十五批：remoteSort 远端排序意图（只 emit 不取数；null=取消排序回宿主原始序；
     载荷方向归一 'asc'|'desc'——与 RT 同一公共契约，内核内 SortKey 形态差异在 emit 收口转换） */
  (e: 'sort-change', s: { f: string; d: 'asc' | 'desc' } | null): void;
  /* 五百四十六批 W3：refreshable 刷新意图（对齐 RT 既有事件名；取数归宿主） */
  (e: 'refresh'): void;
  /* 六百零七批：内建卡片档开文档意图透传（AltHitsViews @open-doc 桥，弹窗/取数归宿主） */
  (e: 'open-doc', hit: Hit): void;
}>();

/* _source 扁平字段与固定元列重名时跳过，避免与首列 _id/_index/_score 撞列 */
const META = ['_id', '_index', '_score'];

const store = useAppStore();
/* 二百四十七批：_index 格跳转芯片——router 在无路由测试环境为 undefined，gotoIndex 内护栏 */
const router = useRouter();

const isHits = computed(() => props.hits != null);

/* 五百二十五批：内建分页渲染判定——page/pageSize/total 三参齐备才出分页行（可选 prop 缺省零破坏）。
   五百六十二批 T3②：pagerInHead 开启时底部独立分页行退役（互斥收编在本判定——qrt-pgr 行
   v-if 字面有 rtFix552 源码锁逐字钉死，锚不动改判定）；迁头档判定见 pagerHeadOn */
const pagerOn = computed(() => props.pagerInHead !== true && props.page != null && props.pageSize != null && props.total != null);
/* 五百六十二批 T3②：迁头档判定——pagerInHead=true 且三参齐备，内建 Pagination 寄居工具行
   bar-left（RT :25 同款；prefsOn 主壳与独立壳分支双挂载，v-if 互斥渲染，无 storageKey 通道同样可达） */
const pagerHeadOn = computed(() => props.pagerInHead === true && props.page != null && props.pageSize != null && props.total != null);
const pagerPage = computed(() => props.page ?? 1);
const pagerSize = computed(() => props.pageSize ?? 20);
const pagerTotalPages = computed(() => Math.max(1, Math.ceil((props.total ?? 0) / Math.max(1, pagerSize.value))));

/* 一百七十一批：有任一类型映射才启用双层列头（SQL 通道/未接线消费方保持单层）。
   五百二十八批 Lead 裁决扩权（解除 171 批「无映射整体单层零增量」承诺——SQL 通道白得徽标
   是收益）：显式映射 ∪ 按值采样推断非空即启用；hit 型 inferredTypes 恒空零增量 */
const hasTypes = computed(() =>
  (!!props.fieldTypes && Object.keys(props.fieldTypes).length > 0)
  || Object.keys(inferredTypes.value).length > 0);

/* ═══ 五百二十七批 W-D：契约四件套（rowClass / exportName+exportCell / 按值语义档 / #cell-<key> 槽）═══ */
/* ── 按值语义档：rows 型且列未提供显式类型时的采样推断——前 20 行内
      ISO 日期形态占比 ≥50% 判 'date'、数值形态（允许千分位/百分比后缀）占比 ≥50% 判 'double'。
      与显式 fieldTypes 按列合并、显式优先；只作语义行为档（数值右对齐/千分位、date 本地化、
      区间筛选、列统计口径），双层列头徽标仍以显式 fieldTypes 为准（171/233 批口径不动）。
      消费端 SqlBridge brColTypes 胶水退役后由本档兜底。 ── */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUM_SHAPE_RE = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const inferredTypes = computed<Record<string, string>>(() => {
  if (isHits.value) return {};
  const cols = props.cols ?? [];
  const sample = (props.rows ?? []).slice(0, 20);
  const out: Record<string, string> = {};
  cols.forEach((c, ci) => {
    let date = 0, num = 0, total = 0;
    for (const r of sample) {
      const v = r[ci];
      if (v === null || v === undefined || v === '') continue;
      total++;
      if (typeof v === 'number') num++;
      else if (typeof v === 'string') {
        if (ISO_DATE_RE.test(v)) date++;
        else if (NUM_SHAPE_RE.test(v)) num++;
      }
    }
    if (total > 0 && date / total >= 0.5) out[c] = 'date';
    else if (total > 0 && num / total >= 0.5) out[c] = 'double';
  });
  return out;
});
/* 类型读取收口：显式 fieldTypes 优先，缺列回落采样档（语义行为统一走此函数） */
function effType(col: string): string | undefined {
  return props.fieldTypes?.[col] ?? inferredTypes.value[col];
}
/* 五百四十六批：ColPicker 列选弹层类型徽标透传（工蚁3 契约 prop `types`）——
   显式 fieldTypes ∪ 按值采样推断（显式优先），与列头徽标 effType 同一读取口径；
   空对象=弹层无徽标（零增量向后兼容） */
const cpTypes = computed<Record<string, string>>(() => ({ ...inferredTypes.value, ...props.fieldTypes }));
/* ── 行级条件色档：返回值追加到数据行 tr class（空格拼接）；undefined/null/空串跳过 ── */
function rowCls(row: any, ri: number): string | undefined {
  const c = props.rowClass?.(row, ri);
  return c || undefined;
}
/* ── 导出加工：exportCell 管道收口（缺省恒等=现状零变化；仅矩阵管道消费，显示不受影响）── */
function xCell(v: unknown, key: string, row: any): unknown {
  return props.exportCell ? props.exportCell(v, { key }, row) : v;
}
/* ── 富单元格作用域槽 #cell-<key>（本批只落机制）：命中即完全接管该格内容渲染，
      无槽走既有语义渲染链；行尾悬浮钮/跳转芯片/row-actions 不受影响 ── */
const slots = useSlots();
const cellSlotName = (col: string) => 'cell-' + col;
function hasCellSlot(col: string | undefined): boolean {
  return !!col && !!slots[cellSlotName(col)];
}
/* 五百六十二批 T3①：bar-prepend 槽在场判定——槽脱 prefsOn 门控（无 storageKey 通道仍可
   寄居视图切换 seg/分页器，「翻页、展示形式统一在表格头」收尾），独立壳分支渲染条件之一；
   无槽且无迁头档时该分支不渲染（缺省零增量） */
const hasPrepend = !!slots['bar-prepend'];

/* 五百三十批 W-B：quickFilter 生效且过滤后 0 行 → 并入空态链（EmptyState 文案/hint
   仍走既有 emptyText/emptyHint props，字面零改）；不传 quickFilter 时此路恒 false=现状 */
const isEmpty = computed(() => {
  if (isHits.value ? !props.hits!.length : !props.rows!.length) return true;
  return quickActive.value && quickRows.value.length === 0;
});

/* 列：hit 型 = 固定前缀（有则显示）+ _source 键并集（按首次出现顺序）；rows 型 = cols 直出 */
const columns = computed<string[]>(() => {
  if (!isHits.value) return props.cols ?? [];
  const src = props.hits ?? [];
  const keys: string[] = [];
  for (const h of src) {
    for (const k of Object.keys(h._source ?? {})) {
      if (!META.includes(k) && !keys.includes(k)) keys.push(k);
    }
  }
  const prefix: string[] = ['_id'];
  if (src.some(h => h._index != null && h._index !== '')) prefix.push('_index');
  if (src.some(h => h._score != null)) prefix.push('_score');
  return [...prefix, ...keys];
});

/* ═══ 偏好记忆（列选/密度/列宽）——storageKey 缺省即整体关闭 ═══ */
const dimension = computed(() => props.storageKey || null);
const {
  on: prefsOn, rowH, rowHLabel, cycleRowH,
  visibleCols, colWidths,
  colStyle, startResize, resetColWidths,
  /* 五百二十五批：rows 型转置（RT 231 批同款内核）——useTablePrefs 自带记忆（es_tbl_transpose:*），
     无 storageKey（SQL 通道）自动退化为内存态、不落盘 */
  transpose, toggleTranspose,
  transposeN, setTransposeN, transposeNs,
  freezeN, setFreezeN, freezeFirst, toggleFreezeFirst,
  presets, savePreset, applyPreset, deletePreset, /* 六百五十三批：消费面接线（652 内核三操作+名册） */
} = useTablePrefs(dimension, columns, {
  /* 五百五十五批：宿主可传 defaultCols 作默认可见列全集（如审计表新增「集群」列后
     不被前 8 列启发式藏掉尾列）；缺省维持前 8 列启发式，既有表零感知 */
  defaultVisibleCols: () => (props.defaultCols?.length ? [...props.defaultCols] : undefined),
});
/* 五百二十五批：rows 型转置态（hit 型不提供——RT 转置语义即「字段为行、文档为列」的镜像，
   rows 型对位为「列名为行、前 N 行为列」）；转置渲染行集=排序后前 N 行 */
const transposeOn = computed(() => !isHits.value && transpose.value);
const transposeRows = computed<any[][]>(() => sortedRows.value.slice(0, transposeN.value));
const transposeCount = computed(() => Math.min(transposeN.value, sortedRows.value.length));
/* 渲染列 = 记忆启用时取 visibleCols 子集，关闭时全列（现状行为不变） */
const shownCols = computed<string[]>(() => (prefsOn.value ? visibleCols.value : columns.value));
/* 二百三十六批 P2-4：前缀多列冻结（RT 同款；基数 52px=序号列）。
   五百六十批：装配收编 useColFit.frozenStyleOf 单源（RT 同源；基数 52 以常参注入、
   prefsOn 门控透传，非冻结档 undefined 回落 colStyle 既有兜底） */
const isFrozenCol = (c: string) => prefsOn.value && visibleCols.value.indexOf(c) > -1 && visibleCols.value.indexOf(c) < freezeN.value;
function frozenStyle(col: string): Record<string, string> | undefined {
  return frozenStyleOf(visibleCols.value, colWidths.value, col, freezeN.value, 52, prefsOn.value) ?? colStyle(col);
}

/* 原始行矩阵（未排序）：hit 型按列取元字段/source 字段，缺值落 null；rows 型切片直出 */
const rawRows = computed<any[][]>(() => {
  if (!isHits.value) return (props.rows ?? []).map(r => r.slice());
  return (props.hits ?? []).map(h =>
    columns.value.map(col => {
      switch (col) {
        case '_id': return h._id ?? null;
        case '_index': return h._index ?? null;
        case '_score': return h._score ?? null;
        default: return (h._source ?? {})[col] ?? null;
      }
    })
  );
});

/* 单元格格式化：空值 '-'，对象/数组 JSON.stringify，其余 String */
function fullText(v: any): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* 展示态截断 + title 全文（对象长 JSON 不撑爆表格） */
const MAX_CELL = 160;
function cellText(v: any): string {
  const s = fullText(v);
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL) + '…' : s;
}

/* 排序状态机（六百零三批收编 composables/tableSort.useSortChain 单源——560 记档大件，
   原 1|-1 数字机退役归一字符串机；:m 落盘 M2 写侧本就归一字符串=零格式漂移）。
   同键翻转换键升序起步（227 批 M2 两表同向）/排序键用列名（28 批）/Shift 次键链 ≤3（178 批）/
   右键直选/远端意图镜像（535）/syncSort 回填（552）/维度落盘（storageKey 维度，无
   storageKey 不读不写零增量）全机单一出处；此处只留守卫薄壳、行序应用点与展开态清理钩子
   （坐标键随行序变化一并清，rows 型无稳定 _id）。 */
const chain = useSortChain({
  lsBase: () => (props.storageKey ? 'es_tbl_sort:' + props.storageKey : null),
  isRemote: () => props.remoteSort,
  syncWired: () => props.syncSort !== undefined,
  emitIntent: (s) => emit('sort-change', s),
  onLocalChange: () => { expandedCells.value = new Set(); expandedRows.value = new Set(); },
  notify: (m) => store.notify('warning', m),
});
const sortSpec = chain.sortSpec;
/* 模板辅助：链内方向/序号（aria-sort 仅链首——HTML aria-sort 单值语义）。
   五百五十二批起读「显示链」dispChain：本地档=sortSpec 原语义；remote+syncSort 接线档=
   remoteSortCur 单键镜像；remote 未接线档维持恒空=箭头恒 hint/aria-sort 恒无（零增量）。
   行序/落盘仍只认 sortSpec（remote 档恒空，538 口径不变）——显示与数据分轨。 */
const dispChain = chain.dispChain;
const chainCount = chain.chainCount;
const chainHas = chain.chainHas;
const chainDir = chain.chainDir;
const chainOrd = chain.chainOrd;
/* 回填 watch：有值=回填镜像（1|-1 归一在机内）；null=清态（箭头+循环基点同清，此后点击
   asc 重启）；undefined=未接线不生效零增量。回填只动显示态镜像，sortSpec/行序/落盘零触碰
   （538 口径不变）。immediate：宿主携态挂载（记忆恢复）首渲即回显。 */
watch(() => props.syncSort, (s) => {
  if (s === undefined || !props.remoteSort) return;
  chain.applySync(s);
}, { immediate: true });
/* 五百六十五批件②：显式非语义列排序抑制（563 批 tableSort.sortableGuard 单源出口接线，
   531 遗留件③消费面收口）——binary 等 18 型+_source 列点击排序语义 VOID，入口短路不落态；
   _id/_index/_score/_seq_no 排序有语义豁免（semanticGuard 记档口径）。effType 同 useColStats
   fieldType 先例（显式 fieldTypes ∪ 按值采样推断，无类型列不抑制——零增量缺省）。 */
const sortGuard = sortableGuard((c) => effType(c));
function onSort(i: number, shift = false) {
  if (!props.sortable) return;
  if (qDragClickSuppressed()) return; /* 二百六十七批：拖完 300ms 内的误触排序点击抑制（RT 231 批同款双保险） */
  const name = shownCols.value[i];
  if (!name) return;
  /* 五百六十五批件②：显式非语义列短路（本地/remote 双档同守——不落 sortSpec/不落盘/
     不 emit 远端意图；sortKey/indicator 零触碰） */
  if (!sortGuard(name)) return;
  /* 五百三十五批：remote 档机内只 emit 意图不改本地序（多键链是本地特性，塌缩单键）；
     本地档变更经 onLocalChange 钩子清展开态（W7：坐标键随行序变化一并清，rows 型无稳定 _id） */
  chain.sortBy(name, undefined, shift);
}
/* 一百五十七批：列头右键排序直选（dbx 语义——升/降分开，免循环猜测）。
   五百六十一批：直选与表头点击共用同一收口；六百零三批：方向 1|-1 归一后委托状态机
   （等值单键 no-op/远端直发意图/展开态清理全在机内） */
function directSort(col: string, ci: number, dir: 1 | -1) {
  if (!props.sortable) return;
  chain.sortBy(col, dir === 1 ? 'asc' : 'desc');
}
/* 七百四十一批 G149：列头 th 悬浮 title 单源——colTips 有该列中文语义时两段拼接
   （中文语义+换行+内建排序/列管理提示），无 tip=纯内建提示（缺省零增量） */
function thTitle(c: string): string {
  const base = props.sortable
    ? '点击排序：升序 → 降序 → 取消（回原始序）；Shift+点击：追加/翻转次键；拖列名可重排；右键：列管理'
    : '右键：列管理；拖列名可重排';
  const tip = props.colTips?.[c];
  return tip ? tip + '\n' + base : base;
}
function sortInd(i: number): string {
  /* 一百六十批：未排序列常驻 ⇅ 弱提示（对齐 RT 155 批 dbx 语言），激活显示实色单箭头；
     一百七十八批：链内列箭头+多键序号角标 */
  const c = shownCols.value[i];
  if (!chainHas(c)) return '⇅';
  return chainDir(c) === 'desc' ? '↓' : '↑';
}
/* ═══ 一百六十九批：列头筛选漏斗（dbx 每列筛选——去重值勾选过滤，纯前端当前结果集，
   与 ES 查询互补；多列 AND 组合；不持久化，切维度/隐藏列自动清）。
   二百三十批 P0-4：实现下沉共享 useColFilters（RT 同款接入补齐 169 批「RT 待收编」欠账），
   QRT 行为零变化（qrtColFilter.spec 回归锁）；增强=每值计数/值内搜索/基数降级 200 ═══ */
/* 二百六十七批：列拖拽重排（RT 231 批 P1-6 同款收编，useColDrag 本就 RT/QRT 共用）——
   prefsOn 门控（SQL 通道零增量）；落点写 visibleCols 经 useTablePrefs watch 自动落盘 */
const { dragCol: qDragCol, overCol: qDragOver, overPlace: qDragPlace,
  onDragStart: qOnDragStart, onDragOver: qOnDragOver, onDrop: qOnDrop, onDragEnd: qOnDragEnd,
  isClickSuppressed: qDragClickSuppressed } = useColDrag({
  cols: visibleCols,
  frozenFirst: () => prefsOn.value && freezeFirst.value,
});
/* 五百一十九批：列取值收口——rawRows 二维行按列名取坐标（筛选/列详情统计/整表复制三处共用） */
function qColVal(row: any[], col: string): any {
  const i = columns.value.indexOf(col);
  return i >= 0 ? row[i] : undefined;
}
const filters = useColFilters({
  rows: () => rawRows.value,
  getVal: (row, col) => qColVal(row, col),
  labelOf: (v) => v === null || v === undefined ? '∅' : fullText(v),
  cols: () => shownCols.value,
  onAutoClear: () => { expandedCells.value = new Set(); },
});
const { colFilters, rangeFilters, containsFilters, normVal, activeFilterCount, toggleFilterVal, setRangeFilter, rangeOn, containsOn, setContainsFilter, clearFilter, clearAllFilters } = filters;
const filterLabel = filters.labelOf;
/* 五百五十二批：漏斗激活高亮并集口径——等值勾选 ∪ 区间 ∪ 包含（任一生效即点亮） */
function funnelOn(c: string): boolean {
  return !!(colFilters.value[c]?.length || rangeOn(rangeFilters.value[c]) || containsOn(c));
}
/* 筛选变化连带清展开态（坐标键防错位；230 批收编前由三处各自清，等价收口为一处） */
watch(colFilters, () => { expandedCells.value = new Set(); expandedRows.value = new Set(); }, { deep: true });
const filterPop = ref<{ col: string; x: number; y: number } | null>(null);
/* 值内搜索词（弹层打开即从空开始；关闭随 filterPop 一并复位）。
   五百二十四批：值分布/mini-bar 归一/碰撞定位随壳收编 ColFilterPopover，此处只留开层状态 */
const filterKw = ref('');
const fvals = computed(() => filters.filterVals(filterPop.value?.col ?? '', filterKw.value));
function openFilter(e: MouseEvent, col: string) {
  filterKw.value = '';
  filterPop.value = { col, x: e.clientX, y: e.clientY };
}

/* ═══ 五百三十四批 W3：filterMode 跨列筛选组合档 ═══
   prop 播种运行档（缺省 'AND'）；筛选弹层/提示行切换钮就地翻转；prop 变化跟随播种。
   管线在 useColFilters.filterRows（mode 参数收口，缺省 'AND' 逐字节不变）。
   五百六十批：三件套收编 useColFilters.useFilterMode 单源（RT 同款接线）。 */
const { filterModeLive, toggleFilterMode } = useFilterMode(props);
/* 过滤管线：多列 AND（缺省）；OR 档=任一筛选列命中即保留；每列空选集=该列不过滤（composable 内置） */
const filteredRows = computed(() => filters.filterRows(rawRows.value, filterModeLive.value));

/* ═══ 五百三十批 W-B：quickFilter 跨可见列 contains 过滤 ═══
   与既有列筛选 AND 叠加（filterRows 之后追加，不改 useColFilters 管线）；
   匹配口径=可见列显示全文（fullText）小写包含；不传/空白=恒等回落（零增量）。
   生效且 0 行 → isEmpty 并入空态链（EmptyState 文案零改，hint 走既有 emptyHint）；
   生效且有行 → 列筛选 0 行仍走既有 qrt-nomatch 行（两链互不侵占）。
   五百四十六批 W3：取词收口改走 quickFilterEff——非 searchable 档恒等于 props.quickFilter
   （既有通道逐字节回落）；searchable 档内建输入框非空以输入为准、空输入回落外部播种值。 */
const searchableKw = ref('');
const quickFilterEff = computed<string | undefined>(() => {
  if (!props.searchable) return props.quickFilter;
  const k = searchableKw.value.trim();
  return k || props.quickFilter;
});
const quickActive = computed(() => !!(quickFilterEff.value && quickFilterEff.value.trim().length > 0));
/* 五百六十批：过滤装配收编 useColFilters.quickFilterRows 单源（RT 同款接线）——
   匹配口径=qColVal + fullText（RT 是 getSourceVal + rtCellFullText），getVal/fullOf
   参数化保两内核行为差；空白词恒等回落（同引用）在单源内保真 */
const quickRows = computed(() =>
  quickFilterRows(filteredRows.value, quickFilterEff.value, shownCols.value, (row, c) => qColVal(row, c), fullText));

const sortedRows = computed(() => {
  if (!props.sortable || !sortSpec.value.length) return quickRows.value;
  const spec = sortSpec.value.map(k => ({ i: columns.value.indexOf(k.f), mul: k.d === 'asc' ? 1 : -1 }));
  if (spec.some(s => s.i < 0)) return quickRows.value;
  return quickRows.value.slice().sort((a, b) => {
    for (const { i, mul } of spec) {
      const av = a[i]; const bv = b[i];
      /* 五百六十批：parseFloat 双试退役收编 tableSort.compareVals 单源——千分位
         （'1,300' 此前 parseFloat 截断为 1）/单位/科学计数/时长（ms|s）按值纠错；
         沉底档（null/undefined/''）方向无关恒沉底（对齐 RT :1094-1096 既有语义），非空档乘方向 */
      const blank = av == null || av === '' || bv == null || bv === '';
      const r = compareVals(av, bv);
      if (r !== 0) return blank ? r : r * mul;
    }
    return 0;
  });
});

/* ═══ 二百二十八批 M4：渲染截断保护（RT 196 批同款补齐——此前 QRT 无护栏，
   消费方传大结果集即万行 DOM 拖死交互）。渲染/键盘导航/右键取行走 renderRows（所见即所操作）；
   导出（getCsvBlock/getSortedRows）仍走全量 sortedRows，与 RT「导出不受截断影响」同口径 ═══
   五百二十八批 W-A：内核逻辑随壳收编 useRenderMore（RT 同构段单一出处）——MAX_RENDER/
   renderLimit/watch 重置/截断判定/renderMore/IntersectionObserver 哨兵（rootMargin 80px）
   全在 composable；此处只接线（sortedRows 行源 + rootEl IO 根惰性 getter，规避声明序 TDZ），
   模板截断行/文案/按钮保位不动（autoRenderMore446/qrtRenderMore303 锚随迁内核接线+composable）。 */
const { rows: renderRowsRaw, truncated: renderTruncated, renderMore, truncSentinel } =
  useRenderMore(() => sortedRows.value, () => rootEl.value);
/* 五百五十四批 P0：列选清单（visibleCols 持久化）与 rows 列数解耦时，tbody td 按 row 全量
   渲染会多出「无表头列」——产线实报 Diag 节点表末两列无列名（diag:nodes 清单 8 列 vs
   ND_COLS 10 列，多出的 td 列名查 undefined → semFormat percent/判秒误推断出 0%/120.1s）。
   五百五十四批修正：截齐改「按 shownCols 投影」——row 下标空间=columns（qColVal 同源），
   按数量 slice 在隐藏列交错（非后缀）时会切错位+值串列（88 批排序列隐藏自愈挂载态实证）。
   恒等态（shownCols≡columns）返回原数组直通：行对象引用匹配（rawIdxMap/rawIdxOf）零损耗；
   行索引不变=rowClass/展开/键盘导航零影响；导出走 sortedRows 全量不受投影影响。 */
const renderRows = computed<any[][]>(() => {
  const cols = columns.value;
  const shown = shownCols.value;
  if (shown.length === cols.length && shown.every((c, i) => c === cols[i])) return renderRowsRaw.value;
  const idxs = shown.map(c => cols.indexOf(c));
  return renderRowsRaw.value.map(r => idxs.map(ix => (ix >= 0 ? r[ix] : undefined)));
});

/* ═══ 五百三十批 W-B：行多选通道（selectable）═══
   身份=原始行集索引（渲染行对象与 rawRows 元素同引用：filteredRows/sortedRows 均保引用，
   排序只动副本数组序）；emit('selection-change') 上报原始行对象（hit 型=hit、rows 型=矩阵行）；
   表头全选口径=当前视图全量（sortedRows）；与 rowClass/分页（pagerDisabled 契约不变）并存；
   缺省 selectable=false → 无勾选列 DOM、无事件（零增量）。 */
const selSet = ref<Set<number>>(new Set());
const rawIdxMap = computed(() => {
  const m = new Map<any, number>();
  rawRows.value.forEach((r, i) => m.set(r, i));
  return m;
});
function rawIdxOf(ri: number): number | undefined {
  /* 五百五十四批：渲染投影层（renderRows）与行源（renderRowsRaw）按 ri 一一对应，选中身份
     取行源原引用——列选隐藏（投影拷贝行）下勾选通道不再依赖渲染行引用 */
  const row = renderRowsRaw.value[ri];
  return row ? rawIdxMap.value.get(row) : undefined;
}
function isSelRow(ri: number): boolean {
  const i = rawIdxOf(ri);
  return i != null && selSet.value.has(i);
}
function emitSelection() {
  const out: unknown[] = [];
  for (const i of [...selSet.value].sort((a, b) => a - b)) {
    const v = isHits.value ? props.hits?.[i] : (props.rows ?? [])[i];
    if (v !== undefined) out.push(v);
  }
  emit('selection-change', out);
}
function toggleSelRow(ri: number) {
  const i = rawIdxOf(ri);
  if (i == null) return;
  const n = new Set(selSet.value);
  if (n.has(i)) n.delete(i); else n.add(i);
  selSet.value = n;
  emitSelection();
}
const allSel = computed(() => {
  if (!props.selectable || !sortedRows.value.length) return false;
  return sortedRows.value.every(row => {
    const i = rawIdxMap.value.get(row);
    return i != null && selSet.value.has(i);
  });
});
function toggleAllSel() {
  if (allSel.value) { selSet.value = new Set(); }
  else {
    const n = new Set<number>();
    for (const row of sortedRows.value) { const i = rawIdxMap.value.get(row); if (i != null) n.add(i); }
    selSet.value = n;
  }
  emitSelection();
}
/* 行集重建（props.rows/hits 换数据）→ 原始索引身份失效，残留勾选会错挂新行——清空；
   仅 selectable 启用且有残留时行动（缺省通道零触碰） */
watch(rawRows, () => {
  if (!props.selectable || !selSet.value.size) return;
  selSet.value = new Set();
  emitSelection();
});
/* selectable 时首列勾选列占位——nomatch/截断/展开行 colspan 联动 +1（缺省值同现状） */
const selSpan = computed(() => shownCols.value.length + 1 + (props.selectable ? 1 : 0));

/* R130 三十六批：单元格单击复制全文（对象/数组 JSON），对齐 ResultTable copyCell 口径 */
/* R130 五十一批：长值单元格展开——截断值（…结尾）单击=展开/收起全宽多行，
   非截断值单击=复制，与 ResultTable 的冲突消解口径一致。排序点击会清空展开态（坐标键防错位） */
const expandedCells = ref<Set<string>>(new Set());
/* ═══ W7：行内展开详情行（RT 镜像）═══
   rowKey：hit 型用 _id（跨排序稳定）、rows 型/缺 _id 回落 'r'+ri（坐标键，随排序清零）；
   free 多行展开；Esc=全部收起（与 RT 同裁决）；E=焦点行展开（Enter 语义既有不变）。
   声明必须在本文件 immediate watch 之前：挂载期持久化排序与列选不一致时首跑即写
   expandedRows——声明在后会 TDZ ReferenceError（W6 实报打挂 queryTablePrefs） */
const expandedRows = ref<Set<string>>(new Set());
/* 五十九批：切换记忆维度（storageKey 变化=换索引/换通道）时清展开态——坐标键随行集错位，
   残留展开态会错误命中新结果集同坐标单元格；六十七批：同点重读该维度的排序记忆 */
watch(dimension, () => { expandedCells.value = new Set(); expandedRows.value = new Set(); colFilters.value = {}; filterPop.value = null; chain.reload(); });
/* 八十八批：排序列被列选隐藏则清空排序（所见即所序 T22；27 批 RT 同款，QRT 漏网补齐）。
   immediate：挂载时持久化的排序与列选本就不一致（跨会话残留组合）也要立刻清。
   清排序会改变行序，展开态同点清零（坐标键防错位）。
   一百七十八批：链内任一键被隐藏→从链剔除该键（单键=清空），persistSort 同步 :m/:f/:d。
   二百三十批 P0-4：筛选的隐藏列自动清已下沉 useColFilters（cols+onAutoClear 内置守卫）。 */
watch(shownCols, (cols) => { chain.pruneTo(cols); }, { immediate: true });
const cellKey = (ri: number, ci: number) => ri + ':' + ci;
function isExpanded(ri: number, ci: number) { return expandedCells.value.has(cellKey(ri, ci)); }
function toggleExpand(ri: number, ci: number) {
  const k = cellKey(ri, ci);
  const n = new Set(expandedCells.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  expandedCells.value = n;
}
/* W7：行内展开详情行——rowKey/toggle（声明前置见 expandedCells 上方注释） */
function qRowKey(ri: number): string { return rowId(ri) ?? ('r' + ri); }
function toggleRowExpand(k: string) {
  const n = new Set(expandedRows.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  expandedRows.value = n;
}
function qRowObj(ri: number): Record<string, any> {
  const row = renderRows.value[ri] ?? [];
  const o: Record<string, any> = {};
  shownCols.value.forEach((c, i) => { o[c] = row[i] ?? null; });
  return o;
}
/* W7：长 JSON 对象折叠预览（与 RT 同款；数组/空对象不折叠） */
function objChip(v: any): { label: string; n: number } | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const keys = Object.keys(v);
  if (!keys.length) return null;
  const f = v[keys[0]];
  const fs = f == null ? '' : typeof f === 'object' ? JSON.stringify(f) : String(f);
  return { label: keys[0] + ': ' + (fs.length > 24 ? fs.slice(0, 24) + '…' : fs), n: keys.length };
}
function onCellClick(cell: any, ri: number, ci: number) {
  if (cell === null || cell === undefined) return;
  if (cellText(cell).length > MAX_CELL || isExpanded(ri, ci)) { toggleExpand(ri, ci); return; }
  void copyCell(cell);
}

/* R130 五十四批：大整数（|v|>=1e4 的整数）千分位显示——title/复制仍为原始值；
   epoch 毫秒优先（其自身已是人性化形态），小数与短数字不加工 */
/* 二百三十三批 P2-1：ES 类型 → 语义色类——五百二十八批 W-A 抽 utils/typeTiers 单一出处
   （RT 同源），本文件 import 引入；样式 .qrt-th-type.rt-ty-* 留本文件 scoped */
/* v3.0.0 场景语义分档：数值列右对齐（有类型映射走类型判定，比 RT 采样法准且零开销）。
   五百二十七批：类型读取改走 effType——显式 fieldTypes 优先，缺列回落按值采样档。
   ⚠NUMERIC_TYPES_RE 字面声明保留本文件（semanticTiers500 源码锁 `const NUMERIC_TYPES_RE
   = /^…$/` 字面），与 typeTiers 导出逐字同值；RT 已改引 typeTiers */
const NUMERIC_TYPES_RE = /^(long|integer|short|byte|double|float|half_float|scaled_float|unsigned_long)$/;
function isNumericCol(col: string): boolean {
  const t = effType(col);
  /* 五百五十一批：显式非语义类型更早短路（binary/nested 等压过一切；既有白名单序不动） */
  if (t && isNonSemanticType(t)) return false;
  return !!t && NUMERIC_TYPES_RE.test(t);
}
/* 五百二十批：区间筛选列判定（RT 同款）——数值/日期型（hasTypes 才有显式类型信息）；
   五百二十七批：缺显式类型时回落按值采样档（rows 型 SQL 通道语义档兜底）
   五百五十四批：RANGE_DATE_RE 字面与判据收编 typeTiers 单源（isRangeType 委托；行为等值） */
function isRangeCol(col: string): boolean {
  const t = effType(col);
  /* 五百五十一批：显式非语义类型更早短路（binary/geo_point 等永无区间语义） */
  if (t && isNonSemanticType(t)) return false;
  return isRangeType(t);
}
/* ═══ W7：语义格式化显示层（RT 同款；usePref 全局键 es_tbl_sem，默认开）═══
   只动「显示」：title/复制/导出恒 raw 原文（铁律不涉）；关闭即回落既有渲染 */
/* W7：语义格式化显示层（RT 同款；usePref 全局键 es_tbl_sem，默认开）——
   五百三十批 W-B：内部 ref 更名 semPref 让位同名 prop semOn（语义渲染扩展开关，
   见 displayText/semToneCls；pref 层与 prop 层叠加不互斥）。
   只动「显示」：title/复制/导出恒 raw 原文（铁律不涉）；关闭即回落既有渲染 */
const semPref = usePref('es_tbl_sem', true) as Ref<boolean>;
/* 五百六十二批 T1：IP_TYPE_RE 本地字面退役改引 typeTiers.isIpType（单源，行为零变化） */
const IP_NAME_RE = /(^|_)(ip|ipv4|ipv6)$/i;
function isIpCol(c: string): boolean {
  const t = effType(c);
  if (t) return isIpType(t);
  return IP_NAME_RE.test(c);
}
/* 五百五十四批：包含档入口守卫——非语义类型（binary/geo_point/nested/object…）与 ip 列
   无文本包含语义（base64 串「包含」无意义），弹层不出包含行；无显式类型列不抑制
   （552:292 'name' 口径自洽；RT 新接 contains 行同守卫同口径）
   五百六十二批 T1：抑制判据随迁 typeTiers.isIpType 单源 */
function isContainsCol(c: string): boolean {
  const t = effType(c);
  if (!t) return true;
  return !isNonSemanticType(t) && !isIpType(t);
}
function isDateCol(c: string): boolean {
  const t = effType(c);
  return !!t && RANGE_DATE_RE.test(t);
}
const P2 = (x: number) => String(x).padStart(2, '0');
function localDateTime(d: Date): string {
  return `${d.getFullYear()}-${P2(d.getMonth() + 1)}-${P2(d.getDate())} ${P2(d.getHours())}:${P2(d.getMinutes())}:${P2(d.getSeconds())}`;
}
/* 五百五十四批：占位文案单源收编 typeTiers.rangePlaceholderTxt（原双份逐字退役，行为等值） */
function rangePlaceholder(col: string, side: 'min' | 'max'): string {
  return rangePlaceholderTxt(effType(col), side);
}
/* ═══ 五百六十二批 T2：ES highlight 片段渲染（opt-in highlight prop；RT hlHtml 同源）═══
   hit 型行经 rawIdxOf 找回原始 hit（排序/列选投影后身份保引用），取 hit.highlight[col]
   片段 → hlSegment（join ' … ' + 净化，空档短路）；缺省 highlight=false 或 rows 型恒 ''
   （分支不渲染，零行为变）。净化出口仍单源 hlSafe（em/mark 放行，其余转义 fail-closed）。 */
function qHlHtml(ri: number, ci: number): string {
  if (!props.highlight || !isHits.value) return '';
  const i = rawIdxOf(ri);
  const hit = i != null ? (props.hits ?? [])[i] : undefined;
  return hlSegment(hit?.highlight?.[shownCols.value[ci] ?? '']);
}
function displayText(cell: any, ri: number, ci: number): string {
  const ep = epochMsText(cell);
  if (ep) return ep;
  if (isExpanded(ri, ci)) return fullText(cell);
  /* W7：语义格式化（semOn 开）——date 类型 ISO 串本地化、数值类型列千分位；
     大整数 ≥1e4 千分位为既有行为（不受开关影响），保持 54 批口径 */
  const col = shownCols.value[ci] ?? '';
  /* 五百三十批 W-B：semOn prop 语义渲染扩展（bytes/duration/percent，useSemFormat）——
     命中即显示格式化 text（title/复制/导出恒 raw）；优先于 pref 层千分位链
     （epoch/date 已在上游拦截，两链无重叠）。
     五百三十四批：semRawCols 命中列 noInfer 抑制「按值推断」（显式 fieldTypes 标注不受影响）。
     五百五十七批：显式非语义类型（binary/dense_vector/histogram… 16 型族）同效抑制——
     守卫并上 if 条件位（semFormat 调用字面 534 源码锁钉死改旁不改锚；行为等价于 noInfer
     并上 isNonSemanticType：非语义型永不在 useSemFormat 显式标注白名单内） */
  if (props.semOn && !isNonSemanticType(effType(col))) {
    const f = semFormat(cell, effType(col) ?? '', { noInfer: semRawSet.value.has(col) });
    if (f) return f.text;
  }
  if (semPref.value) {
    if (typeof cell === 'string' && isDateCol(col)) {
      const d = new Date(cell);
      if (!isNaN(d.getTime())) return localDateTime(d);
    }
    if (typeof cell === 'number' && isNumericCol(col)) return fmtNum(cell);
  }
  if (typeof cell === 'number' && Number.isInteger(cell) && Math.abs(cell) >= 1e4) return fmtNum(cell);
  return cellText(cell);
}
/* 五百三十批 W-B：semOn 命中分档类（percent 三档 tone → qrt-sem-g/y/r；bytes/duration 无档）——
   未命中/未开 prop 返回空对象（零增量；类名新空间不触既有锚）。
   五百三十四批：semRawCols 命中列 noInfer 抑制按值推断（percent 误判档随之失效）。
   五百五十七批：显式非语义类型同守卫（557 displayText 对称；tone 分档随推断一起沉默） */
function semToneCls(cell: any, ci: number): Record<string, boolean> {
  const col = shownCols.value[ci] ?? '';
  if (!props.semOn || cell === null || cell === undefined || isNonSemanticType(effType(col))) return {};
  const f = semFormat(cell, effType(col) ?? '', { noInfer: semRawSet.value.has(col) });
  return f?.tone ? { ['qrt-sem-' + f.tone]: true } : {};
}

/* 五百三十四批：semRawCols 命中集（Set 化防每格 Array.includes；缺省 undefined 恒空集零增量） */
const semRawSet = computed(() => new Set(props.semRawCols ?? []));

/* 一百二十三批：单元格右键菜单（与 RT 同一 dbx 风格；复制值/复制行 JSON/按此列排序，
   列头名从 shownCols 取，与表格所见一致） */
const cellMenu = ref<{ x: number; y: number; ri: number; ci: number } | null>(null);
/* 一百四十批：auto-fit 测量根（与 RT 同款） */
const rootEl = ref<HTMLElement | null>(null);
/* 五百一十九批：fit 内核下沉 useColFit（RT 同款收编，单列/全列适应内容同一实现）——
   测量含列头名（277 批口径）、前 200 行、钳位 60~320；QRT 前置固定列=序号 1 列 */
const { fitCol, fitAll } = useColFit({
  rootEl: () => rootEl.value,
  cols: () => shownCols.value,
  nameSel: '.qrt-th-name',
  cellOffset: 1,
  setWidth: (col, w) => { colWidths.value = { ...colWidths.value, [col]: w }; },
});
function openCellMenu(e: MouseEvent, ri: number, ci: number) {
  cellMenu.value = { x: e.clientX, y: e.clientY, ri, ci };
}
function closeCellMenu() { cellMenu.value = null; }
/* 一百四十八批：列头右键=列管理菜单（与 RT 同款；仅记忆启用时暴露列管理项） */
const colMenu = ref<{ x: number; y: number; col: string } | null>(null);
function openColMenu(e: MouseEvent, col: string) {
  colMenu.value = { x: e.clientX, y: e.clientY, col };
}
/* 一百七十五批：列头键盘菜单（键盘可达闭环）——ContextMenu 键 / Shift+F10 打开列管理；
   enter/space 排序快捷键在本函数里直接放行 */
function onColMenuKey(e: KeyboardEvent, col: string) {
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  colMenu.value = { x: r.left + 8, y: r.bottom + 4, col };
}
const colMenuItems = computed(() => {
  const m = colMenu.value; if (!m) return [];
  const ci = shownCols.value.indexOf(m.col);
  /* 一百五十七批：列头右键补排序直选+复制列名（与 RT 同款 dbx 列头菜单语言） */
  const sortItems = props.sortable && ci >= 0 ? [
    { key: 'sort-asc', label: '升序排序', icon: ArrowUp, run: () => directSort(m.col, ci, 1) },
    { key: 'sort-desc', label: '降序排序', icon: ArrowDown, run: () => directSort(m.col, ci, -1) },
  ] : [];
  return [
    /* 五百一十九批：列详情（RT 236 批 P2-3 对齐——统计走共享 useColStats+ColDetailModal） */
    { key: 'col-detail', label: '列详情', icon: Search, run: () => { colDetail.value = m.col; } },
    ...sortItems,
    /* 一百六十九批：筛选漏斗的菜单直达入口（坐标沿用列头右键位置） */
    { key: 'filter-col', label: '筛选此列', icon: Filter, sep: sortItems.length > 0, run: () => {
      filterPop.value = { col: m.col, x: m.x, y: m.y };
    } },
    { key: 'copy-col-name', label: '复制列名', icon: Copy, sep: true, run: async () => {
      const ok = await copyText(m.col);
      store.notify(ok ? 'success' : 'error', ok ? '已复制列名' : '复制失败');
    } },
    /* 五百三十五批：复制表头（TSV）——534 批 P2 记档放弃项落地；空行集走 matrixText 只出
       表头行（copyMatrix 口径铁律「表头行必含」），列=shownCols 所见即所复（与整表复制同列源） */
    { key: 'copy-head-tsv', label: '复制表头（TSV）', icon: ClipboardList, run: async () => {
      const ok = await copyText(matrixText({ rows: [], cols: shownCols.value, getVal: () => null }, 'tsv'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制表头 ${shownCols.value.length} 列（TSV）` : '复制失败');
    } },
    /* 五百二十批：复制整列值——行集=过滤后（所见即所复），TSV 含表头行（copyMatrix 口径铁律） */
    { key: 'copy-col-vals', label: '复制整列值', icon: Copy, run: async () => {
      const rows = filteredRows.value;
      const ok = await copyText(matrixText({ rows, cols: [m.col], getVal: (row, c) => xCell(qColVal(row, c), c, row) }, 'tsv'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制 ${m.col} 整列 ${rows.length} 行` : '复制失败');
    } },
    /* 五百五十七批：复制整表 JSON——copyMatrix json 管道现成（整表复制此前仅 TSV 单档）；
       行集=sortedRows（与格菜单整表 TSV/导出同口径），列=shownCols 所见即所复，值=raw
       （qColVal 原值，与「复制行 JSON」同语义——JSON 档不做显示加工）；零新键零持久化
       五百六十一批：动作函数化 copyTableJson()（原菜单项内联 run）——菜单项与 bar-prepend
       宿主快捷钮（SystemView 收口裁决）共用同一收口（defineExpose 透出） */
    { key: 'copy-table-json', label: '复制整表 JSON', icon: Braces, run: () => copyTableJson() },
    { key: 'hide-col', label: '隐藏此列', icon: EyeOff, sep: true, run: () => {
      if (visibleCols.value.length <= 1) { store.notify('error', '至少保留一列'); return; }
      visibleCols.value = visibleCols.value.filter(c => c !== m.col);
    } },
    { key: 'pin-col', label: '此列置首', icon: Pin, run: () => {
      visibleCols.value = [m.col, ...visibleCols.value.filter(c => c !== m.col)];
    } },
    /* 一百九十七批/207 批：冻结窗格；二百三十六批 P2-4 升级前缀多列——「冻结到此列」。
       遗留清零二批：门控与下方 fit 项同口径取 prefsOn.value——漏 .value 则 computed 对象
       恒 truthy，无记忆模式下 freezeN/setFreezeN 无处落=空操作假菜单项 */
    ...(prefsOn.value && isFrozenCol(m.col)
      ? [{ key: 'unfreeze-col', label: freezeN.value > 1 ? `取消冻结（前 ${freezeN.value} 列）` : '取消冻结', icon: Pin, run: () => setFreezeN(0) }]
      : prefsOn.value
        ? [{ key: 'freeze-col', label: '冻结到此列', icon: Pin, run: () => {
            const idx = shownCols.value.indexOf(m.col);
            setFreezeN(idx + 1);
            store.notify('success', `已冻结前 ${idx + 1} 列（横向滚动时保持可见）`);
          } }]
        : []),
    /* 五百一十九批：fit 内核走共享 useColFit；补「全列适应内容」（RT 162 批对齐）。
       五百二十批：两项按 prefsOn.value 门控——无记忆模式下 setWidth 无处落=空操作假菜单项
       （.value 不可省：colMenuItems 是 computed，ref 在此不自动解包） */
    ...(prefsOn.value ? [
      { key: 'fit-col', label: '此列适应内容', icon: MoveHorizontal, run: () => fitCol(m.col) },
      { key: 'fit-all', label: '全列适应内容', icon: MoveHorizontal, run: () => fitAll() },
    ] : []),
    /* 五百二十批：聚合 footer 行开关（默认关；落盘仅 prefsOn，SQL 通道内存态） */
    { key: 'toggle-agg', label: aggOn.value ? '聚合行：开 ✓' : '聚合行：关', icon: Table, run: () => toggleAggRow() },
    /* 五百二十五批：rows 型转置视图开关（RT 231 批同款能力）——列头菜单入口全通道可达
       （rows 型消费方 SQL 通道无 qrt-bar，开关不可依赖 prefsOn）；无 storageKey 时内存态 */
    ...(!isHits.value
      ? [{ key: 'toggle-transpose', label: transposeOn.value ? '转置视图：开 ✓' : '转置视图：关', icon: Table, run: () => toggleTranspose() }]
      : []),
    /* W7：语义格式化开关（默认开；usePref 全局键 es_tbl_sem 记忆——只动显示层，
       title/复制/导出恒 raw；与 RT 同款列头菜单项） */
    { key: 'toggle-sem', label: semPref.value ? '语义格式化：开 ✓' : '语义格式化：关', icon: Table, run: () => { semPref.value = !semPref.value; } },
    /* 五百五十二批：重置列序（RT 162 批收尾件平移）——columns 原序对现勾选集重置（保留勾选）；
       prefsOn 门控与 hide/pin/fit 同口径（无记忆模式 visibleCols 不进显示链，写了=假菜单项） */
    ...(prefsOn.value ? [{ key: 'reset-order', label: '重置列序', icon: RotateCcw, run: () => {
      const cur = new Set(shownCols.value);
      visibleCols.value = columns.value.filter(c => cur.has(c));
    } }] : []),
  ];
});
/* 二百七十批：单元格详情弹层状态（RT 同款：对象原值/标量包列名键统一成树；
   maxChildren=200/maxStrLen=4000 防 MB 级值拖死弹层） */
const cellDetail = ref<{ ri: number; ci: number } | null>(null);
const detailOpen = computed({
  get: () => !!cellDetail.value,
  set: (v: boolean) => { if (!v) cellDetail.value = null; },
});
const detailData = computed(() => {
  const d = cellDetail.value;
  if (!d) return null;
  const raw = renderRows.value[d.ri]?.[d.ci];
  const col = shownCols.value[d.ci];
  return raw != null && typeof raw === 'object' ? raw : { [col ?? 'value']: raw };
});
const detailMeta = computed(() => {
  const d = cellDetail.value;
  if (!d) return '';
  const raw = renderRows.value[d.ri]?.[d.ci];
  const col = shownCols.value[d.ci] ?? '';
  const kind = raw == null ? 'null'
    : Array.isArray(raw) ? `数组（${raw.length} 项）`
    : typeof raw === 'object' ? `对象（${Object.keys(raw).length} 键）`
    : typeof raw === 'string' ? `字符串（${raw.length} 字符）`
    : typeof raw;
  const t = effType(col);
  return `${col}（第 ${d.ri + 1} 行）${t ? ' · ' + t : ''} · ${kind}`;
});

/* ═══ 五百三十一批 W-B：rowDrawer 行详情侧拉（对标 dbx 行钻取）═══
   入口=单元格右键菜单「行详情」项（props.rowDrawer 门控，缺省 false 无项零增量）；
   面板=整行 shownCols 键值对 + 逐格复制 + 「复制整行 JSON」（copyRowJson 同一口径）；
   关闭即清空行位（坐标键随行集变化会错位，不留悬挂引用）。 */
const rdwRow = ref<{ ri: number } | null>(null);
const rdwOpen = computed({
  get: () => !!rdwRow.value,
  set: (v: boolean) => { if (!v) rdwRow.value = null; },
});
/* ReconcileReportDrawer 同款视口钳制：窄视口按 94% 收口，上限 520 */
const rdwW = Math.min(520, Math.round(window.innerWidth * 0.94));
/* 逐格复制（与右键「复制值」同一口径：对象 JSON 串化、null 空串） */
async function copyDrawerCell(ri: number, ci: number) {
  const v = renderRows.value[ri]?.[ci];
  const ok = await copyText(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  store.notify(ok ? 'success' : 'error', ok ? '已复制' : '复制失败');
}

/* ═══ 五百一十九批：列详情（RT 236 批 P2-3 对齐收编）═══
   统计走共享 useColStats、弹窗复用 ColDetailModal；口径=筛选后行集（所见即所析）。
   数值口径：fieldTypes 优先（NUMERIC_TYPES_RE 数值型 → 数字字符串也计入 Σ/avg/min/max），
   无类型映射回落采样（列内 number 值占比 ≥60%，RT numericCols 163 批同口径） */
const colDetail = ref<string | null>(null);
const colDetailOpen = computed({
  get: () => !!colDetail.value,
  set: (v: boolean) => { if (!v) colDetail.value = null; },
});
/* 六百零五批：统计行基（RT 对称件，dbx 行选聚合对位）——选中行集在场=「选中∩过滤后」，
   无选中=过滤后全量（缺省零增量）。selSet 键=rawRows 索引，filteredRows 与 rawRows
   保引用经 rawIdxMap 判定；useColStats 无缓存，行基动态切换全链自动跟随，
   列详情弹窗同源同基=与聚合行同一数字 */
const aggBaseRows = computed<any[]>(() => selSet.value.size
  ? filteredRows.value.filter(r => { const i = rawIdxMap.value.get(r); return i != null && selSet.value.has(i); })
  : filteredRows.value);
const colStats = useColStats({
  rows: () => aggBaseRows.value,
  getVal: (row, c) => qColVal(row, c),
  labelOf: (v) => v === null || v === undefined ? '∅' : fullText(v),
  fieldType: (c) => effType(c) ?? '',
  isNumeric: (c) => {
    const t = props.fieldTypes?.[c];
    /* 五百五十一批：显式非语义类型更早短路（白名单语义不变——非语义族永不命中 NUMERIC_TYPES_RE） */
    if (t && isNonSemanticType(t)) return false;
    if (t) return NUMERIC_TYPES_RE.test(t);
    let num = 0, total = 0;
    for (const row of filteredRows.value.slice(0, 50)) {
      const v = qColVal(row, c);
      if (v === null || v === undefined || v === '') continue;
      total++;
      if (typeof v === 'number') num++;
    }
    return total > 0 && num / total >= 0.6;
  },
});
const colDetailStats = computed(() => (colDetail.value ? colStats.statsOf(colDetail.value) : null));

/* ═══ 五百二十批：聚合 footer 行（列头菜单「聚合行」开关，RT 同款）═══
   数值列 Σ/avg 复用 useColStats.statsOf 口径（rows=过滤后行集，与列详情弹窗同一数字）；
   落盘 es_tbl_agg:<dim> 沿用 useTablePrefs 读写范式；无 storageKey（SQL 通道）仅内存态、
   不写 LS=零增量。五百二十八批 W-A：readAggPref/aggOn/toggleAggRow/aggFoot 随壳收编
   useAggRow（RT 同构段单一出处；唯一差列源 shownCols vs visibleCols → 参数 renderCols），
   模板 tfoot 保位不动（diagTableAgg/healthTablesGraft 挂载级行为锁零改锚）。
   五百三十八批：AggNum 补 count 档（statsOf().count 非空值计数，同一 statsOf 调用
   零增量取字段）——tfoot「Σ … · avg …」前缀之后 append（wave535 contains 前缀锁兼容） */
/* 五百三十八批 T1：count 装配基座——538 源码锁 toContain 逐字节锚定 return 行（552 不得改动）。
   五百五十二批：median 档在 useAggRow 装配层由 wrapper 并入（RT 同构） */
function numericOfCount(c: string) {
  const t = effType(c);
  if (t && isNonSemanticType(t)) return null;
  const s = colStats.statsOf(c);
  return s.numeric ? { ...s.numeric, count: s.count } : null;
}
const { aggOn, toggleAggRow, aggFoot, aggSpark, aggDist } = useAggRow(
  dimension,
  () => shownCols.value,
  /* 五百五十二批：median 并入（statsOf 复算一次取 median——基座 538 源码锁逐字节钉死不可动；
     复算纯读无副作用，aggOn 非默认档才有开销；QRT/RT 同构） */
  (c) => { const n = numericOfCount(c); return n ? { ...n, median: colStats.statsOf(c).median ?? undefined } : null; },
  /* 五百五十一批：迷你走势数据源（useColStats.seriesOf 同硬口径；显式非语义类型同守卫不出） */
  (c) => { const t = effType(c); if (t && isNonSemanticType(t)) return null; return colStats.seriesOf(c); },
  /* 五百六十五批件①：值分布数据源接线（563 批 useAggRow 第 5 参消费）——useColStats.dist
     直连（utils/distBins 单源，与列详情弹窗分布段同语汇）；二道守卫内建：typeTierSuppressed
     抑制列（binary 等 18 型+_source）dist 恒 null、数值点 <2 列 null——aggDist 装配层天然不出 */
  (c) => colStats.statsOf(c).dist,
);
/* 五百五十四批：tfoot 空值率档数据源（aggFoot 在场=数值列口径）。五百五十八批：取整口径
   下沉 useColStats.emptyPctOf 单源（QRT/RT 双份内联退役换调用）；空值率不塞 538 源码锁
   钉死的 numericOfCount 装配层，仍从 statsOf 另取 */
const aggEmptyPct = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {};
  if (!aggOn.value) return out;
  for (const c of shownCols.value) {
    if (!aggFoot.value?.[c]) continue;
    out[c] = colStats.emptyPctOf(c);
  }
  return out;
});
/* 六百零五批：tfoot 口径徽标（RT 同构）——「选中 N 行」/「选中 K/N 行」；
   无选中 null=零渲染 */
const aggSelHint = computed<string | null>(() => {
  if (!selSet.value.size) return null;
  const k = aggBaseRows.value.length;
  return k === selSet.value.size ? `选中 ${k} 行` : `选中 ${k}/${selSet.value.size} 行`;
});

/* 三百零五批：行 _id 取值（hit 型 columns 含 _id 前缀列）；跳数据浏览器深链（doc+idx 双参） */
function rowId(ri: number): string | null {
  if (!isHits.value) return null;
  const idx = shownCols.value.indexOf('_id');
  const v = idx >= 0 ? renderRows.value[ri]?.[idx] : null;
  return typeof v === 'string' && v ? v : null;
}
function openInBrowser(ri: number) {
  const q: Record<string, string> = { doc: rowId(ri)! };
  const idxCi = shownCols.value.indexOf('_index');
  const idxV = idxCi >= 0 ? renderRows.value[ri]?.[idxCi] : null;
  if (typeof idxV === 'string' && idxV) q.idx = idxV;
  router.push({ path: '/browser', query: q });
}

/* 一百二十四批：菜单项（复制值 / 复制行 JSON / 按此列排序），交给共享 CellContextMenu 渲染 */
const cellMenuItems = computed(() => {
  const m = cellMenu.value; if (!m) return [];
  const col = shownCols.value[m.ci];
  /* 五百三十批 W-B：按此值筛选可用性——仅 rows 型 sortable 数据表（hits 型隐藏）；
     标量值（含 null，面板有 ∅ 选项）才给项，对象值无勾选语义 */
  const mv = renderRows.value[m.ri]?.[m.ci];
  const canFilterByVal = !isHits.value && props.sortable && col != null
    && (mv === null || (mv !== undefined && typeof mv !== 'object'));
  return [
    { key: 'copy-val', label: '复制值', icon: Copy, run: async () => {
      const v = renderRows.value[m.ri]?.[m.ci];
      const ok = await copyText(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
      store.notify(ok ? 'success' : 'error', ok ? '已复制' : '复制失败');
    } },
    /* 二百七十批：单元格详情（RT 229 批 P0-2 同款收编）——完整值弹层不再只能看截断串 */
    { key: 'detail-cell', label: '查看完整值', icon: Search, run: () => { cellDetail.value = { ri: m.ri, ci: m.ci }; } },
    /* W7：行内展开详情（与行尾钮/E 键同态：expandedRows；RT 镜像） */
    { key: 'expand-row', label: expandedRows.value.has(qRowKey(m.ri)) ? '收起此行' : '展开此行', icon: ChevronDown, run: () => { toggleRowExpand(qRowKey(m.ri)); } },
    /* 五百三十一批 W-B：行详情侧拉入口（props.rowDrawer 门控，缺省 false 无项零增量） */
    ...(props.rowDrawer ? [{ key: 'row-drawer', label: '行详情', icon: Search, run: () => { rdwRow.value = { ri: m.ri }; } }] : []),
    /* 三百零五批：在数据浏览器打开此文档（有 _id 时）——行→文档链路，深链 ?idx=&doc=；
       索引取行 _index 元列（缺省由数据浏览器按 pickedIdx 兜底） */
    ...(rowId(m.ri)
      ? [{ key: 'open-browser', label: '在数据浏览器打开此文档', icon: Search, run: () => openInBrowser(m.ri) }]
      : []),
    /* 一百五十七批：复制列名（与 RT 单元格菜单对齐） */
    { key: 'copy-col-name', label: '复制列名', icon: Copy, run: async () => {
      const ok = await copyText(col);
      store.notify(ok ? 'success' : 'error', ok ? '已复制列名' : '复制失败');
    } },
    { key: 'copy-row', label: '复制行 JSON', icon: Braces, run: () => {
      const row = renderRows.value[m.ri] || [];
      const obj: Record<string, any> = {};
      shownCols.value.forEach((c, i) => { obj[c] = row[i] ?? null; });
      copyText(JSON.stringify(obj, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制行 JSON' : '复制失败'));
    } },
    /* 五百一十九批：整表复制（当前页）为 TSV——行集=sortedRows（全量口径与导出一致，
       截断渲染不影响），列=shownCols，格式化走共享 copyMatrix */
    { key: 'copy-table-tsv', label: '复制整表（当前页）为 TSV', icon: ClipboardList, sep: true, run: async () => {
      const rows = sortedRows.value;
      const ok = await copyText(matrixText({ rows, cols: shownCols.value, getVal: (row, c) => xCell(qColVal(row, c), c, row) }, 'tsv'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行（TSV）` : '复制失败');
    } },
    { key: 'sort', label: `按「${col}」排序`, icon: ArrowDown, run: () => onSort(m.ci) },
    /* 五百五十六批：筛选此列直达（RT 格右键 230 批对称件；两表列头菜单均已有，唯 QRT
       格右键缺——552 合并两步走对称件收尾）。弹层落点=菜单坐标；筛选内存态不依赖
       prefsOn（与列头 filter-col 同口径），开层清搜索词与 openFilter 同款 */
    ...(col != null ? [{ key: 'filter-col', label: '筛选此列', icon: Filter, run: () => {
      filterKw.value = '';
      filterPop.value = { col, x: m.x, y: m.y };
    } }] : []),
    /* 五百三十批 W-B：按此值筛选——等价于点列头筛选漏斗并勾入该值（复用既有
       ColFilterPopover 开层 + toggleFilterVal 勾选链，弹层坐标沿用菜单落点，
       与列头菜单「筛选此列」直达先例同款）；与既有各列筛选叠加不清空 */
    ...(canFilterByVal ? [
      { key: 'filter-by-val', label: '按此值筛选', icon: Filter, sep: true, run: () => {
        const v = renderRows.value[m.ri]?.[m.ci];
        if (v === undefined) return;
        toggleFilterVal(col, v);
        filterPop.value = { col, x: m.x, y: m.y };
      } },
    ] : []),
    /* 一百二十九批：列管理直达（与 RT 同款 dbx 项）——仅记忆启用时暴露，
       动作落在 visibleCols 上经 useTablePrefs watch 自动落盘 */
    ...(prefsOn.value ? [
      { key: 'hide-col', label: '隐藏此列', icon: EyeOff, sep: true, run: () => {
        if (visibleCols.value.length <= 1) { store.notify('error', '至少保留一列'); return; }
        visibleCols.value = visibleCols.value.filter(c => c !== col);
      } },
      { key: 'pin-col', label: '此列置首', icon: Pin, run: () => {
        visibleCols.value = [col, ...visibleCols.value.filter(c => c !== col)];
      } },
      /* 一百四十批：此列适应内容；五百一十九批：内核走共享 useColFit（与 RT 同一实现）；
         五百五十六批：补「全列适应内容」（RT 格右键 254 批对位项，同 prefsOn 门控） */
      { key: 'fit-col', label: '此列适应内容', icon: MoveHorizontal, run: () => fitCol(col) },
      { key: 'fit-all', label: '全列适应内容', icon: MoveHorizontal, run: () => fitAll() },
    ] : []),
  ];
});
/* 一百四十六批：删除 menuCopyVal/menuCopyRowJson/menuSortCol——123 批独立函数版菜单实现，
   124 批收编 cellMenuItems computed 后即成死代码（无模板/逻辑引用），双路径易误导后人 */
/* R130 三十六批：单元格单击复制全文（对象/数组 JSON），对齐 ResultTable copyCell 口径 */
async function copyCell(v: any) {
  if (v === null || v === undefined || v === '') return;
  const ok = await copyText(typeof v === 'object' ? JSON.stringify(v) : String(v));
  store.notify(ok ? 'success' : 'error', ok ? '已复制单元格' : '复制失败');
}

/* v3.0.0：拖拽柄键盘微调列宽（role=slider 的 ←/→，与拖拽/双击同一写入口）；
   五百二十批：钳位引用 useColFit 共享常量——与双击自适应同源，不再互相反缩 */
function nudgeColWidth(col: string, delta: number) {
  const cur = colWidths.value[col] ?? 160;
  colWidths.value = { ...colWidths.value, [col]: Math.min(COL_W_MAX, Math.max(COL_W_MIN, cur + delta)) };
}

/* ═══ 第五十五批：键盘行导航（useRowNav 共享内核）═══
   420px 滚动区 + 深结果集场景，↑↓ 走出视口时自动滚动跟随（block:'nearest' 不打断当前视野） */
/* 一百三十五批：Ctrl+C=复制焦点行 JSON（列=shownCols 所见即所得，与右键复制行 JSON 同款） */
const { focusIdx, tblFocus, onRowNavKey } = useRowNav(computed(() => renderRows.value.length), {
  onCopy: (i) => copyRowJson(i),
});
/* W7：E=展开/收起焦点行内嵌详情（输入态让路；Enter 语义保持既有不变）；
   其余键转交行导航内核（同元素不重复挂 @keydown 的收口范式与 RT onGridKeydown 一致） */
function onQKeydown(e: KeyboardEvent) {
  if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey && focusIdx.value >= 0) {
    const t = e.target as HTMLElement | null;
    const isInput = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (!isInput) { e.preventDefault(); toggleRowExpand(qRowKey(focusIdx.value)); return; }
  }
  /* 五百三十四批 P2：pagerOn 键盘翻页——PageUp/PageDown 逐页、Ctrl+Home/Ctrl+End 首末页跳页，
     只 emit update:page 意图（取数归宿主远端分页契约）；输入态让路，裸 Home/End 仍归行导航 */
  if (pagerOn.value) {
    const t = e.target as HTMLElement | null;
    const isInput = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (!isInput) {
      const jump = e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'Home' || e.key === 'End')
        ? (e.key === 'Home' ? 1 : pagerTotalPages.value)
        : e.key === 'PageUp' ? Math.max(1, pagerPage.value - 1)
        : e.key === 'PageDown' ? Math.min(pagerTotalPages.value, pagerPage.value + 1)
        : null;
      if (jump !== null) {
        e.preventDefault();
        if (jump !== pagerPage.value) emit('update:page', jump);
        return;
      }
    }
  }
  onRowNavKey(e);
}
/* 一百六十八批：行复制组装收编为函数——键盘 Ctrl+C（135 批）与 hover 行内钮共用同一口径
   （列=shownCols 所见即所得）；228 批 M4：行集钳位 renderRows（所见即所操作） */
function copyRowJson(ri: number) {
  const row = renderRows.value[ri]; if (!row) return;
  const obj: Record<string, any> = {};
  shownCols.value.forEach((c, ci) => { obj[c] = row[ci] ?? null; });
  void copyText(JSON.stringify(obj, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制行 JSON' : '复制失败'));
}
/* 五百六十一批：复制整表 JSON 动作函数化（列头菜单 copy-table-json 与 bar-prepend 宿主
   快捷钮同一收口；行集=sortedRows 全量、列=shownCols、值=raw——原语义零变化） */
async function copyTableJson() {
  const rows = sortedRows.value;
  const ok = await copyText(matrixText({ rows, cols: shownCols.value, getVal: (row, c) => qColVal(row, c) }, 'json'));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行（JSON）` : '复制失败');
}
/* 二百四十七批：_index 格芯片跳转（AliasesView goHub 同范式）——带 idx query 直达索引工作区 */
function gotoIndex(v: any) {
  if (typeof v !== 'string' || !v) return;
  router?.push({ path: '/indices', query: { idx: v } });
}
/* ═══ 二百六十九批：结果内查找（Ctrl+F）——RT 229 批同款收编 ═══
   搜索范围钉死 renderRows×shownCols（所见即所搜）；匹配口径=displayText（epoch/大数
   人性化后所见即所搜）；命中格琥珀底+mark 切分，当前命中落位。 */
const {
  kw: searchKw, open: searchOpen, deferred: searchDeferred,
  matches: searchMatches, matchSet: searchMatchSet,
  current: searchCur, next: searchNext, prev: searchPrev,
} = useGridSearch({
  rows: () => renderRows.value.length,
  cols: () => shownCols.value.length,
  getText: (ri, ci) => {
    const row = renderRows.value[ri];
    return row ? displayText(row[ci], ri, ci) : '';
  },
  /* 五百六十五批件④：date 列第三遍归一接线（563 批 useGridSearch 可选 colType 消费）——
     date 列且 kw/格文本都呈日期形态时分隔符归一（/ . 与 - 互认）；effType 与列头徽标/
     统计面同一读取口径，非 date 列零行为变化 */
  colType: (ci) => effType(shownCols.value[ci] ?? ''),
});
function isSearchHit(ri: number, ci: number) { return searchMatchSet.value.has(ri + ':' + ci); }
function isSearchCur(ri: number, ci: number) {
  const m = searchMatches.value[searchCur.value - 1];
  return !!m && m.ri === ri && m.ci === ci;
}
let prevHitCurEl: HTMLElement | null = null;
watch(searchCur, async () => {
  await nextTick();
  prevHitCurEl?.classList.remove('hit-cur');
  prevHitCurEl = null;
  const m = searchMatches.value[searchCur.value - 1];
  if (!m) return;
  const el = [...(rootEl.value?.querySelectorAll(`tbody td[data-ri="${m.ri}"]`) ?? [])]
    .find(td => (td as HTMLElement).dataset.col === shownCols.value[m.ci]) as HTMLElement | undefined;
  if (!el) return;
  el.classList.add('hit-cur');
  prevHitCurEl = el;
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
async function openSearch() {
  /* 六百二十一批·单框双效（D4）：searchable 档=聚焦常驻快筛框（独立查找条已并入）；
     非 searchable 档走 269 原路（表格必有查找立法不回退） */
  if (props.searchable) {
    (rootEl.value?.querySelector('.qrt-qsearch-inp') as HTMLInputElement | null)?.focus();
    return;
  }
  searchOpen.value = true;
  await nextTick();
  (rootEl.value?.querySelector('.hn-inp') as HTMLInputElement | null)?.focus();
}
function closeSearch() {
  searchKw.value = '';
  searchOpen.value = false;
  searchDeferred.value = '';
  prevHitCurEl?.classList.remove('hit-cur');
  prevHitCurEl = null;
  /* 焦点还给表格根：关闭后 ↑↓/再次 Ctrl+F 立即可用（键盘闭环） */
  rootEl.value?.focus();
}
/* ═══ 六百二十一批·单框双效（620 稿 D1~D5 裁决）：searchable 档查找并入快筛框 ═══
   词桥：快筛词驱动 useGridSearch（150ms 防抖出 matchSet/mark）——同一词一条口径，
   输入即过滤（quickFilterEff 既有链）+行内 mark 点亮；清词即时清生效词（不等防抖，
   closeSearch 语义等值平移）；非 searchable 档框不在场本桥空转。
   Enter 桥接（D2）：过滤后所见行皆命中行，行级滚动到下一命中行（回绕）。 */
watch(searchableKw, (v) => {
  searchKw.value = v;
  if (!v.trim()) searchDeferred.value = '';
});
const bridgeRi = ref(-1);
function bridgeNext() {
  const n = renderRows.value.length;
  if (!n) return;
  bridgeRi.value = (bridgeRi.value + 1) % n;
  const el = rootEl.value?.querySelector(`tbody td[data-ri="${bridgeRi.value}"]`) as HTMLElement | null;
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
}

/* ═══ 五百一十八批：Ctrl+F 稳定接管（与 RT 同构）——document 捕获级，不再依赖表格预聚焦；
   输入态（INPUT/TEXTAREA/SELECT/富文本/Monaco）让路；多表同屏由 defaultPrevented 仲裁；
   本表不可见（切走/KeepAlive 隐藏）时不接管。 */
function onDocFind(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
  if (e.key.toLowerCase() !== 'f') return;
  if (e.defaultPrevented) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.monaco-editor'))) return;
  const root = rootEl.value;
  if (!root || root.offsetParent === null) return;
  e.preventDefault();
  e.stopPropagation();
  void openSearch();
}
document.addEventListener('keydown', onDocFind, true);
onBeforeUnmount(() => document.removeEventListener('keydown', onDocFind, true));

/* 二百五十八批：长列表回顶——滚过 600px 出现，点击平滑归顶（与 RT 同语义） */
const showTop = ref(false);
/* 四百九十六批：横向滚动态可视化（RT 同款）——冻结列(sticky+不透明背景)会把滚入其下方的
   普通列开头盖住（冻结窗格语义），scrollLeft>0 时冻结缘投影明示「下方有内容」。 */
const hScrolled = ref(false);
function onWrapScroll() {
  const el = wrapRef.value;
  if (el) { showTop.value = el.scrollTop > 600; hScrolled.value = el.scrollLeft > 0; }
}
/* 四百九十六批：换存储键（换数据集维度）横向滚动位归零——防上一维度残留的假遮挡态 */
watch(dimension, () => { hScrolled.value = false; });
function backToTop() {
  const el = wrapRef.value;
  if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  showTop.value = false;
}
/* Esc=退出导航态（失焦；高亮经 watch(tblFocus) 联动清零）——对齐「Esc 退出键盘操作态」惯例 */
function onEscBlur(e: KeyboardEvent) {
  /* 二百六十九批：搜索开着时 Esc 先关查找（RT 同语义），再落失焦 */
  if (searchOpen.value) { closeSearch(); return; }
  /* W7：有行内展开先全收（与 RT 同裁决：全收），再落失焦 */
  if (expandedRows.value.size) { expandedRows.value = new Set(); return; }
  (e.currentTarget as HTMLElement | null)?.blur();
}
const wrapRef = ref<HTMLElement>();
/* 四百九十六批：换存储键时横向滚动位归零（新维度回列首，防上一维度残留的假遮挡态） */
watch(dimension, () => { const el = wrapRef.value; if (el) el.scrollLeft = 0; });
watch(focusIdx, (i) => {
  if (i < 0 || !tblFocus.value) return;
  const tr = wrapRef.value?.querySelector('tbody tr:nth-child(' + (i + 1) + ')') as HTMLElement | null;
  tr?.scrollIntoView?.({ block: 'nearest' });
});

/* 供 SQL 通道 CSV 导出跟随当前排序行序（所见即所得），不把排序状态外溢成受控 props。
   七十六批：getCsvBlock 给 hit 型消费方（Lucene/PIT）——列头=可见列名，行=排序后
   矩阵按可见列对齐（列选隐藏的列不导出，所见即所得），列对齐逻辑留在列推导处。
   一百七十四批：抽 csvBlock 内部函数，命令面板导出（table-cmd）共用同一口径。
   五百二十七批：矩阵成型后统一过 exportCell 加工管道（缺省恒等=现状零变化；
   head/rows 字面量保持 76 批 getCsvBlock 契约原样，加工只追加不重排）。 */
function csvBlock() {
  const idxs = shownCols.value.map(c => columns.value.indexOf(c));
  /* 五百三十批 W-B：exportRowFilter 行级过滤（CSV/MD/XLSX 三管道同走本收口；
     exportCell 只加工格、此只筛行；缺省 undefined=全量导出现状不变） */
  const srcRows = props.exportRowFilter ? sortedRows.value.filter(r => props.exportRowFilter!(r)) : sortedRows.value;
  const blk = {
    head: shownCols.value.slice(),
    rows: srcRows.map(r => idxs.map(i => (i >= 0 ? r[i] ?? null : null))),
  };
  if (!props.exportCell) return blk;
  return { head: blk.head, rows: blk.rows.map(r => r.map((v, j) => xCell(v, blk.head[j], r))) };
}
defineExpose({
  getSortedRows: () => sortedRows.value,
  getCsvBlock: csvBlock,
  /* 五百六十一批：复制整表 JSON 动作透出（SystemView bar-prepend 快捷钮消费——宿主
     「复制结果 JSON」退役换内核同函数，裁决记档见 SystemView） */
  copyTableJson,
});

/* ═══ 一百七十四批：命令面板表格域命令（window 'table-cmd' 广播）═══
   仅当前可见实例响应——offsetParent 检查区分同页双表（IndexHub 的 RT/QRT 按可见性）
   与 KeepAlive 后台缓存页（T30：DOM 仍在树上，不可见实例必须静默丢弃防误响应）。
   无表格页面无实例响应，命令面板 sub 已注明作用域。
   dense/重置列宽与工具行按钮同口径（仅记忆启用时），导出不受限。 */
/* 二百三十批 P0-3：跳转到列（RT 同款）——注册表+隐藏列先显示+列头闪烁 1.4s */
const flashCol = ref('');
let flashTimer: ReturnType<typeof setTimeout> | null = null;
function locateCol(col: string) {
  if (!shownCols.value.includes(col)) visibleCols.value = [...visibleCols.value, col];
  flashCol.value = col;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashCol.value = ''; }, 1400);
  void nextTick(() => {
    const th = [...(rootEl.value?.querySelectorAll('thead th[data-col]') ?? [])]
      .find(th => (th as HTMLElement).dataset.col === col) as HTMLElement | undefined;
    if (typeof th?.scrollIntoView === 'function') th.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
const tableRegId = registerTable({
  cols: () => shownCols.value,
  locate: locateCol,
  visible: () => {
    const r = rootEl.value;
    const op = r && (r as HTMLElement).offsetParent;
    return !!r && op !== null && op !== undefined;
  },
});
onBeforeUnmount(() => unregisterTable(tableRegId));

function onTableCmd(e: Event) {
  const detail = (e as CustomEvent<{ cmd?: string; col?: string; markHandled?: () => void }>)?.detail;
  const cmd = detail?.cmd;
  if (!cmd) return;
  const root = rootEl.value;
  const op = root && (root as HTMLElement).offsetParent;
  /* 真实浏览器：display:none 链下 offsetParent=null；happy-dom：未实现为 undefined。
     两者都视为「不可见」静默丢弃，只有真实可见实例响应。
     二百二十八批 M3：可见实例响应前标记 handled——命令面板据此在无可见表格时显式提示 */
  if (!root || op === null || op === undefined) return;
  detail.markHandled?.();
  if (cmd === 'dense') { if (prefsOn.value) cycleRowH(); } /* 二百四十五批：dense 命令复用为行高三档循环 */
  else if (cmd === 'reset-widths') { if (prefsOn.value) resetColWidths(); }
  else if (cmd === 'locate-col' && detail.col) locateCol(detail.col);
  else if (cmd === 'export') exportCsv();
}

/* 二百七十二批：导出收编为函数（table-cmd 与工具条「导出」钮共用）——RT 五件套对齐 */
function exportCsv() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const blk = csvBlock();
  const csv = [blk.head.map(csvCell).join(',')]
    .concat(blk.rows.map(r => r.map(v => csvCell(v !== null && typeof v === 'object' ? JSON.stringify(v) : v)).join(',')))
    .join('\n');
  downloadText(`${props.exportName || 'table-export'}-${exportStamp()}.csv`, csv, 'text/csv', { bom: true });
  store.notify('success', `已导出 ${blk.rows.length} 行（CSV）`);
}

/* ═══ 五百二十五批：导出五格式对齐 RT（CSV 既有，本批补 MD/XLSX/PNG）═══
   行集/列集统一走 csvBlock()（可见列+排序后全量，所见即所得），与 CSV 同一口径；
   MD 转义/ XLSX data+meta 双 sheet / PNG 2x 快照均从 RT 同款实现平移，只读定位不搬内联编辑 */
function exportMd() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const blk = csvBlock();
  /* RT md 分支同款转义：null=空串（区别于字面 '-'），对象 JSON.stringify，竖线/换行转义 */
  const esc = (v: any) => String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v)
    .replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const content = [
    '| ' + blk.head.join(' | ') + ' |',
    '| ' + blk.head.map(() => '---').join(' | ') + ' |',
    ...blk.rows.map(r => '| ' + r.map(esc).join(' | ') + ' |'),
  ].join('\n');
  downloadText(`${props.exportName || 'table-export'}-${exportStamp()}.md`, content, 'text/markdown');
  store.notify('success', `已导出 ${blk.rows.length} 行（Markdown）`);
}

function exportXlsx() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const blk = csvBlock();
  /* 五百六十批：双 sheet 装配收编 exportSheets.buildExportSheets 单源（RT 同款装配；
     QRT 无「索引/范围」差异字段，meta0 空档） */
  const [sheet, meta] = buildExportSheets(
    [],
    { head: blk.head, rows: blk.rows.map(r => r.map(v => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v))) },
  );
  const bytes = buildXlsx([sheet, meta]);
  downloadBlob(`${props.exportName || 'table-export'}-${exportStamp()}.xlsx`,
    new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  store.notify('success', `已导出 ${blk.rows.length} 行（XLSX，含 meta 页）`);
}

/* 五百六十批：JSON 第五导出（RT 五格式+快照对位收尾）——矩阵语义（行集=sortedRows 全量、
   列=shownCols，matrixText(...,'json') 2 空格缩进，与 copy-table-json 同口径）；与 RT
   exportRows('json') 的 _id+_source 文档语义有意分工（rows 型无 _source，矩阵 JSON 即正解，
   exportCell/exportRowFilter 不涉——同 copy-table-json 既有裁决） */
function exportJson() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const rows = sortedRows.value;
  const content = matrixText({ rows, cols: shownCols.value, getVal: (row, c) => qColVal(row, c) }, 'json');
  downloadText(`${props.exportName || 'table-export'}-${exportStamp()}.json`, content, 'application/json');
  store.notify('success', `已导出 ${rows.length} 行（JSON）`);
}

async function exportPng() {
  if (!rootEl.value) return;
  const ok = await snapshotTableToPng(rootEl.value, `table-snapshot-${exportStamp()}.png`);
  store.notify(ok ? 'success' : 'error', ok ? '已导出表格快照 PNG' : '快照导出失败');
}
window.addEventListener('table-cmd', onTableCmd);
onBeforeUnmount(() => window.removeEventListener('table-cmd', onTableCmd));
</script>

<style scoped>
.qrt { position: relative; outline: none; }
/* 五百一十六批：内建聚焦面高度链 + 聚焦态滚动区吃满（内联 maxHeight 需 !important 接管） */
.fs { display: flex; flex-direction: column; }
.fs-active .qrt-wrap { max-height: none !important; height: 100%; }
.fs-active .qrt-loading { max-height: none !important; }
/* 非 prefsOn 通道悬浮放大钮（查找条打开时右移让位） */
.qrt-fs-btn { position: absolute; top: 2px; right: 6px; z-index: 3; padding: 0 7px; }
.qrt-fs-btn.open { right: 320px; }
.qrt-hn { position: absolute; top: 2px; right: 6px; z-index: 3; }
.qrt-search-note { position: absolute; top: 6px; right: 8px; z-index: 3; font-size: var(--fs-2xs); color: var(--tx2); background: var(--bg0); padding: 1px var(--sp-1h); border-radius: var(--r-xs); border: 1px solid var(--line); }
.qrt-cell.qrt-hit { background: var(--warn-soft); }
/* v3.0.0 纠错：当前命中格样式补齐——模板挂 rt-hit-cur 类但 scoped 样式缺失（类样式在
   ResultTable 的 scoped 里，跨组件不生效），当前命中与普通命中视觉完全同款 */
.qrt-cell.rt-hit-cur { box-shadow: inset 0 0 0 2px var(--warn); }
/* v3.0.0 场景语义分档：数值列右对齐（对齐 RT num-col，tabular-nums 千分位对齐可比） */
.qrt-cell.num-col { text-align: right; font-variant-numeric: tabular-nums; }
mark.qrt-mark { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
/* 五百六十二批 T2：ES highlight 片段（hlSegment 净化后仅存 em/mark）——与 mark.qrt-mark/
   RT .rt-hl em/mark 同视觉语言（琥珀底强调），形态逐字对齐 RT :2435 */
.qrt-hl em, .qrt-hl mark { font-style: normal; background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
.qrt-d-meta { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1h) var(--sp-2); margin-bottom: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); }
.qrt-kbd-hint {
  position: absolute; top: 2px; right: 6px; z-index: 2; pointer-events: none;
  font-size: var(--fs-xs); color: var(--tx2); background: var(--bg0);
  border: 1px solid var(--line); border-radius: var(--r-xs); padding: 1px var(--sp-1h); letter-spacing: .5px;
}
.qrt-tbl tbody tr.qrt-row-focus > td { background: var(--ac-soft); box-shadow: inset 3px 0 0 var(--ac-hi); }
/* 一百五十批：与 RT 同款工具行容器化（dbx 表格卡头语言，设计统一） */
/* 五百五十四批 工蚁1：显式单行纪律（RT :2331 同批同款——勾选/筛选态右簇变宽时收缩压力
   不得压左簇文本折行；右簇 flex+shrink:0 纪律住 TableShell 全局 style，原 .qrt-bar-r
   内核规则系 527 收编后 scopeId 不传播的死规则，554 批迁出勿搬回）。缺省态 DOM 零变 */
.qrt-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2h); background: var(--bg1); border: 1px solid var(--line); border-bottom: 0; border-radius: var(--r-m) var(--r-m) 0 0; flex-wrap: nowrap; }
/* 五百二十五批：rows 型转置态提示行（与 qrt-bar 同卡头语言；接在其后时去顶圆角/顶边框） */
.qrt-tr-bar { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); background: var(--bg1); border: 1px solid var(--line); border-bottom: 0; border-radius: var(--r-m) var(--r-m) 0 0; }
.qrt-tr-bar.after-bar { border-radius: 0; border-top: 0; }
.qrt-t-n { width: auto; padding: var(--sp-0) var(--sp-1h); font-size: var(--fs-xs); }
.qrt-tr-off { border: 0; background: transparent; color: var(--tx2); cursor: pointer; font-size: var(--fs-xs); margin-left: auto; padding: 0 var(--sp-0); }
.qrt-tr-off:hover { color: var(--err); }
/* 五百二十五批：内建分页行（表格卡底缘）——has-pgr 联动收 wrap 底圆角，分页行接管圆角 */
.qrt-pgr { display: flex; justify-content: flex-end; align-items: center; padding: 5px var(--sp-2h); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r-m) var(--r-m); background: var(--bg1); }
.qrt-wrap.has-pgr { border-radius: 0; }
/* ═══ 六百零七批：内建视图档（seg 防换行+alt 体 border-top 分节——ih-view-seg/ih-alt-body
   同语言；alt 容器高度走 maxHeight prop 与 qrt-wrap 一口径，无新高度链；卡片网格=ih-cards
   同构 minmax 240px 档）═══ */
.qrt-view-seg { flex-wrap: nowrap; }
.qrt-alt-body { border-top: 1px solid var(--line); margin-top: var(--sp-2); padding-top: var(--sp-1h); }
.qrt-alt-body.is-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-2h); align-content: start; }
/* 五百二十五批：rows 型转置视图（RT rt-transposed 同款语言）——首列 sticky+右分隔线（不透明底） */
.qrt-transposed .qrt-t-field, .qrt-transposed .qrt-t-key { position: sticky; left: 0; z-index: 1; background: var(--bg2); box-shadow: inset -1px 0 0 var(--line); text-align: left; }
.qrt-transposed .qrt-t-field { min-width: 140px; }
.qrt-transposed .qrt-t-key { min-width: 120px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qrt-transposed .qrt-t-val { white-space: pre-wrap; word-break: break-word; max-width: 320px; vertical-align: top; }
/* 266 批：对齐 RT rt-info 主信息字号；554 工蚁1：左簇收缩缓冲（ellipsis 吸收，RT rt-info 同款） */
.qrt-coln { font-size: var(--fs-sm); color: var(--tx2); font-variant-numeric: tabular-nums; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 554 工蚁1：.qrt-bar-r 规则迁出（死规则，生效面=TableShell 壳级全局 style 单源），勿搬回内核 */
.qrt-tool-btn { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); }
/* 五百五十二批：回顶定位壳（RT rt-wrap-shell 同病同修）——qrt-backtop 的 absolute 锚点
   从整卡 .qrt 下移到滚动视口壳，qrt-pgr 分页行留壳后流内不再被盖；QRT 根非 flex 布局，
   壳只承接定位（最小形态，RT 的 flex 规格不照搬） */
.qrt-wrap-shell { position: relative; }
.qrt-backtop {
  position: absolute; right: 18px; bottom: 16px; z-index: 6;
  display: inline-flex; align-items: center; gap: 3px;
  padding: var(--sp-1) var(--sp-2h); border-radius: 999px;
  background: var(--bg1); border: 1px solid var(--line-strong); color: var(--tx1);
  font-size: var(--fs-xs); cursor: pointer; box-shadow: var(--shadow-pop); transition: all var(--tr);
}
.qrt-backtop:hover { color: var(--ac-hi); border-color: var(--ac-line); }
.qrt-wrap { overflow: auto; border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r-m) var(--r-m); background: var(--bg1); }
.qrt-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
/* 一百九十四批：hover 对齐 RT 行语言（bg2+左侧 3px 品牌强调条） */
.qrt-tbl tbody tr:hover { background: var(--bg2); box-shadow: inset 3px 0 0 var(--ac-hi); }
.qrt-tbl tbody tr:nth-child(even) { background: var(--hl-soft); }
/* 一百七十批：斑马纹密度态——紧凑密度行距过密时条纹反成噪音（dbx 紧凑场景无条纹），舒适态保留 */
.qrt-tbl.dense tbody tr:nth-child(even) { background: transparent; }
.qrt-tbl th, .qrt-tbl td { padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--line); text-align: left; }
.qrt-tbl.dense th, .qrt-tbl.dense td { padding-top: var(--sp-0); padding-bottom: var(--sp-0); }
/* 二百四十五批：行高宽松档（RT 239 批同款 12px，两表一致） */
.qrt-tbl.cozy th, .qrt-tbl.cozy td { padding-top: var(--sp-3); padding-bottom: var(--sp-3); }
.qrt-tbl th {
  background: var(--bg2);
  position: sticky;
  top: 0;
  z-index: 1;
  /* 一百七十批：字重/表头线对齐全局 .tbl 与 RT（600+line-strong，dbx 表头层次语言）
     一百九十四批：表头底色/文字色对齐 RT（bg2+tx2）——两表视觉语言完全一致 */
  font-weight: 600;
  border-bottom-color: var(--line-strong);
  color: var(--tx2);
  white-space: nowrap;
  user-select: none;
}
.qrt-tbl th.sortable { cursor: pointer; }
.qrt-tbl th.sortable:hover { color: var(--ac-hi); }
.qrt-tbl th.on { color: var(--ac-hi); }
.qrt-sort-i { display: inline-block; margin-left: var(--sp-1); font-size: var(--fs-2xs); }
/* 一百七十八批：多列排序优先级角标（与 RT 同款）；五百二十八批：9px 裸值归 --fs-2xs */
.qrt-sort-ord { font-size: var(--fs-2xs); color: var(--ac-hi); font-weight: 650; margin-left: 1px; }
/* 一百七十一批：双层列头（RT 156 批同款语言）——下行类型徽标，无类型列留空位撑行高对齐 */
.qrt-th-sub { display: block; min-height: 13px; font-size: var(--fs-2xs); }
.qrt-th-type { font-size: var(--fs-2xs); font-weight: 400; color: var(--info); opacity: .85; }
/* 二百三十三批 P2-1：类型语义着色（RT 同款五类简化版） */
.qrt-th-type.rt-ty-num { color: var(--info); }
.qrt-th-type.rt-ty-date { color: var(--warn); }
.qrt-th-type.rt-ty-bool { color: var(--ok); }
.qrt-th-type.rt-ty-text { color: var(--tx1); }
.qrt-th-type.rt-ty-kw { color: var(--ac-hi); }
/* 一百六十九批：列头筛选漏斗（弱灰常驻可发现，激活实色 info 蓝） */
.qrt-funnel {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; margin-left: 3px; padding: 0;
  border: 0; border-radius: 3px; background: transparent;
  color: var(--tx2); opacity: .45; cursor: pointer; vertical-align: middle;
}
.qrt-funnel:hover { opacity: 1; color: var(--ac-hi); }
.qrt-funnel.on { opacity: 1; color: var(--info); }
/* 554 工蚁1：nowrap 立法迁 TableFilteredHint 单源（bar-left 筛选态提示随 561 收编片段组件；
   弹层槽第二注入位的 .qrt-fmode 规则留内核——两注入位共用类名、片段组件持同款复制） */
.qrt-fmode { border: 1px solid var(--line); background: transparent; color: var(--info); cursor: pointer; font-size: var(--fs-2xs); border-radius: 3px; padding: 0 var(--sp-1); line-height: 1.4; }
.qrt-fmode:hover { border-color: var(--info); }
.qrt-nomatch td { text-align: center; color: var(--tx2); padding: 14px var(--sp-2); font-size: var(--fs-sm); }
/* 二百二十八批 M4：渲染截断提示行（RT 196 批同语言——弱化灰字） */
.qrt-trunc-row td { text-align: center; color: var(--tx2); font-size: var(--fs-xs); padding: var(--sp-2); background: var(--bg1); }
/* 二百三十批 P0-3：跳转到列——目标列头闪烁（RT 同款，1400ms 自动熄灭） */
th/* 二百六十七批：列拖拽三态（RT 1824-1826 同款视觉语言） */
.qrt-th-name.qrt-drag-src { opacity: .4; }
th.qrt-drop-before { box-shadow: inset 3px 0 0 var(--info); }
th.qrt-drop-after { box-shadow: inset -3px 0 0 var(--info); }
.qrt-col-flash { animation: qrt-col-flash-kf 1.4s ease-out; }
@keyframes qrt-col-flash-kf { 0%, 60% { background: var(--info-soft); box-shadow: inset 0 0 0 2px var(--info); } 100% { background: transparent; } }
/* 五百二十四批：筛选弹层壳样式（.qfp-* 全家）随壳收编共享件 ColFilterPopover（cfp-*），
   z 字面量 1200/1201 同步收口 var(--z-ctx)/calc(var(--z-ctx)+1) */
/* 五百二十批：聚合 footer 行（tfoot）样式系随 561 收编 TableAggFoot 全局单源（原 scoped
   规则打不中片段元素，561 批迁出勿搬回；dense/cozy/冻结 sticky/hScrolled 投影同迁） */
.qrt-rs { position: absolute; right: 0; top: 0; bottom: 0; width: 5px; cursor: col-resize; user-select: none; }
.qrt-rs:hover { background: var(--ac-soft); }
.qrt-cell {
  position: relative;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
  vertical-align: top;
  cursor: copy;
}
/* 一百六十八批：hover 行内快捷钮（dbx 悬浮行内钮）——复制行 JSON 浮在行尾格右缘，
   不占常驻空间；不透明底防与数据文字重叠难读；移出行消失 */
.qrt-row-copy {
  position: absolute; right: 3px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer;
  opacity: 0; pointer-events: none; transition: opacity .12s;
}
.qrt-tbl tbody tr:hover .qrt-row-copy { opacity: 1; pointer-events: auto; }
.qrt-row-copy:hover { color: var(--ac-hi); border-color: var(--ac-line); }
/* 二百四十七批：_index 格跳转芯片——行内常驻小图标（悬浮不消失，与行复制钮同语言） */
.qrt-idx-go {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; margin-left: 5px; vertical-align: middle;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer; transition: all .12s;
}
.qrt-idx-go:hover { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
.qrt-cell.expanded {
  white-space: normal;
  word-break: break-all;
  max-width: 520px;
}
.qrt-null { color: var(--tx2); opacity: .55; user-select: none; }
/* ═══ W7：行内展开详情行——五百二十七批随壳收编 TableExpandRow，
   .rt-expand 系样式迁 TableShell.vue 单一出处（此前与本文件逐字重复的双份定义）═══ */
/* ═══ W7：长 JSON 折叠预览 chip（点击开单元格详情弹窗；RT 同款类名复用视觉语言）═══ */
.rt-json-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; overflow: hidden; padding: 1px var(--sp-2); border: 1px solid var(--line); border-radius: 99px; background: var(--bg2); color: var(--tx1); font-size: var(--fs-xs); cursor: zoom-in; font-family: var(--mono); }
.rt-json-chip:hover { border-color: var(--ac-line); color: var(--ac-hi); }
.rt-json-chip-p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-json-chip-n { color: var(--tx2); flex-shrink: 0; }
/* W7：ip 列等宽（.qrt-cell 本就 mono，类语义显式化+防视觉回归漂移） */
.qrt-cell.ip-col { font-family: var(--mono); }
/* ═══ 五百三十批 W-B：semOn 语义分档色（全站 pill 五档语言：g=ok/y=warn/r=err/b=info/n=次级文字）——
   仅 semOn prop 开且 semFormat 命中 percent 分档时上类，缺省零类零增量 ═══ */
.qrt-cell.qrt-sem-g { color: var(--ok); }
.qrt-cell.qrt-sem-y { color: var(--warn); }
.qrt-cell.qrt-sem-r { color: var(--err); }
.qrt-cell.qrt-sem-b { color: var(--info); }
.qrt-cell.qrt-sem-n { color: var(--tx2); }
/* 五百三十批 W-B：selectable 勾选列（首列窄列，视觉语言对齐序号列）——缺省不渲染 */
.qrt-sel-col { width: 34px; min-width: 34px; text-align: center; }
.qrt-sel-col input { vertical-align: middle; cursor: pointer; }
.qrt-tbl tbody tr.qrt-sel > td { background: var(--ac-soft); }
/* ═══ 五百三十一批 W-B：rowDrawer 行详情侧拉内容排版（n-drawer 载体；仅 prop 开启后可达）═══ */
.qrt-rdw-meta { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1h) var(--sp-2); margin-bottom: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); }
.qrt-rdw-row { display: flex; align-items: flex-start; gap: var(--sp-2); padding: 5px var(--sp-0); border-bottom: 1px dashed var(--line); font-size: var(--fs-xs); }
.qrt-rdw-k { flex-shrink: 0; min-width: 110px; max-width: 40%; color: var(--ac-hi); overflow-wrap: anywhere; font-family: var(--mono); }
.qrt-rdw-v { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; font-family: var(--mono); }
/* W7：行尾展开钮（hover 显隐，与 qrt-row-copy 同语言，右移让位复制钮） */
.qrt-row-expand {
  position: absolute; right: 26px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer;
  opacity: 0; pointer-events: none; transition: opacity .12s;
}
.qrt-tbl tbody tr:hover .qrt-row-expand { opacity: 1; pointer-events: auto; }
.qrt-row-expand:hover { color: var(--ac-hi); border-color: var(--ac-line); }
/* ═══ 一百六十七批：冻结序号列（对齐 RT 131 批 dbx/Excel 冻结窗格）——宽表横向滚动时行身份（序号）不滚走。
   border-collapse 下 sticky 自带边框会丢，右分隔线用 box-shadow 画；背景必须不透明。
   RT 150 批铁律：sticky left 常量必须配 min-width 锁死——table-layout:auto 会把 width 建议值
   压缩（实际渲染宽 < 定位常量），不透明冻结层会遮住首列左侧字符；52px 同 RT 序号列。 ═══ */
.qrt-tbl th.qrt-idx, .qrt-tbl td.qrt-idx {
  box-sizing: border-box; position: sticky; left: 0; width: 52px; min-width: 52px;
  z-index: 2; box-shadow: inset -1px 0 0 var(--line);
  color: var(--tx2); text-align: right; padding-left: var(--sp-0); vertical-align: middle;
}
/* 表头序号是 top+left 双轴 sticky，层级须压过普通 sticky 表头（z-index 1） */
.qrt-tbl th.qrt-idx { z-index: 3; }
.qrt-tbl td.qrt-idx { background: var(--bg2); }
.qrt-tbl tbody tr:hover td.qrt-idx { background: var(--bg-hover, var(--bg2)); }
/* ═══ 一百九十七批/207 批：冻结首业务列（freezeFirst）═══
   sticky left=52px（序号列已锁宽，前缀精确）；底色不透明三态同步；
   th 双轴 top+left z-index 3 与序号列表头同级。 ═══ */
/* 二百三十六批 P2-4：left 由 frozenStyle 内联按前缀宽度动态计算（多列冻结） */
.qrt-tbl th.qrt-col-frozen, .qrt-tbl td.qrt-col-frozen {
  position: sticky; z-index: 3;
  box-shadow: inset -1px 0 0 var(--line-strong);
}
.qrt-tbl th.qrt-col-frozen { background: var(--bg2); }
.qrt-tbl td.qrt-col-frozen { background: var(--bg1); }
/* 四百九十六批：横向滚动态（is-hscrolled）冻结缘投影——RT 同款，明示普通列被盖在冻结层下 */
.qrt.is-hscrolled .qrt-tbl th.qrt-idx, .qrt.is-hscrolled .qrt-tbl td.qrt-idx,
.qrt.is-hscrolled .qrt-tbl th.qrt-col-frozen, .qrt.is-hscrolled .qrt-tbl td.qrt-col-frozen { box-shadow: inset -1px 0 0 var(--line-strong), 8px 0 10px -6px rgba(0, 0, 0, .38); }
.qrt-tbl tbody tr:hover td.qrt-col-frozen { background: var(--bg2); }
.qrt-tbl tbody tr.qrt-row-focus td.qrt-col-frozen { background: var(--ac-soft); }
.qrt-tbl tbody tr.qrt-row-focus > td.qrt-idx { background: var(--ac-soft); }
</style>
