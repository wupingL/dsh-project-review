# Project Assistant

Three reusable project workflow skills share one Python controller and the pinned MIT Understand core. The controller owns isolated Git workspaces, immutable snapshots, a SQLite PR queue and local Chinese reports. It never changes the supplied working clone.

For the next phase, start with [DeepSeek Harness plugin handoff](DEEPSEEK_HANDOFF.md). It records what is implemented and how to build an installable DSH bundle that uses the host's DeepSeek model route. That plugin is pending; this README describes the existing standalone CLI, including its separate direct HTTP adapter. The first Codex/OpenAI run remains documented in [SESSION_HANDOFF.md](SESSION_HANDOFF.md).

Model routing is explicit. `model_backend.provider` must be `codex` or `deepseek`; an absent or unknown provider is a configuration error and never silently falls back to OpenAI. Provider, endpoint identity, model and task parameters are stored in project configuration; credentials are read only from the process/user environment or a configured credential file and are never written into snapshots, reports or logs.

## Setup on Windows

```powershell
.\scripts\setup.ps1 -InstallSkills
.\scripts\pa.ps1 doctor --network
```

Python 3.11+, Node 22+, pnpm and Git are required. An authenticated Codex CLI is required only when `model_backend.provider` is `codex`. The DeepSeek adapter uses an HTTPS OpenAI-compatible chat-completions endpoint and a JSON-mode response. Setup installs dependencies only from the pinned, trusted tool checkout. The Python controller uses the standard library. It runs from its project directory, so no global Python package installation is required.

Configuration: `config/recsdk.json`. For another repository copy the JSON and set the URL, local clone, branch names, state directory, domain rules and test/evidence entrypoints. Pass `--config <file>` before a command. The external state directory must be retained to reuse knowledge after recloning. Source clones can be moved by changing `local_repo`; repository identity is derived from the HTTPS origin, not the directory name.

The `model_backend` block currently selects the DeepSeek provider and deliberately leaves `endpoint_id`, `base_url`, `model` and credentials pending deployment confirmation. In this state `doctor` is not ready and live knowledge/review calls stop before sending source. `max_retries` and `timeout` control transport retries; `task_profiles` separate low-cost knowledge generation from higher-investment review/design. These parameters are recorded as the semantic identity of a snapshot, while credential locations and retry settings are not.

Set `GITCODE_TOKEN` through a process environment or credential launcher if anonymous API access is unavailable. Never put tokens into config, URLs or source. Codex uses the user's existing model settings/authentication. A failed auth/home-directory diagnostic stops automated review; starting it from the normal user shell may be required in restricted nested environments.

On Windows, the client also reads the persistent user `GITCODE_TOKEN` environment value when it is absent from the current process. This supports a token configured after Codex was started without logging its value. The RecSDK profile retains the legacy `knowledge_reasoning_effort=medium` and `review_reasoning_effort=xhigh` values for the Codex backend; DeepSeek uses the corresponding `task_profiles` entries. A Codex backend still uses an OpenAI HTTPS alias with the same saved OpenAI authentication and default endpoint selection; this avoids repeated WebSocket timeout fallback and does not change the model or send data to a third-party provider.

## Knowledge

```powershell
.\scripts\pa.ps1 context sync --ref develop --fetch
.\scripts\pa.ps1 context sync --ref refactor/develop --fetch
.\scripts\pa.ps1 context query --ref develop --query '动态embedding checkpoint'
```

`--structural-only` provides an explicitly marked index without LLM calls; it is useful for smoke testing, not a substitute for semantic knowledge. The Understand core deterministically extracts structure, and the selected model backend applies the pinned spec-miner/architecture-designer references to sampled and targeted source. This adapter does not invoke upstream's multi-agent pipeline or its interactive confirmations. Semantic coverage is targeted, not a claim of per-line full verification. Graphs retain the Understand viewer schema and are stored in each snapshot's `.ua/` directory. Each semantic snapshot records the backend identity and each generated domain keeps its provenance.

File parsing is reused by raw SHA-256, so changes inside function bodies, scripts, patches or config are never ignored as cosmetic. Current inventory removes deleted/renamed paths and rebuilds graph relationships. Domain dependencies invalidate associated summaries; unsupported parsers and ambiguous cross-language relationships are explicit gaps. A successful staged snapshot is atomically published; failure leaves the previous pointer intact.

Stakeholder-approved requirements, accepted ADRs and workload-specific performance baselines belong in the project's `curated_knowledge` JSON. Each entry should contain `id`, `statement`, `domains`, `sources` and approval provenance. The shipped RecSDK file starts empty: code behavior and historical tuning examples have not been silently declared approved requirements. Changes to curated knowledge invalidate the policy fingerprint. Model-generated `confirmed` claims are downgraded to inferred.

## PR review

```powershell
.\scripts\pa.ps1 review run --pr 425
.\scripts\pa.ps1 review watch
.\scripts\pa.ps1 review status
.\scripts\pa.ps1 review replay --branch develop --commit 4bb64b0 --structural-only
```

The first complete poll seeds existing PR versions without bulk-reviewing the backlog. New PRs, draft→ready, source/target/intent/CI changes enqueue work thereafter. Use `review run` for an existing PR. The default interval is 300 seconds; the foreground process must remain running. Stop with Ctrl+C. A crash releases the OS lock; restart recovers running jobs and preserves deduplication. GitCode queries are read-only and fully paginated. There is no remote comment/approval/merge API implementation.

Automated review/knowledge generation never receives an unrestricted shell. The Codex backend runs in its read-only sandbox with shell, unified execution and app tools disabled; the DeepSeek backend has no tools at all and receives only the controller's bounded file excerpts. Source reads from fixed base/head/merge-base workspaces use the same controller protocol (up to four model rounds, 16 ranges per round and 300 lines per range). Candidate tests/build/install commands cannot be invoked through shell tools. Structured results are validated against the full local JSON Schema subset, with at most one bounded repair attempt; truncated or invalid output fails without publishing a partial snapshot or report. Checkout hooks, filesystem monitoring and configured smudge/process filters are disabled in the controller's Git operations. The runner reads the GitCode aggregate pipeline status; inaccessible or uncollected detailed CI/NPU logs remain gaps. It never equates a pipeline status with a particular benchmark passing. Report validity is separate from findings: read `status.json` next to `review.md`; obsolete reports remain as history.

`review replay` accepts a historical commit or merge reachable from the selected branch. With `--structural-only` it produces deterministic impact inputs and an `impact.md`, explicitly **without** model review; omit that flag for model-assisted review when source transmission is authorized. Historical replays are never marked current live-PR reports.

## Feature delivery

```powershell
.\scripts\pa.ps1 feature design --branch develop --request 'Describe the change and acceptance conditions' --fetch
.\scripts\pa.ps1 feature implement --task <returned-id>
.\scripts\pa.ps1 feature verify --task <returned-id>
```

Each feature has an independent worktree. Resolve design questions before implementation. Explicit feature implementation/verification requires a backend with a controlled writable executor; the Codex backend provides that workspace-write path and can run local checks, while the DeepSeek API backend explicitly refuses `feature implement` and `feature verify` before touching the workspace or task phase. It is never triggered by PR polling. Tracked changes are exported to `changes.patch`; new files remain in the worktree and are listed in `untracked.json`. There is no automatic commit, push or mainline promotion. Pending knowledge is incorporated by mainline sync after merge.

Feature knowledge is adopted only when every recorded changed-file content hash (including deletions) is present in the chosen mainline commit. It remains an inferred candidate needing confirmation, never an automatic approval of a business rule. Curated requirements remain independently controlled.

## Validation

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Tests use real temporary Git repositories plus deterministic model/API test doubles, including a local fake DeepSeek HTTP server for JSON mode, source-request rounds, schema repair, truncation, rate limits, unreachable endpoints and provider-aware doctor behavior. Live replay artifacts and limitations, when available, are under `data/validation/`; model-assisted reports are not evidence of executed NPU tests. The selected project needs Linux/CANN/NPU for hardware verification.

## License and upstream versions

The implementation is MIT. See LICENSE, THIRD_PARTY_NOTICES.md and dependencies.lock.json. Understand and Jeffallan's skill repository are pinned to full commits; pnpm uses the upstream lockfile. Model-service terms and transitive dependency licenses remain their own. No upstream auto-update hook is installed; the controller explicitly syncs the required version before consumer workflows.
