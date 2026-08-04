const fs = require('fs');
const path = require('path');
const os = require('os');

const LEVELS = {
  off: { enabled: false },
  normal: { enabled: true, wordBudget: 250, commentDensity: 0.08, allowDocComments: true },
  brutal: { enabled: true, wordBudget: 120, commentDensity: 0.03, allowDocComments: false },
};

const DEFAULT_EXTENSIONS = [
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.cs', '.java', '.kt', '.scala',
  '.go', '.rs', '.swift', '.dart', '.c', '.h', '.cpp', '.hpp', '.cc',
  '.py', '.rb', '.php', '.pl', '.lua', '.r', '.jl',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.sql',
];

const SKIP_PATH = /(^|[\\/])(node_modules|vendor|dist|build|\.git|__pycache__|bin|obj)[\\/]|\.min\.|\.generated\.|\.designer\./i;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function load(cwd) {
  const user = readJson(path.join(os.homedir(), '.claude', 'terse.json')) || {};
  const project = readJson(path.join(cwd || process.cwd(), '.claude', 'terse.json')) || {};
  const merged = { level: 'normal', ...user, ...project };
  const base = LEVELS[merged.level] || LEVELS.normal;

  return {
    extensions: DEFAULT_EXTENSIONS,
    allowPatterns: [],
    ...base,
    ...merged,
    level: LEVELS[merged.level] ? merged.level : 'normal',
  };
}

function inScope(filePath, cfg) {
  if (!filePath || SKIP_PATH.test(filePath)) return false;
  return cfg.extensions.includes(path.extname(filePath).toLowerCase());
}

module.exports = { load, inScope, LEVELS, DEFAULT_EXTENSIONS, SKIP_PATH };
