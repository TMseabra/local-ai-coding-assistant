// Saves and loads chat conversations as JSON files, so they survive closing
// the app/CLI. Stored under <project>/.lac-conversations/ (kept out of git
// via .gitignore, since chats may contain project code/context).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR_NAME = '.lac-conversations';
const ID_RE = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$/;

function dirFor(root) {
  return path.join(root, DIR_NAME);
}

function makeId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

function safeId(id) {
  if (!ID_RE.test(id)) throw new Error(`Invalid conversation id: ${id}`);
  return id;
}

function defaultTitle(messages) {
  const first = messages.find((m) => m.role === 'user')?.content || 'Untitled conversation';
  return first.length > 60 ? `${first.slice(0, 60)}…` : first;
}

export async function saveConversation(root, { title, messages }) {
  if (!messages?.length) throw new Error('Nothing to save yet.');
  await fs.mkdir(dirFor(root), { recursive: true });
  const id = makeId();
  const data = { id, title: title?.trim() || defaultTitle(messages), createdAt: new Date().toISOString(), messages };
  await fs.writeFile(path.join(dirFor(root), `${id}.json`), JSON.stringify(data, null, 2));
  return data;
}

export async function listConversations(root) {
  let entries;
  try {
    entries = await fs.readdir(dirFor(root));
  } catch {
    return [];
  }
  const items = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    try {
      const data = JSON.parse(await fs.readFile(path.join(dirFor(root), name), 'utf8'));
      items.push({ id: data.id, title: data.title, createdAt: data.createdAt, messageCount: data.messages.length });
    } catch {
      // Skip corrupted/unreadable files.
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadConversation(root, id) {
  const file = path.join(dirFor(root), `${safeId(id)}.json`);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function deleteConversation(root, id) {
  await fs.unlink(path.join(dirFor(root), `${safeId(id)}.json`));
}
