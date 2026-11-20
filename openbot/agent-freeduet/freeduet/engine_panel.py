"""The Engines page's provider cards: a free engine in three clicks (D109, docs/design/engines-three-clicks.md).

One card per provider. The person switches it on, pastes a key and saves it, and presses Test. This module is the
service's side of that: it owns the engines file the page writes, the key files, and the two small requests a card
makes (the model list and the test). The server calls it with the deployment token, and decides WHO may (D106); this
module never sees a person.

THE FILE. The page writes ``<FREEDUET_DATA_DIR>/engines.yaml``, the one engines file this service owns. A file the person
wrote themselves at ``FREEDUET_ENGINES_FILE`` always wins and is never touched: the cards then show it and change
nothing (`file_is_yours`). Every change is validated by the loader (``engines.parse_engines``) BEFORE it is written, so a
change that the loader would refuse (an OpenRouter entry that says free with a paid model, D107, included) is refused with
nothing written; the file is replaced in one step. A change applies from the member's next message: the caller rebuilds
the router (app.py).

THE KEYS. A key is written to ``<FREEDUET_DATA_DIR>/keys/<provider>``, a file with mode 600 in a folder with mode 700, and
the engines file holds only ``credential_secret_ref: file:<that path>`` (the same reference the loader already reads, with
the same refusal of a hidden folder and of the Claude sign-in's folder). No function here returns a key, puts one in an
exception or logs one; a card shows ``key_saved`` and nothing else. Removing a key deletes the file and switches the
provider off. A Claude plan token is refused as a key, as everywhere else (``compatible_engine.read_key``).

WHAT RUNS FOR WHOM. A provider that speaks only the OpenAI format (Groq, Google, Mistral, Cloudflare, Cerebras, llama.cpp,
LM Studio) can be switched on for the light assistants only (``assistants.chain``). Members run on `claude-code` and on
`anthropic-compatible` entries only, so only Ollama and OpenRouter's free models get a member entry too. A paid engine
(Anthropic API) cannot be switched on from the page until spending caps exist, and Cerebras is shown but not offered as free:
its free tier is a trial that needs a card (terms read on 20 November 2026).
"""

from __future__ import annotations

import asyncio
import copy
import ipaddress
import os
import re
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlsplit

import httpx
import yaml

from .members import load_prompts
from .engines import (
    COMPATIBLE_KIND,
    EXAMPLE_ENGINES_FILE,
    OPENROUTER_FREE_ROUTER,
    EnginesFileError,
    engines_file_path,
    in_hidden_folder,
    parse_engines,
)

DATA_ENV = "FREEDUET_DATA_DIR"
DEFAULT_DATA_DIR = "/data"
PANEL_FILE_NAME = "engines.yaml"
KEYS_DIR_NAME = "keys"
#: How long a card's request may take. Under the 10 s a Bun connection may sit silent (CLAUDE.md), because the person's
#: browser waits for it through the server.
REQUEST_TIMEOUT_S = 8.0
MAX_MODELS = 300
_MODEL = re.compile(r"[@A-Za-z0-9][A-Za-z0-9._:/@\-]{0,119}")
_FREE_SUFFIX = re.compile(r"[A-Za-z0-9][A-Za-z0-9._\-]*(/[A-Za-z0-9][A-Za-z0-9._\-]*)+:free")
#: The first line of a file the Engines page wrote. The page recognises its own file by this line and by nothing else: a file
#: without it is the person's, whatever its name or place, and is never written (B1 of the review of PR #414).
MARKER = "# FreeDuet Engines page file (D109): written by the page, replaced on each change. Backups: engines.yaml.bak-*"
_HEADER = (
    MARKER + "\n"
    "# Change it on the Engines page. A file of your own is never touched by the page. Keys are not in this file: each is in\n"
    "# its own file under the data folder.\n"
)
MAX_BACKUPS = 5

LOCAL, FREE, TRIAL, PAID = "local", "free", "trial", "paid"


@dataclass(frozen=True)
class Provider:
    """One card. ``member_base`` is the Anthropic-format address a member entry uses (None: the provider has no member
    entry). ``blocked`` is why the card cannot be switched on at all (None: it can)."""

    id: str
    tag: str
    base_url: str
    needs_key: bool
    member_base: str | None = None
    blocked: str | None = None
    address_fixed: bool = False
    address_to_fill: bool = False  # the address holds a part only the person knows (Cloudflare's account)
    free_model_only: bool = False  # OpenRouter: the guard of D107

    @property
    def cloud(self) -> bool:
        return self.tag != LOCAL

    @property
    def assist_id(self) -> str:
        return f"{self.id}-assist"

    @property
    def member_id(self) -> str:
        return f"{self.id}-member"


PROVIDERS: Mapping[str, Provider] = {
    p.id: p
    for p in (
        Provider("ollama", LOCAL, "http://host.docker.internal:11434/v1", False, member_base="http://host.docker.internal:11434"),
        Provider("llamacpp", LOCAL, "http://host.docker.internal:8080/v1", False),
        Provider("lmstudio", LOCAL, "http://host.docker.internal:1234/v1", False),
        Provider("groq", FREE, "https://api.groq.com/openai/v1", True, address_fixed=True),
        Provider("cerebras", TRIAL, "https://api.cerebras.ai/v1", True, blocked="trial_needs_card", address_fixed=True),
        Provider("google", FREE, "https://generativelanguage.googleapis.com/v1beta/openai", True, address_fixed=True),
        Provider("mistral", FREE, "https://api.mistral.ai/v1", True, address_fixed=True),
        Provider(
            "openrouter", FREE, "https://openrouter.ai/api/v1", True,
            member_base="https://openrouter.ai/api", address_fixed=True, free_model_only=True,
        ),
        Provider(
            "cloudflare", FREE, "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1", True,
            address_to_fill=True,
        ),
        Provider("anthropic-api", PAID, "https://api.anthropic.com/v1", True, blocked="paid", address_fixed=True),
    )
}


class PanelRefused(Exception):
    """A change or a request the card may not make. ``code`` is one word from a closed list the server turns into a
    sentence; it never carries an address, a model or a key."""

    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.code = code
        self.status = status


_lock = asyncio.Lock()


# ── Where things live ────────────────────────────────────────────────────────────────────────────


def data_dir(environ: Mapping[str, str] | None = None) -> Path:
    env = os.environ if environ is None else environ
    return Path((env.get(DATA_ENV) or "").strip() or DEFAULT_DATA_DIR)


def panel_file(environ: Mapping[str, str] | None = None) -> Path:
    return data_dir(environ) / PANEL_FILE_NAME


def key_file(provider: Provider, environ: Mapping[str, str] | None = None) -> Path:
    return data_dir(environ) / KEYS_DIR_NAME / provider.id


def _key_path_safe(provider: Provider, environ: Mapping[str, str] | None = None) -> bool:
    """`keys/` is a real directory and the key's file is a real file, not a link to somewhere else. A path that does not exist
    yet is safe. Looks at the links themselves (lstat), never through them."""
    path = key_file(provider, environ)
    for part in (path.parent, path):
        try:
            mode = os.lstat(part).st_mode
        except FileNotFoundError:
            continue
        except OSError:
            return False
        if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) if part == path.parent else stat.S_ISREG(mode)):
            return False
    return True


def _ensure_keys_dir(path: Path) -> None:
    """Create `keys/` with mode 700 from the start (no moment with a wider mode), refusing a link or a file in its place."""
    if os.path.lexists(path):
        if stat.S_ISLNK(os.lstat(path).st_mode) or not path.is_dir():
            raise PanelRefused("file_not_written", 500)
    else:
        previous = os.umask(0o077)
        try:
            os.makedirs(path, mode=0o700, exist_ok=True)
        finally:
            os.umask(previous)
    os.chmod(path, 0o700)


def _is_marked(path: Path) -> bool:
    """Whether the file starts with the page's own marker line. Reads one line; any failure is "not ours"."""
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.readline().rstrip("\n") == MARKER
    except (OSError, UnicodeDecodeError):
        return False


def own_file_in_use(environ: Mapping[str, str] | None = None) -> bool:
    """Whether the engines file in use is the person's, which the page then leaves alone. It is the page's own only when it is
    in the data folder AND carries the page's marker line: a hand-made file at the very same path (the installation that sets
    ``FREEDUET_ENGINES_FILE`` to it) is the person's."""
    chosen = engines_file_path(environ)
    if chosen == EXAMPLE_ENGINES_FILE:
        return False
    return not (chosen == panel_file(environ) and _is_marked(chosen))


def _backup(path: Path) -> None:
    """Keep a timestamped copy of the file about to be replaced, and the last five copies only."""
    if not path.is_file():
        return
    from datetime import UTC, datetime
    import shutil

    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    try:
        shutil.copy2(path, path.with_name(f"{path.name}.bak-{stamp}"))
        olds = sorted(path.parent.glob(f"{path.name}.bak-*"))
        for old in olds[:-MAX_BACKUPS]:
            old.unlink()
    except OSError as error:
        raise PanelRefused("file_not_written", 500) from error


def _provider(provider_id: str) -> Provider:
    found = PROVIDERS.get(provider_id)
    if found is None:
        raise PanelRefused("unknown_provider", 404)
    return found


# ── The document ─────────────────────────────────────────────────────────────────────────────────


def _load_document(environ: Mapping[str, str] | None = None) -> dict[str, Any]:
    """The panel's file when there is one, else the shipped example: the starting point of a change."""
    path = panel_file(environ)
    source = path if path.is_file() and _is_marked(path) else EXAMPLE_ENGINES_FILE
    try:
        with open(source, encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except (OSError, yaml.YAMLError) as error:
        raise PanelRefused("file_unreadable", 500) from error
    if not isinstance(data, dict):
        raise PanelRefused("file_unreadable", 500)
    return data


def _read_document(environ: Mapping[str, str] | None = None) -> dict[str, Any]:
    """What the cards show: the person's own file when it is in use (read only), else the panel's document."""
    if own_file_in_use(environ):
        try:
            with open(engines_file_path(environ), encoding="utf-8") as handle:
                data = yaml.safe_load(handle)
            return data if isinstance(data, dict) else {}
        except (OSError, yaml.YAMLError):
            return {}
    try:
        return _load_document(environ)
    except PanelRefused:
        return {}


def _write_document(document: dict[str, Any], environ: Mapping[str, str] | None = None) -> None:
    """Validate with the loader, then replace the file in one step. Nothing is written when the loader refuses."""
    try:
        parse_engines(document, source="the engines page")
    except EnginesFileError as error:
        raise PanelRefused("invalid") from error
    path = panel_file(environ)
    if path.exists() and not _is_marked(path):
        raise PanelRefused("file_is_yours", 409)  # never over a file the page did not write
    path.parent.mkdir(parents=True, exist_ok=True)
    _backup(path)
    text = _HEADER + yaml.safe_dump(document, sort_keys=False, allow_unicode=True)
    handle, temporary = tempfile.mkstemp(dir=path.parent, prefix=".engines-", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as out:
            out.write(text)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except OSError as error:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise PanelRefused("file_not_written", 500) from error


def _engines(document: dict[str, Any]) -> dict[str, Any]:
    table = document.setdefault("engines", {})
    if not isinstance(table, dict):
        raise PanelRefused("file_unreadable", 500)
    return table


# ── Keys ─────────────────────────────────────────────────────────────────────────────────────────


def key_saved(provider: Provider, environ: Mapping[str, str] | None = None) -> bool:
    """Whether a usable key is saved for the provider. Reads it only to judge its shape; says nothing else."""
    from .compatible_engine import read_key

    if not provider.needs_key or not _key_path_safe(provider, environ):
        return False
    return read_key(f"file:{key_file(provider, environ)}", os.environ if environ is None else environ) is not None


def save_key(provider_id: str, key: Any, environ: Mapping[str, str] | None = None) -> None:
    """Write the key to its own file, mode 600. Refuses a provider that cannot be switched on, one that takes no key, and
    anything that is not shaped like a key. The key is in no message, whatever happens."""
    from .compatible_engine import KEY_MAX_LENGTH, KEY_MIN_LENGTH, KEY_SHAPE, SUBSCRIPTION_TOKEN_MARKERS

    provider = _provider(provider_id)
    if provider.blocked is not None:
        raise PanelRefused(provider.blocked)
    if not provider.needs_key:
        raise PanelRefused("no_key_needed")
    if own_file_in_use(environ):
        raise PanelRefused("file_is_yours", 409)
    if not isinstance(key, str):
        raise PanelRefused("key_shape")
    text = key.strip()
    if (
        not KEY_MIN_LENGTH <= len(text) <= KEY_MAX_LENGTH
        or not text.isascii()
        or not KEY_SHAPE.fullmatch(text)
        or any(marker in text for marker in SUBSCRIPTION_TOKEN_MARKERS)
    ):
        raise PanelRefused("key_shape")
    path = key_file(provider, environ)
    if in_hidden_folder(str(path)):
        raise PanelRefused("file_not_written", 500)
    if not _key_path_safe(provider, environ):
        raise PanelRefused("file_not_written", 500)
    try:
        data_dir(environ).mkdir(parents=True, exist_ok=True)
        _ensure_keys_dir(path.parent)
        handle, temporary = tempfile.mkstemp(dir=path.parent, prefix=".key-")
        try:
            with os.fdopen(handle, "w", encoding="ascii") as out:
                out.write(text + "\n")
            os.chmod(temporary, 0o600)
            os.replace(temporary, path)
        except OSError:
            try:
                os.unlink(temporary)
            except OSError:
                pass
            raise
    except OSError as error:
        raise PanelRefused("file_not_written", 500) from error


def remove_key(provider_id: str, environ: Mapping[str, str] | None = None) -> None:
    """Delete the key's file. Missing is fine."""
    provider = _provider(provider_id)
    if not _key_path_safe(provider, environ):
        raise PanelRefused("file_not_written", 500)
    try:
        key_file(provider, environ).unlink()
    except FileNotFoundError:
        pass
    except OSError as error:
        raise PanelRefused("file_not_written", 500) from error


# ── Reading the cards ────────────────────────────────────────────────────────────────────────────


def _card(provider: Provider, document: Mapping[str, Any], environ: Mapping[str, str] | None) -> dict[str, Any]:
    table = document.get("engines") if isinstance(document.get("engines"), Mapping) else {}
    assist = table.get(provider.assist_id) if isinstance(table.get(provider.assist_id), Mapping) else {}
    member = table.get(provider.member_id) if isinstance(table.get(provider.member_id), Mapping) else {}
    entry = assist or member
    model = entry.get("model") if isinstance(entry.get("model"), str) else ""
    base = assist.get("base_url") if isinstance(assist.get("base_url"), str) else provider.base_url
    return {
        "id": provider.id,
        "tag": provider.tag,
        "enabled": bool(assist.get("enabled") is True or member.get("enabled") is True) and provider.blocked is None,
        "baseUrl": base,
        "model": model,
        "keySaved": key_saved(provider, environ),
        "needsKey": provider.needs_key,
        "cloud": provider.cloud,
        "forMembers": provider.member_base is not None and provider.blocked is None,
        "forAssistants": provider.blocked is None,
        "blocked": provider.blocked,
        "addressFixed": provider.address_fixed,
        "useFor": _use_for(provider, document),
    }


def panel_state(environ: Mapping[str, str] | None = None) -> dict[str, Any]:
    """What `GET /engines/panel` answers: every card, and whether the page may change them. No key, no path."""
    mine = own_file_in_use(environ)
    document = _read_document(environ)
    return {
        "editable": not mine,
        "reason": "file_is_yours" if mine else None,
        "providers": [_card(provider, document, environ) for provider in PROVIDERS.values()],
    }


# ── Changing a card ──────────────────────────────────────────────────────────────────────────────


#: Ports of FreeDuet's own services, which a local card never points at (the agent itself, the server, the app, the database).
_REFUSED_LOCAL_PORTS = frozenset({3001, 3010, 3101, 3110, 4230, 4231, 5432})
_ACCOUNT = re.compile(r"[A-Za-z0-9]{8,64}")
_LOCAL_PATH = re.compile(r"(/[A-Za-z0-9._~\-]*){0,8}")


def _local_host_ok(host: str) -> bool:
    """Loopback, `host.docker.internal`, a private, link-local or unique-local address literal, or a `*.local` name. A name
    with no dot (a service name on the compose network: postgres, supervisor, agent-freeduet...) is never one of them."""
    host = host.lower().rstrip(".")
    if host in ("localhost", "host.docker.internal"):
        return True
    if host.endswith(".local") and len(host) > len(".local") and re.fullmatch(r"[a-z0-9.\-]+", host):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_link_local


def checked_address(provider: Provider, value: Any, environ: Mapping[str, str] | None = None) -> str:
    """The address a card may use, or a refusal. A key is sent only to the host a provider's own card names (B2 of the review of
    PR #414): a cloud provider's host is its own, and only Cloudflare's account part is the person's to write. A local card
    may reach this machine or its own network, and never one of FreeDuet's own services."""
    if not isinstance(value, str):
        raise PanelRefused("address_shape")
    text = value.strip().rstrip("/")
    if not text or len(text) > 300 or re.search(r"[\s<>]", text):
        raise PanelRefused("address_shape")
    if provider.address_fixed:
        if text != provider.base_url.rstrip("/"):
            raise PanelRefused("address_fixed")
        return text
    try:
        parts = urlsplit(text)
        port = parts.port
    except ValueError as error:
        raise PanelRefused("address_shape") from error
    host = (parts.hostname or "").lower()
    if parts.username is not None or parts.password is not None or "@" in parts.netloc or parts.query or parts.fragment:
        raise PanelRefused("address_shape")
    if provider.cloud:
        expected = urlsplit(provider.base_url)
        if parts.scheme != "https" or host != expected.hostname or port is not None:
            raise PanelRefused("address_host")
        if not re.fullmatch(r"/client/v4/accounts/[A-Za-z0-9]{8,64}/ai/v1", parts.path):
            raise PanelRefused("address_shape")
        return text
    env = os.environ if environ is None else environ
    own = {int(v) for v in (env.get("FREEDUET_PORT"), env.get("PORT")) if v and v.strip().isdigit()}
    if parts.scheme not in ("http", "https") or not _local_host_ok(host) or not _LOCAL_PATH.fullmatch(parts.path):
        raise PanelRefused("address_host")
    if port is not None and (port in _REFUSED_LOCAL_PORTS or port in own):
        raise PanelRefused("address_host")
    return text


def _checked_model(provider: Provider, value: Any) -> str:
    if not isinstance(value, str) or not _MODEL.fullmatch(value.strip()):
        raise PanelRefused("model_shape")
    text = value.strip()
    if provider.free_model_only and not (text == OPENROUTER_FREE_ROUTER or _FREE_SUFFIX.fullmatch(text)):
        # D107: only `openrouter/free` or one id ending in `:free` costs nothing; the loader refuses anything else.
        raise PanelRefused("model_not_free")
    return text


def _member_address(provider: Provider, base_url: str) -> str | None:
    if provider.member_base is None:
        return None
    if provider.address_fixed:
        return provider.member_base
    return re.sub(r"/v1/?$", "", base_url)


def _available_members() -> list[str]:
    """The team's member ids (the keys of chains), from the team file. Empty when there is none."""
    try:
        return [member for member in load_prompts() if isinstance(member, str)]
    except Exception:  # noqa: BLE001 - the card then offers nobody
        return []


def _chosen_members(provider: Provider, document: Mapping[str, Any]) -> list[str]:
    chains = document.get("chains")
    if not isinstance(chains, Mapping):
        return []
    return sorted(
        name for name, ids in chains.items()
        if name != "default" and isinstance(ids, list) and provider.member_id in ids
    )


def _use_for(provider: Provider, document: Mapping[str, Any]) -> dict[str, Any] | None:
    """Which members a CLOUD engine with a member entry is used for. None for any other card (a local engine joins every chain)."""
    if provider.member_base is None or not provider.cloud:
        return None
    return {"available": _available_members(), "chosen": _chosen_members(provider, document)}


def _set_chains(document: dict[str, Any], provider: Provider, on: bool, members: list[str] | None = None) -> None:
    """The assistants' chain, and the members' chains. A LOCAL engine joins every chain. A CLOUD engine joins only the chains of
    the members the person chose (decision of the review of PR #414: what a free cloud service reads is the person's choice,
    member by member, and none by default); the `default` chain never gets it."""
    assistants = document.setdefault("assistants", {})
    if isinstance(assistants, dict):
        chain = [item for item in (assistants.get("chain") or []) if item != provider.assist_id]
        if on:
            chain.append(provider.assist_id)
        assistants["chain"] = chain
    chains = document.get("chains")
    if provider.member_base is None or not isinstance(chains, dict):
        return
    chosen = [] if not (on and provider.cloud) else (members if members is not None else _chosen_members(provider, document))
    for name, ids in list(chains.items()):
        chains[name] = [item for item in (ids or []) if item != provider.member_id]
        if on and not provider.cloud:
            chains[name].append(provider.member_id)
    for member in chosen:
        if member not in chains:
            chains[member] = list(chains.get("default") or [])
        chains[member] = [*chains[member], provider.member_id]


def apply_change(
    provider_id: str,
    *,
    enabled: Any = None,
    base_url: Any = None,
    model: Any = None,
    members: Any = None,
    environ: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Switch a card on or off, set its address and model, and (a cloud engine a member can run on) choose which members use it.
    Raises :class:`PanelRefused` and writes nothing when the change cannot be made; otherwise the engines file is replaced and
    the new card is returned."""
    provider = _provider(provider_id)
    if own_file_in_use(environ):
        raise PanelRefused("file_is_yours", 409)
    if provider.blocked is not None:
        raise PanelRefused(provider.blocked)
    if enabled is not None and not isinstance(enabled, bool):
        raise PanelRefused("enabled_shape")

    document = copy.deepcopy(_load_document(environ))
    table = _engines(document)
    current = table.get(provider.assist_id) if isinstance(table.get(provider.assist_id), dict) else {}
    address = checked_address(provider, base_url, environ) if base_url is not None else current.get("base_url", provider.base_url)
    chosen_model = _checked_model(provider, model) if model is not None else current.get("model")
    switched_on = enabled if enabled is not None else bool(current.get("enabled") is True)

    chosen_members: list[str] | None = None
    if members is not None:
        known = _available_members()
        if (
            provider.member_base is None
            or not provider.cloud
            or not isinstance(members, list)
            or not all(isinstance(item, str) and item in known for item in members)
        ):
            raise PanelRefused("members_shape")
        if members and not switched_on:
            raise PanelRefused("switch_on_first")
        chosen_members = sorted(set(members))

    if switched_on:
        if not isinstance(chosen_model, str) or not chosen_model.strip() or not _MODEL.fullmatch(chosen_model):
            raise PanelRefused("model_first")
        if provider.address_to_fill and "<" in str(address):
            raise PanelRefused("address_first")
        if provider.needs_key and not key_saved(provider, environ):
            raise PanelRefused("key_first")
    if not isinstance(address, str):
        raise PanelRefused("address_shape")
    if "<" not in address:
        address = checked_address(provider, address, environ)  # also an address already in the file: judged again

    reference = f"file:{key_file(provider, environ)}" if provider.needs_key else None
    shared: dict[str, Any] = {"billing": "free", "tier": "C", "enabled": bool(switched_on)}
    if isinstance(chosen_model, str) and chosen_model:
        shared["model"] = chosen_model
    assist: dict[str, Any] = {"kind": "openai-compatible", "base_url": address, **shared}
    if reference:
        assist["credential_secret_ref"] = reference
    table[provider.assist_id] = assist
    member_address = _member_address(provider, address)
    if member_address is not None:
        member: dict[str, Any] = {"kind": COMPATIBLE_KIND, "base_url": member_address, **shared}
        if reference:
            member["credential_secret_ref"] = reference
        else:
            member["no_key"] = True
        table[provider.member_id] = member
    _set_chains(document, provider, bool(switched_on), chosen_members)
    _write_document(document, environ)
    return _card(provider, document, environ)


# ── The two small requests a card makes ──────────────────────────────────────────────────────────


def _classify(status: int) -> str:
    """The HTTP status as one word of a closed list. The status itself is never passed on."""
    if status == 200:
        return "ok"
    if status in (401, 403):
        return "key_rejected"
    if status in (400, 404, 422):
        return "model_missing"
    if status in (402, 429):
        return "rate_limited"
    return "unreachable"


async def _ask(
    method: str,
    url: str,
    key: str | None,
    body: dict[str, Any] | None,
    transport: httpx.AsyncBaseTransport | None,
) -> tuple[str, Any]:
    """One request. ``(code, json-or-None)`` with the code from the closed list of :func:`_classify`. The key goes in a header
    to the address :func:`checked_address` already judged; nothing it can appear in comes back."""
    headers = {"content-type": "application/json"}
    if key:
        headers["authorization"] = f"Bearer {key}"
    try:
        async with httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_S, transport=transport, trust_env=False, follow_redirects=False
        ) as client:
            response = await client.request(method, url, json=body, headers=headers)
    except Exception:  # noqa: BLE001 - a timeout, a refused connection, anything: one word, never what the library wrote
        return "unreachable", None
    parsed: Any = None
    if response.status_code == 200:
        try:
            parsed = response.json()
        except ValueError:
            return "unreachable", None
    return _classify(response.status_code), parsed


def _configured(provider_id: str, environ: Mapping[str, str] | None) -> tuple[Provider, str, str, str | None]:
    provider = _provider(provider_id)
    if provider.blocked is not None:
        raise PanelRefused(provider.blocked)
    document = _read_document(environ)
    table = document.get("engines") if isinstance(document.get("engines"), Mapping) else {}
    entry = table.get(provider.assist_id) if isinstance(table.get(provider.assist_id), Mapping) else {}
    base = entry.get("base_url") if isinstance(entry.get("base_url"), str) else provider.base_url
    model = entry.get("model") if isinstance(entry.get("model"), str) else ""
    if provider.address_to_fill and "<" in base:
        raise PanelRefused("address_first")
    # Judged again at the moment a key is about to be sent: whatever the file holds, a key goes only to the provider's own host.
    base = checked_address(provider, base, environ)
    key = None
    if provider.needs_key:
        from .compatible_engine import read_key

        if not _key_path_safe(provider, environ):
            raise PanelRefused("key_first")
        key = read_key(f"file:{key_file(provider, environ)}", os.environ if environ is None else environ)
        if key is None:
            raise PanelRefused("key_first")
    return provider, base, model, key


async def test_provider(
    provider_id: str,
    environ: Mapping[str, str] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """A tiny real request with the saved key: one word from a closed list (ok, key_rejected, model_missing, rate_limited,
    unreachable). Never a key, a body or the provider's own status."""
    _provider_checked, base, model, key = _configured(provider_id, environ)
    if not model:
        raise PanelRefused("model_first")
    payload = {"model": model, "messages": [{"role": "user", "content": "Reply with the word ok."}], "max_tokens": 8, "stream": False}
    code, _ = await _ask("POST", f"{base}/chat/completions", key, payload, transport)
    return {"ok": code == "ok", "code": code}


async def list_models(
    provider_id: str,
    environ: Mapping[str, str] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """The model ids the provider lists (the OpenAI format's `GET /models`), at most 300. For OpenRouter only the free ones."""
    provider, base, _model, key = _configured(provider_id, environ)
    code, body = await _ask("GET", f"{base}/models", key, None, transport)
    if code != "ok":
        return {"ok": False, "code": code, "models": []}
    rows = body.get("data") if isinstance(body, dict) else None
    ids: list[str] = []
    for row in rows if isinstance(rows, list) else []:
        name = row.get("id") if isinstance(row, dict) else None
        if not isinstance(name, str):
            continue
        name = name.removeprefix("models/")
        if _MODEL.fullmatch(name) and (not provider.free_model_only or name == OPENROUTER_FREE_ROUTER or _FREE_SUFFIX.fullmatch(name)):
            ids.append(name)
    return {"ok": True, "code": "ok", "models": sorted(set(ids))[:MAX_MODELS]}


__all__ = [
    "PROVIDERS",
    "PanelRefused",
    "apply_change",
    "list_models",
    "panel_state",
    "remove_key",
    "save_key",
    "test_provider",
]
