<template>
  <Teleport to="body">
    <!-- 1042：fields 形态字段列表多选弹层（ClauseNode 挂接）。搜索 rank 沿用 fieldSearch
         单源（精确/前缀/包含+类型分组），勾选即 emit 全量名单（候选序稳定，手输的非候选
         项保真不丢）；点外部/Esc/完成 收口。定位由父级传入（触发钮下方，右缘钳制），
         float-pop 壳在 theme.css。 -->
    <div class="mfp float-pop" :style="style" @click.stop>
      <input ref="qEl" v-model="q" class="inp mfp-q" placeholder="搜索字段（Enter 无动作，勾选即生效）"
             @keydown.esc.stop="$emit('close')" />
      <label v-for="f in visible" :key="f.path" class="mfp-row">
        <input type="checkbox" :data-path="f.path" :checked="sel.includes(f.path)"
               @change="toggleSel(f.path, ($event.target as HTMLInputElement).checked)" />
        <span class="mfp-path" :title="f.path">{{ f.path }}</span>
        <code class="mfp-type">{{ f.type || '-' }}</code>
      </label>
      <div v-if="!visible.length" class="mfp-none">无匹配字段</div>
      <div class="mfp-foot">
        <span class="mfp-n">已选 {{ sel.length }}</span>
        <span style="flex: 1"></span>
        <button class="btn sm pri" @click="$emit('close')">完成</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { searchFields } from '../../utils/fieldSearch';
const props = withDefaults(defineProps<{
  modelValue: string[];
  fields: string[];
  types?: Record<string, string>;
  style?: Record<string, string>;
}>(), { types: () => ({}), style: () => ({}) });
const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void;
  (e: 'close'): void;
}>();

const q = ref('');
const qEl = ref<HTMLInputElement>();
const sel = ref<string[]>([...props.modelValue]);

onMounted(() => nextTick(() => qEl.value?.focus()));

/* 搜索 rank 单源（fieldSearch）：精确/前缀/包含+类型分组；空查询=纯字母序平铺 */
const visible = computed(() => {
  const items = props.fields.map(p => ({ path: p, type: props.types[p] || '' }));
  return searchFields({ fields: items, query: q.value, cap: 200 }).flat;
});

/* 勾选变化 → 全量名单：候选序（mapping 稳定序）优先，手输的非候选项殿后保真。
   仅在显式勾选时外发（挂载/外部 modelValue 变化不外发——打开选择器不应静默
   改写用户手输的字段顺序）。 */
function toggleSel(path: string, on: boolean) {
  const next = sel.value.filter(f => f !== path);
  if (on) next.push(path);
  sel.value = next;
  const candSet = new Set(props.fields);
  const picked = new Set(sel.value);
  const ordered = props.fields.filter(f => picked.has(f));
  const extras = sel.value.filter(f => !candSet.has(f));
  emit('update:modelValue', [...ordered, ...extras]);
}

function onDocClick() { emit('close'); }
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<style scoped>
.mfp { position: fixed; z-index: 60; width: 320px; max-width: calc(100vw - 16px); max-height: 50vh; overflow-y: auto; padding: var(--sp-2); }
.mfp-q { height: 28px; font-size: var(--fs-sm); margin-bottom: var(--sp-1); }
.mfp-row { display: flex; align-items: center; gap: var(--sp-2); padding: 3px var(--sp-1); border-radius: var(--r-xs); cursor: pointer; font-size: var(--fs-sm); }
.mfp-row:hover { background: var(--hover); }
.mfp-path { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mfp-type { font-size: var(--fs-2xs); color: var(--tx2); }
.mfp-none { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-2); text-align: center; }
.mfp-foot { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); }
.mfp-n { font-size: var(--fs-2xs); color: var(--tx2); }
</style>
