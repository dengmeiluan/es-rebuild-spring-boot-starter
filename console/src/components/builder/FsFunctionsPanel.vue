<template>
  <div class="fsfn">
    <!-- 989：function_score functions 数组结构化编辑（WrapNodeRow 专属面板）。
     AST 零改动：functions 仍在 node.params 原样往返，本组件只做 params.functions 的
     行列表投影——项形态 = 通用键(filter/weight) + 唯一类型键；无类型键 = weight 裸项；
     多类型键/未知键 = 自定义形态（只读类型位，参数走整项递归表防丢数据）。 -->
    <div v-for="(f, i) in fns" :key="i" class="fsfn-row">
      <span class="fsfn-idx mono">{{ i + 1 }}</span>
      <select class="inp fsfn-type" :value="typeOf(f) ?? 'custom'" :disabled="typeOf(f) === null"
              :title="typeOf(f) === null ? '自定义函数形态：类型位锁定，参数走右侧整项编辑防丢数据' : '函数类型'"
              @change="setFnType(i, ($event.target as HTMLSelectElement).value)">
        <option v-for="t in FN_TYPES" :key="t.k" :value="t.k">{{ t.label }}</option>
        <option v-if="typeOf(f) === null" value="custom">自定义形态</option>
      </select>
      <label class="fsfn-wlb">weight</label>
      <input class="inp fsfn-w mono" :value="(f as Record<string, unknown>).weight ?? ''" placeholder="—"
             title="全函数通用权重（可留空）" @input="patchWeight(i, ($event.target as HTMLInputElement).value)" />
      <button aria-label="函数参数" class="btn sm ghost" :class="{ on: bodyIdx === i }" :disabled="typeOf(f) === null"
              title="函数主参数（field/modifier/origin/scale/script…）" @click="bodyIdx = bodyIdx === i ? null : i">
        <SlidersHorizontal :size="12" />
      </button>
      <button aria-label="filter 过滤" class="btn sm ghost" :class="{ on: filterIdx === i }"
             title="filter：该函数只作用于命中的文档子集" @click="filterIdx = filterIdx === i ? null : i">
        <Filter :size="12" />
      </button>
      <button aria-label="删除函数" class="btn sm ghost danger" title="删除函数" @click="del(i)"><X :size="12" /></button>
      <div v-if="bodyIdx === i && typeOf(f)" class="fsfn-sub">
        <GenericParams :value="bodyOf(f)" path-prefix="" @update="v => { if (!Array.isArray(v)) patchBody(i, v); }" />
      </div>
      <div v-if="filterIdx === i" class="fsfn-sub">
        <GenericParams :value="filterOf(f)" path-prefix="" @update="v => { if (!Array.isArray(v)) patchFilter(i, v); }" />
      </div>
    </div>
    <div class="fsfn-row fsfn-add-row">
      <button class="btn sm ghost fsfn-add" @click="add"><Plus :size="12" /> 加函数</button>
      <span v-if="!fns.length" class="fsfn-none">无评分函数（query 命中统一计分）</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { X, Plus, SlidersHorizontal, Filter } from 'lucide-vue-next';
import GenericParams from './GenericParams.vue';

const props = defineProps<{ params: Record<string, unknown> }>();
const emit = defineEmits<{ (e: 'update', params: Record<string, unknown>): void }>();

/* 类型全集：k = ES 函数键（weight 裸项无类型键），label 中文 */
const FN_TYPES: Array<{ k: string; label: string }> = [
  { k: 'weight', label: '裸权重 weight' },
  { k: 'field_value_factor', label: '字段值因子' },
  { k: 'random_score', label: '随机评分' },
  { k: 'script_score', label: '脚本评分' },
  { k: 'gauss', label: '高斯衰减' },
  { k: 'linear', label: '线性衰减' },
  { k: 'exp', label: '指数衰减' },
];
const TYPE_KEYS = new Set(FN_TYPES.map(t => t.k));

const fns = computed<Record<string, unknown>[]>(() =>
  Array.isArray(props.params.functions) ? (props.params.functions as Record<string, unknown>[]) : []);

const isGeneric = (k: string) => k === 'filter' || k === 'weight';
function typeOf(fn: Record<string, unknown>): string | null {
  const keys = Object.keys(fn).filter(k => !isGeneric(k));
  if (!keys.length) return 'weight';
  return keys.length === 1 && TYPE_KEYS.has(keys[0]) ? keys[0] : null;
}
function bodyOf(fn: Record<string, unknown>): Record<string, unknown> {
  const t = typeOf(fn);
  const body = t && t !== 'weight' ? fn[t] : undefined;
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
function filterOf(fn: Record<string, unknown>): Record<string, unknown> {
  const fl = fn.filter;
  return fl && typeof fl === 'object' && !Array.isArray(fl) ? (fl as Record<string, unknown>) : {};
}

function write(list: Record<string, unknown>[]) {
  emit('update', { ...props.params, functions: list });
}
function patchAt(i: number, fn: Record<string, unknown>) {
  write(fns.value.map((f, j) => (j === i ? fn : f)));
}

/* 换类型：保留通用键（filter/weight），旧类型键退役换安全初值（ClauseNode onOp 同语言）；
 weight↔weight 无操作；自定义形态锁定不可达（select disabled） */
function setFnType(i: number, t: string) {
  const fn = fns.value[i];
  if (typeOf(fn) === t) return;
  const next: Record<string, unknown> = {};
  if ('filter' in fn) next.filter = fn.filter;
  if ('weight' in fn) next.weight = fn.weight;
  if (t !== 'weight') next[t] = defaultBody(t);
  patchAt(i, next);
}
function defaultBody(t: string): Record<string, unknown> {
  if (t === 'field_value_factor') return { field: '', modifier: 'none' };
  if (t === 'script_score') return { script: { source: '' } };
  if (t === 'gauss' || t === 'linear' || t === 'exp') return { field: '', origin: '', scale: '' };
  return {};   // random_score
}
function patchBody(i: number, body: Record<string, unknown>) {
  const fn = fns.value[i];
  const t = typeOf(fn);
  if (!t || t === 'weight') return;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fn)) if (k !== t) next[k] = v;
  next[t] = body;
  patchAt(i, next);
}
function patchFilter(i: number, fl: Record<string, unknown>) {
  const fn = fns.value[i];
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fn)) if (k !== 'filter') next[k] = v;
  if (Object.keys(fl).length) next.filter = fl;   // 清空 = 键退役
  patchAt(i, next);
}
function patchWeight(i: number, raw: string) {
  const fn = fns.value[i];
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fn)) if (k !== 'weight') next[k] = v;
  const n = Number(raw);
  if (raw !== '' && Number.isFinite(n)) next.weight = n;   // 空串删键；非数字中间态不写
  patchAt(i, next);
}
function del(i: number) { write(fns.value.filter((_, j) => j !== i)); }
function add() {
  write([...fns.value, { weight: 1 }]);
  bodyIdx.value = null; filterIdx.value = null;
}

const bodyIdx = ref<number | null>(null);
const filterIdx = ref<number | null>(null);
</script>

<style scoped>
.fsfn { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.fsfn-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin: var(--sp-1) 0; }
.fsfn-idx { font-size: var(--fs-2xs); color: var(--tx2); min-width: 14px; text-align: right; }
.fsfn-type { height: 28px; font-size: var(--fs-sm); min-width: 128px; }
.fsfn-wlb { font-size: var(--fs-2xs); color: var(--tx2); }
.fsfn-w { width: 72px; height: 28px; font-size: var(--fs-sm); }
.fsfn-row .btn { flex: none; }
.fsfn-sub { flex-basis: 100%; padding: var(--sp-2) var(--sp-3); background: var(--bg1); border-radius: var(--r-s); }
.fsfn-add-row { margin-top: var(--sp-2); }
.fsfn-none { font-size: var(--fs-xs); color: var(--tx2); }
</style>
