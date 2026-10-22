/**
 * DevTools 非 ADMIN 写范围（与后端 EsIndexAdmin.guardRawSystemWrite /
 * guardRawIndexWrite 数据面白名单同口径）：只允许检索、文档、批量、SQL 等
 * 数据面写；集群设置/别名/快照/模板/脚本等管理写必须 ADMIN。
 * 该函数只用于前端预暴露，最终边界仍在后端 guardRawGuarded。
 */
const SYSTEM_DATA_WRITE = new Set([
  '/_bulk', '/_msearch', '/_msearch/template', '/_mget',
  '/_search', '/_search/template', '/_search/scroll', '/_count',
  '/_async_search', '/_field_caps', '/_analyze', '/_render/template',
  '/_sql', '/_sql/close', '/_xpack/sql', '/_xpack/sql/close', '/_pit',
]);

const INDEX_DATA_WRITE_OPS = new Set([
  '_doc', '_create', '_update', '_bulk', '_delete_by_query', '_update_by_query',
  '_search', '_count', '_msearch', '_mget', '_explain', '_validate',
  '_field_caps', '_termvectors', '_mtermvectors', '_analyze', '_pit',
  '_search_shards', '_terms_enum', '_rank_eval', '_knn_search',
]);

export function nonAdminDataPlaneWriteAllowed(method: string, path: string): boolean {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  const clean = String(path || '').split('?')[0].split('#')[0];
  if (!clean.startsWith('/') || clean.includes('..')) return false;
  const segs = clean.split('/').filter(Boolean);
  if (segs.length === 0) return false;
  const first = segs[0].toLowerCase();
  if (first.startsWith('_')) {
    if (SYSTEM_DATA_WRITE.has(clean)) return true;
    /* 后端对 /_sql/**、/_xpack/sql/** 子路由整体放行（close 等）。 */
    if (first === '_sql') return true;
    if (first === '_xpack' && segs[1]?.toLowerCase() === 'sql') return true;
    return false;
  }
  if (segs.length < 2) return false;
  return INDEX_DATA_WRITE_OPS.has(segs[1].toLowerCase());
}
