<template>
  <div class="ilm" ref="rootEl">
    <PageHeader :icon="Recycle" title="ILM 索引生命周期">
      <template #subtitle>
        <span>策略管理 / 索引解释 / 生命周期移步</span>
        <!-- KPI 大卡墙退役：「策略数/当前视图」两卡与列表卡头「策略（N）」重复计数，直接删（计数留 :title）；
             Explain 状态改 inline 元信息串（原第三张 ilm-kpi 卡） -->
        <!-- 五百二十四批：手写 meta-strip 裸 div 换 MetaStrip 统一件（DiagView 正解形态：
             class 透传落位，值亮+标签暗+·分隔+tone 语义档；原 meta-err 三元色由 tone:'err'
             承接，策略/视图计数进 items，全量语义 :title 兜底不变） -->
        <!-- 五百二十五批：去 .meta-strip 全局类——五百三十五批补 .mono 摘除（组件本体 .ms 已设
             font-family:var(--mono)，全局 .mono 冗余；W8 meta-strip 全局块退役同判据） -->
        <MetaStrip class="ilm-meta" :items="ilmMeta"
          :title="'策略 ' + policies.length + '（已注册） · 当前视图 ' + filtered.length + '（过滤后） · Explain 状态 ' + explainSummary + '（索引：' + (explainIndex || '未选') + '）'" />
      </template>
      <!-- 原独立工具条 ilm-bar 并入页头 actions（横幅层叠 -1） -->
      <template #actions>
        <!-- 五百六十批：手写过滤框换装 SearchFilterBar 统一件（全站第 6 胞；558 cd-kw-inp 判例：
             v-model 接原 ref 零触、placeholder 逐字保留兼作 aria-label；Esc 清空/Enter 检索
             内建语义对齐，胶囊壳三件套归组件单源；内联 width:min(200px,100%)——五百五十七批
             极窄钳制——经 $attrs 透传挂根，557④ 锁面零触） -->
        <SearchFilterBar v-model="filter" class="ilm-input" placeholder="按策略名过滤" style="width:min(200px,100%)" @enter="onHitKey" /><!-- 内联 width:200px → min() 极窄钳制（546 AliasesView / 547 paneShell 同范式） -->
        <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在过滤框接线） -->
        <HitNav :count="filtered.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
        <!-- 五百二十四批：explain 索引裸 n-select 换统一选择器；五百二十五批反转：页内可写
             选择器退役换只读 CurrentIdxChip——「选索引」唯一可写入口收敛顶栏（架构裁决），
             v-model 直绑 explainIndex（useIdxState）的 follow 下行跟随与 watch 驱动
             loadExplain 语义原样保留，选中/清空仍经 watch 重拉 -->
        <CurrentIdxChip />
<label style="display:inline-flex;align-items:center;gap:var(--sp-1);font-size: var(--fs-sm);color:var(--tx1);cursor:pointer">
          <input type="checkbox" v-model="ilmAutoRefresh" />
          <span>自动刷新</span>
        </label>
        <!-- 第十批：自动刷新频率下拉换装 AutoRefreshSelect 统一件（原内联样式原生 select 退役；开关 checkbox 与 usePref 逻辑不动） -->
        <AutoRefreshSelect v-if="ilmAutoRefresh" v-model:ms="ilmIntervalMs" :sizes="[10000, 30000, 60000]" label="自动刷新频率" />
        <button aria-label="刷新策略列表" class="btn sm ghost" @click="loadPolicies" :disabled="loading" title="刷新策略列表">
          <RefreshCw :size="12" :class="{ spinning: loading }" />
        </button>
        <!-- 五百六十一批：原始请求/响应快查弹窗（RawIo 第六波，558b 判例同形态；
             路径子串 '/cluster/ilm/'=本页 policies/policy/explain/move 全通道（LifecycleView
             已锁子串 '/cluster/ilm/explain'，explain 面跨页互见记档）） -->
        <button class="btn sm ghost" data-test="raw-io" aria-label="查看原始 IO（ILM）" title="最近一次 ILM 策略/解释/移步请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
          <Terminal :size="12" /> 原始 IO
        </button>
      </template>
    </PageHeader>

    <!-- R92-A2：页面级失败态——策略拉取失败不能只闪 toast，KPI 显 0 会误导成「无策略」 -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      {{ loadErr }}
      <button class="btn sm" @click="loadPolicies" :disabled="loading">重试</button>
    </div>

    <div class="ilm-grid" :style="{ '--ilm-list-w': ilmListW + 'px' }">
      <!-- 左：策略列表。五百四十七批：pane 壳三件套（border/bg/radius）退役（535 SqlBridge
           pane 直贴立法续扫）——flex/overflow 布局语义与 .card padding 载体原样迁 .ilm-list -->
      <div class="ilm-list">
        <div class="card-t">
<List :size="13" /> 策略（{{ filtered.length }}）
          <!-- W4c：左栏宽度循环档（usePref('ilm.listW') 记忆） -->
          <button class="btn xs ghost" :title="'左栏宽度档：' + ilmListW + 'px（点击切换）'" @click="cycleIlmListW">宽</button>
          <button v-if="canOps" class="btn xs" style="margin-left:auto" @click="openNewPolicy"><Plus :size="11" /> 新建</button>
        </div>
        <div v-if="loading && !filtered.length" style="padding:var(--sp-3);display:flex;flex-direction:column;gap:var(--sp-2)">
          <SkeletonBox v-for="i in 4" :key="i" height="80px" round />
        </div>
        <div v-else-if="filtered.length" class="ilm-rows">
            <div
              v-for="(p, i) in filtered" :key="p.name"
              class="ilm-p" :class="{ on: selected?.name === p.name }" :data-hit-idx="i + 1"
              :aria-current="selected?.name === p.name || undefined"
              @click="pickPolicy(p)"
              role="button" tabindex="0" @keydown.enter.prevent="pickPolicy(p)" @keydown.space.prevent="pickPolicy(p)">
            <div class="ilm-p-head">
              <b class="mono"><MarkText :text="p.name" :kw="filter" /></b>
              <span v-if="p.version != null" class="chip mono">v{{ p.version }}</span>
              <span style="margin-left:auto;display:flex;gap:var(--sp-1)" @click.stop>
                <button v-if="canOps" aria-label="编辑策略" class="btn xs ghost" title="编辑策略" @click="openEditPolicy(p)"><Pencil :size="11" /></button>
                <button v-if="canOps" aria-label="删除策略" class="btn xs ghost danger" title="删除策略" :disabled="deleting" @click="deletePolicy(p.name)"><Trash2 :size="11" /></button>
              </span>
            </div>
            <div class="ilm-p-phases">
              <!-- 五百三十三批：策略卡 phase 小色块中文主显（phaseZh + ilm-ph-en 英文小字双语，
                   :140 explain 徽章同款范式）。宽度二选一裁定（目测记档）：色块是 inline-flex
                   内容自适应宽且外层 flex-wrap 换行兜底，中文 1-2 字恒放得下——主显中文
                   （附英文小字），不再裸甩英文 -->
              <div v-for="ph in phases(p)" :key="ph.name" class="ilm-ph" :style="{ background: PHASE_COLORS[ph.name] || 'var(--bg2)' }">
                <span class="ilm-ph-name"><template v-if="phaseZh(ph.name)">{{ phaseZh(ph.name) }}<span class="ilm-ph-en">{{ ph.name }}</span></template><template v-else>{{ ph.name }}</template></span>
                <span v-if="ph.min_age" class="ilm-ph-age mono">{{ ph.min_age }}</span>
              </div>
            </div>
            <!-- W4c：modified_date 裸串 → TimeCell 统一件（SnapshotsView 时间列同款 abs 档，悬浮带时区） -->
            <div v-if="p.modified_date" class="ilm-p-time mono">修改：<TimeCell :ts="p.modified_date" abs /></div>
          </div>
        </div>
        <!-- 过滤致空档：策略存在但被关键字全部隐藏（照 AliasesView 过滤档范式） -->
        <EmptyState v-else-if="policies.length" :icon="ShieldQuestion" text="无匹配策略"
          :hint="`共 ${policies.length} 个策略，被当前关键字隐藏`" action-text="清除过滤" @action="filter = ''" />
        <!-- 真空态：err-bar 存在时不再显示「未定义策略」，两者互斥（失败不是空，同 SnapshotsView 处理） -->
        <EmptyState v-else-if="!loadErr" :icon="ShieldQuestion" text="当前集群未定义任何 ILM 策略"
          action-text="在 Dev Tools 创建示例策略 →" @action="createSample" />
      </div>

      <!-- 右：详情 + Explain（五百四十七批：pane 壳退役，布局语义与 padding 载体迁 .ilm-detail） -->
      <div class="ilm-detail">
        <div class="card-t">
          <template v-if="selected">
            <Recycle :size="13" /> {{ selected.name }} · 时间线
          </template>
          <template v-else-if="explainIndex && explain">
            <FileSearch :size="13" /> Explain: {{ explainIndex }}
            <!-- 三百三十批：在 DevTools 打开（GET /<idx>/_ilm/explain 带参预填，Watcher 范式） -->
            <button class="btn ghost xs" style="margin-left:auto" @click="explainToDevtools" title="在 Dev Tools 打开 explain API">
              <TerminalSquare :size="11" /> Dev Tools
            </button>
          </template>
          <template v-else>
            <Info :size="13" /> 选择策略查看 Phase 时间线，或在顶栏选择索引查看 explain
          </template>
        </div>

        <!-- Phase 时间线 -->
        <div v-if="selected" class="ilm-timeline">
          <div v-for="(ph, i) in phases(selected)" :key="ph.name" class="ilm-tl">
            <div class="ilm-tl-dot" :style="{ background: PHASE_COLORS[ph.name] || 'var(--tx2)' }">{{ i + 1 }}</div>
            <div class="ilm-tl-body">
              <div class="ilm-tl-head">
                <b>{{ ph.name }}</b>
                <span v-if="ph.min_age" class="chip mono">min_age = {{ ph.min_age }}</span>
              </div>
              <div class="ilm-tl-actions">
                <div v-for="(cfg, action) in ph.actions" :key="action" class="ilm-tl-action">
                  <b class="mono">{{ action }}</b>
                  <!-- W-C 批：action 配置走 highlightJson 范式（转义安全 v-html） -->
                  <pre class="mono json-view" v-html="highlightJson(prettyJson(cfg))"></pre>
                </div>
                <div v-if="!ph.actions || !Object.keys(ph.actions).length" class="il-noact">无 actions</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Explain 数据 -->
        <div v-else-if="explainIndex && explain" class="ilm-ex">
          <div v-for="(info, idx) in explain.indices" :key="idx" class="ilm-ex-row">
            <div class="ilm-ex-name mono">{{ idx }}</div>
            <div v-if="info.managed === false" class="ilm-ex-unmg">
              <ShieldOff :size="12" /> 未被 ILM 管理（无 <code>index.lifecycle.name</code> 设置）
            </div>
            <template v-else>
              <div class="ilm-ex-line">
                <span class="ilm-ex-l">policy</span><b class="mono">{{ info.policy }}</b>
              </div>
              <div class="ilm-ex-line">
                <span class="ilm-ex-l">phase</span>
                <span class="chip mono" :style="{ background: PHASE_COLORS[info.phase], color: 'var(--tx-on-strong)' }"><!-- 五百二十八批：phase 枚举加中文名（esEnumZh.phaseZh；英文小字保留在后，色档不动） --><template v-if="phaseZh(info.phase)">{{ phaseZh(info.phase) }}<span class="ilm-ph-en">{{ info.phase }}</span></template><template v-else>{{ info.phase }}</template></span>
                <span class="ilm-ex-l" style="margin-left:14px">action</span><span class="mono">{{ info.action }}</span>
                <span class="ilm-ex-l" style="margin-left:14px">step</span><span class="mono">{{ info.step }}</span>
                <button v-if="canOps && isRetryable(info)" class="btn xs ghost" style="margin-left:14px" :disabled="retrying" @click="doRetryStep(info)"><RefreshCw :size="11" /> 重试 step</button>
              </div>
              <div v-if="info.age" class="ilm-ex-line">
                <span class="ilm-ex-l">age</span><span class="mono">{{ info.age }}</span>
              </div>
              <div v-if="info.step_info" class="ilm-ex-step">
                <b>step_info</b>
                <pre class="mono json-view" :class="{ err: info.step_info.type === 'illegal_argument_exception' || info.step_info.type === 'exception' }" v-html="highlightJson(prettyJson(info.step_info))"></pre>
              </div>
            </template>
          </div>
        </div>

        <!-- Explain 拉取失败：内联失败面板 + 重试，不回落引导空态 -->
        <EmptyState v-else-if="explainIndex && explainErr" :icon="RefreshCw" text="explain 拉取失败"
          :hint="'索引 ' + explainIndex + '：' + explainErr" action-text="重试" @action="loadExplain" />

        <!-- R99-F2 逃生舱：引导列表经默认插槽承载（内容归 EmptyState 留白体系） -->
        <EmptyState v-else :icon="Recycle" text="选择左侧策略查看 Phase 时间线与 Explain">
          <ul style="text-align:left; list-style:none; padding:0; margin:0; font-size: var(--fs-sm); color:var(--tx1)">
            <li>· <b>左侧策略列表</b>：hot / warm / cold / delete 四阶段配色</li>
            <li>· <b>Phase 时间线</b>：min_age、actions 完整可视化</li>
            <li>· <b>Explain 视图</b>：定位索引当前 phase/action/step 及异常信息</li>
          </ul>
        </EmptyState>
      </div>
    </div>
  </div>

  <!-- ILM 策略编辑器（新建/编辑） -->
  <n-modal v-model:show="policyEditOpen" preset="card" :title="editingName ? '编辑策略 ' + editingName : '新建 ILM 策略'" style="width:680px;max-width:94vw" :bordered="false">
    <div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-2)">
      <span class="ilm-ex-l" style="flex:none">策略名</span>
      <input v-model="policyName" class="inp mono" placeholder="my-ilm-policy" :disabled="!!editingName" />
      <!-- 表单校验审计：必填项就近提示（savePolicy 的 toast 前置到字段旁，拦截逻辑不变） -->
      <span v-if="!policyName.trim()" class="il-hint il-err" style="flex:none;margin:0">策略名必填</span>
    </div>
    <!-- 第十批：Monaco 直挂收编 JsonArea 统一件（双向可编辑；原 360px 高度按组件 rows*19+16 公式取 rows=18≈358px，
         附带 JSON 合法性圆点/格式化/压缩/复制工具条；policyJsonErr 就近提示保留不动） -->
    <!-- 五百一十九批：policy body 接 dsl-assist（ILM 策略非 search body，fields 空数组——补全按通用检查降级） -->
    <!-- 五百二十五批：rows=18 定高（18*19+16=358px）改视口档 min(60vh,358px)（IndexHub/DslQuery
         弹窗编辑器 height="min(60vh,Npx)" 同款口径）——矮屏不再顶出弹窗滚两层；:rows 保留为
         非弹性回退档，弹性高经 .ilm-policy-ja :deep 覆盖内层 monaco-host 内联高（!important
         同 JsonArea fill 模式先例；JsonArea 组件本体不属本批改动面） -->
    <JsonArea v-model="policyBody" class="ilm-policy-ja" :dsl-assist="{ fields: () => [] }" :rows="18" placeholder="{ &quot;policy&quot;: { &quot;phases&quot;: { … } } }" />
    <!-- 表单校验审计：JSON 格式就近提示（纯展示 computed，实时反馈给修再存；错误仍由 savePolicy 兜底） -->
    <div v-if="policyJsonErr" role="alert" class="il-hint il-err">{{ policyJsonErr }}</div>
    <template #footer>
      <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
        <button class="btn" @click="policyEditOpen = false">取消</button>
        <!-- 空提交拦截：名空/JSON 非法时按钮禁用并说明原因（Enter 路径仍由 savePolicy 内同口径校验兜底） -->
        <button class="btn pri" :disabled="policyBusy || !policyName.trim() || !!policyJsonErr"
          :title="!policyName.trim() ? '先填策略名' : policyJsonErr ? '策略 JSON 不合法，修正后再保存' : ''"
          @click="savePolicy"><Save :size="12" /> 保存</button>
      </div>
    </template>
  </n-modal>

  <!-- 五百六十一批：原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/ilm/ 记录） -->
  <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NModal } from 'naive-ui';
import MarkText from '../components/MarkText.vue';
import { Recycle, List, RefreshCw, Info, FileSearch, ShieldOff, ShieldQuestion, Plus, Pencil, Trash2, Save, Terminal, TerminalSquare } from 'lucide-vue-next';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 五百六十一批：原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import PageHeader from '../components/PageHeader.vue';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* 五百二十五批：页内选择器退役换只读 chip */
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useIdxState } from '../composables/urlState';
import { friendlyEsError } from '../utils/esError';
import { phaseZh } from '../utils/esEnumZh'; /* 五百二十八批：ILM phase 枚举中文接线 */
import { highlightJson, prettyJson } from '../utils/jsonc';
import { askConfirm } from '../composables/confirm';
import { useScopedDraft } from '../composables/useScopedDraft';
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { usePref } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle';
import JsonArea from '../components/JsonArea.vue';
import TimeCell from '../components/TimeCell.vue'; /* W4c：modified_date 统一时间件（Snapshots 同款） */
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* 页头元信息串统一件 */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* 五百六十批：页头过滤胶囊统一件 */
import HitNav from '../components/HitNav.vue';
import { useHitLocate } from '../composables/useHitNav';
import { useModalEnter } from '../composables/useModalEnter';

const store = useAppStore();
/* 二百二十一批：权限门禁——ILM 策略保存/删除与 move step=rank3 档
   （角色定义「OPERATOR=低危写」不含策略级变更；后端 /cluster/ilm/policy 未入 CLUSTER 关键词是已知
   偏低档，待后端加固，前端先按角色意图收口；move/start/stop 本就在 CLUSTER 档） */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/policy', store.target));
const router = useRouter();

/* 五百六十一批：原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/ilm/');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* R45 §1：空态引导——预填示例 ILM 策略跳 REST 控制台（复用 DevTools sessionStorage 联动协议） */
const SAMPLE_ILM_BODY = JSON.stringify({
  policy: {
    phases: {
      hot: { actions: { rollover: { max_size: '50gb', max_age: '7d' } } },
      delete: { min_age: '30d', actions: { delete: {} } },
    },
  },
}, null, 2);
function createSample() {
  sessionStorage.setItem('es-console.devtools.open', JSON.stringify({
    title: 'ILM 示例策略', method: 'PUT', path: '/_ilm/policy/sample-policy', body: SAMPLE_ILM_BODY,
  }));
  router.push('/devtools');
}

/* ILM 策略编辑器：新建/编辑/删除（此前策略变更只能去 REST 手写 JSON） */
const policyEditOpen = ref(false);
/* R121: 策略编辑草稿——写一半的 policyBody 切页/刷新不再丢 */
const policyName = useScopedDraft('policy-name', { route: 'ilm' }, '').text;
const policyBody = useScopedDraft('policy-body', { route: 'ilm' }, '').text;
const policyBusy = ref(false);
const editingName = ref(''); // 非空 = 编辑既有策略；空 = 新建
/* 表单校验审计：策略体 JSON 实时合法性（纯展示）——空体/解析失败给出具体原因，
   与 保存按钮禁用门、savePolicy 内兜底校验同口径（ReindexAdvanced bodyJsonErr 同构） */
const policyJsonErr = computed(() => {
  const s = policyBody.value.trim();
  if (!s) return '策略体不能为空——粘贴或编写 ILM policy JSON';
  try { JSON.parse(s); return ''; } catch (e: any) { return '策略 JSON 不合法：' + String(e?.message ?? e); }
});
function openNewPolicy() {
  editingName.value = '';
  policyName.value = '';
  policyBody.value = SAMPLE_ILM_BODY;
  policyEditOpen.value = true;
}
function openEditPolicy(p: any) {
  editingName.value = p.name;
  policyName.value = p.name;
  policyBody.value = JSON.stringify({ policy: p.policy }, null, 2);
  policyEditOpen.value = true;
}
async function savePolicy() {
  if (!policyName.value.trim()) { store.notify('error', '策略名不能为空'); return; }
  let parsed: any;
  try { parsed = JSON.parse(policyBody.value); } catch { store.notify('error', '策略 JSON 不合法'); return; }
  policyBusy.value = true;
  try {
    await api.ilmPolicyPut(policyName.value.trim(), JSON.stringify(parsed));
    store.notify('success', `策略 ${policyName.value} 已保存`);
    policyEditOpen.value = false;
    loadPolicies();
  } catch (e: any) {
    store.notify('error', '保存失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { policyBusy.value = false; }
}
/* 六十六批：策略编辑弹窗 Enter=保存（can 与主按钮 disabled 同口径；Monaco 内是
   TEXTAREA，tagName 检查天然放行，Enter 换行不受接管影响） */
useModalEnter(policyEditOpen, savePolicy, () => !policyBusy.value);
/* 提交防重（INTERACTION §4 范式）：删除在途时双击/重入直接短路 */
const deleting = ref(false);
async function deletePolicy(name: string) {
  if (deleting.value) return;
  if (!await askConfirm({
    title: '删除 ILM 策略',
    level: 'critical', guardText: name,
    message: `将删除策略「${name}」。已应用该策略的索引会停止生命周期推进，此操作不可恢复。`,
    okText: '删除策略',
  })) return;
  deleting.value = true;
  try {
    await api.ilmPolicyDelete(name);
    store.notify('success', `策略 ${name} 已删除`);
    if (selected.value?.name === name) selected.value = null;
    loadPolicies();
  } catch (e: any) {
    store.notify('error', '删除失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { deleting.value = false; }
}

const policies = ref<any[]>([]);
const loading = ref(false);

/* 三百一十批：ILM phase 迁移是典型盯进度场景——接 useAutoRefresh（KeepAlive/页面隐藏/卸载全链停续） */
const ilmAutoRefresh = usePref('ilm.autoRefresh', false);
const ilmIntervalMs = usePref('ilm.intervalMs', 30000);
const ilmRefresher = useAutoRefresh(loadPolicies, {
  ms: () => (ilmAutoRefresh.value ? ilmIntervalMs.value : 0),
  guard: () => !loading.value,
});
/* 五百三十三批：内部意图恒开（on 初值 false 时 restart() 是 no-op，310 批自动刷新静默不排表
   隐患）——实际运行由 ms getter 与用户 usePref 开关相与决定；TasksView :455 正典范式 */
ilmRefresher.setOn(true);
watch(ilmAutoRefresh, (v) => { if (v) loadPolicies(); ilmRefresher.restart(); });
watch(ilmIntervalMs, () => ilmRefresher.restart());

const loadErr = ref('');
/* R42 §8.3：策略过滤与 explain 索引进 URL，排障链接可直接分享 */
const filter = useScopedDraft('kw', { route: 'ilm' }, '').text;
const selected = ref<any>(null);
/* R60/R61：explain 索引并轨 useIdxState（只读解释视图，属跟随白名单）。深链兼容：
   useIdxState 内部就是 useUrlState('idx', pickedIdx)——同键同语义，历史 ?idx= 分享链接
   原样可用，且深链值上行 store.pick（顶栏就位）。顶栏切索引即跟随；
   loadExplain 改由 watch 驱动：n-select @update:value 只覆盖用户交互，follow 的
   程序化改值不经过它——不补 watch 会渲染出「新索引名 + 旧 explain」的错配。 */
const explainIndex = useIdxState({ follow: true });
watch(explainIndex, () => loadExplain());
const explain = ref<any>(null);
const explainErr = ref('');
const explainLoading = ref(false); // explain 无骨架态，仅用于重试按钮防重入

/* Elastic 官方 phase 语义 → 主题 token（W-C 批：原 PHASE_DARK/PHASE_LIGHT 双表 + 五枚裸 hex 退役，
   单 token 表双主题自适应——theme.css 对 --dv-* 系与 --err 在 :root[data-theme="light"] 各备加深档，
   视图零分支，对齐 AnalyzeView palette 的 --dv-* color-mix 先例）。
   映射：hot(rollover 活跃期)=--dv-orange ｜ warm(转温)=--dv-yellow ｜ cold(转冷)=--dv-blue ｜
   frozen(冻结)=--dv-cyan ｜ delete(删除)=--err（语义错误红）。warm 原走 --warn，归并 --dv-yellow
   同族（token 分类色板，语义色 warn 留给真实告警）。
   徽标文字统一 --tx-on-strong（暗色=深字配亮填充，浅色=白字配深填充）。
   深底档（-deep）：白字彩底场景专用，浅色段已加深到 WCAG AA（≥4.5:1），暗色段回落主档。
   徽标(.ilm-ph)/时间线圆点(.ilm-tl-dot)/explain 徽章三处共用本表 */
const PHASE_COLORS: Record<string, string> = {
  hot: 'var(--dv-orange-deep)',
  warm: 'var(--dv-yellow-deep)',
  cold: 'var(--dv-blue-deep)',
  frozen: 'var(--dv-cyan-deep)',
  delete: 'var(--err)',
};

/* 五百二十四批：页头元信息串 MetaStrip items——策略/视图计数 + Explain 值；
   Explain 异常档 tone:'err' 承接原 meta-err 三元色（原裸 div 的内联 span 退役；
   原 indexOpts 裸 label/value 选项构造随 n-select 退役，索引清单语义由 IndexPicker 承担） */
const ilmMeta = computed<MetaStripItem[]>(() => [
  { value: policies.value.length, label: '策略（已注册）' },
  { value: filtered.value.length, label: '当前视图（过滤后）' },
  { value: explainSummary.value, label: 'Explain · ' + (explainIndex.value || '未选'), tone: hasErr.value ? 'err' : undefined },
]);

/* W4c：策略卡与 explain 视图互斥收口——点卡看时间线时同步清 explainIndex（URL ?idx=
   随 useIdxState 一并上行清空；watch 驱动 loadExplain 将 explain 复位）。修页头错配：
   此前点卡只改 selected，页头 Explain 元信息串仍显旧索引旧值 */
function pickPolicy(p: any) {
  selected.value = p;
  explainIndex.value = '';
}

/* W4c：左栏宽度档（循环钮切档 + usePref 跨会话记忆；最小实现，不迁 WorkbenchLayout）。
   经 CSS var 注入 grid-template-columns，窄屏断点整条覆盖不受内联 style 干扰。
   五百三十五批 W9：档循环三件套收编 useTierCycle 统一件（键名/档值/默认档语义不变） */
const { v: ilmListW, cycle: cycleIlmListW } = useTierCycle('ilm.listW', [300, 360, 440], 360);

const filtered = computed(() => {
  if (!filter.value) return policies.value;
  const kw = filter.value.toLowerCase();
  return policies.value.filter(p => p.name?.toLowerCase().includes(kw));
});

/* 搜索定位：过滤结果即命中集，卡片按渲染序带 data-hit-idx，Enter/Shift+Enter 逐个跳 */
const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => filtered.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

function phases(p: any): { name: string; min_age?: string; actions?: any }[] {
  const raw = p?.policy?.phases || {};
  const order = ['hot', 'warm', 'cold', 'frozen', 'delete'];
  return order
    .filter(n => raw[n])
    .map(name => ({ name, ...raw[name] }));
}

async function loadPolicies() {
  loading.value = true;
  try {
    const list = await api.ilmPolicies();
    policies.value = Array.isArray(list) ? list : [];
    loadErr.value = '';
  } catch (e: any) {
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', 'ilm/policies: ' + loadErr.value);
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  if (!store.indices.length) store.loadIndices();
  loadPolicies();
  // URL 带 idx（分享/刷新恢复）时自动 explain，别让用户再点一次
  if (explainIndex.value) loadExplain();
});

/* 三百三十批：explain API 带参跳 DevTools（_prefill 会话契约，run:true 直达结果） */
function explainToDevtools() {
  if (!explainIndex.value) return;
  sessionStorage.setItem('es-console.devtools.open', JSON.stringify({
    title: 'explain/' + explainIndex.value, method: 'GET',
    path: '/' + encodeURIComponent(explainIndex.value) + '/_ilm/explain', run: true,
  }));
  router.push('/devtools');
}

async function loadExplain() {
  if (!explainIndex.value) { explain.value = null; explainErr.value = ''; return; }
  explainLoading.value = true;
  try {
    explain.value = await api.ilmExplain(explainIndex.value);
    explainErr.value = '';
    selected.value = null; // 切换到 explain 视图
  } catch (e: any) {
    explainErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', 'ilm/explain: ' + friendlyEsError(String(e?.message ?? e))); /* 五百六十批：裸 err → friendlyEsError（ilm/move 557 判例同口径，前缀保留） */
    explain.value = null;
  } finally { explainLoading.value = false; }
}

/* step_info 异常（如 illegal_argument_exception）可重试当前 step */
function isRetryable(info: any): boolean {
  const t = info?.step_info?.type;
  return !!t && t !== 'no_step_info';
}

/* 提交防重：ilm/move 是写操作，重试在途时双击/Enter 重复下发直接短路 */
const retrying = ref(false);
async function doRetryStep(info: any) {
  if (retrying.value) return;
  const idx = explainIndex.value;
  if (!idx) return;
  const body = JSON.stringify({
    current_step: { phase: info.phase, action: info.action, name: info.step },
    next_step: { phase: info.phase, action: info.action, name: info.step },
  });
  retrying.value = true;
  try {
    await api.ilmMove(idx, body);
    store.notify('success', `已触发 ${idx} 重试当前 step（${info.phase}/${info.action}/${info.step}）`);
    loadExplain();
  } catch (e: any) {
    store.notify('error', 'ilm/move 失败：' + friendlyEsError(String(e?.message ?? e))); /* 五百五十七批：裸 err → friendlyEsError（XmigrateView w80 判例） */
  } finally { retrying.value = false; }
}

const explainSummary = computed(() => {
  if (!explain.value?.indices) return '-';
  const arr = Object.values(explain.value.indices) as any[];
  if (!arr.length) return '-';
  const info = arr[0];
  if (info.managed === false) return 'unmanaged';
  return info.phase + '/' + info.action;
});
const hasErr = computed(() => {
  if (!explain.value?.indices) return false;
  return Object.values(explain.value.indices as any).some((v: any) => {
    const t = v?.step_info?.type;
    return t && /exception/i.test(t);
  });
});
</script>

<style scoped>
.ilm { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 五百二十七批：.ilm-title（fs-sm/600）为 PageHeader 接管后的死规则，随标题四档收编退役 */
/* 五百六十批：类随换装挂 SearchFilterBar 根——手写输入框皮（bg2 底/line 边/4px 圆角/
   :focus 描边）退役归组件 .sfb 胶囊壳单源，本类只留落位与高度内衬（26px 对齐现行，
   高度链零动；mono 字族保留等形）；内联 width:min(200px,100%) 透传挂根（557④ 锁面） */
.ilm-input { height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); font-family: var(--font-mono, monospace); }

/* KPI 大卡墙退役：页头 inline 元信息串（W-C 批：基础形态收编全局 .meta-strip，本页只留页头下移量）。
   五百二十四批：串本体换 MetaStrip 统一件（class 透传命中本条落位），
   meta-err 三元色由组件 tone:'err' 语义档承接，scoped 提级规则随迁删除。
   五百二十五批：全局 .meta-strip 类退役只留 .mono，落位下移量改挂 .ilm-meta */
.ilm-meta { margin-top: 3px; }

/* W4c：左列宽由 --ilm-list-w（usePref 宽度档）注入，minmax 下限保留 */
.ilm-grid { display: grid; grid-template-columns: minmax(260px, var(--ilm-list-w, 360px)) minmax(0, 1fr); gap: var(--sp-3); min-height: 500px; }
/* 五百四十七批：pane 壳（.card 三件套）退役——flex/overflow 布局语义与 .card padding 载体
   原样迁入无壳类（14px 垂直留白为 .card 刻意值随迁保字面，内容边距零变动） */
.ilm-list { display: flex; flex-direction: column; overflow: hidden; padding: 14px var(--sp-4); }
.ilm-rows { flex: 1; overflow-y: auto; padding: var(--sp-1h) 0; }
.ilm-p { padding: var(--sp-2h) var(--sp-3); cursor: pointer; border-bottom: 1px solid var(--line); transition: background var(--tr); }
.ilm-p:hover { background: var(--bg2); }
.ilm-p.on { background: var(--ac-soft); }
/* 当前命中行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.ilm-p.hit-cur { background: var(--ac-soft) !important; box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }
.ilm-p-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-1h); font-size: var(--fs-sm); }
.ilm-p-phases { display: flex; gap: var(--sp-1); flex-wrap: wrap; margin-bottom: var(--sp-1); }
.ilm-ph { display: inline-flex; align-items: center; gap: 5px; padding: var(--sp-0) var(--sp-2); border-radius: var(--r-m); color: var(--tx-on-strong); font-size: var(--fs-xs); font-weight: 600; }
.ilm-ph-age { opacity: .85; font-size: var(--fs-xs); }
.ilm-p-time { font-size: var(--fs-xs); color: var(--tx2); }

/* 五百四十七批：pane 壳退役，overflow 布局语义与 .card padding 载体原样迁入 */
.ilm-detail { overflow: auto; padding: 14px var(--sp-4); }
/* 第十批：14px 18px→var(--sp-4)（16px，间距落梯） */
.ilm-timeline { padding: var(--sp-4); position: relative; }
.ilm-timeline::before { content: ''; position: absolute; left: 32px; top: 30px; bottom: 30px; width: 2px; background: var(--line); }
.ilm-tl { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-4); position: relative; }
.ilm-tl-dot { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--tx-on-strong); font-weight: 600; z-index: 1; box-shadow: 0 0 0 3px var(--bg0); }
.ilm-tl-body { flex: 1; }
.ilm-tl-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1h); font-size: var(--fs-md); }
.ilm-tl-actions { display: flex; flex-direction: column; gap: var(--sp-1h); margin-top: var(--sp-1); }
.ilm-tl-action { background: var(--bg2); border-radius: var(--r-xs); padding: var(--sp-1h) var(--sp-2h); }
.ilm-tl-action b { color: var(--info); font-size: var(--fs-xs); }
.ilm-tl-action pre { margin: var(--sp-1) 0 0; font-size: var(--fs-xs); max-height: 180px; overflow: auto; }

.ilm-ex { padding: var(--sp-4); } /* 第十批：14px 18px→var(--sp-4) */
.ilm-ex-row { padding: var(--sp-3) 0; border-bottom: 1px solid var(--line); }
.ilm-ex-row:last-child { border-bottom: 0; }
.ilm-ex-name { font-size: var(--fs-md); font-weight: 600; color: var(--tx0); margin-bottom: var(--sp-2); }
.ilm-ex-unmg { display: inline-flex; align-items: center; gap: var(--sp-1h); color: var(--tx2); font-size: var(--fs-xs); padding: var(--sp-1) var(--sp-2); background: var(--bg2); border-radius: var(--r-xs); }
.ilm-ex-unmg code { background: var(--bg1); padding: 1px var(--sp-1); border-radius: 2px; color: var(--info); }
.ilm-ex-line { display: flex; align-items: center; gap: var(--sp-1h); padding: 3px 0; font-size: var(--fs-xs); }
.il-noact { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1h); }
.ilm-ex-l { color: var(--tx2); text-transform: uppercase; font-size: var(--fs-xs); letter-spacing: .04em; }
/* 五百二十八批：phase 枚举英文小字（中文主体后缀，XmigrateView .xm-st-en 同款） */
.ilm-ph-en { font-size: var(--fs-2xs); opacity: .65; margin-left: 3px; }
.ilm-ex-step { margin-top: var(--sp-1h); }
.ilm-ex-step pre { background: var(--bg2); padding: var(--sp-2); border-radius: var(--r-xs); font-size: var(--fs-xs); max-height: 220px; overflow: auto; margin: var(--sp-1) 0 0; }
.ilm-ex-step pre.err { background: var(--err-soft); color: var(--err); border-left: 3px solid var(--err); }

/* 五百二十五批：策略编辑弹窗 JsonArea 视口档——:rows=18 定高回退，弹性高 min(60vh,358px)
   覆盖内层 monaco-host 内联 height（!important 同 JsonArea .ja.fill 先例） */
.ilm-policy-ja :deep(.monaco-host) { height: min(60vh, 358px) !important; }
/* 五百五十七批：弹窗编辑器外框退役（立法③，AnalysisSettings as-card-raw:365 判例同语言）
   ——n-modal 卡头与 JsonArea 自带 ja-bar 工具条（bg+border-bottom）自承分界，不另补承接线
   （记档：本面无 header 元素直接贴编辑器）；组件本体零触，纯视觉 */
.ilm-policy-ja { border: none; border-radius: 0; }

/* 五百五十批：死 .empty 规则随迁删除（两处空态早已 EmptyState 化，模板零引用实证） */
/* R99：R66 实测 iframe 可用宽 ~866px，固定栏宽在此崩塌。
   断点值复用 theme.css 既有的 1000px，不新造断点。 */
@media (max-width: 1100px) {
  .ilm-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 五百二十九批：900 紧凑微调档（§9.3 口径；§6q 遗留补齐，W-D）——策略列表/详情堆叠已由
   1100 档收编，此处收时间线/示例区侧距，时间线头与示例键值行允许换行（长策略名/长 code 不再硬挤） */
@media (max-width: 900px) {
  .ilm-timeline { padding: var(--sp-3); }
  .ilm-ex { padding: var(--sp-3); }
  .ilm-tl-head { flex-wrap: wrap; }
  .ilm-ex-line { flex-wrap: wrap; }
}
</style>
