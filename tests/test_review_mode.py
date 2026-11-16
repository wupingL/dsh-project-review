from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from project_assistant.common import Config, atomic_json, read_json
from project_assistant.context import Context
from project_assistant.review import Reviews, indexed_paths

# 直接运行单个测试模块时也把 tests 目录放进路径（discover 本来就会）。
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_workflows import FakeModel, Fixture  # noqa: E402


class IndexedPathTests(unittest.TestCase):
    """只有被确定性解析器建图的源码文件（coverage=structural）才需要 head 语义分析。"""

    def test_only_structural_coverage_counts_as_source(self):
        coverage = {"a.py": "structural", "docs/x.md": "inventory-only", "run.log": "inventory-only"}
        self.assertEqual(indexed_paths(["a.py", "docs/x.md", "new.py"], coverage), ["a.py"])
        self.assertEqual(indexed_paths(["docs/x.md", "changes.patch"], coverage), [])

    def test_absent_paths_are_not_indexed(self):
        self.assertEqual(indexed_paths(["new.patch"], {}), [])


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        atomic_json(root / "config.json", {"name": "demo", "repo_url": "https://gitcode.com/demo/repo",
                                           "branches": ["main"], "state_dir": "state"})
        self.config = Config(root / "config.json")
        self.context = Context(self.config, object())
        self.sid = "snap1"
        atomic_json(self.config.repo_state / "snapshots" / self.sid / "files.json", {
            "a.py": {"hash": "h1", "coverage": "structural"},
            "docs/x.md": {"hash": "h2", "coverage": "inventory-only"},
        })

    def test_coverage_reports_structural_inventory_only_and_absent(self):
        self.assertEqual(
            self.context.coverage(self.sid, ["a.py", "docs/x.md", "changes.patch"]),
            {"a.py": "structural", "docs/x.md": "inventory-only", "changes.patch": "absent-or-unindexed"},
        )

    def test_explicit_prior_reaches_snapshot_builder(self):
        with patch.object(Context, "_sync", return_value="sid") as inner:
            sid = self.context.sync("deadbeef", prior="base-sid")
        self.assertEqual(sid, "sid")
        inner.assert_called_once_with("deadbeef", fetch=False, semantic=True, publish=True,
                                      prior="base-sid")


class ReviewModeIntegrationTests(Fixture):
    """真实 Git 仓库 + 真实结构解析器：patch-only 变更走快速路径，源码变更走深度路径。"""

    def _run_review(self, relative, content):
        reviews = Reviews(self.config, model=self.model)
        self.addCleanup(reviews.state.close)
        reviews.git.initialize()
        self.git("checkout", "-b", "feature")
        target = self.repo / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self.commit("candidate")
        sha = self.git("rev-parse", "HEAD").strip()
        reviews.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        job = reviews.job(self.pr(sha=sha))
        with patch.object(reviews, "check_fresh", return_value=True):
            folder, current = reviews.execute(job)
        self.assertTrue(current)
        return Path(folder), read_json(Path(folder) / "review.json")

    def test_unindexed_change_uses_fast_path(self):
        folder, result = self._run_review("docs/notes.patch", "--- a/x\n+++ b/x\n+change\n")
        metadata = result["metadata"]
        self.assertEqual(metadata["knowledge_mode"], "fast")
        self.assertEqual(metadata["head_snapshot_mode"], "structural")
        self.assertIn("快速审查", " ".join(result["review"]["coverage_gaps"]))
        self.assertIn("快速（结构索引 + diff", (folder / "review.md").read_text(encoding="utf-8"))

    def test_source_change_uses_deep_path(self):
        _, result = self._run_review("alpha/a.py", "def compute():\n    return 11\n")
        metadata = result["metadata"]
        self.assertEqual(metadata["knowledge_mode"], "deep")
        self.assertEqual(metadata["head_snapshot_mode"], "semantic")
        self.assertNotIn("快速审查", " ".join(result["review"]["coverage_gaps"]))

    def test_process_one_forwards_explicit_mode(self):
        reviews = Reviews(self.config, model=self.model)
        self.addCleanup(reviews.state.close)
        reviews.observe([self.pr()], force=True)
        with patch.object(reviews, "execute", return_value=("report", True)) as executed:
            reviews.process_one(mode="deep")
        self.assertEqual(executed.call_args.kwargs.get("mode"), "deep")


if __name__ == "__main__":
    unittest.main()
