<template>
  <div class="agn">
    <div class="agn-hd">
      <input class="inp agn-name mono" :value="node.name" title="聚合名"
             @input="emit('update:node', { ...node, name: ($event.target as HTMLInputElement).value })" />
      <input class="inp agn-op mono" :value="node.op" :list="'aggops-' + node.id" placeholder="聚合类型" title="聚合类型（可手输任意 ES 聚合名）"
             @input="emit('update:node', { ...node, op: ($event.target as HTMLInputElement).value })" />
      <datalist :id="'aggops-' + node.id">
        <option v-for="(lb, op) in AGG_OPS" :key="op" :value="op">{{ lb }}</option>
      </datalist>
      <span style="flex:1"></span>
      <button aria-label="meta" class="btn sm ghost" :class="{ on: metaOpen }" title="meta" @click="metaOpen = !metaOpen"><Tag :size="12" /></button>
      <button aria-label="删除聚合" class="btn sm ghost danger" title="删除聚合" @click="emit('remove')"><X :size="12" /></button>
    </div>
    <div v-if="metaOpen" class="agn-sub">
      <!-- 【预授权偏差A】@update="onMeta"（收窄守卫，数组形态忽略） -->
      <GenericParams :value="node.meta" path-prefix="" @update="onMeta" />
    </div>
    <div class="agn-body">
      <!-- 1022：date_range/range 的 ranges 行编辑、filters 的命名/匿名桶查询树——
     面板只投影专属键，参数表视图剥离防双编辑位（加出该键路由回流不丢） -->
      <AggRangesPanel v-if="op === 'date_range' || op === 'range'" :body="(node.body as Record<string, unknown>)"
                      @patch="r => onBodyPatch('ranges', r)" />
      <AggFiltersPanel v-if="op === 'filters'" :body="(node.body as Record<string, unknown>)" :fields="fields" :types="types"
                       @patch="v => onBodyPatch('filters', v)" />
      <!-- 1031：桶聚合 order 行编辑——面板只接可投影形态（数组逐项单键/单键对象）；
           多键对象等非投影形态留守自由表零丢失（orderShown 门控） -->
      <AggOrderPanel v-if="orderShown" :body="(node.body as Record<string, unknown>)"
                     @patch="v => onBodyPatch('order', v)" />
      <!-- 1035：date_histogram/histogram 的 extended_bounds 边界面板——无键也给空面板
           （可发现性），双空删键回默认；非标量形态留守自由表零丢失（boundsShown 门控） -->
      <AggBoundsPanel v-if="boundsShown" :body="(node.body as Record<string, unknown>)"
                      @patch="v => onBodyPatch('extended_bounds', v)" />
      <!-- 1037：composite 的 sources 行编辑——键缺席给单行骨架（可发现性），非投影
           形态（多键源项等）留守自由表零丢失（sourcesShown 门控） -->
      <AggCompositePanel v-if="sourcesShown" :body="(node.body as Record<string, unknown>)" :fields="fields" :types="types"
                         @patch="v => onBodyPatch('sources', v)" />
      <!-- top 常见聚合的 .field 键传 fieldKeys，行内渲染 FieldSelect 字段选择器；
     其余/未知聚合名不传（空数组），回落裸键值表零降级。
     1020：AGG_BODY_PARAMS 在册聚合的 body 加 schema——具名参数升类型化输入/枚举下拉
     （execution_hint 三档、keyed 布尔、interval 数值…），未登记键维持自由表加键零丢失 -->
      <GenericParams v-if="isObj(node.body)" :value="bodyView" path-prefix=""
                     :schema="AGG_BODY_PARAMS[node.op] || []"
                     :field-keys="aggFieldKeys" :fields="fields" :types="types" :type-priority="aggTypePriority"
                     @update="onBodyParams" />
      <input v-else class="inp mono agn-scalar" :value="String(node.body ?? '')" title="非标量聚合体（原样保留，按字符串编辑）"
             @input="emit('update:node', { ...node, body: ($event.target as HTMLInputElement).value })" />
    </div>
    <div class="agn-children">
      <AggTreeNode
        v-for="c in node.children" :key="c.id" :node="c" :fields="fields" :types="types"
        @update:node="n => patchChild(c.id, n)" @remove="delChild(c.id)"
      />
      <button class="btn sm ghost agn-add" @click="addChild"><Plus :size="12" /> 子聚合</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/* W2：聚合树节点。op 用 datalist 自由输入（建议但不限制——未知聚合名零降级）。
 换 op 保留 body（参数用户自行调整，不静默丢）。组件经文件名自引用递归。 */
import { ref, computed } from 'vue';
import { X, Plus, Tag } from 'lucide-vue-next';
import GenericParams from './GenericParams.vue';
import AggRangesPanel from './AggRangesPanel.vue';
import AggFiltersPanel from './AggFiltersPanel.vue';
import AggOrderPanel from './AggOrderPanel.vue';
import AggBoundsPanel from './AggBoundsPanel.vue';
import AggCompositePanel from './AggCompositePanel.vue';
import { AGG_OPS, AGG_BODY_PARAMS } from '../../utils/queryAstOps';
import { nid, type AggNode } from '../../utils/queryAst';

const props = defineProps<{ node: AggNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{ (e: 'update:node', n: AggNode): void; (e: 'remove'): void }>();

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const metaOpen = ref(false);

/* 1022：面板专属键（ranges/filters）由面板权威编辑——参数表视图剥离，表内加出该键路由回流。
   1031：order 由 AggOrderPanel 权威编辑，但只接可投影形态（数组逐项单键/单键对象）——
   多键对象等非投影形态留守自由表零丢失（orderShown 门控 + 剥离条件含形态判断） */
const PANEL_KEYS = new Set(['ranges', 'filters']);
/* 支持桶排序的聚合（order 语义在册；其余聚合即使带 order 键也走自由表） */
const ORDER_AGGS = new Set(['terms', 'rare_terms', 'significant_terms', 'significant_text', 'multi_terms',
  'date_histogram', 'histogram', 'auto_date_histogram', 'variable_width_histogram', 'ip_range']);
/* order 可投影形态：数组（每项单键对象）或单键对象；多键对象/其它形态=非投影 */
function orderProjectionOk(o: unknown): boolean {
  if (Array.isArray(o)) {
    return o.every(it => isObj(it) && Object.keys(it).length === 1);
  }
  return isObj(o) && Object.keys(o).length === 1;
}
const op = computed(() => props.node.op);
const orderShown = computed(() =>
  ORDER_AGGS.has(op.value) && isObj(props.node.body) && 'order' in props.node.body
  && orderProjectionOk(props.node.body.order));
/* 1035：extended_bounds 边界面板门控——date_histogram/histogram 专属；键缺席也给
   空面板（可发现性：加边界是设置直方图的高频动作）；非标量值形态（畸形）留守自由表 */
const BOUNDS_AGGS = new Set(['date_histogram', 'histogram']);
function boundsProjectionOk(o: unknown): boolean {
  if (!isObj(o)) return false;
  return Object.values(o).every(v => typeof v !== 'object' || v === null);
}
const boundsShown = computed(() =>
  BOUNDS_AGGS.has(op.value) && isObj(props.node.body)
  && (!('extended_bounds' in props.node.body) || boundsProjectionOk(props.node.body.extended_bounds)));
/* 1037：composite 的 sources 门控——键缺席给骨架（可发现性），可投影形态（数组且
   每项单类型键+对象体）给行编辑；非投影形态留守自由表零丢失 */
function sourcesProjectionOk(o: unknown): boolean {
  return Array.isArray(o) && o.every(it => isObj(it) && Object.keys(it).length === 1 && isObj((it as Record<string, unknown>)[Object.keys(it)[0]]));
}
const sourcesShown = computed(() =>
  op.value === 'composite' && isObj(props.node.body)
  && (!('sources' in props.node.body) || sourcesProjectionOk(props.node.body.sources)));
const bodyView = computed<Record<string, unknown>>(() => {
  const b = props.node.body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b || {})) {
    if (PANEL_KEYS.has(k)) continue;
    if (k === 'order' && orderShown.value) continue;
    if (k === 'extended_bounds' && boundsShown.value) continue;
    if (k === 'sources' && sourcesShown.value) continue;
    out[k] = v;
  }
  return out;
});
function onBodyPatch(key: 'ranges' | 'filters' | 'order' | 'extended_bounds' | 'sources', v: unknown) {
  const body: Record<string, unknown> = { ...(props.node.body as Record<string, unknown>) };
  /* order/extended_bounds/sources 清空 = 删键回骨架语义（空数组哨兵） */
  if ((key === 'order' || key === 'extended_bounds' || key === 'sources') && Array.isArray(v) && v.length === 0) delete body[key];
  else body[key] = v;
  emit('update:node', { ...props.node, body });
}
function onBodyParams(v: Record<string, unknown> | unknown[]) {
  if (Array.isArray(v)) return;
  const out: Record<string, unknown> = { ...v };
  const b = (props.node.body || {}) as Record<string, unknown>;
  /* 1031 修 1022 存量洞：面板权威键以现 body 合回——bodyView 把面板键剥离后 v 永不含它，
     只回填「v 在场」的旧语义让任何自由表编辑静默丢掉 ranges/filters（挂载实证：改 format
     后 ranges 成 undefined）。面板键删除走面板自身通道（行清空），自由表删除不是其通道。
     表内加出面板键仍以表内值回流（v 在场优先）。1035：order/extended_bounds 并入同循环。 */
  for (const k of [...PANEL_KEYS, 'order', 'extended_bounds']) {
    if (k in v) out[k] = (v as Record<string, unknown>)[k];
    else if (k in b) out[k] = b[k];
  }
  if ('sources' in v) out.sources = (v as Record<string, unknown>).sources;
  else if ('sources' in b) out.sources = b.sources;
  emit('update:node', { ...props.node, body: out });
}

/* top 常见聚合的 body.field 是字段键——命中时 GenericParams 该行渲染 FieldSelect
 （rank/分组/类型徽标/mark 全套）。未知聚合名/其余聚合（top_hits/filters/nested…）body 无
 直接字段键语义，传空数组回落裸键值表（零降级）。 */
const FIELD_BODY_AGGS = new Set(['terms', 'histogram', 'date_histogram', 'range', 'date_range', 'avg', 'max', 'min', 'sum', 'cardinality', 'value_count', 'percentiles', 'percentile_ranks', 'extended_stats', 'significant_terms', 'significant_text', 'rare_terms', 'missing', 'geo_bounds', 'geo_centroid', 'weighted_avg', 'median_absolute_deviation', 'boxplot', 'string_stats', 'auto_date_histogram', 'ip_range', 'variable_width_histogram', 'geohash_grid', 'geotile_grid', 'geohex_grid', 'geo_distance', 'rate']);
const aggFieldKeys = computed(() => (FIELD_BODY_AGGS.has(props.node.op) ? ['field'] : []));

/* 【W3b】聚合 field 行的类型置顶：候选分组按聚合语义排前（不改候选集）——
 date_histogram 打时间字段、terms 分桶常打 keyword（数值桶也常见，数值族次之）；
 补全：avg/min/max/sum/cardinality/histogram 是数值聚合/数值直方图（非数值字段
 会被 ES 拒或产出无意义桶）→ 数值族置顶；range 分桶 date+数值族皆常见 → date 置顶数值族次之；
 其余聚合无类型倾向，空数组 = GenericParams 归一 null 纯 rank 平铺（现状零增量） */
const NUMERIC_TYPES = ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float'];
const NUMERIC_AGGS = new Set(['avg', 'min', 'max', 'sum', 'cardinality', 'histogram', 'variable_width_histogram', 'rate']);
const GEO_AGGS = new Set(['geohash_grid', 'geotile_grid', 'geohex_grid', 'geo_distance']);
const aggTypePriority = computed<string[]>(() => {
  if (props.node.op === 'date_histogram' || props.node.op === 'auto_date_histogram') return ['date'];
  if (props.node.op === 'terms') return ['keyword', ...NUMERIC_TYPES];
  if (props.node.op === 'range' || props.node.op === 'date_range') return ['date', ...NUMERIC_TYPES];
  if (GEO_AGGS.has(props.node.op)) return ['geo_point', 'geo_shape'];
  if (NUMERIC_AGGS.has(props.node.op)) return [...NUMERIC_TYPES];
  return [];
});

/* 【预授权偏差A】meta 收窄：GenericParams update 是 Record|unknown[] 联合，数组形态忽略（meta 语义必须是对象） */
function onMeta(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) emit('update:node', { ...props.node, meta: v });
}

function addChild() {
  const sibs = props.node.children;
  let i = sibs.length + 1;
  while (sibs.some(c => c.name === 'sub_' + i)) i++;   // 跳过已占用名（同上防静默覆盖）
  const c: AggNode = {
    id: nid(), name: 'sub_' + i, op: 'avg',
    body: { field: props.fields[0] || '' }, children: [], meta: {}, aggKey: 'aggs',
  };
  emit('update:node', { ...props.node, children: [...props.node.children, c] });
}
function patchChild(id: string, n: AggNode) {
  emit('update:node', { ...props.node, children: props.node.children.map(c => c.id === id ? n : c) });
}
function delChild(id: string) {
  emit('update:node', { ...props.node, children: props.node.children.filter(c => c.id !== id) });
}
</script>

<style scoped>
.agn { border: 1px solid var(--line-strong); border-radius: var(--r-s); background: var(--bg1); padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-2); }
.agn-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.agn-name { width: 110px; height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); }
.agn-op { width: 130px; height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); color: var(--ac-hi); }
.agn-sub { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.agn-body { margin-top: var(--sp-2); }
.agn-scalar { width: 180px; height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); }
.agn-children { margin-top: var(--sp-2); padding-left: var(--sp-2); border-left: 2px solid var(--line); }
</style>
