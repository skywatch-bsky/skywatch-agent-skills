---
name: triage-rule-hits
description: >-
  Rule hit triage methodology for Osprey rules. Samples recent hits, classifies
  each as TP/FP/novel/uncertain, and produces aggregate rule health assessment
  with actionable recommendations. Use when evaluating rule performance during
  Phase 5 (Rule Validation) or as a standalone rule maintenance check.
user-invocable: false
---

# Triage Rule Hits

This skill guides the triage of Osprey rule hits — sampling recent hits for a given rule, classifying each as true positive, false positive, novel pattern, or uncertain, and producing an aggregate assessment of rule health. The goal is to surface what needs human attention: false positives that indicate rule drift, novel patterns worth adding to rule design, and overall rule performance.

Use this skill when you need to evaluate whether a rule is performing as intended, during Phase 5 (Rule Validation) of an investigation, or as a standalone rule maintenance workflow.

## Input

The skill accepts:
- **Rule name** (required): The Osprey rule to triage (e.g., `election_misinfo_en`)
- **Time window** (optional): How far back to look. Default: 30 days.
- **Sample size** (optional): How many hits to classify. Default: 50.

## Phase 1: Data Collection

### 1. Rule Hit Sample

**Dispatch to data-analyst:**
"Sample [sample_size] rule hits for rule [rule_name] from osprey_execution_results over the past [time_window] days. Return: hit timestamp, author DID, content text, any other rules that also matched this content, and the rule's output score/value. Use a stratified sample — take hits evenly distributed across the time window rather than just the most recent."

**Why stratified sampling:** Recent hits may not represent the rule's full behaviour. A rule might work well on current content but have drifted over time, or vice versa.

### 2. Rule Context

**Dispatch to data-analyst:**
"For rule [rule_name], show aggregate statistics over the past [time_window] days: total hit count, hits per day (average and range), unique authors hit, and a daily hit count trend (date, count)."

### 3. Hit Volume Check

If the rule hit sample returns zero results:
1. Report: "Rule [rule_name] produced no hits in the past [time_window] days."
2. Suggest: Check if the rule is still active, or expand the time window.
3. Do NOT proceed with classification — return a "no data" summary immediately.

If fewer than 10 hits are returned, proceed with classification but note the small sample size and its effect on confidence.

## Phase 2: Classification

Classify each sampled hit. The classification determines whether the rule is catching what it should, what it shouldn't, or something unexpected.

### Per-Hit Classification Schema

| Field | Type | Description |
|-------|------|-------------|
| `classification` | enum | `true_positive`, `false_positive`, `novel`, `uncertain` |
| `confidence` | enum | `high`, `medium`, `low` |
| `reasoning` | string | Brief explanation of why this classification was chosen |
| `pattern_group` | string | Group label for similar hits (e.g., "satire", "historical_reference", "new_tactic") |

### Classification Criteria

| Classification | Criteria |
|----------------|----------|
| **true_positive** | Content matches the rule's intended detection target. The rule was designed to catch this type of content and it did so correctly. |
| **false_positive** | Content does not match the rule's intended target. Common causes: satire or irony misread as sincere, historical references to past events, meta-discussion about the topic (e.g., discussing misinformation rather than spreading it), content in a language with keyword overlap. |
| **novel** | Content is genuinely problematic but uses a different pattern than the rule was designed for. The rule caught it via broad matching, but the specific tactic or framing is new. These are valuable signals for rule evolution. |
| **uncertain** | Insufficient context to classify confidently. The content is ambiguous, requires cultural context not available, or straddles the line between categories. |

### Pattern Grouping

As you classify hits, group similar ones under pattern labels. For example:
- FP hits from satire accounts -> pattern_group: "satire"
- FP hits from academic discussion -> pattern_group: "academic_meta"
- Novel hits using a new evasion tactic -> pattern_group: "unicode_substitution"
- TP hits matching the primary pattern -> pattern_group: "primary_detection"

Pattern groups make the aggregate output actionable — instead of "15 false positives," you get "8 FPs from satire, 4 from academic meta-discussion, 3 from historical references."

## Phase 3: Output

### Default: Triage Summary

```
## Rule Triage: [rule_name]

**Time Window:** [time_window] days
**Sample Size:** [N] hits classified (of [total] total hits)
**Rule Health:** [rule_health] ([confidence])

### Classification Summary

| Classification | Count | % of Sample |
|----------------|-------|-------------|
| True Positive | [n] | [%] |
| False Positive | [n] | [%] |
| Novel | [n] | [%] |
| Uncertain | [n] | [%] |

### False Positive Patterns

#### [pattern_group_1] ([n] hits)
**Example:** "[post content excerpt]"
**Reasoning:** [why this is a false positive]
**Suggested Action:** [adjust keyword exclusion / add context filter / no action if rare]

#### [pattern_group_2] ([n] hits)
...

### Novel Patterns

#### [pattern_group_1] ([n] hits)
**Description:** [concrete description of the new pattern]
**Example Posts:**
- "[post content 1]" ([DID], [date])
- "[post content 2]" ([DID], [date])
**Suggested Rule Action:** [add explicit detection / create new rule / expand existing pattern]

### Recommendation
[Actionable summary: what to do about FPs, novel patterns, and overall rule health]
```

### Rule Health Assessment

| Health | Criteria |
|--------|----------|
| **healthy** | TP rate >= 80%, no significant FP patterns, no novel patterns requiring attention |
| **drifting** | TP rate 60-79%, emerging FP patterns that are growing, or novel patterns appearing |
| **needs_update** | TP rate 40-59%, or significant FP patterns with clear fix available |
| **needs_review** | TP rate < 40%, or novel patterns that fundamentally change what the rule should detect |

### On Request: BLIND Report

When a full report is requested, load the `reporting-results` skill:

- **Bottom Line:** Rule health status + key finding (e.g., "Rule X is drifting due to emerging satire false positives")
- **Impact:** Hit volume, FP rate and its effect on moderation queue noise, novel patterns and their risk
- **Next Steps:** Specific rule modifications, new rules to create, hits to re-review
- **Details:** Full classification results with examples
- **Timestamps:** Triage time window, assessment timestamp

Select the **rule check** report type.
