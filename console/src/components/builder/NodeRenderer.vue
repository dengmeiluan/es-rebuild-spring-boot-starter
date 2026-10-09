<template>
  <BoolGroupNode
    v-if="node.type === 'bool'" :node="(node as BoolNode)" :fields="fields" :types="types"
    :can-dissolve="inBool"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')"
    @wrap="emit('wrap')" @dissolve="emit('dissolve')"
  />
  <WrapNodeRow
    v-else-if="node.type === 'wrap'" :node="(node as WrapNode)" :fields="fields" :types="types"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')" @wrap="emit('wrap')"
  />
  <GenericNode
    v-else-if="(node as LeafNode).field === null" :node="(node as LeafNode)"
    :fields="fields" :types="types"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')" @wrap="emit('wrap')"
  />
  <ClauseNode
    v-else :node="(node as LeafNode)" :fields="fields" :types="types"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')" @wrap="emit('wrap')"
  />
</template>

<script setup lang="ts">
/* W1：节点分派器——bool→组容器；wrap→包装行；field=null 叶子→通用结构化节点；其余→富表单条件行。
   inBool 标记父级是否 bool（决定子 bool 是否给「解散」入口）。 */
import BoolGroupNode from './BoolGroupNode.vue';
import WrapNodeRow from './WrapNodeRow.vue';
import GenericNode from './GenericNode.vue';
import ClauseNode from './ClauseNode.vue';
import type { QueryNode, BoolNode, WrapNode, LeafNode } from '../../utils/queryAst';

defineProps<{ node: QueryNode; fields: string[]; types: Record<string, string>; inBool?: boolean }>();
const emit = defineEmits<{
  (e: 'update:node', n: QueryNode): void;
  (e: 'remove'): void; (e: 'wrap'): void; (e: 'dissolve'): void;
}>();
</script>
