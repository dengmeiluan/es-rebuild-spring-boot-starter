#!/usr/bin/env node
/*
 * MCP 工具契约对齐门：服务端 McpController、纯前端 browserMcp.ts、docs/mcp.md
 * 必须暴露同一组工具名与描述。任何一侧新增/改名/漏文档都会在此处失败。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const java = read('modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/mcp/McpController.java');
const ts = read('ui/src/platform/browserMcp.ts');
const docs = read('docs/mcp.md');

function dedupe(list, label) {
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.name)) throw new Error(`${label} 工具重复：${item.name}`);
    seen.add(item.name);
  }
  return list;
}

const javaTools = dedupe([...java.matchAll(/\btool\("([a-z0-9_]+)"\s*,\s*"([^"]*)"/g)]
  .map((m) => ({ name: m[1], description: m[2] })), 'McpController');

const tsBlockStart = ts.indexOf('export const MCP_TOOLS');
const tsBlockEnd = ts.indexOf('];', tsBlockStart);
if (tsBlockStart < 0 || tsBlockEnd < 0) throw new Error('browserMcp.ts 未找到 MCP_TOOLS 数组');
const tsTools = dedupe([...ts.slice(tsBlockStart, tsBlockEnd)
  .matchAll(/name:\s*'([a-z0-9_]+)'\s*,\s*description:\s*'([^']*)'/g)]
  .map((m) => ({ name: m[1], description: m[2] })), 'browserMcp');

const docsTools = dedupe([...docs.matchAll(/^\|\s*`(es_[a-z0-9_]+)`\s*\|/gm)]
  .map((m) => ({ name: m[1] })), 'docs/mcp.md');

function assertSame(reference, actual, label) {
  const refNames = reference.map((t) => t.name);
  const actualNames = actual.map((t) => t.name);
  if (JSON.stringify(refNames) !== JSON.stringify(actualNames)) {
    throw new Error(`${label} 工具集不一致：\n  基准 ${refNames.join(', ')}\n  实际 ${actualNames.join(', ')}`);
  }
  for (let i = 0; i < reference.length; i++) {
    if (reference[i].description && actual[i].description && actual[i].description !== reference[i].description) {
      throw new Error(`${label} 工具 ${reference[i].name} 描述不一致：\n  基准 ${reference[i].description}\n  实际 ${actual[i].description}`);
    }
  }
}

assertSame(javaTools, tsTools, '服务端 vs 纯前端');
assertSame(javaTools, docsTools, '服务端 vs 文档');
if (tsTools.length < 6) throw new Error(`MCP 工具数异常（${tsTools.length} < 6），解析可能失效`);
const tsSchemas = (ts.slice(tsBlockStart, tsBlockEnd).match(/inputSchema:/g) || []).length;
if (tsSchemas !== tsTools.length) throw new Error(`browserMcp.ts inputSchema 数量 ${tsSchemas} != 工具数 ${tsTools.length}`);

if (process.argv.includes('--negative-control')) {
  let failed = false;
  try {
    assertSame(javaTools.slice(0, -1), tsTools, '负控');
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('negative control 未触发：删掉一个服务端工具仍被判为对齐');
  console.log(`[mcp-parity] negative control OK — 少一个工具会被判失败`);
}

console.log(`[mcp-parity] OK — ${javaTools.length} tools aligned across server / browser / docs`);
