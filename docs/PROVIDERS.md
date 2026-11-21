# Subscriptions, API keys and provider terms

FreeDuet's promise is "use the subscriptions you already pay for". That promise is only worth something if it never gets a user's account suspended. This page is the rulebook. **It is re-verified before every release**, and each route has a kill switch in `openbot/agent-freeduet/engines.yaml`, your own copy of `engines.example.yaml` (the default name; the repository ships only the example).

_Last verified: 2026-11-12._

## The first rule: logins first

FreeDuet runs on the subscriptions the person signed in to. API keys and API credits, including the credits that come with a Claude plan, are **never the first choice by default**: they are off by default, the person switches them on, and the router runs them only after every login engine in the chain, under the person's caps.

**The person's own order (D115, 21 November 2026).** The order is the person's to choose, so FreeDuet shows a warning and asks for a confirmation and never imposes its own choice. On the Engines page the person may put a free engine before a login, or a paid engine before a free engine or a login, for one member. The page then says what it means (a free cloud engine answers first and the member's messages go to that provider, D101; its answers may differ in quality; a paid engine may cost money from the first message), and the move is made only after the person ticks "I understand, use this order" and presses Confirm. That member is then named in `own_order:` in the engines file and keeps the order as written; every other chain, the `default` one included, stays sorted logins first. A confirmed order switches nothing on: a paid engine still runs only when `metered:` is on with both caps above 0 and, for a gateway, the conditions of rule 4.

## The five rules FreeDuet never breaks

1. **FreeDuet never collects, stores or forwards subscription credentials or session tokens.** The person signs in to the provider's own, unmodified tool through the provider's own sign-in flow. FreeDuet only starts that tool and reads its output.
2. **One person, one login.** No account sharing, no pooling of plans across users. A FreeDuet install shared by a team uses one login per person, or API keys.
3. **Official tools only, unmodified.** No patched binaries, no removed authentication methods, no reverse-engineered endpoints.
4. **Metered APIs are opt-in, last by default and capped.** They join an engine chain only if the person enabled them, after every login engine unless the person confirmed another order for that member (D115, above), with daily and monthly caps. Until the usage ledger exists ([ENGINES_PLAN.md](ENGINES_PLAN.md) slice 12) the caps cannot be enforced, and caps that are written and not enforced must not let money be spent, so **no metered engine runs**: no direct API engine exists yet, and a metered gateway the person switched on is refused, whatever the `metered:` block says. The service says so in plain words in its log, in chat and in its engine list, and does not start it. The block is still read and checked, so the file format does not change when the ledger arrives. `billing` is the person's own statement, because FreeDuet cannot see what an endpoint charges.
5. **When a provider's terms are unclear, the route ships off.** It can be switched on only after the terms are clarified in writing.

## Status by provider

| Provider | Subscription route | What the provider says | FreeDuet default |
|---|---|---|---|
| **Anthropic, Claude Pro, Max, Ultra, Team** | The unmodified Claude Code CLI, signed in by the person with their own account; FreeDuet starts it and reads its stream. | Developers may not offer Claude.ai login in their apps or route requests through plan credentials on users' behalf, and may not collect, store or intermediate Claude.ai credentials or session tokens. This does **not** prevent an end user from signing in to the unmodified Claude Code binary with their own subscription, including where a platform hosts Claude Code. Plan limits assume ordinary individual use. | **On** |
| **Anthropic, monthly API credits** | An API key from the Console organization linked under claude.ai > Settings > Billing > API credits. | Included with Max ($100/month), Ultra ($200/month) and Team (pooled, up to $500/month). They cover the Claude API and the Agent SDK, do not roll over, and requests stop when they run out, with no charge to the plan. | **Off.** Optional, the person's choice, last in a chain unless the person confirmed another order |
| **Anthropic, OpenBot's `CLAUDE_CODE_OAUTH_TOKEN` option** | The app stores a plan token minted with `claude setup-token`. | Conflicts with "may not collect, store or intermediate" plan tokens. | **Removed** in FreeDuet |
| **OpenAI, ChatGPT plans** | Codex app-server, signed in through Codex's own official login, which FreeDuet never reads. | Not checked yet. OpenAI's terms for Codex's own login are checked before the route is offered. | **Off** until both checks pass: a hands-on check of its limits, tool calls and lockdown, and the terms check. Until then, Codex with the person's own local login is marked experimental. |
| **Google, Gemini via Google AI Pro or Ultra** | Gemini CLI or Antigravity CLI. | Gemini CLI's terms state that directly accessing the services behind Gemini CLI with third-party software, for example through its OAuth, violates the terms and can lead to suspension. Whether an orchestrator may drive the official CLI headless is an open question on Google's forum. Gemini CLI was replaced by Antigravity CLI for unpaid and Google One users on 2026-06-18. | **Off.** Use a Gemini API key. |
| **Z.ai, GLM Coding Plan** | Only inside the tools on Z.ai's supported-tools list. | The plan may only be used within the listed tools; benefits are for the subscriber only; violations can lead to restrictions or a ban. | **Off** until FreeDuet's route is on the list. A GLM API key works through the OpenAI-compatible engine. |
| **xAI, Grok** | Grok Build CLI with the person's own login, the route OpenMausBot uses. | Not verified yet. | **Off** until verified. API key works. |
| **Moonshot, Kimi** | Kimi's CLI with the person's own login. | Not verified yet. | **Off** until verified. The OpenAI-compatible API works with a key. |
| **OpenRouter** and any OpenAI-compatible API | API key. | Metered by the provider. | Optional, capped |
| **A gateway or a router that speaks Anthropic's API** (OpenRouter, or a free router you run yourself) | The unmodified Claude Code CLI, pointed at the address in your `engines.yaml` (a copy of `engines.example.yaml`), with the person's own key at that address. It runs in an empty home, so no Claude credential is near it. | Anthropic does not endorse, maintain or audit third-party gateway products and does not support routing Claude Code to non-Claude models through any gateway. OpenRouter says Claude Code with it is only guaranteed to work with the Anthropic first-party provider. Prices, limits and terms are the gateway's. Both pages read 2026-11-14. | **Off.** Commented out in `engines.example.yaml`, never first in a chain, tier C until the evals say otherwise. A free one may be a later link; a metered one is refused for now (rule 4) |
| **Local models** (Ollama, LM Studio, vLLM) | Ollama: the unmodified Claude Code CLI pointed at Ollama's Anthropic-compatible address on your hardware, with no key (`no_key: true`; built and off, see the row above). LM Studio and vLLM: no route checked yet. | No provider terms. | Optional |
| **Free cloud tiers**: Cloudflare Workers AI, Google AI Studio (Gemini), Groq, Cerebras, Mistral, OpenRouter's `:free` models | An API key from the provider's free plan. Most speak the OpenAI format, which members cannot use yet (D100); a router you run can put them behind an Anthropic-compatible address. | **OpenRouter, read 2026-11-20:** `https://openrouter.ai/api` accepts Anthropic Messages format ([Claude Code integration](https://openrouter.ai/docs/guides/coding-agents/claude-code-integration)); `:free` models and the `openrouter/free` router cost nothing, with 20 requests a minute and 50 a day (1,000 a day after buying 10 credits) ([limits](https://openrouter.ai/docs/api-reference/limits)); a `:free` model in a fallback list can bill a paid model ([free variant](https://www.openrouter.ai/docs/guides/routing/model-variants/free)), so FreeDuet refuses an OpenRouter entry that says free unless it names one `:free` model or `openrouter/free`, and sends no fallback list; upstream providers may log or train on prompts, and the OpenRouter account has a setting to exclude providers that train on free-model prompts ([provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)). Not checked yet: Cloudflare Workers AI, Google AI Studio, Groq, Cerebras, Mistral. Free tiers have daily limits, change often, and some may use what they are sent to improve their models. | **Off.** OpenRouter's is the entry `openrouter-free-claude` in `engines.example.yaml` (D107), in no chain. The person may add one to any member's chain after a warning (D101); never first in a chain. |

## CopilotKit Intelligence (optional)

FreeDuet does not need a CopilotKit key. `FREEDUET_INTELLIGENCE` in `openbot/.env.example` picks where conversations and memory are kept. The default is `off` in the files FreeDuet writes (`.env.example` and `scripts/start.sh`), decision D20 in [M1_PLAN.md](M1_PLAN.md). The server itself has no default: since 17 November 2026 (D65) it refuses to start when the line is missing, and says to write `off` or `on`. The desktop app writes `off` when its settings hold no value (D67, 17 November 2026, never over a value the person wrote), and the Helm chart writes `on`, as it always ran with Intelligence; the chart's default is not decided.

| Setting | Conversations and memory | Cost | What you give up or need |
|---|---|---|---|
| `off` (what `.env.example` and `start.sh` write) | Kept in FreeDuet's own Postgres. Nothing is sent to CopilotKit. | Free. No key. | Memory is a text match, not semantic. Learned skills are off. Conversations already in Intelligence are not imported. Live tail works in one server process only. |
| `on` | Kept in CopilotKit Intelligence, which also holds a copy of user memories, browser trajectories and product analytics. | Free hosted tier: 1,000 interactions per organization per month. Pay as you go: $49 per month for 10,000. Self-hosted Developer Edition: non-production only, with a renewable 30-day licence. | Needs `INTELLIGENCE_API_URL`, `INTELLIGENCE_GATEWAY_WS_URL` and `INTELLIGENCE_API_KEY`. Switching does not move conversations. |

Prices are as of November 2026, from CopilotKit's pricing page. Check the page before you choose a plan.

## Practical notes

- **What each person runs on.** A Claude subscriber runs FreeDuet from v0.1 on Claude Code with their own login, with no API key at all. A ChatGPT subscriber gets the Codex route, through Codex's own login, once both checks in the table above pass. Everybody else uses a local model, or an API key they choose to add.
- **API credits are a safety net, not the engine.** The API credits included in Max, Ultra and Team can be switched on as the last step of a chain, for when every login is at its limit.
- **Free routers on your own computer.** A router you run yourself that puts one address and one key in front of several free providers may be a later link in a chain (decision E3 in [ENGINES_PLAN.md](ENGINES_PLAN.md)), never the first and never on by default. Its models and their tool calling are not Claude's, so it is tier C and the quality floor applies. Free quotas change without notice, and the terms of the providers behind it are yours to respect. FreeDuet neither ships nor installs one.
- **Quality floor for money.** Jules (purchases and bookings) refuses to reach a checkout on an engine below the quality tier set in your `engines.yaml` (a copy of `engines.example.yaml`), so a small local model can research but cannot buy.
- **Hosted FreeDuet is a different product.** Running FreeDuet for other people, or paying for their usage, falls under each provider's commercial terms. Anthropic, for example, requires its Commercial Terms for products that run Claude Code, and forbids paying for, reselling or intermediating end users' usage. FreeDuet tells the two apart by the server setting `FREEDUET_DEPLOYMENT`: with `hosted`, the server never offers or accepts a Claude plan's sign-in path; unset means a person's own installation.

## Actions to take before launch

| Action | Owner | Status |
|---|---|---|
| Check OpenAI's terms for Codex's own login, and run the hands-on check of its limits, tool calls and lockdown | Maintainer | To do |
| Ask Z.ai whether FreeDuet can be added to the supported-tools list | Maintainer | To do |
| Ask Google, on the Gemini developer forum, whether driving the official CLI headless from a self-hosted orchestrator is allowed | Maintainer | To do |
| Check xAI's terms for Grok CLI | Maintainer | To do |
| Ask Anthropic, in writing, whether a third-party app may carry the one-time code from Claude's sign-in page to its own unmodified Claude Code binary running on the same person's computer (first-start design, decision D1). Until the answer, FreeDuet carries no code: the card shows the command and the person pastes the code in a terminal. A box on the card is built only behind a setting that is off by default | Maintainer | To do |
| Re-read every source on this page and update the date | Release checklist | Every release |

## Sources

- Anthropic, Claude Code legal and compliance: https://code.claude.com/docs/en/legal-and-compliance
- Anthropic, monthly API credits for Max, Ultra and Team: https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans
- Anthropic, Claude Code with other LLM gateways (read 2026-11-14): https://code.claude.com/docs/en/llm-gateway
- OpenRouter, Claude Code integration (read 2026-11-14): https://openrouter.ai/docs/guides/guides/claude-code-integration
- OpenRouter, Claude Code integration, limits, free variant and provider logging (read 2026-11-20): https://openrouter.ai/docs/guides/coding-agents/claude-code-integration, https://openrouter.ai/docs/api-reference/limits, https://www.openrouter.ai/docs/guides/routing/model-variants/free, https://openrouter.ai/docs/guides/privacy/provider-logging
- Google, Gemini CLI terms and privacy: https://www.geminicli.com/docs/resources/tos-privacy
- Z.ai, GLM Coding Plan usage policy: https://docs.z.ai/devpack/usage-policy
