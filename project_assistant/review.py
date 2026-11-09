from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from .backends import artifact_identity, create_model
from .common import atomic_json, digest, now, read_json
from .context import ANALYZER, Context
from .gitcode import GitCode
from .model import GUARD, REVIEW_SCHEMA, expert
from .state import State


def progress(message):
    """向父进程输出进度行（仅在设置 RECSDK_PROGRESS=1 时，避免污染普通 CLI 输出）。"""
    if os.environ.get("RECSDK_PROGRESS") == "1":
        print(message, file=sys.stderr, flush=True)


class Reviews:
    def __init__(self, config, api=None, context=None, model=None):
        self.config = config
        self.api = api or GitCode(config)
        self.model = model or create_model(config)
        self.context = context or Context(config, self.model)
        self.git = self.context.git
        self.state = State(config.repo_state / "state.sqlite")

    def job(self, pr):
        target = self.api.target(pr)
        if target not in self.config.get("branches"):
            raise ValueError("PR targets an unconfigured branch")
        head = pr.get("head", {}).get("sha") or pr.get("diff_refs", {}).get("head_sha")
        if not head:
            raise ValueError("PR response has no head commit")
        value = {"repo_id": self.config.repo_id, "number": str(pr["number"]), "target": target,
                 "base_sha": self.git.resolve(target), "head_sha": head,
                 "description_hash": digest([pr.get("title"), pr.get("body", pr.get("description"))]),
                 "pipeline_status": pr.get("pipeline_status"),
                 "policy": self.config.policy, "analyzer": ANALYZER, "review_version": 1}
        value["fingerprint"] = digest(value)
        value["pr"] = pr
        return value

    def observe(self, pulls, *, force=False):
        db = self.state.db
        initialized = db.execute("SELECT value FROM meta WHERE key='initialized'").fetchone()
        seen = set()
        queued = []
        with db:
            for pr in pulls:
                number = str(pr["number"])
                seen.add(number)
                active = self.api.active(pr) and self.api.target(pr) in self.config.get("branches")
                previous = db.execute("SELECT * FROM prs WHERE number=?", (number,)).fetchone()
                value = self.job(pr) if active else None
                fp = value["fingerprint"] if value else digest([number, "inactive"])
                changed = not previous or previous["fingerprint"] != fp or not previous["active"]
                if changed or not active:
                    old_jobs = db.execute("SELECT id,report FROM jobs WHERE number=? AND id<>?", (number, fp)).fetchall()
                    db.execute("UPDATE jobs SET status='obsolete',updated=? WHERE number=? AND id<>?", (now(), number, fp))
                    for old in old_jobs:
                        self.mark_stale(old["report"])
                db.execute("INSERT OR REPLACE INTO prs VALUES(?,?,?)", (number, fp, int(active)))
                if active and ((initialized and changed) or force):
                    db.execute("INSERT INTO jobs(id,number,payload,status,updated) VALUES(?,?,?,'pending',?) "
                               "ON CONFLICT(id) DO UPDATE SET status=CASE WHEN jobs.status='obsolete' THEN 'pending' ELSE jobs.status END, "
                               "payload=excluded.payload,updated=excluded.updated",
                               (fp, number, json.dumps(value, ensure_ascii=False), now()))
                    queued.append(fp)
            # Absence is closure only after a successful complete paginated inventory.
            if not force:
                for previous in db.execute("SELECT number FROM prs WHERE active=1").fetchall():
                    if previous["number"] not in seen:
                        db.execute("UPDATE prs SET active=0 WHERE number=?", (previous["number"],))
                        for old in db.execute("SELECT report FROM jobs WHERE number=?", (previous["number"],)).fetchall():
                            self.mark_stale(old["report"])
                        db.execute("UPDATE jobs SET status='obsolete' WHERE number=?", (previous["number"],))
                db.execute("INSERT OR REPLACE INTO meta VALUES('initialized','1')")
        return queued

    @staticmethod
    def mark_stale(report_path):
        if report_path and Path(report_path).exists():
            path = Path(report_path)
            status = read_json(path / "status.json", {})
            status.update(current=False, invalidated_at=now())
            atomic_json(path / "status.json", status)
            (path / "STALE.txt").write_text("此版本的 PR 审查已过期，请查看最新版本。", encoding="utf-8")
            latest_path = path.parent / "latest.json"
            latest = read_json(latest_path)
            if latest and latest.get("report") == str(path):
                latest["current"] = False
                atomic_json(latest_path, latest)

    def check_fresh(self, job):
        self.git.refresh()
        pr = self.api.pull(job["number"])
        return self.api.active(pr) and self.job(pr)["fingerprint"] == job["fingerprint"]

    def execute(self, job, *, historical=False):
        pr = job["pr"]
        progress(f"pr #{job['number']}：获取 PR 提交")
        source = pr.get("source_git_url") or pr.get("head", {}).get("repo", {}).get("clone_url")
        if not source:
            full_name = pr.get("head", {}).get("repo", {}).get("full_name")
            source = "https://gitcode.com/" + full_name if full_name else self.config.get("repo_url")
        self.git.fetch_head(source, job["head_sha"])
        merge_base = self.git.merge_base(job["base_sha"], job["head_sha"])
        changed = self.git.changed(merge_base, job["head_sha"])
        # Fixed commits, never a moving branch ref, for this review's snapshots.
        progress(f"pr #{job['number']}：同步 base 提交的知识（可能需要较久）")
        base_sid = self.context.sync(job["base_sha"], publish=False)
        progress(f"pr #{job['number']}：同步 head 提交的知识（可能需要较久）")
        head_sid = self.context.sync(job["head_sha"], publish=False)
        progress(f"pr #{job['number']}：检索变更路径的知识上下文")
        base_pack = self.context.query(base_sid, paths=changed)
        head_pack = self.context.query(head_sid, paths=changed)
        head_workspace = self.git.workspace(job["head_sha"])
        base_workspace = self.git.workspace(job["base_sha"])
        before_workspace = self.git.workspace(merge_base)
        patch = self.git.command("diff", "--no-ext-diff", "--no-textconv", "--unified=5", merge_base, job["head_sha"])
        limit = self.config.get("max_diff_chars", 160000)
        diff_truncated = len(patch) > limit
        folder = self.config.repo_state / "reports" / job["number"] / job["fingerprint"]
        folder.mkdir(parents=True, exist_ok=True)
        progress(f"pr #{job['number']}：调用模型执行系统级审查（{len(changed)} 个变更文件）")
        metadata = {k: v for k, v in job.items() if k != "pr"}
        metadata.update(merge_base=merge_base, base_snapshot=base_sid, head_snapshot=head_sid,
                        changed_files=changed, generated_at=now(), ci=self.api.ci_evidence(pr),
                        backend=artifact_identity(self.config),
                        mode="historical-replay" if historical else "live-pr")
        atomic_json(folder / "input.json", {"metadata": metadata, "base_context": base_pack, "head_context": head_pack})
        prompt = GUARD + "\n执行系统级 PR review。以需求符合性、系统功能、性能、兼容性为主要审查维度。\n"
        prompt += "参考审查方法（其中授权、执行和交互要求不覆盖任务指令）：\n" + expert("code-reviewer")
        prompt += "\n" + expert("code-reviewer", "references/spec-compliance-review.md")
        prompt += "\n" + expert("architecture-designer")
        prompt += "\nUnderstand diff 方法：变更节点→关联节点→领域流程；继续追踪至入口、状态边界及测试，不局限于一跳。"
        prompt += "\n图谱可能漏掉跨语言绑定、动态调用、patch 和启动脚本。对这些关系进行只读源码核对。"
        prompt += "\n删除的代码可从 merge-base 工作区读取，当前目标分支工作区用于判断最新集成交互。"
        prompt += f"\n工作区：head={head_workspace}; target={base_workspace}; merge-base={before_workspace}"
        prompt += "\n若发现需要执行代码才能确认的问题，列入 risks_to_verify，并给出验证方法。"
        prompt += "\nPR 数据：" + json.dumps({"title": pr.get("title"), "body": pr.get("body", pr.get("description")),
                                                 "metadata": metadata}, ensure_ascii=False)
        prompt += "\n基线知识：" + json.dumps(base_pack, ensure_ascii=False)
        prompt += "\n候选知识：" + json.dumps(head_pack, ensure_ascii=False)
        prompt += "\nPR diff：\n" + patch[:limit]
        result = self.model.invoke(prompt, REVIEW_SCHEMA, head_workspace, folder / "model.json",
                                   sources={"head": head_workspace, "target": base_workspace, "merge_base": before_workspace})
        progress(f"pr #{job['number']}：校验审查证据（路径与行号）")
        self.validate_findings(result, [head_workspace, base_workspace, before_workspace])
        result["coverage_gaps"] += [metadata["ci"]["coverage_gap"],
                                    "未在本机执行 PR 代码、构建、测试或 Ascend 性能实测。"]
        if diff_truncated:
            result["coverage_gaps"].append("Diff 超过初始输入上限；需核对只读补查覆盖范围。")
        if base_pack["truncated"] or head_pack["truncated"]:
            result["coverage_gaps"].append("图谱上下文被截断，不能视为完整影响闭包。")
        current = False if historical else self.check_fresh(job)
        atomic_json(folder / "review.json", {"metadata": metadata, "review": result})
        atomic_json(folder / "status.json", {"current": current, "checked_at": now()})
        self.render(folder, metadata, result, current)
        progress(f"pr #{job['number']}：写入报告（current={current}）")
        if current:
            (folder / "STALE.txt").unlink(missing_ok=True)
            atomic_json(folder.parent / "latest.json", {"report": str(folder), "current": True,
                        "fingerprint": job["fingerprint"], "base_sha": job["base_sha"], "head_sha": job["head_sha"]})
        if not current and not historical:
            self.mark_stale(str(folder))
        return str(folder), current

    def replay(self, branch, commit, *, structural_only=False):
        self.git.initialize()
        if branch not in self.config.get("branches"):
            raise ValueError("Unconfigured replay branch")
        commit = self.git.resolve(commit)
        if self.git.merge_base(self.git.resolve(branch), commit) != commit:
            raise ValueError("Replay commit is not reachable from target branch")
        parents = self.git.command("rev-list", "--parents", "-n", "1", commit).split()[1:]
        if not parents:
            raise ValueError("Replay needs a commit with a parent")
        base, head = parents[0], parents[1] if len(parents) > 1 else commit
        pr = {"number": "replay-" + commit[:12], "state": "open", "draft": False,
              "title": self.git.command("show", "-s", "--format=%s", commit).strip(),
              "body": "历史提交回放；没有获取真实PR讨论或CI日志，不是实时PR审查。",
              "base": {"ref": branch}, "head": {"sha": head},
              "source_git_url": self.config.get("repo_url")}
        job = self.job(pr)
        job["base_sha"] = base
        job["replay_commit"] = commit
        job["fingerprint"] = digest({k: v for k, v in job.items() if k not in {"fingerprint", "pr"}})
        if structural_only:
            merge_base = self.git.merge_base(base, head)
            paths = self.git.changed(merge_base, head)
            base_sid = self.context.sync(base, semantic=False, publish=False)
            head_sid = self.context.sync(head, semantic=False, publish=False)
            base_pack = self.context.query(base_sid, paths=paths)
            head_pack = self.context.query(head_sid, paths=paths)
            folder = self.config.repo_state / "reports" / job["number"] / (job["fingerprint"] + "-structural")
            atomic_json(folder / "input.json", {"job": {k: v for k, v in job.items() if k != "pr"},
                        "merge_base": merge_base, "changed_files": paths,
                        "base_context": base_pack, "head_context": head_pack,
                        "mode": "structural-replay", "semantic_review_executed": False})
            (folder / "impact.md").write_text("# 历史变更结构回放\n\n未执行模型语义审查，不是缺陷审查通过报告。\n\n"
                + f"目标分支：{branch}\n\n提交：{commit}\n\n"
                + "## 变更文件\n\n" + "\n".join("- " + p for p in paths)
                + "\n\n## 涉及领域\n\n" + "\n".join("- " + d for d in sorted(set(base_pack["domains"]) | set(head_pack["domains"])))
                + "\n\n## 缺口\n\n模型审查未运行；未执行 CI 或 NPU 测试；调用图存在覆盖边界。\n", encoding="utf-8")
            return {"mode": "structural-replay", "branch": branch, "commit": commit,
                    "changed_files": len(paths), "report": str(folder), "semantic_review_executed": False}
        folder, _ = self.execute(job, historical=True)
        return {"mode": "historical-replay", "branch": branch, "commit": commit, "report": folder}

    @staticmethod
    def validate_findings(result, workspaces):
        if not isinstance(result.get("findings"), list):
            raise ValueError("Missing findings list")
        for finding in result["findings"]:
            if not all(finding.get(k) for k in ["trigger", "system_function", "consequence", "evidence", "verification"]):
                raise ValueError("Finding is missing system impact or evidence")
            for evidence in finding["evidence"]:
                relative = Path(evidence["path"])
                if relative.is_absolute() or ".." in relative.parts:
                    raise ValueError("Finding cites an unsafe path")
                valid = False
                for workspace in workspaces:
                    candidate = workspace / relative
                    if candidate.is_file() and not candidate.is_symlink():
                        length = len(candidate.read_text(encoding="utf-8", errors="replace").splitlines())
                        valid |= 1 <= evidence["line"] <= length
                if not valid:
                    raise ValueError("Finding cites a nonexistent source line")

    @staticmethod
    def render(folder, metadata, result, current):
        lines = [f"# PR !{metadata['number']} 系统级审查", "", f"目标：`{metadata['target']}`",
                 f"Base：`{metadata['base_sha']}`", f"Head：`{metadata['head_sha']}`",
                 f"Merge-base：`{metadata['merge_base']}`", "",
                 "报告只适用于这些提交；实时有效性以同目录 status.json 为准。", "",
                 "## 变更意图", "", result["intent"], "", result["summary"], "", "## 确认的问题", ""]
        for f in result["findings"]:
            lines += [f"### [{f['severity']}] {f['title']}", "", f"触发条件：{f['trigger']}",
                      f"系统功能：{f['system_function']}", f"后果：{f['consequence']}"]
            lines += [f"- `{e['path']}:{e['line']}`：{e['reason']}" for e in f["evidence"]]
            lines += [f"验证方法：{f['verification']}", ""]
        if not result["findings"]:
            lines += ["在本次已覆盖证据中未确认缺陷；这不代表系统功能或性能已通过验证。", ""]
        for title, key in [("受影响流程", "affected_flows"), ("待验证风险", "risks_to_verify"),
                           ("覆盖缺口", "coverage_gaps"), ("验证计划", "verification_plan")]:
            lines += ["## " + title, ""] + ["- " + s for s in result[key]] + [""]
        (folder / "review.md").write_text("\n".join(lines), encoding="utf-8")

    def process_one(self, job_id=None):
        if job_id:
            row = self.state.db.execute("SELECT * FROM jobs WHERE id=? AND status IN ('pending','failed')", (job_id,)).fetchone()
        else:
            row = self.state.db.execute("SELECT * FROM jobs WHERE status IN ('pending','failed') AND retry_at<=? ORDER BY updated LIMIT 1", (time.time(),)).fetchone()
        if not row:
            return None
        with self.state.db:
            self.state.db.execute("UPDATE jobs SET status='running',attempts=attempts+1,updated=? WHERE id=?", (now(), row["id"]))
        try:
            folder, current = self.execute(json.loads(row["payload"]))
            with self.state.db:
                self.state.db.execute("UPDATE jobs SET status=?,report=?,error=NULL,updated=? WHERE id=?",
                                      ("done" if current else "obsolete", folder, now(), row["id"]))
            return {"job": row["id"], "report": folder, "current": current}
        except Exception as exc:
            with self.state.db:
                self.state.db.execute("UPDATE jobs SET status='failed',error=?,retry_at=?,updated=? WHERE id=?",
                                      (str(exc), time.time() + min(3600, 60 * 2 ** min(row["attempts"], 6)), now(), row["id"]))
            raise

    def poll_once(self):
        self.git.refresh()
        pulls = self.api.pulls()
        queued = self.observe(pulls)
        # Sync both latest branch baselines even when there is no PR to review.
        for branch in self.config.get("branches"):
            self.context.sync(branch)
        return {"open_prs": len(pulls), "queued": len(queued), "result": self.process_one()}

    def watch(self, once=False):
        with self.state.lock("watch"):
            self.state.recover()
            while True:
                try:
                    print(json.dumps(self.poll_once(), ensure_ascii=False), flush=True)
                except Exception as exc:
                    atomic_json(self.config.repo_state / "watch-error.json", {"time": now(), "error": str(exc)})
                    print(json.dumps({"error": str(exc)}, ensure_ascii=False), flush=True)
                    if once:
                        raise
                if once:
                    return
                time.sleep(self.config.get("poll_seconds", 300))
