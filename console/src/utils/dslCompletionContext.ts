/* W4 ：DSL 补全上下文判定——从文首扫到 offset，维护 {}/[] 栈与每层最近键名。
 非严格解析（残缺文档容忍）：栈不平衡/半截字符串按已扫描信息兜底。
 root→根层键补全；query-type→查询类型 snippet；field→叶子子句字段名位（clause=子句名）；
 range-op→range 字段值对象内操作符位（gte/gt/lt/lte）；exists-key→exists 键位钉死 "field"；
 agg-name→aggs 容器键位（实例自由命名）；agg-type→实例值对象键位（聚合类型骨架）；none→不出层。 */
import { SETTINGS_CATALOG } from './indexSettingsCatalog';
/* 字段位类型亲和置顶序的语义源（下沉 queryAstOps 的单一出处，
 本链此前未消费——sqlCompletion/ClauseNode 同源，不另起算子映射表防漂移）
 keyword/number 两族改吃 queryAstOps 族表单源（KEYWORD_VALUE_TYPES 三员同值；
 number 滤 token_count 保持九口径——AFFINITY 族序零变，dslValueTiers545 行为锁保形） */
import { typePriorityForOp, KEYWORD_VALUE_TYPES, NUMERIC_VALUE_TYPES, labelOfOp, AGG_BODY_PARAMS, FIELD_BODY_AGGS, PATH_BODY_AGGS, OPS_META, WRAP_PARAMS, MULTI_META, RETRIEVER_PARAMS, type ParamMeta } from './queryAstOps';

type DslCtx = { kind: 'root' } | { kind: 'query-type' } | { kind: 'field'; clause: string }
  | { kind: 'range-op' } | { kind: 'exists-key' }
  | { kind: 'agg-name' } | { kind: 'agg-type' }
  /* 1439：检索器变体键位（retriever 值对象 / rrf.retrievers[] 元素） */
  | { kind: 'retriever-type' }
  /* 1439：建议器类型键位（suggest.<名> {} 内） */
  | { kind: 'suggester-type' }
  /* 1439：聚合体键位（terms: { 内）——参数键/字段键/嵌套 aggs */
  | { kind: 'agg-body-key'; op: string }
  /* 1439：子句体内的键位（bool must/filter、nested path/query、multi_match query/fields…）
     ——此前这里一律给 query-type（算子骨架），写进子句体全是非法键 */
  | { kind: 'query-body-key'; op: string }
  /* 1439：字段子句的字段配置对象（match.<field>.{query/operator}、fuzzy.<field>.{value/…}） */
  | { kind: 'clause-field-key'; op: string }
  /* 1439：检索器变体体键位（retriever.standard.{query}、knn.{field/query_vector}） */
  | { kind: 'retriever-body-key'; op: string }
  /* 1439：建议器体键位（suggest.<名>.<term|phrase|completion>.{}） */
  | { kind: 'suggester-body-key'; op: string }
  /* 1439：字段名作键的容器（highlight.fields { <字段>: {} }） */
  | { kind: 'field-key' }
  /* 1439：排序链——sort 元素的简写方向值 / 字段配置键 */
  | { kind: 'sort-order' }
  | { kind: 'sort-opt-key' }
  | { kind: 'array-elem-key'; owner: string } | { kind: 'none' };

export const QUERY_SNIPPETS: Record<string, string> = {
  /* —— 高频八员保持原有顺序（既有操作者肌肉记忆；类型前缀输入仍可秒筛） —— */
  match: '"match": {\n  "${1:field}": "${2:value}"\n}',
  match_phrase: '"match_phrase": {\n  "${1:field}": "${2:value}"\n}',
  term: '"term": {\n  "${1:field}": "${2:value}"\n}',
  /* 1439：占位值必须带引号——Monaco 把 ${2:value} 原样插成 value，裸数组 [value]
     接受即非法 JSON（其余 snippet 都带引号，只有该条漏了） */
  terms: '"terms": {\n  "${1:field}": ["${2:value}"]\n}',
  range: '"range": {\n  "${1:field}": {\n    "gte": "${2:now-1d/d}",\n    "lt": "${3:now/d}"\n  }\n}',
  exists: '"exists": {\n  "field": "${1:field}"\n}',
  wildcard: '"wildcard": {\n  "${1:field}": "${2:pref*}"\n}',
  bool: '"bool": {\n  "must": [\n    ${0}\n  ],\n  "filter": [],\n  "should": [],\n  "must_not": []\n}',
  /* —— term-level 其余（与树 OPS_META 全量对齐） —— */
  match_all: '"match_all": {}',
  match_none: '"match_none": {}',
  match_phrase_prefix: '"match_phrase_prefix": {\n  "${1:field}": "${2:value}"\n}',
  prefix: '"prefix": {\n  "${1:field}": "${2:prefix}"\n}',
  regexp: '"regexp": {\n  "${1:field}": "${2:pattern.*}"\n}',
  fuzzy: '"fuzzy": {\n  "${1:field}": {\n    "value": "${2:value}"\n  }\n}',
  match_bool_prefix: '"match_bool_prefix": {\n  "${1:field}": "${2:value}"\n}',
  terms_set: '"terms_set": {\n  "${1:field}": ["${2:value}"],\n  "minimum_should_match_field": "${3:countField}"\n}',
  bitmap_terms: '"bitmap_terms": {\n  "field": "${1:field}",\n  "value": "${2:value}"\n}',
  /* —— 全文检索 —— */
  multi_match: '"multi_match": {\n  "query": "${1:value}",\n  "fields": ["${2:field}"]\n}',
  query_string: '"query_string": {\n  "query": "${1:value}",\n  "default_field": "${2:field}"\n}',
  simple_query_string: '"simple_query_string": {\n  "query": "${1:value}",\n  "fields": ["${2:field}"]\n}',
  combined_fields: '"combined_fields": {\n  "query": "${1:value}",\n  "fields": ["${2:field}"]\n}',
  more_like_this: '"more_like_this": {\n  "fields": ["${1:field}"],\n  "like": "${2:text}"\n}',
  intervals: '"intervals": {\n  "${1:field}": {\n    "match": { "query": "${2:value}" }\n  }\n}',
  ids: '"ids": {\n  "values": ["${1:id}"]\n}',
  /* —— 排序特征 / 向量 / 语义 —— */
  rank_feature: '"rank_feature": {\n  "field": "${1:rankField}",\n  "boost": ${2:1}\n}',
  distance_feature: '"distance_feature": {\n  "field": "${1:dateField}",\n  "pivot": "${2:7d}",\n  "origin": "${3:now}"\n}',
  semantic: '"semantic": {\n  "field": "${1:semanticField}",\n  "query": "${2:text}"\n}',
  sparse_vector: '"sparse_vector": {\n  "field": "${1:vectorField}",\n  "query_vector": {}\n}',
  knn: '"knn": {\n  "field": "${1:vectorField}",\n  "query_vector": [],\n  "k": ${2:10},\n  "num_candidates": ${3:100}\n}',
  text_expansion: '"text_expansion": {\n  "${1:sparseField}": {\n    "model_id": "${2:model}",\n    "model_text": "${3:text}"\n  }\n}',
  weighted_tokens: '"weighted_tokens": {\n  "${1:sparseField}": {\n    "tokens": { "${2:token}": ${3:0.5} }\n  }\n}',
  /* —— geo / shape —— */
  geo_distance: '"geo_distance": {\n  "distance": "${1:10km}",\n  "${2:location}": { "lat": ${3:39.9}, "lon": ${4:116.4} }\n}',
  geo_bounding_box: '"geo_bounding_box": {\n  "${1:location}": {\n    "top_left": { "lat": ${2:40}, "lon": ${3:116} },\n    "bottom_right": { "lat": ${4:39}, "lon": ${5:117} }\n  }\n}',
  geo_polygon: '"geo_polygon": {\n  "${1:location}": {\n    "points": [\n      { "lat": ${2:39}, "lon": ${3:116} },\n      { "lat": ${4:40}, "lon": ${5:117} }\n    ]\n  }\n}',
  geo_shape: '"geo_shape": {\n  "${1:location}": {\n    "shape": { "type": "point", "coordinates": [${2:116.4}, ${3:39.9}] },\n    "relation": "intersects"\n  }\n}',
  geo_grid: '"geo_grid": {\n  "${1:location}": { "${2|geohash,geotile,geohex|}": "${3:u0}" }\n}',
  shape: '"shape": {\n  "${1:shapeField}": {\n    "shape": { "type": "point", "coordinates": [${2:116.4}, ${3:39.9}] },\n    "relation": "intersects"\n  }\n}',
  /* —— join / parent —— */
  nested: '"nested": {\n  "path": "${1:path}",\n  "query": { "match": { "${2:field}": "${3:value}" } }\n}',
  has_child: '"has_child": {\n  "type": "${1:childType}",\n  "query": { "match_all": {} }\n}',
  has_parent: '"has_parent": {\n  "parent_type": "${1:parentType}",\n  "query": { "match_all": {} }\n}',
  parent_id: '"parent_id": {\n  "type": "${1:parentType}",\n  "id": "${2:parentId}"\n}',
  /* —— 复合容器 —— */
  constant_score: '"constant_score": {\n  "filter": { "match_all": {} },\n  "boost": ${2:1}\n}',
  function_score: '"function_score": {\n  "query": { "match_all": {} },\n  "functions": [\n    { "weight": ${1:1} }\n  ],\n  "boost_mode": "multiply"\n}',
  script_score: '"script_score": {\n  "query": { "match_all": {} },\n  "script": { "source": "${1:params.factor}" },\n  "min_score": ${2:0}\n}',
  dis_max: '"dis_max": {\n  "queries": [\n    { "match_all": {} }\n  ],\n  "tie_breaker": ${2:0.7}\n}',
  boosting: '"boosting": {\n  "positive": { "match_all": {} },\n  "negative": { "match_none": {} },\n  "negative_boost": ${3:0.5}\n}',
  pinned: '"pinned": {\n  "ids": ["${1:id}"],\n  "organic": { "match_all": {} }\n}',
  /* —— span 跨度系 —— */
  span_near: '"span_near": {\n  "clauses": [\n    { "span_term": { "${1:field}": { "term": "${2:value}" } } }\n  ],\n  "slop": ${3:1},\n  "in_order": true\n}',
  span_or: '"span_or": {\n  "clauses": [\n    { "span_term": { "${1:field}": { "term": "${2:value}" } } }\n  ]\n}',
  span_not: '"span_not": {\n  "include": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "exclude": { "span_term": { "${3:field2}": { "term": "${4:value2}" } } }\n}',
  span_first: '"span_first": {\n  "match": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "end": ${3:3}\n}',
  span_containing: '"span_containing": {\n  "little": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "big": { "span_near": { "clauses": [], "slop": 1, "in_order": true } }\n}',
  span_within: '"span_within": {\n  "little": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "big": { "span_near": { "clauses": [], "slop": 1, "in_order": true } }\n}',
  span_term: '"span_term": {\n  "${1:field}": { "term": "${2:value}" }\n}',
  span_gap: '"span_gap": {\n  "${1:field}": ${2:1}\n}',
  span_multi: '"span_multi": {\n  "match": { "prefix": { "${1:field}": "${2:value}" } }\n}',
  span_field_masking: '"span_field_masking": {\n  "query": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "field": "${3:maskField}"\n}',
  /* —— 脚本 / 包装 / 反查 / 规则 / 遗留 —— */
  percolate: '"percolate": {\n  "field": "${1:queryField}",\n  "document": { "${2:field}": "${3:value}" }\n}',
  script: '"script": {\n  "script": { "source": "doc[\'${1:field}\'].value > 0" }\n}',
  wrapper: '"wrapper": {\n  "query": "${1:base64}"\n}',
  rule: '"rule": {\n  "ruleset_id": "${1:ruleset}",\n  "match_criteria": { "${2:field}": "${3:value}" }\n}',
  type: '"type": {\n  "value": "${1:docType}"\n}',
  template: '"template": {\n  "id": "${1:templateId}",\n  "params": {}\n}',
};
/* 1133：补全候选的中文语义（树注册表同源标签；bool 容器不在 OPS_META 单列）。
   出口放本模块，MonacoEditor 不直连 queryAstOps（dslValueTiers540 架构锁）。 */
export function querySnippetDetail(op: string): string {
  return op === 'bool' ? '布尔组合' : labelOfOp(op);
}

/* 2.6.0 range-op 档（spec ）：range 字段值对象内键位，日期占位默认值 */
export const RANGE_OPS: Record<string, string> = {
  gte: 'now-1d/d', gt: 'now-1d/d', lt: 'now/d', lte: 'now/d',
};
/* 2.6.0 聚合骨架（spec ）：agg-type 档候选。detail 一句话（H 发现性）。
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

  /* ── 1439：补到与 AGG_OPS 同宽（此前只有 11 种，Ctrl+Space 里看不到 histogram/
     percentiles/value_count/filter/nested/top_metrics 等常见聚合——补全就是发现性入口）。
     体一律取官方最小可用形态；占位符用 Monaco snippet 语法（${1:field} / ${2|a,b|}）。 ── */
  value_count:    { text: '"value_count": { "field": "${1:field}" }',                                                   detail: '计数（含重复）' },
  percentiles:    { text: '"percentiles": { "field": "${1:field}", "percents": [${2:50}, ${3:95}] }',                   detail: '分位数' },
  percentile_ranks: { text: '"percentile_ranks": { "field": "${1:field}", "values": [${2:50}] }',                       detail: '给定值的百分位排名' },
  extended_stats: { text: '"extended_stats": { "field": "${1:field}" }',                                                detail: '扩展统计（含方差/标准差）' },
  median_absolute_deviation: { text: '"median_absolute_deviation": { "field": "${1:field}" }',                          detail: '中位数绝对偏差（离群诊断）' },
  boxplot:        { text: '"boxplot": { "field": "${1:field}" }',                                                       detail: '箱线图统计（四分位）' },
  string_stats:   { text: '"string_stats": { "field": "${1:field}" }',                                                  detail: '字符串统计（长度/熵）' },
  matrix_stats:   { text: '"matrix_stats": { "fields": ["${1:field}", "${2:field2}"] }',                                detail: '多字段协方差矩阵' },
  weighted_avg:   { text: '"weighted_avg": {\n  "value": { "field": "${1:valueField}" },\n  "weight": { "field": "${2:weightField}" }\n}', detail: '加权平均' },
  t_test:         { text: '"t_test": {\n  "a": { "field": "${1:aField}" },\n  "b": { "field": "${2:bField}" }\n}',   detail: '两样本 t 检验' },
  rate:           { text: '"rate": {\n  "field": "${1:dateField}",\n  "unit": "${2|second,minute,hour,day,week,month,year|}"\n}', detail: '按时间单位的速率' },

  histogram:      { text: '"histogram": {\n  "field": "${1:field}",\n  "interval": ${2:10}\n}',                          detail: '数值直方图（固定区间分桶）' },
  range:          { text: '"range": {\n  "field": "${1:field}",\n  "ranges": [\n    { "to": ${2:100} },\n    { "from": ${2:100} }\n  ]\n}', detail: '数值范围分桶' },
  variable_width_histogram: { text: '"variable_width_histogram": {\n  "field": "${1:field}",\n  "buckets": ${2:10}\n}', detail: '按分布自适应的数值分桶' },
  auto_date_histogram: { text: '"auto_date_histogram": {\n  "field": "${1:dateField}",\n  "buckets": ${2:10}\n}',       detail: '自动选间隔的时间直方图' },
  missing:        { text: '"missing": { "field": "${1:field}" }',                                                       detail: '字段缺失的文档数' },
  filter:         { text: '"filter": { "term": { "${1:field}": "${2:value}" } }',                                       detail: '单过滤器分桶' },
  filters:        { text: '"filters": {\n  "filters": {\n    "${1:name}": { "term": { "${2:field}": "${3:value}" } }\n  }\n}', detail: '多过滤器命名分桶' },
  global:         { text: '"global": {}',                                                                               detail: '全局桶（不受查询过滤影响）' },
  nested:         { text: '"nested": { "path": "${1:path}" }',                                                          detail: '进入 nested 文档聚合' },
  reverse_nested: { text: '"reverse_nested": {}',                                                                       detail: '回到父文档聚合' },
  children:       { text: '"children": { "type": "${1:childType}" }',                                                   detail: '按子文档类型分桶' },
  parent:         { text: '"parent": { "type": "${1:parentType}" }',                                                    detail: '按父文档类型分桶' },
  sampler:        { text: '"sampler": { "shard_size": ${1:100} }',                                                      detail: '采样后聚合（降开销）' },
  random_sampler: { text: '"random_sampler": { "probability": ${1:0.1} }',                                              detail: '随机采样（可重复）' },
  diversified_sampler: { text: '"diversified_sampler": {\n  "field": "${1:field}",\n  "shard_size": ${2:100}\n}',       detail: '按字段去重的采样' },
  composite:      { text: '"composite": {\n  "sources": [\n    { "${1:name}": { "terms": { "field": "${2:field}" } } }\n  ],\n  "size": ${3:10}\n}', detail: '复合分桶（多键分页遍历）' },
  multi_terms:    { text: '"multi_terms": {\n  "terms": [\n    { "field": "${1:field}" },\n    { "field": "${2:field2}" }\n  ]\n}', detail: '多字段组合分桶' },
  adjacency_matrix: { text: '"adjacency_matrix": {\n  "filters": {\n    "${1:g1}": { "term": { "${2:field}": "${3:value}" } }\n  }\n}', detail: '过滤器两两相邻矩阵' },
  frequent_item_sets: { text: '"frequent_item_sets": {\n  "fields": ["${1:field}"],\n  "minimum_set_size": ${2:2}\n}', detail: '频繁项集挖掘' },
  significant_terms: { text: '"significant_terms": {\n  "field": "${1:field}",\n  "size": ${2:10}\n}',                  detail: '显著词项（对比背景集）' },
  significant_text: { text: '"significant_text": { "field": "${1:textField}" }',                                        detail: '显著文本片段' },
  rare_terms:     { text: '"rare_terms": { "field": "${1:field}" }',                                                    detail: '稀有词项分桶' },
  top_metrics:    { text: '"top_metrics": {\n  "metrics": [ { "field": "${1:field}" } ],\n  "sort": [ { "${2:sortField}": "desc" } ]\n}', detail: '按排序取同桶内极值字段' },
  geo_bounds:     { text: '"geo_bounds": { "field": "${1:location}" }',                                                 detail: '地理包围盒' },
  geo_centroid:   { text: '"geo_centroid": { "field": "${1:location}" }',                                               detail: '地理质心' },
  geo_distance:   { text: '"geo_distance": {\n  "field": "${1:location}",\n  "origin": { "lat": ${2:0}, "lon": ${3:0} },\n  "unit": "${4:km}"\n}', detail: '距离分桶' },
  geo_line:       { text: '"geo_line": {\n  "point": { "field": "${1:location}" },\n  "sort": { "field": "${2:timeField}" }\n}', detail: '轨迹线（按时间排序的坐标）' },
  geohash_grid:   { text: '"geohash_grid": {\n  "field": "${1:location}",\n  "precision": ${2:5}\n}',                   detail: 'geohash 网格分桶' },
  geotile_grid:   { text: '"geotile_grid": {\n  "field": "${1:location}",\n  "precision": ${2:7}\n}',                   detail: 'geotile 网格分桶' },
  geohex_grid:    { text: '"geohex_grid": {\n  "field": "${1:location}",\n  "precision": ${2:4}\n}',                     detail: 'geohex 网格分桶' },
  ip_range:       { text: '"ip_range": {\n  "field": "${1:ip}",\n  "ranges": [ { "to": "${2:10.0.0.255}" } ]\n}',      detail: 'IP 段分桶' },
  categorize_text: { text: '"categorize_text": { "field": "${1:message}" }',                                            detail: '文本自动分类分桶' },
  inference:      { text: '"inference": { "model_id": "${1:modelId}" }',                                                detail: '推理结果分桶（ML）' },
  scripted_metric: { text: '"scripted_metric": {\n  "init_script": "${1:state.n = 0}",\n  "map_script": "${2:state.n += 1}",\n  "combine_script": "${3:return state.n}",\n  "reduce_script": "${4:return states.sum()}"\n}', detail: '脚本自定义指标' },

  stats_bucket:   { text: '"stats_bucket": { "buckets_path": "${1:agg>metric}" }',                                      detail: '对兄弟桶统计做统计' },
  extended_stats_bucket: { text: '"extended_stats_bucket": { "buckets_path": "${1:agg>metric}" }',                      detail: '对兄弟桶做扩展统计' },
  percentiles_bucket: { text: '"percentiles_bucket": { "buckets_path": "${1:agg>metric}" }',                            detail: '对兄弟桶求分位' },
  derivative:     { text: '"derivative": { "buckets_path": "${1:agg>metric}" }',                                        detail: '相邻桶差值' },
  cumulative_sum: { text: '"cumulative_sum": { "buckets_path": "${1:agg>metric}" }',                                    detail: '累计和' },
  cumulative_cardinality: { text: '"cumulative_cardinality": { "buckets_path": "${1:agg>metric}" }',                    detail: '累计去重数' },
  serial_diff:    { text: '"serial_diff": {\n  "buckets_path": "${1:agg>metric}",\n  "lag": ${2:1}\n}',                 detail: '按滞后期求差' },
  moving_avg:     { text: '"moving_avg": {\n  "buckets_path": "${1:agg>metric}",\n  "window": ${2:5}\n}',                detail: '滑动平均（已废弃，建议 moving_fn）' },
  moving_fn:      { text: '"moving_fn": {\n  "buckets_path": "${1:agg>metric}",\n  "window": ${2:5},\n  "script": "${3:MovingFunctions.unweightedAvg(values)}"\n}', detail: '滑动函数' },
  moving_percentiles: { text: '"moving_percentiles": {\n  "buckets_path": "${1:agg>metric}",\n  "window": ${2:5},\n  "percents": [${3:50}]\n}', detail: '滑动分位数' },
  bucket_script:  { text: '"bucket_script": {\n  "buckets_path": { "${1:k}": "${2:agg>metric}" },\n  "script": "${3:params.k * 2}"\n}', detail: '按同桶指标算表达式' },
  bucket_selector: { text: '"bucket_selector": {\n  "buckets_path": { "${1:k}": "${2:agg>metric}" },\n  "script": "${3:params.k > 0}"\n}', detail: '按表达式过滤桶' },
  bucket_sort:    { text: '"bucket_sort": {\n  "sort": [ { "${1:agg}": { "order": "desc" } } ]\n}',                     detail: '对桶排序/截断' },
  normalize:      { text: '"normalize": {\n  "buckets_path": "${1:agg>metric}",\n  "method": "${2|min_max,z_score,percent_of_sum,mean,softmax|}"\n}', detail: '桶指标归一化' },
};
export const ROOT_KEYS = [
  'query', 'sort', 'aggs', '_source', 'highlight', 'from', 'size', 'track_total_hits',
  /* 1138：树已支持的结构化顶层键——原始 DSL 手写不再只能盲打 */
  'post_filter', 'knn', 'collapse', 'rescore', 'retriever', 'suggest', 'script_fields', 'runtime_mappings', 'search_after', 'min_score',
  /* 1439：lint 的 ROOT_KEY_WHITELIST 早已接受、补全却从不提供的合法根键——
     同一件事两种待遇：写出来不报错，想补全却没有。 */
  'aggregations', 'pit', 'docvalue_fields', 'stored_fields', 'fields', 'indices_boost',
  'search_type', 'terminate_after', 'timeout', 'explain', 'version', 'seq_no_primary_term',
  'track_scores', 'slice', 'routing', 'preference', 'ext', 'stats', 'profile',
];
/**
 * 1439：检索器变体补全（8.14+ 的 retriever 面）。
 * 此前 retriever 只有根键骨架（内部写死 standard），用户进到 retriever 体内按 Ctrl+Space
 * 什么都拿不到——而产品本身支持 9 种变体（RETRIEVER_META）。
 * 骨架以产品自己的序列化形态为准；aggCompletionWide1439 之外的
 * retrieverCompletion1439 会逐条喂给 parseTree，防止骨架与解析器漂移。
 */
export const RETRIEVER_SNIPPETS: Record<string, { text: string; detail: string }> = {
  standard:                { text: '"standard": {\n  "query": { "match_all": {} }\n}', detail: '标准 BM25 检索' },
  knn:                     { text: '"knn": {\n  "field": "${1:vectorField}",\n  "query_vector": [${2:0.1}, ${3:0.2}],\n  "k": ${4:10},\n  "num_candidates": ${5:100}\n}', detail: '向量近邻召回' },
  rrf:                     { text: '"rrf": {\n  "retrievers": [\n    { "standard": { "query": { "match_all": {} } } },\n    { "standard": { "query": { "match_all": {} } } }\n  ],\n  "rank_constant": ${1:60}\n}', detail: 'RRF 倒数排名融合（多路召回）' },
  linear:                  { text: '"linear": {\n  "retrievers": [\n    { "retriever": { "standard": { "query": { "match_all": {} } } }, "weight": ${1:1} }\n  ],\n  "normalizer": "${2|none,minmax,l2_norm|}"\n}', detail: '线性加权融合' },
  text_similarity_reranker: { text: '"text_similarity_reranker": {\n  "retriever": { "standard": { "query": { "match_all": {} } } },\n  "field": "${1:field}",\n  "inference_id": "${2:modelId}",\n  "inference_text": "${3:text}"\n}', detail: '文本相似度重排' },
  rule:                    { text: '"rule": {\n  "ruleset_id": "${1:rulesetId}"\n}', detail: '规则路由（按 ruleset 改写）' },
  pinned:                  { text: '"pinned": {\n  "docs": [ { "_id": "${1:docId}", "_index": "${2:index}" } ],\n  "retriever": { "standard": { "query": { "match_all": {} } } }\n}', detail: '置顶优选（指定文档排最前）' },
  diversify:               { text: '"diversify": {\n  "retriever": { "standard": { "query": { "match_all": {} } } },\n  "field": "${1:vectorField}",\n  "lambda": ${2:0.5}\n}', detail: 'MMR 多样性重排' },
  rescorer:                { text: '"rescorer": {\n  "retriever": { "standard": { "query": { "match_all": {} } } },\n  "rescore": { "window_size": ${1:50} }\n}', detail: '重打分' },
};
/**
 * 1439：建议器类型补全（suggest.<名> {} 内）。
 * 产品注册了 3 种建议器（SUGGESTER_TYPES：term/phrase/completion），根键骨架只写死 term；
 * 光标进到建议器对象里按 Ctrl+Space 此前什么也拿不到。
 */
export const SUGGESTER_SNIPPETS: Record<string, { text: string; detail: string }> = {
  term:       { text: '"term": {\n  "field": "${1:field}"\n}', detail: '纠错 term 建议器' },
  phrase:     { text: '"phrase": {\n  "field": "${1:field}",\n  "size": ${2:5}\n}', detail: '短语 phrase 建议器' },
  completion: { text: '"completion": {\n  "field": "${1:suggestField}"\n}', detail: '自动补全 completion 建议器' },
};
/**
 * 1439：聚合体内部可补全的键——字段键 + AGG_BODY_PARAMS 参数键 + 嵌套 aggs。
 * 字段键与构建器同源（queryAstOps.FIELD_BODY_AGGS / PATH_BODY_AGGS），
 * 参数键与 GenericParams 同源，避免「界面有输入框、编辑时却补不出来」。
 */
export function aggBodyKeys(op: string): Array<{ key: string; insert: string; detail: string }> {
  const out: Array<{ key: string; insert: string; detail: string }> = [];
  if (PATH_BODY_AGGS.has(op)) out.push({ key: 'path', insert: '"path": "${1:path}"', detail: '嵌套文档路径' });
  else if (FIELD_BODY_AGGS.has(op)) out.push({ key: 'field', insert: '"field": "${1:field}"', detail: '聚合字段' });
  for (const p of AGG_BODY_PARAMS[op] || []) {
    const opts = p.options || [];
    const ph = p.kind === 'number' ? '${1:10}'
      : p.kind === 'boolean' ? '${1|true,false|}'
      /* 枚举取的都是字符串值（map / min_max / mmr…）——必须带引号，否则插出来是裸词 */
      : p.kind === 'enum' && opts.length ? '"${1|' + opts.join(',') + '|}"'
      : p.kind === 'json' ? '${1:{}}'
      : p.kind === 'json-array' ? '${1:[]}'
      : '"${1:text}"';
    out.push({ key: p.key, insert: `"${p.key}": ${ph}`, detail: p.kind });
  }
  out.push({ key: 'aggs', insert: '"aggs": {\n  ${0}\n}', detail: '嵌套子聚合' });
  return out;
}

/* 2.6.0 root 键骨架（spec ）：每键定制值形态，detail 一句话（H 发现性）。 query/aggs/highlight 对象容器；sort 数组（多字段通用）；_source 数组；from/size 数字；track_total_hits choice。
 1138：补树已支持的结构化顶层键（查询后置过滤 / 顶层向量 / 折叠 / 重打分 / 检索器 / 建议器 / 脚本字段 / 运行时字段 / 深分页 / 最低分）。 */
export const ROOT_KEY_SNIPPETS: Record<string, { text: string; detail: string }> = {
  query:            { text: '"query": {\n  ${0}\n}',                                        detail: '查询主体' },
  sort:             { text: '"sort": [\n  { "${1:field}": { "order": "${2|desc,asc|}" } }\n]', detail: '排序' },
  aggs:             { text: '"aggs": {\n  ${0}\n}',                                         detail: '聚合统计' },
  _source:          { text: '"_source": ["${1:field}"]',                                    detail: '返回字段裁剪' },
  highlight:        { text: '"highlight": {\n  "fields": {\n    "${1:field}": {}\n  }\n}',  detail: '高亮' },
  from:             { text: '"from": ${1:0}',                                               detail: '分页起点' },
  size:             { text: '"size": ${1:10}',                                              detail: '分页大小' },
  track_total_hits: { text: '"track_total_hits": ${1|true,false|}',                         detail: '精确总数统计' },
  post_filter:      { text: '"post_filter": {\n  "term": { "${1:field}": "${2:value}" }\n}', detail: '查询后过滤（不影响聚合）' },
  knn:              { text: '"knn": {\n  "field": "${1:vectorField}",\n  "query_vector": [],\n  "k": ${2:10},\n  "num_candidates": ${3:100}\n}', detail: '顶层向量近邻检索' },
  collapse:         { text: '"collapse": {\n  "field": "${1:field}"\n}',                    detail: '按字段折叠去重' },
  rescore:          { text: '"rescore": {\n  "window_size": ${1:50},\n  "query": {\n    "rescore_query": { "match_all": {} },\n    "query_weight": 0.7,\n    "rescore_query_weight": 1.2\n  }\n}', detail: '二阶段重打分' },
  retriever:        { text: '"retriever": {\n  "standard": {\n    "query": { "match_all": {} }\n  }\n}', detail: '检索器（8.14+ 检索面）' },
  suggest:          { text: '"suggest": {\n  "${1:my_suggest}": {\n    "text": "${2:value}",\n    "term": { "field": "${3:field}" }\n  }\n}', detail: '建议器（拼写/词项）' },
  script_fields:    { text: '"script_fields": {\n  "${1:my_field}": {\n    "script": { "source": "${2:params.factor}" }\n  }\n}', detail: '脚本计算字段' },
  runtime_mappings: { text: '"runtime_mappings": {\n  "${1:runtime_field}": {\n    "type": "${2|keyword,long,double,date,boolean|}",\n    "script": { "source": "${3:emit(params.x)}" }\n  }\n}', detail: '运行时字段' },
  search_after:     { text: '"search_after": ["${1:value}"]',                              detail: '深分页游标' },
  min_score:        { text: '"min_score": ${1:0}',                                          detail: '最低评分过滤' },
  /* 1439：lint 白名单已接受的合法根键，补全补齐 */
  aggregations:     { text: '"aggregations": {\n  ${0}\n}',                                 detail: '聚合统计（aggs 的别名）' },
  pit:              { text: '"pit": {\n  "id": "${1:pitId}",\n  "keep_alive": "${2:1m}"\n}',   detail: '时间点（PIT）检索' },
  docvalue_fields:  { text: '"docvalue_fields": [ "${1:field}" ]',                          detail: '按列存取值（doc_values）返回字段' },
  stored_fields:    { text: '"stored_fields": [ "${1:field}" ]',                            detail: '返回 stored 字段' },
  fields:           { text: '"fields": [ "${1:field}" ]',                                   detail: 'fields API 返回字段' },
  indices_boost:    { text: '"indices_boost": [ { "${1:index}": ${2:1.2} } ]',               detail: '按索引加权' },
  search_type:      { text: '"search_type": "${1|query_then_fetch,dfs_query_then_fetch|}"',  detail: '搜索类型（打分一致性/两阶段）' },
  terminate_after:  { text: '"terminate_after": ${1:1000}',                                 detail: '最多检查 N 篇后提前结束' },
  timeout:          { text: '"timeout": "${1:1s}"',                                         detail: '搜索超时（到时返回部分结果）' },
  explain:          { text: '"explain": ${1|true,false|}',                                  detail: '返回打分解释' },
  version:          { text: '"version": ${1|true,false|}',                                  detail: '返回文档版本号' },
  seq_no_primary_term: { text: '"seq_no_primary_term": ${1|true,false|}',                   detail: '返回 seq_no / primary_term（乐观并发）' },
  track_scores:     { text: '"track_scores": ${1|true,false|}',                             detail: '排序时仍计算得分' },
  slice:            { text: '"slice": {\n  "field": "${1:_id}",\n  "id": ${2:0},\n  "max": ${3:2}\n}', detail: '切片并行检索' },
  routing:          { text: '"routing": "${1:routing}"',                                     detail: '路由值（定向分片）' },
  preference:       { text: '"preference": "${1|_local,_primary,_only_local|}"',             detail: '分片偏好（缓存/主副选择）' },
  ext:              { text: '"ext": {\n  ${0}\n}',                                          detail: '搜索扩展参数（插件用）' },
  stats:            { text: '"stats": [ "${1:group}" ]',                                    detail: '统计分组标签（打点用）' },
  profile:          { text: '"profile": ${1|true,false|}',                                  detail: '耗时剖析（profile 树）' },
};
/** 叶子查询子句（值位是字段名对象）。
 2.6.0：exists 移出——其键位钉死 "field"（exists-key 档），出字段名档是语义误导。
 1439：改由 OPS_META.form==='field' 派生——match_phrase_prefix / intervals / span_term /
 text_expansion / geo_* / shape 等同类子句此前不在册，其体里敲引号给的是 query-type（算子
 骨架写进字段位必非法）。单一真源派生，新增字段形态算子自动并档。 */
const FIELD_CLAUSES: ReadonlySet<string> = new Set(
  Object.entries(OPS_META).filter(([op, meta]) => meta.form === 'field' && op !== 'exists').map(([op]) => op),
);

/* ═══ 1439：子句体键位补全（非字段形态）═══
   表内是官方体的结构键；queryBodyKeys 再并上 OPS_META/WRAP_PARAMS/MULTI_META 的参数键，
   参数表扩容时补全自动跟随，不另抄一份。 */
export interface BodyKey { key: string; insert: string; detail: string }
const B = (key: string, insert: string, detail: string): BodyKey => ({ key, insert, detail });
const NAME_KEY = B('_name', '"_name": "${1:name}"', '命名查询（命中归因）');

export const QUERY_BODY_KEYS: Record<string, BodyKey[]> = {
  bool: [
    B('must', '"must": [\n  ${0}\n]', '全部必须匹配（参与评分）'),
    B('filter', '"filter": [\n  ${0}\n]', '全部必须匹配（不计分，可缓存）'),
    B('should', '"should": [\n  ${0}\n]', '满足任一（配合 minimum_should_match）'),
    B('must_not', '"must_not": [\n  ${0}\n]', '全部必须不匹配'),
    B('minimum_should_match', '"minimum_should_match": "${1:1}"', 'should 至少满足的个数/百分比'),
    B('boost', '"boost": ${1:1}', '加权'),
    NAME_KEY,
  ],
  constant_score: [B('filter', '"filter": {\n  ${0}\n}', '计分来源查询（恒定分）'), B('boost', '"boost": ${1:1}', '恒定分'), NAME_KEY],
  dis_max: [B('queries', '"queries": [\n  ${0}\n]', '子查询列表（取最高分）'), B('tie_breaker', '"tie_breaker": ${1:0.7}', '近似命中的折算系数'), B('boost', '"boost": ${1:1}', '加权')],
  function_score: [
    B('query', '"query": {\n  ${0}\n}', '基础查询（可选）'),
    B('functions', '"functions": [\n  ${0}\n]', '评分函数列表'),
    B('boost', '"boost": ${1:1}', '全局加权'),
    B('boost_mode', '"boost_mode": "${1|multiply,replace,sum,avg,max,min|}"', '函数分与查询分的合并方式'),
    B('score_mode', '"score_mode": "${1|multiply,sum,avg,first,max,min|}"', '多个函数分的合并方式'),
    B('min_score', '"min_score": ${1:0}', '低于此分的命中丢弃'),
    B('max_boost', '"max_boost": ${1:10}', '函数分上限'),
  ],
  /* function_score.functions[] 元素（数组帧 lastKey='functions'） */
  __function__: [
    B('filter', '"filter": {\n  ${0}\n}', '只对该查询命中的文档生效'),
    B('weight', '"weight": ${1:1}', '固定权重'),
    B('random_score', '"random_score": { "seed": ${1:1}, "field": "${2:_seq_no}" }', '随机分（可复现要固定 seed）'),
    B('script_score', '"script_score": { "script": { "source": "${1:params.w ?? 1}" } }', '脚本分'),
    B('field_value_factor', '"field_value_factor": { "field": "${1:field}", "factor": ${2:1}, "missing": ${3:1} }', '字段值转分'),
    B('gauss', '"gauss": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }', '高斯衰减'),
    B('linear', '"linear": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }', '线性衰减'),
    B('exp', '"exp": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }', '指数衰减'),
  ],
  boosting: [B('positive', '"positive": {\n  ${0}\n}', '必须匹配的正例'), B('negative', '"negative": {\n  ${0}\n}', '匹配则降权'), B('negative_boost', '"negative_boost": ${1:0.5}', '反例降权系数')],
  script_score: [B('query', '"query": {\n  ${0}\n}', '基础查询'), B('script', '"script": { "source": "${1:_score}" }', '评分脚本'), B('min_score', '"min_score": ${1:0}', '最低分')],
  pinned: [
    B('ids', '"ids": [${1:\"id\"}]', '置顶文档 ID'),
    B('docs', '"docs": [\n  { "_id": "${1:id}", "_index": "${2:index}" }\n]', '跨索引置顶文档'),
    B('organic', '"organic": {\n  ${0}\n}', '其余文档的召回查询'),
    B('boost', '"boost": ${1:1}', '置顶文档加权'),
  ],
  nested: [
    B('path', '"path": "${1:path}"', '嵌套文档路径'),
    B('query', '"query": {\n  ${0}\n}', '嵌套文档内的查询'),
    B('score_mode', '"score_mode": "${1|avg,sum,max,min,none|}"', '多根文档评分合并'),
    B('ignore_unmapped', '"ignore_unmapped": ${1|false,true|}', '路径未映射时忽略'),
  ],
  has_child: [
    B('type', '"type": "${1:childType}"', '子文档 join 名'),
    B('query', '"query": {\n  ${0}\n}', '对子文档的查询'),
    B('score_mode', '"score_mode": "${1|avg,sum,max,min,none|}"', '多个子文档的评分合并'),
    B('min_children', '"min_children": ${1:1}', '至少命中几个子文档'),
    B('max_children', '"max_children": ${1:10}', '至多命中几个子文档'),
    B('ignore_unmapped', '"ignore_unmapped": ${1|false,true|}', '类型未映射时忽略'),
  ],
  has_parent: [
    B('parent_type', '"parent_type": "${1:parentType}"', '父文档 join 名'),
    B('query', '"query": {\n  ${0}\n}', '对父文档的查询'),
    B('score_mode', '"score_mode": "${1|none,score|}"', '父文档评分是否计入'),
    B('ignore_unmapped', '"ignore_unmapped": ${1|false,true|}', '类型未映射时忽略'),
  ],
  multi_match: [
    B('query', '"query": "${1:value}"', '检索文本'),
    B('fields', '"fields": ["${1:field}"]', '参与检索的字段（可用 field^2 加权）'),
    B('type', '"type": "${1|best_fields,most_fields,cross_fields,phrase,phrase_prefix,bool_prefix|}"', '匹配策略'),
  ],
  query_string: [
    B('query', '"query": "${1:value}"', '查询串（支持 AND/OR/字段:值）'),
    B('default_field', '"default_field": "${1:field}"', '未写字段时的默认字段'),
    B('fields', '"fields": ["${1:field}"]', '搜索字段列表'),
  ],
  simple_query_string: [
    B('query', '"query": "${1:+value -exclude}"', '简单查询串（+/-/短语/通配）'),
    B('fields', '"fields": ["${1:field}"]', '搜索字段列表'),
  ],
  combined_fields: [
    B('query', '"query": "${1:value}"', '检索文本'),
    B('fields', '"fields": ["${1:field}"]', '组合检索的字段'),
  ],
  more_like_this: [
    B('fields', '"fields": ["${1:field}"]', '相似度比较字段'),
    B('like', '"like": "${1:text}"', '示例文本/文档'),
    B('ids', '"ids": [${1:\"id\"}]', '以这些文档为示例'),
  ],
  ids: [B('values', '"values": ["${1:id}"]', '文档 ID 列表')],
  script: [B('script', '"script": { "source": "${1:params._source}" }', '过滤脚本')],
  wrapper: [B('query', '"query": "${1:base64}"', 'Base64 编码的查询')],
  percolate: [B('field', '"field": "${1:queryField}"', 'percolator 字段'), B('document', '"document": {\n  ${0}\n}', '要反查的文档')],
  rule: [B('ruleset_id', '"ruleset_id": "${1:ruleset}"', '规则集 ID'), B('match_criteria', '"match_criteria": {\n  ${0}\n}', '规则匹配条件'), B('match_predicate', '"match_predicate": {\n  ${0}\n}', '规则命中后的查询')],
  template: [B('id', '"id": "${1:templateId}"', '搜索模板 ID'), B('params', '"params": {\n  ${0}\n}', '模板参数')],
  parent_id: [B('type', '"type": "${1:parentType}"', '父文档 join 名'), B('id', '"id": "${1:parentId}"', '父文档 ID')],
  type: [B('value', '"value": "${1:type}"', '7.x 映射类型名')],
  rank_feature: [B('field', '"field": "${1:rankField}"', '特征字段'), B('boost', '"boost": ${1:1}', '加权'), B('saturation', '"saturation": { "pivot": ${1:1} }', '饱和函数'), B('log', '"log": { "scaling_factor": ${1:1} }', '对数函数'), B('sigmoid', '"sigmoid": { "pivot": ${1:1}, "exponent": ${2:1} }', 'S 型函数'), B('linear', '"linear": {}', '线性函数')],
  distance_feature: [B('field', '"field": "${1:field}"', '距离特征字段'), B('origin', '"origin": "${1:now}"', '原点'), B('pivot', '"pivot": "${1:7d}"', '距离尺度'), B('boost', '"boost": ${1:1}', '加权')],
  knn: [
    B('field', '"field": "${1:vectorField}"', '向量字段'),
    B('query_vector', '"query_vector": [${1:0.1}]', '查询向量'),
    B('k', '"k": ${1:10}', '返回近邻数'),
    B('num_candidates', '"num_candidates": ${1:100}', '每分片候选数'),
    B('filter', '"filter": {\n  ${0}\n}', '近邻过滤查询'),
    B('similarity', '"similarity": ${1:0.8}', '相似度下限'),
    B('boost', '"boost": ${1:1}', '加权'),
  ],
  semantic: [B('field', '"field": "${1:semanticField}"', '语义字段'), B('query', '"query": "${1:text}"', '语义检索文本')],
  sparse_vector: [B('field', '"field": "${1:sparseField}"', '稀疏向量字段'), B('query_vector', '"query_vector": { "${1:token}": ${2:0.5} }', '稀疏查询向量')],
  bitmap_terms: [B('field', '"field": "${1:field}"', '字段'), B('value', '"value": "${1:base64}"', 'Base64 位图')],
  span_near: [B('clauses', '"clauses": [\n  ${0}\n]', '子跨度列表'), B('slop', '"slop": ${1:1}', '允许的最大间隔'), B('in_order', '"in_order": ${1|true,false|}', '是否要求顺序')],
  span_or: [B('clauses', '"clauses": [\n  ${0}\n]', '任一命中的子跨度')],
  span_not: [B('include', '"include": {\n  ${0}\n}', '包含跨度'), B('exclude', '"exclude": {\n  ${0}\n}', '排除跨度')],
  span_first: [B('match', '"match": {\n  ${0}\n}', '内部跨度'), B('end', '"end": ${1:3}', '必须出现在前 N 个位置')],
  span_containing: [B('little', '"little": {\n  ${0}\n}', '内部跨度'), B('big', '"big": {\n  ${0}\n}', '外部跨度')],
  span_within: [B('little', '"little": {\n  ${0}\n}', '内部跨度'), B('big', '"big": {\n  ${0}\n}', '外部跨度')],
  span_multi: [B('match', '"match": {\n  ${0}\n}', '多词查询（term/prefix/wildcard 等）')],
  span_field_masking: [B('query', '"query": {\n  ${0}\n}', '被掩码的查询'), B('field', '"field": "${1:field}"', '掩码字段')],
  match_all: [B('boost', '"boost": ${1:1}', '加权'), NAME_KEY],
  /* inner_hits：nested / has_child / collapse / top_hits 共用（父键判定见 dslContext） */
  inner_hits: [
    B('from', '"from": ${1:0}', '组内跳过条数'),
    B('size', '"size": ${1:3}', '组内返回条数'),
    B('name', '"name": "${1:hits}"', '结果里的命名（拿回 inner_hits）'),
    B('sort', '"sort": [\n  ${0}\n]', '组内排序'),
    B('_source', '"_source": ${1|false,true|}', '组内返回字段'),
    B('highlight', '"highlight": {\n  ${0}\n}', '组内高亮'),
  ],
  rescore: [
    B('window_size', '"window_size": ${1:50}', '前 N 条参与重排'),
    B('query', '"query": {\n  ${0}\n}', '重排查询（配合 rescore_query）'),
    B('query_weight', '"query_weight": ${1:1}', '原分权重'),
    B('rescore_query', '"rescore_query": {\n  ${0}\n}', '重排查询'),
    B('rescore_query_weight', '"rescore_query_weight": ${1:1}', '重排分权重'),
    B('score_mode', '"score_mode": "${1|total,multiply,avg,max,min|}"', '合并方式'),
  ],
  pit: [B('id', '"id": "${1:pitId}"', 'Point-in-time ID'), B('keep_alive', '"keep_alive": "${1:1m}"', '保活时长')],
  /* function_score.functions[] 里的 decay / random_score / field_value_factor 体 */
  gauss: [B('origin', '"origin": "${1:0}"', '原点'), B('scale', '"scale": "${1:10}"', '衰减尺度'), B('offset', '"offset": ${1:0}', '无衰减区间'), B('decay', '"decay": ${1:0.5}', '衰减到该比例')],
  linear: [B('origin', '"origin": "${1:0}"', '原点'), B('scale', '"scale": "${1:10}"', '衰减尺度'), B('offset', '"offset": ${1:0}', '无衰减区间'), B('decay', '"decay": ${1:0.5}', '衰减到该比例')],
  exp: [B('origin', '"origin": "${1:0}"', '原点'), B('scale', '"scale": "${1:10}"', '衰减尺度'), B('offset', '"offset": ${1:0}', '无衰减区间'), B('decay', '"decay": ${1:0.5}', '衰减到该比例')],
  random_score: [B('seed', '"seed": ${1:1}', '随机种子（固定后结果可复现）'), B('field', '"field": "${1:_seq_no}"', '按该字段值参与随机')],
  field_value_factor: [B('field', '"field": "${1:field}"', '取值字段'), B('factor', '"factor": ${1:1}', '放大系数'), B('modifier', '"modifier": "${1|none,log,log1p,log2p,ln,ln1p,ln2p,square,sqrt,reciprocal|}"', '取值变换'), B('missing', '"missing": ${1:1}', '缺值时的默认值')],
  /* 合成档：根层容器体（owner 键判定） */
  __script_field__: [B('script', '"script": {\n  ${0}\n}', '脚本（source/lang/params）')],
  __script__: [B('source', '"source": "${1:doc[\'field\'].value}"', '脚本源码'), B('lang', '"lang": "${1:painless}"', '脚本语言'), B('params', '"params": {\n  ${0}\n}', '脚本参数'), B('id', '"id": "${1:storedScriptId}"', '已存脚本 ID')],
  __runtime_field__: [B('type', '"type": "${1|keyword,long,double,date,boolean,ip|}"', '运行时字段类型'), B('script', '"script": {\n  ${0}\n}', '取值脚本'), B('format', '"format": "${1:yyyy-MM-dd}"', 'date 格式')],
  /* highlight.fields.<字段>.{} 的字段级配置（比根层 highlight 体少了 fields） */
  __highlight_field__: [
    B('type', '"type": "${1|unified,plain,fvh|}"', '该字段的高亮器'),
    B('fragment_size', '"fragment_size": ${1:100}', '片段长度'),
    B('number_of_fragments', '"number_of_fragments": ${1:3}', '片段数'),
    B('pre_tags', '"pre_tags": ["${1:<em>}"]', '前置标记'),
    B('post_tags', '"post_tags": ["${1:</em>}"]', '后置标记'),
    B('require_field_match', '"require_field_match": ${1|false,true|}', '是否只高亮命中字段'),
    B('no_match_size', '"no_match_size": ${1:0}', '未命中时返回的片段长度'),
    B('boundary_scanner', '"boundary_scanner": "${1|sentence,word|}"', '片段边界扫描'),
  ],
  collapse: [B('field', '"field": "${1:field}"', '折叠字段（每个值只留一条）'), B('inner_hits', '"inner_hits": { "name": "${1:group}", "size": ${2:1} }', '折叠组内命中')],
  /* _source 对象形态（裁剪返回字段）；串/数组形态走数组白名单轨 */
  _source: [
    B('includes', '"includes": [\n  "${1:field}"\n]', '只返回这些字段（支持通配）'),
    B('excludes', '"excludes": [\n  "${1:field}"\n]', '排除这些字段（支持通配）'),
    B('include', '"include": ["${1:field}"]', '旧式写法：只返回这些字段'),
    B('exclude', '"exclude": ["${1:field}"]', '旧式写法：排除这些字段'),
  ],
  highlight: [
    B('fields', '"fields": {\n  ${0}\n}', '高亮字段'),
    B('type', '"type": "${1|unified,plain,fvh|}"', '高亮器类型'),
    B('pre_tags', '"pre_tags": ["${1:<em>}"]', '前置标记'),
    B('post_tags', '"post_tags": ["${1:</em>}"]', '后置标记'),
    B('require_field_match', '"require_field_match": ${1|false,true|}', '是否只高亮命中的字段'),
    B('number_of_fragments', '"number_of_fragments": ${1:3}', '片段数'),
    B('fragment_size', '"fragment_size": ${1:100}', '片段长度'),
  ],
};

/** 参数 → 键骨架（与 aggBodyKeys 同手法；只给键位，值形态按 kind 给默认占位） */
function paramInsert(p: ParamMeta): string {
  if (p.kind === 'number') return '"' + p.key + '": ${1:10}';
  if (p.kind === 'boolean') return '"' + p.key + '": ${1|true,false|}';
  if (p.kind === 'enum') return '"' + p.key + '": "${1|' + (p.options || []).join(',') + '|}"';
  if (p.kind === 'json') return '"' + p.key + '": {\n  ${0}\n}';
  if (p.kind === 'json-array') return '"' + p.key + '": [\n  ${0}\n]';
  return '"' + p.key + '": "${1:' + p.key + '}"';
}

/** 子句体键位（结构键 + 参数表并集）——参数表扩容自动跟随，不另抄清单 */
export function queryBodyKeys(op: string): BodyKey[] {
  const out = [...(QUERY_BODY_KEYS[op] || [])];
  const seen = new Set(out.map(x => x.key));
  const params: ParamMeta[] = [
    ...(OPS_META[op]?.params || []),
    ...(WRAP_PARAMS[op] || []),
    ...(MULTI_META[op]?.params || []),
  ];
  for (const p of params) {
    if (seen.has(p.key)) continue;
    out.push({ key: p.key, insert: paramInsert(p), detail: '可选参数' });
    seen.add(p.key);
  }
  return out;
}

/* 字段子句的字段配置对象键（match.<field>.{query/operator} / fuzzy.<field>.{value/…}）——
   字段名是自由键，配置键才是可枚举的；此前这里同样回 query-type。 */
export const CLAUSE_VALUE_KEYS: Record<string, BodyKey[]> = {
  match: [
    B('query', '"query": "${1:value}"', '检索文本'),
    B('operator', '"operator": "${1|and,or|}"', '词项逻辑'),
    B('fuzziness', '"fuzziness": "${1:AUTO}"', '模糊度'),
    B('minimum_should_match', '"minimum_should_match": "${1:1}"', '至少命中词数'),
    B('analyzer', '"analyzer": "${1:standard}"', '分词器'),
    B('boost', '"boost": ${1:1}', '加权'),
  ],
  match_phrase: [B('query', '"query": "${1:value}"', '短语文本'), B('slop', '"slop": ${1:0}', '允许的词间间隔'), B('boost', '"boost": ${1:1}', '加权')],
  match_phrase_prefix: [B('query', '"query": "${1:value}"', '短语前缀文本'), B('max_expansions', '"max_expansions": ${1:50}', '前缀展开上限'), B('slop', '"slop": ${1:0}', '允许的词间间隔')],
  match_bool_prefix: [B('query', '"query": "${1:value}"', '文本（末词按前缀）'), B('operator', '"operator": "${1|and,or|}"', '词项逻辑')],
  term: [B('value', '"value": "${1:value}"', '精确值'), B('case_insensitive', '"case_insensitive": ${1|true,false|}', '忽略大小写'), B('boost', '"boost": ${1:1}', '加权')],
  prefix: [B('value', '"value": "${1:prefix}"', '前缀'), B('case_insensitive', '"case_insensitive": ${1|true,false|}', '忽略大小写')],
  wildcard: [B('value', '"value": "${1:pref*}"', '通配模式'), B('case_insensitive', '"case_insensitive": ${1|true,false|}', '忽略大小写'), B('rewrite', '"rewrite": "${1:constant_score}"', '重写策略')],
  regexp: [B('value', '"value": "${1:pattern.*}"', '正则'), B('flags', '"flags": "${1:ALL}"', '正则选项'), B('max_determinized_states', '"max_determinized_states": ${1:10000}', '自动机状态上限')],
  fuzzy: [B('value', '"value": "${1:value}"', '目标词'), B('fuzziness', '"fuzziness": "${1:AUTO}"', '模糊度'), B('prefix_length', '"prefix_length": ${1:0}', '前缀不变长度'), B('transpositions', '"transpositions": ${1|true,false|}', '允许换位')],
  span_term: [B('value', '"value": "${1:term}"', '词项')],
  intervals: [
    B('match', '"match": { "query": "${1:value}" }', '匹配文本'),
    B('all_of', '"all_of": {\n  "ordered": ${1|true,false|},\n  "intervals": [\n    ${0}\n  ]\n}', '有序/无序全部命中'),
    B('any_of', '"any_of": { "intervals": [\n  ${0}\n] }', '任一命中'),
    B('prefix', '"prefix": { "prefix": "${1:pre}" }', '前缀'),
    B('wildcard', '"wildcard": { "pattern": "${1:pre*}" }', '通配'),
    B('fuzzy', '"fuzzy": { "term": "${1:term}" }', '模糊'),
    B('filter', '"filter": { "script": { "source": "true" } }', '脚本过滤'),
  ],
  geo_shape: [B('shape', '"shape": {\n  ${0}\n}', '形状对象'), B('relation', '"relation": "${1|INTERSECTS,DISJOINT,WITHIN|}"', '空间关系')],
  geo_bounding_box: [B('top_left', '"top_left": { "lat": ${1:0}, "lon": ${2:0} }', '左上角点'), B('bottom_right', '"bottom_right": { "lat": ${1:0}, "lon": ${2:0} }', '右下角点')],
  geo_polygon: [B('points', '"points": [\n  { "lat": ${1:0}, "lon": ${2:0} }\n]', '多边形顶点')],
  text_expansion: [B('model_id', '"model_id": "${1:model}"', '推理模型 ID'), B('model_text', '"model_text": "${1:text}"', '待扩展文本')],
};

/** 字段配置键位（结构键 + OPS_META 参数并集，同上不另抄清单） */
export function clauseValueKeys(op: string): BodyKey[] {
  const out = [...(CLAUSE_VALUE_KEYS[op] || [])];
  const seen = new Set(out.map(x => x.key));
  for (const p of OPS_META[op]?.params || []) {
    if (seen.has(p.key)) continue;
    out.push({ key: p.key, insert: paramInsert(p), detail: '可选参数' });
    seen.add(p.key);
  }
  return out;
}

/* 检索器变体体键（结构键 + RETRIEVER_PARAMS 参数并集） */
const RETRIEVER_STRUCT: Record<string, BodyKey[]> = {
  standard: [B('query', '"query": {\n  ${0}\n}', '召回查询（BM25）')],
  knn: [B('field', '"field": "${1:vectorField}"', '向量字段'), B('query_vector', '"query_vector": [${1:0.1}]', '查询向量'), B('filter', '"filter": {\n  ${0}\n}', '近邻过滤查询')],
  rrf: [B('retrievers', '"retrievers": [\n  ${0}\n]', '参与融合的子检索器')],
  linear: [B('retrievers', '"retrievers": [\n  { "retriever": {}, "weight": ${1:1} }\n]', '线性加权的子检索器（带 weight）')],
  text_similarity_reranker: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器')],
  rule: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器（可缺席）'), B('match_criteria', '"match_criteria": {\n  ${0}\n}', '规则匹配条件')],
  pinned: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器'), B('docs', '"docs": [\n  ${0}\n]', '置顶文档'), B('ids', '"ids": [${1:\"id\"}]', '置顶文档 ID')],
  diversify: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器'), B('query_vector', '"query_vector": [${1:0.1}]', '多样性参考向量')],
  rescorer: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器'), B('rescore', '"rescore": {\n  ${0}\n}', '重打分体')],
};
export function retrieverBodyKeys(op: string): BodyKey[] {
  const out = [...(RETRIEVER_STRUCT[op] || [])];
  const seen = new Set(out.map(x => x.key));
  for (const p of RETRIEVER_PARAMS[op] || []) {
    if (seen.has(p.key)) continue;
    out.push({ key: p.key, insert: paramInsert(p), detail: '可选参数' });
    seen.add(p.key);
  }
  return out;
}

/* 建议器体键（suggest.<名>.<term|phrase|completion>.{}）——此前该层什么都不出 */
export const SUGGEST_BODY_KEYS: Record<string, BodyKey[]> = {
  term: [
    B('field', '"field": "${1:field}"', '候选来源字段'),
    B('text', '"text": "${1:query}"', '输入文本'),
    B('prefix', '"prefix": "${1:prefix}"', '前缀（优先于 text）'),
    B('suggest_mode', '"suggest_mode": "${1|missing,popular,always|}"', '建议策略'),
    B('min_word_length', '"min_word_length": ${1:3}', '最短词长'),
    B('max_edits', '"max_edits": ${1:2}', '最大编辑距离'),
    B('sort', '"sort": "${1|score,frequency|}"', '候选排序'),
    B('size', '"size": ${1:5}', '每个词的建议数'),
    B('analyzer', '"analyzer": "${1:standard}"', '分词器'),
  ],
  phrase: [
    B('field', '"field": "${1:field}"', '候选来源字段'),
    B('text', '"text": "${1:query}"', '输入文本'),
    B('prefix', '"prefix": "${1:prefix}"', '前缀（优先于 text）'),
    B('gram_size', '"gram_size": ${1:3}', 'n-gram 大小'),
    B('analyzer', '"analyzer": "${1:standard}"', '分词器'),
    B('highlight', '"highlight": { "pre_tag": "${1:<em>}", "post_tag": "${2:</em>}" }', '候选中的纠错高亮'),
    B('collate', '"collate": {\n  ${0}\n}', '候选校验查询'),
    B('size', '"size": ${1:5}', '候选数'),
    B('max_errors', '"max_errors": ${1:1}', '最大错误数'),
  ],
  completion: [
    B('field', '"field": "${1:suggestField}"', 'completion 字段'),
    B('text', '"text": "${1:query}"', '输入文本'),
    B('prefix', '"prefix": "${1:prefix}"', '前缀（优先于 text）'),
    B('contexts', '"contexts": {\n  ${0}\n}', '上下文过滤（category/geo）'),
    B('fuzzy', '"fuzzy": { "fuzziness": ${1:1} }', '模糊匹配'),
    B('skip_duplicates', '"skip_duplicates": ${1|true,false|}', '同文本去重'),
    B('size', '"size": ${1:5}', '候选数'),
    B('analyzer', '"analyzer": "${1:simple}"', '输入分词器'),
    B('search_analyzer', '"search_analyzer": "${1:simple}"', '索引侧分词器'),
  ],
};
export function suggesterBodyKeys(op: string): BodyKey[] {
  return [...(SUGGEST_BODY_KEYS[op] || [])];
}

/* 数组键链白名单位（对标 Kibana sort/_source 补全）。两类白名单各管一个位：
 - 元素对象键位（"sort": [{ "<光标" }]）：数组属主键 ∈ DSL_ARRAY_OBJKEY_CHAINS（=sort，
 排序字段位；top_hits 等嵌套 sort 同构命中），dslContext 出 array-elem-key 档；
 - 元素串位（"_source": ["<光标"]）：数组属主键 ∈ DSL_ARRAY_ELEM_CHAINS（=_source，
 返回字段裁剪），dslKeyGuard 首元素位按白名单回传键链、续元素位走既有 arrayElem 口，
 消费侧出 fields() 字段候选。
 白名单外数组（terms 值/must/ids/filter 元素等）维持既有压制零增量——540/543 契约钉的是
 值位 regime 与 terms 值数组元素位（dslValueTiers540 C 段/544 C 段既有断言），键链白名单
 是新增位，两既有钉面不沾。⚠ dslArrayElemFieldAt 本体零改动（dslValueTiers544 B 段把
 ('_source', null)→null 钉死，_source 走本白名单新轨，不共函数）。 */
const DSL_ARRAY_OBJKEY_CHAINS = new Set(['sort', 'fields']);
export const DSL_ARRAY_ELEM_CHAINS = new Set(['_source', 'stored_fields', 'docvalue_fields', 'fields', 'includes', 'excludes']);

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

/**
 * 1439：光标是否在**值位**（`"key": |` 的冒号之后）。
 * 聚合体/建议器/检索器的键补全只看栈结构会把值位也当键位
 * （`{"aggs":{"a":{"terms":{"field": "` 会错误地给出参数键）。判据：取当前串的开引号
 * （不在串内则取光标前）往前看最后一个非空字符是不是冒号。
 */
function atValuePosition(text: string, inStr: boolean): boolean {
  let i = text.length - 1;
  if (inStr) {
    while (i >= 0 && !(text[i] === '"' && !isEscapedQuote(text, i))) i--;
    i--;
  }
  while (i >= 0 && /\s/.test(text[i])) i--;
  return i >= 0 && text[i] === ':';
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
  /* 1439：值位（冒号之后）不出键位档——否则 `"field": "` 这种位置会被当成键位 */
  const valuePos = atValuePosition(text, inStr);
  let qIdx = keys.lastIndexOf('query');
  /* 1138：post_filter / 顶层 knn.filter 也是查询容器——此前只认 query 键，
     这两处合法查询位不出 query-type/字段候选。顶层 knn 是首选 kNN 形态。 */
  if (qIdx < 0) {
    const pf = keys.lastIndexOf('post_filter');
    if (pf >= 0 && pf < stack.length - 1) qIdx = pf;
    else {
      const knn = keys.lastIndexOf('knn');
      const knnFilter = keys.lastIndexOf('filter');
      if (knn >= 0 && knnFilter > knn && knnFilter < stack.length - 1) qIdx = knnFilter;
    }
  }
  /* 在 query 内 ⟺ 某层帧 lastKey='query' 且其上方还有帧（query 值容器未闭合）。
 qIdx 即栈顶 → query 值已闭合（或尚在值位前），光标回到 query 所在层。 */
  const inQuery = qIdx >= 0 && qIdx < stack.length - 1;
  if (!inQuery) {
    /* 2.6.0 聚合上下文（spec ）：lastIndexOf 取最近 aggs/aggregations 帧——嵌套聚合天然支持。
 innerA.length===1 → aggs 容器键位（agg-name，实例自由命名）；
 ===2 → 实例值对象键位（agg-type，聚合类型骨架）。 */
    const aIdx = Math.max(keys.lastIndexOf('aggs'), keys.lastIndexOf('aggregations'));
    if (aIdx >= 0 && aIdx < stack.length - 1) {
      const innerA = stack.slice(aIdx + 1);
      if (innerA.length === 1 && innerA[0].type === '{') return { kind: 'agg-name' };
      if (innerA.length === 2 && innerA[1].type === '{') return { kind: 'agg-type' };
      /* 1439：聚合体内部键位（aggs → 实例名 → 类型键 → body {}）——
         此前这里什么都没有，Ctrl+Space 只给文档里出现过的词（a/aggs/terms），
         真实参数键（size/min_doc_count/field…）一个也补不出来。 */
      if (innerA.length === 3 && innerA[2].type === '{' && innerA[1].lastKey && !valuePos) {
        /* filter 聚合的体是**查询子句**（{"filter":{"term":{…}}}），不是聚合参数——
           这里必须出 query-type（match/term/bool…），否则只剩一个 aggs 候选。 */
        if (innerA[1].lastKey === 'filter') return { kind: 'query-type' };
        return { kind: 'agg-body-key', op: innerA[1].lastKey };
      }
      /* 1439：filters 聚合的**具名子过滤器体**同样是查询：
         {"filters":{"filters":{"x":{ <cursor> }}}} → aggs → filters(类型) → filters(参数) → 名 → {}
         命名位本身（再上一层的 { 仍在 filters 参数对象里）不出 query-type。 */
      if (stack.length >= 5 && stack[stack.length - 1].type === '{'
          && stack[stack.length - 3].lastKey === 'filters'
          && stack[stack.length - 4].lastKey === 'filters' && !valuePos) {
        return { kind: 'query-type' };
      }
    }
    /* 1439：排序链两个位置此前只给文档词——
       · 简写方向值 {"sort":[{"title":" → asc/desc
       · 字段配置键 {"sort":[{"title":{ → order/mode/missing/unmapped_type/nested */
    if (valuePos && stack.length >= 3 && stack[stack.length - 1].type === '{'
        && stack[stack.length - 2].type === '[' && stack[stack.length - 3].lastKey === 'sort') {
      return { kind: 'sort-order' };
    }
    if (!valuePos && stack.length >= 4 && stack[stack.length - 1].type === '{'
        && stack[stack.length - 2].type === '{' && stack[stack.length - 3].type === '['
        && stack[stack.length - 4].lastKey === 'sort') {
      return { kind: 'sort-opt-key' };
    }
    /* 1439：highlight.fields 的键是**字段名**——此前这里只给文档里出现过的词，
       而高亮字段必须来自 mapping（打错就是静默不高亮）。 */
    if (!valuePos && stack.length >= 3 && stack[stack.length - 1].type === '{'
        && keys[keys.length - 2] === 'fields' && keys[keys.length - 3] === 'highlight') {
      return { kind: 'field-key' };
    }
    /* 1439：建议器类型键位——suggest → 建议器名 → {} 的内层键位（与 aggs 同形） */
    const sIdx = keys.lastIndexOf('suggest');
    if (sIdx >= 0 && sIdx < stack.length - 1) {
      const innerS = stack.slice(sIdx + 1);
      if (innerS.length === 2 && innerS[1].type === '{' && !valuePos) return { kind: 'suggester-type' };
    }
    /* 1439：检索器变体键位（8.14+ retriever 面）。
       · 顶层/嵌套：光标在 retriever 的值对象里（keys 末位是 retriever，栈顶是它刚开的 {）
       · 列表元素：rrf.retrievers[] / linear.retrievers[] 的元素对象键位——但 linear 的元素
         必须是 {retriever, weight} 包裹，那里给裸变体键会产生非法 DSL，故按父键排除。 */
    const rIdx = keys.lastIndexOf('retriever');
    if (rIdx >= 0) {
      const topF = stack[stack.length - 1];
      if (rIdx === stack.length - 2 && topF.type === '{' && !valuePos) return { kind: 'retriever-type' };
      if (stack.length >= 4 && topF.type === '{'
          && stack[stack.length - 2].type === '['
          && stack[stack.length - 3].lastKey === 'retrievers'
          && stack[stack.length - 4].lastKey !== 'linear' && !valuePos) return { kind: 'retriever-type' };
      /* 1439：检索器变体体键位——retriever.standard.{query}、retriever.knn.{field/query_vector}；
         此前这层什么都不出（Ctrl+Space 只有文档词）。 */
      if (rIdx === stack.length - 3) {
        const variant = stack[rIdx + 1].lastKey;
        if (variant && RETRIEVER_STRUCT[variant] && topF.type === '{' && !valuePos) {
          return { kind: 'retriever-body-key', op: variant };
        }
      }
    }
    /* 1439：根层/嵌套容器的体键位——collapse/highlight/knn/rescore/pit/inner_hits，
       以及 script_fields / runtime_mappings 下的自由字段体（合成键）。owner 键 = 栈顶容器
       的上一层帧 lastKey；此前这些位置一律 none。 */
    if (stack[stack.length - 1].type === '{' && !valuePos) {
      /* opening = 打开栈顶对象的那把键；container = 再上层的容器键（自由字段名容器用） */
      const opening = stack.length >= 2 ? stack[stack.length - 2].lastKey : null;
      const container = stack.length >= 3 ? stack[stack.length - 3].lastKey : null;
      /* 建议器体必须先判：suggest.<名>.<term|…>.{} 的 opening 是建议器类型名，
         落到同名查询子句表会给出 value/fuzziness 之类错误的键。 */
      const sIdx2 = keys.lastIndexOf('suggest');
      if (sIdx2 >= 0 && keys.length >= sIdx2 + 3 && opening && SUGGEST_BODY_KEYS[opening]) {
        return { kind: 'suggester-body-key', op: opening };
      }
      if (opening === 'script') return { kind: 'query-body-key', op: '__script__' };
      if (opening && QUERY_BODY_KEYS[opening]) return { kind: 'query-body-key', op: opening };
      if (container === 'script_fields') return { kind: 'query-body-key', op: '__script_field__' };
      /* highlight.fields.<字段>.{} —— 字段级高亮配置（fragment_size/pre_tags…） */
      if (container === 'fields' && stack.length >= 4 && stack[stack.length - 4].lastKey === 'highlight') {
        return { kind: 'query-body-key', op: '__highlight_field__' };
      }
      if (container === 'runtime_mappings') return { kind: 'query-body-key', op: '__runtime_field__' };
    }
    /* 数组元素对象键位（键链白名单位）——栈顶 { 的下层是 [ 数组帧、数组帧属主键
 ∈ DSL_ARRAY_OBJKEY_CHAINS（=sort，排序字段键位；top_hits 等嵌套 sort 同构命中）。
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
    /* exists-key：exists 值对象键位钉死 "field"（2.6.0 语义纠错，spec 规则 4） */
    if (top.type === '{' && clauseFrame.lastKey === 'exists') {
      return { kind: 'exists-key' };
    }
    /* 1439：字段子句的字段配置对象——{"match":{"title":{ <光标> }}} 是配 query/operator
       的位置，此前回 query-type（键位给出 bool/term 等算子骨架，写进去必非法）。 */
    if (top.type === '{' && inner.length >= 3) {
      const op = inner[inner.length - 3].lastKey;
      if (op && CLAUSE_VALUE_KEYS[op]) return { kind: 'clause-field-key', op };
    }
    /* 1439：子句体键位——bool 的 must/filter、nested 的 path/query、multi_match 的
       query/fields、ids 的 values…；此前一律 query-type。函数数组元素单独一档
       （frame 是数组帧，"functions" 不是子句名）。 */
    if (top.type === '{') {
      /* 数组帧自身的 lastKey 恒 null——属主键在下层帧（"functions": [ 的 'functions'） */
      if (clauseFrame.type === '[' && inner.length >= 3 && inner[inner.length - 3].lastKey === 'functions') {
        return { kind: 'query-body-key', op: '__function__' };
      }
      const op = clauseFrame.lastKey;
      if (op && QUERY_BODY_KEYS[op]) return { kind: 'query-body-key', op };
      /* function_score.functions[] 的函数体（gauss/linear/exp.<字段>.{}）——
         函数名在数组元素帧上，字段名在它下一层，普通子句判定看不到 */
      if (inner.length >= 5) {
        const fnFrame = inner[inner.length - 3];
        const arrFrame = inner[inner.length - 4];
        /* 数组帧的属主键在下一层帧上（"functions": [ 的 'functions'）——
           函数体可能嵌在 bool 元素里，不能假设 function_score 帧固定相对位置 */
        if (arrFrame.type === '[' && inner[inner.length - 5].lastKey === 'functions'
            && fnFrame.lastKey && QUERY_BODY_KEYS[fnFrame.lastKey]) {
          return { kind: 'query-body-key', op: fnFrame.lastKey };
        }
      }
    }
  }
  return { kind: 'query-type' };
}

/* DSL 字段位算子→类型亲和置顶序（纯函数，零 UI 变化——只调序不改候选集）。
 typePriorityForOp 的置顶档按「族」描述（text/keyword/number/date…），族展开为具体 mapping
 类型供字段清单 rank：族表对齐本仓既有口径——数值族九种（LuceneInput NUMERIC_TYPES 同表）、
 keyword 族含 wildcard（queryAstOps.opsForType keyword||wildcard 同分支）、date 族含
 date_nanos（MAPPING_TYPES 在册）；表外键兜底原样进序（typePriorityForOp 将来直出具体类型不破）。
 field 档候选按 ctx.clause（该子句值位同级 op 键）取亲和序：命中类型排前（保 prio 原序），
 未命中垫底（同档保原序）；无类型倾向算子 prio 空 → 原序直通。 */
const AFFINITY_FAMILIES: Record<string, string[]> = {
  text: ['text', 'annotated_text'],
  /* 两族改吃 queryAstOps 单源（值与原 literal 逐字同形）——keyword 三员直用；
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

/* DSL 字段位算子→类型置顶序（原始序版）——MonacoEditor 本地 orderFieldsByType
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

/* DSL 值位类型档静态候选（date/ip 两档）——语义平移自 sqlCompletion.VAL_FORMAT_HINTS
 同名档（date→date-math、ip→点分字面）与 LuceneInput DATE/IP_HINTS 先例；
 只提示格式不约束输入，任意值仍可手输。表外类型不入表=消费侧维持既有压制。
 本表**保持 date/ip 两档零变动**——dslValueTiers540 B 段把表内容钉死（keyword/
 boolean/long/integer/double toBeUndefined）、C 段把 term/keyword 与 range/数值 值位压制钉死，
 且 「date-math·ip 外值形态（产品裁决）」：':' 值串位的类型档 regime 冻结。
 keyword/数值/boolean 形态档落姊妹表 DSL_ARRAY_ELEM_TYPE_HINTS（见下），仅数组元素位
 链路消费；540 契约将来演进放开后两表可并。
 同步更新修订合并 date_nanos + geo_point 两档（dslValueTiers540 B 段 toBeUndefined
 负锁同步更新注记修订， root-bare-clause 修订同款先例）——姊妹面 546/547/552/已四批
 扩档（date_nanos≡date 族、geo_point '纬度,经度'），本表的 540 收窄 regime 不再成立，
 detail 与 values 自 sqlCompletion VAL_FORMAT_HINTS 同名档逐字平移；仍只提示格式不约束输入。 */
export const DSL_VALUE_TYPE_HINTS: Record<string, { detail: string; values: string[] }> = {
  date: { detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] },
  date_nanos: { detail: 'date-math 格式提示 · date_nanos', values: ['now-1d/d', 'now-1h/h'] },
  ip: { detail: '字面提示 · ip', values: ['192.168.0.1'] },
  geo_point: { detail: '字面提示 · geo_point', values: ['40.71,-74.01'] },
};

/* 数组元素位形态档（DSL_VALUE_TYPE_HINTS 的姊妹表，仅 terms 值数组续元素位链路
 消费——dslKeyGuard arrayElem 键链口）。keyword 族（含 wildcard——queryAstOps keyword||wildcard
 同分支口径）通配形态 pref*（wildcard 语义，QUERY_SNIPPETS wildcard 骨架 "${2:pref*}" 同形
 先例）、数值族八类型字面数字（整型 1/浮点 1.5，整浮分档只提示形态；AFFINITY number 族第九种
 unsigned_long 未点名不入表）、boolean true/false；detail 与 date/ip 档同形
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

/** 值位字段解析（dslKeyGuard 键链 → 字段路径；非字段值位返回 null 维持压制）。
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

/** 数组元素位字段解析（dslValueFieldAt 的姊妹——值数组的元素串位没有「当前键」，
 字段=数组属主键。"terms": { "<field>": [ "x", "<光标" ）→ ownerKey（数组的属主键）∈ 叶子
 子句（FIELD_CLAUSES 同表）且 elemKey 非空 → 字段=elemKey；must/ids/_source/sort 等非字段
 值数组 → null 维持压制。与 dslValueFieldAt 同一哲学：解析层只出「形态上的字段名」，是否真
 字段由消费侧 fields() 精确查表把关。首元素位（'[' 左邻）是 dslValueTiers540 契约 spec 既有
 断言钉死的压制面，不在解锁面——dslKeyGuard 只对续元素位（',' 左邻且栈顶 '['）回传键链。 */
export function dslArrayElemFieldAt(elemKey: string | null, ownerKey: string | null): string | null {
  if (elemKey && ownerKey && FIELD_CLAUSES.has(ownerKey)) return elemKey;
  return null;
}

/* W6：DevTools body 端点语义分级——bodyKind 判定 + settings/mapping 档数据源。
 纯函数零请求；settings 档复用 W1 SETTINGS_CATALOG（带中文说明）。
 增 'doc' 档——文档体（GET/PUT /idx/_doc/1、_create、_update、_source 端点）
 键位零候选（_source 字段名自由，出 root 查询键骨架是误导）、仅 field 值位白名单出字段候选。
 增 'analyze' 档——_analyze body（视图侧 bodyKind: () => 'analyze' 直传，
 不吃 bodyKindForPath 分派）；键位出 ANALYZE_KEY_SNIPPETS 八键骨架，
 值位分派见 MonacoEditor computeSuggestions analyze 分支。 */
export type BodyKind = 'search' | 'settings' | 'mapping' | 'template' | 'doc' | 'analyze' | 'none';

/* _analyze body 键骨架（analyze 档键位候选，snippet+detail 与 W6 三档同形态）。
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

/* analyzer/search_analyzer/normalizer/tokenizer 值位内置清单（analyze 档）。
 ik_* 拆两个实名（console 目标集群标配插件分词器）；实名自定义组件由视图侧
 dslAssist.analyzers() 通道并入（与 mapping 档 524+1 通道同一闭包契约），缺席=纯内置。 */
export const BUILTIN_ANALYZERS = ['standard', 'simple', 'whitespace', 'stop', 'keyword', 'pattern', 'fingerprint', 'ik_max_word', 'ik_smart'];

/* analysis 内置组件三张同族表（与 BUILTIN_ANALYZERS 同位置同风格——
 AnalyzerLab 自定义组合 tokenizer/char_filter/filter 三输入 datalist 候选源，各归其位，
 不再与 analyzer 名混表）。只做提示零请求；缺席=自定义组件名（视图侧 analyzers() 通道
 并入先例同轨，后续消费方照此并）。ik 族照附（插件分词组件，console 目标集群标配）。 */
export const BUILTIN_TOKENIZERS = ['standard', 'keyword', 'whitespace', 'letter', 'lowercase', 'ngram', 'edge_ngram', 'path_hierarchy', 'pattern', 'ik_max_word', 'ik_smart'];
export const BUILTIN_CHAR_FILTERS = ['html_strip', 'mapping', 'pattern_replace'];
export const BUILTIN_TOKEN_FILTERS = ['lowercase', 'stop', 'asciifolding', 'stemmer', 'synonym', 'synonym_graph', 'trim', 'unique', 'truncate', 'word_delimiter', 'shingle', 'snowball', 'ik_max_word', 'ik_smart'];

/* analysis 内置组件名中文释义表（AnalyzerLab 四 datalist option 挂 title——
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

/* analyzer 高频参数中文词表（AnalysisSettingsView 条目展开参数释义串消费，
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
  /* 参数词表扩容（ngram/edge_ngram/shingle/pattern_replace/stemmer 高频参数，
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
  /* doc 档四端点（带斜杠前缀防误伤——'_update/' 不吃 _update_by_query（后者是
 search 族，dslCompletionContext.spec 既有断言钉死），'/_source' 尾形态与 /_doc/1/_source 双保险 */
  if (p.includes('/_doc/') || p.includes('/_create/') || p.includes('/_update/') || p.includes('/_source')) return 'doc';
  if (p.includes('_settings')) return 'settings';
  if (p.includes('_mapping')) return 'mapping';
  return 'search';
}

/** 补全项统一形态：insertText 已是完整插入串（含引号/snippet 语法），provider 直接消费 */
export type AssistItem = { label: string; detail?: string; insertText: string; snippet?: boolean };

/* painless 字段访问提取（hover 用纯函数，Monaco 不初始化也可断言）。
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

/* ux2 ：index_template / component_template body 键档（TemplatesView editBody 用）。
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

/* 2.6.0 逗号自适应（spec ）：补全 insertText 的前/后逗号由上下文定。
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
