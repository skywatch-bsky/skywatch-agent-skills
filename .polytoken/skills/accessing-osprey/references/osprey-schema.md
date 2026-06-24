# osprey_execution_results Schema

Verified against live ClickHouse: 2026-04-29

The `osprey_execution_results` table in ClickHouse stores the execution history of Osprey moderation rules. Each row represents a single action evaluation — a post, follow, profile update, or other AT Protocol event that was processed by the rule engine.

## Table Structure

The table has two categories of columns:

1. **System columns** (6) — prefixed with `__`, present on every row, describe the evaluation event itself.
2. **Dynamic rule/model columns** (~606 and growing) — one column per rule or model output. PascalCase names. Added automatically when new rules are deployed.

## System Columns

| Column | Type | Description |
|--------|------|-------------|
| `__action_id` | Int64 | Unique identifier for the evaluation event |
| `__timestamp` | DateTime64(3) | UTC timestamp when the evaluation occurred (millisecond precision) |
| `__error_count` | Nullable(Int32) | Number of errors during evaluation (NULL if none) |
| `__atproto_label` | Array(String) | Labels applied to the AT Protocol entity as a result of this evaluation |
| `__entity_label_mutations` | Array(String) | Label changes (additions/removals) applied to the entity |
| `__verdicts` | Array(String) | Verdict strings emitted by rules during this evaluation |

### Key Points

- **`__timestamp`** is the primary time column. Always filter on it for performance.
- **`__action_id`** is unique per evaluation and serves as the row identifier.
- There is no `created_at`, `rule_name`, `did`, `handle`, `uri`, `content`, `matched`, or `score` column. These concepts are encoded in the dynamic columns.

## Dynamic Rule/Model Columns

Each Osprey rule or model output gets its own column. Column names are PascalCase identifiers matching the rule or model name in SML. All dynamic columns are `Nullable` — they are NULL when the rule/model was not evaluated for that event.

### Column Type Patterns

| ClickHouse Type | Meaning | Examples |
|----------------|---------|----------|
| `Nullable(UInt8)` | Boolean rule result (0 = no match, 1 = match) | `AltGovHandleRule`, `SuicidalContentRule` |
| `Nullable(Int64)` | Integer model output (count, age in seconds, etc.) | `AccountAgeSeconds`, `FastFollowVelocityRepeatCount` |
| `Nullable(Float64)` | Numeric score (toxicity, similarity, etc.) | `ToxicityScoreUnwrapped` |
| `Nullable(String)` | String model output (DID, name, collection, URL, etc.) | `DisplayName`, `FollowSubjectDid`, `ActionName` |

### Common Infrastructure Models

These model columns appear on most rows and provide event context:

| Column | Type | Description |
|--------|------|-------------|
| `ActionName` | Nullable(String) | AT Protocol action type (e.g., `create_post`, `create_follow`, `update_profile`) |
| `AccountAgeSeconds` | Nullable(Int64) | Age of the account in seconds at evaluation time |
| `AccountCreatedAt` | Nullable(String) | ISO timestamp of account creation |
| `DisplayName` | Nullable(String) | Display name of the account |
| `PostHasExternal` | Nullable(UInt8) | Whether the post contains an external link |
| `FollowSubjectDid` | Nullable(String) | DID of the follow target (for follow events) |
| `FollowSubjectVia` | Nullable(String) | How the follow was initiated |
| `IsMonitoredPdsHost` | Nullable(UInt8) | Whether the account's PDS is on the monitored list |

### Label-Check Models

Columns prefixed with `Has...Label` check whether an entity already carries a specific label:

| Column | Type |
|--------|------|
| `HasContainsSlurLabel` | Nullable(UInt8) |
| `HasNaziSymbolismLabel` | Nullable(UInt8) |
| `NotHasElonMuskLabelRule` | Nullable(UInt8) |

### Rule Columns

Rule columns (suffixed `Rule`) are boolean — 1 means the rule matched. Examples:

- `AltGovHandleRule` — matches alt-government handles
- `DigestRepostBotRule` — matches digest/repost bot patterns
- `FollowFarmingAccountRule` — matches follow-farming behaviour
- `SuicidalContentRule` — matches suicidal content
- `OnlyFansVipHandleSpamRule` — matches OnlyFans VIP handle spam
- `ContainsSlurProfileRule` — matches slur usage in profiles
- `MediumDailySlurUseRule` — matches medium-frequency daily slur usage

There are ~600 rule and model columns. Use `clickhouse_schema` to get the current full list, or query column names:

```sql
SELECT name, type
FROM system.columns
WHERE table = 'osprey_execution_results' AND database = 'default'
ORDER BY name
LIMIT 1000
```

## Querying Patterns

Since there's no single `rule_name` column, you query specific rules by their column name:

```sql
-- Find accounts that matched a specific rule
SELECT __action_id, __timestamp, DisplayName, AccountAgeSeconds
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND __timestamp > now() - INTERVAL 7 DAY
LIMIT 100
```

```sql
-- Find all rule matches for a specific account (check multiple rule columns)
SELECT __timestamp, AltGovHandleRule, SuicidalContentRule, DigestRepostBotRule
FROM default.osprey_execution_results
WHERE ActionName = 'create_post'
  AND __timestamp > now() - INTERVAL 1 DAY
LIMIT 100
```

```sql
-- Count rule hits over time
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

## Performance Notes

- **Always filter on `__timestamp`** — this is the partitioning key.
- **Select only needed columns** — with 600+ columns, `SELECT *` is extremely expensive.
- **Use LIMIT** — always include a LIMIT clause.
- **Dynamic columns are sparse** — most are NULL for any given row. ClickHouse handles this efficiently in columnar storage.

---

# pds_signup_anomalies Schema

Verified against live ClickHouse: 2026-04-29

The `pds_signup_anomalies` table stores output from the PDS signup anomaly sidecar. Each row represents a PDS host's signup statistics within a time bucket, scored against its baseline.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `run_timestamp` | DateTime64(3) | When the sidecar analysis cycle ran |
| `granularity` | Enum8('daily'=1, 'hourly'=2) | Time bucket granularity |
| `pds_host` | String | PDS hostname (e.g., `example.com`) |
| `observed_count` | UInt64 | Number of signups observed in the bucket |
| `distinct_accounts` | UInt64 | Number of distinct accounts that signed up |
| `expected_lambda` | Float64 | Baseline expected signup rate (Poisson lambda) |
| `p_value` | Float64 | p-value for signup rate anomaly (low = statistically surprising) |
| `is_anomaly` | UInt8 | 1 if p-value crossed the threshold |
| `baseline_source` | Enum8('entity'=1, 'population'=2) | Whether baseline comes from host's own history or population median |
| `baseline_days_available` | UInt16 | Days of historical data used for baseline |
| `dispersion_index` | Nullable(Float64) | Variance-to-mean ratio of signup timing (high = bursty) |
| `rolling_mean` | Nullable(Float64) | Rolling mean of signup rate |
| `rolling_variance` | Nullable(Float64) | Rolling variance of signup rate |
| `sample_dids` | Array(String) | Sample DIDs of accounts that signed up |

## Ordering Key

`(run_timestamp, granularity, pds_host)` — filter by run_timestamp for performance.

## Common Filters

- `is_anomaly = 1` — only anomalous PDS hosts
- `granularity = 'daily'` or `granularity = 'hourly'` — select time resolution
- `p_value < 0.01` — strong anomalies only
- `baseline_source = 'entity'` — hosts with established baselines (more reliable)
- `dispersion_index > 2.0` — bursty signup patterns (Poisson expectation is 1.0)

---

# url_overdispersion_results Schema

Verified against live ClickHouse: 2026-04-29

The `url_overdispersion_results` table stores output from the URL overdispersion sidecar. Each row represents a domain's sharing statistics within a time bucket, scored against its baseline.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `run_timestamp` | DateTime64(3) | When the sidecar analysis cycle ran |
| `granularity` | Enum8('hourly'=1, 'daily'=2) | Time bucket granularity |
| `domain` | String | The domain being shared (e.g., `example.com`) |
| `bucket_start` | DateTime64(3) | Start of the time bucket being analysed |
| `total_shares` | UInt64 | Total number of shares of this domain in the bucket |
| `unique_sharers` | UInt64 | Number of distinct accounts that shared this domain |
| `sharer_density` | Float64 | Ratio of unique_sharers to total_shares (high = many one-time sharers) |
| `expected_volume_lambda` | Float64 | Baseline expected share rate (Poisson lambda) |
| `expected_density_lambda` | Float64 | Baseline expected sharer density |
| `volume_p_value` | Float64 | p-value for volume anomaly (low = statistically surprising volume) |
| `density_p_value` | Float64 | p-value for density anomaly (low = statistically surprising density) |
| `is_anomaly` | UInt8 | 1 if either volume or density p-value crossed the threshold |
| `baseline_source` | Enum8('entity'=1, 'population'=2) | Whether baseline comes from domain's own history or population median |
| `baseline_days_available` | UInt16 | Days of historical data used for baseline |
| `sample_dids` | Array(String) | Sample DIDs of accounts that shared this domain |
| `sample_urls` | Array(String) | Sample full URLs shared |
| `on_watchlist` | UInt8 | 1 if domain is on the configured watchlist |

## Ordering Key

`(run_timestamp, granularity, domain)` — filter by run_timestamp for performance.

## Common Filters

- `is_anomaly = 1` — only anomalous domains
- `granularity = 'hourly'` or `granularity = 'daily'` — select time resolution
- `volume_p_value < 0.01` — volume-only anomalies
- `density_p_value < 0.01` — density-only anomalies
- `baseline_source = 'entity'` — domains with established baselines (more reliable)
- `on_watchlist = 1` — pre-identified domains of interest

---

# quote_overdispersion_results Schema

Verified against live ClickHouse: 2026-04-29

The `quote_overdispersion_results` table stores output from the quote overdispersion sidecar. Each row represents a quoted post's sharing statistics within a time bucket, scored against its baseline.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `run_timestamp` | DateTime64(3) | When the sidecar analysis cycle ran |
| `granularity` | Enum8('hourly'=1, 'daily'=2) | Time bucket granularity |
| `quoted_uri` | String | AT-URI of the post being quoted |
| `quoted_author_did` | String | DID of the author of the quoted post |
| `bucket_start` | DateTime64(3) | Start of the time bucket being analysed |
| `total_shares` | UInt64 | Total number of quote-posts of this URI in the bucket |
| `unique_sharers` | UInt64 | Number of distinct accounts that quoted this post |
| `sharer_density` | Float64 | Ratio of unique_sharers to total_shares |
| `expected_volume_lambda` | Float64 | Baseline expected quote rate (Poisson lambda) |
| `expected_density_lambda` | Float64 | Baseline expected sharer density |
| `volume_p_value` | Float64 | p-value for volume anomaly |
| `density_p_value` | Float64 | p-value for density anomaly |
| `is_anomaly` | UInt8 | 1 if either p-value crossed the threshold |
| `baseline_source` | Enum8('entity'=1, 'population'=2) | Whether baseline comes from URI's own history or population median |
| `baseline_days_available` | UInt16 | Days of historical data used for baseline |
| `sample_dids` | Array(String) | Sample DIDs of accounts that quoted this post |

## Ordering Key

`(run_timestamp, granularity, quoted_uri)` — filter by run_timestamp for performance.

## Common Filters

- `is_anomaly = 1` — only anomalous quoted posts
- `granularity = 'hourly'` or `granularity = 'daily'` — select time resolution
- `volume_p_value < 0.01` — volume-only anomalies
- `density_p_value < 0.01` — density-only anomalies

---

# account_entropy_results Schema

Verified against live ClickHouse: 2026-04-29

The `account_entropy_results` table stores output from the account entropy sidecar. Each row represents an account's temporal posting pattern analysis over a time window.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `run_timestamp` | DateTime64(3) | When the sidecar analysis cycle ran |
| `user_id` | String | DID of the AT Protocol account being analysed |
| `window_start` | DateTime64(3) | Start of the analysis time window |
| `window_end` | DateTime64(3) | End of the analysis time window |
| `post_count` | UInt64 | Number of posts in the window |
| `hourly_entropy` | Float64 | Shannon entropy over hour-of-day distribution (0-4.585 bits; high = uniform across hours = bot-like) |
| `interval_entropy` | Float64 | Shannon entropy over inter-post interval distribution (0-2.81 bits; low = regular spacing = bot-like) |
| `mean_interval_seconds` | Float64 | Average gap between consecutive posts in seconds |
| `stddev_interval_seconds` | Float64 | Standard deviation of inter-post intervals in seconds |
| `is_bot_like` | UInt8 | 1 only when both hourly_flag AND interval_flag are set (conjunction) |
| `hourly_flag` | UInt8 | 1 if hourly_entropy >= threshold (default 3.9) |
| `interval_flag` | UInt8 | 1 if interval_entropy <= threshold (default 1.5) |
| `sample_rkeys` | Array(String) | Sample AT Protocol record keys for manual review |

## Ordering Key

`(run_timestamp, user_id)` — filter by run_timestamp for performance.

## Common Filters

- `is_bot_like = 1` — accounts flagged by both signals (highest confidence)
- `hourly_flag = 1` — accounts with uniform hour-of-day posting (may include shift workers)
- `interval_flag = 1` — accounts with mechanically regular posting intervals
- `post_count > 50` — focus on high-volume accounts

## Interpreting Entropy Values

| Metric | Human-like | Bot-like |
|--------|-----------|----------|
| `hourly_entropy` | 1.5-2.5 bits (concentrated in a few hours) | >= 3.9 bits (spread across 15+ hours) |
| `interval_entropy` | 2.0-2.8 bits (varied gaps) | <= 1.5 bits (regular gaps) |

The conjunction requirement (`is_bot_like` = both flags) substantially reduces false positives. Individual flags are useful for softer screening.

---

# url_cosharing_pairs Schema

Verified against live ClickHouse: 2026-04-29

Daily account pairs that co-shared URLs. Populated by a ClickHouse scheduled materialized view. TTL 7 days.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `date` | Date | Calendar day |
| `account_a` | String | DID (lexicographically smaller of the pair) |
| `account_b` | String | DID (lexicographically larger of the pair) |
| `weight` | UInt32 | Count of URLs this pair co-shared on this date |
| `shared_urls` | Array(String) | The actual URLs they co-shared |

## Ordering Key

`(date, account_a, account_b)` — filter by date for performance.

## Key Detail

Pairs are always stored with `account_a < account_b` (enforced by the materialized view). When querying for a specific DID, you must check both `account_a` and `account_b`.

## Common Filters

- `date = yesterday()` — yesterday's co-sharing activity
- `weight >= 3` — pairs sharing 3+ URLs (stronger signal)

## TTL

7 days. Queries beyond that window return no results. Use `cosharing_pairs` MCP tool for convenient access.

---

# url_cosharing_clusters Schema

Verified against live ClickHouse: 2026-04-29

Cluster-level results with metrics and evolution classification. Populated by the URL co-sharing Python sidecar. No TTL — retained indefinitely.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `run_date` | Date | Date the clustering ran |
| `cluster_id` | String | Stable ID in `YYYY-MM-DD-NNNN` format (date = birth date) |
| `member_count` | UInt32 | Number of accounts in the cluster |
| `total_edges` | UInt32 | Number of co-sharing edges within the cluster |
| `total_weight` | UInt32 | Sum of edge weights (total co-shared URL instances) |
| `unique_urls` | UInt32 | Count of distinct URLs shared within the cluster |
| `temporal_spread_hours` | Float64 | Hours between earliest and latest post by any cluster member that day |
| `mean_posting_interval_seconds` | Float64 | Average seconds between consecutive posts across all cluster members |
| `sample_dids` | Array(String) | First 10 member DIDs (for quick inspection) |
| `sample_urls` | Array(String) | First 10 URLs shared by the cluster |
| `resolution_parameter` | Float64 | CPM resolution used for this clustering run |
| `evolution_type` | Enum8('birth'=1, 'death'=2, 'continuation'=3, 'merge'=4, 'split'=5) | Cluster evolution classification |
| `predecessor_cluster_ids` | Array(String) | IDs of previous clusters this evolved from |
| `jaccard_score` | Float64 | Jaccard similarity to best-matching predecessor |

## Ordering Key

`(run_date, cluster_id)` — filter by run_date for performance.

## Evolution Types

| Type | Meaning | `predecessor_cluster_ids` | `jaccard_score` |
|------|---------|---------------------------|-----------------|
| `birth` | No previous cluster matches above threshold | Empty | 0.0 |
| `continuation` | Matches exactly one previous cluster (inherits its ID) | The predecessor ID | Jaccard with predecessor |
| `merge` | Matches multiple previous clusters | All matching predecessor IDs | Best Jaccard |
| `split` | Matches one previous cluster that maps to multiple current clusters | The single predecessor ID | Jaccard with predecessor |
| `death` | Previous cluster with no current match | Self | 0.0 |

## Interpreting Coordination Signals

- **Tight temporal spread** (`temporal_spread_hours` < 4) + **regular intervals** (`mean_posting_interval_seconds` < 300) = strong coordination signal
- **Low content diversity** (`unique_urls` / `member_count` < 2) = likely coordinated
- **`merge` and `split` events** indicate network restructuring — worth investigating

## Common Filters

- `run_date = yesterday()` — yesterday's clusters
- `member_count >= 5` — non-trivial clusters
- `evolution_type = 'birth'` — newly formed clusters
- `evolution_type IN ('merge', 'split')` — clusters undergoing restructuring

---

# url_cosharing_membership Schema

Verified against live ClickHouse: 2026-04-29

Daily membership snapshots — which DIDs belong to which cluster on which day. TTL 7 days.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `run_date` | Date | Date of the snapshot |
| `cluster_id` | String | Cluster ID |
| `did` | String | Account DID |

## Ordering Key

`(run_date, cluster_id, did)` — filter by run_date for performance.

## Common Filters

- `did = '{target_did}'` — find clusters a specific account belongs to
- `cluster_id = '{id}'` — list all members of a specific cluster

## TTL

7 days. For cluster-level data beyond 7 days, use `url_cosharing_clusters` (no TTL). Use `cosharing_clusters` MCP tool for convenient membership-to-cluster lookups.

---

# quote_cosharing_pairs Schema

Verified against live ClickHouse: 2026-04-29

Daily account pairs that co-quoted the same posts. Same architecture as URL co-sharing but tracks quote-posts. TTL 7 days.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `date` | Date | Calendar day |
| `account_a` | String | DID (lexicographically smaller of the pair) |
| `account_b` | String | DID (lexicographically larger of the pair) |
| `weight` | UInt32 | Count of AT-URIs this pair co-quoted on this date |
| `shared_uris` | Array(String) | The AT-URIs they co-quoted |

## Ordering Key

`(date, account_a, account_b)` — filter by date for performance.

## TTL

7 days.

---

# quote_cosharing_clusters Schema

Verified against live ClickHouse: 2026-04-29

Cluster-level results for quote co-sharing. Same structure as `url_cosharing_clusters` but uses AT-URIs instead of URLs. No TTL.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `run_date` | Date | Date the clustering ran |
| `cluster_id` | String | Stable ID in `YYYY-MM-DD-NNNN` format |
| `member_count` | UInt32 | Number of accounts in the cluster |
| `total_edges` | UInt32 | Number of co-quoting edges within the cluster |
| `total_weight` | UInt32 | Sum of edge weights |
| `unique_uris` | UInt32 | Count of distinct AT-URIs quoted within the cluster |
| `temporal_spread_hours` | Float64 | Hours between earliest and latest quote by any member |
| `mean_posting_interval_seconds` | Float64 | Average seconds between consecutive quotes |
| `sample_dids` | Array(String) | First 10 member DIDs |
| `sample_uris` | Array(String) | First 10 AT-URIs quoted by the cluster |
| `resolution_parameter` | Float64 | CPM resolution used |
| `evolution_type` | Enum8('birth'=1, 'death'=2, 'continuation'=3, 'merge'=4, 'split'=5) | Cluster evolution classification |
| `predecessor_cluster_ids` | Array(String) | IDs of previous clusters this evolved from |
| `jaccard_score` | Float64 | Jaccard similarity to best-matching predecessor |

## Ordering Key

`(run_date, cluster_id)` — filter by run_date for performance.

---

# quote_cosharing_membership Schema

Verified against live ClickHouse: 2026-04-29

Daily membership snapshots for quote co-sharing clusters. TTL 7 days.

## Columns

| Column | Type | Description |
|--------|------|-------------|
| `run_date` | Date | Date of the snapshot |
| `cluster_id` | String | Cluster ID |
| `did` | String | Account DID |

## Ordering Key

`(run_date, cluster_id, did)` — filter by run_date for performance.

## TTL

7 days.
