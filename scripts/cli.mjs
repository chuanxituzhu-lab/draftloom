#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInitialDocument, parseCommand, reduceDocument, stamp, clone } from '../src/core.js';

const args = process.argv.slice(2);
const command = args.shift();
const option = (name, fallback = undefined) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const dataFile = resolve(option('data', process.env.WECHAT_LAYOUT_DATA || '.local-data/document.json'));

async function loadState() {
  if (!existsSync(dataFile)) {
    const doc = createInitialDocument();
    return { doc, selectedId: null, history: [{ seq: 1, ts: doc.meta.updatedAt, label: '初始化', doc: clone(doc) }], future: [] };
  }
  return JSON.parse(await readFile(dataFile, 'utf8'));
}
async function saveState(state) { await mkdir(dirname(dataFile), { recursive: true }); await writeFile(dataFile, JSON.stringify(state, null, 2), 'utf8'); return state; }
async function applyIntent(intent, label) {
  const state = await loadState();
  const result = reduceDocument(state.doc, intent, state.selectedId);
  if (!result.changed) return { ...state, error: result.error || null, changed: false };
  const next = stamp(clone(result.doc), state.doc.meta.revision + 1);
  state.doc = next; state.selectedId = result.selectedId;
  state.history = [...(state.history || []), { seq: next.meta.revision, ts: next.meta.updatedAt, label, doc: clone(next) }].slice(-50); state.future = [];
  await saveState(state); return { ...state, changed: true };
}
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function renderHtml(doc) {
  const blocks = doc.blocks.map(block => {
    const text = escapeHtml(block.text);
    if (block.type === 'heading') return `<h2 style="margin:28px 0 12px;font-size:20px">${text}</h2>`;
    if (block.type === 'quote') return `<blockquote style="margin:18px 0;padding:12px 16px;border-left:3px solid #1677ff;background:#eef5ff">${text}</blockquote>`;
    if (block.type === 'image') { const asset = doc.assets.find(item => item.id === block.assetId); return asset?.dataUrl ? `<figure><img src="${escapeHtml(asset.dataUrl)}" alt="${text}" style="max-width:100%;border-radius:8px"><figcaption>${text}</figcaption></figure>` : ''; }
    return `<p style="font-size:16px;line-height:1.9">${text}</p>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><article style="max-width:677px;margin:auto;padding:24px 18px;font-family:system-ui,'PingFang SC',sans-serif"><h1>${escapeHtml(doc.title)}</h1><p style="color:#7a8490">${escapeHtml(doc.subtitle)}</p>${blocks}</article>`;
}
const output = value => console.log(JSON.stringify(value, null, 2));
try {
  if (command === 'init') output(await saveState(await loadState()));
  else if (command === 'state') output(await loadState());
  else if (command === 'text') output(await applyIntent(parseCommand(option('text', args.join(' '))), '文字指令'));
  else if (command === 'intent') output(await applyIntent(JSON.parse(option('json', '{}')), '结构化指令'));
  else if (command === 'export') { const state = await loadState(); const out = resolve(option('out', `wechat-layout-${state.doc.meta.revision}.html`)); await writeFile(out, renderHtml(state.doc), 'utf8'); output({ out, revision: state.doc.meta.revision }); }
  else console.log('公众号排版 CLI\n\ninit\nstate\ntext --text "标题：文章标题"\nintent --json \'{"type":"appendBlock","blockType":"paragraph","text":"正文"}\'\nexport --out article.html');
} catch (error) { console.error(error.message); process.exitCode = 1; }
