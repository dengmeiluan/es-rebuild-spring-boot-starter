/**
 * 三百零四批：SqlConsole 补 NDJSON 导出（与 Lucene/PIT 通道对齐；列名作键还原行对象）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

describe('SqlConsole NDJSON 导出（304 批）', () => {
  it('按钮+函数+列名还原行对象', () => {
    expect(v).toContain('> NDJSON');
    expect(v).toMatch(/function exportNdjson\(\)/);
    expect(v).toMatch(/o\[c\.name\] = r\[i\] \?\? null;/);
    expect(v).toMatch(/application\/x-ndjson/);
  });
});
