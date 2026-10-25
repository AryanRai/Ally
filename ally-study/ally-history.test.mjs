import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {ConversationHistory, speechFromDrawing} from './ally-history.mjs';
const require = createRequire(new URL('../glass-pip-chat/package.json', import.meta.url));
const {parse} = require('acorn');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-history-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'history.json');
}
test('an empty profile returns the native history response shape', t => {
  assert.deepEqual(new ConversationHistory(fixture(t)).page(), {messages: [], has_more: false});
});
test('completed turns survive a backend restart with stable IDs', t => {
  const file = fixture(t), store = new ConversationHistory(file, () => 1000);
  store.appendTurn('Question', 'Answer');
  const original = store.page();
  const restored = new ConversationHistory(file, () => 1000);
  assert.deepEqual(restored.page(), original);
  restored.appendTurn('Follow-up', 'Next answer');
  assert.equal(new Set(restored.page().messages.map(m => m.id)).size, 4);
  assert.deepEqual(restored.page().messages.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
});
test('older-page cursors neither duplicate nor omit messages', t => {
  const store = new ConversationHistory(fixture(t), () => 1000);
  for (let i = 0; i < 5; i++) store.appendTurn('Q' + i, 'A' + i);
  const all = []; let before;
  do {
    const page = store.page(3, before);
    all.unshift(...page.messages);
    if (!page.has_more) break;
    before = page.messages[0].id;
  } while (true);
  assert.deepEqual(all, store.messages);
});
test('invalid cursors and page sizes are rejected', t => {
  const store = new ConversationHistory(fixture(t));
  for (const value of [0, -1, 201, NaN, 'bad']) assert.throws(() => store.page(value));
  assert.throws(() => store.page(40, 'bad'));
});
test('a malformed saved history is preserved', t => {
  const file = fixture(t); fs.writeFileSync(file, '{broken');
  assert.throws(() => new ConversationHistory(file));
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
test('speech cues become readable conversation text', () => {
  assert.equal(speechFromDrawing('```javascript\nsay("First"); circle(1,2,3); say(`Second`);\n```', parse), 'First\n\nSecond');
});
test('drawing code and nonliteral speech arguments are never executed', () => {
  const program = 'globalThis.__ally_test_executed = true; say(globalThis.__ally_test_executed);';
  assert.equal(speechFromDrawing(program, parse), program);
  assert.equal(globalThis.__ally_test_executed, undefined);
});
