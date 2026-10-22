/**
 * 986：DevTools 非 ADMIN 写范围预暴露（与后端 raw 数据面白名单同口径）。
 * 只读请求始终可执行；系统管理写/别名/快照/模板/脚本必须在客户端就显示为不可执行。
 */
import { describe, it, expect } from 'vitest';
import { nonAdminDataPlaneWriteAllowed as ok } from '../utils/devtoolsScope';

describe('DevTools 非 ADMIN 数据面白名单', () => {
  it('检索/文档/批量/SQL 数据面写放行', () => {
    expect(ok('POST', '/_bulk')).toBe(true);
    expect(ok('POST', '/_msearch')).toBe(true);
    expect(ok('POST', '/_mget')).toBe(true);
    expect(ok('POST', '/_sql')).toBe(true);
    expect(ok('POST', '/_sql/close')).toBe(true);
    expect(ok('POST', '/logs/_doc/1')).toBe(true);
    expect(ok('PUT', '/logs/_doc/1')).toBe(true);
    expect(ok('POST', '/logs/_update/1')).toBe(true);
    expect(ok('POST', '/logs/_delete_by_query')).toBe(true);
    expect(ok('GET', '/_cluster/settings')).toBe(true); /* 读仍可看，写门不在客户端拦读 */
    expect(ok('HEAD', '/_cat/indices')).toBe(true);
  });

  it('系统管理/别名/快照/模板/脚本等写拒绝', () => {
    expect(ok('PUT', '/_cluster/settings')).toBe(false);
    expect(ok('POST', '/_aliases')).toBe(false);
    expect(ok('POST', '/_snapshot/r/s/_restore')).toBe(false);
    expect(ok('PUT', '/_index_template/t')).toBe(false);
    expect(ok('PUT', '/_scripts/x')).toBe(false);
    expect(ok('POST', '/_security/user/x')).toBe(false);
    expect(ok('POST', '/_reindex')).toBe(false);
    expect(ok('POST', '/logs/_mapping')).toBe(false);
    expect(ok('POST', '/logs/_alias/a')).toBe(false);
    expect(ok('DELETE', '/logs')).toBe(false);
    expect(ok('POST', '/logs/_close')).toBe(false);
    expect(ok('POST', '/_nodes/reload_secure_settings')).toBe(false);
  });
});
