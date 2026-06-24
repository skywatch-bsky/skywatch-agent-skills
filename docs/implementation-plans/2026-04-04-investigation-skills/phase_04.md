# Investigation Skills Implementation Plan — Phase 4: classify-cluster

**Goal:** Create the classify-cluster skill that turns cosharing cluster membership into an actionable narrative brief — what the cluster is pushing, where it's coming from, and confidence it's an operation vs organic coordination.

**Architecture:** A SKILL.md methodology document following existing plugin conventions. Defines multi-round data collection (cluster metadata + member content), classification schema with explicit IO/organic distinction, and "cluster at a glance" output format. No SQL, no code.

**Tech Stack:** Markdown (SKILL.md), YAML frontmatter. Integrates with existing cosharing MCP tools and data-analyst delegation.

**Scope:** Phase 4 of 5 from original design.

**Codebase verified:** 2026-04-04

---

## Acceptance Criteria Coverage

This phase implements and tests:

### investigation-skills.AC4: Cluster Classification
- **investigation-skills.AC4.1 Success:** Given a cluster ID or set of DIDs, classify-cluster produces narrative analysis with dominant_narratives, coordination_signals, and likely_origin
- **investigation-skills.AC4.2 Success:** Classification distinguishes IO from organic coordination (coordination != inauthentic)
- **investigation-skills.AC4.3 Success:** Output includes "cluster at a glance" summary (size, age range, language mix, dominant narrative, confidence)
- **investigation-skills.AC4.4 Success:** Shared sources (domains/URLs) are identified across cluster members
- **investigation-skills.AC4.5 Edge:** Cluster with single member or very small membership produces assessment with low confidence flag

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->
### Task 1: Create classify-cluster skill directory and SKILL.md scaffold

**Verifies:** None (infrastructure)

**Files:**
- Create: `plugins/skywatch-investigations/skills/classify-cluster/SKILL.md`

**Step 1: Create the skill file with frontmatter and introduction**

Create `plugins/skywatch-investigations/skills/classify-cluster/SKILL.md` with:

```markdown
---
name: classify-cluster
description: >-
  Narrative classification of co-sharing clusters on AT Protocol. Analyses cluster
  member content, identifies dominant narratives, coordination signals, shared
  sources, and likely origin. Distinguishes information operations from organic
  coordination. Use when a co-sharing cluster is identified during Phase 3
  (Linkage) or Phase 4 (Amplification), or as a standalone cluster assessment.
user-invocable: false
---

# Classify Cluster

This skill guides narrative classification of co-sharing clusters — groups of accounts identified as sharing the same URLs or quoting the same posts in coordinated patterns. The goal is to determine what the cluster is pushing, how coordinated it is, and whether the coordination is authentic (shared interest) or inauthentic (information operation).

**Coordination does not equal inauthenticity.** Accounts sharing URLs about a niche hobby, a local news event, or a shared professional interest will form clusters. The classification must distinguish genuine shared interest from manufactured coordination. This skill provides the framework for that distinction.
```

**Step 2: Verify**

Run: `ls -la plugins/skywatch-investigations/skills/classify-cluster/SKILL.md`
Expected: File exists.

**Step 3: Commit**

```bash
git add plugins/skywatch-investigations/skills/classify-cluster/SKILL.md
git commit -m "feat: scaffold classify-cluster skill with frontmatter"
```
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Write Data Collection section

**Verifies:** investigation-skills.AC4.1 (data collection for narrative analysis), investigation-skills.AC4.4 (shared source identification), investigation-skills.AC4.5 (small cluster handling)

**Files:**
- Modify: `plugins/skywatch-investigations/skills/classify-cluster/SKILL.md`

**Implementation:**

Append the following after the introduction:

```markdown

## Input

The skill accepts either:
- **Cluster ID**: A co-sharing cluster identifier (from `cosharing_clusters` tool output)
- **Set of DIDs**: A list of accounts to analyse as a group (when cluster ID is not available)

## Phase 1: Data Collection

Data collection happens in two rounds — first cluster-level metadata, then member-level content.

### Round 1: Cluster Metadata

#### 1a. Cluster Membership

**If cluster ID provided:** Use `cosharing_clusters` MCP tool directly with the cluster_id to get: member DIDs, cluster size, evolution type, and cluster metrics.

**If DIDs provided:** Use `cosharing_clusters` MCP tool with each DID to check if they share a common cluster. If they do, use the cluster ID for further analysis. If not, proceed with the DID list as an ad-hoc group.

#### 1b. Cluster Evolution

**Use `cosharing_evolution` MCP tool** with the cluster ID to get: cluster birth date, merge/split history, size over time. This reveals whether the cluster is stable, growing, or fragmenting.

#### 1c. Co-sharing Pairs

**Use `cosharing_pairs` MCP tool** for each member DID (or a sample of 10 if cluster is large). This returns the actual URLs shared between account pairs — the raw evidence of what's being coordinated.

#### Small Cluster Check

If the cluster has 1 member or fewer than 3 members:
1. Proceed with data collection but flag: "Small cluster — classification confidence will be low."
2. In the output, set confidence to `low` regardless of signal strength.

### Round 2: Member Content

#### 2a. Member Content Sample

**Dispatch to data-analyst:**
"For these DIDs: [member list, or top 20 members if cluster is large], sample the 30 most recent posts per account from osprey_execution_results. Return: author DID, content, timestamp, rules matched."

#### 2b. Member Entropy

**Dispatch to data-analyst:**
"Query account_entropy_results for these DIDs: [member list]. Return: DID, hourly_entropy, interval_entropy, is_bot_like."

#### 2c. Member Account Age

**Dispatch to data-analyst:**
"For these DIDs: [member list], find the earliest post timestamp in osprey_execution_results as a proxy for account age. Return: DID, earliest_post, days_active."

#### 2d. Shared Domains

**Dispatch to data-analyst:**
"From the co-sharing pairs data, extract all unique domains/URLs shared across cluster members. Group by domain and show: domain, number of members sharing it, total share count, and whether it appears in url_overdispersion_results."
```

**Step 2: Verify**

Run: `wc -l plugins/skywatch-investigations/skills/classify-cluster/SKILL.md`
Expected: Approximately 80-100 lines.

**Step 3: Commit**

```bash
git add plugins/skywatch-investigations/skills/classify-cluster/SKILL.md
git commit -m "feat: add data collection section to classify-cluster skill"
```
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Write Classification and Output sections

**Verifies:** investigation-skills.AC4.1 (dominant_narratives, coordination_signals, likely_origin), investigation-skills.AC4.2 (IO vs organic distinction), investigation-skills.AC4.3 ("cluster at a glance" summary), investigation-skills.AC4.4 (shared sources in output), investigation-skills.AC4.5 (low confidence for small clusters)

**Files:**
- Modify: `plugins/skywatch-investigations/skills/classify-cluster/SKILL.md`

**Implementation:**

Append the following after the Data Collection section:

```markdown

## Phase 2: Classification

### Classification Schema

| Field | Type | Description |
|-------|------|-------------|
| `dominant_narratives` | list of {narrative, prevalence} | Top narratives pushed by cluster members, with % of members participating |
| `coordination_signals` | list | Evidence of coordination beyond URL sharing (see Signal Catalogue) |
| `language_distribution` | map | Language -> % of cluster content |
| `shared_sources` | list of {domain, member_count, total_shares, is_anomalous} | Domains/URLs shared across members |
| `likely_origin` | enum | `io_suspected`, `spam_network`, `organic_interest`, `mixed`, `undetermined` |
| `confidence` | enum | `high`, `medium`, `low` |
| `member_roles` | map | DID -> role (e.g., `amplifier`, `content_creator`, `bridge_account`) |

### Signal Catalogue

#### IO Indicators
- **Single narrative dominance**: 70%+ of cluster content focused on one political or social narrative
- **High content similarity**: Posts across members use similar or identical phrasing (check via `content_similarity` tool)
- **Temporal clustering**: Members post within narrow time windows of each other
- **State-aligned sources**: Shared domains associated with state media, government outlets, or known propaganda sources
- **Bot-like entropy**: Multiple members flagged as bot-like (is_bot_like = true)
- **New accounts**: Majority of members created recently (< 3 months of activity)
- **Uniform behaviour**: Members show similar posting patterns (same hours, same frequency, same content types)

#### Spam Indicators
- **Commercial URLs**: Shared domains are commercial products, affiliate links, or ad-heavy sites
- **Affiliate patterns**: URLs contain tracking parameters, referral codes, or affiliate identifiers
- **Template content**: Posts are templated with variable substitution (same structure, different product names)

#### Organic Indicators
- **Varied topics within theme**: Members share a general interest (e.g., climate science) but post about different specific aspects
- **Genuine engagement**: Members reply to each other, have varied follower/following ratios, post original commentary alongside shared links
- **Established accounts**: Majority of members have 6+ months of activity with consistent but varied posting
- **Diverse sources**: Shared domains come from multiple independent outlets, not concentrated on a few
- **Natural temporal spread**: Posts are spread across normal waking hours with no suspicious clustering

### Distinguishing IO from Organic Coordination

This is the critical analytical step. Apply these questions in order:

1. **Narrative diversity test**: Does the cluster share a range of perspectives on their topic, or a single uniform message? Genuine interest groups disagree and discuss; IO pushes one line.
2. **Source diversity test**: Are shared URLs from diverse, independent outlets, or concentrated on a few (especially state-aligned) sources?
3. **Account authenticity test**: Do member accounts have histories, varied interests, and natural posting patterns? Or are they young, single-topic, bot-like?
4. **Temporal pattern test**: Do members post in response to real events (natural spikes), or in regular coordinated bursts regardless of external triggers?

### Member Role Assignment

For clusters classified as IO or spam, assign roles to members:
- **content_creator**: Originates posts that others amplify
- **amplifier**: Primarily reposts/quotes content from creators
- **bridge_account**: Connects this cluster to other clusters or broader audiences

## Phase 3: Output

### Default: Structured Classification

```
## Cluster Classification: [cluster_id or "ad-hoc group"]

### Cluster at a Glance
| Metric | Value |
|--------|-------|
| Size | [N] members |
| Age Range | [oldest] to [newest] account |
| Language Mix | [primary language] ([%]), [secondary] ([%]) |
| Dominant Narrative | [one-line summary] |
| Classification | [likely_origin] ([confidence] confidence) |

### Dominant Narratives

| Narrative | Prevalence | Example |
|-----------|-----------|---------|
| [narrative summary] | [%] of members | "[example post excerpt]" |

### Coordination Signals
- [signal 1 — evidence]
- [signal 2 — evidence]

### Shared Sources

| Domain | Members Sharing | Total Shares | Anomalous |
|--------|----------------|-------------|-----------|
| [domain] | [n] | [n] | [yes/no] |

### Language Distribution
| Language | % |
|----------|---|
| [lang] | [%] |

### Member Roles (if IO/spam)

| Role | Count | Example DIDs |
|------|-------|-------------|
| content_creator | [n] | [DID1], [DID2] |
| amplifier | [n] | [DID1], [DID2] |
| bridge_account | [n] | [DID1] |

### Assessment
[2-3 sentence analytical summary explaining the classification, key evidence, and what distinguishes this cluster from the alternative classification (i.e., why IO and not organic, or vice versa)]
```

### On Request: B-I-N-D-Ts Report

When a full report is requested, load the `reporting-results` skill:

- **Bottom Line:** Cluster classification + confidence + key distinguishing evidence
- **Impact:** Cluster size, content volume, reach indicators, domains amplified
- **Next Steps:** Accounts to label, narratives to monitor, domains to block, rules to create
- **Details:** Full classification with member-by-member breakdown
- **Timestamps:** Cluster formation/evolution timeline, assessment timestamp

Select the **cell deep-dive** report type for single cluster analysis.
```

**Step 2: Verify**

Run: `wc -l plugins/skywatch-investigations/skills/classify-cluster/SKILL.md`
Expected: Approximately 180-220 lines total.

**Step 3: Commit**

```bash
git add plugins/skywatch-investigations/skills/classify-cluster/SKILL.md
git commit -m "feat: add classification and output sections to classify-cluster skill"
```
<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->
