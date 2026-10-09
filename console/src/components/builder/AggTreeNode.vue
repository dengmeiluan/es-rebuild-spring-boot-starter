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
      <!-- 五百一十九批：top 常见聚合的 .field 键传 fieldKeys，行内渲染 FieldSelect 字段选择器；
           其余/未知聚合名不传（空数组），回落裸键值表零降级 -->
      <GenericParams v-if="isObj(node.body)" :value="(node.body as Record<string, unknown>)" path-prefix=""
                     :field-keys="aggFieldKeys" :fields="fields" :types="types" :type-priority="aggTypePriority"
                     @update="v => emit('update:node', { ...node, body: v })" />
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
import { AGG_OPS } from '../../utils/queryAstOps';
import { nid, type AggNode } from '../../utils/queryAst';

const props = defineProps<{ node: AggNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{ (e: 'update:node', n: AggNode): void; (e: 'remove'): void }>();

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const metaOpen = ref(false);

/* 五百一十九批：top 常见聚合的 body.field 是字段键——命中时 GenericParams 该行渲染 FieldSelect
   （rank/分组/类型徽标/mark 全套）。未知聚合名/其余聚合（top_hits/filters/nested…）body 无
   直接字段键语义，传空数组回落裸键值表（零降级）。 */
const FIELD_BODY_AGGS = new Set(['terms', 'histogram', 'date_histogram', 'range', 'avg', 'max', 'min', 'sum', 'cardinality']);
const aggFieldKeys = computed(() => (FIELD_BODY_AGGS.has(props.node.op) ? ['field'] : []));

/* 【W3b】聚合 field 行的类型置顶：候选分组按聚合语义排前（不改候选集）——
   date_histogram 打时间字段、terms 分桶常打 keyword（数值桶也常见，数值族次之）；
   五百三十一批补全：avg/min/max/sum/cardinality/histogram 是数值聚合/数值直方图（非数值字段
   会被 ES 拒或产出无意义桶）→ 数值族置顶；range 分桶 date+数值族皆常见 → date 置顶数值族次之；
   其余聚合无类型倾向，空数组 = GenericParams 归一 null 纯 rank 平铺（现状零增量） */
const NUMERIC_TYPES = ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float'];
const NUMERIC_AGGS = new Set(['avg', 'min', 'max', 'sum', 'cardinality', 'histogram']);
const aggTypePriority = computed<string[]>(() => {
  if (props.node.op === 'date_histogram') return ['date'];
  if (props.node.op === 'terms') return ['keyword', ...NUMERIC_TYPES];
  if (props.node.op === 'range') return ['date', ...NUMERIC_TYPES];
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
