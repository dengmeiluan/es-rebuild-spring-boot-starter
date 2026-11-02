<!-- 提交前请确认以下事项（详见 CONTRIBUTING.md） -->

## 改了什么 / 为什么

## 验证

- [ ] `mvn clean test -Dconsole.build.skip=true` 全绿（需先有 UI 构建产物）
- [ ] `cd ui && npm run typecheck` 0 错
- [ ] `cd ui && npm test` 全绿
- [ ] 新能力配 spec 锚（TDD 先红后绿）

## 补充

- [ ] 不含内部信息（内部端点 / 台账 / 项目名 / 凭据）
- [ ] 文档无占位符（TODO / TBD / 待补充 / 待完善）
