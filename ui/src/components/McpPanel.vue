<template>
  <NModal :show="show" preset="card" title="MCP 接入管理" style="width: 1080px; max-width: 96vw" :bordered="false"
    @update:show="v => emit('update:show', v)">
    <div class="mcp-panel">
      <div class="mcp-banner" :class="{ browser: !serverMode }">
        <span class="mcp-dot" />
        <span v-if="isBrowserMode">纯前端模式：MCP JSON-RPC 在本页通过 <code>window.ESQueryStudioMCP</code> 提供；外部进程客户端请使用服务端模式或本地桥。</span>
        <span v-else-if="isDemoMode">演示站：这里只展示 MCP 接入面；API key、限流与用量需要服务端模式。</span>
        <span v-else>服务端模式：HTTP JSON-RPC 端点 <code>{{ endpoint }}</code>，支持服务级 Bearer token 与按用户/角色签发的 MCP API key。</span>
      </div>

      <div class="mcp-tabs" role="tablist" aria-label="MCP 接入视图">
        <button type="button" class="mcp-tab" :class="{ active: tab === 'access' }" role="tab"
          :aria-selected="tab === 'access'" @click="tab = 'access'">接入与工具</button>
        <button type="button" class="mcp-tab" data-test="mcp-keys-tab" :class="{ active: tab === 'keys' }" role="tab"
          :aria-selected="tab === 'keys'" @click="openKeys">密钥与用量</button>
      </div>

      <template v-if="tab === 'access'">
        <div class="mcp-grid">
          <section class="mcp-card">
            <h3>接入方式</h3>
            <template v-if="isBrowserMode">
              <p class="mcp-hint">页面内 AI / Agent 可直接调用同一套工具；不需要端口和额外进程。</p>
              <pre class="mcp-code">await window.ESQueryStudioMCP.handle({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list'
})</pre>
              <p class="mcp-hint">外部 MCP 客户端无法直接连接浏览器标签页。需要 stdio/HTTP 进程时，请在服务端模式使用 <code>/mcp</code>，或按 <code>docs/mcp.md</code> 的本地桥方案接入。</p>
            </template>
            <template v-else>
              <p class="mcp-hint">MCP 端点是一次性能力开关；key 在「密钥与用量」中实时签发，不需要配置文件里写 token。</p>
              <pre class="mcp-code">esquerystudio:
  mcp:
    enabled: true</pre>
              <p class="mcp-hint">宿主已有 Spring Security 时，同时放行 <code>{context-path}/mcp</code>；鉴权由 starter 的 API key 完成。</p>
              <p class="mcp-hint">外部 MCP 客户端请求头：<code>Authorization: Bearer &lt;token-or-key&gt;</code></p>
              <pre class="mcp-code">{{ curlSnippet }}</pre>
            </template>
          </section>

          <section class="mcp-card">
            <h3>工具清单（{{ tools.length }}）</h3>
            <div class="mcp-tools">
              <button v-for="tool in tools" :key="tool.name" type="button" class="mcp-tool"
                :class="{ active: selected === tool.name }" @click="selectTool(tool.name)">
                <code>{{ tool.name }}</code>
                <span class="mcp-tool-line"><span class="mcp-kind" :class="toolKindClass(tool.name)">{{ toolKind(tool.name) }}</span>{{ tool.description }}</span>
              </button>
            </div>
            <button type="button" class="btn ghost xs mcp-copy" @click="copyTools">复制工具 JSON</button>
            <label v-if="isBrowserMode" class="mcp-check mcp-write-toggle">
              <input v-model="browserWrite" type="checkbox" @change="toggleBrowserWrite" />
              允许页面内写工具
              <span class="mcp-muted">默认关闭；打开后 Agent 可用当前 ES 账号执行写入</span>
            </label>
            <button v-if="isBrowserMode" type="button" class="btn ghost xs mcp-copy" @click="exportLocalConfig">
              导出 Node MCP 配置
            </button>
            <p v-if="isBrowserMode" class="mcp-hint">导出文件含本机连接凭据，仅用于本机 Node MCP；保存到受限目录。</p>
          </section>
        </div>

        <section class="mcp-card mcp-play">
          <h3>工具试跑</h3>
          <div class="mcp-play-row">
            <select v-model="selected" class="mcp-select" aria-label="选择 MCP 工具">
              <option v-for="tool in tools" :key="tool.name" :value="tool.name">{{ tool.name }}</option>
            </select>
            <button type="button" class="btn primary sm" :disabled="running || !isBrowserMode" @click="runTool">
              {{ running ? '执行中…' : '运行工具' }}
            </button>
          </div>
          <textarea v-model="argsText" class="mcp-args" spellcheck="false" aria-label="MCP 工具参数 JSON"></textarea>
          <pre v-if="resultText" class="mcp-result">{{ resultText }}</pre>
          <p v-if="!isBrowserMode" class="mcp-hint">服务端模式的试跑请交给外部 MCP 客户端；此面板只展示协议与工具定义。</p>
        </section>
      </template>

      <template v-else>
        <div v-if="!serverMode" class="mcp-card mcp-boundary">
          <h3>API key 只在服务端模式生效</h3>
          <p class="mcp-hint">浏览器标签页没有可被外部进程连接的 TCP 端点，页面内 Agent 直接调用 <code>window.ESQueryStudioMCP</code>，走当前浏览器连接档案和 ES 原生账号权限，不需要签发 HTTP key。</p>
          <p class="mcp-hint">演示站不生成真实密钥，也不连接任何 Elasticsearch。需要密钥、频率限制和用量记录时，请部署服务端模式。</p>
        </div>

        <template v-else>
          <div class="mcp-key-head">
            <div>
              <h3>MCP 密钥</h3>
              <p class="mcp-hint">key 绑定签发时的登录人与角色；明文只在创建响应出现一次，撤销后使用方立即收到 401。</p>
            </div>
            <div class="mcp-key-actions">
              <button type="button" class="btn ghost sm" :disabled="keyLoading" @click="loadKeys">
                {{ keyLoading ? '刷新中…' : '刷新' }}
              </button>
              <button v-if="canCreate" type="button" class="btn primary sm" data-test="mcp-create-key"
                @click="showCreate = !showCreate">
                {{ showCreate ? '收起' : '签发密钥' }}
              </button>
            </div>
          </div>

          <div class="mcp-kpis">
            <span>共 <b>{{ keys.length }}</b> 把</span>
            <span>启用 <b>{{ totals.active }}</b></span>
            <span>今日请求 <b>{{ totals.today }}</b></span>
            <span>本月请求 <b>{{ totals.month }}</b></span>
            <span v-if="keyMeta.caller">当前身份 <b>{{ keyMeta.caller.username }} · {{ keyMeta.caller.role }}</b></span>
          </div>

          <div v-if="keyErr" class="mcp-error">{{ keyErr }}</div>

          <section v-if="showCreate" class="mcp-create">
            <h3>签发新 key</h3>
            <div class="mcp-form-grid">
              <label class="mcp-field"><span>名称</span>
                <input v-model="form.name" maxlength="80" placeholder="例如 ci-agent / analyst-readonly" />
              </label>
              <label v-if="auth.isAdmin()" class="mcp-field"><span>归属用户</span>
                <input v-model="form.owner" placeholder="留空=自己" />
              </label>
              <label v-if="auth.isAdmin()" class="mcp-field"><span>角色</span>
                <select v-model="form.role">
                  <option v-for="r in roleOptions" :key="r" :value="r">{{ r }}</option>
                </select>
              </label>
              <label class="mcp-field"><span>每分钟请求</span>
                <input v-model.number="form.requestsPerMinute" type="number" min="1" :max="limits.maxRequestsPerMinute" />
              </label>
              <label class="mcp-field"><span>每日配额</span>
                <input v-model.number="form.dailyQuota" type="number" min="1" :max="limits.maxDailyQuota" />
              </label>
              <label class="mcp-field"><span>每月配额</span>
                <input v-model.number="form.monthlyQuota" type="number" min="1" :max="limits.maxMonthlyQuota" />
              </label>
              <label class="mcp-field"><span>有效期（天，0=不过期）</span>
                <input v-model.number="form.expiresInDays" type="number" min="0" :max="limits.maxExpiresInDays" />
              </label>
            </div>
            <div v-if="availableConnections.length" class="mcp-scope-grid">
              <div class="mcp-scope">
                <span class="mcp-field-label">连接集合</span>
                <label v-for="c in availableConnections" :key="c.id" class="mcp-check">
                  <input v-model="form.connections" type="checkbox" :value="c.id" />
                  <span>{{ c.name }}</span><code>{{ c.id }}</code>
                </label>
              </div>
              <div class="mcp-scope">
                <span class="mcp-field-label">写权限连接（其余所选连接只读）</span>
                <label v-for="c in selectedConnections" :key="c.id" class="mcp-check">
                  <input v-model="form.writeConnections" type="checkbox" :value="c.id" :disabled="!c.write" />
                  <span>{{ c.write ? '允许写入' : '只读' }}</span><code>{{ c.name }} · {{ c.id }}</code>
                </label>
                <p v-if="!selectedConnections.length" class="mcp-hint">先在左侧选择连接集合。</p>
                <p v-else class="mcp-hint">例如 QA / UAT 勾写，生产连接不勾写，即为「测试可写、生产只读」。</p>
              </div>
            </div>
            <p v-else class="mcp-hint">非 ADMIN 签发的 key 固定为宿主连接、只读权限。</p>
            <div class="mcp-tool-picks">
              <span class="mcp-field-label">可用工具</span>
              <label v-for="tool in selectableTools" :key="tool" class="mcp-check">
                <input v-model="form.allowedTools" type="checkbox" :value="tool" />
                <code>{{ tool }}</code>
              </label>
            </div>
            <p class="mcp-hint">当前角色的上限：{{ limits.maxRequestsPerMinute }} 次/分钟，日配额 {{ limits.maxDailyQuota }}，月配额 {{ limits.maxMonthlyQuota }}。</p>
            <div class="mcp-form-actions">
              <button type="button" class="btn primary sm"
                :disabled="creating || !form.name.trim() || !form.allowedTools.length || !form.connections.length || !form.permissions.length"
                @click="createKey">
                {{ creating ? '创建中…' : '创建 key' }}
              </button>
            </div>
          </section>

          <section v-if="newSecret" class="mcp-secret" role="status">
            <div class="mcp-secret-hd">
              <strong>已创建 {{ newKey?.name }}，明文只显示这一次</strong>
              <button type="button" class="btn ghost xs" @click="copySecret">{{ secretCopied ? '已复制' : '复制 key' }}</button>
            </div>
            <pre class="mcp-code">{{ newSecret }}</pre>
            <p class="mcp-hint">请立即保存到 MCP 客户端的环境变量或密钥管理系统；关闭后无法再次查看。</p>
            <p class="mcp-hint">Claude Desktop / Cursor 的 stdio 片段（把路径替换为仓库中的 bridge）：</p>
            <pre class="mcp-code">{{ clientConfig }}</pre>
          </section>

          <div v-if="!keys.length && !keyLoading" class="mcp-empty">
            还没有 MCP API key。{{ canCreate ? '点击「签发密钥」创建第一把。' : createBlockedReason }}
          </div>

          <div v-else class="mcp-table-wrap">
            <table class="mcp-table">
              <thead>
                <tr><th>名称 / 前缀</th><th>归属 / 角色 / 范围</th><th>频率</th><th>今日 / 本月</th><th>最近使用</th><th>状态</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="k in keys" :key="k.id">
                  <td><strong>{{ k.name }}</strong><br /><code>{{ k.prefix }}</code></td>
                  <td>{{ k.owner }}<br /><span class="mcp-muted">{{ k.role }} · {{ scopeLabel(k) }} · {{ (k.connectionNames || k.connections || ['host']).join(', ') }}</span></td>
                  <td>{{ k.requestsPerMinute }}/min</td>
                  <td>{{ k.todayCount }} / {{ k.dailyQuota }}<br /><span class="mcp-muted">本月 {{ k.monthCount }} / {{ k.monthlyQuota }}</span></td>
                  <td>{{ k.lastUsedAt ? fmtTime(k.lastUsedAt) : '未使用' }}</td>
                  <td><span class="mcp-state" :class="statusClass(k)">{{ statusText(k) }}</span></td>
                  <td class="mcp-row-action">
                    <button v-if="canRevoke(k)" type="button" class="btn ghost xs" @click="rotateKey(k)">轮换</button>
                    <button v-if="canRevoke(k)" type="button" class="btn ghost xs" @click="revokeKey(k)">撤销</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="mcp-hint">限流按 key 固定 60 秒窗口；日/月配额按 UTC 重置。多实例部署时每个实例独立计数，严格全局配额请在网关或宿主侧按 key 维度实施。</p>
        </template>
      </template>
    </div>
  </NModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { NModal } from 'naive-ui';
import { MCP_TOOLS, MCP_WRITE_TOOLS, isBrowserMcpWriteAllowed, mcpCallTool, setBrowserMcpWriteAllowed } from '../platform/browserMcp';
import { isBrowserMode } from '../platform/browserApi';
import { isDemoMode } from '../platform/demoApi';
import { activeProfile, profiles } from '../platform/browserProfiles';
import { api } from '../api';
import { useAuthStore } from '../stores/auth';
import { roleRank } from '../utils/capability';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();

const auth = useAuthStore();
const tools = MCP_TOOLS;
const selected = ref(tools[0]?.name || '');
const argsText = ref('{}');
const resultText = ref('');
const running = ref(false);
const browserWrite = ref(isBrowserMcpWriteAllowed());
/* 控制台静态入口在 /esquerystudio/ 下，MCP 端点固定在应用根路径 /mcp；
   ../mcp 同时兼容 server.servlet.context-path 前缀。 */
const endpoint = computed(() => new URL('../mcp', document.baseURI).toString());
const serverMode = computed(() => !isBrowserMode && !isDemoMode);

const tab = ref<'access' | 'keys'>('access');
const keys = ref<any[]>([]);
const keyMeta = ref<any>({ limits: {}, availableTools: [] });
const keyLoading = ref(false);
const keyErr = ref('');
const showCreate = ref(false);
const creating = ref(false);
const newSecret = ref('');
const newKey = ref<any>(null);
const secretCopied = ref(false);
const roleOptions = ['VIEWER', 'OPERATOR', 'REBUILD_OP', 'CLUSTER_OP', 'AUDIT_OP', 'ADMIN'];
const form = reactive({
  name: '', owner: '', role: 'VIEWER',
  requestsPerMinute: 60, dailyQuota: 5000, monthlyQuota: 100000, expiresInDays: 0,
  allowedTools: [] as string[],
  permissions: ['read'] as string[],
  connections: ['host'] as string[],
  writeConnections: [] as string[],
});

const selectedConnections = computed(() => availableConnections.value.filter(c => form.connections.includes(c.id)));
const hasWrite = computed(() => form.writeConnections.length > 0);
const hasRead = computed(() => selectedConnections.value.length > 0);

const limits = computed(() => ({
  maxRequestsPerMinute: keyMeta.value?.limits?.maxRequestsPerMinute ?? 120,
  maxDailyQuota: keyMeta.value?.limits?.maxDailyQuota ?? 20000,
  maxMonthlyQuota: keyMeta.value?.limits?.maxMonthlyQuota ?? 500000,
  maxExpiresInDays: keyMeta.value?.limits?.maxExpiresInDays ?? 90,
}));
const availableTools = computed<string[]>(() => {
  const list = keyMeta.value?.availableTools;
  return Array.isArray(list) && list.length ? list : tools.map(t => t.name);
});
const availableConnections = computed<any[]>(() => {
  const list = keyMeta.value?.availableConnections;
  return Array.isArray(list) && list.length ? list : [{ id: 'host', name: '宿主 / 控制集群' }];
});
const selectableTools = computed(() => availableTools.value.filter(tool =>
  MCP_WRITE_TOOLS.includes(tool) ? hasWrite.value : hasRead.value));
const canCreate = computed(() => serverMode.value && availableConnections.value.length > 0);
const createBlockedReason = computed(() => {
  if (!serverMode.value || canCreate.value) return '';
  return '当前身份没有可签发 MCP key 的连接页面授权；请联系 ADMIN 分配连接菜单权限。';
});
const totals = computed(() => ({
  active: keys.value.filter(k => k.enabled && !k.expired).length,
  today: keys.value.reduce((sum, k) => sum + Number(k.todayCount || 0), 0),
  month: keys.value.reduce((sum, k) => sum + Number(k.monthCount || 0), 0),
}));

const clientConfig = computed(() => JSON.stringify({
  mcpServers: {
    esquerystudio: {
      command: 'node',
      args: ['/path/to/esquerystudio/mcp/esquerystudio-mcp-stdio.mjs'],
      env: { ESQ_MCP_URL: endpoint.value, ESQ_MCP_TOKEN: newSecret.value },
    },
  },
}, null, 2));

const curlSnippet = computed(() => `curl -s ${endpoint.value} \\
  -H 'Authorization: Bearer change-me' \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`);

function toolKind(name: string) {
  if (name === 'es_rest') return '读/写';
  return MCP_WRITE_TOOLS.includes(name) ? '写' : '读';
}

function toolKindClass(name: string) {
  if (name === 'es_rest') return 'rw';
  return MCP_WRITE_TOOLS.includes(name) ? 'write' : 'read';
}

function selectTool(name: string) {
  selected.value = name;
  argsText.value = '{}';
  resultText.value = '';
}

function toggleBrowserWrite() {
  setBrowserMcpWriteAllowed(browserWrite.value);
}

/** 浏览器里配好的连接一键导出为本地 Node MCP 的 mcp.json（含凭据，显式点击才生成）。 */
function exportLocalConfig() {
  const connections = profiles().map((p) => {
    const base = { id: p.id, name: p.name, url: p.url, username: p.username || '' };
    return p.authType === 'API_KEY'
      ? { ...base, apiKey: p.password || '' }
      : { ...base, password: p.password || '' };
  });
  const payload = { defaultConnection: activeProfile()?.id || connections[0]?.id || '', connections };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'esquerystudio-mcp.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function copyTools() {
  const text = JSON.stringify(tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), null, 2);
  try { await navigator.clipboard.writeText(text); resultText.value = '工具 JSON 已复制'; } catch { resultText.value = text; }
}

async function runTool() {
  if (!isBrowserMode || running.value) return;
  running.value = true;
  resultText.value = '';
  try {
    let args: Record<string, any> = {};
    if (argsText.value.trim()) args = JSON.parse(argsText.value);
    const data = await mcpCallTool(selected.value, args);
    resultText.value = JSON.stringify(data, null, 2);
  } catch (e: any) {
    resultText.value = '失败：' + String(e?.message || e);
  } finally {
    running.value = false;
  }
}

async function openKeys() {
  tab.value = 'keys';
  if (serverMode.value && !keys.value.length) await loadKeys();
}

async function loadKeys() {
  if (!serverMode.value) return;
  keyLoading.value = true;
  keyErr.value = '';
  try {
    const data = await api.mcpKeys.list();
    keys.value = Array.isArray(data?.keys) ? data.keys : [];
    keyMeta.value = data || {};
    if (!form.connections.some(id => availableConnections.value.some(c => c.id === id))) {
      /* 管理员的常用默认是宿主；普通用户默认列出自己全部授权连接（仍由后端逐连接校验）。 */
      form.connections = auth.isAdmin()
        ? availableConnections.value.slice(0, 1).map(c => c.id)
        : availableConnections.value.map(c => c.id);
      form.writeConnections = [];
    }
    if (!form.allowedTools.length) form.allowedTools = [...selectableTools.value];
  } catch (e: any) {
    keyErr.value = String(e?.message || e);
  } finally {
    keyLoading.value = false;
  }
}

async function createKey() {
  if (!canCreate.value || creating.value || !form.name.trim()) return;
  creating.value = true;
  keyErr.value = '';
  newSecret.value = '';
  try {
    const payload: any = {
      name: form.name.trim(),
      requestsPerMinute: Number(form.requestsPerMinute),
      dailyQuota: Number(form.dailyQuota),
      monthlyQuota: Number(form.monthlyQuota),
      expiresInDays: Number(form.expiresInDays),
      allowedTools: [...form.allowedTools],
    };
    if (auth.isAdmin()) {
      if (form.owner.trim()) payload.owner = form.owner.trim();
      payload.role = form.role;
    }
    payload.permissions = ['read'];
    payload.connections = [...form.connections];
    payload.connectionPermissions = Object.fromEntries(form.connections.map((id: string) => [
      id,
      form.writeConnections.includes(id) ? ['read', 'write'] : ['read'],
    ]));
    const data = await api.mcpKeys.create(payload);
    newSecret.value = String(data?.secret || '');
    newKey.value = data?.key || null;
    secretCopied.value = false;
    showCreate.value = false;
    await loadKeys();
  } catch (e: any) {
    keyErr.value = String(e?.message || e);
  } finally {
    creating.value = false;
  }
}

async function rotateKey(k: any) {
  if (!k?.id || !canRevoke(k)) return;
  if (!window.confirm(`轮换「${k.name}」？旧 key 会立即失效，新明文只显示一次。`)) return;
  try {
    const data = await api.mcpKeys.rotate(k.id);
    newSecret.value = String(data?.secret || '');
    newKey.value = data?.key || k;
    secretCopied.value = false;
    await loadKeys();
  } catch (e: any) {
    keyErr.value = String(e?.message || e);
  }
}

async function revokeKey(k: any) {
  if (!k?.id || !canRevoke(k)) return;
  if (!window.confirm(`撤销「${k.name}」？使用该 key 的客户端会立即收到 401。`)) return;
  try {
    await api.mcpKeys.revoke(k.id);
    await loadKeys();
  } catch (e: any) {
    keyErr.value = String(e?.message || e);
  }
}

async function copySecret() {
  try { await navigator.clipboard.writeText(newSecret.value); secretCopied.value = true; } catch { /* 用户可手动选择 */ }
}

function canRevoke(k: any) {
  return serverMode.value && k?.enabled && !k?.expired
    && (auth.isAdmin() || k.owner === auth.me?.username);
}

function statusText(k: any) {
  if (!k.enabled) return '已撤销';
  if (k.expired) return '已过期';
  return '启用';
}

function statusClass(k: any) {
  if (!k.enabled) return 'off';
  if (k.expired) return 'expired';
  return 'on';
}

function fmtTime(ms: number) {
  return new Date(Number(ms)).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

watch(selectableTools, () => {
  const allowed = new Set(selectableTools.value);
  form.allowedTools = form.allowedTools.filter(tool => allowed.has(tool));
});
watch(() => form.connections, () => {
  form.writeConnections = form.writeConnections.filter(id => form.connections.includes(id));
}, { deep: true });

function scopeLabel(k: any) {
  const map = k.connectionPermissions || {};
  const ids = Object.keys(map);
  if (!ids.length) return (k.permissions || ['read']).join('+');
  const writable = ids.filter(id => (map[id] || []).includes('write')).length;
  return writable ? `写 ${writable} / 共 ${(k.connections || ids).length}` : '全只读';
}

watch(() => props.show, (show) => {
  if (show) {
    resultText.value = '';
    if (tab.value === 'keys' && serverMode.value) loadKeys();
  }
});
</script>

<style scoped>
.mcp-panel { display: flex; flex-direction: column; gap: 12px; }
.mcp-banner { display: flex; align-items: flex-start; gap: 8px; padding: 2px 0 2px 10px; border: 0; border-left: 2px solid var(--ac); border-radius: 0; background: transparent; color: var(--tx1); font-size: var(--fs-sm); line-height: 1.6; }
.mcp-banner.browser { border-left-color: var(--warn); color: var(--tx1); }
.mcp-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ac-hi); margin-top: 6px; flex-shrink: 0; }
.mcp-banner.browser .mcp-dot { background: var(--warn); }
.mcp-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
.mcp-tab { border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--tx2); font-size: var(--fs-sm); padding: var(--sp-1h) var(--sp-2h); cursor: pointer; }
.mcp-tab:hover { color: var(--tx1); }
.mcp-tab.active { color: var(--ac-hi); border-bottom-color: var(--ac-hi); }
.mcp-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
.mcp-card { border: 0; border-radius: 0; padding: 0; background: transparent; min-width: 0; }
.mcp-card h3 { margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line); font-size: var(--fs-sm); color: var(--tx0); }
.mcp-hint { margin: var(--sp-2) 0 0; color: var(--tx2); font-size: var(--fs-xs); line-height: 1.6; }
.mcp-code, .mcp-result, .mcp-args { font-family: var(--mono); font-size: var(--fs-xs); line-height: 1.6; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-s); padding: var(--sp-2); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow: auto; }
.mcp-code { margin: var(--sp-2) 0 0; color: var(--tx1); }
.mcp-tools { display: flex; flex-direction: column; margin-bottom: 8px; max-height: 260px; overflow: auto; border: 1px solid var(--line); border-radius: var(--r-s); padding: 0 4px; }
.mcp-tool { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; padding: 6px 4px; background: transparent; color: var(--tx2); cursor: pointer; font-size: var(--fs-xs); }
.mcp-tool:last-child { border-bottom: 0; }
.mcp-tool:hover, .mcp-tool.active { background: var(--bg-alt); color: var(--tx1); }
.mcp-tool code { color: var(--ac-hi); font-size: var(--fs-xs); }
.mcp-tool span { font-size: var(--fs-xs); line-height: 1.4; }
.mcp-tool-line { display: flex; align-items: flex-start; gap: 5px; }
.mcp-kind { flex-shrink: 0; border-radius: 99px; padding: 0 5px; font-size: var(--fs-2xs); line-height: 1.5; background: var(--bg); border: 1px solid var(--line); color: var(--tx2); }
.mcp-kind.read { color: var(--ac-hi); border-color: var(--ac-line); }
.mcp-kind.write { color: var(--warn); border-color: var(--warn); }
.mcp-kind.rw { color: var(--tx1); border-color: var(--tx2); }
.mcp-copy { margin-top: 2px; }
.mcp-play { display: flex; flex-direction: column; gap: var(--sp-2); }
.mcp-play-row { display: flex; gap: var(--sp-2); align-items: center; }
.mcp-select { flex: 1; height: 30px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); padding: 0 8px; }
.mcp-args { min-height: 70px; max-height: 120px; width: 100%; box-sizing: border-box; resize: vertical; }
.mcp-result { margin: 0; color: var(--tx1); }
.mcp-boundary { border-color: var(--warn); }
.mcp-key-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3); }
.mcp-key-head h3 { margin: 0; font-size: var(--fs-sm); color: var(--tx0); }
.mcp-key-actions { display: flex; gap: var(--sp-2); flex-shrink: 0; }
.mcp-kpis { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 0 0 8px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; color: var(--tx2); font-size: var(--fs-xs); }
.mcp-kpis b { color: var(--tx0); font-weight: 600; }
.mcp-error { border: 1px solid var(--danger, #d03050); border-radius: var(--r-s); padding: var(--sp-2); color: var(--danger, #d03050); font-size: var(--fs-xs); line-height: 1.5; white-space: pre-wrap; }
.mcp-create { border: 1px solid var(--line); border-radius: var(--r-m); padding: 12px; background: var(--bg-alt); }
.mcp-create h3 { margin: 0 0 var(--sp-2); font-size: var(--fs-sm); color: var(--tx0); }
.mcp-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); }
.mcp-field { display: flex; flex-direction: column; gap: 4px; color: var(--tx2); font-size: var(--fs-xs); }
.mcp-field input, .mcp-field select { height: 30px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); padding: 0 8px; }
.mcp-scope-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--sp-3); margin-top: var(--sp-2); align-items: start; }
.mcp-scope { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-width: 0; }
.mcp-scope .mcp-check { width: 100%; min-width: 0; }
.mcp-scope .mcp-check code { margin-left: auto; max-width: 58%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; font-size: var(--fs-xs); opacity: .9; }
.mcp-tool-picks { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2); }
.mcp-field-label { color: var(--tx2); font-size: var(--fs-xs); }
.mcp-check { display: inline-flex; align-items: center; gap: 4px; color: var(--tx1); font-size: var(--fs-xs); }
.mcp-check code { color: var(--ac-hi); }
.mcp-write-toggle { margin-top: var(--sp-2); padding-top: var(--sp-2); border-top: 1px solid var(--line); }
.mcp-form-actions { margin-top: var(--sp-2); }
.mcp-secret { border: 1px solid var(--warn); border-radius: var(--r-m); padding: var(--sp-3); background: var(--bg-alt); }
.mcp-secret-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); color: var(--tx0); font-size: var(--fs-sm); }
.mcp-empty { border: 1px dashed var(--line); border-radius: var(--r-m); padding: var(--sp-3); color: var(--tx2); font-size: var(--fs-xs); text-align: center; }
.mcp-table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: var(--r-m); }
.mcp-table { table-layout: fixed; }
.mcp-table th:nth-child(1) { width: 190px; }
.mcp-table th:nth-child(2) { width: auto; }
.mcp-table th:nth-child(3) { width: 78px; }
.mcp-table th:nth-child(4) { width: 118px; }
.mcp-table th:nth-child(5) { width: 112px; }
.mcp-table th:nth-child(6) { width: 76px; }
.mcp-table th:nth-child(7) { width: 112px; }
.mcp-table td { white-space: nowrap; }
.mcp-table td:nth-child(1) code { display: block; overflow: hidden; text-overflow: ellipsis; }
.mcp-table td:nth-child(2) .mcp-muted { display: block; white-space: normal; line-height: 1.5; }
.mcp-table .mcp-state { white-space: nowrap; }
.mcp-table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.mcp-table th { text-align: left; font-weight: 600; color: var(--tx2); background: var(--bg-alt); padding: var(--sp-2); white-space: nowrap; }
.mcp-table td { padding: var(--sp-2); border-top: 1px solid var(--line); color: var(--tx1); vertical-align: top; }
.mcp-table code { color: var(--ac-hi); font-size: var(--fs-2xs); }
.mcp-muted { color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-state { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: var(--fs-2xs); font-weight: 600; }
.mcp-state.on { background: var(--ac-soft); color: var(--ac-hi); }
.mcp-state.off { background: var(--bg-alt); color: var(--tx2); }
.mcp-state.expired { background: var(--warn-soft, #fff7e6); color: var(--warn); }
.mcp-row-action { text-align: right; white-space: nowrap; }
@media (max-width: 720px) {
  .mcp-grid, .mcp-form-grid { grid-template-columns: 1fr; }
  .mcp-key-head { flex-direction: column; }
}
</style>
