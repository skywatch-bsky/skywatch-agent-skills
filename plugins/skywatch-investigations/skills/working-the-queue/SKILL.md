---
name: working-the-queue
description: >-
  Two-pass moderation queue triage methodology — pull subjects, scan and classify
  against policy, present batch recommendations, then act on user decisions.
  Supports multiple entry points (reports, appeals, tags, proactive filtering).
  Use when triaging the Ozone moderation queue or processing moderation reports.
user-invocable: false
---

# Working the Queue

This skill guides moderation queue triage using a two-pass approach: first scan a batch of subjects with lightweight context gathering to produce recommendations, then act on user-confirmed decisions. The goal is efficient batch processing where the analyst reviews AI recommendations rather than raw reports.

### Subagent Model Selection

The primary triage agent delegates work to subagents to preserve its context window:

| Task | Model | Rationale |
|------|-------|-----------|
| Per-subject data collection & recommendation (Phase 1) | Sonnet | Speed — Opus is too slow for per-subject collection across a batch |
| Follow-up investigation queries (Phase 1) | Sonnet | Additional ClickHouse or Ozone queries when initial evidence is insufficient |
| Ozone read queries (queue pulls, event history) | Sonnet | Rote data retrieval; return structured summaries to the supervisor |
| Action execution — labelling, acknowledging, escalating (Phase 3) | Haiku | Mechanical execution of a pre-built manifest; no judgment required |

The primary Opus agent makes all classification and presentation decisions. Everything else — data gathering, Ozone queries, action execution — is delegated. Pass subagents the information they need (DIDs, AT-URIs, labels, comments, batchIds) and receive summaries or execution confirmations back.

## Prerequisites

### Load Reference Skill

Load the `querying-ozone` skill for Ozone tool parameter guidance, filter combinations, and conventions.

### Load Policy Guidance

Check for a `.policies/` directory in the current working directory. Read all files within it — these contain label definitions, enforcement criteria, and policy guidance that inform classification decisions.

If `.policies/` also contains a `precedents/` subdirectory, read those files too. Precedents are prior analyst decisions on ambiguous cases that serve as case law for future classification.

If no `.policies/` directory is found, warn the user: "No .policies/ directory found in the current working directory. Proceeding without policy-specific guidance — classifications will be based on general moderation principles. Consider creating .policies/ with your label definitions and enforcement criteria."

## Input

Two parameters, both provided by the user:

- **Entry point** — what to pull from the queue. Determines the `ozone_query_statuses` filter:

| Entry Point | Query Pattern |
|-------------|--------------|
| Recent reports | `sort_field: "lastReportedAt"`, `sort_direction: "desc"` |
| Appeals | `appealed: true`, `sort_direction: "desc"` |
| By tag | `tags: [user-specified]`, `sort_direction: "desc"` |
| By review state | `review_state: [user-specified]` |
| Proactive (custom filters) | User-specified combination of filters |
| Specific subject | `subject: [DID or AT-URI]` — single-subject mode |

- **Batch size** — how many subjects to pull. No default — ask the user if not specified. The user may say "all appeals" or "20 recent reports" or "everything tagged follow-up."

## Phase 1: Scan & Classify

For each subject in the batch, gather context and produce a classification. This is the first pass — prioritise speed and coverage over depth.

### Subject Granularity

Moderation labels apply at both the account level and the individual post level. When the queue contains multiple reported posts from the same account, **do not roll them up or deduplicate.** Each reported post requires individual review because:

- Different posts may violate different policies (or none at all)
- A post-level label targets specific content; an account-level label reflects systemic behaviour
- The aggregate pattern across multiple reported posts informs whether account-level action is warranted, but that is a separate decision from post-level findings

Treat each reported AT-URI as its own subject. Use the account-level view (content context, moderation history) as supporting evidence for each post-level decision.

However, the agent should proactively recommend account-level labels when the evidence supports it — even if only individual posts were reported. Triggers for an account-level recommendation:

- Multiple reported posts from the same account show a consistent pattern of the same policy violation
- Reviewing an individual post's content context (step 2) reveals a broader pattern of violating behaviour beyond the reported content
- The account's rule hit history shows sustained, repeated matches against the same rules

When recommending an account-level label, add it as a separate classification entry alongside the post-level entries. The analyst decides whether to apply both, one, or neither.

### Per-Subject Data Collection

For each subject, dispatch a **Sonnet** subagent to gather context. Use Sonnet for speed — Opus is too slow for per-subject data collection across a batch. The subagent collects all four categories below and returns a structured summary. This preserves the triage agent's context window for classification decisions across the full batch.

**Subagent prompt pattern:**

> Gather moderation context for subject [DID or AT-URI]. Collect: (1) moderation history from ozone_query_events — prior reports, labels, actions, sticky comments; (2) content context — 20 most recent posts from this DID via ClickHouse osprey_execution_results with post text, timestamps, and matched rules, plus rule hits for the past 30 days grouped by rule name with counts; (3) report details — what was reported, by whom, what reason was given; (4) if the subject is a reply, thread context — the parent post, the account being replied to, and the relationship between the accounts.
>
> CRITICAL: Return the full verbatim text of the reported content. Do NOT summarise, paraphrase, or excerpt — reproduce it character-for-character. The analyst needs the exact original text to make moderation decisions. For replies, also return parent posts verbatim.
>
> Based on what you find, return: (a) the reported content verbatim; (b) a recommended classification (label / no_action / investigate_further / escalate / defer) with a recommended label and label level if applicable; (c) the specific evidence supporting that recommendation — key posts, rule hit patterns, moderation history, thread context. Keep the summary concise — key facts and reasoning, not raw data dumps.

The subagent should use the data-analyst agent for ClickHouse queries and MCP tools directly for Ozone queries. The primary agent makes the final classification decision but uses the subagent's recommendation and evidence as input.

#### 1. Moderation History

Query `ozone_query_events` for the subject. Look for:
- Prior reports (how many, how recent, what was reported)
- Prior labels (what's already applied)
- Prior actions (acknowledged, escalated, muted, appealed)
- Moderator comments (especially sticky comments from prior reviews)

This reveals whether the subject is a repeat offender, has prior context, or has already been reviewed.

#### 2. Content Context

Query via data-analyst: pull the 20 most recent posts from DID [subject_did] from osprey_execution_results. Return post text, timestamp, and any rules that matched. Also return any rule hits for this DID in the past 30 days grouped by rule name with hit counts.

This reveals what the account actually posts, beyond the single reported item. Pattern of behaviour matters more than any individual post.

#### 3. Report Content

From the `ozone_query_statuses` result, examine the report itself — what was reported, by whom, and what reason was given. Cross-reference the reported content against the broader posting context from step 2.

#### 4. Reply Thread Context

If the reported content is a reply, the reply MUST be evaluated in the context of its conversation before classification. A reply that looks like a policy violation in isolation may be entirely appropriate in context (or vice versa).

**Required steps for replies:**

1. **Pull the parent post.** Retrieve the post being replied to. If the parent is also a reply, pull its parent too — follow the chain up to 3 levels or until you reach the thread root, whichever comes first. The full conversational context determines whether the reply is appropriate.

2. **Identify the account being replied to.** Determine the DID of the account that authored the parent post. Gather basic context: is this a known account? Any prior moderation history? Any relationship signals?

3. **Check the relationship between accounts.** Determine whether the replier and the person being replied to follow each other. Mutual follows indicate a conversational relationship where different norms may apply — banter between mutuals reads differently than unsolicited hostile replies to strangers.

4. **Identify the reporter.** Determine whether the person who filed the report is the same person being replied to, or a third party. This matters:
   - **Reporter is the reply target:** they experienced the content directly and their report reflects first-person impact
   - **Reporter is a third party:** they observed the exchange but may lack context about the relationship between the participants. The reply may be part of an ongoing conversation that the reporter isn't privy to. Additional context is needed before acting.

5. **Synthesise.** Factor all of the above into the classification. A reply classified as potentially violating must have its thread context documented in `key_evidence` so the analyst can verify the contextual judgment.

### Follow-Up Investigation

After reviewing a subagent's returned summary and recommendation, the primary triage agent may determine the evidence is insufficient for a confident classification. When this happens, dispatch additional Sonnet subagents to fill the gap. Do not settle for low-confidence classifications when more data is available.

Examples of follow-up dispatches:

- **Deeper ClickHouse queries** — "Pull all posts from this DID in the past 7 days that matched rule [X]. Return full post text and timestamps." or "Find all accounts that co-shared URLs with this DID in the past 7 days."
- **Thread expansion** — "Retrieve the full thread for AT-URI [X] — all replies, not just the parent chain."
- **Account relationship check** — "Determine the follow relationship between DID [A] and DID [B]. Check if they have prior interaction history."
- **Content similarity** — "Find posts across the network with similar text to [quoted content] using content_similarity."
- **Additional moderation history** — "Pull full ozone_query_events for DID [X] going back 90 days, not just the default."

The triage agent owns the classification decision. If the initial subagent's evidence leaves gaps, fill them rather than guessing. The cost of an additional Sonnet subagent is trivial compared to a wrong moderation action.

### Classification

Apply the following schema to each subject. Every field must be populated.

| Field | Type | Description |
|-------|------|-------------|
| `subject` | string | DID or AT-URI |
| `classification` | enum | `label`, `no_action`, `investigate_further`, `escalate`, `defer` |
| `confidence` | enum | `high`, `medium`, `low` |
| `policy_basis` | string | Which policy from `.policies/` supports this decision, or "no applicable policy" |
| `recommended_label` | string | Label to apply (only when classification is `label`) |
| `label_level` | enum | `post` or `account` — whether the label targets this specific content or the account overall (only when classification is `label`) |
| `reasoning` | string | Brief explanation of the decision |
| `key_evidence` | list | Specific posts, signals, or history items that informed the decision. For replies, must include thread context. |
| `question` | string | Only for `defer` — the specific question for the analyst |

### Classification Criteria

| Classification | When to Use |
|----------------|-------------|
| `label` | Clear policy violation with sufficient evidence. The policy basis is unambiguous and the behaviour matches. High or medium confidence. |
| `no_action` | Report does not describe behaviour that violates any policy, or the reported content is taken out of context and the broader posting pattern is benign. |
| `investigate_further` | Signals suggest problematic behaviour but the quick scan is insufficient. Needs deeper investigation (e.g., via `assess-account` or `conducting-investigations`). |
| `escalate` | Subject requires higher-level review — policy edge case, high-profile account, potential legal issue, or severity beyond normal triage authority. |
| `defer` | Policy is ambiguous on this case, or the content is borderline. **You MUST use this classification when unsure how to interpret a policy.** |

### The `defer` Classification

When the policy text is ambiguous, when the content could reasonably fall on either side of a policy line, or when you lack the context to interpret a policy correctly — classify as `defer` and populate the `question` field with a specific question for the analyst.

Good defer questions are specific and actionable:
- "The account posts satirical content that mimics [policy-violating behaviour]. Does the satire exemption in [policy section] apply here?"
- "This account shares links from [domain] which is state-affiliated media. The policy covers 'state-linked propaganda' but this content is factual reporting. Does the source alone trigger the policy?"
- "Multiple users reported this as [violation type] but the content appears to be [alternative interpretation]. Which reading applies?"

Bad defer questions are vague:
- "Is this a violation?" (too broad — specify what's ambiguous)
- "What should we do?" (the whole point is to narrow the question)

### Recording Precedent Decisions

When the analyst answers a `defer` question, their decision establishes a precedent. Write the decision to `.policies/precedents/` as a markdown file:

**Filename:** `YYYY-MM-DD-[short-description].md` (e.g., `2026-04-28-satire-exemption-state-media.md`)

**Format:**

```markdown
# [Short description of the decision]

**Date:** [YYYY-MM-DD]
**Question:** [The defer question that was asked]
**Decision:** [The analyst's answer]
**Reasoning:** [Why the analyst decided this way, if provided]
**Applies to:** [What category of future cases this precedent covers]
```

Future runs of this skill will read precedents from `.policies/precedents/` and apply them to similar cases rather than re-deferring on the same type of ambiguity.

## Phase 2: Present Batch

Present all subjects as a batch summary. Group by classification for easy scanning.

### Summary Table

```
## Queue Triage: [entry point description]

**Batch Size:** [N] subjects reviewed
**Policy Reference:** [list of .policies/ files loaded]

### Recommended: Label ([n])

| # | Subject | Label | Level | Policy Basis | Confidence | Key Evidence |
|---|---------|-------|-------|-------------|------------|--------------|
| 1 | at://did:plc:.../app.bsky.feed.post/... | [label] | post | [policy] | high | [one-line summary] |
| 2 | did:plc:... | [label] | account | [policy] | high | [one-line summary] |

### Recommended: No Action ([n])

| # | Subject | Reasoning | Confidence |
|---|---------|-----------|------------|
| 1 | did:plc:... | [one-line reasoning] | high |

### Requires Decision ([n])

| # | Subject | Question |
|---|---------|----------|
| 1 | did:plc:... | [specific question from defer classification] |

### Recommended: Investigate Further ([n])

| # | Subject | What's Unclear | Suggested Next Step |
|---|---------|---------------|-------------------|
| 1 | did:plc:... | [ambiguity] | [assess-account / full investigation] |

### Recommended: Escalate ([n])

| # | Subject | Reason |
|---|---------|--------|
| 1 | did:plc:... | [escalation reason] |
```

### Per-Subject Detail

After the summary table, present a detail block for **every** subject (not just `label` recommendations). Each block must include:

1. **The reported content itself, verbatim** — the EXACT text of the post or content that was reported, reproduced character-for-character. NEVER summarise, paraphrase, excerpt, or editorialize reported content. The analyst must see the full original text to verify the agent's judgment. For replies, also show the parent post(s) verbatim so the thread context is visible. This is non-negotiable — a summary of reported content is useless for moderation decisions.
2. **The agent's recommendation and reasoning** — classification, policy basis, confidence.
3. **Key evidence** — relevant moderation history, rule hit patterns, thread context, account relationship details.

The analyst should be able to read a detail block and make a decision without needing to go look anything up. If the reported content is an image or media that can't be displayed as text, note that and provide the AT-URI so the analyst can review it directly.

**Then wait for user direction.** Do not proceed to Phase 3 until the user confirms, modifies, or overrides the recommendations.

## Phase 3: Act

Execute the user's confirmed decisions. The user may accept all recommendations, override specific ones, or provide answers to defer questions.

Dispatch action execution to a Haiku subagent to preserve context and reduce cost. The triage agent generates the full action manifest and hands it off — the subagent executes mechanically.

### Step 1: Record Precedents

If the user answered any `defer` questions, write each decision to `.policies/precedents/` before proceeding. This ensures the precedent is recorded even if the session is interrupted during labelling.

### Step 2: Dispatch Action Subagent

Generate the action manifest and dispatch a **Haiku** subagent with the following prompt pattern:

> Execute the following moderation actions. Use batchId [UUID] for all label operations.
>
> **Labels to apply:**
> [For each: subject (AT-URI or DID), label name, level (post/account), comment text if any]
>
> **Other actions:**
> [For each: subject, action type (escalate/tag/mute), parameters]
>
> **Acknowledge:**
> [List of all subjects to acknowledge. Use acknowledgeAccountSubjects: true for DIDs.]
>
> Apply labels via `ozone_label`, comments via `ozone_comment`, then execute other actions, then acknowledge all subjects. Report back what succeeded and what failed.

The subagent handles:
- Applying labels (AT-URI for post-level, DID for account-level)
- Adding `ozone_comment` with reasoning where the decision was non-obvious
- `ozone_escalate` for escalation subjects
- `ozone_tag` for tagging subjects
- `ozone_mute` for suppression subjects
- `ozone_acknowledge` for ALL processed subjects (both labelled and no-action — acknowledgement closes the report)
- `acknowledgeAccountSubjects: true` for account-level subjects to bulk-close associated reports

### Output

```
## Actions Completed

**Batch ID:** [UUID]

| Action | Count | Details |
|--------|-------|---------|
| Labelled | [n] | [label1] x [n], [label2] x [n] |
| Acknowledged (no action) | [n] | |
| Escalated | [n] | |
| Deferred for investigation | [n] | |
| Precedents recorded | [n] | [filenames written to .policies/precedents/] |
```
