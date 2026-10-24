/* 1042 批：fields 形态字段列表多选选择器（MultiFieldPicker）——研报/公告搜索心智
   是「标题+正文+摘要一起搜」（multi_match/combined_fields/query_string 多字段），
   此前字段列表只能逗号手输（拼错即零匹配）。选择器=teleport 弹层（搜索 rank 沿用
   fieldSearch 单源 + 复选框列表 + 已选计数），勾选即写回字段列表（逗号串 ↔ string[]
   既有 onFields 通道零改动，AST 零改动）。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree } from '../utils/queryAst';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1042 MultiFieldPicker 形态', () => {
  it('搜索 rank 单源 + 复选列表 + teleport 弹层（源码锁）', () => {
    const src = srcOf('components/builder/MultiFieldPicker.vue');
    expect(src).toContain('searchFields');
    expect(src).toContain('type="checkbox"');
    expect(src).toContain('Teleport');
  });
  it('ClauseNode 三处 cn-fields 行挂多选入口', () => {
    const src = srcOf('components/builder/ClauseNode.vue');
    expect(src.match(/MultiFieldPicker/g)?.length, '三处字段行都挂选择器').toBeGreaterThanOrEqual(3);
  });
});

describe('1042 多选字段往返无损（AST 零改动回归）', () => {
  roundTrip('multi_match 多字段', {
    query: { multi_match: { query: '债券 违约', fields: ['title', 'content', 'abstract'] } },
  });
  roundTrip('combined_fields 多字段', {
    query: { combined_fields: { query: '债券', fields: ['title', 'content'] } },
  });
});

describe('1042 选择器动线（挂载）', () => {
  it('候选复选渲染；勾选/取消即 emit 全量名单；搜索过滤候选', async () => {
    const { createApp, h } = await import('vue');
    const MultiFieldPicker = (await import('../components/builder/MultiFieldPicker.vue')).default;
    let last: string[] | null = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(MultiFieldPicker as any, {
      modelValue: ['title'],
      fields: ['title', 'content', 'abstract', 'pub_date'],
      types: { title: 'text', content: 'text', abstract: 'text', pub_date: 'date' },
      'onUpdate:modelValue': (v: string[]) => { last = v; },
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    // 候选复选渲染（teleport 到 body）：已选 title 勾选态
    const boxes = (Array.prototype.map.call(
      document.body.querySelectorAll('.mfp input[type=checkbox]'),
      (c: HTMLInputElement) => ({ v: c.getAttribute('data-path'), checked: c.checked }),
    ) as Array<{ v: string; checked: boolean }>);
    expect(boxes.length).toBe(4);
    expect(boxes.find(b => b.v === 'title')!.checked).toBe(true);
    // 勾选 content → emit 全量名单
    const contentBox = document.body.querySelectorAll('.mfp input[type=checkbox]')[1] as HTMLInputElement;
    contentBox.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last).toEqual(['title', 'content']);
    // 搜索过滤候选
    const q = document.body.querySelector('input.mfp-q') as HTMLInputElement;
    q.value = 'abs';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    const visible = Array.prototype.filter.call(
      document.body.querySelectorAll('.mfp-row'),
      (row: HTMLElement) => row.offsetParent !== null,
    ).length;
    expect(visible, '搜索后仅剩匹配候选').toBeLessThanOrEqual(2);
    app.unmount();
    host.remove();
  });
  it('ClauseNode 挂载：多选钮开弹层，勾选字段写回 fields 列表', async () => {
    const { createApp, h } = await import('vue');
    const ClauseNode = (await import('../components/builder/ClauseNode.vue')).default;
    const node: any = { id: 'n1', type: 'leaf', op: 'multi_match', field: null, value: '债券', fields: ['title'], params: {}, raw: null };
    let last: any = null;
    const nodeRef = (await import('vue')).ref(node);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(ClauseNode as any, {
      node: nodeRef.value, fields: ['title', 'content'], types: { title: 'text', content: 'text' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; last = n; },
      onRemove: () => {}, onDuplicate: () => {}, onWrap: () => {},
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    const mfBtn = host.querySelector('button[aria-label="多选字段"]') as HTMLButtonElement;
    expect(mfBtn, '多选字段入口在场').toBeTruthy();
    mfBtn.click();
    await new Promise(r => setTimeout(r, 30));
    // 弹层（teleport body）勾选 content
    const boxes = document.body.querySelectorAll('.mfp input[type=checkbox]') as NodeListOf<HTMLInputElement>;
    const content = Array.prototype.find.call(boxes, (c: HTMLInputElement) => c.getAttribute('data-path') === 'content');
    content.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last && last.fields, 'fields 写回全量名单').toEqual(['title', 'content']);
    app.unmount();
    host.remove();
    document.body.innerHTML = '';
  });
});
