/** 纯浏览器模式没有服务端进程/存储，以下页面依赖宿主侧能力。
 *  进入时展示明确的「需服务端模式」说明，而不是让页面发请求拿 501 红条。 */
export const BROWSER_SERVER_ONLY: Record<string, { name: string; reason: string }> = {
  '/system': { name: '系统索引', reason: '控制面索引由服务端控制台维护，浏览器模式没有该控制面。' },
  '/xmigrate': { name: '跨集群迁移', reason: '迁移作业、凭据托管与断点续跑依赖服务端编排器。' },
  '/config-drift': { name: '配置漂移', reason: '漂移基线保存在服务端，浏览器模式没有基线存储。' },
};

export function browserServerOnlyOf(path: string): { name: string; reason: string } | null {
  return BROWSER_SERVER_ONLY[path] || null;
}
