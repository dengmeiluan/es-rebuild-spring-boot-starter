/**
 * DevTools 非 ADMIN 写范围（与后端 EsIndexAdmin.guardRawSystemWrite /
 * guardRawIndexWrite 数据面白名单同口径）：只允许检索、文档、批量、SQL 等
 * 数据面写；集群设置/别名/快照/模板/脚本等管理写必须 ADMIN。
 * 该函数只用于前端预暴露，最终边界仍在后端 guardRawGuarded。
 */
const SYSTEM_DATA_WRITE = new Set([
  '/_bulk', '/_msearch', '/_msearch/template', '/_mget',
  '/_search', '/_search/template', '/_count',
  '/_async_search', '/_field_caps', '/_analyze', '/_render/template',
  '/_sql', '/_sql/close', '/_xpack/sql', '/_xpack/sql/close',
]);

/* 根级 PIT/scroll 与后端 987 同口径：POST 开全集群 PIT/续读 scroll 等价全量读必须拒，
   仅 DELETE（显式清理资源）放行；限定索引的 POST /logs/_pit 走索引级白名单。 */
const SYSTEM_DATA_WRITE_DELETE_ONLY = new Set(['/_pit', '/_search/scroll']);

const INDEX_DATA_WRITE_OPS = new Set([
  '_doc', '_create', '_update', '_bulk', '_delete_by_query', '_update_by_query',
  '_search', '_count', '_msearch', '_mget', '_explain', '_validate',
  '_field_caps', '_termvectors', '_mtermvectors', '_analyze', '_pit',
  '_search_shards', '_terms_enum', '_rank_eval', '_knn_search',
]);

/* 后端 RAW_INDEX_MUTATING_GET 镜像：这些“读”动词在 ES 侧会改状态
   （refresh/flush/cache/forcemerge/close/open/rollover/bulk/dbq/ubq/reindex）。 */
const INDEX_MUTATING_GET = new Set([
  '_refresh', '_flush', '_cache', '_forcemerge', '_close', '_open',
  '_rollover', '_delete_by_query', '_update_by_query', '_bulk', '_reindex',
]);

/* 后端 guardRawSystemRead 的 RAW_SYSTEM_READ_DENY 同源镜像（段前缀）：
   非 ADMIN 的系统管理读（账号/快照/脚本/节点/模板/任务等）在客户端即禁用，
   不再亮钮后端 403。后端清单新增拒绝项时此处必须同步（两处清单注释互指）。 */
const SYSTEM_READ_DENY = new Set([
  '/_security', '/_xpack/security', '/_snapshot', '/_watcher', '/_xpack/watcher',
  '/_scripts', '/_ingest', '/_ilm', '/_xpack/ilm', '/_slm', '/_ml', '/_xpack/ml',
  '/_transform', '/_xpack/transform', '/_rollup', '/_xpack/rollup',
  '/_ccr', '/_xpack/ccr', '/_remote', '/_nodes', '/_cluster/state',
  '/_cluster/settings', '/_mapping', '/_settings', '/_cat/repositories', '/_cat/snapshots',
  '/_cat/count', '/_cat/segments', '/_cat/recovery', '/_cat/allocation', '/_stats',
  '/_search_shards', '/_segments', '/_recovery', '/_shard_stores', '/_cat/fielddata',
  '/_resolve', '/_alias', '/_aliases',
  '/_tasks', '/_cat/tasks', '/_cluster/allocation', '/_cluster/pending_tasks', '/_cat/pending_tasks',
  '/_cat/templates', '/_index_template', '/_component_template', '/_template',
  '/_cat/nodes', '/_cat/nodeattrs', '/_cat/thread_pool', '/_cat/plugins',
  '/_cat/transforms', '/_cat/ml', '/_cat/component_templates',
  '/_data_stream', '/_features', '/_license', '/_xpack/license', '/_xpack/usage',
  '/_cluster/stats', '/_enrich', '/_monitoring',
  '/_search/scroll', '/_cat/hot_threads', '/_dangling', '/_xpack',
  '/_script_context', '/_script_language', '/_migration', '/_async_search/status',
  '/_refresh', '/_flush', '/_cache', '/_forcemerge', '/_close', '/_open', '/_reindex',
]);

/* 后端同款特例：_authenticate 是客户端自省（谁在问），无控制面泄露。 */
const SYSTEM_READ_DENY_EXACT_ALLOW = new Set(['/_security/_authenticate', '/_xpack/security/_authenticate']);

/** 后端段前缀口径镜像：deny 本身或 deny 后紧跟新段（deny + '/'）。 */
function systemReadDenied(clean: string): boolean {
  if (SYSTEM_READ_DENY_EXACT_ALLOW.has(clean)) return false;
  if (SYSTEM_READ_DENY.has(clean)) return true;
  for (const deny of SYSTEM_READ_DENY) {
    if (clean.startsWith(deny + '/')) return true;
  }
  return false;
}

/** 后端 canonicalRawPath 的 TS 侧简化镜像：剥 query/fragment、URL 解码、折叠空段与 `.` 段。
 * 非法 % 序列解码失败保持字面（后端对非法序列 fail-closed 拒绝，前端字面大多不在
 * 白名单同样被拒——两侧保守方向一致）。`..` 段不折叠：由调用方的 includes('..') 拒绝。 */
function canonicalPath(raw: string): string {
  let p = String(raw || '').split('?')[0].split('#')[0];
  try { p = decodeURIComponent(p); } catch { /* 非法 % 序列保持字面 */ }
  const segs = p.split('/').filter(s => s !== '' && s !== '.');
  return segs.length === 0 ? '/' : '/' + segs.join('/');
}

export function nonAdminDataPlaneWriteAllowed(method: string, path: string): boolean {
  const m = String(method || 'GET').toUpperCase();
  const clean = canonicalPath(path);
  if (!clean.startsWith('/') || clean.includes('..')) return false;
  const segs = clean.split('/').filter(Boolean);
  if (segs.length === 0) return false;
  const first = segs[0].toLowerCase();
  if (m === 'GET' || m === 'HEAD') {
    /* 读侧镜像系统读拒绝清单（992）：系统管理读在客户端即禁用——所见即所得，
       不再亮钮后端 403；索引级读不受限（清单全部是 /_ 系统前缀）。 */
    if (systemReadDenied(clean)) return false;
    const second = segs[1]?.toLowerCase();
    if (second && INDEX_MUTATING_GET.has(second)) return false;
    return true;
  }
  /* 后端 raw 方法白名单只认 GET/POST/PUT/DELETE/HEAD：OPTIONS/CONNECT/TRACE 等
     UI 不会出现的方法不得落入写白名单（L-6 对齐，防白名单段名误放行）。 */
  if (m !== 'POST' && m !== 'PUT' && m !== 'DELETE') return false;
  if (first.startsWith('_')) {
    if (SYSTEM_DATA_WRITE.has(clean)) return true;
    if (m === 'DELETE' && SYSTEM_DATA_WRITE_DELETE_ONLY.has(clean)) return true;
    /* 后端对 /_sql/**、/_xpack/sql/** 子路由整体放行（close 等）。 */
    if (first === '_sql') return true;
    if (first === '_xpack' && segs[1]?.toLowerCase() === 'sql') return true;
    return false;
  }
  if (segs.length < 2) return false;
  return INDEX_DATA_WRITE_OPS.has(segs[1].toLowerCase());
}
