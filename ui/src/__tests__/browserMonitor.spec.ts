import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbClear } from '../platform/browserStore';
import {
  sampleMonitorOnce, queryMonitorMetrics, queryMonitorHistory, queryTopIndexes,
  queryMonitorAlerts, monitorRingUsage, recordAudit, queryLocalAudit,
} from '../platform/browserMonitor';

function res(body: any) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

let healthStatus = 'green';
function mockEs() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const p = new URL(String(input)).pathname;
    if (p === '/') return res({ cluster_name: 'demo', version: { number: '7.10.2' } });
    if (p === '/_cluster/health') return res({ cluster_name: 'demo', status: healthStatus, number_of_nodes: 2, active_shards: 8, active_primary_shards: 4, unassigned_shards: 0, number_of_pending_tasks: 0 });
    if (p.startsWith('/_nodes/stats')) return res({ nodes: { n1: { name: 'node-1', jvm: { mem: { heap_used_percent: 40, heap_used_in_bytes: 104857600 } }, os: { cpu: { percent: 20, load_average: { '1m': 0.5 } }, mem: { used_percent: 50 } }, fs: { total: { total_in_bytes: 1000, available_in_bytes: 700 } }, thread_pool: { write: { active: 1, queue: 0, rejected: 0 }, search: { rejected: 0 } }, indices: { search: { query_total: 100 }, indexing: { index_total: 50 }, fielddata: { memory_size_in_bytes: 1048576 } } } } });
    if (p.startsWith('/_cat/indices')) return res([{ index: 'orders', health: 'green', 'docs.count': '10', 'store.size': '1mb', 'docs.deleted': '0' }]);
    if (p.startsWith('/_stats/')) return res({ indices: { orders: { total: { search: { query_total: 100 }, indexing: { index_total: 50 }, store: { size_in_bytes: 1000000 }, docs: { count: 10 } } } } });
    return res({});
  });
}

describe('browser monitor persistence', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('esquerystudio.browser.profile', JSON.stringify({ url: 'http://es.local:9200' }));
    healthStatus = 'green';
    vi.restoreAllMocks();
    await Promise.all(['monitor', 'alerts', 'audit', 'meta'].map(s => dbClear(s)));
  });

  it('采样后可从本机存储查询历史/曲线/告警与用量', async () => {
    mockEs();
    await sampleMonitorOnce();
    await sampleMonitorOnce();
    const metrics = await queryMonitorMetrics({ scope: 'cluster', size: 100 });
    expect(metrics.records.length).toBe(2);
    expect(metrics.records[0]).toMatchObject({ connName: 'demo', scope: 'cluster', status: 'green' });
    const hist = await queryMonitorHistory({ size: 10 });
    expect(hist.records.length).toBe(2);
    const top = await queryTopIndexes('demo', 5);
    expect(top.records[0]).toMatchObject({ index: 'orders' });
    const usage = await monitorRingUsage();
    expect(usage.totalBytes).toBeGreaterThan(0);
  });

  it('RED 状态落告警事件，恢复后再落 recovered', async () => {
    mockEs();
    healthStatus = 'red';
    await sampleMonitorOnce();
    let alerts = await queryMonitorAlerts(20);
    expect(alerts.records.some(a => a.metric === 'cluster.status' && a.level === 'CRIT')).toBe(true);
    healthStatus = 'green';
    await sampleMonitorOnce();
    alerts = await queryMonitorAlerts(20);
    expect(alerts.records.some(a => a.recovered)).toBe(true);
  });

  it('本机审计可按用户/URI 查询并生成 facets 数据', async () => {
    await recordAudit({ method: 'POST', path: '/cluster/query?index=orders', status: 200, ok: true, costMs: 12 });
    const rows = await queryLocalAudit({ username: 'browser', uriPrefix: '/cluster/query', size: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'POST', httpStatus: 200, connId: 'browser' });
  });
});
