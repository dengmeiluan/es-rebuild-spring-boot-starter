/* 直方图注入链统一件（裁决「直方图和 Profile 的组件应该是同一套，
 且位置是同一套」的注入侧合并）——此前整条链内联在 DslQueryView execQuery（894-965）：
 autoHist 开时 pickHistField 选字段 → buildHistAgg 分档聚合体注入 __hist → ES 拒绝
 （histBrokenIdx session 拉黑）剥聚合降级重试一次不连坐主查询 → hits 值形态二次嗅探。
 本件把状态（桶/偏好/拉黑）与链路动作收成 composable，消费方：
 — IndexHubView docs/query 两 tab（接线，偏好键 ih.docs.* / ih.qry.*）；
 — DslQueryView 同位替换下批做（届时偏好键传 'query' 前缀，行为零变化）。
 字段裁决纯函数零改直消费（utils/histField.ts：isDateLikeValue/sniffDateField/
 pickHistField/buildHistAgg，/ 约定在彼处）。 */
import { computed, ref, watch } from 'vue';
import { usePref } from './urlState';
import { buildHistAgg, pickHistField, sniffDateField } from '../utils/histField';
export function useHistAgg(opts) {
    /* 偏好态：键由调用方前缀派生（IndexHub ih.docs. 与 ih.qry. 前缀，DQ 下批传 query. 前缀），
   直方图默认开（DQ 同默认）；折叠节默认展开（histSecOpen 避让历史面板 histOpen 语义同步更新） */
    const autoHist = usePref(opts.prefPrefix + '.autoHist', true);
    const histSecOpen = usePref(opts.prefPrefix + '.histSecOpen', true);
    /* 直方图聚合被 ES 拒过的索引（降级后本 session 不再注入；按索引维度，切索引不漂白） */
    const histBrokenIdx = new Set();
    /* 手动重开直方图开关 = 明确要求重试，清掉当前索引的降级标记 */
    watch(autoHist, (on) => { if (on)
        histBrokenIdx.delete(opts.index()); });
    const histBuckets = ref([]);
    const histField = ref('');
    /* 最近一次响应的自带聚合（histWhy「DSL 自带聚合」判据；onResp 回填） */
    let lastAggs = null;
    /* 本实例是否已吃到过响应（hasResult 缺省时的兜底判据） */
    let queried = false;
    const hasResult = () => opts.hasResult?.() ?? queried;
    /* 裁决「无时间索引要有提示」：mapping 已加载且无 date 字段 → 开关旁即时标注 */
    const histNoDateField = computed(() => !!opts.mappingKnown?.() && !(opts.mappingDates?.() || []).length);
    /* 20260920 直方图可见性自证：执行了查询但无直方图时给出原因（消静默，DQ 文案链逐字同步更新） */
    const histWhy = computed(() => {
        if (!hasResult() || histBuckets.value.length)
            return '';
        if (!autoHist.value)
            return '直方图开关未勾选——勾选后执行查询将自动注入聚合';
        if (histBrokenIdx.has(opts.index()))
            return '该索引直方图聚合此前被 ES 拒绝（session 内自动降级）——重开「直方图」开关可重试';
        if (opts.mappingKnown && !opts.mappingKnown())
            return 'mapping 加载失败或无索引工作区权限——已自动从结果值形态嗅探日期字段（epoch/ISO），无匹配则无直方图';
        if (lastAggs && Object.keys(lastAggs).length)
            return 'DSL 自带聚合，未注入辅助直方图';
        return '未识别到可作直方图的字段（需 date / keyword / 数值型，且值形态匹配）——若预期有请检查 mapping';
    });
    /* 节头 meta 三态（桶数/原因/未执行）——无桶时节头恒在场由它承接语义 */
    const histHeadMeta = computed(() => {
        if (histBuckets.value.length)
            return histBuckets.value.length + ' 桶';
        if (!hasResult())
            return '执行查询后生成';
        return histWhy.value || '未生成';
    });
    /* 字段裁决：mapping date 字段优先（名含 time/date 者加分），退 hits 值形态嗅探——纯函数承载 */
    function resolveField() {
        return pickHistField(opts.mappingDates?.() || [], (opts.hits?.() || []));
    }
    /* 注入聚合体（apply/二次嗅探重放共用）：__hist 固定名，DQ termsAggs 按名豁免渲染 */
    function injectField(body, field) {
        body.aggs = (body.aggs && typeof body.aggs === 'object' && !Array.isArray(body.aggs))
            ? body.aggs
            : {};
        body.aggs.__hist = buildHistAgg(field, opts.fieldType?.(field), opts.verBelow650?.() ?? false);
        histField.value = field;
    }
    /**
   * 请求组装处注入：autoHist 开、当前索引未被拉黑、body 非数组标量、
   * 自带 date_histogram（含 auto_date_histogram 字样，DQ cleaned.includes 同判据）不叠加时，
   * 注入 __hist 并返回 true（调用方凭此在 ES 拒绝时走降级重试）。
   */
    function applyHistToBody(body) {
        histField.value = '';
        if (!body || typeof body !== 'object' || Array.isArray(body))
            return false;
        if (!autoHist.value || histBrokenIdx.has(opts.index()))
            return false;
        if (JSON.stringify(body).includes('date_histogram'))
            return false;
        const f = resolveField();
        if (!f)
            return false;
        injectField(body, f);
        return true;
    }
    /* 二次嗅探（DQ 20260920 补齐链）：mapping 不可用首查未注入时，从 hits 值形态补嗅探；命中返回字段名 */
    function sniffFromHits(hits) {
        if (!autoHist.value || histBrokenIdx.has(opts.index()))
            return '';
        return sniffDateField(hits);
    }
    /* ES 拒绝且非用户取消 → 应剥 __hist 降级重试一次（DQ catch 同判据；取消/未注入照抛） */
    function shouldDegrade(err, injected) {
        return injected && err?.name !== 'AbortError';
    }
    /* 降级剥离 __hist（空 aggs 连根删，DQ 同款），原地修改调用方 body */
    function stripHist(body) {
        const aggs = body.aggs;
        if (!aggs || typeof aggs !== 'object')
            return;
        delete aggs.__hist;
        if (!Object.keys(aggs).length)
            delete body.aggs;
    }
    /* 拉黑当前索引（本 session 不再注入）+ 降级提示（DQ 同文案） */
    function markBroken() {
        histBrokenIdx.add(opts.index());
        histField.value = '';
        opts.notify?.('info', '直方图聚合不适用于该索引（字段类型不支持），已自动降级为纯查询');
    }
    /* 响应回填：从 aggregations.__hist 取桶（降级重试后的裸响应天然无 __hist → 清桶），
   并记录自带聚合供 histWhy 判据 */
    function onResp(resp) {
        queried = true;
        const aggs = resp?.aggregations;
        lastAggs = (aggs && typeof aggs === 'object' && !Array.isArray(aggs)) ? aggs : null;
        const b = lastAggs?.__hist?.buckets;
        histBuckets.value = Array.isArray(b) ? b : [];
    }
    /* 切索引清场：桶/字段/自带聚合/已执行标记归零；histBrokenIdx 按索引维度保留（DQ 同语义） */
    function reset() {
        histBuckets.value = [];
        histField.value = '';
        lastAggs = null;
        queried = false;
    }
    return {
        /* 偏好态（usePref 落盘，键带调用方前缀） */
        autoHist, histSecOpen,
        /* 桶态与派生展示（HistogramSection props 直喂） */
        histBuckets, histField, histNoDateField, histWhy, histHeadMeta,
        /* 注入/降级/回填链 */
        applyHistToBody, injectField, sniffFromHits, shouldDegrade, stripHist, markBroken,
        onResp, reset,
    };
}
