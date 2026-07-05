---
description: Validate Osprey SML rules via uv run osprey-cli push-rules --dry-run
argument-hint: [rules-project-path]
allowed-tools: [Bash, Read, Skill, AskUserQuestion]
---

# Osprey Validate

Validates an Osprey SML rules project by running `uv run osprey-cli push-rules <path> --dry-run` from within the `osprey-for-atproto` repository.

## Path Resolution

First, determine the path to the Osprey rules project.

Resolution order (first match wins):
1. `$ARGUMENTS` if provided and non-empty
2. `$OSPREY_RULES_PATH` environment variable
3. Ask the user via `AskUserQuestion`

```bash
if [ -n "$ARGUMENTS" ]; then
  RULES_PATH="$ARGUMENTS"
elif [ -n "$OSPREY_RULES_PATH" ]; then
  RULES_PATH="$OSPREY_RULES_PATH"
else
  # Use AskUserQuestion to prompt for the path
fi
```

After obtaining the path, validate it contains `main.sml`:

```bash
if [ ! -f "$RULES_PATH/main.sml" ]; then
  echo "Error: '$RULES_PATH' does not contain main.sml. Please verify the path."
  exit 1
fi
```

## Locate the osprey-for-atproto Repository

`osprey-cli` is never installed globally. It lives inside the `osprey-for-atproto` repository and is invoked via `uv run`. You must find or obtain this repo before running validation.

**Persist the osprey repo path for the session.** Once resolved, reuse it on subsequent validations without re-asking.

### Strategy 1: Check environment variable

```bash
if [ -n "$OSPREY_REPO_PATH" ] && [ -d "$OSPREY_REPO_PATH/osprey_worker" ]; then
  OSPREY_REPO="$OSPREY_REPO_PATH"
fi
```

### Strategy 2: Infer from the rules project path

Walk up from the rules project path looking for the osprey repo. For example, if the rules path is `/dev/osprey/rules`, check whether `/dev/osprey/` (or any ancestor) contains `osprey_worker/` — which indicates it is the `osprey-for-atproto` repo root.

```bash
# Walk up from RULES_PATH looking for osprey_worker/
CANDIDATE="$RULES_PATH"
while [ "$CANDIDATE" != "/" ]; do
  CANDIDATE=$(dirname "$CANDIDATE")
  if [ -d "$CANDIDATE/osprey_worker" ]; then
    OSPREY_REPO="$CANDIDATE"
    break
  fi
done
```

### Strategy 3: Ask the user

If inference fails, use `AskUserQuestion` to ask the user for the path to `osprey-for-atproto`. The user may provide either:

- **A local path** (e.g., `/home/user/osprey-for-atproto`) — use it directly.
- **A git URL** (e.g., `https://github.com/org/osprey-for-atproto.git`) — clone it to `/tmp` and run `uv sync`:

```bash
OSPREY_REPO="/tmp/osprey-for-atproto"
git clone "$GIT_URL" "$OSPREY_REPO"
cd "$OSPREY_REPO" && uv sync
```

### Validate the osprey repo

Confirm the resolved path contains `osprey_worker/`:

```bash
if [ ! -d "$OSPREY_REPO/osprey_worker" ]; then
  echo "Error: '$OSPREY_REPO' does not appear to be the osprey-for-atproto repository."
  echo "Expected to find osprey_worker/ directory."
  exit 1
fi
```

## Run Validation

Execute the validation command from the osprey repo, capturing both stdout and stderr:

```bash
cd "$OSPREY_REPO" && uv run osprey-cli push-rules "$RULES_PATH" --dry-run
EXIT_CODE=$?
```

## Handle Results

Check the exit code and report results accordingly.

**If exit code is 0 (success):**
```bash
if [ $EXIT_CODE -eq 0 ]; then
  echo "Validation successful! Your Osprey rules project is valid."
fi
```

**If exit code is 1 (validation failure):**
```bash
if [ $EXIT_CODE -eq 1 ]; then
  echo "Validation failed. Please review the errors above and fix your rules project."
fi
```

**If exit code is anything else (unexpected error):**
```bash
if [ $EXIT_CODE -ne 0 ] && [ $EXIT_CODE -ne 1 ]; then
  echo "Unexpected error (exit code $EXIT_CODE). Check that 'uv run osprey-cli' works from '$OSPREY_REPO'."
fi
```

**CRITICAL: Report the FULL error output from osprey-cli. Do NOT summarize, truncate, or omit any errors.** Display all output from the osprey-cli command exactly as it was produced.

## Optional: Load Debugging Skill on Failure

If validation failed (exit code 1), offer to help the user fix the errors. Load the `debugging-osprey-rules` skill using the Skill tool to provide detailed debugging assistance.
