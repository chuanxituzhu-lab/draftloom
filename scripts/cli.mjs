#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createInitialDocument, parseCommand, reduceDocument, stamp, clone, importArticle, getLayoutGuidance, renderArticleHtml } from '../src/core.js';

const args = process.argv.slice(2);
const command = args.shift();
const option = (name, fallback = undefined) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const optionAll = name => args.reduce((values, value, index) => value === `--${name}` && args[index + 1] ? [...values, args[index + 1]] : values, []);
const dataFile = resolve(option('data', process.env.WECHAT_LAYOUT_DATA || '.local-data/document.json'));

async function loadState() {
  if (!existsSync(dataFile)) {
    const doc = createInitialDocument();
    return { doc, selectedId: null, history: [{ seq: 1, ts: doc.meta.updatedAt, label: '初始化', doc: clone(doc) }], future: [] };
  }
  return JSON.parse(await readFile(dataFile, 'utf8'));
}
async function saveState(state) { await mkdir(dirname(dataFile), { recursive: true }); await writeFile(dataFile, JSON.stringify(state, null, 2), 'utf8'); return state; }
function stateFromDocument(doc) { return { doc, selectedId: doc.blocks[0]?.id || null, history: [{ seq: 1, ts: doc.meta.updatedAt, label: '导入文章', doc: clone(doc) }], future: [] }; }
async function applyIntent(intent, label) {
  const state = await loadState();
  const result = reduceDocument(state.doc, intent, state.selectedId);
  if (!result.changed) return { ...state, error: result.error || null, changed: false };
  const next = stamp(clone(result.doc), state.doc.meta.revision + 1);
  state.doc = next; state.selectedId = result.selectedId;
  state.history = [...(state.history || []), { seq: next.meta.revision, ts: next.meta.updatedAt, label, doc: clone(next) }].slice(-50); state.future = [];
  await saveState(state); return { ...state, changed: true };
}
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
async function assetFromFile(filePath) {
  const data = await readFile(filePath);
  const type = imageTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
  return { name: basename(filePath), type, size: data.length, dataUrl: `data:${type};base64,${data.toString('base64')}`, alt: basename(filePath, extname(filePath)) };
}
async function collectImagePaths() {
  const paths = [...optionAll('image')];
  const folder = option('images');
  if (folder && existsSync(resolve(folder))) {
    const entries = await readdir(resolve(folder), { withFileTypes: true });
    paths.push(...entries.filter(entry => entry.isFile() && imageTypes[extname(entry.name).toLowerCase()]).map(entry => join(resolve(folder), entry.name)));
  }
  return [...new Set(paths.map(path => resolve(path)))];
}
async function importFromInput() {
  const articlePath = option('article', option('file'));
  const inlineText = option('text');
  if (!articlePath && inlineText === undefined) throw new Error('请提供 --article <文章文件> 或 --text <文章内容>');
  const text = inlineText !== undefined ? inlineText : await readFile(resolve(articlePath), 'utf8');
  const assets = await Promise.all((await collectImagePaths()).map(assetFromFile));
  const doc = importArticle({ text, filename: articlePath ? basename(articlePath) : 'pasted-article.txt', assets });
  const state = stateFromDocument(doc);
  await saveState(state);
  return { ...state, guidance: getLayoutGuidance(doc), warnings: doc.meta.importWarnings || [] };
}
function renderHtml(doc) { return renderArticleHtml(doc); }
function dataUrlParts(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;]+);base64,([\s\S]+)$/);
  return match ? { type: match[1], bytes: Buffer.from(match[2], 'base64') } : null;
}
async function resolveWechatAccessToken() {
  if (process.env.WECHAT_ACCESS_TOKEN) return process.env.WECHAT_ACCESS_TOKEN;
  if (!process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) return null;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(process.env.WECHAT_APP_ID)}&secret=${encodeURIComponent(process.env.WECHAT_APP_SECRET)}`;
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error(`获取微信 access_token 失败：${body.errmsg || response.status}`);
  return body.access_token;
}
async function uploadWechatArticleImage(asset, token) {
  const parts = dataUrlParts(asset.dataUrl);
  if (!parts) throw new Error(`图片 ${asset.name} 不是可上传的本地 Data URL`);
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif'].includes(parts.type)) throw new Error(`微信图文图片暂不支持 ${parts.type}：${asset.name}`);
  const form = new FormData();
  form.append('media', new Blob([parts.bytes], { type: parts.type }), asset.name);
  const endpoint = process.env.WECHAT_IMAGE_UPLOAD_URL || 'https://api.weixin.qq.com/cgi-bin/media/uploadimg';
  const joiner = endpoint.includes('?') ? '&' : '?';
  const response = await fetch(`${endpoint}${joiner}access_token=${encodeURIComponent(token)}`, { method: 'POST', body: form });
  const body = await response.json();
  if (!response.ok || !body.url) throw new Error(`上传微信图文图片失败：${body.errmsg || response.status}`);
  return body.url;
}
async function publishFromState() {
  const state = await loadState();
  const out = resolve(option('out', join('.local-data', 'publish', `revision-${state.doc.meta.revision}`)));
  await mkdir(out, { recursive: true });
  const htmlPath = join(out, 'article.html');
  const payloadPath = join(out, 'draft-payload.json');
  const manifestPath = join(out, 'publish-manifest.json');
  let renderDoc = state.doc;
  let html = renderHtml(renderDoc);
  const payload = {
    title: state.doc.title,
    author: option('author', ''),
    digest: option('digest', state.doc.subtitle || ''),
    content: html,
    content_source_url: option('source', '')
  };
  const endpoint = option('api-url', process.env.WECHAT_DRAFT_API_URL || ((process.env.WECHAT_ACCESS_TOKEN || (process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET)) ? 'https://api.weixin.qq.com/cgi-bin/draft/add' : undefined));
  const token = endpoint ? await resolveWechatAccessToken() : null;
  let delivery = { mode: 'local-bundle', status: 'ready' };
  if (endpoint && token) {
    if (endpoint.includes('api.weixin.qq.com') && renderDoc.blocks.some(block => block.type === 'image')) {
      renderDoc = clone(state.doc);
      for (const asset of renderDoc.assets) {
        if (!renderDoc.blocks.some(block => block.type === 'image' && block.assetId === asset.id)) continue;
        asset.dataUrl = await uploadWechatArticleImage(asset, token);
      }
      html = renderHtml(renderDoc);
    }
    payload.content = html;
    await writeFile(htmlPath, html, 'utf8');
    await writeFile(payloadPath, JSON.stringify({ articles: [payload] }, null, 2), 'utf8');
    const joiner = endpoint.includes('?') ? '&' : '?';
    const response = await fetch(`${endpoint}${joiner}access_token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ articles: [payload] }) });
    const responseText = await response.text();
    delivery = { mode: 'wechat-api', status: response.ok ? 'submitted' : 'failed', httpStatus: response.status, response: responseText.slice(0, 500) };
    if (!response.ok) throw new Error(`微信草稿接口返回 ${response.status}`);
  } else if (endpoint && !token) {
    delivery = { mode: 'local-bundle', status: 'ready', warning: '已生成草稿包；未检测到 WECHAT_ACCESS_TOKEN，未调用远程接口' };
  }
  await writeFile(htmlPath, html, 'utf8');
  await writeFile(payloadPath, JSON.stringify({ articles: [payload] }, null, 2), 'utf8');
  const manifest = { generatedAt: new Date().toISOString(), revision: state.doc.meta.revision, theme: state.doc.theme || 'minimal', htmlPath, payloadPath, delivery };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}
const output = value => console.log(JSON.stringify(value, null, 2));
try {
  if (command === 'init') output(await saveState(await loadState()));
  else if (command === 'state') output(await loadState());
  else if (command === 'import') output(await importFromInput());
  else if (command === 'guidance') { const state = await loadState(); output({ guidance: getLayoutGuidance(state.doc), warnings: state.doc.meta.importWarnings || [] }); }
  else if (command === 'text') output(await applyIntent(parseCommand(option('text', args.join(' '))), '文字指令'));
  else if (command === 'humanize') output(await applyIntent({ type: 'humanize', mode: option('mode', 'natural') === 'conservative' ? 'conservative' : 'natural' }, '去 AI 味'));
  else if (command === 'intent') output(await applyIntent(JSON.parse(option('json', '{}')), '结构化指令'));
  else if (command === 'export') { const state = await loadState(); const out = resolve(option('out', `wechat-layout-${state.doc.meta.revision}.html`)); await writeFile(out, renderHtml(state.doc), 'utf8'); output({ out, revision: state.doc.meta.revision }); }
  else if (command === 'publish') output(await publishFromState());
  else console.log('公众号排版 CLI\n\ninit\nimport --article article.md --images ./images\nimport --text "文章内容" --image cover.png\nguidance\nstate\ntext --text "标题：文章标题"\nhumanize --mode natural\nintent --json \'{"type":"appendBlock","blockType":"paragraph","text":"正文"}\'\nexport --out article.html\npublish --out .local-data/publish/revision-1');
} catch (error) { console.error(error.message); process.exitCode = 1; }
