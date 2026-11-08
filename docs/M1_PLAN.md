# M1 technical plan: the team on your login

How M1 (issues #10 to #21 and #24) is built. Written from a map of OpenBot's remote-agent protocol made on 2026-11-08; file references are to `openbot/`. Read with [ARCHITECTURE.md](ARCHITECTURE.md) §3 and [PROVIDERS.md](PROVIDERS.md).

## 1. Shape

```
OpenBot server ──AG-UI POST /──────────────► agent-freeduet (Python, port 4230, one service for all ten members)
   ▲   (tools in RunAgentInput.tools,              │  reads the member's prompt from agents.yaml by forwardedProps.openbotBotId
   │    member id in forwardedProps)               │  runs: claude -p (official CLI, the person's own login, no built-in tools)
   │                                               │        └─ MCP server "freeduet" (stdio) = the tools OpenBot offered
   │◄── TOOL_CALL_* + RUN_FINISHED ────────────────┘  a tool call ends the segment; OpenBot runs it (grants, policy, approval gate, audit)
   └── next POST with the tool result ─────────────►  a fresh, stateless claude -p continues from the full transcript

OpenBot server ──Anthropic POST /v1/messages─► agent-freeduet: the server's own short model calls (titles, routing, tool selection,
                 (ANTHROPIC_BASE_URL)              auto-review, triage, voice summary), text only, routed by purpose
```

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Members are `remote-ag-ui` agents whose endpoint is exactly `MANAGED_AGENT_AG_UI_URL` (`http://localhost:4230/`) | Only that URL gets `x-openbot-agent-token` (`server/src/agents/managed-endpoint.ts`); one endpoint may serve many agent ids |
| D2 | `agents.yaml`: `type: ${FREEDUET_MEMBER_TYPE:-remote-ag-ui}`, `endpoint: ${MANAGED_AGENT_AG_UI_URL:-}`, and `system_prompt` kept | `FREEDUET_ROUTER=off` is `FREEDUET_MEMBER_TYPE=built-in` (precedent: `examples/fintech/agents.yaml`). The prompt stays in one file; agent-freeduet reads it by id |
| D3 | The member is identified by `forwardedProps.openbotBotId` alone, and a run without it is refused. This Bot's standing role (`standing-role:<id>`) is accepted wherever it is in `messages`; its prompt is the `agents.yaml` row, else that role. A standing role or holdings row naming another Bot (`standing-role:<other>`, `granted-tools:<other>`) never joins the system prompt: it is quoted as context at the top of the conversation | Neither URL nor body carries an agent id. The bot id is set by OpenBot's own middleware (`copilot.ts`, runWith) and reaches agent-freeduet only over the token-checked managed endpoint. The role is not always first: on a hop, middleware inside the one that adds it puts `openbot:personal-memory` and `openduet:channel` in front, and since #33 a browser chat's clone carries them too (`toolkit/src/copilotkit/agents.ts`); each is said once. The old `messages[0]` check refused every hop (fixtures `agent-freeduet/tests/fixtures/handoff_*_run.json`, recorded by `server/tests/freeduet-handoff.test.ts`) |
| D4 | **Tools stay in-band.** OpenBot's offered tools (`RunAgentInput.tools`) become the MCP server's tools. When the CLI calls one, agent-freeduet emits `TOOL_CALL_START/ARGS/END`, then `RUN_FINISHED`, and stops the CLI. OpenBot executes the call with its own approval gate and POSTs again with the result | This is the only path where approvals can pause and resume (`toolkit/src/headless-tools.ts`). The callback route can never wait for an approval and refuses instead (`server/src/approvals/types.ts:308-317`) |
| D5 | Only names in `forwardedProps.openbotDeploymentTools` go to `POST /api/agent-tools/call` with `AGENT_TOOL_TOKEN` and `forwardedProps.openbotRun`; their result goes straight back to the CLI. For FreeDuet's own members that list is `ask_person` only: the server runs their `message_bot` in-band like any other tool (`server/src/freeduet/coordination.ts`). If the callback refuses a hand-off only because the person has to be asked, agent-freeduet ends the segment and asks the person for that hand-off (who and what) in the conversation | That route exists for them (`server/src/app.ts:1842`), but it can never ask the person: an `ask` from the approval gate there is refused, and with auto-review on (OpenBot's default) the reviewer is shown no request at all, because the route carries no conversation. Iris's hand-off to Penny was refused that way. In-band, the gate reads the conversation and a pending approval suspends the run (D4) |
| D6 | **Stateless segments.** Every POST starts a new `claude -p --no-session-persistence` with the member prompt and the whole conversation rendered from `messages` (system rows, user, assistant, tool calls and results). No CLI session is resumed | Approval resumes arrive as a new run after the CLI is gone, restarts lose nothing, and segments are uniform. Costs more tokens per turn; optimise in M3 with continuity checkpoints |
| D7 | CLI lockdown, verified against the installed CLI's `--help`: `-p --output-format stream-json --verbose --include-partial-messages --no-session-persistence --tools "" --strict-mcp-config --mcp-config <freeduet only> --disable-slash-commands`, MCP tools pre-allowed (`--allowedTools mcp__freeduet`), `--append-system-prompt` for the member prompt and OpenBot's system rows; the conversation on stdin | No file, shell or web access except through OpenBot's gateway; no other MCP server; no permission prompts in a headless CLI (approvals are OpenBot's) |
| D8 | An SSE comment (`: keepalive`) every 15 s while the CLI works | OpenBot ends a turn after 60 s of silence (`AGENT_STALL_TIMEOUT_MS`) |
| D9 | The CLI's sign-in lives in a named volume mounted as the CLI's config directory. The person signs in once with `docker compose exec -it agent-freeduet claude`. **No FreeDuet code reads that directory** (test M1.8) | PROVIDERS.md rule 1 |
| D10 | Server-side model calls: `BOT_PROVIDER=anthropic`, `ANTHROPIC_BASE_URL=http://localhost:4230`, `ANTHROPIC_API_KEY=$FREEDUET_LOCAL_KEY` (a random key start.sh writes; agent-freeduet requires it in `x-api-key`). agent-freeduet's `POST /v1/messages` answers text-only requests and routes by purpose: auto-review (`approvals/policy.ts`) on a tier A engine; titles, routing, tool selection, triage and voice summaries on the free assistants chain, falling back to Claude Code. Purpose is recognised from each caller's fixed prompt markers, with a test per marker | Zero changes to the server's call sites; the server needs no real API key (docs/SERVER_MODEL_CALLS.md) |
| D11 | Engines: `engines.yaml` loaded and validated; the chain is always ordered subscription, then free, then metered; metered never runs while `metered.enabled` is false or a cap is 0. M1 implements the `claude-code` engine and the `openai-compatible` engine for free assistants (Ollama); the others are declared and refuse clearly | M1.7 |
| D12 | Not signed in, or a subscription limit: `RUN_ERROR` with code `OPENBOT_MODEL_AUTH_REQUIRED` for sign-in, and a plain message for limits | OpenBot records the first as a sign-in failure |
| D13 | Work reports and checkpoints (M1.13): after each segment agent-freeduet saves a checkpoint with AI Continuity's writer (MIT, attributed) under `/data/handoff/<botId>/<threadId>/` in its own volume | The member computers are other containers; one place to read on an engine switch |

## 3. Interface contract (fixed, so work can run in parallel)

| Item | Value |
|---|---|
| Package | `openbot/agent-freeduet/`, Python 3.12, FastAPI + uvicorn, deps pinned in `requirements.txt`, tests in `tests/` with pytest |
| Port | 4230, published on `127.0.0.1` and `[::1]` only |
| Routes | `GET /health`; `POST /` (AG-UI, SSE); `POST /v1/messages` (Anthropic format, text only, non-streaming) |
| Auth | `x-openbot-agent-token == MANAGED_AGENT_TOKEN` on `POST /`; `x-api-key == FREEDUET_LOCAL_KEY` on `/v1/messages`; `hmac.compare_digest` |
| Env | `MANAGED_AGENT_TOKEN`, `AGENT_TOOL_TOKEN`, `OPENBOT_TOOL_URL` (default `http://host.docker.internal:3001/api/agent-tools/call`), `FREEDUET_LOCAL_KEY`, `FREEDUET_AGENTS_FILE` (default `/app/tenant/agents.yaml`), `FREEDUET_ENGINES_FILE` (default `/app/engines.yaml`, falling back to `engines.example.yaml`), `FREEDUET_DATA_DIR` (default `/data`), `CLAUDE_BIN` (default `claude`) |
| Modules | `freeduet/app.py` (routes), `freeduet/agui.py` (RunAgentInput parsing, event encoding, keepalive), `freeduet/members.py` (agents.yaml by id), `freeduet/transcript.py` (messages to prompt), `freeduet/claude_cli.py` (command, process, stream-json parsing), `freeduet/bridge/` (stdio MCP server + loopback IPC with the parent), `freeduet/engines.py` (load, validate, order, caps), `freeduet/server_calls.py` (`/v1/messages`, purpose routing; not `aux.py`, a reserved file name on Windows), `freeduet/assistants.py` (OpenAI-compatible free engine), `freeduet/checkpoints.py` (AI Continuity port) |
| Ported code | From Anil-matcha/open-duet (Apache-2.0) and AI Continuity (MIT): keep the license header, name the original file, say "Modified for FreeDuet" |
| Tests that must exist | fake `claude` executable that replays stream-json fixtures and calls MCP tools; a full segment loop (text, tool call, `RUN_FINISHED`, resume with result); deployment-tool callback; keepalive; auth refusals; logins-first ordering (metered never first, never with caps 0); credential directory never opened (M1.8); purpose routing per marker; checkpoint written per segment |

## 4. Work split

| Stream | Issues | Owns |
|---|---|---|
| A. Member runtime | #10, #11, #12, #13 | `app.py`, `agui.py`, `members.py`, `transcript.py`, `claude_cli.py`, `bridge/`, Dockerfile |
| B. Engines and server calls | #15, #16, #17 | `engines.py`, `server_calls.py`, `assistants.py`, credential-directory test |
| C. Wiring | #14 | `docker-compose.yml` service, `scripts/start.sh` (start, health-wait, `FREEDUET_LOCAL_KEY`), `.env.example`, `agents.yaml` interpolation, `server/tests/freeduet-package.test.ts`, README quick start, `docs/UPSTREAM_TOUCHES.md` |
| D. Evals | #18 | `evals/team/run.ts` (or Python) and its fake-engine mode |
| E. Checkpoints | #24 | `checkpoints.py` |
| Maintainer | #19, #20, #21 | Real-login eval run, Google Workspace grants, clean-machine start |

## 5. Team memory, handoff and oversight (M1.14 to M1.16)

Added on 2026-11-08 at the maintainer's request: members must remember, pass information to each other, and Iris must know every success and failure and correct what needs correcting. Checked against the code first:

| Need | Already in OpenBot | Missing |
|---|---|---|
| Memory of the person | `server/src/memory/` personal memories; a memory a Bot formed is delivered only to that Bot (`db/schema/memory.ts`) | Nothing for M1 |
| Memory of the work | Checkpoints (M1.13, D13) | Nobody reads them back until M3 |
| Memory of the team (what one member learned that others need) | None | Lessons (D16) |
| Passing work and information | `message_bot` with a typed envelope (task, constraints, expecting) and the answer relayed back to the asker, failures included (`agents/handoff*.ts`); caps `BOT_HANDOFF_MAX_DEPTH=1`, `BOT_HANDOFF_MAX_PER_RUN=3` | No Bot-to-Bot grant exists for FreeDuet: `mayAddress` reads `plugin_grants` of kind `bot` (`index.ts:1135`) and the package seeds only skill grants, so today Iris can address nobody |
| Iris knows successes and failures | Report lines and Iris's rules (F24) | Iris sees a report only when she asked for the work. A member that fails in its own conversation with the person is invisible to her |
| Correctives that last | None | Lessons (D16) and a daily review (D17) |

| # | Decision | Why |
|---|---|---|
| D14 | **Hub grants.** A FreeDuet module seeds `plugin_grants` of kind `bot` after package sync: Iris to each of the nine members, each member to Iris, nothing member to member. Marked `granted_by = freeduet-package`, idempotent, removing only its own rows. Depth stays 1 | Iris hands out work and gets the answer back by relay; a member the person talks to directly can report to Iris; no chains. An admin can still add or revoke grants by hand |
| D15 | **Team log.** After each segment agent-freeduet appends one line to `/data/team-log.jsonl`: time, member, thread, outcome, one-line summary, whether Iris asked for it, approval ids from the "Already" line. Iris gets one read-only tool `team_log(since, member?, outcome?)` from agent-freeduet's own MCP server, next to OpenBot's tools. Shared rule: when Iris did not ask for the work and the outcome is failed, blocked or needs you, the member also sends its report to Iris with `message_bot` | Iris sees every outcome, also of work she did not hand out. The tool reads FreeDuet's own data only, never the person's apps |
| D16 | **Lessons.** Iris may propose a lesson for a member ("Penny: check the VAT number before drafting an invoice"), with the evidence. A lesson is stored `pending` in `/data/lessons/<member>.json` and becomes `active` only after the person approves it in chat; a Bot's message never approves one. agent-freeduet adds that member's active lessons to its prompt on every run. The person can list, change and remove lessons by asking Iris. A failure with the same cause twice in seven days makes Iris ask Leo for a proposal to change the member's prompt or skills; applying it stays with the person | Corrections that last, never silent: a permanent change in behaviour is the person's decision |
| D17 | **Daily review.** A routine for Iris, every morning (packages cannot declare routines, so the FreeDuet module of #25 creates it once per person, through `routines/store.ts`, and the person can change or stop it): read `team_log` for the last 24 hours, give the person one summary (done, failed with cause, pending lessons to approve, what she already corrected) | One place to see the team's day |
| D18 | **Report guard.** When a segment ends a turn that did work (a tool call in the turn, an attached file, or a message that is neither just a greeting nor ends with a question: the shared no-report rule) and its text has no report, agent-freeduet runs one more `claude -p` with no tools at all, the conversation so far and a fixed instruction to write only the six lines from what the conversation shows; a complete report is streamed as the end of the same message, anything else adds nothing. Once per turn; the team log's `report_guard` says it asked (`agent-freeduet/freeduet/report_guard.py`) | Live runs (#19) still ended two or three work turns a run without a report (iris-3, otto-1, vera-5), and a missing report hides that work from Iris and the checkpoint |
| D19 | **Exact reasons for a missing tool.** When a member's prompt relies on `message_bot` and OpenBot did not offer it, agent-freeduet adds the exact reason it can see to the system text: a relay or a hop runs at OpenBot's hand-off depth limit (`BOT_HANDOFF_MAX_DEPTH=1`), so the next step goes out on the person's next message; otherwise OpenBot gave no reason. Every member is told to give the reason a refused tool result gives, never "unavailable" alone (`tool_notes.py`, `transcript.RUNTIME_NOTE`) | iris-2: in the relay of Jules's answer (depth 1, no `message_bot`) Iris told the person the messaging tool was unavailable and wrote a brief to paste |

Tests that must exist: a seeded grant lets Iris address Penny and refuses Penny to Otto; the team log gets one line per segment with the right outcome; `team_log` is offered to Iris only; a lesson stays pending without the person's approval and a Bot's message does not activate it; an active lesson appears in the member's prompt; each person gets the daily review routine once, and not again after they delete it. Hand-offs (`server/tests/freeduet-handoff.test.ts`, `agent-freeduet/tests/test_handoffs.py`): a hop to a member and the relay back to Iris replay OpenBot's recorded payloads and run; the member's answer reaches Iris's conversation; Iris's `message_bot` runs in-band, the gate reads what the person asked, and an `ask` waits for the person and sends the hand-off once on approval; a callback refusal that needs the person ends the turn with a question to them.

## 6. Conversations and memory without CopilotKit Intelligence (#42)

Added on 2026-11-08 at the maintainer's request. Before #42, OpenBot refused to start without the three `INTELLIGENCE_*` settings (`openbot/server/src/config.ts`), so every FreeDuet install needed a CopilotKit account.

| # | Decision | Why |
|---|---|---|
| D20 | **CopilotKit Intelligence optional, off by default.** `FREEDUET_INTELLIGENCE=off` or `on`. Unset is upstream OpenBot, unchanged. With `off` the server boots with no `INTELLIGENCE_*` key, keeps conversations, history and memory in FreeDuet's own Postgres, and sends nothing to CopilotKit. Telemetry is off unless `COPILOTKIT_TELEMETRY_DISABLED=false` is set. With `on` the server needs the three keys, as upstream | FreeDuet promises self-hosted, zero cost and no API key. Intelligence keeps its own copy of every thread, user memory, browser trajectory and product analytics. Its free hosted tier (1,000 interactions per organization per month) would stop a real user quickly. CopilotKit's docs say the TypeScript runtime works without Intelligence; OpenBot made it mandatory |

How the default is chosen: `scripts/start.sh` writes `off` into a new `.env`. An existing `.env` with all three Intelligence settings and no `FREEDUET_INTELLIGENCE` line gets `on`, with a notice printed, so an install from before #42 keeps its conversations in Intelligence.

Measured in #45: with `off` and no telemetry variable, a boot, a chat turn, a headless turn, a hop and memory create and recall sent zero requests to any `*.copilotkit.ai` host. With `COPILOTKIT_TELEMETRY_DISABLED=false` the same probe does see telemetry, so the probe can see requests at all.

FreeDuet's own migrations live in `openbot/server/src/freeduet/threads/migrations/`, with their own journal and bookkeeping table, `freeduet_thread_migrations`. They are recorded by name and hash, run in one transaction behind an advisory lock, and are safe when two processes boot at once. An applied migration whose file has changed is refused.

| Table | Holds |
|---|---|
| `freeduet_threads` | One row per conversation: thread id, user, agent, name, times |
| `freeduet_thread_runs` | One row per run: run id, parent run, status (`running`, `finished`, `stopped`, `failed`, `interrupted`), the run's events compacted as `jsonb`, what the run was asked, and the runner that wrote it |
| `freeduet_thread_locks` | One row per thread while a run holds it: run id, user, agent, expiry. An expired lock is taken over |

Messages are not stored in a table of their own. They are rebuilt from the runs' events with AG-UI's own reducer.

Limits with `off`:

- Conversations already in Intelligence are not imported. An importer is a possible later phase.
- Switching from `off` to `on` starts fresh. Neither side copies the other's conversations.
- Memory is local. Recall is a text match, not a semantic search.
- Learned skills are off.
- Live tail (following a run that is still going, after a reload or from another tab) works in one server process only. FreeDuet supports one replica.
- A server restart in the middle of a run marks that run `interrupted` and keeps the text it had written.
- Keys and Learning variables left in `.env` are ignored, and the boot log names them once.
