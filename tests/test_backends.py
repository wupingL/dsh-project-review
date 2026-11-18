from __future__ import annotations

import json
import os
import socket
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from project_assistant.backends import (
    DeepSeek,
    ModelConfigurationError,
    ModelOutputTruncated,
    ModelTransportError,
    UnsupportedModelCapability,
    artifact_identity,
    backend_checks,
    create_model,
    credential_status,
    model_destination,
)
from project_assistant.cli import doctor
from project_assistant.common import Config, atomic_json, read_json
from project_assistant.feature import Features
from project_assistant.model import AnalysisRunner, Codex
from project_assistant.schema import SchemaValidationError, validate_json


SIMPLE_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"},
                   "gaps": {"type": "array", "items": {"type": "string"}}},
    "required": ["summary", "gaps"],
    "additionalProperties": False,
}


class FakeConfig:
    def __init__(self, backend, repo_state=None, **extra):
        self._backend = backend
        self.repo_state = Path(repo_state or tempfile.mkdtemp())
        self.repo_state.mkdir(parents=True, exist_ok=True)
        self.extra = extra
        self.policy = "test-policy"
        self.path = self.repo_state / "config.json"

    def get(self, name, default=None):
        if name == "model_backend":
            return self._backend
        return self.extra.get(name, default)


def deepseek_backend(url, **overrides):
    value = {
        "provider": "deepseek",
        "protocol": "chat_completions",
        "endpoint_id": "fake-local",
        "base_url": url,
        "model": "fake-model",
        "credential_env": "PA_FAKE_DEEPSEEK_KEY",
        "max_retries": 1,
        "timeout": 3,
        "max_schema_repairs": 1,
        "task_profiles": {
            "knowledge": {"reasoning_effort": "medium", "max_tokens": 4096},
            "review": {"reasoning_effort": "xhigh", "max_tokens": 8192},
        },
    }
    value.update(overrides)
    return value


def answer(value, finish="stop"):
    return {
        "status": 200,
        "json": {"choices": [{"message": {"role": "assistant",
                                           "content": json.dumps(value, ensure_ascii=False)},
                               "finish_reason": finish}]},
    }


class FakeServer:
    def __init__(self, script):
        self.script = list(script)
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args):
                pass

            def _respond(self):
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length else b"{}"
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    body = None
                outer.requests.append({
                    "method": self.command,
                    "path": self.path,
                    "body": body,
                    "authorization": self.headers.get("Authorization"),
                })
                item = outer.script.pop(0) if outer.script else {"status": 500, "json": {}}
                if callable(item):
                    item = item(outer.requests[-1])
                payload = json.dumps(item.get("json", {})).encode("utf-8")
                self.send_response(item.get("status", 200))
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(payload)

            do_POST = _respond
            do_GET = _respond

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.httpd.daemon_threads = True
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def url(self):
        return "http://127.0.0.1:" + str(self.httpd.server_address[1])

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)


class BackendTests(unittest.TestCase):
    def test_schema_validator_rejects_missing_wrong_type_and_extra(self):
        validate_json({"summary": "ok", "gaps": []}, SIMPLE_SCHEMA)
        for bad in [{"gaps": []}, {"summary": 3, "gaps": []},
                    {"summary": "ok", "gaps": [], "extra": 1}]:
            with self.assertRaises(SchemaValidationError):
                validate_json(bad, SIMPLE_SCHEMA)

    def test_factory_requires_explicit_provider(self):
        with self.assertRaises(ModelConfigurationError):
            create_model(FakeConfig({}))
        with self.assertRaises(ModelConfigurationError):
            create_model(FakeConfig({"provider": "other"}))
        self.assertIsInstance(create_model(FakeConfig({"provider": "codex"})), Codex)
        model = create_model(FakeConfig(deepseek_backend("http://127.0.0.1:9")))
        self.assertIsInstance(model, DeepSeek)

    def test_missing_deepseek_credential_stops_before_request(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = FakeConfig(deepseek_backend("http://127.0.0.1:9"), repo_state=root / "state")
            with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": ""}, clear=False), \
                    patch("project_assistant.backends._windows_user_env", return_value=None):
                self.assertFalse(credential_status(config)["present"])
                with self.assertRaisesRegex(ModelConfigurationError, "missing"):
                    DeepSeek(config).invoke("analyze", SIMPLE_SCHEMA, root, root / "result.json")
            self.assertFalse((root / "result.json").exists())

    def test_missing_credential_file_falls_back_to_project_state_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo_state = root / "state"
            repo_state.mkdir(parents=True)
            atomic_json(repo_state / "credentials.json", {"PA_FAKE_DEEPSEEK_KEY": "local-secret"})
            backend = deepseek_backend("http://127.0.0.1:9")
            backend["credential_file"] = str(root / "other-project" / "credentials.json")
            config = FakeConfig(backend, repo_state=repo_state)
            from project_assistant.backends import backend_settings, resolve_secret
            with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": ""}, clear=False), \
                    patch("project_assistant.backends._windows_user_env", return_value=None):
                secret, source = resolve_secret(backend_settings(config), config)
            self.assertEqual(secret, "local-secret")
            self.assertEqual(source, "credential-file-local")

    def test_fake_server_source_round_is_bounded_and_recorded(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "file.py").write_text("value = 1\n", encoding="utf-8")
            old_journal = root / "state/model-resume/codex-old.json"
            old_journal.parent.mkdir(parents=True)
            atomic_json(old_journal, {"result": {"summary": "old-codex-result", "gaps": []}})
            first = {"summary": "need source", "gaps": [], "requested_sources": [
                {"snapshot": "head", "path": "file.py", "start_line": 1, "end_line": 5}]}
            final = {"summary": "done", "gaps": [], "requested_sources": []}
            with FakeServer([answer(first), answer(final)]) as server:
                config = FakeConfig(deepseek_backend(server.url), repo_state=root / "state")
                with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": "offline-test-key"}), \
                        patch("project_assistant.backends._windows_user_env", return_value=None):
                    result = DeepSeek(config).invoke("analyze", SIMPLE_SCHEMA, root, root / "result.json")
            self.assertEqual(result["summary"], "done")
            self.assertEqual(len(server.requests), 2)
            self.assertIn("1: value = 1", server.requests[1]["body"]["messages"][1]["content"])
            self.assertEqual(server.requests[0]["authorization"], "Bearer offline-test-key")
            self.assertEqual(read_json(root / "result.json")["summary"], "done")
            self.assertTrue(old_journal.exists())
            journals = list((root / "state/model-resume").glob("*.json"))
            deepseek_journals = [p for p in journals if p != old_journal]
            self.assertEqual(len(deepseek_journals), 1)
            self.assertEqual(read_json(deepseek_journals[0])["backend"]["provider"], "deepseek")

    def test_schema_error_gets_one_local_repair_then_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with FakeServer([answer({"summary": "bad"}), answer({"summary": "still bad"})]) as server:
                config = FakeConfig(deepseek_backend(server.url), repo_state=root / "state")
                with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": "offline-test-key"}), \
                        patch("project_assistant.backends._windows_user_env", return_value=None):
                    with self.assertRaises(SchemaValidationError):
                        DeepSeek(config).invoke("analyze", SIMPLE_SCHEMA, root, root / "result.json")
            self.assertEqual(len(server.requests), 2)
            self.assertFalse((root / "result.json").exists())

    def test_truncated_output_is_repaired_or_fails_without_publishing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            truncated = answer({"summary": "cut", "gaps": [], "requested_sources": []}, finish="length")
            with FakeServer([truncated, truncated]) as server:
                config = FakeConfig(deepseek_backend(server.url), repo_state=root / "state")
                with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": "offline-test-key"}), \
                        patch("project_assistant.backends._windows_user_env", return_value=None):
                    with self.assertRaises(ModelOutputTruncated):
                        DeepSeek(config).invoke("analyze", SIMPLE_SCHEMA, root, root / "result.json")
            self.assertEqual(len(server.requests), 2)
            self.assertFalse((root / "result.json").exists())

    def test_rate_limit_is_retried(self):
        final = {"summary": "after retry", "gaps": [], "requested_sources": []}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with FakeServer([{"status": 429, "json": {}}, answer(final)]) as server:
                config = FakeConfig(deepseek_backend(server.url), repo_state=root / "state")
                with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": "offline-test-key"}), \
                        patch("project_assistant.backends._windows_user_env", return_value=None), \
                        patch("project_assistant.backends.time.sleep"):
                    result = DeepSeek(config).invoke("analyze", SIMPLE_SCHEMA, root, root / "result.json")
            self.assertEqual(result["summary"], "after retry")
            self.assertEqual(len(server.requests), 2)

    def test_unreachable_endpoint_fails_after_bounded_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            probe = socket.socket()
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
            probe.close()
            config = FakeConfig(deepseek_backend("http://127.0.0.1:" + str(port),
                                                 max_retries=0, timeout=1), repo_state=root / "state")
            with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": "offline-test-key"}), \
                    patch("project_assistant.backends._windows_user_env", return_value=None), \
                    patch("project_assistant.backends.time.sleep"):
                with self.assertRaises(ModelTransportError):
                    DeepSeek(config).invoke("analyze", SIMPLE_SCHEMA, root, root / "result.json")
            self.assertFalse((root / "result.json").exists())

    def test_source_path_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bad = {"summary": "x", "gaps": [], "requested_sources": [
                {"snapshot": "head", "path": "../secret", "start_line": 1, "end_line": 1}]}
            with FakeServer([answer(bad)]) as server:
                config = FakeConfig(deepseek_backend(server.url), repo_state=root / "state")
                with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": "offline-test-key"}), \
                        patch("project_assistant.backends._windows_user_env", return_value=None):
                    with self.assertRaises(ValueError):
                        DeepSeek(config).invoke("analyze", SIMPLE_SCHEMA, root, root / "result.json")
            self.assertEqual(len(server.requests), 1)
            self.assertFalse((root / "result.json").exists())

    def test_deepseek_writable_feature_is_refused_before_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = FakeConfig(deepseek_backend("http://127.0.0.1:9"), repo_state=root / "state")
            model = DeepSeek(config)
            features = Features(config, model=model)
            task_dir = features.root / "task123"
            task_dir.mkdir(parents=True)
            atomic_json(task_dir / "task.json", {"id": "task123", "phase": "design", "workspace": str(root / "work"),
                                                 "request": "demo", "snapshot_id": "s", "branch": "develop"})
            atomic_json(task_dir / "design.json", {"open_questions": []})
            with self.assertRaises(UnsupportedModelCapability):
                features.implement("task123")
            self.assertEqual(read_json(task_dir / "task.json")["phase"], "design")
            self.assertFalse((task_dir / "implementation.json").exists())

    def test_doctor_is_provider_aware(self):
        locked = read_json(Path(__file__).resolve().parents[1] / "dependencies.lock.json")

        def fake_run(args, **kwargs):
            if "rev-parse" in args:
                return locked["understand"]["commit"] if "understand-anything" in str(args) else locked["experts"]["commit"]
            return ""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            deepseek_config = FakeConfig(deepseek_backend(""), repo_state=root / "ds")
            codex_config = FakeConfig({"provider": "codex"}, repo_state=root / "cx")
            with patch("project_assistant.cli.shutil.which",
                       side_effect=lambda name: "git.exe" if name == "git" else ("node.exe" if name == "node" else None)), \
                    patch("project_assistant.cli.run", side_effect=fake_run), \
                    patch("project_assistant.backends.run_command", side_effect=fake_run), \
                    patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": ""}, clear=False), \
                    patch("project_assistant.backends._windows_user_env", return_value=None):
                ds = doctor(deepseek_config, network=False)
                cx = doctor(codex_config, network=False)
            self.assertFalse(ds["ready"])
            self.assertEqual(ds["model"]["provider"], "deepseek")
            self.assertNotIn("codex", ds["checks"])
            self.assertNotIn("codex_auth", ds["checks"])
            self.assertFalse(ds["checks"]["model_credential"])
            self.assertFalse(cx["ready"])
            self.assertIn("codex", cx["checks"])
            self.assertIn("codex_auth", cx["checks"])
            self.assertNotIn("model_credential", cx["checks"])

    def test_artifact_identity_never_contains_secret_or_base_url(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = FakeConfig(deepseek_backend("http://127.0.0.1:9"), repo_state=root / "state")
            with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": "super-secret-value"}), \
                    patch("project_assistant.backends._windows_user_env", return_value=None):
                identity = artifact_identity(config)
            text = json.dumps(identity, ensure_ascii=False)
            self.assertNotIn("super-secret-value", text)
            self.assertNotIn("http://127.0.0.1", text)
            self.assertEqual(identity["credential"], {"present": True, "required": True})

    def test_resume_journal_is_provider_isolated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = FakeConfig({}, repo_state=root / "state")
            for provider in ("codex", "deepseek"):
                runner = AnalysisRunner(
                    config, {"provider": provider, "model": "same-model"},
                    "analyze", SIMPLE_SCHEMA, root, root / (provider + ".json"),
                    call=lambda prompt, schema, iteration: {
                        "summary": provider, "gaps": [], "requested_sources": []})
                runner.run()
            journals = list((root / "state/model-resume").glob("*.json"))
            self.assertEqual(len(journals), 2)
            providers = {read_json(path)["backend"]["provider"] for path in journals}
            self.assertEqual(providers, {"codex", "deepseek"})

    def test_backend_identity_changes_policy_but_not_credentials_or_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            backend = deepseek_backend("https://example.invalid/api", model="model-a",
                                       credential_env="KEY_A", timeout=30)
            base = {"name": "policy", "repo_url": "https://gitcode.com/test/repo",
                    "state_dir": "state", "model_backend": backend}
            atomic_json(root / "a.json", base)
            first = Config(root / "a.json").policy
            changed_secret = json.loads(json.dumps(base))
            changed_secret["model_backend"]["credential_env"] = "KEY_B"
            changed_secret["model_backend"]["timeout"] = 99
            atomic_json(root / "b.json", changed_secret)
            self.assertEqual(first, Config(root / "b.json").policy)
            changed_model = json.loads(json.dumps(base))
            changed_model["model_backend"]["model"] = "model-b"
            atomic_json(root / "c.json", changed_model)
            self.assertNotEqual(first, Config(root / "c.json").policy)

    def test_destination_is_secret_free(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = FakeConfig(deepseek_backend("http://127.0.0.1:9"), repo_state=root / "state")
            with patch.dict(os.environ, {"PA_FAKE_DEEPSEEK_KEY": "secret-xyz"}), \
                    patch("project_assistant.backends._windows_user_env", return_value=None):
                destination = model_destination(config)
            self.assertEqual(destination["provider"], "deepseek")
            self.assertNotIn("secret-xyz", json.dumps(destination))


if __name__ == "__main__":
    unittest.main()
