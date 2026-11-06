#!/usr/bin/env node
/* Smoke test for mcp/esquerystudio-local-mcp.mjs against a mock Elasticsearch.
 * Proves: stdio MCP handshake, multi-connection discovery, read tools, write
 * opt-in, and real HTTP calls without Spring Boot or a browser. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function mockEs() {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (value) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
      if (req.url.startsWith('/_cluster/health')) return send({ status: 'green', number_of_nodes: 1 });
      if (req.url === '/' || req.url === '') return send({ version: { number: '8.13.0' } });
      if (req.url.startsWith('/_cat/indices')) return send([{ index: 'research' }, { index: '.system' }]);
      if (req.url.startsWith('/research/_mapping')) return send({ research: { mappings: { properties: { title: { type: 'text' } } } } });
      if (req.url.startsWith('/research/_search')) return send({ hits: { hits: [] } });
      if (req.url.startsWith('/_sql')) return send({ columns: [], rows: [] });
      if (req.url.startsWith('/research/_doc/1')) return send({ result: 'updated', _id: '1' });
      res.statusCode = 404;
      send({ error: { type: 'not_found', reason: req.url } });
    });
  });
}

function runLocal(configPath, extra = []) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [
      join(ROOT, 'mcp/esquerystudio-local-mcp.mjs'), '--config', configPath, ...extra,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', reject);
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'es_list_connections', arguments: {} } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'es_list_indices', arguments: {} } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'es_cluster_health', arguments: {} } },
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'es_rest', arguments: { method: 'POST', path: '/research/_search', body: {} } } },
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'es_rest', arguments: { method: 'POST', path: '/_bulk', body: {} } } },
    ];
    if (extra.includes('--allow-write')) {
      requests.push({
        jsonrpc: '2.0', id: 6, method: 'tools/call',
        params: { name: 'es_index_doc', arguments: { index: 'research', id: '1', document: { title: 'x' } } },
      });
    }
    child.stdin.write(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
    setTimeout(() => { child.kill(); resolveRun(out); }, 1200);
  });
}

function responses(text) {
  return text.split('\n').filter((line) => line.trim().startsWith('{')).map((line) => JSON.parse(line));
}
function toolResult(responsesList, id) {
  const hit = responsesList.find((r) => r.id === id);
  assert.ok(hit?.result?.content?.[0]?.text, `response ${id} must be a tool result`);
  return JSON.parse(hit.result.content[0].text);
}

const server = mockEs();
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
const dir = mkdtempSync(join(tmpdir(), 'esq-local-mcp-'));
const configPath = join(dir, 'mcp.json');
writeFileSync(configPath, JSON.stringify({
  defaultConnection: 'prod',
  connections: [
    { id: 'prod', name: 'Production', url: `http://127.0.0.1:${port}`, username: 'elastic', password: 'secret' },
    { id: 'qa', name: 'QA', url: `http://127.0.0.1:${port}`, apiKey: 'id:key' },
  ],
}), 'utf8');

try {
  const readOnly = responses(await runLocal(configPath));
  const init = readOnly.find((r) => r.id === 1)?.result;
  assert.equal(init.protocolVersion, '2025-06-18');
  assert.equal(init.serverInfo.mode, 'local');
  assert.equal(init.serverInfo.writes, false);

  const readTools = readOnly.find((r) => r.id === 2).result.tools.map((t) => t.name);
  assert.ok(readTools.includes('es_list_connections'));
  assert.ok(!readTools.includes('es_index_doc'), 'write tools must be hidden without --allow-write');
  assert.deepEqual(toolResult(readOnly, 3).map((c) => c.id), ['prod', 'qa']);
  assert.deepEqual(toolResult(readOnly, 4).map((i) => i.index), ['research']);
  assert.equal(toolResult(readOnly, 5).status, 'green');
  assert.equal(toolResult(readOnly, 5).version, '8.13.0');
  const rawRead = readOnly.find((r) => r.id === 7)?.result;
  assert.equal(rawRead?.isError, false, 'POST _search is a read query and must pass without --allow-write');
  const rawWrite = readOnly.find((r) => r.id === 8)?.result;
  assert.equal(rawWrite?.isError, true, 'POST _bulk must stay blocked without --allow-write');

  const writable = responses(await runLocal(configPath, ['--allow-write']));
  const writeTools = writable.find((r) => r.id === 2).result.tools.map((t) => t.name);
  for (const name of ['es_index_doc', 'es_update_doc', 'es_delete_doc']) assert.ok(writeTools.includes(name));
  assert.equal(toolResult(writable, 6).result, 'updated');

  console.log('[local-mcp] OK — stdio handshake, 2 connections, read tools, write opt-in, direct ES HTTP');
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
