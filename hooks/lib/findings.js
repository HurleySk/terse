const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOTS = [
  path.join(os.homedir(), '.claude', 'terse-findings'),
  path.join(os.tmpdir(), 'terse-findings'),
];
const TTL_MS = 24 * 60 * 60 * 1000;

function sessionDir(root, sessionId) {
  return path.join(root, String(sessionId || 'nosession').replace(/[^\w.-]/g, '_'));
}

function entryName(filePath) {
  return `${crypto.createHash('sha1').update(path.resolve(filePath || '')).digest('hex')}.json`;
}

function writeAtomic(file, payload) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, file);
    return true;
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
    return false;
  }
}

function remove(file) {
  try { fs.unlinkSync(file); } catch {}
}

function record(sessionId, filePath, violations, now = Date.now()) {
  const name = entryName(filePath);

  if (!violations || !violations.length) {
    for (const root of ROOTS) remove(path.join(sessionDir(root, sessionId), name));
    return true;
  }

  const payload = JSON.stringify({ file: path.resolve(filePath), at: now, violations });
  let written = false;
  for (const root of ROOTS) {
    const file = path.join(sessionDir(root, sessionId), name);
    if (written) remove(file);
    else written = writeAtomic(file, payload);
  }
  return written;
}

function drainDir(dir, now, out) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }

  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    const claim = `${file}.${process.pid}.claim`;
    let source = claim;
    try {
      fs.renameSync(file, claim);
    } catch {
      source = file;
    }

    let entry = null;
    try {
      entry = JSON.parse(fs.readFileSync(source, 'utf8'));
    } catch {}
    remove(source);
    if (entry && entry.file && Array.isArray(entry.violations) && now - entry.at <= TTL_MS) {
      out.push(entry);
    }
  }
  try { fs.rmdirSync(dir); } catch {}
}

function prune(root, sessionId, now) {
  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  const current = path.basename(sessionDir(root, sessionId));
  for (const name of names) {
    if (name === current) continue;
    const dir = path.join(root, name);
    try {
      if (now - fs.statSync(dir).mtimeMs > TTL_MS) fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

function drain(sessionId, now = Date.now()) {
  const out = [];
  for (const root of ROOTS) {
    drainDir(sessionDir(root, sessionId), now, out);
    prune(root, sessionId, now);
  }
  return out;
}

module.exports = { record, drain, sessionDir, entryName, ROOTS, TTL_MS };
