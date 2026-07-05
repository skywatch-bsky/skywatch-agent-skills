# Skywatch Agent Skills

Skywatch Agent Skills is the source repository for Skywatch's agent-facing workflow assets: investigation skills, Osprey rule-writing guidance, subagents, hooks, and report conventions.

This repo ships the same domain material to two targets:

- [`claude-skills/`](claude-skills/) — Claude Code plugin marketplace package.
- [`polytoken/`](polytoken/) — [Polytoken](https://docs.polytoken.dev/introduction/) pack with facets, skills, subagents, and hooks.

For implementation guidance and repository conventions, see [`AGENTS.md`](AGENTS.md). For release history, see [`CHANGELOG.md`](CHANGELOG.md).

## What's here

| Path | Purpose |
| --- | --- |
| [`claude-skills/`](claude-skills/) | Claude Code plugins for Skywatch investigations, Osprey rule writing, and Osprey rule investigation. |
| [`polytoken/`](polytoken/) | Project-local Polytoken assets that can be synced into a `.polytoken/` directory. See [`polytoken/README.md`](polytoken/README.md). |
| [`CHANGELOG.md`](CHANGELOG.md) | Versioned changes across the shipped plugins and packs. |
| [`AGENTS.md`](AGENTS.md) | Notes for agents working in this repository. |

## Secret Management

Both targets use the same [direnv](https://direnv.net/)-based workflow for configuration and secrets. Each pack ships an `.envrc.example` template; nothing in this repository contains real credentials.

In the working directory you run your agent from:

```bash
cp <pack>/.envrc.example .envrc

mkdir -p secrets
chmod 700 secrets

cat > secrets/clickhouse.env <<'EOF'
CLICKHOUSE_PASSWORD=your-clickhouse-password
EOF

cat > secrets/ozone.env <<'EOF'
OZONE_ADMIN_PASSWORD=your-ozone-password
EOF

chmod 600 secrets/*.env
direnv allow .
```

Non-secret configuration lives directly in `.envrc`; secrets live in `secrets/*.env`, which `.envrc` loads via `source_env_if_exists`. Never commit a real `.envrc` or `secrets/*.env` — both are gitignored here, and should be in your own projects too.

How the environment reaches the tools differs by target:

- **claude-skills** — Claude Code launches plugin MCP servers as child processes, so they inherit the direnv-loaded environment. Launch `claude` from the directory where the `.envrc` is active, and restart it after credential changes. See [`claude-skills/README.md`](claude-skills/README.md) → Environment Setup.
- **polytoken** — hooks cannot inject environment into `shell_exec`, so skills wrap commands in `direnv exec . bash -lc '...'`. Copy `.agentblock.example` to `.agentblock` so file-inspection tools block the local `secrets/` folder. See [`polytoken/README.md`](polytoken/README.md).

## Notes

- The Skywatch MCP server source is not vendored here. It is fetched externally at runtime.
- Most changes should be mirrored between `claude-skills/` and `polytoken/` unless the change is target-specific.
