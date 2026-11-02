import { ref, computed, watch } from 'vue';
import { writeStoredRaw } from '../utils/safeJson';
/* 落盘键前缀（useTablePrefs 键体系旁，沿用其读写范式）；无维度（SQL 通道）不落盘 */
function readAggPref(d) {
    if (!d)
        return false;
    return localStorage.getItem('es_tbl_agg:' + d) === '1';
}
export function useAggRow(dimension, renderCols, numericOf, 
/* 迷你走势数据源（可选——不传恒 null，既有三参调用形态零触碰） */
seriesOf, 
/* 值分布数据源（可选第 5 参——同 seriesOf 先例，既有四参调用形态零触碰；
推荐 useColStats.statsOf(col).dist 直连（utils/distBins 单源；守卫列天然 null 不出），
TableAggFoot dist prop（可选，缺省零渲染）消费，接线下批 */
distOf) {
    const aggOn = ref(readAggPref(dimension.value));
    watch(dimension, (d) => { aggOn.value = readAggPref(d); });
    function toggleAggRow() {
        aggOn.value = !aggOn.value;
        if (dimension.value)
            writeStoredRaw(localStorage, 'es_tbl_agg:' + dimension.value, aggOn.value ? '1' : '0');
    }
    /* 数值列 Σ/avg 底行数据（列=renderCols 所见即所聚合，与列详情弹窗同一数字） */
    const aggFoot = computed(() => {
        if (!aggOn.value)
            return null;
        const out = {};
        for (const c of renderCols()) {
            const n = numericOf(c);
            if (n)
                out[c] = n;
        }
        return out;
    });
    /* 数值列迷你走势数据（与 aggFoot 同列源同开关同 computed 守卫——
   aggOn 关闭恒 null 零求值；未注入 seriesOf 恒 null；可见性由模板 ≥2 点门槛把关） */
    const aggSpark = computed(() => {
        if (!aggOn.value || !seriesOf)
            return null;
        const out = {};
        for (const c of renderCols()) {
            const s = seriesOf(c);
            if (s && s.length)
                out[c] = s;
        }
        return out;
    });
    /* 数值列值分布 mini-bar 数据（aggSpark 同构——aggOn 关闭恒 null 零求值；
   未注入 distOf 恒 null；null/空 bins 不出，可见性由模板侧把关） */
    const aggDist = computed(() => {
        if (!aggOn.value || !distOf)
            return null;
        const out = {};
        for (const c of renderCols()) {
            const d = distOf(c);
            if (d && d.bins.length)
                out[c] = d;
        }
        return out;
    });
    return { aggOn, toggleAggRow, aggFoot, aggSpark, aggDist };
}
