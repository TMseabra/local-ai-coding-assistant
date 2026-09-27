// Local web interface: an HTTP server, bound to 127.0.0.1 only, that serves the
// chat UI and proxies requests to Ollama. Used both by `npm run web` (open in a
// browser) and by the Electron desktop app (electron/main.js).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, SYSTEM_PROMPT } from './config.js';
import { chat, listModels } from './ollama.js';
import { listProjectFiles, readContextFile, buildMessages } from './context.js';
import { saveConversation, listConversations, loadConversation, deleteConversation } from './conversations.js';

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

async function handleChat(req, res, root) {
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

/** Creates the HTTP server for a given project root. Does not start listening. */
export function createServer(root) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const convMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(await fs.readFile(path.join(publicDir, 'index.html')));
      } else if (req.method === 'GET' && url.pathname === '/api/files') {
        sendJson(res, 200, { root, files: await listProjectFiles(root) });
      } else if (req.method === 'GET' && url.pathname === '/api/models') {
        sendJson(res, 200, { default: config.model, models: await listModels() });
      } else if (req.method === 'POST' && url.pathname === '/api/chat') {
        await handleChat(req, res, root);
      } else if (req.method === 'GET' && url.pathname === '/api/conversations') {
        sendJson(res, 200, { conversations: await listConversations(root) });
      } else if (req.method === 'POST' && url.pathname === '/api/conversations') {
        const { title, messages } = await readBody(req);
        sendJson(res, 200, await saveConversation(root, { title, messages }));
      } else if (req.method === 'GET' && convMatch) {
        sendJson(res, 200, await loadConversation(root, convMatch[1]));
      } else if (req.method === 'DELETE' && convMatch) {
        await deleteConversation(root, convMatch[1]);
        sendJson(res, 200, { ok: true });
      } else {
        sendJson(res, 404, { error: 'Not found' });
      }
    } catch (err) {
      if (!res.headersSent) sendJson(res, err.message?.startsWith('Invalid conversation id') ? 400 : 500, { error: err.message });
      else res.end();
    }
  });
}

/**
 * Starts listening on 127.0.0.1 and resolves once bound, returning {server, port, root}.
 * Pass port: 0 to let the OS pick a free port (the actual port is returned).
 */
export function startServer({ root = process.cwd(), port = config.webPort } = {}) {
  const server = createServer(path.resolve(root));
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, root }));
  });
}

// `node src/server.js` (used by `npm run web`) starts the server directly.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirArg = process.argv.indexOf('--dir');
  const root = dirArg !== -1 ? process.argv[dirArg + 1] : process.cwd();
  const { port } = await startServer({ root });
  console.log(`Local AI Coding Assistant (web) → http://127.0.0.1:${port}`);
  console.log(`Project: ${path.resolve(root)}`);
}
