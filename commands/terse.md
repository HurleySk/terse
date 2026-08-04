---
description: Show or set the terse enforcement level (off | normal | brutal), or view verbosity stats
argument-hint: "[off|normal|brutal|stats]"
allowed-tools: Read, Write, Edit, Bash(node:*)
---

Argument: `$ARGUMENTS`

Config resolution: `.claude/terse.json` in the project overrides `~/.claude/terse.json`.

## No argument - report status

Read `.claude/terse.json` (project), falling back to `~/.claude/terse.json`, falling back to the default `level: "normal"`. Report in two lines: the active level, and the three numbers that follow from it (word budget, comment density cap, doc comments allowed).

Level presets:

| level | wordBudget | commentDensity | allowDocComments |
|---|---|---|---|
| `off` | - | - | hooks disabled entirely |
| `normal` | 250 | 0.08 | true |
| `brutal` | 120 | 0.03 | false |

## `off` / `normal` / `brutal` - set the level

Write `{ "level": "<value>" }` into `.claude/terse.json` in the current project, preserving any other keys already present in that file. Create the file and `.claude/` directory if absent. Confirm in one line.

Note that `off` disables all three hooks - the style contract, the adaptive nudge, and comment enforcement.

## `stats` - verbosity trend

`${CLAUDE_PLUGIN_ROOT}` is substituted only in hook commands, not in the Bash tool, so
resolve the path first. Use Glob to find `hooks/lib/stats.js` under `~/.claude/plugins/`
(the installed copy lives at `~/.claude/plugins/cache/hurleysk-marketplace/terse/<version>/`),
then run it with Bash:

```
node "<resolved path>/hooks/lib/stats.js"
```

It prints the word count of each of the last 10 assistant turns in the current session's transcript, plus the median and how many turns exceeded budget. Relay the numbers and one sentence on the trend. Do not pad this with advice.
