/* W3：ES 7.10 常用端点静态目录（D3：静态维护前端，随版本升级审查）。
   {index} 为索引槽位——由动态清单插值；body 为该端点骨架 snippet。 */
export type EsEndpoint = { methods: string[]; path: string; doc: string; body?: string };

/* REST 方法全集收口（DevTools/RestView 此前各自定义） */
export const REST_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'] as const;

export const ES_ENDPOINTS: EsEndpoint[] = [
  { methods: ['GET', 'POST'], path: '/{index}/_search', doc: '搜索文档',
    body: '{\n  "query": {\n    "match_all": {}\n  }\n}' },
  { methods: ['GET', 'POST'], path: '/_search', doc: '全集群搜索',
    body: '{\n  "query": {\n    "match_all": {}\n  }\n}' },
  { methods: ['GET'], path: '/{index}/_mapping', doc: '查看 mapping' },
  { methods: ['PUT'], path: '/{index}/_mapping', doc: '更新 mapping（加字段）',
    body: '{\n  "properties": {\n    "field": { "type": "keyword" }\n  }\n}' },
  { methods: ['GET'], path: '/{index}/_settings', doc: '查看索引设置' },
  { methods: ['PUT'], path: '/{index}/_settings', doc: '热更索引设置',
    body: '{\n  "index": {\n    "refresh_interval": "1s"\n  }\n}' },
  { methods: ['PUT'], path: '/{index}', doc: '创建索引',
    body: '{\n  "settings": { "number_of_shards": 1, "number_of_replicas": 1 },\n  "mappings": { "properties": {} }\n}' },
  { methods: ['DELETE'], path: '/{index}', doc: '删除索引（危险）' },
  { methods: ['POST'], path: '/{index}/_doc', doc: '写入文档（自增 ID）', body: '{\n  "field": "value"\n}' },
  { methods: ['PUT'], path: '/{index}/_doc/{id}', doc: '写入/覆盖文档（指定 ID）', body: '{\n  "field": "value"\n}' },
  { methods: ['GET'], path: '/{index}/_doc/{id}', doc: '按 ID 取文档' },
  { methods: ['DELETE'], path: '/{index}/_doc/{id}', doc: '按 ID 删文档' },
  { methods: ['POST'], path: '/{index}/_update/{id}', doc: '局部更新文档', body: '{\n  "doc": { "field": "value" }\n}' },
  /* T9 评审 under-listing 补全：_bulk 7.10 合法方法含 PUT（method gating 不误灰） */
  { methods: ['POST', 'PUT'], path: '/{index}/_bulk', doc: '批量写入', body: '{ "index": {} }\n{ "field": "value" }\n' },
  { methods: ['POST'], path: '/{index}/_update_by_query', doc: '按查询更新', body: '{\n  "query": { "match_all": {} }\n}' },
  { methods: ['POST'], path: '/{index}/_delete_by_query', doc: '按查询删除（危险）', body: '{\n  "query": { "match_all": {} }\n}' },
  { methods: ['POST'], path: '/_reindex', doc: '跨索引重建', body: '{\n  "source": { "index": "src" },\n  "dest": { "index": "dst" }\n}' },
  { methods: ['GET', 'POST'], path: '/{index}/_count', doc: '计数', body: '{\n  "query": { "match_all": {} }\n}' },
  { methods: ['GET'], path: '/{index}/_aliases', doc: '查看别名' },
  { methods: ['POST'], path: '/_aliases', doc: '别名原子操作', body: '{\n  "actions": [\n    { "add": { "index": "my-v1", "alias": "my" } }\n  ]\n}' },
  /* T9 评审 under-listing 补全：_refresh 7.10 合法方法含 GET */
  { methods: ['POST', 'GET'], path: '/{index}/_refresh', doc: '手动刷新' },
  { methods: ['POST'], path: '/{index}/_forcemerge', doc: '强制合并' },
  { methods: ['POST'], path: '/{index}/_close', doc: '关闭索引' },
  { methods: ['POST'], path: '/{index}/_open', doc: '打开索引' },
  { methods: ['GET'], path: '/_cat/indices', doc: '索引清单' },
  { methods: ['GET'], path: '/_cat/aliases', doc: '别名清单' },
  { methods: ['GET'], path: '/_cat/nodes', doc: '节点清单' },
  { methods: ['GET'], path: '/_cat/shards', doc: '分片清单' },
  { methods: ['GET'], path: '/_cat/allocation', doc: '分片磁盘分配' },
  { methods: ['GET'], path: '/_cat/health', doc: '集群健康（cat）' },
  { methods: ['GET'], path: '/_cluster/health', doc: '集群健康' },
  { methods: ['GET'], path: '/_cluster/stats', doc: '集群统计' },
  { methods: ['GET'], path: '/_cluster/settings', doc: '集群设置' },
  { methods: ['GET', 'POST'], path: '/_cluster/allocation/explain', doc: '分片分配原因诊断',
    body: '{\n  "index": "my-index",\n  "shard": 0,\n  "primary": true\n}' },
  { methods: ['GET'], path: '/_nodes/stats', doc: '节点统计' },
  { methods: ['GET'], path: '/_tasks', doc: '任务清单' },
  { methods: ['GET', 'POST'], path: '/{index}/_search/template', doc: '搜索模板执行' },
  { methods: ['GET', 'POST'], path: '/{index}/_validate/query', doc: '查询校验', body: '{\n  "query": { "match_all": {} }\n}' },
  { methods: ['GET', 'POST'], path: '/{index}/_explain/{id}', doc: '打分明细', body: '{\n  "query": { "match_all": {} }\n}' },
];

export function filterEndpoints(kw: string): EsEndpoint[] {
  const k = (kw || '').replace(/^\//, '').toLowerCase();
  if (!k) return ES_ENDPOINTS;
  const rank = (p: string) => {
    const bare = p.replace(/^\//, '').toLowerCase().replace('{index}/', '');
    return bare.startsWith(k) ? 0 : bare.includes(k) ? 1 : 2;
  };
  return ES_ENDPOINTS
    .map(e => ({ e, r: rank(e.path) }))
    .filter(x => x.r < 2 || x.e.doc.includes(kw || ''))
    .sort((a, b) => a.r - b.r || a.e.path.localeCompare(b.e.path))
    .map(x => x.e).slice(0, 30);
}
export function tplHasIndexSlot(tpl: string): boolean { return tpl.includes('{index}'); }
export function fillIndexSlot(tpl: string, index: string): string { return tpl.replace('{index}', index); }
