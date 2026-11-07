---
name: project-context-sync
description: Initialize, recover, incrementally update, or query versioned project knowledge across clones and branches; use before project development or system-level review when knowledge is missing or stale.
---

Use the shared project-assistant implementation; do not build a second index or use chat history as the knowledge store.

Invoke `<SKILL_DIR>/scripts/run.ps1` with the commands below. Use `--config <project.json>` BEFORE the command for another project; the installed RecSDK profile is the default.

- `doctor --network` checks dependencies, the selected model backend (Codex login only for `provider=codex`; endpoint/model/credential for DeepSeek) and GitCode read access. Diagnose failures before automated work; an absent provider is an error, not a fallback.
- `context sync --ref <branch> --fetch` updates semantic knowledge at the fetched commit.
- `context sync --ref <branch> --structural-only` builds a deterministic Understand index without model calls. Clearly identify it as incomplete semantic knowledge.
- `context query --ref <branch> --query "<task>" --path <relative-file>` retrieves bounded, relevant context.

The controller owns source workspaces, immutable snapshots, branch pointers, parser caches and atomic publication. Never copy one branch's mutable graph over another or overwrite a mainline pointer with PR/feature knowledge. Recovery across clones requires the same canonical origin and retained independent state storage. Do not infer that a parser missing callers means there are none.

When explaining a result, state the repository, commit and semantic/structural mode; surface truncated context, unsupported parsers, unconfirmed requirements and missing performance evidence. Source observations describe current behavior, not automatically intended behavior. Capture stakeholder-approved requirements separately before treating them as authoritative.
