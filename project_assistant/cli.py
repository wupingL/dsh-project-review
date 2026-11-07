from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path
from .backends import backend_checks, model_destination
from .common import ROOT, Config, read_json, run
from .context import Context
from .feature import Features
from .gitcode import GitCode
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
            pr_list = GitCode(config).pulls()
            checks["gitcode_read"] = True
            checks["open_prs"] = len(pr_list)
        except Exception as exc:
            checks["gitcode_read"] = False
            errors["gitcode_read"] = str(exc)
    return {"ready": all(v is not False for v in checks.values()), "checks": checks,
            "errors": errors, "model": model_destination(config)}


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Shared project knowledge and system-level review")
    parser.add_argument("--config", default=str(ROOT / "config/recsdk.json"))
    commands = parser.add_subparsers(dest="command", required=True)
    health = commands.add_parser("doctor")
    health.add_argument("--network", action="store_true")
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
    replay = review.add_parser("replay")
    replay.add_argument("--branch", required=True)
    replay.add_argument("--commit", required=True)
    replay.add_argument("--structural-only", action="store_true")
    watch = review.add_parser("watch")
    watch.add_argument("--once", action="store_true")
    review.add_parser("status")
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
        config = Config(args.config)
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
            reviews = Reviews(config)
            if args.action == "status":
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
                        result = reviews.process_one(job["fingerprint"])
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
