---
name: assess-account
description: >-
  Structured account assessment for AT Protocol investigations. Replaces manual
  account profiling by defining data collection questions, classification schema,
  and output format. Produces account_type, confidence, signals, and recommendation.
  Use when profiling an account of interest during Phase 2 (Characterization) or
  as a standalone quick assessment.
user-invocable: false
---

# Assess Account

This skill guides structured assessment of AT Protocol accounts. It defines what data to collect, how to classify the account, and what output to produce. The result is a consistent, repeatable assessment that replaces ad-hoc manual profiling.

Use this skill when you need to determine what type of account you're looking at (genuine, policy violator, bot, IO, scam, spam) and what to do about it.

## Input

The skill accepts either a DID (`did:plc:...`) or a handle (`@user.bsky.social` or `user.bsky.social`). If a handle is provided, resolve it to a DID before proceeding — dispatch the data-analyst with: "Resolve this handle to a DID: [handle]". Use the resolved DID for all subsequent queries.

## Data Limitation: ClickHouse Window

ClickHouse (`osprey_execution_results`) retains approximately 2 months of data. This is a partial view of an account's history, NOT the complete picture. Thin or absent ClickHouse results mean the data hasn't been indexed — not that the account has no content. **Never conclude an account has "zero content," "no posts," or "nothing to evaluate" based solely on ClickHouse returning few or no results.** Always supplement with direct PDS record fetching when ClickHouse data is insufficient.

## Phase 1: Data Collection

Dispatch each of the following research questions to the data-analyst agent. Include the target DID and any relevant time constraints. The data-analyst formulates and executes the queries, returning results as markdown tables.

### 1. Rule Hit Profile

**Dispatch to data-analyst:**
"Find all rule hits for DID [target_did] over the past 90 days. Group by rule name and show: rule name, hit count, earliest hit, latest hit, and sample content (first 3 hits). Also show the total distinct rules triggered."

**What this reveals:** Which rules trigger on this account, how frequently, and over what time range. High-volume single-rule hits suggest targeted behaviour. Hits across many rules suggest broad problematic activity.

### 2. Posting Patterns

**Dispatch to data-analyst:**
"Show posting patterns for DID [target_did] over the past 30 days. Include: total post count, posts per day distribution, posting hours (UTC) distribution as a histogram, average inter-post interval, and day-of-week distribution."

**What this reveals:** Temporal regularity or irregularity. Bots post at consistent intervals; genuine accounts show natural variation. Around-the-clock posting without gaps suggests automation.

### 3. Entropy Analysis

**Dispatch to data-analyst:**
"Query account_entropy_results for DID [target_did]. Return: hourly_entropy, interval_entropy, is_bot_like flag, and the evaluation timestamp. If no results, state that explicitly."

**What this reveals:** Statistical measures of posting regularity. See Classification section for threshold interpretation.

### 4. Content Themes

**Dispatch to data-analyst:**
"Sample the 50 most recent posts from DID [target_did] from osprey_execution_results (use the content field). Return the post text, timestamp, and any rule that matched. Focus on distinct content — skip exact duplicates."

**Supplement with PDS records:** If ClickHouse returns fewer than 30 distinct posts, also fetch posts directly from the account's PDS using the `list_records` PDSX tool with collection `app.bsky.feed.post` and the target DID as `repo`. Paginate (limit 25, use cursor) to collect at least 50-100 posts. This captures the full account history beyond the ClickHouse ~2 month window.

Always record how many posts came from each source (ClickHouse vs PDS) in the assessment output. If the account's content is primarily outside the ClickHouse window, the PDS data is the primary evidence — not a fallback.

**What this reveals:** What the account talks about, content diversity, and whether posts are templated or varied.

### 5. Network Signals

**Dispatch to data-analyst:**
"Check if DID [target_did] appears in any URL co-sharing clusters. Return cluster IDs, cluster sizes, and evolution types. Also check quote co-sharing clusters (`quote_cosharing_membership` and `quote_cosharing_clusters`)."

Additionally, use the `cosharing_pairs` MCP tool directly to check raw co-sharing edges for the target DID.

**What this reveals:** Whether the account participates in coordinated URL or quote sharing networks. Quote co-sharing clusters detect pile-on and brigading via coordinated quoting; URL clusters detect coordinated link pushing.

### 6. Infrastructure

**Dispatch to data-analyst:**
"Query account metadata for DID [target_did]: account creation date, PDS host, and any signup anomaly flags from pds_signup_anomalies (check if the PDS host appears with anomalous signup rates around the account's creation date)."

Use `domain_check` directly on any unusual PDS hosts identified.

**What this reveals:** Account age, hosting infrastructure, and whether the account was created on a PDS with anomalous signup patterns (mass-registration signal).

### 7. Overdispersion Context

**Dispatch to data-analyst:**
"For DID [target_did], check url_overdispersion_results to see if any domains shared by this account are flagged as anomalous. Return the domain, is_anomaly flag, volume_p_value, density_p_value, and sample_dids if the target appears. Also check quote_overdispersion_results — does any post by this account appear as a quoted_author_did with anomalous quoting rates? Return quoted_uri, total_shares, unique_sharers, and is_anomaly."

**What this reveals:** Whether the account shares domains being pushed by coordinated networks (URL overdispersion), and whether the account's own posts are being targeted by coordinated quote-post campaigns (quote overdispersion).

### 8. Ozone Moderation History

Use `ozone_query_statuses` directly with the target DID to retrieve the account's current moderation status — existing labels, review state, tags, and any open reports.

Use `ozone_query_events` directly with the target DID to retrieve the moderation event log — prior labelling actions, escalations, appeals, comments from previous reviewers.

**What this reveals:** Whether the account has prior moderation history, what labels have been applied or removed, whether it's been reviewed before and what the outcome was. An account with repeated label-appeal cycles or multiple prior escalations has a different risk profile than one with no moderation history.

### 9. Protocol-Level Profile

Fetch the account's AT Protocol profile record directly. Use the `describe_repo` PDSX tool (or Slingshot `com.atproto.repo.getRecord` for `app.bsky.actor.profile/self`) to retrieve the current profile — display name, bio, avatar, banner.

If the account's handle is a custom domain (not `*.bsky.social`), use `whois_lookup` on the domain to check registration age, registrar, and privacy status.

**What this reveals:** Profile presentation, potential impersonation signals (copied bios/avatars), and whether a custom domain handle was recently registered or uses privacy protection (common in coordinated networks).

### Handling Missing Data

Some queries may return no results (new accounts, accounts with no rule hits, accounts not in entropy results). For non-content queries (entropy, overdispersion, co-sharing), this is expected — proceed with available data and flag gaps in the Classification phase.

However, **missing content data is different.** If ClickHouse returns few or no posts, you MUST fetch content from the PDS via `list_records` before proceeding. An account with minimal ClickHouse data but active posting history on its PDS is not a low-data account — it's an account whose data predates the indexing window. Treat PDS-sourced content with the same evidentiary weight as ClickHouse content (minus the rule-match metadata).

An account with minimal data from ALL sources (ClickHouse and PDS) produces a low-confidence assessment, not an error.

## Phase 2: Classification

### Load Policy Guidance

Check for a `.policies/` directory in the current working directory. Read all files within it — these contain label definitions, enforcement criteria, and policy guidance that inform classification decisions.

If `.policies/` also contains a `precedents/` subdirectory, read those files too. Precedents are prior analyst decisions on ambiguous cases that serve as case law for future classification.

Policy files may define:
- **Custom account types** — additional `account_type` values beyond the defaults below (e.g., `impersonation`, `csam`, `doxxing`). Add any custom types to the enum.
- **Custom signals** — additional entries for the Signal Catalogue. Integrate them under the appropriate category, or create a new category if the policy defines one.
- **Recommendation overrides** — policies may specify that certain account types or signal combinations require specific recommendations (e.g., "accounts matching [policy X] must be `label_and_escalate`"). These override the default recommendation mapping.
- **Policy-specific labels** — when a policy defines which Ozone label to apply for a given violation, record the label name alongside the recommendation.
- **Precedents** — prior analyst decisions on edge cases. Apply matching precedents to similar accounts rather than re-evaluating from scratch.

If no `.policies/` directory is found, proceed with the default schema below. Do not warn — the defaults are sufficient for general-purpose assessment.

Apply the following schema to the collected data, extended by any loaded policies. Every field must be populated — use "unknown" or "insufficient_data" when data is unavailable rather than guessing.

### Classification Schema

| Field | Type | Description |
|-------|------|-------------|
| `account_type` | enum | `genuine`, `policy_violator`, `bot`, `io_suspected`, `scam`, `spam`, `hybrid`, `insufficient_data`, plus any custom types from `.policies/` |
| `confidence` | enum | `high`, `medium`, `low` |
| `signals` | list | Evidence items supporting the classification (see Signal Catalogue below, extended by policy signals) |
| `topic_breakdown` | map | Topic -> percentage of content (e.g., `{"politics/elections": 70, "sports": 20, "other": 10}`) |
| `language_profile` | map | Language -> percentage (e.g., `{"en": 85, "pt": 15}`) |
| `narrative_alignment` | string | Summary of dominant narrative(s) the account pushes, or "varied/no dominant narrative" |
| `recommendation` | enum | `no_action`, `monitor`, `escalate`, `label`, `label_and_escalate` |
| `policy_basis` | string | Which policy from `.policies/` supports this classification, or "default schema" if no custom policy applies |

### Signal Catalogue

Classify by evaluating signals from each category. An account may exhibit signals from multiple categories — `hybrid` captures accounts showing mixed patterns.

#### Bot Signals
- **High hourly entropy** (>= 3.9): Posts are distributed too evenly across hours — genuine accounts have natural peaks and quiet periods
- **Low interval entropy** (<= 1.5): Time between posts is suspiciously regular — genuine accounts have variable intervals
- **is_bot_like flag**: Set by the entropy analysis pipeline when both thresholds are met
- **Templated content**: Posts follow repeating patterns with variable substitution (e.g., same structure, different URLs)
- **No engagement variation**: Consistent posting rate with no response to external events

#### IO (Information Operation) Signals
- **Single-topic concentration**: 70%+ of content focused on one political or social topic
- **Cluster membership**: Account belongs to a co-sharing cluster (URL or quote)
- **Narrative alignment**: Content pushes a consistent narrative across posts, especially if aligned with known state-linked messaging
- **Coordinated timing**: Posting times correlate with other accounts in the same cluster
- **New account + high activity**: Account created recently but posting at high volume on a single topic
- **State-aligned sources**: Shares domains associated with state media or known propaganda outlets

#### Scam Signals
- **Fundraising patterns**: Posts soliciting donations, cryptocurrency, or financial transactions
- **Urgency framing**: Language emphasising immediate action ("act now", "limited time", "don't miss out")
- **Impersonation indicators**: Profile mimics a known entity (similar handle, copied bio/avatar)
- **Suspicious URLs**: Shortened URLs, domains registered recently, or domains flagged by overdispersion analysis

#### Spam Signals
- **Commercial URLs**: Links to commercial products, affiliate marketing, or ad-heavy sites
- **Template repetition**: Same message posted repeatedly with minor variations
- **High volume, low engagement**: Many posts but minimal genuine interaction

#### Policy Violator Signals
- **Sustained rule hits**: Repeated rule triggers over weeks/months — not a one-off but a pattern of behaviour
- **Consistent violation type**: Rule hits concentrated on the same policy area (e.g., hate speech, harassment, dehumanisation)
- **Escalating severity**: Content that gets progressively worse over time, or shifts to evade prior moderation
- **Post-label recidivism**: Account continues the same violating behaviour after a prior label was applied or appealed
- **Targeted behaviour**: Pattern of directing violating content at specific users, groups, or communities
- **Otherwise authentic account**: Natural posting patterns, varied non-violating content, established history — the account is genuine, not automated or coordinated, but repeatedly breaks policy

**Note:** An account classified as `genuine` that triggers multiple Policy Violator signals should be reclassified as `policy_violator`. "Genuine" describes authenticity, not compliance. A real person can be a serial policy violator.

#### Genuine Signals
- **Varied topics**: Content spans multiple unrelated topics
- **Organic engagement**: Mix of original posts, replies, reposts with natural variation
- **Established account**: Account age > 6 months with consistent but varied activity
- **Natural temporal patterns**: Normal hourly entropy (< 3.9) and interval entropy (> 1.5)
- **Diverse sources**: Links to varied domains, not concentrated on a few

#### Moderation History Signals
- **Repeat offender**: Multiple prior labels applied, especially if the same label recurs after appeals
- **Label-appeal cycling**: Pattern of label → appeal → removal → re-offence indicates deliberate boundary-testing
- **Prior escalation**: Account was previously escalated, suggesting known problematic behaviour
- **Clean history**: No prior moderation events — account has no prior flags (weighs toward genuine, but does not guarantee it)
- **Quote-post target**: Account's posts are being quoted at anomalous rates (quote overdispersion), suggesting it is a target of coordinated amplification or pile-on

### Confidence Determination

| Confidence | Criteria |
|------------|----------|
| **high** | 3+ strong signals from one category, no contradicting signals from another |
| **medium** | 2+ signals from one category, or mixed signals that lean one direction |
| **low** | Fewer than 2 signals, contradicting signals across categories, or insufficient data |

### Recommendation Mapping

| account_type | Default Recommendation | Override Conditions |
|-------------|----------------------|-------------------|
| `genuine` | `no_action` | If in a co-sharing cluster: `monitor`. If rule hits show sustained policy violations: reclassify as `policy_violator` |
| `policy_violator` | `label` | If severe or sustained (3+ months of hits, or targeted harassment): `label_and_escalate` |
| `bot` | `label` | If high-volume + harmful content: `label_and_escalate` |
| `io_suspected` | `escalate` | If strong evidence (high confidence): `label_and_escalate` |
| `scam` | `label_and_escalate` | — |
| `spam` | `label` | If part of a network: `label_and_escalate` |
| `hybrid` | `monitor` | Escalate if any component is scam or IO |
| `insufficient_data` | `monitor` | — |

## Phase 3: Output

### Default: Structured Assessment

Present the assessment using this format:

```
## Account Assessment: [DID or handle]

**Account Type:** [account_type] ([confidence] confidence)
**Recommendation:** [recommendation]
**Policy Basis:** [policy_basis]

### Signals
- [signal 1 — brief evidence note]
- [signal 2 — brief evidence note]
- [signal 3 — brief evidence note]

### Topic Breakdown
| Topic | % |
|-------|---|
| [topic] | [%] |

### Language Profile
| Language | % |
|----------|---|
| [lang] | [%] |

### Narrative Alignment
[narrative_alignment summary]

### Data Gaps
[List any queries that returned no results and how they affected confidence]
```

### On Request: BLIND Report

When a full report is requested, load the `reporting-results` skill and produce a report using the structured assessment as source material:

- **Bottom Line:** Account type + confidence + recommendation in one sentence
- **Impact:** Posting volume, reach indicators, cluster membership, rule hit counts
- **Next Steps:** Specific actions based on recommendation (monitor, label with which label, escalate to whom)
- **Details:** Full evidence trail from all 9 data collection categories
- **Timestamps:** Data collection time range, assessment timestamp

Select the **memo** report type for individual account assessments. Use **cluster deep-dive** if the account is part of a larger network being investigated.
