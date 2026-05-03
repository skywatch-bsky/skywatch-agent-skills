# Changelog

All notable changes to skywatch-skills plugins are documented here.

## skywatch-investigations 0.22.1 (pre-release)

**Fixed:**
- `working-the-queue`: reported content must be returned verbatim by subagents — never summarised, paraphrased, or excerpted
- `working-the-queue`: Phase 2 per-subject detail blocks now explicitly require character-for-character reproduction of reported content

## skywatch-investigations 0.22.0

**Changed:**
- Verified osprey schema against live ClickHouse
- Added missing data sources to investigation skills

## skywatch-investigations 0.21.0

- `conducting-investigations`: all ClickHouse queries across 6 phases now dispatched to Sonnet subagents instead of inline `clickhouse_query`
- `querying-ozone`: added delegation pattern section — reads to Sonnet, writes to Haiku
- `working-the-queue`: expanded subagent model table to include Ozone read queries and follow-up investigation

## skywatch-investigations 0.20.0

- `working-the-queue`: Phase 3 action execution (labelling, acknowledging, escalating) delegated to Haiku subagent
- `working-the-queue`: Phase 1 data collection subagents explicitly use Sonnet for speed
- `working-the-queue`: added model selection table documenting subagent model choices
- `working-the-queue`: primary triage agent can dispatch follow-up Sonnet subagents for additional investigation (ClickHouse queries, thread expansion, relationship checks, content similarity)
- `working-the-queue`: Phase 2 now shows reported content verbatim in per-subject detail blocks

## skywatch-investigations 0.19.0

- `working-the-queue`: added subject granularity rules — post-level subjects are not deduplicated; each reported AT-URI is reviewed individually
- `working-the-queue`: added `label_level` field (post/account) to classification schema
- `working-the-queue`: agent proactively recommends account-level labels when multiple posts or content context reveal systemic behaviour
- `working-the-queue`: added reply thread context requirements — replies must be evaluated against parent post, thread, account relationship, and reporter identity before classification
- `working-the-queue`: per-subject data collection delegated to subagents to preserve triage agent context window
- `working-the-queue`: subagents return a recommendation with supporting evidence, not just raw context

## skywatch-investigations 0.18.0

- Skill: `querying-ozone` for Ozone tool reference and query patterns
- Skill: `working-the-queue` for moderation queue triage methodology

## skywatch-investigations 0.17.0

- Skill: `assess-account` for structured account classification
- Skill: `search-incidents` for topic-based incident search with relevance scoring
- Skill: `triage-rule-hits` for rule hit TP/FP/novel classification
- Skill: `classify-cluster` for co-sharing cluster narrative analysis
- Added optional skill-loading to investigator agent (skills load on-demand by phase)
- Refactored MCP server installation from git submodule to `uvx` from git SSH
- Simplified ClickHouse client — dropped SSH mode, loosened SQL validation

## skywatch-investigations 0.16.1

- Added `durationInHours` parameter to `ozone_label` for expiring labels

## skywatch-investigations 0.16.0

- 9 new Ozone MCP tools: `ozone_query_statuses`, `ozone_query_events`, `ozone_comment`, `ozone_acknowledge`, `ozone_escalate`, `ozone_tag`, `ozone_mute`, `ozone_unmute`, `ozone_resolve_appeal`
- Extracted `ozoneRequest` fetch wrapper with token refresh retry
- Extracted `validateOzoneConfig`, `buildSubjectRef`, and `buildModTool` helpers
- Total MCP tools: 11 → 20

## skywatch-investigations 0.15.0

- Added URL co-sharing cluster tools: `cosharing_clusters`, `cosharing_pairs`, `cosharing_evolution`, `content_similarity`
- Added `account_entropy` and `url_overdispersion` sidecar support
- Replaced `externalUrl` with `batchId` for label grouping
- Added `cid` parameter to `ozone_label` for post-level labelling
- Added Tailscale direct connection support for ClickHouse

## skywatch-investigations 0.10.0

- Added `pds_signup_anomalies` table support
- Fixed Ozone auth: switched from Basic to ATP session tokens, routed through PDS
- Added `comment`, `modTool`, and `externalUrl` to ozone label events

## skywatch-investigations 0.9.0

- Switched MCP server runtime from Bun to `npx tsx`
- Bundled MCP server to eliminate runtime dependency installation
- Made SSH_USER optional (uses `~/.ssh/config` aliases)
- Fixed lazy-init ClickHouse client to prevent startup crash
- Added `OSPREY_RULES_PATH` and `OSPREY_REPO_PATH` env var support

## skywatch-investigations 0.2.0

Initial release of the skywatch-investigations plugin.

- MCP server with ClickHouse access (`clickhouse_query`, `clickhouse_schema`)
- Recon tools: `domain_check`, `ip_lookup`, `url_expand`, `whois_lookup`
- Moderation tool: `ozone_label`
- Skill: `accessing-osprey` with Osprey schema reference
- Skill: `querying-clickhouse` with 20 proven query patterns
- Skill: `conducting-investigations` with 6-phase investigation methodology
- Skill: `reporting-results` with B-I-N-D-Ts report templates
- Agent: `investigator` with data-analyst delegation
- Agent: `data-analyst` for ClickHouse query work
- SessionStart hook for MCP server dependency installation

## osprey-rules 0.3.0

- Added `OSPREY_RULES_PATH` and `OSPREY_REPO_PATH` env var support
- Rewrote CLAUDE.md for v2 orchestrator architecture

## osprey-rules 0.2.0

Rewritten as orchestrator-and-subagents architecture.

- Agent: `osprey-rule-writer` rewritten as thin subagent-dispatching orchestrator
- Agent: `osprey-rule-planner` for requirements gathering
- Agent: `osprey-rule-impl` for SML code writing
- Agent: `osprey-rule-reviewer` for three-layer verification gate
- Agent: `osprey-rule-debugger` for error fixing
- Skill: `planning-osprey-rules` (extracted from writing-osprey-rules)
- Skill: `authoring-osprey-rules` (extracted from writing-osprey-rules)
- Skill: `reviewing-osprey-rules` with three-layer verification methodology
- Skill: `fixing-osprey-rules` with error categories and fix patterns
- Added reviewer checklist to sml-conventions.md
- Deleted monolithic `writing-osprey-rules` and `debugging-osprey-rules` (replaced by split skills)
- Depends on `osprey-rule-investigator` for project state discovery

## osprey-rules 0.1.0

Initial release.

- Agent: `osprey-rule-writer` for routing all Osprey SML rule tasks
- Command: `/osprey-validate` for running `uv run osprey-cli push-rules --dry-run`
- Skill: `writing-osprey-rules` for full rule authoring workflow
- Skill: `osprey-sml-reference` for SML type system, 24 labelling patterns, naming conventions
- Skill: `debugging-osprey-rules` for error diagnosis and fix patterns

## osprey-rule-investigator 0.1.0

Initial release.

- Agent: `osprey-rule-investigator` for read-only SML project analysis
- Skill: `investigating-osprey-rules` with project structure, UDF discovery, and execution graph mapping
- Static UDF signatures reference as fallback when `osprey-for-atproto` unavailable
