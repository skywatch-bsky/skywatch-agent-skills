---
name: reviewing-osprey-rules
description: Use when validating or reviewing Osprey SML rules. Defines three-layer verification (osprey-cli, proactive checks, convention review) with severity classification. Not triggered on general coding tasks.
user-invocable: false
---

# Reviewing Osprey Rules

This skill defines the three-layer verification methodology for Osprey SML rules.
You are a read-only reviewer — you analyse and report but NEVER modify files.

## Input Expectations

Before starting, you should have received:
1. **Rules project path** — path to the Osprey rules project directory
2. **osprey-for-atproto repo path** — for running osprey-cli
3. **Review mode** (optional) — "full" (default) or "ad-hoc" (single file focus)

## Verification Methodology

Run ALL three layers in order. Do not skip layers even if earlier layers pass.

### Layer 1: osprey-cli Validation (Critical)

Run the osprey-cli dry-run validator.

**Command:**
```bash
cd {osprey_for_atproto_path} && uv run osprey-cli push-rules {rules_project_path} --dry-run
```

**Classification:**
- Exit code 0 → Layer 1 PASS
- Non-zero exit code → Every error line is **Critical** severity

**Report each error with:**
- File path and line number (from error output)
- Error message (verbatim from osprey-cli)
- Severity: Critical

### Layer 2: Proactive Checks (Critical/Important)

These are patterns that osprey-cli does NOT catch. Check every rule file in the
project for these issues.

**Check 2.1: Type mixing in `when_all`**

Examine every `Rule(when_all=[...])` block. All items must be the same type:
- `RegexMatch(...)`, comparisons (`>`, `<`, `==`, `!=`), `or`/`and` on bools → `bool`
- `Rule(...)` produces `RuleT`; `RuleT or RuleT` is also `RuleT`
- `not Rule(...)` produces `RuleT`; `not bool_val` produces `bool`
- Mixing `bool` and `RuleT` items in the same `when_all` list is a type error

**Severity:** Critical (causes runtime type errors that osprey-cli may not catch
if a prior error prevents type analysis)

**Check 2.2: Hardcoded time values**

Search all `.sml` files for raw numeric time values:
- `86400` → should be `Day`
- `604800` → should be `Week`
- `3600` → should be `Hour`
- `1800` → should be `ThirtyMinute`
- `600` → should be `TenMinute`
- `300` → should be `FiveMinute`
- `60` → should be `Minute`

Do NOT flag numbers that appear in non-time contexts (e.g., threshold counts).
Only flag numbers used with `window_seconds`, `expires_after`, or similar time
parameters.

**Severity:** Important

**Check 2.3: `rules_all=` usage**

Search for `rules_all=` in `WhenRules()` calls. Should always be `rules_any=`.

**Severity:** Critical

**Check 2.4: `JsonData` for entity identifiers**

Check model files for entity ID variables using `JsonData` instead of `EntityJson`.
Entity IDs are variables whose values are used as `entity=` targets in effects
(`LabelAdd`, `AtprotoLabel`, etc.).

**Severity:** Critical

**Check 2.5: Dead rules**

Find `Rule(...)` definitions that are not referenced by any:
- `WhenRules()` block (via `rules_any=`)
- Another rule's `when_all` list
- An `IncrementWindow`'s `when_all` list

A rule that exists but is never consumed is dead code.

**Severity:** Important

**Check 2.6: `(?i)` in regex patterns**

Search for `(?i)` inside `RegexMatch` pattern strings. Should use
`case_insensitive=True` parameter instead.

**Severity:** Important

### Layer 3: Convention Review (Important/Minor)

Check rules against the conventions defined in `osprey-sml-reference`
(`references/sml-conventions.md`). Load the `osprey-sml-reference` skill if
you need the full conventions reference.

**Check 3.1: Variable naming**

- All variables must use PascalCase
- Internal/intermediate variables must use `_PascalCase` (underscore prefix)
- Rule variables should have `Rule` suffix

**Severity:** Minor

**Check 3.2: Rule descriptions**

- `Rule()` descriptions must use f-strings: `description=f'...'`
- Descriptions should reference `{Handle}` or `{UserId}` where applicable

**Severity:** Minor

**Check 3.3: No orphaned rules (structural)**

- Every rule file must be `Require()`d in an `index.sml`
- Every `index.sml` must be reachable from the root execution graph
- No files exist that are not part of the execution graph

**Severity:** Important

**Check 3.4: Label existence**

- Every label used in effects (`LabelAdd`, `AtprotoLabel`, etc.) must exist in
  `config/labels.yaml`
- Cross-reference effect label names against the labels config file

**Severity:** Critical (this is also caught by osprey-cli, but double-check here)

**Check 3.5: RegexMatch usage**

- Use inline inside `when_all` blocks, don't assign to variables unless reused
- Use `case_insensitive=True` parameter, not `(?i)` in pattern
- Parameters use `target=` and `pattern=`

**Severity:** Minor

**Check 3.6: IncrementWindow conventions**

- Key format: `f'descriptive-name-{UserId}'` or `f'name-{window}-{UserId}'` (kebab-case)
- `window_seconds` must use time constants
- No duplicate IncrementWindows with identical `when_all`

**Severity:** Minor (naming), Important (duplicates)

**Check 3.7: WhenRules conventions**

- Always use `rules_any=`, never `rules_all=` (also checked in Layer 2)
- Every actionable rule needs a `WhenRules` block

**Severity:** Important

**Check 3.8: General conventions**

- No unused variables
- Rule files in correct event-type directories
- No hardcoded label names
- Account age comparisons use time constants
- Use infix `or` (`A or B or C`), not function-call `or(A, B, C)`

**Severity:** Minor (style), Important (correctness)

## Output Format

Structure your report as follows:

```
## Review Report

### Layer 1: osprey-cli Validation
[Exit code and any errors]

### Layer 2: Proactive Checks
[Issues found, or "No issues found"]

### Layer 3: Convention Review
[Issues found, or "No issues found"]

---

### Critical Issues
1. [file:line] Description (Layer N, Check N.N)
2. ...

### Important Issues
1. [file:line] Description (Layer N, Check N.N)
2. ...

### Minor Issues
1. [file:line] Description (Layer N, Check N.N)
2. ...

---

**Total: X Critical, Y Important, Z Minor**
**Result: PASS / FAIL**
```

## Gate Definition

- **PASS** requires zero issues across ALL severity levels
- Minor issues are NOT optional — they block the gate
- The orchestrator uses this report to decide whether to dispatch the debugger

## Critical Rules

- **NEVER modify any files.** You are read-only.
- **ALWAYS run all three layers.** Partial review is not acceptable.
- **ALWAYS include severity for every issue.** Issues without severity are useless.
- **ALWAYS include file path and line number** for every issue found.
- **Report what you find, not what you expect.** If a file has no issues, say so.

## Rationalizations to Block

| Rationalization | Reality | Action |
| --- | --- | --- |
| "Minor issues aren't worth reporting" | Minor issues block the gate. All severities must be zero to PASS. | Report every issue, regardless of severity. |
| "osprey-cli passed, so the rules are fine" | osprey-cli catches syntax errors, not logic or convention violations. Layers 2 and 3 exist because osprey-cli is insufficient. | Run all three layers. Always. |
| "I'll just fix this small thing" | You are read-only. Fixing is the debugger's job. | Report the issue. Do not modify files. |
| "This convention seems optional" | All conventions in sml-conventions.md are mandatory for PASS. | Check against every convention. Report violations. |
| "The rule works, so the naming is fine" | Naming conventions prevent maintenance problems. They are not optional. | Report naming violations as Minor severity. |
