from __future__ import annotations

import pytest

from webwright.server.model_providers import get_provider, list_providers, provider_ids


def test_provider_ids_cover_supported_backends() -> None:
    assert set(provider_ids()) == {"zhipu", "openai", "anthropic", "openrouter"}


@pytest.mark.parametrize(
    ("provider_id", "env_var", "endpoint_field", "config_file"),
    [
        ("zhipu", "ZHIPUAI_API_KEY", "zhipu_endpoint", "model_zhipu.yaml"),
        ("openai", "OPENAI_API_KEY", "openai_endpoint", "model_openai.yaml"),
        ("anthropic", "ANTHROPIC_API_KEY", "anthropic_endpoint", "model_claude.yaml"),
        ("openrouter", "OPENROUTER_API_KEY", "openrouter_endpoint", "model_openrouter.yaml"),
    ],
)
def test_provider_derived_fields(provider_id, env_var, endpoint_field, config_file) -> None:
    meta = get_provider(provider_id)
    assert meta["env_var"] == env_var
    assert meta["endpoint_field"] == endpoint_field
    assert meta["config_file"] == config_file
    assert meta["default_endpoint"]  # populated from the shipped model_*.yaml
    assert meta["default_model_name"]


def test_get_provider_rejects_unknown() -> None:
    with pytest.raises(ValueError):
        get_provider("gemini")


def test_list_providers_shape() -> None:
    providers = list_providers()
    assert {p["id"] for p in providers} == {"zhipu", "openai", "anthropic", "openrouter"}
    for provider in providers:
        assert set(provider) == {"id", "label", "default_endpoint", "default_model_name"}
