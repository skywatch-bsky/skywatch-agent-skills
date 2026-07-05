---
name: skywatch-querying-clickhouse
description: Query patterns, safety rules, and performance tips for ClickHouse investigation queries against osprey_execution_results. Use when writing or reviewing ClickHouse queries for investigations.
polytoken:
  tags: [skywatch]
---

# Querying ClickHouse

This skill provides essential knowledge for writing safe, efficient queries against Osprey rule execution data. Use this when you need to investigate account behavior, analyze rule performance, or detect patterns.

## Connection & Query Execution

ClickHouse is accessed via SSH + Docker. The agent SSHes into the remote server, then uses `sudo docker exec` to run `clickhouse-client` inside the ClickHouse container. Connection details are stored in `.envrc` in the project root and loaded with `direnv exec .`; do not print secret values.

### Executing a Query

Use `shell_exec` with `direnv exec .` to run queries with the project environment:

```bash
ssh "$CLICKHOUSE_SSH_USER@$CLICKHOUSE_SSH_HOST" \
  "sudo docker exec $CLICKHOUSE_DOCKER_CONTAINER \
    clickhouse-client --host=$CLICKHOUSE_HOST --port=$CLICKHOUSE_PORT \
    --user=$CLICKHOUSE_USER --password='$CLICKHOUSE_PASSWORD' \
    --database=$CLICKHOUSE_DATABASE \
    --format=JSON --query=\"SELECT 1 LIMIT 1\""
```

For multi-line queries, use a heredoc piped over SSH:

```bash
ssh "$CLICKHOUSE_SSH_USER@$CLICKHOUSE_SSH_HOST" \
  "sudo docker exec -i $CLICKHOUSE_DOCKER_CONTAINER \
    clickhouse-client --host=$CLICKHOUSE_HOST --port=$CLICKHOUSE_PORT \
    --user=$CLICKHOUSE_USER --password='$CLICKHOUSE_PASSWORD' \
    --database=$CLICKHOUSE_DATABASE \
    --format=JSON" <<'SQL'
SELECT toDate(__timestamp) AS day,
       countIf(AltGovHandleRule = 1) AS alt_gov_hits
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
GROUP BY day
ORDER BY day DESC
LIMIT 100
SQL
```

**Output format:** Use `--format=JSON` (or `JSONCompact`) for parseable results. For quick checks, `--format=PrettyCompact` is more readable.

**Schema introspection:** To get column metadata:

```bash
ssh "$CLICKHOUSE_SSH_USER@$CLICKHOUSE_SSH_HOST" \
  "sudo docker exec $CLICKHOUSE_DOCKER_CONTAINER \
    clickhouse-client --host=$CLICKHOUSE_HOST --port=$CLICKHOUSE_PORT \
    --user=$CLICKHOUSE_USER --password='$CLICKHOUSE_PASSWORD' \
    --database=$CLICKHOUSE_DATABASE \
    --format=JSON --query=\"DESCRIBE TABLE default.osprey_execution_results\""
```

### Environment Variables

The project `.envrc` exports these variables. Load them for commands with `direnv exec . bash -lc '...'`. Non-secret values live directly in `.envrc`; `CLICKHOUSE_PASSWORD` and machine-local `CLICKHOUSE_SSH_KEY` should live in `secrets/clickhouse.env`, loaded by `.envrc` via `source_env_if_exists`.

| Variable | Purpose |
|----------|---------|
| `CLICKHOUSE_SSH_HOST` | SSH target host |
| `CLICKHOUSE_SSH_USER` | SSH user |
| `CLICKHOUSE_SSH_PORT` | SSH port (default 22) |
| `CLICKHOUSE_SSH_KEY` | SSH key path (optional) |
| `CLICKHOUSE_DOCKER_CONTAINER` | Docker container name on the remote host |
| `CLICKHOUSE_HOST` | ClickHouse host inside the container (usually 127.0.0.1) |
| `CLICKHOUSE_PORT` | ClickHouse port (default 9000) |
| `CLICKHOUSE_USER` | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |
| `CLICKHOUSE_DATABASE` | ClickHouse database (default: default) |

If these variables are unset, the SSH command will fail with a clear error. The operator should create `.envrc` from `.envrc.example`.

## Safety Rules

The agent must follow these safety constraints when querying ClickHouse. They are not enforced by an intermediary — the agent is responsible for compliance:

**SELECT Only**

All queries must be SELECT statements. No INSERT, UPDATE, DELETE, or DDL operations.

**LIMIT Required**

Every query must include a LIMIT clause. This prevents accidental runaway queries and caps result set sizes.

```sql
-- Good
SELECT ... FROM default.osprey_execution_results WHERE ... LIMIT 100

-- Bad
SELECT ... FROM default.osprey_execution_results WHERE ...
```

**Read-Only Discipline**

Queries must start with SELECT or WITH (for CTEs). JOINs, UNIONs, subqueries, and any table are allowed. Do not use semicolons to chain statements. Do not use INTO OUTFILE or similar export clauses.

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
-- All valid for the current wide event table
SELECT __action_id, __timestamp, Handle, PostTextCleaned, AltGovHandleRule
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
LIMIT 100

SELECT toStartOfHour(__timestamp) AS hour, countIf(AltGovHandleRule = 1) AS hits
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
GROUP BY hour
ORDER BY hour DESC
LIMIT 100

WITH flagged AS (SELECT user_id FROM default.account_entropy_results WHERE is_bot_like = 1 LIMIT 500)
SELECT __timestamp, Handle, AccountAgeSeconds
FROM default.osprey_execution_results
WHERE UserId IN (SELECT user_id FROM flagged)
  AND __timestamp > now() - interval 1 day
LIMIT 100
```

**60-Second Timeout**

Queries running longer than 60 seconds may be cancelled. Design queries to complete within this window by filtering aggressively and using conservative LIMITs.

**Agent Responsibility**

These constraints are NOT enforced by an intermediary layer. The agent must self-enforce:
- Only execute SELECT queries
- Always include LIMIT
- Never run INSERT, UPDATE, DELETE, DDL, or multi-statement queries
- Never use INTO OUTFILE or similar export clauses

## Query Structure Best Practices

Follow this pattern for reliable, performant queries:

### 1. Understand the Wide Event Schema First

`default.osprey_execution_results` is **not** a flat rule-hit table. Every row is one evaluated AT Protocol event. Only these columns are universal:

- `__action_id`
- `__timestamp`
- `__error_count`
- `__atproto_label`
- `__entity_label_mutations`
- `__verdicts`

Everything else is a dynamic PascalCase column created from deployed rules and models: identity fields (`UserId`, `Handle`), content fields (`PostTextCleaned`), model outputs (`AccountAgeSeconds`), and rule outcomes (`AltGovHandleRule`, `DigestRepostBotRule`, etc.). There is no universal `did`, `handle`, `content`, `rule_name`, `matched`, `score`, `created_at`, `pds_host`, `event_type`, or `rule_category` column in this table.

Start by discovering live columns:

```sql
DESCRIBE TABLE default.osprey_execution_results
```

To find candidate columns by name:

```sql
SELECT name, type
FROM system.columns
WHERE database = 'default'
  AND table = 'osprey_execution_results'
  AND (name ILIKE '%Handle%' OR name ILIKE '%PostText%' OR name ILIKE '%Rule%')
ORDER BY name
LIMIT 200
```

### 2. Filter by Time Range First

Always include a `__timestamp` filter. It is the universal time column and the partitioning/performance anchor for Osprey event queries.

```sql
SELECT __action_id, __timestamp, Handle, PostTextCleaned, AltGovHandleRule
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
  AND AltGovHandleRule = 1
ORDER BY __timestamp DESC
LIMIT 100
```

Without time filtering, queries may scan the entire wide table and timeout.

### 3. Select Specific Columns

Avoid `SELECT *`. The table has 600+ dynamic columns, so selecting everything is expensive and noisy. Select only universal columns and the specific dynamic columns relevant to the question.

```sql
-- Good (fast)
SELECT __timestamp, UserId, Handle, PostTextCleaned, AltGovHandleRule
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
  AND AltGovHandleRule = 1
LIMIT 100

-- Bad (slow/noisy)
SELECT *
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
LIMIT 100
```

### 4. Use LIMIT Generously

Start with conservative LIMIT values (10-100) for exploratory queries, and increase only if needed.

```sql
-- Safe for exploration
SELECT ...
LIMIT 50

-- For comprehensive analysis, still cap results
SELECT ...
LIMIT 10000
```

### 5. Filter on Real Dynamic Columns Only After Discovery

Dynamic columns are added as rules/models deploy. Never assume a generic column exists. Confirm the exact PascalCase column name in `system.columns` or `DESCRIBE TABLE` first, then filter on it.

```sql
SELECT __timestamp, UserId, Handle, AccountAgeSeconds, AltGovHandleRule
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
  AND AltGovHandleRule = 1
LIMIT 100
```

Rule outcome columns are typically nullable integer/boolean-style columns where `1` indicates a match. Numeric model/score outputs are separate named columns, not a generic `score` column.

## Performance Tips

### Content Search Is Expensive

The `ngramDistance()` function searches for similar text by n-gram comparison. It's powerful but slow. Note: ngramDistance() returns 0 for identical content and 1 for completely different content.

Always pair `ngramDistance()` with other filters and the actual text column discovered from schema, often `PostTextCleaned` for post events:

```sql
-- Good: narrow context with time + ngramDistance on a real text column
SELECT __timestamp, UserId, Handle, PostTextCleaned,
       ngramDistance(PostTextCleaned, 'target phrase') AS distance
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
  AND PostTextCleaned IS NOT NULL
  AND ngramDistance(PostTextCleaned, 'target phrase') < 0.5
ORDER BY distance ASC
LIMIT 50

-- Bad: ngramDistance alone scans all content-like columns/rows
SELECT ...
WHERE ngramDistance(PostTextCleaned, 'target phrase') < 0.5
LIMIT 100
```

### Aggregate Queries Are Fast

GROUP BY queries are typically faster than raw row selection, because aggregation reduces result set size.

```sql
-- Fast: aggregates reduce data volume for known rule columns
SELECT toDate(__timestamp) AS day,
       countIf(AltGovHandleRule = 1) AS alt_gov_hits,
       countIf(DigestRepostBotRule = 1) AS digest_bot_hits
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
GROUP BY day
ORDER BY day DESC
LIMIT 50

-- Slower: row enumeration, still limited and column-specific
SELECT __timestamp, UserId, Handle, AltGovHandleRule, DigestRepostBotRule
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
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

Query co-sharing data to identify coordinated URL sharing networks. Three tables available. For co-sharing analysis, use the dedicated MCP tools (`mcp__skywatch-mcp__cosharing_clusters`, `mcp__skywatch-mcp__cosharing_pairs`, `mcp__skywatch-mcp__cosharing_evolution`) which handle JOINs internally — these remain available as MCP tools. For ad-hoc queries or cross-table analysis, use direct ClickHouse queries via SSH.

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

For `default.osprey_execution_results`, only six columns are universal. See `skywatch-accessing-osprey` and live `DESCRIBE TABLE` output for the complete dynamic schema.

| Column | Type | Use Case |
|--------|------|----------|
| `__action_id` | Int64 | Unique evaluated event identifier |
| `__timestamp` | DateTime64(3) | Universal time filter; use in every event-table query |
| `__error_count` | Nullable(Int32) | Evaluation error count |
| `__atproto_label` | Dynamic/serialized label output | AtProto label output from evaluation |
| `__entity_label_mutations` | Dynamic/serialized mutations | Entity label mutation output |
| `__verdicts` | Dynamic/serialized verdicts | Verdict output |

Common dynamic-column patterns, after confirming the live schema:

| Pattern | Examples | Use Case |
|---|---|---|
| Identity/model fields | `UserId`, `Handle`, `DisplayName` | Account/entity identification |
| Content fields | `PostTextCleaned`, URL/embed-related fields | Content review and similarity search |
| Account metadata | `AccountAgeSeconds`, follower/post count model outputs when present | Account characterization |
| Rule outcomes | `AltGovHandleRule`, `DigestRepostBotRule` | Rule match filters; usually `= 1` means matched |
| Numeric model outputs | toxicity/similarity/score-specific PascalCase names | Threshold analysis for that model |

## Output Interpretation

### Understanding Rule Columns vs. Model Columns

There is no generic `matched` or `score` column. Each rule/model writes its own dynamic column.

**Rule outcome columns:**
- Usually PascalCase and often suffixed `Rule`.
- Treat `ColumnName = 1` as a match only after confirming the column type/semantics.
- Use `countIf(ColumnName = 1)` for hit counts.

**Numeric model output columns:**
- Have model-specific names, not a shared `score` name.
- Analyze thresholds/quantiles per concrete column.

### Interpreting NULL Values

Dynamic columns are sparse. `NULL` usually means the model/rule did not apply to that evaluated event or did not produce a value, not necessarily that data is corrupt.

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
