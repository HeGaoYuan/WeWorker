from __future__ import annotations

from pathlib import Path

from webwright.server.records import TaskStore
from webwright.server.status import (
    AGENT_EXIT_ERROR_MESSAGES,
    AGENT_EXIT_TO_TASK_STATUS,
    AgentExitStatus,
    ReplayStatus,
    STEP_STATUS_VALUES,
    StepStatus,
    TERMINAL_REPLAY_STATUSES,
    TERMINAL_TASK_STATUSES,
    TaskStatus,
)


def test_task_store_terminal_checks_use_shared_status_sets(tmp_path: Path) -> None:
    store = TaskStore(tmp_path / "tasks")

    assert "paused" not in {status.value for status in TaskStatus}

    for status in TaskStatus:
        assert store.is_terminal({"status": status.value}) is (status.value in TERMINAL_TASK_STATUSES)

    for status in ReplayStatus:
        assert store.is_replay_terminal({"status": status.value}) is (status.value in TERMINAL_REPLAY_STATUSES)


def test_agent_exit_statuses_map_to_task_statuses() -> None:
    assert set(AGENT_EXIT_TO_TASK_STATUS) == set(AgentExitStatus)
    assert AGENT_EXIT_TO_TASK_STATUS[AgentExitStatus.SUBMITTED] == TaskStatus.SUCCEEDED.value
    assert AGENT_EXIT_TO_TASK_STATUS[AgentExitStatus.PAUSED] == TaskStatus.WAITING_FOR_USER.value
    assert AGENT_EXIT_ERROR_MESSAGES[AgentExitStatus.FORMAT_ERROR]


def test_step_status_values_are_centralized() -> None:
    assert STEP_STATUS_VALUES == tuple(status.value for status in StepStatus)
    assert set(STEP_STATUS_VALUES) == {"unknown", "ok", "error", "done"}
