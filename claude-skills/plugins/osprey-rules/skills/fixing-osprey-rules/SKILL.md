---
name: fixing-osprey-rules
description: Use when fixing Osprey SML validation errors or reviewer-identified issues. Contains error categories, fix patterns, and debugging workflow. Not triggered on general coding tasks — only when resolving specific SML errors.
user-invocable: false
---

# Fixing Osprey Rules

This skill provides error categories, diagnosis patterns, and fix workflows for
resolving Osprey SML validation errors and reviewer-identified issues.

## Input Expectations

You receive a structured issue report from the reviewer. Each issue has:
- File path and line number
- Error description
- Severity (Critical, Important, Minor)
- Layer and check reference

Fix ALL issues in one pass. Do not fix one, re-review, fix another.

## 1. Understanding osprey-cli Error Output

osprey-cli reports errors in this format:
```
Error at <file>:<line>:<column>: <message>
```

**Key elements:**
- File path is relative to the rules project root
- Line and column numbers are 1-indexed
- Error messages describe the validation failure

**Exit codes:**
- 0: validation passed
- Non-zero: one or more errors found

**The `--dry-run` flag** validates without pushing. Always use it during development.

## 2. Type Mismatches

**Error patterns:**
- `incompatible types in assignment`
- `found multiple different types in list literal`

**Root cause:** Mixing `RuleT` and `bool` in `when_all` lists.

**Type rules:**
- `RegexMatch(...)`, comparisons (`>`, `<`, `==`, `!=`), `or`/`and` on bools → `bool`
- `Rule(...)` produces `RuleT`
- `RuleT or RuleT` is also `RuleT`
- `not Rule(...)` produces `RuleT`; `not bool_val` produces `bool`
- All items in `when_all` must be the SAME type

**Fix option (a):** If most items are `RuleT`, wrap booleans in `Rule()`:
```sml
# Before (mixed types - wrong):
Rule(when_all=[RuleA, SomeBool > 5, RuleB])

# After (all RuleT):
_ThresholdRule = Rule(when_all=[SomeBool > 5])
Rule(when_all=[RuleA, _ThresholdRule, RuleB])
```

**Fix option (b):** If most items are `bool`, keep everything as bool:
```sml
# Before (mixed types - wrong):
Rule(when_all=[RuleA, SomeBool, AnotherBool])

# After (all bool - if RuleA can be decomposed):
Rule(when_all=[SomeBool, AnotherBool, SomeOtherBool])
```

## 3. Import Cycles

**Error:** `import cycle detected here`

**Root cause:** File A imports file B, which imports file A (directly or transitively).

**Fix option (a):** Extract shared definitions to a new file imported by both:
```
# Before: A imports B, B imports A
# After:
# shared.sml ← common definitions
# A imports shared.sml
# B imports shared.sml
```

**Fix option (b):** Move the definition causing the cycle to the file that needs it.

**Fix option (c):** Re-evaluate whether the import is actually needed.

## 4. Undefined Variables

**Error patterns:**
- `unknown identifier '<name>'`
- `unknown local variable '<name>'`

**Root cause (a):** Missing import — the file defining the variable is not imported.
**Fix:** Add the missing `Import(rules=['path/to/file.sml'])`.

**Root cause (b):** Underscore-prefixed variable used cross-file — `_PascalCase`
variables are file-local and cannot be imported.
**Fix:** Rename without underscore prefix if it needs to be imported, or duplicate
the definition in the consuming file.

**Root cause (c):** Typo in variable name.
**Fix:** Correct the spelling to match the definition.

## 5. Function Call Errors

**Error patterns:**
- `unknown function '<name>'`
- `unknown keyword argument '<name>'`
- `missing keyword argument(s) '<name>'`
- `invalid argument type for '<name>'`

**Fixes:**
- Unknown function: Check UDF signatures (from investigator report or reference).
  The function may not exist or may have a different name.
- Unknown keyword: Check the function's accepted parameters. Remove or rename.
- Missing keyword: Add the required parameter.
- Invalid type: Check the expected type and convert.

## 6. Duplicate Definitions

**Error:** `features must be unique across all rule files`

**Root cause:** Same variable name defined in multiple files that are both imported.

**Fix:**
1. Identify which file is the canonical source for the variable
2. Remove the duplicate definition from the other file
3. Import the canonical source instead

## 7. Rule Constraint Errors

**Error patterns:**
- `rules must be stored in non-local features` — Rule assigned to `_` prefixed variable
- `variable interpolation in non-format string` — description missing `f` prefix

**Fixes:**
- Non-local features: Remove `_` prefix from Rule variable names. Rules must be
  importable (non-local) so they can be used in `WhenRules` and `when_all`.
- Non-format string: Add `f` prefix to Rule description: `description=f'...'`

## 8. Debugging Workflow

When you receive issues to fix, follow this process:

1. **Categorise issues by root cause.** Multiple issues may share the same root cause.
   Fix the root cause once rather than fixing each symptom individually.

2. **Fix in dependency order.** If fixing issue A would also fix issue B (cascading
   error), fix A first. Cascading errors are common with import cycles and type
   mismatches.

3. **Re-validate after EVERY fix.** Run `uv run osprey-cli push-rules <path> --dry-run`
   after each change to confirm the fix worked and didn't introduce new errors.
   This is a self-check, not the formal gate.

4. **Handle cascading errors.** When osprey-cli reports many errors, often only 1-3
   are root causes and the rest are cascading effects. Fix the earliest/deepest
   error first and re-validate — many other errors may disappear.

5. **If a fix introduces new errors,** revert and try a different approach.

## 9. Quick Reference Table

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `incompatible types` | Mixed bool/RuleT in when_all | Wrap bools in Rule() or decompose RuleT |
| `import cycle` | Circular imports | Extract shared defs to new file |
| `unknown identifier` | Missing import or _ prefix | Add import or rename variable |
| `unknown function` | Nonexistent UDF | Check UDF reference |
| `features must be unique` | Duplicate variable names | Remove dupe, import canonical |
| `non-local features` | Rule in _ prefixed var | Remove _ prefix |
| `non-format string` | Missing f prefix | Add f to description string |

## 10. Examples — End-to-End Debugging

### Example A: Type Mismatch

**Error:**
```
Error at rules/record/post/spam.sml:15:3: found multiple different types in list literal
```

**Diagnosis:**
1. Open the file, look at line 15
2. Find the `when_all` list
3. Identify which items are `bool` and which are `RuleT`
4. Choose fix option (a) or (b) based on majority type

**Fix:** Wrap the boolean in a Rule:
```sml
_IsNewAccount = Rule(when_all=[AccountAge < Day * 7])
Rule(when_all=[_IsNewAccount, SpamPatternRule])
```

### Example B: Import Cycle

**Error:**
```
Error at rules/record/post/index.sml:3:1: import cycle detected here
```

**Diagnosis:**
1. Trace the import chain from the error file
2. Find where the cycle closes
3. Identify the shared definition causing the cycle

**Fix:** Extract shared definition:
```sml
# New file: models/shared_post_features.sml
Import(rules=['models/base.sml'])
PostText: str = JsonData(path='$.record.text', required=False)
```

### Example C: Multiple Cascading Errors

**Errors:**
```
Error at models/record/post.sml:5:1: unknown identifier 'BaseModel'
Error at rules/record/post/spam.sml:8:1: unknown identifier 'PostText'
Error at rules/record/post/spam.sml:12:3: incompatible types in assignment
```

**Diagnosis:**
1. First error is the root cause — missing import in model file
2. Second error cascades — PostText can't resolve because model failed
3. Third error cascades — type inference fails because PostText is unknown

**Fix:** Fix only the first error (add missing import), re-validate. The other
two errors will likely disappear.

## Rationalizations to Block

| Rationalization | Reality | Action |
| --- | --- | --- |
| "I'll fix them one at a time" | Multiple issues may share a root cause. Fixing individually wastes cycles. | Categorise by root cause, fix all in one pass. |
| "This error doesn't matter" | All errors block the gate. There is no "doesn't matter." | Fix every issue you received. |
| "I'll skip the self-check" | Self-checking confirms your fix worked before the formal review. | Always run osprey-cli after fixing. |
| "I'll fix extra issues I found" | You fix what you're given. The reviewer identifies issues, not you. | Only fix the issues in your report. Don't expand scope. |
| "The cascading errors are separate issues" | They're almost always symptoms of one root cause. | Fix the deepest error first, re-validate, then check if others resolved. |

---

**Output:** Report which issues were fixed and how. The orchestrator will dispatch
the reviewer to formally re-verify.
