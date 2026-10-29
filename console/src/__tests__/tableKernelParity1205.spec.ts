/**
 * 1205：两个表格内核的右键能力互查清单。
 *
 * 用户反复问「为什么索引工作区 / 查询工作区 / SQL 三处的表格能力不一样」。
 * 前面几批（1187 JSON 视图、1191 filter-hit、1204 复制为查询）都是**逐个发现**再补，
 * 补完仍可能漏。这里换一种守法：把两侧菜单键名做差集，**RT（索引工作区）有而 QRT 没有的每一项
 * 必须在豁免清单里给出理由**，否则报红。这样将来任何一侧新增动作都会自动暴露差异。
 *
 * 已经同义异名的不算缺（导出五格式、筛选入口、排序直选），它们在 EXEMPT 里注明对应项。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '../components', p), 'utf-8');
/* key 与 label 之间有换行也要能取到——第一版写成 `{ key: 'x', label:` 单行形态，
   把多行缩进写的 `dsl-exists` 漏成「QRT 缺失」，是**清单自身误报**（不是产品缺口）。 */
const keysOf = (src: string) => new Set([...src.matchAll(/\bkey: '([a-z0-9-]+)',\s*\n?\s*label:/g)].map(m => m[1]!));

const rt = read('ResultTable.vue');
const qrt = read('QueryResultTable.vue');
const rtKeys = keysOf(rt);
const qrtKeys = keysOf(qrt);

/* RT 专属项：要么不该出现在 QRT（语义不适用），要么 QRT 已有等价入口。
   新增差异必须在这里写明理由——空口「差不多」不算。 */
const EXEMPT: Record<string, string> = {
  // 工具行/导出：QRT 用 export-* 五个独立键 + 导出菜单里的 PNG 项；RT 用「默认格式」切换
  'bar-snapshot': 'QRT 走「导出 ⋯」菜单里的 PNG 项',
  'export-view': 'QRT 导出组是 export-csv/xlsx/json/md/ndjson，逐格式直出',
  'fmt-csv': 'QRT 无「默认格式」概念',
  'fmt-xlsx': '同上（QRT 逐格式直出）',
  'fmt-json': '同上（QRT 逐格式直出）',
  'fmt-md': '同上（QRT 逐格式直出）',
  'fmt-ndjson': '同上（QRT 逐格式直出）',
  // 查询级动作：QRT 的对应键是 use-as-cond / sort-by / filter-by-val
  'filter-hit': 'QRT 拆成 use-as-cond（改 SQL 重查）+ filter-by-val（只筛当前结果）',
  // 文档对比：QRT 的 rows 通道没有文档对象
  'doc-diff': 'QRT 是 cols×rows 矩阵，无 _source 文档，比对不适用',
  // DSL 生成：RT 拆三项，QRT 用一个 dsl-copy 按值/类型自动路由
  'dsl-ids': 'QRT 的 dsl-copy 在 _id 列自动生成 ids 形态',
  'dsl-match': 'QRT 的 dsl-copy 按 text 类型自动路由 match',
  'dsl-term': 'QRT 的 dsl-copy 自动路由 term',
};

describe('1205 两内核右键互查', () => {
  it('RT 有而 QRT 没有的菜单项，必须全部在豁免清单里', () => {
    const onlyRt = [...rtKeys].filter(k => !qrtKeys.has(k));
    const unexplained = onlyRt.filter(k => !(k in EXEMPT));
    expect(unexplained, `这些项在 QRT 缺失且没有说明理由：${unexplained.join(', ')}`).toEqual([]);
  });

  it('本批补的两项确实在 QRT 里（不是靠豁免糊过去）', () => {
    expect(qrtKeys.has('copy-id'), '复制 _id 必须真的在 QRT').toBe(true);
    expect(qrtKeys.has('copy-sel-terms'), '勾选行复制为查询必须真的在 QRT').toBe(true);
    /* 这两项必须已经**不在**差集里（否则上面那条靠豁免也能绿） */
    const onlyRt = [...rtKeys].filter(k => !qrtKeys.has(k));
    expect(onlyRt).not.toContain('copy-id');
    expect(onlyRt).not.toContain('copy-sel-terms');
  });

  it('copy-id 仍受 _id 在场门控（SQL 结果集没有 _id 时不出）', () => {
    expect(qrt).toMatch(/\.\.\.\(rowId\(m\.ri\)\s*\n?\s*\? \[\{ key: 'copy-id'/);
  });

  it('copy-sel-terms 仍受合法列名门控（表达式别名不生成查询）', () => {
    const seg = qrt.slice(qrt.indexOf("key: 'copy-sel-terms'") - 400, qrt.indexOf("key: 'copy-sel-terms'"));
    expect(seg, '必须带列名合法性闸').toMatch(/\^\[A-Za-z_\]/);
  });

  it('豁免清单不得膨胀到掩盖真实缺口（上限 12 条，且每条都有理由）', () => {
    const n = Object.keys(EXEMPT).length;
    expect(n, `豁免条目 ${n} 条，超上限说明在拿理由糊差集`).toBeLessThanOrEqual(12);
    for (const [k, why] of Object.entries(EXEMPT)) {
      expect(why.trim().length, `豁免 ${k} 必须写理由`).toBeGreaterThan(4);
    }
  });
});
