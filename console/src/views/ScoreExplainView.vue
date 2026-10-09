<template>
  <div class="se-page">
    <div class="se-hd">
      <PageHeader :icon="Microscope" title="打分解剖" subtitle="R32 · search + explain=true · 每个命中文档的 BM25 因子树（tf/idf/boost/norm 全拆解）">
      <template #actions>
<CurrentIdxChip />
<button class="btn primary sm" @click="run" :disabled="!index || busy">
  <Play :size="12" :class="{ spinning: busy }" /> {{ busy ? '执行中…' : '执行解剖' }}
</button>
      </template>
      </PageHeader>
      <LabNav current="/score-explain" />
</div>

    <div class="se-body">
      <div class="se-left">
        <div class="se-card" :style="{ height: edH }">
          <div class="se-card-hd"><FileJson :size="12" /> Query（自动注入 explain:true）
            <!-- 533 批：编辑框高度三档循环钮（ra.script-h 同款形态），useTierCycle('se.edH') 跨会话记忆 -->
            <button class="btn ghost xs" style="margin-left:auto" data-test="se-ed-h"
              :title="'Query 编辑框高度档：' + edH" @click="cycleEdH">高</button>
            <!-- 五百四十八批：原始 IO 快查——本页最近一次 search-raw（explain）请求/响应原文（ioRecorder 记录环） -->
            <button class="btn ghost xs" data-test="raw-io" aria-label="查看原始 IO（打分解剖）" title="最近一次打分解剖请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="11" /> 原始 IO</button>
          </div>
          <JsonArea ref="seJaRef" v-model="dsl" :dsl-assist="dslAssist" :rows="6" fill @submit="run" />
          <!-- 五百二十五批：lintDsl 静态体检提示条（SearchSandboxView join 串形态同款，随输入实时重估，
               零阻塞不拦执行）——error 红条单列（结构必错 ES 直接拒绝），warning/hint 黄条并列；
               JSON 非法静默（JsonArea 圆点已报） -->
          <!-- 五百六十二批：.se-lint 私造双档随同构换装 theme.css .lint-bar 单源（561 立法，
               dt-lint「lint-bar + 原类名锚 + 档位」先例，role 语义与文案逐字不动） -->
          <div v-if="seLintErrors.length" role="alert" class="lint-bar se-lint lint-bar-err">
            <span>DSL 检查（错误）：{{ seLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
          </div>
          <div v-else-if="seLintWarns.length" role="status" class="lint-bar se-lint lint-bar-warn">
            <span>DSL 检查：{{ seLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
          </div>
          <div class="se-hint">
            <Info :size="10" />
            <!-- 整句必须包成单个 flex 子项：否则 flex 把「提示：给子」/<code>/「句加」
                 各自当独立项挤压换行，在 380px 窄栏里被撕成三栏乱码（实测） -->
            <span>提示：给子句加 <code>"_name"</code> 可在「命中矩阵」中追踪；size 建议 ≤ 20（explain 结果很大）</span>
          </div>
        </div>
        <!-- 五百二十四批：took 手写串换 MetaStrip/TookBadge 范式（SearchSandboxView ss-took 同款：
             TookBadge 四档色归统一件、item.value 无从承接组件段走默认插槽，顺序随插槽位收敛为
             命中在前，语义无损失；≥ 前缀（totalGte）并入命中值） -->
        <MetaStrip v-if="tookMs >= 0" class="se-meta" :items="seMeta">
          <span class="ms-i ms-t"><i>took</i> <TookBadge :ms="tookMs" /></span>
        </MetaStrip>
      </div>

      <div class="se-right">
        <!-- 三态契约：busy 骨架 → runErr 内联面板（重试）→ 空态 → 命中列表 -->
        <div v-if="busy" class="se-loading">
          <SkeletonBox v-for="i in 3" :key="i" height="56px" round style="margin-bottom:var(--sp-2)" />
        </div>
        <!-- 五百六十一批：se-err 完整私造红壳收编 theme.css .err-bar 单源（558b ov-loaderr 判例：
             role=alert + rise-in 语义同批补齐）——bg/border/radius/padding 色壳归基座，
             .se-err-body/-pre/-acts 结构保留作内容槽；900 档 padding 覆写随壳退役 -->
        <div v-else-if="runErr" role="alert" class="err-bar rise-in">
          <AlertCircle :size="14" />
          <div class="se-err-body">
            <!-- 第十批：首行走 friendlyEsError 一句人话，pre 保留全文回看（对齐 AnalyzeView 口径） -->
            <div><b>打分解剖失败</b> · {{ friendlyErr }}</div>
            <!-- 五百二十四批：裸插值换 errPreHtml v-html（含 { 走 highlightJson 着色，否则转义平文） -->
            <pre class="se-err-pre" v-html="errPreHtml(runErr, errMeta(runErrRaw))"></pre>
            <div class="se-err-acts">
              <button class="btn sm" @click="run" :disabled="!index || busy">重试</button>
            </div>
          </div>
        </div>
        <EmptyState v-else-if="!hits.length" :icon="Microscope" class="se-empty-fill"
                    text="尚无打分解剖结果"
                    hint="左侧写 query 后点「执行解剖」，每个命中会展开 tf/idf/boost/norm 完整打分树" />
        <template v-else>
        <div v-for="(h, i) in hits" :key="h._id" class="se-hit" :class="{ open: openIdx === i }">
          <div class="se-hit-hd" role="button" tabindex="0" :aria-expanded="openIdx === i" @click="openIdx = openIdx === i ? -1 : i" @keydown.enter.prevent="openIdx = openIdx === i ? -1 : i" @keydown.space.prevent="openIdx = openIdx === i ? -1 : i">
            <span class="se-rank">#{{ i + 1 }}</span>
            <span class="se-id" :title="h._id">{{ h._id }}</span>
            <span class="se-score-bar-wrap">
              <span class="se-score-bar" :style="{ width: scorePct(h._score) + '%' }" />
            </span>
            <span class="se-score">{{ fmtScore(h._score) }}</span>
            <span v-if="h.matched_queries?.length" class="se-mq" :title="h.matched_queries.join(', ')">
              <Tags :size="10" /> {{ h.matched_queries.length }} 子句
            </span>
            <button aria-label="复制原始 explanation JSON" class="btn ghost xs" @click.stop="copyExplain(h)" title="复制原始 explanation JSON"><Copy :size="10" /></button>
            <button aria-label="带当前 query 去「排名侦探」审问这个文档" class="btn ghost xs se-link" @click.stop="gotoWhy(h)" title="带当前 query 去「排名侦探」审问这个文档"><SearchCheck :size="10" /></button>
            <button aria-label="去「查询 X 光」给这个文档做词频取证" class="btn ghost xs se-link" @click.stop="gotoXray(h)" title="去「查询 X 光」给这个文档做词频取证"><ScanSearch :size="10" /></button>
            <ChevronDown :size="12" class="se-caret" :class="{ open: openIdx === i }" />
          </div>
          <div v-if="openIdx === i" class="se-hit-body">
            <div v-if="h.matched_queries?.length" class="se-mq-row">
              <!-- 五百六十一批：命中子句 chip 收编 MetaStrip mini 档（550 sv-repo 徽章判例同语言）——
                   子句名走 value 亮色段，「命中子句：」引导词保留；.se-mq-chip 私造皮退役 -->
              命中子句：<MetaStrip :items="h.matched_queries.map((m: string) => ({ value: m }))" />
            </div>
            <ExplainTree v-if="h._explanation" :node="h._explanation" :total="h._explanation.value" :depth="0" />
            <!-- 五百六十一批：se-empty-sub 裸 div 收编 EmptyState compact 统一件（557 rp-empty 同语言；
                 文案逐字保留，留白/图标归组件） -->
            <EmptyState v-else compact :icon="Info" text="此 hit 无 _explanation（检查 explain:true 是否被覆盖）" />
            <details class="se-src"><summary>_source</summary><JsonTree :data="h._source" /></details>
          </div>
        </div>
        </template>
      </div>
    </div>

    <!-- 五百四十八批：原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 search-raw 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Microscope, Play, FileJson, Info, Copy, ChevronDown, Tags, SearchCheck, ScanSearch, AlertCircle, Terminal } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import LabNav from '../components/LabNav.vue';import ExplainTree from '../components/ExplainTree.vue';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 五百四十八批：原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { useIdxState } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* 五百五十八批：se.edH 三件套收编 */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* 六百六十一批：值位动态候选（660 范式） */
import { useDebounceFn } from '../composables/useDebounceFn'; /* 533 批：lint 划线防抖统一件 */
import { useLinkCarry } from '../composables/useLinkCarry'; /* 五百三十一批：跨页一次性值携带统一件 */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import MetaStrip from '../components/MetaStrip.vue';
import TookBadge from '../components/TookBadge.vue';
import type { MetaStripItem } from '../components/MetaStrip.vue';
import { copyText, totalOf, fmtNum } from '../utils/format';
import { friendlyEsError } from '../utils/esError'; /* 第十批：runErr 人话化 */
import { errPreHtml, errMeta } from '../utils/errPre'; /* 五百二十四批：错误面板 pre v-html 内核；534 收口波：双参换装（errMeta 旁路） */
import JsonArea from '../components/JsonArea.vue';
import { lintDsl } from '../utils/dslLint'; /* 五百二十五批：DSL 静态体检 */
import JsonTree from '../components/JsonTree.vue';

const router = useRouter();
const store = useAppStore();
/* R50：目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState({ follow: true });
/* 五百一十九批：Query 接 dsl-assist——fields 闭包现调现读（DslQueryView 同范式）。
   fields() 侧惰性 ensure：补全触发才拉 mapping（挂载零请求），cache 命中后直读；
   不 await 零降级，失败仅无候选 */
const { fields: assistFields, ensure: ensureAssistFields } = useIndexFields(() => index.value);
/* 六百六十一批：terms 闭包接线——索引源=index 与 fields 同源现调现读（fields 惰性 ensure 形态保持，554 F 口径不变） */
const seTerms = useTermsSuggest(() => index.value);
const dslAssist = { fields: () => { if (!assistFields.value.length) ensureAssistFields(); return assistFields.value; }, terms: (f: string, p: string) => seTerms.suggestAsync(f, p) };
/* 五百二十五批：lint ctx 字段表与 dsl-assist 同源——挂载即 ensure（UpdateByQueryView immediate
   范式，只读 mapping 请求、失败零降级），fields 空=类型系规则自动跳过，零 ctx 规则始终生效 */
watch(index, () => { void ensureAssistFields(); }, { immediate: true });
/* 五百二十五批：lintDsl 静态体检（UpdateByQueryView 最简接线同款）——JSON 解析失败静默不阻塞 */
const seLint = computed(() => {
  try { return lintDsl(JSON.parse(dsl.value || ''), { fields: assistFields.value }); }
  catch { return []; }
});
const seLintErrors = computed(() => seLint.value.filter(f => f.severity === 'error'));
const seLintWarns = computed(() => seLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));
const busy = ref(false);
const hits = ref<any[]>([]);
const openIdx = ref(-1);
const tookMs = ref(-1);
const totalHits = ref(0);
const totalGte = ref(false);
const maxScore = ref<number | null>(null);

/* 五百二十四批：se-meta 手写串适配 MetaStrip items（took 徽标走默认插槽，SearchSandboxView 同款） */
const seMeta = computed<MetaStripItem[]>(() => [
  { value: (totalGte.value ? '≥ ' : '') + fmtNum(totalHits.value), label: '命中' },
  { value: String(hits.value.length), label: '展示' },
  { value: maxScore.value != null ? Number(maxScore.value).toFixed(3) : '-', label: 'max_score', tip: '最高相关度得分' },
]);

const DEFAULT_DSL = JSON.stringify({
  size: 10,
  query: { match: { _all_replace_me_: { query: '关键词', _name: 'main-match' } } },
}, null, 2).replace('_all_replace_me_', 'your_field');
/* R53：DSL 进 sessionStorage 草稿——刷新不丢稿（可重入） */
/* 草稿治理轮：DSL 草稿迁 useScopedDraft（按 集群/索引 隔离），行为不变 */
const dsl = useScopedDraft('dsl', {
  route: 'score-explain',

  index: () => index.value,
}, DEFAULT_DSL).text;

/* 533 批：lint findings 注入编辑器划线（SearchSandboxView 范式：debounce 250ms 防每敲一键
   全量 findMatches；info 降级 hint——MonacoEditor marker 档只收 warning/hint/error；
   banner 提示条保留，双通道并存）。 */
const seJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueLintMarkers = useDebounceFn(() => {
  seJaRef.value?.setMarkers?.(seLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(dsl, () => { queueLintMarkers(); }, { immediate: true });

/* 533 批：Query 编辑框高度三档循环 + 跨会话记忆（ra.scriptH 同款形态；
   起档=原 max(300px, 42vh) 弹性档，不引入 height:100% 结构）。
   五百五十八批：TIERS+usePref+手写 cycle 三件套收编 useTierCycle 单源
   （se.edH 键不变=已存档位零迁移；默认档=首位，defVal 缺省；cycle 语义等值） */
const SE_ED_H_TIERS = ['max(300px, 42vh)', 'max(390px, 56vh)', 'max(500px, 72vh)'];
const { v: edH, cycle: cycleEdH } = useTierCycle('se.edH', SE_ED_H_TIERS);

/* 五百四十八批：原始 IO 快查（546 六页同款三件套）——/cluster/search-raw 本页独占（该端点
   仅本页 explain 解剖使用）；判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/search-raw');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

function scorePct(s: number) {
  const m = maxScore.value || 0;
  return m > 0 ? Math.min(100, (s / m) * 100) : 0;
}
function fmtScore(s: any) {
  const n = Number(s);
  return isFinite(n) ? n.toFixed(4) : String(s);
}

const runErr = ref(''); // 解剖失败全文，供内联面板回看（三态契约错误位）
/* 534 收口波双参换装：原始错误对象旁路留存（catch 压串丢 code/endpoint，喂 errMeta 用） */
const runErrRaw = ref<unknown>(null);
/* 第十批：错误面板首行人话；runErr 全文保留进 pre 回看 */
const friendlyErr = computed(() => (runErr.value ? friendlyEsError(runErr.value) : ''));

async function run() {
  /* 五百二十五批：Ctrl+Enter（@submit）路径不经执行钮 :disabled——busy 期间自防重入（UBQ R126 同款） */
  if (busy.value) return;
  if (!index.value) return;
  let body: any;
  try { body = JSON.parse(dsl.value); }
  catch (e: any) { store.notify('error', 'Query JSON 解析失败：' + e.message); return; }
  body.explain = true; // 强制注入
  busy.value = true; runErr.value = ''; runErrRaw.value = null;
  try {
    const r: any = await api.searchRaw(index.value, JSON.stringify(body));
    if (r?.error) throw new Error(r.message || 'search 失败');
    tookMs.value = r.took ?? -1;
    const t = totalOf(r.hits);
    totalHits.value = t.value;
    totalGte.value = t.gte;
    maxScore.value = r.hits?.max_score ?? null;
    hits.value = r.hits?.hits || [];
    openIdx.value = hits.value.length ? 0 : -1;
    if (!hits.value.length) store.notify('warning', '查询无命中，试试放宽条件');
  } catch (e: any) {
    runErr.value = String(e?.message || e);
    runErrRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint，压串时丢失） */
    store.notify('error', '解剖失败：' + friendlyEsError(String(e?.message ?? e))); /* 五百六十批：面板 friendlyErr:221 已友好，toast 裸串并轨（BoostTunerView:347 口径） */
  } finally { busy.value = false; }
}

async function copyExplain(h: any) {
  await copyText(JSON.stringify(h._explanation ?? {}, null, 2));
  store.notify('success', '已复制 explanation JSON');
}

/* ==================== R33：实验室联动 —— hit 一键送去排名侦探 / 查询X光 ====================
   五百三十一批：手写 sessionStorage.setItem 换 useLinkCarry 统一件——键名与 payload 结构逐字保持
   （es-console.link.rankdebug={index,id,query} / es-console.link.xray={index,id}），消费端零感 */
const rankDebugCarry = useLinkCarry<{ index: string; id: string; query: string }>('rankdebug');
const xrayCarry = useLinkCarry<{ index: string; id: string }>('xray');
function gotoWhy(h: any) {
  rankDebugCarry.send({ index: index.value, id: h._id, query: dsl.value });
  router.push('/rank-debug');
}
function gotoXray(h: any) {
  xrayCarry.send({ index: index.value, id: h._id });
  router.push('/query-xray');
}
</script>

<style scoped>
.se-page { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; }
.se-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
/* 第十批：删 -hd-tt/-hd-sub 死规则（页头已由 PageHeader 接管，模板 0 引用）。
   七百二十一批：页头左组/图标色/右钮组修饰与索引输入框孤儿同族补清（PageHeader/CurrentIdxChip
   收编后模板 0 引用；713/714/715/717/719 同族） */
/* 不加 align-items: start —— 本栅格被 .se-page 的 flex 撑到整屏高，
   一旦 start 就让两栏塌回内容高，实测下方空出 612px 纯死白（栅格 846 / 左 234 / 右 147）。
   默认 stretch 让两栏吃满行高，Query 框才能长到可用尺寸。 */
.se-body { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: var(--sp-3); flex: 1; min-height: 0; }
.se-left { display: flex; flex-direction: column; gap: var(--sp-2); min-height: 0; }
/* 卡片吃左栏剩余高度但设上限：实测无上限时框高 737px、内容仅 11 行、框内 73% 是空白
   —— 那是把「框太小」换成了「框内死白」。420px 够写 DSL，余量回流给下方结果区。 */
/* 编辑器高度跟随内容、不固定撑高：flex:none + min-height 保底 + max-height 封顶。
   实测 flex:1 会把它钉在上限（354px）而 DSL 只有 7 行，框内约 200px 是空白——
   那是把「框太小」换成了「框内虚高」。余量交给下方结果区/空态。 */
/* 固定 260px：flex:none 会让外层卡片收缩，而内层 :deep(.ja-ta) 带 min-height:0，
   两者打架时 textarea 跌到 134px（比 min-height:200px 还小）。给定高度消除歧义，
   内容更长时编辑器内部滚动；下方结果区/空态用 flex:1 吃掉余量。 */
/* 第十批：定高改弹性档——max() 保留 300px 实测下限（见上三条注释），42vh 跟随视口，矮窗口不再局促。
   533 批：弹性档升三档循环（SE_ED_H_TIERS，useTierCycle('se.edH') 记忆），高度经模板 :style
   内联，本规则只留布局骨架——不引入 height:100% 结构 */
/* 五百五十四批：se-card 编辑器外框退役（立法③）——内容直贴，分界由 se-card-hd border-bottom
   承接（Kibana 同语言）；布局骨架（flex 纵向/flex:none）零触，脚本段零触 */
.se-card { border: 0; border-radius: 0; overflow: hidden; display: flex; flex-direction: column; flex: none; }
.se-card-hd { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-xs); font-weight: 650; border-bottom: 1px solid var(--border); }
/* 五百六十二批：.se-lint 私造三条（形态/warn/err）随换装 theme.css .lint-bar 单源退役
   （561 立法 dt-lint 同语言，模板锚类保留作测试/后续落位挂点） */
/* 第十批：删 .se-ta 死定高规则（模板已用 JsonArea，0 引用） */
/* JsonArea 自身已是 flex 纵向容器；只在本视图内接线让它随卡片长高，不改共享组件。
   rows=6 仅作为无 flex 时的兜底高度，这里由 flex 接管。 */
.se-card :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }
/* flex-start：整句折成两行时图标须对齐首行，center 会让图标飘到两行正中 */
.se-hint { display: flex; align-items: flex-start; gap: 5px; padding: var(--sp-1h) var(--sp-2h); font-size: var(--fs-xs); opacity: .6; border-top: 1px dashed var(--border); flex: none; }
.se-hint > svg { flex: none; margin-top: var(--sp-0); }
.se-hint code { background: var(--bg2); padding: 0 var(--sp-1); border-radius: 3px; }
/* 五百二十四批：手写串样式随 MetaStrip/TookBadge 换装退役，只留落位 padding（字号/mono 由统一件承担）。
   五百二十五批：took 手写 sep 退役（MetaStrip 有默认插槽自动渲染 .ms-sep）、插槽段类名换组件档
   ms-i/ms-t——三胞胎 scoped 样式随迁删除（形态单一出处归组件） */
.se-meta { padding: 0 var(--sp-0); }
.se-right { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; overflow: auto; max-height: calc(100vh - var(--vh-offset, 210px) + 50px); }
/* 空态在整片右栏里居中。用 margin:auto 而不是父级 justify-content:center ——
   后者在 overflow:auto 容器里会把溢出内容的顶部裁掉、滚不回去。 */
/* flex:1 吃掉编辑器下方的剩余高度（margin:auto 只负责在其中居中）——
   只写 margin:auto 时空态仍是内容高，下方留一大片死白（实测 426px）。 */
.se-empty-fill { flex: 1; margin: auto; }
.se-loading { display: flex; flex-direction: column; }
/* 五百六十一批：.se-err 私造红壳（flex/padding/color/border/radius/bg 四件套）随 err-bar 收编退役
   （flattenWave552 radius 锚随迁：语义红框归基座单源）；.se-err-body/-pre/-acts 结构留作内容槽 */
.se-err-body { flex: 1; min-width: 0; }
.se-err-pre { margin: var(--sp-1h) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; color: var(--fg); max-height: 200px; overflow: auto; } /* 五百五十二批：删死 fallback（第十批注释所记未落实，本批补账） */
.se-err-acts { margin-top: var(--sp-2); }
.se-hit { border: 1px solid var(--border); border-radius: var(--r-m); overflow: hidden; }
.se-hit.open { border-color: var(--dv-violet); }
.se-hit-hd { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-2h); cursor: pointer; font-size: var(--fs-sm); }
.se-hit-hd:hover { background: var(--hl-soft); }
.se-rank { flex: none; font-weight: 600; opacity: .5; min-width: 30px; } /* 第十批：控件强调 600 */
.se-id { flex: none; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); } /* 第十批：删死 fallback */
.se-score-bar-wrap { flex: 1; height: 6px; border-radius: 3px; background: var(--bg2); overflow: hidden; min-width: 60px; }
.se-score-bar { display: block; height: 100%; background: linear-gradient(90deg, var(--dv-violet), color-mix(in srgb, var(--dv-violet) 70%, #fff)); border-radius: 3px; }
.se-score { flex: none; font-family: var(--mono); font-weight: 600; min-width: 70px; text-align: right; } /* 第十批：字重 600 + 删死 fallback */
.se-mq { flex: none; display: inline-flex; align-items: center; gap: 3px; font-size: var(--fs-xs); color: var(--dv-cyan); }
.se-link { opacity: .55; }
.se-link:hover { opacity: 1; color: var(--dv-violet); }
.se-caret { flex: none; transition: transform var(--tr); opacity: .5; }
.se-caret.open { transform: rotate(180deg); }
.se-hit-body { border-top: 1px solid var(--border); padding: var(--sp-2); }
.se-mq-row { font-size: var(--fs-xs); margin-bottom: var(--sp-1h); opacity: .85; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
/* 五百六十一批：.se-mq-chip 私造皮（dv-cyan-soft 底 chip）随命中子句段 MetaStrip mini 档收编退役；
   .se-mq-row 引导行布局保留 */
/* 五百六十一批：.se-empty-sub 裸占位随 EmptyState compact 收编退役（留白/图标归组件） */
.se-src { margin-top: var(--sp-2); font-size: var(--fs-xs); }
.se-src summary { cursor: pointer; opacity: .6; }
/* 七百二十一批：_source 内容区旧 pre 形态修饰删除——JsonTree 收编后渲染 .jtree 树非 pre
   （五百二十四批 42vh 弹性档史志注释随规则一并退役；713/714/715/717/719 同族） */
@media (max-width: 1100px) { .se-body { grid-template-columns: minmax(0, 1fr); } }

/* 五百二十九批：900 紧凑微调档（§9.3 口径；§6q 遗留补齐，W-D）——双栏堆叠已由 1100 档
   收编，此处错误条/命中行头允许换行（窄视口 id+得分条+分值不再硬挤一行；页头右钮组
   换行变体随死规则七百二十一批退役） */
@media (max-width: 900px) {
  .se-hit-hd { flex-wrap: wrap; }
}
</style>
