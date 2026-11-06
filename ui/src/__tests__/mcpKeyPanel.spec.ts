import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const panel = readFileSync(join(SRC, 'components/McpPanel.vue'), 'utf-8');
const apiTs = readFileSync(join(SRC, 'api.ts'), 'utf-8');
const unsupported = readFileSync(join(SRC, 'utils/browserUnsupported.ts'), 'utf-8');
const topbar = readFileSync(join(SRC, 'components/TopBar.vue'), 'utf-8');
const devtools = readFileSync(join(SRC, 'views/DevToolsView.vue'), 'utf-8');

describe('MCP 接入管理面', () => {
  it('服务端模式提供密钥/用量页并调用管理端点', () => {
    expect(panel).toContain('密钥与用量');
    expect(panel).toContain('api.mcpKeys.list()');
    expect(panel).toContain('api.mcpKeys.create(payload)');
    expect(panel).toContain('api.mcpKeys.revoke(k.id)');
    expect(panel).toContain('requestsPerMinute');
    expect(panel).toContain('dailyQuota');
    expect(panel).toContain('monthlyQuota');
    expect(panel).toContain('ADMIN');
    expect(panel).toContain('OPERATOR');
    expect(panel).toContain('连接集合');
    expect(panel).toContain('写权限连接');
    expect(panel).toContain('connectionPermissions');
    expect(panel).toContain('MCP_WRITE_TOOLS');
    expect(panel).toContain('exportLocalConfig');
    /* 静态入口在 /esquerystudio/ 下，MCP 端点在应用根 /mcp：相对上一级解析。 */
    expect(panel).toContain("new URL('../mcp', document.baseURI)");
    expect(apiTs).toContain("get<any>('/mcp/keys')");
  });

  it('浏览器/演示模式如实说明 HTTP key 边界，不伪造可用 key', () => {
    expect(panel).toContain('API key 只在服务端模式生效');
    expect(panel).toContain('演示站不生成真实密钥');
    expect(unsupported).toContain("'/mcp/keys'");
    expect(unsupported).toContain('浏览器标签页不监听 TCP');
  });

  it('接入页保留页面内 MCP 桥与工具试跑', () => {
    expect(panel).toContain('window.ESQueryStudioMCP');
    expect(panel).toContain('mcpCallTool');
    expect(panel).toContain('运行工具');
  });

  it('顶栏 MCP 是全局入口，DevTools 消费一次性标记', () => {
    expect(topbar).toContain('MCP 接入与密钥管理');
    expect(topbar).toContain("esquerystudio.mcp.open");
    expect(devtools).toContain('consumeMcpOpen()');
  });
});
