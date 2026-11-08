# agent-freeduet: the team on your own login

One AG-UI service (port 4230) that runs every FreeDuet team member on the person's own Claude Code
login, plus the OpenBot server's own short model calls. Design and decisions: [docs/M1_PLAN.md](../../docs/M1_PLAN.md)
and [docs/ARCHITECTURE.md §3](../../docs/ARCHITECTURE.md).

## What it does (M1)

1. OpenBot posts a member's turn to `POST /` (AG-UI over SSE) with `x-openbot-agent-token`. The
   member is the one `forwardedProps.openbotBotId` names, cross-checked with the standing role; its
   prompt comes from the tenant package's `agents.yaml`.
2. Each turn is a fresh, stateless `claude -p` with no built-in tools and one MCP server, `freeduet`,
   that lists exactly the tools OpenBot offered. A tool call ends the segment: OpenBot runs it under
   its own approval gate and posts again with the result. `message_bot` and `ask_person` go through
   OpenBot's callback route and their answer goes straight back to the CLI.
3. After every segment the member's work report becomes a checkpoint and one line in the team log.
   Iris also gets four tools of this service (team log and lessons); lessons the person approved are
   added to that member's prompt on every run.
4. `POST /v1/messages` answers the server's own text-only calls, with `x-api-key ==
   FREEDUET_LOCAL_KEY`: auto-review on Claude Code only; titles, routing, tool selection, triage and
   voice summaries on free assistants first, then Claude Code. Nothing metered runs in M1.

## Files

| Path | Purpose |
|---|---|
| `freeduet/app.py` | Routes, the token check, and the call site that records each segment |
| `freeduet/agui.py`, `members.py`, `transcript.py` | RunAgentInput parsing and SSE; the member by id; the conversation rendered for the CLI |
| `freeduet/segment.py`, `claude_cli.py`, `stream_json.py`, `engine_errors.py` | One segment: start the locked-down CLI, read its stream, end on a tool call |
| `freeduet/bridge/` | The stdio MCP server the CLI starts, and its loopback line to the parent |
| `freeduet/report.py`, `checkpoints.py` | The six report lines read from a member's final text, mapped to a checkpoint and saved |
| `freeduet/team_log.py`, `lessons.py`, `iris_tools.py`, `origin.py`, `locking.py` | The team log, lessons and Iris's tools; who handed a run over; file locks |
| `freeduet/engines.py`, `server_calls.py`, `assistants.py` | `engines.yaml`, `/v1/messages` and the free OpenAI-compatible engine |
| `engines.example.yaml`, `prices.example.yaml` | Engines and chains; your own dated price table. Copy to `engines.yaml` and `prices.yaml` |
| `tests/` | Offline pytest suite with a fake `claude` CLI: `pip install -r requirements.txt && pytest` (Python 3.12) |
| `Dockerfile`, `LICENSE-APACHE-2.0` | The image; the license of the files ported from Anil-matcha/open-duet |

## Data (`FREEDUET_DATA_DIR`, default `/data`)

| Path | What |
|---|---|
| `handoff/<botId>/<threadId>/` | Checkpoints: immutable JSON history and a readable `HANDOFF.md` |
| `team-log.jsonl` | One line per segment: time, member, thread, run, outcome, summary, `from_iris`, approvals. Rotated at 10 MB |
| `lessons/<member>.json` | Lessons, pending until the person replies `approve <code>` to Iris (rule in `freeduet/lessons.py`) |

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
