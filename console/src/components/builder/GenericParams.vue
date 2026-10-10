<template>
  <div class="gp">
    <div v-for="row in rows" :key="row.key" class="gp-row" :style="{ '--d': depth }">
      <input class="inp gp-k mono" :value="row.key" :readonly="isArr"
        @change="renameKey(row.key, ($event.target as HTMLInputElement).value)
          || (($event.target as HTMLInputElement).value = row.key)" />
      <template v-if="row.kind === 'object' || row.kind === 'array'">
        <button class="btn sm ghost" @click="toggle(row.key)">{{ collapsed.has(row.key) ? '▸' : '▾' }} {{ row.key }} {{ row.kind === 'array' ? '[' + (row.val as any[]).length + ']' : '{…}' }}</button>
        <div v-show="!collapsed.has(row.key)" class="gp-sub">
          <!-- 【W3b】字段键的数组值（multi_match.fields / query_string.fields 形态）：
               子表逐项渲染 FieldSelect——数组项键是序号字符串，把序号名单传下去复用既有
               isFieldKey 通道；非字段键的数组子表不传（现状裸键值表零降级） -->
          <GenericParams :value="row.val as Record<string, unknown> | unknown[]" :depth="depth + 1" :path-prefix="pathPrefix + row.key + '.'"
                         :field-keys="childFieldKeys(row)" :fields="fields" :types="types" :type-priority="typePriority"
                         @update="setChild(row.key, $event)" />
        </div>
      </template>
      <select v-else-if="schemaOpt(row.key)" class="inp gp-v" :value="String(row.val)" @change="setChild(row.key, ($event.target as HTMLSelectElement).value)">
        <option v-for="o in schemaOpt(row.key)" :key="o" :value="o">{{ o }}</option>
      </select>
      <!-- 字段键行渲染 FieldSelect（rank/分组/类型徽标/mark 全套，同 ClauseNode）；
           fields 为空（无字段源）回落普通输入，零降级 -->
      <FieldSelect v-else-if="isFieldKey(row.key)" class="gp-fs"
                   :model-value="String(row.val)" :fields="fields" :types="types" :type-priority="typePriority"
                   @update:model-value="setChild(row.key, $event)" />
      <input v-else-if="row.kind === 'boolean'" type="checkbox" :checked="!!row.val" @change="setChild(row.key, ($event.target as HTMLInputElement).checked)" />
      <input v-else class="inp gp-v mono" :class="{ warn: row.kind === 'numstr' }"
             :data-path="pathPrefix + row.key"
             :value="row.raw" :title="row.kind === 'numstr' ? '非数字，将作为字符串提交' : ''"
             @input="onScalar(row.key, ($event.target as HTMLInputElement).value, row.kind)" />
      <button aria-label="删除该参数键" class="btn sm ghost danger" @click="removeKey(row.key)"><X :size="12" /></button>
    </div>
    <div class="gp-add">
      <input v-if="!isArr" class="inp mono" v-model="newKey" placeholder="+ 键名" @keydown.enter="addKey" />
      <button class="btn sm" @click="addKey">添加</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/* W1：递归键值表——零降级的最后兜底。任何 JSON 对象都渲染成结构化行：
   标量按类型给控件（数字框容忍非数字字符串提交并标黄，设计文档 §6），
   对象/数组逐级展开。schema 具名参数优先渲染为 enum/number 控件。 */
import { ref, computed } from 'vue';
import { X } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import type { ParamMeta } from '../../utils/queryAstOps';

const props = withDefaults(defineProps<{
  value: Record<string, unknown> | unknown[];
  schema?: ParamMeta[];
  depth?: number;
  pathPrefix?: string;
  /** 字段键名单——命中的键渲染 FieldSelect；空/缺省 = 现状裸键值表（逐字节不变） */
  fieldKeys?: string[];
  /** FieldSelect 字段清单与类型表（由调用方传入；空 = 无字段源，字段键回落普通输入） */
  fields?: string[];
  types?: Record<string, string>;
  /** 字段键行 FieldSelect 的类型置顶——调用方按算子/聚合场景传入
   *  （ClauseNode term/terms/prefix→keyword、range→date/数值族；排序行已有 typeFilter SORTABLE_TYPES 范式）。
   *  缺省空 = FieldSelect 归一 null 纯 rank 平铺，既有调用方零增量。 */
  typePriority?: string[];
}>(), { schema: () => [], depth: 0, pathPrefix: '', fieldKeys: () => [], fields: () => [], types: () => ({}), typePriority: () => [] });
const emit = defineEmits<{ (e: 'update', v: Record<string, unknown> | unknown[]): void }>();

const newKey = ref('');
const collapsed = ref(new Set<string>());
const isArr = computed(() => Array.isArray(props.value));

type Kind = 'string' | 'number' | 'numstr' | 'boolean' | 'null' | 'object' | 'array';
type Row = { key: string; val: unknown; kind: Kind; raw: string };
const rows = computed((): Row[] => Object.entries(props.value as Record<string, unknown>).map(([key, val]) => {
  let kind: Kind = 'string';
  if (val === null) kind = 'null';
  else if (Array.isArray(val)) kind = 'array';
  else if (typeof val === 'object') kind = 'object';
  else if (typeof val === 'boolean') kind = 'boolean';
  else if (typeof val === 'number') kind = 'number';
  return { key, val, kind, raw: val === null ? 'null' : String(val) };
}));

const schemaOpt = (k: string) => props.schema.find(s => s.key === k && s.kind === 'enum')?.options || null;
/* 键名命中字段键名单且确有字段源时才走 FieldSelect（缺字段源回落普通输入） */
const isFieldKey = (k: string) => props.fieldKeys.includes(k) && props.fields.length > 0;
/* 【W3b】字段键的数组值：子表逐项 FieldSelect——把数组序号当作字段键名单传给子实例 */
const childFieldKeys = (row: Row): string[] =>
  row.kind === 'array' && isFieldKey(row.key)
    ? (row.val as unknown[]).map((_, i) => String(i))
    : [];

function setChild(k: string, v: unknown) {
  if (Array.isArray(props.value)) {
    const n = props.value.slice(); n[Number(k)] = v as unknown;
    emit('update', n); return;
  }
  emit('update', { ...props.value, [k]: v });
}
function removeKey(k: string) {
  if (Array.isArray(props.value)) {
    const n = props.value.slice(); n.splice(Number(k), 1);
    emit('update', n); return;
  }
  const n = { ...props.value }; delete n[k]; emit('update', n);
}
/* 保键序仅对非整数型键名成立（JS 整数键恒升序重排） */
function renameKey(oldK: string, newK: string): boolean {
  if (Array.isArray(props.value)) return false;
  if (!newK || newK === oldK || newK in props.value || !(oldK in props.value)) return false;
  const n: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props.value)) n[k === oldK ? newK : k] = v;
  emit('update', n);
  return true;
}
function onScalar(k: string, raw: string, kind: Kind) {
  if (kind === 'number') {
    const n = Number(raw);
    setChild(k, raw.trim() !== '' && !isNaN(n) ? n : raw);   // 非数字按字符串保留（标黄由 numstr 态负责）
  } else if (kind === 'null') setChild(k, raw === 'null' ? null : raw);
  else setChild(k, raw);
}
function addKey() {
  if (Array.isArray(props.value)) {
    emit('update', [...props.value, '']); return;   // 数组添加 = 尾部推空串
  }
  const k = newKey.value.trim();
  if (!k || k in props.value) return;
  emit('update', { ...props.value, [k]: '' });
  newKey.value = '';
}
function toggle(k: string) {
  const s = new Set(collapsed.value);
  s.has(k) ? s.delete(k) : s.add(k);
  collapsed.value = s;
}
</script>

<style scoped>
.gp { font-size: var(--fs-sm); }
/* 深嵌套防挤：每层缩进 14→10px + 键名宽 130→110px——嵌套 params（如多层 aggs）每层少啃 24px 可用宽度 */
.gp-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin: var(--sp-1) 0 var(--sp-1) calc(var(--d, 0) * 10px); }
.gp-k { width: 110px; height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); }
.gp-v { height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); flex: 1 1 100px; min-width: 0; }
.gp-v.warn { border-color: var(--warn); }
.gp-sub { flex-basis: 100%; }
/* 字段键行内的 FieldSelect 对齐 .gp-v 的 flex 形态（吃满剩余宽度、高度同键值行） */
.gp-row :deep(.gp-fs) { flex: 1 1 100px; min-width: 0; }
.gp-row :deep(.gp-fs .fs-inp) { height: 28px; }
.gp-add { display: flex; gap: var(--sp-2); margin-top: var(--sp-1); margin-left: calc(var(--d, 0) * 10px); }
.gp-add .inp { width: 110px; height: 28px; font-size: var(--fs-sm); }
</style>
