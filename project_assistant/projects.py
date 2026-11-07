"""多项目管理与知识库构建入口。

职责：
- 维护 ``config/projects.json`` 项目注册表（RecSDK 作为预置项目，缺失时自动迁移）；
- 支持导入未加载的项目（HTTPS 仓库地址 + 可选本地 clone + 分支选择）；
- 探测仓库分支、查看远端与本地知识快照的差距；
- 触发知识库构建/同步（结构索引总是可用；语义同步需要可用的模型路由）。

约束：
- 只使用标准库；配置写入一律 ``atomic_json``；
- 不修改 ``project_assistant/inspect.py`` 的只读视图；
- 语义分析不可用时必须在启动前失败并给出原因，绝不悄悄降级成"已同步"。
"""

from __future__ import annotations

import re
import time
from pathlib import Path

from .backends import backend_checks
from .common import ROOT, Config, atomic_json, canonical_repo, digest, now, read_json, run

CONFIG_DIR = ROOT / "config"
REGISTRY_PATH = CONFIG_DIR / "projects.json"
DEFAULT_STATE_DIR = "../data"
SEMANTIC_CHECKS = ("model_provider", "model_protocol", "model_endpoint", "model_name", "model_credential")


# --------------------------------------------------------------------------- registry


def _slug(name):
    value = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return (value or "project")[:40]


def load_registry():
    """读取项目注册表；缺失时用现有 RecSDK 配置自动迁移。"""
    registry = read_json(REGISTRY_PATH)
    if isinstance(registry, dict) and isinstance(registry.get("projects"), list):
        registry.setdefault("version", 1)
        return registry
    projects = []
    default_id = None
    default_config = CONFIG_DIR / "recsdk.json"
    if default_config.is_file():
        value = read_json(default_config, {}) or {}
        entry_id = "recsdk"
        projects.append({"id": entry_id,
                         "name": value.get("name") or "RecSDK_for_lingqu",
                         "config": "recsdk.json"})
        default_id = entry_id
    registry = {"version": 1, "default": default_id, "projects": projects}
    save_registry(registry)
    return registry


def save_registry(registry):
    atomic_json(REGISTRY_PATH, registry)
    return registry


def _entries(registry=None):
    return list((registry or load_registry()).get("projects") or [])


def find_project(project_id):
    """按 id 找项目条目；找不到返回 None。"""
    for entry in _entries():
        if entry.get("id") == project_id:
            return entry
    return None


def config_path_of(entry):
    return CONFIG_DIR / str(entry.get("config"))


def load_project_config(project_id):
    entry = find_project(project_id)
    if entry is None:
        raise ValueError(f"未加载的项目：{project_id}")
    path = config_path_of(entry)
    if not path.is_file():
        raise ValueError(f"项目配置文件缺失：{path.name}")
    return entry, Config(path)


def default_project_id():
    registry = load_registry()
    candidate = registry.get("default")
    if candidate and find_project(candidate):
        return candidate
    entries = _entries(registry)
    return entries[0]["id"] if entries else None


def resolve_config(config_path=None, project_id=None):
    """CLI 入口：--project 优先，其次 --config。返回 (config, project_entry|None)。"""
    if project_id:
        entry, config = load_project_config(project_id)
        return config, entry
    return Config(config_path), None


# --------------------------------------------------------------------------- projection


def _repo_state_of(config):
    return config.state / "repositories" / config.key


def _snapshot_summary(config, snapshot_id):
    if not snapshot_id:
        return None
    manifest = read_json(_repo_state_of(config) / "snapshots" / snapshot_id / "manifest.json")
    if not isinstance(manifest, dict):
        return {"snapshot_id": snapshot_id, "commit": None, "created_at": None,
                "mode": None, "refreshed_domains": [], "status": "missing-manifest", "stats": {}}
    stats = manifest.get("stats") if isinstance(manifest.get("stats"), dict) else {}
    return {"snapshot_id": snapshot_id,
            "commit": manifest.get("commit"),
            "created_at": manifest.get("created_at"),
            "mode": manifest.get("mode"),
            "refreshed_domains": manifest.get("refreshed_domains") or [],
            "status": manifest.get("status"),
            "analyzer": manifest.get("analyzer"),
            "stats": {key: stats.get(key) for key in ("files", "nodes", "edges", "domains") if key in stats}}


def _pointers(config):
    return read_json(_repo_state_of(config) / "refs.json", {}) or {}


def project_view(entry):
    """项目列表项：配置、状态目录、分支、各分支快照指针。"""
    path = config_path_of(entry)
    try:
        config = Config(path)
    except Exception as exc:  # noqa: BLE001 - 单个坏配置不应拖垮整个列表
        return {"id": entry.get("id"), "name": entry.get("name"), "repo_url": None,
                "config_path": str(path), "state_dir": None, "repo_state": None,
                "branches": [], "has_mirror": False, "snapshots": {},
                "error": str(exc) or exc.__class__.__name__}
    pointers = _pointers(config)
    repo_state = _repo_state_of(config)
    snapshots = {}
    for ref in list(config.get("branches") or []) + [r for r in pointers if r not in (config.get("branches") or [])]:
        pointer = pointers.get(ref) if isinstance(pointers.get(ref), dict) else {}
        snapshots[ref] = {
            "semantic": _snapshot_summary(config, pointer.get("semantic")),
            "structural": _snapshot_summary(config, pointer.get("structural")),
        }
    return {"id": entry.get("id"),
            "name": entry.get("name") or config.get("name") or entry.get("id"),
            "repo_url": config.get("repo_url"),
            "config_path": str(path),
            "state_dir": str(config.state),
            "repo_state": str(repo_state),
            "branches": list(config.get("branches") or []),
            "has_mirror": (repo_state / "mirror.git").is_dir(),
            "snapshots": snapshots}


def list_projects():
    registry = load_registry()
    return {"generated_at": now(),
            "default_project": registry.get("default"),
            "projects": [project_view(entry) for entry in _entries(registry)]}


# --------------------------------------------------------------------------- git probing


def _git(args, timeout=120):
    return run(["git", *args], timeout=timeout).strip()


def _local_branches(local_path):
    output = _git(["-C", str(local_path), "for-each-ref", "--format=%(refname:short)", "refs/heads"])
    return [line for line in output.splitlines() if line]


def _local_default_branch(local_path):
    try:
        head = _git(["-C", str(local_path), "symbolic-ref", "--short", "HEAD"])
        if head:
            return head
    except RuntimeError:
        pass
    branches = _local_branches(local_path)
    return branches[0] if branches else None


def _remote_head(url):
    output = _git(["ls-remote", "--symref", url, "HEAD"], timeout=90)
    default = None
    tip = None
    for line in output.splitlines():
        if line.startswith("ref:"):
            parts = line.split()
            if len(parts) >= 2 and parts[1].startswith("refs/heads/"):
                default = parts[1][len("refs/heads/"):]
        elif line.endswith("\tHEAD") or line.endswith(" HEAD"):
            tip = line.split()[0]
    return default, tip


def _remote_heads(url):
    output = _git(["ls-remote", "--heads", url], timeout=90)
    heads = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) != 2 or not parts[1].startswith("refs/heads/"):
            continue
        heads[parts[1][len("refs/heads/"):]] = parts[0]
    return heads


def _validate_repo_url(url):
    canonical = canonical_repo(url)  # 拒绝非 HTTPS、内嵌凭据
    if not canonical:
        raise ValueError("仓库地址无效")
    return canonical


def _name_suggestion(url):
    return canonical_repo(url).rstrip("/").split("/")[-1]


def probe(url, local=None):
    """读取远端（或本地 clone）的分支列表与默认分支。"""
    canonical = _validate_repo_url(url)
    suggestion = _name_suggestion(url)
    if local:
        local_path = Path(local).resolve()
        if not local_path.is_dir():
            raise ValueError(f"本地路径不存在：{local_path}")
        try:
            origin = _git(["-C", str(local_path), "remote", "get-url", "origin"])
        except RuntimeError:
            raise ValueError("本地目录不是带有 origin 的 Git 仓库") from None
        if canonical_repo(origin) != canonical:
            raise ValueError("本地 clone 的 origin 与填写地址不一致")
        branches = _local_branches(local_path)
        default = _local_default_branch(local_path)
        source = "local"
    else:
        default, _tip = _remote_head(canonical_url(url))
        heads = _remote_heads(canonical_url(url))
        branches = sorted(heads)
        source = "remote"
        if default is None and branches:
            for candidate in ("main", "master", "develop"):
                if candidate in branches:
                    default = candidate
                    break
            default = default or branches[0]
    if not branches:
        raise ValueError("未读取到任何分支，请检查仓库地址或本地路径")
    if default not in branches:
        default = branches[0]
    return {"ok": True,
            "repo_url": url,
            "canonical": canonical,
            "name_suggestion": suggestion,
            "default_branch": default,
            "branches": [{"name": name, "default": name == default} for name in branches],
            "source": source}


def canonical_url(url):
    """统一成 https://host/path(.git) 形式供 git 命令使用。"""
    canonical = canonical_repo(url)
    return "https://" + canonical


def _check_branch(name):
    if not isinstance(name, str) or not name.strip() or name.startswith("-"):
        raise ValueError(f"非法分支名：{name!r}")
    run(["git", "check-ref-format", "--branch", name])
    return name.strip()


def import_project(name, url, local=None, branches=None):
    """导入项目：注册配置 + 写入注册表；按 canonical 仓库地址幂等。"""
    canonical = _validate_repo_url(url)
    for entry in _entries():
        try:
            existing = Config(config_path_of(entry))
        except Exception:  # noqa: BLE001
            continue
        if existing.repo_id == canonical:
            return {"ok": True, "created": False, "project": project_view(entry)}
    template_path = CONFIG_DIR / "recsdk.json"
    template = read_json(template_path, {}) or {}
    selected = [_check_branch(branch) for branch in (branches or [])]
    if not selected:
        probed = probe(url, local)
        selected = [probed["default_branch"]]
    project_name = (name or "").strip() or _name_suggestion(url)
    base_id = _slug(project_name) + "-" + digest(canonical)[:8]
    taken = {entry.get("id") for entry in _entries()}
    project_id = base_id
    suffix = 2
    while project_id in taken:
        project_id = base_id + "-" + str(suffix)
        suffix += 1
    value = {
        "name": project_name,
        "repo_url": canonical_url(url),
        "api_url": template.get("api_url", "https://api.gitcode.com/api/v5"),
        "branches": selected,
        "state_dir": DEFAULT_STATE_DIR,
        "max_file_bytes": template.get("max_file_bytes", 2000000),
        "max_diff_chars": template.get("max_diff_chars", 160000),
        "exclude": template.get("exclude", []),
        "domains": {},
        "review_rules": [],
    }
    if local:
        value["local_repo"] = Path(local).resolve().as_posix()
    if isinstance(template.get("model_backend"), dict):
        value["model_backend"] = template["model_backend"]
    config_path = CONFIG_DIR / (project_id + ".json")
    atomic_json(config_path, value)
    registry = load_registry()
    registry.setdefault("projects", []).append(
        {"id": project_id, "name": project_name, "config": config_path.name})
    registry.setdefault("default", registry.get("default") or project_id)
    save_registry(registry)
    entry = find_project(project_id)
    return {"ok": True, "created": True, "project": project_view(entry)}


# --------------------------------------------------------------------------- branches


def project_branches(project_id, refresh=False):
    entry, config = load_project_config(project_id)
    repo_state = _repo_state_of(config)
    mirror = repo_state / "mirror.git"
    configured = list(config.get("branches") or [])
    default_branch = None
    source = "local"
    error = None
    heads = {}
    if refresh or not mirror.is_dir():
        try:
            default_branch, _tip = _remote_head(config.get("repo_url"))
            heads = _remote_heads(config.get("repo_url"))
            source = "remote"
        except Exception as exc:  # noqa: BLE001 - 网络/代理失败回落本地镜像
            error = str(exc) or exc.__class__.__name__
    if not heads and mirror.is_dir():
        try:
            from .git import Git
            git = Git(config)
            output = git.command("for-each-ref", "--format=%(refname:short) %(objectname)",
                                 "refs/remotes/origin")
            for line in output.splitlines():
                parts = line.split()
                if len(parts) == 2:
                    heads[parts[0].replace("origin/", "", 1)] = parts[1]
            source = "local"
        except Exception as exc:  # noqa: BLE001
            error = error or str(exc) or exc.__class__.__name__
    if not heads:
        # 还没建镜像时，本地 clone 是唯一可靠的分支来源。
        local = Path(config.get("local_repo", "") or "")
        if local.is_dir():
            try:
                output = _git(["-C", str(local), "for-each-ref", "--format=%(refname:short) %(objectname)",
                               "refs/heads"])
                for line in output.splitlines():
                    parts = line.split()
                    if len(parts) == 2:
                        heads.setdefault(parts[0], parts[1])
                default_branch = default_branch or _local_default_branch(local)
                source = "local"
            except Exception as exc:  # noqa: BLE001
                error = error or str(exc) or exc.__class__.__name__
    branches = [{"name": name, "tip": tip,
                 "configured": name in configured,
                 "default": name == default_branch}
                for name, tip in heads.items()]
    branches.sort(key=lambda item: (not item["default"], not item["configured"], item["name"]))
    return {"project_id": project_id,
            "generated_at": now(),
            "source": source,
            "default_branch": default_branch,
            "branches": branches,
            "error": error}


# --------------------------------------------------------------------------- knowledge


def _commit_distance(git, left, right):
    """left 落后 right 的提交数；对象缺失时返回 None。"""
    try:
        return int(git.command("rev-list", "--count", f"{left}..{right}").strip())
    except Exception:  # noqa: BLE001
        return None


def _ahead_distance(git, left, right):
    try:
        return int(git.command("rev-list", "--count", f"{right}..{left}").strip())
    except Exception:  # noqa: BLE001
        return None


def knowledge_status(project_id, ref, refresh=False):
    """比较远端 tip 与已发布知识快照：missing / stale / current。"""
    entry, config = load_project_config(project_id)
    checks = backend_checks(config, network=False)
    ready = all(checks["checks"].get(name) is True for name in SEMANTIC_CHECKS)
    reason = next(iter(checks["errors"].values()), None) if not ready else None
    pointers = _pointers(config)
    pointer = pointers.get(ref) if isinstance(pointers.get(ref), dict) else {}
    snapshots = {"semantic": _snapshot_summary(config, pointer.get("semantic")),
                 "structural": _snapshot_summary(config, pointer.get("structural"))}
    from .git import Git
    git = Git(config)
    tip = None
    source = "local"
    mirror_error = None
    if refresh:
        try:
            heads = _remote_heads(config.get("repo_url"))
            tip = heads.get(ref)
            source = "remote"
        except Exception as exc:  # noqa: BLE001
            mirror_error = str(exc) or exc.__class__.__name__
    if tip is None and (config.repo_state / "mirror.git").is_dir():
        try:
            tip = git.resolve(ref)
            source = "local"
        except Exception as exc:  # noqa: BLE001
            mirror_error = mirror_error or (str(exc) or exc.__class__.__name__)
    best = snapshots.get("semantic") or snapshots.get("structural")
    freshness = "missing" if not best else ("current" if best.get("commit") and best.get("commit") == tip else "stale")
    behind = ahead = None
    if best and best.get("commit") and tip:
        behind = _commit_distance(git, best["commit"], tip)
        ahead = _ahead_distance(git, best["commit"], tip)
    return {"project_id": project_id,
            "ref": ref,
            "checked_at": now(),
            "config": {"config_path": str(config.path),
                       "branches": list(config.get("branches") or []),
                       "domains": list(config.get("domains") or {})},
            "remote": {"tip": tip, "source": source, "error": mirror_error},
            "snapshot": snapshots,
            "freshness": freshness,
            "behind": behind,
            "ahead": ahead,
            "semantic_ready": ready,
            "semantic_reason": reason}


# --------------------------------------------------------------------------- 模型配置


def model_show(project_id):
    """读取项目当前的模型路由配置与就绪状态（不返回任何凭据值）。"""
    _entry, config = load_project_config(project_id)
    from .backends import backend_checks, model_destination
    checks = backend_checks(config, network=False)
    destination = model_destination(config)
    return {"project_id": project_id,
            "config_path": str(config.path),
            "model_backend": config.get("model_backend") or {},
            "destination": destination,
            "ready": all(checks["checks"].get(name) is True for name in SEMANTIC_CHECKS),
            "checks": checks["checks"],
            "errors": checks["errors"],
            "secrets_policy": "凭据只从进程/用户环境变量或凭证文件读取；本接口不写入也不返回凭据值。"}


def model_set(project_id, *, provider, model, base_url=None, endpoint_id=None,
              protocol=None, credential_env=None, credential_file=None):
    """写入项目的模型路由配置；只保存路由与非敏感参数，绝不保存凭据。"""
    _entry, config = load_project_config(project_id)
    provider = (provider or "").strip().lower()
    if provider not in {"deepseek", "codex"}:
        raise ValueError("provider 只能是 deepseek 或 codex")
    model = (model or "").strip()
    if not model:
        raise ValueError("model 不能为空")
    base_url = (base_url or "").strip()
    if provider == "deepseek":
        if not base_url:
            raise ValueError("deepseek 路由需要 base_url")
        if not base_url.lower().startswith("https://"):
            raise ValueError("base_url 必须是 https 地址")
    value = read_json(config.path, {}) or {}
    previous = value.get("model_backend") if isinstance(value.get("model_backend"), dict) else {}
    backend = dict(previous)
    backend.update(provider=provider, model=model)
    if base_url:
        backend["base_url"] = base_url
    elif provider == "deepseek":
        backend.setdefault("base_url", "")
    backend["protocol"] = (protocol or backend.get("protocol") or "chat_completions").strip()
    if endpoint_id:
        backend["endpoint_id"] = endpoint_id.strip()
    elif not backend.get("endpoint_id") or backend.get("endpoint_id") == "pending-deployment":
        from urllib.parse import urlsplit
        backend["endpoint_id"] = urlsplit(base_url).hostname or ""
    if credential_env:
        backend["credential_env"] = credential_env.strip()
    if credential_file:
        backend["credential_file"] = credential_file.strip()
    backend.setdefault("max_retries", 2)
    backend.setdefault("timeout", 1800)
    backend.setdefault("max_schema_repairs", 1)
    if not isinstance(backend.get("task_profiles"), dict):
        backend["task_profiles"] = {
            "knowledge": {"reasoning_effort": "medium", "max_tokens": 8192},
            "review": {"reasoning_effort": "xhigh", "max_tokens": 16384},
            "feature_design": {"reasoning_effort": "high", "max_tokens": 12288},
            "feature_delivery": {"reasoning_effort": "high", "max_tokens": 12288},
            "generic": {"reasoning_effort": "medium", "max_tokens": 8192},
        }
    value["model_backend"] = backend
    atomic_json(config.path, value)
    return model_show(project_id)


def derive_domains(config, ref):
    """首次构建知识库时按顶层目录派生出领域配置并写回项目配置。"""
    from .git import Git
    git = Git(config)
    git.initialize()
    try:
        sha = git.resolve(ref)
    except RuntimeError:
        git.fetch_branch(ref)
        sha = git.resolve(ref)
    files = [path for path in git.files(sha) if path]
    groups = {}
    root_files = []
    for path in files:
        parts = path.split("/")
        if len(parts) == 1:
            root_files.append(path)
        else:
            groups.setdefault(parts[0], []).append(path)
    selected = sorted(((name, paths) for name, paths in groups.items() if len(paths) >= 3),
                      key=lambda item: (-len(item[1]), item[0]))[:8]
    domains = {}
    for name, paths in selected:
        entrypoints = []
        for candidate in (f"{name}/README.md", f"{name}/readme.md", f"{name}/README.MD"):
            if candidate in set(paths):
                entrypoints.append(candidate)
                break
        domains[name] = {"description": f"自动生成的领域：{name}（可在项目配置中细化）",
                         "patterns": [f"{name}/**"],
                         "entrypoints": entrypoints,
                         "depends_on": [],
                         "tests": []}
    if root_files or not domains:
        domains["root"] = {"description": "仓库根目录与跨目录文件（自动生成）",
                           "patterns": ["*"],
                           "entrypoints": ["README.md"] if "README.md" in root_files else [],
                           "depends_on": [],
                           "tests": []}
    value = read_json(config.path, {}) or {}
    value["domains"] = domains
    atomic_json(config.path, value)
    return Config(config.path), sorted(domains)


def sync_knowledge(project_id, ref, mode="structural", fetch=False, progress=None):
    """构建/更新知识库；返回快照信息。

    progress(kind, message) 可选，用于向前端流式输出进度。
    """
    say = progress or (lambda kind, message: None)
    _entry, config = load_project_config(project_id)
    semantic = mode != "structural"
    checks = backend_checks(config, network=False)
    if semantic and not all(checks["checks"].get(name) is True for name in SEMANTIC_CHECKS):
        reason = next(iter(checks["errors"].values()), None) or "模型路由未配置"
        raise ValueError(f"语义知识库需要可用的模型路由：{reason}")
    started = time.monotonic()
    say("start", f"开始{'语义' if semantic else '结构'}知识构建：{ref}")
    if not config.get("domains"):
        say("domains", "首次构建：正在根据仓库目录结构派生领域配置")
        config, domains = derive_domains(config, ref)
        say("domains", f"已派生 {len(domains)} 个领域：{', '.join(domains)}")
    _entry, config = load_project_config(project_id)  # 重新加载，确保 policy 与派生配置一致
    from .context import Context
    context = Context(config)
    if fetch:
        say("fetch", f"拉取分支最新提交：{ref}")
        if ref in (config.get("branches") or []):
            try:
                context.git.refresh()
            except RuntimeError:
                context.git.fetch_branch(ref)
        else:
            context.git.fetch_branch(ref)
    else:
        context.git.initialize()
    say("snapshot", "扫描文件并构建快照（结构索引）")
    snapshot_id = context.sync(ref, fetch=False, semantic=semantic, publish=False)
    pointers = _pointers(config)
    flavor = "semantic" if semantic else "structural"
    pointers.setdefault(ref, {})[flavor] = snapshot_id
    atomic_json(_repo_state_of(config) / "refs.json", pointers)
    say("publish", f"发布快照指针：{ref} → {snapshot_id[:12]}")
    manifest = read_json(_repo_state_of(config) / "snapshots" / snapshot_id / "manifest.json", {}) or {}
    duration = round(time.monotonic() - started, 2)
    say("done", f"完成，用时 {duration} 秒")
    stats = manifest.get("stats") if isinstance(manifest.get("stats"), dict) else {}
    return {"project_id": project_id,
            "ref": ref,
            "mode": flavor,
            "snapshot_id": snapshot_id,
            "commit": manifest.get("commit"),
            "status": manifest.get("status", "complete"),
            "stats": stats,
            "refreshed_domains": manifest.get("refreshed_domains") or [],
            "manifest_path": str(_repo_state_of(config) / "snapshots" / snapshot_id / "manifest.json"),
            "duration_seconds": duration,
            "published": True}
