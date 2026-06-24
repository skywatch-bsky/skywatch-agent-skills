# Report Templates

Complete templates for each of the four investigation report types. Copy the appropriate template, fill in the bracketed sections, and remove placeholder text.

---

## Memo Template

Use this template for quick findings on single accounts or small issues without coordination evidence.

```markdown
# Investigation Report: [Brief descriptive title]

**Investigator:** [Your name]
**Investigation Date:** [YYYY-MM-DD]
**Report Type:** Memo
**Target(s):** [@account_name, ...]
**Status:** Complete
**Conclusion:** [One-line summary of finding]

---

## Bottom Line

[Single sentence: what was found and what it means. Example: "A compromised account is posting spam links; no coordination or broader network detected."]

## Impact

| Metric | Value |
|--------|-------|
| Accounts involved | [Count] |
| Posts analysed | [Count] |
| Time range | [Start date] to [End date] |
| Engagement (likes + reposts) | [Total] |
| Risk level | Low / Medium / High |
| Primary risk | [Spam / Harassment / Disinformation / etc.] |

## Next Steps

- [ ] [Recommended action 1 - e.g., apply label, monitor, escalate]
- [ ] [Recommended action 2]
- [ ] [Recommended action 3 if applicable]

## Details

### Account Profile: [@account_name]

**Account Metadata:**
- Created: [Date]
- PDS Host: [Host name]
- Post count (lifetime): [Number]
- Followers: [Number]
- Profile bio: "[Bio text]"

**Activity Pattern:**
- Posts per day: [Average]
- Posting times: [Distribution - e.g., 9am-5pm EST concentrated]
- Content themes: [List 2-3 main topics]

**Rule Hits:**
- Total hits: [Count]
- Rules triggered: [List rule names with hit counts]

### Evidence

**Most problematic posts:**
- [Post 1 - timestamp, content excerpt, rule hits]
- [Post 2 - timestamp, content excerpt, rule hits]

**Timeline:**
```
[Date] [Time] [Event - e.g., "First post", "Rule hit on post X", "Dormant period"]
```

**Data extraction query:**
```sql
[Include the ClickHouse query used to extract account data]
```

## Timestamps

- Investigation conducted: [Start date] to [Completion date]
- Data range analysed: [Earliest data point] to [Latest data point]
- Report authored: [Date report was written]
```

---

## Cluster Deep-Dive Template

Use this template for comprehensive analysis of a coordinated network (5+ accounts) through all 6 investigation phases.

```markdown
# Investigation Report: Cluster Deep-Dive — [Cluster identifier or case name]

**Investigator:** [Your name]
**Investigation Date:** [YYYY-MM-DD] (start) to [YYYY-MM-DD] (completion)
**Report Type:** Cluster Deep-Dive
**Target(s):** Coordinated network of [N] accounts
**Status:** Complete / Escalated
**Conclusion:** [One-line summary - coordination evidence, network purpose, risk level]

---

## Bottom Line

[Single sentence capturing the most significant finding. Example: "A coordinated network of 47 accounts is amplifying election disinformation with 75% rule coverage but significant reach through quote posts."]

## Impact

| Metric | Value |
|--------|-------|
| Accounts in network | [Count] |
| Primary targets | [Affected accounts / topics] |
| Total posts | [Count] |
| Total engagement | [Likes + reposts] |
| Estimated reach | [Impressions or followers reached] |
| Campaign duration | [Start date] to [End date] |
| Data range analysed | [Earliest to latest data point] |
| Risk level | Low / Medium / High |
| Primary harms | [List identified harms] |

## Network Summary

**Network Structure:**
- Total accounts: [Count]
- Primary cluster: [Count of tightly coordinated accounts]
- Secondary connections: [Count of loosely affiliated accounts]
- Shared infrastructure: [List any shared PDS hosts, domains, or ASNs]

**Account List:**
| Account | Type | Posts | Rule Hits | PDS Host | Created |
|---------|------|-------|-----------|----------|---------|
| [@account1] | [Bot/Account] | [Count] | [Count] | [Host] | [Date] |
| [@account2] | [Bot/Account] | [Count] | [Count] | [Host] | [Date] |
| [... continue for all accounts ...] | | | | | |

## Coordination Evidence

### Content Similarity

[Describe the degree of content overlap. Which accounts share content? Exact duplicates or paraphrased?]

**Example:**
```
All 47 accounts posted variations of:
"[Copied content theme/phrase]"
Exact matches: [Count] accounts
Paraphrased: [Count] accounts
Timestamp clustering: [Describe timing pattern - e.g., "All posts within 30 minutes of each other, 3x daily"]
```

### Infrastructure Correlation

[Describe shared infrastructure patterns found.]

**Example:**
```
| Signal | Value |
|--------|-------|
| Shared PDS host | pds.example.com ([Count] accounts) |
| Shared domain registrar | [Registrar name] |
| Shared ASN | [ASN number] ([Count] accounts) |
| Account creation clustering | [Describe timing - e.g., "All created 2025-11-01 to 2025-11-05"] |
```

### Temporal Correlation

[Describe posting synchronisation patterns.]

**Timeline excerpt:**
```
2026-02-15 [09:15] @account1: posts original content
2026-02-15 [09:22] @account2: posts identical content
2026-02-15 [09:45] @account3-20: repost content
2026-02-15 [10:30] Quote post amplification begins
[... continue pattern ...]
```

## Amplification Map

**Campaign Objective:** [Harassment / Propaganda / Viral marketing / Disinformation / etc.]

**Primary Targets:**
- Accounts: [List top 5 targeted accounts]
- Topics: [List main topics being amplified]
- Hashtags: [List hashtags used]

**Amplification Strategy:**
- Initial posting: [Which accounts typically post first?]
- Reposting: [How content spreads through network]
- Quote posting: [Which accounts amplify?]
- External linking: [Where links point, if applicable]

**Engagement Metrics:**
| Metric | Value |
|--------|-------|
| Most-shared post engagement | [Likes + reposts] |
| Average post engagement | [Per-account average] |
| Estimated reach | [Total impressions or followers reached] |

## Rule Coverage Analysis

**Coverage Summary:**
- Accounts caught by ≥1 rule: [Count] ([Percentage]%)
- Accounts missed by all rules: [Count] ([Percentage]%)
- Most effective rule: [Rule name] ([Count] hits)
- Least effective rule: [Rule name] ([Count] hits)

**Rule Hit Details:**
| Rule | Accounts Caught | Total Hits | % Coverage |
|------|-----------------|-----------|-----------|
| [Rule 1] | [N] | [M] | [X%] |
| [Rule 2] | [N] | [M] | [X%] |
| [... continue for all triggered rules ...] | | | |

**Detection Gaps:**
[Describe behaviour not caught by existing rules]

**Rule Recommendations:**
- [ ] Create new rule for [Behaviour pattern]
- [ ] Adjust threshold for [Rule name]
- [ ] Combine [Rule1] and [Rule2] for better precision

## Next Steps

- [ ] Apply `[label_name]` label to [Count] accounts
- [ ] Create/update detection rule: [Rule name and brief description]
- [ ] Escalate to [Team name] with findings
- [ ] Monitor for [Specific pattern] going forward
- [ ] [Any other recommended action]

## Details

### Full Account Metadata

[For each account, include:]

**@account_name**
- Account creation: [Date]
- PDS host: [Host]
- Post count (lifetime): [Number]
- Profile bio: "[Bio]"
- Post frequency: [Posts per day]
- Content themes: [Main topics posted]

### Evidence Tables

**Rule Hits by Account:**
```
[Generate ClickHouse result table]
```

**Timeline of Network Activity:**
```
[Full timeline of major events]
```

**Network Graph (ASCII or description):**
```
[Draw ASCII network graph or describe connections]

Example:
    [Account1] ──content──> [Account2-10] ──repost──> [Account11-30]
         |                                                    |
         └─────────────────shared PDS host──────────────────┘
```

### SQL Queries Used

**Query 1: Account rule hit history**
```sql
[Include ClickHouse query]
```

**Query 2: Content similarity analysis**
```sql
[Include ClickHouse query]
```

**Query 3: Temporal correlation**
```sql
[Include ClickHouse query]
```

**Query 4: Rule coverage analysis**
```sql
[Include ClickHouse query]
```

## Timestamps

- Phase 1 (Discovery): [Date]
- Phase 2 (Characterization): [Date]
- Phase 3 (Linkage): [Date]
- Phase 4 (Amplification): [Date]
- Phase 5 (Rule Validation): [Date]
- Phase 6 (Reporting): [Date]
- Investigation completed: [Date]
- Report authored: [Date]
- Last updated: [Date, if applicable]
```

---

## Cross-Cluster Template

Use this template to compare multiple coordinated networks and identify shared patterns or operators.

```markdown
# Investigation Report: Cross-Cluster Analysis — [Case name]

**Investigator:** [Your name]
**Investigation Date:** [YYYY-MM-DD]
**Report Type:** Cross-Cluster
**Target(s):** [Cluster names/identifiers being compared, e.g., "Cluster-2026-A, Cluster-2026-B, Cluster-2026-C"]
**Status:** Complete
**Conclusion:** [One-line summary of relationship - shared operator/infrastructure/tactics]

---

## Bottom Line

[Single sentence capturing cross-Cluster relationship. Example: "Three previously separate coordinated networks share infrastructure and posting tactics, suggesting a single operator or shared operational unit."]

## Impact

| Metric | Value |
|--------|-------|
| Total Clusters compared | [Count] |
| Total accounts across Clusters | [Count] |
| Shared infrastructure found | Yes / No |
| Shared tactics identified | Yes / No |
| Hypothesised relationship | [Shared operator / Shared platform / Shared purpose / etc.] |
| Aggregate campaign reach | [Estimated impressions] |
| Combined risk level | Low / Medium / High |

## Cluster Comparison Matrix

### Overview

| Cluster | Accounts | Shared PDS | Shared Domain | Shared ASN | Account Age | Campaign Duration | Primary Target |
|------|----------|-----------|---------------|-----------|------------|------------------|-----------------|
| [Cluster A] | [N] | [Yes/No] | [Yes/No] | [Yes/No] | [Date range] | [Dates] | [Target] |
| [Cluster B] | [N] | [Yes/No] | [Yes/No] | [Yes/No] | [Date range] | [Dates] | [Target] |
| [Cluster C] | [N] | [Yes/No] | [Yes/No] | [Yes/No] | [Date range] | [Dates] | [Target] |

### Detailed Comparison

**Cluster A:**
- Accounts: [List or count]
- PDS hosts: [List]
- Domains: [List]
- Creation date range: [Start] to [End]
- Primary content: [Description]

**Cluster B:**
- Accounts: [List or count]
- PDS hosts: [List]
- Domains: [List]
- Creation date range: [Start] to [End]
- Primary content: [Description]

**Cluster C:** [Repeat as needed]

## Shared Infrastructure Evidence

**Shared PDS Hosts:**
| PDS Host | Clusters | Account Count |
|----------|-------|--------------|
| [pds.example.com] | [Cluster A, Cluster B] | [N] |

**Shared Domains:**
| Domain | Registrar | Registrant | Clusters | First Seen |
|--------|-----------|-----------|-------|-----------|
| [example.com] | [Registrar] | [Name] | [Cluster A, Cluster B] | [Date] |

**Shared ASN Blocks:**
| ASN | Provider | Clusters | Account Count |
|-----|----------|-------|---------------|
| [ASN number] | [Provider] | [Cluster A, Cluster B, Cluster C] | [N] |

## Shared Tactics Analysis

**Content Themes:**
- [Common theme/phrase found across Clusters]
- [Another common element]

**Posting Patterns:**
- Time coordination: [e.g., "All clusters post within 2-hour windows on same schedule"]
- Frequency: [e.g., "3-5 posts per account daily across all clusters"]
- Content format: [e.g., "80% copypasta, 20% paraphrased"]

**Amplification Strategy:**
- [Describe similarities in how each cluster amplifies content]

**Target Overlap:**
- [Describe if clusters target same accounts/topics]

## Hypothesised Relationships

[Based on infrastructure and tactical overlap, describe the most likely relationships]

**Possibility 1: [Single operator controlling multiple clusters]**
- Evidence: [List supporting signals]
- Probability: [Low / Medium / High]

**Possibility 2: [Shared platform/infrastructure provider]**
- Evidence: [List supporting signals]
- Probability: [Low / Medium / High]

**Possibility 3: [Coordinated campaign across independent operators]**
- Evidence: [List supporting signals]
- Probability: [Low / Medium / High]

## Next Steps

- [ ] Apply coordination labels: [Label names] to all affected accounts
- [ ] Escalate to [Team name] with cross-cluster findings
- [ ] Create/update rule to detect [Shared tactic]
- [ ] Monitor for [Shared pattern] across network
- [ ] [Any other recommended action]

## Details

### Infrastructure Map

```
[ASCII diagram showing shared infrastructure connections]

Example:
Cluster A (30 accounts)  ──shared PDS──>  pds.example.com
    |                                        |
    └─────────shared registrar provider─────┘
                                             |
Cluster B (20 accounts)  ──shared domain───>  domain.example
```

### Cross-Cluster Data Tables

**Timeline of Cluster Campaigns:**
```
2026-02-01  Cluster A launches campaign
2026-02-05  Cluster B launches campaign (related topic)
2026-02-10  Coordinated amplification of shared target
2026-02-15  Cluster C appears with similar tactics
```

**Engagement Comparison:**
| Cluster | Total Engagement | Avg per Post | Primary Target Engagement |
|------|-----------------|--------------|-------------------------|
| [Cluster A] | [N] | [N] | [N] |
| [Cluster B] | [N] | [N] | [N] |
| [Cluster C] | [N] | [N] | [N] |

### SQL Queries Used

**Query 1: Shared PDS host analysis**
```sql
[Include ClickHouse query]
```

**Query 2: Domain correlation**
```sql
[Include ClickHouse query]
```

**Query 3: Temporal overlap analysis**
```sql
[Include ClickHouse query]
```

## Timestamps

- Cluster A investigation completed: [Date]
- Cluster B investigation completed: [Date]
- Cluster C investigation completed: [Date]
- Cross-cluster analysis started: [Date]
- Cross-cluster analysis completed: [Date]
- Report authored: [Date]
```

---

## Rule Check Template

Use this template for assessment of rule coverage against identified behaviour patterns and recommendation of rule improvements.

```markdown
# Investigation Report: Rule Check — [Rule type or case name]

**Investigator:** [Your name]
**Investigation Date:** [YYYY-MM-DD]
**Report Type:** Rule Check
**Reference(s):** [Link to related cluster or memo report if applicable]
**Status:** Complete
**Conclusion:** [Coverage percentage and primary gaps identified]

---

## Bottom Line

[Single sentence summarising coverage assessment. Example: "Rule coverage for copypasta detection is 65%, leaving 35% of accounts undetected; two new rules recommended to close detection gap."]

## Impact

| Metric | Value |
|--------|-------|
| Behaviour type analysed | [Description] |
| Accounts analysed | [Count] |
| Accounts caught by ≥1 rule | [Count] ([Percentage]%) |
| Accounts missed by all rules | [Count] ([Percentage]%) |
| Detection gap severity | Low / Medium / High |
| Recommended rule count | [Count] |
| Estimated impact of improvements | [Percentage point improvement] |

## Rule Coverage Summary

**Overall Coverage:** [X]% of problematic accounts caught

**Coverage by Rule:**
| Rule Name | Accounts Caught | Total Hits | % of Network |
|-----------|-----------------|-----------|-------------|
| [Rule 1] | [N] | [M] | [%] |
| [Rule 2] | [N] | [M] | [%] |
| [Rule 3] | [N] | [M] | [%] |
| **Total (unique accounts)** | [N] | [M] | [%] |

**Rule Effectiveness Matrix:**
| Rule | Precision | Recall | F1 Score | Notes |
|------|-----------|--------|----------|-------|
| [Rule 1] | [X%] | [Y%] | [Z] | [High false positives / Good specificity / etc.] |
| [Rule 2] | [X%] | [Y%] | [Z] | |

## Gap Analysis

**Missed Behaviour:**
[Describe the [Percentage]% of accounts not caught by any rule]

**Example patterns:**
- [Pattern 1: Description of behaviour not caught]
  - Example accounts: [@acc1, @acc2, @acc3]
  - Why missed: [Describe why current rules don't catch this]

- [Pattern 2: Description]
  - Example accounts: [@acc4, @acc5, @acc6]
  - Why missed: [Describe why current rules don't catch this]

**Root causes of gaps:**
- [Gap cause 1 - e.g., threshold too high, rule logic incomplete]
- [Gap cause 2]
- [Gap cause 3 if applicable]

## Rule Recommendations

### Recommended New Rules

**Rule: [New rule name]**
- Behaviour detected: [What does this rule catch?]
- Suggested implementation: [High-level description of rule logic]
- Expected coverage: [Estimated number of accounts this would catch]
- Expected precision: [Estimated true positive rate]
- Priority: High / Medium / Low

**Rule: [Another new rule]**
- [Repeat structure]

### Recommended Improvements to Existing Rules

**Rule: [Existing rule name]**
- Current coverage: [X accounts, Y%]
- Issue: [What's missing or wrong?]
- Recommended change: [Adjust threshold / Add condition / etc.]
- Expected improvement: [Estimated new coverage]

## Testing Recommendations

**Before deployment:**
- [ ] Test rule [Name] on historical data (past 30 days)
- [ ] Verify precision on known-good accounts (false positive rate)
- [ ] Calculate recall on gap examples (does it catch missed accounts?)
- [ ] Review rule performance with moderation team

**Monitoring after deployment:**
- [ ] Track rule hit rate in first week
- [ ] Review false positive samples
- [ ] Adjust thresholds if needed
- [ ] Document performance metrics

## Next Steps

- [ ] Code review: [Rule names]
- [ ] Test on historical data: [Rule names]
- [ ] Deploy rule: [Rule names]
- [ ] Monitor performance for [timeframe]
- [ ] Conduct follow-up analysis after [Date]

## Details

### Full Rule Performance Data

**Query: Rule coverage by account**
```sql
[Include ClickHouse query used to assess coverage]
```

**Results:**
[Full results table]

**Query: Gap analysis — accounts missed by all rules**
```sql
[Include ClickHouse query to identify missed accounts]
```

**Results:**
[Full results table with account details]

### Detailed Gap Examples

**Gap 1: [Behaviour pattern name]**

Example missed accounts:
- @account1: [Behaviour description, why rule missed it]
- @account2: [Behaviour description, why rule missed it]
- @account3: [Behaviour description, why rule missed it]

Suggested rule:
```sql
[Write ClickHouse rule logic to detect this pattern]
```

**Gap 2: [Another behaviour pattern]**
[Repeat structure]

### SQL Queries Used

**Rule coverage analysis:**
```sql
SELECT rule_name, count(distinct account) as accounts_caught, count(*) as total_hits
FROM rule_hits
WHERE account IN ([List of analysed accounts])
GROUP BY rule_name
ORDER BY total_hits DESC
```

**Gap analysis:**
```sql
SELECT account
FROM ([List of accounts])
WHERE account NOT IN (
  SELECT DISTINCT account FROM rule_hits
  WHERE account IN ([List of analysed accounts])
)
```

**Precision analysis (false positive samples):**
```sql
[Include query to sample rule hits on accounts with no problematic behaviour]
```

## Timestamps

- Rule check started: [Date]
- Rule check completed: [Date]
- Report authored: [Date]
- Recommended deployment date: [Date if applicable]
```
