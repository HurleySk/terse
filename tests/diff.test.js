const { test } = require('node:test');
const assert = require('node:assert');
const { addedLineIndexes, applyEdit } = require('../hooks/lib/diff');

test('new file marks every line added', () => {
  assert.deepEqual(addedLineIndexes('', 'a\nb\nc'), [0, 1, 2]);
});

test('unchanged lines are not added', () => {
  assert.deepEqual(addedLineIndexes('a\nb', 'a\nb'), []);
});

test('only genuinely new lines are reported', () => {
  assert.deepEqual(addedLineIndexes('a\nb', 'a\nNEW\nb'), [1]);
});

test('duplicate lines are matched by count, not presence', () => {
  assert.deepEqual(addedLineIndexes('x', 'x\nx'), [1]);
});

test('leading whitespace changes do not count as additions', () => {
  assert.deepEqual(addedLineIndexes('  a', '    a'), []);
});

test('applyEdit replaces the first occurrence', () => {
  assert.equal(applyEdit('a b a', 'a', 'Z', false), 'Z b a');
});

test('applyEdit replaces all when asked', () => {
  assert.equal(applyEdit('a b a', 'a', 'Z', true), 'Z b Z');
});

test('applyEdit returns null when the anchor is missing', () => {
  assert.equal(applyEdit('abc', 'zzz', 'Z', false), null);
});

test('empty old_string means full replacement', () => {
  assert.equal(applyEdit('abc', '', 'new', false), 'new');
});
