# Architecture — MVP v0.1

```text
Agent / Harness / 用户文字指令
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
 Single Document State
       │
 ┌─────┼──────────┐
 ▼     ▼          ▼
Outline Editor  WeChat Preview
GUI     GUI       zoom-only
```

原则：文档状态是唯一内容事实源。预览缩放属于 View State，不进入文档状态，因此不会造成内容版本变化。
