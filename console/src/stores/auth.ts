import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, setToken, clearToken, getToken } from '../api';
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

  /* 代际守卫：并发 probe（iframe 首探与宿主 token 重探）乱序完成时只认最新一代——
 无凭证 401 若晚于有凭证 200 回来，旧代 catch 会把已认出的身份清回 null（grantedPages 随之失守） */
  let probeSeq = 0;

  /** 启动探测：有 token 或后端放行则拉身份；401 由全局事件弹遮罩 */
  async function probe() {
    const seq = ++probeSeq;
    try {
      const m = await api.auth.me();
      if (seq !== probeSeq) return; // 已有更新一代在飞/完成，旧代结果丢弃
      me.value = m;
      // 认出身份即收遮罩：iframe 握手竞态下首次 probe 的 401 可能把遮罩顶出来，重探成功要能自愈
      if (me.value) showLogin.value = false;
    } catch {
      if (seq !== probeSeq) return;
      // 401 已由 api.ts 广播 es-console:unauthorized；404（auth 关闭）静默
      me.value = null;
    } finally {
      if (seq === probeSeq) probed.value = true;
    }
  }

  async function login(username: string, password: string) {
    const r = await api.auth.login(username, password);
    setToken(r.token);
    me.value = { username: r.username, role: r.role, fallback: r.fallback };
    showLogin.value = false;
    // 登录成功后补拉一次完整身份（含 hasAnyUser）
    probe();
    return r;
  }

  function logout() {
    clearToken();
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
    if (me.value == null || isAdmin()) return true;
    const gp = me.value.grantedPages;
    if (!Array.isArray(gp)) return true;
    if (!gp.some(g => g.startsWith('conn:'))) return true;
    return gp.some(g => g.startsWith('conn:' + connId + ':'));
  };
  const atLeastOperator = () => me.value?.role === 'ADMIN' || me.value?.role === 'OPERATOR';
  /* 能力门禁统一入口（镜像后端拦截器 rank 语义）——危险按钮「不展示」都走 can()，
 语义真源在 utils/capability.ts；安全边界始终在后端，这里是体验层防误点。
 分层兜底：me=null（后端未启用鉴权/身份未探测到）→ 全放行——无鉴权部署全功能可用的既有语义不破
 （有鉴权但未登录时整卡被 LoginOverlay 遮罩拦截，此放行不可达）；me 有值但 role 无法识别 →
 capability 内 fail-closed 按 VIEWER。 */
  const can = (cap: ConsoleCap) => me.value == null ? true : canCap(me.value.role, cap);
  const canAuditAll = () => me.value != null && canViewAllAudit(me.value.role);

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
    /* conn 模型下 host/缺省目标同样按 host 写键裁决，不能回落全局角色门。 */
    const prefix = 'conn:' + (targetId || 'host') + ':';
    return gp.some(g => g.startsWith(prefix + 'w:'));
  };
  const canWriteOn = (targetId: string | null | undefined): boolean => {
    if (isAdmin()) return true; /* 超管全局写权：不受连接写键缺失拖累 */
    const conn = connWriteResolved(targetId);
    if (conn !== null) return conn;
    return can('write');
  };

  /* 页面级连接感知门——conn 模型下「勾选即权限」，本页写键(conn:{tid}:w:{pageKey})
 在场即放行（镜像后端页面门 writeAllowed 精确键语义）；静态模型（grantedPages=null）与
 非连接上下文回落全局角色档 canCap；admin 是管理域（连接菜单无对应勾选项）不走连接分支。 */
  const canPage = (cap: ConsoleCap, pageKey: string, targetId: string | null | undefined) => {
    if (me.value == null) return true;
    if (isAdmin()) return true; /* 超管全局页面权：页面白名单/连接键不拖累 */
    const gp = me.value.grantedPages;
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    if (isConn && cap !== 'admin') {
      return gp!.includes('conn:' + (targetId || 'host') + ':w:' + pageKey);
    }
    return canCap(me.value.role, cap);
  };

  /* 端点级单一权限入口——用 me.pages 下发的 apiPrefixes 镜像后端 pageOf
 （最长前缀匹配→归属页），conn 模型按精确 conn:{tid}:w:{pageKey} 裁决；未命中（共享
 端点）按任意写键；静态模型回落 canCap；admin 管理域不走连接分支。视图只传按钮真实
 调用的端点路径，零 pageKey 硬编码（586 错位根治）。 */
  /* 963：与后端 ConsoleAuthInterceptor.isReadonlyPost 对齐——sql 关键词去尾斜杠（裸 /cluster/sql 也命中）；
     insight/settings-impact 为只读评估端点新增入册 */
  const READONLY_POST_KEYWORDS = ['/cluster/query', '/cluster/profile', '/cluster/count', '/cluster/search-dsl', '/cluster/search-raw', '/cluster/search-template', '/cluster/render-template', '/cluster/validate-query', '/cluster/explain-doc', '/cluster/allocation-explain', '/cluster/analyze', '/cluster/reindex-preview', '/cluster/sql', '/cluster/pit/', '/cluster/painless/execute', '/insight/settings-impact'];
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
    '/cluster/index-settings/update': ['index-settings', 'indices', 'optimizer'],
    '/cluster/reload-analyzers': ['analysis-settings', 'synonyms'],
    '/cluster/reroute': ['cluster-settings', 'diag'],
    '/cluster/scripts/put': ['search-templates', 'painless-lab'],
    '/cluster/scripts/delete': ['search-templates', 'painless-lab'],
    '/insight/actions/apply-index-settings': ['index-settings'],
  };
  const sharedWritePageKeys = (path: string): string[] | null => {
    let best: string[] | null = null;
    let bestLen = -1;
    for (const [frag, keys] of Object.entries(SHARED_WRITE_PAGE_KEYS)) {
      if (path.includes(frag) && frag.length > bestLen) { best = keys; bestLen = frag.length; }
    }
    return best;
  };
  const canEndpoint = (cap: ConsoleCap, method: string, path: string, targetId: string | null | undefined) => {
    if (me.value == null) return true;
    if (isAdmin()) return true; /* 超管全局端点权：与后端 ADMIN 页面门豁免镜像 */
    const gp = me.value.grantedPages;
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    if (!isConn) return canCap(me.value.role, cap);
    /* host/缺省目标同样走连接写键：conn 用户不得因未带目标头落回全局角色门写宿主；
       与后端 ConsoleAuthInterceptor 的 targetId=host 归一化同源。 */
    const tid = targetId || 'host';
    /* 963：只读 POST=清单命中 或 后端三条精确尾缀（index/query、index/system-query、探活 probe）——
       尾缀端点无页归属，误判写会走精确写键把读动作也拦掉 */
    if (method.toUpperCase() !== 'GET'
      && !READONLY_POST_KEYWORDS.some(kw => path.includes(kw))
      && !path.endsWith('/index/query') && !path.endsWith('/index/system-query') && !path.endsWith('/probe')) {
      /* 写语义：页命中→精确写键；共享→真实使用该端点的页面写键 */
      const pages = me.value.pages?.groups?.flatMap(g => g.pages) ?? [];
      let best: { key: string; len: number } | null = null;
      for (const p of pages) for (const pre of (p.apiPrefixes ?? [])) {
        const hit = pre.endsWith('/') ? path.startsWith(pre) : (path === pre || path.startsWith(pre + '/'));
        if (hit && pre.length > (best?.len ?? 0)) best = { key: p.key, len: pre.length };
      }
      if (best) return gp!.includes('conn:' + tid + ':w:' + best.key);
      /* 共享写：须持有真实使用该端点的页面写键；未登记共享写回落角色档（后端角色门） */
      const sharedPages = sharedWritePageKeys(path);
      if (sharedPages) return sharedPages.some(k => gp!.includes('conn:' + tid + ':w:' + k));
      return canCap(me.value.role, cap);
    }
    return true; /* 读请求：conn 模型页面门读键即过（与后端 effectivePages 语义一致） */
  };

  return { me, showLogin, probed, probe, login, logout, requireLogin, isAdmin, canSeeConn, atLeastOperator, grantedPages, can, canWriteOn, canPage, canEndpoint, connWriteResolved, canAuditAll };
});
