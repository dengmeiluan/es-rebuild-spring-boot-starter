/**
 * 976 权限校准：DevTools/REST 分权、静态页白名单写入口、连接模型未登记写默认拒绝、
 * 路由大小写/尾斜杠归一。锁住「有权限的人不被拦、无权限的人看不到入口」的前端判定面。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { pageAllowed } from '../router';

const PAGES = {
  groups: [{
    id: 'g', name: 'g', sort: 1, pages: [
      { key: 'indices', name: '索引', route: '/indices', apiPrefixes: ['/internal/es/index/cluster/delete-index'] },
      { key: 'cluster-settings', name: '集群设置', route: '/cluster-settings', apiPrefixes: ['/internal/es/index/cluster/settings'] },
      { key: 'rest', name: 'REST', route: '/rest', apiPrefixes: ['/internal/es/index/cluster/raw'] },
      { key: 'devtools', name: 'DevTools', route: '/devtools', apiPrefixes: [] },
      { key: 'security', name: '安全中心', route: '/security', apiPrefixes: ['/internal/es/index/auth/users'] },
    ],
  }],
};

describe('976 前端权限校准', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('DevTools 写键不解锁 REST 直连；rest 写键两者都解锁', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, pages: PAGES, grantedPages: ['conn:c1:devtools', 'conn:c1:w:devtools'] };
    expect(auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(true);
    expect(auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'c1')).toBe(false);

    auth.me = { username: 'u', role: 'VIEWER', fallback: false, pages: PAGES, grantedPages: ['conn:c1:rest', 'conn:c1:w:rest'] };
    expect(auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/devtools/execute', 'c1')).toBe(true);
    expect(auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'c1')).toBe(true);
  });

  it('静态页白名单：未勾选 cluster-settings 时写命令不展示，勾选后按角色放行', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'REBUILD_OP', fallback: false, pages: PAGES, grantedPages: ['overview'] };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/settings/put', 'c1')).toBe(false);
    expect(auth.canPage('ops', 'cluster-settings', 'host')).toBe(false);

    auth.me = { username: 'u', role: 'REBUILD_OP', fallback: false, pages: PAGES, grantedPages: ['overview', 'cluster-settings'] };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/settings/put', 'c1')).toBe(true);
    expect(auth.canPage('ops', 'cluster-settings', 'host')).toBe(true);
  });

  it('连接模型读端点同样受页面可见性约束（未授 security 不显示用户列表）', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, pages: PAGES, grantedPages: ['conn:c1:devtools', 'conn:c1:w:devtools'] };
    expect(auth.canEndpoint('admin', 'GET', '/internal/es/index/auth/users', 'c1')).toBe(false);
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, pages: PAGES, grantedPages: ['conn:c1:security'] };
    expect(auth.canEndpoint('admin', 'GET', '/internal/es/index/auth/users', 'c1')).toBe(true);
  });

  it('连接模型未登记页面归属的写端点默认拒绝', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, pages: PAGES, grantedPages: ['conn:c1:overview', 'conn:c1:w:overview'] };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/unknown-write', 'c1')).toBe(false);
  });

  it('建索引共享写键：indices 页写键可用', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, pages: PAGES, grantedPages: ['conn:c1:indices', 'conn:c1:w:indices'] };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', 'c1')).toBe(true);
  });

  it('路由大小写/尾斜杠归一后不再绕过页面门', () => {
    expect(pageAllowed(['indices'], '/INDICES/', 'host')).toBe(true);
    expect(pageAllowed(['overview'], '/INDICES/', 'host')).toBe(false);
    expect(pageAllowed(['indices'], '/indices/', 'host')).toBe(true);
  });

  it('DevTools 预填 run=true 时身份未确认只填入、不自动发写请求', () => {
    const src = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
    expect(src).toContain('auth.me == null && !auth.authDisabled');
    const guard = src.indexOf('auth.me == null && !auth.authDisabled');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(src.indexOf('run();', guard));
  });
});
