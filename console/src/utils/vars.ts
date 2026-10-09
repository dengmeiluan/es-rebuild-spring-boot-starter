/**
 * Console Variables：${var} 插值（Kibana Console 同款）。
 * 规则：带引号 "${var}" → 字符串替换；裸 ${var} → 尝试 JSON.parse（数组/对象/数字注入），失败按字符串。
 */
const KEY = 'es_vars';

export function loadVars(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function saveVars(vars: Record<string, string>) {
  localStorage.setItem(KEY, JSON.stringify(vars));
}

export function applyVars(text: string, vars?: Record<string, string>): string {
  const v = vars || loadVars();
  return text.replace(/\$\{([\w.-]+)\}/g, (raw, name: string, offset: number, full: string) => {
    if (!(name in v)) return raw;
    const value = v[name];
    const before = full[offset - 1];
    const after = full[offset + raw.length];
    if (before === '"' && after === '"') {
      // 引号内 → 纯字符串替换（不转义）
      return value;
    }
    // 裸值 → 尝试 JSON 语义注入
    try { JSON.parse(value); return value; } catch { return JSON.stringify(value); }
  });
}
