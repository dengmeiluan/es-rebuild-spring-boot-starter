/**
 * 1439：结构化体根键 lint（lintBodyKeys）。
 *
 * 补全帮用户写对根键，lint 负责在写错时立刻说清楚：未知根键 ES 直接 400。
 * 白名单与补全目录同源（key arrays 由 items 派生），目录改名 lint 自动跟随。
 * 反向普查：每个目录里的全部根键必须零输出——否则合法输入会被自己的 lint 骂。
 */
import { describe, it, expect } from 'vitest';
import { lintBodyKeys, lintStructuredBody } from '../utils/dslLint';
import {
  updateBodyRootKeys, rolloverBodyRootKeys, rolloverConditionKeys, dbqBodyRootKeys,
  ubqBodyRootKeys, queryOnlyBodyRootKeys, templateSearchBodyRootKeys, sqlBodyRootKeys, mgetBodyRootKeys,
  storedScriptBodyRootKeys, aliasesBodyRootKeys, scrollBodyRootKeys, clearScrollBodyRootKeys,
} from '../utils/dslCompletionContext';

describe('1439 结构化体根键 lint', () => {
  it('近拼写给「最接近」改名建议（warning + anchor + nth）', () => {
    const f = lintBodyKeys({ max_doc: 10 }, dbqBodyRootKeys, '按查询删除体');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: 'body-root-key', severity: 'warning', anchor: 'max_doc', nth: 0 });
    expect(f[0].message).toContain('最接近：max_docs');
    expect(f[0].suggestion).toContain('max_docs');
  });

  it('不靠近的未知根键也告警，并列出可用根键', () => {
    const f = lintBodyKeys({ sort: [] }, dbqBodyRootKeys, '按查询删除体');
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('没有根键「sort」');
    expect(f[0].suggestion).toContain('query');
  });

  it('反向普查：每个目录自身的全部根键零输出', () => {
    const tables: Array<[readonly string[], string]> = [
      [updateBodyRootKeys, '更新'],
      [rolloverBodyRootKeys, '滚动'],
      [dbqBodyRootKeys, '删除'],
      [ubqBodyRootKeys, '更新查询'],
      [queryOnlyBodyRootKeys, '仅查询'],
      [templateSearchBodyRootKeys, '模板'],
      [sqlBodyRootKeys, 'SQL'],
      [mgetBodyRootKeys, '_mget'],
      [storedScriptBodyRootKeys, '存脚本'],
      [aliasesBodyRootKeys, '别名动作'],
      [scrollBodyRootKeys, '游标翻页'],
      [clearScrollBodyRootKeys, '清理游标'],
    ];
    for (const [keys, label] of tables) {
      const obj = Object.fromEntries(keys.map(k => [k, 1]));
      expect(lintBodyKeys(obj, keys, label), label).toEqual([]);
    }
    expect(lintBodyKeys({ max_age: '7d', max_docs: 1 }, rolloverConditionKeys, '滚动条件')).toEqual([]);
  });

  it('负控：非对象/数组/空值零输出', () => {
    expect(lintBodyKeys(null, dbqBodyRootKeys, 'x')).toEqual([]);
    expect(lintBodyKeys([1, 2], dbqBodyRootKeys, 'x')).toEqual([]);
    expect(lintBodyKeys('x', dbqBodyRootKeys, 'x')).toEqual([]);
  });
});

describe('1439 lintStructuredBody 共享分派（DevTools / RestView 同源）', () => {
  it('按 kind 解析 body 字符串分派；合法体、非结构化档、非法 JSON 均零输出', () => {
    expect(lintStructuredBody('dbq-body', '{"sort":[]}').map(f => f.rule)).toEqual(['body-root-key']);
    expect(lintStructuredBody('dbq-body', '{"query":{},"max_docs":1}')).toEqual([]);
    expect(lintStructuredBody('rollover-body', '{"conditions":{"max_doc":1}}')[0].message).toContain('滚动条件');
    expect(lintStructuredBody('aliases-body', '{"action":[]}')[0].message).toContain('别名动作体');
    expect(lintStructuredBody('scroll-body', '{"scrol":true}')[0].message).toContain('游标翻页体');
    expect(lintStructuredBody('clear-scroll-body', '{"scroll_id":["x"]}')).toEqual([]);
    expect(lintStructuredBody('search', '{"sort":[]}')).toEqual([]);
    expect(lintStructuredBody('settings', '{"a":1}')).toEqual([]);
    expect(lintStructuredBody('dbq-body', '{bad')).toEqual([]);
    expect(lintStructuredBody('dbq-body', '')).toEqual([]);
  });
});
