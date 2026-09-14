from __future__ import annotations

from pathlib import Path

from webwright.run import local_cdp_replay


def test_replay_executes_persisted_first_step_navigation(monkeypatch, tmp_path: Path) -> None:
    task_output_dir = tmp_path / "task"
    replay_output_dir = tmp_path / "replay"
    steps_dir = task_output_dir / "steps"
    steps_dir.mkdir(parents=True)
    navigation = 'await page.goto("https://example.com/", wait_until="domcontentloaded")'
    (steps_dir / "step_0001.py").write_text(
        f"{navigation}\nprint(page.url)",
        encoding="utf-8",
    )

    class FakeEnv:
        def __init__(self):
            self.executed: list[str] = []
            self.prepared: dict = {}

        def prepare(self, **kwargs) -> None:
            self.prepared = kwargs

        def serialize(self) -> dict:
            return {
                "environment": {
                    "runtime_state": {
                        "target_id": "replay-target",
                        "page_selection_source": "new_page",
                    }
                }
            }

        def execute(self, action: dict) -> dict:
            self.executed.append(action["python_code"])
            return {"returncode": 0, "output": "", "observation": {}}

        def close(self) -> None:
            return None

    env = FakeEnv()
    monkeypatch.setattr(
        local_cdp_replay,
        "LocalBrowserEnvironment",
        lambda **kwargs: env,
    )

    result = local_cdp_replay.run_replay(
        {
            "task_id": "demo",
            "task_output_dir": str(task_output_dir),
            "replay_output_dir": str(replay_output_dir),
            "from_step": 1,
            "to_step": 1,
            "new_tab": True,
            "delay_ms": 0,
        }
    )

    assert result == 0
    assert env.executed[0].splitlines()[0] == navigation
    assert env.prepared["replay_target_id"] == ""
    runtime = (replay_output_dir / "runtime.json").read_text(encoding="utf-8")
    assert '"target_id": "replay-target"' in runtime


def test_replay_passes_saved_target_when_new_tab_is_false(monkeypatch, tmp_path: Path) -> None:
    task_output_dir = tmp_path / "task"
    replay_output_dir = tmp_path / "replay"
    (task_output_dir / "steps").mkdir(parents=True)
    (task_output_dir / "steps" / "step_0001.py").write_text(
        'await page.goto("https://example.com/", wait_until="domcontentloaded")',
        encoding="utf-8",
    )

    class FakeEnv:
        def prepare(self, **kwargs) -> None:
            self.prepared = kwargs

        def serialize(self) -> dict:
            return {"environment": {"runtime_state": {"target_id": "target-1"}}}

        def execute(self, action: dict) -> dict:
            return {"returncode": 0, "output": "", "observation": {}}

        def close(self) -> None:
            return None

    env = FakeEnv()
    constructor_kwargs: dict = {}

    def fake_environment(**kwargs):
        constructor_kwargs.update(kwargs)
        return env

    monkeypatch.setattr(local_cdp_replay, "LocalBrowserEnvironment", fake_environment)

    result = local_cdp_replay.run_replay(
        {
            "task_id": "demo",
            "task_output_dir": str(task_output_dir),
            "replay_output_dir": str(replay_output_dir),
            "from_step": 1,
            "to_step": 1,
            "new_tab": False,
            "target_id": "target-1",
            "start_url": "https://example.com/",
        }
    )

    assert result == 0
    assert constructor_kwargs["local_cdp_new_page"] is True
    assert env.prepared["replay_target_id"] == "target-1"
    assert env.prepared["start_url"] == "https://example.com/"
