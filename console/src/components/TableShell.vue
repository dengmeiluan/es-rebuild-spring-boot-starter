<!--  W-D：RT/QRT 模板层公共壳（渐进第一刀：只收「模板结构+样式」，composables 接线仍留各自内核）。
     三件套同文件：
     · TableShell（default）——工具行卡壳：容器与右簇 div 的结构层收编（RT .rt-bar/.rt-bar-r 与
       QRT .qrt-bar/.qrt-bar-r 同构逐行），内容由内核经 bar-left/bar-right 槽注入。
       钮组不进壳： toolbarParityGuard 锚两内核源码字面量（行高·/ColPicker/RotateCcw/
       FileDown/cycleRowH），且两内核工具簇宿主能力各异（RT pending/快照/反选 vs QRT 四格式
       导出钮组）——该段微差不抽，宁少勿烂。
     · TableExpandRow —— 行内展开详情行（W7 起 RT/QRT 逐字节同构：tr.rt-expand + 头行 + JsonTree）。
     · TableBacktop —— 长列表回顶钮（双表同款）；class 由调用方透传，DOM 逐字节不变。
     未收编段（记档，两内核行为有微差，宁少勿烂）：tfoot 聚合行（RT 多勾选/操作列空位 cell）、
     空态/骨架四态链（RT 在 rt-wrap 内 5 条 h26 vs QRT 根级 v-if 链 3 条 h30）、列头双层
     （RT rt-th-in flex 包裹+lucide 排序图标 vs QRT 平铺+文本箭头）、截断提示行（文案差异 +
     autoRenderMore446/rtRenderMore525 锚源码字面量）。 -->
<script lang="ts">
import { defineComponent, h, type PropType } from 'vue';
import { ArrowUp, X } from 'lucide-vue-next';
import JsonTree from './JsonTree.vue';

/* 行内展开详情行——W7 双内核同构段收编。open=false 渲染 null（与原 v-if tr 同为占位，
   单根不产生 fragment，规避 T39 叠挂卸载断裂）。 */
export const TableExpandRow = defineComponent({
  name: 'TableExpandRow',
  props: {
    open: { type: Boolean, default: false },
    colspan: { type: Number, required: true },
    label: { type: String, default: '' },
    /* RT 传 _id 作 title；QRT 不传 → 属性缺席（与两内核现状一致） */
    labelTitle: { type: String as PropType<string | undefined>, default: undefined },
    data: { type: Object as PropType<Record<string, any> | null>, default: null },
  },
  emits: { close: () => true },
  setup(props, { emit }) {
    return () => props.open
      ? h('tr', { class: 'rt-expand' }, [
          h('td', { colspan: props.colspan }, [
            h('div', { class: 'rt-expand-hd mono' }, [
              h('span', { title: props.labelTitle }, props.label),
              h('button', {
                class: 'rt-expand-close',
                'aria-label': '收起此行详情',
                title: '收起此行详情（Esc 全部收起）',
                onClick: () => emit('close'),
              }, [h(X, { size: 11 })]),
            ]),
            h(JsonTree, { data: props.data, tools: true, maxChildren: 200, maxStrLen: 4000 }),
          ]),
        ])
      : null;
  },
});

/* 长列表回顶钮—— RT/QRT 同款；class/aria-label/title 由调用方透传（attr fallthrough
   落到根 button）—— a11y 守卫锚两内核源码 aria-label="回到顶部" 字面量，串必须留在
   内核文件；样式仍留各自内核 scoped（子组件根继承父 scopeId，零样式迁移）。 */
export const TableBacktop = defineComponent({
  name: 'TableBacktop',
  emits: { top: () => true },
  setup(_, { emit }) {
    return () => h('button', { onClick: () => emit('top') }, [h(ArrowUp, { size: 13 }), ' 回顶']);
  },
});
</script>

<script setup lang="ts">
/* 工具行卡壳容器：RT/QRT 同一卡头语言（上圆角+无底边框+左计数/右工具簇）。
   类名以 props 注入（'rt-bar'/'rt-bar-r'、'qrt-bar'/'qrt-bar-r'）——守卫在内核源码
   indexOf 这些类名串定位钮序，串必须留在内核文件；子组件根元素继承父 scopeId，
   内核 scoped 的 .rt-bar/.qrt-bar 规则照常命中，样式零迁移。 */
defineProps<{
  /* 卡头容器类（内核各自前缀：rt-bar / qrt-bar） */
  barClass: string;
  /* 右侧工具簇容器类（rt-bar-r / qrt-bar-r） */
  barRClass: string;
  /* 筛选组合档透传（缺省 'AND' 向后兼容——双内核提示行/弹层槽
     注入位已有档位钮，壳不自渲染，经 bar-left 作用域槽下发；既有非作用域槽用法对槽参
     零感知零影响，未接线消费方下批可经槽参或直连 useFilterMode 消费） */
  filterMode?: 'AND' | 'OR';
}>();
</script>

<template>
  <div :class="barClass">
    <slot name="bar-left" :filter-mode="filterMode ?? 'AND'" />
    <div :class="barRClass">
      <slot name="bar-right" />
    </div>
  </div>
</template>

<!-- 展开行样式为何不 scoped：TableExpandRow 是渲染函数组件（named export），其 vnode 无
     本 SFC 模板 scopeId，scoped 规则打不中；类名 rt-expand 系仅 RT/QRT 两内核使用
     （收编前两处 scoped 定义逐字相同），全局单一出处=纯去重无泄漏面。 -->
<!-- 工具行右簇样式为何也不 scoped：.rt-bar-r/.qrt-bar-r div 是本壳模板内部元素（非槽内容），
     只带本壳 scopeId——且本壳 style 全部非 scoped，模板元素连 scopeId 都不分派（
     工蚁1 诊断锁实锤：.rt-bar-r 元素 data-v 属性为空）。内核 scoped 的右簇规则自 527 收编
     起从未命中（死规则，迁出），生效面只能住本壳全局 style：类名由 props 注入
     （'rt-bar-r'/'qrt-bar-r'），双内核类名锚定单源。 -->
<style>
/* ═══ ：行内展开详情行（RT/QRT 双份同构样式收编单一出处）═══ */
.rt-expand > td { background: var(--bg2); border-top: 1px solid var(--line); padding: var(--sp-2) var(--sp-2h); vertical-align: top; }
.rt-expand-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-1); }
.rt-expand-close { border: 0; background: none; color: var(--tx2); cursor: pointer; padding: 0 var(--sp-0); }
.rt-expand-close:hover { color: var(--err); }

/* ═══  工蚁1：工具行右簇纪律（壳级新家，RT/QRT 单源）═══
   根因：勾选态「反选」钮使右簇变宽，工具行收缩压力全落在左簇文本 item → 文本折行
   撑成两行、右簇溢出悬挂；且 527 收编后内核 scoped 右簇规则因 scopeId 不传播而失效，
   右簇实际裸 inline 排列（无 flex/gap/垂直居中）。纪律：
   · 右簇复活 flex 并禁 wrap（单行）+ flex-shrink:0（整簇不参与收缩分配——工具钮恒完整）；
   · 右簇子项全部 shrink:0（按钮/分隔条/ColPicker 不被压缩折行，.btn 自带 white-space:nowrap
     承接文本不折），26px 控制线零触；
   · 左簇收缩缓冲在两内核（.rt-info/.qrt-coln ellipsis——见各内核 554 注释）。
   ⚠本块须保持非 scoped：壳模板元素无 scopeId，scoped 编译出的 [data-v-x] 打不中。 */
.rt-bar-r, .qrt-bar-r { display: flex; gap: var(--sp-1); align-items: center; flex-wrap: nowrap; flex-shrink: 0; }
.rt-bar-r > *, .qrt-bar-r > * { flex-shrink: 0; }
</style>
