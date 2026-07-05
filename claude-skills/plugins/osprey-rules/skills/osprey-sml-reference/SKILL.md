---
name: osprey-sml-reference
description: Use when writing SML rules for Osprey — syntax questions, type system, naming conventions, labeling patterns, entity extraction, window counting, or label operations
user-invocable: false
---

# SML (Osprey Rules) Reference

SML is a Python-like language for defining moderation rules in Osprey. Rules extract data from events, evaluate conditions, and emit effects (labels, verdicts, list actions).

## Core Type System

Four fundamental types make up SML:

### EntityJson & Entity — Typed Identifiers

`EntityJson` extracts entity IDs from event JSON; `Entity` constructs them from known values. **Labels attach to entities, not raw strings.**

```python
# CORRECT — UserId is an Entity; labels attach to it
UserId: Entity[str] = EntityJson(type='UserId', path='$.did', required=False)

# WRONG — JsonData produces str, not Entity[str]. Labels can't attach to str.
UserId: str = JsonData(path='$.did')
```

- `EntityJson(type, path, required)` → `Entity[str]` or `Entity[int]`. Use for IDs: `UserId`, `Handle`, `AtUri`, `PdsHost`.
- `Entity(type, id)` → construct entity from known values (e.g., computed AT-URI).

### JsonData — Primitive Extraction

`JsonData` extracts primitive values from event JSON.

```python
DisplayName: str = JsonData(path='$.eventMetadata.profile.displayName', required=False, coerce_type=True)
PostsCount: int = JsonData(path='$.eventMetadata.profile.postsCount', required=False)
```

Returns: `str`, `int`, `float`, `bool`, `Optional[T]`, or `List[T]`.

### Optional[T] — Nullable Types

Use `ResolveOptional` to unwrap optional values with a default.

```python
AccountAgeSeconds: Optional[int] = JsonData(path='$.eventMetadata.accountAge', required=False)
AccountAgeSecondsUnwrapped: int = ResolveOptional(optional_value=AccountAgeSeconds, default_value=999999999)
```

## Core Constructs

### Rule — AND of Conditions

```python
Rule(when_all=[...], description=f'...')  # → RuleT
```

Combines multiple conditions with AND logic. All items in `when_all` must be the same type (all `bool` or all `RuleT`).

```python
NewAccountSpam = Rule(
    when_all=[
        AccountAgeSeconds < Day,
        PostsCount > 50,
        FollowersCount < 5,
    ],
    description=f'New account spam (age={AccountAgeSeconds}s, posts={PostsCount})',
)
```

### WhenRules — OR Trigger + Effects

```python
WhenRules(rules_any=[...], then=[...])  # → None
```

Triggers effects when ANY rule passes. **Always use `rules_any=`, never `rules_all=`.**

```python
WhenRules(
    rules_any=[NewAccountSpam, BotBehavior],
    then=[
        LabelAdd(entity=UserId, label='spam'),
        AtprotoLabel(entity=UserId, label='spam', comment='Auto-detected', expiration_in_hours=168),
    ],
)
```

### Import & Require

```python
Import(rules=['path/to/file.sml'])  # Load models/rules from other files
Require(rule='path/to/file.sml', require_if=condition)  # Conditional inclusion
```

## Operators & Type Rules

**All items in `when_all` must be the same type:**

- `RegexMatch(...)`, comparisons (`X < Y`), `or`/`and` on bools → `bool`
- `Rule(...)` → `RuleT`; `RuleT or RuleT` → `RuleT`
- Use infix `or` (`A or B or C`), NOT function-call `or(A, B, C)`
- `not` works on both `bool` and `RuleT`

```python
# CORRECT — all bool
WhenRules(
    rules_any=[
        Rule(when_all=[PostText != '', RegexMatch(pattern=r'...', target=PostText)]),
    ],
    then=[...],
)

# WRONG — mixing RuleT and bool in when_all
Rule(when_all=[MyRule, SomeCondition == True])  # Can't mix Rule and bool
```

## Effects

Apply effects when rules pass:

- `LabelAdd(entity, label, apply_if?, expires_after?, delay_action_by?)` — add label
- `LabelRemove(entity, label, ...)` — remove label
- `AtprotoLabel(entity, label, comment, expiration_in_hours)` — emit to Bluesky Ozone
- `AtprotoTag(entity, tag, comment, neg?, apply_if?)` — add/remove Ozone tag (`neg=True` to remove)
- `DeclareVerdict(verdict)` — for synchronous callers

```python
WhenRules(
    rules_any=[SomeRule],
    then=[
        LabelAdd(entity=UserId, label='flagged', expires_after=TimeDelta(days=7)),
        LabelAdd(entity=AtUri, label='violation'),
    ],
)
```

## Key UDFs Quick Reference

| UDF | Parameters | Returns | Purpose |
|-----|-----------|---------|---------|
| `RegexMatch` | `pattern, target, case_insensitive?` | `bool` | Regex test |
| `IncrementWindow` | `key, window_seconds, when_all` | `int` | Sliding window counter |
| `GetWindowCount` | `key, window_seconds, when_all` | `int` | Read counter without incrementing |
| `ListContains` | `list, phrases, case_sensitive?, word_boundaries?` | `Optional[str]` | Match against YAML word list |
| `CensorizedListContains` | `list, phrases, plurals?, must_be_censorized?` | `Optional[str]` | Match lookalike/obfuscated text |
| `HasLabel` | `entity, label, manual?, status?, min_label_age?` | `bool` | Check if entity has label |
| `HasAtprotoLabel` | `entity, label` | `bool` | Check AT Protocol label |
| `TimeDelta` | `weeks?, days?, hours?, minutes?, seconds?` | `TimeDeltaT` | Create a duration |
| `AnalyzeToxicity` | `text, when_all` | `Optional[float]` | ML toxicity score |
| `AnalyzeSentiment` | `text, when_all` | `Optional[float]` | ML sentiment polarity |
| `CacheSetStr` | `key, value, when_all, ttl_seconds?` | `None` | Store string in Redis |
| `CacheGetStr` | `key, when_all, default?` | `str` | Read string from Redis |

## Progressive Disclosure

For detailed patterns and implementation examples, see:

- **25 Labeling Patterns** — `references/labeling-patterns.md`. Covers all common use cases: content matching, rate limiting, strike systems, ML scoring, cross-entity labeling, caching, and more.
- **Naming Conventions & Anti-Patterns** — `references/sml-conventions.md`. Variable naming, time constants, RegexMatch rules, IncrementWindow keys, type system pitfalls, and what NOT to do. Also includes a **Reviewer Checklist** section with structured CONV-prefixed check IDs for systematic convention review.

