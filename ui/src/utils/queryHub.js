export const QUERY_MODES = [
    { k: 'dsl', t: 'DSL', essence: '全能主力 · 模板/变量/聚合图', icon: 'TerminalSquare', legacyPath: '/query' },
    { k: 'sql', t: 'ES-SQL', essence: '表格思维 · 会 SQL 就会查', icon: 'Database', minVer: '6.3', legacyPath: '/sql' },
    { k: 'lucene', t: 'Lucene', essence: '一行搜遍 · 数组/nested 全友好', icon: 'SearchCode', legacyPath: '/lucene' },
    { k: 'sandbox', t: '沙盒', essence: '全集群试错 · explain/profile', icon: 'Beaker', legacyPath: '/sandbox' },
    { k: 'pit', t: 'PIT 分页', essence: '深分页导出 · 破 10000 上限', icon: 'Layers', minVer: '7.10', legacyPath: '/pit-scroll' },
    { k: 'bridge', t: '语法桥', essence: 'SQL⇄DSL⇄Lucene 三态互转', icon: 'ArrowLeftRight', minVer: '6.3', legacyPath: '/sql-bridge' },
];
export const DEFAULT_MODE = 'dsl';
/** mode 值合法化：未知值回落默认（手改 URL/旧书签容错） */
export function normalizeMode(v) {
    return QUERY_MODES.some(m => m.k === v) ? v : DEFAULT_MODE;
}
/** 旧路由 → 模式（入口收敛后 6 条旧路径 redirect 到 /search，深链/收藏/goto 键零死链） */
export const LEGACY_QUERY_PATHS = Object.freeze(QUERY_MODES.reduce((acc, m) => { acc[m.legacyPath] = m.k; return acc; }, {}));
/** 构造 redirect 目标：保留原 query 全部参数（?idx=&dsl= 等现场），叠加 mode */
export function legacyRedirect(path, query) {
    return { path: '/search', query: { ...query, mode: LEGACY_QUERY_PATHS[path] || DEFAULT_MODE } };
}
export const QUICK_TASKS = [
    {
        k: 'by-id', t: '按 ID 捞文档', scene: '刚写入一条数据，按 _id 验证它真的进去了',
        input: { placeholder: '文档 _id，多个用逗号分隔' },
        build: (input) => JSON.stringify({
            query: { ids: { values: input.split(',').map(s => s.trim()).filter(Boolean) } },
        }, null, 2),
    },
    {
        k: 'sample', t: '抽样看 10 条', scene: '新接手一个索引，先看看数据长什么样',
        build: () => JSON.stringify({ query: { match_all: {} }, size: 10 }, null, 2),
    },
    {
        k: 'count', t: '只数总数', scene: '灌数/迁移后核对条数对不对',
        build: () => JSON.stringify({ query: { match_all: {} }, size: 0, track_total_hits: true }, null, 2),
    },
    {
        k: 'missing', t: '查字段缺失', scene: '上线新字段后，找出还没回填的文档',
        input: { placeholder: '字段名，如 update_time', kind: 'field' },
        build: (input) => JSON.stringify({
            query: { bool: { must_not: [{ exists: { field: input.trim() } }] } }, size: 10,
            track_total_hits: true,
        }, null, 2),
    },
    {
        k: 'recent', t: '看最新写入', scene: '按时间字段倒序，确认最近的数据进来了',
        input: { placeholder: '时间字段名，如 create_time', kind: 'field', typeFilter: 'date' },
        build: (input) => JSON.stringify({
            query: { match_all: {} }, size: 10,
            sort: [{ [input.trim()]: { order: 'desc' } }],
        }, null, 2),
    },
];
/** DSL → ?dsl= 深链参数（与 DslQueryView 的 atob 解码契约一致） */
export function encodeDslParam(dsl) {
    return btoa(unescape(encodeURIComponent(dsl)));
}
