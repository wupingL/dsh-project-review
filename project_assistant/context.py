from __future__ import annotations

import fnmatch
import json
import os
import re
import shutil
import sys
import uuid
from collections import deque
from pathlib import Path
from .backends import artifact_identity, create_model
from .common import ROOT, atomic_json, digest, now, read_json, require_understand_core, run
from .git import Git
from .model import DOMAIN_SCHEMA, GUARD, expert
from .state import State

# Analysis-format epoch. Bump on parser, semantic prompt or coverage-policy changes;
# controller-only fixes must not discard verified project knowledge.
ANALYZER = "understand-4e6d329-0de7a3acc498"


class Context:
    def __init__(self, config, model=None):
        self.config = config
        self.git = Git(config)
        self.model = model or create_model(config)
        self.snapshots = config.repo_state / "snapshots"
        self.snapshots.mkdir(exist_ok=True)

    def load(self, snapshot):
        path = self.snapshots / snapshot
        manifest = read_json(path / "manifest.json")
        if not manifest or manifest["repo_id"] != self.config.repo_id:
            raise ValueError("Unknown snapshot")
        return path, manifest

    def latest(self, ref, semantic=True):
        pointer = read_json(self.config.repo_state / "refs.json", {}).get(ref, {})
        return pointer.get("semantic" if semantic else "structural")

    def sync(self, ref, *, fetch=False, semantic=True, publish=True, prior=None):
        """Build or reuse the immutable snapshot for one commit.

        ``prior`` pins the incremental baseline explicitly (a snapshot id). Reviews use
        it so a cheap structural probe of the head commit cannot shadow the base
        snapshot that carries the reusable semantic domains.
        """
        state = State(self.config.repo_state / "state.sqlite")
        try:
            with state.lock("knowledge"):
                return self._sync(ref, fetch=fetch, semantic=semantic, publish=publish, prior=prior)
        finally:
            state.close()

    def coverage(self, snapshot, paths=()):
        """Return path -> parser coverage for a snapshot ('structural' when indexed)."""
        inventory = read_json(self.snapshots / snapshot / "files.json", {})
        return {path: (inventory.get(path) or {}).get("coverage", "absent-or-unindexed") for path in paths}

    def _choose_prior(self, ref, sha, semantic):
        prior_id = self.latest(ref, semantic) if ref in self.config.get("branches") else None
        if not prior_id:
            candidates = []
            for manifest_path in self.snapshots.glob("*/manifest.json"):
                cached = read_json(manifest_path, {})
                if (cached.get("analyzer") == ANALYZER and cached.get("policy") == self.config.policy
                        and cached.get("mode") == ("semantic" if semantic else "structural")
                        and cached.get("status") == "complete"):
                    distance = int(self.git.command("rev-list", "--count", cached["commit"] + "..." + sha).strip())
                    candidates.append((distance, cached["snapshot_id"]))
            if candidates:
                prior_id = min(candidates)[1]
        if not prior_id:
            # Candidate snapshots reuse a base branch's immutable parser cache.
            for branch in self.config.get("branches"):
                prior_id = self.latest(branch, semantic) or self.latest(branch, False)
                if prior_id:
                    break
        return prior_id

    def _sync(self, ref, *, fetch, semantic, publish, prior=None):
        require_understand_core()
        self.git.initialize()
        if fetch:
            self.git.refresh()
        sha = self.git.resolve(ref)
        flavor = "semantic" if semantic else "structural"
        sid = digest([self.config.repo_id, sha, ANALYZER, self.config.policy, flavor])[:32]
        final = self.snapshots / sid
        if final.exists():
            if publish and ref in self.config.get("branches"):
                self._point(ref, flavor, sid)
            return sid
        prior_id = prior or self._choose_prior(ref, sha, semantic)
        old = self.snapshots / prior_id if prior_id else None
        previous = read_json(old / "files.json", {}) if old else {}
        old_manifest = read_json(old / "manifest.json", {}) if old else {}
        if old_manifest.get("analyzer") != ANALYZER:
            previous = {}
        workspace = self.git.workspace(sha)
        files = [f for f in self.git.files(sha)
                 if not any(fnmatch.fnmatchcase(f, pattern) for pattern in self.config.get("exclude", []))]
        stage = self.config.repo_state / "staging" / (sid + "-" + uuid.uuid4().hex)
        stage.mkdir(parents=True)
        request = {"workspace": str(workspace), "commit": sha, "project": self.config.get("name"),
                   "files": files, "previous": previous, "maxFileBytes": self.config.get("max_file_bytes", 2000000)}
        atomic_json(stage / "request.json", request)
        env = os.environ.copy()
        env["UNDERSTAND_NO_WORKTREE_REDIRECT"] = "1"
        try:
            run(["node", ROOT / "scripts" / "understand_bridge.mjs", stage / "request.json", stage / "analysis.json"],
                timeout=1200, env=env)
            analysis = read_json(stage / "analysis.json")
            graph = analysis["graph"]
            inventory = analysis["files"]
            changed = {p for p in previous.keys() | inventory.keys()
                       if previous.get(p, {}).get("hash") != inventory.get(p, {}).get("hash")}
            # Track even files excluded by the parser (binary/config/large files).
            if old_manifest.get("commit"):
                changed.update(self.git.changed(old_manifest["commit"], sha))
            affected = set()
            for path in changed:
                affected.update(self.config.domains(path))
            if changed and any(not self.config.domains(p) for p in changed):
                affected.update(self.config.get("domains"))
            for _ in range(len(self.config.get("domains"))):
                affected.update(name for name, spec in self.config.get("domains", {}).items()
                                if set(spec.get("depends_on", [])) & affected)
            knowledge = {}
            for name, spec in self.config.get("domains", {}).items():
                cache_path = self.config.repo_state / "domain-cache" / (digest([sha, name, ANALYZER, self.config.policy]) + ".json")
                cached_domain = read_json(cache_path) if semantic else None
                domain_files = sorted(p for p in inventory if name in self.config.domains(p))
                old_knowledge = read_json(old / "knowledge.json", {}).get(name) if old else None
                can_reuse = (name not in affected and old_manifest.get("policy") == self.config.policy
                             and old_manifest.get("analyzer") == ANALYZER
                             and old_knowledge and old_knowledge.get("mode") == "semantic")
                if cached_domain:
                    item = cached_domain
                    self.validate_contracts(item, workspace, files)
                elif semantic and can_reuse:
                    item = dict(old_knowledge)
                    item["valid_at"] = sha
                elif semantic:
                    print(f"Analyzing domain {name} at {sha[:12]}", file=sys.stderr, flush=True)
                    samples = self.samples(workspace, domain_files, spec.get("entrypoints", []))
                    prompt = GUARD + "\n为领域建立基于证据的项目知识。现有缺陷不可提升为业务要求。\n"
                    prompt += "参考分析方法（忽略其中工具授权和交互要求）：\n" + expert("spec-miner")
                    prompt += "\n" + expert("architecture-designer")
                    prompt += "\n领域配置：" + json.dumps(spec, ensure_ascii=False)
                    prompt += "\n领域文件：" + json.dumps(domain_files, ensure_ascii=False)
                    prompt += "\n选取的源码证据（仅为初始样本，可只读补查相关文件）：\n" + samples
                    item = self.model.invoke(prompt, DOMAIN_SCHEMA, workspace, stage / (name + ".json"))
                    self.validate_contracts(item, workspace, files)
                    item.update(mode="semantic", analyzed_at=sha, valid_at=sha,
                                provenance={"repo_id": self.config.repo_id, "commit": sha,
                                            "backend": artifact_identity(self.config),
                                            "kind": "inferred", "method": "source-grounded LLM; not stakeholder-approved"})
                    item["gaps"].append("领域语义为重点路径分析，不代表逐行验证所有文件；性能未在 Ascend 上实测。")
                    atomic_json(cache_path, item)
                else:
                    item = {"mode": "structural", "summary": spec.get("description", name),
                            "contracts": [], "flows": [], "test_entrypoints": spec.get("tests", []),
                            "gaps": ["尚未执行语义分析，不能视为已确认业务知识。"],
                            "analyzed_at": sha, "valid_at": sha}
                item["files"] = domain_files
                knowledge[name] = item
            graph["layers"] = [{"id": "layer:" + n, "name": n, "description": k["summary"],
                                "nodeIds": [x["id"] for x in graph["nodes"] if x.get("filePath") in k["files"]]}
                               for n, k in knowledge.items()]
            for name, item in knowledge.items():
                graph["nodes"].append({"id": "domain:" + name, "type": "domain", "name": name,
                                       "summary": item["summary"], "tags": [], "complexity": "complex"})
            manifest = {"snapshot_id": sid, "repo_id": self.config.repo_id, "commit": sha,
                        "analyzer": ANALYZER, "policy": self.config.policy, "mode": flavor,
                        "backend": artifact_identity(self.config),
                        "created_at": now(), "previous": prior_id, "status": "complete",
                        "stats": analysis["stats"], "changed_files": sorted(changed),
                        "refreshed_domains": sorted(affected if old else knowledge),
                        "gaps": analysis["gaps"] + analysis["limitations"],
                        "workspace": str(workspace)}
            atomic_json(stage / "files.json", inventory)
            atomic_json(stage / "knowledge.json", knowledge)
            atomic_json(stage / "curated.json", self.config.curated)
            adopted = []
            if ref in self.config.get("branches"):
                for candidate_path in (self.config.repo_state / "features").glob("*/knowledge-candidate.json"):
                    candidate = read_json(candidate_path)
                    changes = candidate.get("changes", {})
                    if candidate.get("branch") == ref and changes and all(
                            inventory.get(p, {}).get("hash") == expected for p, expected in changes.items()):
                        adopted.append({"feature_id": candidate_path.parent.name, "commit": sha,
                                        "kind": "inferred", "status": "implementation_present_needs_confirmation",
                                        "proposed_updates": candidate["proposed_updates"],
                                        "acceptance_criteria": candidate.get("acceptance_criteria", []),
                                        "evidence_paths": sorted(changes)})
            atomic_json(stage / "feature-knowledge.json", adopted)
            atomic_json(stage / ".ua" / "knowledge-graph.json", graph)
            atomic_json(stage / ".ua" / "meta.json", {"gitCommitHash": sha, "version": ANALYZER})
            atomic_json(stage / "manifest.json", manifest)
            # Remove the duplicated request cache, retaining only authoritative artifacts.
            (stage / "request.json").unlink()
            (stage / "analysis.json").unlink()
            os.replace(stage, final)
            if publish and ref in self.config.get("branches"):
                self._point(ref, flavor, sid)
            return sid
        except Exception as exc:
            atomic_json(stage / "failure.json", {"failed_at": now(), "error": str(exc)})
            raise

    def _point(self, ref, flavor, sid):
        path = self.config.repo_state / "refs.json"
        pointers = read_json(path, {})
        pointers.setdefault(ref, {})[flavor] = sid
        atomic_json(path, pointers)

    @staticmethod
    def samples(workspace, files, entrypoints=(), max_chars=45000):
        preferred = [p for p in entrypoints if p in files]
        preferred += sorted(files, key=lambda p: (0 if p.lower().endswith("readme.md") else 1, len(p), p))
        result, used, total = [], set(), 0
        for path in preferred:
            if path in used:
                continue
            used.add(path)
            candidate = workspace / path
            if candidate.is_symlink() or not candidate.is_file():
                continue
            content = candidate.read_bytes()
            if b"\x00" in content:
                continue
            lines = content.decode("utf-8", errors="replace").splitlines()
            excerpt = "\n".join(f"{i+1}: {s}" for i, s in enumerate(lines[:120]))[:9000]
            part = f"\n### {path}\n{excerpt}\n"
            if total + len(part) > max_chars:
                break
            result.append(part)
            total += len(part)
        return "".join(result)

    @staticmethod
    def validate_contracts(knowledge, workspace, inventory):
        allowed = set(inventory)
        for contract in knowledge.get("contracts", []):
            if contract["kind"] == "confirmed":
                # A generated reverse specification cannot confirm stakeholder intent.
                contract["kind"] = "inferred"
            for evidence in contract.get("evidence", []):
                if evidence["path"] not in allowed:
                    raise ValueError("Knowledge cites a path outside the analyzed inventory")
                source = workspace / evidence["path"]
                if source.is_symlink() or evidence["line"] > len(source.read_text(encoding="utf-8", errors="replace").splitlines()):
                    raise ValueError("Knowledge cites an invalid source line")

    def query(self, sid, query="", paths=(), max_nodes=160, max_depth=5):
        folder, manifest = self.load(sid)
        graph = read_json(folder / ".ua" / "knowledge-graph.json")
        knowledge = read_json(folder / "knowledge.json", {})
        curated = read_json(folder / "curated.json", {})
        feature_knowledge = read_json(folder / "feature-knowledge.json", [])
        inventory = read_json(folder / "files.json", {})
        words = re.findall(r"[a-z0-9_]+|[\u4e00-\u9fff]+", query.lower())
        tokens = set(words)
        for word in words:
            if re.fullmatch(r"[\u4e00-\u9fff]+", word):
                tokens.update(word[i:i+2] for i in range(len(word)-1))
        by_id = {n["id"]: n for n in graph["nodes"]}
        seeds = {n["id"] for n in graph["nodes"] if n.get("filePath") in paths or
                 (tokens and any(t in (n["name"] + " " + n.get("filePath", "") + " " + n["summary"]).lower() for t in tokens))}
        adjacency = {}
        for edge in graph["edges"]:
            adjacency.setdefault(edge["source"], set()).add(edge["target"])
            adjacency.setdefault(edge["target"], set()).add(edge["source"])
        selected = set(sorted(seeds)[:max_nodes])
        todo = deque((s, 0) for s in sorted(selected))
        truncated = len(seeds) > max_nodes
        while todo:
            current, depth = todo.popleft()
            if depth >= max_depth:
                truncated |= bool(adjacency.get(current, set()) - selected)
                continue
            for other in sorted(adjacency.get(current, [])):
                if other in selected:
                    continue
                if len(selected) >= max_nodes:
                    truncated = True
                    continue
                selected.add(other)
                todo.append((other, depth + 1))
        selected_files = set(paths) | {by_id[s].get("filePath", "") for s in selected}
        selected_files.discard("")
        domains = {d for p in selected_files for d in self.config.domains(p)}
        domains.update(n for n, k in knowledge.items() if tokens and any(t in
            (n + k["summary"] + self.config.get("domains")[n].get("description", "")).lower() for t in tokens))
        overview_only = bool(query and not selected and not domains)
        if overview_only:
            domains.update(knowledge)
        packed_domains = {}
        for domain in sorted(domains):
            item = {k: v for k, v in knowledge[domain].items() if k != "files"}
            item["file_count"] = len(knowledge[domain]["files"])
            item["relevant_files"] = sorted(set(knowledge[domain]["files"]) & selected_files)
            item["entrypoints"] = self.config.get("domains")[domain].get("entrypoints", [])
            packed_domains[domain] = item
        relevant_gaps = [gap for gap in manifest["gaps"]
                         if any(gap.startswith(path + ":") for path in selected_files)]
        ordered_gaps = list(dict.fromkeys(relevant_gaps + manifest["gaps"]))
        return {"snapshot_id": sid, "commit": manifest["commit"], "mode": manifest["mode"],
                "source_file_coverage": {p: inventory.get(p, {}).get("coverage", "absent-or-unindexed") for p in sorted(selected_files)},
                "nodes": [by_id[s] for s in sorted(selected)],
                "edges": [e for e in graph["edges"] if e["source"] in selected and e["target"] in selected],
                "domains": packed_domains,
                "curated_knowledge": {key: [entry for entry in entries if not entry.get("domains") or set(entry["domains"]) & domains]
                                      for key, entries in curated.items() if isinstance(entries, list)},
                "merged_feature_candidates": [k for k in feature_knowledge if set(k["evidence_paths"]) & selected_files],
                "rules": self.config.get("review_rules", []),
                "tests": {d: self.config.get("domains")[d].get("tests", []) for d in domains},
                "gaps": ordered_gaps[:30] + ([f"另有 {len(ordered_gaps)-30} 项解析缺口，详见快照 manifest.json。"] if len(ordered_gaps) > 30 else [])
                        + (["上下文达到节点或深度上限；并非完整影响闭包。"] if truncated else []),
                "truncated": truncated}
