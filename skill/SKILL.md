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
  {"type":"insertAsset","assetId":"asset-id"},
  {"type":"insertAssetByName","name":"cover"}
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

## Event

每次内容状态改变，页面派发：`wechat-layout:changed`。

## CLI / MCP 接入

在项目根目录运行：

```bash
npm run cli -- init
npm run cli -- text --text "标题：新的文章标题"
npm run cli -- export --out article.html
```

MCP 客户端使用 `npm run mcp`，通过 JSON-RPC stdio 调用 `publishing_state`、`publishing_apply_text`、`publishing_apply_intent` 和 `publishing_export`。状态默认写入 `.local-data/document.json`，也可通过 `WECHAT_LAYOUT_DATA` 指定路径。
