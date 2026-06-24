---
description: >-
  Query patterns, safety rules, and performance tips for ClickHouse investigation queries against osprey_execution_results. Use when writing or reviewing ClickHouse queries for investigations.
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
SELECT a.did, b.cluster_id FROM default.osprey_execution_results a
  JOIN default.url_cosharing_membership b ON a.did = b.did LIMIT 50
WITH flagged AS (SELECT did FROM default.account_entropy_results WHERE is_bot_like = 1)
  SELECT * FROM default.osprey_execution_results WHERE did IN (SELECT did FROM flagged) LIMIT 100

-- Rejected
INSERT INTO ...
SELECT * FROM ... INTO OUTFILE ...
SELECT * FROM ... ; DROP TABLE ...
```

**60-Second Timeout**

Queries running longer than 60 seconds are automatically cancelled. This encourages efficient query design and prevents resource exhaustion.

**Constraint Enforcement**

These constraints are enforced at the MCP layer *before* queries reach ClickHouse, so policy violations are caught early.

## Query Structure Best Practices

Follow this pattern for reliable, performant queries:

### 1. Filter by Time Range First

ClickHouse tables are time-partitioned. Always include a `created_at` filter to dramatically improve performance.

```sql
SELECT rule_name, count() as hits
FROM default.osprey_execution_results
WHERE created_at > now() - interval 7 day
GROUP BY rule_name
LIMIT 100
```

Without time filtering, queries may scan the entire table and timeout.

### 2. Select Specific Columns

Avoid `SELECT *`. ClickHouse is column-oriented, so selecting only needed columns significantly improves query speed.

```sql
-- Good (fast)
SELECT did, handle, rule_name, created_at
FROM default.osprey_execution_results
WHERE created_at > now() - interval 1 day
LIMIT 100

-- Bad (slow)
SELECT *
FROM default.osprey_execution_results
WHERE created_at > now() - interval 1 day
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

### 4. Filter Indexed Columns When Possible

The following columns are indexed and filter efficiently:
- `created_at` — Timestamp (most important)
- `did` — Account DID
- `handle` — Account handle
- `rule_name` — Rule name

Use these in WHERE clauses whenever possible.

```sql
SELECT did, handle, rule_name, score, created_at FROM default.osprey_execution_results
WHERE rule_name = 'spam-bot-pattern'
  AND created_at > now() - interval 1 day
LIMIT 100
```

## Performance Tips

### Content Search Is Expensive

The `ngramDistance()` function searches for similar text by n-gram comparison. It's powerful but slow. Note: ngramDistance() returns 0 for identical content and 1 for completely different content.

Always pair `ngramDistance()` with other filters:

```sql
-- Good: narrow context with time + ngramDistance
SELECT did, handle, content
FROM default.osprey_execution_results
WHERE created_at > now() - interval 1 day
  AND ngramDistance(content, 'target phrase') < 0.5
ORDER BY ngramDistance(content, 'target phrase') ASC
LIMIT 50

-- Bad: ngramDistance alone scans all content
SELECT ...
WHERE ngramDistance(content, 'target phrase') < 0.5
LIMIT 100
```

### Aggregate Queries Are Fast

GROUP BY queries are typically faster than raw row selection, because aggregation reduces result set size.

```sql
-- Fast: aggregates reduce data volume
SELECT rule_name, count() as hits, avg(score) as avg_score
FROM default.osprey_execution_results
WHERE created_at > now() - interval 7 day
GROUP BY rule_name
LIMIT 50

-- Slower: full row enumeration
SELECT rule_name, score
FROM default.osprey_execution_results
WHERE created_at > now() - interval 7 day
LIMIT 1000
```

### Avoid Expensive Operations

- **String concatenation** in WHERE clauses
- **Function calls** on large datasets (e.g., `LOWER(content)` for every row)
- **Subqueries** (use JOIN patterns instead if possible, though joins are limited to the same table)

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

Correlate accounts by shared infrastructure: PDS host, account creation time, etc.

See `references/common-queries.md` for patterns:
- Accounts sharing a PDS host
- Accounts created in the same time window
- Cross-signal correlation

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

**Preferred approach:** Use the dedicated MCP tools (`mcp__skywatch-mcp__cosharing_clusters`, `mcp__skywatch-mcp__cosharing_pairs`, `mcp__skywatch-mcp__cosharing_evolution`) which handle JOINs internally. Use `mcp__skywatch-mcp__clickhouse_query` for ad-hoc queries or cross-table analysis.

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

Most-used columns for investigation queries. See `accessing-osprey` skill's schema reference for the complete listing.

| Column | Type | Use Case |
|--------|------|----------|
| `created_at` | DateTime | Filter by date range (always include for performance) |
| `did` | String | Filter by account DID |
| `handle` | String | Filter by account handle |
| `rule_name` | String | Filter by rule name |
| `matched` | Boolean | Filter for actual matches (true) or non-matches (false) |
| `score` | Float | Aggregate (avg, max) to analyze rule sensitivity |
| `content` | String | Text search with ngramDistance() |
| `content_hash` | String | Deduplication and content matching |
| `pds_host` | String | Infrastructure correlation |
| `account_age_days` | Int32 | Filter by account age |
| `follower_count` | Int64 | Identify established vs. new accounts |
| `post_count` | Int64 | Identify prolific accounts |
| `event_type` | String | Filter by content type (post, profile, etc.) |
| `rule_category` | String | Filter by rule category (spam, abuse, policy, etc.) |

## Output Interpretation

### Understanding Matched vs. Score

Rules can output either a boolean (matched: true/false) or a numeric score (0-1 or rule-specific range).

**Boolean-output rules:**
- `matched = true` means the rule fired
- `matched = false` means it didn't
- `score` will be 0 or 1

**Numeric-output rules:**
- `score` is a continuous value
- `matched = true` if score exceeded the rule's threshold
- `matched = false` if score was below threshold
- Compare scores across accounts to identify degrees of severity

### Confidence Scores

The `confidence` column (0-1) indicates how sure the rule is. High confidence (>0.8) is more reliable.

### Interpreting NULL Values

NULL values in columns like `follower_count` or `post_count` indicate data was unavailable at evaluation time (account deleted, suspended, etc.).

## Next Steps

- Review `references/common-queries.md` for 25 proven query patterns
- Start with Account investigation queries to understand your targets
- Use Temporal queries to identify trends
- Use Content queries for copypasta and similarity detection
- Use Infrastructure queries for network analysis
- Use Rule Performance queries to optimize rule definitions
- Use Account Entropy queries to detect bot-like accounts
- Use URL Overdispersion queries to detect coordinated domain sharing campaigns
- Use Quote Co-Sharing queries to detect coordinated quote-post networks
- Use Quote Overdispersion queries to detect pile-on and brigading campaigns
