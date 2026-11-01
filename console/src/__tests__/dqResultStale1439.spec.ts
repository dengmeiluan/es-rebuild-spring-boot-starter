/**
 * 1439：结果表的「已过期」标记（共享判据 + 三处宿主接线）。
 *
 * 实测（真实浏览器）：执行完后在编辑器里加一个空格，结果表仍是上一次的、界面上
 * 没有任何提示；SQL 控制台早有 resultStale「已过期」芯片，各查询页口径不一致。
 *
 * 判据（useResultStale）：有结果 + 记过一次实际执行输入 + 当前输入与那次不同。
 * 两条时序约定同样重要：
 *  - 快照取「发送时」：await 期间继续改稿，结果回来后仍必须标过期；
 *  - 记账在「成功时」：执行失败/取消时旧结果还是旧结果，芯片不能被提前灭掉。
 */
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useResultStale, staleOf } from '../composables/useResultStale';

const DQ = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf8');
const LC = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf8');
const IH = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf8');

describe('1439 结果过期判据（useResultStale）', () => {
  it('真相表：从未执行 / 无结果 / 与执行版一致 / 改稿未执行', () => {
    expect(staleOf('a', null, true)).toBe(false);
    expect(staleOf('a', 'a', false)).toBe(false);
    expect(staleOf('a', 'a', true)).toBe(false);
    expect(staleOf('b', 'a', true)).toBe(true);
  });

  it('空串签名（索引工作区「空词=浏览全部」）也能记账', () => {
    const sig = ref('');
    const has = ref(false);
    const { stale, markRun } = useResultStale(() => sig.value, () => has.value);
    expect(stale.value).toBe(false);
    has.value = true;
    markRun();
    expect(stale.value).toBe(false);
    sig.value = 'a';
    expect(stale.value).toBe(true);
  });

  it('负控：用空串判「从未执行」的朴素写法会漏报空签名场景', () => {
    const naive = (cur: string, last: string | null, has: boolean) => has && !!last && cur !== last;
    expect(naive('a', '', true)).toBe(false);
    expect(staleOf('a', '', true)).toBe(true);
  });

  it('发送时快照 + 成功时记账：失败不灭芯片，在途改稿仍标过期', () => {
    const sig = ref('q1');
    const { stale, markRun } = useResultStale(() => sig.value, () => true);
    markRun();
    expect(stale.value).toBe(false);
    sig.value = 'q2';
    const sent = sig.value; /* 第二次发送时的快照 */
    expect(stale.value).toBe(true); /* 发送中，结果还是 q1 */
    expect(stale.value).toBe(true); /* 失败：没有 markRun → 仍过期 */
    sig.value = 'q3';
    markRun(sent); /* 成功回来：记的是发送时的 q2，不是现在的 q3 */
    expect(stale.value).toBe(true);
    sig.value = 'q2';
    expect(stale.value).toBe(false);
  });
});

function dqProblems(src: string): string[] {
  const out: string[] = [];
  if (!src.includes("useResultStale(() => dsl.value, () => !!resp.value)")) out.push('DQ 判据未接共享件');
  if (!/markDslRun\(dslSnapshot\);\s*\n\s*\} catch \(e: any\) \{/.test(src)) {
    out.push('DQ 未在成功尾记账（失败/取消时芯片会被提前灭掉）');
  }
  if (!src.includes('class="pill warn stale-chip"') || !src.includes('结果已过期')) out.push('DQ 缺可见芯片');
  return out;
}

function lcProblems(src: string): string[] {
  const out: string[] = [];
  if (!src.includes('useResultStale(() => runSig.value, () => searched.value)')) out.push('Lucene 判据未接共享件');
  const norm = src.indexOf('sortField.value = res.field;');
  const snap = src.indexOf('const sigAtSend = runSig.value;');
  const send = src.indexOf('await api.luceneSearch');
  if (!(norm >= 0 && snap > norm && send > snap)) {
    out.push('Lucene 快照必须在排序归一后、发请求前取');
  }
  if (!/searched\.value = true;\s*\n\s*markRunSig\(sigAtSend\);/.test(src)) out.push('Lucene 未在成功路径记账');
  if (!src.includes('class="pill warn stale-chip"') || !src.includes('结果已过期')) out.push('Lucene 缺可见芯片');
  /* 芯片只对「同索引的上一次结果」有意义：切索引必须清结果，在途响应不得落新索引现场 */
  if (!/watch\(index, \(n, o\) => \{\s*\n\s*if \(n === o\) return;[\s\S]{0,500}searched\.value = false;/.test(src)) out.push('Lucene 切索引未清旧索引结果');
  if (!/if \(index\.value\.trim\(\) !== idxAtSend\) return;/.test(src)) out.push('Lucene 在途切索引未丢弃旧响应');
  return out;
}

function ihProblems(src: string): string[] {
  const out: string[] = [];
  if (!src.includes('useResultStale(() => docsQ.value, () => docsRan.value)')) out.push('索引工作区判据未接共享件');
  if (!/const sigAtSend = docsQ\.value;/.test(src)) out.push('索引工作区未在发送时取快照');
  if (!/docsRan\.value = true;\s*\n\s*markDocsRun\(sigAtSend\);/.test(src)) out.push('索引工作区未在成功路径记账');
  /* 查询 tab 的 DSL 编辑器与 docs 检索是同页两张结果表，判据必须各接一份 */
  if (!src.includes('useResultStale(() => dsl.value, () => !!qryResp.value)')) out.push('索引工作区查询 tab 判据未接共享件');
  if (!/const qrySigAtSend = dsl\.value;/.test(src)) out.push('索引工作区查询 tab 未在发送时取快照');
  if (!/markQryRun\(qrySigAtSend\);/.test(src)) out.push('索引工作区查询 tab 未在成功路径记账');
  if ((src.match(/class="pill warn stale-chip"/g) || []).length < 2 || !src.includes('结果已过期')) {
    out.push('索引工作区缺可见芯片（docs/query 两处）');
  }
  return out;
}

describe('1439 三处宿主接线', () => {
  it('DSL 工作台 / Lucene / 索引工作区 全部齐备', () => {
    expect(dqProblems(DQ)).toEqual([]);
    expect(lcProblems(LC)).toEqual([]);
    expect(ihProblems(IH)).toEqual([]);
  });

  it('负控：删掉各宿主成功记账 → 判据点名', () => {
    const dq = DQ.replace('    markDslRun(dslSnapshot);\n', '');
    const lc = LC.replace('    markRunSig(sigAtSend);\n', '');
    const ih = IH.replace('    markDocsRun(sigAtSend);\n', '');
    expect(dq).not.toBe(DQ);
    expect(lc).not.toBe(LC);
    expect(ih).not.toBe(IH);
    expect(dqProblems(dq)).not.toEqual([]);
    expect(lcProblems(lc)).not.toEqual([]);
    expect(ihProblems(ih)).not.toEqual([]);
  });

  it('负控：索引工作区查询 tab 去掉记账/芯片 → 判据点名', () => {
    const noMark = IH.replace('    markQryRun(qrySigAtSend);\n', '');
    const oneChip = IH.replace(
      '                  <!-- 1439：改了 DSL 没重新执行时结果还是上一次的——docs/Lucene/工作台同款芯片 -->\n',
      '',
    ).replace(
      '                  <span v-if="qryStale" class="pill warn stale-chip" role="status"\n                    title="当前 DSL 已修改但还没执行——下方结果仍来自上一次执行（Ctrl+Enter 或点「执行查询」更新）">结果已过期</span>\n',
      '',
    );
    expect(noMark).not.toBe(IH);
    expect(oneChip).not.toBe(IH);
    expect(ihProblems(noMark)).not.toEqual([]);
    expect(ihProblems(oneChip)).not.toEqual([]);
  });

  it('负控：Lucene 切索引不清结果 / 去掉在途索引守卫 → 判据点名', () => {
    const noClear = LC.replace('  searched.value = false;\n', '');
    const noGuard = LC.replace('    if (index.value.trim() !== idxAtSend) return;\n', '');
    expect(noClear).not.toBe(LC);
    expect(noGuard).not.toBe(LC);
    expect(lcProblems(noClear)).not.toEqual([]);
    expect(lcProblems(noGuard)).not.toEqual([]);
  });

  it('负控：DSL 记账挪到发送前（失败也会灭芯片）→ 判据点名', () => {
    const broken = DQ.replace('  const dslSnapshot = dsl.value;', '  const dslSnapshot = dsl.value;\n  markDslRun(dslSnapshot);')
      .replace('    markDslRun(dslSnapshot);\n', '');
    expect(broken).not.toBe(DQ);
    expect(dqProblems(broken)).not.toEqual([]);
  });
});
