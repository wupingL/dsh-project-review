from __future__ import annotations

import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from project_assistant.comments import (FOOTER, FOOTER_EN, _finding_key, build_comment,
                                       find_overlapping_comment, finding_id, localize_findings,
                                       normalize_comments, parse_id, parse_identifier, plan_comments,
                                       post_findings, posted_comments, resolve_anchor)
from project_assistant.common import Config, atomic_json, run
from project_assistant.gitcode import GitCode

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
    def __init__(self, pr, inline_ok=True, comments=None):
        self.pr = pr
        self.calls = []
        self.inline_ok = inline_ok
        self.comment_rows = comments if comments is not None else []

    def pull(self, number):
        return self.pr

    def comments(self, number):
        return list(self.comment_rows)

    def _record(self, payload):
        self.calls.append(payload)
        return {"id": "comment-%d" % len(self.calls)}

    def post_inline_comment(self, number, body, path, line, commit_id):
        if not self.inline_ok:
            raise RuntimeError("评论接口 HTTP 400；行号不在 diff 中")
        return self._record({"body": body, "path": path, "line": line,
                             "position": line, "commit_id": commit_id, "number": number})

    def post_general_comment(self, number, body):
        return self._record({"body": body, "number": number})


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
        inline_payload = api.calls[0]
        self.assertEqual(inline_payload["path"], "src/a.py")
        self.assertEqual(inline_payload["position"], 12)
        self.assertEqual(inline_payload["commit_id"], HEAD)
        self.assertEqual(set(api.calls[1]), {"body", "number"})  # 无 diff 锚点 → PR 级评论
        stored = posted_comments(self.folder)
        self.assertEqual([item["finding"] for item in stored], ["F1", "F2"])
        self.assertTrue(stored[0]["inline"])
        self.assertFalse(stored[1]["inline"])

    def test_rejected_inline_falls_back_to_general_comment(self):
        api = FakeApi(self.pr, inline_ok=False)
        result = self.run_post(api, FakeGit({"src/a.py": {12}}), self.report(), ["F1"], dry_run=False)
        self.assertTrue(result["ok"])
        self.assertEqual(result["posted"], 1)
        self.assertEqual(len(api.calls), 1)
        self.assertIn("目标位置：`src/a.py:12`", api.calls[0]["body"])
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
        with patch("project_assistant.comments.gitcode_token", return_value=None), \
                patch("project_assistant.comments.github_token", return_value=None):
            with self.assertRaises(ValueError) as caught:
                post_findings(self.config, 440, ["F1"], api=api, git=FakeGit({"src/a.py": {12}}),
                              report=self.report(), dry_run=False, delay=0)
        self.assertIn("token", str(caught.exception).lower())
        self.assertEqual(api.calls, [])

    def test_unresolved_existing_comment_skips_duplicate(self):
        existing = [{"id": "c1", "body": "这里缺少 1/sqrt 缩放", "user": {"login": "alice"},
                     "resolved": False, "comment_type": "diff_comment",
                     "diff_position": {"start_new_line": 12, "end_new_line": 12}}]
        api = FakeApi(self.pr, comments=existing)
        result = self.run_post(api, FakeGit({"src/a.py": {12}}), self.report(), ["F1", "F2"], dry_run=False)
        self.assertEqual([item["finding"] for item in result["items"]], ["F2"])
        self.assertEqual(result["skipped_existing"], ["F1"])
        self.assertTrue(any("已有评论重复" in note for note in result["notes"]))

    def test_resolved_existing_comment_does_not_block_posting(self):
        existing = [{"id": "c1", "body": "这里缺少 1/sqrt 缩放", "user": {"login": "alice"},
                     "resolved": True, "comment_type": "diff_comment",
                     "diff_position": {"start_new_line": 12, "end_new_line": 12}}]
        api = FakeApi(self.pr, comments=existing)
        result = self.run_post(api, FakeGit({"src/a.py": {12}}), self.report(), ["F1"], dry_run=False)
        self.assertEqual(result["posted"], 1)
        self.assertEqual(result["existing_comment_count"], 1)
        self.assertEqual(result["items"][0]["existing_comment"]["id"], "c1")
        self.assertEqual(result["items"][0]["existing_comment"]["match"], "line")

    def test_weak_title_match_is_flagged_but_not_skipped(self):
        existing = [{"id": "c9", "body": "反向缩放缺失：请确认 1/sqrt(attention_dim) 的传递",
                     "user": {"login": "bob"}, "resolved": False, "comment_type": "pr_comment"}]
        api = FakeApi(self.pr, comments=existing)
        result = self.run_post(api, FakeGit({"src/a.py": {12}}), self.report(), ["F1"], dry_run=False)
        self.assertEqual(result["posted"], 1)
        self.assertEqual(result["skipped_existing"], [])
        self.assertEqual(result["items"][0]["existing_comment"]["match"], "title")

    def test_all_duplicates_raise(self):
        existing = [{"id": "c1", "body": "这里缺少缩放", "user": {"login": "alice"},
                     "resolved": False, "comment_type": "diff_comment",
                     "diff_position": {"start_new_line": 12, "end_new_line": 12}}]
        with self.assertRaises(ValueError) as caught:
            self.run_post(FakeApi(self.pr, comments=existing), FakeGit({"src/a.py": {12}}),
                          self.report(), ["F1"], dry_run=False)
        self.assertIn("已全部跳过", str(caught.exception))


class ExistingCommentTests(unittest.TestCase):
    def test_normalize_comment_fields(self):
        rows = [{"id": 7, "body": "请补缩放", "user": {"login": "alice"},
                 "resolved": True, "comment_type": "diff_comment", "path": "src/a.py",
                 "diff_position": {"start_new_line": 12, "end_new_line": 12}}]
        comments = normalize_comments(rows)
        self.assertEqual(comments[0]["author"], "alice")
        self.assertEqual(comments[0]["line"], 12)
        self.assertTrue(comments[0]["resolved"])
        self.assertEqual(comments[0]["path"], "src/a.py")

    def test_overlap_by_line_then_by_title(self):
        line_comment = {"id": "c1", "body": "这里不对", "line": 12,
                        "path": "src/a.py", "resolved": False}
        self.assertIs(find_overlapping_comment(findings()[0], [line_comment]), line_comment)
        far = {"id": "c2", "body": "其他", "line": 90, "path": "src/a.py", "resolved": False}
        self.assertIsNone(find_overlapping_comment(findings()[0], [far]))
        title_comment = {"id": "c3", "body": "反向缩放缺失：请确认 1/sqrt(attention_dim) 的传递",
                         "line": None, "path": None, "resolved": False}
        self.assertIs(find_overlapping_comment(findings()[0], [title_comment]), title_comment)

    def test_long_bot_summary_does_not_count_as_duplicate(self):
        summary = {"id": "bot", "body": "变更摘要 " + "本 PR 更新训练脚本与算子绑定，涉及 ops_rec 与缩放 等关键词。" * 20,
                   "line": None, "path": None, "resolved": False, "comment_type": "pr_comment"}
        self.assertIsNone(find_overlapping_comment(findings()[0], [summary]))


class CommentApiTests(unittest.TestCase):
    def test_comments_are_paginated(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        atomic_json(root / "config.json", {"name": "demo", "repo_url": "https://gitcode.com/demo/repo",
                                           "branches": ["main"], "state_dir": "state"})
        config = Config(root / "config.json")

        def transport(path, params):
            page = int(params.get("page", 1))
            if page == 1:
                return [{"id": page * 100 + index, "body": "x"} for index in range(100)]
            return [{"id": 5, "body": "last"}]

        rows = GitCode(config, transport=transport).comments(440)
        self.assertEqual(len(rows), 101)
        self.assertEqual(rows[-1]["id"], 5)


class CommentLanguageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        atomic_json(root / "config.json", {"name": "demo", "repo_url": "https://gitcode.com/demo/repo",
                                           "branches": ["main"], "state_dir": "state"})
        self.config = Config(root / "config.json")
        self.report = self.config.repo_state / "reports" / "440" / "fp"
        atomic_json(self.report / "review.json", {"metadata": {}, "review": {}})

    def test_english_template_has_no_chinese(self):
        finding = {"title": "Missing attention scaling", "severity": "high",
                   "trigger": "NPU backward pass", "consequence": "gradients drift",
                   "verification": "compare forward/backward outputs",
                   "evidence": [{"path": "src/a.py", "line": 12, "reason": "alpha hardcoded"}]}
        for mode in ("issue", "suggestion", "question"):
            body = build_comment(finding, mode, "en")
            self.assertIsNone(re.search(r"[\u4e00-\u9fff]", body), body)
            self.assertIn("Evidence: `src/a.py:12`", body)
            self.assertTrue(body.endswith(FOOTER_EN))
        self.assertIn("[Issue · High]", build_comment(finding, "issue", "en"))
        self.assertIn("[Suggestion]", build_comment(finding, "suggestion", "en"))
        self.assertIn("[Question]", build_comment(finding, "question", "en"))

    def test_edited_body_is_used_verbatim(self):
        plans, _ = plan_comments(findings(), {"src/a.py": {12}}, ["F1"],
                                 bodies={"F1": "My edited text"})
        self.assertTrue(plans[0]["body"].startswith("My edited text"))
        self.assertIn(FOOTER, plans[0]["body"])
        plans, _ = plan_comments(findings(), {"src/a.py": set()}, ["F2"],
                                 bodies={"F2": "Edited"})
        self.assertIn("目标位置", plans[0]["body"])

    def test_localize_caches_translation(self):
        calls = []

        def translator(items):
            calls.append([item["title"] for item in items])
            return {_finding_key(item): {"title": "EN " + item["title"], "trigger": "T",
                                         "consequence": "C", "verification": "V",
                                         "evidence": ["R"]} for item in items}

        first, note = localize_findings(findings(), "en", self.config, self.report, translator=translator)
        self.assertIsNone(note)
        self.assertEqual(first[0]["title"], "EN 反向缩放缺失")
        second, note = localize_findings(findings(), "en", self.config, self.report, translator=translator)
        self.assertIsNone(note)
        self.assertEqual(second[1]["title"], "EN 顶层导入顺序")
        self.assertEqual(len(calls), 1)  # 第二次全部命中缓存

    def test_localize_falls_back_when_translation_fails(self):
        localized, note = localize_findings(findings(), "en", self.config, self.report,
                                            translator=lambda items: None)
        self.assertIsNotNone(note)
        self.assertEqual(localized[0]["title"], findings()[0]["title"])


class EditedCommentPostingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        atomic_json(root / "config.json", {"name": "demo", "repo_url": "https://gitcode.com/demo/repo",
                                           "branches": ["main"], "state_dir": "state"})
        self.config = Config(root / "config.json")
        self.folder = self.config.repo_state / "reports" / "440" / "fp"
        atomic_json(self.folder / "review.json", {"metadata": {"head_sha": HEAD}, "review": {}})
        self.pr = {"state": "open", "head": {"sha": HEAD}, "base": {"sha": BASE},
                   "source_branch": "feature", "source_git_url": "https://gitcode.com/demo/repo"}

    def report(self):
        review = {"status": "current", "findings": findings(), "report_dir": str(self.folder)}
        return ({"review": review}, review, {"head_sha": HEAD})

    def translator(self, items):
        return {_finding_key(item): {"title": "Translated finding %d" % (index + 1), "trigger": "Trigger",
                                     "consequence": "Impact", "verification": "Verify",
                                     "evidence": ["Reason"]} for index, item in enumerate(items)}

    def test_dry_run_english_preview(self):
        api = FakeApi(self.pr)
        with patch.dict(os.environ, {"GITCODE_TOKEN": "test-token"}):
            result = post_findings(self.config, 440, ["F1"], api=api, git=FakeGit({"src/a.py": {12}}),
                                   report=self.report(), lang="en", translator=self.translator)
        self.assertEqual(result["lang"], "en")
        body = result["items"][0]["body"]
        self.assertIn("[Issue · High] Translated finding 1", body)
        self.assertIsNone(re.search(r"[\u4e00-\u9fff]", body), body)

    def test_confirm_submits_edited_body(self):
        api = FakeApi(self.pr)
        with patch.dict(os.environ, {"GITCODE_TOKEN": "test-token"}):
            result = post_findings(self.config, 440, ["F1"], api=api, git=FakeGit({"src/a.py": {12}}),
                                   report=self.report(), dry_run=False, lang="en",
                                   bodies={"F1": "Hand-written English comment"},
                                   translator=self.translator, delay=0)
        self.assertEqual(result["posted"], 1)
        sent = api.calls[0]["body"]
        self.assertTrue(sent.startswith("Hand-written English comment"))
        self.assertIn(FOOTER_EN, sent)


class OpenFindingCommentTests(unittest.TestCase):
    """上一轮未解决的问题（P1..）必须仍可勾选并提交评论。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        atomic_json(root / "config.json", {"name": "demo", "repo_url": "https://gitcode.com/demo/repo",
                                           "branches": ["main"], "state_dir": "state"})
        self.config = Config(root / "config.json")
        self.folder = self.config.repo_state / "reports" / "440" / "fp"
        atomic_json(self.folder / "review.json", {"metadata": {"head_sha": HEAD}, "review": {}})
        self.pr = {"state": "open", "head": {"sha": HEAD}, "base": {"sha": BASE},
                   "source_branch": "feature", "source_git_url": "https://gitcode.com/demo/repo"}

    def report(self):
        open_finding = {"title": "上一轮未解决的问题", "severity": "high", "trigger": "触发",
                        "system_function": "功能", "consequence": "后果", "confidence": "high",
                        "evidence": [{"path": "src/b.py", "line": 9, "reason": "未修复"}],
                        "verification": "验证", "status": "still_present", "reason": "代码未改动",
                        "origin": "previous"}
        review = {"status": "current", "findings": findings(), "open_findings": [open_finding],
                  "report_dir": str(self.folder)}
        return ({"review": review}, review, {"head_sha": HEAD})

    def test_identifiers_accept_new_and_previous(self):
        self.assertEqual(parse_identifier("F2"), "F2")
        self.assertEqual(parse_identifier("P1"), "P1")
        self.assertEqual(parse_identifier("3"), "F3")
        self.assertIsNone(parse_identifier("X"))

    def test_plan_includes_previous_findings(self):
        plans, notes = plan_comments(
            findings(), {"src/b.py": {9}}, ["P1", "F1"],
            previous_findings=[{"title": "上一轮未解决", "severity": "high",
                              "evidence": [{"path": "src/b.py", "line": 9, "reason": "未修复"}]}])
        self.assertEqual([plan["finding"] for plan in plans], ["P1", "F1"])
        self.assertEqual(plans[0]["origin"], "previous")

    def test_preview_and_post_previous_finding(self):
        api = FakeApi(self.pr)
        with patch.dict(os.environ, {"GITCODE_TOKEN": "test-token"}):
            preview = post_findings(self.config, 440, ["P1"], api=api,
                                    git=FakeGit({"src/b.py": {9}}), report=self.report())
        self.assertEqual([item["finding"] for item in preview["items"]], ["P1"])
        self.assertIn("上一轮未解决的问题", preview["items"][0]["body"])

        api2 = FakeApi(self.pr)
        with patch.dict(os.environ, {"GITCODE_TOKEN": "test-token"}):
            posted = post_findings(self.config, 440, ["P1"], api=api2,
                                   git=FakeGit({"src/b.py": {9}}), report=self.report(),
                                   dry_run=False, delay=0)
        self.assertEqual(posted["posted"], 1)
        self.assertEqual(api2.calls[0]["path"], "src/b.py")


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
