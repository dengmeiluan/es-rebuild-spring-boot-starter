/** 纯浏览器模式没有服务端进程/存储，以下页面依赖宿主侧能力。
 *  进入时展示明确的「需服务端模式」说明，而不是让页面发请求拿 501 红条。 */
export const BROWSER_SERVER_ONLY: Record<string, { name: string; reason: string }> = {
  '/security': { name: '安全中心', reason: '账号、角色与操作审计依赖服务端用户库和审计索引。' },
  '/system': { name: '系统索引', reason: '控制面索引由服务端控制台维护，浏览器模式没有该控制面。' },
  '/adhoc-rebuild': { name: '托管重建', reason: '重建作业的编排、暂停与续跑依赖服务端作业存储。' },
  '/xmigrate': { name: '跨集群迁移', reason: '迁移作业、凭据托管与断点续跑依赖服务端编排器。' },
  '/config-validator': { name: '配置校验器', reason: 'L1/L2/L3 校验链与 dry-run 由服务端配置实验室提供。' },
  '/config-drift': { name: '配置漂移', reason: '漂移基线保存在服务端，浏览器模式没有基线存储。' },
};

export function browserServerOnlyOf(path: string): { name: string; reason: string } | null {
  return BROWSER_SERVER_ONLY[path] || null;
}
