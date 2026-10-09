<template>
  <div class="sq-page">
    <!-- 五百一十九批：整页无页头收编 PageHeader 统一件（同族 SqlBridge/PainlessLab 口径），动作按钮组入 #actions 槽 -->
    <PageHeader :icon="Database" title="SQL 控制台" subtitle="_sql 查询 · translate 转 DSL · cursor 深分页">
      <template #actions>
        <!-- 五百三十三批：页头挂只读当前索引 chip（AnalysisSettingsView 范式；补全字段源/示例
             FROM 静默消费 store.pickedIdx 却无可视锚，此处补齐；空索引时组件自身不渲染） -->
        <CurrentIdxChip />
        <button class="btn ghost sm" @click="loadSample">
          <BookOpen :size="12" /> 示例
        </button>
        <button class="btn ghost sm" @click="doSchema" :disabled="!indexOf() || busy" title="探测当前索引字段，提前提醒哪些会引发 SQL 报错">
          <ShieldAlert :size="12" /> 字段体检
        </button>
        <button class="btn ghost sm" @click="doTranslate" :disabled="!sql.trim() || busy">
          <Braces :size="12" /> 转 DSL
        </button>
        <button class="btn ghost sm" @click="doFav" :disabled="!sql.trim()">
          <Star :size="12" /> 收藏
        </button>
        <!-- 五百二十八批：页内历史入口（四视图统一，DslQueryView 弹窗范式）——doRun 一直在
             push mode=sql 历史（R100），此前页内零出口 -->
        <button class="btn ghost sm" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="12" /> 历史</button>
        <!-- 五百二十五批 W10：title 随态——空 SQL 保持禁用原因可发现性（479 批契约），
             有 SQL 时提示快捷键（execHint 单一出处，⌘/Ctrl 不再写死） -->
        <button class="btn primary sm" :title="sql.trim() ? '执行（' + execHint + '）' : '请输入 SQL 语句'" @click="doRun" :disabled="!sql.trim() || busy">
          <Play :size="12" /> {{ busy ? '执行中（' + (qr.elapsedMs.value / 1000).toFixed(1) + 's）…' : '执行' }} <span class="kbd inline">{{ execHint }}</span>
        </button>
        <button v-if="busy" class="btn sm" @click="qr.cancel()"><XCircle :size="12" /> 取消</button>
      </template>
    </PageHeader>

    <div class="sq-grid" :class="{ 'rail-off': !railOpen }" :style="{ '--sq-rail-w': railW + 'px' }">
      <!-- 五百四十三批：sq-editor 编辑器壳退役（立法③内容直贴，Kibana 同语言）——分界由
           sq-card-hd 既有 border-bottom 承接；Monaco 防撑破 overflow 承接保留（CSS 侧） -->
      <div class="sq-editor">
        <div class="sq-card-hd">
          <span>SQL</span>
          <div class="sq-card-hd-r">
            <!-- 554 批：展开/收起双钮合一——原「工具行模板展开钮（v-if=!railOpen）+ 侧栏头收起钮」
                 分置两处的平铺双钮反模式，收编为工具行常驻单 toggle（data-sq-rail-toggle）：
                 同钮随态换文案 模板/收起 + chevron 随态旋转（XmigrateView 页头单钮先例同语言）；
                 railOpen usePref 状态机零改动（sqlConsoleAdjustW2 锚随迁） -->
            <button class="btn ghost xs" data-sq-rail-toggle :title="railOpen ? '收起模板侧栏' : '展开模板侧栏'" @click="railOpen = !railOpen">
              <ChevronRight :size="11" :style="{ transform: railOpen ? '' : 'rotate(180deg)', transition: 'transform var(--tr)' }" />
              {{ railOpen ? '收起' : '模板' }}
            </button>
            <label class="sq-fs">
              fetch_size
              <input type="number" v-model.number="fetchSize" min="1" max="10000" class="sq-fs-i" />
            </label>
            <label class="sq-fs sq-tog" title="开启后、SQL 对数组字段 SELECT 不报错（取首值），自动注入 field_multi_value_leniency=true">
              <input type="checkbox" v-model="lenient" />
              <span>宽容模式</span>
            </label>
          </div>
        </div>
        <!-- 五百三十四批 P0-3：SQL 静态 lint 划线通道挂点（banner 保留双通道，见 script queueSqlLintMarkers） -->
        <MonacoEditor ref="sqlMonaco" v-model="sql" language="sql" height="100%" @execute="doRun" />
        <!-- 五百三十四批 P0-3：SQL 静态体检提示条（utils/sqlLint 纯函数，随输入防抖重估；
             零阻塞不拦执行——lint 只提示，执行门仍是既有 doRun；自动高度不进编辑器高度链）。
             五百六十二批：.sq-sql-lint 私造形态换装 theme.css .lint-bar 单源（561 立法，
             sq-sql-lint 锚并存，role 与文案逐字不动） -->
        <div v-if="sqlLintFindings.length" class="lint-bar sq-sql-lint lint-bar-warn" role="status">
          <span v-for="(f, i) in sqlLintFindings" :key="i">· 第 {{ f.line }} 行：{{ f.message }} — {{ f.suggestion }}</span>
        </div>
      </div>

      <!-- 五百四十三批：模板侧栏壳降层（li:hover/键盘交互在行不在壳，wt/fv 540 判例不适用；
           分界同由 hd border-bottom 承接，与左侧编辑器行同语言对称）。
           554 批：头部「收起」钮随双钮合一退役（收起入口归工具行常驻单 toggle），宽度档钮留守 -->
      <div v-if="railOpen" class="sq-samples">
        <div class="sq-card-hd">
          <span>常用模板</span>
          <div class="sq-card-hd-r">
            <button class="btn ghost xs" data-sq-rail-w :title="'模板栏宽度档：' + railW + 'px'" @click="cycleRailW">宽</button>
          </div>
        </div>
        <ul class="sq-tpl">
          <li v-for="t in TEMPLATES" :key="t.k" @click="sql = t.sql" role="button" tabindex="0" @keydown.enter.prevent="sql = t.sql" @keydown.space.prevent="sql = t.sql">
            <span class="sq-tpl-k">{{ t.k }}</span>
            <span class="sq-tpl-d">{{ t.desc }}</span>
          </li>
        </ul>
      </div>

      <!-- 五百四十三批：DSL 预览大容器框退役（立法④，pt-sec 538 同语言）→ sq-sec border-top 分节 -->
      <div v-if="dslPreview" class="sq-sec wide">
        <div class="sq-card-hd">
          <span>DSL 预览（_sql/translate）</span>
          <div class="sq-card-hd-r">
            <button class="btn ghost xs" data-sq-code-h :title="'DSL 预览高度档：' + codeH + 'px'" @click="cycleCodeH">高</button>
            <button class="btn ghost xs" @click="gotoDsl" :disabled="!dslPreview" title="先执行 SQL 转换生成 DSL"><ChevronRight :size="11" /> 到 DSL 页</button>
            <button class="btn ghost xs" @click="copyDsl"><Copy :size="11" /> 复制</button>
            <button class="btn ghost xs" @click="dslPreview = null">关闭</button>
          </div>
        </div>
        <!-- 五百一十九批：裸插值 → highlightJson 范式（SynonymsManager/ClusterSettings 同款，输出已转义）；
             W2 批：封顶高度走 usePref（默认 300=原值），「高」档位钮切换记忆 -->
        <pre class="sq-code json-view" v-html="dslHtml" :style="{ maxHeight: codeH + 'px' }"></pre>
      </div>

      <!-- 五百四十三批：err/warn 语义卡豁免（语义边框保留立法）——sq-card 壳迁 sq-panel 语义面板，视觉零变化 -->
      <div v-if="unavailable" class="sq-panel wide sq-alert">
        <AlertCircle :size="14" />
        <div class="sq-alert-body">
          <div><b>_sql 接口不可用</b></div>
          <div class="sq-sub">当前集群未启用 SQL（OSS / 未授权）。请使用 DSL 查询面板。</div>
          <div class="sq-sub" v-if="reason">原因：{{ reason }}</div>
          <!-- R55：不留死胡同——自动探测其他连接档案，可用则一键切换重跑 -->
          <div class="sq-alert-acts">
            <button class="btn sm" :disabled="probing" @click="probeSqlTargets">
              {{ probing ? '探测中…' : '探测支持 SQL 的集群' }}
            </button>
            <template v-if="probed">
              <button v-for="c in sqlCapable" :key="c.id" class="btn sm pri" @click="switchAndRerun(c)">
                切到「{{ c.name }}」重跑
              </button>
              <span v-if="!sqlCapable.length" class="sq-sub">全部 {{ probedN }} 个连接均无 SQL 能力</span>
            </template>
          </div>
        </div>
      </div>

      <div v-if="schemaWarnings.length" class="sq-panel wide sq-warn">
        <ShieldAlert :size="14" />
        <div class="sq-warn-body">
          <div class="sq-warn-tt"><b>字段体检提醒</b><span class="sq-warn-cnt">{{ schemaWarnings.length }} 项风险</span></div>
          <ul class="sq-warn-list">
            <li v-for="(w, i) in schemaWarnings" :key="i">{{ w }}</li>
          </ul>
          <div class="sq-warn-hint">当遇到 <code>Arrays are not supported</code> / <code>Nested fields not supported</code>，请切到 <b>Lucene 面板</b> 或 <b>PIT 深度分页</b>（彻底无限制）。</div>
        </div>
      </div>

      <!-- 执行失败内联面板：错误全文可回看 + 一键重试（样式复用 sq-alert 自救面板体系） -->
      <div v-if="runErr" class="sq-panel wide sq-alert">
        <AlertCircle :size="14" />
        <div class="sq-alert-body">
          <!-- 五百二十五批：标题行走 friendlyEsError 人话 + pre 换 errPreHtml v-html 全文双轨
               （含 { 走 highlightJson 着色、否则转义平文；LuceneQuery/SearchSandbox 双轨先例）。
               五百三十五批：换装双参——errMeta(runErrObj) 旁路对象读 code/endpoint（runErr 已压串
               读不出），meta 空时输出与单参逐字节一致（errPre524 锚），字符串全文回看语义不变 -->
          <div><b>SQL 执行失败</b> · {{ friendlyRunErr }}</div>
          <pre class="sq-err-body" v-html="errPreHtml(runErr, errMeta(runErrObj))"></pre>
          <div class="sq-alert-acts">
            <button class="btn sm" @click="doRun" :disabled="!sql.trim() || busy">重试</button>
          </div>
        </div>
      </div>

        <!-- 五百四十三批：结果大容器框退役（立法④，pt-sec 538 同语言）→ sq-sec border-top 分节 -->
        <div v-if="cols.length" class="sq-sec wide">
        <div class="sq-card-hd">
          <!-- 五百一十九批：结果计数行走 MetaStrip 统一件（347 批 fmtNum 千分位口径保留）；cursor 段 warn tone -->
          <MetaStrip :items="resultMeta" />
          <div class="sq-card-hd-r">
            <!-- 五百四十五批：原始 IO 快查——最近一次 SQL 请求/响应原文弹窗（ioRecorder 记录环） -->
            <button class="btn ghost xs" data-test="raw-io" aria-label="查看原始 IO（SQL 执行）" title="最近一次 SQL 请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
              <Terminal :size="11" /> 原始 IO
            </button>
            <button class="btn ghost xs" data-sq-result-h :title="'结果表高度档：' + resultH + 'px'" @click="cycleResultH">高</button>
            <button class="btn ghost xs" @click="nextPage" :disabled="!cursor || busy">
              <ChevronRight :size="11" /> 下一页
            </button>
            <button class="btn ghost xs" @click="closeCursor" :disabled="!cursor || busy">
              <XCircle :size="11" /> 关闭 cursor
            </button>
            <button class="btn ghost xs" @click="exportCsv">
              <FileDown :size="11" /> CSV
            </button>
            <!-- 三百零四批：NDJSON 导出（与 Lucene/PIT 通道对齐；列名作键还原行对象语义） -->
            <button class="btn ghost xs" @click="exportNdjson">
              <FileDown :size="11" /> NDJSON
            </button>
          </div>
        </div>
        <!-- R41 §1：命中 0 行也要有交代，不留空表格；R54 列头排序/截断下沉到通用只读表。
             五百三十五批：§6w 遗留「semOn+semRawCols 接线」SqlConsole 半边——SQL 返回列的
             聚合/桶表达式列（COUNT(*)/HISTOGRAM(…)）与无 type 列入抑制集，防 COUNT≥1000
             被 semFormat「按值推断」误判成时长/百分比（显式 type 普通列语义显示不受影响） -->
        <QueryResultTable
          :key="runSeq"
          ref="resultTbl"
          :loading="busy"
          :cols="colNames"
          :rows="rows"
          sortable
          sem-on
          :sem-raw-cols="sqlSemRawCols"
          :max-height="resultH + 'px'"
          empty-text="查询成功但命中 0 行，检查 WHERE 条件或索引名"
        />
        </div>

      <!-- R41 §1：初始/执行中空态（五百一十九批：裸文字收编 EmptyState compact；
           快捷键文案走 execHint 单一出处——不再硬编码 ⌘/Ctrl+Enter 与按钮角标漂移） -->
      <!-- 五百四十三批：busy/初始空态大容器框退役（立法④空态不留整块空框）——EmptyState 直贴，
           sq-blank 仅留 wide 网格占位（无壳无线） -->
      <div v-else-if="busy" class="sq-blank">
        <EmptyState compact :icon="Loader2" text="正在执行 SQL…" />
      </div>
      <div v-else-if="!unavailable && !runErr" class="sq-blank">
        <EmptyState compact :icon="Database" :text="'编写 SQL 后按 ' + execHint + ' 执行'"
          hint="不确定语法可先点右侧模板或「示例」，结果表格将显示在这里"
          action-text="插入示例" @action="loadSample" />
      </div>
    </div>

    <!-- 五百二十八批：页内查询历史（mode=sql 单档过滤，DslQueryView 弹窗范式）。
         play=回填草稿并执行、fill=仅回填；导入/清空入口关闭（同沙盒口径） -->
    <n-modal v-model:show="histOpen" preset="card" title="查询历史（SQL 控制台）" style="width:640px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel
        :items="histRows" :actions="['play', 'fill', 'copy', 'del']" :clearable="false" :importable="false"
        empty-text="执行成功后自动记录（上限 100 条），可一键回填重跑"
        @play="h => replayHistRow(h, true)" @fill="h => replayHistRow(h, false)" @del="h => qh.removeOne(h.id)"
      />
    </n-modal>

    <!-- 五百四十五批：原始 IO 弹窗（宿主受控开关；546 批起 rec=最近一条 /cluster/sql/ 非 translate 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { BookOpen, Braces, Star, Play, Copy, AlertCircle, ChevronRight, XCircle, FileDown, ShieldAlert, Database, Loader2, History, Terminal } from 'lucide-vue-next';
import { NModal } from 'naive-ui';
/* 五百二十八批：页内历史面板收编 QueryHistoryPanel 共享件（DslQueryView 弹窗范式） */
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import { api, ioRecorder, type RawIoRec } from '../api';
import { useAppStore } from '../stores/app';
import { encodeDslParam } from '../utils/queryHub';
import { useQueryHistoryStore } from '../stores/queryHistory';
import { useQueryRun } from '../composables/useQueryRun';
import { usePref } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* 五百五十八批：sql.railW/resultH/codeH 三件套收编 */
import { useScopedDraft } from '../composables/useScopedDraft';
import { exportStamp, copyText, fmtTime, fmtNum, downloadText, csvCell, fmtCell } from '../utils/format';
import MonacoEditor from '../components/MonacoEditor.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
/* 五百四十五批：原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
/* 五百一十九批：页头/空态/元信息/JSON 高亮四处统一件收编 */
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* 五百三十三批：页头只读当前索引锚 */
import { highlightJson } from '../utils/jsonc';
/* 五百二十五批：错误面板 errPreHtml v-html 内核 + friendlyEsError 人话标题行；
   五百三十五批：补 errMeta 帮手（双参换装，原始错误对象旁路见 runErrObj） */
import { errPreHtml, errMeta } from '../utils/errPre';
import { friendlyEsError } from '../utils/esError';
/* W2 批：SQL 补全单例接入——与 SqlBridge 共享同一份语言级 provider（引用计数，挂载 ensure/卸载 dispose） */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { useIndexFields } from '../composables/useIndexFields';
import { ensureSqlCompletion, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { lintSql } from '../utils/sqlLint'; /* 五百三十四批 P0-3：SQL 静态 lint */
import { useDebounceFn } from '../composables/useDebounceFn'; /* 五百三十四批 P0-3：划线防抖统一件 */

const store = useAppStore();
const router = useRouter();
/* w80：执行快捷键角标跟平台——Mac 显示 ⌘⏎，Windows/Linux 显示 Ctrl+⏎（此前硬编码 Mac 符号） */
const isMac = navigator.platform.toUpperCase().includes('MAC');
const execHint = isMac ? '⌘⏎' : 'Ctrl+⏎';
/* R53：手写 SQL 进 sessionStorage 草稿——刷新/误导航不丢稿（可重入） */
/* 草稿治理轮：SQL 草稿迁 useScopedDraft（按集群目标隔离） */
const sql = useScopedDraft('sql', {
  route: 'sql-console',}).text;

/* 五百三十四批 P0-3：SQL 静态 lint 双通道——
   ① 编辑器划线：setLineMarkers 行号直射（SynonymsManagerView 范式，owner='es-sql-lint'
   多 lint 源互不清），useDebounceFn 250ms 防 findMatches 级重扫（行号直射本廉价，防抖
   与全站 lint 通道对齐）；空 lint 输出 [] 即清旧划线。
   ② 页内 banner：sqlLintFindings 逐条「第 N 行」提示条（自动高度，不进编辑器高度链）。
   lint 纯函数规则宁少勿误报（合法语句零误报由 sqlLint534 契约钉），零阻塞不拦执行。 */
const sqlMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const sqlLintFindings = computed(() => lintSql(sql.value || ''));
const queueSqlLintMarkers = useDebounceFn(() => {
  sqlMonaco.value?.setLineMarkers?.(
    sqlLintFindings.value.map(f => ({ line: f.line, message: f.message + '（' + f.suggestion + '）' })),
    'es-sql-lint',
  );
}, 250);
watch(sql, () => { queueSqlLintMarkers(); }, { immediate: true });
/* R42 §8.3：执行参数作为偏好跨会话记忆 */
const fetchSize = usePref('sql.fetchSize', 200);
const lenient = usePref('sql.lenient', true);
/* W2 批：布局可调三件全走 usePref 跨会话记忆——
   ① 模板侧栏：可折叠（sql.railOpen）+ 宽度三档（sql.railW，默认 300=原 minmax 上限）；
   ② 结果表高度档（sql.resultH，默认 500=原写死值）；
   ③ DSL 预览高度档（sql.codeH，默认 300=原 .sq-code 写死值） */
const railOpen = usePref('sql.railOpen', true);
/* 五百五十八批：三件套（TIERS+usePref+手写 cycle）收编 useTierCycle 单源（键不变=零迁移）。
   三处默认档均非首位（300/500/300 在各自档值数组第二位），defVal 必须显式传，
   缺省会漂到 tiers[0] 破坏「默认 300/500/300=原写死值」口径；cycle 语义等值 */
const RAIL_W_TIERS = [240, 300, 360];
const { v: railW, cycle: cycleRailW } = useTierCycle('sql.railW', RAIL_W_TIERS, 300);
const RESULT_H_TIERS = [300, 500, 800];
const { v: resultH, cycle: cycleResultH } = useTierCycle('sql.resultH', RESULT_H_TIERS, 500);
const CODE_H_TIERS = [200, 300, 500];
const { v: codeH, cycle: cycleCodeH } = useTierCycle('sql.codeH', CODE_H_TIERS, 300);
const schemaWarnings = ref<string[]>([]);
const cols = ref<Array<{ name: string; type: string }>>([]);
const rows = ref<any[][]>([]);
/* 通用表只读 cols 是 string[]；type 子标签属 SQL 特定细节，不塞进通用表 */
const colNames = computed(() => cols.value.map(c => c.name));
/* 五百三十五批：§6w 遗留「semOn+semRawCols 接线」SqlConsole 半边——抑制集=无 type 列
   ∪ 列名含 ( 或 * 的聚合/桶表达式列（COUNT(*)/HISTOGRAM(…)），防 COUNT≥1000 被
   semFormat「按值推断」误判成时长、0..1 被判百分比；显式 type 标注的普通列语义显示不受
   影响（semRawCols 守卫只压推断不压标注）。cols→colNames 丢弃 type 的现状不动
   （field-types 进阶记档不做）；本表不传 storage-key（tableDimGuard 锁）。 */
const sqlSemRawCols = computed<string[]>(() =>
  cols.value.filter(c => !c.type || c.name.includes('(') || c.name.includes('*')).map(c => c.name),
);
const resultTbl = ref<InstanceType<typeof QueryResultTable>>();
/* R54：每次执行重挂表，把排序态回到 SQL 原始行序，避免陈旧排序误导 */
const runSeq = ref(0);
const cursor = ref<string | null>(null);
const dslPreview = ref<string | null>(null);
const unavailable = ref(false);
const reason = ref('');
/* 执行失败持久错误面板：ES 长错误全文留痕可回看，toast 6 秒即逝不作唯一载体 */
const runErr = ref('');
/* 五百三十五批：errPre 双参换装旁路——下方 doRun catch 把 ApiError 压串进 runErr
   （既有行为不动，全文回看语义逐字保留），原始错误对象旁路留存供 errMeta 读 code/
   endpoint（错误码徽标+「失败于」端点行，533/534 批 errPre 内核能力）；重跑即清 */
const runErrObj = ref<unknown>(null);
/* 五百二十五批：错误面板标题行的人话摘要（pre 仍保全文，SearchSandboxView 同款双轨） */
const friendlyRunErr = computed(() => friendlyEsError(runErr.value));

/* 五百一十九批：DSL 预览裸插值 → highlightJson（dslPreview 已是 pretty 串，着色 + json-view 全局范式） */
const dslHtml = computed(() => highlightJson(dslPreview.value ?? ''));
/* 五百一十九批：结果行走 MetaStrip 统一件——行/列计数保留 347 批 fmtNum 千分位口径；
   cursor 段 warn tone（结果集未取完，SQL 通道无 total 假分母口径不变） */
const resultMeta = computed<MetaStripItem[]>(() => [
  { value: fmtNum(rows.value.length), label: '行' },
  { value: fmtNum(cols.value.length), label: '列' },
  ...(cursor.value ? [{ value: '有更多', label: 'cursor', tone: 'warn' as const, tip: '结果集未取完，点「下一页」继续取' }] : []),
]);

/* R55：SQL 失能自救——并发探测宿主+全部连接档案，可用则一键切换重跑，不留死胡同 */
const probing = ref(false);
const probed = ref(false);
const probedN = ref(0);
const sqlCapable = ref<Array<{ id: string; name: string }>>([]);
/* R56：探测结论 5 分钟缓存（集群 SQL 能力短期不变）——反复触发降级时秒回，不重复打全部集群 */
const PROBE_CACHE_KEY = 'es-console.sql.probe-cache';
const PROBE_TTL = 5 * 60 * 1000;
async function probeSqlTargets() {
  const cached = (() => {
    try {
      const c = JSON.parse(sessionStorage.getItem(PROBE_CACHE_KEY) || 'null');
      return c && c.exclude === store.target && Date.now() - c.ts < PROBE_TTL ? c : null;
    } catch { return null; }
  })();
  if (cached) {
    sqlCapable.value = cached.hits; probedN.value = cached.n; probed.value = true;
    return;
  }
  probing.value = true; probed.value = false; sqlCapable.value = [];
  try {
    if (!store.conns.length) await store.loadConns();
    const cands: Array<{ id: string; name: string }> = [
      ...(store.hostVisible ? [{ id: '', name: '宿主集群' }] : []),
      ...store.conns.map(c => ({ id: c.id, name: c.name })),
    ].filter(c => c.id !== store.target); // 当前目标已证不可用，跳过
    probedN.value = cands.length;
    const hits = await Promise.all(cands.map(async c => {
      try { const r = await api.sqlProbe(c.id); return r?.available !== false ? c : null; }
      catch { return null; }
    }));
    sqlCapable.value = hits.filter((x): x is { id: string; name: string } => !!x);
    try {
      sessionStorage.setItem(PROBE_CACHE_KEY, JSON.stringify({ ts: Date.now(), exclude: store.target, hits: sqlCapable.value, n: probedN.value }));
    } catch { /* 存储满容忍 */ }
  } finally { probing.value = false; probed.value = true; }
}
function switchAndRerun(c: { id: string; name: string }) {
  /* R40 切 target 会按 key 整页重挂载，直接 doRun 的结果会写进已卸载的旧实例——
     改走 prefill 键，新实例 onMounted 消费后自动执行（与命令面板快速 SQL 同一链路） */
  sessionStorage.setItem('es-console.sql.prefill', sql.value);
  store.setTarget(c.id, c.name);
  store.notify('success', `已切换到「${c.name}」，正在重跑 SQL`);
}
const busy = ref(false);
const qr = useQueryRun(); // 长查询读秒 + 取消（R80 范式）

/* 五百四十五批：原始 IO 快查——取记录环最近一条本页执行链记录开弹窗；判空口径见 openRawIo（548 统一 notify）。
   五百四十六批特征收紧：doRun 每次成功后 fire-and-forget 追发的 /cluster/sql/translate（见 doRun
   尾部）也落账且恒新于执行记录，旧特征 last('/cluster/sql/') 常态误中 translate——用户点「原始 IO」
   看到的是 translate 而非执行结果。
   五百五十批：546 find 补丁退役 → last('/cluster/sql/', 'sql') 双参收口——api 层对执行链
   （query/lenient/cursor/close）经 ioKind 通道打标 kind='sql'，translate 未打标天然排除，
   546 收紧语义等价（历史记档保留备查）。 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  /* 550 双参收口（546 find 补丁退役）：kind='sql' 只落在执行链，translate 天然排除 */
  const rec = ioRecorder.last('/cluster/sql/', 'sql');
  /* 五百四十八批 W3 判空口径统一（546 裁决=notify 不开空弹窗，rawIoPave546 六视图同款形态随迁）：
     无记录 notify 引导并返回，不再以空 rec 开弹窗（EmptyState 仍归 RawIoModal 自身兜底） */
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

const TEMPLATES = [
  { k: 'top100', desc: '最新 100 条', sql: 'SELECT * FROM "my-index" ORDER BY ts DESC LIMIT 100' },
  { k: 'agg-count', desc: '按状态聚合', sql: 'SELECT status, COUNT(*) as cnt FROM "my-index" GROUP BY status' },
  { k: 'histogram', desc: '按天分桶', sql: 'SELECT HISTOGRAM(ts, INTERVAL 1 DAY) as day, COUNT(*) FROM "my-index" GROUP BY day' },
  { k: 'filter', desc: '范围过滤', sql: 'SELECT id, score FROM "my-index" WHERE score BETWEEN 60 AND 90' },
  { k: 'like', desc: '模糊匹配', sql: 'SELECT * FROM "my-index" WHERE title LIKE \'%error%\' LIMIT 50' },
  { k: 'null', desc: 'NULL 检查', sql: 'SELECT * FROM "my-index" WHERE tags IS NULL LIMIT 100' },
];

function loadSample() {
  sql.value = TEMPLATES[0].sql.replace('"my-index"', store.pickedIdx ? `"${store.pickedIdx}"` : '"my-index"');
}

function buildBody(): string {
  const b: any = { query: sql.value };
  if (fetchSize.value > 0) b.fetch_size = fetchSize.value;
  return JSON.stringify(b);
}

async function doRun() {
  if (!sql.value.trim()) return;
  busy.value = true; unavailable.value = false; reason.value = ''; runErr.value = ''; runErrObj.value = null;
  const signal = qr.begin();
  try {
    const r = lenient.value ? await api.sqlLenient(buildBody(), signal) : await api.sqlJson(buildBody(), signal);
    if (r?.available === false) { unavailable.value = true; reason.value = r.reason || ''; return; }
    cols.value = r.columns || [];
    rows.value = r.rows || [];
    cursor.value = r.cursor || null;
    runSeq.value++; // R54：新结果回到 SQL 原始行序（重挂表重置排序），避免陈旧排序误导
    /* R100：执行成功记跨模式历史（目标索引从 FROM 子句或侧栏选中推导） */
    useQueryHistoryStore().push('sql', sql.value, indexOf());
    /* 五百二十五批 W10：run 成功后台顺带 translate——试跑→落 DSL 由 2 击减 1 击
       （此前必须「转 DSL」→「到 DSL 页」两步才能深跳）。fire-and-forget：不置 busy、
       不阻塞结果展示；实参 buildBody() 在此求值即 SQL 快照，稍后改稿不串味。
       失败静默——预览不出，「到 DSL 页」原 disabled 语义自兜底。 */
    void api.sqlTranslate(buildBody()).then(r => {
      if (!r || r.available === false) return;
      dslPreview.value = JSON.stringify(r, null, 2);
    }).catch(() => { /* translate 失败不干扰查询结果 */ });
  } catch (e: any) {
    runErr.value = String(e?.message || e);
    runErrObj.value = e; /* 五百三十五批：原始错误对象旁路留存（压串前的 ApiError 供 errMeta） */
    /* 561 批：toast 裸串并轨 friendlyEsError（vrErr 面板 528 批口径，obsWave560 FFE 同范式） */
    store.notify('error', 'SQL 执行失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; qr.finish(); }
}

/* R42 §8.1：命令面板「快速 SQL」预填接收，进页自动执行 */
onMounted(() => {
  /* W2 批：SQL 补全单例——字段源吃当前工作索引（与顶栏选中同源），FROM 表名位由单例模块内部解析 */
  sqlCompletion = ensureSqlCompletion(monaco, sqlCtx);
  const prefill = sessionStorage.getItem('es-console.sql.prefill');
  if (prefill) {
    sessionStorage.removeItem('es-console.sql.prefill');
    sql.value = prefill;
    doRun();
  }
});

/* 五百二十八批：页内历史回放/回填——play=回填草稿并执行、fill=仅回填。
   草稿通道=useScopedDraft sql，与手工编辑同一条写入路径 */
const qh = useQueryHistoryStore();
const histOpen = ref(false);
const histRows = computed(() => qh.items.filter(i => i.mode === 'sql'));
function replayHistRow(row: { query: string }, runIt: boolean) {
  sql.value = row.query;
  histOpen.value = false;
  if (runIt) doRun();
}
onBeforeUnmount(() => { sqlCompletion?.dispose(); sqlCompletion = null; });

/* W2 批：SQL 补全单例上下文（闭包现读，注册不随数据变化重挂） */
const sqlFieldsCtx = useIndexFields(() => store.pickedIdx || '');
function sqlCtx(): SqlCompletionCtx {
  return {
    indices: () => store.indices,
    pickedIdx: () => store.pickedIdx || '',
    curFields: () => sqlFieldsCtx.fields.value,
    /* 561 批：去 void 包装直返 Promise（契约本就 void|Promise<void>，④值位冷缓存首轮
         await 到位再分派——551 批 ③A3 契约半边补齐） */
    ensureCurFields: () => sqlFieldsCtx.ensure(),
  };
}
let sqlCompletion: { dispose(): void } | null = null;

/* R30：字段体检 */
function indexOf(): string {
  const m = /"([^"]+)"/.exec(sql.value);
  return (m && m[1]) || store.pickedIdx || '';
}
async function doSchema() {
  const idx = indexOf();
  if (!idx) { store.notify('warning', '未探测到目标索引（SQL FROM 或側栏选中）'); return; }
  busy.value = true;
  try {
    const r: any = await api.resolveSchema(idx);
    schemaWarnings.value = r?.warnings || [];
    if (!schemaWarnings.value.length) store.notify('success', `体检完成：${idx} 无 SQL 限制风险`);
    else store.notify('warning', `${idx} 命中 ${schemaWarnings.value.length} 项 SQL 失能字段，详情见下方面板`);
  } catch (e: any) { store.notify('error', '字段体检失败：' + friendlyEsError(String(e?.message ?? e))); } /* 561 批：裸串并轨 */
  finally { busy.value = false; }
}

async function nextPage() {
  if (!cursor.value) return;
  busy.value = true;
  try {
    const r = await api.sqlCursor(cursor.value);
    rows.value = rows.value.concat(r.rows || []);
    cursor.value = r.cursor || null;
    store.notify('success', `已加载 ${r.rows?.length || 0} 行`);
  } catch (e: any) {
    store.notify('error', '分页失败：' + friendlyEsError(String(e?.message ?? e))); /* 561 批：裸串并轨 */
  } finally { busy.value = false; }
}

async function closeCursor() {
  if (!cursor.value) return;
  try { await api.sqlClose(cursor.value); cursor.value = null; store.notify('success', 'cursor 已关闭'); }
  catch (e: any) { store.notify('error', '关闭失败：' + friendlyEsError(String(e?.message ?? e))); } /* 561 批：裸串并轨 */
}

async function doTranslate() {
  busy.value = true;
  try {
    const r = await api.sqlTranslate(buildBody());
    if (r?.available === false) { unavailable.value = true; reason.value = r.reason || ''; return; }
    dslPreview.value = JSON.stringify(r, null, 2);
  } catch (e: any) {
    store.notify('error', 'translate 失败：' + friendlyEsError(String(e?.message ?? e))); /* 561 批：裸串并轨 */
  } finally { busy.value = false; }
}

function copyDsl() {
  if (!dslPreview.value) return;
  /* 三百三十八批：诚实口径扫尾（282 复查漏网） */
  copyText(dslPreview.value).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制 DSL' : '复制失败'));
}

/* 转出的 DSL 继续去查询工作台调试（复用 SqlBridge 的 es-console.dsl.body 契约） */
function gotoDsl() {
  if (!dslPreview.value) return;
  /* w77 修复:原走 es-console.dsl.body 死信箱(DslQueryView 不读且会被旧稿覆写),改走 ?dsl= 深链 */
  router.push({ path: '/search', query: { mode: 'dsl', dsl: encodeDslParam(dslPreview.value) } });
}

function doFav() {
  store.addFavorite({
    kind: 'rest', title: `SQL @${fmtTime(Date.now())}`,
    subtitle: sql.value.slice(0, 100), payload: { sql: sql.value, fetchSize: fetchSize.value },
    tags: ['sql', 'r28'],
  });
  store.notify('success', '已收藏 SQL');
}

function exportCsv() {
  const head = cols.value.map(c => `"${c.name}"`).join(',');
  /* R54：CSV 跟随表格当前排序行序——所见即所得（排序态在通用表内部，经 expose 取回） */
  const sorted = resultTbl.value?.getSortedRows() ?? rows.value;
  const body = sorted.map(r => r.map(v => csvCell(fmtCell(v))).join(',')).join('\n');
  downloadText(`sql-${exportStamp()}.csv`, head + '\n' + body, 'text/csv;charset=utf-8', { bom: true });
  store.notify('success', 'CSV 已导出');
}

/* 三百零四批：NDJSON 导出（行对象按列名还原，cursor 累积行同样全量导出） */
function exportNdjson() {
  const sorted = resultTbl.value?.getSortedRows() ?? rows.value;
  const lines = sorted.map(r => {
    const o: Record<string, unknown> = {};
    cols.value.forEach((c, i) => { o[c.name] = r[i] ?? null; });
    return JSON.stringify(o);
  });
  downloadText(`sql-${exportStamp()}.ndjson`, lines.join('\n'), 'application/x-ndjson');
  store.notify('success', `NDJSON 已导出（${lines.length} 行）`);
}
</script>

<style scoped>
/* 五百三十三批：--sp 间距 token 收口（theme.css:100-103 裁决，只收精确等值字面；
   14/20 等刻意值与 1px/5px 微调保字面） */
.sq-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
/* W2 批：模板侧栏宽度档走 --sq-rail-w（usePref sql.railW，默认 300=原 minmax 上限），
   rail-off 折叠为单栏；窄容器塌单栏由底部 @media 覆盖（规则顺序在后） */
.sq-grid { display: grid; grid-template-columns: minmax(0, 1fr) var(--sq-rail-w, 300px); gap: var(--sp-3); min-height: 0; }
.sq-grid.rail-off { grid-template-columns: minmax(0, 1fr); }
/* SQL 编辑器弹性（原 170px 写死）：首行行高 minmax(170px, 42vh) 随视口伸缩、170px 兜底；
   页面需随结果表滚动，故不能把整页锁 100% 高，只弹编辑器行 */
.sq-grid { grid-template-rows: minmax(170px, 42vh); }
.sq-editor { display: flex; flex-direction: column; min-height: 0; }
/* 五百四十三批：编辑器壳退役（立法③）后 Monaco 100% 高容器防撑破 overflow 承接保留
   （rd/sy 540 先例：overflow 是结构语义非 chrome）；sqlLint534 骨架锁行逐字不动，单列一条零触锁 */
.sq-editor { overflow: hidden; }
.sq-editor > :deep(.monaco-host) { flex: 1 1 0; min-height: 0; }
/* 五百六十批轨4：编辑器外框退役（立法③，558(b) av-left/br-pane 同语言独立追加——
   sqlLint534/flattenWave544 逐字锁原行零触）；sq-card-hd 既有 border-bottom 承接分界 */
.sq-editor > :deep(.monaco-host) { border: none; border-radius: 0; }
/* 五百六十二批：.sq-sql-lint 私造形态（含 warn-line 边线）随换装 lint-bar 单源退役；
   自动高度 flex none 语义归 .lint-bar，编辑器 flex:1 min-height:0 既有高度链确定解不动 */
/* 五百四十三批：sq-card 大容器壳（bg+border+radius）退役（§6v 立法①④，pt-sec/uq-sec 538 同语言）
   → sq-sec border-top 分节（DSL 预览/结果卡）；sq-blank 空态直贴仅留 wide 网格占位
   （EmptyState 不套空框）；sq-panel 语义面板（err/warn 豁免档）完整壳保留，视觉零变化 */
.sq-sec { border-top: 1px solid var(--border); padding-top: var(--sp-1h); }
.sq-sec.wide { grid-column: 1 / -1; }
.sq-blank { grid-column: 1 / -1; }
.sq-panel { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-m); overflow: hidden; }
.sq-panel.wide { grid-column: 1 / -1; }
/* 五百四十三批：hd 随壳退役改行首横排档（538 .uq-script-hd→立法② 同语言：border-bottom 分界 + 650） */
.sq-card-hd { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); font-weight: 650; }
.sq-card-hd-r { display: flex; gap: var(--sp-1h); align-items: center; }
.sq-fs { font-size: var(--fs-xs); color: var(--muted); }
.sq-fs-i { width: 60px; border: 1px solid var(--border); border-radius: 3px; padding: var(--sp-0) 5px; font-size: var(--fs-xs); background: var(--card-bg); color: var(--fg); }
.sq-tpl { list-style: none; padding: 0; margin: 0; }
.sq-tpl li { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); cursor: pointer; }
.sq-tpl li:last-child { border-bottom: 0; }
.sq-tpl li:hover { background: var(--code-bg); }
.sq-tpl-k { display: inline-block; font-family: var(--mono); color: var(--brand); font-weight: 400; margin-right: var(--sp-1h); }
.sq-tpl-d { color: var(--muted); }
.sq-code { padding: var(--sp-3); margin: 0; font-family: var(--mono); font-size: var(--fs-xs); background: var(--code-bg); overflow-x: auto; }
.sq-alert { display: flex; gap: var(--sp-2h); padding: 14px var(--sp-4); color: var(--danger); }
.sq-sub { font-size: var(--fs-xs); color: var(--muted); margin-top: var(--sp-1); }
.sq-alert-body { flex: 1; }
.sq-alert-acts { display: flex; gap: var(--sp-1h); align-items: center; flex-wrap: wrap; margin-top: var(--sp-2); }
.sq-err-body { margin: var(--sp-1h) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; color: var(--fg); max-height: 200px; overflow: auto; }
.sq-tog { display: inline-flex; align-items: center; gap: var(--sp-1); margin-left: var(--sp-2); }
.sq-tog input { margin: 0; }
.sq-warn { display: flex; gap: var(--sp-2h); padding: var(--sp-2) 14px; background: var(--warn-soft); border-color: var(--warn-line); color: var(--warning, var(--warn)); }
.sq-warn-body { flex: 1; }
.sq-warn-tt { font-size: var(--fs-sm); margin-bottom: var(--sp-1h); }
.sq-warn-cnt { font-size: var(--fs-xs); margin-left: var(--sp-2); padding: 1px 5px; background: var(--warn-soft); border-radius: 3px; }
.sq-warn-list { margin: var(--sp-1) 0 var(--sp-1h) 20px; padding: 0; font-size: var(--fs-xs); color: var(--fg); }
.sq-warn-hint { font-size: var(--fs-xs); color: var(--muted); }
.sq-warn-hint code { background: var(--code-bg); padding: 1px var(--sp-1); border-radius: 2px; }

/* R99：窄容器塌单栏，断点同 theme.css:584 的 R66（iframe 可用宽 ~866px） */
@media (max-width: 1100px) {
  .sq-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 五百二十九批：900 紧凑微调档（§9.3 口径；§6q 遗留补齐，W-D）——模板轨折叠/单栏已由
   1100 档与 rail-off 收编（codeH 走 usePref 内联不归 CSS），此处收页侧距，卡头与
   告警/黄条行允许换行（结果表横滚兜底在 QRT 内核，不在此重复造） */
@media (max-width: 900px) {
  .sq-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); }
  .sq-card-hd { flex-wrap: wrap; row-gap: var(--sp-1); }
  .sq-alert { flex-wrap: wrap; }
  .sq-warn { flex-wrap: wrap; }
}
</style>
