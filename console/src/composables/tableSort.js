import { ref, computed } from 'vue';
import { typeTierSuppressed } from '../utils/semanticGuard';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';
export function useSortChain(opts) {
    const MAX_CHAIN = 3;
    /* 审计修复口径：远端档挂载不读排序落盘（「远端档本地仍排」违 535 契约） */
    const sortSpec = ref(opts.isRemote() ? [] : readLs());
    const remoteSortCur = ref(null);
    function readLs() {
        const base = opts.lsBase();
        if (!base)
            return [];
        const m = localStorage.getItem(base + ':m');
        if (m) {
            try {
                const arr = JSON.parse(m);
                if (Array.isArray(arr)) {
                    /* M2：双格式兼容读——RT 字符串载荷/QRT 数字载荷同键空间互读 */
                    return arr
                        .map((k) => {
                        if (!k || typeof k.f !== 'string')
                            return null;
                        if (k.d === 'asc' || k.d === 'desc')
                            return { f: k.f, d: k.d };
                        if (k.d === 1)
                            return { f: k.f, d: 'asc' };
                        if (k.d === -1)
                            return { f: k.f, d: 'desc' };
                        return null;
                    })
                        .filter((k) => !!k)
                        .slice(0, MAX_CHAIN);
                }
            }
            catch { /* 坏值回落旧键 */ }
        }
        const f = localStorage.getItem(base + ':f');
        return f ? [{ f, d: localStorage.getItem(base + ':d') === 'desc' ? 'desc' : 'asc' }] : [];
    }
    /* 布局分享导入（RT applyLayout）直设链后的落盘出口 */
    function persist() {
        const base = opts.lsBase();
        if (!base)
            return;
        if (sortSpec.value.length) {
            writeStoredRaw(localStorage, base + ':m', JSON.stringify(sortSpec.value));
            writeStoredRaw(localStorage, base + ':f', sortSpec.value[0].f);
            writeStoredRaw(localStorage, base + ':d', sortSpec.value[0].d);
        }
        else {
            removeStoredRaw(localStorage, base + ':m');
            removeStoredRaw(localStorage, base + ':f');
            removeStoredRaw(localStorage, base + ':d');
        }
    }
    function changed() { persist(); opts.onLocalChange?.(); }
    /* 模板辅助：链内方向/序号（aria-sort 仅链首——HTML aria-sort 单值语义）。
   显示与数据分轨：行序/落盘只认 sortSpec（远端档恒空），箭头/aria 认 dispChain。 */
    const dispChain = computed(() => (opts.isRemote() && opts.syncWired())
        ? (remoteSortCur.value ? [remoteSortCur.value] : [])
        : sortSpec.value);
    const chainCount = computed(() => dispChain.value.length);
    function chainHas(c) { return dispChain.value.some(k => k.f === c); }
    function chainDir(c) { return dispChain.value.find(k => k.f === c)?.d ?? 'asc'; }
    function chainOrd(c) { return dispChain.value.findIndex(k => k.f === c); }
    /* 单一入口：表头点击/键盘 Enter·Space/右键直选/Shift 次键四路共用（内核薄壳守卫后
   委托至此）；远端档只推导意图镜像并 emit。 */
    function sortBy(key, directDir, shift = false) {
        if (opts.isRemote()) {
            if (directDir) {
                remoteSortCur.value = { f: key, d: directDir };
                opts.emitIntent({ ...remoteSortCur.value });
                return;
            }
            const cur = remoteSortCur.value;
            const next = cur && cur.f === key ? (cur.d === 'asc' ? { f: key, d: 'desc' } : null) : { f: key, d: 'asc' };
            remoteSortCur.value = next;
            opts.emitIntent(next ? { ...next } : null);
            return;
        }
        /* directDir 直选（dbx 语义）；列头点击仍走三态循环 */
        if (directDir) {
            if (sortSpec.value.length === 1 && sortSpec.value[0].f === key && sortSpec.value[0].d === directDir)
                return;
            sortSpec.value = [{ f: key, d: directDir }];
            changed();
            return;
        }
        if (shift) {
            /* Shift+点=次键操作——链内则翻转方向，不在链则追加（≤3 键） */
            const i = chainOrd(key);
            if (i >= 0) {
                sortSpec.value = sortSpec.value.map((k, ki) => ki === i ? { ...k, d: k.d === 'asc' ? 'desc' : 'asc' } : k);
            }
            else if (sortSpec.value.length < MAX_CHAIN) {
                sortSpec.value = [...sortSpec.value, { f: key, d: 'asc' }];
            }
            else {
                opts.notify?.('最多支持 3 个排序键');
                return;
            }
            changed();
            return;
        }
        const head = sortSpec.value[0];
        if (head && head.f === key) {
            if (head.d === 'asc')
                sortSpec.value = [{ f: key, d: 'desc' }];
            else
                sortSpec.value = []; /* ：第三击取消排序——回原始序，persist 移除键 */
        }
        else {
            sortSpec.value = [{ f: key, d: 'asc' }];
        }
        changed();
    }
    /* 五百四十三/：syncSort 回填——宿主权威态镜像（1|-1 归一 asc/desc，
   null 清态+循环基点同清）；只动显示镜像，sortSpec/行序/落盘零触碰。内核 watch
   守卫 undefined/非远端后委托；immediate 由内核侧持（宿主携态挂载首渲即回显）。 */
    function applySync(s) {
        remoteSortCur.value = s ? { f: s.f, d: s.d === 1 ? 'asc' : 'desc' } : null;
    }
    /* 换维度重读该维度排序记忆（内核 watch 委托；远端档恒空=538 口径） */
    function reload() { sortSpec.value = opts.isRemote() ? [] : readLs(); }
    /* 排序列被列选隐藏→从链剔除（单键=清空）并落盘，避免「排序仍在生效
   但箭头不可见」暗状态；无变化零写（immediate watch 挂载复检友好） */
    function pruneTo(cols) {
        if (sortSpec.value.some(k => !cols.includes(k.f))) {
            sortSpec.value = sortSpec.value.filter(k => cols.includes(k.f));
            changed();
        }
    }
    return { sortSpec, dispChain, chainCount, chainHas, chainDir, chainOrd, sortBy, applySync, reload, pruneTo, persist };
}
/** 把 "1.2gb" / "95%" / "3,943" 等展示值还原为可比较数值；非数值返回 NaN。
 * v3.0.0 起导出：ResultTable sortedHits 同口径复用（此前其比较器对数字型字符串
 * "100"/"20" 走 localeCompare 典序，100 排在 20 前——keyword 映射的数字字段实锤错序）
 * 正则补科学计数（1e6/2.5E-3）与时长单位（ms|s，归一秒基——semFormat
 * duration 显示语汇同基），千分位/单位档既有口径不动 */
export function numeric(v) {
    if (typeof v === 'number')
        return v;
    const s = String(v ?? '').trim().replace(/,/g, '');
    const m = s.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(b|kb|mb|gb|tb|pb|%|ms|s)?$/i);
    if (!m)
        return NaN;
    const n = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    const mul = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4, pb: 1024 ** 5, ms: 0.001, s: 1 };
    return unit && unit !== '%' ? n * (mul[unit] || 1) : n;
}
/** 通用值比较单源（RT sortedHits / QRT sortedRows 双内核接线）。
 * numeric() 双试——任一成功即数值比较；null/undefined/'' 沉底（返回值恒 1/-1/0，
 * 方向无关——调用方须对沉底档跳过方向系数，保证降序也沉底）；否则 String localeCompare
 * 兜底（null 语义不进兜底，String() 仅对非空值调用）。 */
export function compareVals(a, b) {
    const aBlank = a === null || a === undefined || a === '';
    const bBlank = b === null || b === undefined || b === '';
    if (aBlank || bBlank) {
        if (aBlank && bBlank)
            return 0;
        return aBlank ? 1 : -1;
    }
    const an = numeric(a);
    const bn = numeric(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn))
        return an - bn;
    return String(a).localeCompare(String(b));
}
/** 显式非语义列排序抑制出口（531 遗留件③消费面）——binary/_source 等
 * 抑制列 toggle 档短路（排序语义 VOID：raw doc/密文比较无意义）；fieldType 缺省恒放行
 * （零增量缺省）。产出口径给双内核 sortGuard 直连。 */
export function sortableGuard(fieldType) {
    return (key) => !typeTierSuppressed(key, fieldType?.(key));
}
