/* 构建器内部协作总线（避免深层组件事件透传）。
   TREE_BUS：落点分区 → 顶层统一 moveNode。DRAG_KEY：window 上被拖节点 id 暂存。
   fireDrag：拖拽开始/结束广播，BoolGroupNode 借此亮出空分区作落点。 */
import type { InjectionKey } from 'vue';
import type { Occur } from '../../utils/queryAst';

export interface TreeBus {
  move(dragId: string, targetBoolId: string, occur: Occur): void;
  /** 条件行「参与/不参与」开关：按叶子 id 递归翻 disabled（ClauseNode 直调，免逐层事件透传） */
  toggleDisabled(leafId: string, disabled: boolean): void;
}
export const TREE_BUS: InjectionKey<TreeBus> = Symbol('qtp-tree-bus');
export const DRAG_KEY = '__qtpDragId';
export const DRAG_EVENT = 'qtp-drag';
export function fireDrag(on: boolean) { window.dispatchEvent(new CustomEvent(DRAG_EVENT, { detail: { on } })); }
