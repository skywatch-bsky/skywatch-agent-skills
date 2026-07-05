---
name: skywatch-labeling-standards
description: Evidence comment standards and data sourcing for all Ozone label actions. Defines required comment format, citation requirements, tiered evidence thresholds, and ClickHouse-first data sourcing cascade. Loaded by the ozone_label PreToolUse hook when comments fail validation.
polytoken:
  tags: [skywatch]
---

# Labelling Standards

Every `mcp__skywatch-mcp__ozone_label` action MUST include a comment that meets the standards below. These comments are the permanent moderation record — a future reviewer seeing this label must understand exactly why it was applied without re-investigating.

## Comment Format

Every label comment follows this structure:

```
[Label] applied — [one-line policy basis]

Evidence:
- at://did:plc:.../app.bsky.feed.post/[rkey] — "[verbatim text]" — [editorial note]
```

### Summary Line (Required)

The first line is always:

```
[Label] applied — [one-line policy basis]
```

- `[Label]` — the exact label value being applied (e.g., `troll`, `spam`, `maga-trump`)
- `[one-line policy basis]` — why this label applies, referencing the policy or behavioural pattern (e.g., "coordinated inauthentic behaviour per IO Policy", "dehumanising language toward immigrants — one-strike")

### Evidence Section (Required)

After the summary line, an `Evidence:` block with cited posts.

Each citation line:

```
- at://did:plc:.../app.bsky.feed.post/[rkey] — "[verbatim text or excerpt]" — [editorial note]
```

**Components:**

| Component | Required | Notes |
|-----------|----------|-------|
| AT-URI | Always | Full `at://` URI to the specific post |
| Verbatim text | When quoting text | Exact text from the post in quotes. Required for text posts. Not applicable for image-only posts — describe the content instead |
| Editorial note | Always | Brief explanation of why this citation is relevant to the label (e.g., "TDS framing per maga-trump precedent", "denies trans identity", "bot-like posting cadence") |

## Citation Requirements by Context

### Post-Level Labels (Single Post)

Minimum **1 citation** — the specific post being labelled.

```
troll applied — quote-post trolling targeting original poster

Evidence:
- at://did:plc:abc123/app.bsky.feed.post/xyz789 — "imagine thinking this is a good take lmao ratio" — mocking tone directed at OP, no substantive engagement
```

Include thread context (parent post AT-URI) when the label depends on the reply relationship.

### Account-Level Labels (Pattern-Based)

Minimum **2 citations** — enough to establish a behavioural pattern, not a one-off.

```
spam applied — repetitive promotional posting across multiple threads

Evidence:
- at://did:plc:abc123/app.bsky.feed.post/aaa111 — "Check out [link] for amazing deals!" — promotional post in unrelated thread
- at://did:plc:abc123/app.bsky.feed.post/bbb222 — "You won't believe these prices [link]" — same promotional pattern, different thread
- at://did:plc:abc123/app.bsky.feed.post/ccc333 — "Best deals online [link]" — third instance confirming systematic behaviour
```

### Batch Operations

Batch labelling (multiple subjects, same label) still requires per-subject evidence comments. The batch context (e.g., "sentiment analysis batch", "coordinated network takedown") goes in the summary line's policy basis, NOT as the entire comment.

**Wrong:**
```
Quote post trolling - sentiment analysis batch
```

**Right:**
```
troll applied — quote-post trolling identified in sentiment analysis batch

Evidence:
- at://did:plc:abc123/app.bsky.feed.post/xyz789 — "lol imagine being this wrong" — dismissive mockery with no substantive engagement
```

## Data Sourcing for Evidence

Building an evidence comment requires the actual text of the posts you're citing. Follow this priority order — each step is cheaper and faster than the next:

1. **ClickHouse** (always try first) — query `osprey_execution_results` for the DID's posts. Cheapest source, includes rule match context, covers ~2 months of data. If you already have ClickHouse results from a prior step (triage, investigation, batch analysis), use them — don't re-query.

2. **Slingshot** (for specific AT-URIs) — if you have the AT-URI of the post you're labelling but don't have its text (e.g., it fell outside the ClickHouse window, or you're in a context without ClickHouse access), hydrate it via Slingshot's `getRecordByUri` endpoint. Fast, cached, no auth needed.

3. **PDS direct** (fallback) — use PDSX `mcp__pdsx__get_record` or `mcp__pdsx__list_records` when neither ClickHouse nor Slingshot can provide what you need. This includes: accounts that pre-date the ClickHouse indexing window, taken-down accounts where Slingshot may not have the record cached, or when you need to browse a collection (`listRecords` is not available via Slingshot).

**Never label without reading the content first.** If you can't retrieve the post text through any of these sources, you can't build a valid evidence comment, and the label should not be applied.

## What Fails Validation

The `mcp__skywatch-mcp__ozone_label` PreToolUse hook will **reject** label actions when the comment:

- Is missing entirely
- Has no summary line matching `[label] applied —`
- Has no `Evidence:` section
- Has zero AT-URI citations (`at://` links)
- For account-level labels (subject is a DID, not an AT-URI): has fewer than 2 AT-URI citations

When rejected, the agent receives an error message directing it to load this skill and rebuild the comment.
