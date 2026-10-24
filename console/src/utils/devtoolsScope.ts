import { stripJsonComments } from './jsonc';

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
  /* SQL 只镜像后端的三个具名子路由：/ _sql/** 整段放行会让新增子路由（如
     DELETE /_sql/async/{id}）自动获得写权限。 */
  '/_sql', '/_sql/close', '/_sql/translate',
  '/_xpack/sql', '/_xpack/sql/close', '/_xpack/sql/translate',
]);

/* 根级 PIT/scroll 与后端 987 同口径：POST 开全集群 PIT/续读 scroll 等价全量读必须拒，
   仅 DELETE（显式清理资源）放行；限定索引的 POST /logs/_pit 走索引级白名单。 */
const SYSTEM_DATA_WRITE_DELETE_ONLY = new Set(['/_pit', '/_search/scroll']);

const INDEX_DATA_WRITE_OPS = new Set([
  '_doc', '_create', '_update', '_bulk', '_delete_by_query', '_update_by_query',
  '_search', '_count', '_msearch', '_mget', '_explain', '_validate',
  '_field_caps', '_termvectors', '_mtermvectors', '_analyze', '_pit',
  '_terms_enum', '_rank_eval', '_knn_search',
]);

/* 后端 RAW_INDEX_MUTATING_GET 镜像：这些“读”动词在 ES 侧会改状态
   （refresh/flush/cache/forcemerge/close/open/rollover/bulk/dbq/ubq/reindex）。 */
const INDEX_MUTATING_GET = new Set([
  '_refresh', '_flush', '_cache', '_forcemerge', '_close', '_open',
  '_rollover', '_delete_by_query', '_update_by_query', '_bulk', '_reindex',
]);

/* 后端 RAW_INDEX_TOPOLOGY_READ_DENY 镜像：索引级分片拓扑读与根形态同权拒绝——
   根形态（/_recovery 等）已在 SYSTEM_READ_DENY，分片恢复/段/存储/统计借索引前缀
   绕根清单会带出节点名与传输地址。`_search_shards` 的响应自带 nodes[].transport_address，
   与根形态 /_search_shards 同一口径拒绝。后端清单新增拒绝项时此处必须同步（两处清单注释互指）。 */
const INDEX_TOPOLOGY_READ_DENY = new Set(['_recovery', '_shard_stores', '_segments', '_stats', '_search_shards']);

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
  /* master 身份 / 投票排除清单：节点 id/name 与选主成员的直接出口 */
  '/_cat/master', '/_cluster/voting',
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
  /* 后端守卫统一按小写判定（/ _NODES 与 /_nodes 同权）：前端不归一就会在
     「大写变体」上亮钮，点下去必 403。 */
  const key = clean.toLowerCase();
  if (SYSTEM_READ_DENY_EXACT_ALLOW.has(key)) return false;
  /* 异步查询结果（async search / async SQL / EQL）按 id 取回：id 即凭据，
     结果集按执行者权限生成。提交动作不受影响，只挡按 id 取回/查状态。 */
  if (key.startsWith('/_async_search/') || key.startsWith('/_sql/async/')
      || key.startsWith('/_xpack/sql/async/') || key.startsWith('/_eql/search/')) return true;
  if (SYSTEM_READ_DENY.has(key)) return true;
  for (const deny of SYSTEM_READ_DENY) {
    if (key.startsWith(deny + '/')) return true;
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

/** 后端 typed 兼容路由拒绝的镜像：/logs/_doc/_bulk、/logs/_doc/1/_update 这类把
 * 操作动词后置到第 3/4 段的旧版路由形态，后端整体拒绝（守卫按第 2 段分派会漏掉
 * 全部 body 守卫）——前端同口径禁用，不再亮「可执行」让用户碰后端 403。 */
function typedRouteVerbLater(segs: string[]): boolean {
  for (let i = 2; i < segs.length; i++) {
    const seg = segs[i].toLowerCase();
    if (INDEX_DATA_WRITE_OPS.has(seg) || INDEX_MUTATING_GET.has(seg)
        || INDEX_TOPOLOGY_READ_DENY.has(seg) || seg === '_mapping' || seg === '_alias') {
      return true;
    }
  }
  return false;
}

/* 根级检索类端点（无索引前缀）：非 ADMIN 只有两种合法形态——路径带索引
   （/{index}/_search）或 body 带有效 pit.id。裸调用=全量读，会把控制面索引一并读出来。
   与后端 EsIndexAdmin.guardAllIndexRead 同口径；此前前端一律放行、后端 403（看得见点不了）。 */
const ROOT_SEARCH_PATHS = new Set([
  '/_search', '/_count', '/_field_caps', '/_async_search',
  '/_terms_enum', '/_rank_eval', '/_search/template',
]);

/** 根级检索是否缺少索引范围（缺=前端提前禁用；PIT 搜索按 ES 契约不带 index，故 body 可豁免）。 */
export function nonAdminRootSearchNeedsIndex(rawPath: string, body?: string | null): boolean {
  const raw = String(rawPath || '');
  const qAt = raw.indexOf('?');
  const pathOnly = canonicalPath(qAt >= 0 ? raw.slice(0, qAt) : raw).toLowerCase();
  if (!ROOT_SEARCH_PATHS.has(pathOnly)) return false;
  const b = String(body || '').trim();
  if (b) {
    try {
      const o = JSON.parse(stripJsonComments(b));
      /* 与后端 searchBodyHasPit 同口径：pit.id 非空，且不得再带 index/indices
         （带了就是「路径/参数与 PIT 各说一个目标」，后端按 non-PIT 全量处理并拒绝）。 */
      if (o && o.pit && String(o.pit.id || '').trim() && !('index' in o) && !('indices' in o)) {
        return false;
      }
    } catch {
      /* 非法 JSON 交由后端原始报错 */
    }
  }
  return true;
}

/**
 * index/indices 查询参数不构成「已限定目标」的凭据（后端 guardRawIndexQueryParam 同原因）：
 * 无法证明目标端按其路由（被忽略即全量读），且与路径并存时目标二义。非 ADMIN 一律禁用。
 */
export function nonAdminIndexQueryParamRejected(rawPath: string): boolean {
  const raw = String(rawPath || '');
  const qAt = raw.indexOf('?');
  if (qAt < 0) return false;
  const query = raw.slice(qAt + 1).split('#')[0];
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    let key = pair;
    try {
      key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    } catch {
      return true; /* 编码非法：后端 fail-closed */
    }
    if (key === 'index' || key === 'indices') return true;
  }
  return false;
}

/* 控制面索引的轻量镜像（后端 guardIndexPattern 的常用形态）：点号系统索引、控制词根、
   可能命中控制面的通配字面前缀。只用于前端提前禁用，最终边界仍在后端。 */
const CONTROL_ROOTS = ['es_console', 'es_rebuild_adhoc_job', '_es_rebuild_lock', '_es_xmigrate_job'];

/* _cat 索引目录（indices/aliases/shards）会枚举全部索引名，服务端靠 format=json + index 列
   做行级过滤；不带 format=json 或投影掉了 index 列时后端直接拒绝，前端同口径提前禁用。
   子路径形态 /_cat/indices/logs 与大小写变体必须同样命中——后端是前缀匹配 + 小写判定。 */
const CAT_METADATA_ROOTS = ['/_cat/indices', '/_cat/aliases', '/_cat/shards'];

function isCatMetadataPath(clean: string): boolean {
  const k = clean.toLowerCase();
  return CAT_METADATA_ROOTS.some((root) => k === root || k.startsWith(root + '/'));
}

/** 后端 queryProjectsIndex 镜像：h/headers 每组都必须含 index（或 * / index.*）。 */
function catProjectsIndex(query: string): boolean {
  if (!query.trim()) return true; /* 默认列含 index */
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    let key = pair;
    let value = '';
    try {
      key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      value = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return false;
    }
    if (key !== 'h' && key !== 'headers') continue;
    let hasIndex = false;
    for (const col of value.split(',')) {
      let c = col.trim();
      const order = c.indexOf(':');
      if (order > 0) c = c.slice(0, order).trim();
      if (c === 'index' || c === '*' || c.startsWith('index.')) hasIndex = true;
    }
    if (!hasIndex) return false;
  }
  return true;
}

/** _cat 索引目录是否缺少 format=json 或 index 列（缺=无法行级过滤控制面，非 ADMIN 禁用）。 */
export function nonAdminCatNeedsJson(rawPath: string): boolean {
  const raw = String(rawPath || '');
  const qAt = raw.indexOf('?');
  const clean = canonicalPath(qAt >= 0 ? raw.slice(0, qAt) : raw);
  if (!isCatMetadataPath(clean)) return false;
  const query = qAt >= 0 ? raw.slice(qAt + 1).split('#')[0] : '';
  let hasJson = false;
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    let key = pair;
    let value = '';
    try {
      key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      value = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return true;
    }
    if (key === 'format' && value.trim().toLowerCase() === 'json') hasJson = true;
  }
  if (!hasJson) return true;
  return !catProjectsIndex(query);
}

/** 按 id 取回异步查询结果（async search / async SQL / EQL）：id 即凭据，非 ADMIN 禁用。 */
export function nonAdminAsyncResultRead(rawPath: string): boolean {
  const k = canonicalPath(rawPath).toLowerCase();
  return k.startsWith('/_async_search/') || k.startsWith('/_sql/async/')
    || k.startsWith('/_xpack/sql/async/') || k.startsWith('/_eql/search/');
}

/** 首段是否指向控制面/系统索引（含通配可能命中）——非 ADMIN 提前禁用。 */
export function nonAdminControlIndexDenied(rawPath: string): boolean {
  const clean = canonicalPath(rawPath);
  const segs = clean.split('/').filter(Boolean);
  if (!segs.length) return false;
  const first = segs[0].toLowerCase();
  if (first.startsWith('_')) return false; /* 系统 API（/_search 等）由其它规则裁决 */
  for (const part of first.split(',')) {
    const t = part.trim().replace(/^[+-]/, '');
    if (!t) continue;
    if (t === '*' || t === '_all') return true;
    if (t.startsWith('.')) return true;
    if (CONTROL_ROOTS.some((r) => t.includes(r))) return true;
    const literal = t.replace(/[*?].*$/, '');
    if (literal !== t && CONTROL_ROOTS.some((r) => r.startsWith(literal))) return true;
  }
  return false;
}

/** 单值目标是否命中控制面（复用首段判定；用于 body/docs/SQL 的二级目标）。 */
function bodyTargetDenied(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim().replace(/^["'`\[]|["'`\]]$/g, '');
  if (!t) return false;
  return nonAdminControlIndexDenied('/' + t);
}

/**
 * 结构化多目标端点（_bulk/_msearch/_mget/_mtermvectors/_sql）的 body 级目标镜像。
 *
 * <p>这些端点的目标索引不在路径上，而在动作行/请求头/docs/SQL 语句里；后端
 * `guardStructuredRawBody` 会逐条校验，前端只按路径预检就会「亮着可执行、点下去 403」。
 * 只解析目标字段，不盲扫文档正文——正文里出现 {@code .security} 是合法业务字段，
 * 盲扫会把正常写入误杀（与后端注释同一理由）。</p>
 */
export function nonAdminBodyTargetsControl(path: string, body?: string | null): boolean {
  const b = String(body || '').trim();
  if (!b) return false;
  const segs = canonicalPath(path).toLowerCase().split('/').filter(Boolean);
  const first = segs[0] || '';
  const op = first.startsWith('_') ? first : (segs[1] || '');
  if (op === '_bulk') {
    const lines = b.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 2) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const o = JSON.parse(line);
        for (const k of Object.keys(o || {})) {
          const action = o[k];
          if (action && bodyTargetDenied(action._index)) return true;
        }
      } catch {
        /* 非法动作行交由后端原始报错 */
      }
    }
    return false;
  }
  if (op === '_msearch') {
    const lines = b.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 2) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const o = JSON.parse(line);
        if (bodyTargetDenied(o.index)) return true;
        if (Array.isArray(o.indices) && o.indices.some(bodyTargetDenied)) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }
  if (op === '_mget' || op === '_mtermvectors' || op === '_termvectors') {
    try {
      const o = JSON.parse(stripJsonComments(b));
      if (Array.isArray(o?.docs) && o.docs.some((d: any) => d && bodyTargetDenied(d._index))) return true;
      if (bodyTargetDenied(o?.index) || bodyTargetDenied(o?.parameters?.index)) return true;
      return false;
    } catch {
      return false;
    }
  }
  if (op === '_sql' || (first === '_xpack' && segs[1] === 'sql')) {
    try {
      const o = JSON.parse(stripJsonComments(b));
      /* SQL 注释里的控制面词不应造成前端误禁：后端 guardSql 先剥注释再解析目标。 */
      const q = (typeof o?.query === 'string' ? o.query : '')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n\r]*/g, ' ');
      const re = /\b(?:FROM|JOIN)\s+([^\s,;()]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(q)) !== null) {
        if (bodyTargetDenied(m[1])) return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function nonAdminDataPlaneWriteAllowed(method: string, path: string, body?: string | null): boolean {
  const m = String(method || 'GET').toUpperCase();
  const clean = canonicalPath(path);
  if (!clean.startsWith('/') || clean.includes('..') || clean.includes(';')) return false;
  /* 先钉目标再分派读写：查询参数不算限定、控制面索引/通配直接拒、根级检索要路径或 PIT。
     GET/POST 同规则（后端两处守卫同口径）。 */
  if (nonAdminIndexQueryParamRejected(path)) return false;
  if (nonAdminCatNeedsJson(path)) return false;
  if (nonAdminControlIndexDenied(path)) return false;
  if (nonAdminRootSearchNeedsIndex(path, body)) return false;
  /* body 里的二级目标（bulk 动作行 / msearch 头 / mget docs / SQL FROM）与路径同权：
     只按路径预检会让「指向控制面的批量写」亮成可执行，点下去才 403。 */
  if (nonAdminBodyTargetsControl(path, body)) return false;
  const segs = clean.split('/').filter(Boolean);
  /* 根路径 GET 是集群名/版本的自省（后端不拦）：不能因为「没有路径段」把有权限的人挡在门外。 */
  if (segs.length === 0) return m === 'GET' || m === 'HEAD';
  const first = segs[0].toLowerCase();
  if (m === 'GET' || m === 'HEAD') {
    /* 读侧镜像系统读拒绝清单（992）：系统管理读在客户端即禁用——所见即所得，
       不再亮钮后端 403；索引级读不受限（清单全部是 /_ 系统前缀）。 */
    if (systemReadDenied(clean)) return false;
    const second = segs[1]?.toLowerCase();
    if (second && INDEX_MUTATING_GET.has(second)) return false;
    if (second && INDEX_TOPOLOGY_READ_DENY.has(second)) return false;
    if (typedRouteVerbLater(segs)) return false;
    return true;
  }
  /* 后端 raw 方法白名单只认 GET/POST/PUT/DELETE/HEAD：OPTIONS/CONNECT/TRACE 等
     UI 不会出现的方法不得落入写白名单（L-6 对齐，防白名单段名误放行）。 */
  if (m !== 'POST' && m !== 'PUT' && m !== 'DELETE') return false;
  if (first.startsWith('_')) {
    if (SYSTEM_DATA_WRITE.has(clean)) return true;
    if (m === 'DELETE' && SYSTEM_DATA_WRITE_DELETE_ONLY.has(clean)) return true;
    /* SQL 只放行具名子路由（见 SYSTEM_DATA_WRITE）：整段前缀放行会让新增子路由
       自动获得写权限。 */
    return false;
  }
  if (segs.length < 2) return false;
  if (typedRouteVerbLater(segs)) return false;
  return INDEX_DATA_WRITE_OPS.has(segs[1].toLowerCase());
}
