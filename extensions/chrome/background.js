/*
 * ESQueryStudio Chrome extension — network broker.
 *
 * The extension page never calls a remote origin directly. All Elasticsearch
 * requests go through this service worker, which uses the granted optional
 * host permission to bypass the page's CORS restrictions. The allowlist and
 * protocol checks are intentionally small: this is a query console, not a
 * general-purpose proxy.
 */

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'HEAD']);
const MAX_BODY_BYTES = 8 * 1024 * 1024;

chrome.action.onClicked.addListener(() => {
  /* 原生 Vue 控制台（browser 构建）是插件主界面；直连单页保留给右键菜单。 */
  chrome.tabs.create({ url: chrome.runtime.getURL('app/index.html') });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'esq-lucene', title: '用选中文本发起 Lucene 查询', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'esq-dsl', title: '把选中内容作为 DSL 打开', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'esq-workbench', title: '打开直连工作台', contexts: ['action'] });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'esq-workbench') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    return;
  }
  const text = String(info.selectionText || '').slice(0, 20000);
  const mode = info.menuItemId === 'esq-dsl' ? 'dsl' : 'lucene';
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') + '?mode=' + mode + '&prefill=' + encodeURIComponent(text) });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'esRequest') return false;

  (async () => {
    try {
      const url = new URL(String(message.url || ''));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only http/https Elasticsearch endpoints are allowed.');
      }
      const method = String(message.method || 'GET').toUpperCase();
      if (!ALLOWED_METHODS.has(method)) {
        throw new Error('HTTP method is not allowed by the extension broker.');
      }
      const body = message.body == null ? undefined : String(message.body);
      if (body && body.length > MAX_BODY_BYTES) {
        throw new Error('Request body exceeds the 8 MB extension limit.');
      }
      const headers = {};
      for (const [key, value] of Object.entries(message.headers || {})) {
        if (typeof value === 'string') headers[key] = value;
      }
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store',
      });
      const text = await response.text();
      sendResponse({
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
      });
    } catch (error) {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    }
  })();

  return true;
});

/* ── 后台监控采样：页面关闭后仍每分钟取一次集群健康 ─────────────────────
 * 原生 Vue 控制台的 browserApi 在页面打开时做完整采样；这里是无页面时的兜底，
 * 只写集群级健康行（QPS/索引速率按前后两次计数差计算），存进同一 IndexedDB。
 * 不伪造历史：拿不到集群就写一条带 error 的 RED 行，页面会如实显示。 */
const MONITOR_ALARM = 'esq-monitor';
const MONITOR_DB = 'esquerystudio.browser';
const PROFILE_KEY = 'esquerystudio.browser.profile';

function ensureMonitorAlarm() {
  try {
    chrome.alarms.get(MONITOR_ALARM, (a) => {
      if (!a) chrome.alarms.create(MONITOR_ALARM, { periodInMinutes: 1 });
    });
  } catch { /* 旧版 Chrome */ }
}
chrome.runtime.onInstalled.addListener(ensureMonitorAlarm);
chrome.runtime.onStartup.addListener(ensureMonitorAlarm);
ensureMonitorAlarm();
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === MONITOR_ALARM) void sampleMonitor();
});

function openMonitorDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(MONITOR_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ['monitor', 'alerts', 'audit']) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function dbAddMonitor(record) {
  return openMonitorDb().then(db => new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction('monitor', 'readwrite');
      tx.objectStore('monitor').add(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  }));
}

function dbLatestMonitor() {
  return openMonitorDb().then(db => new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const req = db.transaction('monitor', 'readonly').objectStore('monitor').getAll();
      req.onsuccess = () => {
        const rows = (req.result || []).filter(r => r.scope === 'cluster');
        resolve(rows.length ? rows[rows.length - 1] : null);
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  }));
}

function monitorAuth(p) {
  if (!p || !p.username) return {};
  return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(p.username + ':' + (p.password || '')))) };
}

async function monitorFetch(p, path) {
  const res = await fetch(String(p.url).replace(/\/+$/, '') + path, {
    headers: { Accept: 'application/json', ...monitorAuth(p) }, credentials: 'omit', cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && (data.error?.reason || data.message)) || text || ('HTTP ' + res.status));
  return data;
}

async function sampleMonitor() {
  const saved = await chrome.storage.local.get([PROFILE_KEY, 'esquerystudio.monitor.lastSample']);
  const p = saved[PROFILE_KEY];
  if (!p || !p.url) return;
  const now = Date.now();
  if (saved['esquerystudio.monitor.lastSample'] && now - saved['esquerystudio.monitor.lastSample'] < 55000) return;
  const started = Date.now();
  let root = null, health = null, stats = null, cat = [];
  let error = '';
  try {
    [root, health, stats, cat] = await Promise.all([
      monitorFetch(p, '/'),
      monitorFetch(p, '/_cluster/health'),
      monitorFetch(p, '/_nodes/stats/indices,jvm,os,fs,thread_pool'),
      monitorFetch(p, '/_cat/indices?format=json&h=index,health,docs.count,store.size,pri,rep,docs.deleted'),
    ]);
  } catch (e) {
    error = String(e && e.message ? e.message : e).slice(0, 500);
  }
  const prev = await dbLatestMonitor();
  const nodes = stats && stats.nodes ? Object.values(stats.nodes) : [];
  const sum = (fn) => nodes.reduce((n, x) => n + (Number(fn(x)) || 0), 0);
  const connName = (health && health.cluster_name) || (root && root.cluster_name) || 'cluster';
  const dt = prev ? Math.max(1, (now - prev.timestamp) / 1000) : 0;
  const searchTotal = sum(x => x?.indices?.search?.query_total);
  const indexTotal = sum(x => x?.indices?.indexing?.index_total);
  const rec = {
    timestamp: now, connId: 'browser', connName, env: 'BROWSER', scope: 'cluster',
    status: error ? 'RED' : String((health && health.status) || 'unknown'),
    latencyMs: Date.now() - started,
    esVersion: root && root.version ? root.version.number : undefined,
    nodes: Number((health && health.number_of_nodes) || nodes.length),
    indices: (cat || []).filter(r => !String(r.index || '').startsWith('.')).length,
    shards: Number((health && health.active_shards) || 0),
    unassigned: Number((health && health.unassigned_shards) || 0),
    primaryShards: Number((health && health.active_primary_shards) || 0),
    nodesMissing: Math.max(0, Number((health && health.number_of_nodes) || 0) - nodes.length),
    error: error || undefined,
    _searchTotal: searchTotal, _indexTotal: indexTotal,
  };
  if (dt && prev) {
    rec.qps = Math.round(((searchTotal - Number(prev._searchTotal || 0)) / dt) * 100) / 100;
    rec.indexRate = Math.round(((indexTotal - Number(prev._indexTotal || 0)) / dt) * 100) / 100;
  }
  await dbAddMonitor(rec);
  await chrome.storage.local.set({ 'esquerystudio.monitor.lastSample': now });
}
