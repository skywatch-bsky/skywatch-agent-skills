# Skywatch Investigations Plugin

Last verified: 2026-04-28

## Purpose

Investigation toolkit for AT Protocol network analysis. Provides MCP tools for ClickHouse data access, domain/IP/URL reconnaissance, content similarity detection, and Ozone moderation labelling. Skills codify investigation methodology. Agents orchestrate the full workflow from brief to report.

## Architecture

Three layers — MCP server (native tool access), skills (codified methodology), agents (orchestrated workflows). The investigator agent delegates ClickHouse work to a data-analyst subagent while handling reconnaissance directly.

The MCP server is an external Python (FastMCP) package installed via `uvx` from `git@github.com:skywatch-bsky/skywatch-mcp.git`. No server source lives in this repo.

## Contracts

### Exposes

- **Agents**:
  - `investigator` — investigation orchestrator, dispatches data-analyst for ClickHouse queries
  - `data-analyst` — focused ClickHouse query agent
- **Skills**:
  - `accessing-osprey` — Osprey system context and schema reference
  - `querying-clickhouse` — ClickHouse query patterns and best practices
  - `conducting-investigations` — investigation methodology (reconnaissance, correlation, analysis)
  - `reporting-results` — report structure, formatting, and presentation
  - `assess-account` — structured account assessment with classification schema and recommendation (includes `policy_violator` type for genuine accounts with sustained rule-breaking behaviour)
  - `search-incidents` — topic-based incident search with relevance scoring and content classification
  - `triage-rule-hits` — rule hit triage with TP/FP/novel classification and rule health assessment
  - `classify-cluster` — co-sharing cluster narrative classification distinguishing IO from organic coordination
  - `querying-ozone` — Ozone MCP tool reference: query patterns, filter combinations, pagination, write tool conventions
  - `labeling-standards` — evidence comment standards for all Ozone label actions: required format, citation thresholds, tiered by context (post-level vs account-level vs batch)
  - `working-the-queue` — moderation queue triage methodology: OODA-based workflow (observe, orient, decide, act) with policy-based recommendations, post/account-level labelling, reply thread context, and subagent delegation
- **MCP Tools** (20 total):
  - `clickhouse_query` — Execute read-only queries (SELECT/WITH only, LIMIT required, JOINs/UNIONs/CTEs/subqueries allowed)
  - `clickhouse_schema` — Discover table structure and column definitions for all queryable tables
  - `content_similarity` — Detect text similarity via ClickHouse ngramDistance
  - `cosharing_clusters` — Find URL co-sharing clusters by DID, cluster_id, date, or minimum size (supports JOINs internally)
  - `cosharing_pairs` — Get raw co-sharing pairs for a specific DID with edge weights and shared URLs
  - `cosharing_evolution` — Trace a cluster's evolution history (births, merges, splits, deaths)
  - `domain_check` — Verify domain registration and WHOIS data
  - `ip_lookup` — Geolocate IP addresses via ip-api.com
  - `url_expand` — Expand shortened URLs to full targets
  - `whois_lookup` — Query WHOIS databases for registrant information
  - `ozone_label` — Apply/remove moderation labels via Ozone API (supports comment and batchId for grouping related label operations)
  - `ozone_query_statuses` — Query the Ozone moderation queue with filters for review state, tags, appeal/takedown status, and pagination
  - `ozone_query_events` — Query moderation event history with filters for event type, moderator, date range, and labels
  - `ozone_comment` — Add a comment to a subject's moderation record (supports sticky comments)
  - `ozone_acknowledge` — Acknowledge a subject, moving it from open to reviewed (supports bulk account acknowledgement)
  - `ozone_escalate` — Escalate a subject for higher-level review
  - `ozone_tag` — Add and/or remove tags from a subject's moderation record
  - `ozone_mute` — Mute a subject for a specified duration in hours
  - `ozone_unmute` — Unmute a previously muted subject
  - `ozone_resolve_appeal` — Resolve an appeal on a subject (requires comment)

### Guarantees

- Investigator NEVER writes ClickHouse queries directly — delegates to data-analyst
- Investigator loads optional skills (assess-account, search-incidents, classify-cluster, triage-rule-hits, working-the-queue) on-demand at the relevant phase — never pre-loaded
- All `ozone_label` calls are validated by a `PreToolUse` hook (`validate-label-comment.js`) that enforces `labeling-standards` — calls are hard-blocked if the comment is missing, lacks a summary line, has no Evidence section, or has insufficient AT-URI citations
- `working-the-queue` loads `querying-ozone` as a prerequisite and reads `.policies/` from the working directory for label/policy guidance
- `working-the-queue` treats each reported AT-URI as a separate subject — never rolls up or deduplicates multiple reported posts from the same account
- `working-the-queue` evaluates replies in thread context (parent post, account relationship, reporter identity) before classification
- `working-the-queue` delegates per-subject data collection to subagents to preserve triage agent context window; subagents return recommendations with supporting evidence
- `working-the-queue` uses ClickHouse as the primary data source (rule hits first, then content) — PDS queries are fallback only; caps initial content fetch to 5 posts per subject (plus thread context for replies); deeper fetching is analyst-triggered, capped at 10 posts per follow-up
- `assess-account` supplements ClickHouse data with PDS record fetching via `list_records` (PDSX) when ClickHouse returns insufficient content — ClickHouse covers ~2 months, not the full account history
- `assess-account` classifies genuine accounts with sustained policy violations as `policy_violator` (not `genuine`) — authenticity and compliance are independent axes
- `conducting-investigations` Phase 2 has three branches: coordination → Phase 3, individual policy violator → Phase 6 (enforcement), benign → close. Coordination is not a prerequisite for enforcement action
- `working-the-queue` proactively recommends account-level labels when post-level evidence reveals systemic behaviour patterns
- `working-the-queue` label actions include evidence comments per `labeling-standards` — specific AT-URIs, verbatim post text, and editorial notes
- `working-the-queue` treats all reports as nominations — reporter comments direct investigation but are never evidence for or against the subject; classification is based solely on the subject's actual content and behaviour
- `working-the-queue` guards against batch-level anchoring bias — each subject evaluated independently regardless of batch patterns
- When `working-the-queue` encounters ambiguous policy interpretation, it defers to the analyst and records the decision as a precedent in `.policies/precedents/`
- All ClickHouse queries via `clickhouse_query` are read-only (SELECT/WITH only, LIMIT required, no semicolons, no INTO — JOINs, UNIONs, CTEs, subqueries, and any table are allowed)
- Co-sharing tools (`cosharing_clusters`, `cosharing_pairs`, `cosharing_evolution`) use `queryTrusted` to bypass validation for server-built queries with sanitised inputs (no LIMIT requirement)
- All Ozone tools require explicit credentials — fail gracefully without them
- Data-analyst always includes SQL used in its output (reproducibility)
- Investigation reports follow BLIND format (Bottom Line, Impact, Next Steps, Details)
- All Ozone write tools include modTool metadata (`name: "skywatch-mcp"`, batchId) for traceability
- All Ozone write tools validate credentials before attempting API calls

### Expects

- ClickHouse direct access configured via env vars (`CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`)
- Python 3.12+ and `uv`/`uvx` installed for MCP server
- Ozone credentials (optional — only for read/write tools): `OZONE_HANDLE`, `OZONE_ADMIN_PASSWORD`, `OZONE_DID`, `OZONE_PDS`
- `.policies/` directory in working directory (optional — for `working-the-queue`): label definitions, enforcement criteria, and policy guidance. May contain a `precedents/` subdirectory with analyst decisions on ambiguous cases

## Dependencies

- **Uses**: ClickHouse (osprey_execution_results, pds_signup_anomalies, url/quote_overdispersion_results, account_entropy_results, url/quote_cosharing_pairs/clusters/membership tables), PDSX `list_records` (direct PDS record fetching for content beyond ClickHouse window), ip-api.com (GeoIP), WHOIS servers, Ozone API (read/write moderation events)
- **Used by**: Any Claude Code session with this plugin installed
- **Boundary**: Does NOT overlap with osprey-rules plugin (rule writing) or osprey-rule-investigator (rule project analysis). The `accessing-osprey` skill provides context about the Osprey system but directs users to osprey-rules for rule authoring.

## When to Use

| User Intent | Use |
|-------------|-----|
| "Investigate these accounts" | `investigator` agent |
| "Find accounts triggered by rule X" | `data-analyst` agent or `investigator` |
| "What does the osprey schema look like?" | `accessing-osprey` skill |
| "How do I query ClickHouse effectively?" | `querying-clickhouse` skill |
| "Conduct a full investigation" | `investigator` agent (loads methodology automatically) |
| "Write a report on these findings" | `reporting-results` skill |
| "Check if this account is a bot" | `data-analyst` agent (query `account_entropy_results`) |
| "Find coordinated domain sharing" | `data-analyst` agent (query `url_overdispersion_results`) |
| "Find URL co-sharing clusters" | `cosharing_clusters` tool or `data-analyst` agent |
| "Is this account in a co-sharing network?" | `cosharing_clusters` tool with `did` param |
| "Trace this cluster's history" | `cosharing_evolution` tool with `cluster_id` param |
| "Label a subject in Ozone" | `ozone_label` tool |
| "Query the moderation queue" | `ozone_query_statuses` tool or `data-analyst` agent |
| "What moderation events happened on this account?" | `ozone_query_events` tool or `data-analyst` agent |
| "Add a comment to this subject" | `ozone_comment` tool |
| "Acknowledge this report" | `ozone_acknowledge` tool |
| "Escalate this subject" | `ozone_escalate` tool |
| "Tag/untag this subject" | `ozone_tag` tool |
| "Mute this subject" | `ozone_mute` tool |
| "Unmute this subject" | `ozone_unmute` tool |
| "Resolve this appeal" | `ozone_resolve_appeal` tool |
| "Assess this account" | `assess-account` skill (standalone) or `investigator` agent |
| "Search for incidents about X" | `search-incidents` skill (standalone) or `investigator` agent |
| "Triage rule hits for rule X" | `triage-rule-hits` skill (standalone) or `investigator` agent |
| "Classify this cluster" | `classify-cluster` skill (standalone) or `investigator` agent |
| "Pull the latest reports from the queue" | `working-the-queue` skill |
| "Triage 20 recent reports" | `working-the-queue` skill |
| "Process all appeals" | `working-the-queue` skill (entry point: appeals) |
| "What format should label comments use?" | `labeling-standards` skill |
| "My label got blocked by the hook" | `labeling-standards` skill |
| "How do I use the ozone query tools?" | `querying-ozone` skill |
| "What filters does ozone_query_statuses accept?" | `querying-ozone` skill |

## Key Files

| File | Purpose |
|------|---------|
| `.claude-plugin/plugin.json` | Plugin manifest (name, version 0.23.8, metadata) |
| `.mcp.json` | MCP server configuration with ClickHouse env vars (Ozone env vars set via shell/settings) |
| `agents/investigator.md` | Orchestrator agent, dispatches data-analyst for queries |
| `agents/data-analyst.md` | ClickHouse query agent, focused on osprey_execution_results |
| `skills/assess-account/SKILL.md` | Structured account assessment methodology (data collection, classification, output) |
| `skills/accessing-osprey/SKILL.md` | Osprey system context and schema reference |
| `skills/querying-clickhouse/SKILL.md` | ClickHouse query patterns and best practices |
| `skills/conducting-investigations/SKILL.md` | Investigation methodology and correlation techniques |
| `skills/reporting-results/SKILL.md` | Report structure, BLIND format, presentation |
| `skills/triage-rule-hits/SKILL.md` | Rule hit triage methodology (sampling, classification, health assessment) |
| `skills/search-incidents/SKILL.md` | Topic-based incident search methodology |
| `skills/classify-cluster/SKILL.md` | Co-sharing cluster classification methodology |
| `skills/labeling-standards/SKILL.md` | Evidence comment standards for all label actions |
| `skills/querying-ozone/SKILL.md` | Ozone MCP tool reference (query patterns, filters, write conventions) |
| `skills/working-the-queue/SKILL.md` | Queue triage methodology (OODA with policy guidance) |
| `hooks/validate-label-comment.js` | PreToolUse hook enforcing labeling-standards on ozone_label |
| (external) `skywatch-mcp` | Python FastMCP server, installed via `uvx` from GitHub |

## Gotchas

- MCP server is an external package fetched via `uvx` — requires `uv` on PATH and SSH access to `github.com:skywatch-bsky/skywatch-mcp.git`
- Ozone tools fail gracefully without credentials (clear error message)
- Ozone env vars (`OZONE_HANDLE`, `OZONE_ADMIN_PASSWORD`, `OZONE_DID`, `OZONE_PDS`) are NOT in `.mcp.json` — set them in `~/.claude/settings.json` or `~/.zshrc` to avoid committing secrets
- Ozone auth goes through the PDS (via `atproto-proxy` header), not directly to the Ozone service URL
- `content_similarity` depends on ClickHouse — recon tools work independently
- ip-api.com free tier has 45 req/min rate limit
- Investigator never writes queries directly; if you see it writing SQL, something is wrong
- Co-sharing tools use `queryTrusted` (bypasses SQL validator) — the queries are built server-side with sanitised inputs, not user-supplied SQL
- `clickhouse_query` allows JOINs, UNIONs, CTEs, and any table — the only restrictions are read-only (SELECT/WITH), LIMIT required, no semicolons, no INTO
- `url_cosharing_pairs`, `url_cosharing_membership`, `quote_cosharing_pairs`, and `quote_cosharing_membership` have 7-day TTL — queries beyond that window return no results
- `url_cosharing_clusters` and `quote_cosharing_clusters` have no TTL — cluster-level data is retained indefinitely
- Ozone `ozoneRequest` helper automatically retries on ExpiredToken with session refresh — no manual retry needed in consuming code
- ClickHouse `osprey_execution_results` retains ~2 months of data — NOT the full account history. Thin ClickHouse results are a data gap, not evidence of inactivity. Skills must supplement with PDSX `list_records` when ClickHouse content is insufficient
