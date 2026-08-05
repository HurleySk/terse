const path = require('path');
const { load } = require('./lib/config');
const { lastTurn, overBudget } = require('./lib/transcript');
const findings = require('./lib/findings');

process.on('uncaughtException', () => { process.exitCode = 0; });

const MAX_FILES = 5;
const MAX_PER_FILE = 6;

const CUT = 'Cut preamble, restatements, recaps of tool output, option surveys, and closing summaries.';

function correction(payload, cfg) {
  if (!payload.transcript_path) return null;

  const turn = lastTurn(payload.transcript_path);
  if (!turn || turn.words <= cfg.wordBudget) return null;

  const over = Math.round((turn.words / cfg.wordBudget - 1) * 100);
  const head = `terse: your last response was ${turn.words.toLocaleString()} words of prose against a ${cfg.wordBudget}-word budget - ${over}% over.`;
  const { streak, mean } = overBudget(payload.transcript_path, cfg.wordBudget);

  if (streak >= 3) {
    return `${head} That is ${streak} turns in a row, averaging ${mean.toLocaleString()} words. `
      + 'Stop writing prose nobody asked for. Answer the question, then stop typing.';
  }
  if (streak === 2) {
    return `${head} Second turn running. ${CUT} Lead with the answer and stop there.`;
  }
  return `${head} ${CUT} Lead with the answer and stop there.`;
}

function relative(file, cwd) {
  if (!cwd) return file;
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith('..') ? rel.split(path.sep).join('/') : file;
}

function scanReport(payload, cfg) {
  if (cfg.asyncScan === false) return null;

  const entries = findings.drain(payload.session_id).filter((e) => e.violations.length);
  if (!entries.length) return null;

  entries.sort((a, b) => b.violations.length - a.violations.length);
  const shown = entries.slice(0, MAX_FILES);
  const lines = [`terse: ${entries.length} file${entries.length === 1 ? '' : 's'} you wrote still carr${entries.length === 1 ? 'ies' : 'y'} removable comments.`];

  for (const entry of shown) {
    lines.push(`  ${relative(entry.file, payload.cwd)}`);
    for (const v of entry.violations.slice(0, MAX_PER_FILE)) {
      lines.push(`    L${v.line}  ${String(v.raw).slice(0, 64)}  -> ${v.why}`);
    }
    if (entry.violations.length > MAX_PER_FILE) {
      lines.push(`    ...and ${entry.violations.length - MAX_PER_FILE} more in this file`);
    }
  }
  if (entries.length > shown.length) lines.push(`  ...and ${entries.length - shown.length} more files`);

  lines.push('');
  lines.push('Delete these. This is advisory - nothing was blocked, and the whole file was scanned, so some may predate your edits.');
  return lines.join('\n');
}

function build(payload) {
  const cfg = load(payload.cwd);
  if (!cfg.enabled) return null;

  const parts = [correction(payload, cfg), scanReport(payload, cfg)].filter(Boolean);
  return parts.length ? parts.join('\n\n') : null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let context = null;
  try {
    context = build(JSON.parse(raw));
  } catch {
    context = null;
  }

  if (context) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context },
    }));
  }
  process.exitCode = 0;
});
