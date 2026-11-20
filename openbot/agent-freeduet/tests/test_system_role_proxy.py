"""D105: the loopback hop that keeps a role "system" message out of what an Anthropic-compatible endpoint receives.

Seen live on 20 November 2026: the Claude Code CLI sends its "# Environment" section as a message with role "system" after
the user's message, and Ollama's /v1/messages answers 500 "no user query found in messages". Everything here runs against an
upstream of this test's own on 127.0.0.1; no model answers and no real endpoint is asked.
"""

from __future__ import annotations

import asyncio
import json

import httpx

from freeduet import compatible_engine as ce
from freeduet.system_role_proxy import SystemRoleProxy, normalize, rewrite
from gateway_support import rig

ENVIRONMENT = "# Environment\nYou have been invoked in the following environment: \n - Platform: linux"
SEEN_LIVE = {
    "model": "qwen3.8-cc",
    "system": [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}],
    "messages": [
        {"role": "user", "content": [{"type": "text", "text": "<conversation>\nhello\n</conversation>"}]},
        {"role": "system", "content": [{"type": "text", "text": ENVIRONMENT}]},
    ],
}


def test_a_system_role_message_moves_into_the_top_level_system_field():
    body = json.loads(json.dumps(SEEN_LIVE))
    assert normalize(body) is True
    assert [m["role"] for m in body["messages"]] == ["user"]
    assert body["system"] == [
        {"type": "text", "text": "a"},
        {"type": "text", "text": "b"},
        {"type": "text", "text": ENVIRONMENT},
    ]


def test_a_string_system_field_and_a_string_message_are_kept_and_the_order_stays():
    body = {"system": "base", "messages": [{"role": "system", "content": "one"}, {"role": "user", "content": "q"}, {"role": "developer", "content": "two"}]}
    assert normalize(body)
    assert body["messages"] == [{"role": "user", "content": "q"}]
    assert [b["text"] for b in body["system"]] == ["base", "one", "two"]


def test_a_request_without_one_is_passed_on_byte_for_byte():
    raw = b'{"messages": [{"role": "user", "content": "hi"}],  "x": 1}'
    assert rewrite(raw) == raw
    assert rewrite(b"not json") == b"not json"


class Upstream:
    """A loopback server that writes down each request and answers with `reply`."""

    def __init__(self, reply: bytes):
        self.reply, self.requests, self.server, self.url = reply, [], None, ""

    async def __aenter__(self):
        self.server = await asyncio.start_server(self._serve, "127.0.0.1", 0)
        self.url = f"http://127.0.0.1:{self.server.sockets[0].getsockname()[1]}"
        return self

    async def __aexit__(self, *_):
        self.server.close()

    async def _serve(self, reader, writer):
        head = (await reader.readuntil(b"\r\n\r\n")).decode("latin-1").split("\r\n")
        headers = {line.split(":", 1)[0].lower(): line.split(":", 1)[1].strip() for line in head[1:] if ":" in line}
        body = await reader.readexactly(int(headers.get("content-length", "0")))
        self.requests.append((head[0], headers, body))
        writer.write(self.reply)
        await writer.drain()
        writer.close()


def reply_with(status: str, body: bytes) -> bytes:
    return f"HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {len(body)}\r\nconnection: close\r\n\r\n".encode() + body


def test_the_endpoint_never_receives_a_system_role_message_and_the_key_and_answer_pass_through():
    async def go():
        async with Upstream(reply_with("200 OK", b'{"type":"message"}')) as up:
            async with SystemRoleProxy(up.url + "/prefix") as proxy:
                async with httpx.AsyncClient(trust_env=False) as client:
                    answer = await client.post(
                        proxy.url + "/v1/messages?beta=true", json=SEEN_LIVE, headers={"authorization": "Bearer placeholder-token"}
                    )
        return answer, up.requests

    answer, requests = asyncio.run(go())
    assert answer.status_code == 200 and answer.json() == {"type": "message"}
    ((line, headers, raw),) = requests
    assert line == "POST /prefix/v1/messages?beta=true HTTP/1.1"
    assert headers["authorization"] == "Bearer placeholder-token"
    sent = json.loads(raw)
    assert all(m["role"] != "system" for m in sent["messages"]) and len(sent["messages"]) == 1
    assert sent["system"][-1]["text"] == ENVIRONMENT
    assert int(headers["content-length"]) == len(raw)


def test_a_refusal_of_the_endpoint_is_passed_on_as_it_came():
    refusal = b'{"type":"api_error","message":"no user query found in messages"}'

    async def go():
        async with Upstream(reply_with("500 Internal Server Error", refusal)) as up:
            async with SystemRoleProxy(up.url) as proxy:
                async with httpx.AsyncClient(trust_env=False) as client:
                    return await client.post(proxy.url + "/v1/messages", json=SEEN_LIVE)

    answer = asyncio.run(go())
    assert answer.status_code == 500 and answer.content == refusal


def test_an_endpoint_that_is_not_there_is_said_with_a_502_and_no_address():
    async def go():
        async with Upstream(b"") as up:
            dead = up.url
        async with SystemRoleProxy(dead) as proxy:
            async with httpx.AsyncClient(trust_env=False) as client:
                return await client.post(proxy.url + "/v1/messages", json=SEEN_LIVE)

    answer = asyncio.run(go())
    assert answer.status_code == 502 and "127.0.0.1" not in answer.text


def test_a_turn_points_the_cli_at_the_hop_whose_upstream_is_the_entrys_address(fake_cli, tmp_path, monkeypatch):
    built = []

    class Recording(SystemRoleProxy):
        def __init__(self, upstream, **kwargs):
            built.append(upstream)
            super().__init__(upstream, **kwargs)

    monkeypatch.setattr(ce, "SystemRoleProxy", Recording)
    gw = rig(tmp_path, monkeypatch, {"no_key": True, "base_url": "http://127.0.0.1:11434", "credential_secret_ref": None}, key=None)
    gw.plan([{"text": "Done."}])

    from test_compatible_engine_local import play

    play(gw.engine)
    assert built == ["http://127.0.0.1:11434"]
    (turn,) = gw.turns()
    assert turn["env"]["ANTHROPIC_BASE_URL"].startswith("http://127.0.0.1:") and turn["env"]["ANTHROPIC_BASE_URL"] != "http://127.0.0.1:11434"
