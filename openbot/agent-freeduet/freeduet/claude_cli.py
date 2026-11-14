# Copyright the open-duet authors (https://github.com/Anil-matcha/open-duet).
# Licensed under the Apache License, Version 2.0; see LICENSE-APACHE-2.0 in openbot/agent-freeduet.
#
# Ported from Anil-matcha/open-duet, backend/app/services/local_claude_runner.py (LOCKDOWN_ARGS,
# build_args, mcp_config, _kill_tree, the child environment) and claude_adapter.py (_outcome).
# Modified for FreeDuet: one command shape only, D7's lockdown with the `freeduet` MCP server as
# the only tool source and no session (`--no-session-persistence`); an asyncio process instead of
# threads; an allowlisted child environment that never carries an API key or this service's
# tokens; the outcome is an AG-UI RUN_ERROR, with OPENBOT_MODEL_AUTH_REQUIRED for sign-in (D12).
"""The official Claude Code CLI, started locked down for one segment.

Verified against Claude Code 2.1.311's `--help`: every flag below exists there, `--tools ""`
disables every built-in tool, and `--strict-mcp-config` ignores every MCP server but the ones in
`--mcp-config`. FreeDuet never reads the CLI's config directory (PROVIDERS.md rule 1, D9): the CLI
finds its own sign-in there, and this module only passes `CLAUDE_CONFIG_DIR` through unchanged.
"""

import asyncio
import json
import os
import signal
import sys
import tempfile
from contextlib import suppress
from pathlib import Path

from . import agui
from .bridge import ipc
from .engine_errors import classify, describe, is_sign_in_failure
from .stream_json import StreamParser, TextDelta

SERVER_NAME = "freeduet"
AUTH_REQUIRED = "OPENBOT_MODEL_AUTH_REQUIRED"
ENGINE_LIMITED = "FREEDUET_ENGINE_LIMITED"
LABEL = "Claude Code"
SIGN_IN_MESSAGE = (
    "Claude Code is not signed in. Sign in once with "
    "`docker compose exec -it agent-freeduet claude`, then send your message again."
)

# D7. The prompt is never on the command line: it goes in on stdin.
LOCKDOWN_ARGS = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--no-session-persistence",
    "--tools", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    # Every tool of the freeduet server is allowed up front: approvals are OpenBot's, and a
    # headless CLI has nobody to ask. dontAsk refuses anything else instead of prompting.
    "--allowedTools", f"mcp__{SERVER_NAME}",
    "--permission-mode", "dontAsk",
]

# The server's own short calls: text in, text out, nothing to stream to a person.
TEXT_ARGS = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--tools", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--permission-mode", "dontAsk",
]
# The server gives up on these calls after 10 s; answer, or say why, before it does.
TEXT_TIMEOUT_SECONDS = 9.0

# One argument may not exceed 128 KiB on Linux (MAX_ARG_STRLEN). Past this, the member prompt goes
# through the CLI's `--append-system-prompt-file` (present in 2.1.311, not listed by --help).
MAX_INLINE_SYSTEM_BYTES = 100_000

# What the CLI process may see of this service's environment. An allowlist, so ANTHROPIC_API_KEY,
# CLAUDE_CODE_OAUTH_TOKEN, MANAGED_AGENT_TOKEN, AGENT_TOOL_TOKEN and FREEDUET_LOCAL_KEY never reach
# it: the CLI must run on the person's own sign-in, never on a key (PROVIDERS.md, logins first).
PASSED_ENV = (
    "PATH", "HOME", "USER", "LOGNAME", "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR",
    "CLAUDE_CONFIG_DIR",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
    "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
)
FIXED_ENV = {
    # The image pins the CLI version; it must not replace itself.
    "DISABLE_AUTOUPDATER": "1",
    # No notes written outside the conversation for runs this service starts.
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1",
}

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
MAX_LINE = ipc.MAX_LINE


def claude_bin() -> str:
    return os.environ.get("CLAUDE_BIN") or "claude"


def _key_or_token(name: str) -> bool:
    return name.startswith("ANTHROPIC_") or name == "CLAUDE_CODE_OAUTH_TOKEN"


def child_env(source: dict[str, str] | None = None) -> dict[str, str]:
    """The CLI's environment: the allowlist, then every ANTHROPIC_* name and the plan-token name
    stripped again, so a future allowlist entry can never let an API key in."""
    source = os.environ if source is None else source
    env = {name: source[name] for name in PASSED_ENV if source.get(name)}
    env.update(FIXED_ENV)
    return {name: value for name, value in env.items() if not _key_or_token(name)}


def write_mcp_config(directory: Path, port: int, secret: str) -> Path:
    """The `--mcp-config` file naming the freeduet bridge and nothing else. It holds the run's
    loopback secret, so it is written owner-only, in the segment's private folder."""
    config = {
        "mcpServers": {
            SERVER_NAME: {
                "type": "stdio",
                "command": sys.executable,
                "args": ["-m", "freeduet.bridge"],
                "env": {
                    ipc.PORT_ENV: str(port),
                    ipc.SECRET_ENV: secret,
                    "PYTHONPATH": str(PACKAGE_ROOT),
                },
            }
        }
    }
    path = directory / "mcp.json"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as file:
        json.dump(config, file)
    return path


def _system_args(system_text: str, directory: Path) -> list[str]:
    if not system_text:
        return []
    if len(system_text.encode("utf-8")) <= MAX_INLINE_SYSTEM_BYTES:
        return ["--append-system-prompt", system_text]
    path = directory / "system.txt"
    path.write_text(system_text, encoding="utf-8")
    return ["--append-system-prompt-file", str(path)]


def build_command(executable: str, mcp_config: Path, system_text: str, directory: Path) -> list[str]:
    """A member's segment: the lockdown, the freeduet bridge as the only MCP server."""
    return [executable, *LOCKDOWN_ARGS, "--mcp-config", str(mcp_config), *_system_args(system_text, directory)]


def build_text_command(executable: str, system_text: str, model: str | None, directory: Path) -> list[str]:
    """A server-side text call (stream B's `/v1/messages`): the same lockdown with no MCP server
    at all, so no tool exists. `--strict-mcp-config` without `--mcp-config` loads none."""
    command = [executable, *TEXT_ARGS]
    if model:
        command += ["--model", model]
    return [*command, *_system_args(system_text, directory)]


async def start(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> asyncio.subprocess.Process:
    # A session of its own, so stopping it stops the bridge it launched as well.
    return await asyncio.create_subprocess_exec(
        *command,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=child_env() if env is None else env,
        limit=MAX_LINE,
        start_new_session=True,
    )


async def stop(process: asyncio.subprocess.Process | None) -> None:
    if process is None:
        return
    # The whole session, even when the CLI has already exited on its own: the bridge it launched
    # is in the same process group, holds the CLI's stderr open and would otherwise outlive the
    # segment (the group id stays reserved while any member of it is alive).
    with suppress(ProcessLookupError, PermissionError):
        os.killpg(process.pid, signal.SIGKILL)
    if process.returncode is None:
        with suppress(ProcessLookupError):
            process.kill()
    with suppress(Exception):
        await asyncio.wait_for(process.wait(), 10)


def _clip(text: str, limit: int = 300) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit] + "…"


def failure_event(parser: StreamParser, stderr: str = "", exit_code: int | None = None) -> dict | None:
    """The RUN_ERROR this run ended in, or None when it answered."""
    final = parser.final
    failed = final is None or final.is_error or parser.api_error_kind == "authentication_failed"
    if not failed:
        return None
    said = " ".join(part for part in (final.text if final else None, parser.api_error, stderr) if part)
    if parser.api_error_kind == "authentication_failed" or is_sign_in_failure(said):
        return agui.run_error(SIGN_IN_MESSAGE, AUTH_REQUIRED)
    limit = classify(said, resets_at=parser.limit_resets_at)
    if limit is None and (parser.limit_refused or parser.api_error_kind in {"rate_limit", "billing_error"}):
        # The CLI said the account's limit refused the call, in words that do not say so.
        limit = classify(f"Usage limit reached. {said}", resets_at=parser.limit_resets_at)
    if limit is not None:
        return agui.run_error(describe(LABEL, limit), ENGINE_LIMITED)
    reported = " ".join(part for part in (final.text if final else None, parser.api_error) if part)
    if reported:
        return agui.run_error(f"{LABEL} could not finish this turn: {_clip(reported)}")
    code = f" (exit code {exit_code})" if exit_code not in (None, 0) else ""
    return agui.run_error(f"{LABEL} ended without an answer{code}.")


class TextCallFailed(Exception):
    """A server-side text call got no answer. The message is plain and safe to show."""


async def run_text(system: str, prompt: str, model: str | None = None, timeout: float = TEXT_TIMEOUT_SECONDS) -> str:
    """One text-only answer from the person's Claude Code login, for the server's own calls."""
    with tempfile.TemporaryDirectory(prefix="freeduet-text-") as folder:
        directory = Path(folder)
        work = directory / "work"
        work.mkdir()
        try:
            process = await start(build_text_command(claude_bin(), system, model, directory), work)
        except OSError:
            raise TextCallFailed(f"{LABEL} is not installed in this service.") from None
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(prompt.encode("utf-8")), timeout)
        except TimeoutError:
            raise TextCallFailed(f"{LABEL} did not answer in time.") from None
        finally:
            await stop(process)
    parser = StreamParser()
    streamed = [item.text for line in stdout.splitlines() for item in parser.feed(line) if isinstance(item, TextDelta)]
    failure = failure_event(parser, stderr.decode("utf-8", errors="replace"), process.returncode)
    if failure is not None:
        raise TextCallFailed(failure["message"])
    final = parser.final.text if parser.final and parser.final.text else ""
    return final.strip() or "".join(streamed).strip()
