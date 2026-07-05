---
name: querying-clickhouse
description: Query patterns, safety rules, and performance tips for ClickHouse investigation queries against osprey_execution_results. Use when writing or reviewing ClickHouse queries for investigations.
user-invocable: false
---

# Querying ClickHouse

This skill provides essential knowledge for writing safe, efficient queries against Osprey rule execution data. Use this when you need to investigate account behavior, analyze rule performance, or detect patterns.

## Safety Rules

The ClickHouse MCP server enforces strict safety constraints on all queries:

**SELECT Only**

All queries must be SELECT statements. No INSERT, UPDATE, DELETE, or DDL operations are permitted.

**LIMIT Required**

Every query must include a LIMIT clause. This prevents accidental runaway queries and caps result set sizes.

```sql
-- Good
SELECT ... FROM default.osprey_execution_results WHERE ... LIMIT 100

-- Bad (will be rejected)
SELECT ... FROM default.osprey_execution_results WHERE ...
```

**Read-Only Enforcement**

Queries must start with SELECT or WITH (for CTEs). JOINs, UNIONs, subqueries, and any table are allowed. Semicolons and INTO are blocked to prevent multi-statement execution and data export.

Key investigation tables:
- `default.osprey_execution_results` — Osprey rule execution history
- `default.pds_signup_anomalies` — PDS signup rate anomalies
- `default.url_overdispersion_results` — Coordinated domain/URL sharing anomalies
- `default.account_entropy_results` — Bot-like posting pattern detection
- `default.url_cosharing_pairs` — Daily account URL co-sharing pairs (TTL 7 days)
- `default.url_cosharing_clusters` — URL co-sharing cluster metrics and evolution (no TTL)
- `default.url_cosharing_membership` — Daily URL co-sharing cluster membership (TTL 7 days)
- `default.quote_cosharing_pairs` — Daily account quote co-sharing pairs (TTL 7 days)
- `default.quote_cosharing_clusters` — Quote co-sharing cluster metrics and evolution (no TTL)
- `default.quote_cosharing_membership` — Daily quote co-sharing cluster membership (TTL 7 days)
- `default.quote_overdispersion_results` — Coordinated quote-post anomalies

```sql
-- All valid
SELECT * FROM default.osprey_execution_results WHERE ... LIMIT 100
SELECT a.Handle, a.AltGovHandleRule, b.cluster_id
FROM default.osprey_execution_results a
  JOIN default.url_cosharing_membership b ON a.FollowSubjectDid = b.did
LIMIT 50
WITH flagged AS (SELECT user_id FROM default.account_entropy_results WHERE is_bot_like = 1)
  SELECT Handle, AccountAgeSeconds FROM default.osprey_execution_results
  WHERE FollowSubjectDid IN (SELECT user_id FROM flagged) LIMIT 100

-- Rejected
INSERT INTO ...
SELECT * FROM ... INTO OUTFILE ...
SELECT * FROM ... ; DROP TABLE ...
```

**60-Second Timeout**

Queries running longer than 60 seconds are automatically cancelled. This encourages efficient query design and prevents resource exhaustion.

**Constraint Enforcement**

These constraints are enforced at the MCP layer *before* queries reach ClickHouse, so policy violations are caught early.

## Schema Shape: Wide Event Table, Not Flat Columns

`osprey_execution_results` is a **wide event table**, not a flat `rule_name`/`did`/`handle`/`content`/`matched`/`score` table. Each row is one evaluated AT Protocol event (post, follow, profile update, etc.). There is no generic `did`, `handle`, `content`, `created_at`, `rule_name`, `matched`, or `score` column — those concepts are encoded as ~600+ individual dynamic columns, one per rule or model, added automatically as new rules deploy.

Only 6 system columns are present on every row (all prefixed `__`):

| Column | Type | Description |
|--------|------|-------------|
| `__action_id` | Int64 | Unique identifier for the evaluation event |
| `__timestamp` | DateTime64(3) | UTC timestamp of evaluation — the primary time column |
| `__error_count` | Nullable(Int32) | Errors during evaluation |
| `__atproto_label` | Array(String) | Labels applied as a result of this evaluation |
| `__entity_label_mutations` | Array(String) | Label changes applied to the entity |
| `__verdicts` | Array(String) | Verdict strings emitted by rules |

Everything else — account identity, post text, rule outcomes, follower counts — lives in dynamic PascalCase columns like `Handle`, `PostTextCleaned`, `AccountAgeSeconds`, `AltGovHandleRule`. See the `accessing-osprey` skill's `references/osprey-schema.md` for the full column reference, naming conventions, and type patterns. Use `clickhouse_schema` or `SELECT name, type FROM system.columns WHERE table = 'osprey_execution_results'` to get the live list — it grows continuously.

**Common columns used in this doc's query patterns:**

| Column | Type | Use Case |
|--------|------|----------|
| `__timestamp` | DateTime64(3) | Filter by date range (always include for performance) |
| `Handle` | Nullable(String) | Account handle |
| `PostTextCleaned` | Nullable(String) | Cleaned post text — use with `ngramDistance()` |
| `AccountAgeSeconds` | Nullable(Int64) | Account age at evaluation time |
| `ActionName` | Nullable(String) | Event type (`create_post`, `create_follow`, `update_profile`, etc.) |
| `<RuleName>Rule` | Nullable(UInt8) | 1 if that specific rule matched, else 0/NULL |

## Query Structure Best Practices

Follow this pattern for reliable, performant queries:

### 1. Filter by `__timestamp` First

ClickHouse tables are time-partitioned on `__timestamp`. Always include a `__timestamp` filter to dramatically improve performance.

```sql
SELECT __timestamp, Handle, AltGovHandleRule
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND __timestamp > now() - interval 7 day
LIMIT 100
```

Without time filtering, queries may scan the entire table and timeout.

### 2. Select Specific Columns

Avoid `SELECT *`. With 600+ dynamic columns, ClickHouse's columnar storage makes selecting only needed columns dramatically faster.

```sql
-- Good (fast)
SELECT Handle, AltGovHandleRule, __timestamp
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
LIMIT 100

-- Bad (very slow, 600+ columns)
SELECT *
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
LIMIT 100
```

### 3. Use LIMIT Generously

Start with conservative LIMIT values (10-100) for exploratory queries, and increase only if needed.

```sql
-- Safe for exploration
SELECT ...
LIMIT 50

-- For comprehensive analysis, still cap results
SELECT ...
LIMIT 10000
```

### 4. Query Specific Rule/Model Columns Directly

There is no `rule_name` column to filter on — each rule is its own column. Reference the rule or model column by name in the WHERE clause.

```sql
SELECT __timestamp, Handle, AccountAgeSeconds
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND __timestamp > now() - interval 1 day
LIMIT 100
```

## Performance Tips

### Content Search Is Expensive

The `ngramDistance()` function searches for similar text by n-gram comparison. It's powerful but slow, and only meaningful on `PostTextCleaned` (not every row has post text — filter out NULL/empty first). Note: ngramDistance() returns 0 for identical content and 1 for completely different content.

Always pair `ngramDistance()` with other filters:

```sql
-- Good: narrow context with time + null-check + ngramDistance
SELECT Handle, PostTextCleaned, __timestamp
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
  AND PostTextCleaned IS NOT NULL
  AND length(PostTextCleaned) > 0
  AND ngramDistance(PostTextCleaned, 'target phrase') < 0.5
ORDER BY ngramDistance(PostTextCleaned, 'target phrase') ASC
LIMIT 50

-- Bad: ngramDistance alone scans all rows including NULLs
SELECT ...
WHERE ngramDistance(PostTextCleaned, 'target phrase') < 0.5
LIMIT 100
```

### Aggregate Queries Are Fast

GROUP BY queries are typically faster than raw row selection, because aggregation reduces result set size.

```sql
-- Fast: aggregates reduce data volume
SELECT toDate(__timestamp) as day, countIf(AltGovHandleRule = 1) as hits
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
GROUP BY day
LIMIT 50

-- Slower: full row enumeration
SELECT __timestamp, AltGovHandleRule
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
LIMIT 1000
```

### Avoid Expensive Operations

- **String concatenation** in WHERE clauses
- **Function calls** on large datasets (e.g., `LOWER(PostTextCleaned)` for every row)
- **Subqueries** (use JOIN patterns instead if possible, though joins are limited to the same table)
- **`SELECT \*`** — with 600+ columns this is dramatically more expensive here than on a normal table

## Common Query Patterns Overview

Investigation queries typically fall into seven categories:

### Account Queries

Find all rule hits for a specific account, or identify accounts triggering specific rules.

See `references/common-queries.md` for patterns:
- All rule hits for a DID
- All rule hits for a handle
- Accounts triggering a rule in a time window
- Top offenders by rule hits

### Temporal Queries

Analyze rule hit volume and account activity over time. Useful for spike detection and trend analysis.

See `references/common-queries.md` for patterns:
- Rule hit volume bucketed by hour/day
- Account activity timeline
- Burst detection (high-frequency posting)

### Content Queries

Use n-gram distance to detect similar content (copypasta detection), find common patterns, and cluster content by similarity.

See `references/common-queries.md` for patterns:
- Content similarity search
- Most common content for a rule
- Content clustering

### Infrastructure Queries

Correlate accounts by shared infrastructure or timing: monitored PDS hosts, new-account rule triggers, cross-signal timing correlation.

See `references/common-queries.md` for patterns:
- Accounts on a monitored PDS host
- New account rule triggers by day
- Cross-signal correlation (same content + time)

### Rule Performance Queries

Analyze rule hit rates, false positive candidates, and coverage across the network.

See `references/common-queries.md` for patterns:
- Hit rate per rule
- False positive candidates
- Rule coverage analysis

### Account Entropy Queries

Query `account_entropy_results` to identify accounts with bot-like posting patterns based on Shannon entropy analysis.

See `references/common-queries.md` for patterns:
- Bot-like accounts (both flags)
- Soft screening (one flag)
- Cross-referencing with rule hits

### URL Overdispersion Queries

Query `url_overdispersion_results` to identify domains being shared in statistically anomalous patterns.

See `references/common-queries.md` for patterns:
- Anomalous domain sharing
- Domain sharing history/trends
- Cross-referencing bot accounts with anomalous domains

### URL Co-Sharing Queries

Query co-sharing data to identify coordinated URL sharing networks. Three tables available, with dedicated MCP tools for common patterns.

**Preferred approach:** Use the dedicated MCP tools (`cosharing_clusters`, `cosharing_pairs`, `cosharing_evolution`) which handle JOINs internally. Use `clickhouse_query` for ad-hoc queries or cross-table analysis.

See `references/common-queries.md` for patterns:
- Find clusters containing a DID (via tool)
- List today's largest clusters (via tool or direct query)
- Get co-sharing pairs for a DID (via tool)
- Track cluster evolution (via tool)
- Find clusters sharing a specific URL (direct query)

**Key considerations:**
- `url_cosharing_pairs` and `url_cosharing_membership` have 7-day TTL — queries beyond that return no results
- `url_cosharing_clusters` has no TTL — historical cluster data is retained indefinitely
- Pairs are stored with `account_a < account_b` — query both columns when looking up a DID
- Tight `temporal_spread_hours` + regular `mean_posting_interval_seconds` = strong coordination signal
- Low `unique_urls` / `member_count` ratio = likely coordinated content

### Quote Co-Sharing Queries

Query quote co-sharing data to identify coordinated quote-post networks. Same structure as URL co-sharing but tracks accounts that quote the same posts rather than share the same URLs. Three tables mirror the URL co-sharing schema.

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `quote_cosharing_pairs` | `date`, `account_a`, `account_b`, `weight`, `shared_uris` | TTL 7 days. `shared_uris` are AT-URIs of quoted posts |
| `quote_cosharing_clusters` | `run_date`, `cluster_id`, `member_count`, `unique_uris`, `evolution_type` | No TTL. `sample_uris` are AT-URIs |
| `quote_cosharing_membership` | `run_date`, `cluster_id`, `did` | TTL 7 days |

**Key differences from URL co-sharing:**
- Column names use `uris` not `urls` (e.g., `shared_uris`, `unique_uris`, `sample_uris`) — these are AT-URIs pointing to quoted posts, not web URLs
- Detects coordinated quote-post amplification (pile-ons, brigading, astroturfing via quotes)
- Cross-reference with `url_cosharing_*` tables to find accounts that coordinate across both sharing and quoting

```sql
-- Find accounts that appear in both URL and quote co-sharing on the same day
SELECT u.account_a, u.account_b, u.weight as url_weight, q.weight as quote_weight
FROM default.url_cosharing_pairs u
JOIN default.quote_cosharing_pairs q
  ON u.account_a = q.account_a AND u.account_b = q.account_b AND u.date = q.date
WHERE u.date = yesterday()
ORDER BY url_weight + quote_weight DESC
LIMIT 50
```

### Quote Overdispersion Queries

Query `quote_overdispersion_results` to identify posts being quoted at statistically anomalous rates — potential targets of coordinated quote-post campaigns.

| Column | Type | Description |
|--------|------|-------------|
| `run_timestamp` | DateTime64(3) | When the analysis ran |
| `granularity` | Enum ('hourly', 'daily') | Analysis time bucket |
| `quoted_uri` | String | AT-URI of the quoted post |
| `quoted_author_did` | String | DID of the post's author |
| `bucket_start` | DateTime64(3) | Start of the analysis window |
| `total_shares` | UInt64 | Total quote-posts of this URI |
| `unique_sharers` | UInt64 | Distinct accounts quoting |
| `sharer_density` | Float64 | Unique sharers / total shares |
| `volume_p_value` | Float64 | Statistical significance of volume spike |
| `density_p_value` | Float64 | Statistical significance of density spike |
| `is_anomaly` | UInt8 | 1 if statistically anomalous |
| `baseline_source` | Enum ('entity', 'population') | Whether baseline is per-author or global |
| `sample_dids` | Array(String) | Sample of accounts doing the quoting |

```sql
-- Find posts being anomalously quote-piled today
SELECT quoted_uri, quoted_author_did, total_shares, unique_sharers,
       volume_p_value, density_p_value, sample_dids
FROM default.quote_overdispersion_results
WHERE is_anomaly = 1
  AND bucket_start > now() - interval 1 day
ORDER BY total_shares DESC
LIMIT 50
```

## Column Quick Reference

Most-used columns for investigation queries. See `accessing-osprey` skill's `references/osprey-schema.md` for the complete listing — there are ~600+ dynamic columns and growing.

| Column | Type | Use Case |
|--------|------|----------|
| `__timestamp` | DateTime64(3) | Filter by date range (always include for performance) |
| `__action_id` | Int64 | Unique row identifier |
| `Handle` | Nullable(String) | Filter/select by account handle |
| `PostTextCleaned` | Nullable(String) | Text search with ngramDistance() |
| `ActionName` | Nullable(String) | Filter by event type (`create_post`, `create_follow`, `update_profile`, etc.) |
| `AccountAgeSeconds` | Nullable(Int64) | Filter/aggregate by account age |
| `FollowSubjectDid` | Nullable(String) | DID of follow target (follow events only) |
| `<RuleName>Rule` | Nullable(UInt8) | 1 if that specific rule matched, else 0/NULL |
| `<ModelName>` | Nullable(Float64 / Int64 / String) | Model output (score, count, or string value) |

## Output Interpretation

### Understanding Rule and Model Columns

There is no single `matched` or `score` column. Each rule/model gets its own column:

**Rule columns** (suffixed `Rule`, e.g. `AltGovHandleRule`):
- `1` means the rule fired for this row
- `0` or `NULL` means it didn't (NULL means the rule wasn't evaluated for this event)

**Model columns** (no `Rule` suffix, e.g. `ToxicityScoreUnwrapped`):
- Numeric columns are continuous scores or counts — compare across rows to gauge severity
- String columns carry model output values (DID, name, collection, etc.)
- Downstream rules typically threshold a model's output and expose their own boolean `...Rule` column

### Interpreting NULL Values

A NULL in a dynamic column almost always means "this rule/model was not evaluated for this event" — not missing or corrupted data. Since a row is one AT Protocol event (post, follow, profile update, etc.), only the rules/models relevant to that event type will be populated; everything else is NULL. This is expected and normal — filter explicitly (`IS NOT NULL`, `= 1`) rather than assuming absence indicates a problem.

## Next Steps

- Review `references/common-queries.md` for 30 proven query patterns
- Start with Account investigation queries to understand your targets
- Use Temporal queries to identify trends
- Use Content queries for copypasta and similarity detection
- Use Infrastructure queries for network analysis
- Use Rule Performance queries to optimize rule definitions
- Use Account Entropy queries to detect bot-like accounts
- Use URL Overdispersion queries to detect coordinated domain sharing campaigns
- Use Quote Co-Sharing queries to detect coordinated quote-post networks
- Use Quote Overdispersion queries to detect pile-on and brigading campaigns
