/** 从查询串解析 hostTheme（非法/缺省 → null，调用方兜底）。 */
export function readUrlHostTheme(search) {
    const raw = typeof search === 'string' ? search
        : (typeof window !== 'undefined' ? window.location.search : '');
    const v = new URLSearchParams(raw).get('hostTheme');
    return v === 'dark' || v === 'light' ? v : null;
}
