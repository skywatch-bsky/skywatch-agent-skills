---
name: conducting-investigations
description: Six-phase investigation methodology for AT Protocol network analysis — from initial discovery through reporting. Covers tool selection, signal identification, evidence standards, and directory conventions. Use when conducting or planning investigations.
user-invocable: false
---

# Conducting Investigations

This skill guides investigation of suspicious activity on the AT Protocol, using a structured six-phase methodology that moves from broad discovery to targeted evidence gathering and final reporting.

### ClickHouse Query Delegation

All ClickHouse queries must be dispatched to Sonnet subagents. ClickHouse querying is a rote activity — formulate SQL, execute, parse — and it consumes context window space with raw data. Dispatch a subagent with the research question, receive a structured summary back. The investigator works from summaries, not raw query results. MCP tools (co-sharing, recon) can be called directly.

## Phase 1: Discovery

Start from a lead — reported accounts, rule hits, or suspicious patterns observed. The goal is rapid initial assessment to decide whether deeper investigation is warranted.

**Data Collection:**
- Query ClickHouse for the target account's rule hit history
- Pull all hits across all rules for the past 30-90 days
- Note which rules trigger most frequently
- Check for domain or URL mentions in the flagged content
- Check `account_entropy_results` for bot-like flags on target accounts
- Check `url_overdispersion_results` for anomalous domain sharing involving target accounts
- Check `quote_overdispersion_results` — are this account's posts being quoted at anomalous rates?
- Check URL and quote co-sharing clusters for the target account
- Check `pds_signup_anomalies` for the account's PDS host
- Pull Ozone moderation history — prior labels, reports, escalations, appeals
- Fetch the AT Protocol profile record for presentation and impersonation checks

**Tool Guidance:**

Dispatch a Sonnet subagent for all ClickHouse queries — the task is rote and preserves the investigator's context window for analysis:

- Subagent: "Pull rule hit history for DID [X] — temporal distribution, rule types triggered, counts by rule over the past 90 days"
- Subagent: "Check account_entropy_results for DID [X] — is it flagged as bot-like? Return entropy values"
- Subagent: "Check url_overdispersion_results for DID [X] — does this account appear in sample_dids for any anomalous domains?"
- Subagent: "Check quote_overdispersion_results for DID [X] — does this account appear as quoted_author_did with anomalous quoting rates? Also check if this DID appears in sample_dids (as a quoter in campaigns)"
- Subagent: "Check pds_signup_anomalies for the PDS hosting DID [X] — any anomalous signup volume?"
- Subagent: "Check quote_cosharing_membership for DID [X] — is this account part of any quote co-sharing clusters?"
- `cosharing_clusters` with `did` — Check if target accounts belong to any URL co-sharing clusters. Cluster membership is an early coordination signal.
- `ozone_query_statuses` with the target DID — Pull current moderation status: existing labels, review state, tags, open reports
- `ozone_query_events` with the target DID — Pull moderation event log: prior labelling actions, escalations, appeals, reviewer comments
- `domain_check` — Verify any domains mentioned in problematic content
- `describe_repo` (PDSX) or Slingshot `getRecord` — Fetch the AT Protocol profile (display name, bio, avatar) for impersonation checks

**Signals to Document:**
- Volume of rule hits (count and frequency)
- Temporal clustering — are hits concentrated in time windows?
- Rule patterns — which rules trigger repeatedly?
- Content red flags — domains, repeated phrases, suspicious URLs
- Account entropy flags — is the account flagged as bot-like? What are the entropy values?
- Domain overdispersion — are any domains shared by this account flagged as anomalous?
- Quote overdispersion — are this account's posts being quoted at anomalous rates (target of pile-on)?
- Co-sharing cluster membership — URL clusters and/or quote clusters? What's the cluster size and evolution type?
- Moderation history — prior labels, appeals, escalations? Repeat offender pattern?
- Profile signals — impersonation indicators, custom domain handle registration details?

**Decision Point:**
- Does the account show patterns worth deeper investigation?
- Are there multiple rules triggered or a single isolated hit?
- Proceed to Phase 2 (Characterization) if the pattern warrants further analysis.

---

## Phase 2: Characterization

Build a comprehensive profile of the target account(s). This phase focuses on understanding the account's normal behaviour, infrastructure, and operational patterns.

**Data Collection:**
- Complete activity timeline from account creation to present
- Posting patterns: frequency, timing, content themes
- Infrastructure: PDS host, account creation date, registration domain (if applicable)
- Profile characteristics: avatar, display name, bio changes (from AT Protocol profile record)
- Account entropy scores — hourly and interval entropy values, bot-like classification
- Ozone moderation history — build a timeline of prior moderation actions alongside the activity timeline
- Protocol-level identity — handle history, PDS migrations, custom domain details

**Tool Guidance:**

Dispatch a Sonnet subagent for ClickHouse queries:

- Subagent: "Generate a detailed activity timeline for DID [X] — posting statistics by hour/day, content themes, total volume"
- Subagent: "Get entropy scores from account_entropy_results for DID [X]. High hourly_entropy (≥ 3.9) = uniform 24-hour posting; low interval_entropy (≤ 1.5) = mechanical spacing. Both = is_bot_like."
- `ozone_query_events` with the target DID — Integrate moderation events into the activity timeline (when were labels applied? when were appeals filed? when were labels removed?)
- `describe_repo` (PDSX) or Slingshot — Fetch current profile record. Check `app.bsky.actor.profile/self` for bio, avatar, display name. Use `list_records` with `app.bsky.graph.follow` to sample follow targets if follow-farming is suspected.
- `ip_lookup` — Resolve any IP addresses associated with content or metadata
- `whois_lookup` — Query registration details for discovered domains. Always run on custom-domain handles.

**Signals to Document:**
- Posting volume and temporal distribution (concentrated hours vs. 24/7 activity?)
- Content themes and language patterns
- Account age relative to activity intensity
- Infrastructure patterns (shared PDS, content delivery patterns)
- Entropy profile — does the account's temporal signature look automated? Compare raw values against thresholds.
- Moderation timeline — when were labels applied/removed? Is there a pattern of offence → label → appeal → re-offence?
- Profile presentation — does the bio/avatar suggest impersonation? Has the display name changed to evade detection?

**Decision Point:**
- Is the behaviour consistent with a bot, human, or coordinated group?
- Are there indicators of deception (fake profile, mismatched metadata)?
- Proceed to Phase 3 (Linkage) if the account shows signs of coordination or anomalous behaviour.

---

## Phase 3: Linkage

Find connected accounts. This phase identifies other accounts exhibiting similar behaviour, content, or infrastructure characteristics.

**Data Collection:**
- Content similarity matching across the network
- Temporal correlation: accounts posting identical or similar content at similar times
- Infrastructure correlation: accounts sharing PDS hosts, domains, or IP patterns
- Shared bot-like entropy profiles across accounts
- Shared anomalous domain sharing patterns
- URL co-sharing cluster membership — accounts in the same cluster are sharing the same URLs on the same days
- Quote co-sharing cluster membership — accounts in the same cluster are quoting the same posts on the same days
- Quote overdispersion — are specific posts being quote-amplified by the network?
- Ozone cross-referencing — do linked accounts share moderation tags, labels, or escalation history?

**Tool Guidance:**

Dispatch a Sonnet subagent for ClickHouse queries:

- Subagent: "Cluster these DIDs by shared patterns — same URLs, same domains, same posting times. Use GROUP BY to find commonalities."
- Subagent: "Check account_entropy_results for DIDs [list]. Which are flagged is_bot_like? Do they share similar entropy profiles?"
- Subagent: "Check url_overdispersion_results — do any of these DIDs appear together in sample_dids for the same anomalous domain?"
- Subagent: "Check quote_overdispersion_results — are any posts by these DIDs being quoted at anomalous rates? Also check if these DIDs co-appear in sample_dids as quoters of the same target"
- Subagent: "Check quote_cosharing_membership for DIDs [list] — are any of these accounts in the same quote co-sharing clusters? Return cluster_ids, member_counts, sample_uris"
- `content_similarity` — Find accounts posting the same or similar content (detects copypasta, template reuse)
- `cosharing_clusters` with `did` — Check if target accounts belong to URL co-sharing clusters. Multiple target accounts in the same cluster is strong evidence of coordination.
- `cosharing_pairs` with `did` — Drill into raw co-sharing edges to see exactly which URLs are being co-shared and with whom.
- `cosharing_evolution` with `cluster_id` — If a cluster is found, trace its history to understand when the coordination started and how the network has evolved.
- `ozone_query_statuses` with tags — Check if linked accounts share Ozone tags (e.g., same campaign tag applied by a prior reviewer). Shared tags from prior reviews are a strong linkage signal.

**Signals to Document:**
- Content overlap (exact matches vs. paraphrased)
- Timing synchronisation — do linked accounts post within minutes of each other?
- Shared infrastructure — PDS hosts, domain registrations, ASN overlap
- Account clustering — which accounts form tight groups?
- Shared automation signature — do linked accounts have similar entropy profiles?
- Domain campaign co-participation — do accounts share the same anomalous domains?
- URL co-sharing cluster membership — are accounts in the same cluster? How large is the cluster? What URLs are being pushed?
- Quote co-sharing cluster membership — are accounts coordinating quote-post campaigns? Which posts are being targeted?
- Quote overdispersion targets — are specific posts from the network (or targeting the network) being amplified at anomalous rates?
- Shared moderation history — do linked accounts carry the same Ozone tags or labels from prior reviews?

**Decision Point:**
- Is there evidence of coordination or are these coincidental similarities?
- Are there 2-3 accounts or a larger network?
- Proceed to Phase 4 (Amplification Mapping) if coordination is evident.

---

## Phase 4: Amplification Mapping

Understand how the network's content spreads and what it targets. This phase reveals strategy and impact.

**Data Collection:**
- Repost chains: track how content spreads through the network
- Quote posts and replies: identify engagement patterns
- Target identification: which accounts/topics receive amplification?
- Engagement metrics: likes, reposts, replies per content
- Quote overdispersion: which specific posts are being amplified at anomalous rates?
- External domain campaigns: which URLs are being pushed and at what volume?

**Tool Guidance:**

Dispatch a Sonnet subagent for ClickHouse queries:

- Subagent: "Aggregate engagement patterns for these DIDs [list] — track content through reply trees, repost chains, quote posts"
- Subagent: "Query quote_overdispersion_results for quoted_author_did IN [network DIDs]. Which posts from the network are receiving anomalous quote amplification? Return quoted_uri, total_shares, unique_sharers, volume_p_value"
- Subagent: "Query url_overdispersion_results for domains shared by the network. Are any domains being pushed at anomalous rates? Cross-reference sample_dids with network DIDs."
- `url_expand` — Resolve shortened URLs and link redirects to understand traffic targeting
- Slingshot `getRecordByUri` — Hydrate the most-amplified AT-URIs into full post records for content analysis
- `ozone_query_statuses` — Check if amplification targets have already been reported or labelled

**Signals to Document:**
- Most-amplified content themes
- Primary targets (accounts, topics, hashtags)
- Amplification velocity (how quickly content spreads)
- External links and traffic destinations
- Quote overdispersion hits — specific posts receiving statistically anomalous amplification
- Domain overdispersion hits — specific domains being pushed at anomalous rates by the network

**Decision Point:**
- What is the network's strategic objective (harassment, propaganda, viral content)?
- Is the amplification effective (significant reach)?
- Proceed to Phase 5 (Rule Validation) to assess current detection coverage.

---

## Phase 5: Rule Validation

Test whether existing rules catch the identified network. This phase reveals detection gaps.

**Data Collection:**
- Analyse rule hit coverage across all identified accounts
- Compare rule triggers with actual problematic behaviour
- Identify patterns that should trigger rules but don't

**Tool Guidance:**

Dispatch a Sonnet subagent for ClickHouse queries:

- Subagent: "Aggregate rule hits for DIDs [list] by account and rule type. Compare hit distribution before and after [date] to assess detection coverage."

**Signals to Document:**
- Rules that catch the network (coverage percentage)
- Rules that miss the network (gaps)
- Behaviour patterns that evade detection
- Suggested rule improvements or new rules needed

**Decision Point:**
- Is the network adequately covered by existing rules?
- Are there actionable gaps that require new rules?
- Proceed to Phase 6 (Reporting) with findings.

---

## Phase 6: Reporting

Synthesise all findings into a structured, actionable report. This phase produces the final artefact.

**Actions:**
- Select appropriate report type (memo, cluster deep-dive, cross-cluster, rule check)
- Structure findings using the BLIND format (see `reporting-results` skill)
- Apply labels via `ozone_label` if the investigation warrants enforcement action
- Apply tags via `ozone_tag` to link accounts to the investigation (e.g., campaign name tags)
- Add investigator notes via `ozone_comment` for accounts that need ongoing monitoring
- Store the report in the investigation directory using the naming convention

**Tool Guidance:**
- Consult `reporting-results` skill for formatting requirements
- `ozone_label` — Apply moderation labels if warranted
- `ozone_tag` — Tag investigated accounts with the case name for future correlation
- `ozone_comment` — Add context notes that future reviewers will see when the account surfaces again
- `ozone_escalate` — Escalate accounts that meet the escalation criteria above

**Output:**
- Formatted investigation report ready for review or distribution
- Supporting data files (tables, network graphs, query results)
- Ozone artefacts: labels applied, tags added, comments written, escalations filed

---

## Evidence Standards

What constitutes sufficient evidence for different conclusion types:

**Account Linkage:**
- Single signal (e.g., one matching URL): low confidence, flag for review
- Two independent signals (e.g., content + timing): moderate confidence, actionable
- Three or more signals across different categories: high confidence, reportable

**Coordination:**
- Temporal clustering of identical content: strong indicator
- Shared infrastructure + content similarity: very strong indicator
- Absence of other explanations (no public copying of same content): increases confidence
- Multiple accounts flagged `is_bot_like` sharing the same anomalous domain: very strong indicator
- Accounts with near-identical entropy profiles (similar hourly_entropy and interval_entropy values): moderate indicator
- Multiple accounts in the same URL co-sharing cluster: strong indicator (Leiden community detection has already identified them as coordinated)
- Multiple accounts in the same quote co-sharing cluster: strong indicator of coordinated pile-on or amplification
- Accounts appearing in both URL and quote co-sharing clusters: very strong indicator — coordination across multiple vectors
- Co-sharing cluster with tight `temporal_spread_hours` and regular `mean_posting_interval_seconds`: very strong indicator
- Bot-like accounts appearing in co-sharing clusters: very high-confidence coordination signal
- Accounts sharing Ozone tags from prior reviews: confirms a previously identified network
- Quote overdispersion on network-authored posts: confirms the network is successfully amplifying its own content

**Rule Coverage:**
- 80%+ of problematic accounts hit at least one rule: adequate coverage
- 50-80%: moderate coverage, gaps present
- <50%: poor coverage, new rules or tuning needed

---

## Directory Conventions

Store investigation artefacts in a predictable structure:

```
investigations/
├── YYYY-MM-DD-{case-name}/
│   ├── report.md                    # Main report (from reporting-results skill)
│   ├── accounts.csv                 # Account list with metadata
│   ├── rule-hits.csv                # Rule trigger data
│   ├── timeline.txt                 # Activity timeline
│   └── queries/
│       ├── discovery.sql            # Discovery phase queries
│       ├── characterization.sql     # Phase 2 queries
│       └── ...
```

File naming: Use ISO date format (YYYY-MM-DD) with brief case identifier. Keep query SQL in version control for reproducibility.

---

## Escalation Criteria

When to escalate findings vs. continuing investigation:

**Escalate Immediately:**
- Evidence of targeted harassment or abuse
- Child safety concerns
- Coordinated deception at scale (100+ accounts)
- External platform involvement (cross-platform spam/coordination)

**Escalate After Phase 5:**
- Network with significant reach and demonstrated harm
- Evasion of current rules at scale
- Recommended rule changes or new detection needed

**Continue Investigating Internally:**
- Single-account behaviour (Phase 2 finding)
- Isolated pattern with low impact
- Suspected coordination but insufficient evidence (continue through Phase 3)

---

## Integration with Related Skills

- **accessing-osprey** — For Osprey system architecture and ClickHouse schema reference
- **querying-clickhouse** — For detailed ClickHouse query construction and optimization
- **querying-ozone** — For Ozone MCP tool patterns, filter combinations, and pagination
- **assess-account** — For structured single-account assessment (used within Phase 2)
- **classify-cluster** — For narrative classification of co-sharing clusters (used within Phase 3/4)
- **reporting-results** — For formatting the Phase 6 report output
