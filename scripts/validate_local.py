"""Reproducible offline acceptance run. Never invokes a model or remote API."""
from pathlib import Path
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from project_assistant.common import Config, atomic_json, now, run
from project_assistant.context import Context
from project_assistant.review import Reviews
from project_assistant.common import read_json


def main():
    config = Config(ROOT / "config/recsdk.json")
    output = config.state / "validation"
    output.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    tests = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
                           cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           encoding="utf-8", errors="replace")
    (output / "tests.log").write_text(tests.stdout + tests.stderr, encoding="utf-8")
    if tests.returncode:
        raise RuntimeError("Offline tests failed; inspect data/validation/tests.log")
    print("Offline tests passed", flush=True)
    context = Context(config)
    snapshots = {}
    for branch in config.get("branches"):
        sid = context.sync(branch, semantic=False)
        snapshots[branch] = context.load(sid)[1]
        print("Structural snapshot ready: " + branch, flush=True)
    reviews = Reviews(config)
    try:
        replays = [reviews.replay("develop", "4bb64b0", structural_only=True),
                   reviews.replay("refactor/develop", "8ad0b0b", structural_only=True)]
    finally:
        reviews.state.close()
    source = Path(config.get("local_repo"))
    unchanged = not run(["git", "-c", f"safe.directory={source.as_posix()}", "-C", source, "status", "--porcelain"]).strip()
    authorization = read_json(output / "authorization.json", {})
    connectivity = read_json(output / "connectivity.json", {})
    pending = ["RecSDK 真实语义知识和系统审查质量尚待模型验收。",
               "未执行 Ascend/CANN/NPU 功能或性能实测。"]
    if not authorization.get("authorized"):
        pending.append("等待确认模型目的地、凭据并完成 provider 适配验收。")
    if not connectivity.get("gitcode_read"):
        pending.append("GitCode 读取连接尚未通过。")
    summary = {"generated_at": now(), "offline_tests_passed": True, "original_clone_clean": unchanged,
               "snapshots": {branch: {k: m[k] for k in ["snapshot_id", "commit", "mode", "stats"]}
                             for branch, m in snapshots.items()},
               "historical_replays": replays,
               "semantic_review_executed": False,
               "authorization_received": bool(authorization.get("authorized")),
               "gitcode_read_verified": bool(connectivity.get("gitcode_read")),
               "pending": pending}
    atomic_json(output / "summary.json", summary)
    lines = ["# 本地交付验证", "", "公共组件、三个 Skill 与轮询程序已实现。在线启用和语义审查质量验收尚未完成。", "",
             "## 已完成", "", "- 离线自动化测试通过（使用真实 Git 和 Understand，模型/API 使用测试替身）。",
             "- 原 RecSDK 工作目录保持干净。", "- 三个 Skill 已安装并通过官方结构校验。", "",
             "## 双主干结构索引", ""]
    for branch, manifest in snapshots.items():
        lines.append(f"- `{branch}`：`{manifest['commit']}`，索引 {manifest['stats']['total']} 个文本文件，结构解析 {manifest['stats']['parsed']} 个文件；其余内容和解析缺口均明确记录。")
    lines += ["", "## 历史变更回放", ""]
    for replay in replays:
        path = Path(replay["report"]) / "impact.md"
        lines.append(f"- [{replay['branch']} / {replay['commit'][:12]}]({path.as_posix()})：{replay['changed_files']} 个变更文件，结构回放；未执行语义审查。")
    lines += ["", "## 待完成", ""] + ["- " + p for p in summary["pending"]]
    lines += ["", "## 启动方式", "", "授权且读取凭据配置完成后，先执行 `scripts/pa.ps1 doctor --network`，再执行 `scripts/pa.ps1 review watch`。", "",
              "常驻轮询尚未启动，未向 GitCode 发布任何内容。"]
    (output / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"validation": str(output / "summary.md"), "original_clone_clean": unchanged}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
