/**
 * 1439 续：真实世界 DSL 形态的往返（变体，不是官方骨架）。
 * 1181 用 QUERY_SNIPPETS 骨架锁「结构位认对」；这里专攻骨架**不覆盖**的形态：
 * 简写、多值、嵌套组合、可选参数缺省、数组/对象混排。
 * 判据仍是①字段/主值落进语义位（不能靠 raw 原样回写蒙混）②写回同构。
 */
import { describe, it, expect } from 'vitest';
import { parseQueryNode, serQueryNode } from '../utils/queryAst';

const stable = (v: any): string => {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
};

const CASES: Array<[string, string]> = [
  ['term 无 keyword 后缀', '{"term":{"status":"active"}}'],
  ['term 对象体带 boost', '{"term":{"status":{"value":"active","boost":2}}}'],
  ['terms 多值', '{"terms":{"tag":["a","b","c"]}}'],
  ['terms 对象体带 boost', '{"terms":{"tag":{"value":["a","b"],"boost":1.5}}}'],
  ['range 单位参', '{"range":{"t":{"gte":"now-1d/d","lte":"now","format":"strict_date_optional_time"}}}'],
  ['range 带 boost', '{"range":{"p":{"gt":1,"boost":2}}}'],
  ['exists', '{"exists":{"field":"a"}}'],
  ['prefix 对象体', '{"prefix":{"u":{"value":"ki","case_insensitive":true}}}'],
  ['wildcard 多值对象', '{"wildcard":{"u":{"value":"ki*","boost":2}}}'],
  ['regexp', '{"regexp":{"u":{"value":"k.*y","flags":"ALL"}}}'],
  ['fuzzy 对象体', '{"fuzzy":{"u":{"value":"kiwi","fuzziness":2,"prefix_length":1}}}'],
  ['match 对象体', '{"match":{"title":{"query":"quick","operator":"and","fuzziness":"AUTO"}}}'],
  ['match_phrase 对象体', '{"match_phrase":{"title":{"query":"quick fox","slop":2}}}'],
  ['match_phrase_prefix', '{"match_phrase_prefix":{"title":{"query":"quick br","max_expansions":10}}}'],
  ['multi_match 全参', '{"multi_match":{"query":"x","fields":["a^2","b"],"type":"best_fields","tie_breaker":0.3,"operator":"and"}}'],
  ['query_string 完整', '{"query_string":{"query":"a AND b","default_field":"t","analyze_wildcard":true}}'],
  ['simple_query_string', '{"simple_query_string":{"query":"a + b","fields":["x","y"],"default_operator":"and"}}'],
  ['ids', '{"ids":{"values":["1","2","3"]}}'],
  ['bool 全四槽', '{"bool":{"must":[{"term":{"a":1}}],"filter":[{"term":{"b":2}}],"should":[{"term":{"c":3}}],"must_not":[{"term":{"d":4}}],"minimum_should_match":1}}'],
  ['bool should 单对象(非数组)', '{"bool":{"should":{"term":{"a":1}}}}'],
  ['bool 只有 filter', '{"bool":{"filter":[{"range":{"n":{"gte":1}}}]}}'],
  ['nested 带 inner_hits', '{"nested":{"path":"c","query":{"match":{"c.t":"x"}},"inner_hits":{"size":3}}}'],
  ['has_child', '{"has_child":{"type":"reply","query":{"match":{"t":"x"}},"score_mode":"max"}}'],
  ['has_parent', '{"has_parent":{"parent_type":"post","query":{"match_all":{}}}}'],
  ['parent_id', '{"parent_id":{"type":"answer","id":"1"}}'],
  ['constant_score', '{"constant_score":{"filter":{"term":{"a":1}},"boost":2}}'],
  ['dis_max', '{"dis_max":{"queries":[{"match":{"a":"x"}},{"match":{"b":"y"}}],"tie_breaker":0.5}}'],
  ['boosting', '{"boosting":{"positive":{"term":{"a":1}},"negative":{"term":{"b":2}},"negative_boost":0.5}}'],
  ['function_score 完整', '{"function_score":{"query":{"match_all":{}},"functions":[{"filter":{"term":{"a":1}},"weight":2}],"score_mode":"sum","boost_mode":"multiply"}}'],
  ['script_score', '{"script_score":{"query":{"match_all":{}},"script":{"source":"_score * 2"}}}'],
  ['geo_distance', '{"geo_distance":{"distance":"10km","loc":[1,2]}}'],
  ['geo_shape', '{"geo_shape":{"loc":{"shape":{"type":"envelope","coordinates":[[1,2],[3,4]]},"relation":"intersects"}}}'],
  ['shape', '{"shape":{"loc":{"type":"envelope","coordinates":[[1,2],[3,4]]}}}'],
  ['knn 顶层', '{"knn":{"field":"v","query_vector":[1,2],"k":10,"num_candidates":100}}'],
  ['more_like_this', '{"more_like_this":{"fields":["t"],"like":["a b"],"min_term_freq":2}}'],
  ['percolate', '{"percolate":{"field":"q","document":{"a":1}}}'],
  ['rank_feature 对象体', '{"rank_feature":{"field":"p","boost":2,"saturation":{"pivot":3}}}'],
  ['rank_features 多字段', '{"rank_features":{"field":"rf"}}'],
  ['distance_feature 完整', '{"distance_feature":{"field":"loc","origin":"now-1d","pivot":"7d","boost":2}}'],
  ['terms_set', '{"terms_set":{"prog":{"terms":["a","b"],"minimum_should_match_script":{"source":"1"}}}}'],
  ['script 查询', '{"script":{"script":{"source":"doc[\'a\'].value > 1","lang":"painless"}}}'],
  ['wrapper', '{"wrapper":{"query":"<base64>"}}'],
  ['pinned', '{"pinned":{"ids":["1","2"],"organic":{"match":{"t":"x"}}}}'],
  ['combined_fields', '{"combined_fields":{"query":"a b","fields":["t","u"],"operator":"and"}}'],
  ['intervals 多种规则', '{"intervals":{"t":{"any_of":{"intervals":[{"match":{"query":"a"}},{"wildcard":{"pattern":"b*"}}]}}}}'],
  ['exit 的条件 match_all', '{"match_all":{"boost":2}}'],
  ['match_none', '{"match_none":{}}'],
  ['exists 无 field（畸形）', '{"exists":{}}'],
  ['term 多字段并列', '{"term":{"a":1,"b":2}}'],
];

describe('1439 真实世界形态 DSL 往返', () => {
  it('每个变体都能解析出语义位并同构写回', () => {
    const problems: string[] = [];
    for (const [name, dsl] of CASES) {
      const body = JSON.parse(dsl);
      const node = parseQueryNode(body);
      if (!node) { problems.push(`${name}：解析返回 null`); continue; }
      const back = serQueryNode(node);
      if (stable(back) !== stable(body)) {
        problems.push(`${name}\n  期望 ${stable(body)}\n  实得 ${stable(back)}`);
      }
    }
    expect(problems, '往返失真：\n' + problems.join('\n')).toEqual([]);
  });

  /* 反作弊：文本相等也可能来自「没认出来 → raw 原样写回」，那种树在界面上
     没有字段选择器/主值输入，用户改不了。所以逐个断言语义位**真的**被填上。 */
  it('语义位真的被填上（不是 raw 原样回写）', () => {
    const problems: string[] = [];
    const expectField = (name: string, dsl: string, field: string) => {
      const node: any = parseQueryNode(JSON.parse(dsl));
      const got = node?.field;
      if (got !== field) problems.push(`${name}：field 期望 ${JSON.stringify(field)}，实得 ${JSON.stringify(got)}`);
    };
    const expectValue = (name: string, dsl: string, value: unknown) => {
      const node: any = parseQueryNode(JSON.parse(dsl));
      const got = node?.value;
      if (stable(got) !== stable(value)) problems.push(`${name}：value 期望 ${stable(value)}，实得 ${stable(got)}`);
    };
    expectField('term', '{"term":{"status":"active"}}', 'status');
    expectValue('term', '{"term":{"status":"active"}}', 'active');
    expectField('terms', '{"terms":{"tag":["a","b"]}}', 'tag');
    expectValue('terms', '{"terms":{"tag":["a","b"]}}', ['a', 'b']);
    expectField('range', '{"range":{"t":{"gte":"now-1d"}}}', 't');
    expectField('exists', '{"exists":{"field":"a"}}', 'a');
    expectField('prefix', '{"prefix":{"u":"ki"}}', 'u');
    expectField('wildcard', '{"wildcard":{"u":"ki*"}}', 'u');
    expectField('regexp', '{"regexp":{"u":"k.*"}}', 'u');
    expectField('fuzzy', '{"fuzzy":{"u":"kiwi"}}', 'u');
    expectField('match', '{"match":{"title":"quick"}}', 'title');
    expectValue('match', '{"match":{"title":"quick"}}', 'quick');
    /* multi_match 的字段落在 fields 数组（多字段语义位），不是单值 field */
    {
      const node: any = parseQueryNode(JSON.parse('{"multi_match":{"query":"x","fields":["a","b"]}}'));
      const got = node?.fields;
      if (stable(got) !== stable(['a', 'b'])) problems.push(`multi_match：fields 期望 ["a","b"]，实得 ${stable(got)}`);
      if (node?.value !== 'x') problems.push(`multi_match：value 期望 "x"，实得 ${JSON.stringify(node?.value)}`);
    }
    expectValue('query_string', '{"query_string":{"query":"a AND b"}}', 'a AND b');
    expectValue('ids', '{"ids":{"values":["1","2"]}}', ['1', '2']);
    expectField('nested', '{"nested":{"path":"c","query":{"match_all":{}}}}', 'c');
    expect(problems, '语义位未填充：\n' + problems.join('\n')).toEqual([]);
  });
});
