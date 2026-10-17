import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 文档编辑直达能力矩阵（934）：两个工作台（查询/索引）的 JSON/Tree 档导航条全接线，
 「编辑文档」钮只在宿主真接线 edit-doc-at 时渲染（editable 开关）——无编辑链的宿主
 不渲染点了没反应的按钮；tree 行集（_id 与源字段平铺）重组回 SearchHit 时把行首 _id
 剥出 _source（元数据字段写回文档体会被 ES 拒收），保存链不受影响。 */

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const ah = read('../components/AltHitsViews.vue');
const dq = read('../views/DslQueryView.vue');
const ih = read('../views/IndexHubView.vue');
const rt = read('../components/ResultTable.vue');

describe('934 文档编辑直达矩阵（源码锁）', () => {
  it('AltHitsViews：编辑文档钮受 editable 开关（缺省关）', () => {
    expect(ah).toContain('editable?: boolean;');
    expect(ah).toMatch(/<button v-if="editable"[^>]*@click="emit\('edit-doc-at', docCursor\)">编辑文档<\/button>/);
  });

  it('DslQueryView：tree 档 editable 直达 + 重组剥行首 _id', () => {
    expect(dq).toContain('editable @open-doc-at="i => openTreeDocAt(i)" @edit-doc-at="i => openTreeDocAt(i, true)" />');
    expect(dq).toContain('<AltHitsViews view="tree"');
    expect(dq).toMatch(/function openTreeDocAt\(i: number, goEdit = false\)/);
    expect(dq, '行首 _id 剥出 _source（元数据字段不可写回文档体）').toMatch(/const \{ _id, \.\.\.src \} = row;/);
    expect(dq).toContain("openDoc({ _id: String(_id ?? ''), _index: '', score: 1, _score: 1, _source: src } as SearchHit, goEdit)");
  });

  it('IndexHubView：openDoc goEdit 签名 + 四档 edit-doc-at 全接线 + tree editable 直达两处', () => {
    expect(ih).toMatch(/function openDoc\(hit: SearchHit, goEdit = false\)/);
    expect(ih).toContain('docEditMode.value = goEdit;');
    expect(ih).toMatch(/function openAltDocAt\(rows: Array<Record<string, any>>, i: number, goEdit = false\)/);
    expect(ih, '行首 _id 剥出 _source').toMatch(/const \{ _id, \.\.\.src \} = row;/);
    expect(ih.match(/@edit-doc-at=/g)?.length ?? 0, 'docs/qry 的 json+tree 四档接线数').toBe(4);
    expect(ih.match(/editable @open-doc-at="i => openAltDocAt\(/g)?.length ?? 0, 'tree editable 直达两处').toBe(2);
  });

  it('ResultTable 内建 alt 档仅打开链（无编辑链宿主不渲染编辑钮）', () => {
    expect(rt).not.toContain('editable');
    expect(rt, '内建 alt 档仅打开链').toMatch(/@open-doc-at="i => \{ const h = props\.hits\[i\]; if \(h\) emit\('open-doc', h\) \}"/);
  });
});
