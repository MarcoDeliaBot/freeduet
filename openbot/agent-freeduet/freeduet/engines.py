"""Engines: load and validate ``engines.yaml``, and order every chain logins first.

THE RULE (docs/PROVIDERS.md, docs/ARCHITECTURE.md §3.3): subscription engines the person signed in to
are always tried first, then free engines, then metered engines, whatever order the file lists them
in. A metered engine joins a chain only while ``metered.enabled`` is true and both caps are above 0.
A disabled engine, or one carrying a ``locked_reason``, is never chosen.

ONE EXCEPTION, STRICTER: a metered ``anthropic-compatible`` gateway is never run, whatever the ``metered:``
block says, until FreeDuet can enforce the caps (the usage ledger, docs/ENGINES_PLAN.md slice 12). Caps that are
written and not enforced must not let money be spent. The block is still read and checked, so the file format does
not change when the ledger arrives (:func:`exclusion_reason`, :func:`paid_gateway_refusal`).

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
    }
)
_TOP_KEYS = frozenset({"engines", "metered", "chains", "quality_floor", "assistants", "switching"})
_SWITCHING_KEYS = frozenset({"mode", "pin"})
MODES = ("automatic", "ask-first")
_METERED_KEYS = frozenset({"enabled", "currency", "daily_cap", "monthly_cap"})
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


@dataclass(frozen=True)
class Metered:
    enabled: bool = False
    currency: str = "EUR"
    daily_cap: float = 0
    monthly_cap: float = 0


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


# ── Loading ──────────────────────────────────────────────────────────────────────────────────────


def engines_file_path(environ: Mapping[str, str] | None = None) -> Path:
    """``FREEDUET_ENGINES_FILE`` (default ``/app/engines.yaml``), else the shipped example."""
    env = os.environ if environ is None else environ
    configured = (env.get("FREEDUET_ENGINES_FILE") or "").strip() or DEFAULT_ENGINES_FILE
    candidate = Path(configured)
    return candidate if candidate.is_file() else EXAMPLE_ENGINES_FILE


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


def _compatible_problems(where: str, base_url: str | None, secret_ref: str | None, command: str | None) -> list[str]:
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
    if secret_ref is None:
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
        problems.extend(_compatible_problems(where, base_url, secret_ref, command))
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
    return Metered(enabled=enabled, currency=currency.strip(), **caps)


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
            # ARCHITECTURE.md §3.5: assistants never use a subscription's limits or a metered API.
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


#: Said to the person, in the log and by ``GET /engines`` when a gateway they switched on is paid and is not run. It does
#: not tell them to set the ``metered:`` block, because nothing in it makes the gateway run yet.
PAID_GATEWAY_NOT_RUN = (
    "FreeDuet does not run paid gateways yet, because it cannot yet enforce the limits you set. "
    "Free gateways and your own logins work."
)


def paid_gateway_refusal(label: str) -> str:
    return f"{label} is a paid gateway. {PAID_GATEWAY_NOT_RUN}"


def is_paid_gateway(engine: Engine) -> bool:
    """An ``anthropic-compatible`` entry whose billing is ``metered``: a gateway that may charge the person per use."""
    return engine.kind == COMPATIBLE_KIND and engine.billing == "metered"


def paid_gateway_refused(engine: Engine) -> bool:
    """A paid gateway the person switched on (on, and not locked) and that FreeDuet will not run. One that is off or
    locked is not in this group: the person never asked for it, so nothing is said."""
    return is_paid_gateway(engine) and engine.enabled and not engine.locked_reason


def refused_paid_gateways(config: EnginesConfig) -> list[Engine]:
    return [engine for engine in config.engines.values() if paid_gateway_refused(engine)]


def exclusion_reason(engine: Engine, config: EnginesConfig) -> str | None:
    """Why an engine is left out of every chain, or None when it may run.

    A paid gateway that is switched on gets :func:`paid_gateway_refusal` whatever ``metered:`` says: that sentence is
    complete (it names the entry and says what works), so callers use it as it is."""
    if engine.locked_reason:
        return f"locked: {engine.locked_reason}"
    if not engine.enabled:
        return "disabled in engines.yaml"
    if is_paid_gateway(engine):
        return paid_gateway_refusal(engine.id)
    if engine.billing == "metered":
        if not config.metered.enabled:
            return "metered engines are off (`metered.enabled: false`)"
        if config.metered.daily_cap <= 0 or config.metered.monthly_cap <= 0:
            return "a metered cap is 0, and 0 means never"
    return None


def is_allowed(engine: Engine, config: EnginesConfig) -> bool:
    return exclusion_reason(engine, config) is None


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
    """The engines a member may run on, logins first, with every excluded engine removed.

    ``min_tier`` drops engines below a quality floor (see :func:`required_tier`). When ``config`` is
    not given, the engines file is loaded from ``FREEDUET_ENGINES_FILE``.
    """
    cfg = config if config is not None else load_engines()
    if min_tier is not None and min_tier not in TIERS:
        raise ValueError(f"min_tier must be one of {', '.join(TIERS)}")
    candidates = (cfg.engines[engine_id] for engine_id in chain_ids(member, cfg))
    return order_logins_first(
        engine
        for engine in candidates
        if is_allowed(engine, cfg) and tier_at_least(engine.tier, min_tier)
    )


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
