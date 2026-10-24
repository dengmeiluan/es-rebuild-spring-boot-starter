import { ref, watch } from 'vue';
import { removeStoredRaw, writeStoredRaw } from '../utils/safeJson';
const PREFIX = 'es-console.draft2';
/** 凭据样键（大小写不敏感）命中即掩埋其值，防误粘贴的连接串/配置带密码落盘 */
const CREDENTIAL_KEY_RE = /("(?:[^"]*(?:password|passwd|secret|token|api[_-]?key|authorization|auth)[^"]*)"\s*:\s*")([^"]*)(")/gi;
/** 掩埋 JSON-ish 文本里的凭据值；非 JSON 原样返回（尽力而为，不保证语法安全） */
export function redactDraft(raw) {
    if (!raw)
        return raw;
    return raw.replace(CREDENTIAL_KEY_RE, (_m, head, _v, tail) => head + '***' + tail);
}
export function draftStorageKey(scope, field) {
    const t = (scope.target?.() || 'host').trim() || 'host';
    const i = (scope.index?.() || '-').trim() || '-';
    const m = (scope.mode?.() || '-').trim() || '-';
    return `${PREFIX}:${scope.route}:${t}:${i}:${m}:${field}`;
}
function readRaw(key) {
    try {
        return sessionStorage.getItem(key);
    }
    catch {
        return null;
    }
}
function writeRaw(key, v) {
    if (v == null)
        removeStoredRaw(sessionStorage, key);
    else
        writeStoredRaw(sessionStorage, key, v);
}
/** 单字段文本草稿（Monaco/JsonArea/textarea 的 model） */
export function useScopedDraft(field, scope, defVal = '') {
    const key = draftStorageKey(scope, field);
    const raw = readRaw(key);
    const restored = ref(raw != null && raw !== defVal);
    const text = ref(restored.value ? raw : defVal);
    watch(text, v => {
        restored.value = false; // 用户已开始编辑，恢复提示移除
        writeRaw(key, v && v !== defVal ? redactDraft(v) : null);
    });
    return {
        text,
        restored,
        clear: () => { text.value = defVal; restored.value = false; writeRaw(key, null); },
    };
}
/** 多字段表单对象草稿（deep watch；JSON 相等默认值即清除） */
export function useScopedDraftState(field, scope, defVal) {
    const key = draftStorageKey(scope, field);
    /* 默认值先做快照并克隆初始态：若直接以调用方的 defVal 对象作 state，调用方深改
   state.value 时 defVal 同引用被连带改写，「等于默认」判定恒真 → 草稿永远写不进
   （对象别名坑）。快照还保证 clear() 复位的默认值不带上一轮的残留。 */
    const defSnap = JSON.stringify(defVal);
    const cloneDef = () => JSON.parse(defSnap);
    let init = cloneDef();
    let wasRestored = false;
    try {
        const raw = sessionStorage.getItem(key);
        if (raw != null) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                init = parsed;
                wasRestored = JSON.stringify(parsed) !== defSnap;
            }
        }
    }
    catch { /* 坏值回落默认 */ }
    const restored = ref(wasRestored);
    const state = ref(init);
    watch(state, v => {
        restored.value = false;
        const s = JSON.stringify(v);
        writeRaw(key, s === defSnap ? null : redactDraft(s));
    }, { deep: true });
    return {
        state,
        restored,
        clear: () => { state.value = cloneDef(); restored.value = false; writeRaw(key, null); },
    };
}
