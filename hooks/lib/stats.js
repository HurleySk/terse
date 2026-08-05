const fs = require('fs');
const path = require('path');
const os = require('os');
const { load } = require('./config');
const { recentTurns, overBudget } = require('./transcript');

function slugFor(dir) {
  return path.resolve(dir).replace(/[^a-zA-Z0-9]/g, '-');
}

function projectDirFor(dir) {
  const root = path.join(os.homedir(), '.claude', 'projects');
  const slug = slugFor(dir);
  const exact = path.join(root, slug);
  try {
    if (fs.existsSync(exact)) return exact;
    const prefix = slug.slice(0, 200);
    const hit = fs.readdirSync(root).find((d) => d.startsWith(prefix));
    return hit ? path.join(root, hit) : exact;
  } catch {
    return exact;
  }
}

function newestTranscript(dir) {
  const projectDir = projectDirFor(dir);
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
const { streak } = overBudget(file, budget);

console.log(`level: ${cfg.level}   budget: ${budget} words`);
console.log(`last ${turns.length} turns: ${turns.join(', ')}`);
console.log(`median: ${median}   over budget: ${over}/${turns.length}   current streak: ${streak}`);
