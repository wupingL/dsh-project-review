"""Optional live model acceptance using ONLY newly authored synthetic source.

No RecSDK config, source, snapshots or PR data are used. No remote Git/API calls.
"""
from pathlib import Path
import json
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from project_assistant.common import Config, atomic_json, now, run
from project_assistant.common import read_json
from project_assistant.backends import model_destination
from project_assistant.context import Context
from project_assistant.review import Reviews


def main():
    output = ROOT / "data/validation"
    output.mkdir(parents=True, exist_ok=True)
    source = output / ("synthetic-source-" + uuid.uuid4().hex[:8])
    source.mkdir()
    def git(*args):
        return run(["git", "-C", source, *args])
    git("init", "-b", "develop")
    git("config", "user.name", "Synthetic Fixture")
    git("config", "user.email", "fixture@example.invalid")
    git("remote", "add", "origin", "https://example.invalid/synthetic/checkpoint-demo")
    (source / "README.md").write_text("""# Synthetic training demo (newly authored test source)
Requirements: restoring a training checkpoint must restore both global_step and
optimizer_step. Learning-rate scheduling consumes global_step, so resetting it
while preserving optimizer state changes resumed training semantics.
For B=32, sending N items must perform at most ceil(N/B) rpc invocations. Keep
batching; one call per item violates the invocation budget even when outputs match.
""", encoding="utf-8")
    (source / "checkpoint.py").write_text("""def restore(checkpoint):
    return {"global_step": checkpoint["global_step"],
            "optimizer_step": checkpoint["optimizer_step"]}

def learning_rate(state):
    return 0.01 / (1 + state["global_step"])
""", encoding="utf-8")
    (source / "pipeline.py").write_text("""def send_items(items, rpc, batch_size=32):
    for start in range(0, len(items), batch_size):
        rpc(items[start:start + batch_size])
""", encoding="utf-8")
    git("add", ".")
    git("commit", "-m", "synthetic baseline")
    base = git("rev-parse", "HEAD").strip()
    git("checkout", "-b", "candidate")
    (source / "checkpoint.py").write_text("""def restore(checkpoint):
    return {"global_step": 0,
            "optimizer_step": checkpoint["optimizer_step"]}

def learning_rate(state):
    return 0.01 / (1 + state["global_step"])
""", encoding="utf-8")
    (source / "pipeline.py").write_text("""def send_items(items, rpc, batch_size=32):
    for item in items:
        rpc([item])
""", encoding="utf-8")
    git("add", ".")
    git("commit", "-m", "synthetic regression: reset scheduler step and remove batching")
    head = git("rev-parse", "HEAD").strip()
    config_path = output / "synthetic-config.json"
    main_config = read_json(ROOT / "config/recsdk.json", {})
    backend = main_config.get("model_backend")
    synthetic = {"name": "public-synthetic-demo", "repo_url": "https://example.invalid/synthetic/checkpoint-demo",
        "local_repo": str(source), "state_dir": "synthetic-state", "branches": ["develop"], "model_timeout": 600,
        "domains": {"training": {"patterns": ["**"], "description": "Self-authored checkpoint and batching example",
            "entrypoints": ["README.md", "checkpoint.py", "pipeline.py"], "tests": []}},
        "review_rules": ["Use the explicit README requirements; identify behavioral regressions with file and line evidence."]}
    if backend:
        synthetic["model_backend"] = backend
    atomic_json(config_path, synthetic)
    config = Config(config_path)
    destination = model_destination(config)
    print(json.dumps({"model_destination": destination}, ensure_ascii=False, indent=2), flush=True)
    context = Context(config)
    context.git.initialize()
    reviews = Reviews(config, context=context)
    try:
        pr = {"number": "synthetic-checkpoint", "state": "open", "draft": False,
              "title": "Simplify checkpoint restoration and sending loop",
              "body": "Keep checkpoint restore semantics and batching invocation budget unchanged.",
              "base": {"ref": "develop"}, "head": {"sha": head},
              "source_git_url": config.get("repo_url")}
        job = reviews.job(pr)
        folder, _ = reviews.execute(job, historical=True)
        result = json.loads((Path(folder) / "review.json").read_text(encoding="utf-8"))
        evidence_files = {e["path"] for f in result["review"]["findings"] for e in f["evidence"]}
        summary = {"generated_at": now(), "source": "newly authored synthetic source ONLY; no RecSDK data",
                   "model_destination": destination,
                   "base": base, "head": head, "report": folder,
                   "known_checkpoint_defect_detected": "checkpoint.py" in evidence_files,
                   "known_batching_regression_detected": "pipeline.py" in evidence_files,
                   "hardware_tests_executed": False}
        atomic_json(output / "synthetic-model-result.json", summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        reviews.state.close()


if __name__ == "__main__":
    main()
