"""GUARDS of unchanged behaviour for the spend ledger (docs/ENGINES_PLAN.md slice 12).

These are not tests of the new code: they pass on the code as it was before the ledger and must keep passing after it. They
say what a default installation, a login chain and a file that never heard of `enforce` look like, so that the ledger cannot
change them without a test turning red. Nothing here imports the ledger.
"""

from __future__ import annotations

from freeduet.app import app
from freeduet.engines import Metered, parse_engines
from fake_engines import build
from gateway_support import data_with
from helpers import MANAGED_TOKEN, post_run, run_body, standing

AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
LIMIT = {"replay": "usage_limit.jsonl"}
ROW_KEYS = {
    "id", "label", "kind", "state", "available", "limited_until", "last_failure_kind", "consecutive_failures",
    "installed", "version", "signed_in", "probed_at", "probe_problem",
}


def test_a_login_chain_with_no_metered_engine_writes_no_ledger_and_shows_the_rows_it_always_showed(client, fake_cli, tmp_path):
    team = build(tmp_path, fake_cli)
    fake_cli.plan([LIMIT])
    team["codex"].plan([{"text": "Codex answered."}])
    app.state.engine_router, app.state.engine_state = team.router, team.state
    events = post_run(client, run_body([standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]))[0]
    assert "Codex answered." in "".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")
    assert not (fake_cli.data_dir / "engine-ledger.json").exists()
    shown = client.get("/engines", headers=AUTH).json()["engines"]
    assert [row["id"] for row in shown] == ["claude-code", "codex"]
    for row in shown:
        assert set(row) == ROW_KEYS  # no `spend`, no `refusal`: the row of every release before this one


def test_a_file_that_never_heard_of_enforce_reads_exactly_as_it_did(client):
    parsed = parse_engines(data_with(metered={"enabled": True, "currency": "EUR", "daily_cap": 5, "monthly_cap": 50}))
    assert parsed.metered == Metered(enabled=True, currency="EUR", daily_cap=5, monthly_cap=50)
    assert parse_engines(data_with()).metered == Metered(enabled=False, currency="EUR", daily_cap=0, monthly_cap=0)
