# Skywatch Agent Skills

Single source of truth for Skywatch's agent assets — investigation methodology, Osprey SML rule workflows, ClickHouse/Ozone tooling, and report conventions. This is not a traditional codebase; it is a content repository that ships the same domain material to two distribution targets.

## Tech Stack

- **No build system** — Markdown files and JSON manifests only
- **Claude Code plugins** — `.claude-plugin/plugin.json` manifests, skill/agent Markdown
- **Polytoken pack** — facet/subagent/skill Markdown with `polytoken:` frontmatter, `hooks.json`
- **MCP server** — external Python (FastMCP), installed via `uvx` from `git@github.com:skywatch-bsky/skywatch-mcp.git`; no server source lives here
- **Hook scripts** — Node.js (`validate-label-comment.js`) and Bash (`load-clickhouse-env.sh`)

## Commands

```bash
# Validate an Osprey SML rule project (from the project root, not here)
uv run osprey-cli push-rules --dry-run

# Sync Polytoken pack into a working project
rsync -a polytoken/skills/    /target/.polytoken/skills/
rsync -a polytoken/facets/    /target/.polytoken/facets/
rsync -a polytoken/hooks/     /target/.polytoken/hooks/
rsync -a polytoken/subagents/ /target/.polytoken/subagents/
cp polytoken/hooks.json /target/.polytoken/hooks.json

# Inspect shipped Polytoken definitions (for authoring reference)
polytoken vfs ls polytoken://facets
polytoken vfs cat polytoken://facets/execute.md
polytoken vfs cat polytoken://subagents/researcher.md
```

## Project Structure

```
claude-skills/                    # Claude Code plugin marketplace target
├── .claude-plugin/               # marketplace manifest (name: skywatch-skills)
└── plugins/
    ├── osprey-rules/             # SML rule authoring orchestrator (v0.3.1)
    ├── osprey-rule-investigator/ # read-only SML project analysis (v0.1.1)
    └── skywatch-investigations/  # investigation toolkit (v0.25.0)
polytoken/                        # Polytoken pack target
├── facets/skywatch.md            # front-desk routing facet
├── hooks/                        # validate-label-comment.js, load-clickhouse-env.sh
├── hooks.json                    # project hook registry
├── skills/skywatch-*/            # one dir per skill (skywatch- prefixed)
└── subagents/                    # investigator, data-analyst, osprey-rule-writer
CHANGELOG.md                      # versioned changes across all plugins
```

## Conventions

### Two targets, one source — update both

The Claude Code plugins and Polytoken pack carry the same domain content with different framing:

| Aspect | Claude Code (`claude-skills/`) | Polytoken (`polytoken/`) |
|--------|-------------------------------|--------------------------|
| Skill name | bare (`conducting-investigations`) | prefixed (`skywatch-conducting-investigations`) |
| Tool name | short (`ozone_label`) | fully qualified (`mcp__skywatch-mcp__ozone_label`) |
| Agent frontmatter | `allowed-tools` | `polytoken:` block with `tools`/`undeferred_tools` |
| Install | Claude Code marketplace | rsync into project `.polytoken/` |

When editing content, update **both** targets unless the change is target-specific.

### Changelog discipline

Every meaningful change gets a `CHANGELOG.md` entry under the relevant plugin version. Bump the version in `claude-skills/.claude-plugin/*.json` when shipping.

## Boundaries

- **Safe to edit**: `claude-skills/`, `polytoken/`, `CHANGELOG.md`
- **Never create**: root-level `CLAUDE.md` (gitignored; only allowed inside plugin directories)
- **Never commit**: credentials, real `.envrc`, `secrets/*.env`
- **Do not duplicate**: the MCP server source lives in a separate repo — this repo only references it

## Gotchas

- `osprey_execution_results` is a wide event table with dynamic PascalCase columns. Only `__action_id`, `__timestamp`, `__error_count`, `__atproto_label`, `__entity_label_mutations`, `__verdicts` are universal — discover live columns with `DESCRIBE TABLE`, never assume flat columns like `did` or `handle`.
- The `investigator` agent never writes SQL — it delegates all ClickHouse queries to the `data-analyst` subagent.
- Label writes are hook-enforced: `validate-label-comment.js` blocks `ozone_label` calls unless the comment meets `labeling-standards` (summary line + Evidence section with AT-URI citations).
- Ozone auth goes through the PDS (via `atproto-proxy` header), not directly to the Ozone service URL.
