"""把审查意见作为 PR 评论提交。

约定（安全优先）：

- 默认 dry-run，只有显式 ``dry_run=False`` 才真正发请求；
- 只允许在「报告仍有效且 head 与报告一致」时提交，避免按过期行号评论；
- 行内评论要求目标行在 diff 的新增/修改行上；不在 diff 内（或接口拒绝）时退化为
  PR 级评论，并在正文用 ``> path:line`` 标注目标位置；
- token 只从环境/凭据读取，不写入返回值和报告；
- 已提交过的意见记录在报告目录 ``comments.json``，默认跳过避免重复刷屏。
"""

from __future__ import annotations

import time
from pathlib import Path

from .common import atomic_json, now, read_json
from .git import Git
from .gitcode import GitCode, gitcode_token


SEVERITY_LABELS = {"critical": "严重", "high": "高", "medium": "中", "low": "低"}
COMMENT_MODES = {"issue": "问题", "suggestion": "建议", "question": "疑问"}
MAX_SELECTED = 10
FOOTER = "> 自动检视意见，请人工确认后处理。"
ANCHOR_WINDOW = 5


def finding_id(index):
    """报告内意见编号（1-based），与页面展示的 F1..Fn 一致。"""
    return f"F{index}"


def parse_id(value):
    text = str(value or "").strip().upper()
    if text.startswith("F"):
        text = text[1:]
    if not text.isdigit():
        return None
    number = int(text)
    return number if number >= 1 else None


def _clip(value, limit):
    text = str(value or "").strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _evidence(finding):
    evidence = finding.get("evidence")
    if isinstance(evidence, list) and evidence:
        first = evidence[0]
        if isinstance(first, dict) and first.get("path"):
            line = first.get("line")
            return {"path": str(first["path"]), "line": line if isinstance(line, int) else 0,
                    "reason": _clip(first.get("reason"), 200)}
    return None


def build_comment(finding, mode="issue"):
    """按常用检视口径生成评论正文。"""
    title = _clip(finding.get("title"), 160) or "审查意见"
    severity = SEVERITY_LABELS.get(str(finding.get("severity")), "")
    evidence = _evidence(finding)
    reference = ""
    if evidence and evidence["path"]:
        location = evidence["path"] + (":" + str(evidence["line"]) if evidence["line"] else "")
        reference = f"依据：`{location}`"
        if evidence["reason"]:
            reference += f" — {evidence['reason']}"
    trigger = _clip(finding.get("trigger"), 300)
    consequence = _clip(finding.get("consequence"), 300)
    verification = _clip(finding.get("verification"), 300)
    if mode == "suggestion":
        head = f"【建议】{title}"
        lines = [head, ""]
        if verification:
            lines += [f"建议：{verification}", ""]
        if reference:
            lines += [reference, ""]
    elif mode == "question":
        head = f"【疑问】{title}"
        lines = [head, ""]
        question = "这里是否已经覆盖该场景"
        question += f"：{trigger}" if trigger else ""
        question += f"？若未覆盖，可能出现：{consequence}" if consequence else "？"
        lines += [question, ""]
        if reference:
            lines += [reference, ""]
    else:
        head = f"【问题{('·' + severity) if severity else ''}】{title}"
        lines = [head, ""]
        if trigger:
            lines.append(f"触发场景：{trigger}")
        if consequence:
            lines.append(f"影响：{consequence}")
        if verification:
            lines.append(f"建议：{verification}")
        if reference:
            lines.append(reference)
        lines.append("")
    return "\n".join([line for line in lines if line is not None] + [FOOTER])


def resolve_anchor(added, line, window=ANCHOR_WINDOW):
    """把意见行号映射到 diff 新增行：精确命中优先，其次用附近（window 内）的新增行。"""
    if not added or not isinstance(line, int) or line <= 0:
        return None
    if line in added:
        return line
    nearest = min(added, key=lambda candidate: (abs(candidate - line), candidate))
    return nearest if abs(nearest - line) <= window else None


def plan_comments(findings, added_by_path, selected_ids, mode="issue"):
    """生成待评论计划（纯函数，不做网络 IO）。"""
    plans = []
    notes = []
    for raw in selected_ids:
        index = parse_id(raw)
        if index is None or index > len(findings):
            notes.append(f"忽略未知意见编号 {raw}")
            continue
        finding = findings[index - 1]
        evidence = _evidence(finding) or {}
        path = evidence.get("path") or ""
        line = evidence.get("line") or 0
        position = resolve_anchor(added_by_path.get(path, set()), line) if path else None
        body = build_comment(finding, mode)
        inline = bool(position) and bool(path)
        if not inline:
            location = path + (":" + str(line) if line else "") if path else "未定位"
            body = f"> 目标位置：`{location}`（该行不在本次 diff 的新增/修改行内，作为 PR 评论提交）\n\n" + body
            notes.append(f"{finding_id(index)} 未命中 diff 新增行，退化为 PR 级评论")
        plans.append({
            "finding": finding_id(index),
            "index": index,
            "title": _clip(finding.get("title"), 200),
            "severity": finding.get("severity"),
            "path": path,
            "line": line,
            "position": position,
            "inline": inline,
            "body": body,
        })
    return plans, notes


def _report_dir(config, number):
    root = config.repo_state / "reports" / str(number)
    if not root.is_dir():
        return None
    latest = read_json(root / "latest.json", {})
    if isinstance(latest, dict) and latest.get("report"):
        candidate = Path(str(latest["report"]))
        if candidate.is_dir():
            return candidate
    candidates = [path for path in root.iterdir() if path.is_dir() and (path / "review.json").is_file()]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


def posted_comments(report_dir):
    data = read_json(report_dir / "comments.json", {})
    entries = data.get("comments") if isinstance(data, dict) else None
    return entries if isinstance(entries, list) else []


def _record_posted(report_dir, entry):
    entries = posted_comments(report_dir)
    entries.append(entry)
    atomic_json(report_dir / "comments.json", {"comments": entries})


def _current_report(config, number):
    from .inspect import show_pull

    data = show_pull(config, number, offline=True)
    review = data.get("review") if isinstance(data.get("review"), dict) else {}
    metadata = review.get("metadata") if isinstance(review.get("metadata"), dict) else {}
    return data, review, metadata


def _source_for(pr):
    source = pr.get("source_git_url")
    if not source:
        head = pr.get("head") or {}
        repo = head.get("repo") or {}
        source = repo.get("clone_url") or ("https://gitcode.com/" + repo["full_name"] if repo.get("full_name") else "")
    return source


def _added_lines(config, pr, head_sha):
    """返回 path -> diff 新增行号集合；失败时返回 None（评论退化为 PR 级）。"""
    try:
        git = Git(config)
        git.initialize()
        git.fetch_head(_source_for(pr), head_sha,
                       branch=pr.get("source_branch") or (pr.get("head") or {}).get("ref"))
        base_sha = (pr.get("base") or {}).get("sha") or git.resolve(GitCode.target(pr))
        merge_base = git.merge_base(base_sha, head_sha)
        return git, merge_base
    except Exception:
        return None, None


def post_findings(config, number, selected_ids, *, mode="issue", dry_run=True, force=False,
                  api=None, git=None, report=None, delay=0.6):
    """预览或提交审查意见评论。

    返回结构：{ok, dry_run, head_sha, items:[...], posted, failed, notes}
    """
    api = api or GitCode(config)
    pr = api.pull(int(number))
    state = str(pr.get("state") or "").lower()
    if state not in {"open", "opened"}:
        raise ValueError("PR 已合并或关闭，无法再提交行内评论")
    head_sha = (pr.get("head") or {}).get("sha") or ""
    data, review, metadata = report or _current_report(config, number)
    if not head_sha:
        raise ValueError("PR 响应缺少 head 提交")
    if str(review.get("status") or "") != "current":
        raise ValueError("审查报告已过期，请先重新审查后再提交评论")
    reviewed = str(metadata.get("head_sha") or "")
    if reviewed and reviewed != head_sha:
        raise ValueError(f"报告基于旧提交（{reviewed[:8]}），当前 head 为 {head_sha[:8]}；请先重新审查")
    findings = review.get("findings") if isinstance(review.get("findings"), list) else []
    if not findings:
        raise ValueError("报告中没有可提交的审查意见")
    if len(selected_ids) > MAX_SELECTED:
        raise ValueError(f"一次最多提交 {MAX_SELECTED} 条评论")

    directory = metadata_report_dir(data, config, number)
    report_dir = Path(str(directory)) if directory else None
    already = {str(item.get("finding")) for item in posted_comments(report_dir)} if report_dir else set()
    selected = []
    skipped = []
    for raw in selected_ids:
        identifier = finding_id(parse_id(raw)) if parse_id(raw) else None
        if identifier and identifier in already and not force:
            skipped.append(identifier)
            continue
        selected.append(raw)
    if not selected:
        raise ValueError("所选意见均已评论过（如需重复提交请加 --force）")

    if git is None:
        git, merge_base = _added_lines(config, pr, head_sha)
    else:
        merge_base = git.merge_base((pr.get("base") or {}).get("sha"), head_sha)
    added_by_path = {}
    if git is not None:
        for finding in findings:
            evidence = _evidence(finding) or {}
            path = evidence.get("path")
            if path and path not in added_by_path:
                try:
                    added_by_path[path] = git.added_lines(merge_base, head_sha, path)
                except Exception:
                    added_by_path[path] = set()

    plans, notes = plan_comments(findings, added_by_path, selected, mode)
    if not plans:
        raise ValueError("没有可提交的评论：" + "；".join(notes))

    result = {"ok": True, "dry_run": dry_run, "head_sha": head_sha, "mode": mode,
              "items": [], "posted": 0, "failed": 0, "skipped": skipped, "notes": notes}
    if dry_run:
        result["items"] = [{**plan, "status": "preview"} for plan in plans]
        return result

    if not gitcode_token():
        raise ValueError("缺少 GITCODE_TOKEN；提交评论需要带 pull_requests 写权限的 token")

    endpoint = f"/pulls/{int(number)}/comments"
    for index, plan in enumerate(plans):
        if index:
            time.sleep(max(0.0, delay))
        entry = {k: plan[k] for k in ("finding", "title", "severity", "path", "line", "position", "inline", "body")}
        entry["mode"] = mode
        entry["at"] = now()
        try:
            response = None
            if plan["inline"]:
                response = api.post(endpoint, {"body": plan["body"], "path": plan["path"],
                                               "position": plan["position"], "commit_id": head_sha,
                                               "position_type": "text"})
            else:
                response = api.post(endpoint, {"body": plan["body"]})
        except RuntimeError as exc:
            # 行号不在 diff（平台返回 400）时退回 PR 级评论，仍把目标位置写在正文里。
            if plan["inline"]:
                fallback = (f"> 目标位置：`{plan['path']}:{plan['line']}`\n\n" + plan["body"])
                try:
                    response = api.post(endpoint, {"body": fallback})
                    entry["inline"] = False
                    entry["body"] = fallback
                    notes.append(f"{plan['finding']} 行内评论被拒绝，已改为 PR 级评论（{exc}）")
                except RuntimeError as fallback_exc:
                    entry["error"] = str(fallback_exc)
                    result["failed"] += 1
                    result["items"].append({**entry, "status": "failed"})
                    continue
            else:
                entry["error"] = str(exc)
                result["failed"] += 1
                result["items"].append({**entry, "status": "failed"})
                continue
        record = response if isinstance(response, dict) else {}
        entry["comment_id"] = record.get("id")
        entry["status"] = "posted"
        result["posted"] += 1
        result["items"].append(entry)
        if report_dir:
            _record_posted(report_dir, entry)
    result["ok"] = result["failed"] == 0
    return result


def metadata_report_dir(data, config, number):
    """show_pull 结果里的报告目录，缺少时按仓库状态目录推断。"""
    review = data.get("review") if isinstance(data.get("review"), dict) else {}
    directory = review.get("report_dir")
    if directory:
        return directory
    return _report_dir(config, number)
