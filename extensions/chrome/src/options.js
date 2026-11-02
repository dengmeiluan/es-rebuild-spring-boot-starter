import {
  DEFAULT_ENTRY_PATH,
  buildEntryUrl,
  displayServer,
  isLocalHost,
  loadSettings,
  normalizeBaseUrl,
  normalizeEntryPath,
  originPattern,
  saveSettings,
} from './shared/config.js';

const baseInput = document.getElementById('baseUrl');
const entryInput = document.getElementById('entryPath');
const schemePrefix = document.querySelector('.input-wrap .prefix');
const preview = document.getElementById('preview');
const status = document.getElementById('status');
const permissionChip = document.getElementById('permissionChip');
const saveButton = document.getElementById('save');
const testButton = document.getElementById('test');
const clearButton = document.getElementById('clear');

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
    const host = value.startsWith('[')
      ? value.slice(0, value.indexOf(']') + 1)
      : value.split('/')[0].split(':')[0];
    schemePrefix.textContent = isLocalHost(host) ? 'http://' : 'https://';
  }
}

function updatePreview() {
  try {
    const base = normalizeBaseUrl(baseInput.value);
    const entry = normalizeEntryPath(entryInput.value || DEFAULT_ENTRY_PATH);
    preview.textContent = buildEntryUrl(base, entry);
    preview.classList.remove('error');
  } catch {
    preview.textContent = '—';
    preview.classList.remove('error');
  }
}

async function permissionGranted(baseUrl) {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(baseUrl)] });
  } catch {
    return false;
  }
}

async function refresh() {
  const settings = await loadSettings();
  baseInput.value = settings.baseUrl || '';
  entryInput.value = settings.entryPath || DEFAULT_ENTRY_PATH;
  updateSchemePrefix();
  updatePreview();

  if (!settings.baseUrl) {
    permissionChip.className = 'chip limited';
    permissionChip.textContent = 'Setup';
  } else if (await permissionGranted(settings.baseUrl)) {
    permissionChip.className = 'chip ready';
    permissionChip.textContent = 'Access granted';
  } else {
    permissionChip.className = 'chip limited';
    permissionChip.textContent = 'Access not granted';
  }
}

function readForm() {
  const baseUrl = normalizeBaseUrl(baseInput.value);
  const entryPath = normalizeEntryPath(entryInput.value || DEFAULT_ENTRY_PATH);
  return { baseUrl, entryPath, label: 'SearchDeck' };
}

saveButton.addEventListener('click', async () => {
  let next;
  try {
    next = readForm();
  } catch (error) {
    setStatus(error.message, 'bad');
    return;
  }

  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [originPattern(next.baseUrl)] });
  } catch {
    granted = false;
  }

  try {
    await saveSettings(next);
    baseInput.value = next.baseUrl;
    updateSchemePrefix();
    updatePreview();
    permissionChip.className = granted ? 'chip ready' : 'chip limited';
    permissionChip.textContent = granted ? 'Access granted' : 'Access not granted';
    setStatus(
      granted
        ? `Saved ${displayServer(next.baseUrl)}. You can open the console now.`
        : 'Saved. Chrome did not grant site access; opening the console in a tab still works, but connection checks are disabled.',
      granted ? 'ok' : 'warn',
    );
  } catch (error) {
    setStatus(`Could not save: ${error.message}`, 'bad');
  }
});

testButton.addEventListener('click', async () => {
  let next;
  try {
    next = readForm();
  } catch (error) {
    setStatus(error.message, 'bad');
    return;
  }

  let granted = await permissionGranted(next.baseUrl);
  if (!granted) {
    try {
      granted = await chrome.permissions.request({ origins: [originPattern(next.baseUrl)] });
    } catch {
      granted = false;
    }
  }
  if (!granted) {
    setStatus('Grant site access to test the connection.', 'bad');
    return;
  }

  const target = buildEntryUrl(next.baseUrl, next.entryPath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  setStatus(`Checking ${target} …`);
  try {
    const response = await fetch(target, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (response.ok) {
      setStatus(`Reachable · HTTP ${response.status}. Open the console to sign in.`, 'ok');
    } else if (response.status === 401 || response.status === 403) {
      setStatus(`Reachable · HTTP ${response.status} (sign-in required).`, 'warn');
    } else {
      setStatus(`Unexpected HTTP ${response.status}. Check that this is a SearchDeck server.`, 'warn');
    }
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timed out after 8s' : error.message;
    setStatus(`Cannot reach ${target} — ${reason}. Check the URL, network, and mixed-content rules.`, 'bad');
  } finally {
    clearTimeout(timer);
  }
});

clearButton.addEventListener('click', async () => {
  baseInput.value = '';
  entryInput.value = DEFAULT_ENTRY_PATH;
  updateSchemePrefix();
  updatePreview();
  try {
    await saveSettings({ baseUrl: '', entryPath: DEFAULT_ENTRY_PATH, label: 'SearchDeck' });
  } catch {
    // Clearing the form is still useful even if storage rejects an empty URL.
    await chrome.storage.sync.set({ baseUrl: '', entryPath: DEFAULT_ENTRY_PATH, label: 'SearchDeck' });
  }
  permissionChip.className = 'chip limited';
  permissionChip.textContent = 'Setup';
  setStatus('Configuration cleared.', '');
});

baseInput.addEventListener('input', () => {
  updateSchemePrefix();
  updatePreview();
});
entryInput.addEventListener('input', updatePreview);

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') {
      refresh();
    }
  });
}

refresh();
