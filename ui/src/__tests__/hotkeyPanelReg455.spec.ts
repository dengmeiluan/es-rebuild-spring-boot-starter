/**
 * 四百五十五批：速查面板登记补全——421 分页器 ←/→ 翻页与 445 聚焦面 Esc 层级
 * 已实现但未进 HotkeyPanel（173/296 批「有功能没人知道」防重演原则）。
 * 「查询与编辑」组补两行：分页器内翻页 / 聚焦面层级退出。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../components/HotkeyPanel.vue'), 'utf-8');

describe('速查面板登记补全（455 批）', () => {
  it('分页器 ←/→ 与聚焦面 Esc 两行在场', () => {
    expect(s).toMatch(/\{ keys: \['←', '→'\], desc: '分页器内翻页/);
    expect(s).toMatch(/\{ keys: \['Esc'\], desc: '退出结果区聚焦全屏/);
  });

  /* INTERACTION.md：新增键盘交互必须同步登记速查面板——右键菜单键盘入口两行 */
  it('右键菜单键盘入口登记：模式条/候选列表/索引 chip、Boost 字段行、工作台配置行与 RT/QRT 列头', () => {
    expect(s).toMatch(/模式条 \/ 字段与值候选 \/ 当前索引 chip 开右键菜单（↑\/↓ 选择，Shift\+F10 同效）/);
    expect(s).toMatch(/Boost 调参字段行：复制 \/ 启停 \/ 删除右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/工作台配置行：显隐 \/ 列宽 \/ 排序右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/列头打开列管理菜单（Shift\+F10 同效）/);
  });
});
