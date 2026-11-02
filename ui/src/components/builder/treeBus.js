export const TREE_BUS = Symbol('qtp-tree-bus');
export const DRAG_KEY = '__qtpDragId';
export const DRAG_EVENT = 'qtp-drag';
export function fireDrag(on) { window.dispatchEvent(new CustomEvent(DRAG_EVENT, { detail: { on } })); }
