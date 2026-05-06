# Investigation Checklist

A per-phase checklist to guide execution of the investigation methodology. Use this as you progress through each phase to ensure completeness and proper documentation.

## Phase 1: Discovery

**Data Collection:**
- [ ] Query ClickHouse for target account rule hit history (past 30-90 days)
- [ ] Extract rule names, hit counts, and timestamps
- [ ] Review flagged content for domain/URL mentions
- [ ] Note any obvious patterns (concentrated timeframe, repeated rule, specific content theme)

**Tool Usage:**
- [ ] Used `clickhouse_query` to pull rule hits
- [ ] Used `cosharing_clusters` with `did` to check co-sharing cluster membership
- [ ] Used `domain_check` on discovered domains (if any)

**Signal Documentation:**
- [ ] Recorded rule hit volume (total count)
- [ ] Noted rule frequency distribution (which rules trigger most?)
- [ ] Identified temporal clustering (spread over time or concentrated?)
- [ ] Documented content red flags (malicious domains, suspicious URLs)
- [ ] Checked co-sharing cluster membership (cluster size, evolution type, shared URLs)

**Decision & Next Steps:**
- [ ] Assessment: Is this pattern worth deeper investigation? (Yes/No)
- [ ] If Yes: Proceed to Phase 2
- [ ] If No: Document conclusion and close investigation

---

## Phase 2: Characterization

**Data Collection:**
- [ ] Pull complete activity timeline from account creation to present
- [ ] Document posting frequency: posts per day, per hour, distribution across week
- [ ] Identify content themes and recurring topics
- [ ] Record account metadata: creation date, PDS host, profile characteristics
- [ ] Extract any domain registrations or infrastructure details

**Tool Usage:**
- [ ] Used `clickhouse_query` for activity timeline and aggregation
- [ ] Used `ip_lookup` on any extracted IP addresses
- [ ] Used `whois_lookup` on discovered domains

**Signal Documentation:**
- [ ] Posting pattern: 24/7 bot-like vs. human-like schedule
- [ ] Content consistency: focused themes vs. random posts
- [ ] Account age vs. activity intensity ratio
- [ ] Infrastructure markers: PDS provider, account origin, name/bio changes

**Profile Summary:**
- [ ] Generated account profile document with key characteristics
- [ ] Noted any indicators of deception (mismatched metadata, suspicious history)

**Decision & Next Steps:**
- [ ] Assessment: Does behaviour suggest bot, human, or coordinated group?
- [ ] Does profile show signs of compromise or inauthentic operation?
- [ ] If coordinated/anomalous: Proceed to Phase 3
- [ ] If isolated/explained: Document and close

---

## Phase 3: Linkage

**Data Collection:**
- [ ] Search for accounts with matching content (exact duplicates, paraphrased)
- [ ] Query for temporal correlation: accounts posting similar content at similar times
- [ ] Identify infrastructure overlap: shared PDS hosts, domain registrations, ASN blocks
- [ ] Build list of potentially linked accounts

**Tool Usage:**
- [ ] Used `content_similarity` to find matching content across accounts
- [ ] Used `clickhouse_query` with GROUP BY to cluster by shared infrastructure
- [ ] Compared posting timestamps for tight synchronisation patterns
- [ ] Used `cosharing_clusters` / `cosharing_pairs` to check co-sharing relationships
- [ ] Used `cosharing_evolution` to trace cluster history (if cluster found)

**Signal Documentation:**
- [ ] Content overlap matrix: which accounts share content?
- [ ] Timing correlation: accounts posting within X minutes of each other
- [ ] Shared infrastructure: PDS hosts, domain names, IP ranges
- [ ] Account groupings: tight clusters vs. loose associations

**Network Analysis:**
- [ ] Identified primary cluster (tightly coordinated group)
- [ ] Mapped secondary connections (loosely coordinated)
- [ ] Noted infrastructure sharing patterns

**Decision & Next Steps:**
- [ ] Assessment: Is coordination intentional or coincidental?
- [ ] Network size: 2-3 accounts vs. larger network (10+)?
- [ ] If coordination evident: Proceed to Phase 4
- [ ] If unclear or small: May skip to Phase 5 or close

---

## Phase 4: Amplification Mapping

**Data Collection:**
- [ ] Trace repost chains: how content moves through the network
- [ ] Map quote posts and replies: engagement patterns
- [ ] Identify primary targets: which accounts/topics are amplified?
- [ ] Extract engagement metrics: likes, reposts, replies per content

**Tool Usage:**
- [ ] Used `clickhouse_query` to aggregate engagement patterns
- [ ] Used `url_expand` to resolve link destinations and targets
- [ ] Traced reply trees and conversation patterns

**Signal Documentation:**
- [ ] Most-amplified content themes and topics
- [ ] Primary target accounts or topics
- [ ] Amplification velocity (time from first post to peak engagement)
- [ ] External links and traffic destinations
- [ ] Reach metrics: total impressions, engagement ratio

**Strategy Assessment:**
- [ ] Identified likely objective: harassment, propaganda, viral marketing, etc.
- [ ] Noted target demographics or sectors
- [ ] Evaluated effectiveness of amplification strategy

**Decision & Next Steps:**
- [ ] Is amplification effective (significant reach/engagement)?
- [ ] Are there actionable harms (targeted abuse, election disinformation, etc.)?
- [ ] Proceed to Phase 5 (Rule Validation)

---

## Phase 5: Rule Validation

**Data Collection:**
- [ ] Pull rule hit data for all identified accounts
- [ ] Aggregate by rule name and account
- [ ] Compare rule coverage: what percentage of accounts trigger at least one rule?
- [ ] Identify behaviour patterns that don't trigger any rule

**Tool Usage:**
- [ ] Used `clickhouse_query` to extract rule statistics
- [ ] Built coverage matrix: accounts vs. rules triggered
- [ ] Identified gaps: behaviour without corresponding rule hits

**Signal Documentation:**
- [ ] Rule coverage percentage (e.g., 75% of accounts caught)
- [ ] Per-rule trigger counts for this network
- [ ] Missed behaviour: patterns not caught by any rule
- [ ] Rule effectiveness: which rules are most useful?

**Gap Analysis:**
- [ ] Listed rules that catch the network
- [ ] Listed behaviour that should trigger rules but doesn't
- [ ] Proposed new rules or rule modifications to improve coverage
- [ ] Estimated impact of rule improvements

**Decision & Next Steps:**
- [ ] Rule coverage assessment complete
- [ ] Gap recommendations documented
- [ ] Proceed to Phase 6 (Reporting)

---

## Phase 6: Reporting

**Preparation:**
- [ ] Selected report type: Memo / Cluster Deep-Dive / Cross-Cluster / Rule Check
- [ ] Reviewed `reporting-results` skill for formatting requirements
- [ ] Compiled all evidence: tables, timelines, network data

**Report Structure:**
- [ ] Bottom Line: Written single-sentence conclusion
- [ ] Impact: Documented account counts, reach, risk level
- [ ] Next Steps: Listed actionable recommendations
- [ ] Details: Included all supporting evidence with source queries
- [ ] Timestamps: Recorded investigation dates and data ranges

**Output:**
- [ ] Report written in markdown format
- [ ] File named: `YYYY-MM-DD-{case-name}.md`
- [ ] Stored in appropriate investigation directory
- [ ] Supporting data files (CSV, SQL queries) included

**Enforcement (if applicable):**
- [ ] Determined if labels or enforcement actions are warranted
- [ ] Used `ozone_label` to apply moderation labels (if approved)
- [ ] Documented all enforcement actions in report

**Sign-Off:**
- [ ] Report reviewed for accuracy and completeness
- [ ] Data sources verified and documented
- [ ] All queries recorded for reproducibility
- [ ] Ready for distribution or escalation

