"""FreeDuet: this harness never accepts a Claude plan token (docs/PROVIDERS.md)."""

import importlib
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_the_plan_token_is_dropped_before_the_sdk_can_read_it(monkeypatch, capsys):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "synthetic-test-key")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "sk-ant-oat01-invented")
    monkeypatch.setenv("MANAGED_AGENT_TOKEN", "valid-test-token")
    from src import main

    importlib.reload(main)

    assert "CLAUDE_CODE_OAUTH_TOKEN" not in os.environ
    assert "FreeDuet ignores CLAUDE_CODE_OAUTH_TOKEN" in capsys.readouterr().out


def test_a_plan_token_alone_is_not_enough_to_start(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "sk-ant-oat01-invented")
    monkeypatch.setenv("MANAGED_AGENT_TOKEN", "valid-test-token")
    from src import main

    with pytest.raises(SystemExit, match="ANTHROPIC_API_KEY"):
        importlib.reload(main)
