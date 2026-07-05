# Osprey Labeling Patterns (25 Patterns)

All common labeling use cases in Osprey, with implementation examples.

### 1. Simple Content Match

**When to use:** Label when post content matches a word list.

```python
PostContainsBadWord = Rule(
    when_all=[
        ListContains(list='bad_words.yaml', phrases=[PostTextCleaned]) != None,
    ],
    description='Post contains a bad word',
)

WhenRules(
    rules_any=[PostContainsBadWord],
    then=[
        LabelAdd(entity=UserId, label='bad_content'),
    ],
)
```

### 2. Identity-Based Labeling

**When to use:** Label a specific account by DID.

```python
IsTargetUser = Rule(
    when_all=[
        UserId == 'did:plc:abc123',
    ],
    description='Known target user',
)

WhenRules(
    rules_any=[IsTargetUser],
    then=[
        LabelAdd(entity=UserId, label='known_user'),
    ],
)
```

### 3. Account Metadata Gating

**When to use:** Use account age, post count, follower count as gates for labeling.

```python
NewAccountSpam = Rule(
    when_all=[
        AccountAgeSeconds < Day,
        PostsCount > 50,
        FollowersCount < 5,
    ],
    description=f'New account spam (age={AccountAgeSeconds}s, posts={PostsCount})',
)

WhenRules(
    rules_any=[NewAccountSpam],
    then=[
        LabelAdd(entity=UserId, label='spam_suspect'),
    ],
)
```

### 4. Temporal Expiration

**When to use:** Add labels that automatically expire after a duration.

```python
WhenRules(
    rules_any=[SomeRule],
    then=[
        LabelAdd(
            entity=UserId,
            label='recently_active',
            expires_after=TimeDelta(hours=24),
        ),
    ],
)
```

### 5. Conditional Escalation (Label Chaining)

**When to use:** Apply labels only if the entity already has a prior label. Core "stateful" pattern.

```python
HasWarning = HasLabel(entity=UserId, label='warning')

EscalateToRestricted = Rule(
    when_all=[
        HasWarning,
        SomeViolationRule,
    ],
    description='Repeat violation after warning',
)

WhenRules(
    rules_any=[EscalateToRestricted],
    then=[
        LabelAdd(entity=UserId, label='restricted'),
    ],
)
```

### 6. Sliding Window Rate Limiting

**When to use:** Count events within a time window; apply labels at thresholds.

```python
FlaggedPostCount = IncrementWindow(
    key=f'flagged-posts-{UserId}',
    window_seconds=7 * Day,              # 7-day sliding window
    when_all=[PostIsFlaggedRule],         # only count when rule fires
)

TooManyFlaggedPosts = Rule(
    when_all=[
        FlaggedPostCount >= 3,
    ],
    description=f'User has {FlaggedPostCount} flagged posts in 7 days',
)

WhenRules(
    rules_any=[TooManyFlaggedPosts],
    then=[
        LabelAdd(entity=UserId, label='repeat_offender'),
    ],
)
```

### 7. Strike System (Counting Violations Over Time)

**When to use:** Discrete escalation tiers using expiring labels; no Redis required.

```python
HasStrike1 = HasLabel(entity=UserId, label='strike_1')
HasStrike2 = HasLabel(entity=UserId, label='strike_2')

WhenRules(
    rules_any=[ViolationRule],
    then=[
        LabelAdd(entity=UserId, label='strike_1',
                 expires_after=TimeDelta(days=30)),
        LabelAdd(entity=UserId, label='strike_2',
                 apply_if=HasStrike1,
                 expires_after=TimeDelta(days=30)),
        LabelAdd(entity=UserId, label='strike_3',
                 apply_if=HasStrike2,
                 expires_after=TimeDelta(days=30)),
    ],
)
```

### 8. Manual Override Protection

**When to use:** Respect operator manual removes; don't re-apply automatically removed labels.

```python
WasManuallyCleared = HasLabel(
    entity=UserId,
    label='flagged',
    status='removed',
    manual=True,
)

FlagUser = Rule(
    when_all=[
        SomeCondition,
        not WasManuallyCleared,
    ],
    description='Flag user (respecting manual overrides)',
)

WhenRules(
    rules_any=[FlagUser],
    then=[
        LabelAdd(entity=UserId, label='flagged'),
    ],
)
```

### 9. Label Maturity Check

**When to use:** Only act on labels that have existed for a minimum duration.

```python
HasLongStandingWarning = HasLabel(
    entity=UserId,
    label='warning',
    min_label_age=TimeDelta(days=7),
)

StaleWarning = Rule(
    when_all=[
        HasLongStandingWarning,
        StillViolating,
    ],
    description='User has had warning for 7+ days and is still violating',
)

WhenRules(
    rules_any=[StaleWarning],
    then=[
        LabelAdd(entity=UserId, label='escalated'),
    ],
)
```

### 10. Multi-Signal Composite

**When to use:** Combine multiple independent signals into a single labeling decision.

```python
SuspiciousProfile = Rule(
    when_all=[
        AccountAgeSeconds < Hour,
        not HasAvatar,
        FollowersCount == 0,
    ],
    description='Suspicious new account profile',
)

SuspiciousContent = Rule(
    when_all=[
        ListContains(list='spam_phrases.yaml', phrases=[PostTextCleaned]) != None,
    ],
    description='Content matches spam patterns',
)

HighConfidenceSpam = Rule(
    when_all=[
        HasLabel(entity=UserId, label='suspicious_profile'),
        SuspiciousContent,
    ],
    description='High confidence spam: suspicious profile + spam content',
)

WhenRules(
    rules_any=[HighConfidenceSpam],
    then=[
        LabelAdd(entity=UserId, label='spam'),
    ],
)
```

### 11. ML-Scored Labeling

**When to use:** Use ML model scores (toxicity, sentiment) as rule conditions.

```python
ToxicityScore = AnalyzeToxicity(
    text=PostText,
    when_all=[IsCreate, PostText != ''],
)

HighlyToxic = Rule(
    when_all=[
        ToxicityScore != None,
        ToxicityScore > 0.85,
    ],
    description=f'Post is highly toxic (score={ToxicityScore})',
)

WhenRules(
    rules_any=[HighlyToxic],
    then=[
        LabelAdd(entity=AtUri, label='toxic'),
    ],
)
```

### 12. Domain/Link-Based Labeling

**When to use:** Label based on domains in post content or embeds.

```python
HasBadDomain = Rule(
    when_all=[
        ListContains(
            list='bad_domains.yaml',
            phrases=PostAllDomains,
            case_sensitive=False,
        ) != None,
    ],
    description='Post links to known bad domain',
)

WhenRules(
    rules_any=[HasBadDomain],
    then=[
        LabelAdd(entity=AtUri, label='links_to_malware'),
    ],
)
```

### 13. Cross-Entity Labeling

**When to use:** Apply labels to multiple entity types in a single WhenRules block.

```python
WhenRules(
    rules_any=[ViolationRule],
    then=[
        LabelAdd(entity=AtUri, label='violation'),
        LabelAdd(entity=UserId, label='has_violations'),
        LabelAdd(entity=PdsHost, label='hosts_violators'),
    ],
)
```

### 14. Regex Pattern Matching

**When to use:** Detect content matching regex patterns.

```python
PhoneNumberInPost = Rule(
    when_all=[
        RegexMatch(
            pattern=r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
            target=PostText,
        ),
    ],
    description='Post contains phone number',
)

WhenRules(
    rules_any=[PhoneNumberInPost],
    then=[
        LabelAdd(entity=AtUri, label='pii_detected'),
    ],
)
```

### 15. List-Based Matching

**When to use:** Match against externally managed YAML word lists (with variants like counting and regex).

```python
MatchesBadWords = ListContains(
    list='bad_words.yaml',
    phrases=[PostTextCleaned],
    word_boundaries=True,
)

BadWordCount = ListContainsCount(
    list='bad_words.yaml',
    phrases=[PostTextCleaned],
)

MatchesPatterns = RegexListContains(
    list='spam_patterns.yaml',
    phrases=[PostTextCleaned],
)

MultiWordViolation = Rule(
    when_all=[
        BadWordCount >= 2,
    ],
    description=f'Post contains {BadWordCount} bad words',
)

WhenRules(
    rules_any=[MultiWordViolation],
    then=[
        LabelAdd(entity=AtUri, label='violation'),
    ],
)
```

### 16. Censorized (Lookalike) Detection

**When to use:** Detect text deliberately obfuscated with lookalikes (e.g., "h3ll0" for "hello").

```python
ObfuscatedBadWord = Rule(
    when_all=[
        CensorizedListContains(
            list='bad_words.yaml',
            phrases=[PostTextCleaned],
            plurals=True,
            must_be_censorized=False,
        ) != None,
    ],
    description='Post contains obfuscated bad word',
)

WhenRules(
    rules_any=[ObfuscatedBadWord],
    then=[
        LabelAdd(entity=AtUri, label='evading_filter'),
    ],
)
```

### 17. AT Protocol Label Emission

**When to use:** Emit labels to Bluesky's Ozone moderation system.

```python
WhenRules(
    rules_any=[SomeRule],
    then=[
        AtprotoLabel(
            entity=UserId,
            label='spam',
            comment='Automated spam detection',
            expiration_in_hours=168,     # 7 days
        ),
    ],
)
```

### 18. AT Protocol List Management

**When to use:** Add accounts to AT Protocol lists.

```python
WhenRules(
    rules_any=[SpamRule],
    then=[
        AtprotoList(
            did=UserId,
            list_uri='at://did:plc:yourservice/app.bsky.graph.list/spam-accounts',
        ),
    ],
)
```

### 19. Verdict Declaration

**When to use:** Emit verdicts for synchronous callers (real-time moderation decisions).

```python
WhenRules(
    rules_any=[ClearSpamRule],
    then=[
        DeclareVerdict(verdict='REJECT'),
    ],
)
```

### 20. Bulk Labeling

**When to use:** Operator-initiated batch operations via Druid queries. Apply `MANUALLY_ADDED` or `MANUALLY_REMOVED` labels with expiration and rollback support.

This is NOT an SML rule — it is an operator-initiated API call. Template for reference:

```python
# Operator invocation (not in .sml files)
BulkLabelSink(
    query="SELECT did FROM accounts WHERE follower_count < 5 AND account_age_seconds < 86400",
    label='bulk-review',
    status='MANUALLY_ADDED',
    expiration=TimeDelta(days=30),
    rollback_previous=True,
)
```

### 21. Cooldown / Debounce

**When to use:** Prevent repeated labeling by caching state.

```python
CacheSetStr(
    key=f'cooldown-spam-{UserId}',
    value='1',
    when_all=[SpamRule],
    ttl_seconds=Hour,
)

OnCooldown = CacheGetStr(
    key=f'cooldown-spam-{UserId}',
    when_all=[True],
) != ''

SpamWithCooldown = Rule(
    when_all=[
        SpamRule,
        not OnCooldown,
    ],
    description='Spam detected (not on cooldown)',
)

WhenRules(
    rules_any=[SpamWithCooldown],
    then=[
        LabelAdd(entity=UserId, label='spam'),
    ],
)
```

### 22. Cached State Tracking

**When to use:** Use Redis cache to track arbitrary state across events.

```python
CacheSetStr(
    key=f'last-action-{UserId}',
    value=ActionName,
    when_all=[True],
    ttl_seconds=Day,
)

LastAction = CacheGetStr(
    key=f'last-action-{UserId}',
    when_all=[True],
)

RepeatedAction = Rule(
    when_all=[
        LastAction == ActionName,
    ],
    description='User repeated the same action type',
)

WhenRules(
    rules_any=[RepeatedAction],
    then=[
        LabelAdd(entity=UserId, label='suspicious'),
    ],
)
```

### 23. Label Removal on Condition

**When to use:** Remove labels when conditions change (e.g., user matured past a restriction).

```python
UserIsNowTrusted = Rule(
    when_all=[
        FollowersCount > 100,
        AccountAgeSeconds > 90 * Day,
        HasLabel(entity=UserId, label='new_account_restriction'),
    ],
    description='Account has matured past restriction',
)

WhenRules(
    rules_any=[UserIsNowTrusted],
    then=[
        LabelRemove(entity=UserId, label='new_account_restriction'),
    ],
)
```

### 24. AT Protocol Tagging

**When to use:** Add or remove Ozone tags on accounts (not labels — tags are lightweight metadata used for tracking, triage, or workflow).

```python
WhenRules(
    rules_any=[SuspiciousRule],
    then=[
        AtprotoTag(
            entity=UserId,
            tag='suspicious-activity',
            comment=f'Auto-tagged: {Handle}',
        ),
    ],
)
```

**Remove a tag when a condition clears:**

```python
WhenRules(
    rules_any=[ClearedRule],
    then=[
        AtprotoTag(
            entity=UserId,
            tag='suspicious-activity',
            comment=f'Condition cleared for {Handle}',
            neg=True,
        ),
    ],
)
```

**Conditional tagging with `apply_if`:**

```python
WhenRules(
    rules_any=[ViolationRule],
    then=[
        AtprotoTag(
            entity=UserId,
            tag='repeat-offender',
            comment=f'Repeat violation for {Handle}',
            apply_if=HasPriorWarning,
        ),
    ],
)
```

### 25. Multi-Rule OR Trigger

**When to use:** Multiple different rules can trigger the same effect (OR logic).

```python
WhenRules(
    rules_any=[
        SpamContentRule,
        SpamBehaviourRule,
        SpamDomainRule,
        MLSpamRule,
    ],
    then=[
        LabelAdd(entity=UserId, label='spam_suspect'),
    ],
)
```
