# Engines plan: every engine, chosen per member

Plan only, no product code. Written 2026-11-14 for the maintainer's decision "every engine, chosen per member, and a member never stops when one engine hits its limit" ([ROADMAP.md](ROADMAP.md), [PROJECT.md](PROJECT.md) v0.2 and v0.3). It builds on the engine design already in [ARCHITECTURE.md](ARCHITECTURE.md) section 3. The decisions the maintainer took on 14 November 2026 are in 9.2; this plan treats them as settled.

Tags: **[code]** read in this repository. **[doc]** stated by the vendor's official page (URLs in section 10, read 2026-11-14). **[assumed]** my inference, not checked. **[verify]** unknown; a spike on a real install must settle it. Nothing tagged [verify] may be built on as if it were true.

## 1. Goal and constraints

Each member gets an ordered chain of engines. When one cannot take a turn, the next does, by itself, and the person is told. The person can see and change all of it in an Engines dashboard. If every engine in the chain is limited, the member says so plainly with the earliest reset time. "Never stops" means "never fails silently and never loses the message", not "has unlimited capacity".

| # | Constraint | Source |
|---|---|---|
| 1 | Logins first: subscription engines, then free, then metered. A metered engine is never first in a chain and never on by default; it runs only under the person's daily and monthly caps. | [PROVIDERS.md](PROVIDERS.md); `engines.py` `order_logins_first`, `metered_allowed` [code] |
| 2 | Tools and approvals work the same on every engine. The engine sees only the `freeduet` tool bridge (or function schemas), never host tools, and every call still goes through OpenBot's approval gate. An engine that cannot be locked down is not offered. | ARCHITECTURE 3.2; D4 in [M1_PLAN.md](M1_PLAN.md) |
| 3 | FreeDuet never reads, copies or forwards a subscription credential. The person signs in with the provider's own tool; its login state lives in a volume FreeDuet code never opens. | CLAUDE.md; [SECURITY.md](../SECURITY.md) |
| 4 | An engine and model are labelled supported for a member only after that member passes its evals on them: each member at least 90%, safety cases 100% ([evals/team/README.md](../evals/team/README.md)). `--engine` on the runner is only a label today, so the runner must really select the engine first (slice 4). | CLAUDE.md [code] |
| 5 | A switch never silently repeats an action already done in the turn (section 5). | Maintainer, 14 Nov 2026 |
| 6 | Change only what a slice asks. Upstream OpenBot files change minimally, each with a row in `docs/UPSTREAM_TOUCHES.md`. | CLAUDE.md |

Where we start [code]. A member turn runs through `segment.run_segment`, which calls `claude_cli` directly: there is no engine seam. `engines.py` already parses and validates `engines.yaml` (kinds `cli`, `app-server`, `acp`, `anthropic-api`, `openai-compatible`), orders logins first and checks quality tiers, but only `server_calls.py` (text-only calls such as titles, checkpoints, assistants) uses it. `engine_errors.py` classifies Claude's limit text as `usage_limit`, `rate_limit` or `credits`, with the reset time taken from the stream's `rate_limit_event`; today a limit ends the run with a `FREEDUET_ENGINE_LIMITED` error and nothing switches. The tool bridge in `freeduet/bridge/` is already engine-agnostic. agent-freeduet runs as one uvicorn process (`Dockerfile`), so in-memory engine state is not split across workers.

## 2. Components

Size: S under 300 changed lines, M 300 to 1000, L over 1000 or touches the segment state machine and the server together.

| Component | What it does | Need it answers | Where | Size |
|---|---|---|---|---|
| Four-state breaker | Per-engine state: ready, degraded, open, half-open. Failures carry weights by kind, waiting grows on repeats, the state survives a restart. | A limited engine is skipped until reset (ARCH 3.3 rule 5); a sick engine is not hammered. | agent-freeduet | M |
| Limit classifier | Sorts an error into rate limit (wait about a minute), quota exhausted (wait long) or transient (retry soon). A bare 429 is never taken as quota. Reads `Retry-After`. | Limit detection for API-style engines; `engine_errors.py` reads only CLI text today. | agent-freeduet | S |
| Liveness probe and call guards | A listing is not proof an engine answers, so a short bounded probe decides. One `may_use(engine)` check that every call passes: no metered engine unless allowed and under caps, no silent move below the quality floor. | `probe()`; "metered never on by default". | agent-freeduet | S |
| Per-engine environment | Builds the Claude Code child's environment from one engine's entry (base URL, one credential, model overrides) and from nothing else. | The Anthropic-compatible class (section 4). | agent-freeduet | S |
| Latency window | Rolling response times per engine; ignores gateway rejections; needs a minimum of samples before it counts. | Local models: cold start, "too slow, move on". Optional, after Ollama. | agent-freeduet | S |
| JSON salvage | Pulls JSON out of fenced, chatty or truncated model text. | Small local models fail to return clean JSON (assistants `classify` and `extract`, an Iris router). | agent-freeduet | S |
| Usage ledger | One record per call (when, member, engine, model, tokens, cost); sums by member, engine and day; a write never blocks the call. | Savings meter, `freeduet_usage` (ARCH 2.3). See section 7. | server (TypeScript) | M |
| Reviewer on another engine | Chooses an engine other than the member's own for the reviewer (F12); fails open when none fits. | F12. | agent-freeduet | S |
| Rule-then-model routing | A rule decides with no model call; otherwise the model; otherwise a keyword heuristic that gives its reason. | Deterministic-first routing for Iris. See section 6. | agent-freeduet [assumed] | M |
| Engines dashboard and API | Shows the chain, state and usage per member and engine, and holds the person's choices (section 5). | Maintainer decision, 14 Nov 2026. | server and app | M, then L |

Not planned: an automatic capability score for engines. Tiers are set by hand in `engines.yaml` and proven by evals; a score would be a second source of truth.

## 3. Language and placement

| Option | For | Against |
|---|---|---|
| **A. Router inside agent-freeduet (Python). Recommended.** | The child processes, stream parsers, limit detection, tool bridge, `engines.yaml` and the fake-CLI tests are already there [code]. The "before the engine accepted the turn" rule needs the segment state machine, which lives there. One place decides. No upstream OpenBot change for routing. | The ledger and the Engines dashboard are in the TypeScript server and app, so engine events and the person's settings cross a process boundary. |
| B. Router in the OpenBot server (TypeScript on Bun) | Same language as the server; ledger and UI sit beside it. | The server would call agent-freeduet once per engine attempt, splitting "did the engine accept the turn" across HTTP. The server is wired to one managed agent URL (`MANAGED_AGENT_AG_UI_URL`) [code]. More upstream touches, each one a row and a merge risk. |
| C. A separate TypeScript router service | Keeps routing out of the Python service. | A third process and language to start, test and keep alive; it still needs the segment knowledge from Python. |

Recommendation: A. The server keeps what it already owns or will own: the `freeduet_usage` table, `GET /api/freeduet/engines` (a read-through of agent-freeduet's state, ARCH 2.4), the person's engine settings and the dashboard page in the app. Per-run facts from server to agent-freeduet already travel in `forwardedProps` (for example `openbotPersonLanguage`, D26), and the engines file is mounted through `FREEDUET_ENGINES_FILE` [code]; the person's engine settings use the same road, so no new channel is needed (one upstream touch in `copilot.ts`, with its row). The breaker, classifier and probe are about 700 lines of Python with tests [assumed]. To decide (E4): where limited-until is kept across restarts; a small JSON file in agent-freeduet's own volume is the cheapest, and no credential ever goes in it.

## 4. Engine adapters

Contract: ARCHITECTURE 3.1 (`key`, `kind`, `capabilities`, `probe()`, `run_turn()`, `limit`). Claude exists; the rest are new. Build order: Anthropic-compatible endpoints (least new code), then Ollama, Codex, Grok, then direct API keys.

| Engine | Sign-in | Tools and approvals | How "limit reached" shows up | Unknown |
|---|---|---|---|---|
| **Claude Code** (exists) | The person signs in with the CLI in a terminal; token variables are stripped [code]. | `--mcp-config` with the `freeduet` stdio server, `--tools ""`, `--strict-mcp-config`, `--allowedTools mcp__freeduet`, `--permission-mode dontAsk` [code]. A tool call ends the segment (D4); OpenBot runs it under its gate and posts again with the result. | Text through `classify`, plus `rate_limit_event` `resetsAt`; ends as `FREEDUET_ENGINE_LIMITED`. Sign-in loss ends as `OPENBOT_MODEL_AUTH_REQUIRED` [code]. | The legal page lets an end user sign in to the unmodified binary on a hosted platform [doc]; re-read it before each release. |
| **Anthropic-compatible endpoint** (new class, 4.1) | None from FreeDuet: the person's own key at the provider, kept as a secret (`credential_secret_ref` exists in `engines.yaml` [code]). | Identical to Claude Code: same CLI, lockdown, bridge and D4 segments. Nothing new to bridge. | The provider's own HTTP errors (429, credits) arrive as the CLI's text; shape [verify]. No `rate_limit_event` from a non-Anthropic provider [assumed]. | Terms and limits are the provider's. Tool quality per model [verify]; evals decide. |
| **Ollama** (local, free) | None; a local server [doc]. | FreeDuet runs the loop itself over the OpenAI-compatible API: tools and streaming are supported, `tool_choice` is not [doc]. The model sees only the function schemas we send, so it has no host tools by construction. A call ends the segment (D4). | No vendor limit. Failures are server down, model not loaded, timeout, out of memory; no reset time, so the one-minute default applies. `/api/tags` lists installed models, which is not liveness [doc]. | Tool-calling quality per model (the docs list none), so tier C until evals say otherwise. Speed on the person's hardware. Context size for transcript replay. |
| **Codex CLI**, ChatGPT plan | Route (a): the person signs in with Codex's own flow, state kept in a volume we never open [assumed; exact command and storage to verify]. Route (b): the "Sign in with ChatGPT" program for third-party apps, where the app holds the person's access token and passes it in an environment variable [doc]. (b) conflicts with constraint 3. | `codex app-server` (JSON-RPC over stdio) or `codex exec --json` (JSON events) [doc]. MCP servers are declared in `config.toml` with per-tool approval modes [doc]; key names [verify]. The shell tool can be switched off, but the docs do not say every built-in tool (for example `apply_patch`) can be removed [doc, verify]. | Plans have 5-hour and weekly windows and a running turn may finish [doc]. Exact error text or event: [verify]. Only "You've hit your usage limit." seen, in third-party issue titles. | Does the server emit an MCP call before running it (needed to end the segment as D4 does)? Full lockdown. Terms for a self-hosted wrapper on a ChatGPT plan. Is there a call that reads remaining limits? |
| **Grok CLI** (Grok Build) | Browser sign-in or `--device-auth`. `XAI_API_KEY` also works but is metered, so never first [doc]. | Headless `grok -p` with `--output-format streaming-json`, or `grok agent stdio` (Agent Client Protocol) [doc]. MCP servers come from a TOML config file; no per-run flag is documented [doc]. Loaders that read other tools' configs exist [doc], so an isolated config directory is mandatory. | Not found in the pages read [verify]. | Per-run MCP config. Can built-in tools be disabled? Limit shape. Terms for subscription use by a third-party app. Which plans include Grok Build. |
| **Direct API keys** (`anthropic-api`, `openai-compatible`), always last | The person's own key, metered, off by default, capped [code: `engines.py`]. | The function-calling loop built for Ollama. | HTTP 429 with `Retry-After`, or a credits-exhausted body; a bare 429 is a rate limit, not an exhausted quota (classifier). | Each provider's exact "out of credits" body [verify]. |

Notes. (1) Codex and Grok start the existing stdio bridge as their MCP server, so no new tool code is written; their own approvals are not trusted, the gate stays at OpenBot. (2) Lockdown proof is a test, not a claim: for every CLI engine a test starts it against a fake bridge with a prompt that asks for a shell command and a file write, and fails if either happens. No proof, no offer. (3) Ollama comes before Codex and Grok because it needs no login, has no terms risk and is locked down by design; it also unlocks the assistants chain.

### 4.1 The Anthropic-compatible endpoint class

Members already run inside the Claude Code CLI, so pointing its base URL at another endpoint needs the least new code. The CLI takes `ANTHROPIC_BASE_URL` plus one credential: `ANTHROPIC_AUTH_TOKEN` (sent as a bearer token) or `ANTHROPIC_API_KEY` (sent as `x-api-key`). A credential variable takes precedence over the saved Claude login, which stays unused and untouched, and a base URL alone does not replace the subscription [doc]. OpenRouter is the first target: base `https://openrouter.ai/api`, key in `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY` set blank, models mapped with `ANTHROPIC_DEFAULT_OPUS_MODEL`, `_SONNET_MODEL` and `_HAIKU_MODEL` [doc]. Any endpoint the person runs or chooses works the same way, for example a local gateway or proxy that lets the harness reach other providers, free tiers included.

**What must change [code].**

| Where | Today | Change |
|---|---|---|
| `engines.py` | `KINDS` has no such class | A new kind `anthropic-compatible`: needs `base_url`, `credential_secret_ref` and a model map; `billing` is `free` or `metered` as the person declares (never `subscription`); an entry with no credential is invalid, because a base URL alone would silently keep the subscription. Adding a gateway is a new entry in `engines.yaml` (and a dashboard form), not code. |
| `claude_cli.child_env` | Strips every `ANTHROPIC_*` name and the OAuth token, so a key can never reach the subscription engine | Keep that for the Claude subscription engine. For this class build the environment from the engine's own entry only: base URL, one credential, model map. Never copy them from the service's own environment. The two engines share one binary and one login volume; only the environment differs. |
| `claude_cli.LABEL` | Hardcoded "Claude Code" | The notice names the engine ("OpenRouter hit its limit"). |
| `server/src/freeduet/model-base.ts` | Pins the server's own Anthropic-format calls (titles, triage) to agent-freeduet and replaces any exported provider address; CLAUDE.md: an exported `ANTHROPIC_BASE_URL` beats `.env`, so the server pins it | **No change.** It stays right. It also means a gateway can never be reached by exporting `ANTHROPIC_BASE_URL`: the server overwrites it and the CLI never inherits it. The address lives in the engine's entry only. |
| `docs/PROVIDERS.md` | Lists no gateway route | A row for the class, written by the slice. |

**Constraints, stated plainly.** (1) The key is the person's own at that provider; FreeDuet never holds a subscription credential for it. (2) Logins-first still orders the engine after subscription logins; the person can move it in the dashboard (E3 covers a metered one). (3) Limits, prices and terms are the provider's. (4) Anthropic's page says it does not endorse, maintain or audit third-party gateways and does not support routing Claude Code to non-Claude models through any gateway [doc]; OpenRouter's page says Claude Code is "only guaranteed to work with the Anthropic first-party provider" [doc]. So a model is labelled supported only for the pair (endpoint, model) that passed the evals with tools; the default label is tier C. (5) A gateway must forward what the CLI sends; some reject fields with a 400, and the docs name a switch for it (`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`) [doc]. (6) Whether free OpenRouter models work with tools through the CLI is [verify]; the OpenRouter page does not mention free models. (7) FreeDuet ships no third-party gateway code. The person installs any gateway separately; some are under copyleft licences such as AGPL, so nothing from them is copied or bundled into this MIT repository; FreeDuet only sends HTTP requests to the address in the entry.

## 5. The chain and the Engines dashboard

**Config.** `engines.yaml` is the baseline [code]: ordered list per member, logins first, tier floor. New: per engine `capabilities` and a context size, so "the next engine must cover what the turn needs" (ARCH 3.3 rule 2) can be checked; `engines.py` has no context-size field today [code].

**Engine states.**

| State | Meaning | Enters when | Leaves when |
|---|---|---|---|
| Ready | Tried in chain order | Start, or a turn succeeds | A failure |
| Degraded | Still tried, after healthy ones, shorter timeout | Timeouts or transient errors below the trip weight | Successes, or it trips |
| Open | Skipped | A limit: until the engine's reset time. No time given: one minute (ARCH rule 5), growing on repeats up to a cap [to decide] | The time passes |
| Half-open | The next real turn is the probe | Open time passed | Success, then Ready. Failure before the engine accepted the turn, then Open again and the turn moves on at no cost |
| Signed out | Not a timer: needs the person | `is_sign_in_failure`, or `probe()` | `probe()` sees a signed-in engine; the person was told "sign in to X" |

A reset time stated by the engine always wins over a guessed wait: Open lasts until then, not shorter and not longer.

**Switch rules.** Mode is per member: **automatic** (the default) or **ask-first**. Ask-first asks in every row below ("Claude is limited until 09:00. Switch to Codex, wait, or pick another?").

| Situation | Automatic mode |
|---|---|
| Limit or error before the engine accepted the turn (no output, no tool call, no approval question) | Move to the next engine in the same turn and show the switch (ARCH rule 1). |
| Limit after text started, no tool call yet | Keep and show the cut-off text, continue on the next engine, which is told the answer was interrupted and must not repeat what was said. The line says so. An eval case injects this limit [assumed quality]. |
| A tool call already ran and was approved | It ran once; the transcript carries its result and tells the model "never repeat a call that already has a result" [code: `transcript.py`]. A switch is allowed at that segment boundary, and every write still meets the gate. D27 sends a new email without a card when the person typed every recipient in the latest message, so a repeated send after a switch could have slipped through. E2 closes it on the server (M1_PLAN D37, built 14 November 2026, not yet run live with a real switch): a send equal to one already sent or tried in the run is not sent, nobody is asked, and the person reads a sentence in their language saying so. The run id is the same across the switch and the run stays in one process, which is where that memory lives. |
| Approval pending | The turn waits at OpenBot, not on an engine; the next segment goes to whichever engine is Ready. |
| Below the member's quality tier | The chain skips the engine for that turn; if none is left the tool refuses and says why (Jules, purchases). |
| Unattended turns (routines, check-ins) | Same rules; the switch is written into the report. Metered engines never turn on by themselves. |
| Loop guard | At most two switches per turn, then a plain message. |

**The Engines dashboard** (a page in the app, reading `GET /api/freeduet/engines`; ARCH 2.4). It shows and, once editable, sets everything:

| Part | Content |
|---|---|
| Chain per member | The engines in order, each with its state: available, limited until a time, not signed in, disabled, probing. Last error in plain words, never account details. |
| Per engine | Installed, signed in (yes or no, never which account), billing (subscription, free, metered) and caps spent, tier, models labelled supported, usage: turns, limits hit and switches from agent-freeduet's counters; tokens and money only once the ledger exists (slice 12), otherwise "not measured". |
| Choices | Order of the chain per member; switch mode per member (automatic or ask-first); pin one engine for a member (no fallback); disable an engine; add a gateway from a form (base URL, key shown only as set or not set, model map, billing). Defaults: automatic, the `engines.yaml` order, nothing pinned. |
| Not changeable here | The approval gate, the lockdown, the quality floor (Jules and purchases) and the metered caps. |
| Storage | The person's choices sit on the server as overrides on top of `engines.yaml`, never edited into the file, and travel in `forwardedProps` per run [assumed; E4]. |

**What the person sees in the conversation.** One line per switch ("Switched to Codex because Claude's weekly limit resets Thursday 09:00", ARCH rule 4). When every engine is limited: the earliest reset and "your message is kept". The conversation keeps its main engine and tries it again on the next message unless it is Open (ARCH rule 6). A switch replays the whole transcript on the new engine (D6); long ones use the checkpoint handoff (F14), and an engine whose window cannot hold it is skipped [assumed].

## 6. Deterministic-first routing for Iris

The order is rule, then model, then heuristic with a reason. Candidates for Iris [assumed; Iris's real traffic is not measured]:

| Request | Without a model call | Rule | Risk |
|---|---|---|---|
| Starts with a member's name ("Leo, ...") | Hand to that member | Name or id is the first token, followed by a comma or colon | "Otto" as a person's name; "Wren, no, ask Leo". First token only. |
| A skill chip picked in the message box | Already deterministic [code: the chip's text goes in front of the run] | None | None |
| "Which engine are you on?", "why did you switch?", "what is limited?" | Answer from engine state | Whole message equals a fixed phrase | A paraphrase falls through to the model, which is fine. Show the time of the state. |
| Savings and usage questions | Answer from the ledger, labelled "estimate" | Same | Numbers must come from the ledger only. |
| "thanks", "ok" | No model turn | Whole message only | "ok, send it" is an instruction; never match a prefix. |

Never by rule: anything that sends, buys, pays, deletes, books or shares; multi-clause requests (a rule that reads only the first clause misroutes the rest); a member name anywhere but the start. Uncertain or two rules disagree: the model decides.

Measure before turning on. (1) A labelled set of Iris requests in `evals/team/`, synthetic only (the repository is public), each marked with its right handler or "must go to the model". (2) Shadow mode on the maintainer's own stack: the rule logs its id and what it would have done, never the text, and Iris still answers; compare afterwards. (3) Proposed gate: precision on routed requests at least 99%, zero action requests short-circuited, coverage reported as it is. If coverage is small the live switch is not built; that is a valid outcome. (4) Live only behind a setting, off by default, switchable per rule.

## 7. Savings meter

The ledger keeps one append-only record per call (when, member, engine, model, tokens in and out, cost), sums by member, engine and day, and a write never blocks or fails the call. Storage is the Postgres table `freeduet_usage` (ARCH 2.3); `source` says `reported` or `estimated`; `api_equivalent_cost` comes from the person's dated `prices.yaml` and an unknown model price shows "not measured", never zero. Add two counters the person cares about: limits hit and switches made. Whether Codex, Grok and gateways report tokens at all is [verify]; where they do not, the meter counts turns and says so. Adding an enum value to Postgres breaks `tests/schema.test.ts` [code], so the table uses text columns.

## 8. Rules we adopt

| Rule | Test that keeps it true |
|---|---|
| Every engine call has a hard timeout enforced by the router (kill the process), not only by the engine: first output, and whole turn. `probe()` too. | Fake engine that hangs: the turn ends and the next engine is tried. |
| Tests start from clean state: no breaker file shared between tests, a temp directory and a fake clock for each, no test touches a real engine or a real login. | The suite passes in any order, twice in a row. |
| No long autonomous pipelines. A turn is one engine and its segments; at most two switches; a routine cannot chain turns past its existing limits. | A fake chain that always fails ends after two switches. |
| A listing is not liveness; a bare 429 is not a quota. | `probe()` against a fake server that lists a model but never answers. |
| A routing rule ships only after it was measured (section 6). | The shadow report exists before the setting does. |
| Failure paths are tested, not only success: limit during output, signed out, killed child, bridge down, gateway rejecting a field. | Fixtures like `usage_limit.jsonl` and `not_signed_in.jsonl`, one per engine. |

## 9. Work plan

One PR each, in this order. "E" numbers are the open decisions in 9.3 (M1_PLAN keeps its own D numbers).

### 9.1 Slices

| # | Slice | Ships | Proof | Needs | Size |
|---|---|---|---|---|---|
| 1 | Adapter seam | `EngineAdapter` interface (ARCH 3.1); Claude moved behind it; the child's environment built per engine; no behaviour change | Existing pytest suite unchanged; AG-UI output byte-identical on recorded fixtures | none | M |
| 2 | Engine state and detection | Breaker (section 5), classifier, `probe()`, persisted limited-until | Fake-clock unit tests; limit and sign-in fixtures | 1; E4 | M |
| 3 | Chain in the member path | Per turn engine choice, automatic and ask-first modes, pin, disable, switch rules, notices, quality floor, loop guard; Claude plus a second fake engine (generalise `tests/fake_claude.py`) | Limit before output switches; limit after text continues; tool-boundary case; approvals unchanged; Claude evals unchanged | 1, 2; E2 | L |
| 4 | Eval runner selects the engine | `--engine` really sets the member's chain on the eval stack | Runner tests; a Claude run reproduces its certified score | 3 | M |
| 5 | Anthropic-compatible endpoint | The class of 4.1; OpenRouter as the first entry; PROVIDERS.md row | Fake gateway tests (limit, 401, a rejected field); lockdown unchanged; the key never reaches the Claude subscription engine; offered only after the evals of slice 4 | 1, 3 (offered after 4); E3 | M |
| 6 | Engines dashboard, read-only | `GET /api/freeduet/engines` and the page: chain, states, usage counters | Server and app tests | 2, 3 | M |
| 7 | Engines dashboard, editable | Order, mode, pin, disable, add a gateway; settings stored on the server and sent in `forwardedProps`; one upstream touch row | Round-trip tests; a pinned engine never falls back; defaults unchanged when nothing is set | 6; E3, E4 | L |
| 8 | Ollama adapter (free) | OpenAI-compatible loop with in-band tool calls (M1_PLAN D4), probe with a real tiny generation, tier C, assistants reuse it | Fake-server tests; then each member at least 90% and safety 100% on a named local model before it is labelled supported | 3, 4 | M |
| 9 | Codex spike, then adapter | Spike: written findings on a disposable machine (limit shape, tool-call event, lockdown, sign-in route). Adapter after. | Lockdown test of section 4; fixtures; evals at the thresholds | 3, 4; E1 | S, then L |
| 10 | Grok spike, then adapter | Same shape as slice 9 | Same | 3, 4 | S, then M |
| 11 | Direct API keys, last in chains | `anthropic-api` and `openai-compatible` without the CLI, caps | Cap tests; never first in a chain; off by default | 8 | M |
| 12 | Ledger and savings card | `freeduet_usage`, usage events from the router, the card; dashboard usage fills in | Server and app tests; numbers match fixtures | 3 and one real engine; E5 | L |
| 13 | Iris routing, shadow only | Labelled set, rules, shadow log, report | Section 6 gate | 3; E6 | M |

Slices 5 and 6 can run in parallel after slice 3; slices 8 to 10 are independent after slice 4. Rough total: 4 L, 9 M and 2 S (the two spikes). The first useful result, Claude with an automatic fallback to a gateway engine and a read-only dashboard (slices 1 to 6), is 1 L and 5 M.

**Slice 6 built, read-only (14 November 2026):** `GET /api/freeduet/engines` (`openbot/server/src/freeduet/engines-routes.ts`, mounted in `app.ts`) reads agent-freeduet's `GET /engines` on the server, sending the deployment token only to the managed endpoint's address, with no redirect followed and a three-second limit. Administrators only: another role gets 403 and the agent is not asked. It returns each engine's name, one state (ready, degraded, limited, out of credit, not answering, checking, signed out, unknown) and the UTC time a waiting state ends, and nothing else the agent holds. With the router off, no agent set up, or no answer, it names the reason and lists nothing. The Engines page under Admin (`openbot/app/src/freeduet/engines-section.tsx`, sentences in `engines-text.ts`) writes one English sentence per engine, shows the time in the browser's time zone, refreshes every 30 seconds and has nothing clickable. Tests: 15 server, 9 text and 6 page tests. Not built: the chain of each member and the usage counters, which row 6 of the table asks for and `GET /engines` does not return yet (agent-freeduet would have to expose them); mode, pin and disable (slice 7); installed and signed in (no probe runs yet, so "Signed out" appears only after a failed turn), and the credentials panel. Not verified: a live run on an install, a browser check, and the team evals (no member prompt changed).

**Built so far (14 November 2026):** the limit and failure classifier of slice 2, `openbot/agent-freeduet/freeduet/failure_classifier.py` with `tests/test_failure_classifier.py`; the breaker of section 5 (`engine_breaker.py` with `tests/test_engine_breaker.py`: the five states, a registry per engine id, an in-memory and an atomic file store for limited-until, E4). Both were merged wired into no run path; slice 2, below, wires them.

**Slice 3 built (14 November 2026), agent-freeduet only:** `engine_router.py` walks a member's chain per segment (breaker `begin()`, one recorded outcome per attempt), with the switch rules of section 5: limit before output, limit after text (the next engine is told not to repeat it), a tool that ran stays in the transcript with its result, writes still meet OpenBot's gate because a segment that ends on a tool is not a failure. Automatic and ask-first modes, pin, disable (`enabled: false`), notices in English and Italian (`engine_notices.py`), the loop guard (2 switches), the first-output timeout (transient), a probe at most once a minute for a signed-out engine, and the quality floor for tool names. `switching:` in the engines file sets mode and pin (D34). Tested with a fake second engine (`tests/fake_engines.py`, `tests/test_engine_router.py`); with one engine nothing changes (the 52 goldens). Not built: E2 (the server-side refusal of D27's no-card send when an equal send already completed), any real second engine, the dashboard and the person's overrides (slices 5 to 7). "Claude evals unchanged" is not yet proven live: run the team evals on the eval stack before relying on it.

**Slice 4 built (14 November 2026), runner only:** `evals/team/engine.ts` and `run.ts` take `--engine <name>` (else `FREEDUET_EVAL_ENGINE`, else `claude-code`) and check it against the eval stack's `GET /engines` before anything is created: an engine the stack does not run, or cannot run now, is refused in plain words, and the default is refused only when the stack does not list `claude-code`. Each case records the engine that answered it: with one engine listed, that engine ran every turn (no router without a pin, D34 point 1), so the case records it; with two or more listed, or no readable list, `unknown`, because a member's chain and pin decide which one runs a turn and the list shows neither. The thresholds are per engine; a regrade keeps its report's engine; `--public` keeps the label. On the default install, a default run's console output, Markdown, JSON, regrade, public copy and fake run are the same as main's (a differential run; timing fields aside). Tested in `evals/team/engine.test.ts` (43 tests, the runner ones against a scripted stack), which CI runs next to `run.test.ts`; the existing runner tests pass unchanged (175 in `run.test.ts` and `dates.test.ts`, 19 in `live-tools.test.ts`). Not built, so slice 4 is not done: the runner does not set the member's chain on the stack, so `--engine` does not yet route a turn. No live run was made, so a Claude run reproducing its certified score is not proven.

**Slice 2 built (14 November 2026):** `probe()` on the adapter (Claude: `claude --version` and `claude auth status`, never a model call, launched like a turn); `engine_state.py` records every member turn in the breaker and keeps limited-until in `FREEDUET_ENGINE_STATE_FILE` (default `engine-state.json` in the data volume), recording only; `GET /engines` on agent-freeduet serves it behind the service token. Not built: nothing calls `probe()` yet and no run path reads the breaker's verdict (slice 3); the server read-through is slice 5.

**Slice 1 built (14 November 2026):** `EngineAdapter` in `freeduet/engine_adapter.py`, Claude Code behind it in `freeduet/claude_engine.py`, `segment.py` drives any adapter; `tests/test_engine_goldens.py` pins 52 scenarios recorded before the change, byte-identical after.

**E2 built on the server (14 November 2026):** the check that a send equal to one already sent or tried in the run is refused, with a sentence for the person, in `openbot/server/src/plugins/plugin-store/calls.ts` (M1_PLAN D37). Tested through the real gate on both Gmail backends by making the same run's call twice, as a switch would; not run live, because no switch exists yet (slice 3), and no eval case is added.

**Built so far (14 November 2026):** the JSON salvage block of section 2, `openbot/agent-freeduet/freeduet/json_salvage.py` with `tests/test_json_salvage.py`, wired into no run path; no member imports it yet.

### 9.2 Decided on 14 November 2026

| Decision | Consequence here |
|---|---|
| When an engine hits its limit FreeDuet switches to the next engine in the member's chain **automatically by default**. An Engines dashboard shows every option (chain per member, signed in, state, usage) and is where the person chooses or presets everything: chain order, automatic or ask-first, pin one engine, disable an engine. A switch never silently repeats an action already done in the turn. | Sections 1, 5; slices 3, 6, 7. The safety concern is settled by E2 (section 9.3). |
| Metered API keys stay off by default and last in every chain. Gateways must work in the first engines release: OpenRouter and any Anthropic-compatible endpoint the person runs or chooses. FreeDuet ships no third-party gateway code. | Section 4.1; slice 5 is one of the first useful slices. Adding a gateway is configuration, not code. |
| Codex and Grok are offered only after their spikes. Local models stay tier C until evals say otherwise. | Slices 8 to 10. |

### 9.3 Decided on 14 November 2026 (E1 to E6)

The maintainer decided all six on 14 November 2026. Nothing is left open in this section.

| # | Decision | Decided |
|---|---|---|
| E1 | Codex sign-in | Codex's own official login, in a volume FreeDuet never opens. The token program, where the app would hold the token, is not used: it breaks "never read, copy or forward subscription credentials". |
| E2 | D27 (no card for an email to addresses the person typed) after an engine switch | The server refuses the shortcut when an equal send already completed in the turn, and tells the person it did so. Built on the server on 14 November 2026 (M1_PLAN D37): the attempt is what is counted, as the stricter reading, and a send that never reached the vendor is not; not yet run live. |
| E3 | A metered or gateway engine above the subscription logins, or pinned | Free gateway entries move freely. A metered one moves up or is pinned only after an explicit confirmation that shows its caps. PROVIDERS.md says so when the dashboard ships. |
| E4 | Where limited-until and the person's dashboard choices are kept | Limited-until in a file in agent-freeduet's volume, next to the engine. The person's choices on the server. |
| E5 | When the ledger and savings card ship | After a real engine beyond Claude exists, so the numbers are real. |
| E6 | Iris routing | In this version the shadow only: it proposes and records, it does not decide. Its hit rate is then reviewed. The goal stays that Iris picks the engine that fits the task by herself. |

Also decided the same day: once the control dashboard exists it gets a credentials panel, one place where the person adds, sees and removes the keys of gateways and metered engines (stored encrypted, shown masked, never sent to a member). Subscription logins are never in it: they stay inside each engine's official program, which FreeDuet never opens.

## 10. Sources

[doc] Claude Code gateways: `https://code.claude.com/docs/en/llm-gateway` and `/llm-gateway-connect`; legal terms: `/legal-and-compliance`. OpenRouter with Claude Code: `https://openrouter.ai/docs/guides/guides/claude-code-integration`. Codex: `https://developers.openai.com/codex/app-server`, `/codex/noninteractive`, `/codex/config-reference`, `/codex/pricing`, `/siwc/token-sharing-open-source/codex-app-server` (these redirect to learn.chatgpt.com). The help article on using Codex with a ChatGPT plan could not be fetched, so limit wording stays [verify]. Grok Build: `https://docs.x.ai/build/cli/reference`, `/build/cli/headless-scripting`, `/build/features/mcp-servers`, `/build/overview`. Ollama: `https://docs.ollama.com/api/openai-compatibility`, `/capabilities/tool-calling`, `/api/tags`. Vendor pages change; a slice that depends on one re-reads it first.
