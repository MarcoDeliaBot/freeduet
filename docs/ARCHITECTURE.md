# Architecture

FreeDuet is a **thin fork** of OpenDuet, which itself is OpenBot plus one tenant folder. The rule: change upstream code only where there is no extension point, and send generic fixes back upstream.

```
                   ┌─────────────────────────── web · phone · Slack · Teams ───────────────────────────┐
                   ▼                                                                                    │
 ┌──────────────────────────────── OpenBot server (Hono + CopilotKit runtime) ────────────────────────────────┐
 │  OpenDuet layer (unchanged): brief · triage · tasks · pages · channels · replies                          │
 │  FreeDuet layer (new, server/src/freeduet/):                                                                │
 │     delegate tool · request_purchase tool · spending caps · usage ledger · savings API · engines API          │
 │  Gateway (unchanged): resolve target → policy (CEL, fail closed) → audit row → act, or refuse with the rule   │
 └──────────────┬──────────────────────────────────────────────┬────────────────────────────────────────────┘
                │ AG-UI                                          │ every tool call
                ▼                                                ▼
 ┌──────────── agent-freeduet (Python, new) ─────────────┐    ┌──────── a computer per member ────────┐
 │  prompt source: examples/freeduet/agents.yaml          │    │  Chromium · /workspace · shell        │
 │  engine chain per member (engines.yaml)                │    │  built by OpenBot's supervisor         │
 │  adapters: Claude Code CLI · Codex app-server · ACP ·   │    │  take-the-wheel on logins and codes    │
 │            Anthropic API · OpenAI-compatible            │    └────────────────────────────────────────┘
 │  tool bridge: an MCP server that exposes only the      │
 │  member's granted OpenBot tools, through the gateway   │
 │  limit detection · fallback · usage reporting          │
 └────────────────────────────────────────────────────────┘

 PostgreSQL + pgvector: policy, approvals, audit, credentials, FreeDuet ledger and permits
 CopilotKit Intelligence: threads and memory (managed free plan; self-hosted option tracked upstream)
```

## 1. What is reused unchanged

| Piece | From | Notes |
|---|---|---|
| Server, app, worker, routines | OpenBot | Routines give the morning brief and scheduled checks. |
| A computer per member | OpenBot supervisor + agent-computer | Each member gets its own container with Chromium, a `/workspace` volume and a browser profile. |
| Gateway, approvals, audit | OpenBot | Every action a member takes is decided against policy, recorded, then executed. Sending, paying, signing and deleting ask the person: Refuse, Allow once, Always allow. |
| Secrets | OpenBot | Logins go through a masked box; stored credentials are encrypted and write-only. |
| Brief, triage, tasks, pages, channels | OpenDuet | Used by Iris and by every member. |
| Connectors | OpenBot catalogue + Composio | Google Workspace, Drive, Notion and more, granted per member by an administrator. |

## 2. FreeDuet server additions (TypeScript, `openbot/server/src/freeduet/`)

### 2.1 `delegate` tool (milestone M3)

Held by Iris only. Input: up to six pieces, each `{ member, brief, attachments[] }`. Behaviour, ported from the team design of Anil-matcha/open-duet:

1. Each piece starts a task conversation with the target member, using OpenDuet's task machinery, framed as "work handed to you by Iris".
2. The call returns receipts at once; Iris ends her turn.
3. Results, each one a member's report (§2.5), land in an inbox. When every awaited result is in, or a member asks the person a question, Iris is resumed **once**, in a new turn of the same conversation, with the results quoted as data.
4. A member that needs the person ends with a last line `NEEDS INPUT: <question>`; the person answers in that member's conversation and the piece runs again.
5. Results never approve anything. A stalled or failed piece comes back to Iris as a result with outcome `stalled` or `failed`.

Acceptance: a three-piece request returns one combined answer; a stopped Iris stops her pieces; no piece runs twice after a restart.

### 2.2 `request_purchase` tool and purchase permits (milestone M4)

Held by Jules. Input: `{ merchant_host, items[{name, variant, qty, price}], fees, total, currency, cancellation_terms, payment_method_label }`.

1. The server checks the caps: per purchase, per day and per month, per member and overall (settings, default €0, meaning "set a cap before Jules can buy").
2. If within the caps, it opens an approval card that shows the full review. Only **Allow once** and **Refuse**: purchases never offer "Always allow".
3. On approval it mints a **permit**: single-use, valid 10 minutes, bound to the member, the merchant host and the total.
4. A gateway policy rule refuses clicks and key presses that would complete a checkout on `merchant_host` (button text or accessible name matching pay, buy, place order, confirm booking, and the equivalents in the configured languages) unless a valid permit exists. The permit is spent on use.
5. The ledger records the approved total; the person can mark the real charged amount later.

Acceptance: without a permit the final click is refused and the refusal names the rule; a permit for €40 does not allow a €45 total; a permit expires after 10 minutes; a CAPTCHA or code hands control to the person.

### 2.3 Usage ledger and savings meter (milestone M3)

Table `freeduet_usage`: member, engine, model, input, output and cached tokens, started and finished time, `metered_cost`, `api_equivalent_cost`, and `source` (`reported` when the engine reported tokens, `estimated` otherwise).

`api_equivalent_cost` uses `prices.yaml`, maintained by the person and dated; FreeDuet never guesses a price. The savings card shows, for the current month: API-equivalent value of the work, what was actually paid (subscriptions prorated by the person's own monthly fees, plus metered usage), and the difference, labelled "estimate".

### 2.4 Engines API

`GET /api/freeduet/engines` returns, per engine: installed, signed in, available, limited until, last error. The app's Engines page shows it, with the provider's own sign-in instructions; FreeDuet never performs the sign-in.

### 2.5 Work reports and checkpoints (milestone M1)

Every member ends a piece of work with the report its prompt defines (shared rules in `agents.yaml`), and keeps the same facts as a checkpoint, using the checkpoint writer of [AI Continuity](https://github.com/MarcoDeliaBot/ai-continuity) (MIT, by the maintainer), ported with attribution.

| Report line | Checkpoint field | Rule |
|---|---|---|
| Outcome: done, partly done, in progress, blocked, failed, needs you | `phase`: complete (done), in-progress (partly done, in progress), blocked (blocked, failed, needs you) | "Done" needs evidence and no open next step. "In progress" is work handed to a colleague or still running, with nothing for the person to do yet; the team log records it as "in progress", like a segment that ended without a report |
| Done | `completed` | |
| Evidence | `verification` | Files, links, numbers or the tool's confirmation; never the member's word alone |
| Not done and why, with what was tried | `blockers`, failed attempts in `decisions` | Failures are recorded, never hidden |
| Already sent, paid, booked, published or deleted | `completed`, with the approval id | Read before any retry, so nothing happens twice |
| Next step | `next_steps` | |

- **Where.** In the member's own computer, under `/workspace/.ai/handoff/<task id>/`, as immutable JSON history plus a readable view. Nothing goes into a second database.
- **When.** Before the first change, before a long or risky step (with phase `planned`), after each coherent block, after a failure, and before the member answers or waits.
- **Who reads it.** Iris (as the result of a delegated piece, §2.1), the router on an engine switch (§3.3, M3), and the person on the task's page.
- **Limits.** No passwords, tokens or card numbers in a checkpoint. A report or a checkpoint never approves anything: approvals stay with the gateway.

## 3. `agent-freeduet`, the subscription router (Python, milestone M1 for Claude Code, M2 for the rest)

An AG-UI service, alongside OpenBot's other `agent-*` services. Every team member becomes `type: remote-ag-ui` pointing at `agent-freeduet`, which reads the member's prompt from `agents.yaml` and its engine chain from `engines.yaml`.

### 3.1 Adapter contract

Ported from Anil-matcha/open-duet's `provider_adapter.py` (Apache-2.0):

| Field | Meaning |
|---|---|
| `key`, `label`, `kind` | `cli`, `app-server`, `acp`, `api` |
| `capabilities` | `tools`, `approvals`, `mcp`, `images`, `resume`, `computer` |
| `probe()` | installed, version, signed in; bounded to a few seconds, never logs account details |
| `run_turn(ctx, sink, gate)` | streams normalized events (`message`, `tool.started`, `tool.completed`, `usage`) and returns an outcome |
| `limit` | usage limit, rate limit or credits exhausted, with reset time when the engine reports one |

Adapters:

| Adapter | Drives | Auth |
|---|---|---|
| `claude-code` (M1) | the person's own `claude` CLI, stream-json both ways | the person's own login, done in a terminal |
| `codex` | `codex app-server`, JSON-RPC over stdio | Sign in with ChatGPT (when approved) or the person's own local login (experimental) |
| `acp` | any agent CLI speaking the Agent Client Protocol | provider-dependent; off unless PROVIDERS.md says on |
| `anthropic-api` | Messages API | API key, metered |
| `openai-compatible` | `/chat/completions` (OpenRouter, GLM, Ollama, LM Studio, vLLM) | API key or none, metered or free |

### 3.2 The tool bridge

CLI engines must never touch the host. Claude Code is started with no built-in tools and one MCP server only (`--tools ""`, `--strict-mcp-config`, `--mcp-config`, permission prompts over stdio), the pattern Anil-matcha/open-duet verified with a recent Claude Code. That MCP server, `freeduet-tools`, exposes exactly the tools OpenBot granted to that member and forwards every call to OpenBot's gateway with the member's tool token. Browser actions therefore run on the member's own computer, through the same policy, approval and audit path as every other OpenBot Bot. Codex gets the same server through its MCP configuration, with the approval policy set to ask.

Verify in M2 against `openbot/docs/architecture.md`: the exact callback route remote agents use for granted tools.

### 3.3 Engine chains and "never stops"

`engines.yaml` gives each member an ordered chain, for example `claude-code → codex → anthropic-api`. Rules, ported from Anil-matcha/open-duet's fallback design and extended to chains:

1. Move to the next engine **only** if the current one refused the turn **before accepting it**: no output, no tool call, no approval question. A limit hit after work started is never moved, because tools may already have run.
2. The next engine must cover what the turn needs: tools and approvals if the turn uses tools, images if there are images, MCP for the tool bridge.
3. **Logins first.** The router orders every chain as subscription engines, then free engines, then metered engines, whatever order the file lists them in. Metered engines (API keys and API credits) join only if the person enabled them, only after every login engine was tried, and only while under the daily and monthly caps.
4. Every switch is shown in the conversation: "Switched to Codex because Claude's weekly limit resets Thursday 09:00."
5. A limited engine is skipped until its reset time, or a minute when it named none.
6. The conversation keeps its main engine; the next message tries it again. Missing context is replayed from the stored transcript as quoted history.

### 3.4 Quality tier

Each engine has a tier, set in `engines.yaml`. A member can require a minimum tier for certain skills. Jules requires tier A for `request_purchase`: on a lower tier the tool refuses and explains why.

### 3.5 Assistants: light helpers on free models

Every member holds an `ask_assistant` tool for small, low-risk jobs, so subscription limits go to the work that matters. Product view: [CATALOG.md](CATALOG.md#assistants).

| | |
|---|---|
| Input | `{ task, input, instructions }`, where `task` is one of `summarise`, `extract`, `classify`, `translate`, `reformat`, `proofread`, `draft-variants`, `tag`; `input` is text or the text of attached files, within `max_input_tokens` |
| Engine | The `assistants.chain` in `engines.yaml`. Only engines with `billing: free` are accepted: local models and free model routes. Subscription and metered engines are rejected at load time |
| Powers | None: no tools, no MCP bridge, no browser, no memory, no network beyond the model call |
| Output | Returned to the calling member as quoted data, never as instructions. The member checks it before using it; anything sent or published still goes through the approval gate |
| Limits | `max_calls_per_turn` (default 10), `max_input_tokens`, a per-call timeout, up to 4 calls in parallel |
| Fallback | If no free engine is available or a call fails, the tool says so and the member does the job itself |
| Ledger | Each call is recorded in `freeduet_usage` with `billing: free`, so the savings meter shows it |

Acceptance (M3): a member summarising ten emails through assistants uses no subscription turns for those summaries; an assistant fed a prompt-injection email returns text and cannot trigger any action; with assistants disabled, every member still completes its eval cases.

## 4. Data and privacy

- Everything stays in the person's PostgreSQL and the member computers' volumes.
- CopilotKit Intelligence holds threads and memory: this is the one external dependency. The managed free plan is the default; its self-hosted option is tracked upstream.
- Telemetry: CopilotKit's runtime telemetry is **off by default** in FreeDuet (`COPILOTKIT_TELEMETRY_DISABLED=true` in `.env.example`). FreeDuet adds no telemetry of its own.
- Provider credentials for subscriptions never enter FreeDuet. API keys are stored through OpenBot's encrypted, write-only credentials.

## 5. Repository layout after the fork

```
openbot/                      OpenBot, as upstream (only the additions below are ours)
  examples/freeduet/          the team: brand, agents, channels, model, skills, knowledge
  agent-freeduet/             the subscription router (engines.yaml, prices.yaml, adapters)
  server/src/freeduet/        delegate, request_purchase, caps, ledger, savings, engines API
  app/src/freeduet/           Engines page, savings card, spending caps settings
evals/team/                   FreeDuet's team test cases
docs/                         PROJECT, ARCHITECTURE, PROVIDERS, TEAM, EXECUTOR_BRIEF, import/
scripts/                      start.sh and stop.sh, as upstream, with TENANT_PACKAGE_DIR set to freeduet
```
