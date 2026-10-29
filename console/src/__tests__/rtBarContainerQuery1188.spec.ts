/**
 * 1188：工具行断点必须按「工具行可用宽」，不能按视口。
 *
 * 现场（DSL 工作台分栏）：同一张结果表，索引工作区 1024–1440 全部零溢出，
 * 而 DSL 工作台在 1440 溢出 10px、**1280 溢出 41px**（右簇越过右缘 40px，末尾「放大」被切）——
 * 视口 1380/1250 两个断点都没触发，因为分栏后工具行只剩 ≈1014px。
 * 这就是「按钮文案被遮挡」在第三个入口的复发。
 *
 * 修法：容器查询挂到根壳 .rt（容器不能查自己——第一版挂 .rt-bar 上实测永不匹配），
 * 掉标签阈值 1180、换行阈值 1060（= 实测图标态内容宽 1053 + 余量）。
 * 右簇贴右改恒开 margin-left:auto：换行可能由容器触发，视口断点兜不住。
 *
 * 锁：① 容器在根壳且带名字；② 两个容器阈值在位；③ 负控——阈值低于实测内容宽即失败。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const shell = readFileSync(join(__dirname, '../components/TableShell.vue'), 'utf-8');

describe('1188 工具行断点按容器宽', () => {
  it('容器挂在根壳 .rt 上（不是工具行自身——容器查不了自己）', () => {
    expect(rt).toMatch(/\.rt \{[^}]*container-type: inline-size/);
    expect(rt).toMatch(/\.rt \{[^}]*container-name: rtbar/);
    expect(rt, '工具行不得自称容器').not.toMatch(/\.rt-bar \{[^}]*container-type/);
  });

  it('掉标签 1180 / 换行 1060 两个容器阈值在位', () => {
    expect(rt).toMatch(/@container rtbar \(max-width: 1180px\)/);
    expect(rt).toMatch(/@container rtbar \(max-width: 1060px\)[\s\S]{0,120}flex-wrap: wrap/);
  });

  it('负控：换行阈值不得低于实测内容宽（太早换行=宽档也两行）', () => {
    const m = rt.match(/@container rtbar \(max-width: (\d+)px\) \{\s*\.rt-bar/);
    expect(m, '换行容器规则必须存在').toBeTruthy();
    expect(Number(m![1]), '图标态内容实测 1053px，阈值不得低于 1060').toBeGreaterThanOrEqual(1060);
  });

  it('右簇贴右恒开（容器触发的换行也能贴右，不被甩到左缘）', () => {
    expect(shell).toMatch(/\.rt-bar > \.rt-bar-r, \.qrt-bar > \.qrt-bar-r \{ margin-left: auto; \}/);
  });
});
