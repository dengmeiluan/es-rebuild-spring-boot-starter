/* R64：查询工作台——六个查询通道（DSL/SQL/Lucene/沙盒/PIT/语法桥）收敛为一个
   多模式工作台（#/search?mode=）。本文件是纯逻辑层：模式元数据 + 旧路由重定向，
   视图壳（QueryHubView）与侧边栏/命令面板都从这里取单一真相。 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router';

interface QueryMode {
  /** URL ?mode= 值，稳定不可改（深链契约） */
  k: string;
  /** 模式名 */
  t: string;
  /** 一句话本质——帮用户 1 秒选对通道（产品文案，不是技术描述） */
  essence: string;
  /** lucide 图标名（QueryHubView 里映射为组件） */
  icon: string;
  /** 需要的最低 ES 版本（沿用 NavItem.minVer 语义：预警不禁止） */
  minVer?: string;
  /** 收敛前的独立路由（做 redirect 与文案兜底） */
  legacyPath: string;
}

export const QUERY_MODES: readonly QueryMode[] = [
  { k: 'dsl', t: 'DSL', essence: '全能主力 · 模板/变量/聚合图', icon: 'TerminalSquare', legacyPath: '/query' },
  { k: 'sql', t: 'ES-SQL', essence: '表格思维 · 会 SQL 就会查', icon: 'Database', minVer: '6.3', legacyPath: '/sql' },
  { k: 'lucene', t: 'Lucene', essence: '一行搜遍 · 数组/nested 全友好', icon: 'SearchCode', legacyPath: '/lucene' },
  { k: 'sandbox', t: '沙盒', essence: '全集群试错 · explain/profile', icon: 'Beaker', legacyPath: '/sandbox' },
  { k: 'pit', t: 'PIT 分页', essence: '深分页导出 · 破 10000 上限', icon: 'Layers', minVer: '7.10', legacyPath: '/pit-scroll' },
  { k: 'bridge', t: '语法桥', essence: 'SQL⇄DSL⇄Lucene 三态互转', icon: 'ArrowLeftRight', minVer: '6.3', legacyPath: '/sql-bridge' },
];

export const DEFAULT_MODE = 'dsl';

/** mode 值合法化：未知值回落默认（手改 URL/旧书签容错） */
export function normalizeMode(v: string | null | undefined): string {
  return QUERY_MODES.some(m => m.k === v) ? (v as string) : DEFAULT_MODE;
}

/** 旧路由 → 模式（入口收敛后 6 条旧路径 redirect 到 /search，深链/收藏/goto 键零死链） */
export const LEGACY_QUERY_PATHS: Readonly<Record<string, string>> = Object.freeze(
  QUERY_MODES.reduce<Record<string, string>>((acc, m) => { acc[m.legacyPath] = m.k; return acc; }, {})
);

/** 构造 redirect 目标：保留原 query 全部参数（?idx=&dsl= 等现场），叠加 mode */
export function legacyRedirect(path: string, query: LocationQuery): { path: string; query: LocationQueryRaw } {
  return { path: '/search', query: { ...query, mode: LEGACY_QUERY_PATHS[path] || DEFAULT_MODE } };
}

/* ==== R64：开发场景直达层 ====
   开发者不是带着「我要写 DSL」来的，而是带着任务来的：数据写进去没有？按 ID 捞一条看看？
   字段回填漏了多少？场景任务把这些日常动作一键翻译成 DSL 预填进编辑器——
   既是快捷方式，也是活的 DSL 教材（用户看到生成的语句即学会）。 */

export interface QuickTask {
  k: string;
  t: string;
  /** 场景描述（开发者的原话，不是 ES 术语） */
  scene: string;
  /** 需要用户补充的输入（如文档 ID / 字段名）；无则一键直达。
     W1 Task 4：kind='field' 标记字段名语义——视图层换 FieldPicker（mapping 补全），其余保持纯手输；
     typeFilter 透传 FieldPicker 类型过滤（如 recent 只出 date 字段），无该标记的任务传 undefined */
  input?: { placeholder: string; kind?: 'field'; typeFilter?: string };
  /** 生成 DSL（input 为用户输入，一键型忽略） */
  build: (input: string) => string;
}

export const QUICK_TASKS: readonly QuickTask[] = [
  {
    k: 'by-id', t: '按 ID 捞文档', scene: '刚写入一条数据，按 _id 验证它真的进去了',
    input: { placeholder: '文档 _id，多个用逗号分隔' },
    build: (input: string) => JSON.stringify({
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
    build: (input: string) => JSON.stringify({
      query: { bool: { must_not: [{ exists: { field: input.trim() } }] } }, size: 10,
      track_total_hits: true,
    }, null, 2),
  },
  {
    k: 'recent', t: '看最新写入', scene: '按时间字段倒序，确认最近的数据进来了',
    input: { placeholder: '时间字段名，如 create_time', kind: 'field', typeFilter: 'date' },
    build: (input: string) => JSON.stringify({
      query: { match_all: {} }, size: 10,
      sort: [{ [input.trim()]: { order: 'desc' } }],
    }, null, 2),
  },
];

/** DSL → ?dsl= 深链参数（与 DslQueryView 的 atob 解码契约一致） */
export function encodeDslParam(dsl: string): string {
  return btoa(unescape(encodeURIComponent(dsl)));
}
