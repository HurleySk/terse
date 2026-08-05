# terse

A Claude Code plugin that enforces concise responses and ultra-minimal code comments.

Opus 5 is verbose by default - preambles, recaps, option surveys, and code buried in comments that restate the line below them. Instructions in `CLAUDE.md` help for a while, then drift out of attention on a long session. `terse` applies pressure that does not drift.

## What it does

**Prose.** A style contract is injected at session start. After that, a `UserPromptSubmit` hook reads the transcript, measures the prose in your last response, and injects a correction *only when it exceeded budget*. Word counts exclude fenced and inline code, so writing a large file is not treated as rambling. When Claude is already concise, the hook emits nothing and costs nothing.

**Comments.** A `PreToolUse` hook on `Write` and `Edit` inspects the lines the tool is about to add, classifies noise comments, and returns `deny` with the specific lines. Claude rewrites and retries on its own - you are never prompted.

**Background scan.** After each write lands, a `PostToolUse` hook spawns a detached scanner that reads the *whole* file, not just the added lines. Anything it finds arrives as an advisory note on the next prompt. This catches noise no single edit introduced, and comments that predate the edit in a file Claude now owns. It never blocks and never adds latency to the write.

**Docs.** The write-time hook applies a separate rule family to `.md` files, since markdown has no comments to classify. It catches filler openers, sections that only recap, sentences that add nothing beyond their own heading, and stacked hedging.

```
terse: 3 comment violations in src/auth.js
  L12  // increment counter                 -> restates the code it sits above
  L19  // ---------- Setup ----------       -> decorative section banner
  L31  // NEW: added retry handling         -> describes the edit, not the code

Delete these comments, then retry. Only four kinds survive: tool directives that
change behaviour (eslint-disable, @ts-expect-error, noqa, #pragma), shebangs, licence
headers, and TODO/FIXME markers or bare URL and issue references.
```

## Install

```
/plugin marketplace add HurleySk/hurleysk-marketplace
/plugin install terse@hurleysk-marketplace
```

Requires `node` on `PATH`. No dependencies, no background server.

## Levels

```
/terse            # show current level
/terse brutal     # tighten
/terse off        # disable every hook
/terse budget 150 # set the word budget without changing level
/terse stats      # word count of the last 10 turns
```

| level | word budget | comment density cap | comment block lines | doc comments | markdown rules |
|---|---|---|---|---|---|
| `off` | - | - | - | hooks disabled | off |
| `normal` *(default)* | 250 | 8% | 2 | allowed | on |
| `brutal` | 120 | 3% | 1 | rejected | on |

A project's `.claude/terse.json` wins over `~/.claude/terse.json`. A number you tuned in the user file is carried forward only while the effective level is still the level that file chose, so `/terse brutal` in one project applies brutal fully rather than inheriting your global `normal` numbers. `/terse budget` writes to the project file for that reason.

The prose correction escalates. One turn over budget gets the standard note; a second consecutive turn says so; three or more drops the explanation and reports the streak and its average. `/terse stats` shows the same streak.

## What gets rejected

| rule | example |
|---|---|
| `restates-code` | `// increment counter` above `counter++` |
| `section-banner` | `// ---------- Setup ----------` |
| `step-narration` | `// Step 1: validate the payload` |
| `changelog` | `// NEW: added retry`, `// was: setTimeout(...)` |
| `ceremony` | `// imports`, `// constructor`, `// helper function` |
| `too-long` | a comment block running past the level's line budget |
| `density` | more than the cap of added lines are comments |

In markdown:

| rule | example |
|---|---|
| `filler` | "It's worth noting that", "In this section, we will", "in order to" |
| `ceremony-heading` | `## Conclusion`, `## Key Takeaways`, `## Final Thoughts` |
| `heading-echo` | "Installing the plugin is done like this." under `## Installing the plugin` |
| `hedge-stack` | "This might possibly be somewhat slower." |

Markdown checks skip fenced code, frontmatter, tables, blockquotes, and link references. `CHANGELOG.md`, `LICENSE.md`, `CODE_OF_CONDUCT.md`, and anything under `.github/` are exempt entirely - changelog and template language is legitimately repetitive. Set `"enforceMarkdown": false` to turn the family off while keeping comment enforcement.

`heading-echo` deliberately fires only when a short sentence adds almost nothing beyond its heading. Reusing the heading's key noun is normal writing; measured across 17.5k lines of real docs the whole markdown family flags 0.23 lines per 1k.

## What is always allowed

Only comments that do something, or that carry a reference the code cannot:

- Tool directives that change behaviour - `eslint-disable`, `@ts-expect-error`, `noqa`, `pylint:`, `#pragma`, `#region`, `SuppressMessage`
- Shebangs, copyright and SPDX headers
- `TODO`, `FIXME`, `HACK`, `XXX`, `SAFETY`, `SECURITY`, `PERF`
- URLs and issue references (`#1234`, `ABC-123`)
- Doc comments (`///`, `/** */`, `"""`, `<summary>`) unless the level is `brutal`

**"Explaining why" is deliberately not on that list.** An earlier version allowed any comment containing *why*, *because*, *workaround*, *caveat*, and friends. That is a keyword match, not a semantic one: writing "because" bought a comment unlimited exemption, including from the density cap. Since almost every comment gestures at intent, it exempted almost everything and made the plugin trivial to defeat by accident. If a line needs a paragraph to justify it, rename it or restructure it.

Two rules catch the remaining case - a block of genuine-sounding prose where no single line matches a rule. `too-long` caps one contiguous comment block at 2 lines under `normal` and 1 under `brutal`. Allow-listed lines split a run rather than exempting it, so a licence header stays legal but a paragraph wrapped around an `eslint-disable` does not. Doc blocks are exempt wherever doc comments are allowed at all. `density` then counts every comment you add, allow-listed or not, against the lines you add.

Two design choices keep this from becoming an obstacle:

**Only added lines are judged.** The hook reconstructs the resulting file and runs an LCS diff against what is on disk, so a line is judged only if it is genuinely new. A trimmed-multiset diff is not enough here: when a new comment duplicates one that already appears later in the file, the multiset consumes the wrong occurrence and blames the pre-existing line. Editing a legacy file thick with old comments will never be blocked over comments you did not write.

**The loop breaker.** If the same file is denied twice in a row, the third attempt is allowed through with a warning instead. A misfiring classifier costs you one wasted retry, never a deadlock. The counter lives in `~/.claude/terse-denials.json`, falling back to the temp directory, and is written atomically. If neither location is writable the hook degrades to warning instead of blocking, since a denial it cannot count is a denial it cannot stop. A file let through this way is also skipped by the background scan, so a deliberate override is not re-litigated on the next prompt.

The background scan is the counterweight to that narrowness. It reads whole files and reports without blocking, so noise that accumulated across several edits, or arrived before Claude touched the file, still surfaces - as a note it can act on, not a retry it must pay for. Reports live one per session and file under `~/.claude/terse-findings/`, are rewritten in place on each scan so a fix silently clears the old report, and are deleted as they are delivered.

## Configuration

`.claude/terse.json` in a project overrides `~/.claude/terse.json`:

```json
{
  "level": "normal",
  "wordBudget": 250,
  "commentDensity": 0.08,
  "maxCommentLines": 2,
  "allowDocComments": true,
  "enforceMarkdown": true,
  "asyncScan": true,
  "allowPatterns": ["^\\s*mypy:", "generated by"],
  "extensions": [".js", ".ts", ".cs", ".py"]
}
```

`allowPatterns` entries are case-insensitive regexes tested against the raw comment. `asyncScan: false` turns off the background scan while leaving write-time enforcement in place. Files outside `extensions` are ignored entirely, as are paths under `node_modules/`, `vendor/`, `dist/`, `build/`, `bin/`, `obj/`, and anything matching `.min.`, `.generated.`, or `.designer.`.

## Scope

Comment enforcement covers C-style (`//`, `/* */`), hash (`#`), and dash (`--`) comment syntaxes - JavaScript, TypeScript, C#, Java, Kotlin, Go, Rust, Swift, Dart, C/C++, PHP, Python, Ruby, Perl, R, Julia, shell, PowerShell, SQL, and Lua. Python triple-quoted docstrings are treated as doc comments, so `brutal` rejects them and `normal` does not. Markdown is handled by the separate rule family above; JSON, YAML, and everything else are never touched.

## Design notes

There is deliberately no background server. Each hook is one short-lived Node process, a few tens of milliseconds per write. The background scan is a detached one-shot process per write, not a daemon or a watcher - it exits as soon as it has written its report. A plugin whose entire thesis is minimalism should not ship a daemon.

There is also deliberately no `Stop` hook. Blocking on `Stop` makes Claude *continue generating* - precisely the wrong outcome for a verbosity tool. The prose half therefore works by context injection alone.

## Development

```
npm test          # node --test tests/*.test.js
```

Zero runtime and dev dependencies. Tests drive every hook end-to-end through real stdin payloads.

Cutting a release - commit with `[release]` in the message; CI bumps the patch version, tags it, and notifies the marketplace. Use `[release:minor]` or `[release:major]` to bump a different segment.

## Licence

MIT
