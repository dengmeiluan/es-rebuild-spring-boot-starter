/**
 * 1439：查询工作台结果表的「已过期」标记。
 *
 * 实测（真实浏览器）：执行完后在编辑器里加一个空格，结果表仍是上一次的、界面上
 * 没有任何提示；SQL 控制台早有 resultStale「已过期」芯片，两处口径不一致。
 *
 * 判据：芯片出现的条件必须是「有结果 + 上次发出版本已知 + 当前稿不同于上次发出」，
 * 且 execQuery 在发送时记录那一版——少任何一环都会变成常亮或恒不亮。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DQ = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf8');

function problems(src: string): string[] {
  const out: string[] = [];
  if (!src.includes("const lastRunDsl = ref('');")) out.push('缺 lastRunDsl 状态');
  if (!/const resultStale = computed\(\(\) => !!resp\.value && !!lastRunDsl\.value && dsl\.value !== lastRunDsl\.value\);/.test(src)) {
    out.push('resultStale 判据不完整（必须有结果 + 已记录上次版本 + 当前稿不同）');
  }
  if (!/const dslSnapshot = dsl\.value;\s*\n\s*\/\*[^\n]*\*\/\s*\n\s*lastRunDsl\.value = dslSnapshot;/.test(src)) {
    out.push('发送时未记录 lastRunDsl');
  }
  if (!src.includes('class="dq-stale-chip"') || !src.includes('结果已过期')) out.push('缺可见芯片');
  if (!/title="当前 DSL 已修改但还没执行——下方结果仍来自上一次执行（点「执行」更新）"/.test(src)) out.push('芯片缺解释性 title');
  return out;
}

describe('1439 结果过期标记', () => {
  it('状态、判据、记录与渲染四件齐备', () => {
    expect(problems(DQ)).toEqual([]);
  });

  it('负控：删掉「发送时记录」→ 判据点名', () => {
    const broken = DQ.replace('lastRunDsl.value = dslSnapshot;', '');
    expect(broken).not.toBe(DQ);
    expect(problems(broken)).not.toEqual([]);
  });

  it('负控：判据退化成只看「有结果」→ 判据点名', () => {
    const broken = DQ.replace(
      'const resultStale = computed(() => !!resp.value && !!lastRunDsl.value && dsl.value !== lastRunDsl.value);',
      'const resultStale = computed(() => !!resp.value);',
    );
    expect(broken).not.toBe(DQ);
    expect(problems(broken)).not.toEqual([]);
  });
});
