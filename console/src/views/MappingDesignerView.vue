<template>
  <div class="md-page">
    <!-- §7 统一页头：PageHeader 组件（.ph 系列），本地 .md-hd/.md-hd-l/.md-hd-ic/.md-hd-tt/.md-hd-sub 已删
         （页头右组 flex 修饰规则亦随七百一十七批 G61 死样式清理退役；.md-inp 随五百二十五批页内选择器退役删除） -->
    <PageHeader :icon="FolderTree" title="Mapping 设计器" subtitle="字段树可视化 · nested/object 分层 · multi-fields 展开 · 加字段向导">
        <template #actions>
<!-- 五百二十五批：页内 IndexPicker 退役换只读 CurrentIdxChip——「选索引」唯一可写入口收敛
     顶栏（架构裁决）；useIdxState follow 下行跟随不变，watch(index) 自动加载字段树语义不变 -->
<CurrentIdxChip />
  <button class="btn ghost sm" @click="doLoad" :disabled="!index || busy">
    <RefreshCw :size="12" :class="{ spinning: busy }" /> 加载
  </button>
  <button class="btn primary sm" @click="showAdd = true" :disabled="!tree.length">
    <Plus :size="12" /> 加字段
  </button>
  <!-- 五百四十八批：原始 IO 快查——本页最近一次 mapping-put 写入请求/响应原文（ioRecorder 记录环；
       GET mapping-detail 被 IndexHub/AnalyzerLab 污染，特征走写通道独占） -->
  <button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（Mapping 设计器）" title="最近一次 mapping 写入请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
    <Terminal :size="12" /> 原始 IO
  </button>
        </template>
      </PageHeader>

    <!-- 第十批：五格 md-stat 收敛 MetaStrip 统一件（值亮+标签暗+·分隔；nested 计数 tone:warn 承接原 .md-stat.warn） -->
    <MetaStrip v-if="stats.total" class="md-strip" :items="statItems" />

    <div class="md-grid">
      <div class="md-card">
        <div class="md-card-hd card-t">字段树</div>
        <div class="md-tree">
          <MappingNode v-for="n in tree" :key="n.name" :node="n" :prefix="''" @pick="pickField" />
          <!-- R41 §1：加载中/失败/未加载三态分明；loading 位走 SkeletonBox 骨架（不复用空态文案/类名）。
               五百二十四批：md-empty 裸 div 换 EmptyState compact 统一件（分支顺序与文案语义原样保留，
               mappingEmptyState 契约随迁） -->
          <div v-if="!tree.length && busy" class="md-loading">
            <SkeletonBox v-for="i in 6" :key="i" height="20px" round />
          </div>
          <EmptyState v-else-if="!tree.length && loadErr" compact :icon="ShieldAlert" :text="'加载失败：' + loadErr">
            <button class="btn ghost sm" @click="doLoad">重试</button>
          </EmptyState>
          <!-- 五百二十五批：两处空态补 actionText 三件套（action 接现成 doLoad；失败档已有插槽重试钮不动） -->
          <EmptyState v-else-if="!tree.length && loaded" compact :icon="FolderTree"
            text="索引无字段或不存在 · 检查 index 名称后重新「加载」" action-text="重新加载" @action="doLoad" />
          <EmptyState v-else-if="!tree.length" compact :icon="RefreshCw" text="未加载 · 输入 index 并点击「加载」" action-text="立即加载" @action="doLoad" />
        </div>
      </div>

      <div class="md-card">
        <div class="md-card-hd card-t">
          <span>字段详情</span>
          <span v-if="picked" class="md-meta">{{ picked.name }}</span>
        </div>
        <!-- 五百二十四批：详情空占位换 EmptyState compact 统一件 -->
        <EmptyState v-if="!picked" compact :icon="ChevronRight" text="选中字段查看详情" />
        <div v-else class="md-detail">
          <!-- 五百五十一批：九行 md-kv 键值行收编 MetaStrip mini 档（550 sv-repo-meta 判例：
               值亮+标签暗+·分隔）——纯值对六段入 items（pickedMeta）；类型 mft-type 色卡 chip
               （theme.css .chip mono 全局单源消费豁免）、copy_to 高亮块、multi-fields chip 列
               三段富内容非纯值形态，走默认插槽承接（共享分隔节奏）；.md-kv 私造行样式随迁删除 -->
          <MetaStrip class="md-kvs" :items="pickedMeta">
            <span class="ms-i"><span class="chip mono mft-type" :data-t="picked.type">{{ picked.type }}</span><i>类型</i></span>
            <span v-if="picked.copyTo" class="ms-i"><code class="md-code-block" v-html="copyToHtml"></code><i>copy_to</i></span>
            <span v-if="picked.multiFields" class="ms-i md-mf">
              <span v-for="mf in picked.multiFields" :key="mf.name" class="md-mf-i"><code>{{ mf.name }}</code>: <span class="chip mono mft-type" :data-t="mf.type">{{ mf.type }}</span></span>
              <i>multi-fields</i>
            </span>
          </MetaStrip>
        </div>
      </div>
    </div>

    <!-- 加字段弹窗 -->
    <div v-if="showAdd" class="md-modal" @click.self="showAdd = false">
      <div class="md-mo-b" ref="modalRef">
        <div class="md-mo-hd">
          <Plus :size="14" /> 新增字段
          <button class="btn ghost xs md-close" @click="showAdd = false">×</button>
        </div>
        <div class="md-mo-body">
          <div class="md-warn">
            <ShieldAlert :size="12" /> ES 硬性约束：只能<b>加</b>字段，不能改类型 / 删字段（需 reindex）。加错也不可撤销。
          </div>
          <label class="md-lb"><span>字段路径</span>
            <input v-model="newPath" class="md-ii" placeholder="user.address.city（嵌套用点分）" />
          </label>
          <label class="md-lb"><span>类型</span>
            <select v-model="newType" class="md-ii">
              <option v-for="t in TYPES" :key="t">{{ t }}</option>
            </select>
          </label>
          <label v-if="newType === 'text'" class="md-lb"><span>analyzer</span>
            <!-- 五百六十一批：两 analyzer 位挂 datalist 候选（dslCompletionContext BUILTIN_ANALYZERS
                 内置九项只读消费，AnalyzerLabView 同表判例；analyzer/search_analyzer 同候选域共享一张表） -->
            <input v-model="newAnalyzer" class="md-ii" placeholder="standard / ik_max_word / ik_smart" list="md-analyzer-opts" />
          </label>
          <label v-if="newType === 'text'" class="md-lb"><span>search_analyzer</span>
            <input v-model="newSearchAnalyzer" class="md-ii" placeholder="留空即同 analyzer" list="md-analyzer-opts" />
          </label>
          <datalist id="md-analyzer-opts"><option v-for="a in BUILTIN_ANALYZERS" :key="a" :value="a" /></datalist>
          <label v-if="newType === 'text'" class="md-lb"><span>加 .keyword 子字段</span>
            <input type="checkbox" v-model="newAddKeyword" />
          </label>
          <label class="md-lb"><span>额外 JSON（可选，覆盖）</span>
            <!-- 五百一十九批：接 dsl-assist（字段定义片段非 search body，fields 空数组——补全按通用检查降级）；
                 五百三十批：bodyKind 显式 'mapping'（MonacoEditor 缺省 ?? 'search' 冒充查询体——
                 字段定义就是 mapping 语义，键位出 properties/dynamic/type 等 mapping 目录） -->
            <!-- 五百三十四批 P1-1：档路由静态 lint 划线挂点（lintMappingBody，见 script queueMdLintMarkers） -->
            <JsonArea ref="mdJaRef" v-model="newExtra" :dsl-assist="{ fields: () => [], bodyKind: () => 'mapping' }" :rows="3" placeholder="{&quot;index&quot;:true,&quot;null_value&quot;:&quot;N/A&quot;}" />
          </label>
          <div class="md-preview">
            <div class="md-preview-hd">最终 PUT body 预览</div>
            <!-- 第十批：previewBody（已 pretty）走 highlightJson 高亮（转义安全 v-html） -->
            <pre class="json-view" v-html="highlightJson(previewBody)"></pre>
          </div>
        </div>
        <div class="md-mo-ft">
          <button class="btn ghost sm" @click="showAdd = false">取消</button>
          <button v-if="canOps" class="btn primary sm" @click="doAdd" :disabled="!newPath || busy">
            <Send :size="12" /> 提交
          </button>
        </div>
      </div>
    </div>
    <!-- 五百四十八批：原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 mapping-put 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, defineComponent, onBeforeUnmount, onMounted, watch } from 'vue';
import { fmtNum } from '../utils/format';
import { FolderTree, RefreshCw, Plus, Send, ShieldAlert, ChevronRight, ChevronDown, Terminal } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 五百四十八批：原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import { trapTabKey } from '../utils/focusTrap';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth'; /* 五百八十批：权限写门真源（用户令直接补刀） */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useIdxState } from '../composables/urlState';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* 五百二十五批：页内选择器退役换只读 chip */
import JsonArea from '../components/JsonArea.vue';
import { lintMappingBody } from '../utils/dslLint'; /* 五百三十四批 P1-1：档路由静态 lint */
import { BUILTIN_ANALYZERS } from '../utils/dslCompletionContext'; /* 五百六十一批：加字段弹窗 analyzer 族 datalist 候选源（共享表只读消费） */
import { useDebounceFn } from '../composables/useDebounceFn'; /* 五百三十四批 P1-1：划线防抖统一件 */
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue'; /* 五百二十四批：md-empty 裸空态统一件 */
/* 第十批：五格统计收编 MetaStrip 统一件 + highlightJson 高亮 + loadErr 友好化 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import { highlightJson } from '../utils/jsonc';
import { friendlyEsError } from '../utils/esError';

const store = useAppStore();
const auth = useAuthStore();
/* 五百八十批：添加字段走 POST /cluster/mapping-put（rank3 写端点）——VIEWER 不显示写入口 */
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/mapping-put', store.target)); /* 五百八十八批：端点级连接感知 */
/* 五百四十八批：原始 IO 快查（546 六页同款三件套）——/cluster/mapping-put 写通道独占；
   判空 rec=null（本页还没提交过加字段）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/mapping-put');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
/* R50：目标索引进 URL——刷新/分享链接可复原（可重入）。
   follow 下行跟随顶栏切换（同 BoostTunerView）；onMounted 时若已有索引（深链 ?idx= 或顶栏已选）
   自动加载字段树，兑现「可复原」承诺——此前深链进来只回填选择器、不拉数据 */
const index = useIdxState({ follow: true });
onMounted(() => { if (index.value) doLoad(); });
watch(index, v => { if (v) doLoad(); }); // 顶栏 follow 切换时同步重载字段树，防树是 A、写入 B
const tree = ref<any[]>([]);
const stats = ref<any>({});
const picked = ref<any>(null);
const busy = ref(false);
const loadErr = ref('');
/* R91b：区分「从未加载」与「加载成功但索引无字段」——后者再显「未加载」会误导用户 */
const loaded = ref(false);
const showAdd = ref(false);
const modalRef = ref<HTMLElement | null>(null);
/* R92-A3：键盘契约——Escape 关 + Tab 焦点陷阱（ConfirmModal 同款范式） */
function onModalKey(e: KeyboardEvent) {
  if (!showAdd.value) return;
  if (e.key === 'Escape') { showAdd.value = false; return; }
  if (modalRef.value) trapTabKey(modalRef.value, e);
}
window.addEventListener('keydown', onModalKey);
onBeforeUnmount(() => window.removeEventListener('keydown', onModalKey));
const newPath = ref('');
const newType = ref('keyword');
const newAnalyzer = ref('');
const newSearchAnalyzer = ref('');
const newAddKeyword = ref(true);
/* 草稿治理轮：新增字段参数草稿（按 集群/索引 隔离——写类视图） */
const newExtra = useScopedDraft('new-extra', {
  route: 'mapping-designer',

  index: () => index.value,
}).text;

/* 五百三十四批 P1-1：档路由静态 lint（划线通道）——lintMappingBody 直接 import 纯函数消费
   （DevTools dtLint 档路由同源）；非法 JSON 静默返 []，setMarkers([]) 即清旧划线
   （DevTools 同契约）。零请求、零阻塞（apply 门仍是既有链路）。 */
const mdJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueMdLintMarkers = useDebounceFn(() => {
  let findings: ReturnType<typeof lintMappingBody> = [];
  try { findings = lintMappingBody(JSON.parse(newExtra.value || '')); } catch { findings = []; }
  mdJaRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(newExtra, () => { queueMdLintMarkers(); }, { immediate: true });

const TYPES = [
  'keyword', 'text', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float',
  'boolean', 'date', 'date_nanos', 'binary', 'object', 'nested',
  'ip', 'geo_point', 'geo_shape', 'range', 'completion', 'flattened', 'search_as_you_type', 'histogram',
];

/* 递归子组件：字段节点 */
const MappingNode: any = defineComponent({
  name: 'MappingNode',
  props: { node: { type: Object, required: true }, prefix: { type: String, default: '' } },
  emits: ['pick'],
  setup(props, { emit }) {
    const open = ref(true);
    return () => {
      const n: any = props.node;
      const full = props.prefix ? props.prefix + '.' + n.name : n.name;
      const hasChild = !!(n.children && n.children.length);
      const cls = 'md-node t-' + n.type;
      return h('div', { class: 'md-branch' }, [
        h('div', { class: cls, onClick: () => emit('pick', { ...n, name: full }) }, [
          hasChild ? h('span', { class: 'md-caret', onClick: (e: any) => { e.stopPropagation(); open.value = !open.value; } },
            [h(open.value ? ChevronDown : ChevronRight, { size: 11 })]) : h('span', { class: 'md-caret-pl' }),
          h('span', { class: 'md-nm' }, n.name),
          h('span', { class: 'md-tp' }, n.type || 'unknown'),
          n.isNested ? h('span', { class: 'md-badge nested' }, 'nested') : null,
          n.multiFields ? h('span', { class: 'md-badge mf' }, n.multiFields.length + ' mf') : null,
          n.analyzer ? h('span', { class: 'md-badge an' }, n.analyzer) : null,
        ]),
        hasChild && open.value
          ? h('div', { class: 'md-children' }, n.children.map((c: any) =>
              h(MappingNode, { node: c, prefix: full, onPick: (v: any) => emit('pick', v) })))
          : null,
      ]);
    };
  },
});

const previewBody = computed(() => {
  if (!newPath.value) return '';
  const parts = newPath.value.split('.');
  const leaf: any = { type: newType.value };
  if (newType.value === 'text') {
    if (newAnalyzer.value.trim()) leaf.analyzer = newAnalyzer.value.trim();
    if (newSearchAnalyzer.value.trim()) leaf.search_analyzer = newSearchAnalyzer.value.trim();
    if (newAddKeyword.value) leaf.fields = { keyword: { type: 'keyword', ignore_above: 256 } };
  }
  if (newExtra.value.trim()) {
    try { Object.assign(leaf, JSON.parse(newExtra.value.trim())); } catch { /* ignore */ }
  }
  /* 用点分层嵌进 properties */
  let cur: any = leaf;
  for (let i = parts.length - 1; i > 0; i--) {
    cur = { properties: { [parts[i]]: cur } };
  }
  const root: any = { properties: { [parts[0]]: cur } };
  return JSON.stringify(root, null, 2);
});

/* 第十批：五格统计 MetaStrip items——数据与原五卡等价；nested 恒 warn 语气（原 .md-stat.warn 恒色） */
const statItems = computed<MetaStripItem[]>(() => [
  { value: fmtNum(stats.value.total), label: '总字段' },
  { value: fmtNum(stats.value.text), label: 'text' },
  { value: fmtNum(stats.value.keyword), label: 'keyword' },
  { value: fmtNum(stats.value.object), label: 'object' },
  { value: fmtNum(stats.value.nested), label: 'nested', tone: 'warn' },
]);
/* 第十批：copy_to 数组 pretty 后走 highlightJson（原裸 stringify 退役） */
const copyToHtml = computed(() =>
  picked.value?.copyTo ? highlightJson(JSON.stringify(picked.value.copyTo, null, 2)) : '');

/* 五百五十一批：字段详情 md-kv 值对段 MetaStrip items（原九行键值行的纯值对六段；
   类型/copy_to/multi-fields 三段富内容走插槽，见模板注）。
   七百一十七批 G60：三段英文参数 label 补中文 tip（铁律 F「任何英文参数必须有中文备注」，
   悬停可达；715 批 RemoteClusters G55 同款） */
const pickedMeta = computed<MetaStripItem[]>(() => {
  const p = picked.value;
  if (!p) return [];
  return [
    { value: p.name, label: '名称' },
    ...(p.analyzer ? [{ value: p.analyzer, label: 'analyzer', tip: '写入分词器' }] : []),
    ...(p.searchAnalyzer ? [{ value: p.searchAnalyzer, label: 'search_analyzer', tip: '搜索分词器' }] : []),
    ...(p.format ? [{ value: p.format, label: 'format', tip: '字段存储格式' }] : []),
    { value: p.isNested ? '✅ yes' : 'no', label: '是否 nested' },
    { value: p.isObject ? '✅ yes' : 'no', label: '是否 object' },
  ];
});

async function doLoad() {
  if (!index.value.trim()) return;
  busy.value = true;
  loadErr.value = '';
  try {
    const r: any = await api.mappingDetail(index.value.trim());
    tree.value = r.tree || [];
    stats.value = r.stats || {};
    picked.value = null;
    loaded.value = true;
    if (!tree.value.length) store.notify('warning', '索引无字段或不存在');
  } catch (e: any) {
    /* 第十批：裸错误串改 friendlyEsError */
    loadErr.value = friendlyEsError(e?.message || String(e));
    tree.value = [];
    store.notify('error', '加载失败：' + loadErr.value);
  }
  finally { busy.value = false; }
}

function pickField(n: any) { picked.value = n; }

async function doAdd() {
  if (!newPath.value.trim() || !previewBody.value) return;
  busy.value = true;
  try {
    const r: any = await api.mappingPut(index.value.trim(), previewBody.value);
    if (r?.acknowledged) {
      store.notify('success', `字段 ${newPath.value} 已添加`);
      showAdd.value = false;
      newPath.value = ''; newExtra.value = '';
      await doLoad();
    } else {
      store.notify('error', `集群未确认 mapping 变更（acknowledged=false），字段 ${newPath.value} 可能未生效，建议重新加载确认`);
    }
  } catch (e: any) { store.notify('error', '添加失败：' + (e?.message || e)); }
  finally { busy.value = false; }
}
</script>

<style scoped>
/* 五百二十批：页面转 flex 纵向吃满可滚区——md-grid 由此拿到「页面余高」弹性 */
.md-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); display: flex; flex-direction: column; min-height: 100%; }
/* §7 页头已收敛 PageHeader 组件，本地 .md-hd/.md-hd-l/.md-hd-ic/.md-hd-tt/.md-hd-sub 删除 */
/* 五百二十五批：.md-inp 随页内 IndexPicker 退役删除（选择入口收敛顶栏 CurrentIdxChip） */
/* 七百一十七批 G61：页头右组 flex 修饰与输入框 sm 后缀窄档两条死规则删（模板 0 元素实证，
   PageHeader 收编后遗留——713 G53/715 G56 同族；R97 通杀扫描定案） */
.md-ii { background: var(--bg2); border: 1px solid var(--border); color: var(--fg); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-xs); min-width: 200px; font-family: var(--mono); font-size: var(--fs-sm); }
/* 第十批：五格统计改挂 MetaStrip（原 .md-stat-row/.md-stat 规则随组件退役；落位间距等价保留） */
.md-strip { margin-bottom: var(--sp-3); }
/* 五百二十批：grid 吃页面余高（单行两列，align-content stretch 拉伸行高）；min-height:0 传递 */
.md-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); gap: var(--sp-3); flex: 1 1 auto; min-height: 0; }
/* 五百二十批：卡转 flex 纵向——字段树/详情随行高弹性。
   五百四十五批轨4：md-card 壳 chrome 退役（540 df/rd/sy 同语言）——内容直贴，分界由
   md-card-hd 既有 border-bottom 承接；overflow+flex+min-height 骨架逐字保留（收缩防撑破
   是结构语义非 chrome） */
.md-card { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
/* 五百二十七批：卡头档归位——.md-card-hd 自造形态（fs-sm/400）换挂全局 .card-t（fs-md/650），
   本类只留壳差异（内边距/发丝线/space-between；卡头带边框不吃 .card-t 的 margin-bottom） */
.md-card-hd { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); justify-content: space-between; margin-bottom: 0; }
.md-meta { color: var(--muted); font-size: var(--fs-xs); font-family: var(--mono); }
/* 五百二十批：60vh 钉死封顶改 flex 弹性——字段树吃卡片余高（卡随页面余高拉伸），
   min-height:0+overflow 内滚兜底 */
.md-tree { padding: var(--sp-2); flex: 1 1 auto; min-height: 0; overflow: auto; }
/* 五百二十四批：.md-empty 裸空态规则随 EmptyState compact 收编删除（.md-loading 进行态保留） */
/* 字段树 loading 骨架容器（进行态与空态视觉可分，不复用 .md-empty 命名） */
.md-loading { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); }
/* R91：MappingNode 是 render 函数内联组件，元素拿不到本 SFC 的 scope 属性——
   树节点样式必须走 :deep()（同 DslQueryView 的 pf-* / ConfigDriftView 的 cd-* 范式），
   否则整棵字段树裸奔成纯文本（名字+类型黏连）。 */
:deep(.md-branch) { margin: 1px 0; }
:deep(.md-node) { display: flex; align-items: center; gap: var(--sp-2); padding: 3px var(--sp-2); border-radius: var(--r-xs); cursor: pointer; font-size: var(--fs-sm); font-family: var(--mono); }
:deep(.md-node:hover) { background: var(--bg2); }
:deep(.md-caret), :deep(.md-caret-pl) { width: 14px; display: inline-flex; align-items: center; justify-content: center; }
:deep(.md-nm) { color: var(--fg); }
:deep(.md-tp) { color: var(--brand); font-size: var(--fs-xs); }
:deep(.md-badge) { font-size: var(--fs-xs); padding: 1px var(--sp-2); border-radius: 3px; background: var(--bg2); color: var(--muted); }
:deep(.md-badge.nested) { background: var(--warn-soft); color: var(--warn); }
/* 第十批：非法 CSS `var(--dv-violet)-soft` 修正为已定义的 --dv-violet-soft（原写法 background 整条失效） */
:deep(.md-badge.mf) { background: var(--dv-violet-soft); color: var(--dv-violet); }
:deep(.md-badge.an) { background: var(--ok-soft); color: var(--ok); }
:deep(.md-children) { padding-left: var(--sp-4); border-left: 1px dashed var(--border); margin-left: var(--sp-2); }
.md-detail { padding: var(--sp-3); }
/* 五百五十一批：md-kv 私造键值行样式随 MetaStrip 收编退役（形态归 .ms 单源，类名 md-kvs 在场） */
/* 第十批：copy_to pretty 多行展示（code 默认 white-space 会把换行塌成空格） */
.md-code-block { white-space: pre-wrap; word-break: break-all; }
.md-mf { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.md-mf-i { font-size: var(--fs-xs); padding: var(--sp-0) var(--sp-2); background: var(--bg2); border-radius: 3px; }
.md-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--mask); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal-view); }
.md-mo-b { width: 520px; max-width: 94vw; max-height: 82vh; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-m); display: flex; flex-direction: column; }
.md-mo-hd { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); font-size: var(--fs-md); font-weight: 650; display: flex; align-items: center; gap: var(--sp-2); }
.md-close { margin-left: auto; }
/* 五百二十批：弹窗体转 flex——md-mo-body 吃弹窗（max-height:82vh）余高，preview 随之弹性 */
.md-mo-body { padding: var(--sp-3) var(--sp-4); overflow-y: auto; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
/* 五百五十八批(b)：加字段弹窗 extra JsonArea 外框退役（557 批 ilm 弹窗同语言）——
   md-mo-hd 既有 border-bottom + ja-bar 工具条自承分界；组件本体零触，纯视觉 */
.md-mo-body :deep(.ja) { border: none; border-radius: 0; }
.md-mo-ft { padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border); display: flex; gap: var(--sp-2); justify-content: flex-end; }
.md-warn { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--warn); padding: var(--sp-2) var(--sp-3); background: var(--warn-soft); border-radius: var(--r-xs); margin-bottom: var(--sp-3); }
.md-lb { display: block; margin-bottom: var(--sp-2); font-size: var(--fs-sm); }
.md-lb > span { display: block; color: var(--muted); margin-bottom: var(--sp-1); }
.md-lb .md-ii { min-width: 100%; box-sizing: border-box; }
/* 五百五十一批：.md-ta 死规则随编辑器外框退役删除（额外 JSON 编辑器早已 JsonArea 化，
   模板 grep 0 引用实证——bg2+border+radius 外框形态不回流，flattenWave551① 源码锁） */
/* 五百二十批：preview 转 flex 吃弹窗体余高，pre 去 180px 封顶（min-height:0 内滚兜底） */
.md-preview { margin-top: var(--sp-3); flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.md-preview-hd { font-size: var(--fs-xs); color: var(--muted); margin-bottom: var(--sp-1); }
.md-preview pre { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-xs); padding: var(--sp-2); font-size: var(--fs-xs); font-family: var(--mono); flex: 1 1 auto; min-height: 0; overflow: auto; margin: 0; }

/* R99：R66 实测 iframe 可用宽 ~866px，固定栏宽在此崩塌。
   断点归一 §9.3 标准值 1100（堆叠语义）。 */
@media (max-width: 1100px) {
  .md-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 五百二十九批：900 紧凑微调档（§9.3 口径；§6q 遗留补齐，W-D）——编辑器/详情堆叠已由
   1100 档收编，此处收页侧距，详情键值行与弹窗底栏允许换行（长 copy_to/字段名不再硬挤） */
@media (max-width: 900px) {
  .md-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); }
  .md-mo-ft { flex-wrap: wrap; }
}
</style>
