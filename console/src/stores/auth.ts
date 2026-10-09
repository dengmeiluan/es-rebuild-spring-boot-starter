import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, setToken, clearToken, getToken } from '../api';
import { canCap, canViewAllAudit, type ConsoleCap } from '../utils/capability';

/** R34：控制台鉴权状态 —— token 持久在 localStorage，身份内存态 */
export const useAuthStore = defineStore('auth', () => {
  /** 当前身份（null=未登录/未知）；delegated=宿主委托鉴权（R37，凭证归宿主管，不可退出/改密）；
   *  displayName/authSource/attributes=R63 身份档案（宿主真实姓名与来源，顶栏产品化展示） */
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
  const atLeastOperator = () => me.value?.role === 'ADMIN' || me.value?.role === 'OPERATOR';
  /* 二百二十批：能力门禁统一入口（镜像后端拦截器 rank 语义）——危险按钮「不展示」都走 can()，
     语义真源在 utils/capability.ts；安全边界始终在后端，这里是体验层防误点。
     分层兜底：me=null（后端未启用鉴权/身份未探测到）→ 全放行——无鉴权部署全功能可用的既有语义不破
     （有鉴权但未登录时整卡被 LoginOverlay 遮罩拦截，此放行不可达）；me 有值但 role 无法识别 →
     capability 内 fail-closed 按 VIEWER。 */
  const can = (cap: ConsoleCap) => me.value == null ? true : canCap(me.value.role, cap);
  const canAuditAll = () => me.value != null && canViewAllAudit(me.value.role);

  /* 五百六十三批·用户实报「同事被授予 qa 连接后仍无法操作数据」前端断点打通：
     连接级写授权镜像后端拦截器写门语义（conn 模型=连接授权最终裁决，跳过全局角色门）。
     三态解析：授权体系未启用（grantedPages=null）或该目标无 conn 键（静态键模型）→
     返回 null 走既有全局角色门；该目标存在 conn 键 → 写键 conn:{tid}:w:* 在场即裁决。
     grantedPages=null 时 any 前提不成立恒 false，与 pageAllowed(null)=全放行一致由
     调用方兜底。canWriteOn 与 can() 是「或」之外的精化：调用方按 target 决定用哪个门。 */
  const connWriteResolved = (targetId: string | null | undefined): boolean | null => {
    const gp = grantedPages.value;
    if (gp == null) return null;
    const tid = targetId || 'host';
    const prefix = 'conn:' + tid + ':';
    if (!gp.some(g => g.startsWith(prefix))) return null;
    return gp.some(g => g.startsWith(prefix + 'w:'));
  };
  const canWriteOn = (targetId: string | null | undefined): boolean => {
    const conn = connWriteResolved(targetId);
    if (conn !== null) return conn;
    return can('write');
  };

  /* 五百八十四批：页面级连接感知门——conn 模型下「勾选即权限」，本页写键(conn:{tid}:w:{pageKey})
     在场即放行（镜像后端页面门 writeAllowed 精确键语义）；静态模型（grantedPages=null）与
     非连接上下文回落全局角色档 canCap；admin 是管理域（连接菜单无对应勾选项）不走连接分支。 */
  const canPage = (cap: ConsoleCap, pageKey: string, targetId: string | null | undefined) => {
    if (me.value == null) return true;
    const gp = me.value.grantedPages;
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    if (isConn && targetId && cap !== 'admin') {
      return gp!.includes('conn:' + targetId + ':w:' + pageKey);
    }
    return canCap(me.value.role, cap);
  };

  /* 五百八十八批：端点级单一权限入口——用 me.pages 下发的 apiPrefixes 镜像后端 pageOf
     （最长前缀匹配→归属页），conn 模型按精确 conn:{tid}:w:{pageKey} 裁决；未命中（共享
     端点）按任意写键；静态模型回落 canCap；admin 管理域不走连接分支。视图只传按钮真实
     调用的端点路径，零 pageKey 硬编码（586 错位根治）。 */
  const READONLY_POST_KEYWORDS = ['/cluster/query', '/cluster/profile', '/cluster/count', '/cluster/search-dsl', '/cluster/search-raw', '/cluster/search-template', '/cluster/render-template', '/cluster/validate-query', '/cluster/explain-doc', '/cluster/allocation-explain', '/cluster/analyze', '/cluster/reindex-preview', '/cluster/sql/', '/cluster/pit/', '/cluster/painless/execute', '/xmigrate/connect-check', '/xmigrate/resolve-preview', '/xmigrate/fetch-config'];
  const canEndpoint = (cap: ConsoleCap, method: string, path: string, targetId: string | null | undefined) => {
    if (me.value == null) return true;
    const gp = me.value.grantedPages;
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    if (!(isConn && targetId)) return canCap(me.value.role, cap);
    if (method.toUpperCase() !== 'GET' && !READONLY_POST_KEYWORDS.some(kw => path.includes(kw))) {
      /* 写语义：页命中→精确写键；共享→任意写键 */
      const pages = me.value.pages?.groups?.flatMap(g => g.pages) ?? [];
      let best: { key: string; len: number } | null = null;
      for (const p of pages) for (const pre of (p.apiPrefixes ?? [])) {
        const hit = pre.endsWith('/') ? path.startsWith(pre) : (path === pre || path.startsWith(pre + '/'));
        if (hit && pre.length > (best?.len ?? 0)) best = { key: p.key, len: pre.length };
      }
      if (best) return gp!.includes('conn:' + targetId + ':w:' + best.key);
      return gp!.some(g => g.startsWith('conn:' + targetId + ':w:'));
    }
    return true; /* 读请求：conn 模型页面门读键即过（与后端 effectivePages 语义一致） */
  };

  return { me, showLogin, probed, probe, login, logout, requireLogin, isAdmin, atLeastOperator, grantedPages, can, canWriteOn, canPage, canEndpoint, connWriteResolved, canAuditAll };
});
