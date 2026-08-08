export const MAX_HISTORY = 50;

export function createInitialDocument() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: '未命名公众号文章',
    subtitle: '用文字指令与可视化编辑器共同完成排版',
    blocks: [
      { id: crypto.randomUUID(), type: 'heading', text: '从这里开始', level: 2 },
      { id: crypto.randomUUID(), type: 'paragraph', text: '左侧管理结构和素材，中间编辑内容，右侧实时查看微信文章效果。' },
      { id: crypto.randomUUID(), type: 'quote', text: '预览缩放只改变观看比例，不改变文章内容。' }
    ],
    assets: [],
    meta: { createdAt: now, updatedAt: now, revision: 1 }
  };
}

export function clone(value) {
  return structuredClone(value);
}

export function stamp(doc, revision) {
  doc.meta.updatedAt = new Date().toISOString();
  doc.meta.revision = revision;
  return doc;
}

export function parseCommand(input) {
  const raw = input.trim();
  if (!raw) return { type: 'noop' };

  let m;
  if ((m = raw.match(/^(?:标题|设置标题)[：:]?\s*(.+)$/i))) return { type: 'setTitle', text: m[1].trim() };
  if ((m = raw.match(/^(?:副标题|设置副标题)[：:]?\s*(.+)$/i))) return { type: 'setSubtitle', text: m[1].trim() };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?(?:二级)?标题[：:]?\s*(.+)$/i))) return { type: 'appendBlock', blockType: 'heading', level: 2, text: m[1].trim() };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?段落[：:]?\s*(.+)$/i))) return { type: 'appendBlock', blockType: 'paragraph', text: m[1].trim() };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?引用[：:]?\s*(.+)$/i))) return { type: 'appendBlock', blockType: 'quote', text: m[1].trim() };
  if ((m = raw.match(/^删除(?:当前|选中)(?:块|段落|内容)?$/i))) return { type: 'deleteSelected' };
  if (/^(?:上移|向上移动)(?:当前|选中)?/i.test(raw)) return { type: 'moveSelected', direction: -1 };
  if (/^(?:下移|向下移动)(?:当前|选中)?/i.test(raw)) return { type: 'moveSelected', direction: 1 };
  if ((m = raw.match(/^插入图片[：:]?\s*(.+)$/i))) return { type: 'insertAssetByName', name: m[1].trim() };
  return { type: 'appendBlock', blockType: 'paragraph', text: raw };
}

export function reduceDocument(doc, intent, selectedId = null) {
  const next = clone(doc);
  let selected = selectedId;
  let changed = true;

  switch (intent.type) {
    case 'noop': return { doc, selectedId, changed: false };
    case 'setTitle': next.title = intent.text; break;
    case 'setSubtitle': next.subtitle = intent.text; break;
    case 'appendBlock': {
      const block = { id: crypto.randomUUID(), type: intent.blockType, text: intent.text };
      if (intent.level) block.level = intent.level;
      next.blocks.push(block); selected = block.id; break;
    }
    case 'updateBlock': {
      const block = next.blocks.find(b => b.id === intent.id);
      if (!block || block.text === intent.text) return { doc, selectedId, changed: false };
      block.text = intent.text; selected = block.id; break;
    }
    case 'deleteSelected': {
      if (!selectedId) return { doc, selectedId, changed: false };
      const index = next.blocks.findIndex(b => b.id === selectedId);
      if (index < 0) return { doc, selectedId, changed: false };
      next.blocks.splice(index, 1);
      selected = next.blocks[index]?.id || next.blocks[index - 1]?.id || null;
      break;
    }
    case 'moveSelected': {
      const index = next.blocks.findIndex(b => b.id === selectedId);
      const target = index + intent.direction;
      if (index < 0 || target < 0 || target >= next.blocks.length) return { doc, selectedId, changed: false };
      [next.blocks[index], next.blocks[target]] = [next.blocks[target], next.blocks[index]];
      break;
    }
    case 'addAsset': {
      if (next.assets.some(a => a.id === intent.asset.id)) return { doc, selectedId, changed: false };
      next.assets.push(intent.asset); break;
    }
    case 'insertAssetByName': {
      const asset = next.assets.find(a => a.name.toLowerCase().includes(intent.name.toLowerCase()));
      if (!asset) return { doc, selectedId, changed: false, error: `未找到素材：${intent.name}` };
      const block = { id: crypto.randomUUID(), type: 'image', assetId: asset.id, text: asset.alt || asset.name };
      next.blocks.push(block); selected = block.id; break;
    }
    case 'insertAsset': {
      const asset = next.assets.find(a => a.id === intent.assetId);
      if (!asset) return { doc, selectedId, changed: false, error: '素材不存在' };
      const block = { id: crypto.randomUUID(), type: 'image', assetId: asset.id, text: asset.alt || asset.name };
      next.blocks.push(block); selected = block.id; break;
    }
    case 'replaceDocument': return { doc: clone(intent.doc), selectedId: null, changed: true };
    default: changed = false;
  }
  return { doc: next, selectedId: selected, changed };
}

export class VersionStore {
  constructor(doc, max = MAX_HISTORY) {
    this.max = max;
    this.history = [{ seq: 1, ts: doc.meta.updatedAt, label: '初始化', doc: clone(doc) }];
    this.future = [];
  }
  commit(doc, label = '编辑') {
    const seq = (this.history.at(-1)?.seq || 0) + 1;
    const snapshot = { seq, ts: new Date().toISOString(), label, doc: clone(stamp(clone(doc), seq)) };
    this.history.push(snapshot);
    if (this.history.length > this.max) this.history.shift();
    this.future = [];
    return clone(snapshot.doc);
  }
  undo(current) {
    if (this.history.length <= 1) return current;
    const popped = this.history.pop();
    this.future.push(popped);
    return clone(this.history.at(-1).doc);
  }
  redo(current) {
    const snapshot = this.future.pop();
    if (!snapshot) return current;
    this.history.push(snapshot);
    return clone(snapshot.doc);
  }
  list() { return this.history.map(({ seq, ts, label }) => ({ seq, ts, label })); }
}
