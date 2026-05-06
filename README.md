# skywatch-skills

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin marketplace for investigating coordinated behaviour on the AT Protocol network, authoring Osprey SML moderation rules, and managing Ozone queues. Built and maintained by [Skywatch Blue](https://github.com/skywatch-bsky).

## Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| [osprey-rules](#osprey-rules) | 0.3.0 | SML rule authoring orchestrator with specialized subagents |
| [osprey-rule-investigator](#osprey-rule-investigator) | 0.1.0 | Read-only analysis of SML rule projects |
| [skywatch-investigations](#skywatch-investigations) | 0.23.6 | Network investigation toolkit (MCP + skills + agents) |

## Installation

Add the marketplace to your Claude Code settings:

```bash
claude install-plugin github:skywatch-bsky/claude-skills
```

Individual plugins are registered in `.claude-plugin/marketplace.json` and loaded by Claude Code from the `plugins/` directory.

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- [`uv`](https://docs.astral.sh/uv/) on PATH (used by MCP server installation and osprey-cli)
- SSH access to GitHub (for `git+ssh://` MCP dependencies)
- **osprey-rules**: local clone of `osprey-for-atproto` repo
- **skywatch-investigations**: ClickHouse credentials; optionally Ozone credentials for moderation write tools

---

## osprey-rules

Orchestrator plugin for writing, reviewing, and debugging Osprey SML moderation rules. Uses an orchestrator-and-subagents pattern where domain knowledge lives in skills and agents contain only routing logic.

### Architecture

The entry point agent (`osprey-rule-writer`) dispatches specialized subagents based on user intent:

| Flow | Trigger | Agents involved |
|------|---------|-----------------|
| Write | "Write a rule for X" | investigator → planner → impl → reviewer (→ debugger loop) |
| Validate | "Validate my rules" | investigator → reviewer (→ offer debugger) |
| Fix | "Fix this error" | investigator → debugger → reviewer (→ debugger loop) |
| Reference | "What patterns exist?" | Orchestrator loads `osprey-sml-reference` directly |
| Review | "Review this rule" | Reviewer in ad-hoc mode |

**Subagents**

- **osprey-rule-writer** — thin orchestrator, routes intent and manages review-fix loop
- **osprey-rule-planner** — gathers requirements, produces rule specifications
- **osprey-rule-impl** — writes SML files from specifications
- **osprey-rule-reviewer** — three-stage verification gate (osprey-cli, proactive checks, convention review)
- **osprey-rule-debugger** — fixes reviewer-identified issues

**Skills (5)**

- `planning-osprey-rules` — requirements gathering workflow
- `authoring-osprey-rules` — SML authoring workflow
- `reviewing-osprey-rules` — three-layer verification methodology
- `fixing-osprey-rules` — error categories and fix patterns
- `osprey-sml-reference` — SML type system, 24 labelling pattern templates, naming conventions

**Command**

- `/osprey-validate [path]` — runs `uv run osprey-cli push-rules --dry-run`

### Key Design Decisions

- **Skills are fat, agents are thin.** All SML domain knowledge lives in skills. Agent prompts contain routing logic and constraints only.
- **Reviewer is a hard gate.** Zero issues across all severities (Critical, Important, Minor) required to pass. Minor issues are not optional.
- **Baseline diffing.** The reviewer captures pre-existing errors before writing so the review loop only focuses on regressions.
- **Max 5 review-fix cycles** before escalating to a human.
- **Depends on osprey-rule-investigator** for project state discovery (Flows 1-3 fail without it).

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OSPREY_RULES_PATH` | No | Path to the Osprey rules project directory (contains `main.sml`). If unset, the agent asks. |
| `OSPREY_REPO_PATH` | No | Path to the `osprey-for-atproto` repository. If unset, the agent asks. |

---

## osprey-rule-investigator

Read-only analysis agent for Osprey SML rule projects — produces structured text reports covering project structure, labels, models, UDFs, and execution graphs without modifying any files.

Used as a subagent by `osprey-rules` for project state discovery, but can also be invoked standalone.

### What It Reports

- Project structure inventory (files, labels, models)
- UDF discovery (dynamic from Python source, static fallback)
- Execution graph mapping (Import/Require chains, Rule/WhenRules catalogues)
- Confidence level for UDF discovery method used

### Inputs

- Rules project path (required)
- `osprey-for-atproto` repo path (required for dynamic UDF discovery; static fallback used otherwise)

---

## skywatch-investigations

Investigation toolkit for AT Protocol network analysis. Three-layer architecture: an MCP server for native tool access, skills that codify investigation methodology, and agents that orchestrate workflows.

### Architecture

```
┌─────────────────────────────────────────┐
│  Agents                                 │
│  ├── investigator (orchestrator)        │
│  │   └── delegates ClickHouse → ───────────┐
│  └── data-analyst (ClickHouse queries)  │◄─┘
├─────────────────────────────────────────┤
│  Skills (loaded on-demand by phase)     │
│  ├── conducting-investigations          │
│  ├── accessing-osprey                   │
│  ├── querying-clickhouse                │
│  ├── reporting-results                  │
│  ├── assess-account                     │
│  ├── search-incidents                   │
│  ├── triage-rule-hits                   │
│  ├── classify-cluster                   │
│  ├── querying-ozone                     │
│  └── working-the-queue                  │
├─────────────────────────────────────────┤
│  MCP Server (skywatch-mcp, external)    │
│  ├── ClickHouse: query, schema          │
│  ├── Co-sharing: clusters, pairs,       │
│  │   evolution, content_similarity      │
│  ├── Recon: domain, IP, URL, WHOIS      │
│  └── Ozone: label, query, comment,      │
│      acknowledge, escalate, tag,         │
│      mute, unmute, resolve_appeal        │
└─────────────────────────────────────────┘
```

### Agents

**investigator** — orchestrator that runs the full investigation workflow. Delegates all ClickHouse queries to the data-analyst subagent. Performs reconnaissance (domain, IP, URL, WHOIS) directly. Loads skills on-demand by investigation phase to keep context lean.

**data-analyst** — focused ClickHouse query agent. Always includes the SQL used in its output for reproducibility.

### Skills (10)

| Skill | Phase | Purpose |
|-------|-------|---------|
| `conducting-investigations` | All | Six-phase investigation methodology |
| `accessing-osprey` | Setup | Osprey system context and schema reference |
| `querying-clickhouse` | Query | ClickHouse query patterns and safety rules |
| `reporting-results` | Report | BLIND report format and conventions |
| `assess-account` | Phase 2 | Structured account assessment with classification |
| `search-incidents` | Phase 1 | Topic-based incident search with relevance scoring |
| `triage-rule-hits` | Phase 5 | Rule hit triage (TP/FP/novel classification) |
| `classify-cluster` | Phase 3-4 | Co-sharing cluster narrative classification |
| `querying-ozone` | Moderation | Ozone tool reference and query patterns |
| `working-the-queue` | Moderation | Queue triage methodology (scan-classify-act) |

### MCP Tools (20)

**ClickHouse** — `clickhouse_query` (read-only SQL, LIMIT required), `clickhouse_schema`

**Co-sharing** — `cosharing_clusters`, `cosharing_pairs`, `cosharing_evolution`, `content_similarity`

**Recon** — `domain_check`, `ip_lookup`, `url_expand`, `whois_lookup`

**Ozone (moderation)** — `ozone_label`, `ozone_query_statuses`, `ozone_query_events`, `ozone_comment`, `ozone_acknowledge`, `ozone_escalate`, `ozone_tag`, `ozone_mute`, `ozone_unmute`, `ozone_resolve_appeal`

The plugin installs the MCP server — an external Python (FastMCP) package — via `uvx` from `git+ssh://git@github.com/skywatch-bsky/skywatch-mcp.git`. No server source lives in this repository; it's maintained as a separate package with its own release cycle.

### Investigation Methodology

Investigations follow the BLIND report format:

- **BL** — Bottom line: what happened, one sentence
- **I** — Impact on the network: scope and severity
- **N** — Next steps: recommended actions
- **D** — Details: evidence, analysis, timestamps, AT-URIs

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `CLICKHOUSE_HOST` | Yes | ClickHouse server hostname |
| `CLICKHOUSE_PORT` | Yes | ClickHouse server port |
| `CLICKHOUSE_USER` | Yes | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | Yes | ClickHouse password |
| `CLICKHOUSE_DATABASE` | Yes | ClickHouse database name |
| `OZONE_HANDLE` | No | Bluesky handle for Ozone authentication |
| `OZONE_ADMIN_PASSWORD` | No | Ozone admin password |
| `OZONE_DID` | No | Ozone service DID |
| `OZONE_PDS` | No | PDS URL for Ozone auth proxy |

ClickHouse variables are configured in the plugin's `.mcp.json`. Set Ozone variables in `~/.claude/settings.json` under `env` or export them in your shell profile to avoid committing secrets.

---

## Known Gotchas

- **osprey-cli is not on PATH.** Always invoke via `uv run` from within the `osprey-for-atproto` repo.
- **Ozone credentials are optional.** Without them, Ozone tools return an authentication error and skip the operation. Write tools require all four Ozone env vars.
- **Ozone auth goes through the PDS** (via `atproto-proxy` header), not directly to the Ozone service URL.
- **ClickHouse direct access required.** No REST API fallback.
- **ip-api.com rate limit.** Free tier allows 45 requests per minute.
- **Co-sharing pair/membership tables have 7-day TTL.** Queries beyond that window return no results. Cluster-level data is retained indefinitely.
- **Investigator never writes SQL.** If you see the investigator agent writing ClickHouse queries directly, something is wrong — it should delegate to data-analyst.
- **osprey-rule-investigator required for osprey-rules.** Flows 1-3 (write, validate, fix) fail without it installed.

## Project Structure

```
skywatch-skills/
├── .claude-plugin/
│   └── marketplace.json            # Plugin registry
├── plugins/
│   ├── osprey-rules/               # v0.3.0
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── agents/                 # 5 agents (writer, planner, impl, reviewer, debugger)
│   │   ├── commands/               # /osprey-validate
│   │   ├── skills/                 # 5 skills
│   │   └── CLAUDE.md
│   ├── osprey-rule-investigator/   # v0.1.0
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── agents/                 # 1 agent (investigator)
│   │   ├── skills/                 # 1 skill + UDF reference
│   │   └── CLAUDE.md
│   └── skywatch-investigations/    # v0.23.6
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── .mcp.json               # MCP server config
│       ├── agents/                 # 2 agents (investigator, data-analyst)
│       ├── hooks/
│       ├── skills/                 # 10 skills
│       └── CLAUDE.md
├── docs/
│   ├── design-plans/
│   ├── implementation-plans/
│   └── test-plans/
├── CHANGELOG.md
├── CLAUDE.md
└── MIT License
```

## Development

Each plugin is self-contained under `plugins/`. The plugin `CLAUDE.md` files serve as the canonical reference for contracts, architecture, and invariants.

Design plans, implementation plans, and test plans live under `docs/`. These are working documents, not user-facing documentation.

The marketplace registry (`.claude-plugin/marketplace.json`) must stay in sync with individual `plugin.json` files. Version bumps happen in both places.

## Licence

[MIT](MIT%20License) -- Copyright (c) 2026 Skywatch Blue
