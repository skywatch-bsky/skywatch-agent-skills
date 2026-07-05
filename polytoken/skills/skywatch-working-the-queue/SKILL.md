---
name: skywatch-working-the-queue
description: OODA-based moderation queue triage — observe reports, orient with context and policy, decide on classification, act on user-confirmed decisions. Supports multiple entry points (reports, appeals, tags, proactive filtering). Use when triaging the Ozone moderation queue or processing moderation reports.
polytoken:
  tags: [skywatch]
---

# Working the Queue

This skill guides moderation queue triage using an OODA loop: **observe** the report, **orient** with additional context and policy guidance, **decide** whether it violates a policy, then **act** on user-confirmed decisions. The goal is efficient batch processing where the analyst reviews AI recommendations rather than raw reports.

### Subagent Model Selection

The primary triage agent delegates work to subagents to preserve its context window:

| Task | Model | Rationale |
|------|-------|-----------|
| Per-subject data collection & recommendation (Phase 1) | `data-analyst` | Speed |
| Follow-up investigation queries (Phase 1) | `data-analyst` | Additional ClickHouse or Ozone queries when initial evidence is insufficient |
| Ozone read queries (queue pulls, event history) | `data-analyst` | Rote data retrieval; return structured summaries to the supervisor |
| Action execution — labelling, acknowledging, escalating (Phase 3) | `general-purpose-mini` | Mechanical execution of a pre-built manifest; no judgment required |

The primary Opus agent makes all classification and presentation decisions. Everything else — data gathering, Ozone queries, action execution — is delegated. Pass subagents the information they need (DIDs, AT-URIs, labels, comments, batchIds) and receive summaries or execution confirmations back.

## Prerequisites

### Load Reference Skill

Load the `skywatch-querying-ozone` skill for Ozone tool parameter guidance, filter combinations, and conventions.

### Load Policy Guidance

Check for a `.policies/` directory in the current working directory. Read all files within it — these contain label definitions, enforcement criteria, and policy guidance that inform classification decisions.

If `.policies/` also contains a `precedents/` subdirectory, read those files too. Precedents are prior analyst decisions on ambiguous cases that serve as case law for future classification.

If no `.policies/` directory is found, warn the user: "No .policies/ directory found in the current working directory. Proceeding without policy-specific guidance — classifications will be based on general moderation principles. Consider creating .policies/ with your label definitions and enforcement criteria."

## Input

Two parameters, both provided by the user:

- **Entry point** — what to pull from the queue. Determines the `mcp__skywatch-mcp__ozone_query_statuses` filter:

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

When ClickHouse data is insufficient and the reporter's claims cannot be verified, note this in the classification as `investigate_further` or flag it to the analyst. **Do NOT automatically fetch additional posts from the PDS** — reserve deeper content fetching for when the analyst explicitly requests more context.

### Per-Subject Data Collection

For each subject, dispatch the `data-analyst` subagent to gather context. Use the `data-analyst` for speed — Opus is too slow for per-subject data collection across a batch. The subagent collects all four categories below and returns a structured summary. This preserves the triage agent's context window for classification decisions across the full batch.

**Subagent prompt pattern:**

> Gather moderation context for subject [DID or AT-URI]. **ClickHouse is your primary data source** — it's cheap and fast. Only fall back to querying the PDS directly (PDSX tools) when ClickHouse cannot provide what you need (e.g., the account pre-dates the ClickHouse window, or the account has been taken down and PDS records are unavailable).
>
> Collect in this order:
> (1) **Rule hits** — query ClickHouse osprey_execution_results for all rule hits for this DID in the past 30 days, grouped by rule name with counts. This is the cheapest signal and should be checked first.
> (2) **Content context** — 5 most recent posts from this DID via ClickHouse osprey_execution_results with post text, timestamps, and matched rules.
> (3) **Profile** — fetch the account's profile via ClickHouse if available, otherwise fall back to `mcp__pdsx__get_record` (PDSX, uri `app.bsky.actor.profile/self`, repo [DID]). Return the handle, display name, and bio/description verbatim. For taken-down accounts, ClickHouse is the only source — note if the profile fetch fails.
> (4) **Moderation history** — from `mcp__skywatch-mcp__ozone_query_events`: prior reports, labels, actions, sticky comments.
> (5) **Report details** — what was reported, by whom, what reason was given.
> (6) If the subject is a reply, **thread context** — the parent post, the account being replied to, and the relationship between the accounts.
>
> DATA SOURCE PRIORITY: ClickHouse first, always. It covers ~2 months of data and includes rule match context. Only use PDSX tools (`mcp__pdsx__get_record`, `mcp__pdsx__list_records`) as a fallback when ClickHouse has no data for this subject — e.g., the account pre-dates the indexing window, or you need a profile that isn't in ClickHouse. For taken-down accounts, ClickHouse may be the ONLY source of post content — the PDS will return errors.
>
> TOKEN BUDGET: Fetch a MAXIMUM of 5 posts for content context. If the subject is a reply, also fetch the thread context (parent chain up to 3 levels) — this does NOT count against the 5-post cap. Do NOT fetch additional posts beyond the cap. If 5 posts are insufficient for a confident classification, recommend `investigate_further` and note what additional context would help.
>
> CRITICAL: Return ALL content verbatim. Do NOT summarise, paraphrase, or excerpt. The analyst reviews the evidence and makes the decision — the agent's role is to gather and present, not to judge. Specifically return:
> (a) The account's handle, display name, and bio/description — verbatim.
> (b) The reported content verbatim (for post-level subjects). For replies, also return parent posts verbatim.
> (c) The full text of every post reviewed, with AT-URIs and timestamps.
> (d) Rule hit summary — which rules fired, how many times, over what period.
> (e) A recommended classification (label / no_action / investigate_further / escalate / defer) with a recommended label and label level if applicable.
> (f) The specific evidence supporting that recommendation — rule hit patterns, moderation history, thread context.
> (g) How many posts were reviewed and whether the 5-post cap limited the assessment (if so, note what additional context might change the recommendation).

The subagent should use the `data-analyst` subagent for ClickHouse queries and MCP tools directly for Ozone queries. Only use PDSX tools (`mcp__pdsx__get_record`, `mcp__pdsx__list_records`) as a fallback when ClickHouse cannot provide what's needed. The primary agent makes the final classification decision but uses the subagent's recommendation and evidence as input.

#### 1. Rule Hits (ClickHouse)

Query via data-analyst: pull all rule hits for DID [subject_did] from osprey_execution_results in the past 30 days, grouped by rule name with hit counts. This is the cheapest signal and often sufficient to determine whether an account is triggering relevant rules.

#### 2. Content Context (ClickHouse)

Query via data-analyst: pull the **5 most recent posts** from DID [subject_did] from osprey_execution_results. Return post text, timestamp, and any rules that matched.

**Do NOT automatically fetch additional posts from the PDS.** 5 posts plus rule hit summaries is sufficient for initial triage. Only fall back to PDSX `mcp__pdsx__list_records` if ClickHouse returns zero posts for this DID. If the evidence is insufficient, classify as `investigate_further` — the analyst can request deeper content fetching.

#### 3. Moderation History

Query `mcp__skywatch-mcp__ozone_query_events` for the subject. Look for:
- Prior reports (how many, how recent, what was reported)
- Prior labels (what's already applied)
- Prior actions (acknowledged, escalated, muted, appealed)
- Moderator comments (especially sticky comments from prior reviews)

This reveals whether the subject is a repeat offender, has prior context, or has already been reviewed.

#### 4. Report Content

From the `mcp__skywatch-mcp__ozone_query_statuses` result, examine the report itself — what was reported, by whom, and what reason was given.

**Reports are nominations, not evidence.** User reports are inherently noisy. A report tells you where to look — it does not tell you what you will find. The reporter's comment, reason, and framing are input to direct your investigation, never a source of evidence for or against the subject. Specifically:

- A reporter's comment is **never sufficient grounds to apply a label.** The evidence must come from the account's actual content, behaviour, and history.
- A reporter's comment is **never sufficient grounds to dismiss a report.** A vague, one-word, or poorly articulated report may still point to a real policy violation. The comment's quality says nothing about the subject's behaviour.
- **Do not psychoanalyse the reporter.** Do not infer the reporter's motives, political alignment, or whether they are acting in "good faith" or "bad faith." These are not observable and are irrelevant to the classification. The only question is: does the subject's actual content and behaviour violate policy?

**Label-name matching:** If the reporter's comment matches or closely resembles a label name from the loaded `.policies/` reference (e.g., "Blue Heart" → `blue-heart-emoji`, "MAGA" → `maga-trump`, "spam" → `spam`), treat it as a **label nomination** and verify the factual claim against the account's actual content and profile.

#### 5. Reply Thread Context

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

The initial scan is intentionally lean (5 posts per subject). When the analyst requests more context — or when a subject is classified as `investigate_further` and the analyst approves deeper investigation — dispatch additional `data-analyst` subagents. **Do not proactively fetch additional posts beyond the initial 5 unless the analyst asks.**

Examples of follow-up dispatches (analyst-triggered):

- **More posts** — "Fetch up to 10 additional posts from DID [X] via ClickHouse or `mcp__pdsx__list_records` (PDSX tool, collection `app.bsky.feed.post`, repo [DID]). Return post text, AT-URIs, and timestamps." Cap at 10 posts per follow-up request.
- **Deeper ClickHouse queries** — "Pull all posts from this DID in the past 7 days that matched rule [X]. Return full post text and timestamps." or "Find all accounts that co-shared URLs with this DID in the past 7 days."
- **Thread expansion** — "Retrieve the full thread for AT-URI [X] — all replies, not just the parent chain."
- **Account relationship check** — "Determine the follow relationship between DID [A] and DID [B]. Check if they have prior interaction history."
- **Content similarity** — "Find posts across the network with similar text to [quoted content] using `mcp__skywatch-mcp__content_similarity`."
- **Additional moderation history** — "Pull full `mcp__skywatch-mcp__ozone_query_events` for DID [X] going back 90 days, not just the default."

The triage agent owns the classification decision. When evidence is thin, classify as `investigate_further` rather than guessing — let the analyst decide whether to invest tokens in deeper investigation.

### Batch-Level Bias Check

Processing subjects in batches creates a risk of **anchoring bias** — patterns observed in earlier subjects contaminate the evaluation of later ones. Guard against this:

- **Each subject is independent.** A reporter filing 8 low-quality reports does not make their 9th report low-quality. Evaluate each subject on its own evidence, gathered from the subject's actual content and behaviour.
- **Reporter comments are not evidence — in either direction.** You cannot use a reporter's comment to justify applying a label, and you cannot use it to justify dismissing a report. The comment tells you where to look. The subject's content tells you what to do.
- **Never confabulate explanations.** If you find yourself inventing a narrative to explain why a report is bad-faith (e.g., "known right-wing reporting tactic," "political grievance reporting"), check whether that narrative exists in the policy docs or precedents. If it doesn't, you are fabricating justification for a conclusion you reached by pattern-matching, not reasoning.
- **Verify before dismissing.** Every report — regardless of the reporter's comment quality — requires checking the subject's actual content. A one-word report pointing to a real violation is more important than a detailed report pointing to nothing. The cost of one `mcp__pdsx__get_record` or `mcp__pdsx__list_records` call is trivial compared to a wrong no_action.

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
| `investigate_further` | Signals suggest problematic behaviour but the quick scan is insufficient. Needs deeper investigation (e.g., via `skywatch-assess-account` or `skywatch-conducting-investigations`). |
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

The detail blocks are the decision surface — the analyst reads these to decide, not the summary table. Present a detail block for **every** subject (not just `label` recommendations).

**Do NOT invent alternative presentation formats.** No "key evidence" summary sections, no one-liner evidence lists, no collapsed characterisations. Use the template below for every subject. The template exists because previous versions of this agent replaced evidence with editorialised summaries — which is useless for moderation decisions.

**Template (mandatory format):**

```
---
### #[N] — [handle] ([DID])

**Profile:**
- Display Name: [verbatim]
- Bio: [verbatim, full text]
- Handle: [handle]

**Report:** [reporter handle] reported [post AT-URI or account DID] — reason: "[reporter's comment verbatim]"

**Content Reviewed:**

1. at://did:plc:.../app.bsky.feed.post/[rkey1]
   "[full verbatim post text]"

2. at://did:plc:.../app.bsky.feed.post/[rkey2]
   "[full verbatim post text]"

3. at://did:plc:.../app.bsky.feed.post/[rkey3]
   "[full verbatim post text]"

[...continue for ALL posts reviewed — do not truncate, sample, or summarise...]

**Moderation History:** [prior labels, reports, actions — or "none"]

**Data Sources:** [N] posts from ClickHouse, [N] posts from PDS `mcp__pdsx__list_records`, profile from `mcp__pdsx__get_record`

**Recommendation:** [classification] — [label if applicable] at [level]
**Policy Basis:** [policy reference]
**Confidence:** [high/medium/low]
**Reasoning:** [agent's reasoning — AFTER the content, not instead of it]
---
```

Rules:
- Every post in "Content Reviewed" must have its full AT-URI and full verbatim text. No excerpts, no "[post about X]" placeholders, no editorialisation in place of content.
- For replies, show the parent post(s) above the reply with their AT-URIs so the thread reads top-to-bottom.
- For images or media that can't be displayed as text, write "[image]" and provide the AT-URI so the analyst can review it directly.
- Profile fields are always verbatim. If a field is empty, write "(none)".
- The "Content Reviewed" section must include ALL posts the subagent reviewed, not a curated subset.
- **NEVER summarise, paraphrase, excerpt, or editorialise content in place of showing it.** Characterisations like "right-wing reply-guy" or "combative but contextual" are not evidence — they are conclusions. The content speaks for itself.

**Human in the loop:** The agent presents evidence and recommendations. The analyst makes decisions. No label is applied without the analyst's explicit confirmation. Verbose output is expected and preferred — more evidence is always better than less.

**Then wait for user direction.** Do not proceed to Phase 3 until the user confirms, modifies, or overrides the recommendations.

## Phase 3: Act

Execute the user's confirmed decisions. The user may accept all recommendations, override specific ones, or provide answers to defer questions.

Dispatch action execution to the `general-purpose-mini` subagent to preserve context and reduce cost. The triage agent generates the full action manifest and hands it off — the subagent executes mechanically.

### Step 1: Record Precedents

If the user answered any `defer` questions, write each decision to `.policies/precedents/` before proceeding. This ensures the precedent is recorded even if the session is interrupted during labelling.

### Step 2: Build Evidence Comments

Before dispatching the action subagent, the triage agent MUST build an evidence comment for every label action per the `skywatch-labeling-standards` skill. If you can't meet the citation threshold for a label, classify as `investigate_further` instead.

Queue triage always uses the **account-level standard** (minimum 2 citations) even for post-level labels, because triage decisions should demonstrate pattern awareness. For post-level labels, cite the specific post plus thread context.

### Step 3: Dispatch Action Subagent

Generate the action manifest and dispatch the `general-purpose-mini` subagent with the following prompt pattern:

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
> For each label, apply the label via `mcp__skywatch-mcp__ozone_label` with the evidence comment as the `comment` parameter. Then execute other actions, then acknowledge all subjects. Report back what succeeded and what failed.

The subagent handles:
- Applying labels (AT-URI for post-level, DID for account-level) with evidence comments
- Adding `mcp__skywatch-mcp__ozone_comment` with reasoning where the decision was non-obvious
- `mcp__skywatch-mcp__ozone_escalate` for escalation subjects
- `mcp__skywatch-mcp__ozone_tag` for tagging subjects
- `mcp__skywatch-mcp__ozone_mute` for suppression subjects
- `mcp__skywatch-mcp__ozone_acknowledge` for ALL processed subjects (both labelled and no-action — acknowledgement closes the report)
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
