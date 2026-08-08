# 公众号排版 MVP v0.1

本地优先、无第三方依赖的公众号文章可视化排版 MVP。

## 已实现

- 文字指令 → 文档状态 → GUI/预览同步
- GUI 可视化直接编辑 → 文档状态 → 右侧预览同步
- 微信文章实时预览，60%–140% 独立缩放；缩放不修改文档数据
- 文章块新增 / 修改 / 删除 / 上下移动
- 本地图片素材库、点击插入文章
- Harness JS API，可由外部 Agent/自动化层调用
- 时间戳 + revision 序列号版本机制
- 最多 50 个编辑版本，支持 Undo / Redo
- localStorage 本地持久化
- JSON 导入 / 导出
- Node 原生测试，无第三方运行依赖

## 启动

```bash
cd wechat-layout-mvp
npm run test
npm start
```

浏览器打开：`http://127.0.0.1:4173`

## Harness API

页面加载后暴露：

```js
window.wechatLayoutHarness.getState()
window.wechatLayoutHarness.applyText('添加标题：第二部分')
window.wechatLayoutHarness.applyIntent({ type: 'appendBlock', blockType: 'paragraph', text: '正文' })
window.wechatLayoutHarness.addImage({ name: 'cover.png', dataUrl: 'data:image/png;base64,...' })
window.wechatLayoutHarness.undo()
window.wechatLayoutHarness.redo()
```

状态变化时触发浏览器事件：`wechat-layout:changed`。

## 当前 MVP 边界

没有接微信官方发布 API，没有云同步，没有账号系统，没有富文本复杂样式面板。上述内容保持在 MVP v0.1 冻结边界之外。
