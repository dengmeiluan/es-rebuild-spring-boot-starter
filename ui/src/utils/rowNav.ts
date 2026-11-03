/* 自定义列表/卡片行的键盘行导航：聚焦行内 ↑/↓ 移动、Home/End 首末。
 只处理行自身聚焦（模板用 @keydown.self），行内输入框/按钮的按键保持原生。
 行需带 data-row-nav；无相邻行时不动，也不拦截滚动。 */
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

export function rowArrowNav(e: KeyboardEvent, selector = '[data-row-nav]'): void {
  if (!NAV_KEYS.has(e.key)) return;
  const cur = e.currentTarget as HTMLElement | null;
  if (!cur?.parentElement) return;
  const rows = Array.from(cur.parentElement.querySelectorAll<HTMLElement>(selector))
    .filter(el => el.getClientRects().length > 0);
  if (rows.length < 2) return;
  const i = rows.indexOf(cur);
  if (i < 0) return;
  const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
    : Math.max(0, Math.min(rows.length - 1, i + delta));
  e.preventDefault();
  rows[next].focus();
}
