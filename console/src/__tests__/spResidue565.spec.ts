/* 五百六十五批轨5件④【--sp 精确等值收档】看守。
 *
 * 间距阶梯（theme.css:102-103：--sp-0:2px / --sp-1:4px）全站轮转收编的两处精确等值残面：
 *  · OverviewView .ov-mh-auto gap: 4px → var(--sp-1)；
 *  · SearchTemplatesView .st-param-warns gap: 2px → var(--sp-0)。
 * 只收精确等值：同文件刻意值（14/26/9/5/30px 等奇数微调/形状系）按 theme.css 527 批立法
 * 豁免记档不收——守卫断言钉住两处判例值，防后续"顺手"过收引发密度漂移。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('五百六十五批件④：--sp 精确等值收编', () => {
  it('OverviewView .ov-mh-auto gap 4px → var(--sp-1)（theme.css:102 同值档）', () => {
    const css = src('views/OverviewView.vue');
    expect(css).toMatch(/\.ov-mh-auto\s*\{[^}]*gap:\s*var\(--sp-1\)/);
    expect(css, '裸 4px gap 不得回潮').not.toMatch(/\.ov-mh-auto\s*\{[^}]*gap:\s*4px/);
  });

  it('SearchTemplatesView .st-param-warns gap 2px → var(--sp-0)（theme.css:103 同值档）', () => {
    const css = src('views/SearchTemplatesView.vue');
    expect(css).toMatch(/\.st-param-warns\s*\{[^}]*gap:\s*var\(--sp-0\)/);
    expect(css, '裸 2px gap 不得回潮').not.toMatch(/\.st-param-warns\s*\{[^}]*gap:\s*2px/);
  });

  it('刻意值不收（527 批豁免立法）：邻域判例值原样保留，无过收', () => {
    expect(src('views/OverviewView.vue')).toContain('padding: 14px var(--sp-4)'); /* .ov-cell 刻意值 */
    expect(src('views/SearchTemplatesView.vue')).toMatch(/\.st-hint\s*\{[^}]*gap:\s*5px/); /* .st-hint 刻意值 */
  });
});
