const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { lastTurn, recentTurns, countWords } = require('../hooks/lib/transcript');

function fixture(entries) {
  const file = path.join(os.tmpdir(), `terse-fx-${Math.floor(process.hrtime()[1])}.jsonl`);
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n'));
  return file;
}

const user = (text) => ({ type: 'user', isSidechain: false, message: { content: [{ type: 'text', text }] } });
const bot = (text, sidechain = false) => ({ type: 'assistant', isSidechain: sidechain, message: { content: [{ type: 'text', text }] } });
const toolResult = () => ({ type: 'user', isSidechain: false, message: { content: [{ type: 'tool_result', content: 'ok' }] } });

const strUser = (text, extra = {}) => ({ type: 'user', isSidechain: false, message: { content: text }, ...extra });

test('slash-command bookkeeping does not reset the turn boundary', () => {
  const f = fixture([
    strUser('write the plugin'),
    bot('one two three four five six'),
    strUser('Base directory for this skill: C:/x', { isMeta: true }),
    strUser('<command-name>/compact</command-name>'),
    strUser('<local-command-stdout>Compacted</local-command-stdout>'),
    strUser('<task-notification>agent finished</task-notification>'),
  ]);
  assert.equal(lastTurn(f).words, 6);
});

test('a prompt already persisted before the hook runs is skipped', () => {
  const f = fixture([
    strUser('first'),
    bot('one two three'),
    strUser('second prompt, already on disk'),
  ]);
  assert.equal(lastTurn(f).words, 3);
});

test('non-message entry types are ignored', () => {
  const f = fixture([
    { type: 'last-prompt', value: 'x' },
    strUser('go'),
    { type: 'attachment', hookEvent: 'UserPromptSubmit' },
    bot('one two'),
    { type: 'file-history-snapshot' },
  ]);
  assert.equal(lastTurn(f).words, 2);
});

test('recentTurns counts one turn per genuine prompt', () => {
  const f = fixture([
    strUser('a'), bot('one two'),
    strUser('<command-name>/compact</command-name>'),
    bot('three four five'),
    strUser('b'), bot('six'),
  ]);
  assert.deepEqual(recentTurns(f, 10), [5, 1]);
});

test('sums every text block in the last assistant turn', () => {
  const f = fixture([user('hi'), bot('one two three'), toolResult(), bot('four five')]);
  assert.equal(lastTurn(f).words, 5);
});

test('stops at the previous real user prompt', () => {
  const f = fixture([user('a'), bot('one two three four'), user('b'), bot('five')]);
  assert.equal(lastTurn(f).words, 1);
});

test('ignores sidechain (subagent) output', () => {
  const f = fixture([user('a'), bot('kept'), bot('a b c d e f g', true)]);
  assert.equal(lastTurn(f).words, 1);
});

test('code fences do not count toward the word budget', () => {
  const f = fixture([user('a'), bot('before\n```js\nconst a = 1; const b = 2;\n```\nafter')]);
  assert.equal(lastTurn(f).words, 2);
});

test('inline code is excluded too', () => {
  assert.equal(countWords('use `some long command here` now'), 2);
});

test('malformed lines are skipped, not fatal', () => {
  const f = path.join(os.tmpdir(), `terse-bad-${Math.floor(process.hrtime()[1])}.jsonl`);
  fs.writeFileSync(f, `${JSON.stringify(user('a'))}\n{not json\n${JSON.stringify(bot('one two'))}`);
  assert.equal(lastTurn(f).words, 2);
});

test('missing file yields null rather than throwing', () => {
  assert.equal(lastTurn(path.join(os.tmpdir(), 'terse-does-not-exist.jsonl')), null);
});

test('no assistant reply yet yields null', () => {
  assert.equal(lastTurn(fixture([user('a')])), null);
});

test('recentTurns returns one count per turn', () => {
  const f = fixture([user('a'), bot('one'), user('b'), bot('one two'), user('c'), bot('one two three')]);
  assert.deepEqual(recentTurns(f, 10), [1, 2, 3]);
});
