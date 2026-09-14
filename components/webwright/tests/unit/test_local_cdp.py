from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from webwright.utils import local_cdp


def test_default_user_data_dir_uses_webwright_home_on_windows() -> None:
    result = local_cdp.default_user_data_dir(
        platform_name="nt",
        environ={"WEBWRIGHT_HOME": "/tmp/webwright-home"},
    )

    assert result == Path("/tmp/webwright-home/browser/profile").resolve()


def test_default_user_data_dir_uses_explicit_browser_profile() -> None:
    result = local_cdp.default_user_data_dir(
        platform_name="posix",
        environ={"WEBWRIGHT_BROWSER_PROFILE": "/tmp/browser-profile"},
    )

    assert result == Path("/tmp/browser-profile")


def test_default_user_data_dir_falls_back_to_webwright_home(monkeypatch) -> None:
    monkeypatch.setattr(Path, "home", lambda: Path("C:/Users/test"))

    result = local_cdp.default_user_data_dir(platform_name="nt", environ={})

    assert result == Path(
        "C:/Users/test/.weworker/webwright/browser/profile"
    ).resolve()


def test_windows_candidates_include_registry_and_standard_locations(monkeypatch) -> None:
    monkeypatch.setattr(
        local_cdp,
        "_windows_registry_app_paths",
        lambda: ["D:/Browsers/Edge/msedge.exe"],
    )

    candidates = local_cdp.chromium_executable_candidates(
        platform_name="nt",
        environ={
            "PROGRAMFILES": "C:/Program Files",
            "PROGRAMFILES(X86)": "C:/Program Files (x86)",
            "LOCALAPPDATA": "C:/Users/test/AppData/Local",
        },
    )

    assert candidates[:4] == [
        "msedge.exe",
        "chrome.exe",
        "chromium.exe",
        "D:/Browsers/Edge/msedge.exe",
    ]
    assert str(Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe")) in candidates
    assert str(Path("C:/Users/test/AppData/Local/Google/Chrome/Application/chrome.exe")) in candidates


def test_windows_registry_app_paths_reads_app_paths(monkeypatch) -> None:
    class FakeKey:
        def __init__(self, value: str):
            self.value = value

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

    def open_key(hive, key_path, reserved, access):
        del reserved, access
        if hive == "HKCU" and key_path.endswith("chrome.exe"):
            return FakeKey("D:/Apps/Chrome/chrome.exe")
        raise OSError

    fake_winreg = SimpleNamespace(
        KEY_READ=1,
        KEY_WOW64_64KEY=2,
        KEY_WOW64_32KEY=4,
        HKEY_CURRENT_USER="HKCU",
        HKEY_LOCAL_MACHINE="HKLM",
        OpenKey=open_key,
        QueryValueEx=lambda key, name: (key.value, 1),
    )
    monkeypatch.setitem(sys.modules, "winreg", fake_winreg)

    paths = local_cdp._windows_registry_app_paths()

    assert paths == ["D:/Apps/Chrome/chrome.exe"]


def test_find_chromium_executable_prefers_explicit_path(tmp_path, monkeypatch) -> None:
    explicit = tmp_path / "chrome.exe"
    explicit.touch()
    monkeypatch.setenv("WEBWRIGHT_BROWSER_EXECUTABLE", str(tmp_path / "other.exe"))

    assert local_cdp.find_chromium_executable(str(explicit)) == str(explicit)


def test_find_chromium_executable_reports_attempted_paths(monkeypatch) -> None:
    monkeypatch.delenv("WEBWRIGHT_BROWSER_EXECUTABLE", raising=False)
    monkeypatch.setattr(local_cdp, "chromium_executable_candidates", lambda: ["missing-browser"])
    monkeypatch.setattr(local_cdp.shutil, "which", lambda candidate: None)

    with pytest.raises(FileNotFoundError, match="Tried: missing-browser"):
        local_cdp.find_chromium_executable()


def test_detached_process_kwargs_use_windows_creation_flags(monkeypatch) -> None:
    monkeypatch.setattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200, raising=False)
    monkeypatch.setattr(subprocess, "DETACHED_PROCESS", 0x8, raising=False)

    result = local_cdp.detached_process_kwargs(platform_name="nt")

    assert result == {"creationflags": 0x208}


def test_detached_process_kwargs_keep_posix_session_behavior() -> None:
    assert local_cdp.detached_process_kwargs(platform_name="posix") == {
        "start_new_session": True
    }


def test_launch_browser_forwards_platform_process_kwargs(tmp_path, monkeypatch) -> None:
    class FakeProcess:
        def poll(self):
            return None

    availability = iter([False, True])
    popen_calls = []
    monkeypatch.setattr(local_cdp, "is_cdp_available", lambda cdp_url: next(availability))
    monkeypatch.setattr(local_cdp, "find_chromium_executable", lambda path: "browser.exe")
    monkeypatch.setattr(
        local_cdp,
        "detached_process_kwargs",
        lambda: {"creationflags": 0x208},
    )
    monkeypatch.setattr(
        local_cdp.subprocess,
        "Popen",
        lambda command, **kwargs: popen_calls.append((command, kwargs)) or FakeProcess(),
    )

    local_cdp.launch_browser(
        local_cdp.DEFAULT_CDP_URL,
        user_data_dir=tmp_path / "profile",
    )

    assert popen_calls[0][0][0] == "browser.exe"
    assert popen_calls[0][1]["creationflags"] == 0x208
    assert "start_new_session" not in popen_calls[0][1]
