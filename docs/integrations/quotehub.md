# QuoteHub 接入 SearchDeck

> 首个接入方：QuoteHub（`D:\idea_project\quotehub`，产线 `139.196.51.46:7788/quotehub`）。
> 本文记录「宿主怎么接、平台怎么裁、升级怎么验」，页面契约的 page key 保持零变更。

## 1. 接入面总览

| QuoteHub 现有组件 | 作用 | SearchDeck 契约 |
|---|---|---|
| `EsConsoleAuthDelegate` | 宿主 JWT → 控制台身份与角色 | `ConsoleAuthDelegate` / `ConsolePrincipal` |
| `LinkMenuProvisioner` | 页面契约 → 宿主菜单与角色授权 | `ConsolePageCatalog`（52 个 page key 不变） |
| `ConnectionCenterEsConnContributor` | 连接中心 → 控制台连接目录 | `ConnStore` / `ClusterConnContributor` |
| `EsConsoleConnSyncWiring` | 连接目录同步 | `LinkLifecycleEvent` |
| `EsConsoleAuditContributor` | 宿主操作流水并入控制台审计 | `ConsoleAuditContributor`（可选） |
| 新增 `SearchDeckIntegration` | 品牌 + 默认功能包 | `ConsoleHostIntegration` |

**结论**：鉴权、菜单、连接目录三件套不需要重写；新增的只有一个品牌/功能包声明的 Bean。

## 2. 平台配置

```yaml
searchdeck:
  console:
    branding:
      product-name: SearchDeck
      tagline: Search operations, on deck.
      integration-id: quotehub
      integration-name: QuoteHub
    features:
      # 空 = 全部 11 个包；显式列表 = 只暴露这些包（顺序按契约，不按此列表）
      packs:
        - platform
        - search
        - index
        - quality
        - data
        - text
        - relevance
        - lifecycle
        - observe
        - security
        - devtools
      # 单页再排除（例如不需要审计页时只留账号页）
      exclude-pages: []
  elasticsearch:
    mode: console
    console:
      store: sqlite
```

- `searchdeck.console.*` 是平台层；`searchdeck.elasticsearch.*` 是引擎层，两者互不覆盖。
  一代 `es.rebuild.*` 键仍可用（`SearchDeckConfigAliasPostProcessor` 透明桥接）。
- 配置拼错的处理：未知包名 WARN 后忽略；显式列表全部未知时**启动失败**，避免静默空导航。
- 前端导航、命令面板、数字/字母快捷键、深链守卫共用同一份运行时配置
  （`GET /internal/es/index/ui/config`）。

### 功能包与分组

| Pack | 分组 | 页面数 |
|---|---|---|
| `platform` | core | 5 |
| `search` | search | 3 |
| `index` | index | 5 |
| `quality` | quality | 5 |
| `data` | data | 3 |
| `text` | text | 4 |
| `relevance` | rank | 6 |
| `lifecycle` | rebuild + protect | 8 |
| `observe` | health + cluster | 9 |
| `security` | security | 1 |
| `devtools` | devx | 3 |

## 3. 宿主适配器 Bean

```java
package com.quotehub.admin.integration;

import io.github.dengmeiluan.es.rebuild.platform.ConsoleHostIntegration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;
import java.util.List;

@Configuration
public class SearchDeckIntegration {

    @Bean
    public ConsoleHostIntegration searchDeckQuoteHubIntegration() {
        return new ConsoleHostIntegration() {
            @Override public String id() { return "quotehub"; }
            @Override public String displayName() { return "QuoteHub"; }
            @Override public String tagline() { return "搜索运维，即刻上甲板。"; }
            /** 仅当 searchdeck.console.features.packs 未显式配置时生效。 */
            @Override public List<String> preferredPacks() {
                return Arrays.asList("platform", "search", "index", "data",
                        "lifecycle", "observe", "security", "devtools");
            }
        };
    }
}
```

> 示例不硬编码 QuoteHub 业务字段；pack 列表只是产品面选择。宿主自己的角色/页面授权
> 仍由 `grantedPages` 决定，功能包不会提权。

如果 QuoteHub 的菜单注册器也想按 pack 裁剪，可在 `LinkMenuProvisioner` 中：

```java
ConsolePageCatalog catalog = ConsolePageCatalog.load();
for (ConsolePageCatalog.Page page : catalog.getPages()) {
    ConsolePageCatalog.Pack pack = catalog.packOfPage(page.getKey());
    if (pack == null || !enabledPacks.contains(pack.getId())) continue;
    // 继续按既有规则注册菜单
}
```

## 4. 去掉 QA 期日志/操作审计

用户明确说「原来基于 QA 的日志和 QA 操作审计记录都可以不要」。落法：

1. **不再注册** `EsConsoleAuditContributor` Bean（宿主操作流水不再并入控制台审计）；
2. 在 `features.exclude-pages` 加 `security`，或在 `packs` 中不列 `security`，
   控制台不再暴露安全中心（账号/权限面/审计页）；
3. 若只想保留账号管理、不要审计：保留 `security` pack，前端后续可再拆出 `audit` 子页
   （阶段 2 的 pack 细化项，不在本次范围）；
4. 历史 QA 审计**数据**不迁移；控制台自身的 `ConsoleOpsAuditStore` 仍可保留，
   但页面不可见、不再产生新的宿主贡献记录。网关如要彻底封死，可拒绝
   `/internal/es/index/auth/ops-audit*`（保留 `/auth/ops-audit/mine` 自助面则按需放行）。

## 5. 升级与验收清单

> 2026-11-02 本地验证：QuoteHub `mvn compile` 通过；六个接入契约测试 49 例全绿。

- [ ] 依赖替换为 `io.github.dengmeiluan:searchdeck-console:2.0.0`（传递 `searchdeck-platform`）；
- [ ] `EsConsoleAuthDelegate` / `LinkMenuProvisioner` / 连接中心贡献者编译通过；
- [ ] `LinkMenuProvisionerTest` 的 page key 集合仍为 52（packs 不改变 page key）；
- [ ] `/internal/es/index/ui/config` 返回 `integrationId=quotehub`、预期 packs；
- [ ] 三账号矩阵（ADMIN / OPERATOR / VIEWER）菜单可见面与 `grantedPages` 一致；
- [ ] 连接切换矩阵：`conn:{id}:{page}` 键不因功能包裁剪而误放行；
- [ ] 深链 `/search`、`/security` 在停用 pack 时落到 `ModuleOff`，不出现空白/404；
- [ ] 宿主 iframe 握手、主题热切、登出清理回归。

## 6. 回滚

- 功能包配置改回空列表（全开）即可恢复完整控制台，无需回滚版本；
- 品牌配置改回默认 `SearchDeck` / `generic`；
- 宿主审计贡献 Bean 重新注册即可恢复审计合并。
