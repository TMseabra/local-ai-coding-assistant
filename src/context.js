// Reads local project files so they can be given to the model as context.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'target', 'bin', 'obj',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.pdf', '.zip', '.gz',
  '.tar', '.7z', '.exe', '.dll', '.so', '.dylib', '.bin', '.class', '.jar',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.mov', '.wav', '.lock',
]);

/** Recursively lists text files under root, as paths relative to root (forward slashes). */
export async function listProjectFiles(root, { limit = 2000 } = {}) {
  const results = [];
  async function walk(dir) {
    if (results.length >= limit) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) await walk(full);
      } else if (entry.isFile() && !BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  }
  await walk(root);
  return results;
}

/** Resolves a user-supplied path and refuses anything outside root. */
export function resolveInsideRoot(root, relPath) {
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, relPath);
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path is outside the project: ${relPath}`);
  }
  return full;
}

export async function readContextFile(root, relPath, maxBytes = config.maxFileBytes) {
  const full = resolveInsideRoot(root, relPath);
  const stat = await fs.stat(full);
  if (!stat.isFile()) throw new Error(`Not a file: ${relPath}`);
  const buf = await fs.readFile(full);
  if (buf.subarray(0, 8000).includes(0)) throw new Error(`Looks like a binary file: ${relPath}`);
  const truncated = buf.length > maxBytes;
  const content = buf.subarray(0, maxBytes).toString('utf8');
  return { path: relPath.split(path.sep).join('/'), content, truncated };
}

/** Builds the message that carries file contents to the model. */
export function buildContextMessage(files) {
  if (!files.length) return null;
  const parts = files.map((f) => {
    const ext = path.extname(f.path).slice(1);
    const note = f.truncated ? '\n(file truncated)' : '';
    return `### File: ${f.path}\n\`\`\`${ext}\n${f.content}\n\`\`\`${note}`;
  });
  return {
    role: 'system',
    content: `The user has shared these project files as context:\n\n${parts.join('\n\n')}`,
  };
}

/** Assembles the full message list: system prompt, file context, then conversation. */
export function buildMessages(systemPrompt, files, history) {
  const messages = [{ role: 'system', content: systemPrompt }];
  const ctx = buildContextMessage(files);
  if (ctx) messages.push(ctx);
  return messages.concat(history);
}
