const isDown = (c) => c.health?.status !== 'GREEN';
const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0; /* 码点序：ASCII 稳定排在中文前，不依赖 ICU locale 细节 */
const latencyOf = (c) => {
    const v = c.health?.latencyMs;
    return typeof v === 'number' && Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
};
export function sortConns(conns, mode, manualOrder) {
    const cs = [...conns];
    if (mode === 'manual') {
        const pos = new Map((manualOrder ?? []).map((id, i) => [id, i]));
        /* 在序中的按序排，不在序中的沉底（组内名称升序） */
        cs.sort((a, b) => (pos.get(a.id) ?? pos.size) - (pos.get(b.id) ?? pos.size) || byName(a, b));
        return cs;
    }
    if (mode === 'name') {
        cs.sort((a, b) => byName(a, b));
        return cs;
    }
    if (mode === 'latency') {
        cs.sort((a, b) => {
            const da = isDown(a), db = isDown(b);
            if (da !== db)
                return da ? 1 : -1; /* 异常沉底 */
            if (da)
                return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
            return latencyOf(a) - latencyOf(b);
        });
        return cs;
    }
    /* status（默认）：异常/未知置顶，组内名称升序 */
    cs.sort((a, b) => {
        const da = isDown(a), db = isDown(b);
        if (da !== db)
            return da ? -1 : 1;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return cs;
}
/** usePref 脏值容错：非合法 mode 回落 'status' */
export function normalizeSortMode(v) {
    return v === 'name' || v === 'latency' || v === 'manual' ? v : 'status';
}
/**
 * 手动档落位纯函数——id 移到 toIndex（相对移除 id 后的数组，越界钳位）。
 * 拖拽落位（toIndex=目标行在序中的下标=插到目标行前）与键盘 Ctrl+↑/↓（toIndex=当前位±1）
 * 共用此语义；幂等、纯函数、不丢项。
 */
export function moveInOrder(order, id, toIndex) {
    const rest = order.filter(x => x !== id);
    const i = Math.max(0, Math.min(toIndex, rest.length));
    return [...rest.slice(0, i), id, ...rest.slice(i)];
}
