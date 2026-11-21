"""D121: the Engines page writes a model's context size when it can read it: Ollama's `num_ctx`, or the `context_length` of
OpenRouter's model list. No request here leaves the machine: every one goes through an httpx mock transport."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from freeduet import engine_panel as panel
from freeduet.app import app
from freeduet.engines import context_limit, load_engines
from helpers import MANAGED_TOKEN
from test_engine_panel import AUTH, KEY, data  # noqa: F401 - the fixture of the page's tests

SHOW = {
    "parameters": "stop \"<|im_end|>\"\nnum_ctx                        65536\ntemperature 0.7",
    "model_info": {"general.architecture": "qwen3", "qwen3.context_length": 262144},
}


def show_transport(answer, status=200, seen=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append((request.method, str(request.url), json.loads(request.content or b"{}")))
        return httpx.Response(status, json=answer)

    return httpx.MockTransport(handler)


@pytest.fixture
def fresh_cache():
    panel.forget_free_models()
    yield
    panel.forget_free_models()


def test_ollamas_num_ctx_is_read_from_api_show(data):
    seen = []
    size = asyncio.run(panel.local_context("ollama", "qwen3.8-cc", transport=show_transport(SHOW, seen=seen)))
    assert size == 65536
    assert seen == [("POST", "http://host.docker.internal:11434/api/show", {"model": "qwen3.8-cc"})]


def test_num_ctx_is_held_to_the_models_own_maximum():
    smaller = {**SHOW, "model_info": {"qwen3.context_length": 32768}}
    assert panel._num_ctx(smaller) == 32768


@pytest.mark.parametrize("answer", [{}, {"parameters": "temperature 0.7"}, {"parameters": "num_ctx big"}, "junk", None])
def test_a_model_that_sets_no_size_gives_none_and_the_loader_default_applies(data, answer):
    assert asyncio.run(panel.local_context("ollama", "m", transport=show_transport(answer))) is None


def test_an_unreachable_or_refusing_ollama_gives_none_and_never_raises(data):
    assert asyncio.run(panel.local_context("ollama", "m", transport=show_transport({}, status=404))) is None

    def down(request):
        raise httpx.ConnectError("refused")

    assert asyncio.run(panel.local_context("ollama", "m", transport=httpx.MockTransport(down))) is None


def test_only_the_ollama_card_asks_and_an_address_the_card_refuses_is_never_asked(data):
    seen = []
    assert asyncio.run(panel.local_context("groq", "m", transport=show_transport(SHOW, seen=seen))) is None
    assert asyncio.run(panel.local_context("ollama", "m", "http://8.8.8.8:11434", transport=show_transport(SHOW, seen=seen))) is None
    assert seen == []


def test_apply_change_writes_the_size_on_the_member_entry_and_the_loader_uses_it(data):
    panel.apply_change("ollama", enabled=True, model="qwen3.8-cc", context_tokens=65536)
    engine = load_engines().engines["ollama-member"]
    assert engine.context_tokens == 65536 and context_limit(engine) == 65536
    assert load_engines().engines["ollama-assist"].context_tokens is None  # the light assistants' entry has none


def test_an_unknown_size_is_not_written_and_a_local_model_gets_the_default(data):
    panel.apply_change("ollama", enabled=True, model="qwen3.8-cc")
    engine = load_engines().engines["ollama-member"]
    assert engine.context_tokens is None and context_limit(engine) == 32768


def test_a_size_read_earlier_stays_while_the_model_is_the_same_and_goes_with_a_new_model(data):
    panel.apply_change("ollama", enabled=True, model="qwen3.8-cc", context_tokens=65536)
    panel.apply_change("ollama", enabled=False)
    assert load_engines().engines["ollama-member"].context_tokens == 65536
    panel.apply_change("ollama", enabled=True, model="llama3.2")
    assert load_engines().engines["ollama-member"].context_tokens is None


@pytest.mark.parametrize("bad", [0, 5, 10**9, True, "65536", 1.5])
def test_a_size_that_the_loader_would_refuse_is_dropped_so_it_cannot_break_the_file(data, bad):
    panel.apply_change("ollama", enabled=True, model="qwen3.8-cc", context_tokens=bad)
    assert load_engines().engines["ollama-member"].context_tokens is None


OPENROUTER = {
    "data": [
        {"id": "google/gemma-4-26b-a4b-it:free", "supported_parameters": ["tools"], "context_length": 262144},
        {"id": "x/no-length:free", "supported_parameters": ["tools"]},
        {"id": "y/paid", "supported_parameters": ["tools"], "context_length": 1000},
    ]
}


def test_the_context_lengths_of_the_free_tool_models_are_read_from_the_list():
    assert panel.free_model_contexts_from(OPENROUTER) == {"google/gemma-4-26b-a4b-it:free": 262144}
    assert panel.free_model_contexts_from(None) == {}


def test_the_size_of_the_chosen_openrouter_model_is_stored_with_it(data, fresh_cache):
    asyncio.run(panel.free_tool_models("openrouter", fetch=lambda: _async(OPENROUTER), now=lambda: 1.0))
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    panel.apply_change("openrouter", enabled=True, model="google/gemma-4-26b-a4b-it:free")
    engine = load_engines().engines["openrouter-member"]
    assert engine.context_tokens == 262144 and context_limit(engine) == 262144


def test_a_model_of_the_list_with_no_length_and_the_router_store_none(data, fresh_cache):
    asyncio.run(panel.free_tool_models("openrouter", fetch=lambda: _async(OPENROUTER), now=lambda: 1.0))
    panel.save_key("openrouter", "sk-or-v1-CANARYkey0123456789")
    panel.apply_change("openrouter", enabled=True, model="x/no-length:free")
    assert load_engines().engines["openrouter-member"].context_tokens is None
    panel.apply_change("openrouter", enabled=True, model="openrouter/free")
    assert load_engines().engines["openrouter-member"].context_tokens is None


async def _async(value):
    return value


def test_the_route_asks_ollama_and_writes_what_it_found(data, monkeypatch):
    from fastapi.testclient import TestClient

    async def fake(provider, model, base_url=None, environ=None, transport=None):
        return 65536 if provider == "ollama" and model == "qwen3.8-cc" else None

    monkeypatch.setattr(panel, "local_context", fake)
    response = TestClient(app).put("/engines/panel/ollama", json={"enabled": True, "model": "qwen3.8-cc"}, headers=AUTH)
    assert response.status_code == 200, response.text
    assert load_engines().engines["ollama-member"].context_tokens == 65536
