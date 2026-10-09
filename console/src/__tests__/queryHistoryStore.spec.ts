/**
 * R130 第六十一批：跨模式历史 store 单条删除守卫 + 回放联动口径。
 * 背景：此前只有 clear() 全清，错条/敏感条只能连坐清除；QueryHub 历史抽屉
 * del 动作（QueryHistoryPanel actions）接线 hist.removeOne(row.id)。
 * 锁定：
 * 1) removeOne 按 id 精确单删，其余条目不动，且持久化到 localStorage；
 * 2) 未知 id / undefined 入参静默无变化（容错不抛）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } };
});

import { useQueryHistoryStore } from '../stores/queryHistory';

const KEY = 'es_query_hist_v2';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('queryHistory store removeOne（六十一批）', () => {
  it('按 id 精确单删，其余条目不动，并同步持久化', () => {
    const s = useQueryHistoryStore();
    s.push('dsl', 'A', 'idx-a');
    s.push('sql', 'B');
    s.push('lucene', 'C', 'idx-c');
    const target = s.items[1]; // B
    expect(target.query).toBe('B');
    s.removeOne(target.id);
    expect(s.items.length).toBe(2);
    expect(s.items.some(it => it.query === 'B')).toBe(false);
    expect(s.items.map(it => it.query)).toEqual(['C', 'A']);
    expect(JSON.parse(localStorage.getItem(KEY) || '[]').length).toBe(2);
  });

  it('未知 id 与 undefined 入参静默无变化', () => {
    const s = useQueryHistoryStore();
    s.push('dsl', 'A');
    s.removeOne('no-such-id');
    s.removeOne(undefined);
    expect(s.items.length).toBe(1);
    expect(JSON.parse(localStorage.getItem(KEY) || '[]').length).toBe(1);
  });
});
