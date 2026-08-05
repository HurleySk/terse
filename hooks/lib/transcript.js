const fs = require('fs');

const MAX_BYTES = 8 * 1024 * 1024;

const BOOKKEEPING = /^<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|task-notification|system-reminder|user-prompt-submit-hook|bash-input|bash-stdout|bash-stderr)>/;

function readTail(file) {
  const { size } = fs.statSync(file);
  if (size <= MAX_BYTES) return fs.readFileSync(file, 'utf8');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(MAX_BYTES);
    fs.readSync(fd, buf, 0, MAX_BYTES, size - MAX_BYTES);
    const text = buf.toString('utf8');
    const nl = text.indexOf('\n');
    return nl === -1 ? '' : text.slice(nl + 1);
  } finally {
    fs.closeSync(fd);
  }
}

function parseLines(file) {
  const out = [];
  for (const line of readTail(file).split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

function textOf(entry) {
  const content = entry.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c.type === 'text').map((c) => c.text || '').join('\n');
}

function isRealUserTurn(entry) {
  if (entry.type !== 'user' || entry.isSidechain || entry.isMeta) return false;
  const content = entry.message?.content;
  if (typeof content !== 'string' && !Array.isArray(content)) return false;
  if (Array.isArray(content) && !content.some((c) => c.type === 'text')) return false;
  const text = textOf(entry).trim();
  if (!text) return false;
  return !BOOKKEEPING.test(text);
}

function isAssistantText(entry) {
  return entry.type === 'assistant' && !entry.isSidechain;
}

function countWords(text) {
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
  const words = stripped.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function entriesOf(file) {
  try {
    return parseLines(file);
  } catch {
    return null;
  }
}

function lastTurn(file) {
  const entries = entriesOf(file);
  if (!entries) return null;

  const parts = [];
  let skippedPending = false;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (isRealUserTurn(e)) {
      if (!parts.length && !skippedPending) { skippedPending = true; continue; }
      break;
    }
    if (isAssistantText(e)) {
      const t = textOf(e);
      if (t.trim()) parts.unshift(t);
    }
  }
  if (!parts.length) return null;

  const text = parts.join('\n\n');
  return { text, words: countWords(text) };
}

function recentTurns(file, limit = 10) {
  const entries = entriesOf(file);
  if (!entries) return [];

  const turns = [];
  let parts = [];
  for (const e of entries) {
    if (isRealUserTurn(e)) {
      if (parts.length) turns.push(countWords(parts.join('\n\n')));
      parts = [];
      continue;
    }
    if (isAssistantText(e)) {
      const t = textOf(e);
      if (t.trim()) parts.push(t);
    }
  }
  if (parts.length) turns.push(countWords(parts.join('\n\n')));
  return turns.slice(-limit);
}

function overBudget(file, budget, limit = 10) {
  const turns = recentTurns(file, limit);
  let streak = 0;
  for (let i = turns.length - 1; i >= 0 && turns[i] > budget; i--) streak++;
  const window = turns.slice(turns.length - streak);
  const mean = window.length ? Math.round(window.reduce((a, b) => a + b, 0) / window.length) : 0;
  return { streak, mean, turns };
}

module.exports = { lastTurn, recentTurns, overBudget, countWords, textOf, isRealUserTurn, BOOKKEEPING };
