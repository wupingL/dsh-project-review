"""Read-only inspection of PR review state.

This module is the data source for read-only surfaces (desktop/plugin UI). It
never instantiates :class:`project_assistant.state.State` (which opens SQLite in
read-write mode and may checkpoint WAL), never writes files, and in offline mode
never touches the network.

Output shapes are part of the public contract consumed by the desktop plugin;
keep field names and value types stable.
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .common import now, read_json
from .gitcode import GitCode
from .platforms import create_api

_OPEN_STATES = frozenset({"open", "opened"})
_SEVERITIES = ("critical", "high", "medium", "low")
_JOB_TO_REVIEW = {
    "pending": "queued",
    "running": "running",
    "failed": "failed",
    "done": "obsolete",
    "obsolete": "obsolete",
}


# ---------------------------------------------------------------------------
# Small coercion helpers. GitCode payloads contain nullable fields, and cached
# JSON may be malformed; inspection must degrade instead of raising.
# ---------------------------------------------------------------------------

def _text(value):
    return value if isinstance(value, str) else None


def _int(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False
    return None


def _number(value):
    """Return an int only for a concrete numeric PR number (replay-* excluded)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit():
            return int(text)
    return None


def _require_number(value):
    number = _number(value)
    if number is None or number < 1:
        raise ValueError(f"PR number must be numeric: {value!r}")
    return number


def _load_json(path):
    try:
        if Path(path).is_file():
            return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        pass
    return None


def _load_payload(text):
    if not isinstance(text, str) or not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


def _strings(value):
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, (int, float)) and not isinstance(item, bool):
            result.append(str(item))
    return result


def _timestamp(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.timestamp()


# ---------------------------------------------------------------------------
# Config/path helpers
# ---------------------------------------------------------------------------

def _repo_url(config):
    value = config.get("repo_url")
    if isinstance(value, str) and value:
        return value
    repo_id = _repo_id(config)
    return "https://" + repo_id if repo_id else ""


def _repo_id(config):
    return str(getattr(config, "repo_id", "") or "")


def _state_root(config):
    return Path(config.repo_state).resolve()


def _branches(config):
    value = config.get("branches")
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _inside(root, path):
    try:
        Path(path).resolve().relative_to(Path(root).resolve())
        return True
    except (OSError, ValueError):
        pass
    try:
        root_text = os.path.normcase(str(Path(root).resolve()))
        path_text = os.path.normcase(str(Path(path).resolve()))
        return path_text.startswith(root_text + os.sep)
    except OSError:
        return False


def _report_path(config, value):
    """Accept a stored report path only when it points at a directory under repo_state."""
    if not isinstance(value, str) or not value.strip():
        return None
    path = Path(value)
    if not path.is_absolute():
        path = _state_root(config) / path
    try:
        path = path.resolve()
    except OSError:
        return None
    if not _inside(_state_root(config), path):
        return None
    try:
        return path if path.is_dir() else None
    except OSError:
        return None


def _has_file(directory, name):
    try:
        return (Path(directory) / name).is_file()
    except OSError:
        return False


def _report_dirs(config, number):
    root = _state_root(config) / "reports" / str(number)
    try:
        entries = list(root.iterdir())
    except OSError:
        return []
    result = []
    for entry in entries:
        try:
            if entry.is_dir():
                result.append(entry)
        except OSError:
            continue
    return result


def _newest(directories):
    def key(directory):
        try:
            mtime = directory.stat().st_mtime_ns
        except OSError:
            mtime = -1
        return (mtime, directory.name)

    return max(directories, key=key) if directories else None


def _select_report(config, number):
    """Pick latest.json when current, else the newest directory holding review.json."""
    root = _state_root(config) / "reports" / str(number)
    latest = _load_json(root / "latest.json")
    if isinstance(latest, dict) and latest.get("current") is True:
        candidate = _report_path(config, latest.get("report"))
        if candidate is not None and _has_file(candidate, "review.json"):
            return candidate
    candidates = [folder for folder in _report_dirs(config, number) if _has_file(folder, "review.json")]
    return _newest(candidates)


def _artifact_dir(config, number, report=None):
    if report is not None:
        return report
    candidates = [folder for folder in _report_dirs(config, number) if _has_file(folder, "input.json")]
    return _newest(candidates)


# ---------------------------------------------------------------------------
# SQLite snapshot (strictly read-only)
# ---------------------------------------------------------------------------

class _Snapshot:
    """A read-only view of state.sqlite; missing tables or files degrade to empty."""

    def __init__(self, config):
        self.repo_state = _state_root(config)
        self.prs = {}
        self.jobs = {}
        self.error = None
        self._load()

    def _load(self):
        path = self.repo_state / "state.sqlite"
        if not path.is_file():
            return
        try:
            database = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)
        except sqlite3.Error as exc:
            self.error = str(exc)
            return
        try:
            database.row_factory = sqlite3.Row
            try:
                for row in database.execute("SELECT number, fingerprint, active FROM prs"):
                    number = _number(row["number"])
                    if number is None:
                        continue
                    self.prs[str(number)] = {
                        "number": number,
                        "fingerprint": _text(row["fingerprint"]),
                        "active": bool(row["active"]),
                    }
            except sqlite3.Error as exc:
                self.error = str(exc)
            try:
                # Same "latest" semantics as the controller: newest updated first.
                for row in database.execute(
                        "SELECT id, number, payload, status, attempts, error, report, updated "
                        "FROM jobs ORDER BY updated DESC, rowid DESC"):
                    number = _number(row["number"])
                    if number is None:
                        continue
                    self.jobs.setdefault(str(number), []).append(dict(row))
            except sqlite3.Error as exc:
                self.error = str(exc)
        finally:
            database.close()

    def latest_job(self, number):
        rows = self.jobs.get(str(number))
        return rows[0] if rows else None

    def cached_pr(self, number):
        """Newest cached job payload's raw "pr" object, or None."""
        for row in self.jobs.get(str(number), []):
            payload = _load_payload(row.get("payload"))
            if isinstance(payload, dict) and isinstance(payload.get("pr"), dict):
                return payload["pr"]
        return None

    def numbers(self):
        # Offline inventory: active PRs plus any PR that ever had a job.
        # Inactive rows without jobs are closed/irrelevant and stay out.
        keys = {key for key, row in self.prs.items() if row["active"]} | set(self.jobs)
        return sorted({int(key) for key in keys if key.isdigit()})


# ---------------------------------------------------------------------------
# Raw PR normalisation
# ---------------------------------------------------------------------------

def _head(raw):
    value = raw.get("head")
    return value if isinstance(value, dict) else {}


def _base(raw):
    value = raw.get("base")
    return value if isinstance(value, dict) else {}


def _target(raw):
    base = _base(raw)
    target = _text(base.get("ref"))
    return target if target is not None else _text(raw.get("target_branch"))


def _is_active(raw, branches):
    return (_text(raw.get("state")) in _OPEN_STATES
            and not bool(raw.get("draft", False))
            and _target(raw) in branches)


def _labels(raw):
    result = []
    value = raw.get("labels")
    if not isinstance(value, list):
        return result
    for label in value:
        if isinstance(label, dict):
            name = _text(label.get("name"))
            if name is not None:
                result.append({"name": name, "color": _text(label.get("color"))})
        elif isinstance(label, str) and label:
            result.append({"name": label, "color": None})
    return result


def _pr_from_raw(number, raw, *, active, review):
    head = _head(raw)
    base = _base(raw)
    user = raw.get("user")
    user = user if isinstance(user, dict) else {}
    html_url = _text(raw.get("html_url")) or _text(raw.get("web_url")) or _text(raw.get("url"))
    return {
        "number": number,
        "title": _text(raw.get("title")) or f"PR #{number}",
        "state": _text(raw.get("state")),
        "draft": bool(raw.get("draft", False)),
        "target": _target(raw),
        "source_branch": _text(raw.get("source_branch")) or _text(head.get("ref")),
        "head_sha": _text(head.get("sha")),
        "base_sha": _text(base.get("sha")),
        "author": {
            "login": _text(user.get("login")),
            "name": _text(user.get("name")),
            "html_url": _text(user.get("html_url")),
        },
        "labels": _labels(raw),
        "pipeline_status": _text(raw.get("pipeline_status")),
        "mergeable": _bool(raw.get("mergeable")),
        "comments": _int(raw.get("notes")),
        "added_lines": _int(raw.get("added_lines")),
        "removed_lines": _int(raw.get("removed_lines")),
        "html_url": html_url,
        "created_at": _text(raw.get("created_at")),
        "updated_at": _text(raw.get("updated_at")),
        "active": bool(active),
        "review": review,
    }


def _is_open(pr):
    state = pr.get("state")
    if state is not None:
        return state in _OPEN_STATES
    return bool(pr.get("active"))


def _sort_key(pr):
    weight = _timestamp(pr.get("updated_at"))
    return (weight is not None, weight if weight is not None else 0.0, pr["number"])


# ---------------------------------------------------------------------------
# Review status derivation
# ---------------------------------------------------------------------------

def _job_report_path(config, job):
    return _report_path(config, job.get("report")) if job is not None else None


def _review_data(report):
    data = _load_json(report / "review.json") if report is not None else None
    if not isinstance(data, dict):
        return None, {}
    metadata = data.get("metadata")
    review = data.get("review")
    return (metadata if isinstance(metadata, dict) else None,
            review if isinstance(review, dict) else {})


def _severities(findings):
    counts = {severity: 0 for severity in _SEVERITIES}
    if isinstance(findings, list):
        for finding in findings:
            if not isinstance(finding, dict):
                continue
            severity = finding.get("severity")
            if severity in counts:
                counts[severity] += 1
    return counts


def _review_view(config, number, snapshot):
    """Return (public REVIEW, selected report Path|None, metadata|None, review data)."""
    job = snapshot.latest_job(number)
    job_status = _text(job.get("status")) if job is not None else None
    report = _select_report(config, number)
    metadata = None
    review = {}
    checked_at = None
    invalidated_at = None

    if report is not None:
        status_data = _load_json(report / "status.json")
        if isinstance(status_data, dict):
            status = "current" if status_data.get("current") is True else "stale"
            checked_at = _text(status_data.get("checked_at"))
            invalidated_at = _text(status_data.get("invalidated_at"))
        else:
            status = "obsolete"
        metadata, review = _review_data(report)
    elif job is not None:
        # done/obsolete without review.json means the artifact is gone.
        status = _JOB_TO_REVIEW.get(job_status, "none")
    else:
        status = "none"

    findings = review.get("findings")
    findings = findings if isinstance(findings, list) else []
    coverage_gaps = review.get("coverage_gaps")
    coverage_gaps = coverage_gaps if isinstance(coverage_gaps, list) else []

    fingerprint = _text(metadata.get("fingerprint")) if metadata else None
    if not fingerprint and report is not None:
        fingerprint = report.name
    if not fingerprint and job is not None:
        fingerprint = _text(job.get("id"))

    report_dir = str(report) if report is not None else None
    if report_dir is None:
        stored = _job_report_path(config, job)
        report_dir = str(stored) if stored is not None else None

    value = {
        "status": status,
        "report_dir": report_dir,
        "current": status == "current",
        "checked_at": checked_at,
        "invalidated_at": invalidated_at,
        "reviewed_at": _text(metadata.get("generated_at")) if metadata else None,
        "reviewed_head_sha": _text(metadata.get("head_sha")) if metadata else None,
        "mode": _text(metadata.get("mode")) if metadata else None,
        "knowledge_mode": _text(metadata.get("knowledge_mode")) if metadata else None,
        "fingerprint": fingerprint,
        "findings": len(findings),
        "severity": _severities(findings),
        "coverage_gaps": len(coverage_gaps),
        "job_status": job_status,
        "job_attempts": _int(job.get("attempts")) if job is not None else None,
        "job_error": _text(job.get("error")) if job is not None else None,
        "job_updated": _text(job.get("updated")) if job is not None else None,
    }
    return value, report, metadata, review


def _finding_cards(value):
    result = []
    if not isinstance(value, list):
        return result
    for finding in value:
        if not isinstance(finding, dict):
            continue
        evidence = []
        raw_evidence = finding.get("evidence")
        if isinstance(raw_evidence, list):
            for item in raw_evidence:
                if not isinstance(item, dict):
                    continue
                line = _int(item.get("line"))
                evidence.append({
                    "path": _text(item.get("path")) or "",
                    "line": line if line is not None else 0,
                    "reason": _text(item.get("reason")) or "",
                    "previous_line": _int(item.get("previous_line")),
                    "relocated_from": _int(item.get("relocated_from")),
                    "line_status": _text(item.get("line_status")),
                })
        result.append({
            "origin": _text(finding.get("origin")) or "new",
            "title": _text(finding.get("title")) or "",
            "severity": _text(finding.get("severity")) or "",
            "trigger": _text(finding.get("trigger")) or "",
            "system_function": _text(finding.get("system_function")) or "",
            "consequence": _text(finding.get("consequence")) or "",
            "evidence": evidence,
            "verification": _text(finding.get("verification")) or "",
            "confidence": _text(finding.get("confidence")) or "",
            "rules": _strings(finding.get("rules")),
            "existing_comment": _existing_comment(finding.get("existing_comment")),
        })
    return result


def _existing_comment(value):
    """该意见与 PR 已有评论重复时的摘要（页面据此提示，默认不重复提交）。"""
    if not isinstance(value, dict):
        return None
    return {
        "id": _text(value.get("id")),
        "author": _text(value.get("author")),
        "line": _int(value.get("line")),
        "match": _text(value.get("match")) or "line",
        "excerpt": _text(value.get("excerpt")),
    }


def _comment_checks(value):
    """模型对 PR 已有评论的处理判断（已处理 / 仍未处理 / 无法确认）。"""
    result = []
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        result.append({
            "comment_id": _text(item.get("comment_id")),
            "author": _text(item.get("author")),
            "line": _int(item.get("line")),
            "comment_type": _text(item.get("comment_type")),
            "resolved": item.get("resolved") is True,
            "excerpt": _text(item.get("excerpt")),
            "status": _text(item.get("status")),
            "reason": _text(item.get("reason")),
        })
    return result


def _stale_message(report):
    if report is None:
        return None
    try:
        path = report / "STALE.txt"
        if path.is_file():
            text = path.read_text(encoding="utf-8-sig").strip()
            return text or None
    except OSError:
        pass
    return None


def _extended_review(config, view, report, metadata, review):
    value = dict(view)
    comparison = _comparison(report)
    value.update({
        "metadata": metadata,
        "intent": _text(review.get("intent")),
        "summary": _text(review.get("summary")),
        "findings": _finding_cards(review.get("findings")),
        "open_findings": _open_finding_cards(_open_findings(config, review, comparison, metadata)),
        "risks_to_verify": _strings(review.get("risks_to_verify")),
        "coverage_gaps": _strings(review.get("coverage_gaps")),
        "affected_flows": _strings(review.get("affected_flows")),
        "verification_plan": _strings(review.get("verification_plan")),
        "comparison": comparison,
        "posted_comments": _posted_comments(report),
        "existing_comment_checks": _comment_checks(review.get("existing_comment_checks")),
        "stale_message": _stale_message(report),
    })
    return value


def _posted_comments(report):
    """已提交到 PR 的审查意见（评论功能的状态回显）。"""
    data = _load_json(report / "comments.json") if report is not None else None
    entries = data.get("comments") if isinstance(data, dict) else None
    result = []
    for entry in entries if isinstance(entries, list) else []:
        if not isinstance(entry, dict):
            continue
        result.append({
            "finding": _text(entry.get("finding")),
            "title": _text(entry.get("title")),
            "path": _text(entry.get("path")),
            "line": _int(entry.get("line")),
            "position": _int(entry.get("position")),
            "inline": entry.get("inline") is True,
            "mode": _text(entry.get("mode")),
            "comment_id": _text(entry.get("comment_id")),
            "at": _text(entry.get("at")),
        })
    return result


def _open_findings(config, review, comparison, metadata=None):
    """上一轮未解决的意见；兼容旧报告（只有 comparison.json，没有 open_findings 字段）。"""
    direct = review.get("open_findings")
    if isinstance(direct, list) and direct:
        return direct
    if not isinstance(comparison, dict):
        return []
    previous_findings = []
    previous_report = comparison.get("previous_report")
    if previous_report:
        data = _load_json(Path(str(previous_report)) / "review.json")
        if isinstance(data, dict) and isinstance(data.get("review"), dict):
            items = data["review"].get("findings")
            previous_findings = items if isinstance(items, list) else []
    by_id = {}
    for index, finding in enumerate(previous_findings[:30], start=1):
        if isinstance(finding, dict):
            by_id[f"P{index}"] = finding
    merged_items = []
    for item in comparison.get("open") or []:
        if not isinstance(item, dict):
            continue
        base = dict(by_id.get(str(item.get("id"))) or {})
        merged_items.append({
            **base,
            "id": item.get("id"),
            "title": item.get("title") or base.get("title") or "",
            "severity": item.get("severity") or base.get("severity"),
            "evidence": item.get("evidence") or base.get("evidence") or [],
            "status": item.get("status"),
            "reason": item.get("reason"),
            "origin": "previous",
        })
    return _remap_evidence(config, merged_items, (metadata or {}).get("previous_head_sha"),
                           (metadata or {}).get("head_sha"))


def _remap_evidence(config, items, previous_head, head):
    """旧报告兼容：把上一版证据行同步到当前 head（新报告在生成时已同步）。"""
    if not previous_head or not head or previous_head == head:
        return items
    already = any(entry.get("previous_line") or entry.get("line_status")
                  for item in items if isinstance(item, dict)
                  for entry in (item.get("evidence") or []) if isinstance(entry, dict))
    if already:
        return items
    try:
        from .git import Git
        git = Git(config)
    except Exception:
        return items
    maps = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        for entry in item.get("evidence") or []:
            if not isinstance(entry, dict):
                continue
            path = entry.get("path")
            line = entry.get("line")
            if not isinstance(path, str) or not isinstance(line, int):
                continue
            if path not in maps:
                try:
                    maps[path] = git.line_map(previous_head, head, path)
                except Exception:
                    maps[path] = None
            mapper = maps[path]
            if mapper is None:
                continue
            try:
                new_line, status = mapper(line)
            except Exception:
                continue
            if status == "deleted":
                entry["line_status"] = "deleted"
                entry["previous_line"] = line
            elif status == "changed" or new_line != line:
                entry["previous_line"] = line
                entry["line"] = new_line
                entry["line_status"] = status
    return items


def _open_finding_cards(value):
    """上一轮仍未解决的问题：完整字段 + 复核状态，页面仍可勾选/提交评论。"""
    items = value if isinstance(value, list) else []
    cards = _finding_cards(items)
    for card, item in zip(cards, items):
        if not isinstance(item, dict):
            continue
        card["origin"] = "previous"
        card["status"] = _text(item.get("status"))
        card["reason"] = _text(item.get("reason"))
        card["previous_id"] = _text(item.get("id"))
    return cards


def _comparison(report):
    """与上一版审查的对比（已修复 / 仍存在 / 本轮新增），没有上一版时为 None。"""
    data = _load_json(report / "comparison.json") if report is not None else None
    if not isinstance(data, dict):
        return None
    items = data.get("items")
    new_findings = data.get("new")
    return {
        "previous_head_sha": _text(data.get("previous_head_sha")),
        "previous_report": _text(data.get("previous_report")),
        "previous_reviewed_at": _text(data.get("previous_reviewed_at")),
        "items": [_comparison_item(item) for item in items if isinstance(item, dict)]
        if isinstance(items, list) else [],
        "fixed": [_comparison_item(item) for item in data.get("fixed") or [] if isinstance(item, dict)],
        "open": [_comparison_item(item) for item in data.get("open") or [] if isinstance(item, dict)],
        "new": _finding_cards(new_findings if isinstance(new_findings, list) else []),
    }


def _comparison_item(item):
    evidence = item.get("evidence")
    return {
        "id": _text(item.get("id")),
        "title": _text(item.get("title")),
        "severity": _text(item.get("severity")),
        "status": _text(item.get("status")),
        "reason": _text(item.get("reason")),
        "evidence": [{"path": _text(entry.get("path")), "line": _int(entry.get("line")),
                      "reason": _text(entry.get("reason"))}
                     for entry in (evidence if isinstance(evidence, list) else [])
                     if isinstance(entry, dict)],
    }


def _changed_files(report):
    if report is None:
        return []
    data = _load_json(report / "review.json")
    metadata = data.get("metadata") if isinstance(data, dict) else None
    changed = metadata.get("changed_files") if isinstance(metadata, dict) else None
    if not changed:
        data = _load_json(report / "input.json")
        if isinstance(data, dict):
            metadata = data.get("metadata")
            if not isinstance(metadata, dict):
                metadata = data.get("job")
            changed = metadata.get("changed_files") if isinstance(metadata, dict) else None
            if not changed:
                changed = data.get("changed_files")
    if not isinstance(changed, list):
        return []
    return [item for item in changed if isinstance(item, str) and item]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _list_cache_path(config):
    """最近一次成功在线拉取的 PR 列表（网络抖动时整页不至于空白）。"""
    return config.repo_state / "review-list-cache.json"


def list_cache_time(config):
    data = read_json(_list_cache_path(config), {})
    if isinstance(data, dict) and isinstance(data.get("prs"), list):
        return data.get("generated_at")
    return None


def list_pulls(config, *, offline=False):
    """List open PRs (live) or cached PRs (offline/live failure) with review state."""
    generated_at = now()
    snapshot = _Snapshot(config)
    branches = _branches(config)
    source = "cache"
    source_error = None
    rows = None

    if not offline:
        try:
            pulls = create_api(config).pulls()
            if not isinstance(pulls, list):
                raise RuntimeError("Unexpected PR list response")
            rows = pulls
            source = "live"
        except Exception as exc:  # network/token/platform failures degrade to cache
            source_error = str(exc) or exc.__class__.__name__
            cached_list = read_json(_list_cache_path(config), {})
            cached_rows = cached_list.get("prs") if isinstance(cached_list, dict) else None
            if isinstance(cached_rows, list) and cached_rows:
                rows = cached_rows

    pulls = []
    if rows is not None:
        seen = set()
        for raw in rows:
            if not isinstance(raw, dict):
                continue
            number = _number(raw.get("number"))
            if number is None or number in seen:
                continue
            seen.add(number)
            review, _, _, _ = _review_view(config, number, snapshot)
            pulls.append(_pr_from_raw(number, raw, active=_is_active(raw, branches), review=review))
    else:
        for number in snapshot.numbers():
            raw = snapshot.cached_pr(number)
            if raw is None:
                raw = {"number": number}
            row = snapshot.prs.get(str(number))
            active = bool(row["active"]) if row is not None else _is_active(raw, branches)
            review, _, _, _ = _review_view(config, number, snapshot)
            pulls.append(_pr_from_raw(number, raw, active=active, review=review))

    pulls.sort(key=_sort_key, reverse=True)
    if source_error is None and source == "cache" and snapshot.error:
        source_error = snapshot.error

    statuses = [pr["review"]["status"] for pr in pulls]
    counts = {
        "total": len(pulls),
        "open": sum(1 for pr in pulls if _is_open(pr)),
        "reviewed": sum(1 for status in statuses if status == "current"),
        "stale": sum(1 for status in statuses if status == "stale"),
        "pending": sum(1 for status in statuses if status in {"queued", "running"}),
        "failed": sum(1 for status in statuses if status == "failed"),
    }
    return {
        "generated_at": generated_at,
        "repo": {
            "url": _repo_url(config),
            "id": _repo_id(config),
            "state_dir": str(_state_root(config)),
        },
        "branches": branches,
        "source": source,
        "source_error": source_error,
        "counts": counts,
        "prs": pulls,
    }


def show_pull(config, number, *, offline=False):
    """Show one PR with its review report details (live detail, cache fallback)."""
    number = _require_number(number)
    generated_at = now()
    snapshot = _Snapshot(config)
    branches = _branches(config)
    source = "cache"
    source_error = None
    raw = None

    if not offline:
        try:
            detail = create_api(config).pull(number)
            if not isinstance(detail, dict):
                raise RuntimeError("Unexpected PR detail response")
            raw = detail
            source = "live"
        except Exception as exc:  # live detail is best-effort
            source_error = str(exc) or exc.__class__.__name__

    cached = snapshot.cached_pr(number)
    if raw is None:
        raw = cached or {"number": number}
    raw = dict(raw)
    raw["number"] = number

    body = _text(raw.get("body")) or _text(raw.get("description"))
    if not body and isinstance(cached, dict):
        body = _text(cached.get("body")) or _text(cached.get("description"))

    row = snapshot.prs.get(str(number))
    if source == "live":
        active = _is_active(raw, branches)
    else:
        active = bool(row["active"]) if row is not None else _is_active(raw, branches)

    review, report, metadata, review_data = _review_view(config, number, snapshot)
    extended = _extended_review(config, review, report, metadata, review_data)

    artifact = _artifact_dir(config, number, report)
    if artifact is None:
        artifact = _job_report_path(config, snapshot.latest_job(number))
    changed = _changed_files(artifact)

    job = snapshot.latest_job(number)
    pr = _pr_from_raw(number, raw, active=active, review=review)
    pr["body"] = body
    return {
        "generated_at": generated_at,
        "source": source,
        "source_error": source_error,
        "pr": pr,
        "files": {"changed": changed, "source": "review" if changed else "none"},
        "review": extended,
        "job": {
            "status": _text(job.get("status")) if job is not None else None,
            "attempts": _int(job.get("attempts")) if job is not None else None,
            "error": _text(job.get("error")) if job is not None else None,
            "updated": _text(job.get("updated")) if job is not None else None,
        },
    }
