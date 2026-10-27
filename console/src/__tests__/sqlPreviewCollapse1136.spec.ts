import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1136：DBX 式结果优先——DSL 预览自动生成但默认折叠，结果网格吃满；
 * 手动「转 DSL」才展开；折叠态保留「到 DSL 页/复制」等动作。 */
describe('1136 DSL 预览默认折叠（结果优先）', () => {
  it('折叠态默认 + 手动 translate 展开 + 关闭复位', () => {
    expect(view).toContain('const previewOpen = ref(false);');
    expect(view).toContain('previewOpen.value = true;');
    expect(view).toContain('previewOpen = false');
  });

  it('预览头常驻：展开/收起、到 DSL、复制、关闭；正文 v-show 折叠', () => {
    expect(view).toContain('data-test="sql-preview-toggle"');
    expect(view).toContain(':aria-expanded="previewOpen"');
    expect(view).toContain('aria-controls="sq-dsl-preview"');
    expect(view).toContain('v-show="previewOpen" id="sq-dsl-preview"');
    expect(view).toContain("{{ previewOpen ? '收起' : '展开' }}");
    /* 高度档只在展开时出现，折叠态头部保持 3 个动作 */
    expect(view).toContain('v-if="previewOpen" class="btn ghost xs" data-sq-code-h');
  });
});
