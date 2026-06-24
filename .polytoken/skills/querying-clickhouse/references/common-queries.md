# Common Investigation Queries

This reference provides 20 proven query patterns for investigating rule hits and account behavior on the Osprey platform. Use these as starting points for your own investigations.

---

## 1. All Rule Hits for a Specific DID

**Purpose:** Find every rule that matched for a particular account. Use when investigating a specific account's violations.

**SQL:**
```sql
SELECT
  rule_name,
  created_at,
  matched,
  score,
  content_hash
FROM default.osprey_execution_results
WHERE did = 'did:plc:xxx...'
  AND created_at > now() - interval 7 day
ORDER BY created_at DESC
LIMIT 100
```

**Output:** Rows are ordered newest-first. `matched = true` indicates actual rule matches. `score` shows the severity.

**Notes:** Replace `did:plc:xxx...` with the target DID. Adjust the time range (7 day) as needed. For very active accounts, reduce the time window to avoid hitting LIMIT.

---

## 2. All Rule Hits for a Specific Handle

**Purpose:** Find all rule hits for an account identified by handle (username). Similar to query 1, but using the human-readable handle.

**SQL:**
```sql
SELECT
  rule_name,
  created_at,
  matched,
  score,
  account_age_days,
  follower_count,
  post_count
FROM default.osprey_execution_results
WHERE handle = 'alice.bsky.social'
  AND created_at > now() - interval 7 day
ORDER BY created_at DESC
LIMIT 100
```

**Output:** Shows rule hits plus account metadata (age, followers, posts). Metadata helps assess account legitimacy.

**Notes:** Replace `alice.bsky.social` with the target handle. Handles can change; prefer DID for permanent account tracking.

---

## 3. Accounts Triggering a Specific Rule (Recent)

**Purpose:** Find all accounts that triggered a particular rule in the last N days. Use when a rule is firing too much or when investigating a specific violation type.

**SQL:**
```sql
SELECT
  did,
  handle,
  count() as hit_count,
  max(created_at) as latest_hit
FROM default.osprey_execution_results
WHERE rule_name = 'spam-bot-pattern'
  AND matched = true
  AND created_at > now() - interval 1 day
GROUP BY did, handle
ORDER BY hit_count DESC
LIMIT 50
```

**Output:** Aggregated view of accounts. `hit_count` shows how many times each account triggered the rule. `latest_hit` shows the most recent trigger.

**Notes:** Replace `spam-bot-pattern` with the rule name. Adjust time window (1 day) to match investigation scope.

---

## 4. Top Offenders by Total Rule Hits

**Purpose:** Identify accounts with the most rule matches across all rules. Useful for finding repeat violators.

**SQL:**
```sql
SELECT
  did,
  handle,
  count() as total_hits,
  count(DISTINCT rule_name) as unique_rules_triggered,
  max(created_at) as latest_hit
FROM default.osprey_execution_results
WHERE matched = true
  AND created_at > now() - interval 7 day
GROUP BY did, handle
ORDER BY total_hits DESC
LIMIT 100
```

**Output:** Ranked by total rule hits. `unique_rules_triggered` shows diversity of violations (1 rule vs. many rules).

**Notes:** Time window defaults to 7 days; adjust for longer-term analysis. High `unique_rules_triggered` suggests systematic abuse.

---

## 5. Rule Hit Volume by Hour (Last 24 Hours)

**Purpose:** Detect activity spikes or temporal patterns. Use when investigating coordinated or bot-like activity.

**SQL:**
```sql
SELECT
  toStartOfHour(created_at) as hour,
  rule_name,
  count() as hits,
  count(DISTINCT did) as unique_accounts
FROM default.osprey_execution_results
WHERE created_at > now() - interval 1 day
  AND matched = true
GROUP BY hour, rule_name
ORDER BY hour DESC
LIMIT 100
```

**Output:** Rows grouped by hour. Shows both total hits and unique accounts per hour, revealing spikes and concentration.

**Notes:** Use `toStartOfDay()` for daily buckets, `toStartOfWeek()` for weekly. Adjust time range as needed.

---

## 6. Activity Timeline for a Specific Account

**Purpose:** See when an account was active and what rules it triggered. Useful for temporal correlation with external events.

**SQL:**
```sql
SELECT
  toStartOfDay(created_at) as day,
  rule_name,
  count() as hits,
  avg(score) as avg_score
FROM default.osprey_execution_results
WHERE did = 'did:plc:xxx...'
  AND created_at > now() - interval 30 day
GROUP BY day, rule_name
ORDER BY day DESC
LIMIT 100
```

**Output:** Daily aggregation showing when the account was most active and which rules triggered. Patterns suggest activity cycles.

**Notes:** Replace DID. For very active accounts, reduce time range. This query reveals whether activity is consistent or episodic.

---

## 7. Burst Detection (High-Frequency Activity)

**Purpose:** Find accounts posting at abnormally high frequency, which suggests bots or coordinated behavior.

**SQL:**
```sql
SELECT
  did,
  handle,
  toStartOfDay(created_at) as day,
  count() as daily_hits,
  count(DISTINCT toHour(created_at)) as hours_active
FROM default.osprey_execution_results
WHERE event_type = 'post'
  AND created_at > now() - interval 7 day
GROUP BY did, handle, day
HAVING daily_hits > 50
ORDER BY daily_hits DESC
LIMIT 100
```

**Output:** Accounts with >50 hits/day. `hours_active` shows how spread the activity was (1 hour = concentrated burst; 24 hours = sustained).

**Notes:** Adjust the HAVING threshold (>50) based on network norms. Higher thresholds catch more extreme behavior.

---

## 8. Content Similarity Search (Copypasta Detection)

**Purpose:** Find posts similar to a target text (copypasta, mass-produced content, etc.). Uses n-gram distance.

**SQL:**
```sql
SELECT
  did,
  handle,
  content,
  created_at,
  ngramDistance(content, 'target content phrase') as similarity
FROM default.osprey_execution_results
WHERE created_at > now() - interval 1 day
  AND ngramDistance(content, 'target content phrase') < 0.5
ORDER BY similarity ASC
LIMIT 50
```

**Output:** Ranked by similarity (lower = more similar). `similarity` is a score from 0 (identical) to 1 (completely different).

**Notes:** Replace `target content phrase` with actual text. The threshold (<0.5) can be adjusted: 0.3 for near-exact matches, 0.5-0.7 for loose similarity. Time-narrow for performance.

---

## 9. Most Common Content Pattern for a Rule

**Purpose:** Identify what content most commonly triggers a rule. Useful for understanding false positives or rule precision.

**SQL:**
```sql
SELECT
  content,
  count() as occurrences,
  count(DISTINCT did) as unique_accounts,
  avg(score) as avg_score
FROM default.osprey_execution_results
WHERE rule_name = 'hate-speech-detector'
  AND matched = true
  AND created_at > now() - interval 7 day
GROUP BY content
ORDER BY occurrences DESC
LIMIT 50
```

**Output:** Content ranked by frequency. Shows exact text strings and how many accounts posted them.

**Notes:** Replace rule name. For high-frequency content (retweets, etc.), this reveals coordinated behavior. For low-frequency, helps identify novel patterns.

---

## 10. Content Clustering by Similarity

**Purpose:** Group similar content together to identify thematic patterns or coordinated messaging.

**SQL:**
```sql
SELECT
  rule_name,
  content,
  count() as count,
  count(DISTINCT did) as unique_accounts
FROM default.osprey_execution_results
WHERE rule_name = 'spam-promotion'
  AND matched = true
  AND created_at > now() - interval 1 day
  AND length(content) > 50
GROUP BY rule_name, content
HAVING count > 2
ORDER BY count DESC
LIMIT 100
```

**Output:** Grouped by exact content. HAVING filter (>2 occurrences) shows duplicated/clustered messages only.

**Notes:** Adjust `length(content) > 50` to filter by message length. Small HAVING thresholds (>1) reveal even minor duplication.

---

## 11. Accounts Sharing the Same PDS Host

**Purpose:** Identify accounts on the same Personal Data Server. Can reveal coordinated networks (same provider used for bot armies).

**SQL:**
```sql
SELECT
  pds_host,
  count(DISTINCT did) as unique_accounts,
  count() as total_hits,
  avg(account_age_days) as avg_age_days
FROM default.osprey_execution_results
WHERE matched = true
  AND created_at > now() - interval 7 day
GROUP BY pds_host
ORDER BY unique_accounts DESC
LIMIT 50
```

**Output:** Ranked by account count per host. `avg_age_days` shows if this host is favoured by new accounts (indicator of bot networks).

**Notes:** PDS hosts like `bsky.social`, `mostr.pub`, etc. High concentrations on non-mainstream hosts are suspicious.

---

## 12. New Account Rule Triggers by Day

**Purpose:** Detect potential bot armies or coordinated account creation campaigns by tracking when new accounts trigger rules.

**SQL:**
```sql
SELECT
  toStartOfDay(created_at) as day,
  count(DISTINCT did) as new_accounts_triggered,
  count() as rule_hits
FROM default.osprey_execution_results
WHERE account_age_days < 7
  AND created_at > now() - interval 30 day
GROUP BY day
ORDER BY new_accounts_triggered DESC
LIMIT 50
```

**Output:** Days when new accounts triggered rules. Spikes indicate coordinated creation campaigns or waves of bot activity.

**Notes:** Adjust `account_age_days < 7` to control age window (e.g., `< 1` for accounts created today). High spikes of new accounts triggering rules in the same day suggest coordinated activity.

---

## 13. Cross-Signal Correlation (Same Content + PDS + Time)

**Purpose:** Identify highly coordinated activity by correlating multiple signals: same content, same PDS, similar timestamps.

**SQL:**
```sql
SELECT
  content_hash,
  pds_host,
  toStartOfHour(created_at) as hour,
  count(DISTINCT did) as unique_accounts,
  count() as total_hits
FROM default.osprey_execution_results
WHERE content_hash IS NOT NULL
  AND created_at > now() - interval 1 day
  AND matched = true
GROUP BY content_hash, pds_host, hour
HAVING unique_accounts > 3
ORDER BY unique_accounts DESC
LIMIT 100
```

**Output:** Clusters of identical or very similar content from the same PDS in the same hour window.

**Notes:** HAVING filter (>3 accounts) identifies suspicious coordination. Adjust threshold to sensitivity.

---

## 14. Hit Rate and Coverage per Rule

**Purpose:** Understand how often each rule fires and how much of the network it covers. Informs rule tuning and prioritization.

**SQL:**
```sql
SELECT
  rule_name,
  count() as total_evaluations,
  countIf(matched = true) as matches,
  round(100.0 * countIf(matched = true) / count(), 2) as match_rate,
  count(DISTINCT did) as unique_accounts_hit,
  avg(score) as avg_score
FROM default.osprey_execution_results
WHERE created_at > now() - interval 7 day
GROUP BY rule_name
ORDER BY match_rate DESC
LIMIT 50
```

**Output:** Rules ranked by match rate (%). Shows how selective each rule is and how many accounts it affects.

**Notes:** Rules with high match rates (20%+) may be too permissive. Rules with very low rates (<1%) may be too strict.

---

## 15. False Positive Candidates (Rule Hits on Established Accounts)

**Purpose:** Identify accounts that are old and established (high follower count, many posts) but still trigger rules. These are likely false positives.

**SQL:**
```sql
SELECT
  did,
  handle,
  rule_name,
  account_age_days,
  follower_count,
  post_count,
  created_at,
  score
FROM default.osprey_execution_results
WHERE matched = true
  AND account_age_days > 365
  AND follower_count > 1000
  AND post_count > 1000
  AND created_at > now() - interval 7 day
ORDER BY follower_count DESC
LIMIT 100
```

**Output:** Rule hits on old, popular accounts. High follower/post counts suggest legitimate users, making rule matches suspicious.

**Notes:** Adjust thresholds (`account_age_days > 365`, `follower_count > 1000`) based on your network. Results here should be reviewed manually.

---

## 16. New Rule Coverage Analysis

**Purpose:** See how a newly deployed rule is performing and what it's catching.

**SQL:**
```sql
SELECT
  rule_name,
  matched,
  count() as hits,
  count(DISTINCT did) as unique_accounts,
  min(created_at) as first_hit,
  max(created_at) as latest_hit,
  avg(score) as avg_score,
  quantile(0.95)(score) as p95_score
FROM default.osprey_execution_results
WHERE rule_name IN ('new-rule-v1', 'new-rule-v2')
GROUP BY rule_name, matched
ORDER BY rule_name, matched DESC
LIMIT 50
```

**Output:** Coverage stats for new rules. `quantile(0.95)(score)` shows the 95th percentile score (helps tune thresholds).

**Notes:** Use for monitoring newly deployed rules during their first week. Adjust rule names as needed.

---

## 17. Rule Sensitivity Analysis (Score Distribution)

**Purpose:** Analyze the distribution of scores for a rule to inform threshold tuning.

**SQL:**
```sql
SELECT
  rule_name,
  count() as total,
  min(score) as min_score,
  quantile(0.25)(score) as p25,
  quantile(0.50)(score) as p50_median,
  quantile(0.75)(score) as p75,
  max(score) as max_score,
  avg(score) as avg_score,
  stddevPop(score) as std_dev
FROM default.osprey_execution_results
WHERE created_at > now() - interval 7 day
GROUP BY rule_name
LIMIT 100
```

**Output:** Score distribution (quartiles, mean, std dev). Helps identify whether scores cluster or spread widely.

**Notes:** Rules with bimodal distributions (gaps in quartiles) may have two distinct populations (true positives vs. false positives).

---

## 18. Event Type Distribution (Content Types Evaluated)

**Purpose:** Understand what types of content the Osprey platform evaluates. Useful for rule scope validation.

**SQL:**
```sql
SELECT
  event_type,
  rule_category,
  count() as evaluations,
  countIf(matched = true) as matches,
  count(DISTINCT rule_name) as unique_rules
FROM default.osprey_execution_results
WHERE created_at > now() - interval 7 day
GROUP BY event_type, rule_category
ORDER BY evaluations DESC
LIMIT 50
```

**Output:** Breakdown of evaluated content types (post, profile, follow, etc.) and which rule categories match them.

**Notes:** Helps confirm that rules are being applied to the intended content types.

---

## 19. Recent Query Diagnostics (Last 100 Evaluations)

**Purpose:** Quick diagnostic to spot unusual recent activity or rule behavior anomalies.

**SQL:**
```sql
SELECT
  created_at,
  rule_name,
  did,
  handle,
  matched,
  score,
  event_type
FROM default.osprey_execution_results
WHERE created_at > now() - interval 1 hour
ORDER BY created_at DESC
LIMIT 100
```

**Output:** Raw recent evaluations. Use for real-time monitoring and quick sanity checks.

**Notes:** Useful for verifying that rules are running and data is flowing. Check if expected rules appear.

---

## 20. Query Metadata Completeness Check

**Purpose:** Validate data quality by checking for NULL values in critical columns.

**SQL:**
```sql
SELECT
  countIf(created_at IS NULL) as created_at_nulls,
  countIf(did IS NULL) as did_nulls,
  countIf(rule_name IS NULL) as rule_name_nulls,
  countIf(matched IS NULL) as matched_nulls,
  count() as total_rows
FROM default.osprey_execution_results
WHERE created_at > now() - interval 7 day
LIMIT 1
```

**Output:** NULL value counts per critical column plus total row count. High NULLs indicate data quality issues.

**Notes:** Run periodically to monitor data integrity. NULLs in `did`, `rule_name`, or `matched` suggest upstream problems.

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

1. **Replacing filter values**: DID, handle, rule name, time ranges
2. **Adjusting aggregation levels**: Use `GROUP BY` to slice data different ways
3. **Changing time windows**: `now() - interval 1 day` to `7 day`, `30 day`, etc.
4. **Adding filters**: Combine multiple WHERE conditions for more specific investigations
5. **Tuning LIMIT**: Start with 50-100, increase if needed for comprehensive analysis

Always start with a conservative LIMIT and expand if results are useful. Remember the 60-second timeout: overly broad queries will fail. Time-narrow and filter aggressively.
