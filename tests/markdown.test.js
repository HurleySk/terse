const { test } = require('node:test');
const assert = require('node:assert');
const { analyze } = require('../hooks/lib/markdown');
const { load, inMarkdownScope } = require('../hooks/lib/config');

function rules(src) {
  const lines = src.split('\n');
  return analyze(lines.map((_, i) => i), lines).violations.map((v) => v.rule);
}

test('flags filler openers', () => {
  assert.deepEqual(rules("It's worth noting that the cache is cold on first run."), ['filler']);
  assert.deepEqual(rules('It is important to note that this blocks.'), ['filler']);
  assert.deepEqual(rules('Needless to say, the build must pass.'), ['filler']);
});

test('flags content announcements', () => {
  assert.deepEqual(rules('In this section, we will cover the parser.'), ['filler']);
  assert.deepEqual(rules("Let's dive in."), ['filler']);
  assert.deepEqual(rules('This document describes the wire format.'), ['filler']);
});

test('flags padded connectives', () => {
  assert.deepEqual(rules('Run the migration in order to seed the table.'), ['filler']);
  assert.deepEqual(rules('It failed due to the fact that the token expired.'), ['filler']);
  assert.deepEqual(rules('We support a wide variety of formats.'), ['filler']);
});

test('flags ceremony headings', () => {
  assert.deepEqual(rules('## Conclusion'), ['ceremony-heading']);
  assert.deepEqual(rules('### Final Thoughts'), ['ceremony-heading']);
  assert.deepEqual(rules('## Key Takeaways'), ['ceremony-heading']);
});

test('keeps substantive headings', () => {
  assert.deepEqual(rules('## Configuration'), []);
  assert.deepEqual(rules('## How the loop breaker works'), []);
});

test('flags a sentence that echoes its heading', () => {
  assert.deepEqual(rules('## Installing the plugin\n\nInstalling the plugin is done like this.'), ['heading-echo']);
});

test('does not flag a heading followed by new information', () => {
  assert.deepEqual(rules('## Installing the plugin\n\nRequires node 20 or later on PATH.'), []);
});

test('flags stacked hedging', () => {
  assert.deepEqual(rules('This might possibly be somewhat slower.'), ['hedge-stack']);
});

test('allows a single hedge', () => {
  assert.deepEqual(rules('This may be slower on cold start.'), []);
});

test('ignores fenced code blocks', () => {
  const src = ['# Title', '', '```js', "// It's worth noting that x", 'const x = 1;', '```', '', 'Real prose.'].join('\n');
  assert.deepEqual(rules(src), []);
});

test('ignores frontmatter, tables, blockquotes and link refs', () => {
  assert.deepEqual(rules('---\ndescription: In this section, we will explain\n---\n\nBody.'), []);
  assert.deepEqual(rules('| col | in order to |\n|---|---|'), []);
  assert.deepEqual(rules('> It is important to note that this is a quote.'), []);
  assert.deepEqual(rules('[ref]: https://example.com/in-order-to'), []);
});

test('reports a one-based line number and the matched span', () => {
  const src = 'Fine line.\nIt is important to note that this blocks.';
  const lines = src.split('\n');
  const v = analyze([0, 1], lines).violations[0];
  assert.equal(v.line, 2);
  assert.equal(v.rule, 'filler');
  assert.match(v.raw, /important to note/i);
});

test('CHANGELOG and LICENSE are exempt from markdown enforcement', () => {
  const cfg = load('/nonexistent');
  assert.equal(inMarkdownScope('docs/guide.md', cfg), true);
  assert.equal(inMarkdownScope('CHANGELOG.md', cfg), false);
  assert.equal(inMarkdownScope('LICENSE.md', cfg), false);
  assert.equal(inMarkdownScope('.github/PULL_REQUEST_TEMPLATE.md', cfg), false);
});

test('enforceMarkdown false disables markdown scope', () => {
  const cfg = { ...load('/nonexistent'), enforceMarkdown: false };
  assert.equal(inMarkdownScope('docs/guide.md', cfg), false);
});
