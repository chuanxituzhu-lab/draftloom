# Architecture — MVP v0.1

```text
文章 / 图片拖放 / CLI / MCP
            │
            ▼
      Article Importer
   importArticle() + asset match
            │
            ▼
      Intent Normalizer
        parseCommand()
            │
            ▼
      Document Reducer
     reduceDocument()
            │
       ┌────┴────┐
       ▼         ▼
 VersionStore   Persist
 seq+timestamp  localStorage
       │
       ▼
 Single Document State + Original
       │
 ┌─────┼──────────┐
 ▼     ▼          ▼
Guidance Editor  WeChat Preview
GUI     GUI       zoom-only
```

原则：文档状态是唯一内容事实源，`original` 保存导入原稿，`working copy` 经过 reducer 修改。预览缩放属于 View State，不进入文档状态，因此不会造成内容版本变化。未匹配或未引用图片不会静默丢弃，而是转为提示或追加到文章末尾，交给人工确认。
