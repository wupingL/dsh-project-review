"""GitHub 只读/写操作适配器。

控制器原本只支持 GitCode。为了让「导入任意 HTTPS 仓库」（含 GitHub）后 PR 列表、
审查与评论都能用，这里提供与 :class:`project_assistant.gitcode.GitCode` 相同的接口，
把 GitHub REST 返回结构归一化成控制器内部使用的字段。
"""

from __future__ import annotations

import json
import os
import socket
import ssl
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import ProxyHandler, Request, build_opener, urlopen

from .common import canonical_repo

_TOKEN_CACHE = {"value": None, "checked": False}


def _credential_token():
    """回退到 git 凭据助手（已在本机登录过 GitHub 时无需再配环境变量）。"""
    try:
        result = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True, text=True, timeout=10,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    for line in result.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip() or None
    return None


def github_token():
    """GitHub token：GITHUB_TOKEN / GH_TOKEN（进程或用户环境），最后回退 git 凭据助手。"""
    if _TOKEN_CACHE["checked"]:
        return _TOKEN_CACHE["value"]
    token = None
    for name in ("GITHUB_TOKEN", "GH_TOKEN"):
        value = os.environ.get(name)
        if value:
            token = value
            break
    if not token and os.name == "nt":
        import winreg
        for name in ("GITHUB_TOKEN", "GH_TOKEN"):
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                    value, _ = winreg.QueryValueEx(key, name)
                if value:
                    token = value
                    break
            except OSError:
                pass
    if not token:
        token = _credential_token()
    _TOKEN_CACHE["value"] = token
    _TOKEN_CACHE["checked"] = True
    return token


NETWORK_ERRORS = (URLError, TimeoutError, socket.timeout, ssl.SSLError, OSError)
RETRY_ATTEMPTS = 3
RETRY_BACKOFF = 1.5


def git_proxy():
    """读取 git 的代理配置。

    很多机器上 git 配了本地代理（如 127.0.0.1:10808）才能访问 GitHub，而 Python
    urllib 只认环境变量；不读 git 配置就会出现「git 能拉代码、控制器却 TLS 超时」。
    """
    for name in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy",
                 "HTTP_PROXY", "http_proxy"):
        value = os.environ.get(name)
        if value:
            return value
    if os.name == "nt":
        import winreg
        for name in ("HTTPS_PROXY", "HTTP_PROXY"):
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                    value, _ = winreg.QueryValueEx(key, name)
                if value:
                    return value
            except OSError:
                pass
    for key in ("https.proxy", "http.proxy"):
        try:
            result = subprocess.run(["git", "config", "--global", "--get", key],
                                    capture_output=True, text=True, timeout=5)
        except (OSError, subprocess.SubprocessError):
            continue
        value = (result.stdout or "").strip()
        if value:
            return value if "://" in value else "http://" + value
    return None


def _opener():
    proxy = git_proxy()
    if not proxy:
        return None
    return build_opener(ProxyHandler({"http": proxy, "https": proxy}))


def _open(request, timeout):
    opener = _opener()
    if opener is not None:
        return opener.open(request, timeout=timeout)
    return urlopen(request, timeout=timeout)


def _open_with_retry(make_request, timeout=30):
    """GitHub API 常见 TLS 握手超时/连接重置：短退避重试，避免整页直接降级。"""
    last = None
    for attempt in range(RETRY_ATTEMPTS):
        try:
            with _open(make_request(), timeout=timeout) as response:
                return response
        except HTTPError:
            raise
        except NETWORK_ERRORS as exc:
            last = exc
            if attempt + 1 >= RETRY_ATTEMPTS:
                break
            time.sleep(RETRY_BACKOFF ** attempt)
    detail = str(last) if last is not None else "unknown"
    proxy = git_proxy()
    hint = f"检测到 git 代理 {proxy}，已尝试经它访问；" if proxy else ""
    raise RuntimeError(
        f"GitHub 网络不可达（{detail}）；已重试 {RETRY_ATTEMPTS} 次。{hint}"
        "请确认代理/VPN 客户端在运行且能访问 github.com（git ls-remote 也应能通）；"
        "也可设置 HTTPS_PROXY，或在项目配置里指定 github_api_url 镜像。")


class GitHub:
    host = "github.com"

    def __init__(self, config, transport=None, write_transport=None):
        self.config = config
        canonical = canonical_repo(config.get("repo_url"))
        # canonical 形如 github.com/owner/repo；GitHub API 路径只要 owner/repo。
        self.repo_path = canonical.split("/", 1)[1] if "/" in canonical else canonical
        self.base_url = str(config.get("github_api_url") or "https://api.github.com").rstrip("/")
        if not self.base_url.startswith("https://"):
            raise ValueError("GitHub API 必须使用 HTTPS")
        self.transport = transport
        self.write_transport = write_transport

    # ---------------------------------------------------------------- transport
    def path(self, suffix):
        return "/repos/" + self.repo_path + suffix

    def _headers(self):
        headers = {"Accept": "application/vnd.github+json",
                   "X-GitHub-Api-Version": "2022-11-28",
                   "User-Agent": "project-assistant/0.1"}
        token = github_token()
        if token:
            headers["Authorization"] = "Bearer " + token
        return headers

    def get(self, suffix, **params):
        path = self.path(suffix)
        if self.transport:
            return self.transport(path, params)
        url = self.base_url + path + ("?" + urlencode(params) if params else "")
        try:
            with _open_with_retry(lambda: Request(url, headers=self._headers())) as response:
                return json.load(response)
        except HTTPError as exc:
            if exc.code == 404:
                raise RuntimeError(
                    "GitHub HTTP 404：仓库不存在、PR 编号不存在，或当前 token 无权限"
                    "（私有仓库需要 GITHUB_TOKEN / GH_TOKEN）") from None
            if exc.code in {401, 403}:
                raise RuntimeError(
                    f"GitHub HTTP {exc.code}：未提供或无权使用 GITHUB_TOKEN / GH_TOKEN") from None
            raise RuntimeError(f"GitHub HTTP {exc.code}") from None

    def post(self, suffix, payload):
        path = self.path(suffix)
        if self.write_transport:
            return self.write_transport(path, payload)
        token = github_token()
        if not token:
            raise RuntimeError("缺少 GITHUB_TOKEN / GH_TOKEN；提交评论需要 repo 写权限的 token")
        headers = self._headers()
        headers["Content-Type"] = "application/json; charset=utf-8"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            with _open_with_retry(
                    lambda: Request(self.base_url + path, data=body, headers=headers, method="POST")) as response:
                return json.load(response)
        except HTTPError as exc:
            if exc.code == 422:
                raise RuntimeError("GitHub HTTP 422：评论位置不在本次 diff 中或参数无效") from None
            if exc.code in {401, 403, 404}:
                raise RuntimeError(
                    f"GitHub HTTP {exc.code}：token 无评论权限，或 PR/仓库不可写") from None
            raise RuntimeError(f"GitHub HTTP {exc.code}") from None

    # ------------------------------------------------------------------- reads
    def _paged(self, suffix, **params):
        rows = []
        page = 1
        while True:
            batch = self.get(suffix, page=page, per_page=100, **params)
            if not isinstance(batch, list):
                raise RuntimeError("Unexpected GitHub response")
            rows.extend(item for item in batch if isinstance(item, dict))
            if len(batch) < 100:
                break
            page += 1
        return rows

    @staticmethod
    def normalize(raw):
        head = raw.get("head") if isinstance(raw.get("head"), dict) else {}
        base = raw.get("base") if isinstance(raw.get("base"), dict) else {}
        repo = head.get("repo") if isinstance(head.get("repo"), dict) else {}
        user = raw.get("user") if isinstance(raw.get("user"), dict) else {}
        labels = [{"name": item.get("name"), "color": item.get("color")}
                  for item in raw.get("labels") or [] if isinstance(item, dict)]
        full_name = repo.get("full_name")
        clone_url = repo.get("clone_url") or (("https://github.com/" + full_name) if full_name else None)
        return {
            "number": raw.get("number"),
            "title": raw.get("title"),
            "body": raw.get("body"),
            "state": raw.get("state"),
            "draft": bool(raw.get("draft")),
            "head": {"ref": head.get("ref"), "sha": head.get("sha"),
                     "repo": {"full_name": full_name, "clone_url": clone_url}},
            "base": {"ref": base.get("ref"), "sha": base.get("sha"),
                     "repo": {"full_name": (base.get("repo") or {}).get("full_name")}},
            "user": {"login": user.get("login"), "name": user.get("name"),
                     "html_url": user.get("html_url")},
            "labels": labels,
            "pipeline_status": None,
            "mergeable": raw.get("mergeable"),
            "notes": raw.get("comments"),
            "added_lines": raw.get("additions"),
            "removed_lines": raw.get("deletions"),
            "html_url": raw.get("html_url"),
            "created_at": raw.get("created_at"),
            "updated_at": raw.get("updated_at"),
            "source_branch": head.get("ref"),
            "source_git_url": clone_url,
        }

    def pulls(self):
        return [self.normalize(item) for item in self._paged("/pulls", state="open")]

    def pull(self, number):
        return self.normalize(self.get(f"/pulls/{int(number)}"))

    def comments(self, number):
        """行内 review 评论 + PR 普通评论，统一成 controller 的评论结构。"""
        rows = []
        number = int(number)
        for suffix in (f"/pulls/{number}/comments", f"/issues/{number}/comments"):
            for item in self._paged(suffix):
                user = item.get("user") if isinstance(item.get("user"), dict) else {}
                line = item.get("line")
                if not isinstance(line, int):
                    line = item.get("original_line") if isinstance(item.get("original_line"), int) else None
                rows.append({
                    "id": item.get("id"),
                    "discussion_id": item.get("node_id"),
                    "body": item.get("body") or "",
                    "user": user,
                    "path": item.get("path") if isinstance(item.get("path"), str) else None,
                    "line": line,
                    "resolved": False,
                    "comment_type": "diff_comment" if item.get("path") else "pr_comment",
                    "created_at": item.get("created_at"),
                })
        return rows

    # ------------------------------------------------------------------ writes
    def post_inline_comment(self, number, body, path, line, commit_id):
        return self.post(f"/pulls/{int(number)}/comments", {
            "body": body, "commit_id": commit_id, "path": path,
            "line": int(line), "side": "RIGHT",
        })

    def post_general_comment(self, number, body):
        return self.post(f"/issues/{int(number)}/comments", {"body": body})

    # ---------------------------------------------------------------- statics
    @staticmethod
    def active(pr):
        return pr.get("state") == "open" and not pr.get("draft", False)

    @staticmethod
    def target(pr):
        return (pr.get("base") or {}).get("ref")

    def ci_evidence(self, pr):
        return {"source": pr.get("html_url", ""),
                "head_sha": (pr.get("head") or {}).get("sha"),
                "pipeline_status": pr.get("pipeline_status"),
                "coverage_gap": "GitHub 仅读取 PR 元数据；未获取 Actions/构建/精度与 NPU 性能日志。"}
