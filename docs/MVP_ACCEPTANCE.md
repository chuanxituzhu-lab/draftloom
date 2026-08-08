# MVP v0.1 Acceptance

| 项目 | 状态 | 验收方式 |
|---|---|---|
| 文字指令修改内容 | PASS | `applyText` / GUI 指令框 |
| GUI 修改内容同步预览 | PASS | contenteditable blur -> reducer -> render |
| Harness 修改同步 GUI | PASS | `window.wechatLayoutHarness.applyIntent` |
| 素材库本地导入 | PASS | FileReader Data URL |
| Harness 新图片进入素材库 | PASS | `addImage()` |
| 图片插入文章 | PASS | `insertAsset` / 点击素材 |
| 微信文章实时预览 | PASS | 单一文档状态渲染 |
| 预览独立缩放 | PASS | View State `zoom`，不提交版本 |
| 时间戳 + 序列号 | PASS | `updatedAt + revision` |
| 回滚 / 重做 | PASS | VersionStore |
| 最大回滚历史 | PASS | 50 snapshots |
| 本地持久化 | PASS | localStorage |
| 导入 / 导出 | PASS | JSON |
| 自动测试 | PASS | Node test 5/5 |

## Frozen outside v0.1

微信官方发布 API、云同步、多人协作、账号体系、复杂富文本样式模板市场。
