# 贡献指南

## 本地开发

使用 Node.js 22.12+ 和 npm，执行 `npm ci`、`npm run dev`。项目为文件驱动的静态 React/TypeScript 应用；请保持 TypeScript 严格检查，避免无关重构。

## 提交问题与改动

- Issue 请描述复现步骤、预期与实际行为、浏览器版本；截图和日志请移除私人信息。
- Pull Request 请说明问题、改动范围和实际验证结果。提交前运行 `npm test` 与 `npm run build`。
- 浏览器窗口尺寸模拟不能代替真实 iPad Safari 验证；请准确描述测试环境。

## 菜谱与资源

- `content/howtocook/` 是固定版本的上游副本，请保留原文与 LICENSE。更新使用 `npm run upstream:update -- --commit <完整 SHA>`，核对更新差异。
- 新增或个人改编菜谱放入 `content/personal/`，可使用 `npm run recipe:new -- --name "菜名" --category "分类"` 创建模板。
- ID 永久且全库唯一。缺失的时间、份数、用量或难度应留空，不要猜测。
- 图片使用内容目录内的相对路径，确保具备公开使用权。
- 不提交依赖目录、生成数据、构建产物、IDE 配置、密钥、私人配置或内部验收材料。

原创贡献采用仓库的 MIT 许可证；上游副本继续适用其原有 Unlicense。提交前请确认你有权公开并授权这些内容。
