<template>
  <!-- follow 档视图页内只读「当前索引」chip——选索引入口收敛 TopBar 唯一处
       （别名组/recent/健康度都在顶栏），本件只读 store 自显 + 三个助攻动作。
       未选索引整件不渲染（根 v-if），页内空态兜底契约留给各视图。 -->
  <span v-if="store.pickedIdx" class="cic" :title="store.pickedIdx">
    <span class="cic-dot" :class="'h-' + (store.pickedInfo?.health || 'grey')" aria-hidden="true"></span>
    <span class="cic-nm">{{ store.pickedIdx }}</span>
    <span v-if="meta" class="cic-meta">{{ meta }}</span>
    <button aria-label="去索引工作区" class="cic-btn" title="去索引工作区" @click="gotoIndices"><ExternalLink :size="11" /></button>
    <button aria-label="复制深链" class="cic-btn" title="复制深链（含 ?idx=，分享直达本页）" @click="copyLink"><Copy :size="11" /></button>
    <button aria-label="清除当前索引" class="cic-btn" title="清除当前索引（清除后跟随顶栏）" @click="store.pick('')"><X :size="11" /></button>
  </span>
</template>

<script setup lang="ts">
/* follow 档视图页内 IndexPicker 退役配套件——无 props 自读 store
   （pickedIdx/pickedInfo/pick）。健康色点沿用 IndexOptionRow .ior-dot 色映射
   （green→ok/yellow→warn/red→err/未知灰）；docs·size 小字与 TopBar idx-meta 同口径。 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Copy, ExternalLink, X } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { copyText, fmtNum, fmtSize } from '../utils/format';

const store = useAppStore();
const router = useRouter();

const meta = computed(() => {
  const i = store.pickedInfo;
  if (!i) return '';
  return [i['docs.count'] ? fmtNum(i['docs.count']) + ' docs' : '', i['store.size'] ? fmtSize(i['store.size']) : ''].filter(Boolean).join(' · ');
});

function gotoIndices() {
  void router.push('/indices');
}

/* hash 路由（createWebHashHistory），?idx= 走 hash query（useUrlState 同通道）——
   构造 origin+path+#/当前页?idx=，不依赖 route 对象（测试端轻 mock router 兼容） */
async function copyLink() {
  const base = (window.location.hash || '#/').split('?')[0];
  const url = window.location.origin + window.location.pathname + base + '?idx=' + encodeURIComponent(store.pickedIdx);
  const ok = await copyText(url);
  store.notify(ok ? 'success' : 'error', ok ? '深链已复制' : '复制失败：浏览器拦截了剪贴板');
}
</script>

<style scoped>
.cic {
  display: inline-flex; align-items: center; gap: var(--sp-1h); max-width: 360px;
  padding: 3px var(--sp-1) 3px 9px; border: 1px solid var(--line); border-radius: 99px;
  background: var(--bg2); font-family: var(--mono, ui-monospace, monospace); font-size: var(--fs-xs);
  vertical-align: middle;
}
/* 健康色点：IndexOptionRow .ior-dot 同源色映射（token 单一出处） */
.cic-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--tx2); }
.cic-dot.h-green { background: var(--ok); }
.cic-dot.h-yellow { background: var(--warn); }
.cic-dot.h-red { background: var(--err); }
.cic-nm { color: var(--tx0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cic-meta { flex: none; color: var(--tx2); white-space: nowrap; }
.cic-btn {
  flex: none; display: inline-flex; align-items: center; border: none; background: none;
  color: var(--tx2); cursor: pointer; padding: var(--sp-0); border-radius: var(--r-xs);
}
.cic-btn:hover { color: var(--tx0); background: var(--hover); }
.cic-btn:focus-visible { outline: 1px solid var(--acc); }
</style>
