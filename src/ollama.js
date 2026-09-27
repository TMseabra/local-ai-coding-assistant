// Minimal client for the local Ollama HTTP API (https://github.com/ollama/ollama/blob/main/docs/api.md).
import { config } from './config.js';

export class OllamaError extends Error {}

async function request(path, options = {}, host = config.ollamaHost) {
  let res;
  try {
    res = await fetch(`${host}${path}`, options);
  } catch (err) {
    throw new OllamaError(
      `Could not reach Ollama at ${host}. Is it running? (start it with "ollama serve")`,
      { cause: err },
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new OllamaError(`Ollama returned ${res.status}: ${body || res.statusText}`);
  }
  return res;
}

export async function listModels(host) {
  const res = await request('/api/tags', {}, host);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}

/**
 * Streams a chat completion. Calls onToken for every chunk of text and
 * resolves with the full reply plus timing stats reported by Ollama.
 */
export async function chat({ messages, model = config.model, host, onToken = () => {}, signal }) {
  const res = await request(
    '/api/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    },
    host,
  );

  const decoder = new TextDecoder();
  let buffer = '';
  let reply = '';
  let stats = {};

  const handleLine = (line) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new OllamaError(chunk.error);
    const text = chunk.message?.content || '';
    if (text) {
      reply += text;
      onToken(text);
    }
    if (chunk.done) {
      stats = {
        evalCount: chunk.eval_count,
        evalDurationNs: chunk.eval_duration,
        totalDurationNs: chunk.total_duration,
      };
    }
  };

  // Ollama streams newline-delimited JSON.
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  }
  handleLine(buffer);

  return { reply, stats };
}

export function tokensPerSecond(stats) {
  if (!stats?.evalCount || !stats?.evalDurationNs) return null;
  return stats.evalCount / (stats.evalDurationNs / 1e9);
}
