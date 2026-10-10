import { createRouter, createWebHashHistory, type LocationQuery } from 'vue-router';
import { legacyRedirect, LEGACY_QUERY_PATHS } from './utils/queryHub';
import { useAuthStore } from './stores/auth';
import { useAppStore } from './stores/app';
import pagesContract from '../../src/main/resources/META-INF/es-console-pages.json';

/* 侧边栏分组与导航项（2.5.0 起）从页面契约 es-console-pages.json 派生——
   契约是 Java 拦截器 / 本前端 / 宿主菜单注册器三端的唯一事实源，禁止回到手工维护（防漂移）。
   组序 = 契约 sort 升序；NavItem.key = 契约 hotkey（vim 跳转与 ⌘K 沿用）。
    IA 分组语义、 查询入口收敛等历史决策已固化进契约文件。 */
export const NAV_GROUPS: readonly { id: string; name: string }[] =
  [...pagesContract.groups].sort((a, b) => a.sort - b.sort).map(g => ({ id: g.id, name: g.name }));

/*  §8.4：导航项类型——minVer 为功能要求的最低 ES 版本（major.minor），
   当前集群版本低于它时侧边栏入口显示「需 x.x+」降级徽标（预警不禁止，不允许点进去才 400）。
   2.5.0 增 pageKey：页面级授权（菜单 SPI）的判定单元，与契约 pages[].key 一一对应。 */
interface NavItem {
  path: string; name: string; icon: string; key: string; group: string;
  pageKey: string; minVer?: string;
}

export const NAV_ITEMS: readonly NavItem[] = pagesContract.pages.map(p => ({
  path: p.route, name: p.name, icon: p.icon, key: p.hotkey, group: p.group,
  pageKey: p.key, minVer: p.minVer ?? undefined,
}));

/* 连接模型键解析(与后端 EnvPagesResolver.connPagesOf/effectivePages 同构):
   grantedPages 键 = conn:{connId}:{pageKey} / conn:{connId}:w:{pageKey}(写键页面同可见,写门另判)
   + 静态 key(全局页,对所有目标生效)。targetId 空=宿主(host 下仅静态键可见——连接键不跨连接)。
   返回 null 仅当 grantedPages 未启用(null),语义与三态一致。 */
const CONN_KEY_RE = /^conn:([^:]+):(?:w:)?(.+)$/;

export function effectivePagesForTarget(
  grantedPages: readonly string[] | null,
  targetId: string | null | undefined,
): Set<string> | null {
  if (grantedPages == null) return null;
  const tid = targetId || 'host';
  const out = new Set<string>();
  for (const g of grantedPages) {
    const m = CONN_KEY_RE.exec(g);
    if (m) {
      if (m[1] === tid) out.add(m[2]);
    } else {
      out.add(g);
    }
  }
  return out;
}

/* 2.5.0 页面级授权判定（纯函数，守卫/侧栏/App.vue 复核共用）：
   grantedPages=null 未启用（内置身份/宿主未下发/逃生阀/probe 未完成）→ 全量放行；
   非页面路由（/forbidden、404、legacy 重定向）不拦——否则全拒用户连提示页都进不去。
   targetId 缺省=宿主：静态键模型行为与既有 includes 逐字节一致，连接键模型按当前目标收缩。 */
export function pageAllowed(
  grantedPages: readonly string[] | null,
  path: string,
  targetId?: string | null,
): boolean {
  if (grantedPages == null) return true;
  const item = NAV_ITEMS.find(n => n.path === path);
  if (!item) return true;
  const eff = effectivePagesForTarget(grantedPages, targetId);
  return eff !== null && eff.has(item.pageKey);
}

/* 2.5.0 页面级授权：拒绝时的统一跳转构造（守卫/App 复核共用）。放行返回 null。 */
export function pageDeniedRedirect(
  grantedPages: readonly string[] | null,
  path: string,
  targetId?: string | null,
) {
  if (pageAllowed(grantedPages, path, targetId)) return null;
  const item = NAV_ITEMS.find(n => n.path === path)!;
  return { path: '/forbidden', query: { page: item.pageKey, name: item.name } };
}

/* 超宽屏（≥1920）居中豁免：theme.css §9「.page 用 padding 居中，表格密度页可豁免」的
   承诺由本集合 + App.vue（.page.page-wide 覆盖居中 padding）兑现（theme.css 本批冻结，
   机制落 router/App）。wide 判据 = 内容主体是表格/编辑器/宽表单的数据密集页：
   查询工作台群 / 索引工作区群 / 重建迁移群 / 开发者工具群 / 各表格观测页全覆盖；
   纯阅读（/favorites 收藏列表、/templates-gallery 模板画廊）与向导/错误页
   （/forbidden、404）保持居中不进本集合。
   豁免记档（裁决）：/browser、/diag、/search 三页页头由工具条/模式切换器承担，
   不补 PageHeader。 */
const WIDE_ROUTES: ReadonlySet<string> = new Set([
  /* 概览/索引工作区群 */
  '/overview', '/indices', '/mapping', '/browser', '/index-settings', '/aliases',
  '/mapping-designer', '/analysis-settings', '/synonyms',
  /* 查询工作台群 */
  '/search', '/analyze',
  /* 重建迁移群 */
  '/xmigrate', '/adhoc-rebuild', '/reindex-advanced', '/reindex-preview',
  '/update-by-query', '/bulk', '/workspace',
  /* 开发者工具群 */
  '/devtools', '/rest', '/painless-lab', '/doc-diff', '/config-validator', '/config-drift',
  /* 表格/画布观测页 */
  '/diag', '/system', '/tasks', '/task-tree', '/snapshots', '/slm', '/watcher',
  '/ilm', '/lifecycle', '/remote-clusters', '/security', '/plugins', '/health-report',
  '/live', '/topology', '/profile-flame', '/templates', '/optimizer', '/cluster-settings',
  /* 相关性实验室群（W1b 校验补遗：/analyzer-lab 分词实验室多 lane 并排对比+字段清单，
     数据密集与 match-matrix 同族，不豁免会被 1600px 居中压窄对比列） */
  '/score-explain', '/rank-debug', '/boost-tuner', '/match-matrix', '/query-xray',
  '/search-templates', '/analyzer-lab',
]);

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    { path: '/overview', component: () => import('./views/OverviewView.vue') },
    { path: '/indices', component: () => import('./views/IndexHubView.vue') },
    /* 查询工作台（六模式一页）+ 旧查询路由零死链重定向（收藏/⌘K/goto/分享链接全保参数） */
    { path: '/search', component: () => import('./views/QueryHubView.vue') },
    ...Object.keys(LEGACY_QUERY_PATHS).map(p => ({
      path: p,
      redirect: (to: { query: Record<string, unknown> }) => legacyRedirect(p, to.query as LocationQuery),
    })),
    { path: '/mapping', component: () => import('./views/MappingView.vue') },
    { path: '/browser', component: () => import('./views/BrowserView.vue') },
    { path: '/rest', component: () => import('./views/RestView.vue') },
    { path: '/diag', component: () => import('./views/DiagView.vue') },
    { path: '/xmigrate', component: () => import('./views/XmigrateView.vue') },
    { path: '/system', component: () => import('./views/SystemView.vue') },
    { path: '/tasks', component: () => import('./views/TasksView.vue') },
    { path: '/analyze', component: () => import('./views/AnalyzeView.vue') },
    { path: '/aliases', component: () => import('./views/AliasesView.vue') },
    { path: '/topology', component: () => import('./views/TopologyView.vue') },
    { path: '/templates', component: () => import('./views/TemplatesView.vue') },
    { path: '/snapshots', component: () => import('./views/SnapshotsView.vue') },
    { path: '/index-settings', component: () => import('./views/IndexSettingsView.vue') },
    { path: '/ilm', component: () => import('./views/IlmView.vue') },
    { path: '/cluster-settings', component: () => import('./views/ClusterSettingsView.vue') },
    { path: '/task-tree', component: () => import('./views/TaskTreeView.vue') },
    { path: '/reindex-preview', component: () => import('./views/ReindexPreviewView.vue') },
    { path: '/health-report', component: () => import('./views/HealthReportView.vue') },
    { path: '/templates-gallery', component: () => import('./views/TemplateGalleryView.vue') },
    { path: '/optimizer', component: () => import('./views/IndexOptimizerView.vue') },
    /*  */
    { path: '/slm', component: () => import('./views/SlmView.vue') },
    { path: '/watcher', component: () => import('./views/WatcherView.vue') },
    { path: '/remote-clusters', component: () => import('./views/RemoteClustersView.vue') },
    { path: '/favorites', component: () => import('./views/FavoritesView.vue') },
    { path: '/reindex-advanced', component: () => import('./views/ReindexAdvancedView.vue') },
    /*  */
    { path: '/workspace', component: () => import('./views/WorkspaceView.vue') },
    { path: '/bulk', component: () => import('./views/BulkEditorView.vue') },
    { path: '/update-by-query', component: () => import('./views/UpdateByQueryView.vue') },
    { path: '/doc-diff', component: () => import('./views/DiffEditorView.vue') },
    /*  */
    { path: '/devtools', component: () => import('./views/DevToolsView.vue') },
    /* 合并：旧 /cluster-map（圆环拓扑）并入 /topology，保留重定向防旧深链/收藏 404 */
    { path: '/cluster-map', redirect: '/topology' },
    { path: '/profile-flame', component: () => import('./views/ProfileFlameView.vue') },
    { path: '/live', component: () => import('./views/LiveDashboardView.vue') },
    { path: '/painless-lab', component: () => import('./views/PainlessLabView.vue') },
    { path: '/lifecycle', component: () => import('./views/LifecycleView.vue') },
    /*  */
    { path: '/mapping-designer', component: () => import('./views/MappingDesignerView.vue') },
    { path: '/analyzer-lab', component: () => import('./views/AnalyzerLabView.vue') },
    { path: '/synonyms', component: () => import('./views/SynonymsManagerView.vue') },
    { path: '/analysis-settings', component: () => import('./views/AnalysisSettingsView.vue') },
    { path: '/plugins', component: () => import('./views/PluginsView.vue') },
    { path: '/score-explain', component: () => import('./views/ScoreExplainView.vue') },
    { path: '/rank-debug', component: () => import('./views/RankDebugView.vue') },
    { path: '/boost-tuner', component: () => import('./views/BoostTunerView.vue') },
    { path: '/match-matrix', component: () => import('./views/MatchMatrixView.vue') },
    { path: '/query-xray', component: () => import('./views/QueryXrayView.vue') },
    /*  */
    { path: '/search-templates', component: () => import('./views/SearchTemplatesView.vue') },
    /*  */
    { path: '/security', component: () => import('./views/SecurityView.vue') },
    { path: '/adhoc-rebuild', component: () => import('./views/AdhocRebuildView.vue') },
    /*  */
    { path: '/config-validator', component: () => import('./views/ConfigValidatorView.vue') },
    { path: '/config-drift', component: () => import('./views/ConfigDriftView.vue') },
    /* 2.5.0：页面级授权拒绝落地页（不进 NAV_ITEMS——守卫对非页面路由不拦，全拒用户可达） */
    { path: '/forbidden', component: () => import('./views/ForbiddenView.vue') },
    /* 未匹配路由兜底——静默空白是产品事故，给 404 页 + 相近路由猜测 */
    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue') },
  ].map(r => (WIDE_ROUTES.has(r.path) ? { ...r, meta: { wide: true } } : r)),
});

/* 部署换 hash 后，旧标签页点新路由会动态 import 旧资产 404 白屏——
   检测到 chunk 加载失败则整页刷新拉新资产（sessionStorage 防死循环，同一轮只自愈一次） */
const CHUNK_RETRY_KEY = 'es-console.chunk-retry';
router.onError((err, to) => {
  const msg = String((err as any)?.message || err);
  if (!/dynamically imported module|Loading chunk|module script failed/i.test(msg)) return;
  if (sessionStorage.getItem(CHUNK_RETRY_KEY) === '1') return;
  sessionStorage.setItem(CHUNK_RETRY_KEY, '1');
  if (to?.fullPath) location.hash = to.fullPath;
  location.reload();
});

/* 2.5.0 页面级授权守卫：probe 完成前 grantedPages=null（未启用语义）首屏不拦，
   身份到达后由 App.vue watch grantedPages 复核当前路由兜底纠正（跳转构造收敛在 pageDeniedRedirect）。
   判定按当前目标连接收缩（conn:{id}:{page} 键只对目标连接生效）。 */
router.beforeEach((to) => {
  return pageDeniedRedirect(useAuthStore().grantedPages, to.path, useAppStore().target) ?? true;
});

/* 标签页标题随页面切换，多开标签可区分 */
router.afterEach((to) => {
  /* 导航成功即清自愈标记，下次部署后仍可再自愈 */
  sessionStorage.removeItem(CHUNK_RETRY_KEY);
  const item = NAV_ITEMS.find(n => n.path === to.path);
  document.title = (item ? item.name + ' · ' : '') + 'ES Console';
});
