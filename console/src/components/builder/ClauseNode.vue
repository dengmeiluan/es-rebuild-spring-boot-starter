<template>
  <div class="cn" :data-nid="node.id"
       :style="node.disabled ? { opacity: .45 } : undefined">
    <button v-if="node.disabled" aria-label="恢复参与匹配" class="btn xs ghost cn-pw on"
            title="该条件已临时停用，点击恢复参与匹配" @click="toggleDisabled(false)">
      <Circle :size="15" />
    </button>
    <button v-else aria-label="临时停用（不参与匹配）" class="btn xs ghost cn-pw"
            title="临时停用该条件（不删除、不参与本次匹配），点击可恢复" @click="toggleDisabled(true)">
      <CircleSlash :size="15" />
    </button>
    <!-- 拖拽源只在 grip 柄：根 draggable 会劫持行内值输入框的文本选择/光标拖划 -->
    <span class="cn-grip" title="拖拽排序（按住拖动）" draggable="true" @dragstart.stop="onDragStart" @dragend="endDrag">⋮⋮</span>
    <!-- 字段槽：field/named 形态显示（fields 多字段/none 无字段形态无单字段可选） -->
    <template v-if="hasFieldSlot">
      <FieldSelect
        :model-value="node.field || ''" :fields="fields" :types="types" :type-priority="fieldTypePriority"
        :type-filter="fieldTypeFilter"
        @update:model-value="onField"
      />
      <!-- 字段类型徽标 + 类型提示 tooltip（零结构改动的类型教育）：keyword→term 精确、
 text→match 全文、数值/date→range 范围；mapping 缺失（types 无此字段）不渲染，零降级 -->
      <!-- 类型徽标挂全站色卡 .mft-type（theme.css），删局部三类型撞色规则 -->
      <span v-if="fieldType" class="cn-fty mono mft-type" :data-t="fieldType" :title="typeHint">{{ fieldType }}</span>
    </template>
    <!-- 算子下拉：推荐（opsForType）+ 常用（单字段形态非推荐）+ 高级分组（ADV_MENU 同源）。
         998：外观升级为「语义族胶囊」——按 opFamilyOf 着色（全文/精确/范围/空间/向量/跨度/脚本），
         原生 select 语义与 change 事件不变（键盘、输入法、无障碍全保留），只把壳做成芯片。 -->
    <select class="inp cn-op" :class="'opf-' + opFamily" :data-op="node.op" :title="'当前算子：' + label(node.op)"
            :value="node.op" @change="onOp(($event.target as HTMLSelectElement).value)">
      <optgroup v-for="g in opGroups" :key="g.label" :label="g.label">
        <option v-for="o in g.ops" :key="o" :value="o">{{ label(o) }}</option>
      </optgroup>
    </select>

    <!-- 值控件：按算子形态分派（985：多字段/对象值/数组值分支加入） -->
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
    <!-- 【985】多字段形态：主值输入 + 字段列表输入（逗号分隔 ↔ string[]） -->
    <template v-else-if="nodeOpForm === 'fields'">
      <input class="inp cn-val mono" :value="valText"
             :placeholder="mainKeyPlaceholder"
             @input="onValue(($event.target as HTMLInputElement).value)" />
      <input class="inp cn-val mono cn-fields" :value="fieldsText" placeholder="字段列表，逗号分隔"
             @input="onFields(($event.target as HTMLInputElement).value)" />
    </template>
    <!-- 1011：intervals 专用递归编辑位——规则可解析（唯一类型键+官方 6 类）即一等编辑：
         类型/主值/_name/参数 schema 表/all_of·any_of 递归子规则/位置过滤关系槽；
         不可解析（畸形/未知形态）落回下方通用对象值键值表零丢失 -->
    <div v-else-if="isIntervals" class="cn-objval">
      <IntervalsEditor :rule="intervalsParsed!" :fields="fields" :types="types" @update="onIntervalsUpdate" />
    </div>
    <!-- 【985】对象值（geo 系/terms_set/script 等）：常用键快捷 chips +
     递归键值子表（零降级同款语言）——键名不用猜，点 chips 即得骨架再改值 -->
    <div v-else-if="isObjValue" class="cn-objval">
      <div v-if="objKeyHints.length" class="cn-objk" role="group" aria-label="常用键快捷添加">
        <button v-for="k in objKeyHints" :key="k" class="cn-objk-btn" type="button"
                :disabled="k in objVal" :title="'添加常用键 ' + k" @click="addObjKey(k)">+ {{ k }}</button>
      </div>
      <GenericParams :value="objVal" @update="onObjValue" />
    </div>
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
    <!-- 1005：数组值算子（terms/ids）chip 视觉化——值即标签可删可加，逗号分隔文本退役；
         值候选 datalist（terms-agg top20+历史值双源）与 IME 守卫原样保留；
         非数组形态（如 terms-lookup 对象）不走此分支=保留原输入路径 -->
    <div v-else-if="isArrayVal" class="cn-chips" role="group"
         :aria-label="(OPS_META[props.node.op]?.label || props.node.op) + ' 值列表：回车或逗号添加，空输入退格删末项'">
      <span v-for="(v, i) in arrVals" :key="i" class="cn-chip mono" :title="String(v)">
        <span class="cn-chip-v">{{ v }}</span>
        <button type="button" class="cn-chip-x" :aria-label="'删除值 ' + v" :title="'删除值 ' + v"
                @click="delChip(i)"><X :size="10" /></button>
      </span>
      <input
        class="inp cn-val mono cn-chip-in" v-model="chipDraft"
        :placeholder="arrVals.length ? '' : valPlaceholder"
        :list="valCandidates.length ? valDlId : undefined"
        @focus="primeValAgg"
        @keydown.enter.prevent="onChipEnter($event)"
        @keydown="onChipKey"
        @blur="commitChip()"
      />
    </div>
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
    <!-- 998：行尾动作收成一组（margin-left:auto 右对齐）——空间不足时整组换行落到下一行右侧，
         不再出现「按钮散落在行首」的断裂感；组内按钮统一 22px 方形，视觉重量低于主控件 -->
    <span class="cn-acts">
      <!-- ⏰ 常驻——此前按字段名正则门控，「不像时间字段」的按钮直接消失，
 placeholder 却承诺「⏰ 转换」，用户找不到入口。常驻后任何字段都可点：
 值能解析成标准时间才转换，解析失败保持原值（title 说明适用面）。 -->
      <button aria-label="标准时间转时间戳" class="btn sm ghost cn-act" title="⏰ 把标准时间（YYYY-MM-DD HH:mm[:ss]）转成 epoch 毫秒；值不是标准时间格式时点击不变"
              @click="convertStdTime">
        <Clock :size="12" />
      </button>

      <!-- 具名参数（schema 内）+ 更多参数入口 -->
      <button aria-label="参数（boost/operator…）" v-if="hasParams" class="btn sm ghost cn-act" title="参数（boost/operator…）" @click="paramsOpen = !paramsOpen">
        <Settings2 :size="12" />
      </button>
      <button aria-label="复制条件" class="btn sm ghost cn-act" title="复制条件（插到本条件之后）" @click="$emit('duplicate', node.id)"><Copy :size="12" /></button>
      <button aria-label="包成 bool 组" class="btn sm ghost cn-act" title="包成 bool 组" @click="$emit('wrap')"><Group :size="12" /></button>
      <button aria-label="删除" class="btn sm ghost cn-act danger" title="删除" @click="$emit('remove')"><X :size="12" /></button>
    </span>
    <div v-if="paramsOpen" class="cn-params">
      <GenericParams :value="node.params" :schema="paramSchema" @update="onParams" />
    </div>
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
import IntervalsEditor from './IntervalsEditor.vue';
import { parseIntervalRule, serIntervalRule, type IntervalRule } from '../../utils/intervalsRule';
import { stdTimeToEpochMs } from '../../utils/format';
import { DRAG_KEY, TREE_BUS, fireDrag } from './treeBus';
import { OPS_META, opsForType, RICH_OPS, ADV_MENU, typePriorityForOp, typeFilterForOp, NUMERIC_VALUE_TYPES, opFamilyOf } from '../../utils/queryAstOps';
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
/* 985：算子下拉分组——推荐（opsForType）+ 常用（单字段形态非推荐非高级）+ ADV_MENU
 高级分组（全文/精确/地理/脚本/复合，与「+ 高级」菜单同源同序）；去重后全部富算子可达 */
const nodeOpForm = computed(() => OPS_META[props.node.op]?.form);
/* 998：算子语义族——胶囊配色用（族定义在 queryAstOps，纯语义可复用） */
const opFamily = computed(() => opFamilyOf(props.node.op));
const hasFieldSlot = computed(() => nodeOpForm.value === 'field' || nodeOpForm.value === 'named');
const opGroups = computed(() => {
  const rec = opsForType(props.types[props.node.field || '']);
  const seen = new Set(rec);
  const groups: Array<{ label: string; ops: string[] }> = [{ label: '推荐', ops: rec }];
  const advSet = new Set(ADV_MENU.flatMap(g => g.ops));
  const common = RICH_OPS.filter(o => !advSet.has(o) && OPS_META[o].form === 'field' && !seen.has(o));
  if (common.length) { groups.push({ label: '常用', ops: common }); common.forEach(o => seen.add(o)); }
  for (const g of ADV_MENU) {
    const ops = g.ops.filter(o => OPS_META[o] && !seen.has(o));
    if (ops.length) { groups.push({ label: g.group, ops }); ops.forEach(o => seen.add(o)); }
  }
  return groups;
});
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
/* 998：高特异算子（geo/向量/特征/形状/间隔）字段候选按 mapping 类型收窄——
   选 geo_distance 时只列 geo_point，不再让用户在几千字段里翻。
   非高特异算子返回 undefined（不过滤，保留自由手输与跨类型语义） */
const fieldTypeFilter = computed<string[] | undefined>(() => typeFilterForOp(props.node.op));
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
  if (props.node.op === 'terms') return '输入值后回车或逗号添加';   // 多值语义优先于字段类型（1005 chip 形态文案）
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
  /* named 形态字段键可空（query_string 无 default_field 合法）：清空 → null（序列化不写键） */
  const f = nodeOpForm.value === 'named' && !field ? null : field;
  patch({ field: f, op: nextOp });
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
/* 985：切算子按目标形态重建值/字段/多字段——标量尽量带过去，结构不兼容给安全初值。
 对象值算子（wrap none 非 terms）目标 {}；数组值算子（terms/ids）归一 []；
 fields 形态 field 退役、fields=[]；none 形态 field 退役。 */
const ARRAY_VAL_OPS = new Set(['terms', 'ids']);
function onOp(op: string) {
  const meta = OPS_META[op];
  const v = props.node.value;
  const isObj = v !== null && typeof v === 'object' && !Array.isArray(v);
  const form = meta?.form;
  let value: unknown;
  if (op === 'range' || (form === 'field' && meta?.wrap === 'none' && op !== 'terms')) value = isObj ? v : {};
  else if (ARRAY_VAL_OPS.has(op)) value = Array.isArray(v) ? v : (v === '' || v == null) ? [] : [v];
  else value = isObj ? '' : v;
  const field = form === 'none' || form === 'fields' ? null : (props.node.field ?? '');
  const fields = form === 'fields' ? (Array.isArray(props.node.fields) ? props.node.fields : []) : null;
  patch({ op, value, field, fields });
}
/* 数组值算子（terms/ids）↔ 逗号分隔；其余标量直存 */
const valText = computed(() =>
  ARRAY_VAL_OPS.has(props.node.op)
    ? (Array.isArray(props.node.value) ? props.node.value.join(',') : String(props.node.value ?? ''))
    : String(props.node.value ?? ''));
function onValue(raw: string) {
  patch({ value: ARRAY_VAL_OPS.has(props.node.op) ? raw.split(',').map(s => s.trim()).filter(Boolean) : raw });
}

/* ═══ 1005：数组值 chip 编辑 ═══ draft 不写树（半截值不进 DSL），提交才整项入账；
   粘贴含逗号按项拆分（与旧逗号分隔输入等价）；IME 组合态 Enter 守卫（FieldSelect 同款） */
const isArrayVal = computed(() => ARRAY_VAL_OPS.has(props.node.op) && Array.isArray(props.node.value));
const arrVals = computed(() => (props.node.value as unknown[]).map(v => String(v)));
const chipDraft = ref('');
function commitChip() {
  const raw = chipDraft.value;
  chipDraft.value = '';
  const parts = raw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  if (parts.length) patch({ value: [...arrVals.value, ...parts] });
}
function delChip(i: number) {
  const next = arrVals.value.slice();
  next.splice(i, 1);
  patch({ value: next });
}
function onChipEnter(e: KeyboardEvent) { if (!e.isComposing) commitChip(); }
function onChipKey(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (e.key === 'Backspace' && !chipDraft.value && arrVals.value.length) {
    e.preventDefault();
    delChip(arrVals.value.length - 1);
  } else if (e.key === ',' || e.key === '，') {
    e.preventDefault();
    commitChip();
  }
}
/* 多字段形态：fields ↔ 逗号分隔（主值 placeholder 按 mainKey 语义） */
const mainKeyPlaceholder = computed(() => `主值（${OPS_META[props.node.op]?.mainKey || 'query'}）`);
const fieldsText = computed(() => (Array.isArray(props.node.fields) ? props.node.fields.join(',') : ''));
function onFields(raw: string) {
  patch({ fields: raw.split(',').map(s => s.trim()).filter(Boolean) });
}
/* 对象值子表（geo 系/terms_set/script 等）：值是纯对象即子表编辑 */
const isObjValue = computed(() => {
  if (nodeOpForm.value !== 'field' && nodeOpForm.value !== 'none') return false;
  const v = props.node.value;
  return v !== null && typeof v === 'object' && !Array.isArray(v);
});
/* 1011：intervals 规则体可解析（唯一类型键+官方 6 类）→ 专用递归编辑位接管；
   不可解析维持通用键值表（零丢失退化，与 FsFunctionsPanel 自定义形态锁定同语言） */
const intervalsParsed = computed(() =>
  props.node.op === 'intervals' ? parseIntervalRule(props.node.value) : null);
const isIntervals = computed(() => !!intervalsParsed.value);
function onIntervalsUpdate(r: IntervalRule) {
  patch({ value: serIntervalRule(r) });
}
const objVal = computed<Record<string, unknown>>(() =>
  (isObjValue.value ? props.node.value : {}) as Record<string, unknown>);
function onObjValue(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) patch({ value: v });
}
/* 常用键快捷骨架（傻瓜化）：点 chips 添加键、初始值按语义给形态（集合 []、嵌套对象 {}、标量空串） */
const OBJ_KEY_HINTS: Record<string, string[]> = {
  geo_distance: ['lat', 'lon'],
  geo_bounding_box: ['top_left', 'bottom_right'],
  geo_polygon: ['points'],
  geo_shape: ['shape', 'relation'],
  terms_set: ['terms', 'minimum_should_match_field'],
  /* intervals 通用退化路径骨架（1011：可解析形态走专用编辑器；此处键名按 ES 官方
     all_of/any_of——旧 allOf/anyOf 驼峰写法 ES 必拒） */
  intervals: ['match', 'all_of', 'any_of'],
  /* 991：对象值算子扩员（8.x 新算子族常用键骨架） */
  geo_grid: ['geohash', 'geotile', 'geohex', 'ignore_unmapped'],
  shape: ['shape', 'relation'],
  text_expansion: ['model_id', 'model_text'],
  weighted_tokens: ['tokens', 'pruning_config'],
};
const OBJ_ARR_KEYS = new Set(['terms', 'points', 'shape']);
const OBJ_OBJ_KEYS = new Set(['top_left', 'bottom_right', 'match', 'all_of', 'any_of', 'filter', 'tokens', 'pruning_config']);
const objKeyHints = computed(() => OBJ_KEY_HINTS[props.node.op] || []);
function addObjKey(k: string) {
  if (k in objVal.value) return;
  const init: unknown = OBJ_ARR_KEYS.has(k) ? [] : OBJ_OBJ_KEYS.has(k) ? {} : '';
  patch({ value: { ...objVal.value, [k]: init } });
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
/* v3.1 条件行：hover 浅底浮现；工具钮 hover/focus 显现，⏰/参与开关常亮；
 深嵌套无卡片（无边框行），字段聚焦品牌描边+柔光由 FieldSelect 内部处理 */
.cn { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-m); margin-bottom: var(--sp-0); position: relative; transition: background var(--tr); }
.cn:hover { background: var(--bg2); }
/* 参与开关：静息态中性灰（每行都亮一粒琥珀会盖过真正的条件内容），hover 才提示「可停用」；
   已停用态转绿色常亮——恢复入口必须显眼，否则停用条件容易被忘掉 */
.cn-pw { flex-shrink: 0; color: var(--tx2); }
.cn-pw:hover { color: var(--warn); background: var(--warn-soft); }
.cn-pw.on { color: var(--ok); }
.cn-pw.on:hover { color: var(--ok); background: var(--ok-soft); }
.cn-grip { cursor: grab; color: var(--tx2); font-size: var(--fs-xs); user-select: none; transition: color var(--tr); }
.cn:hover .cn-grip { color: var(--tx1); }
/* 工具钮恒定全可见（透明度降噪在亮色下过度，点名看不清）——
 hover 仅做背景反馈；⏰ 品牌色常亮 */
.cn .btn.sm.ghost[aria-label="标准时间转时间戳"] { color: var(--ac); }
.cn .btn.sm.ghost[aria-label="标准时间转时间戳"]:hover { color: var(--ac-hi, var(--ac)); background: var(--ac-soft); }
/* ═══ 998：条件行视觉重构 ═══
   目标：一眼分清「字段 / 算子 / 值」三段，而不是四个等权重输入框排在一起。
   · 行：hover 浅底 + focus-within 品牌弱描边（编辑中的那一行自己会亮）；
   · 算子：语义族胶囊（全文=青 / 精确=蓝 / 范围=紫 / 空间=绿 / 向量=品红 / 跨度=橙 / 脚本=中性）；
   · 值：mono 输入，底色比字段输入浅一档，视觉上「这是要被填的东西」。 */
.cn { border: 1px solid transparent; gap: var(--sp-1h); }
.cn:hover { background: var(--bg2); border-color: var(--line); }
.cn:focus-within { background: var(--bg2); border-color: var(--ac-line); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ac) 8%, transparent); }
/* 拖拽柄平时收敛，行 hover/聚焦才浮现（减少每行左侧的视觉噪点；功能与拖拽事件不变） */
.cn-grip { opacity: .35; }
.cn:hover .cn-grip, .cn:focus-within .cn-grip { opacity: 1; }
/* 算子胶囊：原生 select 去壳 + 语义族配色 + 右侧 chevron（背景 SVG，双主题中性灰） */
.cn-op {
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  height: 26px; max-width: 124px; flex: none;
  font-size: var(--fs-xs); font-weight: 650; letter-spacing: var(--ls-tight);
  padding: 0 16px 0 8px; border-radius: 999px; border: 1px solid transparent;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%236f8b83' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 5px center; background-size: 9px 9px;
  cursor: pointer; transition: filter var(--tr), border-color var(--tr), background-color var(--tr);
}
.cn-op:hover { filter: brightness(1.08); }
.cn-op:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.cn-op option { color: var(--tx0); background: var(--card, var(--bg1)); font-weight: 400; }
/* 语义族七色（暗/亮双主题都取语义 token 的对应档）：软底 + 同色文字；
   描边不写固定百分比 color-mix（亮色下会过重，且与全站 -line token 纪律冲突），
   统一走基类的透明边（尺寸稳定，不抖布局） */
.cn-op.opf-text { color: var(--c-must); background-color: var(--c-must-bg); }
.cn-op.opf-exact { color: var(--c-filter); background-color: var(--c-filter-bg); }
.cn-op.opf-range { color: var(--c-should); background-color: var(--c-should-bg); }
.cn-op.opf-geo { color: var(--ok); background-color: var(--ok-soft); }
.cn-op.opf-vector { color: var(--dv-purple); background-color: var(--dv-purple-soft); }
.cn-op.opf-span { color: var(--dv-orange-deep); background-color: color-mix(in srgb, var(--dv-orange-deep) 10%, transparent); }
.cn-op.opf-script { color: var(--tx1); background-color: var(--bg3); }
.cn-op.opf-struct { color: var(--tx2); background-color: var(--bg2); }
/* 类型徽标色统一 theme.css 全站 .mft-type[data-t] 色卡（本文件原局部三类型规则已删）；
 冷门类型回落档走 :where（specificity 0），色卡命中时必胜（同 FieldPicker 口径） */
.cn-fty { flex: none; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; cursor: help; }
:where(.cn-fty) { color: var(--muted); background: var(--hl); }
.cn-val { height: 30px; font-size: var(--fs-sm); padding: 3px var(--sp-2); flex: 1 1 120px; min-width: 0; }
.cn-range { flex: 0 1 86px; min-width: 62px; }
/* 998：行尾动作组——整组右对齐、空间不足时整体折行（不散落在行首）；
   24px 方形按钮，hover/focus 才提亮，静息态低对比不抢主控件 */
.cn-acts { display: inline-flex; align-items: center; gap: 0; margin-left: auto; flex: none; }
.cn-act { width: 22px; height: 22px; padding: 0; justify-content: center; border-radius: var(--r-s); color: var(--tx2); }
.cn-act:hover { color: var(--tx0); background: var(--bg3); }
.cn-act.danger:hover { color: var(--err); background: var(--err-soft); }
/* 985：多字段形态的字段列表输入（与主值并排换行）+ 对象值子表容器（独占一行，dashed 弱边框与 GenericNode 同语言） */
.cn-fields { flex: 1 1 150px; }
.cn-objval { flex-basis: 100%; padding: var(--sp-2); border: 1px dashed var(--line); border-radius: var(--r-s); background: var(--bg1); }
/* 1005：terms/ids 值 chips——值即标签（hl 底+line 边，与 .cn-objk-btn 同语言）；
   行内折行承载多值，输入框随行伸缩（空态独占一行给 placeholder） */
.cn-chips { display: inline-flex; flex: 1 1 150px; min-width: 0; flex-wrap: wrap; align-items: center; gap: var(--sp-1); }
.cn-chip { display: inline-flex; align-items: center; gap: 2px; max-width: 220px; overflow: hidden;
  padding: 0 var(--sp-1h); border: 1px solid var(--line); border-radius: var(--r-s);
  background: var(--hl); font-size: var(--fs-xs); line-height: 20px; }
.cn-chip-v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cn-chip-x { display: inline-flex; align-items: center; padding: 0; border: none; background: none;
  color: var(--tx2); cursor: pointer; transition: color var(--tr); }
.cn-chip-x:hover { color: var(--warn); }
.cn-chip-in { flex: 1 1 80px; min-width: 70px; width: auto; height: 26px; padding: 0 var(--sp-1h); }
/* 对象值常用键快捷 chips：胶囊虚线弱态，点击补骨架；已添加键禁用防重复 */
.cn-objk { display: flex; gap: var(--sp-1); flex-wrap: wrap; margin-bottom: var(--sp-1); }
.cn-objk-btn { font-size: var(--fs-2xs); padding: 1px 7px; border-radius: 999px; border: 1px dashed var(--line-strong); background: var(--bg2); color: var(--tx2); cursor: pointer; transition: color var(--tr), border-color var(--tr); }
.cn-objk-btn:hover:not(:disabled) { color: var(--ac); border-color: var(--ac); }
.cn-objk-btn:disabled { opacity: .4; cursor: default; }
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
