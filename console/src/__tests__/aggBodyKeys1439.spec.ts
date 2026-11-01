/**
 * 1439：聚合体内部键位补全（terms: { 之后）。
 *
 * 实测：光标在 `{"aggs":{"a":{"terms":{` 里按 Ctrl+Space，只得到文档里出现过的词
 * （a / aggs / terms），真实的参数键（field / size / min_doc_count…）一个都补不出来，
 * 而这些键产品自己是有 schema 的（AGG_BODY_PARAMS）且构建器里也有输入框。
 *
 * 判据：
 * ① 上下文能识别「聚合体内部」并带出类型名；
 * ② 候选键 = 字段键（与 FIELD_BODY_AGGS/PATH_BODY_AGGS 同源）+ AGG_BODY_PARAMS + 嵌套 aggs；
 * ③ 每个候选的 snippet 替换占位符后是合法 JSON 键值；
 * 负控：改坏 FIELD_BODY_AGGS 的输入 → 判据点名。
 */
import { describe, it, expect } from 'vitest';
import { dslContext, aggBodyKeys } from '../utils/dslCompletionContext';
import { AGG_BODY_PARAMS, AGG_OPS, FIELD_BODY_AGGS, PATH_BODY_AGGS } from '../utils/queryAstOps';

function plain(text: string): string {
  return text
    .replace(/\$\{\d+\|([^}]*)\|\}/g, (_m, opts: string) => opts.split(',')[0] ?? 'x')
    .replace(/\$\{\d+:([^}]*)\}/g, (_m, v: string) => v)
    /* 裸 ${0}/${n} 是空占位（如嵌套 aggs 的体），换成空串后才是合法 JSON */
    .replace(/\$\{\d+\}/g, '');
}

describe('1439 聚合体键位补全', () => {
  it('上下文识别聚合体内部并带出类型名', () => {
    const doc = '{"aggs":{"a":{"terms":{';
    const ctx: any = dslContext(doc, doc.length);
    expect(ctx.kind).toBe('agg-body-key');
    expect(ctx.op).toBe('terms');
  });

  it('候选键 = 字段键 + 参数键 + aggs（每个都能组成合法键值）', () => {
    const bad: string[] = [];
    for (const op of Object.keys(AGG_OPS)) {
      const keys = aggBodyKeys(op).map(k => k.key);
      if (PATH_BODY_AGGS.has(op) && !keys.includes('path')) bad.push(`${op}：缺 path`);
      else if (FIELD_BODY_AGGS.has(op) && !keys.includes('field')) bad.push(`${op}：缺 field`);
      if (!keys.includes('aggs')) bad.push(`${op}：缺嵌套 aggs`);
      /* 1439：meta 是每个聚合体都合法的伴随键 */
      if (!keys.includes('meta')) bad.push(`${op}：缺 meta`);
      for (const p of AGG_BODY_PARAMS[op] || []) {
        if (!keys.includes(p.key)) bad.push(`${op}：缺参数 ${p.key}`);
      }
      for (const it of aggBodyKeys(op)) {
        try { JSON.parse('{' + plain(it.insert) + '}'); }
        catch { bad.push(`${op}.${it.key}：片段不是合法键值`); }
      }
    }
    expect(bad, '聚合体键位问题：\n' + bad.join('\n')).toEqual([]);
  });

  it('filter 聚合的体是查询——那里必须出 query-type，不是参数键', () => {
    const flat = '{"aggs":{"a":{"filter":{';
    expect((dslContext(flat, flat.length) as any).kind).toBe('query-type');
    const nested = '{"aggs":{"a":{"terms":{"field":"x"},"aggs":{"b":{"filter":{';
    expect((dslContext(nested, nested.length) as any).kind).toBe('query-type');
    /* 负控：同形但类型是 terms 时仍走参数键（特判只认 filter） */
    const terms = '{"aggs":{"a":{"terms":{';
    expect((dslContext(terms, terms.length) as any).kind).toBe('agg-body-key');
  });

  it('filters 聚合的具名子过滤器体也是查询；命名位不出 query-type', () => {
    const body = '{"aggs":{"a":{"filters":{"filters":{"x":{';
    expect((dslContext(body, body.length) as any).kind).toBe('query-type');
    const naming = '{"aggs":{"a":{"filters":{"filters":{';
    expect((dslContext(naming, naming.length) as any).kind).not.toBe('query-type');
  });

  it('负控：聚合类型名带错 → 上下文档位仍是该名，参数键跟着类型走', () => {
    const doc = '{"aggs":{"a":{"date_histogram":{';
    const ctx: any = dslContext(doc, doc.length);
    expect(ctx.op).toBe('date_histogram');
    const keys = aggBodyKeys(ctx.op).map(k => k.key);
    expect(keys).toContain('calendar_interval');
    expect(keys).not.toContain('execution_hint');
  });
});
