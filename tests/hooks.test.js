const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('../hooks/lib/state');

const HOOKS = path.join(__dirname, '..', 'hooks');

function callHook(script, payload) {
  const out = execFileSync(process.execPath, [path.join(HOOKS, script)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return out.trim() ? JSON.parse(out) : null;
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terse-e2e-'));
}

function decision(res) {
  return res?.hookSpecificOutput?.permissionDecision || null;
}

test('Write with a noise comment is denied', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'a.js');
  const res = callHook('pre-write.js', {
    session_id: 'w1', cwd: dir, tool_name: 'Write',
    tool_input: { file_path: file, content: '// increment counter\ncounter++;\n' },
  });
  assert.equal(decision(res), 'deny');
  assert.match(res.hookSpecificOutput.permissionDecisionReason, /restates the code/);
  state.clear('w1', file);
});

test('Write with only a tool directive passes silently', () => {
  const dir = tmpdir();
  const res = callHook('pre-write.js', {
    session_id: 'w2', cwd: dir, tool_name: 'Write',
    tool_input: {
      file_path: path.join(dir, 'a.js'),
      content: '// eslint-disable-next-line no-plusplus\ncounter++;\n',
    },
  });
  assert.equal(res, null);
});

test('Edit is judged on added lines only, not the existing file', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'legacy.js');
  fs.writeFileSync(file, '// increment counter\ncounter++;\n// imports\nconst fs = require("fs");\n');

  const res = callHook('pre-write.js', {
    session_id: 'e1', cwd: dir, tool_name: 'Edit',
    tool_input: { file_path: file, old_string: 'counter++;', new_string: 'counter += step;' },
  });
  assert.equal(res, null);
});

test('Edit that introduces a noise comment is denied', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'x.js');
  fs.writeFileSync(file, 'const a = 1;\n');

  const res = callHook('pre-write.js', {
    session_id: 'e2', cwd: dir, tool_name: 'Edit',
    tool_input: { file_path: file, old_string: 'const a = 1;', new_string: '// Step 1: seed the value\nconst a = 1;' },
  });
  assert.equal(decision(res), 'deny');
  state.clear('e2', file);
});

test('loop breaker allows the write through after two denials', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'loop.js');
  const payload = {
    session_id: 'loop1', cwd: dir, tool_name: 'Write',
    tool_input: { file_path: file, content: '// increment counter\ncounter++;\n' },
  };
  state.clear('loop1', file);

  assert.equal(decision(callHook('pre-write.js', payload)), 'deny');
  assert.equal(decision(callHook('pre-write.js', payload)), 'deny');

  const third = callHook('pre-write.js', payload);
  assert.equal(decision(third), null);
  assert.match(third.hookSpecificOutput.additionalContext, /allowed through after repeated denials/);
  state.clear('loop1', file);
});

test('level off disables the write hook', () => {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude', 'terse.json'), JSON.stringify({ level: 'off' }));

  const res = callHook('pre-write.js', {
    session_id: 'off1', cwd: dir, tool_name: 'Write',
    tool_input: { file_path: path.join(dir, 'a.js'), content: '// increment counter\ncounter++;\n' },
  });
  assert.equal(res, null);
});

test('markdown and json writes are ignored', () => {
  const dir = tmpdir();
  for (const name of ['README.md', 'data.json']) {
    const res = callHook('pre-write.js', {
      session_id: 'md1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, name), content: '// Step 1: do it\nconst a = 1;\n' },
    });
    assert.equal(res, null, name);
  }
});

test('malformed hook input exits cleanly', () => {
  const out = execFileSync(process.execPath, [path.join(HOOKS, 'pre-write.js')], { input: 'not json', encoding: 'utf8' });
  assert.equal(out.trim(), '');
});

test('prompt-submit nudges only when the last turn was over budget', () => {
  const dir = tmpdir();
  const file = path.join(dir, 't.jsonl');
  const user = { type: 'user', isSidechain: false, message: { content: [{ type: 'text', text: 'hi' }] } };
  const bot = (text) => ({ type: 'assistant', isSidechain: false, message: { content: [{ type: 'text', text }] } });

  fs.writeFileSync(file, [user, bot('short answer')].map((e) => JSON.stringify(e)).join('\n'));
  assert.equal(callHook('prompt-submit.js', { cwd: dir, transcript_path: file }), null);

  fs.writeFileSync(file, [user, bot('word '.repeat(400))].map((e) => JSON.stringify(e)).join('\n'));
  const res = callHook('prompt-submit.js', { cwd: dir, transcript_path: file });
  assert.match(res.hookSpecificOutput.additionalContext, /400 words of prose against a 250-word budget/);
});

test('session-start emits the style contract', () => {
  const out = execFileSync(process.execPath, [path.join(HOOKS, 'session-start.js')], { encoding: 'utf8' });
  const res = JSON.parse(out);
  assert.equal(res.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(res.hookSpecificOutput.additionalContext, /TERSE_STYLE_CONTRACT/);
  assert.match(res.hookSpecificOutput.additionalContext, /250 words/);
});
