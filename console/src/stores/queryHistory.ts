import { defineStore } from 'pinia';
import { ref } from 'vue';

/* 跨模式查询历史——六个查询通道共用一份带 mode 维度的历史。
   此前只有 DSL 有历史（es_query_hist，条目无 mode 字段），其余通道零历史、零跨模式。
   统一收敛到本 store：localStorage es_query_hist_v2，条目带 mode/query/index/ts，
   查询工作台（QueryHubView）顶部抽屉回放。语法桥是转换工具非查询，不写入。 */

interface QueryHistItem {
  id: string;
  mode: string;
  query: string;
  index?: string;
  ts: number;
  took?: number; // 查询耗时（毫秒）-  慢查询回溯与调优对比
  /** 上次执行失败标记（false=上次失败）——历史条目红点提示+重试入口语义 */
  ok?: boolean;
}

const KEY = 'es_query_hist_v2';
const LEGACY_KEY = 'es_query_hist';
/** 迁移只做一次：即使之后用户清空 v2 也不反复把 DSL 旧历史倒灌回来 */
const MIGRATED_KEY = KEY + '.migrated';
const MAX = 100;

function genId(): string {
  return 'qh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function isItem(x: any): x is QueryHistItem {
  return !!x && typeof x === 'object'
    && typeof x.mode === 'string'
    && typeof x.query === 'string'
    && typeof x.ts === 'number';
}

function normalize(x: QueryHistItem): QueryHistItem {
  return {
    id: typeof x.id === 'string' && x.id ? x.id : genId(),
    mode: x.mode,
    query: x.query,
    index: typeof x.index === 'string' && x.index ? x.index : undefined,
    ts: x.ts,
    took: typeof x.took === 'number' && x.took >= 0 ? x.took : undefined,
  };
}

/** 旧 DSL 历史（es_query_hist）→ v2 条目。返回 null 表示无需迁移（已迁过 / v2 已有内容 / 无旧数据）。 */
function migrateIfNeeded(): QueryHistItem[] | null {
  if (localStorage.getItem(MIGRATED_KEY) === '1') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return null; // v2 已有内容，不覆盖
    }
  } catch { /* 坏 v2 按空处理，允许迁移 */ }

  /* 标记已尝试迁移（无论旧数据是否可用），避免坏旧值导致每次 load 重试 */
  try { localStorage.setItem(MIGRATED_KEY, '1'); } catch { /* 存储满容忍 */ }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    if (!Array.isArray(legacy)) return null;
    const mapped: QueryHistItem[] = [];
    for (const e of legacy) {
      if (e && typeof e === 'object' && typeof e.dsl === 'string') {
        mapped.push({
          id: genId(),
          mode: 'dsl',
          query: e.dsl,
          index: typeof e.idx === 'string' && e.idx ? e.idx : undefined,
          ts: typeof e.ts === 'number' ? e.ts : Date.now(),
        });
      }
    }
    if (!mapped.length) return null;
    const out = mapped.slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(out));
    return out;
  } catch { return null; }
}

function load(): QueryHistItem[] {
  const migrated = migrateIfNeeded();
  if (migrated) return migrated;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(isItem).map(normalize).slice(0, MAX);
    }
  } catch { /* 坏值回落 [] */ }
  return [];
}

export const useQueryHistoryStore = defineStore('queryHistory', () => {
  const items = ref<QueryHistItem[]>(load());

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(items.value)); } catch { /* 存储满容忍 */ }
  }

  /** 记录一次查询执行：同 mode+query+index 去重（移到最前并刷新 ts），否则 unshift 新条目，上限 100 */
  function push(mode: string, query: string, index?: string, took?: number, ok = true) {
    const q = query ?? '';
    const idx = index?.trim() || undefined;
    const i = items.value.findIndex(it => it.mode === mode && it.query === q && (it.index || '') === (idx || ''));
    if (i >= 0) {
      const [it] = items.value.splice(i, 1);
      it.ts = Date.now();
      if (typeof took === 'number' && took >= 0) it.took = took; // 更新耗时
      it.ok = ok; // ：失败标记随最近一次执行结果刷新
      items.value.unshift(it);
    } else {
      items.value.unshift({ id: genId(), mode, query: q, index: idx, ts: Date.now(), took, ok });
    }
    if (items.value.length > MAX) items.value.length = MAX;
    persist();
  }

  function clear() {
    items.value = [];
    persist();
  }

  /* 导入合并（导出闭环的消费方）——按 mode+query+index 去重（已有条目保留；
     新条目 genId+保留原 ts），合并后按 ts 新→旧排序并裁到上限。返回 { added, skipped } */
  function mergeFrom(list: any[]): { added: number; skipped: number } {
    let added = 0, skipped = 0;
    for (const raw of (Array.isArray(list) ? list : [])) {
      const it = isItem(raw) ? raw : null;
      if (!it || !it.query) { skipped++; continue; }
      const dup = items.value.find(x => x.mode === it.mode && x.query === it.query && (x.index || '') === (it.index || ''));
      if (dup) { skipped++; continue; }
      items.value.unshift({ ...it, id: genId(), ts: it.ts || Date.now() });
      added++;
    }
    items.value.sort((a, b) => b.ts - a.ts);
    if (items.value.length > MAX) items.value.length = MAX;
    persist();
    return { added, skipped };
  }

  /*  按 id 单条删除——此前只有全清，错条/敏感条只能连坐清除 */
  function removeOne(id?: string | number) {
    if (id == null) return;
    const i = items.value.findIndex(it => it.id === id);
    if (i >= 0) { items.value.splice(i, 1); persist(); }
  }

  return { items, push, clear, removeOne, mergeFrom };
});
