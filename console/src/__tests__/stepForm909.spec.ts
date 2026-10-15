/**
 * 九百零九批：step-after 阶梯三件套纯函数锚（接力收口补齐）。
 * 背景heap 档（GC 锯齿 gauge 指标）折线与联动面积改走 step-after 阶梯形态
 * （Datadog/Grafana 惯例：台阶=采样格点、悬崖=真实回收；sparkChart 新增
 * stepPts/stepPath/stepAreaPath 三件，挂载行为由 cmpAreaSmooth905 双形态分支覆盖），
 * 本 spec 补三件的纯函数锚：点列交错形状、M+L 直边零贝塞尔、面积=折线前缀+底边
 * 两角闭合、空/单点退化形态、与平滑档的同点列对照。
 */
import { describe, it, expect } from 'vitest';
import { stepPts, stepPath, stepAreaPath, catmullRomPath, CMP_W, CMP_H, type Pt } from '../utils/sparkChart';

const pts: Pt[] = [{ x: 0, y: 90 }, { x: 360, y: 60 }, { x: 720, y: 72 }];

describe('九百零九批：step-after 阶梯三件套（纯函数锚）', () => {
  it('stepPts：水平保持→垂直跳变的交错点列（后点 x 配前点 y）；空/单点恒等', () => {
    expect(stepPts([])).toEqual([]);
    expect(stepPts([{ x: 5, y: 7 }])).toEqual([{ x: 5, y: 7 }]);
    expect(stepPts(pts)).toEqual([
      { x: 0, y: 90 },
      { x: 360, y: 90 }, { x: 360, y: 60 },
      { x: 720, y: 60 }, { x: 720, y: 72 },
    ]);
  });

  it('stepPath：M+L 直边折线零贝塞尔（阶梯档与平滑档的分界不变量）；空串/单点直钉', () => {
    expect(stepPath([], CMP_W, CMP_H)).toBe('');
    expect(stepPath([{ x: 5, y: 7 }], CMP_W, CMP_H)).toBe('M 5.0,7.0');
    const d = stepPath(pts, CMP_W, CMP_H);
    expect(d, '阶梯档无贝塞尔段').not.toContain(' C ');
    expect(d.startsWith('M 0.0,90.0'), '首点直钉').toBe(true);
    expect(d).toContain('L 360.0,90.0 L 360.0,60.0');
  });

  it('stepAreaPath：面积上边缘=阶梯折线 d 前缀+底边两角闭合（905 挂载贴合锁的纯函数面）；空串', () => {
    expect(stepAreaPath([], CMP_W, CMP_H)).toBe('');
    const a = stepAreaPath(pts, CMP_W, CMP_H);
    expect(a.startsWith(stepPath(pts, CMP_W, CMP_H)), '面积上边缘与折线完全贴合').toBe(true);
    expect(a.endsWith(`L ${CMP_W.toFixed(1)},${CMP_H.toFixed(1)} L 0.0,${CMP_H.toFixed(1)} Z`), '底边两角闭合').toBe(true);
  });

  it('同点列对照：平滑档含 C、阶梯档不含（双形态分支的函数面）', () => {
    expect(catmullRomPath(pts, CMP_W, CMP_H)).toContain(' C ');
    expect(stepPath(pts, CMP_W, CMP_H)).not.toContain(' C ');
  });
});
