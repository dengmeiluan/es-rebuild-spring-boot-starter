/**
 * 1439：补全骨架「接受即合法」总闸。
 *
 * Monaco 把 `${n:默认值}` 原样插入，长这样的一段骨架接受后必须仍是合法 JSON——
 * 否则用户点一下补全就得到一段非法 DSL。实测 `terms` 骨架的数组占位漏了引号
 * （`[${2:value}]` → `[value]`），是本文件要永久守住的缺陷形态。
 *
 * 覆盖面：查询骨架、聚合骨架、根键骨架、子句体键表、字段配置表、建议器体、检索器体。
 */
import { describe, it, expect } from 'vitest';
import {
  QUERY_BODY_KEYS, CLAUSE_VALUE_KEYS, SUGGEST_BODY_KEYS,
  QUERY_SNIPPETS, AGG_SNIPPETS, ROOT_KEY_SNIPPETS, ROOT_KEYS,
  retrieverBodyKeys,
} from '../utils/dslCompletionContext';

type Keyed = { text: string; key?: string };

/** Monaco snippet → 接受后的字面文本（choice 取首项、占位取默认值、转义还原） */
export function expandSnippet(s: string): string {
  return s
    .replace(/\$\{\d+\|([^}]*)\|\}/g, (_m, t) => String(t).split(',')[0])
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\\([$}\\])/g, '$1');
}

/** 把一组骨架包进对象解析；key 给出时还要求展开后确实写了这个键 */
export function snippetProblems(label: string, items: Keyed[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const body = expandSnippet(it.text);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse('{' + body + '}');
    } catch (e: any) {
      out.push(`${label} 接受后非法 JSON：${body}（${e.message}）`);
      continue;
    }
    if (it.key && !(it.key in obj)) out.push(`${label} 展开后缺少键 ${it.key}`);
  }
  return out;
}

function allProblems(): string[] {
  const out: string[] = [];
  for (const [op, list] of Object.entries(QUERY_BODY_KEYS)) {
    out.push(...snippetProblems('QB:' + op, list.map(k => ({ text: k.insert, key: k.key }))));
  }
  for (const [op, list] of Object.entries(CLAUSE_VALUE_KEYS)) {
    out.push(...snippetProblems('CV:' + op, list.map(k => ({ text: k.insert, key: k.key }))));
  }
  for (const [op, list] of Object.entries(SUGGEST_BODY_KEYS)) {
    out.push(...snippetProblems('SB:' + op, list.map(k => ({ text: k.insert, key: k.key }))));
  }
  for (const op of ['standard', 'knn', 'rrf', 'linear', 'text_similarity_reranker', 'rule', 'pinned', 'diversify', 'rescorer']) {
    out.push(...snippetProblems('RB:' + op, retrieverBodyKeys(op).map(k => ({ text: k.insert, key: k.key }))));
  }
  out.push(...snippetProblems('QS', Object.entries(QUERY_SNIPPETS).map(([k, t]) => ({ text: t, key: k }))));
  out.push(...snippetProblems('AS', Object.entries(AGG_SNIPPETS).map(([k, t]) => ({ text: t.text, key: k }))));
  out.push(...snippetProblems('RK', ROOT_KEYS.map(k => ({ text: ROOT_KEY_SNIPPETS[k].text, key: k }))));
  return out;
}

describe('1439 补全骨架接受即合法', () => {
  it('全部骨架展开后都是合法 JSON，且键名一致', () => {
    expect(allProblems()).toEqual([]);
  });

  it('terms 骨架的数组占位带引号（修复点回归）', () => {
    const accepted = expandSnippet(QUERY_SNIPPETS.terms);
    expect(accepted).toContain('["');
    expect(() => JSON.parse('{' + accepted + '}')).not.toThrow();
  });

  it('负控：旧 terms 骨架（裸占位）必须被总闸点名', () => {
    const broken = snippetProblems('QS', [{ text: '"terms": {\n  "field": [value]\n}', key: 'terms' }]);
    expect(broken).not.toEqual([]);
    expect(broken[0]).toContain('非法 JSON');
  });

  it('负控：键名写错（骨架写了别的键）必须被点名', () => {
    const broken = snippetProblems('QB:x', [{ text: '"must": []', key: 'filter' }]);
    expect(broken).toEqual(['QB:x 展开后缺少键 filter']);
  });
});
