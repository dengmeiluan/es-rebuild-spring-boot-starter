<template>
  <div ref="hostRef" class="monaco-host" :style="{ height }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
// R92-B1：按需引入——editor.api 只含核心，功能按 contrib 显式挂载（少一个 import 少一个能力，全列在此）
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';        // JSON 语言 + 校验 + 格式化
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding';   // 折叠（options.folding 用）
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'; // Ctrl+F 查找
import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions'; // formatDocument 动作
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController'; // 补全弹层
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution'; // glyph/内容 hover（R39 徽标用）
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment';   // jsonc 注释切换
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { useAppStore } from '../stores/app';
import { dslContext, QUERY_SNIPPETS, RANGE_OPS, AGG_SNIPPETS, ROOT_KEYS, ROOT_KEY_SNIPPETS, commaAffixes, settingsKeyItems, mappingKeyItems, templateKeyItems, ANALYZE_KEY_SNIPPETS, BUILTIN_ANALYZERS, lineIndentAt, reindentSnippet, commentEnd, isEscapedQuote, painlessFieldAt, orderFieldsByTypeForOp, dslValueFieldAt, dslArrayElemFieldAt, DSL_VALUE_TYPE_HINTS, DSL_ARRAY_ELEM_TYPE_HINTS, DSL_ARRAY_ELEM_CHAINS } from '../utils/dslCompletionContext';
import { makeDslValueSuggestProvider } from '../utils/dslValueSuggest';
import type { AssistItem, BodyKind } from '../utils/dslCompletionContext';
import { ensureLanguages } from '../utils/monacoLanguages';
import { ensureJsonQuickFixes, ensureDslLintQuickFixes, recordDslLintMarkers, clearDslLintMarkers, type DslLintMarkerEntry } from '../utils/monacoJsonQuickFix';

(self as any).MonacoEnvironment = {
  getWorker: (_: any, label: string) => (label === 'json' ? new jsonWorker() : new editorWorker()),
};

/* 自定义主题（深/浅与 token 对齐，只注册一次） */
let themeReady = false;
function ensureTheme() {
  if (themeReady) return;
  monaco.editor.defineTheme('es-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '93c5fd' },
      { token: 'string.value.json', foreground: '86efac' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'keyword.json', foreground: 'f472b6' },
      { token: 'comment', foreground: '5b6472', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#101116',
      'editor.lineHighlightBackground': '#1a1c2255',
      'editorLineNumber.foreground': '#3d4048',
      'editorLineNumber.activeForeground': '#6b7280',
      'editorIndentGuide.background1': '#22242c',
      'editor.selectionBackground': '#14b8a640',
      'editorCursor.foreground': '#2dd4bf',
      'editorWidget.background': '#1a1c22',
      'editorWidget.border': '#33363f',
      'input.background': '#17181d',
    },
  });
  monaco.editor.defineTheme('es-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '0369a1' },
      { token: 'string.value.json', foreground: '15803d' },
      { token: 'number', foreground: 'b45309' },
      { token: 'keyword.json', foreground: 'be185d' },
      { token: 'comment', foreground: '8790a3', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.lineHighlightBackground': '#f2f4f7aa',
      'editorLineNumber.foreground': '#cbd0d9',
      'editorLineNumber.activeForeground': '#8790a3',
      'editorIndentGuide.background1': '#e4e7ec',
      'editor.selectionBackground': '#0d948826',
      'editorCursor.foreground': '#0d9488',
      'editorWidget.background': '#fbfbfd',
      'editorWidget.border': '#e4e7ec',
      'input.background': '#ffffff',
    },
  });
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    trailingCommas: 'ignore',
    comments: 'ignore',
  } as any);
  /* 2.6.0（spec §6.3）：显式钉住行注释配置——Ctrl+/ 切换 // 注释可用。
     monaco 0.52 json contribution 自带同配置，此处幂等防回归（覆盖注册同值零差异）。 */
  monaco.languages.setLanguageConfiguration('json', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  });
  themeReady = true;
}

/* W4-T13 键位/值位守卫（T12 评审裁定：provider 侧新增逻辑，不动 dslCompletionContext.ts）。
   返回 ok + 当前串起始 strStart（无串=光标位）+ inStr——I-1 的 range 计算复用同一次扫描结果，
   N-1/N-2 的「仅串内右扫」门即以 inStr 为准。
   光标在字符串内 → 看当前串起始引号左侧最近非空白字符：'{'/',' 为键位（出建议），
   其余（':' 值串、'[' 数组值串等）一律压住——值串内插字段名/根键/snippet 都产非法 DSL；
   光标不在串内（闭合引号后等形态）→ 压住左侧最近非空白为 ':' 的值位；
   M-2：串外且 {}[] 栈顶为 '[' → 数组裸元素位（"must": [⏎ / ["x", ⏎）压住——元素位塞键值对非法；
   元素对象已开（"must": [{⏎，栈顶 '{'）仍出——既有行为保留。
   转义口径与 dslContext 同源：紧邻反斜杠 run 长度为奇数才算转义引号。 */
/* 2.6.0：栈帧携带 lastKey（值位白名单判定用）——扫描期 curKey/lastKey 追踪口径与 dslContext 同源 */
type GuardFrame = { type: '{' | '['; lastKey: string | null };

/* 值位白名单（spec §4.4）：仅此三键的值串位放行出档，其余值位一律压制（防误导优先）。
   五百二十四批+1：补 analyzer/search_analyzer/normalizer/tokenizer 四键——dslKeyGuard 侧
   只负责放行出 valueKey，消费侧分档收口（search 档仍一律压空，仅 mapping 档接 analyzers 通道）
   五百四十批：白名单外 ':' 值串位另设字段类型门（date/ip 静态档）——ok 仍 false、键链随行
   回传（valueKey/parentKey/grandKey），放行权在 computeSuggestions 值位类型档按类型收口 */
const VALUE_WHITELIST = new Set(['order', 'track_total_hits', 'field', 'analyzer', 'search_analyzer', 'normalizer', 'tokenizer']);
/* analyzers 通道消费键（mapping 值位）：与 VALUE_WHITELIST 的组件名键对齐 */
const ANALYZER_VALUE_KEYS = new Set(['analyzer', 'search_analyzer', 'normalizer', 'tokenizer']);

function dslKeyGuard(doc: string, offset: number): { ok: boolean; strStart: number; inStr: boolean; valueKey?: string; parentKey?: string | null; grandKey?: string | null; arrayElem?: boolean } {
  const cursor = Math.max(0, Math.min(offset, doc.length));
  const text = doc.slice(0, cursor);
  let inStr = false; let strStart = -1; let curKey = '';
  const stack: GuardFrame[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '"') {
        if (!isEscapedQuote(text, i)) {
          inStr = false;
          /* 闭串后跳空白遇 ':' → 该串是键，记入栈顶 lastKey（与 dslContext 同口径） */
          let m = i + 1;
          while (m < text.length && /\s/.test(text[m])) m++;
          if (text[m] === ':' && stack.length) stack[stack.length - 1].lastKey = curKey;
        }
      } else curKey += ch;
      continue;
    }
    const cEnd = commentEnd(text, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }  // for 的 i++ 会让下次从 cEnd 开始
    if (ch === '"') { inStr = true; strStart = i; curKey = ''; continue; }
    if (ch === '{' || ch === '[') stack.push({ type: ch, lastKey: null });
    else if (ch === '}' || ch === ']') stack.pop();
  }
  const topKey = stack.length ? stack[stack.length - 1].lastKey : null;
  let j = (inStr ? strStart : text.length) - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  if (j < 0) return { ok: false, strStart: inStr ? strStart : cursor, inStr };
  if (inStr) {
    const left = text[j];
    /* 五百四十三批：数组续元素串位（',' 左邻且栈顶 '['）回传键链——arrayElem 标记元素位，
       valueKey=数组属主键（terms 值对象内的字段键）、parentKey=再上层键，供消费侧
       dslArrayElemFieldAt 解析字段→值位类型档出静态候选；该位现状错档（query-type 的
       QUERY_SNIPPETS 落进值数组），本批归位。须置于下方 '{'/',' 键位口之前——',' 左邻
       原本直落键位放行，元素位口径在此分流；首元素位（'[' 左邻）维持既有无键链压制不动
       （540 契约 spec 既有断言钉死）。 */
    if (left === ',' && stack[stack.length - 1] && stack[stack.length - 1].type === '[') {
      const elemKey = stack.length >= 2 ? stack[stack.length - 2].lastKey : null;
      const ownerKey = stack.length >= 3 ? stack[stack.length - 3].lastKey : null;
      return { ok: false, strStart, inStr, valueKey: elemKey ?? undefined, parentKey: ownerKey, arrayElem: true };
    }
    /* 五百四十六批：数组键链白名单位首元素位（'[' 左邻且栈顶 '['）——'[' 左邻此前一律无键链
       直落压制（540 契约钉 terms 值数组首元素位、544 复钉），仅当数组属主键 ∈
       DSL_ARRAY_ELEM_CHAINS（本批=_source，返回字段裁剪位）才回传键链放行，arrayElem 同标记
       消费侧与续元素位同路分派；白名单外（terms/must/ids 等全部既有面）保持原样零增量。 */
    if (left === '[' && stack[stack.length - 1] && stack[stack.length - 1].type === '[') {
      const firstKey = stack.length >= 2 ? stack[stack.length - 2].lastKey : null;
      if (firstKey && DSL_ARRAY_ELEM_CHAINS.has(firstKey)) {
        return { ok: false, strStart, inStr, valueKey: firstKey, parentKey: undefined, arrayElem: true };
      }
    }
    if (left === '{' || left === ',') return { ok: true, strStart, inStr };
    /* 2.6.0 值位白名单口：串左邻 ':' 且栈顶 lastKey ∈ 白名单 → 放行（valueKey 回传供 provider 分派） */
    if (left === ':' && topKey && VALUE_WHITELIST.has(topKey)) {
      return { ok: true, strStart, inStr, valueKey: topKey };
    }
    /* 五百四十批：非白名单 ':' 值串位回传键链（valueKey=当前键/parentKey=上层键/grandKey=上上层键）
       供值位类型档分派（dslValueFieldAt 解析字段→DSL_VALUE_TYPE_HINTS 按类型出静态候选）。
       ok 仍 false——「其余值位一律压制」的既有语义不变，放行权在消费侧按字段类型收口；
       数组元素串（'[' 左邻首元素位）不回传键链，维持压制（540 契约 spec 既有断言钉死）。 */
    if (left === ':') {
      const parentKey = stack.length >= 2 ? stack[stack.length - 2].lastKey : null;
      const grandKey = stack.length >= 3 ? stack[stack.length - 3].lastKey : null;
      return { ok: false, strStart, inStr, valueKey: topKey ?? undefined, parentKey, grandKey };
    }
    return { ok: false, strStart, inStr };
  }
  if (text[j] === ':') return { ok: false, strStart: cursor, inStr };
  if (stack[stack.length - 1] && stack[stack.length - 1].type === '[') return { ok: false, strStart: cursor, inStr };
  return { ok: true, strStart: cursor, inStr };
}

/* W5-1 真机复扫修复（观察项①）：敲 " 触发补全时，首焦必须是 dsl 组首项而非 JSON LS 内建 $schema。
   真机机理实锤（monaco 0.52.2 源码实查 + filters.js 离线复算 + r111 真机对拍），两道关都要过：
   ① 过滤关（filterText）：dslAssist 的 range 覆盖起始引号（I-1 形态）→ overwriteBefore=1
      → 过滤 pattern='"'——无 filterText 时拿 label 匹配，'"' 不在 label 中 → fuzzyScore 返回 undefined
      → 整档被过滤出列表（真机列表只剩 $schema + 旧 registerCompletion 项的根因；sortText 再优也轮不到比）。
      故三档统一 filterText='"'+label（与 insertText 同形态，LSP JSON 键补全标准手法）：
      pattern '"' 前缀强匹配得 [2,...] > FuzzyScore.Default(-100)（$schema/旧项空 pattern 同分 -100），
      dsl 组整体浮到列表顶；续打 '"q' 仍前缀匹配（[9,...]）。
   ② 排序关（sortText）：同分回退 idx=初始 sortText 序（completionModel._compareCompletionItems：
      score→distance→idx；suggest.js 对无 sortText 项回填 label，defaultComparator 首比 sortTextLow 字典序）。
      '!'=33 是可打印 ASCII 最小字符，稳压 '$'=36（'0'=48 压不过）；'!' + 三位零填序号 + label
      序号定宽同长，组内字典序即提供序（root=ROOT_KEYS 序 / snippet=QUERY_SNIPPETS 目录序 /
      field=类型感知置顶序，无算子倾向时=fields() 序）。
      前提：单档条数 <1000（序号 3 位定宽才同长）；console 字段量级远在界内。 */
function dslSortText(idx: number, label: string): string {
  return '!' + String(idx).padStart(3, '0') + label;
}

/* 五百三十一批：field 档类型感知排序已收口 dslCompletionContext.orderFieldsByTypeForOp
   （五百四十批原样平移：与 orderFieldsByClauseOp 语义有差——原始序不做亲和族展开，
   语义分界与平移沿革见该函数注释；dslFieldPrio538 锁定族展开版零触碰）。 */

/* W5-1 过滤关：让敲 " 后的过滤 pattern（含已敲引号）能匹配上——见 dslSortText 上注释①。 */
function dslFilterText(label: string): string {
  return '"' + label;
}

/* 2.6.0 snippet 统一包装：逗号自适应（affix）+ 缩进叠加（reindentSnippet）。
   落点只做基本放置——规整由「接受即 formatDocument」归一（2.6.2 起每档挂 command，
   幂等：任何触发文档形态 → 同一格式化产物；手工推算换行的 lineBreakAffixes 路线已废弃——
   单行紧凑文档下基线脱钩，不幂等）。单行文本 reindent 为 no-op 自然直通。 */
function wrapSnippet(doc: string, start: number, end: number, indent: string, text: string, affix: { prefix: string; suffix: string }): string {
  return affix.prefix + reindentSnippet(text, indent) + affix.suffix;
}

/* 右扫闭合串（模块内共享纯函数）：从 start（已 clamp 的光标位/串起始）向右扫描第一个非转义引号，
   遇 \n 即停（JSON 串不跨行），返回闭合串结束位置（含闭合引号的 i+1）；未闭合则返回 start 原地。
   转义口径与 dslContext/dslKeyGuard 同源：紧邻反斜杠 run 长度为奇数才算转义引号。
   抽取自 settings/mapping/template 档与 search 主路径两处逐字节等价的内联右扫循环。 */
function scanStringEnd(doc: string, start: number): number {
  let end = start;
  for (let i = end; i < doc.length; i++) {
    const ch = doc[i];
    if (ch === '\n') break;
    if (ch !== '"') continue;
    if (!isEscapedQuote(doc, i)) { end = i + 1; break; }
  }
  return end;
}

/* 2.6.2 接受即格式化（幂等归一）：任何触发文档形态 → formatDocument 统一规整——
   落位乱不乱不再依赖触发排版（用户真机痛点「拉胯」的正解）。
   非法中间态文档 JSON LS format 罢工静默降级（reindent 落点兜底），无副作用；
   snippet 占位符会话：落点已规整时 format 零编辑会话无损，落点歪时以规整优先（默认值已落文本）。 */
const ACCEPT_FORMAT_COMMAND = { id: 'editor.action.formatDocument', title: '接受后格式化' };

const props = withDefaults(defineProps<{
  modelValue: string;
  language?: string;
  height?: string;
  readonly?: boolean;
  fontSize?: number;
  /* W4-T13：可选 DSL 智能补全——传则注册 JSON completion provider（未传=现状零影响）
     W6：契约扩展 bodyKind——按 body 语义分档（search 三档/settings 设置键/mapping 骨架/none 空）
     五百二十四批：契约再扩 doc——文档体档（键位零候选，仅 field 值位白名单出字段候选）；并扩语言面：
     dslAssist 存在时 painless 语言同挂四骨架补全 + doc['f']/ctx['f'] 字段 hover（挂载计数见 spec 524）
     五百二十四批+1：契约再扩 analyzers——mapping 值位 analyzer/normalizer/tokenizer 四键
     出自定义组件名候选（MappingView 弹层注入 analysisSettings 实名），缺席=该通道关
     五百二十五批：analyze 档复用同一 analyzers() 闭包通道——analyzer/search_analyzer/
     normalizer/tokenizer 值位出「内置清单 ∪ 实名组件」（缺席=纯内置，语义不关档）
     六百五十八批：契约再扩 terms——search 档可聚合字段值位出 top20 真实值动态候选
     （655 设计记档 P2，独立第六通道 provider；缺席=零注册行为零变，524+1 先例） */
  dslAssist?: { fields: () => { path: string; type: string }[]; bodyKind?: () => BodyKind; analyzers?: () => string[]; terms?: (field: string, prefix: string) => Promise<string[]> };
}>(), {
  language: 'json',
  height: '320px',
  readonly: false,
  fontSize: 12.5,
});

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'execute'): void;
}>();

const hostRef = ref<HTMLElement>();
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
/* 五百二十一批：dslAssist provider 逐语言一份（json+ndjson），dispose 全量随组件卸载；
   W3 起数组同时承载补全与字段 hover 两类注册（dispose 对称同路） */
let dslAssistDisposables: monaco.IDisposable[] = [];
let hostRORef: ResizeObserver | null = null;
const appStore = useAppStore();
const themeName = () => (appStore.effectiveTheme === 'light' ? 'es-light' : 'es-dark');

onMounted(() => {
  ensureTheme();
  ensureLanguages(); /* ux2：sql 官方包 + 4 自研 monarch（幂等，全实例共享一次注册） */
  ensureJsonQuickFixes(); /* ux2 Task 4：JSON quick fix 语言级注册（模块级幂等） */
  ensureDslLintQuickFixes(); /* 五百三十四批 P0-2：es-dsl-lint quick fix 注册（独立幂等，既有 json 四码链路零触碰） */
  // w70:Ctrl+Shift+F 全站格式化(注册在 create 后)
  editor = monaco.editor.create(hostRef.value!, {
    value: props.modelValue,
    language: props.language,
    theme: themeName(),
    readOnly: props.readonly,
    fontSize: props.fontSize,
    fontFamily: '"JetBrains Mono", Consolas, monospace',
    minimap: { enabled: false },
    lineNumbersMinChars: 3,
    folding: true,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    /* 五百五十四批 P0：suggest/hover/quickfix 弹层默认渲染在 editor DOM 内部，会被任何
       overflow:auto/hidden 祖先裁切（产线实报 DevTools「纠错弹窗被覆盖无法显示详情」，
       .dt-out overflow:auto 为裁切源之一）。fixedOverflowWidgets 让弹层 fixed 定位挂
       body 逃逸裁切——一处配置全站编辑器受益。 */
    fixedOverflowWidgets: true,
    tabSize: 2,
    renderLineHighlight: 'all',
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    padding: { top: 8, bottom: 8 },
    stickyScroll: { enabled: false },
    /* ux2 智能编辑六件套 + 串内自动弹补全（quickSuggestions.strings 是关键解锁——
       默认 false 时 dslAssist 只靠敲 " 触发；值位/数组位噪音由 dslKeyGuard 压住） */
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoSurround: 'languageDefined',
    autoIndent: 'full',
    formatOnPaste: true,
    formatOnType: true,
    bracketPairColorization: { enabled: true },
    quickSuggestions: { other: true, strings: true, comments: false },
  });
  registerFormatKeybind(editor);
  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor!.getValue());
  });
  /* 布局补偿（五百一十七批→V3 强化）：WorkbenchLayout pane 内 create 时容器可能处于 0 尺寸过渡态
     （pane 高度异步分配），monaco 的 initial layout 读到 0 后渲染层停在 0×0——
     model 有值、view-lines 0 行，视觉全空且不可编辑（托管重建 settings/mapping「无法编辑」真凶）。
     实测单次 RO/双 rAF 补偿在部分页仍会漏（渲染恢复有数秒级随机延迟），升级为多拍补偿：
     双 rAF + 100ms~3s 五连发 setTimeout，覆盖 pane 分配/字体/KeepAlive 恢复等全部时序
     （layout 幂等，多跑无副作用，对全站 Monaco 一致生效）。 */
  const layoutKick = () => { try { editor?.layout(); } catch { /* dispose 竞态静默 */ } };
  requestAnimationFrame(() => requestAnimationFrame(layoutKick));
  [100, 300, 800, 1500, 3000].forEach(ms => setTimeout(layoutKick, ms));
  const hostRO = new ResizeObserver(() => layoutKick());
  hostRO.observe(hostRef.value!);
  hostRORef = hostRO;
  // Ctrl+Enter 执行
  editor.addAction({
    id: 'es-execute',
    label: '执行',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => emit('execute'),
  });
  /* W4-T13：dslAssist 存在才注册 DSL 补全 provider（缺席=零注册零影响）。
     上下文判定复用 T12 dslContext；键位/值位守卫先行（公共入口），值位默认空层——
     2.6.0 起 order/track_total_hits/field 三键值串位白名单放行（spec §4.4，见下方值位档）。 */
  if (props.dslAssist) {
    /* 五百二十一批：provider 抽工厂逐语言注册（json + ndjson）。为什么：BulkEditor body 是
       ndjson 语言（monacoLanguages 自研 monarch），只注册 json 时 dslAssist 挂在 ndjson
       实例上补全静默失效。provider 内部只读 model 文本/光标（getValue/getOffsetAt/
       getPositionAt），对 language 零假设——同一工厂直接复用；memo 是闭包内状态，
       每语言一份实例各自独立（互不串缓存）。 */
    function makeDslAssistProvider() {
      /* 2.6.0 memo（spec §3.3）：同 doc（字符串 === 按值）+同 offset+同 bk 命中同引用返回——防 quickSuggestions 同位重扫；
         敲键触发必先改 doc 内容，天然失效。
         bk 入 key：bodyKind 是外部可变闭包（RestView 换端点 doc 不变），二元 key 会返陈旧分档（既有测试实证）。
         已知窗口（评审留档）：fields() 未入 key——RestView 切索引 body 不重置 + Ctrl+Space 同位触发会返上一索引
         字段建议；方向安全（建议退化非错误），敲 " 触发必先改 doc 即失效，故不入 key（入 key 需每次深比字段清单，得不偿失） */
      let lastDoc: string | null = null;
      let lastOffset = -1;
      let lastBk: BodyKind | null = null;
      let lastRes: { suggestions: any[] } | null = null;
      return {
        triggerCharacters: ['"'],
        provideCompletionItems(model: any, position: any) {
          const doc: string = model.getValue();
          const offset: number = model.getOffsetAt(position);
          /* bodyKind 纳入 key：闭包现调现读（廉价枚举取值），端点随选随换不缓存首值（W6 既有测试钉）——
             computeSuggestions 内部仍会重取一次（纯函数零副作用，口径不变）。 */
          const bk: BodyKind = props.dslAssist!.bodyKind?.() ?? 'search';
          if (lastRes && doc === lastDoc && offset === lastOffset && bk === lastBk) return lastRes;
          const res = computeSuggestions(model, position);
          lastDoc = doc; lastOffset = offset; lastBk = bk; lastRes = res;
          return res;
        },
      };
    }
    dslAssistDisposables = ['json', 'ndjson'].map(lang =>
      monaco.languages.registerCompletionItemProvider(lang, makeDslAssistProvider()));

    /* 六百五十八批：值位动态候选第六通道（655 设计记档 P2 落地，D1~D4 用户裁决取推荐值）——
       terms 在场才注册（缺席=零注册=行为逐字节现状，524+1 先例）；json+ndjson 逐语言一份，
       无 triggerCharacters（不串 dslRegs ['"'] 计数契约=655-C1 判例安全位）；dispose 入
       dslAssistDisposables 随卸载全量释放（既有 dispose 链路白得）。540/543 静态档仅 doc 档
       消费、动态通道仅 search 档出档=同位零重叠（D2 动态独占架构级成立，主 provider 零触碰）。 */
    if (props.dslAssist?.terms) {
      const vaTerms = props.dslAssist.terms; /* 可选链窄化不越函数边界：map 回调内 props 重取 terms=undefined 可达，先捕获 */
      dslAssistDisposables.push(...['json', 'ndjson'].map(lang =>
        monaco.languages.registerCompletionItemProvider(lang, makeDslValueSuggestProvider({
          fields: props.dslAssist!.fields, terms: vaTerms, bodyKind: props.dslAssist!.bodyKind,
        }))));
    }

    /* 五百二十四批：painless 语言补全——四骨架 snippet 档（脚本编辑不写 JSON，dslKeyGuard/dslContext
       的 JSON 栈扫描全不适用，独立工厂走词位 range 纯插入）。triggerCharacters ['[', '.']：
       doc['/ctx[' 敲 [ 即弹、params. 与 PainlessLab 既有 params 键候选并列；签名 ≠ 恰 ['"']，
       不串 json/ndjson 的 dslRegs 计数（monacoDslAssist.spec 契约）。 */
    function makePainlessAssistProvider() {
      return {
        triggerCharacters: ['[', '.'],
        provideCompletionItems(model: any, position: any) {
          const word = model.getWordUntilPosition?.(position);
          const col = word?.startColumn ?? position.column;
          const endCol = word?.endColumn ?? position.column;
          const range = {
            startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
            startColumn: col, endColumn: endCol,
          };
          /* 四骨架：更新/取值/params 引用/emit 一次落位。字段占位交用户手填——fields() 动态注入
             choice 需要 fields 非空语境且 painless 面多挂无索引页（PainlessLab），防误导优先 */
          const sk = (label: string, detail: string, text: string, i: number) => ({
            label, kind: monaco.languages.CompletionItemKind.Snippet,
            detail,
            insertText: text,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: dslSortText(i, label),
            range,
          });
          return { suggestions: [
            sk("ctx['字段']='值'", '更新脚本：改 _source 字段', "ctx['${1:field}'] = '${2:value}'", 0),
            sk("doc['字段'].value", '查询/过滤脚本：读 doc value（只读）', "doc['${1:field}'].value", 1),
            sk('params.x', '引用执行参数', 'params.${2:name}', 2),
            sk('emit(值)', 'ingest processor：产出字段值', 'emit(${1:value})', 3),
          ] };
        },
      };
    }
    dslAssistDisposables.push(monaco.languages.registerCompletionItemProvider('painless', makePainlessAssistProvider()));

    /* W3：字段名 hover provider——word 命中 fields() 时出「type · 字段名」markdown（mapping 字段类型
       即扫即读，不用翻 mapping 树）；无 fields / 未命中一律静默（null，不产出空弹层）。
       与 dsl-assist 工厂同注册契约：json+ndjson 逐语言一份，dispose 随组件卸载全量释放（同一数组）。 */
    function makeDslFieldHoverProvider() {
      return {
        provideHover(model: any, position: any) {
          const word: { word: string } | undefined = model.getWordAtPosition?.(position);
          const w = word?.word;
          if (!w) return null;
          const fields = props.dslAssist!.fields();
          if (!fields?.length) return null;
          const hit = fields.find(f => f.path === w);
          if (!hit) return null;
          return { contents: [{ value: hit.type + ' · ' + hit.path }] };
        },
      };
    }
    dslAssistDisposables.push(...['json', 'ndjson'].map(lang =>
      monaco.languages.registerHoverProvider(lang, makeDslFieldHoverProvider())));

    /* 五百二十四批：painless 字段 hover——光标落 doc['f'] / ctx['f'] 的 f 串内时出「type · path」。
       fields() 闭包内现调（惰性，519 教训：注册期/挂载期绝不预载，防污染 fieldPickerPenetration
       计数契约）；提取逻辑走 painlessFieldAt 纯函数（dslCompletionContext 单一出处，可脱离 Monaco 断言）。 */
    function makePainlessFieldHoverProvider() {
      return {
        provideHover(model: any, position: any) {
          const f = painlessFieldAt(String(model.getValue()), model.getOffsetAt(position));
          if (!f) return null;
          const fields = props.dslAssist!.fields();
          const hit = fields?.find(x => x.path === f);
          if (!hit) return null;
          return { contents: [{ value: hit.type + ' · ' + hit.path }] };
        },
      };
    }
    dslAssistDisposables.push(monaco.languages.registerHoverProvider('painless', makePainlessFieldHoverProvider()));

    /* 原 provideCompletionItems 全体逻辑原样平移（签名不变）；内部 doc/offset 与壳层重复获取保留——纯函数零副作用。
       声明位于工厂之后：块级函数声明提升，工厂返回闭包在调用期取到。 */
    function computeSuggestions(model: any, position: any): { suggestions: any[] } {
        const doc: string = model.getValue();
        const offset: number = model.getOffsetAt(position);
        /* W6：bodyKind 分派先行（闭包现调现读，端点随选随换）。none 恒空（_bulk NDJSON 体不扰动）；
           settings/mapping/template 仅串内键位出档（值位/串外压住——设置值枚举形态各异，出档易误导）；
           doc 仅 field 值位白名单出字段候选（文档体键位零候选——_source 字段名自由，出 root 查询键骨架是误导）；
           缺省（含显式 undefined）回退 search，走下方 W4 三档现状逻辑（一行不动）。 */
        const bk: BodyKind = props.dslAssist!.bodyKind?.() ?? 'search';
        if (bk === 'none') return { suggestions: [] };
        /* 五百二十四批：doc 档（文档体 /idx/_doc/1 等）——键位一律零候选；仅值位白名单 field 键的
           值串位放行出 fields() 字段候选（与 search 值位档同形态：range 覆盖整串，insertText 自带引号；
           kind=Value 同口径）。其余值位/串外/键位落下方兜底 []。
           五百三十一批：文档体无算子上下文（typePriorityForOp 无从取 op），字段候选维持 fields() 序。 */
        if (bk === 'doc') {
          const g = dslKeyGuard(doc, offset);
          /* 五百四十三批：arrayElem 一并压住——doc 档「仅 field 键 ':' 值串位放行」语义原样，
             "field": [ 元素位不是值串位（元素位没有 ':' 左邻） */
          if (!g.ok || !g.inStr || g.valueKey !== 'field' || g.arrayElem) return { suggestions: [] };
          const dEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const dsp = model.getPositionAt(g.strStart);
          const dep = model.getPositionAt(dEnd);
          const vals = props.dslAssist!.fields().map(f => f.path);
          return { suggestions: vals.map((v, i) => ({
            label: v, kind: monaco.languages.CompletionItemKind.Value,
            insertText: '"' + v + '"',
            range: { startLineNumber: dsp.lineNumber, startColumn: dsp.column, endLineNumber: dep.lineNumber, endColumn: dep.column },
            command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(v),
            sortText: dslSortText(i, v),
          })) };
        }
        /* 五百二十五批：analyze 档（_analyze body）——键位（串内）出八键骨架；值位分派：
           analyzer/search_analyzer/normalizer/tokenizer 出「内置清单 ∪ analyzers() 实名组件」
           （视图侧惰性拉 analysisSettings 注入，缺席=纯内置不关档）；field 出 fields()；
           text 等其余值位压住（text 不在 VALUE_WHITELIST，dslKeyGuard 不放行同归此处）；
           串外压住（W6 三档同口径）。 */
        if (bk === 'analyze') {
          const g = dslKeyGuard(doc, offset);
          if (!g.ok || !g.inStr) return { suggestions: [] };
          const azEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const azSp = model.getPositionAt(g.strStart);
          const azEp = model.getPositionAt(azEnd);
          const azRange = {
            startLineNumber: azSp.lineNumber, startColumn: azSp.column,
            endLineNumber: azEp.lineNumber, endColumn: azEp.column,
          };
          if (g.valueKey) {
            if (ANALYZER_VALUE_KEYS.has(g.valueKey)) {
              const uniq = [...new Set([...BUILTIN_ANALYZERS, ...(props.dslAssist!.analyzers?.() ?? [])])];
              return { suggestions: uniq.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: '"' + v + '"', range: azRange, command: ACCEPT_FORMAT_COMMAND,
                filterText: dslFilterText(v), sortText: dslSortText(i, v),
              })) };
            }
            if (g.valueKey === 'field') {
              const vals = props.dslAssist!.fields().map(f => f.path);
              return { suggestions: vals.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: '"' + v + '"', range: azRange, command: ACCEPT_FORMAT_COMMAND,
                filterText: dslFilterText(v), sortText: dslSortText(i, v),
              })) };
            }
            return { suggestions: [] }; /* text 等其余白名单外值位压住 */
          }
          const azIndent = lineIndentAt(doc, g.strStart);
          const azAffix = commaAffixes(doc, g.strStart, azEnd);
          return { suggestions: Object.entries(ANALYZE_KEY_SNIPPETS).map(([k, snip], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snip.detail,
            insertText: wrapSnippet(doc, g.strStart, azEnd, azIndent, snip.text, azAffix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: azRange, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k), sortText: dslSortText(i, k),
          })) };
        }
        /* 五百二十四批+1：mapping 值位 analyzers 通道——组件名四键的值串位出
           analyzers() 实名候选（range 覆盖整串 I-1 同形态）；候选空/非 mapping 档
           落到下方既有压制口，零增量。 */
        if (bk === 'mapping') {
          const g0 = dslKeyGuard(doc, offset);
          if (g0.ok && g0.inStr && g0.valueKey && ANALYZER_VALUE_KEYS.has(g0.valueKey)) {
            const names = props.dslAssist!.analyzers?.() ?? [];
            if (names.length) {
              const aEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
              const asp = model.getPositionAt(g0.strStart);
              const aep = model.getPositionAt(aEnd);
              return { suggestions: names.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: '"' + v + '"', filterText: dslFilterText(v), sortText: dslSortText(i, v),
                command: ACCEPT_FORMAT_COMMAND,
                range: { startLineNumber: asp.lineNumber, startColumn: asp.column, endLineNumber: aep.lineNumber, endColumn: aep.column },
              })) };
            }
          }
        }
        if (bk === 'settings' || bk === 'mapping' || bk === 'template') {
          const g = dslKeyGuard(doc, offset);
          /* g.valueKey 一并压住：W6 三档语义是「值位一律不出档」，2.6.0 白名单口仅限 search 路径 */
          if (!g.ok || !g.inStr || g.valueKey) return { suggestions: [] };
          /* range 与 W4 I-1/N-1 同形态：起=串起始，右扫闭合引号遇 \n 即停（本分支已锁 inStr，
             串内右扫前提成立）——接受后整串干净替换，不留 "" 残壳。 */
          const end = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const sp = model.getPositionAt(g.strStart);
          const ep = model.getPositionAt(end);
          const range = {
            startLineNumber: sp.lineNumber, startColumn: sp.column,
            endLineNumber: ep.lineNumber, endColumn: ep.column,
          };
          const items: AssistItem[] = bk === 'settings' ? settingsKeyItems() : bk === 'mapping' ? mappingKeyItems() : templateKeyItems();
          const w6Affix = commaAffixes(doc, g.strStart, end); /* 2.6.0：三档统一逗号自适应——逗号为 snippet 外字面量，tab 流程不受影响 */
          return {
            suggestions: items.map((it, i) => ({
              label: it.label,
              kind: it.snippet ? monaco.languages.CompletionItemKind.Snippet
                               : monaco.languages.CompletionItemKind.Property,
              insertText: wrapSnippet(doc, g.strStart, end, lineIndentAt(doc, g.strStart), it.insertText, w6Affix),
              ...(it.snippet ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet } : {}),
              detail: it.detail,
              range, command: ACCEPT_FORMAT_COMMAND,
              filterText: dslFilterText(it.label), /* W5-1 过滤关：pattern '"' 可匹配 */
              sortText: dslSortText(i, it.label), /* W5-1 排序关：'!' 前缀升权，组内保目录序 */
            })),
          };
        }
        /* 2.6.0 顺序重排：dslKeyGuard 先行、ctx none 闸下沉到值位档之后——
           sort/track_total_hits 值位的 dslContext 是 none（非 query 深层）/root（根键值位），
           提前拦会把值位白名单档拦死；纯函数换位对既有三档零行为差（guard 压制位依旧 []）。 */
        const guard = dslKeyGuard(doc, offset);
        if (!guard.ok) {
          /* 五百四十六批：数组键链白名单位（_source 元素串位）——数组元素即字段名本尊（非某字段
             的值），与 dslArrayElemFieldAt 的「值位字段解析」不同轨（dslValueTiers544 把
             ('_source', null)→null 钉死，不共函数）。首元素位经 guard 白名单口、续元素位经既有
             arrayElem 口，同归此分派出 fields() 全字段候选（Value 档，range 覆盖整串 I-1 同形态）。 */
          if (guard.inStr && guard.arrayElem && guard.valueKey === '_source') {
            const cEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const csp = model.getPositionAt(guard.strStart);
            const cep = model.getPositionAt(cEnd);
            const cRange = { startLineNumber: csp.lineNumber, startColumn: csp.column, endLineNumber: cep.lineNumber, endColumn: cep.column };
            return { suggestions: props.dslAssist!.fields().map((f, i) => ({
              label: f.path, kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + f.path + '"', range: cRange, command: ACCEPT_FORMAT_COMMAND,
              filterText: dslFilterText(f.path), sortText: dslSortText(i, f.path),
            })) };
          }
          /* 五百四十批：值位类型档（date-math/ip）——非白名单 ':' 值串位按字段类型放行静态候选。
             dslValueFieldAt 解析字段（叶子子句直挂值 / range 操作符值两形态）→ fields() 精确查表
             （aggs 撞名键查无此字段自然压制）→ DSL_VALUE_TYPE_HINTS 按类型出档；
             表外类型维持既有压制——候选只增不改。
             五百四十三批：数组续元素位分派（arrayElem，值数组的元素串位没有「当前键」）走姊妹
             解析 dslArrayElemFieldAt（字段=数组属主键），查表先共享表再姊妹表（keyword/数值/
             boolean 形态档仅此链路消费，':' 值位 regime 540 冻结不动）；既有 ':' 值串位走
             dslValueFieldAt + 共享表原路逐字节不变。 */
          if (guard.inStr && guard.valueKey) {
            const fieldPath = guard.arrayElem
              ? dslArrayElemFieldAt(guard.valueKey, guard.parentKey ?? null)
              : dslValueFieldAt(guard.valueKey, guard.parentKey ?? null, guard.grandKey ?? null);
            const fld = fieldPath ? props.dslAssist!.fields().find(f => f.path === fieldPath) : undefined;
            const hint = fld ? (guard.arrayElem
              ? (DSL_VALUE_TYPE_HINTS[fld.type] ?? DSL_ARRAY_ELEM_TYPE_HINTS[fld.type])
              : DSL_VALUE_TYPE_HINTS[fld.type]) : undefined;
            if (hint) {
              const vEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
              const vsp = model.getPositionAt(guard.strStart);
              const vep = model.getPositionAt(vEnd);
              const vRange = {
                startLineNumber: vsp.lineNumber, startColumn: vsp.column,
                endLineNumber: vep.lineNumber, endColumn: vep.column,
              };
              return { suggestions: hint.values.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: '"' + v + '"', range: vRange, command: ACCEPT_FORMAT_COMMAND,
                detail: hint.detail,
                filterText: dslFilterText(v), /* W5-1 同手法：pattern '"' 可匹配 */
                sortText: dslSortText(i, v),
              })) };
            }
          }
          return { suggestions: [] };
        }
        /* I-1：range 覆盖闭合串——起=当前串起始（无串=光标位）。三档 insertText 均自带引号，
           接受后整串干净替换，不留 "" 残壳。
           N-1/N-2 有界右扫：仅串内（guard.inStr）才右扫闭合引号——串外裸键位（Ctrl+Space）
           无已敲引号，end=光标纯插入即合法，右扫会吞后文结构字符（}, " 等）；
           串内右扫遇 \n 即停（JSON 串不跨行）——未闭合串跨行扫到下一个引号会整行吞噬。 */
        let end = Math.max(0, Math.min(offset, doc.length));
        if (guard.inStr) {
          end = scanStringEnd(doc, end);
        }
        /* ux2 裸词左扩：串外裸词位 range 左扩到词首（敲 que 出 "query"，接受整词替换不产 que"query" 残壳——
           用户痛点②「识别不到」的另一半根因：triggerCharacters 只靠 "，裸词位 range 起点=光标位）。
           自扫 [\w.]（不依赖 monaco wordPattern——点分隔字段路径 user.na 也整段覆盖）；
           串内形态不变（strStart=串起始引号）；空词（Ctrl+Space 空位）左扩 0——N-1/N-2 回归不变。
           （串外 strStart===光标位是 dslKeyGuard L118-122 的既有语义。） */
        let startOff = guard.strStart;
        if (!guard.inStr) {
          while (startOff > 0 && /[\w.]/.test(doc[startOff - 1])) startOff--;
        }
        const sp = model.getPositionAt(startOff);
        const ep = model.getPositionAt(end);
        const range = {
          startLineNumber: sp.lineNumber, startColumn: sp.column,
          endLineNumber: ep.lineNumber, endColumn: ep.column,
        };
        /* 2.6.0 值位白名单档（spec §4.4）：order → asc/desc，track_total_hits → true/false，
           field → fields() 真实字段名（search/agg 通吃，exists 顺带受益）。
           insertText 自带引号（range 覆盖串壳，I-1 同形态）——裸值换串壳会产 "order": desc 非法 JSON；
           不接 commaAffixes（值是叶节点，无兄弟键逗号场景）。 */
        if (guard.valueKey) {
          const vk = guard.valueKey;
          const vals: string[] = vk === 'order' ? ['asc', 'desc']
            : vk === 'track_total_hits' ? ['true', 'false']
            : vk === 'field' ? props.dslAssist!.fields().map(f => f.path) : []; /* 524+1：组件名键钉空——search 档 "analyzer": 值位不出字段候选 */
          return { suggestions: vals.map((v, i) => ({
            label: v, kind: monaco.languages.CompletionItemKind.Value,
            insertText: '"' + v + '"', range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(v), /* W5-1 同手法：pattern '"' 可匹配 */
            sortText: dslSortText(i, v),
          })) };
        }
        const ctx = dslContext(doc, offset);
        if (ctx.kind === 'none') return { suggestions: [] };
        if (ctx.kind === 'agg-name') {
          /* 2.6.0：aggs 容器键位——实例名+聚合类型一步骨架（choice 占位直选类型，spec §4.5） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: [{
            label: 'my_agg', kind: monaco.languages.CompletionItemKind.Snippet,
            detail: '聚合实例（命名 + 类型一步落位）',
            insertText: wrapSnippet(doc, startOff, end, indent, '"${1:my_agg}": {\n  "${2|terms,avg,sum,min,max,stats,cardinality,date_histogram,date_range,top_hits|}": {\n    ${0}\n  }\n}', affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText('my_agg'),
            sortText: dslSortText(0, 'my_agg'),
          }] };
        }
        if (ctx.kind === 'agg-type') {
          /* 2.6.0：实例值对象键位——聚合类型骨架目录 + aggs 嵌套键 + 逗号自适应 */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: Object.entries(AGG_SNIPPETS).map(([k, snip], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snip.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, snip.text, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k),
            sortText: dslSortText(i, k),
          })) };
        }
        if (ctx.kind === 'root') {
          /* 2.6.0：八键全 snippet 骨架（spec §4.2）+ commaAffixes 逗号自适应（§3.1）。
             逗号拼在 snippet 文本外（字面量），tab 占位流程不受影响。 */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: ROOT_KEYS.map((k, i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: wrapSnippet(doc, startOff, end, indent, ROOT_KEY_SNIPPETS[k].text, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: ROOT_KEY_SNIPPETS[k].detail, range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k), /* W5-1 过滤关：pattern '"' 可匹配 */
            sortText: dslSortText(i, k), /* W5-1 排序关：组内保 ROOT_KEYS 序 */
          })) };
        }
        if (ctx.kind === 'query-type') {
          /* 缩进适配：snippet 后续行叠加当前行前导空白（深层嵌套位不再塌缩）；
             2.6.0：commaAffixes 逗号自适应（spec §3.1）——逗号为 snippet 外字面量，tab 流程同 root 档 */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: Object.entries(QUERY_SNIPPETS).map(([k, snip], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: wrapSnippet(doc, startOff, end, indent, snip, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k), /* W5-1 过滤关：同上 */
            sortText: dslSortText(i, k), /* W5-1 排序关：同上，组内保 QUERY_SNIPPETS 目录序 */
          })) };
        }
        if (ctx.kind === 'range-op') {
          /* 2.6.0：range 操作符位（spec §3.2）——gte/gt/lt/lte 带日期占位 + 逗号自适应。
             字符串拼接占位符（不用模板串，避 TS 模板里 ${ 转义事故） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: Object.entries(RANGE_OPS).map(([k, ph], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: affix.prefix + reindentSnippet('"' + k + '": "${1:' + ph + '}"', indent) + affix.suffix,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k),
            sortText: dslSortText(i, k),
          })) };
        }
        if (ctx.kind === 'exists-key') {
          /* 2.6.0：exists 键位钉死 "field" 单候选（语义纠错） */
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: [{
            label: 'field', kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: affix.prefix + '"field": "${1:fieldname}"' + affix.suffix,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText('field'),
            sortText: dslSortText(0, 'field'),
          }] };
        }
        /* 2.6.0：字段名带值骨架（spec §4.3）+ commaAffixes 逗号自适应——逗号为 snippet 外字面量，tab 流程同 root 档。
           值形态统一字符串占位：terms 数组/range 对象需用户手改——子句值形态各异，按 clause 全定制收益低，防误导优先。
           esc：f.path 是首个进 snippet 语法的动态数据，$ / } / \ 会被解析器变形，转义闭环（mapping 字段名罕见但防御零成本）
           五百三十一批：类型感知排序——ctx.clause 即该子句值位同级 op 键，命中类型的
           字段排前（range→date/数值族、term→keyword、match→text/keyword…），候选集不变仅 sortText 分档；
           doc 档 field 值位无算子上下文，维持 fields() 序（orderFieldsByTypeForOp 空 prio 零增量同口径）。 */
        const fieldAffix = commaAffixes(doc, startOff, end);
        const escSnippet = (s: string) => s.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/}/g, '\\}');
        /* 五百四十六批：数组元素对象键位（键链白名单=sort，dslContext array-elem-key 档）——
           排序字段位出字段候选，插入形态对齐 ROOT_KEY_SNIPPETS.sort 骨架（字段键 + order 值骨架）；
           逗号自适应与 root 档同手法。白名单外数组（must/filter 元素对象键位）不进本档，
           既有 query-type 出档零变化。 */
        if (ctx.kind === 'array-elem-key') {
          return { suggestions: props.dslAssist!.fields().map((f, i) => ({
            label: f.path, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: f.type,
            insertText: fieldAffix.prefix + '"' + escSnippet(f.path) + '": { "order": "${1|desc,asc|}" }' + fieldAffix.suffix,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(f.path), /* W5-1 过滤关：pattern '"' 可匹配 */
            sortText: dslSortText(i, f.path),
          })) };
        }
        /* 五百四十批：收口消费共享 orderFieldsByTypeForOp（本地 orderFieldsByType 原样平移，
           行为逐字节等值——原始序不做亲和族展开，与 orderFieldsByClauseOp 的语义分界见共享侧注释） */
        const opFields = orderFieldsByTypeForOp(props.dslAssist!.fields(), ctx.clause);
        return { suggestions: opFields.map((f, i) => ({
          label: f.path, kind: monaco.languages.CompletionItemKind.Snippet,
          detail: f.type,
          insertText: fieldAffix.prefix + '"' + escSnippet(f.path) + '": "${1:value}"' + fieldAffix.suffix,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range, command: ACCEPT_FORMAT_COMMAND,
          filterText: dslFilterText(f.path), /* W5-1 过滤关：同上 */
          sortText: dslSortText(i, f.path), /* W5-1 排序关：'!' 升权组内单调；组内序=类型感知置顶序（无倾向=fields() 序） */
        })) };
    }
  }
});

watch(() => props.modelValue, (v) => {
  if (editor && editor.getValue() !== v) editor.setValue(v ?? '');
});
watch(() => props.readonly, (v) => editor?.updateOptions({ readOnly: v }));
/* 六百六十八批：字号响应缺角修复——560 批字号档立法时只建了挂载初值通道，prop 变更
   后 Monaco 实例无感知（档位点击渲染字号不变，探针当年只断言 seg UI 在场）。
   readOnly watch 同款范式补一行：档位点击即刻生效，偏好还原路径（挂载初值）不受影响。 */
watch(() => props.fontSize, (v) => editor?.updateOptions({ fontSize: v }));
/* 五百三十二批 P0-2a：language prop 运行时跟随——DevTools body 在 _bulk 档切 ndjson
   （多根 NDJSON 不再被 json worker 全线误报语法红线，高亮保留、校验退场）。
   同 model 换语言（setModelLanguage），不重建编辑器：value/undo/滚动/布局全保留。 */
watch(() => props.language, (v) => {
  const model = editor?.getModel();
  if (model && v) monaco.editor.setModelLanguage(model, v);
});
/* 跟随全局深/浅主题切换（setTheme 是全局级，所有实例一起切） */
watch(() => appStore.effectiveTheme, () => monaco.editor.setTheme(themeName()));

/* w70:全站统一 Ctrl+Shift+F 格式化 —— 不逐页加按钮,一次注册所有 Monaco 生效 */
function registerFormatKeybind(ed: typeof editor) {
  if (!ed || typeof ed.addCommand !== 'function') return; // happy-dom mock 无 addCommand
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
    ed.getAction('editor.action.formatDocument')?.run();
  });
}

function format() {
  editor?.getAction('editor.action.formatDocument')?.run();
}
function insertSnippet(text: string) {
  if (!editor) return;
  const sel = editor.getSelection();
  if (sel) editor.executeEdits('snippet', [{ range: sel, text }]);
  editor.focus();
}

/* R39：行内判定徽标通道——glyph margin 三色小点 + hover 人话（deltaDecorations 增量替换） */
let chipDecorations: string[] = [];
function setGutterChips(chips: { line: number; kind: string; hover: string }[]) {
  if (!editor) return;
  editor.updateOptions({ glyphMargin: chips.length > 0 });
  chipDecorations = editor.deltaDecorations(chipDecorations, chips.map(c => ({
    range: new monaco.Range(c.line, 1, c.line, 1),
    options: {
      glyphMarginClassName: 'insight-chip insight-chip-' + String(c.kind).toLowerCase(),
      glyphMarginHoverMessage: { value: c.hover },
    },
  })));
}

/* W2-2：反模式提示 → monaco marker（黄线 + hover 建议）。
   owner 必须与 JSON 语法诊断区分开：本组件已配 jsonDefaults.setDiagnosticsOptions
   ({ validate: true })，语法 marker 的 owner 是 'json'，共用 owner 会把语法报错整片清掉。
   定位策略：用 finding.anchor 的带引号键名在文本里 findMatches，取第 nth 个命中。
   定位不到就不产 marker 并回报给调用方，由调用方降级为行内提示条——不静默丢弃。
   入参用泛型而非写死的结构体：本组件只需要 message/suggestion/severity/anchor/nth 这几个字段，
   但 unplaced 要原样退还给调用方（DslQueryView 存的是完整 Finding[]），
   写死结构体会让返回值退化成子集类型、赋不回 ref<Finding[]>。
   severity 档：warning→黄线、hint→灰点、error→红线（dslLint terms-scalar 结构错等必错形态）——
   DslQueryView 的 info→hint 降级映射喂进来仍是合法档位。 */
const LINT_OWNER = 'es-dsl-lint';
/* 五百三十四批 P0-2：泛型约束补可选 rule——dslLint Finding 全量在场，零 rule 的旧调用方
   （analyze525 stub 形态）零破坏；code 后缀与注册表 finding.rule 供 es-dsl-lint quick fix 分派。 */
function setMarkers<T extends {
  message: string; suggestion: string; severity: 'warning' | 'hint' | 'error'; anchor: string; nth: number; rule?: string;
}>(findings: T[]) {
  const model = editor?.getModel();
  if (!model) return { placed: 0, unplaced: findings.slice() };
  const markers: monaco.editor.IMarkerData[] = [];
  const unplaced: T[] = [];
  /* 五百三十四批 P0-2：定位→finding 注册表随 setMarkers 全量替换（重复 lint 不叠加），
     es-dsl-lint quick fix provider 按 marker 行列反查（monacoJsonQuickFix 承载）。 */
  const registry: DslLintMarkerEntry[] = [];
  for (const f of findings) {
    const hits = model.findMatches('"' + f.anchor + '"', false, false, true, null, false);
    const hit = hits[f.nth] ?? hits[0];
    if (!hit) { unplaced.push(f); continue; }
    markers.push({
      severity: f.severity === 'hint' ? monaco.MarkerSeverity.Hint
        : f.severity === 'error' ? monaco.MarkerSeverity.Error
        : monaco.MarkerSeverity.Warning,
      message: f.message + '\n建议：' + f.suggestion,
      startLineNumber: hit.range.startLineNumber,
      startColumn: hit.range.startColumn,
      endLineNumber: hit.range.endLineNumber,
      endColumn: hit.range.endColumn,
      code: { value: LINT_OWNER + ':' + (f.rule ?? ''), target: model.uri },
    });
    registry.push({
      startLineNumber: hit.range.startLineNumber,
      startColumn: hit.range.startColumn,
      endLineNumber: hit.range.endLineNumber,
      endColumn: hit.range.endColumn,
      finding: f,
    });
  }
  monaco.editor.setModelMarkers(model, LINT_OWNER, markers);
  recordDslLintMarkers(model.uri?.toString?.() ?? '', registry);
  return { placed: markers.length, unplaced };
}

/* 五百二十五批：行号直射 Warning marker——synonyms 规则行这类「行号已知」的 lint 源，
   findMatches('"anchor"') 锚点定位反而是错位源（规则行非 JSON、无锚点键名）。行号直射：
   marker 覆盖整行（起 1 列、止=行尾列），severity 恒 Warning。owner 由调用方给
   （'es-syn-lint' 等，多 lint 源同编辑器互不清，且与 JSON 语法诊断 owner 'json' 分离）；
   owners 记账随组件卸载清空（model 已随 editor.dispose 退役，显式清一遍防同 model 复用残留）。 */
const lineMarkerOwners = new Set<string>();
function setLineMarkers(markers: { line: number; message: string }[], owner: string) {
  const model = editor?.getModel();
  if (!model) return;
  lineMarkerOwners.add(owner);
  monaco.editor.setModelMarkers(model, owner, markers.map(m => ({
    severity: monaco.MarkerSeverity.Warning,
    message: m.message,
    startLineNumber: m.line,
    startColumn: 1,
    endLineNumber: m.line,
    endColumn: typeof model.getLineMaxColumn === 'function' ? model.getLineMaxColumn(m.line) : 1,
  })));
}

onBeforeUnmount(() => {
  hostRORef?.disconnect();
  /* 五百二十一批：逐语言 provider 全量 dispose（json+ndjson 注册面随组件卸载退役） */
  for (const d of dslAssistDisposables) d.dispose();
  dslAssistDisposables = [];
  /* 五百二十五批：setLineMarkers 各 owner 随卸载清空（setModelMarkers 全局注册面，不随 dispose 自动撤） */
  const m = editor?.getModel?.() ?? null;
  if (m) for (const o of lineMarkerOwners) monaco.editor.setModelMarkers(m, o, []);
  lineMarkerOwners.clear();
  /* 五百三十四批 P0-2：es-dsl-lint 注册表随卸载清理（marker 面随 model dispose 退役，
     注册表是模块级 Map 必须显式删；setModelMarkers 清 marker 属 524 既有契约——es-dsl-lint
     不在卸载清空列，本件只清注册表不动 marker 调用面） */
  if (m) clearDslLintMarkers(m.uri?.toString?.() ?? '');
  editor?.dispose();
});

defineExpose({ format, insertSnippet, setGutterChips, setMarkers, setLineMarkers, getEditor: () => editor });
</script>

<style scoped>
.monaco-host { width: 100%; border: 1px solid var(--line); border-radius: var(--r-m); overflow: hidden; }
</style>

<style>
/* R39 徽标三色（全局：monaco 装饰在组件 scope 外渲染） */
.insight-chip { border-radius: 50%; width: 8px !important; height: 8px !important; margin: var(--sp-1h) 0 0 var(--sp-1h); }
.insight-chip-dynamic { background: var(--ok); }
.insight-chip-static { background: var(--warn); }
.insight-chip-illegal { background: var(--err); }
</style>
