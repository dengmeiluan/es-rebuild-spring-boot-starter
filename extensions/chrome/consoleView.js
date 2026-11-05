/* ESQueryStudio extension — full console host. The real 52-page UI is loaded
 * unmodified from a reachable ESQueryStudio/QuoteHub console endpoint. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'esquerystudio.ext.consoleUrl';
  const DEFAULT_URL = 'http://localhost:5601/esquerystudio/index.html';

  function app() { return window.ESApp; }

  function value() {
    const v = $('consoleUrl').value.trim();
    if (!v) throw new Error('请输入完整控制台地址');
    if (!/^https?:\/\//i.test(v)) throw new Error('只支持 http/https 控制台地址');
    return v;
  }

  function load() {
    try {
      const url = value();
      localStorage.setItem(KEY, url);
      $('consoleFrame').src = url;
      $('consoleNote').textContent = '已加载：' + url + '。若空白，目标站点可能禁止 iframe；请用「新标签打开」。';
    } catch (e) { app().toast(String(e.message || e), true); }
  }

  function openTab() {
    try {
      const url = value();
      localStorage.setItem(KEY, url);
      if (window.chrome && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
      else window.open(url, '_blank', 'noopener');
    } catch (e) { app().toast(String(e.message || e), true); }
  }

  function init() {
    $('consoleUrl').value = localStorage.getItem(KEY) || DEFAULT_URL;
    $('consoleLoadBtn').onclick = load;
    $('consoleOpenTabBtn').onclick = openTab;
  }
  window.ESConsoleView = { init };
})();
