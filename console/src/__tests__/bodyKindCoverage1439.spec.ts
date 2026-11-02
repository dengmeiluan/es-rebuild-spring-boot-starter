/**
 * 1439：请求体语义档「路由矩阵」总闸。
 *
 * 本会话按端点逐批补齐 bodyKindForPath 分档与 W6/lint 接线；这份矩阵把所有档位与
 * 代表路径钉在一起，并反向断言「档位全集 = 矩阵覆盖集」——新增档位必须同步矩阵，
 * 路径/方法守卫（_simulate、_update、_start、api_key/grant…）也不会被后续规则吞掉。
 */
import { describe, it, expect } from 'vitest';
import { bodyKindForPath, type BodyKind } from '../utils/dslCompletionContext';

type Row = [string, string, BodyKind];

const MATRIX: Row[] = [
  ['/idx/_search', 'POST', 'search'],
  ['/idx/_settings', 'PUT', 'settings'],
  ['/idx/_mapping', 'PUT', 'mapping'],
  ['/_index_template/logs', 'PUT', 'template'],
  ['/_component_template/base', 'PUT', 'template'],
  ['/idx/_doc/1', 'PUT', 'doc'],
  ['/idx/_create/1', 'PUT', 'doc'],
  ['/idx/_source', 'GET', 'doc'],
  ['/_analyze', 'POST', 'analyze'],
  ['/idx', 'PUT', 'index-body'],
  ['/idx/_alias/a1', 'PUT', 'alias-body'],
  ['/_aliases', 'POST', 'aliases-body'],
  ['/_reindex', 'POST', 'reindex-body'],
  ['/_sql', 'POST', 'sql-body'],
  ['/_sql/translate', 'POST', 'sql-body'],
  ['/idx/_update/1', 'POST', 'update-body'],
  ['/idx/_rollover', 'POST', 'rollover-body'],
  ['/idx/_delete_by_query', 'POST', 'dbq-body'],
  ['/idx/_update_by_query', 'POST', 'ubq-body'],
  ['/idx/_count', 'POST', 'query-body'],
  ['/idx/_explain/1', 'POST', 'query-body'],
  ['/idx/_validate/query', 'POST', 'query-body'],
  ['/idx/_search/template', 'POST', 'template-search-body'],
  ['/_render/template', 'POST', 'template-search-body'],
  ['/idx/_mget', 'POST', 'mget-body'],
  ['/_scripts/my-script', 'PUT', 'stored-script-body'],
  ['/_scripts/my-script/_execute', 'POST', 'script-execute-body'],
  ['/_search/scroll', 'POST', 'scroll-body'],
  ['/_clear_scroll', 'POST', 'clear-scroll-body'],
  ['/idx/_termvectors/1', 'POST', 'termvectors-body'],
  ['/idx/_mtermvectors', 'POST', 'mtermvectors-body'],
  ['/idx/_msearch', 'POST', 'msearch-body'],
  ['/idx/_msearch/template', 'POST', 'msearch-template-body'],
  ['/idx/_bulk', 'POST', 'bulk-body'],
  ['/idx/_field_caps', 'POST', 'field-caps-body'],
  ['/idx/_terms_enum', 'POST', 'terms-enum-body'],
  ['/idx/_rank_eval', 'POST', 'rank-eval-body'],
  ['/idx/_eql/search', 'POST', 'eql-body'],
  ['/_cluster/settings', 'PUT', 'cluster-settings-body'],
  ['/_cluster/reroute', 'POST', 'reroute-body'],
  ['/_cluster/allocation/explain', 'POST', 'allocation-explain-body'],
  ['/_snapshot/repo', 'PUT', 'snapshot-repo-body'],
  ['/_snapshot/repo/snap', 'PUT', 'snapshot-create-body'],
  ['/_snapshot/repo/snap/_restore', 'POST', 'snapshot-restore-body'],
  ['/_slm/policy/nightly', 'PUT', 'slm-policy-body'],
  ['/_ilm/policy/nightly', 'PUT', 'ilm-policy-body'],
  ['/_watcher/watch/error-rate', 'PUT', 'watch-body'],
  ['/_security/role/analyst', 'PUT', 'security-role-body'],
  ['/_security/user/jdoe', 'PUT', 'security-user-body'],
  ['/_security/role_mapping/devs', 'PUT', 'security-role-mapping-body'],
  ['/_security/api_key', 'POST', 'security-api-key-body'],
  ['/_ingest/pipeline/logs-v1', 'PUT', 'ingest-pipeline-body'],
  ['/_ingest/pipeline/_simulate', 'POST', 'ingest-simulate-body'],
  ['/_enrich/policy/users', 'PUT', 'enrich-policy-body'],
  ['/_transform/daily', 'PUT', 'transform-body'],
  ['/_rollup/job/daily', 'PUT', 'rollup-job-body'],
  ['/_ml/datafeeds/latency', 'PUT', 'ml-datafeed-body'],
  ['/_ml/anomaly_detectors/latency', 'PUT', 'ml-job-body'],
  ['/idx/_close', 'POST', 'none'],
  ['/idx/_forcemerge', 'POST', 'none'],
  ['/_scripts', 'GET', 'none'],
];

const ALL_KINDS: BodyKind[] = [
  'search', 'settings', 'mapping', 'template', 'doc', 'analyze', 'index-body', 'alias-body',
  'aliases-body', 'reindex-body', 'sql-body', 'update-body', 'rollover-body', 'dbq-body', 'ubq-body',
  'query-body', 'template-search-body', 'mget-body', 'stored-script-body', 'script-execute-body',
  'scroll-body', 'clear-scroll-body', 'termvectors-body', 'mtermvectors-body', 'msearch-body',
  'msearch-template-body', 'bulk-body', 'field-caps-body', 'terms-enum-body', 'rank-eval-body',
  'eql-body', 'cluster-settings-body', 'reroute-body', 'allocation-explain-body',
  'snapshot-repo-body', 'snapshot-create-body', 'snapshot-restore-body', 'slm-policy-body',
  'ilm-policy-body', 'watch-body', 'security-role-body', 'security-user-body',
  'security-role-mapping-body', 'security-api-key-body', 'ingest-pipeline-body',
  'ingest-simulate-body', 'enrich-policy-body', 'transform-body', 'rollup-job-body',
  'ml-datafeed-body', 'ml-job-body', 'none',
];

describe('1439 请求体档位路由矩阵', () => {
  it('每个代表路径都落到预期档位', () => {
    for (const [path, method, kind] of MATRIX) {
      expect(bodyKindForPath(path, method), `${method} ${path}`).toBe(kind);
    }
  });

  it('档位全集 = 矩阵覆盖集（新增档位必须同步矩阵）', () => {
    expect(new Set(MATRIX.map(r => r[2]))).toEqual(new Set(ALL_KINDS));
    expect(ALL_KINDS.length).toBe(new Set(ALL_KINDS).size);
  });

  it('方法/子路径守卫：只读或动作子路由不被写体吞掉', () => {
    const guards: Row[] = [
      ['/_snapshot/_status', 'GET', 'search'],
      ['/_snapshot/repo', 'GET', 'search'],
      ['/_snapshot/repo/snap/_status', 'GET', 'search'],
      ['/_ingest/pipeline/logs-v1', 'GET', 'search'],
      ['/_security/api_key/grant', 'POST', 'search'],
      ['/_security/role/analyst', 'GET', 'search'],
      ['/_security/user/jdoe', 'DELETE', 'search'],
      ['/_ilm/policy/nightly', 'GET', 'search'],
      ['/_slm/policy/nightly', 'DELETE', 'search'],
      ['/_watcher/watch/error-rate/_execute', 'POST', 'search'],
      ['/_transform/daily/_start', 'POST', 'search'],
      ['/_rollup/job/daily/_start', 'POST', 'search'],
      ['/_ml/anomaly_detectors/latency/_update', 'POST', 'search'],
      ['/_ml/datafeeds/latency/_update', 'POST', 'search'],
      ['/_enrich/policy/users/_execute', 'POST', 'search'],
    ];
    for (const [path, method, kind] of guards) {
      expect(bodyKindForPath(path, method), `${method} ${path}`).toBe(kind);
    }
  });
});
