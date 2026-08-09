export const MAX_HISTORY = 50;

export const THEMES = Object.freeze({
  minimal: { id: 'minimal', label: '极简', accent: '#07c160', surface: '#f5f7f8', ink: '#303a43', heading: 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif' },
  editorial: { id: 'editorial', label: '杂志', accent: '#9a5b35', surface: '#fbf4ec', ink: '#3f3027', heading: 'Georgia,"Songti SC","SimSun",serif' },
  fresh: { id: 'fresh', label: '清新', accent: '#218a9b', surface: '#effafa', ink: '#21464b', heading: 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif' }
});

export function normalizeTheme(theme = 'minimal') {
  const value = String(theme).trim().toLowerCase();
  if (THEMES[value]) return value;
  const aliases = { '极简': 'minimal', '杂志': 'editorial', '编辑': 'editorial', '清新': 'fresh' };
  return aliases[String(theme).trim()] || 'minimal';
}

export function humanizeText(value = '', mode = 'natural') {
  let text = String(value).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const conservative = [
    [/^众所周知[，,、]\s*/g, ''],
    [/^值得注意的是[，,、]\s*/g, ''],
    [/在这个过程中/g, '在这个过程中'],
    [/在这样的情况下/g, '在这种情况下']
  ];
  const natural = [
    [/^众所周知[，,、]\s*/g, ''],
    [/^值得注意的是[，,、]\s*/g, ''],
    [/^总的来说[，,、]?\s*/g, ''],
    [/^综上所述[，,、]?\s*/g, ''],
    [/在这个过程中/g, '过程中'],
    [/在这种情况下/g, '此时'],
    [/进行(分析|讨论|介绍|说明)/g, '$1'],
    [/我们可以看到/g, '可以看到']
  ];
  for (const [pattern, replacement] of (mode === 'conservative' ? conservative : natural)) text = text.replace(pattern, replacement);
  if (mode !== 'conservative' && text.length > 180) text = text.replace(/([。！？!?])\s*/g, '$1\n');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function humanizeDocument(doc, mode = 'natural') {
  const next = clone(doc);
  let changedBlocks = 0;
  next.title = humanizeText(next.title, mode);
  next.subtitle = humanizeText(next.subtitle, mode);
  next.blocks = next.blocks.map(block => {
    if (!['heading', 'paragraph', 'quote', 'cta'].includes(block.type)) return block;
    const text = humanizeText(block.text, mode);
    if (text !== block.text) { changedBlocks += 1; return { ...block, text }; }
    return block;
  });
  next.meta = { ...next.meta, humanizer: { mode, changedBlocks, appliedAt: new Date().toISOString() } };
  return next;
}

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
    theme: 'minimal',
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
    const match = line.match(/^\s*(title|subtitle|theme)\s*:\s*(.*?)\s*$/i);
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
  const theme = normalizeTheme(parsed.values.theme || 'minimal');
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

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    if (index === titleLineIndex) continue;
    if (!line.trim()) { flushParagraph(); continue; }

    const fenced = line.match(/^\s*:::(table|cta|gallery|media)\s*$/i);
    if (fenced) {
      flushParagraph();
      const kind = fenced[1].toLowerCase();
      const payload = [];
      let cursor = index + 1;
      while (cursor < lines.length && lines[cursor].trim() !== ':::') { payload.push(lines[cursor]); cursor += 1; }
      const values = {};
      for (const payloadLine of payload) {
        const match = payloadLine.match(/^\s*([a-zA-Z]+)\s*:\s*(.*?)\s*$/);
        if (match) values[match[1].toLowerCase()] = match[2];
      }
      if (kind === 'table') {
        const rows = payload.filter(item => item.includes('|')).map(item => item.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
        if (rows.length) blocks.push({ id: crypto.randomUUID(), type: 'table', text: values.title || '数据表格', headers: rows[0], rows: rows.slice(1) });
      } else if (kind === 'cta') {
        blocks.push({ id: crypto.randomUUID(), type: 'cta', text: values.text || payload.find(item => item.trim()) || '欢迎继续阅读', buttonText: values.button || '立即了解', href: values.url || values.href || '' });
      } else if (kind === 'media') {
        blocks.push({ id: crypto.randomUUID(), type: 'media', text: values.text || '媒体内容', mediaType: values.type || 'video', url: values.url || payload.find(item => item.trim()) || '' });
      } else {
        const names = (values.images || payload.join(',')).split(/[,，]/).map(item => item.trim()).filter(Boolean);
        const assetIds = names.map(name => importedAssets.find(asset => assetMatches(asset, name, name))?.id).filter(Boolean);
        assetIds.forEach(id => usedAssets.add(id));
        blocks.push({ id: crypto.randomUUID(), type: 'gallery', text: values.text || '图片组', assetIds });
      }
      index = cursor < lines.length ? cursor : lines.length - 1;
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      if (level === 1 && !title) title = heading[2].trim();
      else if (level > 1) blocks.push({ id: crypto.randomUUID(), type: 'heading', text: heading[2].trim(), level: Math.min(level, 3) });
      continue;
    }
    const image = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (image) { flushParagraph(); addImage(image[1].trim(), image[2].trim()); continue; }
    const tableDivider = lines[index + 1]?.match(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/);
    if (line.includes('|') && tableDivider) {
      flushParagraph();
      const parseRow = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const headers = parseRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) { rows.push(parseRow(lines[index])); index += 1; }
      index -= 1;
      blocks.push({ id: crypto.randomUUID(), type: 'table', text: '数据表格', headers, rows });
      continue;
    }
    const listItem = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (listItem) {
      flushParagraph();
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
        if (!item || (/^\s*\d/.test(lines[index]) !== ordered)) break;
        items.push(item[2].trim()); index += 1;
      }
      index -= 1;
      blocks.push({ id: crypto.randomUUID(), type: 'list', text: items.join('\n'), items, ordered });
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(line)) { flushParagraph(); continue; }
    if (/^\s*>/.test(line)) {
      flushParagraph();
      const quoteLines = [line.replace(/^\s*>\s?/, '')];
      blocks.push({ id: crypto.randomUUID(), type: 'quote', text: quoteLines.join('\n').trim() });
      continue;
    }
    const inlineImage = /!\[([^\]]*)\]\(([^)]+)\)/g;
    if (inlineImage.test(line)) buffer.push(line.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1').trim());
    else buffer.push(line);
  }
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
    theme,
    original: { filename, text: source, importedAt: now },
    meta: { createdAt: now, updatedAt: now, revision: 1, importedFrom: filename, importWarnings: warnings, layoutMode: 'auto' }
  };
}

export function getLayoutGuidance(doc) {
  const suggestions = [];
  const paragraphs = doc.blocks.filter(block => block.type === 'paragraph');
  const longParagraph = paragraphs.find(block => block.text.length > 260);
  if (!doc.title || doc.title === '未命名公众号文章') suggestions.push({ level: 'warning', text: '请补充一个明确标题。', command: '标题：输入文章标题' });
  if (longParagraph) suggestions.push({ level: 'review', text: '发现较长段落，建议拆分以提升手机阅读节奏。', command: '拆分当前段落' });
  const hasHeading = doc.blocks.some(block => block.type === 'heading');
  if (!hasHeading && paragraphs.length >= 3) suggestions.push({ level: 'review', text: '文章缺少章节层级，建议添加 1–3 个小标题。', command: '添加标题：章节标题' });
  const imageCount = doc.blocks.filter(block => block.type === 'image').length;
  if (imageCount > 5) suggestions.push({ level: 'review', text: `当前有 ${imageCount} 张图片，建议人工确认节奏和位置。`, command: '上移当前' });
  const missing = doc.blocks.filter(block => block.type === 'image' && !block.assetId);
  if (missing.length) suggestions.push({ level: 'error', text: `有 ${missing.length} 个图片引用未匹配素材，请补充同名文件。`, command: '' });
  const componentCount = doc.blocks.filter(block => ['table', 'cta', 'gallery', 'media'].includes(block.type)).length;
  if (componentCount > 4) suggestions.push({ level: 'review', text: '高级组件较多，建议检查信息密度和手机端滚动节奏。', command: '下移当前' });
  if (!suggestions.length) suggestions.push({ level: 'ok', text: '当前结构适合继续人工微调。', command: '' });
  return suggestions;
}

export function parseCommand(input) {
  const raw = input.trim();
  if (!raw) return { type: 'noop' };

  let m;
  const typeMap = { '标题': 'heading', '段落': 'paragraph', '引用': 'quote', '列表': 'list', '表格': 'table', 'CTA': 'cta', 'cta': 'cta', '画廊': 'gallery', '媒体': 'media' };
  if ((m = raw.match(/^(?:标题|设置标题)[：:]?\s*(.+)$/i))) return { type: 'setTitle', text: m[1].trim() };
  if ((m = raw.match(/^(?:副标题|设置副标题)[：:]?\s*(.+)$/i))) return { type: 'setSubtitle', text: m[1].trim() };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?(?:二级)?标题[：:]?\s*(.+)$/i))) return { type: 'appendBlock', blockType: 'heading', level: 2, text: m[1].trim() };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?段落[：:]?\s*(.+)$/i))) return { type: 'appendBlock', blockType: 'paragraph', text: m[1].trim() };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?引用[：:]?\s*(.+)$/i))) return { type: 'appendBlock', blockType: 'quote', text: m[1].trim() };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?列表[：:]?\s*([\s\S]+)$/i))) return { type: 'appendBlock', blockType: 'list', text: m[1].trim(), items: m[1].split(/[\n；;]+/).map(item => item.trim()).filter(Boolean), ordered: false };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?表格[：:]?\s*([\s\S]+)$/i))) {
    const rows = m[1].split(/[\n；;]+/).map(row => row.split('|').map(cell => cell.trim()).filter(Boolean)).filter(row => row.length);
    return { type: 'appendBlock', blockType: 'table', text: '数据表格', headers: rows[0] || ['列1', '列2'], rows: rows.slice(1) };
  }
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?CTA[：:]?\s*([\s\S]+)$/i))) {
    const [text, buttonText, href] = m[1].split('|').map(value => value.trim());
    return { type: 'appendBlock', blockType: 'cta', text: text || '欢迎继续阅读', buttonText: buttonText || '立即了解', href: href || '' };
  }
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?画廊[：:]?\s*([\s\S]+)$/i))) return { type: 'appendBlock', blockType: 'gallery', text: '图片组', assetNames: m[1].split(/[,，；;]+/).map(item => item.trim()).filter(Boolean) };
  if ((m = raw.match(/^(?:新增|添加)(?:一个)?媒体[：:]?\s*([\s\S]+)$/i))) {
    const [mediaType, url, text] = m[1].split('|').map(value => value.trim());
    return { type: 'appendBlock', blockType: 'media', text: text || '媒体内容', mediaType: mediaType || 'video', url: url || '' };
  }
  if ((m = raw.match(/^(?:把|将)(?:当前|选中)(?:块|内容)?改(?:成|为)(标题|段落|引用|列表|表格|CTA|画廊|媒体)(?:[：:]\s*(.*))?$/i))) return { type: 'convertSelected', blockType: typeMap[m[1]], text: m[2]?.trim() || undefined };
  if ((m = raw.match(/^第\s*(\d+)\s*(?:个)?(?:段落|段|区块|块)?改(?:成|为)(标题|段落|引用|列表|表格|CTA|画廊|媒体)(?:[：:]\s*(.*))?$/i))) return { type: 'convertBlockAt', index: Number(m[1]) - 1, blockType: typeMap[m[2]], text: m[3]?.trim() || undefined };
  if (/^(?:拆分|分割)(?:当前|选中)?(?:段落|内容|块)?$/i.test(raw)) return { type: 'splitSelected' };
  if ((m = raw.match(/^(?:主题|样式)[：:]?\s*(.+)$/i))) return { type: 'setTheme', theme: normalizeTheme(m[1].trim()) };
  if ((m = raw.match(/^(?:去\s*AI\s*味|自然化|润色)(?:[：:]?\s*(保守|自然|conservative|natural))?$/i))) return { type: 'humanize', mode: /保守|conservative/i.test(m[1] || '') ? 'conservative' : 'natural' };
  if ((m = raw.match(/^删除(?:当前|选中)(?:块|段落|内容)?$/i))) return { type: 'deleteSelected' };
  if (/^(?:上移|向上移动)(?:当前|选中)?/i.test(raw)) return { type: 'moveSelected', direction: -1 };
  if (/^(?:下移|向下移动)(?:当前|选中)?/i.test(raw)) return { type: 'moveSelected', direction: 1 };
  if ((m = raw.match(/^插入图片[：:]?\s*(.+)$/i))) return { type: 'insertAssetByName', name: m[1].trim() };
  if ((m = raw.match(/^(?:替换|更换)(?:当前|选中)?图片[：:]?\s*(.+)$/i))) return { type: 'replaceSelectedAssetByName', name: m[1].trim() };
  return { type: 'appendBlock', blockType: 'paragraph', text: raw };
}

function blockFromIntent(intent, doc) {
  const block = { id: crypto.randomUUID(), type: intent.blockType, text: intent.text || '' };
  if (intent.level) block.level = intent.level;
  if (intent.blockType === 'list') {
    block.items = intent.items || String(intent.text || '').split(/[\n；;]+/).map(item => item.trim()).filter(Boolean);
    block.text = block.items.join('\n');
    block.ordered = Boolean(intent.ordered);
  }
  if (intent.blockType === 'table') {
    block.headers = intent.headers || ['列1', '列2'];
    block.rows = intent.rows || [];
    block.text = intent.text || '数据表格';
  }
  if (intent.blockType === 'cta') {
    block.buttonText = intent.buttonText || '立即了解';
    block.href = intent.href || '';
  }
  if (intent.blockType === 'gallery') {
    block.assetIds = (intent.assetIds || intent.assetNames || []).map(value => {
      if (doc.assets.some(asset => asset.id === value)) return value;
      return doc.assets.find(asset => asset.name.toLowerCase().includes(String(value).toLowerCase()))?.id;
    }).filter(Boolean);
  }
  if (intent.blockType === 'media') {
    block.mediaType = intent.mediaType || 'video';
    block.url = intent.url || '';
  }
  return block;
}

function convertedBlock(block, intent) {
  const next = { id: block.id, type: intent.blockType, text: intent.text ?? block.text ?? '' };
  if (intent.blockType === 'heading') next.level = 2;
  if (intent.blockType === 'list') { next.items = String(next.text).split(/[\n。！？!?；;]+/).map(item => item.trim()).filter(Boolean); next.text = next.items.join('\n'); next.ordered = false; }
  if (intent.blockType === 'table') { next.headers = ['内容', '备注']; next.rows = [[next.text, '']]; next.text = '数据表格'; }
  if (intent.blockType === 'cta') { next.buttonText = block.buttonText || '立即了解'; next.href = block.href || ''; }
  if (intent.blockType === 'gallery') next.assetIds = block.assetIds || (block.assetId ? [block.assetId] : []);
  if (intent.blockType === 'media') { next.mediaType = block.mediaType || 'video'; next.url = block.url || ''; }
  return next;
}

export function reduceDocument(doc, intent, selectedId = null) {
  const next = clone(doc);
  let selected = selectedId;
  let changed = true;

  switch (intent.type) {
    case 'noop': return { doc, selectedId, changed: false };
    case 'setTitle': next.title = intent.text; break;
    case 'setSubtitle': next.subtitle = intent.text; break;
    case 'setTheme': {
      const theme = normalizeTheme(intent.theme);
      if (theme === normalizeTheme(next.theme)) return { doc, selectedId, changed: false };
      next.theme = theme;
      break;
    }
    case 'humanize': {
      const humanized = humanizeDocument(next, intent.mode || 'natural');
      return { doc: humanized, selectedId, changed: true };
    }
    case 'appendBlock': {
      const block = blockFromIntent(intent, next);
      next.blocks.push(block); selected = block.id; break;
    }
    case 'updateBlock': {
      const block = next.blocks.find(b => b.id === intent.id);
      if (!block) return { doc, selectedId, changed: false };
      let updated = false;
      if (intent.text !== undefined && block.text !== intent.text) { block.text = intent.text; updated = true; }
      for (const field of ['items', 'ordered', 'headers', 'rows', 'buttonText', 'href', 'assetIds', 'mediaType', 'url']) {
        if (intent[field] !== undefined && JSON.stringify(block[field]) !== JSON.stringify(intent[field])) { block[field] = intent[field]; updated = true; }
      }
      if (!updated) return { doc, selectedId, changed: false };
      selected = block.id; break;
    }
    case 'convertSelected': {
      if (!selectedId) return { doc, selectedId, changed: false };
      const index = next.blocks.findIndex(block => block.id === selectedId);
      if (index < 0) return { doc, selectedId, changed: false };
      next.blocks[index] = convertedBlock(next.blocks[index], intent); selected = selectedId; break;
    }
    case 'convertBlockAt': {
      if (intent.index < 0 || intent.index >= next.blocks.length) return { doc, selectedId, changed: false, error: '找不到对应区块' };
      const block = next.blocks[intent.index];
      next.blocks[intent.index] = convertedBlock(block, intent); selected = block.id; break;
    }
    case 'splitSelected': {
      const index = next.blocks.findIndex(block => block.id === selectedId);
      const block = index >= 0 ? next.blocks[index] : null;
      if (!block || !block.text || block.text.length < 2) return { doc, selectedId, changed: false, error: '当前区块没有足够文字可拆分' };
      let parts = block.text.split(/\n+|(?<=[。！？!?])\s*/).map(item => item.trim()).filter(Boolean);
      if (parts.length < 2) { const pivot = Math.ceil(block.text.length / 2); parts = [block.text.slice(0, pivot), block.text.slice(pivot)]; }
      const replacements = parts.map(text => ({ id: crypto.randomUUID(), type: 'paragraph', text }));
      next.blocks.splice(index, 1, ...replacements); selected = replacements[0].id; break;
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
    case 'addAssets': {
      const assets = Array.isArray(intent.assets) ? intent.assets : [];
      const incoming = assets.filter(asset => asset?.id && !next.assets.some(existing => existing.id === asset.id));
      if (!incoming.length) return { doc, selectedId, changed: false };
      next.assets.push(...incoming);
      break;
    }
    case 'deleteAsset': {
      const assetId = intent.assetId;
      const asset = next.assets.find(item => item.id === assetId);
      if (!asset) return { doc, selectedId, changed: false, error: '素材不存在' };
      const inUse = next.blocks.some(block => block.assetId === assetId || (block.assetIds || []).includes(assetId));
      if (inUse) return { doc, selectedId, changed: false, error: '素材正在文章中使用，请先替换或删除对应图片' };
      next.assets = next.assets.filter(item => item.id !== assetId);
      break;
    }
    case 'deleteUnusedAssets': {
      const used = new Set(next.blocks.flatMap(block => [block.assetId, ...(block.assetIds || [])]).filter(Boolean));
      const kept = next.assets.filter(asset => used.has(asset.id));
      if (kept.length === next.assets.length) return { doc, selectedId, changed: false, error: '没有可清理的未使用素材' };
      next.assets = kept;
      break;
    }
    case 'replaceSelectedAsset': {
      if (!selectedId) return { doc, selectedId, changed: false, error: '请先选择文章中的图片' };
      const block = next.blocks.find(item => item.id === selectedId);
      const asset = next.assets.find(item => item.id === intent.assetId);
      if (!block || block.type !== 'image') return { doc, selectedId, changed: false, error: '请先选择文章中的图片' };
      if (!asset) return { doc, selectedId, changed: false, error: '素材不存在' };
      if (block.assetId === asset.id) return { doc, selectedId, changed: false };
      block.assetId = asset.id;
      block.text = asset.alt || asset.name;
      break;
    }
    case 'replaceSelectedAssetByName': {
      if (!selectedId) return { doc, selectedId, changed: false, error: '请先选择文章中的图片' };
      const asset = next.assets.find(item => item.name.toLowerCase().includes(String(intent.name || '').toLowerCase()));
      if (!asset) return { doc, selectedId, changed: false, error: `未找到素材：${intent.name}` };
      const block = next.blocks.find(item => item.id === selectedId);
      if (!block || block.type !== 'image') return { doc, selectedId, changed: false, error: '请先选择文章中的图片' };
      block.assetId = asset.id;
      block.text = asset.alt || asset.name;
      break;
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
      replacement.theme = normalizeTheme(replacement.theme);
      return { doc: replacement, selectedId: replacement.blocks[0]?.id || null, changed: true };
    }
    default: changed = false;
  }
  return { doc: next, selectedId: selected, changed };
}

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function renderDocumentBody(doc) {
  const assets = doc.assets || [];
  const assetById = id => assets.find(asset => asset.id === id);
  const renderBlock = block => {
    const text = escapeHtml(block.text || '');
    if (block.type === 'heading') return `<h2>${text}</h2>`;
    if (block.type === 'quote') return `<blockquote>${text}</blockquote>`;
    if (block.type === 'list') {
      const items = (block.items || String(block.text || '').split('\n')).filter(Boolean).map(item => `<li>${escapeHtml(item)}</li>`).join('');
      return block.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
    }
    if (block.type === 'table') {
      const headers = (block.headers || []).map(item => `<th>${escapeHtml(item)}</th>`).join('');
      const rows = (block.rows || []).map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
      return `<div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (block.type === 'cta') return `<div class="cta"><p>${text}</p><a href="${escapeHtml(block.href || '#')}">${escapeHtml(block.buttonText || '立即了解')}</a></div>`;
    if (block.type === 'gallery') {
      const images = (block.assetIds || []).map(id => assetById(id)).filter(Boolean).map(asset => `<img src="${escapeHtml(asset.dataUrl)}" alt="${escapeHtml(asset.alt || asset.name)}">`).join('');
      return `<div class="gallery">${images || `<p>${text}</p>`}</div>`;
    }
    if (block.type === 'media') return `<div class="media"><span>${escapeHtml(block.mediaType || 'media')}</span><a href="${escapeHtml(block.url || '#')}">${text || '打开媒体内容'}</a></div>`;
    if (block.type === 'image') {
      const asset = assetById(block.assetId);
      return asset?.dataUrl ? `<figure><img src="${escapeHtml(asset.dataUrl)}" alt="${text}"><figcaption>${text}</figcaption></figure>` : `<div class="missing-image">${text || '图片素材已丢失'}</div>`;
    }
    return `<p>${text}</p>`;
  };
  return `<h1>${escapeHtml(doc.title)}</h1><p class="subtitle">${escapeHtml(doc.subtitle || '')}</p><div class="meta">公众号排版 · ${doc.meta?.updatedAt ? new Date(doc.meta.updatedAt).toLocaleDateString() : ''}</div>${(doc.blocks || []).map(renderBlock).join('')}`;
}

export function renderArticleHtml(doc) {
  const theme = THEMES[normalizeTheme(doc.theme)];
  const styles = {
    article: `max-width:677px;margin:0 auto;padding:28px 20px;background:#fff;color:${theme.ink};line-height:1.9;`,
    title: `font-size:26px;line-height:1.35;margin:0 0 10px;text-align:center;color:${theme.ink};`,
    subtitle: 'color:#75808b;margin:0 0 6px;text-align:center;',
    meta: 'font-size:12px;color:#a0a8b0;margin-bottom:28px;text-align:center;',
    heading: `font-size:20px;margin:28px 0 12px;padding-left:10px;border-left:4px solid ${theme.accent};color:${theme.ink};`,
    paragraph: 'font-size:16px;line-height:1.9;text-align:justify;white-space:pre-wrap;margin:16px 0;',
    quote: `margin:20px 0;padding:13px 15px;background:${theme.surface};border-left:3px solid ${theme.accent};color:#66727c;`,
    imageFigure: 'margin:22px 0;text-align:center;',
    image: 'max-width:100%;display:block;margin:0 auto;border-radius:4px;',
    caption: 'text-align:center;color:#9aa4ad;font-size:12px;margin-top:6px;',
    list: 'padding-left:24px;font-size:16px;line-height:1.9;margin:14px 0;',
    listItem: 'margin:6px 0;line-height:1.75;',
    tableWrap: 'overflow-x:auto;margin:18px 0;',
    table: 'width:100%;border-collapse:collapse;font-size:14px;',
    cell: 'padding:8px;border:1px solid #dfe7ee;text-align:left;',
    headerCell: `padding:8px;border:1px solid #dfe7ee;text-align:left;background:${theme.surface};`,
    cta: `text-align:center;margin:26px 0;padding:20px;background:${theme.surface};border-radius:10px;`,
    ctaLink: `display:inline-block;padding:8px 18px;border-radius:999px;background:${theme.accent};color:#fff;text-decoration:none;`,
    gallery: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:20px 0;',
    galleryImage: 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;',
    media: `display:flex;gap:10px;align-items:center;padding:14px;margin:18px 0;background:${theme.surface};border-radius:8px;`,
    mediaLink: `color:${theme.accent};`,
    missing: 'padding:20px;background:#fff3f3;color:#b42318;'
  };
  const assets = doc.assets || [];
  const assetById = id => assets.find(asset => asset.id === id);
  const renderInlineBlock = block => {
    const text = escapeHtml(block.text || '');
    if (block.type === 'heading') return `<h2 style="${styles.heading}">${text}</h2>`;
    if (block.type === 'quote') return `<blockquote style="${styles.quote}">${text}</blockquote>`;
    if (block.type === 'list') {
      const items = (block.items || String(block.text || '').split('\\n')).filter(Boolean).map(item => `<li style="${styles.listItem}">${escapeHtml(item)}</li>`).join('');
      return `${block.ordered ? '<ol' : '<ul'} style="${styles.list}">${items}${block.ordered ? '</ol>' : '</ul>'}`;
    }
    if (block.type === 'table') {
      const headers = (block.headers || []).map(item => `<th style="${styles.headerCell}">${escapeHtml(item)}</th>`).join('');
      const rows = (block.rows || []).map(row => `<tr>${row.map(cell => `<td style="${styles.cell}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
      return `<div style="${styles.tableWrap}"><table style="${styles.table}"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (block.type === 'cta') return `<div style="${styles.cta}"><p style="${styles.paragraph}">${text}</p><a style="${styles.ctaLink}" href="${escapeHtml(block.href || '#')}">${escapeHtml(block.buttonText || '立即了解')}</a></div>`;
    if (block.type === 'gallery') {
      const images = (block.assetIds || []).map(id => assetById(id)).filter(Boolean).map(asset => `<img style="${styles.galleryImage}" src="${escapeHtml(asset.dataUrl)}" alt="${escapeHtml(asset.alt || asset.name)}">`).join('');
      return `<div style="${styles.gallery}">${images || `<p style="${styles.paragraph}">${text}</p>`}</div>`;
    }
    if (block.type === 'media') return `<div style="${styles.media}"><span>${escapeHtml(block.mediaType || 'media')}</span><a style="${styles.mediaLink}" href="${escapeHtml(block.url || '#')}">${text || '打开媒体内容'}</a></div>`;
    if (block.type === 'image') {
      const asset = assetById(block.assetId);
      return asset?.dataUrl ? `<figure style="${styles.imageFigure}"><img style="${styles.image}" src="${escapeHtml(asset.dataUrl)}" alt="${text}"><figcaption style="${styles.caption}">${text}</figcaption></figure>` : `<div style="${styles.missing}">${text || '图片素材已丢失'}</div>`;
    }
    return `<p style="${styles.paragraph}">${text}</p>`;
  };
  const body = `<h1 style="${styles.title}">${escapeHtml(doc.title)}</h1><p style="${styles.subtitle}">${escapeHtml(doc.subtitle || '')}</p><div style="${styles.meta}">公众号排版 · ${doc.meta?.updatedAt ? new Date(doc.meta.updatedAt).toLocaleDateString() : ''}</div>${(doc.blocks || []).map(renderInlineBlock).join('')}`;
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><article class="wechat-article" style="${styles.article}">${body}</article>`;
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
