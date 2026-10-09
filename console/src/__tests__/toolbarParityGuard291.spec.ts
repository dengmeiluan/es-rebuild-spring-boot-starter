/**
 * 二百九十一批：两表工具条五件套一致性守卫——RT/QRT 钮集与顺序防分叉。
 * 同一颗钮（导出/行高/列选/列宽）+同图标+同文案；分叉即报警。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('工具条一致性守卫（291 批）', () => {
  it('导出/行高/列选/列宽 四钮两边同在（RT 多快照为宿主能力差异）', () => {
    for (const anchor of ['行高·{{ rowHLabel }}', 'ColPicker', 'RotateCcw', 'FileDown']) {
      expect(rt, anchor).toContain(anchor.split('{{')[0]);
      expect(qrt, anchor).toContain(anchor.split('{{')[0]);
    }
  });
  it('行高钮同内核（rowHLabel/cycleRowH），禁回退两态密度钮', () => {
    expect(rt).toMatch(/@click="cycleRowH"/);
    expect(qrt).toMatch(/@click="cycleRowH"/);
    expect(rt).not.toMatch(/@click="toggleDense"/);
    expect(qrt).not.toMatch(/@click="toggleDense"/);
  });
  it('钮序一致：导出→行高→列选→列宽（各自文本锚，导出钮 class 定位）', () => {
    /* RT 导出钮=rt-exp-btn（文本含动态格式）；QRT 首颗 qrt-tool-btn 即导出（272 批置首） */
    const orders: number[][] = [];
    for (const [s, barKey, expAnchor] of [[rt, 'rt-bar-r', 'rt-exp-btn'], [qrt, 'qrt-bar-r', 'qrt-tool-btn']] as const) {
      const bar = s.slice(s.indexOf(barKey));
      orders.push([bar.indexOf(expAnchor), bar.indexOf('/> 行高·'), bar.indexOf('label="列选"'), bar.indexOf('/> 列宽')]);
    }
    for (const o of orders) {
      expect(o[0], '导出钮存在').toBeGreaterThan(-1);
      expect(o[1], '行高在导出后').toBeGreaterThan(o[0]);
      expect(o[2], '列选在行高后').toBeGreaterThan(o[1]);
      expect(o[3], '列宽在列选后').toBeGreaterThan(o[2]);
    }
  });
});
