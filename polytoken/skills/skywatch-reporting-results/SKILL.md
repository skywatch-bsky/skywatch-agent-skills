---
name: skywatch-reporting-results
description: Report formats, BLIND structure, data presentation, and output conventions for investigation reports. Use when writing or reviewing investigation reports. Includes templates for memo, cluster deep-dive, cross-cluster, and rule check report types.
polytoken:
  tags: [skywatch]
---

# Reporting Results

This skill standardises the structure and presentation of investigation findings. All reports follow the BLIND format and are stored using consistent naming and directory conventions.

## BLIND Report Structure

BLIND is a structured briefing format adapted for AT Protocol investigations. It places the bottom line first, followed by key elements that support action.

- **BL** — Bottom Line
- **I** — Impact on the network
- **N** — Next steps to be taken
- **D** — Details to support the bottom line (evidence, timestamps, AT-URIs, queries)

### Bottom Line

A single sentence stating what was found and what it means. This should be the most critical finding from the investigation — the thing someone needs to know immediately.

**Examples:**
- "A coordinated network of 47 accounts is amplifying election-related disinformation, with 80% coverage by existing rules but significant reach through quote posts."
- "A single compromised account is posting spam with a consistent pattern; no coordination detected."
- "Rule coverage for this behaviour type is 45%, leaving significant detection gaps."

**Guidelines:**
- Write in active voice, present tense
- Be specific about scale and scope
- Mention the most significant finding (harm, reach, or implication)
- Avoid hedging — use "is" not "appears to be" (evidence determines confidence)

### Impact

Quantify the scale and reach of the finding on the network. This answers "how much does this matter?"

**Include:**
- Number of accounts involved
- Time range of activity
- Engagement metrics (total posts, likes, reposts, reach)
- Targets (which accounts, topics, or communities are affected?)
- Risk assessment: low / medium / high

**Format:**
- Use tables for structured numerical data
- Use bullets for contextual information
- Always include data collection dates and time ranges

**Example:**
```
| Metric | Value |
|--------|-------|
| Accounts in network | 47 |
| Posts analysed | 1,243 |
| Total engagement (likes + reposts) | 24,561 |
| Data range | 2026-02-15 to 2026-03-19 |
| Estimated reach | 500K+ impressions |
| Risk level | High |
```

### Next Steps

List actionable recommendations in priority order. These are the outcomes of the investigation.

**Recommended Actions:**
- Apply moderation labels (flag, mute, suspend)
- Update or create detection rules
- Escalate to external team
- Monitor specific accounts going forward
- Share findings with external partners

**Format:**
- Use checkboxes for tracking
- Include any approval requirements (e.g., "requires moderation review")
- Specify timelines if applicable

**Example:**
```
- [ ] Apply `coordinated_inauthentic_behaviour` label to 47 identified accounts
- [ ] Create new rule for detecting similar posting patterns (see Rule Recommendations section)
- [ ] Escalate to trust & safety team for potential platform-wide enforcement
- [ ] Continue monitoring for new linked accounts (trigger on similar behaviour patterns)
```

### Details

The complete evidence section. This is where you show all supporting data, timelines, network graphs, and analysis.

**Include:**
- Account profile summaries (one per account or account cluster)
- Timeline of activity (formatted as markdown table or timeline)
- Network graph or coordination evidence (visual description or ASCII diagram)
- Content examples (most significant posts or patterns)
- Rule hit analysis (which rules triggered, which didn't)
- SQL queries used for data extraction (for reproducibility)
- Timestamps: investigation dates, data collection period, report authored date
- AT-URIs for cited content (verbatim references, not summaries)

**Format Guidelines:**
- Use tables for structured data (account lists, rule hit counts, engagement metrics)
- Use timelines for temporal patterns (ASCII or markdown)
- Use bullet lists for evidence summaries and findings
- Include SQL query blocks with syntax highlighting
- Include a timestamps block at the end of the Details section for traceability

**Example table:**
```
| Account | Type | Posts | Rule Hits | PDS Host | Created |
|---------|------|-------|-----------|----------|---------|
| @acc1 | Account | 342 | 18 | pds.example.com | 2025-11 |
| @acc2 | Account | 298 | 12 | pds.example.com | 2025-11 |
```

**Timestamps block** (always include at the end of Details):
```
- Investigation conducted: 2026-03-10 to 2026-03-19
- Data range analysed: 2026-02-15 to 2026-03-19
- Report authored: 2026-03-19
- Last updated: [if applicable]
```

---

## Report Types

Select the report type based on investigation scope and findings. Each type emphasizes different aspects while maintaining the BLIND structure.

### Memo

**When to use:** Single account or small issue (2-5 accounts) without evidence of coordination. Quick findings that don't require deep network analysis.

**Scope:** Limited investigation (usually stops after Phase 2 or Phase 3).

**Emphasis:** Account profile and immediate next steps. Minimal network analysis.

**Key sections:**
- Bottom Line (brief, high-level)
- Impact (account counts, reach, risk)
- Next Steps (enforcement or monitoring)
- Details (account profile, key evidence, timestamps)

**Length:** 1-3 pages

**File naming:** `YYYY-MM-DD-memo-{account-name}.md`

### Cluster Deep-Dive

**When to use:** Comprehensive analysis of a coordinated network (5+ accounts). Complete investigation through all 6 phases for a single coordinated group.

**Scope:** Full investigation of a single coordinated cluster.

**Emphasis:** Coordination evidence, network topology, amplification strategy, and rule coverage.

**Key sections:**
- Bottom Line
- Impact (network size, reach, temporal scope)
- Next Steps (labelling, rule updates, ongoing monitoring)
- Details (full data tables, timelines, network graph)
  - Network Summary (account count, relationships, infrastructure)
  - Coordination Evidence (content matching, temporal correlation, shared infrastructure)
  - Amplification Map (primary targets, engagement metrics, spread patterns)
  - Rule Coverage Analysis (Phase 5 findings)
  - Timestamps

**Length:** 3-8 pages depending on network size

**File naming:** `YYYY-MM-DD-cluster-{identifier}.md`

### Cross-Cluster

**When to use:** Comparison and analysis of multiple coordinated networks that appear related. Identifies shared tactics, infrastructure, or operators.

**Scope:** Analysis linking 2+ clusters together; may reference existing cluster deep-dive reports.

**Emphasis:** Cross-cluster patterns, shared infrastructure, coordinated operations, and comparative analysis.

**Key sections:**
- Bottom Line
- Impact (total accounts across clusters, aggregate reach, shared targets)
- Next Steps (coordination-level labelling, rule updates)
- Details (comparative tables, cross-cluster network graph, infrastructure map)
  - Cluster Comparison Matrix (accounts, infrastructure, tactics, timeline overlap)
  - Shared Infrastructure Evidence (domains, PDS hosts, ASN overlap)
  - Shared Tactics (common content, posting patterns, amplification strategies)
  - Hypothesised Relationships (likely operator, operational unit, or shared purpose)
  - Timestamps

**Length:** 4-10 pages depending on number of clusters

**File naming:** `YYYY-MM-DD-cross-cluster-{description}.md`

### Rule Check

**When to use:** Assessment of rule coverage against known behaviour patterns. Focus on Phase 5 (Rule Validation) findings.

**Scope:** Analysis of rule coverage; may reference accounts or networks already documented.

**Emphasis:** Detection gaps, rule effectiveness, and recommended improvements.

**Key sections:**
- Bottom Line
- Impact (accounts caught vs. missed, coverage percentage, risk of missed detection)
- Next Steps (rule deployment, testing, monitoring)
- Details (rule hit tables, gap examples with SQL, query results)
  - Rule Coverage Summary (coverage by rule type, accounts caught, accounts missed)
  - Gap Analysis (behaviour patterns not caught, suggested new rules)
  - Rule Recommendations (new rules, rule modifications, threshold adjustments)
  - Timestamps

**Length:** 2-5 pages

**File naming:** `YYYY-MM-DD-rule-check-{rule-type-or-case-name}.md`

---

## Data Presentation Conventions

### Tables

Use markdown tables for structured data:

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value | Value | Value |
```

**When to use tables:**
- Account lists with metadata
- Rule hit counts by account or rule
- Engagement metrics
- Infrastructure details (hosts, domains, ASNs)

### Timelines

Use ASCII or markdown-formatted timelines for temporal patterns:

```markdown
2026-02-15 [09:15] @account1: first post
2026-02-15 [09:22] @account2: similar post
2026-02-15 [09:45] @account3: amplifies content
2026-02-16 [06:30] Network goes dormant
```

**When to use timelines:**
- Account activity history
- Content distribution patterns
- Coordination timing patterns
- Campaign phases

### Bullet Lists

Use bullet lists for evidence summaries and qualitative findings:

```markdown
- Evidence 1: description and supporting detail
- Evidence 2: description and supporting detail
- Evidence 3: description and supporting detail
```

### Internal References

Use Obsidian wiki-style links for all internal references within reports — other reports, accounts, skills, or investigation artefacts.

**Format:**
- Link to other reports: `[[2026-03-19-cluster-coordinated-network-47]]`
- Link to specific sections: `[[2026-03-19-cluster-coordinated-network-47#Network Summary]]`
- Link to accounts: `[[accounts/did:plc:abc123]]`
- Link to related skills: `[[skywatch-conducting-investigations]]`, `[[skywatch-querying-clickhouse]]`

**When to use:**
- Referencing a prior investigation or related report
- Linking to accounts that have their own profiles or prior reports
- Cross-referencing sections within the same report
- Citing related skills or methodology

**Do not use** standard markdown links (`[text](url)`) for internal references. Reserve markdown links for external URLs only.

### SQL Queries

Always include the queries used for data extraction in code blocks with ClickHouse syntax highlighting:

````markdown
### Query: Account Rule Hit History

```sql
SELECT rule_name, count() as hits, min(timestamp) as first_hit, max(timestamp) as last_hit
FROM rule_hits
WHERE account = 'target_account'
GROUP BY rule_name
ORDER BY hits DESC
```

**Result:**
[table of results]
````

---

## Output Conventions

### File Naming

Use ISO 8601 date format with descriptive identifier:

```
YYYY-MM-DD-{type}-{identifier}.md
```

**Examples:**
- `2026-03-19-memo-spam-account.md`
- `2026-03-19-cluster-coordinated-network-47.md`
- `2026-03-19-cross-cluster-infrastructure-overlap.md`
- `2026-03-19-rule-check-copypasta-detection.md`

### Metadata Block

Include investigation metadata at the top of every report (after BLIND title):

```markdown
# Investigation Report: [Brief Title]

**Investigator:** [Name]
**Investigation Date:** [YYYY-MM-DD]
**Report Type:** [Memo / Cluster Deep-Dive / Cross-Cluster / Rule Check]
**Target(s):** [Accounts or networks analysed]
**Status:** [In Progress / Complete / Escalated]
**Conclusion:** [Brief summary]
```

### Directory Structure

Store reports in the Obsidian vault pointed to by the `SKYWATCH_VAULT` environment variable. Resolve the vault path before writing files by running `echo "$SKYWATCH_VAULT"`; if it is empty, ask the operator for the vault path instead of guessing. Use the vault as the root for all report paths.

Store reports in a hierarchical structure for easy retrieval:

```
$SKYWATCH_VAULT/Reports/investigations/
├── YYYY-MM-DD-{case-name}/
│   ├── report.md                    # Main report
│   ├── accounts.csv                 # Account list (if applicable)
│   ├── rule-hits.csv                # Rule trigger data (if applicable)
│   ├── network-graph.txt            # Network topology or ASCII graph (if applicable)
│   └── queries/
│       ├── discovery.sql
│       ├── characterization.sql
│       ├── linkage.sql
│       ├── amplification.sql
│       └── rule-validation.sql
```

---

## Integration with Related Skills

- **[[skywatch-conducting-investigations]]** — For investigation methodology and Phase 1-5 guidance
- **[[skywatch-accessing-osprey]]** — For moderation label operations (Phase 6 enforcement)
- **[[skywatch-querying-clickhouse]]** — For SQL query construction and optimisation

---

## Review Checklist

Use this checklist when reviewing investigation reports before publication:

**Structure:**
- [ ] Bottom Line is a single sentence and captures the key finding
- [ ] Impact section includes account counts, reach, and risk assessment
- [ ] Next Steps are specific and actionable
- [ ] Details include supporting data, SQL queries, and timestamps

**Evidence:**
- [ ] All major claims are supported by data
- [ ] Data sources are clearly documented
- [ ] SQL queries are included and reproducible
- [ ] Time ranges and data collection dates are specified

**Accuracy:**
- [ ] Account counts are verified
- [ ] Rule coverage percentages are calculated correctly
- [ ] Findings are consistent across all sections
- [ ] No contradictions between sections

**Clarity:**
- [ ] Report type is appropriate for scope and findings
- [ ] Language is clear and unambiguous
- [ ] Technical terms are defined or linked using `[[wiki-style]]` links
- [ ] Tables and timelines are properly formatted

**Linking:**
- [ ] All internal references use `[[wiki-style]]` links (not markdown links)
- [ ] Cross-references to other reports resolve correctly
- [ ] Report files are written under `$SKYWATCH_VAULT/Reports/investigations/` or another explicitly requested vault path
- [ ] Related skills and accounts are linked

**Completeness:**
- [ ] All recommended next steps are addressed
- [ ] Escalation path is clear if needed
- [ ] Follow-up actions are documented
