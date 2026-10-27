import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1105：SELECT * 一键展开字段（按当前 mapping，子域去重、上限 60、不伪造字段）。
 * 生产大文档 SELECT * 返回面过宽；展开后 payload 更小、列语义更清楚。 */
describe('1105 SQL SELECT * 展开字段', () => {
  it('仅 SELECT * 且字段源就绪时出现入口（1130：只评估当前选区/光标语句）', () => {
    expect(src).toContain("const canExpandStar = computed(() => /\\bSELECT\\s+\\*/i.test(advisoryText.value || '') && sqlFieldsCtx.fields.value.length > 0);");
    expect(src).toContain('const advisoryText = computed(() => editScope.value?.text ?? sql.value);');
    expect(src).toContain('data-test="sql-expand-star"');
    expect(src).toContain('展开字段');
  });

  it('展开规则：双引号转义、去 .keyword 子域、上限 60、提示截断；原位只改当前段', () => {
    expect(src).toContain("const pool = all.filter(f => !f.path.endsWith('.keyword'));");
    expect(src).toContain("const picked = base.slice(0, 60);");
    expect(src).toContain('replace(/"/g, \'""\')');
    expect(src).toContain('已截断前 60');
    expect(src).toContain('const next = advisoryText.value.replace(/\\bSELECT\\s+\\*/i, \'SELECT \' + cols);');
    expect(src).toContain('applyScopedEdit(next);');
  });
});
