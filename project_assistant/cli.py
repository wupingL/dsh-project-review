from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path
from .backends import backend_checks, model_destination
from .comments import post_findings
from .common import ROOT, Config, read_json, run
from .context import Context
from .feature import Features
from .gitcode import GitCode
from .inspect import list_pulls, show_pull
from .platforms import create_api
from .projects import (import_project, knowledge_status, list_projects, model_apply,
                       model_set, model_set_credential, model_show, model_test, probe,
                       project_branches, remove_project, resolve_config, sync_knowledge)
from .review import Reviews


def doctor(config, network=False):
    checks = {}
    for executable in ["git", "node"]:
        checks[executable] = shutil.which(executable) is not None
    core = ROOT / "vendor/understand-anything/understand-anything-plugin/packages/core/dist/index.js"
    checks["understand_core"] = core.is_file()
    checks["expert_skills"] = all((ROOT / "vendor/claude-skills/skills" / s / "SKILL.md").is_file()
                                   for s in ["spec-miner", "architecture-designer", "code-reviewer"])
    errors = {}
    locked = read_json(ROOT / "dependencies.lock.json")
    for name, directory in [("understand", "understand-anything"), ("experts", "claude-skills")]:
        checkout = ROOT / "vendor" / directory
        try:
            actual = run(["git", "-c", "safe.directory=" + checkout.as_posix(), "-C", checkout, "rev-parse", "HEAD"]).strip()
            dirty = run(["git", "-c", "safe.directory=" + checkout.as_posix(), "-C", checkout, "status", "--porcelain", "--untracked-files=no"]).strip()
            checks[name + "_pinned"] = actual == locked[name]["commit"] and not dirty
        except Exception:
            checks[name + "_pinned"] = False
    backend = backend_checks(config, network=network)
    checks.update(backend["checks"])
    errors.update(backend["errors"])
    if network:
        try:
            pr_list = create_api(config).pulls()
            checks["repo_read"] = True
            checks["open_prs"] = len(pr_list)
        except Exception as exc:
            checks["repo_read"] = False
            errors["repo_read"] = str(exc)
    return {"ready": all(v is not False for v in checks.values()), "checks": checks,
            "errors": errors, "model": model_destination(config)}


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Shared project knowledge and system-level review")
    parser.add_argument("--config", default=str(ROOT / "config/recsdk.json"))
    parser.add_argument("--project", help="注册表里的项目 id；优先于 --config")
    commands = parser.add_subparsers(dest="command", required=True)
    health = commands.add_parser("doctor")
    health.add_argument("--network", action="store_true")
    project = commands.add_parser("project").add_subparsers(dest="action", required=True)
    project.add_parser("list")
    probe_cmd = project.add_parser("probe")
    probe_cmd.add_argument("--url", required=True)
    probe_cmd.add_argument("--local")
    import_cmd = project.add_parser("import")
    import_cmd.add_argument("--name")
    import_cmd.add_argument("--url", required=True)
    import_cmd.add_argument("--local", required=True,
                            help="本地源码路径；不存在时会把仓库克隆到该目录")
    import_cmd.add_argument("--branches", default="")
    remove_cmd = project.add_parser("remove")
    remove_cmd.add_argument("--id", required=True)
    remove_cmd.add_argument("--purge", action="store_true",
                            help="同时删除控制器侧状态（镜像/快照/报告/worktrees），不删本地 clone")
    branches_cmd = project.add_parser("branches")
    branches_cmd.add_argument("--id", required=True)
    branches_cmd.add_argument("--refresh", action="store_true")
    knowledge = commands.add_parser("knowledge").add_subparsers(dest="action", required=True)
    kstatus = knowledge.add_parser("status")
    kstatus.add_argument("--id", required=True)
    kstatus.add_argument("--ref", required=True)
    kstatus.add_argument("--refresh", action="store_true")
    ksync = knowledge.add_parser("sync")
    ksync.add_argument("--id", required=True)
    ksync.add_argument("--ref", required=True)
    ksync.add_argument("--structural", action="store_true")
    ksync.add_argument("--fetch", action="store_true")
    model = commands.add_parser("model").add_subparsers(dest="action", required=True)
    mshow = model.add_parser("show")
    mshow.add_argument("--id", required=True)
    mset = model.add_parser("set")
    mset.add_argument("--id", required=True)
    mset.add_argument("--provider", required=True, choices=["deepseek", "codex"])
    mset.add_argument("--model", required=True)
    mset.add_argument("--base-url")
    mset.add_argument("--endpoint-id")
    mset.add_argument("--protocol")
    mset.add_argument("--credential-env")
    mset.add_argument("--credential-file")
    mcred = model.add_parser("credential")
    mcred.add_argument("--id", required=True)
    mcred.add_argument("--key-stdin", action="store_true",
                       help="从标准输入读取 API Key（避免出现在进程参数里）")
    mcred.add_argument("--clear", action="store_true")
    mapply = model.add_parser("apply")
    mapply.add_argument("--id", required=True)
    mapply.add_argument("--provider", required=True, choices=["deepseek", "codex"])
    mapply.add_argument("--model", required=True)
    mapply.add_argument("--base-url")
    mapply.add_argument("--endpoint-id")
    mapply.add_argument("--credential-env")
    mapply.add_argument("--key-stdin", action="store_true")
    mtest = model.add_parser("test")
    mtest.add_argument("--id", required=True)
    context = commands.add_parser("context").add_subparsers(dest="action", required=True)
    sync = context.add_parser("sync")
    sync.add_argument("--ref", required=True)
    sync.add_argument("--fetch", action="store_true")
    sync.add_argument("--structural-only", action="store_true")
    query = context.add_parser("query")
    query.add_argument("--snapshot")
    query.add_argument("--ref")
    query.add_argument("--query", default="")
    query.add_argument("--path", action="append", default=[])
    review = commands.add_parser("review").add_subparsers(dest="action", required=True)
    once = review.add_parser("run")
    once.add_argument("--pr", type=int, required=True)
    once.add_argument("--mode", choices=["auto", "deep"], default="auto",
                      help="auto：可快速时跳过 head 语义分析；deep：强制完整语义知识")
    replay = review.add_parser("replay")
    replay.add_argument("--branch", required=True)
    replay.add_argument("--commit", required=True)
    replay.add_argument("--structural-only", action="store_true")
    watch = review.add_parser("watch")
    watch.add_argument("--once", action="store_true")
    listing = review.add_parser("list")
    listing.add_argument("--offline", action="store_true")
    show = review.add_parser("show")
    show.add_argument("--pr", type=int, required=True)
    show.add_argument("--offline", action="store_true")
    review.add_parser("status")
    recover = review.add_parser("recover")
    recover.add_argument("--fail-running", action="store_true",
                         help="把遗留的 running 任务标记为已中断（插件启动时使用）")
    comment = review.add_parser("comment")
    comment.add_argument("--pr", type=int, required=True)
    comment.add_argument("--finding", action="append", required=True,
                         help="报告中的意见编号（F1、F2…），可重复")
    comment.add_argument("--mode", choices=["issue", "suggestion", "question"], default="issue",
                         help="评论口径：问题/建议/疑问")
    comment.add_argument("--confirm", action="store_true",
                         help="真正提交到 PR；默认只预览（dry-run）")
    comment.add_argument("--force", action="store_true", help="允许重复提交已评论过的意见")
    feature = commands.add_parser("feature").add_subparsers(dest="action", required=True)
    design = feature.add_parser("design")
    design.add_argument("--branch", required=True)
    design.add_argument("--request", required=True)
    design.add_argument("--fetch", action="store_true")
    for name in ["implement", "verify", "status"]:
        phase = feature.add_parser(name)
        phase.add_argument("--task", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "project":
            if args.action == "list":
                result = list_projects()
            elif args.action == "probe":
                result = probe(args.url, args.local)
            elif args.action == "import":
                selected = [branch.strip() for branch in (args.branches or "").split(",") if branch.strip()]
                result = import_project(args.name, args.url, args.local, selected)
            elif args.action == "remove":
                result = remove_project(args.id, purge=args.purge)
            else:
                result = project_branches(args.id, refresh=args.refresh)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        if args.command == "knowledge":
            if args.action == "status":
                result = knowledge_status(args.id, args.ref, refresh=args.refresh)
            else:
                result = sync_knowledge(args.id, args.ref,
                                        mode="structural" if args.structural else "semantic",
                                        fetch=args.fetch,
                                        progress=lambda kind, message: print(message, file=sys.stderr, flush=True))
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        if args.command == "model":
            if args.action == "show":
                result = model_show(args.id)
            elif args.action == "credential":
                secret = None
                if args.key_stdin and not args.clear:
                    secret = sys.stdin.readline().strip()
                result = model_set_credential(args.id, api_key=secret, clear=args.clear)
            elif args.action == "apply":
                secret = sys.stdin.readline().strip() if args.key_stdin else None
                result = model_apply(args.id, provider=args.provider, model=args.model,
                                     base_url=args.base_url, endpoint_id=args.endpoint_id,
                                     credential_env=args.credential_env, api_key=secret)
            elif args.action == "test":
                result = model_test(args.id)
            else:
                result = model_set(args.id, provider=args.provider, model=args.model,
                                   base_url=args.base_url, endpoint_id=args.endpoint_id,
                                   protocol=args.protocol, credential_env=args.credential_env,
                                   credential_file=args.credential_file)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        config = resolve_config(args.config, args.project)[0]
        if args.command == "doctor":
            result = doctor(config, args.network)
        elif args.command == "context":
            ctx = Context(config)
            if args.action == "sync":
                sid = ctx.sync(args.ref, fetch=args.fetch, semantic=not args.structural_only)
                folder, manifest = ctx.load(sid)
                result = {k: manifest[k] for k in ["snapshot_id", "commit", "mode", "status", "stats", "refreshed_domains"]}
                result.update(manifest=str(folder / "manifest.json"), gap_count=len(manifest["gaps"]),
                              changed_file_count=len(manifest["changed_files"]))
            else:
                sid = args.snapshot or ctx.latest(args.ref) or ctx.latest(args.ref, False)
                if not sid:
                    raise ValueError("No snapshot for this ref; run context sync first")
                result = ctx.query(sid, args.query, args.path)
        elif args.command == "review":
            if args.action == "list":
                result = list_pulls(config, offline=args.offline)
            elif args.action == "show":
                result = show_pull(config, args.pr, offline=args.offline)
            elif args.action == "comment":
                result = post_findings(config, args.pr, args.finding, mode=args.mode,
                                       dry_run=not args.confirm, force=args.force)
            else:
                reviews = Reviews(config)
                if args.action == "recover":
                    # 只有没有别的控制器进程持有队列锁时才能动 running 行。
                    skipped = False
                    try:
                        with reviews.state.lock("watch"):
                            count = (reviews.state.interrupt_running(
                                "审查进程已中断（控制器或 Harness 重启后未恢复），请重新开始审查。")
                                if args.fail_running else reviews.state.recover())
                    except OSError:
                        skipped, count = True, 0
                    result = {"recovered": count, "skipped": skipped}
                elif args.action == "status":
                    result = [dict(r) for r in reviews.state.db.execute("SELECT id,number,status,attempts,error,report FROM jobs ORDER BY updated DESC")]
                else:
                    health = doctor(config, network=args.action != "replay")
                    if args.action == "replay" and args.structural_only:
                        health["ready"] = health["checks"]["understand_core"] and health["checks"]["git"] and health["checks"]["node"]
                    if not health["ready"]:
                        print(json.dumps(health, ensure_ascii=False, indent=2))
                        return 2
                    if args.action == "watch":
                        reviews.watch(args.once)
                        return 0
                    if args.action == "replay":
                        result = reviews.replay(args.branch, args.commit, structural_only=args.structural_only)
                        print(json.dumps(result, ensure_ascii=False, indent=2))
                        return 0
                    with reviews.state.lock("watch"):
                        reviews.state.recover()
                        reviews.git.refresh()
                        pr = reviews.api.pull(args.pr)
                        if not reviews.api.active(pr):
                            raise ValueError("PR must be open and not draft")
                        reviews.observe([pr], force=True)
                        job = reviews.job(pr)
                        row = reviews.state.db.execute("SELECT status,report FROM jobs WHERE id=?", (job["fingerprint"],)).fetchone()
                        if row["status"] == "done":
                            result = {"report": row["report"], "reused": True}
                        else:
                            # Explicit run selects this PR, not a different queued job.
                            result = reviews.process_one(job["fingerprint"], mode=args.mode)
        else:
            features = Features(config)
            if args.action == "design":
                if args.fetch:
                    features.git.refresh()
                result = features.design(args.branch, args.request)
            elif args.action == "status":
                result = features.load(args.task)[1]
            else:
                result = getattr(features, args.action)(args.task)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if isinstance(result, dict) and result.get("ready") is False else 0
    except (Exception, KeyboardInterrupt) as exc:
        print(json.dumps({"error": str(exc) or "Interrupted"}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
