import { displayServer, loadSettings, originPattern } from './shared/config.js';

const status = document.getElementById('status');
const serverHost = document.getElementById('serverHost');
const serverHint = document.getElementById('serverHint');
const openConsole = document.getElementById('openConsole');
const openPanel = document.getElementById('openPanel');
const openOptions = document.getElementById('openOptions');

async function hasSiteAccess(baseUrl) {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(baseUrl)] });
  } catch {
    return false;
  }
}

async function render() {
  const settings = await loadSettings();
  const configured = Boolean(settings.baseUrl);
  serverHost.textContent = configured ? displayServer(settings.baseUrl) : 'Not configured';
  openConsole.textContent = configured ? 'Open console' : 'Configure SearchDeck';

  if (!configured) {
    status.className = 'chip limited';
    status.textContent = 'Setup';
    serverHint.textContent = 'Connect a SearchDeck server to open the console in a tab or side panel.';
    openPanel.disabled = true;
    return;
  }

  const granted = await hasSiteAccess(settings.baseUrl);
  status.className = granted ? 'chip ready' : 'chip limited';
  status.textContent = granted ? 'Ready' : 'Limited';
  serverHint.textContent = granted
    ? settings.baseUrl
    : 'Site access is not granted. Opening the console still works; grant access in Settings for connection checks.';
  openPanel.disabled = false;
}

openConsole.addEventListener('click', async () => {
  const settings = await loadSettings();
  if (!settings.baseUrl) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  const result = await chrome.runtime.sendMessage({ type: 'open-console' });
  if (result?.ok) {
    window.close();
  } else {
    serverHint.textContent = result?.error || 'Could not open the console.';
  }
});

openPanel.addEventListener('click', async () => {
  try {
    const current = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: current.id });
    window.close();
  } catch (error) {
    serverHint.textContent = `Side panel unavailable: ${error.message}`;
  }
});

openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

render();
