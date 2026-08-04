const { test } = require('node:test');
const assert = require('node:assert');
const { analyze, classify, extract, restates, splitCode } = require('../hooks/lib/comments');
const { load } = require('../hooks/lib/config');

const cfg = { ...load('/nonexistent'), level: 'normal', enabled: true, allowDocComments: true, commentDensity: 0.08, allowPatterns: [] };
const brutal = { ...cfg, allowDocComments: false, commentDensity: 0.03 };

function run(file, src, conf = cfg) {
  const lines = src.split('\n');
  return analyze(file, lines.map((_, i) => i), lines, conf);
}

function rules(file, src, conf = cfg) {
  return run(file, src, conf).violations.map((v) => v.rule);
}

test('flags a comment that restates the next line', () => {
  assert.deepEqual(rules('a.js', '// increment counter\ncounter++;'), ['restates-code']);
  assert.deepEqual(rules('a.js', '// create the client\nconst client = new Client();'), ['restates-code']);
  assert.deepEqual(rules('a.py', '# loop over users\nfor u in users:\n    pass'), ['restates-code']);
});

test('flags a trailing comment that restates its own line', () => {
  assert.deepEqual(rules('a.js', 'counter++; // increment counter'), ['restates-code']);
});

test('flags section banners', () => {
  assert.deepEqual(rules('a.js', '// ---------- Setup ----------\nconst x = 1;'), ['section-banner']);
  assert.deepEqual(rules('a.py', '# ===== helpers =====\nx = 1'), ['section-banner']);
});

test('flags three-character and box-drawing dividers', () => {
  assert.deepEqual(rules('a.js', '// --- Response timing ---\nconst t = now();'), ['section-banner']);
  assert.deepEqual(rules('a.ts', '// ── Pass 4: SQL ──────\nrunPass(4);'), ['section-banner']);
});

test('does not treat incidental dashes as a banner', () => {
  assert.deepEqual(rules('a.js', '// a - b - c is the required order\nsort(items);'), []);
  assert.deepEqual(rules('a.js', '// maps input --> output shape\nconvert(x);'), []);
});

test('flags step narration', () => {
  assert.deepEqual(rules('a.js', '// Step 1: validate the payload\nvalidate(p);'), ['step-narration']);
  assert.deepEqual(rules('a.js', '// First, connect\nopen();'), ['step-narration']);
  assert.deepEqual(rules('a.js', '// Now we build the tree\nconst t = build();'), ['step-narration']);
});

test('flags changelog commentary', () => {
  assert.deepEqual(rules('a.js', '// NEW: added retry logic\nretry();'), ['changelog']);
  assert.deepEqual(rules('a.js', '// was: setTimeout(fn, 100)\nqueue(fn);'), ['changelog']);
  assert.deepEqual(rules('a.cs', '// Fixed null handling\nHandle(x);'), ['changelog']);
});

test('flags ceremony labels', () => {
  assert.deepEqual(rules('a.js', '// imports\nconst fs = require("fs");'), ['ceremony']);
  assert.deepEqual(rules('a.cs', '// Constructor\npublic Thing() { }'), ['ceremony']);
  assert.deepEqual(rules('a.js', '// helper function\nfunction pad(n) { return n; }'), ['ceremony']);
});

test('allows comments that explain why', () => {
  const src = [
    '// Dataverse returns empty string rather than null here, so the guard cannot use ??',
    'const name = row.name || fallback;',
  ].join('\n');
  assert.deepEqual(rules('a.js', src), []);
});

test('allows because / workaround / spec / url / issue refs', () => {
  assert.deepEqual(rules('a.js', '// counter++ because the API is 1-indexed\ncounter++;'), []);
  assert.deepEqual(rules('a.js', '// workaround for the setup banner bug\nsetup();'), []);
  assert.deepEqual(rules('a.js', '// see https://example.com/setup\nsetup();'), []);
  assert.deepEqual(rules('a.js', '// blocked on ABC-123\nsetup();'), []);
  assert.deepEqual(rules('a.js', '// TODO: setup\nsetup();'), []);
});

test('allows tool directives and pragmas', () => {
  assert.deepEqual(rules('a.js', '// eslint-disable-next-line no-console\nconsole.log(1);'), []);
  assert.deepEqual(rules('a.ts', '// @ts-expect-error imports\nimport x from "y";'), []);
  assert.deepEqual(rules('a.py', '# noqa: E501\nx = 1'), []);
  assert.deepEqual(rules('a.cs', '#region Constructor\npublic Thing() { }'), []);
});

test('allows shebangs and licence headers', () => {
  assert.deepEqual(rules('a.sh', '#!/usr/bin/env bash\nset -e'), []);
  assert.deepEqual(rules('a.js', '// Copyright 2026 Samuel Hurley\n// SPDX-License-Identifier: MIT\nconst x = 1;'), []);
});

test('doc comments allowed at normal, denied at brutal', () => {
  const src = '/**\n * Pads a number.\n */\nfunction pad(n) { return n; }';
  assert.deepEqual(rules('a.js', src), []);
  assert.ok(rules('a.js', src, brutal).includes('doc-comment'));
  assert.deepEqual(rules('a.cs', '/// <summary>Gets the name.</summary>\npublic string Name { get; }'), []);
});

test('density fires only when nothing else did and the sample is big enough', () => {
  const dense = [
    '// notes on a', 'const a = 1;', 'const b = 2;', 'const c = 3;',
    '// notes on d', 'const d = 4;', 'const e = 5;', 'const f = 6;',
    'const g = 7;', 'const h = 8;', 'const i = 9;', 'const j = 10;',
  ].join('\n');
  assert.deepEqual(rules('a.js', dense), ['density']);

  const small = '// notes on a\nconst a = 1;\nconst b = 2;';
  assert.deepEqual(rules('a.js', small), []);
});

test('only added lines are evaluated', () => {
  const lines = ['// increment counter', 'counter++;', 'const fresh = 1;'].join('\n').split('\n');
  const onlyLast = analyze('a.js', [2], lines, cfg);
  assert.deepEqual(onlyLast.violations, []);
});

test('out-of-scope files produce nothing', () => {
  assert.deepEqual(run('README.md', '<!-- Step 1: do it -->\ntext').violations, []);
  assert.deepEqual(run('a.json', '// imports\n{}').violations, []);
});

test('splitCode ignores comment markers inside strings', () => {
  assert.equal(splitCode('const u = "https://x.dev"; // imports', { line: ['//'], block: [['/*', '*/']] }).comment, '// imports');
  assert.equal(splitCode('const u = "a // b";', { line: ['//'], block: [['/*', '*/']] }).comment, null);
});

test('restates uses token overlap, not substring matching', () => {
  assert.ok(restates({ text: 'increment counter' }, 'counter++'));
  assert.ok(!restates({ text: 'callers must hold the lock before entering' }, 'enter();'));
});

test('extract tracks multi-line block comments', () => {
  const { comments } = extract('a.js', ['/*', ' * banner', ' */', 'const x = 1;']);
  assert.equal(comments.length, 3);
  assert.equal(comments[3], undefined);
});

test('violation carries a line number and explanation', () => {
  const v = run('a.js', 'const a = 1;\n// increment counter\ncounter++;').violations[0];
  assert.equal(v.line, 2);
  assert.equal(v.rule, 'restates-code');
  assert.match(v.why, /restates/);
});
