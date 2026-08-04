const MAX_MATRIX = 2000000;

function normalize(content) {
  return String(content ?? '').replace(/\r\n/g, '\n');
}

function lcsAdded(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;

  let pre = 0;
  while (pre < n && pre < m && oldLines[pre].trim() === newLines[pre].trim()) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && oldLines[n - 1 - suf].trim() === newLines[m - 1 - suf].trim()) suf++;

  const a = oldLines.slice(pre, n - suf).map((l) => l.trim());
  const b = newLines.slice(pre, m - suf).map((l) => l.trim());
  if (!b.length) return [];
  if (!a.length) return b.map((_, i) => pre + i);

  if (a.length * b.length > MAX_MATRIX) {
    const seen = new Set(oldLines.map((l) => l.trim()));
    const out = [];
    b.forEach((l, i) => { if (!seen.has(l)) out.push(pre + i); });
    return out;
  }

  const w = b.length + 1;
  const dp = new Int32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
    else { out.push(pre + j); j++; }
  }
  while (j < b.length) { out.push(pre + j); j++; }
  return out;
}

function addedLineIndexes(oldContent, newContent) {
  return lcsAdded(normalize(oldContent).split('\n'), normalize(newContent).split('\n'));
}

function applyEdit(oldContent, oldString, newString, replaceAll) {
  const before = normalize(oldContent);
  const target = normalize(oldString);
  const replacement = normalize(newString);
  if (target === '') return null;
  if (replaceAll) {
    if (!before.includes(target)) return null;
    return before.split(target).join(replacement);
  }
  const at = before.indexOf(target);
  if (at === -1) return null;
  return before.slice(0, at) + replacement + before.slice(at + target.length);
}

module.exports = { addedLineIndexes, applyEdit, normalize, lcsAdded };
