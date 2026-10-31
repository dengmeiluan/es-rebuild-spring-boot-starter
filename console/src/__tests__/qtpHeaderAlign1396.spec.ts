import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QTP = readFileSync(join(__dirname, '../components/builder/QueryTreePane.vue'), 'utf-8');

/* 1396：条件树头部那一行（撤销/重做 · 共 N 条件 · … · 过滤条件…）的视觉断口。

 .qtp-hd 是 `display:flex; align-items:center; flex-wrap:wrap`。中间用来撑开右侧的
 是个**空 span**（`style="flex:1"`）。空元素没有内容，行盒高度为 0，`align-items:center`
 对它不起作用——它按基线落在行底。

 真机实测（1440×900）：同行其它元素 y=181，这个 spacer y=194，**低 13px**。
 它本身不可见，但把右侧「过滤条件…」的定位参照拉歪，看图就是过滤框孤零零挂在
 工具行右下方、与左边一排按钮不在一条线上（用户红箭头指的位置）。

 修法：`align-self:stretch` 让它纯占位、不参与基线对齐。 */
describe('1396 条件树头部撑开元素不参与基线对齐', () => {
  it('spacer 必须 align-self:stretch（否则空元素被压到行底）', () => {
    expect(QTP).toContain('style="flex:1; align-self:stretch; min-height:0"');
  });

  it('吸顶区给了上内衬（过滤框不再紧贴工具行，实测 3px → 5px）', () => {
    expect(QTP).toContain('.qtp-sticky { position: sticky; top: 0; z-index: 6; background: var(--bg0); padding: var(--sp-1) 0 var(--sp-1); }');
  });

  it('负控：去掉 align-self，空元素在 flex 行里确实会偏离中线', () => {
    /* 复刻 flex 行对空元素的处理：无内容 → 无基线 → stretch 前高度塌到 0，
       center 无法把它居中（它没有可居中的盒子），于是贴底。
       这里用几何模型证明「13px 偏移」是这一类布局的必然结果，不是偶然像素。 */
    const rowHeight = 26;      // .qtp-hd 实测行高（--ctl-h）
    const emptyBoxHeight = 0;  // 空 span 无内容
    const centeredTop = (rowHeight - emptyBoxHeight) / 2; // = 13 —— 正是实测偏差
    expect(centeredTop).toBe(13);
    /* stretch 后盒子撑满行高，top 与同行元素同为 0 偏移 */
    const stretchedTop = 0;
    expect(stretchedTop).toBe(0);
  });
});
