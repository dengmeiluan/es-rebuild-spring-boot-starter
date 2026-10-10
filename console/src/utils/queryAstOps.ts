/* W1：算子元数据注册表。form='field' = {op:{field:…}} 单字段形态；
   wrap 指示主值键：'value'（term 系）/ 'query'（match 系）/ 'none'（inner 整体即值，range/terms）。
   params 是具名常用参数 → ClauseNode 渲染具名控件；其余参数走「更多参数」递归键值表。 */
export interface ParamMeta { key: string; kind: 'number' | 'text' | 'boolean' | 'enum'; options?: string[] }
interface OpMeta {
  form: 'field' | 'none';
  wrap?: 'value' | 'query' | 'none';
  label: string;
  types?: string[];   // 适合的 mapping 类型组：text/keyword/number/date/boolean/ip
  params?: ParamMeta[];
}

/* 值类型族单源（本文件零依赖，可被 sqlCompletion/dslCompletionContext/
   LuceneInput 等四处 literal 同源消费——keyword 族三员即  sqlCompletion.KEYWORD_VALUE_TYPES
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
};

/* 字段类型 → 推荐算子（ClauseNode 算子下拉：推荐的排前，其余富表单算子列后，均可选） */
export function opsForType(type: string | undefined): string[] {
  if (!type) return ['exists'];
  if (type === 'text') return ['match', 'match_phrase', 'match_phrase_prefix', 'wildcard', 'prefix', 'regexp', 'fuzzy', 'exists'];
  if (type === 'keyword' || type === 'wildcard') return ['term', 'terms', 'prefix', 'wildcard', 'regexp', 'fuzzy', 'match', 'exists'];
  if (NUM.includes(type)) return ['term', 'terms', 'range', 'exists'];
  /* 548 B：date 分支并入 date_nanos（纳秒精度同族——此前落兜底 ['exists']，range 推荐缺失） */
  if (type === 'date' || type === 'date_nanos') return ['range', 'exists'];
  if (type === 'boolean') return ['term', 'exists'];
  if (type === 'ip') return ['term', 'range', 'exists'];
  return ['exists'];
}

export const RICH_OPS: string[] = Object.keys(OPS_META);

/* 算子场景 → 字段候选类型置顶序（ClauseNode fieldTypePriority 消费，DSL/非 Vue
   语境也可直接复用）。term/terms/prefix/wildcard 精确语义 keyword 优先；
   range 数值/时间语义 date+数值族优先；match 系全文语义 text+keyword；
    R4：match_phrase_prefix 并入 match 系、regexp/fuzzy → keyword+text（与 OPS_META.types
   对齐；ClauseNode 值候选档 includes('keyword') 随之放行，历史值 datalist 白得）；
   其余算子无类型倾向，空数组 = FieldSelect 归一 null 纯 rank 平铺。
   只调候选分组排序，不改候选集（fieldPickerPenetration 契约）。 */
export function typePriorityForOp(op: string): string[] {
  if (op === 'term' || op === 'terms' || op === 'prefix' || op === 'wildcard') return ['keyword'];
  /* range 序补 unsigned_long（数值族第九种——AFFINITY_FAMILIES.number 同表口径；
     此前编辑器补全排序 orderFieldsByTypeForOp 与 sqlCompletion ORDER BY 加权两条链漏置顶）
     548 B：再补 date_nanos（紧跟 date 位置——opsForType date 分支并档同批；dslValueTiers545 /
     lintExpand530 两处精确锁随迁） */
  if (op === 'range') return ['date', 'date_nanos', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long'];
  if (op === 'match' || op === 'match_phrase' || op === 'match_phrase_prefix' || op === 'multi_match' || op === 'query_string') return ['text', 'keyword'];
  /*  R4：regexp/fuzzy 补档（与 OPS_META.types ['keyword','text'] 对齐）——
     ClauseNode 值候选档判定 includes('keyword') 命中，历史值 datalist 白得（语义成立）。 */
  if (op === 'regexp' || op === 'fuzzy') return ['keyword', 'text'];
  return [];
}

/* W2：聚合类型建议表（datalist 自由输入的建议项——不限制输入，任何 ES 聚合名都可手输） */
export const AGG_OPS: Record<string, string> = {
  terms: 'Terms 分组', date_histogram: '日期直方图', histogram: '数值直方图',
  range: '范围分组', date_range: '日期范围', filters: '多过滤分组', filter: '单过滤',
  avg: '平均值', sum: '求和', min: '最小', max: '最大', cardinality: '去重计数',
  value_count: '计数', stats: '统计', extended_stats: '扩展统计', percentiles: '百分位',
  top_hits: 'Top 文档', nested: '嵌套', reverse_nested: '反嵌套',
};
