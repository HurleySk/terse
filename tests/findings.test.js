const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const findings = require('../hooks/lib/findings');

let seq = 0;
function session() {
  seq += 1;
  return `terse-fx-${process.pid}-${seq}`;
}

const violation = (line = 1) => ({ line, raw: '// imports', rule: 'ceremony', why: 'labels an obvious construct' });

test('record then drain round-trips and empties the store', () => {
  const s = session();
  findings.record(s, 'C:/proj/a.js', [violation(3)]);

  const drained = findings.drain(s);
  assert.equal(drained.length, 1);
  assert.equal(drained[0].file, path.resolve('C:/proj/a.js'));
  assert.deepEqual(drained[0].violations, [violation(3)]);

  assert.deepEqual(findings.drain(s), []);
});

test('recording an empty result deletes an earlier report', () => {
  const s = session();
  findings.record(s, 'C:/proj/a.js', [violation()]);
  findings.record(s, 'C:/proj/a.js', []);
  assert.deepEqual(findings.drain(s), []);
});

test('a rewrite replaces rather than appends', () => {
  const s = session();
  findings.record(s, 'C:/proj/a.js', [violation(1), violation(2)]);
  findings.record(s, 'C:/proj/a.js', [violation(9)]);

  const drained = findings.drain(s);
  assert.equal(drained.length, 1);
  assert.deepEqual(drained[0].violations, [violation(9)]);
});

test('separate files get separate entries', () => {
  const s = session();
  findings.record(s, 'C:/proj/a.js', [violation()]);
  findings.record(s, 'C:/proj/b.js', [violation()]);
  assert.equal(findings.drain(s).length, 2);
});

test('entries past the TTL are dropped on drain', () => {
  const s = session();
  const stale = Date.now() - findings.TTL_MS - 1000;
  findings.record(s, 'C:/proj/a.js', [violation()], stale);
  assert.deepEqual(findings.drain(s), []);
});

test('a corrupt entry is discarded, not fatal', () => {
  const s = session();
  findings.record(s, 'C:/proj/a.js', [violation()]);

  const dir = findings.sessionDir(findings.ROOTS[0], s);
  fs.writeFileSync(path.join(dir, findings.entryName('C:/proj/b.js')), '{not json');

  const drained = findings.drain(s);
  assert.equal(drained.length, 1);
  assert.deepEqual(findings.drain(s), []);
});

test('draining an unknown session is empty, not an error', () => {
  assert.deepEqual(findings.drain('terse-never-used'), []);
});
