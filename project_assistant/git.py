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
        """拉取已配置分支。

        配置里可能残留远端已删除的分支（仓库演进后很常见）：单个分支缺失不应让
        其他分支的审查/同步整体失败，返回缺失分支列表由调用方决定如何提示。
        """
        self.initialize()
        missing = []
        for branch in self.config.get("branches"):
            self.command("check-ref-format", "refs/heads/" + branch)
            try:
                self.command("fetch", "--no-tags", "origin",
                             f"+refs/heads/{branch}:refs/remotes/origin/{branch}")
            except RuntimeError:
                missing.append(branch)
        return missing

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

    @staticmethod
    def parse_added_lines(patch):
        """从 unified diff 文本解析 {path: {新文件侧新增/修改行号}}（一次解析整份 diff）。"""
        added = {}
        current = None
        new_line = 0
        for line in patch.splitlines():
            if line.startswith("+++ "):
                target = line[4:].strip()
                if target == "/dev/null":
                    current = None
                    continue
                if target.startswith("b/"):
                    target = target[2:]
                current = target
                added.setdefault(current, set())
                continue
            if line.startswith("@@"):
                match = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", line)
                if match:
                    new_line = int(match.group(1))
                continue
            if current is None:
                continue
            if line.startswith("+") and not line.startswith("+++"):
                added[current].add(new_line)
                new_line += 1
            elif line.startswith(" "):
                new_line += 1
        return added

    @staticmethod
    def line_ranges(lines):
        """把行号集合压缩成 [start, end] 区间列表。"""
        ranges = []
        for line in sorted(set(lines)):
            if ranges and line == ranges[-1][1] + 1:
                ranges[-1][1] = line
            else:
                ranges.append([line, line])
        return ranges

    def line_map(self, old, new, path):
        """把 old 提交里的行号映射到 new 提交（同一路径）。

        返回 ``map_line(line) -> (new_line, status)``，status 取 same/changed/deleted。
        上一轮审查意见在代码演进后行号会漂移，用它把证据行同步到当前 head。
        """
        output = self.command("diff", "--unified=0", "--no-color", "--no-ext-diff", old, new, "--", path)
        hunks = []
        for line in output.splitlines():
            if not line.startswith("@@"):
                continue
            match = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            if match:
                hunks.append((int(match.group(1)), int(match.group(2) or 1),
                              int(match.group(3)), int(match.group(4) or 1)))

        def map_line(line):
            if not hunks:
                return line, "same"
            delta = 0
            for old_start, old_count, new_start, new_count in hunks:
                if old_count == 0:
                    # 纯新增：插入点之后的旧行整体后移。
                    if line > old_start:
                        delta += new_count
                        continue
                    return line + delta, "same"
                end = old_start + old_count - 1
                if line < old_start:
                    return line + delta, "same"
                if line <= end:
                    if new_count == 0:
                        # 该段代码被删除，没有对应新行。
                        return new_start, "deleted"
                    offset = min(line - old_start, new_count - 1)
                    return new_start + offset, "changed"
                delta += new_count - old_count
            return line + delta, "same"

        return map_line

    def added_lines(self, base, head, path):
        """新文件侧「新增/修改」行号集合（行内评论只能落在这些行上）。"""
        output = self.command("diff", "--unified=0", "--no-color", "--no-ext-diff", base, head, "--", path)
        lines = set()
        new_line = 0
        for line in output.splitlines():
            if line.startswith("@@"):
                match = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
                if match:
                    new_line = int(match.group(1))
            elif line.startswith("+") and not line.startswith("+++"):
                lines.add(new_line)
                new_line += 1
            elif line.startswith(" "):
                new_line += 1
        return lines

    def merge_base(self, base, head):
        return self.command("merge-base", base, head).strip()

    def text(self, sha, path, limit=24000):
        if path not in self.files(sha):
            return ""
        return self.command("show", f"{sha}:{path}")[:limit]
