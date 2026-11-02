/* 列宽适应内容内核下沉（RT 140/、QRT 各自手写的 fitCol 合并）——
 单列/全列同一实现。测量口径与既有实现一致：列头名 scrollWidth 一并参与（前 200 行 tbody 格 scrollWidth 取最大、钳位 COL_W_MIN~COL_W_MAX（+16 padding，
 起上限与手动微调同源 600）；
 max=0（happy-dom 无布局引擎/空列）安全 no-op 不写宽。
 两表差异以参数注入：标识列偏移（RT 勾选+序号=2、QRT 序号=1）与列头名选择器。 */
/* 列宽统一钳位常量（上限 600 与两表键盘微调 nudgeColWidth 同源）——
 此前双击自适应钳 320、手动微调上限 600，拖到 500 的列双击自适应反缩回 320（钳位打架）；
 两表 nudgeColWidth 一并引用本常量，改口径只动这一处。 */
export const COL_W_MIN = 60;
export const COL_W_MAX = 600;
/* ═══ ：冻结列 sticky 内联样式单源（RT 836-848 / QRT 720-729 逐字同构合并，
 唯一实差=基数 RT 98（勾选 46+序号 52）/ QRT 52（序号列），参数化注入）═══
 铁律：冻结列强制 min-width 锁死（未拖过宽的冻结列默认 180px），保证 left 与
 实际渲染宽度精确一致不遮字。非冻结/越界/关档返回 undefined，colStyle 回落由调用方兜底。 */
export const FROZEN_DEFAULT_W = 180;
export function frozenStyleOf(visibleCols, colWidths, col, freezeN, basePx, on) {
    const idx = visibleCols.indexOf(col);
    if (!on || idx < 0 || idx >= freezeN)
        return undefined;
    let left = basePx;
    for (let i = 0; i < idx; i++)
        left += colWidths[visibleCols[i]] ?? FROZEN_DEFAULT_W;
    const w = colWidths[col] ?? FROZEN_DEFAULT_W;
    return { left: left + 'px', width: w + 'px', maxWidth: w + 'px', minWidth: w + 'px' };
}
export function useColFit(opts) {
    function fitCol(col) {
        const root = opts.rootEl();
        const idx = opts.cols().indexOf(col);
        if (idx < 0 || !root)
            return;
        let max = 0;
        /* 列头一并参与测量——长列名不被列宽截断，自适应语义完整。
     列名可含任意字符，选择器一律 CSS.escape（happy-dom 无 CSS.escape 时回落原名） */
        const name = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(col) : col;
        const th = root.querySelector(`thead th[data-col="${name}"] ${opts.nameSel}`);
        if (th)
            max = Math.max(max, th.scrollWidth);
        const rows = root.querySelectorAll('tbody tr');
        const cap = Math.min(rows.length, 200);
        for (let ri = 0; ri < cap; ri++) {
            const cell = rows[ri]?.children[opts.cellOffset + idx];
            if (cell)
                max = Math.max(max, cell.scrollWidth);
        }
        if (!max)
            return;
        /* 钳位走共享常量（600 上限）——自适应不再反缩手动调宽的列 */
        opts.setWidth(col, Math.min(COL_W_MAX, Math.max(COL_W_MIN, max + 16)));
    }
    function fitAll() {
        for (const c of opts.cols())
            fitCol(c);
    }
    return { fitCol, fitAll };
}
