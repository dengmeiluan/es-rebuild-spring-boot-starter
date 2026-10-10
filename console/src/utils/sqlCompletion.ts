/* W2 批：SQL 智能补全单例（原 SqlBridgeView 内联 provider 抽出，SqlConsoleView 同享）。
 *
 * ES-SQL 的表名=索引名、列=字段，官方 sql 贡献（basic-languages）只有高亮 + 词表兜底，
 * 语义候选为零。此处按上下文注入三类候选（语言级注册，dispose 随最后一个使用方卸载；
 * 与 PainlessLabView params provider 同范式：闭包现读响应式最新值，triggerCharacters ['.']）。
 *
 * 单例契约：ensureSqlCompletion(monaco, getCtx) 返回 { dispose }——引用计数防重复注册：
 * SqlBridge/SqlConsole 先后挂载只注册一份 provider；每个使用方持有一个独立 { dispose }，
 * 只有最后一个 dispose 才真正注销（零间隙，中途进入的编辑器始终有候选）。
 *
 * 上下文规则（对光标前文本做尾匹配，优先级自上而下）：
 * ① FROM 表名位  /FROM\s+"?([\w.\-]*)$/i → 索引名候选：getCtx().indices() 全量清单（IndexCat.index），
 *    rank 排序复用 fieldSearch.searchFields（精确>前缀>包含，cap 50）；
 *    修复：\w 不含 -/.——连字符索引（logs-2026）与点分索引在 FROM 位失配落错分支，
 *    字符集补 [\w.\-]（只放行索引名合法字符，不扩语义）；
 * ② 限定列位    /(\w+)\.\w*$/    → 字段候选：点前表名作为索引名走 useIndexFields——
 *     A3：provider await ensure（返回 Promise），字段到位后同轮回填候选，首轮即出
 *    （原 fire-and-forget 首轮必空、要等用户下次触发；④ keyword 档先例逐字平移）；
 *    接 CLAUSE_TYPE_PRIO 按子句语境语义置顶（同 ③ 口径，候选集不变仅提供序分档）。
 * ③ 其余词位（SELECT/WHERE 直接敲列名等）→ getCtx().curFields()（当前工作索引字段源，
 *    调用方接 useIndexFields），同一异步口径；无索引零候选不扰动。
 *     R1：左扫最近子句键（SELECT/WHERE/GROUP BY/ORDER BY/LIMIT/HAVING）按词位给类型
 *    置顶序（fieldSearch typePriority 既有通道，候选集不变仅提供序分档）——ORDER BY 位
 *    date+数值族置前（range 同表）、WHERE/GROUP BY/HAVING 位 keyword 置前（term 同表）。
 * ④  值位  /=\s*'?(␣\w*)$/ →  R2 扩为比较符族（= <> != >= <= > < IN( LIKE BETWEEN）：
 *    左扫最近列名查 curFields 类型分派——keyword 列走 useTermsSuggest（当前工作索引 terms agg
 *    top 20； R3：suggestAsync promise 出口 + provideCompletionItems 返回 Promise，
 *    首轮即出不再等下次触发；context.token 取消则弃迟到回填；缓存命中防抖一拍内同步完成零网络）；
 *    date/boolean/ip/数值族出静态格式候选（LuceneInput value 段同款语义）；
 *    text/列未知零候选（值位不出字段名）。
 *    IN 列表第 2+ 项值位（`col IN ('a', 'b␣`）——主正则要求操作符紧邻值，尾项
 *    带「, '」前缀必然失配零候选；拆尾项已敲前缀 + IN( opener 定位 + 已完成项剥净校验，
 *    归一成首项形态复用本通道（LHS 列名左扫口径不变）。
 *
 * detail 列写 ES 字段类型与来源说明；'!' 前缀 sortText 升权（PainlessLab 同款，压词表兜底）。
 * Monaco 词表兜底/其他补全源不受影响，多源合并天然并存，无需禁用任何内置 provider。 */
import { ref, type Ref } from 'vue';
import { useIndexFields, type FieldItem } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest';
import { typePriorityForOp, KEYWORD_VALUE_TYPES, NUMERIC_VALUE_TYPES } from './queryAstOps';
/* 件④：值位静态档单源 TYPE_VALUE_HINTS 落地 fieldSearch。本文件仅 version/geo_point
   两档 values 引单源（值逐字同形零漂移；两档无源码字面锁，dslValueTiers545/annotWave558
   均为 toEqual 值锁保形）。boolean/ip 不可引：luceneValTiers538:25-27 对本文件源码含
   'true', 'false' / '192.168.0.1' 字面的松锚断言（自证基线）封死改写；date/数值族/wildcard
   是 SQL 语法形态（裸字面/pref%/数值示例），与 Lucene 形态分立是既有立法，保留本地。 */
import { searchFields, TYPE_VALUE_HINTS } from './fieldSearch';

type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api');

/** 调用方上下文（闭包现读响应式最新值，注册不随数据变化重挂） */
export interface SqlCompletionCtx {
  /** 集群索引全量清单（取 .index 作 FROM 表名候选） */
  indices(): Array<{ index?: string }>;
  /** 当前工作索引（③ detail 提示用；空=零扰动） */
  pickedIdx(): string;
  /** 当前索引字段源（调用方接 useIndexFields().fields.value） */
  curFields(): FieldItem[];
  /** 预载当前索引字段。 A3 起可返回 Promise（provider await 到位后回填，首轮即出）；
   *  同步 void 旧实现兼容（Promise.resolve 归一） */
  ensureCurFields(): void | Promise<void>;
}

/* ② 表名位字段源：模块级共享（provider 语言级唯一，「点前表名→字段」解析随之共享）。
   useIndexFields 内部依赖 pinia store——不能在模块顶层建，首次 ensure（组件挂载上下文内）再建。 */
const tblName: Ref<string> = ref('');
let tblCtx: ReturnType<typeof useIndexFields> | null = null;

/* ④ 值位候选源：模块级共享（与 tblCtx 同范式惰性建——useTermsSuggest 内部依赖 pinia store
   与 api，不能模块顶层建，首次 ensure（组件挂载上下文内）再建）。检索索引/列名每次命中
   ④ 时现写：索引取当前工作索引（④ 的列来自 curFields，同源），前缀取 = 后已敲字符。
   件②：补 useTermsSuggest 第二参 types（563 立法消费接线）——getCtx 在
   ensureSqlCompletion 运行参上，惰性建 valCtx 时经模块级 sqlCtxRef 现读（provider 闭包
   现读响应式最新值同范式）；curFields 归约成 path→type 表。零行为：keyword/未知字段
   rankTermsByType 原样返回，且本文件展示序走 suggestAsync 权威序自排（561 精确置顶），
   types 精化只作用 suggestions ref 程序消费面之外。 */
const valIndex: Ref<string> = ref('');
const valField: Ref<string> = ref('');
let sqlCtxRef: (() => SqlCompletionCtx) | null = null;
let valCtx: ReturnType<typeof useTermsSuggest> | null = null;

function sortAt(i: number): string { return '!' + String(i).padStart(3, '0'); }

/* keyword 族值语义类型单一出处（dslCompletionContext.AFFINITY_FAMILIES.keyword 同表
   先例；导出供 builder FieldSelect 预载 / ClauseNode datalist 聚合门槛同源消费）。
   表本体下沉 queryAstOps.KEYWORD_VALUE_TYPES（零依赖单源），此处 re-export——
   既有消费方（FieldSelect/ClauseNode/spec）import 路径与值引用均不变。
   wildcard 在族内但 SQL 值位保留 LIKE % 静态格式档（545 表锁）——terms-agg 候选档为族内去 wildcard */
export { KEYWORD_VALUE_TYPES };
const AGG_VALUE_TYPES = KEYWORD_VALUE_TYPES.filter(t => t !== 'wildcard');

/*  R1：词位 → 类型置顶序（typePriorityForOp 单一出处，候选集不变仅提供序分档——
   fieldSearch typePriority 既有通道）。ORDER BY 排序位 date+数值族置前（range 同表）；
   WHERE/GROUP BY/HAVING 过滤/分组精确语义 keyword 置前（term 同表）；
   SELECT/LIMIT/FROM 及无键零倾向 = 原 rank 序（typePriority 缺省不传，零扰动）。 */
const CLAUSE_TYPE_PRIO: Record<string, string[]> = { 'ORDER BY': typePriorityForOp('range') };
for (const c of ['WHERE', 'GROUP BY', 'HAVING']) CLAUSE_TYPE_PRIO[c] = typePriorityForOp('term');
/* 左扫最近子句键：多键并存取离光标最近的（最后命中），GROUP/ORDER 折叠中间空格 */
function clauseOf(before: string): string {
  const re = /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b/gi;
  let last = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(before)) !== null) last = m[0].toUpperCase().replace(/\s+/g, ' ');
  return last;
}

/*  R2：值位静态格式候选（LuceneInput value 段 DATE_HINTS/NUM_HINTS 同款语义，SQL 口径
   改写——比较符右侧是裸字面量，Lucene 的 >100/[10 TO 20] 形态不适用）。只提示格式不约束输入；
   text 与未知类型不在表内 → 零候选。
   导出本表供 spec 表锁（dslValueTiers545，dslCompletionContext 两姊妹表同范式）；
   补 wildcard 档——通配形态随 SQL 语法取 %（LIKE），不平移 DSL 姊妹表的 'pref*'（Lucene 语法；
   证据：SqlBridgeView 对照表「⚠ LIKE % ↔ wildcard/fuzzy DSL」；姊妹表 DSL_ARRAY_ELEM_TYPE_HINTS
   .wildcard 543 先例证 wildcard 字段类型档成立）。keyword 不入静态表=terms agg 动态候选专用。 */
export const VAL_FORMAT_HINTS: Record<string, { detail: string; values: string[] }> = {
  date: { detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] },
  /* date_nanos 档（LuceneInput 值位 7 档已含，SQL 侧对齐收口）——detail 形同 date 档，
     values 复用同形 date-math（epoch_nanos 精度不影响格式提示语义） */
  date_nanos: { detail: 'date-math 格式提示 · date_nanos', values: ['now-1d/d', 'now-1h/h'] },
  /* 记档：boolean/ip 两档 values 保留本地字面——luceneValTiers538:25-27 对本文件
     源码含 'true', 'false' / '192.168.0.1' 的松锚断言封死改写；单源同形性由
     valHintTable565 值级断言钉住（VAL_FORMAT_HINTS.boolean.values = TYPE_VALUE_HINTS.boolean）。 */
  boolean: { detail: '字面提示 · boolean', values: ['true', 'false'] },
  /*  D1：ip 档补 CIDR 形态档（192.168.0.0/24 网段匹配语法——LuceneInput IP_HINTS
     姊妹面同批对齐；只提示格式不约束输入）。 */
  ip: { detail: '字面提示 · ip', values: ['192.168.0.1', '192.168.0.0/24'] },
  /* version 档（ES version 字段类型存 semver 点分形态——只提示格式不约束输入；
     不入 KEYWORD/NUMERIC 两族，terms agg 分支天然不沾，静态档专属）。565 件④：values 收编单源 */
  version: { detail: '字面提示 · version', values: [...TYPE_VALUE_HINTS.version] },
  /* geo_point 档——'纬度,经度' 形态示例（只提示格式不约束输入）。565 件④：values 收编单源 */
  geo_point: { detail: '字面提示 · geo_point', values: [...TYPE_VALUE_HINTS.geo_point] },
  /* range 字段族值位两档——date_range 复用 date 档 date-math values 通道、
     ip_range 复用 ip 档 CIDR values 通道（detail 类型名随档，values 与姊妹档逐字同源）；
     LuceneInput RANGE_FLAT_TYPES 值位档姊妹面同批对齐。只提示格式不约束输入 */
  date_range: { detail: 'date-math 格式提示 · date_range', values: ['now-1d/d', 'now-1h/h'] },
  ip_range: { detail: '字面提示 · ip_range', values: ['192.168.0.1', '192.168.0.0/24'] },
  wildcard: { detail: 'LIKE 通配格式提示 · wildcard', values: ['pref%'] },
};
/* 数值族十口径单一出处（ D2 抽出九口径；补 token_count——分词计数=数值语义，
   值位按数值族出静态档/BETWEEN 区间形态。：改吃 queryAstOps.NUMERIC_VALUE_TYPES 单源） */
const NUMERIC_HINT_TYPES = NUMERIC_VALUE_TYPES;
for (const t of NUMERIC_HINT_TYPES) {
  VAL_FORMAT_HINTS[t] = { detail: '数值示例 · ' + t, values: ['100'] };
}

let refs = 0;
let provider: { dispose(): void } | null = null;

/** 注册 SQL 补全 provider（幂等单例）；返回独立句柄，最后一个 dispose 才注销 */
export function ensureSqlCompletion(monaco: MonacoApi, getCtx: () => SqlCompletionCtx): { dispose(): void } {
  refs++;
  sqlCtxRef = getCtx; /* 565 件②：types 工厂现读通道（valCtx 惰性建早于首调 getCtx） */
  if (!tblCtx) tblCtx = useIndexFields(() => tblName.value);
  if (!valCtx) valCtx = useTermsSuggest(() => valIndex.value, () => {
    const m: Record<string, string> = {};
    for (const f of (sqlCtxRef?.().curFields() ?? [])) m[f.path] = f.type;
    return m;
  });
  if (!provider) {
    provider = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.'],
      provideCompletionItems(model: any, position: any, _context: any, token: any) {
        const ctx = getCtx();
        const before: string = model.getValue().slice(0, model.getOffsetAt(position));
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: word.startColumn, endColumn: word.endColumn,
        };
        /* ① FROM 表名位 → 索引名候选（：字符集补 -/.，连字符/点分索引名不再失配） */
        const fromM = before.match(/FROM\s+"?([\w.\-]*)$/i);
        if (fromM) {
          const hits = searchFields({
            fields: ctx.indices().map(i => ({ path: String(i.index || ''), type: 'index' })),
            query: fromM[1],
            cap: 50,
          });
          return { suggestions: hits.flat.map((h, i) => ({
            label: h.path, kind: monaco.languages.CompletionItemKind.Field,
            insertText: h.path, detail: '索引（ES-SQL 表名）', sortText: sortAt(i), range,
          })) };
        }
        /* ② 限定列位 tbl.col → 该表名（=索引）的字段候选。
           按左扫最近子句键接 CLAUSE_TYPE_PRIO 语义置顶（535 R1 三词位同款形态——
           该位此前按原始 mapping 序出列、无类型亲和）；候选集不变仅提供序分档。
           顺手清：正则第二捕获组（点后已敲前缀）从未消费，改非捕获，消除死捕获。
            A3：ensure 改 Promise 链（④ keyword 档先例）——await 字段到位后再
           searchFields，首轮即出候选（原 fire-and-forget 首轮必空、要等下次触发）；
           token 取消弃迟到回填。ensure 失败静默 resolve（useIndexFields 零降级），
           回填口自然出空候选。 */
        const colM = before.match(/(\w+)\.\w*$/);
        if (colM) {
          tblName.value = colM[1];
          return tblCtx!.ensure().then(() => {
            if (token?.isCancellationRequested) return { suggestions: [] };
            const hits = searchFields({ fields: tblCtx!.fields.value, query: '', cap: 50, typePriority: CLAUSE_TYPE_PRIO[clauseOf(before)] });
            return { suggestions: hits.flat.map((h, i) => ({
              label: h.path, kind: monaco.languages.CompletionItemKind.Property,
              insertText: h.path, detail: h.type + ' · 来自 ' + colM[1], sortText: sortAt(i), range,
            })) };
          });
        }
        /* ④ 值位 比较符族 → 值候选（ R2 扩容 + R3 异步化；扩档）。
           左扫最近列名（剥引号/取点分末段）查 curFields 类型分派：
           keyword/constant_keyword（KEYWORD_VALUE_TYPES 族去 wildcard）→ useTermsSuggest terms agg
           top 20（R3：suggestAsync promise 出口，provideCompletionItems 返回 Promise 首轮即出，
           不再等下次触发；await 后消费 context.token，取消则弃迟到回填；缓存命中在零延时
           防抖一拍内同步完成零网络）；date/boolean/ip/wildcard/geo_point/数值族（含 token_count）
           → 静态格式候选（同步快返零请求）；
           值位但列未知/text：不出候选也不落 ③——值位出字段名候选是错位噪音。 */
        /* 主值位正则拆双形态 `(?:'([^']*)|(\w*))$`——旧 `'?(?:\w*)$` 对引号内
           非词字符（date '2026-、CIDR '192.168.）整体失配零候选；引号形态改收任意非引号
           字符（对齐 557 IN 尾项支路同款双形态），vPrefix 取 m1??m2；裸词形态 (\w*) 逐字
           不动（行为零漂移）。「未知列/text 零候选」压制在值位分支内层按列类型判定，
           不因引号形态绕开（宁缺勿错不变）。 */
        const eqM = before.match(/(?:=|<>|!=|>=|<=|>|<|IN\s*\(|LIKE\s|BETWEEN\s)\s*(?:'([^']*)|(\w*))$/i);
        /* IN 列表第 2+ 项值位（`col IN ('a', 'b␣`）——主正则要求操作符紧邻值，
           「, '」前缀的尾项必然失配零候选。拆尾项已敲前缀（, 'xx$，xx 不含收引号——date
           形态 '2026- 的连字符等照收）→ 取最后一个 IN( opener（\b 词界，防字段名内 in
           子串误配）→ opener 之后须恰为已完成项序列（剥不净如子查询/未闭合首项不进支路）
           → 归一成首项形态复用既有通道：LHS 列名左扫口径不变（取 IN ( 前最近词）、
           BETWEEN 区间档天然不沾（op 非 BETWEEN）。
           尾项放宽裸字面量形态（数值列 `IN (1, 2␣` 此前引号形态限定必失配零候选）
           ——引号/裸字两种形态二选一；已完成项剥净校验同步扩认裸数字字面（子查询/普通
           裸词仍挡在外，宁缺勿错不变）。 */
        let vLhs = eqM ? before.slice(0, eqM.index ?? 0) : '';
        let vPrefix = eqM?.[1] ?? eqM?.[2] ?? '';
        let vOp = eqM?.[0] ?? '';
        if (!eqM) {
          const inItem = before.match(/,\s*(?:'([^']*)|([\w.\-]*))$/i);
          if (inItem && inItem.index != null) {
            const head = before.slice(0, inItem.index);
            let last: RegExpExecArray | null = null;
            const open = /\bIN\s*\(/gi;
            let om: RegExpExecArray | null;
            while ((om = open.exec(head)) !== null) last = om;
            if (last && last.index != null
                && /^\s*(?:(?:'[^']*'|-?\d+(?:\.\d+)?)\s*,\s*)*(?:'[^']*'|-?\d+(?:\.\d+)?)?\s*$/.test(head.slice(last.index + last[0].length))) {
              vLhs = head.slice(0, last.index);
              vPrefix = inItem[1] ?? inItem[2] ?? '';
              vOp = 'IN (';
            }
          }
        }
        if (vOp) {
          /* 值位分派收口 dispatchValue 单函数（keyword terms / 静态格式 / text 子字段
             三支逐字平移，行为零漂移）——冷缓存根治：此前分派直接 curFields().find 零预载，
             fields 冷缓存首轮 find 落空 → 全类型零候选，要等用户再触发一次。现冷缓存
             （curFields 空）走 Promise.resolve(ctx.ensureCurFields()).then 再分派（③分支
              A3 同款：契约 void|Promise 归一、token 取消弃迟到回填）；暖缓存维持
             同步快返（静态档「同步快返零请求」既有契约保形——sqlValPos535/547 同步断言
             兼容锚，ensure 不重复触发）。 */
          const dispatchValue = (): any => {
          const colM2 = vLhs.replace(/[\s"]+$/, '').match(/([\w.\-]+)$/);
          const colName = (colM2 ? colM2[1] : '').split('.').pop() || '';
          const fld = colName ? ctx.curFields().find(f => f.path === colName) : undefined;
          if (fld?.type && AGG_VALUE_TYPES.includes(fld.type)) {
            valIndex.value = ctx.pickedIdx();
            valField.value = colName;
            const pending = valCtx!.suggestAsync(colName, vPrefix, 0);
            return pending.then(values => {
              if (token?.isCancellationRequested) return { suggestions: [] };
              /* 精确前缀命中置顶——已敲前缀恰为某候选全文时提到首位（服务端
                 doc_count 序保底：稳定排序，非精确项相对序零漂移；空前缀无精确语义不重排） */
              const lk = vPrefix.toLowerCase();
              const ordered = lk
                ? values.slice().sort((a, b) => Number(b.toLowerCase() === lk) - Number(a.toLowerCase() === lk))
                : values;
              return { suggestions: ordered.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: v, detail: '值候选 · ' + colName + '（' + fld.type + '）', sortText: sortAt(i), range,
              })) };
            });
          }
          const hint = fld ? VAL_FORMAT_HINTS[fld.type] : undefined;
          if (hint) {
            /*  D2：BETWEEN 语境数值族出区间形态 '10 AND 20'（LuceneInput NUM_HINTS
               '[10 TO 20]' 同语义——SQL 侧 BETWEEN 两端是裸字面量、AND 是语法必需）；
               其余语境/类型静态档原样。
               ⚠记档：BETWEEN 特化扩 date/date_nanos 族（绝对日期区间形态）一面
               回退——suggestWave551:338「非数值族 BETWEEN 不变形：date 列仍 date-math」
               是非随迁语义锁（toEqual 候选锁），解禁随迁后本表本分支再立法。 */
            const values = /^BETWEEN/i.test(vOp) && fld && NUMERIC_HINT_TYPES.includes(fld.type) ? ['10 AND 20'] : hint.values;
            return { suggestions: values.map((v, i) => ({
              label: v, kind: monaco.languages.CompletionItemKind.Value,
              insertText: v, detail: hint.detail, sortText: sortAt(i), range,
            })) };
          }
          /* text 列子字段档——mapping 含 col.keyword 时出一条精确匹配候选
             （LuceneInput 值位 550 text 档同语义：ES-SQL 对 text 列等值比较走的是分词
             match，精确匹配须写 .keyword 子字段）；无子字段维持零候选。 */
          if (fld?.type === 'text') {
            const kwPath = fld.path + '.keyword';
            if (ctx.curFields().some(f => f.path === kwPath)) {
              return { suggestions: [{
                label: kwPath, kind: monaco.languages.CompletionItemKind.Value,
                insertText: kwPath, detail: 'text 精确匹配走 .keyword 子字段 · ' + kwPath,
                sortText: sortAt(0), range,
              }] };
            }
          }
          return { suggestions: [] };
          };
          if (ctx.curFields().length) return dispatchValue();
          return Promise.resolve(ctx.ensureCurFields()).then(() => {
            if (token?.isCancellationRequested) return { suggestions: [] };
            return dispatchValue();
          });
        }
        /* ③ 其余词位 → 当前索引字段候选（直接敲列名场景）。
            R1：按左扫最近子句键给类型置顶序（候选集不变仅提供序分档，无键零扰动）。
            A3：ensureCurFields 改 Promise 链（② 同批）——调用方异步预载到位后再
           searchFields；契约放宽为 void | Promise<void>（同步 void 旧实现 Promise.resolve
           归一，微任务一拍即过）；token 取消弃回填。 */
        return Promise.resolve(ctx.ensureCurFields()).then(() => {
          if (token?.isCancellationRequested) return { suggestions: [] };
          const prio = CLAUSE_TYPE_PRIO[clauseOf(before)];
          const hits = searchFields({ fields: ctx.curFields(), query: word.word || '', cap: 50, typePriority: prio });
          return { suggestions: hits.flat.map((h, i) => ({
            label: h.path, kind: monaco.languages.CompletionItemKind.Property,
            insertText: h.path,
            detail: h.type + (ctx.pickedIdx() ? ' · 当前索引 ' + ctx.pickedIdx() : ''),
            sortText: sortAt(i), range,
          })) };
        });
      },
    });
  }
  return {
    dispose() {
      refs = Math.max(0, refs - 1);
      if (refs === 0 && provider) { provider.dispose(); provider = null; }
    },
  };
}
