<template>
  <div class="wt-page" ref="rootEl">
    <div class="wt-hd">
      <PageHeader :icon="BellRing" title="Watcher 告警">
      <template #subtitle>
        <span>分布式告警规则列表 · 执行统计 · 元数据检索</span>
        <!-- G2 执行统计 tile 墙退役：6 块 wt-stat 改 inline 元信息串（数据全保留在此与 :title；
             available && raw 与原 <template v-else> 骨架守卫同口径，首载不闪全 0） -->
        <!-- G2 执行统计 tile 墙退役后 inline 串换装 MetaStrip 统一件：started→ok/其余→warn、
             已执行恒 ok、失败>0 err 走组件 tone 档；available && raw 与原骨架守卫同口径，首载不闪全 0 -->
        <MetaStrip v-if="available && raw" class="wt-meta" :items="wtMeta" :title="'节点 ' + fmtNum(nodeCount) + ' · Watch 数（估） ' + fmtNum(watchCount) + ' · 状态 ' + watchState + ' · 队列（当前） ' + fmtNum(queueCurrent) + ' · 已执行 ' + fmtNum(executed) + ' · 失败 ' + fmtNum(failed)" />
      </template>
      <template #actions>
<!-- 五百六十一批：原始请求/响应快查弹窗（RawIo 第六波，558b 判例同形态；
     路径子串 '/cluster/watcher'=本页列表拉取通道，本页独占调用者） -->
<button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（Watcher）" title="最近一次 Watcher 列表拉取请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
<button class="btn ghost sm" @click="load" :disabled="loading">
  <RefreshCcw :size="12" :class="{ spinning: loading }" /> 刷新
</button>
      </template>
      </PageHeader>
</div>

    <!-- G2-B6：首载骨架（loading 初值 true、raw 未回）——加载中不得闪全 0 stats 与
         「当前无 watch 定义」错误空态；手动刷新（raw 已有）保留旧数据不闪骨架（G1 RemoteClusters B3 同构） -->
    <div v-if="loading && !raw" class="wt-loading">
      <SkeletonBox v-for="i in 3" :key="i" height="88px" round />
    </div>
    <template v-else>
    <div v-if="!available" class="wt-alert">
      <AlertTriangle :size="14" />
      <div>
        <div class="wt-alert-tt">Watcher 不可用</div>
        <div class="wt-alert-sub" v-if="isMethodNotAllowed">
          当前集群的 Watcher 接口返回 405 (Method Not Allowed) — 通常表示该集群<b>未安装 X-Pack Watcher 模块</b>（阿里云 ES 部分版本不包含）。请到「集群管理 → 插件」确认已安装的 X-Pack 功能。
        </div>
        <div class="wt-alert-sub" v-else>{{ reason || 'Elastic Watcher 需要商业许可证或未启用 xpack.watcher。' }}</div>
      </div>
      <!-- R92-A2：失败态就地重试，不靠用户自己找刷新入口 -->
      <button class="btn sm" style="margin-left:auto" @click="load" :disabled="loading">重试</button>
    </div>

    <div v-if="available" class="wt-list" role="group" aria-label="watch 清单">
      <!-- 搜索行原为独立横幅，现融合为列表区头部（去独立横幅层）。
           五百四十七批：三胞胎页头过滤胶囊组件化——SearchFilterBar 统一件（图标/Esc 内建），
           落位类 wt-search-head 透传到组件根（scoped 落位样式照常命中）；Enter 接线走组件
           enter 事件（原 input @keydown.enter.prevent 等价，HitNav 键击不误触），Esc 清空
           内建（原 kw = '' 行为等价），HitNav 附加件走默认插槽原位 -->
      <SearchFilterBar v-model="kw" class="wt-search-head" input-class="wt-search-i" placeholder="过滤 watch id / trigger / metadata…" @enter="onHitKey">
        <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在搜索框接线） -->
        <HitNav :count="filteredWatches.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
      </SearchFilterBar>
      <!-- G2-C4：过滤致空与真空分流（G1 C4 同构）——逃生口走 EmptyState 插槽，间距归组件 .es-extra -->
      <!-- 三百四十四批：slice(0,100) 静默截断补计数提示 -->
      <div v-if="filteredTruncated" class="wv-trunc" data-test="wv-trunc">
        watch 较多，已显示前 100 个（共 {{ allWatches.length }} 个）——请用关键字过滤缩小范围
      </div>
      <EmptyState
        v-if="filteredWatches.length === 0 && allWatches.length > 0"
        :icon="Search"
        :text="`无匹配 watch（共 ${allWatches.length} 个，被当前关键字隐藏）`"
      >
        <button class="btn sm ghost" @click="kw = ''">清除过滤</button>
      </EmptyState>
      <EmptyState
        v-else-if="filteredWatches.length === 0"
        :icon="BellRing"
        text="当前无 watch 定义"
        hint="可用 PUT _watcher/watch/<id> 创建，或联系集群管理员启用告警"
        action-text="去 Dev Tools 创建示例 watch →"
        @action="toDevToolsSample"
      />
      <div
        v-for="(w, i) in filteredWatches" :key="w._id"
        class="wt-card" :data-hit-idx="i + 1"
      >
        <div class="wt-card-l">
          <!-- G2-C5：长 watch id 省略 + title 全名可达（§9.5） -->
          <div class="wt-card-tt"><Bell :size="12" class="wt-card-ic" /> <span class="wt-card-id" :title="w._id"><MarkText :text="w._id" :kw="kw" /></span></div>
          <div class="wt-card-sub">Trigger: <code><MarkText :text="triggerLabel(w)" :kw="kw" /></code></div>
          <div class="wt-card-actions" v-if="actionList(w).length > 0">
            Actions: <span v-for="a in actionList(w)" :key="a" class="wt-act"><MarkText :text="a" :kw="kw" /></span>
          </div>
          <div class="wt-card-meta" v-if="w._source?.metadata">
            <!-- 762 G223：触发器键盘可达（757 G208 cd-chip 族）——role/tabindex+Enter 合成
                 click 冒泡到 n-popover trigger 包装层既有通道，show 态仍归组件自管 -->
            <n-popover trigger="click" placement="top" :width="420">
              <template #trigger>
                <code
                  role="button" tabindex="0"
                  aria-label="查看 metadata 全文" title="查看 metadata 全文"
                  @keydown.enter.prevent="onMetaKey" @keydown.space.prevent="onMetaKey"
                >{{ shortJson(w._source.metadata) }}</code>
              </template>
              <pre class="mono json-view wt-meta-json" v-html="highlightJson(prettyJson(w._source.metadata))"></pre>
            </n-popover>
          </div>
        </div>
        <div class="wt-card-r">
          <button class="btn ghost sm" aria-label="编辑此 watch" title="在 DevTools 编辑此 watch（PUT 现定义入 body）" @click="toDevToolsEdit(w)"><Pencil :size="12" /></button>
          <button class="btn ghost sm" title="在 DevTools 打开 GET _watcher/watch/<id>" @click="toDevTools(w)">
            <TerminalSquare :size="12" /> DevTools
          </button>
          <button class="btn ghost sm" @click="copyBody(w)"><Copy :size="12" /> 复制</button>
        </div>
      </div>
    </div>
    </template>

    <!-- 五百六十一批：原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/watcher 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { BellRing, Bell, RefreshCcw, AlertTriangle, Search, Copy, TerminalSquare, Terminal, Pencil } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 五百六十一批：原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useAppStore } from '../stores/app';
import { friendlyEsError } from '../utils/esError';
import { watcherStateZh, watcherStateTone } from '../utils/esEnumZh'; /* 五百三十四批：watcher_state 中文主显收口件 */

import { copyText, fmtNum } from '../utils/format';
import { highlightJson, prettyJson } from '../utils/jsonc';
import { NPopover } from 'naive-ui';
import EmptyState from '../components/EmptyState.vue';
/* 五百四十七批：三胞胎页头过滤胶囊统一件（wt/fv/tg 同场景收编） */
import SearchFilterBar from '../components/SearchFilterBar.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import HitNav from '../components/HitNav.vue';
import MarkText from '../components/MarkText.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* 页头执行统计串统一件 */
import { useHitLocate } from '../composables/useHitNav';

const store = useAppStore();
const router = useRouter();

/* 五百六十一批：原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/watcher');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
/* G2-B6：首帧即 loading（G1 RemoteClusters 范式），不依赖 onMounted 同步置位才不闪错误空态 */
const loading = ref(true);
const available = ref(true);
/* w80:405 Method Not Allowed = 目标集群没装/未启用 Watcher 模块(阿里云 ES 常见),而非配置错误 */
const isMethodNotAllowed = computed(() => {
  const r = (reason.value || '') + '';
  return r.includes('405') || r.toLowerCase().includes('method not allowed');
});
const reason = ref('');
const raw = ref<any>(null);
/* 过滤词走 useScopedDraft 会话草稿（sessionStorage，不进 URL）：同会话刷新/重进页面可复原，
   分享链接不带关键字（762 G221 注释诚实化——748 G176/754 G202/757 G207 同族第四例） */
const kw = useScopedDraft('kw', { route: 'watcher' }, '').text;

async function load() {
  loading.value = true;
  try {
    const r = await api.watcherList();
    raw.value = r || null;
    if (r?.available === false) {
      available.value = false;
      reason.value = r.reason || '';
    } else {
      available.value = true;
    }
  } catch (e: any) {
    available.value = false;
    reason.value = friendlyEsError(String(e?.message ?? e));
  } finally {
    loading.value = false;
  }
}

const stats = computed(() => raw.value?.stats || {});
const nodeCount = computed(() => (stats.value?.stats || []).length);
const watchState = computed(() => stats.value?.watcher_state || (stats.value?.stats?.[0]?.watcher_state) || 'unknown');
const executed = computed(() => sumField('execution_thread_pool.total') + sumField('execution.total'));
const failed = computed(() => sumField('execution.total_failed'));
const queueCurrent = computed(() => sumField('execution_thread_pool.queue_size') || sumField('current_watches.execution_time_in_ms'));

function sumField(path: string): number {
  const arr = stats.value?.stats || [];
  let s = 0;
  arr.forEach((n: any) => {
    const v = path.split('.').reduce((o, k) => o?.[k], n);
    if (typeof v === 'number') s += v;
  });
  return s;
}

/* 页头执行统计串 MetaStrip items——原手写串色档映射：started→ok/其余→warn、
   已执行恒 ok、失败>0 err（0 回中性亮色，全站语言） */
const wtMeta = computed<MetaStripItem[]>(() => [
  { value: fmtNum(nodeCount.value), label: '节点' },
  { value: fmtNum(watchCount.value), label: 'Watch 数（估）' },
  /* 五百三十四批：watcher_state 中文主显（watcherStateZh），英文原值留 tip 保检索；
     tone 走收口件既有口径（started→ok/其余 warn），与原手写三元等价 */
  { value: watcherStateZh(watchState.value), label: '状态', tone: watcherStateTone(watchState.value), tip: watchState.value },
  { value: fmtNum(queueCurrent.value), label: '队列（当前）', tip: '待执行 watch 队列长度（_watcher/stats execution_thread_pool.queue_size 各节点汇总）' },
  { value: fmtNum(executed.value), label: '已执行', tone: 'ok', tip: '累计执行次数（execution.total 与 execution_thread_pool.total 各节点汇总）' },
  { value: fmtNum(failed.value), label: '失败', tone: failed.value > 0 ? 'err' : undefined, tip: '累计失败次数（execution.total_failed 各节点汇总）' },
]);

const allWatches = computed<any[]>(() => {
  const hits = raw.value?.watches?.hits?.hits;
  return Array.isArray(hits) ? hits : [];
});
const watchCount = computed(() => raw.value?.watches?.hits?.total?.value ?? raw.value?.watches?.hits?.total ?? allWatches.value.length);
/* 762 G222：354 批注释宣称「computed 纯化、截断标志改由 watch 驱动」与实况不符（实况 computed
   内写 filteredTruncated ref 的 side-effect 且全文件无 watch）——本批落真纯化：matchedWatches
   同源派生，截断标志亦纯 computed；语义不变（无关键字=全量前 100，有关键字=过滤后前 100） */
const matchedWatches = computed(() => {
  const q = kw.value.trim().toLowerCase();
  return q
    ? allWatches.value.filter(w => JSON.stringify(w).toLowerCase().includes(q))
    : allWatches.value;
});
const filteredTruncated = computed(() => matchedWatches.value.length > 100);
const filteredWatches = computed(() => matchedWatches.value.slice(0, 100));

/* 搜索定位：过滤结果即命中集，卡片按渲染序带 data-hit-idx，Enter/Shift+Enter 逐个跳 */
const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => filteredWatches.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

function triggerLabel(w: any): string {
  const t = w._source?.trigger?.schedule;
  if (!t) return 'unknown';
  if (t.interval) return 'interval ' + t.interval;
  if (t.cron) return 'cron ' + t.cron;
  return Object.keys(t).join(',');
}

function actionList(w: any): string[] {
  const a = w._source?.actions || {};
  return Object.keys(a);
}

function shortJson(x: any): string {
  const s = JSON.stringify(x);
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

/* 762 G223：Enter 合成 click（role=button 键盘等价动作），冒泡到 n-popover trigger
   包装层由组件既有 click 通道接管开合——不二次管理 show 态（G208 cd-chip 同款） */
function onMetaKey(e: KeyboardEvent) {
  (e.currentTarget as HTMLElement | null)?.click();
}

function copyBody(w: any) {
  /* 三百三十九批：诚实口径扫尾（此前无论成败都报成功） */
  copyText(JSON.stringify(w, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'Watch 已复制' : '复制失败'));
}

/* R42-f §8.2：跨工具联动——在 DevTools 里打开该 watch 定义，改完直接 PUT 回去 */
function toDevTools(w: any) {
  sessionStorage.setItem('es-console.devtools.open', JSON.stringify({
    title: 'watch/' + w._id, method: 'GET', path: '/_watcher/watch/' + encodeURIComponent(w._id), run: true,
  }));
  router.push('/devtools');
}

/* 三百四十四批：真空态快捷起步——示例 watch 送入 DevTools（不自动执行） */
function toDevToolsSample() {
  const body = JSON.stringify({
    trigger: { schedule: { interval: '1h' } },
    input: { search: { request: { indices: ['*'], body: { query: { match_all: {} } } } } },
    actions: { log: { action: { logging: { text: 'watch fired' } } } },
  }, null, 2);
  sessionStorage.setItem('es-console.devtools.open', JSON.stringify({
    title: 'watch/sample', method: 'PUT', path: '/_watcher/watch/sample', body, run: false,
  }));
  router.push('/devtools');
}

/* 三百四十四批：PUT 编辑变体——GET 现定义入 body，改完直接 PUT 回写（免手工复制粘贴） */
function toDevToolsEdit(w: any) {
  const body = JSON.stringify(w.watch ?? w, null, 2);
  sessionStorage.setItem('es-console.devtools.open', JSON.stringify({
    title: 'watch/' + w._id + ' 编辑', method: 'PUT',
    path: '/_watcher/watch/' + encodeURIComponent(w._id), body, run: false,
  }));
  router.push('/devtools');
}

onMounted(load);
</script>

<style scoped>
.wv-trunc { padding: var(--sp-1h) var(--sp-2h); margin-bottom: var(--sp-2); font-size: var(--fs-xs); color: var(--warn); background: var(--warn-soft); border-radius: var(--r-s); }
/* G2-C7：区块级间距落梯 --sp token（亚阶梯微调、控件内 padding、尺寸值不动；双轨变量收口属独立批次，本轮不动） */
.wt-page { padding: var(--sp-4) var(--sp-4) var(--sp-5); }
.wt-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); padding-bottom: var(--sp-3); border-bottom: 1px solid var(--border-subtle); }
/* G2-B6：首载骨架与列表同节奏（纵向堆叠） */
.wt-loading { display: flex; flex-direction: column; gap: var(--sp-3); }
.wt-alert { display: flex; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-m); margin-bottom: var(--sp-3); color: var(--warn); }
.wt-alert-tt { font-weight: 650; font-size: var(--fs-md); }
.wt-alert-sub { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--sp-0); }
/* G2 执行统计 tile 墙退役：页头 inline 串换装 MetaStrip 统一件——
   基础形态（flex/b/i/sep/mono/tone 色档）全由组件承担，本页只留落位 */
.wt-meta { margin-top: 3px; }
/* 搜索行融合为列表区头部（原独立横幅 .wt-search 退役）。
   五百四十七批：胶囊壳三件套（panel 底/border-subtle 弱边/8px 圆角）随组件化归
   SearchFilterBar 单源，本类只留落位与内衬（padding 对齐现行，高度结构零变动）；
   .wt-search-i 裸输入形态归组件 .sfb-i 单源（inputClass 保留类名锚） */
.wt-search-head { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); }
.wt-list { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 五百五十四批：wt-card 列表项卡带框降层为 border-top 行（立法④；slm-card 551 先例：
   panel 底+全框+radius 整块消除，悬停反馈由顶部 hairline 变色承接）；类名保留作 DOM 锚 */
.wt-card { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-3) 0; border-top: 1px solid var(--border-subtle); }
.wt-card:hover { border-color: var(--brand); }
.wt-card-r { display: flex; gap: var(--sp-2); flex: none; }
.wt-card-l { flex: 1; min-width: 0; }
.wt-card-tt { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-md); font-weight: 650; min-width: 0; }
/* G2-C5：长 watch id 省略三件套（flex 项需 min-width:0 才可收缩），图标不参与收缩 */
.wt-card-ic { flex: none; }
.wt-card-id { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wt-card-sub { font-size: var(--fs-xs); color: var(--text-muted); margin-top: 3px; }
.wt-card-actions { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--sp-1); }
.wt-act { display: inline-block; margin-left: var(--sp-1); padding: 1px var(--sp-1h); background: var(--ac-soft); color: var(--ac-hi); border-radius: 3px; font-size: var(--fs-xs); } /* 五百五十四批：6px→--sp-1h 收编（1px 边框豁免保字面；spSweep544/545/551 锚随迁） */
.wt-card-meta { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--sp-2); }
.wt-card-meta code { background: var(--hl-soft); padding: var(--sp-0) var(--sp-1h); border-radius: 3px; display: inline-block; max-width: 100%; overflow-x: auto; }
.wt-meta-json { max-height: 320px; overflow: auto; margin: 0; }
/* 当前命中卡片：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.wt-card.hit-cur { background: var(--ac-soft) !important; border-color: var(--ac-line); box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }

/* 五百三十批：1100 堆叠档（零结构动）——watch 卡左信息/右操作与页头双栏在中窄视口挤压，
   塌纵向堆叠；搜索行输入本就 flex:1 自适应不动 */
@media (max-width: 1100px) {
  .wt-hd { flex-direction: column; align-items: flex-start; gap: var(--sp-2); }
  .wt-card { flex-direction: column; }
  .wt-card-r { justify-content: flex-end; }
}

/* 五百三十四批：900 紧凑微调档（529 批口径，纯样式追加零结构动）——页侧距收一档、
   搜索行头（输入×刷新钮）允许换行兜挤压；分栏堆叠归 1100 档不重复 */
@media (max-width: 900px) {
  .wt-page { padding: var(--sp-3) var(--sp-3) var(--sp-4); }
  .wt-search-head { flex-wrap: wrap; }
}
</style>
