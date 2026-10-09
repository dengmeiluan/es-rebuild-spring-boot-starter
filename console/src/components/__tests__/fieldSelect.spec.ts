/* 范式同 emptyState.spec.ts：createApp 手工 mount，无 @vue/test-utils。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import FieldSelect from '../builder/FieldSelect.vue';

function mount(fields: string[], types: Record<string, string> = {}, model = '') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const val = ref(model);
  const app = createApp({
    render: () => h(FieldSelect, {
      modelValue: val.value, fields, types,
      'onUpdate:modelValue': (v: string) => { val.value = v; },
    }),
  });
  app.mount(host);
  return { host, val };
}

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('FieldSelect', () => {
  /* 弹层已 teleport 到 body（防 .dq-tree overflow 裁剪）——候选项断言一律查 document.body */
  it('渲染字段列表并带类型徽标', async () => {
    const { host } = mount(['title', 'count'], { title: 'text', count: 'long' });
    host.querySelector('input')!.focus();
    /* 弹层换代后 v-if 渲染（原 v-show 常驻）：开层要等一帧宏任务再断言 */
    await new Promise(r => setTimeout(r));
    const text = document.body.textContent || '';
    expect(text).toContain('title');
    expect(text).toContain('text');
    expect(text).toContain('long');
  });
  it('输入关键字过滤', async () => {
    const { host } = mount(['title', 'count']);
    const inp = host.querySelector('input')!;
    inp.focus();
    inp.value = 'cou';
    inp.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(document.body.textContent).toContain('count');
    expect(document.body.textContent).not.toContain('title');
  });
  it('选中字段 emit update:modelValue 并记最近使用', async () => {
    const { host, val } = mount(['title', 'count']);
    const inp = host.querySelector('input')!;
    inp.focus();
    await new Promise(r => setTimeout(r));
    /* 换代后候选按 rank+字母序（count 在前），点选「title」那项而非首项 */
    const target = Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item'))
      .find(el => el.textContent?.includes('title'));
    target!.click();
    expect(val.value).toBe('title');
    expect(JSON.parse(localStorage.getItem('es_console_qb_field_recent') || '[]')).toContain('title');
  });
});
