/* Pure-browser transport for the Vue console.
 *
 * The same Vue pages call the same `api.ts` methods in both modes:
 *   server mode  -> fetch('/internal/es/index/...') to the Spring backend
 *   browser mode -> this adapter maps those paths to Elasticsearch REST
 *
 * The adapter is deliberately a thin compatibility layer, not a second UI:
 * pages, stores, components and styles stay untouched. Unmapped endpoints
 * return a visible 501 instead of silently faking data.
 */

export const isBrowserMode = import.meta.env.MODE === 'browser';

export interface BrowserProfile {
  url: string;
  username?: string;
  password?: string;
}

const PROFILE_KEY = 'esquerystudio.browser.profile';
const PREFIX = '/internal/es/index';

function profile(): BrowserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p.url === 'string' && p.url ? p : null;
  } catch { return null; }
}

function saveProfile(p: BrowserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

function authHeaders(p: BrowserProfile): Record<string, string> {
  if (p.username) {
    return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(p.username + ':' + (p.password || '')))) };
  }
  return {};
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(status: number, message: string, code?: string): Response {
  return response({ error: true, message, ...(code ? { code } : {}) }, status);
}

async function esDirect(path: string, method = 'GET', body?: string): Promise<{ status: number; data: any; text: string }> {
  const p = profile();
  if (!p) throw new Error('浏览器模式尚未连接 Elasticsearch');
  const base = p.url.replace(/\/+$/, '');
  const res = await fetch(base + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(p),
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    credentials: 'omit',
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text };
}

function bodyOf(init?: RequestInit): any {
  try { return init?.body ? JSON.parse(String(init.body)) : null; } catch { return null; }
}

function splitPath(input: RequestInfo | URL): { path: string; query: string } | null {
  const u = new URL(String(input), location.href);
  const i = u.pathname.indexOf(PREFIX);
  if (i < 0) return null;
  return { path: u.pathname.slice(i + PREFIX.length) || '/', query: u.search || '' };
}

async function route(path: string, query: string, method: string, bodyText: string, body: any): Promise<Response> {
  if (path === '/setup/status') {
    const p = profile();
    return response({
      bound: !!p, mode: p ? 'BROWSER' : 'NONE', endpoint: p?.url || null,
      appName: 'ESQueryStudio Browser', hostVisible: true, authEnabled: false,
      builtinLogin: false, setupTokenRequired: false,
    });
  }
  if (path === '/setup/test') {
    const url = String(body?.url || '').trim();
    if (!url) return fail(400, '请输入 Elasticsearch 地址');
    try {
      const r = await fetch(url.replace(/\/+$/, '') + '/', {
        headers: authHeaders({ url, username: body?.username, password: body?.password }),
        credentials: 'omit',
      });
      const d = await r.json();
      return response({ ok: true, clusterName: d.cluster_name || d.name || 'cluster', version: d.version?.number || '—', status: d.tagline ? 'green' : 'green', nodes: 1 });
    } catch (e) {
      return fail(400, String((e as any)?.message || e));
    }
  }
  if (path === '/setup/apply' || path === '/setup/rebind') {
    const url = String(body?.url || '').trim();
    if (!url) return fail(400, '请输入 Elasticsearch 地址');
    saveProfile({ url, username: body?.username || '', password: body?.password || '' });
    return response({ bound: true });
  }
  if (path === '/auth/me') {
    if (!profile()) return fail(401, '请先连接 Elasticsearch', 'SETUP_REQUIRED');
    return response({
      username: 'browser', displayName: 'Browser Admin', role: 'ADMIN',
      fallback: false, delegated: false, grantedPages: null,
    });
  }
  if (path === '/auth/login') return response({ token: 'browser' });
  if (path === '/auth/logout') return response({ ok: true });
  if (path === '/clusters') {
    const p = profile();
    if (!p) return response([]);
    const u = new URL(p.url);
    return response([{
      id: 'browser', name: u.hostname || 'Elasticsearch', scheme: u.protocol.replace(':', ''),
      host: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 9200)),
      username: p.username || '', hasPassword: !!p.password, authType: 'BASIC', env: 'BROWSER',
    }]);
  }
  if (path === '/health') return response({ status: 'green', mode: 'browser' });
  if (path === '/keys') return response([]);
  /* 浏览器模式没有服务端环形历史/告警存储：返回空集，让同一 Vue 页面渲染空态而不是报错。 */
  if (path === '/monitor-history') return response([]);
  if (path === '/monitor-alerts') return response({ records: [] });
  if (path === '/monitor-metrics' || path === '/monitor-metrics/top-indexes') return response({ records: [] });
  if (path === '/overview') {
    const cat = await esDirect('/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep&s=index');
    const health = await esDirect('/_cluster/health');
    return response({ indices: cat.data || [], health: health.data || {}, mode: 'browser' });
  }
  if (!path.startsWith('/cluster/')) return fail(501, '浏览器模式暂未映射端点：' + path, 'BROWSER_MODE_UNMAPPED');

  const q = new URLSearchParams(query);
  const index = q.get('index') || '';
  const idx = index ? '/' + encodeURIComponent(index) : '';
  if (path === '/cluster/health') return response((await esDirect('/_cluster/health')).data);
  if (path === '/cluster/indices') return response((await esDirect('/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep&s=index')).data);
  if (path === '/cluster/inspect') {
    const r = await esDirect(idx + '/_mapping');
    const map = r.data?.[index]?.mappings || {};
    return response({ mappings: { [index]: map }, index });
  }
  if (path === '/cluster/mapping-detail') {
    const r = await esDirect(idx + '/_mapping');
    return response({ raw: r.data?.[index]?.mappings || {}, index });
  }
  if (path === '/cluster/index-settings') {
    const r = await esDirect(idx + '/_settings');
    return response(r.data);
  }
  if (path === '/cluster/index-settings-defaults') {
    const r = await esDirect(idx + '/_settings?include_defaults=true');
    return response(r.data);
  }
  if (path === '/cluster/shards') {
    const p = index ? '/_cat/shards/' + encodeURIComponent(index) + '?format=json' : '/_cat/shards?format=json';
    return response((await esDirect(p)).data);
  }
  if (path === '/cluster/aliases') return response((await esDirect('/_cat/aliases?format=json')).data);
  if (path === '/cluster/query') {
    const r = await esDirect(idx + '/_search', 'POST', bodyText || '{}');
    if (r.status >= 400) return response(r.data, r.status);
    const h = r.data?.hits || {};
    return response({
      total: h.total?.value ?? h.total ?? 0,
      totalGte: h.total?.relation === 'gte',
      took: r.data?.took ?? 0,
      shards: r.data?._shards,
      hits: h.hits || [],
    });
  }
  if (path === '/cluster/search-raw' || path === '/cluster/search-dsl') {
    const r = await esDirect(idx + '/_search', 'POST', bodyText || '{}');
    return response(r.data, r.status);
  }
  if (path === '/cluster/profile') {
    const r = await esDirect(idx + '/_search', 'POST', bodyText || '{}');
    return response(r.data, r.status);
  }
  if (path === '/cluster/sql') {
    const sql = typeof body === 'string' ? body : String(body?.query || body || '');
    const r = await esDirect('/_sql?format=json', 'POST', JSON.stringify({ query: sql }));
    return response(r.data, r.status);
  }
  if (path === '/cluster/analyze') {
    return response((await esDirect(idx + '/_analyze', 'POST', bodyText || '{}')).data);
  }
  if (path === '/cluster/count') {
    return response((await esDirect(idx + '/_count', 'POST', bodyText || '{}')).data);
  }
  if (path === '/cluster/doc') {
    return response((await esDirect(idx + '/_doc/' + encodeURIComponent(q.get('id') || ''))).data);
  }
  if (path === '/cluster/explain-doc') {
    return response((await esDirect(idx + '/_explain/' + encodeURIComponent(q.get('id') || ''), 'POST', bodyText || '{}')).data);
  }
  if (path === '/cluster/terms-enum' || path === '/cluster/field-caps') {
    return response((await esDirect(idx + '/_field_caps?fields=*')).data);
  }
  if (path === '/cluster/tasks') {
    const r = await esDirect('/_tasks?group_by=parents&detailed=true');
    return response(Object.values(r.data?.tasks || {}));
  }
  if (path === '/cluster/pending-tasks') return response((await esDirect('/_cluster/pending_tasks')).data);
  if (path === '/cluster/nodes-stats') return response((await esDirect('/_nodes/stats')).data);
  if (path === '/cluster/settings') return response((await esDirect('/_cluster/settings?include_defaults=true')).data);
  if (path === '/cluster/aliases') return response((await esDirect('/_cat/aliases?format=json')).data);
  if (path === '/cluster/validate-query') {
    return response((await esDirect(idx + '/_validate/query?explain=true', 'POST', bodyText || '{}')).data);
  }
  if (path === '/cluster/raw' || path === '/cluster/devtools/execute') {
    const b = body || {};
    const target = String(b.path || '/');
    const r = await esDirect(target, String(b.method || 'GET').toUpperCase(), b.body || undefined);
    return response({ status: r.status, body: r.data }, r.status);
  }
  if (path === '/cluster/allocation-explain') {
    return response((await esDirect('/_cluster/allocation/explain', 'POST', bodyText || '{}')).data);
  }
  return fail(501, '浏览器模式暂未映射端点：' + path, 'BROWSER_MODE_UNMAPPED');
}

export async function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = splitPath(input);
  if (!target) return fetch(input, init);
  const method = String(init?.method || 'GET').toUpperCase();
  const bodyText = init?.body == null ? '' : String(init.body);
  try {
    return await route(target.path, target.query, method, bodyText, bodyOf(init));
  } catch (e) {
    return fail(500, String((e as any)?.message || e), 'BROWSER_BRIDGE_FAILED');
  }
}
