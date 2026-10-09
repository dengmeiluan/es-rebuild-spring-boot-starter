/**
 * 五百六十三批·用户实报②「同事操作 qa 集群,权限都给了,无法操作表格数据」前端断点行为锁。
 *
 * 根因:can('write') 只看全局角色(roleRank>=2),与连接级授权完全脱钩——后端拦截器写门
 * 语义是 conn 模型下连接授权为最终裁决(跳过全局角色门),前端按钮却按全局 VIEWER 禁用
 * 双击编辑=「权限给了却无法操作」。
 *
 * 修=auth.canWriteOn(targetId) 镜像后端三态:
 *  - grantedPages=null(授权体系未启用)→ 全局角色门(既有语义);
 *  - 该目标存在 conn:{tid}:* 键 → 写键 conn:{tid}:w:* 在场即裁决(连接模型);
 *  - 该目标无 conn 键(静态键模型)→ 全局角色门。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../stores/auth';

describe('563 实报②:连接级写授权 canWriteOn(镜像后端写门三态)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('连接写键在场:VIEWER 全局角色也放行(后端写门同源语义)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:5:docs', 'conn:5:w:docs'] };
    expect(auth.canWriteOn('5')).toBe(true);
  });
  it('连接只读键(无 w):不放行(写门保持闭合)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:5:docs'] };
    expect(auth.canWriteOn('5')).toBe(false);
  });
  it('目标无 conn 键(静态键模型):回退全局角色门(VIEWER 不放行)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['overview', 'docs'] };
    expect(auth.canWriteOn('5')).toBe(false);
  });
  it('grantedPages=null(授权体系未启用):回退全局角色门(既有语义)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'OPERATOR', fallback: false, grantedPages: null };
    expect(auth.canWriteOn('5')).toBe(true);
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: null };
    expect(auth.canWriteOn('5')).toBe(false);
  });
  it('conn 前缀隔离:目标 5 的写键不外溢到目标 6(连接键不跨连接)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:5:w:docs'] };
    expect(auth.canWriteOn('6')).toBe(false);
  });
});

/* ═══ 五百八十四批:页面级连接感知门 canPage——「菜单勾选即权限」行为锁 ═══
   conn 模型下本页写键 conn:{tid}:w:{pageKey} 在场即放行(镜像后端页面门 writeAllowed
   精确键语义);静态模型(grantedPages=null)与非连接上下文回落全局角色档 canCap;
   admin 是管理域(连接菜单无对应勾选项)不走连接分支。 */
describe('584 批:页面级连接感知门 canPage(conn 模型勾选即权限)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('conn 模型:本页写键在场即放行(VIEWER 全局角色也可见)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:docs', 'conn:c1:w:docs'] };
    expect(auth.canPage('ops', 'docs', 'c1')).toBe(true);
  });
  it('conn 模型:别的页写键不外溢(只勾了 docs 页,snapshots 门保持闭合)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:docs', 'conn:c1:w:docs'] };
    expect(auth.canPage('ops', 'snapshots', 'c1')).toBe(false);
  });
  it('conn 模型:无 target 回落全局角色档(VIEWER 过不了 ops 门)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:docs', 'conn:c1:w:docs'] };
    expect(auth.canPage('ops', 'docs', null)).toBe(false);
  });
  it('conn 模型:admin 管理域不走连接分支(VIEWER 持写键也拿不到 admin 档)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:docs', 'conn:c1:w:docs'] };
    expect(auth.canPage('admin', 'x', 'c1')).toBe(false);
  });
  it('静态模型(grantedPages=null):回落全局角色档与 canCap 等值(ops 门 rank3+)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: null };
    expect(auth.canPage('ops', 'docs', 'c1')).toBe(false);
    auth.me = { username: 'u', role: 'OPERATOR', fallback: false, grantedPages: null };
    expect(auth.canPage('ops', 'docs', 'c1')).toBe(false); /* OPERATOR rank2,ops 档 rank3+ 不过 */
    auth.me = { username: 'u', role: 'REBUILD_OP', fallback: false, grantedPages: null };
    expect(auth.canPage('ops', 'docs', 'c1')).toBe(true);
  });
  it('me=null(后端未启用鉴权):恒放行(既有语义)', () => {
    const auth = useAuthStore();
    expect(auth.canPage('ops', 'docs', 'c1')).toBe(true);
    expect(auth.canPage('admin', 'docs', 'c1')).toBe(true);
  });
});

/* ═══ 五百八十八批:端点级单一权限入口 canEndpoint——apiPrefixes 镜像后端 pageOf 行为锁 ═══
   me.pages 每页下发 apiPrefixes(端点归属页前缀表),前端最长前缀匹配 path→pageKey;
   conn 模型:命中页→精确写键 conn:{tid}:w:{pageKey};未命中(共享端点)→任意写键在场即放行;
   静态模型(grantedPages=null)回落 canCap;admin 管理域不走连接分支;me=null 恒放行。
   视图只传按钮真实调用的端点路径,零 pageKey 硬编码(586 错位根治)。 */
describe('588 批:端点级单一权限入口 canEndpoint(apiPrefixes 最长前缀匹配)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const pagesWithPrefixes = {
    groups: [{ id: 'g', name: 'g', sort: 1, pages: [{ key: 'indices', name: '索', route: '/indices', apiPrefixes: ['/internal/es/index/cluster/delete-index', '/internal/es/index/rebuild-empty'] }] }],
  };
  const pagesWithPrefixesRest = {
    groups: [{ id: 'g', name: 'g', sort: 1, pages: [{ key: 'rest', name: 'REST', route: '/rest', apiPrefixes: ['/internal/es/index/cluster/raw'] }] }],
  };

  it('conn 模型:端点命中页前缀+本页写键在场→放行(VIEWER 全局角色也放行)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:indices', 'conn:c1:w:indices'], pages: pagesWithPrefixes };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-index', 'c1')).toBe(true);
  });
  it('conn 模型:未命中页(共享端点)且无任意写键→不放行', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:indices'], pages: pagesWithPrefixes };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/snapshot/delete', 'c1')).toBe(false);
  });
  it('conn 模型:未命中页(共享端点)但任意写键在场→放行', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:docs', 'conn:c1:w:docs'], pages: pagesWithPrefixes };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-by-id', 'c1')).toBe(true);
  });
  it('静态模型(grantedPages=null):回落 canCap(VIEWER 拒,REBUILD_OP 过)', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: null, pages: pagesWithPrefixes };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-index', 'c1')).toBe(false);
    auth.me = { username: 'u', role: 'REBUILD_OP', fallback: false, grantedPages: null, pages: pagesWithPrefixes };
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-index', 'c1')).toBe(true);
  });
  it('me=null(后端未启用鉴权):恒放行(既有语义)', () => {
    const auth = useAuthStore();
    expect(auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-index', 'c1')).toBe(true);
  });
  it('五百九十批·管理域放开：admin 也走连接分支——raw 归 rest 页，勾 rest 写键即裁决（588 旧锚随语义升格改写）', () => {
    const auth = useAuthStore();
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:indices', 'conn:c1:w:indices'], pages: pagesWithPrefixesRest };
    /* 勾 indices 写≠raw 可用：raw 归 rest 页，pageOf 镜像按端点归属裁决——夹具须含 rest 页
       （真实部署 me.pages 下发全部 52 页；夹具缺页会把 raw 误判共享端点走任意写键分支） */
    expect(auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'c1')).toBe(false);
    auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: ['conn:c1:rest', 'conn:c1:w:rest'], pages: pagesWithPrefixesRest };
    expect(auth.canEndpoint('admin', 'POST', '/internal/es/index/cluster/raw', 'c1')).toBe(true);
  });
});
