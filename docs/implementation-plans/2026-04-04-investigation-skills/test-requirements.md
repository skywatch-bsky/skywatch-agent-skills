# Test Requirements: Investigation Skills

## Purpose

This document maps each acceptance criterion from the investigation skills design to specific verification methods. Because the deliverables are SKILL.md methodology documents (not executable code), automated testing is not applicable. All verification is structural, content-based, or requires human invocation.

### Verification Types

| Type | Definition |
|------|-----------|
| **structural** | File exists at expected path, has correct YAML frontmatter, follows plugin conventions |
| **content** | Skill contains required methodology sections, classification schemas, or output formats |
| **human** | Requires manual invocation of the skill within the investigator agent to verify behaviour |

### Why Automated Testing Does Not Apply

The deliverables are markdown methodology documents that Claude loads as instructions during investigations. They contain no executable code, no functions, no APIs. There is nothing to unit test, integration test, or run assertions against. Verification is either "does the file contain the right methodology" (content review) or "does Claude follow the methodology correctly when invoked" (human invocation).

---

## AC1: Account Assessment

**Skill file:** `plugins/skywatch-investigations/skills/assess-account/SKILL.md`

| AC | Text | Verification Type | Verification Approach |
|----|------|-------------------|----------------------|
| AC1.1 | Given a DID, assess-account produces a structured assessment with account_type, confidence, signals, topic_breakdown, language_profile, and recommendation | **content** + **human** | Content: verify SKILL.md Output section contains a template with all 6 fields (account_type, confidence, signals, topic_breakdown, language_profile, recommendation). Human: invoke skill with a known DID and confirm all fields are populated in output. |
| AC1.2 | Given a handle (instead of DID), assess-account resolves to DID and produces the same assessment | **content** + **human** | Content: verify SKILL.md Input section contains handle-to-DID resolution guidance. Human: invoke skill with a handle and confirm it resolves before proceeding. |
| AC1.3 | Assessment correctly identifies bot-like accounts using entropy thresholds (hourly_entropy >= 3.9, interval_entropy <= 1.5) | **content** | Verify SKILL.md Classification section contains Bot Signals subsection with exact thresholds: hourly_entropy >= 3.9 and interval_entropy <= 1.5. Both values must be present as classification criteria. |
| AC1.4 | Assessment identifies IO signals (single-topic concentration, cluster membership, narrative alignment) | **content** | Verify SKILL.md Classification section contains IO Signals subsection listing all three: single-topic concentration (70%+), cluster membership, and narrative alignment. |
| AC1.5 | On request, full B-I-N-D-Ts report is produced following reporting-results conventions | **content** + **human** | Content: verify SKILL.md Output section contains "On Request: B-I-N-D-Ts Report" subsection referencing reporting-results skill with B-I-N-D-Ts fields (Bottom Line, Impact, Next Steps, Details, Timestamps). Human: invoke skill with report request and confirm B-I-N-D-Ts output. |
| AC1.6 | Account with no rule hits or minimal history produces assessment with low confidence and "insufficient_data" signals | **content** + **human** | Content: verify SKILL.md contains "Handling Missing Data" section stating that missing data produces low-confidence assessment (not an error), and that `insufficient_data` appears in the account_type enum. Human: invoke skill with a new/empty account and confirm low confidence result. |

---

## AC2: Incident Search

**Skill file:** `plugins/skywatch-investigations/skills/search-incidents/SKILL.md`

| AC | Text | Verification Type | Verification Approach |
|----|------|-------------------|----------------------|
| AC2.1 | Given a topic, search-incidents returns relevance-scored results with content_type and incident_confirmed classifications | **content** + **human** | Content: verify SKILL.md Per-Result Classification Schema table contains `relevance` (integer 1-10), `content_type` (enum with specified values), and `incident_confirmed` (enum with specified values). Human: invoke skill with a topic and confirm each result carries all three fields. |
| AC2.2 | Results are filtered to minimum relevance threshold and sorted by score | **content** | Verify SKILL.md contains "Minimum Relevance Threshold" section specifying relevance >= 5 filter and that the output template orders results by relevance score. |
| AC2.3 | Output includes regional breakdown and top accounts summary | **content** | Verify SKILL.md Output section contains "Results by Region" grouping structure, a "Top Accounts" table, and a "Regional Breakdown" summary table. |
| AC2.4 | Incident reports are distinguished from commentary, historical references, and news aggregation | **content** | Verify SKILL.md contains "Content Type Criteria" table with distinct identifying features for all four types: `incident_report`, `commentary`, `news_aggregation`, and `historical_reference`. |
| AC2.5 | Topic with zero results returns empty result set with explanation, not an error | **content** + **human** | Content: verify SKILL.md Data Collection section contains "Handling Zero Results" subsection with explicit instruction to return explanation (not error) and suggest broadening. Human: invoke skill with an obscure topic expected to return zero results and confirm graceful empty output. |

---

## AC3: Rule Hit Triage

**Skill file:** `plugins/skywatch-investigations/skills/triage-rule-hits/SKILL.md`

| AC | Text | Verification Type | Verification Approach |
|----|------|-------------------|----------------------|
| AC3.1 | Given a rule name, triage-rule-hits samples hits and classifies each as TP/FP/novel/uncertain | **content** + **human** | Content: verify SKILL.md Per-Hit Classification Schema table contains `classification` field with enum values `true_positive`, `false_positive`, `novel`, `uncertain`, plus Classification Criteria table defining each. Human: invoke skill with a known rule name and confirm per-hit classifications appear. |
| AC3.2 | Aggregate output includes counts, FP examples with reasoning, and novel patterns with suggested rule actions | **content** | Verify SKILL.md Output section contains: Classification Summary table (counts by classification), False Positive Patterns subsection (with example and reasoning fields), and Novel Patterns subsection (with suggested rule action field). |
| AC3.3 | rule_health assessment produced (healthy/drifting/needs_update/needs_review) | **content** | Verify SKILL.md contains Rule Health Assessment table with all four values (`healthy`, `drifting`, `needs_update`, `needs_review`) and TP rate criteria for each. |
| AC3.4 | Novel patterns include concrete description and example posts | **content** | Verify SKILL.md Novel Patterns output template contains `Description` field and `Example Posts` field with DID and date placeholders. |
| AC3.5 | Rule with no hits in the time window returns "no data" summary, not a classification attempt on empty results | **content** + **human** | Content: verify SKILL.md Data Collection section contains "Hit Volume Check" subsection with explicit instruction to return "no data" summary and NOT proceed with classification. Human: invoke skill with a rule name that has no recent hits and confirm no classification is attempted. |

---

## AC4: Cluster Classification

**Skill file:** `plugins/skywatch-investigations/skills/classify-cluster/SKILL.md`

| AC | Text | Verification Type | Verification Approach |
|----|------|-------------------|----------------------|
| AC4.1 | Given a cluster ID or set of DIDs, classify-cluster produces narrative analysis with dominant_narratives, coordination_signals, and likely_origin | **content** + **human** | Content: verify SKILL.md Classification Schema table contains `dominant_narratives`, `coordination_signals`, and `likely_origin` fields with specified types. Human: invoke skill with a known cluster ID and confirm all three fields appear in output. |
| AC4.2 | Classification distinguishes IO from organic coordination (coordination != inauthentic) | **content** | Verify SKILL.md contains both IO Indicators and Organic Indicators in the Signal Catalogue, plus a "Distinguishing IO from Organic Coordination" section with the 4 ordered diagnostic questions (narrative diversity, source diversity, account authenticity, temporal pattern). |
| AC4.3 | Output includes "cluster at a glance" summary (size, age range, language mix, dominant narrative, confidence) | **content** | Verify SKILL.md Output section contains "Cluster at a Glance" table with all five fields: Size, Age Range, Language Mix, Dominant Narrative, Classification (with confidence). |
| AC4.4 | Shared sources (domains/URLs) are identified across cluster members | **content** | Verify SKILL.md Data Collection section contains "Shared Domains" dispatch instruction, and Output section contains "Shared Sources" table with domain, member count, total shares, and anomalous flag columns. |
| AC4.5 | Cluster with single member or very small membership produces assessment with low confidence flag | **content** + **human** | Content: verify SKILL.md Data Collection section contains "Small Cluster Check" subsection specifying that clusters with fewer than 3 members get confidence forced to `low`. Human: invoke skill with a single-member cluster and confirm low confidence in output. |

---

## AC5: Investigator Integration

**Files:**
- `plugins/skywatch-investigations/agents/investigator.md`
- `plugins/skywatch-investigations/CLAUDE.md`

| AC | Text | Verification Type | Verification Approach |
|----|------|-------------------|----------------------|
| AC5.1 | Investigator agent loads assess-account when entering Phase 2 (Characterization) | **content** + **human** | Content: verify investigator.md Optional Skills table maps `assess-account` to Phase 2 (Characterization). Human: start an investigation that reaches Phase 2 and confirm the skill is loaded. |
| AC5.2 | Investigator agent loads search-incidents when investigation starts from a topic (Phase 1 Discovery) | **content** + **human** | Content: verify investigator.md Optional Skills table maps `search-incidents` to Phase 1 (Discovery). Human: start a topic-based investigation and confirm the skill is loaded during discovery. |
| AC5.3 | Investigator agent loads classify-cluster when cosharing cluster is identified (Phase 3/4) | **content** + **human** | Content: verify investigator.md Optional Skills table maps `classify-cluster` to Phase 3 (Linkage) or Phase 4 (Amplification). Human: investigate an account with cluster membership and confirm the skill is loaded at the appropriate phase. |
| AC5.4 | Investigator agent loads triage-rule-hits when evaluating rule coverage (Phase 5) | **content** + **human** | Content: verify investigator.md Optional Skills table maps `triage-rule-hits` to Phase 5 (Rule Validation). Human: reach Phase 5 in an investigation and confirm the skill is loaded. |
| AC5.5 | Skills are loaded on-demand, not pre-loaded at investigation start | **content** + **human** | Content: verify investigator.md Optional Skills section contains explicit "do not pre-load" guidance stating skills should be loaded only when entering the relevant phase. Human: start an investigation and confirm no optional skills appear in context until their phase is reached. |
| AC5.6 | CLAUDE.md Exposes section lists all 4 new skills | **structural** | Verify CLAUDE.md Exposes > Skills subsection contains all 4 entries: `assess-account`, `search-incidents`, `triage-rule-hits`, `classify-cluster`. Also verify they appear in the "When to Use" table and "Key Files" table (3 references each, 12 total). |

---

## Verification Summary

| AC Group | Structural | Content | Human | Total Criteria |
|----------|-----------|---------|-------|---------------|
| AC1: Account Assessment | 0 | 6 | 5 | 6 |
| AC2: Incident Search | 0 | 5 | 2 | 5 |
| AC3: Rule Hit Triage | 0 | 5 | 2 | 5 |
| AC4: Cluster Classification | 0 | 5 | 2 | 5 |
| AC5: Investigator Integration | 1 | 5 | 5 | 6 |
| **Totals** | **1** | **26** | **16** | **27** |

Note: counts exceed total criteria because most criteria require multiple verification types (e.g., content check confirms methodology exists, human invocation confirms it works in practice).

### Verification Execution Order

1. **Structural checks first** (AC5.6) — confirm all files exist and are discoverable
2. **Content checks second** (all ACs) — confirm each skill contains required methodology, schemas, and output formats
3. **Human invocation last** (AC1.1, AC1.2, AC1.5, AC1.6, AC2.1, AC2.5, AC3.1, AC3.5, AC4.1, AC4.5, AC5.1-AC5.5) — confirm Claude follows the methodology correctly when skills are loaded during real investigations
