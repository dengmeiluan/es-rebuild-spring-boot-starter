import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserFetch } from '../platform/browserApi';

const base = 'http://es.local:9200';

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('browserApi bridge', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('esquerystudio.browser.profile', JSON.stringify({ url: base }));
    vi.restoreAllMocks();
  });

  it('cluster indices 过滤系统索引并按名排序', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([
      { index: 'b' }, { index: '.security' }, { index: 'a' },
    ]));
    const r = await browserFetch('/internal/es/index/cluster/indices');
    expect(await r.json()).toEqual([{ index: 'a' }, { index: 'b' }]);
    expect(String(spy.mock.calls[0][0])).toContain('/_cat/indices');
  });

  it('tasks 平铺 nodes/tasks 并换算 tookMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      nodes: { n1: { name: 'node-1', tasks: { 'n1:1': { action: 'x', running_time_in_nanos: 5_000_000, cancellable: true } } } },
    }));
    const r = await browserFetch('/internal/es/index/cluster/tasks?detailed=true');
    expect(await r.json()).toEqual([expect.objectContaining({ taskId: 'n1:1', node: 'node-1', tookMs: 5, cancellable: true })]);
  });

  it('templates 合并 index/component 两棵清单', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ index_templates: [{ name: 'i' }] }))
      .mockResolvedValueOnce(json({ component_templates: [{ name: 'c' }] }));
    const r = await browserFetch('/internal/es/index/cluster/templates');
    expect(await r.json()).toMatchObject({ index_templates: [{ name: 'i' }], component_templates: [{ name: 'c' }] });
  });

  it('文档写入使用 PUT _doc，删除使用 DELETE', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ result: 'updated' }));
    await browserFetch('/internal/es/index/cluster/doc?index=logs&id=1', { method: 'POST', body: '{"a":1}' });
    expect(spy.mock.calls[0][1]?.method).toBe('PUT');
    await browserFetch('/internal/es/index/cluster/delete-by-id?index=logs&id=1', { method: 'POST' });
    expect(spy.mock.calls[1][1]?.method).toBe('DELETE');
  });

  it('SQL cursor 从查询串组装续页 body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ rows: [] }));
    await browserFetch('/internal/es/index/cluster/sql/cursor?cursor=abc&timeZone=Asia%2FShanghai', { method: 'POST' });
    const init = spy.mock.calls[0][1]!;
    expect(String(init.body)).toContain('"cursor":"abc"');
    expect(String(init.body)).toContain('"time_zone":"Asia/Shanghai"');
  });

  it('配置校验：未知字段类型报错，dry-run 建临时索引后清理', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ acknowledged: true }));
    const bad = await browserFetch('/internal/es/index/config-lab/validate', {
      method: 'POST', body: JSON.stringify({ mapping: JSON.stringify({ properties: { a: { type: 'nope' } } }), dryRun: false }),
    });
    expect((await bad.json()).issues.some((i: any) => i.code === 'UNKNOWN_FIELD_TYPE')).toBe(true);

    const ok = await browserFetch('/internal/es/index/config-lab/validate', {
      method: 'POST', body: JSON.stringify({ settings: '{"refresh_interval":"1s"}', mapping: '{"properties":{"a":{"type":"keyword"}}}', dryRun: true }),
    });
    const report = await ok.json();
    expect(report).toMatchObject({ valid: true, dryRunExecuted: true, dryRunPassed: true });
    const methods = spy.mock.calls.map(c => c[1]?.method);
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });
});
