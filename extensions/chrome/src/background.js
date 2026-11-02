import { buildEntryUrl, loadSettings } from './shared/config.js';

async function openConsoleTab() {
  const settings = await loadSettings();
  if (!settings.baseUrl) {
    await chrome.runtime.openOptionsPage();
    return { opened: false, reason: 'not-configured' };
  }
  await chrome.tabs.create({ url: buildEntryUrl(settings.baseUrl, settings.entryPath) });
  return { opened: true };
}

async function openSidePanel(windowId) {
  await chrome.sidePanel.open({ windowId });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'open-console') {
    openConsoleTab()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'open-side-panel') {
    chrome.windows.getCurrent()
      .then((window) => openSidePanel(window.id))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-side-panel') {
    return;
  }
  try {
    const window = await chrome.windows.getCurrent();
    await openSidePanel(window.id);
  } catch {
    await chrome.runtime.openOptionsPage();
  }
});
