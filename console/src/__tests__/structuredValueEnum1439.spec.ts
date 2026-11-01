/**
 * 1439：结构化体值域封闭键的枚举值补全（STRUCTURED_VALUE_ENUMS）。
 *
 * 键位补全写对了，值位此前仍要凭记忆：version_type 只认 internal/external(_gte)、
 * is_write_index 等是布尔、slices 可写 "auto"。本表是单一真源；
 * 反向普查保证表里的键都还在某个结构化体目录里（目录改名不会留下死键）。
 */
import { describe, it, expect } from 'vitest';
import {
  STRUCTURED_VALUE_ENUMS, mgetDocKeyItems, aliasAddConfigKeyItems, aliasRemoveConfigKeyItems,
  updateBodyKeyItems, dbqBodyKeyItems, ubqBodyKeyItems, sqlBodyKeyItems,
} from '../utils/dslCompletionContext';

describe('1439 结构化体值枚举', () => {
  it('关键枚举在场且引号口径正确', () => {
    expect(STRUCTURED_VALUE_ENUMS.version_type).toEqual({
      values: ['internal', 'external', 'external_gte'], quoted: true, detail: '版本类型',
    });
    expect(STRUCTURED_VALUE_ENUMS.slices.quoted).toBe(true);
    for (const k of ['is_write_index', 'is_hidden', 'must_exist', 'detect_noop', 'scripted_upsert',
      'doc_as_upsert', 'columnar', 'field_multi_value_leniency', 'allow_partial_search_results',
      'keep_on_completion', 'index_include_frozen', '_source']) {
      expect(STRUCTURED_VALUE_ENUMS[k], k).toBeTruthy();
      expect(STRUCTURED_VALUE_ENUMS[k].quoted, k).toBe(false);
      expect(STRUCTURED_VALUE_ENUMS[k].values, k).toEqual(['true', 'false']);
    }
  });

  it('反向普查：表里的每个键都仍在某个结构化体目录中（无死键）', () => {
    const union = new Set([
      ...mgetDocKeyItems(), ...aliasAddConfigKeyItems(), ...aliasRemoveConfigKeyItems(),
      ...updateBodyKeyItems(), ...dbqBodyKeyItems(), ...ubqBodyKeyItems(), ...sqlBodyKeyItems(),
    ].map(i => i.label));
    for (const k of Object.keys(STRUCTURED_VALUE_ENUMS)) {
      expect(union.has(k), k + ' 已不在任何结构化体目录中').toBe(true);
    }
  });
});
