import {
  DEFAULT_ENTRY_PATH,
  buildEntryUrl,
  displayServer,
  isLocalHost,
  normalizeBaseUrl,
  normalizeEntryPath,
} from './config.js';

const host = window.dbxPlugin;
const hostChip = document.getElementById('hostChip');
const baseInput = document.getElementById('baseUrl');
const entryInput = document.getElementById('entryPath');
const schemePrefix = document.getElementById('schemePrefix');
const preview = document.getElementById('preview');
const status = document.getElementById('status');
const saveButton = document.getElementById('save');
const copyButton = document.getElementById('copy');
const openButton = document.getElementById('open');
const clearButton = document.getElementById('clear');

const STORAGE_KEY = 'searchdeck.dbx';

function setStatus(text, kind = '') {
  status.textContent = text;
  status.className = `status ${kind}`.trim();
}

function hasScheme(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim());
}

function updateSchemePrefix() {
  const value = baseInput.value.trim();
  const show = value && !hasScheme(value);
  schemePrefix.hidden = !show;
  if (show) {
    const hostPart = value.startsWith('[')
      ? value.slice(0, value.indexOf(']') + 1)
      : value.split('/')[0].split(':')[0];
    schemePrefix.textContent = isLocalHost(hostPart) ? 'http://' : 'https://';
  }
}

function readForm() {
  const baseUrl = normalizeBaseUrl(baseInput.value);
  const entryPath = normalizeEntryPath(entryInput.value || DEFAULT_ENTRY_PATH);
  return { baseUrl, entryPath };
}

function updatePreview() {
  try {
    const next = readForm();
    preview.textContent = buildEntryUrl(next.baseUrl, next.entryPath);
  } catch {
    preview.textContent = '—';
  }
}

async function readStored() {
  if (host?.storage) {
    return (await host.storage.get('config')) || {};
  }
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

async function writeStored(value) {
  if (host?.storage) {
    await host.storage.set('config', value);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  }
}

async function initHost() {
  if (!host) {
    hostChip.textContent = 'Standalone preview';
    return;
  }
  hostChip.textContent = 'DBX host';
  hostChip.classList.add('ready');
  try {
    const appearance = host.theme?.appearance || host.theme?.mode;
    if (appearance === 'light' || appearance === 'dark') {
      document.documentElement.dataset.dbxTheme = appearance;
    }
  } catch {
    // Theme is cosmetic; a missing theme API must not block the launcher.
  }
  try {
    await Promise.race([
      host.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('host timeout')), 1500)),
    ]);
  } catch {
    // Standalone development host may not complete the handshake; storage
    // falls back only when the bridge is absent, so keep the UI usable.
  }
}

async function refresh() {
  const saved = await readStored();
  baseInput.value = saved.baseUrl || '';
  entryInput.value = saved.entryPath || DEFAULT_ENTRY_PATH;
  updateSchemePrefix();
  updatePreview();
}

saveButton.addEventListener('click', async () => {
  let next;
  try {
    next = readForm();
  } catch (error) {
    setStatus(error.message, 'bad');
    return;
  }
  try {
    await writeStored(next);
    baseInput.value = next.baseUrl;
    updateSchemePrefix();
    updatePreview();
    setStatus(`Saved ${displayServer(next.baseUrl)}.`, 'ok');
  } catch (error) {
    setStatus(`Could not save: ${error.message}`, 'bad');
  }
});

copyButton.addEventListener('click', async () => {
  try {
    const next = readForm();
    const url = buildEntryUrl(next.baseUrl, next.entryPath);
    const copied = await copyText(url);
    setStatus(copied ? 'Console URL copied.' : 'Copy failed. Select the URL manually.', copied ? 'ok' : 'bad');
  } catch (error) {
    setStatus(error.message, 'bad');
  }
});

openButton.addEventListener('click', () => {
  let url;
  try {
    const next = readForm();
    url = buildEntryUrl(next.baseUrl, next.entryPath);
  } catch (error) {
    setStatus(error.message, 'bad');
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    setStatus('DBX blocked the new window. Use “Copy console URL” and open it in your browser.', 'warn');
    return;
  }
  setStatus('Console opened in your browser.', 'ok');
});

clearButton.addEventListener('click', async () => {
  baseInput.value = '';
  entryInput.value = DEFAULT_ENTRY_PATH;
  updateSchemePrefix();
  updatePreview();
  try {
    await writeStored({ baseUrl: '', entryPath: DEFAULT_ENTRY_PATH });
    setStatus('Configuration cleared.', '');
  } catch (error) {
    setStatus(`Could not clear: ${error.message}`, 'bad');
  }
});

baseInput.addEventListener('input', () => {
  updateSchemePrefix();
  updatePreview();
});
entryInput.addEventListener('input', updatePreview);

initHost()
  .then(refresh)
  .catch((error) => setStatus(`Initialization failed: ${error.message}`, 'bad'));
