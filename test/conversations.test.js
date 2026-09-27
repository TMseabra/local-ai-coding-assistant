import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveConversation, listConversations, loadConversation, deleteConversation } from '../src/conversations.js';

async function tmpRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'lac-conv-'));
}

test('saveConversation writes a file and derives a title', async () => {
  const root = await tmpRoot();
  const saved = await saveConversation(root, { messages: [{ role: 'user', content: 'Explain this bug' }] });
  assert.equal(saved.title, 'Explain this bug');
  assert.match(saved.id, /^\d{8}-\d{6}-[0-9a-f]{4}$/);
});

test('saveConversation rejects an empty conversation', async () => {
  const root = await tmpRoot();
  await assert.rejects(saveConversation(root, { messages: [] }), /Nothing to save/);
});

test('listConversations returns saved conversations newest first', async () => {
  const root = await tmpRoot();
  const a = await saveConversation(root, { title: 'First', messages: [{ role: 'user', content: 'a' }] });
  await new Promise((r) => setTimeout(r, 5));
  const b = await saveConversation(root, { title: 'Second', messages: [{ role: 'user', content: 'b' }] });
  const list = await listConversations(root);
  assert.deepEqual(list.map((c) => c.id), [b.id, a.id]);
});

test('listConversations returns [] when nothing was saved', async () => {
  const root = await tmpRoot();
  assert.deepEqual(await listConversations(root), []);
});

test('loadConversation round-trips messages', async () => {
  const root = await tmpRoot();
  const messages = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];
  const saved = await saveConversation(root, { messages });
  const loaded = await loadConversation(root, saved.id);
  assert.deepEqual(loaded.messages, messages);
});

test('loadConversation rejects a malformed id (path traversal guard)', async () => {
  const root = await tmpRoot();
  await assert.rejects(loadConversation(root, '../../etc/passwd'), /Invalid conversation id/);
});

test('deleteConversation removes the file', async () => {
  const root = await tmpRoot();
  const saved = await saveConversation(root, { messages: [{ role: 'user', content: 'x' }] });
  await deleteConversation(root, saved.id);
  assert.deepEqual(await listConversations(root), []);
});
