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

import hashlib
import json
import re
import time
from pathlib import Path

from .common import atomic_json, now, read_json
from .git import Git
from .gitcode import gitcode_token
from .github import github_token
from .platforms import create_api, repo_host


SEVERITY_LABELS = {"critical": "严重", "high": "高", "medium": "中", "low": "低"}
SEVERITY_LABELS_EN = {"critical": "Critical", "high": "High", "medium": "Medium", "low": "Low"}
COMMENT_MODES = {"issue": "问题", "suggestion": "建议", "question": "疑问"}
COMMENT_LANGUAGES = {"zh": "中文", "en": "English"}
MAX_SELECTED = 10
FOOTER = "> 自动检视意见，请人工确认后处理。"
FOOTER_EN = "> Automated review comment. Please verify before acting."
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


def parse_identifier(value):
    """F<n> = 本轮新发现；P<n> = 上一轮仍未解决。裸数字按 F 处理。"""
    text = str(value or "").strip().upper()
    if not text:
        return None
    prefix = text[0] if text[0] in {"F", "P"} else "F"
    number = text[1:] if text[0] in {"F", "P"} else text
    if not number.isdigit():
        return None
    index = int(number)
    if index < 1:
        return None
    return f"{prefix}{index}"


def _clip(value, limit):
    text = str(value or "").strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _normalized_text(value):
    return re.sub(r"[\s`*_：:，,。.、/\\()（）\[\]-]+", "", str(value or "")).lower()


def _tokens(value):
    text = str(value or "").lower()
    words = set(re.findall(r"[a-z0-9_]+", text))
    for run in re.findall(r"[\u4e00-\u9fff]+", text):
        words.update(run[i:i + 2] for i in range(len(run) - 1))
    return words


def normalize_comments(rows):
    """把平台评论统一成 {id, author, body, path, line, resolved, comment_type} 结构。"""
    result = []
    for raw in rows if isinstance(rows, list) else []:
        if not isinstance(raw, dict):
            continue
        body = str(raw.get("body") or raw.get("content") or "").strip()
        user = raw.get("user") if isinstance(raw.get("user"), dict) else {}
        diff_position = raw.get("diff_position") if isinstance(raw.get("diff_position"), dict) else {}
        line = None
        for key in ("start_new_line", "end_new_line", "new_line"):
            if isinstance(diff_position.get(key), int):
                line = diff_position[key]
                break
        if line is None and isinstance(raw.get("position"), int):
            line = raw["position"]
        result.append({
            "id": raw.get("id") if raw.get("id") is not None else raw.get("discussion_id"),
            "discussion_id": raw.get("discussion_id"),
            "author": str(user.get("login") or user.get("name") or ""),
            "body": body,
            "path": raw.get("path") if isinstance(raw.get("path"), str) else None,
            "line": line,
            "resolved": raw.get("resolved") is True,
            "comment_type": str(raw.get("comment_type") or ""),
            "created_at": raw.get("created_at"),
        })
    return result


def overlap_strength(finding, comment, window=3):
    """重复判断强度：line=同文件同行（强），title=标题/关键词相近（弱，需人工确认）。"""
    evidence = _evidence(finding) or {}
    path, line = evidence.get("path"), evidence.get("line") or 0
    comment_line = comment.get("line")
    if isinstance(comment_line, int) and isinstance(line, int) and line > 0:
        if abs(comment_line - line) <= window:
            if not (comment.get("path") and path) or comment["path"] == path:
                return "line"
    return "title"


def find_overlapping_comment(finding, comments, window=3):
    """判断审查意见是否与已有评论重复：同文件同行（±window）优先，其次标题关键词重合。

    关键词兜底只对行内评论（有行号）或短评论启用，避免把长篇 PR 总结/Bot 摘要误判为重复。
    """
    comments = comments if isinstance(comments, list) else []
    if not comments:
        return None
    evidence = _evidence(finding) or {}
    path, line = evidence.get("path"), evidence.get("line") or 0
    for comment in comments:
        comment_line = comment.get("line")
        if isinstance(comment_line, int) and isinstance(line, int) and line > 0:
            if abs(comment_line - line) <= window:
                if comment.get("path") and path:
                    if comment["path"] != path:
                        continue
                return comment
    title = str(finding.get("title") or "")
    title_key = _normalized_text(title)
    if len(title_key) < 4:
        return None
    title_tokens = _tokens(title)

    def matches(comment):
        body = str(comment.get("body") or "")
        body_key = _normalized_text(body)
        if not body_key:
            return False
        if title_key in body_key or title_key[:20] in body_key:
            return True
        body_tokens = _tokens(body)
        shared = title_tokens & body_tokens
        return len(shared) >= 4 and len(title_tokens) > 0 and len(shared) / len(title_tokens) >= 0.6

    for comment in comments:
        if comment.get("line") is not None and matches(comment):
            return comment
    for comment in comments:
        if comment.get("line") is None and len(str(comment.get("body") or "")) <= 300 and matches(comment):
            return comment
    return None


def _evidence(finding):
    evidence = finding.get("evidence")
    if isinstance(evidence, list) and evidence:
        first = evidence[0]
        if isinstance(first, dict) and first.get("path"):
            line = first.get("line")
            return {"path": str(first["path"]), "line": line if isinstance(line, int) else 0,
                    "reason": _clip(first.get("reason"), 200)}
    return None


def build_comment(finding, mode="issue", lang="zh"):
    """按常用检视口径生成评论正文（zh/en 两套模板，字段文本由调用方决定语言）。"""
    english = lang == "en"
    title = _clip(finding.get("title"), 160) or ("Review finding" if english else "审查意见")
    severity = (SEVERITY_LABELS_EN if english else SEVERITY_LABELS).get(str(finding.get("severity")), "")
    evidence = _evidence(finding)
    reference = ""
    if evidence and evidence["path"]:
        location = evidence["path"] + (":" + str(evidence["line"]) if evidence["line"] else "")
        reference = f"Evidence: `{location}`" if english else f"依据：`{location}`"
        if evidence["reason"]:
            reference += " — " + evidence["reason"]
    trigger = _clip(finding.get("trigger"), 300)
    consequence = _clip(finding.get("consequence"), 300)
    verification = _clip(finding.get("verification"), 300)
    if english:
        if mode == "suggestion":
            lines = [f"[Suggestion] {title}", ""]
            if verification:
                lines += [f"Suggestion: {verification}", ""]
            if reference:
                lines += [reference, ""]
        elif mode == "question":
            lines = [f"[Question] {title}", ""]
            question = "Is this scenario already covered"
            question += f" ({trigger})" if trigger else ""
            question += f"? If not, it may cause: {consequence}" if consequence else "?"
            lines += [question, ""]
            if reference:
                lines += [reference, ""]
        else:
            head = f"[Issue{(' · ' + severity) if severity else ''}] {title}"
            lines = [head, ""]
            if trigger:
                lines.append(f"Trigger: {trigger}")
            if consequence:
                lines.append(f"Impact: {consequence}")
            if verification:
                lines.append(f"Suggestion: {verification}")
            if reference:
                lines.append(reference)
            lines.append("")
        return "\n".join([line for line in lines if line is not None] + [FOOTER_EN])
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


def _finding_key(finding):
    """同一意见的字段指纹，用于缓存英文翻译。"""
    parts = [finding.get("title"), finding.get("trigger"), finding.get("consequence"),
             finding.get("verification")]
    for item in finding.get("evidence") or []:
        if isinstance(item, dict):
            parts.append(item.get("reason"))
    return hashlib.sha1("|".join(str(part or "") for part in parts).encode("utf-8")).hexdigest()[:16]


def _translate_with_model(findings, config, output_path):
    """一次模型调用把选中意见的字段翻译成英文；失败返回 None。"""
    from .backends import create_model

    items = []
    for index, finding in enumerate(findings, start=1):
        evidence = finding.get("evidence") or []
        reasons = [str(item.get("reason") or "") for item in evidence if isinstance(item, dict)]
        items.append({
            "key": _finding_key(finding),
            "title": str(finding.get("title") or ""),
            "trigger": str(finding.get("trigger") or ""),
            "consequence": str(finding.get("consequence") or ""),
            "verification": str(finding.get("verification") or ""),
            "evidence": reasons,
        })
    prompt = ("把下面 JSON 中每条审查意见的 title/trigger/consequence/verification/evidence 翻译成"
              "自然、专业的英文；保留代码标识符、路径、行号与专有名词原样；不要合并或省略条目。"
              "只输出 JSON 对象，结构与输入一致（items 数组，key 原样返回）。\n"
              + json.dumps({"items": items}, ensure_ascii=False))
    schema = {
        "type": "object",
        "properties": {"items": {"type": "array", "items": {
            "type": "object",
            "properties": {"key": {"type": "string"}, "title": {"type": "string"},
                           "trigger": {"type": "string"}, "consequence": {"type": "string"},
                           "verification": {"type": "string"},
                           "evidence": {"type": "array", "items": {"type": "string"}}},
            "required": ["key", "title", "trigger", "consequence", "verification", "evidence"],
            "additionalProperties": False}}},
        "required": ["items"],
        "additionalProperties": False,
    }
    try:
        model = create_model(config)
        result = model.invoke(prompt, schema, config.repo_state, output_path)
    except Exception:  # noqa: BLE001 - 翻译失败时回退原文
        return None
    items = result.get("items") if isinstance(result, dict) else None
    if not isinstance(items, list):
        return None
    return {str(item.get("key")): item for item in items if isinstance(item, dict)}


def localize_findings(findings, lang, config, report_dir=None, *, translator=None):
    """把意见字段本地化成目标语言，返回 (findings, note)。

    zh：原样返回；en：优先用缓存，再调用一次模型翻译，失败时回退原文并提示。
    """
    if lang != "en":
        return findings, None
    cache_path = (Path(report_dir) / "comments.i18n.json") if report_dir else None
    cache = read_json(cache_path, {}) if cache_path else {}
    cache = cache if isinstance(cache, dict) else {}
    missing = []
    for finding in findings:
        if _finding_key(finding) not in cache:
            missing.append(finding)
    if missing:
        if translator is not None:
            translated = translator(missing)
        else:
            if cache_path is not None:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
            translated = _translate_with_model(missing, config,
                                               (cache_path.parent / "comments.i18n.tmp.json")
                                               if cache_path else config.repo_state / "comments.i18n.tmp.json")
        if not isinstance(translated, dict):
            return findings, "英文翻译失败，已使用原文；可在预览中手动编辑"
        cache.update(translated)
        if cache_path is not None:
            atomic_json(cache_path, cache)
    localized = []
    for finding in findings:
        item = cache.get(_finding_key(finding))
        if not isinstance(item, dict):
            localized.append(finding)
            continue
        copy = dict(finding)
        copy["title"] = str(item.get("title") or copy.get("title") or "")
        copy["trigger"] = str(item.get("trigger") or copy.get("trigger") or "")
        copy["consequence"] = str(item.get("consequence") or copy.get("consequence") or "")
        copy["verification"] = str(item.get("verification") or copy.get("verification") or "")
        reasons = item.get("evidence")
        if isinstance(reasons, list) and copy.get("evidence"):
            evidence = []
            for position, entry in enumerate(copy["evidence"]):
                if not isinstance(entry, dict):
                    evidence.append(entry)
                    continue
                translated_entry = dict(entry)
                if position < len(reasons) and str(reasons[position] or "").strip():
                    translated_entry["reason"] = str(reasons[position])
                evidence.append(translated_entry)
            copy["evidence"] = evidence
        localized.append(copy)
    return localized, None


def resolve_anchor(added, line, window=ANCHOR_WINDOW):
    """把意见行号映射到 diff 新增行：精确命中优先，其次用附近（window 内）的新增行。"""
    if not added or not isinstance(line, int) or line <= 0:
        return None
    if line in added:
        return line
    nearest = min(added, key=lambda candidate: (abs(candidate - line), candidate))
    return nearest if abs(nearest - line) <= window else None


def plan_comments(findings, added_by_path, selected_ids, mode="issue", lang="zh", bodies=None,
                  previous_findings=None):
    """生成待评论计划（纯函数，不做网络 IO）。

    ``bodies``：{finding_id: text}，来自页面预览时的手动编辑；提供时按编辑后的正文提交。
    ``previous_findings``：上一轮仍未解决的意见（P1..Pn），同样可勾选/提交。
    """
    plans = []
    notes = []
    bodies = bodies if isinstance(bodies, dict) else {}
    catalog = {}
    for index, finding in enumerate(findings if isinstance(findings, list) else [], start=1):
        if isinstance(finding, dict):
            catalog[f"F{index}"] = finding
    for index, finding in enumerate(previous_findings if isinstance(previous_findings, list) else [],
                                    start=1):
        if isinstance(finding, dict):
            catalog[f"P{index}"] = finding
    for raw in selected_ids:
        identifier = parse_identifier(raw)
        finding = catalog.get(identifier) if identifier else None
        if finding is None:
            notes.append(f"忽略未知意见编号 {raw}")
            continue
        evidence = _evidence(finding) or {}
        path = evidence.get("path") or ""
        line = evidence.get("line") or 0
        position = resolve_anchor(added_by_path.get(path, set()), line) if path else None
        edited = str(bodies.get(identifier) or "").strip()
        body = edited or build_comment(finding, mode, lang)
        inline = bool(position) and bool(path)
        if not inline:
            location = path + (":" + str(line) if line else "") if path else ("unlocated" if lang == "en" else "未定位")
            if edited:
                marker = "Target location" if lang == "en" else "目标位置"
                if marker not in body:
                    prefix = (f"> Target location: `{location}` (not an added line in this diff; "
                              "posted as a PR-level comment)" if lang == "en"
                              else f"> 目标位置：`{location}`（该行不在本次 diff 的新增/修改行内，作为 PR 级评论提交）")
                    body = prefix + "\n\n" + body
            else:
                prefix = (f"> Target location: `{location}` (not an added line in this diff; "
                          "posted as a PR-level comment)" if lang == "en"
                          else f"> 目标位置：`{location}`（该行不在本次 diff 的新增/修改行内，作为 PR 级评论提交）")
                body = prefix + "\n\n" + body
            notes.append(f"{identifier} 未命中 diff 新增行，退化为 PR 级评论")
        footer = FOOTER_EN if lang == "en" else FOOTER
        if footer not in body:
            body = body.rstrip() + "\n\n" + footer
        plans.append({
            "finding": identifier,
            "index": int(identifier[1:]),
            "origin": "previous" if identifier.startswith("P") else "new",
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


def token_present():
    """当前平台是否有写评论所需 token（GitCode 用 GITCODE_TOKEN，GitHub 用 GITHUB_TOKEN/GH_TOKEN）。"""
    return bool(gitcode_token() or github_token())


def _source_for(pr):
    source = pr.get("source_git_url")
    if not source:
        head = pr.get("head") or {}
        repo = head.get("repo") or {}
        source = repo.get("clone_url") or ("https://github.com/" + repo["full_name"] if repo.get("full_name") else "")
    return source


def _added_lines(config, pr, head_sha):
    """返回 path -> diff 新增行号集合；失败时返回 None（评论退化为 PR 级）。"""
    try:
        git = Git(config)
        git.initialize()
        git.fetch_head(_source_for(pr), head_sha,
                       branch=pr.get("source_branch") or (pr.get("head") or {}).get("ref"))
        base = pr.get("base") or {}
        base_sha = base.get("sha") or git.resolve(base.get("ref") or "HEAD")
        merge_base = git.merge_base(base_sha, head_sha)
        return git, merge_base
    except Exception:
        return None, None


def _fetch_existing_comments(api, number):
    """读取 PR 已有评论；失败不影响提交，只记录说明。"""
    try:
        rows = api.comments(int(number))
        return normalize_comments(rows), None
    except Exception as exc:  # noqa: BLE001 - 平台不可用时降级
        return [], f"无法读取 PR 已有评论（{exc}）；未做重复检查"


def post_findings(config, number, selected_ids, *, mode="issue", lang="zh", dry_run=True,
                  force=False, bodies=None, api=None, git=None, report=None, delay=0.6,
                  translator=None):
    """预览或提交审查意见评论。

    - ``lang``：评论模板语言（zh/en）。en 时先把字段翻译成英文（带缓存），失败回退原文；
    - ``bodies``：{finding_id: text}，页面预览里手动编辑后的正文，确认时原样提交。

    返回结构：{ok, dry_run, head_sha, lang, items:[...], posted, failed, notes}
    """
    lang = "en" if str(lang).lower().startswith("en") else "zh"
    api = api or create_api(config)
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
    open_findings = review.get("open_findings") if isinstance(review.get("open_findings"), list) else []
    if not findings and not open_findings:
        raise ValueError("报告中没有可提交的审查意见")
    if len(selected_ids) > MAX_SELECTED:
        raise ValueError(f"一次最多提交 {MAX_SELECTED} 条评论")

    directory = metadata_report_dir(data, config, number)
    report_dir = Path(str(directory)) if directory else None
    already = {str(item.get("finding")) for item in posted_comments(report_dir)} if report_dir else set()
    selected = []
    skipped = []
    for raw in selected_ids:
        identifier = parse_identifier(raw)
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
        for finding in list(findings) + list(open_findings):
            evidence = _evidence(finding) or {}
            path = evidence.get("path")
            if path and path not in added_by_path:
                try:
                    added_by_path[path] = git.added_lines(merge_base, head_sha, path)
                except Exception:
                    added_by_path[path] = set()

    combined = list(findings) + list(open_findings)
    localized_all, translate_note = localize_findings(combined, lang, config, report_dir,
                                                      translator=translator)
    localized = localized_all[:len(findings)]
    localized_open = localized_all[len(findings):]
    plans, notes = plan_comments(localized, added_by_path, selected, mode,
                                 lang=lang, bodies=bodies, previous_findings=localized_open)
    if translate_note:
        notes.append(translate_note)
    if not plans:
        raise ValueError("没有可提交的评论：" + "；".join(notes))

    # PR 常已有他人评论：与「未解决」评论重复的意见默认不再提交，避免刷屏。
    existing, existing_note = _fetch_existing_comments(api, number)
    if existing_note:
        notes.append(existing_note)
    kept = []
    skipped_existing = []
    for plan in plans:
        reference = {"title": plan["title"], "evidence": [{"path": plan["path"], "line": plan["line"]}]}
        match = find_overlapping_comment(reference, existing)
        strength = overlap_strength(reference, match) if match else None
        # 只有「同行」级别的重复才自动跳过；关键词相近的交给人工判断。
        if match and strength == "line" and not match.get("resolved") and not force:
            note_author = match.get("author") or "其他人"
            notes.append(f"{plan['finding']} 与 {note_author} 的已有评论重复，已跳过")
            skipped_existing.append(plan["finding"])
            continue
        if match:
            plan["existing_comment"] = {key: match.get(key) for key in ("id", "author", "line", "resolved")}
            plan["existing_comment"]["match"] = strength
        kept.append(plan)
    if not kept:
        raise ValueError("所选意见在 PR 已有未解决评论（" + "、".join(skipped_existing)
                         + "），已全部跳过；如需重复提交请加 --force")
    plans = kept

    result = {"ok": True, "dry_run": dry_run, "head_sha": head_sha, "mode": mode, "lang": lang,
              "items": [], "posted": 0, "failed": 0, "skipped": skipped,
              "skipped_existing": skipped_existing, "notes": notes,
              "existing_comment_count": len(existing)}
    if dry_run:
        result["items"] = [{**plan, "status": "preview"} for plan in plans]
        return result

    if not token_present():
        raise ValueError("缺少 GITCODE_TOKEN / GITHUB_TOKEN；提交评论需要该平台的写权限 token")

    for index, plan in enumerate(plans):
        if index:
            time.sleep(max(0.0, delay))
        entry = {k: plan[k] for k in ("finding", "title", "severity", "path", "line", "position", "inline", "body")}
        if plan.get("existing_comment"):
            entry["existing_comment"] = plan["existing_comment"]
        entry["mode"] = mode
        entry["at"] = now()
        try:
            response = None
            if plan["inline"]:
                response = api.post_inline_comment(number, plan["body"], plan["path"],
                                                   plan["position"], head_sha)
            else:
                response = api.post_general_comment(number, plan["body"])
        except RuntimeError as exc:
            # 行号不在 diff（平台返回 400/422）时退回 PR 级评论，仍把目标位置写在正文里。
            if plan["inline"]:
                fallback = (f"> 目标位置：`{plan['path']}:{plan['line']}`\n\n" + plan["body"])
                try:
                    response = api.post_general_comment(number, fallback)
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
