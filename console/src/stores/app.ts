import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, getTarget, setTargetId } from '../api';
import type { ClusterConnView } from '../api';
import type { IndexCat } from '../types';
import { friendlyEsError } from '../utils/esError';
import { copyText } from '../utils/format';
import { verLt } from '../utils/version';
import { readUrlHostTheme } from '../utils/hostTheme';
import type { HostThemeMode } from '../utils/hostTheme';

export const useAppStore = defineStore('app', () => {
  /* 索引 */
  const indices = ref<IndexCat[]>([]);
  const pickedIdx = ref<string>(localStorage.getItem('es_picked') || '');
  const loadingIndices = ref(false);
  const clusterOk = ref<boolean | null>(null);
  const clusterSelf = ref('');
  /* R72：真实集群健康色（green/yellow/red，空=未知）——侧栏底栏不再用「连接成功」冒充「集群正常」 */
  const clusterHealth = ref<string>('');
  const clusterUnassigned = ref(0);

  async function loadIndices() {
    await ensureSetup();
    // R39.2：宿主隐藏且尚未选中连接：不发数据面请求（后端会 403 HOST_DISABLED），保持未知态等引导
    if (!hostVisible.value && !target.value) {
      indices.value = [];
      clusterOk.value = null;
      clusterHealth.value = '';
      loadingIndices.value = false;
      return;
    }
    loadingIndices.value = true;
    try {
      const list = await api.clusterIndices();
      indices.value = Array.isArray(list) ? list : [];
      clusterOk.value = true;
      loadVersion(); // R42 §8.4：连接成功后顺带识别版本，供导航级能力降级标注
      api.overview().then(o => { clusterSelf.value = o?.self || ''; }).catch(() => {});
      api.clusterHealth().then((h: any) => {
        clusterHealth.value = h?.status || '';
        clusterUnassigned.value = Number(h?.unassigned_shards || 0);
      }).catch(() => { clusterHealth.value = ''; });
      if (pickedIdx.value && !indices.value.some(i => i.index === pickedIdx.value)) {
        // 保留 picked（可能是别名），不强制清空
      }
    } catch (e: any) {
      if (e?.status === 401) {
        // 未登录导致的 401：登录遮罩已在引导，不误报“集群连接失败”，保持未知态
        clusterOk.value = null;
      } else {
        clusterOk.value = false;
        clusterHealth.value = '';
        notify('error', '加载索引列表失败: ' + (e?.message || e));
      }
    } finally {
      loadingIndices.value = false;
    }
  }

  /* R61：最近工作索引（最多 8 个）——顶栏选择器与 ⌘K 置顶展示，大集群免翻找 */
  const RECENT_KEY = 'es_recent_idx';
  const recentIdx = ref<string[]>(loadRecent());
  function loadRecent(): string[] {
    try {
      const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
    } catch { return []; }
  }

  function pick(idx: string) {
    pickedIdx.value = idx;
    localStorage.setItem('es_picked', idx);
    if (idx) {
      recentIdx.value = [idx, ...recentIdx.value.filter(x => x !== idx)].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentIdx.value));
    }
  }

  const pickedInfo = computed(() => indices.value.find(i => i.index === pickedIdx.value));

  /* R36：多集群目标——''=宿主；非空= connId（api 层自动带 X-Es-Target 头）
     R38：列表已按登录角色过滤 minRole（低于档案门槛的连接后端直接不返回），并附 health 探活结果
     R39.2：hostVisible=false（纯管理平台形态）时切换器藏掉宿主项，无目标时自动映射首个可见连接 */
  const target = ref<string>(getTarget());
  const targetName = ref<string>(localStorage.getItem('es-console.target.name') || '');
  /* w45:双键撕裂自愈——id 与 name 是两个独立 localStorage 键,部分清理/异常可致
     「顶栏显示生产集群、实际请求不带 X-Es-Target(打宿主)」的撕裂态,这是用户
     「明明选了生产还报宿主侧错误」的系统性根源之一。恢复时以 id 为准,name 必须依附 id。 */
  if (!target.value && targetName.value) {
    targetName.value = '';
    try { localStorage.removeItem('es-console.target.name'); } catch { /* 忽略 */ }
  }
  const conns = ref<ClusterConnView[]>([]);
  const isRemote = computed(() => !!target.value);
  const hostVisible = ref(true);
  let setupPromise: Promise<void> | null = null;
  /* setup/status 免鉴权且启动期多处依赖：单飞行缓存，失败保持默认 true 零回归 */
  function ensureSetup(): Promise<void> {
    if (!setupPromise) {
      setupPromise = api.setup.status()
        .then(s => { hostVisible.value = s.hostVisible !== false; })
        .catch(() => {});
    }
    return setupPromise;
  }
  async function loadConns() {
    await ensureSetup();
    try { const list = await api.clustersList(); conns.value = Array.isArray(list) ? list : []; } catch { conns.value = []; }
    // 目标档案已被删：回落避免死绑不存在的 connId 全站报错（宿主隐藏时回落首个可见连接而非宿主）
    if (target.value && !conns.value.some(c => c.id === target.value)) {
      if (hostVisible.value) {
        setTarget('', '');
        notify('warning', '目标集群连接已删除，已切回宿主集群');
      } else {
        const first = conns.value[0];
        setTarget(first?.id || '', first?.name || '');
        notify('warning', first ? `目标集群连接已删除，已切到「${first.name}」` : '目标集群连接已删除，请先添加集群连接');
      }
    } else if (!hostVisible.value && !target.value && conns.value.length) {
      // R39.2 自动映射：宿主隐藏且未选目标，默认选中首个可见连接，免去手动切一次
      const first = conns.value[0];
      setTarget(first.id, first.name);
    }
  }
  function setTarget(id: string, name: string) {
    target.value = id;
    targetName.value = id ? name : '';
    setTargetId(id);
    localStorage.setItem('es-console.target.name', targetName.value);
    pick(''); // 切集群后旧 picked 索引大概率不存在，清空避免误导
    recentIdx.value = []; // R61：最近索引同理随集群失效，避免跨集群误导
    localStorage.removeItem(RECENT_KEY);
    esVersion.value = ''; // 版本随目标失效，等 loadIndices 成功后重新识别
    loadIndices();
  }

  /* R42 §8.4：当前目标集群的 ES 版本（如 7.10.1）——导航「需 x.x+」降级标注数据源。
     远端目标优先取连接档案里 R40 回写的版本；档案缺失或宿主目标则 GET / 识别；拿不到留空=不标注（有意降级） */
  const esVersion = ref<string>('');
  let verInflight: Promise<void> | null = null;
  function loadVersion(): Promise<void> {
    if (target.value) {
      const c = conns.value.find(x => x.id === target.value);
      const v = c?.esVersion || c?.health?.version;
      if (v) { esVersion.value = v; return Promise.resolve(); }
    }
    if (verInflight) return verInflight;
    /* 五百六十批：回落弃 raw 透传改 clusterHealth（后端顺带 version）——raw 是 ADMIN 域
       高危端点，版本识别每次开屏都落一条 HIGH_RISK「raw=GET /」刷审计流水（用户实报
       「只是打开页面就出现高危操作」）。共享端点 VIEWER 可读零审计噪声。 */
    verInflight = api.clusterHealth()
      .then((h: any) => {
        esVersion.value = h?.version || '';
      })
      .catch(() => { /* 版本识别失败不打扰用户，仅少了导航降级标注 */ })
      .finally(() => { verInflight = null; });
    return verInflight;
  }
  /** 当前版本低于 min（major.minor 比较）；版本未知时返回 false 不误标 */
  function verBelow(min: string): boolean {
    return !!esVersion.value && verLt(esVersion.value, min);
  }

  /* 通知（轻量事件，App.vue 用 naive notification 消费） */
  interface NotifyAction { label: string; onClick: () => void }
  interface NotifyItem { id: number; kind: 'success' | 'error' | 'warning' | 'info'; msg: string; action?: NotifyAction; actions?: NotifyAction[]; duration?: number }
  const notifyQueue = ref<NotifyItem[]>([]);
  let nid = 0;
  /* R85：toast 风暴抑制——轮询/重试场景同一错误连环弹（如服务重启期 inspect 连挂），
     右下角轰炸 + 通知历史刷屏都是垃圾体验。同 kind+文案在窗口期内只弹一次 toast，
     历史侧则聚合为一条 ×N（见 pushNotifyLog），信息不丢、噪音归零。 */
  const TOAST_DEDUP_MS = 8000;
  const lastToastAt = new Map<string, number>();
  function notify(kind: 'success' | 'error' | 'warning' | 'info', msg: string, opts?: { action?: NotifyAction; actions?: NotifyAction[]; duration?: number }) {
    /* 错误类消息全局友好化：ES 原始错误 JSON 提取 reason + 常见场景翻译 + 限长 */
    const shown = kind === 'error' ? friendlyEsError(msg) : msg;
    /* R46 + 二百四十六批动作数组化：友好化后原始错误不丢——自动附「复制原始」动作；
       调用方还可经 opts.actions 追加「跳转」类动作（如查询失败直达诊断页），
       单 action 入参保持兼容并并入数组头（渲染层见 App.vue toast-acts 多按钮） */
    const actions: NotifyAction[] = [...(opts?.actions ?? [])];
    if (opts?.action) actions.unshift(opts.action);
    if (kind === 'error' && shown !== msg && !actions.some(a => a.label === '复制原始')) {
      actions.push({ label: '复制原始', onClick: () => { copyText(msg).then(ok => { notify(ok ? 'success' : 'error', ok ? '原始错误已复制' : '复制失败：浏览器拦截了剪贴板'); }); } });
    }
    pushNotifyLog(kind, shown, actions.length ? actions.map(a => a.label) : undefined);
    /* 只抑制异常类：success/info 是用户主动操作的即时反馈（如连续复制），静音会误导“没生效” */
    if (kind === 'error' || kind === 'warning') {
      const dk = kind + '|' + shown;
      const now = Date.now();
      if ((now - (lastToastAt.get(dk) || 0)) < TOAST_DEDUP_MS) return; // 历史已聚合计数，toast 静音
      lastToastAt.set(dk, now);
    }
    notifyQueue.value.push({ id: ++nid, kind, msg: shown, action: actions[0], actions: actions.length > 1 ? actions : undefined, duration: opts?.duration });
  }
  function shiftNotify() { notifyQueue.value.shift(); }

  /* 五百三十批：慢请求可观测——api 层对 >10s 的成功请求广播 es-console:slow-request
     （事件桥与 unauthorized/setup-required 同范式，api 层不反依赖 store），此处转发
     既有 notify warning 档；同 path+文案的轮询重弹由 notify 内建 8s 去重吸收 */
  if (typeof window !== 'undefined') {
    window.addEventListener('es-console:slow-request', (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.path) notify('warning', `${d.path} 耗时 ${d.seconds}s`);
    });
  }

  /* R80：通知历史——toast 转瞬即逝，错过就永久丢失（尤其 R78/R79 的作业失败通知）。
     落 localStorage 跨刷新可回看；action 回调不可序列化，历史只留 kind/msg/ts */
  interface NotifyLogItem { kind: NotifyItem['kind']; msg: string; ts: number; count?: number; firstTs?: number;
    /** 三百一十六批：该通知的动作 label 清单（回调不可序列化；历史侧展示徽标提示错过了可操作按钮） */
    actions?: string[] }
  const NLOG_KEY = 'es-console.notify.log';
  const NSEEN_KEY = 'es-console.notify.seen';
  const NLOG_MAX = 50;
  const notifyLog = ref<NotifyLogItem[]>(loadNotifyLog());
  const notifySeenTs = ref(Number(localStorage.getItem(NSEEN_KEY) || 0));
  function loadNotifyLog(): NotifyLogItem[] {
    try { const a = JSON.parse(localStorage.getItem(NLOG_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function pushNotifyLog(kind: NotifyItem['kind'], msg: string, actionLabels?: string[]) {
    /* R85：连发同类消息聚合为一条 ×N——重试风暴不再刷穿 50 条历史，把真正有价值的通知挤丢 */
    const head = notifyLog.value[0];
    if (head && head.kind === kind && head.msg === msg) {
      head.count = (head.count || 1) + 1;
      head.firstTs = head.firstTs || head.ts; // R86：首见时间留住——风暴从何时开始、持续多久是排障关键线索
      head.ts = Date.now();
    } else {
      notifyLog.value.unshift({ kind, msg, ts: Date.now(), actions: actionLabels });
      if (notifyLog.value.length > NLOG_MAX) notifyLog.value.length = NLOG_MAX;
    }
    try { localStorage.setItem(NLOG_KEY, JSON.stringify(notifyLog.value)); } catch { /* 存储满容忍 */ }
  }
  /* 未读只计 error/warning：成功类不值得亮红点逼人点开 */
  const notifyUnread = computed(() => notifyLog.value.filter(n => n.ts > notifySeenTs.value && (n.kind === 'error' || n.kind === 'warning')).length);
  function markNotifySeen() {
    notifySeenTs.value = Date.now();
    try { localStorage.setItem(NSEEN_KEY, String(notifySeenTs.value)); } catch { /* 同上 */ }
  }
  function clearNotifyLog() {
    notifyLog.value = [];
    try { localStorage.removeItem(NLOG_KEY); } catch { /* 同上 */ }
  }

  /* 全局事件总线（轻量）：CmdPalette 动作 → 视图 */
  const eventBus = ref<{ name: string; payload?: any; ts: number }>({ name: '', ts: 0 });
  function emit(name: string, payload?: any) { eventBus.value = { name, payload, ts: Date.now() }; }

  /* R27：收藏夹（localStorage 持久化，跨会话恢复） */
  interface Favorite {
    id: string;
    kind: 'dsl' | 'rest' | 'route' | 'template';
    title: string;
    subtitle?: string;
    payload: any;
    ts: number;
    tags?: string[];
  }
  const FAV_KEY = 'es-console.favorites.v1';
  const favorites = ref<Favorite[]>(loadFav());
  function loadFav(): Favorite[] {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') as Favorite[]; }
    catch { return []; }
  }
  function saveFav() { localStorage.setItem(FAV_KEY, JSON.stringify(favorites.value)); }
  function addFavorite(f: Omit<Favorite, 'id' | 'ts'> & { id?: string }): Favorite {
    const id = f.id || `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const rec: Favorite = { id, ts: Date.now(), ...f };
    /* 幂等：同 kind + title 已存在则覆盖 */
    const idx = favorites.value.findIndex(x => x.kind === rec.kind && x.title === rec.title);
    if (idx >= 0) favorites.value.splice(idx, 1, rec);
    else favorites.value.unshift(rec);
    /* 上限 200 条 */
    if (favorites.value.length > 200) favorites.value.splice(200);
    saveFav();
    return rec;
  }
  function removeFavorite(id: string) {
    favorites.value = favorites.value.filter(x => x.id !== id);
    saveFav();
  }
  function clearFavorites() { favorites.value = []; saveFav(); }

  /* 2.5.0 宿主主题跟随：settings.theme 第四档 'host'（跟随宿主明暗）。
     hostTheme 初始值取 URL 参数（与 index.html 防闪脚本同源），非法/缺省钳回 dark——
     宿主未接入时按深色兜底，永不出现无主题裸奔。embedded 须先于 settings 声明（默认档判定引用它）。 */
  const hostTheme = ref<HostThemeMode>(readUrlHostTheme() ?? 'dark');
  const embedded = typeof window !== 'undefined' && window.parent !== window;

  /* 设置（持久化） */
  const settings = ref({
    histSize: Number(localStorage.getItem('es_hist_size') || 20),
    autoAgg: localStorage.getItem('es_auto_agg') !== '0',
    defaultLang: localStorage.getItem('es_code_lang') || 'curl',
    density: (localStorage.getItem('es_density') as 'comfortable' | 'compact') || 'comfortable',
    theme: (localStorage.getItem('es_theme') as 'dark' | 'light' | 'auto' | 'host')
      || (embedded ? 'host' : 'dark'),
    /* R66：侧栏形态 auto/on/off——auto 时按可用宽度自动折叠（iframe 内嵌宿主只有 ~866px，208px 侧栏吃掉 1/4 空间导致内容区处处截断），用户手动切换后固定其显式选择 */
    navCollapse: (localStorage.getItem('es_nav_collapse') as 'auto' | 'on' | 'off') || 'auto',
  });
  function applyDensity() {
    if (typeof document !== 'undefined') document.documentElement.dataset.density = settings.value.density;
  }
  applyDensity();

  /* 主题：dark/light/auto/host（auto 跟随系统 prefers-color-scheme；host 跟随宿主明暗，见上方 hostTheme） */
  const systemDark = ref(typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mm = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => { systemDark.value = e.matches; if (settings.value.theme === 'auto') applyTheme(); };
    mm.addEventListener?.('change', handler);
  }
  const effectiveTheme = computed<'dark' | 'light'>(() => {
    const t = settings.value.theme;
    if (t === 'host') return hostTheme.value;
    return t === 'auto' ? (systemDark.value ? 'dark' : 'light') : t;
  });
  function applyTheme() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = effectiveTheme.value;
    /* index.html 防白闪的 style 属性优先级高于样式表，热切换时必须同步改写，否则浅色下透出深底 */
    document.documentElement.style.background = effectiveTheme.value === 'light' ? '#f7f8fa' : '#0d0e12';
  }
  applyTheme();
  function setTheme(t: 'dark' | 'light' | 'auto' | 'host') {
    settings.value.theme = t;
    localStorage.setItem('es_theme', t);
    applyTheme();
  }
  function cycleTheme() {
    const order: ('dark' | 'light' | 'auto' | 'host')[] = ['dark', 'light', 'auto', 'host'];
    const i = order.indexOf(settings.value.theme);
    setTheme(order[(i + 1) % order.length]);
  }
  /* 宿主热切主题：仅当前档位为 host 时重应用——用户手切其他档即反超，宿主热推不再生效。
     非法值钳回 dark（与初始化同策略）。 */
  function setHostTheme(mode: string) {
    hostTheme.value = mode === 'light' ? 'light' : 'dark';
    if (settings.value.theme === 'host') applyTheme();
  }

  function saveSettings() {
    localStorage.setItem('es_hist_size', String(settings.value.histSize));
    localStorage.setItem('es_auto_agg', settings.value.autoAgg ? '1' : '0');
    localStorage.setItem('es_code_lang', settings.value.defaultLang);
    localStorage.setItem('es_density', settings.value.density);
    localStorage.setItem('es_theme', settings.value.theme);
    applyDensity();
    applyTheme();
  }
  function toggleDensity() {
    settings.value.density = settings.value.density === 'compact' ? 'comfortable' : 'compact';
    saveSettings();
  }

  /* R66：视口宽度（窄容器判定用）——iframe 内嵌时这就是 iframe 自身宽度 */
  const viewportW = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);
  if (typeof window !== 'undefined') {
    let rt: any = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { viewportW.value = window.innerWidth; }, 120);
    });
  }
  const narrow = computed(() => viewportW.value <= 1000);
  /* 侧栏是否图标态：显式选择优先，auto 跟随窄容器 */
  const navIcon = computed(() => {
    const m = settings.value.navCollapse;
    return m === 'on' ? true : m === 'off' ? false : narrow.value;
  });
  function toggleNav() {
    /* 从当前实际形态取反并固化，符合「我点了就该变」的直觉（不留 auto 反弹） */
    settings.value.navCollapse = navIcon.value ? 'off' : 'on';
    localStorage.setItem('es_nav_collapse', settings.value.navCollapse);
  }
  /* 二百三十八批：完全隐藏侧栏（dbx Mod+B 对位——查询/索引控制台全屏体验）。
     独立于图标折叠档：hidden 时侧栏整体移除，主区占满；持久化（dbx 同款跨会话记忆），
     TopBar 钮与 Mod+B 均可唤回。 */
  const navHidden = ref(localStorage.getItem('es_nav_hidden') === '1');
  function setNavHidden(v: boolean) {
    navHidden.value = v;
    localStorage.setItem('es_nav_hidden', v ? '1' : '0');
  }
  function toggleNavHidden() {
    setNavHidden(!navHidden.value);
  }

  return { indices, pickedIdx, recentIdx, pickedInfo, loadingIndices, clusterOk, clusterSelf, clusterHealth, clusterUnassigned, loadIndices, pick, notifyQueue, notify, shiftNotify, notifyLog, notifyUnread, markNotifySeen, clearNotifyLog, eventBus, emit, favorites, addFavorite, removeFavorite, clearFavorites, settings, saveSettings, toggleDensity, effectiveTheme, setTheme, cycleTheme, hostTheme, setHostTheme, target, targetName, conns, isRemote, hostVisible, loadConns, setTarget, esVersion, verBelow, viewportW, narrow, navIcon, toggleNav, navHidden, setNavHidden, toggleNavHidden };
});
