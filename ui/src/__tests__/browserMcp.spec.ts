import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/browserApi', () => ({ browserFetch: vi.fn() }));
import { browserFetch } from '../platform/browserApi';
import { handleMcpRequest, isMcpRestReadOnly, MCP_TOOLS, MCP_WRITE_TOOLS, setBrowserMcpWriteAllowed } from '../platform/browserMcp';

const fetchMock = browserFetch as unknown as ReturnType<typeof vi.fn>;
const reply = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('browser MCP bridge', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('initializes and advertises the same tool family as server mode', async () => {
    const init = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.serverInfo).toMatchObject({ name: 'ESQueryStudio', mode: 'browser' });
    const list = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.result.tools.map((t: any) => t.name)).toEqual(
      MCP_TOOLS.filter(t => !MCP_WRITE_TOOLS.includes(t.name)).map(t => t.name));
  });

  it('routes tools/call through the browser transport and returns text content', async () => {
    fetchMock.mockResolvedValue(reply({ status: 'green', version: '8.13.0' }));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'es_cluster_health', arguments: {} },
    });
    expect(out.result.isError).toBe(false);
    expect(JSON.parse(out.result.content[0].text)).toMatchObject({ status: 'green' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cluster/health');
  });

  it('accepts a full search body string and sends its query clause', async () => {
    fetchMock.mockResolvedValue(reply({ hits: { hits: [] } }));
    await handleMcpRequest({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: {
        name: 'es_search',
        arguments: { index: 'research_report', query: '{"query":{"term":{"status":"published"}},"size":99}' },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.query).toEqual({ term: { status: 'published' } });
    expect(body.size).toBe(10);
  });

  it('classifies raw REST by operation, not just HTTP method', async () => {
    expect(isMcpRestReadOnly('GET', '/_cluster/health')).toBe(true);
    expect(isMcpRestReadOnly('POST', '/research/_search')).toBe(true);
    expect(isMcpRestReadOnly('POST', '/_sql')).toBe(true);
    expect(isMcpRestReadOnly('POST', '/_bulk')).toBe(false);
    setBrowserMcpWriteAllowed(false);
    fetchMock.mockResolvedValue(reply({ raw: 'ok' }));
    const read = await handleMcpRequest({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'es_rest', arguments: { method: 'POST', path: '/research/_search', body: {} } },
    });
    expect(read.result.isError).toBe(false);
    const write = await handleMcpRequest({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'es_rest', arguments: { method: 'POST', path: '/_bulk', body: {} } },
    });
    expect(write.result.isError).toBe(true);
    expect(write.result.content[0].text).toContain('未启用');
  });

  it('keeps browser write tools opt-in', async () => {
    setBrowserMcpWriteAllowed(false);
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'es_index_doc', arguments: { index: 'i', id: '1', document: { a: 1 } } },
    });
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain('未启用');
  });

  it('keeps the list-indices schema honest (no unsupported includeSystem switch)', () => {
    const tool = MCP_TOOLS.find(t => t.name === 'es_list_indices');
    expect(tool?.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('returns an MCP tool error instead of throwing', async () => {
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'es_get_mapping', arguments: {} },
    });
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain('index');
  });
});
