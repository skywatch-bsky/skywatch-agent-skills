---
name: planning-osprey-rules
description: Use when gathering requirements for a new Osprey SML rule before any code is written. Not triggered on general coding tasks — only when planning what a rule should detect, which labels to apply, and what signals to use.
user-invocable: false
---

# Planning Osprey Rules

This workflow guides you through gathering requirements and producing a structured
rule specification before any SML code is written.

## 1. Validate Input Context

The orchestrator provides you with context before you begin. Verify you have
everything you need.

**Required inputs (provided by orchestrator in your prompt):**
1. **Investigator report** — structured text report from `osprey-rule-investigator`
   containing project structure, labels table, model catalogue, UDF signatures,
   and execution graph map.
2. **User request** — what the user wants a rule for.

**Validate the investigator report contains:**
- Labels table (label names, valid_for, connotation)
- Model catalogue (variable names, types)
- UDF signatures (available functions)
- Execution graph map (Import/Require chains)

**If the investigator report is missing or incomplete:** Report what's missing and
ask the orchestrator to re-dispatch the investigator. Do NOT proceed without
project context.

## 2. Understand the Target Behaviour

Before writing any code, understand what the user wants to detect.

**Ask clarifying questions:**
1. **What event type?** (post, follow, identity, repost, etc.)
2. **What signals?** (text patterns, metadata, account age, etc.)
3. **What label to emit?** (must exist in `config/labels.yaml`)
4. **Expiration/validity?** (permanent, expiring, conditional)
5. **Who/what gets labeled?** (the account, the post, both?)

**Map to labeling patterns:**
- Chain to `osprey-sml-reference` skill to look up common labeling patterns if you
  need naming conventions or syntax examples.
- Document the detection logic in plain English before writing code.

Example user request:
> "I want to detect posts that contain profanity and label them with 'contains-profanity'."

Analysis:
- Event type: record (post)
- Signal: post text content contains profanity
- Label: contains-profanity (check labels.yaml to confirm it exists)
- Target: the post (AtUri)

## 3. Produce Rule Specification

After gathering requirements, produce a structured plain-text specification that the
implementation agent can use to write SML.

**Rule specification format:**

```
## Rule Specification: [Rule Name]

**Target behaviour:** [What the rule detects]
**Event type:** [Which AT Protocol event triggers the rule]
**Signals:** [What data points the rule examines]
**Models needed:** [ML models or UDFs required, referencing available ones from investigator report]
**Labels to apply:** [Which labels from config/labels.yaml to use]
**Target entity:** [What gets labeled — account, record, etc.]
**Effect type:** [LabelAdd, AtprotoLabel, DeclareVerdict, etc.]
**Expiration:** [Duration if applicable, using named constants: Day, Hour, Week]
**Guard conditions:** [Re-labeling prevention if needed]

**Detection logic (plain English):**
[Step-by-step description of what conditions trigger the rule]

**Examples:**
- Should catch: [content examples]
- Should NOT catch: [counter-examples]

**Edge cases:**
- [Boundary conditions discussed with the user]
```

**Confirm with user:** Present the specification and get explicit confirmation before
handing off to the implementation agent.

## 4. Skill Chaining

Load additional skills when you need specialized guidance during planning.

**When to chain to `osprey-sml-reference`:**
- Need to look up available labeling patterns
- Unsure of naming conventions for the planned rule
- Need to understand what effect types are available
- Want to verify a UDF exists or understand its signature

Load with: `Skill(skill='osprey-sml-reference')`

## 5. Common Mistakes

These are planning-phase mistakes that lead to problems downstream.

1. **Hardcoding label names not in `config/labels.yaml`**
   - Wrong: Plan a rule using a label without checking if it exists
   - Right: Check `config/labels.yaml` using the investigator report first
   - Impact: Validation fails when implementation agent writes the effect

2. **Not asking about the target entity**
   - Wrong: Assume every rule labels the account
   - Right: Ask whether the account, the post, or both should be labeled
   - Impact: Wrong entity type in models, must rewrite

3. **Skipping UDF availability check**
   - Wrong: Plan a rule assuming a UDF exists
   - Right: Check the investigator's UDF catalogue for available functions
   - Impact: Implementation agent discovers missing UDF mid-authoring

## 6. Rationalizations to Block

| Rationalization | Reality | Action |
| --- | --- | --- |
| "This label probably exists" | No. Labels must be explicitly configured. | Check the investigator report's labels table and confirm the label exists before including it in the spec. |
| "I know the type system" | No. SML type rules are strict. | Load `osprey-sml-reference` if uncertain about EntityJson vs JsonData. |
| "The investigator report looks fine" | No. Incomplete context causes downstream failures. | Validate every required section of the investigator report before proceeding. |
| "I'll figure out the entity type later" | No. Entity type determines model structure. | Ask the user what gets labeled (account, record, both) during requirements gathering. |
| "The user knows what they want" | Requirements need refinement. | Always ask clarifying questions even if the request seems clear. |

---

**Output:** A confirmed rule specification in plain text. Hand this to the
orchestrator, which passes it to `osprey-rule-impl` with the investigator report.
