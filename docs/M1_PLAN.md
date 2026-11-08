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
| D3 | The member is identified by `forwardedProps.openbotBotId`, cross-checked with `messages[0].id == "standing-role:<id>"` | Neither URL nor body carries an agent id |
| D4 | **Tools stay in-band.** OpenBot's offered tools (`RunAgentInput.tools`) become the MCP server's tools. When the CLI calls one, agent-freeduet emits `TOOL_CALL_START/ARGS/END`, then `RUN_FINISHED`, and stops the CLI. OpenBot executes the call with its own approval gate and POSTs again with the result | This is the only path where approvals can pause and resume (`toolkit/src/headless-tools.ts`). The callback route can never wait for an approval and refuses instead (`server/src/approvals/types.ts:308-317`) |
| D5 | Only names in `forwardedProps.openbotDeploymentTools` (`message_bot`, `ask_person`) go to `POST /api/agent-tools/call` with `AGENT_TOOL_TOKEN` and `forwardedProps.openbotRun`; their result goes straight back to the CLI | That route exists for them (`server/src/app.ts:1842`) |
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
| Modules | `freeduet/app.py` (routes), `freeduet/agui.py` (RunAgentInput parsing, event encoding, keepalive), `freeduet/members.py` (agents.yaml by id), `freeduet/transcript.py` (messages to prompt), `freeduet/claude_cli.py` (command, process, stream-json parsing), `freeduet/bridge/` (stdio MCP server + loopback IPC with the parent), `freeduet/engines.py` (load, validate, order, caps), `freeduet/aux.py` (`/v1/messages`, purpose routing), `freeduet/assistants.py` (OpenAI-compatible free engine), `freeduet/checkpoints.py` (AI Continuity port) |
| Ported code | From Anil-matcha/open-duet (Apache-2.0) and AI Continuity (MIT): keep the license header, name the original file, say "Modified for FreeDuet" |
| Tests that must exist | fake `claude` executable that replays stream-json fixtures and calls MCP tools; a full segment loop (text, tool call, `RUN_FINISHED`, resume with result); deployment-tool callback; keepalive; auth refusals; logins-first ordering (metered never first, never with caps 0); credential directory never opened (M1.8); purpose routing per marker; checkpoint written per segment |

## 4. Work split

| Stream | Issues | Owns |
|---|---|---|
| A. Member runtime | #10, #11, #12, #13 | `app.py`, `agui.py`, `members.py`, `transcript.py`, `claude_cli.py`, `bridge/`, Dockerfile |
| B. Engines and server calls | #15, #16, #17 | `engines.py`, `aux.py`, `assistants.py`, credential-directory test |
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

Tests that must exist: a seeded grant lets Iris address Penny and refuses Penny to Otto; the team log gets one line per segment with the right outcome; `team_log` is offered to Iris only; a lesson stays pending without the person's approval and a Bot's message does not activate it; an active lesson appears in the member's prompt; each person gets the daily review routine once, and not again after they delete it.
