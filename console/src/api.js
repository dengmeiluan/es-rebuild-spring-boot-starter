/** API 层：fetch 封装 + 全部后端端点 */
import { parseJsonSafe, writeStoredRaw, removeStoredRaw } from './utils/safeJson';
/* 宿主可能配了 servlet context-path（如 宿主的 context-path）。
 console 固定挂在 {ctx}/console/ 下且路由是 hash 模式，pathname 不含页内路由，
 故从 pathname 截取 /console/ 之前的段即为 context-path（bond-basic 等无 ctx 宿主得 ''，行为不变）。 */
const CTX = (() => {
    const m = window.location.pathname.match(/^(.*?)\/console\//);
    return m ? m[1] : '';
})();
export const EP = `${CTX}/internal/es/index`;
const XB = `${CTX}/internal/es/xmigrate`;
/* ==================== ：控制台鉴权 token ==================== */
const TOKEN_KEY = 'es-console.auth.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t) => writeStoredRaw(localStorage, TOKEN_KEY, t);
export const clearToken = () => removeStoredRaw(localStorage, TOKEN_KEY);
/** 鉴权头（裸 fetch 场景复用，如 hotThreads） */
const authHeaders = () => {
    const t = getToken();
    return t ? { 'X-Es-Console-Token': t } : {};
};
/* ==================== ：宿主委托凭证（X-Es-Host-Token） ==================== */
/* iframe 嵌入场景：宿主页面 postMessage 下发宿主凭证，内存态（不落 localStorage，随页面生命周期）。
 带上后每个请求先走宿主委托鉴权（DelegatingConsoleAuthorizer），认出即免内置登录。 */
let hostToken = '';
export const setHostToken = (t) => { hostToken = t || ''; };
export const getHostToken = () => hostToken;
const hostHeaders = () => hostToken ? { 'X-Es-Host-Token': hostToken } : {};
/* ==================== ：多集群目标（X-Es-Target） ==================== */
/* 后端只对数据面（/cluster/**、/insight、/config-lab/validate）生效；控制面（鉴权/重建/连接管理）恒定宿主，全局带头无害 */
const TARGET_KEY = 'es-console.target';
export const getTarget = () => localStorage.getItem(TARGET_KEY) || '';
export const setTargetId = (id) => {
    if (id)
        writeStoredRaw(localStorage, TARGET_KEY, id);
    else
        removeStoredRaw(localStorage, TARGET_KEY);
};
const targetHeaders = () => {
    const t = getTarget();
    return t ? { 'X-Es-Target': t } : {};
};
/** xmigrate 专用目标覆盖：请求里的源连接与顶栏目标可能不同，空值沿用全局。 */
const xbTargetInit = (target) => target && target.trim() ? { headers: { 'X-Es-Target': target.trim() } } : undefined;
/* ==================== ：授权就绪门（iframe 嵌入形态） ====================
 连接模型用户（宿主委托）的页面门按 X-Es-Target 命中 conn:{id}:{page} 键判定——
 开屏竞态（身份 probe / 连接目录 loadConns / autoPickConnTarget 钉选三步未就绪）期间
 发出的裸请求=结构性 PAGE_DENIED（产线审计 81,572 条的两大主源之一：开屏爆发+轮询循环）。
 App.vue 在三步完成后 release 本门；未 release 前的内部请求在此等待（4s 兜底放行，
 宿主异常时最多延迟不满 4s，绝不死等）。豁免=身份/握手/连接目录自身（否则死锁）；
 独立部署（hostToken 空）恒直通零回归。 */
let authSettled = Promise.resolve();
let authSettledPending = false;
export function setAuthSettled(p) {
    authSettledPending = true;
    authSettled = p.finally(() => { authSettledPending = false; });
}
const AUTH_GATE_EXEMPT = ['/auth/me', '/auth/login', '/auth/logout', '/setup/', '/clusters'];
function authGateWait(path) {
    if (!authSettledPending || !hostToken)
        return null;
    if (AUTH_GATE_EXEMPT.some(x => path.includes(x)))
        return null;
    /* 4s 兜底：settleAuthChain 自身也有兜底，这里是双保险（等待方视角永不超 4s） */
    return Promise.race([authSettled, new Promise(r => setTimeout(r, 4000))]);
}
export class ApiError extends Error {
    constructor(status, message, code, endpoint, page, required, denied) {
        super(message);
        this.status = status;
        this.code = code;
        this.endpoint = endpoint;
        this.page = page;
        this.required = required;
        this.denied = denied;
    }
}
/* 请求超时兜底——fetch 原生无超时，网络黑洞（代理挂死/服务假死）会让 await 永等，
 Overview 骨架屏永挂就是这个病。默认 60s 宽松兜底（重建/快照等重操作不误伤）；
 超时抛可读 ApiError(408)，与调用方主动取消（AbortError， 轻提示路径）严格区分 */
const REQUEST_TIMEOUT_MS = 60000;
const TIMEOUT_REASON = Symbol('es-console.timeout');
/* 慢请求可观测——成功响应耗时超过该阈值经全局事件桥弹 warning。
 失败链路已有 error 通知，不重复打扰；快请求零输出 */
const SLOW_REQUEST_MS = 10000;
const IO_RING_MAX = 30;
const IO_RAW_MAX = 200 * 1024;
const ioRing = [];
let ioSeq = 0;
function redactIoBody(body) {
    if (!body)
        return body;
    const scrub = (v) => {
        if (Array.isArray(v))
            return v.map(scrub);
        if (v && typeof v === 'object') {
            const out = {};
            for (const [k, val] of Object.entries(v)) {
                out[k] = /password|passwd|secret|token|salt|authorization|api[_-]?key/i.test(k) ? '***' : scrub(val);
            }
            return out;
        }
        return v;
    };
    try {
        return JSON.stringify(scrub(JSON.parse(body)));
    }
    catch {
        return body;
    }
}
function recordIo(url, method, requestBody, status, ok, durationMs, responseRaw, kind) {
    try {
        const rec = { id: ++ioSeq, ts: Date.now(), method, url, requestBody: redactIoBody(requestBody), status, ok, durationMs: Math.round(durationMs), responseRaw };
        if (kind)
            rec.kind = kind;
        if (rec.responseRaw.length > IO_RAW_MAX) {
            rec.responseRaw = rec.responseRaw.slice(0, IO_RAW_MAX);
            rec.truncated = true;
        }
        ioRing.push(rec);
        if (ioRing.length > IO_RING_MAX)
            ioRing.splice(0, ioRing.length - IO_RING_MAX);
    }
    catch { /* 观测旁路：记录失败静默，绝不影响主流程 */ }
}
/** 原始 IO 快查（last(路径子串) 取该页最近一条（无参=全局最近）；
 双参 last(pathSub, kind)——kind 在场时二段过滤 r.kind === kind，
 未命中回 null 不回退（不回落未打标档；SqlConsole 执行链 'sql' 收口即此语义）。
 all() 新→旧全量；get(id) 精确取。恒返回拷贝（调用方改动不串环内对象）；
 clear() 供测试/调试清环。读路径同样全 try/catch（异常回 null/[]，不炸消费方）。 */
export const ioRecorder = {
    last(pathSub, kind) {
        try {
            for (let i = ioRing.length - 1; i >= 0; i--) {
                const r = ioRing[i];
                if (!pathSub || r.url.includes(pathSub)) {
                    if (kind != null && r.kind !== kind)
                        continue;
                    return { ...r };
                }
            }
            return null;
        }
        catch {
            return null;
        }
    },
    all() {
        try {
            return ioRing.slice().reverse().map(r => ({ ...r }));
        }
        catch {
            return [];
        }
    },
    get(id) {
        try {
            const r = ioRing.find(x => x.id === id);
            return r ? { ...r } : null;
        }
        catch {
            return null;
        }
    },
    clear() {
        try {
            ioRing.length = 0;
        }
        catch { /* noop */ }
    },
};
/** 组合信号：超时 + 调用方取消二合一；return.done 必须在 finally 里调，避免计时器/监听泄漏 */
function timeoutSignal(callerSignal, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(TIMEOUT_REASON), ms);
    const onAbort = () => ctl.abort(callerSignal.reason);
    if (callerSignal) {
        if (callerSignal.aborted)
            ctl.abort(callerSignal.reason);
        else
            callerSignal.addEventListener('abort', onAbort, { once: true });
    }
    return {
        signal: ctl.signal,
        isTimeout: () => ctl.signal.aborted && ctl.signal.reason === TIMEOUT_REASON,
        done: () => { clearTimeout(timer); callerSignal?.removeEventListener('abort', onAbort); },
    };
}
let apiWriteGuard = null;
export const setApiWriteGuard = (fn) => { apiWriteGuard = fn; };
async function request(path, init, base = EP) {
    /* 授权就绪门——宿主令牌在途且身份/目标未 settle 时先等（豁免端点与独立部署直通，
   token 快照必须在门后取：等待期间握手可能送达新凭证） */
    const gate = authGateWait(path);
    if (gate)
        await gate;
    const tokenAtRequest = getToken();
    const hostTokenAtRequest = hostToken;
    /* 慢请求计时起点——fetch 全程（含排队/响应体读取） */
    const startedAt = performance.now();
    /* init.headers 必须并入组合头而非整体覆盖——此前 ...init 在 headers 之后展开，
   显式带头的调用（如 sqlProbe 的 X-Es-Target）会把鉴权/Content-Type 全部冲掉导致 401 */
    /* ioKind 同 timeoutMs 形态——内部消费的打标通道（recordIo 第 8 参 →
   RawIoRec.kind），在此解构剥离，不进 fetch init（公开 fetch 语义零增量） */
    const { headers: extraHeaders, signal: callerSignal, timeoutMs, ioKind, ...restInit } = init || {};
    const ts = timeoutSignal(callerSignal, timeoutMs ?? REQUEST_TIMEOUT_MS);
    /* IO 记录前置提取（body 已由 post/put 序列化为字符串；此处只做安全转换，
   双层 try 兜底——提取抛错也只退空串，绝不给主流程新增抛点）。主记录点在响应体读出后、
   fetch 未及响应（超时/网络/取消）的记录点在其 catch。 */
    const ioMethod = (restInit.method || 'GET').toUpperCase();
    let ioBody = '';
    try {
        if (typeof restInit.body === 'string')
            ioBody = restInit.body;
        else if (restInit.body != null)
            ioBody = JSON.stringify(restInit.body) ?? String(restInit.body);
    }
    catch {
        try {
            ioBody = String(restInit.body);
        }
        catch {
            ioBody = '';
        }
    }
    let resp;
    const fetchMethod = (restInit.method || 'GET').toUpperCase();
    const mergedHeaders = {
        'Content-Type': 'application/json', ...authHeaders(), ...hostHeaders(), ...targetHeaders(),
        ...(extraHeaders || {}),
    };
    /* 写门在 fetch 前裁决：无权限时零网络请求（402/403 由后端兜底的安全边界之外，
       再做一层「请求根本没发出去」的确定性保证）。 */
    if (apiWriteGuard && fetchMethod !== 'GET' && fetchMethod !== 'HEAD' && fetchMethod !== 'OPTIONS') {
        const cleanBase = CTX && base.startsWith(CTX) ? base.slice(CTX.length) : base;
        const targetId = mergedHeaders['X-Es-Target'] || getTarget();
        if (!apiWriteGuard(fetchMethod, cleanBase + path, targetId)) {
            const message = '当前身份无权执行该写操作，请求已在客户端拦截';
            /* 与后端 403 走同一条全局通道：客户端拦截同样要能回答「缺什么」。 */
            window.dispatchEvent(new CustomEvent('es-console:forbidden', {
                detail: { path: cleanBase + path, method: fetchMethod, message, denied: 'CLIENT_WRITE_DENIED' },
            }));
            throw new ApiError(403, message, 'CLIENT_WRITE_DENIED');
        }
    }
    try {
        resp = await fetch(base + path, {
            ...restInit,
            headers: mergedHeaders,
            signal: ts.signal,
        });
    }
    catch (e) {
        /* 未及响应（超时/网络黑洞/调用方取消）也留痕（status=0），观测量，
     不触碰下方既有超时/取消分流 */
        try {
            recordIo(base + path, ioMethod, ioBody, 0, false, performance.now() - startedAt, String(e?.message || e), ioKind);
        }
        catch { /* 观测旁路静默 */ }
        /* 超时和用户取消都以 abort 形态抛出，靠 reason 分流：超时 → 可读错误；取消 → 原样上抛（ 语义不变） */
        if (ts.isTimeout())
            throw new ApiError(408, `请求超时（${((timeoutMs ?? REQUEST_TIMEOUT_MS) / 1000).toFixed(0)}s 无响应），请检查网络或服务状态后重试`);
        throw e;
    }
    finally {
        ts.done();
    }
    const text = await resp.text();
    let data = null;
    if (text) {
        /* 精度保真解析——19 位雪花 long（jobId/文档 ID）超 MAX_SAFE_INTEGER，
     原生 JSON.parse 解析瞬间尾数抹零，展示/复制/回写全链路失真 */
        try {
            data = parseJsonSafe(text);
        }
        catch {
            data = text;
        }
    }
    /* IO 记录主点——成功/失败全留痕，ok 语义=HTTP ok 且非 200+error 业务信封
   （与调用方拿到的成败一致）。置于业务分流之前：下方 401/409 广播、友好文案与
   ApiError 抛出路径零触碰（记录是旁路，任何异常静默吞掉） */
    /* 修正：costMs 只测一次—— 以 mockImplementationOnce 恰两桩
   performance.now 钉死计时面，记录点多取一拍会偷桩致慢请求广播失明；记录与慢广播共用同一测量 */
    const costMs = performance.now() - startedAt;
    try {
        recordIo(base + path, ioMethod, ioBody, resp.status, resp.ok && !(data && typeof data === 'object' && data.error === true), costMs, text || '', ioKind);
    }
    catch { /* 观测旁路静默 */ }
    if (!resp.ok) {
        // 401 且非登录接口本身 → 广播弹登录遮罩（LoginOverlay 监听）；
        // 若期间凭证已换新（内置 token 或宿主 hostToken 有一个变了），说明是旧凭证时代发出的过期请求，
        // 忽略避免把刚认出的身份又顶回遮罩（.2：iframe 握手与首次 probe 存在天然竞态）
        if (resp.status === 401 && !path.includes('/auth/login')
            && getToken() === tokenAtRequest && hostToken === hostTokenAtRequest) {
            window.dispatchEvent(new CustomEvent('es-console:unauthorized'));
        }
        // 控制台未绑定控制集群 → 广播弹首连向导（SetupWizard 监听）
        if (resp.status === 409 && data && data.code === 'SETUP_REQUIRED') {
            window.dispatchEvent(new CustomEvent('es-console:setup-required'));
        }
        // 集群级权限隔离/档案失效的统一友好文案（后端 code 见 EsTargetInterceptor / MigrateExceptionAdvice）
        let msg = (data && data.message) || text || `HTTP ${resp.status}`;
        if (data && data.code === 'CONN_FORBIDDEN') {
            msg = `当前角色无权访问该集群连接${data.required ? `（需 ${data.required} 及以上）` : ''}，请联系管理员调整连接的最低角色或切换其他集群目标`;
        }
        else if (data && data.code === 'CONN_NOT_FOUND') {
            msg = '目标集群连接不存在或已被删除，请在顶栏切换器重新选择';
        }
        /* code 随错误透传（友好文案特判照旧读 data.code，语义不丢）；
     endpoint 同透传（errPre「失败于 …」行消费，旧后端缺省不显）；
     403 另透传 page/required：全局错误通道与调用方用它回答「缺什么、找谁」。 */
        const denied = resp.status === 403 && data && typeof data === 'object'
            ? {
                page: typeof data.page === 'string' ? data.page : undefined,
                required: typeof data.required === 'string' ? data.required : undefined,
                denied: typeof data.code === 'string' ? data.code : undefined,
            }
            : null;
        const err = new ApiError(resp.status, msg, data && typeof data === 'object' ? data.code : undefined, data && typeof data === 'object' && typeof data.endpoint === 'string' ? data.endpoint : undefined, denied?.page, denied?.required, denied?.denied);
        /* 403 全局广播：各视图不必再各自发明「没权限」的说法。
           轮询型读请求由 app store 的通知去重兜住；写请求被客户端硬门拦下时走同一条通道。 */
        if (resp.status === 403) {
            window.dispatchEvent(new CustomEvent('es-console:forbidden', {
                detail: { path, method: fetchMethod, message: msg, ...(denied || {}) },
            }));
        }
        throw err;
    }
    if (data && typeof data === 'object' && data.error === true) {
        /* 200+error 信封同透传 code（LOCK_CONFLICT/ES_ERROR 多走此形态）； endpoint 同透传 */
        throw new ApiError(resp.status, data.message || '请求失败', data.code, typeof data.endpoint === 'string' ? data.endpoint : undefined);
    }
    /* 慢请求可观测——只在成功链路广播，由 app store 监听转发既有 notify
   warning 档（8s 同文去重内建）。事件桥与上方 unauthorized/setup-required 同范式：
   api 层不反依赖 pinia store（会成环），监听侧见 stores/app.ts */
    if (costMs > SLOW_REQUEST_MS) {
        window.dispatchEvent(new CustomEvent('es-console:slow-request', {
            detail: { path, seconds: +(costMs / 1000).toFixed(1) },
        }));
    }
    return data;
}
/* init 扩展通道：timeoutMs（ 超时）+ ioKind（打标，request 内部消费不进 fetch init） */
export const get = (path, base, init) => request(path, init, base);
export const post = (path, body, base, init) => request(path, { ...(init || {}), method: 'POST', ...(body == null ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }, base);
export const del = (path, base) => request(path, { method: 'DELETE' }, base);
export const put = (path, body, base) => request(path, { method: 'PUT', ...(body == null ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }, base);
const q = (params) => {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null)
        usp.set(k, String(v)); });
    return usp.toString();
};
export const api = {
    clusterHealth: () => get('/cluster/health'),
    /** 启动期 Mapping 对账报告(client 模式 runner 执行后的最近一轮逐索引结果) */
    mappingReconcileReport: () => get('/mapping-reconcile/report'),
    clusterIndices: () => get('/cluster/indices'),
    clusterInspect: (index, sampleSize = 5) => get(`/cluster/inspect?${q({ index, sampleSize })}`),
    /* date 字段实际存储形态采样。响应带 sampling 说明取样口径（random_score），
   展示时必须连同 sampled/sampling 一起给，否则读者会把有限样本当成全量结论。
   forms 值域是 number，samples 是分开的另一棵树——求和时不会把样例数组加进计数 */
    dateForms: (index, size = 50) => get(`/cluster/date-forms?${q({ index, size })}`),
    /* settings 含集群默认值（include_defaults 只读透传，VIEWER 可用） */
    indexSettingsDefaults: (index) => get(`/cluster/index-settings-defaults?${q({ index })}`),
    overview: () => get('/overview'),
    health: () => get('/health'),
    keys: () => get('/keys'),
    /* 多集群连接管理（永远作用于宿主，列表脱敏无密码）
   档案增 minRole（最低可见角色）/独立超时；health 为最近探活结果；probe 手动即时探活 */
    clustersList: () => get('/clusters'),
    clustersSave: (c) => post('/clusters/save', c),
    clustersDelete: (id) => post(`/clusters/delete?${q({ id })}`),
    clustersTest: (c) => post('/clusters/test', c),
    clustersProbe: (id) => post(`/clusters/${encodeURIComponent(id)}/probe`),
    /* 连接中心自动同步:状态报告 / 手动触发一轮(均 ADMIN;引擎未装配时 GET 回空) */
    clustersSyncStatus: () => get('/clusters/sync'),
    clustersSyncRun: () => post('/clusters/sync/run'),
    /* R7 服务端告警（GET /monitor-alerts，VIEWER 只读；timestamp 降序，recovered:true=恢复事件） */
    /* 最新 Top 索引快照（对标阿里云 Index 索引行）：{index,qps,idxRate,storeMb}×≤8 */
    /* 后端 top-indexes 按集群实名过滤（connName），不是连接 ID——传错参数会退化成全集群 */
    monitorTopIndexes: (connName, limit) => get(`/monitor-metrics/top-indexes?${q({ connName, limit })}`),
    monitorAlerts: (size = 50, fromMs, toMs) => get(`/monitor-alerts?${q({ size, fromMs, toMs })}`),
    /* 集群监控历史趋势(GET /monitor-metrics,VIEWER 只读;scope=cluster 多集群叠加;
   ? 分隔符显式——q() 不带前导 ?,缺失曾致 404 monitor-historyfromMs=...)
   interval 可选降采样档(如 '5m'):带上=ES date_histogram 降采样桶(timestamp 升序/桶距恒定/
   断档时段为空值字段——前端剔点+断档断线消费),缺省=原始逐点记录(现状行为不变) */
    monitorMetrics: (p) => get(`/monitor-metrics?${q(p)}`),
    /* R6 环形治理用量(只读):审计+监控两族 store.size 合计/分族/上限——30GB 口径看得见 */
    ringUsage: () => get('/ring-usage'),
    /* 监控快照落库批④:多集群监控历史(GET /monitor-history,VIEWER 只读;overview 页 apiPrefixes) */
    monitorHistory: (p) => get(`/monitor-history?${q(p)}`),
    /* 查询（可选 AbortSignal——长查询可取消，不再只能干等） */
    clusterQuery: (index, dsl, size = 20, signal) => post(`/cluster/query?${q({ index, size })}`, dsl, undefined, signal ? { signal } : undefined),
    profile: (index, dsl, signal) => post(`/cluster/profile?${q({ index })}`, dsl, undefined, signal ? { signal } : undefined),
    count: (index, dsl) => post(`/cluster/count?${q({ index })}`, dsl),
    raw: (method, path, body, signal) => post('/cluster/raw', { method, path, body: body || '' }, undefined, signal ? { signal } : undefined),
    /* DevTools 独立执行端点（devtools 页写键或 rest 写键；执行内核/守卫与 raw 同源） */
    devtoolsExecute: (method, path, body, signal) => post('/cluster/devtools/execute', { method, path, body: body || '' }, undefined, signal ? { signal } : undefined),
    sql: (sql, signal) => post('/cluster/sql', sql, undefined, signal ? { signal } : undefined),
    /* 文档操作 */
    deleteById: (index, id) => post(`/cluster/delete-by-id?${q({ index, id })}`),
    updateDocument: (index, id, doc) => post(`/cluster/update-document?${q({ index, id })}`, doc),
    updatePartial: (index, id, partial) => post(`/cluster/update-partial?${q({ index, id })}`, partial),
    /* 索引管理 */
    putMapping: (index, mapping) => post(`/cluster/put-mapping?${q({ index })}`, mapping),
    updateSettings: (index, settings) => post(`/cluster/update-settings?${q({ index })}`, settings),
    createIndex: (index, settings, mapping) => post(`/cluster/create-index?${q({ index })}`, { settings, mapping }),
    deleteIndex: (index) => post(`/cluster/delete-index?${q({ index })}`),
    forceMerge: (indexKey, maxSegments = 1) => post(`/force-merge?${q({ indexKey, maxSegments })}`),
    /* 任意集群索引/别名的 force_merge（受管索引仍走上面的 forceMerge）。重操作，调用点须二次确认。 */
    clusterForceMerge: (index, maxSegments = 1) => post(`/cluster/force-merge?${q({ index, maxSegments })}`),
    updateReplicas: (indexKey, count) => post(`/replicas?${q({ indexKey, count })}`),
    /* 重建作业（-13：SPI 驱动的编排端点整条退役，仅存只读状态与手工触发） */
    status: (indexKey) => get(`/status?${q({ indexKey })}`),
    rebuildEmpty: (indexKey, triggerReload = false) => post(`/rebuild-empty?${q({ indexKey, triggerReload })}`),
    progress: (taskId) => get(`/progress?${q({ taskId })}`),
    /* 系统索引 */
    systemInspect: (which) => get(`/system-inspect?${q({ which })}`),
    systemQuery: (which, dsl, size = 20) => post(`/system-query?${q({ which, size })}`, dsl),
    /* 集群运维观测（tasks / allocation / hot threads / pending / nodes stats / analyze / aliases）*/
    clusterTasks: (actions, detailed = true) => get(`/cluster/tasks?${q({ actions, detailed })}`),
    cancelTask: (taskId) => post(`/cluster/tasks/cancel?${q({ taskId })}`),
    allocationExplain: (body) => post('/cluster/allocation-explain', body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))),
    /* 裸 fetch 补 recordIo 两点式（545 记录环覆盖 request() 全量端点后，
   hotThreads 是最后漏网）——响应读出后记真实 status（成功/HTTP 失败同点）；
   fetch 未及响应（网络黑洞/中断）在拒绝分支记 status=0。then(onOk,onFail) 双参形态保证
   onOk 内抛出的 ApiError 不进 onFail（不重复记账）；返回原文串/ApiError/原样上抛契约逐字不动 */
    hotThreads: (threads = 3, interval = '500ms', type = 'cpu', nodeId) => {
        const url = `${EP}/cluster/hot-threads?${q({ threads, interval, type, nodeId })}`;
        const startedAt = performance.now();
        return fetch(url, { headers: { ...authHeaders(), ...hostHeaders(), ...targetHeaders() } }).then(async (r) => {
            const txt = await r.text();
            try {
                recordIo(url, 'GET', '', r.status, r.ok, performance.now() - startedAt, txt);
            }
            catch { /* 观测旁路静默 */ }
            if (!r.ok)
                throw new ApiError(r.status, txt || `HTTP ${r.status}`);
            return txt;
        }, (e) => {
            try {
                recordIo(url, 'GET', '', 0, false, performance.now() - startedAt, String(e?.message || e));
            }
            catch { /* 观测旁路静默 */ }
            throw e;
        });
    },
    pendingTasks: () => get('/cluster/pending-tasks'),
    nodesStats: () => get('/cluster/nodes-stats'),
    analyze: (index, body) => post(`/cluster/analyze?${q({ index })}`, typeof body === 'string' ? body : JSON.stringify(body)),
    aliases: () => get('/cluster/aliases'),
    /* 平台/分布式能力（templates / snapshot / shards distribution） */
    templates: () => get('/cluster/templates'),
    putTemplate: (name, kind, body) => post(`/cluster/templates/put?${q({ name, kind })}`, body),
    deleteTemplate: (name, kind) => post(`/cluster/templates/delete?${q({ name, kind })}`),
    snapshotRepos: () => get('/cluster/snapshot/repos'),
    snapshotList: (repo) => get(`/cluster/snapshot/list?${q({ repo })}`),
    snapshotCreate: (repo, name, body) => post(`/cluster/snapshot/create?${q({ repo, name })}`, body),
    snapshotRestore: (repo, name, body) => post(`/cluster/snapshot/restore?${q({ repo, name })}`, body),
    snapshotDelete: (repo, name) => del(`/cluster/snapshot/delete?${q({ repo, name })}`),
    shards: (index) => get(`/cluster/shards?${q({ index })}`),
    /* 深度产品化 - 搜索沙盒 / 热更新 setting / reroute / ILM */
    searchDsl: (index, body, opts = {}, signal) => post(`/cluster/search-dsl?${q({ index, explain: opts.explain, profile: opts.profile })}`, body, undefined, signal ? { signal } : undefined),
    indexSettings: (index) => get(`/cluster/index-settings?${q({ index })}`),
    updateIndexSettings: (index, body) => post(`/cluster/index-settings/update?${q({ index })}`, body),
    reroute: (body, opts = {}) => post(`/cluster/reroute?${q({ dryRun: opts.dryRun, explain: opts.explain ?? true, retryFailed: opts.retryFailed })}`, body),
    /* 诊断页专用：固定 retry_failed=true，不接受任意 reroute commands。 */
    rerouteRetryFailed: () => post('/cluster/reroute/retry-failed', undefined),
    ilmPolicies: () => get('/cluster/ilm/policies'),
    ilmPolicyPut: (name, body) => put(`/cluster/ilm/policy?${q({ name })}`, body),
    ilmPolicyDelete: (name) => del(`/cluster/ilm/policy?${q({ name })}`),
    ilmExplain: (index) => get(`/cluster/ilm/explain?${q({ index })}`),
    /* 集群设置 / 任务详情 / Snapshot Status / Reindex Preview */
    clusterSettings: () => get('/cluster/settings'),
    putClusterSettings: (body) => post('/cluster/settings/put', body),
    snapshotStatus: (repo, name) => get(`/cluster/snapshot/status?${q({ repo, name })}`),
    /* 同端点 summary=true 分支（SnapshotStatusSummary 契约见上）——
   快照列表对 IN_PROGRESS 行的行内进度数据源；既有 snapshotStatus 行为不动 */
    snapshotStatusSummary: (repo, name) => get(`/cluster/snapshot/status?${q({ repo, name, summary: true })}`),
    taskDetail: (taskId) => get(`/cluster/task-detail?${q({ taskId })}`),
    reindexPreview: (source, query, signal) => post(`/cluster/reindex-preview?${q({ source })}`, query, undefined, signal ? { signal } : undefined),
    /* 一键体检 */
    healthReport: () => get('/cluster/health-report'),
    /* 分布式运维 - SLM / Watcher / Remote Clusters */
    slmPolicies: () => get('/cluster/slm/policies'),
    slmExecute: (policyId) => post(`/cluster/slm/execute?${q({ policyId })}`, undefined),
    slmStatus: () => get('/cluster/slm/status'),
    watcherList: () => get('/cluster/watcher'),
    remoteClusters: () => get('/cluster/remote-clusters'),
    /* ➕：高级 Reindex — 自定义目标集群 / 自由 body / 全参数开放 */
    reindexAdvanced: (body, opts = {}) => post(`/cluster/reindex-advanced?${q(opts)}`, body),
    /* 分布式自定义 - 批量编辑 / SQL / 文档直编 */
    updateByQuery: (index, body, opts = {}) => post(`/cluster/update-by-query?${q({ index, ...opts })}`, body),
    deleteByQuery: (index, body, opts = {}) => post(`/cluster/delete-by-query?${q({ index, ...opts })}`, body),
    bulk: (ndjson, opts = {}) => post(`/cluster/bulk?${q(opts)}`, ndjson),
    /* 'sql' 打标（ioKind 通道）——SqlConsole 执行链（query/lenient/cursor/close）
   落账 kind='sql'，供宿主 ioRecorder.last('/cluster/sql/', 'sql') 双参收口（SqlConsole 546
   all().find 补丁退役）；translate 未打标=天然排除（546 排 translate 语义等价）。其余调用点
   本次只开通道不打标（clusterQuery 等，避免面铺开，消费侧按需补）。 */
    sqlJson: (body, signal) => post('/cluster/sql/query', body, undefined, { ...(signal ? { signal } : undefined), ioKind: 'sql' }),
    sqlTranslate: (body) => post('/cluster/sql/translate', body),
    sqlCursor: (cursor) => post(`/cluster/sql/cursor?${q({ cursor })}`, undefined, undefined, { ioKind: 'sql' }),
    sqlClose: (cursor) => post(`/cluster/sql/close?${q({ cursor })}`, undefined, undefined, { ioKind: 'sql' }),
    getDoc: (index, id) => get(`/cluster/doc?${q({ index, id })}`),
    putDoc: (index, id, body, refresh) => post(`/cluster/doc?${q({ index, id, refresh })}`, body),
    updateDoc: (index, id, body, refresh) => post(`/cluster/doc/update?${q({ index, id, refresh })}`, body),
    /* 深度产品化 —— painless / scripts / rollover / ILM ops / nodes stats brief */
    painlessExecute: (body) => post('/cluster/painless/execute', body),
    listStoredScripts: () => get('/cluster/scripts'),
    putStoredScript: (id, body) => post(`/cluster/scripts/put?${q({ id })}`, body),
    deleteStoredScript: (id) => post(`/cluster/scripts/delete?${q({ id })}`),
    rolloverAlias: (alias, body, dryRun = false) => post(`/cluster/rollover?${q({ alias, dryRun })}`, body),
    ilmMove: (index, body) => post(`/cluster/ilm/move?${q({ index })}`, body),
    ilmStart: () => post('/cluster/ilm/start', undefined),
    ilmStop: () => post('/cluster/ilm/stop', undefined),
    ilmStatus: () => get('/cluster/ilm/status'),
    nodesStatsBrief: () => get('/cluster/nodes-stats-brief'),
    /* 查询能力全通道 Query Bridge —— SQL 宽容 / Lucene / PIT / schema 探测 */
    sqlLenient: (body, signal) => post('/cluster/sql/lenient', body, undefined, { ...(signal ? { signal } : undefined), ioKind: 'sql' }),
    /* SQL 能力探测（显式指定 target 头，不跟随全局切换器）——降级面板「找可用集群」用 */
    sqlProbe: (targetId) => request('/cluster/sql/lenient', {
        method: 'POST', body: JSON.stringify({ query: 'SELECT 1', fetch_size: 1 }),
        headers: targetId ? { 'X-Es-Target': targetId } : { 'X-Es-Target': 'host' },
    }),
    luceneSearch: (index, qs, size = 100, from = 0, sortField, sortOrder, signal) => get(`/cluster/lucene-search?${q({ index, q: qs, size, from, sortField, sortOrder })}`, undefined, signal ? { signal } : undefined),
    pitOpen: (index, keepAlive = '5m') => post(`/cluster/pit/open?${q({ index, keepAlive })}`, undefined),
    pitSearch: (body) => post('/cluster/pit/search', body),
    pitClose: (pitId) => post(`/cluster/pit/close?${q({ pitId })}`, undefined),
    resolveSchema: (index) => get(`/cluster/resolve-schema?${q({ index })}`),
    /* 索引运维中枢 —— mapping / analysis / synonyms / plugins */
    mappingDetail: (index) => get(`/cluster/mapping-detail?${q({ index })}`),
    mappingPut: (index, body) => post(`/cluster/mapping-put?${q({ index })}`, body),
    analysisSettings: (index) => get(`/cluster/analysis-settings?${q({ index })}`),
    analysisUpdate: (index, body) => post(`/cluster/analysis-update?${q({ index })}`, body),
    analyzeText: (index, body) => post(`/cluster/analyze?${q({ index })}`, body),
    reloadAnalyzers: (index) => post(`/cluster/reload-analyzers?${q({ index })}`, undefined),
    pluginsMatrix: () => get('/cluster/plugins'),
    synonymsUpsert: (index, filter, expand, entries) => post(`/cluster/synonyms-upsert?${q({ index, filter, expand })}`, JSON.stringify(entries)),
    /* 相关性打分实验室 —— explain / validate / termvectors / search 透传 */
    searchRaw: (index, body) => post(`/cluster/search-raw?${q({ index })}`, body),
    explainDoc: (index, id, body) => post(`/cluster/explain-doc?${q({ index, id })}`, body),
    validateQuery: (index, body) => post(`/cluster/validate-query?${q({ index })}`, body),
    termVectors: (index, id, fields) => get(`/cluster/term-vectors?${q({ index, id, fields })}`),
    /* 搜索模板中心 + 别名管控台 —— render/search template · _aliases 原子操作 */
    renderTemplate: (body) => post('/cluster/render-template', body),
    searchTemplate: (index, body) => post(`/cluster/search-template?${q({ index })}`, body),
    aliasActions: (body) => post('/cluster/alias-actions', body),
    /* 控制台鉴权 —— 登录/自助/用户管理/操作审计 */
    auth: {
        login: (username, password) => post('/auth/login', { username, password }),
        /* 登出让服务端吊销当前令牌（尽力而为：调用方吞错，不阻塞本地登出） */
        logout: () => post('/auth/logout'),
        me: () => get('/auth/me'),
        /* 我的权限面：当前身份 × 目标连接的逐页读/写判定 + raw 档 + 共享写档（后端判定与拦截器同源） */
        permissions: (target) => get(`/auth/permissions?${q({ target })}`),
        changePassword: (oldPassword, newPassword) => post('/auth/change-password', { oldPassword, newPassword }),
        users: () => get('/auth/users'),
        upsertUser: (username, password, role) => post('/auth/users/upsert', { username, password, role }),
        deleteUser: (username) => post(`/auth/users/delete?${q({ username })}`),
        /* since=毫秒 epoch 时间范围下推（服务端 range 过滤,可查全量历史）。
     R9 全栈优化轮：connName 集群筛选下推（后端 16 参端点；缺省省略不过滤）。
     uriPrefix 前缀下推补通（ 前端输入挂了但通道缺失的死输入接活） */
        opsAudit: (username, action, size = 100, from = 0, since, connName, uriPrefix, minCostMs, fromMs, toMs) => get(`/auth/ops-audit?${q({ username, action, size, from, since, connName, uriPrefix, minCostMs, fromMs, toMs })}`),
        /* 自助流水——username 服务端强制=当前身份（VIEWER+），非审计角色看「我做了什么」 */
        /* 集群维度下推（观察口径按集群）——自助面也可按集群过滤 */
        opsAuditMine: (action, size = 50, from = 0, since, connName) => get(`/auth/ops-audit/mine?${q({ action, size, from, since, connName })}`),
        /* 值建议：审计索引 terms agg（动作/集群真实出现值+计数，失败回空=回落硬编码词表）。
     users 维度（ by_user 聚合）；：uris 维度（by_uri 真实 Top URI，供前缀筛选兜建议） */
        auditFacets: () => get('/auth/audit-facets'),
    },
    /* 控制集群首连向导 —— status 免鉴权，test/apply 仅未绑定开放，rebind 走 ADMIN 高危 */
    setup: {
        status: () => get('/setup/status'),
        /* 可选首连令牌：配置 es.rebuild.console.setup-token 后未绑定窗口必须携带（防匿名绑定）。 */
        test: (c, setupToken) => post('/setup/test', c, undefined, setupToken ? { headers: { 'X-Setup-Token': setupToken } } : undefined),
        apply: (c, setupToken) => post('/setup/apply', c, undefined, setupToken ? { headers: { 'X-Setup-Token': setupToken } } : undefined),
        rebind: (c) => post('/setup/rebind', c),
    },
    /* Adhoc 托管重建（无 provider，作用于任意逻辑索引名） */
    adhoc: {
        prepare: (index) => get(`/adhoc-rebuild/prepare?${q({ index })}`),
        start: (req) => post('/adhoc-rebuild/start', req),
        status: (jobId) => get(`/adhoc-rebuild/status?${q({ jobId })}`),
        abort: (jobId) => post(`/adhoc-rebuild/abort?${q({ jobId })}`),
        /* 人工放行切换门（仅对 pauseBeforeSwitch=true 的作业有效，见 InternalAdhocRebuildController:63） */
        confirmSwitch: (jobId) => post(`/adhoc-rebuild/confirm-switch?${q({ jobId })}`),
        jobs: () => get('/adhoc-rebuild/jobs'),
    },
    /* 配置实验室 —— settings/mapping 三层校验（L1 Lint / L2 Dry-run / L3 Advisor）+ 配置漂移检测 */
    configLab: {
        validate: (settings, mapping, dryRun) => post('/config-lab/validate', { settings, mapping, dryRun }),
        driftKeys: () => get('/config-lab/drift/keys'),
        drift: (indexKey) => get(`/config-lab/drift?${q({ indexKey })}`),
    },
    /* 现场内嵌智能 + 护栏动作协议（estimate→dry-run→confirmToken→execute→回执） */
    insight: {
        settingsImpact: (index, changes) => post('/insight/settings-impact', { index, changes }),
        estimate: (actionId, params) => post(`/insight/actions/${actionId}/estimate`, params),
        dryRun: (actionId, params) => post(`/insight/actions/${actionId}/dry-run`, params),
        execute: (actionId, params, confirmToken) => post(`/insight/actions/${actionId}/execute`, { params, confirmToken }),
    },
    /* 跨集群迁移（XB 前缀）——对齐 CrossClusterMigrateController
   connId/srcConnId 引用已存连接档案（服务端取密，明文不经前端；角色低于档案 minRole 回 403） */
    xb: {
        /* 迁移端点按源连接判定页面写键：显式携带 X-Es-Target=源连接档案，
           不能沿用顶栏目标（源≠顶栏时会被页面门误拒）。 */
        jobs: (limit = 20, target) => get(`/jobs?${q({ limit })}`, XB, xbTargetInit(target)),
        /* 目标索引补全专用：迁移写入端（宿主）索引清单——恒宿主控制面，别用跟随 X-Es-Target 的 clusterIndices */
        destIndices: () => get('/dest-indices', XB, xbTargetInit('host')),
        progress: (jobId, target) => get(`/progress?${q({ jobId })}`, XB, xbTargetInit(target)),
        start: (req, target) => post('/start', req, XB, xbTargetInit(target)),
        preflight: (req, target) => post('/preflight', req, XB, xbTargetInit(target)),
        connectCheck: (conn, connId) => post(connId ? `/connect-check?${q({ connId })}` : '/connect-check', conn ?? {}, XB, xbTargetInit(connId)),
        resolvePreview: (conn) => post('/resolve-preview', conn, XB),
        fetchConfig: (conn, sourceIndex, connId) => post(`/fetch-config?${q({ sourceIndex, connId })}`, conn ?? {}, XB, xbTargetInit(connId)),
        resume: (jobId, conn, connId) => post(`/resume?${q({ jobId, connId })}`, conn ?? {}, XB, xbTargetInit(connId)),
        abort: (jobId, target) => post(`/abort?${q({ jobId })}`, undefined, XB, xbTargetInit(target)),
    },
};
