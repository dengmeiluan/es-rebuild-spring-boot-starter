# QuoteHub 适配器示例

这个目录只放**可复制到宿主工程**的最小适配器，不参与本仓库构建。

- `SearchDeckIntegration.java`：品牌 + 默认功能包声明（`ConsoleHostIntegration`）。
- 完整接入面（鉴权委托、连接目录、菜单供给、审计贡献）见
  [docs/integrations/quotehub.md](../../docs/integrations/quotehub.md)。

复制后把包名改成宿主自己的包名即可；SearchDeck 不反向依赖宿主业务类。
