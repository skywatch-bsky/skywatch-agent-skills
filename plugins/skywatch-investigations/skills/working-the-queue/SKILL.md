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

### Data Limitation: ClickHouse Window

ClickHouse (`osprey_execution_results`) retains approximately 2 months of data. This is a partial view of an account's history, NOT the complete picture. Thin or absent ClickHouse results mean the data hasn't been indexed — not that the account has no content. **Never conclude an account has "zero content" or "nothing to evaluate" based solely on ClickHouse returning few or no results.**

When ClickHouse returns fewer than 20 posts for a subject, or when the reporter's claims cannot be verified from ClickHouse data alone, the subagent MUST supplement by fetching posts directly from the account's PDS using `list_records` (PDSX tool) with collection `app.bsky.feed.post`. This retrieves the account's actual post history regardless of the ClickHouse indexing window.

### Per-Subject Data Collection

For each subject, dispatch a **Sonnet** subagent to gather context. Use Sonnet for speed — Opus is too slow for per-subject data collection across a batch. The subagent collects all four categories below and returns a structured summary. This preserves the triage agent's context window for classification decisions across the full batch.

**Subagent prompt pattern:**

> Gather moderation context for subject [DID or AT-URI]. Collect: (1) moderation history from ozone_query_events — prior reports, labels, actions, sticky comments; (2) content context — 20 most recent posts from this DID via ClickHouse osprey_execution_results with post text, timestamps, and matched rules, plus rule hits for the past 30 days grouped by rule name with counts; (3) report details — what was reported, by whom, what reason was given; (4) if the subject is a reply, thread context — the parent post, the account being replied to, and the relationship between the accounts.
>
> IMPORTANT: ClickHouse only covers ~2 months of data. If ClickHouse returns fewer than 20 posts, you MUST also fetch posts directly from the account's PDS using the `list_records` PDSX tool with collection `app.bsky.feed.post` and the subject's DID as `repo`. Paginate with limit 25 and use the cursor to fetch multiple pages — aim for at least 50 posts or until you run out of content. This is essential for accounts that pre-date the ClickHouse window or have sparse recent activity.
>
> CRITICAL: Return the full verbatim text of the reported content. Do NOT summarise, paraphrase, or excerpt — reproduce it character-for-character. The analyst needs the exact original text to make moderation decisions. For replies, also return parent posts verbatim.
>
> Based on what you find, return: (a) the reported content verbatim; (b) a recommended classification (label / no_action / investigate_further / escalate / defer) with a recommended label and label level if applicable; (c) the specific evidence supporting that recommendation — key posts, rule hit patterns, moderation history, thread context; (d) whether content was sourced from ClickHouse, PDS list_records, or both — and how many posts were reviewed from each source. Keep the summary concise — key facts and reasoning, not raw data dumps.

The subagent should use the data-analyst agent for ClickHouse queries, the `list_records` PDSX tool directly for PDS record fetching, and MCP tools directly for Ozone queries. The primary agent makes the final classification decision but uses the subagent's recommendation and evidence as input.

#### 1. Moderation History

Query `ozone_query_events` for the subject. Look for:
- Prior reports (how many, how recent, what was reported)
- Prior labels (what's already applied)
- Prior actions (acknowledged, escalated, muted, appealed)
- Moderator comments (especially sticky comments from prior reviews)

This reveals whether the subject is a repeat offender, has prior context, or has already been reviewed.

#### 2. Content Context

Query via data-analyst: pull the 20 most recent posts from DID [subject_did] from osprey_execution_results. Return post text, timestamp, and any rules that matched. Also return any rule hits for this DID in the past 30 days grouped by rule name with hit counts.

If ClickHouse returns fewer than 20 posts, also fetch posts directly from the PDS using `list_records` (PDSX tool) with collection `app.bsky.feed.post` and the subject's DID as `repo`. Paginate to collect at least 50 posts. Record which source each piece of content came from.

ClickHouse covers ~2 months. The PDS holds the full account history. Both are needed for a complete picture — ClickHouse provides rule-match context, the PDS provides content completeness.

#### 3. Report Content

From the `ozone_query_statuses` result, examine the report itself — what was reported, by whom, and what reason was given.

**Reports are nominations, not evidence.** User reports are inherently noisy. A report tells you where to look — it does not tell you what you will find. The reporter's comment, reason, and framing are input to direct your investigation, never a source of evidence for or against the subject. Specifically:

- A reporter's comment is **never sufficient grounds to apply a label.** The evidence must come from the account's actual content, behaviour, and history.
- A reporter's comment is **never sufficient grounds to dismiss a report.** A vague, one-word, or poorly articulated report may still point to a real policy violation. The comment's quality says nothing about the subject's behaviour.
- **Do not psychoanalyse the reporter.** Do not infer the reporter's motives, political alignment, or whether they are acting in "good faith" or "bad faith." These are not observable and are irrelevant to the classification. The only question is: does the subject's actual content and behaviour violate policy?

**Label-name matching:** If the reporter's comment matches or closely resembles a label name from the loaded `.policies/` reference (e.g., "Blue Heart" → `blue-heart-emoji`, "MAGA" → `maga-trump`, "spam" → `spam`), treat it as a **label nomination** and verify the factual claim against the account's actual content and profile.

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

- **PDS record fetching** — "Fetch posts from DID [X] via `list_records` (PDSX tool, collection `app.bsky.feed.post`, repo [DID]). Paginate to get at least 50-100 posts. Return post text and timestamps." Use this whenever ClickHouse data is thin or the reporter's claims can't be verified from indexed content alone.
- **Deeper ClickHouse queries** — "Pull all posts from this DID in the past 7 days that matched rule [X]. Return full post text and timestamps." or "Find all accounts that co-shared URLs with this DID in the past 7 days."
- **Thread expansion** — "Retrieve the full thread for AT-URI [X] — all replies, not just the parent chain."
- **Account relationship check** — "Determine the follow relationship between DID [A] and DID [B]. Check if they have prior interaction history."
- **Content similarity** — "Find posts across the network with similar text to [quoted content] using content_similarity."
- **Additional moderation history** — "Pull full ozone_query_events for DID [X] going back 90 days, not just the default."

The triage agent owns the classification decision. If the initial subagent's evidence leaves gaps, fill them rather than guessing. The cost of an additional Sonnet subagent is trivial compared to a wrong moderation action.

### Batch-Level Bias Check

Processing subjects in batches creates a risk of **anchoring bias** — patterns observed in earlier subjects contaminate the evaluation of later ones. Guard against this:

- **Each subject is independent.** A reporter filing 8 low-quality reports does not make their 9th report low-quality. Evaluate each subject on its own evidence, gathered from the subject's actual content and behaviour.
- **Reporter comments are not evidence — in either direction.** You cannot use a reporter's comment to justify applying a label, and you cannot use it to justify dismissing a report. The comment tells you where to look. The subject's content tells you what to do.
- **Never confabulate explanations.** If you find yourself inventing a narrative to explain why a report is bad-faith (e.g., "known right-wing reporting tactic," "political grievance reporting"), check whether that narrative exists in the policy docs or precedents. If it doesn't, you are fabricating justification for a conclusion you reached by pattern-matching, not reasoning.
- **Verify before dismissing.** Every report — regardless of the reporter's comment quality — requires checking the subject's actual content. A one-word report pointing to a real violation is more important than a detailed report pointing to nothing. The cost of one `get_record` or `list_records` call is trivial compared to a wrong no_action.

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
| `key_evidence` | list | Specific posts with AT-URIs, verbatim text, and editorial notes. Each entry MUST include the full AT-URI (`at://did:plc:.../app.bsky.feed.post/...`) so it can be cited in the evidence comment during Phase 3. For replies, must include thread context with AT-URIs for parent posts. |
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

The summary table is an index, not a decision surface. It helps the analyst navigate the batch, but decisions are made from the detail blocks below. Do NOT put editorialised characterisations in the summary — use factual descriptors only.

```
## Queue Triage: [entry point description]

**Batch Size:** [N] subjects reviewed
**Policy Reference:** [list of .policies/ files loaded]

### Recommended: Label ([n])

| # | Subject | Label | Level | Policy Basis | Confidence |
|---|---------|-------|-------|-------------|------------|
| 1 | at://did:plc:.../app.bsky.feed.post/... (handle) | [label] | post | [policy] | high |
| 2 | did:plc:... (handle) | [label] | account | [policy] | high |

### Recommended: No Action ([n])

| # | Subject | Confidence |
|---|---------|------------|
| 1 | did:plc:... (handle) | high |

### Requires Decision ([n])

| # | Subject | Question |
|---|---------|----------|
| 1 | did:plc:... (handle) | [specific question from defer classification] |

### Recommended: Investigate Further ([n])

| # | Subject | What's Unclear | Suggested Next Step |
|---|---------|---------------|-------------------|
| 1 | did:plc:... (handle) | [ambiguity] | [assess-account / full investigation] |

### Recommended: Escalate ([n])

| # | Subject | Reason |
|---|---------|--------|
| 1 | did:plc:... (handle) | [escalation reason] |
```

### Per-Subject Detail

The detail blocks are the decision surface — the analyst reads these to decide, not the summary table. Present a detail block for **every** subject (not just `label` recommendations). Each block must include:

1. **Factual content the analyst can verify.** This is the most important part. The analyst cannot trust the agent's judgment without seeing what the agent saw. Provide:

   - **For post-level subjects:** the EXACT text of the reported post, reproduced character-for-character. For replies, also show the parent post(s) verbatim so the thread context is visible. Include the AT-URI for each post.
   - **For account-level subjects:** the account's display name, bio/description (verbatim), and the full text of all posts reviewed during data collection — every post, with AT-URIs. Do not sample or truncate. The analyst needs the complete evidence set to verify pattern claims. If the report concerns profile content (e.g., a blue heart emoji, impersonation, a slur in the bio), reproduce the profile fields verbatim.
   - **NEVER summarise, paraphrase, excerpt, or editorialise content in place of showing it.** Characterisations like "right-wing reply-guy" or "combative but contextual" are not evidence — they are conclusions. Show the content, then state the conclusion separately.

2. **The agent's recommendation and reasoning** — classification, policy basis, confidence. This comes AFTER the factual content, not instead of it.

3. **Key evidence** — relevant moderation history, rule hit patterns, thread context, account relationship details. Include AT-URIs for all cited posts.

The analyst should be able to read a detail block and make a decision without needing to go look anything up. If the reported content is an image or media that can't be displayed as text, note that and provide the AT-URI so the analyst can review it directly.

**Then wait for user direction.** Do not proceed to Phase 3 until the user confirms, modifies, or overrides the recommendations.

## Phase 3: Act

Execute the user's confirmed decisions. The user may accept all recommendations, override specific ones, or provide answers to defer questions.

Dispatch action execution to a Haiku subagent to preserve context and reduce cost. The triage agent generates the full action manifest and hands it off — the subagent executes mechanically.

### Step 1: Record Precedents

If the user answered any `defer` questions, write each decision to `.policies/precedents/` before proceeding. This ensures the precedent is recorded even if the session is interrupted during labelling.

### Step 2: Build Evidence Comments

Before dispatching the action subagent, the triage agent MUST build an evidence comment for every label action. Evidence comments are the permanent moderation record — a future reviewer seeing this label must understand exactly why it was applied without re-investigating the account.

**Evidence comment format:**

```
[Label] applied — [one-line policy basis]

Evidence:
- at://did:plc:.../app.bsky.feed.post/[rkey] — "[verbatim post text or excerpt]" — [why this post is relevant]
- at://did:plc:.../app.bsky.feed.post/[rkey] — "[verbatim post text or excerpt]" — [why this post is relevant]
- at://did:plc:.../app.bsky.feed.post/[rkey] — "[verbatim post text or excerpt]" — [why this post is relevant]
```

Requirements:
- **Minimum 2 AT-URIs per label action.** A label without specific post citations is unverifiable. If you can't cite 2 posts, the evidence is insufficient — classify as `investigate_further` instead.
- **Verbatim text or meaningful excerpt** from each cited post. The reader must see what was actually said, not a characterisation of it.
- **Brief editorialisation** after each citation explaining why it's relevant to the label (e.g., "TDS framing per maga-trump precedent", "denies trans identity — one-strike policy", "dehumanising language toward immigrants").
- For account-level labels, cite the posts that establish the pattern. For post-level labels, cite the specific post plus any thread context that's relevant.

### Step 3: Dispatch Action Subagent

Generate the action manifest and dispatch a **Haiku** subagent with the following prompt pattern:

> Execute the following moderation actions. Use batchId [UUID] for all label operations.
>
> **Labels to apply:**
> [For each: subject (AT-URI or DID), label name, level (post/account), evidence comment (built in Step 2)]
>
> **Other actions:**
> [For each: subject, action type (escalate/tag/mute), parameters]
>
> **Acknowledge:**
> [List of all subjects to acknowledge. Use acknowledgeAccountSubjects: true for DIDs.]
>
> For each label, apply the label via `ozone_label` with the evidence comment as the `comment` parameter. Then execute other actions, then acknowledge all subjects. Report back what succeeded and what failed.

The subagent handles:
- Applying labels (AT-URI for post-level, DID for account-level) with evidence comments
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
