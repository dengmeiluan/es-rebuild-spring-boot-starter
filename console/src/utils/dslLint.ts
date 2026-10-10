/* W2-2：DSL 反模式静态检查。纯函数、零 Vue/monaco 依赖，规则可穷举单测。
   只负责「发现什么问题、锚点在哪」；把锚点换算成编辑器 range 是 MonacoEditor 的事。
   W-A：增 ctx（mapping 字段表）与「字段类型错配」规则——不传 ctx 时零回归（只跑原四规则）。
   W3：键拼写纠错包（bool 键/根键/range 操作符，仅键名与结构、零 ctx 依赖）+
   terms 标量结构错（error 档）+ multi_match fields 元素拼写（复用 mapping 字段表）。
   date-math ||复合段放行 ES 合法舍入段（数学段带 /舍入、纯舍入段）+
   multi_match fields 结构两分支（标量串=error / 缺 fields=warning，零 ctx 依赖）。
   match-all（根 query 全量扫描，SearchSandboxView 私藏红条语义下沉为规则，
   该页调用侧由 W2 迁移消费）+ search-after-no-sort（无 sort 的 search_after 必 400，
   terms-scalar 同 error 档）+ agg-size-default（terms 桶缺 size 默认 10 桶截断）+
   sort-unknown-field（sort 字段不在 mapping，unknown-field 口径）。
   root-bare-clause（根层裸子句未包 query，error）+ collapse-structure
  （collapse 标量/数组结构错，error）+ sort-order-typo（排序方向白名单 asc/desc，
   range-op-typo 同型编辑距离）+ highlight-fields（缺 fields / fields 标量串，warning）
   + script-inline（script 旧键 "inline" 未改名 "source"，warning）——五条全部零 ctx
   依赖（不传 mapping 字段表照常工作）。
   agg-text-field（聚合 field 打 text 无 .keyword → fielddata 400，warning，
   需 ctx）+ body-value-type（根层 from/size 收非数字标量，error，零 ctx）+
   agg-interval-key（date_histogram 废弃 interval / 间隔键双缺 / 双键互斥，error，零 ctx）+
   nested-path（nested 缺 path，error，零 ctx）+ query-structure（根层 query 标量/数组，
   error，零 ctx，补 root-bare-clause 只查裸子句键的盲区）+ ROOT_KEY_WHITELIST 补
   pit / runtime_mappings / preference / routing / ext / stats 六键（PitScrollView 用户
   手写 pit 不再误报 root-key-typo）。
   lintSettingsBody / lintMappingBody 精简出口（DevTools body 档路由消费，
   settings/mapping 语义不吃 search 规则——root-key-typo 的 ROOT_KEY_WHITELIST 是 search
   根键表，settings 根键 number_of_shards 进去必误报，故另立白名单）+ 新规则档
   ndjson-pair / settings-key / settings-value / mapping-key / mapping-type（DevToolsView
   _bulk 档的 NDJSON 配对告警镜像为 Finding 形态进 lint 管线）。
   FIELD_CLAUSES 收 exists（子句值形态 {"field":x}，字段引用在值位而非键位，
   walk 分派入口换参走统一 lintFieldUsage 口径——{"exists":{"field":"statuz"}} 笔误报
   unknown-field；root-bare-clause 顺带覆盖根层裸 exists）+ AGG_FIELD_METRICS 判定域
   field 值复用 unknown-field 口径（aggs.terms.field 拼错=静默空桶，文案与 lintFieldUsage
   ③ 逐字同形，monacoJsonQuickFix unknown-field 改名 fix 同通道消费）；两件都需 ctx，
   零 ctx 零回归。
   agg-type-typo（aggs.<名>.<类型> 的类型键不在聚合白名单且编辑距离 ≤2 →
   warning「最接近：」，bool-key-typo 同消息形态，monacoJsonQuickFix 同通道改名；实例名位/
   meta 伴随键豁免，零 ctx）+ date-term-value（term/match_phrase 打 date 系字段收非日期串
   「昨天」→ warning，isLegalDateValue 白名单复用，需 ctx）+ should-in-filter（bool 仅含
   should 键、无 minimum_should_match、处于 filter/must_not 语境 → hint，walk 递归带语境
   单调传递，零 ctx）。 */
import { ROOT_KEYS, MAPPING_TYPES } from './dslCompletionContext';
import { SETTINGS_CATALOG } from './indexSettingsCatalog';

type LintRule =
  | 'prefix-wildcard' | 'deep-paging' | 'huge-size' | 'missing-filter'
  | 'text-term' | 'range-type' | 'unknown-field' | 'keyword-range'
  | 'text-range' | 'text-sort' | 'date-range'
  | 'bool-key-typo' | 'root-key-typo' | 'terms-scalar' | 'range-op-typo' | 'multi-match-fields'
  | 'match-all' | 'search-after-no-sort' | 'agg-size-default' | 'sort-unknown-field'
  | 'root-bare-clause' | 'collapse-structure' | 'sort-order-typo' | 'highlight-fields' | 'script-inline'
  | 'agg-text-field' | 'body-value-type' | 'agg-interval-key' | 'nested-path' | 'query-structure'
  | 'ndjson-pair' | 'settings-key' | 'settings-value' | 'mapping-key' | 'mapping-type'
  | 'agg-type-typo' | 'date-term-value' | 'should-in-filter';

export interface Finding {
  rule: LintRule;
  /** info=纯知识性提示（不影响查询正确性判断），Monaco 接线处降级为 Hint 展示；
      error=结构必错（ES 直接拒绝请求），Monaco 接线处升 Error marker 展示 */
  severity: 'warning' | 'hint' | 'info' | 'error';
  message: string;
  suggestion: string;
  /** JSON 路径，用于人读与排序 */
  path: string;
  /** 定位锚点：该 finding 对应的键名，MonacoEditor 用 findMatches('"anchor"') 找它 */
  anchor: string;
  /** 该 anchor 键名在整份 DSL 文本中的第几次出现（0-based），与有多少条 finding 引用它无关。
      消费方做 findMatches('"anchor"') 后取 hits[nth]，所以这里数的必须是「同名键的出现次数」，
      而不是「第几条 finding」——某键出现多次但只有部分有问题时，两者会错位。 */
  nth: number;
}

/** lint 上下文：mapping 字段表（path/type），来自 useIndexFields——不传则跳过全部类型规则 */
export interface LintCtx {
  fields: { path: string; type: string }[];
}

/** 不需要打分的子句类型——全是这些时应该放 filter 走缓存 */
const NON_SCORING = new Set(['term', 'terms', 'range', 'exists']);

/** W-A：字段名作为键出现的叶子查询子句——类型错配四规则在这里的下一层（字段名键）上检查。
    收 exists：其值形态是 {"field": "x"}，字段引用在值位（键恒 'field'），
    walk 分派入口对 exists 换参后同走 lintFieldUsage；root-bare-clause 顺带覆盖根层裸 exists。 */
const FIELD_CLAUSES = new Set(['term', 'terms', 'range', 'match', 'match_phrase', 'prefix', 'fuzzy', 'wildcard', 'exists']);
const NUMERIC_TYPES = new Set(['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long']);
const RANGE_OPS = new Set(['gte', 'gt', 'lte', 'lt']);
/** date 系类型集（同 NUMERIC_TYPES 的类型集常量范式）——date range 值判型的判定域 */
const DATE_TYPES = new Set(['date', 'date_nanos']);

/* ---- W3：键拼写纠错包的数据域 ---- */
/** bool 组合法键白名单：拼错键（shoud/fitler/mustnot…）被 ES 静默忽略、条件无声丢失 */
const BOOL_KEYS = new Set(['must', 'should', 'must_not', 'filter', 'minimum_should_match', 'boost', '_name']);
/** search body 根级合法键：dslCompletionContext ROOT_KEYS 只读复用 + 常用外围键补集。
    aggs/aggregations 双合法（双拼写都在表内，互不为「拼错」）。 */
const ROOT_KEY_WHITELIST = new Set([
  ...ROOT_KEYS,
  'timeout', 'min_score', 'collapse', 'suggest', 'aggregations', 'knn',
  'post_filter', 'rescore', 'script_fields', 'search_after', 'profile', 'explain',
  'version', 'seq_no_primary_term', 'track_scores', 'terminate_after',
  'indices_boost', 'stored_fields', 'fields', 'docvalue_fields',
  /* pit（PitScrollView 用户手写 PIT 检索）/ runtime_mappings（运行时字段）/
     preference / routing（路由与副本偏好）/ ext（请求扩展段）/ stats（统计分组）——
     六键都是 ES 合法根键，缺席此前会被 root-key-typo 按编辑距离误报。 */
  'pit', 'runtime_mappings', 'preference', 'routing', 'ext', 'stats',
]);
/** range 值对象里非比较操作符的合法键——不算操作符拼写错 */
const RANGE_META_KEYS = new Set(['format', 'time_zone', 'boost', 'relation']);
/** terms 体里的标量参数键（值非数组合法） */
const TERMS_PARAM_KEYS = new Set(['boost', '_name']);
/** sort 排序方向白名单（order 值/简写串值共用；ascending/descend 等拼写 ES 直接 400） */
const SORT_ORDERS = new Set(['asc', 'desc']);
/** 带 field 参数的桶/指标聚合类型——agg-text-field 规则的判定域。
     只收打在 doc_values/fielddata 上的聚合（terms/数值指标/直方图类）；
     top_hits / nested 等无 field 参数的聚合不进集（防误扩）。 */
const AGG_FIELD_METRICS = new Set([
  'terms', 'avg', 'sum', 'min', 'max', 'stats',
  'cardinality', 'date_histogram', 'histogram', 'value_count', 'percentiles',
]);

/** 聚合类型白名单（AGG_SNIPPETS 既有 11 键为基础补常规聚合族）——
    agg-type-typo 规则的判定域。桶/指标/管道三族 + 聚合体伴随键 meta（与类型键同层合法）。
    aggs 容器自身不入表（类型位判定天然豁免，见 isAggTypePosition）；geo 系等表外聚合
    只是不提示（覆盖面缺口），nearestKey 距离 ≤2 闸保证不误报。 */
const AGG_TYPES = new Set([
  /* 桶聚合 */
  'terms', 'filter', 'filters', 'nested', 'reverse_nested', 'global', 'missing',
  'histogram', 'date_histogram', 'auto_date_histogram', 'range', 'date_range', 'ip_range',
  'sampler', 'diversified_sampler', 'composite', 'multi_terms', 'rare_terms',
  'significant_terms', 'significant_text', 'adjacency_matrix',
  /* 指标聚合 */
  'avg', 'sum', 'min', 'max', 'stats', 'extended_stats', 'cardinality', 'value_count',
  'percentiles', 'percentile_ranks', 'median_absolute_deviation', 'top_hits', 'top_metrics',
  'weighted_avg', 'string_stats', 'boxplot', 'scripted_metric',
  /* 管道聚合 */
  'avg_bucket', 'sum_bucket', 'min_bucket', 'max_bucket', 'stats_bucket', 'extended_stats_bucket',
  'percentiles_bucket', 'derivative', 'cumulative_sum', 'cumulative_cardinality',
  'bucket_script', 'bucket_selector', 'bucket_sort', 'serial_diff', 'moving_fn',
  'moving_percentiles', 'normalize',
  /* 聚合体伴随键（与类型键同层：{"aggs": {"x": {"terms": …, "meta": …}}}） */
  'meta',
]);

/** 键路径是否落在「聚合类型位」（aggs.<名>.<类型> 的第三段起）——
    距最近 aggs/aggregations 容器恰好两层才是类型位；一层=实例名（自由命名不判）；
    零层=容器自身（嵌套 aggs 键）；三层以上=类型体内参数键/子查询不判。 */
function isAggTypePosition(p: string): boolean {
  const segs = p.split('.');
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i] === 'aggs' || segs[i] === 'aggregations') return segs.length - i - 1 === 2;
  }
  return false;
}

/** W3：词表内编辑距离 ≤2 的最近合法键（找不到返回 null）——键拼写纠错的统一口径 */
function nearestKey(k: string, vocab: Set<string>): string | null {
  let best: string | null = null;
  let bestD = 3; /* >2 即弃 */
  for (const c of vocab) {
    const d = editDistance(k, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/* date range 值的「合法日期」白名单口径。
   ES 对 date 字段 range 接受：ISO 8601 日期/日期时间、now 及 now±n单位(/舍入单位) 日期数学、
   「合法基串||日期数学」复合、纯数字（epoch 毫秒——构建器 ⏰ 标准时间转换的产物即此形态，
   不放行会把自家转换结果误报成非日期串）。其余一律视为非日期串。 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
/* ||复合段两形态白名单——ES 合法舍入段此前被拒（误报）：
   ① 数学段可带 /舍入单位（"2026-01-01||+1M/d"）；② 纯舍入段（"now||/M"）无 ±n 前缀也是合法数学。
   乱写段（"2026-01-01||abc"）两形态都不匹配，仍报——防漏网意图不变。 */
const DATE_MATH_SEG_RE = /^[+-]\d+[yMwdhHms](\/[yMwdhHms])?$/;
const DATE_ROUND_SEG_RE = /^\/[yMwdhHms]$/;

function isLegalDateValue(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^\d+$/.test(t)) return true; /* epoch 毫秒（构建器 ⏰ 转换产物契约） */
  if (t === 'now' || /^now([+-]\d+[yMwdhHms])*(\/[yMwdhHms])?$/.test(t)) return true;
  if (ISO_DATE_RE.test(t)) return true;
  if (t.includes('||')) {
    const parts = t.split('||').map(p => p.trim());
    const baseOk = parts[0] === 'now' || ISO_DATE_RE.test(parts[0]);
    /* 基串合法 + 每段数学都是 ±n单位（可带 /舍入）或纯舍入段（防「2026-01-01||随便乱写」漏网） */
    return baseOk && parts.slice(1).every(m => DATE_MATH_SEG_RE.test(m) || DATE_ROUND_SEG_RE.test(m));
  }
  return false;
}

/** Levenshtein 编辑距离（小实现）：unknown-field 规则「最接近字段」候选用 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function lintDsl(obj: unknown, ctx?: LintCtx, opts?: { skipRoot?: boolean }): Finding[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const root = obj as Record<string, unknown>;
  const out: Finding[] = [];
  /* 类型错配规则依赖 mapping 字段表；无表时全部跳过（零回归） */
  const fieldMap = ctx?.fields?.length ? new Map(ctx.fields.map(f => [f.path, f.type])) : null;
  /* 每个键名的出现次数：对每一次「遇到」该键都递增，与是否产生 finding 无关。
     遍历顺序与文本顺序一致——JSON.parse 后对象的插入序即文本序，Object.entries 走插入序，
     所以按 walk 的顺序数出来的下标，正好等于 monaco 从上往下 findMatches 的命中下标。 */
  const occur = new Map<string, number>();
  /** 记下「当前这一次出现」的下标，并把计数器推进一格 */
  const markOccurrence = (key: string) => {
    const n = occur.get(key) ?? 0;
    occur.set(key, n + 1);
    return n;
  };
  /** 各 JSON 路径对应的键出现下标，由 walk 填充，供 walk 之后的 from/size/must 规则读取。
      键是完整路径（如 'size'、'query.bool.must'），值是该键名在全文里的第几次出现。 */
  const nthByPath = new Map<string, number>();

  /* ---- 规则 1：前缀通配符 ---- */
  /* parentKey：当前节点在 DSL 里的父键（如 'term'/'range'）——字段名键靠它识别语义。
     filterCtx 语境传递——进过 bool.filter/must_not 子树的节点恒处过滤语境
     （打分不适用），should-in-filter 规则靠它判定；数组元素同透，query 语境恒 false。 */
  const walk = (node: unknown, path: string, parentKey?: string, filterCtx = false) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, parentKey, filterCtx));
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      /* 无条件记下这一次出现，即使下面不产生 finding */
      const kNth = markOccurrence(k);
      /* 按路径存一份，供 walk 之后的规则读取。不能在那些规则里写死 0：
         size 也可能出现在 aggs.x.terms.size，root 的 size 未必是文本里第一个 "size"。 */
      nthByPath.set(p, kNth);
      if (k === 'wildcard' && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [field, val] of Object.entries(v as Record<string, unknown>)) {
          const s = typeof val === 'string' ? val : (val as any)?.value;
          if (typeof s === 'string' && (s.startsWith('*') || s.startsWith('?'))) {
            out.push({
              rule: 'prefix-wildcard', severity: 'warning',
              message: '前缀通配符：无法利用倒排索引，等于全表扫描',
              suggestion: '改用 match，或为该字段建 edge_ngram 子字段后用 term 查',
              path: `${p}.${field}`, anchor: 'wildcard', nth: kNth,
            });
          }
        }
      }
      if (k === 'query_string' && v && typeof v === 'object') {
        const q = (v as any).query;
        if (typeof q === 'string' && (q.startsWith('*') || q.startsWith('?'))) {
          out.push({
            rule: 'prefix-wildcard', severity: 'warning',
            message: '前缀通配符：query_string 以 * / ? 开头会全表扫描',
            suggestion: '去掉开头的通配符，或改用 match',
            path: `${p}.query`, anchor: 'query_string', nth: kNth,
          });
        }
      }
      /* 规则③：regexp 值以 .* / * 开头并入 prefix-wildcard——正则前缀全匹配
         与通配符同罪（无法利用倒排前缀词典，逐词正则求值=全表扫描）。锚点/nth 口径同上两分支。 */
      if (k === 'regexp' && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [field, val] of Object.entries(v as Record<string, unknown>)) {
          const s = typeof val === 'string' ? val : (val as any)?.value;
          if (typeof s === 'string' && (s.startsWith('.*') || s.startsWith('*'))) {
            out.push({
              rule: 'prefix-wildcard', severity: 'warning',
              message: '前缀通配符：regexp 以 .* / * 开头会逐词求值、等于全表扫描',
              suggestion: '去掉开头的 .* / *（改锚定前缀），或改用 match',
              path: `${p}.${field}`, anchor: 'regexp', nth: kNth,
            });
          }
        }
      }
      /* 规则②：sort 打 text 字段（非 .keyword 后缀）→ fielddata 高频 400。
         字段形态三种：["f"]/["f","g"]、[{"f": {"order": …}}]、[{"f": "desc"}]（含根级裸串）。
         anchor=字段名（findMatches('"字段名"')）；nth 对齐口径：对象形态的字段名是键、
         下方 walk(v) 递归会记次 → 取「即将记入的下标」（occur 现值）；纯串形态不会被记次 → 在此补记，
         两种形态与文本中出现序都对齐（同 walk 逐键记次的既有契约）。 */
      if (fieldMap && k === 'sort') {
        const entries: unknown[] = Array.isArray(v) ? v : [v];
        for (const e of entries) {
          let field: string | undefined;
          let selfMark = false;
          if (typeof e === 'string') { field = e; selfMark = true; }
          else if (e && typeof e === 'object' && !Array.isArray(e)) {
            const keys = Object.keys(e as Record<string, unknown>);
            if (keys.length === 1) field = keys[0]; /* 多键对象非 sort 约定形态，不判（防误导） */
          }
          /* _score/_doc 等元字段排序合法；未替换变量不判；.keyword 子字段是正解不判
             （：.keyword 形态即使基字段缺席 mapping 也按已知放行——带后缀
             说明写的是 multi-field 正解形态，不进 sort-unknown-field 判定防误报） */
          if (!field || field.startsWith('_') || field.includes('${') || field.endsWith('.keyword')) continue;
          /* ---- 规则：sort 字段不在 mapping（sort-unknown-field，warning 档）----
             复用 unknown-field 口径：编辑距离 ≤2 才提示（防噪音）、附最近字段候选。
             字段是纯串值时 walk 不会记次 → nth 在发现时补记；键形态走 occur 现值
             （text-sort 两种形态同款 selfMark 契约）；与 text-sort 互斥（在表内才判 text）。 */
          if (!fieldMap.has(field)) {
            let best = ''; let bestD = Infinity;
            for (const fp of fieldMap.keys()) {
              const d = editDistance(field, fp);
              if (d < bestD) { bestD = d; best = fp; if (!bestD) break; }
            }
            if (bestD <= 2) {
              out.push({
                rule: 'sort-unknown-field', severity: 'warning',
                message: `sort 字段「${field}」不在当前索引 mapping 中（最接近：${best}）——ES 对无 mapping 的排序字段直接拒绝请求（400）`,
                suggestion: `检查字段名拼写，可能是「${best}」的笔误；text 字段排序请用 ${field}.keyword 子字段`,
                path: p, anchor: field, nth: selfMark ? markOccurrence(field) : (occur.get(field) ?? 0),
              });
            }
            continue; /* 不在 mapping 就不可能是 text 字段，text-sort 判定短路（与原 !=='text' continue 等价） */
          }
          if (fieldMap.get(field) !== 'text') continue;
          out.push({
            rule: 'text-sort', severity: 'warning',
            message: `sort 打在 text 字段 ${field}：排序需要 fielddata，text 字段默认禁用（请求大概率 400）`,
            suggestion: `改用 ${field}.keyword 子字段排序，或换 date/numeric 等有 doc_values 的字段`,
            path: p, anchor: field, nth: selfMark ? markOccurrence(field) : (occur.get(field) ?? 0),
          });
        }
      }
      /* ---- W-A：字段类型错配四规则（仅在传入 mapping 字段表时启用）----
         检查点在「字段名键」上（parentKey=子句类型），anchor/nth 用字段名自身的出现序，
         与 MonacoEditor findMatches('"字段名"') 的命中下标天然对齐。
         exists 子句例外——值形态 {"field": "x"} 字段引用在值位（键恒
         'field' 不是字段名），入口换成值位字段名再走统一口径；字段名是串值非键，
         nth 走发现时补记（text-sort 纯串形态同款 selfMark 契约）。非串值（变量/
         对象形态）不判。 */
      if (fieldMap && parentKey && FIELD_CLAUSES.has(parentKey) && typeof k === 'string') {
        if (parentKey === 'exists') {
          if (k === 'field' && typeof v === 'string' && v) {
            out.push(...lintFieldUsage('exists', v, v, p, markOccurrence(v), fieldMap));
          }
        } else {
          out.push(...lintFieldUsage(parentKey, k, v, p, kNth, fieldMap));
        }
      }
      /* ---- 规则①：聚合类型拼写（agg-type-typo，warning 档，零 ctx）----
         aggs.<名>.<类型> 的类型键不在聚合白名单（AGG_TYPES：AGG_SNIPPETS 既有 11 键为基础
         补常规聚合族）且与某在册类型编辑距离 ≤2 → 疑似拼写（未知类型 ES 拒绝请求 400；
         距离 >2 可能是插件/新版类型，宁少勿噪音不报）。实例名位（距 aggs 容器一层）自由
         命名不判，meta 伴随键在册豁免。锚点=类型键自身、nth 走 kNth（bool-key-typo 同口径），
         消息同形态（「最接近：」）供 monacoJsonQuickFix 改名 action 复用。 */
      if (isAggTypePosition(p) && !AGG_TYPES.has(k)) {
        const near = nearestKey(k, AGG_TYPES);
        if (near) {
          out.push({
            rule: 'agg-type-typo', severity: 'warning',
            message: `聚合类型「${k}」疑似拼写错误（最接近：${near}）——未知聚合类型 ES 拒绝请求（400）`,
            suggestion: `改为「${near}」；聚合类型可 Ctrl+Space 补全查看（terms/date_histogram/top_hits…）`,
            path: p, anchor: k, nth: kNth,
          });
        }
      }
      /* ---- W3 规则：bool 组键拼写（零 ctx 依赖）----
         拼错键（shoud/fitler/mustnot…）被 ES 静默忽略、条件无声丢失，比报错更危险。
         anchor=拼错键本身，nth 走 markOccurrence 既有口径（kNth）。 */
      if (parentKey === 'bool' && !BOOL_KEYS.has(k)) {
        const near = nearestKey(k, BOOL_KEYS);
        if (near) {
          out.push({
            rule: 'bool-key-typo', severity: 'warning',
            message: `bool 组键「${k}」疑似拼写错误（最接近：${near}）——拼错键会被 ES 忽略，条件静默丢失`,
            suggestion: `bool 组合法键：must / should / must_not / filter / minimum_should_match / boost / _name；请确认「${k}」是否为「${near}」的笔误`,
            path: p, anchor: k, nth: kNth,
          });
        }
      }
      /* ---- 规则③：filter/must_not 语境纯 should（should-in-filter，hint 档，零 ctx）----
         bool 节点仅含 should 键、无 minimum_should_match、且处于 filter/must_not 语境：
         过滤语境不打分，纯 should 无 msm 兜底时匹配条件无声失效（查询「看似对但语义漂移」）。
         语境在 walk 递归中单调传递（进过 filter/must_not 子树的 bool 全在过滤语境，数组同透）；
         query 语境（根 query.bool）与带 must/filter 等伴键、或已写 minimum_should_match 的
         bool 不判。anchor='should'、nth 走 kNth（bool-key-typo 同口径）。 */
      if (k === 'should' && parentKey === 'bool' && filterCtx) {
        const bk = Object.keys(node as Record<string, unknown>);
        if (bk.length > 0 && bk.every(x => x === 'should')) {
          out.push({
            rule: 'should-in-filter', severity: 'hint',
            message: 'filter 语境 should 不计分，需 minimum_should_match 才生效',
            suggestion: '补 "minimum_should_match": 1 让 should 成为硬性匹配条件，或把子句改挂 must',
            path: p, anchor: k, nth: kNth,
          });
        }
      }
      /* ---- W3 规则：根级键拼写（零 ctx 依赖）----
         仅 walk 的根层（path===''）判；aggs/aggregations 双合法都在白名单内互不误报。 */
      if (path === '' && !opts?.skipRoot && !ROOT_KEY_WHITELIST.has(k)) {
        const near = nearestKey(k, ROOT_KEY_WHITELIST);
        if (near) {
          out.push({
            rule: 'root-key-typo', severity: 'warning',
            message: `根级键「${k}」疑似拼写错误（最接近：${near}）——ES 对未知根键会报 strict_dynamic_mapping_exception 或静默忽略`,
            suggestion: `请确认「${k}」是否为「${near}」的笔误；根级合法键可用 Ctrl+Space 补全查看`,
            path: p, anchor: k, nth: kNth,
          });
        }
      }
      /* ---- W3 规则：terms 值必须是数组（结构错，error 档）----
         {"terms":{"status":"active"}} 这类标量值 ES 直接 400（terms query does not support 标量）。
         值为对象=terms lookup 合法形态不判；boost/_name 等参数键是标量合法不判；
         aggs 下的 terms 是聚合体（field: "x" 标量合法），按路径前缀豁免。
         anchor=字段名键、nth 取「即将记入的下标」（occur 现值，与 text-sort 对象形态同口径）。 */
      if (k === 'terms' && !p.startsWith('aggs.') && !p.startsWith('aggregations.')
          && v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const [field, val] of Object.entries(v as Record<string, unknown>)) {
          if (TERMS_PARAM_KEYS.has(field)) continue;
          if (val !== null && typeof val === 'object') continue;
          out.push({
            rule: 'terms-scalar', severity: 'error',
            message: `terms 值必须是数组：字段 ${field} 收到标量「${String(val)}」，ES 会拒绝请求（400）`,
            suggestion: `terms 是多值精确匹配，请改为 "${field}": ["值1", "值2"]；单值精确匹配请用 term`,
            path: `${p}.${field}`, anchor: field, nth: occur.get(field) ?? 0,
          });
        }
      }
      /* ---- 规则：aggs 下 terms 桶未写 size（agg-size-default，hint 档）----
         terms 聚合缺 size 时 ES 默认只回 10 桶，长尾分布被静默截断（查询不报错、结果少得无声）。
         路径前缀口径与 terms-scalar 的豁免正好互补（aggs./aggregations. 前缀=聚合体）；
         anchor=terms 键自身、nth 走 kNth（bool-key-typo / multi-match-fields 同口径）。 */
      if (k === 'terms' && (p.startsWith('aggs.') || p.startsWith('aggregations.'))
          && v !== null && typeof v === 'object' && !Array.isArray(v)
          && (v as Record<string, unknown>).size === undefined) {
        out.push({
          rule: 'agg-size-default', severity: 'hint',
          message: 'terms 聚合未写 size：默认只返回 10 桶，长尾分布会被静默截断',
          suggestion: '按业务显式写 "size"（如 20）；关注长尾时调大 size 或用 min_doc_count 过滤噪音桶',
          path: p, anchor: k, nth: kNth,
        });
      }
      /* ---- 规则：聚合 field 打 text 字段（agg-text-field，warning 档，需 ctx）----
         terms/avg/sum 等聚合要读 fielddata/doc_values，text 字段默认禁用（请求大概率 400）。
         仅 aggs./aggregations. 路径下的聚合体判（query 子句走 lintFieldUsage 的 text-term 系）；
         .keyword 子字段与 multi-field（fieldMap 里类型非 text）豁免；不传 ctx 全哑。
         字段名在文本里是串值非键，nth 在发现时补记（text-sort 纯串形态同款 selfMark 契约）。
         ②：同判定域内 field 值不在 mapping 时复用 unknown-field 口径
         （hint 档，编辑距离 ≤2 才提示）——aggs.terms.field 拼错 ES 静默回空桶，查询
         不报错、结果少得无声，比 400 更隐蔽。文案与 lintFieldUsage ③ 逐字同形；
         .keyword 形态按基字段在场豁免（multi-field 正解形态，同 ③ 兜底口径）。 */
      if (fieldMap && AGG_FIELD_METRICS.has(k) && (p.startsWith('aggs.') || p.startsWith('aggregations.'))
          && v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const af = (v as Record<string, unknown>).field;
        if (typeof af === 'string' && af && !af.startsWith('_') && !af.includes('${')) {
          if (!af.endsWith('.keyword') && fieldMap.get(af) === 'text') {
            out.push({
              rule: 'agg-text-field', severity: 'warning',
              message: `聚合 field 打在 text 字段 ${af}：聚合需要 fielddata，text 字段默认禁用（请求大概率 400）`,
              suggestion: `改用 ${af}.keyword 子字段聚合，或换 keyword/numeric 等有 doc_values 的字段`,
              path: `${p}.field`, anchor: af, nth: markOccurrence(af),
            });
          } else if (!fieldMap.has(af) && !fieldMap.has(af.replace(/\.keyword$/, ''))) {
            let best = ''; let bestD = Infinity;
            for (const fp of fieldMap.keys()) {
              const d = editDistance(af, fp);
              if (d < bestD) { bestD = d; best = fp; if (!bestD) break; }
            }
            if (bestD <= 2) {
              out.push({
                rule: 'unknown-field', severity: 'hint',
                message: `字段「${af}」不在当前索引 mapping 中（最接近：${best}）`,
                suggestion: `检查字段名拼写，可能是「${best}」的笔误`,
                path: `${p}.field`, anchor: af, nth: markOccurrence(af),
              });
            }
          }
        }
      }
      /* ---- 规则：date_histogram 间隔键（agg-interval-key，error 档，零 ctx）----
         三分支各报一条：① 旧键 "interval" 已废弃（ES 7.2 起拆分，新版本直接 400）；
         ② calendar_interval / fixed_interval 双缺；③ 双键并存（互斥，ES 拒绝请求）。
         ① 优先（用户改掉废弃键时自然会补新键，避免同一体双报噪音）；
         histogram（数值直方图）的 interval 是合法键不进判定域。anchor=date_histogram 自身。 */
      if (k === 'date_histogram' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const dv = v as Record<string, unknown>;
        const bad = 'interval' in dv
          ? { msg: 'date_histogram 使用已废弃的 "interval" 键：ES 7.2 起拆分为 calendar_interval / fixed_interval，新版本直接拒绝请求（400）',
              sug: '把 "interval" 改为 "calendar_interval"（月/年等日历语义）或 "fixed_interval"（固定时长，如 30s/1h）' }
          : !('calendar_interval' in dv) && !('fixed_interval' in dv)
            ? { msg: 'date_histogram 缺时间间隔键：需写 calendar_interval 或 fixed_interval 之一（旧 "interval" 已废弃）',
                sug: '补 "calendar_interval": "month" 或 "fixed_interval": "1h"（按日历/固定时长语义二选一）' }
            : 'calendar_interval' in dv && 'fixed_interval' in dv
              ? { msg: 'date_histogram 的 calendar_interval 与 fixed_interval 互斥：两键并存 ES 直接拒绝请求（400）',
                  sug: '按语义二选一：日历对齐（月/周）用 calendar_interval，固定时长用 fixed_interval' }
              : null;
        if (bad) {
          out.push({
            rule: 'agg-interval-key', severity: 'error',
            message: bad.msg, suggestion: bad.sug,
            path: p, anchor: k, nth: kNth,
          });
        }
      }
      /* ---- 规则：nested 缺 path（nested-path，error 档，零 ctx）----
         query 子句与 aggs 聚合两种形态的 nested 都必须带 path（指向 mapping 里的 nested 字段），
         缺失 ES 直接拒绝请求（400）。有 path 键即放行（值合法性零 ctx 判不了，不误扩）。
         anchor=nested 自身、nth 走 kNth（bool-key-typo 同口径）。 */
      if (k === 'nested' && !(v !== null && typeof v === 'object' && !Array.isArray(v)
          && 'path' in (v as Record<string, unknown>))) {
        out.push({
          rule: 'nested-path', severity: 'error',
          message: 'nested 缺 path：不指定嵌套路径 ES 直接拒绝请求（400）',
          suggestion: '补 "path" 指向 mapping 里的 nested 字段，如 "nested": { "path": "orders", "query": … }',
          path: p, anchor: k, nth: kNth,
        });
      }
      /* ---- W3 规则：multi_match fields 结构两分支（零 ctx 依赖）----
         ① fields 写成标量串 → 结构必错（error 档，terms-scalar 同款文案口径）；
         ② 整个缺 fields 键 → 会被 ES 拒绝或零命中（warning 档）。
         fields 为对象形态（per-field boost）是 ES 合法形态不判。
         anchor=multi_match 键自身、nth 走 kNth（bool-key-typo 同口径）。 */
      if (k === 'multi_match' && v && typeof v === 'object' && !Array.isArray(v)) {
        const fl = (v as Record<string, unknown>).fields;
        if (fl === undefined || fl === null) {
          out.push({
            rule: 'multi-match-fields', severity: 'warning',
            message: 'multi_match 缺 fields：不指定检索字段会被 ES 拒绝或零命中',
            suggestion: 'multi_match 的 fields 请传字段名数组，如 "fields": ["title", "content"]',
            path: p, anchor: k, nth: kNth,
          });
        } else if (typeof fl !== 'object') {
          out.push({
            rule: 'multi-match-fields', severity: 'error',
            message: `multi_match fields 必须是数组：收到标量「${String(fl)}」，ES 会拒绝请求（400）`,
            suggestion: 'multi_match 的 fields 请传字段名数组，如 "fields": ["title", "content"]',
            path: `${p}.fields`, anchor: k, nth: kNth,
          });
        }
      }
      /* ---- W3 规则：multi_match fields 数组元素拼写（需 mapping 字段表）----
         含 * 通配项（title*）是合法的通配字段列表，跳过；非通配项不在 mapping 时
         复用 unknown-field 口径（编辑距离 ≤2 才提示，防噪音）。
         字段名在文本里是串值非键，nth 在发现时补记（text-sort 纯串形态同款 selfMark 契约）。 */
      if (fieldMap && k === 'multi_match' && v && typeof v === 'object' && !Array.isArray(v)) {
        const fl = (v as Record<string, unknown>).fields;
        if (Array.isArray(fl)) {
          for (const e of fl) {
            if (typeof e !== 'string') continue;
            const f = e.split('^')[0].trim();
            if (!f || f.includes('*') || f.includes('?') || f.startsWith('_') || f.includes('${')) continue;
            if (fieldMap.has(f) || fieldMap.has(f.replace(/\.keyword$/, ''))) continue;
            let best = ''; let bestD = Infinity;
            for (const fp of fieldMap.keys()) {
              const d = editDistance(f, fp);
              if (d < bestD) { bestD = d; best = fp; if (!bestD) break; }
            }
            if (bestD <= 2) {
              out.push({
                rule: 'unknown-field', severity: 'hint',
                message: `字段「${f}」不在当前索引 mapping 中（最接近：${best}）`,
                suggestion: `检查字段名拼写，可能是「${best}」的笔误`,
                path: `${p}.fields`, anchor: f, nth: markOccurrence(f),
              });
            }
          }
        }
      }
      /* ---- 规则：collapse 结构（collapse-structure，error 档）----
         collapse 值必须是 { 字段名: {} } 对象形态；标量串/数组 ES 直接拒绝请求（400）。
         对象形态即放行（键是否为合法字段无法零 ctx 判定，不误扩）。
         anchor=collapse 键自身、nth 走 kNth（multi-match-fields 同口径）。 */
      if (k === 'collapse' && (v === null || typeof v !== 'object' || Array.isArray(v))) {
        out.push({
          rule: 'collapse-structure', severity: 'error',
          message: `collapse 值必须是对象形态 { "字段名": {} }：收到${Array.isArray(v) ? '数组' : '标量「' + String(v) + '」'}，ES 会拒绝请求（400）`,
          suggestion: 'collapse 按字段折叠结果，请写 "collapse": { "字段名": {} }（字段须 keyword/numeric 且带 doc_values）',
          path: p, anchor: k, nth: kNth,
        });
      }
      /* ---- 规则：highlight 结构（highlight-fields，warning 档）----
         ① 整个缺 fields：ES 拒绝或整卡零高亮（无声失败）；② fields 写标量串：结构错。
         对象形态（per-field 参数）与数组形态都是合法，不判。multi-match-fields 双分支同型。
         anchor=highlight 键自身、nth 走 kNth。 */
      if (k === 'highlight' && v && typeof v === 'object' && !Array.isArray(v)) {
        const fl = (v as Record<string, unknown>).fields;
        if (fl === undefined || fl === null) {
          out.push({
            rule: 'highlight-fields', severity: 'warning',
            message: 'highlight 缺 fields：不指定高亮字段会被 ES 拒绝或整卡零高亮',
            suggestion: 'highlight 请写 "fields": { "字段名": {} }（或字段名数组 ["title"]），高亮字段须是 text/keyword',
            path: p, anchor: k, nth: kNth,
          });
        } else if (typeof fl !== 'object') {
          out.push({
            rule: 'highlight-fields', severity: 'warning',
            message: `highlight fields 必须是对象或数组：收到标量「${String(fl)}」`,
            suggestion: 'highlight 的 fields 请写对象形态 { "字段名": {} } 或字段名数组 ["title"]',
            path: `${p}.fields`, anchor: k, nth: kNth,
          });
        }
      }
      /* ---- 规则：script 旧键 inline（script-inline，warning 档）----
         ES 6.x 起 script 源码键由 "inline" 改名 "source"，7+ 对 "inline" 直接拒绝请求（400）。
         script_fields/sort script/聚合 script 等所有 script 出现处统一判；script 无
         "inline" 键（已是 source/模板 id 等合法形态）不判。
         anchor=script 键自身、nth 走 kNth（bool-key-typo 同口径）。 */
      if (k === 'script' && v && typeof v === 'object' && !Array.isArray(v)
          && 'inline' in (v as Record<string, unknown>)) {
        out.push({
          rule: 'script-inline', severity: 'warning',
          message: 'script 使用旧键 "inline"：ES 6.x 起已改名 "source"，新版本直接拒绝请求（400）',
          suggestion: '把 "inline" 键改为 "source"：如 "script": { "source": "…" }',
          path: p, anchor: k, nth: kNth,
        });
      }
      /* ---- 规则：sort 排序方向拼写（sort-order-typo，warning 档，零 ctx 依赖）----
         方向白名单只有 asc / desc；ascending/descend 等拼写 ES 直接拒绝请求（400）。
         两种形态：{"f": {"order": "ascending"}} / 简写 {"f": "ascending"}（串值即 order）。
         range-op-typo 同型编辑距离机制（nearestKey）；anchor=字段名，nth 与 text-sort 同款
         selfMark 契约（对象形态的字段名是键、下方 walk(v) 会记次 → 取 occur 现值即「即将记入
         的下标」；纯串形态不被记次 → 发现时补记）。 */
      if (k === 'sort') {
        const orderEntries: unknown[] = Array.isArray(v) ? v : [v];
        for (const e of orderEntries) {
          if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
          const kv = Object.entries(e as Record<string, unknown>);
          if (kv.length !== 1) continue;
          const [field, ov] = kv[0];
          let bad: string | null = null;
          if (typeof ov === 'string') bad = ov;
          else if (ov && typeof ov === 'object' && !Array.isArray(ov)
              && typeof (ov as Record<string, unknown>).order === 'string') {
            bad = (ov as Record<string, unknown>).order as string;
          }
          if (!bad || SORT_ORDERS.has(bad)) continue;
          /* ascending/descend 系「合法值的前缀扩展拼写」，编辑距离 >2 走不了 nearestKey——
             前缀映射优先（asc*→asc / des*→desc），乱写兜底 desc（与 ES 缺省方向一致） */
          const near = bad.startsWith('asc') ? 'asc'
            : bad.startsWith('des') ? 'desc'
            : (nearestKey(bad, SORT_ORDERS) ?? 'desc');
          out.push({
            rule: 'sort-order-typo', severity: 'warning',
            message: `sort 方向「${bad}」疑似拼写错误（最接近：${near}）——合法方向只有 asc / desc，拼错 ES 直接拒绝请求（400）`,
            suggestion: `改为 "${field}": { "order": "${near}" }（简写 "${field}": "${near}" 等价）`,
            path: p, anchor: field, nth: typeof ov === 'string' ? markOccurrence(field) : (occur.get(field) ?? 0),
          });
        }
      }
      walk(v, p, k, filterCtx || (parentKey === 'bool' && (k === 'filter' || k === 'must_not')));
    }
  };
  walk(root, '');

  /* walk 已经把每个键的每一次出现都数过了，下面的规则只能「读」rootNth 里已记录的下标，
     不能再推进计数器，否则同一个键会被数两次。 */

  /* ---- 规则 2/3：深分页与超大 size ----（仅完整 search body 语义；裸子句出口 skipRoot 跳过） */
  const hasFrom = root.from !== undefined;
  const from = typeof root.from === 'number' ? root.from : 0;
  const size = typeof root.size === 'number' ? root.size : undefined;
  if (!opts?.skipRoot && size !== undefined && from + size > 10000) {
    /* anchor 指向深分页的语义主体：显式写了 from 就指 from（含 from: 0），否则只能指 size。
       path 同步反映实际存在的键，别硬编码 'from'。 */
    const pagingKey = hasFrom ? 'from' : 'size';
    out.push({
      rule: 'deep-paging', severity: 'warning',
      message: `深分页：from + size = ${from + size}，超出 index.max_result_window 默认 10000`,
      suggestion: '改用查询工作台的 PIT 分页通道（?mode=pit），它专为深分页导出而设',
      path: pagingKey, anchor: pagingKey, nth: nthByPath.get(pagingKey) ?? 0,
    });
  }
  if (!opts?.skipRoot && size !== undefined && size > 1000) {
    out.push({
      rule: 'huge-size', severity: 'warning',
      message: `超大 size：单次取 ${size} 条，内存与传输开销大`,
      suggestion: '先用聚合看分布，或改小 size 分页取',
      path: 'size', anchor: 'size', nth: nthByPath.get('size') ?? 0,
    });
  }

  /* ---- 规则：根层 from/size 收非数字标量（body-value-type，error 档，零 ctx）----
     手写 JSON 常见把值写成串（"size":"10"——Kibana 导出/复制丢引号语境），ES 对分页参数
     类型严格，直接拒绝请求（400）。只判标量错型（串/布尔）；对象/数组等结构错型不在本规则
     判定域（不误扩）。根层语义规则，与深分页同区（裸子句出口 skipRoot 跳过）。
     anchor=键自身、nth 走 walk 已记录的 nthByPath。 */
  if (!opts?.skipRoot) {
    for (const bk of ['from', 'size'] as const) {
      const bv = root[bk];
      if (bv === undefined || typeof bv === 'number') continue;
      if (typeof bv !== 'string' && typeof bv !== 'boolean') continue;
      out.push({
        rule: 'body-value-type', severity: 'error',
        message: `根层 ${bk} 收到非数字标量「${String(bv)}」：分页参数类型严格，ES 直接拒绝请求（400）`,
        suggestion: `${bk} 请传数字，如 "${bk}": 10`,
        path: bk, anchor: bk, nth: nthByPath.get(bk) ?? 0,
      });
    }
  }

  /* ---- 规则 4：缺 filter ---- */
  const bool = (root.query as any)?.bool;
  if (bool && typeof bool === 'object') {
    const must = Array.isArray(bool.must) ? bool.must : [];
    const hasFilter = Array.isArray(bool.filter) ? bool.filter.length > 0 : !!bool.filter;
    if (must.length > 0 && !hasFilter) {
      const allNonScoring = must.every((c: unknown) => {
        if (!c || typeof c !== 'object') return false;
        const keys = Object.keys(c as Record<string, unknown>);
        return keys.length > 0 && keys.every(k => NON_SCORING.has(k));
      });
      if (allNonScoring) {
        out.push({
          rule: 'missing-filter', severity: 'hint',
          message: 'must 里全是不需要打分的条件',
          suggestion: '移到 filter 可跳过打分并走查询缓存，通常更快',
          path: 'query.bool.must', anchor: 'must', nth: nthByPath.get('query.bool.must') ?? 0,
        });
      }
    }
  }

  /* ---- 规则：match_all / 空 query 全量扫描（match-all，warning 档）----
     SearchSandboxView 私藏红条语义下沉为规则（该页调用侧由 W2 迁移消费）。根 query 顶层
     含 match_all 键 = 原页 isMatchAll（'match_all' in q）口径原样保留，含 boost 等参数形态
     一并命中；另补空对象 query（{}）等价 match_all 形态。bool 子句内嵌的 match_all 不判
     （只看根 query 顶层，与原口径一致防误报扩散）；无 query 键不判（纯聚合/统计请求合法）。
     anchor：match_all 形态锚 match_all 键、空 query 形态锚 query 键（findMatches 可定位）。 */
  const rootQuery = root.query;
  if (rootQuery && typeof rootQuery === 'object' && !Array.isArray(rootQuery)) {
    if ('match_all' in (rootQuery as Record<string, unknown>)) {
      out.push({
        rule: 'match-all', severity: 'warning',
        message: 'match_all 全量扫描：不设任何过滤条件会遍历全索引',
        suggestion: '加 term/range 条件缩小范围；确需全量导出请走 PIT 分页通道（?mode=pit）',
        path: 'query.match_all', anchor: 'match_all', nth: nthByPath.get('query.match_all') ?? 0,
      });
    } else if (Object.keys(rootQuery as Record<string, unknown>).length === 0) {
      out.push({
        rule: 'match-all', severity: 'warning',
        message: '空 query 等价 match_all，会命中整个索引',
        suggestion: '加 term/range 条件缩小范围；确需全量导出请走 PIT 分页通道（?mode=pit）',
        path: 'query', anchor: 'query', nth: nthByPath.get('query') ?? 0,
      });
    }
  }

  /* ---- 规则：根层 query 结构（query-structure，error 档，零 ctx）----
     query 为标量/数组 = 子句没包对象外壳（补 root-bare-clause 只查裸子句键的盲区：
     {"query":"term"} / {"query":["term"]} 这类 query 键在场但值形态错的形态），
     ES 直接拒绝请求（400）。正常对象 query（含 match-all 两形态）不进判定；
     null 与缺 query 键不判（纯聚合/统计请求合法）。根层语义规则，skipRoot 跳过
     （root-bare-clause 同区）。anchor=query 自身、nth 走 nthByPath。 */
  {
    const q = root.query;
    const qBad = q !== undefined && (typeof q === 'string' || typeof q === 'number'
      || typeof q === 'boolean' || Array.isArray(q));
    if (!opts?.skipRoot && qBad) {
      out.push({
        rule: 'query-structure', severity: 'error',
        message: `query 必须是对象形态：收到${Array.isArray(q) ? '数组' : '标量「' + String(q) + '」'}，ES 会拒绝请求（400）`,
        suggestion: '查询子句请包在 query 对象里，如 "query": { "term": … }；多条件组合用 query.bool（must/should/filter）',
        path: 'query', anchor: 'query', nth: nthByPath.get('query') ?? 0,
      });
    }
  }

  /* ---- 规则：search_after 无 sort（search-after-no-sort，error 档）----
     非 PIT 上下文里 search_after 必须配合 sort，否则 ES 直接拒绝请求（400）——与 terms-scalar
     同档结构必错。根级带 pit 参数时 ES 隐式 _shard_doc 排序属合法形态，豁免不判。
     根级才判（search_after 不是子句键，嵌套出现非 search body 约定形态）。 */
  if (root.search_after !== undefined && root.sort === undefined && root.pit === undefined) {
    out.push({
      rule: 'search-after-no-sort', severity: 'error',
      message: 'search_after 必须配合 sort 使用：无排序上下文时 ES 直接拒绝请求（400）',
      suggestion: '补 sort（通常沿用上一页响应的排序字段）；PIT 检索（根级 pit 参数在场）可省略 sort',
      path: 'search_after', anchor: 'search_after', nth: nthByPath.get('search_after') ?? 0,
    });
  }

  /* ---- 规则：根层裸子句（root-bare-clause，error 档）----
     {"term":{"status":1}} 直接当 search body 发——子句没包 query，ES 对根级未知键
     直接 400（parsing_exception 或 strict 口径视版本）。常见于复制查询片段时漏了外壳。
     根层出现 FIELD_CLAUSES 键本身就等于「未包 query」（合法 DSL 根层只有 ROOT_KEY_WHITELIST
     的键），无需再判 query 缺席；bool 组内嵌套等深层子句不受影响（只看根层）。
     逐键一条（每键独立定位）；anchor=子句键自身、nth 走 walk 已记录的 nthByPath。 */
  for (const k of Object.keys(root)) {
    if (opts?.skipRoot || !FIELD_CLAUSES.has(k)) continue;
    out.push({
      rule: 'root-bare-clause', severity: 'error',
      message: `子句「${k}」裸在根层：需包在 query 里，ES 对根级未知键直接 400`,
      suggestion: `改为 { "query": { "${k}": … } }；多条件组合用 query.bool（must/should/filter）`,
      path: k, anchor: k, nth: nthByPath.get(k) ?? 0,
    });
  }

  return out;
}

/* 裸子句 lint 出口：别名过滤 cFilter、rollover 条件这类「本身就是子句」的输入，
   跳过仅对完整 search body 有意义的根级规则（root-key-typo / root-bare-clause /
   深分页·超大 size / body-value-type / query-structure），
   其余键级规则全量保留——接 lintDsl 会把子句键误报成根级拼写错误。 */
export function lintClause(obj: unknown, ctx?: LintCtx): Finding[] {
  return lintDsl(obj, ctx, { skipRoot: true });
}

/* ═══ W-A：字段类型错配规则（需要 mapping 字段表） ═══
   ① text-term     term/terms/wildcard 打在 text 字段且无 .keyword 后缀 → warning（terms 并入）
   ② range-type    range 值与字段类型错配（numeric 字段传非数值串）→ warning
   ③ unknown-field 字段名不在 mapping → hint 附编辑距离最近字段（≤2 才提示）
   ④ keyword-range range 打在 keyword 字段 → info「keyword 的 range 按字典序比较」
   ⑤ text-range    range 打在 text 字段 → warning（：分词后词项上字典序比较，语义失真）
   ⑥ date-range    range 值与 date 字段错配（非日期串）→ warning（）
   + text-sort     sort 打 text 字段 → warning（；形态判定在 walk 的 sort 键处，不走本函数）
   + range-op-typo range 值对象操作符键拼写 → warning（W3；值对象含 format/time_zone 时 ⑥ 整组豁免） */
function lintFieldUsage(
  clause: string, field: string, val: unknown, path: string, nth: number,
  fieldMap: Map<string, string>,
): Finding[] {
  /* 元字段（_id/_index/_score）不在 mapping 属正常；未替换变量 ${var} 拼写未知，都不判 */
  if (field.startsWith('_') || field.includes('${')) return [];
  const type = fieldMap.get(field);
  const out: Finding[] = [];

  /* ③ 字段不在 mapping：hint 附编辑距离最近的字段（≤2 才提示，防噪音）。
     'a.keyword' 形态的 multi-field：基字段在表里即视为已知（walkMappingTypes 会把
     fields.keyword 拍平入表，这里只是对旧 mapping 的兜底）。 */
  if (type === undefined) {
    const base = field.replace(/\.keyword$/, '');
    if (!fieldMap.has(base)) {
      let best = '', bestD = Infinity;
      for (const p of fieldMap.keys()) {
        const d = editDistance(field, p);
        if (d < bestD) { bestD = d; best = p; if (!bestD) break; }
      }
      if (bestD <= 2) {
        out.push({
          rule: 'unknown-field', severity: 'hint',
          message: `字段「${field}」不在当前索引 mapping 中（最接近：${best}）`,
          suggestion: `检查字段名拼写，可能是「${best}」的笔误`,
          path, anchor: field, nth,
        });
      }
      return out; // 未知类型不再做 ①②④ 判断
    }
    return out;
  }

  /* ① term/terms/wildcard 打 text（无 .keyword 后缀）——分词后倒排词与原值不一致，大概率查空。
     补 terms：值是数组、判型口径=数组元素存在即报（元素落分词词项与 term 同罪），
     字段类型判定与元素值形态无关（数字元素同样匹配不上分词词项）。 */
  if ((clause === 'term' || clause === 'terms' || clause === 'wildcard') && type === 'text' && !field.endsWith('.keyword')) {
    out.push({
      rule: 'text-term', severity: 'warning',
      message: `text 字段 ${clause} 不匹配分词：倒排里是分词后的词项，整串原值大概率查不到`,
      suggestion: `改用 match，或打 ${field}.keyword 子字段做精确匹配`,
      path, anchor: field, nth,
    });
  }

  /* ---- 规则②：term/match_phrase 值与 date 系字段错配（date-term-value，warning 档）----
     「昨天」「上周」这类自然语言日期串打在 date/date_nanos 字段上 ES 无法解析（400 或查空）。
     合法口径复用 isLegalDateValue 白名单（ISO / now 日期数学 / ||复合 / epoch 毫秒——数字值
     本就合法不判）；对象值形态（value/boost 参数）不在判定域（不误扩）。 */
  if ((clause === 'term' || clause === 'match_phrase') && DATE_TYPES.has(type) && typeof val === 'string'
      && val.trim() !== '' && !isLegalDateValue(val)) {
    out.push({
      rule: 'date-term-value', severity: 'warning',
      message: `${clause} 值与字段类型错配：date 字段 ${field} 收到非日期串「${val}」`,
      suggestion: `date 字段的 ${clause} 请传 ISO 日期、now 日期数学或 epoch 毫秒`,
      path, anchor: field, nth,
    });
  }

  /* ---- W3 规则：range 操作符拼写（任何已知名类型）----
     原「不在 RANGE_OPS 即 continue」会把 gtee/gte 等笔误键静默放过——ES 对未知键报错或忽略，
     边界条件无声失效。非操作符合法键（format/time_zone/boost/relation）白名单豁免；
     编辑距离 ≤2 才提示（防噪音）。anchor=字段名（与其他 range 规则同锚），path 带拼错操作符。 */
  if (clause === 'range' && val && typeof val === 'object' && !Array.isArray(val)) {
    for (const [op] of Object.entries(val as Record<string, unknown>)) {
      if (RANGE_OPS.has(op) || RANGE_META_KEYS.has(op)) continue;
      const near = nearestKey(op, RANGE_OPS);
      if (near) {
        out.push({
          rule: 'range-op-typo', severity: 'warning',
          message: `range 操作符「${op}」疑似拼写错误（最接近：${near}）——拼错键会被 ES 拒绝或忽略，边界条件静默失效`,
          suggestion: `range 合法操作符：gte / gt / lte / lt（另有 format / time_zone / boost / relation 元参数）`,
          path: `${path}.${op}`, anchor: field, nth,
        });
      }
    }
  }

  /* ② range 值与 numeric 字段错配——非数值串（含日期串/日期数学）打在数值字段上必 400 或查空 */
  if (clause === 'range' && NUMERIC_TYPES.has(type) && val && typeof val === 'object' && !Array.isArray(val)) {
    for (const [op, v] of Object.entries(val as Record<string, unknown>)) {
      if (!RANGE_OPS.has(op)) continue;
      if (typeof v === 'string' && v.trim() !== '' && Number.isNaN(Number(v))) {
        out.push({
          rule: 'range-type', severity: 'warning',
          message: `range 值与字段类型错配：数值字段 ${field} 收到非数值串「${v}」`,
          suggestion: `数值字段的 ${op} 请传数字；日期范围请打 date 类型字段`,
          path: `${path}.${op}`, anchor: field, nth,
        });
      }
    }
  }

  /* ⑥ ：range 值与 date 字段错配——非日期串打在 date 字段上 ES 无法解析（400 或查空）。
     合法口径见 isLegalDateValue 白名单（ISO/now 日期数学/||复合/epoch 毫秒）；数字值本就合法不判。
     W3 误报修复：值对象带 format/time_zone 时值串按自定义格式/时区解析，isLegalDateValue 的
     ISO 白名单不再适用——「"gte":"01/2026","format":"MM/yyyy"」是合法形态，整组跳过不判。 */
  if (clause === 'range' && DATE_TYPES.has(type) && val && typeof val === 'object' && !Array.isArray(val)) {
    const entries = Object.entries(val as Record<string, unknown>);
    const customFormat = entries.some(([rk]) => rk === 'format' || rk === 'time_zone');
    if (!customFormat) {
      for (const [op, v] of entries) {
        if (!RANGE_OPS.has(op)) continue;
        if (typeof v === 'string' && v.trim() !== '' && !isLegalDateValue(v)) {
          out.push({
            rule: 'date-range', severity: 'warning',
            message: `range 值与字段类型错配：date 字段 ${field} 收到非日期串「${v}」`,
            suggestion: `date 字段的 ${op} 请传 ISO 日期、now 日期数学或 epoch 毫秒`,
            path: `${path}.${op}`, anchor: field, nth,
          });
        }
      }
    }
  }

  /* ④ range 打 keyword——合法但按字典序比较，数值/时间语义会失真 */
  if (clause === 'range' && type === 'keyword') {
    out.push({
      rule: 'keyword-range', severity: 'info',
      message: `keyword 字段 ${field} 的 range 按字典序比较（非数值/时间语义）`,
      suggestion: '确认字典序符合预期；数值/时间范围建议改用 numeric 或 date 字段',
      path, anchor: field, nth,
    });
  }

  /* ⑤ ：range 打 text——range 是词项级字典序比较，text 分词后的词项与原值
     几乎不可比（数值/时间语义必失真），比 keyword-range 更危险，升 warning。
     'a.keyword' 形态的 multi-field 类型是 keyword，走 ④ 不会误入此分支。 */
  if (clause === 'range' && type === 'text') {
    out.push({
      rule: 'text-range', severity: 'warning',
      message: `text 字段 ${field} 的 range 在分词后的词项上按字典序比较，数值/时间语义失真`,
      suggestion: '数值/时间范围请改用 numeric 或 date 字段；文本检索用 match',
      path, anchor: field, nth,
    });
  }

  return out;
}

/* ═══  P0-2b：settings / mapping body 精简 lint（DevTools dtLint 档路由消费） ═══
   与 lintDsl 的 root-key-typo 刻意分库：ROOT_KEY_WHITELIST 是 search body 根键表，settings
   根键（number_of_shards 等）进那张表必误报。规则宁少勿误报：只做「键拼写」（编辑距离 ≤2
   才提示，nearestKey 既有口径）与「数值型设置键的值类型」（ES 对数字与数字串都宽容，
   其余标量形态才报）；彻底未知的键/类型一律静默（可能是目录外合法值/插件类型）。 */

/** settings body 根级合法键：_settings 直挂形态（index 包裹）与 create-index 形态
    （settings/mappings/aliases 并存）双兼容；裸平铺形态（根层直接放设置键）不判根键 */
const SETTINGS_ROOT_KEYS = new Set(['index', 'settings', 'mappings', 'aliases']);
/** 数值语义设置键（W1 目录的数值子集）：值必须是数字或数字串（"1" 合法，ES 宽容口径）——
    时间值键（refresh_interval 的 "1s" 等）与布尔键不进判定域 */
const SETTINGS_NUMERIC_KEYS = new Set([
  'number_of_shards', 'number_of_replicas', 'priority', 'max_result_window',
  'max_inner_result_window', 'max_script_fields', 'max_terms_count', 'max_regex_length',
  'highlight.max_analyzed_offset', 'routing.allocation.total_shards_per_node',
  'merge.policy.segments_per_tier', 'merge.policy.max_merged_segment',
  'mapping.total_fields.limit', 'mapping.nested_objects.limit', 'mapping.depth.limit',
]);
/** settings 键目录单一出处：W1 indexSettingsCatalog 静态目录（与补全/说明同源，不另写漂移表） */
const SETTINGS_KEY_VOCAB = new Set(SETTINGS_CATALOG.map(s => s.key));
/** 目录键命中：精确 + 通配段（'analysis.analyzer.*' 的前缀放行自定义组件树） */
function settingsKeyKnown(leaf: string): boolean {
  if (SETTINGS_KEY_VOCAB.has(leaf)) return true;
  for (const k of SETTINGS_KEY_VOCAB) {
    if (k.endsWith('.*') && leaf.startsWith(k.slice(0, -1))) return true;
  }
  return false;
}

/** settings 容器递归：叶子路径（点拼接）查目录拼写与数值键值型；对象继续下钻
    （analysis.analyzer.my_a 这类自定义组件树经通配段放行）。occur 记同名键出现序
    （anchor/nth 与 findMatches 文本序对齐，lintDsl 既有契约）。 */
function walkSettingsContainer(node: unknown, prefix: string, out: Finding[], occur: Map<string, number>) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const n = occur.get(k) ?? 0; occur.set(k, n + 1);
    const leaf = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      walkSettingsContainer(v, leaf, out, occur);
      continue;
    }
    /* index. 双口径剥前缀（{"index": {"index.number_of_shards": 1}} 少见但合法）再对目录 */
    const norm = leaf.replace(/^index\./, '');
    if (!settingsKeyKnown(norm)) {
      const near = nearestKey(norm, SETTINGS_KEY_VOCAB);
      if (near) {
        out.push({
          rule: 'settings-key', severity: 'warning',
          message: `设置键「${leaf}」不在设置目录中（最接近：${near}）——拼错键会被 ES 静默忽略或拒绝`,
          suggestion: `请确认「${leaf}」是否为「${near}」的笔误；设置键可 Ctrl+Space 补全查看`,
          path: leaf, anchor: k, nth: n,
        });
      }
    }
    if (SETTINGS_NUMERIC_KEYS.has(norm)) {
      const numOk = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
      if (!numOk && (typeof v === 'string' || typeof v === 'boolean')) {
        out.push({
          rule: 'settings-value', severity: 'error',
          message: `设置 ${leaf} 收到非数值「${String(v)}」：该键要求整数，ES 会拒绝请求（400）`,
          suggestion: `请传数字或数字串，如 "${norm}": 1 或 "${norm}": "1"`,
          path: leaf, anchor: k, nth: n,
        });
      }
    }
  }
}

/**  P0-2b：settings body 精简 lint（PUT _settings / create-index settings 段）。
    容器分派：root.index / root.settings 在场吃之（两者并存都吃）；全无包裹键 → 根即容器
    （裸平铺形态）。JSON 解析失败由调用侧静默（与 lintDsl 同契约）。 */
export function lintSettingsBody(obj: unknown): Finding[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const root = obj as Record<string, unknown>;
  const out: Finding[] = [];
  const occur = new Map<string, number>();
  for (const k of Object.keys(root)) {
    const n = occur.get(k) ?? 0; occur.set(k, n + 1);
    if (SETTINGS_ROOT_KEYS.has(k)) continue;
    const near = nearestKey(k, SETTINGS_ROOT_KEYS);
    if (near) {
      out.push({
        rule: 'settings-key', severity: 'warning',
        message: `根级键「${k}」疑似拼写错误（最接近：${near}）——settings body 根级合法键：index / settings / mappings / aliases`,
        suggestion: `请确认「${k}」是否为「${near}」的笔误`,
        path: k, anchor: k, nth: n,
      });
    }
  }
  const containers: unknown[] = [];
  if (root.index !== undefined) containers.push(root.index);
  if (root.settings !== undefined) containers.push(root.settings);
  if (!containers.length) containers.push(root);
  for (const c of containers) walkSettingsContainer(c, '', out, occur);
  return out;
}

/** mapping body 根级合法键（_mapping 直挂与 create-index mappings 包裹双形态）。
    字段名本身自由不判拼写；只判根键与字段 type 值。 */
const MAPPING_ROOT_KEYS = new Set([
  'mappings', 'properties', 'runtime', 'dynamic', '_source', '_meta',
  'dynamic_templates', 'dynamic_date_formats', 'date_detection', 'numeric_detection', 'enabled',
]);
/** 核心字段类型集（dslCompletionContext 目录的 Set 视图：has/includes 单一出处） */
const MAPPING_TYPES_SET = new Set(MAPPING_TYPES);

/** properties/runtime 树递归：字段 type 值不在 ES 核心类型目录（MAPPING_TYPES）且与某
    核心类型编辑距离 ≤2 才提示（彻底未知类型可能是插件类型，宁少勿误报不报）。
    anchor 钉 'type' 键名，nth 按 type 键出现序（findMatches 文本序对齐）。 */
function walkMappingProps(props: unknown, prefix: string, out: Finding[], markType: () => number) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return;
  for (const [name, def] of Object.entries(props as Record<string, unknown>)) {
    if (!def || typeof def !== 'object' || Array.isArray(def)) continue;
    const d = def as Record<string, unknown>;
    const p = prefix ? prefix + '.' + name : name;
    if (typeof d.type === 'string' && d.type && !MAPPING_TYPES_SET.has(d.type)) {
      const near = nearestKey(d.type, MAPPING_TYPES_SET);
      if (near) {
        out.push({
          rule: 'mapping-type', severity: 'warning',
          message: `字段 ${p} 的类型「${d.type}」疑似拼写错误（最接近：${near}）——未知类型 ES 拒绝请求（400）`,
          suggestion: `改为「${near}」；核心类型目录可 Ctrl+Space 查看（keyword/text/long/date/ip…）`,
          path: p, anchor: 'type', nth: markType(),
        });
      }
    }
    walkMappingProps(d.properties, p, out, markType);
    walkMappingProps(d.fields, p, out, markType);
  }
}

/**  P0-2b：mapping body 精简 lint（PUT _mapping / create-index mappings 段）。
    root.mappings 包一层时下钻一层；runtime 字段同吃 type 检查。 */
export function lintMappingBody(obj: unknown): Finding[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const root = obj as Record<string, unknown>;
  const out: Finding[] = [];
  const occur = new Map<string, number>();
  for (const k of Object.keys(root)) {
    const n = occur.get(k) ?? 0; occur.set(k, n + 1);
    if (MAPPING_ROOT_KEYS.has(k)) continue;
    const near = nearestKey(k, MAPPING_ROOT_KEYS);
    if (near) {
      out.push({
        rule: 'mapping-key', severity: 'warning',
        message: `根级键「${k}」疑似拼写错误（最接近：${near}）——mapping body 根级合法键：properties / dynamic / runtime / _source 等`,
        suggestion: `请确认「${k}」是否为「${near}」的笔误`,
        path: k, anchor: k, nth: n,
      });
    }
  }
  const mroot = root.mappings && typeof root.mappings === 'object' && !Array.isArray(root.mappings)
    ? root.mappings as Record<string, unknown> : root;
  let typeOccur = 0;
  const markType = () => typeOccur++;
  walkMappingProps(mroot.properties, '', out, markType);
  walkMappingProps(mroot.runtime, '', out, markType);
  return out;
}
