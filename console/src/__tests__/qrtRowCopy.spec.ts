/**
 * R130 一百六十八批：RT/QRT 行 hover 悬浮快捷钮（dbx 悬浮行内钮——复制行 JSON，移出行消失）。
 * 锁定：
 * 1) RT：操作列 hover-only 复制钮存在且 aria 可达，点击复制行 JSON（列=visibleCols，
 *    与键盘 Ctrl+C 135 批同一 copyRowJson 口径）；
 * 2) QRT：行尾格悬浮钮同语义（列=shownCols）；排序重排后点第 1 行钮复制的是新第 1 行
 *    （ri 取行正确性——组装走 copyRowJson(ri) 数据坐标，不依赖 DOM）；
 * 3) 源码锁：RT absolute+opacity/pointer-events（515 续：display 插入曾把删除钮挤右移一位，用户实报「删除钮悬浮变复制」）；QRT opacity/pointer-events 切换。
 *    hover 视觉本身 happy-dom 无法验证，源码锁兜底防退化。
 * 挂载样板照抄 rowNavActions（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

async function spyCopy() {
  const mod = await import('../utils/format');
  return vi.spyOn(mod, 'copyText').mockResolvedValue(true);
}

describe('RT hover 行内复制钮（一百六十八批）', () => {
  it('操作列钮存在+aria 含行号；点击复制 visibleCols 行 JSON', async () => {
    const spy = await spyCopy();
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1' });
    const btn = host.querySelector('tbody tr .rt-row-copy') as HTMLButtonElement;
    expect(btn, '操作列应有 hover 复制钮').not.toBeNull();
    expect(btn.getAttribute('aria-label')).toContain('第 1 行');
    btn.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(spy).toHaveBeenCalledTimes(1);
    const obj = JSON.parse(spy.mock.calls[0][0] as string);
    expect(obj).toEqual({ _id: 'a', name: 'banana', age: 2 });
    spy.mockRestore();
  });

  it('源码锁：不参与文档流（absolute）+ opacity/pointer-events 显隐——hover 插入 display 位移删除钮是事故形态（用户实报「删除钮悬浮变复制」），锁死防退化', () => {
    const css = readCss('../components/ResultTable.vue');
    expect(css).toMatch(/\.rt-row-copy \{[^}]*position: absolute;[^}]*\}/);
    expect(css).toMatch(/\.rt-row-copy \{[^}]*opacity: 0; pointer-events: none;[^}]*\}/);
    expect(css).toMatch(/\.rt-tbl tbody tr:hover \.rt-row-copy \{ opacity: 1; pointer-events: auto; \}/);
    expect(css).not.toMatch(/\.rt-row-copy \{[^}]*display:\s*(none|inline-flex)/);
  });
});

describe('QRT hover 行内复制钮（一百六十八批）', () => {
  it('行尾格钮存在；点击复制 shownCols 行 JSON（含 _id）', async () => {
    const spy = await spyCopy();
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'rc1' });
    const btn = host.querySelector('tbody tr .qrt-row-copy') as HTMLButtonElement;
    expect(btn, '行尾格应有悬浮复制钮').not.toBeNull();
    /* 钮挂在最后一个数据格内 */
    expect(btn.closest('td')).toBe(host.querySelector('tbody tr td:last-child'));
    btn.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(spy).toHaveBeenCalledTimes(1);
    const obj = JSON.parse(spy.mock.calls[0][0] as string);
    expect(obj).toEqual({ _id: 'a', name: 'banana', age: 2 });
    spy.mockRestore();
  });

  it('排序重排后点第 1 行钮复制的是新第 1 行（ri 数据坐标取行）', async () => {
    const spy = await spyCopy();
    /* 三行使升序第一行（apple）≠ 原始第一行（banana），才有检验力 */
    await mountTbl(QueryResultTable, {
      hits: [
        { _id: 'a', _source: { name: 'banana', age: 2 } },
        { _id: 'b', _source: { name: 'apple', age: 3 } },
        { _id: 'c', _source: { name: 'cherry', age: 1 } },
      ] as any,
      sortable: true, storageKey: 'rc2',
    });
    const nameTh = [...host.querySelectorAll('th')].find(t => t.textContent?.includes('name'))!;
    nameTh.click(); // 227 批 M2 起首击升序：apple 在前
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    (host.querySelector('tbody tr .qrt-row-copy') as HTMLButtonElement).click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    const obj = JSON.parse(spy.mock.calls[0][0] as string);
    expect(obj).toEqual({ _id: 'b', name: 'apple', age: 3 });
    spy.mockRestore();
  });

  it('源码锁：opacity/pointer-events 切换 + 右缘悬浮定位', () => {
    const css = readCss('../components/QueryResultTable.vue');
    expect(css).toMatch(/opacity: 0; pointer-events: none; transition: opacity \.12s;/);
    expect(css).toMatch(/\.qrt-tbl tbody tr:hover \.qrt-row-copy \{ opacity: 1; pointer-events: auto; \}/);
    expect(css).toMatch(/position: absolute; right: 3px; top: 50%; transform: translateY\(-50%\);/);
  });
});

function readCss(rel: string): string {
  return (readFileSync(join(__dirname, rel), 'utf-8').split('<style scoped>')[1] ?? '');
}
