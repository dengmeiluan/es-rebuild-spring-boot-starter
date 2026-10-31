/**
 * 一千三百六十三批：SQL 结果表没有多选通道（查询/索引工作台有）。
 *
 * 用户反复问「为什么三个表格能力没有完全共享」。这一批用**渲染出来的首行列集**取证：
 *
 *   RT （DSL 工作台） 5 列：[勾选] | # | title | status | 操作
 *   QRT（SQL 控制台） 2 列：# | title          ← 缺多选
 *
 * 查因：QRT 内核**本来就支持** `selectable`（首列勾选 / 表头全选 / tr 挂 qrt-sel /
 * emit `selection-change`，全是现成的），只是 SQL 宿主没开启。又一处「能力有、没接线」。
 *
 * 关键取舍：**开了勾选就必须给出「选中能干什么」**——否则勾选框是死控件，比没有更糟。
 * 所以同时接上「复制选中 N 行（TSV，含列名表头）」，且只在有选中时出现，静息态零占位
 * （1353 刚刚把工具行从 3 行压到 2 行，不能又塞回常驻钮）。
 *
 * 真机验证（1440×900，执行一条 SELECT）：
 *   修复后首行 `[chk] | # | title`；未勾选时「复制选中」钮不存在；
 *   勾 1 行 → 钮出现且文案「复制选中 1」，`tr.qrt-sel` 计数 = 1。
 *
 * 本 spec 锁：
 *  ① SQL 宿主传了 `selectable` 并接住 `selection-change`；
 *  ② 复制钮是**条件渲染**（无选中不占位），不是常驻；
 *  ③ 复制内容含列名表头（TSV）——贴进表格软件第一行就是字段名；
 *  ④ 负控：把 `selectable` 去掉 → ① 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1363 SQL 结果表补齐多选通道', () => {
  it('① 宿主传 selectable 并接住 selection-change', () => {
    expect(SQL, '必须开启多选').toMatch(/^\s+selectable$/m);
    expect(SQL).toContain('@selection-change="onSelChange"');
    expect(SQL).toContain('function onSelChange(rows: unknown[])');
    /* 内核通道本身必须是现成的（不是本批新造的） */
    expect(QRT).toContain("(e: 'selection-change', rows: unknown[]): void");
  });

  it('② 复制钮条件渲染（无选中不占位）', () => {
    expect(SQL, '按钮必须 v-if 绑定选中数').toMatch(/<button v-if="selRows\.length"[^>]*data-test="sq-copy-sel"/);
    /* 菜单里那条同样条件 */
    expect(SQL).toMatch(/v-if="selRows\.length"[^>]*data-test="sq-copy-sel-menu"/);
  });

  it('③ 复制内容含列名表头（TSV）', () => {
    expect(SQL, '表头用当前列名').toMatch(/const head = colNames\.value\.join\(SEP\);/);
    expect(SQL, '行按当前矩阵行拼').toMatch(/selRows\.value\.map\(r => \(r \|\| \[\]\)\.map\(v => String\(v \?\? ''\)\)\.join\(SEP\)\)/);
    expect(SQL, '表头与行要拼成一段').toMatch(/\[head, \.\.\.body\]\.join\('\\n'\)/);
    expect(SQL, '分隔符必须是制表符（TSV，不是逗号）').toMatch(/const SEP = '\\t';/);
  });

  it('④ 负控：去掉 selectable → ① 必须红', () => {
    const broken = SQL.replace(/^\s+selectable$/m, '');
    expect(broken, '负控必须真的改掉').not.toBe(SQL);
    expect(broken, '去掉后必须判不合格').not.toMatch(/^\s+selectable$/m);
  });
});
