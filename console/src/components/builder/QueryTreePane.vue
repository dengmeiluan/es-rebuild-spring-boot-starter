<template>
  <div ref="paneEl" class="qtp" :class="{ froz: stale }">
    <div v-if="stale" class="qtp-stale">
      右侧 DSL 有未解析的修改，条件树冻结显示最近一次成功解析——修正语法后自动恢复。
    </div>

    <!-- 面板头部：递归叶子条件计数徽标（含嵌套与临时停用） -->
    <div v-if="tree.root" class="qtp-hd">
      <!-- 五百一十九批：徽标升级分档读数「共 N · 停用 M · 嵌套 K」（M/K 为 0 省略段）；
           N>10 转 .hot 警示色，提示条件树偏大。
           五百五十三批：裸 pill 升级 .chip.static 质感档（bg2 底+line 边+tabular-nums 全局单源），
           数字 mono 包裹（textContent 不变，fieldSelectPopup 计数断言兼容） -->
      <span class="qtp-cnt chip static" :class="{ hot: leafStats.total > 10 }" :title="cntTitle">共 <b class="mono">{{ leafStats.total }}</b> 条件<template v-if="leafStats.disabled"> · 停用 <b class="mono">{{ leafStats.disabled }}</b></template><template v-if="leafStats.nested"> · 嵌套 <b class="mono">{{ leafStats.nested }}</b></template></span>
      <span style="flex:1"></span>
      <!-- 五百一十九批：条件搜索定位——命中行柔底高亮并滚动定位，清空恢复；
           【W3b】计数 N/M + Enter/Shift+Enter 逐命中轮转（当前命中加重档）。
           五百五十三批：裸 input 收编 SearchFilterBar 统一件（547 批 wt/fv/tg 三胞胎后第四胞胎，
           同构判定：过滤词+Enter 导航+附加件插槽+Esc 清空内建；Shift+Enter 反向轮转经
           组件 @enter 转出的原生 KeyboardEvent.shiftKey 承接），胶囊壳质感归组件单源 -->
      <!-- title 经组件 $attrs 透传落胶囊根（inheritAttrs 关闭显式透传），悬停提示原语义保留 -->
      <SearchFilterBar v-model="filterQ" class="qtp-find" placeholder="过滤条件…" @enter="onFindKey" title="按字段名/算子/值过滤条件行：命中柔底高亮，Enter/Shift+Enter 在命中间轮转，清空恢复">
        <span v-if="findHits.length" class="qtp-find-nav chip static mono" aria-live="polite"
              :title="'命中 ' + findHits.length + ' 条，当前第 ' + findCur + ' 条'">{{ findCur }}/{{ findHits.length }}</span>
      </SearchFilterBar>
      <!-- 五百四十一批：四枚举钮收敛两枚状态感知循环钮（折叠⇄展开 / 启用⇄停用各一枚，
           显隐条件与 title 原语义保留）——
           折叠态不进 queryTree（BoolGroupNode 组内 ref+scoped draft）→ 上次动作 ref；
           启停态树内必有字段（叶 disabled，leafStats 已统计）→ 存在停用显「启用全部」。
           五百五十三批：补 lucide icon 与 BoolGroupNode 组头 icon 钮语言对齐
           （双 chevron 表「全部」批量语义，区别于组头单 chevron） -->
      <template v-if="tree.root.type === 'bool'">
        <button v-if="anyCollapsed" class="btn sm ghost" title="展开全部嵌套组" @click="broadcastCollapse(false)"><ChevronsUp :size="11" /> 展开全部</button>
        <button v-else class="btn sm ghost" title="折叠全部嵌套组" @click="broadcastCollapse(true)"><ChevronsDown :size="11" /> 折叠全部</button>
      </template>
      <template v-if="!isPlainMatchAll">
        <button v-if="hasDisabled" class="btn sm ghost" title="全部条件恢复参与匹配" @click="setAllDisabled(false)"><Play :size="11" /> 启用全部</button>
        <button v-else class="btn sm ghost" title="全部条件临时停用（不删除，可恢复）" @click="setAllDisabled(true)"><Pause :size="11" /> 停用全部</button>
      </template>
    </div>

    <!-- R125 v3.1 空态：漏斗插画+光晕引导（替代单行虚线框） -->
    <div v-if="!tree.root" class="qtp-none">
      <div class="qtp-funnel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
      </div>
      <div class="qtp-funnel-t1">无查询条件</div>
      <div class="qtp-funnel-t2">DSL 里没有 query 键，加一个条件开始构建</div>
      <div class="qtp-funnel-act">
        <button class="btn pri sm" @click="addFirst"><Plus :size="12" /> 加查询条件</button>
      </div>
    </div>

    <div v-else-if="isPlainMatchAll" class="qtp-none">
      <div class="qtp-funnel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
      </div>
      <div class="qtp-funnel-t1">当前为全部文档（match_all）</div>
      <div class="qtp-funnel-t2">加一个条件开始缩小范围，或在右侧直接编写 DSL</div>
      <div class="qtp-funnel-act">
        <button class="btn pri sm" @click="addFirst"><Plus :size="12" /> 加条件</button>
      </div>
    </div>

    <BoolGroupNode
      v-else-if="tree.root.type === 'bool'"
      :key="(tree.root as BoolNode).id"
      :node="(tree.root as BoolNode)" :fields="fields" :types="types"
      @update:node="onRootUpdate" @remove="onRootRemove" @wrap="wrapRoot" @duplicate="onDuplicate"
    />

    <template v-else>
      <div class="qtp-single-bar">
        <span class="qtp-single-tx">单条件查询</span>
        <button class="btn sm" @click="addSibling"><Plus :size="11" /> 加条件（转条件组）</button>
      </div>
      <NodeRenderer
        :node="tree.root" :fields="fields" :types="types"
        @update:node="onRootUpdate" @remove="onRootRemove" @wrap="wrapRoot" @duplicate="onDuplicate"
      />
    </template>
</div>
</template>

<script setup lang="ts">
/* W1：构建器主面板。root 形态规则：null→加查询条件；纯 match_all→空态；
   bool→直渲染；单节点→渲染+「转条件组」。
   归一化：root bool 子句删光自动回 match_all；root 永不缺失。
   provide TREE_BUS：落点分区的 move 在这里统一 moveNode（Task 6 防环）。
   index prop：写入 fieldSearch 的当前索引上下文（per-index 最近字段记忆供 defaultLeaf 与
   子树深处的 FieldSelect 读取——NodeRenderer 之下逐层透传 prop 不现实）。 */
import { computed, watch, provide, ref, nextTick } from 'vue';
import { Plus, ChevronsDown, ChevronsUp, Pause, Play } from 'lucide-vue-next';
import SearchFilterBar from '../SearchFilterBar.vue';
import BoolGroupNode, { BGN_COLLAPSE_EVENT } from './BoolGroupNode.vue';
import NodeRenderer from './NodeRenderer.vue';
import RootExtrasPane from './RootExtrasPane.vue';
import { TREE_BUS } from './treeBus';
import { setFieldSearchIndex, setFieldSearchUsedFields, defaultLeafTarget } from '../../utils/fieldSearch';
import {
  nid, moveNode, wrapInBool, updateNodeById,
  type QueryTree, type QueryNode, type BoolNode, type LeafNode,
} from '../../utils/queryAst';

const props = defineProps<{
  tree: QueryTree; fields: string[]; types: Record<string, string>; stale?: boolean; index?: string;
}>();
const emit = defineEmits<{ (e: 'update:tree', t: QueryTree): void }>();

watch(() => props.index, i => setFieldSearchIndex(i || ''), { immediate: true });

/* 五百二十五批：树内已用字段→fieldSearch 模块态（FieldSelect 候选 used 前置段数据源）——
   收集全部叶子条件字段名去重写入（bool 下钻 / wrap 下钻 / 叶取 field）。树编辑全走不可变
   更新（子组件 emit 新节点、setRoot 换引用），watch 引用替换即全量重扫，无深监听。
   免 prop 逐层透传：NodeRenderer 之下透传面过大，setFieldSearchIndex 同款既有先例。 */
watch(() => props.tree, t => {
  const names: string[] = [];
  const walk = (x: QueryNode) => {
    if (x.type === 'bool') x.children.forEach(c => walk(c.node));
    else if (x.type === 'wrap') { if (x.child) walk(x.child); }
    else if (x.field) names.push(x.field);
  };
  if (t.root) walk(t.root);
  setFieldSearchUsedFields(names);
}, { immediate: true });

const matchAllLeaf = (): LeafNode =>
  ({ id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null });
function defaultLeaf(): LeafNode {
  /* 优先取本索引最近使用的字段+其兼容算子（fieldSearch per-index 记忆），无记录回退 fields[0] */
  const t = defaultLeafTarget(props.fields, props.types, props.index || '');
  if (!t) return matchAllLeaf();
  return { id: nid(), type: 'leaf', op: t.op, field: t.field, value: '', params: {}, raw: null };
}

/* 面板头部量变读数：递归数叶子条件（wrap 的子句也算，bool 只下钻不计自身）——
   五百一十九批：升级为 total/disabled/nested 分档（root 组自身不计入嵌套），
   停用/嵌套为 0 时徽标省略对应段（零噪音）；total>10 由模板挂 .hot 警示色 */
const leafStats = computed(() => {
  const st = { total: 0, disabled: 0, nested: 0 };
  const r = props.tree.root;
  if (!r) return st;
  const walk = (x: QueryNode, isRoot: boolean) => {
    if (x.type === 'bool') {
      if (!isRoot) st.nested++;
      x.children.forEach(c => walk(c.node, false));
    } else if (x.type === 'wrap') {
      if (x.child) walk(x.child, false);
    } else {
      st.total++;
      if (x.disabled) st.disabled++;
    }
  };
  walk(r, true);
  return st;
});
/* 五百四十一批：启停循环钮感知源——树内叶 disabled 字段必然在场（leafStats 递归已统计）：
   存在停用条件显「启用全部」，否则显「停用全部」；点后写树换引用，感知随动 */
const hasDisabled = computed(() => leafStats.value.disabled > 0);
const cntTitle = computed(() => {
  const s = leafStats.value;
  let t = '条件树中的叶子条件总数（含嵌套分区与临时停用的条件）';
  if (s.disabled) t += `；停用 ${s.disabled} 条不参与本次匹配`;
  if (s.nested) t += `；嵌套子组 ${s.nested} 个`;
  if (s.total > 10) t += '；条件数偏多，可用下方过滤定位或拆分条件组';
  return t;
});

/* 五百一十九批：条件搜索定位——扫描条件行（字段名+算子+值），命中加 .qtp-hit 柔底并滚动到
   首个命中；清空恢复。走 DOM 扫描而非逐层透传过滤词：树是 BoolGroupNode→NodeRenderer→ClauseNode
   递归多组件渲染，prop 透传锁定面大，且命中高亮是视图态不进数据。
   【W3b】导航升级（参照 useHitNav 范式）：1-based 游标 + wrap-around 轮转；
   计数 N/M 常显；Enter 下一个 / Shift+Enter 上一个；当前命中加 .qtp-hit-cur 加重档——
   柔底只说明「命中」，加重档只在用户导航后落位（未导航不打焦点环，useHitLocate 同款取舍），
   扫描定位首行仍保留（既有行为不回归）。 */
const paneEl = ref<HTMLElement>();
const filterQ = ref('');
const findHits = ref<HTMLElement[]>([]);
const findCur = ref(0);   // 1-based；0 = 无命中
watch(filterQ, async () => {
  await nextTick();
  const root = paneEl.value;
  if (!root) return;
  root.querySelectorAll('.cn.qtp-hit').forEach(el => el.classList.remove('qtp-hit'));
  root.querySelectorAll('.cn.qtp-hit-cur').forEach(el => el.classList.remove('qtp-hit-cur'));
  const q = filterQ.value.trim().toLowerCase();
  if (!q) { findHits.value = []; findCur.value = 0; return; }
  const hits: HTMLElement[] = [];
  for (const row of Array.from(root.querySelectorAll('.cn'))) {
    const field = (row.querySelector('.fs-inp') as HTMLInputElement | null)?.value || '';
    const op = (row.querySelector('.cn-op') as HTMLSelectElement | null)?.value || '';
    const val = (row.querySelector('.cn-val') as HTMLInputElement | HTMLSelectElement | null)?.value || '';
    if ((field + ' ' + op + ' ' + val).toLowerCase().includes(q)) {
      row.classList.add('qtp-hit');
      hits.push(row as HTMLElement);
    }
  }
  findHits.value = hits;
  findCur.value = hits.length ? 1 : 0;
  hits[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});
/* 游标 → DOM 落位：唯一 .qtp-hit-cur + 滚到视口中心（命中行尚未渲染时不炸，下次导航再试） */
function applyFindCur() {
  const root = paneEl.value;
  if (!root) return;
  root.querySelectorAll('.cn.qtp-hit-cur').forEach(el => el.classList.remove('qtp-hit-cur'));
  const el = findHits.value[findCur.value - 1];
  if (!el) return;
  el.classList.add('qtp-hit-cur');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
/* 五百五十三批：改由 SearchFilterBar @enter 定向转出（组件 .enter.prevent 已挡默认行为）——
   函数体零触：Enter/Shift+Enter 轮转语义经转出的原生 KeyboardEvent 原样承接 */
function onFindKey(e: KeyboardEvent) {
  if (e.key !== 'Enter') return;
  const n = findHits.value.length;
  if (!n) return;
  e.preventDefault();
  /* wrap-around 轮转（useHitNav.next/prev 同式）：Shift+Enter 反向 */
  findCur.value = e.shiftKey ? ((findCur.value - 2 + n) % n) + 1 : (findCur.value % n) + 1;
  applyFindCur();
}

/* 五百一十九批：折叠/展开全部嵌套组——组折叠态是 BoolGroupNode 组内内存 ref，
   经 window 事件广播（同 DRAG_EVENT 模式，事件名定义在 BoolGroupNode module 块；
   TreeBus 注入接口不动）。
   五百四十一批：折叠态不进 queryTree（组内 ref+scoped draft，树数据无字段可推）——
   按「本地 ref 记忆上次动作」收敛单枚循环钮：初始视为全展开（显「折叠全部」），
   点击广播同时翻转记忆，下一眼显反向动作。 */
const anyCollapsed = ref(false);
function broadcastCollapse(collapsed: boolean) {
  anyCollapsed.value = collapsed;
  window.dispatchEvent(new CustomEvent(BGN_COLLAPSE_EVENT, { detail: { collapsed } }));
}
/* 五百一十九批：批量启停——本组件即树 owner，直接递归翻所有叶 disabled（与叶级开关
   同走 disabled 字段：ClauseNode 恢复按钮/整行降透明度随之生效），无需绕 TREE_BUS */
function setAllDisabled(disabled: boolean) {
  const r = props.tree.root;
  if (!r) return;
  const walk = (x: QueryNode): QueryNode => {
    if (x.type === 'bool') return { ...x, children: x.children.map(c => ({ occur: c.occur, node: walk(c.node) })) };
    if (x.type === 'wrap') return { ...x, child: x.child ? walk(x.child) : null };
    return { ...x, disabled };
  };
  setRoot(walk(r));
}

const isPlainMatchAll = computed(() => {
  const r = props.tree.root;
  return !!r && r.type === 'leaf' && r.op === 'match_all' && !Object.keys((r as LeafNode).params).length;
});

function setRoot(root: QueryNode) {
  if (root.type === 'bool' && !root.children.length) root = matchAllLeaf();
  emit('update:tree', { ...props.tree, root });
}
function onRootUpdate(n: QueryNode) { setRoot(n); }
function onRootRemove() { setRoot(matchAllLeaf()); }
function wrapRoot() { if (props.tree.root) setRoot(wrapInBool(props.tree.root, props.tree.root.id)); }

/* ═══ 复制：node 深拷贝 + id 全部重新 nid() + 插到原节点之后 ═══
   父 bool 命中 → 同 occur 分区原位后插；root 命中（单条件/根组复制）→ 包一层 bool.must。 */
function cloneNode(n: QueryNode): QueryNode {
  const fresh = JSON.parse(JSON.stringify(n)) as QueryNode;   // params/raw/value 均为 JSON 形态
  const reid = (x: QueryNode): QueryNode => {
    const id = nid();
    if (x.type === 'bool') return { ...x, id, children: x.children.map(c => ({ occur: c.occur, node: reid(c.node) })) };
    if (x.type === 'wrap') return { ...x, id, child: x.child ? reid(x.child) : null };
    return { ...x, id };
  };
  return reid(fresh);
}
function insertAfter(root: QueryNode, id: string): QueryNode {
  if (root.type === 'bool') {
    const idx = root.children.findIndex(c => c.node.id === id);
    if (idx >= 0) {
      const src = root.children[idx];
      const children = [...root.children.slice(0, idx + 1), { occur: src.occur, node: cloneNode(src.node) }, ...root.children.slice(idx + 1)];
      return { ...root, children };
    }
    return { ...root, children: root.children.map(c => ({ occur: c.occur, node: insertAfter(c.node, id) })) };
  }
  if (root.type === 'wrap' && root.child) return { ...root, child: insertAfter(root.child, id) };
  return root;
}
function onDuplicate(id: string) {
  const r = props.tree.root;
  if (!r) return;
  if (r.id === id) {
    const g: BoolNode = {
      id: nid(), type: 'bool',
      children: [{ occur: 'must', node: r }, { occur: 'must', node: cloneNode(r) }],
      params: {}, arrForm: { must: true },
    };
    setRoot(g);
    return;
  }
  setRoot(insertAfter(r, id));
}

function addFirst() {
  const g: BoolNode = {
    id: nid(), type: 'bool',
    children: [{ occur: 'must', node: defaultLeaf() }], params: {}, arrForm: { must: true },
  };
  setRoot(g);
}
function addSibling() {
  const r = props.tree.root;
  if (!r) return addFirst();
  const g: BoolNode = {
    id: nid(), type: 'bool',
    children: [{ occur: 'must', node: r }, { occur: 'must', node: defaultLeaf() }],
    params: {}, arrForm: { must: true },
  };
  setRoot(g);
}

provide(TREE_BUS, {
  move(dragId, targetBoolId, occur) {
    const r = props.tree.root;
    if (!r) return;
    setRoot(moveNode(r, dragId, targetBoolId, occur));
  },
  toggleDisabled(leafId, disabled) {
    const r = props.tree.root;
    if (!r) return;
    setRoot(updateNodeById(r, leafId, n => (n.type === 'leaf' ? { ...n, disabled } : n)));
  },
});
</script>

<style scoped>
.qtp { font-size: var(--fs-sm); }
/* 面板头部计数徽标（chip.static 弱化档）+ 工具行（五百一十九批：过滤输入/折叠/启停按钮）。
   五百五十三批：行布局对齐 DQ 执行行（.dq-run-row 同式）——--ctl-h: 26px 控制线，
   输入框与按钮统一消费；间距 var(--sp-*) */
.qtp-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1); flex-wrap: wrap; --ctl-h: 26px; }
.qtp-hd .btn { height: var(--ctl-h); }
/* 五百五十三批：chip 形态（bg2 底/line 边/字重 500/tabular-nums）归全局 .chip 单源，
   本处只压小档字号；hot 档 warn 底色+描边随 chip 边框语言 */
.qtp-cnt { font-size: var(--fs-2xs); }
/* 五百一十九批：N>10 警示色档（warn 系变量，黄点语义=条件树偏大需留意） */
.qtp-cnt.hot { color: var(--warn); background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
/* 五百五十三批：条件搜索定位（SearchFilterBar 第四胞胎）——壳三件套（panel 底/border-subtle
   弱边/8px 圆角）归组件单源，本处只落位：宽度放宽 110→150、26px 控制线、内衬 var(--sp-*)；
   focus 态 accent 边对齐 theme.css .inp:focus 范式（组件单源不动，视图侧补） */
.qtp-find { width: 150px; height: var(--ctl-h); flex: none; padding: var(--sp-0) var(--sp-2); }
.qtp-find:focus-within { border-color: var(--ac-line); box-shadow: var(--focus-ring); }
/* 【W3b】命中计数 N/M（chip.static 弱化档，压小档字号与计数徽标同形） */
.qtp-find-nav { font-size: var(--fs-2xs); }
/* 五百一十九批：命中条件行柔底（:deep 穿透递归子组件；3 类选择器压过 ClauseNode .cn:hover 的 2 类） */
.qtp :deep(.cn.qtp-hit) { background: var(--ac-soft); }
/* 【W3b】当前命中加重档：品牌色内描边（inset 不抖布局），柔底保留 */
.qtp :deep(.cn.qtp-hit-cur) { background: var(--ac-soft); box-shadow: inset 0 0 0 1px var(--ac); }
.qtp-stale { padding: var(--sp-2); margin-bottom: var(--sp-2); border: 1px solid var(--warn); border-radius: var(--r-s); background: var(--warn-soft); color: var(--warn); font-size: var(--fs-xs); }
/* R125 v3.1 空态：漏斗插画+光晕（品牌渐变方块+白漏斗），居中引导 */
.qtp-none { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--sp-0);
  padding: var(--sp-5) var(--sp-3) var(--sp-4); border: 1.5px dashed var(--line); border-radius: var(--r-l);
  background: radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--brand) 6%, transparent), transparent 60%); }
.qtp-funnel { width: 44px; height: 44px; border-radius: var(--r-l); margin-bottom: var(--sp-2);
  display: flex; align-items: center; justify-content: center;
  /* 五百四十八批：SVG stroke 收 currentColor，图标本体色走这里的 color——漏斗坐在品牌渐变徽标上，
   * 恒白（不取 --tx-on-strong：该 token 暗色下是深字，会翻转既有白图标视觉；浅色下徽标底色已随
   * --ac 加深一档，白图标对比在案）。替换前为 SVG 属性硬编码白描边（#fff），浅色主题同底色渲染不变 */
  color: #fff;
  background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 80%, #000));
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--brand) 55%, transparent), inset 0 1px 0 rgba(255,255,255,.35); }
.qtp-funnel svg { width: 22px; height: 22px; }
.qtp-funnel-t1 { font-weight: 650; font-size: var(--fs-md); color: var(--tx0); }
.qtp-funnel-t2 { font-size: var(--fs-xs); color: var(--tx2); margin-top: var(--sp-0); }
.qtp-funnel-act { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); }
.qtp-single-bar { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-0); }
.qtp-single-tx { font-size: var(--fs-xs); color: var(--tx2); }
/* stale 冻结：整面板禁交互——与「冻结」文案语义一致，
   防树编辑以冻结旧树覆盖用户正在修正的 DSL（Monaco setValue 会清 undo 栈，覆盖不可逆）。
   .qtp-none/.qtp-single-bar 一并冻结：stale 时「加查询条件」同样会覆盖手改。 */
.qtp.froz .bgn, .qtp.froz .cn, .qtp.froz .gn, .qtp.froz .wnr, .qtp.froz .rx,
.qtp.froz .qtp-none, .qtp.froz .qtp-single-bar { pointer-events: none; opacity: .55; }
/* 五百一十九批：头部工具（过滤/折叠/启停）一并冻结——「停用全部」会写树，冻结期覆盖手改不可逆 */
.qtp.froz .qtp-hd { pointer-events: none; opacity: .55; }
</style>
