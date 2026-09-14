from __future__ import annotations

import json

import pytest

from webwright.models.anthropic_model import AnthropicModel
from webwright.models.openai_chat_model import OpenAIChatModel
from webwright.server.weworker_model_config import ManagedModelConfigError, load_managed_model_config


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode()


def payload(protocol: str = "openai_chat_completions") -> dict:
    return {
        "provider_id": "glm",
        "protocol": protocol,
        "model_class": "zhipu",
        "base_url": "https://example.test/v1",
        "model": "test-model",
        "api_key": "secret",
        "structured_output": "openai_json_object",
    }


def test_load_managed_model_config_uses_fixed_loopback_and_bearer() -> None:
    captured = {}

    def opener(request, timeout):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        return FakeResponse(payload())

    config = load_managed_model_config(
        {
            "WEWORKER_MODEL_CONFIG_URL": "http://127.0.0.1:8765/internal/webwright/model-config",
            "WEWORKER_MODEL_CONFIG_TOKEN": "launch-token",
        },
        opener=opener,
    )

    assert config.model == "test-model"
    assert captured == {
        "url": "http://127.0.0.1:8765/internal/webwright/model-config",
        "authorization": "Bearer launch-token",
        "timeout": 10,
    }


def test_load_managed_model_config_rejects_incompatible_model_class() -> None:
    bad_payload = payload("anthropic_messages")
    bad_payload["structured_output"] = "anthropic_json_schema"

    with pytest.raises(ManagedModelConfigError, match="incompatible model class"):
        load_managed_model_config(
            {
                "WEWORKER_MODEL_CONFIG_URL": "http://127.0.0.1:8765/internal/webwright/model-config",
                "WEWORKER_MODEL_CONFIG_TOKEN": "launch-token",
            },
            opener=lambda *_args, **_kwargs: FakeResponse(bad_payload),
        )


def test_load_managed_model_config_accepts_http_model_base_url() -> None:
    http_payload = payload()
    http_payload["base_url"] = "http://gateway.example/v1"

    config = load_managed_model_config(
        {
            "WEWORKER_MODEL_CONFIG_URL": "http://127.0.0.1:8765/internal/webwright/model-config",
            "WEWORKER_MODEL_CONFIG_TOKEN": "launch-token",
        },
        opener=lambda *_args, **_kwargs: FakeResponse(http_payload),
    )

    assert config.base_url == "http://gateway.example/v1"


def test_load_managed_model_config_rejects_non_fixed_url() -> None:
    with pytest.raises(ManagedModelConfigError, match="unavailable"):
        load_managed_model_config(
            {"WEWORKER_MODEL_CONFIG_URL": "http://localhost:8765/internal/webwright/model-config", "WEWORKER_MODEL_CONFIG_TOKEN": "x"}
        )


def test_openai_chat_payload_uses_json_object() -> None:
    model = OpenAIChatModel(
        model_name="test-model",
        openai_chat_api_key="secret",
        openai_chat_endpoint="https://example.test/chat/completions",
    )
    request = model._build_payload([{"role": "user", "content": "json please"}])
    assert request["response_format"] == {"type": "json_object"}
    assert model._build_text_payload([{"role": "user", "content": "hello"}]).get("response_format") is None


def test_deepseek_empty_structured_repair_disables_thinking() -> None:
    model = OpenAIChatModel(
        provider_id="deepseek",
        model_name="deepseek-v4-flash",
        openai_chat_api_key="secret",
        openai_chat_endpoint="https://api.deepseek.com/chat/completions",
    )

    request = model._build_structured_repair_payload(
        [{"role": "user", "content": "Return JSON."}],
        schema={"type": "object"},
        schema_name="developer_slot",
        raw_text="",
        error="Empty content",
    )

    assert request["response_format"] == {"type": "json_object"}
    assert request["thinking"] == {"type": "disabled"}


def test_deepseek_nonempty_structured_repair_keeps_default_thinking() -> None:
    model = OpenAIChatModel(
        provider_id="deepseek",
        model_name="deepseek-v4-flash",
        openai_chat_api_key="secret",
        openai_chat_endpoint="https://api.deepseek.com/chat/completions",
    )

    request = model._build_structured_repair_payload(
        [],
        schema={"type": "object"},
        schema_name="developer_slot",
        raw_text="not json",
        error="Invalid JSON",
    )

    assert "thinking" not in request


def test_custom_empty_structured_repair_does_not_send_provider_specific_thinking() -> None:
    model = OpenAIChatModel(
        provider_id="custom",
        model_name="custom-model",
        openai_chat_api_key="secret",
        openai_chat_endpoint="https://example.test/chat/completions",
    )

    request = model._build_structured_repair_payload(
        [],
        schema={"type": "object"},
        schema_name="developer_slot",
        raw_text="",
        error="Empty content",
    )

    assert "thinking" not in request


def test_anthropic_payload_uses_native_json_schema() -> None:
    model = AnthropicModel(anthropic_api_key="secret", model_name="claude-test")
    request = model._build_payload([{"role": "user", "content": "next"}])
    assert request["output_config"]["format"]["type"] == "json_schema"
    assert request["output_config"]["format"]["schema"]["additionalProperties"] is False
    assert "output_config" not in model._build_text_payload([{"role": "user", "content": "hello"}])


def test_anthropic_developer_payload_uses_supplied_json_schema() -> None:
    model = AnthropicModel(anthropic_api_key="secret", model_name="claude-test")
    schema = {
        "type": "object",
        "properties": {"code": {"type": "string"}},
        "required": ["code"],
    }

    request = model._build_structured_payload(
        [{"role": "user", "content": "Build it."}],
        schema=schema,
        schema_name="developer_slot",
    )

    assert request["output_config"]["format"] == {
        "type": "json_schema",
        "schema": schema,
    }
