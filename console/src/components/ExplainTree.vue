<template>
  <div class="xt-node" :style="{ '--xt-depth': depth }">
    <div class="xt-row" :class="kindClass" role="button" tabindex="0" :aria-expanded="open" @click="open = !open" @keydown.enter.prevent="open = !open" @keydown.space.prevent="open = !open">
      <ChevronRight v-if="hasKids" :size="10" class="xt-caret" :class="{ open }" />
      <span v-else class="xt-caret-ph" />
      <span class="xt-val" :title="String(node.value)">{{ fmtVal(node.value) }}</span>
      <span class="xt-bar-wrap">
        <span class="xt-bar" :class="kindClass" :style="{ width: pct + '%' }" />
      </span>
      <span class="xt-pct">{{ pct.toFixed(1) }}%</span>
      <span v-if="kind" class="xt-kind" :class="kindClass">{{ kind }}</span>
      <span class="xt-desc" :title="node.description">{{ shortDesc }}</span>
    </div>
    <div v-if="open && hasKids" class="xt-kids">
      <ExplainTree v-for="(d, i) in node.details" :key="i" :node="d" :total="total" :depth="depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ChevronRight } from 'lucide-vue-next';

/**
 * R32：BM25 explanation 递归树。
 * node 形如 { value, description, details: [...] }（ES explain 原始结构）。
 * total 为根节点分值，用于计算每个节点的贡献百分比。
 */
const props = defineProps<{ node: any; total: number; depth: number }>();

const open = ref(props.depth < 2); // 默认展开前两层

const hasKids = computed(() => Array.isArray(props.node?.details) && props.node.details.length > 0);

const pct = computed(() => {
  const t = props.total || 0;
  const v = Number(props.node?.value) || 0;
  if (t <= 0) return 0;
  return Math.min(100, Math.max(0, (v / t) * 100));
});

/** 因子归类：weight/tf/idf/boost/norm/combine —— 决定颜色 */
const kind = computed(() => {
  const d = String(props.node?.description || '').toLowerCase();
  if (d.startsWith('weight(')) return 'weight';
  if (d.startsWith('idf')) return 'idf';
  if (d.startsWith('tf') || d.includes('freq,')) return 'tf';
  if (d.includes('boost')) return 'boost';
  if (d.includes('norm') || d.includes('dl,') || d.includes('avgdl')) return 'norm';
  if (d.startsWith('sum of') || d.startsWith('max of') || d.startsWith('product of') || d.startsWith('min of')) return 'combine';
  if (d.includes('script')) return 'script';
  if (d.includes('constant')) return 'const';
  return '';
});

const kindClass = computed(() => (kind.value ? 'xk-' + kind.value : ''));

const shortDesc = computed(() => {
  const d = String(props.node?.description || '');
  return d.length > 160 ? d.slice(0, 157) + '…' : d;
});

function fmtVal(v: any) {
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  return n.toFixed(4).replace(/\.?0+$/, '') || '0';
}
</script>

<style scoped>
.xt-node { font-size: var(--fs-xs); }
.xt-row {
  display: flex; align-items: center; gap: var(--sp-1h);
  padding: 3px var(--sp-1h) 3px calc(6px + var(--xt-depth) * 14px);
  border-radius: var(--r-xs); cursor: pointer; line-height: 1.5;
}
.xt-row:hover { background: var(--hover); }
.xt-caret { flex: none; transition: transform .12s; opacity: .55; }
.xt-caret.open { transform: rotate(90deg); }
.xt-caret-ph { width: 10px; flex: none; }
/* 第十批收尾：删死 fallback（.xt-val/.xt-pct/.xt-desc 共 3 处 mono 同族清理，--mono 已在 theme.css 定义） */
.xt-val { flex: none; min-width: 62px; text-align: right; font-family: var(--mono); font-weight: 600; }
.xt-bar-wrap { flex: none; width: 90px; height: 6px; border-radius: 3px; background: var(--bg2); overflow: hidden; }
.xt-bar { display: block; height: 100%; border-radius: 3px; background: var(--dv-slate); }
.xt-pct { flex: none; min-width: 44px; text-align: right; font-family: var(--mono); opacity: .65; }
.xt-kind {
  flex: none; padding: 0 5px; border-radius: 3px; font-size: var(--fs-2xs); font-weight: 650;
  text-transform: uppercase; letter-spacing: .4px; background: var(--bg2);
}
.xt-desc { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .85; font-family: var(--mono); }
.xt-kids { border-left: 1px dashed var(--line-strong); margin-left: calc(11px + var(--xt-depth) * 14px); }

/* 因子配色：weight 蓝 · idf 紫 · tf 青 · boost 橙 · norm 绿 · combine 灰 */
/* 第十批：四枚举 -soft 并入 var()——原 var(--x)-soft 非法、整条声明被解析器丢弃，徽标实际无底色 */
.xk-weight.xt-bar, .xt-bar.xk-weight { background: var(--dv-blue); }
.xt-kind.xk-weight { color: var(--dv-blue); background: var(--dv-blue-soft); }
.xk-idf.xt-bar, .xt-bar.xk-idf { background: var(--dv-violet); }
.xt-kind.xk-idf { color: var(--dv-violet); background: var(--dv-violet-soft); }
.xk-tf.xt-bar, .xt-bar.xk-tf { background: var(--dv-cyan); }
.xt-kind.xk-tf { color: var(--dv-cyan); background: var(--dv-cyan-soft); }
.xk-boost.xt-bar, .xt-bar.xk-boost { background: var(--warn); }
.xt-kind.xk-boost { color: var(--warn); background: var(--warn-soft); }
.xk-norm.xt-bar, .xt-bar.xk-norm { background: var(--ok); }
.xt-kind.xk-norm { color: var(--ok); background: var(--ok-soft); }
.xk-combine.xt-bar, .xt-bar.xk-combine { background: var(--tx2); }
.xt-kind.xk-combine { color: var(--tx2); }
.xk-script.xt-bar, .xt-bar.xk-script { background: var(--dv-pink); }
.xt-kind.xk-script { color: var(--dv-pink); background: var(--dv-pink-soft); } /* 第十批：同上 -soft 修复 */
.xk-const.xt-bar, .xt-bar.xk-const { background: var(--dv-slate); }
.xt-kind.xk-const { color: var(--dv-slate); }
</style>
