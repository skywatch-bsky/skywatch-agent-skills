# Osprey Rules Plugin

Last verified: 2026-02-21

## Purpose

Orchestrator plugin that coordinates specialized subagents to write, review, and
debug Osprey SML moderation rules for the AT Protocol (Bluesky). The entry point
agent (`osprey-rule-writer`) dispatches domain-specific subagents rather than
doing rule work itself — all SML knowledge lives in skills loaded by each subagent.

## Architecture

v2 uses an orchestrator-and-subagents pattern (modelled on ed3d-plan-and-execute):

- **osprey-rule-writer** (orchestrator) — thin coordinator, dispatches subagents, manages review→fix loop
- **osprey-rule-planner** — gathers requirements, produces rule specifications
- **osprey-rule-impl** — writes SML files from rule specifications
- **osprey-rule-reviewer** — three-layer verification gate (osprey-cli, proactive checks, conventions)
- **osprey-rule-debugger** — fixes reviewer-identified issues

The orchestrator routes user intent to the right flow:

| Flow | Trigger | Agents |
|------|---------|--------|
| Flow 1 | "Write a rule for X" | investigator → planner → impl → reviewer (→ debugger loop) |
| Flow 2 | "Validate my rules" | investigator → reviewer (→ offer debugger) |
| Flow 3 | "Fix this error" | investigator → debugger → reviewer (→ debugger loop) |
| Flow 4 | "What patterns exist?" | None (orchestrator loads `osprey-sml-reference` directly) |
| Flow 5 | "Review this rule" | reviewer (ad-hoc mode) |

## Contracts

- **Exposes**:
  - Agent: `osprey-rule-writer` — orchestrator entry point for all Osprey rule tasks
  - Agent: `osprey-rule-planner` — requirements gathering subagent
  - Agent: `osprey-rule-impl` — SML authoring subagent
  - Agent: `osprey-rule-reviewer` — verification gate subagent
  - Agent: `osprey-rule-debugger` — issue fixer subagent
  - Command: `/osprey-validate [path]` — runs `uv run osprey-cli push-rules --dry-run`
  - Skills: `planning-osprey-rules`, `authoring-osprey-rules`, `reviewing-osprey-rules`, `fixing-osprey-rules`, `osprey-sml-reference`
- **Guarantees**:
  - Orchestrator NEVER writes SML code (delegates to impl agent)
  - Orchestrator NEVER loads domain skills (except `osprey-sml-reference` for Flow 4)
  - Orchestrator prints full subagent output after every dispatch (no summarisation)
  - All SML domain knowledge lives in skills, not agent prompts
  - Reviewer is a hard gate: zero issues across all severities (Critical/Important/Minor) required to pass
  - Baseline captured before writing; only new issues block the gate
  - Review→fix loop maxes at 5 cycles then escalates to human
  - Labels must exist in `config/labels.yaml` before use in effects
- **Expects**:
  - Access to `osprey-for-atproto` repo (via `OSPREY_REPO_PATH` env var or user-provided path)
  - A valid Osprey rules project (via `OSPREY_RULES_PATH` env var or user-provided path)
  - `osprey-rule-investigator` plugin installed (used by orchestrator for project analysis in Flows 1-3)
  - `uv` installed for running `uv run osprey-cli` and `uv sync`

## Environment Variables (Optional)

| Variable | Purpose |
|----------|---------|
| `OSPREY_RULES_PATH` | Path to the Osprey rules project directory (contains `main.sml`). Skips asking the user. |
| `OSPREY_REPO_PATH` | Path to the `osprey-for-atproto` repository (contains `osprey_worker/`). Skips asking the user. |

Set these in `~/.claude/settings.json` under `env` or export them in your shell profile. If unset, agents will ask via `AskUserQuestion` on first invocation.

## Dependencies

- **Uses**: `osprey-cli` via `uv run` from `osprey-for-atproto` repo (validation in reviewer and debugger self-check)
- **Uses**: `osprey-rule-investigator` plugin (project analysis via Task tool delegation — required for Flows 1-3)
- **Used by**: Any Claude Code session with this plugin installed
- **Boundary**: Orchestrator depends on `osprey-rule-investigator` for project state discovery; if not installed, Flows 1-3 cannot run

## Key Decisions

- **Orchestrator + subagents over monolithic agent**: Separates concerns (planning, writing, reviewing, fixing), prevents one agent from being overloaded, allows each agent to load only the skills it needs
- **Reviewer as hard gate**: All severities must be zero to pass — Minor issues are not optional. Prevents convention drift.
- **Baseline diffing**: Captures pre-existing errors before writing, so the review loop only focuses on regressions from current work. Prevents wasting fix cycles on old issues.
- **Skills are fat, agents are thin**: Domain knowledge lives in skills (`planning-osprey-rules`, `authoring-osprey-rules`, etc.), not in agent prompts. Agents contain routing logic and constraints only.
- **Five skills split by agent responsibility**: planning (requirements), authoring (SML writing), reviewing (verification), fixing (error resolution), reference (shared SML knowledge)

## Invariants

- `Rule()` objects must be stored in non-underscore-prefixed variables
- `when_all` lists must contain homogeneous types (all `bool` or all `RuleT`)
- `EntityJson` for label targets, `JsonData` for primitives only
- Time durations use named constants (`Day`, `Hour`) not raw integers
- `WhenRules` uses `rules_any=`, never `rules_all=`
- Reviewer runs ALL three layers (osprey-cli, proactive checks, conventions) — no partial reviews
- Orchestrator captures baseline ONCE per flow — it never shifts during the review→fix loop

## Skill Ownership

| Agent | Skills |
|-------|--------|
| `osprey-rule-planner` | `planning-osprey-rules`, `osprey-sml-reference` |
| `osprey-rule-impl` | `authoring-osprey-rules`, `osprey-sml-reference` |
| `osprey-rule-reviewer` | `reviewing-osprey-rules`, `osprey-sml-reference` |
| `osprey-rule-debugger` | `fixing-osprey-rules` |
| `osprey-rule-writer` (orchestrator) | `osprey-sml-reference` (Flow 4 only) |

## Key Files

- `.claude-plugin/plugin.json` — plugin manifest (name, version 0.2.0, metadata)
- `agents/osprey-rule-writer.md` — orchestrator with flow routing and review→fix loop
- `agents/osprey-rule-planner.md` — requirements gathering agent
- `agents/osprey-rule-impl.md` — SML authoring agent
- `agents/osprey-rule-reviewer.md` — three-layer verification gate agent
- `agents/osprey-rule-debugger.md` — issue fixer agent
- `commands/osprey-validate.md` — validation command definition
- `skills/planning-osprey-rules/SKILL.md` — requirements gathering workflow
- `skills/authoring-osprey-rules/SKILL.md` — SML authoring workflow
- `skills/reviewing-osprey-rules/SKILL.md` — three-layer verification methodology
- `skills/fixing-osprey-rules/SKILL.md` — error categories and fix patterns
- `skills/osprey-sml-reference/SKILL.md` — SML type system and constructs
- `skills/osprey-sml-reference/references/labeling-patterns.md` — 24 labeling pattern templates
- `skills/osprey-sml-reference/references/sml-conventions.md` — naming conventions, anti-patterns, reviewer checklist

## Gotchas

- `osprey-cli` is NOT on PATH; must be invoked via `uv run` from within `osprey-for-atproto`
- `osprey-cli` validation catches syntax errors but NOT all logic/convention violations; the reviewer's Layer 2 (proactive checks) and Layer 3 (convention review) exist because osprey-cli is insufficient
- `_` prefixed variables are file-local in SML; they cannot be imported cross-file
- Skills are not user-invocable (`user-invocable: false`); they load via agent routing
- The orchestrator NEVER writes SML — if you see it writing `.sml` files, something is wrong
- Baseline is captured ONCE per flow; it never shifts during the review→fix loop
- If `osprey-rule-investigator` plugin is not installed, Flows 1-3 will fail; the orchestrator should detect this and inform the user
- The reviewer is read-only; it NEVER modifies rule files
- Minor issues are NOT optional — they block the reviewer gate just like Critical issues
