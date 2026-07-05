---
name: skywatch-search-incidents
description: Topic-based incident search with relevance scoring and content classification for AT Protocol investigations. Expands search topics into keyword strategies, classifies results by content type and incident confirmation, and produces geographically grouped output. Use when investigating incidents by topic during Phase 1 (Discovery) or as a standalone search.
polytoken:
  tags: [skywatch]
---

# Search Incidents

This skill guides topic-based incident search across AT Protocol content. It defines how to expand a topic into effective search terms, how to classify each result for relevance and content type, and how to present findings grouped by geography with the most relevant results first.

Use this skill when an investigation starts from a topic or event (e.g., "drone strikes in region X", "election interference campaign targeting Y") rather than from a specific account.

## Input

The skill accepts a topic description — a natural language description of the incident or event to search for. Examples:
- "Drone strike casualties in [region]"
- "Election interference targeting [country]"
- "Coordinated harassment campaign against [person/group]"

## Phase 1: Keyword Expansion

Before dispatching search queries, expand the topic into a keyword strategy. This is critical — naive keyword searches miss relevant content and surface noise.

### Expansion Process

1. **Core terms:** Extract the essential nouns and verbs from the topic (e.g., "drone", "strike", "casualties")
2. **Synonyms and variants:** Add alternate terms for each core concept (e.g., "drone" -> "UAV", "unmanned"; "casualties" -> "killed", "dead", "victims", "fatalities")
3. **Regional terms:** If the topic has a geographic focus, include local-language terms and transliterations
4. **Platform-specific terms:** Consider how AT Protocol users discuss this topic (hashtags, common abbreviations, slang)
5. **Exclusion terms:** Identify terms that would produce false matches (e.g., for drone strikes, exclude "drone photography", "drone racing")

### Keyword Strategy Output

Before dispatching queries, document the keyword strategy:

```
**Topic:** [original topic]
**Core terms:** [list]
**Expanded terms:** [list with synonyms/variants]
**Regional terms:** [list, if applicable]
**Exclusion terms:** [list]
**Languages to search:** [list based on geographic focus]
```

## Phase 2: Data Collection

Dispatch the following research questions to the `data-analyst` subagent. Use the keyword strategy to construct effective queries.

### 1. Content Search

**Dispatch to data-analyst:**
"Search osprey_execution_results for posts matching these terms: [expanded keyword list]. Use `mcp__skywatch-mcp__content_similarity` or LIKE/iLIKE patterns as appropriate. Time range: [specified or default 30 days]. Return: post content, author DID, timestamp, any rules that matched, and the match context. Limit to 200 results ordered by recency."

### 2. Account Concentration

**Dispatch to data-analyst:**
"From the content search results, show the top 20 accounts by post count on this topic. For each account: DID, post count, earliest and latest post on topic, and whether they appear in any co-sharing clusters."

### 3. Temporal Distribution

**Dispatch to data-analyst:**
"Show the temporal distribution of posts matching [topic keywords] over [time range]. Group by day and show: date, post count, unique authors. Identify any spikes (days with 2x+ the average volume)."

### Handling Zero Results

If the content search returns no results:
1. Report: "No content matching [topic] found in the specified time range."
2. Suggest broadening: expand the time range, loosen keyword matching, or try alternate terms from the keyword strategy
3. Do NOT attempt classification on empty results — return the empty result with the explanation

## Phase 3: Classification

Classify each result from the content search. Apply the schema to every returned post.

### Per-Result Classification Schema

| Field | Type | Description |
|-------|------|-------------|
| `relevance` | integer 1-10 | How relevant this post is to the search topic (10 = directly about the incident) |
| `content_type` | enum | `incident_report`, `commentary`, `news_aggregation`, `historical_reference`, `unrelated` |
| `incident_confirmed` | enum | `confirmed`, `unconfirmed`, `denied`, `not_applicable` |
| `geographic_focus` | string | Region/country the post references, or "unspecified" |
| `key_details` | string | Brief extraction of factual claims (location, date, numbers) |
| `source_type` | enum | `firsthand`, `secondhand`, `media_repost`, `opinion`, `unknown` |

### Content Type Criteria

| Type | Identifying Features |
|------|---------------------|
| **incident_report** | Specific location, time, and event details. Present tense or recent past tense. Claims direct knowledge or cites a primary source. Includes specifics (numbers, names, places). |
| **commentary** | General statements about the topic. Opinion language ("I think", "this shows", "we should"). References the incident but adds interpretation rather than facts. |
| **news_aggregation** | Reposted headline or article link. Content is from a news source, not original observation. Often includes the source name or URL. |
| **historical_reference** | References a past incident, not a current one. Uses past tense, comparative language ("like the time when", "similar to the [year] incident"). |
| **unrelated** | Matched keywords but is about a different topic entirely. False positive from keyword overlap. |

### Relevance Scoring Guide

| Score | Criteria |
|-------|----------|
| **9-10** | Directly about the searched incident. Contains specific, verifiable details. |
| **7-8** | Clearly related. Discusses the incident but with fewer specifics or from a secondary perspective. |
| **5-6** | Tangentially related. Mentions the topic in passing or discusses the broader context. |
| **3-4** | Weakly related. Keyword match but limited topical overlap. |
| **1-2** | Barely related. Likely a false positive from keyword matching. |

### Minimum Relevance Threshold

Filter results to relevance >= 5 before producing output. Results scoring 1-4 are excluded from the final output but noted in the summary: "N results excluded (relevance < 5)".

## Phase 4: Output

### Default: Structured Search Results

Present results using this format:

```
## Incident Search: [topic]

**Keyword Strategy:** [core terms] + [N expanded terms]
**Time Range:** [range searched]
**Total Results:** [N] (after filtering; [M] excluded below relevance threshold)

### Results by Region

#### [Region 1] ([N] results)

| # | Relevance | Type | Confirmed | Author | Key Details | Date |
|---|-----------|------|-----------|--------|-------------|------|
| 1 | 9 | incident_report | confirmed | [DID] | [key_details] | [date] |
| 2 | 8 | commentary | n/a | [DID] | [key_details] | [date] |

#### [Region 2] ([N] results)
...

#### Unspecified Region ([N] results)
...

### Top Accounts

| Account | Posts on Topic | In Co-sharing Cluster | Earliest | Latest |
|---------|---------------|----------------------|----------|--------|
| [DID] | [count] | [yes/no] | [date] | [date] |

### Regional Breakdown

| Region | Result Count | Incident Reports | Commentary | News | Historical |
|--------|-------------|-----------------|------------|------|------------|
| [region] | [n] | [n] | [n] | [n] | [n] |

### Temporal Spikes
[List any days with 2x+ average volume, with date and count]
```

### On Request: BLIND Report

When a full report is requested, load the `skywatch-reporting-results` skill and produce a report:

- **Bottom Line:** What the search found — incident confirmed/unconfirmed, scale, geographic spread
- **Impact:** Total posts, unique accounts, temporal span, engagement reach
- **Next Steps:** Accounts to investigate further, keywords to monitor, rules to check/create
- **Details:** Full classified results with evidence
- **Timestamps:** Search time range, classification timestamp

Select the **memo** report type for topic searches. Use **cross-cluster** if the search reveals multiple distinct clusters or networks.
