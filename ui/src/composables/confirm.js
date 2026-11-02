import { reactive } from 'vue';
import { writeStoredRaw } from '../utils/safeJson';
export const confirmState = reactive({
    show: false,
    title: '',
    message: '',
    level: 'warn',
    guardText: '',
    okText: '确认执行',
    facts: [],
    dismissable: false,
});
/* W10：会话级跳过键前缀。title 可能含动态标识符且可能很长，
 键取 djb2 哈希 base36（sessionStorage 键无可读性诉求，短键防配额浪费） */
const SKIP_PREFIX = 'es_confirm_skip:';
export function confirmTitleHash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}
export function isConfirmSkipped(title) {
    try {
        return sessionStorage.getItem(SKIP_PREFIX + confirmTitleHash(title)) === '1';
    }
    catch {
        return false;
    }
}
export function rememberConfirmSkip(title) {
    writeStoredRaw(sessionStorage, SKIP_PREFIX + confirmTitleHash(title), '1');
}
let resolver = null;
export function askConfirm(opts) {
    // 极端情况：上一个确认还没落就来了新请求——旧的按「取消」收掉，避免 Promise 悬挂
    resolver?.(false);
    // W10：同标题已被「本次会话不再询问」放过 → 直接 resolve true 不弹。
    // 仅显式 dismissable 的调用参与；critical/guardText 由 ConfirmModal 不给 checkbox 兜底。
    if (opts.dismissable && isConfirmSkipped(opts.title))
        return Promise.resolve(true);
    Object.assign(confirmState, { level: 'warn', message: '', guardText: '', okText: '确认执行', facts: [], dismissable: false }, opts, { show: true });
    // opts.facts 显式 undefined 时 Object.assign 会把数组覆盖回 undefined——统一规范成空数组（防上次残留串扰）
    confirmState.facts = opts.facts ?? [];
    return new Promise(res => { resolver = res; });
}
export function resolveConfirm(v) {
    confirmState.show = false;
    resolver?.(v);
    resolver = null;
}
