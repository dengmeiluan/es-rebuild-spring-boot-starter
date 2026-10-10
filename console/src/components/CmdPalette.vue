<template>
  <teleport to="body">
    <transition name="pop">
      <div v-if="show" class="pal-mask" role="presentation" @click.self="close" @keydown.esc="close" tabindex="-1">
        <div ref="palRef" class="pal" role="dialog" aria-modal="true" aria-label="命令面板">
          <div class="pal-input-row">
            <Search :size="15" class="pal-ic" />
            <input
              ref="inpRef"
              v-model="query"
              class="pal-input"
              placeholder="跳转页面、执行动作、切换索引…"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="run(rows[active]?.c)"
              @keydown.esc="close"
              @keydown.tab="onTab"
            />
            <span class="kbd">esc</span>
          </div>
          <div class="pal-list scroll-y">
            <!-- 空态引导审计：过滤无结果补下一步（换关键词/清词重览全量）
                 裸 .empty 迁 EmptyState compact（命令面板窄容器） -->
            <EmptyState v-if="!rows.length" compact :icon="Search"
              text="无匹配命令" hint="换个更短的关键词，或清空输入查看全部命令" />
            <template v-for="(r, i) in rows" :key="r.c.id">
              <div v-if="i === 0 || rows[i - 1].g !== r.g" class="pal-group">{{ r.g }}</div>
              <div
                class="pal-item"
                :class="{ on: i === active }"
                role="option" tabindex="-1" :aria-selected="i === active"
                @mouseenter="active = i"
                @click="run(r.c)"
                @keydown.enter.prevent="run(r.c)"
              >
                <component :is="r.c.icon" :size="14" class="pal-item-ic" />
                <div class="pal-item-main">
                  <div class="pal-item-title"><MarkText :text="r.c.title" :kw="query" /></div>
                  <div v-if="subOf(r.c)" class="pal-item-sub"><MarkText :text="subOf(r.c)" :kw="query" /></div>
                </div>
                <span class="pal-item-cat">{{ r.c.cat }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  Search, Play, Save, History, FileDown, Variable, Database, RefreshCw,
  LayoutDashboard, TerminalSquare, Braces, Zap, Wrench, Stethoscope, Rocket, Settings2,
  Moon, Sun, Monitor, Rows2, Rows3, ListTodo, FlaskConical, Link2,
  Network, FileCode2, Camera,
  Sliders, Recycle, RotateCw, Wind, Eraser, HardDrive, ShieldCheck, Copy, RotateCcw,
  GaugeCircle, GitBranch, Calculator, RefreshCcw,
  HeartPulse, BookOpen, Wand2, Sparkles,
  BellRing, Star,
  LayoutGrid, Pencil, Send, PanelLeft,
  Flame, MonitorSpeaker, Layers, PlayCircle, PauseCircle, Maximize2,
  SearchCode, ArrowLeftRight, ShieldAlert,
FolderTree, BookText, PackageOpen,
  Microscope, SearchCheck, SlidersHorizontal, Grid3x3, ScanSearch,
  LayoutTemplate, GitCompareArrows,
  Plus, FilePlus2, Keyboard, Crosshair,
} from 'lucide-vue-next';
import { NAV_ITEMS } from '../router';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { aliasForTitle } from '../utils/cmdAlias';
import { askConfirm } from '../composables/confirm';
/* 裸 .empty 迁 EmptyState compact */
import EmptyState from './EmptyState.vue';
import MarkText from './MarkText.vue';
import { api } from '../api';
import { copyText, fmtTime } from '../utils/format';
import { visibleTables } from '../utils/tableRegistry';
import { replayFavorite } from '../utils/favReplay';
import { trapTabKey } from '../utils/focusTrap';
import { dslToLucene } from '../utils/dslToLucene';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();

const router = useRouter();
const store = useAppStore();
const auth = useAuthStore();
const query = ref('');
const active = ref(0);
const palRef = ref<HTMLElement>();
/* Tab 焦点陷阱：面板内循环，不跳到遮罩背后的页面 */
function onTab(e: KeyboardEvent) { if (palRef.value) trapTabKey(palRef.value, e); }
const inpRef = ref<HTMLInputElement>();

interface Cmd { id: string; title: string; sub?: string; cat: string; icon: any; action: () => void }

/*  M3：表格域命令派发 + 无人认领提示。广播同步分发（监听器同步执行），
   可见实例在监听器内即 markHandled；150ms 兜底只对「无任何可见表格实例」的情况触发 */
function dispatchTableCmd(cmd: string) {
  let handled = false;
  window.dispatchEvent(new CustomEvent('table-cmd', { detail: { cmd, markHandled: () => { handled = true; } } }));
  setTimeout(() => {
    if (!handled) store.notify('warning', '当前页面没有可见的结果表格——切到表格视图或含表格的页面后重试');
  }, 150);
}

const NAV_ICONS: Record<string, any> = {
  LayoutDashboard, TerminalSquare, Braces, Database, Zap, Wrench, History, Stethoscope, Rocket, Settings2,
  ListTodo, FlaskConical, Link2, Network, FileCode2, Camera,
  Sliders, Recycle,
  GaugeCircle, GitBranch, Calculator,
  HeartPulse, BookOpen, Wand2,
  ShieldCheck, BellRing, Star,
  LayoutGrid, Rows3, Pencil,
  Flame, MonitorSpeaker, Layers,
  SearchCode, ArrowLeftRight,
FolderTree, BookText, PackageOpen,
  Microscope, SearchCheck, SlidersHorizontal, Grid3x3, ScanSearch,
  LayoutTemplate, GitCompareArrows,
};

const commands = computed<Cmd[]>(() => {
  const list: Cmd[] = NAV_ITEMS.map(n => ({
    id: 'nav' + n.path,
    title: '前往：' + n.name,
    /*  §8.4：版本不足的功能在命令面板同步降级提示，与侧边栏徽标一致 */
    sub: (n.minVer && store.verBelow(n.minVer) ? `需 ES ${n.minVer}+（当前 ${store.esVersion}） · ` : '') + '快捷键 ' + n.key,
    cat: '页面',
    icon: NAV_ICONS[n.icon] || Database,
    action: () => router.push(n.path),
  }));
  list.push(
    { id: 'act-run', title: '执行查询', sub: '查询工作台 · Ctrl+Enter', cat: '动作', icon: Play, action: () => { router.push('/search'); store.emit('run-query'); } },
    { id: 'act-save', title: '保存当前查询', sub: '查询工作台', cat: '动作', icon: Save, action: () => { router.push('/search'); store.emit('save-query'); } },
    { id: 'act-hist', title: '打开查询历史', cat: '动作', icon: History, action: () => { router.push('/search'); store.emit('open-history'); } },
    { id: 'act-export', title: '导出结果为 JSON', cat: '动作', icon: FileDown, action: () => store.emit('export-json') },
    /* 表格域命令——window 广播，仅当前可见表格响应（RT/QRT 自检 offsetParent）。
        M3：markHandled 协商——可见实例响应即标记，150ms 后无人认领显式提示
       （此前 JSON/Tree 视图下按导出被 offsetParent 守卫静默吞掉，用户感知为「命令坏了」） */
    { id: 'tbl-export', title: '表格：导出当前视图（CSV）', sub: '作用于当前可见表格（RT/QRT）', cat: '动作', icon: FileDown, action: () => dispatchTableCmd('export') },
    { id: 'tbl-dense', title: '表格：切换密度', sub: '作用于当前可见表格（表格级偏好）', cat: '设置', icon: Rows3, action: () => dispatchTableCmd('dense') },
    { id: 'tbl-reset-widths', title: '表格：重置全部列宽', sub: '作用于当前可见表格（拖拽过的列回原始宽）', cat: '设置', icon: RotateCcw, action: () => dispatchTableCmd('reset-widths') },
    { id: 'act-vars', title: '管理变量 ${var}', cat: '动作', icon: Variable, action: () => { router.push('/search'); store.emit('open-vars'); } },
    { id: 'act-refresh', title: '刷新索引列表', cat: '动作', icon: RefreshCw, action: () => store.loadIndices() },
    /* 显示偏好一键重置（调乱行高/列宽/布局后的救急入口）——
       只清显示类键；草稿（draft2/dsl.body）/历史/收藏/主题等用户数据不动；刷新后全量生效 */
    { id: 'act-reset-prefs', title: '重置全部显示偏好（行高/密度/列宽/冻结/布局/页大小）', sub: '清空后刷新页面生效；草稿与历史不受影响', cat: '设置', icon: Eraser, action: () => {
      const kill: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('es_tbl_') || k === 'es_density' || k === 'es_pager_size' || k.startsWith('es-console.layout.v2') || k.startsWith('es_console_qb_split')) kill.push(k);
      }
      kill.forEach(k => localStorage.removeItem(k));
      store.notify('success', `已重置 ${kill.length} 项显示偏好，刷新页面后生效`);
    } },
    { id: 'set-theme-dark', title: '主题：深色', sub: '强制使用深色主题', cat: '设置', icon: Moon, action: () => store.setTheme('dark') },
    { id: 'set-theme-light', title: '主题：浅色', sub: '强制使用浅色主题', cat: '设置', icon: Sun, action: () => store.setTheme('light') },
    { id: 'set-theme-auto', title: '主题：跟随系统', sub: '根据 prefers-color-scheme 自动', cat: '设置', icon: Monitor, action: () => store.setTheme('auto') },
    { id: 'set-density', title: '密度：' + (store.settings.density === 'compact' ? '→ 宽松' : '→ 紧凑'), sub: '表格/卡片内边距切换', cat: '设置', icon: store.settings.density === 'compact' ? Rows3 : Rows2, action: () => store.toggleDensity() },
    /* 交互修复：完全隐藏侧栏进面板（TopBar 钮 / Ctrl+B 已有，面板是第三入口）——按当前态给动作向文案 */
    { id: 'set-nav-hidden', title: store.navHidden ? '展开侧栏' : '折叠侧栏', sub: '完全隐藏 / 恢复左侧导航（全屏工作）· Ctrl+B 同效', cat: '设置', icon: PanelLeft, action: () => store.toggleNavHidden() },
    /* 键盘速查直达（鼠标用户看不到 ? 键提示；面板先关再开速查，避免弹层叠加） */
    { id: 'open-hotkeys', title: '键盘速查面板', sub: '全部快捷键一览（goto / 行导航 / 批量操作）', cat: '设置', icon: Keyboard, action: () => { emit('update:show', false); store.emit('open-hotkeys'); } },
  );

  /* 快捷运维动作（需 picked index） */
  const idx = store.pickedIdx;
  /*  P0-3：跳转到列——遍历可见表格实例合成「跳转到列 X」命令（面板搜索框
     即列名过滤，与 dbx 跳列 popover 同构）；动作经注册表定向调用，天然只命中可见实例 */
  for (const t of visibleTables()) {
    for (const col of t.entry.cols()) {
      list.push({
        id: `goto-col-${t.id}-${col}`,
        title: '表格：跳转到列 ' + col,
        sub: '列头闪烁定位（隐藏列自动显示）',
        cat: '动作',
        icon: Crosshair,
        action: () => t.entry.locate(col),
      });
    }
  }
  /* 补可选第 5 参 action——成功 toast 附动作按钮（AdhocRebuildView
     confirmSwitch notify action 范式），其余调用方不传零影响 */
  const runRaw = async (method: string, path: string, body: string, msg: string,
    action?: { label: string; onClick: () => void }) => {
    try { await api.raw(method, path, body); store.notify('success', msg, action ? { action } : undefined); }
    catch (e: any) { store.notify('error', msg + '失败：' + (e?.message || e)); }
  };
  /* 权限门禁——写/高危命令按角色裁剪（不再展示点了必 403 的命令）；
     create-doc=OPERATOR(write)；：create-index 命令唯一 canO 消费，端点
     （POST /cluster/create-index）归 config-validator 页——连接模型按本页写键勾选裁决；
     runRaw 系走 /cluster/raw=ADMIN 管理域，维持全局角色档 */
  const canW = auth.canWriteOn(store.target), canO = auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target), canA = auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', store.target); /* ：raw 五命令按 rest 页勾选 */
  /* CRUD 里「增」提升为一等公民——新建索引/新建文档直达 */
  if (canO) list.push(
    { id: 'r59-create-index', title: '新建索引', sub: '名称校验 + 分片/副本 + 别名 + 高级 JSON', cat: '动作', icon: Plus,
      action: () => router.push({ path: '/indices', query: { create: '1' } }) },
  );
  if (canW) list.push(
    { id: 'r59-create-doc', title: '新建文档（当前索引）', sub: idx ? '写入 ' + idx + ' · mapping 骨架预填' : '先选中一个索引', cat: '动作', icon: FilePlus2,
      /* 走 ?newdoc=1 深链（与 ?create=1 同模式）：事件总线跨页会丢，深链同页/跨页都可靠且可重入 */
      action: () => router.push({ path: '/search', query: { newdoc: '1' } }) },
  );
  list.push(
    /* →：高频入口——当前索引直达工作区（文档/查询/配置/分片/运维一站式） */
    { id: 'ops-index-hub', title: '打开索引工作区', sub: idx ? '目标 ' + idx : '先选中一个索引', cat: '运维', icon: Database,
      action: () => idx ? router.push({ path: '/indices', query: { idx } }) : router.push('/indices') },
  );
  /* 交互修复：集群/目标切换进面板——此前多集群用户必须移步顶栏切换器，⌘K 搜「切集群」无果。
     遍历 store.conns 每连接一条；行为对齐 ClusterSwitcher.pickTarget：当前目标 no-op、
     RED 探活失败先确认，核心动作复用 store.setTarget（切完自动清 picked/recent 并重拉索引） */
  for (const c of store.conns) {
    list.push({
      id: 'tgt-' + c.id,
      title: '切换到 ' + c.name,
      sub: (store.target === c.id ? '当前目标 · ' : '') + `${c.host}:${c.port}` + (c.env ? ' · ' + c.env : '') + (c.health?.status === 'RED' ? ' · 最近探活失败' : ''),
      cat: '集群',
      icon: Network,
      action: async () => {
        if (c.id === store.target) { store.notify('info', '已是当前目标：' + c.name); return; }
        if (c.health?.status === 'RED') {
          if (!await askConfirm({
            title: '目标集群最近探活失败',
            message: `「${c.name}」最近一次探活失败：${c.health?.error || '未知错误'}。切换后数据面操作可能超时或报错，确认继续？`,
            okText: '仍然切换',
          })) return;
        }
        store.setTarget(c.id, c.name);
        store.notify('success', '数据面已切到：' + c.name);
      },
    });
  }
  /* 交互修复：当前态命令（有选中索引才出现）——托管重建直达（对齐索引工作区头部钮：
     goto 自带 store.pick(cur)，AdhocRebuild 从全局选中索引接上下文）、刷新当前索引元信息、
     数据浏览器直达（BrowserView 消费全局 pickedIdx，跳转即用） */
  if (idx) list.push(
    { id: 'ops-adhoc-rebuild-cur', title: '托管重建当前索引', sub: '粘贴期望配置 / 探测 / 校验 / 切换一条龙 · ' + idx, cat: '运维', icon: Rocket,
      action: () => { store.pick(idx); router.push('/adhoc-rebuild'); } },
    { id: 'act-refresh-cur-idx', title: '刷新当前索引详情', sub: '重拉 _cat 索引元信息 · ' + idx, cat: '动作', icon: RefreshCw,
      action: async () => { await store.loadIndices(); store.notify('success', '已刷新索引元信息：' + idx); } },
    { id: 'act-open-browser-cur', title: '打开数据浏览器（当前索引）', sub: idx, cat: '动作', icon: ScanSearch,
      action: () => router.push('/browser') },
  );
  if (canA) list.push(
    { id: 'ops-refresh', title: '刷新索引 (_refresh)', sub: idx ? '目标 ' + idx : '先选中一个索引', cat: '运维', icon: RotateCw,
      action: () => idx ? runRaw('POST', `/${idx}/_refresh`, '', `已 refresh ：${idx}`) : store.notify('warning', '请先选中一个索引') },
    { id: 'ops-flush', title: '刷盘索引 (_flush)', sub: idx ? '目标 ' + idx : '先选中一个索引', cat: '运维', icon: Wind,
      action: () => idx ? runRaw('POST', `/${idx}/_flush`, '', `已 flush ：${idx}`) : store.notify('warning', '请先选中一个索引') },
    { id: 'ops-clearcache', title: '清缓存 (_cache/clear)', sub: idx ? '目标 ' + idx : '先选中一个索引', cat: '运维', icon: Eraser,
      action: () => idx ? runRaw('POST', `/${idx}/_cache/clear`, '', `已清除缓存：${idx}`) : store.notify('warning', '请先选中一个索引') },
    { id: 'ops-forcemerge', title: '强制合并段 (_forcemerge?max=1)', sub: idx ? '目标 ' + idx + '（可能长时间阻塞）' : '先选中一个索引', cat: '运维', icon: HardDrive,
      action: async () => {
        if (!idx) { store.notify('warning', '请先选中一个索引'); return; }
        if (!await askConfirm({
          title: '强制合并段',
          message: `将对「${idx}」执行 force merge max_num_segments=1：大索引可能长时间占用 IO 且不可中断，建议低峰期执行。`,
          okText: '执行合并',
        })) return;
        /* 同步等待改异步提交——wait_for_completion=false（BrowserView 560 判例
           同款：大索引同步 await 会占死前端直到网关超时）；成功文案对齐异步语义 +
           「看任务」动作直达 /tasks（AdhocRebuildView confirmSwitch notify action 范式） */
        runRaw('POST', `/${idx}/_forcemerge?max_num_segments=1&wait_for_completion=false`, '', `任务已提交(异步)：forcemerge ${idx}`,
          { label: '看任务', onClick: () => router.push('/tasks') });
      } },
    { id: 'ops-reroute-retry', title: '重试失败分片 (_cluster/reroute?retry_failed)', sub: '集群级一键重试', cat: '运维', icon: ShieldCheck,
      action: () => runRaw('POST', '/_cluster/reroute?retry_failed=true', '{}', '已提交 retry_failed=true') },
  );
  list.push(
    { id: 'ops-copy-idx', title: '复制当前索引名', sub: idx || '未选中', cat: '运维', icon: Copy,
      action: () => idx ? copyText(idx).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制：' + idx : '复制失败：浏览器拦截了剪贴板')) : store.notify('warning', '未选中索引') },
    { id: 'ops-open-search-sandbox', title: '打开搜索沙盒', sub: 'DSL / explain / 高亮', cat: '运维', icon: FlaskConical,
      action: () => router.push({ path: '/search', query: { mode: 'sandbox' } }) },
    { id: 'ops-open-index-settings', title: '打开索引设置（热更）', sub: 'refresh_interval / replicas / blocks', cat: '运维', icon: Sliders,
      action: () => router.push('/index-settings') },
    { id: 'ops-open-ilm', title: '打开 ILM 策略', sub: 'phase 时间线 + explain', cat: '运维', icon: Recycle,
      action: () => router.push('/ilm') },
    /*  */
    { id: 'ops-open-cluster-settings', title: '打开集群设置（persistent/transient）', sub: 'diff 预览 + 下发', cat: '运维', icon: GaugeCircle,
      action: () => router.push('/cluster-settings') },
    { id: 'ops-open-task-tree', title: '打开任务树（可批量 cancel）', sub: '任务层级 + auto refresh', cat: '运维', icon: GitBranch,
      action: () => router.push('/task-tree') },
    /* 运维审计直达——谁在什么时候对哪个集群干了什么，一键进安全中心审计表 */
    { id: 'ops-open-audit', title: '查看操作审计', sub: '安全中心 · 写操作审计流水', cat: '运维', icon: ShieldCheck,
      action: () => router.push('/security') },
    { id: 'ops-open-reindex-preview', title: '打开 Reindex 预估（不写入）', sub: '_count + _stats 估算', cat: '运维', icon: Calculator,
      action: () => router.push('/reindex-preview') },
    { id: 'ops-reroute-retry-r25', title: '恢复集群分片分配（persistent）', sub: '下发 cluster.routing.allocation.enable=all', cat: '运维', icon: RefreshCcw,
      action: async () => {
        if (!await askConfirm({
          title: '恢复分片分配',
          message: '将下发 persistent 设置 cluster.routing.allocation.enable=all，集群恢复自动分片分配（可在集群设置页回改）。',
          okText: '下发设置',
        })) return;
        try { await api.putClusterSettings(JSON.stringify({ persistent: { cluster: { routing: { allocation: { enable: 'all' } } } } })); store.notify('success', '已下发：allocation.enable=all'); }
        catch (e: any) { store.notify('error', '下发失败：' + (e?.message || e)); }
      } },
    { id: 'ops-snapshot-status', title: '快照当前进度', sub: '_status 实时快照', cat: '运维', icon: Camera,
      action: async () => {
        try {
          const r = await api.snapshotStatus();
          const running = (r?.snapshots || []).length;
          store.notify(running > 0 ? 'warning' : 'success', running > 0 ? `正在进行中的快照：${running}` : '无进行中快照');
        } catch (e: any) { store.notify('error', '查询失败：' + (e?.message || e)); }
      } },
    /* 一键体检 / 模板 / 优化 / 重看引导 */
    { id: 'ops-open-health', title: '一键集群体检', sub: '10 秒诊断报告 + Markdown 导出', cat: 'assist', icon: HeartPulse,
      action: () => router.push('/health-report') },
    { id: 'ops-open-templates-gallery', title: '打开 DSL 模板画廊', sub: '20+ 即插即用模板', cat: 'assist', icon: BookOpen,
      action: () => router.push('/templates-gallery') },
    { id: 'ops-open-optimizer', title: '索引一键优化向导', sub: '扫描热参数 + 建议 + 一键应用', cat: 'assist', icon: Wand2,
      action: () => router.push('/optimizer') },
    { id: 'ops-relaunch-wizard', title: '重看欢迎引导', sub: '3 步上手面板（傻瓜化）', cat: 'assist', icon: Sparkles,
      action: () => store.emit('open-wizard') },
    { id: 'ops-run-health-now', title: '立即体检（后台）', sub: '不跳转页面，直接 toast 得分', cat: 'assist', icon: HeartPulse,
      action: async () => {
        try { const r = await api.healthReport(); store.notify(r.score >= 85 ? 'success' : r.score >= 60 ? 'warning' : 'error', `体检完成：${r.score}/100（${r.checks?.length || 0} 项）`); }
        catch (e: any) { store.notify('error', '体检失败：' + (e?.message || e)); }
      } },
    /* 分布式运维 / 自定义 / 收藏 */
    { id: 'ops-slm', title: 'SLM 快照策略', sub: '定时备份策略与执行统计', cat: 'ops', icon: ShieldCheck,
      action: () => router.push('/slm') },
    { id: 'ops-watcher', title: 'Watcher 告警', sub: '分布式告警规则与执行', cat: 'ops', icon: BellRing,
      action: () => router.push('/watcher') },
    { id: 'ops-remote', title: '远程集群 CCS', sub: '跨集群搜索与连接状态', cat: 'ops', icon: Network,
      action: () => router.push('/remote-clusters') },
    { id: 'ops-favorites', title: '打开收藏夹', sub: '跨会话 DSL/REST/视图一键重放', cat: 'ops', icon: Star,
      action: () => router.push('/favorites') },
    { id: 'ops-reindex-adv', title: 'Reindex 高级自定义', sub: '自定义目标集群 / 自由 body / 全参数', cat: 'ops', icon: Wand2,
      action: () => router.push('/reindex-advanced') },
    { id: 'ops-fav-current-dsl', title: '收藏当前 DSL', sub: '把当前查询页 body 存到收藏夹', cat: 'ops', icon: Star,
      action: () => {
        const body = sessionStorage.getItem('es-console.dsl.body') || localStorage.getItem('es-console.dsl.body') || '';
        if (!body.trim()) { store.notify('warning', '当前查询页无可收藏内容'); return; }
        /* index 取 DSL 镜像的所属索引（别页收藏时 pickedIdx 可能已切换） */
        const idx = sessionStorage.getItem('es-console.dsl.index') || store.pickedIdx;
        store.addFavorite({ kind: 'dsl', title: `DSL @${fmtTime(Date.now())}`, subtitle: `${body.slice(0, 80)}…`, payload: { body, index: idx }, tags: ['dsl', 'manual'] });
        store.notify('success', '当前 DSL 已收藏');
      } },
    /* 自定义化 / 快捷编辑 / SQL */
    { id: 'data-workspace', title: '自定义工作台', sub: 'localStorage 拖拽布局 · 8 widget', cat: 'data', icon: LayoutGrid,
      action: () => router.push('/workspace') },
    { id: 'data-bulk', title: 'Bulk 批量文档编辑', sub: 'NDJSON 直编 · 预校 · 分组结果', cat: 'data', icon: Rows3,
      action: () => router.push('/bulk') },
    { id: 'data-ubq', title: 'Update by Query', sub: '按自定义 query 批量更新 · painless 脚本', cat: 'data', icon: Pencil,
      action: () => router.push('/update-by-query') },
    { id: 'data-sql', title: 'ES-SQL 控制台', sub: '分布式 SQL · cursor 分页 · CSV 导出', cat: 'data', icon: Database,
      action: () => router.push({ path: '/search', query: { mode: 'sql' } }) },
    { id: 'data-doc-diff', title: '文档 Diff+Patch', sub: '双列 diff · PUT/update/script 三模式', cat: 'data', icon: FileCode2,
      action: () => router.push('/doc-diff') },
    { id: 'data-quick-sql', title: '快速 SQL（带入当前索引）', sub: '预填 SELECT 并跳转 SQL 控制台自动执行', cat: 'data', icon: Send,
      action: () => {
        /*  §8.1：原生 prompt() 废弃，改为预填 + 路由到成熟视图 */
        sessionStorage.setItem('es-console.sql.prefill', store.pickedIdx ? `SELECT * FROM "${store.pickedIdx}" LIMIT 5` : 'SELECT * FROM "my-index" LIMIT 5');
        router.push({ path: '/search', query: { mode: 'sql' } });
      } },
    /* 开发者工具 / 拓扑 / 火焰图 / 实时大屏 / painless / 生命周期 */
    { id: 'dev-devtools', title: 'Dev Tools 多标签编辑器', sub: 'Kibana 风格 · 多标签持久化 · Ctrl+Enter', cat: 'dev', icon: TerminalSquare,
      action: () => router.push('/devtools') },
    { id: 'dev-devtools-new-tab', title: 'Dev Tools 新开标签', sub: '直接打开一个空 GET / 请求', cat: 'dev', icon: TerminalSquare,
      action: () => { sessionStorage.setItem('es-console.devtools.newtab', '1'); router.push('/devtools'); } },
    { id: 'dev-flame', title: 'Profile 火焰图', sub: 'DSL profile 递归展开 · 热力条 · Top10 慢操作', cat: 'dev', icon: Flame,
      action: () => router.push('/profile-flame') },
    { id: 'dev-flame-current', title: '把当前 DSL 送去火焰图分析', sub: '带 profile=true 重跑', cat: 'dev', icon: Flame,
      action: () => {
        const body = sessionStorage.getItem('es-console.dsl.body') || localStorage.getItem('es-console.dsl.body') || '';
        if (!body.trim()) { store.notify('warning', 'DSL 查询页尚无 body'); return; }
        sessionStorage.setItem('es-console.flame.body', body);
        /* flame.index 同取 DSL 镜像的所属索引 */
        const idx = sessionStorage.getItem('es-console.dsl.index') || store.pickedIdx;
        if (idx) sessionStorage.setItem('es-console.flame.index', idx);
        router.push('/profile-flame');
      } },
    { id: 'dev-live', title: '实时监控大屏', sub: '轮询 nodes-stats · Sparkline QPS/写入/heap', cat: 'dev', icon: MonitorSpeaker,
      action: () => router.push('/live') },
    { id: 'dev-live-fs', title: '实时大屏 · 全屏切换', sub: '进入沉浸式监控模式', cat: 'dev', icon: Maximize2,
      action: () => { sessionStorage.setItem('es-console.live.fullscreen', '1'); router.push('/live'); } },
    { id: 'dev-painless', title: 'Painless 脚本沙盒', sub: '试跑 · 6 模板 · stored CRUD · UBQ 注入', cat: 'dev', icon: FlaskConical,
      action: () => router.push('/painless-lab') },
    { id: 'dev-lifecycle', title: 'ILM 生命周期视图', sub: '甘特图 phase · rollover Dry Run · move step', cat: 'dev', icon: Layers,
      action: () => router.push('/lifecycle') },
    /* ILM start/stop=CLUSTER 档（rank3+）——低权角色不展示（不再点了 403） */
    ...(canO ? [
      { id: 'dev-ilm-start', title: 'ILM 启动 (start)', sub: '一键启动 ILM 引擎', cat: 'dev', icon: PlayCircle,
        action: async () => {
          if (!await askConfirm({
            title: '启动 ILM 引擎',
            message: '将恢复所有 ILM 策略的推进，处于等待中的 phase 动作（rollover/shrink/delete 等）会继续执行。',
            okText: '启动 ILM',
          })) return;
          try { await api.ilmStart(); store.notify('success', 'ILM 已启动'); }
          catch (e: any) { store.notify('error', 'ILM 启动失败：' + (e?.message || e)); }
        } },
      { id: 'dev-ilm-stop', title: 'ILM 停止 (stop)', sub: '临时暂停所有策略推进', cat: 'dev', icon: PauseCircle,
        action: async () => {
          if (!await askConfirm({
            title: '停止 ILM 引擎',
            message: '所有 ILM 策略推进将暂停：rollover 不再触发、过期索引不再删除，直到重新 start。',
            okText: '停止 ILM',
          })) return;
          try { await api.ilmStop(); store.notify('warning', 'ILM 已停止'); }
          catch (e: any) { store.notify('error', 'ILM 停止失败：' + (e?.message || e)); }
        } },
    ] : []),
    { id: 'dev-rollover-dry', title: 'Rollover Dry Run（当前索引/别名）', sub: '预填目标并跳转生命周期视图预检', cat: 'dev', icon: Recycle,
      action: () => {
        /*  §8.1：原生 prompt() 废弃，改为预填 + 路由到成熟视图（Dry Run/条件可视化可编辑） */
        if (store.pickedIdx) sessionStorage.setItem('es-console.lifecycle.rollover', store.pickedIdx);
        router.push('/lifecycle');
      } },
    { id: 'dev-nodes-brief', title: '节点简要统计（后台）', sub: 'heap/cpu/disk 一览 · toast 摘要', cat: 'dev', icon: GaugeCircle,
      action: async () => {
        try { const rows: any[] = await api.nodesStatsBrief();
          const worst = rows.slice().sort((a, b) => (b.heapPct || 0) - (a.heapPct || 0))[0];
          store.notify(worst && worst.heapPct >= 80 ? 'warning' : 'success', `节点 ${rows.length} · 最高 heap ${worst?.name || '-'} ${worst?.heapPct || 0}%`);
        } catch (e: any) { store.notify('error', '获取失败：' + (e?.message || e)); }
      } },
    /* 查询能力全通道 · 专治 ES-SQL 硬伤 */
    { id: 'monitor-lucene', title: 'Lucene 查询（数组/nested 友好）', sub: 'query_string 语法 · 绕开 ES-SQL 数组硬伤', cat: 'monitor', icon: SearchCode,
      action: () => router.push({ path: '/search', query: { mode: 'lucene' } }) },
    { id: 'monitor-pit', title: 'PIT 深度分页', sub: 'Point-in-Time + search_after · 突破 10000 上限 · 流式导出', cat: 'monitor', icon: Layers,
      action: () => router.push({ path: '/search', query: { mode: 'pit' } }) },
    { id: 'monitor-bridge', title: '查询语法桥 SQL↔DSL↔Lucene', sub: '一键转换 · 10 项能力对比表 · 无失真', cat: 'monitor', icon: ArrowLeftRight,
      action: () => router.push({ path: '/search', query: { mode: 'bridge' } }) },
    { id: 'monitor-schema', title: '字段体检（当前索引）', sub: '后台探测 mapping + 实际多值 · toast 报告失能字段', cat: 'monitor', icon: ShieldAlert,
      action: async () => {
        if (!store.pickedIdx) { store.notify('warning', '请先在左侧选中索引'); return; }
        try {
          const r: any = await api.resolveSchema(store.pickedIdx);
          const ws = r?.warnings || [];
          store.notify(ws.length ? 'warning' : 'success',
            ws.length ? `${ws.length} 项 SQL 失能字段，建议改用 Lucene/DSL` : '字段完全兼容 SQL');
        } catch (e: any) { store.notify('error', '体检失败：' + (e?.message || e)); }
      } },
    { id: 'monitor-dsl-to-lucene', title: '把当前 DSL 翻译为 Lucene', sub: '从 DSL 页读 body · 启发式抽取 query_string · 跳转 /lucene', cat: 'monitor', icon: ArrowLeftRight,
      action: () => {
        const body = sessionStorage.getItem('es-console.dsl.body') || '';
        if (!body.trim()) { store.notify('warning', '无 DSL body，先在 DSL 页面写一份'); return; }
        try {
          const obj = JSON.parse(body);
          const lc = dslToLucene(obj);
          sessionStorage.setItem('es-console.lucene.q', lc);
          /* lucene.index 同取 DSL 镜像的所属索引 */
          const idx = sessionStorage.getItem('es-console.dsl.index') || store.pickedIdx;
          if (idx) sessionStorage.setItem('es-console.lucene.index', idx);
          router.push({ path: '/search', query: { mode: 'lucene' } });
        } catch (e: any) { store.notify('error', '解析失败：' + (e?.message || e)); }
      } },
    /* 索引运维中枢 · mapping/分词/同义词/analysis/插件 */
    { id: 'index-mapping', title: 'Mapping 设计器（字段树 + 加字段）', sub: '可视化嵌套/multi-fields · 点分路径自动 wrap', cat: 'index', icon: FolderTree,
      action: () => router.push('/mapping-designer') },
    { id: 'index-analyzer', title: '分词实验室（_analyze 多列对比）', sub: 'standard/ik*/custom（tokenizer+char_filter+filter）并排', cat: 'index', icon: FlaskConical,
      action: () => router.push('/analyzer-lab') },
    { id: 'index-synonyms', title: '同义词字典（ES 7.10 inline synonym_graph）', sub: '逗号/箭头双语法 · close→PUT→open · 自动热重载', cat: 'index', icon: BookText,
      action: () => router.push('/synonyms') },
    { id: 'index-analysis', title: 'Analysis 全景（当前索引）', sub: 'analyzer/tokenizer/filter/char_filter/normalizer 一屏看全', cat: 'index', icon: Sliders,
      action: () => router.push('/analysis-settings') },
    { id: 'index-plugins', title: '插件矩阵（集群体检）', sub: '节点×插件 + mismatches 告警 + SSH 安装指南', cat: 'index', icon: PackageOpen,
      action: () => router.push('/plugins') },
    { id: 'index-analyze-current', title: '试跑当前索引的分词器', sub: '默认多列对比 standard/whitespace/ik_max_word', cat: 'index', icon: FlaskConical,
      action: () => {
        if (!store.pickedIdx) { store.notify('warning', '请先在左侧选中索引'); return; }
        router.push('/analyzer-lab');
      } },
    { id: 'index-reload-analyzers', title: '热重载当前索引的搜索分词器', sub: '_reload_search_analyzers · 同义词改后一键生效', cat: 'index', icon: Zap,
      action: async () => {
        if (!store.pickedIdx) { store.notify('warning', '请先在左侧选中索引'); return; }
        try { await api.reloadAnalyzers(store.pickedIdx); store.notify('success', '搜索分词器已热重载'); }
        catch (e: any) { store.notify('error', '热重载失败：' + (e?.message || e)); }
      } },
    /* 相关性打分实验室 · explain/排名/调参/矩阵/X光 */
    { id: 'query-score', title: '打分解剖（search + explain）', sub: '每个命中的 BM25 因子树 · tf/idf/boost/norm 贡献百分比', cat: 'query', icon: Microscope,
      action: () => router.push('/score-explain') },
    { id: 'query-rank', title: '排名侦探（why-not + A/B 对决）', sub: '_explain 单文档诊断 · 两文档打分树并排 diff', cat: 'query', icon: SearchCheck,
      action: () => router.push('/rank-debug') },
    { id: 'query-boost', title: 'Boost 调参沙盒', sub: '字段权重滑杆 · 重跑对比排名↑↓ · 导出最终 DSL', cat: 'query', icon: SlidersHorizontal,
      action: () => router.push('/boost-tuner') },
    { id: 'query-matrix', title: '子句命中矩阵（named queries）', sub: '每条结果命中哪些子句 · 没起作用的子句现形', cat: 'query', icon: Grid3x3,
      action: () => router.push('/match-matrix') },
    { id: 'query-xray', title: '查询 X 光（rewrite + 词频取证）', sub: '_validate 改写透视 · _termvectors tf/doc_freq/ttf', cat: 'query', icon: ScanSearch,
      action: () => router.push('/query-xray') },
    /* 搜索模板中心 + 别名管控台 */
    { id: 'govern-tpl', title: '搜索模板中心（填空即查）', sub: 'mustache 模板 CRUD · 参数自动提取 · _render 预览', cat: 'govern', icon: LayoutTemplate,
      action: () => router.push('/search-templates') },
    { id: 'govern-alias', title: '别名管控台（原子切换）', sub: '新建/切换/设写/解绑 · 一次 _aliases 零停机', cat: 'govern', icon: Link2,
      action: () => router.push('/aliases') },
  );

  /* 索引命令全量可搜（此前只前 30，大集群搜不到）+ 最近使用置顶 +
     切换后 toast 附「打开索引工作区」直达，形成「搜→切→看」闭环 */
  const recSet = new Set(store.recentIdx);
  const recFirst = [
    ...store.recentIdx.map(n => store.indices.find(i => i.index === n)).filter(x => !!x) as typeof store.indices,
    ...store.indices.filter(i => !recSet.has(i.index)),
  ];
  for (const idxItem of recFirst) {
    list.push({
      id: 'idx-' + idxItem.index,
      title: '切换索引：' + idxItem.index,
      sub: `${idxItem['docs.count']} docs · ${idxItem['store.size']}` + (recSet.has(idxItem.index) ? ' · 最近' : ''),
      cat: '索引',
      icon: Database,
      action: () => {
        store.pick(idxItem.index);
        store.notify('success', '已切换：' + idxItem.index, {
          action: { label: '打开索引工作区', onClick: () => router.push({ path: '/indices', query: { idx: idxItem.index } }) },
        });
      },
    });
    /* -D5：索引名直达三动作——输索引名即出查询/Mapping/Settings，省一次进页面再选索引。
       深链沿  约定：目标页 useIdxState 消费 ?idx=；查询页跟 pickedIdx，先 pick 再跳 */
    const iname = idxItem.index;
    list.push(
      { id: 'idx-q-' + iname, title: '查询 ' + iname, sub: '直达查询工作台', cat: '索引', icon: Search,
        action: () => { store.pick(iname); router.push('/search'); } },
      { id: 'idx-m-' + iname, title: 'Mapping ' + iname, sub: '直达 Mapping 设计器', cat: '索引', icon: FolderTree,
        action: () => { store.pick(iname); router.push({ path: '/mapping-designer', query: { idx: iname } }); } },
      { id: 'idx-s-' + iname, title: 'Settings ' + iname, sub: '直达索引设置（热更）', cat: '索引', icon: Sliders,
        action: () => { store.pick(iname); router.push({ path: '/index-settings', query: { idx: iname } }); } },
      /* 「索引+tab」深链收尾（§5.6 债务项）——输索引名直达工作区具体 tab；
         ?idx&tab 通道 IndexHub useUrlState('tab') 现成消费，纯 palette 注入零视图改动 */
      { id: 'idx-hub-' + iname, title: '工作区 ' + iname, sub: '索引工作区 · 文档', cat: '索引', icon: Database,
        action: () => { store.pick(iname); router.push({ path: '/indices', query: { idx: iname, tab: 'docs' } }); } },
      { id: 'idx-shards-' + iname, title: '分片 ' + iname, sub: '索引工作区 · 分片诊断', cat: '索引', icon: LayoutGrid,
        action: () => { store.pick(iname); router.push({ path: '/indices', query: { idx: iname, tab: 'shards' } }); } },
    );
  }
  /* 收藏夹提升为一等公民 */
  for (const f of (store.favorites || []).slice(0, 40)) {
    list.push({
      id: 'fav-' + f.id,
      title: '⭐ ' + f.title,
      sub: `[${f.kind}] ${f.subtitle || ''}`,
      cat: '收藏',
      icon: Star,
      /* 改走统一真链路（utils/favReplay）——旧逻辑写的预填键无人消费，重放是假动作 */
      action: () => replayFavorite(f, router, (t, m) => store.notify(t, m)),
    });
  }
  return list;
});

const recent = ref<string[]>(JSON.parse(localStorage.getItem('es_cmd_recent') || '[]'));

/* /：中文别名表（拼音首字母）+ 查表逻辑抽到 utils/cmdAlias.ts——
 * 查表判据只有一处定义，且便于单测遍历全键 + 配反向变异证明。 */

/**
 * fuzzy 包含：支持直接包含 + 子序列（q 每字符按顺序在 text 中出现）。
 * 返回 -1 不匹配，否则返回分数（越小越好，0=完全包含开头）
 */
function scoreMatch(text: string, q: string): number {
  if (!q) return 0;
  const idx = text.indexOf(q);
  if (idx >= 0) return idx; // 直接包含优先
  // 子序列（每个 q 字符按顺序在 text 中出现）
  let pos = -1, gaps = 0;
  for (const ch of q) {
    const next = text.indexOf(ch, pos + 1);
    if (next < 0) return -1;
    gaps += (next - pos - 1);
    pos = next;
  }
  return 1000 + gaps; // 比直接包含优先级低
}

/* 命令组名 → 用户可读语义组（cat 原值保留参与搜索；展示层归一） */
const CAT_LABEL: Record<string, string> = {
  assist: '体检与向导',
  ops: '运维与收藏',
  data: '数据工具',
  dev: '开发与调优',
  monitor: '监控告警',
  index: '索引治理',
  query: '查询增强',
  govern: '治理与审计',
};
function catOf(cat: string): string {
  return CAT_LABEL[cat] ?? cat;
}

/* 带分组标题的行：空查询时最近使用置顶成组，其余按原 cat 分组 */
const rows = computed<{ c: Cmd; g: string }[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) {
    const rank = new Map(recent.value.map((id, i) => [id, i]));
    const rec = commands.value.filter(c => rank.has(c.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const rest = commands.value.filter(c => !rank.has(c.id));
    return [...rec.map(c => ({ c, g: '最近使用' })), ...rest.map(c => ({ c, g: catOf(c.cat) }))].slice(0, 14);
  }
  return commands.value
    .map(c => {
      const alias = aliasForTitle(c.title);
      const hay = (c.title + ' ' + (c.sub || '') + ' ' + c.cat + ' ' + alias).toLowerCase();
      return { c, s: scoreMatch(hay, q) };
    })
    .filter(x => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .slice(0, 14)
    .map(x => ({ c: x.c, g: catOf(x.c.cat) }));
});
function subOf(c: Cmd) {
  if (!query.value.trim() && recent.value.includes(c.id)) return (c.sub ? c.sub + ' · ' : '') + '最近';
  return c.sub || '';
}

watch(() => props.show, async (v) => {
  if (v) {
    query.value = '';
    active.value = 0;
    await nextTick();
    inpRef.value?.focus();
  }
});
watch(query, () => (active.value = 0));

function move(d: number) {
  active.value = (active.value + d + rows.value.length) % Math.max(1, rows.value.length);
}
function run(cmd?: Cmd) {
  if (!cmd) return;
  recent.value = [cmd.id, ...recent.value.filter(id => id !== cmd.id)].slice(0, 8);
  localStorage.setItem('es_cmd_recent', JSON.stringify(recent.value));
  close();
  cmd.action();
}
function close() {
  emit('update:show', false);
  /* 关闭即通知父组件归还焦点（键盘用户 Esc 后不悬空） */
  store.emit('palette-closed');
}
</script>

<style scoped>
.pal-mask {
  /* W8：z 收既有阶梯最近档 --z-modal-view（视图模态=1000，等价旧裸值）；局部浮层档 1150 以上留给其浮层 */
  position: fixed; inset: 0; z-index: var(--z-modal-view); background: var(--mask);
  backdrop-filter: blur(3px); display: flex; justify-content: center; padding-top: 14vh;
}
.pal {
  width: 560px; max-width: 92vw; max-height: 420px; height: fit-content;
  background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-l);
  box-shadow: var(--shadow-pop); overflow: hidden; display: flex; flex-direction: column;
}
.pal-input-row { display: flex; align-items: center; gap: var(--sp-2h); padding: var(--sp-3) 14px; border-bottom: 1px solid var(--line); }
.pal-ic { color: var(--tx2); flex-shrink: 0; }
.pal-input { flex: 1; background: transparent; border: 0; outline: 0; color: var(--tx0); font-size: var(--fs-lg); font-family: var(--font); }
.pal-input::placeholder { color: var(--tx2); }
.pal-list { max-height: 340px; padding: var(--sp-1h); }
.pal-group { padding: var(--sp-2) var(--sp-2h) 3px; font-size: var(--fs-xs); font-weight: 600; color: var(--tx2); text-transform: uppercase; letter-spacing: .07em; }
.pal-item { display: flex; align-items: center; gap: var(--sp-2h); padding: var(--sp-2) var(--sp-2h); border-radius: var(--r-s); cursor: pointer; }
.pal-item.on { background: var(--ac-soft); }
.pal-item-ic { color: var(--tx1); flex-shrink: 0; }
.pal-item.on .pal-item-ic { color: var(--ac-hi); }
.pal-item-main { flex: 1; min-width: 0; }
.pal-item-title { font-size: var(--fs-sm); font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pal-item-sub { font-size: var(--fs-xs); color: var(--tx2); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pal-item-cat { font-size: var(--fs-xs); color: var(--tx2); background: var(--bg2); padding: 1px 7px; border-radius: 99px; flex-shrink: 0; }
</style>
