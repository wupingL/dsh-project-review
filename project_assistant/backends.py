from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from .common import run as run_command
from .model import AnalysisRunner, Codex, GUARD, task_kind
from .schema import SchemaValidationError, validate_json


class ModelConfigurationError(RuntimeError):
    """The selected backend is not configured well enough to send a request."""


class ModelTransportError(RuntimeError):
    """The model endpoint was unreachable or returned a retryable failure."""


class ModelResponseError(RuntimeError):
    """The endpoint returned a response that is not a usable model answer."""


class ModelOutputTruncated(ModelResponseError):
    """The endpoint reported that generation stopped at a length limit."""


class UnsupportedModelCapability(RuntimeError):
    """The selected backend cannot perform a requested controlled action."""


TASK_PROFILES = ("knowledge", "review", "feature_design", "feature_delivery", "generic")
DEFAULT_TASK_PROFILES = {
    "knowledge": {"max_tokens": 8192},
    "review": {"max_tokens": 16384},
    "feature_design": {"max_tokens": 12288},
    "feature_delivery": {"max_tokens": 12288},
    "generic": {"max_tokens": 8192},
}
SUPPORTED_PROTOCOLS = {"chat_completions"}
_REQUEST_OPTION_KEYS = {
    "temperature", "top_p", "max_tokens", "max_completion_tokens", "thinking",
    "stop", "frequency_penalty", "presence_penalty", "response_format",
}


def _profile_table(config, raw):
    profiles = {}
    legacy = {"knowledge": config.get("knowledge_reasoning_effort"),
              "review": config.get("review_reasoning_effort")}
    supplied = raw.get("task_profiles", {}) if isinstance(raw.get("task_profiles", {}), dict) else {}
    for name in TASK_PROFILES:
        profile = dict(DEFAULT_TASK_PROFILES[name])
        if isinstance(supplied.get(name), dict):
            profile.update(supplied[name])
        if legacy.get(name) and "reasoning_effort" not in profile:
            profile["reasoning_effort"] = legacy[name]
        profiles[name] = profile
    for name, profile in supplied.items():
        if name not in profiles and isinstance(profile, dict):
            profiles[name] = dict(profile)
    return profiles


def _as_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def backend_settings(config):
    raw = config.get("model_backend")
    if not isinstance(raw, dict) or not raw:
        raise ModelConfigurationError(
            "model_backend is not configured; set provider to codex or deepseek explicitly")
    provider = str(raw.get("provider", "")).strip().lower()
    if not provider:
        raise ModelConfigurationError("model_backend.provider is required; no silent fallback is allowed")
    if provider not in {"codex", "deepseek"}:
        raise ModelConfigurationError(
            f"Unsupported model provider {provider!r}; expected codex or deepseek")
    timeout = max(1, _as_int(raw.get("timeout", config.get("model_timeout", 1800)), 1800))
    settings = {
        "provider": provider,
        "protocol": str(raw.get("protocol", "chat_completions")).strip(),
        "endpoint_id": str(raw.get("endpoint_id", "")).strip(),
        "base_url": str(raw.get("base_url", "")).strip(),
        "model": str(raw.get("model", "")).strip(),
        "credential_env": str(raw.get("credential_env", "DEEPSEEK_API_KEY")).strip(),
        "credential_file": str(raw.get("credential_file", "")).strip(),
        "credential_key": str(raw.get("credential_key", "")).strip(),
        "timeout": timeout,
        "max_retries": max(0, min(5, _as_int(raw.get("max_retries", 2), 2))),
        "max_schema_repairs": max(0, min(1, _as_int(raw.get("max_schema_repairs", 1), 1))),
        "task_profiles": _profile_table(config, raw),
    }
    if settings["endpoint_id"]:
        return settings
    if settings["base_url"]:
        settings["endpoint_id"] = urlsplit(settings["base_url"]).hostname or ""
    return settings


def _windows_user_env(name):
    if os.name != "nt":
        return None
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
        return value
    except OSError:
        return None


def resolve_secret(settings, config):
    """Resolve a credential without ever returning it in diagnostics."""
    name = settings.get("credential_env") or "DEEPSEEK_API_KEY"
    value = os.environ.get(name)
    if value:
        return value, "process-env"
    value = _windows_user_env(name)
    if value:
        return value, "windows-user-env"
    path = settings.get("credential_file")
    key = settings.get("credential_key") or name

    def _read(candidate):
        if not candidate.is_file():
            return None
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ModelConfigurationError(
                "credential_file could not be read as JSON") from exc
        value = data.get(key) if isinstance(data, dict) else None
        return str(value) if value else None

    if path:
        candidate = Path(path)
        if not candidate.is_absolute() and getattr(config, "path", None):
            candidate = Path(config.path).parent / candidate
        value = _read(candidate)
        if value:
            return value, "credential-file"
    # 自愈：配置里可能残留了其他项目/已删除项目的凭据路径（例如项目被移除后重建），
    # 此时回退到本项目自己的状态目录凭据文件。
    local = getattr(config, "repo_state", None)
    if local is not None:
        fallback = Path(local) / "credentials.json"
        if str(fallback) != str(path):
            value = _read(fallback)
            if value:
                return value, "credential-file-local"
    return None, "missing"


def _validate_endpoint(value):
    parsed = urlsplit(value)
    if not parsed.hostname:
        raise ModelConfigurationError("model endpoint must include a hostname")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ModelConfigurationError(
            "model endpoint must not contain credentials, query strings or fragments")
    if parsed.scheme == "https":
        return
    if parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}:
        return
    raise ModelConfigurationError("model endpoint must use HTTPS (loopback HTTP is allowed for tests)")


def _endpoint(settings, suffix):
    base = settings["base_url"].rstrip("/")
    return base + "/" + suffix.lstrip("/")


def credential_status(config):
    try:
        settings = backend_settings(config)
    except Exception as exc:
        return {"present": False, "reason": str(exc)}
    if settings["provider"] != "deepseek":
        return {"present": True, "required": False, "source": "not-required"}
    try:
        value, source = resolve_secret(settings, config)
    except Exception as exc:
        return {"present": False, "reason": str(exc)}
    return {"present": bool(value), "required": True, "source": source,
            "env": settings["credential_env"]}


def model_destination(config):
    try:
        settings = backend_settings(config)
    except Exception as exc:
        return {"configured": False, "provider": None, "error": str(exc)}
    destination = {
        "configured": True,
        "provider": settings["provider"],
        "protocol": settings["protocol"],
        "endpoint_id": settings["endpoint_id"],
        "base_url": settings["base_url"] or None,
        "model": settings["model"] or None,
        "supports_writable": settings["provider"] == "codex",
        "task_profiles": {
            name: {key: value for key, value in profile.items()
                   if key in {"model", "reasoning_effort", "max_tokens", "thinking", "request_options"}}
            for name, profile in settings["task_profiles"].items()},
        "policy": getattr(config, "policy", None),
    }
    if settings["provider"] == "deepseek":
        destination["credential"] = credential_status(config)
    return destination


def artifact_identity(config):
    """A secret-free identity stored beside snapshots and reports."""
    destination = model_destination(config)
    destination.pop("base_url", None)
    credential = destination.get("credential")
    if isinstance(credential, dict):
        destination["credential"] = {"present": bool(credential.get("present")),
                                     "required": bool(credential.get("required", True))}
    return destination


def create_model(config):
    settings = backend_settings(config)
    if settings["provider"] == "codex":
        return Codex(config)
    if settings["provider"] == "deepseek":
        return DeepSeek(config)
    raise ModelConfigurationError(f"Unsupported model provider {settings['provider']!r}")


def _http_json(method, url, headers, body, timeout):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read()
            status = getattr(response, "status", 200)
    except HTTPError as exc:
        # Status is enough for retry/auth classification.  Do not read or echo
        # the body: gateways can reflect request fragments in diagnostics.
        return exc.code, {}
    except (URLError, TimeoutError, OSError) as exc:
        raise ModelTransportError(f"model endpoint is unreachable ({type(exc).__name__})") from None
    try:
        return status, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise ModelResponseError("model endpoint returned non-JSON data") from exc


def _sanitized_http_error(status):
    if status in {401, 403}:
        return ModelConfigurationError(
            f"model authentication or permission failed (HTTP {status})")
    return ModelTransportError(f"model endpoint returned HTTP {status}")


class DeepSeek:
    supports_writable = False
    provider = "deepseek"

    def __init__(self, config):
        self.config = config

    def _ready(self):
        settings = backend_settings(self.config)
        if settings["provider"] != "deepseek":
            raise ModelConfigurationError("DeepSeek backend selected for a non-deepseek provider")
        if not settings["base_url"]:
            raise ModelConfigurationError("model_backend.base_url is not configured; no request was sent")
        _validate_endpoint(settings["base_url"])
        if not settings["model"]:
            raise ModelConfigurationError("model_backend.model is not configured; no request was sent")
        if settings["protocol"] not in SUPPORTED_PROTOCOLS:
            raise ModelConfigurationError(
                f"Unsupported DeepSeek protocol {settings['protocol']!r}; enable it only after deployment verification")
        secret, source = resolve_secret(settings, self.config)
        if not secret:
            raise ModelConfigurationError(
                f"DeepSeek credential {settings['credential_env']} is missing; no request was sent")
        return settings, secret, source

    def invoke(self, prompt, schema, cwd, output, *, writable=False, sources=None):
        if writable:
            raise UnsupportedModelCapability(
                "DeepSeek API backend has no controlled writable executor. "
                "feature implement/verify is disabled; no workspace change was attempted.")
        settings, secret, _source = self._ready()
        kind = task_kind(schema)
        profile = settings["task_profiles"].get(kind, settings["task_profiles"]["generic"])
        model = profile.get("model") or settings["model"]
        signature = {
            "provider": "deepseek",
            "engine": "deepseek-http",
            "endpoint_id": settings["endpoint_id"],
            "base_url": settings["base_url"],
            "protocol": settings["protocol"],
            "model": model,
            "task_kind": kind,
            "task_profile": profile,
        }

        def call(current_prompt, current_schema, iteration):
            return self._call_with_repairs(current_prompt, current_schema, iteration,
                                           output, settings, profile, model, secret)

        return AnalysisRunner(self.config, signature, prompt, schema, cwd, output,
                              writable=False, sources=sources, call=call).run()

    def _call_with_repairs(self, prompt, schema, iteration, output,
                           settings, profile, model, secret):
        attempts = 1 + settings["max_schema_repairs"]
        current = prompt
        last_error = None
        for attempt in range(attempts):
            started = time.monotonic()
            try:
                info = self._post_chat(current, schema, settings, profile, model, secret)
                value = _parse_json_content(info["content"])
                validate_json(value, schema)
                self._log(output, iteration, attempt, started, info, None)
                return value
            except (ModelOutputTruncated, SchemaValidationError, ModelResponseError) as exc:
                last_error = exc
                self._log(output, iteration, attempt, started, None, type(exc).__name__)
                current = prompt + (
                    "\n上一次输出未通过本地 JSON Schema 或截断检查。"
                    "请重新输出一个完整、严格的 JSON 对象，不要包含 Markdown 代码围栏或解释。"
                    f"\n本地错误：{exc}")
        if last_error is None:
            last_error = ModelResponseError("model output could not be validated")
        raise last_error

    def _post_chat(self, prompt, schema, settings, profile, model, secret):
        url = _endpoint(settings, "chat/completions")
        request_options = dict(profile.get("request_options") or {})
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": GUARD},
                {"role": "user", "content": prompt
                 + "\n输出必须是符合以下 JSON Schema 的 JSON 对象：\n"
                 + json.dumps(schema, ensure_ascii=False)},
            ],
            "stream": False,
        }
        response_format = request_options.pop("response_format", profile.get("response_format"))
        payload["response_format"] = response_format or {"type": "json_object"}
        for key in _REQUEST_OPTION_KEYS:
            if key in profile:
                payload[key] = profile[key]
        for key, value in request_options.items():
            if key in _REQUEST_OPTION_KEYS:
                payload[key] = value
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": "Bearer " + secret,
            "User-Agent": "project-assistant/0.1",
        }
        timeout = max(1, int(settings["timeout"]))
        attempts = settings["max_retries"] + 1
        for attempt in range(attempts):
            try:
                status, data = _http_json("POST", url, headers, payload, timeout)
            except ModelTransportError as exc:
                if attempt + 1 >= attempts:
                    raise ModelTransportError(
                        f"DeepSeek request failed after {attempts} attempt(s): {exc}") from None
                time.sleep(min(8, 2 ** attempt))
                continue
            except ModelConfigurationError:
                raise
            if status in {429, 500, 502, 503, 504}:
                if attempt + 1 >= attempts:
                    raise _sanitized_http_error(status)
                time.sleep(min(8, 2 ** attempt))
                continue
            if status != 200:
                raise _sanitized_http_error(status)
            info = self._parse_response(data)
            info["request"] = {
                key: payload[key] for key in
                ("model", "max_tokens", "max_completion_tokens", "thinking",
                 "temperature", "top_p", "response_format")
                if key in payload
            }
            return info
        raise AssertionError("Unreachable")

    @staticmethod
    def _parse_response(data):
        if not isinstance(data, dict) or not isinstance(data.get("choices"), list) or not data["choices"]:
            raise ModelResponseError("DeepSeek response has no choices")
        choice = data["choices"][0]
        finish = choice.get("finish_reason")
        if finish == "length":
            raise ModelOutputTruncated("DeepSeek output was truncated at the token limit")
        message = choice.get("message") or {}
        content = message.get("content")
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        if not isinstance(content, str) or not content.strip():
            raise ModelResponseError("DeepSeek response has empty content")
        return {"content": content, "finish_reason": finish, "usage": data.get("usage")}

    @staticmethod
    def _log(output, iteration, attempt, started, info, error):
        record = {
            "iteration": iteration,
            "attempt": attempt,
            "duration_ms": int((time.monotonic() - started) * 1000),
            "error": error,
        }
        if info:
            record.update(finish_reason=info.get("finish_reason"), usage=info.get("usage"),
                          request=info.get("request"))
        path = Path(output).with_suffix(f".round-{iteration}-attempt-{attempt}.log")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")


def _parse_json_content(content):
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        value = json.loads(text)
    except ValueError as exc:
        raise ModelResponseError("DeepSeek content is not valid JSON") from exc
    if not isinstance(value, dict):
        raise ModelResponseError("DeepSeek content is not a JSON object")
    return value


def probe_deepseek(config):
    settings = backend_settings(config)
    if settings["provider"] != "deepseek":
        return False, "provider is not deepseek"
    try:
        _validate_endpoint(settings["base_url"])
    except Exception as exc:
        return False, str(exc)
    secret, _ = resolve_secret(settings, config)
    if not secret:
        return False, "credential is missing; network probe skipped"
    url = _endpoint(settings, "models")
    headers = {"Accept": "application/json", "Authorization": "Bearer " + secret,
               "User-Agent": "project-assistant/0.1"}
    try:
        status, _ = _http_json("GET", url, headers, None, min(30, max(1, int(settings["timeout"]))))
    except Exception as exc:
        return False, str(exc)
    return status == 200, None if status == 200 else f"model endpoint returned HTTP {status}"


def backend_checks(config, network=False):
    checks = {}
    errors = {}
    try:
        settings = backend_settings(config)
    except Exception as exc:
        return {"checks": {"model_provider": False}, "errors": {"model_provider": str(exc)}}
    provider = settings["provider"]
    checks["model_provider"] = provider in {"codex", "deepseek"}
    if provider == "codex":
        exe = shutil.which("codex")
        checks["codex"] = exe is not None
        if not exe:
            errors["codex"] = "Codex CLI is unavailable for the configured codex provider"
        try:
            run_command(["codex", "login", "status"], timeout=30)
            checks["codex_auth"] = True
        except Exception as exc:
            checks["codex_auth"] = False
            errors["codex_auth"] = str(exc)
        return {"checks": checks, "errors": errors}
    checks["model_protocol"] = settings["protocol"] in SUPPORTED_PROTOCOLS
    if not checks["model_protocol"]:
        errors["model_protocol"] = (
            f"protocol {settings['protocol']!r} is not enabled; verify the deployment before using it")
    try:
        if not settings["base_url"]:
            raise ModelConfigurationError("model_backend.base_url is not configured")
        _validate_endpoint(settings["base_url"])
        checks["model_endpoint"] = True
    except Exception as exc:
        checks["model_endpoint"] = False
        errors["model_endpoint"] = str(exc)
    checks["model_name"] = bool(settings["model"])
    if not checks["model_name"]:
        errors["model_name"] = "model_backend.model is not configured"
    credential = credential_status(config)
    checks["model_credential"] = bool(credential.get("present"))
    if not checks["model_credential"]:
        errors["model_credential"] = (
            f"credential {settings['credential_env']} is missing from process/user environment "
            "or the configured credential file")
    if network:
        if all(checks.values()) and checks["model_credential"]:
            ok, detail = probe_deepseek(config)
            checks["deepseek_network"] = ok
            if not ok:
                errors["deepseek_network"] = detail or "model endpoint probe failed"
        else:
            checks["deepseek_network"] = False
            errors["deepseek_network"] = "network probe skipped until configuration and credential checks pass"
    return {"checks": checks, "errors": errors}
