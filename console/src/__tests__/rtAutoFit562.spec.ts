/**
 * 五百六十二批补遗·用户产线实报④:分页 10/页 只渲染 10 行,RT 滚动视口(rt-wrap-shell
 * flex:1)强制吃满结果区,表格下方一大片空白(横滚条与「双击编辑」提示行飘在容器底沿)。
 *
 * 修法=滚动壳改「贴合内容+上限收缩」:flex:0 1 auto——数据少时壳高=内容高(状态栏/
 * 提示行/横滚条全部贴到最后一行下面),数据多时被 flex-shrink 压回可用空间、rt-wrap
 * 内部滚动不变。回顶钮(absolute 锚壳)与 thead 吸顶零触;QRT 根非 flex 布局不适用记档。
 *
 * 高度红线自证:flex:0 1 auto 的高度由内容决定,内容(行数×行高)不因壳高变化——
 * 无 rAF 正反馈回路;数据多时收缩上限=父级剩余空间(flex-shrink 语义),链路确定。
 *
 * 源码锁口径(focusSurface401 同理由):flex 形态契约落源文本最稳。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const rt = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');

describe('562 实报④:RT 滚动壳贴合内容(数据少不再撑出大片空白)', () => {
  it('rt-wrap-shell 改 flex:0 1 auto(贴内容+可收缩),定位语义与 min-height:0 保留', () => {
    expect(rt).toMatch(/\.rt-wrap-shell \{ position: relative; flex: 0 1 auto; min-height: 0; display: flex; \}/);
  });
  it('rt-wrap 滚动视口形态零触(overflow/flex:1 在壳内仍吃满壳)', () => {
    expect(rt).toMatch(/\.rt-wrap \{ flex: 1; min-width: 0; overflow: auto;/);
  });
});
