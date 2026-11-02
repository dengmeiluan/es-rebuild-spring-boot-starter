import { ref, watch, nextTick } from 'vue';
/** 命中游标。count 是 getter（通常传 () => filtered.length），
 * count 变化时自动维护 current 合法性：
 * — 0→n 落 1（刚出结果即定位首个）；
 * — 收缩且 current 超界 → 钳到新 count（保住「还在看的那条」尽量不跳）；
 * — 归零 → current=0（配合 HitNav 的「0 命中」空态）。 */
export function useHitNav(count) {
    /* 初值即合法位：count>0 落 1（mount 不会触发落位 watcher，首行不会无故高亮），
   count=0 落 0（「0 命中」空态） */
    const current = ref(count() > 0 ? 1 : 0);
    const next = () => {
        const n = count();
        current.value = n ? (current.value % n) + 1 : 0;
    };
    const prev = () => {
        const n = count();
        current.value = n ? ((current.value - 2 + n) % n) + 1 : 0;
    };
    const reset = () => { current.value = count() > 0 ? 1 : 0; };
    watch(count, n => {
        if (n <= 0)
            current.value = 0;
        else if (current.value === 0)
            current.value = 1;
        else if (current.value > n)
            current.value = n;
    });
    return { current, next, prev, reset };
}
/** 游标 → 行元素落位：滚动到视口中心 + 唯一 .hit-cur。
 * 返回 apply/clear 供调用方在列表重渲染后手动重放（如切 tab 回来）。 */
function useHitScroll(container) {
    let prevEl = null;
    function clear() {
        if (prevEl)
            prevEl.classList.remove('hit-cur');
        prevEl = null;
    }
    function apply(idx) {
        clear();
        if (!idx)
            return;
        const root = container();
        const el = root?.querySelector(`[data-hit-idx="${idx}"]`) || null;
        if (!el)
            return; // 行尚未渲染（懒渲染/被裁剪）时不炸，下次游标变化再试
        el.classList.add('hit-cur');
        prevEl = el;
        if (typeof el.scrollIntoView === 'function')
            el.scrollIntoView({ block: 'center' });
    }
    return { apply, clear };
}
/** useHitNav + useHitScroll 一步接好：游标变化 → nextTick 后滚动并高亮当前行。
 * count 与行 data-hit-idx 必须同一序（都在「过滤后的渲染序」上编号）。
 * 落位是「用户导航后」才发生的动作：异步数据 0→n 的自动归位不高亮首行
 * （counter 已示 n/n 位置，未导航就打焦点环会让用户误以为已定位）；
 * 导航后列表收缩/重渲染也保持落位（current 不变也要重放 apply）。 */
export function useHitLocate(count, container) {
    const nav = useHitNav(count);
    const { apply, clear } = useHitScroll(container);
    let touched = false;
    const next = () => { touched = true; nav.next(); };
    const prev = () => { touched = true; nav.prev(); };
    const rerun = () => { if (touched)
        nextTick(() => apply(nav.current.value)); };
    watch(() => nav.current.value, rerun);
    watch(count, rerun);
    return { ...nav, next, prev, apply, clear };
}
