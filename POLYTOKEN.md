# Polytoken Port — skywatch / osprey plugins

This repository ships a [Claude Code](plugins/) plugin tree. `.polytoken/` is a
**non-destructive Polytoken port** of the same capabilities: the 17 skills, 8
agents (as subagents), and 4 MCP servers from the three plugins
(`skywatch-investigations`, `osprey-rules`, `osprey-rule-investigator`), plus an
18th derived skill (`osprey-validate`). The Claude plugin tree, marketplace, and
`CLAUDE.md` files are intentionally left untouched.

## Layout

```
.polytoken/
├── config.yaml              # 4 MCP servers
├── hooks.json               # project hooks: ozone_label comment-validation gate
├── hooks/                   # hook scripts (validate-label-comment.js)
├── permissions.local.yaml   # pre-existing personal file (UNCHANGED)
├── skills/                  # 18 skills: <name>/SKILL.md (+ optional references/)
└── subagents/               # 8 subagents: <name>.md
```

## Environment variables

MCP servers are stdio/http children of the daemon and inherit its environment —
secrets are **not** stored in `config.yaml`. Export these in the shell that
launches `polytoken daemon`:

| Variables | Used by |
|---|---|
| `CLICKHOUSE_HOST` `CLICKHOUSE_PORT` `CLICKHOUSE_USER` `CLICKHOUSE_PASSWORD` `CLICKHOUSE_DATABASE` | `skywatch-mcp` (all ClickHouse tools) |
| `OZONE_HANDLE` `OZONE_ADMIN_PASSWORD` `OZONE_DID` `OZONE_PDS` | `skywatch-mcp` (Ozone moderation tools) |
| `OSPREY_RULES_PATH` `OSPREY_REPO_PATH` | osprey subagents + `osprey-validate` skill |

Prerequisites: `uv`/`uvx` on PATH; SSH access to `github.com:skywatch-bsky/skywatch-mcp.git`;
a local `osprey-for-atproto` clone for osprey work.

## MCP servers

| Server | Transport | Tools |
|---|---|---|
| `skywatch-mcp` | stdio | `mcp__skywatch-mcp__*` — ClickHouse (`clickhouse_query`, `clickhouse_schema`), recon (`domain_check`, `ip_lookup`, `url_expand`, `whois_lookup`), co-sharing (`cosharing_clusters`, `cosharing_pairs`, `cosharing_evolution`), `content_similarity`, Ozone (label/comment/acknowledge/escalate/tag/mute/unmute/resolve_appeal/query_statuses/query_events) |
| `pdsx` | stdio | `mcp__pdsx__*` — `list_records`, `get_record`, `describe_repo` |
| `atproto` | stdio | `mcp__atproto__*` |
| `pub-search` | http | `mcp__pub-search__*` |

## Skills (18)

| Skill | Origin |
|---|---|
| `conducting-investigations`, `accessing-osprey`, `querying-clickhouse`, `reporting-results`, `assess-account`, `search-incidents`, `triage-rule-hits`, `classify-cluster`, `querying-ozone`, `working-the-queue`, `labeling-standards` | skywatch (11) |
| `planning-osprey-rules`, `authoring-osprey-rules`, `reviewing-osprey-rules`, `fixing-osprey-rules`, `osprey-sml-reference` | osprey (5) |
| `investigating-osprey-rules` | investigator (1) |
| `osprey-validate` | derived from the `/osprey-validate` command (1) |

## Subagents (8)

| Subagent | Model | Role |
|---|---|---|
| `investigator` | default (spawns) | skywatch investigation orchestrator; delegates ClickHouse to `data-analyst` |
| `data-analyst` | `default_model:full` | ClickHouse query specialist (incl. co-sharing + Ozone read tools) |
| `osprey-rule-writer` | default (spawns) | osprey orchestrator; dispatches the 5 osprey workers |
| `osprey-rule-planner` | `default_model:full` | rule requirements → spec |
| `osprey-rule-impl` | `default_model:full` | SML authoring (writes files) |
| `osprey-rule-reviewer` | `default_model:full` | three-layer verification gate (read-only) |
| `osprey-rule-debugger` | `default_model:full` | fixes reviewer-identified issues (writes files) |
| `osprey-rule-investigator` | `default_model:mini` | read-only rules-project analysis |

## Labeling gate (hook status: **ported**)

The Claude plugin enforced `ozone_label` comment quality with a `PreToolUse` hook.
Polytoken has its own hooks system (`.polytoken/hooks.json`), so the gate is ported
faithfully: a blocking `pre_tool_use` hook (matcher `mcp__skywatch-mcp__ozone_label`)
runs `.polytoken/hooks/validate-label-comment.js`, enforcing the same rules as the
original — non-empty comment, a `<label> applied —` summary line, an `Evidence:`
section, and AT-URI citations (≥2 for account-level subjects). A deficient call is
**denied** with a reason shown to the model; a compliant one proceeds. This matches
the original plugin's auto content-validation. The `labeling-standards` skill
documents the required format. Other Ozone write tools (comment/acknowledge/
escalate/tag/mute/unmute/resolve_appeal) are ungated, exactly as in the original
plugin, which only hooked `ozone_label`. (Hooks load at startup and on config
reload, so edit `hooks.json` then reload for changes to take effect.)

## Notable differences from the Claude plugins

- **Skill front matter** reduced to `description` (`name`/`color`/`user-invocable` dropped — not valid Polytoken skill keys).
- **Subagent front matter**: Claude `allowed-tools`/`model`/`color` → `polytoken.tools`/`polytoken.model`; orchestrators set `allow_subagent_spawn: true`.
- **MCP tools** qualified as `mcp__<server>__<tool>` in allowlists and prose; tool-vs-ClickHouse-table names distinguished (`cosharing_pairs` is a tool, `url_cosharing_pairs` is a table).
- **Dispatch**: `Task(subagent_type="osprey-rules:X")` → plain `subagent_type="X"`; read queries → `data-analyst`; write/moderation actions → `general-purpose-mini`.
- **`/osprey-validate` command** → model-invocable `osprey-validate` skill.
- **Labeling hook** ported to Polytoken's `.polytoken/hooks.json` (`pre_tool_use` on `ozone_label`), faithfully replicating the Claude `PreToolUse` gate.

## Validating

```sh
polytoken config validate     # validate .polytoken/config.yaml
```

Operational smoke tests (require live creds + the daemon shell env above) are
documented in the plan's acceptance criteria (MCP read, `data-analyst` dispatch,
osprey Flow 2, labeling-gate hook block). Note: skills, subagents, and hooks load
at daemon startup / on `POST /reload` — `config validate` covers `config.yaml` /
permissions but not these, so reload and check daemon logs to confirm they load
without warnings.
