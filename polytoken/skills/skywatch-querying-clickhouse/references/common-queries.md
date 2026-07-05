# Common Investigation Queries

This reference contains **wide-schema-safe** ClickHouse query patterns for Skywatch investigations.

`default.osprey_execution_results` is a wide event table: every row is one evaluated AT Protocol event. Only these columns are universal:

- `__action_id`
- `__timestamp`
- `__error_count`
- `__atproto_label`
- `__entity_label_mutations`
- `__verdicts`

Everything else is a dynamic PascalCase column emitted by deployed Osprey rules/models: identity fields such as `UserId` and `Handle`, text fields such as `PostTextCleaned`, model outputs such as `AccountAgeSeconds`, and rule outcomes such as `AltGovHandleRule` or `DigestRepostBotRule`.

There is no generic `did`, `handle`, `content`, `rule_name`, `matched`, `score`, `created_at`, `pds_host`, `event_type`, or `rule_category` column in `osprey_execution_results`.

All queries below are read-only and include `LIMIT`.

---

## 1. Discover the Live Wide Schema

### Full column list

```sql
SELECT name, type
FROM system.columns
WHERE database = 'default'
  AND table = 'osprey_execution_results'
ORDER BY name
LIMIT 1000
```

### Search candidate dynamic columns

```sql
SELECT name, type
FROM system.columns
WHERE database = 'default'
  AND table = 'osprey_execution_results'
  AND (name ILIKE '%Handle%'
       OR name ILIKE '%PostText%'
       OR name ILIKE '%AccountAge%'
       OR name ILIKE '%Rule')
ORDER BY name
LIMIT 200
```

Use this before every new query family. Dynamic columns change as rules deploy.

---

## 2. Recent Osprey Events

```sql
SELECT __action_id, __timestamp, __error_count, __verdicts
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 hour
ORDER BY __timestamp DESC
LIMIT 50
```

Use this to verify data flow using only universal columns.

---

## 3. Recent Events with Identity/Text Context

Confirm `UserId`, `Handle`, and `PostTextCleaned` exist first.

```sql
SELECT __timestamp, UserId, Handle, PostTextCleaned
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 hour
  AND UserId IS NOT NULL
ORDER BY __timestamp DESC
LIMIT 50
```

---

## 4. Events for a Specific DID

```sql
SELECT __timestamp, Handle, PostTextCleaned, AccountAgeSeconds, __verdicts
FROM default.osprey_execution_results
WHERE UserId = 'did:plc:xxxxxxxxxxxxxxxxxxxxxxxx'
  AND __timestamp > now() - interval 7 day
ORDER BY __timestamp DESC
LIMIT 100
```

Prefer DID over handle for stable account tracking. Confirm `UserId` is the DID-bearing dynamic column.

---

## 5. Events for a Specific Handle

```sql
SELECT __timestamp, UserId, PostTextCleaned, __verdicts
FROM default.osprey_execution_results
WHERE Handle = 'target.bsky.social'
  AND __timestamp > now() - interval 7 day
ORDER BY __timestamp DESC
LIMIT 100
```

Handles can change; resolve to DID when possible.

---

## 6. Accounts Triggering a Specific Rule

Confirm the concrete rule column exists. Rule outcome columns are usually nullable `UInt8`; `1` usually means matched.

```sql
SELECT UserId,
       Handle,
       count() AS hit_count,
       max(__timestamp) AS latest_hit
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND __timestamp > now() - interval 1 day
GROUP BY UserId, Handle
ORDER BY hit_count DESC
LIMIT 50
```

---

## 7. Raw Rows for a Rule Match

```sql
SELECT __timestamp, UserId, Handle, PostTextCleaned, AltGovHandleRule
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND __timestamp > now() - interval 1 day
ORDER BY __timestamp DESC
LIMIT 100
```

Use for manual review of what a rule is catching.

---

## 8. Rule Hit Volume Over Time

```sql
SELECT toStartOfHour(__timestamp) AS hour,
       count() AS total_events,
       countIf(AltGovHandleRule = 1) AS alt_gov_hits,
       uniqExactIf(UserId, AltGovHandleRule = 1) AS unique_accounts
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
GROUP BY hour
ORDER BY hour DESC
LIMIT 48
```

Use `toDate(__timestamp)` for daily buckets.

---

## 9. Multiple Rules Side-by-Side

```sql
SELECT toDate(__timestamp) AS day,
       countIf(AltGovHandleRule = 1) AS alt_gov_hits,
       countIf(DigestRepostBotRule = 1) AS digest_bot_hits,
       count() AS total_events
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
GROUP BY day
ORDER BY day DESC
LIMIT 14
```

Replace rule columns with real rule names from `system.columns`.

---

## 10. Content Similarity / Copypasta

Confirm the text column exists; `PostTextCleaned` is common for post-like events. `ngramDistance()` returns 0 for identical text and 1 for completely different text.

```sql
SELECT __timestamp,
       UserId,
       Handle,
       PostTextCleaned,
       ngramDistance(PostTextCleaned, 'target phrase') AS distance
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
  AND PostTextCleaned IS NOT NULL
  AND ngramDistance(PostTextCleaned, 'target phrase') < 0.4
ORDER BY distance ASC
LIMIT 50
```

Always time-filter and guard `PostTextCleaned IS NOT NULL`.

---

## 11. Most Common Exact Text for a Rule

```sql
SELECT PostTextCleaned,
       count() AS occurrences,
       uniqExact(UserId) AS unique_accounts
FROM default.osprey_execution_results
WHERE AltGovHandleRule = 1
  AND __timestamp > now() - interval 7 day
  AND PostTextCleaned IS NOT NULL
GROUP BY PostTextCleaned
ORDER BY occurrences DESC
LIMIT 50
```

High `occurrences` across many accounts suggests copy/paste coordination.

---

## 12. Dynamic Column Fill Rates

Dynamic columns are sparse. `NULL` usually means that model/rule did not apply to that event, not necessarily bad data.

```sql
SELECT count() AS total_rows,
       countIf(Handle IS NOT NULL) AS handle_filled,
       round(100.0 * countIf(Handle IS NOT NULL) / count(), 2) AS handle_fill_pct,
       countIf(AltGovHandleRule IS NOT NULL) AS rule_filled,
       round(100.0 * countIf(AltGovHandleRule IS NOT NULL) / count(), 2) AS rule_fill_pct
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 7 day
LIMIT 1
```

---

## 13. Evaluation Errors

```sql
SELECT __action_id, __timestamp, __error_count, __verdicts
FROM default.osprey_execution_results
WHERE __timestamp > now() - interval 1 day
  AND __error_count > 0
ORDER BY __timestamp DESC
LIMIT 100
```

---

## 14. Account Entropy: Bot-Like Accounts

```sql
SELECT user_id,
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

Use `hourly_flag = 1 OR interval_flag = 1` for a softer screen.

---

## 15. URL Overdispersion: Anomalous Domains

```sql
SELECT domain,
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

`sample_dids` can seed a follow-up Osprey wide-table query using `UserId`.

---

## 16. Cross-Reference Bot Accounts with Recent Osprey Events

```sql
WITH bots AS (
  SELECT DISTINCT user_id
  FROM default.account_entropy_results
  WHERE is_bot_like = 1
    AND run_timestamp > now() - interval 1 day
  LIMIT 500
)
SELECT __timestamp, UserId, Handle, PostTextCleaned
FROM default.osprey_execution_results
WHERE UserId IN (SELECT user_id FROM bots)
  AND __timestamp > now() - interval 1 day
ORDER BY __timestamp DESC
LIMIT 100
```

---

## 17. URL Co-Sharing Clusters

Prefer `mcp__skywatch-mcp__cosharing_clusters` for common lookups. Direct SQL:

```sql
SELECT cluster_id,
       member_count,
       total_weight,
       unique_urls,
       temporal_spread_hours,
       mean_posting_interval_seconds,
       evolution_type,
       sample_dids,
       sample_urls
FROM default.url_cosharing_clusters
WHERE run_date = yesterday()
ORDER BY member_count DESC
LIMIT 20
```

`url_cosharing_clusters` has historical retention; pair and membership tables have short TTL.

---

## 18. URL Co-Sharing Pairs for a DID

Prefer `mcp__skywatch-mcp__cosharing_pairs`. Direct SQL:

```sql
SELECT date, account_a, account_b, weight, shared_urls
FROM default.url_cosharing_pairs
WHERE (account_a = 'did:plc:xxxxxxxxxxxxxxxxxxxxxxxx'
       OR account_b = 'did:plc:xxxxxxxxxxxxxxxxxxxxxxxx')
  AND date >= today() - 7
ORDER BY date DESC, weight DESC
LIMIT 50
```

Pairs are stored with `account_a < account_b`; check both columns. TTL is about 7 days.

---

## 19. URL Cluster Membership for Known DIDs

```sql
SELECT run_date, cluster_id, did
FROM default.url_cosharing_membership
WHERE did IN ('did:plc:xxxxxxxxxxxxxxxxxxxxxxxx', 'did:plc:yyyyyyyyyyyyyyyyyyyyyyyy')
  AND run_date >= today() - 7
ORDER BY run_date DESC
LIMIT 100
```

Membership tables have short TTL.

---

## 20. Quote Co-Sharing Pairs

```sql
SELECT date, account_a, account_b, weight, shared_uris
FROM default.quote_cosharing_pairs
WHERE date >= today() - 7
ORDER BY date DESC, weight DESC
LIMIT 50
```

Quote co-sharing uses `shared_uris`, not URLs.

---

## 21. Quote Co-Sharing Clusters

```sql
SELECT run_date,
       cluster_id,
       member_count,
       unique_uris,
       evolution_type,
       sample_dids,
       sample_uris
FROM default.quote_cosharing_clusters
WHERE run_date >= today() - 7
ORDER BY run_date DESC, member_count DESC
LIMIT 50
```

---

## 22. Quote Overdispersion: Anomalous Quote Targets

```sql
SELECT quoted_uri,
       quoted_author_did,
       total_shares,
       unique_sharers,
       volume_p_value,
       density_p_value,
       sample_dids
FROM default.quote_overdispersion_results
WHERE is_anomaly = 1
  AND bucket_start > now() - interval 1 day
ORDER BY total_shares DESC
LIMIT 50
```

---

## 23. Cross-Reference Sidecar DIDs with Osprey Rule Hits

Replace the rule column with a discovered dynamic rule column.

```sql
WITH sidecar_dids AS (
  SELECT DISTINCT user_id AS did
  FROM default.account_entropy_results
  WHERE is_bot_like = 1
    AND run_timestamp > now() - interval 1 day
  LIMIT 500
)
SELECT UserId,
       Handle,
       countIf(AltGovHandleRule = 1) AS alt_gov_hits,
       max(__timestamp) AS latest_event
FROM default.osprey_execution_results
WHERE UserId IN (SELECT did FROM sidecar_dids)
  AND __timestamp > now() - interval 7 day
GROUP BY UserId, Handle
HAVING alt_gov_hits > 0
ORDER BY alt_gov_hits DESC
LIMIT 100
```

---

## Query Adaptation Rules

1. For `osprey_execution_results`, use `__timestamp`, not `created_at`.
2. Confirm dynamic PascalCase columns through `system.columns` before using them.
3. Do not invent generic flat columns (`did`, `handle`, `content`, `rule_name`, `matched`, `score`).
4. Treat dynamic-column `NULL` as sparse/non-applicable unless evidence shows otherwise.
5. Use `UserId`/`Handle`/`PostTextCleaned` only after confirming they exist in the live schema.
6. Keep all queries `SELECT`/`WITH` only and include `LIMIT`.
7. Use sidecar tables directly for their documented schemas; only the Osprey event table uses the wide dynamic schema.
