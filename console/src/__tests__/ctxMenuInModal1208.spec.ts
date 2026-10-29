/**
 * 1208：右键菜单在 naive 弹层内被压住（真实浏览器实测发现）。
 *
 * 现场（1440×1000，mock 后端）：索引工作区 → 单元格右键 →「查看完整值」→ n-modal
 * （容器 z=2000）→ 在 JsonTree 节点上右键。修复前菜单 .ccm z=1201，
 * `document.elementFromPoint` 在菜单中心命中的是弹窗里的 `.j-str`，整张菜单不可见；
 * 修复后 mask inline z=2001（注册进 vdirs 计数器，后开者胜），命中回到 `.ccm-hd`，
 * 二级菜单 z=1202 同样在弹窗之上。
 *
 * 为什么必须动态：naive 弹层的 z 从 2000 起自增，而 --z-ctx 是静态 1200；
 * 弹层内触发右键是常态（单元格详情、JSON 树、对比弹窗、连接管理都在 n-modal 里）。
 * 项目已有同解先例：ModalShell 把 mask 注册进 naive 同款计数器（confirmStack995 锁）。
 *
 * 本 spec 锁三件事：
 *  1) 确有已注册层时 mask 被 ensureZIndex 抬到该层之上（数值断言，不是"有调用"）；
 *  2) 无已注册层时保持 CSS 的 --z-ctx、不写 inline z（普通页面层序零变化）；
 *  3) 卸载反注册，计数器回落（不残留、不无限攀升）。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import zIndexManager from 'vdirs/es/zindexable/z-index-manager';

let app: any = null;

const menuSrc = () => readFileSync(join(__dirname, '../components/CellContextMenu.vue'), 'utf-8');

async function mountMenu() {
  const { createApp, h, nextTick } = await import('vue');
  const Menu = (await import('../components/CellContextMenu.vue')).default;
  app = createApp({
    render: () => h(Menu as any, {
      x: 40, y: 40, title: 't',
      items: [{ key: 'a', label: '复制值', run: () => {} }],
    }),
  });
  app.mount(document.createElement('div'));
  await nextTick();
  await nextTick();
}

const maskEl = () => document.querySelector('.ccm-mask') as HTMLElement | null;

beforeEach(() => {
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
});

afterAll(() => { if (app) app.unmount(); });

describe('1208 右键菜单在 naive 弹层内可见', () => {
  it('已有 naive 层时 mask 抬到该层之上（后开者胜）', async () => {
    const naive = document.createElement('div');
    zIndexManager.ensureZIndex(naive);
    const naiveZ = Number(naive.style.zIndex);
    expect(naiveZ).toBeGreaterThanOrEqual(2000);

    await mountMenu();
    const z = Number(maskEl()?.style.zIndex || 0);
    expect(z).toBeGreaterThan(naiveZ);

    zIndexManager.unregister(naive);
  });

  it('无已注册层时保持静态档：不写 inline z（普通页面层序零变化）', async () => {
    expect(zIndexManager.elementCount).toBe(0);
    await mountMenu();
    expect(maskEl()?.style.zIndex || '').toBe('');
    /* 静态档仍在 CSS 里（colFilterPopover524 已锁同一形态） */
    expect(await menuSrc()).toMatch(/\.ccm-mask \{ position: fixed; inset: 0; z-index: var\(--z-ctx\); \}/);
  });

  it('卸载反注册：计数器回落，不残留', async () => {
    const naive = document.createElement('div');
    zIndexManager.ensureZIndex(naive);
    await mountMenu();
    expect(zIndexManager.elementCount).toBe(2);
    app!.unmount(); app = null;
    await Promise.resolve();
    expect(zIndexManager.elementCount).toBe(1);
    zIndexManager.unregister(naive);
    expect(zIndexManager.elementCount).toBe(0);
  });

  it('接线在位：mask 有 ref、挂载注册、卸载反注册', async () => {
    const src = await menuSrc();
    expect(src).toContain('ref="maskEl" class="ccm-mask"');
    expect(src).toContain("import zIndexManager from 'vdirs/es/zindexable/z-index-manager';");
    expect(src).toContain('if (el && zIndexManager.elementCount > 0) zIndexManager.ensureZIndex(el);');
    expect(src).toContain('onBeforeUnmount(() => { if (maskEl.value) zIndexManager.unregister(maskEl.value); });');
  });
});
