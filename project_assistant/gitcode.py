from __future__ import annotations

import json
import os
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen


def gitcode_token():
    token = os.environ.get("GITCODE_TOKEN")
    if not token and os.name == "nt":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                token, _ = winreg.QueryValueEx(key, "GITCODE_TOKEN")
        except OSError:
            pass
    return token


class GitCode:
    def __init__(self, config, transport=None, write_transport=None):
        self.config = config
        parsed = urlparse(config.get("repo_url"))
        self.repo_path = parsed.path.strip("/").removesuffix(".git")
        self.base_url = config.get("api_url", "https://api.gitcode.com/api/v5").rstrip("/")
        if urlparse(self.base_url).scheme != "https":
            raise ValueError("GitCode API must use HTTPS")
        self.transport = transport
        self.write_transport = write_transport

    def path(self, suffix):
        return "/repos/" + "/".join(quote(p, safe="") for p in self.repo_path.split("/")) + suffix

    def get(self, suffix, **params):
        path = self.path(suffix)
        if self.transport:
            return self.transport(path, params)
        url = self.base_url + path + ("?" + urlencode(params) if params else "")
        headers = {"Accept": "application/json", "User-Agent": "project-assistant/0.1"}
        token = gitcode_token()
        if token:
            headers["Authorization"] = "Bearer " + token
        try:
            with urlopen(Request(url, headers=headers), timeout=30) as response:
                return json.load(response)
        except HTTPError as exc:
            raise RuntimeError(f"GitCode HTTP {exc.code}; check read access and GITCODE_TOKEN") from None

    def post(self, suffix, payload):
        """写操作（提交评论）。默认只缺省在调用方 dry-run 时才会被调用。"""
        path = self.path(suffix)
        if self.write_transport:
            return self.write_transport(path, payload)
        token = gitcode_token()
        if not token:
            raise RuntimeError("缺少 GITCODE_TOKEN；提交评论需要带 pull_requests 写权限的 token")
        headers = {"Accept": "application/json", "Content-Type": "application/json; charset=utf-8",
                   "User-Agent": "project-assistant/0.1", "Authorization": "Bearer " + token}
        # 官方文档要求 access_token 查询参数；部分实现只认 Bearer 头，两者同时带上。
        url = self.base_url + path + "?" + urlencode({"access_token": token})
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            with urlopen(Request(url, data=body, headers=headers, method="POST"), timeout=30) as response:
                return json.load(response)
        except HTTPError as exc:
            # 不回显 URL（内含 access_token）与响应正文中的敏感信息。
            raise RuntimeError(f"GitCode 评论接口 HTTP {exc.code}；请检查 token 权限或评论位置") from None

    def pulls(self):
        # Full open inventory on every poll: target-tip changes and draft transitions
        # must not depend on an updated_at cursor.
        found = {}
        for branch in self.config.get("branches"):
            page = 1
            while True:
                rows = self.get("/pulls", state="open", base=branch, page=page, per_page=100)
                if not isinstance(rows, list):
                    raise RuntimeError("Unexpected GitCode PR list response")
                for row in rows:
                    if row.get("base", {}).get("ref", row.get("target_branch")) == branch:
                        found[str(row["number"])] = row
                if len(rows) < 100:
                    break
                page += 1
        return list(found.values())

    def pull(self, number):
        return self.get(f"/pulls/{int(number)}")

    def comments(self, number):
        """PR 已有评论（含行内评论与其 resolved 状态），用于重复/处理判断。"""
        rows = []
        page = 1
        while True:
            batch = self.get(f"/pulls/{int(number)}/comments", page=page, per_page=100)
            if not isinstance(batch, list):
                raise RuntimeError("Unexpected GitCode PR comments response")
            rows.extend(item for item in batch if isinstance(item, dict))
            if len(batch) < 100:
                break
            page += 1
        return rows

    @staticmethod
    def active(pr):
        return pr.get("state") in {"open", "opened"} and not pr.get("draft", False)

    @staticmethod
    def target(pr):
        return pr.get("base", {}).get("ref", pr.get("target_branch"))

    def ci_evidence(self, pr):
        # Existing aggregate status is evidence of what the platform reports,
        # never evidence that a specific NPU benchmark was executed.
        return {"source": pr.get("html_url", pr.get("web_url", "")),
                "head_sha": pr.get("head", {}).get("sha"),
                "pipeline_status": pr.get("pipeline_status"),
                "coverage_gap": "仅获取平台聚合状态；未获取或未核实具体构建、精度与 NPU 性能测试日志。"}
