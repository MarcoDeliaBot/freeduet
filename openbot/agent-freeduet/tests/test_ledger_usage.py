"""What an engine reports about a turn, as the spend ledger takes it (docs/ENGINES_PLAN.md slice 12).

Only what the engine itself printed: token counts, and never a price of FreeDuet's own. The cost the Claude Code CLI prints
(`total_cost_usd`) is not read, because it is a client-side estimate from a price table bundled with the CLI (Anthropic's
cost-tracking documentation says so, and says not to take financial decisions from it) and the CLI prints one even for a
model it does not know. The two streams in tests/fixtures/gateway_usage*.jsonl are trimmed from a real CLI (2.1.325) run
against a loopback stub: ids and paths removed, numbers as printed.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from freeduet import engines, segment
from freeduet.app import app
from freeduet.claude_engine import ClaudeEngine
from freeduet.compatible_engine import note_usage
from freeduet.engine_adapter import Health, Usage
from freeduet.engine_router import _Attempt
from freeduet.engine_state import EngineState
from freeduet.ledger import UNKNOWN, Ledger, Limits
from freeduet.stream_json import StreamParser
from fake_engines import NOW
from gateway_support import chain
from helpers import MANAGED_TOKEN, SETTLE_NEVER, post_run, run_body, standing
from ledger_support import Clock, open_the_gate

FIXTURES = Path(__file__).parent / "fixtures"
STREAMS = ["gateway_usage.jsonl", "gateway_usage_unknown_model.jsonl"]
AUTH = {"x-openbot-agent-token": MANAGED_TOKEN}
SETUP = {"enabled": True, "currency": "EUR", "daily_cap": 1, "monthly_cap": 10, "enforce": "ledger"}
ASK = [standing(), {"id": "u1", "role": "user", "content": "Say hello."}]


def lines_of(name: str) -> list[str]:
    return (FIXTURES / name).read_text().splitlines()


def parsed(lines) -> StreamParser:
    parser = StreamParser()
    for line in lines:
        parser.feed(line)
    return parser


def start(message_id, given, wrote=1, **more):
    usage = {"input_tokens": given, "output_tokens": wrote, **more}
    return json.dumps({"type": "stream_event", "parent_tool_use_id": None, "event": {"type": "message_start", "message": {
        "id": message_id, "type": "message", "role": "assistant", "model": "m", "content": [], "usage": usage}}})


def delta(wrote):
    return json.dumps({"type": "stream_event", "parent_tool_use_id": None, "event": {"type": "message_delta",
                       "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": wrote}}})


def result(**usage):
    return json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "ok", "usage": usage})


# ── The parser: token counts and nothing else ──────────────────────────────────────────────────────


@pytest.mark.parametrize("name", STREAMS)
def test_the_token_counts_of_a_recorded_stream_are_read_once_and_cached_input_is_included(name):
    # 1234 plain + 10 written to the cache + 20 read from it = 1264 given; the placeholder output of the first line (1) is
    # not the answer: the message_delta and the result say 56. Neither is the message counted twice (it is in two lines).
    assert parsed(lines_of(name)).usage() == (1264, 56)


@pytest.mark.parametrize("name", STREAMS)
def test_a_stream_cut_before_its_result_still_says_what_it_had_said(name):
    kept = [line for line in lines_of(name) if '"type":"result"' not in line]
    assert len(kept) == len(lines_of(name)) - 1
    assert parsed(kept).usage() == (1264, 56)  # summed from the messages, with the delta's output, not the placeholder


def test_the_result_lines_totals_win_over_what_the_messages_added_up_to():
    assert parsed([start("m1", 100), delta(7), result(input_tokens=500, output_tokens=90)]).usage() == (500, 90)


def test_the_messages_of_one_turn_are_added_and_a_message_that_shows_up_again_is_not_added_twice():
    first, second = [start("m1", 100), delta(7)], [start("m2", 40, cache_read_input_tokens=60), delta(5)]
    assert parsed([*first, *second]).usage() == (100 + 100, 7 + 5)  # the tool turns of a member are several messages
    assert parsed([*first, *second, *first]).usage() == (100 + 100, 7 + 5)  # a line seen twice is one message


def test_what_a_sub_agent_used_is_not_this_conversations():
    inner = json.dumps({"type": "stream_event", "parent_tool_use_id": "toolu_x", "event": {"type": "message_start", "message": {
        "id": "inner", "usage": {"input_tokens": 9999, "output_tokens": 9999}}}})
    assert parsed([start("m1", 100), delta(7), inner]).usage() == (100, 7)


def test_a_stream_that_reports_no_use_says_none_not_zero():
    text = json.dumps({"type": "stream_event", "parent_tool_use_id": None, "event": {"type": "content_block_delta", "index": 0,
                       "delta": {"type": "text_delta", "text": "hi"}}})
    assert parsed([text]).usage() is None
    assert parsed([]).usage() is None


@pytest.mark.parametrize("number", [-1, 2.5, "7", True, None, [7]])
def test_a_count_that_is_not_a_whole_number_is_not_a_count(number):
    stream = [start("m1", number, number), delta(number), result(input_tokens=number, output_tokens=number)]
    assert parsed(stream).usage() is None


@pytest.mark.parametrize("name", STREAMS)
def test_the_parser_hands_out_no_cost_although_the_stream_prints_one(name):
    printed = json.loads(lines_of(name)[-1])["total_cost_usd"]
    assert printed > 0  # the CLI does print a number, for a Claude model name and for a name it does not know alike
    assert len(parsed(lines_of(name)).usage()) == 2  # (given, wrote): there is no third number in what the parser keeps


def test_the_two_recorded_streams_differ_only_in_what_the_cli_priced_them_at():
    # The evidence behind "no kind qualifies as cost-reporting" (docs/design/engines-ledger.md): the same tokens, two prices,
    # and the CLI's own label for where each came from. A Claude model name got Anthropic's list price whatever a gateway
    # charges; a name the CLI does not know still got a price, labelled unknown.
    basis = {}
    for name in STREAMS:
        last = json.loads(lines_of(name)[-1])
        (model, used), = last["modelUsage"].items()
        basis[name] = (used["costBasis"], last["total_cost_usd"], used["inputTokens"], used["outputTokens"])
    (listed, unknown) = (basis[name] for name in STREAMS)
    assert listed[0] == "list" and unknown[0] == "unknown"
    assert listed[1] != unknown[1] and listed[1] > 0 and unknown[1] > 0
    assert listed[2:] == unknown[2:] == (1234, 56)


# ── note_usage: tokens go to Health, the printed cost does not ─────────────────────────────────────


@pytest.mark.parametrize("name", STREAMS)
def test_the_tokens_go_to_health_and_the_cost_the_cli_printed_does_not(name):
    health = Health()
    note_usage(health, parsed(lines_of(name)))
    assert health.usage == Usage(input_tokens=1264, output_tokens=56)
    assert health.usage.cost is None and health.usage.currency is None  # "cost unknown": a money limit cannot hold on it


def test_a_stream_with_no_use_leaves_health_without_usage():
    health = Health()
    note_usage(health, parsed([]))
    assert health.usage is None


def test_note_usage_never_raises_into_a_turn():
    class Broken:
        def usage(self):
            raise RuntimeError("a parser that went wrong")

    health = Health()
    note_usage(health, Broken())  # type: ignore[arg-type]
    assert health.usage is None


def test_health_has_no_usage_until_an_engine_reports_some():
    # Guard of unchanged behaviour for every engine that reports nothing: Claude Code's own Health is what it always was.
    assert Health().usage is None and Health().answered is False and Health().failure is None
    assert Usage() == Usage(None, None, None, None)


# ── A turn the router cuts keeps what the engine had reported ──────────────────────────────────────


def ledgered_state(tmp_path):
    limits = Limits.of(engines.Metered(enabled=True, currency="EUR", daily_cap=1, monthly_cap=10))
    ledger = Ledger(tmp_path / "engine-ledger.json", now=Clock())
    state = EngineState(None, now=NOW)
    engine = ClaudeEngine(key="paid", label="paid")
    state.register(engine)
    state.attach_ledger(ledger, limits, frozenset({"paid"}))
    return state, ledger, engine, limits


def test_a_turn_cut_for_silence_is_a_transient_failure_that_still_counts_its_tokens(tmp_path):
    state, ledger, engine, limits = ledgered_state(tmp_path)
    attempt = _Attempt(engine, state, state.begin("paid"))
    attempt.health = Health(answered=False, usage=Usage(input_tokens=500, output_tokens=40))
    attempt.hint = "first_output"  # the router stopped waiting: the gateway had said nothing but its usage
    attempt.settle()
    assert attempt.failure is not None and attempt.failure.kind == "transient"
    shown = ledger.view("paid", limits)["month"]["engine"]
    assert (shown["turns"], shown["input_tokens"], shown["output_tokens"], shown["cost_unknown_turns"]) == (1, 500, 40, 1)


def test_a_turn_that_said_nothing_and_reported_nothing_is_not_a_turn(tmp_path):
    state, ledger, engine, limits = ledgered_state(tmp_path)
    attempt = _Attempt(engine, state, state.begin("paid"))
    attempt.health = Health(answered=False)
    attempt.hint = "first_output"
    attempt.settle()
    assert ledger.turns() == [] and not (tmp_path / "engine-ledger.json").exists()


# ── The real gateway engine, end to end: the CLI's estimate is never the ledger's cost ─────────────


def run_pinned(client, team, run_id):
    app.state.engine_router = team.router
    return post_run(client, run_body(ASK, run_id=run_id))[0]


@pytest.mark.parametrize("name", STREAMS)
def test_a_gateway_turn_is_recorded_with_its_tokens_and_no_cost_so_the_ledger_holds_the_gateway(client, fake_cli, tmp_path, monkeypatch, name):
    # What the maintainer would see on the first turn if the switch were opened today and the table wrongly listed this
    # kind: the turn runs, its tokens are written down, its cost is unknown (the stream's estimate is not read), and the
    # gateway is held, because a money limit cannot hold on a cost nobody stated.
    monkeypatch.setattr(segment, "SETTLE_SECONDS", SETTLE_NEVER)
    open_the_gate(monkeypatch)
    team = chain(tmp_path, monkeypatch, {"billing": "metered"}, metered=SETUP, switching={"freeduet": {"pin": "gw"}})
    team.gw.plan([{"replay": name}])
    events = run_pinned(client, team, "run-1")
    assert "Hello from the test gateway." in "".join(e.get("delta", "") for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")
    row = next(row for row in team.state.snapshot().as_json()["engines"] if row["id"] == "gw")
    engine = row["spend"]["month"]["engine"]
    assert (engine["turns"], engine["input_tokens"], engine["output_tokens"]) == (1, 1264, 56)
    assert engine["cost"] == 0 and engine["cost_unknown_turns"] == 1  # the CLI printed 0.0045..: none of it is in the ledger
    assert row["spend"]["held"] == UNKNOWN and row["state"] == "refused" and row["available"] is False
    second = run_pinned(client, team, "run-2")
    assert second[-1]["type"] == "RUN_ERROR" and "cannot tell what it has cost" in second[-1]["message"]
    assert team.gw.runs() == 1  # not started again


def test_the_file_a_gateway_turn_leaves_holds_numbers_only(client, fake_cli, tmp_path, monkeypatch):
    monkeypatch.setattr(segment, "SETTLE_SECONDS", SETTLE_NEVER)
    open_the_gate(monkeypatch)
    team = chain(tmp_path, monkeypatch, {"billing": "metered"}, metered=SETUP, switching={"freeduet": {"pin": "gw"}})
    team.gw.plan([{"replay": "gateway_usage.jsonl"}])
    run_pinned(client, team, "run-1")
    written = (tmp_path / "data" / "engine-ledger.json").read_text()  # next to where the engine state would be (FREEDUET_DATA_DIR)
    document = json.loads(written)
    assert set(document["turns"][0]) == {"at", "engine", "input_tokens", "output_tokens", "cost"}
    assert document["turns"][0]["cost"] is None and document["turns"][0]["input_tokens"] == 1264
    for private in ("Hello from the test gateway", "Say hello", "freeduet", "canary", str(tmp_path)):
        assert private not in written  # no text of the turn, no member, no key, no path
