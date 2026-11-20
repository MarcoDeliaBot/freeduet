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


# ── The request target, streams, chunked bodies, the CA bundle (review of PR #404) ───────────────────────────────


async def raw(url: str, request: bytes) -> bytes:
    host, port = url.removeprefix("http://").split(":")
    reader, writer = await asyncio.open_connection(host, int(port))
    writer.write(request)
    await writer.drain()
    answer = await reader.read()
    writer.close()
    return answer


def test_a_target_that_could_change_the_host_is_refused_and_the_upstream_host_never_changes():
    async def go():
        async with Upstream(reply_with("200 OK", b"{}")) as up, Upstream(reply_with("200 OK", b"{}")) as other:
            async with SystemRoleProxy(up.url) as proxy:
                answers = []
                for target in (
                    f"@127.0.0.1:{other.url.rsplit(':', 1)[1]}/x",  # userinfo: httpx would connect to the other host
                    f"{other.url}/v1/messages",  # an absolute URI
                    f"//{other.url.removeprefix('http://')}/v1/messages",
                    "/v1/messages\\@x",
                    "/v1/mess\tages",
                ):
                    answers.append(await raw(proxy.url, f"POST {target} HTTP/1.1\r\nhost: x\r\ncontent-length: 2\r\n\r\n{{}}".encode()))
                good = await raw(proxy.url, b"POST /v1/messages HTTP/1.1\r\nhost: x\r\ncontent-length: 2\r\n\r\n{}")
        return answers, good, up.requests, other.requests

    answers, good, upstream_seen, other_seen = asyncio.run(go())
    assert all(a.startswith(b"HTTP/1.1 400") for a in answers), answers
    assert other_seen == []  # nothing ever reached another host
    assert [line for line, _, _ in upstream_seen] == ["POST /v1/messages HTTP/1.1"]  # only the plain one got through
    assert good.startswith(b"HTTP/1.1 200")


def test_an_event_stream_passes_through_as_a_stream_not_after_it_ended():
    async def go():
        released = asyncio.Event()

        async def serve(reader, writer):
            await reader.readuntil(b"\r\n\r\n")
            writer.write(b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\nconnection: close\r\n\r\nevent: a\ndata: 1\n\n")
            await writer.drain()
            await released.wait()  # the second event is sent only after the client has the first
            writer.write(b"event: b\ndata: 2\n\n")
            await writer.drain()
            writer.close()

        server = await asyncio.start_server(serve, "127.0.0.1", 0)
        url = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
        seen = []
        async with SystemRoleProxy(url) as proxy:
            async with httpx.AsyncClient(trust_env=False) as client:
                async with client.stream("POST", proxy.url + "/v1/messages", json=SEEN_LIVE) as answer:
                    async for piece in answer.aiter_text():
                        seen.append(piece)
                        if "data: 1" in piece:
                            released.set()
        server.close()
        return seen

    seen = asyncio.run(asyncio.wait_for(go(), 10))
    assert "".join(seen) == "event: a\ndata: 1\n\nevent: b\ndata: 2\n\n" and len(seen) >= 2


def test_a_chunked_request_body_is_de_chunked_and_rewritten():
    payload = json.dumps(SEEN_LIVE).encode()
    cut = len(payload) // 2
    chunked = b"".join(f"{len(p):x}\r\n".encode() + p + b"\r\n" for p in (payload[:cut], payload[cut:])) + b"0\r\n\r\n"

    async def go():
        async with Upstream(reply_with("200 OK", b"{}")) as up:
            async with SystemRoleProxy(up.url) as proxy:
                await raw(proxy.url, b"POST /v1/messages HTTP/1.1\r\nhost: x\r\ntransfer-encoding: chunked\r\n\r\n" + chunked)
        return up.requests

    ((_, headers, body),) = asyncio.run(go())
    assert "transfer-encoding" not in headers and int(headers["content-length"]) == len(body)
    sent = json.loads(body)
    assert [m["role"] for m in sent["messages"]] == ["user"] and sent["system"][-1]["text"] == ENVIRONMENT


def test_a_chunk_larger_than_the_limit_is_refused_before_it_is_read(monkeypatch):
    from freeduet import system_role_proxy as srp

    monkeypatch.setattr(srp, "MAX_BODY", 10)

    async def go():
        async with Upstream(reply_with("200 OK", b"{}")) as up:
            async with SystemRoleProxy(up.url) as proxy:
                answer = await raw(proxy.url, b"POST /v1/messages HTTP/1.1\r\nhost: x\r\ntransfer-encoding: chunked\r\n\r\nffff\r\n")
        return answer, up.requests

    answer, seen = asyncio.run(go())
    assert answer.startswith(b"HTTP/1.1 400") and seen == []


def test_the_ca_bundle_the_cli_would_read_is_the_one_the_hop_uses(monkeypatch):
    import ssl

    import certifi
    from freeduet import system_role_proxy as srp

    made = []

    class Recording(httpx.AsyncClient):
        def __init__(self, **kwargs):
            made.append(kwargs["verify"])
            super().__init__(**kwargs)

    monkeypatch.setattr(srp.httpx, "AsyncClient", Recording)
    monkeypatch.delenv("NODE_EXTRA_CA_CERTS", raising=False)
    SystemRoleProxy("https://gateway.example.com")
    monkeypatch.setenv("NODE_EXTRA_CA_CERTS", certifi.where())
    SystemRoleProxy("https://gateway.example.com")
    assert made[0] is True and isinstance(made[1], ssl.SSLContext)


def test_the_extra_ca_file_adds_to_the_default_cas_and_a_bad_one_is_ignored(tmp_path):
    import shutil
    import subprocess

    import pytest

    from freeduet.system_role_proxy import _verify_with

    if shutil.which("openssl") is None:
        pytest.skip("openssl is not installed")
    pem, key = tmp_path / "extra.pem", tmp_path / "extra.key"
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key), "-out", str(pem),
         "-days", "2", "-subj", "/CN=freeduet-test-extra-ca"],
        check=True, capture_output=True,
    )
    default = len(httpx.create_ssl_context().get_ca_certs())
    context = _verify_with(str(pem))
    names = [dict(item[0] for item in cert["subject"]).get("commonName") for cert in context.get_ca_certs()]
    assert "freeduet-test-extra-ca" in names
    assert len(context.get_ca_certs()) == default + 1 and default > 1  # added to the default CAs, not instead of them
    broken = tmp_path / "broken.pem"
    broken.write_text("not a certificate")
    assert _verify_with(str(broken)) is True and _verify_with(str(tmp_path / "missing.pem")) is True
