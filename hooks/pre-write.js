const fs = require('fs');
const { load, inScope, inMarkdownScope } = require('./lib/config');
const { analyze } = require('./lib/comments');
const markdown = require('./lib/markdown');
const { addedLineIndexes, applyEdit, normalize } = require('./lib/diff');
const state = require('./lib/state');

process.on('uncaughtException', () => { process.exitCode = 0; });

function readFileOr(file, fallback) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

function resolveContent(tool, input) {
  const file = input.file_path;
  if (!file) return null;

  if (tool === 'Write') {
    return { file, before: normalize(readFileOr(file, '')), after: normalize(String(input.content ?? '')) };
  }
  if (tool === 'Edit') {
    const raw = readFileOr(file, null);
    if (raw === null) return null;
    const before = normalize(raw);
    const after = applyEdit(before, String(input.old_string ?? ''), String(input.new_string ?? ''), Boolean(input.replace_all));
    return after === null ? null : { file, before, after };
  }
  return null;
}

const GUIDANCE = {
  code: [
    'Delete these comments, then retry. Only four kinds survive: tool directives that',
    'change behaviour (eslint-disable, @ts-expect-error, noqa, #pragma), shebangs, licence',
    'headers, and TODO/FIXME markers or bare URL and issue references. Explaining intent',
    'is not an exception - if a line needs a paragraph, rename it or restructure it, and',
    'no comment block may run past the line budget for this level.',
  ],
  markdown: [
    'Cut these, then retry. Delete filler openers, sections that only recap, sentences that',
    'repeat their own heading, and stacked hedging. Lead with the claim and stop there.',
  ],
};

function render(file, violations, kind) {
  const lines = violations.slice(0, 8).map((v) => `  L${v.line}  ${v.raw.slice(0, 72)}  -> ${v.why}`);
  const extra = violations.length > 8 ? `\n  ...and ${violations.length - 8} more` : '';
  const noun = kind === 'markdown' ? 'prose' : 'comment';
  return [
    `terse: ${violations.length} ${noun} violation${violations.length === 1 ? '' : 's'} in ${file}`,
    ...lines,
    extra,
    '',
    ...GUIDANCE[kind],
  ].join('\n');
}

function decide(payload) {
  const cfg = load(payload.cwd);
  if (!cfg.enabled) return null;

  const input = payload.tool_input || {};
  const isMarkdown = inMarkdownScope(input.file_path, cfg);
  if (!isMarkdown && !inScope(input.file_path, cfg)) return null;

  const resolved = resolveContent(payload.tool_name, input);
  if (!resolved) return null;

  const allLines = resolved.after.split('\n');
  const added = addedLineIndexes(resolved.before, resolved.after);
  if (!added.length) return null;

  const kind = isMarkdown ? 'markdown' : 'code';
  const result = isMarkdown
    ? markdown.analyze(added, allLines)
    : analyze(resolved.file, added, allLines, cfg);

  if (!result.violations.length) {
    state.clear(payload.session_id, resolved.file);
    return null;
  }

  const reason = render(resolved.file, result.violations, kind);

  if (state.exhausted(payload.session_id, resolved.file)) {
    state.clear(payload.session_id, resolved.file);
    return { warn: `${reason}\n\n(terse: allowed through after repeated denials - clean these up if they are genuinely noise.)` };
  }

  const { persisted } = state.recordDenial(payload.session_id, resolved.file);
  if (!persisted) {
    return { warn: `${reason}\n\n(terse: denial counter is unwritable, so this is a warning instead of a block.)` };
  }

  return { deny: reason };
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let out = null;
  try {
    out = decide(JSON.parse(raw));
  } catch {
    out = null;
  }

  if (out && out.deny) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: out.deny },
    }));
  } else if (out && out.warn) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: out.warn },
    }));
  }
  process.exitCode = 0;
});
