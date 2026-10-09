<template>
  <div class="st-page">
    <div class="st-hd">
      <PageHeader :icon="LayoutTemplate" title="搜索模板中心" subtitle="R33 · mustache 模板 CRUD · 参数自动提取 → 填空即查 · _render/template 实时预览">
      <template #actions>
<CurrentIdxChip />
<!-- 五百二十八批：页内历史入口（四视图统一，DslQueryView 弹窗范式）——run() 一直在
     push mode=template 历史（313 批），此前页内零出口 -->
<button class="btn ghost sm" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="12" /> 历史</button>
<button class="btn ghost sm" @click="load" :disabled="busy"><RefreshCw :size="12" /> 刷新</button>
      </template>
      </PageHeader>
</div>

    <div class="st-body">
      <!-- 左：模板列表 -->
      <div class="st-list">
        <div class="st-list-hd">
          <span>mustache 模板（{{ templates.length }}）</span>
          <button aria-label="新建模板" class="btn ghost xs" @click="newTemplate" title="新建模板"><Plus :size="11" /></button>
        </div>
        <!-- 空态拆两档：拉取失败（可重试）≠ 真空态（引导新建）。
             五百五十七批：失败档手写 st-list-empty/st-list-err 收编 EmptyState compact
             （文案逐字保留；重试走 action 位，busy 禁用位随组件契约退役——IlmView explain
             拉取失败 EmptyState 同款先例） -->
        <EmptyState v-if="loadErr" compact :icon="RefreshCw" :text="'拉取失败：' + loadErr" action-text="重试" @action="load" />
        <!-- 第十批 B：真空态迁 EmptyState compact（五百五十七批：拉取失败支亦 EmptyState 化，
             class="st-list-empty/st-list-err" 消费随之清零） -->
        <EmptyState v-else-if="!templates.length" compact :icon="LayoutTemplate"
          text="还没有 mustache 模板" hint="点 + 新建第一个" />
        <!-- 五百二十批：侧栏名字过滤（SnapshotsView sv-input 口径：子串大小写不敏感，Esc 清空）；
             挂真空/失败分支之后（无模板时不出过滤框），过滤无命中与真空态分档防误导 -->
        <!-- 五百六十批：手写过滤框换装 SearchFilterBar 统一件（全站第 8 胞；558 cd-kw-inp 判例：
             v-model 接原 ref 零触、placeholder 逐字保留兼作 aria-label、Esc 清空内建对齐——
             原本侧栏过滤无 Enter 语义，不接 @enter；st-list-sfb 落位类挂根（margin 随迁），
             st-list-filter 类锚随 input-class 保留在 input 上（stTplTiersFilter 挂载锁同路径）） -->
        <SearchFilterBar v-else v-model="tplFilter" class="st-list-sfb" input-class="st-list-filter" placeholder="按名字过滤" />
        <!-- 五百五十七批：过滤空档收编 EmptyState compact（文案逐字保留；过滤无命中与
             真空态分档防误导语义不变，stTplTiersFilter textContent 锚保真） -->
        <EmptyState v-if="tplFilter && !filteredTemplates.length" compact :icon="LayoutTemplate" text="无匹配模板" />
        <div v-for="t in filteredTemplates" :key="t.id" class="st-item" :class="{ on: t.id === curId }" @click="pick(t)" role="button" tabindex="0" @keydown.enter.prevent="pick(t)" @keydown.space.prevent="pick(t)">
          <FileCode2 :size="12" class="st-item-ic" />
          <!-- 五百二十四批：裸插值换 MarkText——过滤词命中段 <mark>（textContent 与原文一致） -->
          <span class="st-item-nm" :title="t.id"><MarkText :text="t.id" :kw="tplFilter" /></span>
        </div>
      </div>

      <!-- 中：模板编辑 + 参数 -->
      <div class="st-mid">
        <div class="st-card">
          <div class="st-card-hd">
            <FileJson :size="12" />
            <!-- 五百二十四批：原生 datalist 退役换 usePopupList 轻量形态（XmigrateView IndexPicker
                 同款消费先例：输入即开 + ↑↓/Enter/Esc + aria combobox）。v-model 语义保底：
                 input 受控 :value + @input 回写 curId（useInputLint 的 watch(curId) 契约不变）。
                 弹层 teleport body——.st-card overflow:hidden 会裁剪就地弹层 -->
            <div class="st-id-wrap" ref="idRootEl">
              <input :value="curId" class="st-id-inp" placeholder="模板 ID（如 bond-search）" spellcheck="false" autocomplete="off"
                role="combobox" aria-autocomplete="list" aria-label="模板 ID"
                :aria-expanded="idOpen ? 'true' : 'false'" :aria-controls="idListId"
                :aria-activedescendant="idOpen && idItems[idCursor] ? idItemId(idCursor) : undefined"
                @input="onIdInput" @focus="idOpenPanel" @keydown="idOnKey" />
              <Teleport to="body">
                <div v-if="idOpen && idItems.length" class="st-id-pop float-pop" :style="idPopStyle" ref="idListEl"
                  role="listbox" :id="idListId" @mousedown.prevent.stop>
                  <div v-for="(it, i) in idItems" :key="it" class="st-id-pop-item" :class="{ act: i === idCursor }"
                    role="option" :id="idItemId(i)" :aria-selected="i === idCursor" tabindex="-1"
                    @mouseenter="idCursor = i" @click="pickId(it)"><MarkText :text="it" :kw="curId" /></div>
                </div>
              </Teleport>
            </div>
            <div v-if="curIdHint" class="il-hint" :class="'il-' + curIdLevel">{{ curIdHint }}</div>
            <span class="st-flex" />
            <button v-if="canOps" class="btn primary xs" @click="save" :disabled="!curId || busy"><Save :size="10" /> 保存</button>
            <button v-if="canOps" aria-label="从集群删除这个已存模板（_scripts），引用它的调用方会报错" class="btn danger xs" title="从集群删除这个已存模板（_scripts），引用它的调用方会报错" @click="del" :disabled="!curId || busy || !exists(curId)"><Trash2 :size="10" /></button>
            <!-- 五百二十批：模板源高度四档钮（IndexHub ih-eh 同款视觉，editorTiers 统一件） -->
            <div class="st-eh" role="group" aria-label="编辑器高度档位" title="编辑器高度档位：S/M/L/满">
              <button v-for="eh in EDITOR_H_TIERS" :key="eh.k" type="button" class="st-eh-btn"
                :class="{ on: editorH === eh.k }" :aria-pressed="editorH === eh.k"
                :title="'编辑器高度：' + eh.t" @click="editorH = eh.k">{{ eh.t }}</button>
            </div>
          </div>
          <!-- 五百二十批：模板源高度四档（editorTiers + usePref st.editorH）——原 240px 钉死退役；
               S/M/L Monaco 定高直传，满档 42vh 视口弹性由 st-ed-wrap 接管（见 scoped 样式） -->
          <div class="st-ed-wrap" :class="{ 'st-h-full': editorH === 'full' }">
            <!-- 五百二十五批：@execute 接执行——Monaco es-execute action 常驻（参数输入已有
                 @keyup.enter 先例），Ctrl+Enter 即执行查询，免移手到「执行查询」钮 -->
            <!-- 五百三十五批 R5：ref 供 lint setMarkers 划线通道（dslAssist 之外补静态检查，
                 只走编辑器内划线零 banner） -->
            <MonacoEditor ref="stMeRef" v-model="source" :height="EDITOR_HEIGHTS[editorH]" :dsl-assist="dslAssist" @execute="run" />
          </div>
          <div class="st-hint"><Info :size="10" /> <code v-pre>{{参数}}</code> 会自动出现在下方参数表单；<code v-pre>{{#if}}</code> 段落语法也支持</div>
        </div>

        <div class="st-card">
          <div class="st-card-hd"><Variable :size="12" /> 参数（{{ paramNames.length }}）—— 填空即查</div>
          <!-- 第十批 B：裸空态迁 EmptyState compact（{{参数}} 在静态属性里是字面量，v-pre 不再需要） -->
          <EmptyState v-if="!paramNames.length" compact :icon="Variable"
            text="模板里还没有 {{参数}} 占位符" />
          <div v-for="p in paramNames" :key="p" class="st-param">
            <span class="st-param-nm">{{ p }}</span>
            <input v-model="paramValues[p]" class="st-param-in" :placeholder="'值（数字/true/JSON 自动识别）'" @keyup.enter="run" />
          </div>
          <!-- 五百六十三批：参数值 JSON 形态纠错建议——{ [ 开头但解析失败才说话（普通字符串
               主形态零打扰），点破 coerce「静默按字符串下发」盲区；「提示不阻断」warn 档
               il-hint（ClusterSettings csLint 同范式），独立块不进 st-param flex 行
               （零既有布局触碰，内容增量），纯函数单源 utils/inputAdvice -->
          <div v-if="paramFixHints.length" class="st-param-warns">
            <div v-for="w in paramFixHints" :key="w.p" class="il-hint il-warn">{{ w.p }}：{{ w.hint }}</div>
          </div>
          <div class="st-actions">
            <button class="btn ghost sm" @click="render" :disabled="busy"><Eye :size="12" /> 预览渲染</button>
            <button class="btn primary sm btn-run-lock" @click="run" :disabled="!index || busy"><Play :size="12" /> {{ busy ? '执行中…' : '执行查询' }}</button>
            <!-- 五百五十八批：原始 IO 快查（执行响应面）——本页最近一次 _search/template 执行
                 请求/响应原文（render/search-template 双钮各取各的记录，548 QueryXray 双钮先例） -->
            <button class="btn ghost sm" data-test="raw-io-search" aria-label="查看原始 IO（模板执行查询）" title="最近一次模板执行请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIoSearch"><Terminal :size="12" /> 原始 IO</button>
          </div>
        </div>
      </div>

      <!-- 右：渲染预览 / 结果 -->
      <div class="st-right">
        <div v-if="rendered" class="st-card">
          <div class="st-card-hd">
<Eye :size="12" /> 渲染后的最终 DSL
            <span class="st-flex" />
            <!-- 五百五十八批：原始 IO 快查（渲染响应面）——本页最近一次 _render/template 渲染
                 请求/响应原文（ioRecorder 记录环；QueryXray 卡头钮同位范式） -->
            <button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（模板渲染）" title="最近一次模板渲染请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIoRender"><Terminal :size="12" /> 原始 IO</button>
            <button aria-label="复制 DSL" class="btn ghost xs" @click="copyRendered" title="复制 DSL"><Copy :size="10" /></button>
          </div>
          <!-- 第十批 D：裸 JSON 换 highlightJson（rendered 已是 pretty JSON，着色 + json-view 全局范式） -->
          <pre class="st-pre json-view" v-html="highlightDslJson(rendered)"></pre>
        </div>
        <!-- 五百二十四批：took 手写串换 MetaStrip/TookBadge 范式（SearchSandboxView ss-took 同款：
             TookBadge 四档色归统一件走默认插槽，顺序随插槽位收敛为命中在前，语义无损失） -->
        <MetaStrip v-if="tookMs >= 0" class="st-meta" :items="stMeta">
          <span class="ms-i ms-t"><i>took</i> <TookBadge :ms="tookMs" /></span>
        </MetaStrip>
        <!-- 三百零六批：手写 accordion 退役换 QRT——查找/列拖拽/单元格详情/导出/增量渲染全量继承 -->
        <!-- 四百二十四批：结果表聚焦放大（423 同款推广）——v-if 上移表面层防 v-else 断链 -->
        <FocusableSurface v-if="hits.length" pane-id="tpl.result" title="结果表" :enabled="focusPaneId === 'tpl.result'"
          @update:enabled="v => (focusPaneId = v ? 'tpl.result' : null)">
          <!-- W8：满高口径收编 --vh-offset（标准偏移 210px），聚焦态结果区无页头工具条故回补 delta 60px（等价旧值 150px） -->
          <QueryResultTable :hits="hits as any" :total="totalHits" :total-gte="totalGte" :max-height="focusPaneId === 'tpl.result' ? 'calc(100vh - var(--vh-offset, 210px) + 60px)' : '60vh'" :storage-key="'tpl:' + (curId || 'x')" export-name="tpl-result" :focusable="false"
            empty-text="无命中" empty-hint="调整模板参数后重试"
            view-seg view-pref-key="tpl.result.view" :json-html="stJsonHtml" :tree-data="stTreeData" />
        </FocusableSurface>
        <!-- 四百二十五批：306 批迁移遗留的 display:none 空 pre 死元素清除 -->
        <EmptyState
          v-if="!rendered && !hits.length"
          :icon="LayoutTemplate"
          text="把常用查询存成模板，业务方只填参数不碰 DSL"
          hint="「预览渲染」看最终 DSL，「执行查询」直接出结果"
        />
      </div>
    </div>

    <!-- 五百二十八批：页内查询历史（mode=template 单档过滤，DslQueryView 弹窗范式）。
         play/fill 走 replayTplRow（313 批 push 存的是 rendered||source，回放裁决见函数注）；
         导入/清空入口关闭（同沙盒口径） -->
    <n-modal v-model:show="histOpen" preset="card" title="查询历史（搜索模板）" style="width:640px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel
        :items="histRows" :actions="['play', 'fill', 'copy', 'del']" :clearable="false" :importable="false"
        empty-text="执行查询成功后自动记录（上限 100 条），模板源快照条目可一键回填"
        @play="h => replayTplRow(h, true)" @fill="h => replayTplRow(h, false)" @del="h => qh.removeOne(h.id)"
      />
    </n-modal>

    <!-- 五百五十八批：原始 IO 弹窗（宿主受控开关；渲染/执行双通道共用同一弹窗宿主，
         先后点开互不残留——QueryXray 双通道先例） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  LayoutTemplate, RefreshCw, Plus, FileCode2, FileJson, Save, Trash2, Info,
  Variable, Eye, Play, Copy, History, Terminal,
} from 'lucide-vue-next';
import { NModal } from 'naive-ui';
/* 五百二十八批：页内历史面板收编 QueryHistoryPanel 共享件（DslQueryView 弹窗范式） */
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* 五百六十批：侧栏过滤胶囊统一件 */
/* 五百五十八批：原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import EmptyState from '../components/EmptyState.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import FocusableSurface from '../components/FocusableSurface.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth'; /* 574 批：权限写门真源 */
import { useQueryHistoryStore } from '../stores/queryHistory';
import { useIdxState, usePref } from '../composables/urlState';
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import MonacoEditor from '../components/MonacoEditor.vue';
/* 五百二十批：模板源高度四档（IndexHub ih.editorH 同款 editorTiers 统一件档位） */
import { EDITOR_HEIGHTS, EDITOR_H_TIERS, type EditorHKey } from '../utils/editorTiers';
import { useIndexFields } from '../composables/useIndexFields';
import { askConfirm } from '../composables/confirm';
import { useInputLint, dupRule } from '../composables/useInputLint';
import { usePopupList } from '../composables/usePopupList';
import { useDebounceFn } from '../composables/useDebounceFn'; /* 535 批 R5：防抖统一件 */
import { lintDsl } from '../utils/dslLint'; /* 535 批 R5：模板源静态检查 */
import { copyText, totalOf, fmtNum } from '../utils/format';
import { friendlyEsError } from '../utils/esError';
/* 五百六十三批：渲染 DSL 语义分档高亮（j-clause 档，QUERY_SNIPPETS/ROOT_KEYS 键命中；
   textContent 与 highlightJson 逐字一致，既有 textContent 锁面零扰动） */
import { highlightDslJson, prettyJson } from '../utils/jsonc';
/* 五百六十三批：参数值 JSON 形态纠错建议单源（「提示不阻断」，见 paramFixHints） */
import { jsonShapeAdvice } from '../utils/inputAdvice';
import MarkText from '../components/MarkText.vue';
import MetaStrip from '../components/MetaStrip.vue';
import TookBadge from '../components/TookBadge.vue';
import type { MetaStripItem } from '../components/MetaStrip.vue';

const store = useAppStore();
/* 574 批：权限写门——保存/删除模板（putStoredScript/deleteStoredScript 集群写）=ops 档，VIEWER 不可见 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/scripts/put', store.target));
/* R50：目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState({ follow: true });
/* W4-T14：dslAssist 字段源——模板编辑吃当前目标索引的 mappingDetail 出口（useIndexFields 统一管线） */
const { fields: idxFields, ensure: ensureIdxFields } = useIndexFields(() => index.value);
watch(index, () => { ensureIdxFields(); }, { immediate: true });
/* dslAssist 闭包在 setup 作用域声明（非 inline 模板编译下内联字面量箭头函数走 _ctx 代理，
   ref 顶层 unwrap 后 .value 得 undefined——渗透 spec ④ 红灯实证；setup 常量对象双模式免疫） */
const dslAssist = { fields: () => idxFields.value };
const busy = ref(false);
const templates = ref<{ id: string; source: string }[]>([]);
/* 五百二十批：模板源 Monaco 高度四档记忆（IndexHub ih.editorH 同款 usePref 体系，默认 S 档） */
const editorH = usePref<EditorHKey>('st.editorH', 's');
/* 五百二十批：侧栏名字过滤——子串大小写不敏感（SnapshotsView filtered 同口径） */
const tplFilter = ref('');
const filteredTemplates = computed(() => {
  const kw = tplFilter.value.trim().toLowerCase();
  if (!kw) return templates.value;
  return templates.value.filter(t => t.id.toLowerCase().includes(kw));
});
/* R91b 禁「拉取失败伪装成真空态」：失败原因进内联面板，与「还没有模板」分档 */
const loadErr = ref('');
const curId = ref('');
/* ux2 Task 11：模板 ID 查重 warn（put 覆盖语义），就地校验（五百二十四批：候选补全改 usePopupList） */
const { hint: curIdHint, level: curIdLevel, check: curIdCheck } = useInputLint([
  dupRule(() => templates.value.map(t => t.id), '模板'),
]);
watch(curId, v => curIdCheck(v));
/* ══ 五百二十四批：模板 ID 候选收编 usePopupList（原生 datalist 退役）══
   候选=已存模板 id 按输入过滤（datalist 原生语义等价；cap 50 超出继续手输），
   弹层壳/键盘/定位由骨架带来（IndexPicker ixp-pop 同款形态，teleport body）。 */
const idItems = computed(() => {
  const kw = curId.value.trim().toLowerCase();
  const ids = templates.value.map(t => t.id);
  const list = kw ? ids.filter(id => id.toLowerCase().includes(kw)) : ids;
  return list.slice(0, 50);
});
const {
  open: idOpen, cursor: idCursor, popStyle: idPopStyle, listId: idListId, itemId: idItemId,
  rootEl: idRootEl, listEl: idListEl, openPanel: idOpenPanel, close: idClose, onKey: idOnKey,
} = usePopupList<string>({
  items: () => idItems.value,
  onChoose: pickId,
  idPrefix: 'st-id',
  activeSelector: '.st-id-pop-item.act',
  place: { minWidth: 220, flipBelow: 200, flipTop: 200 },
});
function pickId(id: string) { curId.value = id; idClose(); }
/* 输入即开面板 + 光标复位（XmigrateView onSrcInput 同款语义；回写 curId 保住 v-model 契约） */
function onIdInput(e: Event) {
  curId.value = (e.target as HTMLInputElement).value;
  idCursor.value = 0;
  if (!idOpen.value) idOpenPanel();
}
/* R121: 模板源与参数进草稿——手写 source 半途切页不丢 */
const source = useScopedDraft('source', { route: 'search-templates' }, DEFAULT_TPL()).text;
const paramValues = useScopedDraftState<Record<string, string>>('params', { route: 'search-templates' }, {}).state;
const rendered = ref('');
const hits = ref<any[]>([]);
const tookMs = ref(-1);
const totalHits = ref(0);
const totalGte = ref(false);
/* 五百二十四批：st-meta 手写串适配 MetaStrip items（took 徽标走默认插槽，SearchSandboxView 同款） */
const stMeta = computed<MetaStripItem[]>(() => [
  { value: (totalGte.value ? '≥ ' : '') + fmtNum(totalHits.value), label: '命中' },
  { value: String(hits.value.length), label: '展示' },
]);
/* 六百零七批：内建视图档数据源（json=高亮 pretty 信封——用 highlightDslJson 保持本视图
   单一高亮语言（563 换装立法「旧单参出口退役不残留」，且其为 highlightJson 超集：信封
   键位词表外维持 j-key 零误色）；tree={_id,..._source} 行集——DQ/IH treeData 同构；卡片
   档需宿主开文档能力，本页无文档弹窗不接=数据驱动不出卡片档，记档非缺口） */
const stJsonHtml = computed(() => highlightDslJson(prettyJson({ total: totalHits.value, gte: totalGte.value, took: tookMs.value >= 0 ? tookMs.value : undefined, hits: hits.value })));
const stTreeData = computed(() => hits.value.map((h: any) => ({ _id: h._id, ...h._source })));
/* 四百二十四批：结果表聚焦态 */
const focusPaneId = ref<string | null>(null);

function DEFAULT_TPL() {
  return JSON.stringify({
    size: '{{size}}',
    query: { match: { '{{field}}': '{{keyword}}' } },
  }, null, 2);
}

/* {{param}} / {{{param}}} 提取；跳过 {{#x}} {{/x}} {{^x}} 段落标记 */
const paramNames = computed(() => {
  const out: string[] = [];
  const re = /\{\{\{?\s*([#/^]?)([\w.]+)\s*\}?\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source.value)) !== null) {
    if (m[1]) { if (!out.includes(m[2])) out.push(m[2]); continue; } // 段落变量也算参数
    if (!out.includes(m[2])) out.push(m[2]);
  }
  return out;
});

/* 源变更即作废旧渲染结果（原 textarea @input 语义，Monaco 换轨后走 watch） */
watch(source, () => { rendered.value = ''; });

/* 五百三十五批 R5：lint 划线接线（SearchSandboxView 范式平移，单通道 setMarkers）。
   防抖 250ms（useDebounceFn 统一件，卸载自动清理）；lintDsl ctx 传当前索引字段表；
   info→hint 降级（MonacoEditor marker 档只收 warning/hint/error）；模板源非法 JSON 静默
   （Monaco JSON 语法诊断已报）。零 banner：不新增行内提示条兄弟挤压编辑器，只走划线。 */
const stMeRef = ref<InstanceType<typeof MonacoEditor> | null>(null);
const queueLintMarkers = useDebounceFn(() => {
  let parsed: Record<string, unknown> | null = null;
  try {
    const o: unknown = JSON.parse(source.value);
    parsed = o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch { parsed = null; }
  const findings = parsed ? lintDsl(parsed, { fields: idxFields.value }) : [];
  stMeRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(source, () => { queueLintMarkers(); }, { immediate: true });

/* 值智能识别：数字 / 布尔 / JSON / 字符串 */
function coerce(v: string): any {
  const s = (v ?? '').trim();
  if (s === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s.startsWith('{') || s.startsWith('[')) { try { return JSON.parse(s); } catch { /* 按字符串 */ } }
  return s;
}
/* 五百六十三批：参数值 JSON 形态纠错建议——coerce 对 { [ 开头但解析失败的值静默按
   字符串下发（上方「按字符串」注释先例的输入期镜像），盲区就地可见；单源
   utils/inputAdvice.jsonShapeAdvice（拿不准不说话，宁缺毋滥）。 */
const paramFixHints = computed(() =>
  paramNames.value
    .map(p => ({ p, hint: jsonShapeAdvice(paramValues.value[p] ?? '') }))
    .filter(x => x.hint));
function buildParams() {
  const p: Record<string, any> = {};
  for (const k of paramNames.value) p[k] = coerce(paramValues.value[k] ?? '');
  return p;
}

function exists(id: string) { return templates.value.some(t => t.id === id); }

async function load() {
  busy.value = true; loadErr.value = '';
  try {
    const r: any = await api.listStoredScripts();
    if (r?.error) throw new Error(r.message);
    const sc = r?.scripts || {};
    templates.value = Object.keys(sc)
      .filter(id => (sc[id]?.lang || '') === 'mustache')
      .map(id => ({ id, source: typeof sc[id]?.source === 'string' ? sc[id].source : JSON.stringify(sc[id]?.source ?? '', null, 2) }));
  } catch (e: any) {
    /* 第十批 A：ES 错误友好化——裸 message 换全站 friendlyEsError 口径 */
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    /* 第十批收尾：toast 同源并轨 friendlyEsError（与上行 loadErr 同口径） */
    store.notify('error', '加载模板失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

function pick(t: { id: string; source: string }) {
  curId.value = t.id;
  source.value = prettify(t.source);
  rendered.value = ''; hits.value = []; tookMs.value = -1;
}
function prettify(s: string) {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
function newTemplate() {
  curId.value = '';
  source.value = DEFAULT_TPL();
  rendered.value = ''; hits.value = []; tookMs.value = -1;
}

async function save() {
  if (!curId.value) return;
  busy.value = true;
  try {
    /* mustache source 必须存成字符串（占位符会破坏 JSON 结构） */
    const body = JSON.stringify({ script: { lang: 'mustache', source: source.value } });
    const r: any = await api.putStoredScript(curId.value, body);
    if (r?.error) throw new Error(r.message);
    store.notify('success', `模板 ${curId.value} 已保存`);
    await load();
  } catch (e: any) {
    /* 第十批收尾：ES 错误友好化（load 同款口径） */
    store.notify('error', '保存失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

async function del() {
  if (!curId.value) return;
  if (!await askConfirm({
    title: '删除搜索模板',
    message: `将从集群删除搜索模板 ${curId.value}，调用它的业务方会立即报错，删除后不可恢复。`,
    level: 'critical',
    guardText: curId.value,
    okText: '删除模板',
  })) return;
  busy.value = true;
  try {
    const r: any = await api.deleteStoredScript(curId.value);
    if (r?.error) throw new Error(r.message);
    store.notify('success', `已删除模板 ${curId.value}`);
    newTemplate();
    await load();
  } catch (e: any) {
    /* 第十批收尾：ES 错误友好化（load 同款口径） */
    store.notify('error', '删除失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

async function render() {
  busy.value = true;
  try {
    const r: any = await api.renderTemplate(JSON.stringify({ source: source.value, params: buildParams() }));
    if (r?.error) throw new Error(r.message);
    rendered.value = JSON.stringify(r?.template_output ?? r, null, 2);
  } catch (e: any) {
    /* 第十批收尾：ES 错误友好化（load 同款口径） */
    store.notify('error', '渲染失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

async function run() {
  if (!index.value) { store.notify('warning', '请先填 index'); return; }
  /* z4 运行时验证修复：参数全空就发执行，空串渲染出 "size":"" 之类，ES 会炸出
     number_format_exception("empty String")——经 friendlyEsError 兜底只剩裸 reason，
     用户完全看不出是「忘了填参数」。提交前防呆（与上面 !index 同款拦截先例），
     部分留空不拦（空串参数在 mustache 里合法，合法性只有 ES 知道） */
  const unfilled = paramNames.value.filter(p => String(paramValues.value[p] ?? '').trim() === '');
  if (paramNames.value.length > 0 && unfilled.length === paramNames.value.length) {
    store.notify('warning', `模板参数 ${paramNames.value.join('、')} 还没填值——填空即查至少给一个参数赋值，或先「预览渲染」检查最终 DSL`);
    return;
  }
  busy.value = true;
  try {
    const r: any = await api.searchTemplate(index.value, JSON.stringify({ source: source.value, params: buildParams() }));
    if (r?.error) throw new Error(r.message);
    tookMs.value = r.took ?? -1;
    const t = totalOf(r.hits);
    totalHits.value = t.value;
    totalGte.value = t.gte;
    hits.value = r.hits?.hits || [];
    if (!hits.value.length) store.notify('warning', '查询无命中');
    /* 三百一十三批：成功执行写入跨模式查询历史（mode=template，query=渲染后 DSL 摘要）——
       模板执行从此可在查询工作台回放，不再黑盒一次性 */
    try {
      useQueryHistoryStore().push('template', rendered.value || source.value, index.value, tookMs.value >= 0 ? tookMs.value : undefined);
    } catch { /* 历史失败不阻塞结果 */ }
  } catch (e: any) {
    /* 第十批收尾：ES 错误友好化（load 同款口径） */
    store.notify('error', '执行失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

async function copyRendered() {
  await copyText(rendered.value);
  store.notify('success', '已复制 DSL');
}

/* ══ 五百二十八批：页内历史回放裁决（记档）══
   313 批 push('template', rendered.value || source.value, …) 签名被 tplHist313 锁定不可变，
   条目 query 有两种形态，回放按形态分派：
   ① 含 {{占位符}} 的=模板源快照（执行前未「预览渲染」时 rendered 为空，落的是 source 原文）
      → 可逆向：直接回填 source 草稿（play 再带一次执行，参数空缺由 run() 既有防呆提示）；
   ② 纯 JSON 的=渲染产物（参数已凝固成字面量）→ mustache 无法逆向还原模板源，
      回填不可行 → 裁决 fill/play 行为=复制查询体到剪贴板+toast 说明（不静默假装回填成功）。
   面板 copy 钮（QueryHistoryPanel 内建）始终可复制查询文本，与 ② 互为备份。 */
const qh = useQueryHistoryStore();
const histOpen = ref(false);
const histRows = computed(() => qh.items.filter(i => i.mode === 'template'));
async function replayTplRow(row: { query: string }, runIt: boolean) {
  histOpen.value = false;
  if (/\{\{/.test(row.query)) {
    source.value = row.query;
    store.notify('success', '已回填模板源（历史条目为模板源快照）');
    if (runIt) run();
    return;
  }
  const ok = await copyText(row.query);
  store.notify(ok ? 'success' : 'error', ok
    ? '已复制渲染 DSL（渲染产物无法逆向还原模板源，可粘贴到 DSL 工作台直接用）'
    : '复制失败');
}

/* ═══ 五百五十八批：原始 IO 快查（546/548 同款三件套）═══
   渲染（/cluster/render-template）/执行（/cluster/search-template）双响应面各取各的记录
   （两前缀互不混淆，本页独占出口）；共用同一弹窗宿主 rawIoShow/rawIoRec，先后点开互不残留；
   判空 rec=null 时 notify 引导，不开空弹窗。 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIoRender() {
  const rec = ioRecorder.last('/cluster/render-template');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
function openRawIoSearch() {
  const rec = ioRecorder.last('/cluster/search-template');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* ═══ 五百二十九批 W-B：QueryHub 跨模式历史回放 template 分支接收口（§6q 遗留）══
   QueryHubView replay 的 mode='template' 分支经 es-console.search-templates.carry
   （dsl.carry 同款一次性通道，favReplay bulk.carry/ubq.carry 跨页同构）把查询体送达这里，
   接收端只做「预填 source 草稿」，读走即删（普通重挂载不误吃）。play/run 行为由页内
   既有防呆承担：含 {{占位符}} 的模板源快照 → 参数表单 + run() 参数防呆照常接管；
   纯 JSON 的渲染产物 → 参数已凝固无法逆向还原模板源（528 批 replayTplRow 双形态裁决
   同口径），如实预填 + toast 明示形态，不静默假装是模板源还原。
   本页不在路由级 KeepAlive 白名单（App.vue），SPA 内每次进入都重挂载，onMounted 单口即可。 */
const ST_SOURCE_CARRY = 'es-console.search-templates.carry';
function consumeSourceCarry() {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(ST_SOURCE_CARRY); } catch { return; }
  if (!raw) return;
  sessionStorage.removeItem(ST_SOURCE_CARRY);
  source.value = prettify(raw);
  const isTplSnapshot = /\{\{/.test(raw);
  store.notify('success', isTplSnapshot
    ? '已从查询历史回填模板源（占位符参数在下方填空即可执行）'
    : '已从查询历史回填查询体——该条目是渲染产物（参数已凝固），可预览或直接执行；如需模板化请把值改回 {{占位符}}');
}
onMounted(consumeSourceCarry);

load();
</script>

<style scoped>
.st-page { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; }
.st-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
/* 五百二十七批：.st-hd-l/-ic/-sub/-r/.st-ii 死规则退役（页头已由 PageHeader 接管、页内选择器退役换
   CurrentIdxChip，模板 grep 0 引用） */
/* 五百二十五批：.st-inp 标签壳随页内 IndexPicker 退役删除（换 CurrentIdxChip 只读件） */
/* 五百二十批：中列 420px 钉死改 44% 弹性——宽屏中列跟随变宽（窄屏仍由 min 320px 保底） */
.st-body { display: grid; grid-template-columns: minmax(150px, 200px) minmax(320px, 44%) minmax(0, 1fr); gap: var(--sp-3); flex: 1; min-height: 0; align-items: start; }
/* 五百六十一批：st-list 列表容器壳剥壳（立法④：border+radius 容器退役，内容直贴）——
   分界由 .st-list-hd 既有 border-bottom 承接；overflow+flex+max-height 骨架逐字保留
   （收缩防撑破是结构语义非 chrome，as-card 545 判例同语言） */
.st-list { overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - var(--vh-offset, 210px) + 50px); }
.st-list-hd { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-xs); font-weight: 650; border-bottom: 1px solid var(--border); }
/* 五百六十一批：st-list 侧栏空态死码规则退役（557 批已清模板消费，随本批立删；
   flattenWave554/557「34px var(--sp-4)」源码锁与 spSweep551 豁免册锚随迁负锁化） */
/* 五百五十七批：.st-list-err/.st-list-err-msg 失败档专用规则随失败态 EmptyState 收编退役 */
.st-item { display: flex; align-items: center; gap: var(--sp-1h); padding: 7px var(--sp-2h); font-size: var(--fs-sm); cursor: pointer; border-left: 2px solid transparent; }
.st-item:hover { background: var(--hl-soft); }
.st-item.on { border-left-color: var(--ac); background: var(--ac-soft); }
.st-item-ic { flex: none; opacity: .6; }
.st-item-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); }
/* 五百六十批：侧栏名字过滤换装 SearchFilterBar 统一件——胶囊壳（border/radius/底色）归
   组件单源，st-list-sfb 落位类只留 margin（对齐现行）与内衬（padding/字号对齐现行）；
   st-list-filter 类锚随 input-class 保留在 input 上（stTplTiersFilter 挂载锁同路径零迁），
   ::placeholder 弱化档随迁 */
.st-list-sfb { margin: var(--sp-1h) var(--sp-2); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-xs); }
.st-list-filter::placeholder { opacity: .5; }
/* 五百二十批：模板源高度四档——S/M/L Monaco 定高直传；满档 min-height 拉起 wrap 视口弹性，
   :deep monaco-host 接管 height 吃满 wrap（JsonArea fill 同手法，不改共享组件） */
.st-ed-wrap { display: flex; flex-direction: column; }
.st-ed-wrap.st-h-full { min-height: max(168px, 42vh); }
.st-ed-wrap.st-h-full :deep(.monaco-host) { height: auto !important; flex: 1; min-height: 0; }
/* 五百五十七批：编辑器外框退役（立法③）——本面编辑器是 MonacoEditor（非 JsonArea），
   外框在组件 .monaco-host（禁改件），视图侧 :deep 覆盖退役；分界由 st-card-hd 既有
   border-bottom 承接（554 批已立法）；纯视觉零结构 */
.st-ed-wrap :deep(.monaco-host) { border: none; border-radius: 0; }
/* 五百二十批：编辑器高度档位钮组（IndexHub ih-eh 同款视觉） */
.st-eh { display: flex; gap: var(--sp-0); flex-shrink: 0; }
.st-eh-btn { border: 1px solid var(--line); background: var(--bg1); color: var(--tx2); font-size: var(--fs-xs); line-height: 1; padding: var(--sp-1) var(--sp-2); cursor: pointer; border-radius: 3px; }
.st-eh-btn:hover { color: var(--tx1); border-color: var(--ac-line); }
.st-eh-btn.on { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
.st-mid { display: flex; flex-direction: column; gap: var(--sp-2h); min-width: 0; }
/* 五百五十四批：三 .st-card 带框壳退役（立法③编辑器外框退役+立法④）——内容直贴，
   分界由 st-card-hd border-bottom 承接（Kibana 同语言）；overflow:hidden 保留
   （模板 ID 弹层 teleport body 的豁免依据注释仍真，无 radius 后无视觉差） */
.st-card { border: 0; border-radius: 0; overflow: hidden; }
.st-card-hd { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-xs); font-weight: 650; border-bottom: 1px solid var(--border); }
.st-flex { flex: 1; }
/* 五百二十四批：模板 ID 输入 usePopupList 落位——wrap 承接原 input 的 flex:1/min-width:0（卡头 flex 子项），
   弹层 teleport body + place() fixed 定位（IndexPicker ixp-pop 同款壳） */
.st-id-wrap { flex: 1; min-width: 0; display: flex; }
.st-id-pop { overflow: hidden; font-size: var(--fs-xs); }
.st-id-pop-item { padding: 5px var(--sp-2h); cursor: pointer; font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 340px; }
.st-id-pop-item.act { background: var(--hl-soft); }
.st-id-inp { flex: 1; min-width: 0; padding: 3px var(--sp-2); border: 1px solid var(--border); border-radius: 5px; background: transparent; color: inherit; font-size: var(--fs-xs); font-family: var(--mono); }
.st-hint { display: flex; align-items: center; gap: 5px; padding: var(--sp-1h) var(--sp-2h); font-size: var(--fs-xs); opacity: .6; border-top: 1px dashed var(--border); }
.st-hint code { background: var(--bg2); padding: 0 var(--sp-1); border-radius: 3px; }
/* 第十批 B：.st-empty-sub 裸空态退役迁 EmptyState compact，本地样式随迁删除 */
.st-param { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1h) var(--sp-2h); }
.st-param-nm { flex: none; min-width: 90px; font-size: var(--fs-xs); font-family: var(--mono); color: var(--warn); }
.st-param-in { flex: 1; padding: var(--sp-1) var(--sp-2); border: 1px solid var(--border); border-radius: 5px; background: transparent; color: inherit; font-size: var(--fs-sm); }
/* 五百六十三批：参数纠错建议块落位（独立块内容增量；形态归 .il-hint 单源） */
.st-param-warns { display: flex; flex-direction: column; gap: var(--sp-0); padding: 0 var(--sp-2h) var(--sp-1h); }
.st-actions { display: flex; gap: var(--sp-2); padding: var(--sp-2) var(--sp-2h); border-top: 1px dashed var(--border); }
.st-right { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; overflow: auto; max-height: calc(100vh - var(--vh-offset, 210px) + 50px); }
.st-pre { margin: 0; padding: var(--sp-2h); font-size: var(--fs-xs); font-family: var(--mono); overflow: auto; max-height: 320px; }
/* 五百二十四批：手写串样式随 MetaStrip/TookBadge 换装退役，只留落位 padding（字号/mono 由统一件承担）。
   五百二十五批：took 手写 sep 退役（MetaStrip 有默认插槽自动渲染 .ms-sep）、插槽段类名换组件档
   ms-i/ms-t——三胞胎 scoped 样式随迁删除（形态单一出处归组件） */
.st-meta { padding: 0 var(--sp-0); }
@media (max-width: 1100px) { .st-body { grid-template-columns: minmax(140px, 180px) minmax(0, 1fr); } .st-right { grid-column: 1 / -1; } }
/* 五百三十四批：900 紧凑微调档——页列距与三栏 gap 收一档兜密度；头行 .st-hd 527 批已
   flex-wrap，分栏塌列归 1100 档不重复 */
@media (max-width: 900px) {
  .st-page { gap: var(--sp-2); }
  .st-body { gap: var(--sp-2); }
}
</style>
