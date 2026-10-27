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

/**
 * Saves a conversation. Pass `id` (an id this function previously returned)
 * to update that same conversation in place — used for autosaving the
 * ongoing chat on every turn — instead of creating a new file each time.
 * Without `id`, a new one is always created (used by the manual "Save" button
 * to snapshot a named copy).
 */
export async function saveConversation(root, { id, title, model, messages }) {
  if (!messages?.length) throw new Error('Nothing to save yet.');
  await fs.mkdir(dirFor(root), { recursive: true });
  let createdAt = new Date().toISOString();
  if (id) {
    safeId(id);
    try {
      ({ createdAt } = JSON.parse(await fs.readFile(path.join(dirFor(root), `${id}.json`), 'utf8')));
    } catch {
      // Nothing saved yet under this id — fine, we're creating it now.
    }
  }
  const data = {
    id: id || makeId(),
    title: title?.trim() || defaultTitle(messages),
    model,
    createdAt,
    updatedAt: new Date().toISOString(),
    messages,
  };
  await fs.writeFile(path.join(dirFor(root), `${data.id}.json`), JSON.stringify(data, null, 2));
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
      items.push({
        id: data.id,
        title: data.title,
        model: data.model,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt || data.createdAt,
        messageCount: data.messages.length,
      });
    } catch {
      // Skip corrupted/unreadable files.
    }
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The most recently active conversation, or null if none are saved yet. */
export async function getLatestConversation(root) {
  const [latest] = await listConversations(root);
  return latest ? loadConversation(root, latest.id) : null;
}

export async function loadConversation(root, id) {
  const file = path.join(dirFor(root), `${safeId(id)}.json`);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function deleteConversation(root, id) {
  await fs.unlink(path.join(dirFor(root), `${safeId(id)}.json`));
}
