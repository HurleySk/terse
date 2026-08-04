const fs = require('fs');
const path = require('path');
const os = require('os');

const FILE = path.join(os.tmpdir(), 'terse-denials.json');
const TTL_MS = 10 * 60 * 1000;
const MAX_DENIALS = 2;

function read(now) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
  for (const key of Object.keys(data)) {
    if (!data[key] || now - data[key].at > TTL_MS) delete data[key];
  }
  return data;
}

function write(data) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch {}
}

function key(sessionId, filePath) {
  return `${sessionId || 'nosession'}::${path.resolve(filePath || '')}`;
}

function recordDenial(sessionId, filePath, now = Date.now()) {
  const data = read(now);
  const k = key(sessionId, filePath);
  const count = (data[k]?.count || 0) + 1;
  data[k] = { count, at: now };
  write(data);
  return count;
}

function clear(sessionId, filePath, now = Date.now()) {
  const data = read(now);
  delete data[key(sessionId, filePath)];
  write(data);
}

function exhausted(sessionId, filePath, now = Date.now()) {
  return (read(now)[key(sessionId, filePath)]?.count || 0) >= MAX_DENIALS;
}

module.exports = { recordDenial, clear, exhausted, read, FILE, MAX_DENIALS, TTL_MS };
