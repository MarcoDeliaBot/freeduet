# agent-freeduet: the team on your own login

One AG-UI service (port 4230) that runs every FreeDuet team member on the person's own Claude Code
login, plus the OpenBot server's own short model calls. Design and decisions: [docs/M1_PLAN.md](../../docs/M1_PLAN.md)
and [docs/ARCHITECTURE.md §3](../../docs/ARCHITECTURE.md).

## What it does (M1)

1. OpenBot posts a member's turn to `POST /` (AG-UI over SSE) with `x-openbot-agent-token`. The
   member is the one `forwardedProps.openbotBotId` names (a run without it is refused); its prompt
   comes from the tenant package's `agents.yaml`, and its standing role is read wherever OpenBot put
   it. Another Bot's standing role is quoted as context, never followed.
2. Each turn is a fresh, stateless `claude -p` with no built-in tools and one MCP server, `freeduet`,
   that lists exactly the tools OpenBot offered. A tool call ends the segment: OpenBot runs it under
   its own approval gate and posts again with the result. A call the CLI itself refused ("No such
   tool available") for a tool that was offered is handed over the same way, and the log line says
   how the model called it and what the CLI's init event reported. Tools named in `openbotDeploymentTools`
   (`ask_person`; also `message_bot` on a server without FreeDuet's in-band hand-offs) go through
   OpenBot's callback route and their answer goes straight back to the CLI. A hand-off the callback
   refuses because the person has to approve it ends the turn with a question to the person.
3. After every segment the member's work report becomes a checkpoint and one line in the team log.
   Iris also gets four tools of this service (team log and lessons); lessons the person approved are
   added to that member's prompt on every run.
4. `POST /v1/messages` answers the server's own text-only calls, with `x-api-key ==
   FREEDUET_LOCAL_KEY`: auto-review on Claude Code only; titles, routing, tool selection, triage and
   voice summaries on free assistants first, then Claude Code. Nothing metered runs in M1.

## Files

| Path | Purpose |
|---|---|
| `freeduet/app.py` | Routes (`POST /`, `GET /engines`, `GET /health`), the token check, and the call site that records each segment |
| `freeduet/agui.py`, `members.py`, `transcript.py` | RunAgentInput parsing and SSE; the member by id; the conversation rendered for the CLI |
| `freeduet/segment.py`, `claude_cli.py`, `stream_json.py`, `engine_errors.py` | One segment: start the locked-down CLI, read its stream, end on a tool call |
| `freeduet/engine_adapter.py`, `claude_engine.py` | The engine seam: the interface a segment drives, and Claude Code behind it (process, stream, failures, environment, and its `probe()`: `claude --version` and `claude auth status`, never a model call) |
| `freeduet/engine_router.py`, `engine_notices.py` | The engine chain in the member path: with more than one engine in a member's chain (or a pin) a segment moves to the next engine on a limit, a sign-in problem or a silence, with one short notice in English or Italian; modes, pin, loop guard of 2 switches. With one engine nothing changes |
| `freeduet/engine_state.py`, `engine_breaker.py`, `failure_classifier.py` | What the service knows about its engines. Each member turn is recorded in the engine breaker by how it ended (a single-engine member is only recorded; with a chain of more than one engine the router reads the breaker, see the row above), limited-until is kept in a file in the data volume, and `GET /engines` shows it, behind the token check |
| `tests/test_engine_goldens.py`, `tests/goldens/` | The run path pinned scenario by scenario (stream, launch, logs); regenerate on purpose only, `FREEDUET_UPDATE_GOLDENS=1` |
| `freeduet/bridge/` | The stdio MCP server the CLI starts, and its loopback line to the parent |
| `freeduet/report.py`, `checkpoints.py` | The six report lines read from a member's final text, mapped to a checkpoint and saved |
| `freeduet/report_guard.py` | A turn that did work and ended without its report: one follow-up with no tools asks for it, added to the same message. A turn that ends with no text at all gets one fixed sentence naming the last tool it called |
| `freeduet/tool_notes.py` | The exact reason `message_bot` was not offered on a run (a hand-off at OpenBot's depth limit, or none given), in the member's system text |
| `freeduet/person_language.py` | `forwardedProps.openbotPersonLanguage` (from `FREEDUET_PERSON_LANGUAGE`, D26) read as a code and a name, and the one run note that tells the member which language the person reads in a turn nobody wrote |
| `freeduet/team_log.py`, `lessons.py`, `iris_tools.py`, `origin.py`, `locking.py` | The team log, lessons and Iris's tools; who handed a run over; file locks |
| `freeduet/engines.py`, `server_calls.py`, `assistants.py` | `engines.yaml`, `/v1/messages` and the free OpenAI-compatible engine |
| `engines.example.yaml`, `prices.example.yaml` | Engines and chains; your own dated price table. Copy to `engines.yaml` and `prices.yaml` |
| `tests/` | Offline pytest suite with a fake `claude` CLI: `pip install -r requirements.txt && pytest` (Python 3.12) |
| `Dockerfile`, `LICENSE-APACHE-2.0` | The image; the license of the files ported from Anil-matcha/open-duet |

## Data (`FREEDUET_DATA_DIR`, default `/data`)

| Path | What |
|---|---|
| `handoff/<botId>/<threadId>/` | Checkpoints: immutable JSON history and a readable `HANDOFF.md` |
| `team-log.jsonl` | One line per segment: time, member, thread, run, outcome, summary, `from_iris`, approvals, `report_guard` (whether the report guard had to ask). Rotated at 10 MB |
| `lessons/<member>.json` | Lessons, pending until the person replies `approve <code>` to Iris (rule in `freeduet/lessons.py`) |
| `engine-state.json` | Each engine's state (ready, degraded, open, half-open, signed out), limited-until and counters, so a limit survives a restart. No engine text, no account, no key. `FREEDUET_ENGINE_STATE_FILE` moves it (a bare name is a file of this directory). A missing or corrupt file starts clean and is named in `GET /engines` |

## Hard rules for this service

- It **never** reads, copies, logs or transmits a provider's credential files or tokens. The CLI keeps its own login in its own config directory (a volume); a test fails if any FreeDuet code opens it.
- It **never** starts a CLI with its built-in host tools enabled.
- It **never** adds a metered engine to a chain unless `metered.enabled` is true and the caps allow it.
- A report, a checkpoint or a lesson never approves anything: approvals stay with OpenBot's gateway.

## Signing in (done by the person, never by FreeDuet)

```bash
docker compose exec -it agent-freeduet claude          # Anthropic's own sign-in flow, with your own Claude plan
```

Other engines (Codex, ACP, API keys) are declared in `engines.example.yaml` and arrive in M2 and M3.
