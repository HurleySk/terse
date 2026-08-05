const path = require('path');

const SYNTAX = {
  slash: { line: ['//'], block: [['/*', '*/']], doc: ['///', '/**'] },
  hash: { line: ['#'], block: [['"""', '"""'], ["'''", "'''"]], doc: ['"""', "'''"] },
  dash: { line: ['--'], block: [['/*', '*/']], doc: ['---'] },
};

const BY_EXT = {
  '.js': 'slash', '.mjs': 'slash', '.cjs': 'slash', '.jsx': 'slash', '.ts': 'slash',
  '.tsx': 'slash', '.cs': 'slash', '.java': 'slash', '.kt': 'slash', '.scala': 'slash',
  '.go': 'slash', '.rs': 'slash', '.swift': 'slash', '.dart': 'slash', '.c': 'slash',
  '.h': 'slash', '.cpp': 'slash', '.hpp': 'slash', '.cc': 'slash', '.php': 'slash',
  '.py': 'hash', '.rb': 'hash', '.pl': 'hash', '.r': 'hash', '.jl': 'hash',
  '.sh': 'hash', '.bash': 'hash', '.zsh': 'hash', '.ps1': 'hash', '.psm1': 'hash',
  '.sql': 'dash', '.lua': 'dash',
};

const ALLOW = [
  /\b(TODO|FIXME|HACK|XXX|SAFETY|SECURITY|PERF)\b/,
  /https?:\/\//,
  /\b(#\d{2,}|[A-Z]{2,}-\d+)\b/,
  /eslint-|@ts-|prettier-ignore|noqa|pylint:|pyright:|type:\s*ignore|nolint|golangci|#pragma|#region|#endregion|SuppressMessage|checkstyle/i,
  /^#!/,
  /\b(Copyright|SPDX|Licensed under|All rights reserved)\b/i,
];

const BANNER = /^[\s*]*[-=*_~#+─-╿]{3,}|(^|\s)[-=*_~+─-╿]{4,}[\s*]*$/;
const STEP = /^(step\s*\d+|first|firstly|second|secondly|third|next|then|now\s+(we|let|create|add|build|call|set)|finally|lastly)\b[\s,:.-]/i;
const CHANGELOG = /^(new|added|adding|changed|change|updated|update|fixed|fix|removed|remove|renamed|moved|was|previously|note:\s*(i|we)\s|refactored)\b[\s,:.-]|\bwas:\s|\bpreviously\b/i;
const CEREMONY = /^(constructor|imports?|exports?|getters?|setters?|properties|fields|variables|constants|dependencies|helpers?|helper (function|method)|main (entry|function)|entry point|initialization|init|setup|cleanup|teardown|begin|end|start|done|public methods|private methods|usings?)\s*[.:]?$/i;

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'to', 'this', 'that', 'these', 'is', 'are', 'be', 'we', 'it', 'its', 'for', 'in', 'on', 'at', 'and', 'or', 'as', 'with', 'from', 'by', 'into', 'all', 'each', 'any', 'here', 'up', 'out', 'do', 'does', 'if', 'then', 'so', 'over', 'through', 'across', 'via']);
const KEYWORDS = new Set(['const', 'let', 'var', 'function', 'func', 'def', 'fn', 'return', 'new', 'public', 'private', 'protected', 'static', 'void', 'class', 'struct', 'interface', 'import', 'export', 'from', 'require', 'if', 'else', 'for', 'foreach', 'while', 'switch', 'case', 'try', 'catch', 'finally', 'throw', 'await', 'async', 'this', 'self', 'true', 'false', 'null', 'nil', 'none', 'undefined', 'string', 'int', 'bool', 'boolean', 'float', 'double', 'var', 'val', 'end', 'do', 'then', 'in', 'of', 'is', 'not', 'and', 'or', 'select', 'insert', 'update', 'delete', 'where', 'set']);

function syntaxFor(filePath) {
  return SYNTAX[BY_EXT[path.extname(filePath || '').toLowerCase()]] || null;
}

function splitCode(line, syn) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    for (const [open] of syn.block) {
      if ((open[0] === '"' || open[0] === "'") && line.startsWith(open, i)) {
        return { code: line.slice(0, i), comment: line.slice(i) };
      }
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    for (const tok of syn.line) {
      if (line.startsWith(tok, i)) return { code: line.slice(0, i), comment: line.slice(i) };
    }
    for (const [open] of syn.block) {
      if (line.startsWith(open, i)) return { code: line.slice(0, i), comment: line.slice(i) };
    }
  }
  return { code: line, comment: null };
}

function stripMarkers(text, syn) {
  let t = text.trim();
  for (const tok of [...syn.doc, ...syn.line]) {
    while (t.startsWith(tok)) t = t.slice(tok.length).trim();
  }
  for (const [open, close] of syn.block) {
    if (t.startsWith(open)) t = t.slice(open.length);
    if (t.endsWith(close)) t = t.slice(0, -close.length);
  }
  return t.replace(/^[\s*]+/, '').replace(/[\s*]+$/, '').trim();
}

function isDoc(raw, syn) {
  const t = raw.trim();
  return syn.doc.some((d) => t.startsWith(d)) || /^<summary>|^@(param|returns?|throws|type)\b/i.test(t);
}

function tokenize(text, drop) {
  return text
    .replace(/[^A-Za-z0-9_$\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !drop.has(w) && !/^\d+$/.test(w));
}

function extract(filePath, lines) {
  const syn = syntaxFor(filePath);
  if (!syn) return { syn: null, comments: [], codeLines: [] };

  const comments = [];
  const codeLines = [];
  let openBlock = null;

  lines.forEach((raw, idx) => {
    const line = raw ?? '';
    if (openBlock) {
      comments.push({ index: idx, raw: line, text: stripMarkers(line, syn), doc: openBlock.doc, trailing: false });
      if (line.includes(openBlock.close)) openBlock = null;
      return;
    }
    const { code, comment } = splitCode(line, syn);
    if (code.trim()) codeLines.push({ index: idx, text: code });
    if (comment === null) return;

    const opener = syn.block.find(([open]) => comment.trimStart().startsWith(open));
    if (opener && !comment.slice(comment.indexOf(opener[0]) + opener[0].length).includes(opener[1])) {
      openBlock = { close: opener[1], doc: isDoc(comment, syn) };
    }
    comments.push({
      index: idx,
      raw: comment.trim(),
      text: stripMarkers(comment, syn),
      doc: isDoc(comment, syn),
      trailing: Boolean(code.trim()),
      code: code.trim(),
    });
  });

  return { syn, comments, codeLines };
}

function nextCode(comment, lines, syn) {
  if (comment.trailing) return comment.code;
  for (let i = comment.index + 1; i < Math.min(lines.length, comment.index + 4); i++) {
    const { code } = splitCode(lines[i] ?? '', syn);
    if (code.trim()) return code.trim();
  }
  return '';
}

function restates(comment, code) {
  const cw = tokenize(comment.text, STOPWORDS);
  if (!cw.length || cw.length > 6) return false;
  const kw = new Set(tokenize(code, KEYWORDS));
  if (!kw.size) return false;
  const hits = cw.filter((w) => kw.has(w)).length;
  return hits > 0 && hits / cw.length >= 0.5;
}

function exempt(comment, cfg) {
  if (ALLOW.some((re) => re.test(comment.raw))) return true;
  return (cfg.allowPatterns || []).some((p) => new RegExp(p, 'i').test(comment.raw));
}

function blocks(comments, cfg) {
  const runs = [];
  let run = [];
  const flush = () => { if (run.length) runs.push(run); run = []; };

  for (const c of comments) {
    if (c.trailing || exempt(c, cfg)) { flush(); continue; }
    if (run.length && c.index !== run[run.length - 1].index + 1) flush();
    run.push(c);
  }
  flush();
  return runs.filter((r) => r.some((c) => c.text));
}

function authored(run, added) {
  const segs = [];
  let seg = [];
  for (const c of run) {
    if (added.has(c.index)) seg.push(c);
    else if (seg.length) { segs.push(seg); seg = []; }
  }
  if (seg.length) segs.push(seg);
  return segs.filter((s) => s.some((c) => c.text));
}

function classify(comment, code, cfg) {
  const text = comment.text;
  if (!text) return null;
  if (exempt(comment, cfg)) return null;
  if (comment.doc) return cfg.allowDocComments ? null : 'doc-comment';
  if (BANNER.test(comment.raw) || (BANNER.test(text) && text.replace(/[-=*_~#+─-╿\s]/g, '').length < 30)) return 'section-banner';
  if (STEP.test(text)) return 'step-narration';
  if (CHANGELOG.test(text)) return 'changelog';
  if (CEREMONY.test(text)) return 'ceremony';
  if (restates(comment, code)) return 'restates-code';
  return null;
}

const EXPLAIN = {
  'restates-code': 'restates the code it sits above',
  'section-banner': 'decorative section banner',
  'step-narration': 'narrates steps the code already shows',
  changelog: 'describes the edit, not the code',
  ceremony: 'labels an obvious construct',
  'doc-comment': 'doc block adds nothing beyond the signature',
  'too-long': 'comment block runs past the line budget',
  density: 'comment density over budget',
};

function analyze(filePath, addedLines, allLines, cfg) {
  const { syn, comments } = extract(filePath, allLines);
  if (!syn) return { violations: [], density: 0 };

  const added = new Set(addedLines);
  const scoped = comments.filter((c) => added.has(c.index));
  const violations = [];

  for (const c of scoped) {
    const rule = classify(c, nextCode(c, allLines, syn), cfg);
    if (rule) violations.push({ line: c.index + 1, raw: c.raw, rule, why: EXPLAIN[rule] });
  }

  const cap = Number(cfg.maxCommentLines) > 0 ? Number(cfg.maxCommentLines) : Infinity;
  if (cap !== Infinity) {
    const flagged = new Set(violations.map((v) => v.line));
    for (const run of blocks(comments, cfg)) {
      for (const seg of authored(run, added)) {
        if (seg.length <= cap) continue;
        if (cfg.allowDocComments && seg.every((c) => c.doc)) continue;
        if (flagged.has(seg[0].index + 1)) continue;
        if (seg.filter((c) => c.text).every((c) => flagged.has(c.index + 1))) continue;
        violations.push({
          line: seg[0].index + 1,
          raw: seg[0].raw,
          rule: 'too-long',
          why: `${seg.length}-line comment block; budget is ${cap} line${cap === 1 ? '' : 's'}`,
        });
      }
    }
    violations.sort((a, b) => a.line - b.line);
  }

  const addedNonBlank = addedLines.filter((i) => (allLines[i] ?? '').trim()).length;
  const density = addedNonBlank ? scoped.length / addedNonBlank : 0;
  if (addedNonBlank >= 10 && density > cfg.commentDensity && !violations.length) {
    violations.push({
      line: scoped.length ? scoped[0].index + 1 : 1,
      raw: `${scoped.length} comments across ${addedNonBlank} added lines`,
      rule: 'density',
      why: `${Math.round(density * 100)}% of added lines are comments; budget is ${Math.round(cfg.commentDensity * 100)}%`,
    });
  }

  return { violations, density };
}

module.exports = { analyze, classify, blocks, extract, restates, tokenize, syntaxFor, splitCode, stripMarkers, EXPLAIN, ALLOW };
