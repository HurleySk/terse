function addedLineIndexes(oldContent, newContent) {
  const newLines = newContent.split('\n');
  const pool = new Map();
  for (const line of (oldContent || '').split('\n')) {
    const k = line.trim();
    pool.set(k, (pool.get(k) || 0) + 1);
  }

  const added = [];
  newLines.forEach((line, i) => {
    const k = line.trim();
    const left = pool.get(k) || 0;
    if (left > 0) pool.set(k, left - 1);
    else added.push(i);
  });
  return added;
}

function applyEdit(oldContent, oldString, newString, replaceAll) {
  if (oldString === '') return newString;
  if (replaceAll) return oldContent.split(oldString).join(newString);
  const at = oldContent.indexOf(oldString);
  if (at === -1) return null;
  return oldContent.slice(0, at) + newString + oldContent.slice(at + oldString.length);
}

module.exports = { addedLineIndexes, applyEdit };
