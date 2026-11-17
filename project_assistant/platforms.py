"""按仓库托管平台选择 API 适配器（GitCode/AtomGit 与 GitHub）。

控制器其余模块只依赖适配器接口：``pulls() / pull(n) / comments(n) /
post_inline_comment(...) / post_general_comment(...) / active / target / ci_evidence``。
"""

from __future__ import annotations

from .common import canonical_repo
from .gitcode import GitCode
from .github import GitHub

GITHUB_HOSTS = {"github.com", "www.github.com"}
GITCODE_HOSTS = {"gitcode.com", "atomgit.com", "www.gitcode.com", "www.atomgit.com"}
SUPPORTED = "GitCode/AtomGit 与 GitHub"


def repo_host(config):
    return canonical_repo(config.get("repo_url")).split("/", 1)[0].lower()


def create_api(config, **kwargs):
    host = repo_host(config)
    if host in GITHUB_HOSTS:
        return GitHub(config, **kwargs)
    if host in GITCODE_HOSTS:
        return GitCode(config, **kwargs)
    if host.endswith(".github.com"):
        return GitHub(config, **kwargs)
    raise ValueError(f"暂不支持的代码托管平台：{host}（当前支持 {SUPPORTED}）")
