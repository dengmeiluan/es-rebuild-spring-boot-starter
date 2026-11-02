export const DEFAULT_ENTRY_PATH = '/searchdeck.html';

export const DEFAULT_SETTINGS = Object.freeze({
  baseUrl: '',
  entryPath: DEFAULT_ENTRY_PATH,
  label: 'SearchDeck',
});

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(String(hostname || '').toLowerCase());
}

/**
 * Accepts an origin with an optional context path. Bare hosts default to https,
 * except loopback hosts which default to http. Query strings, fragments,
 * credentials and direct HTML targets are rejected rather than guessed.
 */
export function normalizeBaseUrl(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Console URL must be a string');
  }
  let value = input.trim();
  if (!value) {
    throw new Error('Console URL is required');
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const hostPart = value.startsWith('[')
      ? value.slice(0, value.indexOf(']') + 1)
      : value.split('/')[0].split(':')[0];
    value = (isLocalHost(hostPart) ? 'http://' : 'https://') + value;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid URL, for example https://searchdeck.example.com');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported');
  }
  if (url.username || url.password) {
    throw new Error('Credentials in the URL are not allowed');
  }
  if (url.search || url.hash) {
    throw new Error('Remove query strings and fragments from the console URL');
  }
  if (url.pathname.toLowerCase().endsWith('.html')) {
    throw new Error('Point to the server root or context path, not an HTML file');
  }

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

export function originPattern(baseUrl) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  return `${url.protocol}//${url.host}/*`;
}

export function normalizeEntryPath(input) {
  let path = String(input || '').trim();
  if (!path) {
    path = DEFAULT_ENTRY_PATH;
  }
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  if (path.includes('..') || path.includes('?') || path.includes('#')) {
    throw new Error('Entry path must be a simple absolute path');
  }
  return path;
}

export function buildEntryUrl(baseUrl, entryPath = DEFAULT_ENTRY_PATH) {
  return `${normalizeBaseUrl(baseUrl)}${normalizeEntryPath(entryPath)}`;
}

export function displayServer(baseUrl) {
  if (!baseUrl) {
    return 'Not configured';
  }
  try {
    const url = new URL(normalizeBaseUrl(baseUrl));
    return url.host;
  } catch {
    return baseUrl;
  }
}

export async function loadSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return { ...DEFAULT_SETTINGS };
  }
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings) {
  const next = {
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    entryPath: normalizeEntryPath(settings.entryPath),
    label: String(settings.label || 'SearchDeck').trim() || 'SearchDeck',
  };
  await chrome.storage.sync.set(next);
  return next;
}
