/**
 * 八百零四批件2：查询工作台排序下推真实查询（用户八令实报 20261008 16:13「这些排序能不能
 * 真实查询语句命中，而不是可视窗口呢」+截图红箭头指 DSL "sort": []——QRT/RT 表头排序
 * 此前走 useSortChain 本地链只排当前页可视行=假排序；770 条/39 页场景下点表头仅重排
 * 可视 20 行，与用户预期（服务端真排序）不符）。
 *
 * 改法=接线 535/543 批 remote 排序契约（IndexHub docs 表同范式）：RT 挂 remote-sort+
 * sort-change→writeSortToDsl 回写 DSL sort 子句（「真实查询语句命中」=编辑器可见）+
 * 回页 1+execQuery 重查；syncSort 回填箭头；execQuery 反向同步（手改 DSL sort→箭头随真实
 * 语句）；text 列写 .keyword 子字段；切索引清态。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件2：RT 挂接 remote 排序契约（535/543 范式平移）', () => {
  it('A1 RT 挂接三件（remote-sort + sort-change + sync-sort，源码锁）', () => {
    const s = strip(v);
    expect(s).toMatch(/<ResultTable[^]{0,600}remote-sort/s);
    expect(s).toMatch(/@sort-change="onHitsSortChange"/);
    expect(s).toMatch(/:sync-sort="hitsSortSync"/);
  });

  it('A2 hitsSort 权威态+onHitsSortChange 链（写 sort→回页 1→重查，源码锁）', () => {
    const s = strip(v);
    expect(s).toContain("const hitsSort = ref<{ f: string; d: 'asc' | 'desc' } | null>(null)");
    expect(s).toContain('function onHitsSortChange');
    expect(s).toMatch(/function onHitsSortChange\([^)]*\)\s*\{[^}]*hitsSort\.value = s;[^}]*writeSortToDsl\(s\)[^}]*page\.value = 1;[^}]*execQuery\(\)/s);
  });

  it('A3 writeSortToDsl 写 sort 子句（unmapped_type 兜底=IH buildDocsDslWithSort 同构，源码锁）', () => {
    const s = strip(v);
    expect(s).toContain('function writeSortToDsl');
    expect(s).toMatch(/obj\.sort = \[\{ \[f\]: \{ order: s\.d, unmapped_type: 'long' \} \}\]/);
  });

  it('A4 text 列 .keyword 子字段改写（fielddata 400 预防，源码锁）', () => {
    const s = strip(v);
    expect(s).toMatch(/mappingFieldTypes\.value\[s\.f\] === 'text' \? s\.f \+ '\.keyword' : s\.f/);
  });

  it('A5 null 态删 sort 键（三态循环终点=回宿主原始序，源码锁）', () => {
    const s = strip(v);
    expect(s).toMatch(/if \(!s\) delete obj\.sort;/);
  });

  it('A6 execQuery 反向同步（DSL 真实 sort 态→箭头；.keyword 剥壳回列名，源码锁）', () => {
    const s = strip(v);
    expect(s).toMatch(/Array\.isArray\(obj\.sort\) && obj\.sort\[0\]/);
    expect(s).toContain(".endsWith('.keyword')");
    expect(s).toMatch(/hitsSort\.value = \{ f: bare, d \}/);
  });

  it('A7 syncSort 方向归一（1/-1 契约=535 公共契约，源码锁）', () => {
    const s = strip(v);
    expect(s).toMatch(/hitsSort\.value\.d === 'asc' \? 1 : -1/);
  });

  it('A8 切索引清排序态（watch pickedIdx 内，源码锁）', () => {
    const s = strip(v);
    expect(s).toMatch(/watch\(\(\) => store\.pickedIdx[^]{0,900}hitsSort\.value = null;/s);
  });
});
