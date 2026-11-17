# Architecture

FreeDuet is a **thin fork** of OpenDuet, which itself is OpenBot plus one tenant folder. The rule: change upstream code only where there is no extension point, and send generic fixes back upstream.

```
                   ┌─────────────────────────── web · phone · Slack · Teams ───────────────────────────┐
                   ▼                                                                                    │
 ┌──────────────────────────────── OpenBot server (Hono + CopilotKit runtime) ────────────────────────────────┐
 │  OpenDuet layer (unchanged): brief · triage · tasks · pages · channels · replies                          │
 │  FreeDuet layer (new, server/src/freeduet/):                                                                │
 │     built: engines API · partly built: spend ledger · planned: delegate, request_purchase, caps, savings API  │
 │  Gateway (unchanged): resolve target → policy (CEL, fail closed) → audit row → act, or refuse with the rule   │
 └──────────────┬──────────────────────────────────────────────┬────────────────────────────────────────────┘
                │ AG-UI                                          │ every tool call
                ▼                                                ▼
 ┌──────────── agent-freeduet (Python, new) ─────────────┐    ┌──────── a computer per member ────────┐
 │  prompt source: examples/freeduet/agents.yaml          │    │  Chromium · /workspace · shell        │
 │  engine chain per member (engines.yaml)                │    │  built by OpenBot's supervisor         │
 │  built: Claude Code CLI, anthropic-compatible           │    │  take-the-wheel on logins and codes    │
 │  planned: Codex, ACP, Anthropic API, OpenAI-compatible  │    └────────────────────────────────────────┘
 │  tool bridge: an MCP server that exposes only the      │
 │  member's granted OpenBot tools, through the gateway   │
 │  limit detection · fallback · usage reporting          │
 └────────────────────────────────────────────────────────┘

 PostgreSQL + pgvector: policy, approvals, audit, credentials; FreeDuet usage table and purchase permits (planned)
 CopilotKit Intelligence, optional and off by default: it holds threads and memory only when FREEDUET_INTELLIGENCE=on
```

## 1. What is reused unchanged

| Piece | From | Notes |
|---|---|---|
| Server, app, worker, routines | OpenBot | Routines give the morning brief and scheduled checks. |
| A computer per member | OpenBot supervisor + agent-computer | Each member gets its own container with Chromium, a `/workspace` volume and a browser profile. |
| Gateway, approvals, audit | OpenBot | Every action a member takes is decided against policy before it runs. Sending asks the person (Refuse, Allow once, Always allow), except a new email whose every recipient the person typed in their own live message: that one goes out with no card (D27). Signing and deleting ask the person with the same choices. Paying is handed to the person by a built-in rule (they do it and mark it done), so its card offers no Always allow. |
| Secrets | OpenBot | Logins go through a masked box; stored credentials are encrypted and write-only. |
| Brief, triage, tasks, pages, channels | OpenDuet | Used by Iris and by every member. |
| Connectors | OpenBot catalogue + Composio | Google Workspace, Drive, Notion and more, granted per member by an administrator. |

## 2. FreeDuet server additions (TypeScript, `openbot/server/src/freeduet/`)

### 2.1 `delegate` tool (planned, milestone M3, v0.3)

Planned, not built. Today a member hands work to another one with OpenBot's hand-off tool (`message_bot`), pre-approved along the hub grants (D21, `openbot/server/src/freeduet/hub-handoffs.ts`). The pieces, the inbox, the single resume and the `NEEDS INPUT` line below do not exist yet.

Held by Iris only. Input: up to six pieces, each `{ member, brief, attachments[] }`. Behaviour, ported from the team design of Anil-matcha/open-duet:

1. Each piece starts a task conversation with the target member, using OpenDuet's task machinery, framed as "work handed to you by Iris".
2. The call returns receipts at once; Iris ends her turn.
3. Results, each one a member's report (§2.5), land in an inbox. When every awaited result is in, or a member asks the person a question, Iris is resumed **once**, in a new turn of the same conversation, with the results quoted as data.
4. A member that needs the person ends with a last line `NEEDS INPUT: <question>`; the person answers in that member's conversation and the piece runs again.
5. Results never approve anything. A stalled or failed piece comes back to Iris as a result with outcome `stalled` or `failed`.

Acceptance: a three-piece request returns one combined answer; a stopped Iris stops her pieces; no piece runs twice after a restart.

### 2.2 `request_purchase` tool and purchase permits (planned, milestone M4, v0.4)

Planned, not built. Today the built-in safety rule for payments (`openbot/server/src/approvals/policy.ts`) hands a payment to the person as a hand-off, unless the person has turned on Full access, which lifts that requirement (`openbot/server/src/freeduet/full-access.ts`). A hand-off card reads "Handed to you" and offers no Always allow (`openbot/app/src/components/approvals/approval-card.tsx`). The design below would ask with a card instead. Changing the rule is a decision for the maintainer; this document does not make it.

Held by Jules. Input: `{ merchant_host, items[{name, variant, qty, price}], fees, total, currency, cancellation_terms, payment_method_label }`.

1. The server checks the caps: per purchase, per day and per month, per member and overall (settings, default €0, meaning "set a cap before Jules can buy").
2. If within the caps, it opens an approval card that shows the full review. Only **Allow once** and **Refuse**: purchases never offer "Always allow".
3. On approval it mints a **permit**: single-use, valid 10 minutes, bound to the member, the merchant host and the total.
4. A gateway policy rule refuses clicks and key presses that would complete a checkout on `merchant_host` (button text or accessible name matching pay, buy, place order, confirm booking, and the equivalents in the configured languages) unless a valid permit exists. The permit is spent on use.
5. The ledger records the approved total; the person can mark the real charged amount later.

Acceptance: without a permit the final click is refused and the refusal names the rule; a permit for €40 does not allow a €45 total; a permit expires after 10 minutes; a CAPTCHA or code hands control to the person.

### 2.3 Usage ledger and savings meter (partly built, milestone M3, v0.3)

Built: `openbot/agent-freeduet/freeduet/ledger.py` keeps the spend file, `engine-ledger.json`, in the data directory (`FREEDUET_DATA_DIR`, unless `FREEDUET_ENGINE_LEDGER_FILE` names another file). It holds the daily and monthly totals, the verdict on the caps and the last turns, for the metered engines the person put under `metered.enforce: ledger`. It records only what an engine reports: tokens, and a cost only when the engine states one. Free engines and logins are never recorded. No metered engine runs today, because the lock in front of paid endpoints is closed (`PAID_GATEWAYS_OPEN` in `engines.py` is false), so no turn is recorded yet.

Planned, not built: table `freeduet_usage`: member, engine, model, input, output and cached tokens, started and finished time, `metered_cost`, `api_equivalent_cost`, and `source` (`reported` when the engine reported tokens, `estimated` otherwise).

`api_equivalent_cost` uses `prices.yaml`, maintained by the person and dated; The design never guesses a price. No code reads `prices.yaml` yet: only `prices.example.yaml` ships. The planned savings card shows, for the current month: API-equivalent value of the work, what was actually paid (subscriptions prorated by the person's own monthly fees, plus metered usage), and the difference, labelled "estimate".

### 2.4 Engines API (built)

`GET /api/freeduet/engines` returns, per engine: installed, signed in, available, limited until, last error. The app's Engines page shows it, with the provider's own sign-in instructions; FreeDuet never performs the sign-in.

### 2.5 Work reports and checkpoints (built, milestone M1)

Every member ends a piece of work with the report its prompt defines (shared rules in `agents.yaml`), and keeps the same facts as a checkpoint, using the checkpoint writer of [AI Continuity](https://github.com/MarcoDeliaBot/ai-continuity) (MIT, by the maintainer), ported with attribution.

| Report line | Checkpoint field | Rule |
|---|---|---|
| Outcome: done, partly done, in progress, blocked, failed, needs you | `phase`: complete (done), in-progress (partly done, in progress), blocked (blocked, failed, needs you) | "Done" needs evidence and no open next step. "In progress" is work handed to a colleague or still running, with nothing for the person to do yet; the team log records it as "in progress", like a segment that ended without a report |
| Done | `completed` | |
| Evidence | `verification` | Files, links, numbers or the tool's confirmation; never the member's word alone |
| Not done and why, with what was tried | `blockers`, failed attempts in `decisions` | Failures are recorded, never hidden |
| Already sent, paid, booked, published or deleted | `completed`, with the approval id | Read before any retry, so nothing happens twice |
| Next step | `next_steps` | |

- **Where.** Built under `<FREEDUET_DATA_DIR>/handoff/<botId>/<threadId>/` on the agent service's data volume (`/data` in the image): immutable JSON history plus a readable `HANDOFF.md`. Decision D13 in `docs/M1_PLAN.md` chose this over the member's own computer, which the first design named (`/workspace/.ai/handoff/<task id>/`). Nothing goes into a second database.
- **When.** Designed: before the first change, before a long or risky step (with phase `planned`), after each coherent block, after a failure, and before the member answers or waits. Built: after every segment (a finished turn, a turn that ended on a tool call OpenBot runs, or an error) the checkpoint is written, or logged as not written (`openbot/agent-freeduet/freeduet/app.py`). The other saves are planned.
- **Who reads it.** Iris (as the result of a delegated piece, §2.1), the router on an engine switch (§3.3, M3), and the person on the task's page. All three are planned: `latest_checkpoint()` is built, but only the tests call it.
- **Limits.** Before a save, every string is redacted by pattern: values next to words such as password, secret or token, card-like numbers, JWTs and a few vendor key formats (`openbot/agent-freeduet/freeduet/checkpoints.py`). A secret in a form no pattern names is not caught. A report or a checkpoint never approves anything: approvals stay with the gateway.

## 3. `agent-freeduet`, the subscription router (Python, milestone M1 for Claude Code, built; M2 for the rest, planned)

An AG-UI service, alongside OpenBot's other `agent-*` services. Every team member becomes `type: remote-ag-ui` pointing at `agent-freeduet`, which reads the member's prompt from `agents.yaml` and its engine chain from `engines.yaml`.

### 3.1 Adapter contract

Ported from Anil-matcha/open-duet's `provider_adapter.py` (Apache-2.0):

| Field | Meaning |
|---|---|
| `key`, `label`, `kind` | Built: `cli` and `anthropic-compatible`. `engines.yaml` also accepts `app-server`, `acp`, `anthropic-api` and `openai-compatible` (`KINDS` in `engines.py`), which have no adapter yet (planned, M2) |
| `capabilities` | `tools`, `approvals`, `mcp`, `images`, `resume`, `computer`. The two built adapters declare only `tools`, `approvals` and `mcp` |
| `probe()` | installed, version, signed in; bounded to a few seconds, never logs account details |
| `run_turn(ctx, sink, gate)` | streams to a sink and returns an outcome. The built engines pass the parsed items of `stream_json.py` to the sink; the design's event names (`message`, `tool.started`, `tool.completed`, `usage`) are not event names in the code |
| `limit` | Planned as a field. Built as `Health.failure` on `Diagnostics.health` (`openbot/agent-freeduet/freeduet/engine_adapter.py`): the kind of limit (rate limit, usage limit or credits) and the reset time when the engine stated one |

Adapters:

| Adapter | Drives | Auth |
|---|---|---|
| `claude-code` (M1, built as `ClaudeEngine`) | the person's own `claude` CLI, stream-json both ways | the person's own login, done in a terminal |
| `codex` (planned, M2) | `codex app-server`, JSON-RPC over stdio | Codex's own official login, which FreeDuet never reads (planned, not built), or the person's own local login (experimental) |
| `acp` (planned, M2) | any agent CLI speaking the Agent Client Protocol | provider-dependent; off unless PROVIDERS.md says on |
| `anthropic-api` (planned, M2, off by default) | Messages API | API key, metered |
| `openai-compatible` (planned, M2; the server's own short calls have a minimal client for free engines of this kind, `assistants.py`) | `/chat/completions` (OpenRouter, GLM, Ollama, LM Studio, vLLM) | API key or none, metered or free |

Built now: `ClaudeEngine` (`openbot/agent-freeduet/freeduet/claude_engine.py`, kind `cli`) and `CompatibleEngine` (`openbot/agent-freeduet/freeduet/compatible_engine.py`, kind `anthropic-compatible`), which runs the same CLI against an endpoint the person names, with the person's own key or none. A paid endpoint is refused today (§3.3).

### 3.2 The tool bridge

CLI engines must never touch the host. Claude Code is started with no built-in tools and one MCP server only (`--tools ""`, `--strict-mcp-config`, `--mcp-config`, and `--permission-mode dontAsk`, which refuses rather than prompts, so approvals stay with OpenBot's gate), the pattern Anil-matcha/open-duet verified with a recent Claude Code. That MCP server, `freeduet` (the CLI sees its tools as `mcp__freeduet__<name>`), lists the tools its parent process gives it and sends each call to that parent, which runs the deployment tools through OpenBot's own route, `POST /api/agent-tools/call`, with the agent's own token in `x-openbot-agent-token`. Browser actions therefore run on the member's own computer, through the same policy, approval and audit path as every other OpenBot Bot. Planned: Codex would get the same server through its MCP configuration, with the approval policy set to ask.

Verify in M2 against `openbot/docs/architecture.md`: the exact callback route remote agents use for granted tools.

### 3.3 Engine chains and "never stops"

`engines.yaml` gives each member an ordered chain, for example `claude-code → codex → anthropic-api`. Rules, ported from Anil-matcha/open-duet's fallback design and extended to chains:

1. Move to the next engine **only** if the current one refused the turn **before accepting it**: no output, no tool call, no approval question. A limit hit after work started is never moved, because tools may already have run.
2. The next engine must cover what the turn needs: tools and approvals if the turn uses tools, images if there are images, MCP for the tool bridge. Planned: the router does not compare capabilities yet.
3. **Logins first.** The router orders every member's chain (its own in `engines.yaml`, or the default chain) as subscription engines, then free engines, then metered engines, whatever order the file lists them in. The assistant chain holds free engines only, and the server's own short calls try it first (section 3.5). Metered engines (API keys and API credits) join only if the person enabled them, only after every login engine was tried, and only while under the daily and monthly caps. Today no metered engine runs: `PAID_GATEWAYS_OPEN` is false in `engines.py`, `COST_REPORTING_KINDS` is empty, and `anthropic-api` and `openai-compatible` have no engine adapter. The rule applies once they do; this document gives no date for it.
4. Every switch is shown in the conversation: "Switched to Codex because Claude's weekly limit resets Thursday 09:00."
5. A limited engine is skipped until its reset time, or a minute when it named none.
6. The conversation keeps its main engine; the next message tries it again. Missing context is replayed from the stored transcript as quoted history.

### 3.4 Quality tier

Each engine has a tier, set in `engines.yaml` (A is the best). Built: `quality_floor` in `engines.yaml` sets a minimum tier per member for named skills or tools. The router prefers an engine that meets the floor, and uses the first available engine when none does. On an engine below the floor for a tool, that tool is left out of the turn and the person is told which tool and tier (`openbot/agent-freeduet/freeduet/engine_router.py`). The shipped example names `request_purchase` at tier A for Jules; that tool is planned for M4 (§2.2) and not built.

### 3.5 Assistants: light helpers on free models (the tool is planned, F22, milestone M3)

No member can call an assistant yet, because no assistant tool is built. The planned `ask_assistant` tool would let every member hand small, low-risk jobs to these light helpers, so subscription limits go to the work that matters. Product view: [CATALOG.md](CATALOG.md#assistants).

| Planned `ask_assistant` tool (M3, not built) | Design, and what is built now |
|---|---|
| Input | `{ task, input, instructions }`, where `task` is one of `summarise`, `extract`, `classify`, `translate`, `reformat`, `proofread`, `draft-variants`, `tag`; `input` is text or the text of attached files, within `max_input_tokens`. Built for the server's own calls: a free engine is skipped when the input is longer than `max_input_tokens` (`openbot/agent-freeduet/freeduet/server_calls.py`) |
| Engine | The `assistants.chain` in `engines.yaml`. Only engines with `billing: free` are accepted: local models and free model routes. Subscription and metered engines are rejected at load time. Built: that check, in `engines.py` |
| Powers | None: no tools, no MCP bridge, no browser, no memory, no network beyond the model call. Built: the server's own calls send no tool definitions (`openbot/agent-freeduet/freeduet/assistants.py`) |
| Output | Returned to the calling member as quoted data, never as instructions. The member checks it before using it; anything sent or published still goes through the approval gate |
| Limits | `max_calls_per_turn` (default 10), `max_input_tokens`, a per-call timeout, up to 4 calls in parallel. Built for the server's own calls: `max_input_tokens` and the per-call timeout. `max_calls_per_turn` is read and never counted, and there is no parallel limit |
| Fallback | If no free engine is available or a call fails, the tool says so and the member does the job itself |
| Ledger | Each call is recorded in `freeduet_usage` with `billing: free`, so the savings meter shows it. Not built: `freeduet_usage` does not exist, and `ledger.py` never records free engines |

The server's own short calls (titles, routing, tool selection, triage, voice summaries) try the free engines of `assistants.chain` first, then the person's subscription logins (the `plan` function in `openbot/agent-freeduet/freeduet/server_calls.py`). Auto-review and unknown calls never use an assistant: they take tier A engines only, and never one that serves as an assistant (`STRICT_PURPOSES` in the same file). The shipped defaults enable no free engine (`openbot/agent-freeduet/engines.example.yaml`), so with them those calls run on the subscription login.

Acceptance (M3): a member summarising ten emails through assistants uses no subscription turns for those summaries; an assistant fed a prompt-injection email returns text and cannot trigger any action; with assistants disabled, every member still completes its eval cases.

## 4. Data and privacy

- Data FreeDuet writes stays on the person's installation: in the person's PostgreSQL, in the member computers' volumes, and in the agent service's data volume (`FREEDUET_DATA_DIR`, `/data` in the image), which holds the engine state, the spend ledger, the team log, lessons and checkpoints.
- CopilotKit Intelligence is optional and off by default (D20). For an install with no `FREEDUET_INTELLIGENCE` line, `start.sh` writes `on` only when the three Intelligence settings are all present, and `off` otherwise (D65 in `docs/M1_PLAN.md`). With `off`, threads and memory stay in FreeDuet's own database; with `on`, CopilotKit Intelligence holds them.
- Telemetry: CopilotKit's runtime telemetry is **off by default** in FreeDuet (`COPILOTKIT_TELEMETRY_DISABLED=true` in `.env.example`). FreeDuet adds no telemetry of its own.
- Provider credentials for subscriptions never enter FreeDuet. Built: an API key for an `anthropic-compatible` engine is read when the CLI is started for a turn, from `env:NAME` or `file:/absolute/path`, and reaches the CLI only in its environment (`openbot/agent-freeduet/freeduet/compatible_engine.py`). Planned: OpenBot's encrypted, write-only credentials.

## 5. Repository layout after the fork

```
openbot/                      OpenBot, as upstream (only the additions below are ours)
  examples/freeduet/          the team: brand, agents, channels, model, skills, knowledge
  agent-freeduet/             the subscription router (engines.yaml, adapters, spend ledger; prices.yaml planned)
  server/src/freeduet/        engines API (built); delegate, request_purchase, spending caps, savings API (planned)
  app/src/freeduet/           Engines page (built); savings card, spending caps settings (planned)
evals/team/                   FreeDuet's team test cases
docs/                         PROJECT, ARCHITECTURE, PROVIDERS, TEAM, EXECUTOR_BRIEF, import/
scripts/                      start.sh and stop.sh, as upstream, with TENANT_PACKAGE_DIR set to freeduet
```
