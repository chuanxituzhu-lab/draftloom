#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const cli = resolve(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');
const tools = [
  { name: 'publishing_state', description: '读取本地公众号文章状态', inputSchema: { type: 'object', properties: {} } },
  { name: 'publishing_import', description: '导入文章文件和本地图片并自动生成排版结构', inputSchema: { type: 'object', properties: { articlePath: { type: 'string' }, text: { type: 'string' }, images: { type: 'array', items: { type: 'string' } } } } },
  { name: 'publishing_guidance', description: '读取当前文章的人工排版指导建议', inputSchema: { type: 'object', properties: {} } },
  { name: 'publishing_draft_status', description: '检查微信公众号草稿箱授权配置状态，不泄露凭据', inputSchema: { type: 'object', properties: {} } },
  { name: 'publishing_draft_submit', description: '经显式确认后提交当前文章到微信公众号草稿箱；未配置凭据时只生成本地草稿包', inputSchema: { type: 'object', required: ['confirm'], properties: { confirm: { type: 'boolean' }, out: { type: 'string' } } } },
  { name: 'publishing_apply_text', description: '应用中文自然语言排版指令', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } },
  { name: 'publishing_humanize', description: '以自然化或保守模式处理文章文字，保留原稿以便回滚', inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['natural', 'conservative'] } } } },
  { name: 'publishing_apply_intent', description: '应用结构化公众号排版 Intent', inputSchema: { type: 'object', required: ['intent'], properties: { intent: { type: 'object' } } } },
  { name: 'publishing_export', description: '导出公众号 HTML', inputSchema: { type: 'object', required: ['out'], properties: { out: { type: 'string' } } } },
  { name: 'publishing_publish', description: '仅生成本地微信兼容 HTML、草稿 payload 与 manifest，不产生远程副作用', inputSchema: { type: 'object', properties: { out: { type: 'string' } } } }
];
const response = (id, value) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] } });
const failure = (id, message) => ({ jsonrpc: '2.0', id, error: { code: -32000, message } });
function callTool(name, input) {
  const dataArgs = process.env.WECHAT_LAYOUT_DATA ? ['--data', process.env.WECHAT_LAYOUT_DATA] : [];
  if (name === 'publishing_state') return JSON.parse(execFileSync(process.execPath, [cli, 'state', ...dataArgs], { encoding: 'utf8' }));
  if (name === 'publishing_import') {
    const args = [cli, 'import', ...dataArgs];
    if (input.articlePath) args.push('--article', input.articlePath);
    if (input.text !== undefined) args.push('--text', input.text);
    for (const image of input.images || []) args.push('--image', image);
    return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
  }
  if (name === 'publishing_guidance') return JSON.parse(execFileSync(process.execPath, [cli, 'guidance', ...dataArgs], { encoding: 'utf8' }));
  if (name === 'publishing_draft_status') return JSON.parse(execFileSync(process.execPath, [cli, 'draft-status', ...dataArgs], { encoding: 'utf8' }));
  if (name === 'publishing_draft_submit') {
    const args = [cli, 'draft-submit', '--confirm', input.confirm === true ? 'true' : 'false', ...dataArgs];
    if (input.out) args.push('--out', input.out);
    return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
  }
  if (name === 'publishing_apply_text') return JSON.parse(execFileSync(process.execPath, [cli, 'text', '--text', input.text, ...dataArgs], { encoding: 'utf8' }));
  if (name === 'publishing_humanize') return JSON.parse(execFileSync(process.execPath, [cli, 'humanize', '--mode', input.mode === 'conservative' ? 'conservative' : 'natural', ...dataArgs], { encoding: 'utf8' }));
  if (name === 'publishing_apply_intent') return JSON.parse(execFileSync(process.execPath, [cli, 'intent', '--json', JSON.stringify(input.intent), ...dataArgs], { encoding: 'utf8' }));
  if (name === 'publishing_export') return JSON.parse(execFileSync(process.execPath, [cli, 'export', '--out', input.out, ...dataArgs], { encoding: 'utf8' }));
  if (name === 'publishing_publish') {
    const args = [cli, 'publish', ...dataArgs];
    if (input.out) args.push('--out', input.out);
    return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
  }
  throw new Error(`Unknown tool: ${name}`);
}
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  if (!line.trim()) return;
  let request; try { request = JSON.parse(line); } catch { process.stdout.write(JSON.stringify(failure(null, 'Invalid JSON')) + '\n'); return; }
  if (request.method === 'notifications/initialized') return;
  if (request.method === 'initialize') { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'wechat-layout-mvp', version: '0.1.0' } } }) + '\n'); return; }
  if (request.method === 'tools/list') { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { tools } }) + '\n'); return; }
  if (request.method === 'tools/call') { try { process.stdout.write(JSON.stringify(response(request.id, callTool(request.params?.name, request.params?.arguments || {}))) + '\n'); } catch (error) { process.stdout.write(JSON.stringify(failure(request.id, error.message)) + '\n'); } return; }
  if (request.id !== undefined) process.stdout.write(JSON.stringify(failure(request.id, `Method not found: ${request.method}`)) + '\n');
});
