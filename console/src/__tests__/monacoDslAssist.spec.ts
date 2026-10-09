/**
 * W4 Task 13：MonacoEditor 可选 DSL 补全 provider（dslAssist）接线。
 *
 * 用例清单（controller 裁定）：
 *   ① dslAssist 缺席零影响——mount 不炸、registerCompletionItemProvider 不被调；
 *   ② 传了则注册（'json' + triggerCharacters ['"']），dispose 随卸载调用；
 *   ③ root 键位出 ROOT_KEYS（2.6.0：八键全 Snippet 骨架 + detail + commaAffixes 逗号自适应）；
 *   ④ query-type 键位出 8 条 snippets（Snippet + InsertAsSnippet 规则）；
 *   ⑤ field 键位出 dslAssist.fields() 清单（2.6.0：Snippet 值骨架，detail=type）；
 *      附：第二键位（',' 后开串）仍出——锁定守卫 ',' 分支；
 *   ⑥ 值位/值串内三档均不出（T12 评审守卫）：
 *      {"query":⏎（root 档值位）/ {"query": "he⏎（root 档值串）/
 *      {"query": {"match": "he⏎（query-type 档值串）/ {"query": {"match": {"title": "he⏎（field 档值串）；
 *   ⑦ none 档（非 query/aggs 深层区）恒空（2.6.0 Task 8 起 aggs 容器/实例值键位改出 agg-name/agg-type 档）；
 *   ⑭ 2.6.0 Task 8 聚合档：agg-name（aggs 容器键位，实例名+类型一步骨架）/agg-type（实例值对象键位，
 *      十键聚合骨架 + aggs 嵌套键，逗号自适应）；
 *   ⑧ DslQueryView 冒烟：mount 不炸；W4-T14 渗透后视图主编辑器传 dslAssist → 签名注册恰 1 条。
 *   ⑬ ux2：旧 registerCompletion（['"','.'] 裸词 provider）退役——DslQueryView 挂载后零该签名注册。
 *   ⑨ I-1 回归：range 覆盖闭合串——root 档无闭合引号（{ "que⏎）/ auto-close（{ "que⏎" }）、
 *      field 档两形态，接受后整串干净替换无双引号残壳；
 *   ⑩ M-2：数组裸元素位（"must": [⏎ / ["x", ⏎，栈顶 '['）压住；
 *      元素对象已开（"must": [{⏎，栈顶 '{'）仍出 query-type。
 *   N-1/N-2（T13 复审）：右扫有界——串外裸键位（Ctrl+Space）end=光标纯插入，
 *      不吞后文结构（}, "size" 完好、JSON 合法）；串内右扫遇 \n 即停（JSON 串不跨行），跨行不吞。
 *   ⑪ W5-1（真机复扫观察项①）：三档 sortText 均带 '!' 升权前缀（压过 JSON LS $schema）且组内保序；
 *      filterText 均带 '"' 前缀（敲 " 后过滤 pattern 含引号，无 filterText 拿 label 匹配会被整档过滤）。
 *   ⑫ ux2 裸词左扩（Task 3）：串外裸词位 range 左扩词首——root/field（含点分隔路径整段覆盖）/
 *      query-type（snippet 接受不产 ma"match" 残壳）三档。
 *   W6 bodyKind 分派（dslAssist 契约扩展 bodyKind?: () => BodyKind）：
 *      settings=串内键位出设置键（带 detail），值位（起始引号左侧 ':'）压住；
 *      mapping=键位出 properties 骨架（Snippet + InsertAsSnippet）；none=恒空；
 *      缺省（含显式 undefined）回退 search 三档（W4 现状回归）；bodyKind 闭包每次触发重新取值。
 *
 * stub 范式：vi.mock monaco editor.api（__registrations 捕获注册的 provider 对象，
 * 直接调 provideCompletionItems 断言 suggestions 有/无——守卫行为固化）；
 * CompletionItemKind/InsertTextRule 数值贴 monaco 0.52.2 真实枚举（M-3），断言一律符号引用；
 * contrib/worker 全部空 mock；../api 只堵网络出口（DslQueryView 冒烟用）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub——注册捕获 + 最小 editor 面（onMounted 链路：create/onDidChangeModelContent/addAction） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const registrations: Reg[] = [];
  const langConfs: any[] = []; /* 2.6.0：setLanguageConfiguration 入参捕获 */
  const fakeEditor = {
    onDidChangeModelContent: () => ({ dispose() {} }),
    addAction: () => {},
    getValue: () => '',
    setValue: () => {},
    updateOptions: () => {},
    getAction: () => null,
    getSelection: () => null,
    executeEdits: () => {},
    focus: () => {},
    deltaDecorations: () => [],
    getModel: () => null,
    dispose: () => {},
  };
  return {
    __registrations: registrations,
    __langConfs: langConfs,
    editor: {
      defineTheme: () => {},
      create: () => fakeEditor,
      setTheme: () => {},
      setModelMarkers: () => {},
    },
    languages: {
      registerCompletionItemProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      /* W3：字段 hover provider 注册面（json+ndjson 各一份，同数组捕获、dispose 同契约） */
      registerHoverProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      /* ux2 Task 2：monacoLanguages 语言层注册面（ensureLanguages 随 onMounted 触发） */
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: (lang: string, conf: any) => { langConfs.push({ lang, conf }); }, /* 2.6.0：捕获语言配置入参（Task 9 注释配置断言用） */
      registerCodeActionProvider: () => ({ dispose() {} }), /* ux2 Task 4：quick fix 注册面 */
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 }, /* M-3：贴 monaco 0.52.2 真实枚举值（2.6.0 值位档补 Value） */
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {
      constructor(
        public startLineNumber?: number, public startColumn?: number,
        public endLineNumber?: number, public endColumn?: number,
      ) {}
    },
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});

/* contrib/worker 全空 mock——斩断真实 monaco 导入链（jsdom/happy-dom 不可用） */
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/folding/browser/folding', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/find/browser/findController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/format/browser/formatActions', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/comment/browser/comment', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }));

/* DslQueryView 冒烟用：只堵网络出口（同 G7 范式，惰性包装防 TDZ） */
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterInspect: () => Promise.resolve({ mappings: {} }),
      /* W4-T14：DslQueryView 新增 useIndexFields（mappingDetail 出口）——堵网络出口 */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import MonacoEditor from '../components/MonacoEditor.vue';
import DslQueryView from '../views/DslQueryView.vue';
import { QUERY_SNIPPETS, ROOT_KEYS } from '../utils/dslCompletionContext';

const registrations = () => (monacoStub as any).__registrations as Reg[];
/* dslAssist provider 签名：triggerCharacters 恰好 ['"']（ux2 Task 5 后旧 ['"','.'] 裸词 provider 已退役——签名过滤保留作防御性区分） */
const dslRegs = () => registrations().filter(r => {
  const tc = r.provider?.triggerCharacters;
  return Array.isArray(tc) && tc.length === 1 && tc[0] === '"';
});

/* W3：hover provider 签名 = 无 triggerCharacters（补全 provider 恰 ['"']） */
const hoverRegs = () => registrations().filter(r => !Array.isArray((r.provider as any)?.triggerCharacters));

/* 枚举符号引用（stub 数值已贴 monaco 0.52.2 真实值）——断言不写死数字 */
const Kind = (monacoStub as any).languages.CompletionItemKind;
const Rule = (monacoStub as any).languages.CompletionItemInsertTextRule;

/** offset → {lineNumber,column}（与真实 ITextModel.getPositionAt 同口径：1 基，\n 换行） */
function offsetToPos(doc: string, off: number) {
  let line = 1, last = -1;
  for (let i = 0; i < off; i++) if (doc[i] === '\n') { line++; last = i; }
  return { lineNumber: line, column: off - last };
}
/** {lineNumber,column} → offset（offsetToPos 逆运算） */
function posToOffset(doc: string, p: { lineNumber: number; column: number }) {
  let off = 0;
  for (let l = 1; l < p.lineNumber; l++) off = doc.indexOf('\n', off) + 1;
  return off + p.column - 1;
}
/** provider 产的 plain range → [起 offset, 止 offset) */
function rangeOffsets(doc: string, range: any): [number, number] {
  return [
    posToOffset(doc, { lineNumber: range.startLineNumber, column: range.startColumn }),
    posToOffset(doc, { lineNumber: range.endLineNumber, column: range.endColumn }),
  ];
}
/** 模拟接受建议：range 区间替换为 insertText（root/field 档均为纯文本） */
function accept(doc: string, item: any): string {
  const [s, e] = rangeOffsets(doc, item.range);
  return doc.slice(0, s) + item.insertText + doc.slice(e);
}
/** 模拟 snippet 接受：占位符落默认值（${1:x}→x、${1|a,b|}→a、${0}→''）后按 range 替换——贴 monaco 真实落文本 */
function acceptSnippet(doc: string, item: any): string {
  const text = (item.insertText as string)
    .replace(/\$\{\d+\|([^}]*)\|\}/g, (_m, s) => String(s).split(',')[0]) /* choice 选项逗号分隔（${1|a,b|}→a） */
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\\([$}\\])/g, '$1'); /* monaco snippet 转义还原：\$→$ \}→} \\→\（field 档动态路径转义的逆口径） */
  const [s, e] = rangeOffsets(doc, item.range);
  return doc.slice(0, s) + text + doc.slice(e);
}

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'price', type: 'long' },
];

const apps: ReturnType<typeof createApp>[] = [];

function mountEditor(props: Record<string, any>) {
  const app = createApp({ render: () => h(MonacoEditor as any, props) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { app, host };
}

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/** 直接调用捕获的 provider：model stub 供 getValue/getOffsetAt/getPositionAt（光标默认文末） */
function suggest(doc: string, offset = doc.length): any[] {
  const reg = dslRegs()[0];
  expect(reg, 'dslAssist provider 应已注册').toBeTruthy();
  const model = {
    getValue: () => doc,
    getOffsetAt: () => offset,
    getPositionAt: (off: number) => offsetToPos(doc, off),
  };
  return reg.provider.provideCompletionItems(model, {}).suggestions;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  registrations().length = 0;
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('W4-T13 MonacoEditor dslAssist provider 接线', () => {
  it('① dslAssist 缺席：mount 不炸、零注册（零影响回归）', () => {
    mountEditor({ modelValue: '{}' });
    expect(document.querySelector('.monaco-host')).toBeTruthy();
    expect(registrations().length).toBe(0);
  });

  it('②-b json 语言配置显式钉 comments（2.6.0 Task 9 幂等防回归断言，终审 M2）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const confs = (monacoStub as any).__langConfs as any[];
    const json = confs.filter(c => c.lang === 'json');
    expect(json.length).toBeGreaterThan(0);
    expect(json[0].conf).toEqual({ comments: { lineComment: '//', blockComment: ['/*', '*/'] } });
  });

  it('② 传 dslAssist：json+ndjson 各注册一份（triggerCharacters ["]），dispose 随卸载全量', () => {
    const { app } = mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 五百二十一批：provider 抽工厂逐语言注册——ndjson（BulkEditor body 语言）同享补全 */
    expect(dslRegs().length).toBe(2);
    expect(dslRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson']);
    for (const r of dslRegs()) {
      expect(r.provider.triggerCharacters).toEqual(['"']);
      expect(r.disposed).toBe(false);
    }
    app.unmount();
    expect(dslRegs().every(r => r.disposed), '两份注册必须全部随卸载 dispose').toBe(true);
  });

  it('③ root 档：八键全 snippet 骨架 + detail + kind/rule + 接受后 JSON 合法（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const items = suggest('{\n  \n}', 4);
    expect(items.map((i: any) => i.label)).toEqual(ROOT_KEYS);
    for (const i of items) {
      expect(i.kind).toBe(Kind.Snippet);
      expect(i.insertTextRules).toBe(Rule.InsertAsSnippet);
      expect(i.detail, i.label + ' 带一句话说明').toBeTruthy();
      expect(i.insertText, i.label + ' 骨架含冒号值位').toContain('":');
      /* 端到端：接受后文本必须是合法 JSON（占位符落默认值） */
      const after = acceptSnippet('{\n  \n}', i);
      expect(() => JSON.parse(after), i.label + ' 接受后非法：' + after).not.toThrow();
    }
    /* 键位形态抽查：query 对象骨架 / size 数字 / track_total_hits choice */
    const q = items.find((i: any) => i.label === 'query');
    /* 该位行缩进 2 → 多行骨架后续行叠加缩进（reindentSnippet 同 query-type 档口径） */
    expect(q.insertText).toBe('"query": {\n    ${0}\n  }');
    const sz = items.find((i: any) => i.label === 'size');
    expect(sz.insertText).toBe('"size": ${1:10}');
    const tth = items.find((i: any) => i.label === 'track_total_hits');
    expect(tth.insertText).toBe('"track_total_hits": ${1|true,false|}');
  });

  it('③-b root 档逗号自适应：后跟兄弟键带尾逗号；层尾不带；漏敲前逗号补齐', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 层尾（右邻 }）→ 无尾逗号 */
    const atTail = suggest('{\n  \n}', 4);
    expect(atTail.find((i: any) => i.label === 'query').insertText.endsWith(',')).toBe(false);
    /* 后跟 "size"（右邻 "）→ 尾逗号 */
    const doc2 = '{\n  \n  "size": 10\n}';
    const mid = suggest(doc2, 4);
    const q2 = mid.find((i: any) => i.label === 'query');
    expect(q2.insertText.endsWith(',')).toBe(true);
    const after2 = acceptSnippet(doc2, q2);
    expect(() => JSON.parse(after2), after2).not.toThrow();
    expect(JSON.parse(after2).size).toBe(10);
    /* 漏敲前逗号（左邻值）→ 前逗号补齐。串内位左邻非 {/, 被 dslKeyGuard 压住不可达，
       可达形态是串外裸词位（ux2 左扩同口径）：range 覆盖裸词 query，左邻 '0' → 补 ',' */
    const doc3 = '{"size": 10 query';
    const q3 = suggest(doc3).find((i: any) => i.label === 'query');
    expect(q3.insertText.startsWith(',')).toBe(true);
  });

  it('④ query-type 键位出 8 条 snippet（Snippet + InsertAsSnippet）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const s = suggest('{"query": {"');
    expect(Object.keys(QUERY_SNIPPETS).length).toBe(8);
    expect(s.length).toBe(8);
    for (const i of s) {
      expect(i.kind).toBe(Kind.Snippet);
      expect(i.insertTextRules).toBe(Rule.InsertAsSnippet);
      expect(i.insertText).toBe((QUERY_SNIPPETS as Record<string, string>)[i.label]);
      /* 2.6.2：接受即格式化 command 挂载（幂等归一的正解——落位形态随动回滚，规整交给 formatDocument） */
      expect(i.command?.id, i.label + ' 挂接受即格式化 command').toBe('editor.action.formatDocument');
    }
  });

  it('④-b 深层嵌套位：snippet 后续行叠加当前行缩进（选关键字后不再塌缩）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 场景贴真机截图：must 数组元素对象内（{␣ 形态，行缩进 8）选 match——
       monaco 多行 snippet 不叠加当前行缩进，裸字面量会塌到固定 2/0 列；
       裸数组位（[⏎）被 dslKeyGuard M-2 压住不出档，真机触发位是元素对象已开形态 */
    const doc = '{\n  "query": {\n    "bool": {\n      "must": [\n        { "\n      ]\n    }\n  }\n}';
    const off = doc.indexOf('"\n      ]') + 1;
    const s = suggest(doc, off);
    const m = s.find(i => i.label === 'match');
    expect(m, '深层位仍出 query snippet 档').toBeTruthy();
    expect(m.insertText, '后续行必须叠加当前行缩进 8（snippet 相对缩进 2/0 保留）')
      .toBe('"match": {\n          "${1:field}": "${2:value}"\n        }');
    /* 落文本口径：field 行 10 列（8+2），收尾 } 与 match 键同列（8）——2.6.2 起规整由接受后 formatDocument 归一 */
    const lines = acceptSnippet(doc, m).split('\n');
    const mi = lines.findIndex(l => l.includes('"match"'));
    expect(lines[mi]).toBe('        { "match": {');
    expect(lines[mi + 1]).toBe('          "field": "value"');
    expect(lines[mi + 2]).toBe('        }');
  });

  it('④-d 接受即格式化 command：全档挂载 formatDocument（2.6.2 幂等归一）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 多行骨架档（query-type）+ 单行档（field 值位骨架）+ root 档全挂——
       落位乱不乱不再依赖触发排版：接受后 formatDocument 统一规整；
       真机场景（单行紧凑文档 {} 内落位脱钩）由 command 归一，lineBreakAffixes 手工推算路线已废弃 */
    for (const [doc, off] of [['{\n  "query": {\n    \n  }\n}', 16], ['{"query": {"match": {"', 21]] as const) {
      const items = suggest(doc, off);
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) {
        expect(i.command?.id, i.label).toBe('editor.action.formatDocument');
      }
    }
    /* must 数组元素 {} 内落文本：reindent 落点兜底（format 前的基本放置），JSON 合法 */
    const doc2 = '{\n  "query": {\n    "bool": {\n      "must": [\n        {""}\n      ]\n    }\n  }\n}';
    const m = suggest(doc2, doc2.indexOf('{""}') + 2).find((i: any) => i.label === 'match');
    expect(m.command?.id).toBe('editor.action.formatDocument');
    expect(() => JSON.parse(acceptSnippet(doc2, m))).not.toThrow();
  });

  it('④-e 常规整行空白键位行为不变（无双换行——2.6.0 口径回归）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  "query": {\n    \n  }\n}';
    /* offset 19=行 3 行尾（行 3 是 4 空格，query 5 字母——真机触发位 strStart 在行缩进后） */
    const m = suggest(doc, 19).find((i: any) => i.label === 'match');
    const lines = acceptSnippet(doc, m).split('\n');
    const mi = lines.findIndex(l => l.includes('"match"'));
    expect(lines[mi]).toBe('    "match": {');
    expect(lines[mi + 1]).toBe('      "field": "value"');
    expect(lines[mi + 2]).toBe('    }');
  });

  it('④-c query-type 档逗号自适应：query 内后跟兄弟子句带尾逗号；层尾不带（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 层尾：{"query": { | } } → 无尾逗号 */
    const tail = suggest('{\n  "query": {\n    \n  }\n}', 16);
    const mTail = tail.find((i: any) => i.label === 'match');
    expect(mTail.insertText.endsWith(',')).toBe(false);
    const afterTail = acceptSnippet('{\n  "query": {\n    \n  }\n}', mTail);
    expect(() => JSON.parse(afterTail), afterTail).not.toThrow();
    /* 后跟兄弟：{"query": { | "term": ... }} → 尾逗号，接受后合法 */
    const doc2 = '{"query": {  "term": {"a": "b"} }}';
    const mid = suggest(doc2, 12);
    const mMid = mid.find((i: any) => i.label === 'match');
    expect(mMid.insertText.endsWith(',')).toBe(true);
    const after2 = acceptSnippet(doc2, mMid);
    expect(() => JSON.parse(after2), after2).not.toThrow();
  });

  it('⑤ field 键位出 fields() 清单（Snippet + detail=type）；第二键位（"," 后）仍出', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    for (const doc of ['{"query": {"match": {"', '{"query": {"match": {"title": "x", "']) {
      const s = suggest(doc);
      expect(s.map(i => i.label)).toEqual(['title', 'price']);
      for (const [idx, i] of s.entries()) {
        expect(i.kind).toBe(Kind.Snippet);
        expect(i.detail).toBe(FIELDS[idx].type);
        expect(i.insertText).toBe('"' + FIELDS[idx].path + '": "${1:value}"'); /* 2.6.0：字段名带值骨架 */
        expect(i.insertTextRules).toBe(Rule.InsertAsSnippet);
      }
    }
  });

  it('⑤-c field 档：路径含 snippet 特殊字符时 insertText 转义（2.6.0 防御）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [{ path: 'foo$bar', type: 'keyword' }] } });
    const doc = '{\n  "query": {\n    "match": {\n      "\n    }\n  }\n}';
    const t = suggest(doc, 37).find((i: any) => i.label === 'foo$bar');
    expect(t.insertText).toBe('"foo\\$bar": "${1:value}"');
    /* monaco 解 snippet 后 \\$ 还原 $——接受落文本含原名，JSON 合法 */
    const after = acceptSnippet(doc, t);
    expect(after).toContain('foo$bar');
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('⑤-b field 档：值骨架接受后 JSON 合法 + 逗号自适应（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 层尾：match 值对象内唯一键 → 无尾逗号（串内形态：光标在已敲 " 后，offset 37） */
    const doc = '{\n  "query": {\n    "match": {\n      "\n    }\n  }\n}';
    const items = suggest(doc, 37);
    const t = items.find((i: any) => i.label === 'title');
    expect(t.insertText.endsWith(',')).toBe(false);
    const after = acceptSnippet(doc, t);
    expect(() => JSON.parse(after), after).not.toThrow();
    /* 后跟兄弟字段（右邻 "）→ 尾逗号（串外裸键位：光标在 { 后、"price" 前，offset 23） */
    const doc2 = '{"query": {"match": {  "price": 1 }}}';
    const items2 = suggest(doc2, 23);
    const t2 = items2.find((i: any) => i.label === 'title');
    expect(t2.insertText.endsWith(',')).toBe(true);
    expect(() => JSON.parse(acceptSnippet(doc2, t2))).not.toThrow();
  });

  it.each([
    ['{"query":', 'root 档值位（query 值未进入）'],
    ['{"query": "he', 'root 档值串内'],
    ['{"query": {"match": "he', 'query-type 档值串内'],
    ['{"query": {"match": {"title": "he', 'field 档值串内'],
  ])('⑥ 守卫：%s（%s）不出建议', (doc) => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest(doc as string)).toEqual([]);
  });

  it('⑨a I-1 回归：无闭合引号（{ "que⏎）range 覆盖串起始到光标，接受后干净', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{ "que';
    const s = suggest(doc);
    expect(s.length).toBe(ROOT_KEYS.length);
    const item = s.find(i => i.label === 'query');
    /* range = [起始引号 offset 2, 光标 offset 6)——覆盖已敲的 "que 整段（含起始引号） */
    expect(rangeOffsets(doc, item.range)).toEqual([2, doc.length]);
    /* 2.6.0：root 档 snippet 骨架——接受后落 query 对象骨架，整串干净替换不变 */
    expect(acceptSnippet(doc, item)).toBe('{ "query": {\n  \n}');
  });

  it('⑨b I-1 回归：auto-close 形态（{ "que⏎" }）range 止覆盖到闭合引号之后', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{ "que" }';
    const cursor = doc.indexOf('" }'); /* 光标紧贴闭合引号左侧 */
    const s = suggest(doc, cursor);
    const item = s.find(i => i.label === 'query');
    expect(rangeOffsets(doc, item.range)).toEqual([2, cursor + 1]);
    expect(acceptSnippet(doc, item)).toBe('{ "query": {\n  \n} }');
  });

  it('⑨c I-1 回归：field 档两形态——接受后 "price" 干净无双引号', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 无 auto-close：串未闭合，range 止=光标 */
    const doc1 = '{"query": {"match": {"pri';
    const strStart = doc1.length - 4; /* '"pri' 的起始引号 */
    const p1 = suggest(doc1).find(i => i.label === 'price');
    expect(p1.insertText).toBe('"price": "${1:value}"'); /* 2.6.0：字段名带值骨架 */
    expect(rangeOffsets(doc1, p1.range)).toEqual([strStart, doc1.length]);
    const applied1 = accept(doc1, p1);
    expect(applied1).toBe('{"query": {"match": {"price": "${1:value}"');
    expect(applied1).not.toContain('""');
    /* auto-close：闭合引号在光标后，range 止覆盖到其后 */
    const doc2 = '{"query": {"match": {"pri" }';
    const cursor2 = doc2.indexOf('" }');
    const p2 = suggest(doc2, cursor2).find(i => i.label === 'price');
    expect(rangeOffsets(doc2, p2.range)).toEqual([strStart, cursor2 + 1]);
    const applied2 = accept(doc2, p2);
    expect(applied2).toBe('{"query": {"match": {"price": "${1:value}" }');
    expect(applied2).not.toContain('""');
  });

  it('N-1 复审回归：串外裸键位（Ctrl+Space）纯插入不右扫——}, "size" 完好、JSON 合法', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {}, "size": 10}';
    const cursor = doc.indexOf('{}') + 1; /* {"query": {⏎}, "size": 10}——query 值对象内键位 */
    const s = suggest(doc, cursor);
    expect(s.length).toBe(8); /* query-type 档照出 */
    const item = s.find(i => i.label === 'match');
    /* range=[光标,光标) 纯插入——无已敲引号（insertText 自带引号正好），不吞 }, " */
    expect(rangeOffsets(doc, item.range)).toEqual([cursor, cursor]);
    const applied = acceptSnippet(doc, item);
    expect(applied).toContain('}, "size": 10}');
    expect(() => JSON.parse(applied)).not.toThrow();
  });

  it('N-2 复审回归：串未闭合右扫遇换行即停——跨行不吞，"size": 10 行完好', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  "que\n  "size": 10\n}';
    const cursor = doc.indexOf('que') + 3; /* "que⏎（串未闭合） */
    const s = suggest(doc, cursor);
    const item = s.find(i => i.label === 'query');
    /* range=[起始引号,光标)——跨行的 "size" 起始引号不可达 */
    expect(rangeOffsets(doc, item.range)).toEqual([doc.indexOf('"que'), cursor]);
    const applied = acceptSnippet(doc, item);
    /* 2.6.0：snippet 骨架叠加行缩进 2 + 右邻 "size" 尾逗号（commaAffixes §3.1），跨行右扫不吞不变 */
    expect(applied).toBe('{\n  "query": {\n    \n  },\n  "size": 10\n}');
    expect(applied).toContain('"size": 10');
    expect(() => JSON.parse(applied), applied).not.toThrow();
  });

  it('⑩ M-2：数组裸元素位压住；元素对象已开（[{）仍出 query-type', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 栈顶 '['：手动 Ctrl+Space 不再出 query-type snippet（接受即数组元素位塞键值对，非法 JSON） */
    expect(suggest('{"query": {"bool": {"must": [')).toEqual([]);
    expect(suggest('{"query": {"bool": {"must": ["match_all", ')).toEqual([]);
    /* 元素对象已开（栈顶 '{'）：既有行为保留，8 条 snippet 照出 */
    const s = suggest('{"query": {"bool": {"must": [{');
    expect(s.length).toBe(8);
    for (const i of s) expect(i.kind).toBe(Kind.Snippet);
  });

  it('⑪ W5-1 排序升权+过滤存活：三档 sortText 带 "!" 前缀压过 $schema、组内保序；filterText 带引号前缀', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const tiers: [string, string][] = [
      ['root', '{"'],
      ['query-type', '{"query": {"'],
      ['field', '{"query": {"match": {"'],
    ];
    for (const [name, doc] of tiers) {
      const s = suggest(doc);
      expect(s.length, `${name} 档应出建议`).toBeGreaterThan(0);
      const sts = s.map(i => i.sortText);
      for (const [idx, i] of s.entries()) {
        /* 排序关：'!'(33) < '$'(36)——monaco 0.52.2 对无 sortText 项回填 label，
           JSON LS 内建 $schema 排序键即 '$schema'；'!' 前缀字典序稳定压过它（'0'=48 压不过） */
        const st = sts[idx];
        expect(st, `${name} 档 ${i.label} 的 sortText 应带 '!' 前缀`).toMatch(/^!\d{3}/);
        expect(st < '$schema', `${name} 档 sortText "${st}" 应排在 $schema 前`).toBe(true);
        /* 过滤关：敲 " 后过滤 pattern='"'（range 覆盖起始引号 → overwriteBefore=1），
           无 filterText 拿 label 匹配 → fuzzyScore undefined → 整档被过滤出列表（真机实锤根因）。
           filterText='"'+label 与 insertText 同形态：pattern '"' 前缀强匹配得分 > FuzzyScore.Default(-100) */
        expect(i.filterText, `${name} 档 ${i.label} 的 filterText 应带 '"' 前缀`).toBe('"' + i.label);
      }
      /* 组内保序：序号三位零填定宽 → sortText 字典序单调递增 ⇔ 展示序=提供序 */
      expect([...sts].sort(), `${name} 档 sortText 应单调递增`).toEqual(sts);
    }
    /* 保序语义坐实：root 档展示序=ROOT_KEYS 序；field 档（match 算子，五百三十一批类型感知）
       text 命中 prio 首位排前、price(long) 殿后——本 fixture 恰与 fields() 原序同形（label 序未被 sortText 打乱） */
    expect(suggest('{"').map(i => i.label)).toEqual(ROOT_KEYS);
    expect(suggest('{"query": {"match": {"').map(i => i.label)).toEqual(['title', 'price']);
  });

  it('⑪-b 五百三十一批 field 档类型感知排序：range 算子 date/long 置前；match 算子 text 置顶；候选集不变', () => {
    const TYPED = [
      { path: 'a_title', type: 'text' },
      { path: 'm_price', type: 'long' },
      { path: 'z_created', type: 'date' },
    ];
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    /* term 算子 keyword 优先：fixture 无 keyword 字段 → 全员同档，保 fields() 序（零增量） */
    expect(suggest('{"query": {"term": {"').map(i => i.label)).toEqual(['a_title', 'm_price', 'z_created']);
    /* match 算子 text 优先：a_title(text) 置顶，其余保 fields() 序 */
    expect(suggest('{"query": {"match": {"').map(i => i.label)).toEqual(['a_title', 'm_price', 'z_created']);
    /* range 算子 date→数值族优先：z_created(date) 置顶、m_price(long) 次之、a_title(text) 殿后 */
    const r = suggest('{"query": {"range": {"');
    expect(r.map(i => i.label)).toEqual(['z_created', 'm_price', 'a_title']);
    /* 候选集不变：三条全在、detail=type 未动；sortText '!' 升权前缀不回退 */
    expect(r.map(i => i.detail)).toEqual(['date', 'long', 'text']);
    for (const i of r) expect(i.sortText).toMatch(/^!\d{3}/);
  });

  it('⑫a ux2 裸词左扩·root 档：串外裸词位 range 左扩词首——敲 que 出 "query"，接受整词替换不产残壳', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{ que';
    const s = suggest(doc);
    expect(s.map(i => i.label), '串外裸词位 root 档照出（守卫 N-1 语义不变）').toEqual(ROOT_KEYS);
    const item = s.find(i => i.label === 'query');
    /* range=[词首 2, 光标 5)——覆盖已敲裸词 que 整段（无引号可含，insertText 自带引号） */
    expect(rangeOffsets(doc, item.range)).toEqual([2, doc.length]);
    expect(acceptSnippet(doc, item)).toBe('{ "query": {\n  \n}');
  });

  it('⑫b 裸词左扩·field 档：点分隔路径 user.na 整段覆盖（自扫 [\\w.] 不依赖 monaco wordPattern）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [{ path: 'user.name', type: 'keyword' }] } });
    const doc = '{"query": {"match": {user.na';
    const item = suggest(doc).find(i => i.label === 'user.name');
    expect(rangeOffsets(doc, item.range)).toEqual([doc.indexOf('user.na'), doc.length]);
    expect(accept(doc, item)).toBe('{"query": {"match": {"user.name": "${1:value}"');
  });

  it('⑫c 裸词左扩·query-type 档：snippet 接受整词替换、不产 ma"match" 残壳', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {ma';
    const item = suggest(doc).find(i => i.label === 'match');
    expect(rangeOffsets(doc, item.range)).toEqual([doc.length - 2, doc.length]);
    const applied = acceptSnippet(doc, item);
    expect(applied).toContain('"match"');
    expect(applied).not.toContain('ma"');
  });

  it('⑦ none 档（非 query/aggs 深层区）恒空', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 2.6.0 Task 8 随动：原断言文档 '{"aggs": {"a": {"' 现落 agg-type 档（十一键骨架）——
       none 场景改 pin sort 深层（非 query/aggs 容器，不出层口径不变） */
    expect(suggest('{"sort": [{"@timestamp": {"')).toEqual([]);
  });

  it('⑧ DslQueryView 冒烟：mount 不炸；W4-T14 渗透后 dslAssist 签名注册恰 1 条', async () => {
    /* 视图编辑器区有 store.pickedIdx 门控（未选索引只渲染引导 EmptyState）——预置工作索引 */
    localStorage.setItem('es_picked', 'idx-a');
    const pinia = createPinia();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    });
    await router.push('/');
    await router.isReady();
    const app = createApp({ render: () => h(DslQueryView) });
    apps.push(app);
    app.use(pinia);
    app.use(router);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    /* W4-T14：视图主编辑器已接 dslAssist（fields 闭包 = useIndexFields/mappingDetail 出口）
       → dslAssist 签名注册恒为 2（json+ndjson 逐语言一份，五百二十一批起；ux2：旧 ['"','.'] 裸词 provider 已退役，见 ⑬） */
    expect(dslRegs().length).toBe(2);
  });

  it('⑬ ux2 旧 registerCompletion 退役：DslQueryView 挂载后零 [\'"\',\'.\'] 签名 provider（双打根因清除）', async () => {
    /* 同 ⑧ 挂载路径（视图编辑器区有 store.pickedIdx 门控——预置工作索引） */
    localStorage.setItem('es_picked', 'idx-a');
    const pinia = createPinia();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    });
    await router.push('/');
    await router.isReady();
    const app = createApp({ render: () => h(DslQueryView) });
    apps.push(app);
    app.use(pinia);
    app.use(router);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await settle();
    const legacy = registrations().filter(r => {
      const tc = r.provider?.triggerCharacters;
      return Array.isArray(tc) && tc.length === 2 && tc[0] === '"' && tc[1] === '.';
    });
    expect(legacy, '旧裸词 provider（签名 [\'"\',\'.\']）必须零注册').toEqual([]);
    expect(dslRegs().length, 'dslAssist 仍恰 json+ndjson 两份（⑧ 不回归）').toBe(2);
  });

  it('range-op 档：gte/gt/lt/lte 键位 snippet，接受后合法（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* offset 自核修正：计划给 26 落在 "date 串内（字段名串，出 field 档非 range-op）——
       真实可达键位是栈顶 { 内空白 30/31/32，取 31 */
    const doc = '{"query": {"range": {"date": {  }}}}';
    const items = suggest(doc, 31);
    expect(items.map((i: any) => i.label)).toEqual(['gte', 'gt', 'lt', 'lte']);
    const g = items[0];
    expect(g.kind).toBe(Kind.Snippet);
    expect(() => JSON.parse(acceptSnippet(doc, g))).not.toThrow();
  });

  it('exists-key 档：键位钉死 field 单候选（2.6.0 语义纠错）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {"exists": {  }}}';
    /* offset 自核修正：计划给 20 落在 "exists": 冒号后值位（dslKeyGuard 压住）——真实可达键位是栈顶 { 内空白 22/23/24，取 23 */
    const items = suggest(doc, 23);
    expect(items.length).toBe(1);
    expect(items[0].label).toBe('field');
    const after = acceptSnippet(doc, items[0]);
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('⑭a agg-name 档：实例名+类型一步骨架，接受后合法（2.6.0 Task 8）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"aggs": {  }}';
    /* offset 自核：10 落 "aggs" 值对象 { 后空白键位（串外空位，栈顶 { 内） */
    const items = suggest(doc, 10);
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe(Kind.Snippet);
    const after = acceptSnippet(doc, items[0]);
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('⑭b agg-type 档：十键聚合骨架 + aggs 嵌套键，逗号自适应（2.6.0 Task 8）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"aggs": {"by_user": {  }}}';
    /* offset 自核修正：计划给 21 落实例值 { 之前（agg-name 档位）——真实可达实例值键位是 { 后空白 22/23，取 23 */
    const items = suggest(doc, 23);
    const labels = items.map((i: any) => i.label);
    for (const k of ['terms', 'avg', 'sum', 'min', 'max', 'stats', 'cardinality', 'date_histogram', 'date_range', 'top_hits', 'aggs']) {
      expect(labels).toContain(k);
    }
    const t = items.find((i: any) => i.label === 'terms');
    expect(t.detail, 'H 发现性：带一句话说明').toBeTruthy();
    expect(t.insertText.endsWith(','), '层尾（右邻 }）不带尾逗号——commaAffixes 宁缺毋滥').toBe(false);
    const after = acceptSnippet(doc, t);
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('provider memo：同 doc 同 offset 连调返回同引用；doc 变更重算（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  \n}';
    const r1 = suggest(doc, 4);
    const r2 = suggest(doc, 4);
    expect(r2, 'quickSuggestions 同位重扫直接命中').toBe(r1);
    const r3 = suggest(doc + ' ', 4);
    expect(r3, 'doc 新引用 → 重算新对象').not.toBe(r1);
    expect(r3.map((i: any) => i.label)).toEqual(r1.map((i: any) => i.label));
  });
});

describe('W6 bodyKind 分派', () => {
  it('settings：串内键位出设置键（带 detail），值位（左侧 :）压住', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'settings' } });
    /* 键位：光标在串内，起始引号左侧最近非空白是 '{' → 出设置键档 */
    const keyDoc = '{\n  "\n}';
    const s = suggest(keyDoc, 5);
    const ri = s.find(i => i.label === 'refresh_interval');
    expect(ri, 'settings 档必须含 refresh_interval（SETTINGS_CATALOG 出口）').toBeTruthy();
    expect(ri.kind, '非 snippet 设置键走 Property').toBe(Kind.Property);
    expect(ri.insertText, 'insertText 自带引号（I-1 同形态）').toBe('"refresh_interval"');
    expect(ri.detail, '设置键必须带中文说明 detail').toBeTruthy();
    /* T2 Minor 加固（W6-T3 评审顺手补）：settings 档同锁 W5-1 真机回归面——
       filterText='"'+label（敲 " 后过滤存活）、sortText '!' 前缀升权（压过 JSON LS $schema） */
    for (const i of s) {
      expect(i.filterText, `settings 档 ${i.label} filterText 必须带 '"' 前缀`).toBe('"' + i.label);
      expect(i.sortText, `settings 档 ${i.label} sortText 必须带 '!' 前缀`).toMatch(/^!/);
    }
    /* 值位：起始引号左侧最近非空白是 ':' → 空列表（守卫同 W4 口径） */
    const valDoc = '{\n  "refresh_interval": "\n}';
    expect(suggest(valDoc, valDoc.indexOf('\n}')), '值位不许出档').toEqual([]);
  });

  it('mapping：键位出 properties 骨架（Snippet + InsertAsSnippet）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'mapping' } });
    const s = suggest('{\n  "\n}', 5);
    const prop = s.find(i => i.label === 'properties');
    expect(prop, 'mapping 档必须含 properties 骨架').toBeTruthy();
    expect(prop.kind).toBe(Kind.Snippet);
    expect(prop.insertTextRules, '骨架必须带 InsertAsSnippet 规则').toBe(Rule.InsertAsSnippet);
    expect(prop.insertText).toContain('${1:field}');
  });

  it('mapping 深层嵌套位：骨架后续行叠加当前行缩进（与 query snippet 同口径）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'mapping' } });
    const doc = '{\n  "mappings": {\n    "\n  }\n}';
    const off = doc.indexOf('"\n  }') + 1;
    const s = suggest(doc, off);
    const prop = s.find(i => i.label === 'properties');
    expect(prop, '深层位仍出 properties 骨架').toBeTruthy();
    expect(prop.insertText, '后续行叠加当前行缩进 4（相对缩进保留）')
      .toBe('"properties": {\n      "${1:field}": { "type": "${2:keyword}" }\n    }');
  });

  it('template：串内键位出模板八键（全 Snippet + W5-1 双关），串外压住', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'template' } });
    const s = suggest('{\n  "\n}', 5);
    expect(s.map(i => i.label)).toEqual([
      'index_patterns', 'priority', 'template', 'settings', 'mappings', 'aliases', 'composed_of', '_meta',
    ]);
    for (const i of s) {
      expect(i.kind, i.label).toBe(Kind.Snippet);
      expect(i.insertTextRules, i.label).toBe(Rule.InsertAsSnippet);
      expect(i.filterText, `template 档 ${i.label} filterText 必须带 '"' 前缀`).toBe('"' + i.label);
      expect(i.sortText, `template 档 ${i.label} sortText 必须带 '!' 前缀`).toMatch(/^!/);
    }
    /* 串外空位压住——template 与 settings/mapping 同锁 inStr（L218 分支公共守卫） */
    expect(suggest('{  }', 2)).toEqual([]);
  });

  it('none：恒空列表（_bulk NDJSON 体不扰动）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'none' } });
    expect(suggest('{"')).toEqual([]);
  });

  it('bodyKind 缺省（显式 undefined）回退 search——W4 三档现状回归', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: undefined } });
    const s = suggest('{"');
    expect(s.map(i => i.label), '缺省 bodyKind 必须回退 search root 档').toEqual(ROOT_KEYS);
    expect(s.map(i => i.label)).toContain('query');
  });

  it('bodyKind 闭包每次触发重新取值（端点随选随换，不缓存首值）', () => {
    let bk: 'settings' | 'none' = 'settings';
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => bk } });
    expect(suggest('{"').some(i => i.label === 'refresh_interval'), 'bk=settings 出设置键').toBe(true);
    bk = 'none';
    expect(suggest('{"'), 'bk 切 none 后同一位点必须空').toEqual([]);
  });

  it('mapping 档：snippet 骨架 + 后跟兄弟键带尾逗号（2.6.0 三档共享 w6Affix 的组合形态钉住）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mapping' } });
    const doc = '{\n  "\n  "dynamic": "strict"\n}';
    const items = suggest(doc, 5);
    const prop = items.find(i => i.label === 'properties');
    expect(prop.insertTextRules).toBe(Rule.InsertAsSnippet);
    expect(prop.insertText.endsWith(','), 'snippet 档后跟兄弟键带尾逗号（逗号拼在 reindent 骨架外）').toBe(true);
    /* 落文本锚定：骨架多行缩进叠加 + 尾逗号在闭合 } 之后 */
    const after = acceptSnippet(doc, prop);
    expect(after).toContain('"dynamic": "strict"');
    expect(after.indexOf('},')).toBeGreaterThan(-1);
  });

  it('settings 档逗号自适应：后跟兄弟设置键带尾逗号（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'settings' } });
    /* W6 档锁 g.ok && g.inStr（串外裸位压住不出档，同 template「串外压住」口径）——
       逗号用例必须串内形态：光标在已敲 " 后（同上方 settings 键位用例 offset 5）。
       后跟兄弟：end 右扫跳空白落 "number_of_replicas" 起始引号 → 尾逗号 */
    const doc = '{\n  "\n  "number_of_replicas": 1\n}';
    const items = suggest(doc, 5);
    const ri = items.find(i => i.label === 'refresh_interval');
    expect(ri.insertText.endsWith(','), '后跟兄弟设置键必须带尾逗号').toBe(true);
    /* 接受落文本逐字符锚定逗号落点（设置键是裸键无值骨架，续敲 : 值后整体才合法——
       不做 JSON.parse 全量校验，与 root/query/field 档 snippet 带值骨架的形态差异对齐） */
    expect(accept(doc, ri)).toBe('{\n  "refresh_interval",\n  "number_of_replicas": 1\n}');
    /* 层尾（右邻 }）→ 无尾逗号（宁缺毋滥，绝不产 trailing comma） */
    const tail = suggest('{\n  "\n}', 5);
    expect(tail.find(i => i.label === 'refresh_interval').insertText.endsWith(','), '层尾不许带尾逗号').toBe(false);
  });
});

describe('W3 字段 hover provider', () => {
  it('json+ndjson+painless 各注册一份（524 批扩 painless），dispose 随卸载全量；dslAssist 缺席零 hover 注册', () => {
    const { app } = mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 五百二十四批随迁：dslAssist 在档时 painless 语言加挂四骨架补全 + 字段 hover 各一份——
       hoverRegs 按「无 triggerCharacters」签名过滤，json/ndjson/painless hover 各 1 共 3；
       painless 补全 provider 签名 ['[', '.'] 不进 dslRegs（恰 ['"'] 过滤）也不进 hoverRegs */
    expect(hoverRegs().length).toBe(3);
    expect(hoverRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson', 'painless']);
    for (const r of hoverRegs()) expect(r.disposed).toBe(false);
    app.unmount();
    expect(hoverRegs().every(r => r.disposed), 'hover 注册必须随卸载 dispose').toBe(true);
    /* 补全注册计数不回归（dslRegs 只按 triggerCharacters 签名过滤，hover 不串档；
       painless 补全签名不同不串档——json+ndjson 恰 2，524 批前后同值） */
    expect(dslRegs().every(r => r.disposed)).toBe(true);
    mountEditor({ modelValue: '{}' });
    expect(hoverRegs().filter(r => !r.disposed).length, 'dslAssist 缺席 = 零 hover 注册').toBe(0);
  });

  it('word 命中 fields() → hover 出「type · 字段名」；未命中/无 fields 静默（null）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const reg = hoverRegs()[0];
    const hit = reg.provider.provideHover({ getWordAtPosition: () => ({ word: 'title' }) }, {});
    expect(hit, '命中字段必须出 hover').toBeTruthy();
    expect(hit.contents[0].value).toBe('text · title');
    expect(reg.provider.provideHover({ getWordAtPosition: () => ({ word: 'ghost' }) }, {}), '未命中的词静默').toBeNull();
    expect(reg.provider.provideHover({ getWordAtPosition: () => null }, {}), '无 word 静默').toBeNull();
    /* fields() 现调现读：空字段表静默（惰性 ensure 场景，挂载零请求态不弹空壳） */
    let list: { path: string; type: string }[] = [];
    /* 本用例首个挂载未卸载（afterEach 才清）——按挂载前基数取本次挂载的注册，
       否则 [0] 会拿到上一挂载（fields=FIELDS）的 provider，「空表静默」断言失真 */
    const undisposedBefore = hoverRegs().filter(r => !r.disposed).length;
    const { app } = mountEditor({ modelValue: '{}', dslAssist: { fields: () => list } });
    const reg2 = hoverRegs().filter(r => !r.disposed)[undisposedBefore];
    expect(reg2.provider.provideHover({ getWordAtPosition: () => ({ word: 'title' }) }, {}), '无 fields 静默').toBeNull();
    list = FIELDS;
    expect(reg2.provider.provideHover({ getWordAtPosition: () => ({ word: 'price' }) }, {})!.contents[0].value)
      .toBe('long · price');
    app.unmount();
  });
});

describe('2.6.0 值位白名单（spec §4.4）', () => {
  it('order 值串位 → asc/desc', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"sort": [{ "date": { "order": "d" } }] }';
    /* offset 自核：indexOf('"d"')=31（"sort"/"date" 无 '"d"' 子串），+2=33 落串内 d 后、闭合引号前 */
    const off = doc.indexOf('"d"') + 2;
    const items = suggest(doc, off);
    expect(items.map((i: any) => i.label)).toEqual(['asc', 'desc']);
    /* 值位档五字段钉：kind=Value + W5-1 filterText/sortText 同手法（防重构改坏静默退化） */
    for (const [idx, i] of items.entries()) {
      expect(i.kind).toBe(Kind.Value);
      expect(i.filterText).toBe('"' + i.label);
      expect(i.sortText).toBe('!' + String(idx).padStart(3, '0') + i.label);
    }
    /* 接受（整串壳替换，insertText 自带引号）后合法 */
    const after = accept(doc, items.find((i: any) => i.label === 'desc'));
    expect(() => JSON.parse(after), after).not.toThrow();
    expect(JSON.parse(after).sort[0].date.order).toBe('desc');
  });

  it('track_total_hits 值串位 → true/false', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"track_total_hits": "t" }';
    /* offset 自核：indexOf('"t"')=21（"track_total_hits" 内无 '"t"' 子串），+2=23 落串内 t 后 */
    const items = suggest(doc, doc.indexOf('"t"') + 2);
    expect(items.map((i: any) => i.label)).toEqual(['true', 'false']);
  });

  it('field 键值串位 → 真实字段名（exists/agg 通吃）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {"exists": {"field": "pr" } } }';
    /* offset 自核：indexOf('"pr"')=31，+3=34 落串内 r 后、闭合引号前 */
    const items = suggest(doc, doc.indexOf('"pr"') + 3);
    expect(items.map((i: any) => i.label)).toEqual(['title', 'price']);
  });

  it('非白名单键值位仍压制（match 值串不出档）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {"match": {"title": "hel" } } }';
    /* offset 自核：indexOf('"hel"')=30，+4=34 落串内 l 后、闭合引号前 */
    const items = suggest(doc, doc.indexOf('"hel"') + 4);
    expect(items).toEqual([]);
  });

  it('W6 加固：settings 体白名单同名键值位仍压制（g.valueKey 一并压，防泄漏退化钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'settings' } });
    const doc = '{\n  "order": "\n}';
    expect(suggest(doc, doc.indexOf('"\n}') + 1)).toEqual([]);
  });
});

describe('JSONC 注释跳过（dslKeyGuard 负向钉）', () => {
  it('行注释内 } 不弹栈：track_total_hits 值位白名单照出 true/false（误压钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* doc 里 '// }' 的 } 在未跳过时弹掉根帧 → topKey=null → 白名单不命中 → 压住 []；
       跳过注释后根帧 intact → lastKey='track_total_hits' → 值位白名单放行 */
    const doc = '{\n  // }\n  "track_total_hits": "t"';
    const off = doc.indexOf('"t"') + 2; /* "t" 串内 t 后（同既有值位用例 offset 复算口径） */
    expect(suggest(doc, off).map((i: any) => i.label)).toEqual(['true', 'false']);
  });

  it('块注释内 } 不弹栈：同上白名单照出（误压钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  /* } */\n  "track_total_hits": "t"';
    const off = doc.indexOf('"t"') + 2;
    expect(suggest(doc, off).map((i: any) => i.label)).toEqual(['true', 'false']);
  });

  it('注释透明：带行注释的 field 位与无注释等价（注释内 } 不弹 query 值对象帧）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 行注释内 } 弹掉 query 值对象 → dslContext 判 none（guard 已 ok）→ []；
       跳过注释 → field 档照出 title/price */
    const doc = '{"query": {\n  // }\n  "match": {';
    expect(suggest(doc).map((i: any) => i.label)).toEqual(['title', 'price']);
  });
});
