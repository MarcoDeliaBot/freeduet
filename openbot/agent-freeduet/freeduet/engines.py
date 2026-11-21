"""Engines: load and validate ``engines.yaml``, and order every chain logins first.

THE RULE (docs/PROVIDERS.md, docs/ARCHITECTURE.md §3.3): subscription engines the person signed in to
are always tried first, then free engines, then metered engines, whatever order the file lists them
in. A metered engine joins a chain only while ``metered.enabled`` is true and both caps are above 0.
A disabled engine, or one carrying a ``locked_reason``, is never chosen.

ONE EXCEPTION, STRICTER: a metered ``anthropic-compatible`` gateway (a paid gateway) runs only when FreeDuet can hold
it to the limits the person set (the spend ledger, ledger.py, docs/ENGINES_PLAN.md slice 12). Caps that are written and
not enforced must not let money be spent. Four things must hold: the maintainer's switch is open (``PAID_GATEWAYS_OPEN``,
closed); the person wrote ``metered.enabled: true``, both caps above 0 and ``metered.enforce: ledger``; the kind of the
engine reports what each turn costs, in the currency of the limits (``COST_REPORTING_KINDS``, empty: none is verified);
and the entry is on and not locked. Until they do, the gateway gets no adapter, so nothing can start it, and the person
is told why (:func:`paid_gateway_gap`, :func:`paid_gateway_refusal`, :func:`exclusion_reason`). The ``metered:`` block was
always read and checked, so the file format did not change when the ledger arrived.

Everything here is a pure function of the parsed file. Nothing is started, probed or called; the only
I/O is reading the one YAML file in :func:`load_engines`.
"""

from __future__ import annotations

import ipaddress
import os
import re
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, Iterable, Mapping
from urllib.parse import urlsplit

import httpx
import yaml

COMPATIBLE_KIND = "anthropic-compatible"
KINDS = ("cli", "app-server", "acp", "anthropic-api", "openai-compatible", COMPATIBLE_KIND)
BILLINGS = ("subscription", "free", "metered")
TIERS = ("A", "B", "C")

#: Lower runs first. The whole ordering rule is this table and a stable sort.
BILLING_RANK = MappingProxyType({"subscription": 0, "free": 1, "metered": 2})
#: Lower is better: A is the best tier.
TIER_RANK = MappingProxyType({"A": 0, "B": 1, "C": 2})

#: Kinds that drive an official tool the person signed in to themselves.
LOGIN_KINDS = frozenset({"cli", "app-server", "acp"})
#: Kinds that reach a provider over HTTP with a key the person owns: directly, or (`anthropic-compatible`) through
#: the same locked-down Claude Code CLI pointed at the person's own endpoint (docs/ENGINES_PLAN.md slice 5).
API_KINDS = frozenset({"anthropic-api", "openai-compatible", COMPATIBLE_KIND})

DEFAULT_CHAIN = "default"
DEFAULT_ENGINES_FILE = "/app/engines.yaml"
#: The example shipped next to the package, used when no engines.yaml is present.
EXAMPLE_ENGINES_FILE = Path(__file__).resolve().parent.parent / "engines.example.yaml"

_ENGINE_KEYS = frozenset(
    {
        "kind",
        "command",
        "billing",
        "tier",
        "enabled",
        "locked_reason",
        "experimental_local_login",
        "base_url",
        "model",
        "credential_secret_ref",
        "no_key",
        "first_answer_seconds",
        "light",
        "router",
        "context_tokens",
    }
)
_TOP_KEYS = frozenset({"engines", "metered", "chains", "quality_floor", "assistants", "switching", "own_order"})
_SWITCHING_KEYS = frozenset({"mode", "pin"})
MODES = ("automatic", "ask-first")
_METERED_KEYS = frozenset({"enabled", "currency", "daily_cap", "monthly_cap", "enforce"})
#: `metered.enforce`: `none` (the default) or `ledger`, which holds every metered engine to the caps by what the spend
#: ledger has recorded (ledger.py). The person's own word: a paid gateway does not run without it.
NO_ENFORCEMENT, LEDGER = "none", "ledger"
ENFORCEMENTS = (NO_ENFORCEMENT, LEDGER)
_ASSISTANT_KEYS = frozenset(
    {"enabled", "chain", "max_calls_per_turn", "max_input_tokens", "tasks"}
)
_PLACEHOLDER = re.compile(r"^<.*>$")


class EnginesFileError(ValueError):
    """engines.yaml did not validate. Carries every problem found, not only the first."""

    def __init__(self, source: str, problems: list[str]):
        self.source = source
        self.problems = list(problems)
        listed = "\n".join(f"  - {problem}" for problem in self.problems)
        super().__init__(f"{source} is not a valid engines file:\n{listed}")


@dataclass(frozen=True)
class Engine:
    id: str
    kind: str
    billing: str
    tier: str
    enabled: bool = False
    command: str | None = None
    base_url: str | None = None
    model: str | None = None
    credential_secret_ref: str | None = None
    locked_reason: str | None = None
    experimental_local_login: bool = False
    no_key: bool = False  # an `anthropic-compatible` endpoint on this machine that takes no key (see _compatible_problems)
    # D108. How long a LOCAL model may take to start its answer (a slow first read of a long prompt), in seconds; None is
    # the default for a local entry. Only a local entry may set it (`is_local_model`): the limit of a cloud or login engine is never lengthened.
    first_answer_seconds: float | None = None
    # D108. True sends this entry the light turn (a much smaller prompt); False never does; None is "yes for a local model".
    light: bool | None = None
    # D113. True marks an entry that points at a router on this machine which passes requests on to providers elsewhere
    # (FreeLLMAPI): it is NOT a local model (`is_local_model` is false: the router's own patience, no "reading" notice) and it
    # IS a free cloud engine (`is_free_cloud`: the D101 sentence). Only a free API entry may say it.
    router: bool = False
    # D121. How many tokens of context this model has, as the person or the Engines page wrote it (the page reads it from Ollama or
    # from OpenRouter's model list). None is "not said": a local model is then taken to have DEFAULT_LOCAL_CONTEXT_TOKENS, any other
    # engine none (`context_limit`). Only an `anthropic-compatible` entry may set it.
    context_tokens: int | None = None


@dataclass(frozen=True)
class Metered:
    enabled: bool = False
    currency: str = "EUR"
    daily_cap: float = 0
    monthly_cap: float = 0
    enforce: str = NO_ENFORCEMENT


@dataclass(frozen=True)
class Assistants:
    enabled: bool = False
    chain: tuple[str, ...] = ()
    max_calls_per_turn: int = 10
    max_input_tokens: int = 32000
    tasks: tuple[str, ...] = ()


@dataclass(frozen=True)
class Switching:
    """How one member's chain behaves when an engine cannot take a turn (ENGINES_PLAN section 5)."""

    mode: str = "automatic"
    pin: str | None = None  # an engine id: the member never falls back to another


@dataclass(frozen=True)
class EnginesConfig:
    engines: Mapping[str, Engine]
    metered: Metered
    chains: Mapping[str, tuple[str, ...]]
    quality_floor: Mapping[str, Mapping[str, str]]
    assistants: Assistants
    source: str = "<memory>"
    switching: Mapping[str, Switching] = MappingProxyType({})
    #: D115: members whose chain the person ordered by hand and confirmed. Their file order is kept as written; every other
    #: chain is sorted logins first (:func:`order_logins_first`). Empty by default.
    own_order: frozenset[str] = frozenset()


# ── Loading ──────────────────────────────────────────────────────────────────────────────────────


def engines_file_path(environ: Mapping[str, str] | None = None) -> Path:
    """``FREEDUET_ENGINES_FILE`` (default ``/app/engines.yaml``), else the shipped example."""
    env = os.environ if environ is None else environ
    configured = (env.get("FREEDUET_ENGINES_FILE") or "").strip() or DEFAULT_ENGINES_FILE
    candidate = Path(configured)
    if candidate.is_file():
        return candidate
    # D109: the file the Engines page writes, in the data folder; a file of the person's own above always wins.
    written = Path((env.get("FREEDUET_DATA_DIR") or "").strip() or "/data") / "engines.yaml"
    return written if written.is_file() else EXAMPLE_ENGINES_FILE


def load_engines(
    path: str | os.PathLike[str] | None = None,
    environ: Mapping[str, str] | None = None,
) -> EnginesConfig:
    """Read and validate an engines file. Raises :class:`EnginesFileError` on any problem."""
    source = Path(path) if path is not None else engines_file_path(environ)
    try:
        with open(source, encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except yaml.YAMLError as error:
        raise EnginesFileError(str(source), [f"not valid YAML: {error}"]) from error
    return parse_engines(data, source=str(source))


# ── Validation ───────────────────────────────────────────────────────────────────────────────────


def parse_engines(data: Any, source: str = "<memory>") -> EnginesConfig:
    """Validate a parsed engines document. Pure: raises :class:`EnginesFileError` listing problems."""
    problems: list[str] = []
    if not isinstance(data, Mapping):
        raise EnginesFileError(source, ["the file must be a mapping with an `engines:` section"])

    for key in sorted(set(data) - _TOP_KEYS, key=str):
        problems.append(f"unknown top-level key `{key}`")

    engines = _parse_engine_table(data.get("engines"), problems)
    metered = _parse_metered(data.get("metered"), problems)
    chains = _parse_chains(data.get("chains"), engines, problems)
    floor = _parse_quality_floor(data.get("quality_floor"), problems)
    assistants = _parse_assistants(data.get("assistants"), engines, problems)
    switching = _parse_switching(data.get("switching"), engines, problems)
    own_order = _parse_own_order(data.get("own_order"), problems)

    if problems:
        raise EnginesFileError(source, problems)
    return EnginesConfig(
        engines=MappingProxyType(engines),
        metered=metered,
        chains=MappingProxyType(chains),
        quality_floor=MappingProxyType(floor),
        assistants=assistants,
        source=source,
        switching=MappingProxyType(switching),
        own_order=own_order,
    )


def _is_bool(value: Any) -> bool:
    return isinstance(value, bool)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _optional_text(
    entry: Mapping[str, Any], key: str, where: str, problems: list[str]
) -> str | None:
    value = entry.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        problems.append(f"{where}: `{key}` must be a non-empty string")
        return None
    return value.strip()


# ── The `anthropic-compatible` kind (docs/ENGINES_PLAN.md slice 5) ────────────────────────────────

#: The only hosts a plain `http://` endpoint may name: this machine, or the machine a container runs on (the name
#: Docker gives it). The key travels with every request, so any other endpoint must be `https://`.
LOCAL_HOSTS = frozenset({"localhost", "host.docker.internal"})
_ENV_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,127}")
_MAX_SECRET_PATH = 1024


def is_local_host(host: str | None) -> bool:
    """Whether a URL's host is this machine (a loopback address, `localhost`) or the host of a container."""
    name = (host or "").strip().lower()
    if name in LOCAL_HOSTS:
        return True
    try:
        return ipaddress.ip_address(name).is_loopback
    except ValueError:
        return False


#: D108. The bounds of `first_answer_seconds`, and the default for a local entry: a 35,000-token prompt read at 80 tokens a
#: second takes about 440 s before the first word (seen live, 20 November 2026).
MIN_FIRST_ANSWER_SECONDS = 10.0
MAX_FIRST_ANSWER_SECONDS = 7200.0
LOCAL_FIRST_ANSWER_SECONDS = 900.0


def _is_private_host(host: str | None) -> bool:
    """This machine, or a private network address (10.x, 172.16-31.x, 192.168.x, link-local) or a `.local` name."""
    name = (host or "").strip().lower()
    if is_local_host(name) or name.endswith(".local"):
        return True
    try:
        address = ipaddress.ip_address(name)
    except ValueError:
        return False
    return address.is_private or address.is_link_local


def _local_endpoint(billing: Any, base_url: str | None, no_key: bool) -> bool:
    if billing != "free":
        return False
    if no_key:
        return True
    try:
        return _is_private_host(urlsplit(base_url or "").hostname)
    except ValueError:
        return False


def is_local_model(engine: Engine) -> bool:
    """A model that runs on this machine or this network, for free: an `anthropic-compatible` entry that says `billing: free`
    and takes no key, or whose host is loopback or a private address (D108). A cloud engine, a login and a paid gateway are not."""
    return (
        engine.kind == COMPATIBLE_KIND
        and not engine.router
        and _local_endpoint(engine.billing, engine.base_url, engine.no_key)
    )


def first_answer_limit(engine: Engine) -> float | None:
    """How long this engine may say nothing before the router moves on, or None for the router's own limit (D108). Only a
    local model has one: the entry's `first_answer_seconds`, else 900 s."""
    if not is_local_model(engine):
        return None
    return engine.first_answer_seconds if engine.first_answer_seconds is not None else LOCAL_FIRST_ANSWER_SECONDS


#: D121. The bounds of `context_tokens`, and what a local model is taken to have when the entry does not say (Ollama's own limit can
#: be read only by the Engines page; 32,768 is what a model that fits a small computer usually serves).
MIN_CONTEXT_TOKENS = 2048
MAX_CONTEXT_TOKENS = 4_000_000
DEFAULT_LOCAL_CONTEXT_TOKENS = 32768


def context_limit(engine: Engine) -> int | None:
    """D121. The context size, in tokens, that a transcript sent to this engine must fit: the entry's `context_tokens`, else
    DEFAULT_LOCAL_CONTEXT_TOKENS for a local model, else None (no known limit: the transcript is sent whole, as before)."""
    if engine.context_tokens is not None:
        return engine.context_tokens
    return DEFAULT_LOCAL_CONTEXT_TOKENS if is_local_model(engine) else None


def is_light(engine: Engine) -> bool:
    """Whether a turn on this engine is the light turn (D108): the entry's own `light`, else yes for a local model."""
    if engine.light is not None:
        return engine.light
    return is_local_model(engine)


def in_hidden_folder(path: str) -> bool:
    """Whether a path has a part whose name starts with a dot. That is where a program keeps its own sign-in, so a
    key is never read from there, whatever the file holds. Looks at the name only: it opens nothing."""
    return any(part.startswith(".") for part in path.split("/") if part)


def parse_secret_ref(reference: Any) -> tuple[str, str] | None:
    """The two forms an `anthropic-compatible` entry's `credential_secret_ref` may take: ``env:NAME`` (an
    environment variable of this service) or ``file:/absolute/path`` (a file that holds the key, not inside a folder
    whose name starts with a dot). ``("env", NAME)`` or ``("file", path)``; None for anything else, which includes a
    key written into the file by mistake."""
    if not isinstance(reference, str):
        return None
    scheme, colon, rest = reference.partition(":")
    if not colon:
        return None
    if scheme == "env" and _ENV_NAME.fullmatch(rest):
        return "env", rest
    if (
        scheme == "file"
        and rest.startswith("/")
        and len(rest) <= _MAX_SECRET_PATH
        and rest.isprintable()
        and not in_hidden_folder(rest)
    ):
        return "file", rest
    return None


def _base_url_problem(base_url: str) -> str | None:
    """Why an endpoint address is not usable, in words that never repeat the address (it could hold a secret)."""
    if re.search(r"\s", base_url):
        return "`base_url` must not contain spaces"
    try:
        parts = urlsplit(base_url)
        _ = parts.port  # an invalid port raises here
    except ValueError:
        return "`base_url` is not a valid address"
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return "`base_url` must be an http:// or https:// address with a host name"
    if not parts.netloc.isascii():
        # httpx turns some non-ASCII characters (a full-width dot) into ordinary ones, so the host it dials is not the host
        # that was read here; no gateway needs such a name (D107).
        return "`base_url` must use an ASCII host name"
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        return "`base_url` must not carry a user name or a password; the key goes in `credential_secret_ref`"
    if parts.query or parts.fragment or "?" in base_url or "#" in base_url:
        return "`base_url` must not carry a query or a fragment"
    if parts.scheme == "http" and not is_local_host(parts.hostname):
        return (
            "`base_url` must be https:// unless it points at this machine (localhost, 127.0.0.1, ::1 or "
            "host.docker.internal): the key travels with every request"
        )
    return None


def _plain_local(base_url: str) -> bool:
    """Whether an address is plain `http://` to this machine or to the host of a container: the only addresses an entry
    that takes no key may name, so that no request without a key leaves this machine."""
    try:
        parts = urlsplit(base_url)
        return parts.scheme == "http" and is_local_host(parts.hostname)
    except ValueError:
        return False


def _compatible_problems(
    where: str, base_url: str | None, secret_ref: str | None, command: str | None, no_key: bool = False
) -> list[str]:
    found: list[str] = []
    if command is not None:
        found.append(
            f"{where}: an `{COMPATIBLE_KIND}` engine runs the same Claude Code CLI as `claude-code`; it takes no `command`"
        )
    if base_url is None:
        found.append(f"{where}: an `{COMPATIBLE_KIND}` engine needs `base_url`")
    else:
        reason = _base_url_problem(base_url)
        if reason is not None:
            found.append(f"{where}: {reason}")
    if no_key:
        # An entry that takes no key sends no credential, so its address must be this machine (docs/ENGINES_PLAN.md 9.1).
        # It names a key or it needs none, never both.
        if secret_ref is not None:
            found.append(f"{where}: `no_key: true` and `credential_secret_ref` cannot both be set")
        if base_url is not None and not _plain_local(base_url):
            found.append(
                f"{where}: `no_key: true` is accepted only for a plain http:// address on this machine (localhost, a "
                "127.x.x.x or ::1 address) or host.docker.internal; any other endpoint needs `credential_secret_ref`"
            )
    elif secret_ref is None:
        found.append(
            f"{where}: an `{COMPATIBLE_KIND}` engine needs `credential_secret_ref`; with a base URL alone the CLI "
            "would keep using a Claude sign-in"
        )
    elif parse_secret_ref(secret_ref) is None:
        found.append(
            f"{where}: `credential_secret_ref` must be `env:NAME` (an environment variable) or "
            "`file:/absolute/path` (a file that holds the key, in no folder whose name starts with a dot); "
            "the key itself never goes in this file"
        )
    return found


#: The host of OpenRouter's Anthropic-format address, and the only two shapes of model a `billing: free` entry may ask it for
#: (D107; OpenRouter's pages, read 2026-11-20): a model id that ends in `:free`, or the `openrouter/free` router. A fallback
#: list on a request that names a `:free` model can bill a paid model (openrouter.ai/docs/guides/routing/model-variants/free),
#: so the entry names ONE model, and nothing here or in the CLI's command line ever sends a list of them.
OPENROUTER_HOST = "openrouter.ai"
OPENROUTER_FREE_ROUTER = "openrouter/free"
_FREE_MODEL_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._\-]*(/[A-Za-z0-9][A-Za-z0-9._\-]*)+:free")


def is_openrouter(base_url: str | None) -> bool:
    """Whether an address is OpenRouter's (the host `openrouter.ai` or a sub-domain of it). The host is computed the way httpx
    computes it, because httpx is what sends the request: it normalises a full-width or ideographic dot (U+FF0E, U+3002) to
    "." where `urlsplit` does not. An address httpx cannot read counts as OpenRouter's (the caller then applies the guard).
    The guard reads the host WRITTEN in the file: a private gateway or a CNAME that fronts OpenRouter is outside it."""
    try:
        host = (httpx.URL(base_url or "").host or "").lower().rstrip(".")
    except Exception:  # noqa: BLE001 - not an address httpx accepts: refuse, do not guess
        return True
    return host == OPENROUTER_HOST or host.endswith("." + OPENROUTER_HOST)


def openrouter_free_problem(where: str, base_url: str | None, billing: Any, model: str | None) -> str | None:
    """Why an `anthropic-compatible` entry at OpenRouter that says `billing: free` is refused, or None. Free is the person's own
    statement and FreeDuet cannot see what OpenRouter charges, so the one thing it can check is the model: only a `:free` id or
    the `openrouter/free` router costs nothing, and a list of models (a comma) is how a request falls back to a paid one."""
    if billing != "free" or not is_openrouter(base_url):
        return None
    if model is not None and (model == OPENROUTER_FREE_ROUTER or _FREE_MODEL_ID.fullmatch(model)):
        return None
    return (
        f"{where}: an entry at OpenRouter that says `billing: free` must name exactly one free model: an id that ends in "
        f"`:free` (for example `<provider>/<model>:free`) or `{OPENROUTER_FREE_ROUTER}`. A paid model, a list of models or a "
        "placeholder can charge you, so this entry is refused; write `billing: metered` for a paid model"
    )


def _parse_engine_table(raw: Any, problems: list[str]) -> dict[str, Engine]:
    if not isinstance(raw, Mapping) or not raw:
        problems.append("`engines` must be a non-empty mapping of engine id to settings")
        return {}
    engines: dict[str, Engine] = {}
    for engine_id, entry in raw.items():
        if not isinstance(engine_id, str) or not engine_id.strip():
            problems.append(f"engine id {engine_id!r} must be a non-empty string")
            continue
        engine = _parse_engine(engine_id, entry, problems)
        if engine is not None:
            engines[engine_id] = engine
    return engines


def _parse_engine(engine_id: str, entry: Any, problems: list[str]) -> Engine | None:
    where = f"engine `{engine_id}`"
    if not isinstance(entry, Mapping):
        problems.append(f"{where}: settings must be a mapping")
        return None
    before = len(problems)

    for key in sorted(set(entry) - _ENGINE_KEYS, key=str):
        problems.append(f"{where}: unknown key `{key}`")

    kind = entry.get("kind")
    if kind not in KINDS:
        problems.append(f"{where}: `kind` must be one of {', '.join(KINDS)}")
    billing = entry.get("billing")
    if billing not in BILLINGS:
        problems.append(f"{where}: `billing` must be one of {', '.join(BILLINGS)}")
    # The conservative default for a model the engine file cannot vouch for (ENGINES_PLAN 4.1, constraint 3).
    tier = entry.get("tier", "C" if kind == COMPATIBLE_KIND else None)
    if tier not in TIERS:
        problems.append(f"{where}: `tier` must be one of {', '.join(TIERS)}")

    enabled = entry.get("enabled", False)
    if not _is_bool(enabled):
        # A quoted "false" is a non-empty string, and a non-empty string is truthy.
        problems.append(f"{where}: `enabled` must be true or false, not {enabled!r}")
    experimental = entry.get("experimental_local_login", False)
    if not _is_bool(experimental):
        problems.append(f"{where}: `experimental_local_login` must be true or false")
    no_key = entry.get("no_key", False)
    if not _is_bool(no_key):
        problems.append(f"{where}: `no_key` must be true or false, not {no_key!r}")
    elif no_key and kind != COMPATIBLE_KIND:
        problems.append(f"{where}: `no_key` is only for an `{COMPATIBLE_KIND}` engine")

    first_answer = entry.get("first_answer_seconds")
    if first_answer is not None and (
        not _is_number(first_answer) or not MIN_FIRST_ANSWER_SECONDS <= first_answer <= MAX_FIRST_ANSWER_SECONDS
    ):
        problems.append(
            f"{where}: `first_answer_seconds` must be a number from {MIN_FIRST_ANSWER_SECONDS:g} to {MAX_FIRST_ANSWER_SECONDS:g}"
        )
    light = entry.get("light")
    if light is not None and not _is_bool(light):
        problems.append(f"{where}: `light` must be true or false, not {light!r}")
    elif light is not None and kind != COMPATIBLE_KIND:
        problems.append(f"{where}: `light` is only for an `{COMPATIBLE_KIND}` engine")

    context_tokens = entry.get("context_tokens")
    if context_tokens is not None and (
        isinstance(context_tokens, bool) or not isinstance(context_tokens, int)
        or not MIN_CONTEXT_TOKENS <= context_tokens <= MAX_CONTEXT_TOKENS
    ):
        problems.append(
            f"{where}: `context_tokens` must be a whole number from {MIN_CONTEXT_TOKENS} to {MAX_CONTEXT_TOKENS}, not {context_tokens!r}"
        )
    elif context_tokens is not None and kind != COMPATIBLE_KIND:
        problems.append(f"{where}: `context_tokens` is only for an `{COMPATIBLE_KIND}` engine")

    router = entry.get("router")
    if router is not None and not _is_bool(router):
        problems.append(f"{where}: `router` must be true or false, not {router!r}")
    elif router is True and (kind not in ("openai-compatible", COMPATIBLE_KIND) or billing != "free"):
        problems.append(f"{where}: `router` is only for a free `openai-compatible` or `{COMPATIBLE_KIND}` engine")
    elif router is True and (entry.get("no_key") is True or first_answer is not None):
        problems.append(f"{where}: a `router` engine takes a key and no `first_answer_seconds`: it is not a local model")

    command = _optional_text(entry, "command", where, problems)
    base_url = _optional_text(entry, "base_url", where, problems)
    model = _optional_text(entry, "model", where, problems)
    secret_ref = _optional_text(entry, "credential_secret_ref", where, problems)
    locked_reason = _optional_text(entry, "locked_reason", where, problems)

    if kind in LOGIN_KINDS:
        if command is None:
            problems.append(f"{where}: a `{kind}` engine needs `command`")
        if secret_ref is not None:
            # PROVIDERS.md rule 1: a login lives in the provider's own tool, never in FreeDuet.
            problems.append(
                f"{where}: a login engine cannot carry `credential_secret_ref`; "
                "the person signs in to the provider's own tool"
            )
    if kind in API_KINDS and billing == "subscription":
        # An API labelled as a subscription would jump the queue ahead of every login.
        problems.append(
            f"{where}: a `{kind}` engine calls an API and cannot have `billing: subscription`"
        )
    if kind == "anthropic-api" and billing in BILLINGS and billing != "metered":
        problems.append(f"{where}: an `anthropic-api` engine is always `billing: metered`")
    if kind == "openai-compatible":
        if base_url is None:
            problems.append(f"{where}: an `openai-compatible` engine needs `base_url`")
        elif not re.match(r"^https?://", base_url):
            problems.append(f"{where}: `base_url` must start with http:// or https://")
    if kind == COMPATIBLE_KIND:
        problems.extend(_compatible_problems(where, base_url, secret_ref, command, no_key is True))
        refused = openrouter_free_problem(where, base_url, billing, model)
        if refused is not None:
            problems.append(refused)
    if first_answer is not None and _is_number(first_answer) and not (
        kind == COMPATIBLE_KIND and _local_endpoint(billing, base_url, no_key is True)
    ):
        # D108: a cloud or login engine keeps the router's limit; only a model on this machine or this network may take longer.
        problems.append(f"{where}: `first_answer_seconds` is only for a free `{COMPATIBLE_KIND}` entry on this machine or network")
    if kind in API_KINDS and model is None:
        problems.append(f"{where}: a `{kind}` engine needs `model`")
    if enabled is True and model is not None and _PLACEHOLDER.match(model):
        problems.append(f"{where}: replace the placeholder model {model!r} before enabling it")

    if len(problems) > before:
        return None
    return Engine(
        id=engine_id,
        kind=kind,
        billing=billing,
        tier=tier,
        enabled=enabled,
        command=command,
        base_url=base_url,
        model=model,
        credential_secret_ref=secret_ref,
        locked_reason=locked_reason,
        experimental_local_login=experimental,
        no_key=no_key is True,
        first_answer_seconds=float(first_answer) if first_answer is not None and _is_number(first_answer) else None,
        light=light if _is_bool(light) else None,
        router=router is True,
        context_tokens=context_tokens if isinstance(context_tokens, int) and not isinstance(context_tokens, bool) else None,
    )


def _parse_metered(raw: Any, problems: list[str]) -> Metered:
    if raw is None:
        return Metered()
    if not isinstance(raw, Mapping):
        problems.append("`metered` must be a mapping")
        return Metered()
    for key in sorted(set(raw) - _METERED_KEYS, key=str):
        problems.append(f"metered: unknown key `{key}`")
    enabled = raw.get("enabled", False)
    if not _is_bool(enabled):
        problems.append(f"metered: `enabled` must be true or false, not {enabled!r}")
        enabled = False
    currency = raw.get("currency", "EUR")
    if not isinstance(currency, str) or not currency.strip():
        problems.append("metered: `currency` must be a non-empty string")
        currency = "EUR"
    caps: dict[str, float] = {}
    for key in ("daily_cap", "monthly_cap"):
        # A missing cap is 0, and 0 means never.
        value = raw.get(key, 0)
        if value is None:
            value = 0
        if not _is_number(value) or value < 0:
            problems.append(f"metered: `{key}` must be a number of 0 or more")
            value = 0
        caps[key] = value
    enforce = raw.get("enforce", NO_ENFORCEMENT)
    if enforce not in ENFORCEMENTS:
        problems.append(f"metered: `enforce` must be one of {', '.join(ENFORCEMENTS)}")
        enforce = NO_ENFORCEMENT
    return Metered(enabled=enabled, currency=currency.strip(), enforce=enforce, **caps)


def _engine_id_list(
    raw: Any, where: str, engines: Mapping[str, Engine], problems: list[str]
) -> tuple[str, ...]:
    if not isinstance(raw, list) or not raw:
        problems.append(f"{where} must be a non-empty list of engine ids")
        return ()
    seen: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            problems.append(f"{where}: {item!r} is not an engine id")
        elif item in seen:
            problems.append(f"{where}: `{item}` is listed twice")
        elif item not in engines:
            problems.append(f"{where}: `{item}` is not defined under `engines`")
        else:
            seen.append(item)
    return tuple(seen)


def _parse_chains(
    raw: Any, engines: Mapping[str, Engine], problems: list[str]
) -> dict[str, tuple[str, ...]]:
    if not isinstance(raw, Mapping) or not raw:
        problems.append("`chains` must be a mapping with at least a `default` chain")
        return {}
    chains: dict[str, tuple[str, ...]] = {}
    for member, ids in raw.items():
        if not isinstance(member, str) or not member.strip():
            problems.append(f"chain name {member!r} must be a non-empty string")
            continue
        chains[member] = _engine_id_list(ids, f"chain `{member}`", engines, problems)
    if DEFAULT_CHAIN not in chains:
        problems.append("`chains` needs a `default` chain for members without their own")
    return chains


def _parse_own_order(raw: Any, problems: list[str]) -> frozenset[str]:
    """D115: ``own_order`` is a list of member ids, each once. Absent or empty means every chain is sorted logins first."""
    if raw is None:
        return frozenset()
    if not isinstance(raw, list):
        problems.append("`own_order` must be a list of member ids")
        return frozenset()
    seen: list[str] = []
    for item in raw:
        if not isinstance(item, str) or not item.strip():
            problems.append(f"own_order: {item!r} is not a member id")
        elif item == DEFAULT_CHAIN:
            problems.append("own_order: `default` is not a member; the default chain is always sorted logins first")
        elif item in seen:
            problems.append(f"own_order: `{item}` is listed twice")
        else:
            seen.append(item)
    return frozenset(seen)


def _parse_quality_floor(raw: Any, problems: list[str]) -> dict[str, Mapping[str, str]]:
    if raw is None:
        return {}
    if not isinstance(raw, Mapping):
        problems.append("`quality_floor` must be a mapping of member to {skill or tool: tier}")
        return {}
    floor: dict[str, Mapping[str, str]] = {}
    for member, entries in raw.items():
        if not isinstance(member, str) or not isinstance(entries, Mapping):
            problems.append(f"quality_floor `{member}` must map skill or tool names to a tier")
            continue
        parsed: dict[str, str] = {}
        for name, tier in entries.items():
            if not isinstance(name, str) or tier not in TIERS:
                problems.append(
                    f"quality_floor `{member}`: `{name}` must name a tier ({', '.join(TIERS)})"
                )
                continue
            parsed[name] = tier
        floor[member] = MappingProxyType(parsed)
    return floor


def _positive_int(raw: Mapping[str, Any], key: str, default: int, problems: list[str]) -> int:
    value = raw.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        problems.append(f"assistants: `{key}` must be a whole number of 1 or more")
        return default
    return value


def _parse_assistants(
    raw: Any, engines: Mapping[str, Engine], problems: list[str]
) -> Assistants:
    if raw is None:
        return Assistants()
    if not isinstance(raw, Mapping):
        problems.append("`assistants` must be a mapping")
        return Assistants()
    for key in sorted(set(raw) - _ASSISTANT_KEYS, key=str):
        problems.append(f"assistants: unknown key `{key}`")
    enabled = raw.get("enabled", False)
    if not _is_bool(enabled):
        problems.append(f"assistants: `enabled` must be true or false, not {enabled!r}")
        enabled = False
    chain = _engine_id_list(raw.get("chain"), "assistants `chain`", engines, problems)
    for engine_id in chain:
        billing = engines[engine_id].billing
        if billing != "free":
            # ARCHITECTURE.md §3.5: this check covers the assistant chain only, which takes free
            # engines. The server's own short calls (not auto-review or unknown) try that chain,
            # then the subscription logins (server_calls.plan).
            problems.append(
                f"assistants `chain`: `{engine_id}` is `billing: {billing}`; "
                "assistants run on free engines only"
            )
    tasks = raw.get("tasks", [])
    if not isinstance(tasks, list) or not all(isinstance(task, str) for task in tasks):
        problems.append("assistants: `tasks` must be a list of task names")
        tasks = []
    return Assistants(
        enabled=enabled,
        chain=chain,
        max_calls_per_turn=_positive_int(raw, "max_calls_per_turn", 10, problems),
        max_input_tokens=_positive_int(raw, "max_input_tokens", 32000, problems),
        tasks=tuple(tasks),
    )


def _parse_switching(raw: Any, engines: Mapping[str, Engine], problems: list[str]) -> dict[str, Switching]:
    """``switching: {default|<member>: {mode: automatic|ask-first, pin: <engine id>}}``. Absent: every member is
    automatic with nothing pinned, which is what a file without this section always meant."""
    if raw is None:
        return {}
    if not isinstance(raw, Mapping):
        problems.append("`switching` must be a mapping of member to {mode, pin}")
        return {}
    found: dict[str, Switching] = {}
    for member, entry in raw.items():
        where = f"switching `{member}`"
        if not isinstance(member, str) or not isinstance(entry, Mapping):
            problems.append(f"{where} must be a mapping")
            continue
        for key in sorted(set(entry) - _SWITCHING_KEYS, key=str):
            problems.append(f"{where}: unknown key `{key}`")
        mode = entry.get("mode", "automatic")
        if mode not in MODES:
            problems.append(f"{where}: `mode` must be one of {', '.join(MODES)}")
            mode = "automatic"
        pin = entry.get("pin")
        if pin is not None and (not isinstance(pin, str) or pin not in engines):
            problems.append(f"{where}: `pin` must name an engine defined under `engines`")
            pin = None
        found[member] = Switching(mode=mode, pin=pin)
    return found


def switching_for(member: str, config: EnginesConfig) -> Switching:
    """The member's switching choices: its own entry, else `default`, else automatic with nothing pinned."""
    return config.switching.get(member) or config.switching.get(DEFAULT_CHAIN) or Switching()


# ── Ordering and exclusion ───────────────────────────────────────────────────────────────────────


def metered_allowed(config: EnginesConfig) -> bool:
    """Metered engines may run at all: switched on, and neither cap is 0."""
    metered = config.metered
    return metered.enabled and metered.daily_cap > 0 and metered.monthly_cap > 0


#: THE ONE SWITCH for paid gateways, and it is the maintainer's, not the code's (docs/ENGINES_PLAN.md E3). False: a paid
#: gateway is refused whatever engines.yaml says, which is the behaviour of every release so far. Opening it is a
#: decision about money, so it is made by changing this value and nothing else; it still runs nothing by itself, because
#: a gateway must also meet :func:`paid_gateway_gap`'s other two conditions (the person's words, and cost reporting).
PAID_GATEWAYS_OPEN = False

#: What each kind of engine reports about what a turn cost, as a fact checked against public documentation or a recorded
#: stream: kind -> the currency it reports in. A kind is listed only when its own report states a cost that can be taken
#: as what it charged. EMPTY: none qualifies yet. `anthropic-compatible` (the Claude Code CLI pointed at a gateway) prints
#: `total_cost_usd`, and Anthropic's documentation calls it a "client-side estimate, not authoritative billing data", worked
#: out from a price table bundled with the CLI, and says not to bill users or trigger financial decisions from it
#: (https://code.claude.com/docs/en/agent-sdk/cost-tracking, read 14 November 2026). Seen with CLI 2.1.325 against a loopback
#: test double: a model name the CLI does not know still got a cost (`costBasis: "unknown"`); a Claude model name got
#: Anthropic's list price whatever the gateway charges (`costBasis: "list"`); and a segment that ends on a tool never reads the
#: result line that carries it (segment.py, D4). So it does not qualify (docs/design/engines-ledger.md has the evidence).
COST_REPORTING_KINDS: Mapping[str, str] = MappingProxyType({})

#: Why a paid gateway does not run (:func:`paid_gateway_gap`).
GAP_CLOSED = "closed"  # the maintainer's switch is closed
GAP_SETUP = "setup"  # engines.yaml does not yet say how the limits are kept
GAP_COST = "cost"  # the kind does not report what a turn costs, in the currency of the limits


#: Said to the person, in the log and by ``GET /engines`` when a gateway they switched on is paid and the switch is closed.
#: It does not tell them to set the ``metered:`` block, because nothing in it makes the gateway run while the switch is closed.
PAID_GATEWAY_NOT_RUN = (
    "FreeDuet does not run paid gateways yet, because it cannot yet enforce the limits you set. "
    "Free gateways and your own logins work."
)
#: The same, for a gateway whose switch is open but whose limits are not yet written down the way the ledger needs.
PAID_GATEWAY_SETUP = (
    "It runs only when engines.yaml turns `metered` on, with a daily and a monthly limit above 0 and `enforce: ledger`, "
    "so that FreeDuet keeps the limits you set. Free gateways and your own logins work."
)
#: The same, for a gateway that does not report what a turn costs: a money limit cannot be kept on a cost nobody states.
PAID_GATEWAY_NO_COST = (
    "It does not report what each turn costs, in the currency of your limits, so FreeDuet cannot hold it to a money limit. "
    "Free gateways and your own logins work."
)


def paid_gateway_refusal(label: str, gap: str = GAP_CLOSED) -> str:
    if gap == GAP_SETUP:
        return f"{label} is a paid gateway. {PAID_GATEWAY_SETUP}"
    if gap == GAP_COST:
        return f"{label} is a paid gateway. {PAID_GATEWAY_NO_COST}"
    return f"{label} is a paid gateway. {PAID_GATEWAY_NOT_RUN}"


def is_paid_gateway(engine: Engine) -> bool:
    """An ``anthropic-compatible`` entry whose billing is ``metered``: a gateway that may charge the person per use."""
    return engine.kind == COMPATIBLE_KIND and engine.billing == "metered"


def paid_gateway_gap(engine: Engine, config: EnginesConfig) -> str | None:
    """Why a paid gateway does not run, or None when it may: the first of the switch (``GAP_CLOSED``), the person's words
    (``GAP_SETUP``: ``metered.enabled``, both caps above 0, ``metered.enforce: ledger``) and the kind's cost reporting
    (``GAP_COST``: it reports in the currency of the limits) that does not hold. Says nothing of being on or locked."""
    if not PAID_GATEWAYS_OPEN:
        return GAP_CLOSED
    if not metered_allowed(config) or config.metered.enforce != LEDGER:
        return GAP_SETUP
    reported = COST_REPORTING_KINDS.get(engine.kind)
    if reported is None or reported.strip().upper() != config.metered.currency.strip().upper():
        return GAP_COST
    return None


def paid_gateway_refused(engine: Engine, config: EnginesConfig | None = None) -> bool:
    """A paid gateway the person switched on (on, and not locked) and that FreeDuet will not run. One that is off or
    locked is not in this group: the person never asked for it, so nothing is said. Without ``config`` the conditions
    that depend on it cannot be looked at, so an open switch does not let the gateway through."""
    if not (is_paid_gateway(engine) and engine.enabled and not engine.locked_reason):
        return False
    return config is None or paid_gateway_gap(engine, config) is not None


def refused_paid_gateways(config: EnginesConfig) -> list[Engine]:
    return [engine for engine in config.engines.values() if paid_gateway_refused(engine, config)]


def exclusion_reason(engine: Engine, config: EnginesConfig) -> str | None:
    """Why an engine is left out of every chain, or None when it may run.

    A paid gateway that is switched on and does not meet :func:`paid_gateway_gap` gets :func:`paid_gateway_refusal`: that
    sentence is complete (it names the entry and says what works), so callers use it as it is."""
    if engine.locked_reason:
        return f"locked: {engine.locked_reason}"
    if not engine.enabled:
        return "disabled in engines.yaml"
    if is_paid_gateway(engine):
        gap = paid_gateway_gap(engine, config)
        if gap is not None:
            return paid_gateway_refusal(engine.id, gap)
    if engine.billing == "metered":
        if not config.metered.enabled:
            return "metered engines are off (`metered.enabled: false`)"
        if config.metered.daily_cap <= 0 or config.metered.monthly_cap <= 0:
            return "a metered cap is 0, and 0 means never"
    return None


#: The closed list of words ``exclusion_code`` answers with. `GET /engines` sends these instead of the sentences of
#: ``exclusion_reason``: a sentence can carry what the person wrote in the file (``locked_reason``, an engine's name),
#: and a code cannot, so the server and the page choose the words.
EXCLUSION_CODES = ("locked", "disabled", "paid_gateway", "metered_off", "cap_zero")


def exclusion_code(engine: Engine, config: EnginesConfig) -> str | None:
    """Why an engine is left out of every chain, as one word of :data:`EXCLUSION_CODES`, or None when it may run.

    The same decisions in the same order as :func:`exclusion_reason`, which stays the one the router and the adapters
    use; a test holds the two together."""
    if engine.locked_reason:
        return "locked"
    if not engine.enabled:
        return "disabled"
    if is_paid_gateway(engine) and paid_gateway_gap(engine, config) is not None:
        return "paid_gateway"  # a gateway that meets every condition to run is not left out: the ledger holds it to the limits
    if engine.billing == "metered":
        if not config.metered.enabled:
            return "metered_off"
        if config.metered.daily_cap <= 0 or config.metered.monthly_cap <= 0:
            return "cap_zero"
    return None


def is_free_cloud(engine: Engine) -> bool:
    """A free engine that is not on this machine: an API kind at an address that is not local. What it is sent leaves the
    machine, and a free cloud tier may keep it or use it (D101). A login, a local model and a paid engine are not."""
    if engine.billing != "free" or engine.kind not in API_KINDS:
        return False
    if engine.router:
        return True  # D113: a router on this machine that passes what it is sent on to providers elsewhere
    try:
        host = urlsplit(engine.base_url or "").hostname
    except ValueError:
        return False
    return bool(host) and not is_local_host(host)


def is_allowed(engine: Engine, config: EnginesConfig) -> bool:
    return exclusion_reason(engine, config) is None


def ledger_engine_ids(config: EnginesConfig) -> frozenset[str]:
    """The engines the spend ledger holds to the limits: metered, allowed to run, and the person wrote
    ``metered.enforce: ledger``. Free engines and logins are never in it. Empty on a default install."""
    if config.metered.enforce != LEDGER:
        return frozenset()
    return frozenset(
        engine.id for engine in config.engines.values() if engine.billing == "metered" and is_allowed(engine, config)
    )


def order_logins_first(engines: Iterable[Engine]) -> list[Engine]:
    """Subscription, then free, then metered. Stable, so the file's order holds within a group."""
    return sorted(engines, key=lambda engine: BILLING_RANK[engine.billing])


def tier_at_least(tier: str, minimum: str | None) -> bool:
    """Whether ``tier`` meets ``minimum`` (A is best). No minimum is always met."""
    if minimum is None:
        return True
    return TIER_RANK[tier] <= TIER_RANK[minimum]


def chain_ids(member: str, config: EnginesConfig) -> tuple[str, ...]:
    """The member's chain as written in the file, or the default chain."""
    return config.chains.get(member) or config.chains[DEFAULT_CHAIN]


def ordered_chain(
    member: str,
    config: EnginesConfig | None = None,
    *,
    min_tier: str | None = None,
) -> list[Engine]:
    """The engines a member may run on, with every excluded engine removed. Logins first (subscription, then free, then
    metered) unless the member is in ``own_order`` (D115): then the person's order is kept as the file writes it.

    ``min_tier`` drops engines below a quality floor (see :func:`required_tier`). When ``config`` is
    not given, the engines file is loaded from ``FREEDUET_ENGINES_FILE``.
    """
    cfg = config if config is not None else load_engines()
    if min_tier is not None and min_tier not in TIERS:
        raise ValueError(f"min_tier must be one of {', '.join(TIERS)}")
    candidates = (cfg.engines[engine_id] for engine_id in chain_ids(member, cfg))
    wanted = [
        engine
        for engine in candidates
        if is_allowed(engine, cfg) and tier_at_least(engine.tier, min_tier)
    ]
    if member in cfg.own_order and member != DEFAULT_CHAIN:
        return wanted
    return order_logins_first(wanted)


def order_break(engines: Iterable[Engine]) -> str | None:
    """D115: how an order leaves the logins-first rule, or None when it keeps it. ``paid_before_free_or_login`` when a metered
    engine stands before a subscription or a free one (the worse case, so it wins); ``free_before_login`` when a free engine
    stands before a subscription login."""
    seen_free = seen_metered = False
    kind = None
    for engine in engines:
        if engine.billing == "subscription":
            if seen_metered:
                return "paid_before_free_or_login"
            if seen_free:
                kind = "free_before_login"
        elif engine.billing == "free":
            if seen_metered:
                return "paid_before_free_or_login"
            seen_free = True
        else:
            seen_metered = True
    return kind


def assistant_chain(config: EnginesConfig | None = None) -> list[Engine]:
    """The free engines assistants may use, in file order; empty when assistants are off."""
    cfg = config if config is not None else load_engines()
    if not cfg.assistants.enabled:
        return []
    return [
        cfg.engines[engine_id]
        for engine_id in cfg.assistants.chain
        if cfg.engines[engine_id].billing == "free" and is_allowed(cfg.engines[engine_id], cfg)
    ]


# ── Quality floor ────────────────────────────────────────────────────────────────────────────────


def required_tier(member: str, name: str, config: EnginesConfig | None = None) -> str | None:
    """The minimum tier ``quality_floor`` sets for a member's skill or tool, or None."""
    cfg = config if config is not None else load_engines()
    return cfg.quality_floor.get(member, {}).get(name)


def meets_quality_floor(
    engine: Engine, member: str, name: str, config: EnginesConfig | None = None
) -> bool:
    """Whether ``engine`` may run ``name`` for ``member`` under the quality floor."""
    return tier_at_least(engine.tier, required_tier(member, name, config))
