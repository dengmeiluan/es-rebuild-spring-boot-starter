/* ESQueryStudio extension — shell: connection, index list, navigation, storage. */
(function () {
  'use strict';
  const C = window.ESCore;
  const $ = (id) => document.getElementById(id);
  const KEY = {
    profile: 'esquerystudio.ext.profile',
    history: 'esquerystudio.ext.history',
    favorites: 'esquerystudio.ext.favorites',
  };

  const state = {
    profile: { baseUrl: '', authMode: 'none', username: '', password: '', apiKey: '', remember: true },
    cluster: null,
    indices: [],
    selectedIndex: '',
    mapping: null,
    fields: [],
    history: [],
    favorites: [],
    view: 'query',
    lastResult: null,
    lastQuery: null,
    lastMode: 'dsl',
    busy: false,
  };

  const els = {
    baseUrl: $('baseUrl'), authMode: $('authMode'), username: $('username'), password: $('password'),
    apiKey: $('apiKey'), remember: $('remember'), basicFields: $('basicFields'), apiKeyFields: $('apiKeyFields'),
    connectBtn: $('connectBtn'), connMsg: $('connMsg'), connPill: $('connPill'), sideDot: $('sideDot'),
    sideStatus: $('sideStatus'), indexFilter: $('indexFilter'), indexSelect: $('indexSelect'),
    indexCount: $('indexCount'), indexMeta: $('indexMeta'), fieldHint: $('fieldHint'),
  };

  function storageGet(key, fallback) {
    if (!(window.chrome && chrome.storage && chrome.storage.local)) return Promise.resolve(fallback);
    return new Promise((resolve) => chrome.storage.local.get([key], (obj) => resolve(obj[key] ?? fallback)));
  }
  function storageSet(key, value) {
    if (!(window.chrome && chrome.storage && chrome.storage.local)) return Promise.resolve();
    return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
  }
  function saveProfile() {
    const p = Object.assign({}, state.profile);
    if (!p.remember) { p.password = ''; p.apiKey = ''; }
    return storageSet(KEY.profile, p);
  }
  function loadStored() {
    return Promise.all([
      storageGet(KEY.profile, state.profile),
      storageGet(KEY.history, []),
      storageGet(KEY.favorites, []),
    ]).then(([profile, history, favorites]) => {
      state.profile = Object.assign(state.profile, profile || {});
      state.history = Array.isArray(history) ? history.slice(0, C.HISTORY_CAP) : [];
      state.favorites = Array.isArray(favorites) ? favorites.slice(0, C.FAVORITE_CAP) : [];
      if (profile && profile.baseUrl) {
        els.baseUrl.value = profile.baseUrl;
        els.authMode.value = profile.authMode || 'none';
        els.username.value = profile.username || '';
        els.password.value = profile.remember ? (profile.password || '') : '';
        els.apiKey.value = profile.remember ? (profile.apiKey || '') : '';
        els.remember.checked = profile.remember !== false;
      }
    });
  }

  function toast(message, isError) {
    const el = $('toast');
    el.textContent = message;
    el.classList.toggle('err', !!isError);
    el.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add('hidden'), isError ? 6500 : 3500);
  }

  function setConnection(connected, label, cls) {
    els.connPill.textContent = label;
    els.connPill.className = 'pill ' + (cls || (connected ? 'ok' : 'off'));
    els.sideDot.className = 'dot ' + (connected ? 'ok' : '');
    els.sideStatus.textContent = label;
  }

  function readForm() {
    state.profile = {
      baseUrl: els.baseUrl.value.trim(),
      authMode: els.authMode.value,
      username: els.username.value.trim(),
      password: els.password.value,
      apiKey: els.apiKey.value.trim(),
      remember: els.remember.checked,
    };
  }

  async function es(path, options) {
    return C.relay(state.profile, path, options || {});
  }

  async function requestPermission(baseUrl) {
    if (!(window.chrome && chrome.permissions && chrome.permissions.request)) return true;
    const origin = new URL(baseUrl).origin + '/*';
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error('未授权访问 ' + origin + '，请在扩展详情中允许该地址');
    return true;
  }

  async function connect() {
    readForm();
    els.connectBtn.disabled = true;
    els.connMsg.textContent = '正在连接…';
    try {
      const base = C.normalizeBaseUrl(state.profile.baseUrl);
      state.profile.baseUrl = base;
      els.baseUrl.value = base;
      await requestPermission(base);
      const info = await es('/', { method: 'GET' });
      const d = info.data || {};
      state.cluster = {
        name: d.cluster_name || d.name || 'cluster',
        version: (d.version && (d.version.number || d.version.build_flavor)) || '—',
      };
      await loadIndices();
      setConnection(true, '已连接 · ' + state.cluster.name);
      updateTop();
      els.connMsg.textContent = 'Elasticsearch ' + state.cluster.version + ' · ' + state.indices.length + ' 个索引';
      await saveProfile();
      toast('已连接 ' + state.cluster.name);
    } catch (err) {
      state.cluster = null;
      setConnection(false, '连接失败', 'bad');
      els.connMsg.textContent = String(err.message || err);
      toast(String(err.message || err), true);
    } finally {
      els.connectBtn.disabled = false;
    }
  }

  async function loadIndices() {
    const res = await es('/_cat/indices?format=json&h=index,health,status,docs.count,store.size&s=index', { method: 'GET' });
    state.indices = Array.isArray(res.data) ? res.data : [];
    renderIndices();
    if (state.indices.length && !state.indices.some((i) => i.index === state.selectedIndex)) {
      await selectIndex(state.indices[0].index);
    }
  }

  function renderIndices() {
    const filter = els.indexFilter.value.trim().toLowerCase();
    const list = state.indices.filter((i) => !filter || String(i.index || '').toLowerCase().includes(filter));
    els.indexSelect.innerHTML = '';
    for (const item of list) {
      const opt = document.createElement('option');
      opt.value = item.index;
      opt.textContent = (item.health === 'green' ? '● ' : item.health === 'yellow' ? '● ' : '● ')
        + item.index + '  ' + (item['docs.count'] || '0');
      opt.style.color = item.health === 'green' ? '#34d399' : item.health === 'yellow' ? '#fbbf24' : '#f87171';
      opt.selected = item.index === state.selectedIndex;
      els.indexSelect.appendChild(opt);
    }
    els.indexCount.textContent = String(state.indices.length);
    updateTop();
  }

  function updateTop() {
    const item = state.indices.find((i) => i.index === state.selectedIndex);
    $('topCluster').textContent = state.cluster ? state.cluster.name + ' · ' + state.cluster.version : '未连接';
    $('topIndex').textContent = state.selectedIndex || '未选择索引';
    $('topDocs').textContent = item ? (item['docs.count'] || '0') + ' docs · ' + (item['store.size'] || '—') : '— docs';
    const health = item ? String(item.health || '') : '';
    const el = $('topHealth');
    el.textContent = health || '—';
    el.className = 'health-pill ' + (health === 'green' ? 'ok' : '');
    $('topIndex').classList.toggle('dim', !state.selectedIndex);
    $('topDocs').classList.toggle('dim', !item);
  }

  async function selectIndex(index) {
    state.selectedIndex = index;
    state.mapping = null;
    state.fields = [];
    els.indexMeta.textContent = '加载 mapping…';
    els.fieldHint.textContent = index;
    try {
      const res = await es('/' + encodeURIComponent(index) + '/_mapping', { method: 'GET' });
      const map = res.data && res.data[index] && res.data[index].mappings;
      state.mapping = map || null;
      state.fields = collectFields(map);
      els.indexMeta.textContent = state.fields.length
        ? state.fields.length + ' 个字段 · ' + state.fields.slice(0, 6).map((f) => f.name + ':' + f.type).join(' · ')
        : 'mapping 为空或不可读';
      els.fieldHint.textContent = index + ' · ' + state.fields.length + ' fields';
      updateTop();
      if (window.ESQuery && window.ESQuery.onIndexChanged) window.ESQuery.onIndexChanged(index);
    } catch (err) {
      els.indexMeta.textContent = 'mapping 读取失败：' + String(err.message || err);
    }
  }

  function collectFields(mapping) {
    const out = [];
    function walk(props, prefix) {
      for (const [name, def] of Object.entries(props || {})) {
        if (!def || typeof def !== 'object') continue;
        const path = prefix ? prefix + '.' + name : name;
        out.push({ name: path, type: def.type || (def.properties ? 'object' : '—') });
        if (def.properties) walk(def.properties, path);
      }
    }
    walk(mapping && mapping.properties, '');
    return out;
  }

  function openView(name) {
    state.view = name;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== 'view-' + name));
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
    if (name === 'history') renderStorageLists();
    if (name === 'monitor' && window.ESMonitor) window.ESMonitor.onOpen();
  }

  function renderStorageLists() {
    renderList('historyList', state.history, 'history');
    renderList('favoriteList', state.favorites, 'favorite');
    $('historyCount').textContent = String(state.history.length);
    $('favoriteCount').textContent = String(state.favorites.length);
    $('historySize').textContent = C.formatBytes(C.storageBytes(state.history) + C.storageBytes(state.favorites));
  }

  function renderList(id, list, kind) {
    const box = $(id);
    box.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.style.height = '160px';
      empty.textContent = kind === 'history' ? '还没有查询历史' : '还没有收藏';
      box.appendChild(empty);
      return;
    }
    for (const item of list) {
      const row = document.createElement('div');
      row.className = 'list-item';
      const head = document.createElement('div');
      head.className = 'li-head';
      const mode = document.createElement('span'); mode.className = 'li-mode'; mode.textContent = item.mode || 'dsl';
      const meta = document.createElement('span'); meta.textContent = (item.index || '-') + ' · ' + (item.took != null ? item.took + ' ms' : '');
      const acts = document.createElement('span'); acts.className = 'li-actions';
      const load = document.createElement('button'); load.className = 'btn ghost xs'; load.textContent = '载入';
      load.onclick = (e) => { e.stopPropagation(); if (window.ESQuery) window.ESQuery.loadEntry(item); openView('query'); };
      const fav = document.createElement('button'); fav.className = 'btn ghost xs'; fav.textContent = kind === 'favorite' ? '删除' : '收藏';
      fav.onclick = (e) => { e.stopPropagation(); toggleFavorite(item, kind === 'favorite'); };
      acts.append(load, fav);
      head.append(mode, meta, acts);
      const q = document.createElement('div'); q.className = 'li-query'; q.textContent = item.query || '';
      row.append(head, q);
      row.onclick = () => { if (window.ESQuery) window.ESQuery.loadEntry(item); openView('query'); };
      box.appendChild(row);
    }
  }

  async function addHistory(entry) {
    state.history = C.pushCapped(state.history, entry, C.HISTORY_CAP);
    await storageSet(KEY.history, state.history);
  }
  async function toggleFavorite(entry, remove) {
    const key = (entry.mode || '') + '|' + (entry.index || '') + '|' + (entry.query || '');
    if (remove) {
      state.favorites = state.favorites.filter((f) => (f.mode || '') + '|' + (f.index || '') + '|' + (f.query || '') !== key);
      toast('已从收藏移除');
    } else {
      const exists = state.favorites.some((f) => (f.mode || '') + '|' + (f.index || '') + '|' + (f.query || '') === key);
      if (!exists) state.favorites = C.pushCapped(state.favorites, Object.assign({ ts: Date.now() }, entry), C.FAVORITE_CAP);
      toast(exists ? '已在收藏中' : '已收藏');
    }
    await storageSet(KEY.favorites, state.favorites);
    renderStorageLists();
  }

  function bind() {
    els.authMode.onchange = () => {
      const mode = els.authMode.value;
      els.basicFields.classList.toggle('hidden', mode !== 'basic');
      els.apiKeyFields.classList.toggle('hidden', mode !== 'apikey');
    };
    els.connectBtn.onclick = connect;
    els.remember.onchange = saveProfile;
    els.indexFilter.oninput = renderIndices;
    $('navSearch').oninput = () => {
      const q = $('navSearch').value.trim().toLowerCase();
      document.querySelectorAll('.nav-item').forEach((b) => {
        b.classList.toggle('hidden', !!q && !b.textContent.toLowerCase().includes(q));
      });
    };
    els.indexSelect.onchange = () => selectIndex(els.indexSelect.value);
    document.querySelectorAll('.nav-item').forEach((b) => { b.onclick = () => openView(b.dataset.view); });
    $('openOptionsBtn').onclick = () => { openView('query'); document.getElementById('connBox').scrollIntoView({ behavior: 'smooth' }); };
    $('toggleConnBtn').onclick = () => {
      const box = $('connBox');
      box.classList.toggle('hidden');
      $('toggleConnBtn').textContent = box.classList.contains('hidden') ? '+' : '−';
    };
    $('clearHistoryBtn').onclick = async () => { state.history = []; await storageSet(KEY.history, state.history); renderStorageLists(); toast('历史已清空'); };
    $('clearFavoritesBtn').onclick = async () => { state.favorites = []; await storageSet(KEY.favorites, state.favorites); renderStorageLists(); toast('收藏已清空'); };
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (window.ESQuery) window.ESQuery.run(); }
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === '1') openView('query');
      if (e.key === '2') openView('monitor');
      if (e.key === '3') openView('history');
      if (e.key === '4') openView('about');
      if (e.key === '5') openView('rest');
    });
    $('dialogClose').onclick = () => $('jsonDialog').close();
  }

  function init() {
    bind();
    els.authMode.onchange();
    setConnection(false, '未连接');
    loadStored().then(() => {
      renderStorageLists();
      if (state.profile.baseUrl) {
        els.connMsg.textContent = '已恢复连接配置，点击「连接并检查」';
      } else {
        $('connBox').classList.remove('hidden');
        $('toggleConnBtn').textContent = '−';
      }
      updateTop();
    });
    if (window.ESQuery) window.ESQuery.init();
    if (window.ESMonitor) window.ESMonitor.init();
    if (window.ESRest) window.ESRest.init();
  }

  window.ESApp = { state, els, es, toast, openView, addHistory, toggleFavorite, renderStorageLists, selectIndex, get cluster() { return state.cluster; } };
  document.addEventListener('DOMContentLoaded', init);
})();
