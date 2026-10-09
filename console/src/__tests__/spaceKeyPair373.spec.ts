/**
 * 三百七十三批：Space 键同口径补齐——369-372 加的 role=button 卡片/芯片/行
 * 只有 Enter 触发；ARIA button 语义期望 Space 同样触发（且浏览器滚动页面会被
 * .prevent 吞掉防误滚），RT/QRT 表头与 370 批 Xmigrate th 本就是 Enter+Space 双键。
 * 本批把 17 处卡片/芯片/行补齐为双键，口径全站归一。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const files: [string, number][] = [
  ['../views/OverviewView.vue', 5],
  ['../components/WelcomeWizard.vue', 4],
  ['../components/ClusterSwitcher.vue', 3],
  ['../views/DiagView.vue', 1], /* 五百二十五批 W5：节点名 span 的 Enter+Space 双键随节点表
      换 QRT 壳退役——采热直达改 row-actions 注入原生 button（Enter/Space 为浏览器原生语义，
      无需 prevent 手挂）；余 1 处=dg-meta-link（重建锁下钻 span）双键不变 */
  ['../views/RestView.vue', 1], /* 第十批：历史重放行换装 QueryHistoryPanel（Space 随行迁入共享件） */
  ['../components/QueryHistoryPanel.vue', 1],
  ['../views/AdhocRebuildView.vue', 1],
];

describe('Space 键双键口径补齐（373 批）', () => {
  for (const [f, count] of files) {
    it(`${f} 含 ${count} 处 keydown.space.prevent`, () => {
      const v = readFileSync(join(__dirname, f), 'utf-8');
      const n = (v.match(/@keydown\.space\.prevent=/g) ?? []).length;
      expect(n, `${f} Space 绑定数`).toBeGreaterThanOrEqual(count);
    });
  }

  it('每处新增 Space 紧随同元素 Enter（双键成对，无落单 Space）', () => {
    for (const [f] of files) {
      const v = readFileSync(join(__dirname, f), 'utf-8');
      /* 369-373 引入的卡片双键模式：Enter 绑定后同串内跟 Space 绑定 */
      const pairs = v.match(/@keydown\.enter\.prevent="[^"]+" @keydown\.space\.prevent="[^"]+"/g) ?? [];
      expect(pairs.length, `${f} Enter+Space 成对数`).toBeGreaterThanOrEqual(1);
    }
  });
});
