/**
 * R130 一百九十六批：RT 大结果集渲染保护（G 组评估落地——截断+导出引导）。
 * 锁定：超 MAX_RENDER(2000) 只渲染前 N 行；信息行与表格尾提示截断；
 * 排序/勾选/导出仍作用于全量（截断不影响 getExportRows 全量口径）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import ResultTable from '../components/ResultTable.vue';
const apps = [];
const host = document.createElement('div');
document.body.appendChild(host);
async function mountTbl(props) {
    const app = createApp({ setup: () => () => h(ResultTable, props) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 10; i++) {
        await nextTick();
        await Promise.resolve();
    }
}
beforeEach(() => {
    localStorage.clear();
    apps.forEach(a => { try {
        a.unmount();
    }
    catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
});
const mkHits = (n) => Array.from({ length: n }, (_, i) => ({ _id: 'id' + i, _source: { v: i } }));
describe('RT 大结果集渲染保护（一百九十六批）', () => {
    it('超 2000 行只渲染前 2000；信息行与表格尾提示截断', async () => {
        await mountTbl({ hits: mkHits(2200), total: 2200, index: 'big1' });
        /* 二百一十七批 test-infra：固定 10 tick 等 2200 行挂载在全量并发负载下可能未 settle
           （crossNavLinks 超时基建同类负载敏感，非产品回归）——断言改 vi.waitFor 轮询至 DOM 稳定 */
        await vi.waitFor(() => {
            expect(host.querySelectorAll('tbody tr').length).toBe(2001); // 2000 数据行+1 提示行
            expect(host.textContent).toContain('已渲染前 2000 行');
            expect(host.textContent).toContain('完整数据请用「导出」');
        }, { timeout: 30000, interval: 100 });
    }, 40000);
    it('2000 行内不触发截断提示（正常展示）', async () => {
        await mountTbl({ hits: mkHits(300), total: 300, index: 'big2' });
        expect(host.querySelectorAll('tbody tr').length).toBe(300);
        expect(host.textContent).not.toContain('已渲染前');
    });
    it('截断不影响导出全量（getExportRows 仍返回全量排序结果）', async () => {
        const hits = mkHits(2200);
        const { exposed } = await (async () => {
            let ex = null;
            const app = createApp({ setup: () => () => h(ResultTable, { hits, total: 2200, index: 'big3', ref: (el) => { ex = el; } }) });
            app.use(createPinia());
            app.mount(host);
            apps.push(app);
            for (let i = 0; i < 10; i++) {
                await nextTick();
                await Promise.resolve();
            }
            return { exposed: () => ex };
        })();
        await vi.waitFor(() => { expect(exposed().getExportRows().length).toBe(2200); }, { timeout: 30000, interval: 100 });
    }, 40000);
});
