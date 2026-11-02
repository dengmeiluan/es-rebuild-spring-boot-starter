import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as dbxConfig from '../ui/config.js';
import * as chromeConfig from '../../chrome/src/shared/config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('manifest is DBX v1 with a frontend-only workbench', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.match(manifest.id, /^[a-z0-9][a-z0-9._-]*$/);
  assert.equal(manifest.engines.host_api, '1');
  assert.deepEqual(manifest.permissions, ['host.storage']);
  assert.equal(manifest.entrypoints.backend, undefined);
  assert.equal(manifest.entrypoints.ui.root, 'ui');
  assert.ok(manifest.entrypoints.ui.entry.startsWith('ui/'));
  const workbench = manifest.contributions.find((item) => item.type === 'workbench');
  assert.ok(workbench, 'a workbench contribution is required');
  assert.equal(workbench.id, 'io.github.dengmeiluan.searchdeck.main');
});

test('manifest version matches the repository version', () => {
  const pom = readFileSync(join(repoRoot, 'pom.xml'), 'utf8');
  const start = pom.indexOf('<artifactId>searchdeck</artifactId>');
  const version = /<version>([^<]+)<\/version>/.exec(pom.slice(start))[1];
  assert.equal(manifest.version, version);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, version);
});

test('every manifest-referenced file exists and stays inside the package', () => {
  for (const file of [manifest.icon, manifest.entrypoints.ui.entry]) {
    assert.ok(existsSync(join(root, file)), `missing ${file}`);
    assert.doesNotMatch(file, /(^\/|\\|(^|\/)\.\.(\/|$))/);
  }
});

test('UI uses local scripts and styles only', () => {
  const html = read('ui/index.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'inline script found');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handler found');
  for (const match of html.matchAll(/<(script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gi)) {
    const target = match[2];
    if (target.startsWith('#')) continue;
    assert.ok(!/^https?:/i.test(target), `remote code reference: ${target}`);
    assert.ok(existsSync(join(root, 'ui', target)), `missing ui/${target}`);
  }
});

test('JavaScript stays inside the sandbox contract', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  for (const file of walk(join(root, 'ui')).filter((path) => path.endsWith('.js'))) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\beval\s*\(/);
    assert.doesNotMatch(source, /\bnew Function\s*\(/);
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.doesNotMatch(source, /document\.cookie/);
    assert.doesNotMatch(source, /chrome\./);
  }
  const app = read('ui/app.js');
  assert.match(app, /window\.dbxPlugin/);
  assert.match(app, /host\??\.storage/);
});

test('URL handling matches the Chrome extension', () => {
  const cases = [
    'searchdeck.example.com',
    'localhost:5611',
    '127.0.0.1:5611',
    '[::1]:5611',
    'https://searchdeck.example.com/',
    'https://searchdeck.example.com/ops/',
    'http://searchdeck.example.com:8080',
  ];
  for (const value of cases) {
    assert.equal(dbxConfig.normalizeBaseUrl(value), chromeConfig.normalizeBaseUrl(value), value);
  }
  assert.equal(
    dbxConfig.buildEntryUrl('https://host.example.com/ops/', '/searchdeck.html'),
    chromeConfig.buildEntryUrl('https://host.example.com/ops/', '/searchdeck.html'),
  );
  for (const value of ['', 'ftp://host', 'https://u:p@host', 'https://host/?x=1', 'https://host/a.html']) {
    assert.throws(() => dbxConfig.normalizeBaseUrl(value), value);
  }
});
