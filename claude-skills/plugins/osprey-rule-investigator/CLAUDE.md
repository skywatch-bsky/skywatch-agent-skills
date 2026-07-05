# osprey-rule-investigator

Read-only analysis agent that investigates Osprey SML rules projects and reports what a rule-writing agent needs to know.

Last verified: 2026-02-21

## Purpose

Performs structured investigation of an Osprey SML rules project, producing a text report covering:
- Project structure inventory (files, labels, models)
- UDF discovery (dynamic from Python source, static fallback)
- Execution graph mapping (Import/Require chains, Rule/WhenRules catalogues)

## Contracts

### Exposes
- `osprey-rule-investigator` agent — spawnable as a subagent via `Task` tool
- `investigating-osprey-rules` skill — loaded by the agent, not user-invocable

### Guarantees
- Read-only: never writes files unless caller explicitly requests it
- Text-only output: returns structured text report, no side effects
- Reports confidence level: indicates whether UDF discovery used dynamic or static source

### Expects
- Caller provides rules project path (required)
- Caller provides osprey-for-atproto repo path (required for dynamic UDF discovery; static fallback used if inaccessible)

## Dependencies

- **Uses**: Nothing (standalone read-only plugin)
- **Used by**: `osprey-rules` plugin -- orchestrator dispatches this agent as a subagent in Flows 1-3 (write, validate, fix) for project state discovery

## Key Files

| File | Purpose |
|------|---------|
| `agents/osprey-rule-investigator.md` | Agent definition (haiku model, read-only) |
| `skills/investigating-osprey-rules/SKILL.md` | Investigation methodology |
| `skills/investigating-osprey-rules/references/udf-signatures.md` | Static UDF signature fallback |
