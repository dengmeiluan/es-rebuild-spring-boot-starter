<template>
  <div class="dg">
    <!-- R92-A2：页面级失败态——诊断双源任一拉取失败时记名透传，KPI 显「-」不能被误读为集群无数据
         （R93-13：原第三源 /diagnostics 已随 SPI 能力矩阵退役）。
         五百四十七批：裸插值换 errPreHtml+errMeta 双参（错误原文全文不回退，仅头部追加
         code 徽标/「失败于 端点」元信息行，errMeta 空 meta 时输出与单参一致） -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      <span class="dg-err-txt" v-html="errPreHtml(loadErr, errMeta(loadErrRaw))"></span>
      <button class="btn sm" @click="load">重试</button>
    </div>

    <!-- KPI 卡墙退役（ih-meta 范式）：集群状态/重建锁 2 项统计并入下方观测卡头 inline 元信息串 -->

    <!-- ═══ R22: 集群运维观测（节点资源 / 热线程 / 待处理任务 / 分配诊断） ═══
         五百五十四批：巨型 .card 壳退役（立法④）→ border-top 分节（xm-res 551 判例同语言）；
         card-t 行首横排保留，原卡 padding 等值迁入 .dg-ops（盒模型零变动） -->
      <div class="dg-ops">
      <div class="card-t">
        <Activity :size="13" /> 集群运维观测
        <!-- dg-sub 副行与手写 meta 串一并换装 MetaStrip 统一件：副行走 text 纯文本段、
             集群状态走 dot（冗余色标，色盲不只靠 tone 文本色）+tone 语义档（与 clusterColor
             同判据），括号副文案并入 label；重建锁段保留默认插槽——navCardA11y371 对
             dg-meta-link 的 role/tabindex/Enter+Space 源码契约原样延续，整条 :title 全文兜底不变
             （525 批：插槽前分隔由组件自动补 ms-sep，本页手写 dg-slot-sep 退役。五百三十五批：
               .meta-strip 全局类退役，落位/窄屏档随迁本页 .dg-meta，class 上冗余 .mono 摘除） -->
        <MetaStrip class="dg-meta" :items="dgMeta" :title="'集群状态 ' + (cluster?.status || '-') + '（' + (cluster?.number_of_nodes ?? '-') + ' 节点 · ' + (cluster?.active_primary_shards ?? '-') + ' 主分片） · 重建锁 ' + lockTotal + '（本持 ' + locks.self + ' · 他持 ' + locks.other + ' · 过期 ' + locks.expired + '）'">
          <span class="dg-meta-link" role="button" tabindex="0" title="点击查看锁明细（系统索引 · 分布式锁）" @click="router.push('/system')" @keydown.enter.prevent="router.push('/system')" @keydown.space.prevent="router.push('/system')"><b>{{ lockTotal }}</b> <i>重建锁</i>（本持 {{ locks.self }} · 他持 {{ locks.other }} · 过期 {{ locks.expired }}）</span>
        </MetaStrip>
        <div class="dg-ops-act">
          <!-- 一百三十四批：节点资源快照导出（容量汇报双通道：Excel 走 CSV、群聊走 Markdown）
               五百二十五批 W5：「数值」TSV 复制钮与「Σ 聚合行」开关随换 QRT 壳退役——右键
               「复制整表（当前页）为 TSV」与列头菜单「聚合行」内核接管（storageKey=diag:nodes，
               es_tbl_agg:diag:nodes 既有落盘键无缝兼容）；CSV/Markdown 容量汇报格式档保留卡头：
               QRT 内建导出为 raw 通用档，% 后缀/人性化字节/中文列头 BOM 的汇报格式非同档（待 W1） -->
          <button class="btn sm ghost" :disabled="!nodes.length" @click="exportNodes('csv')" title="导出节点资源表为 CSV（Excel 直开）"><ClipboardList :size="11" /> CSV</button>
          <button class="btn sm ghost" :disabled="!nodes.length" @click="exportNodes('md')" title="复制节点资源表为 Markdown（群聊/工单直贴）"><ClipboardCopy :size="11" /> Markdown</button>
<label class="dg-auto-lbl">
          <input type="checkbox" v-model="diagAutoRefresh" />
          <span>自动刷新</span>
        </label>
        <!-- 第十批：自动刷新频率下拉换装 AutoRefreshSelect 统一件（原 .dg-int-sel 原生 select 退役；开关 checkbox 与 usePref 逻辑不动） -->
        <AutoRefreshSelect v-if="diagAutoRefresh" v-model:ms="diagIntervalMs" :sizes="[10000, 30000, 60000]" label="自动刷新频率" />
                  <button class="btn sm ghost" @click="loadOps" :disabled="loadingOps" title="刷新所有观测数据">
            <RefreshCw :size="11" :class="{ spinning: loadingOps }" /> 刷新
          </button>
          <router-link to="/tasks" class="btn sm ghost" title="查看运行中任务"><ListTodo :size="11" /> 任务</router-link>
        </div>
      </div>

      <!-- G2-B2：观测双源失败记名透传（全文+重试常驻），不再仅 toast 后回落伪装提示。
           五百四十七批：errPreHtml+errMeta 双参换装（loadErr 条同款） -->
      <div v-if="opsErr" role="alert" class="err-bar rise-in">
        <span class="dg-err-txt" v-html="errPreHtml(opsErr, errMeta(opsErrRaw))"></span>
        <button class="btn sm" @click="loadOps" :disabled="loadingOps">重试</button>
      </div>

      <!-- 节点资源表格——五百二十五批 W5：自造表（水位条/SparkLine 趋势列/本地排序/聚合 tfoot/
           行右键菜单/数值矩阵钮）换 QRT rows 型：排序/列筛选漏斗/聚合行/右键整表 TSV/列选/
           Ctrl+F 查找/行内展开全归内核，宿主胶水（useTableSort/useColStats/copyMatrix/CellContextMenu）
           退役。storageKey=diag:nodes 与既有 es_tbl_agg:diag:nodes 落盘键无缝兼容；
   水位条/趋势线/行警告底色随纯文本壳退役——趋势降为 trendTip 文本摘要列（采样仍每轮
   记录，utils/trendHist 同源不出走），高负载语义由数值列+聚合+行内展开承接（五百二十七
   批 W-F 行级色档经 rowClass 回收，见 ndRowClass）；「按此节点采热线程」由 row-actions
   注入钮承接（原节点名点击与行右键菜单的采热直达换行尾入口，语义不变）。
   五百三十一批：开 semOn 语义渲染（'FS 可用' 列 ND_TYPES 标注 size_bytes 走 bytes 档
   1.2 GB 形态；SEM_RAW_COLS 三列显式槽位保 raw，防裸数字推断误伤，见该常量注） -->
      <!-- 五百三十二批：空时段落蒸发根治——loading 期间也挂 QRT（:loading 出内核骨架，
           首查白板/空窗消失），空态落 EmptyState 统一件；导出文件名归 export-name -->
      <QueryResultTable v-if="nodes.length || loadingOps" ref="nodesQrt" :cols="ND_COLS" :rows="nodesMatrix" sortable sem-on :sem-raw-cols="SEM_RAW_COLS"
        storage-key="diag:nodes" :field-types="ND_TYPES" max-height="480px" empty-text="无节点数据"
        :loading="loadingOps" export-name="diag-ops"
        :row-class="ndRowClass">
        <template #row-actions="{ row }">
          <button class="btn ghost xs" :aria-label="'按节点 ' + (row[0] || '') + ' 采热线程'"
            title="按此节点采热线程" @click.stop="loadHot(String(row[0] || ''))"><FlaskConical :size="11" /></button>
        </template>
        <!-- 五百二十八批 W-A：#cell-<key> 作用域槽消费回收（527 备件；QRT 契约：槽只接管该格
             显示，title/复制/导出/右键矩阵恒 raw）——HEAP%/CPU% 回归水位条（metricColor 单一
             真源），HEAP/CPU 趋势回归 SparkLine（采样真源 trendHist 不变，槽内附 trendCell
             文本摘要信息保全），角色列分档色标（esEnumZh.nodeRoleClass 现成口径，全量角色串
             textContent 不变=diagTableAgg 断言零改锚） -->
        <template #cell-角色="{ row }">
          <span v-if="row[1] == null" class="dg-role">∅</span>
          <span v-else class="dg-role" :class="roleClsOf(row[1])">{{ row[1] }}</span>
        </template>
        <template v-for="mc in meterCols" :key="mc" #[`cell-`+mc]="{ value }">
          <span class="dg-bar" aria-hidden="true"><i :style="{ width: meterW(value), background: value == null ? 'transparent' : metricColor(meterMetric(mc), value) }"></i></span><span class="mono">{{ value == null ? '∅' : value }}</span>
        </template>
        <template v-for="tc in trendCols" :key="tc" #[`cell-`+tc]="{ row }">
          <span class="dg-spark"><SparkLine v-if="histOf(tc, row).length >= 2" :data="histOf(tc, row)" :w="96" :h="16" /></span>
          <span class="dg-spark-tip mono">{{ trendCell(histOf(tc, row)) }}</span>
        </template>
        <!-- 五百三十四批：semRawCols 显式抑制守卫落地——Load1（0..1 被按值推断判 percent）与
             拒绝计数（0 判「0%」、≥1000 判秒）两误伤面由内核 prop 消费显式抑制（三列显示走
             既有数值链，title/复制/导出/聚合本就 raw/数值口径不变）；531 批 #cell- 槽位退役；
             'FS 可用' 不在列，走 ND_TYPES size_bytes 语义档照常 -->
      </QueryResultTable>
      <!-- G2-B2：失败占位与提示互斥——nodesErr 时不许伪装成「未加载」（G2 复审：按源判定，不再看聚合 opsErr） -->
      <!-- 五百六十一批：nodesErr 失败占位裸 dg-tip 收编 EmptyState compact 统一件（532 批本文件
           「点击刷新」判例对齐）——失败档带 action 重试（文案逐字保留，busy 禁用位随组件契约退役） -->
      <EmptyState v-else-if="nodesErr" compact :icon="Activity" text="节点快照拉取失败" action-text="重试" @action="loadOps" />
      <!-- 五百三十二批：裸 dg-tip 占位迁 EmptyState 统一件（文案逐字保留=healthThreeState 锚零改） -->
      <EmptyState v-else :icon="Activity" text="点击刷新加载节点资源快照" />

      <!-- 二栏：pending tasks / 分配诊断 -->
      <div class="dg-ops-grid">
        <div>
          <div class="dg-sec-t sec-t">
<Hourglass :size="12" /> Pending Cluster Tasks（{{ pending.length }}）
            <!-- 一百八十批：pending tasks Markdown 复制（带出体系——master 队列堆积排障贴群） -->
            <button v-if="pending.length" class="btn sm ghost" style="margin-left:auto" @click.prevent="copyPending" title="复制 pending tasks 为 Markdown（群聊/工单直贴）"><ClipboardCopy :size="11" /> Markdown</button>
          </div>
          <div v-if="pending.length" class="dg-pending">
            <div v-for="(p, i) in pending" :key="i" class="dg-pending-row">
              <span class="chip mono" :style="p.priority === 'URGENT' ? 'color:var(--err)' : p.priority === 'HIGH' ? 'color:var(--warn)' : ''">{{ p.priority || '-' }}</span>
              <span class="mono" style="flex:1;color:var(--tx1)">{{ p.source }}</span>
              <!-- 五百三十一批：+'ms' 裸拼退役 → queueMsText（semFormat duration，≥1000 转 s 档） -->
              <span class="mono" style="color:var(--tx2)">{{ queueMsText(p) }}</span>
            </div>
          </div>
          <!-- G2-B2：失败≠空闲——pendingErr 时绿勾互斥（G2 复审：按源判定，nodesStats 失败不误报本区） -->
          <!-- 五百六十一批：pendingErr 失败占位同批收编 EmptyState compact（失败档带 action 重试） -->
          <EmptyState v-else-if="pendingErr" compact :icon="Hourglass" text="pending tasks 拉取失败" action-text="重试" @action="loadOps" />
          <div v-else class="dg-okline"><CheckCircle2 :size="13" style="color:var(--ok)" /> 无 pending task（master 队列空闲）</div>
        </div>

        <div>
          <div class="dg-sec-t sec-t">
            <Compass :size="12" /> Shard 分配诊断
            <button class="btn sm ghost" style="margin-left:auto" @click="loadAllocation" :disabled="loadingAlloc" title="分析未分配分片">
              <RefreshCw :size="10" :class="{ spinning: loadingAlloc }" /> 探测
            </button>
            <!-- 三百四十三批：allocation explain 复制（工单直达） -->
            <button v-if="allocation" class="btn sm ghost" @click="copyAllocMd" title="复制分片诊断 Markdown">
              <FileDown :size="10" /> 复制
            </button>
          </div>
          <div v-if="allocation" class="dg-alloc">
            <div class="dg-alloc-row"><span class="dg-k">index：</span><span class="mono">{{ allocation.index || '-' }}</span> <span class="mono dg-alloc-shard" style="color:var(--tx2)">shard {{ allocation.shard ?? '-' }} {{ allocation.primary ? '主' : '副本' }}</span></div>
            <!-- 第十批：current_state 三元内联色收口全局 meta-err/meta-ok 语义档 -->
            <div class="dg-alloc-row"><span class="dg-k">current_state：</span><span class="mono" :class="allocation.current_state === 'unassigned' ? 'meta-err' : 'meta-ok'">{{ allocation.current_state || '-' }}</span></div>
            <div v-if="allocation.unassigned_info" class="dg-alloc-row">
              <span class="dg-k">reason：</span><span class="mono" style="color:var(--warn)">{{ allocation.unassigned_info?.reason }}</span>
              <span style="color:var(--tx2)">（{{ reasonZh(allocation.unassigned_info?.reason) }}）</span>
              <button v-if="allocation.index" class="btn xs ghost" @click="router.push({ path: '/indices', query: { idx: allocation.index, tab: 'shards' } })">去该索引分片处置 →</button>
            </div>
            <!-- 一百零二批：诊断现场一键重试——此前要去命令面板搜（看到原因却不能就地处置）；
                 二百二十一批：走 /cluster/raw=ADMIN 档，非 ADMIN 只读观测（不再给会 403 的钮） -->
            <div v-if="canAdmin && allocation.current_state === 'unassigned'" class="dg-alloc-row">
              <button class="btn xs" :disabled="retrying" @click="retryFailedAlloc">
                <RefreshCw :size="10" :class="{ spinning: retrying }" /> 重试失败分片分配（retry_failed）
              </button>
              <span style="color:var(--tx2)">集群级动作：对所有 retry_failed 分片重新触发分配</span>
            </div>
            <div v-if="allocation.can_allocate" class="dg-alloc-row">
              <!-- 天罗W6：can_allocate 三档徽标收口 esEnumZh.canAllocateCls（yes→ok/no→err/其余 warn），
                   与 HealthReportView 同口径（此前裸 mono 无语义档） -->
              <span class="dg-k">can_allocate：</span><span class="mono" :class="canAllocateCls(allocation.can_allocate)">{{ allocation.can_allocate }}</span>
            </div>
            <details v-if="allocation.node_allocation_decisions?.length" class="dg-alloc-details">
              <summary>Node decisions（{{ allocation.node_allocation_decisions.length }}）</summary>
              <div class="dg-alloc-pre"><JsonTree :data="allocation.node_allocation_decisions" tools /></div>
            </details>
          </div>
          <!-- 五百六十一批：分配健康正向占位/引导提示两处裸 dg-tip 收编 EmptyState compact
               （空态不带 action；文案逐字保留——162 行 ✓ 前缀属文案原文，163 行 kbd 内联标记
               随裸 div 退役，端点串逐字保留进 :text） -->
          <EmptyState v-else-if="allocHealthy" compact :icon="CheckCircle2" text="✓ 所有分片均已分配——集群分配健康，无需诊断" />
          <EmptyState v-else compact :icon="Compass" text="点击探测：请求 _cluster/allocation/explain 定位无法分配的分片原因" />
        </div>
      </div>

      <!-- 热线程折叠。loadHot 会程序化展开（ref.open=true）并滚动到此——
           不用 :open 绑定：手动折叠后 vdom 属性无 diff 不会回写，再点采样会「看似没反应」 -->
      <details ref="hotDetailsRef" class="dg-hot">
        <summary>
          <Flame :size="12" /> Hot Threads 采样（点击展开，采样时约 500ms）
          <!-- 一百三十八批：热线程原始文本复制（性能排障贴群/工单一手材料） -->
          <button v-if="hotThreads" class="btn sm ghost" @click.prevent="copyHot" title="复制热线程原始文本"><Copy :size="10" /> 复制</button>
          <button class="btn sm ghost" @click.prevent="loadHot()" :disabled="loadingHot">
            <RefreshCw :size="10" :class="{ spinning: loadingHot }" /> 采样
          </button>
        </summary>
        <!-- W-C 批：热线程轻量正则分档（不上 Monaco）——线程名 --dv-cyan、cpu%/带单位数字 --warn；
             v-html 内容由 hotThreadsHtml 整段转义后产出，未转义文本零注入 -->
        <pre v-if="hotThreads" class="mono dg-hot-pre" v-html="hotThreadsHtml"></pre>
        <!-- 五百六十一批：热线程未采样占位收编 EmptyState compact（空态不带 action） -->
        <EmptyState v-else compact :icon="Flame" text="尚未采样" />
      </details>
    </div>

    <!-- 一百八十七批节点行右键菜单（CellContextMenu）随五百二十五批 W5 换 QRT 壳退役：
         复制值/复制行 JSON/整表 TSV/排序/列管理归 QRT 内建单元格右键菜单，
         「按此节点采热线程」直达由表格 row-actions 注入钮承接 -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { RefreshCw, CheckCircle2, ClipboardList, ClipboardCopy, Copy,
  Activity, Hourglass, Compass, Flame, ListTodo, FlaskConical, FileDown } from 'lucide-vue-next';
  /* FileDown 补挂载（天罗W6 顺手修）：343 批 allocation 复制钮模板用了 <FileDown> 但 import 漏列，
     运行时恒告警 Failed to resolve component（图标从未渲染） */
import { api } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { askConfirm } from '../composables/confirm';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { usePref } from '../composables/urlState';
import JsonTree from '../components/JsonTree.vue';
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
/* 五百二十五批 W5：节点表换 QRT rows 型——排序（useTableSort）/聚合 tfoot（useColStats）/
   复制矩阵（matrixText）/行右键菜单（CellContextMenu）/水位条+SparkLine 自造单元格壳全部退役，
   排序/漏斗/聚合行/整表 TSV/行内展开归 QRT 内核 */
import QueryResultTable from '../components/QueryResultTable.vue';
import EmptyState from '../components/EmptyState.vue'; /* 五百三十二批：节点表空态统一件 */
import SparkLine from '../components/SparkLine.vue';
import { isBenignEsError, friendlyEsError } from '../utils/esError';
import { errPreHtml, errMeta } from '../utils/errPre'; /* 五百四十七批：错误面双参换装（code/endpoint 元信息行，534 收口波 15 视图先例） */
import { pushSample, trendTip } from '../utils/trendHist';
/* 天罗W6：枚举/档位跨页收口——reason 人话、can_allocate 三档出自 utils/esEnumZh
   （⚠esEnumZh.spec 锁本 import 行字面，nodeRoleClass 拆行引入勿合并）；
   五百二十八批 W-A：nodeRoleClass 角色分档色标随 #cell-槽回收（LiveDashboard 同款口径） */
import { reasonZh, canAllocateCls } from '../utils/esEnumZh';
import { nodeRoleClass } from '../utils/esEnumZh';
/* 五百二十七批 W-F：节点表行级警告色档——阈值单一真源 METRIC_THRESHOLDS（不回自造阈值）；
   五百二十八批 W-A：水位条填充色同真源 metricColor（杜绝同值不同色回潮） */
import { METRIC_THRESHOLDS, metricColor } from '../utils/metricThresholds';
import { exportStamp, copyText, downloadText, csvCell } from '../utils/format';
/* 五百六十批：escapeHtml 三连转义收编 utils/highlightSanitize 导出单源（本地私造退役，
   与 hlSafe 同仓同源）；hotThreadsHtml 私造 span 分档逻辑保留只换转义源 */
import { escapeHtml } from '../utils/highlightSanitize';
/* 五百三十一批：semFormat 语义格式化统一件（bytes/duration——fmtB 手写档与 +'ms' 裸拼退役） */
import { semFormat } from '../composables/useSemFormat';

const router = useRouter();
const store = useAppStore();
/* 二百二十一批：权限门禁——retryFailedAlloc 走 api.raw（/_cluster/reroute 经 /cluster/raw 透传）=ADMIN 档 */
const auth = useAuthStore();
const canAdmin = computed(() => auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', store.target)); /* 五百九十三批：reroute 走 raw，管理域按 rest 页勾选 */

/* ES unassigned_info.reason 枚举 → 人话：已收口 utils/esEnumZh（天罗 W6），HealthReportView 同源 */

const health = ref<any>(null);
const cluster = ref<any>(null);
const loadErr = ref('');
/* 五百四十七批：原始错误对象旁路（errPreHtml 压串丢 code/endpoint，errMeta 读不到——
   BoostTuner/MatchMatrix 等 15 视图 runErrRaw 同范式）；双源聚合面取首个带元信息的错误，
   无则 null（errMeta 空 meta 时输出与单参逐字一致，旧后端零视觉差） */
const loadErrRaw = ref<unknown>(null);
/* 多源聚合错误 → errMeta 用原始对象：优先 ApiError（带 code/endpoint），退而首错 */
const firstMetaRaw = (raws: unknown[]): unknown =>
  raws.find(e => { const m = errMeta(e); return Boolean(m.code || m.endpoint); }) ?? raws[0] ?? null;
/* G2-B1：首帧即 loading（G1 RemoteClusters 范式）——health 未回期间卡死作业卡出骨架，
   不依赖 onMounted 同步置位才不闪「无卡死作业」绿勾 */
const loading = ref(true);

async function load() {
  /* R92-A2：双源失败记名聚合（对齐 Workspace R42 §8.2），页面级透传 + 重试
     R93-13：原第三源 /diagnostics 已随 SPI 能力矩阵一并退役，不再拉取 */
  loading.value = true;
  const fails: string[] = [];
  const raws: unknown[] = []; /* 五百四十七批：原始对象旁路（firstMetaRaw 选喂 errMeta） */
  try { health.value = await api.health(); } catch (e: any) { raws.push(e); fails.push('health（' + friendlyEsError(String(e?.message ?? e)) + '）'); }
  try { cluster.value = await api.clusterHealth(); } catch (e: any) { raws.push(e); fails.push('clusterHealth（' + friendlyEsError(String(e?.message ?? e)) + '）'); }
  loadErr.value = fails.length ? '诊断数据拉取失败：' + fails.join('、') : '';
  loadErrRaw.value = firstMetaRaw(raws);
  if (fails.length) store.notify('error', loadErr.value);
  loading.value = false;
}
/* 进页即自动拉节点资源/pending tasks，免手动点刷新留大片空白 */
/* 三百五十一批：观测区（节点/pending/allocation）可选自动刷新——useAutoRefresh
   全链停续（KeepAlive/页面隐藏/卸载）；开关+频率 usePref 记忆 */
const diagAutoRefresh = usePref('diag.autoRefresh', false);
const diagIntervalMs = usePref('diag.intervalMs', 30000);
const diagRefresher = useAutoRefresh(loadOps, {
  ms: () => (diagAutoRefresh.value ? diagIntervalMs.value : 0),
  guard: () => !loadingOps.value,
});
watch(diagAutoRefresh, (v) => { if (v) loadOps(); diagRefresher.restart(); });
watch(diagIntervalMs, () => diagRefresher.restart());
/* 五百三十五批：补 setOn(true)——351 批接线漏了这行：内部 on 恒 false 时 restart() 是
   no-op，自动刷新静默不排表（正典范式=SlmView/SnapshotsView「内部意图恒开，实际运行
   由 ms getter 按 usePref 开关×间隔门控 + guard 决定」）；与 533 批修的 SnapshotsView 同型 */
diagRefresher.setOn(true);

onMounted(() => { load(); loadOps(); });

const locks = computed(() => health.value?.locks || { self: 0, other: 0, expired: 0 });
const lockTotal = computed(() => locks.value.self + locks.value.other + locks.value.expired);

const clusterColor = computed(() => {
  const s = cluster.value?.status;
  return s === 'green' ? 'var(--ok)' : s === 'yellow' ? 'var(--warn)' : s === 'red' ? 'var(--err)' : 'var(--tx2)';
});

/* 卡头元信息串 MetaStrip items（KPI 大卡退役后的 inline 串统一件化）：
   副行（原 dg-sub）收编为 text 纯文本段；集群状态 tone 与 clusterColor 同判据
   （green/yellow/red → ok/warn/err），括号副文案并入 label 暗色；重建锁段在默认插槽 */
const dgMeta = computed<MetaStripItem[]>(() => [
  { text: '节点资源快照 · 热线程采样 · pending tasks · shard 分配诊断' },
  {
    value: cluster.value?.status || '-',
    label: '集群状态（' + (cluster.value?.number_of_nodes ?? '-') + ' 节点 · ' + (cluster.value?.active_primary_shards ?? '-') + ' 主分片）',
    tone: cluster.value?.status === 'green' ? 'ok' : cluster.value?.status === 'yellow' ? 'warn' : cluster.value?.status === 'red' ? 'err' : undefined,
    dot: clusterColor.value,
  },
]);

/* ═══ R22: 集群运维观测（nodes-stats / pending / allocation / hot-threads） ═══ */
const nodes = ref<any[]>([]);
/* 二百一十四批:HEAP 趋势采样(节点名→heapPct 序列,上限 30 点)——趋势列数据源；
   二百一十七批:CPU 趋势对称采样；五百二十五批 W5 换 QRT 壳后趋势列降为 trendTip 文本
   摘要（采样逻辑不变，仍每轮 loadOps 记录），utils/trendHist 单一真源不出走 */
const heapHist = ref<Map<string, number[]>>(new Map());
const cpuHist = ref<Map<string, number[]>>(new Map());

/* ═══ 五百二十五批 W5：节点表 QRT rows 型数据映射 ═══
   列头文案逐字承旧 thead（HEAP%/CPU% 与导出档表头同源；原「Search/Bulk 拒绝」合并列拆为
   独立两列——数据本就是两字段，与 CSV/MD 导出列、QRT 聚合列一一对应）；
   角色列给全量角色串（原 chip 只显分档主角色、title 全量——纯文本壳下信息保全优先）；
   数值列 Number 化（QRT 采样口径 isNumeric 只认 number），趋势列文本化（trendCell）。 */
const ND_COLS = ['节点', '角色', 'HEAP%', 'HEAP 趋势', 'CPU%', 'CPU 趋势', 'Load1', 'FS 可用', 'Search 拒绝', 'Bulk 拒绝'];
/* 五百三十一批：'FS 可用' long → size_bytes（semOn bytes 语义档：1.2 GB 档位制形态）——
   排序/右对齐/聚合数值口径随类型退位（bytes 型非 ES 数值型），该列语义优先；
   HEAP%/CPU%/Load1/拒绝列保持 ES 数值型标注（千分位/右对齐/Σ 聚合不受影响，
   推断误伤面由 SEM_RAW_COLS 槽位兜住） */
const ND_TYPES: Record<string, string> = { 'HEAP%': 'scaled_float', 'CPU%': 'scaled_float', 'Load1': 'float', 'FS 可用': 'size_bytes', 'Search 拒绝': 'long', 'Bulk 拒绝': 'long' };
/* 五百三十一批设立、五百三十四批平移为内核 prop 消费（QRT :sem-raw-cols）：semOn 开启后
   不许走按值推断的裸数值列（percent/≥1000 判秒两误伤面）——守卫在 semFormat noInfer 档
   （显式 fieldTypes 标注不受影响），原 #cell- 槽位随守卫落地退役 */
const SEM_RAW_COLS = ['Load1', 'Search 拒绝', 'Bulk 拒绝'];
/* 趋势列文本形态：满 2 点出 trendTip 摘要（近 N 次 min~max · 最新），不足给「采样中」占位 */
function trendCell(arr?: number[]): string {
  return arr && arr.length >= 2 ? trendTip(arr) : '采样中';
}
const nodesMatrix = computed(() => nodes.value.map(n => {
  const name = String(n.name || n.nodeId || '');
  const roles = Array.isArray(n.roles) ? n.roles.join('/') : String(n.roles || '');
  return [
    name || null,
    roles || null,
    n.heapPct == null ? null : Number(n.heapPct),
    trendCell(heapHist.value.get(name)),
    n.cpuPct == null ? null : Number(n.cpuPct),
    trendCell(cpuHist.value.get(name)),
    n.load1 == null ? null : Number(n.load1),
    n.fsAvailableBytes == null ? null : Number(n.fsAvailableBytes),
    Number(n.searchRejected ?? 0),
    Number(n.bulkRejected ?? 0),
  ];
}));
/* 导出钮经 ref 取 QRT 内核口径矩阵（漏斗+排序+列选所见即所得） */
const nodesQrt = ref<InstanceType<typeof QueryResultTable> | null>(null);
/* ═══ 五百二十七批 W-F：节点表行级警告色档消费（QRT rowClass 契约，内核 W-D 并行在途）═══
   525 批 W5 随纯文本壳退役的 .dg-node-warn 行警告语义回收（语义类名沿用原档）：
   HEAP% ≥ bad(85) 或 CPU% ≥ bad(90) → 警告行；nodesMatrix 列序 [节点, 角色, HEAP%, HEAP 趋势,
   CPU%, …]（索引 2/4）。QRT 尚无该 prop 时经 attrs 透传不报错，待内核落地后 Lead 终验。 */
const ndRowClass = (row: any[]): string | undefined => {
  const heap = Number(row[2]);
  const cpu = Number(row[4]);
  return ((Number.isFinite(heap) && heap >= METRIC_THRESHOLDS.heap.bad)
    || (Number.isFinite(cpu) && cpu >= METRIC_THRESHOLDS.cpu.bad))
    ? 'dg-node-warn' : undefined;
};

/* ═══ 五百二十八批 W-A：#cell-<key> 槽渲染辅助（527 备件消费；槽只接管显示层，
   矩阵值恒文本——trendCell 摘要/raw 数值，导出/复制/查找不受影响）═══ */
const meterCols = ['HEAP%', 'CPU%'];
const trendCols = ['HEAP 趋势', 'CPU 趋势'];
function meterMetric(col: string): 'heap' | 'cpu' {
  return col.includes('HEAP') ? 'heap' : 'cpu';
}
function meterW(v: unknown): string {
  const n = Number(v);
  return (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0) + '%';
}
/* 趋势槽取数：列名含 HEAP→heapHist、CPU→cpuHist（节点名=行首列 row[0]，与采样键同源） */
function histOf(trendCol: string, row: any[]): number[] {
  const hist = trendCol.includes('HEAP') ? heapHist.value : cpuHist.value;
  return hist.get(String(row[0] || '')) ?? [];
}
/* 角色列分档色标：nodeRoleClass 现成口径（data=蓝/master=紫，LiveDashboard 同款）——
   全量角色串保位（只染色不缩文，diagTableAgg textContent 断言零改锚） */
function roleClsOf(roleStr: unknown): string {
  return nodeRoleClass({ roles: String(roleStr ?? '').split('/') });
}
const pending = ref<any[]>([]);
const allocation = ref<any>(null);
const allocHealthy = ref(false);
const hotThreads = ref<string>('');
/* W-C 批：热线程轻量分档——先整段 escape 再按序包 span（与 highlightJson 同安全口径，
   未转义文本绝不进 v-html）。分档：'单引号线程名'=--dv-cyan ｜ cpu%/带单位数字=--warn。
   内联 style 直用 token：双主题自适应，且不依赖 v-html 内容吃到 scoped 属性
   五百六十批：escapeHtml 换 utils/highlightSanitize 导出单源（本地 function 退役，语义逐字不变） */
const hotThreadsHtml = computed(() => {
  if (!hotThreads.value) return '';
  return escapeHtml(hotThreads.value).replace(
    /'[^'\n]{2,200}'|\b\d+(?:\.\d+)?(?:%|ms|s|kb|mb|gb)\b/g,
    (m) => (m.startsWith("'")
      ? '<span style="color:var(--dv-cyan)">' + m + '</span>'
      : '<span style="color:var(--warn)">' + m + '</span>'),
  );
});
const hotNode = ref(''); // 当前采样的节点（空=全集群）
const loadingOps = ref(false);
const loadingAlloc = ref(false);
const retrying = ref(false);
/* 一百零二批：诊断现场一键重试——_cluster/reroute?retry_failed=true（CmdPalette 同款命令
   前移到看到未分配原因的现场）；askConfirm warn 门控（集群级分配动作） */
async function retryFailedAlloc() {
  if (!await askConfirm({
    title: '重试失败分片分配',
    level: 'warn',
    message: '将对集群下发 _cluster/reroute?retry_failed=true，对所有因节点离线等原因分配失败的分片重新触发分配。若根因未消除（如磁盘水位/缺失副本），分片会再次分配失败。',
    okText: '提交重试',
  })) return;
  retrying.value = true;
  try {
    await api.raw('POST', '/_cluster/reroute?retry_failed=true', '{}');
    store.notify('success', '已提交 retry_failed=true，稍后重新探测');
    setTimeout(loadAllocation, 1500);
  } catch (e: any) {
    store.notify('error', '重试失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { retrying.value = false; }
}
const loadingHot = ref(false);
/* 热线程折叠区模板引用——loadHot 点击后程序化展开 + 滚动定位 */
const hotDetailsRef = ref<HTMLDetailsElement | null>(null);
/* G2-B2：观测区失败状态位——nodes/pending 双源记名聚合（同 load() 风格），
   失败时保留旧数据，区域占位与「点击刷新」提示/「无 pending」绿勾互斥。
   G2 复审：双源各立状态位（nodesErr/pendingErr），区域占位各自判定——
   单源失败不再拖累另一源区域（master 队列空闲返回空被误报「拉取失败」）；
   opsErr 仅作聚合出口，供顶部 err-bar 记名展示 */
const opsErr = ref('');
const nodesErr = ref('');
const pendingErr = ref('');
/* 五百四十七批：观测双源原始对象旁路（loadErrRaw 同范式，firstMetaRaw 选喂 errMeta） */
const opsErrRaw = ref<unknown>(null);

/* R49 P0：后端 nodes-stats 返回嵌套契约（jvm/fs/os/threadPool），此处拉平为表格字段；
   兼容未来后端直接下发扁平字段的情况（?? 优先已有值） */
function load1Of(la: any): number | string | null {
  if (la == null) return null;
  if (typeof la === 'number') return la;
  if (Array.isArray(la)) return la[0] ?? null;
  if (typeof la === 'object') return la['1m'] ?? null;
  return null;
}
function flattenNode(n: any) {
  return {
    ...n,
    heapPct: n.heapPct ?? n.jvm?.heapUsedPercent ?? null,
    heapUsedBytes: n.heapUsedBytes ?? n.jvm?.heapUsedBytes,
    heapMaxBytes: n.heapMaxBytes ?? n.jvm?.heapMaxBytes,
    cpuPct: n.cpuPct ?? n.os?.cpuPercent ?? null,
    load1: n.load1 ?? load1Of(n.os?.loadAverage),
    fsTotalBytes: n.fsTotalBytes ?? n.fs?.totalBytes,
    fsAvailableBytes: n.fsAvailableBytes ?? n.fs?.availableBytes,
    searchRejected: n.searchRejected ?? n.threadPool?.search?.rejected ?? 0,
    bulkRejected: n.bulkRejected ?? n.threadPool?.bulk?.rejected ?? n.threadPool?.write?.rejected ?? 0,
  };
}

async function loadOps() {
  loadingOps.value = true;
  /* G2-B2：失败源返回 null 不清空旧数据（对齐 B4 拓扑保留旧图），记名聚合进 opsErr。
     G2 复审：失败/成功按源落 nodesErr/pendingErr；try/finally 保证 loadingOps 必复位 */
  const fails: string[] = [];
  const raws: unknown[] = []; /* 五百四十七批：原始对象旁路（firstMetaRaw 选喂 errMeta） */
  try {
    const [ns, pt] = await Promise.all([
      api.nodesStats().catch((e: any) => { raws.push(e); nodesErr.value = friendlyEsError(String(e?.message ?? e)); fails.push('nodesStats（' + nodesErr.value + '）'); return null; }),
      api.pendingTasks().catch((e: any) => { raws.push(e); pendingErr.value = friendlyEsError(String(e?.message ?? e)); fails.push('pendingTasks（' + pendingErr.value + '）'); return null; }),
    ]);
    if (ns) { nodes.value = (ns as any[]).map(flattenNode); nodesErr.value = ''; }
    /* R49 P0：pending_tasks 接口返回 {tasks:[...]}，之前误存整个对象导致永显「无积压」 */
    if (pt) { pending.value = (pt as any)?.tasks || (Array.isArray(pt) ? pt : []); pendingErr.value = ''; }
    opsErr.value = fails.length ? '观测数据拉取失败：' + fails.join('、') : '';
    opsErrRaw.value = firstMetaRaw(raws);
    if (fails.length) store.notify('error', opsErr.value);
    /* 二百一十四批：HEAP 趋势采样——每轮 loadOps 记录各节点 heapPct(上限 30 点),
       供节点表「趋势」SparkLine 展示(比单点水位更多一眼走势)
       二百一十七批：CPU 趋势同轮对称补齐；采样逻辑收口 utils/trendHist(双列共用防漂移) */
    for (const n of nodes.value) {
      const key = String(n.name || n.nodeId);
      pushSample(heapHist.value, key, n.heapPct);
      pushSample(cpuHist.value, key, n.cpuPct);
    }
  } finally {
    loadingOps.value = false;
  }
}

async function loadAllocation() {
  loadingAlloc.value = true;
  allocHealthy.value = false;
  try {
    allocation.value = await api.allocationExplain();
  } catch (e: any) {
    /* 400 "unable to find any unassigned shards" 是健康态，不是错误 */
    if (isBenignEsError(e?.message || '')) {
      allocation.value = null;
      allocHealthy.value = true;
    } else {
      store.notify('error', 'allocation-explain: ' + friendlyEsError(String(e?.message ?? e))); /* 五百六十批：裸 err 并轨（retryFailedAlloc 418 同款口径） */
    }
  } finally {
    loadingAlloc.value = false;
  }
}

async function loadHot(nodeId?: string) {
  loadingHot.value = true;
  hotNode.value = nodeId || '';
  /* 点击即展开并滚到热线程区——结果不再埋进默认折叠的 details 里没反馈。
     用 ref.open 程序化展开而非 :open 绑定（手动折叠后 vdom 无 diff 不回写，详见模板注释） */
  await nextTick();
  if (hotDetailsRef.value) hotDetailsRef.value.open = true;
  try { hotDetailsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch { /* jsdom 等无实现环境静默跳过 */ }
  try {
    hotThreads.value = await api.hotThreads(3, '500ms', 'cpu', nodeId);
    store.notify('success', `Hot Threads 采样完成${nodeId ? `（节点 ${nodeId}）` : ''}，结果见下方热线程区`);
  } catch (e: any) {
    store.notify('error', 'hot-threads: ' + friendlyEsError(String(e?.message ?? e))); /* 五百六十批：裸 err 并轨 */
  } finally {
    loadingHot.value = false;
  }
}

/* 三百五十一批 fmtB 手写 1024 档退役 → semFormat bytes 统一件（530 W-B 共享件单一出处）；
   null 空 '-' 语义保留（exportNodes 容量汇报空值口径不变），解析失败回落 '-' */
function fmtB(bytes: number | null | undefined): string {
  if (bytes == null) return '-';
  return semFormat(bytes, 'bytes')?.text ?? '-';
}

/* 五百三十一批：pending 排队时长裸拼 +'ms' 退役 → semFormat duration（≥1000 转 s 档）；
   time_in_queue 人话串（ES 已格式化）优先原样，缺失才走 millis 档（仅展示行，复制导出恒 raw） */
function queueMsText(p: any): string {
  if (p.time_in_queue) return p.time_in_queue;
  return semFormat(p.time_in_queue_millis, 'millis')?.text ?? '-';
}

/* ═══ 一百三十四批：节点资源快照导出（容量汇报双通道）——五百二十五批 W5：行集/列集改走
   QRT ref.getCsvBlock()（漏斗+排序+列选所见即所得）；容量汇报加工档（% 后缀/FS 人性化字节）
   按列名就地回填；Markdown 走剪贴板（工单直贴）、CSV 走 BOM 下载（中文列头 Excel 直开）双通道不变 */
function exportNodes(fmt: 'csv' | 'md') {
  const blk = nodesQrt.value?.getCsvBlock();
  if (!blk || !blk.rows.length) return;
  const head = blk.head;
  const rows = blk.rows.map(r => head.map((c, ci) => {
    const v = r[ci];
    if (c === 'HEAP%' || c === 'CPU%') return v == null ? '-' : v + '%';
    if (c === 'FS 可用') return v == null ? '-' : fmtB(Number(v));
    return v == null ? '-' : String(v);
  }));
  let content: string;
  if (fmt === 'md') {
    const esc = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    content = [
      '| ' + head.join(' | ') + ' |',
      '| ' + head.map(() => '---').join(' | ') + ' |',
      ...rows.map(cols => '| ' + cols.map(v => esc(v)).join(' | ') + ' |'),
    ].join('\n');
    /* 三百四十三批：md 走剪贴板通道（工单直贴），下载通道保留给 csv */
    copyText(content).then(ok => store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 个节点（Markdown）` : '复制失败'));
    return;
  }
  content = [head.map(csvCell).join(','), ...rows.map(cols => cols.map(csvCell).join(','))].join('\n');
  /* 中文列名 Excel 直开不乱码必须 BOM（126 批 BrowserView 同款口径） */
  downloadText(`diag-nodes-${exportStamp()}.csv`, content, 'text/csv', { bom: true });
}

/* 三百四十三批：allocation explain 复制 Markdown（工单直达） */
function copyAllocMd() {
  const a = allocation.value;
  if (!a) return;
  const lines: string[] = [
    '## Shard 分配诊断', '',
    `- index: ${a.index || '-'}`,
    `- shard: ${a.shard ?? '-'} ${a.primary ? '（主）' : '（副本）'}`,
    `- current_state: ${a.current_state || '-'}`,
  ];
  if (a.unassigned_info) {
    lines.push(`- reason: ${a.unassigned_info.reason || '-'}`);
    if (a.unassigned_info.details) lines.push(`- details: ${a.unassigned_info.details}`);
  }
  if (a.can_allocate === 'no' && a.allocate_explanation) lines.push(`- allocate_explanation: ${a.allocate_explanation}`);
  copyText(lines.join('\n')).then(ok => store.notify(ok ? 'success' : 'error', ok ? '分片诊断 Markdown 已复制' : '复制失败'));
}

/* 一百三十八批：热线程原始文本复制——性能排障时贴群/工单的一手材料，格式必须保真 */
async function copyHot() {
  if (!hotThreads.value) return;
  const ok = await copyText(hotThreads.value);
  store.notify(ok ? 'success' : 'error', ok ? '热线程文本已复制' : '复制失败');
}

/* 一百八十批：pending tasks Markdown 复制——priority/source/queue 三列（与节点表/热线程同一带出体系） */
async function copyPending() {
  if (!pending.value.length) return;
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    '| priority | source | time_in_queue |',
    '| --- | --- | --- |',
    ...pending.value.map((p: any) =>
      `| ${esc(p.priority)} | ${esc(p.source)} | ${esc(p.time_in_queue || (p.time_in_queue_millis + 'ms'))} |`),
  ].join('\n');
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${pending.value.length} 个 pending task（Markdown）` : '复制失败');
}
</script>

<style scoped>
/* G2-C7：区块级间距落梯 --sp token（亚阶梯微调、控件内 padding、尺寸值不动） */
.dg { display: flex; flex-direction: column; gap: var(--sp-4); }
/* 五百五十四批：观测 .card 壳退役 → border-top 分节；原卡 padding（14px var(--sp-4)）
   等值迁入本类（盒模型零变动，高度结构零触） */
.dg-ops { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }

/* KPI 大卡墙退役后的 inline 元信息串（IndexHubView .ih-meta 同款范式：
   mono 11.5px、值亮标签暗、· 分隔、flex-wrap 窄屏换行、:title 全文兜底）
   换装 MetaStrip 统一件后本页只留位置性补充（卡头内右移）与插槽段（重建锁下钻，
   插槽内容带本视图 scope，样式走父 scoped）；状态点/tone/mono 形态由组件承担。
   五百三十五批：全局 .meta-strip 类退役（theme.css 全局块删除），落位类随迁 .dg-meta */
.dg-meta { margin-left: var(--sp-2); }
.dg-meta > span { display: inline-flex; align-items: center; gap: var(--sp-1); }
/* 525 批：.dg-slot-sep 手写分隔退役（MetaStrip 默认插槽前自动补 ms-sep，单一出处归组件） */
.dg-meta-link { cursor: pointer; }
.dg-meta-link:hover b { text-decoration: underline; }

/* G2-C7：原内联样式收 scoped（第十批：频率下拉换装 AutoRefreshSelect 统一件，.dg-int-sel 残留删除） */
.dg-auto-lbl { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; margin-left: auto; }
/* 五百六十批：卡死横幅四条死样式规则退役（随卡墙 KPI 退役后模板零引用，删前 grep 全仓确认） */
.dg-okline { display: flex; align-items: center; gap: var(--sp-2); color: var(--tx1); font-size: var(--fs-sm); padding: var(--sp-2) 0; }
/* 五百六十一批：.dg-tip/.dg-tip.pad 裸占位规则随五处 EmptyState compact 收编退役
   （节点失败/pending 失败/分配健康/探测引导/尚未采样；留白与图标归组件） */
/* 七百八十五批：网格/纵列/骨架/胶囊四条死规则退役（页布局由 .dg 根纵向流与
   .dg-ops-grid 承担，四者模板零挂载，删前 grep 全仓+动态前缀甄别确认） */

/* R22 观测卡片（原 .dg-sub 副行随 MetaStrip 换装退役——收编为 items text 纯文本段） */
/* G2-C7：原内联 margin-left:auto + gap:6px 收 scoped */
.dg-ops-act { margin-left: auto; display: flex; gap: var(--sp-2); }
/* 五百二十五批 W5：节点表自造表皮（.dg-nodes sticky 表头/.dg-trend SparkLine 列/
   .dg-bar* 水位条/.dg-role-chip 角色 chip/.dg-agg* 聚合 tfoot/.dg-rej-b 拒绝列间距）随换 QRT 壳退役——
   排序态/粘顶/tfoot/右对齐归 QRT 内建；五百二十七批 W-F：.dg-node-warn 行警告底色经
   rowClass 回收（tr 由 QRT 内核渲染，:deep 穿透；类名语义承 200 批原档 warn-soft 柔底） */
.dg :deep(.dg-node-warn td) { background: var(--warn-soft); }
 /* 五百二十八批 W-A：#cell-槽视觉回收——类名承 525 退役前 .dg-bar 与 .dg-role-chip 语义档；
   插槽内容带本视图 scope，scoped 规则直接命中（无需 :deep 穿透）。
   水位条：bg2 底 + metricColor 单一真源填充（与 ndRowClass/HealthReport 同判据同色） */
.dg-bar { display: inline-block; vertical-align: middle; width: 64px; height: 6px; margin-right: var(--sp-1h); border-radius: 3px; background: var(--bg-hover, var(--bg2)); overflow: hidden; }
.dg-bar i { display: block; height: 100%; border-radius: 3px; }
/* 角色列分档色标（nodeRoleClass：data=蓝 / master=紫；其余角色默认字色） */
.dg-role.data { color: var(--dv-blue); }
.dg-role.master { color: var(--dv-purple); }
/* 趋势列 SparkLine + 小字摘要（文本档承 525 后口径，信息保全） */
.dg-spark { display: block; line-height: 0; }
.dg-spark-tip { display: block; font-size: var(--fs-2xs); color: var(--tx2); }
.dg-ops-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); margin-top: var(--sp-4); }
/* 字号/字重/颜色走全局 .sec-t（12px/600，分节标题第二档）：本类只管布局，不再自写下划线 */
.dg-sec-t { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.dg-pending { display: flex; flex-direction: column; gap: var(--sp-1); max-height: 220px; overflow: auto; }
.dg-pending-row { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-xs); padding: 3px 0; border-bottom: 1px solid var(--line); }
.dg-pending-row:last-child { border-bottom: 0; }
.dg-alloc { font-size: var(--fs-sm); color: var(--tx1); display: flex; flex-direction: column; gap: var(--sp-1); }
/* 五百五十批：键名裸 b 收口 .dg-k 语义类（HealthReportView hr-alloc-line 同款类名对齐）；
   形取就近既有键名规则逐字随迁（tx0/600/margin-right，视觉零变化），旧元素选择器随 b 退役 */
.dg-k { color: var(--tx0); font-weight: 600; margin-right: var(--sp-1); }
/* G2-C7：原内联 margin-left:8px 收 scoped */
.dg-alloc-shard { margin-left: var(--sp-2); }
/* G2-C7：原内联 margin-left:6px 收 scoped（拒绝列 B span 随纯文本壳退役，规则删除） */
/* 天罗W6：节点角色 chip（LiveDashboard 同语言）随五百二十五批 W5 换 QRT 壳退役——
   角色列改全量角色串纯文本（信息保全优先，分档色标待行级条件色档内核就绪后回收） */
.dg-alloc-details { margin-top: var(--sp-1); }
.dg-alloc-details summary { cursor: pointer; font-size: var(--fs-xs); color: var(--tx2); user-select: none; }
.dg-alloc-details summary:hover { color: var(--tx0); }
/* 五百六十三批轨4：代码框 border 退役（刀④；df-code/hr-code 全站代码面语言：bg+radius 无 border），
   max-height 视口档零变动 */
.dg-alloc-pre { font-size: var(--fs-xs); max-height: 200px; overflow: auto; padding: var(--sp-2); background: var(--bg1); border-radius: var(--r-xs); margin: var(--sp-1) 0 0; white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
.dg-hot { margin-top: var(--sp-4); padding-top: var(--sp-3); border-top: 1px solid var(--line); }
.dg-hot summary { cursor: pointer; user-select: none; display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--tx0); font-weight: 600; }
/* G2-C7：原内联 margin-left:8px 收 scoped */
.dg-hot summary .btn { margin-left: var(--sp-2); }
.dg-hot summary:hover { color: var(--ac); }
.dg-hot-pre { font-size: var(--fs-xs); max-height: 340px; overflow: auto; padding: var(--sp-2) var(--sp-3); background: var(--bg1); border-radius: var(--r-xs); margin: var(--sp-2) 0 0; white-space: pre; } /* 五百六十三批：border 退役（dg-alloc-pre 同刀） */


/* G2-C6：双栏堆叠归一 §9.3 标准值 1100（G1 TaskTreeView C6 同构），窄屏不再左右互挤 */
@media (max-width: 1100px) {
  .dg-ops-grid { grid-template-columns: 1fr; }
  /* 窄屏卡头换行：.card-t 全局 flex 无 wrap，一行塞「标题+元信息串+操作组」会把
     「自动刷新」标签和元信息 span 压成逐字竖排（量尺抓到）——元信息串整行下落、
     操作组可换行、inline 子项禁收缩 */
  .card-t { flex-wrap: wrap; row-gap: var(--sp-1); }
  .dg-meta { flex-basis: 100%; order: 5; }
  /* items 段在子组件作用域内，须 :deep 才能禁收缩（插槽段带本视图 scope 直接命中） */
  .dg-meta > span,
  .dg-meta :deep(.ms-i) { flex: none; }
  .dg-ops-act { margin-left: 0; flex-wrap: wrap; }
  .dg-auto-lbl { flex: none; }
}

/* 五百二十九批：900 紧凑微调档（§9.3 口径；§6q 遗留补齐，W-D）——本页无自身分栏
   （.dg-ops-grid 单列已由常态与 1100 档就位），窄档只收卡间节奏，
   卡死横幅/待处理任务行/分配诊断行允许换行（节点表横滚兜底在全局 .tbl-wrap，不在此重复造） */
@media (max-width: 900px) {
  .dg { gap: var(--sp-3); }
  .dg-pending-row { flex-wrap: wrap; }
  .dg-alloc-row { flex-wrap: wrap; }
}
</style>
