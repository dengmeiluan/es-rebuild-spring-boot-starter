/**
 * R130 一百八十七批：DiagView 节点行右键菜单（E 组逐表过 dbx 清单）。
 * 五百二十五批 W5 随迁：节点表换 QRT rows 型，自建行 contextmenu+CellContextMenu 胶水退役，
 * 功能由内核承接——本文件随迁锁定新终态：
 * 1) QRT 内建单元格右键菜单：复制值（=原「复制节点名/资源信息」的逐格通道）、复制行 JSON
 *    （=原 facts 串的全量资源信息）、整表 TSV、排序、列管理；
 * 2) 「按此节点采热线程」直达由 row-actions 注入钮承接（原节点名点击与菜单 hot 项语义）；
 * 3) 二百二十三批 facts 趋势摘要随趋势列文本化延续（trendCell 与 trendTip 同源）。
 * 源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('DiagView 节点行右键菜单（一百八十七批→五百二十五批 W5 随迁）', () => {
  it('采热直达换 row-actions 注入钮（aria 全名可达，行尾常驻入口）', () => {
    expect(src).toMatch(/<template #row-actions="\{ row \}">/);
    expect(src).toMatch(/:aria-label="'按节点 ' \+ \(row\[0\] \|\| ''\) \+ ' 采热线程'"/);
    expect(src).toMatch(/@click\.stop="loadHot\(String\(row\[0\] \|\| ''\)\)"/);
    expect(src).toContain('title="按此节点采热线程"');
  });
  it('QRT rows 型接管（diag:nodes 维度）；行资源全量信息走内核复制行 JSON/行内展开', () => {
    expect(src).toContain(':cols="ND_COLS" :rows="nodesMatrix" sortable');
    expect(src).toContain('storage-key="diag:nodes"');
    /* 旧自建菜单胶水不回潮 */
    expect(src).not.toContain('openNodeMenu');
    expect(src).not.toMatch(/<CellContextMenu/);
  });
  it('二百二十三批：趋势摘要随趋势列文本化延续（trendCell 与 trendTip 同源）', () => {
    expect(src).toContain("import { pushSample, trendTip } from '../utils/trendHist';");
    expect(src).toContain('trendCell(heapHist.value.get(name))');
    expect(src).toContain('trendCell(cpuHist.value.get(name))');
    expect(src).toMatch(/return arr && arr\.length >= 2 \? trendTip\(arr\) : '采样中';/);
  });
});
