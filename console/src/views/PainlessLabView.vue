<template>
  <div class="pl-page">
    <PageHeader :icon="FlaskConical" title="Painless 脚本沙盒">
      <template #subtitle>
        _scripts/painless/_execute · 已存储脚本 CRUD · 一键注入到 UBQ ·
            <b>{{ storedList.length }}</b> 个已存储
      </template>
      <template #actions>
<button class="btn ghost sm" @click="loadStored" :disabled="storedLoading">
          <RefreshCw :size="12" :class="{ spinning: storedLoading }" /> 刷新
        </button>
      </template>
    </PageHeader>

    <div class="pl-body" :style="{ '--pl-rail-w': plRailW + 'px' }">
      <div class="pl-left">
        <div class="pl-panel">
          <!-- W2 批：左栏宽度档（usePref painless.railW，默认 260=原 minmax 上限） -->
          <div class="pl-panel-tt">
            上下文
            <button class="btn ghost xs" data-pl-rail-w :title="'左栏宽度档：' + plRailW + 'px'" @click="cycleRailW">宽</button>
          </div>
          <select v-model="context" class="pl-sel" aria-label="执行上下文">
            <option value="painless_test">painless_test（默认，无文档）</option>
            <option value="filter">filter（返回 boolean）</option>
            <option value="score">score（返回 double）</option>
          </select>

          <div class="pl-panel-tt pl-mt">模板</div>
          <div class="pl-tpl">
            <button v-for="t in TEMPLATES" :key="t.name" class="btn ghost xs" @click="loadTpl(t)">
              {{ t.name }}
            </button>
          </div>
        </div>

        <div class="pl-panel">
          <div class="pl-panel-tt">已存储脚本（{{ storedList.length }}）</div>
          <div class="pl-stored-list">
            <!-- R92-A2：失败态与空态分离——拉取失败不能伪装成「暂无存储脚本」；
                 G7-B3：err 态独立顶置，有旧列表时并存，不再互斥顶掉整列。
                 五百五十七批：手写 err-mini（pl-empty-mini 空态家族遗留档）收编 EmptyState compact
                 统一件——storedErr 文案经 :text 逐字透传、「重试」走 action-text；「重试」在途防重入
                 由 retryStored 起手短路等值承接（原钮 :disabled="storedLoading" 语义）；
                 pl-err-mini 类名保留作行为锁落位锚（io-recs-cnt 锚类保留同先例），样式档退役 -->
            <EmptyState v-if="storedErr" compact :icon="AlertCircle" :text="storedErr" action-text="重试" class="pl-err-mini" @action="retryStored" />
            <!-- G7-B2：loading 初值 true——首帧出加载文案，不闪「暂无存储脚本」假空态；
                 类名不挂 empty 家族（进行态与空态视觉可分） -->
            <div v-if="storedLoading && !storedList.length" class="pl-load-mini">正在拉取已存储脚本…</div>
            <EmptyState v-else-if="!storedErr && !storedList.length" compact :icon="Save" text="暂无存储脚本" hint="左侧写好后点「存储」入集群，供 script_score 等复用" />
            <div v-for="s in storedList" :key="s.id" class="pl-stored" :class="{ active: selectedStored === s.id }"
              @click="pickStored(s)" role="button" tabindex="0" @keydown.enter.prevent="pickStored(s)" @keydown.space.prevent="pickStored(s)">
              <span class="pl-stored-id" :title="s.id">{{ s.id }}</span>
              <span class="pl-stored-lang">{{ s.lang }}</span>
              <X v-if="canOps" :size="10" class="pl-stored-x" :aria-label="'删除脚本 ' + s.id" @click.stop="deleteStored(s.id)" />
            </div>
          </div>
        </div>
      </div>

      <div class="pl-right">
        <!-- 源码 + params（JSON）合并单卡两分区，共享一条卡头 -->
        <div class="pl-editor">
          <div class="pl-editor-hd">
            <span class="pl-editor-tt">源码 (Painless)</span>
            <input v-model="scriptId" placeholder="脚本 ID（保存用）" class="pl-inp-sm" list="pl-ids" />
            <datalist id="pl-ids"><option v-for="s in storedList" :key="s.id" :value="s.id" /></datalist>
            <div v-if="scriptIdHint" class="il-hint" :class="'il-' + scriptIdLevel">{{ scriptIdHint }}</div>
            <button v-if="canOps" class="btn ghost xs" @click="save" :disabled="!scriptId.trim() || saving">
              <Save :size="11" /> {{ saving ? '保存中…' : '保存' }}
            </button>
            <button class="btn primary xs" @click="run" :disabled="busy">
              <Play :size="11" /> {{ busy ? '执行中…' : '试跑' }}
            </button>
          </div>
          <!-- 五百二十四批：主编辑面接 painless assist（四骨架补全 + doc['f'] hover 通道；
               本页无索引上下文，fields 恒空=零字段候选/hover 静默，纯骨架补全收益。
               setup 作用域常量 plSrcAssist，防模板内联对象渲染换引用反复重注册 provider） -->
          <MonacoEditor v-model="source" language="painless" height="100%" class="pl-src-ed"
            :dsl-assist="plSrcAssist"
            :style="plSrcH > 0 ? { flex: '0 0 auto', height: plSrcH + 'px' } : undefined" @execute="run" />
          <!-- W2 批：源码/params 中缝拖拽（SplitHandle 复用件，键盘/双击重置自带）；
               plSrcH=0 保持原 15:11 flex 比例，拖过即 px 定高并 usePref 落盘 -->
          <SplitHandle axis="horizontal" :size="plSrcH > 0 ? plSrcH : 150" :min="100" :max="2400"
            label="源码/params 高度分配" @resize-end="(s: number) => plSrcH = clampSrcH(s)" @reset="plSrcH = 0" />
          <!-- 五百六十二批：.pl-sec-tt 字排三件（字号/字重/色）挂全局 .sec-t 单源（theme.css :386），
               锚类只留 padding 布局职责 -->
          <div class="sec-t pl-sec-tt">params（JSON）</div>
          <MonacoEditor v-model="params" language="json" height="100%" class="pl-params-ed" />
        </div>

        <div class="pl-result">
          <div class="pl-editor-hd">
            <span class="pl-editor-tt">执行结果</span>
            <!-- W2 批：结果区高度档（usePref painless.outH，默认 260=原写死值） -->
            <button class="btn ghost xs" data-pl-out-h :title="'结果区高度档：' + plOutH + 'px'" @click="cycleOutH">高</button>
            <!-- 五百五十七批：原始 IO 快查——本页最近一次脚本求值（painless/execute）请求/响应原文
                 （ioRecorder 记录环；结果工具行钮，与复制/注入同列，BulkEditor xs 钮形先例） -->
            <button class="btn ghost xs" data-test="raw-io" aria-label="查看原始 IO（脚本求值）" title="最近一次脚本求值请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="11" /> 原始 IO</button>
            <!-- 五百一十九批：结果区补复制出口（copyText 诚实口径，与全站复制钮同反馈语言）；
                 五百二十五批：显隐条件随错误态分离扩为 result || runErr（错误全文同样可复制/注入） -->
            <button class="btn ghost xs" v-if="result || runErr" @click="copyResult">
              <Copy :size="11" /> 复制
            </button>
            <button class="btn ghost xs" v-if="result || runErr" @click="injectUbq">
              <Send :size="11" /> 注入到 UBQ
            </button>
          </div>
          <!-- 五百一十九批：结果裸插值 → highlightJson 范式（输出已转义；
               .pl-out/.pl-out.err 类名契约保留——devxThreeState 渲染锁 err 标记与文本）。
               五百二十五批：错误态与 result 分离——「错误：」前缀退场（DevToolsView 语义色轮口径：
               前缀破坏 highlightJson 的 JSON 侦测），错误全文走 errPreHtml（含 { 着色否则转义平文），
               outHtml 单一出处分派；.pl-out.err 红色语义不变 -->
          <pre v-if="result || runErr" class="pl-out json-view" :class="{ err: !!runErr }" v-html="outHtml" :style="{ maxHeight: plOutH + 'px' }"></pre>
          <EmptyState v-else compact :icon="FlaskConical" text="点击「试跑」运行脚本" hint="或从「模板 / 已存储脚本」加载" />
        </div>
      </div>
    </div>

    <!-- 五百五十七批：原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 painless/execute 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { usePref } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* 五百五十八批：painless.outH/railW 三件套收编 */
import EmptyState from '../components/EmptyState.vue';
import { FlaskConical, RefreshCw, Save, Play, X, Send, Copy, Terminal, AlertCircle } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 五百五十七批：原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { friendlyEsError } from '../utils/esError';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useScopedDraft } from '../composables/useScopedDraft';
import { askConfirm } from '../composables/confirm';
import { useInputLint, dupRule } from '../composables/useInputLint';
import { useRouter } from 'vue-router';
import MonacoEditor from '../components/MonacoEditor.vue';
import SplitHandle from '../components/SplitHandle.vue';
/* 第十批：params 补全 provider——与 MonacoEditor 同一 monaco 单例模块（语言级注册，dispose 随组件卸载） */
/* 五百一十九批：结果区高亮走 highlightJson（jsonc.ts 单一出处，与 RestView respErr 同范式）；
   五百二十五批：错误全文 pre 走 errPreHtml 内核 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { stripJsonComments, highlightJson } from '../utils/jsonc';
/* 五百三十五批：errMeta 随双参换装接入（utils/errPre 帮手只读复用） */
import { errPreHtml, errMeta } from '../utils/errPre';
import { copyText } from '../utils/format';

const store = useAppStore();
/* 二百二十一批：权限门禁——stored script 保存/删除=/cluster/scripts/put|delete=CLUSTER 档（rank3+）；
   试跑 execute 是只读模拟（READONLY_POST），全角色可用 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/scripts/put', store.target));
const router = useRouter();

/* 第四十五批：执行上下文偏好 usePref 持久化——工作区选择切页回来不再重选 */
const context = usePref('painless.context', 'painless_test');
/* W2 批：可调三件（usePref 跨会话记忆）——
   源码/params 中缝拖拽（painless.srcH，0=原 15:11 flex 比例）/
   结果区高度三档（painless.outH，默认 260=原写死值）/
   左栏宽度三档（painless.railW，默认 260=原 minmax 上限） */
const plSrcH = usePref('painless.srcH', 0);
function clampSrcH(s: number) { return Math.round(Math.min(2400, Math.max(100, s))); }
/* 五百五十八批：两处三件套（TIERS+usePref+手写 cycle）收编 useTierCycle 单源（键不变=零迁移）。
   两处默认档 260 均非首位（档值数组第二位），defVal 必须显式传，缺省会漂到 tiers[0]
   破坏「默认 260=原写死值/minmax 上限」口径；cycle 语义等值 */
const OUT_H_TIERS = [180, 260, 400];
const { v: plOutH, cycle: cycleOutH } = useTierCycle('painless.outH', OUT_H_TIERS, 260);
const RAIL_W_TIERS = [200, 260, 320];
const { v: plRailW, cycle: cycleRailW } = useTierCycle('painless.railW', RAIL_W_TIERS, 260);
/* 草稿治理补全(w24):painless 脚本/参数草稿(按集群目标隔离) */
const plScope = { route: 'painless-lab',};
const source = useScopedDraft('source', plScope, 'return params.a + params.b;').text;
/* 五百二十四批：painless 面 assist——本页无索引上下文，fields 恒空（骨架补全不依赖 fields，
   hover 因空表静默）；MonacoEditor 有 dslAssist 才注册 provider，缺席=零注册 */
const plSrcAssist = { fields: () => [] as { path: string; type: string }[] };
const params = useScopedDraft('params', plScope, '{\n  "a": 1,\n  "b": 2\n}').text;
const scriptId = ref('');
/* ux2 Task 11：脚本 ID 查重 warn（put 覆盖语义）+ datalist 原生补全，就地校验（闭包迟引用 storedList 无 TDZ） */
const { hint: scriptIdHint, level: scriptIdLevel, check: scriptIdCheck } = useInputLint([
  dupRule(() => storedList.value.map(s => s.id), '脚本'),
]);
watch(scriptId, v => scriptIdCheck(v));
const busy = ref(false);
const result = ref('');
/* G7 复审 M1：执行错误态独立标记——结果区 err 红色（对齐 RestView .rt-err-pre / DevTools .dt-out-pre.err），
   不再与正常结果同色（⚠️ 不可用提示属功能不可用不算执行错误，不置位）。
   五百二十五批：runErr 升级为错误态单一出处（存原始错误全文，非空=错误态）——
   原来的「错误：」前缀写入 result 退场（前缀破坏 highlightJson 着色侦测，DevToolsView 口径） */
const runErr = ref('');
/* 五百三十五批：原始错误对象旁路留存——runErr 仍压串（全文回看语义逐字保留），
   ApiError 实例经 errMeta 出 code/endpoint 错误链（errPreHtml 双参喂入） */
const runErrRaw = ref<unknown>(null);
const storedList = ref<{ id: string; lang: string; source: string }[]>([]);
const storedErr = ref('');
/* G7-B2：自动拉取页 loading 初值 true——首帧出加载文案，不闪假空态 */
const storedLoading = ref(true);
const selectedStored = ref('');
/* G7-C4：保存写链路防重入（守卫 + :disabled + 「保存中…」+ finally 复位） */
const saving = ref(false);

const TEMPLATES = [
  { name: '算术', ctx: 'painless_test', src: 'return params.a + params.b;', p: { a: 1, b: 2 } },
  { name: '字符串', ctx: 'painless_test', src: 'return params.name.toUpperCase();', p: { name: 'hello' } },
  { name: '过滤', ctx: 'filter', src: 'doc["price"].value >= params.min', p: { min: 100 } },
  { name: '评分', ctx: 'score', src: '_score * params.boost', p: { boost: 1.5 } },
  { name: '批更新', ctx: 'painless_test', src: 'ctx._source.updatedAt = params.now; return ctx._source;', p: { now: Date.now() } },
  { name: '空值默认', ctx: 'painless_test', src: 'return ctx._source.category != null ? ctx._source.category : params.dflt;', p: { dflt: 'others' } },
];

/* 七百一十三批 G50：切输入源=结果区旧输出/旧错误一并失效（与 run() 起手三清对称，
   runErrRaw 旁路留存随错误态同生命周期） */
function loadTpl(t: any) { context.value = t.ctx; source.value = t.src; params.value = JSON.stringify(t.p, null, 2); result.value = ''; runErr.value = ''; runErrRaw.value = null; }

/* 第十批：params 补全——painless 语言级 provider 解析 params 草稿顶层键，注入 `params.X` 候选。
   params 经闭包现读最新值（useScopedDraft ref，编辑即生效，无需随 params 变化重注册）；
   JSONC 宽容解析（带注释仍可解析），解析失败零候选不扰动；dispose 随组件卸载（语言级注册全局唯一）。 */
let paramsProvider: monaco.IDisposable | null = null;
onMounted(() => {
  paramsProvider = monaco.languages.registerCompletionItemProvider('painless', {
    triggerCharacters: ['.'],
    provideCompletionItems(model: any, position: any) {
      let entries: [string, unknown][] = [];
      try {
        const obj = JSON.parse(stripJsonComments(params.value || '{}'));
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) entries = Object.entries(obj);
      } catch { /* params 非 JSON：零候选，不报错不扰动 */ }
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: word.startColumn, endColumn: word.endColumn,
      };
      return {
        suggestions: entries.map(([k, v], i) => ({
          label: 'params.' + k,
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'params.' + k,
          /* 值摘要帮用户确认键义（长值截断）；'!' 前缀 sortText 升权压过词表兜底建议 */
          detail: k + ' = ' + String(JSON.stringify(v) ?? '').slice(0, 60),
          sortText: '!' + String(i).padStart(3, '0'),
          range,
        })),
      };
    },
  });
});
onBeforeUnmount(() => { paramsProvider?.dispose(); paramsProvider = null; });

async function run() {
  if (busy.value) return;
  busy.value = true; result.value = ''; runErr.value = ''; runErrRaw.value = null;
  try {
    let p = {};
    /* G7 复审 M4：busy 复位统一交 finally，删嵌套 catch 里的手动复位冗余 */
    try { p = params.value.trim() ? JSON.parse(params.value) : {}; } catch { store.notify('warning', 'params JSON 无效'); return; }
    const body = { script: { source: source.value, lang: 'painless', params: p }, context: context.value };
    const r = await api.painlessExecute(JSON.stringify(body));
    if (r?.available === false) {
      result.value = '⚠️ 不可用：' + (r.reason || '') + '\n\n提示：' + (r.hint || '');
    } else {
      result.value = JSON.stringify(r, null, 2);
    }
  } catch (e: any) {
    /* 五百二十五批：错误态分离——原文进 runErr（不再拼「错误：」前缀写 result，
       DevToolsView 语义色轮口径：前缀退场，纯报错文交给 errPreHtml 按内容侦测着色）。
       五百三十五批：原始错误对象旁路留存（压串赋值语义逐字保留） */
    runErr.value = String(e?.message || e);
    runErrRaw.value = e;
  } finally { busy.value = false; }
}

/* 五百一十九批：执行结果高亮（结果已是 pretty JSON 串或纯文本错误，highlightJson 输出转义安全）。
   五百二十五批：outHtml 单一出处分派——错误态走 errPreHtml（含 { 走 highlightJson 着色、
   否则转义平文），成功结果保持 highlightJson；模板 .pl-out.err 类名契约不变。
   五百三十五批：双参换装——errMeta(runErrRaw) 出错误链 meta（非 ApiError 出空 meta，
   输出与单参逐字一致） */
const resultHtml = computed(() => highlightJson(result.value));
const outHtml = computed(() => (runErr.value ? errPreHtml(runErr.value, errMeta(runErrRaw.value)) : resultHtml.value));
/* 五百一十九批：结果复制出口（诚实口径按 copyText 结果反馈）；五百二十五批错误全文同样可复制 */
function copyResult() {
  copyText(runErr.value || result.value).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制结果' : '复制失败'));
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const body = { script: { lang: 'painless', source: source.value } };
    await api.putStoredScript(scriptId.value, JSON.stringify(body));
    store.notify('success', `脚本 ${scriptId.value} 已保存`);
    loadStored();
  } catch (e: any) { store.notify('error', '保存失败：' + (e?.message || e)); }
  finally { saving.value = false; }
}

async function loadStored() {
  storedLoading.value = true;
  try {
    const r = await api.listStoredScripts();
    const sc = r?.scripts || {};
    storedList.value = Object.entries(sc).map(([id, v]: any) => ({
      id, lang: v?.lang || 'painless', source: v?.source || '',
    }));
    storedErr.value = '';
  } catch (e: any) {
    storedErr.value = '读取脚本列表失败：' + friendlyEsError(String(e?.message ?? e));
    store.notify('warning', storedErr.value);
  } finally { storedLoading.value = false; }
}

function pickStored(s: any) {
  selectedStored.value = s.id;
  scriptId.value = s.id; source.value = s.source;
  /* 七百一十三批 G50：切脚本=旧结果/旧错误残留误导（R93 读数铁证），双清同 loadTpl */
  result.value = ''; runErr.value = ''; runErrRaw.value = null;
}
async function deleteStored(id: string) {
  if (!await askConfirm({
    title: '删除存储脚本',
    message: `将从集群删除存储脚本 "${id}"，引用它的查询/模板会立即报错，删除后不可恢复。`,
    level: 'critical',
    guardText: id,
    okText: '删除脚本',
  })) return;
  try { await api.deleteStoredScript(id); store.notify('success', `已删除脚本 ${id}`); loadStored(); }
  catch (e: any) { store.notify('error', '删除失败：' + (e?.message || e)); }
}
function injectUbq() {
  try {
    const payload = { script: { source: source.value, lang: 'painless', params: JSON.parse(params.value || '{}') } };
    sessionStorage.setItem('es-console.ubq.injected', JSON.stringify(payload));
    store.notify('success', '已注入，跳转 UpdateByQuery 面板…');
    router.push('/update-by-query');
  } catch { store.notify('warning', 'params JSON 无效'); }
}

onMounted(loadStored);

/* 五百五十七批：err 态 EmptyState「重试」入口——在途短路承接原钮 :disabled="storedLoading"
   防重入语义（loadStored 本体不设防：onMounted 首载时 storedLoading 初值即 true（G7-B2
   首帧防闪假空态位），起手短路会杀掉首载——防重入只能挂重试通道） */
function retryStored() {
  if (storedLoading.value) return;
  void loadStored();
}

/* 五百五十七批：原始 IO 快查（546/548 同款三件套）——特征 /cluster/painless/execute（脚本求值
   响应=试跑主链路 IO）；判空 rec=null（本页还没试跑过）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/painless/execute');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
</script>

<style scoped>
/* G7-C4/C6：区块级间距 token 化（--sp-1..6 = 4/8/12/16/24/32）；控件内 padding / 行级密排 / 亚阶梯不动 */
.pl-page { padding: var(--sp-2) var(--sp-3); }
/* 七百一十三批 G53：旧手写页头五类规则家族删除（页头已迁 PageHeader 组件无对应元素，
   PluginsView 五百二十七批 W-F 同款先例） */

/* W2 批：左栏宽度档走 --pl-rail-w（usePref painless.railW，默认 260=原 minmax 上限）；
   窄屏单栏由底部 @media 覆盖（规则顺序在后，custom property 不参与） */
.pl-body { display: grid; grid-template-columns: var(--pl-rail-w, 260px) minmax(0, 1fr); gap: var(--sp-3); }
.pl-left { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 五百四十五批轨4：pl-panel 面板壳（bg+border+radius）退役 → border-top 分节（rail 内两分节，
   节间距由 pl-left flex gap 承担）；pl-panel-tt 立法②弱化档（muted+uppercase+0.5px）转正
   650/tx1/.02em 行首档（540 uq-script-hd 同语言），.btn 复位补丁随 uppercase 孤儿化退役 */
.pl-panel { border-top: 1px solid var(--line); padding-top: var(--sp-2); }
.pl-panel-tt { font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; margin-bottom: var(--sp-1); display: flex; align-items: center; }
.pl-panel-tt .btn { margin-left: auto; letter-spacing: 0; }
.pl-mt { margin-top: var(--sp-2); }
.pl-sel { width: 100%; padding: var(--sp-1) var(--sp-2); font-size: var(--fs-xs); border: 1px solid var(--border); border-radius: var(--r-xs); background: var(--panel-2); color: var(--fg); }
.pl-tpl { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-1); }

.pl-stored-list { max-height: 300px; overflow-y: auto; }
.pl-stored { display: flex; gap: var(--sp-1h); align-items: center; padding: var(--sp-1) var(--sp-1h); font-size: var(--fs-xs); cursor: pointer; border-radius: 3px; border: 1px solid transparent; }
.pl-stored:hover { background: var(--panel-2); }
.pl-stored.active { background: color-mix(in srgb, var(--dv-purple) 15%, transparent); border-color: var(--dv-purple); }
.pl-stored-id { flex: 1; font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 五百一十九批：语言徽章 9px 手写小字退役——收编 --fs-2xs（全站最小档，禁 <10px） */
.pl-stored-lang { font-size: var(--fs-2xs); color: var(--muted); background: var(--panel-2); padding: 1px var(--sp-1); border-radius: 2px; }
.pl-stored-x { opacity: 0.4; }
.pl-stored-x:hover { opacity: 1; color: var(--err); } /* 五百六十一批：--danger 别名退役归 --err 本名 */
/* 五百五十七批：.pl-empty-mini/.pl-err-mini 手写空态档随 err 态收编 EmptyState compact 退役
   （空态/错误态留白归组件单源；.pl-load-mini 加载态保留——进行态与空态视觉可分，G7-B2 口径不变） */
.pl-load-mini { padding: var(--sp-2); text-align: center; font-size: var(--fs-xs); color: var(--muted); }

.pl-right { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 五百三十五批：.pl-editor/.pl-result 大容器框退役（§6v 刀④，DevToolsView dt-out 同款）——
   border+radius+panel 壳退役内容直贴；容器与类名保留布局职责（.pl-editor flex 链与
   height: max(340px, 42vh) 高度字面冻结零变动） */
/* 源码+params 编辑器弹性（原 150/110px 写死）：卡高 max(340px, 42vh) 随视口伸缩，
   340px=原卡最小内容兜底；卡内剩余高按原比例 15:11（≈150:110）分给两个编辑器 */
.pl-editor { display: flex; flex-direction: column; height: max(340px, 42vh); }
.pl-editor > .pl-src-ed { flex: 15 1 150px; min-height: 0; }
.pl-editor > .pl-params-ed { flex: 11 1 110px; min-height: 0; }
/* 五百六十二批：编辑器外框退役（立法③，560 批 sq-editor/be-card-editor 同语言视图侧
   独立追加）——pl-src-ed/pl-params-ed 双编辑器一条覆盖（卡内仅此两处 Monaco）；
   params 分区上分界由 SplitHandle 拖拽柄天然承接 */
.pl-editor > :deep(.monaco-host) { border: none; border-radius: 0; }
/* 源码+params 合并单卡：params 分区小标题（与卡头同语言、轻一档）。
   五百三十五批：panel-2 底+border-top 头条退役→sec-t 档行首横排（dt-hist-tt 同款，
   上分界由 SplitHandle 拖拽柄天然承接）。
   五百六十二批：字排三件（fs-sm/600/tx1）挂全局 .sec-t 单源，本地只留 padding 落位 */
.pl-sec-tt { padding: var(--sp-1h) 0; }
/* 五百三十五批：panel-2 底头条退役→fs-head 行首横排档（§6v 立法「分界归 fs-head
   border-bottom」——分界线保留，退的是底色块） */
.pl-editor-hd { display: flex; gap: var(--sp-1h); align-items: center; padding: 5px var(--sp-2); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); }
/* 五百三十五批：标题升 dt-pane-tt 档（650/tx1/.02em，DevToolsView 行首横排小标题同款） */
.pl-editor-tt { font-weight: 650; color: var(--tx1); letter-spacing: .02em; margin-right: auto; }
.pl-inp-sm { padding: 3px var(--sp-1h); font-size: var(--fs-xs); font-family: var(--mono); border: 1px solid var(--border); border-radius: 3px; background: var(--panel); color: var(--fg); width: 140px; }
/* W2 批：max-height 走内联 usePref（painless.outH，默认 260=原写死值），硬编码值退役 */
.pl-out { margin: 0; padding: var(--sp-2); font-family: var(--mono); font-size: var(--fs-xs); color: var(--fg); overflow: auto; white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
.pl-out.err { color: var(--err); }
/* 五百一十九批：自造空态退役——EmptyState compact 接管（.pl-empty 随裸 div 收编删除） */

/* G7-B1：断点归一 §9.3 双档标准——.pl-body 双栏→单栏堆叠语义取 1100。
   原注释「断点同 theme.css:584 的 R66」已过期：theme.css 无 1000px 档（R66 已收口 900），
   组件层游离档仅 TopBar 自留 1000/1280 两档（记档在案，五百四十八批勘误：原「theme.css
   现无任何 1000px @media」表述易误读为全站无 1000 档）；
   §9.3 口径：双栏堆叠一律 1100，局部紧凑微调一律 900。 */
@media (max-width: 1100px) {
  .pl-body { grid-template-columns: minmax(0, 1fr); }
}

/* 五百二十九批：900 紧凑微调档（§9.3 口径；§6q 遗留补齐，W-D）——左栏/编辑区堆叠已由
   1100 档收编（SplitHandle 为源码/params 纵向高度缝，不涉宽度档），此处编辑器头
   允许换行（源码标题+工具钮组窄卡不再硬挤；页头换行已归 PageHeader 组件自理） */
@media (max-width: 900px) {
  .pl-editor-hd { flex-wrap: wrap; }
}
</style>
