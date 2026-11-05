#!/usr/bin/env node
/* Guard for the ESQueryStudio MV3 extension: manifest, broker allowlist, local assets,
 * required surfaces and old-name/remote-code absence. Run from the repository root. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const EXT = join(ROOT, 'extensions/chrome');
const read = (p) => readFileSync(join(EXT, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'ui/package.json'), 'utf8'));

assert.equal(manifest.manifest_version, 3, 'MV3 required');
assert.match(manifest.name, /ESQueryStudio/, 'brand in manifest');
assert.match(manifest.name, /Elasticsearch/, 'domain in manifest name');
assert.equal(manifest.version, pkg.version, 'extension and UI share a version');
assert.equal(manifest.background?.service_worker, 'background.js');
assert.ok(manifest.host_permissions?.includes('http://*/*'));
assert.ok(manifest.host_permissions?.includes('https://*/*'));
assert.ok(!manifest.content_scripts, 'no content-script injection');
assert.ok(!manifest.web_accessible_resources, 'no broad web-accessible resources');
for (const size of [16, 48, 128]) assert.ok(existsSync(join(EXT, `icons/icon${size}.png`)), `icon${size}`);

const background = read('background.js');
for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']) {
  assert.ok(background.includes(`'${method}'`), `broker allows ${method}`);
}
assert.ok(background.includes('http:') && background.includes('https:'), 'protocol allowlist');
assert.ok(background.includes('MAX_BODY_BYTES'), 'body cap');
assert.ok(background.includes('chrome.contextMenus.create'), 'context menu integration');
assert.ok(background.includes('credentials: \'omit\''), 'no ambient cookies');
assert.ok(!background.includes('eval('), 'no eval in broker');

const html = read('index.html');
assert.ok(!/(src|href)="https?:/i.test(html), 'no remote assets');
for (const id of ['baseUrl', 'connectBtn', 'indexSelect', 'queryInput', 'runBtn',
  'resultArea', 'monitorChart', 'historyList', 'favoriteList']) {
  assert.ok(html.includes(`id="${id}"`), `UI id ${id}`);
}
for (const mode of ['dsl', 'lucene', 'sql', 'pit']) {
  assert.ok(html.includes(`data-mode="${mode}"`), `mode ${mode}`);
}

const app = read('app.js');
const query = read('query.js');
const monitor = read('monitor.js');
assert.ok(app.includes('chrome.permissions.contains'), 'checks granted host permission');
assert.ok(app.includes('esquerystudio.ext.history'), 'history storage key');
assert.ok(query.includes('/_sql?format=json'), 'ES-SQL direct call');
assert.ok(query.includes('_explain'), 'explain direct call');
assert.ok(query.includes('_pit?keep_alive=1m'), 'PIT open');
assert.ok(query.includes('search_after'), 'PIT pagination');
assert.ok(query.includes('toCsv'), 'CSV export');
assert.ok(monitor.includes('/_cluster/health'), 'health sampling');
assert.ok(monitor.includes('/_nodes/stats'), 'node stats sampling');
assert.ok(monitor.includes('state.cap'), 'bounded samples');
assert.ok(monitor.includes('monitorInterval'), 'configurable sampling interval');
assert.ok(query.includes('openPrefill'), 'deep-link prefill');
assert.ok(query.includes('DRAFT_KEY') && query.includes('saveDrafts'), 'per-mode draft persistence');
assert.ok(read('reindex.js').includes('_reindex') && read('reindex.js').includes('_tasks/'), 'guided reindex task flow');
assert.ok(html.includes('consoleFrame') && read('consoleView.js').includes('esquerystudio.ext.consoleUrl'), 'full console host');
assert.ok(monitor.includes('setInterval(sample, state.interval)'), 'live loop uses configured interval');
assert.ok(monitor.includes('state.samples.shift()'), 'ring buffer eviction');

const all = [background, html, app, query, monitor, read('core.js')].join('\n');
for (const old of ['searchdeck', 'sharddesk', 'SearchDeck', 'ShardDesk']) {
  assert.ok(!all.includes(old), `old brand removed: ${old}`);
}
assert.ok(!/google-analytics|gtag\(|sentry|mixpanel/i.test(all), 'no telemetry');
console.log('[extension] OK — MV3, local assets, broker allowlist, 6 query surfaces, bounded monitor');
