from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from project_assistant.common import Config, atomic_json, read_json
from project_assistant.context import Context
from project_assistant.review import Reviews, indexed_paths
from project_assistant.state import State

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
        with patch.object(reviews, "existing_discussion", return_value=[]), patch.object(reviews, "check_fresh", return_value=True):
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

    def test_updated_pr_reports_previous_findings_and_new_ones(self):
        reviews = Reviews(self.config, model=self.model)
        self.addCleanup(reviews.state.close)
        reviews.git.initialize()
        self.git("checkout", "-b", "feature")
        target = self.repo / "docs" / "notes.patch"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("--- a/x\n+++ b/x\n+one\n", encoding="utf-8")
        self.commit("candidate 1")
        first = self.git("rev-parse", "HEAD").strip()
        reviews.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        first_job = reviews.job(self.pr(sha=first))
        with patch.object(reviews, "existing_discussion", return_value=[]), patch.object(reviews, "check_fresh", return_value=True):
            first_folder, _ = reviews.execute(first_job)
        self.assertFalse((Path(first_folder) / "comparison.json").exists())

        target.write_text("--- a/x\n+++ b/x\n+two\n", encoding="utf-8")
        self.commit("candidate 2")
        second = self.git("rev-parse", "HEAD").strip()
        reviews.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        second_job = reviews.job(self.pr(sha=second))
        with patch.object(reviews, "existing_discussion", return_value=[]), patch.object(reviews, "check_fresh", return_value=True):
            second_folder, _ = reviews.execute(second_job)

        comparison = read_json(Path(second_folder) / "comparison.json")
        self.assertEqual(comparison["previous_head_sha"], first)
        self.assertEqual(len(comparison["items"]), 1)
        self.assertEqual(comparison["items"][0]["status"], "fixed")
        self.assertEqual(len(comparison["fixed"]), 1)
        metadata = read_json(Path(second_folder) / "review.json")["metadata"]
        self.assertEqual(metadata["previous_head_sha"], first)
        self.assertIn("与上一版审查的对比", (Path(second_folder) / "review.md").read_text(encoding="utf-8"))

    def test_existing_comments_are_checked_and_deduplicated(self):
        reviews = Reviews(self.config, model=self.model)
        self.addCleanup(reviews.state.close)
        reviews.git.initialize()
        self.git("checkout", "-b", "feature")
        (self.repo / "alpha/a.py").write_text("def compute():\n    return 12\n", encoding="utf-8")
        self.commit("candidate")
        sha = self.git("rev-parse", "HEAD").strip()
        reviews.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        job = reviews.job(self.pr(sha=sha))
        discussion = [{"id": "c1", "author": "alice", "body": "这里缺少校验", "line": 1,
                       "path": "alpha/a.py", "resolved": False, "comment_type": "diff_comment"}]
        with patch.object(reviews, "existing_discussion", return_value=discussion), \
                patch.object(reviews, "check_fresh", return_value=True):
            folder, _ = reviews.execute(job)

        result = read_json(Path(folder) / "review.json")["review"]
        self.assertEqual([check["comment_id"] for check in result["existing_comment_checks"]], ["c1"])
        self.assertEqual(result["existing_comment_checks"][0]["status"], "still_open")
        self.assertEqual(result["findings"][0]["existing_comment"]["author"], "alice")
        self.assertIn("已有评论的处理情况",
                      (Path(folder) / "review.md").read_text(encoding="utf-8"))
        metadata = read_json(Path(folder) / "review.json")["metadata"]
        self.assertEqual(metadata["existing_comment_count"], 1)

    def test_process_one_forwards_explicit_mode(self):
        reviews = Reviews(self.config, model=self.model)
        self.addCleanup(reviews.state.close)
        reviews.observe([self.pr()], force=True)
        with patch.object(reviews, "execute", return_value=("report", True)) as executed:
            reviews.process_one(mode="deep")
        self.assertEqual(executed.call_args.kwargs.get("mode"), "deep")


class ComparisonTests(unittest.TestCase):
    """上一版结论的复核结果要整理成 已修复 / 仍存在 / 新增，且不把重复问题算成新增。"""

    def test_statuses_are_mapped_and_duplicates_filtered(self):
        previous = {"report": "old", "generated_at": "2026-11-01T00:00:00+00:00", "head_sha": "a" * 40, "review": {}}
        previous_findings = [
            {"id": "P1", "title": "缺失缩放", "severity": "high", "evidence": []},
            {"id": "P2", "title": "导入顺序错误", "severity": "medium", "evidence": []},
            {"id": "P3", "title": "未复核的问题", "severity": "low", "evidence": []},
        ]
        result = {
            "previous_findings_status": [
                {"id": "P1", "status": "fixed", "reason": "已补 1/sqrt", "evidence": [{"path": "a.py", "line": 3}]},
                {"id": "P2", "status": "still_present", "reason": "未改", "evidence": []},
                {"id": "PX", "status": "fixed", "reason": "未知 id 应忽略"},
            ],
            # P2 的标题重复出现 → 不应算作新增
            "findings": [{"title": "导入顺序错误", "severity": "medium"},
                         {"title": "新发现的空指针", "severity": "critical"}],
        }
        comparison = Reviews.compare_previous(previous, previous_findings, result)
        self.assertEqual([item["status"] for item in comparison["items"]],
                         ["fixed", "still_present", "uncertain"])
        self.assertEqual([item["id"] for item in comparison["fixed"]], ["P1"])
        self.assertEqual([item["id"] for item in comparison["open"]], ["P2"])
        self.assertEqual([item["id"] for item in comparison["uncertain"]], ["P3"])
        self.assertEqual([finding["title"] for finding in comparison["new"]], ["新发现的空指针"])
        self.assertEqual(comparison["previous_head_sha"], "a" * 40)

    def test_no_previous_review_means_no_comparison(self):
        self.assertIsNone(Reviews.compare_previous(None, [], {"findings": []}))


class PreviousReportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        atomic_json(root / "config.json", {"name": "demo", "repo_url": "https://gitcode.com/demo/repo",
                                           "branches": ["main"], "state_dir": "state"})
        self.config = Config(root / "config.json")
        self.reviews = Reviews(self.config, model=object())
        self.addCleanup(self.reviews.state.close)
        self.reports = self.config.repo_state / "reports" / "440"
        for name, stamp in (("old-1", "2026-11-01T00:00:00+00:00"),
                            ("old-2", "2026-11-10T00:00:00+00:00"),
                            ("current", "2026-11-16T00:00:00+00:00")):
            atomic_json(self.reports / name / "review.json", {
                "metadata": {"generated_at": stamp, "head_sha": "head-" + name},
                "review": {"findings": []},
            })

    def test_picks_the_newest_other_report(self):
        previous = self.reviews.previous_review({"number": "440", "fingerprint": "current"})
        self.assertIsNotNone(previous)
        self.assertEqual(previous["head_sha"], "head-old-2")
        self.assertEqual(previous["report"], str(self.reports / "old-2"))

    def test_returns_none_without_other_reports(self):
        for path in self.reports.iterdir():
            if path.name != "current":
                for child in sorted(path.rglob("*"), reverse=True):
                    if child.is_file():
                        child.unlink()
                path.rmdir()
        self.assertIsNone(self.reviews.previous_review({"number": "440", "fingerprint": "current"}))


class StaleJobTests(unittest.TestCase):
    """进程被重启杀掉后，running 行必须能被安全清理（页面不再永久显示「进行中」）。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = State(Path(self.tmp.name) / "state.sqlite")
        self.addCleanup(self.state.close)

    def insert_job(self, status="running"):
        self.state.db.execute(
            "INSERT INTO jobs(id,number,payload,status,attempts,retry_at,error,report,updated) "
            "VALUES('j1','440','{}',?,1,0,NULL,NULL,'2026-11-16T06:25:53+00:00')", (status,))
        self.state.db.commit()

    def test_interrupt_running_marks_failed_and_retryable(self):
        self.insert_job()
        self.assertEqual(self.state.interrupt_running("审查进程已中断"), 1)
        row = self.state.db.execute("SELECT status,error,retry_at FROM jobs WHERE id='j1'").fetchone()
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["error"], "审查进程已中断")
        self.assertEqual(row["retry_at"], 0)

    def test_recover_requeues_running_for_watch_mode(self):
        self.insert_job()
        self.assertEqual(self.state.recover(), 1)
        self.assertEqual(self.state.db.execute("SELECT status FROM jobs WHERE id='j1'").fetchone()["status"],
                         "pending")

    def test_interrupt_leaves_other_states_alone(self):
        self.insert_job(status="pending")
        self.assertEqual(self.state.interrupt_running("x"), 0)


if __name__ == "__main__":
    unittest.main()
