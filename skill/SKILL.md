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
- `deleteImage(assetId)`：删除未被文章使用的素材；被引用素材需先替换或删除图片区块。
- `importArticle({text,filename,assets})`：导入 Markdown/TXT 与本地图片，自动生成标题、章节、段落、引用和图片块。
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
  {"type":"humanize","mode":"natural"}
]
```

## Natural-language examples

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
- `去 AI 味：自然`

## Event

每次内容状态改变，页面派发：`wechat-layout:changed`。

## 公众号增长创作画像

`growth` 与 `growth-brief` 根据公众号定位、读者、语气、关键词和 CTA 生成合规检查、增长建议与创作简报。增长分数仅供人工编辑参考，不影响草稿安全边界，也不会自动发布。

```bash
npm run cli -- growth
npm run cli -- growth-brief
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
2. 调用 `draft-status` 检查本地服务是否配置 `WECHAT_ACCESS_TOKEN` 或 `WECHAT_APP_ID` + `WECHAT_APP_SECRET`。
3. 需要提交远程草稿箱时必须显式确认；未确认时只生成本地草稿包。
4. 图片先上传为微信图文内图片，再创建草稿；不要把本地 Data URL 直接当作远程图片地址。
5. 首图作为封面上传为永久素材并写入 `thumb_media_id`；没有首图时必须先补封面，不能提交一个不可审核的空封面草稿。
6. 草稿进入公众号后台后，由人工在微信公众平台检查并一键发送。

封面辅助命令会按 900×383（头条）和 383×383（分享缩略图）生成 SVG 候选，并返回数字/痛点/反认知/悬念四种文案建议。它只提供人工审核候选，不自动决定最终封面：

```bash
npm run cli -- cover --out .local-data/cover --formula number
npm run cli -- cover --audit ./cover.png --width 900 --height 383
```

二维码授权需要已配置的授权适配器。配置 `WECHAT_QR_AUTH_URL` 可显示授权入口，配置 `WECHAT_QR_IMAGE_URL` 可在 GUI 中直接显示二维码图片。用户点击“授权后自动上传草稿”并完成扫码后，适配器完成扫码与平台侧换证，只能通过本机 `POST /api/wechat/auth/callback` 提交 `{access_token, expires_in}`；GUI 检测到授权成功后自动上传图片并创建公众号草稿。凭据写入 `.local-data/wechat-auth.json`，下次启动自动复用。不允许伪造登录二维码、把 AppSecret 放进浏览器或把授权码转发到任意未审核服务。

GUI 的主流程是“导入文章+图片 → 人工编排 → 导出到微信草稿箱”。“导入文章+图片”负责一次性建立文章结构和图片引用；素材库上传负责后续复用，两者不重复。图片上传会在浏览器端压缩大图后一次性写入素材库，减少等待和本地存储占用。JSON 仅用于本地备份和 Agent/MCP 交换，不是微信发布格式。

素材区提供“我的素材 / 资源库 / 文字稿”三个页签：我的素材用于上传与管理当前素材，资源库用于本地复用，文字稿用于查看受保护的原稿。素材容量上限为 200 个，可搜索、排序、筛选未使用素材并清理；正在文章中使用的素材不会被误删。

“导出到微信草稿箱”未配置凭据时只生成本地草稿包；配置 `WECHAT_ACCESS_TOKEN` 或 `WECHAT_APP_ID` + `WECHAT_APP_SECRET` 后，经用户确认提交远程草稿接口。官方公众号草稿接口不提供直接扫码登录，二维码授权只能通过另接的第三方授权适配器实现。

MCP 客户端使用 `npm run mcp`，通过 JSON-RPC stdio 调用 `publishing_import`、`publishing_guidance`、`publishing_cover`、`publishing_state`、`publishing_draft_status`、`publishing_draft_submit`、`publishing_apply_text`、`publishing_humanize`、`publishing_apply_intent`、`publishing_export` 和 `publishing_publish`。`publishing_cover` 只生成候选文件与检查结果；`publishing_draft_submit` 必须传 `confirm: true` 才允许产生远程提交副作用。状态默认写入 `.local-data/document.json`，也可通过 `WECHAT_LAYOUT_DATA` 指定路径。
