/* 查询 DSL ↔ 节点树双向翻译（零降级，往返无损硬契约，设计文档 §3.1）。
   树即 AST：叶子保留原始 body（raw），富表单只是 raw 之上的透镜；
   未知/非标准形态落 raw，由 GenericNode 递归键值表单编辑——永远没有 JSON 文本块。
   W2 已富化 sort/_source/highlight/aggs 为一等解析（form/aggKey/presence 形态记忆）。
   无损契约的适用前提：合法 ES 形态。非法/退化输入按 best-effort 结构化归一，已知裁剪：
   _source:null→true；sort 非标项（多键/空对象/非标量 inner）；agg 同体双键（aggs+aggregations
   后者覆盖前者）；agg 非标 body（非对象/多 op 键多余键丢弃）；highlight 字段值非对象归一 {}；
   meta:null 丢弃。
   零拷贝取舍：parse 不重造子对象（params/raw 直引原 DSL），parse 后不得 mutate 原 DSL。 */
import { OPS_META } from './queryAstOps';

export type Occur = 'must' | 'filter' | 'should' | 'must_not';
export const OCCURS: Occur[] = ['must', 'filter', 'should', 'must_not'];

let seq = 0;
export const nid = (): string => 'n' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export interface LeafNode {
  id: string; type: 'leaf'; op: string;
  field: string | null;          // 标准单字段形态非空；null 时 raw 为权威
  value: unknown;
  params: Record<string, unknown>;
  raw: unknown;
  /** 条件临时停用：true 时不参与序列化(不发 ES),树与 UI 保留以便再次勾选恢复 */
  disabled?: boolean;
}
export interface BoolNode {
  id: string; type: 'bool';
  children: Array<{ occur: Occur; node: QueryNode }>;
  params: Record<string, unknown>;
  /* 各 occur 分区原始是否为数组形态（往返无损：{must:{…}} vs {must:[{…}]} 须原样还原） */
  arrForm: Partial<Record<Occur, boolean>>;
}
export interface WrapNode {
  id: string; type: 'wrap'; op: string;   // nested / has_child / has_parent
  field: string;                          // path / type / parent_type
  child: QueryNode | null;
  params: Record<string, unknown>;
}
export type QueryNode = LeafNode | BoolNode | WrapNode;

/* W2 富化：sort/_source/highlight/aggs 一等解析（形态记忆，往返无损） */
export interface SortItem { id: string; field: string; form: 'str' | 'short' | 'full'; params: Record<string, unknown> }
export interface SourceSpec { mode: 'all' | 'none' | 'one' | 'list' | 'pattern'; fields: string[]; includes: string[]; excludes: string[]; hasIncludes?: boolean; hasExcludes?: boolean }
export interface AggNode { id: string; name: string; op: string; body: unknown; children: AggNode[]; meta: Record<string, unknown>; aggKey: string; hasMeta?: boolean; hasKids?: boolean }
interface HighlightSpec { fields: Array<{ name: string; params: Record<string, unknown> }>; params: Record<string, unknown> }

export interface QueryTree {
  root: QueryNode | null;
  size?: unknown; from?: unknown;  // 非数值也原样保留（零降级）
  sort: SortItem[] | null;         // null = 键不存在；[] = 空数组保键
  source: SourceSpec | null;
  aggs: AggNode[] | null;
  aggKey?: string;                 // 顶层 aggs/aggregations 键名记忆
  highlight: HighlightSpec | null;
  extras: Record<string, unknown>; // 其余顶层键原样保留
}
type ParseResult = { ok: true; tree: QueryTree } | { ok: false; reason: string };

/* 包装算子 → 字段键名 */
export const WRAP_FIELD: Record<string, string> = { nested: 'path', has_child: 'type', has_parent: 'parent_type' };

function parseLeaf(op: string, body: unknown): LeafNode {
  const base: LeafNode = { id: nid(), type: 'leaf', op, field: null, value: null, params: {}, raw: null };
  if (op === 'match_all' || op === 'match_none') {
    if (isObj(body)) return { ...base, value: {}, params: { ...body } };
    return { ...base, raw: body };
  }
  if (op === 'exists') {
    if (isObj(body) && typeof body.field === 'string') {
      const { field, ...rest } = body;
      return { ...base, field, params: rest };
    }
    return { ...base, raw: body };
  }
  const meta = OPS_META[op];
  if (meta?.form === 'field' && isObj(body) && Object.keys(body).length === 1) {
    const field = Object.keys(body)[0];
    const inner = body[field];
    if (meta.wrap === 'none') return { ...base, field, value: inner };   // range/terms：inner 整体即值
    const vk = meta.wrap === 'query' ? 'query' : 'value';
    if (isObj(inner) && vk in inner) {
      const { [vk]: value, ...rest } = inner;
      return { ...base, field, value, params: rest };
    }
    return { ...base, field, value: inner };
  }
  return { ...base, raw: body };   // 非标准/未知 → 通用结构化节点
}

function parseBool(body: Record<string, unknown>): BoolNode {
  const n: BoolNode = { id: nid(), type: 'bool', children: [], params: {}, arrForm: {} };
  for (const [k, v] of Object.entries(body)) {
    if ((OCCURS as string[]).includes(k)) {
      n.arrForm[k as Occur] = Array.isArray(v);
      for (const item of Array.isArray(v) ? v : [v]) n.children.push({ occur: k as Occur, node: parseQueryNode(item) });
    } else n.params[k] = v;   // minimum_should_match 等
  }
  return n;
}

function parseWrap(op: string, body: Record<string, unknown>): QueryNode {
  const fk = WRAP_FIELD[op];
  if (typeof body[fk] !== 'string' || !isObj(body.query)) {
    return { id: nid(), type: 'leaf', op, field: null, value: null, params: {}, raw: body };
  }
  const { [fk]: field, query, ...params } = body;
  return { id: nid(), type: 'wrap', op, field: field as string, child: parseQueryNode(query), params };
}

export function parseQueryNode(q: unknown): QueryNode {
  if (!isObj(q)) return { id: nid(), type: 'leaf', op: '__raw__', field: null, value: null, params: {}, raw: q };
  const keys = Object.keys(q);
  if (keys.length !== 1) return { id: nid(), type: 'leaf', op: '__raw__', field: null, value: null, params: {}, raw: q };
  const op = keys[0];
  const body = q[op];
  if (op === 'bool' && isObj(body)) return parseBool(body);
  if (op in WRAP_FIELD && isObj(body)) return parseWrap(op, body);
  return parseLeaf(op, body);
}

/** 条件临时停用判定: 叶子直接标记,或 bool 组内全部子条件停用(含空组) */
function isDisabled(n: QueryNode): boolean {
  if (n.type === 'leaf') return n.disabled === true;
  if (n.type === 'bool') {
    const active = n.children.filter(c => !isDisabled(c.node));
    return active.length === 0;
  }
  return false;
}

export function serQueryNode(n: QueryNode): unknown {
  if (n.type === 'bool') {
    const out: Record<string, unknown> = { ...n.params };
    for (const o of OCCURS) {
      /* 临时停用(disabled)的子条件不参与序列化——「本次不参与」开关的语义核心 */
      const arr = n.children.filter(c => c.occur === o && !isDisabled(c.node)).map(c => serQueryNode(c.node));
      if (arr.length) out[o] = n.arrForm[o] === false && arr.length === 1 ? arr[0] : arr;
      else if (n.arrForm[o] === true) out[o] = [];   // 空数组形态原样保留
    }
    return { bool: out };
  }
  if (n.type === 'leaf' && n.disabled) return { match_none: {} };   // 停用条件单独出现在顶层时兜底为空结果(不污染查询)
  if (n.type === 'wrap') {
    return { [n.op]: { [WRAP_FIELD[n.op]]: n.field, query: n.child ? serQueryNode(n.child) : { match_all: {} }, ...n.params } };
  }
  if (n.op === '__raw__') return n.raw;
  if (n.field === null && n.raw !== null) return { [n.op]: n.raw };   // 非标准形态 raw 权威优先
  if (n.op === 'match_all' || n.op === 'match_none') return { [n.op]: { ...n.params } };
  if (n.op === 'exists') return { exists: { field: n.field, ...n.params } };
  if (n.field === null) return { [n.op]: n.raw };
  const meta = OPS_META[n.op];
  if (meta?.wrap === 'none') return { [n.op]: { [n.field]: n.value } };
  const vk = meta?.wrap === 'query' ? 'query' : 'value';
  const inner = Object.keys(n.params).length ? { [vk]: n.value, ...n.params } : n.value;
  return { [n.op]: { [n.field]: inner } };
}

export function parseTree(dsl: unknown): ParseResult {
  if (!isObj(dsl)) return { ok: false, reason: '根必须是 JSON 对象' };
  const tree: QueryTree = emptyTree();
  for (const [k, v] of Object.entries(dsl)) {
    if (k === 'query') tree.root = parseQueryNode(v);
    else if (k === 'size') tree.size = v;
    else if (k === 'from') tree.from = v;
    else if (k === 'sort') { if (Array.isArray(v)) tree.sort = v.map(parseSortItem); else tree.extras[k] = v; }
    else if (k === '_source') tree.source = parseSource(v);
    else if (k === 'highlight') { if (isObj(v)) tree.highlight = parseHighlight(v); else tree.extras[k] = v; }
    else if (k === 'aggs' || k === 'aggregations') { if (isObj(v)) { tree.aggs = parseAggs(v); tree.aggKey = k; } else tree.extras[k] = v; }
    else tree.extras[k] = v;
  }
  return { ok: true, tree };
}

export function serializeTree(t: QueryTree): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (t.root) out.query = serQueryNode(t.root);
  if (t.size !== undefined) out.size = t.size;
  if (t.from !== undefined) out.from = t.from;
  if (t.sort !== null) out.sort = t.sort.map(serSortItem);
  if (t.source !== null) out._source = serSource(t.source);
  if (t.aggs !== null) out[t.aggKey || 'aggs'] = serAggs(t.aggs);
  if (t.highlight !== null) out.highlight = serHighlight(t.highlight);
  for (const [k, v] of Object.entries(t.extras)) if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = v;
  return out;
}

/* ---- sort：form 记忆原形态；编辑加参数后自然升级 full ---- */
function parseSortItem(v: unknown): SortItem {
  const base: SortItem = { id: nid(), field: '', form: 'full', params: {} };
  if (typeof v === 'string') return { ...base, field: v, form: 'str' };
  if (isObj(v) && Object.keys(v).length >= 1) {
    const field = Object.keys(v)[0];
    const inner = v[field];
    if (typeof inner === 'string') return { ...base, field, form: 'short', params: { order: inner } };
    if (isObj(inner)) return { ...base, field, form: 'full', params: { ...inner } };
    return { ...base, field, form: 'full', params: { value: inner } };
  }
  return { ...base, field: String(v), form: 'full', params: { value: v } };
}
function serSortItem(s: SortItem): unknown {
  const keys = Object.keys(s.params);
  if (s.form === 'str' && keys.length === 0) return s.field;
  if (s.form === 'short' && keys.length === 1 && 'order' in s.params) return { [s.field]: s.params.order };
  return { [s.field]: { ...s.params } };
}

/* ---- _source ---- */
const strArr = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : [];
function parseSource(v: unknown): SourceSpec {
  const base: SourceSpec = { mode: 'all', fields: [], includes: [], excludes: [] };
  if (v === true) return base;
  if (v === false) return { ...base, mode: 'none' };
  if (typeof v === 'string') return { ...base, mode: 'one', fields: [v] };
  if (Array.isArray(v)) return { ...base, mode: 'list', fields: v.map(String) };
  if (isObj(v)) return { ...base, mode: 'pattern', includes: strArr(v.includes), excludes: strArr(v.excludes), hasIncludes: 'includes' in v, hasExcludes: 'excludes' in v };
  return base;
}
function serSource(s: SourceSpec): unknown {
  if (s.mode === 'all') return true;
  if (s.mode === 'none') return false;
  if (s.mode === 'one') return s.fields[0] ?? '';
  if (s.mode === 'list') return [...s.fields];
  const out: Record<string, unknown> = {};
  if (s.hasIncludes ?? (s.includes.length > 0)) out.includes = [...s.includes];
  if (s.hasExcludes ?? (s.excludes.length > 0)) out.excludes = [...s.excludes];
  return out;   // 无 presence 键时回落 length 判断（UI 新建路径）；全空 pattern → {} 往返一致
}

/* ---- highlight ---- */
function parseHighlight(v: Record<string, unknown>): HighlightSpec {
  const h: HighlightSpec = { fields: [], params: {} };
  for (const [k, val] of Object.entries(v)) {
    if (k === 'fields' && isObj(val)) {
      h.fields = Object.entries(val).map(([name, p]) => ({ name, params: isObj(p) ? { ...p } : {} }));
    } else h.params[k] = val;
  }
  return h;
}
function serHighlight(h: HighlightSpec): unknown {
  const fields: Record<string, unknown> = {};
  for (const f of h.fields) fields[f.name] = { ...f.params };
  return { ...h.params, fields };
}

/* ---- aggs：op=首个非 aggs/aggregations/meta 键；aggKey 记忆子聚合键名 ---- */
function parseAggs(v: unknown): AggNode[] {
  if (!isObj(v)) return [];
  return Object.entries(v).map(([name, body]) => parseAggNode(name, body));
}
function parseAggNode(name: string, body: unknown): AggNode {
  const n: AggNode = { id: nid(), name, op: '', body: {}, children: [], meta: {}, aggKey: 'aggs' };
  if (!isObj(body)) { n.body = body; return n; }
  const opKey = Object.keys(body).find(k => k !== 'aggs' && k !== 'aggregations' && k !== 'meta');
  if (opKey) { n.op = opKey; n.body = body[opKey]; }
  for (const k of ['aggs', 'aggregations'] as const) {
    if (isObj(body[k])) { n.aggKey = k; n.children = parseAggs(body[k]); n.hasKids = true; }
  }
  if (isObj(body.meta)) { n.meta = body.meta as Record<string, unknown>; n.hasMeta = true; }
  return n;
}
function serAggs(list: AggNode[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const n of list) {
    const body: Record<string, unknown> = {};
    if (n.op) body[n.op] = n.body;
    if (n.hasKids ?? n.children.length) body[n.aggKey || 'aggs'] = serAggs(n.children);
    if (n.hasMeta ?? Object.keys(n.meta).length) body.meta = n.meta;
    out[n.name] = body;
  }
  return out;
}

/* ================= 树不可变操作（组件层唯一编辑入口） =================
   全部返回新树、不改入参。删除语义：root 命中回退 match_all（root 永不缺失）；
   bool 子节点直接移除；wrap 子节点置 null（序列化兜底 match_all）。 */

export function updateNodeById(root: QueryNode, id: string, fn: (n: QueryNode) => QueryNode): QueryNode {
  if (root.id === id) return fn(root);
  if (root.type === 'bool') {
    return { ...root, children: root.children.map(c => ({ occur: c.occur, node: updateNodeById(c.node, id, fn) })) };
  }
  if (root.type === 'wrap' && root.child) return { ...root, child: updateNodeById(root.child, id, fn) };
  return root;
}

export function findNode(root: QueryNode, id: string): QueryNode | null {
  if (root.id === id) return root;
  if (root.type === 'bool') {
    for (const c of root.children) { const r = findNode(c.node, id); if (r) return r; }
    return null;
  }
  if (root.type === 'wrap' && root.child) return findNode(root.child, id);
  return null;
}

/* ancestor 的严格后代里是否含 id（不含自身）——拖拽防环用 */
function isDescendant(ancestor: QueryNode, id: string): boolean {
  const kids: QueryNode[] = ancestor.type === 'bool' ? ancestor.children.map(c => c.node)
    : ancestor.type === 'wrap' && ancestor.child ? [ancestor.child] : [];
  return kids.some(k => k.id === id || isDescendant(k, id));
}

/* 编辑致空分区连同 arrForm 标记一并消失（防序列化残留空数组键） */
function pruneArrForm(children: BoolNode['children'], arrForm: BoolNode['arrForm']): BoolNode['arrForm'] {
  const out = { ...arrForm };
  for (const o of OCCURS) if (out[o] !== undefined && !children.some(c => c.occur === o)) delete out[o];
  return out;
}

export function removeNodeById(root: QueryNode, id: string): QueryNode {
  if (root.id === id) return { id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null };
  if (root.type === 'bool') {
    const children: BoolNode['children'] = [];
    for (const c of root.children) {
      if (c.node.id === id) continue;
      children.push({ occur: c.occur, node: removeNodeById(c.node, id) });
    }
    return { ...root, children, arrForm: pruneArrForm(children, root.arrForm) };
  }
  if (root.type === 'wrap' && root.child) {
    if (root.child.id === id) return { ...root, child: null };
    return { ...root, child: removeNodeById(root.child, id) };
  }
  return root;
}

export function insertChild(root: QueryNode, boolId: string, occur: Occur, node: QueryNode): QueryNode {
  return updateNodeById(root, boolId, n =>
    n.type === 'bool' ? { ...n, children: [...n.children, { occur, node }] } : n);
}

/* 拖拽移动：dragId → targetBoolId 的 occur 分区末尾。
   移到自身/后代、root 被拖、target 非 bool 时原样返回。 */
export function moveNode(root: QueryNode, dragId: string, targetBoolId: string, occur: Occur): QueryNode {
  if (dragId === targetBoolId || root.id === dragId) return root;
  const drag = findNode(root, dragId);
  const target = findNode(root, targetBoolId);
  if (!drag || target?.type !== 'bool' || isDescendant(drag, targetBoolId)) return root;
  return insertChild(removeNodeById(root, dragId), targetBoolId, occur, drag);
}

/* 包成 bool 组：{ must: [node] }（数组形态） */
export function wrapInBool(root: QueryNode, id: string): QueryNode {
  return updateNodeById(root, id, n => ({
    id: nid(), type: 'bool', children: [{ occur: 'must', node: n }], params: {}, arrForm: { must: true },
  }));
}

/* 解散 bool-in-bool：子 bool 无 params 才允许（有参数解散会静默丢参数，UI 也不给入口）。
   子句按各自 occur 并入父组原位置；父不是 bool（root/wrap）时原样返回。 */
export function dissolveBool(root: QueryNode, id: string): QueryNode {
  if (root.type === 'bool') {
    const idx = root.children.findIndex(c => c.node.id === id);
    if (idx >= 0) {
      const target = root.children[idx].node;
      if (target.type !== 'bool' || Object.keys(target.params).length) return root;
      const children = [...root.children.slice(0, idx), ...target.children, ...root.children.slice(idx + 1)];
      return { ...root, children, arrForm: pruneArrForm(children, root.arrForm) };
    }
    return { ...root, children: root.children.map(c => ({ occur: c.occur, node: dissolveBool(c.node, id) })) };
  }
  if (root.type === 'wrap' && root.child) return { ...root, child: dissolveBool(root.child, id) };
  return root;
}

export function emptyTree(): QueryTree {
  return { root: null, sort: null, source: null, aggs: null, highlight: null, extras: {} };
}
