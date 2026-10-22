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
  terms: { form: 'field', wrap: 'none', label: '多值精确', types: ['keyword', 'number', 'ip'] },
  /* types 含 keyword：match 在 keyword 字段上不分词，行为≈term（保留入口，选它不算错配） */
  match: { form: 'field', wrap: 'query', label: '全文匹配', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' }, { key: 'boost', kind: 'number' }] },
  match_phrase: { form: 'field', wrap: 'query', label: '短语匹配', types: ['text'],
    params: [{ key: 'slop', kind: 'number' }, { key: 'boost', kind: 'number' }] },
  match_phrase_prefix: { form: 'field', wrap: 'query', label: '短语前缀', types: ['text'],
    params: [{ key: 'max_expansions', kind: 'number' }] },
  range: { form: 'field', wrap: 'none', label: '范围', types: ['number', 'date', 'ip'],
    params: [{ key: 'boost', kind: 'number' }] },
  exists: { form: 'field', wrap: 'none', label: '字段存在' },
  prefix: { form: 'field', wrap: 'value', label: '前缀', types: ['keyword', 'text'] },
  wildcard: { form: 'field', wrap: 'value', label: '通配符', types: ['keyword', 'text', 'wildcard'],
    params: [{ key: 'case_insensitive', kind: 'boolean' }] },
  regexp: { form: 'field', wrap: 'value', label: '正则', types: ['keyword', 'text'] },
  fuzzy: { form: 'field', wrap: 'value', label: '模糊', types: ['keyword', 'text'],
    params: [{ key: 'fuzziness', kind: 'text' }] },
  /* ═══ 富表单算子扩充：12 → 35。对象值算子（wrap:'none' 且值是对象）
   在 ClauseNode 值位渲染递归键值子表（GenericParams），geo 系/terms_set/intervals/
   percolate 的复杂 body 不再落 raw 键值大表。多字段/具名字段/无字段形态由
   form + mainKey/fieldKey 驱动 parse/ser 对称投影，往返无损契约不变。 ═══ */
  match_bool_prefix: { form: 'field', wrap: 'query', label: '前缀全文', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' }] },
  terms_set: { form: 'field', wrap: 'none', label: '多值命中数', types: ['keyword', 'text', 'long', 'integer'] },
  rank_feature: { form: 'field', wrap: 'value', label: '排序特征', types: ['rank_feature'] },
  geo_distance: { form: 'field', wrap: 'none', label: '地理距离', types: ['geo_point'] },
  geo_bounding_box: { form: 'field', wrap: 'none', label: '地理矩形', types: ['geo_point'] },
  geo_polygon: { form: 'field', wrap: 'none', label: '地理多边形', types: ['geo_point'] },
  geo_shape: { form: 'field', wrap: 'none', label: '地理形状', types: ['geo_shape', 'geo_point'] },
  intervals: { form: 'field', wrap: 'none', label: '间隔规则', types: ['text'] },
  multi_match: { form: 'fields', mainKey: 'query', label: '多字段全文', types: ['text', 'keyword'],
    params: [{ key: 'type', kind: 'enum', options: ['best_fields', 'most_fields', 'cross_fields', 'phrase', 'phrase_prefix', 'bool_prefix'] },
      { key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' }] },
  query_string: { form: 'named', mainKey: 'query', fieldKey: 'default_field', label: '查询串', types: ['text', 'keyword'],
    params: [{ key: 'default_operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' }] },
  simple_query_string: { form: 'fields', mainKey: 'query', label: '简单查询串', types: ['text', 'keyword'],
    params: [{ key: 'default_operator', kind: 'enum', options: ['and', 'or'] }] },
  combined_fields: { form: 'fields', mainKey: 'query', label: '组合字段', types: ['text', 'keyword'] },
  more_like_this: { form: 'fields', mainKey: 'like', label: '更多相似', types: ['text'] },
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
    params: [{ key: 'k', kind: 'number' }, { key: 'num_candidates', kind: 'number' }, { key: 'similarity', kind: 'number' }] },
  text_expansion: { form: 'field', wrap: 'none', label: '文本扩展', types: ['text', 'sparse_vector'] },
  weighted_tokens: { form: 'field', wrap: 'none', label: '加权词元', types: ['sparse_vector'] },
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
  /* 987：dense_vector 推荐向量近邻（knn 查询级形态），sparse_vector 推荐稀疏向量 */
  if (type === 'dense_vector') return ['knn', 'exists'];
  if (type === 'sparse_vector') return ['sparse_vector', 'exists'];
  return ['exists'];
}

export const RICH_OPS: string[] = Object.keys(OPS_META);

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
export const MULTI_LABELS: Record<string, string> = {
  boosting: '正负加权', dis_max: '多查询取最大',
  span_near: '近邻跨度', span_or: '任一跨度', span_not: '排除跨度',
  span_containing: '包含跨度', span_within: '位于其中',
};
export function labelOfOp(op: string): string {
  return OPS_META[op]?.label || WRAP_LABELS[op] || MULTI_LABELS[op] || op;
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

/* 高级算子分组（BoolGroupNode「+ 高级」菜单与 ClauseNode 下拉分组共用同源序）。
 全部成员必须是 OPS_META 或 WRAP_LABELS/MULTI_LABELS 已注册算子。 */
export const ADV_MENU: Array<{ group: string; ops: string[] }> = [
  { group: '全文检索', ops: ['multi_match', 'query_string', 'simple_query_string', 'combined_fields', 'match_bool_prefix', 'match_int_prefix', 'more_like_this', 'intervals'] },
  { group: '精确与集合', ops: ['ids', 'terms_set', 'parent_id'] },
  { group: '地理位置', ops: ['geo_distance', 'geo_bounding_box', 'geo_polygon', 'geo_shape', 'geo_grid', 'shape', 'distance_feature'] },
  { group: '跨度位置', ops: ['span_near', 'span_or', 'span_not', 'span_first', 'span_containing', 'span_within', 'span_term', 'span_multi', 'field_masking_span'] },
  { group: '向量与语义', ops: ['knn', 'sparse_vector', 'text_expansion', 'weighted_tokens', 'semantic'] },
  { group: '脚本与其他', ops: ['script', 'wrapper', 'percolate', 'rank_feature'] },
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
