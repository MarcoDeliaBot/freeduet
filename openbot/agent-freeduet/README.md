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
| `freeduet/compatible_engine.py` | The `anthropic-compatible` engine, off by default: the same locked-down CLI on an Anthropic-compatible address and the person's own key at it (see "A gateway or a local router" below) |
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

## A gateway or a local router (`anthropic-compatible`, off by default)

A second kind of engine runs the same locked-down `claude -p` against an Anthropic-compatible address you write in
`engines.yaml`: a gateway such as OpenRouter, or a free router on your own computer. It lets a member carry on when the
Claude plan is at its limit. **It has never answered a real turn from a real gateway.** Every test here uses the fake
CLI, so it is not certified; [docs/ENGINES_PLAN.md](../../docs/ENGINES_PLAN.md) 9.1 says what is and is not verified.

- **Off, and never first.** `engines.example.yaml` holds only commented-out entries, so a default install builds none and
  nothing changes. An entry runs only when it is `enabled: true` and named in a chain; logins always come before it.
- **Your key, out of sight.** `credential_secret_ref` is `env:NAME` or `file:/absolute/path`, never the key itself (a
  pasted key is refused and not echoed). The CLI gets the key as a bearer token, in an empty home and an empty config
  directory made for the turn, so the Claude login cannot be sent to the gateway and the gateway key cannot reach the
  Claude engine. The tool bridge never sees it, and it is removed from everything the service reads back. With no usable
  key the CLI is not started at all: an address alone would keep the Claude login and send it there.
- **A sign-in is never taken for a key.** A key file is not opened when it lies in a folder whose name starts with a dot
  or in the service's own `CLAUDE_CONFIG_DIR`, which is where a sign-in is kept. What is read must look like a bearer
  token (letters, digits and `- . _ ~ + /`, then `=`; 8 to 512 characters), so a sign-in file, which is JSON, is
  refused, and so is any value that holds a Claude plan token.
- **Free or paid, said by you.** `billing: free` or `billing: metered` is required and never guessed. A metered gateway
  runs only when the `metered:` block is `enabled: true` with both caps above 0. Those caps are not enforced until the
  usage ledger exists (slice 12 of the plan), and the log says so when the service starts and on every such turn.
  Otherwise it is left out and, when nothing else can answer, the person is told why.
- **Addresses.** Plain `http` only for this machine: `localhost`, a loopback address or `host.docker.internal`. Every
  other address must be `https`. Inside the container `localhost` is the container itself: use `host.docker.internal`
  for a router on your computer, and let the router listen on an address the container can reach.
- **Same lockdown.** The same flags, the same `freeduet` bridge and the same approvals. A call to a built-in tool gets
  "No such tool available" from the CLI, as on the Claude engine.
- **Probe.** `claude --version` and "a key is present". It does not call the gateway, so it cannot tell a refused key
  from a good one: the first turn finds out, and a refused key is tried again at most once a minute.
- **Failures** are read from the CLI's own output and the HTTP status it reports. 401 is a refused key (the engine is
  signed out and the person is asked to check the key); 402 is out of credits; 429 a rate limit; 5xx or an unreachable
  address is transient; 400 and 404 are a rejected request and change nothing; 403 and anything else stay `unknown`.
- **Quality.** `tier` is C unless the entry says otherwise, so the quality floor keeps a skill that needs a better model
  (a purchase) off it. A model counts as supported only for the pair (endpoint, model) that passed the team evals.

Check it once with your own key. Nothing here is automated, and steps 1 to 3 spend nothing.

1. In `openbot/`, copy `agent-freeduet/engines.example.yaml` to `engines.local.yaml`. Uncomment `my-gateway`, set
   `base_url`, `billing` and `model`, set `enabled: true`, and put `my-gateway` after `claude-code` in `chains: default`.
   For a `metered` gateway also set `metered: {enabled: true, currency: EUR, daily_cap: 1, monthly_cap: 5}`. To make
   Iris use only the gateway for the check, add `switching: {freeduet: {pin: my-gateway}}`.
2. Create `docker-compose.override.yml` beside `docker-compose.yml` (the start script runs plain `docker compose`, which
   reads it). The key goes in neither file:

   ```yaml
   services:
     agent-freeduet:
       environment:
         FREEDUET_ENGINES_FILE: /app/engines.local.yaml
         MY_GATEWAY_KEY: ${MY_GATEWAY_KEY}
       volumes:
         - ./engines.local.yaml:/app/engines.local.yaml:ro
   ```

3. Run `export MY_GATEWAY_KEY=...` (your own key at the gateway), then `docker compose up -d agent-freeduet`, then
   `curl -s -H "x-openbot-agent-token: <MANAGED_AGENT_TOKEN from .env>" http://127.0.0.1:4230/engines`. Expected: a row
   with `"id": "my-gateway"`, `"kind": "anthropic-compatible"` and `"state": "ready"`, and neither the key nor the
   address anywhere in the output (the same command piped to `grep -c "$MY_GATEWAY_KEY"` prints `0`).
4. Send Iris one short message that needs no tool ("Reply with one word."). Expected: an answer, and the usage shows at
   the gateway, not on your Claude plan.
5. Ask her to run a shell command that writes a file. Expected: she cannot, and no file appears
   (`docker compose exec agent-freeduet ls <the path>` fails). If the model tried a built-in tool, the log has a line
   with `answered "No such tool available"`.
6. Put a wrong key in `MY_GATEWAY_KEY`, run `docker compose up -d agent-freeduet` again and send a message. Expected:
   "my-gateway did not accept its key. Check the key that `credential_secret_ref` names in engines.yaml, then send your
   message again.", and `/engines` shows `"state": "signed_out"` for it.

Before it is called certified, run the team evals on the eval stack (never on a real deployment) with the members on
the gateway: every case in `evals/team/cases.yaml` with `--repeat 3`, each member at least 90% and every safety case at
100% ([evals/team/README.md](../../evals/team/README.md)). The runner's `--engine` flag only labels the report today, so
pin the gateway in the eval stack's engines file (`switching: {default: {pin: my-gateway}}`) until the runner selects
the engine itself (slice 4).

## Signing in (done by the person, never by FreeDuet)

```bash
docker compose exec -it agent-freeduet claude          # Anthropic's own sign-in flow, with your own Claude plan
```

Other engines (Codex, ACP, API keys) are declared in `engines.example.yaml` and arrive in M2 and M3.
