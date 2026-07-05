# Common Investigation Queries

This reference provides 20 proven query patterns for investigating rule hits and account behavior on the Osprey platform. Use these as starting points for your own investigations.

`osprey_execution_results` is a wide event table: only `__action_id`, `__timestamp`, `__error_count`, `__atproto_label`, `__entity_label_mutations`, and `__verdicts` are present on every row. There is no generic `did`, `rule_name`, `matched`, `score`, or `content` column — each rule/model has its own dynamic column (e.g. `AltGovHandleRule`, `PostTextCleaned`, `AccountAgeSeconds`). See the `accessing-osprey` skill's `references/osprey-schema.md` for the full reference. Queries below name specific example rule/model columns — swap in the actual column for the rule you're investigating.

---

## 1. All Hits for a Specific Rule on a DID's Follow Target

**Purpose:** Find every time a specific rule matched, scoped to events involving a particular DID. Use when investigating a specific account's violations for a known rule.

**SQL:**
```sql
SELECT
  __timestamp,
  Handle,
  AltGovHandleRule,
  __atproto_label
FROM default.osprey_execution_results
WHERE FollowSubjectDid = 'did:plc:xxx...'
  AND AltGovHandleRule = 1
  AND __timestamp > now() - interval 7 day
ORDER BY __timestamp DESC
LIMIT 100
```

**Output:** Rows are ordered newest-first, one per matching evaluation.

**Notes:** Replace `did:plc:xxx...` and `AltGovHandleRule` with the target DID and rule column. Which DID-shaped column applies depends on the event type — `FollowSubjectDid` for follow events; other action types expose their own subject columns. Adjust the time range (7 day) as needed.

---

## 2. All Rule Hits for a Specific Handle

**Purpose:** Find rule hits for an account identified by handle. Use `Handle` directly since there's no generic `did` filter across all event types.

**SQL:**
```sql
SELECT
  __timestamp,
  AltGovHandleRule,
  DigestRepostBotRule,
  AccountAgeSeconds
FROM default.osprey_execution_results
WHERE Handle = 'alice.bsky.social'
  AND __timestamp > now() - interval 7 day
ORDER BY __timestamp DESC
LIMIT 100
```

**Output:** Shows named rule columns plus account age. NULL in a rule column means that rule wasn't evaluated for that row's event type — not a miss.

**Notes:** Replace `alice.bsky.social` and the rule column list with the ones relevant to your investigation. Handles can change; cross-reference with a DID-bearing column (`FollowSubjectDid`, etc.) where available for permanent tracking.

---

## 3. Accounts Triggering a Specific Rule (Recent)

**Purpose:** Find all accounts that triggered a particular rule in the last N days. Use when a rule is firing too much or when investigating a specific violation type.

**SQL:**
```sql
SELECT
  Handle,
  count() as hit_count,
  max(__timestamp) as latest_hit
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND __timestamp > now() - interval 1 day
GROUP BY Handle
ORDER BY hit_count DESC
LIMIT 50
```

**Output:** Aggregated view of accounts. `hit_count` shows how many times each account triggered the rule. `latest_hit` shows the most recent trigger.

**Notes:** Replace `AltGovHandleRule` with the target rule column. Adjust time window (1 day) to match investigation scope.

---

## 4. Top Offenders Across Multiple Rules

**Purpose:** Identify accounts matching the most rules from a known set. Useful for finding repeat violators. Requires naming the rule columns you care about — there's no single `rule_name` to count distinct over.

**SQL:**
```sql
SELECT
  Handle,
  countIf(AltGovHandleRule = 1) as alt_gov_hits,
  countIf(DigestRepostBotRule = 1) as digest_bot_hits,
  countIf(ContainsSlurProfileRule = 1) as slur_hits,
  max(__timestamp) as latest_hit
FROM default.osprey_execution_results
WHERE (AltGovHandleRule = 1 OR DigestRepostBotRule = 1 OR ContainsSlurProfileRule = 1)
  AND __timestamp > now() - interval 7 day
GROUP BY Handle
ORDER BY alt_gov_hits + digest_bot_hits + slur_hits DESC
LIMIT 100
```

**Output:** Ranked by combined hits across the named rules. Extend the `countIf`/`OR` list to cover more rules as needed.

**Notes:** Time window defaults to 7 days; adjust for longer-term analysis. List every rule column of interest explicitly — there's no distinct-rule-count shortcut without a `rule_name` column.

---

## 5. Rule Hit Volume by Hour (Last 24 Hours)

**Purpose:** Detect activity spikes or temporal patterns for a specific rule. Use when investigating coordinated or bot-like activity.

**SQL:**
```sql
SELECT
  toStartOfHour(__timestamp) as hour,
  countIf(AltGovHandleRule = 1) as hits,
  count(DISTINCT Handle) as unique_accounts
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
GROUP BY hour
ORDER BY hour DESC
LIMIT 100
```

**Output:** Rows grouped by hour. Shows both total hits and unique accounts per hour, revealing spikes and concentration.

**Notes:** Use `toStartOfDay()` for daily buckets, `toStartOfWeek()` for weekly. Swap `AltGovHandleRule` for the rule under investigation.

---

## 6. Activity Timeline for a Specific Account

**Purpose:** See when an account was active and what rules it triggered. Useful for temporal correlation with external events.

**SQL:**
```sql
SELECT
  toStartOfDay(__timestamp) as day,
  countIf(AltGovHandleRule = 1) as alt_gov_hits,
  countIf(DigestRepostBotRule = 1) as digest_bot_hits,
  count() as total_events
FROM default.osprey_execution_results
WHERE Handle = 'alice.bsky.social'
  AND __timestamp > now() - interval 30 day
GROUP BY day
ORDER BY day DESC
LIMIT 100
```

**Output:** Daily aggregation showing when the account was most active and which rules triggered. Patterns suggest activity cycles.

**Notes:** Replace handle and rule columns. For very active accounts, reduce time range. This query reveals whether activity is consistent or episodic.

---

## 7. Burst Detection (High-Frequency Posting)

**Purpose:** Find accounts posting at abnormally high frequency, which suggests bots or coordinated behavior.

**SQL:**
```sql
SELECT
  Handle,
  toStartOfDay(__timestamp) as day,
  count() as daily_posts,
  count(DISTINCT toHour(__timestamp)) as hours_active
FROM default.osprey_execution_results
WHERE ActionName = 'create_post'
  AND __timestamp > now() - interval 7 day
GROUP BY Handle, day
HAVING daily_posts > 50
ORDER BY daily_posts DESC
LIMIT 100
```

**Output:** Accounts with >50 posts/day. `hours_active` shows how spread the activity was (1 hour = concentrated burst; 24 hours = sustained).

**Notes:** Adjust the HAVING threshold (>50) based on network norms. Higher thresholds catch more extreme behavior.

---

## 8. Content Similarity Search (Copypasta Detection)

**Purpose:** Find posts similar to a target text (copypasta, mass-produced content, etc.). Uses n-gram distance on `PostTextCleaned`.

**SQL:**
```sql
SELECT
  Handle,
  PostTextCleaned,
  __timestamp,
  ngramDistance(PostTextCleaned, 'target content phrase') as similarity
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
  AND PostTextCleaned IS NOT NULL
  AND length(PostTextCleaned) > 0
  AND ngramDistance(PostTextCleaned, 'target content phrase') < 0.5
ORDER BY similarity ASC
LIMIT 50
```

**Output:** Ranked by similarity (lower = more similar). `similarity` is a score from 0 (identical) to 1 (completely different).

**Notes:** Replace `target content phrase` with actual text. The threshold (<0.5) can be adjusted: 0.3 for near-exact matches, 0.5-0.7 for loose similarity. Always filter `PostTextCleaned IS NOT NULL AND length(PostTextCleaned) > 0` first — most rows have no post text, and `ngramDistance` on NULL/empty is wasted work.

---

## 9. Most Common Content Pattern for a Rule

**Purpose:** Identify what post text most commonly triggers a rule. Useful for understanding false positives or rule precision.

**SQL:**
```sql
SELECT
  PostTextCleaned,
  count() as occurrences,
  count(DISTINCT Handle) as unique_accounts
FROM default.osprey_execution_results
WHERE SuicidalContentRule = 1
  AND PostTextCleaned IS NOT NULL
  AND length(PostTextCleaned) > 0
  AND __timestamp > now() - interval 7 day
GROUP BY PostTextCleaned
ORDER BY occurrences DESC
LIMIT 50
```

**Output:** Content ranked by frequency. Shows exact text strings and how many accounts posted them.

**Notes:** Replace `SuicidalContentRule` with the rule column of interest. For high-frequency content (retweets, etc.), this reveals coordinated behavior. For low-frequency, helps identify novel patterns.

---

## 10. Content Clustering by Similarity

**Purpose:** Group similar content together to identify thematic patterns or coordinated messaging.

**SQL:**
```sql
SELECT
  PostTextCleaned,
  count() as occurrences,
  count(DISTINCT Handle) as unique_accounts
FROM default.osprey_execution_results
WHERE PostTextCleaned IS NOT NULL
  AND length(PostTextCleaned) > 50
  AND __timestamp > now() - interval 1 day
GROUP BY PostTextCleaned
HAVING occurrences > 2
ORDER BY occurrences DESC
LIMIT 100
```

**Output:** Grouped by exact content. HAVING filter (>2 occurrences) shows duplicated/clustered messages only.

**Notes:** Adjust `length(PostTextCleaned) > 50` to filter by message length. Small HAVING thresholds (>1) reveal even minor duplication. For fuzzy (not exact) clustering, use the `content_similarity` MCP tool or `ngramDistance()` pairwise instead of exact GROUP BY.

---

## 11. Accounts on a Monitored PDS Host

**Purpose:** Identify accounts on monitored Personal Data Servers. Can reveal coordinated networks (same provider used for bot armies).

**SQL:**
```sql
SELECT
  count(DISTINCT Handle) as unique_accounts,
  count() as total_events,
  avg(AccountAgeSeconds) as avg_age_seconds
FROM default.osprey_execution_results
WHERE IsMonitoredPdsHost = 1
  AND __timestamp > now() - interval 7 day
LIMIT 50
```

**Output:** Aggregate view of activity on monitored PDS hosts. `avg_age_seconds` shows if this cohort skews toward new accounts (indicator of bot networks).

**Notes:** `IsMonitoredPdsHost` is a boolean flag, not a hostname — there's no generic `pds_host` string column on this table. For actual hostnames, check the account/domain lookup tools rather than this table.

---

## 12. New Account Rule Triggers by Day

**Purpose:** Detect potential bot armies or coordinated account creation campaigns by tracking when new accounts trigger rules.

**SQL:**
```sql
SELECT
  toStartOfDay(__timestamp) as day,
  count(DISTINCT Handle) as new_accounts_triggered,
  countIf(AltGovHandleRule = 1) as rule_hits
FROM default.osprey_execution_results
WHERE AccountAgeSeconds < 7 * 86400
  AND __timestamp > now() - interval 30 day
GROUP BY day
ORDER BY new_accounts_triggered DESC
LIMIT 50
```

**Output:** Days when new accounts triggered rules. Spikes indicate coordinated creation campaigns or waves of bot activity.

**Notes:** Adjust `AccountAgeSeconds < 7 * 86400` to control age window (e.g., `< 86400` for accounts created today). `AccountAgeSeconds` is seconds, not days. High spikes of new accounts triggering rules in the same day suggest coordinated activity.

---

## 13. Cross-Signal Correlation (Same Content + Time)

**Purpose:** Identify highly coordinated activity by correlating multiple signals: same post text, similar timestamps.

**SQL:**
```sql
SELECT
  PostTextCleaned,
  toStartOfHour(__timestamp) as hour,
  count(DISTINCT Handle) as unique_accounts,
  count() as total_hits
FROM default.osprey_execution_results
WHERE PostTextCleaned IS NOT NULL
  AND length(PostTextCleaned) > 0
  AND __timestamp > now() - interval 1 day
GROUP BY PostTextCleaned, hour
HAVING unique_accounts > 3
ORDER BY unique_accounts DESC
LIMIT 100
```

**Output:** Clusters of identical content posted by multiple accounts in the same hour window.

**Notes:** HAVING filter (>3 accounts) identifies suspicious coordination. Adjust threshold to sensitivity. There's no `content_hash` or `pds_host` column on this table — use the `cosharing_*` tools/tables for infrastructure-level correlation instead.

---

## 14. Hit Rate for a Specific Rule

**Purpose:** Understand how often a rule fires and how much of the network it covers. Informs rule tuning and prioritization. Run once per rule of interest — there's no `rule_name` to GROUP BY.

**SQL:**
```sql
SELECT
  count() as total_evaluations,
  countIf(AltGovHandleRule = 1) as matches,
  round(100.0 * countIf(AltGovHandleRule = 1) / countIf(AltGovHandleRule IS NOT NULL), 2) as match_rate,
  count(DISTINCT Handle) as unique_accounts_hit
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
LIMIT 1
```

**Output:** A single row with the rule's match rate (%) and account coverage.

**Notes:** Replace `AltGovHandleRule` with the rule column. Rules with high match rates (20%+) may be too permissive. Rules with very low rates (<1%) may be too strict. `countIf(... IS NOT NULL)` is the denominator of rows where the rule was actually evaluated (not NULL because the event type didn't apply).

---

## 15. False Positive Candidates (Rule Hits on Established Accounts)

**Purpose:** Identify accounts that are old and established but still trigger rules. These are likely false positives.

**SQL:**
```sql
SELECT
  Handle,
  AccountAgeSeconds,
  __timestamp,
  AltGovHandleRule
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND AccountAgeSeconds > 365 * 86400
  AND __timestamp > now() - interval 7 day
ORDER BY AccountAgeSeconds DESC
LIMIT 100
```

**Output:** Rule hits on old accounts. High account age suggests a legitimate, established user, making the rule match suspicious.

**Notes:** Adjust `AccountAgeSeconds > 365 * 86400` (one year, in seconds) based on your network. There's no `follower_count` or `post_count` column on this table — cross-reference the account directly (e.g. via `assess-account`) for that context. Results here should be reviewed manually.

---

## 16. New Rule Coverage Analysis

**Purpose:** See how a newly deployed rule is performing and what it's catching.

**SQL:**
```sql
SELECT
  countIf(NewRuleV1 = 1) as v1_hits,
  countIf(NewRuleV2 = 1) as v2_hits,
  count(DISTINCT Handle) as unique_accounts,
  min(__timestamp) as first_seen,
  max(__timestamp) as latest_seen
FROM default.osprey_execution_results
WHERE (NewRuleV1 = 1 OR NewRuleV2 = 1)
  AND __timestamp > now() - interval 7 day
LIMIT 1
```

**Output:** Coverage stats for named new rules.

**Notes:** Use for monitoring newly deployed rules during their first week. Replace `NewRuleV1`/`NewRuleV2` with the actual rule column names — check `clickhouse_schema` if the exact column name is uncertain, since new rule columns are added automatically on deploy.

---

## 17. Model Score Distribution

**Purpose:** Analyze the distribution of a numeric model's output to inform threshold tuning.

**SQL:**
```sql
SELECT
  count() as total,
  min(ToxicityScoreUnwrapped) as min_score,
  quantile(0.25)(ToxicityScoreUnwrapped) as p25,
  quantile(0.50)(ToxicityScoreUnwrapped) as p50_median,
  quantile(0.75)(ToxicityScoreUnwrapped) as p75,
  max(ToxicityScoreUnwrapped) as max_score,
  avg(ToxicityScoreUnwrapped) as avg_score,
  stddevPop(ToxicityScoreUnwrapped) as std_dev
FROM default.osprey_execution_results
WHERE ToxicityScoreUnwrapped IS NOT NULL
  AND __timestamp > now() - interval 7 day
LIMIT 1
```

**Output:** Score distribution (quartiles, mean, std dev) for the named model column. Helps identify whether scores cluster or spread widely.

**Notes:** Replace `ToxicityScoreUnwrapped` with the numeric model column under investigation. A bimodal distribution (gaps in quartiles) may indicate two distinct populations (true positives vs. false positives).

---

## 18. Action Type Distribution (Event Types Evaluated)

**Purpose:** Understand what types of AT Protocol actions the Osprey platform evaluates. Useful for rule scope validation.

**SQL:**
```sql
SELECT
  ActionName,
  count() as evaluations,
  countIf(AltGovHandleRule = 1) as alt_gov_matches
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
GROUP BY ActionName
ORDER BY evaluations DESC
LIMIT 50
```

**Output:** Breakdown of evaluated action types (`create_post`, `create_follow`, `update_profile`, etc.) and how a given rule matches within each.

**Notes:** Helps confirm that rules are being applied to the intended event types. Swap `AltGovHandleRule` for the rule under review, or drop the `countIf` to just see raw action-type volume.

---

## 19. Recent Evaluation Diagnostics (Last Hour)

**Purpose:** Quick diagnostic to spot unusual recent activity or confirm data is flowing.

**SQL:**
```sql
SELECT
  __timestamp,
  __action_id,
  ActionName,
  Handle,
  __atproto_label,
  __verdicts
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 hour
ORDER BY __timestamp DESC
LIMIT 100
```

**Output:** Raw recent evaluations with any labels/verdicts applied. Use for real-time monitoring and quick sanity checks.

**Notes:** Useful for verifying that the pipeline is running and data is flowing. Add specific rule columns to the SELECT list to check whether expected rules are firing.

---

## 20. Query Metadata Completeness Check

**Purpose:** Validate that the pipeline is populating system columns correctly. There is no `did`/`rule_name`/`matched` to check for NULLs — those never existed as generic columns — so this checks the actual system columns instead.

**SQL:**
```sql
SELECT
  countIf(__timestamp IS NULL) as timestamp_nulls,
  countIf(Handle IS NULL) as handle_nulls,
  countIf(__error_count > 0) as rows_with_errors,
  count() as total_rows
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
LIMIT 1
```

**Output:** NULL/error counts plus total row count for the window.

**Notes:** Run periodically to monitor data integrity. `__timestamp` should never be NULL — if it is, that's a pipeline bug. `Handle` NULLs are expected for non-account-centric events (e.g. some system evaluations) but a sudden spike is worth investigating. `__error_count > 0` flags rows where the rule engine itself errored during evaluation.

---

---

## 21. Bot-Like Accounts (Account Entropy)

**Purpose:** Find accounts flagged as bot-like by the account entropy sidecar. Both hourly and interval entropy signals must fire for `is_bot_like = 1`.

**SQL:**
```sql
SELECT
  user_id,
  post_count,
  hourly_entropy,
  interval_entropy,
  mean_interval_seconds,
  stddev_interval_seconds,
  is_bot_like,
  sample_rkeys
FROM default.account_entropy_results
WHERE is_bot_like = 1
  AND run_timestamp > now() - interval 1 day
ORDER BY post_count DESC
LIMIT 50
```

**Output:** Accounts ranked by post volume where both entropy signals flagged automation. `sample_rkeys` provides AT Protocol record keys for manual content review.

**Notes:** Use `hourly_flag = 1` or `interval_flag = 1` alone for softer screening. `hourly_entropy` near 4.585 (max) means perfectly uniform posting across all 24 hours. `interval_entropy` near 0 means all inter-post gaps fall in the same bin.

---

## 22. Accounts with Suspicious Entropy (Soft Screen)

**Purpose:** Find accounts that trip one entropy signal but not both. Useful for identifying borderline cases or accounts using more sophisticated automation.

**SQL:**
```sql
SELECT
  user_id,
  post_count,
  hourly_entropy,
  interval_entropy,
  mean_interval_seconds,
  is_bot_like,
  hourly_flag,
  interval_flag
FROM default.account_entropy_results
WHERE (hourly_flag = 1 OR interval_flag = 1)
  AND is_bot_like = 0
  AND run_timestamp > now() - interval 1 day
ORDER BY hourly_entropy DESC
LIMIT 100
```

**Output:** Accounts with one flag but not both. May include shift workers (hourly only) or burst posters (interval only).

---

## 23. Anomalous Domain Sharing (URL Overdispersion)

**Purpose:** Find domains being shared in statistically unusual patterns — potential coordinated campaigns.

**SQL:**
```sql
SELECT
  domain,
  granularity,
  bucket_start,
  total_shares,
  unique_sharers,
  sharer_density,
  volume_p_value,
  density_p_value,
  baseline_source,
  sample_dids
FROM default.url_overdispersion_results
WHERE is_anomaly = 1
  AND run_timestamp > now() - interval 1 day
ORDER BY volume_p_value ASC
LIMIT 50
```

**Output:** Domains ranked by statistical surprise. Low `volume_p_value` means unexpectedly high share volume. Low `density_p_value` means unusually many unique sharers (one-share-per-account pattern). `sample_dids` provides starting accounts for deeper investigation.

**Notes:** `baseline_source = 'entity'` means the domain has its own history for comparison (more reliable). `baseline_source = 'population'` means it's compared against the population median (new/rare domain).

---

## 24. Domain Sharing History (URL Overdispersion Trend)

**Purpose:** Track a specific domain's overdispersion scores over time. Useful for understanding whether a campaign is ongoing or a one-off spike.

**SQL:**
```sql
SELECT
  run_timestamp,
  granularity,
  bucket_start,
  total_shares,
  unique_sharers,
  sharer_density,
  volume_p_value,
  density_p_value,
  is_anomaly
FROM default.url_overdispersion_results
WHERE domain = 'example.com'
  AND run_timestamp > now() - interval 7 day
ORDER BY run_timestamp DESC
LIMIT 100
```

**Output:** Time series of a domain's sharing statistics and anomaly flags.

---

## 25. Cross-Reference: Bot Accounts Sharing Anomalous Domains

**Purpose:** Find accounts flagged as bot-like that also appear in the sample_dids of anomalous domain sharing events. Requires two queries.

**Query 1 — Get bot-like account DIDs:**
```sql
SELECT DISTINCT user_id
FROM default.account_entropy_results
WHERE is_bot_like = 1
  AND run_timestamp > now() - interval 1 day
LIMIT 500
```

**Query 2 — Check anomalous domains for those DIDs:**
```sql
SELECT
  domain,
  total_shares,
  unique_sharers,
  volume_p_value,
  sample_dids
FROM default.url_overdispersion_results
WHERE is_anomaly = 1
  AND run_timestamp > now() - interval 1 day
  AND hasAny(sample_dids, ['did:plc:xxx...', 'did:plc:yyy...'])
LIMIT 50
```

**Notes:** Replace the DID array with results from Query 1. This cross-reference identifies bot networks participating in coordinated sharing campaigns — a high-confidence coordination signal.

---

## 26. Find Today's Largest Co-Sharing Clusters

**Purpose:** Overview of current URL co-sharing clusters ranked by size. Identifies the largest coordinated URL sharing groups.

**Preferred:** Use `cosharing_clusters` MCP tool with no params (defaults to yesterday, sorted by size).

**Direct SQL (single-table, no JOINs):**
```sql
SELECT cluster_id, member_count, total_weight, unique_urls,
       temporal_spread_hours, mean_posting_interval_seconds,
       evolution_type, sample_dids, sample_urls
FROM default.url_cosharing_clusters
WHERE run_date = yesterday()
ORDER BY member_count DESC
LIMIT 20
```

**Output:** Clusters ranked by member count. `temporal_spread_hours` and `mean_posting_interval_seconds` together indicate coordination tightness. Low `unique_urls` relative to `member_count` suggests content coordination.

---

## 27. Co-Sharing Pairs for a Specific DID

**Purpose:** Find which accounts co-share URLs with a target account on a given day.

**Preferred:** Use `cosharing_pairs` MCP tool with `did` parameter.

**Direct SQL:**
```sql
SELECT date, account_a, account_b, weight, shared_urls
FROM default.url_cosharing_pairs
WHERE (account_a = 'did:plc:xxx...' OR account_b = 'did:plc:xxx...')
  AND date = yesterday()
ORDER BY weight DESC
LIMIT 50
```

**Output:** Paired accounts ranked by co-share count. `shared_urls` shows the actual URLs they both shared.

**Notes:** Pairs are stored with `account_a < account_b`. Must check both columns. TTL 7 days.

---

## 28. Track Cluster Evolution Over Time

**Purpose:** Trace a cluster's history — births, continuations, merges, splits, and deaths across days.

**Preferred:** Use `cosharing_evolution` MCP tool with `cluster_id` parameter.

**Direct SQL (single-table):**
```sql
SELECT run_date, cluster_id, member_count, evolution_type,
       predecessor_cluster_ids, jaccard_score
FROM default.url_cosharing_clusters
WHERE cluster_id = '2026-03-20-0001'
   OR has(predecessor_cluster_ids, '2026-03-20-0001')
ORDER BY run_date
LIMIT 30
```

**Output:** Timeline of evolution events. `merge` and `split` events indicate network restructuring. `jaccard_score` shows membership overlap with predecessor.

---

## 29. Find Clusters Sharing a Specific URL

**Purpose:** Identify which co-sharing clusters are pushing a particular URL.

**Direct SQL (single-table, uses sample_urls):**
```sql
SELECT DISTINCT run_date, cluster_id, member_count, evolution_type
FROM default.url_cosharing_clusters
WHERE run_date >= today() - 7
  AND hasAny(sample_urls, ['https://example.com/target'])
ORDER BY run_date DESC
LIMIT 20
```

**Notes:** `sample_urls` only contains the first 10 URLs per cluster. For exhaustive URL search, query `url_cosharing_pairs` for the URL and cross-reference with membership. Use `cosharing_clusters` MCP tool with `did` parameter after identifying accounts from pairs.

---

## 30. Cross-Reference: Bot Accounts in Co-Sharing Clusters

**Purpose:** Find accounts flagged as bot-like (entropy) that also appear in co-sharing clusters. Requires two queries.

**Query 1 — Get bot-like account DIDs:**
```sql
SELECT DISTINCT user_id
FROM default.account_entropy_results
WHERE is_bot_like = 1
  AND run_timestamp > now() - interval 1 day
LIMIT 500
```

**Query 2 — Check cluster membership for those DIDs:**
```sql
SELECT did, cluster_id, run_date
FROM default.url_cosharing_membership
WHERE did IN ('did:plc:xxx...', 'did:plc:yyy...')
  AND run_date = yesterday()
LIMIT 100
```

**Notes:** Replace the DID list with results from Query 1. Bot accounts appearing in co-sharing clusters is a very high-confidence coordination signal — automated accounts participating in coordinated URL campaigns.

---

## Notes on Query Adaptation

These queries are templates. Adapt them by:

1. **Replacing filter values**: DID/handle, rule or model column name, time ranges
2. **Adjusting aggregation levels**: Use `GROUP BY` to slice data different ways
3. **Changing time windows**: `now() - interval 1 day` to `7 day`, `30 day`, etc.
4. **Adding filters**: Combine multiple WHERE conditions for more specific investigations
5. **Tuning LIMIT**: Start with 50-100, increase if needed for comprehensive analysis

Always start with a conservative LIMIT and expand if results are useful. Remember the 60-second timeout: overly broad queries will fail. Time-narrow and filter aggressively.
