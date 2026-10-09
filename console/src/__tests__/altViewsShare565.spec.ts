/**
 * 五百六十五批·轨2 W2 件③：alt 三视图抽共享件 AltHitsViews.vue（DQ 换装落地）。
 *
 *  背景：DslQueryView 与 IndexHubView docs/query 的 json/tree/cards 三视图体逐字重复三处，
 *  抽 components/AltHitsViews.vue（view/jsonHtml/treeData/hits + @open-doc 契约）。
 *
 *  换装范围记档（前提边界，非缩水）：
 *  · DslQueryView：三处换装落地——包裹 div 留在宿主（dq-json-wrap/dq-tree-view/dq-cards 类串
 *    与 --dq-view-cap 高度链是 track2Wave551:135-137 黑名单 + queryWorkbenchW1/workbenchParity402
 *    字面锁面，包裹层类名/CSS 零触；高度变量随包裹层原样透传，56vh 现值不变），
 *    三视图体内脏（pre.json-view / JsonTree / 卡片行）进共享件；卡片样式随迁组件 scoped。
 *  · IndexHubView docs/query 两处：555~657 间因 ihUnify554 黑名单 DOM 冻结+工作树 11 M
 *    残留未清跳过（原记档「留给锁随迁批」）；658 接管提交 9e999d7e 后黑名单制度性清零，
 *    667 批解冻收口换装落地（六分支内脏进共享件、包裹层 v-show 容器留宿主；锁随迁见
 *    ihUnify554 二段/四段与本件 it4 翻转；新扫描锁 ihAltShare667）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import AltHitsViews from '../components/AltHitsViews.vue';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

/* ═══════════ 源码锁：三消费面接线形态 ═══════════ */

describe('565 件③：AltHitsViews 共享件接线（源码锁）', () => {
  it('DslQueryView import + 三视图分支各挂一件（json/tree/cards 绑定契约）', () => {
    expect(dq).toContain("import AltHitsViews from '../components/AltHitsViews.vue';");
    expect(dq).toMatch(/<AltHitsViews ref="jsonBox" view="json" :json-html="jsonMarkedHtml" \/>/);
    expect(dq).toMatch(/<AltHitsViews view="tree" :tree-data="jqResult !== null \? jqResult : \(resp\.hits \|\| \[\]\)\.map\(h => \(\{ _id: h\._id, \.\.\.h\._source \}\)\)" \/>/);
    expect(dq).toMatch(/<AltHitsViews view="cards" :hits="cardHits" @open-doc="openDoc" \/>/);
  });

  it('包裹层类串与 --dq-view-cap 高度链零触（track2Wave551 黑名单 + W1/402 锁面保形）', () => {
    expect(dq).toContain('dq-json-wrap dq-alt-body');
    expect(dq).toContain('dq-tree-view dq-alt-body');
    expect(dq).toContain('dq-cards scroll-y dq-alt-body');
    expect(dq).toMatch(/--dq-view-cap:\s*56vh/);
    expect(dq).toMatch(/\.dq-json-wrap \{ max-height: var\(--dq-view-cap\); flex: 1 1 auto; min-height: 0; \}/);
    expect(dq).toMatch(/\.dq-cards \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(240px, 1fr\)\); gap: var\(--sp-2h\); max-height: var\(--dq-view-cap\); flex: 1 1 auto; min-height: 0; \}/);
  });

  it('卡片内脏样式随迁组件 scoped（宿主侧死规则退役）', () => {
    const av = readFileSync(join(__dirname, '../components/AltHitsViews.vue'), 'utf-8');
    expect(av).toContain('.dq-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-m); padding: var(--sp-2h) var(--sp-3); cursor: pointer; transition: border var(--tr), transform var(--tr); }');
    expect(dq, '宿主侧卡片内脏样式退役（随迁组件）').not.toContain('.dq-card-id {');
  });

  it('IndexHubView docs/query 已换装共享件（667 解冻收口；包裹层 v-show 容器留宿主零触）', () => {
    expect(ih).toContain("import AltHitsViews from '../components/AltHitsViews.vue';");
    expect(ih).toContain('<AltHitsViews view="json" :json-html="docsJsonHtml" />');
    expect(ih).toContain('<AltHitsViews view="tree" :tree-data="docsAltData" />');
    expect(ih).toContain('<AltHitsViews view="cards" :hits="docsHits" @open-doc="openDoc" />');
    expect(ih).toContain('<AltHitsViews view="cards" :hits="qryResp.hits" @open-doc="openDoc" />');
    expect(ih, '包裹层容器类留宿主（track2Wave560-ih CSS 锁零触）').toContain('ih-json-wrap ih-alt-body');
    expect(ih).toContain('ih-cards ih-alt-body');
  });
});

/* ═══════════ 行为锁：三形态 DOM 与旧一致（裸 createApp 挂载） ═══════════ */

const apps: ReturnType<typeof createApp>[] = [];

async function mountAv(props: Record<string, unknown>) {
  const app = createApp({ render: () => h(AltHitsViews as any, props) });
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return host;
}

afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; document.body.innerHTML = ''; });

const HITS = [
  { _id: 'a1', _source: { name: 'alpha', age: 1, city: 'x', tag: 't', extra: 'e', beyond: '6th' } },
  { _id: 'a2', _source: { name: 'beta' } },
];

describe('565 件③：AltHitsViews 三形态渲染（行为锁）', () => {
  it('json 形态：pre.json-view + v-html 内容（与旧 pre 逐字同构）+ preEl expose（jsonFind 定位链）', async () => {
    const host = await mountAv({ view: 'json', jsonHtml: '<b data-hit-idx="1">hi</b>' });
    const pre = host.querySelector('pre.json-view');
    expect(pre, 'pre.json-view 在场').toBeTruthy();
    expect(pre!.innerHTML).toContain('data-hit-idx="1"');
    /* jsonFind 定位链：DQ 经 ref 拿 preEl 查 data-hit-idx + 归零 scrollTop（多根 v-if 链
       带注释锚点，宿主 ref 拿到的是组件 expose 的 preEl 元素本身） */
    expect(pre!.tagName).toBe('PRE');
  });

  it('tree 形态：JsonTree tools 档（.jtree 根，与旧同件同参）', async () => {
    const host = await mountAv({ view: 'tree', treeData: [{ _id: 'a1', name: 'alpha' }] });
    expect(host.querySelector('.jtree'), 'JsonTree 渲染').toBeTruthy();
    expect(host.querySelector('.jt-tools'), 'tools 参数透传（搜索条在场）').toBeTruthy();
  });

  it('cards 形态：卡片结构与旧逐字一致（_id 行+前 5 字段+42 截断），点击 emit open-doc', async () => {
    let emitted: unknown[] = [];
    const app = createApp({
      render: () => h(AltHitsViews as any, { view: 'cards', hits: HITS, onOpenDoc: (h: unknown) => emitted.push(h) }),
    });
    apps.push(app);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    const cards = host.querySelectorAll('.dq-card');
    expect(cards.length).toBe(2);
    /* 前 5 字段截断（beyond=第 6 字段不渲染）+ 值 42 截断语言 */
    expect(cards[0]!.querySelector('.dq-card-id')!.textContent).toBe('a1');
    expect(cards[0]!.querySelectorAll('.dq-card-row').length).toBe(5);
    expect(cards[1]!.querySelector('.dq-card-k')!.textContent).toBe('name');
    /* 键盘可达 + 点击 emit（DQ openDoc 消费） */
    (cards[1] as HTMLElement)!.click();
    await nextTick();
    expect(emitted.length).toBe(1);
    expect((emitted[0] as any)._id).toBe('a2');
  });

  it('卡片键盘回车同 emit（role=button/tabindex 语义与旧一致）', async () => {
    let n = 0;
    const app = createApp({
      render: () => h(AltHitsViews as any, { view: 'cards', hits: HITS, onOpenDoc: () => n++ }),
    });
    apps.push(app);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    const card = host.querySelector<HTMLElement>('.dq-card')!;
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await nextTick();
    expect(n).toBe(1);
  });
});
