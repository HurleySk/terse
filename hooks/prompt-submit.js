const { load } = require('./lib/config');
const { lastTurn } = require('./lib/transcript');

process.on('uncaughtException', () => { process.exitCode = 0; });

function correction(payload) {
  const cfg = load(payload.cwd);
  if (!cfg.enabled || !payload.transcript_path) return null;

  const turn = lastTurn(payload.transcript_path);
  if (!turn || turn.words <= cfg.wordBudget) return null;

  const over = Math.round((turn.words / cfg.wordBudget - 1) * 100);
  return `terse: your last response was ${turn.words.toLocaleString()} words of prose against a ${cfg.wordBudget}-word budget - ${over}% over. `
    + 'Cut preamble, restatements, recaps of tool output, option surveys, and closing summaries. Lead with the answer and stop there.';
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let context = null;
  try {
    context = correction(JSON.parse(raw));
  } catch {
    context = null;
  }

  if (context) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context },
    }));
  }
  process.exitCode = 0;
});
