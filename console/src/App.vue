<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides" style="height:100%">
    <n-notification-provider placement="bottom-right">
      <n-message-provider>
        <n-dialog-provider>
          <NotifyConsumer />
          <div class="route-bar ind-bar" :class="{ on: routeLoading }"></div>
          <div class="layout" :class="{ 'side-hidden': store.navHidden }">
            <SideNav v-if="!store.navHidden" />
            <div class="main">
              <TopBar ref="topBarRef" @open-palette="paletteOpen = true" />
              <div v-if="store.clusterOk === false" class="cluster-banner">
                <AlertTriangle :size="13" />
                <span>集群连接失败，部分功能不可用</span>
                <button class="btn sm ghost" @click="store.loadIndices()">重试连接</button>
              </div>
              <div v-else-if="store.isRemote && hostOnlyRoute" class="cluster-banner warn">
                <AlertTriangle :size="13" />
                <span>此功能恒定作用于<b>宿主集群</b>，与当前所选目标「{{ store.targetName }}」无关</span>
              </div>
              <!-- R39.2：纯管理平台形态未选目标：引导横幅（数据面请求已在 store 层短路，不会报错刷屏） -->
              <div v-else-if="!store.hostVisible && !store.isRemote" class="cluster-banner info">
                <AlertTriangle :size="13" />
                <span>尚未选择集群连接，请在顶栏切换器中选择或添加目标集群</span>
              </div>
              <div class="page scroll-y" :class="{ 'page-wide': pageWide }">
                <!-- 页面在后台（document.hidden）时 rAF 被冻结，out-in 过渡会永久卡在旧视图——后台时直接无过渡切换 -->
                <!-- R40：key 带上数据面目标，切集群即整页重挂载，所有视图 onMounted 按新目标重拉，杀死旧集群残留数据 -->
                <!-- KeepAlive 白名单：重状态页（查询工作台/数据浏览器等）侧栏切页不再清空现场——
                     「切 tab 就清空」顽疾的根因即路由级无保活；名单外页面维持原样即换即重挂。
                     被保活页的深链预填必须同时提供 onActivated 消费（见 QueryHubView） -->
                <router-view v-slot="{ Component }">
                  <!-- R124: 移除 route 级 transition(fade out-in)。Vue 3.5 的 Transition+KeepAlive
                       组合在「白名单外组件卸载」的切换序列下过渡状态机死锁：旧视图已卸载、新视图
                       永不挂载，页面整页空白（真机 7789 复现：索引工作区→概览→切回，稳定复现；
                       duration 硬超时不解——卡点不在 transitionend 等待而在 hooks 时序）。
                       fade 仅 140ms 透明度装饰，代价是整页空白级事故，直接移除；页面级过渡
                       交由各视图自身的骨架屏/ind-bar 承担。 -->
                  <keep-alive :include="KEEP_ALIVE_VIEWS" :max="12">
                    <component :is="Component" :key="route.path + '@' + store.target" />
                  </keep-alive>
                </router-view>
              </div>
            </div>
          </div>
          <CmdPalette v-model:show="paletteOpen" />
          <!-- R42 §8.1：全局确认服务唯一宿主，视图侧 await askConfirm() 即可，原生 confirm() 全站禁用 -->
          <ConfirmModal
            :show="confirmState.show" :title="confirmState.title" :message="confirmState.message"
            :level="confirmState.level" :guard-text="confirmState.guardText" :ok-text="confirmState.okText"
            :facts="confirmState.facts"
            @confirm="resolveConfirm(true)" @update:show="v => !v && resolveConfirm(false)" />
          <WelcomeWizard ref="wizardRef" />
          <LoginOverlay />
          <SetupWizard />
          <!-- R92-D3：分组快捷键速查面板（? 开关）。R93-13：goto 登记表已迁至 utils/hotkeys.ts，
               面板由该表渲染，不再是需要手工同步的第二份数据 -->
          <HotkeyPanel :show="helpOpen" @close="helpOpen = false" />
        </n-dialog-provider>
      </n-message-provider>
    </n-notification-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, h, defineComponent, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NConfigProvider, NNotificationProvider, NMessageProvider, NDialogProvider,
  darkTheme, useNotification, type GlobalThemeOverrides,
} from 'naive-ui';
import { AlertTriangle } from 'lucide-vue-next';
import SideNav from './components/SideNav.vue';
import TopBar from './components/TopBar.vue';
import CmdPalette from './components/CmdPalette.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import HotkeyPanel from './components/HotkeyPanel.vue';
import { confirmState, resolveConfirm } from './composables/confirm';
import WelcomeWizard from './components/WelcomeWizard.vue';
import LoginOverlay from './components/LoginOverlay.vue';
import SetupWizard from './components/SetupWizard.vue';
import { NAV_ITEMS, pageDeniedRedirect } from './router';
import { GOTO_MAP } from './utils/hotkeys';
import { readLastRoute, saveLastRoute, restorable } from './composables/continuity';
import { useAppStore } from './stores/app';
import { useAuthStore } from './stores/auth';
import { useLiveMonitorStore } from './stores/liveMonitor';
import { useJobTrackerStore } from './stores/jobTracker';

/* 路由级 KeepAlive 白名单（= SFC 文件名）：这些页的查询结果/交互现场在侧栏切页后保留。
   只收「重状态、重挂载代价高」的页；其余页面保持即换即重挂（数据新鲜度优先）。
   新增页面入名单前，先确认其深链预填在 onActivated 下仍可消费。 */
const KEEP_ALIVE_VIEWS = [
  'QueryHubView',    // 查询工作台六模式容器（内部已有二级 KeepAlive）
  'BrowserView',     // 数据浏览器
  'DevToolsView',    // 开发者工具
  'WorkspaceView',   // 工作台
  'PitScrollView',   // PIT 分页（长任务现场）
  'IndexHubView',    // R124: 索引工作区（列表筛选/滚动/tab 现场，重挂即丢）
];
import { setHostToken, getHostToken, setAuthSettled } from './api';

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const auth = useAuthStore();
const mon = useLiveMonitorStore();
const jt = useJobTrackerStore();
const paletteOpen = ref(false);
const topBarRef = ref<any>(null);
const helpOpen = ref(false);
const wizardRef = ref<any>(null);

/* R26：监听事件总线，open-wizard 时开启欢迎面板 */
watch(() => store.eventBus, (ev) => {
  if (ev?.name === 'open-wizard') wizardRef.value?.open?.();
  /* 一百一十一批：命令面板「键盘速查」命令——鼠标用户直达速查面板（? 键之外的可发现入口） */
  if (ev?.name === 'open-hotkeys') helpOpen.value = true;
  /* 一百一十三批：命令面板关闭后焦点归还触发钮（键盘用户 Esc 后不悬空） */
  if (ev?.name === 'palette-closed') topBarRef.value?.focusPaletteBtn?.();
});

/* R77：采样器在「已登录 + 集群可达」后全局启动，不再要求先进过大屏——
   顶栏告警徽标与趋势窗口从进站即开始累积；非大屏页自动降到背景频率（见 stores/liveMonitor）。
   条件缺一不启动：未登录会 401 刷屏，未选目标数据面请求本就被短路。 */
watch(() => store.clusterOk === true && !auth.showLogin, (ready) => {
  if (ready) mon.start();
}, { immediate: true });

/* R78：作业跟踪器同样全局常驻——长耗时重建/迁移跑完不再要求守着页面，
   顶栏随时可见进度、终态自动弹通知。作业端点恒在宿主控制面，只要登录成功就能跟，
   不等 clusterOk（数据面目标不可达时作业照样在跑，这时候更需要看得见）。 */
watch(() => !auth.showLogin && auth.probed, (ready) => {
  if (ready) jt.start();
}, { immediate: true });

/* R36：宿主专属视图集合——这些页面的后端端点不在 /cluster/** 数据面，切了远程目标也不生效
   R41 缺陷 A 修复：/config-validator 移出——validate Dry-run 已纳入数据面跟随目标，
   且该页「导入现有索引」「建索引」本就走 /cluster/**，横幅宣称恒定宿主是错误且危险的
   target-aware adhoc：/adhoc-rebuild 移出——prepare/start 已是数据面入口，重建作用于当前选中集群 */
/* xmigrate 摘出（2026-08-22）：页面自带源集群选择器（srcConnId），「恒定作用于宿主、与所选目标无关」的横幅对它是误导——迁移写宿主的语义由页内源/目标展示自说明 */
/* 一百八十九批：/security、/system 移出——纯宿主管理页（账号/审计/系统索引）的数据
   天然与数据面目标无关，横幅=每进一次页面就被「警告」一次的噪音；宿主语义改由
   页面副标题自述（信息保留、噪音消除）。
   /config-drift 保留：目标选「生产」时用户会以为在比对生产配置，实际在宿主——
   这里的横幅是真实防呆（误解成本高），不是噪音 */
const HOST_ONLY = new Set(['/config-drift', '/system']);
const hostOnlyRoute = computed(() => HOST_ONLY.has(route.path));

/* 超宽屏（≥1920）数据密集页豁免居中——路由 meta.wide 由 router.ts WIDE_ROUTES 逐条枚举
   （查询工作台/索引工作区/重建迁移/开发者工具/表格观测页）。用户实报 2000px 视口下
   查询工作台被压成 ~40% 居中窄列，结果区被顶出视口，豁免后吃满可用宽。 */
const pageWide = computed(() => route.meta.wide === true);

/* Naive 主题跟随应用主题（light 时传 null） */
const naiveTheme = computed(() => store.effectiveTheme === 'light' ? null : darkTheme);

/* 组件级质感（两套主题共享）：弹窗大圆角+标题层级、输入聚焦品牌光环——对齐 .inp/.card 的自维基座 */
const componentOverrides: GlobalThemeOverrides = {
  Card: { borderRadius: '12px', titleFontSizeMedium: '14px', titleFontWeight: '650' },
  Dialog: { borderRadius: '12px' },
  Input: { boxShadowFocus: 'var(--focus-ring)' },
  Tooltip: { borderRadius: '8px' },
  /* 下拉菜单（索引选择器等）：圆角+悬浮层阴影对齐 --shadow-pop，选项行高噪点降噪 */
  Popover: { borderRadius: '10px' },
  InternalSelectMenu: { borderRadius: '10px' },
};

/* 与 theme.css --fs-md 同源（13px＝卡头/区块标题档）——naive 主题覆盖需要 px 字面量
   （不认 CSS var），抽常量保证 light/dark 两套覆盖不漂移 */
const NAIVE_FONT_SIZE = '13px';

/* Light 主题覆盖（只改 primary、字体、圆角，背景交给 naive default light） */
const lightOverrides: GlobalThemeOverrides = {
  ...componentOverrides,
  common: {
    primaryColor: '#0d9488', primaryColorHover: '#14b8a6', primaryColorPressed: '#0f766e', primaryColorSuppl: '#14b8a6',
    borderRadius: '6px', borderRadiusSmall: '4px', fontSize: NAIVE_FONT_SIZE,
    fontFamily: '"Inter Variable", "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontFamilyMono: '"JetBrains Mono Variable", "JetBrains Mono", Consolas, monospace',
    successColor: '#059669', warningColor: '#b45309', errorColor: '#dc2626', infoColor: '#2563eb',
  },
};

/* 路由切换顶部细进度条 */
const routeLoading = ref(false);
let rbTimer: any = null;
router.beforeEach(() => { routeLoading.value = true; clearTimeout(rbTimer); return true; });
router.afterEach(() => { rbTimer = setTimeout(() => (routeLoading.value = false), 260); });

/* R61：工作现场恢复——进站前先读存量（afterEach 会覆盖），裸进站时 toast 提供一键回 */
const entryHash = location.hash;
const lastRoute = readLastRoute();
router.afterEach((to) => { saveLastRoute(to.fullPath); });

/* 标签页后台时禁用路由过渡（rAF 冻结会卡死 out-in 切换） */
const themeOverrides = computed<GlobalThemeOverrides>(() => store.effectiveTheme === 'light' ? lightOverrides : darkOverrides);
const darkOverrides: GlobalThemeOverrides = {
  ...componentOverrides,
  common: {
    primaryColor: '#14b8a6',
    primaryColorHover: '#2dd4bf',
    primaryColorPressed: '#0d9488',
    primaryColorSuppl: '#2dd4bf',
    borderRadius: '6px',
    borderRadiusSmall: '4px',
    fontSize: NAIVE_FONT_SIZE,
    fontFamily: '"Inter Variable", "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontFamilyMono: '"JetBrains Mono Variable", "JetBrains Mono", Consolas, monospace',
    /* R130: 与 theme.css 青调中性阶逐项同步（此前是蓝灰旧值，弹层与页面底色色温不一致） */
    bodyColor: '#0c1213',
    cardColor: '#111819',
    modalColor: '#131a1b',
    popoverColor: '#172224',
    inputColor: '#142021',
    actionColor: '#172224',
    borderColor: 'rgba(200, 240, 235, .14)',
    dividerColor: 'rgba(200, 240, 235, .09)',
    textColorBase: '#e2eeea',
    textColor1: '#e2eeea',
    /* 同步 theme.css --tx1（青调次文本，对比 7:1） */
    textColor2: '#a8beb8',
    textColor3: '#6f8b83',
    hoverColor: '#1e2c2e',
    tableColor: '#111819',
    tableColorHover: '#172224',
    successColor: '#34d399',
    warningColor: '#fbbf24',
    errorColor: '#f87171',
    infoColor: '#60a5fa',
  },
};

/* 通知消费组件（必须在 provider 内） */
const NotifyConsumer = defineComponent({
  setup() {
    const notification = useNotification();
    /* 三百七十八批：toast 屏幕阅读器播报通道——naive-ui notification 源码零 aria/role，
       视觉 toast 对读屏用户完全静默；error 走 assertive 即时打断，其余 polite。 */
    const ariaPolite = ref('');
    const ariaAssertive = ref('');
    watch(
      () => store.notifyQueue[0],
      (item) => {
        if (!item) return;
        if (item.kind === 'error') { ariaAssertive.value = item.msg; ariaPolite.value = ''; }
        else { ariaPolite.value = item.msg; ariaAssertive.value = ''; }
        const opts: any = {
          content: item.msg,
          duration: item.duration ?? (item.kind === 'error' ? 6000 : 3000),
        };
        /* 二百四十六批：动作数组渲染（toast-acts 多按钮）——错误 toast 可同时给
           「查看诊断」跳转与「复制原始」取全文；旧单 action 字段保持兼容 */
        const acts = item.actions?.length ? item.actions : item.action ? [item.action] : [];
        if (acts.length) {
          opts.action = () => h('div', { class: 'toast-acts' }, acts.map((a: any) => h('button', {
            class: 'toast-undo',
            onClick: () => { a.onClick(); }
          }, a.label)));
        }
        notification[item.kind](opts);
        store.shiftNotify();
      },
      { immediate: true }
    );
    /* 三百七十八批：不能用 display:none（aria-live 对隐藏元素静默），走 sr-only 视觉隐藏 */
    return () => h('div', { class: 'sr-only' }, [
      h('div', { role: 'status', 'aria-live': 'polite' }, ariaPolite.value),
      h('div', { role: 'alert', 'aria-live': 'assertive' }, ariaAssertive.value),
    ]);
  },
});

/* 全局快捷键：1-0 切页、g+字母 开零式 goto（输入框内不触发）。
   R93-13：GOTO_MAP 迁到 utils/hotkeys.ts，与速查面板共用同一份数据 */
let gWaitUntil = 0;

/* v3.0.0：click 触发浮层 Esc 统一关闭层（全站唯一挂点，防逐页打补丁复发）。
   naive-ui 的 popover/dropdown 只有 internalTrapFocus（焦点陷阱形态）才响应 Esc；
   全站 trigger="click" 的 popover（相关性调试/列选择/通知/用户菜单/集群切换/筛选浮层…）
   皆是 clickoutside 关闭。vdirs+evtd 的 clickoutside 侦听 document 上的
   mousedown+mouseup（capture:true，两者都在浮层外才判外部），Esc 时向 body 派发一对
   合成 mousedown/mouseup（capture 路径下行经过 document 触发）即收层。
   派发目标必须是 body——dispatch 到 document 自身不走 capture 阶段（无下行路径）。
   只在有打开浮层时拦，避免与 ConfirmModal/CmdPalette 自身的 Esc 链抢时序
   （浮层关闭优先级 > 页面快捷键）。 */
const OPEN_POPOVER_SEL =
  '.n-popover.n-popover-shared--show, .n-popover.n-popover-shared--show-arrow, .n-dropdown.n-dropdown--show, .cs-menu, .um-panel, .nc-pane, .rfp-mask, .xm-menu, .ctx-menu';
function closeOpenFloatingOnEsc(e: KeyboardEvent): boolean {
  if (e.key !== 'Escape') return false;
  const root = document.body;
  const open = [...root.querySelectorAll(OPEN_POPOVER_SEL)].some(el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.05;
  });
  if (!open) return false;
  /* 派发目标必须是 documentElement(html):
     ① evtd 统一监听挂 window,delegate 按 e.target 沿 parentNode 收集路径,
        capture 从 window 下行——target=documentElement 的路径含 document,capture 命中;
        target=document 自身无下行路径,不走 capture,监听不触发;
        target=body 会被判内部(浮层 teleport 挂 body 下,el.contains(body)=true)。
     ② vdirs clickoutside 判定 = el.contains(target),html 不在任何浮层子树内 → 外部 ✓ */
  const tgt = document.documentElement;
  tgt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  tgt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  return true;
}

function onKey(e: KeyboardEvent) {
  /* v3.0.0：Esc 优先走浮层关闭链（含输入态——浮层内输入框的 Esc 应先收层而非清词） */
  if (closeOpenFloatingOnEsc(e)) { e.preventDefault(); e.stopPropagation(); return; }
  const t = e.target as HTMLElement;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest('.monaco-editor'));
  /* v3.0.0：可排序表头键盘可达——th.sortable 聚焦时 Enter/Space 触发 click（事件委托，
     全站 17 处排序表头一次挂全，逐视图补 keydown 不可持续） */
  if ((!typing || t.tagName === 'TH') && (e.key === 'Enter' || e.key === ' ') && t instanceof HTMLTableCellElement && t.classList.contains('sortable')) {
    e.preventDefault();
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  /* 二百三十八批：Mod+B 切换侧栏（dbx Toggle sidebar 对位——完全隐藏/恢复，
     查询与索引控制台全屏体验；输入态也可用，无文本副作用） */
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    store.toggleNavHidden();
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '?') { helpOpen.value = !helpOpen.value; e.preventDefault(); return; }

  /* Vim 风 chord：先按 g，1500ms 内再按目标字母 */
  if (Date.now() < gWaitUntil) {
    gWaitUntil = 0;
    const target = GOTO_MAP[e.key.toLowerCase()];
    if (target) { router.push(target); e.preventDefault(); return; }
  }
  if (e.key === 'g') { gWaitUntil = Date.now() + 1500; return; }

  const item = NAV_ITEMS.find(n => n.key === e.key);
  if (item) router.push(item.path);
}

/* 2.5.0 页面级授权复核（响应式）：probe 完成前守卫按「未启用」放行，身份到达后复核当前路由（迟到白名单补救）。
   watch grantedPages 天然收敛全部身份到达路径——首次 probe、onHostMessage 宿主凭证后重探、login() 成功后重探，
   后两条无需额外挂接。不加 immediate：me 从 null 起步，probe 完成自然触发；null→null 不触发（未启用语义不变）。
   五百一十五批：复核按当前目标连接收缩；conns.length 并入 watch 源——连接目录晚于身份到达时
   纯连接模型用户（host 无静态页）也要能自动落到首个授权连接，否则开屏即 403+空侧栏（用户实报「进不去」）。 */
function autoPickConnTarget(gp: readonly string[] | null) {
  if (!gp) return;
  const connIds = new Set<string>();
  for (const k of gp) {
    const m = /^conn:([^:]+):/.exec(k);
    if (m) connIds.add(m[1]);
  }
  if (!connIds.size) return; // 非连接模型不干预
  if (store.target && connIds.has(store.target)) return; // 已在授权目标上
  if (!store.conns.length) return; // 连接目录未到，等 conns 变化再触发
  const first = store.conns.find(c => connIds.has(c.id));
  if (!first) return;
  store.setTarget(first.id, first.name);
  store.notify('info', `宿主集群未授权任何页面，已切到「${first.name}」`);
}
watch([() => auth.grantedPages, () => store.conns.length], ([gp]) => {
  autoPickConnTarget(gp);
  const r = pageDeniedRedirect(gp, router.currentRoute.value.path, store.target);
  if (r) router.replace(r);
});

/* ==================== 五百五十七批：授权就绪门（连接模型开屏竞态根治） ====================
   门注册在 setup 同步期（早于任何子视图挂载发请求）：iframe 形态下身份（grantedPages）、
   连接目录（conns）、目标钉选（autoPickConnTarget）三步未就绪时，非豁免内部请求在 api 层
   等待——此前的开屏并行（probe 与 loadIndices 同发）让连接模型用户的首屏请求全部裸奔，
   是产线 PAGE_DENIED 开屏爆发模式的根因。settleAuthChain 完成三步后 release；
   api 侧另有 4s 硬兜底，本链永不死等。 */
let releaseAuthGate: (() => void) | null = null;
setAuthSettled(new Promise<void>(res => { releaseAuthGate = res; }));
const authChainSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
async function settleAuthChain() {
  const t0 = Date.now();
  const embeddedForm = typeof window !== 'undefined' && window.parent !== window;
  /* 身份已知即出；独立形态（无宿主令牌）无连接模型直通；嵌入形态宿主令牌迟到时
     短轮询等握手（onHostMessage 到达即重探，me 置位后本循环自然退出） */
  while (Date.now() - t0 < 3200) {
    if (auth.me != null) break;
    if (!getHostToken() && !embeddedForm) break;
    await authChainSleep(250);
  }
  if (getHostToken()) {
    await Promise.race([store.loadConns(), authChainSleep(1600)]);
    autoPickConnTarget(auth.grantedPages); /* 同步钉选（watch 兜底保留，双触发幂等） */
  }
  releaseAuthGate?.();
  releaseAuthGate = null;
}

/* 首探统一入口：probe 与 loadIndices 并行（互不依赖——401 各自走 unauthorized 广播弹遮罩），
   比「先探身份再拉索引」串行省 1 个 RTT；bootstrapped 保证握手应答与超时兜底只赢一次 */
let hostWaitTimer = 0;
let bootstrapped = false;
function bootstrapIdentity() {
  if (bootstrapped) return;
  bootstrapped = true;
  window.clearTimeout(hostWaitTimer);
  auth.probe();
  store.loadIndices(); /* 数据面请求经 api 层授权就绪门等待，此处的「并行」不再产生裸奔请求 */
  settleAuthChain();
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  /* v3.0.0：th.sortable 键盘可达的 tabindex 注入（事件委托代理 focus 不可行，
     需真实可聚焦；捕获期 click 委托挂 document，A3 静态审计的 role/键盘可达收口） */
  const focusables = document.querySelectorAll('th.sortable');
  focusables.forEach(th => { th.setAttribute('tabindex', '0'); th.setAttribute('role', 'button'); });
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches?.('th.sortable')) { n.setAttribute('tabindex', '0'); n.setAttribute('role', 'button'); }
        n.querySelectorAll?.('th.sortable').forEach(th => { th.setAttribute('tabindex', '0'); th.setAttribute('role', 'button'); });
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  (window as any).__esSortableMo = mo;
  // R37：iframe 嵌入宿主页面时的 postMessage 握手 ——
  // 子页就绪即发 es-console-ready，宿主回 es-console-host-token 下发宿主凭证（内存态），
  // 收到后重探身份：委托鉴权认出即免内置登录。独立开页（非 iframe）零开销。
  if (window.parent !== window) {
    window.addEventListener('message', onHostMessage);
    try { window.parent.postMessage({ type: 'es-console-ready' }, '*'); } catch { /* 跨域限制时静默 */ }
    // iframe 场景等宿主 token 到达后统一首探：消灭无凭证裸探的 401 浪费与乱序覆盖；
    // 宿主 1.2s 不应答（独立壳页嵌套等异常）兜底走内置鉴权，不卡死
    hostWaitTimer = window.setTimeout(bootstrapIdentity, 1200);
  } else {
    bootstrapIdentity();
  }
  // R61：裸进站且存在未过期现场 → 提供「继续上次」（深链进站是明确意图，不打扰）
  const rst = restorable(entryHash, lastRoute);
  if (rst) {
    store.notify('info', '上次工作现场：' + rst.name, {
      duration: 10000,
      action: { label: '继续上次', onClick: () => router.push(rst.fullPath) },
    });
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('message', onHostMessage);
  (window as any).__esSortableMo?.disconnect();
});

/* iframe 嵌入：宿主 postMessage 下发凭证与主题。
   token 消息可顺带带 theme 字段（首握一次到位）；es-console-host-theme 是运行期热切通道。
   用户手切主题档后宿主热推不再生效（反超语义在 store.setHostTheme）。 */
function onHostMessage(e: MessageEvent) {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'es-console-host-token' && typeof d.token === 'string') {
    setHostToken(d.token);
    if (d.theme === 'dark' || d.theme === 'light') store.setHostTheme(d.theme);
    auth.showLogin = false;
    // 首探走统一入口（probe + loadIndices 并行）；运行期换发只重探身份（数据面不依赖身份）
    if (bootstrapped) auth.probe();
    else bootstrapIdentity();
  } else if (d.type === 'es-console-host-theme') {
    /* 非法载荷忽略（保留当前主题）而非钳回 dark——浅色宿主下被误翻深比不收消息更糟 */
    if (d.mode === 'dark' || d.mode === 'light') store.setHostTheme(d.mode);
  }
}
</script>

<style scoped>
.layout { display: flex; height: 100%; overflow: hidden; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.page { flex: 1; overflow-y: auto; padding: var(--sp-4) var(--sp-5) var(--sp-6); }
/* UX 轮 §9：超宽屏内容居中（padding 实现，不动 DOM/滚动容器）。
   page-wide 豁免：theme.css §9「表格密度页可豁免」的机制兑现——路由 meta.wide 的
   数据密集页不吃居中 padding，只留基础节奏（不建第二套布局，仅覆盖左右两值）。 */
@media (min-width: 1920px) {
  .page { padding-left: calc((100% - var(--page-maxw)) / 2); padding-right: calc((100% - var(--page-maxw)) / 2); }
  .page.page-wide { padding-left: var(--sp-5); padding-right: var(--sp-5); }
}
.cluster-banner {
  display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4); flex-shrink: 0;
  font-size: var(--fs-sm); color: var(--err);
  background: color-mix(in srgb, var(--err) 8%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--err) 25%, transparent);
}
.cluster-banner .btn { margin-left: auto; }
.cluster-banner.warn {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 8%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--warn) 25%, transparent);
}
.cluster-banner.info {
  color: var(--ac-hi);
  background: var(--ac-soft); border-bottom: 1px solid var(--ac-line);
}

.route-bar { position: fixed; top: 0; left: 0; right: 0; z-index: var(--z-routebar); pointer-events: none; color: var(--ac-hi); }
@keyframes rb-slide { from { transform: translateX(-100%); } to { transform: translateX(400%); } }
</style>
