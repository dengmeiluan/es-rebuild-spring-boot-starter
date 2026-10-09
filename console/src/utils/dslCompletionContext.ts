/* W4 Task 12：DSL 补全上下文判定——从文首扫到 offset，维护 {}/[] 栈与每层最近键名。
   非严格解析（残缺文档容忍）：栈不平衡/半截字符串按已扫描信息兜底。
   root→根层键补全；query-type→查询类型 snippet；field→叶子子句字段名位（clause=子句名）；
   range-op→range 字段值对象内操作符位（gte/gt/lt/lte）；exists-key→exists 键位钉死 "field"；
   agg-name→aggs 容器键位（实例自由命名）；agg-type→实例值对象键位（聚合类型骨架）；none→不出层。 */
import { SETTINGS_CATALOG } from './indexSettingsCatalog';
/* 五百三十八批：字段位类型亲和置顶序的语义源（五百三十批下沉 queryAstOps 的单一出处，
   本链此前未消费——sqlCompletion/ClauseNode 同源，不另起算子映射表防漂移）
   554 批：keyword/number 两族改吃 queryAstOps 族表单源（KEYWORD_VALUE_TYPES 三员同值；
   number 滤 token_count 保持九口径——AFFINITY 族序零变，dslValueTiers545 行为锁保形） */
import { typePriorityForOp, KEYWORD_VALUE_TYPES, NUMERIC_VALUE_TYPES } from './queryAstOps';

type DslCtx = { kind: 'root' } | { kind: 'query-type' } | { kind: 'field'; clause: string }
  | { kind: 'range-op' } | { kind: 'exists-key' }
  | { kind: 'agg-name' } | { kind: 'agg-type' }
  | { kind: 'array-elem-key'; owner: string } | { kind: 'none' };

export const QUERY_SNIPPETS: Record<string, string> = {
  match: '"match": {\n  "${1:field}": "${2:value}"\n}',
  match_phrase: '"match_phrase": {\n  "${1:field}": "${2:value}"\n}',
  term: '"term": {\n  "${1:field}": "${2:value}"\n}',
  terms: '"terms": {\n  "${1:field}": [${2:value}]\n}',
  range: '"range": {\n  "${1:field}": {\n    "gte": "${2:now-1d/d}",\n    "lt": "${3:now/d}"\n  }\n}',
  exists: '"exists": {\n  "field": "${1:field}"\n}',
  wildcard: '"wildcard": {\n  "${1:field}": "${2:pref*}"\n}',
  bool: '"bool": {\n  "must": [\n    ${0}\n  ],\n  "filter": [],\n  "should": [],\n  "must_not": []\n}',
};
/* 2.6.0 range-op 档（spec §3.2）：range 字段值对象内键位，日期占位默认值 */
export const RANGE_OPS: Record<string, string> = {
  gte: 'now-1d/d', gt: 'now-1d/d', lt: 'now/d', lte: 'now/d',
};
/* 2.6.0 聚合骨架（spec §4.5）：agg-type 档候选。detail 一句话（H 发现性）。
   末键 aggs 是嵌套聚合入口（实例值对象内再开容器）。 */
export const AGG_SNIPPETS: Record<string, { text: string; detail: string }> = {
  terms:          { text: '"terms": {\n  "field": "${1:field}",\n  "size": ${2:10}\n}',                          detail: '分组统计（按字段值分桶）' },
  avg:            { text: '"avg": { "field": "${1:field}" }',                                                         detail: '平均值' },
  sum:            { text: '"sum": { "field": "${1:field}" }',                                                         detail: '求和' },
  min:            { text: '"min": { "field": "${1:field}" }',                                                         detail: '最小值' },
  max:            { text: '"max": { "field": "${1:field}" }',                                                         detail: '最大值' },
  stats:          { text: '"stats": { "field": "${1:field}" }',                                                       detail: 'count/min/max/avg/sum 一次全出' },
  cardinality:    { text: '"cardinality": { "field": "${1:field}" }',                                                 detail: '去重计数' },
  date_histogram: { text: '"date_histogram": {\n  "field": "${1:dateField}",\n  "calendar_interval": "${2|1d,1h,1w,1M|}"\n}', detail: '时间直方图（按间隔分桶）' },
  date_range:     { text: '"date_range": {\n  "field": "${1:dateField}",\n  "ranges": [\n    { "from": "${2:now-7d/d}", "to": "${3:now/d}" }\n  ]\n}', detail: '时间范围分桶' },
  top_hits:       { text: '"top_hits": {\n  "size": ${1:3},\n  "sort": [\n    { "${2:field}": { "order": "${3:desc}" } }\n  ]\n}', detail: '每桶取 TopN 文档' },
  aggs:           { text: '"aggs": {\n  ${0}\n}',                                                                       detail: '嵌套子聚合' },
};
export const ROOT_KEYS = ['query', 'sort', 'aggs', '_source', 'highlight', 'from', 'size', 'track_total_hits'];
/* 2.6.0 root 键骨架（spec §4.2）：每键定制值形态，detail 一句话（H 发现性）。
   query/aggs/highlight 对象容器；sort 数组（多字段通用）；_source 数组；from/size 数字；track_total_hits choice。 */
export const ROOT_KEY_SNIPPETS: Record<string, { text: string; detail: string }> = {
  query:            { text: '"query": {\n  ${0}\n}',                                        detail: '查询主体' },
  sort:             { text: '"sort": [\n  { "${1:field}": { "order": "${2|desc,asc|}" } }\n]', detail: '排序' },
  aggs:             { text: '"aggs": {\n  ${0}\n}',                                         detail: '聚合统计' },
  _source:          { text: '"_source": ["${1:field}"]',                                    detail: '返回字段裁剪' },
  highlight:        { text: '"highlight": {\n  "fields": {\n    "${1:field}": {}\n  }\n}',  detail: '高亮' },
  from:             { text: '"from": ${1:0}',                                               detail: '分页起点' },
  size:             { text: '"size": ${1:10}',                                              detail: '分页大小' },
  track_total_hits: { text: '"track_total_hits": ${1|true,false|}',                         detail: '精确总数统计' },
};
/** 叶子查询子句（值位是字段名对象）。
    2.6.0：exists 移出——其键位钉死 "field"（exists-key 档），出字段名档是语义误导 */
const FIELD_CLAUSES = new Set(['match', 'match_phrase', 'term', 'terms', 'range', 'wildcard', 'prefix', 'fuzzy', 'regexp']);

/* 五百四十六批：数组键链白名单位（对标 Kibana sort/_source 补全）。两类白名单各管一个位：
   - 元素对象键位（"sort": [{ "<光标" }]）：数组属主键 ∈ DSL_ARRAY_OBJKEY_CHAINS（本批=sort，
     排序字段位；top_hits 等嵌套 sort 同构命中），dslContext 出 array-elem-key 档；
   - 元素串位（"_source": ["<光标"]）：数组属主键 ∈ DSL_ARRAY_ELEM_CHAINS（本批=_source，
     返回字段裁剪），dslKeyGuard 首元素位按白名单回传键链、续元素位走既有 arrayElem 口，
     消费侧出 fields() 字段候选。
   白名单外数组（terms 值/must/ids/filter 元素等）维持既有压制零增量——540/543 契约钉的是
   值位 regime 与 terms 值数组元素位（dslValueTiers540 C 段/544 C 段既有断言），键链白名单
   是新增位，两既有钉面不沾。⚠ dslArrayElemFieldAt 本体零改动（dslValueTiers544 B 段把
   ('_source', null)→null 钉死，_source 走本白名单新轨，不共函数）。 */
const DSL_ARRAY_OBJKEY_CHAINS = new Set(['sort']);
export const DSL_ARRAY_ELEM_CHAINS = new Set(['_source']);

type Frame = { type: '{' | '['; lastKey: string | null };

/* 引号是否被转义：紧邻的反斜杠 run 长度为奇数才算转义（偶数含 0 → \\ 自身是转义反斜杠，其后的引号仍关闭字符串）。
   单一真源：luceneContext / MonacoEditor（dslKeyGuard、scanStringEnd）复用，口径不各自重写。 */
export function isEscapedQuote(s: string, j: number): boolean {
  let n = 0;
  for (let k = j - 1; k >= 0 && s[k] === '\\'; k--) n++;
  return n % 2 === 1;
}

/** 注释跳过：text[i]==='/' 且非字符串内时，行注释跳到行尾、块注释跳到结束标记之后。
   返回注释结束后的下一个下标（exclusive，即继续扫描的起点）；非注释返回 -1。 */
export function commentEnd(text: string, i: number): number {
  if (i < 0 || i + 1 >= text.length || text[i] !== '/') return -1;
  if (text[i + 1] === '/') {
    let j = i + 2;
    while (j < text.length && text[j] !== '\n') j++;
    return j;
  }
  if (text[i + 1] === '*') {
    let j = i + 2;
    while (j + 1 < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++;
    return j + 2;
  }
  return -1;
}

export function dslContext(doc: string, offset: number): DslCtx {
  const text = doc.slice(0, Math.max(0, Math.min(offset, doc.length)));
  const stack: Frame[] = [];
  let inStr = false; let curKey = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '"' && !isEscapedQuote(text, i)) {
        inStr = false;
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] === ':' && stack.length) stack[stack.length - 1].lastKey = curKey;
      } else curKey += ch;
      continue;
    }
    const cEnd = commentEnd(text, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }  // for 的 i++ 会让下次从 cEnd 开始
    if (ch === '"') { inStr = true; curKey = ''; continue; }
    if (ch === '{') stack.push({ type: '{', lastKey: null });
    else if (ch === '[') stack.push({ type: '[', lastKey: null });
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (!stack.length) return { kind: 'root' };
  const keys = stack.map(f => f.lastKey);
  const qIdx = keys.lastIndexOf('query');
  /* 在 query 内 ⟺ 某层帧 lastKey='query' 且其上方还有帧（query 值容器未闭合）。
     qIdx 即栈顶 → query 值已闭合（或尚在值位前），光标回到 query 所在层。 */
  const inQuery = qIdx >= 0 && qIdx < stack.length - 1;
  if (!inQuery) {
    /* 2.6.0 聚合上下文（spec §3.2）：lastIndexOf 取最近 aggs/aggregations 帧——嵌套聚合天然支持。
       innerA.length===1 → aggs 容器键位（agg-name，实例自由命名）；
       ===2 → 实例值对象键位（agg-type，聚合类型骨架）。 */
    const aIdx = Math.max(keys.lastIndexOf('aggs'), keys.lastIndexOf('aggregations'));
    if (aIdx >= 0 && aIdx < stack.length - 1) {
      const innerA = stack.slice(aIdx + 1);
      if (innerA.length === 1 && innerA[0].type === '{') return { kind: 'agg-name' };
      if (innerA.length === 2 && innerA[1].type === '{') return { kind: 'agg-type' };
    }
    /* 五百四十六批：数组元素对象键位（键链白名单位）——栈顶 { 的下层是 [ 数组帧、数组帧属主键
       ∈ DSL_ARRAY_OBJKEY_CHAINS（本批=sort，排序字段键位；top_hits 等嵌套 sort 同构命中）。
       白名单外数组（must/filter 等元素对象）不在此出层，既有 query-type/field 口径零变化；
       sort 元素对象内再开对象（"order": 位）栈顶下层是 { 不是 [，不命中——540 钉 none 面不沾。 */
    if (stack.length >= 3) {
      const topF = stack[stack.length - 1];
      const arrF = stack[stack.length - 2];
      const ownerKey = stack[stack.length - 3].lastKey;
      if (topF.type === '{' && arrF.type === '[' && ownerKey && DSL_ARRAY_OBJKEY_CHAINS.has(ownerKey)) {
        return { kind: 'array-elem-key', owner: ownerKey };
      }
    }
    /* 仅剩根帧 → 根层键位（query 闭合后回根层同口径）；更深但不在 query/aggs → 不出层 */
    return stack.length === 1 && stack[0].type === '{' ? { kind: 'root' } : { kind: 'none' };
  }
  /* range-op ⟺ range → 字段名 → { 三层（inner 尾三帧：range帧/字段帧/栈顶{）——
     操作符位出 gte/gt/lt/lte，替换旧「兜底 query-type」的误导出档 */
  const inner = stack.slice(qIdx + 1);
  if (inner.length >= 3) {
    const rangeFrame = inner[inner.length - 3];
    const fieldFrame = inner[inner.length - 2];
    const top = inner[inner.length - 1];
    if (top.type === '{' && rangeFrame.lastKey === 'range' && fieldFrame.lastKey) {
      return { kind: 'range-op' };
    }
  }
  /* 字段名位 ⟺ 栈顶是 { 且紧邻下层帧的最近键是叶子子句——栈顶即该子句的值对象。
     不看栈顶自身 lastKey：已填字段名（'match:{"title":"x", |'）不丢 field 上下文 */
  if (inner.length >= 2) {
    const clauseFrame = inner[inner.length - 2];
    const top = inner[inner.length - 1];
    if (top.type === '{' && clauseFrame.lastKey && FIELD_CLAUSES.has(clauseFrame.lastKey)) {
      return { kind: 'field', clause: clauseFrame.lastKey };
    }
    /* exists-key：exists 值对象键位钉死 "field"（2.6.0 语义纠错，spec §3.2 规则 4） */
    if (top.type === '{' && clauseFrame.lastKey === 'exists') {
      return { kind: 'exists-key' };
    }
  }
  return { kind: 'query-type' };
}

/* 五百三十八批：DSL 字段位算子→类型亲和置顶序（纯函数，零 UI 变化——只调序不改候选集）。
   typePriorityForOp 的置顶档按「族」描述（text/keyword/number/date…），族展开为具体 mapping
   类型供字段清单 rank：族表对齐本仓既有口径——数值族九种（LuceneInput NUMERIC_TYPES 同表）、
   keyword 族含 wildcard（queryAstOps.opsForType keyword||wildcard 同分支）、date 族含
   date_nanos（MAPPING_TYPES 在册）；表外键兜底原样进序（typePriorityForOp 将来直出具体类型不破）。
   field 档候选按 ctx.clause（该子句值位同级 op 键）取亲和序：命中类型排前（保 prio 原序），
   未命中垫底（同档保原序）；无类型倾向算子 prio 空 → 原序直通。 */
const AFFINITY_FAMILIES: Record<string, string[]> = {
  text: ['text', 'annotated_text'],
  /* 554 批：两族改吃 queryAstOps 单源（值与原 literal 逐字同形）——keyword 三员直用；
     number 九口径=十口径滤 token_count（分词计数无 range 精确语义，AFFINITY 序零变） */
  keyword: KEYWORD_VALUE_TYPES,
  number: NUMERIC_VALUE_TYPES.filter(t => t !== 'token_count'),
  date: ['date', 'date_nanos'],
  boolean: ['boolean'],
  ip: ['ip'],
};

/** 子句算子 → 字段位置顶具体类型序（typePriorityForOp 族展开；无类型倾向算子返回 []） */
export function dslFieldAffinityTypes(op: string): string[] {
  const out: string[] = [];
  for (const fam of typePriorityForOp(op)) {
    for (const t of AFFINITY_FAMILIES[fam] || [fam]) if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** 字段候选按当前子句算子的类型亲和度置顶（稳定排序：命中亲和类型排前且保持 prio 原序，
    同档/未命中保原序——只改序不改候选集；exists 等无倾向算子原序直通） */
export function orderFieldsByClauseOp<T extends { type: string }>(fields: T[], clause: string): T[] {
  const prio = dslFieldAffinityTypes(clause);
  const rank = (t: string) => { const i = prio.indexOf(t); return i === -1 ? prio.length : i; };
  return fields
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.type) - rank(b.f.type) || a.i - b.i)
    .map(x => x.f);
}

/* 五百四十批：DSL 字段位算子→类型置顶序（原始序版）——MonacoEditor 本地 orderFieldsByType
   原样收口进册（原地 diff 裁定：与 orderFieldsByClauseOp 语义**有差**，不合并）。
   本函数直消费 typePriorityForOp 的原始序、不做亲和族展开：term 位 type='wildcard'
   字段不命中（keyword 本名独占置顶）、range 位 date_nanos 不命中（date 本名才命中）；
   orderFieldsByClauseOp 走 dslFieldAffinityTypes 族展开，两版各有消费面。
   排序稳定性/未知算子行为与族展开版逐字节同构：map-index 稳定排序、
   prio 空（exists/未知算子）→ rank 恒 0 → 原序直通。 */
export function orderFieldsByTypeForOp<T extends { type: string }>(fields: T[], op: string): T[] {
  const prio = typePriorityForOp(op);
  const rank = (t: string) => { const i = prio.indexOf(t); return i === -1 ? prio.length : i; };
  return fields
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.type) - rank(b.f.type) || a.i - b.i)
    .map(x => x.f);
}

/* 五百四十批：DSL 值位类型档静态候选（date/ip 两档）——语义平移自 sqlCompletion.VAL_FORMAT_HINTS
   同名档（date→date-math、ip→点分字面）与 LuceneInput 538 批 DATE/IP_HINTS 先例；
   只提示格式不约束输入，任意值仍可手输。表外类型不入表=消费侧维持既有压制。
   五百四十三批：本表**保持 date/ip 两档零变动**——dslValueTiers540 B 段把表内容钉死（keyword/
   boolean/long/integer/double toBeUndefined）、C 段把 term/keyword 与 range/数值 值位压制钉死，
   且 540 记档「date-math·ip 外值形态（产品裁决）」：':' 值串位的类型档 regime 冻结。
   本批 keyword/数值/boolean 形态档落姊妹表 DSL_ARRAY_ELEM_TYPE_HINTS（见下），仅数组元素位
   链路消费；540 契约将来演进放开后两表可并。
   五百五十八批：随迁翻案收编 date_nanos + geo_point 两档（dslValueTiers540 B 段 toBeUndefined
   负锁随迁注记翻案，557 批 root-bare-clause 翻案同款先例）——姊妹面 546/547/552/554 批已四批
   扩档（date_nanos≡date 族、geo_point '纬度,经度'），本表的 540 收窄 regime 不再成立，
   detail 与 values 自 sqlCompletion VAL_FORMAT_HINTS 同名档逐字平移；仍只提示格式不约束输入。 */
export const DSL_VALUE_TYPE_HINTS: Record<string, { detail: string; values: string[] }> = {
  date: { detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] },
  date_nanos: { detail: 'date-math 格式提示 · date_nanos', values: ['now-1d/d', 'now-1h/h'] },
  ip: { detail: '字面提示 · ip', values: ['192.168.0.1'] },
  geo_point: { detail: '字面提示 · geo_point', values: ['40.71,-74.01'] },
};

/* 五百四十三批：数组元素位形态档（DSL_VALUE_TYPE_HINTS 的姊妹表，仅 terms 值数组续元素位链路
   消费——dslKeyGuard arrayElem 键链口）。keyword 族（含 wildcard——queryAstOps keyword||wildcard
   同分支口径）通配形态 pref*（wildcard 语义，QUERY_SNIPPETS wildcard 骨架 "${2:pref*}" 同形
   先例）、数值族八类型字面数字（整型 1/浮点 1.5，整浮分档只提示形态；AFFINITY number 族第九种
   unsigned_long 本批未点名不入表）、boolean true/false；detail 与 date/ip 档同形
   （'字面提示 · <type>'）。只提示形态不约束输入，任意值仍可手输。 */
export const DSL_ARRAY_ELEM_TYPE_HINTS: Record<string, { detail: string; values: string[] }> = {
  keyword: { detail: '字面提示 · keyword', values: ['pref*'] },
  wildcard: { detail: '字面提示 · wildcard', values: ['pref*'] },
  long: { detail: '字面提示 · long', values: ['1'] },
  integer: { detail: '字面提示 · integer', values: ['1'] },
  short: { detail: '字面提示 · short', values: ['1'] },
  byte: { detail: '字面提示 · byte', values: ['1'] },
  double: { detail: '字面提示 · double', values: ['1.5'] },
  float: { detail: '字面提示 · float', values: ['1.5'] },
  half_float: { detail: '字面提示 · half_float', values: ['1.5'] },
  scaled_float: { detail: '字面提示 · scaled_float', values: ['1.5'] },
  boolean: { detail: '字面提示 · boolean', values: ['true', 'false'] },
};

/** 五百四十批：值位字段解析（dslKeyGuard 键链 → 字段路径；非字段值位返回 null 维持压制）。
    叶子子句直挂值位（"term": { "<vk>": "<光标" ）→ 字段=vk；
    range 操作符值位（"range": { "<pk>": { "<vk>": "<光标 ）→ 字段=pk，vk 限 RANGE_OPS 四操作符
    （time_zone/format 等元键出 date-math 候选是误导）。
    aggs 的 terms/date_histogram 与查询子句撞名：解析层只出「形态上的字段名」，是否真字段
    由消费侧 fields() 精确查表把关（interval 等实例键查无此字段 → 压制）。 */
export function dslValueFieldAt(valueKey: string, parentKey: string | null, grandKey: string | null): string | null {
  if (parentKey && FIELD_CLAUSES.has(parentKey)) return valueKey;
  if (grandKey === 'range' && RANGE_OPS[valueKey] !== undefined) return parentKey;
  return null;
}

/** 五百四十三批：数组元素位字段解析（dslValueFieldAt 的姊妹——值数组的元素串位没有「当前键」，
    字段=数组属主键。"terms": { "<field>": [ "x", "<光标" ）→ ownerKey（数组的属主键）∈ 叶子
    子句（FIELD_CLAUSES 同表）且 elemKey 非空 → 字段=elemKey；must/ids/_source/sort 等非字段
    值数组 → null 维持压制。与 dslValueFieldAt 同一哲学：解析层只出「形态上的字段名」，是否真
    字段由消费侧 fields() 精确查表把关。首元素位（'[' 左邻）是 dslValueTiers540 契约 spec 既有
    断言钉死的压制面，不在本批解锁面——dslKeyGuard 只对续元素位（',' 左邻且栈顶 '['）回传键链。 */
export function dslArrayElemFieldAt(elemKey: string | null, ownerKey: string | null): string | null {
  if (elemKey && ownerKey && FIELD_CLAUSES.has(ownerKey)) return elemKey;
  return null;
}

/* W6：DevTools body 端点语义分级——bodyKind 判定 + settings/mapping 档数据源。
   纯函数零请求；settings 档复用 W1 SETTINGS_CATALOG（带中文说明）。
   五百二十四批：增 'doc' 档——文档体（GET/PUT /idx/_doc/1、_create、_update、_source 端点）
   键位零候选（_source 字段名自由，出 root 查询键骨架是误导）、仅 field 值位白名单出字段候选。
   五百二十五批：增 'analyze' 档——_analyze body（视图侧 bodyKind: () => 'analyze' 直传，
   不吃 bodyKindForPath 分派）；键位出 ANALYZE_KEY_SNIPPETS 八键骨架，
   值位分派见 MonacoEditor computeSuggestions analyze 分支。 */
export type BodyKind = 'search' | 'settings' | 'mapping' | 'template' | 'doc' | 'analyze' | 'none';

/* 五百二十五批：_analyze body 键骨架（analyze 档键位候选，snippet+detail 与 W6 三档同形态）。
   analyzer/field 互斥（二选一）；filter/char_filter 是数组骨架。 */
export const ANALYZE_KEY_SNIPPETS: Record<string, { text: string; detail: string }> = {
  analyzer:    { text: '"analyzer": "${1:standard}"',              detail: '指定分词器（内置名或自定义组件名）' },
  text:        { text: '"text": "${1:待分词文本}"',                  detail: '待分词文本（与 field 二选一）' },
  field:       { text: '"field": "${1:field}"',                    detail: '用该字段的分词链分词（与 analyzer 二选一）' },
  tokenizer:   { text: '"tokenizer": "${1:standard}"',             detail: '覆盖 tokenizer（内置名或自定义组件名）' },
  filter:      { text: '"filter": [\n  "${1:lowercase}"\n]',       detail: '覆盖 filter 链（数组）' },
  char_filter: { text: '"char_filter": [\n  "${1:html_strip}"\n]', detail: '覆盖 char_filter 链（数组）' },
  normalizer:  { text: '"normalizer": "${1:lowercase}"',           detail: 'keyword 字段的归一器' },
  explain:     { text: '"explain": ${1|true,false|}',              detail: '输出分词过程明细（每个 token 经过的组件）' },
};

/* 五百二十五批：analyzer/search_analyzer/normalizer/tokenizer 值位内置清单（analyze 档）。
   ik_* 拆两个实名（console 目标集群标配插件分词器）；实名自定义组件由视图侧
   dslAssist.analyzers() 通道并入（与 mapping 档 524+1 通道同一闭包契约），缺席=纯内置。 */
export const BUILTIN_ANALYZERS = ['standard', 'simple', 'whitespace', 'stop', 'keyword', 'pattern', 'fingerprint', 'ik_max_word', 'ik_smart'];

/* 五百六十批：analysis 内置组件三张同族表（与 BUILTIN_ANALYZERS 同位置同风格——
   AnalyzerLab 自定义组合 tokenizer/char_filter/filter 三输入 datalist 候选源，各归其位，
   不再与 analyzer 名混表）。只做提示零请求；缺席=自定义组件名（视图侧 analyzers() 通道
   并入先例同轨，后续消费方照此并）。ik 族照附（插件分词组件，console 目标集群标配）。 */
export const BUILTIN_TOKENIZERS = ['standard', 'keyword', 'whitespace', 'letter', 'lowercase', 'ngram', 'edge_ngram', 'path_hierarchy', 'pattern', 'ik_max_word', 'ik_smart'];
export const BUILTIN_CHAR_FILTERS = ['html_strip', 'mapping', 'pattern_replace'];
export const BUILTIN_TOKEN_FILTERS = ['lowercase', 'stop', 'asciifolding', 'stemmer', 'synonym', 'synonym_graph', 'trim', 'unique', 'truncate', 'word_delimiter', 'shingle', 'snowball', 'ik_max_word', 'ik_smart'];

/* 五百六十二批：analysis 内置组件名中文释义表（AnalyzerLab 四 datalist option 挂 title——
   「候选只有英文名不知是干嘛的」根治面；esEnumZh 面向字段类型不掺 analysis 组件，本表
   随四张 BUILTIN_* 同放此处）。键覆盖 BUILTIN_ANALYZERS/TOKENIZERS/CHAR_FILTERS/
   TOKEN_FILTERS 四表全员；表外键回落空串（消费侧 `|| ''`，缺席零扰动零误挂）。 */
export const ANALYZER_COMPONENT_ZH: Record<string, string> = {
  standard: '标准分词器：Unicode 词边界切分，中英文通用',
  simple: 'simple：非字母字符切分并转小写',
  whitespace: 'whitespace：仅按空白切分，不做小写化',
  stop: 'stop：小写化并移除停用词（the/a/…）',
  keyword: 'keyword：整串作为单个词元，不切分',
  pattern: 'pattern：按正则匹配到的分隔切分',
  fingerprint: 'fingerprint：排序去重后拼接成单词元（指纹）',
  ik_max_word: 'ik 最细粒度切分：尽可能多地输出组合词',
  ik_smart: 'ik 智能切分：粗粒度，歧义最少',
  letter: 'letter：非字母字符切分',
  lowercase: 'lowercase：非字母切分并转小写（tokenizer）',
  ngram: 'ngram：滑动窗口切出任意 n 元片段',
  edge_ngram: 'edge_ngram：只从前缀方向切 n 元（前缀搜索）',
  path_hierarchy: 'path_hierarchy：按路径分隔符切层级（a/b/c → a、a/b、a/b/c）',
  html_strip: 'html_strip：剥除 HTML 标签只留文本',
  mapping: 'mapping（char_filter）：按映射表替换指定字符串',
  pattern_replace: 'pattern_replace：按正则定位并替换片段',
  asciifolding: 'asciifolding：带音标字符转 ASCII（é → e）',
  stemmer: 'stemmer：词干化（还原词的原形）',
  snowball: 'snowball：Snowball 算法词干化',
  synonym: 'synonym：同义词归一（单词形态）',
  synonym_graph: 'synonym_graph：图结构同义词（支持多词同义）',
  trim: 'trim：去掉词元首尾空白',
  unique: 'unique：去掉重复词元',
  truncate: 'truncate：超长词元截断',
  word_delimiter: 'word_delimiter：按大小写/数字/连字符边界拆分复合词',
  shingle: 'shingle：相邻词元组合成词组（bigram 等）',
};

/* 五百六十批：analyzer 高频参数中文词表（AnalysisSettingsView 条目展开参数释义串消费，
   「analysis 组件参数只见英文名不知作用」根治面）。键=自定义组件配置体高频出现的参数名；
   词表外键回落空串（消费侧 filter 后拼串，零扰动零误挂）。 */
export const ANALYSIS_PARAM_ZH: Record<string, string> = {
  analyzer: '分词器（分析入口，与 tokenizer 二选一）',
  search_analyzer: '查询侧分词器（缺省沿用索引侧 analyzer）',
  tokenizer: '切词器（把字符流切成词元）',
  filter: '词元过滤器链（数组，按序生效）',
  char_filter: '字符过滤器链（数组，切词前改写字符流）',
  normalizer: '归一器（keyword 字段的规范化管线）',
  max_token_length: '单个词元最大长度（超长切分）',
  synonyms_path: '同义词库路径（相对 config/）',
  stopwords: '停用词清单（_none_ 关闭或语言名）',
  stopwords_path: '停用词文件路径（相对 config/）',
  mapping: '字符映射表（mapping 型 char_filter 的替换对）',
  aliases: '词干规则别名（stemmer/snowball 的同义形态）',
  type: '组件类型（custom 或内置名）',
  preserve_original: '保留原词（词干/去重等过滤器是否保留原始词元）',
  /* 五百六十一批：参数词表扩容（ngram/edge_ngram/shingle/pattern_replace/stemmer 高频参数，
     AnalysisSettingsView 条目展开释义串同通道消费；表外键回落空串零扰动） */
  min_gram: '最小词元长度（ngram/edge_ngram 切分下限）',
  max_gram: '最大词元长度（ngram/edge_ngram 切分上限）',
  pattern: '匹配正则（pattern_replace/pattern_capture 按它定位片段）',
  replacement: '替换串（pattern_replace 命中后的改写结果）',
  flags: '正则标志（CASE_INSENSITIVE / MULTILINE 等）',
  language: '词干化语言（stemmer/snowball，如 english）',
  stem_exclusion: '词干排除词表（在册词不做词干化）',
  max_shingle_size: '组合词元最大个数（shingle 拼接上限）',
  min_shingle_size: '组合词元最小个数（shingle 拼接下限）',
  separator: '组合词元连接符（shingle 默认空格）',
};

/** 端点 path → body 语义档。自由路径默认 search（补全只是建议，零降级）。 */
export function bodyKindForPath(rawPath: string): BodyKind {
  const p = (rawPath || '').split('?')[0].toLowerCase();
  if (p.includes('_bulk')) return 'none';
  /* doc 档四端点（五百二十四批）：带斜杠前缀防误伤——'_update/' 不吃 _update_by_query（后者是
     search 族，dslCompletionContext.spec 既有断言钉死），'/_source' 尾形态与 /_doc/1/_source 双保险 */
  if (p.includes('/_doc/') || p.includes('/_create/') || p.includes('/_update/') || p.includes('/_source')) return 'doc';
  if (p.includes('_settings')) return 'settings';
  if (p.includes('_mapping')) return 'mapping';
  return 'search';
}

/** 补全项统一形态：insertText 已是完整插入串（含引号/snippet 语法），provider 直接消费 */
export type AssistItem = { label: string; detail?: string; insertText: string; snippet?: boolean };

/* 五百二十四批：painless 字段访问提取（hover 用纯函数，Monaco 不初始化也可断言）。
   光标 offset 落在 doc['f'] / ctx['f'] 的 'f' 单引号串内（起始引号后到闭引号前，贴闭引号也算）
   → 返回 f；否则 null。左扫最近的开引号（遇 [ ] " 换行即断——painless 字段名不含引号、
   单行字面量），右扫闭引号同口径；前缀核对其前必为 '['，再往前的标识符须是 doc/ctx。 */
export function painlessFieldAt(doc: string, offset: number): string | null {
  const cursor = Math.max(0, Math.min(offset, doc.length));
  let start = -1;
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = doc[i];
    if (ch === "'") { start = i; break; }
    if (ch === '\n' || ch === '[' || ch === ']' || ch === '"') return null;
  }
  if (start < 0 || cursor <= start) return null;
  let end = -1;
  for (let j = cursor; j < doc.length; j++) {
    if (doc[j] === "'") { end = j; break; }
    if (doc[j] === '\n') return null;
  }
  if (end < 0) return null;
  if (start === 0 || doc[start - 1] !== '[') return null;
  let k = start - 2;
  while (k >= 0 && /\w/.test(doc[k])) k--;
  const ident = doc.slice(k + 1, start - 1);
  if (ident !== 'doc' && ident !== 'ctx') return null;
  return doc.slice(start + 1, end);
}

export function settingsKeyItems(): AssistItem[] {
  return SETTINGS_CATALOG.map(s => ({
    label: s.key,
    detail: `${s.desc}（例：${s.example}）`,
    insertText: '"' + s.key + '"',
  }));
}

export const MAPPING_TYPES = ['keyword', 'text', 'long', 'integer', 'short', 'byte', 'double', 'float',
  'half_float', 'date', 'date_nanos', 'boolean', 'ip', 'object', 'nested', 'flattened', 'geo_point', 'alias'];

export function mappingKeyItems(): AssistItem[] {
  return [
    { label: 'properties', detail: '字段映射集合', snippet: true,
      insertText: '"properties": {\n  "${1:field}": { "type": "${2:keyword}" }\n}' },
    { label: 'dynamic', detail: '动态映射策略（true/false/strict）', snippet: true,
      insertText: '"dynamic": "${1|true,false,strict|}"' },
    { label: 'type', detail: '字段类型', snippet: true,
      insertText: '"type": "${1|keyword,text,long,integer,double,date,boolean,ip,object,nested|}"' },
    { label: 'fields', detail: '多字段（子字段）', snippet: true,
      insertText: '"fields": {\n  "${1:sub}": { "type": "${2:keyword}" }\n}' },
  ];
}

/* snippet 缩进适配：monaco 多行 snippet 插入是字面量替换，不会叠加当前行缩进——
   深层嵌套位（如 must 数组内，8 列）选骨架后后续行塌到字面量固定 2/0 列（真机实锤）。
   统一口径：换行后叠加「range 起点行前导空白」，snippet 相对缩进保留。 */
/** 取 offset 所在行的前导空白（单行文档/行首非空白 → ''，消费处原样返回零影响） */
export function lineIndentAt(doc: string, offset: number): string {
  const lineStart = doc.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const m = /^[ \t]*/.exec(doc.slice(lineStart));
  return m ? m[0] : '';
}
/** snippet 后续行叠加缩进：\n → \n+indent；空缩进原样返回（单行文档不动字面量） */
export function reindentSnippet(text: string, indent: string): string {
  if (!indent) return text;
  return text.replace(/\n/g, '\n' + indent);
}

/* ux2 Task 6：index_template / component_template body 键档（TemplatesView editBody 用）。
   八键全 snippet 骨架——模板 body 键集封闭且层级固定，骨架比裸键名省事；
   component_template 同用（其 body={ template: {...} } 子集，容器骨架兼容）。 */
export function templateKeyItems(): AssistItem[] {
  return [
    { label: 'index_patterns', detail: '索引名匹配模式（新索引自动套用本模板）', snippet: true,
      insertText: '"index_patterns": ["${1:logs-*}"]' },
    { label: 'priority', detail: '模板优先级（多模板命中时大者胜）', snippet: true,
      insertText: '"priority": ${1:100}' },
    { label: 'template', detail: '模板主体容器（settings/mappings/aliases 都装在这里面）', snippet: true,
      insertText: '"template": {\n  "settings": {\n    "${1:number_of_shards}": "${2:1}"\n  },\n  "mappings": {\n    "properties": {\n      "${3:field}": { "type": "${4:keyword}" }\n    }\n  }\n}' },
    { label: 'settings', detail: '索引设置容器（number_of_shards/number_of_replicas 等）', snippet: true,
      insertText: '"settings": {\n  "number_of_shards": "${1:1}",\n  "number_of_replicas": "${2:1}"\n}' },
    { label: 'mappings', detail: '字段映射容器（properties 结构）', snippet: true,
      insertText: '"mappings": {\n  "properties": {\n    "${1:field}": { "type": "${2:keyword}" }\n  }\n}' },
    { label: 'aliases', detail: '索引别名容器（新索引自动挂别名）', snippet: true,
      insertText: '"aliases": {\n  "${1:alias}": {}\n}' },
    { label: 'composed_of', detail: '组合 component_template 名清单（按序叠加）', snippet: true,
      insertText: '"composed_of": ["${1:component-template}"]' },
    { label: '_meta', detail: '模板自定义元数据（用途/负责人等备注）', snippet: true,
      insertText: '"_meta": {\n  "${1:description}": "${2:用途说明}"\n}' },
  ];
}

/* 2.6.0 逗号自适应（spec §3.1）：补全 insertText 的前/后逗号由上下文定。
   prefix：range 起点左扫跳空白——'{'/'['/','/文首 → ''；其余（'}'/']'/闭合串/字面量）→ ','。
   suffix：range 终点右扫跳空白——'"'（后跟兄弟键）→ ','；'}'/']'/EOF/残缺 → ''（宁缺毋滥，绝不产 trailing comma）。
   调用方保证光标在键位（dslKeyGuard 已压值位/数组裸元素位），故 ':' 左邻落「其余补前逗号」分支不可达。
   JSONC 注释透明：左/右扫均跳过行注释与块注释（字符串内不算，见 commentEnd 调用前置 inStr）。 */
function prevCodeChar(doc: string, start: number): string {
  let left = '';
  let inStr = false;
  for (let i = 0; i < start; i++) {
    const ch = doc[i];
    if (inStr) {
      if (ch === '"' && !isEscapedQuote(doc, i)) { inStr = false; left = '"'; }
      continue;
    }
    const cEnd = commentEnd(doc, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (/\s/.test(ch)) continue;
    left = ch;
  }
  return left;
}
function nextCodeChar(doc: string, start: number): string {
  for (let i = start; i < doc.length; i++) {
    if (/\s/.test(doc[i])) continue;
    const cEnd = commentEnd(doc, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }
    return doc[i];
  }
  return '';
}
export function commaAffixes(doc: string, start: number, end: number): { prefix: string; suffix: string } {
  const left = prevCodeChar(doc, Math.max(0, start));
  const prefix = (left === '' || left === '{' || left === '[' || left === ',') ? '' : ',';
  const right = nextCodeChar(doc, Math.max(0, Math.min(end, doc.length)));
  const suffix = right === '"' ? ',' : '';
  return { prefix, suffix };
}
