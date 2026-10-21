import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, setToken, clearToken, getToken, ioRecorder } from '../api';
import { canCap, canViewAllAudit, type ConsoleCap } from '../utils/capability';

/** 控制台鉴权状态 —— token 持久在 localStorage，身份内存态 */
export const useAuthStore = defineStore('auth', () => {
  /** 当前身份（null=未登录/未知）；delegated=宿主委托鉴权（凭证归宿主管，不可退出/改密）；
 * displayName/authSource/attributes= 身份档案（宿主真实姓名与来源，顶栏产品化展示） */
  const me = ref<{
    username: string; role: string; fallback: boolean; hasAnyUser?: boolean; delegated?: boolean;
    displayName?: string | null; authSource?: string; attributes?: Record<string, string>;
    grantedPages?: string[] | null; // 2.5.0 菜单 SPI：null=未启用 / []=全拒 / 非空=白名单
    pages?: { groups: { id: string; name: string; sort: number; pages: { key: string; name: string; route: string; minVer?: string; apiPrefixes?: string[] }[] }[] }; // 页面目录契约（安全中心页面目录）
  } | null>(null);
  /** 是否需要弹登录遮罩 */
  const showLogin = ref(false);
  /** 鉴权是否启用（后端关了 auth 时 me 探测 404/放行，遮罩永不弹） */
  const probed = ref(false);
  /** 探测到后端明确关闭鉴权（/auth/me 404）。用于区分「未探测完成」与「无鉴权部署」。 */
  const authDisabled = ref(false);

  /* 代际守卫：并发 probe（iframe 首探与宿主 token 重探）乱序完成时只认最新一代——
 无凭证 401 若晚于有凭证 200 回来，旧代 catch 会把已认出的身份清回 null（grantedPages 随之失守） */
  let probeSeq = 0;
  let probeRetry: ReturnType<typeof setTimeout> | null = null;
  let probeRetryDelay = 3000;
  /* 身份探测是否已启动：应用启动即置位。未启动=独立挂载/组件测试（无鉴权语义）；
     一旦启动，身份未确定前写门必须 fail-closed，不能把开屏竞态窗口当无鉴权。 */
  const probeStarted = ref(false);
  const clearProbeRetry = () => {
    if (probeRetry) { clearTimeout(probeRetry); probeRetry = null; }
  };

  /** 身份已确定：明确关闭鉴权（404）、已取得 me，或探测尚未启动。其余一律 fail-closed。 */
  const identityKnown = () => authDisabled.value || me.value != null || !probeStarted.value;
  /** 应用 setup 同步调用：子视图挂载前就进入“探测中”，关闭开屏 fail-open 窗口。 */
  const beginProbe = () => { probeStarted.value = true; };
  /** raw/管理域入口：ADMIN/无鉴权部署/独立挂载测试放行；探测中或探测失败一律关闭。 */
  const canAdminOps = () => authDisabled.value || isAdmin() || !probeStarted.value;

  /** 启动探测：有 token 或后端放行则拉身份；401 由全局事件弹遮罩 */
  async function probe() {
    probeStarted.value = true;
    const seq = ++probeSeq;
    clearProbeRetry();
    try {
      const m = await api.auth.me();
      if (seq !== probeSeq) return; // 已有更新一代在飞/完成，旧代结果丢弃
      me.value = m;
      authDisabled.value = false;
      probeRetryDelay = 3000;
      // 认出身份即收遮罩：iframe 握手竞态下首次 probe 的 401 可能把遮罩顶出来，重探成功要能自愈
      if (me.value) showLogin.value = false;
    } catch (e: any) {
      if (seq !== probeSeq) return;
      // 401 已由 api.ts 广播 es-console:unauthorized；404（auth 关闭）静默
      me.value = null;
      /* 只有明确 404 才视为「无鉴权部署」；401/网络失败一律按未授权处理，
         避免身份探测未完成时把写入口当无鉴权放行。 */
      authDisabled.value = e?.status === 404;
      /* 非 401/404 的瞬时失败（500/网络/超时）不能让有权限的人永久锁死：
         指数退避重探，身份一到即恢复；期间所有写门保持 fail-closed。 */
      if (!authDisabled.value && e?.status !== 401) {
        const delay = probeRetryDelay;
        probeRetryDelay = Math.min(probeRetryDelay * 2, 30000);
        probeRetry = setTimeout(() => {
          probeRetry = null;
          if (seq === probeSeq && me.value == null && !authDisabled.value) void probe();
        }, delay);
      }
    } finally {
      if (seq === probeSeq) probed.value = true;
    }
  }

  async function login(username: string, password: string) {
    const r = await api.auth.login(username, password);
    setToken(r.token);
    ioRecorder.clear(); /* 前一个会话的请求原文不得留给新登录用户 */
    me.value = { username: r.username, role: r.role, fallback: r.fallback };
    authDisabled.value = false;
    showLogin.value = false;
    // 登录成功后补拉一次完整身份（含 hasAnyUser）
    probe();
    return r;
  }

  function logout() {
    probeSeq++; /* 作废在飞/待重试的身份探测，避免退出后又被旧回包填回 me */
    clearProbeRetry();
    clearToken();
    ioRecorder.clear(); /* 请求原文（可能含连接口令）不得留给下一个登录用户 */
    me.value = null;
    showLogin.value = true;
  }

  function requireLogin() {
    showLogin.value = true; // 401 到达即弹（真失效场景必须弹）
    // 401 瞬时竞态自愈：本机有 token（宿主委托/本地登录态）时自动重探一次身份——
    // probe 成功即收遮罩；probe 仍 401 则遮罩保持。杜绝「token 已恢复但遮罩无人收回，
    // 透明拦截层挡死整页交互」的残留形态（托管重建 settings/mapping 不可编辑的真凶）。
    if (getToken()) void probe();
  }

  /** 2.5.0 页面级授权白名单（三态）。路由守卫 / SideNav 过滤 / App.vue 复核共用同一真源。 */
  const grantedPages = computed<readonly string[] | null>(() => {
    const gp = me.value?.grantedPages;
    return Array.isArray(gp) ? gp : null;
  });

  const isAdmin = () => me.value?.role === 'ADMIN';
  /* 连接元数据可见性：ADMIN/未启用鉴权/静态键模型看全部；conn 模型只看授权连接，防未授权连接名/host 外泄 */
  const canSeeConn = (connId: string): boolean => {
    if (!identityKnown()) return false; /* 探测中/探测失败：连接名也不外泄 */
    if (me.value == null || isAdmin()) return true;
    const gp = me.value.grantedPages;
    if (!Array.isArray(gp)) return true;
    if (gp.length === 0) return false; /* 空集=全拒：连连接名也不外泄 */
    /* 静态键是全局页授权（对所有连接生效），混入 conn 键时不能反过来把静态覆盖的连接藏掉 */
    if (gp.some(g => !g.startsWith('conn:'))) return true;
    return gp.some(g => g.startsWith('conn:' + connId + ':'));
  };
  /* 能力门禁统一入口（镜像后端拦截器 rank 语义）——危险按钮「不展示」都走 can()，
 语义真源在 utils/capability.ts；安全边界始终在后端，这里是体验层防误点。
 分层兜底：me=null（后端未启用鉴权/身份未探测到）→ 全放行——无鉴权部署全功能可用的既有语义不破
 （有鉴权但未登录时整卡被 LoginOverlay 遮罩拦截，此放行不可达）；me 有值但 role 无法识别 →
 capability 内 fail-closed 按 VIEWER。 */
  const can = (cap: ConsoleCap) => {
    if (!identityKnown()) return false;
    return me.value == null ? true : canCap(me.value.role, cap);
  };
  const canAuditAll = (targetId?: string | null) => me.value != null
    && canViewAllAudit(me.value.role) && canReadPage('security', targetId);
  /* 页面读可见性（不含角色档）：路由/菜单按页面 key 判可见，审计全量另叠 rank3。
     与后端 effectivePages 同口径：静态键全局、conn:{tid}: 键按目标、w: 键同可见。 */
  const canReadPage = (pageKey: string, targetId?: string | null) => {
    if (!identityKnown()) return false;
    if (me.value == null || isAdmin()) return true;
    const gp = me.value.grantedPages;
    if (!Array.isArray(gp)) return true;
    if (gp.length === 0) return false;
    /* system/config-drift 恒定执行在宿主；REST 写键可执行 DevTools 端点，页面入口同口径可见。 */
    const hostPage = pageKey === 'system' || pageKey === 'config-drift';
    const tid = hostPage
      ? 'host'
      : (!targetId || String(targetId).toLowerCase() === 'host' ? 'host' : targetId);
    return gp.includes(pageKey)
      || gp.includes('conn:' + tid + ':' + pageKey)
      || gp.includes('conn:' + tid + ':w:' + pageKey)
      || (pageKey === 'devtools' && gp.includes('conn:' + tid + ':w:rest'));
  };

  /* ·实报「同事被授予 qa 连接后仍无法操作数据」前端断点打通：
 连接级写授权镜像后端拦截器写门语义（conn 模型=连接授权最终裁决，跳过全局角色门）。
 三态解析：授权体系未启用（grantedPages=null）或该目标无 conn 键（静态键模型）→
 返回 null 走既有全局角色门；该目标存在 conn 键 → 写键 conn:{tid}:w:* 在场即裁决。
 grantedPages=null 时 any 前提不成立恒 false，与 pageAllowed(null)=全放行一致由
 调用方兜底。canWriteOn 与 can() 是「或」之外的精化：调用方按 target 决定用哪个门。 */
  const connWriteResolved = (targetId: string | null | undefined): boolean | null => {
    const gp = grantedPages.value;
    if (gp == null) return null;
    const isConn = gp.some(g => g.startsWith('conn:'));
    if (!isConn) return null;
    const tid = !targetId || String(targetId).toLowerCase() === 'host' ? 'host' : targetId;
    const prefix = 'conn:' + tid + ':';
    const hasConnWrite = gp.some(g => g.startsWith(prefix + 'w:'));
    /* 混合授权：静态页键仍是全局写授权（与后端 staticWriteAllowed 同口径），
       不能因任一 conn 读键把静态写入口整体判死。 */
    const hasStatic = gp.some(g => !g.startsWith('conn:'));
    if (!hasConnWrite && hasStatic) return null;
    return hasConnWrite;
  };
  const canWriteOn = (targetId: string | null | undefined): boolean => {
    if (!identityKnown()) return false; /* 身份未定：写入口不展示 */
    if (isAdmin()) return true; /* 超管全局写权：不受连接写键缺失拖累 */
    const gp = grantedPages.value;
    if (Array.isArray(gp) && gp.length === 0) return false; /* 空集=全拒 */
    const conn = connWriteResolved(targetId);
    if (conn !== null) return conn;
    /* 静态页面白名单：表格文档写走 shared 文档端点（search/indices/doc-diff/browser），
       未勾选任一归属页时后端 shared 写门会拒——前端不能只按角色显示编辑入口。 */
    if (Array.isArray(gp) && gp.length > 0) {
      return ['search', 'indices', 'doc-diff', 'browser'].some(p => gp.includes(p)) && can('write');
    }
    return can('write');
  };

  /* 页面级连接感知门——conn 模型下「勾选即权限」，本页写键(conn:{tid}:w:{pageKey})
 在场即放行（镜像后端页面门 writeAllowed 精确键语义）；静态模型（grantedPages=null）与
 非连接上下文回落全局角色档 canCap；admin 是管理域（连接菜单无对应勾选项）不走连接分支。 */
  const canPage = (cap: ConsoleCap, pageKey: string, targetId: string | null | undefined) => {
    if (!identityKnown()) return false;
    if (me.value == null) return true;
    if (isAdmin()) return true; /* 超管全局页面权：页面白名单/连接键不拖累 */
    const gp = me.value.grantedPages;
    if (Array.isArray(gp) && gp.length === 0) return false; /* 空集=全拒 */
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    if (isConn && cap !== 'admin') {
      const tid = !targetId || String(targetId).toLowerCase() === 'host' ? 'host' : targetId;
      /* 混合模型：conn 写键优先；静态页键回落到「可见 + 角色档」（后端同序）。 */
      return gp!.includes('conn:' + tid + ':w:' + pageKey)
        || (gp!.includes(pageKey) && canCap(me.value.role, cap));
    }
    /* 静态页面白名单：页面可见性 + 角色档双闸（后端页面门/角色门同序），
       不能只按角色放行而在点下去时才 403。 */
    if (Array.isArray(gp) && gp.length > 0) return gp.includes(pageKey) && canCap(me.value.role, cap);
    return canCap(me.value.role, cap);
  };

  /* 端点级单一权限入口——用 me.pages 下发的 apiPrefixes 镜像后端 pageOf
 （最长前缀匹配→归属页），conn 模型按精确 conn:{tid}:w:{pageKey} 裁决；未命中（共享
 端点）按任意写键；静态模型回落 canCap；admin 管理域不走连接分支。视图只传按钮真实
 调用的端点路径，零 pageKey 硬编码（586 错位根治）。 */
  /* 963：与后端 ConsoleAuthInterceptor.isReadonlyPost 对齐——sql 关键词去尾斜杠（裸 /cluster/sql 也命中）；
     insight/settings-impact 为只读评估端点新增入册 */
  /* painless/execute 不在列：可执行脚本按写档裁决（后端 READONLY_POST_KEYWORDS 同源） */
  const READONLY_POST_KEYWORDS = ['/cluster/query', '/cluster/profile', '/cluster/count', '/cluster/search-dsl', '/cluster/search-raw', '/cluster/search-template', '/cluster/render-template', '/cluster/validate-query', '/cluster/explain-doc', '/cluster/allocation-explain', '/cluster/analyze', '/cluster/reindex-preview', '/cluster/sql', '/cluster/pit/', '/insight/settings-impact'];
  /* 963：共享写端点 → 合法页面写键（与后端 ConsoleAuthInterceptor.SHARED_WRITE_PAGES 同源）。
     原先“任意写键”放行会让 optimizer 写键持有人删文档/取消任务/改 ILM 策略。 */
  const SHARED_WRITE_PAGE_KEYS: Record<string, string[]> = {
    '/cluster/doc/update': ['search', 'indices', 'doc-diff', 'browser'],
    '/cluster/doc': ['search', 'indices', 'doc-diff', 'browser'],
    '/cluster/update-document': ['search', 'indices', 'doc-diff', 'browser'],
    '/cluster/update-partial': ['search', 'indices', 'doc-diff', 'browser'],
    '/cluster/delete-by-id': ['search', 'indices'],
    '/cluster/delete-by-query': ['search', 'update-by-query'],
    '/cluster/tasks/cancel': ['tasks', 'task-tree'],
    '/cluster/ilm/policy': ['ilm'],
    '/cluster/ilm/move': ['ilm', 'lifecycle'],
    '/cluster/index-settings/update': ['index-settings', 'indices', 'optimizer'],
    '/cluster/reload-analyzers': ['analysis-settings', 'synonyms'],
    '/cluster/reroute': ['cluster-settings'],
    '/cluster/reroute/retry-failed': ['diag'],
    '/cluster/create-index': ['config-validator', 'indices'],
    '/cluster/alias-actions': ['aliases', 'config-validator'],
    '/cluster/scripts/put': ['search-templates', 'painless-lab'],
    '/cluster/scripts/delete': ['search-templates', 'painless-lab'],
    '/cluster/painless/execute': ['painless-lab'],
    '/cluster/devtools/execute': ['rest', 'devtools'],
    '/insight/actions/apply-index-settings': ['index-settings', 'indices', 'optimizer'],
  };
  const sharedWritePageKeys = (path: string): string[] | null => {
    const clean = String(path || '').split('?')[0].split('#')[0];
    let best: string[] | null = null;
    let bestLen = -1;
    for (const [frag, keys] of Object.entries(SHARED_WRITE_PAGE_KEYS)) {
      if (clean.includes(frag) && frag.length > bestLen) { best = keys; bestLen = frag.length; }
    }
    return best;
  };
  /* 共享读端点 → 归属页读键（与后端 SHARED_READ_PAGES 同源）。 */
  const SHARED_READ_PAGE_KEYS: Record<string, string[]> = {
    '/cluster/query': ['search', 'indices', 'analyzer-lab'],
    '/cluster/search-dsl': ['search', 'profile-flame', 'update-by-query'],
    '/cluster/search-template': ['search-templates'],
    '/cluster/search-raw': ['search', 'indices', 'browser', 'analyzer-lab', 'aliases', 'update-by-query', 'bulk', 'doc-diff', 'boost-tuner', 'rank-debug', 'score-explain', 'match-matrix', 'query-xray', 'profile-flame'],
    '/cluster/profile': ['search', 'indices'],
    '/cluster/count': ['search', 'indices'],
    '/cluster/explain-doc': ['rank-debug', 'search', 'indices'],
    '/cluster/validate-query': ['query-xray', 'search'],
    '/cluster/term-vectors': ['query-xray'],
    '/cluster/doc': ['search', 'indices', 'browser', 'doc-diff'],
    '/cluster/inspect': ['indices', 'mapping', 'search', 'config-validator', 'adhoc-rebuild'],
    '/cluster/ilm/explain': ['ilm', 'lifecycle'],
    '/cluster/ilm/policies': ['ilm', 'lifecycle'],
    '/cluster/templates': ['templates', 'templates-gallery'],
    '/cluster/shards': ['overview', 'indices', 'topology'],
    '/cluster/task-detail': ['tasks', 'task-tree', 'workspace'],
    '/cluster/remote-clusters': ['remote-clusters', 'workspace'],
    '/cluster/sql': ['search', 'workspace'],
    '/cluster/health-report': ['health-report', 'workspace'],
    '/insight/settings-impact': ['index-settings', 'optimizer'],
    '/monitor-metrics': ['overview', 'live'],
    '/monitor-history': ['overview', 'live'],
    '/monitor-alerts': ['overview', 'live'],
    '/ring-usage': ['overview', 'topology', 'live'],
    '/cluster/tasks': ['tasks', 'task-tree'],
    '/cluster/index-settings': ['index-settings', 'indices', 'optimizer'],
    '/cluster/index-settings-defaults': ['mapping', 'index-settings', 'indices', 'optimizer'],
    '/cluster/aliases': ['aliases', 'indices', 'browser'],
    '/cluster/scripts': ['painless-lab', 'search-templates'],
    '/cluster/mapping-detail': ['mapping', 'mapping-designer', 'indices', 'analyzer-lab', 'search', 'browser', 'doc-diff'],
    '/cluster/analysis-settings': ['analysis-settings', 'analyze', 'mapping', 'synonyms'],
    '/cluster/nodes-stats-brief': ['topology', 'overview', 'live'],
    '/cluster/shard-stores': ['topology', 'indices', 'overview'],
    '/cluster/analyze': ['analyze', 'analyzer-lab', 'analysis-settings'],
    '/es/index/keys': ['xmigrate'],
    '/desired-state': ['config-drift', 'adhoc-rebuild', 'indices', 'mapping'],
    '/mapping-reconcile/report': ['config-drift', 'indices', 'mapping'],
    '/progress': ['indices', 'update-by-query', 'reindex-advanced', 'search', 'tasks', 'task-tree', 'adhoc-rebuild'],
    '/xmigrate/progress': ['xmigrate'],
    '/internal/es/index/health': ['overview', 'diag', 'health-report'],
  };
  const sharedReadPageKeys = (path: string): string[] | null => {
    const clean = String(path || '').split('?')[0].split('#')[0];
    let best: string[] | null = null;
    let bestLen = -1;
    for (const [frag, keys] of Object.entries(SHARED_READ_PAGE_KEYS)) {
      if (clean.includes(frag) && frag.length > bestLen) { best = keys; bestLen = frag.length; }
    }
    return best;
  };
  /* 写端点角色档镜像（与后端 ConsoleAuthInterceptor 的 ADMIN/REBUILD/CLUSTER 关键词同源）。
     守卫只用于「请求发车前」拦截；漏项只会让守卫更宽松，有权限的人不会被误拦，
     后端 rank 门仍是最终边界。 */
  const ADMIN_WRITE_HINTS = ['/auth/users', '/cluster/raw', '/cluster/devtools/execute', '/setup/rebind', '/clusters/'];
  const OPS_WRITE_HINTS = [
    '/rebuild', '/first-migrate', '/full-reload', '/cleanup', '/abort',
    '/lock/release', '/force-merge', '/replicas',
    '/cluster/update-by-query', '/cluster/bulk', '/reindex-advanced',
    '/xmigrate/start', '/xmigrate/resume', '/xmigrate/abort',
    '/xmigrate/connect-check', '/xmigrate/fetch-config', '/xmigrate/resolve-preview', '/xmigrate/preflight',
    'adhoc-rebuild/start', 'adhoc-rebuild/abort', 'adhoc-rebuild/confirm-switch',
    '/cluster/delete-index', '/cluster/create-index', '/cluster/delete-by-id', '/cluster/delete-by-query',
    '/cluster/settings/put', '/cluster/reroute', '/cluster/reroute/retry-failed',
    '/cluster/alias-actions', '/cluster/rollover',
    '/cluster/templates/put', '/cluster/templates/delete', '/cluster/scripts/put', '/cluster/scripts/delete',
    '/cluster/snapshot/delete', '/cluster/snapshot/restore', '/cluster/snapshot/create',
    '/cluster/ilm/policy', '/cluster/ilm/move', '/cluster/ilm/start', '/cluster/ilm/stop', '/cluster/slm/execute',
    '/cluster/index-settings/update', '/cluster/update-settings',
    '/cluster/mapping-put', '/cluster/put-mapping', '/cluster/analysis-update',
    '/cluster/synonyms-upsert', '/cluster/reload-analyzers',
  ];
  const BOOTSTRAP_WRITE_HINTS = ['/auth/login', '/auth/logout', '/auth/change-password', '/setup/test', '/setup/apply'];
  const capForWritePath = (path: string): ConsoleCap => {
    if (ADMIN_WRITE_HINTS.some(h => path.includes(h))) return 'admin';
    if (OPS_WRITE_HINTS.some(h => path.includes(h))) return 'ops';
    return 'write';
  };
  /* 最长前缀匹配端点归属页（与后端 pageOf 同口径） */
  const pageOwnerOf = (path: string): string | null => {
    /* 查询串/锚点不参与归属判定：调用方可能把实际调用路径（含 ?index=）直接传进来 */
    const clean = String(path || '').split('?')[0].split('#')[0];
    const pages = me.value?.pages?.groups?.flatMap(g => g.pages) ?? [];
    let best: { key: string; len: number } | null = null;
    for (const p of pages) for (const pre of (p.apiPrefixes ?? [])) {
      const hit = pre.endsWith('/') ? clean.startsWith(pre) : (clean === pre || clean.startsWith(pre + '/'));
      if (hit && pre.length > (best?.len ?? 0)) best = { key: p.key, len: pre.length };
    }
    return best?.key ?? null;
  };
  /* 恒定作用于宿主集群的端点（镜像后端 isHostBoundPath）：
     只有 /cluster/**、/insight、config-lab/validate、迁移进度与 adhoc prepare/start 跟随目标；
     其余 provider/系统/概览读取都执行在宿主，授权目标必须按 host 判定。 */
  const isHostBoundPath = (path: string): boolean => {
    if (path.includes('/cluster/') || path.includes('/insight')
        || path.includes('/config-lab/validate') || path.endsWith('/internal/es/index/progress')
        || path.includes('/adhoc-rebuild/')) return false;
    if (path.includes('/monitor-metrics') || path.includes('/monitor-history')
        || path.includes('/monitor-alerts') || path.includes('/ring-usage')) return false;
    if (path.endsWith('/es/index/keys') || path.includes('/desired-state')
        || path.includes('/mapping-reconcile/report')) return false;
    if (path.includes('/clusters') || path.includes('/xmigrate/') || path.includes('/setup/')) return false;
    /* 本地账号管理是宿主控制面数据；审计流水仍按目标连接行级过滤。 */
    if (path.includes('/auth/')) return path.includes('/auth/users');
    return true;
  };
  const canEndpoint = (cap: ConsoleCap, method: string, path: string, targetId: string | null | undefined) => {
    if (!identityKnown()) return false;
    if (me.value == null) return true;
    if (isAdmin()) return true; /* 超管全局端点权：与后端 ADMIN 页面门豁免镜像 */
    const gp = me.value.grantedPages;
    if (Array.isArray(gp) && gp.length === 0) return false; /* 空集=全拒：与后端 isEmpty 分支同源 */
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    /* 静态页白名单：纯静态模型与「conn 键 + 静态键」混合模型都保留全局页授权。
       混合模型下静态写权 = 静态页键在场 + 角色档（后端 staticWriteAllowed 同语义）。 */
    const staticKeys = Array.isArray(gp) ? gp.filter(k => !k.startsWith('conn:')) : [];
    const staticPages = staticKeys.length > 0 ? new Set(staticKeys) : null;
    /* host/缺省目标同样走连接写键：conn 用户不得因未带目标头落回全局角色门写宿主；
       与后端 ConsoleAuthInterceptor 的 targetId=host 归一化同源。host-bound 端点强制 host。 */
    const cleanPath = String(path || '').split('?')[0].split('#')[0];
    const gateTarget = isHostBoundPath(cleanPath) ? 'host' : targetId;
    const tid = !gateTarget || String(gateTarget).toLowerCase() === 'host' ? 'host' : gateTarget;
    /* 963：只读 POST=清单命中 或 后端三条精确尾缀（index/query、index/system-query、探活 probe）——
       尾缀端点无页归属，误判写会走精确写键把读动作也拦掉 */
    const writeReq = method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD'
      && !READONLY_POST_KEYWORDS.some(kw => cleanPath.includes(kw))
      && !cleanPath.endsWith('/index/query') && !cleanPath.endsWith('/index/system-query') && !cleanPath.endsWith('/probe');
    if (writeReq) {
      /* 写语义：共享映射优先（多页合法复用的端点，任一归属页写键即放行）；
         未登记共享写再走页前缀精确写键。 */
      const sharedPages = sharedWritePageKeys(path);
      if (sharedPages) {
        if (isConn) return sharedPages.some(k => gp!.includes('conn:' + tid + ':w:' + k))
          || (!!staticPages && sharedPages.some(k => staticPages.has(k)) && canCap(me.value.role, cap));
        if (staticPages) return sharedPages.some(k => staticPages.has(k)) && canCap(me.value.role, cap);
        return canCap(me.value.role, cap);
      }
      const owner = pageOwnerOf(path);
      if (owner) {
        if (isConn) return gp!.includes('conn:' + tid + ':w:' + owner)
          || (!!staticPages && staticPages.has(owner) && canCap(me.value.role, cap));
        if (staticPages) return staticPages.has(owner) && canCap(me.value.role, cap);
        return canCap(me.value.role, cap);
      }
      /* 连接模型默认拒绝「无页面归属」的写端点：与后端未登记写默认拒绝同源，
         不能让未登记的端点回落全局角色档（否则 UI 会显示一个后端必 403 的入口）。
         混合模型有静态全局页授权时，按纯静态语义回落角色门（后端 hasStatic 同口径）。 */
      return isConn ? (staticPages ? canCap(me.value.role, cap) : false) : canCap(me.value.role, cap);
    }
    const sharedRead = sharedReadPageKeys(path);
    if (isConn) {
      /* conn 模型读也要过页面可见性：后端 effectivePages 先裁页面，再落到角色门。
         混入的静态键同样视为可见（后端 effectivePages 同口径；env 收缩在服务端执行）。 */
      const staticKeys = gp!.filter(k => !k.startsWith('conn:'));
      const visibleOn = (keys: string[]) => keys.some(k => staticKeys.includes(k)
        || gp!.includes('conn:' + tid + ':' + k) || gp!.includes('conn:' + tid + ':w:' + k));
      if (sharedRead) return visibleOn(sharedRead);
      const owner = pageOwnerOf(path);
      return owner == null ? true : visibleOn([owner]);
    }
    if (sharedRead) {
      if (staticPages) return sharedRead.some(k => staticPages.has(k));
      return true;
    }
    const owner = pageOwnerOf(path);
    if (staticPages && owner) return staticPages.has(owner);
    return true;
  };

  /**
   * API 层写门（api.request 在 fetch 前调用）：未授权写请求零发出。
   * 自助/引导写（登录/退出/改密/setup）与只读 POST 不拦；后端仍是最终边界。
   */
  const canEmitWrite = (method: string, path: string, targetId: string | null | undefined) => {
    const m = String(method || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
    const clean = String(path || '').split('?')[0].split('#')[0];
    if (BOOTSTRAP_WRITE_HINTS.some(h => clean.includes(h))) return true;
    /* 委派非 ADMIN 不得写本地账号（BuiltinConsoleAuthService 同口径）：客户端也不发车。 */
    if (clean.includes('/auth/users') && me.value?.delegated && !isAdmin()) return false;
    /* 与后端同源特例：托管重建向导「校验并继续」持 adhoc 写键即可调用
       config-lab/validate，不额外要求 config-validator 页。 */
    if (clean.endsWith('/config-lab/validate')
        && canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', targetId)) return true;
    return canEndpoint(capForWritePath(clean), m, clean, targetId);
  };

  return { me, showLogin, probed, authDisabled, probeStarted, beginProbe, canAdminOps, probe, login, logout, requireLogin, isAdmin, canSeeConn, grantedPages, can, canWriteOn, canPage, canEndpoint, canEmitWrite, canReadPage, canAuditAll };
});
