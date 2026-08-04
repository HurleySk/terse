# terse

A Claude Code plugin that enforces concise responses and ultra-minimal code comments.

Opus 5 is verbose by default - preambles, recaps, option surveys, and code buried in comments that restate the line below them. Instructions in `CLAUDE.md` help for a while, then drift out of attention on a long session. `terse` applies pressure that does not drift.

## What it does

**Prose.** A style contract is injected at session start. After that, a `UserPromptSubmit` hook reads the transcript, measures the prose in your last response, and injects a correction *only when it exceeded budget*. Word counts exclude fenced and inline code, so writing a large file is not treated as rambling. When Claude is already concise, the hook emits nothing and costs nothing.

**Comments.** A `PreToolUse` hook on `Write` and `Edit` inspects the lines the tool is about to add, classifies noise comments, and returns `deny` with the specific lines. Claude rewrites and retries on its own - you are never prompted.

**Docs.** The same hook applies a separate rule family to `.md` files, since markdown has no comments to classify. It catches filler openers, sections that only recap, sentences that add nothing beyond their own heading, and stacked hedging.

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
/terse off        # disable all three hooks
/terse stats      # word count of the last 10 turns
```

| level | word budget | comment density cap | doc comments | markdown rules |
|---|---|---|---|---|
| `off` | - | - | hooks disabled | off |
| `normal` *(default)* | 250 | 8% | allowed | on |
| `brutal` | 120 | 3% | rejected | on |

A project's `.claude/terse.json` wins over `~/.claude/terse.json`. A number you tuned in the user file is carried forward only while the effective level is still the level that file chose, so `/terse brutal` in one project applies brutal fully rather than inheriting your global `normal` numbers.

## What gets rejected

| rule | example |
|---|---|
| `restates-code` | `// increment counter` above `counter++` |
| `section-banner` | `// ---------- Setup ----------` |
| `step-narration` | `// Step 1: validate the payload` |
| `changelog` | `// NEW: added retry`, `// was: setTimeout(...)` |
| `ceremony` | `// imports`, `// constructor`, `// helper function` |
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

The `density` rule is what catches the remaining case - a block of genuine-sounding prose where no single line matches a rule. It counts every comment you add, allow-listed or not, against the lines you add.

Two design choices keep this from becoming an obstacle:

**Only added lines are judged.** The hook reconstructs the resulting file and runs an LCS diff against what is on disk, so a line is judged only if it is genuinely new. A trimmed-multiset diff is not enough here: when a new comment duplicates one that already appears later in the file, the multiset consumes the wrong occurrence and blames the pre-existing line. Editing a legacy file thick with old comments will never be blocked over comments you did not write.

**The loop breaker.** If the same file is denied twice in a row, the third attempt is allowed through with a warning instead. A misfiring classifier costs you one wasted retry, never a deadlock. The counter lives in `~/.claude/terse-denials.json`, falling back to the temp directory, and is written atomically. If neither location is writable the hook degrades to warning instead of blocking, since a denial it cannot count is a denial it cannot stop.

## Configuration

`.claude/terse.json` in a project overrides `~/.claude/terse.json`:

```json
{
  "level": "normal",
  "wordBudget": 250,
  "commentDensity": 0.08,
  "allowDocComments": true,
  "allowPatterns": ["^\\s*mypy:", "generated by"],
  "extensions": [".js", ".ts", ".cs", ".py"]
}
```

`allowPatterns` entries are case-insensitive regexes tested against the raw comment. Files outside `extensions` are ignored entirely, as are paths under `node_modules/`, `vendor/`, `dist/`, `build/`, `bin/`, `obj/`, and anything matching `.min.`, `.generated.`, or `.designer.`.

## Scope

Comment enforcement covers C-style (`//`, `/* */`), hash (`#`), and dash (`--`) comment syntaxes - JavaScript, TypeScript, C#, Java, Kotlin, Go, Rust, Swift, Dart, C/C++, PHP, Python, Ruby, Perl, R, Julia, shell, PowerShell, SQL, and Lua. Python triple-quoted docstrings are treated as doc comments, so `brutal` rejects them and `normal` does not. Markdown is handled by the separate rule family above; JSON, YAML, and everything else are never touched.

## Design notes

There is deliberately no background server. Each hook is one short-lived Node process, a few tens of milliseconds per write. A plugin whose entire thesis is minimalism should not ship a daemon.

There is also deliberately no `Stop` hook. Blocking on `Stop` makes Claude *continue generating* - precisely the wrong outcome for a verbosity tool. The prose half therefore works by context injection alone.

## Development

```
npm test          # node --test tests/*.test.js
```

Zero runtime and dev dependencies. Tests drive every hook end-to-end through real stdin payloads.

Cutting a release - commit with `[release]` in the message; CI bumps the patch version, tags it, and notifies the marketplace.

## Licence

MIT
