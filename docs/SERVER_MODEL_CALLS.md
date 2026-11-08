# Server-side model calls

Every place where the OpenBot server, underneath FreeDuet, calls a language model on its own. M1 routes each of them through the subscription router (`openbot/agent-freeduet`), so FreeDuet works with zero API keys ([PROJECT.md](PROJECT.md), M1).

_Inventory made in M0 on 2026-11-08. Paths are relative to `openbot/server/src`; line numbers drift, function names do not._

## Summary

| | |
|---|---|
| Direct model calls the server makes itself | **6**, plus **1** availability probe at start-up |
| Calls that work today without an API key | **0**. Each one fails quietly or falls back (table below) |
| Embedding calls | **None**. The old vector column was dropped in `server/drizzle/0010_drop_the_document_index.sql` |
| Model libraries in the server | None: no Anthropic or OpenAI SDK, no LangChain, no Vercel AI SDK calls. Every direct call is a plain `fetch` |
| Chat turns of built-in members | Run inside the server process, on the same model and key (section 2) |

## 1. Direct calls

All but the titler and the voice summary go through one function, `createModelCompleter` (`routing/model.ts`): Anthropic's Messages API or an OpenAI-compatible `/chat/completions`, a 10-second timeout, the model from `model.yaml` (`default_model`) and the key from `resolveModelApiKey` (`credentials.ts`: the stored key named by `credential_secret_ref`, otherwise `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).

| # | Call | What it does | On by default | Without a key | M1 routing |
|---|---|---|---|---|---|
| A1 | `plugins/selection.ts` `selectTools`, from `copilot.ts` before every run | Picks which skills' tools to offer a member | Yes, when a member has more than 12 tools and skills that declare tools | Every tool is offered | Router, any engine; an assistant (free) is enough |
| A2 | `routing/classify.ts` `createIntentRouter`, behind `POST /api/route` | Picks the member for a message with no @mention | Yes, when more than one member could answer | Goes to the default member (Iris) | Router, any engine; an assistant is enough |
| A3 | `approvals/policy.ts` `reviewAction`, from `decideAction` | **Auto-review of every action that changes something**: proceed, ask the person, or hand off | Yes (`autoReview: true`, `approvals/store.ts`) | Fails closed: the person is asked about every action | Router, **tier A only, never an assistant**. This call decides when the person is asked |
| A4 | `openduet/triage.ts` `triage`, from `openduet/brief.ts` `buildMorningBrief` | Sorts each email of the morning brief into "needs you" and "can wait" (up to 50, 8 at a time, after fixed rules) | Yes, whenever the morning brief runs | Listed as "Could not be sorted" under "needs you" | Router; an assistant (free) is enough |
| A5 | `channels/titler.ts` `createChannelTitler`, loop every 10 seconds in `index.ts` | Names conversations in the sidebar | Yes | Nothing is named | Router; an assistant is enough |
| A6 | `voice/summary.ts` `createVoiceSummarizer` | One or two sentences summing up a voice chat | Only when voice is set up (`VOICE_*`) | No summary | Router; an assistant is enough |
| A7 | `model-availability-check.ts` `reportModelAvailability` | Asks the provider, once at start-up, whether the key can use the model. Generates nothing | Yes, when a key is set | Skipped | Replaced by the router's own engine check |

## 2. Chat turns and turns the server starts itself

Built-in members (`type: built-in`, all ten FreeDuet members today) answer inside the server process: `copilot.ts` `builtInAgentConfiguration` hands the CopilotKit runtime the provider, the model and the key. M1 switches every member to `type: remote-ag-ui` on `agent-freeduet` (issue M1.5), which removes these calls from the server.

The server also starts turns on its own, on the same path: proactive research (every 240 minutes by default, `proactive/engine.ts`; `OPENBOT_PROACTIVE_DEFAULTS=false` stops it), check-ins, the daily morning brief turn, the first-day greeting, started tasks, a new channel's hello, routines, responsibilities, wake-ups, group channels, resumes after an approval or a question, inbound delivery and hand-offs between members. Once members run on the router, these turns run there too.

## 3. Not the server's own calls

- **Dictation** (`dictation/provider.ts`) and **live voice** (`voice/provider.ts`): off unless `TRANSCRIPTION_*` or `VOICE_*` is set; they use their own keys.
- **Provider OAuth proxy** (`provider-oauth.ts`): only with `OPENBOT_MODEL_OAUTH_FILE`, written by the desktop app, which FreeDuet does not ship.
- **Registering a remote member** (`agents/connection-test.ts`): one test run when a member is added.
- **Memory and learning**: CopilotKit Intelligence, an external service; memory intake uses rules, no model.
- **Evals**: `evals/triage/run.ts` calls the model on purpose, with its own variables.

## 4. What this means

**For the M0 demo.** FreeDuet no longer accepts the Claude plan token (issue M0.5), and the router arrives in M1. So in M0 the members answer only if the server has a model. The person chooses, in their own `.env`, which is never committed:

| Option | Cost | Settings |
|---|---|---|
| A local model with Ollama | Free | `BOT_PROVIDER=openai`, `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_API_KEY=ollama`, `BOT_MODEL=<a model you pulled>` |
| A free model on OpenRouter | Free, within OpenRouter's limits | `BOT_PROVIDER=openai`, `OPENAI_BASE_URL=https://openrouter.ai/api/v1`, `OPENAI_API_KEY=<your key>`, `BOT_MODEL=<a model marked free>` |
| The API credits included in Claude Max, Ultra or Team | Included in the plan, until they run out | `ANTHROPIC_API_KEY=<key from the linked Console organization>` |

Two checks for the free options: built-in members speak OpenAI's Responses API (`/v1/responses`) through the CopilotKit runtime, so the endpoint must support it, and small local models follow tools less reliably. The M0 demo only needs every member to answer; issue M0.9 records which option was used.

**For M1.** Every call in section 1 and every turn in section 2 goes through `agent-freeduet` (issues M1.5 and M1.6). A3 must run on a tier A engine; A1, A2, A4, A5 and A6 can run on the free assistants.

## 5. Found and fixed during the inventory

- **The titler sent the Anthropic API key to OpenAI.** With `provider: anthropic` (FreeDuet's `model.yaml`), `channels/titler.ts` always used the OpenAI format: it sent the Anthropic key, as a bearer token, to `https://api.openai.com/v1/chat/completions` every time it tried to name a conversation. Fixed in M0: the titler now uses Anthropic's own endpoint for an Anthropic key, with tests in `server/tests/channel-titler.test.ts`. To be reported upstream to CopilotKit, with the maintainer's approval.
