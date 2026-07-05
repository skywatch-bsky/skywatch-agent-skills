---
name: skywatch-scanning-the-network
description: Proactive network-wide threat scanning over a specified time window. Use when looking for emerging threats, incident upticks, anomalous network traffic, coordination patterns, or detection gaps.
polytoken:
  tags: [skywatch]
---

# Scanning the Network

## Purpose

Use this skill to scan Skywatch/Osprey data for emerging threats across the network during a user-specified time window. The coordinator launches three parallel investigations, synthesizes their reports, and presents a consolidated BLIND-style report. The scan is exploratory and read-only until the user explicitly approves follow-up action.

## Input

Require these inputs before scanning:

- **Time range**: explicit start/end, `past 24 hours`, `past 7 days`, or `since YYYY-MM-DD`. If the user did not provide a time range, ask for one before dispatching subagents. Do not silently choose a broad default.
- **Granularity**: hour or day. If omitted, use hourly buckets for windows of 72 hours or less and daily buckets for longer windows.
- **Scope modifiers**: optional language, region, topic, known incident, PDS host, account set, label, rule family, domain, URL, or quote-target filters.
- **Baseline comparator**: optional previous period. If omitted, compare against the immediately preceding equal-length period when available and label it as an inferred comparator.

Before dispatching subagents, restate the scan contract:

```text
Time range: [start/end or relative]
Granularity: [hour/day]
Comparator: [explicit or inferred]
Scope modifiers: [none or list]
```

## Safety and Consent Gates

- ClickHouse work is read-only. Dispatch ClickHouse query work to `data-analyst` subagents. If `data-analyst` is unavailable in the active Skywatch runtime, use the nearest available Skywatch data-analysis subagent or ask the operator for an alternative.
- Load `skywatch-querying-clickhouse` for ClickHouse execution details when writing or reviewing query prompts.
- ClickHouse queries must start with `SELECT` or `WITH`, include time filters, include `LIMIT`, avoid `SELECT *`, and avoid multi-statement chains, `INTO OUTFILE`, DDL, `INSERT`, `UPDATE`, and `DELETE`.
- Query `default.osprey_execution_results` with universal columns first. Discover live dynamic columns before referring to identity, text, model, or rule columns. Do not invent fields such as generic `did`, `content`, `rule_name`, or `matched`.
- The coordinator may use read-only MCP tools for co-sharing, content similarity, URL/domain reconnaissance, and other investigation support.
- Do not create, edit, deploy, disable, or tune Osprey rules without explicit user consent.
- Do not apply labels, remove labels, acknowledge queue items, mute, unmute, escalate, resolve appeals, add Ozone comments, or perform other moderation side effects without explicit user consent.
- Rule ideas and moderation recommendations are proposals only. The user decides whether any action is needed.

## Coordinator Workflow

1. Confirm the input contract is complete. If the time range is missing or ambiguous, ask the user before continuing.
2. Dispatch exactly three investigative reports in parallel over the same time range, granularity, comparator, and scope modifiers:
   - Subagent 1: Baseline Network Traffic Scan
   - Subagent 2: Rule Hit and Incident Uptick Scan
   - Subagent 3: Co-sharing and Entropy Scan
3. Give each subagent the same scan contract and the safety constraints above.
4. When reports return, synthesize them. Do not concatenate them.
5. Produce the consolidated BLIND-style emerging-threat report and recommendations.
6. If recommendations include rule or moderation actions, explicitly mark them as requiring user approval before implementation.

Completion criterion: the user receives one consolidated report that distinguishes likely emerging threats, watchlist signals, and no-clear-threat findings, with evidence and caveats from all three reports.

## Subagent 1: Baseline Network Traffic Scan

Purpose: inspect all network traffic during the scan period, regardless of whether an Osprey rule triggered.

Dispatch to `data-analyst` with this report contract:

```text
Run a baseline all-traffic scan for [scan contract]. Use ClickHouse read-only SELECT/WITH queries only. Start with universal columns in default.osprey_execution_results, discover live dynamic columns through system.columns, and only then use identity, text, URL, or model fields that exist. Include time filters and LIMITs on every query. Avoid SELECT *.

Report required sections:
1. Findings: total event volume by time bucket; unique accounts by time bucket when UserId or an equivalent identity column exists; top active accounts/handles when identity columns exist; top repeated text/content patterns when text columns exist; top domains/URLs when URL-bearing columns exist or can be safely extracted.
2. Notable anomalies: new or unusual volume spikes compared with the comparator period; unusual concentrations by account, handle, host, domain, URL, text pattern, language, or topic when supported by discovered fields.
3. Copypasta and similarity: use mcp__skywatch-mcp__content_similarity where appropriate to detect template reuse, highly similar posts, or repeated phrasing across the network.
4. Signup anomalies: check default.pds_signup_anomalies for unusual signup volume at PDS hosts overlapping the scan period, especially if traffic spikes concentrate on a host.
5. Spike table: bucket, total events, unique accounts if available, comparator value, percent/absolute change, suspected driver.
6. Sample evidence: capped representative rows with timestamps and DIDs/handles/AT-URIs/URLs when available.
7. Query families or exact queries used.
8. Confidence and caveats: missing dynamic columns, sparse content columns, retention limitations, sampling limits, and any field assumptions.
```

The subagent should prefer aggregation-first queries, then small capped samples for evidence.

## Subagent 2: Rule Hit and Incident Uptick Scan

Purpose: examine rules triggered during the same period to determine whether any incident type is increasing.

Dispatch to `data-analyst` with this report contract:

```text
Run a rule-hit and incident-uptick scan for [scan contract]. Use ClickHouse read-only SELECT/WITH queries only. Discover current rule outcome columns in default.osprey_execution_results before aggregating. Include time filters and LIMITs on every query. Avoid SELECT *.

Report required sections:
1. Uptick summary: rule hit counts by rule and time bucket; fastest-growing rules; newly active rules; rules with unusual concentration.
2. Normalized trends: hit rate by rule normalized by total events per bucket; comparison with the comparator period; unique accounts per rule when UserId or an equivalent identity column exists.
3. Error/verdict signals: unusual counts or changes involving __error_count, __verdicts, __atproto_label, or __entity_label_mutations where relevant.
4. Incident interpretation: suspected incident categories based on rule names and sampled matched content. Clearly mark categories as inferred when no explicit category field exists.
5. Samples: capped examples of matched content with timestamps, rule columns, DIDs/handles/AT-URIs/URLs when available.
6. Detection gaps: note traffic spikes or suspicious patterns from the baseline scan that have weak or no corresponding rule hits, if available.
7. Query families or exact queries used.
8. Confidence and caveats: dynamic-rule-column assumptions, sparse rule columns, false-positive risks, and coverage limits.
```

The subagent should not assume a generic rule-hit table; `default.osprey_execution_results` is a wide event table with rule outcomes as dynamic columns.

## Subagent 3: Co-sharing and Entropy Scan

Purpose: inspect coordinated behavior and automation signals during the scan period.

Dispatch to `data-analyst` or the nearest Skywatch data-analysis subagent, using ClickHouse sidecar tables and read-only Skywatch MCP tools where useful:

```text
Run a co-sharing and entropy scan for [scan contract]. Use ClickHouse read-only SELECT/WITH queries only. Include date/time filters and LIMITs on every query. Use read-only Skywatch MCP tools for cluster or DID drill-down when they improve evidence quality.

Report required sections:
1. Entropy summary: query default.account_entropy_results for windows overlapping the scan period. Return bot-like accounts, hourly_flag, interval_flag, post_count, high-volume accounts, and sample_rkeys when available.
2. URL co-sharing: summarize default.url_cosharing_clusters for the scan period, including cluster births, continuations, merges, splits, member_count, total_edges, total_weight, unique_urls, temporal_spread_hours, mean_posting_interval_seconds, sample_dids, sample_urls, and predecessor links.
3. URL pair/member detail: use default.url_cosharing_pairs and default.url_cosharing_membership only when the scan period is within their 7-day TTL. State when TTL makes these unavailable.
4. Quote co-sharing: summarize default.quote_cosharing_clusters, and use default.quote_cosharing_pairs and default.quote_cosharing_membership with the same 7-day TTL caveat.
5. Overdispersion links: use default.url_overdispersion_results and default.quote_overdispersion_results where they connect cluster activity to anomalous domain, URL, or quote amplification.
6. MCP drill-down: when cluster IDs or DIDs warrant detail, use read-only tools such as mcp__skywatch-mcp__cosharing_clusters, mcp__skywatch-mcp__cosharing_pairs, and mcp__skywatch-mcp__cosharing_evolution.
7. Overlap analysis: identify accounts or clusters that overlap with entropy flags, rule upticks, traffic spikes, domains, URLs, or quote targets from the other reports when available.
8. Top suspicious clusters/accounts: include sample URLs/URIs, DIDs, cluster IDs, temporal spread, diversity metrics, and why the signal is suspicious.
9. Query families or exact queries used: the sidecar tables queried and the MCP tools invoked, with enough detail to reproduce.
10. Confidence and caveats: TTL limits, organic coordination alternatives, breaking-news effects, timezone effects, and sample limitations.
```

Coordination is not automatically inauthentic. If a cluster needs deeper narrative classification, use `skywatch-classify-cluster` after the network scan identifies it as a follow-up target.

## Consolidation

After all three reports return, synthesize cross-signal evidence:

- Align findings to the same time buckets and comparator period.
- Identify overlaps: traffic spike plus rule uptick; traffic spike plus new co-sharing cluster; rule uptick plus entropy-flagged accounts; cluster birth plus PDS signup anomaly; content similarity plus rule concentration.
- Separate high-confidence threats from weak signals, seasonal or daily cycles, breaking-news spikes, benign community activity, and ordinary organic coordination.
- Classify each major finding into one of three classes:
  1. **Emerging threat likely** — multiple independent signals agree and benign explanations are weaker.
  2. **Watchlist / monitor** — one strong signal or several weak signals need more observation.
  3. **No clear emerging threat** — no meaningful anomaly, or observed anomalies are explained by benign context.
- Call out detection gaps where network traffic, content similarity, entropy, or co-sharing anomalies do not map to existing rule hits.
- Recommend next actions but leave the decision to the user.

Do not overstate confidence if one subagent failed, a table returned no rows, or the scan period exceeds retention/TTL limits.

## Output: Consolidated Emerging-Threat Report

Use this BLIND-style shape. Load `skywatch-reporting-results` when producing a formal report or when the user asks for fuller report conventions.

```markdown
## Network Scan: [time range]

### BL — Bottom Line
[Single sentence: whether emerging threats were detected and the strongest evidence.]

### I — Impact
| Metric | Value |
|--------|-------|
| Data range | ... |
| Comparator | ... |
| Granularity | ... |
| Total events analysed | ... |
| Unique accounts observed | ... |
| Rule hits | ... |
| Suspicious clusters | ... |
| Entropy-flagged accounts | ... |
| Risk level | low/medium/high |

### N — Next Steps
- [ ] [Human decision/action]
- [ ] [Follow-up investigation]
- [ ] [Rule proposal, if any — requires explicit user consent before implementation]

### D — Details
#### Cross-Signal Findings
#### Baseline Network Traffic Findings
#### Rule Hit / Incident Uptick Findings
#### Co-sharing and Entropy Findings
#### Detection Gaps and Rule Ideas
#### Caveats and Data Coverage
#### Timestamps
```

Details must include the time range, comparator, subagent summaries, key query families or exact SQL snippets returned by subagents, sample DIDs/handles/AT-URIs/URLs where appropriate, confidence, and caveats.

## Rule Recommendation Discipline

Rule ideas are proposals, not implementation. Each rule idea should include:

- threat pattern
- evidence from the scan
- proposed signal
- candidate data fields or sidecar tables
- expected precision and recall risks
- sample positives
- likely false positives
- recommended validation query
- whether it addresses a detection gap, an incident uptick, or a coordination/entropy signal

Ask the user before creating, editing, testing against production-like data, deploying, disabling, or tuning any Osprey rule. If the user approves rule work, load the appropriate follow-up skill instead of embedding rule-authoring instructions here:

- `skywatch-planning-osprey-rules`
- `skywatch-authoring-osprey-rules`
- `skywatch-fixing-osprey-rules`
- `skywatch-reviewing-osprey-rules`

## Failure and Low-Data Handling

- **Missing time range**: ask the user. Do not choose a large default silently.
- **ClickHouse access failure**: report the failure plainly. Stop or offer a reduced MCP-only scan only if it can still answer part of the user's question meaningfully.
- **Missing dynamic columns**: fall back to universal columns and schema-discovery results. Do not invent fields or silently substitute unrelated columns.
- **Co-sharing TTL exceeded**: state that pair/member detail is unavailable beyond the 7-day TTL and rely on cluster tables where possible.
- **Empty results**: distinguish “no rows returned” from “no threat exists.” Empty data lowers confidence; it does not prove safety.
- **Subagent failure**: retry once if the failure appears transient. If it still fails, include the missing report as a caveat and lower confidence.
- **Conflicting reports**: present the conflict directly and explain which evidence is stronger, instead of forcing a single conclusion.
- **High-cost scan risk**: reduce scope by narrowing time range, using aggregation-first queries, lowering sample limits, or asking the user to choose a narrower scope.
