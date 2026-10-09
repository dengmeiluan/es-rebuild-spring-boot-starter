/**
 * W7·P0：QRT 行内展开详情（RT 镜像）——行尾展开钮 / 单元格菜单「展开此行」/ 快捷键 E；
 * Esc 全收（与 RT 同裁决）；hit 型 rowKey=_id（跨排序稳定）、rows 型坐标键随排序清零。
 * 挂载样板照抄 QueryResultTable.spec（裸 createApp + pinia，QRT 不依赖 api/router）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const keyOn = (sel: string, key: string, mods: KeyboardEventInit = {}) => {
  (host.querySelector(sel) as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
};
const expandRows = () => [...host.querySelectorAll('tbody tr.rt-expand')];
const menuItem = (label: string) =>
  [...document.body.querySelectorAll('.ccm-it') as any].find(b => b.textContent?.includes(label));
function ctxOnCell(ri: number, ci: number) {
  const td = host.querySelector(`tbody td[data-col]:nth-child(${ci + 2})`) as HTMLElement | null
    ?? [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('rt-expand'))[ri]?.children[ci + 1] as HTMLElement;
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.appendChild(host);
});

describe('QRT 行内展开详情（W7 RT 镜像）', () => {
  it('行尾展开钮：展开行含 JsonTree（各列键可见）；free 多行；hit 型 rowKey=_id', async () => {
    await mountTbl({
      hits: [
        { _id: '1', _index: 'i', _source: { name: 'banana', obj: { deep: 1 } } },
        { _id: '2', _index: 'i', _source: { name: 'apple' } },
      ],
    });
    expect(expandRows().length).toBe(0);
    const btns = [...host.querySelectorAll('.qrt-row-expand')] as HTMLElement[];
    expect(btns.length).toBe(2);
    btns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(1);
    const tree = expandRows()[0].querySelector('.jtree');
    expect(tree, '展开行应内嵌 JsonTree').toBeTruthy();
    expect(tree!.textContent).toContain('banana');
    /* free 多行 */
    btns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(2);
    /* 再点收起 */
    btns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(1);
  });

  it('单元格菜单「展开此行」；再开翻转为「收起此行」', async () => {
    await mountTbl({ hits: [{ _id: '1', _index: 'i', _source: { name: 'banana' } }] });
    /* 列序：#/_id/_index/name → 单元格 ci=0（_id 列） */
    ctxOnCell(0, 0);
    await tick();
    const item = menuItem('展开此行');
    expect(item, '单元格菜单应有「展开此行」').toBeTruthy();
    item!.click();
    await tick();
    expect(expandRows().length).toBe(1);
    ctxOnCell(0, 0);
    await tick();
    expect(menuItem('收起此行')).toBeTruthy();
  });

  it('快捷键 E：焦点行展开/收起；Esc 全收（失焦前先收展开）', async () => {
    await mountTbl({ hits: [
      { _id: '1', _index: 'i', _source: { name: 'banana' } },
      { _id: '2', _index: 'i', _source: { name: 'apple' } },
    ] });
    const qrt = host.querySelector('.qrt') as HTMLElement;
    qrt.focus();
    keyOn('.qrt', 'ArrowDown');
    await tick();
    keyOn('.qrt', 'e');
    await tick();
    expect(expandRows().length, 'E 应展开焦点行').toBe(1);
    keyOn('.qrt', 'e');
    await tick();
    expect(expandRows().length).toBe(0);
    /* 双行展开 → Esc 一次全收 */
    const btns = [...host.querySelectorAll('.qrt-row-expand')] as HTMLElement[];
    btns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    btns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(2);
    keyOn('.qrt', 'Escape');
    await tick();
    expect(expandRows().length, 'Esc 应一次全收').toBe(0);
  });

  it('rows 型（SQL 通道）：排序清空行展开（坐标键防错位）', async () => {
    await mountTbl({ cols: ['n'], rows: [['a'], ['b']], sortable: true });
    const btns = [...host.querySelectorAll('.qrt-row-expand')] as HTMLElement[];
    btns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(1);
    const th = host.querySelectorAll('thead th')[1] as HTMLElement;
    th.click();
    await tick();
    expect(expandRows().length, '排序应清空行展开（坐标键防错位）').toBe(0);
  });
});
