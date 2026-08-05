---
description: Show or set the terse enforcement level (off | normal | brutal), set the word budget, or view verbosity stats
argument-hint: "[off|normal|brutal|budget <n>|stats]"
allowed-tools: Read, Write, Edit, Bash(node:*)
---

Argument: `$ARGUMENTS`

Config resolution: `.claude/terse.json` in the project overrides `~/.claude/terse.json`.

## No argument - report status

Read `.claude/terse.json` (project), falling back to `~/.claude/terse.json`, falling back to the default `level: "normal"`. Report in two lines: the active level, and the numbers that follow from it (word budget, comment density cap, comment line cap, doc comments allowed).

Level presets:

| level | wordBudget | commentDensity | maxCommentLines | allowDocComments |
|---|---|---|---|---|
| `off` | - | - | - | hooks disabled entirely |
| `normal` | 250 | 0.08 | 2 | true |
| `brutal` | 120 | 0.03 | 1 | false |

## `off` / `normal` / `brutal` - set the level

Write `{ "level": "<value>" }` into `.claude/terse.json` in the current project, preserving any other keys already present in that file. Create the file and `.claude/` directory if absent. Confirm in one line.

Note that `off` disables every hook - the style contract, the adaptive nudge, comment enforcement, and the background scan.

## `budget <n>` - set the prose word budget

Reject anything that is not an integer between 40 and 2000, in one line, without writing.

Otherwise merge `{ "wordBudget": <n> }` into `.claude/terse.json` in the current project, preserving every other key including `level`. Create the file and `.claude/` directory if absent. Confirm in one line, naming the old and new value.

Write it to the **project** file, not `~/.claude/terse.json`. A `wordBudget` in the user file is discarded whenever a project selects a different level than the user file did; the project file always wins.

## `budget` - report the effective budget

Report the active word budget and where it came from: the project file, the user file, or the level preset.

## `stats` - verbosity trend

`${CLAUDE_PLUGIN_ROOT}` is substituted only in hook commands, not in the Bash tool, so
resolve the path first. Use Glob to find `hooks/lib/stats.js` under `~/.claude/plugins/`
(the installed copy lives at `~/.claude/plugins/cache/hurleysk-marketplace/terse/<version>/`),
then run it with Bash:

```
node "<resolved path>/hooks/lib/stats.js"
```

It prints the word count of each of the last 10 assistant turns in the current session's transcript, the median, how many turns exceeded budget, and the current consecutive over-budget streak. Relay the numbers and one sentence on the trend. Do not pad this with advice.
