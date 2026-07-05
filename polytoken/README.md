# Skywatch Polytoken Pack

Project-local Polytoken assets for Skywatch moderation operations, AT Protocol investigations, Osprey rule work, ClickHouse data analysis, and report writing.

This directory is a tracking copy of the Skywatch-specific assets that can be installed into a repo's `.polytoken/` directory.

## Contents

```text
.
├── .agentblock.example     # Agent/file-tool blocklist template for local secrets
├── .envrc.example          # Local environment template; copy to project .envrc
├── README.md               # This file
├── facets/
│   └── skywatch.md         # Skywatch front-desk/routing facet
├── hooks.json              # Project hook registry
├── hooks/
│   ├── load-clickhouse-env.sh
│   └── validate-label-comment.js
├── skills/
│   └── skywatch-*/         # Skywatch workflow/reference skills
└── subagents/
    ├── data-analyst.md
    ├── investigator.md
    └── osprey-rule-writer.md
```

## Install into a Polytoken project

From a target project root:

```bash
mkdir -p .polytoken
rsync -a $HOME/dev/polyskills/skywatch/skills/ .polytoken/skills/
rsync -a $HOME/dev/polyskills/skywatch/facets/ .polytoken/facets/
rsync -a $HOME/dev/polyskills/skywatch/hooks/ .polytoken/hooks/
rsync -a $HOME/dev/polyskills/skywatch/subagents/ .polytoken/subagents/
cp $HOME/dev/polyskills/skywatch/hooks.json .polytoken/hooks.json
cp $HOME/dev/polyskills/skywatch/.envrc.example .envrc
cp $HOME/dev/polyskills/skywatch/.agentblock.example .agentblock
mkdir -p secrets
chmod 700 secrets
```

Then edit `.envrc` with non-secret local values. Put secret and machine-local values in ignored/blocklisted secret files:

```bash
cat > secrets/clickhouse.env <<'EOF'
CLICKHOUSE_PASSWORD=your-clickhouse-password
CLICKHOUSE_SSH_KEY=/home/you/.ssh/id_ed25519
EOF

cat > secrets/ozone.env <<'EOF'
OZONE_ADMIN_PASSWORD=your-ozone-password
EOF

chmod 600 secrets/*.env
```

Then run:

```bash
direnv allow .
```

Restart or reload Polytoken so it discovers the project-local assets.

## Environment model

The ClickHouse/Osprey/Ozone workflows use project-local `.envrc` variables loaded with:

```bash
direnv exec . bash -lc '...'
```

`.envrc.example` keeps non-secret configuration in `.envrc` and loads local secret files with:

```bash
source_env_if_exists secrets/clickhouse.env
source_env_if_exists secrets/ozone.env
```

Recommended secret split:

- `secrets/clickhouse.env`: `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_SSH_KEY`
- `secrets/ozone.env`: `OZONE_ADMIN_PASSWORD`

Important notes:

- Do **not** commit a real `.envrc`, `.agentblock`, or `secrets/*.env` containing credentials.
- Copy `.agentblock.example` to `.agentblock` so agents/file-inspection tools block the local `secrets/` folder.
- `CLICKHOUSE_PORT` is the native ClickHouse client port (`9000`), not the HTTP port (`8123`).
- `CLICKHOUSE_SSH_KEY` should be an absolute path to a readable private key.
- For Tailscale SSH, an interactive browser approval may be required before non-interactive agent SSH succeeds.
- `SKYWATCH_VAULT` points report-writing skills at the Obsidian vault root.
- If using `skywatch-mcp` stdio MCP tools, launch that MCP server through `direnv exec /path/to/project ...` so Ozone credentials are present when the server process starts.

## Core workflows

### `skywatch` facet

Routes user requests to the right workflow:

- queue triage and Ozone moderation
- AT Protocol investigations
- account assessments
- cluster classification
- ClickHouse analysis
- Osprey SML rule work
- report writing

### `data-analyst` subagent

Queries ClickHouse via SSH + Docker and returns structured findings with SQL used.

Current schema assumptions:

- `default.osprey_execution_results` is a **wide event table**.
- Only these columns are universal:
  - `__action_id`
  - `__timestamp`
  - `__error_count`
  - `__atproto_label`
  - `__entity_label_mutations`
  - `__verdicts`
- Identity, text, model output, and rule result columns are dynamic PascalCase columns such as `UserId`, `Handle`, `PostTextCleaned`, `AccountAgeSeconds`, `AltGovHandleRule`.
- Agents must discover live columns with `DESCRIBE TABLE` or `system.columns`; they must not invent flat columns like `did`, `handle`, `rule_name`, `matched`, `score`, or `created_at` for this table.

### `investigator` subagent

Coordinates multi-step AT Protocol investigations. It delegates ClickHouse extraction to `data-analyst`, performs recon directly through Skywatch MCP tools, and reports using BLIND conventions.

### `osprey-rule-writer` subagent

Handles Osprey SML rule lifecycle work: investigating rule projects, planning, authoring, validating, reviewing, and fixing rules.

## Hooks

`hooks.json` registers:

- `validate-ozone-label-comment` — validates Ozone label comments before label writes.
- `load-env` — currently a compatibility/no-op placeholder. Current Polytoken `pre_tool_use` hooks can allow/deny but cannot modify `shell_exec` input, so command environment loading is handled through `direnv exec .` instead.

## Validate ClickHouse access

From a configured target project root:

```bash
direnv exec . bash -lc '
  key="$CLICKHOUSE_SSH_KEY"
  ssh -F /dev/null -i "$key" \
    -o BatchMode=yes \
    -o PreferredAuthentications=publickey \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o ConnectTimeout=8 \
    -o StrictHostKeyChecking=accept-new \
    -p "${CLICKHOUSE_SSH_PORT:-22}" \
    "$CLICKHOUSE_SSH_USER@$CLICKHOUSE_SSH_HOST" \
    "sudo docker exec $CLICKHOUSE_DOCKER_CONTAINER clickhouse-client --host=$CLICKHOUSE_HOST --port=$CLICKHOUSE_PORT --user=$CLICKHOUSE_USER --password='\''$CLICKHOUSE_PASSWORD'\'' --database=$CLICKHOUSE_DATABASE --format=JSON --query=\"SELECT 1 AS ok LIMIT 1\""
'
```

Expected result includes:

```json
{"ok": 1}
```

## Sync from the active Skywatch repo

From `$HOME/skywatch`:

```bash
rsync -a --delete .polytoken/skills/ $HOME/dev/polyskills/skywatch/skills/
rsync -a --delete .polytoken/facets/ $HOME/dev/polyskills/skywatch/facets/
rsync -a --delete .polytoken/hooks/ $HOME/dev/polyskills/skywatch/hooks/
rsync -a --delete .polytoken/subagents/ $HOME/dev/polyskills/skywatch/subagents/
cp .polytoken/hooks.json $HOME/dev/polyskills/skywatch/hooks.json
```

Keep `.envrc.example` generic; never sync a real `.envrc` into this pack.
