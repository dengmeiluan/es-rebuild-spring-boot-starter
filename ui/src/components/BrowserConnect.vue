<template>
  <Teleport to="body">
    <div v-if="show" class="bc-mask" role="dialog" aria-modal="true" aria-label="连接 Elasticsearch">
      <div class="bc-card">
        <div class="bc-kicker">ESQueryStudio · BROWSER MODE</div>
        <h2>连接 Elasticsearch</h2>
        <p class="bc-sub">纯前端模式：查询直接从浏览器发往集群；凭据只保存在本机扩展存储。</p>
        <label class="bc-label">集群地址</label>
        <input v-model.trim="url" class="ipt bc-ipt mono" placeholder="http://es-host:9200" @keyup.enter="connect" />
        <div class="bc-row">
          <div><label class="bc-label">用户名（可选）</label><input v-model.trim="username" class="ipt bc-ipt" autocomplete="off" /></div>
          <div><label class="bc-label">密码（可选）</label><input v-model="password" type="password" class="ipt bc-ipt" autocomplete="off" /></div>
        </div>
        <div v-if="err" class="bc-err" role="alert">{{ err }}</div>
        <div class="bc-actions">
          <button class="btn ghost" @click="close">稍后</button>
          <button class="btn primary" :disabled="busy || !url" @click="connect">{{ busy ? '连接中…' : '连接' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { isBrowserMode } from '../platform/browserApi';

const show = ref(false);
const url = ref('http://localhost:9200');
const username = ref('');
const password = ref('');
const busy = ref(false);
const err = ref('');

function connect() {
  if (!url.value) return;
  busy.value = true; err.value = '';
  try {
    localStorage.setItem('esquerystudio.browser.profile', JSON.stringify({
      url: url.value.replace(/\/+$/, ''), username: username.value, password: password.value,
    }));
    location.reload();
  } catch (e) {
    err.value = String((e as any)?.message || e); busy.value = false;
  }
}
function close() { show.value = false; }
onMounted(() => {
  if (!isBrowserMode) return;
  try { show.value = !JSON.parse(localStorage.getItem('esquerystudio.browser.profile') || 'null')?.url; } catch { show.value = true; }
});
</script>

<style scoped>
.bc-mask { position: fixed; inset: 0; z-index: 12000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.62); backdrop-filter: blur(6px); }
.bc-card { width: 460px; max-width: 92vw; padding: 24px; border-radius: 14px; background: #111819; border: 1px solid rgba(200,240,235,.16); box-shadow: 0 24px 70px rgba(0,0,0,.5); }
.bc-kicker { font-size: 10px; letter-spacing: 1.6px; color: #1fc8b4; }
.bc-card h2 { margin: 6px 0 4px; font-size: 20px; color: #e2eeea; }
.bc-sub { margin: 0 0 14px; font-size: 11px; line-height: 1.6; color: #6f8b83; }
.bc-label { display: block; margin: 8px 0 4px; font-size: 11px; color: #a8beb8; }
.bc-ipt { width: 100%; }
.bc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bc-err { margin-top: 10px; color: #fecaca; font-size: 11px; }
.bc-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
