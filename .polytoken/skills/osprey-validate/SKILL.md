---
description: >-
  Validate an Osprey SML rules project by running
  `uv run osprey-cli push-rules --dry-run` from the osprey-for-atproto repo and
  reporting the full result without summarising.
---

# Osprey Validate

Validate an Osprey SML rules project by running the osprey-cli dry-run push from
inside the `osprey-for-atproto` repository. Report the FULL osprey-cli output —
never summarise, truncate, or omit any errors.

## Resolve the rules project path

Resolution order (first non-empty match wins):

1. An explicit path the caller gave you.
2. The `OSPREY_RULES_PATH` environment variable (read with the `shell` tool:
   `echo "$OSPREY_RULES_PATH"`).
3. Ask the operator via the `ask_user_question` tool.

After resolving, confirm the path contains `main.sml` (run
`test -f "$RULES_PATH/main.sml"` via `shell`). If it does not, report the error
and stop.

## Resolve the osprey-for-atproto repo path

`osprey-cli` is never installed globally. It lives inside the
`osprey-for-atproto` repository and must be invoked via `uv run`. Resolve the
repo path:

1. `OSPREY_REPO_PATH` if set and it contains `osprey_worker/`
   (`test -d "$OSPREY_REPO_PATH/osprey_worker"`).
2. Otherwise walk up from the rules project path looking for a directory that
   contains `osprey_worker/`.
3. Otherwise ask the operator via the `ask_user_question` tool.

Persist the resolved repo path for the session.

## Run validation

From the osprey repo, capture both stdout and stderr:

```bash
cd "$OSPREY_REPO" && uv run osprey-cli push-rules "$RULES_PATH" --dry-run
```

## Report results

- Exit code 0 → "Validation successful; the Osprey rules project is valid."
- Exit code 1 → "Validation failed." Show the errors above, then offer to load
  the `fixing-osprey-rules` skill for debugging assistance.
- Any other exit code → report the unexpected code and note that
  `uv run osprey-cli` should work from `$OSPREY_REPO`.

**Report the FULL osprey-cli output verbatim.** Do not summarise, truncate, or
omit any errors.
