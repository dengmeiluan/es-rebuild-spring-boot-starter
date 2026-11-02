/* 键 = g 之后按下的字母；顺序即速查面板展示顺序 */
export const GOTO_TARGETS = {
    /* q/s 指向查询工作台对应模式（旧路径也有 redirect 兜底，这里直达省一跳） */
    o: { path: '/overview', label: '概览' },
    q: { path: '/search', label: '查询工作台' },
    m: { path: '/mapping', label: 'Mapping' },
    b: { path: '/browser', label: '数据浏览器' },
    r: { path: '/rest', label: 'REST 直连' },
    /* -13：h 原登记的「历史」随 HistoryView 退役被删，但 NAV 有单键 h→/workspace，
   App.vue 的 chord 分支查不到 GOTO 时会落到 NAV 单键回退，g,h 因此仍能跳——
   跳的是工作台。既然行为真实存在就如实登记，否则就是「有功能没人知道」。 */
    h: { path: '/workspace', label: '工作台' },
    d: { path: '/diag', label: '诊断' },
    x: { path: '/xmigrate', label: '跨集群迁移' },
    t: { path: '/tasks', label: '任务' },
    a: { path: '/analyze', label: '分词验证' },
    l: { path: '/aliases', label: '别名管控' },
    c: { path: '/topology', label: '拓扑' },
    e: { path: '/templates', label: '索引模板' },
    n: { path: '/snapshots', label: '快照' },
    s: { path: '/search?mode=sandbox', label: '沙盒' },
    k: { path: '/index-settings', label: '热Setting' },
    i: { path: '/ilm', label: 'ILM' },
    f: { path: '/cluster-settings', label: '集群设置' },
    j: { path: '/task-tree', label: '任务树' },
    y: { path: '/reindex-preview', label: 'Reindex预估' },
    v: { path: '/health-report', label: '一键体检' },
    w: { path: '/templates-gallery', label: '模板画廊' },
    z: { path: '/optimizer', label: '优化向导' },
    /* g→u 到 watcher。q/r/b/x 已被既有占用（query/rest/browser/xmigrate），
   就直接用 NAV 单键 u/q/r/b/x 即可（看 router.ts） */
    u: { path: '/watcher', label: 'Watcher 告警' },
    /* 26 字母单键已全占用，索引工作区走 gg chord（vim 风） */
    g: { path: '/indices', label: '索引工作区' },
};
/* App.vue 的 onKey 只要 path，保留原 GOTO_MAP 形状避免调用处改动 */
export const GOTO_MAP = Object.fromEntries(Object.entries(GOTO_TARGETS).map(([k, v]) => [k, v.path]));
