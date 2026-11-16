from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from project_assistant.comments import (build_comment, finding_id, parse_id, plan_comments,
                                       post_findings, posted_comments, resolve_anchor)
from project_assistant.common import Config, atomic_json, run

HEAD = "a" * 40
BASE = "b" * 40


def findings():
    return [
        {"title": "反向缩放缺失", "severity": "high", "trigger": "NPU 反向",
         "consequence": "精度整体漂移", "verification": "对比前后向输出", "confidence": "high",
         "evidence": [{"path": "src/a.py", "line": 12, "reason": "未乘 1/sqrt"}]},
        {"title": "顶层导入顺序", "severity": "medium", "trigger": "非 NPU 环境",
         "consequence": "ImportError 破坏回退", "verification": "非 NPU 环境导入", "confidence": "medium",
         "evidence": [{"path": "src/b.py", "line": 99, "reason": "未包在 ENABLE_NPU 内"}]},
    ]


class FakeApi:
    def __init__(self, pr, inline_ok=True):
        self.pr = pr
        self.calls = []
        self.inline_ok = inline_ok

    def pull(self, number):
        return self.pr

    def post(self, path, payload):
        self.calls.append((path, payload))
        if not self.inline_ok and "position" in payload:
            raise RuntimeError("GitCode 评论接口 HTTP 400；请检查 token 权限或评论位置")
        return {"id": "comment-%d" % len(self.calls)}


class FakeGit:
    def __init__(self, added=None):
        self.added = added or {}

    def merge_base(self, base, head):
        return "m" * 40

    def added_lines(self, base, head, path):
        return set(self.added.get(path, set()))


class CommentTextTests(unittest.TestCase):
    def test_ids_are_one_based(self):
        self.assertEqual(finding_id(1), "F1")
        self.assertEqual(parse_id("F3"), 3)
        self.assertEqual(parse_id("3"), 3)
        self.assertIsNone(parse_id("x"))

    def test_issue_comment_uses_review_language(self):
        body = build_comment(findings()[0], "issue")
        self.assertIn("【问题·高】反向缩放缺失", body)
        self.assertIn("触发场景：NPU 反向", body)
        self.assertIn("影响：精度整体漂移", body)
        self.assertIn("建议：对比前后向输出", body)
        self.assertIn("`src/a.py:12`", body)
        self.assertIn("自动检视意见", body)

    def test_suggestion_and_question_are_questions_or_advice(self):
        suggestion = build_comment(findings()[0], "suggestion")
        self.assertIn("【建议】", suggestion)
        self.assertNotIn("触发场景", suggestion)
        question = build_comment(findings()[1], "question")
        self.assertIn("【疑问】", question)
        self.assertIn("是否已经覆盖该场景", question)
        self.assertIn("`src/b.py:99`", question)

    def test_anchor_prefers_exact_then_nearby(self):
        self.assertEqual(resolve_anchor({10, 11, 12}, 12), 12)
        self.assertEqual(resolve_anchor({10, 11, 16}, 12), 11)
        self.assertIsNone(resolve_anchor({1, 2, 3}, 20))
        self.assertIsNone(resolve_anchor(set(), 5))
        self.assertIsNone(resolve_anchor({5}, 0))

    def test_plan_marks_inline_and_fallback(self):
        plans, notes = plan_comments(findings(), {"src/a.py": {11, 12}, "src/b.py": set()},
                                     ["F1", "F2", "F9"])
        self.assertEqual(len(plans), 2)
        self.assertTrue(plans[0]["inline"])
        self.assertEqual(plans[0]["position"], 12)
        self.assertFalse(plans[1]["inline"])
        self.assertIn("目标位置：`src/b.py:99`", plans[1]["body"])
        self.assertTrue(any("忽略未知意见编号" in note for note in notes))
        self.assertTrue(any("退化为 PR 级评论" in note for note in notes))


class PostFindingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        atomic_json(root / "config.json", {"name": "demo", "repo_url": "https://gitcode.com/demo/repo",
                                           "branches": ["main"], "state_dir": "state"})
        self.config = Config(root / "config.json")
        self.folder = self.config.repo_state / "reports" / "440" / "fp"
        atomic_json(self.folder / "review.json", {"metadata": {"head_sha": HEAD}, "review": {"findings": []}})
        self.pr = {"state": "open", "head": {"sha": HEAD}, "base": {"sha": BASE},
                   "source_branch": "feature", "source_git_url": "https://gitcode.com/demo/repo"}
        self.addCleanup(patch.stopall)

    def report(self, head=HEAD, status="current"):
        review = {"status": status, "findings": findings(), "report_dir": str(self.folder)}
        return ({"review": review}, review, {"head_sha": head})

    def run_post(self, api, git, report, ids, **kwargs):
        with patch.dict(os.environ, {"GITCODE_TOKEN": "test-token"}):
            return post_findings(self.config, 440, ids, api=api, git=git, report=report,
                                 delay=0, **kwargs)

    def test_dry_run_posts_nothing(self):
        api = FakeApi(self.pr)
        result = self.run_post(api, FakeGit({"src/a.py": {12}}), self.report(), ["F1", "F2"])
        self.assertTrue(result["dry_run"])
        self.assertEqual(api.calls, [])
        self.assertEqual([item["status"] for item in result["items"]], ["preview", "preview"])
        self.assertIn("反向缩放缺失", result["items"][0]["body"])

    def test_confirm_posts_inline_and_general_comments(self):
        api = FakeApi(self.pr)
        result = self.run_post(api, FakeGit({"src/a.py": {12}}), self.report(),
                               ["F1", "F2"], dry_run=False)
        self.assertTrue(result["ok"])
        self.assertEqual(result["posted"], 2)
        endpoint, inline_payload = api.calls[0]
        self.assertEqual(endpoint, "/pulls/440/comments")
        self.assertEqual(inline_payload["path"], "src/a.py")
        self.assertEqual(inline_payload["position"], 12)
        self.assertEqual(inline_payload["commit_id"], HEAD)
        self.assertEqual(len(api.calls[1][1]), 1)  # 无 diff 锚点 → PR 级评论
        stored = posted_comments(self.folder)
        self.assertEqual([item["finding"] for item in stored], ["F1", "F2"])
        self.assertTrue(stored[0]["inline"])
        self.assertFalse(stored[1]["inline"])

    def test_rejected_inline_falls_back_to_general_comment(self):
        api = FakeApi(self.pr, inline_ok=False)
        result = self.run_post(api, FakeGit({"src/a.py": {12}}), self.report(), ["F1"], dry_run=False)
        self.assertTrue(result["ok"])
        self.assertEqual(result["posted"], 1)
        self.assertEqual(len(api.calls), 2)
        self.assertTrue(any("行内评论被拒绝" in note for note in result["notes"]))
        self.assertFalse(result["items"][0]["inline"])

    def test_already_posted_findings_are_skipped(self):
        api = FakeApi(self.pr)
        report = self.report()
        self.run_post(api, FakeGit({"src/a.py": {12}}), report, ["F1"], dry_run=False)
        with self.assertRaises(ValueError) as caught:
            self.run_post(api, FakeGit({"src/a.py": {12}}), report, ["F1"], dry_run=False)
        self.assertIn("均已评论过", str(caught.exception))

    def test_stale_or_merged_pr_is_refused(self):
        api = FakeApi(self.pr)
        with self.assertRaises(ValueError) as caught:
            self.run_post(api, FakeGit(), self.report(head="c" * 40), ["F1"], dry_run=False)
        self.assertIn("报告基于旧提交", str(caught.exception))
        merged = dict(self.pr, state="merged")
        with self.assertRaises(ValueError) as caught:
            self.run_post(FakeApi(merged), FakeGit(), self.report(), ["F1"], dry_run=False)
        self.assertIn("已合并或关闭", str(caught.exception))
        outdated = self.report(status="stale")
        with self.assertRaises(ValueError) as caught:
            self.run_post(api, FakeGit(), outdated, ["F1"], dry_run=False)
        self.assertIn("报告已过期", str(caught.exception))

    def test_unknown_ids_are_rejected(self):
        with self.assertRaises(ValueError) as caught:
            self.run_post(FakeApi(self.pr), FakeGit(), self.report(), ["F9"])
        self.assertIn("没有可提交的评论", str(caught.exception))

    def test_missing_token_is_reported_before_posting(self):
        api = FakeApi(self.pr)
        with patch("project_assistant.comments.gitcode_token", return_value=None):
            with self.assertRaises(ValueError) as caught:
                post_findings(self.config, 440, ["F1"], api=api, git=FakeGit({"src/a.py": {12}}),
                              report=self.report(), dry_run=False, delay=0)
        self.assertIn("GITCODE_TOKEN", str(caught.exception))
        self.assertEqual(api.calls, [])


class AddedLineTests(unittest.TestCase):
    """新增行解析用真实 Git 仓库验证（行内评论只能落在这些行上）。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.repo = root / "repo"
        self.repo.mkdir()
        run(["git", "init", "-b", "main", str(self.repo)])
        run(["git", "-C", str(self.repo), "config", "user.email", "t@local"])
        run(["git", "-C", str(self.repo), "config", "user.name", "t"])
        (self.repo / "a.py").write_text("l1\nl2\nl3\nl4\nl5\n", encoding="utf-8")
        run(["git", "-C", str(self.repo), "add", "-A"])
        run(["git", "-C", str(self.repo), "commit", "-m", "base"])
        self.base = run(["git", "-C", str(self.repo), "rev-parse", "HEAD"]).strip()
        (self.repo / "a.py").write_text("l1\nl2-changed\ninserted\nl4\nl5\n", encoding="utf-8")
        run(["git", "-C", str(self.repo), "add", "-A"])
        run(["git", "-C", str(self.repo), "commit", "-m", "change"])
        self.head = run(["git", "-C", str(self.repo), "rev-parse", "HEAD"]).strip()

    def test_added_lines_are_new_file_numbers(self):
        from project_assistant.git import Git
        run(["git", "-C", str(self.repo), "remote", "add", "origin", "https://gitcode.com/demo/repo"])
        config_dir = Path(self.tmp.name) / "config"
        config_dir.mkdir()
        config_file = config_dir / "demo.json"
        config_file.write_text(
            '{"name": "demo", "repo_url": "https://gitcode.com/demo/repo",'
            ' "local_repo": "' + str(self.repo).replace("\\", "/") + '",'
            ' "branches": ["main"], "state_dir": "../state"}', encoding="utf-8")
        config = Config(config_file)
        git = Git(config)
        git.initialize()
        self.assertEqual(git.added_lines(self.base, self.head, "a.py"), {2, 3})


if __name__ == "__main__":
    unittest.main()
