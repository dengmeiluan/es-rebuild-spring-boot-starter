/**
 * 1439：可排序字段类型单源。
 *
 * 背景：Lucene 排序行 / PIT 排序行 / 构建器排序与折叠行的候选类型此前三处各抄一份——
 * PIT 与构建器漏 unsigned_long，三处都漏 date_nanos（官方 sort 文档明确可排序），
 * 用户在那两页根本选不到这些字段。现在统一吃 queryAstOps.SORTABLE_FIELD_TYPES。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SORTABLE_FIELD_TYPES } from '../utils/queryAstOps';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/** 「缺哪些必要类型」判据（列表版，负控用同一函数喂坏样本） */
function missingTypes(list: string[]): string[] {
  const need = [
    'keyword', 'date', 'date_nanos', 'boolean',
    'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long',
  ];
  return need.filter(t => !list.includes(t));
}

describe('1439 可排序字段类型单源', () => {
  it('共享表覆盖 keyword/date/date_nanos/boolean + 数值九口径', () => {
    expect(missingTypes(SORTABLE_FIELD_TYPES)).toEqual([]);
    /* text 需要 fielddata（默认关），不能作为可排序候选 */
    expect(SORTABLE_FIELD_TYPES).not.toContain('text');
    expect(SORTABLE_FIELD_TYPES).not.toContain('token_count');
  });

  it('三处消费方都吃共享表（不再各抄一份）', () => {
    const lucene = read('../views/LuceneQueryView.vue');
    const pit = read('../views/PitScrollView.vue');
    const root = read('../components/builder/RootExtrasPane.vue');
    expect(lucene).toContain("import { SORTABLE_FIELD_TYPES } from '../utils/queryAstOps';");
    expect(lucene).toContain("const SORTABLE_TYPES = SORTABLE_FIELD_TYPES.join(',');");
    expect(pit).toContain("import { SORTABLE_FIELD_TYPES } from '../utils/queryAstOps';");
    expect(pit).toContain("const SORTABLE_TYPES = SORTABLE_FIELD_TYPES.join(',');");
    expect(root).toContain("import { SORTABLE_FIELD_TYPES } from '../../utils/queryAstOps';");
    expect(root).toContain('const SORTABLE_TYPES = SORTABLE_FIELD_TYPES;');
  });

  it('负控：旧的三处手抄表样本都会被判缺失（date_nanos/unsigned_long）', () => {
    const luceneOld = ['keyword', 'date', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long', 'boolean'];
    const pitOld = ['keyword', 'date', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'boolean'];
    expect(missingTypes(luceneOld)).toEqual(['date_nanos']);
    expect(missingTypes(pitOld)).toEqual(['date_nanos', 'unsigned_long']);
  });
});
