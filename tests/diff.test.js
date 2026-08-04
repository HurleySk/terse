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

test('empty old_string is rejected, matching the real Edit tool', () => {
  assert.equal(applyEdit('abc', '', 'new', false), null);
});

test('applyEdit normalises CRLF so an LF anchor still matches', () => {
  assert.equal(applyEdit('a\r\nb\r\nc', 'b\nc', 'Z', false), 'a\nZ');
});

test('a line duplicated later in the file is not blamed for the new one', () => {
  const before = [
    'function b() { }',
    'function a() {',
    '  // imports',
    '  const fs = require("fs");',
    '}',
  ].join('\n');
  const after = [
    'function b() {',
    '  // imports',
    '  const x = 1;',
    '}',
    'function a() {',
    '  // imports',
    '  const fs = require("fs");',
    '}',
  ].join('\n');
  const added = addedLineIndexes(before, after);
  assert.ok(added.includes(1), 'the newly written comment must be reported');
  assert.ok(!added.includes(5), 'the pre-existing comment must not be reported');
  assert.deepEqual(added, [0, 1, 2, 3]);
});
