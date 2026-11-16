from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from project_assistant import projects
from project_assistant.common import atomic_json, now, read_json


def make_repo(root: Path, branches=("main",), files=None):
    """用真实 git 建一个最小仓库（不走网络）。"""
    from project_assistant.common import run
    files = files or {"README.md": "# demo\n", "src/a.py": "a = 1\n", "src/b.py": "b = 2\n", "src/c.py": "c = 3\n"}
    root.mkdir(parents=True, exist_ok=True)
    run(["git", "init", "-b", branches[0], str(root)])
    run(["git", "-C", str(root), "config", "user.email", "test@local"])
    run(["git", "-C", str(root), "config", "user.name", "test"])
    for name, content in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    run(["git", "-C", str(root), "add", "-A"])
    run(["git", "-C", str(root), "commit", "-m", "init"])
    for branch in branches[1:]:
        run(["git", "-C", str(root), "branch", branch])
    run(["git", "-C", str(root), "remote", "add", "origin",
         "https://gitcode.com/demo/" + root.name + ".git"])
    return run(["git", "-C", str(root), "rev-parse", "HEAD"]).strip()


class ProjectRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        self.config_dir = self.root / "config"
        self.config_dir.mkdir()
        self.registry = self.config_dir / "projects.json"
        atomic_json(self.config_dir / "recsdk.json", {
            "name": "RecSDK_for_lingqu",
            "repo_url": "https://gitcode.com/Ascend/RecSDK_for_lingqu",
            "branches": ["develop"],
            "state_dir": "../data",
            "model_backend": {"provider": "deepseek"},
        })

    def patch_paths(self):
        return patch.multiple(projects, CONFIG_DIR=self.config_dir, REGISTRY_PATH=self.registry)

    def test_registry_auto_migrates_preloaded_project(self):
        with self.patch_paths():
            registry = projects.load_registry()
            self.assertEqual(registry["default"], "recsdk")
            self.assertEqual([entry["id"] for entry in registry["projects"]], ["recsdk"])
            self.assertTrue(self.registry.is_file())

    def test_project_list_projects_snapshots_and_broken_config(self):
        repo_root = self.root / "state"
        from project_assistant.common import Config, digest
        key = digest("gitcode.com/Ascend/RecSDK_for_lingqu")[:20]
        repo_state = repo_root / "repositories" / key
        atomic_json(repo_state / "refs.json", {"develop": {"structural": "snap1"}})
        atomic_json(repo_state / "snapshots" / "snap1" / "manifest.json", {
            "snapshot_id": "snap1", "commit": "deadbeef", "created_at": now(),
            "mode": "structural", "status": "complete", "refreshed_domains": ["a"], "stats": {"files": 3},
        })
        atomic_json(self.config_dir / "recsdk.json", {
            "name": "RecSDK_for_lingqu",
            "repo_url": "https://gitcode.com/Ascend/RecSDK_for_lingqu",
            "branches": ["develop"], "state_dir": "../state",
        })
        self.assertEqual(key, Config(self.config_dir / "recsdk.json").key)
        with self.patch_paths():
            atomic_json(self.registry, {"version": 1, "default": "recsdk", "projects": [
                {"id": "recsdk", "name": "RecSDK_for_lingqu", "config": "recsdk.json"},
                {"id": "broken", "name": "broken", "config": "missing.json"},
            ]})
            listed = projects.list_projects()
        self.assertEqual(listed["default_project"], "recsdk")
        self.assertEqual(len(listed["projects"]), 2)
        good = listed["projects"][0]
        self.assertEqual(good["branches"], ["develop"])
        self.assertEqual(good["snapshots"]["develop"]["structural"]["snapshot_id"], "snap1")
        self.assertIn("error", listed["projects"][1])

    def test_probe_and_import_local_repo_is_idempotent(self):
        repo = self.root / "demo-repo"
        make_repo(repo, branches=("main", "feature"))
        with self.patch_paths():
            probed = projects.probe("https://gitcode.com/demo/demo-repo", str(repo))
            self.assertTrue(probed["ok"])
            self.assertEqual(probed["default_branch"], "main")
            names = [branch["name"] for branch in probed["branches"]]
            self.assertIn("feature", names)
            self.assertEqual(probed["source"], "local")

            imported = projects.import_project("demo-repo", "https://gitcode.com/demo/demo-repo",
                                               str(repo), ["main"])
            self.assertTrue(imported["created"])
            project_id = imported["project"]["id"]
            self.assertEqual(imported["project"]["branches"], ["main"])
            config_value = read_json(self.config_dir / (project_id + ".json"))
            self.assertEqual(config_value["domains"], {})
            self.assertIn("model_backend", config_value)
            self.assertNotIn("credential_file", config_value["model_backend"])

            again = projects.import_project("other-name", "https://gitcode.com/demo/demo-repo", str(repo))
            self.assertFalse(again["created"])
            self.assertEqual(again["project"]["id"], project_id)
            self.assertEqual(len(projects.load_registry()["projects"]), 2)

    def test_import_requires_local_path(self):
        repo = self.root / "needs-local"
        make_repo(repo)
        with self.patch_paths():
            with self.assertRaises(ValueError) as caught:
                projects.import_project("x", "https://gitcode.com/demo/x")
            self.assertIn("本地路径", str(caught.exception))

    def test_import_clones_source_into_missing_local_path(self):
        source = self.root / "source-repo"
        make_repo(source, branches=("main",))
        target = self.root / "clones" / "fresh"
        with self.patch_paths(), patch.object(projects, "canonical_url",
                                              return_value=str(source)):
            imported = projects.import_project("fresh", "https://gitcode.com/demo/fresh",
                                               str(target), ["main"])
        self.assertTrue(imported["created"])
        self.assertEqual(imported["clone"], "cloned")
        self.assertTrue((target / ".git").is_dir())
        self.assertTrue((target / "README.md").is_file())
        self.assertEqual(Path(imported["local_repo"]), target.resolve())

    def test_import_rejects_nonempty_dir_without_git(self):
        source = self.root / "source-repo-2"
        make_repo(source)
        target = self.root / "not-a-repo"
        target.mkdir()
        (target / "file.txt").write_text("x", encoding="utf-8")
        with self.patch_paths():
            with self.assertRaises(ValueError) as caught:
                projects.import_project("bad", "https://gitcode.com/demo/bad", str(target), ["main"])
            self.assertIn("空目录", str(caught.exception))

    def test_remove_project_keeps_local_source_and_optionally_purges_state(self):
        repo = self.root / "removable"
        make_repo(repo)
        with self.patch_paths():
            imported = projects.import_project("removable", "https://gitcode.com/demo/removable",
                                               str(repo), ["main"])
            project_id = imported["project"]["id"]
            config_path = self.config_dir / (project_id + ".json")
            self.assertTrue(config_path.is_file())

            removed = projects.remove_project(project_id)
            self.assertTrue(removed["ok"])
            self.assertFalse(config_path.exists())
            self.assertTrue(repo.is_dir())  # 本地源码不删
            self.assertNotIn(project_id, [item["id"] for item in projects.load_registry()["projects"]])

    def test_remove_project_purges_controller_state(self):
        repo = self.root / "purgeable"
        make_repo(repo)
        with self.patch_paths():
            imported = projects.import_project("purgeable", "https://gitcode.com/demo/purgeable",
                                               str(repo), ["main"])
            project_id = imported["project"]["id"]
            from project_assistant.common import Config
            config = Config(self.config_dir / (project_id + ".json"))
            repo_state = config.state / "repositories" / config.key
            atomic_json(repo_state / "refs.json", {"main": {"structural": "s1"}})
            self.assertTrue(repo_state.is_dir())

            removed = projects.remove_project(project_id, purge=True)
            self.assertTrue(removed["purged"])
            self.assertFalse(repo_state.exists())
            self.assertIn(str(repo_state), removed["deleted"])

    def test_probe_rejects_mismatched_local_origin_and_bad_url(self):
        repo = self.root / "mismatch"
        make_repo(repo)
        with self.patch_paths():
            with self.assertRaises(ValueError):
                projects.probe("https://gitcode.com/demo/other-name", str(repo))
            with self.assertRaises(ValueError):
                projects.probe("http://insecure.example/repo")

    def test_project_branches_reads_local_mirror(self):
        repo = self.root / "branchy"
        make_repo(repo, branches=("main", "develop"))
        with self.patch_paths():
            imported = projects.import_project("branchy", "https://gitcode.com/demo/branchy", str(repo), ["main"])
            project_id = imported["project"]["id"]
            listed = projects.project_branches(project_id)
        names = [branch["name"] for branch in listed["branches"]]
        self.assertIn("main", names)
        self.assertIn("develop", names)
        configured = {branch["name"]: branch["configured"] for branch in listed["branches"]}
        self.assertTrue(configured["main"])
        self.assertFalse(configured["develop"])

    def test_knowledge_status_missing_then_current(self):
        repo = self.root / "knowledge"
        head = make_repo(repo)
        with self.patch_paths():
            imported = projects.import_project("knowledge", "https://gitcode.com/demo/knowledge", str(repo), ["main"])
            project_id = imported["project"]["id"]
            status = projects.knowledge_status(project_id, "main")
            self.assertEqual(status["freshness"], "missing")
            self.assertFalse(status["semantic_ready"])
            self.assertTrue(status["semantic_reason"])

            with patch.object(projects, "probe", side_effect=AssertionError("probe must not run")):
                self.assertIn("branches", projects.project_branches(project_id))
        # 手工发布一条 structural 指针，验证 current 判定
        from project_assistant.common import Config
        project_config = Config(self.config_dir / (project_id + ".json"))
        repo_state = project_config.state / "repositories" / project_config.key
        atomic_json(repo_state / "snapshots" / "snapk" / "manifest.json", {
            "snapshot_id": "snapk", "commit": head, "created_at": now(),
            "mode": "structural", "status": "complete", "refreshed_domains": ["src"], "stats": {},
        })
        pointers = read_json(repo_state / "refs.json", {}) or {}
        pointers.setdefault("main", {})["structural"] = "snapk"
        atomic_json(repo_state / "refs.json", pointers)
        with self.patch_paths():
            refreshed = projects.knowledge_status(project_id, "main")
        self.assertIsNotNone(refreshed["snapshot"]["structural"])
        self.assertEqual(refreshed["snapshot"]["structural"]["commit"], head)

    def test_import_rejects_unsafe_branch_name(self):
        repo = self.root / "unsafe"
        make_repo(repo)
        with self.patch_paths():
            for unsafe in ("--upload-pack=evil", "bad..name", "with space", ""):
                with self.assertRaises((ValueError, RuntimeError)):
                    projects.import_project("unsafe", "https://gitcode.com/demo/unsafe", str(repo), [unsafe])

    def test_model_show_and_set_never_store_credentials(self):
        repo = self.root / "modelp"
        make_repo(repo)
        with self.patch_paths():
            imported = projects.import_project("modelp", "https://gitcode.com/demo/modelp", str(repo), ["main"])
            project_id = imported["project"]["id"]
            shown = projects.model_show(project_id)
            self.assertIn("checks", shown)
            self.assertFalse(shown["ready"])
            self.assertIn("secrets_policy", shown)

            saved = projects.model_set(project_id, provider="deepseek", model="deepseek-chat",
                                       base_url="https://api.deepseek.com/v1",
                                       credential_env="MY_LLM_KEY")
            backend = saved["model_backend"]
            self.assertEqual(backend["provider"], "deepseek")
            self.assertEqual(backend["model"], "deepseek-chat")
            self.assertEqual(backend["base_url"], "https://api.deepseek.com/v1")
            self.assertEqual(backend["credential_env"], "MY_LLM_KEY")
            self.assertIn("endpoint_id", backend)
            self.assertIn("task_profiles", backend)
            stored = json.dumps(read_json(self.config_dir / (project_id + ".json")), ensure_ascii=False)
            self.assertNotIn("api_key", stored.lower())
            self.assertNotIn("secret", stored.lower())

    def test_model_set_validates_url_and_model(self):
        repo = self.root / "modeli"
        make_repo(repo)
        with self.patch_paths():
            imported = projects.import_project("modeli", "https://gitcode.com/demo/modeli", str(repo), ["main"])
            project_id = imported["project"]["id"]
            with self.assertRaises(ValueError):
                projects.model_set(project_id, provider="deepseek", model="x", base_url="http://insecure")
            with self.assertRaises(ValueError):
                projects.model_set(project_id, provider="deepseek", model="")
            with self.assertRaises(ValueError):
                projects.model_set(project_id, provider="openai", model="x", base_url="https://api.example.com")

    def test_model_credential_roundtrip_never_echoes_secret(self):
        repo = self.root / "modelk"
        make_repo(repo)
        with self.patch_paths():
            imported = projects.import_project("modelk", "https://gitcode.com/demo/modelk", str(repo), ["main"])
            project_id = imported["project"]["id"]
            projects.model_set(project_id, provider="deepseek", model="deepseek-chat",
                               base_url="https://api.deepseek.com/v1", credential_env="MY_LLM_KEY")
            saved = projects.model_set_credential(project_id, api_key="sk-test-SECRET-123")
            self.assertNotIn("sk-test-SECRET-123", json.dumps(saved, ensure_ascii=False))
            self.assertTrue(saved["credential"]["present"])
            from project_assistant.common import Config
            config = Config(self.config_dir / (project_id + ".json"))
            credential_path = Path(saved["credential_file"])
            self.assertTrue(credential_path.is_file())
            self.assertEqual(json.loads(credential_path.read_text(encoding="utf-8"))["MY_LLM_KEY"], "sk-test-SECRET-123")
            config_text = config.path.read_text(encoding="utf-8")
            self.assertNotIn("sk-test-SECRET-123", config_text)
            # 控制器通过 credential_file 真的能解析到该凭据
            from project_assistant.backends import credential_status
            status = credential_status(config)
            self.assertTrue(status["present"])
            self.assertEqual(status["source"], "credential-file")
            cleared = projects.model_set_credential(project_id, clear=True)
            self.assertFalse(cleared["credential"]["present"])
            self.assertFalse(projects.model_set_credential.__doc__ is None)


if __name__ == "__main__":
    unittest.main()
