const { load } = require('./lib/config');
const { lastTurn } = require('./lib/transcript');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const cfg = load(payload.cwd);
  if (!cfg.enabled || !payload.transcript_path) process.exit(0);

  const turn = lastTurn(payload.transcript_path);
  if (!turn || turn.words <= cfg.wordBudget) process.exit(0);

  const over = Math.round((turn.words / cfg.wordBudget - 1) * 100);
  const context = `terse: your last response was ${turn.words.toLocaleString()} words of prose against a ${cfg.wordBudget}-word budget - ${over}% over. `
    + 'Cut preamble, restatements, recaps of tool output, option surveys, and closing summaries. Lead with the answer and stop there.';

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context },
  }));
});
