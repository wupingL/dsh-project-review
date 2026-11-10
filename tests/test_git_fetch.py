from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from project_assistant.common import Config, run
from project_assistant.git import Git


def git(root, *args):
    return run(["git", "-C", str(root), *args]).strip()


class FetchHeadFallbackTests(unittest.TestCase):
    """PR head 提交应优先从主仓库获取，而不是依赖 PR 的 fork 仓库。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        # 主仓库（模拟目标仓库）：包含 base 与 PR head 两个提交
        self.main = self.root / "main"
        self.main.mkdir()
        run(["git", "init", "-b", "develop", str(self.main)])
        git(self.main, "config", "user.email", "t@local")
        git(self.main, "config", "user.name", "t")
        (self.main / "a.txt").write_text("base\n", encoding="utf-8")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-m", "base")
        self.base = git(self.main, "rev-parse", "HEAD")
        (self.main / "b.txt").write_text("pr change\n", encoding="utf-8")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-m", "pr head")
        self.head = git(self.main, "rev-parse", "HEAD")
        git(self.main, "remote", "add", "origin", "https://gitcode.com/demo/main.git")

        # 控制器状态：只有主仓库的镜像（没有任何对象）
        self.config_dir = self.root / "config"
        self.config_dir.mkdir()
        self.config_file = self.config_dir / "demo.json"
        self.config_file.write_text(
            '{"name": "demo", "repo_url": "https://gitcode.com/demo/main",'
            ' "branches": ["develop"], "state_dir": "../state"}',
            encoding="utf-8",
        )
        self.state = self.root / "state"
        self.state.mkdir()

    def _git(self):
        config = Config(self.config_file)
        # 镜像缺失时 initialize() 会从配置的 local_repo 拉取；这里直接指定本地主仓库。
        config.value["local_repo"] = str(self.main)
        instance = Git(config)
        instance.initialize()
        # 让镜像的 origin 指向这个本地主仓库，测试不触网。
        instance.command("remote", "set-url", "origin", str(self.main))
        return instance

    def test_head_fetched_from_main_repo_before_fork(self):
        instance = self._git()
        resolved = instance.fetch_head("git@gitcode.com:nobody/private-fork.git", self.head, branch=None)
        self.assertEqual(resolved, self.head)

    def test_unknown_head_reports_attempts(self):
        instance = self._git()
        with self.assertRaises(ValueError) as caught:
            instance.fetch_head("", "0123456789abcdef0123456789abcdef01234567", branch="missing")
        message = str(caught.exception)
        self.assertIn("无法获取 PR head 提交", message)
        self.assertIn("origin/sha", message)
        self.assertIn("origin/branch missing", message)

    def test_invalid_sha_and_cross_host_rejected(self):
        instance = self._git()
        with self.assertRaises(ValueError):
            instance.fetch_head("https://gitcode.com/demo/main", "not-a-sha")
        with self.assertRaises(ValueError):
            instance.fetch_head("https://evil.example.com/x/y.git", self.head)


if __name__ == "__main__":
    unittest.main()
