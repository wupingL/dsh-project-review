from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from project_assistant.common import Config, run
from project_assistant.git import Git
from project_assistant.review import Reviews


def git(root, *args):
    return run(["git", "-C", str(root), *args]).strip()


class LineMapTests(unittest.TestCase):
    """上一轮审查意见的行号要随代码提交同步到当前 head。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.repo = root / "repo"
        self.repo.mkdir()
        run(["git", "init", "-b", "main", str(self.repo)])
        git(self.repo, "config", "user.email", "t@local")
        git(self.repo, "config", "user.name", "t")
        (self.repo / "a.py").write_text("\n".join(
            ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) + "\n", encoding="utf-8")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-m", "base")
        self.base = git(self.repo, "rev-parse", "HEAD")
        # 在 b 之后插入两行，修改 e，删除 h
        (self.repo / "a.py").write_text("\n".join(
            ["a", "b", "X", "Y", "c", "d", "E2", "f", "g", "i", "j"]) + "\n", encoding="utf-8")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-m", "change")
        self.head = git(self.repo, "rev-parse", "HEAD")
        run(["git", "-C", str(self.repo), "remote", "add", "origin", "https://gitcode.com/demo/repo"])
        config_dir = root / "config"
        config_dir.mkdir()
        config_file = config_dir / "demo.json"
        config_file.write_text(
            '{"name": "demo", "repo_url": "https://gitcode.com/demo/repo",'
            ' "local_repo": "' + str(self.repo).replace("\\", "/") + '",'
            ' "branches": ["main"], "state_dir": "../state"}', encoding="utf-8")
        self.git = Git(Config(config_file))
        self.git.initialize()

    def test_lines_follow_insertions_modifications_and_deletions(self):
        mapper = self.git.line_map(self.base, self.head, "a.py")
        self.assertEqual(mapper(1), (1, "same"))
        self.assertEqual(mapper(2), (2, "same"))
        self.assertEqual(mapper(3), (5, "same"))   # c 被两行插入推到 5
        self.assertEqual(mapper(5), (7, "changed"))  # e 被改写
        self.assertEqual(mapper(6), (8, "same"))   # f 顺移
        self.assertEqual(mapper(8)[1], "deleted")  # h 被删除
        self.assertEqual(mapper(10), (11, "same"))

    def test_unchanged_file_is_identity(self):
        mapper = self.git.line_map(self.base, self.head, "b.py")
        self.assertEqual(mapper(7), (7, "same"))


class RemapOpenFindingsTests(unittest.TestCase):
    def test_evidence_lines_are_remapped_and_marked(self):
        class FakeGit:
            def line_map(self, old, new, path):
                return lambda line: (line + 10, "same") if path == "a.py" else (line, "same")

        reviews = Reviews.__new__(Reviews)
        reviews.git = FakeGit()
        findings = [
            {"title": "旧问题", "evidence": [
                {"path": "a.py", "line": 3, "reason": "证据"},
                {"path": "b.py", "line": 4, "reason": "证据2"},
            ]},
        ]
        Reviews.remap_open_findings(reviews, findings, "old" * 1, "new" * 1)
        first, second = findings[0]["evidence"]
        self.assertEqual(first["line"], 13)
        self.assertEqual(first["previous_line"], 3)
        self.assertEqual(second["line"], 4)
        self.assertNotIn("previous_line", second)

    def test_no_remap_without_previous_head(self):
        reviews = Reviews.__new__(Reviews)
        findings = [{"evidence": [{"path": "a.py", "line": 3}]}]
        Reviews.remap_open_findings(reviews, findings, None, "new")
        self.assertEqual(findings[0]["evidence"][0]["line"], 3)


if __name__ == "__main__":
    unittest.main()
