<template>
  <!-- 五百六十五批：alt 三视图体共享件（DQ 换装落地；IndexHub docs/query 六百六十七批
       解冻收口换装接入——单源第四消费面，565 暂缓记档就此闭环）。
       契约=三处现役绑定的最小集：view=json 渲染高亮 pretty pre（preEl expose 供宿主
       jsonFind 定位链 querySelector/scrollTop）；view=tree 渲染 JsonTree tools 档；
       view=cards 渲染卡片行（前 5 字段+42 截断，@open-doc 交宿主开文档）。
       包裹 div（视图容器类/高度 cap 变量）留在宿主——高度链与视图分档 v-show 归宿主管。 -->
  <!-- json：高亮 pretty 信封只读（v-html 由宿主 markHtmlAll 链产出；类名 json-view=theme 全局档） -->
  <pre v-if="view === 'json'" ref="preEl" class="json-view" v-html="jsonHtml"></pre>
  <!-- tree：JsonTree 统一件 tools 档（DQ 旧体逐字平移） -->
  <JsonTree v-else-if="view === 'tree'" :data="treeData" tools />
  <!-- cards：卡片行（DQ 旧体逐字平移——_id 行 + 前 5 字段行 + 42 截断；点开文档走宿主） -->
  <template v-else-if="view === 'cards'">
    <div v-for="h in hits" :key="h._id" class="dq-card" @click="emit('open-doc', h)" role="button" tabindex="0" @keydown.enter.prevent="emit('open-doc', h)" @keydown.space.prevent="emit('open-doc', h)">
      <div class="dq-card-id mono" :title="h._id">{{ h._id }}</div>
      <div v-for="f in Object.keys(h._source).slice(0, 5)" :key="f" class="dq-card-row">
        <span class="dq-card-k mono" :title="f">{{ f }}</span>
        <span class="dq-card-v mono" :title="String(h._source[f])">{{ trunc(h._source[f], 42) }}</span>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import JsonTree from './JsonTree.vue';
import { trunc } from '../utils/format';
import type { SearchHit } from '../types';

defineProps<{
  /** 渲染形态：json / tree / cards（调用方按自身视图档各挂一件） */
  view: 'json' | 'tree' | 'cards';
  /** json 形态：高亮 pretty HTML（宿主 markHtmlAll/respMark 链产出） */
  jsonHtml?: string;
  /** tree 形态：JsonTree data（DQ=jqResult 回退行集；IH 同构=行集） */
  treeData?: unknown;
  /** cards 形态：卡片行集（DQ 传 cardHits 快滤集；kw 过滤留在宿主） */
  hits?: SearchHit[];
}>();

const emit = defineEmits<{ (e: 'open-doc', hit: SearchHit): void }>();

/* json 形态 pre 元素出口：宿主 jsonFind 命中定位（querySelector data-hit-idx）与
   滚动位归零（scrollTop=0）经此承接——旧 ref="jsonBox" 直挂 pre 的链等价迁移 */
const preEl = ref<HTMLElement | null>(null);
defineExpose({ preEl });
</script>

<style scoped>
/* 卡片内脏样式随迁自 DslQueryView（类名逐字保形——dqResilience546 等 DOM 查询按 .dq-card
   取数不受宿主/组件作用域迁移影响；dq-card-id/-row/-k/-v 四件同批随迁） */
.dq-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-m); padding: var(--sp-2h) var(--sp-3); cursor: pointer; transition: border var(--tr), transform var(--tr); }
.dq-card:hover { border-color: var(--ac-line); transform: translateY(-1px); }
.dq-card-id { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-1h); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dq-card-row { display: flex; gap: var(--sp-2); font-size: var(--fs-xs); line-height: 1.7; }
.dq-card-k { color: var(--ac-hi); flex-shrink: 0; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
.dq-card-v { color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
