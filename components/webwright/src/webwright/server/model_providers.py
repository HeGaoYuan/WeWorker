"""Registry of the model providers the server UI can configure.

The CLI stacks a ``model_*.yaml`` (provider config file) plus optional inline
overrides. The server exposes the same providers as pickable options. This
module is the single source of truth: it statically declares each provider's
label + config file + model_class, and derives everything else from the model
class (``_ENV_VAR`` / ``_API_KEY_FIELD``) and the shipped ``model_*.yaml``
defaults so the two never drift.
"""

from __future__ import annotations

from typing import Any

from webwright.config import get_config_from_spec
from webwright.models import get_model_class

# provider id -> static declaration. Everything else is derived below.
_PROVIDERS: dict[str, dict[str, str]] = {
    "zhipu": {"label": "智谱 GLM", "config_file": "model_zhipu.yaml", "model_class": "zhipu"},
    "openai": {"label": "OpenAI", "config_file": "model_openai.yaml", "model_class": "openai"},
    "anthropic": {"label": "Anthropic Claude", "config_file": "model_claude.yaml", "model_class": "anthropic"},
    "openrouter": {"label": "OpenRouter", "config_file": "model_openrouter.yaml", "model_class": "openrouter"},
}


def provider_ids() -> list[str]:
    return list(_PROVIDERS)


def get_provider(provider_id: str) -> dict[str, Any]:
    """Return the resolved metadata for ``provider_id``.

    Raises ``ValueError`` for unknown providers.
    """
    static = _PROVIDERS.get(provider_id)
    if static is None:
        raise ValueError(f"Unknown model provider: {provider_id!r}")

    model_class = get_model_class(static["model_class"])
    api_key_field = model_class._API_KEY_FIELD
    env_var = model_class._ENV_VAR
    endpoint_field = api_key_field.replace("_api_key", "_endpoint")

    model_block = get_config_from_spec(static["config_file"]).get("model") or {}

    return {
        "id": provider_id,
        "label": static["label"],
        "config_file": static["config_file"],
        "model_class": static["model_class"],
        "api_key_field": api_key_field,
        "env_var": env_var,
        "endpoint_field": endpoint_field,
        "default_endpoint": model_block.get(endpoint_field, "") or "",
        "default_model_name": model_block.get("model_name", "") or "",
    }


def list_providers() -> list[dict[str, Any]]:
    """UI-facing provider options for the model-config dropdown."""
    return [
        {
            "id": meta["id"],
            "label": meta["label"],
            "default_endpoint": meta["default_endpoint"],
            "default_model_name": meta["default_model_name"],
        }
        for meta in (get_provider(pid) for pid in _PROVIDERS)
    ]
