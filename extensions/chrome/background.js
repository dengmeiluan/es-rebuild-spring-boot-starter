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
