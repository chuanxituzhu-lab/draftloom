# 公众号排版 MVP v0.1.1

本地优先、无第三方依赖的公众号文章可视化排版 MVP。

版本号以 `package.json` 为唯一来源。运行 `npm run version:sync` 会同步界面徽标、MCP 服务版本、Harness 文档和 README；合并到 GitHub `main` 后，`.github/workflows/version-sync.yml` 会自动递增 patch 版本并提交回仓库。

## 已实现

- 文字指令 → 文档状态 → GUI/预览同步
- GUI 可视化直接编辑 → 文档状态 → 右侧预览同步
- 微信文章实时预览，60%–140% 独立缩放；缩放不修改文档数据
- 文章块新增 / 修改 / 删除 / 上下移动
- 本地图片素材库、点击插入文章
- Markdown / TXT + 多图片拖放导入，自动识别标题、章节、段落、引用和图片引用
- 内容驱动的智能视觉编排：自动提炼标题、生成标题图，并按章节语义匹配素材或生成本地创意 SVG 占位图
- 封面一键设置：根据封面与内容摘要设置区，智能复用素材库中的合规封面，置为文章首图并同步摘要
- 独立封面与摘要设置区：封面素材、900×383 头条比例、主/副文案和 ≤128 字摘要集中编辑，右侧预览按公众号顺序同步
- 智能标题工作流：从全文生成摘要和 5 个证据绑定的爆款标题候选，自动采用第一候选，人工选择任一候选后即锁定标题
- 跨文章本地素材库：导入的新图和自动生成创意图会自动入库；下一篇文章可按语义复用并自动填充，素材库容量 200 张
- 图片智能导入：点击“图片智能导入”会读取图片文件名、alt/描述以及可选的 OCR/视觉标签，识别图片内容后与章节语义匹配，将素材库中尚未使用的图片一键放到文章相应位置，支持回滚
- 主流程为“导入文章+图片 → 自动总结/配图/入库 → 人工编排 → 导出到微信草稿箱”；素材库可单独上传，也会接收导入与生成结果
- 自动排版指导面板：提示长段落、缺少层级、未匹配图片，并可一键带入人工指令
- PingPongGrowth 创作画像：按公众号定位、读者、语气和关键词分析文章，并生成标题/结构/CTA 建议
- 自然语言指导编辑：区块转换、长段落拆分、按序号修改、组件创建
- 本地 Humanizer：自然化 / 保守调整两种模式，原稿可回滚
- 冻结语义组件：列表、表格、CTA、画廊、媒体，并支持 Markdown/指令创建
- 五套 MVP 主题：极简、杂志、清新、墨韵、暖阳；切换主题会同步改变工作区、编辑器和右侧预览
- “一键检测”：按微信公众号字段、正文、封面和排版建议统一检查，先自动修正可安全修正项，再提示仍需人工处理的内容
- “智能优化发布约束”：点击后自动蒸馏正文、同步标题/作者/摘要/封面主副文案，并按“封面 → 标题 → 作者/时间 → 内容摘要 → 正文”动态重排公众号预览；原稿始终保留
- 封面辅助：按 900×383 / 383×383 规范生成 SVG 候选，检查比例与文件大小，最终由人工确认
- 微信交付包：导出微信兼容 HTML、草稿 payload 和 manifest；配置接口后可提交远程草稿
- Harness JS API，可由外部 Agent/自动化层调用
- 时间戳 + revision 序列号版本机制
- 最多 50 个编辑版本，支持 Undo / Redo
- localStorage 本地持久化
- 内部文档状态 JSON（供 CLI/MCP 与自动化交换；普通用户无需手动处理）
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
npm run cli -- cover --out .local-data/cover
npm run cli -- cover-import --image ./assets/covers/draftloom-wechat-preview-cover.jpg --width 900 --height 383
npm run cli -- visuals --max-generated 3
npm run cli -- cover-set
npm run cli -- viral-title
npm run cli -- assets-fill
npm run cli -- growth
npm run cli -- growth-brief
npm run cli -- wechat-check
npm run cli -- wechat-optimize
npm run cli -- text --text "标题：AI 时代的个人工作台"
npm run cli -- humanize --mode natural
npm run cli -- export --out article.html
npm run cli -- publish --out .local-data/publish/latest
npm run cli -- draft-status
npm run cli -- draft-submit --confirm true
npm run mcp
```

本机需要长期运行时，可先执行 `npm run configure:local` 以 DPAPI 加密保存凭据，再用 `npm run start:background` 后台启动；若希望 Windows 登录后自动启动，执行一次 `npm run autostart:install`。详见 `docs/BACKGROUND_RUN.md`。

浏览器中可将 `.md` / `.txt` 与多张图片一起拖入“导入文章+图片”区域。导入会先总结正文并以爆款模式生成标题候选，默认应用第一候选；首图作为封面，素材库已有图片会先读取文件名、描述、OCR/视觉标签等识别证据，再按章节语义自动填充，缺图章节生成本地 SVG 创意图。点击“封面一键设置”会优先从素材库智能复用符合微信头条比例的封面，把它置为文章首图，并根据封面与内容摘要设置区同步封面文案和摘要；不会重复导入已有素材，没有合规封面时才生成一个可人工替换的本地候选。点击“图片智能导入”会重新执行识别和匹配，并在图片区块上记录匹配置信度、命中关键词和识别来源，方便人工复核；点击“生成爆款标题”可只重算标题，点击候选标题即可采用并锁定；直接编辑标题也会锁定，后续自动编排不会覆盖。导入的新图和生成图会自动写入本机跨文章素材库，下次导入可直接复用。所有生成图片都标记为“可人工替换”，可在素材库中删除、替换或移动。Markdown 中的 `![说明](图片文件名)` 仍会优先尊重原文显式位置。没有配置外部视觉适配器时，识别使用本地文件名/描述规则，不伪造像素级识别；未来适配器可写入 `asset.vision.caption / ocrText / labels / tags / confidence` 后自动参与匹配。SVG 是本地预览占位图；若已制作 PNG/JPEG 封面，可用 `cover-import` 导入素材库并替换当前头条封面，再执行 `wechat-check` 验证后提交微信，或配置已有的 `WECHAT_COVER_MEDIA_ID`。普通用户不需要备份/恢复 JSON，文章会自动保存在浏览器本地；CLI/MCP 仍可通过 `.local-data/document.json` 交换完整状态。

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

编辑器、CLI、MCP 和服务端提交共用 `src/wechat-limits.js` 的微信兼容校验：标题 ≤32 字、作者 ≤16 字、摘要 ≤128 字、正文严格小于 20,000 字符且小于 1MiB，原文链接 ≤1KiB，单张图片 ≤10MiB；标题封面主文案 ≤10 字、副文案 ≤14 字，头条图按 900×383（2.35:1）、分享图按 383×383（1:1）检查，宽度不超过 1280px，封面格式统一限制为 PNG/JPEG。GUI 会实时显示计数；超限时仍可导出本地草稿包，但远程提交按钮和接口都会阻止提交并提示具体字段。正文中的本地图片 Data URL 按上传微信后的图片 URL 计量，避免把本地 Base64 误判为正文大小。

`growth` 和 `growth-brief` 来源于 `pingpong-growth-pipeline` 的合规/增长分层设计：增长分数只提供人工建议，不影响草稿安全边界，也不会自动发布。详见 `docs/GROWTH_INTEGRATION.md`。

导入文章、GUI 编辑、CLI/MCP Intent 执行时会自动检查并处理微信约束，不需要先点击优化按钮；GUI 的“一键检测”会立即重跑完整检查并自动修正可安全修正项，CLI 对应 `npm run cli -- wechat-check`，MCP 对应 `publishing_wechat_check`。点击“智能优化发布约束”会进一步蒸馏正文、更新自动摘要、同步封面文案，并刷新右侧公众号页面结构。点击“导出到微信草稿箱”或执行 `draft-submit` 时还会再做一次提交前检查。正文超过微信上限时会先保护原稿、生成可回滚的系列拆分建议，再对工作稿进行蒸馏提炼；蒸馏后的版本符合规则即可进入草稿箱，仍超限时才阻止远程提交，绝不静默删字。修改记录会写入文档状态，供人工继续调整。MCP 客户端对应调用 `publishing_optimize_wechat`，也可通过文字指令“智能自动化优化修改执行微信公众号发布约束”触发。

GUI 的“导出到微信草稿箱”会先检查本地服务配置：未配置凭据时只生成可回滚的本地草稿包；配置 `WECHAT_ACCESS_TOKEN` 或 `WECHAT_APP_ID` + `WECHAT_APP_SECRET` 后，用户确认才提交远程草稿接口。通过 `npm run configure:local` 保存过的 Windows DPAPI 配置会在 `npm start`、CLI、MCP 启动时自动加载，因此下次启动无需再次输入 AppSecret。二维码授权需要一个已配置的授权适配器：

```powershell
$env:WECHAT_QR_AUTH_URL="https://你的授权适配器/authorize"
$env:WECHAT_QR_IMAGE_URL="https://你的授权适配器/qr.png" # 可选：直接显示二维码图片
npm start
```

当二维码适配器已配置时，点击“授权后自动上传草稿”并完成扫码，适配器完成平台侧换证，只需向本机 `POST /api/wechat/auth/callback` 提交 `{ "access_token": "...", "expires_in": 7200 }`。GUI 检测到授权成功后会自动上传文章图片并创建公众号草稿，返回草稿编号；凭据写入被 `.gitignore` 排除的 `.local-data/wechat-auth.json`，服务重启后自动复用。若本机已加载 AppID/AppSecret，界面会直接显示“提交到公众号草稿箱”，不要求扫码。不能在前端伪造扫码流程，也不能把 AppSecret 放入浏览器。

## Harness API

页面加载后暴露：

```js
window.wechatLayoutHarness.getState()
window.wechatLayoutHarness.applyText('添加标题：第二部分')
window.wechatLayoutHarness.applyIntent({ type: 'appendBlock', blockType: 'paragraph', text: '正文' })
window.wechatLayoutHarness.addImage({ name: 'cover.png', dataUrl: 'data:image/png;base64,...' })
window.wechatLayoutHarness.applyText('去 AI 味：自然')
window.wechatLayoutHarness.applyText('主题：清新')
window.wechatLayoutHarness.applyText('主题：墨韵')
window.wechatLayoutHarness.autoComposeVisuals({ maxGenerated: 3 })
window.wechatLayoutHarness.optimizeWechat()
window.wechatLayoutHarness.checkWechat()
window.wechatLayoutHarness.undo()
window.wechatLayoutHarness.redo()
```

状态变化时触发浏览器事件：`wechat-layout:changed`。

## 当前 MVP 边界

没有云同步、账号系统、复杂样式市场或 DOCX 解析。创意图默认使用本地确定性 SVG，不自动调用外部模型；后续可通过视觉生成适配器替换 `src/visuals.js` 的本地 provider。微信交付已提供本地兼容包和可配置的远程草稿接口适配层；视频、音频和永久素材库管理仍保持在 MVP v0.1 边界之外。
