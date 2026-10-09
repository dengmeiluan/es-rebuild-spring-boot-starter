import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAppStore } from './stores/app';
/* 真字体（本地打包，离线 fat jar 可用）：此前 font stack 里的 Inter/JetBrains Mono 从未真正加载，
   Windows 上实际渲染 Segoe UI/雅黑，是与 Linear/Vercel 第一眼差距的最大来源 */
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './theme.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

/* 三百八十一批：全局异常兜底——此前渲染异常/未捕获 Promise 拒绝直接白屏+控制台裸奔。
   完整堆栈进控制台（调试可用）；用户侧经 store.notify 弹一次（自带 R85 风暴抑制，
   轮询炸裂期不轰炸）。errorHandler 在 pinia/router 之后挂，store 已可用。 */
app.config.errorHandler = (err: unknown, _inst, info) => {
  console.error('[es-console] 渲染异常', err, '\n处理链:', info);
  try {
    useAppStore().notify('error', `页面渲染异常：${err instanceof Error ? err.message : String(err)}`);
  } catch { /* store 不可用时不二次炸 */ }
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('[es-console] 未捕获的 Promise 拒绝', e.reason);
});

app.mount('#app');

/* R92-B2：空闲预取 monaco 大分包（约 2.8MB，gzip 741KB）——首屏不驮，
   等 window load（首屏关键资源全落）后再进空闲队列预热，不和首屏抢带宽；
   首次进 DSL 工作台/Mapping 编辑时 chunk 已在缓存 */
const idlePrefetch = () => { import('./components/MonacoEditor.vue').catch(() => { /* 预取失败不影响主流程，进视图时再正常拉 */ }); };
const schedulePrefetch = () => {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(idlePrefetch, { timeout: 8000 });
  } else {
    setTimeout(idlePrefetch, 3000);
  }
};
if (document.readyState === 'complete') {
  schedulePrefetch();
} else {
  window.addEventListener('load', schedulePrefetch, { once: true });
}
