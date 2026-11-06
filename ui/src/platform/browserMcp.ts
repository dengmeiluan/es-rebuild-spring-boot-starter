/**
 * Browser-mode MCP bridge.
 *
 * A browser tab cannot listen on TCP, so pure front-end mode exposes a real MCP
 * JSON-RPC handler to in-page agents through `window.ESQueryStudioMCP`. External
 * MCP clients that require a process transport should use server mode (`/mcp`)
 * or the optional local bridge described in docs/mcp.md. The tool contracts are
 * intentionally the same as the server implementation.
 */
import { browserFetch } from './browserApi';
import { activeProfile, profiles } from './browserProfiles';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

const MCP_PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'ESQueryStudio', version: '1.0.9', mode: 'browser' as const };

function schema(properties: Record<string, any>, required: string[] = []): Record<string, any> {
  const out: Record<string, any> = { type: 'object', properties };
  if (required.length) out.required = required;
  return out;
}

function val(type: string, description: string): Record<string, any> {
  return { type, description };
}

export const MCP_WRITE_TOOLS = ['es_index_doc', 'es_update_doc', 'es_delete_doc'];
const WRITE_FLAG = 'esquerystudio.mcp.allowWrite';

/** 页面内写工具默认关闭；用户在 MCP 面板显式打开后才会执行。 */
export function isBrowserMcpWriteAllowed(): boolean {
  try { return localStorage.getItem(WRITE_FLAG) === 'true'; } catch { return false; }
}

export function setBrowserMcpWriteAllowed(value: boolean): void {
  try { localStorage.setItem(WRITE_FLAG, value ? 'true' : 'false'); } catch { /* 隐私模式禁用存储时保持内存态 */ }
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'es_list_connections',
    description: 'List connections this MCP client may target.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_indices',
    description: 'List non-system Elasticsearch indices.',
    inputSchema: schema({}),
  },
  {
    name: 'es_cluster_health',
    description: 'Return cluster health, version and shard counts.',
    inputSchema: schema({}),
  },
  {
    name: 'es_get_mapping',
    description: 'Return the live mapping, field tree and field types for an index.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_get_doc',
    description: 'Get one document by id.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
    }, ['index', 'id']),
  },
  {
    name: 'es_get_settings',
    description: 'Return index settings.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_get_aliases',
    description: 'List aliases and their indices.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_templates',
    description: 'List index templates, with legacy-template normalization.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_nodes',
    description: 'List cluster nodes and their roles/health.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_tasks',
    description: 'List running cluster tasks.',
    inputSchema: schema({ actions: val('string', 'Optional task action filter.') }),
  },
  {
    name: 'es_search',
    description: 'Run an Elasticsearch DSL search and return the raw response.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      query: val('object', 'Elasticsearch query object, or a JSON string.'),
      size: val('integer', 'Number of hits, 1-100.'),
      explain: val('boolean', 'Include _explanation in hits.'),
      profile: val('boolean', 'Include the profile tree.'),
    }, ['index']),
  },
  {
    name: 'es_count',
    description: 'Count documents matching a query.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      query: val('object', 'Query object, or a JSON string.'),
    }, ['index']),
  },
  {
    name: 'es_sql',
    description: 'Run an Elasticsearch SQL query and return columns, rows and cursor.',
    inputSchema: schema({
      query: val('string', 'SQL text.'),
      fetchSize: val('integer', 'Fetch size, 1-5000.'),
    }, ['query']),
  },
  {
    name: 'es_explain_doc',
    description: 'Explain one document against a query using _explain.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
      query: val('object', 'Query object, or a JSON string.'),
    }, ['index', 'id']),
  },
  {
    name: 'es_get_index_stats',
    description: 'Return index stats.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_index_doc',
    description: 'Create or overwrite a document by id.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
      document: val('object', 'Document body object, or a JSON object string.'),
    }, ['index', 'id', 'document']),
  },
  {
    name: 'es_update_doc',
    description: 'Partially update fields of a document by id.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
      document: val('object', 'Partial document object, or a JSON object string.'),
    }, ['index', 'id', 'document']),
  },
  {
    name: 'es_delete_doc',
    description: 'Delete a document by id.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
    }, ['index', 'id']),
  },
  {
    name: 'es_rest',
    description: 'Run a raw Elasticsearch REST request; write methods require write permission.',
    inputSchema: schema({
      method: val('string', 'GET, HEAD, POST, PUT or DELETE.'),
      path: val('string', 'REST path starting with /.'),
      body: val('object', 'Optional JSON body object or string.'),
    }, ['method', 'path']),
  },
];

function required(args: Record<string, any>, key: string): string {
  const value = args[key];
  if (value == null || String(value).trim() === '') throw new Error(`Missing required argument: ${key}`);
  return String(value).trim();
}

/** 接受查询子句对象或 JSON 字符串（子句本身或完整 {"query":...} 搜索体）。 */
function queryClause(raw: any): any {
  if (raw == null) return null;
  const parsed = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : null) : raw;
  if (parsed == null) return null;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('query must be an object or a JSON object string');
  return Object.prototype.hasOwnProperty.call(parsed, 'query') ? parsed.query : parsed;
}

/* 与 McpRestClassifier 同口径：ES 的查询大量走 POST，不能用方法粗判读写。 */
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
const REST_DELETE_READ = [
  /^\/_search\/scroll$/,
  /^\/_pit$/,
  /^\/_pit\/[^/]+$/,
  /^\/_sql\/close$/,
];

export function isMcpRestReadOnly(method: string, path: string): boolean {
  const m = String(method || 'GET').trim().toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  const p = String(path || '').trim().toLowerCase().split('?')[0].replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const patterns = m === 'POST' ? REST_POST_READ : m === 'DELETE' ? REST_DELETE_READ : [];
  return patterns.some((re) => re.test(p));
}

function documentBody(args: Record<string, any>, key: string): string {
  const raw = args[key];
  if (raw == null) throw new Error(`Missing required argument: ${key}`);
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${key} must be an object or a JSON object string`);
  return JSON.stringify(parsed);
}

function searchBody(args: Record<string, any>): string {
  const size = args.size == null ? 10 : Math.max(1, Math.min(100, Number(args.size) || 10));
  const body: Record<string, any> = {
    size,
    query: queryClause(args.query) || { match_all: {} },
  };
  return JSON.stringify(body);
}

async function rawTool(method: string, path: string, body?: any): Promise<any> {
  return jsonFetch('/internal/es/index/cluster/raw', {
    method: 'POST',
    body: JSON.stringify({
      method,
      path,
      body: typeof body === 'string' ? body : JSON.stringify(body || {}),
    }),
  });
}

async function jsonFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await browserFetch(path, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error?.reason || `HTTP ${res.status}`);
  return data;
}

export async function mcpCallTool(name: string, args: Record<string, any> = {}): Promise<any> {
  if (MCP_WRITE_TOOLS.includes(name) && !isBrowserMcpWriteAllowed()) {
    throw new Error('页面内写工具未启用：请在 Dev Tools → MCP 面板显式打开「允许页面内写工具」');
  }
  let data: any;
  switch (name) {
    case 'es_list_connections': {
      const active = activeProfile()?.id;
      data = profiles().map(profile => ({
        id: profile.id,
        name: profile.name,
        env: profile.env,
        active: profile.id === active,
      }));
      break;
    }
    case 'es_list_indices':
      data = await jsonFetch('/internal/es/index/cluster/indices');
      break;
    case 'es_cluster_health':
      data = await jsonFetch('/internal/es/index/cluster/health');
      break;
    case 'es_get_mapping':
      data = await jsonFetch('/internal/es/index/cluster/mapping-detail?index=' + encodeURIComponent(required(args, 'index')));
      break;
    case 'es_get_doc':
      data = await jsonFetch('/internal/es/index/cluster/doc?index=' + encodeURIComponent(required(args, 'index'))
        + '&id=' + encodeURIComponent(required(args, 'id')));
      break;
    case 'es_get_settings':
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index')) + '/_settings');
      break;
    case 'es_get_aliases':
      data = await rawTool('GET', '/_cat/aliases?format=json');
      break;
    case 'es_list_templates':
      try { data = await rawTool('GET', '/_index_template'); }
      catch { data = await rawTool('GET', '/_template'); }
      break;
    case 'es_list_nodes':
      data = await rawTool('GET', '/_cat/nodes?format=json');
      break;
    case 'es_list_tasks':
      data = await rawTool('GET', '/_tasks?group_by=parents' + (args.actions ? '&actions=' + encodeURIComponent(String(args.actions)) : ''));
      break;
    case 'es_search':
      data = await jsonFetch(
        '/internal/es/index/cluster/search-dsl?index=' + encodeURIComponent(required(args, 'index'))
          + '&explain=' + (args.explain ? 'true' : 'false')
          + '&profile=' + (args.profile ? 'true' : 'false'),
        { method: 'POST', body: searchBody(args) },
      );
      break;
    case 'es_get_index_stats':
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index')) + '/_stats');
      break;
    case 'es_count':
      data = await jsonFetch('/internal/es/index/cluster/count?index=' + encodeURIComponent(required(args, 'index')), {
        method: 'POST',
        body: JSON.stringify({ query: queryClause(args.query) || { match_all: {} } }),
      });
      break;
    case 'es_sql':
      data = await jsonFetch('/internal/es/index/cluster/sql/query', {
        method: 'POST',
        body: JSON.stringify({
          query: required(args, 'query'),
          fetch_size: args.fetchSize ? Math.max(1, Math.min(5000, Number(args.fetchSize) || 200)) : undefined,
        }),
      });
      break;
    case 'es_explain_doc': {
      const query = queryClause(args.query) || { match_all: {} };
      data = await jsonFetch(
        '/internal/es/index/cluster/explain-doc?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id')),
        { method: 'POST', body: JSON.stringify({ query }) },
      );
      break;
    }
    case 'es_index_doc':
      data = await jsonFetch(
        '/internal/es/index/cluster/doc?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id')) + '&refresh=true',
        { method: 'POST', body: documentBody(args, 'document') },
      );
      break;
    case 'es_update_doc':
      data = await jsonFetch(
        '/internal/es/index/cluster/update-partial?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id')),
        { method: 'POST', body: documentBody(args, 'document') },
      );
      break;
    case 'es_delete_doc':
      data = await jsonFetch(
        '/internal/es/index/cluster/delete-by-id?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id')),
        { method: 'POST' },
      );
      break;
    case 'es_rest': {
      const method = required(args, 'method').toUpperCase();
      const path = required(args, 'path');
      if (!path.startsWith('/') || path.includes('..')) throw new Error('path must start with / and must not contain ..');
      if (!isMcpRestReadOnly(method, path) && !isBrowserMcpWriteAllowed()) {
        throw new Error('页面内写工具未启用：raw ' + method + ' ' + path + ' 需要打开「允许页面内写工具」');
      }
      data = await jsonFetch('/internal/es/index/cluster/raw', {
        method: 'POST',
        body: JSON.stringify({
          method,
          path,
          body: typeof args.body === 'string' ? args.body : JSON.stringify(args.body || {}),
        }),
      });
      break;
    }
    default:
      throw new Error('Unknown tool: ' + name);
  }
  return data;
}

export async function handleMcpRequest(request: any): Promise<any> {
  if (!request || request.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  const id = request.id;
  const method = String(request.method || '');
  if (method === 'notifications/initialized') return null;
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id, result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      },
    };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') {
    const tools = isBrowserMcpWriteAllowed()
      ? MCP_TOOLS
      : MCP_TOOLS.filter(tool => !MCP_WRITE_TOOLS.includes(tool.name));
    return { jsonrpc: '2.0', id, result: { tools } };
  }
  if (method === 'tools/call') {
    const params = request.params || {};
    try {
      const data = await mcpCallTool(String(params.name || ''), params.arguments || {});
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false },
      };
    } catch (e: any) {
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: String(e?.message || e) }], isError: true },
      };
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
}

declare global {
  interface Window {
    ESQueryStudioMCP?: {
      protocolVersion: string;
      tools: McpToolDefinition[];
      handle: (request: any) => Promise<any>;
      callTool: (name: string, args?: Record<string, any>) => Promise<any>;
    };
  }
}

export function installBrowserMcp(): void {
  if (typeof window === 'undefined') return;
  window.ESQueryStudioMCP = {
    protocolVersion: MCP_PROTOCOL_VERSION,
    tools: MCP_TOOLS,
    handle: handleMcpRequest,
    callTool: mcpCallTool,
  };
}
