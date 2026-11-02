import { ref, computed, watch } from 'vue';
import { useHitNav } from './useHitNav';
/* 件⑤：splitMark/normNumStr 纯函数件迁 utils/markSeg（fieldSearch 反向 import
 composables 的依赖倒挂根治）；本文件 re-export 保全站 10+ 消费方 import 路径与值引用零改，
 本体 matches 内部仍经 import 消费 normNumStr（行为零漂移）。 */
import { normNumStr } from '../utils/markSeg';
export { splitMark, normNumStr } from '../utils/markSeg';
/* 件⑤：splitMark/normNumStr 函数本体迁 utils/markSeg（逐字平移零行为漂移，
 函数头注同步更新），本文件头部 re-export 保 10+ 消费方 import 路径零改——
 既有 557 数值归一整段 mark、229 大小写不敏感切分等契约语义归 markSeg 单源承接。 */
/** date 列类型感知——日期分隔符归一比对（/ . 与 - 互认，「2024/01/15」
 * 命中 kw「2024-01-15」）。仅两侧都呈日期形态（`^\d{4}[-/.]\d{1,2}` 起手）才归一，
 * 防普通文本去符号误伤；boolean 列不出专档（第一遍大小写不敏感已覆盖 "True"∈"true"）。 */
const DATE_LIKE_RE = /^\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?/;
const dateNorm = (s) => s.replace(/[/.]/g, '-');
export function useGridSearch(opts) {
    const kw = ref('');
    const open = ref(false);
    const deferred = ref('');
    let timer = null;
    watch(kw, v => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => { deferred.value = v.trim(); }, opts.debounceMs ?? 150);
    });
    const matches = computed(() => {
        const k = deferred.value.toLowerCase();
        if (!k)
            return [];
        /* 548：查询词归一 memo——deferred 未变则跨 computed 重算复用（勿每格重算正则） */
        let mK = '\u0000', mNk = null;
        const normKw = (kw) => {
            if (kw === mK)
                return mNk;
            mK = kw;
            mNk = normNumStr(kw);
            return mNk;
        };
        const nk = normKw(k);
        /* 563：date 列归一基准——kw 呈日期形态才启用第三遍（每 computed 一次，非逐格） */
        const dKw = DATE_LIKE_RE.test(k) ? dateNorm(k) : null;
        const out = [];
        const rows = opts.rows(), cols = opts.cols();
        for (let ri = 0; ri < rows; ri++) {
            for (let ci = 0; ci < cols; ci++) {
                const text = opts.getText(ri, ci);
                /* 第一遍原样 includes——契约零变，命中即命中 */
                if (text.toLowerCase().includes(k)) {
                    out.push({ ri, ci });
                    continue;
                }
                /* 第二遍数值双口径归一（548）：仅两侧都「看起来是数字」才比对 */
                if (nk !== null) {
                    const nt = normNumStr(text);
                    if (nt !== null && nt.includes(nk))
                        out.push({ ri, ci });
                    continue;
                }
                /* 第三遍列类型感知（563）：date 列且两侧都呈日期形态才分隔符归一——
         仅在前两遍全不命中时走到（兜底位），归一 includes 与第一遍同口径 */
                if (dKw !== null && opts.colType?.(ci) === 'date' && DATE_LIKE_RE.test(text)
                    && dateNorm(text).includes(dKw))
                    out.push({ ri, ci });
            }
        }
        return out;
    });
    const matchSet = computed(() => {
        const s = new Set();
        for (const m of matches.value)
            s.add(m.ri + ':' + m.ci);
        return s;
    });
    const nav = useHitNav(() => matches.value.length);
    return { kw, open, deferred, matches, matchSet, ...nav };
}
