/* W1：算子元数据注册表。form 指示 body 形态：
 'field' = {op:{field:…}} 单字段形态；'fields' = {op:{mainKey:…,fields:[…],…}} 多字段形态；
 'named' = {op:{fieldKey:'字段名',mainKey:…,…}} 具名字段键形态（query_string/percolate）；
 'none' = 无字段，主值直接挂 body（ids/script/wrapper）。
 wrap 指示 field 形态 inner 主值键：'value'（term 系）/ 'query'（match 系）/
 'none'（inner 整体即值，range/terms/对象值算子）。
 mainKey 是 fields/named/none 形态 body 顶层主值键（match_all/match_none 走既有特判豁免）。
 params 是具名常用参数 → ClauseNode 渲染具名控件；其余参数走「更多参数」递归键值表。 */
export interface ParamMeta { key: string; kind: 'number' | 'text' | 'boolean' | 'enum'; options?: string[] }
interface OpMeta {
  form: 'field' | 'fields' | 'named' | 'none';
  wrap?: 'value' | 'query' | 'none';
  valueKey?: string;   // wrap value/query 的主值键名覆盖（默认 'value'/'query'；span_term 用 'term'）
  mainKey?: string;
  fieldKey?: string;
  label: string;
  types?: string[];   // 适合的 mapping 类型组：text/keyword/number/date/boolean/ip
  params?: ParamMeta[];
}

/* 值类型族单源（本文件零依赖，可被 sqlCompletion/dslCompletionContext/
 LuceneInput 等四处 literal 同源消费——keyword 族三员即 sqlCompletion.KEYWORD_VALUE_TYPES
 原表逐字同形；数值族十口径=551/ sqlCompletion.NUMERIC_HINT_TYPES 与 LuceneInput
 NUMERIC_TYPES 原表逐字同形，含 token_count 分词计数数值语义） */
export const KEYWORD_VALUE_TYPES = ['keyword', 'wildcard', 'constant_keyword'];
export const NUMERIC_VALUE_TYPES = ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long', 'token_count'];

/* NUM 补 unsigned_long（数值族九口径——AFFINITY_FAMILIES.number/LuceneInput
 NUMERIC_TYPES/sqlCompletion 数值档同表九种，此前 opsForType 对 unsigned_long 字段只推荐 exists）
 本表改吃 NUMERIC_VALUE_TYPES 单源滤 token_count（分词计数无 term/range 精确语义，
 维持 ['exists'] 兜底——opsForType 行为零变） */
const NUM = NUMERIC_VALUE_TYPES.filter(t => t !== 'token_count');

export const OPS_META: Record<string, OpMeta> = {
  match_all: { form: 'none', label: '全部文档' },
  match_none: { form: 'none', label: '不匹配任何' },
  term: { form: 'field', wrap: 'value', label: '精确匹配', types: ['keyword', 'number', 'boolean', 'ip'],
    params: [{ key: 'boost', kind: 'number' }] },
  terms: { form: 'field', wrap: 'none', label: '多值精确', types: ['keyword', 'number', 'ip'],
    params: [{ key: 'boost', kind: 'number' }] },
  /* types 含 keyword：match 在 keyword 字段上不分词，行为≈term（保留入口，选它不算错配） */
  match: { form: 'field', wrap: 'query', label: '全文匹配', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' },
      { key: 'minimum_should_match', kind: 'text' }, { key: 'analyzer', kind: 'text' },
      { key: 'zero_terms_query', kind: 'enum', options: ['none', 'all'] }, { key: 'boost', kind: 'number' }] },
  match_phrase: { form: 'field', wrap: 'query', label: '短语匹配', types: ['text'],
    params: [{ key: 'slop', kind: 'number' }, { key: 'analyzer', kind: 'text' },
      { key: 'zero_terms_query', kind: 'enum', options: ['none', 'all'] }, { key: 'boost', kind: 'number' }] },
  match_phrase_prefix: { form: 'field', wrap: 'query', label: '短语前缀', types: ['text'],
    params: [{ key: 'max_expansions', kind: 'number' }, { key: 'slop', kind: 'number' }, { key: 'analyzer', kind: 'text' },
      { key: 'zero_terms_query', kind: 'enum', options: ['none', 'all'] }, { key: 'boost', kind: 'number' }] },
  range: { form: 'field', wrap: 'none', label: '范围', types: ['number', 'date', 'ip'],
    params: [{ key: 'relation', kind: 'enum', options: ['WITHIN', 'INTERSECTS', 'CONTAINS'] },
      { key: 'time_zone', kind: 'text' }, { key: 'format', kind: 'text' }, { key: 'boost', kind: 'number' }] },
  exists: { form: 'field', wrap: 'none', label: '字段存在', params: [{ key: 'boost', kind: 'number' }] },
  prefix: { form: 'field', wrap: 'value', label: '前缀', types: ['keyword', 'text'],
    params: [{ key: 'case_insensitive', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  wildcard: { form: 'field', wrap: 'value', label: '通配符', types: ['keyword', 'text', 'wildcard'],
    params: [{ key: 'case_insensitive', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  regexp: { form: 'field', wrap: 'value', label: '正则', types: ['keyword', 'text'],
    params: [{ key: 'flags', kind: 'text' }, { key: 'max_determinized_states', kind: 'number' },
      { key: 'case_insensitive', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  fuzzy: { form: 'field', wrap: 'value', label: '模糊', types: ['keyword', 'text'],
    params: [{ key: 'fuzziness', kind: 'text' }, { key: 'prefix_length', kind: 'number' },
      { key: 'max_expansions', kind: 'number' }, { key: 'transpositions', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  /* ═══ 富表单算子扩充：12 → 35。对象值算子（wrap:'none' 且值是对象）
   在 ClauseNode 值位渲染递归键值子表（GenericParams），geo 系/terms_set/intervals/
   percolate 的复杂 body 不再落 raw 键值大表。多字段/具名字段/无字段形态由
   form + mainKey/fieldKey 驱动 parse/ser 对称投影，往返无损契约不变。 ═══ */
  match_bool_prefix: { form: 'field', wrap: 'query', label: '前缀全文', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' },
      { key: 'minimum_should_match', kind: 'text' }, { key: 'analyzer', kind: 'text' }, { key: 'boost', kind: 'number' }] },
  terms_set: { form: 'field', wrap: 'none', label: '多值命中数', types: ['keyword', 'text', 'long', 'integer'] },
  rank_feature: { form: 'field', wrap: 'value', label: '排序特征', types: ['rank_feature'] },
  /* 998：rank_features（复数）——同族多特征打分查询，body 是 {特征字段: {boost…}} 对象值形态 */
  rank_features: { form: 'field', wrap: 'none', label: '排序特征组', types: ['rank_features'] },
  geo_distance: { form: 'field', wrap: 'none', label: '地理距离', types: ['geo_point'],
    params: [{ key: 'validation_method', kind: 'enum', options: ['STRICT', 'IGNORE_MALFORMED', 'COERCE'] }] },
  geo_bounding_box: { form: 'field', wrap: 'none', label: '地理矩形', types: ['geo_point'],
    params: [{ key: 'validation_method', kind: 'enum', options: ['STRICT', 'IGNORE_MALFORMED', 'COERCE'] }] },
  geo_polygon: { form: 'field', wrap: 'none', label: '地理多边形', types: ['geo_point'] },
  geo_shape: { form: 'field', wrap: 'none', label: '地理形状', types: ['geo_shape', 'geo_point'] },
  intervals: { form: 'field', wrap: 'none', label: '间隔规则', types: ['text'] },
  multi_match: { form: 'fields', mainKey: 'query', label: '多字段全文', types: ['text', 'keyword'],
    params: [{ key: 'type', kind: 'enum', options: ['best_fields', 'most_fields', 'cross_fields', 'phrase', 'phrase_prefix', 'bool_prefix'] },
      { key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' },
      { key: 'tie_breaker', kind: 'number' }, { key: 'slop', kind: 'number' }, { key: 'minimum_should_match', kind: 'text' },
      { key: 'analyzer', kind: 'text' }, { key: 'lenient', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  query_string: { form: 'named', mainKey: 'query', fieldKey: 'default_field', label: '查询串', types: ['text', 'keyword'],
    params: [{ key: 'default_operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' },
      { key: 'tie_breaker', kind: 'number' }, { key: 'minimum_should_match', kind: 'text' }, { key: 'analyzer', kind: 'text' },
      { key: 'phrase_slop', kind: 'number' }, { key: 'analyze_wildcard', kind: 'boolean' }, { key: 'lenient', kind: 'boolean' },
      { key: 'boost', kind: 'number' }] },
  simple_query_string: { form: 'fields', mainKey: 'query', label: '简单查询串', types: ['text', 'keyword'],
    params: [{ key: 'default_operator', kind: 'enum', options: ['and', 'or'] }, { key: 'flags', kind: 'text' },
      { key: 'minimum_should_match', kind: 'text' }, { key: 'analyzer', kind: 'text' },
      { key: 'lenient', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  combined_fields: { form: 'fields', mainKey: 'query', label: '组合字段', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'minimum_should_match', kind: 'text' }, { key: 'boost', kind: 'number' }] },
  more_like_this: { form: 'fields', mainKey: 'like', label: '更多相似', types: ['text'],
    params: [{ key: 'analyzer', kind: 'text' }, { key: 'minimum_should_match', kind: 'text' },
      { key: 'max_query_terms', kind: 'number' }, { key: 'min_term_freq', kind: 'number' }] },
  ids: { form: 'none', mainKey: 'values', label: '文档 ID' },
  script: { form: 'none', mainKey: 'script', label: '脚本过滤' },
  wrapper: { form: 'none', mainKey: 'query', label: '二进制包装' },
  percolate: { form: 'named', mainKey: 'document', fieldKey: 'field', label: '反查文档' },
  /* distance_feature 散层 {field, pivot, queries} 走 named 投影（fieldKey 固定 'field'、
   主值取 pivot——纯结构投影，无损优先） */
  distance_feature: { form: 'named', mainKey: 'pivot', fieldKey: 'field', label: '特征距离', types: ['date', 'date_nanos'] },
  /* parent_id：join 族第三员（has_child/has_parent 姊妹，无子查询的叶子形态）——
   {field: join 字段, type: 父类型, id: 父文档 id}，type 落 params 具名编辑 */
  parent_id: { form: 'named', mainKey: 'id', fieldKey: 'field', label: '按父文档 ID',
    params: [{ key: 'type', kind: 'text' }] },
  /* ═══ span 跨度系（精确位置控制的底层查询，配 span_near 组合使用） ═══ */
  span_term: { form: 'field', wrap: 'value', valueKey: 'term', label: '跨度词', types: ['text'] },
  /* ═══ 987：ES 8.x 新算子补齐（DSL 全量覆盖）。match 系第九员 / geo 网格 /
   shape 字段 / 向量与语义四员（named 投影）/ 对象值两员。 ═══ */
  match_int_prefix: { form: 'field', wrap: 'query', label: '整词前缀', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' }] },
  geo_grid: { form: 'field', wrap: 'none', label: '地理网格', types: ['geo_point', 'geo_shape'] },
  shape: { form: 'field', wrap: 'none', label: '形状过滤', types: ['shape', 'geo_shape'] },
  semantic: { form: 'named', mainKey: 'query', fieldKey: 'field', label: '语义查询', types: ['semantic', 'text'] },
  sparse_vector: { form: 'named', mainKey: 'query_vectors', fieldKey: 'field', label: '稀疏向量', types: ['sparse_vector'] },
  knn: { form: 'named', mainKey: 'query_vector', fieldKey: 'field', label: '向量近邻', types: ['dense_vector'],
    params: [{ key: 'k', kind: 'number' }, { key: 'num_candidates', kind: 'number' }, { key: 'similarity', kind: 'number' }, { key: 'boost', kind: 'number' }] },
  text_expansion: { form: 'field', wrap: 'none', label: '文本扩展', types: ['text', 'sparse_vector'],
    params: [{ key: 'boost', kind: 'number' }] },
  weighted_tokens: { form: 'field', wrap: 'none', label: '加权词元', types: ['sparse_vector'],
    params: [{ key: 'boost', kind: 'number' }] },
  /* 999：span_gap——span_near clauses 内的间隙占位（width 主值；只在该上下文有检索语义，
   高级菜单与 span_near 同组呈现，独立出现时 ES 会拒绝——树不拦，ES 报错即教育） */
  span_gap: { form: 'none', mainKey: 'width', label: '跨度间隙' },
  /* 999：rule（8.14+ 检索规则）——ruleset_id 主值，match_criteria / match_predicate 走参数表 */
  rule: { form: 'none', mainKey: 'ruleset_id', label: '规则查询' },
};

/* 字段类型 → 推荐算子（ClauseNode 算子下拉：推荐的排前，其余富表单算子分组列后，均可选） */
export function opsForType(type: string | undefined): string[] {
  if (!type) return ['exists'];
  if (type === 'text') return ['match', 'match_phrase', 'match_phrase_prefix', 'wildcard', 'prefix', 'regexp', 'fuzzy', 'exists'];
  if (type === 'keyword' || type === 'wildcard') return ['term', 'terms', 'prefix', 'wildcard', 'regexp', 'fuzzy', 'match', 'exists'];
  if (NUM.includes(type)) return ['term', 'terms', 'range', 'exists'];
  /* 548 B：date 分支并入 date_nanos（纳秒精度同族——此前落兜底 ['exists']，range 推荐缺失） */
  if (type === 'date' || type === 'date_nanos') return ['range', 'exists'];
  if (type === 'boolean') return ['term', 'exists'];
  if (type === 'ip') return ['term', 'range', 'exists'];
  if (type === 'geo_point') return ['geo_distance', 'geo_bounding_box', 'geo_polygon', 'exists'];
  if (type === 'geo_shape') return ['geo_shape', 'exists'];
  if (type === 'rank_feature') return ['rank_feature', 'exists'];
  if (type === 'rank_features') return ['rank_features', 'exists'];
  /* 998：flattened 字段（整对象当一字段检索）——term/match 两档是官方推荐入口 */
  if (type === 'flattened') return ['term', 'match', 'exists'];
  /* 987：dense_vector 推荐向量近邻（knn 查询级形态），sparse_vector 推荐稀疏向量 */
  if (type === 'dense_vector') return ['knn', 'exists'];
  if (type === 'sparse_vector') return ['sparse_vector', 'exists'];
  return ['exists'];
}

export const RICH_OPS: string[] = Object.keys(OPS_META);

/* ═══ 998：高特异算子（字段类型不符 = 查询必空/报错）═══
 geo 系 / 形状 / 特征 / 向量族只在对应 mapping 类型上有意义——字段选择器据此收窄候选
 （typeFilter），用户不再在 3000 个字段里翻 geo_point。其余算子维持「只置顶不过滤」：
 term 打在 text 字段、range 打在 keyword 字段都仍有合法语义（字典序/分词），强行过滤反而挡路。 */
export const STRICT_TYPE_OPS: ReadonlySet<string> = new Set([
  'geo_distance', 'geo_bounding_box', 'geo_polygon', 'geo_shape', 'geo_grid', 'shape',
  'rank_feature', 'rank_features', 'knn', 'sparse_vector', 'distance_feature', 'intervals',
]);

/** 算子的字段候选类型过滤（未登记/非高特异 → undefined = 不过滤） */
export function typeFilterForOp(op: string): string[] | undefined {
  if (!STRICT_TYPE_OPS.has(op)) return undefined;
  const t = OPS_META[op]?.types;
  return t && t.length ? t : undefined;
}

/* 算子场景 → 字段候选类型置顶序（ClauseNode fieldTypePriority 消费，DSL/非 Vue
 语境也可直接复用）。term/terms/prefix/wildcard 精确语义 keyword 优先；
 range 数值/时间语义 date+数值族优先；match 系全文语义 text+keyword；
 R4：match_phrase_prefix 并入 match 系、regexp/fuzzy → keyword+text（与 OPS_META.types
 对齐；ClauseNode 值候选档 includes('keyword') 随之放行，历史值 datalist 白得）；
 985：match_bool_prefix 并入 match 系同档；其余算子无类型倾向，空数组 = FieldSelect
 归一 null 纯 rank 平铺。只调候选分组排序，不改候选集（fieldPickerPenetration 契约）。 */
export function typePriorityForOp(op: string): string[] {
  if (op === 'term' || op === 'terms' || op === 'prefix' || op === 'wildcard') return ['keyword'];
  /* range 序补 unsigned_long（数值族第九种——AFFINITY_FAMILIES.number 同表口径；
   此前编辑器补全排序 orderFieldsByTypeForOp 与 sqlCompletion ORDER BY 加权两条链漏置顶）
   548 B：再补 date_nanos（紧跟 date 位置——opsForType date 分支并档同步；dslValueTiers545 /
   lintExpand530 两处精确锁同步更新） */
  if (op === 'range') return ['date', 'date_nanos', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long'];
  if (op === 'match' || op === 'match_phrase' || op === 'match_phrase_prefix' || op === 'multi_match' || op === 'query_string' || op === 'match_bool_prefix') return ['text', 'keyword'];
  /* R4：regexp/fuzzy 补档（与 OPS_META.types ['keyword','text'] 对齐）——
   ClauseNode 值候选档判定 includes('keyword') 命中，历史值 datalist 白得（语义成立）。 */
  if (op === 'regexp' || op === 'fuzzy') return ['keyword', 'text'];
  return [];
}

/* ═══ 985：复合容器（wrap 扩员 + multi）标签/分区中文 ═══
 wrap 标签与 WrapNodeRow 既有本地表逐字同形（nested 三员），新增四员复合包装；
 multi 标签/分区供 MultiNodeRow 头部与子查询分区头消费。 */
export const WRAP_LABELS: Record<string, string> = {
  nested: '嵌套', has_child: '子文档', has_parent: '父文档',
  constant_score: '恒定评分', function_score: '评分函数', script_score: '脚本评分', pinned: '置顶优选',
  span_first: '首跨度', span_multi: '跨度多匹配',
  field_masking_span: '字段掩码跨度',
};

/* ═══ 999：wrap 容器具名参数表（WrapNodeRow 参数面板 schema 源）═══
   与 OPS_META.params 同一 ParamMeta 形态——enum 档在 GenericParams 渲染为下拉，
   其余档维持自由表但键名在册可查。pinned / span_multi / field_masking_span 不登记：
   它们的剩余键全是结构位（ids/docs/organic、match、query/field），登记反而误导。 */
export const WRAP_PARAMS: Record<string, ParamMeta[]> = {
  nested: [{ key: 'score_mode', kind: 'enum', options: ['avg', 'sum', 'max', 'min', 'none'] }, { key: 'ignore_unmapped', kind: 'boolean' }],
  has_child: [{ key: 'score_mode', kind: 'enum', options: ['avg', 'sum', 'max', 'min', 'none'] },
    { key: 'min_children', kind: 'number' }, { key: 'max_children', kind: 'number' }, { key: 'ignore_unmapped', kind: 'boolean' }],
  has_parent: [{ key: 'score_mode', kind: 'enum', options: ['none', 'score'] }, { key: 'ignore_unmapped', kind: 'boolean' }],
  constant_score: [{ key: 'boost', kind: 'number' }],
  function_score: [{ key: 'boost', kind: 'number' }, { key: 'boost_mode', kind: 'enum', options: ['multiply', 'replace', 'sum', 'avg', 'max', 'min'] },
    { key: 'score_mode', kind: 'enum', options: ['multiply', 'sum', 'avg', 'first', 'max', 'min'] },
    { key: 'min_score', kind: 'number' }, { key: 'max_boost', kind: 'number' }],
  script_score: [{ key: 'min_score', kind: 'number' }],
  span_first: [{ key: 'end', kind: 'number' }],
};
export const MULTI_LABELS: Record<string, string> = {
  boosting: '正负加权', dis_max: '多查询取最大',
  span_near: '近邻跨度', span_or: '任一跨度', span_not: '排除跨度',
  span_containing: '包含跨度', span_within: '位于其中',
};
export function labelOfOp(op: string): string {
  return OPS_META[op]?.label || WRAP_LABELS[op] || MULTI_LABELS[op] || op;
}

/* ═══ 998：算子语义族（交互层配色/分组共用，纯语义零 UI 依赖）═══
   text=全文检索（分词相关性）/ exact=精确命中（词项与集合）/ range=范围与存在 /
   geo=空间 / vector=向量与语义 / span=跨度位置 / script=脚本与评分包装 / struct=结构占位。
   算子下拉胶囊与「+ 高级」菜单按族着色，用户不用读完整名字就能判断「这是哪一类条件」。 */
export type OpFamily = 'text' | 'exact' | 'range' | 'geo' | 'vector' | 'span' | 'script' | 'struct';
export function opFamilyOf(op: string): OpFamily {
  if (op === 'match_all' || op === 'match_none') return 'struct';
  if (op.startsWith('span_') || op === 'field_masking_span') return 'span';
  if (op.startsWith('geo_') || op === 'shape' || op === 'distance_feature') return 'geo';
  if (op === 'knn' || op === 'sparse_vector') return 'vector';
  if (op.startsWith('match') || op === 'multi_match' || op === 'query_string' || op === 'simple_query_string'
    || op === 'combined_fields' || op === 'more_like_this' || op === 'intervals'
    || op === 'semantic' || op === 'text_expansion' || op === 'weighted_tokens') return 'text';
  if (op === 'range' || op === 'exists') return 'range';
  if (op === 'script' || op === 'script_score' || op === 'wrapper' || op === 'percolate' || op === 'rule'
    || op === 'function_score' || op === 'constant_score' || op === 'boosting' || op === 'dis_max'
    || op === 'pinned' || op === 'rank_feature' || op === 'rank_features') return 'script';
  return 'exact';
}

/* multi 容器元数据：keys = 子查询分区键（键序即序列化序）；arrKeys = 恒数组形态键
 （makeNodeByOp 的 arrForm 初值）；partLabel = 分区头中文；params = 具名参数 schema。 */
export const MULTI_META: Record<string, { keys: string[]; arrKeys: string[]; partLabel: Record<string, string>; params?: ParamMeta[] }> = {
  boosting: { keys: ['positive', 'negative'], arrKeys: [], partLabel: { positive: '正例 positive', negative: '反例 negative' },
    params: [{ key: 'negative_boost', kind: 'number' }, { key: 'boost', kind: 'number' }] },
  dis_max: { keys: ['queries'], arrKeys: ['queries'], partLabel: { queries: '查询列表 queries' },
    params: [{ key: 'tie_breaker', kind: 'number' }, { key: 'boost', kind: 'number' }] },
  span_near: { keys: ['clauses'], arrKeys: ['clauses'], partLabel: { clauses: '子跨度 clauses' },
    params: [{ key: 'slop', kind: 'number' }, { key: 'in_order', kind: 'boolean' }] },
  span_or: { keys: ['clauses'], arrKeys: ['clauses'], partLabel: { clauses: '子跨度 clauses' } },
  span_not: { keys: ['include', 'exclude'], arrKeys: [], partLabel: { include: '包含 include', exclude: '排除 exclude' },
    params: [{ key: 'dist', kind: 'number' }, { key: 'pre', kind: 'number' }, { key: 'post', kind: 'number' }] },
  span_containing: { keys: ['little', 'big'], arrKeys: [], partLabel: { little: '小跨度 little', big: '大跨度 big' } },
  span_within: { keys: ['little', 'big'], arrKeys: [], partLabel: { little: '内部 little', big: '外部 big' } },
};

/* ═══ 1000：retriever 检索器元数据（8.14+ 顶层检索面，query 的继任写法）═══
   kind 指示变体形态：'query'=bm25 内嵌 QueryNode 树；'flat'=knn 平面（field+query_vector+参数）；
   'list'=子检索器数组（listKey；wrapped=true 为 linear 的每子项 {retriever,weight} 包裹形态）；
   'child'=单子检索器（text_similarity_reranker 重排源 / rule 回退）。 */
export interface RetrieverMeta { label: string; kind: 'query' | 'flat' | 'list' | 'child'; listKey?: string; wrapped?: boolean }
export const RETRIEVER_META: Record<string, RetrieverMeta> = {
  bm25: { label: 'BM25 检索', kind: 'query' },
  knn: { label: '向量近邻', kind: 'flat' },
  rrf: { label: 'RRF 融合', kind: 'list', listKey: 'retrievers' },
  text_similarity_reranker: { label: '文本相似重排', kind: 'child' },
  rule: { label: '规则路由', kind: 'child' },
  linear: { label: '线性加权', kind: 'list', listKey: 'retrieve', wrapped: true },
};
/* 各变体具名常用参数（GenericParams schema 源；knn 的 field/query_vector 是结构位不在此表） */
export const RETRIEVER_PARAMS: Record<string, ParamMeta[]> = {
  bm25: [{ key: 'k', kind: 'number' }],
  knn: [{ key: 'k', kind: 'number' }, { key: 'num_candidates', kind: 'number' },
    { key: 'similarity', kind: 'number' }, { key: 'boost', kind: 'number' }],
  rrf: [{ key: 'rank_constant', kind: 'number' }, { key: 'rank_window_size', kind: 'number' }],
  text_similarity_reranker: [{ key: 'text', kind: 'text' }, { key: 'inference_id', kind: 'text' },
    { key: 'rank_window_size', kind: 'number' }, { key: 'min_score', kind: 'number' }],
  rule: [{ key: 'ruleset_id', kind: 'text' }],
  linear: [{ key: 'normalize_weights', kind: 'boolean' }],
};

/* 高级算子分组（BoolGroupNode「+ 高级」菜单与 ClauseNode 下拉分组共用同源序）。
 全部成员必须是 OPS_META 或 WRAP_LABELS/MULTI_LABELS 已注册算子。 */
export const ADV_MENU: Array<{ group: string; ops: string[] }> = [
  { group: '全文检索', ops: ['multi_match', 'query_string', 'simple_query_string', 'combined_fields', 'match_bool_prefix', 'match_int_prefix', 'more_like_this', 'intervals'] },
  { group: '精确与集合', ops: ['ids', 'terms_set', 'parent_id'] },
  { group: '地理位置', ops: ['geo_distance', 'geo_bounding_box', 'geo_polygon', 'geo_shape', 'geo_grid', 'shape', 'distance_feature'] },
  { group: '跨度位置', ops: ['span_near', 'span_or', 'span_not', 'span_first', 'span_containing', 'span_within', 'span_term', 'span_gap', 'span_multi', 'field_masking_span'] },
  { group: '向量与语义', ops: ['knn', 'sparse_vector', 'text_expansion', 'weighted_tokens', 'semantic'] },
  { group: '脚本与其他', ops: ['script', 'wrapper', 'percolate', 'rule', 'rank_feature', 'rank_features'] },
  { group: '复合容器', ops: ['constant_score', 'boosting', 'dis_max', 'function_score', 'script_score', 'pinned'] },
];

/* W2：聚合类型建议表（datalist 自由输入的建议项——不限制输入，任何 ES 聚合名都可手输） */
export const AGG_OPS: Record<string, string> = {
  terms: 'Terms 分组', date_histogram: '日期直方图', histogram: '数值直方图',
  range: '范围分组', date_range: '日期范围', filters: '多过滤分组', filter: '单过滤',
  avg: '平均值', sum: '求和', min: '最小', max: '最大', cardinality: '去重计数',
  value_count: '计数', stats: '统计', extended_stats: '扩展统计', percentiles: '百分位',
  top_hits: 'Top 文档', nested: '嵌套', reverse_nested: '反嵌套',
};

/* 1020：常用聚合 body 具名参数 schema（GenericParams 消费——具名键升类型化输入/枚举下拉，
 与 WRAP_PARAMS 同语言）。field 由 field-keys 行内 FieldSelect 权威编辑不在此表；
 未登记键维持自由表（加键零丢失）；未登记聚合类型零 schema = 裸表（现状不变）。 */
export const AGG_BODY_PARAMS: Record<string, ParamMeta[]> = {
  terms: [
    { key: 'size', kind: 'number' }, { key: 'min_doc_count', kind: 'number' },
    { key: 'missing', kind: 'text' },
    { key: 'execution_hint', kind: 'enum', options: ['map', 'global_ordinals', 'term_ordinals'] },
  ],
  date_histogram: [
    { key: 'calendar_interval', kind: 'text' }, { key: 'fixed_interval', kind: 'text' },
    { key: 'format', kind: 'text' }, { key: 'min_doc_count', kind: 'number' },
    { key: 'offset', kind: 'text' }, { key: 'time_zone', kind: 'text' },
  ],
  histogram: [
    { key: 'interval', kind: 'number' }, { key: 'min_doc_count', kind: 'number' },
  ],
  range: [{ key: 'keyed', kind: 'boolean' }],
  avg: [{ key: 'missing', kind: 'number' }],
  sum: [{ key: 'missing', kind: 'number' }],
  min: [{ key: 'missing', kind: 'number' }],
  max: [{ key: 'missing', kind: 'number' }],
  cardinality: [{ key: 'precision_threshold', kind: 'number' }],
  top_hits: [{ key: 'size', kind: 'number' }, { key: 'from', kind: 'number' }],
};
