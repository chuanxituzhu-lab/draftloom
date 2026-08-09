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
| 导入 / 导出 | PASS | 文章+图片导入；JSON 备份/恢复；微信 HTML |
| 微信交付包 | PASS | GUI/CLI 生成 HTML、草稿 payload、manifest；配置凭据后可选远程接口 |
| 微信兼容 inline HTML | PASS | 草稿 HTML 不含 `<style>`，组件样式写入 inline `style` |
| 首图封面素材 | PASS | 远程草稿提交时首图上传永久素材并写入 `thumb_media_id` |
| 草稿箱导出入口 | PASS | GUI 检查本地授权配置，未配置时生成本地草稿包 |
| 草稿提交确认 | PASS | GUI、服务端、MCP/CLI 均要求显式确认；成功后提示人工审核发送 |
| 扫码适配器二维码显示 | PASS | `WECHAT_QR_AUTH_URL` / `WECHAT_QR_IMAGE_URL` 配置后 GUI 显示授权入口或二维码图片 |
| 本机授权持久化 | PASS | 适配器 POST `/api/wechat/auth/callback` 后写入 `.local-data/wechat-auth.json`，重启自动复用 |
| 授权后自动创建草稿 | PASS | GUI 确认“授权后自动上传草稿”后，授权状态变为成功即调用图片上传与 `draft/add` |
| 人工审核边界 | PASS | 返回 `draftId` 与 `reviewRequired`，不自动群发 |
| 自动测试 | PASS | Node test 13/13 |

## Frozen outside v0.1

云同步、多人协作、账号体系、复杂富文本样式模板市场、DOCX 解析，以及视频/音频/永久素材库管理。
