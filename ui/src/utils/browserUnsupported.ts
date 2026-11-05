/** 纯浏览器模式没有服务端进程/存储，以下页面依赖宿主侧能力。
 *  进入时展示明确的「需服务端模式」说明，而不是让页面发请求拿 501 红条。 */
export const BROWSER_SERVER_ONLY: Record<string, { name: string; reason: string }> = {
};

export function browserServerOnlyOf(path: string): { name: string; reason: string } | null {
  return BROWSER_SERVER_ONLY[path] || null;
}
