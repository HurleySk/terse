const fs = require('fs');
const path = require('path');
const os = require('os');

const CANDIDATES = [
  path.join(os.homedir(), '.claude', 'terse-denials.json'),
  path.join(os.tmpdir(), 'terse-denials.json'),
];
const TTL_MS = 10 * 60 * 1000;
const MAX_DENIALS = 2;

function readFrom(file, now) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  for (const key of Object.keys(data)) {
    if (!data[key] || now - data[key].at > TTL_MS) delete data[key];
  }
  return data;
}

function read(now = Date.now()) {
  for (const file of CANDIDATES) {
    const data = readFrom(file, now);
    if (data) return data;
  }
  return {};
}

function write(data) {
  const payload = JSON.stringify(data);
  for (const file of CANDIDATES) {
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, payload);
      fs.renameSync(tmp, file);
      return true;
    } catch {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }
  return false;
}

function key(sessionId, filePath) {
  return `${sessionId || 'nosession'}::${path.resolve(filePath || '')}`;
}

function recordDenial(sessionId, filePath, now = Date.now()) {
  const data = read(now);
  const k = key(sessionId, filePath);
  const count = (data[k]?.count || 0) + 1;
  data[k] = { count, at: now };
  return { count, persisted: write(data) };
}

function clear(sessionId, filePath, now = Date.now()) {
  const data = read(now);
  const k = key(sessionId, filePath);
  if (!(k in data)) return;
  delete data[k];
  write(data);
}

function exhausted(sessionId, filePath, now = Date.now()) {
  return (read(now)[key(sessionId, filePath)]?.count || 0) >= MAX_DENIALS;
}

module.exports = { recordDenial, clear, exhausted, read, write, CANDIDATES, MAX_DENIALS, TTL_MS };
