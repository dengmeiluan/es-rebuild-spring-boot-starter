/**
 * 1439：聚合必填参数（agg-required-param）。
 *
 * terms / 指标聚合缺 field（且无 script）、nested 缺 path、multi_terms 缺 terms——
 * 都是 ES 直接 400 的硬性缺参。此前只有 date_histogram 的间隔键有提示，这些全靠发送后报错。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const req = (obj: unknown) =>
  lintDsl(obj as any).filter((f: any) => f.rule === 'agg-required-param');

describe('1439 聚合必填参数', () => {
  it('反向普查：带足参数的合法聚合零 finding', () => {
    const legit = [
      { aggs: { a: { terms: { field: 'region' } } } },
      { aggs: { a: { terms: { script: { source: "doc['region'].value" } } } } },
      { aggs: { a: { avg: { field: 'amount' } } } },
      { aggs: { a: { avg: { script: { source: '1' } } } } },
      { aggs: { a: { stats: { field: 'amount' } } } },
      { aggs: { a: { percentile_ranks: { field: 'amount', values: [100] } } } },
      { aggs: { a: { nested: { path: 'comments' } } } },
      { aggs: { a: { multi_terms: { terms: [{ field: 'a' }, { field: 'b' }] } } } },
      /* 查询包体 / 无字段聚合不属本规则域 */
      { aggs: { a: { filter: { term: { status: 'A' } } } } },
      { aggs: { a: { global: {} } } },
      { aggs: { a: { weighted_avg: { value: { field: 'v' }, weight: { field: 'w' } } } } },
      { aggs: { a: { composite: { sources: [{ r: { terms: { field: 'region' } } }] } } } },
      /* 变量体（非对象）不判——模板占位交给执行期 */
      { aggs: { a: { terms: '${agg}' } } },
    ];
    for (const dsl of legit) {
      expect(req(dsl), JSON.stringify(dsl)).toEqual([]);
    }
  });

  it('缺必填参数 → error 并指名补什么', () => {
    const cases: Array<[string, unknown, string]> = [
      ['terms 空体', { aggs: { a: { terms: {} } } }, 'field'],
      ['terms 只有 size', { aggs: { a: { terms: { size: 10 } } } }, 'field'],
      ['avg 只有 missing', { aggs: { a: { avg: { missing: 0 } } } }, 'field'],
      ['cardinality 缺 field', { aggs: { a: { cardinality: { precision_threshold: 100 } } } }, 'field'],
      ['nested 缺 path', { aggs: { a: { nested: { aggs: { b: { terms: { field: 'x' } } } } } } }, 'path'],
      ['multi_terms 缺 terms', { aggs: { a: { multi_terms: { size: 5 } } } }, 'terms'],
    ];
    for (const [name, dsl, token] of cases) {
      const f = req(dsl);
      expect(f, name).toHaveLength(1);
      expect(f[0].severity, name).toBe('error');
      expect(f[0].message, name).toContain(token);
      expect(f[0].anchor, name).toBeTruthy();
    }
  });

  it('嵌套聚合内同样判（第二层 aggs）', () => {
    const dsl = { aggs: { outer: { terms: { field: 'r' }, aggs: { inner: { auto_date_histogram: { field: 'ts' }, aggs: { x: { avg: {} } } } } } } };
    const f = req(dsl);
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('avg');
  });

  it('负控：同一判据喂齐参合法体必须空、喂缺参体必须非空', () => {
    expect(req({ aggs: { a: { terms: { field: 'r' } } } })).toEqual([]);
    expect(req({ aggs: { a: { terms: {} } } }).length).toBe(1);
  });
});
