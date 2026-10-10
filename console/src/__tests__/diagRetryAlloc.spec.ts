/**
 *  第：DiagView 分配诊断现场一键重试（retry_failed）——
 * 此前 CmdPalette 有该运维命令但诊断现场（看到未分配 reason 的地方）没有，
 * 看到→处置之间断一层。askConfirm warn 门控（集群级分配动作）。
 * 演进：走 /cluster/raw=ADMIN 档，按钮对非 ADMIN 不渲染（canAdmin 门控）。
 * 锁定（静态）：按钮接线（canAdmin+unassigned 双门控）+ reroute 路径 + askConfirm 门控顺序。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('Diag 分配重试（）', () => {
  it('按钮接线（canAdmin+unassigned 双门控）+ reroute 路径', () => {
    expect(src).toMatch(/v-if="canAdmin && allocation\.current_state === 'unassigned'"/);
    expect(src).toMatch(/@click="retryFailedAlloc"/);
    expect(src).toMatch(/api\.raw\('POST', '\/_cluster\/reroute\?retry_failed=true', '\{\}'\)/);
    expect(src).toContain("const canAdmin = computed(() => auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', store.target)); /* reroute 走 raw，管理域按 rest 页勾选 */");
  });

  it('askConfirm warn 门控在提交之前', () => {
    expect(src).toMatch(/title: '重试失败分片分配'/);
    expect(src).toMatch(/level: 'warn'/);
    const gate = src.indexOf('if (!await askConfirm({');
    const submit = src.indexOf("api.raw('POST', '/_cluster/reroute?retry_failed=true'");
    expect(gate).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(gate);
  });
});
