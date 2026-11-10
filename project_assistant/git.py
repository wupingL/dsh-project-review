from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse
from .common import canonical_repo, run


class Git:
    def __init__(self, config):
        self.config = config
        self.path = config.repo_state / "mirror.git"
        self.filter_overrides = []
        try:
            keys = run(["git", "config", "--name-only", "--get-regexp", r"^filter\..*\.(smudge|process|required)$"]).splitlines()
        except RuntimeError:
            keys = []
        for key in keys:
            self.filter_overrides += ["-c", key + ("=false" if key.endswith(".required") else "=")]

    def command(self, *args, timeout=300):
        return run(["git", "-c", "core.quotepath=false", "-c", "core.longpaths=true", "-c", f"safe.directory={self.path.resolve().as_posix()}",
                    "-c", "core.hooksPath=" + str(self.config.repo_state / "no-hooks"), "-c", "core.fsmonitor=false",
                    "-c", "filter.lfs.smudge=", "-c", "filter.lfs.process=", "-c", "filter.lfs.required=false",
                    "-c", f"safe.directory={Path(self.config.get('local_repo', '.')).resolve().as_posix()}",
                    *self.filter_overrides, "--git-dir", self.path, *args], timeout=timeout)

    def initialize(self):
        if self.path.exists() and self.command("for-each-ref", "--format=%(refname)", "refs/remotes/origin"):
            return
        if not self.path.exists():
            templates = self.config.repo_state / "empty-templates"
            templates.mkdir(exist_ok=True)
            run(["git", "init", "--bare", "--template", templates, self.path])
            self.command("remote", "add", "origin", self.config.get("repo_url"))
        local = Path(self.config.get("local_repo", ""))
        if local.is_dir():
            remote = run(["git", "-c", f"safe.directory={local.resolve().as_posix()}", "-C", local, "remote", "get-url", "origin"]).strip()
            if canonical_repo(remote) != self.config.repo_id:
                raise ValueError("Local clone origin does not match configured repository")
            self.command("fetch", "--no-tags", str(local.resolve()),
                         "+refs/heads/*:refs/remotes/origin/*")

    def refresh(self):
        self.initialize()
        for branch in self.config.get("branches"):
            self.command("check-ref-format", "refs/heads/" + branch)
            self.command("fetch", "--no-tags", "origin",
                         f"+refs/heads/{branch}:refs/remotes/origin/{branch}")

    def fetch_branch(self, branch):
        """拉取任意分支到 refs/remotes/origin/<branch>（不改变已配置分支列表）。

        先取远端 origin；不可用（离线/私有地址仅在本地有 clone）时回退到配置的本地 clone。
        """
        self.initialize()
        self.command("check-ref-format", "refs/heads/" + branch)
        refspec = f"+refs/heads/{branch}:refs/remotes/origin/{branch}"
        try:
            self.command("fetch", "--no-tags", "origin", refspec)
        except RuntimeError:
            local = Path(self.config.get("local_repo", ""))
            if not local.is_dir():
                raise
            self.command("fetch", "--no-tags", str(local.resolve()), refspec)
        return self.resolve(branch)

    def resolve(self, ref):
        self.initialize()
        if ref.startswith("-"):
            raise ValueError("Invalid ref")
        configured = ref in self.config.get("branches")
        candidates = ["refs/remotes/origin/" + ref] if configured else []
        candidates.append(ref)
        candidates.append("refs/remotes/origin/" + ref)
        last = None
        for candidate in candidates:
            try:
                return self.command("rev-parse", "--verify", "--end-of-options",
                                    candidate + "^{commit}").strip()
            except RuntimeError as exc:
                last = exc
        raise last

    def fetch_head(self, url, sha, branch=None):
        """取得 PR head 提交。

        优先从**主仓库**取：GitCode/GitLab 的 PR 提交对象在目标仓库对象库里可达，
        `git fetch origin <sha>` 即可拿到，不需要读取（可能私有/已删除的）fork 仓库。
        依次尝试：本地已有 → 主仓库按 SHA → 主仓库按源分支 → fork 仓库按 SHA。
        """
        if not re.fullmatch(r"[0-9a-f]{40,64}", sha):
            raise ValueError("PR head must be a full commit SHA")
        expected_host = urlparse(self.config.get("repo_url")).hostname
        if url and url.startswith("git@" + expected_host + ":"):
            url = "https://" + expected_host + "/" + url.split(":", 1)[1]
        if url:
            canonical_repo(url)
            if urlparse(url).hostname != expected_host:
                raise ValueError("Fork host differs from configured Git host")
        try:
            return self.resolve(sha)
        except RuntimeError:
            pass
        attempts = []
        self.initialize()
        try:
            self.command("fetch", "--no-tags", "origin", sha)
            return self.resolve(sha)
        except RuntimeError as exc:
            attempts.append(f"origin/sha: {str(exc).strip().splitlines()[-1] if str(exc).strip() else 'failed'}")
        if branch:
            try:
                self.command("check-ref-format", "refs/heads/" + branch)
                self.command("fetch", "--no-tags", "origin",
                             f"+refs/heads/{branch}:refs/remotes/origin/{branch}")
                return self.resolve(sha)
            except RuntimeError as exc:
                attempts.append(f"origin/branch {branch}: {str(exc).strip().splitlines()[-1] if str(exc).strip() else 'failed'}")
        if url:
            try:
                self.command("fetch", "--no-tags", url, sha)
                return self.resolve(sha)
            except RuntimeError as exc:
                attempts.append(f"fork: {str(exc).strip().splitlines()[-1] if str(exc).strip() else 'failed'}")
        raise ValueError("无法获取 PR head 提交；已尝试 " + "；".join(attempts))

    def workspace(self, sha, name=None):
        sha = self.resolve(sha)
        # Short paths matter for generated Ascend operator filenames on Windows.
        path = self.config.state.parent / "worktrees" / self.config.key[:8] / (name or sha[:12])
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            self.command("worktree", "add", "--detach", path, sha)
        prefix = ["git", "-c", f"safe.directory={path.resolve().as_posix()}", "-c", "core.fsmonitor=false", "-C", path]
        actual = run([*prefix, "rev-parse", "HEAD"]).strip()
        if actual != sha:
            raise ValueError("Workspace is bound to another commit")
        if not name and run([*prefix, "status", "--porcelain"]):
            raise ValueError("Analysis workspace has local changes; refusing stale-source analysis")
        return path

    def files(self, sha):
        return [p for p in self.command("ls-tree", "-r", "--name-only", "-z", sha).split("\0") if p]

    def changed(self, base, head):
        return [p for p in self.command("diff", "--name-only", "--no-renames", "-z", base, head).split("\0") if p]

    def merge_base(self, base, head):
        return self.command("merge-base", base, head).strip()

    def text(self, sha, path, limit=24000):
        if path not in self.files(sha):
            return ""
        return self.command("show", f"{sha}:{path}")[:limit]
