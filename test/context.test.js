import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listProjectFiles, readContextFile, resolveInsideRoot, buildMessages } from '../src/context.js';

async function makeProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lac-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'node_modules', 'dep'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'a.js'), 'console.log("a");');
  await fs.writeFile(path.join(root, 'README.md'), '# hi');
  await fs.writeFile(path.join(root, 'logo.png'), Buffer.from([0, 1, 2]));
  await fs.writeFile(path.join(root, 'node_modules', 'dep', 'index.js'), '');
  return root;
}

test('listProjectFiles skips ignored dirs and binary files', async () => {
  const root = await makeProject();
  assert.deepEqual(await listProjectFiles(root), ['README.md', 'src/a.js']);
});

test('readContextFile reads and truncates', async () => {
  const root = await makeProject();
  const file = await readContextFile(root, 'src/a.js', 5);
  assert.equal(file.content, 'conso');
  assert.equal(file.truncated, true);
});

test('readContextFile rejects binary content', async () => {
  const root = await makeProject();
  await fs.writeFile(path.join(root, 'data.txt'), Buffer.from([65, 0, 66]));
  await assert.rejects(readContextFile(root, 'data.txt'), /binary/);
});

test('resolveInsideRoot blocks path traversal', () => {
  const root = path.resolve('/project');
  assert.throws(() => resolveInsideRoot(root, '../secret.txt'), /outside/);
  assert.throws(() => resolveInsideRoot(root, '../project-other/x'), /outside/);
  assert.equal(resolveInsideRoot(root, 'src/a.js'), path.join(root, 'src', 'a.js'));
});

test('buildMessages puts system prompt and file context before history', () => {
  const msgs = buildMessages('SYS', [{ path: 'a.js', content: 'x', truncated: false }], [{ role: 'user', content: 'q' }]);
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].content, 'SYS');
  assert.match(msgs[1].content, /### File: a\.js\n```js\nx\n```/);
  assert.deepEqual(msgs[2], { role: 'user', content: 'q' });
});
