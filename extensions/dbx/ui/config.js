export const DEFAULT_ENTRY_PATH = '/searchdeck.html';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(String(hostname || '').toLowerCase());
}

// Keep in sync with extensions/chrome/src/shared/config.js; the parity test
// runs both modules against the same cases.
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
    return new URL(normalizeBaseUrl(baseUrl)).host;
  } catch {
    return baseUrl;
  }
}
