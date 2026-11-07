from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from project_assistant.common import Config, atomic_json, read_json, run
from project_assistant.context import Context
from project_assistant.feature import Features
from project_assistant.gitcode import GitCode
from project_assistant.model import DOMAIN_SCHEMA, REVIEW_SCHEMA
from project_assistant.model import Codex
from project_assistant.review import Reviews


class FakeModel:
    supports_writable = True

    def __init__(self):
        self.calls = []
        self.fail = False

    def invoke(self, prompt, schema, cwd, output, **kwargs):
        self.calls.append((str(output), prompt))
        if self.fail:
            raise RuntimeError("Simulated model failure")
        if schema is DOMAIN_SCHEMA:
            source = next(p for p in cwd.rglob("*.py") if p.is_file()).relative_to(cwd).as_posix()
            result = {"summary": "测试领域", "flows": ["入口→计算→返回"],
                      "contracts": [{"statement": "源码观察", "kind": "observed", "evidence": [{"path": source, "line": 1, "reason": "定义"}]}],
                      "architecture_decisions": [], "performance_evidence": [], "test_entrypoints": [], "gaps": []}
        elif schema is REVIEW_SCHEMA:
            result = {"intent": "测试变更", "summary": "测试审查", "findings": [], "risks_to_verify": [],
                      "coverage_gaps": [], "affected_flows": ["入口→计算"], "verification_plan": ["需要实测"]}
        elif "goal" in schema["properties"]:
            result = {"goal": "增加功能", "acceptance_criteria": ["返回新值"], "proposed_changes": ["增加函数"],
                      "system_impact": ["调用方"], "verification_plan": ["局部测试"], "knowledge_updates": [], "open_questions": []}
        else:
            if output.name == "implementation.json":
                (cwd / "new_feature.py").write_text("def new_feature():\n    return 3\n")
            result = {"summary": "完成", "changed_paths": ["new_feature.py"], "checks_run": [],
                      "checks_not_run": ["没有NPU"], "knowledge_updates": ["新功能"], "remaining_risks": []}
        atomic_json(output, result)
        return result


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.repo = self.root / "source"
        self.repo.mkdir()
        self.git("init", "-b", "develop")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Fixture")
        self.git("remote", "add", "origin", "https://gitcode.com/test/repo")
        (self.repo / "alpha").mkdir()
        (self.repo / "beta").mkdir()
        (self.repo / "alpha/a.py").write_text("def compute():\n    return 1\n")
        (self.repo / "beta/b.py").write_text("def other():\n    return 2\n")
        (self.repo / "build").mkdir()
        (self.repo / "build/start.sh").write_text("echo launch\n")
        self.commit("base")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.git("branch", "refactor/develop")
        self.config_path = self.root / "config.json"
        atomic_json(self.config_path, {"name": "fixture", "repo_url": "https://gitcode.com/test/repo", "local_repo": str(self.repo),
                    "state_dir": "state", "branches": ["develop", "refactor/develop"], "domains": {
                        "alpha": {"patterns": ["alpha/**"], "description": "alpha", "tests": []},
                        "beta": {"patterns": ["beta/**"], "description": "beta", "tests": []}}, "review_rules": []})
        self.config = Config(self.config_path)
        self.model = FakeModel()

    def tearDown(self):
        import gc
        self.doCleanups()
        gc.collect()
        self.tmp.cleanup()

    def git(self, *args):
        return run(["git", "-C", self.repo, *args])

    def commit(self, text):
        self.git("add", ".")
        self.git("commit", "-m", text)

    def pr(self, number=1, sha=None, **kwargs):
        value = {"number": number, "state": "open", "draft": False, "title": "PR", "body": "需求", "base": {"ref": "develop"},
                 "head": {"sha": sha or self.base, "repo": {"full_name": "fork/repo", "clone_url": "https://gitcode.com/fork/repo"}},
                 "html_url": "https://gitcode.com/test/repo/pulls/1", "pipeline_status": "success"}
        value.update(kwargs)
        return value


class KnowledgeTests(Fixture):
    def test_curated_requirements_change_snapshot_identity(self):
        value = read_json(self.config_path)
        value['curated_knowledge'] = 'requirements.json'
        atomic_json(self.config_path, value)
        atomic_json(self.root / 'requirements.json', {'confirmed_requirements': []})
        old = Config(self.config_path)
        atomic_json(self.root / 'requirements.json', {'confirmed_requirements': [{'id':'r1', 'statement':'approved', 'domains':['alpha'], 'sources':['owner requirement']}]})
        new = Config(self.config_path)
        self.assertNotEqual(old.policy, new.policy)
        self.assertEqual(new.curated['confirmed_requirements'][0]['id'], 'r1')

    def test_real_understand_incremental_branches_and_reclone(self):
        context = Context(self.config, self.model)
        first = context.sync("develop")
        self.assertEqual(len(self.model.calls), 2)
        self.assertEqual(context.sync("develop"), first)
        self.assertEqual(len(self.model.calls), 2)
        (self.repo / "alpha/a.py").write_text("def compute():\n    return 4\n")
        self.commit("alpha update")
        context.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        second = context.sync("develop")
        self.assertNotEqual(first, second)
        # build script is not excluded; only alpha domain needs new semantics.
        self.assertEqual(len(self.model.calls), 3)
        path, manifest = context.load(second)
        self.assertGreater(manifest["stats"]["reused"], 0)
        self.assertIn("build/start.sh", read_json(path / "files.json"))
        other = context.sync("refactor/develop")
        self.assertEqual(context.load(other)[1]["commit"], self.base)
        self.assertEqual(context.latest("develop"), second)
        self.assertEqual(context.latest("refactor/develop"), other)
        clone = self.root / "reclone"
        run(["git", "clone", self.repo, clone])
        run(["git", "-C", clone, "remote", "set-url", "origin", self.config.get("repo_url")])
        value = read_json(self.config_path)
        value["local_repo"] = str(clone)
        atomic_json(self.config_path, value)
        restored = Context(Config(self.config_path), self.model)
        self.assertEqual(restored.sync("develop"), second)

    def test_failure_does_not_advance_pointer(self):
        context = Context(self.config, self.model)
        sid = context.sync("develop")
        (self.repo / "alpha/a.py").write_text("def compute():\n    return 9\n")
        self.commit("change")
        context.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        self.model.fail = True
        with self.assertRaises(RuntimeError):
            context.sync("develop")
        self.assertEqual(context.latest("develop"), sid)

    def test_delete_and_rename_prunes_nodes(self):
        context = Context(self.config, self.model)
        context.sync("develop", semantic=False)
        self.git("mv", "alpha/a.py", "alpha/renamed.py")
        self.commit("rename")
        context.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        sid = context.sync("develop", semantic=False)
        folder, _ = context.load(sid)
        nodes = read_json(folder / ".ua/knowledge-graph.json")["nodes"]
        self.assertFalse(any(n.get("filePath") == "alpha/a.py" for n in nodes))
        self.assertTrue(any(n.get("filePath") == "alpha/renamed.py" for n in nodes))

    def test_query_is_bounded_and_unknown_is_not_safe(self):
        context = Context(self.config, self.model)
        sid = context.sync("develop", semantic=False)
        result = context.query(sid, "compute", max_nodes=1)
        self.assertLessEqual(len(result["nodes"]), 1)
        self.assertTrue(result["truncated"])
        self.assertTrue(result["gaps"])
        self.assertEqual(result["mode"], "structural")


class PollTests(Fixture):
    def reviews(self):
        reviews = Reviews(self.config, model=self.model)
        reviews.git.initialize()
        self.addCleanup(reviews.state.close)
        return reviews

    def test_first_poll_seeds_then_push_and_dedupe(self):
        reviews = self.reviews()
        self.assertFalse(reviews.observe([self.pr()]))
        self.assertFalse(reviews.observe([self.pr()]))
        pushed = self.pr(sha="a" * 40)
        self.assertEqual(len(reviews.observe([pushed])), 1)
        self.assertFalse(reviews.observe([pushed]))
        self.assertEqual(reviews.state.db.execute("SELECT count(*) FROM jobs").fetchone()[0], 1)

    def test_draft_ready_forcepush_target_and_description(self):
        reviews = self.reviews()
        reviews.observe([self.pr(draft=True)])
        self.assertEqual(len(reviews.observe([self.pr()])), 1)
        self.assertEqual(len(reviews.observe([self.pr(sha="b" * 40)])), 1)
        self.assertEqual(len(reviews.observe([self.pr(sha="b" * 40, body="new requirement")])), 1)
        moved = self.pr(sha="b" * 40, base={"ref": "refactor/develop"})
        self.assertEqual(len(reviews.observe([moved])), 1)
        reviews.observe([])
        self.assertEqual(reviews.state.db.execute("SELECT count(*) FROM jobs WHERE status<>'obsolete'").fetchone()[0], 0)
        self.assertEqual(len(reviews.observe([moved])), 1)
        self.assertEqual(reviews.state.db.execute("SELECT status FROM jobs WHERE id=?", (reviews.job(moved)["fingerprint"],)).fetchone()[0], "pending")

    def test_target_tip_changed_requeues(self):
        reviews = self.reviews()
        reviews.observe([self.pr()])
        (self.repo / "alpha/a.py").write_text("def compute():\n    return 8\n")
        self.commit("new target")
        reviews.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        self.assertEqual(len(reviews.observe([self.pr()])), 1)

    def test_restart_recovers_and_failure_backs_off(self):
        reviews = self.reviews()
        reviews.observe([self.pr()], force=True)
        reviews.state.db.execute("UPDATE jobs SET status='running'")
        reviews.state.db.commit()
        reviews.state.recover()
        with patch.object(reviews, "execute", side_effect=RuntimeError("offline")):
            with self.assertRaises(RuntimeError):
                reviews.process_one()
        self.assertIsNone(reviews.process_one())
        row = reviews.state.db.execute("SELECT * FROM jobs").fetchone()
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["attempts"], 1)

    def test_complete_paginated_inventory(self):
        calls = []
        def transport(path, params):
            calls.append(params)
            return [self.pr(i, base={"ref": params["base"]}) for i in range(100)] if params["page"] == 1 else [self.pr(100, base={"ref": params["base"]})]
        rows = GitCode(self.config, transport).pulls()
        self.assertEqual(len(rows), 101)
        self.assertEqual(len(calls), 4)

    def test_review_records_hardware_gaps_and_obsolete_run(self):
        reviews = self.reviews()
        self.git("checkout", "-b", "feature")
        (self.repo / "alpha/a.py").write_text("def compute():\n    return 10\n")
        self.commit("candidate")
        sha = self.git("rev-parse", "HEAD").strip()
        reviews.git.command("fetch", str(self.repo), "+refs/heads/*:refs/remotes/origin/*")
        job = reviews.job(self.pr(sha=sha))
        with patch.object(reviews, "check_fresh", return_value=False):
            folder, current = reviews.execute(job)
        self.assertFalse(current)
        result = read_json(Path(folder) / "review.json")
        self.assertTrue(result["review"]["coverage_gaps"])
        self.assertTrue((Path(folder) / "STALE.txt").exists())
        self.assertFalse(read_json(Path(folder) / "status.json")["current"])
        self.assertEqual(result["metadata"]["merge_base"], self.base)

    def test_finding_requires_real_source_evidence(self):
        result = {"findings": [{"trigger": "x", "system_function": "x", "consequence": "x", "verification": "x",
                                "evidence": [{"path": "../secret", "line": 1}]}]}
        with self.assertRaises(ValueError):
            Reviews.validate_findings(result, [self.repo])


class FeatureTests(Fixture):
    def test_design_implementation_verification_do_not_promote(self):
        features = Features(self.config, self.model)
        designed = features.design("develop", "增加compute功能")
        baseline = features.context.latest("develop")
        features.implement(designed["task_id"])
        features.verify(designed["task_id"])
        folder, task = features.load(designed["task_id"])
        self.assertEqual(task["phase"], "verified")
        self.assertEqual(features.context.latest("develop"), baseline)
        self.assertEqual(read_json(folder / "knowledge-candidate.json")["status"], "pending_merge")
        self.assertFalse((self.repo / "new_feature.py").exists())
        self.assertIn("new_feature.py", read_json(folder / "untracked.json")["paths"])
        (self.repo / 'new_feature.py').write_bytes((Path(task['workspace']) / 'new_feature.py').read_bytes())
        self.commit('merge implemented feature')
        features.git.command('fetch', str(self.repo), '+refs/heads/*:refs/remotes/origin/*')
        new_snapshot = features.context.sync('develop')
        pack = features.context.query(new_snapshot, 'new_feature')
        self.assertEqual(pack['merged_feature_candidates'][0]['status'], 'implementation_present_needs_confirmation')


class SourceProtocolTests(unittest.TestCase):
    def test_model_resume_preserves_completed_source_round(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'file.py').write_text('value = 1\n')
            config = SimpleNamespace(repo_state=root / 'state', get=lambda name, default=None: default)
            calls = []
            def execute(args, **kwargs):
                calls.append(kwargs['input'])
                output = Path(args[args.index('--output-last-message') + 1])
                if len(calls) == 2:
                    return SimpleNamespace(returncode=1, stderr='ERROR: usage limit reached', stdout='')
                value = {'summary':'done', 'gaps':[], 'requested_sources': []}
                if len(calls) == 1:
                    value['requested_sources'] = [{'snapshot':'head','path':'file.py','start_line':1,'end_line':1}]
                atomic_json(output, value)
                return SimpleNamespace(returncode=0, stderr='', stdout='')
            schema = {'type':'object','properties':{'summary':{'type':'string'},'gaps':{'type':'array','items':{'type':'string'}}},'required':['summary','gaps'],'additionalProperties':False}
            with patch('project_assistant.model.subprocess.run', side_effect=execute), patch('project_assistant.model.shutil.which', return_value='codex'):
                with self.assertRaisesRegex(RuntimeError, 'usage limit'):
                    Codex(config).invoke('analyze', schema, root, root / 'first.json')
                result = Codex(config).invoke('analyze', schema, root, root / 'retry.json')
            self.assertEqual(result['summary'], 'done')
            self.assertEqual(len(calls), 3)
            self.assertIn('1: value = 1', calls[2])

    def test_bounded_source_reader_and_path_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'entry.py').write_text(''.join(f'line{i}\n' for i in range(500)))
            roots = {k: root for k in ['head','target','merge_base']}
            text = Codex.read_sources([{'snapshot':'head','path':'entry.py','start_line':10,'end_line':500}], roots)
            self.assertIn('10: line9', text)
            self.assertNotIn('310: line309', text)
            with self.assertRaises(ValueError):
                Codex.read_sources([{'snapshot':'head','path':'../secret','start_line':1,'end_line':1}], roots)
            with self.assertRaises(ValueError):
                Codex.read_sources([{'snapshot':'head','path':'.GIT/config','start_line':1,'end_line':1}], roots)

    def test_readonly_model_has_no_execution_tools_and_no_token(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'file.py').write_text('value = 1\n')
            config = SimpleNamespace(get=lambda name, default=None: default)
            output = root / 'result.json'
            calls = []
            def execute(args, **kwargs):
                calls.append((args, kwargs))
                value = {'summary':'done', 'gaps':[], 'requested_sources': []}
                if len(calls) == 1:
                    value['requested_sources'] = [{'snapshot':'head','path':'file.py','start_line':1,'end_line':1}]
                atomic_json(output, value)
                return SimpleNamespace(returncode=0, stderr='', stdout='')
            with patch('project_assistant.model.subprocess.run', side_effect=execute), patch('project_assistant.model.shutil.which', return_value='codex'), patch.dict('os.environ', {'GITCODE_TOKEN':'not-for-model'}):
                result = Codex(config).invoke('analyze', {'type':'object','properties':{'summary':{'type':'string'},'gaps':{'type':'array','items':{'type':'string'}}},'required':['summary','gaps'],'additionalProperties':False}, root, output)
            self.assertEqual(result['summary'],'done')
            self.assertEqual(len(calls),2)
            args, options = calls[0]
            self.assertIn('--ignore-user-config',args)
            self.assertIn('shell_tool',args)
            self.assertIn('unified_exec',args)
            self.assertNotIn('GITCODE_TOKEN',options['env'])
            self.assertIn('1: value = 1',calls[1][1]['input'])


if __name__ == "__main__":
    unittest.main()
