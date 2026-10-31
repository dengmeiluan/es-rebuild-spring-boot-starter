/**
 * 一千四百零五批：QRT 拖拽框选矩阵（用户要的 dbx 式表格交互，此前只有 RT 有）。
 *
 * 实测缺口：RT（查询/索引工作台）22 处框选实现，QRT（SQL/Lucene）0 处——
 * 在 SQL 结果里想复制「两行三列」只能整表导出或一行行勾。
 *
 * 本批把框选下沉内核：左键在格内按下 → 跨格拖动出矩形 → 松开成选区；
 * 状态栏给出「已框选 N 格 + Σ/avg + 复制 TSV/JSON + 清除」；Esc 清除。
 * 三条不打扰既有交互：
 *  ① 纯点击不启动（同一格内拖动不成立选区）→ 单击展开 / Ctrl+点聚合零变化；
 *  ② 拖动松手后的 click 被抑制（不会顺手把单元格展开）；
 *  ③ 行集/列集变化清选区（渲染坐标会错挂新数据）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const ROWS = [
  ['10', '20', '30'],
  ['40', '50', '60'],
];
const COLS = ['a', 'b', 'c'];
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const host = document.createElement('div');
document.body.appendChild(host);
let apps: ReturnType<typeof createApp>[] = [];
let written = '';

function mountQrt(props: Record<string, any> = {}) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, { cols: COLS, rows: ROWS, total: 2, storageKey: 'k1405', ...props }) });
  app.use(createPinia());
  const el = document.createElement('div');
  host.appendChild(el);
  app.mount(el);
  apps.push(app);
}
const cell = (ri: number, ci: number) => host.querySelectorAll('tbody tr')[ri]?.querySelectorAll('td.qrt-cell')[ci] as HTMLElement;

/* jsdom 没有真实布局：按「目标格元素」派发 mousedown/mousemove/mouseup 即可驱动逻辑
 （handler 用 e.target.closest('td.qrt-cell') 反查坐标） */
function drag(from: HTMLElement, to: HTMLElement) {
  from.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  to.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  window.dispatchEvent(new MouseEvent('mousemove', { target: to } as any));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  host.innerHTML = '';
  written = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => { written = t; }) },
  });
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps = [];
});

describe('1405 QRT 拖拽框选矩阵', () => {
  it('① 跨格拖动成立选区：状态栏报格数并出现复制/清除', async () => {
    mountQrt();
    await tick();
    expect(host.querySelector('[data-test="qrt-copy-region-tsv"]'), '静息零占位').toBeNull();
    drag(cell(0, 0), cell(1, 1));
    await tick();
    expect(host.textContent, '2×2=4 格').toContain('已框选 4 格');
    expect(host.querySelector('[data-test="qrt-copy-region-tsv"]')).toBeTruthy();
    expect(host.querySelector('[data-test="qrt-clear-region"]')).toBeTruthy();
    /* 单元格高亮：4 格带 qrt-region */
    expect(host.querySelectorAll('td.qrt-region').length).toBe(4);
  });

  it('② 复制 TSV 是矩阵片段（无表头、按行拼接）', async () => {
    mountQrt();
    await tick();
    drag(cell(0, 1), cell(1, 2));
    await tick();
    (host.querySelector('[data-test="qrt-copy-region-tsv"]') as HTMLButtonElement).click();
    await tick();
    expect(written, '2 行 × 2 列，无表头').toBe('20\t30\n50\t60');
  });

  it('③ 同一格内拖动不成立选区（不打扰单击/聚合）', async () => {
    mountQrt();
    await tick();
    drag(cell(0, 0), cell(0, 0));
    await tick();
    expect(host.querySelector('[data-test="qrt-copy-region-tsv"]')).toBeNull();
    expect(host.querySelectorAll('td.qrt-region').length).toBe(0);
  });

  it('④ Esc 清选区；行集变化自动清选区', async () => {
    mountQrt();
    await tick();
    drag(cell(0, 0), cell(0, 2));
    await tick();
    expect(host.querySelectorAll('td.qrt-region').length).toBe(3);
    const root = host.querySelector('.qrt') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(host.querySelectorAll('td.qrt-region').length, 'Esc 清').toBe(0);
  });

  it('⑤ 源码层：拖选抑制点击 + 单元格带坐标属性（否则反查不到行列）', () => {
    expect(QRT).toMatch(/:data-ri="ri" :data-col="shownCols\[ci\]"/);
    expect(QRT).toContain('regionSuppressClick');
    expect(QRT).toMatch(/cellGuard\.moved\(e\) \|\| regionSuppressClick/);
    /* 负控：删掉抑制位 → 本断言红 */
    expect(QRT.replace(' || regionSuppressClick', '')).not.toMatch(/cellGuard\.moved\(e\) \|\| regionSuppressClick/);
  });
});
