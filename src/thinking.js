// Reasoning models (Qwen3 and similar) wrap their chain-of-thought in
// <think>...</think> before the actual answer. By default we hide that from
// the user (most people just want the answer); showThinking keeps it.

/**
 * Strips <think>...</think> spans from text. Safe to call repeatedly on a
 * growing string (e.g. on each streamed chunk): a still-open, unclosed
 * <think> is treated as "still thinking" and hidden too, until it closes.
 */
export function stripThinking(fullText, { showThinking = false } = {}) {
  if (showThinking) return fullText;
  let out = fullText.replace(/<think>[\s\S]*?<\/think>/g, '');
  const openIdx = out.indexOf('<think>');
  if (openIdx !== -1) out = out.slice(0, openIdx);
  return out;
}

// Length of the longest suffix of `str` that is also a (shorter) prefix of
// `tag` — e.g. for tag "<think>", a str ending in "...<thi" overlaps by 4.
// Used to hold back a chunk boundary that might be mid-tag.
function tagOverlap(str, tag) {
  const max = Math.min(str.length, tag.length - 1);
  for (let len = max; len > 0; len--) {
    if (str.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}

/**
 * Streaming version of stripThinking(): feed() takes the next raw chunk and
 * returns only the newly-revealed visible text, so callers can keep writing
 * tokens to a terminal/response stream as they arrive. Correctly handles a
 * <think>/</think> tag split across two chunks by holding back a possible
 * partial tag at the end of a chunk until the next one resolves it.
 */
export function createThinkingFilter({ showThinking = false } = {}) {
  if (showThinking) return (chunk) => chunk;
  let buf = '';
  let inThink = false;
  return function feed(chunk) {
    buf += chunk;
    let out = '';
    for (;;) {
      const tag = inThink ? '</think>' : '<think>';
      const idx = buf.indexOf(tag);
      if (idx !== -1) {
        if (!inThink) out += buf.slice(0, idx);
        buf = buf.slice(idx + tag.length);
        inThink = !inThink;
        continue;
      }
      // No complete tag in the buffer — flush everything except a trailing
      // slice that could still turn into one once the next chunk arrives.
      const safeLen = buf.length - tagOverlap(buf, tag);
      if (!inThink) out += buf.slice(0, safeLen);
      buf = buf.slice(safeLen);
      return out;
    }
  };
}

// Qwen3's chat template supports a soft switch: appending "/no_think" to the
// user message asks the model to skip the reasoning block entirely (faster,
// and nothing to strip afterwards).
export function withNoThink(message) {
  return `${message} /no_think`;
}
