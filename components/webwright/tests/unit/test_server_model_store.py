from __future__ import annotations

from pathlib import Path

import pytest

from webwright.server.model_store import ModelConfigStore


def test_create_marks_first_config_active_and_persists(tmp_path: Path) -> None:
    store = ModelConfigStore(tmp_path / "models.json")
    model = store.create(label="gw", provider="openai", base_url="https://x/v1", api_key="sk-1")

    assert store.active_id() == model["id"]
    assert store.get_active()["api_key"] == "sk-1"
    # Second config does not steal activation.
    other = store.create(provider="zhipu", api_key="zk")
    assert store.active_id() == model["id"]
    assert other["id"] != model["id"]


def test_update_keeps_key_when_blank_and_overwrites_when_set(tmp_path: Path) -> None:
    store = ModelConfigStore(tmp_path / "models.json")
    model = store.create(provider="openai", base_url="https://x/v1", api_key="sk-1")

    store.update(model["id"], base_url="https://y/v1")
    kept = store.get(model["id"])
    assert kept["api_key"] == "sk-1"
    assert kept["base_url"] == "https://y/v1"

    store.update(model["id"], api_key="sk-2")
    assert store.get(model["id"])["api_key"] == "sk-2"


def test_delete_active_clears_active_id(tmp_path: Path) -> None:
    store = ModelConfigStore(tmp_path / "models.json")
    model = store.create(provider="zhipu", api_key="zk")
    assert store.active_id() == model["id"]

    store.delete(model["id"])
    assert store.active_id() == ""
    assert store.get_active() is None


def test_set_active_and_missing_lookups_raise(tmp_path: Path) -> None:
    store = ModelConfigStore(tmp_path / "models.json")
    a = store.create(provider="openai", api_key="sk-1")
    b = store.create(provider="zhipu", api_key="zk")

    store.set_active(b["id"])
    assert store.active_id() == b["id"]

    with pytest.raises(KeyError):
        store.set_active("nope")
    with pytest.raises(KeyError):
        store.get("nope")
    with pytest.raises(KeyError):
        store.delete("nope")
    assert a["id"] != b["id"]


def test_create_rejects_unknown_provider(tmp_path: Path) -> None:
    store = ModelConfigStore(tmp_path / "models.json")
    with pytest.raises(ValueError):
        store.create(provider="gemini", api_key="x")
