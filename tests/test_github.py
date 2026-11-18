from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from project_assistant.common import Config, atomic_json
from project_assistant.github import GitHub
from project_assistant.platforms import create_api


def make_config(root: Path, url: str) -> Config:
    path = root / "config.json"
    atomic_json(path, {"name": "demo", "repo_url": url, "branches": ["main"], "state_dir": "state"})
    return Config(path)


class AdapterSelectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_github_and_gitcode_hosts(self):
        github = create_api(make_config(self.root, "https://github.com/o/r"))
        self.assertIsInstance(github, GitHub)
        from project_assistant.gitcode import GitCode
        gitcode = create_api(make_config(self.root, "https://gitcode.com/Ascend/RecSDK_for_lingqu"))
        self.assertIsInstance(gitcode, GitCode)

    def test_unsupported_host_is_explicit(self):
        with self.assertRaises(ValueError) as caught:
            create_api(make_config(self.root, "https://bitbucket.org/o/r"))
        message = str(caught.exception)
        self.assertIn("暂不支持", message)
        self.assertIn("GitHub", message)


class GitHubReadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.config = make_config(Path(self.tmp.name), "https://github.com/wupingL/spec-pipeline-demo")
        self.requests = []

    def transport(self, path, params):
        self.requests.append((path, dict(params)))
        page = int(params.get("page", 1))
        if path.endswith("/pulls") and not path.endswith("/comments"):
            if page == 1:
                return [self.pr(index, draft=index == 2) for index in range(100)]
            return [self.pr(999)]
        if path.endswith("/pulls/7"):
            return self.pr(7)
        if path.endswith("/pulls/7/comments"):
            return [{"id": 1, "body": "行内意见", "user": {"login": "alice"},
                     "path": "src/a.py", "line": 12, "created_at": "2026-01-01T00:00:00Z"}]
        if path.endswith("/issues/7/comments"):
            return [{"id": 2, "body": "普通评论", "user": {"login": "bob"},
                     "created_at": "2026-01-02T00:00:00Z"}]
        raise AssertionError("unexpected path " + path)

    @staticmethod
    def pr(number, draft=False):
        return {
            "number": number, "title": "t%d" % number, "body": "b", "state": "open", "draft": draft,
            "head": {"ref": "feature", "sha": "a" * 40,
                     "repo": {"full_name": "wupingL/spec-pipeline-demo", "clone_url": "https://github.com/wupingL/spec-pipeline-demo"}},
            "base": {"ref": "main", "sha": "b" * 40, "repo": {"full_name": "wupingL/spec-pipeline-demo"}},
            "user": {"login": "wupingL", "html_url": "https://github.com/wupingL"},
            "labels": [{"name": "bug", "color": "ff0000"}],
            "html_url": "https://github.com/wupingL/spec-pipeline-demo/pull/%d" % number,
            "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-02T00:00:00Z",
            "comments": 2, "additions": 5, "deletions": 1, "mergeable": True,
        }

    def api(self):
        return GitHub(self.config, transport=self.transport)

    def test_pulls_are_paginated_and_normalized(self):
        pulls = self.api().pulls()
        self.assertEqual(len(pulls), 101)
        first = pulls[0]
        self.assertEqual(first["number"], 0)
        self.assertEqual(first["base"]["ref"], "main")
        self.assertEqual(first["head"]["sha"], "a" * 40)
        self.assertEqual(first["user"]["login"], "wupingL")
        self.assertEqual(first["labels"][0]["name"], "bug")
        self.assertEqual(first["notes"], 2)
        self.assertEqual(first["added_lines"], 5)
        self.assertEqual(first["source_git_url"], "https://github.com/wupingL/spec-pipeline-demo")
        self.assertTrue(GitHub.active(first))
        self.assertFalse(GitHub.active(pulls[2]))  # draft PR 不算 active

    def test_pull_detail_and_comments(self):
        detail = self.api().pull(7)
        self.assertEqual(detail["title"], "t7")
        comments = self.api().comments(7)
        self.assertEqual(len(comments), 2)
        inline, general = comments
        self.assertEqual(inline["comment_type"], "diff_comment")
        self.assertEqual(inline["path"], "src/a.py")
        self.assertEqual(inline["line"], 12)
        self.assertEqual(inline["user"]["login"], "alice")
        self.assertEqual(general["comment_type"], "pr_comment")
        self.assertFalse(general["resolved"])


class GitHubWriteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.config = make_config(Path(self.tmp.name), "https://github.com/o/r")
        self.calls = []

    def write_transport(self, path, payload):
        self.calls.append((path, payload))
        return {"id": 123}

    def test_inline_comment_uses_line_and_side(self):
        api = GitHub(self.config, write_transport=self.write_transport)
        api.post_inline_comment(7, "正文", "src/a.py", 12, "c" * 40)
        path, payload = self.calls[0]
        self.assertEqual(path, "/repos/o/r/pulls/7/comments")
        self.assertEqual(payload["line"], 12)
        self.assertEqual(payload["side"], "RIGHT")
        self.assertEqual(payload["commit_id"], "c" * 40)
        self.assertEqual(payload["path"], "src/a.py")

    def test_general_comment_uses_issue_endpoint(self):
        api = GitHub(self.config, write_transport=self.write_transport)
        api.post_general_comment(7, "正文")
        path, payload = self.calls[0]
        self.assertEqual(path, "/repos/o/r/issues/7/comments")
        self.assertEqual(payload, {"body": "正文"})


class RetryTests(unittest.TestCase):
    """GitHub API 偶尔 TLS 握手超时：应短退避重试而不是整页降级。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.config = make_config(Path(self.tmp.name), "https://github.com/o/r")

    def test_get_retries_transient_network_errors(self):
        import ssl
        from project_assistant import github

        calls = []

        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                import json as _json
                return _json.dumps([]).encode("utf-8")

        def flaky(request, timeout=30):
            calls.append(request.full_url)
            if len(calls) < 3:
                raise ssl.SSLError("handshake operation timed out")
            return FakeResponse()

        with patch.object(github, "_opener", lambda: None), patch.object(github, "urlopen", flaky), \
                patch.object(github.time, "sleep", lambda *_: None):
            result = github.GitHub(self.config).pulls()
        self.assertEqual(result, [])
        self.assertEqual(len(calls), 3)

    def test_get_reports_actionable_error_after_retries(self):
        import ssl
        from project_assistant import github

        def failing(request, timeout=30):
            raise ssl.SSLError("handshake operation timed out")

        with patch.object(github, "_opener", lambda: None), patch.object(github, "urlopen", failing), \
                patch.object(github.time, "sleep", lambda *_: None):
            with self.assertRaises(RuntimeError) as caught:
                github.GitHub(self.config).pulls()
        message = str(caught.exception)
        self.assertIn("网络不可达", message)
        self.assertIn("HTTPS_PROXY", message)


class ProxyTests(unittest.TestCase):
    def test_proxy_from_git_config_when_env_absent(self):
        import subprocess
        from project_assistant import github

        class Result:
            def __init__(self, value):
                self.stdout = value + "\n"

        def fake_run(args, **kwargs):
            if "https.proxy" in args:
                return Result("127.0.0.1:10808")
            return Result("")

        with patch.object(github.os, "environ", {}), \
                patch.object(github.subprocess, "run", fake_run), \
                patch.object(github.os, "name", "posix"):
            self.assertEqual(github.git_proxy(), "http://127.0.0.1:10808")

    def test_env_proxy_wins(self):
        from project_assistant import github
        with patch.object(github.os, "environ", {"HTTPS_PROXY": "http://proxy.local:8080"}):
            self.assertEqual(github.git_proxy(), "http://proxy.local:8080")


class ListPullsWithGitHubTests(unittest.TestCase):
    def test_inspect_uses_github_adapter(self):
        from project_assistant import inspect

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        config = make_config(Path(tmp.name), "https://github.com/o/r")

        class FakeGitHub:
            def __init__(self, config, **kwargs):
                pass

            def pulls(self):
                return [{"number": 3, "title": "gh pr", "state": "open", "draft": False,
                         "head": {"ref": "feature", "sha": "a" * 40, "repo": {}},
                         "base": {"ref": "main", "sha": "b" * 40},
                         "user": {"login": "x", "html_url": None}, "labels": [],
                         "html_url": None, "created_at": None, "updated_at": None,
                         "notes": 0, "added_lines": 1, "removed_lines": 0, "mergeable": True}]

        with patch("project_assistant.platforms.GitHub", FakeGitHub):
            result = inspect.list_pulls(config)
        self.assertEqual(result["source"], "live")
        self.assertIsNone(result["source_error"])
        self.assertEqual([pr["number"] for pr in result["prs"]], [3])
        self.assertEqual(result["prs"][0]["title"], "gh pr")
