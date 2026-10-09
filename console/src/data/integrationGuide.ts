/* 2.6.5 接入文档（顶栏抽屉展示）：内容是数据不是模板——6 节覆盖接入全路径，
   版本号从 __STARTER_VERSION__（vite define 构建期注入，见 Task 5）单点拼装，
   升版本只改 pom，文档自动跟随。宿主侧代码片段按 宿主形态给出，接入方复制改包名即可。 */

export interface GuideSection {
  id: string;
  title: string;
  body: string;
}

/** starter 当前版本（构建期注入；vitest 同样经 define 注入，见 vitest.config.ts） */
export const STARTER_VERSION: string = __STARTER_VERSION__;

/** Maven 坐标单点拼装——所有节的坐标引用统一走这里 */
export function mavenCoordinate(): string {
  return 'io.github.dengmeiluan:es-rebuild-spring-boot-starter:' + STARTER_VERSION;
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'integration',
    title: '0. Mapping 集成文档索引',
    body: `业务应用（client）与 宿主 运维入口：

  docs/integration/README.md
  docs/integration/quickstart.md
  docs/integration/configuration-reference.md
  docs/integration/troubleshooting.md
  docs/integration/mapping-auto-register.md
  docs/integration/entity-mapping.md
  docs/integration/desired-state.md
  docs/integration/mapping-conflict-to-adhoc.md

client 默认配置：
  es.rebuild.mode: client
  es.rebuild.mapping.auto-register: startup
  es.rebuild.mapping.conflict-policy: fail
  es.rebuild.mapping.missing-index-policy: skip

期望配置页：/internal/es/index/desired-state.html
启动日志检索：MappingReconcile
冲突策略键：conflict-policy
冲突操作：USE_ADHOC_REBUILD`,
  },
  {
    id: 'maven',
    title: '1. 引入 Maven 依赖',
    body: `在宿主工程 pom.xml 中加入：

<dependency>
  <groupId>io.github.dengmeiluan</groupId>
  <artifactId>es-rebuild-spring-boot-starter</artifactId>
  <version>${STARTER_VERSION}</version>
</dependency>

坐标：${mavenCoordinate()}

注意：宿主若自带 ES 客户端栈，版本决定权在宿主（starter 侧 ES 依赖为 provided）。
目标集群 ES 7.10 时建议钉住 <elasticsearch.version>7.10.2</elasticsearch.version>，
否则 Spring Boot 默认仲裁到 7.17.x 与服务端存在兼容风险。`,
  },
  {
    id: 'static-page',
    title: '2. 静态页接入（免登录直达）',
    body: `starter 自带两个直达页（无需前端工程即可用）：

  /es-rebuild.html   —— ES 控制台（本面板）
  /es-xmigrate.html  —— 跨集群迁移向导

宿主 Security 只需放行静态路径与 API 前缀，鉴权由 starter 的 ConsoleAuthInterceptor 完成：

  .antMatchers("/internal/es/**").permitAll()
  .antMatchers("/es-rebuild.html", "/es-xmigrate.html", "/console/**").permitAll()

默认开启内置 token 鉴权（兜底账号 admin），可通过 es.rebuild.console.auth.enabled=false 关闭。`,
  },
  {
    id: 'iframe',
    title: '3. iframe 嵌入与鉴权委托',
    body: `嵌入宿主页面后，可实现「宿主登录态直通控制台、免二次登录」：

① 宿主后端实现 io.github.dengmeiluan.es.rebuild.auth.ConsoleAuthDelegate 并注册为 Spring Bean：
   - 从请求头 X-Es-Host-Token 读宿主凭证，认出则返回 ConsolePrincipal（含角色映射）
   - 认不出返回 null，自动交回控制台内置 token 鉴权（不视为失败）

② 宿主前端在 iframe 就绪握手后下发凭证：
   window.addEventListener('message', (e) => {
     if (e.data?.type === 'es-console-ready') {
       iframe.contentWindow.postMessage(
         { type: 'es-console-host-token', token: <宿主JWT> }, '*');
     }
   });

③ 凭证变化（重新登录）时重发同一消息即可，控制台会重新探测身份。`,
  },
  {
    id: 'auth',
    title: '4. 角色与页面级权限（菜单 SPI）',
    body: `控制台两级权限：

角色级（内置）：VIEWER 只读 / OPERATOR 可执行写操作 / ADMIN 全部 + 用户管理。
宿主委托鉴权时在 ConsolePrincipal 中下发 ConsoleRole。

页面级（2.5.0 菜单 SPI）：宿主可按 53 个功能页粒度授权。
ConsolePrincipal 第 7 参 grantedPages：
  null      —— 不启用页面级（全量放行，默认）
  空集合    —— 全拒（只看到 Forbidden 页）
  非空集合  —— 页面 key 白名单（key 清单见 META-INF/es-console-pages.json）

逃生阀：es.rebuild.console.page-auth.enabled=false 可整体关闭页面级拦截。`,
  },
  {
    id: 'menu-spi',
    title: '5. 菜单注册与主题跟随（宿主侧对接）',
    body: `【菜单注册】starter classpath 提供 io.github.dengmeiluan.es.rebuild.console.ConsolePageCatalog，
宿主启动时直读契约注册菜单（12 目录 + 53 页面按钮），perms 约定：
  ops:es-console:page:{页面key}

授权查询：从用户权限集合中筛 ops:es-console:page: 前缀、剥前缀即 grantedPages。
参考实现（宿主形态，复制后改包名）：

  Set<String> granted = new LinkedHashSet<>();
  for (String p : permsOfUser) {
    if (p.startsWith("ops:es-console:page:")) {
      granted.add(p.substring("ops:es-console:page:".length()));
    }
  }
  return new ConsolePrincipal(username, role, false, true, nickname, attrs, granted);

【主题跟随】iframe src 拼 ?hostTheme=dark|light 防首屏闪；
主题切换时 postMessage { type:'es-console-host-theme', mode:'dark'|'light' } 热切。
用户也可在控制台顶栏手切主题档反超宿主（host 档才吃热推）。`,
  },
];
