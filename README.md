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

## Notes

- The Skywatch MCP server source is not vendored here. It is fetched externally at runtime.
- Most changes should be mirrored between `claude-skills/` and `polytoken/` unless the change is target-specific.
