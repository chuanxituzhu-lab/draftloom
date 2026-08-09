import { createInitialDocument, parseCommand, reduceDocument, VersionStore, importArticle, getLayoutGuidance, THEMES, normalizeTheme, renderDocumentBody, renderArticleHtml } from './core.js';

const STORAGE_KEY = 'wechat-layout-mvp:v0.1';
const MAX_ASSETS = 200;
let doc = loadDocument() || createInitialDocument();
let selectedId = doc.blocks[0]?.id || null;
let zoom = 1;
let store = new VersionStore(doc);
let status = '就绪';
let libraryTab = 'mine';
let assetQuery = '';
let assetSort = 'recent';
let assetFilter = 'all';
let authPollTimer = null;
let autoSubmitAfterAuth = false;

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
function assetInUse(assetId) {
  return doc.blocks.some(block => block.assetId === assetId || (block.assetIds || []).includes(assetId));
}
function renderLibraryPane() {
  const tabs = [['mine', '我的素材'], ['resource', '资源库'], ['script', '文字稿']].map(([id, label]) => `<button class="library-tab ${libraryTab === id ? 'active' : ''}" data-library-tab="${id}">${label}</button>`).join('');
  if (libraryTab === 'script') {
    const source = doc.original?.text || doc.blocks.filter(block => block.type !== 'image').map(block => block.text || '').join('\n\n');
    return `<div class="library-header"><div class="library-tabs">${tabs}</div><div class="script-tools"><span>原稿文字（只读保护）</span><button data-copy-script>复制</button></div></div><textarea class="script-view" readonly>${esc(source)}</textarea>`;
  }
  const query = assetQuery.trim().toLowerCase();
  let assets = doc.assets.filter(asset => (!query || `${asset.name} ${asset.alt || ''}`.toLowerCase().includes(query)) && (assetFilter !== 'unused' || !assetInUse(asset.id)));
  if (assetSort === 'name') assets = [...assets].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const scopeLabel = libraryTab === 'resource' ? '本地资源库 · 可跨文章复用' : '先上传，后续可反复插入或替换';
  const cards = assets.length ? assets.map(a => `<div class="asset-card" data-asset-card="${a.id}"><img src="${a.dataUrl}" alt="${esc(a.alt||a.name)}"><span title="${esc(a.name)}">${esc(a.name)}</span><small>${assetInUse(a.id) ? '文章使用中' : '可删除'}</small><div class="asset-actions"><button data-asset-insert="${a.id}" title="在文章末尾插入">插入</button><button data-asset-replace="${a.id}" title="替换当前选中的图片">替换当前</button><button data-asset-delete="${a.id}" title="从素材库删除">删除</button></div></div>`).join('') : `<div class="empty library-empty">${query ? '没有匹配的素材' : '暂无素材，可点击“上传素材”添加'}</div>`;
  return `<div class="library-header"><div class="library-tabs">${tabs}</div><div class="library-toolbar"><input id="assetSearch" value="${esc(assetQuery)}" placeholder="搜索素材"><button data-library-sort title="${assetSort === 'name' ? '恢复最近添加排序' : '按名称排序'}">↕</button><button data-library-filter class="${assetFilter === 'unused' ? 'active' : ''}" title="只看未使用素材">⌁</button></div><div class="library-meta"><span>${scopeLabel}</span><span>${doc.assets.length}/${MAX_ASSETS}</span><label class="mini-button">+ 上传素材<input id="assetInput" type="file" accept="image/*" multiple hidden></label></div></div><div class="asset-grid">${cards}</div><div class="library-footer"><span>支持批量上传 · 大图自动压缩</span><button data-clear-unused>清理未使用</button></div>`;
}
function refreshLibraryPane() {
  const pane = document.querySelector('#libraryPane');
  if (!pane) return;
  pane.innerHTML = renderLibraryPane();
  bindLibraryEvents();
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
        <button id="draftBtn" class="primary-button">导出到微信草稿箱</button><button id="exportHtmlBtn">导出微信 HTML</button><button id="exportJsonBtn">备份 JSON</button>
        <label class="button">恢复 JSON<input id="importInput" type="file" accept="application/json" hidden></label>
        <label class="button primary-button">导入文章+图片<input id="articleImportInput" type="file" accept=".md,.markdown,.txt,text/plain,image/*" multiple hidden></label>
      </div>
    </header>
    <main class="workspace">
      <aside class="panel left-panel">
        <section class="library-section"><div id="libraryPane">${renderLibraryPane()}</div></section>
        <section class="outline-section"><div class="section-head"><h3>文章结构</h3><span class="hint">${doc.blocks.length} 个区块</span></div><div class="outline">${doc.blocks.map((b,i)=>`<button class="outline-item ${b.id===selectedId?'active':''}" data-select="${b.id}"><span>${i+1}</span>${b.type==='image'?'图片':esc(b.text.slice(0,18)||'空内容')}</button>`).join('')}</div></section>
        <section><h3>版本记录</h3><div class="versions">${store.list().slice(-8).reverse().map(v=>`<div><b>#${v.seq}</b><span>${esc(v.label)}</span><time>${new Date(v.ts).toLocaleTimeString()}</time></div>`).join('')}</div></section>
      </aside>
      <section class="panel editor-panel">
        <div id="importDrop" class="import-drop"><strong>拖入文章或图片，自动排版</strong><span>支持 Markdown / TXT 与多张本地图片；导入后可继续人工调整</span></div>
        <div class="command-box"><div class="command-label">文字指令</div><div class="command-row"><textarea id="commandInput" rows="1" placeholder="如：把当前改成引用 / 拆分当前段落 / 添加表格：列1|列2"></textarea><button id="runCommand">执行</button></div><div class="hint">支持按区块转换、拆分、主题切换和组件创建；表格可用换行或分号分隔；未识别的文字会作为新段落。</div></div>
        <div class="guidance-box"><div class="command-label">自动排版指导</div><div id="guidanceList">${renderGuidance()}</div></div>
        <div class="humanizer-box"><div class="command-label">去 AI 味</div><div class="humanizer-row"><select id="humanizerMode"><option value="natural" ${doc.meta.humanizer?.mode === 'natural' ? 'selected' : ''}>自然化</option><option value="conservative" ${doc.meta.humanizer?.mode === 'conservative' ? 'selected' : ''}>保守调整</option></select><button id="humanizeBtn">应用到正文</button></div><div class="hint">本地确定性处理，原稿保存在导入记录中，可随时回滚。</div></div>
        <div class="title-editor"><input id="titleInput" value="${esc(doc.title)}" aria-label="标题"><input id="subtitleInput" value="${esc(doc.subtitle)}" aria-label="副标题"></div>
        <div class="blocks">${doc.blocks.map(renderEditorBlock).join('')}</div>
        <div class="insert-row"><button data-add="heading">+ 标题</button><button data-add="paragraph">+ 段落</button><button data-add="quote">+ 引用</button><button data-add="list">+ 列表</button><button data-add="table">+ 表格</button><button data-add="cta">+ CTA</button><button data-add="gallery">+ 画廊</button><button data-add="media">+ 媒体</button></div>
      </section>
      <aside class="panel preview-panel">
        <div class="preview-toolbar"><div><b>微信文章实时预览</b><span>仅视觉缩放，不改变内容</span></div><div class="preview-controls"><label>主题<select id="themeSelect">${Object.values(THEMES).map(theme => `<option value="${theme.id}" ${normalizeTheme(doc.theme) === theme.id ? 'selected' : ''}>${theme.label}</option>`).join('')}</select></label><div class="zoom"><button id="zoomOut">−</button><span id="zoomText">${Math.round(zoom*100)}%</span><button id="zoomIn">＋</button><button id="zoomReset">1:1</button></div></div></div>
        <div class="phone-stage"><article class="wechat-article theme-${normalizeTheme(doc.theme)}" style="transform:scale(${zoom})">${renderPreview()}</article></div>
      </aside>
    </main>
    <footer class="statusbar"><span id="statusText">${esc(status)}</span><span id="revisionText">v${doc.meta.revision} · ${new Date(doc.meta.updatedAt).toLocaleTimeString()}</span></footer>
    <dialog id="draftDialog"><form method="dialog" class="draft-dialog"><div class="draft-dialog-head"><div><strong>导出到微信草稿箱</strong><p>先生成微信兼容草稿包，再按授权配置提交到公众号草稿箱。</p></div><button value="cancel" aria-label="关闭">×</button></div><div class="draft-status" id="draftStatus">正在检查本机授权配置…</div><div id="qrAuthBox" class="qr-auth" hidden></div><div class="draft-note"><b>授权说明</b><span>二维码由已配置的授权适配器提供；扫码完成后，适配器只需向本机回调地址提交凭据。凭据保存在本机 .local-data，下次启动自动复用。</span></div><div class="draft-actions"><button id="localDraftBtn" type="button">仅生成本地草稿包</button><button id="submitDraftBtn" type="button" class="primary-button">提交到公众号草稿箱</button></div><div class="draft-foot">JSON 仅用于备份与 Agent/MCP 交换，不是微信发布格式。</div></form></dialog>
  </div>`;
  bindEvents();
}

function renderEditorBlock(b) {
  if (b.type === 'image') {
    const a = assetById(b.assetId);
    return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}">${a?`<img class="editor-image" src="${a.dataUrl}" alt="${esc(b.text)}">`:'<div class="missing">图片素材已丢失</div>'}<div class="image-replace-hint">先选中图片，再点击素材库里的“替换当前”</div><div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
  }
  if (b.type === 'list') {
    return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}"><div class="special-label">${b.ordered?'有序':'无序'}列表</div><textarea class="special-editor" data-list-edit="${b.id}">${esc((b.items || b.text?.split('\n') || []).join('\n'))}</textarea><div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
  }
  if (b.type === 'table') {
    const value = [b.headers || [], ...(b.rows || [])].map(row => row.join(' | ')).join('\n');
    return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}"><div class="special-label">数据表格</div><textarea class="special-editor" data-table-edit="${b.id}">${esc(value)}</textarea><div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
  }
  if (b.type === 'cta') {
    return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}"><div class="special-label">CTA · ${esc(b.buttonText || '立即了解')}</div><div class="editable block-cta" contenteditable="true" spellcheck="false" data-component-edit="${b.id}">${esc(b.text)}</div><div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
  }
  if (b.type === 'gallery') {
    const images = (b.assetIds || []).map(assetById).filter(Boolean).map(asset => `<img src="${asset.dataUrl}" alt="${esc(asset.alt || asset.name)}">`).join('');
    return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}"><div class="special-label">画廊 · ${b.assetIds?.length || 0} 张图片</div><div class="editor-gallery">${images || '<span>请使用“添加画廊：图片名”插入素材</span>'}</div><div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
  }
  if (b.type === 'media') {
    return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}"><div class="special-label">媒体 · ${esc(b.mediaType || 'video')}</div><div class="editable block-media" contenteditable="true" spellcheck="false" data-component-edit="${b.id}">${esc(b.text)}</div><div class="hint">${esc(b.url || '未设置媒体地址')}</div><div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
  }
  const cls = b.type === 'heading' ? 'block-heading' : b.type === 'quote' ? 'block-quote' : 'block-paragraph';
  return `<div class="block ${b.id===selectedId?'selected':''}" data-block="${b.id}"><div class="editable ${cls}" contenteditable="true" spellcheck="false" data-edit="${b.id}">${esc(b.text)}</div><div class="block-tools"><button data-move="-1">↑</button><button data-move="1">↓</button><button data-delete>删除</button></div></div>`;
}

function renderPreview() {
  return renderDocumentBody(doc);
}

function renderGuidance() {
  return getLayoutGuidance(doc).map(item => {
    const icon = item.level === 'ok' ? '✓' : item.level === 'error' ? '!' : '•';
    const action = item.command ? `<button class="guidance-action" data-guidance="${esc(item.command)}">带入指令</button>` : '';
    return `<div class="guidance-item guidance-${item.level}"><span>${icon}</span><p>${esc(item.text)}</p>${action}</div>`;
  }).join('');
}

function bindLibraryEvents() {
  document.querySelectorAll('[data-library-tab]').forEach(el => el.onclick = () => { libraryTab = el.dataset.libraryTab; assetQuery = ''; assetFilter = 'all'; refreshLibraryPane(); });
  const search = document.querySelector('#assetSearch');
  if (search) search.oninput = e => { assetQuery = e.target.value; refreshLibraryPane(); const next = document.querySelector('#assetSearch'); next?.focus(); next?.setSelectionRange(assetQuery.length, assetQuery.length); };
  const sort = document.querySelector('[data-library-sort]');
  if (sort) sort.onclick = () => { assetSort = assetSort === 'name' ? 'recent' : 'name'; refreshLibraryPane(); };
  const filter = document.querySelector('[data-library-filter]');
  if (filter) filter.onclick = () => { assetFilter = assetFilter === 'unused' ? 'all' : 'unused'; refreshLibraryPane(); };
  const input = document.querySelector('#assetInput');
  if (input) input.onchange = handleAssets;
  document.querySelectorAll('[data-asset-insert]').forEach(el => el.onclick = e => { e.stopPropagation(); commit({type:'insertAsset', assetId:el.dataset.assetInsert}, '从素材库插入图片'); });
  document.querySelectorAll('[data-asset-replace]').forEach(el => el.onclick = e => { e.stopPropagation(); commit({type:'replaceSelectedAsset', assetId:el.dataset.assetReplace}, '从素材库替换图片'); });
  document.querySelectorAll('[data-asset-delete]').forEach(el => el.onclick = e => { e.stopPropagation(); commit({type:'deleteAsset', assetId:el.dataset.assetDelete}, '删除素材'); });
  const clearUnused = document.querySelector('[data-clear-unused]');
  if (clearUnused) clearUnused.onclick = () => commit({type:'deleteUnusedAssets'}, '清理未使用素材');
  const copyScript = document.querySelector('[data-copy-script]');
  if (copyScript) copyScript.onclick = async () => { const source = doc.original?.text || ''; try { await navigator.clipboard.writeText(source); setStatus('文字稿已复制'); } catch { setStatus('复制失败，请手动选择文字稿'); } };
}

function bindEvents() {
  document.querySelectorAll('[data-select]').forEach(el=>el.onclick=()=>{selectedId=el.dataset.select; render();});
  document.querySelectorAll('[data-block]').forEach(el=>el.onclick=(e)=>{ if(!e.target.closest('button')){selectedId=el.dataset.block; document.querySelectorAll('.block').forEach(x=>x.classList.toggle('selected',x.dataset.block===selectedId));}});
  document.querySelectorAll('[data-edit]').forEach(el=>{
    el.onfocus=()=>{ selectedId=el.dataset.edit; };
    el.onblur=()=>commit({type:'updateBlock', id:el.dataset.edit, text:el.textContent.trim()}, '编辑内容');
  });
  document.querySelectorAll('[data-list-edit]').forEach(el=>{
    el.onfocus=()=>{ selectedId=el.dataset.listEdit; };
    el.onblur=()=>{ const items=el.value.split(/\n+/).map(item=>item.trim()).filter(Boolean); commit({type:'updateBlock', id:el.dataset.listEdit, text:items.join('\n'), items}, '编辑列表'); };
  });
  document.querySelectorAll('[data-table-edit]').forEach(el=>{
    el.onfocus=()=>{ selectedId=el.dataset.tableEdit; };
    el.onblur=()=>{ const rows=el.value.split(/\n+/).map(row=>row.split('|').map(cell=>cell.trim()).filter(Boolean)).filter(row=>row.length); commit({type:'updateBlock', id:el.dataset.tableEdit, text:'数据表格', headers:rows[0]||[], rows:rows.slice(1)}, '编辑表格'); };
  });
  document.querySelectorAll('[data-component-edit]').forEach(el=>{
    el.onfocus=()=>{ selectedId=el.dataset.componentEdit; };
    el.onblur=()=>commit({type:'updateBlock', id:el.dataset.componentEdit, text:el.textContent.trim()}, '编辑组件');
  });
  document.querySelectorAll('[data-move]').forEach(el=>el.onclick=(e)=>{selectedId=e.target.closest('[data-block]').dataset.block;commit({type:'moveSelected',direction:Number(el.dataset.move)},'移动内容');});
  document.querySelectorAll('[data-delete]').forEach(el=>el.onclick=(e)=>{selectedId=e.target.closest('[data-block]').dataset.block;commit({type:'deleteSelected'},'删除内容');});
  document.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{
    const type=el.dataset.add;
    const defaults={heading:{text:'新标题',level:2},paragraph:{text:'新的段落'},quote:{text:'新的引用'},list:{text:'项目一\n项目二',items:['项目一','项目二']},table:{text:'数据表格',headers:['列1','列2'],rows:[['内容','备注']]},cta:{text:'欢迎继续阅读',buttonText:'立即了解'},gallery:{text:'图片组',assetIds:[]},media:{text:'媒体内容',mediaType:'video',url:''}};
    commit({type:'appendBlock',blockType:type,...defaults[type]},'新增内容');
  });
  const run = ()=>{ const input=document.querySelector('#commandInput'); const text=input.value; if(commit(parseCommand(text),`指令：${text.slice(0,24)}`)) input.value=''; };
  document.querySelector('#runCommand').onclick=run;
  document.querySelector('#commandInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();run();}};
  document.querySelector('#titleInput').onchange=e=>commit({type:'setTitle',text:e.target.value.trim()},'修改标题');
  document.querySelector('#subtitleInput').onchange=e=>commit({type:'setSubtitle',text:e.target.value.trim()},'修改副标题');
  document.querySelector('#humanizeBtn').onclick=()=>{const mode=document.querySelector('#humanizerMode').value;commit({type:'humanize',mode},`去 AI 味：${mode==='natural'?'自然化':'保守调整'}`);};
  document.querySelector('#themeSelect').onchange=e=>commit({type:'setTheme',theme:e.target.value},'切换主题');
  document.querySelector('#undoBtn').onclick=()=>{doc=store.undo(doc);persist();render();setStatus('已回滚一步');};
  document.querySelector('#redoBtn').onclick=()=>{doc=store.redo(doc);persist();render();setStatus('已重做一步');};
  document.querySelector('#zoomOut').onclick=()=>setZoom(zoom-.1); document.querySelector('#zoomIn').onclick=()=>setZoom(zoom+.1); document.querySelector('#zoomReset').onclick=()=>setZoom(1);
  document.querySelector('#draftBtn').onclick=openDraftDialog;
  document.querySelector('#exportJsonBtn').onclick=exportJson;
  document.querySelector('#localDraftBtn').onclick=()=>{exportDraftBundle();document.querySelector('#draftDialog')?.close();};
  document.querySelector('#submitDraftBtn').onclick=submitDraftToWechat;
  document.querySelector('#exportHtmlBtn').onclick=exportHtml;
  document.querySelector('#importInput').onchange=importJson;
  document.querySelector('#articleImportInput').onchange=e=>handleArticleImport(e.target.files);
  const drop = document.querySelector('#importDrop');
  drop.onclick=()=>document.querySelector('#articleImportInput').click();
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging');};
  drop.ondragleave=()=>drop.classList.remove('dragging');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');const files=e.dataTransfer.files;if(files.length)handleArticleImport(files);else{const text=e.dataTransfer.getData('text/plain');if(text)handleArticleImport([],text);}};
  document.querySelectorAll('[data-guidance]').forEach(el=>el.onclick=()=>{const input=document.querySelector('#commandInput');input.value=el.dataset.guidance;input.focus();});
  bindLibraryEvents();
}
function setZoom(v){ zoom=Math.min(1.4,Math.max(.6,Math.round(v*10)/10)); const article=document.querySelector('.wechat-article'); article.style.transform=`scale(${zoom})`; document.querySelector('#zoomText').textContent=`${Math.round(zoom*100)}%`; }
async function handleAssets(e){
  const files=[...e.target.files].slice(0, Math.max(0, MAX_ASSETS - doc.assets.length));
  if(!files.length)return;
  try {
    setStatus(`正在处理 ${files.length} 张图片…`);
    const assets=await Promise.all(files.map(async file=>{
      const prepared=await optimizeImageFile(file);
      return {id:crypto.randomUUID(),name:file.name,type:prepared.type,size:prepared.size,dataUrl:prepared.dataUrl,alt:file.name.replace(/\.[^.]+$/,'')};
    }));
    if(commit({type:'addAssets',assets},`素材批量入库：${assets.length} 张`)) setStatus(`已上传 ${assets.length} 张，可从素材库直接调用`);
    if (e.target.files.length > files.length) setStatus(`已达到素材容量 ${MAX_ASSETS} 张，超出部分未导入`);
  } catch(err) { setStatus(`素材上传失败：${err.message}`); }
  e.target.value='';
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
async function optimizeImageFile(file){
  const original=await fileToDataUrl(file);
  if(!/^image\/(png|jpe?g|webp)$/i.test(file.type)||file.size<220000)return {dataUrl:original,type:file.type||'image/png',size:file.size};
  const image=await new Promise((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=reject;element.src=original;});
  const maxEdge=1600, scale=Math.min(1,maxEdge/image.naturalWidth,maxEdge/image.naturalHeight);
  if(scale===1&&file.size<550000)return {dataUrl:original,type:file.type,size:file.size};
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const dataUrl=canvas.toDataURL('image/jpeg',0.82);
  return {dataUrl,type:'image/jpeg',size:Math.round((dataUrl.length*3)/4)};
}
function exportJson(){ const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wechat-layout-${doc.meta.revision}.json`;a.click();URL.revokeObjectURL(a.href);setStatus('已导出 JSON'); }
function exportHtml(){ const html=renderArticleHtml(doc); const blob=new Blob([html],{type:'text/html;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wechat-layout-${doc.meta.revision}.html`;a.click();URL.revokeObjectURL(a.href);setStatus('已导出 HTML'); }
function createDraftBundle(){
  const html=renderArticleHtml(doc);
  return {format:'wechat-draft-bundle-v1',generatedAt:new Date().toISOString(),revision:doc.meta.revision,payload:{articles:[{title:doc.title,author:'',digest:doc.subtitle||'',content:html,content_source_url:''}]},html};
}
function exportDraftBundle(){ const blob=new Blob([JSON.stringify(createDraftBundle(),null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wechat-draft-${doc.meta.revision}.json`;a.click();URL.revokeObjectURL(a.href);setStatus('已生成本地微信草稿包'); }
async function openDraftDialog(){
  const dialog=document.querySelector('#draftDialog');
  if(!dialog)return;
  if(!dialog.open) dialog.showModal();
  const statusEl=document.querySelector('#draftStatus');
  try {
    const response=await fetch('/api/wechat/status');
    const value=await response.json();
    statusEl.textContent=value.authorized?(autoSubmitAfterAuth?'授权成功，正在上传图片并创建公众号草稿…':'已完成公众号授权，本机凭据会自动复用。'):value.remoteReady?'已检测到微信接口配置，可提交草稿。':'当前为本地模式：尚未完成公众号授权。';
    statusEl.className=`draft-status ${value.remoteReady?'ready':'local'}`;
    renderAuthBox(value);
    const submitButton=document.querySelector('#submitDraftBtn');
    if(submitButton) submitButton.textContent=value.authorized?'提交到公众号草稿箱':value.qrAuthorization?'授权后自动上传草稿':'生成本地草稿包';
    clearTimeout(authPollTimer);
    if (!value.authorized) authPollTimer=setTimeout(()=>{ if(dialog.open) openDraftDialog(); }, 2500);
    else if (autoSubmitAfterAuth) { autoSubmitAfterAuth=false; clearTimeout(authPollTimer); await submitDraftToWechat({skipConfirm:true}); }
  } catch { statusEl.textContent='本地服务未提供微信接口状态，将只生成本地草稿包。'; statusEl.className='draft-status local'; }
}
function renderAuthBox(value={}){
  const qrBox=document.querySelector('#qrAuthBox');
  if(!qrBox)return;
  qrBox.hidden=false;
  const image=value.qrImageUrl?`<img class="qr-auth-image" src="${esc(value.qrImageUrl)}" alt="公众号授权二维码">`:'';
  const link=value.qrAuthUrl?`<a href="${esc(value.qrAuthUrl)}" target="_blank" rel="noreferrer">在新窗口打开授权页</a>`:'';
  const callback=value.callbackUrl?`<code>${esc(value.callbackUrl)}</code>`:'';
  qrBox.innerHTML=value.qrAuthorization?`<strong>扫码授权公众号</strong>${image}<div>${link}</div><small>扫码后等待本窗口自动刷新。授权适配器回调地址：${callback}</small>`:`<strong>尚未显示二维码</strong><p>请在启动本机服务前配置 WECHAT_QR_IMAGE_URL（二维码图片）或 WECHAT_QR_AUTH_URL（授权页），并让适配器把 access_token 通过 POST 回调到本机。</p><small>本机回调地址：${callback}</small>`;
}
async function submitDraftToWechat({skipConfirm=false}={}){
  const statusEl=document.querySelector('#draftStatus');
  try {
    const statusResponse=await fetch('/api/wechat/status');
    if (!statusResponse.ok) { exportDraftBundle(); document.querySelector('#draftDialog')?.close(); setStatus('本地服务尚未重启，已生成本地微信草稿包'); return; }
    const statusInfo=await statusResponse.json();
    if(!statusInfo.remoteReady){
      if(statusInfo.qrAuthorization){
        if(!window.confirm('确认扫码授权后自动上传图片并创建公众号草稿吗？完成后仍需在公众号后台人工审核发送。'))return;
        autoSubmitAfterAuth=true;
        statusEl.textContent='等待扫码授权…授权成功后将自动上传图片并创建草稿。';
        return;
      }
      exportDraftBundle(); if(document.querySelector('#draftDialog')?.open)document.querySelector('#draftDialog').close(); return;
    }
    if(!skipConfirm && !window.confirm('确认将当前文章提交到已配置的公众号草稿箱吗？'))return;
    statusEl.textContent='正在上传图片并提交草稿…';
    const response=await fetch('/api/wechat/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({doc,confirm:true})});
    const result=await response.json();
    if(!response.ok||result.error)throw new Error(result.error||'提交失败');
    const draftId=result.delivery?.draftId?`（草稿编号：${result.delivery.draftId}）`:'';
    statusEl.textContent=result.delivery?.status==='submitted'?`已提交到公众号草稿箱${draftId}。`:'已生成本地草稿包。';
    setStatus(result.delivery?.status==='submitted'?`草稿已进入公众号草稿箱${draftId}，请人工审核后发送`:'已生成本地微信草稿包');
  } catch(error) { statusEl.textContent=`提交失败：${error.message}`; setStatus(`草稿导出失败：${error.message}`); }
}
async function importJson(e){ const file=e.target.files?.[0]; if(!file)return; try{const incoming=JSON.parse(await file.text()); validateDocument(incoming); doc=store.commit(incoming,'导入文档');selectedId=doc.blocks[0]?.id||null;persist();render();setStatus('导入成功');}catch(err){setStatus(`导入失败：${err.message}`);} }
async function handleArticleImport(fileList=[], pastedText=''){
  try {
    const files=[...fileList];
    const articleFile=files.find(file=>/\.(md|markdown|txt)$/i.test(file.name)||file.type.startsWith('text/'));
    const imageFiles=files.filter(file=>file.type.startsWith('image/')||/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name));
    const text=articleFile?await articleFile.text():pastedText;
    if(!text&&!imageFiles.length) throw new Error('没有找到文章文字或图片');
    const assets=await Promise.all(imageFiles.map(async file=>{const prepared=await optimizeImageFile(file);return {id:crypto.randomUUID(),name:file.name,type:prepared.type,size:prepared.size,dataUrl:prepared.dataUrl,alt:file.name.replace(/\.[^.]+$/,'')};}));
    const incoming=importArticle({text,filename:articleFile?.name||'pasted-article.txt',assets});
    if(commit({type:'replaceDocument',doc:incoming},`自动排版导入：${articleFile?.name||`${assets.length} 张图片`}`)){
      const warnings=incoming.meta.importWarnings||[];
      setStatus(warnings.length?`导入完成，${warnings.length} 条提示`:'导入完成，可继续人工指导编辑');
    }
  } catch(err) { setStatus(`导入失败：${err.message}`); }
}
function validateDocument(v){if(!v||typeof v.title!=='string'||!Array.isArray(v.blocks)||!Array.isArray(v.assets)||!v.meta)throw new Error('文档格式不正确');}

window.wechatLayoutHarness = {
  getState: () => structuredClone(doc),
  applyIntent: (intent, label='Harness 编辑') => commit(intent, label),
  applyText: (text) => commit(parseCommand(text), `Harness：${text.slice(0,24)}`),
  importArticle: ({text,filename='pasted-article.txt',assets=[]}) => { const incoming=importArticle({text,filename,assets}); const changed=commit({type:'replaceDocument',doc:incoming},`Harness 导入：${filename}`); return changed ? {doc:structuredClone(doc),guidance:getLayoutGuidance(doc)} : null; },
  getLayoutGuidance: () => getLayoutGuidance(doc),
  addImage: ({name,type='image/png',dataUrl,alt=''}) => commit({type:'addAsset',asset:{id:crypto.randomUUID(),name,type,size:0,dataUrl,alt:alt||name}}, `Harness 素材：${name}`),
  replaceSelectedImage: (assetId) => commit({type:'replaceSelectedAsset',assetId}, 'Harness 替换图片'),
  deleteImage: (assetId) => commit({type:'deleteAsset',assetId}, 'Harness 删除素材'),
  selectBlock: (id) => { if(doc.blocks.some(b=>b.id===id)){selectedId=id;render();return true;} return false; },
  undo: () => { doc=store.undo(doc);persist();render();return structuredClone(doc); },
  redo: () => { doc=store.redo(doc);persist();render();return structuredClone(doc); },
  version: '0.1.0'
};

render();
