/**
 * 安全中心页面授权解析纯函数（SecurityView 我的账号/页面授权区消费）。
 * 语义与边界详见 utils/__tests__/pageGrants.spec.ts。
 */
export function summarizeGrants(grantedPages) {
    if (grantedPages == null) {
        return { connModel: false, conns: [], totals: { visible: 0, writable: 0 }, staticKeys: null };
    }
    const staticKeys = grantedPages.filter(k => typeof k === 'string' && !k.startsWith('conn:'));
    const connKeys = grantedPages.filter(k => typeof k === 'string' && k.startsWith('conn:'));
    if (connKeys.length === 0) {
        return { connModel: false, conns: [], totals: { visible: 0, writable: 0 }, staticKeys: [...staticKeys] };
    }
    const conns = new Map();
    for (const key of connKeys) {
        /* 键形态：conn:{cid}:{page} | conn:{cid}:w:{page}（w: 后可能再无 page=裸写键段，忽略） */
        const body = key.slice('conn:'.length);
        const sep = body.indexOf(':w:');
        if (sep >= 0) {
            const connId = body.slice(0, sep);
            const pageKey = body.slice(sep + 3);
            if (!pageKey)
                continue;
            const g = conns.get(connId) ?? { connId, visible: [], writable: [] };
            if (!g.writable.includes(pageKey))
                g.writable.push(pageKey);
            if (!g.visible.includes(pageKey))
                g.visible.push(pageKey);
            conns.set(connId, g);
        }
        else {
            const slash = body.indexOf(':');
            if (slash < 0)
                continue;
            const connId = body.slice(0, slash);
            const pageKey = body.slice(slash + 1);
            if (!pageKey)
                continue;
            const g = conns.get(connId) ?? { connId, visible: [], writable: [] };
            if (!g.visible.includes(pageKey))
                g.visible.push(pageKey);
            conns.set(connId, g);
        }
    }
    const list = [...conns.values()].sort((a, b2) => a.connId.localeCompare(b2.connId));
    const visibleSet = new Set(staticKeys);
    const writableSet = new Set();
    for (const g of list) {
        for (const p of g.visible)
            visibleSet.add(p);
        for (const p of g.writable)
            writableSet.add(p);
    }
    return {
        connModel: true,
        conns: list,
        /* 页面 key 去重计数：同一页在多个连接可写只算一页，保证「可写 ≤ 可见」 */
        totals: { visible: visibleSet.size, writable: writableSet.size },
        staticKeys: [...staticKeys],
    };
}
