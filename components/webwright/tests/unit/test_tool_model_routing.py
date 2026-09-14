import pytest
import yaml

from webwright.config import get_config_from_spec
from webwright.models.anthropic_model import AnthropicModelConfig
from webwright.models.base import BaseModelConfig
from webwright.models.openai_chat_model import OpenAIChatModelConfig
from webwright.models.zhipu_model import ZhipuModelConfig
from webwright.tools.image_qa import run_image_qa
from webwright.tools.self_reflection import build_parser as build_self_reflection_parser
from webwright.tools._model_config import (
    DEFAULT_MERGED_CONFIG_RELPATH,
    _extract_model_block,
    resolve_model_config_path,
)
from webwright.utils.serialize import recursive_merge


def test_model_claude_sets_top_level_anthropic_model() -> None:
    config = recursive_merge(
        get_config_from_spec("base.yaml"),
        get_config_from_spec("model_claude.yaml"),
    )

    assert config["model"]["model_class"] == "anthropic"


def test_model_claude_does_not_declare_per_tool_overrides() -> None:
    config = get_config_from_spec("model_claude.yaml")

    assert "tools" not in config, "model_claude.yaml should rely on the top-level `model:` block"


def test_all_model_defaults_and_runtime_configs_use_40k_output_tokens() -> None:
    assert BaseModelConfig().max_output_tokens == 40000
    assert AnthropicModelConfig().max_output_tokens == 40000
    assert OpenAIChatModelConfig().max_output_tokens == 40000
    assert ZhipuModelConfig().max_output_tokens == 40000
    for config_name in ("base.yaml", "persistent_browser.yaml", "task_showcase.yaml"):
        assert get_config_from_spec(config_name)["model"]["max_output_tokens"] == 40000


def test_image_qa_uses_40k_output_tokens(tmp_path) -> None:
    image_path = tmp_path / "image.png"
    image_path.write_bytes(b"not-a-real-image")
    captured = {}

    def model_client(messages, **kwargs):
        captured["messages"] = messages
        captured.update(kwargs)
        return "{}"

    run_image_qa(
        image_path=image_path,
        question="What is visible?",
        model_client=model_client,
    )

    assert captured["max_output_tokens"] == 40000


def test_self_reflection_defaults_use_40k_output_tokens() -> None:
    args = build_self_reflection_parser().parse_args(["--config", "config.json"])

    assert args.image_max_new_tokens == 40000
    assert args.final_max_new_tokens == 40000


def test_extract_model_block_reads_top_level_model(tmp_path) -> None:
    config = {"model": {"model_class": "anthropic", "model_name": "claude-opus-4-7"}}

    assert _extract_model_block(config) == config["model"]


def test_extract_model_block_rejects_missing_block() -> None:
    with pytest.raises(ValueError, match="missing a top-level"):
        _extract_model_block({})


def test_resolve_model_config_path_prefers_explicit_arg(tmp_path) -> None:
    explicit = tmp_path / "explicit.yaml"
    explicit.write_text("model: {model_class: anthropic, model_name: claude-opus-4-7}\n")

    snapshot_dir = tmp_path / "ws" / DEFAULT_MERGED_CONFIG_RELPATH.parent
    snapshot_dir.mkdir(parents=True)
    (snapshot_dir / DEFAULT_MERGED_CONFIG_RELPATH.name).write_text(
        yaml.safe_dump({"model": {"model_class": "openai"}})
    )

    resolved = resolve_model_config_path(str(explicit), workspace_dir=str(tmp_path / "ws"))

    assert resolved == explicit.resolve()


def test_resolve_model_config_path_falls_back_to_workspace_snapshot(tmp_path) -> None:
    workspace = tmp_path / "ws"
    snapshot_path = workspace / DEFAULT_MERGED_CONFIG_RELPATH
    snapshot_path.parent.mkdir(parents=True)
    snapshot_path.write_text(
        yaml.safe_dump({"model": {"model_class": "anthropic", "model_name": "claude-opus-4-7"}})
    )

    resolved = resolve_model_config_path("", workspace_dir=str(workspace))

    assert resolved == snapshot_path.resolve()


def test_resolve_model_config_path_raises_when_nothing_found(tmp_path) -> None:
    with pytest.raises(FileNotFoundError, match="No tool model config found"):
        resolve_model_config_path("", workspace_dir=str(tmp_path))
