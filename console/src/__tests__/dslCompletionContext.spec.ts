/* W4 Task 12：DSL 补全上下文判定（dslContext）——文档文本+光标 offset → 上下文。
   root→根层键（query/sort/aggs/...）；query-type→查询类型（match/term/...）；
   field→叶子子句字段名位；agg-name→aggs 容器键位 / agg-type→实例值对象键位（2.6.0 Task 8）；
   none→非 query/aggs 区深层不出层。 */
import { describe, it, expect } from 'vitest';
import { dslContext, QUERY_SNIPPETS, ROOT_KEYS } from '../utils/dslCompletionContext';
import { bodyKindForPath, settingsKeyItems, mappingKeyItems, MAPPING_TYPES, templateKeyItems } from '../utils/dslCompletionContext';
import { lineIndentAt, reindentSnippet, commaAffixes } from '../utils/dslCompletionContext';

const E = (doc: string) => dslContext(doc, doc.length); // 光标在尾

describe('dslCompletionContext', () => {
  it('根层空键位 → root', () => {
    const doc = '{\n  \n}';
    expect(dslContext(doc, 4).kind).toBe('root');
  });
  it('query 内空键位 → query-type', () => {
    const doc = '{\n  "query": {\n    \n  }\n}';
    expect(dslContext(doc, 16).kind).toBe('query-type');
  });
  it('match 字段名位 → field', () => {
    const doc = '{\n  "query": {\n    "match": {\n      "\n    }\n  }\n}';
    expect(dslContext(doc, 35).kind).toBe('field');
  });
  it('bool.must 数组元素内 → query-type', () => {
    const doc = '{\n  "query": {\n    "bool": {\n      "must": [\n        {\n          \n        }\n      ]\n    }\n  }\n}';
    expect(dslContext(doc, 62).kind).toBe('query-type');
  });
  it('aggs 容器键位 → agg-name（2.6.0 起不再 none）', () => {
    const doc = '{\n  "aggs": {\n    "\n  }\n}';
    expect(dslContext(doc, 17).kind).toBe('agg-name');
  });
  it('QUERY_SNIPPETS 覆盖 match/term/terms/range/bool/exists/wildcard/match_phrase', () => {
    for (const k of ['match', 'term', 'terms', 'range', 'bool', 'exists', 'wildcard', 'match_phrase']) {
      expect(QUERY_SNIPPETS[k], k).toBeTruthy();
    }
  });
  it('ROOT_KEYS 覆盖 query/sort/aggs/_source/highlight/from/size/track_total_hits', () => {
    for (const k of ['query', 'sort', 'aggs', '_source', 'highlight', 'from', 'size', 'track_total_hits']) {
      expect(ROOT_KEYS).toContain(k);
    }
  });

  /* —— 以下为对抗性自测固化的边界用例（W2 luceneContext 评审同法：先探针实测再断言锁定） —— */
  it.each([
    /* 转义口径：与 luceneContext 同规则——反斜杠 run 奇数才算转义。
       A1 键内 \" 奇数 run → 串不提前关闭，仍在 match 字段位 */
    ['{"query": {"match": {"fi\\"eld": "x", ', { kind: 'field', clause: 'match' }],
    /* A2 偶数 run（\\\\ 自身是转义反斜杠）后引号关闭字符串 → 全文平衡回 root。
       计划参考实现 text[i-1]!=='\\' 会把该引号误判为转义、吞掉后续全部结构而错判 field——已按授权修复 */
    ['{"query": {"match": {"k\\\\": "v"}}}', { kind: 'root' }],
    /* A3 偶数 run 键正确关闭后，逗号回到子句第二键位 */
    ['{"query": {"match": {"k\\\\": "v", ', { kind: 'field', clause: 'match' }],
    /* 字符串内含结构符：inStr 保护跳过，不污染括号栈 */
    ['{"query": {"wildcard": {"f": "a{b}c"}}}', { kind: 'root' }],
    ['{"query": {"wildcard": {"f": "a{b}", ', { kind: 'field', clause: 'wildcard' }],
    ['{"query": {"term": {"f": "v]"}}, "size": ', { kind: 'root' }],
    /* 残缺文档容忍：半截字符串=正在敲字段名；栈不平衡按已扫描信息兜底 */
    ['{"query": {"match": {"', { kind: 'field', clause: 'match' }],
    ['{"query": {"bool": {"must": [{', { kind: 'query-type' }],
    /* query 值位未进入（{ 未敲）→ qIdx 即栈顶不算在 query 内，按根层口径兜底（pin 实际行为） */
    ['{"query":', { kind: 'root' }],
    /* 嵌套 query：lastIndexOf 取最内层，光标在嵌套 query 空键位 */
    ['{"query": {"bool": {"should": [{"query": {', { kind: 'query-type' }],
    /* 非 query 区深层一律 none 不出层 */
    ['{"aggs": {"a": {"terms": {"field": "', { kind: 'none' }],
    ['{"sort": [{"@timestamp": {"order": "', { kind: 'none' }],
    /* 第二字段位：已填字段名（栈顶 lastKey='title'）不丢 field 上下文——
       参考实现反向找最近 lastKey 会错得 'title' 而误判 query-type，已修复 */
    ['{"query": {"match": {"title": "x", ', { kind: 'field', clause: 'match' }],
    /* query 值闭合后回根层：参考实现 qIdx 命中栈顶帧仍判 query-type，已修复为 root */
    ['{"query": {"match": {"a": "b"}}, ', { kind: 'root' }],
    /* 复合子句数组元素内的叶子子句字段位 */
    ['{"query": {"bool": {"filter": [{"term": {', { kind: 'field', clause: 'term' }],
    /* range 操作符键位三层（range帧/字段帧/栈顶{）→ 2.6.0 起落 range-op 档（旧「兜底 query-type」误导出档已退役） */
    ['{"query": {"range": {"date": {"gte": "', { kind: 'range-op' }],
    /* 病理：字段名恰为 'query' 会被 lastIndexOf 当作嵌套 query 且位于栈顶 → none（pin 实际行为） */
    ['{"query": {"match": {"query": "x"', { kind: 'none' }],
    /* 字段值串内：DslCtx 无 value 档，按子句 field 位口径（pin 实际行为） */
    ['{"query": {"match": {"title": "he', { kind: 'field', clause: 'match' }],
  ])('%j', (doc, want) => expect(E(doc as string)).toMatchObject(want as object));

  it('空文档/纯空白 → root', () => {
    expect(dslContext('', 0).kind).toBe('root');
    expect(E('  \n ').kind).toBe('root');
  });

  it('offset 越界 clamp：负值按 0、超尾按全文，均收敛不炸', () => {
    expect(dslContext('{"query": {', -3).kind).toBe('root');
    expect(dslContext('{"query": {"match": {"a": "b"}}}', 9999).kind).toBe('root');
  });
});

describe('dslContext 注释跳过（JSONC // 与 /* */，字符串内不算注释）', () => {
  it('行注释内 } 不弹栈（负向钉：未跳过会误判 none）', () => {
    expect(E('{"query": {\n  // }\n  "match": {')).toEqual({ kind: 'field', clause: 'match' });
  });
  it('块注释内 } 不弹栈、引号/冒号不污染 lastKey（负向钉）', () => {
    expect(E('{"query": { /* } */\n  "match": {')).toEqual({ kind: 'field', clause: 'match' });
    /* 任务示例：块注释里的 "x": 1 不写入 lastKey（后续 "match" 正常落位） */
    expect(E('{"query": { /* "x": 1 */\n  "match": {')).toEqual({ kind: 'field', clause: 'match' });
  });
  it('字符串内 // 与 /* 不算注释（inStr 保护优先，回归钉）', () => {
    expect(E('{"query": {"wildcard": {"f": "a//b{c"}}}')).toEqual({ kind: 'root' });
    expect(E('{"query": {"wildcard": {"f": "a/*b{c"}}}')).toEqual({ kind: 'root' });
  });
});

describe('bodyKindForPath', () => {
  it('_bulk → none（NDJSON 不补全）', () => {
    expect(bodyKindForPath('/{index}/_bulk')).toBe('none');
    expect(bodyKindForPath('/_bulk')).toBe('none');
  });
  it('_settings → settings', () => {
    expect(bodyKindForPath('/{index}/_settings')).toBe('settings');
    expect(bodyKindForPath('/alarm_record-20260524/_settings')).toBe('settings');
  });
  it('_mapping → mapping', () => {
    expect(bodyKindForPath('/{index}/_mapping')).toBe('mapping');
  });
  it('search 族 → search', () => {
    for (const p of ['/{index}/_search', '/_search', '/{index}/_count', '/{index}/_validate/query',
      '/{index}/_explain/1', '/{index}/_update_by_query', '/{index}/_delete_by_query']) {
      expect(bodyKindForPath(p), p).toBe('search');
    }
  });
  it('query string / 大小写容错', () => {
    expect(bodyKindForPath('/{index}/_Search?pretty')).toBe('search');
    expect(bodyKindForPath('/{index}/_SETTINGS?flat_settings=true')).toBe('settings');
  });
  it('自由路径默认 search（补全只是建议，零降级）', () => {
    expect(bodyKindForPath('/my-index')).toBe('search');
    expect(bodyKindForPath('')).toBe('search');
  });
});

describe('settingsKeyItems / mappingKeyItems', () => {
  it('settings 档 ≥25 条且带中文 detail，insertText 自带引号', () => {
    const items = settingsKeyItems();
    expect(items.length).toBeGreaterThanOrEqual(25);
    for (const it of items) {
      expect(it.detail, it.label).toBeTruthy();
      expect(it.insertText.startsWith('"'), it.label).toBe(true);
    }
    expect(items.some(i => i.label === 'refresh_interval')).toBe(true);
  });
  it('mapping 档含 properties 骨架 snippet 与核心键', () => {
    const items = mappingKeyItems();
    const prop = items.find(i => i.label === 'properties');
    expect(prop?.snippet).toBe(true);
    expect(prop?.insertText).toContain('${1:field}');
    expect(items.some(i => i.label === 'type')).toBe(true);
  });
  it('ux2 template 档：八键齐、全 snippet、带中文 detail', () => {
    const items = templateKeyItems();
    expect(items.map(i => i.label)).toEqual([
      'index_patterns', 'priority', 'template', 'settings', 'mappings', 'aliases', 'composed_of', '_meta',
    ]);
    for (const it of items) {
      expect(it.snippet, it.label).toBe(true);
      expect(it.detail, it.label).toBeTruthy();
      expect(it.insertText.startsWith('"'), it.label).toBe(true);
    }
    /* 容器骨架钉：template 含 settings+mappings 双层；index_patterns 数组形态 */
    const tpl = items.find(i => i.label === 'template')!;
    expect(tpl.insertText).toContain('"settings"');
    expect(tpl.insertText).toContain('"mappings"');
    expect(items.find(i => i.label === 'index_patterns')!.insertText).toContain('["${1:');
  });
  it('MAPPING_TYPES 覆盖核心类型', () => {
    for (const t of ['keyword', 'text', 'long', 'integer', 'double', 'date', 'boolean', 'object', 'nested', 'ip']) {
      expect(MAPPING_TYPES).toContain(t);
    }
  });
});

describe('lineIndentAt / reindentSnippet（snippet 缩进适配）', () => {
  it('lineIndentAt 取 offset 所在行前导空白；首行非空白开头返回空', () => {
    const doc = '{\n    "a"\n}';
    expect(lineIndentAt(doc, 7)).toBe('    ');
    expect(lineIndentAt(doc, 1)).toBe('');
  });
  it('reindentSnippet 换行叠加缩进；空缩进原样返回（单行文档零影响回归）', () => {
    expect(reindentSnippet('a\n  b\nc', '  ')).toBe('a\n    b\n  c');
    expect(reindentSnippet('a\n  b\nc', '')).toBe('a\n  b\nc');
    expect(reindentSnippet('单行无换行', '    ')).toBe('单行无换行');
  });
});

describe('commaAffixes（2.6.0 逗号自适应）', () => {
  /* 判定表（spec §3.1）：prefix 看 range 起点左邻（跳空白），suffix 看 range 终点右邻（跳空白）。
     宁缺毋滥：suffix 只在确证后跟兄弟键（'"'）时补，绝不制造 trailing comma。 */
  it.each([
    // [doc, start, end, prefix, suffix, 备注]
    ['{', 1, 1, '', '', '文首/{后 → 双无'],
    ['{ ', 2, 2, '', '', '左邻 { 跳空白'],
    ['{\n  ', 4, 4, '', '', '左邻 { 跨行跳空白'],
    ['{,', 2, 2, '', '', '左邻 , → 无前逗号（第二键位）'],
    ['{"a": 1, ', 9, 9, '', '', '左邻 , 后缀无（EOF）'],
    ['{"a": 1 ', 8, 8, ',', '', '左邻字面量 → 前逗号（漏敲补）'],
    ['{"a": {} ', 9, 9, ',', '', '左邻 } → 前逗号'],
    ['{"a": [] ', 9, 9, ',', '', '左邻 ] → 前逗号'],
    ['{"a": "x" ', 10, 10, ',', '', '左邻闭合串 → 前逗号'],
    ['{ }', 1, 2, '', '', '右邻 } → 无后逗号'],
    ['{ ]', 1, 2, '', '', '右邻 ] → 无后逗号（残缺容忍）'],
    ['{ "b": 2 }', 1, 2, '', ',', '右邻 " → 后逗号（后跟兄弟键）'],
    ['{\n  "b": 2\n}', 1, 2, '', ',', '右邻 " 跨行跳空白'],
    ['{"a": 1 "b": 2}', 8, 8, ',', ',', '漏敲逗号中间插入 → 前后双补'],
    ['{ "b"', 1, 2, '', ',', '右邻 " 即补（即使文档残缺）'],
    ['{ x', 1, 2, '', '', '右邻残缺（非引号）→ 不猜'],
  ])('commaAffixes(%j, %i, %i) → {prefix:%j, suffix:%j}', (doc, s, e, prefix, suffix) => {
    expect(commaAffixes(doc as string, s as number, e as number))
      .toEqual({ prefix, suffix });
  });

  it('跳过注释：左扫落到注释前逗号、右扫跳过块注释见兄弟键（offset 逐字符复算）', () => {
    // doc = '{"a": 1, // 备注\n'：'{'0 '"'1 'a'2 '"'3 ':'4 ' '5 '1'6 ','7 ' '8 '/'9 '/'10 ' '11 '备'12 '注'13 '\n'14，
    // 光标在换行后 = offset 15（doc.length）。左扫跳过 '// 备注' 落到 ',' → prefix ''（第二键位，不补前逗号）。
    expect(commaAffixes('{"a": 1, // 备注\n', 15, 15)).toEqual({ prefix: '', suffix: '' });
    // doc = '{ /* c */ "b": 2 }'：'{'0 ' '1 '/'2 '*'3 ' '4 'c'5 ' '6 '*'7 '/'8 ' '9 '"'10，
    // start=1、end=2（{ 后光标）。右扫跳过块注释见 '"b"' 起始引号 → suffix ','。
    expect(commaAffixes('{ /* c */ "b": 2 }', 1, 2)).toEqual({ prefix: '', suffix: ',' });
  });
});

describe('2.6.0 判定精度：range-op / exists-key', () => {
  it.each([
    /* range → 字段名 → { 三层 → range-op（spec §3.2 规则 3） */
    ['{"query": {"range": {"date": {', 'range-op'],
    ['{"query": {"range": {"date": {"gte": "x", ', 'range-op'],
    /* range 值对象键位（字段名位）仍是 field 档——不抢 */
    ['{"query": {"range": {', 'field'],
    /* 嵌套 bool/filter 内 range 同出 range-op（尾三帧判定免疫嵌套深度） */
    ['{"query": {"bool": {"filter": [{"range": {"date": {', 'range-op'],
    /* exists 值对象键位 → exists-key（钉死 field，不再出字段名档） */
    ['{"query": {"exists": {', 'exists-key'],
    ['{"query": {"bool": {"filter": [{"exists": {', 'exists-key'],
  ])('dslContext(%j) → %s', (doc, kind) => {
    expect(E(doc as string).kind).toBe(kind);
  });
});

describe('2.6.0 聚合上下文（spec §3.2）', () => {
  it.each([
    ['{"aggs": {', 'agg-name'],
    ['{"aggs": {"by_user": {', 'agg-type'],
    ['{"aggregations": {"a": {', 'agg-type'],
    /* aggregations 别名容器级 → agg-name；兄弟实例位（前一实例闭合后）→ agg-name */
    ['{"aggregations": {', 'agg-name'],
    ['{"aggs": {"a": {"terms": {}}, ', 'agg-name'],
    /* lastKey 遮蔽已知边界（评审 M1 pin）：实例值键位在最近完成键为 aggs 时落 none——
       方向安全（不出档非出错档），主流程（snippet 引导类型先于嵌套 aggs）不触达；
       若需修复：命中帧即栈顶时向外回退找次近 aggs 帧再分档 */
    ['{"aggs": {"a": {"aggs": {}, ', 'none'],
    /* 嵌套：实例值内再 aggs → 容器键位回 agg-name；其值对象键位 agg-type */
    ['{"aggs": {"a": {"terms": {"field": "x"}, "aggs": {', 'agg-name'],
    ['{"aggs": {"a": {"aggs": {"b": {', 'agg-type'],
    /* 根层其他容器不受影响 */
    ['{"sort": [', 'none'],
    ['{"query": {', 'query-type'],
  ])('dslContext(%j) → %s', (doc, kind) => {
    expect(E(doc as string).kind).toBe(kind);
  });
});
