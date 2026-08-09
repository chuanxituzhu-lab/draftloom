# MVP v0.1 Acceptance

| 项目 | 状态 | 验收方式 |
|---|---|---|
| 文字指令修改内容 | PASS | `applyText` / GUI 指令框 |
| GUI 修改内容同步预览 | PASS | contenteditable blur -> reducer -> render |
| Harness 修改同步 GUI | PASS | `window.wechatLayoutHarness.applyIntent` |
| 素材库本地导入 | PASS | FileReader Data URL |
| Harness 新图片进入素材库 | PASS | `addImage()` |
| 图片插入文章 | PASS | `insertAsset` / 点击素材 |
| 文章 + 图片批量导入 | PASS | Markdown/TXT 拖放或 CLI `import` |
| 自动结构识别 | PASS | 标题、章节、段落、引用、列表、表格、CTA/画廊/媒体 fenced block |
| 自动排版指导 | PASS | 长段落、缺少层级、未匹配图片提示 |
| 自然语言指导编辑 | PASS | 区块转换、段落拆分、主题与组件指令 |
| Humanizer | PASS | 自然化 / 保守调整，原稿可回滚 |
| MVP 主题 | PASS | 极简、杂志、清新 |
| 微信文章实时预览 | PASS | 单一文档状态渲染 |
| 预览独立缩放 | PASS | View State `zoom`，不提交版本 |
| 时间戳 + 序列号 | PASS | `updatedAt + revision` |
| 回滚 / 重做 | PASS | VersionStore |
| 最大回滚历史 | PASS | 50 snapshots |
| 本地持久化 | PASS | localStorage |
| 导入 / 导出 | PASS | JSON + HTML |
| 微信交付包 | PASS | `publish` 生成 HTML、草稿 payload、manifest；可选远程接口 |
| 自动测试 | PASS | Node test 10/10 |

## Frozen outside v0.1

云同步、多人协作、账号体系、复杂富文本样式模板市场、DOCX 解析，以及视频/音频/永久素材库管理。
