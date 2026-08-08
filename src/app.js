import { createInitialDocument, parseCommand, reduceDocument, VersionStore } from './core.js';

const STORAGE_KEY = 'wechat-layout-mvp:v0.1';
let doc = loadDocument() || createInitialDocument();
let selectedId = doc.blocks[0]?.id || null;
let zoom = 1;
let store = new VersionStore(doc);
let status = '就绪';

function loadDocument() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)); }
function esc(s='') { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function assetById(id) { return doc.assets.find(a => a.id === id); }
function setStatus(text) { status = text; renderStatus(); }
function renderStatus() {
  const el = document.querySelector('#statusText');
  if (el) el.textContent = status;
  const rev = document.querySelector('#revisionText');
  if (rev) rev.textContent = `v${doc.meta.revision} · ${new Date(doc.meta.updatedAt).toLocaleTimeString()}`;
}

function commit(intent, label) {
  const result = reduceDocument(doc, intent, selectedId);
  if (result.error) { setStatus(result.error); return false; }
  if (!result.changed) { setStatus('没有可应用的变化'); return false; }
  selectedId = result.selectedId;
  doc = store.commit(result.doc, label);
  persist(); render(); setStatus(label);
  window.dispatchEvent(new CustomEvent('wechat-layout:changed', { detail: { doc: structuredClone(doc), intent } }));
  return true;
}

function render() {
  document.querySelector('#app').innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div><strong>公众号排版</strong><span class="badge">MVP v0.1</span></div>
      <div class="top-actions">
        <button id="undoBtn">↶ 回滚</button><button id="redoBtn">↷ 重做</button>
        <button id="exportBtn">导出 JSON</button><label class="button">导入 JSON<input id="importInput" type="file" accept="application/json" hidden></label>
      </div>
    </header>
    <main class="workspace">
      <aside class="panel left-panel">
        <section><h3>文章结构</h3><div class="outline">${doc.blocks.map((b,i)=>`<button class="outline-item ${b.id===selectedId?'active':''}" data-select="${b.id}"><span>${i+1}</span>${b.type==='image'?'图片':esc(b.text.slice(0,18)||'空内容')}</button>`).join('')}</div></section>
        <section class="assets"><div class="section-head"><h3>素材库</h3><label class="mini-button">+ 新图片<input id="assetInput" type="file" accept="image/*" multiple hidden></label></div>
          <div class="asset-grid">${doc.assets.length?doc.assets.map(a=>`<button class="asset-card" data-asset="${a.id}" title="点击插入"><img src="${a.dataUrl}" alt="${esc(a.alt||a.name)}"><span>${esc(a.name)}</span></button>`).join(''):'<div class="empty">暂无素材</div>'}</div>
        </section>
        <section><h3>版本记录</h3><div class="versions">${store.list().slice(-8).reverse().map(v=>`<div><b>#${v.seq}</b><span>${esc(v.label)}</span><time>${new Date(v.ts).toLocaleTimeString()}</time></div>`).join('')}</div></section>
      </aside>
      <section class="panel editor-panel">
        <div class="command-box"><div class="command-label">文字指令</div><div class="command-row"><input id="commandInput" placeholder="如：添加标题：今天的思考 / 上移当前 / 删除当前"><button id="runCommand">执行</button></div><div class="hint">未识别的文字会作为新段落加入文章。</div></div>
        <div class="title-editor"><input id="titleInput" value="${esc(doc.title)}" aria-label="标题"><input id="subtitleInput" value="${esc(doc.subtitle)}" aria-label="副标题"></div>
        <div class="blocks">${doc.blocks.map(renderEditorBlock).join('')}</div>
        <div class="insert-row"><button data-add="heading">+ 标题</button><button data-add="paragraph">+ 段落</button><button data-add="quote">+ 引用</button></div>
      </section>
      <aside class="panel preview-panel">
        <div class="preview-toolbar"><div><b>微信文章实时预览</b><span>仅视觉缩放，不改变内容</span></div><div class="zoom"><button id="zoomOut">−</button><span id="zoomText">${Math.round(zoom*100)}%</span><button id="zoomIn">＋</button><button id="zoomReset">1:1</button></div></div>
        <div class="phone-stage"><article class="wechat-article" style="transform:scale(${zoom})">${renderPreview()}</article></div>
      </aside>
    </main>
    <footer class="statusbar"><span id="statusText">${esc(status)}</span><span id="revisionText">v${doc.meta.revision} · ${new Date(doc.meta.updatedAt).toLocaleTimeString()}</span></footer>
  </div>`;
  bindEvents();
}

function renderEditorBlock(b) {
  if (b.type === 'image') {
    const a = assetById(b.assetId);
    return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}">${a?`<img class="editor-image" src="${a.dataUrl}" alt="${esc(b.text)}">`:'<div class="missing">图片素材已丢失</div>'}<div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
  }
  const cls = b.type === 'heading' ? 'block-heading' : b.type === 'quote' ? 'block-quote' : 'block-paragraph';
  return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}"><div class="editable ${cls}" contenteditable="true" spellcheck="false" data-edit="${b.id}">${esc(b.text)}</div><div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
}

function renderPreview() {
  return `<h1>${esc(doc.title)}</h1><p class="subtitle">${esc(doc.subtitle)}</p><div class="meta">公众号排版 · ${new Date(doc.meta.updatedAt).toLocaleDateString()}</div>${doc.blocks.map(b=>{
    if(b.type==='heading') return `<h2>${esc(b.text)}</h2>`;
    if(b.type==='quote') return `<blockquote>${esc(b.text)}</blockquote>`;
    if(b.type==='image'){ const a=assetById(b.assetId); return a?`<figure><img src="${a.dataUrl}" alt="${esc(b.text)}"><figcaption>${esc(b.text)}</figcaption></figure>`:''; }
    return `<p>${esc(b.text)}</p>`;
  }).join('')}`;
}

function bindEvents() {
  document.querySelectorAll('[data-select]').forEach(el=>el.onclick=()=>{selectedId=el.dataset.select; render();});
  document.querySelectorAll('[data-block]').forEach(el=>el.onclick=(e)=>{ if(!e.target.closest('button')){selectedId=el.dataset.block; document.querySelectorAll('.block').forEach(x=>x.classList.toggle('selected',x.dataset.block===selectedId));}});
  document.querySelectorAll('[data-edit]').forEach(el=>{
    el.onfocus=()=>{ selectedId=el.dataset.edit; };
    el.onblur=()=>commit({type:'updateBlock', id:el.dataset.edit, text:el.textContent.trim()}, '编辑内容');
  });
  document.querySelectorAll('[data-move]').forEach(el=>el.onclick=(e)=>{selectedId=e.target.closest('[data-block]').dataset.block;commit({type:'moveSelected',direction:Number(el.dataset.move)},'移动内容');});
  document.querySelectorAll('[data-delete]').forEach(el=>el.onclick=(e)=>{selectedId=e.target.closest('[data-block]').dataset.block;commit({type:'deleteSelected'},'删除内容');});
  document.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>commit({type:'appendBlock',blockType:el.dataset.add,text:el.dataset.add==='heading'?'新标题':el.dataset.add==='quote'?'新的引用':'新的段落'},'新增内容'));
  document.querySelectorAll('[data-asset]').forEach(el=>el.onclick=()=>commit({type:'insertAsset',assetId:el.dataset.asset},'插入图片'));

  const run = ()=>{ const input=document.querySelector('#commandInput'); const text=input.value; if(commit(parseCommand(text),`指令：${text.slice(0,24)}`)) input.value=''; };
  document.querySelector('#runCommand').onclick=run;
  document.querySelector('#commandInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();run();}};
  document.querySelector('#titleInput').onchange=e=>commit({type:'setTitle',text:e.target.value.trim()},'修改标题');
  document.querySelector('#subtitleInput').onchange=e=>commit({type:'setSubtitle',text:e.target.value.trim()},'修改副标题');
  document.querySelector('#undoBtn').onclick=()=>{doc=store.undo(doc);persist();render();setStatus('已回滚一步');};
  document.querySelector('#redoBtn').onclick=()=>{doc=store.redo(doc);persist();render();setStatus('已重做一步');};
  document.querySelector('#zoomOut').onclick=()=>setZoom(zoom-.1); document.querySelector('#zoomIn').onclick=()=>setZoom(zoom+.1); document.querySelector('#zoomReset').onclick=()=>setZoom(1);
  document.querySelector('#assetInput').onchange=handleAssets;
  document.querySelector('#exportBtn').onclick=exportJson;
  document.querySelector('#importInput').onchange=importJson;
}
function setZoom(v){ zoom=Math.min(1.4,Math.max(.6,Math.round(v*10)/10)); const article=document.querySelector('.wechat-article'); article.style.transform=`scale(${zoom})`; document.querySelector('#zoomText').textContent=`${Math.round(zoom*100)}%`; }
async function handleAssets(e){
  for(const file of [...e.target.files]){
    const dataUrl=await fileToDataUrl(file);
    commit({type:'addAsset',asset:{id:crypto.randomUUID(),name:file.name,type:file.type,size:file.size,dataUrl,alt:file.name.replace(/\.[^.]+$/,'')}},`素材入库：${file.name}`);
  }
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function exportJson(){ const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wechat-layout-${doc.meta.revision}.json`;a.click();URL.revokeObjectURL(a.href);setStatus('已导出 JSON'); }
async function importJson(e){ const file=e.target.files?.[0]; if(!file)return; try{const incoming=JSON.parse(await file.text()); validateDocument(incoming); doc=store.commit(incoming,'导入文档');selectedId=doc.blocks[0]?.id||null;persist();render();setStatus('导入成功');}catch(err){setStatus(`导入失败：${err.message}`);} }
function validateDocument(v){if(!v||typeof v.title!=='string'||!Array.isArray(v.blocks)||!Array.isArray(v.assets)||!v.meta)throw new Error('文档格式不正确');}

window.wechatLayoutHarness = {
  getState: () => structuredClone(doc),
  applyIntent: (intent, label='Harness 编辑') => commit(intent, label),
  applyText: (text) => commit(parseCommand(text), `Harness：${text.slice(0,24)}`),
  addImage: ({name,type='image/png',dataUrl,alt=''}) => commit({type:'addAsset',asset:{id:crypto.randomUUID(),name,type,size:0,dataUrl,alt:alt||name}}, `Harness 素材：${name}`),
  selectBlock: (id) => { if(doc.blocks.some(b=>b.id===id)){selectedId=id;render();return true;} return false; },
  undo: () => { doc=store.undo(doc);persist();render();return structuredClone(doc); },
  redo: () => { doc=store.redo(doc);persist();render();return structuredClone(doc); },
  version: '0.1.0'
};

render();
