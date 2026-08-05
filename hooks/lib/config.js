const fs = require('fs');
const path = require('path');
const os = require('os');

const LEVELS = {
  off: { enabled: false },
  normal: { enabled: true, wordBudget: 250, commentDensity: 0.08, maxCommentLines: 2, allowDocComments: true, enforceMarkdown: true, asyncScan: true },
  brutal: { enabled: true, wordBudget: 120, commentDensity: 0.03, maxCommentLines: 1, allowDocComments: false, enforceMarkdown: true, asyncScan: true },
};

const MARKDOWN_EXTENSIONS = ['.md', '.mdx', '.markdown'];
const MARKDOWN_EXEMPT = /(^|[\\/])(CHANGELOG|LICENSE|CODE_OF_CONDUCT|\.github[\\/].*)\.mdx?$/i;

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

  const requested = project.level ?? user.level ?? 'normal';
  const level = LEVELS[requested] ? requested : 'normal';
  const userNumsApply = (user.level ?? 'normal') === level;

  return {
    extensions: DEFAULT_EXTENSIONS,
    markdownExtensions: MARKDOWN_EXTENSIONS,
    allowPatterns: [],
    ...LEVELS[level],
    ...(userNumsApply ? user : {}),
    ...project,
    level,
  };
}

function listOf(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function inScope(filePath, cfg) {
  if (!filePath || SKIP_PATH.test(filePath)) return false;
  return listOf(cfg.extensions, DEFAULT_EXTENSIONS).includes(path.extname(filePath).toLowerCase());
}

function inMarkdownScope(filePath, cfg) {
  if (!filePath || !cfg.enforceMarkdown || SKIP_PATH.test(filePath)) return false;
  if (MARKDOWN_EXEMPT.test(filePath)) return false;
  return listOf(cfg.markdownExtensions, MARKDOWN_EXTENSIONS).includes(path.extname(filePath).toLowerCase());
}

module.exports = { load, inScope, inMarkdownScope, LEVELS, DEFAULT_EXTENSIONS, MARKDOWN_EXTENSIONS, SKIP_PATH };
