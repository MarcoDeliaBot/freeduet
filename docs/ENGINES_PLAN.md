# Engines plan: every engine, chosen per member

Plan only, no product code. Written 2026-11-14 for the maintainer's decision "every engine, chosen per member, and a member never stops when one engine hits its limit" ([ROADMAP.md](ROADMAP.md), [PROJECT.md](PROJECT.md) v0.2 and v0.3). It builds on the engine design already in [ARCHITECTURE.md](ARCHITECTURE.md) section 3 and on what Nexus, the maintainer's earlier project, already solved.

Tags: **[code]** read in this repository or in Nexus. **[doc]** stated by the vendor's official page (URLs in section 10, read 2026-11-14). **[assumed]** my inference, not checked. **[verify]** unknown; a spike on a real install must settle it. Nothing tagged [verify] may be built on as if it were true.

## 1. Goal and constraints

Each member gets an ordered chain of engines. When one cannot take a turn, the next does, and the person is told. If every engine in the chain is limited, the member says so plainly with the earliest reset time. "Never stops" means "never fails silently and never loses the message", not "has unlimited capacity".

| # | Constraint | Source |
|---|---|---|
| 1 | Logins first: subscription engines, then free, then metered. A metered engine is never first, never on by default, and only under the person's daily and monthly caps. | [PROVIDERS.md](PROVIDERS.md); `engines.py` `order_logins_first`, `metered_allowed` [code] |
| 2 | Tools and approvals work the same on every engine. The engine sees only the `freeduet` tool bridge (or function schemas), never host tools, and every call still goes through OpenBot's approval gate. An engine that cannot be locked down is not offered. | ARCHITECTURE 3.2; D4 in [M1_PLAN.md](M1_PLAN.md) |
| 3 | FreeDuet never reads, copies or forwards a subscription credential. The person signs in with the provider's own tool; its login state lives in a volume FreeDuet code never opens. | CLAUDE.md; [SECURITY.md](../SECURITY.md) |
| 4 | An engine is offered for a member only after that member passes its evals on that engine: each member at least 90%, safety cases 100% ([evals/team/README.md](../evals/team/README.md)). `--engine` on the runner is only a label today, so the runner must really select the engine first (slice 5). | CLAUDE.md [code] |
| 5 | Change only what a slice asks. Upstream OpenBot files change minimally, each with a row in `docs/UPSTREAM_TOUCHES.md`. | CLAUDE.md |

Where we start [code]. A member turn runs through `segment.run_segment`, which calls `claude_cli` directly: there is no engine seam. `engines.py` already parses and validates `engines.yaml`, orders logins first and checks quality tiers, but only `server_calls.py` (text-only calls such as titles, checkpoints, assistants) uses it. `engine_errors.py` (ported from open-duet, Apache-2.0) classifies Claude's limit text as `usage_limit`, `rate_limit` or `credits` and takes the reset time from the stream's `rate_limit_event`; today a limit ends the run with a `FREEDUET_ENGINE_LIMITED` error and nothing switches. The tool bridge in `freeduet/bridge/` is already engine-agnostic. agent-freeduet runs as one uvicorn process (no `--workers`, `Dockerfile`), so in-memory engine state is not split across workers.

## 2. What Nexus has, mapped to FreeDuet

Nexus is TypeScript; its engine code lives in `packages/core/src/engine/`. Verdicts: **Port** = translate nearly line for line, keeping origin notices. **Rewrite** = new code from the idea, with Nexus's test cases as the specification. **Idea** = take the rule, no code. **No** = not useful. Size: S under 300 changed lines, M 300 to 1000, L over 1000 or touches the segment state machine and the server together.

| Nexus module | What it does (own words) | FreeDuet need it answers | Verdict | Why | Size |
|---|---|---|---|---|---|
| `ModelCircuitBreaker` (250 lines) | Per-model breaker with four states (closed, degraded, open, half-open). Failures carry weights by kind, waiting grows on repeats, a quarantine survives restarts. | "A limited engine is skipped until reset" (ARCH 3.3 rule 5); stop hammering a sick local engine. | Rewrite | A subscription engine says when it returns, so open must last until that time, not a capped backoff. Add a signed-out state. Its tests are a good spec; Nexus's notes say it was itself inspired by an MIT project, not copied. | M |
| `FailureClassifier` | Sorts an error into rate limit (wait about a minute), quota exhausted (wait long) or transient (retry soon). A bare 429 is never taken as quota. Reads `Retry-After`. | Limit detection for API-style engines (Ollama errors, API keys). | Port | `engine_errors.py` only reads CLI text; this adds the HTTP path and the bare-429 rule. Code derived from an MIT project, so that credit follows the port. | S |
| `ModelLatencyTracker` | Rolling window of response times per model; ignores gateway rejections; needs a minimum of samples before it affects choice. | Local models: cold start, "too slow, move on". | Port, later | Small, optional; also MIT-derived. Only worth it once Ollama is in. | S |
| `JsonSalvage` | Pulls JSON out of fenced, chatty or truncated model text. | Small local models fail to return clean JSON (assistants `classify` and `extract`, an Iris router). | Port | Self-contained, about 180 lines, Nexus's own code. | S |
| `CostTracker` (310 lines) | One record per call (layer, provider, tokens, cost), appended locally, summed by layer and total. | Savings meter, `freeduet_usage` (ARCH 2.3). | Rewrite (TypeScript, server) | Keep the record shape and sums; storage is Postgres, prices come from the person's dated `prices.yaml`. See section 7. | M |
| `Triage` (770 lines) | Decides how hard a goal is: known patterns by regex first (no model call), then a model, then a keyword heuristic with a reason. | Deterministic-first routing for Iris. | Idea | Its patterns are about code tasks. Keep the order and the reason string. Its own notes record a misroute from a pattern that read only the first clause. See section 6. | M |
| `RolePoolRouter`, `RoleMapper` | Picks a model for a role (builder, reviewer, judge), penalising the builder's own model family; fails open when nothing fits. | Reviewer on a different engine (F12). | Idea | FreeDuet has fixed members, not role pools. Keep "different engine than the member, else fail open". | S |
| Ollama liveness and call-site guards (inside `OpenRouterClient`, 6,000+ lines) | A catalogue listing is not proof a model answers, so a fast bounded preflight decides "any usable engine". Hard guards refuse a paid model at the call site and refuse a silent downgrade. | Local `probe()`; "metered never on by default"; "no silent quality downgrade". | Idea | Port the rules, not the file: one `may_use(engine)` check every adapter call passes through, with tests. | S |
| `ModelIntelligence` | Scores models by capability from a catalogue. | Quality tier A/B/C. | No | Tiers are set by hand in `engines.yaml` and proven by evals; a score would be a second source of truth. Idea-only in Nexus too. | none |
| `TruncationDetector` | Detects code files cut off mid-way. | Nothing in the member path. | No | Members do not produce multi-file code as their main output [assumed]. | none |

Licence and attribution [code]. Nexus is Apache-2.0 with the maintainer as copyright holder (its `LICENSE` and `NOTICE`), contributions under a DCO. He can therefore move his own code into MIT FreeDuet, but two things follow. First, Nexus's own third-party parts keep their terms: the failure classifier and latency tracker derive from an MIT project (OmniRoute) and carry its credit; the breaker and the capability scorer were only inspired by it; one design source (Fugu) has no licence and is never copied. Second, FreeDuet already ships Apache-2.0 code (`engine_errors.py`, from open-duet) with a header, so a ported Nexus file gets the same: a header naming the origin and licence, the Apache text kept beside it in `openbot/agent-freeduet/`, and rows in [NOTICE.md](../NOTICE.md) (Nexus as the origin, OmniRoute where derived). This plan does not edit NOTICE.md; slice 2 does, with the maintainer's approval. Nothing private from Nexus (strategy, diagnostics, personal data) belongs in this repository.

## 3. Language and placement

| Option | For | Against |
|---|---|---|
| **A. Router inside agent-freeduet (Python). Recommended.** | The child processes, stream parsers, limit detection, tool bridge, `engines.yaml` and the fake-CLI tests are already there [code]. The "before the engine accepted the turn" rule needs the segment state machine, which lives there. One place decides. No upstream OpenBot change for routing. | Nexus code is rewritten, not copied (about 700 lines of TypeScript become Python, with the tests as the spec). The ledger and the Engines page are in the TypeScript server, so engine events cross a process boundary. |
| B. Router in the OpenBot server (TypeScript on Bun) | Nexus ports are near line for line; ledger and UI sit beside it. | The server would call agent-freeduet once per engine attempt, splitting "did the engine accept the turn" across HTTP. The server is wired to one managed agent URL (`MANAGED_AGENT_AG_UI_URL`) [code]. More upstream touches, each one a row and a merge risk. |
| C. A TypeScript sidecar running a Nexus-style engine package | Maximum reuse of Nexus. | A third process and a third language to start, test and keep alive; still needs the segment knowledge from Python. |

Recommendation: A. The server keeps only what it already owns: the `freeduet_usage` table, `GET /api/freeduet/engines` (a read-through of agent-freeduet's state, ARCH 2.4) and the app's Engines page. Per-run facts from server to agent-freeduet already travel in `forwardedProps` (for example `openbotPersonLanguage`, D26) and the engines file is mounted through `FREEDUET_ENGINES_FILE` [code]; no new channel is needed. Consequences for porting: no file is copied across languages; each port starts from Nexus's test names and cases; the three Python modules (breaker, classifier, latency) are about 700 lines with tests. To decide: where limited-until and quarantine are persisted across restarts (a small JSON file in agent-freeduet's own volume is the cheapest; no credential ever goes in it).

## 4. Engine adapters

Contract: ARCHITECTURE 3.1 (`key`, `kind`, `capabilities`, `probe()`, `run_turn()`, `limit`). Claude exists; the others are new. Build order: Ollama, then Codex, then Grok, then metered keys.

| Engine | Sign-in | Tools and approvals | How "limit reached" shows up | Unknown |
|---|---|---|---|---|
| **Claude Code** (exists) | The person signs in with the CLI in a terminal; token variables are stripped [code]. | `--mcp-config` with the `freeduet` stdio server, `--tools ""`, `--strict-mcp-config`, `--allowedTools mcp__freeduet`, `--permission-mode dontAsk` [code]. A tool call ends the segment (D4); OpenBot runs it under its gate and posts again with the result. | Text through `classify`, plus `rate_limit_event` `resetsAt`; ends as `FREEDUET_ENGINE_LIMITED`. Sign-in loss ends as `OPENBOT_MODEL_AUTH_REQUIRED` [code]. | Terms: the legal page lets an end user sign in to the unmodified binary on a hosted platform [doc]; re-read it before each release. |
| **Codex CLI**, ChatGPT plan | Route (a): the person signs in with Codex's own flow, state kept in a volume we never open [assumed; exact command and storage to verify]. Route (b): the "Sign in with ChatGPT" program for third-party apps, where the app holds the person's access token and passes it in an environment variable [doc]. (b) conflicts with constraint 3. | `codex app-server` (JSON-RPC over stdio) or `codex exec --json` (JSON events) [doc]. MCP servers are declared in `config.toml` with per-tool approval modes [doc]; exact key names [verify]. The shell tool can be switched off, but the docs do not say every built-in tool (for example `apply_patch`) can be removed [doc, verify]. | Plans have 5-hour and weekly windows and a running turn may finish [doc]. Exact error text or event: [verify]. Only "You've hit your usage limit." seen, in third-party issue titles. | Does the server emit an MCP call before running it (needed to end the segment as D4 does)? Full lockdown. Terms for a self-hosted wrapper on a ChatGPT plan. Is there a call that reads remaining limits? |
| **Grok CLI** (Grok Build) | Browser sign-in or `--device-auth`. `XAI_API_KEY` also works but is metered, so never first [doc]. | Headless `grok -p` with `--output-format streaming-json`, or `grok agent stdio` (Agent Client Protocol) [doc]. MCP servers come from a TOML config file; no per-run flag is documented [doc]. Loaders that read Claude or Cursor configs exist [doc], so an isolated config directory is mandatory. | Not found in the pages read [verify]. | Per-run MCP config. Can built-in tools be disabled? Limit shape. Terms for subscription use by a third-party app. Which plans include Grok Build. |
| **Ollama** (local, free) | None; a local server [doc]. | FreeDuet runs the loop itself over the OpenAI-compatible API: tools and streaming are supported, `tool_choice` is not [doc]. The model sees only the function schemas we send, so it has no host tools by construction. A call ends the segment (D4). | No vendor limit. Failures are server down, model not loaded, timeout, out of memory; no reset time, so the one-minute default applies. `/api/tags` lists installed models, which is not liveness [doc]. | Tool-calling quality per model (the docs list none), so tier C until evals say otherwise. Speed on the person's hardware. Context size for transcript replay. |
| **API keys**, always last (`anthropic-api`, `openai-compatible`) | The person's own key, metered, off by default, capped [code: `engines.py`]. | Same function-calling loop as Ollama. | HTTP 429 with `Retry-After`, or a credits-exhausted body; a bare 429 is a rate limit, not an exhausted quota (Nexus classifier). | Each provider's exact "out of credits" body [verify]. Whether to offer keys in v0.2 at all. |

Notes. (1) Codex and Grok start the existing stdio bridge as their MCP server, so no new tool code is written; their approvals are not trusted, the gate stays at OpenBot. (2) Lockdown proof is a test, not a claim: for every CLI engine a test starts it against a fake bridge with a prompt that asks for a shell command and a file write, and fails if either happens. No proof, no offer. (3) Ollama is first because it needs no login, has no terms risk and is locked down by design; it also unlocks the assistants chain.

## 5. The chain

**Config.** Per member in `engines.yaml` [code]: ordered list, logins first, tier floor. New: per engine `capabilities` and a context size, so "the next engine must cover what the turn needs" (ARCH 3.3 rule 2) can be checked; `engines.py` has no context-size field today [code].

**Engine states** (Nexus's four, adapted):

| State | Meaning | Enters when | Leaves when |
|---|---|---|---|
| Ready | Tried in chain order | Start, or a turn succeeds | A failure |
| Degraded | Still tried, after healthy ones, shorter timeout | Timeouts or transient errors below the trip weight | Successes, or it trips |
| Open | Skipped | A limit: until the engine's reset time. No time given: one minute (ARCH rule 5), growing on repeats up to a cap [to decide] | The time passes |
| Half-open | The next real turn is the probe | Open time passed | Success, then Ready. Failure before the engine accepted the turn, then Open again and the turn moves on at no cost |
| Signed out | Not a timer: needs the person | `is_sign_in_failure`, or `probe()` | `probe()` sees a signed-in engine; the person was told "sign in to X" |

**Switch rules.**

| Situation | Rule |
|---|---|
| Limit or error before the engine accepted the turn (no output, no tool call, no approval question) | Move to the next engine in the same turn and show the switch (ARCH rule 1). |
| Limit after output started | Never re-run. Show what arrived and the error, and offer "Continue on <engine>", which starts a new turn from the transcript. The person decides. |
| A tool call already ran and was approved | It ran once; the transcript carries its result and tells the model "never repeat a call that already has a result" [code: `transcript.py`]. A switch is allowed only at that segment boundary, before the new segment produces output, and every write still meets the gate. Open risk: D27 sends a new email without a card when the person typed every recipient in the latest message, so a repeated send after a switch could slip through. The server check should refuse the shortcut when an equal send already completed in the turn [verify in code; maintainer decision]. |
| Approval pending | The turn waits at OpenBot, not on an engine; the next segment goes to whichever engine is Ready. |
| Below the member's quality tier | The chain skips the engine for that turn; if none is left the tool refuses and says why (Jules, purchases). |
| Unattended turns (routines, check-ins) | Same rules; the switch is written into the report. Metered engines never turn on by themselves. |
| Loop guard | At most two switches per turn, then a plain message. |

**What the person sees.** One line per switch in the conversation ("Switched to Codex because Claude's weekly limit resets Thursday 09:00", ARCH rule 4). The Engines page: installed, signed in, state, limited until, last error, no account details (ARCH 2.4). When every engine is limited: the earliest reset and "your message is kept". The conversation keeps its main engine and tries it again on the next message unless it is Open (ARCH rule 6). A switch replays the whole transcript on the new engine (D6); long ones use the checkpoint handoff (F14), and an engine whose window cannot hold it is skipped [assumed].

## 6. Deterministic-first routing for Iris

Nexus's order is rule, then model, then heuristic with a reason. For Iris, candidates [assumed; Iris's real traffic is not measured]:

| Request | Without a model call | Rule | Risk |
|---|---|---|---|
| Starts with a member's name ("Leo, ...") | Hand to that member | Name or id is the first token, followed by a comma or colon | "Otto" as a person's name; "Wren, no, ask Leo". First token only. |
| A skill chip picked in the message box | Already deterministic [code: the chip's text goes in front of the run] | None | None |
| "Which engine are you on?", "why did you switch?", "what is limited?" | Answer from engine state | Whole message equals a fixed phrase | A paraphrase falls through to the model, which is fine. Show the time of the state. |
| Savings and usage questions | Answer from the ledger, labelled "estimate" | Same | Numbers must come from the ledger only. |
| "thanks", "ok" | No model turn | Whole message only | "ok, send it" is an instruction; never match a prefix. |

Never by rule: anything that sends, buys, pays, deletes, books or shares; multi-clause requests; a member name anywhere but the start. Uncertain or two rules disagree: the model decides.

Measure before turning on. (1) A labelled set of Iris requests in `evals/team/`, synthetic only (the repository is public), each marked with its right handler or "must go to the model". (2) Shadow mode on the maintainer's own stack: the rule logs its id and what it would have done, never the text, and Iris still answers; compare afterwards. (3) Proposed gate: precision on routed requests at least 99%, zero action requests short-circuited, coverage reported as it is. If coverage is small the live switch is not built; that is a valid outcome. (4) Live only behind a setting, off by default, switchable per rule.

## 7. Savings meter

Reuse from `CostTracker`: one append-only record per call (when, who asked, engine, model, tokens in and out, cost); sums by member, engine and day; a write that never blocks or fails the call. Change: Postgres table `freeduet_usage` (ARCH 2.3) instead of a file; `source` says `reported` or `estimated`; `api_equivalent_cost` comes from the person's dated `prices.yaml` and an unknown model price shows "not measured", never zero; Nexus's layer names and provider ids are dropped. Add two counters the person cares about: limits hit and switches made. Whether Codex and Grok report tokens at all is [verify]; where they do not, the meter counts turns and says so. Adding an enum value to Postgres breaks `tests/schema.test.ts` [code], so the table uses text columns.

## 8. Lessons from Nexus's failures, as rules

Nexus's private problem log records these; they are summarised here, not quoted.

| Rule | Test that keeps it true |
|---|---|
| Every engine call has a hard timeout enforced by the router (kill the process), not only by the engine: first output, and whole turn. `probe()` too. | Fake engine that hangs: the turn ends and the next engine is tried. |
| Tests start from clean state: no breaker file shared between tests, a temp directory and a fake clock for each, no test touches a real engine or a real login. | The suite passes in any order, twice in a row. |
| No long autonomous pipelines. A turn is one engine and its segments; at most two switches; a routine cannot chain turns past its existing limits. | A fake chain that always fails ends after two switches. |
| A catalogue listing is not liveness; a bare 429 is not a quota. | `probe()` against a fake server that lists a model but never answers. |
| A routing rule ships only after it was measured (section 6). | The shadow report exists before the setting does. |
| Failure paths are tested, not only success: limit during output, signed out, killed child, bridge down. | Fixtures like `usage_limit.jsonl` and `not_signed_in.jsonl`, one per engine. |

## 9. Work plan

One PR each, in this order. "E" numbers are the open decisions in 9.2 (M1_PLAN keeps its own D numbers).

### 9.1 Slices

| # | Slice | Ships | Proof | Needs | Size |
|---|---|---|---|---|---|
| 1 | Adapter seam | `EngineAdapter` interface (ARCH 3.1); Claude moved behind it; no behaviour change | Existing pytest suite unchanged; AG-UI output byte-identical on recorded fixtures | none | M |
| 2 | Engine state and detection | Breaker (section 5), classifier port, `probe()`, persisted limited-until, read-only `GET /api/freeduet/engines`, NOTICE rows | Fake-clock unit tests from Nexus's cases; limit and sign-in fixtures | 1; decisions E6, E9 | M |
| 3 | Chain in the member path | Pick the engine per turn, the switch rules, notices, quality floor, loop guard; Claude plus a second fake engine (generalise `tests/fake_claude.py`) | Limit before output switches; after output it does not; tool-boundary case; approvals unchanged; Claude evals unchanged | 1, 2; decisions E4, E5 | L |
| 4 | Engines page in the app | Page reading the API; plain switch lines | App tests | 2 | S |
| 5 | Eval runner selects the engine | `--engine` really sets the member's chain on the eval stack | Runner tests; a Claude run reproduces its certified score | 3 | M |
| 6 | Ollama adapter (free) | OpenAI-compatible loop with in-band tool calls (M1_PLAN D4), probe with a real tiny generation, tier C, assistants reuse it | Fake-server tests; then each member at least 90% and safety 100% on a named local model before it is offered | 3, 5; decision E3 | M |
| 7 | Codex spike, then adapter | Spike: written findings on a disposable machine (limit shape, tool-call event, lockdown, sign-in route). Adapter after. | Lockdown test of section 4; fixtures; evals at the thresholds | 3, 5; decisions E1, E2 | S, then L |
| 8 | Grok spike, then adapter | Same shape as slice 7 | Same | 3, 5; decision E2 | S, then M |
| 9 | Metered keys, last in chains | `anthropic-api` and `openai-compatible`, HTTP classifier path, caps | Cap tests; never first; off by default | 3; decision E7 | M |
| 10 | Ledger and savings card | `freeduet_usage`, usage events from the router, the card | Server and app tests; numbers match fixtures | 3 (and 6 or 7 for real data); decision E8 | L |
| 11 | Iris routing, shadow only | Labelled set, rules, shadow log, report | Section 6 gate | 3; decision E10 | M |

Slices 6 to 8 are independent after slice 5 and can run in parallel. Rough total: 3 L, 7 M and 3 S (two of the S are the spikes). The first useful result, Claude with a local fallback (slices 1 to 6), is 1 L, 4 M and 1 S.

### 9.2 Open decisions for the maintainer

| # | Decision | Recommendation |
|---|---|---|
| E1 | Codex sign-in: Codex's own login in a volume FreeDuet never opens, or the ChatGPT token program where the app holds the token | The first; the second breaks rule 1 unless he makes an explicit exception |
| E2 | Offer Codex and Grok at all until their terms for a self-hosted wrapper are read and confirmed | Not before the spikes report |
| E3 | Which local models and how much hardware count as supported | Tier C by default; list only models that pass the evals |
| E4 | After a limit mid-answer: a "Continue on <engine>" choice, or automatic at the next segment boundary | The choice |
| E5 | D27 (no card for an email to addresses the person typed) after a switch | Refuse the shortcut when an equal send already completed |
| E6 | Where limited-until is stored | A file in agent-freeduet's volume |
| E7 | Metered keys in v0.2 | Defer; Claude, Codex and a local model already make a chain |
| E8 | When the ledger and savings card ship (ARCH puts them in M3) | After slice 6 or 7, so there is real data |
| E9 | NOTICE rows and Apache text for ported Nexus files | Approve; he owns the copyright |
| E10 | Build Iris shadow routing, or drop it | Build the shadow only; decide on its coverage |

## 10. Sources

[doc] Codex: `https://developers.openai.com/codex/app-server`, `/codex/noninteractive`, `/codex/config-reference`, `/codex/pricing`, `/siwc/token-sharing-open-source/codex-app-server` (these redirect to learn.chatgpt.com). The help article on using Codex with a ChatGPT plan could not be fetched, so limit wording stays [verify]. Grok Build: `https://docs.x.ai/build/cli/reference`, `/build/cli/headless-scripting`, `/build/features/mcp-servers`, `/build/overview`. Ollama: `https://docs.ollama.com/api/openai-compatibility`, `/capabilities/tool-calling`, `/api/tags`. Claude Code: `https://code.claude.com/docs/en/legal-and-compliance`. Vendor pages change; a slice that depends on one re-reads it first.
