---
name: wechat-layout
description: Edit and preview Chinese WeChat Official Account articles with the local-first document reducer, GUI harness, CLI commands, MCP stdio tools, undo/redo, local image assets, and HTML export. Use when working on 公众号排版、微信文章结构化编辑、图片插入或本地预览。
---

# 公众号排版 Skill — MVP v0.1

## Purpose

将自然语言编辑意图转换为公众号文章结构化编辑操作，并保持 GUI、文档状态、微信预览一致。

## State rule

- Document State 是唯一内容事实源。
- View State（例如 preview zoom）不得写入 Document State。
- 所有内容变更必须经由 Intent -> Reducer -> VersionStore。
- 每次有效内容变更自动写入 `revision + updatedAt`。

## Harness entry

浏览器运行时：`window.wechatLayoutHarness`

### Read

- `getState()`：返回完整文档快照。

### Write

- `applyText(text)`：提交中文自然语言编辑指令。
- `applyIntent(intent, label?)`：提交结构化 Intent。
- `addImage({name,type,dataUrl,alt})`：新图片进入素材库。
- `replaceSelectedImage(assetId)`：用素材库图片替换当前选中的图片区块。
- `deleteImage(assetId)`：从素材库删除素材，并同步移除文章/画廊中的对应图片引用；支持 undo/redo。
- `importArticle({text,filename,assets})`：导入 Markdown/TXT 与本地图片，自动总结正文、生成爆款标题候选、建立章节/段落/引用和图片块；浏览器导入还会把图片写入跨文章本地素材库。
- `autoComposeVisuals({generate,maxGenerated,titleMode,forceTitle,fillUnmatched})`：识别图片文件名、描述以及可选的 OCR/视觉标签，再根据文章语义生成摘要与爆款标题计划，自动将素材/本地创意图插入章节；`fillUnmatched:true` 会把剩余素材库图片按顺序补入正文。每个匹配图片区块会记录置信度、命中关键词、内容标签和识别来源，生成结果可人工替换、移动或删除。`forceTitle:true` 仅用于用户主动点击“生成爆款标题”，人工编辑过的标题默认锁定。
- `coverSet()`：根据封面与内容摘要设置区，优先复用素材库中的合规封面，置为文章首图并同步摘要；若没有合规封面才生成一个可替换候选，不重复导入已有素材。`smartCover()` 作为内部兼容别名保留。
- GUI 的“公众号封面与内容摘要”独立设置区提供封面素材选择、900×383 头条预览、主/副文案（10/14 字）和内容摘要（128 字）编辑；手工封面文案会锁定，重新执行智能设置可解除锁定并按正文重算。
- `optimizeWechat()`：按共享微信限制智能蒸馏正文，并同步优化标题、作者、内容摘要、封面主/副文案；预览按“封面 → 标题 → 作者/时间 → 内容摘要 → 正文”动态重排，结果可通过 undo/redo 回滚。
- `checkWechat()`：一键执行微信字段、正文、封面和排版检查；先自动修正可安全修正项，再返回仍需人工处理的问题。
- `selectBlock(id)`：GUI 选择块。
- `undo()` / `redo()`：版本回滚/重做。

## MVP Intents

```json
[
  {"type":"setTitle","text":"文章标题"},
  {"type":"setSubtitle","text":"副标题"},
  {"type":"appendBlock","blockType":"heading","text":"章节标题","level":2},
  {"type":"appendBlock","blockType":"paragraph","text":"正文"},
  {"type":"appendBlock","blockType":"quote","text":"引用"},
  {"type":"updateBlock","id":"block-id","text":"新内容"},
  {"type":"deleteSelected"},
  {"type":"moveSelected","direction":-1},
  {"type":"moveSelected","direction":1},
  {"type":"addAsset","asset":{"id":"asset-id","name":"cover.png","type":"image/png","size":0,"dataUrl":"data:image/png;base64,...","alt":"封面"}},
  {"type":"addAssets","assets":[{"id":"asset-id","name":"cover.png","type":"image/png","size":0,"dataUrl":"data:image/png;base64,...","alt":"封面"}]},
  {"type":"insertAsset","assetId":"asset-id"},
  {"type":"replaceSelectedAsset","assetId":"asset-id"},
  {"type":"deleteAsset","assetId":"asset-id"},
  {"type":"insertAssetByName","name":"cover"},
  {"type":"convertSelected","blockType":"quote"},
  {"type":"splitSelected"},
  {"type":"setTheme","theme":"editorial"},
  {"type":"setTheme","theme":"ink"},
  {"type":"setTheme","theme":"sunset"},
  {"type":"humanize","mode":"natural"},
  {"type":"autoComposeVisuals","generate":true,"maxGenerated":3,"titleMode":"viral"},
  {"type":"smartCover"},
  {"type":"optimizeWechat"}
]
```

## Natural-language examples

主题目录包含五套：极简、杂志、清新、墨韵、暖阳。切换主题会同步刷新工作区容器、编辑区、工具栏和右侧预览。

公众号预览固定保留封面图位置和内容摘要位置：已有首图作为封面，缺图时显示待补位提示；封面文案与摘要来自文档状态，优化后会同步刷新，不直接修改原稿。

- `标题：AI 时代的个人工作台`
- `副标题：从工具堆叠走向统一运行时`
- `添加标题：为什么需要统一排版层`
- `添加段落：这是正文内容`
- `添加引用：工具应该服务内容，而不是反过来。`
- `上移当前`
- `下移当前`
- `删除当前`
- `插入图片：cover`
- `替换当前图片：cover`
- `把当前改成引用`
- `拆分当前段落`
- `添加表格：指标|结果\n阅读量|1000`
- `主题：杂志`
- `主题：墨韵` / `主题：暖阳`
- `去 AI 味：自然`
- `智能配图`
- `封面一键设置`
- `爆款标题`
- `图片智能导入`
- `智能自动化优化修改执行微信公众号发布约束`
- `一键检测`

## Event

每次内容状态改变，页面派发：`wechat-layout:changed`。

## 公众号增长创作画像

`growth` 与 `growth-brief` 根据公众号定位、读者、语气、关键词和 CTA 生成合规检查、增长建议与创作简报。增长分数仅供人工编辑参考，不影响草稿安全边界，也不会自动发布。

```bash
npm run cli -- growth
npm run cli -- growth-brief
npm run cli -- wechat-optimize
```

Harness 还提供 `getGrowthProfile()`、`setGrowthProfile(profile)`、`analyzeGrowth(profile)` 和 `growthBrief(profile)`。

## CLI / MCP 接入

在项目根目录运行：

```bash
npm run cli -- init
npm run cli -- import --article article.md --images ./images
npm run cli -- import --text "文章内容" --image ./cover.png
npm run cli -- guidance
npm run cli -- cover --out .local-data/cover
npm run cli -- cover-import --image ./assets/covers/draftloom-wechat-preview-cover.jpg --width 900 --height 383
npm run cli -- visuals --max-generated 3
npm run cli -- cover-set
npm run cli -- viral-title
npm run cli -- assets-fill
npm run cli -- wechat-check
npm run cli -- text --text "标题：新的文章标题"
npm run cli -- humanize --mode natural
npm run cli -- export --out article.html
npm run cli -- publish --out .local-data/publish/latest
npm run cli -- draft-status
npm run cli -- draft-submit --confirm true
```

## 草稿箱发布工作流

按以下顺序执行：

1. 先完成文章导入、图片匹配、人工排版和微信兼容检查。
2. 导入文章、GUI 编辑、CLI/MCP Intent 执行时自动检查微信约束，不依赖用户先点击优化按钮；GUI 的“一键检测”会返回完整检查报告并自动修正安全项，CLI 使用 `wechat-check`，MCP 使用 `publishing_wechat_check`。也可点击 GUI 的“智能优化发布约束”、运行 `npm run cli -- wechat-optimize` 或调用 MCP `publishing_optimize_wechat` 重跑。点击“导出到微信草稿箱”或执行 `draft-submit` 时还会自动再检查一次。正文超限时先保护原稿并生成系列拆分计划，再蒸馏工作稿；蒸馏后合规即可提交，仍超限才阻止远程提交，不代替人工删文。
3. 编辑器、CLI、MCP 和服务端统一执行微信字段限制：标题 ≤32 字、作者 ≤16 字、摘要 ≤128 字、正文严格小于 20,000 字符且小于 1MiB，原文链接 ≤1KiB，单张图片 ≤10MiB；标题封面主文案 ≤10 字、副文案 ≤14 字，头条图 900×383、分享图 383×383，宽度 ≤1280px，封面使用 PNG/JPEG。
4. 调用 `draft-status` 检查本地服务是否配置 `WECHAT_ACCESS_TOKEN` 或 `WECHAT_APP_ID` + `WECHAT_APP_SECRET`。Windows 上通过 `npm run configure:local` 保存的 DPAPI 配置会在服务、CLI、MCP 启动时自动加载，后续无需重复输入 AppSecret。
5. 需要提交远程草稿箱时必须显式确认；未确认时只生成本地草稿包。超限文章可以导出本地包，但远程提交会被阻止。
6. 图片先上传为微信图文内图片，再创建草稿；不要把本地 Data URL 直接当作远程图片地址。正文大小按上传后的图片 URL 计量。
7. 首图作为封面上传为永久素材并写入 `thumb_media_id`；没有首图时必须先补封面，不能提交一个不可审核的空封面草稿。
8. 草稿进入公众号后台后，由人工在微信公众平台检查并一键发送。

封面辅助命令会按 900×383（头条）和 383×383（分享缩略图）生成 SVG 候选，并返回数字/痛点/反认知/悬念四种文案建议。若已有符合规则的 PNG/JPEG 封面，可用 `cover-import` 写入素材库、替换当前头条封面并同步文档的 `visualPlan.coverAssetId`：

```bash
npm run cli -- cover --out .local-data/cover --formula number
npm run cli -- cover --audit ./cover.png --width 900 --height 383
npm run cli -- cover-import --image ./cover.jpg --width 900 --height 383
```

二维码授权需要已配置的授权适配器。配置 `WECHAT_QR_AUTH_URL` 可显示授权入口，配置 `WECHAT_QR_IMAGE_URL` 可在 GUI 中直接显示二维码图片。用户点击“授权后自动上传草稿”并完成扫码后，适配器完成扫码与平台侧换证，只能通过本机 `POST /api/wechat/auth/callback` 提交 `{access_token, expires_in}`；GUI 检测到授权成功后自动上传图片并创建公众号草稿。凭据写入 `.local-data/wechat-auth.json`，下次启动自动复用。不允许伪造登录二维码、把 AppSecret 放进浏览器或把授权码转发到任意未审核服务。

GUI 的主流程是“导入文章+图片 → 自动总结/爆款标题 → 素材入库并智能填充 → 人工编排 → 导出到微信草稿箱”。“导入文章+图片”会复用本机跨文章素材库，上传的新图和自动生成图都会登记到素材库；图片上传会在浏览器端压缩大图后一次性写入，减少等待和本地存储占用。普通用户无需手动备份/恢复 JSON；完整文档状态仍由 `.local-data/document.json` 保存，并供 CLI/MCP/Agent 交换，不是微信发布格式。

素材区提供“我的素材 / 资源库 / 文字稿”三个页签：我的素材用于上传与管理当前素材，资源库用于本地复用，文字稿用于查看受保护的原稿。素材容量上限为 200 个，可搜索、排序、筛选未使用素材并清理；点击删除会同步移除文章中的图片引用，刷新后不会恢复。

“导出到微信草稿箱”未配置凭据时只生成本地草稿包；配置 `WECHAT_ACCESS_TOKEN` 或 `WECHAT_APP_ID` + `WECHAT_APP_SECRET` 后，经用户确认提交远程草稿接口，GUI 会显示可用的“提交到公众号草稿箱”按钮。官方公众号草稿接口不提供直接扫码登录，二维码授权只能通过另接的第三方授权适配器实现；适配器配置后 GUI 显示二维码/授权入口，扫码回调成功会自动上传图片并创建草稿。

MCP 客户端使用 `npm run mcp`，通过 JSON-RPC stdio 调用 `publishing_import`、`publishing_visual_compose`、`publishing_cover_set`、`publishing_guidance`、`publishing_cover`、`publishing_wechat_check`、`publishing_optimize_wechat`、`publishing_state`、`publishing_draft_status`、`publishing_draft_submit`、`publishing_apply_text`、`publishing_humanize`、`publishing_apply_intent`、`publishing_export` 和 `publishing_publish`。`publishing_cover_set` 会优先根据设置区从素材库复用或设置合规封面、置为首图并同步摘要；没有合规封面时才生成一个可替换候选，不重复导入已有素材；`publishing_visual_compose` 默认使用本地确定性 SVG fallback，不产生网络副作用；后续可替换为受控的图像生成 provider。SVG 适合本地预览，提交微信前需换成 PNG/JPEG 素材或使用已有永久封面 `WECHAT_COVER_MEDIA_ID`。`publishing_cover` 只生成候选文件与检查结果；`publishing_draft_submit` 必须传 `confirm: true` 才允许产生远程提交副作用。状态默认写入 `.local-data/document.json`，也可通过 `WECHAT_LAYOUT_DATA` 指定路径。
