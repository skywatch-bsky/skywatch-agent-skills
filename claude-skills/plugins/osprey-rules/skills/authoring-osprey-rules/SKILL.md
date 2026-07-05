---
name: authoring-osprey-rules
description: Use when writing or modifying Osprey SML rule files from a validated rule specification. Covers model writing, rule writing, effect wiring, and execution graph wiring. Not triggered on general coding tasks.
user-invocable: false
---

# Authoring Osprey Rules

This workflow guides you through writing valid Osprey SML from a rule specification.
You receive a confirmed rule spec from the planner and project context from the
investigator. Your job is to write the SML files.

## Input Expectations

Before starting, you should have received:
1. **Rule specification** — plain-text spec from the planner describing what to build
2. **Investigator report** — project context with labels, models, UDFs, execution graph
3. **Project paths** — rules project directory and osprey-for-atproto repo path

If any of these are missing, report what's missing and stop.

## 1. Write Models (if needed)

If the rule needs features not already defined in existing models, create or extend
a model file.

**Model hierarchy:**
- `models/base.sml` → global definitions (UserId, Handle, ActionName, time constants)
- `models/record/base.sml` → features available on all record types
- `models/record/post.sml` → post-specific features (text, URLs, mentions)
- etc.

**Rules for model writing:**

1. **EntityJson vs JsonData:**
   - Use `EntityJson` for entity identifiers (things that labels attach to)
   - Use `JsonData` for primitive values (strings, ints, booleans)
   - **CRITICAL: Never use `JsonData` for IDs that labels will attach to. Use `EntityJson` instead.**

2. **Import base models:**
   ```sml
   Import(
     rules=['models/base.sml'],
   )
   ```

3. **Naming conventions:**
   - Variable names: PascalCase for main definitions
   - Private/intermediate variables: `_PascalCase` prefix

4. **Example model extension:**
   ```sml
   Import(
     rules=['models/base.sml'],
   )

   _PostText: str = JsonData(
     path='$.record.text',
     required=False,
   )

   _PostUrl: Optional[str] = JsonData(
     path='$.record.facets[*].features[*].uri',
     required=False,
   )
   ```

## 2. Write Rules

Create rule files in the correct directory based on event type.

**Directory structure:**
- Post rules → `rules/record/post/`
- Follow rules → `rules/record/follow/`
- Identity rules → `rules/identity/`
- Repost rules → `rules/record/repost/`
- etc.

**Rule file pattern:**

```sml
Import(
  rules=[
    'models/base.sml',
    'models/record/post.sml',  # or appropriate model file
  ],
)

_IsProfanity = ContainsAnyPattern(
  text=PostText,
  patterns=ProfanityList,
)

Rule(
  when_all=[
    _IsProfanity,
    UserId != None,
  ],
  description=f'Post contains profanity',
)
```

**Naming conventions:**
- Intermediate variables: `_PascalCase` prefix
- Rule names: PascalCase, `Rule` suffix (implicit from `Rule()` definition)
- Descriptive: explain what the rule detects

**Rule construction:**
- `Rule(when_all=[...], description=f'...')`
- `when_all` contains a list of conditions that must all be true
- All conditions must be type `bool` or `RuleT` — do not mix types

## 3. Wire Effects

Connect rules to effects via `WhenRules()`.

**Pattern:**
```sml
WhenRules(
  rules_any=[RuleName],
  then=[
    LabelAdd(entity=UserId, label='label-name'),
  ],
)
```

**Critical constraints:**

1. **Only use labels that exist in `config/labels.yaml`.**
   - Before writing an effect, verify the label name in the labels file.
   - If the label doesn't exist, tell the user they must add it to `config/labels.yaml` first.
   - **CRITICAL: Do not hardcode label names not present in the configuration.**

2. **Choose the right effect type:**
   - `LabelAdd` / `LabelRemove` → internal Osprey labels (most common)
   - `AtprotoLabel` → emit to Bluesky's Ozone (labels)
   - `AtprotoTag` → add/remove Ozone tags (lightweight metadata for tracking/triage; use `neg=True` to remove)
   - `DeclareVerdict` → synchronous decision (emit immediately)

3. **Prevent re-labeling:**
   - Use `HasAtprotoLabel(entity=UserId, label='label-name')` as a guard in the rule's `when_all` to avoid re-labeling.
   - Pattern: `not _HasLabelX` (use negation to skip if already labeled)

4. **Example with guard:**
   ```sml
   Import(
     rules=['models/label_guards.sml'],
   )

   WhenRules(
     rules_any=[ProfanityRule],
     then=[
       LabelAdd(
         entity=UserId,
         label='contains-profanity',
         expires_after=Day * 30,
       ),
     ],
   )
   ```

## 4. Wire into Execution Graph

Update the appropriate `index.sml` to load your new rule file.

**Pattern:**
- Unconditional: `Require(rule='rules/record/post/new_rule.sml')`
- Conditional: `Require(rule='...', require_if=IsOperation)`

**If creating a new event type directory:**
1. Create the directory: `rules/[event-type]/`
2. Create its `index.sml` with imports and local requires
3. Wire the new `index.sml` into the parent `rules/index.sml`

**Example wiring:**
```sml
# rules/record/post/index.sml
Import(
  rules=['models/base.sml'],
)

Require(rule='rules/record/post/profanity_rule.sml')
Require(rule='rules/record/post/spam_rule.sml')
```

Then update `rules/record/index.sml`:
```sml
Require(rule='rules/record/post/index.sml')
```

**Verification checklist:**
- [ ] Rule file created in correct directory
- [ ] Rule file imported/required in appropriate `index.sml`
- [ ] Parent `index.sml` updated if creating new directory
- [ ] All imports point to valid model files

## 5. Report Files Written

After completing all authoring steps, report to the orchestrator:
- Which files were created
- Which files were modified
- What the rule does (brief summary)

Do NOT run validation yourself — the orchestrator dispatches the reviewer for that.

## 6. Skill Chaining

Load additional skills when you need specialized guidance during authoring.

**When to chain to `osprey-sml-reference`:**
- Need SML syntax reference or examples
- Unsure of naming conventions
- Need to look up labeling patterns
- Want to understand how to use list-based matching

Load with: `Skill(skill='osprey-sml-reference')`

## 7. Common Mistakes

These are authoring mistakes that cause rules to fail validation or not work as intended.

1. **Using `JsonData` where `EntityJson` is required**
   - Wrong: `UserId: str = JsonData(path='$.did')`
   - Right: `UserId: Entity[str] = EntityJson(type='UserId', path='$.did')`
   - Impact: Labels cannot attach to non-Entity types

2. **Mixing `RuleT` and `bool` in `when_all` lists**
   - Wrong: `when_all=[RuleA, SomeBoolean, RuleB]`
   - Right: Keep all conditions as `RuleT` or all as `bool`, don't mix
   - Impact: Type error, validation fails

3. **Forgetting to wire new rule into `index.sml`**
   - Wrong: Create `rules/record/post/new_rule.sml` but don't `Require` it
   - Right: Add `Require(rule='rules/record/post/new_rule.sml')` to the appropriate index
   - Impact: Rule is never executed

4. **Forgetting to run validation after writing**
   - Wrong: Assuming the rules work without validation
   - Right: The orchestrator dispatches the reviewer after authoring completes
   - Impact: Silent failures, invalid rules in production

5. **Using `rules_all=` instead of `rules_any=` in `WhenRules`**
   - Wrong: `WhenRules(rules_all=[RuleA], then=[...])`
   - Right: `WhenRules(rules_any=[RuleA], then=[...])`
   - Impact: Effects don't trigger, validation may fail

6. **Creating dead rules not referenced by any `WhenRules`**
   - Wrong: Define `Rule(...)` but never use it in a `WhenRules(...)`
   - Right: Every `Rule` must be referenced by at least one `WhenRules`
   - Impact: Dead code, no effect on labeling

## 8. Rationalizations to Block

| Rationalization | Reality | Action |
| --- | --- | --- |
| "I'll validate later" | No. The orchestrator runs validation immediately after authoring. Do not skip steps hoping validation will catch them. | Write correct SML the first time. Follow the skill steps in order. |
| "I'll skip the index wiring" | No. Rules not in the execution graph don't run. | Update `index.sml` to require the new rule. Verify the wiring is correct. |
| "I don't need to check labels.yaml" | No. Using undefined labels is a validation error. | Every effect must reference a label that exists in `config/labels.yaml`. |
| "The model file is correct, I'll ship it" | No. Models are compile-time dependencies. | Double-check EntityJson vs JsonData usage. Verify imports are correct. |
| "I'll use JsonData for this entity ID" | No. Entity IDs must be EntityJson. | Use `EntityJson` for anything that will be labeled. Use `JsonData` only for primitive values. |
| "osprey-cli will catch it" | Validation catches syntax errors, not all logic or convention violations. | Follow the authoring steps carefully. Don't rely on validation as your only safety net. |
| "86400 is clearer than Day" | It's not. Time constants from `models/base.sml` are the convention. | Replace all hardcoded time values: `86400` → `Day`, `3600` → `Hour`, `604800` → `Week`, etc. |
| "I'll just run osprey-cli directly" | It's not on PATH. It must be invoked via `uv run` from the osprey-for-atproto repo. | Always use `uv run osprey-cli push-rules <path> --dry-run` from the osprey repo. |
| "This is urgent, skip validation" | Urgency doesn't excuse broken rules. The orchestrator validates after you're done — your job is to write correct SML. | Follow every step. Correct SML is faster than debugging broken SML. |

---

**Output:** SML files written to the rules project. Report which files were created
or modified back to the orchestrator.
