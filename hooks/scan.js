const fs = require('fs');
const { load, inScope } = require('./lib/config');
const { analyze } = require('./lib/comments');
const { normalize } = require('./lib/diff');
const findings = require('./lib/findings');

process.on('uncaughtException', () => { process.exitCode = 0; });

function scan(filePath, sessionId, cwd) {
  const cfg = load(cwd);
  if (!cfg.enabled || cfg.asyncScan === false) return;
  if (!inScope(filePath, cfg)) return;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = normalize(raw).split('\n');
  const { violations } = analyze(filePath, lines.map((_, i) => i), lines, cfg);
  findings.record(sessionId, filePath, violations);
}

const [filePath, sessionId, cwd] = process.argv.slice(2);
if (filePath) {
  try {
    scan(filePath, sessionId, cwd);
  } catch {}
}
process.exitCode = 0;
