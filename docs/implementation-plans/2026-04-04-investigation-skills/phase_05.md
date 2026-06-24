# Investigation Skills Implementation Plan — Phase 5: Investigator Agent Integration

**Goal:** Update the investigator agent and plugin CLAUDE.md to reference the 4 new skills, enabling on-demand loading during relevant investigation phases.

**Architecture:** Modify two existing markdown files — `investigator.md` gets a new "Optional Skills" section after the existing "Required Skills" section; `CLAUDE.md` gets the 4 new skills added to its "Exposes" section. No new files, no structural changes.

**Tech Stack:** Markdown. No code, no dependencies.

**Scope:** Phase 5 of 5 from original design.

**Prerequisites:** Phases 1-4 must be completed before this phase. This phase modifies existing files to reference skills created in Phases 1-4.

**Codebase verified:** 2026-04-04

---

## Acceptance Criteria Coverage

This phase implements and tests:

### investigation-skills.AC5: Investigator Integration
- **investigation-skills.AC5.1 Success:** Investigator agent loads assess-account when entering Phase 2 (Characterization)
- **investigation-skills.AC5.2 Success:** Investigator agent loads search-incidents when investigation starts from a topic (Phase 1 Discovery)
- **investigation-skills.AC5.3 Success:** Investigator agent loads classify-cluster when cosharing cluster is identified (Phase 3/4)
- **investigation-skills.AC5.4 Success:** Investigator agent loads triage-rule-hits when evaluating rule coverage (Phase 5)
- **investigation-skills.AC5.5 Success:** Skills are loaded on-demand, not pre-loaded at investigation start
- **investigation-skills.AC5.6 Success:** CLAUDE.md Exposes section lists all 4 new skills

---

<!-- START_TASK_1 -->
### Task 1: Add Optional Skills section to investigator agent

**Verifies:** investigation-skills.AC5.1, investigation-skills.AC5.2, investigation-skills.AC5.3, investigation-skills.AC5.4, investigation-skills.AC5.5

**Files:**
- Modify: `plugins/skywatch-investigations/agents/investigator.md:24-25` (insert after line 25, which is the end of the Required Skills section)

**Implementation:**

Insert the following section after the "Required Skills" section (after line 25 — the blank line after `2. \`reporting-results\``) and before the "## Label Reference" heading:

```markdown

## Optional Skills

Load these skills on-demand when entering the relevant investigation phase. Use the Skill tool to load each one only when needed — do not pre-load all skills at investigation start, as they consume context window space.

| Skill | Load When | Phase |
|-------|-----------|-------|
| `search-incidents` | Investigation starts from a topic rather than a specific account | Phase 1 (Discovery) |
| `assess-account` | Profiling an account of interest | Phase 2 (Characterization) |
| `classify-cluster` | A co-sharing cluster is identified during linkage or amplification analysis | Phase 3 (Linkage) or Phase 4 (Amplification) |
| `triage-rule-hits` | Evaluating rule coverage and health | Phase 5 (Rule Validation) |

**Loading guidance:**
- Load the skill at the start of the relevant phase, before dispatching data-analyst queries
- The skill defines what research questions to dispatch, what classification schema to apply, and what output to produce
- Follow the skill's methodology — it supplements (not replaces) the conducting-investigations phase structure
- If multiple skills apply in a single investigation, load each at its relevant phase — do not batch-load

```

**Step 2: Verify the edit**

Run: `grep -n "Optional Skills" plugins/skywatch-investigations/agents/investigator.md`
Expected: Shows the new section heading with a line number between the Required Skills and Label Reference sections.

Run: `grep -c "search-incidents\|assess-account\|classify-cluster\|triage-rule-hits" plugins/skywatch-investigations/agents/investigator.md`
Expected: 4 (one reference per skill).

**Step 3: Commit**

```bash
git add plugins/skywatch-investigations/agents/investigator.md
git commit -m "feat: add optional skills section to investigator agent"
```
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Update CLAUDE.md Exposes section

**Verifies:** investigation-skills.AC5.6

**Files:**
- Modify: `plugins/skywatch-investigations/CLAUDE.md:22-26` (the existing Skills subsection under Exposes)

**Implementation:**

The current Skills subsection (lines 22-26) lists 4 skills. Add the 4 new skills to this list. Replace lines 22-26 with:

```markdown
- **Skills**:
  - `accessing-osprey` — Osprey system context and schema reference
  - `querying-clickhouse` — ClickHouse query patterns and best practices
  - `conducting-investigations` — investigation methodology (reconnaissance, correlation, analysis)
  - `reporting-results` — report structure, formatting, and presentation
  - `assess-account` — structured account assessment with classification schema and recommendation
  - `search-incidents` — topic-based incident search with relevance scoring and content classification
  - `triage-rule-hits` — rule hit triage with TP/FP/novel classification and rule health assessment
  - `classify-cluster` — co-sharing cluster narrative classification distinguishing IO from organic coordination
```

Also update the "Last verified" date on line 3 to the current date at time of implementation.

Also add the 4 new skills to the "When to Use" table (lines 74-96). Add these rows before the closing of the table:

```markdown
| "Assess this account" | `assess-account` skill (standalone) or `investigator` agent |
| "Search for incidents about X" | `search-incidents` skill (standalone) or `investigator` agent |
| "Triage rule hits for rule X" | `triage-rule-hits` skill (standalone) or `investigator` agent |
| "Classify this cluster" | `classify-cluster` skill (standalone) or `investigator` agent |
```

Also add the 4 new skill files to the "Key Files" table (lines 98-110). Add these rows:

```markdown
| `skills/assess-account/SKILL.md` | Structured account assessment methodology |
| `skills/search-incidents/SKILL.md` | Topic-based incident search methodology |
| `skills/triage-rule-hits/SKILL.md` | Rule hit triage methodology |
| `skills/classify-cluster/SKILL.md` | Co-sharing cluster classification methodology |
```

**Step 2: Verify the edits**

Run: `grep -c "assess-account\|search-incidents\|triage-rule-hits\|classify-cluster" plugins/skywatch-investigations/CLAUDE.md`
Expected: 12 (each skill appears 3 times: Exposes, When to Use, Key Files).

**Step 3: Commit**

```bash
git add plugins/skywatch-investigations/CLAUDE.md
git commit -m "feat: add 4 new investigation skills to CLAUDE.md"
```
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Verify plugin skill discovery

**Verifies:** investigation-skills.AC5.6 (all skills discoverable)

**Files:**
- None modified (verification only)

**Step 1: Verify all skill directories exist**

Run: `ls -d plugins/skywatch-investigations/skills/*/`
Expected: 8 directories listed:
- `plugins/skywatch-investigations/skills/accessing-osprey/`
- `plugins/skywatch-investigations/skills/assess-account/`
- `plugins/skywatch-investigations/skills/classify-cluster/`
- `plugins/skywatch-investigations/skills/conducting-investigations/`
- `plugins/skywatch-investigations/skills/querying-clickhouse/`
- `plugins/skywatch-investigations/skills/reporting-results/`
- `plugins/skywatch-investigations/skills/search-incidents/`
- `plugins/skywatch-investigations/skills/triage-rule-hits/`

**Step 2: Verify each skill has a valid SKILL.md with frontmatter**

Run: `for skill in plugins/skywatch-investigations/skills/*/SKILL.md; do echo "--- $skill ---"; head -5 "$skill"; echo; done`
Expected: Each file starts with `---` (YAML frontmatter delimiter), has a `name:` field, and has `user-invocable: false`.

**Step 3: Verify investigator agent references all skills**

Run: `grep -c "assess-account\|search-incidents\|classify-cluster\|triage-rule-hits" plugins/skywatch-investigations/agents/investigator.md`
Expected: 4.

**Step 4: No commit needed (verification only)**
<!-- END_TASK_3 -->
