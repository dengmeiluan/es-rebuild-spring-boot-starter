<template>
  <div class="cn" draggable="true"
       :style="node.disabled ? { opacity: .45 } : undefined"
       @dragstart.stop="onDragStart" @dragend="endDrag">
    <button v-if="node.disabled" aria-label="恢复参与匹配" class="btn xs ghost cn-pw-resume"
            title="该条件已临时停用，点击恢复参与匹配" style="color: var(--ok); flex-shrink: 0" @click="toggleDisabled(false)">
      <Circle :size="15" />
    </button>
    <button v-else aria-label="临时停用（不参与匹配）" class="btn xs ghost cn-pw"
            title="临时停用该条件（不删除、不参与本次匹配），点击可恢复" style="color: var(--warn); flex-shrink: 0" @click="toggleDisabled(true)">
      <CircleSlash :size="15" />
    </button>
    <span class="cn-grip" title="拖拽">⋮⋮</span>
    <FieldSelect
      :model-value="node.field || ''" :fields="fields" :types="types" :type-priority="fieldTypePriority"
      @update:model-value="onField"
    />
    <!-- 字段类型徽标 + 类型提示 tooltip（零结构改动的类型教育）：keyword→term 精确、
         text→match 全文、数值/date→range 范围；mapping 缺失（types 无此字段）不渲染，零降级 -->
    <!-- 类型徽标挂全站色卡 .mft-type（theme.css），删局部三类型撞色规则 -->
    <span v-if="fieldType" class="cn-fty mono mft-type" :data-t="fieldType" :title="typeHint">{{ fieldType }}</span>
    <select class="inp cn-op" :value="node.op" @change="onOp(($event.target as HTMLSelectElement).value)">
      <optgroup label="推荐">
        <option v-for="o in recommended" :key="'r' + o" :value="o">{{ label(o) }}</option>
      </optgroup>
      <optgroup label="全部">
        <option v-for="o in restOps" :key="'a' + o" :value="o">{{ label(o) }}</option>
      </optgroup>
    </select>

    <!-- 值控件：按算子形态分派 -->
    <template v-if="node.op === 'exists' || node.op === 'match_all' || node.op === 'match_none'">
      <span class="cn-na">（无值）</span>
    </template>
    <template v-else-if="node.op === 'range'">
      <!-- 【W3b】四操作符齐备（ES range 合法键 gte/gt/lte/lt，与 dslLint RANGE_OPS 同口径）：
           开区间 > gt / < lt 此前打不出来，用户只能去手改 DSL。
           四 input 按字段类型挂 datalist 形态提示（date→date-math、数值→字面、
           ip→CIDR；datalist 只提示不约束输入，keyword 等无形态档字段不挂） -->
      <input class="inp cn-val cn-range mono" :value="rangePart('gte')" placeholder="≥ gte" :list="rangeDlId" @input="setRange('gte', ($event.target as HTMLInputElement).value)" />
      <input class="inp cn-val cn-range mono" :value="rangePart('lte')" placeholder="≤ lte" :list="rangeDlId" @input="setRange('lte', ($event.target as HTMLInputElement).value)" />
      <input class="inp cn-val cn-range mono" :value="rangePart('gt')" placeholder="> gt" :list="rangeDlId" @input="setRange('gt', ($event.target as HTMLInputElement).value)" />
      <input class="inp cn-val cn-range mono" :value="rangePart('lt')" placeholder="< lt" :list="rangeDlId" @input="setRange('lt', ($event.target as HTMLInputElement).value)" />
      <!-- range 形态档 datalist（rangeHints 按字段类型分派；空档不挂零增量） -->
      <datalist v-if="rangeHints.length" :id="rangeDlId">
        <option v-for="h in rangeHints" :key="h" :value="h" />
      </datalist>
      <!-- range 打在 keyword/wildcard 字段=字典序比较（dslLint keyword-range 规则的交互层等价物）：
           值输入旁黄点警示，title 完整说明 -->
      <span v-if="rangeLexWarn" class="cn-rwarn" role="img" aria-label="keyword 字段的 range 按字典序比较"
            title="keyword 字段的 range 按字典序比较（'100' < '20'）；数值/时间范围建议改用对应类型字段" />
    </template>
    <!-- 【W3b】boolean 字段 + term：三态 select（true/false/空）替代裸文本输入——
         true/false 直接可选不再手打，选「（空）」= 删除该条件（无值的 term 无语义） -->
    <select
      v-else-if="isBoolTerm" class="inp cn-val cn-bool mono"
      :value="boolText" title="boolean 字段 term 值三态：true / false；选「（空）」删除该条件"
      @change="onBoolVal(($event.target as HTMLSelectElement).value)"
    >
      <option value="">（空）</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
    <input
      v-else class="inp cn-val mono" :value="valText"
      :placeholder="valPlaceholder"
      :list="valCandidates.length ? valDlId : undefined"
      @focus="primeValAgg"
      @input="onValue(($event.target as HTMLInputElement).value)"
    />
    <!-- （P1-3a）：term/terms/prefix 值输入候选 datalist——
         起候选双源合并：terms-agg top20（useTermsSuggest，值位聚焦 prime，模块级 TTL
         缓存与 FieldSelect 选中预载共享）+ 跨模式查询历史既有条目里该字段的历史出现值
         （内存态零新增请求依赖），去重后喂同一 datalist。
         护栏：本组件存在无 pinia 的裸挂载环境（clauseNode.spec 单测），getActivePinia 判空
         零降级（qhStore/termCtx 双闸）；候选空（mapping 未载/无历史/无索引语境）静默不挂
         datalist，手输行为零变化 -->
    <datalist v-if="valCandidates.length" :id="valDlId">
      <option v-for="v in valCandidates" :key="v" :value="v" />
    </datalist>
    <!-- 算子×类型错配 / 开头通配符黄点（与 range 字典序黄点同形态，
         title 承载完整说明，友好不阻断）。
         span 升级 button——黄点可点，一键切到该类型推荐首算子（exists 是万能
         兜底不作为「推荐」目标；未知类型 opsForType 只有 exists，点击不动作）。 -->
    <button v-if="rowWarn" type="button" class="cn-owarn" aria-label="改用推荐算子" :title="rowWarn" @click="onOwarnClick" />
    <!-- ⏰ 常驻——此前按字段名正则门控，「不像时间字段」的按钮直接消失，
         placeholder 却承诺「⏰ 转换」，用户找不到入口。常驻后任何字段都可点：
         值能解析成标准时间才转换，解析失败保持原值（title 说明适用面）。 -->
    <button aria-label="标准时间转时间戳" class="btn sm ghost"
            title="⏰ 把标准时间（YYYY-MM-DD HH:mm[:ss]）转成 epoch 毫秒；值不是标准时间格式时点击不变"
            @click="convertStdTime">
      <Clock :size="12" />
    </button>

    <!-- 具名参数（schema 内）+ 更多参数入口 -->
    <button aria-label="参数（boost/operator…）" v-if="hasParams" class="btn sm ghost" title="参数（boost/operator…）" @click="paramsOpen = !paramsOpen">
      <Settings2 :size="12" />
    </button>
    <div v-if="paramsOpen" class="cn-params">
      <GenericParams :value="node.params" :schema="paramSchema" @update="onParams" />
    </div>

    <button aria-label="复制条件" class="btn sm ghost" title="复制条件（插到本条件之后）" @click="$emit('duplicate', node.id)"><Copy :size="12" /></button>
    <button aria-label="包成 bool 组" class="btn sm ghost" title="包成 bool 组" @click="$emit('wrap')"><Group :size="12" /></button>
    <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="$emit('remove')"><X :size="12" /></button>
    <!-- 换字段算子被静默替换时的行内微提示（2.5s 后淡出）——aria-live 播报，不弹全局 toast -->
    <span v-if="nudge" class="cn-nudge" :class="{ out: nudgeOut }" role="status" aria-live="polite">{{ nudge }}</span>
  </div>
</template>

<script setup lang="ts">
/* W1：富表单条件行。不可变更新：所有变更 emit 新 LeafNode，由父级替换——
   同步引擎依赖引用变化触发序列化。 */
import { ref, computed, inject, onBeforeUnmount, watch } from 'vue';
import { Clock, X, Settings2, Group, Circle, CircleSlash, Copy } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import GenericParams from './GenericParams.vue';
import { stdTimeToEpochMs } from '../../utils/format';
import { DRAG_KEY, TREE_BUS, fireDrag } from './treeBus';
import { OPS_META, opsForType, RICH_OPS, typePriorityForOp, NUMERIC_VALUE_TYPES } from '../../utils/queryAstOps';
import type { LeafNode } from '../../utils/queryAst';

const props = defineProps<{ node: LeafNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{
  (e: 'update:node', n: LeafNode): void;
  (e: 'remove'): void;
  (e: 'wrap'): void;
  (e: 'duplicate', id: string): void;
}>();
/* 参与开关走 TREE_BUS 直达树 owner（QueryTreePane 统一 updateNodeById）——
   首版 emit('toggle-disabled') 无任何层监听，事件发出去即丢，开关点了没反应 */
const bus = inject(TREE_BUS, null);
const toggleDisabled = (v: boolean) => bus?.toggleDisabled(props.node.id, v);

const paramsOpen = ref(false);
const label = (op: string) => OPS_META[op]?.label || op;
const recommended = computed(() => opsForType(props.types[props.node.field || '']));
const restOps = computed(() => RICH_OPS.filter(o => OPS_META[o].form === 'field' && !recommended.value.includes(o)));
const paramSchema = computed(() => OPS_META[props.node.op]?.params || []);
const hasParams = computed(() => paramSchema.value.length > 0 || Object.keys(props.node.params).length > 0);

/* ═══ 字段类型匹配：徽标 tooltip + 值输入 placeholder 按类型给形态提示 ═══
   操作符侧的类型匹配已由 onField/opsForType 承担（换字段自动回落该类型首算子）；
   这里补输入侧教育：选定字段后输入什么形态的值、该用哪类算子。mapping 缺失全回落现状文案。 */
const NUMERIC_TYPES = ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float'];
/* 字段候选按算子场景类型置顶（typePriority 只调候选分组排序，不改候选集；
   fields 传参与 dsl-assist 计数链路不动——fieldPickerPenetration 契约）。
   优先序下沉为 queryAstOps.typePriorityForOp（DSL/非 Vue 语境可复用），
   本组件删私藏表直接消费——term/terms/prefix/wildcard 精确语义 keyword 优先、
   range 数值/时间语义 date+数值族优先、其余空数组纯 rank 平铺。 */
const fieldTypePriority = computed<string[]>(() => typePriorityForOp(props.node.op));
const fieldType = computed(() => props.types[props.node.field || ''] || '');
const TYPE_HINTS: Record<string, string> = {
  keyword: 'keyword 字段：建议 term/terms 精确匹配（整串一致，不分词）；match 在 keyword 上等同 term',
  text: 'text 字段：建议 match 全文检索（分词匹配）',
  date: 'date 字段：建议 range 范围；值可用右侧 ⏰ 把标准时间转 epoch 毫秒',
  boolean: 'boolean 字段：值取 true / false，用 term 精确匹配',
  ip: 'ip 字段：term 精确匹配或 range 网段范围',
  /* 补 wildcard 类型词条（此前该类型回落「wildcard 字段」裸文案） */
  wildcard: 'wildcard 字段：建议 term 精确或 wildcard 通配（* ? 匹配；开头通配会全表扫描）',
};
const typeHint = computed(() => {
  const t = fieldType.value;
  if (!t) return '';
  if (TYPE_HINTS[t]) return TYPE_HINTS[t];
  if (NUMERIC_TYPES.includes(t)) return `数值字段（${t}）：建议 term/terms 精确或 range 范围比较`;
  return `${t} 字段`;
});
const valPlaceholder = computed(() => {
  if (props.node.op === 'terms') return '逗号分隔多值';   // 多值语义优先于字段类型
  const t = fieldType.value;
  if (t === 'date') return '日期或 epoch 毫秒（⏰ 可转换）';
  if (NUMERIC_TYPES.includes(t)) return '数值，如 ≥ 100';
  if (t === 'boolean') return 'true / false';
  /* 【W3b】补 ip 分支（TYPE_HINTS 已有 ip 词条，值位此前漏配回落通用文案） */
  if (t === 'ip') return 'IP 或 CIDR 网段（如 192.168.0.0/16）';
  if (t === 'keyword') return '精确值（整串一致）';
  if (t === 'text') return '关键词（分词匹配）';
  return '值（时间字段可用 ⏰ 转换）';   // 未知类型/无 mapping：现状文案零降级
});

/* 【W3b】boolean 字段 + term：三态值控件（true/false/空）。空=删键——无值的 term 无查询语义，
   选「（空）」直接删除该条件（走既有 remove 链，父级 removeNodeById 处理） */
const isBoolTerm = computed(() => props.node.op === 'term' && fieldType.value === 'boolean');
const boolText = computed(() =>
  props.node.value === true ? 'true' : props.node.value === false ? 'false' : '');
function onBoolVal(v: string) {
  if (v === '') { emit('remove'); return; }
  patch({ value: v === 'true' });
}

function patch(p: Partial<LeafNode>) { emit('update:node', { ...props.node, ...p }); }
/* params 恒为对象：GenericParams 的 update 联合类型在此收窄（数组分支不会出现，守卫兜底） */
function onParams(v: Record<string, unknown> | unknown[]) { if (!Array.isArray(v)) patch({ params: v }); }

/* 换字段时算子不兼容会被静默换成 allowed[0]——此时行内闪现微提示告知用户换了什么
   （dslLint 静默换算子坑的交互层补救）。2.5s 后开始淡出（opacity 过渡），3.0s 后移除 DOM；
   happy-dom 无 transitionend，用双 timer 而非 Vue Transition，测试可走 fake timers。 */
const nudge = ref('');
const nudgeOut = ref(false);
let nudgeT1: ReturnType<typeof setTimeout> | undefined;
let nudgeT2: ReturnType<typeof setTimeout> | undefined;
function showNudge(msg: string) {
  nudge.value = msg; nudgeOut.value = false;
  clearTimeout(nudgeT1); clearTimeout(nudgeT2);
  nudgeT1 = setTimeout(() => { nudgeOut.value = true; }, 2500);
  nudgeT2 = setTimeout(() => { nudge.value = ''; }, 3000);
}
onBeforeUnmount(() => { clearTimeout(nudgeT1); clearTimeout(nudgeT2); });

function onField(field: string) {
  const allowed = opsForType(props.types[field]);
  const nextOp = allowed.includes(props.node.op) ? props.node.op : allowed[0];
  if (nextOp !== props.node.op) {
    const t = props.types[field];
    showNudge(t ? `已按 ${t} 字段切换为「${label(nextOp)}」` : `字段无 mapping，已切换为「${label(nextOp)}」`);
  }
  patch({ field, op: nextOp });
}

/* range-on-keyword：range 打在 keyword/wildcard 字段按字典序比较（'100' < '20'）——
   值输入旁黄点警示（与 dslLint keyword-range 规则同一语义） */
const LEX_ORDER_TYPES = new Set(['keyword', 'wildcard']);
const rangeLexWarn = computed(() => props.node.op === 'range' && LEX_ORDER_TYPES.has(fieldType.value));
/* 手动选算子×字段类型错配提示——onOp 不阻断也不静默替换（与换字段 onField 的
   强制回落不同路径），改在值输入旁黄点+title 微提示（友好不拦截）。兼容判定复用 opsForType
   推荐表（queryAstOps types 组映射）；exists 是万能兜底、match_all/match_none 无字段语义，都豁免。 */
const opMismatchHint = computed(() => {
  const t = fieldType.value;
  const op = props.node.op;
  if (!t || op === 'exists' || op === 'match_all' || op === 'match_none') return '';
  if (opsForType(t).includes(op)) return '';
  /* 建议段用算子 id（与 DSL/下拉 optgroup 语境一致），当前段用中文标签（下拉显示形态） */
  const rec = opsForType(t).filter(o => o !== 'exists').slice(0, 2);
  const sug = rec.length ? rec.join(' / ') + ' / exists' : 'exists';
  return `${t} 字段建议 ${sug}，当前「${label(op)}」可能无结果`;
});
/* prefix/wildcard 值以 * / ? 开头=前缀通配符（dslLint prefix-wildcard 规则的
   交互层等价物）：无法利用倒排索引、全表扫描。结尾通配合法不提示。 */
const prefixStarHint = computed(() => {
  const op = props.node.op;
  if (op !== 'prefix' && op !== 'wildcard') return '';
  const v = props.node.value;
  return typeof v === 'string' && (v.startsWith('*') || v.startsWith('?'))
    ? '开头的 * / ? 无法利用倒排索引、等于全表扫描；建议去掉开头通配符，或改用 match'
    : '';
});
const rowWarn = computed(() => [opMismatchHint.value, prefixStarHint.value].filter(Boolean).join('；'));
/* 黄点一键改推荐算子——取该字段类型推荐首算子（filter 掉万能兜底 exists）。
   错配场景（如 date+term→range）即「改用推荐算子」本义；开头通配场景（keyword+prefix('*x')）
   点击切推荐首算子 term，与 title 的「去掉开头通配符」引导同向。 */
function onOwarnClick() {
  const rec = opsForType(fieldType.value).filter(o => o !== 'exists');
  if (rec.length) onOp(rec[0]);
}
function onOp(op: string) {
  /* 切算子时保留 field/value；range ↔ 标量形态互转时给安全初值 */
  let v = op === 'range'
    ? (props.node.value && typeof props.node.value === 'object' ? props.node.value : {})
    : (props.node.value && typeof props.node.value === 'object' ? '' : props.node.value);
  if (op === 'terms' && !Array.isArray(v)) v = (v === '' || v == null) ? [] : [v];   // terms 只收数组，归一
  patch({ op, value: v });
}
const valText = computed(() =>
  props.node.op === 'terms'
    ? (Array.isArray(props.node.value) ? props.node.value.join(',') : String(props.node.value ?? ''))
    : String(props.node.value ?? ''));
function onValue(raw: string) {
  patch({ value: props.node.op === 'terms' ? raw.split(',').map(s => s.trim()).filter(Boolean) : raw });
}

/* ═══ （P1-3a）：值输入候选（term/terms/prefix keyword 精确语义档）═══
   起候选双源：① terms-agg top20（useTermsSuggest）② 跨模式查询历史（pinia 内存态，
   零新增请求依赖）。历史双形态解析：JSON DSL（"field":"v" / "field":["a","b"]）与 lucene
   （field:v / field:"v"）；a.b 与 a.b.keyword 互认（keyword 子字段与逻辑字段同值域）。
   useIndexFields 只有字段名+类型、无样本值通道（源码实证），静态样本走不了——聚合候选即
   「当前索引真实 top 值」口径。护栏：本组件存在无 pinia 的裸挂载环境（clauseNode.spec 单测），
   getActivePinia 判空零降级（qhStore/termCtx 双闸同款）；store 解析收在 setup 作用域一次。 */
import { getActivePinia } from 'pinia';
import { useQueryHistoryStore } from '../../stores/queryHistory';
import { useTermsSuggest } from '../../composables/useTermsSuggest';
import { curFieldSearchIndex } from '../../utils/fieldSearch';
import { KEYWORD_VALUE_TYPES } from '../../utils/sqlCompletion';
const qhStore = getActivePinia() ? useQueryHistoryStore() : null;
/* terms-agg 值候选源——同 qhStore 静默闸（无 pinia 裸挂载 null 零降级）；索引语境
   读 fieldSearch 模块态 curFieldSearchIndex（QueryTreePane/RootExtrasPane 随自身 index prop
   写入，ClauseNode 深嵌树内无 index prop 可透传，setFieldSearchIndex 既有先例），缺席时
   suggest 空参早退零请求。：第二参 types 接 props.types——datalist 候选按字段类型
   精化排序（三处同范式，五消费面接线至此收口） */
const termCtx = getActivePinia() ? useTermsSuggest(curFieldSearchIndex, () => props.types) : null;
const valDlId = 'cn-dl-' + props.node.id;
/* 值位 terms-agg 聚合字段解析——a.b ↔ a.b.keyword 互认（历史候选同口径），
   取 keyword 族（KEYWORD_VALUE_TYPES 单一出处，sqlCompletion 同源）类型命中的具体路径 */
function kwAggFieldOf(f: string): string {
  const names = f.endsWith('.keyword') ? [f, f.slice(0, -'.keyword'.length)] : [f, f + '.keyword'];
  for (const n of names) {
    const t = props.types[n] || '';
    if (t && KEYWORD_VALUE_TYPES.includes(t)) return n;
  }
  return '';
}
/* 值位候选 prime——值输入聚焦时空前缀拉 terms-agg top20（datalist 由浏览器按已敲
   文本自行过滤，无需按前缀重查；FieldSelect 选中同字段已预热模块级 TTL 缓存 → 此处缓存
   命中零网络白得）。无 pinia/非精确语义档/非 keyword 族字段/无索引语境零动作 */
function primeValAgg() {
  if (!typePriorityForOp(props.node.op).includes('keyword') || !termCtx) return;
  const agg = kwAggFieldOf((props.node.field || '').trim());
  if (agg) termCtx.suggest(agg, '');
}
/* 换字段即 prime——此前仅 @focus 触发，选完字段直接打字/粘贴值就错过预载，
   候选首现要等二次聚焦；watch 同一精确语义档门槛（primeValAgg 内判定），行为白得 */
watch(() => props.node.field, () => primeValAgg());
const valCandidates = computed<string[]>(() => {
  /* 候选档判定随 typePriorityForOp 下沉同源——keyword 优先的算子即精确语义档
     （term/terms/prefix/wildcard），历史值候选与字段候选排序吃同一张表 */
  if (!typePriorityForOp(props.node.op).includes('keyword') || !qhStore) return [];
  const f = (props.node.field || '').trim();
  if (!f) return [];
  const names = f.endsWith('.keyword') ? [f, f.slice(0, -'.keyword'.length)] : [f, f + '.keyword'];
  const cur = String(props.node.value ?? '');
  const out: string[] = [];
  const push = (v: string | undefined) => {
    if (!v) return;
    const t = v.trim();
    if (!t || t === cur || t.includes('*') || t.includes('?')) return; // 通配/当前值不入候选
    if (!out.includes(t)) out.push(t);
  };
  /* terms-agg top20 候选先行（termCtx.suggestions 是本行实例自有态，多行互不串值；
     未 prime/缓存未回时为空，历史候选照出），历史候选续后去重合并 */
  const aggField = kwAggFieldOf(f);
  if (aggField && termCtx) for (const v of termCtx.suggestions.value) push(v);
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const it of qhStore.items) {
      const q = it.query || '';
      if (!q.includes(name)) continue;
      let m: RegExpExecArray | null;
      const reStr = new RegExp('"' + esc + '"\\s*:\\s*"([^"]*)"', 'g');
      while ((m = reStr.exec(q))) push(m[1]);
      const reArr = new RegExp('"' + esc + '"\\s*:\\s*\\[([^\\]]*)\\]', 'g');
      while ((m = reArr.exec(q))) for (const s of m[1].split(',')) push(s.trim().replace(/^"|"$/g, ''));
      if (it.mode === 'lucene') {
        const reLu = new RegExp('(?:^|[\\s+(])' + esc + '\\s*:\\s*(?:"([^"]+)"|([^\\s)()+*~,-]+))', 'g');
        while ((m = reLu.exec(q))) { push(m[1]); push(m[2]); }
      }
      if (out.length >= 20) break;
    }
    if (out.length >= 20) break;
  }
  return out.slice(0, 20);
});
/* 标准时间(YYYY-MM-DD[ HH:mm[:ss]])→ epoch 毫秒——时间戳整型存储的时间字段用它匹配 */
function convertStdTime() {
  const ms = stdTimeToEpochMs(valText.value);
  if (ms != null) onValue(String(ms));
}
/* 【W3b】range 四操作符（gte/gt/lte/lt，与 dslLint RANGE_OPS 同口径） */
type RangeOp = 'gte' | 'lte' | 'gt' | 'lt';
function rangePart(k: RangeOp): string {
  const v = props.node.value as any;
  return v && typeof v === 'object' && v[k] !== undefined ? String(v[k]) : '';
}
function setRange(k: RangeOp, raw: string) {
  const cur = props.node.value as any;
  const next: Record<string, unknown> = cur && typeof cur === 'object' ? { ...cur } : {};
  if (raw === '') delete next[k]; else next[k] = raw;
  patch({ value: next });
}
/* range 值位形态 datalist（按字段类型分派，只提示格式不约束输入）——
   date 族 date-math（dslCompletionContext RANGE_OPS 骨架同形）、数值族字面示例、
   ip CIDR 网段；keyword 等无形态档字段空数组不挂 datalist（零增量） */
const rangeDlId = 'cn-rg-' + props.node.id;
const rangeHints = computed<string[]>(() => {
  const t = fieldType.value;
  if (t === 'date' || t === 'date_nanos') return ['now-1d/d', 'now-1h/h'];
  if (NUMERIC_VALUE_TYPES.includes(t)) return ['100'];
  if (t === 'ip') return ['10.0.0.0/24'];
  return [];
});

function onDragStart(e: DragEvent) {
  (window as any)[DRAG_KEY] = props.node.id;
  e.dataTransfer?.setData('text/plain', props.node.id);
  fireDrag(true);
}
function endDrag() { delete (window as any)[DRAG_KEY]; fireDrag(false); }
</script>

<style scoped>
/*  v3.1 条件行：hover 浅底浮现；工具钮 hover/focus 显现，⏰/参与开关常亮；
   深嵌套无卡片（无边框行），字段聚焦品牌描边+柔光由 FieldSelect 内部处理 */
.cn { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-m); margin-bottom: var(--sp-0); position: relative; transition: background var(--tr); }
.cn:hover { background: var(--bg2); }
.cn-pw { flex-shrink: 0; color: var(--tx2); }
.cn-pw:hover { color: var(--tx0); }
.cn-grip { cursor: grab; color: var(--tx2); font-size: var(--fs-xs); user-select: none; transition: color var(--tr); }
.cn:hover .cn-grip { color: var(--tx1); }
/* 工具钮恒定全可见（透明度降噪在亮色下过度，点名看不清）——
   hover 仅做背景反馈；⏰ 品牌色常亮 */
.cn .btn.sm.ghost[aria-label="标准时间转时间戳"] { color: var(--ac); }
.cn .btn.sm.ghost[aria-label="标准时间转时间戳"]:hover { color: var(--ac-hi, var(--ac)); background: var(--ac-soft); }
.cn-op { height: 30px; font-size: var(--fs-sm); max-width: 140px; }
/* 类型徽标色统一 theme.css 全站 .mft-type[data-t] 色卡（本文件原局部三类型规则已删）；
   冷门类型回落档走 :where（specificity 0），色卡命中时必胜（同 FieldPicker 口径） */
.cn-fty { flex: none; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; cursor: help; }
:where(.cn-fty) { color: var(--muted); background: var(--hl); }
.cn-val { height: 30px; font-size: var(--fs-sm); padding: 3px var(--sp-2); flex: 1 1 120px; min-width: 0; }
.cn-range { flex: 0 1 110px; }
/* 字段选择器伸展：flex-wrap 行内吃满剩余空间，长路径 a.b.c.keyword 不再截断；
   值输入 flex 比例相应上调（形态对齐 RootExtrasPane .rx-sort-row .fs 的遮挡修复） */
.cn .fs { flex: 1 1 150px; min-width: 0; }
.cn-na { font-size: var(--fs-xs); color: var(--tx2); }
.cn-params { flex-basis: 100%; padding: var(--sp-2); border-top: 1px dashed var(--line); }
/* 换算子微提示：独占一行的小字淡底（克制，不抢值输入焦点），2.5s 后 opacity 淡出 */
.cn-nudge { flex: 0 0 100%; font-size: var(--fs-xs); color: var(--info); background: var(--info-soft); border-radius: var(--r-xs); padding: 1px var(--sp-2); transition: opacity .5s; }
.cn-nudge.out { opacity: 0; }
/* range-on-keyword 字典序警示黄点：title 承载完整说明 */
.cn-rwarn { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--warn); cursor: help; }
/* 算子×类型错配 / 开头通配符警示黄点（同 .cn-rwarn 形态）。
   span 升级 button（键盘可达），重置 UA 按钮壳、cursor 由 help 改 pointer */
.cn-owarn { flex: none; width: 8px; height: 8px; padding: 0; border: none; border-radius: 50%; background: var(--warn); cursor: pointer; }
.cn-owarn:hover { filter: brightness(1.15); }
</style>
