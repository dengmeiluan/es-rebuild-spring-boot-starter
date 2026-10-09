/**
 * 三百五十批：es_console_qb_split 迁移后遗留键清除——
 * 此前迁移只读不删，localStorage 键永久残留（审计项 10）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../composables/useLayoutPreferences.ts'), 'utf-8');

describe('遗留迁移键清除（350 批）', () => {
  it('迁移后 removeItem 遗留键', () => {
    expect(v).toContain("localStorage.removeItem('es_console_qb_split')");
    expect(v).toMatch(/if \(legacyRaw != null \|\| migrated\) \{[\s\S]*?removeItem/);
  });
});
