import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const sql = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1136：表格首行去拥挤（dbx/DBeaver 式数据网格语言）——
 * 单行列头；排序/筛选图标悬停或生效时才出现且不再占列宽；类型收进 title/列详情；
 * 无 cursor 时不挂禁用翻页钮。 */
describe('1136 表格首行减法', () => {
  it('列头单行：类型块不再占首行/第二行宽度，完整类型进 title', () => {
    expect(qrt).toContain('.qrt-th-sub { display: none; }');
    expect(qrt).toContain('const type = effType(c);');
    expect(qrt).toContain("const head = type ? type + ' · ' + c : c;");
    expect(qrt).toContain('return [tip, head, base].filter(Boolean).join(\'\\n\');');
  });

  it('排序/筛选图标脱离文档流，悬停/聚焦/生效才可见——不挤列宽、不常驻噪音', () => {
    expect(qrt).toContain('.qrt-sort-i { position: absolute; right: 25px;');
    expect(qrt).toContain('.qrt-funnel {\n  position: absolute; right: 6px;');
    expect(qrt).toContain('.qrt-tbl th:hover .qrt-funnel, .qrt-tbl th:focus-within .qrt-funnel, .qrt-funnel:focus-visible { opacity: .8; }');
    expect(qrt).toContain('.qrt-tbl th.on .qrt-sort-i { opacity: 1; }');
    /* 1151：列名右内衬给常驻漏斗留槽（原「max-width: 220px;」尾随即为规则结束，现多一段
       padding-right，改为前缀锚 + 单独断言内衬，语义不变） */
    expect(qrt).toContain('.qrt-th-name { display: inline-block; max-width: 220px;');
    expect(qrt).toMatch(/\.qrt-th-name \{[^}]*padding-right: 14px;/);
  });

  it('列宽可拖：无 storageKey 走内存态；首拖固化宽度并按内容宽展开', () => {
    expect(qrt).toContain('@mousedown="beginColResize($event, c)"');
    expect(qrt).toContain('function beginColResize(e: MouseEvent, col: string) {');
    expect(qrt).toContain("width: 'max-content'");
    /* 1141：门控放宽到 barOn（内存态工具行通道同样走冻结/列宽口径） */
    expect(qrt).toContain(':style="barOn ? frozenStyle(c) : colStyle(c)"');
  });

  it('结果优先布局：编辑器让高给网格；单栏时模板侧栏排到结果之后', () => {
    expect(sql).toContain('.sq-grid { grid-template-rows: minmax(150px, 34vh); }');
    expect(sql).toContain('.sq-grid > .sq-samples { order: 3; }');
    expect(sql).toContain('sq-icon-btn');
  });

  it('无 cursor 不渲染两个禁用翻页钮（少两个占位元素）', () => {
    expect(sql).toContain('<template v-if="cursor">');
    expect(sql).toContain(':disabled="busy"');
    expect(sql).not.toContain(':disabled="!cursor || busy"');
  });
});
