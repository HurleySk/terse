const fs = require('fs');
const { load, inScope } = require('./lib/config');
const { analyze } = require('./lib/comments');
const { addedLineIndexes, applyEdit } = require('./lib/diff');
const state = require('./lib/state');

function emit(obj) {
  if (obj) process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

function deny(reason) {
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

function warn(context) {
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } });
}

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
    return { file, before: readFileOr(file, ''), after: String(input.content ?? '') };
  }
  if (tool === 'Edit') {
    const before = readFileOr(file, null);
    if (before === null) return null;
    const after = applyEdit(before, String(input.old_string ?? ''), String(input.new_string ?? ''), Boolean(input.replace_all));
    return after === null ? null : { file, before, after };
  }
  return null;
}

function render(file, violations) {
  const lines = violations.slice(0, 8).map((v) => `  L${v.line}  ${v.raw.slice(0, 72)}  → ${v.why}`);
  const extra = violations.length > 8 ? `\n  …and ${violations.length - 8} more` : '';
  return [
    `terse: ${violations.length} comment violation${violations.length === 1 ? '' : 's'} in ${file}`,
    ...lines,
    extra,
    '',
    'Rewrite without these comments, then retry. Keep only comments that explain WHY -',
    'non-obvious constraints, workarounds, spec references. Delete anything that restates',
    'the code, narrates steps, labels sections, or describes the edit.',
  ].join('\n');
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    emit(null);
  }

  const cfg = load(payload.cwd);
  if (!cfg.enabled) emit(null);

  const input = payload.tool_input || {};
  if (!inScope(input.file_path, cfg)) emit(null);

  const resolved = resolveContent(payload.tool_name, input);
  if (!resolved) emit(null);

  const allLines = resolved.after.split('\n');
  const added = addedLineIndexes(resolved.before, resolved.after);
  if (!added.length) emit(null);

  let result;
  try {
    result = analyze(resolved.file, added, allLines, cfg);
  } catch {
    emit(null);
  }

  if (!result.violations.length) {
    state.clear(payload.session_id, resolved.file);
    emit(null);
  }

  if (state.exhausted(payload.session_id, resolved.file)) {
    state.clear(payload.session_id, resolved.file);
    warn(`${render(resolved.file, result.violations)}\n\n(terse: allowed through after repeated denials - clean these up if they are genuinely noise.)`);
  }

  state.recordDenial(payload.session_id, resolved.file);
  deny(render(resolved.file, result.violations));
});
