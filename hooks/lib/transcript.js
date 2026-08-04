const fs = require('fs');

function parseLines(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

function isRealUserTurn(entry) {
  if (entry.type !== 'user' || entry.isSidechain) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content)) return false;
  return content.some((c) => c.type === 'text');
}

function textOf(entry) {
  const content = entry.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c.type === 'text').map((c) => c.text || '').join('\n');
}

function countWords(text) {
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
  const words = stripped.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function lastTurn(file) {
  let entries;
  try {
    entries = parseLines(file);
  } catch {
    return null;
  }

  let start = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isRealUserTurn(entries[i])) { start = i; break; }
  }
  if (start === -1) return null;

  const parts = [];
  for (let i = start + 1; i < entries.length; i++) {
    const e = entries[i];
    if (isRealUserTurn(e)) break;
    if (e.type === 'assistant' && !e.isSidechain) {
      const t = textOf(e);
      if (t.trim()) parts.push(t);
    }
  }
  if (!parts.length) return null;

  const text = parts.join('\n\n');
  return { text, words: countWords(text) };
}

function recentTurns(file, limit = 10) {
  let entries;
  try {
    entries = parseLines(file);
  } catch {
    return [];
  }

  const turns = [];
  let parts = [];
  for (const e of entries) {
    if (isRealUserTurn(e)) {
      if (parts.length) turns.push(countWords(parts.join('\n\n')));
      parts = [];
      continue;
    }
    if (e.type === 'assistant' && !e.isSidechain) {
      const t = textOf(e);
      if (t.trim()) parts.push(t);
    }
  }
  if (parts.length) turns.push(countWords(parts.join('\n\n')));
  return turns.slice(-limit);
}

module.exports = { lastTurn, recentTurns, countWords, textOf, isRealUserTurn };
