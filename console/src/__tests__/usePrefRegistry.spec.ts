import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

/**
 * 第四十五批守卫：全站 usePref 偏好注册表。
 * 「用户工作偏好一律 usePref（es-console.pref.* 键空间）」的口径资产化——
 * 已知消费点清单在这里锁定：删键/改键必须显式演进本 spec；新增偏好未走
 * usePref（手写 localStorage）在回潮扫描里会暴露（既有手写键名单独断言）。
 */
const files = globSync(join(__dirname, '..', 'views', '*.vue'))
  .concat(globSync(join(__dirname, '..', 'components', '*.vue')))
  .concat(globSync(join(__dirname, '..', 'stores', '*.ts')));
const all = files
  .map((f) => readFileSync(f, 'utf-8'))
  .join('\n/*---*/\n');

const KNOWN_PREF_KEYS = [
  'sql.lenient',
  'tasks.autoRefresh',
  'shards.autoRefresh',
  'live.intervalMs',
  'live.running',
  'query.profile',
  'query.autoHist',
  'query.expMode',
  'query.expField',
  'painless.context',
];

test('已知偏好键全部经 usePref 接线（键名逐个在源码中可见）', () => {
  for (const key of KNOWN_PREF_KEYS) {
    expect(all).toContain(`'${key}'`);
  }
});

test('usePref 消费点不少于已知键数（防止清单腐化落后于实现）', () => {
  const used = new Set(
    [...all.matchAll(/usePref(?:<[^>]+>)?\(\s*'([^']+)'/g)].map((m) => m[1]),
  );
  for (const key of KNOWN_PREF_KEYS) {
    expect(used.has(key)).toBe(true);
  }
  expect(used.size).toBeGreaterThanOrEqual(KNOWN_PREF_KEYS.length);
});
