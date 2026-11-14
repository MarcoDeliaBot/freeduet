"""A local endpoint that takes no key (`no_key: true`), docs/ENGINES_PLAN.md 9.1 (local models).

Ollama serves an Anthropic-compatible Messages endpoint at `/v1/messages` that takes no key (its page at
docs.ollama.com/api/anthropic-compatibility, Ollama 0.14 and later), so the same locked-down Claude Code CLI can be pointed at
it with a placeholder bearer. Everything here runs against the fake CLI (`fake_claude.py`) or against a loopback server of
this test's own: no model answers, nothing leaves 127.0.0.1, and the key is the invented canary of `gateway_support`. What
these tests prove is what the service does around the CLI. Nothing here has been answered by a real local model.
"""

from __future__ import annotations

import asyncio
import json
import socket
import time

import pytest

from freeduet import claude_cli
from freeduet import compatible_engine as ce
from freeduet import engine_adapter
from freeduet import segment
from freeduet.app import app
from freeduet.engine_adapter import ProbeResult
from freeduet.engine_state import EngineState
from freeduet.engines import EnginesFileError, parse_engines
from freeduet.members import resolve_member
from fake_engines import NOW
from gateway_support import CLAUDE_ENTRY, chain, config_with, decoys, rig
from helpers import post_run, run_body, standing, types
from freeduet import agui

LOCAL = "http://127.0.0.1:11434"
#: The entry every test of a key-free endpoint uses: no credential reference at all.
KEY_FREE = {"no_key": True, "base_url": LOCAL, "credential_secret_ref": None}
ASK = [standing(), {"id": "u1", "role": "user", "content": "Write the plan as a page."}]
LIMIT = {"replay": "usage_limit.jsonl"}
UNTIL = "00:00 UTC"
#: A sign-in as Claude Code keeps it (invented). It is planted in the service's own folders; no child may ever see it.
SIGN_IN_CANARY = "canary-sign-in-never-sent-4471"
SIGN_IN = json.dumps({"claudeAiOauth": {"accessToken": SIGN_IN_CANARY}})
SHELL_EXTRAS = {"PWD", "OLDPWD", "SHLVL", "_"}
ANTHROPIC_NAMES = {
    "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
}
ALLOWED_NAMES = (
    set(ce.PASSED_ENV) | set(claude_cli.FIXED_ENV) | set(ce.GATEWAY_ENV) | ANTHROPIC_NAMES | {"HOME", "CLAUDE_CONFIG_DIR"}
)
#: What a loopback server answers with: an HTTP status line and an empty JSON body.
ANSWER = b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"


def said(events) -> str:
    return "".join(event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT")


def play(engine, messages=ASK) -> list[dict]:
    async def go():
        run = agui.parse_run_input(run_body(messages))
        member = resolve_member(run.bot_id, run.messages)
        return [event async for event in segment.run_segment(run, member, engine=engine)]

    return asyncio.run(go())


def posted(client, team, messages=ASK):
    app.state.engine_router = team.router
    return post_run(client, run_body(messages))[0]


def closed_port() -> int:
    """A loopback port nothing listens on: one that was free a moment ago."""
    with socket.socket() as probe_socket:
        probe_socket.bind(("127.0.0.1", 0))
        return probe_socket.getsockname()[1]


def probe_at(tmp_path, monkeypatch, reply: bytes | None):
    """The key-free engine's probe against a loopback server of this test's own. `reply` is what the server writes after
    it reads the request head; None means it writes nothing and waits until the probe closes the connection. Returns the
    probe's result and the request heads the server read."""
    heads: list[bytes] = []

    async def serve(reader, writer):
        heads.append(await reader.readuntil(b"\r\n\r\n"))
        if reply is None:
            await reader.read()  # until the probe gives up and closes its side
        else:
            writer.write(reply)
            await writer.drain()
        writer.close()

    async def main():
        server = await asyncio.start_server(serve, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        gw = rig(tmp_path, monkeypatch, {**KEY_FREE, "base_url": f"http://127.0.0.1:{port}"}, key=None)
        result = await gw.engine.probe()
        server.close()
        return result

    return asyncio.run(main()), heads


# ── The file: where a key-free entry may point ───────────────────────────────────────────────────


@pytest.mark.parametrize("address", [
    "http://localhost:11434",
    "http://LOCALHOST:11434",
    "http://127.0.0.1:11434",
    "http://127.9.9.9:11434",
    "http://[::1]:11434",
    "http://host.docker.internal:11434",
])
def test_a_key_free_entry_may_name_a_plain_address_on_this_machine(address):
    entry = config_with({"no_key": True, "base_url": address, "credential_secret_ref": None}).engines["gw"]
    assert entry.no_key is True and entry.credential_secret_ref is None and entry.billing == "free"


@pytest.mark.parametrize("address", [
    "https://localhost:11434",
    "http://192.168.1.20:11434",
    "http://my-bridge:11434",
    "http://0.0.0.0:11434",
    "https://openrouter.ai/api",
    "http://localhost.example.com:11434",
    "http://127.0.0.1.example.com:11434",
])
def test_a_key_free_entry_may_not_name_any_other_address(address):
    with pytest.raises(EnginesFileError) as caught:
        config_with({"no_key": True, "base_url": address, "credential_secret_ref": None})
    assert any(
        "`no_key: true` is accepted only for a plain http:// address on this machine" in line for line in caught.value.problems
    ), caught.value.problems
    assert address not in str(caught.value)  # the message does not repeat an address


def test_a_key_free_entry_cannot_also_name_a_key():
    with pytest.raises(EnginesFileError) as caught:
        config_with({"no_key": True, "base_url": LOCAL})  # the fixture's entry still names a key
    assert any("cannot both be set" in line for line in caught.value.problems), caught.value.problems


def test_a_key_free_entry_is_only_for_an_anthropic_compatible_engine():
    data = {
        "engines": {
            "claude-code": dict(CLAUDE_ENTRY),
            "local": {"kind": "openai-compatible", "base_url": "http://127.0.0.1:11434/v1", "billing": "free",
                      "model": "some-model", "tier": "C", "no_key": True},
        },
        "chains": {"default": ["claude-code"]},
    }
    with pytest.raises(EnginesFileError) as caught:
        parse_engines(data)
    assert any("`no_key` is only for an `anthropic-compatible` engine" in line for line in caught.value.problems)


def test_no_key_is_true_or_false():
    with pytest.raises(EnginesFileError) as caught:
        config_with({"no_key": "yes", "base_url": LOCAL, "credential_secret_ref": None})
    assert any("`no_key` must be true or false" in line for line in caught.value.problems)


# ── What the CLI is started with ─────────────────────────────────────────────────────────────────


def test_the_cli_of_a_key_free_endpoint_gets_the_placeholder_and_no_sign_in_of_any_kind(fake_cli, tmp_path, monkeypatch):
    service = decoys(monkeypatch)
    # A sign-in of this service's own, in its own home and config folders, under a neutral name: the CLI's real paths are
    # named only in test_credentials_untouched.py. What is proved is that the child never gets these folders at all.
    home = tmp_path / "service-home"
    home.mkdir()
    (home / "sign-in.txt").write_text(SIGN_IN)
    config = tmp_path / "service-config"
    config.mkdir()
    (config / "sign-in.txt").write_text(SIGN_IN)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(config))
    gw = rig(tmp_path, monkeypatch, KEY_FREE, key=None)
    gw.plan([{"text": "Done."}])
    play(gw.engine)
    (turn,) = gw.turns()
    env = turn["env"]
    assert env["ANTHROPIC_AUTH_TOKEN"] == ce.NO_KEY_TOKEN and env["ANTHROPIC_API_KEY"] == ""
    assert env["ANTHROPIC_BASE_URL"] == LOCAL
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in env
    assert set(env) - SHELL_EXTRAS <= ALLOWED_NAMES, sorted(set(env) - SHELL_EXTRAS - ALLOWED_NAMES)
    for name, value in service.items():
        assert value not in env.values(), f"the service's {name} reached the CLI"
    assert SIGN_IN_CANARY not in json.dumps(env)
    assert str(home) not in env.values() and str(config) not in env.values()
    assert turn["home_entries"] == [] and turn["config_entries"] == []  # the folders it starts with are new and empty


def test_the_placeholder_is_not_a_secret_so_the_answer_is_given_as_it_came(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch, KEY_FREE, key=None)
    text = f"The bearer {ce.NO_KEY_TOKEN} is a placeholder."
    gw.plan([{"text": text}])
    assert said(play(gw.engine)) == text  # nothing is replaced: there is no key to take out of the answer


# ── The probe: one request to this machine, bounded ──────────────────────────────────────────────


def test_the_probe_of_a_key_free_endpoint_is_bounded_to_two_seconds_on_the_version_route():
    assert ce.LOCAL_PROBE_SECONDS == 2.0 and ce.LOCAL_PROBE_PATH == "/api/version"


def test_a_key_free_endpoint_that_answers_is_reached_once_with_a_bare_get(fake_cli, tmp_path, monkeypatch):
    result, heads = probe_at(tmp_path, monkeypatch, ANSWER)
    assert result == ProbeResult(installed=True, version="2.1.311", signed_in=True, problem=None)
    (head,) = heads  # one request, and no turn: no prompt, no key, no body
    assert head.startswith(b"GET /api/version HTTP/1.1\r\n") and head.endswith(b"\r\n\r\n")
    lowered = head.lower()
    assert b"authorization" not in lowered and b"x-api-key" not in lowered


def test_a_key_free_endpoint_that_does_not_answer_in_two_seconds_is_said_not_to_answer(fake_cli, tmp_path, monkeypatch):
    started = time.monotonic()
    result, _ = probe_at(tmp_path, monkeypatch, None)
    elapsed = time.monotonic() - started
    assert result == ProbeResult(installed=True, version="2.1.311", problem=engine_adapter.NOT_ANSWERING)
    assert 1.5 <= elapsed < 6, elapsed  # it waited for the bound, and not longer than the bound and the version call


def test_a_key_free_endpoint_with_nothing_listening_is_said_not_to_answer(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch, {**KEY_FREE, "base_url": f"http://127.0.0.1:{closed_port()}"}, key=None)
    result = asyncio.run(gw.engine.probe())
    assert result == ProbeResult(installed=True, version="2.1.311", problem=engine_adapter.NOT_ANSWERING)
    assert gw.runs() == 0


def test_only_a_key_free_endpoint_on_this_machine_is_ever_asked_by_the_probe(fake_cli, tmp_path, monkeypatch):
    opened: list[tuple] = []

    async def refuse(*args, **kwargs):
        opened.append(args)
        raise OSError("this test opens nothing")

    monkeypatch.setattr(asyncio, "open_connection", refuse)
    keyed = rig(tmp_path, monkeypatch, {"base_url": "http://127.0.0.1:18080"})  # keyed, even on loopback
    assert asyncio.run(keyed.engine.probe()).signed_in is True
    remote = rig(tmp_path, monkeypatch, {"base_url": "https://gateway.example.com"})
    assert asyncio.run(remote.engine.probe()).signed_in is True
    assert opened == []
    assert asyncio.run(ce.answers_on_this_machine("https://gateway.example.com", 2)) is False
    assert asyncio.run(ce.answers_on_this_machine("http://gateway.example.com", 2)) is False
    assert opened == []


# ── Failures and the chain ───────────────────────────────────────────────────────────────────────


def test_a_key_free_endpoint_that_refuses_the_request_is_told_it_needs_a_key_not_about_a_sign_in(fake_cli, tmp_path, monkeypatch):
    gw = rig(tmp_path, monkeypatch, KEY_FREE, key=None)
    gw.plan([{"replay": "gateway_401.jsonl"}, {"exit": 1}])
    state = EngineState(None, now=NOW)
    events = play(state.recorded(gw.engine))
    error = events[-1]
    assert error["type"] == "RUN_ERROR" and error["message"].startswith("gw refused the request"), error
    assert "credential_secret_ref" in error["message"]
    assert "did not accept its key" not in error["message"] and "OPENBOT_MODEL_AUTH_REQUIRED" not in json.dumps(error)


def test_a_key_free_endpoint_answers_when_claude_reaches_its_limit(client, fake_cli, tmp_path, monkeypatch):
    team = chain(tmp_path, monkeypatch, KEY_FREE, key=None)
    fake_cli.plan([LIMIT])
    team.gw.plan([{"text": "The plan is ready."}])
    events = posted(client, team)
    assert types(events)[-1] == "RUN_FINISHED" and "RUN_ERROR" not in types(events)
    assert said(events) == f"Claude Code reached its limit until {UNTIL}, so gw is answering instead.The plan is ready."
    assert team.gw.turns()[0]["env"]["ANTHROPIC_AUTH_TOKEN"] == ce.NO_KEY_TOKEN
