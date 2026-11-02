import { ref, computed, watch } from 'vue';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';
/* 表格态偏好记忆（列选/密度/列宽三件套），从 ResultTable 的
 索引维度口径（T21）抽出，供轻量只读表（QueryResultTable）复用；ResultTable
 后续迁移到本 composable 后即闭环。键空间与 ResultTable 完全一致：
 es_cols:<dim> / es_tbl_dense:<dim>（兼容读旧全局 es_tbl_dense 作初值）/ es_tbl_w:<dim>
 dimension 为 null/空串 → 记忆整体关闭（SQL 通道 特例：每次执行回原始行序，
 不带任何跨执行状态），此时状态自足、不读写 localStorage。
 修复 ResultTable 原实现的缺口：列宽此前只写不读（刷新即丢），此处恢复完整读写。 */
export function useTablePrefs(dimension, allCols, opts) {
    const on = computed(() => !!dimension.value);
    /* ── 密度/行高 ──
   改为全站统一键（不分维度）——行高/密度是「阅读生理偏好」，同一索引从
   索引工作区与查询工作台进入（useIdxState 与 pickedIdx 同源，维度本应相同）必须
   一致；且操作列等渲染差异不该被记忆键割裂放大（实报行高不一致）。
   读侧兼容迁移：全局键缺省时回落读旧维度键，写入只落全局键（一次调节全站生效）。 */
    function readDense(d) {
        const g = localStorage.getItem('es_tbl_dense');
        if (g != null)
            return g === '1';
        const perDim = d ? localStorage.getItem('es_tbl_dense:' + d) : null;
        if (perDim != null)
            return perDim === '1';
        return false;
    }
    const dense = ref(readDense(dimension.value));
    function readRowH(d) {
        const g = localStorage.getItem('es_tbl_rowh');
        if (g === 'compact' || g === 'cozy' || g === 'standard')
            return g;
        const v = d ? localStorage.getItem('es_tbl_rowh:' + d) : null;
        return v === 'compact' || v === 'cozy' ? v : 'standard';
    }
    const rowH = ref(readRowH(dimension.value));
    function setRowH(v) {
        rowH.value = v;
        writeStoredRaw(localStorage, 'es_tbl_rowh', v);
    }
    /* 行高三档循环+档位中文名合并进内核——RT/QRT 工具条同一颗「行高」钮
   同一循环序（紧凑→标准→宽松）；此前 RT 本地实现、QRT 只有 dense 两态且钮是僵尸
   （根类绑定已改 rowH 驱动后点「密度」视觉无变化） */
    const ROWH_LABEL = { compact: '紧凑', standard: '标准', cozy: '宽松' };
    const rowHLabel = computed(() => ROWH_LABEL[rowH.value]);
    function cycleRowH() {
        setRowH(rowH.value === 'compact' ? 'standard' : rowH.value === 'standard' ? 'cozy' : 'compact');
    }
    function toggleDense() {
        dense.value = !dense.value;
        writeStoredRaw(localStorage, 'es_tbl_dense', dense.value ? '1' : '0');
    }
    /* ── 列选 ── */
    const visibleCols = ref([]);
    function restoreCols(cols) {
        const d = dimension.value;
        let saved = [];
        if (d) {
            try {
                const v = JSON.parse(localStorage.getItem('es_cols:' + d) || '[]');
                /* （parse 不抛不代表是列名数组（对象/数字/null 字面皆合法 JSON），
         非数组一律按记录损坏回落—— readPresets 的 Array.isArray 范式同构 */
                if (Array.isArray(v))
                    saved = v;
            }
            catch { /* 记录损坏回落默认前 8 列 */ }
        }
        const valid = saved.filter(c => cols.includes(c));
        const fallback = opts?.defaultVisibleCols?.() ?? cols.slice(0, 8);
        visibleCols.value = valid.length ? valid : fallback;
        opts?.onColsReset?.();
    }
    watch(allCols, restoreCols, { immediate: true });
    function persistCols() {
        if (dimension.value)
            writeStoredRaw(localStorage, 'es_cols:' + dimension.value, JSON.stringify(visibleCols.value));
    }
    watch(visibleCols, persistCols, { deep: true });
    /* ── 转置（ResultTable 单文档平铺查看偏好，T21 同口径第四件） ── */
    const transpose = ref(readFlag(dimension.value));
    function toggleTranspose() {
        transpose.value = !transpose.value;
        if (dimension.value)
            writeStoredRaw(localStorage, 'es_tbl_transpose:' + dimension.value, transpose.value ? '1' : '0');
    }
    function readFlag(d) {
        if (!d)
            return false;
        return localStorage.getItem('es_tbl_transpose:' + d) === '1';
    }
    /* ── P1-3：多行转置档位（解除 hits===1 限制后的渲染行数选择）──
   档位 1/5/10/20（1=旧行为兼容）；es_tbl_transpose_n:<dim> 持久化；旧布尔键不动 */
    const TRANSPOSE_N = [1, 5, 10, 20];
    function readTransposeN(d) {
        if (!d)
            return 1;
        const v = Number(localStorage.getItem('es_tbl_transpose_n:' + d));
        return TRANSPOSE_N.includes(v) ? v : 1;
    }
    const transposeN = ref(readTransposeN(dimension.value));
    function setTransposeN(n) {
        if (!TRANSPOSE_N.includes(n))
            return;
        transposeN.value = n;
        if (dimension.value)
            writeStoredRaw(localStorage, 'es_tbl_transpose_n:' + dimension.value, String(n));
    }
    /* ── 列宽（拖拽表头右缘调整，双击柄重置；按维度持久化+恢复） ── */
    function readWidths(d) {
        if (!d)
            return {};
        try {
            return JSON.parse(localStorage.getItem('es_tbl_w:' + d) || '{}');
        }
        catch {
            return {};
        }
    }
    const colWidths = ref(readWidths(dimension.value));
    let resizing = null;
    function startResize(e, col) {
        e.stopPropagation();
        e.preventDefault();
        resizing = { col, startX: e.clientX, startW: colWidths.value[col] || 180 };
        /* 激活 ResultTable 既有全局样式（拖拽中全站 col-resize 光标 + 禁文本选中），
     此前该样式从未接线是死代码 */
        document.body.classList.add('col-resizing');
        window.addEventListener('mousemove', onColResize);
        window.addEventListener('mouseup', endColResize);
    }
    function onColResize(e) {
        if (!resizing)
            return;
        const w = Math.max(60, Math.min(800, resizing.startW + e.clientX - resizing.startX));
        colWidths.value = { ...colWidths.value, [resizing.col]: w };
    }
    function endColResize() {
        resizing = null;
        document.body.classList.remove('col-resizing');
        window.removeEventListener('mousemove', onColResize);
        window.removeEventListener('mouseup', endColResize);
    }
    function resetColWidth(col) { delete colWidths.value[col]; }
    /* 列宽批量重置——单列双击柄只能逐列清，拖乱多列后没有一键回原始宽的出口
   （列选有全选/密度有切换，唯列宽缺「记忆可退出」）；清空后 watch 落盘 {} 同步 LS */
    function resetColWidths() { colWidths.value = {}; }
    function colStyle(col) {
        const w = colWidths.value[col];
        return w ? { width: w + 'px', maxWidth: w + 'px', minWidth: w + 'px' } : undefined;
    }
    watch(colWidths, (v) => {
        if (dimension.value)
            writeStoredRaw(localStorage, 'es_tbl_w:' + dimension.value, JSON.stringify(v));
    }, { deep: true });
    /* ── 维度切换（换索引/换存储键）：全部偏好整体重读该维度记忆 ── */
    watch(dimension, (d) => {
        dense.value = readDense(d);
        rowH.value = readRowH(d);
        restoreCols(allCols.value);
        colWidths.value = readWidths(d);
        transpose.value = readFlag(d);
        transposeN.value = readTransposeN(d);
        freezeN.value = readFreezeN(d);
        presets.value = readPresets(d); /* ：名册随维度重读 */
    });
    /* ── 冻结窗格（/：宽表横向滚动时行身份不丢）──
   P2-4：升级为前缀多列冻结——es_tbl_freeze_n:<dim> 存冻结列数
   （0=关）；旧 es_tbl_freeze:'1' 迁移读作 1；freezeFirst 计算属性兼容既有调用。 */
    function readFreezeN(d) {
        if (!d)
            return 0;
        const n = localStorage.getItem('es_tbl_freeze_n:' + d);
        if (n != null)
            return Math.max(0, Number(n) || 0);
        return localStorage.getItem('es_tbl_freeze:' + d) === '1' ? 1 : 0;
    }
    const freezeN = ref(readFreezeN(dimension.value));
    const freezeFirst = computed(() => freezeN.value > 0);
    function setFreezeN(n) {
        freezeN.value = Math.max(0, n);
        if (dimension.value)
            writeStoredRaw(localStorage, 'es_tbl_freeze_n:' + dimension.value, String(freezeN.value));
    }
    function toggleFreezeFirst() {
        setFreezeN(freezeN.value > 0 ? 0 : 1);
    }
    watch(dimension, (d) => { freezeN.value = readFreezeN(d); });
    function presetListKey(d) { return 'es_tbl_preset_list:' + d; }
    function presetSlotKey(d, name) { return 'es_tbl_preset:' + d + ':' + name; }
    function readPresets(d) {
        if (!d)
            return [];
        try {
            const v = JSON.parse(localStorage.getItem(presetListKey(d)) || '[]');
            return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
        }
        catch {
            return [];
        }
    }
    const presets = ref(readPresets(dimension.value));
    function savePreset(rawName) {
        const d = dimension.value;
        const name = String(rawName ?? '').trim();
        if (!d || !name)
            return false;
        const snap = {
            v: 1,
            cols: [...visibleCols.value],
            widths: { ...colWidths.value },
            rowH: rowH.value,
            dense: dense.value,
            transpose: transpose.value,
            transposeN: transposeN.value,
            freezeN: freezeN.value,
        };
        writeStoredRaw(localStorage, presetSlotKey(d, name), JSON.stringify(snap));
        const next = readPresets(d).filter(n => n !== name);
        next.push(name);
        writeStoredRaw(localStorage, presetListKey(d), JSON.stringify(next));
        presets.value = next;
        return true;
    }
    function applyPreset(name) {
        const d = dimension.value;
        if (!d)
            return false;
        let snap = null;
        try {
            const raw = JSON.parse(localStorage.getItem(presetSlotKey(d, name)) || 'null');
            if (raw && typeof raw === 'object' && raw.v === 1)
                snap = raw;
        }
        catch {
            snap = null;
        }
        if (!snap)
            return false;
        const valid = snap.cols.filter(c => allCols.value.includes(c));
        if (valid.length) {
            visibleCols.value = valid;
            opts?.onColsReset?.();
        }
        colWidths.value = { ...snap.widths };
        setRowH(snap.rowH);
        dense.value = !!snap.dense;
        writeStoredRaw(localStorage, 'es_tbl_dense', dense.value ? '1' : '0');
        transpose.value = !!snap.transpose;
        writeStoredRaw(localStorage, 'es_tbl_transpose:' + d, transpose.value ? '1' : '0');
        setTransposeN(snap.transposeN); // 档位外值被 guard 丢弃=安全
        setFreezeN(snap.freezeN);
        return true;
    }
    function deletePreset(name) {
        const d = dimension.value;
        if (!d)
            return false;
        const list = readPresets(d);
        if (!list.includes(name))
            return false;
        const next = list.filter(n => n !== name);
        writeStoredRaw(localStorage, presetListKey(d), JSON.stringify(next));
        removeStoredRaw(localStorage, presetSlotKey(d, name));
        presets.value = next;
        return true;
    }
    return {
        on, dense, toggleDense, rowH, setRowH, rowHLabel, cycleRowH,
        visibleCols,
        colWidths, colStyle, startResize, resetColWidth, resetColWidths,
        transpose, toggleTranspose,
        transposeN, setTransposeN,
        transposeNs: TRANSPOSE_N,
        freezeN, setFreezeN, freezeFirst, toggleFreezeFirst,
        presets, savePreset, applyPreset, deletePreset,
    };
}
