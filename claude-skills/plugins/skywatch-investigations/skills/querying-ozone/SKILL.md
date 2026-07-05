---
name: querying-ozone
description: >-
  Reference guide for Ozone MCP tools — query patterns, filter combinations,
  pagination, write tool conventions, and common recipes. Use when working with
  the Ozone moderation API via MCP tools. Does not prescribe a workflow — see
  working-the-queue for queue triage methodology.
user-invocable: false
---

# Querying Ozone

Reference guide for the 10 Ozone MCP tools available through the skywatch-mcp server. Covers parameter patterns, filter combinations, pagination, and common recipes. Load this skill when you need to interact with the Ozone moderation API.

### Delegation Pattern

Ozone read queries (queue pulls, event history) and write actions (labelling, acknowledging, escalating) should be dispatched to subagents rather than executed inline by the supervisory agent. Pass the subagent the parameters it needs — subject, label, comment, batchId — and let it execute. This preserves the supervisory agent's context window for decision-making.

- **Read queries:** Dispatch to a Sonnet subagent with the research question. Receive a structured summary.
- **Write actions:** Dispatch to a Haiku subagent with a pre-built action manifest. Mechanical execution, no judgment required.

## Credentials

Ozone tools require four environment variables: `OZONE_HANDLE`, `OZONE_ADMIN_PASSWORD`, `OZONE_DID`, `OZONE_PDS`. These are NOT in `.mcp.json` — they must be set in the shell environment or `~/.claude/settings.json`. All tools fail gracefully with a clear error if credentials are missing.

Auth goes through the PDS (via `atproto-proxy` header), not directly to the Ozone service. The `ozoneRequest` helper automatically retries on `ExpiredToken` with a session refresh — no manual retry logic needed.

## Subject Format

All tools accept a `subject` parameter. Two formats:

- **Account-level:** Pass a DID (`did:plc:...`). Actions apply to the account.
- **Post-level:** Pass an AT-URI (`at://did:plc:.../app.bsky.feed.post/...`). Requires `cid` parameter — resolve it via `com.atproto.repo.getRecord` if not already known.

When in doubt, use account-level subjects. Post-level operations are for labelling or acting on specific content rather than the account as a whole.

## Read Tools

### ozone_query_statuses

Query the moderation queue. Returns subjects with their current review state, tags, and metadata.

**Parameters (all optional):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `subject` | string | Filter to a specific DID or AT-URI |
| `review_state` | string | Filter by review state (e.g., open, escalated, closed) |
| `tags` | array | Filter by tags applied to subjects |
| `takendown` | bool | Filter for subjects that have been taken down |
| `appealed` | bool | Filter for subjects with active appeals |
| `limit` | number | Results per page |
| `cursor` | string | Pagination cursor from previous response |
| `sort_field` | string | Field to sort by (e.g., `lastReportedAt`, `lastReviewedAt`) |
| `sort_direction` | string | `asc` or `desc` |

**Common recipes:**

| Goal | Parameters |
|------|-----------|
| Recent user reports | `sort_field: "lastReportedAt"`, `sort_direction: "desc"`, `limit: 20` |
| Open appeals | `appealed: true`, `sort_direction: "desc"` |
| Unreviewed subjects | `review_state: "open"`, `sort_field: "lastReportedAt"`, `sort_direction: "desc"` |
| All reports for one account | `subject: "did:plc:..."` |
| Tagged for follow-up | `tags: ["follow-up"]`, `review_state: "open"` |
| Escalated subjects | `review_state: "escalated"` |

**Pagination:** When results exceed `limit`, the response includes a `cursor`. Pass it in the next call to get the next page. Continue until no cursor is returned.

### ozone_query_events

Query moderation event history. Returns a log of all moderation actions taken on subjects.

**Parameters (all optional):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `subject` | string | Filter to a specific DID or AT-URI |
| `types` | array | Filter by event type (e.g., label, acknowledge, comment, escalate, tag, mute, report) |
| `created_by` | string | Filter by moderator DID |
| `created_after` | string | ISO datetime — events after this time |
| `created_before` | string | ISO datetime — events before this time |
| `added_labels` | array | Filter for events that applied specific labels |
| `has_comment` | bool | Filter for events with comments |
| `limit` | number | Results per page |
| `cursor` | string | Pagination cursor |
| `sort_direction` | string | `asc` or `desc` |

**Common recipes:**

| Goal | Parameters |
|------|-----------|
| Full moderation history for an account | `subject: "did:plc:..."`, `sort_direction: "asc"` |
| Recent label actions | `types: ["label"]`, `sort_direction: "desc"`, `limit: 50` |
| Events by a specific moderator | `created_by: "did:plc:..."`, `sort_direction: "desc"` |
| All actions in a time window | `created_after: "2026-04-01T00:00:00Z"`, `created_before: "2026-04-28T00:00:00Z"` |
| Check if a label was ever applied | `subject: "did:plc:..."`, `added_labels: ["spam"]` |
| Events with moderator notes | `has_comment: true`, `sort_direction: "desc"` |

## Write Tools

### Common Conventions

**batchId:** All write tools accept an optional `batchId` (UUID string). Use a single batchId to group related operations — e.g., all labels applied during one queue triage session share one batchId. Generate a new UUID for each logical batch of work. Different types of actions (labelling vs. acknowledging) within the same session may use the same batchId if they're part of the same workflow.

**comment:** Most write tools accept an optional `comment`. Use it to record reasoning for the action. Comments become part of the permanent moderation event history.

**Metadata:** All write tools automatically include `modTool` metadata (`name: "skywatch-mcp"`) for traceability.

### ozone_label

Apply or remove a moderation label.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subject` | yes | DID or AT-URI |
| `label` | yes | Label string to apply or remove |
| `action` | yes | `"apply"` or `"remove"` |
| `cid` | post-level only | Content hash for AT-URI subjects |
| `comment` | no | Reasoning for the label action |
| `batchId` | no | UUID grouping related operations |
| `duration_in_hours` | no | For temporary labels — auto-expires after this duration |

**When to use:** After reviewing evidence and determining a policy violation. Use `duration_in_hours` for temporary labels on borderline cases or time-limited enforcement.

### ozone_acknowledge

Move a subject from open/reported to reviewed. Closes reports.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subject` | yes | DID or AT-URI |
| `acknowledgeAccountSubjects` | no | `true` to acknowledge all reported content by this account |
| `comment` | no | Reasoning |
| `cid` | post-level only | Content hash |
| `batchId` | no | UUID |

**When to use:** After reviewing a subject and completing all actions (labelling, no-action, etc.). Acknowledgement closes the report in the queue. Use `acknowledgeAccountSubjects: true` to bulk-close all reports for an account in one call.

### ozone_comment

Add a comment to a subject's moderation record.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subject` | yes | DID or AT-URI |
| `comment` | yes | Comment text |
| `sticky` | no | `true` for persistent visibility in the moderation UI |
| `cid` | post-level only | Content hash |
| `batchId` | no | UUID |

**When to use:** To record observations, investigation notes, or context that other moderators should see. Use `sticky: true` for important context that should remain visible (e.g., "this account is part of a coordinated network — see investigation report YYYY-MM-DD").

### ozone_escalate

Escalate a subject for higher-level review.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subject` | yes | DID or AT-URI |
| `comment` | no | Reasoning for escalation |
| `cid` | post-level only | Content hash |
| `batchId` | no | UUID |

**When to use:** When a subject requires review by someone with more authority or context — policy edge cases, high-profile accounts, potential legal issues.

### ozone_tag

Add or remove tags from a subject's moderation record.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subject` | yes | DID or AT-URI |
| `add` | no | Array of tag strings to add |
| `remove` | no | Array of tag strings to remove |
| `comment` | no | Reasoning |
| `cid` | post-level only | Content hash |
| `batchId` | no | UUID |

At least one of `add` or `remove` is required.

**When to use:** For categorisation, tracking, or workflow routing. Tags are searchable via `ozone_query_statuses`.

### ozone_mute

Mute a subject for a specified duration.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subject` | yes | DID or AT-URI |
| `duration_in_hours` | yes | How long to mute |
| `comment` | no | Reasoning |
| `cid` | post-level only | Content hash |
| `batchId` | no | UUID |

**When to use:** To suppress a subject from the queue temporarily — e.g., an account that's been reviewed but may need re-evaluation after a cooling period.

### ozone_unmute

Remove a mute from a previously muted subject.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subject` | yes | DID or AT-URI |
| `comment` | no | Reasoning |
| `cid` | post-level only | Content hash |
| `batchId` | no | UUID |

### ozone_resolve_appeal

Resolve an appeal on a subject.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subject` | yes | DID or AT-URI |
| `comment` | yes | Explanation of the resolution (required) |
| `cid` | post-level only | Content hash |
| `batchId` | no | UUID |

**When to use:** When a user has appealed a moderation action and you've reviewed the appeal. The comment is mandatory — document why the appeal was upheld or denied.

## Gotchas

- **Credentials not in .mcp.json** — set `OZONE_HANDLE`, `OZONE_ADMIN_PASSWORD`, `OZONE_DID`, `OZONE_PDS` in your shell or settings
- **Auth route:** PDS proxy, not direct Ozone connection
- **cid required for post-level:** If you have an AT-URI but no cid, resolve it first via `com.atproto.repo.getRecord`
- **Auto-retry on token expiry:** The `ozoneRequest` helper handles `ExpiredToken` automatically — don't add manual retry logic
- **Acknowledge closes reports:** Acknowledgement is the "done" action — use it after all other actions are complete, not before
- **batchId is optional but recommended:** Makes audit trails traceable — group related operations under one UUID
