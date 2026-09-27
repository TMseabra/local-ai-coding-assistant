// Runtime configuration. Everything can be overridden with environment variables.
export const config = {
  ollamaHost: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  model: process.env.LAC_MODEL || 'qwen2.5-coder',
  webPort: Number(process.env.LAC_PORT) || 3000,
  // Upper bound on the size of a single file sent as context.
  maxFileBytes: Number(process.env.LAC_MAX_FILE_BYTES) || 100_000,
};

export const SYSTEM_PROMPT = `You are a helpful coding assistant running fully offline on the user's machine.
Answer concisely and precisely. When you show code, use fenced code blocks with a language tag.
When project files are provided as context, base your answers on them and reference files by path.
If you are not sure about something, say so instead of guessing.`;
