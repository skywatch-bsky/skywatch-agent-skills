# Investigation Skills Implementation Plan — Phase 1: assess-account

**Goal:** Create the assess-account skill that replaces manual account profiling with a structured assessment workflow.

**Architecture:** A SKILL.md methodology document following existing plugin conventions (YAML frontmatter, 3-phase internal structure: Data Collection, Classification, Output). The skill describes what research questions to dispatch to the data-analyst agent, what classification schema to apply, and what output to produce. No SQL, no code — methodology only.

**Tech Stack:** Markdown (SKILL.md), YAML frontmatter. Integrates with existing MCP tools via data-analyst delegation.

**Scope:** Phase 1 of 5 from original design.

**Codebase verified:** 2026-04-04

---

## Acceptance Criteria Coverage

This phase implements and tests:

### investigation-skills.AC1: Account Assessment
- **investigation-skills.AC1.1 Success:** Given a DID, assess-account produces a structured assessment with account_type, confidence, signals, topic_breakdown, language_profile, and recommendation
- **investigation-skills.AC1.2 Success:** Given a handle (instead of DID), assess-account resolves to DID and produces the same assessment
- **investigation-skills.AC1.3 Success:** Assessment correctly identifies bot-like accounts using entropy thresholds (hourly_entropy >= 3.9, interval_entropy <= 1.5)
- **investigation-skills.AC1.4 Success:** Assessment identifies IO signals (single-topic concentration, cluster membership, narrative alignment)
- **investigation-skills.AC1.5 Success:** On request, full B-I-N-D-Ts report is produced following reporting-results conventions
- **investigation-skills.AC1.6 Edge:** Account with no rule hits or minimal history produces assessment with low confidence and "insufficient_data" signals

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->
### Task 1: Create assess-account skill directory structure

**Verifies:** None (infrastructure)

**Files:**
- Create: `plugins/skywatch-investigations/skills/assess-account/SKILL.md`

This task creates the SKILL.md file with YAML frontmatter and the top-level structure, following the exact conventions of existing skills (conducting-investigations, reporting-results, querying-clickhouse, accessing-osprey).

**Step 1: Create the skill directory and SKILL.md with frontmatter and introduction**

Create `plugins/skywatch-investigations/skills/assess-account/SKILL.md` with the following content:

```markdown
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

Use this skill when you need to determine what type of account you're looking at (genuine, bot, IO, scam, spam) and what to do about it.
```

**Step 2: Verify the file was created**

Run: `ls -la plugins/skywatch-investigations/skills/assess-account/SKILL.md`
Expected: File exists with non-zero size.

**Step 3: Commit**

```bash
git add plugins/skywatch-investigations/skills/assess-account/SKILL.md
git commit -m "feat: scaffold assess-account skill with frontmatter"
```
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Write Data Collection section

**Verifies:** investigation-skills.AC1.1 (defines the 7 query categories that produce the required assessment fields), investigation-skills.AC1.2 (handle resolution guidance), investigation-skills.AC1.6 (insufficient data handling)

**Files:**
- Modify: `plugins/skywatch-investigations/skills/assess-account/SKILL.md`

Append the Data Collection section after the introduction. This section defines the research questions to dispatch to the data-analyst agent. It does NOT contain SQL — the data-analyst formulates queries using the querying-clickhouse skill.

**Implementation:**

Append the following to the SKILL.md after the introduction paragraph:

```markdown

## Input

The skill accepts either a DID (`did:plc:...`) or a handle (`@user.bsky.social` or `user.bsky.social`). If a handle is provided, resolve it to a DID before proceeding — dispatch the data-analyst with: "Resolve this handle to a DID: [handle]". Use the resolved DID for all subsequent queries.

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

**What this reveals:** What the account talks about, content diversity, and whether posts are templated or varied.

### 5. Network Signals

**Dispatch to data-analyst:**
"Check if DID [target_did] appears in any URL co-sharing clusters. Return cluster IDs, cluster sizes, and evolution types. Also check quote co-sharing clusters."

Additionally, use the `cosharing_pairs` MCP tool directly to check raw co-sharing edges for the target DID.

**What this reveals:** Whether the account participates in coordinated URL or quote sharing networks.

### 6. Infrastructure

**Dispatch to data-analyst:**
"Query account metadata for DID [target_did]: account creation date, PDS host, and any signup anomaly flags from pds_signup_anomalies (check if the PDS host appears with anomalous signup rates)."

Use `domain_check` directly on any unusual PDS hosts identified.

**What this reveals:** Account age, hosting infrastructure, and whether the account was created on a PDS with anomalous signup patterns (mass-registration signal).

### 7. Engagement Context

**Dispatch to data-analyst:**
"For DID [target_did], check url_overdispersion_results to see if any domains shared by this account are flagged as anomalous. Return the domain, is_anomaly flag, and sample_dids if the target appears."

**What this reveals:** Whether the account shares domains that are being pushed by coordinated networks.

### Handling Missing Data

Some queries may return no results (new accounts, accounts with no rule hits, accounts not in entropy results). This is expected — proceed with available data and flag gaps in the Classification phase. An account with minimal data produces a low-confidence assessment, not an error.
```

**Step 2: Verify the file**

Run: `wc -l plugins/skywatch-investigations/skills/assess-account/SKILL.md`
Expected: File has grown substantially (approximately 80-100 lines total).

**Step 3: Commit**

```bash
git add plugins/skywatch-investigations/skills/assess-account/SKILL.md
git commit -m "feat: add data collection section to assess-account skill"
```
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Write Classification and Output sections

**Verifies:** investigation-skills.AC1.1 (structured assessment with all required fields), investigation-skills.AC1.3 (entropy threshold criteria), investigation-skills.AC1.4 (IO signal identification), investigation-skills.AC1.5 (B-I-N-D-Ts escalation), investigation-skills.AC1.6 (low confidence for insufficient data)

**Files:**
- Modify: `plugins/skywatch-investigations/skills/assess-account/SKILL.md`

Append the Classification and Output sections. Classification defines the schema and criteria the investigator applies to returned data. Output defines the structured assessment format and the escalation path to B-I-N-D-Ts reports.

**Implementation:**

Append the following after the Data Collection section:

```markdown

## Phase 2: Classification

Apply the following schema to the collected data. Every field must be populated — use "unknown" or "insufficient_data" when data is unavailable rather than guessing.

### Classification Schema

| Field | Type | Description |
|-------|------|-------------|
| `account_type` | enum | `genuine`, `bot`, `io_suspected`, `scam`, `spam`, `hybrid`, `insufficient_data` |
| `confidence` | enum | `high`, `medium`, `low` |
| `signals` | list | Evidence items supporting the classification (see Signal Catalogue below) |
| `topic_breakdown` | map | Topic -> percentage of content (e.g., `{"politics/elections": 70, "sports": 20, "other": 10}`) |
| `language_profile` | map | Language -> percentage (e.g., `{"en": 85, "pt": 15}`) |
| `narrative_alignment` | string | Summary of dominant narrative(s) the account pushes, or "varied/no dominant narrative" |
| `recommendation` | enum | `no_action`, `monitor`, `escalate`, `label`, `label_and_escalate` |

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
- **Urgency framing**: Language emphasizing immediate action ("act now", "limited time", "don't miss out")
- **Impersonation indicators**: Profile mimics a known entity (similar handle, copied bio/avatar)
- **Suspicious URLs**: Shortened URLs, domains registered recently, or domains flagged by overdispersion analysis

#### Spam Signals
- **Commercial URLs**: Links to commercial products, affiliate marketing, or ad-heavy sites
- **Template repetition**: Same message posted repeatedly with minor variations
- **High volume, low engagement**: Many posts but minimal genuine interaction

#### Genuine Signals
- **Varied topics**: Content spans multiple unrelated topics
- **Organic engagement**: Mix of original posts, replies, reposts with natural variation
- **Established account**: Account age > 6 months with consistent but varied activity
- **Natural temporal patterns**: Normal hourly entropy (< 3.9) and interval entropy (> 1.5)
- **Diverse sources**: Links to varied domains, not concentrated on a few

### Confidence Determination

| Confidence | Criteria |
|------------|----------|
| **high** | 3+ strong signals from one category, no contradicting signals from another |
| **medium** | 2+ signals from one category, or mixed signals that lean one direction |
| **low** | Fewer than 2 signals, contradicting signals across categories, or insufficient data |

### Recommendation Mapping

| account_type | Default Recommendation | Override Conditions |
|-------------|----------------------|-------------------|
| `genuine` | `no_action` | If in a co-sharing cluster: `monitor` |
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

### On Request: B-I-N-D-Ts Report

When a full report is requested, load the `reporting-results` skill and produce a report using the structured assessment as source material:

- **Bottom Line:** Account type + confidence + recommendation in one sentence
- **Impact:** Posting volume, reach indicators, cluster membership, rule hit counts
- **Next Steps:** Specific actions based on recommendation (monitor, label with which label, escalate to whom)
- **Details:** Full evidence trail from all 7 data collection categories
- **Timestamps:** Data collection time range, assessment timestamp

Select the **memo** report type for individual account assessments. Use **cell deep-dive** if the account is part of a larger network being investigated.
```

**Step 2: Verify the complete skill file**

Run: `wc -l plugins/skywatch-investigations/skills/assess-account/SKILL.md`
Expected: File is approximately 160-200 lines total.

Run: `head -5 plugins/skywatch-investigations/skills/assess-account/SKILL.md`
Expected: Shows YAML frontmatter starting with `---`.

**Step 3: Commit**

```bash
git add plugins/skywatch-investigations/skills/assess-account/SKILL.md
git commit -m "feat: add classification and output sections to assess-account skill"
```
<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->
