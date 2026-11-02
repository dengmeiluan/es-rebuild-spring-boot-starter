import {
  buildEntryUrl,
  displayServer,
  loadSettings,
  originPattern,
} from './shared/config.js';

const panelHost = document.getElementById('panelHost');
const accessBanner = document.getElementById('accessBanner');
const empty = document.getElementById('empty');
const frame = document.getElementById('frame');
const reload = document.getElementById('reload');
const openTab = document.getElementById('openTab');
const settingsButton = document.getElementById('settings');
const configure = document.getElementById('configure');
const grant = document.getElementById('grant');

let currentSettings = null;
let currentUrl = '';

async function hasSiteAccess(baseUrl) {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(baseUrl)] });
  } catch {
    return false;
  }
}

function showEmpty() {
  empty.hidden = false;
  frame.hidden = true;
  frame.removeAttribute('src');
  accessBanner.hidden = true;
  panelHost.textContent = 'Not configured';
}

async function render() {
  const settings = await loadSettings();
  currentSettings = settings;

  if (!settings.baseUrl) {
    showEmpty();
    return;
  }

  const url = buildEntryUrl(settings.baseUrl, settings.entryPath);
  panelHost.textContent = displayServer(settings.baseUrl);
  empty.hidden = true;
  frame.hidden = false;

  if (url !== currentUrl) {
    frame.src = url;
    currentUrl = url;
  }

  accessBanner.hidden = await hasSiteAccess(settings.baseUrl);
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

reload.addEventListener('click', () => {
  if (!currentSettings?.baseUrl) {
    return;
  }
  const base = buildEntryUrl(currentSettings.baseUrl, currentSettings.entryPath);
  frame.src = `${base}${base.includes('?') ? '&' : '?'}_refresh=${Date.now()}`;
});

openTab.addEventListener('click', () => {
  if (!currentSettings?.baseUrl) {
    openSettings();
    return;
  }
  chrome.tabs.create({ url: buildEntryUrl(currentSettings.baseUrl, currentSettings.entryPath) });
});

settingsButton.addEventListener('click', openSettings);
configure.addEventListener('click', openSettings);

grant.addEventListener('click', async () => {
  if (!currentSettings?.baseUrl) {
    return;
  }
  try {
    const granted = await chrome.permissions.request({ origins: [originPattern(currentSettings.baseUrl)] });
    accessBanner.hidden = granted;
  } catch {
    openSettings();
  }
});

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') {
      render();
    }
  });
}

render();
