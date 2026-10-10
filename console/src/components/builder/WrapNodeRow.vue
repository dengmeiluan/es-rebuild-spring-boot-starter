<template>
  <div class="wnr" draggable="true" @dragstart.stop="onDragStart" @dragend="endDrag">
    <div class="wnr-hd">
      <span class="wnr-grip" title="拖拽">⋮⋮</span>
      <span class="wnr-op">{{ WRAP_LABEL[node.op] || node.op }}</span>
      <code class="wnr-fk">{{ WRAP_FIELD[node.op] }}</code>
      <FieldSelect
        :model-value="node.field" :fields="fields" :types="types" :type-priority="wrapperPriority"
        @update:model-value="v => emit('update:node', { ...node, field: v })"
      />
      <span style="flex:1"></span>
      <button aria-label="参数（score_mode 等）" class="btn sm ghost" :class="{ on: showParams }" title="参数（score_mode 等）"
              @click="showParams = !showParams">
<SlidersHorizontal :size="12" />
</button>
      <button aria-label="包成 bool 组" class="btn sm ghost" title="包成 bool 组" @click="emit('wrap')"><Group :size="12" /></button>
      <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="emit('remove')"><X :size="12" /></button>
    </div>
    <div v-if="showParams" class="wnr-params">
      <GenericParams :value="node.params" path-prefix="" @update="onParams" />
    </div>
    <div class="wnr-body">
      <NodeRenderer
        v-if="node.child" :node="node.child" :fields="fields" :types="types"
        @update:node="n => emit('update:node', { ...node, child: n })"
        @remove="emit('update:node', { ...node, child: null })"
        @wrap="emit('update:node', { ...node, child: wrapInBool(node.child!, node.child!.id) })"
      />
      <button v-else class="btn sm ghost" @click="addChild"><Plus :size="12" /> 加子查询（bool 组）</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/* W1：nested/has_child/has_parent 包装节点。child=null 时序列化兜底 match_all（ 契约）。
   子节点不传给解散入口（dissolve 仅支持 bool-in-bool）。 */
import { ref, computed } from 'vue';
import { X, Group, Plus, SlidersHorizontal } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import GenericParams from './GenericParams.vue';
import NodeRenderer from './NodeRenderer.vue';
import { DRAG_KEY, fireDrag } from './treeBus';
import { WRAP_FIELD, nid, wrapInBool, type WrapNode, type BoolNode } from '../../utils/queryAst';

const props = defineProps<{ node: WrapNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{
  (e: 'update:node', n: WrapNode): void; (e: 'remove'): void; (e: 'wrap'): void;
}>();

const WRAP_LABEL: Record<string, string> = { nested: '嵌套', has_child: '子文档', has_parent: '父文档' };
/* 【W3b】包装路由字段的类型置顶按 node.op 分派——实地核真 useIndexFields.walk：mapping 里
   type:'nested'/'join' 按原类型入表、纯 properties 节点入 'object'，包装路由字段（nested 的
   path / has_child·has_parent 的 join 字段名）类型是 nested/object/join，原 ['keyword'] 置顶
   基本永不命中（打空）。nested→嵌套路径（nested/object 置顶）；has_child/has_parent→join 字段；
   未知 wrap 算子回落 keyword（keyword 精确语义兜底）。typePriority 只重排候选分组、不改候选集；
   fields 传参与 dsl-assist 计数链路不动（fieldPickerPenetration 契约）。 */
const WRAPPER_PRIORITY_BY_OP: Record<string, string[]> = {
  nested: ['nested', 'object'],
  has_child: ['join'],
  has_parent: ['join'],
};
const wrapperPriority = computed<string[]>(() => WRAPPER_PRIORITY_BY_OP[props.node.op] || ['keyword']);
const showParams = ref(false);

function addChild() {
  const g: BoolNode = { id: nid(), type: 'bool', children: [], params: {}, arrForm: {} };
  emit('update:node', { ...props.node, child: g });
}
/* params 恒为对象：GenericParams 的 update 联合类型在此收窄（数组分支不会出现，守卫兜底） */
function onParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) emit('update:node', { ...props.node, params: v });
}
function onDragStart(e: DragEvent) {
  (window as any)[DRAG_KEY] = props.node.id;
  e.dataTransfer?.setData('text/plain', props.node.id);
  fireDrag(true);
}
function endDrag() { delete (window as any)[DRAG_KEY]; fireDrag(false); }
</script>

<style scoped>
.wnr { border: 1px solid var(--line-strong); border-radius: var(--r-s); background: var(--bg1); padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-2); }
.wnr-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.wnr-grip { cursor: grab; color: var(--tx2); font-size: var(--fs-xs); user-select: none; }
.wnr-op { font-size: var(--fs-sm); font-weight: 600; color: var(--ac-hi); }
.wnr-fk { font-size: var(--fs-2xs); color: var(--tx2); }
.wnr-params { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.wnr-body { margin-top: var(--sp-2); padding-left: var(--sp-2); border-left: 2px solid var(--line); }
</style>
