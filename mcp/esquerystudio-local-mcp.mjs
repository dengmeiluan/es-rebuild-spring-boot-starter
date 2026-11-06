#!/usr/bin/env node
/**
 * ESQueryStudio local MCP server (no Spring Boot, no browser tab).
 *
 * A dependency-free Node 18+ MCP stdio server that talks directly to one or more
 * Elasticsearch clusters. This is the "pure local" option for Claude Desktop,
 * Cursor and other local agents: it needs neither the browser extension nor the
 * Spring Boot console process.
 *
 * Config (ESQ_MCP_CONFIG or --config):
 * {
 *   "defaultConnection": "prod",
 *   "connections": [
 *     { "id": "prod", "name": "Production", "url": "http://localhost:9200",
 *       "username": "elastic", "password": "***" },
 *     { "id": "qa", "name": "QA", "url": "https://qa.example:9200",
 *       "apiKey": "base64-id:key" }
 *   ]
 * }
 *
 * Single-connection env fallback:
 *   ESQ_ES_URL=http://localhost:9200 ESQ_ES_USERNAME=elastic ESQ_ES_PASSWORD=***
 *
 * Write tools are disabled unless ESQ_MCP_ALLOW_WRITE=true (or --allow-write).
 * Credentials stay in this process; the MCP stdio channel carries only requests/responses.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';

const WRITE_TOOLS = ['es_index_doc', 'es_update_doc', 'es_delete_doc', 'es_bulk', 'es_task_cancel'];
const TOOL_DEFINITIONS = [
  tool('es_list_connections', 'List connections this MCP client may target.', schema({})),
  tool('es_list_indices', 'List non-system Elasticsearch indices.', schema({})),
  tool('es_cluster_health', 'Return cluster health, version and shard counts.', schema({})),
  tool('es_get_mapping', 'Return the live mapping, field tree and field types for an index.',
    schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_get_doc', 'Get one document by id.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
  }, ['index', 'id'])),
  tool('es_get_settings', 'Return index settings.', schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_get_aliases', 'List aliases and their indices.', schema({})),
  tool('es_list_templates', 'List index templates, with legacy-template normalization.', schema({})),
  tool('es_list_nodes', 'List cluster nodes and their roles/health.', schema({})),
  tool('es_list_tasks', 'List running cluster tasks.', schema({ actions: val('string', 'Optional task action filter.') })),
  tool('es_search', 'Run an Elasticsearch DSL search and return the raw response.', schema({
    index: val('string', 'Index or alias name.'),
    query: val('object', 'Elasticsearch query object, or a JSON string.'),
    size: val('integer', 'Number of hits, 1-100.'),
    explain: val('boolean', 'Include _explanation in hits.'),
    profile: val('boolean', 'Include the profile tree.'),
  }, ['index'])),
  tool('es_count', 'Count documents matching a query.', schema({
    index: val('string', 'Index or alias name.'),
    query: val('object', 'Query object, or a JSON string.'),
  }, ['index'])),
  tool('es_sql', 'Run an Elasticsearch SQL query and return columns, rows and cursor.', schema({
    query: val('string', 'SQL text.'),
    fetchSize: val('integer', 'Fetch size, 1-5000.'),
  }, ['query'])),
  tool('es_explain_doc', 'Explain one document against a query using _explain.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
    query: val('object', 'Query object, or a JSON string.'),
  }, ['index', 'id'])),
  tool('es_get_index_stats', 'Return index stats.', schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_msearch', 'Run multiple search requests in one _msearch call.', schema({
    index: val('string', 'Default index or alias for searches that omit index.'),
    searches: val('array', 'Array of {index?, query?, size?} search objects.'),
  }, ['searches'])),
  tool('es_bulk', 'Run a bulk request from an operations array; write permission required.', schema({
    index: val('string', 'Default index or alias for operations that omit index.'),
    operations: val('array', 'Array of {action,index?,id?,document?} operations.'),
    refresh: val('string', 'Optional refresh: true, false or wait_for.'),
  }, ['operations'])),
  tool('es_terms_enum', 'Enumerate field terms with the _terms_enum API.', schema({
    index: val('string', 'Index or alias name.'),
    field: val('string', 'Field name.'),
    query: val('object', 'Optional query object or JSON string.'),
    size: val('integer', 'Maximum terms, 1-1000.'),
    caseInsensitive: val('boolean', 'Case-insensitive matching.'),
  }, ['index', 'field'])),
  tool('es_field_caps', 'Return field capabilities across one or more indices.', schema({
    index: val('string', 'Index or alias name.'),
    fields: val('string', 'Comma-separated field patterns (default *).'),
  }, ['index'])),
  tool('es_task_cancel', 'Cancel a running cluster task by node:task id; write permission required.', schema({
    taskId: val('string', 'Task id in node:number form.'),
  }, ['taskId'])),
  tool('es_sql_cursor', 'Fetch the next page of an Elasticsearch SQL cursor.', schema({
    cursor: val('string', 'Cursor returned by es_sql.'),
    timeZone: val('string', 'Optional time zone, identical to the first query.'),
    columnar: val('boolean', 'Optional columnar flag, identical to the first query.'),
  }, ['cursor'])),
  tool('es_index_doc', 'Create or overwrite a document by id.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
    document: val('object', 'Document body object, or a JSON object string.'),
  }, ['index', 'id', 'document'])),
  tool('es_update_doc', 'Partially update fields of a document by id.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
    document: val('object', 'Partial document object, or a JSON object string.'),
  }, ['index', 'id', 'document'])),
  tool('es_delete_doc', 'Delete a document by id.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
  }, ['index', 'id'])),
  tool('es_rest', 'Run a raw Elasticsearch REST request; write methods require write permission.', schema({
    method: val('string', 'GET, HEAD, POST, PUT or DELETE.'),
    path: val('string', 'REST path starting with /.'),
    body: val('object', 'Optional JSON body object or string.'),
  }, ['method', 'path'])),
];

function val(type, description) { return { type, description }; }
function schema(properties, required = []) {
  const out = { type: 'object', properties: {
    ...properties,
    connection: val('string', 'Connection id; optional. Defaults to the configured default connection.'),
  } };
  if (required.length) out.required = required;
  return out;
}
function tool(name, description, inputSchema) { return { name, description, inputSchema }; }

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (argv.includes('--help')) {
  process.stderr.write('Usage: node esquerystudio-local-mcp.mjs [--config path] [--allow-write]\n'
    + 'Config can also be provided by ESQ_MCP_CONFIG. Single connection: ESQ_ES_URL/USERNAME/PASSWORD/API_KEY.\n');
  process.exit(0);
}
const allowWrite = argv.includes('--allow-write') || String(process.env.ESQ_MCP_ALLOW_WRITE || '').toLowerCase() === 'true';
const configPath = arg('--config') || process.env.ESQ_MCP_CONFIG || join(homedir(), '.esquerystudio', 'mcp.json');

function fromEnv() {
  const url = String(process.env.ESQ_ES_URL || '').trim();
  if (!url) return null;
  return {
    id: 'env', name: 'Environment connection', url,
    username: process.env.ESQ_ES_USERNAME || '',
    password: process.env.ESQ_ES_PASSWORD || '',
    apiKey: process.env.ESQ_ES_API_KEY || '',
  };
}

function loadConfig() {
  let parsed = null;
  try { parsed = JSON.parse(readFileSync(configPath, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`Cannot read MCP config ${configPath}: ${e.message}`);
  }
  const list = Array.isArray(parsed?.connections) ? parsed.connections : [];
  if (list.length) {
    const connections = list.map((c, i) => normalizeConnection(c, i));
    const defaultConnection = String(parsed.defaultConnection || connections[0].id);
    if (!connections.some((c) => c.id === defaultConnection)) {
      throw new Error(`defaultConnection "${defaultConnection}" is not in connections`);
    }
    return { connections, defaultConnection };
  }
  const env = fromEnv();
  if (env) return { connections: [normalizeConnection(env, 0)], defaultConnection: env.id };
  throw new Error(`No MCP config found at ${configPath} and ESQ_ES_URL is not set`);
}

function normalizeConnection(raw, index) {
  const url = String(raw?.url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error(`Connection #${index + 1}: url must start with http:// or https://`);
  const id = String(raw?.id || `conn-${index + 1}`).trim();
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) throw new Error(`Connection #${index + 1}: invalid id "${id}"`);
  return {
    id,
    name: String(raw?.name || id).trim(),
    url,
    username: raw?.username ? String(raw.username) : '',
    password: raw?.password ? String(raw.password) : '',
    apiKey: raw?.apiKey ? String(raw.apiKey) : '',
  };
}

const config = loadConfig();
const byId = new Map(config.connections.map((c) => [c.id, c]));
const versionCache = new Map();

async function versionOf(conn) {
  if (versionCache.has(conn.id)) return versionCache.get(conn.id);
  try {
    const root = await es(conn, 'GET', '/');
    const version = root?.version?.number ? String(root.version.number) : '';
    versionCache.set(conn.id, version);
    return version;
  } catch {
    versionCache.set(conn.id, '');
    return '';
  }
}
function majorOf(version) {
  const n = parseInt(String(version || '').split('.')[0], 10);
  return Number.isFinite(n) ? n : 0;
}

function connectionOf(args) {
  const requested = String(args?.connection || '').trim() || config.defaultConnection;
  const conn = byId.get(requested);
  if (!conn) throw new Error(`Unknown connection: ${requested}`);
  return conn;
}

async function es(conn, method, path, body, contentType) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = contentType || 'application/json';
  if (conn.apiKey) headers.Authorization = `ApiKey ${conn.apiKey}`;
  else if (conn.username) {
    headers.Authorization = 'Basic ' + Buffer.from(`${conn.username}:${conn.password || ''}`).toString('base64');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(conn.url + path, {
      method,
      headers,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const reason = data?.error?.reason || data?.error?.type || data?.message || `HTTP ${res.status}`;
      const err = new Error(String(reason));
      err.httpStatus = res.status;
      err.body = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function flattenFields(mappings) {
  const fields = [];
  const walk = (props, prefix) => {
    for (const [name, def] of Object.entries(props || {})) {
      const path = prefix ? `${prefix}.${name}` : name;
      fields.push({
        path,
        type: def?.type || (def?.properties ? 'object' : ''),
        analyzer: def?.analyzer || '',
        search_analyzer: def?.search_analyzer || '',
      });
      if (def?.properties) walk(def.properties, path);
      if (def?.fields) walk(def.fields, path);
    }
  };
  for (const value of Object.values(mappings || {})) {
    const m = value?.mappings || {};
    if (m.properties) walk(m.properties, '');
    else if (m._doc?.properties) walk(m._doc.properties, '');
    else for (const typed of Object.values(m)) if (typed?.properties) walk(typed.properties, '');
  }
  return fields;
}

async function callTool(name, args = {}) {
  if (WRITE_TOOLS.includes(name) && !allowWrite) {
    throw new Error('Write tools are disabled: start the local MCP server with --allow-write or ESQ_MCP_ALLOW_WRITE=true');
  }
  const conn = connectionOf(args);
  switch (name) {
    case 'es_list_connections':
      return config.connections.map((c) => ({
        id: c.id, name: c.name, url: c.url.replace(/\/\/[^@/]+@/, '//***@'),
        active: c.id === config.defaultConnection,
      }));
    case 'es_list_indices': {
      const rows = await es(conn, 'GET',
        '/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep,creation.date.string,segments.count,docs.deleted');
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => !String(r.index || '').startsWith('.'))
        .sort((a, b) => String(a.index).localeCompare(String(b.index)));
    }
    case 'es_cluster_health': {
      const health = await es(conn, 'GET', '/_cluster/health');
      try {
        const root = await es(conn, 'GET', '/');
        if (root?.version?.number) health.version = root.version.number;
      } catch { /* version is best-effort */ }
      return health;
    }
    case 'es_get_mapping': {
      const index = required(args, 'index');
      const raw = await es(conn, 'GET', `/${encodeURIComponent(index)}/_mapping`);
      return { index, mapping: raw, fields: flattenFields(raw) };
    }
    case 'es_get_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      return es(conn, 'GET', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`);
    }
    case 'es_get_settings':
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_settings`);
    case 'es_get_aliases':
      return es(conn, 'GET', '/_cat/aliases?format=json');
    case 'es_list_templates':
      try { return await es(conn, 'GET', '/_index_template'); }
      catch (e) {
        if (e.httpStatus === 400 || e.httpStatus === 404 || e.httpStatus === 405) return es(conn, 'GET', '/_template');
        throw e;
      }
    case 'es_list_nodes':
      return es(conn, 'GET', '/_cat/nodes?format=json');
    case 'es_list_tasks':
      return es(conn, 'GET', '/_tasks?group_by=parents' + (args.actions ? '&actions=' + encodeURIComponent(String(args.actions)) : ''));
    case 'es_search': {
      const index = required(args, 'index');
      const body = {
        size: args.size == null ? 10 : Math.max(1, Math.min(100, Number(args.size) || 10)),
        query: queryClause(args.query) || { match_all: {} },
      };
      const qs = `?explain=${args.explain ? 'true' : 'false'}&profile=${args.profile ? 'true' : 'false'}`;
      return es(conn, 'POST', `/${encodeURIComponent(index)}/_search${qs}`, body);
    }
    case 'es_count': {
      const index = required(args, 'index');
      return es(conn, 'POST', `/${encodeURIComponent(index)}/_count`,
        { query: queryClause(args.query) || { match_all: {} } });
    }
    case 'es_sql': {
      const body = { query: required(args, 'query') };
      if (args.fetchSize != null) body.fetch_size = Math.max(1, Math.min(5000, Number(args.fetchSize) || 200));
      const major = majorOf(await versionOf(conn));
      const primary = major > 0 && major < 7 ? '/_xpack/sql?format=json' : '/_sql?format=json';
      const alternate = primary === '/_sql?format=json' ? '/_xpack/sql?format=json' : '/_sql?format=json';
      try { return await es(conn, 'POST', primary, body); }
      catch (e) {
        if (e.httpStatus === 400 || e.httpStatus === 404 || e.httpStatus === 405) {
          return es(conn, 'POST', alternate, body);
        }
        throw e;
      }
    }
    case 'es_explain_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      const query = queryClause(args.query) || { match_all: {} };
      try {
        return await es(conn, 'POST', `/${encodeURIComponent(index)}/_explain/${encodeURIComponent(id)}`, { query });
      } catch (e) {
        /* ES 6.x 的 _explain 路由带 type；先尝试 _doc，再让真实错误上抛。 */
        if (e.httpStatus === 400 && majorOf(await versionOf(conn)) < 7) {
          return es(conn, 'POST', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}/_explain`, { query });
        }
        throw e;
      }
    }
    case 'es_get_index_stats':
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_stats`);
    case 'es_msearch':
      return es(conn, 'POST', '/_msearch', msearchNdjson(args), 'application/x-ndjson');
    case 'es_bulk': {
      const q = args.refresh ? '?refresh=' + encodeURIComponent(String(args.refresh)) : '';
      return es(conn, 'POST', '/_bulk' + q, bulkNdjson(args), 'application/x-ndjson');
    }
    case 'es_terms_enum': {
      const body = { field: required(args, 'field') };
      const q = queryClause(args.query);
      if (q) body.query = q;
      if (args.size != null) body.size = Math.max(1, Math.min(1000, Number(args.size) || 100));
      if (args.caseInsensitive) body.case_insensitive = true;
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_terms_enum`, body);
    }
    case 'es_field_caps': {
      const fields = String(args.fields || '*');
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_field_caps?fields=${encodeURIComponent(fields)}`);
    }
    case 'es_task_cancel':
      return es(conn, 'POST', `/_tasks/${encodeURIComponent(required(args, 'taskId'))}/_cancel`);
    case 'es_sql_cursor': {
      const body = { cursor: required(args, 'cursor') };
      if (args.timeZone) body.time_zone = String(args.timeZone);
      if (args.columnar != null) body.columnar = Boolean(args.columnar);
      const major = majorOf(await versionOf(conn));
      return es(conn, 'POST', major > 0 && major < 7 ? '/_xpack/sql?format=json' : '/_sql?format=json', body);
    }
    case 'es_index_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      const document = objectArg(args, 'document');
      return es(conn, 'PUT', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}?refresh=true`, document);
    }
    case 'es_update_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      const partial = objectArg(args, 'document');
      try {
        return await es(conn, 'POST', `/${encodeURIComponent(index)}/_update/${encodeURIComponent(id)}?refresh=true`, { doc: partial });
      } catch (e) {
        /* ES 6.x 的 _update 路由必须携带 type；_doc 是该版本的单类型约定。 */
        if (e.httpStatus === 400 && majorOf(await versionOf(conn)) < 7) {
          return es(conn, 'POST', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}/_update?refresh=true`, { doc: partial });
        }
        throw e;
      }
    }
    case 'es_delete_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      return es(conn, 'DELETE', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`);
    }
    case 'es_rest': {
      const method = required(args, 'method').toUpperCase();
      const path = required(args, 'path');
      if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error(`Unsupported method: ${method}`);
      if (!path.startsWith('/') || path.includes('..')) throw new Error('path must start with / and must not contain ..');
      if (!isReadRest(method, path) && !allowWrite) {
        throw new Error('Write tools are disabled: raw ' + method + ' ' + path + ' requires --allow-write');
      }
      return es(conn, method, path, args.body);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function required(args, key) {
  const value = args?.[key];
  if (value == null || String(value).trim() === '') throw new Error(`Missing required argument: ${key}`);
  return String(value).trim();
}
const REST_POST_READ = [
  /^\/(?:[^/]+\/)?_search(?:\/.*)?$/,
  /^\/(?:[^/]+\/)?_count$/,
  /^\/_msearch(?:\/template)?$/,
  /^\/(?:[^/]+\/)?_mget$/,
  /^\/(?:[^/]+\/)?_search\/template$/,
  /^\/_search\/scroll$/,
  /^\/_search\/scroll\/[^/]+$/,
  /^\/_search_shards$/,
  /^\/_render\/template$/,
  /^\/_sql(?:\/(?:translate|close))?$/,
  /^\/_xpack\/sql(?:\/(?:translate|close))?$/,
  /^\/(?:[^/]+\/)?_field_caps$/,
  /^\/(?:[^/]+\/)?_analyze$/,
  /^\/(?:[^/]+\/)?_validate\/query$/,
  /^\/(?:[^/]+\/)?_explain\/[^/]+$/,
  /^\/(?:[^/]+\/)?_terms_enum$/,
  /^\/(?:[^/]+\/)?_termvectors(?:\/[^/]+)?$/,
  /^\/(?:[^/]+\/)?_mtermvectors$/,
  /^\/(?:[^/]+\/)?_rank_eval$/,
  /^\/_pit$/,
  /^\/_pit\/[^/]+$/,
  /^\/_scripts\/painless\/_execute$/,
];
const REST_DELETE_READ = [/^\/_search\/scroll$/, /^\/_pit$/, /^\/_pit\/[^/]+$/, /^\/_sql\/close$/];

function isReadRest(method, path) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  const p = String(path || '').trim().toLowerCase().split('?')[0].replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const patterns = m === 'POST' ? REST_POST_READ : m === 'DELETE' ? REST_DELETE_READ : [];
  return patterns.some((re) => re.test(p));
}

function msearchNdjson(args) {
  const searches = args.searches;
  if (!Array.isArray(searches) || !searches.length) throw new Error('searches must be a non-empty array');
  const defaultIndex = args.index ? String(args.index) : '';
  const lines = [];
  for (const search of searches) {
    if (!search || typeof search !== 'object') throw new Error('each search must be an object');
    const index = String(search.index || defaultIndex || '').trim();
    if (!index) throw new Error('each search needs index');
    lines.push(JSON.stringify({ index }));
    lines.push(JSON.stringify({
      size: search.size == null ? 10 : Math.max(1, Math.min(100, Number(search.size) || 10)),
      query: queryClause(search.query) || { match_all: {} },
    }));
  }
  return lines.join('\n') + '\n';
}

function bulkNdjson(args) {
  const operations = args.operations;
  if (!Array.isArray(operations) || !operations.length) throw new Error('operations must be a non-empty array');
  const defaultIndex = args.index ? String(args.index) : '';
  const lines = [];
  for (const op of operations) {
    if (!op || typeof op !== 'object') throw new Error('each operation must be an object');
    const action = String(op.action || 'index').toLowerCase();
    if (!['index', 'create', 'update', 'delete'].includes(action)) throw new Error('unsupported bulk action: ' + action);
    const index = String(op.index || defaultIndex || '').trim();
    if (!index) throw new Error('each operation needs index');
    const meta = { _index: index };
    if (op.id != null && String(op.id).trim()) meta._id = String(op.id).trim();
    lines.push(JSON.stringify({ [action]: meta }));
    if (action !== 'delete') {
      if (op.document == null) throw new Error('bulk ' + action + ' needs document');
      const doc = typeof op.document === 'string' ? JSON.parse(op.document) : op.document;
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('bulk document must be an object');
      lines.push(JSON.stringify(action === 'update' ? { doc } : doc));
    }
  }
  return lines.join('\n') + '\n';
}

function queryClause(raw) {
  if (raw == null) return null;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'query')) {
    return parsed.query;
  }
  return parsed;
}
function objectArg(args, key) {
  const value = args?.[key];
  if (value == null) throw new Error(`Missing required argument: ${key}`);
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${key} must be an object`);
  return parsed;
}

function tools() {
  return allowWrite ? TOOL_DEFINITIONS : TOOL_DEFINITIONS.filter((t) => !WRITE_TOOLS.includes(t.name));
}

function response(id, result) { return { jsonrpc: '2.0', id, result }; }
function error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

async function handle(request) {
  if (!request || request.jsonrpc !== '2.0') return error(null, -32600, 'Invalid Request');
  const id = request.id;
  const method = String(request.method || '');
  if (method === 'notifications/initialized') return null;
  if (method === 'initialize') {
    return response(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'ESQueryStudio Local', version: '1.0.0', mode: 'local', writes: allowWrite },
    });
  }
  if (method === 'ping') return response(id, {});
  if (method === 'tools/list') return response(id, { tools: tools() });
  if (method === 'tools/call') {
    const params = request.params || {};
    try {
      const data = await callTool(String(params.name || ''), params.arguments || {});
      return response(id, { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false });
    } catch (e) {
      return response(id, { content: [{ type: 'text', text: String(e?.message || e) }], isError: true });
    }
  }
  return error(id, -32601, `Method not found: ${method}`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
const write = (value) => process.stdout.write(JSON.stringify(value) + '\n');
rl.on('line', async (line) => {
  const text = String(line || '').trim();
  if (!text) return;
  let request;
  try { request = JSON.parse(text); }
  catch { write(error(null, -32700, 'Parse error')); return; }
  try {
    const result = await handle(request);
    if (result != null) write(result);
  } catch (e) {
    write(error(request?.id ?? null, -32603, String(e?.message || e)));
  }
});
