import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chat, listModels, tokensPerSecond, OllamaError } from '../src/ollama.js';

// Fake Ollama server that streams NDJSON split across awkward chunk boundaries.
function startFakeOllama() {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:latest' }] }));
      return;
    }
    let body = '';
    for await (const c of req) body += c;
    const { model } = JSON.parse(body);
    const lines = [
      { model, message: { role: 'assistant', content: 'Hel' }, done: false },
      { model, message: { role: 'assistant', content: 'lo!' }, done: false },
      { model, message: { role: 'assistant', content: '' }, done: true, eval_count: 20, eval_duration: 2e9 },
    ].map((l) => JSON.stringify(l) + '\n').join('');
    res.write(lines.slice(0, 17));
    res.write(lines.slice(17, 90));
    res.end(lines.slice(90));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('chat streams tokens and returns stats', async () => {
  const server = await startFakeOllama();
  const host = `http://127.0.0.1:${server.address().port}`;
  const tokens = [];
  const { reply, stats } = await chat({ host, messages: [], onToken: (t) => tokens.push(t) });
  server.close();
  assert.equal(reply, 'Hello!');
  assert.deepEqual(tokens, ['Hel', 'lo!']);
  assert.equal(tokensPerSecond(stats), 10);
});

test('listModels returns model names', async () => {
  const server = await startFakeOllama();
  const models = await listModels(`http://127.0.0.1:${server.address().port}`);
  server.close();
  assert.deepEqual(models, ['qwen2.5-coder:latest']);
});

test('unreachable Ollama gives a helpful error', async () => {
  await assert.rejects(listModels('http://127.0.0.1:1'), (err) => err instanceof OllamaError && /ollama serve/.test(err.message));
});
