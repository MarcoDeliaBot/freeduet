"""A minimal OpenAI-compatible chat-completions client for free engines (Ollama, LM Studio, vLLM).

Text in, text out. No tools, no streaming, no retries: one POST to ``/chat/completions`` with a
timeout. Free engines have no powers (docs/ARCHITECTURE.md §3.5), so this client never sends tool
definitions and ignores anything but the answer's text.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Mapping

import httpx

DEFAULT_TIMEOUT_S = 8.0

# Small local reasoning models put their thinking inline. The server's callers look for the first
# brace of a JSON answer, and a brace inside the thinking would be read instead.
_THINKING = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


class AssistantError(RuntimeError):
    """A free engine did not give a usable answer: unreachable, an error status, or no text."""


def chat_completions_url(base_url: str) -> str:
    """Same rule as the server's ``chatCompletionsUrl``: add ``/v1`` only when no version is given."""
    base = base_url.strip().rstrip("/")
    if re.search(r"/v\d+$", base):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def build_messages(system: str, messages: Iterable[tuple[str, str]]) -> list[dict[str, str]]:
    """OpenAI chat messages from a system text and ``(role, text)`` pairs."""
    built = [{"role": "system", "content": system}] if system.strip() else []
    built.extend({"role": role, "content": text} for role, text in messages)
    return built


def _answer_text(body: Any) -> str:
    if not isinstance(body, Mapping):
        raise AssistantError("the engine's answer was not a JSON object")
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], Mapping):
        raise AssistantError("the engine's answer had no choices")
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, Mapping) else None
    if isinstance(content, list):
        # Some servers return content parts; only text parts are read.
        content = "".join(
            part.get("text", "")
            for part in content
            if isinstance(part, Mapping) and part.get("type") == "text"
            and isinstance(part.get("text"), str)
        )
    if not isinstance(content, str):
        raise AssistantError("the engine's answer had no text")
    text = _THINKING.sub("", content).strip()
    if not text:
        raise AssistantError("the engine's answer was empty")
    return text


class AssistantClient:
    """Calls one OpenAI-compatible engine per request. ``transport`` is injectable for tests."""

    def __init__(
        self,
        *,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.timeout_s = timeout_s
        self._transport = transport

    async def complete(
        self,
        *,
        base_url: str,
        model: str,
        system: str,
        messages: Iterable[tuple[str, str]],
        api_key: str | None = None,
        max_tokens: int | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model,
            "messages": build_messages(system, messages),
            "stream": False,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        headers = {"content-type": "application/json"}
        if api_key:
            headers["authorization"] = f"Bearer {api_key}"
        try:
            # trust_env=False: no proxy or certificate settings picked up from the environment, and
            # nothing read from the home directory. A free engine is a direct call to a known host.
            async with httpx.AsyncClient(
                timeout=self.timeout_s,
                transport=self._transport,
                trust_env=False,
                follow_redirects=False,
            ) as client:
                response = await client.post(
                    chat_completions_url(base_url), json=payload, headers=headers
                )
        except httpx.TimeoutException as error:
            raise AssistantError(f"no answer within {self.timeout_s:g} s") from error
        except httpx.HTTPError as error:
            raise AssistantError(f"unreachable ({type(error).__name__})") from error
        if response.status_code != 200:
            raise AssistantError(f"answered {response.status_code}")
        try:
            body = response.json()
        except ValueError as error:
            raise AssistantError("the engine's answer was not JSON") from error
        return _answer_text(body)


async def complete(
    *,
    base_url: str,
    model: str,
    system: str,
    messages: Iterable[tuple[str, str]],
    api_key: str | None = None,
    max_tokens: int | None = None,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    transport: httpx.AsyncBaseTransport | None = None,
) -> str:
    """One-shot convenience around :class:`AssistantClient`."""
    return await AssistantClient(timeout_s=timeout_s, transport=transport).complete(
        base_url=base_url,
        model=model,
        system=system,
        messages=messages,
        api_key=api_key,
        max_tokens=max_tokens,
    )
