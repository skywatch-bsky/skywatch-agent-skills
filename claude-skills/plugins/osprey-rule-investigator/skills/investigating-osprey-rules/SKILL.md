---
name: investigating-osprey-rules
description: >-
  Systematic investigation methodology for Osprey SML rules projects.
  Produces structured text reports on project structure, labels, models,
  UDFs, and execution graphs.
user-invocable: false
---

# Investigating Osprey Rules

## Overview

You are investigating an Osprey SML rules project to produce a structured report.
Your caller has provided a rules project path and an osprey-for-atproto repo path.

**Output rules:**
- Return ALL findings as text in your response. NEVER write files.
- Include exact file paths and line numbers for every finding.
- If something is missing or unexpected, report it explicitly — do not silently skip.
- Structure your report with the section headings defined below.

**Investigation order:**
1. Project Structure Inventory (this section)
2. UDF Discovery (Section 2)
3. Execution Graph Mapping (Section 3)

Produce each section in order. If a section cannot be completed (e.g., path
inaccessible), report what's missing and continue to the next section.

---

## Section 1: Project Structure Inventory

Validate the project directory structure, catalogue all SML files, extract the
labels table from `config/labels.yaml`, and list model files with their key
variable definitions.

### Step 1.1: Validate Required Structure

Use Glob and Read to check for the required project components. Report each as
present or absent.

**Required components (check in this order):**

| Component | Check | Required |
|-----------|-------|----------|
| `main.sml` | File exists at project root | Yes |
| `config/` | Directory exists | Yes |
| `config/labels.yaml` | File exists | Yes |
| `models/` | Directory exists | Yes |
| `rules/` | Directory exists | Yes |
| `rules/index.sml` | File exists | Expected but not fatal if absent |

**Report format:**

```
## 1. Project Structure Inventory

### 1.1 Structure Validation

Project path: /path/to/rules-project

  ✓ main.sml
  ✓ config/
  ✓ config/labels.yaml
  ✓ models/
  ✓ rules/
  ✓ rules/index.sml
```

**If ANY required component is missing:**

```
  ✗ models/ — MISSING (required)
  ✓ rules/
```

Report ALL missing components — do not stop at the first failure. Continue
investigation with whatever IS present.

### Step 1.2: List All SML Files

Use Glob to find all `.sml` files in the project.

```
Glob pattern: **/*.sml
```

**Report format:**

```
### 1.2 SML File Inventory

Found N .sml files:

  main.sml
  models/base.sml
  models/record/post.sml
  models/record/follow.sml
  models/label_guards.sml
  rules/index.sml
  rules/record/index.sml
  rules/record/post/index.sml
  rules/record/post/spam_detection.sml
  ...
```

List paths relative to the project root. Sort alphabetically.

### Step 1.3: Extract Labels Table

Read `config/labels.yaml` and produce a table of all defined labels.

**What to extract for each label:**
- Label name (the YAML key)
- `valid_for` values (entity types: UserId, AtUri, PdsHost, Handle, etc.)
- `connotation` value (neutral, positive, or negative)

**Report format:**

```
### 1.3 Labels

Source: config/labels.yaml

  Label Name              | Valid For              | Connotation
  ----------------------- | ====================== | -----------
  alt-gov                 | UserId                 | neutral
  alt-tech                | AtUri                  | neutral
  amplifier               | UserId                 | neutral
  spam-post               | UserId, AtUri          | negative
  ...

Total: N labels defined
```

If `config/labels.yaml` does not exist, report:

```
### 1.3 Labels

  ✗ config/labels.yaml not found — cannot extract labels table
```

### Step 1.4: Catalogue Model Files

Read each file in `models/` (and subdirectories). For each file, extract the key
variable definitions.

**Variable types to identify:**

| Variable Pattern | Type | Purpose |
|-----------------|------|---------|
| `EntityJson(type='X', path='...')` | Entity definition | Label target — used in LabelAdd/LabelRemove entity= |
| `JsonData(path='...')` | Primitive extraction | Data values used in rule conditions |
| `Second = 1`, `Minute = 60`, etc. | Time constant | Duration values for windows and deltas |
| `HasAtprotoLabel(entity=X, label='Y')` | Label guard | Pre-computed check preventing re-labeling |

**For each model file, report:**

```
### 1.4 Models

#### models/base.sml

  Line  | Variable            | Type           | Details
  ----- | =================== | ============== | -------
  3     | UserId              | EntityJson     | type='UserId', path='$.did'
  5     | Handle              | EntityJson     | type='Handle', path='$.handle'
  8     | ActionName          | JsonData       | path='$.action', type=str
  12    | Second              | Time constant  | = 1
  13    | Minute              | Time constant  | = 60
  14    | Hour                | Time constant  | = 3600
  15    | Day                 | Time constant  | = 86400
  16    | Week                | Time constant  | = 604800

#### models/record/post.sml

  Line  | Variable            | Type           | Details
  ----- | =================== | ============== | -------
  5     | PostText            | JsonData       | path='$.record.text', type=str
  7     | PostUri             | EntityJson     | type='AtUri', path='$.uri'
  ...

#### models/label_guards.sml

  Line  | Variable            | Type           | Details
  ----- | =================== | ============== | -------
  4     | HasSpamLabel        | Label guard    | entity=UserId, label='spam'
  5     | HasBotLabel         | Label guard    | entity=UserId, label='bot'
  ...
```

Include line numbers for every variable definition. If `models/` does not exist,
report it as missing and skip this step.

---

## Section 2: UDF Discovery

Discover all available User-Defined Functions (UDFs) that can be called from SML
rules. Use **dynamic discovery** (reading Python source) when the osprey-for-atproto
repo is accessible, falling back to **static discovery** (reading the reference file)
when it is not.

### Step 2.1: Attempt Dynamic Discovery

Try to locate `register_plugins.py` in the osprey-for-atproto repo path provided
by the caller.

**Expected location:** `{osprey-for-atproto-path}/plugins_atproto/src/register_plugins.py`

Use Read to check if this file exists.

**If the file exists:** Proceed with dynamic discovery (Steps 2.2-2.4).

**If the file does NOT exist:** Skip to Step 2.5 (Static Fallback). Report:

```
### 2.1 UDF Discovery Mode

  ✗ register_plugins.py not found at expected location
  → Falling back to static reference (may be outdated)
  Discovery mode: STATIC (low confidence)
```

### Step 2.2: Extract UDF Class Names

Read `register_plugins.py` and find the `register_udfs()` function. Extract every
class name returned in the list.

**What to look for:**
- A function decorated with `@hookimpl_osprey` named `register_udfs`
- It returns a list of class references (e.g., `TextContains`, `IncrementWindow`)
- The imports at the top of the file show where each class is imported from

**Report format:**

```
### 2.1 UDF Discovery Mode

  ✓ register_plugins.py found
  Discovery mode: DYNAMIC (high confidence)

### 2.2 Registered UDFs

  Found N UDFs registered in register_udfs():

  Standard:
    TextContains          ← udfs/std/text.py
    Tokenize              ← udfs/std/tokenize.py
    CleanString           ← udfs/std/censorize.py
    ...

  Cache:
    CacheGetStr           ← udfs/std/cache.py
    IncrementWindow       ← udfs/std/cache.py
    ...

  AT Protocol Query:
    DidFromUri            ← udfs/atproto/std/did_from_uri.py
    GetRecordURI          ← udfs/atproto/atproto.py
    ...

  AT Protocol Effects:
    AddAtprotoLabel       ← udfs/atproto/atproto_label.py
    RemoveAtprotoLabel    ← udfs/atproto/atproto_label.py
    ...
```

Group UDFs by the comment sections in `register_udfs()` (e.g., `# Std`,
`# Atproto std`, `# Atproto effects`).

### Step 2.3: Extract UDF Signatures

For each UDF class found in Step 2.2, locate its source file (from the import
statements) and extract:

1. **Arguments class:** Find the class referenced as the first type parameter of
   `UDFBase[ArgumentsClass, ReturnType]`. Read its fields to get parameter names,
   types, and defaults.

2. **Return type:** The second type parameter of `UDFBase[ArgumentsClass, ReturnType]`.

**How to identify arguments:**
- Look for `class ClassName(UDFBase[SomeArgs, ReturnType]):`
- Then find `class SomeArgs(ArgumentsBase):` (or a subclass of ArgumentsBase)
- Each field annotation is a parameter: `name: type` or `name: type = default`
- Some argument classes inherit from intermediate classes (e.g.,
  `CacheWindowArgumentsBase` extends `CacheArgumentsBase` which extends
  `ArgumentsBase`) — follow the inheritance chain to get all fields

**Report format:**

```
### 2.3 UDF Signatures

#### TextContains
  Source: udfs/std/text.py:47
  Arguments: TextContainsArguments (udfs/std/text.py:41)
    s: str                        (required)
    phrase: str                   (required)
    case_sensitive: bool          (default: False)
  Returns: bool

#### IncrementWindow
  Source: udfs/std/cache.py:364
  Arguments: IncrementWindowArguments (udfs/std/cache.py:279)
    Inherits from CacheWindowArgumentsBase → CacheArgumentsBase → ArgumentsBase
    key: str                      (required, from CacheArgumentsBase)
    window_seconds: float         (required, from CacheWindowArgumentsBase)
    when_all: List[bool]          (required, from CacheWindowArgumentsBase)
    max_ttl_seconds: Optional[float]  (default: None)
  Returns: int
```

Include line numbers for every class definition.

### Step 2.4: Produce Signature Summary Table

After extracting all signatures, produce a summary table for quick reference:

```
### 2.4 UDF Signature Summary

| UDF | Parameters | Returns |
|-----|-----------|---------|
| TextContains | s: str, phrase: str, case_sensitive=False | bool |
| ForceString | s: Optional[str] | str |
| ExtractDomains | s: str | List[str] |
| ... | ... | ... |

Total: N UDFs with signatures extracted
Discovery: DYNAMIC from {osprey-for-atproto-path}
```

### Step 2.5: Static Fallback

**Use this step ONLY when dynamic discovery failed (Step 2.1).**

Read the static reference file at:
`{skill-directory}/references/udf-signatures.md`

(The skill directory is the directory containing this SKILL.md file.)

**Report format:**

```
### 2.1 UDF Discovery Mode

  ✗ Dynamic discovery unavailable
  → Using static reference: references/udf-signatures.md
  Discovery mode: STATIC (low confidence — signatures may be outdated)

### 2.2-2.4 UDF Signatures (from static reference)

[Include the full content of references/udf-signatures.md]
```

Always include the staleness caveat when using static fallback.

---

## Section 3: Execution Graph Mapping

Trace the full execution graph from `main.sml` through all `Import` and `Require`
chains. Catalogue every `Rule()` definition and every `WhenRules()` invocation to
produce a complete map of what the rules project detects and what actions it takes.

### Step 3.1: Trace from main.sml

Read `main.sml` at the project root. Extract:

1. **Import statements:** `Import(rules=['path/to/file.sml'])` — these load models
   and definitions into scope
2. **Require statements:** `Require(rule='path/to/file.sml')` — these load rule
   files into the execution graph
3. **Conditional requires:** `Require(rule='path/to/file.sml', require_if=Condition)`
   — note the condition that gates loading

**Then follow each Require chain recursively.** For each required file:
- Read it
- Extract its Import and Require statements
- Follow those Requires in turn
- Continue until you reach leaf files (files with no further Requires)

**Report format:**

```
## 3. Execution Graph

### 3.1 Execution Graph Trace

main.sml
  ├── Import: models/base.sml
  └── Require: rules/index.sml

rules/index.sml
  ├── Import: models/base.sml
  ├── Require: rules/record/index.sml (require_if=IsOperation)
  └── Require: rules/identity/index.sml (require_if=ActionName=='identity')

rules/record/index.sml
  ├── Import: models/base.sml, models/record/post.sml
  ├── Require: rules/record/post/index.sml
  └── Require: rules/record/follow/index.sml

rules/record/post/index.sml
  ├── Import: models/base.sml, models/record/post.sml
  ├── Require: rules/record/post/spam_detection.sml
  └── Require: rules/record/post/profanity.sml

rules/record/post/spam_detection.sml  [LEAF]
  └── Import: models/base.sml, models/record/post.sml, models/label_guards.sml

rules/record/post/profanity.sml  [LEAF]
  └── Import: models/base.sml, models/record/post.sml
```

Mark leaf files (those with no `Require` statements) with `[LEAF]`.
Include the `require_if=` condition for conditional requires.

### Step 3.2: Catalogue Rule() Definitions

For each leaf file (and any file containing `Rule()` definitions), extract every
`Rule()` definition.

**What to extract:**
- Variable name the Rule is assigned to (e.g., `SpamContentRule`)
- Whether the variable has a `_` prefix (file-local, cannot be imported)
- The `when_all` conditions (list each condition on its own line)
- The `description` string if present

**Report format:**

```
### 3.2 Rule Definitions

#### rules/record/post/spam_detection.sml

  Line | Rule Variable          | Scope  | Conditions (when_all)
  ---- | ====================== | ====== | =====================
  12   | _IsNewAccount          | local  | AccountAgeSeconds < Day
       |                        |        | FollowersCount < 5
  18   | _HasSuspiciousContent  | local  | ListContains(list='spam_keywords', phrases=[PostTextCleaned]) != None
  24   | SpamDetection          | export | _IsNewAccount
       |                        |        | _HasSuspiciousContent
       |                        |        | not HasLabel(entity=UserId, label='verified')

#### rules/record/post/profanity.sml

  Line | Rule Variable          | Scope  | Conditions (when_all)
  ---- | ====================== | ====== | =====================
  10   | ProfanityDetected      | export | RegexMatch(pattern=r'...', target=PostText, case_insensitive=True)

Total: N rules across M files
```

**Scope column:**
- `local` = variable starts with `_` (file-private)
- `export` = no `_` prefix (importable by other files)

### Step 3.3: Catalogue WhenRules() Invocations

For each file containing `WhenRules()`, extract:

1. **Which rules trigger it:** The `rules_any=` list
2. **What effects fire:** The `then=` list, including:
   - Effect type (`LabelAdd`, `LabelRemove`, `AtprotoLabel`, `DeclareVerdict`, etc.)
   - Target entity (e.g., `UserId`, `AtUri`, `PdsHost`)
   - Label name or action
   - Any conditional (`apply_if=`) or temporal (`expires_after=`) modifiers

**Report format:**

```
### 3.3 WhenRules Invocations

#### rules/record/post/spam_detection.sml

  WhenRules at line 30:
    Triggers (rules_any):
      - SpamDetection
    Effects (then):
      - LabelAdd(entity=UserId, label='spam_suspect')
      - LabelAdd(entity=AtUri, label='spam_content')

  WhenRules at line 38:
    Triggers (rules_any):
      - SpamDetection
    Effects (then):
      - AtprotoLabel(entity=UserId, label='spam', comment='Automated spam detection')

#### rules/record/post/profanity.sml

  WhenRules at line 16:
    Triggers (rules_any):
      - ProfanityDetected
    Effects (then):
      - LabelAdd(entity=UserId, label='profanity', expires_after=TimeDelta(days=7))

Total: N WhenRules invocations across M files
```

### Step 3.4: Rule → Conditions → Effect → Label Summary

Produce a flat summary table linking every rule to its final outcomes. This is the
most actionable output for rule-writing agents — it shows at a glance what each
rule does.

**Report format:**

```
### 3.4 Rule Summary

| Rule | File | Conditions | Effect | Label | Entity |
|------|------|-----------|--------|-------|--------|
| SpamDetection | spam_detection.sml:24 | _IsNewAccount AND _HasSuspiciousContent AND NOT verified | LabelAdd | spam_suspect | UserId |
| SpamDetection | spam_detection.sml:24 | (same) | LabelAdd | spam_content | AtUri |
| SpamDetection | spam_detection.sml:24 | (same) | AtprotoLabel | spam | UserId |
| ProfanityDetected | profanity.sml:10 | RegexMatch profanity pattern | LabelAdd | profanity | UserId |

Conditional graph gates:
  - rules/record/* only loaded when IsOperation is true
  - rules/identity/* only loaded when ActionName == 'identity'
```

A single rule may appear on multiple rows if it triggers multiple effects
(via the same or different `WhenRules()` blocks).

Include conditional graph gates at the bottom to note which rules are only
active under specific event conditions.
