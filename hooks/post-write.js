const path = require('path');
const { spawn } = require('child_process');
const { load, inScope } = require('./lib/config');
const state = require('./lib/state');

process.on('uncaughtException', () => { process.exitCode = 0; });

const SCANNER = path.join(__dirname, 'scan.js');

function dispatch(payload) {
  const cfg = load(payload.cwd);
  if (!cfg.enabled || cfg.asyncScan === false) return;

  const file = (payload.tool_input || {}).file_path;
  if (!inScope(file, cfg)) return;
  if (state.exhausted(payload.session_id, file)) return;

  spawn(process.execPath, [SCANNER, file, String(payload.session_id || ''), payload.cwd || process.cwd()], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    dispatch(JSON.parse(raw));
  } catch {}
  process.exitCode = 0;
});
