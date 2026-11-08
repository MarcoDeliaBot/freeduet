"""The OpenBot server's own model calls, answered on the person's engines (docs/SERVER_MODEL_CALLS.md).

D10 (docs/M1_PLAN.md): the server runs with ``BOT_PROVIDER=anthropic``,
``ANTHROPIC_BASE_URL=http://localhost:4230`` and ``ANTHROPIC_API_KEY=$FREEDUET_LOCAL_KEY``. This
router answers ``POST /v1/messages`` in Anthropic's Messages format, non-streaming and text only, and
routes every request by its purpose:

- **auto-review** (``approvals/policy.ts``) decides when the person is asked, so it runs only on a
  tier A engine, logins first (Claude Code in M1), never on an assistant;
- **titles, routing, tool selection, triage and voice summaries** run on the free assistants chain
  and fall back to the person's subscription (Claude Code) when no free engine answers;
- anything not recognised is treated as auto-review, the strictest route.

The purpose is read from the fixed text each server caller puts at the very start of its prompt,
never from the untrusted content that follows it (an email body, a conversation excerpt, a request).
An auto-review marker found anywhere makes the request auto-review: ambiguity only ever escalates.

Metered engines are never run here: caps are enforced from M3, and no M1 code can spend money.

The runtime mounts :data:`router` and wires Claude Code in with :func:`configure`.
"""

from __future__ import annotations

import enum
import hmac
import inspect
import logging
import math
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Mapping, Protocol

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import engines as engines_mod
from .assistants import AssistantClient, AssistantError
from .engines import Engine, EnginesConfig, EnginesFileError

log = logging.getLogger("freeduet.server_calls")

router = APIRouter()


# ── Purposes and their markers ───────────────────────────────────────────────────────────────────


class Purpose(enum.StrEnum):
    TITLE = "title"
    ROUTING = "routing"
    TOOL_SELECTION = "tool-selection"
    AUTO_REVIEW = "auto-review"
    TRIAGE = "triage"
    VOICE_SUMMARY = "voice-summary"
    UNKNOWN = "unknown"


#: Purposes that may only run on a tier A engine, never on an assistant.
STRICT_PURPOSES = frozenset({Purpose.AUTO_REVIEW, Purpose.UNKNOWN})


@dataclass(frozen=True)
class Marker:
    """Fixed text a server caller writes. ``lead`` must open ``field``; ``also`` must appear in it."""

    purpose: Purpose
    field: str  # "system" or "user"
    lead: str
    source: str
    also: tuple[str, ...] = ()


MARKERS: tuple[Marker, ...] = (
    Marker(
        Purpose.TITLE,
        "system",
        "You name conversations, like a title in a sidebar.",
        "openbot/server/src/channels/titler.ts",
    ),
    Marker(
        Purpose.VOICE_SUMMARY,
        "system",
        "Summarize this voice conversation in one or two concise sentences for its chat history.",
        "openbot/server/src/voice/summary.ts",
    ),
    Marker(
        Purpose.ROUTING,
        "user",
        "You route a person's message to the one coworker best suited to it.",
        "openbot/server/src/routing/classify.ts",
    ),
    Marker(
        Purpose.TOOL_SELECTION,
        "user",
        "You choose which capabilities to load for the message below. You are not answering it.",
        "openbot/server/src/plugins/selection.ts",
    ),
    Marker(
        Purpose.TRIAGE,
        "user",
        "You sort incoming email for ",
        "openbot/server/src/openduet/triage.ts",
        also=("Decide one thing: does this message need them, or can it wait?",),
    ),
    Marker(
        Purpose.AUTO_REVIEW,
        "user",
        "You review one action an AI assistant is about to take on a person's behalf, before it runs.",
        "openbot/server/src/approvals/policy.ts",
    ),
)

#: Any of these, anywhere in the request, makes it auto-review.
AUTO_REVIEW_ANYWHERE: tuple[str, ...] = (
    "You review one action an AI assistant is about to take on a person's behalf, before it runs.",
    '"verdict": "proceed" | "needs_approval" | "hand_off"',
)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def classify(system: str, messages: tuple[tuple[str, str], ...]) -> Purpose:
    """Which server caller sent this request. Anything ambiguous or unrecognised is UNKNOWN."""
    texts = [_norm(system), *(_norm(text) for _, text in messages)]
    review_markers = [_norm(marker) for marker in AUTO_REVIEW_ANYWHERE]
    if any(marker in text for text in texts for marker in review_markers):
        return Purpose.AUTO_REVIEW
    # Every server caller sends exactly one user message.
    if len(messages) != 1 or messages[0][0] != "user":
        return Purpose.UNKNOWN
    system_text, user_text = texts[0], texts[1]
    found: set[Purpose] = set()
    for marker in MARKERS:
        if marker.field == "system":
            subject = system_text
        elif not system_text:
            subject = user_text
        else:
            # The completer-based callers never send a system prompt.
            continue
        if subject.startswith(_norm(marker.lead)) and all(
            _norm(extra) in subject for extra in marker.also
        ):
            found.add(marker.purpose)
    return found.pop() if len(found) == 1 else Purpose.UNKNOWN


# ── Requests ─────────────────────────────────────────────────────────────────────────────────────


class BadRequest(ValueError):
    """The request is not a text-only, non-streaming Messages request."""


@dataclass(frozen=True)
class TextRequest:
    model: str
    system: str
    messages: tuple[tuple[str, str], ...]
    max_tokens: int | None = None


def _text_of(content: Any, where: str) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, Mapping) or block.get("type") != "text":
                kind = block.get("type") if isinstance(block, Mapping) else type(block).__name__
                raise BadRequest(f"{where}: only text blocks are supported here, not {kind!r}")
            text = block.get("text")
            if not isinstance(text, str):
                raise BadRequest(f"{where}: a text block needs `text`")
            parts.append(text)
        return "\n".join(parts)
    raise BadRequest(f"{where} must be a string or a list of text blocks")


def parse_request(body: Any) -> TextRequest:
    if not isinstance(body, Mapping):
        raise BadRequest("The body must be a JSON object.")
    if body.get("stream"):
        raise BadRequest("Streaming is not supported here; send `stream: false`.")
    if body.get("tools") or body.get("tool_choice"):
        raise BadRequest("Tools are not supported here: this endpoint answers text only.")
    model = body.get("model")
    if not isinstance(model, str) or not model.strip():
        raise BadRequest("`model` is required.")
    system_raw = body.get("system")
    system = "" if system_raw is None else _text_of(system_raw, "`system`")
    raw_messages = body.get("messages")
    if not isinstance(raw_messages, list) or not raw_messages:
        raise BadRequest("`messages` must be a non-empty list.")
    messages: list[tuple[str, str]] = []
    for index, message in enumerate(raw_messages):
        where = f"`messages[{index}]`"
        if not isinstance(message, Mapping) or message.get("role") not in ("user", "assistant"):
            raise BadRequest(f"{where} needs a role of user or assistant.")
        messages.append((message["role"], _text_of(message.get("content"), f"{where}.content")))
    max_tokens = body.get("max_tokens")
    if max_tokens is not None and (
        isinstance(max_tokens, bool) or not isinstance(max_tokens, int) or max_tokens < 1
    ):
        raise BadRequest("`max_tokens` must be a whole number of 1 or more.")
    return TextRequest(
        model=model.strip(), system=system, messages=tuple(messages), max_tokens=max_tokens
    )


def render_prompt(messages: tuple[tuple[str, str], ...]) -> str:
    """The conversation as one prompt for a CLI. A single user message is passed as it is."""
    if len(messages) == 1 and messages[0][0] == "user":
        return messages[0][1]
    labels = {"user": "User", "assistant": "Assistant"}
    return "\n\n".join(f"{labels[role]}:\n{text}" for role, text in messages)


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / 4)


# ── Runtime wiring ───────────────────────────────────────────────────────────────────────────────


class EngineUnavailable(RuntimeError):
    """An engine refused before answering. Its message is safe to show and to log."""


class RunClaudeText(Protocol):
    """Runs Claude Code once, text only, no tools, and returns its answer. Sync or async.

    Provided by the member runtime (``claude_cli.py``). ``system`` may be empty; ``model`` is None for
    the CLI's own default. Raise :class:`EngineUnavailable` with a plain reason (not signed in, a
    usage limit) when it cannot answer.
    """

    def __call__(self, system: str, prompt: str, model: str | None) -> str | Awaitable[str]: ...


def claude_not_wired(system: str, prompt: str, model: str | None) -> str:
    raise EngineUnavailable("Claude Code is not connected to this service yet")


@dataclass
class AuxRuntime:
    run_claude_text: RunClaudeText = claude_not_wired
    engines: EnginesConfig | None = None
    assistant: AssistantClient = field(default_factory=AssistantClient)
    #: Resolves an engine's ``credential_secret_ref``. None in M1: keyed engines are skipped.
    resolve_secret: Callable[[str], str | None] | None = None
    #: None reads ``FREEDUET_LOCAL_KEY`` at request time.
    local_key: str | None = None

    def engines_config(self) -> EnginesConfig:
        if self.engines is None:
            self.engines = engines_mod.load_engines()
        return self.engines

    def expected_key(self) -> str:
        if self.local_key is not None:
            return self.local_key
        return os.environ.get("FREEDUET_LOCAL_KEY", "")


_runtime: AuxRuntime | None = None


def configure(
    *,
    run_claude_text: RunClaudeText | None = None,
    engines: EnginesConfig | None = None,
    assistant: AssistantClient | None = None,
    resolve_secret: Callable[[str], str | None] | None = None,
    local_key: str | None = None,
) -> AuxRuntime:
    """Wire the router at start-up. Loads engines.yaml now, so a bad file stops the service early."""
    global _runtime
    _runtime = AuxRuntime(
        run_claude_text=run_claude_text or claude_not_wired,
        engines=engines if engines is not None else engines_mod.load_engines(),
        assistant=assistant or AssistantClient(),
        resolve_secret=resolve_secret,
        local_key=local_key,
    )
    return _runtime


def get_runtime() -> AuxRuntime:
    """FastAPI dependency. Tests may override it with ``app.dependency_overrides``."""
    global _runtime
    if _runtime is None:
        _runtime = AuxRuntime()
    return _runtime


# ── Routing ──────────────────────────────────────────────────────────────────────────────────────


def plan(purpose: Purpose, config: EnginesConfig) -> list[Engine]:
    """The engines to try for a purpose, in order."""
    if purpose in STRICT_PURPOSES:
        # Tier A, logins first, and never an engine that serves as an assistant.
        return [
            engine
            for engine in engines_mod.ordered_chain(
                engines_mod.DEFAULT_CHAIN, config, min_tier="A"
            )
            if engine.id not in config.assistants.chain
        ]
    logins = [
        engine
        for engine in engines_mod.ordered_chain(engines_mod.DEFAULT_CHAIN, config)
        if engine.billing == "subscription"
    ]
    free = engines_mod.assistant_chain(config)
    return [*free, *(engine for engine in logins if engine not in free)]


def _is_claude_code(engine: Engine) -> bool:
    command = (engine.command or "").strip()
    return engine.kind == "cli" and os.path.basename(command) == "claude"


def _claude_model(engine: Engine, request: TextRequest) -> str | None:
    if engine.model:
        return engine.model
    # The server's own model name, only when it is a Claude model the CLI can take.
    return request.model if request.model.startswith("claude-") else None


async def _call_claude(run: RunClaudeText, system: str, prompt: str, model: str | None) -> str:
    is_async = inspect.iscoroutinefunction(run) or inspect.iscoroutinefunction(
        getattr(run, "__call__", None)
    )
    if is_async:
        result: Any = await run(system, prompt, model)
    else:
        result = await run_in_threadpool(run, system, prompt, model)
        if inspect.isawaitable(result):
            result = await result
    if not isinstance(result, str):
        raise EngineUnavailable("Claude Code returned no text")
    return result


async def _run_engine(runtime: AuxRuntime, engine: Engine, request: TextRequest) -> str:
    if engine.billing == "metered":
        raise EngineUnavailable("metered engines are not run before caps are enforced (M3)")
    if _is_claude_code(engine):
        return await _call_claude(
            runtime.run_claude_text,
            request.system,
            render_prompt(request.messages),
            _claude_model(engine, request),
        )
    if engine.kind == "openai-compatible" and engine.billing == "free":
        api_key = None
        if engine.credential_secret_ref:
            resolve = runtime.resolve_secret
            api_key = resolve(engine.credential_secret_ref) if resolve else None
            if not api_key:
                raise EngineUnavailable("its credential is not available to agent-freeduet")
        return await runtime.assistant.complete(
            base_url=engine.base_url or "",
            model=engine.model or "",
            system=request.system,
            messages=request.messages,
            api_key=api_key,
            max_tokens=request.max_tokens,
        )
    raise EngineUnavailable(f"the `{engine.kind}` engine is not available in this version")


def _describe(error: Exception) -> str:
    if isinstance(error, (EngineUnavailable, AssistantError)):
        return re.sub(r"\s+", " ", str(error)).strip()[:200] or type(error).__name__
    # Anything else may carry a CLI's raw output; name the kind of failure only.
    return f"failed ({type(error).__name__})"


class NoEngineAnswered(RuntimeError):
    def __init__(self, failures: list[str]):
        self.failures = failures
        super().__init__("; ".join(failures) or "no engine is enabled for this request")


async def answer(
    runtime: AuxRuntime, request: TextRequest, purpose: Purpose, config: EnginesConfig
) -> tuple[str, Engine]:
    """Try each planned engine until one answers with text."""
    failures: list[str] = []
    size = estimate_tokens(request.system + "".join(text for _, text in request.messages))
    for engine in plan(purpose, config):
        if engine.billing == "free" and size > config.assistants.max_input_tokens:
            failures.append(f"{engine.id}: longer than assistants.max_input_tokens")
            continue
        try:
            text = await _run_engine(runtime, engine, request)
        except Exception as error:  # noqa: BLE001 - every failure moves to the next engine
            failures.append(f"{engine.id}: {_describe(error)}")
            log.warning("server call %s: %s did not answer: %s", purpose, engine.id, failures[-1])
            continue
        if text.strip():
            return text.strip(), engine
        failures.append(f"{engine.id}: empty answer")
    raise NoEngineAnswered(failures)


# ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────


def _error(status: int, kind: str, message: str) -> JSONResponse:
    return JSONResponse(
        {"type": "error", "error": {"type": kind, "message": message}}, status_code=status
    )


def authorised(given: str | None, expected: str) -> bool:
    """Constant-time key check. An empty expected key refuses everything."""
    if not expected or given is None:
        return False
    return hmac.compare_digest(given.encode("utf-8"), expected.encode("utf-8"))


def message_response(text: str, request: TextRequest) -> dict[str, Any]:
    prompt = request.system + "".join(content for _, content in request.messages)
    return {
        "id": f"msg_{uuid.uuid4().hex}",
        "type": "message",
        "role": "assistant",
        "model": request.model,
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": estimate_tokens(prompt), "output_tokens": estimate_tokens(text)},
    }


@router.post("/v1/messages")
async def create_message(request: Request, runtime: AuxRuntime = Depends(get_runtime)):
    if not authorised(request.headers.get("x-api-key"), runtime.expected_key()):
        return _error(401, "authentication_error", "The x-api-key header is missing or wrong.")
    try:
        body = await request.json()
    except ValueError:
        return _error(400, "invalid_request_error", "The body must be JSON.")
    try:
        parsed = parse_request(body)
    except BadRequest as error:
        return _error(400, "invalid_request_error", str(error))
    try:
        config = runtime.engines_config()
    except EnginesFileError:
        log.exception("engines file is not valid")
        return _error(500, "api_error", "engines.yaml is not valid; see agent-freeduet's log.")
    purpose = classify(parsed.system, parsed.messages)
    try:
        text, engine = await answer(runtime, parsed, purpose, config)
    except NoEngineAnswered as error:
        return _error(503, "api_error", f"No engine could answer this request: {error}")
    log.info("server call %s answered by %s", purpose, engine.id)
    return JSONResponse(
        message_response(text, parsed),
        headers={"x-freeduet-purpose": str(purpose), "x-freeduet-engine": engine.id},
    )
