<template>
  <div class="bgn" draggable="true" @dragstart.stop="onDragStart" @dragend="endDrag">
    <div class="bgn-hd">
      <span class="bgn-grip" title="拖拽整组">⋮⋮</span>
      <button aria-label="折叠或展开整组" class="btn sm ghost" :title="collapsed ? '展开整组' : '折叠整组'"
              @click="collapsed = !collapsed">
<ChevronRight v-if="collapsed" :size="12" /><ChevronDown v-else :size="12" />
</button>
      <span class="bgn-scope">bool</span>
      <!-- 折叠态摘要：非空分区 occur(子句数) 一眼可读（折叠态按 node.id 进 scoped draft） -->
      <span v-if="collapsed" class="bgn-sum mono">{{ occSummary || '空组' }}</span>
      <span style="flex:1"></span>
      <button aria-label="组参数（minimum_should_match / boost 等）" class="btn sm ghost" :class="{ on: showParams }" title="组参数（minimum_should_match / boost 等）"
              @click="showParams = !showParams">
<SlidersHorizontal :size="12" />
</button>
      <button aria-label="复制整组" class="btn sm ghost" title="复制整组（含子条件，插到本组之后）" @click="emit('duplicate', node.id)"><Copy :size="12" /></button>
      <button aria-label="把本组包进新的父组" class="btn sm ghost" title="把本组包进新的父组" @click="emit('wrap')"><Group :size="12" /></button>
      <button aria-label="解散本组，子句按原语义并入父组" v-if="canDissolve && !Object.keys(node.params).length" class="btn sm ghost"
              title="解散本组，子句按原语义并入父组" @click="emit('dissolve')">
<Ungroup :size="12" />
</button>
      <button aria-label="删除整组" class="btn sm ghost danger" title="删除整组" @click="emit('remove')"><X :size="12" /></button>
    </div>
    <template v-if="!collapsed">
    <div v-if="showParams" class="bgn-params">
      <GenericParams :value="node.params" path-prefix="" @update="onParams" />
    </div>
    <div
      v-for="o in shownOccur" :key="o"
      class="bgn-part" :class="'o-' + o"
      @dragover.prevent @drop.stop.prevent="onDrop(o)"
    >
      <div class="bgn-occur">
        <!-- R125: occur 语义 pill——四色对齐 must/filter/should/must_not 心智（绿/蓝/紫/红），
             底色用既有 --*-soft token；中文为主 key 弱化 -->
        <span class="bgn-pill" :class="'p-' + o"><i></i>{{ OCCUR_LABEL[o] }}<code>{{ o }}</code></span>
        <span style="flex:1"></span>
        <button class="btn sm ghost" title="在此分区加条件" @click="addClause(o)"><Plus :size="11" /> 条件</button>
        <button class="btn sm ghost" title="在此分区加嵌套子组" @click="addGroup(o)"><Group :size="11" /> 子组</button>
        <button v-if="pinned.includes(o) && !childrenOf(o).length" aria-label="收起此空分区" class="btn sm ghost"
                title="收起此空分区" @click="unpin(o)">
<X :size="11" />
</button>
      </div>
      <NodeRenderer
        v-for="c in childrenOf(o)" :key="c.node.id"
        :node="c.node" :fields="fields" :types="types" in-bool
        @update:node="n => replaceChild(c.node.id, n)"
        @remove="emit('update:node', removeNodeById(node, c.node.id) as BoolNode)"
        @wrap="emit('update:node', wrapInBool(node, c.node.id) as BoolNode)"
        @dissolve="emit('update:node', dissolveBool(node, c.node.id) as BoolNode)"
        @duplicate="emit('duplicate', $event as string)"
      />
      <div v-if="!childrenOf(o).length" class="bgn-empty">{{ dragging ? '松开即移到此分区' : '空分区' }}</div>
    </div>
    <div v-if="!dragging && hiddenOccur.length" class="bgn-more">
      <button v-for="o in hiddenOccur" :key="o" class="btn sm ghost bgn-more-btn" :class="'p-' + o" @click="pin(o)">+ {{ OCCUR_LABEL[o] }}</button>
    </div>
    </template>
  </div>
</template>

<script lang="ts">
/* 五百一十九批：面板头「折叠全部/展开全部」的 window 广播事件名（同 DRAG_EVENT 模式，
   事件名常量随本组件导出，QueryTreePane 引用同名常量 dispatch；折叠态仍是组内内存 ref） */
export const BGN_COLLAPSE_EVENT = 'qtp-collapse-all';
</script>

<script setup lang="ts">
/* W1：bool 组容器——occur 四分区（must/filter/should/must_not）。
   空分区默认折叠（must 除外），拖拽广播期间全量亮出作落点；可手动固定展开。
   不可变更新：remove/wrap/dissolve 经 queryAst 树操作函数；add/replace 本地展开新 children
   （insertChild 会标 arrForm 改变序列化形态，追加语义下不可用）。一切变更 emit 新对象。 */
import { ref, computed, watch, inject, onMounted, onBeforeUnmount } from 'vue';
import { X, Group, Ungroup, Plus, SlidersHorizontal, ChevronDown, ChevronRight, Copy } from 'lucide-vue-next';
import GenericParams from './GenericParams.vue';
import NodeRenderer from './NodeRenderer.vue';
import { TREE_BUS, DRAG_KEY, DRAG_EVENT, fireDrag } from './treeBus';
import { defaultLeafTarget, curFieldSearchIndex } from '../../utils/fieldSearch';
import { useScopedDraft } from '../../composables/useScopedDraft';
import {
  OCCURS, nid, removeNodeById, wrapInBool, dissolveBool,
  type BoolNode, type LeafNode, type QueryNode, type Occur,
} from '../../utils/queryAst';

const props = defineProps<{
  node: BoolNode; fields: string[]; types: Record<string, string>; canDissolve?: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:node', n: BoolNode): void;
  (e: 'remove'): void; (e: 'wrap'): void; (e: 'dissolve'): void; (e: 'duplicate', id: string): void;
}>();

const bus = inject(TREE_BUS, null);
const showParams = ref(false);
const dragging = ref(false);
const pinned = ref<Occur[]>([]);
/* 整组折叠：【W3b】按 node.id 进 useScopedDraft（sessionStorage）——KeepAlive 淘汰重挂不丢；
   重解析 nid() 随机出新 id = 天然 stamp，重挂即重置（旧树的折叠残留不串扰新树）。
   scope.index 借 fieldSearch 模块级当前索引（QueryTreePane/RootExtrasPane 挂载即写），
   免 props 逐层透传；读不到（直挂测试）回退全局键。 */
const collapseDraft = useScopedDraft(
  'bgn-fold:' + props.node.id,
  { route: 'query-builder', index: () => curFieldSearchIndex() },
  '',
);
const collapsed = ref(collapseDraft.text.value === '1');
watch(collapsed, v => { collapseDraft.text.value = v ? '1' : ''; });
const occSummary = computed(() =>
  OCCURS.filter(o => childrenOf(o).length).map(o => `${o}(${childrenOf(o).length})`).join(' '));

const OCCUR_LABEL: Record<Occur, string> = { must: '必须', filter: '过滤', should: '应该', must_not: '排除' };

const childrenOf = (o: Occur) => props.node.children.filter(c => c.occur === o);
const shownOccur = computed(() =>
  OCCURS.filter(o => o === 'must' || childrenOf(o).length > 0 || pinned.value.includes(o) || dragging.value));
const hiddenOccur = computed(() => OCCURS.filter(o => !shownOccur.value.includes(o)));
const pin = (o: Occur) => { pinned.value = [...pinned.value, o]; };
const unpin = (o: Occur) => { pinned.value = pinned.value.filter(x => x !== o); };

function defaultLeaf(): LeafNode {
  /* 优先取本索引最近使用的字段+其兼容算子（fieldSearch per-index 记忆），无记录回退 fields[0]+term */
  const t = defaultLeafTarget(props.fields, props.types, curFieldSearchIndex());
  return t
    ? { id: nid(), type: 'leaf', op: t.op, field: t.field, value: '', params: {}, raw: null }
    : { id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null };
}
function addClause(o: Occur) {
  emit('update:node', { ...props.node, children: [...props.node.children, { occur: o, node: defaultLeaf() }] });
}
function addGroup(o: Occur) {
  const g: BoolNode = { id: nid(), type: 'bool', children: [{ occur: 'must', node: defaultLeaf() }], params: {}, arrForm: { must: true } };
  emit('update:node', { ...props.node, children: [...props.node.children, { occur: o, node: g }] });
}
function replaceChild(id: string, n: QueryNode) {
  emit('update:node', {
    ...props.node,
    children: props.node.children.map(c => c.node.id === id ? { occur: c.occur, node: n } : c),
  });
}
/* params 恒为对象：GenericParams 的 update 联合类型在此收窄（数组分支不会出现，守卫兜底） */
function onParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) emit('update:node', { ...props.node, params: v });
}

/* ---- 拖拽 ---- */
function onDragStart(e: DragEvent) {
  (window as any)[DRAG_KEY] = props.node.id;
  e.dataTransfer?.setData('text/plain', props.node.id);
  fireDrag(true);
}
function endDrag() { delete (window as any)[DRAG_KEY]; fireDrag(false); }
function onDrop(o: Occur) {
  const id = (window as any)[DRAG_KEY] as string | undefined;
  delete (window as any)[DRAG_KEY];
  fireDrag(false);
  if (!id || id === props.node.id) return;
  if (!bus) { if (import.meta.env.DEV) console.warn('[qtp] TREE_BUS 未 provide，drop 被忽略'); return; }
  bus.move(id, props.node.id, o);
}
const onDragEvt = (e: Event) => { dragging.value = !!(e as CustomEvent).detail?.on; };
onMounted(() => window.addEventListener(DRAG_EVENT, onDragEvt));
onBeforeUnmount(() => window.removeEventListener(DRAG_EVENT, onDragEvt));
/* 五百一十九批：响应面板头「折叠全部/展开全部」广播（折叠态置组内内存 ref） */
const onCollapseEvt = (e: Event) => { collapsed.value = !!(e as CustomEvent).detail?.collapsed; };
onMounted(() => window.addEventListener(BGN_COLLAPSE_EVENT, onCollapseEvt));
onBeforeUnmount(() => window.removeEventListener(BGN_COLLAPSE_EVENT, onCollapseEvt));
</script>

<style scoped>
/* R125 v2 去卡片化（对标 Linear/Notion/Airtable 过滤器）：组不再有边框/底色/内边距——
   嵌套 scope 全靠缩进+左引导线表达，层级再深视觉重量恒定；组工具钮平时不可见、
   组悬停浮现（scope 即悬停区域），条件行悬停才浮出浅底。全程 var(--tr) 微过渡。 */
.bgn { padding: 0; margin: 0; }
.bgn-hd { display: flex; align-items: center; gap: var(--sp-0); margin: 0 0 var(--sp-0); flex-wrap: wrap;
  opacity: 0; height: 24px; transition: opacity var(--tr); }
.bgn:hover > .bgn-hd, .bgn:focus-within > .bgn-hd { opacity: 1; }
.bgn-hd .btn { flex: none; }
.bgn-scope { font-family: var(--mono, ui-monospace, monospace); font-size: var(--fs-2xs); color: var(--tx2);
  background: var(--bg3); border-radius: var(--r-xs); padding: 1px var(--sp-1h); margin-right: var(--sp-0); }
/* 折叠态摘要：occur(子句数) mono 小字（must(2) filter(1)），随 scope 同档弱化 */
.bgn-sum { font-family: var(--mono, ui-monospace, monospace); font-size: var(--fs-2xs); color: var(--tx2); user-select: none; }
.bgn-grip { cursor: grab; color: var(--tx2); font-size: var(--fs-xs); user-select: none; }
.bgn-params { margin: var(--sp-0) 0 var(--sp-1); padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
/* R125 v3.1: git-graph 引导线——同色淡线+顶部圆点（pill 左下角垂下），嵌套层级如提交树 */
.bgn-part { position: relative; border-left: 2px solid var(--line); padding-left: var(--sp-3); margin: var(--sp-1) 0 var(--sp-1) 3px; transition: border-color var(--tr); }
.bgn:hover > .bgn-part { border-left-color: color-mix(in srgb, var(--tx2) 45%, var(--line)); }
.bgn-part::before { content: ''; position: absolute; left: -5px; top: 0; width: 8px; height: 8px; border-radius: 50%;
  background: var(--card); border: 2px solid var(--line); }
.bgn-part.o-must { border-left-color: var(--c-must-bg, var(--ok-soft)); }
.bgn-part.o-must::before { border-color: var(--c-must, var(--ok)); }
.bgn-part.o-filter { border-left-color: var(--c-filter-bg, var(--info-soft)); }
.bgn-part.o-filter::before { border-color: var(--c-filter, var(--info)); }
.bgn-part.o-should { border-left-color: var(--c-should-bg, var(--dv-violet-soft)); }
.bgn-part.o-should::before { border-color: var(--c-should, var(--violet)); }
.bgn-part.o-must_not { border-left-color: var(--c-exclude-bg, var(--err-soft)); }
.bgn-part.o-must_not::before { border-color: var(--c-exclude, var(--err)); }
.bgn-occur { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-0); flex-wrap: wrap; }
.bgn-occur .btn { flex: none; }
.bgn-pill { display: inline-flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-xs); font-weight: 600;
  padding: var(--sp-0) var(--sp-2h) var(--sp-0) var(--sp-2); border-radius: 999px; }
.bgn-pill i { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.bgn-pill code { font-family: var(--mono, ui-monospace, monospace); font-size: var(--fs-2xs); font-weight: 400; opacity: .62; }
/* R125 v3.1: git-graph 引导线——分区线降饱和底色，组悬停时加深 */
.bgn-pill.p-must { color: var(--c-must, var(--ok)); background: var(--c-must-bg, var(--ok-soft)); }
.bgn-pill.p-filter { color: var(--c-filter, var(--info)); background: var(--c-filter-bg, var(--info-soft)); }
.bgn-pill.p-should { color: var(--c-should, var(--violet)); background: var(--c-should-bg, var(--dv-violet-soft)); }
.bgn-pill.p-must_not { color: var(--c-exclude, var(--err)); background: var(--c-exclude-bg, var(--err-soft)); }

.bgn-empty { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1) 0 var(--sp-1) var(--sp-0); }
.bgn-more { display: flex; gap: var(--sp-2); margin-top: var(--sp-1); flex-wrap: wrap; }
.bgn-more-btn { color: var(--tx2); }
.bgn-more-btn.p-must:hover { color: var(--c-must); }
.bgn-more-btn.p-filter:hover { color: var(--c-filter); }
.bgn-more-btn.p-should:hover { color: var(--c-should); }
.bgn-more-btn.p-must_not:hover { color: var(--c-exclude); }
</style>
