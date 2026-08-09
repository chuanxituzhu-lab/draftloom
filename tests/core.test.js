import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialDocument, parseCommand, reduceDocument, VersionStore, importArticle, getLayoutGuidance, humanizeText, renderArticleHtml } from '../src/core.js';

test('parseCommand handles title and content commands', () => {
  assert.deepEqual(parseCommand('标题：新的标题'), { type:'setTitle', text:'新的标题' });
  assert.deepEqual(parseCommand('添加段落：正文'), { type:'appendBlock', blockType:'paragraph', text:'正文' });
  assert.deepEqual(parseCommand('上移当前'), { type:'moveSelected', direction:-1 });
});

test('reduceDocument updates title without mutating source', () => {
  const doc = createInitialDocument();
  const result = reduceDocument(doc, {type:'setTitle', text:'A'});
  assert.equal(result.doc.title, 'A');
  assert.notEqual(doc.title, 'A');
});

test('selected block can be moved and deleted', () => {
  const doc = createInitialDocument();
  const id = doc.blocks[1].id;
  const moved = reduceDocument(doc, {type:'moveSelected', direction:-1}, id);
  assert.equal(moved.doc.blocks[0].id, id);
  const deleted = reduceDocument(moved.doc, {type:'deleteSelected'}, id);
  assert.equal(deleted.doc.blocks.some(b=>b.id===id), false);
});

test('version store supports bounded undo/redo snapshots', () => {
  let doc = createInitialDocument();
  const versions = new VersionStore(doc, 3);
  for (const title of ['1','2','3']) {
    doc = reduceDocument(doc,{type:'setTitle',text:title}).doc;
    doc = versions.commit(doc, `set ${title}`);
  }
  assert.equal(versions.history.length, 3);
  doc = versions.undo(doc);
  assert.equal(doc.title, '2');
  doc = versions.redo(doc);
  assert.equal(doc.title, '3');
});

test('asset can be inserted into document by id', () => {
  let doc = createInitialDocument();
  const asset = {id:'a1',name:'cover.png',type:'image/png',size:1,dataUrl:'data:image/png;base64,AA==',alt:'cover'};
  doc = reduceDocument(doc,{type:'addAsset',asset}).doc;
  const result = reduceDocument(doc,{type:'insertAsset',assetId:'a1'});
  assert.equal(result.doc.blocks.at(-1).type,'image');
  assert.equal(result.doc.blocks.at(-1).assetId,'a1');
});

test('article import creates semantic blocks and matches referenced images', () => {
  const cover = { id:'cover-1', name:'cover.png', type:'image/png', size:1, dataUrl:'data:image/png;base64,AA==', alt:'封面' };
  const doc = importArticle({
    filename: 'article.md',
    text: '# 自动排版标题\n\n## 第一节\n\n这是正文。\n\n![封面](cover.png)\n\n> 一句引用。',
    assets: [cover]
  });
  assert.equal(doc.title, '自动排版标题');
  assert.equal(doc.original.filename, 'article.md');
  assert.deepEqual(doc.blocks.map(block => block.type), ['heading', 'paragraph', 'image', 'quote']);
  assert.equal(doc.blocks[2].assetId, 'cover-1');
  assert.equal(doc.meta.importWarnings.length, 0);
});

test('layout guidance flags long text for human review', () => {
  const doc = importArticle({ text: `文章标题\n\n${'很长的正文。'.repeat(50)}` });
  const guidance = getLayoutGuidance(doc);
  assert.equal(guidance.some(item => item.text.includes('长段落')), true);
});

test('natural language supports component creation and conversion', () => {
  assert.deepEqual(parseCommand('添加列表：甲；乙'), { type: 'appendBlock', blockType: 'list', text: '甲；乙', items: ['甲', '乙'], ordered: false });
  assert.equal(parseCommand('添加表格：A|B\n1|2').blockType, 'table');
  assert.deepEqual(parseCommand('把当前改成引用'), { type: 'convertSelected', blockType: 'quote', text: undefined });
  assert.equal(parseCommand('第 3 段改成标题：关键结论').index, 2);
  assert.deepEqual(parseCommand('主题：杂志'), { type: 'setTheme', theme: 'editorial' });
  assert.deepEqual(parseCommand('去 AI 味：保守'), { type: 'humanize', mode: 'conservative' });
});

test('import creates list, table and CTA semantic blocks', () => {
  const doc = importArticle({ text: '# 标题\n\n- 甲\n- 乙\n\n|列A|列B|\n|---|---|\n|值1|值2|\n\n:::cta\ntext: 继续阅读\nbutton: 打开\n:::' });
  assert.deepEqual(doc.blocks.map(block => block.type), ['list', 'table', 'cta']);
  assert.deepEqual(doc.blocks[0].items, ['甲', '乙']);
  assert.deepEqual(doc.blocks[1].headers, ['列A', '列B']);
  assert.equal(doc.blocks[2].buttonText, '打开');
});

test('humanizer and split intents preserve a reversible document shape', () => {
  let doc = createInitialDocument();
  const paragraphId = doc.blocks[1].id;
  doc = reduceDocument(doc, { type: 'updateBlock', id: paragraphId, text: '众所周知，我们可以看到很多内容。第二句也应该保留。' }).doc;
  const natural = reduceDocument(doc, { type: 'humanize', mode: 'natural' });
  assert.equal(natural.doc.blocks[1].text.includes('众所周知'), false);
  const split = reduceDocument(natural.doc, { type: 'splitSelected' }, paragraphId);
  assert.equal(split.changed, true);
  assert.equal(split.doc.blocks.filter(block => block.type === 'paragraph').length >= 2, true);
  assert.match(renderArticleHtml({ ...split.doc, theme: 'fresh' }), /theme|wechat-article/);
  assert.equal(humanizeText('  文本  ', 'conservative'), '文本');
});
