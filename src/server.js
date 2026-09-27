// Simple local web interface. Binds to 127.0.0.1 only. Usage: npm run web -- [--dir <project>]
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, SYSTEM_PROMPT } from './config.js';
import { chat, listModels } from './ollama.js';
import { listProjectFiles, readContextFile, buildMessages } from './context.js';

const dirArg = process.argv.indexOf('--dir');
const root = path.resolve(dirArg !== -1 ? process.argv[dirArg + 1] : process.cwd());
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || '{}');
}

async function handleChat(req, res) {
  const { messages = [], files = [], model = config.model } = await readBody(req);
  const context = [];
  for (const p of files) {
    try {
      context.push(await readContextFile(root, p));
    } catch {
      // Skip files that disappeared or are unreadable.
    }
  }

  const controller = new AbortController();
  res.on('close', () => controller.abort());
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
  try {
    await chat({
      model,
      messages: buildMessages(SYSTEM_PROMPT, context, messages),
      onToken: (t) => res.write(t),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name !== 'AbortError') res.write(`\n\n[error] ${err.message}`);
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await fs.readFile(path.join(publicDir, 'index.html')));
    } else if (req.method === 'GET' && url.pathname === '/api/files') {
      sendJson(res, 200, { root, files: await listProjectFiles(root) });
    } else if (req.method === 'GET' && url.pathname === '/api/models') {
      sendJson(res, 200, { default: config.model, models: await listModels() });
    } else if (req.method === 'POST' && url.pathname === '/api/chat') {
      await handleChat(req, res);
    } else {
      sendJson(res, 404, { error: 'Not found' });
    }
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
    else res.end();
  }
});

server.listen(config.webPort, '127.0.0.1', () => {
  console.log(`Local AI Coding Assistant (web) → http://127.0.0.1:${config.webPort}`);
  console.log(`Project: ${root}`);
});
