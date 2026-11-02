/* P2-8：文档 diff 多目标扩展——RT 多选 2-3 篇一键对比、基准可换。
 复用 Wave 2 底座 diffDocFields（MISSING 哨兵 + dot-path walk，spec 已锁），
 这里只做「逐目标两两对比 → 按 path 合并成一张行表」的薄合并层；
 换基准=调用方换入参重算（纯前端零请求）。 */
import { diffDocFields } from './docDiff';
/** base + 1~2 目标 → 合并行表。逐 target 调 diffDocFields 再按 path 归并，
 字段并集、路径字母序（底座同款排序，多表归并后仍稳定）。 */
export function docDiffMulti(base, targets) {
    const perTarget = targets.map(t => diffDocFields(base, t));
    const pathIdx = new Map();
    const ordered = [];
    for (let ti = 0; ti < perTarget.length; ti++) {
        for (const d of perTarget[ti]) {
            let row = pathIdx.get(d.path);
            if (!row) {
                row = { path: d.path, base: undefined, targets: new Array(targets.length).fill(undefined), kinds: new Array(targets.length).fill('same'), status: 'same' };
                pathIdx.set(d.path, row);
                ordered.push(row);
            }
            if (d.kind === 'added') {
                /* 底座语义：left(base) 缺席 → added（值在 right 侧） */
                row.targets[ti] = d.right;
                row.kinds[ti] = 'added';
            }
            else {
                row.base = d.left;
                row.targets[ti] = d.right;
                row.kinds[ti] = d.kind; // same | changed | removed
            }
        }
    }
    let same = 0, changed = 0, onlyBase = 0, onlyTarget = 0;
    for (const row of ordered) {
        const ks = row.kinds;
        if (ks.every(k => k === 'same'))
            row.status = 'same';
        else if (ks.every(k => k === 'added'))
            row.status = 'only-target';
        else if (ks.every(k => k === 'removed'))
            row.status = 'only-base';
        else if (ks.includes('changed'))
            row.status = 'changed';
        else if (ks.includes('removed'))
            row.status = 'only-base';
        else
            row.status = 'only-target'; // added 与 removed 混合（如 t1 无 t2 有）：按目标侧存在归 only-target
        if (row.status === 'same')
            same++;
        else if (row.status === 'changed')
            changed++;
        else if (row.status === 'only-base')
            onlyBase++;
        else
            onlyTarget++;
    }
    ordered.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { rows: ordered, same, changed, onlyBase, onlyTarget };
}
/** diff → Markdown 表（复制联动：贴进评论/IM/文档可读）。缺席格以 — 表示。 */
export function docDiffToMarkdown(baseLabel, targetLabels, d) {
    const esc = (v) => {
        if (v === undefined)
            return '—';
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    };
    const head = `| 字段 | ${baseLabel}（基准） | ${targetLabels.join(' | ')} |`;
    const sep = `| --- | ${targetLabels.map(() => '---').join(' | ')} |`;
    const body = d.rows.map(r => `| ${r.path} | ${esc(r.base)} | ${r.targets.map(t => esc(t)).join(' | ')} |`);
    return [head, sep, ...body].join('\n');
}
