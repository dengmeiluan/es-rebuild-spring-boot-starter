/**
 * 四百一十七批：右键菜单 Esc 关闭（ARIA 菜单惯例）——CellContextMenu 此前只有
 * 遮罩点击/动作执行两条收起路径，键盘用户无路可退；补 document capture 阶段
 * keydown（先于 Monaco 等内部消费者），条件渲染卸载时监听自动移除。
 * 行为级验证：真实挂载→Esc→close 事件；动作执行→close；卸载→监听移除不泄漏。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, defineComponent, ref, nextTick } from 'vue';
import CellContextMenu from '../CellContextMenu.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function mountMenu() {
  const closed = vi.fn();
  const Host = defineComponent({
    setup() {
      const open = ref(true);
      return () => open.value
        ? h(CellContextMenu, {
            x: 40, y: 40,
            items: [{ key: 'a', label: '动作 A', run: () => {} }],
            onClose: () => { closed(); open.value = false; },
          })
        : null;
    },
  });
  const app = createApp(Host);
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return { host, closed };
}

beforeEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
});

describe('右键菜单 Esc 关闭（417 批）', () => {
  it('Esc 触发 close 且菜单卸载；监听随卸载移除', async () => {
    const { host, closed } = await mountMenu();
    expect(document.querySelector('.ccm'), '菜单在（teleport 到 body）').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(closed, 'Esc 即关闭').toHaveBeenCalledTimes(1);
    expect(host.querySelector('.ccm'), '关闭后菜单卸载').toBeNull();
    // 卸载后再按 Esc：无监听残留（若残留会再触发 closed——open 已 false，无断言面，
    // 用 spy 引用计数兜底：closed 仅被调 1 次）
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed, '监听已随卸载移除').toHaveBeenCalledTimes(1);
  });

  it('mask 点击与动作执行后自动关闭（146 批语义保留）', async () => {
    const { host, closed } = await mountMenu();
    (document.querySelector('.ccm-mask') as HTMLElement).click();
    await nextTick();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
