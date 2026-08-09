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
    original: null,
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

function imageBasename(value = '') {
  try { return decodeURIComponent(String(value)).split(/[?#]/)[0].split(/[\\/]/).pop().toLowerCase(); }
  catch { return String(value).toLowerCase(); }
}

function assetMatches(asset, reference, alt = '') {
  const ref = imageBasename(reference);
  const name = imageBasename(asset.name);
  const assetAlt = imageBasename(asset.alt || '');
  const wanted = imageBasename(alt);
  return ref && (ref === name || ref === assetAlt || wanted === name || wanted === assetAlt || ref.includes(name) || name.includes(ref));
}

function normalizeImportedAsset(asset) {
  return {
    id: asset.id || crypto.randomUUID(),
    name: asset.name || '未命名图片',
    type: asset.type || 'image/png',
    size: Number(asset.size || 0),
    dataUrl: asset.dataUrl || '',
    alt: asset.alt || String(asset.name || '图片').replace(/\.[^.]+$/, '')
  };
}

function parseFrontMatter(lines) {
  if (lines[0]?.trim() !== '---') return { values: {}, lines };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) return { values: {}, lines };
  const values = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^\s*(title|subtitle)\s*:\s*(.*?)\s*$/i);
    if (match) values[match[1].toLowerCase()] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return { values, lines: lines.slice(end + 1) };
}

/**
 * Convert Markdown/plain text plus local assets into the document model.
 * The original source is retained so later human edits never destroy it.
 */
export function importArticle({ text = '', filename = 'article.md', assets = [] } = {}) {
  const source = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const parsed = parseFrontMatter(source.split('\n'));
  const lines = parsed.lines;
  const importedAssets = assets.map(normalizeImportedAsset);
  const usedAssets = new Set();
  const warnings = [];
  const blocks = [];
  let title = parsed.values.title || '';
  const subtitle = parsed.values.subtitle || '自动排版草稿 · 可继续人工编辑';
  let buffer = [];

  const flushParagraph = () => {
    const value = buffer.join('\n').trim();
    if (value) blocks.push({ id: crypto.randomUUID(), type: 'paragraph', text: value });
    buffer = [];
  };
  const addImage = (alt, reference) => {
    const cleanReference = String(reference).trim().replace(/^<|>$/g, '');
    let asset = importedAssets.find(item => assetMatches(item, cleanReference, alt));
    if (!asset && cleanReference.startsWith('data:image/')) {
      asset = normalizeImportedAsset({ name: alt || '内嵌图片', type: cleanReference.match(/^data:([^;]+)/)?.[1], dataUrl: cleanReference, alt });
      importedAssets.push(asset);
    }
    if (asset) usedAssets.add(asset.id);
    else warnings.push(`未找到图片素材：${alt || cleanReference}`);
    blocks.push({ id: crypto.randomUUID(), type: 'image', assetId: asset?.id || null, text: alt || asset?.alt || imageBasename(cleanReference) || '图片', source: cleanReference });
  };

  const nonEmptyIndex = lines.findIndex(line => line.trim());
  const firstLine = nonEmptyIndex >= 0 ? lines[nonEmptyIndex].trim() : '';
  const firstLineLooksLikeTitle = !title && firstLine && !/^#{1,6}\s|^>|^[-*+]\s|^\d+[.)]\s/.test(firstLine) && firstLine.length <= 80;
  const titleLineIndex = firstLineLooksLikeTitle ? nonEmptyIndex : -1;
  if (firstLineLooksLikeTitle) title = firstLine;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (index === titleLineIndex) return;
    if (!line.trim()) { flushParagraph(); return; }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      if (level === 1 && !title) title = heading[2].trim();
      else if (level > 1) blocks.push({ id: crypto.randomUUID(), type: 'heading', text: heading[2].trim(), level: Math.min(level, 3) });
      return;
    }
    const image = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (image) { flushParagraph(); addImage(image[1].trim(), image[2].trim()); return; }
    if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(line)) { flushParagraph(); return; }
    if (/^\s*>/.test(line)) {
      flushParagraph();
      const quoteLines = [line.replace(/^\s*>\s?/, '')];
      blocks.push({ id: crypto.randomUUID(), type: 'quote', text: quoteLines.join('\n').trim() });
      return;
    }
    const inlineImage = /!\[([^\]]*)\]\(([^)]+)\)/g;
    if (inlineImage.test(line)) buffer.push(line.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1').trim());
    else buffer.push(line);
  });
  flushParagraph();

  if (!title) title = '未命名公众号文章';
  const cover = importedAssets.find(asset => !usedAssets.has(asset.id) && /cover|封面/i.test(asset.name));
  if (cover) {
    blocks.unshift({ id: crypto.randomUUID(), type: 'image', assetId: cover.id, text: cover.alt || cover.name });
    usedAssets.add(cover.id);
  }
  for (const asset of importedAssets) {
    if (usedAssets.has(asset.id)) continue;
    blocks.push({ id: crypto.randomUUID(), type: 'image', assetId: asset.id, text: asset.alt || asset.name });
    warnings.push(`图片未在原文中引用，已追加到文章末尾：${asset.name}`);
  }
  if (!blocks.length && source.trim()) blocks.push({ id: crypto.randomUUID(), type: 'paragraph', text: source.trim() });

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    subtitle,
    blocks,
    assets: importedAssets,
    original: { filename, text: source, importedAt: now },
    meta: { createdAt: now, updatedAt: now, revision: 1, importedFrom: filename, importWarnings: warnings, layoutMode: 'auto' }
  };
}

export function getLayoutGuidance(doc) {
  const suggestions = [];
  const paragraphs = doc.blocks.filter(block => block.type === 'paragraph');
  const longParagraph = paragraphs.find(block => block.text.length > 260);
  if (!doc.title || doc.title === '未命名公众号文章') suggestions.push({ level: 'warning', text: '请补充一个明确标题。', command: '标题：输入文章标题' });
  if (longParagraph) suggestions.push({ level: 'review', text: '发现较长段落，建议拆分以提升手机阅读节奏。', command: '添加标题：本段重点' });
  const hasHeading = doc.blocks.some(block => block.type === 'heading');
  if (!hasHeading && paragraphs.length >= 3) suggestions.push({ level: 'review', text: '文章缺少章节层级，建议添加 1–3 个小标题。', command: '添加标题：章节标题' });
  const imageCount = doc.blocks.filter(block => block.type === 'image').length;
  if (imageCount > 5) suggestions.push({ level: 'review', text: `当前有 ${imageCount} 张图片，建议人工确认节奏和位置。`, command: '上移当前' });
  const missing = doc.blocks.filter(block => block.type === 'image' && !block.assetId);
  if (missing.length) suggestions.push({ level: 'error', text: `有 ${missing.length} 个图片引用未匹配素材，请补充同名文件。`, command: '' });
  if (!suggestions.length) suggestions.push({ level: 'ok', text: '当前结构适合继续人工微调。', command: '' });
  return suggestions;
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
    case 'replaceDocument': {
      const replacement = clone(intent.doc);
      return { doc: replacement, selectedId: replacement.blocks[0]?.id || null, changed: true };
    }
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
