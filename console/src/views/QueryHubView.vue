<template>
  <div class="qh">
    <!-- 模式切换器 + 历史入口：六通道一屏选对，essence 悬浮是选型指南 -->
    <div class="qh-top">
      <!-- 七百三十九批 G142：模式组补 group 语义+六钮 aria-pressed（选中态此前纯 .on 视觉） -->
      <div class="qh-modes" role="group" aria-label="查询模式" @keydown="onModesKeydown">
        <button
          v-for="m in QUERY_MODES" :key="m.k"
          class="qh-mode" :class="{ on: modeK === m.k }"
          :title="m.essence" :aria-pressed="modeK === m.k"
          @click="switchMode(m.k)"
        >
          <component :is="ICONS[m.icon]" :size="15" class="qh-mode-ic" />
          <span class="qh-mode-tx">
            <span class="qh-mode-t">{{ m.t }}
              <!-- 554 批：版本门槛徽标换装 StatusPill y 档（warn 软底单源，outline 描边私形退役；
                   qh-ver 锚类保留 + xs 档对齐原 2xs；title 语义走组件 title prop 随迁） -->
              <StatusPill v-if="m.minVer && store.verBelow(m.minVer)" class="qh-ver xs" tone="y"
                :label="`需 ${m.minVer}+`" :title="`当前集群 ES ${store.esVersion}，此通道需要 ES ${m.minVer}+`" />
            </span>
          </span>
        </button>
      </div>
      <!-- 五百三十三批：页头挂只读当前索引 chip（AnalysisSettingsView 范式）——本页与子模式
           静默消费 store.pickedIdx（场景任务带 idx 深链/FieldPicker 字段源），给可视锚；
           空索引时组件自身不渲染（根 v-if），零占位 -->
      <CurrentIdxChip />
      <n-popover trigger="click" placement="bottom" :show="labOpen" @update:show="(v: boolean) => (labOpen = v)">
        <template #trigger>
          <button class="btn sm ghost qh-hist" title="相关性调试：评分解释 / 排名侦探 / X 光 / 命中矩阵 / Boost / 火焰图">
            <SearchCheck :size="14" /> 相关性调试
          </button>
        </template>
        <div class="qh-labs">
          <button v-for="l in RELEVANCE_LABS" :key="l.path" class="qh-lab" @click="gotoLab(l.path)">
            <component :is="l.icon" :size="13" /> {{ l.name }}
          </button>
        </div>
      </n-popover>
      <button class="btn sm ghost qh-hist" @click="histOpen = true" title="跨模式查询历史（六通道共用，可回放）">
        <History :size="14" /> 历史
      </button>
    </div>


    <!-- 模式视图：成熟查询视图原样嵌入（自带 URL 现场/草稿防丢），切模式淡入。
         KeepAlive 保活六模式实例——切 tab 不再清空结果/交互状态（历史顽疾）；
         任务/回放预填仍靠 stamp 变 key 强制重挂载读取，:max=8 让重挂旧实例走 LRU 淘汰。
         x2 修复：这里原是 <Transition mode="out-in">——out-in 依赖 afterLeave 交接，而
         PitScrollView 是多根 fragment（.pt-page + .pt-grid），fragment 无法被动画，
         「PIT 作为离场组件」时交接死锁：入场组件永不插入、此后所有模式主体（含场景
         任务生成 DSL 的 stamp 强制重挂载）全部空白，须整页刷新才恢复。改为包裹层
         CSS 动画淡入（不参与 JS 交接，无死锁可能），淡入观感与 KeepAlive 语义不变 -->
    <div class="qh-pane">
      <!-- 五百四十二批：场景任务条迁入 DSL 工具行（#toolbar-prepend slot，三行合一用户裁决）——
           场景任务生成 DSL 仅服务 dsl 模式（applyTask 强制切 dsl），随 dsl 视图工具行渲染；
           其他五模式无此 slot=安全丢弃。tasksExpanded/taskOpen 状态仍在父作用域。
           （五百四十五批跨 lane 热修：注释原在 KeepAlive 内部，dev 编译 comments:true 下
           KeepAlive 命中「expects exactly one child component」致开发态编译失败、
           dslAssistPenetration/fieldPickerPenetration 两 spec 0-test 挂编译错——
           注释移出 KeepAlive，生产产物零差异） -->
      <KeepAlive :max="8">
        <component :is="COMP[modeK]" :key="modeK + '#' + stamp">
          <template #toolbar-prepend>
    <!-- 场景任务条：开发者日常动作一键生成 DSL（活教材：预填后可见生成语句）。
         20260920 用户裁决：六枚场景钮默认收起（常驻两排挤压工作区）——「日常场景 ▾」一点展开
         整排（原输入 popover/FieldPicker 逻辑零改动），usePref 记忆展开态 -->
            <!-- 五百四十二批二刀（用户裁决「日常场景应该是下拉」）：场景任务改 popover 下拉——
             点「日常场景」弹出任务列表，不再 inline 平铺挤压工具行 -->
            <n-popover trigger="click" placement="bottom-start" :width="560">
              <template #trigger>
                <button class="qh-task qh-tasks-toggle" title="日常场景（一键生成 DSL）">
                  <Sparkles :size="12" /> 日常场景
                  <ChevronDown :size="12" />
                </button>
              </template>
              <div class="qh-tasks-pop">
                <template v-for="t in QUICK_TASKS" :key="t.k">
          <n-popover v-if="t.input" trigger="click" placement="bottom" :show="taskOpen === t.k" @update:show="(v: boolean) => (taskOpen = v ? t.k : '')">
            <template #trigger>
              <button class="qh-task" :title="t.scene">{{ t.t }}</button>
            </template>
            <div class="qh-task-pop">
              <div class="qh-task-scene">{{ t.scene }}</div>
              <div class="qh-task-row">
                <!-- W1 Task 4：字段名语义任务（kind:'field'）换 FieldPicker 补全；_id 等其余任务保持纯手输。
                     评审修复：:to="false" 弹层就地渲染——与 popover 内容同子树，naive clickoutside 不再误判关
                     popover 导致 click 丢失；@enter 接回快捷键（Enter 三段语义：有候选 choose / 无候选或面板关 → 透发
                     enter，恢复原裸 input 的 Enter 生成契约）；typeFilter 透传（recent 只出 date 字段）。
                     五百三十一批：模板字段场景 keyword 置顶（exists 存在性检查常打 keyword 业务字段；
                     recent 任务 typeFilter 已锁 date，prio 不命中 = 原序零增量） -->
                <FieldPicker v-if="t.input.kind === 'field'" v-model="taskInput" :index="store.pickedIdx"
                  :placeholder="t.input.placeholder" :type-filter="t.input.typeFilter" :type-priority="['keyword']" :to="false" width="100%" class="qh-task-fp"
                  @enter="applyTask(t)" />
                <input v-else v-model="taskInput" class="inp" :placeholder="t.input.placeholder" @keyup.enter="applyTask(t)" />
                <button class="btn sm pri" :disabled="!taskInput.trim()" @click="applyTask(t)"><Play :size="11" /> 生成</button>
              </div>
            </div>
          </n-popover>
          <button v-else class="qh-task" :title="t.scene" @click="applyTask(t)">{{ t.t }}</button>
                </template>
              </div>
            </n-popover>
          </template>
        </component>
      </KeepAlive>
    </div>

    <!-- R100：跨模式查询历史抽屉（六通道共用，倒序回放） -->
    <NDrawer v-model:show="histOpen" :width="histDrawerW" placement="right">
      <NDrawerContent title="跨模式查询历史" closable>
        <!-- R130 五十七批：面板收编 QueryHistoryPanel 共享件（新增过滤/复制；清空确认仍在父） -->
        <!-- 三百三十七批：跨模式历史导入合并（store.mergeFrom 同闭环扩展至第二入口；消费即计数反馈） -->
        <input ref="importFileEl" type="file" accept=".json,application/json" style="display:none"
          aria-label="导入跨模式查询历史" @change="onImportFile" />
        <button class="btn ghost sm" style="margin-bottom:var(--sp-2)" :disabled="importing"
          title="从导出的 JSON 合并导入（同 mode+查询+索引去重）" @click="importFileEl?.click()">
          <Copy :size="12" /> 导入历史
        </button>
        <QueryHistoryPanel
          :items="hist.items" :actions="['play', 'fav', 'copy', 'del']" show-mode clickable
          empty-text="暂无跨模式查询历史。在任一通道执行一次查询后，这里会按时间倒序沉淀。"
          @play="replay" @del="row => hist.removeOne(row.id)" @clear="doClearHist" @fav="favHistRow"
        />
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, defineAsyncComponent, defineComponent, onActivated, h } from 'vue';
import { NPopover, NDrawer, NDrawerContent } from 'naive-ui';
import { useRouter } from 'vue-router';
import {
  TerminalSquare, Database, SearchCode, Beaker, Layers, ArrowLeftRight, Sparkles, Play, History, SearchCheck, ChevronDown, Copy,
} from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { RELEVANCE_LABS } from '../utils/relevanceLabs';
import { useQueryHistoryStore } from '../stores/queryHistory';
import { useUrlState, usePref } from '../composables/urlState';
import { askConfirm } from '../composables/confirm';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import FieldPicker from '../components/FieldPicker.vue';
/* 五百五十八批：懒加载骨架的块件（QhPaneLoading 渲染函数件消费） */
import SkeletonBox from '../components/SkeletonBox.vue';
/* 五百三十三批：页头只读当前索引 chip（静默消费 pickedIdx 的可视锚，空索引不渲染） */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import StatusPill from '../components/StatusPill.vue'; /* 554 批：版本门槛徽标统一件 */
import { QUERY_MODES, DEFAULT_MODE, normalizeMode, QUICK_TASKS, encodeDslParam, type QuickTask } from '../utils/queryHub';

const store = useAppStore();
const router = useRouter();
const ICONS: Record<string, any> = { TerminalSquare, Database, SearchCode, Beaker, Layers, ArrowLeftRight };
/* 相关性实验室入口：藏在侧栏的强能力，这里给一条主入口（带当前索引上下文可直跳） */
const labOpen = ref(false);
/* 五百二十八批：440 固定宽抽屉 ≤440px 视口溢出——94% 视口收口（ReconcileReportDrawer
   drawerW 同款；本站纯 SPA 无 SSR 顾虑），上限仍 440 */
const histDrawerW = computed(() => Math.min(440, Math.round(window.innerWidth * 0.94)));
function gotoLab(path: string) {
  labOpen.value = false;
  router.push(path);
}

/* 六模式懒加载：只有点开的模式才拉 chunk（DslQueryView 928 行不拖累其他模式）。
   五百五十八批：统一挂 loadingComponent——557 真机探针实锤「懒模式冷转换 8s 全白零反馈」，
   chunk 拉取期间 qh-pane 一片空白。骨架定高、纯 CSS shimmer、零测量链——不参与 pane
   高度链正反馈（loading 态高度稳定）；delay:200 快路径零闪烁；KeepAlive 保活的已解析
   实例切回 / stamp 强制重挂都走缓存不进 loading，骨架仅首载冷拉取出现 */
const QhPaneLoading = defineComponent({
  name: 'QhPaneLoading',
  render() {
    /* 内联 style：渲染函数件拿不到宿主 scopeId（R91 守门，样式不得落 scoped 规则）；
       class 保留作测试/样式钩子锚（无对应 scoped 规则即零违规） */
    return h('div', { class: 'qh-pane-loading', style: 'display:flex;flex-direction:column;align-items:center;gap:var(--sp-3);padding:var(--sp-5) 0;' }, [
      h(SkeletonBox, { height: 128, width: 'min(560px, 92%)', round: true }),
      h('p', { class: 'qh-pane-loading-tx', style: 'margin:0;color:var(--tx2);font-size:var(--fs-sm);' }, '通道加载中…'),
    ]);
  },
});
function lazyPane(loader: () => Promise<{ default: any }>) {
  return defineAsyncComponent({ loader, loadingComponent: QhPaneLoading, delay: 200 });
}
const COMP: Record<string, any> = {
  dsl: lazyPane(() => import('./DslQueryView.vue')),
  sql: lazyPane(() => import('./SqlConsoleView.vue')),
  lucene: lazyPane(() => import('./LuceneQueryView.vue')),
  sandbox: lazyPane(() => import('./SearchSandboxView.vue')),
  pit: lazyPane(() => import('./PitScrollView.vue')),
  bridge: lazyPane(() => import('./SqlBridgeView.vue')),
};

const mode = useUrlState('mode', DEFAULT_MODE);
/* 惯用通道记忆：侧边栏裸进（无 ?mode=）时回到上次用的模式；深链指定的 mode 优先 */
const lastMode = usePref('qh.mode', DEFAULT_MODE);
if (!new URLSearchParams(location.hash.split('?')[1] || '').get('mode') && lastMode.value !== mode.value) {
  mode.value = normalizeMode(lastMode.value);
}
const modeK = computed(() => normalizeMode(mode.value));
watch(modeK, v => { lastMode.value = v; });
/* ═══ 二百一十九批：模式条 ←→/Home/End roving 焦点（W3C APG，176 批 chips 同构）═══
   模式钮是原生 button，Enter/Space=切换已免费获得；←→ 只移动焦点不切换（防误切大查询页） */
function onModesKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const btns = [...((e.currentTarget as HTMLElement).querySelectorAll('.qh-mode'))] as HTMLButtonElement[];
  const i = btns.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0
    : e.key === 'End' ? btns.length - 1
    : e.key === 'ArrowLeft' ? (i - 1 + btns.length) % btns.length
    : (i + 1) % btns.length;
  btns[next]?.focus();
}
/* 场景任务写 ?dsl= 后需要重挂载才会被 DslQueryView onMounted 读取 */
const stamp = ref(0);
/* 20260920 用户裁决：日常场景排默认收起（常驻两排挤压工作区），展开态 usePref 记忆 */


/* 路由级 KeepAlive(App.vue 白名单)后本页切回不重挂,onMounted 的深链消费不再跑——activated 补一次:
   命令面板/收藏回放把预填落在 ?dsl= 或一次性 carry 键时,切到 dsl 模式并 stamp++ 强制内部组件重挂读取 */
let activatedEver = false;
onActivated(() => {
  /* 首次挂载也会触发 activated——首次的深链由 onMounted 链路负责,这里必须跳过,否则双重消费(两次执行查询) */
  if (!activatedEver) { activatedEver = true; return; }
  const usp = new URLSearchParams(location.hash.split('?')[1] || '');
  const wantsDsl = usp.get('dsl') || sessionStorage.getItem('es-console.dsl.carry');
  if (wantsDsl) {
    mode.value = 'dsl';
    stamp.value++;
  }
});

function switchMode(k: string) {
  if (k !== modeK.value) mode.value = k;
}

const taskOpen = ref('');
const taskInput = ref('');
/* 换一个任务弹窗时清掉上个任务的输入残留（字段名不会撞上文档 _id） */
watch(taskOpen, () => { taskInput.value = ''; });

function applyTask(t: QuickTask) {
  const input = taskInput.value.trim();
  /* 反馈链路补口：Generate 钮在空输入时 disabled，但 Enter 路径（裸 input keyup.enter /
     FieldPicker @enter）会静默 return——补一条 warn 提示，弹窗不再"点了没反应" */
  if (t.input && !input) {
    store.notify('warning', '「' + t.t + '」需要先填写输入（' + t.input.placeholder + '）再生成');
    return;
  }
  const dsl = t.build(input);
  /* 先落 ?dsl=（分享契约同 DslQueryView），再切 dsl 模式重挂载读取 */
  const usp = new URLSearchParams(location.hash.split('?')[1] || '');
  usp.set('dsl', encodeDslParam(dsl));
  if (store.pickedIdx) usp.set('idx', store.pickedIdx);
  usp.set('mode', 'dsl');
  history.replaceState(null, '', (location.hash.split('?')[0] || '#/search') + '?' + usp.toString());
  mode.value = 'dsl';
  stamp.value++;
  taskOpen.value = '';
  taskInput.value = '';
  store.notify('success', '已按「' + t.t + '」生成 DSL，看看语句就学会了', { duration: 4000 });
}

/* ═══ R100：跨模式查询历史抽屉 ═══ */
const hist = useQueryHistoryStore();
const histOpen = ref(false);

/** 回放：复用各视图既有预填/深链通道（与 favReplay 同源契约），不新造 */
function replay(it: { mode?: string; query: string; index?: string }) {
  histOpen.value = false;
  const m = it.mode;
  if (!m) return; // 无模式标记的历史条目无法跨模式回放（五十七批 HistRow 口径）
  const idx = it.index || '';
  if (m === 'dsl') {
    sessionStorage.setItem('es-console.dsl.carry', it.query);
    if (idx) sessionStorage.setItem('es-console.dsl.carry.index', idx);
  } else if (m === 'sql') {
    sessionStorage.setItem('es-console.sql.prefill', it.query);
    /* R130 六十一批：SQL 回放补索引上下文跟随（dsl/lucene/sandbox/pit 分支同款）——
       否则原在索引 A 执行的 SQL 会在当前选中索引上回放，上下文错配 */
    if (idx) store.pick(idx);
  } else if (m === 'lucene') {
    sessionStorage.setItem('es-console.lucene.q', it.query);
    if (idx) sessionStorage.setItem('es-console.lucene.index', idx);
  } else if (m === 'sandbox') {
    localStorage.setItem('ss_dsl_body', it.query);
    if (idx) store.pick(idx);
  } else if (m === 'pit') {
    /* 第十批：PIT 回放补 filter/sort 预填——queryHistory 条目形状扩展（store 文件）不在本批
       文件清单，降级 sessionStorage 直传：filter 用历史条目原文（准确）；sort/order 用
       pit 执行时写的 es-console.pit.carry 快照转运为 es-console.pit.prefill（仅本次回放消费，
       PitScrollView onMounted 读走即删，普通重挂载不误吃）；无快照时退化为只带 filter（此前现状） */
    sessionStorage.setItem('es-console.pit.filter', it.query || '');
    const carry = sessionStorage.getItem('es-console.pit.carry');
    if (carry) sessionStorage.setItem('es-console.pit.prefill', carry);
    if (idx) store.pick(idx);
  } else if (m === 'template') {
    /* 五百二十九批 W-B（§6q 遗留）：template 通道回放=跨页跳搜索模板中心——template 不是
       QueryHub 六模式之一（QUERY_MODES 无此键，mode.value 赋它会被 normalizeMode 静默回落
       dsl 且污染 URL），故照 dsl.carry 同款 sessionStorage 一次性通道 + router.push 跨页，
       送达后立即 return（不入下方 mode 切换）。
       送达目的地=SearchTemplatesView 的 source 草稿（接收端 onMounted 消费 es-console.
       search-templates.carry 即删）；条目 query=313 批 push 的 rendered||source 快照，
       模板源快照/渲染产物双形态由页内既有防呆承担（占位符参数表单+run() 参数防呆），
       这里只管如实送达——与 favReplay bulk.carry/ubq.carry 跨页 carry 同构。 */
    sessionStorage.setItem('es-console.search-templates.carry', it.query || '');
    if (idx) store.pick(idx); /* 执行上下文跟随（sql/sandbox/pit 分支同款），进页 useIdxState(follow) 接住 */
    router.push('/search-templates');
    store.notify('success', '模板查询已送到搜索模板中心的源草稿');
    return;
  }
  mode.value = m;
  stamp.value++; // 同模式回放也强制重挂载以读取预填
}

/* 三百三十七批：跨模式历史导入合并（store.mergeFrom 同闭环，双入口均可带历史走） */
const importFileEl = ref<HTMLInputElement | null>(null);
const importing = ref(false);
async function onImportFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f || importing.value) return;
  importing.value = true;
  try {
    const list = JSON.parse(await f.text());
    const r = hist.mergeFrom(list);
    store.notify(r.added ? 'success' : 'info', `导入完成：新增 ${r.added} 条，跳过重复/无效 ${r.skipped} 条`);
  } catch (err: any) {
    store.notify('error', '导入失败：' + String(err?.message ?? err).slice(0, 100));
  } finally { importing.value = false; }
}

async function doClearHist() {
  const ok = await askConfirm({
    title: '清空跨模式查询历史',
    message: '将删除全部通道的查询历史记录（含已迁移的旧 DSL 历史），此操作不可撤销。',
    level: 'warn',
    okText: '清空',
  });
  if (!ok) return;
  hist.clear();
  histOpen.value = false;
}

/* 五百四十六批：历史行一键转收藏（DSL 保存搜索语义；面板星标行级门只对无 mode / mode='dsl' 行出钮）。
   本页无命名弹窗，沿 doClearHist 的确认外链思路直写 DslQueryView「保存的搜索」存储 es_query_saved
   （条目形状 {dsl,ts,idx,name} 与 DslQueryView HistItem 同构兼容）；读侧 try+Array.isArray 容错
   （DevToolsView histAllRead 先例）；同名已存跳过——confirmSave 的覆盖确认是 DslQueryView 页内链，
   这里不越权静默覆盖。 */
function favHistRow(it: { mode?: string; query: string; index?: string; ts?: number }) {
  if ((it.mode && it.mode !== 'dsl') || !it.query) return;
  let saved: { name?: string; dsl: string; ts: number; idx?: string; layout?: unknown }[] = [];
  try {
    const r = JSON.parse(localStorage.getItem('es_query_saved') || '[]');
    if (Array.isArray(r)) saved = r;
  } catch { /* 坏值按空处理 */ }
  const name = '收藏 ' + new Date(it.ts ?? Date.now()).toLocaleString();
  if (saved.some(s => s.name === name)) { store.notify('info', '同名收藏已存在，未重复写入'); return; }
  saved.unshift({ dsl: it.query, ts: it.ts ?? Date.now(), idx: it.index, name });
  try {
    localStorage.setItem('es_query_saved', JSON.stringify(saved));
    store.notify('success', '已转收藏（保存的搜索）——到查询工作台 DSL 页「保存的搜索」查看');
  } catch {
    store.notify('error', '收藏写入失败（本地存储空间不足）');
  }
}
</script>

<style scoped>
.qh { display: flex; flex-direction: column; gap: var(--sp-1h); }

/* 五百五十八批：六模式冷拉取骨架样式已内联进 QhPaneLoading 渲染函数（R91 守门：渲染函数件
   拿不到宿主 scopeId，纯 scoped 规则匹配不到）——SkeletonBox 定高块+一行弱文，拉取期高度恒定 */

/* 顶栏：模式切换器 + 历史入口。五百三十三批：补 flex-wrap（900 档单列化兜窄档，
   档位之间 900-1100 一带窄容器允许 chip/入口钮换行，不再硬挤单行） */
.qh-top { display: flex; align-items: flex-start; gap: var(--sp-2); flex-wrap: wrap; }
.qh-top .qh-modes { flex: 1; }
.qh-hist { flex-shrink: 0; }
.qh-labs { display: flex; flex-direction: column; min-width: 160px; padding: var(--sp-1); }
.qh-lab { display: flex; align-items: center; gap: var(--sp-2); padding: 7px var(--sp-2h); border: 0; border-radius: var(--r-s); background: transparent; color: var(--tx1); font-size: var(--fs-sm); cursor: pointer; text-align: left; }
.qh-lab:hover { background: var(--bg2); color: var(--tx0); }

/* 模式切换器：五百三十四批卡片化分段，essence 副行帮 1 秒选型。
   20260920 二轮收敛（用户实报「顶上块区设计一般」）：卡片双行(图标+名+essence 副行)
   → 紧凑单行(图标+名)，占高减半、五卡并排不换行；essence 收进 title 悬浮 */
.qh-modes { display: flex; gap: var(--sp-1h); flex-wrap: wrap; }
.qh-mode {
  display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-1) var(--sp-2h); cursor: pointer; /* 五百五十批：原裸刻值精确等值收编 --sp 档 */
  background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s);
  color: var(--tx2); text-align: left; position: relative;
  transition: border-color var(--tr), background var(--tr);
}
.qh-mode:hover { border-color: var(--ac-line); color: var(--tx1); }
.qh-mode:active { transform: scale(.97); }
.qh-mode.on {
  background: var(--ac-soft); border-color: var(--ac-hi); color: var(--tx1);
  box-shadow: 0 1px 6px -2px var(--ac-line);
}
.qh-mode.on::after {
  content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px;
  border-radius: 2px 2px 0 0; background: var(--ac-hi);
}
.qh-mode.on .qh-mode-ic { color: var(--ac-hi); }
.qh-mode-tx { display: flex; flex-direction: column; line-height: 1.35; }
/* 语义分层：主标题走文字档（tx1，选中/悬停提亮 tx0 + 650 字重）——此前标题随容器吃
   tx2、选中后仅 tx1，与主标题同阶弱化 */
.qh-mode-t { font-size: var(--fs-sm); font-weight: 600; display: flex; align-items: center; gap: 5px; color: var(--tx1); }
.qh-mode:hover .qh-mode-t, .qh-mode.on .qh-mode-t { color: var(--tx0); }
.qh-mode.on .qh-mode-t { font-weight: 650; }
/* 七百三十九批 G141：essence 副行死渲染与死样式退役（紧凑单行收敛后残留隐藏空壳）——
   选型文案此前注释宣称走模式钮 title 悬浮但从未接线，本批补悬浮通道可达（帮用户 1 秒选对通道） */
/* 554 批：.qh-ver 私造皮（outline 描边胶囊 + warn 手配色）随换装 StatusPill y 档退役——
   软底/描边/字号归 .pill 单源（.pill.xs 对齐原 2xs）；类名保留作锚 */

/* 场景任务条 */
/* 七百三十九批 G140：场景条旧壳三组死样式退役（542 批迁入 DSL 工具行后残留，DOM 零引用；
   活锚=日常场景展开钮与任务弹层容器）。「迁入工具行后不被 flex 压缩」的语义随旧壳一并退役 */
/* 20260920：场景排默认收起，toggle 钮即展开/收起开关（虚线描边暗示「可展开的抽屉」而非普通动作钮） */
.qh-tasks-toggle { border: 1px dashed var(--border); background: transparent; }
.qh-task {
  font-size: var(--fs-xs); padding: 3px var(--sp-2h); cursor: pointer; border-radius: var(--r-s);
  background: transparent; border: 1px solid var(--line); color: var(--tx1);
  transition: border-color var(--tr), background var(--tr), color var(--tr);
}
.qh-task:hover { border-color: var(--ac-line); background: var(--ac-soft); color: var(--ac); }
.qh-task-pop { display: flex; flex-direction: column; gap: var(--sp-2); width: 280px; }
.qh-task-scene { font-size: var(--fs-xs); color: var(--tx2); }
.qh-task-row { display: flex; gap: var(--sp-1h); }
.qh-task-row .inp { flex: 1; }
.qh-task-fp { flex: 1; min-width: 0; }

/* 模式视图面板：flex+gap 与 .qh 同构——fragment 视图（PIT 多根）在面板内保持
   原有的逐根 10px（--sp-2h）间距；min-width:0 防 DslQueryView 编辑器把面板撑出视口。
   淡入用 CSS 动画：子元素每次（重）插入 DOM 自动重放（KeepAlive 复活/stamp 重挂载都触发） */
.qh-pane { display: flex; flex-direction: column; gap: var(--sp-2h); min-width: 0; }
.qh-pane > :deep(*) { animation: qh-fade-in var(--tr) ease; }
@keyframes qh-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* 五百二十八批：900 窄档（§9.3 口径；本页此前零 @media）——顶栏单列化：模式切换卡
   铺满行宽、两个入口钮换行到下一行；场景任务弹层钳宽防窄视口溢出（drawerW 同 94% 口径） */
@media (max-width: 900px) {
  .qh-top { flex-direction: column; }
  .qh-top .qh-hist { flex-shrink: 1; }
  .qh-task-pop { width: min(280px, 94vw); }
}

/* R100：跨模式查询历史抽屉 */
</style>
