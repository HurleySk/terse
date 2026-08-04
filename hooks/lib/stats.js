const fs = require('fs');
const path = require('path');
const os = require('os');
const { load } = require('./config');
const { recentTurns } = require('./transcript');

function slugFor(dir) {
  return path.resolve(dir).replace(/[:\\/.]/g, '-');
}

function newestTranscript(dir) {
  const projectDir = path.join(os.homedir(), '.claude', 'projects', slugFor(dir));
  let files;
  try {
    files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return null;
  }
  if (!files.length) return null;
  return files
    .map((f) => path.join(projectDir, f))
    .map((f) => ({ f, at: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0].f;
}

const cwd = process.argv[2] || process.cwd();
const cfg = load(cwd);
const file = newestTranscript(cwd);

if (!file) {
  console.log('terse: no transcript found for this directory.');
  process.exit(0);
}

const turns = recentTurns(file, 10);
if (!turns.length) {
  console.log('terse: no assistant turns recorded yet.');
  process.exit(0);
}

const sorted = [...turns].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const budget = cfg.wordBudget || 250;
const over = turns.filter((w) => w > budget).length;

console.log(`level: ${cfg.level}   budget: ${budget} words`);
console.log(`last ${turns.length} turns: ${turns.join(', ')}`);
console.log(`median: ${median}   over budget: ${over}/${turns.length}`);
