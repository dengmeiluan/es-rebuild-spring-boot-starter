<template>
  <div class="fs" ref="rootEl">
    <input
      class="inp fs-inp mono" :value="modelValue" :placeholder="placeholder || '选字段…'"
      spellcheck="false" autocomplete="off" role="combobox" aria-autocomplete="list"
      :aria-expanded="open ? 'true' : 'false'" :aria-controls="listId"
      :aria-activedescendant="open && flat[cursor] ? itemId(cursor) : undefined"
      @input="onInput" @focus="openPanel" @keydown="onFsKey"
    />
    <!-- 987 未知字段护栏：mapping 在场时手输不在 mapping 的字段给黄点提示（ClauseNode
     .cn-owarn 同语言）。零降级：无 mapping（fields 空）不提示——自由手输是既有合法路径 -->
    <i v-if="unknownField" class="fs-unk" title="字段不在当前索引 mapping：可能是嵌套路径、别名或脚本字段；若非刻意请核对拼写或切换索引">字段不在 mapping</i>
    <!-- 弹层 teleport 到 body + fixed 定位——构建器面板（.dq-tree）带 overflow-y:auto，
 absolute 弹层会被面板边界裁剪。骨架（↑↓/Enter/Home/End 键盘导航、IME isComposing 守卫、
 防溢出钳位 place()、点击外部关闭）由 usePopupList 承载——与 FieldPicker 同一代体验；
 本组件只留数据源（rank 排序/类型分组/mark 切分收口 src/utils/fieldSearch.ts）与行渲染 -->
    <Teleport to="body">
      <div v-if="open" class="fs-pop float-pop" :style="popStyle" @mousedown.prevent.stop>
        <div v-if="!fields.length" class="fs-hint">暂无字段清单，可自由手输</div>
        <div v-else-if="!flat.length" class="fs-hint">没有匹配「{{ modelValue }}」的字段（仍可手输）</div>
        <div v-else class="fs-list" ref="listEl" role="listbox" :id="listId" @scroll="onScroll">
          <!-- 1004：候选虚拟列表——超大索引几千字段时全量进 DOM 会卡死弹层。
               统一行高（ROW_H）+ 上下占位垫片 + 可视区窗口渲染：rank/分组/键盘导航/aria
               语义不变（aria-setsize/posinset 补全窗口化下的列表盒语义），光标移动时
               窗口跟随（见 watch(cursor)），小列表窗口全覆盖=DOM 与旧全量渲染一致 -->
          <div :style="{ height: winStart * ROW_H + 'px' }" aria-hidden="true"></div>
          <!-- 类型分组标签行不进候选集（cursor/Enter 按 flat 索引导航，标签混进候选集会错位高亮） -->
          <template v-for="r in winRows" :key="r.gh !== undefined ? 'gh' + r.gh + r.first : r.hit!.path">
            <div v-if="r.gh !== undefined" class="fs-gh mono" role="presentation">{{ r.gh }}</div>
            <div
              v-else class="fs-item" :class="{ act: r.hit!.i === cursor }"
              role="option" :id="itemId(r.hit!.i)" :aria-selected="r.hit!.i === cursor"
              :aria-setsize="flat.length" :aria-posinset="r.hit!.i + 1" tabindex="-1"
              @mouseenter="cursor = r.hit!.i" @click="pick(r.hit!)" @keydown.enter.prevent="pick(r.hit!)"
            >
              <!-- 类型徽标挂全站色卡 .mft-type（theme.css），删局部四类型撞色规则 -->
              <span v-if="r.hit!.type" class="fs-ty mono mft-type" :data-t="r.hit!.type">{{ r.hit!.type }}</span>
              <!-- 近似候选徽标（548 C fuzzy 零命中纠错标记，与 LuceneInput 同文案） -->
              <i v-if="r.hit!.fuzzy" class="fs-fuzzy">近似</i>
              <!-- 输入命中 <mark>：按切分片段渲染，不开 v-html 注入面（同 MarkText 手法） -->
              <span class="fs-nm mono"><template v-for="(sg, si) in r.hit!.segs" :key="si"><mark v-if="sg.m">{{ sg.t }}</mark><template v-else>{{ sg.t }}</template></template></span>
            </div>
          </template>
          <div :style="{ height: Math.max(0, (rows.length - winStart - winRows.length) * ROW_H) + 'px' }" aria-hidden="true"></div>
        </div>
        <div v-if="flat.length" class="fs-ft">
          <span>{{ flat.length }} 个匹配</span>
          <span class="fs-keys"><kbd class="kbd">↑↓</kbd> 选择 <kbd class="kbd">Enter</kbd> 确认 <kbd class="kbd">Esc</kbd> 关闭</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/* 换代：字段选择器对齐 FieldPicker 同一代骨架（usePopupList）+ 同源搜索内核（fieldSearch.ts）——
 rank 排序（精确>前缀>包含）、类型分组+组头、data-t 三色类型徽标、输入 <mark> 高亮、
 候选计数与 cap 提示。零降级保留：mapping 缺失 fields 为空时输入框仍可自由手输。
 最近使用升级 per-index（key 拼当前索引，读不到回退全局），且选中字段回写记忆。 */
import { computed, nextTick, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { usePopupList } from '../../composables/usePopupList';
import { useTermsSuggest } from '../../composables/useTermsSuggest';
import {
  searchFields, groupByLabel, type FieldHit,
  loadRecentFields, rememberRecentField, curFieldSearchIndex,
  getFieldSearchUsedFields,
} from '../../utils/fieldSearch';
import { KEYWORD_VALUE_TYPES } from '../../utils/sqlCompletion';

/* 补 typeFilter/typePriority 两个可选 props 透传 fieldSearch.searchFields
 （类型过滤/智能置顶排序，与 FieldPicker 同名语义对齐）；默认 undefined = 现状零增量 */
const props = defineProps<{
  modelValue: string; fields: string[]; types: Record<string, string>; placeholder?: string;
  /** 只列这些类型；空/缺省 = 全部 */
  typeFilter?: string[];
  /** 命中这些类型的字段分组排前；空/缺省 = 纯 rank+字母序 */
  typePriority?: string[];
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

/* 1004：候选虚拟列表——扫描上限放大到全量（超大索引几千字段可滚动浏览全部匹配），
   DOM 只渲染可视区窗口（统一行高 ROW_H + 上下垫片）；rank/分组/键盘导航语义不变。
   小列表窗口全覆盖 = DOM 与旧全量渲染一致（既有契约零变化） */
const SCAN_CAP = 20000;
const ROW_H = 28;        /* 统一行高（候选项与组头一致——虚拟滚动偏移计算前提） */
const VIEW_H = 240;      /* 与 .fs-list max-height 同值 */
const WIN_PAD = 8;       /* 窗口上下缓冲行数（滚动方向预渲染，避免快速滚动闪白） */

/* 未知字段护栏判定：mapping 有字段集、输入非空、且不在集内。typing 中间态也会亮——
 黄点是弱提示不阻断（仍可手输提交），比「候选空但仍可手输」的纯静默多一层护栏 */
const unknownField = computed(() =>
  !!props.modelValue && props.fields.length > 0 && !props.fields.includes(props.modelValue));

/* 过滤+rank 排序+cap 收口 fieldSearch；最近使用（per-index）中命中当前搜索的置顶 */
const res = computed(() => {
  /* typeFilter/typePriority 透传 searchFields；prio 空数组必须归一为 null
 （groupByLabel 里 [] 是 truthy，会把全部类型打成「其他」） */
  const prio = props.typePriority?.length ? props.typePriority : null;
  const s = searchFields({
    fields: props.fields.map(f => ({ path: f, type: props.types[f] || '' })),
    query: props.modelValue || '',
    cap: SCAN_CAP,
    typeFilter: props.typeFilter,
    typePriority: props.typePriority,
  });
  /* recent 段之后再前置「树内已用」命中段——上下文智能排序：
 recent 段式全前置（既有行为不动）；used 在其余候选里做「rank 不变、同 rank 内前置」
 （稳定排序不打乱 rank 档与字母序，只把 used 提到同档最前——输入过滤时不让包含命中
 压过精确命中）。prio 模式下 used 只在所属类型分组的组内前置（组键=分组段+类型序），
 typePriority 组序完整性不破（任务四口径）。段间去重不重复出项。
 重排后统一重编 i：cursor/act/aria-activedescendant 按 flat 数组下标导航，i 必须与下标
 一致（recent/used 段插入后原 i 会错位高亮）。 */
  const rec = loadRecentFields(curFieldSearchIndex());
  const used = getFieldSearchUsedFields();
  const isUsed = (h: FieldHit) => used.includes(h.path);
  const prioSeg = (h: FieldHit) => (prio && !prio.includes(h.type) ? 1 : 0);
  const prioIdx = (h: FieldHit) => (prio ? prio.indexOf(h.type) : 0);
  const rest = s.flat
    .filter(h => !rec.includes(h.path))
    .slice()
    .sort((a, b) =>
      prioSeg(a) - prioSeg(b)
      || (prio ? prioIdx(a) - prioIdx(b) : a.rank - b.rank)
      || (isUsed(b) ? 1 : 0) - (isUsed(a) ? 1 : 0));
  const flat = [
    ...rec.map(f => s.flat.find(h => h.path === f)).filter((h): h is FieldHit => !!h),
    ...rest,
  ].map((h, i) => (h.i === i ? h : { ...h, i }));
  return { total: s.total, capped: s.capped, flat, groups: groupByLabel(flat, prio) };
});
const flat = computed(() => res.value.flat);

type FsRow = { gh?: string; hit?: FieldHit; first?: number };
const rows = computed<FsRow[]>(() => {
  const out: FsRow[] = [];
  res.value.groups.forEach(g => {
    out.push({ gh: g.label, first: g.hits[0]?.i });
    g.hits.forEach(h => out.push({ hit: h }));
  });
  return out;
});

/* ═══ 1004：可视区窗口渲染 ═══ 垫片撑总高、窗口切片出 DOM；光标移动时窗口跟随并滚动，
   键盘 ↑↓/Home/End 与 hover 全走 cursor 单源（watch 收敛，不逐键位挂钩） */
const scrollTop = ref(0);
function onScroll(e: Event) { scrollTop.value = (e.target as HTMLElement).scrollTop; }
const winStart = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_H) - WIN_PAD));
const winRows = computed(() =>
  rows.value.slice(winStart.value, winStart.value + Math.ceil(VIEW_H / ROW_H) + WIN_PAD * 2));
const rowOfItem = computed(() => {
  const m = new Map<number, number>();
  rows.value.forEach((r, ri) => { if (r.hit) m.set(r.hit.i, ri); });
  return m;
});

const {
  open, cursor, popStyle, listId, itemId, rootEl, listEl, openPanel, close, onKey,
} = usePopupList<FieldHit>({
  items: () => res.value.flat,
  onChoose: h => pick(h),
  to: () => 'body',
  idPrefix: 'fs',
  activeSelector: '.fs-item.act',
  place: { minWidth: 220, flipBelow: 240, flipTop: 260 },
});

/* 1004：光标窗口跟随——键盘 ↑↓/Home/End 与 hover 全走 cursor 单源，在此收敛：
   目标行在缓冲带外 → 居中滚动（scrollTop 变更驱动 winRows 重算）→ 渲染后再滚屏到位 */
watch(cursor, async ri => {
  const row = rowOfItem.value.get(ri);
  if (row === undefined) return;
  const top = row * ROW_H;
  const st = scrollTop.value;
  if (top < st + ROW_H * 2 || top + ROW_H > st + VIEW_H - ROW_H * 2) {
    if (listEl.value) listEl.value.scrollTop = Math.max(0, top - Math.floor((VIEW_H - ROW_H) / 2));
    scrollTop.value = listEl.value?.scrollTop ?? 0;
  }
  await nextTick();
  scrollCur();
});

/* Home/End 首尾跳（骨架不含，本组件补齐；滚屏用自家 activeSelector） */
function scrollCur() {
  nextTick(() => listEl.value?.querySelector('.fs-item.act')?.scrollIntoView({ block: 'nearest' }));
}
function onFsKey(e: KeyboardEvent) {
  if (!e.isComposing && open.value && (e.key === 'Home' || e.key === 'End')) {
    e.preventDefault();
    cursor.value = e.key === 'Home' ? 0 : Math.max(0, res.value.flat.length - 1);
    scrollCur();
    return;
  }
  onKey(e);
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
  cursor.value = 0;
  if (!open.value) openPanel();
}

/* keyword 族字段选中即空前缀预载 terms-agg top20（LuceneInput.choose 551 同范式；
 模块级 TTL 缓存被后续值位消费方白得——ClauseNode datalist prime / LuceneInput 值段任意
 前缀 548 A2 宽前缀本地滤）。护栏：useTermsSuggest 内部依赖 pinia——裸挂载无 pinia 静默闸
 关闭零动作（qhStore 同款形态）；索引语境读 fieldSearch 模块态 curFieldSearchIndex（本组件
 无 index prop，QueryTreePane/RootExtrasPane 写入既有先例），缺席时 suggest 空参早退零请求。
 第二参 types 接 props.types——候选展示值按 rankTermsByType 类型精化排序
 （ LuceneInput 等三处同范式；五消费面接线至此收口） */
const valSuggest = getActivePinia() ? useTermsSuggest(curFieldSearchIndex, () => props.types) : null;

function pick(h: FieldHit) {
  rememberRecentField(curFieldSearchIndex(), h.path);
  if (valSuggest && KEYWORD_VALUE_TYPES.includes(h.type)) valSuggest.suggest(h.path, '');
  emit('update:modelValue', h.path);
  close();
}
</script>

<style scoped>
.fs { position: relative; display: inline-block; min-width: 130px; }
.fs-inp { width: 100%; height: 30px; font-size: var(--fs-sm); padding: 3px var(--sp-2); }
/* 未知字段护栏黄点（右缘内侧，弱提示不遮值）：warn 底圆点 + title 全语义（.cn-owarn 同语言） */
.fs-unk { position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  width: 8px; height: 8px; border-radius: 50%; background: var(--warn);
  box-shadow: 0 0 0 3px var(--warn-soft); cursor: help; pointer-events: auto; }
.fs-inp:not(:placeholder-shown) { padding-right: 18px; }
/* v3.1: 聚焦品牌描边+3px 柔光（--brand/--card theme.css 均有定义，删永不生效的 fallback 字面） */
.fs-inp:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 14%, transparent); background: var(--card); }
/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号 */
.fs-pop { overflow: hidden; font-size: var(--fs-sm); }
.fs-list { max-height: 240px; overflow: auto; }
.fs-hint { padding: var(--sp-3); color: var(--muted); }
/* 类型分组标签行（与 FieldPicker .fxp-gh 同款）；1004 统一行高=虚拟滚动偏移前提 */
.fs-gh { display: flex; align-items: center; height: 28px; padding: 0 var(--sp-2h); font-size: var(--fs-2xs); color: var(--muted); letter-spacing: .04em; user-select: none; }
.fs-item { display: flex; align-items: center; gap: var(--sp-2); height: 28px; padding: 0 var(--sp-3); cursor: pointer; }
.fs-item:hover, .fs-item.act { background: var(--hover); }
.fs-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-nm mark { background: none; color: var(--acc); font-weight: 600; }
/* 类型徽标色统一 theme.css 全站 .mft-type[data-t] 色卡（本文件原局部四类型规则已删）；
 冷门类型回落档走 :where（specificity 0），色卡命中时必胜（同 FieldPicker 口径） */
.fs-ty { flex: none; min-width: 52px; text-align: center; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; }
:where(.fs-ty) { color: var(--muted); background: var(--hl); }
/* 近似候选徽标（548 C fuzzy，FieldHit 经 flat 重排 spread 原样透传） */
.fs-fuzzy { font-size: var(--fs-2xs); color: var(--warn); font-style: normal; margin-left: var(--sp-1); }
.fs-ft { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2h); border-top: 1px solid var(--line); color: var(--muted); font-size: var(--fs-2xs); }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
