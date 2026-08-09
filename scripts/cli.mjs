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
  if (!response.ok || !body.url) throw new Error(`上传微信图文图片失败：${describeWechatError(body) || response.status}`);
  return body.url;
}
// 需求1：封面必须是永久素材，走 add_material 拿 thumb_media_id（draft/add 官方必填封面）
async function uploadWechatCover(asset, token) {
  const parts = dataUrlParts(asset.dataUrl);
  if (!parts) throw new Error(`封面 ${asset.name} 不是可上传的本地 Data URL`);
  if (!['image/png', 'image/jpeg', 'image/jpg'].includes(parts.type)) throw new Error(`封面暂不支持 ${parts.type}，请用 JPG/PNG：${asset.name}`);
  if (parts.bytes.length > 10 * 1024 * 1024) throw new Error(`封面超 10MB（微信错误码 40009）：${asset.name}`);
  const form = new FormData();
  form.append('media', new Blob([parts.bytes], { type: parts.type }), asset.name);
  const endpoint = process.env.WECHAT_MATERIAL_UPLOAD_URL || 'https://api.weixin.qq.com/cgi-bin/material/add_material';
  const joiner = endpoint.includes('?') ? '&' : '?';
  const response = await fetch(`${endpoint}${joiner}access_token=${encodeURIComponent(token)}&type=image`, { method: 'POST', body: form });
  const body = await response.json();
  if (!response.ok || !body.media_id) throw new Error(`上传封面失败：${describeWechatError(body) || response.status}`);
  return body.media_id;
}
// 需求3：把微信错误码翻译成可操作的中文提示，而非裸 errcode
function describeWechatError(body = {}) {
  const map = {
    40001: 'access_token 无效或过期，检查 AppID/AppSecret',
    40007: 'media_id 无效，封面素材可能已失效',
    40009: '图片超出大小限制（≤10MB）',
    40164: '调用 IP 不在公众号白名单，请在「设置与开发→基本配置→IP 白名单」加入服务器公网 IP',
    41001: '缺少 access_token 参数',
    45009: '接口调用频次超限',
    45166: '内容含敏感词或非法 HTML 标签，请检查正文',
    48001: '接口未授权，需认证公众号并开通草稿箱权限',
    53404: '账号已被限制，无法新建草稿'
  };
  if (body.errcode && map[body.errcode]) return `[${body.errcode}] ${map[body.errcode]}`;
  if (body.errmsg) return `[${body.errcode || '?'}] ${body.errmsg}`;
  return '';
}
// 需求4：红线断言——只允许草稿箱端点，出现任何发布/群发端点即终止
const FORBIDDEN_ENDPOINTS = ['freepublish/submit', 'message/mass', 'message/masssend'];
function assertDraftOnly(endpoint) {
  const hit = FORBIDDEN_ENDPOINTS.find(fp => endpoint.includes(fp));
  if (hit) throw new Error(`安全红线：检测到发布/群发端点「${hit}」，本工具只允许写入草稿箱，拒绝执行`);
}
async function publishFromState() {
  const state = await loadState();
  const dryRun = args.includes('--dry-run');           // 需求4：审核态，只生成不上传
  const out = resolve(option('out', join('.local-data', 'publish', `revision-${state.doc.meta.revision}`)));
  await mkdir(out, { recursive: true });
  const htmlPath = join(out, 'article.html');
  const payloadPath = join(out, 'draft-payload.json');
  const manifestPath = join(out, 'publish-manifest.json');
  let renderDoc = state.doc;
  let html = renderHtml(renderDoc);
  // 需求2：摘要超 54 汉字微信会静默截断，先截断并记录
  // 官方字段限制（据 developers.weixin.qq.com draft/add 文档核对）：
  // title ≤32字、author ≤16字、digest ≤120字、content <2万字符且<1M
  const title = state.doc.title || '';
  if ([...title].length > 32) throw new Error(`标题超 32 字（微信 draft/add 上限），当前 ${[...title].length} 字，请精简`);
  const author = option('author', '');
  if ([...author].length > 16) throw new Error(`作者名超 16 字（微信 draft/add 上限），当前 ${[...author].length} 字`);
  const MAX_DIGEST = 120;                                   // 官方摘要上限 120 字（不填才默认抓正文前54字）
  let digest = option('digest', state.doc.subtitle || '');
  let digestTruncated = false;
  if ([...digest].length > MAX_DIGEST) { digest = [...digest].slice(0, MAX_DIGEST).join(''); digestTruncated = true; }
  const contentBytes = Buffer.byteLength(html, 'utf8');
  if ([...html].length >= 20000 || contentBytes >= 1024 * 1024) {
    throw new Error(`正文超微信上限（需 <2万字符且 <1MB），当前 ${[...html].length} 字符 / ${(contentBytes/1024/1024).toFixed(2)}MB，请拆分`);
  }
  const payload = {
    article_type: 'news',                                  // 显式声明图文消息（封面走 thumb_media_id）
    title,
    author,
    digest,
    content: html,
    content_source_url: option('source', '')
  };
  const endpoint = option('api-url', process.env.WECHAT_DRAFT_API_URL || ((process.env.WECHAT_ACCESS_TOKEN || (process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET)) ? 'https://api.weixin.qq.com/cgi-bin/draft/add' : undefined));
  if (endpoint) assertDraftOnly(endpoint);            // 需求4：红线断言
  const token = (endpoint && !dryRun) ? await resolveWechatAccessToken() : null;
  let delivery = { mode: 'local-bundle', status: 'ready' };

  if (endpoint && token) {
    // 是否需要走微信素材上传：默认所有真实推送都要（除非显式 --skip-upload 给自有适配层用）
    const uploadMedia = !args.includes('--skip-upload');
    // 需求1：正文图片先换成微信 URL
    if (uploadMedia && renderDoc.blocks.some(block => block.type === 'image')) {
      renderDoc = clone(state.doc);
      for (const asset of renderDoc.assets) {
        if (!renderDoc.blocks.some(block => block.type === 'image' && block.assetId === asset.id)) continue;
        asset.dataUrl = await uploadWechatArticleImage(asset, token);
      }
      html = renderHtml(renderDoc);
    }
    payload.content = html;
    // 需求1：封面必填。--cover 指定文件，否则用文章第一张图作封面
    if (uploadMedia) {
      const coverPath = option('cover');
      let coverAsset = null;
      if (coverPath) coverAsset = await assetFromFile(resolve(coverPath));
      else {
        const firstImg = (renderDoc.blocks || state.doc.blocks).find(b => b.type === 'image');
        const src = firstImg && (state.doc.assets || []).find(a => a.id === firstImg.assetId);
        if (src) coverAsset = src;
      }
      if (!coverAsset) throw new Error('缺少封面：draft/add 必须有封面图，请用 --cover <图片> 指定，或文章中至少含一张图片');
      payload.thumb_media_id = await uploadWechatCover(coverAsset, token);
    }
    // 需求4：提交前最后一道红线
    assertDraftOnly(endpoint);
    const joiner = endpoint.includes('?') ? '&' : '?';
    const response = await fetch(`${endpoint}${joiner}access_token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ articles: [payload] }) });
    const responseText = await response.text();
    let parsed = {}; try { parsed = JSON.parse(responseText); } catch { /* 保留原文 */ }
    // 需求3：解析 draft_media_id + 后台链接 + 友好错误
    const ok = response.ok && !parsed.errcode;
    delivery = {
      mode: 'wechat-api',
      status: ok ? 'submitted' : 'failed',
      httpStatus: response.status,
      draft_media_id: parsed.media_id || null,
      backend_url: 'https://mp.weixin.qq.com/ （登录后进入「草稿箱」查看）',
      error: ok ? null : describeWechatError(parsed),
      response: responseText.slice(0, 500)
    };
    if (!ok) throw new Error(`微信草稿接口失败：${describeWechatError(parsed) || response.status}`);
  } else if (dryRun) {
    delivery = { mode: 'dry-run', status: 'ready', note: '审核态：已生成本地交付包，未上传、未建草稿。人工核对后去掉 --dry-run 重跑即进草稿箱' };
  } else if (endpoint && !token) {
    delivery = { mode: 'local-bundle', status: 'ready', warning: '已生成草稿包；未检测到凭据，未调用远程接口' };
  }

  await writeFile(htmlPath, html, 'utf8');
  await writeFile(payloadPath, JSON.stringify({ articles: [payload] }, null, 2), 'utf8');
  const manifest = {
    generatedAt: new Date().toISOString(),
    revision: state.doc.meta.revision,
    theme: state.doc.theme || 'minimal',
    stage: dryRun ? '③生成交付包（待人工审核）' : (delivery.status === 'submitted' ? '③已进草稿箱（待人工审核+人工发布）' : '③本地包'),
    digestTruncated,
    htmlPath, payloadPath, delivery,
    manual_next_steps: [
      '1. 登录 mp.weixin.qq.com → 草稿箱，人工核对排版/图片/错字',
      '2. 确认无误后在后台手动「群发」或「发布」（本工具不代发）'
    ]
  };
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
  else console.log('公众号排版 CLI\n\ninit\nimport --article article.md --images ./images\nimport --text "文章内容" --image cover.png\nguidance\nstate\ntext --text "标题：文章标题"\nhumanize --mode natural\nintent --json \'{"type":"appendBlock","blockType":"paragraph","text":"正文"}\'\nexport --out article.html\npublish --cover cover.jpg --author 作者 --digest 摘要 [--dry-run]\n\n凭据（三选一，优先级从高到低）：\n  WECHAT_ACCESS_TOKEN=...            # 已有 token 直接用\n  WECHAT_APP_ID / WECHAT_APP_SECRET # 自动换取 token\n  WECHAT_DRAFT_API_URL=...          # 指向自有适配层\n publish 说明：--dry-run 只生成本地交付包供人工审核，不上传；\n 去掉 --dry-run 且配好凭据后，上传封面+正文图→写入草稿箱→返回 draft_media_id。\n 仅写草稿箱，永不自动群发/发布，发布由人工在后台完成。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
