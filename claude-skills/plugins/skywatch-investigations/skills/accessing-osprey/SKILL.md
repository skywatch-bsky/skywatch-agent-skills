---
name: accessing-osprey
description: Understanding the Osprey moderation infrastructure — system architecture, ClickHouse data access, schema reference, and relationship to Ozone labelling. Use when investigating AT Protocol accounts or reviewing rule execution data.
user-invocable: false
---

# Accessing Osprey

This skill provides foundational knowledge for accessing, understanding, and querying Osprey rule execution data in ClickHouse. Use this when you need to investigate rule matches, account behavior, or rule performance.

## What Is Osprey

Osprey is a moderation rule engine for the AT Protocol (Bluesky). It runs continuously, evaluates user-defined rules against the global firehose of posts and other events, and records the results in a ClickHouse table called `osprey_execution_results`.

Rules in Osprey are written in SML (a Python-like domain-specific language). Each rule is a predicate that returns true/false or a numeric score indicating whether a piece of content or an account matches the rule criteria.

Key point: Osprey **detects**. It does not label or enforce policy directly. Its output informs human moderators and automated systems (like Ozone) about which accounts or posts match which rules.

## System Topology

```
AT Protocol Firehose
    ↓
Osprey Rule Engine (runs continuously)
    ├─ Reads: All posts, profiles, follows, other events
    ├─ Applies: User-defined rules (SML)
    ├─ Records: Execution results in ClickHouse
    └─ Outputs: osprey_execution_results table
        ↓
    ┌───────────────────────────────────┐
    │ Statistical Sidecars              │
    │ (read osprey_execution_results,   │
    │  write to their own tables)       │
    ├─ account_entropy → account_entropy_results
    ├─ url_overdispersion → url_overdispersion_results
    ├─ url_cosharing → url_cosharing_pairs, _clusters, _membership
    ├─ quote_overdispersion → quote_overdispersion_results
    ├─ quote_cosharing → quote_cosharing_pairs, _clusters, _membership
    └─ signup_anomaly → pds_signup_anomalies
        ↓
Investigation / Analysis / Labelling Decisions
```

## Statistical Sidecars

Six sidecar services run alongside Osprey, reading from `osprey_execution_results` and producing scored output in their own ClickHouse tables. They flag — they don't label or take action. Their output feeds into investigations as starting points.

### Account Entropy Sidecar

**Table:** `account_entropy_results`
**Purpose:** Detect automated/bot-like posting patterns using temporal distribution analysis.

Computes Shannon entropy over two dimensions:
- **Hourly entropy** — how uniformly an account posts across 24 hours. High entropy (≥ 3.9) = posts around the clock = bot signature.
- **Inter-post interval entropy** — how regular the gaps between posts are. Low entropy (≤ 1.5) = mechanical spacing = bot signature.

The `is_bot_like` flag fires only when BOTH signals independently cross their thresholds (conjunction logic). This substantially reduces false positives — a shift worker or insomniac trips hourly entropy alone, a live-tweeter trips interval entropy alone, but only automation trips both.

Key columns: `user_id` (DID), `hourly_entropy`, `interval_entropy`, `is_bot_like`, `hourly_flag`, `interval_flag`, `mean_interval_seconds`, `stddev_interval_seconds`, `sample_rkeys`.

Runs every hour, analyses 7-day windows, requires ≥ 10 posts.

### URL Overdispersion Sidecar

**Table:** `url_overdispersion_results`
**Purpose:** Detect coordinated domain sharing campaigns using statistical anomaly detection.

Computes two independent signals per domain per time bucket:
- **Volume anomaly** (Poisson model) — is the observed share count statistically unlikely given the domain's baseline rate?
- **Sharer density anomaly** (normal approximation) — is the ratio of unique sharers to total shares unusually high? (Many accounts each sharing once = coordination.)

Either signal alone can flag a domain as anomalous (`is_anomaly = 1`). Uses entity baselines (domain's own history over 14 days) when available, falling back to population median for new/rare domains. Produces results at both hourly and daily granularity.

Key columns: `domain`, `granularity`, `total_shares`, `unique_sharers`, `sharer_density`, `volume_p_value`, `density_p_value`, `is_anomaly`, `baseline_source`, `sample_dids`, `sample_urls`, `on_watchlist`.

Runs every 15 minutes, requires ≥ 3 unique sharers.

### URL Co-Sharing Sidecar

**Tables:** `url_cosharing_pairs`, `url_cosharing_clusters`, `url_cosharing_membership`
**Purpose:** Detect coordinated inauthentic behaviour by finding clusters of accounts that repeatedly share the same URLs on the same day.

Builds a weighted graph (nodes = accounts, edge weight = number of co-shared URLs), runs Leiden community detection, and tracks how clusters evolve day-to-day. Three outputs:

- **Pairs** (`url_cosharing_pairs`) — daily account pairs with co-shared URLs. TTL 7 days.
- **Clusters** (`url_cosharing_clusters`) — cluster-level metrics, evolution classification, sample members/URLs. No TTL.
- **Membership** (`url_cosharing_membership`) — daily membership snapshots. TTL 7 days.

Key columns: `cluster_id` (stable ID), `member_count`, `evolution_type` (birth/death/continuation/merge/split), `temporal_spread_hours`, `mean_posting_interval_seconds`, `sample_dids`, `sample_urls`.

Runs daily. Minimum 3 accounts per cluster, minimum 2 co-shares per edge, minimum 3 accounts sharing a URL before it qualifies.

**Dedicated MCP tools:** Use `cosharing_clusters`, `cosharing_pairs`, `cosharing_evolution` for structured access (these support JOINs across the three tables internally). Use `clickhouse_query` for ad-hoc queries.

### Quote Co-Sharing Sidecar

**Tables:** `quote_cosharing_pairs`, `quote_cosharing_clusters`, `quote_cosharing_membership`
**Purpose:** Detect coordinated quote-post amplification by finding clusters of accounts that repeatedly quote the same posts on the same day.

Same architecture as URL co-sharing but tracks quote-posts instead of URL shares. Builds a weighted graph where edge weight = number of co-quoted AT-URIs, runs Leiden community detection, and tracks cluster evolution.

- **Pairs** (`quote_cosharing_pairs`) — daily account pairs with co-quoted posts. Uses `shared_uris` (AT-URIs). TTL 7 days.
- **Clusters** (`quote_cosharing_clusters`) — cluster-level metrics. Uses `unique_uris` and `sample_uris` (AT-URIs). No TTL.
- **Membership** (`quote_cosharing_membership`) — daily membership snapshots. TTL 7 days.

Detects pile-ons, brigading, and astroturfing via coordinated quoting. Cross-reference with `url_cosharing_*` to find accounts coordinating across both sharing and quoting.

### Quote Overdispersion Sidecar

**Table:** `quote_overdispersion_results`
**Purpose:** Detect posts being quoted at statistically anomalous rates — potential targets of coordinated quote-post campaigns.

Same statistical approach as URL overdispersion but applied to quote-posts. Tracks by `quoted_uri` (AT-URI) and `quoted_author_did`. Produces both hourly and daily results.

Key columns: `quoted_uri`, `quoted_author_did`, `granularity`, `total_shares`, `unique_sharers`, `sharer_density`, `volume_p_value`, `density_p_value`, `is_anomaly`, `baseline_source`, `sample_dids`.

### PDS Signup Anomaly Sidecar

**Table:** `pds_signup_anomalies`
**Purpose:** Detect unusual PDS signup patterns by host using Poisson models.

Monitors signup rates per PDS host at daily and hourly granularity. Flags when observed signup count is statistically unlikely given the baseline rate. Excludes known high-volume hosts (bsky.network, bridgy-fed, mostr.pub).

Key columns: `pds_host`, `granularity`, `observed_count`, `distinct_accounts`, `expected_lambda`, `p_value`, `is_anomaly`, `baseline_source`, `dispersion_index`, `rolling_mean`, `rolling_variance`, `sample_dids`.

### How It Works

1. **Event Stream**: The AT Protocol firehose emits events (new posts, profile updates, follows, etc.)
2. **Rule Evaluation**: Osprey evaluates all rules and models against each event
3. **Result Recording**: Osprey writes a row to `osprey_execution_results` with system columns (`__action_id`, `__timestamp`, etc.) and populates each rule/model's column with its result (1/0 for rules, scores for models, strings for extractors). Columns for rules that didn't evaluate remain NULL.
4. **Data Availability**: Investigators and moderators query ClickHouse to understand which accounts are triggering which rules

## ClickHouse Data Access

### Connection

The MCP server connects directly to a ClickHouse server. Requires:
- Host and port of the ClickHouse server
- Username and password
- Network access to the server

### Queryable Tables

| Table | Source | Purpose |
|-------|--------|---------|
| `default.osprey_execution_results` | Osprey rule engine | Rule execution history |
| `default.pds_signup_anomalies` | Signup anomaly sidecar | PDS signup rate anomalies |
| `default.url_overdispersion_results` | URL overdispersion sidecar | Coordinated domain sharing anomalies |
| `default.account_entropy_results` | Account entropy sidecar | Bot-like posting pattern detection |
| `default.url_cosharing_pairs` | URL co-sharing sidecar | Daily URL co-sharing pairs (TTL 7 days) |
| `default.url_cosharing_clusters` | URL co-sharing sidecar | URL cluster metrics and evolution (no TTL) |
| `default.url_cosharing_membership` | URL co-sharing sidecar | Daily URL cluster membership (TTL 7 days) |
| `default.quote_cosharing_pairs` | Quote co-sharing sidecar | Daily quote co-sharing pairs (TTL 7 days) |
| `default.quote_cosharing_clusters` | Quote co-sharing sidecar | Quote cluster metrics and evolution (no TTL) |
| `default.quote_cosharing_membership` | Quote co-sharing sidecar | Daily quote cluster membership (TTL 7 days) |
| `default.quote_overdispersion_results` | Quote overdispersion sidecar | Coordinated quote-post anomalies |

All tables are read-only. The MCP server enforces:
- **SELECT/WITH only** — No INSERT, UPDATE, DELETE, DDL
- **LIMIT required** — All queries must have a LIMIT clause
- **No semicolons** — Multi-statement execution not allowed
- **No INTO** — Data export not allowed
- **Timeout** — Queries that run longer than 60 seconds are cancelled

JOINs, UNIONs, CTEs, subqueries, and any table are allowed. These constraints are enforced at the MCP layer before queries reach ClickHouse.

### Query Tool

Use the `clickhouse_schema` MCP tool to get column metadata:

```
Tool: clickhouse_schema
Purpose: Return column names and types for osprey_execution_results
```

Use the `clickhouse_query` MCP tool to execute SELECT queries:

```
Tool: clickhouse_query
Parameters:
  query: SELECT ... FROM default.osprey_execution_results WHERE ... LIMIT ...
Purpose: Execute read-only queries, return results as JSON
```

## Relationship to Ozone

Ozone is the labelling system for the AT Protocol. It allows moderators to apply labels to accounts, posts, and other objects.

**Osprey → Ozone flow:**

1. Osprey rule detects problematic content (rule matches)
2. Investigator reviews Osprey data via ClickHouse queries
3. Investigator uses the `ozone_label` MCP tool to apply a label
4. Ozone records the label, which may affect visibility/filtering of that content

Osprey data informs labelling decisions, but the two are separate systems:
- Osprey is **automated** detection
- Ozone is **manual** labelling (though it can be automated via orchestration)

## Relationship to osprey-rules Plugin

The `osprey-rules` plugin is for **writing** rules (authoring SML).

This skill is for **accessing** and **querying** rule execution data (understanding results).

If you need to:
- Write a new rule → Use `osprey-rules` plugin and `authoring-osprey-rules` skill
- Review/debug a rule → Use `osprey-rules` plugin and `reviewing-osprey-rules` skill
- Query rule results → Use this skill and `querying-clickhouse` skill

## Schema Reference

For the complete column listing, column types, and semantic descriptions, see:

**`references/osprey-schema.md`** — Full schema documentation

System columns (present on every row):
- `__action_id` — Unique evaluation event identifier (Int64)
- `__timestamp` — When the evaluation occurred, UTC (DateTime64(3))
- `__error_count` — Errors during evaluation (Nullable(Int32))
- `__atproto_label` — Labels applied (Array(String))
- `__entity_label_mutations` — Label changes applied (Array(String))
- `__verdicts` — Verdict strings emitted by rules (Array(String))

Common dynamic columns (PascalCase, all Nullable):
- `ActionName` — AT Protocol action type (e.g., `create_post`, `create_follow`)
- `AccountAgeSeconds` — Account age in seconds at evaluation time
- `DisplayName` — Account display name
- `PostHasExternal` — Whether post contains an external link
- Rule columns (e.g., `AltGovHandleRule`) — UInt8, 1 = matched
- Score columns (e.g., `ToxicityScoreUnwrapped`) — Float64

## Common Investigation Patterns

Investigation queries usually follow these patterns:

**Find accounts matching a specific rule:**
```sql
SELECT __action_id, __timestamp, DisplayName, AccountAgeSeconds
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND __timestamp > now() - INTERVAL 7 DAY
LIMIT 100
```

**Count rule hits over time:**
```sql
SELECT
    toDate(__timestamp) AS day,
    countIf(AltGovHandleRule = 1) AS alt_gov_hits,
    countIf(DigestRepostBotRule = 1) AS digest_bot_hits
FROM default.osprey_execution_results
WHERE __timestamp > now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
LIMIT 30
```

**Check multiple rules for recent activity:**
```sql
SELECT __timestamp, AltGovHandleRule, SuicidalContentRule, DigestRepostBotRule
FROM default.osprey_execution_results
WHERE ActionName = 'create_post'
  AND __timestamp > now() - INTERVAL 1 DAY
LIMIT 100
```

For proven query patterns, see the `querying-clickhouse` skill.

## Performance Tips

1. **Always filter on `__timestamp`** — this is the partitioning key and critical for performance
2. **Use LIMIT** — results can be large; always limit rows
3. **Select specific columns** — with 600+ columns, `SELECT *` is extremely expensive. ClickHouse is column-oriented, so fewer columns = faster queries
4. **Dynamic columns are sparse** — most rule columns are NULL for any given row; only select the rules you care about
5. **No `rule_name` column** — each rule is its own column. Query specific rules by column name, not by filtering a generic field

## Next Steps

- Read `references/osprey-schema.md` to understand all available columns
- Load the `querying-clickhouse` skill to learn 15+ proven query patterns
- Use the `clickhouse_query` MCP tool to execute exploratory queries
