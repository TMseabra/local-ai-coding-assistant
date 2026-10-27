import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripThinking, createThinkingFilter, withNoThink } from '../src/thinking.js';

test('stripThinking removes a complete <think> block', () => {
  assert.equal(stripThinking('<think>hmm, let me see</think>The answer is 4.'), 'The answer is 4.');
});

test('stripThinking hides a still-open <think> block (mid-stream)', () => {
  assert.equal(stripThinking('Before. <think>still reasoning...'), 'Before. ');
});

test('stripThinking handles text with no <think> at all', () => {
  assert.equal(stripThinking('Just a normal answer.'), 'Just a normal answer.');
});

test('stripThinking keeps everything when showThinking is true', () => {
  const text = '<think>reasoning</think>answer';
  assert.equal(stripThinking(text, { showThinking: true }), text);
});

test('createThinkingFilter streams only newly-revealed visible text', () => {
  const feed = createThinkingFilter();
  let out = '';
  for (const chunk of ['<thi', 'nk>reasoning ', 'more</thi', 'nk>The ', 'answer.']) {
    out += feed(chunk);
  }
  assert.equal(out, 'The answer.');
});

test('createThinkingFilter holds back a tag split across chunk boundaries', () => {
  const feed = createThinkingFilter();
  const chunks = ['Before. <', 'thi', 'nk>hidden reasoning<', '/thin', 'k> After.'];
  const out = chunks.map(feed).join('');
  assert.equal(out, 'Before.  After.');
});

test('createThinkingFilter does not mangle a literal "<" at a chunk boundary', () => {
  const feed = createThinkingFilter();
  const out = ['a < b', ', and c > d'].map(feed).join('');
  assert.equal(out, 'a < b, and c > d');
});

test('createThinkingFilter with showThinking streams everything', () => {
  const feed = createThinkingFilter({ showThinking: true });
  let out = '';
  for (const chunk of ['<think>reason', 'ing</think>answer']) out += feed(chunk);
  assert.equal(out, '<think>reasoning</think>answer');
});

test('withNoThink appends the Qwen3 suppression flag', () => {
  assert.equal(withNoThink('explain this bug'), 'explain this bug /no_think');
});
