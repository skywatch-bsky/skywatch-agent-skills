# SML Conventions & Best Practices

Conventions for writing consistent, maintainable SML rules in Osprey.

## Variable Naming

Follow PascalCase for all variables, with specific prefixes for internal/intermediate variables:

- **PascalCase for all variables:** `UserId`, `PostCount`, `FollowersCount`, `DisplayName`
- **Underscore prefix for internal/intermediate variables:** `_IsNewAccount`, `_Gate`, `_HasWarning` (internal logic)
- **`Rule` suffix for rule variables:** `MassFollowingMidRule`, `NewAccountSpamRule`, `SuspiciousProfileRule`
- **IncrementWindow variables describe what's counted:** `_NumericHandleFollowCount10m`, `FlaggedPostCount7d`

Examples:

```python
# Good
_IsNewAccount = AccountAgeSeconds < Day
_Gate = not HasManuallyRemoved

NewAccountSpamRule = Rule(
    when_all=[_IsNewAccount, PostsCount > 50],
    description='New account spam',
)

FlaggedPostCount = IncrementWindow(
    key=f'flagged-posts-{UserId}',
    window_seconds=7 * Day,
    when_all=[PostIsFlaggedRule],
)
```

## Time Constants

Always use time constants from `models/base.sml`. Never hardcode time values.

Defined constants:
- `Second: int = 1`
- `Minute: int = Second * 60` (60)
- `FiveMinute: int = Minute * 5` (300)
- `TenMinute: int = Minute * 10` (600)
- `ThirtyMinute: int = Minute * 30` (1800)
- `Hour: int = Minute * 60` (3600)
- `Day: int = Hour * 24` (86400)
- `Week: int = Day * 7` (604800)

Usage:

```python
# CORRECT
expires_after=TimeDelta(hours=24)   # Use simple units
window_seconds=7 * Day              # Use constants
AccountAgeSeconds < Day             # Comparisons use constants

# WRONG
expires_after=TimeDelta(hours=1440)     # Don't compute hours as minutes
window_seconds=604800                   # Don't hardcode seconds
AccountAgeSeconds < 86400               # Don't hardcode seconds
```

## RegexMatch Conventions

Use `RegexMatch` inline inside `when_all` blocks. Don't assign to variables unless the pattern is reused in multiple places.

Use the `case_insensitive=True` parameter instead of embedding `(?i)` in the pattern. Parameters are named `target=` and `pattern=`.

```python
# CORRECT — inline, case_insensitive parameter
PhoneInPost = Rule(
    when_all=[
        RegexMatch(
            pattern=r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
            target=PostText,
            case_insensitive=False,
        ),
    ],
    description='Post contains phone number',
)

CaseInsensitiveBadWord = Rule(
    when_all=[
        RegexMatch(pattern=r'badword', target=PostTextCleaned, case_insensitive=True),
    ],
    description='Post contains bad word (case-insensitive)',
)

# WRONG — using (?i) in pattern
WrongCaseInsensitive = Rule(
    when_all=[
        RegexMatch(pattern=r'(?i)badword', target=PostTextCleaned),
    ],
    description='Bad pattern',
)

# WRONG — assigning to variable when not reused
_PhoneRegex = RegexMatch(pattern=r'\b\d{3}...', target=PostText)
MyRule = Rule(when_all=[_PhoneRegex])
```

## IncrementWindow Conventions

Key strings use f-strings with kebab-case prefix and `{UserId}` suffix. Include time window in key when multiple windows exist for the same metric.

- Key format: `f'descriptive-name-{UserId}'` or `f'name-{window}-{UserId}'` (kebab-case)
- `window_seconds` must use time constants (e.g., `10 * Minute`, `Day`)
- Don't create duplicate IncrementWindows with identical `when_all` — use one counter with multiple threshold rules

```python
# CORRECT — descriptive key with window
FlaggedPostCount = IncrementWindow(
    key=f'flagged-posts-{UserId}',
    window_seconds=7 * Day,
    when_all=[PostIsFlaggedRule],
)

_NumericHandleFollowCount10m = IncrementWindow(
    key=f'numeric-handle-follows-10m-{UserId}',
    window_seconds=10 * Minute,
    when_all=[TargetIsNumericHandle],
)

# Multiple rules use same counter
TooManyFlaggedPosts = Rule(when_all=[FlaggedPostCount >= 3])
VeryManyFlaggedPosts = Rule(when_all=[FlaggedPostCount >= 10])

# WRONG — hardcoded time, unclear key
BadCounter = IncrementWindow(
    key=f'count-{UserId}',
    window_seconds=604800,  # Don't hardcode
    when_all=[Rule1],
)

BadMultiple = IncrementWindow(
    key=f'count-{UserId}',
    window_seconds=7 * Day,
    when_all=[SameRule],
)

BadMultiple2 = IncrementWindow(
    key=f'count-{UserId}',
    window_seconds=7 * Day,
    when_all=[SameRule],  # Duplicate counter
)
```

## Rule Conventions

Every `Rule` must be referenced somewhere (in a `WhenRules`, in another rule's `when_all`, or in an `IncrementWindow`'s `when_all`). No dead rules. Descriptions use f-strings with `{Handle}` or `{UserId}`.

```python
# CORRECT — rule is referenced in WhenRules
NewAccountSpamRule = Rule(
    when_all=[
        AccountAgeSeconds < Day,
        PostsCount > 50,
        FollowersCount < 5,
    ],
    description=f'New account spam for {Handle} (age={AccountAgeSeconds}s)',
)

WhenRules(
    rules_any=[NewAccountSpamRule],
    then=[
        LabelAdd(entity=UserId, label='spam_suspect'),
    ],
)

# CORRECT — rule is referenced in another rule's when_all
HasWarningRule = HasLabel(entity=UserId, label='warning')

EscalateRule = Rule(
    when_all=[
        HasWarningRule,
        AnotherViolation,
    ],
    description=f'Escalation for {Handle} with prior warning',
)

# WRONG — dead rule, not referenced anywhere
UnusedRule = Rule(
    when_all=[SomeCondition],
    description='This rule is never used',
)
```

Use infix `or` (`A or B or C`), NOT function-call `or(A, B, C)`:

```python
# CORRECT — infix
Rule(
    when_all=[
        Condition1 or Condition2 or Condition3,
    ],
)

# WRONG — function-call or()
Rule(
    when_all=[
        or(Condition1, Condition2, Condition3),  # Not valid
    ],
)
```

## Type Rules in `when_all`

All items in a `when_all` list must be the same type. Do NOT mix `RuleT` and `bool`.

- `RegexMatch(...)`, variable comparisons (`X < Y`), and `or`/`and` on bools → `bool`
- `Rule(...)` produces `RuleT`; `RuleT or RuleT` is also `RuleT`
- In `IncrementWindow` `when_all`, prefer inline `RegexMatch` (bool) with bool gates rather than referencing a `Rule`

```python
# CORRECT — all bool
AllBool = Rule(
    when_all=[
        PostText != '',
        RegexMatch(pattern=r'...', target=PostText),
        FollowersCount > 5,
    ],
)

# CORRECT — all RuleT
AllRuleT = Rule(
    when_all=[
        MyRule1,
        MyRule2 or MyRule3,
    ],
)

# CORRECT — IncrementWindow with bool when_all
FlagCount = IncrementWindow(
    key=f'flags-{UserId}',
    window_seconds=Day,
    when_all=[
        PostText != '',
        RegexMatch(pattern=r'...', target=PostText),
        FollowersCount > 5,
    ],
)

# WRONG — mixing RuleT and bool
MixedType = Rule(
    when_all=[
        MyRule,
        PostText != '',  # Can't mix Rule and bool
    ],
)

# WRONG — rule in IncrementWindow when_all
BadCounter = IncrementWindow(
    key=f'flags-{UserId}',
    window_seconds=Day,
    when_all=[
        MyRule,  # Prefer bool, not RuleT
    ],
)
```

## WhenRules

Always use `rules_any=`, never `rules_all=`. Every actionable rule needs a `WhenRules` block connecting it to an effect.

```python
# CORRECT
WhenRules(
    rules_any=[Rule1, Rule2, Rule3],
    then=[
        LabelAdd(entity=UserId, label='spam'),
    ],
)

# WRONG
WhenRules(
    rules_all=[Rule1, Rule2],  # Never use rules_all
    then=[...],
)
```

## General

- No unused variables — don't define string constants, patterns, or rules that aren't referenced.
- Rule files in `rules/record/follow/` only handle follow events; post logic belongs in `rules/record/post/`.
- No hardcoded label names — read from `config/labels.yaml`.
- `AccountAgeSecondsUnwrapped` comparisons should use time constants (e.g., `< Day`, `<= 7 * Day`).

```python
# CORRECT
AccountAgeSeconds < Day
AccountAgeSeconds <= 7 * Day

# WRONG
AccountAgeSeconds < 86400
AccountAgeSeconds < 604800
```

## Anti-Patterns (What NOT to Do)

### 1. Using JsonData for Entity IDs

Entity IDs should use `EntityJson`, not `JsonData`. Labels attach to entities, not raw strings.

```python
# WRONG
UserId: str = JsonData(path='$.did')  # Produces str, not Entity

# CORRECT
UserId: Entity[str] = EntityJson(type='UserId', path='$.did')
```

### 2. Mixing RuleT and bool in when_all

```python
# WRONG
Rule(when_all=[MyRule, PostText != ''])  # Mixing RuleT and bool

# CORRECT
Rule(when_all=[MyRule1, MyRule2])  # All RuleT
Rule(when_all=[PostText != '', RegexMatch(...)])  # All bool
```

### 3. Using (?i) in Regex Patterns

```python
# WRONG
RegexMatch(pattern=r'(?i)badword', target=PostText)

# CORRECT
RegexMatch(pattern=r'badword', target=PostText, case_insensitive=True)
```

### 4. Hardcoding Time Values

```python
# WRONG
window_seconds=604800  # Hardcoded 7 days
expires_after=TimeDelta(seconds=86400)  # Hardcoded 1 day

# CORRECT
window_seconds=7 * Day
expires_after=TimeDelta(days=1)  # or TimeDelta(hours=24)
```

### 5. Using rules_all in WhenRules

```python
# WRONG
WhenRules(rules_all=[Rule1, Rule2], then=[...])

# CORRECT
WhenRules(rules_any=[Rule1, Rule2], then=[...])
```

### 6. Dead Rules

```python
# WRONG
UnusedRule = Rule(when_all=[...])  # Not referenced anywhere

# CORRECT
MyRule = Rule(when_all=[...])
WhenRules(rules_any=[MyRule], then=[...])
```

### 7. Using Function-Call or()

```python
# WRONG
Rule(when_all=[or(Cond1, Cond2, Cond3)])

# CORRECT
Rule(when_all=[Cond1 or Cond2 or Cond3])
```

### 8. Duplicate IncrementWindows

```python
# WRONG
Counter1 = IncrementWindow(key=f'flag-{UserId}', window_seconds=Day, when_all=[PostIsBad])
Counter2 = IncrementWindow(key=f'flag-{UserId}', window_seconds=Day, when_all=[PostIsBad])

# CORRECT
Counter = IncrementWindow(key=f'flag-{UserId}', window_seconds=Day, when_all=[PostIsBad])
TooMany1 = Rule(when_all=[Counter >= 3])
TooMany2 = Rule(when_all=[Counter >= 10])
```

### 9. Unclear IncrementWindow Keys

```python
# WRONG
key=f'counter-{UserId}'  # Doesn't say what's being counted

# CORRECT
key=f'flagged-posts-{UserId}'  # Clear what's counted
key=f'numeric-handle-follows-10m-{UserId}'  # Clear metric and window
```

### 10. Assigning RegexMatch When Not Reused

```python
# WRONG
_PhonePattern = RegexMatch(pattern=r'\d+', target=PostText)
Rule(when_all=[_PhonePattern])

# CORRECT (inline, used once)
Rule(
    when_all=[
        RegexMatch(pattern=r'\d+', target=PostText),
    ],
)

# CORRECT (reused across multiple rules)
_PhonePattern = RegexMatch(pattern=r'\d+', target=PostText)
Rule1(when_all=[_PhonePattern])
Rule2(when_all=[_PhonePattern])
```

---

## Reviewer Checklist

Structured checklist for the `osprey-rule-reviewer` agent. Each check has an ID
for use in review reports. Checks reference the prose sections above for details.

### Naming Checks

- **CONV-N1:** All variables use PascalCase (see: Variable Naming)
- **CONV-N2:** Internal/intermediate variables use `_PascalCase` prefix (see: Variable Naming)
- **CONV-N3:** Rule variables have `Rule` suffix (see: Variable Naming)
- **CONV-N4:** IncrementWindow variable names describe what is counted (see: Variable Naming)

### Time Checks

- **CONV-T1:** No hardcoded time values — all use named constants from `models/base.sml` (see: Time Constants)
- **CONV-T2:** `window_seconds` parameters use time constants (see: IncrementWindow Conventions)
- **CONV-T3:** Account age comparisons use time constants (see: General)

### RegexMatch Checks

- **CONV-R1:** `case_insensitive=True` parameter used instead of `(?i)` in pattern (see: RegexMatch Conventions)
- **CONV-R2:** RegexMatch used inline unless pattern is reused across multiple rules (see: RegexMatch Conventions, Anti-Pattern 10)

### IncrementWindow Checks

- **CONV-IW1:** Key strings use f-strings with kebab-case prefix and `{UserId}` suffix (see: IncrementWindow Conventions)
- **CONV-IW2:** No duplicate IncrementWindows with identical `when_all` (see: IncrementWindow Conventions, Anti-Pattern 8)
- **CONV-IW3:** Key names are descriptive of what is counted (see: Anti-Pattern 9)

### Rule Checks

- **CONV-RU1:** Every `Rule` is referenced by a `WhenRules`, another rule's `when_all`, or an `IncrementWindow`'s `when_all` — no dead rules (see: Rule Conventions, Anti-Pattern 6)
- **CONV-RU2:** Rule descriptions use f-strings with `{Handle}` or `{UserId}` where applicable (see: Rule Conventions)
- **CONV-RU3:** Uses infix `or` (`A or B or C`), not function-call `or(A, B, C)` (see: Rule Conventions, Anti-Pattern 7)

### Type Checks

- **CONV-TY1:** All items in `when_all` are the same type — all `bool` or all `RuleT`, no mixing (see: Type Rules in when_all, Anti-Pattern 2)
- **CONV-TY2:** Entity IDs use `EntityJson`, not `JsonData` (see: Anti-Pattern 1)

### WhenRules Checks

- **CONV-WR1:** Uses `rules_any=`, never `rules_all=` (see: WhenRules, Anti-Pattern 5)
- **CONV-WR2:** Every actionable rule has a `WhenRules` block (see: WhenRules)

### Structure Checks

- **CONV-S1:** No unused variables (see: General)
- **CONV-S2:** Rule files in correct event-type directories (see: General)
- **CONV-S3:** No hardcoded label names — labels verified against `config/labels.yaml` (see: General)
- **CONV-S4:** Every rule file is `Require()`d in an `index.sml` reachable from root
