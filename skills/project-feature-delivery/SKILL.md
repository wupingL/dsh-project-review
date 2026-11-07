---
name: project-feature-delivery
description: Design, implement and verify a user-requested feature using existing versioned project knowledge and an isolated workspace; keep candidate knowledge separate until mainline merge.
---

Invoke `<SKILL_DIR>/scripts/run.ps1`. Optional `--config <project.json>` precedes commands.

1. `feature design --branch <target> --request "<requirements and resolved constraints>" --fetch` creates a bounded context pack, design, acceptance criteria, impact and validation plan. Resolve substantive open questions with the user; rerun design with clarified requirements before implementation.
2. `feature implement --task <id>` implements in a separate worktree only when the selected backend has a controlled writable executor (the Codex backend). A DeepSeek API backend must refuse this phase before touching the workspace; a model-written patch description is not an executed change. This is a user-initiated development action, never a background polling task. It may run relevant local checks in the available environment.
3. `feature verify --task <id>` verifies against acceptance criteria only with a controlled writable executor, distinguishes performed checks from unavailable checks, and writes pending knowledge updates. A DeepSeek API backend refuses verification rather than fabricating test results. `feature status --task <id>` shows state and workspace.

Reuse context sync/query rather than rereading the whole project or creating a parallel knowledge store. Confirm current source for the selected implementation sites; review architecture, contracts, impacted consumers and tests. Do not turn observed legacy bugs into requirements.

No automatic commits, pushes, PR creation or merges. Do not mutate mainline snapshots or execute remote Ascend tests automatically. Missing CANN/NPU, data or CI evidence must remain explicit gaps. Knowledge candidates stay pending until the changes are merged and the corresponding branch is synced.

If a run fails, inspect its task directory and existing workspace; do not silently reinitialize or discard user changes. Delivery artifacts include design, patch for tracked changes, untracked-file inventory, verification evidence and pending knowledge updates.
