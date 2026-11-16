from __future__ import annotations

import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from project_assistant.cli import main
from project_assistant.common import Config, atomic_json
from project_assistant.inspect import list_pulls, show_pull


LIST_KEYS = {"generated_at", "repo", "branches", "source", "source_error", "counts", "prs"}
REPO_KEYS = {"url", "id", "state_dir"}
COUNT_KEYS = {"total", "open", "reviewed", "stale", "pending", "failed"}
PR_KEYS = {
    "number", "title", "state", "draft", "target", "source_branch", "head_sha",
    "base_sha", "author", "labels", "pipeline_status", "mergeable", "comments",
    "added_lines", "removed_lines", "html_url", "created_at", "updated_at",
    "active", "review",
}
AUTHOR_KEYS = {"login", "name", "html_url"}
REVIEW_KEYS = {
    "status", "report_dir", "current", "checked_at", "invalidated_at", "reviewed_at",
    "reviewed_head_sha", "mode", "knowledge_mode", "fingerprint", "findings", "severity",
    "coverage_gaps", "job_status", "job_attempts", "job_error", "job_updated",
}
SHOW_KEYS = {"generated_at", "source", "source_error", "pr", "files", "review", "job"}
SHOW_REVIEW_KEYS = REVIEW_KEYS | {
    "metadata", "intent", "summary", "risks_to_verify", "affected_flows",
    "verification_plan", "comparison", "posted_comments", "stale_message",
}
FINDING_KEYS = {"title", "severity", "trigger", "system_function", "consequence",
                "evidence", "verification", "confidence"}
EVIDENCE_KEYS = {"path", "line", "reason"}
JOB_KEYS = {"status", "attempts", "error", "updated"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS prs(number TEXT PRIMARY KEY, fingerprint TEXT, active INTEGER);
CREATE TABLE IF NOT EXISTS jobs(
  id TEXT PRIMARY KEY, number TEXT, payload TEXT, status TEXT,
  attempts INTEGER DEFAULT 0, retry_at REAL DEFAULT 0,
  error TEXT, report TEXT, updated TEXT);
"""


class FakeGitCode:
    def __init__(self, rows=None, detail=None, error=None):
        self.rows = rows or []
        self.detail = detail
        self.error = error
        self.calls = []

    def pulls(self):
        self.calls.append(("pulls",))
        if self.error:
            raise self.error
        return self.rows

    def pull(self, number):
        self.calls.append(("pull", number))
        if self.error:
            raise self.error
        return self.detail


class _Capture(io.StringIO):
    """sys.stdout replacement: cli.main reconfigures the stream before printing."""

    def reconfigure(self, **kwargs):
        return None


class InspectFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.config_path = self.root / "config.json"
        atomic_json(self.config_path, {
            "name": "fixture",
            "repo_url": "https://gitcode.com/test/repo",
            "state_dir": "state",
            "branches": ["develop", "refactor/develop"],
        })
        self.config = Config(self.config_path)
        self.reports = self.config.repo_state / "reports"
        self.job_seq = 0
        self.db = sqlite3.connect(self.config.repo_state / "state.sqlite")
        self.db.executescript(SCHEMA)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    # -- fixture builders -------------------------------------------------
    def add_pr(self, number, active=1, fingerprint=None):
        self.db.execute("INSERT OR REPLACE INTO prs VALUES(?,?,?)",
                        (str(number), fingerprint or "f" * 64, active))
        self.db.commit()

    def add_job(self, number, status, *, payload_pr=None, updated=None, attempts=0,
                error=None, report=None, job_id=None):
        self.job_seq += 1
        if updated is None:
            updated = f"2026-01-01T00:{self.job_seq:02d}:00+00:00"
        payload = json.dumps({"pr": payload_pr}, ensure_ascii=False) if payload_pr is not None else None
        self.db.execute(
            "INSERT OR REPLACE INTO jobs(id,number,payload,status,attempts,retry_at,error,report,updated) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (job_id or f"job-{number}-{self.job_seq}", str(number), payload, status,
             attempts, 0, error, report, updated))
        self.db.commit()

    def raw(self, number, **overrides):
        value = {
            "number": number,
            "title": f"PR {number}",
            "state": "open",
            "draft": False,
            "source_branch": f"feature/{number}",
            "target_branch": "develop",
            "head": {"sha": "h" * 40, "ref": f"feature/{number}",
                     "repo": {"full_name": "fork/repo", "html_url": "https://gitcode.com/fork/repo"}},
            "base": {"sha": "b" * 40, "ref": "develop"},
            "user": {"login": f"user{number}", "name": f"User {number}",
                     "html_url": f"https://gitcode.com/user{number}"},
            "labels": [{"name": "review", "color": "#ff0000"}],
            "mergeable": True,
            "notes": 3,
            "added_lines": 10,
            "removed_lines": 2,
            "updated_at": "2026-01-02T00:00:00+00:00",
            "created_at": "2026-01-01T00:00:00+00:00",
            "html_url": f"https://gitcode.com/test/repo/merge_requests/{number}",
            "pipeline_status": "success",
            "body": f"body {number}",
        }
        value.update(overrides)
        return value

    def write_report(self, number, fingerprint, *, current=True, findings=None,
                     changed_files=None, status_present=True, invalidated_at=None,
                     stale_text=None, generated_at="2026-01-03T00:00:00+00:00",
                     checked_at="2026-01-04T00:00:00+00:00", mode="live-pr",
                     metadata_extra=None, comparison=None, comments=None):
        folder = self.reports / str(number) / fingerprint
        findings = findings if findings is not None else []
        changed_files = changed_files if changed_files is not None else []
        metadata = {
            "repo_id": self.config.repo_id,
            "number": str(number),
            "target": "develop",
            "base_sha": "b" * 40,
            "head_sha": f"head-{number}",
            "description_hash": "d" * 64,
            "pipeline_status": "success",
            "policy": "p" * 64,
            "analyzer": "fixture",
            "review_version": 1,
            "fingerprint": fingerprint,
            "merge_base": "m" * 40,
            "base_snapshot": "base-snapshot",
            "head_snapshot": "head-snapshot",
            "changed_files": changed_files,
            "generated_at": generated_at,
            "ci": {"source": f"https://gitcode.com/test/repo/merge_requests/{number}",
                   "head_sha": "h" * 40, "pipeline_status": "success",
                   "coverage_gap": "仅获取平台聚合状态。"},
            "backend": {"provider": "fixture"},
            "mode": mode,
            "knowledge_mode": "deep",
        }
        if metadata_extra:
            metadata.update(metadata_extra)
        review = {
            "intent": f"意图 {number}",
            "summary": f"摘要 {number}",
            "findings": findings,
            "risks_to_verify": ["需要实测 NPU 性能"],
            "coverage_gaps": ["未执行 PR 代码"],
            "affected_flows": ["入口→计算→返回"],
            "verification_plan": ["运行单元测试"],
            "requested_sources": [],
        }
        atomic_json(folder / "review.json", {"metadata": metadata, "review": review})
        if comparison is not None:
            atomic_json(folder / "comparison.json", comparison)
        if comments is not None:
            atomic_json(folder / "comments.json", {"comments": comments})
        if status_present:
            status = {"current": current, "checked_at": checked_at}
            if invalidated_at:
                status["invalidated_at"] = invalidated_at
            atomic_json(folder / "status.json", status)
        if stale_text is not None:
            (folder / "STALE.txt").write_text(stale_text, encoding="utf-8")
        return folder

    def set_mtime(self, path, seconds):
        os.utime(path, (seconds, seconds))

    def assert_json(self, value):
        encoded = json.dumps(value, ensure_ascii=False)
        self.assertIsInstance(encoded, str)

    def live(self, fake):
        return patch("project_assistant.inspect.GitCode", lambda config: fake)


class LiveListTests(InspectFixture):
    def test_live_list_shape_order_and_numeric_only(self):
        rows = [
            self.raw(7, updated_at="2026-01-07T00:00:00+00:00"),
            self.raw(6, updated_at="2026-01-06T00:00:00+00:00"),
            self.raw(5, updated_at="2026-01-05T00:00:00+00:00"),
            self.raw(4, updated_at="2026-01-04T00:00:00+00:00"),
            self.raw(3, updated_at="2026-01-03T00:00:00+00:00"),
            self.raw(2, updated_at="2026-01-03T00:00:00+00:00"),
            self.raw(1, updated_at=None),
            {"number": "replay-deadbeef", "title": "replay", "state": "open"},
        ]
        with self.live(FakeGitCode(rows=rows)):
            result = list_pulls(self.config)

        self.assertEqual(set(result), LIST_KEYS)
        self.assertEqual(set(result["repo"]), REPO_KEYS)
        self.assertEqual(set(result["counts"]), COUNT_KEYS)
        self.assertEqual(result["source"], "live")
        self.assertIsNone(result["source_error"])
        self.assertEqual(result["branches"], ["develop", "refactor/develop"])
        self.assertEqual(result["repo"]["url"], "https://gitcode.com/test/repo")
        self.assertEqual(result["repo"]["id"], self.config.repo_id)
        self.assertEqual(result["repo"]["state_dir"], str(self.config.repo_state))
        self.assertEqual([pr["number"] for pr in result["prs"]], [7, 6, 5, 4, 3, 2, 1])
        self.assertTrue(all(type(pr["number"]) is int for pr in result["prs"]))
        self.assertEqual(result["counts"]["total"], 7)
        self.assertEqual(result["counts"]["open"], 7)
        self.assertEqual(result["counts"]["reviewed"], 0)

        pr = result["prs"][0]
        self.assertEqual(set(pr), PR_KEYS)
        self.assertEqual(set(pr["author"]), AUTHOR_KEYS)
        self.assertEqual(set(pr["review"]), REVIEW_KEYS)
        self.assertEqual(pr["title"], "PR 7")
        self.assertEqual(pr["author"]["login"], "user7")
        self.assertEqual(pr["labels"], [{"name": "review", "color": "#ff0000"}])
        self.assertEqual(pr["comments"], 3)
        self.assertEqual(pr["added_lines"], 10)
        self.assertEqual(pr["removed_lines"], 2)
        self.assertIs(pr["mergeable"], True)
        self.assertTrue(pr["active"])
        self.assertEqual(pr["review"]["status"], "none")
        self.assertEqual(pr["review"]["severity"], {"critical": 0, "high": 0, "medium": 0, "low": 0})
        self.assert_json(result)

    def test_live_failure_falls_back_to_cache_with_source_error(self):
        self.add_pr(401)
        self.add_job(401, "pending", payload_pr=self.raw(401, title="Cached 401"))
        with self.live(FakeGitCode(error=RuntimeError("network down"))):
            result = list_pulls(self.config)
        self.assertEqual(result["source"], "cache")
        self.assertEqual(result["source_error"], "network down")
        self.assertEqual([pr["number"] for pr in result["prs"]], [401])
        self.assertEqual(result["prs"][0]["title"], "Cached 401")
        self.assertEqual(result["prs"][0]["review"]["status"], "queued")
        self.assert_json(result)


class OfflineListTests(InspectFixture):
    def test_offline_list_uses_cached_payloads_and_minimal_rows(self):
        self.add_pr(100, active=0)
        self.add_pr(101, active=1)
        self.add_pr(102, active=0)
        self.add_pr(103, active=1)
        self.add_pr("replay-deadbeef", active=1)
        self.add_job(102, "pending",
                     payload_pr=self.raw(102, title="Cached 102", updated_at="2026-01-02T00:00:00+00:00"))
        self.add_job(103, "done",
                     payload_pr=self.raw(103, title="Cached 103", updated_at="2026-01-03T00:00:00+00:00"))
        self.add_job(104, "pending",
                     payload_pr=self.raw(104, title="Cached 104", updated_at="2026-01-04T00:00:00+00:00"))
        self.add_job("replay-deadbeef", "done",
                     payload_pr=self.raw("replay-deadbeef", title="Replay"))

        def forbidden(config):
            raise AssertionError("offline mode must not construct GitCode")

        with patch("project_assistant.inspect.GitCode", forbidden):
            result = list_pulls(self.config, offline=True)

        self.assertEqual(result["source"], "cache")
        self.assertIsNone(result["source_error"])
        self.assertEqual([pr["number"] for pr in result["prs"]], [104, 103, 102, 101])
        by_number = {pr["number"]: pr for pr in result["prs"]}
        self.assertNotIn(100, by_number)  # inactive and never reviewed
        self.assertEqual(by_number[101]["title"], "PR #101")
        self.assertTrue(by_number[101]["active"])
        self.assertEqual(by_number[102]["title"], "Cached 102")
        self.assertFalse(by_number[102]["active"])
        self.assertEqual(by_number[103]["title"], "Cached 103")
        self.assertTrue(by_number[104]["active"])
        self.assertEqual(by_number[102]["review"]["status"], "queued")
        self.assertEqual(by_number[103]["review"]["status"], "obsolete")
        self.assertEqual(by_number[101]["review"]["status"], "none")
        self.assertEqual(result["counts"]["total"], 4)
        self.assertEqual(result["counts"]["open"], 4)
        self.assert_json(result)

    def test_review_status_derivations(self):
        for number in range(201, 209):
            self.add_pr(number)

        # none: no job and no report.
        # queued / running / failed: job status mapping.
        self.add_job(202, "pending", payload_pr=self.raw(202))
        self.add_job(203, "running", payload_pr=self.raw(203))
        self.add_job(204, "failed", payload_pr=self.raw(204), attempts=2, error="boom")

        # current: a current report wins over a failed job; latest.json is preferred
        # even when a newer stale directory exists.
        current = self.write_report(205, "current205", current=True, changed_files=["a.py"])
        newer = self.write_report(205, "newer205", current=False,
                                  invalidated_at="2026-01-05T00:00:00+00:00")
        self.set_mtime(current, 1000)
        self.set_mtime(newer, 2000)
        atomic_json(self.reports / "205" / "latest.json",
                    {"report": str(current), "current": True, "fingerprint": "current205",
                     "base_sha": "b" * 40, "head_sha": "h" * 40})
        self.add_job(205, "failed", payload_pr=self.raw(205), attempts=1, error="model failed")

        # stale: a non-current report wins over a still-running job; newest directory
        # is used when latest.json is not current.
        old = self.write_report(206, "old206", current=False,
                                invalidated_at="2026-01-05T00:00:00+00:00")
        new = self.write_report(206, "new206", current=False,
                                invalidated_at="2026-01-06T00:00:00+00:00",
                                stale_text="此版本的 PR 审查已过期，请查看最新版本。\n")
        self.set_mtime(old, 2500)
        self.set_mtime(new, 3000)
        atomic_json(self.reports / "206" / "latest.json",
                    {"report": str(old), "current": False})
        self.add_job(206, "running", payload_pr=self.raw(206))

        # obsolete: report directory without status.json, even with a pending job.
        self.write_report(207, "nostatus207", status_present=False,
                          findings=[{"title": "t", "severity": "high"}])
        self.add_job(207, "pending", payload_pr=self.raw(207))

        # obsolete: done job without any report directory.
        self.add_job(208, "done", payload_pr=self.raw(208), report=None)

        result = list_pulls(self.config, offline=True)
        reviews = {pr["number"]: pr["review"] for pr in result["prs"]}
        self.assertEqual(reviews[201]["status"], "none")
        self.assertEqual(reviews[202]["status"], "queued")
        self.assertEqual(reviews[203]["status"], "running")
        self.assertEqual(reviews[204]["status"], "failed")
        self.assertEqual(reviews[204]["job_attempts"], 2)
        self.assertEqual(reviews[204]["job_error"], "boom")
        self.assertEqual(reviews[205]["status"], "current")
        self.assertTrue(reviews[205]["current"])
        self.assertEqual(reviews[205]["report_dir"], str(current))
        self.assertEqual(reviews[205]["job_status"], "failed")
        self.assertEqual(reviews[205]["job_error"], "model failed")
        self.assertEqual(reviews[205]["findings"], 0)
        self.assertEqual(reviews[205]["fingerprint"], "current205")
        self.assertEqual(reviews[206]["status"], "stale")
        self.assertFalse(reviews[206]["current"])
        self.assertEqual(reviews[206]["report_dir"], str(new))
        self.assertEqual(reviews[206]["invalidated_at"], "2026-01-06T00:00:00+00:00")
        self.assertEqual(reviews[206]["checked_at"], "2026-01-04T00:00:00+00:00")
        self.assertEqual(reviews[206]["job_status"], "running")
        self.assertEqual(reviews[207]["status"], "obsolete")
        self.assertEqual(reviews[207]["job_status"], "pending")
        self.assertEqual(reviews[207]["findings"], 1)
        self.assertEqual(reviews[207]["severity"]["high"], 1)
        self.assertEqual(reviews[208]["status"], "obsolete")

        self.assertEqual(result["counts"], {
            "total": 8, "open": 8, "reviewed": 1, "stale": 1, "pending": 2, "failed": 1,
        })
        self.assert_json(result)

        stale_show = show_pull(self.config, 206, offline=True)
        self.assertEqual(stale_show["review"]["status"], "stale")
        self.assertEqual(stale_show["review"]["report_dir"], str(new))
        self.assertEqual(stale_show["review"]["stale_message"],
                         "此版本的 PR 审查已过期，请查看最新版本。")
        self.assertEqual(stale_show["job"]["status"], "running")


class ShowTests(InspectFixture):
    def test_show_with_real_review_fixture(self):
        self.add_pr(301)
        self.add_job(301, "failed", attempts=2, error="model failed",
                     payload_pr=self.raw(301, title="Show me", body="缓存正文"),
                     report=None)
        findings = [
            {
                "title": "空指针风险",
                "severity": "critical",
                "trigger": "batch=0 时进入空分支",
                "system_function": "训练入口初始化",
                "consequence": "进程崩溃，训练任务丢失",
                "evidence": [
                    {"path": "training/a.py", "line": 12, "reason": "未检查返回值"},
                    {"path": "cust_op/b.cpp", "line": 7, "reason": "数组越界"},
                ],
                "verification": "构造 batch=0 并运行入口",
                "confidence": "high",
            },
            {
                "title": "文档缺失",
                "severity": "medium",
                "trigger": "用户按 README 启动",
                "system_function": "启动脚本",
                "consequence": "参数含义不明",
                "evidence": [{"path": "README.md", "line": 3, "reason": "缺少说明"}],
                "verification": "核对启动脚本参数",
                "confidence": "medium",
            },
        ]
        folder = self.write_report(
            301, "a" * 64, current=True, findings=findings,
            changed_files=["training/a.py", "cust_op/b.cpp"],
            metadata_extra={"fingerprint": "meta-fp-301"},
            comparison={
                "previous_head_sha": "b" * 40,
                "previous_report": "reports/301/old",
                "previous_reviewed_at": "2026-01-02T00:00:00+00:00",
                "items": [{"id": "P1", "title": "旧问题", "severity": "high",
                           "status": "fixed", "reason": "已修复",
                           "evidence": [{"path": "training/a.py", "line": 12, "reason": "新增校验"}]}],
                "fixed": [{"id": "P1", "title": "旧问题", "severity": "high",
                           "status": "fixed", "reason": "已修复",
                           "evidence": [{"path": "training/a.py", "line": 12, "reason": "新增校验"}]}],
                "open": [],
                "new": [],
            },
            comments=[{"finding": "F1", "title": "空指针风险", "path": "training/a.py", "line": 12,
                       "position": 12, "inline": True, "mode": "issue", "comment_id": "c1",
                       "at": "2026-01-05T00:00:00+00:00"}])

        def forbidden_network(config):
            raise AssertionError("offline mode must not construct GitCode")

        with patch("project_assistant.inspect.GitCode", forbidden_network):
            result = show_pull(self.config, 301, offline=True)

        self.assertEqual(set(result), SHOW_KEYS)
        self.assertEqual(result["source"], "cache")
        self.assertIsNone(result["source_error"])
        self.assertEqual(result["pr"]["number"], 301)
        self.assertEqual(result["pr"]["title"], "Show me")
        self.assertEqual(result["pr"]["body"], "缓存正文")
        self.assertEqual(set(result["pr"]), PR_KEYS | {"body"})
        self.assertEqual(result["pr"]["review"]["status"], "current")
        self.assertEqual(result["pr"]["review"]["findings"], 2)
        self.assertEqual(result["files"],
                         {"changed": ["training/a.py", "cust_op/b.cpp"], "source": "review"})

        review = result["review"]
        self.assertEqual(set(review), SHOW_REVIEW_KEYS)
        self.assertEqual(review["status"], "current")
        self.assertTrue(review["current"])
        self.assertEqual(review["report_dir"], str(folder))
        self.assertEqual(review["reviewed_at"], "2026-01-03T00:00:00+00:00")
        self.assertEqual(review["reviewed_head_sha"], "head-301")
        self.assertEqual(review["mode"], "live-pr")
        self.assertEqual(review["knowledge_mode"], "deep")
        self.assertEqual(review["comparison"]["previous_head_sha"], "b" * 40)
        self.assertEqual(review["comparison"]["fixed"][0]["id"], "P1")
        self.assertEqual(review["comparison"]["fixed"][0]["status"], "fixed")
        self.assertEqual([item["finding"] for item in review["posted_comments"]], ["F1"])
        self.assertTrue(review["posted_comments"][0]["inline"])
        self.assertEqual(review["fingerprint"], "meta-fp-301")
        self.assertEqual(review["metadata"]["changed_files"], ["training/a.py", "cust_op/b.cpp"])
        self.assertEqual(review["intent"], "意图 301")
        self.assertEqual(review["summary"], "摘要 301")
        self.assertEqual(review["severity"], {"critical": 1, "high": 0, "medium": 1, "low": 0})
        self.assertEqual(review["coverage_gaps"], ["未执行 PR 代码"])
        self.assertEqual(review["risks_to_verify"], ["需要实测 NPU 性能"])
        self.assertEqual(review["affected_flows"], ["入口→计算→返回"])
        self.assertEqual(review["verification_plan"], ["运行单元测试"])
        self.assertIsNone(review["stale_message"])
        self.assertEqual(review["job_status"], "failed")
        self.assertEqual(review["job_attempts"], 2)
        self.assertEqual(review["job_error"], "model failed")

        self.assertEqual(len(review["findings"]), 2)
        first = review["findings"][0]
        self.assertEqual(set(first), FINDING_KEYS)
        self.assertEqual(first["title"], "空指针风险")
        self.assertEqual(first["severity"], "critical")
        self.assertEqual(set(first["evidence"][0]), EVIDENCE_KEYS)
        self.assertEqual(first["evidence"][0]["line"], 12)
        self.assertIs(type(first["evidence"][0]["line"]), int)
        self.assertEqual(result["job"], {
            "status": "failed", "attempts": 2, "error": "model failed",
            "updated": result["job"]["updated"],
        })
        self.assertEqual(set(result["job"]), JOB_KEYS)
        self.assert_json(result)

    def test_show_without_report_and_input_fallback(self):
        self.add_pr(302)
        self.add_job(302, "pending", payload_pr=self.raw(302, body="离线正文"))
        result = show_pull(self.config, 302, offline=True)
        self.assertEqual(result["source"], "cache")
        self.assertEqual(result["pr"]["body"], "离线正文")
        self.assertEqual(result["pr"]["review"]["status"], "queued")
        self.assertEqual(result["review"]["status"], "queued")
        self.assertIsNone(result["review"]["metadata"])
        self.assertIsNone(result["review"]["intent"])
        self.assertIsNone(result["review"]["summary"])
        self.assertEqual(result["review"]["findings"], [])
        self.assertEqual(result["review"]["coverage_gaps"], [])
        self.assertEqual(result["review"]["risks_to_verify"], [])
        self.assertEqual(result["review"]["affected_flows"], [])
        self.assertEqual(result["review"]["verification_plan"], [])
        self.assertIsNone(result["review"]["stale_message"])
        self.assertEqual(result["files"], {"changed": [], "source": "none"})
        self.assert_json(result)

        self.add_pr(303)
        self.add_job(303, "failed", error="no report", payload_pr=self.raw(303))
        failed_dir = self.reports / "303" / ("b" * 64)
        atomic_json(failed_dir / "input.json",
                    {"metadata": {"number": "303", "changed_files": ["failed.py"]}})
        failed = show_pull(self.config, 303, offline=True)
        self.assertEqual(failed["review"]["status"], "failed")
        self.assertEqual(failed["files"], {"changed": ["failed.py"], "source": "review"})
        self.assertEqual(failed["job"]["error"], "no report")
        self.assert_json(failed)

    def test_show_live_detail_and_live_failure_fallback(self):
        self.add_pr(304)
        self.add_job(304, "pending", payload_pr=self.raw(304, title="Cached title", body="cached body"))
        detail = self.raw(304, title="Live title", body="live body")
        with self.live(FakeGitCode(detail=detail)):
            live = show_pull(self.config, 304)
        self.assertEqual(live["source"], "live")
        self.assertIsNone(live["source_error"])
        self.assertEqual(live["pr"]["title"], "Live title")
        self.assertEqual(live["pr"]["body"], "live body")

        with self.live(FakeGitCode(error=RuntimeError("detail down"))):
            cached = show_pull(self.config, 304)
        self.assertEqual(cached["source"], "cache")
        self.assertEqual(cached["source_error"], "detail down")
        self.assertEqual(cached["pr"]["title"], "Cached title")
        self.assertEqual(cached["pr"]["body"], "cached body")
        self.assert_json(cached)

    def test_show_rejects_non_numeric_numbers(self):
        with self.assertRaises(ValueError):
            show_pull(self.config, "replay-deadbeef", offline=True)
        with self.assertRaises(ValueError):
            show_pull(self.config, 0, offline=True)


class CliWiringTests(InspectFixture):
    def test_cli_list_and_show_offline(self):
        self.add_pr(501)
        self.add_job(501, "pending", payload_pr=self.raw(501))
        out, err = _Capture(), _Capture()
        with patch.object(sys, "stdout", out), patch.object(sys, "stderr", err):
            code = main(["--config", str(self.config_path), "review", "list", "--offline"])
        self.assertEqual(code, 0)
        self.assertEqual(err.getvalue(), "")
        payload = json.loads(out.getvalue())
        self.assertEqual(payload["source"], "cache")
        self.assertEqual([pr["number"] for pr in payload["prs"]], [501])

        out, err = _Capture(), _Capture()
        with patch.object(sys, "stdout", out), patch.object(sys, "stderr", err):
            code = main(["--config", str(self.config_path), "review", "show",
                         "--pr", "501", "--offline"])
        self.assertEqual(code, 0)
        self.assertEqual(err.getvalue(), "")
        detail = json.loads(out.getvalue())
        self.assertEqual(detail["pr"]["number"], 501)
        self.assertEqual(detail["review"]["status"], "queued")


if __name__ == "__main__":
    unittest.main()
