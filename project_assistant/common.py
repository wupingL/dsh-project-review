from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def read_json(path, default=None):
    return json.loads(Path(path).read_text(encoding="utf-8-sig")) if Path(path).is_file() else default


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".write-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def run(args, cwd=None, timeout=300, env=None):
    result = subprocess.run([str(a) for a in args], cwd=cwd, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            encoding="utf-8", errors="replace", timeout=timeout)
    if result.returncode:
        # Never echo arguments: network arguments may contain credentials.
        raise RuntimeError(f"{Path(str(args[0])).name} failed ({result.returncode}): {result.stderr[-2500:]}")
    return result.stdout


def canonical_repo(url):
    parsed = urlparse(url.rstrip("/"))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Repository URL must be HTTPS without embedded credentials")
    return (parsed.hostname.lower() + parsed.path.removesuffix(".git")).rstrip("/")


class Config:
    def __init__(self, path):
        self.path = Path(path).resolve()
        self.value = read_json(self.path)
        if not self.value:
            raise ValueError("Project config is missing")
        self.repo_id = canonical_repo(self.value["repo_url"])
        self.key = digest(self.repo_id)[:20]
        curated = self.value.get("curated_knowledge")
        self.curated = read_json(self.path.parent / curated, {}) if curated else {}
        self.policy = digest({k: v for k, v in self.value.items()
                              if k not in {"local_repo", "state_dir", "poll_seconds", "model_timeout",
                                           "model_backend"}})
        self.policy = digest([self.policy, self.curated])
        backend = self.value.get("model_backend")
        if isinstance(backend, dict):
            # Semantic identity only. Timeouts, retries and credential locations
            # must not invalidate knowledge; provider/model/protocol/parameters must.
            profiles = backend.get("task_profiles") if isinstance(
                backend.get("task_profiles"), dict) else {}
            identity = {
                "provider": backend.get("provider"),
                "endpoint_id": backend.get("endpoint_id"),
                "base_url": backend.get("base_url"),
                "model": backend.get("model"),
                "protocol": backend.get("protocol"),
                "task_profiles": profiles,
            }
            self.policy = digest([self.policy, identity])
        self.state = (self.path.parent / self.value.get("state_dir", "../data")).resolve()
        self.repo_state = self.state / "repositories" / self.key
        self.repo_state.mkdir(parents=True, exist_ok=True)

    def get(self, name, default=None):
        return self.value.get(name, default)

    def domains(self, path):
        import fnmatch
        return [name for name, domain in self.get("domains", {}).items()
                if any(("/" in p or "/" not in path or p == "**") and fnmatch.fnmatchcase(path, p)
                       for p in domain["patterns"])]
