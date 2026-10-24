import { ref, onActivated, onDeactivated, onBeforeUnmount } from 'vue';
/* P1-4：结果自动刷新（dbx auto-refresh 对位——档位关/10s/30s/60s，不默认开）。
 生命周期收口：KeepAlive onActivated/onDeactivated + 页面 visibilitychange + onBeforeUnmount
 全链停/续（QueryHub 二级 KeepAlive 会双触发 activated——start 幂等：先 stop 再排新表）；
 tick 时再验 guard（dbx 同款「触发时再验 canRefresh」）——调用方把「保存中/加载中/有
 待提交编辑」挂进 guard，被跳过不补跑（下个周期自然再试）。 */
export function useAutoRefresh(fn, opts) {
    const on = ref(false);
    let timer = null;
    /* 初始化盲区收口（533 静默失效类②变体）——此前恒按可见初始化，
   后台标签页首载（document.hidden 已 true）时无 visibilitychange 可听，
   首个 visibilitychange 前轮询照跑；改读实值让 hidden 短路在首轮 tick 前生效 */
    let pageVisible = !document.hidden;
    let compActive = true;
    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }
    function start() {
        stop();
        const ms = opts.ms();
        if (!on.value || !ms || ms <= 0)
            return;
        timer = setInterval(async () => {
            /* tick 时再验：页面隐藏/组件失活/调用方 guard（running、挂起编辑）任一不满足即跳过 */
            if (!on.value || !pageVisible || !compActive)
                return;
            if (opts.guard && !opts.guard())
                return;
            await fn();
        }, ms);
    }
    function setOn(v) {
        on.value = v;
        if (v)
            start();
        else
            stop();
    }
    function restart() { if (on.value)
        start(); }
    onActivated(() => { compActive = true; if (on.value)
        start(); });
    onDeactivated(() => { compActive = false; stop(); });
    function onVis() {
        pageVisible = !document.hidden;
        if (pageVisible && on.value && compActive)
            start();
        else
            stop();
    }
    document.addEventListener('visibilitychange', onVis);
    onBeforeUnmount(() => {
        stop();
        document.removeEventListener('visibilitychange', onVis);
    });
    return { on, setOn, restart, stop };
}
