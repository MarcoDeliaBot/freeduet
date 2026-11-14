"""The same locked-down Claude Code CLI, pointed at an Anthropic-compatible endpoint the person names
(docs/ENGINES_PLAN.md slice 5, constraint 1 to 7 of section 4.1).

WHAT IT IS. A gateway such as OpenRouter's Anthropic endpoint, or a free local router, that speaks the Messages
protocol. The member runs exactly as on the Claude engine: the same CLI, the same lockdown (``claude_cli.build_command``
is called, not copied), the same MCP bridge, the same D4 segments and the same approval gate. Only three things differ,
and they are all in the process's environment: where it sends its requests, which key it sends, and which model name.

WHAT IT IS NOT. It is off unless the person wrote an ``anthropic-compatible`` entry with ``enabled: true`` in
engines.yaml, and it is never first in a chain by default: ``engines.order_logins_first`` puts every login first,
whatever order the file lists. A metered (paid) endpoint runs only when FreeDuet can hold it to the limits the person set
(the spend ledger, ledger.py, docs/ENGINES_PLAN.md slice 12): the maintainer's switch open, the person's words in the
``metered:`` block, and a kind that reports what each turn costs (:func:`engines.paid_gateway_gap`). None of the three holds
today, because this kind reports no cost it can vouch for (``engines.COST_REPORTING_KINDS``), so a paid endpoint gets no
adapter and nothing can start it; the refusal is said in plain words to the person, in the log and by ``GET /engines``
(:func:`engines.paid_gateway_refusal`). ``billing`` is the person's own statement: FreeDuet cannot see what a gateway
charges. Nothing here ever calls the network itself: the CLI does, and a probe never starts a turn (see ``probe``).

TOKENS, NOT MONEY. The turn's token counts, as far as the CLI printed them, go to the ledger through ``Health.usage``
(:func:`note_usage`). The cost the CLI prints (``total_cost_usd``) is never read: Anthropic's documentation calls it a
client-side estimate from a price table bundled with the CLI and says not to take financial decisions from it, and the CLI
prints one even for a model it does not know, so it is not what the gateway charged.

THE KEY. It is the person's own key at the gateway, never a subscription credential. It is read from an environment
variable of this service or from a file the person names (``credential_secret_ref``: ``env:NAME`` or
``file:/absolute/path``), once per turn, and it goes to the CLI through the environment and nowhere else: never
into a file, an argument, the state file, a log line, a notice, an error message or the transcript. Whatever the CLI
or the gateway prints, the exact key is replaced by ``[key]`` before anything reads it (:class:`Scrubber`). A value that
is not a bearer token as RFC 6750 writes it (so no sign-in file, which is JSON), or that holds a Claude plan token
(``sk-ant-oat`` or ``sk-ant-ort``), is treated as no key: the person pointed at the wrong thing, and it is not sent
anywhere. A file in a folder whose name starts with a dot, or in this service's own ``CLAUDE_CONFIG_DIR``, is not even
opened (:func:`read_key`).

THE SUBSCRIPTION STAYS OUT. Claude Code, given a base URL alone, keeps using the saved Claude sign-in and sends that
token to the new address. So this kind never starts the CLI without a key of its own, never copies ``HOME`` or
``CLAUDE_CONFIG_DIR`` from this service (the child gets empty ones inside the segment's private folder, deleted with
it), never copies any ``ANTHROPIC_*`` name from this service, and sets the key as the bearer token with the other
credential variable blank, which is what OpenRouter's documentation asks for. This module opens no file but the key
file the person named.

THE KEY-FREE ENTRY. An entry with ``no_key: true`` is a local server that takes no key, such as Ollama's Anthropic-compatible
endpoint. ``engines.py`` accepts it only at a plain http address on this machine or at host.docker.internal. Its CLI gets
the placeholder ``NO_KEY_TOKEN`` as the bearer token; everything else above is unchanged (the same empty folders, the same
allowlist, no ``ANTHROPIC_*`` name from this service, no Claude sign-in in reach). Nothing is replaced in its output,
because the placeholder is not a secret.

WHAT THE PROBE CAN SAY. There is no free health call on an arbitrary gateway: any request to it is a request it may
bill, count or refuse. So the probe is "the CLI is installed (``claude --version``, run with no key and no base URL
in its environment) and a usable key is configured". It says exactly that and nothing about whether the gateway
answers: the first real turn does, and its failure is classified like any other (``claude_cli.turn_failure``).
A key-free entry is the one place where this module asks an address itself: ``answers_on_this_machine`` sends one
``GET /api/version`` to the entry's own host and port, for at most two seconds, with no key and no body. Any HTTP status
line counts as an answer; silence, a refused connection and a reply that is not HTTP do not.

WHAT IT CANNOT PROMISE. Which model answers, and how well it calls tools, is the gateway's. Anthropic and OpenRouter
do not promise it for a non-Claude model, so an entry's ``tier`` defaults to C and the router's quality floor keeps
a skill that needs A or B off it. ``capabilities`` says what the CLI can do mechanically, not what the model behind
the endpoint does reliably.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import tempfile
from collections.abc import Mapping
from contextlib import suppress
from pathlib import Path
from urllib.parse import urlsplit

from . import agui, claude_cli
from .claude_engine import MAX_STDERR, PIPE_DRAIN_SECONDS, mcp_state
from .engine_adapter import (
    COULD_NOT_RUN,
    NOT_ANSWERING,
    NOT_INSTALLED,
    TIMED_OUT,
    EngineAdapter,
    Finished,
    Gate,
    Health,
    Outcome,
    ProbeResult,
    Sink,
    TurnContext,
    Usage,
)
from .engine_errors import EngineLimit, describe
from .engines import (
    COMPATIBLE_KIND,
    Engine,
    EnginesConfig,
    exclusion_reason,
    in_hidden_folder,
    is_local_host,
    paid_gateway_refused,
    parse_secret_ref,
)
from .failure_classifier import AUTH, LIMIT_KINDS, UNKNOWN, Failure, classify_failure
from .stream_json import Final, StreamParser

log = logging.getLogger("freeduet.compatible_engine")

#: A key is a bearer token as RFC 6750 writes it, which is how it travels: letters, digits and `- . _ ~ + /`, then any
#: number of `=`. It has no space, quote, brace or comma, so a file that holds a sign-in (JSON) or any other text is
#: never a key, whatever its size. At least 8 characters (a shorter one cannot be scrubbed safely: it would be found
#: inside the stream's own field names) and at most 512.
KEY_SHAPE = re.compile(r"[A-Za-z0-9\-._~+/]+=*")
KEY_MIN_LENGTH, KEY_MAX_LENGTH = 8, 512
#: A key file larger than this is not a key file.
KEY_FILE_MAX_BYTES = 4096
#: What a Claude plan's own tokens start with: the long-lived token `claude setup-token` prints, and the refresh token
#: kept beside it. Neither is ever a gateway key, and sending one to a third party would hand over a subscription
#: credential.
SUBSCRIPTION_TOKEN_MARKERS = ("sk-ant-oat", "sk-ant-ort")
REDACTED = "[key]"
#: The bearer token of a key-free entry (`no_key: true`). It is not a secret: it is written in this file, and a local server
#: that takes no key ignores it (docs.ollama.com/api/anthropic-compatibility: "required but ignored"). Setting it as the bearer
#: is also what keeps the CLI from looking for a sign-in of its own.
NO_KEY_TOKEN = "no-key-needed"
#: What a key-free entry's probe asks its own address for: Ollama's documented version route (docs.ollama.com/api-reference/
#: get-version), which takes no key and does no model work, and the time it may take.
LOCAL_PROBE_PATH = "/api/version"
LOCAL_PROBE_SECONDS = 2.0

#: What the CLI process may see of this service's environment: the Claude engine's allowlist, without the two names
#: that say where a Claude sign-in lives. Every ANTHROPIC_* name is absent by construction.
PASSED_ENV = tuple(name for name in claude_cli.PASSED_ENV if name not in {"HOME", "CLAUDE_CONFIG_DIR"})
#: Settings Claude Code documents for a gateway (code.claude.com, environment variables): no other traffic than the
#: requests to the gateway (updates, telemetry, error reports, surveys), and no pre-release `anthropic-beta` header or
#: body field, which is what a gateway that does not know them answers with a 400.
#: `CLAUDE_CODE_MAX_RETRIES` (code.claude.com, errors, "Tune retry behavior"; default 10): a gateway that answers 401 is
#: asked again, with growing waits, for about two minutes before the CLI gives up (seen against a loopback test
#: double, CLI 2.1.325). A turn that has another engine to go to cannot wait that long, and a refused key does not
#: pass. Two retries ride out a blip and then fail, so the router can move on.
#: `CLAUDE_CODE_MCP_ALLOWLIST_ENV` (same page): the bridge, the only MCP server, is started with a baseline environment
#: plus the port and secret its entry names, and not with the CLI's own environment, which here holds the gateway key.
#: Seen with the real CLI 2.1.325: the bridge still gets its port and secret, and no `ANTHROPIC_*` name or key. A CLI that
#: does not know the name ignores it, and the bridge then inherits the environment as it does on the Claude engine.
#: `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is NOT set: it makes the CLI refuse to start unless `bubblewrap` is installed.
GATEWAY_ENV = {
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1",
    "CLAUDE_CODE_MAX_RETRIES": "2",
    "CLAUDE_CODE_MCP_ALLOWLIST_ENV": "1",
}
#: Every model name the CLI may ask for (the main one, the aliases, and the small one it uses for background work) is
#: the one model the entry names: a default name such as a Claude model id would not exist on the gateway.
MODEL_VARIABLES = (
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
)
HOME_FOLDER = "gateway-home"
CONFIG_FOLDER = "gateway-config"


class NoKey(ValueError):
    """The entry names no usable key. Carries no value, and no name of where it looked."""


def _inside(path: str, folder: str | None) -> bool:
    """Whether ``path`` is ``folder`` or lies below it, symbolic links resolved. Looks at names only: it opens nothing."""
    if not folder:
        return False
    base = os.path.realpath(folder).rstrip("/")
    return path == base or path.startswith(base + "/")


def read_key(reference: str | None, environ: Mapping[str, str]) -> str | None:
    """The key ``reference`` names, or None when there is none or it is not usable. Never raises, and never says
    what it read: not in an exception, not in a log line.

    A file is opened only after its real path (links resolved) is known to lie in no folder whose name starts with a
    dot and not in this service's own ``CLAUDE_CONFIG_DIR``: a Claude sign-in is kept in such a place, and this module
    never opens it, whatever engines.yaml names. What was read must then look like a key (``KEY_SHAPE``) and must not
    be a Claude plan token."""
    parsed = parse_secret_ref(reference)
    if parsed is None:
        return None
    scheme, where = parsed
    try:
        if scheme == "env":
            raw = environ.get(where) or ""
        else:
            path = os.path.realpath(where)
            if in_hidden_folder(path) or _inside(path, environ.get("CLAUDE_CONFIG_DIR")):
                return None
            with open(path, "rb") as handle:
                data = handle.read(KEY_FILE_MAX_BYTES + 1)
            if len(data) > KEY_FILE_MAX_BYTES:
                return None
            raw = data.decode("ascii")
    except (OSError, UnicodeDecodeError, ValueError):
        return None
    key = raw.strip()
    if not KEY_MIN_LENGTH <= len(key) <= KEY_MAX_LENGTH or not KEY_SHAPE.fullmatch(key):
        return None
    if any(marker in key for marker in SUBSCRIPTION_TOKEN_MARKERS):
        return None
    return key


class Scrubber:
    """Replaces the key with ``[key]`` wherever a captured output holds it: the exact value, and the form it takes
    inside a JSON string. What it does not recognise is a key that was changed on its way out (cut in two, encoded)."""

    def __init__(self, key: str | None):
        """``None`` for a key-free entry: its placeholder is not a secret, so nothing is replaced."""
        forms = sorted({key, json.dumps(key)[1:-1]}, key=len, reverse=True) if key else []
        self._text = tuple(forms)
        self._data = tuple(form.encode("utf-8") for form in forms)

    def text(self, value: str) -> str:
        for form in self._text:
            value = value.replace(form, REDACTED)
        return value

    def data(self, value: bytes) -> bytes:
        for form in self._data:
            value = value.replace(form, REDACTED.encode("utf-8"))
        return value


def _bypass_proxy(env: dict[str, str], host: str) -> None:
    """A gateway on this machine is not reached through the service's proxy: add its host to NO_PROXY, when a proxy is set."""
    if not any(env.get(name) for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy")):
        return
    entry = f"[{host}]" if ":" in host else host
    for name in ("NO_PROXY", "no_proxy"):
        names = [part.strip() for part in env.get(name, "").split(",") if part.strip()]
        if entry not in names:
            names.append(entry)
        env[name] = ",".join(names)


def _private_homes(directory: Path) -> dict[str, str]:
    """An empty ``HOME`` and an empty ``CLAUDE_CONFIG_DIR`` inside ``directory``: the child finds no sign-in anywhere."""
    home, config = directory / HOME_FOLDER, directory / CONFIG_FOLDER
    for folder in (home, config):
        folder.mkdir(mode=0o700, exist_ok=True)
    return {"HOME": str(home), "CLAUDE_CONFIG_DIR": str(config)}


def turn_verdict(parser: StreamParser, stderr: str = "", exit_code: int | None = None) -> Failure | None:
    """How the turn went, for the breaker and for the person: None when the CLI answered, else the classifier's verdict
    on what the CLI said (``claude_cli.turn_failure``), with the HTTP status the CLI reports (``api_error_status``)
    asked when the words alone say nothing. The status is what tells a gateway's 502 or 400 from a failure nobody can
    name; the Claude engine never needed it.

    A 403 is not taken for a refused key. The CLI calls every 403 ``authentication_failed``, and OpenRouter's
    documentation lists a 403 as insufficient permissions, a guardrail block or a moderation flag, which are
    facts about one request: signing the engine out for it would be a guess. Only a 401 is a refused key."""
    failure = claude_cli.turn_failure(parser, stderr, exit_code)
    if failure is None:
        return None
    status = parser.api_error_status
    if status == 403:
        return Failure(UNKNOWN)
    if failure.kind == UNKNOWN and status is not None:
        said = " ".join(part for part in (_reported(parser), stderr) if part)
        return classify_failure(said, status=status)
    return failure


def _reported(parser: StreamParser) -> str:
    """What the CLI said about how the turn ended, once: its result text and the API error it reported are usually
    the same sentence."""
    parts: list[str] = []
    for part in (parser.final.text if parser.final else None, parser.api_error):
        if part and part not in parts:
            parts.append(part)
    return " ".join(parts)


def note_result(health: Health, parser: StreamParser) -> None:
    """The CLI's result line was read: say how the turn went. Only notes; whatever goes wrong here is swallowed, because
    the turn must run exactly as it would have before anyone recorded it (as ``claude_engine.note_result``)."""
    try:
        failure = turn_verdict(parser)
    except Exception:  # noqa: BLE001
        return
    health.failure = failure
    health.answered = health.answered or failure is None


def note_stream_end(health: Health, parser: StreamParser, said: str, exit_code: int | None) -> None:
    """The output ended with no result line: the verdict is what the CLI said on stderr and how it exited."""
    try:
        if parser.final is not None:
            return  # the result line already said how it went
        health.failure = turn_verdict(parser, said, exit_code)
    except Exception:  # noqa: BLE001
        return


def note_usage(health: Health, parser: StreamParser) -> None:
    """The token counts the CLI printed, as far as it did, go to ``health.usage`` for the spend ledger: tokens only, never a
    cost (see the module docstring). Called however the turn ends, so a segment that stops the engine before its result line
    still leaves what the stream had said. Swallows whatever goes wrong, as ``note_result`` does."""
    try:
        used = parser.usage()
        if used is not None:
            health.usage = Usage(input_tokens=used[0], output_tokens=used[1])
    except Exception:  # noqa: BLE001
        return


def failure_event(
    parser: StreamParser, label: str, scrub: Scrubber, stderr: str = "", exit_code: int | None = None, *, keyless: bool = False
) -> dict | None:
    """The RUN_ERROR this turn ended in, or None when it answered. The verdict is :func:`turn_verdict`, so what the
    person is told and what the breaker records are one; the words are this engine's label and the gateway's,
    scrubbed. A refused key is not Claude's sign-in: the message never carries ``OPENBOT_MODEL_AUTH_REQUIRED``, which
    would send the person to a Claude login that has nothing to do with it. ``stderr`` is text already scrubbed."""
    failure = turn_verdict(parser, stderr, exit_code)
    if failure is None:
        return None
    reported = _reported(parser)
    if failure.kind == AUTH:
        if keyless:
            message = (
                f"{label} refused the request, and its entry says it takes no key (`no_key: true` in engines.yaml). If that "
                "endpoint asks for a key, write `credential_secret_ref` for it instead, then send your message again."
            )
        else:
            message = (
                f"{label} did not accept its key. Check the key that `credential_secret_ref` names in engines.yaml, "
                "then send your message again."
            )
        return agui.run_error(scrub.text(message))
    if failure.kind in LIMIT_KINDS:
        said = " ".join((reported or stderr).split())[:300]
        limit = EngineLimit(kind=failure.kind, resets_at=failure.retry_at, said=said)
        return agui.run_error(scrub.text(describe(label, limit)), claude_cli.ENGINE_LIMITED)
    if reported:
        return agui.run_error(scrub.text(f"{label} could not finish this turn: {claude_cli._clip(reported)}"))
    code = f" (exit code {exit_code})" if exit_code not in (None, 0) else ""
    return agui.run_error(f"{label} ended without an answer{code}.")


async def _answered(host: str, port: int, request: bytes) -> bool:
    """One request on one connection, read as far as the status line: True when the reply starts like HTTP."""
    reader, writer = await asyncio.open_connection(host, port)  # a direct connection: no proxy is ever used
    try:
        writer.write(request)
        await writer.drain()
        status = await reader.readline()
    finally:
        writer.close()
        with suppress(Exception):
            await writer.wait_closed()
    return status.startswith(b"HTTP/1.")


async def answers_on_this_machine(base_url: str | None, seconds: float = LOCAL_PROBE_SECONDS) -> bool:
    """Whether a key-free endpoint answers HTTP within ``seconds``: ``GET /api/version`` on the entry's own host and port,
    with no key and no body. Any status line is an answer, because a server that lacks that route still answers; a refused
    connection, a silence past the bound and a reply that is not HTTP are not. Only an address on this machine is ever
    asked (``engines.py`` allows nothing else for such an entry), no redirect is followed. Never raises."""
    try:
        parts = urlsplit(base_url or "")
        host = parts.hostname
        if parts.scheme != "http" or not is_local_host(host):
            return False
        port = parts.port or 80
        shown = f"[{host}]" if ":" in host else host
        request = (
            f"GET {parts.path.rstrip('/')}{LOCAL_PROBE_PATH} HTTP/1.1\r\nHost: {shown}:{port}\r\nConnection: close\r\n\r\n"
        ).encode("ascii")
        return await asyncio.wait_for(_answered(host, port, request), seconds)
    except Exception:  # noqa: BLE001 - asked in a failure path: whatever went wrong, it did not answer
        return False


class CompatibleEngine(EngineAdapter):
    kind = COMPATIBLE_KIND
    capabilities = frozenset({"tools", "approvals", "mcp"})

    def __init__(self, engine: Engine, config: EnginesConfig, binary: str | None = None):
        """One configured entry. ``config`` is read only to ask, at the start of every turn, whether the entry may run
        at all (``exclusion_reason``): the person's switch and the refusal of a paid gateway are checked here as well as
        by the router, so no caller can run a refused engine. ``binary`` is for tests, as on ``ClaudeEngine``."""
        self.key = engine.id
        self.label = engine.id  # the person's own name for it, as written in engines.yaml
        self._engine, self._config, self._binary = engine, config, binary

    # -- the process's environment ---------------------------------------------------------------

    def _environment(self, source: Mapping[str, str], key: str) -> dict[str, str]:
        """The allowlist, the fixed settings, then the entry's own endpoint, key and model. The base is from the
        entry, never from ``source``; the key is the one argument."""
        env = {name: source[name] for name in PASSED_ENV if source.get(name)}
        env.update(claude_cli.FIXED_ENV)
        env.update(GATEWAY_ENV)
        base_url = self._engine.base_url or ""
        env["ANTHROPIC_BASE_URL"] = base_url
        env["ANTHROPIC_AUTH_TOKEN"] = key  # sent as `Authorization: Bearer`
        env["ANTHROPIC_API_KEY"] = ""  # blank on purpose: the other credential variable would take precedence
        for name in MODEL_VARIABLES:
            env[name] = self._engine.model or ""
        host = urlsplit(base_url).hostname
        if host and is_local_host(host):
            _bypass_proxy(env, host)
        return env

    def _token(self, source: Mapping[str, str]) -> str | None:
        """The bearer token the CLI is started with: the placeholder of a key-free entry, else the key the entry names.
        None when the entry names no usable key, and then the CLI is not started."""
        if self._engine.no_key:
            return NO_KEY_TOKEN
        return read_key(self._engine.credential_secret_ref, source)

    def child_env(self, source: dict[str, str] | None = None) -> dict[str, str]:
        """The environment the CLI is started with, less the two private folders ``run_turn`` adds. Raises
        :class:`NoKey` when the entry names no usable key, because a CLI started without one would have nothing to
        authenticate with but whatever sign-in it could find."""
        source = os.environ if source is None else source
        key = self._token(source)
        if key is None:
            raise NoKey(f"{self.label} has no usable key")
        return self._environment(source, key)

    # -- the probe -------------------------------------------------------------------------------

    async def probe(self) -> ProbeResult:
        """Installed, its version, and ``signed_in`` meaning "a usable key is configured" (for a key-free entry: that its own
        address answered). Never a model call and never a request to a gateway. The probe's one request of its own is
        ``GET /api/version`` to a key-free entry's address on this machine; otherwise ``claude --version`` only, with no key
        and no base URL in its environment. Never raises."""
        try:
            return await self._probe()
        except Exception:  # noqa: BLE001 - asked in a failure path: whatever went wrong, the answer is "could not tell"
            return ProbeResult(problem=COULD_NOT_RUN)

    async def _probe(self) -> ProbeResult:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + claude_cli.PROBE_TIMEOUT_SECONDS
        has_key = read_key(self._engine.credential_secret_ref, os.environ) is not None
        with tempfile.TemporaryDirectory(prefix="freeduet-probe-") as folder:
            base = Path(folder)
            work = base / "work"
            work.mkdir()
            env = {name: os.environ[name] for name in PASSED_ENV if os.environ.get(name)}
            env.update(claude_cli.FIXED_ENV)
            env.update(_private_homes(base))
            binary = self._binary or claude_cli.claude_bin()
            try:
                printed = await claude_cli._short([binary, *claude_cli.VERSION_ARGS], work, deadline - loop.time(), env)
            except claude_cli._NotStarted:
                return ProbeResult(installed=False, problem=NOT_INSTALLED)
            except TimeoutError:
                return ProbeResult(problem=TIMED_OUT)
        version = claude_cli._version_of(printed)
        if self._engine.no_key:
            # A key-free endpoint has no sign-in to check: "signed in" here means that its own address answered.
            if await answers_on_this_machine(self._engine.base_url, LOCAL_PROBE_SECONDS):
                return ProbeResult(installed=True, version=version, signed_in=True)
            return ProbeResult(installed=True, version=version, problem=NOT_ANSWERING)
        return ProbeResult(installed=True, version=version, signed_in=has_key)

    # -- the turn --------------------------------------------------------------------------------

    def _refusal(self) -> str | None:
        reason = exclusion_reason(self._engine, self._config)
        if reason is None:
            return None
        if paid_gateway_refused(self._engine, self._config):
            return reason  # the whole sentence: it names the entry and says what works
        return f"{self.label} is not used: {reason}."

    async def run_turn(self, ctx: TurnContext, sink: Sink, gate: Gate) -> Outcome:
        health = ctx.diagnostics.health
        refusal = self._refusal()
        if refusal is not None:
            # The person's switch (or the refusal of a paid gateway), not the engine's health: nothing is recorded
            # against it, and nothing was started, so nothing was billed.
            if paid_gateway_refused(self._engine, self._config):
                log.warning("%s", refusal)
            return Outcome(agui.run_error(refusal))
        key = self._token(os.environ)
        if key is None:
            health.failure = Failure(AUTH)
            log.warning("engine %s: its credential_secret_ref names no usable key; no turn was started", self.key)
            return Outcome(
                agui.run_error(
                    f"{self.label} has no key it can use. Set the key that `credential_secret_ref` names in "
                    "engines.yaml, then send your message again."
                )
            )
        keyless = self._engine.no_key
        scrub = Scrubber(None if keyless else key)
        parser = StreamParser()
        stderr = bytearray()  # raw, bounded, and only ever read through said()
        tasks: set[asyncio.Task] = set()
        readers: tuple[asyncio.Task, ...] = ()
        process = None

        def said() -> str:
            return scrub.text(bytes(stderr).decode("utf-8", errors="replace"))

        def log_the_end() -> None:
            if stderr and parser.final is None:
                log.info("%s stderr: %s", self.key, said()[-2000:])
            if parser.unavailable:
                # The call went nowhere: the CLI answered it itself, so no stored transcript shows it.
                about = ctx.diagnostics
                log.warning(
                    "%s answered \"No such tool available\" for %s (called as %s; handed to OpenBot: %s): "
                    "this %s run offered only %s; mcp: %s (thread %s, run %s)",
                    self.key,
                    ", ".join(parser.unavailable),
                    ", ".join(parser.unavailable_as),
                    ", ".join(about.handed_over) or "nothing",
                    "hand-off" if about.handoff() else "person's",
                    ", ".join(sorted(about.offered)) or "no tool",
                    mcp_state(parser, about.offered),
                    about.thread_id,
                    about.run_id,
                )

        ctx.diagnostics.at_close.append(log_the_end)
        try:
            config = claude_cli.write_mcp_config(ctx.directory, gate.port, gate.secret)
            command = claude_cli.build_command(self._binary or claude_cli.claude_bin(), config, ctx.system, ctx.directory)
            env = {**self._environment(os.environ, key), **_private_homes(ctx.directory)}
            try:
                process = await claude_cli.start(command, ctx.work, env)
            except OSError:
                return Outcome(agui.run_error(f"{self.label} cannot start: the Claude Code CLI is not installed in this service."))
            sink.started()

            async def feed_stdin():
                with suppress(BrokenPipeError, ConnectionError):
                    process.stdin.write(ctx.prompt.encode("utf-8"))
                    await process.stdin.drain()
                    process.stdin.close()

            async def read_stdout():
                with suppress(ValueError, ConnectionError):  # ValueError: a line past MAX_LINE
                    while line := await process.stdout.readline():
                        for item in parser.feed(scrub.data(line)):
                            if isinstance(item, Final):
                                note_result(health, parser)
                                item = Finished(item.text, lambda: failure_event(parser, self.label, scrub, keyless=keyless))
                            else:
                                health.answered = True  # a message started, text came, or a tool was called
                            await sink.put(item)
                await sink.end()

            async def read_stderr():
                while chunk := await process.stderr.read(65536):
                    stderr.extend(chunk)
                    del stderr[:-MAX_STDERR]

            stderr_task = asyncio.create_task(read_stderr())
            readers = (asyncio.create_task(read_stdout()), stderr_task)
            tasks.update(readers)
            tasks.add(asyncio.create_task(feed_stdin()))

            # The stream ends without a result line: wait for the exit, then say why.
            await asyncio.shield(readers[0])
            with suppress(TimeoutError):
                await asyncio.wait_for(process.wait(), 5)
            with suppress(TimeoutError, asyncio.CancelledError):
                await asyncio.wait_for(asyncio.shield(stderr_task), 2)
            note_stream_end(health, parser, said(), process.returncode)
            return Outcome(
                failure_event(parser, self.label, scrub, said(), process.returncode, keyless=keyless)
                or agui.run_error(f"{self.label} ended without an answer.")
            )
        finally:
            note_usage(health, parser)  # whatever the stream said so far, even when the segment stops this engine early
            await claude_cli.stop(process)
            # The CLI's process group is gone: let its pipes reach end of file, so the subprocess
            # transport closes with the segment rather than some time after it.
            pending = [task for task in readers if not task.done()]
            if pending:
                await asyncio.wait(pending, timeout=PIPE_DRAIN_SECONDS)
            for task in list(tasks):
                task.cancel()
            for task in list(tasks):
                with suppress(asyncio.CancelledError, Exception):
                    await task


def adapters_from_config(config: EnginesConfig, binary: str | None = None) -> dict[str, EngineAdapter]:
    """One adapter for each ``anthropic-compatible`` entry that may run: on, not locked, and, if it is a paid gateway, one
    that meets :func:`engines.paid_gateway_gap` (the maintainer's switch, the person's words, cost reporting). A paid gateway
    that is switched on and does not is named in one log line, in the words the person is told, and given no adapter, so
    nothing can start it and it is not a link of any chain; the router still lists it, as refused (``refused_paid_gateways``).
    A default install has no such entry and gets none."""
    built: dict[str, EngineAdapter] = {}
    for engine in config.engines.values():
        if engine.kind != COMPATIBLE_KIND:
            continue
        reason = exclusion_reason(engine, config)
        if reason is not None:
            if paid_gateway_refused(engine, config):
                log.warning("%s", reason)
            continue
        built[engine.id] = CompatibleEngine(engine, config, binary)
    return built
