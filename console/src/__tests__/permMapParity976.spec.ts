/**
 * 976 前后端权限映射对拍：共享写/读端点表与只读 POST 清单必须逐项一致。
 * 这两张表是前后端门禁的共同真源；任何一侧新增/改名而另一侧漏改，都会制造
 * 「前端可见后端 403」或「后端放行前端不显示」的漂移。源码级对拍把漂移拦在测试期。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const java = readFileSync(join(root, 'src/main/java/io/github/dengmeiluan/es/rebuild/auth/ConsoleAuthInterceptor.java'), 'utf-8');
const ts = readFileSync(join(__dirname, '../stores/auth.ts'), 'utf-8');

function javaMap(startMarker: string, endMarker: string): Record<string, string[]> {
  const start = java.indexOf(startMarker);
  const end = java.indexOf(endMarker, start + 1);
  expect(start, 'Java 映射起点存在').toBeGreaterThanOrEqual(0);
  expect(end, 'Java 映射终点存在').toBeGreaterThan(start);
  const block = java.slice(start, end);
  const out: Record<string, string[]> = {};
  const re = /m\.put\("([^"]+)",\s*(?:Arrays\.asList|java\.util\.Collections\.singletonList)\(([\s\S]*?)\)\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]);
  }
  return out;
}

function tsMap(name: string): Record<string, string[]> {
  const start = ts.indexOf(`const ${name}: Record<string, string[]> = {`);
  const end = ts.indexOf('};', start);
  expect(start, `${name} 存在`).toBeGreaterThanOrEqual(0);
  const block = ts.slice(start, end);
  const out: Record<string, string[]> = {};
  const re = /'([^']+)':\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
  }
  return out;
}

function normalize(map: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(map).sort()) out[k] = [...map[k]].sort();
  return out;
}

describe('976 前后端权限表对拍', () => {
  it('共享写端点表一致', () => {
    const backend = normalize(javaMap(
      'private static final java.util.Map<String, List<String>> SHARED_WRITE_PAGES;',
      '共享读端点 → 允许读取的页面写/读键'));
    const frontend = normalize(tsMap('SHARED_WRITE_PAGE_KEYS'));
    expect(frontend).toEqual(backend);
  });

  it('共享读端点表一致', () => {
    const backend = normalize(javaMap(
      'private static final java.util.Map<String, List<String>> SHARED_READ_PAGES;',
      '/** 最长片段匹配的共享读页面集合'));
    const frontend = normalize(tsMap('SHARED_READ_PAGE_KEYS'));
    expect(frontend).toEqual(backend);
  });

  it('只读 POST 关键字清单一致', () => {
    const jStart = java.indexOf('READONLY_POST_KEYWORDS = Arrays.asList(');
    const jEnd = java.indexOf(');', jStart);
    const javaKeys = [...java.slice(jStart, jEnd).matchAll(/"([^"]+)"/g)].map(x => x[1]).sort();
    const fStart = ts.indexOf('const READONLY_POST_KEYWORDS = [');
    const fEnd = ts.indexOf('];', fStart);
    const tsKeys = [...ts.slice(fStart, fEnd).matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
    expect(tsKeys).toEqual(javaKeys);
  });
});
