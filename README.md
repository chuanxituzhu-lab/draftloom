# 公众号排版 MVP v0.1

本地优先、无第三方依赖的公众号文章可视化排版 MVP。

## 已实现

- 文字指令 → 文档状态 → GUI/预览同步
- GUI 可视化直接编辑 → 文档状态 → 右侧预览同步
- 微信文章实时预览，60%–140% 独立缩放；缩放不修改文档数据
- 文章块新增 / 修改 / 删除 / 上下移动
- 本地图片素材库、点击插入文章
- Markdown / TXT + 多图片拖放导入，自动识别标题、章节、段落、引用和图片引用
- 主流程为“导入文章+图片 → 人工编排 → 导出到微信草稿箱”；素材库上传用于后续复用，不与文章导入重复
- 自动排版指导面板：提示长段落、缺少层级、未匹配图片，并可一键带入人工指令
- 自然语言指导编辑：区块转换、长段落拆分、按序号修改、组件创建
- 本地 Humanizer：自然化 / 保守调整两种模式，原稿可回滚
- 冻结语义组件：列表、表格、CTA、画廊、媒体，并支持 Markdown/指令创建
- 三套 MVP 主题：极简、杂志、清新
- 微信交付包：导出微信兼容 HTML、草稿 payload 和 manifest；配置接口后可提交远程草稿
- Harness JS API，可由外部 Agent/自动化层调用
- 时间戳 + revision 序列号版本机制
- 最多 50 个编辑版本，支持 Undo / Redo
- localStorage 本地持久化
- JSON 备份 / 恢复（用于本地备份与 Agent/MCP 交换，不作为微信发布格式）
- Node 原生测试，无第三方运行依赖

## 启动

```bash
cd wechat-layout-mvp
npm run test
npm start
```

浏览器打开：`http://127.0.0.1:4173`

CLI / MCP 接入：

```bash
npm run cli -- import --article article.md --images ./images
npm run cli -- import --text "文章内容" --image ./cover.png
npm run cli -- guidance
npm run cli -- text --text "标题：AI 时代的个人工作台"
npm run cli -- humanize --mode natural
npm run cli -- export --out article.html
npm run cli -- publish --out .local-data/publish/latest
npm run cli -- draft-status
npm run cli -- draft-submit --confirm true
npm run mcp
```

浏览器中可将 `.md` / `.txt` 与多张图片一起拖入“导入文章+图片”区域。Markdown 中的 `![说明](图片文件名)` 会自动匹配素材；未在原文引用的图片会追加到文末并提示人工确认。导入后可直接编辑标题、段落、图片顺序，或使用“自动排版指导”面板带入文字指令。

常用文字指令包括：

```text
把当前改成引用
第 3 段改成标题：关键结论
拆分当前段落
添加表格：指标|结果\n阅读量|1000
添加 CTA：继续阅读|打开文章|https://example.com
主题：杂志
去 AI 味：自然
```

`publish` 默认只生成本地交付包，不会上传。`draft-submit` 必须显式传 `--confirm true`；接入微信公众号草稿时可设置 `WECHAT_ACCESS_TOKEN`，或设置 `WECHAT_APP_ID` + `WECHAT_APP_SECRET`（也兼容压缩包中的 `WX_APPID` / `WX_APPSECRET`）让 CLI 临时获取 Token；也可用 `WECHAT_DRAFT_API_URL` 指向自有适配层。配置凭据后，正文图片会先上传为图文内图片，首图会上传为永久素材封面并取得 `thumb_media_id`，也可通过 `WECHAT_COVER_MEDIA_ID` 复用已有封面，再提交草稿；输出 HTML 使用 inline style，Token 不写入文档或输出结果。

GUI 的“导出到微信草稿箱”会先检查本地服务配置：未配置凭据时只生成可回滚的本地草稿包；配置 `WECHAT_ACCESS_TOKEN` 或 `WECHAT_APP_ID` + `WECHAT_APP_SECRET` 后，用户确认才提交远程草稿接口。二维码授权需要一个已配置的授权适配器：

```powershell
$env:WECHAT_QR_AUTH_URL="https://你的授权适配器/authorize"
$env:WECHAT_QR_IMAGE_URL="https://你的授权适配器/qr.png" # 可选：直接显示二维码图片
npm start
```

点击“授权后自动上传草稿”并完成扫码后，适配器完成平台侧换证，只需向本机 `POST /api/wechat/auth/callback` 提交 `{ "access_token": "...", "expires_in": 7200 }`。GUI 检测到授权成功后会自动上传文章图片并创建公众号草稿，返回草稿编号；凭据写入被 `.gitignore` 排除的 `.local-data/wechat-auth.json`，服务重启后自动复用。不能在前端伪造扫码流程，也不能把 AppSecret 放入浏览器。

## Harness API

页面加载后暴露：

```js
window.wechatLayoutHarness.getState()
window.wechatLayoutHarness.applyText('添加标题：第二部分')
window.wechatLayoutHarness.applyIntent({ type: 'appendBlock', blockType: 'paragraph', text: '正文' })
window.wechatLayoutHarness.addImage({ name: 'cover.png', dataUrl: 'data:image/png;base64,...' })
window.wechatLayoutHarness.applyText('去 AI 味：自然')
window.wechatLayoutHarness.applyText('主题：清新')
window.wechatLayoutHarness.undo()
window.wechatLayoutHarness.redo()
```

状态变化时触发浏览器事件：`wechat-layout:changed`。

## 当前 MVP 边界

没有云同步、账号系统、复杂样式市场或 DOCX 解析。微信交付已提供本地兼容包和可配置的远程草稿接口适配层；视频、音频和永久素材库管理仍保持在 MVP v0.1 边界之外。
