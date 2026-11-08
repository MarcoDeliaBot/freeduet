# Subscriptions, API keys and provider terms

FreeDuet's promise is "use the subscriptions you already pay for". That promise is only worth something if it never gets a user's account suspended. This page is the rulebook. **It is re-verified before every release**, and each route has a kill switch in `openbot/agent-freeduet/engines.yaml`.

_Last verified: 2026-11-07._

## The first rule: logins first

FreeDuet always runs on the subscriptions the person signed in to. API keys and API credits, including the credits that come with a Claude plan, are **never the first choice**: they are off by default, the person switches them on, and the router runs them only after every login engine in the chain, under the person's caps.

## The five rules FreeDuet never breaks

1. **FreeDuet never collects, stores or forwards subscription credentials or session tokens.** The person signs in to the provider's own, unmodified tool through the provider's own sign-in flow. FreeDuet only starts that tool and reads its output.
2. **One person, one login.** No account sharing, no pooling of plans across users. A FreeDuet install shared by a team uses one login per person, or API keys.
3. **Official tools only, unmodified.** No patched binaries, no removed authentication methods, no reverse-engineered endpoints.
4. **Metered APIs are opt-in, last and capped.** They join an engine chain only if the person enabled them, always after every login engine, with daily and monthly caps.
5. **When a provider's terms are unclear, the route ships off.** It can be switched on only after the terms are clarified in writing.

## Status by provider

| Provider | Subscription route | What the provider says | FreeDuet default |
|---|---|---|---|
| **Anthropic, Claude Pro, Max, Ultra, Team** | The unmodified Claude Code CLI, signed in by the person with their own account; FreeDuet starts it and reads its stream. | Developers may not offer Claude.ai login in their apps or route requests through plan credentials on users' behalf, and may not collect, store or intermediate Claude.ai credentials or session tokens. This does **not** prevent an end user from signing in to the unmodified Claude Code binary with their own subscription, including where a platform hosts Claude Code. Plan limits assume ordinary individual use. | **On** |
| **Anthropic, monthly API credits** | An API key from the Console organization linked under claude.ai > Settings > Billing > API credits. | Included with Max ($100/month), Ultra ($200/month) and Team (pooled, up to $500/month). They cover the Claude API and the Agent SDK, do not roll over, and requests stop when they run out, with no charge to the plan. | **Off.** Optional, the person's choice, always last in a chain |
| **Anthropic, OpenBot's `CLAUDE_CODE_OAUTH_TOKEN` option** | The app stores a plan token minted with `claude setup-token`. | Conflicts with "may not collect, store or intermediate" plan tokens. | **Removed** in FreeDuet |
| **OpenAI, ChatGPT plans** | Codex app-server. OpenAI documents a "Sign in with ChatGPT" integration for open-source apps that runs `codex app-server` with the user's token. | The integration requires a client ID and is in preview; eligibility for self-hosted apps is confirmed when applying. | **On after approval.** Until then, Codex with the person's own local login is marked experimental. |
| **Google, Gemini via Google AI Pro or Ultra** | Gemini CLI or Antigravity CLI. | Gemini CLI's terms state that directly accessing the services behind Gemini CLI with third-party software, for example through its OAuth, violates the terms and can lead to suspension. Whether an orchestrator may drive the official CLI headless is an open question on Google's forum. Gemini CLI was replaced by Antigravity CLI for unpaid and Google One users on 2026-06-18. | **Off.** Use a Gemini API key. |
| **Z.ai, GLM Coding Plan** | Only inside the tools on Z.ai's supported-tools list. | The plan may only be used within the listed tools; benefits are for the subscriber only; violations can lead to restrictions or a ban. | **Off** until FreeDuet's route is on the list. A GLM API key works through the OpenAI-compatible engine. |
| **xAI, Grok** | Grok Build CLI with the person's own login, the route OpenMausBot uses. | Not verified yet. | **Off** until verified. API key works. |
| **Moonshot, Kimi** | Kimi's CLI with the person's own login. | Not verified yet. | **Off** until verified. The OpenAI-compatible API works with a key. |
| **OpenRouter** and any OpenAI-compatible API | API key. | Metered by the provider. | Optional, capped |
| **Local models** (Ollama, LM Studio, vLLM) | OpenAI-compatible endpoint on your hardware. | No provider terms. | Optional |

## CopilotKit Intelligence (optional)

FreeDuet does not need a CopilotKit key. `FREEDUET_INTELLIGENCE` in `openbot/.env.example` picks where conversations and memory are kept. The default is `off` (decision D20 in [M1_PLAN.md](M1_PLAN.md)).

| Setting | Conversations and memory | Cost | What you give up or need |
|---|---|---|---|
| `off` (default) | Kept in FreeDuet's own Postgres. Nothing is sent to CopilotKit. | Free. No key. | Memory is a text match, not semantic. Learned skills are off. Conversations already in Intelligence are not imported. Live tail works in one server process only. |
| `on` | Kept in CopilotKit Intelligence, which also holds a copy of user memories, browser trajectories and product analytics. | Free hosted tier: 1,000 interactions per organization per month. Pay as you go: $49 per month for 10,000. Self-hosted Developer Edition: non-production only, with a renewable 30-day licence. | Needs `INTELLIGENCE_API_URL`, `INTELLIGENCE_GATEWAY_WS_URL` and `INTELLIGENCE_API_KEY`. Switching does not move conversations. |

Prices are as of November 2026, from CopilotKit's pricing page. Check the page before you choose a plan.

## Practical notes

- **What each person runs on.** A Claude subscriber runs FreeDuet from v0.1 on Claude Code with their own login, with no API key at all. A ChatGPT subscriber gets the Codex route once OpenAI approves FreeDuet's client ID. Everybody else uses a local model, or an API key they choose to add.
- **API credits are a safety net, not the engine.** The API credits included in Max, Ultra and Team can be switched on as the last step of a chain, for when every login is at its limit.
- **Quality floor for money.** Jules (purchases and bookings) refuses to reach a checkout on an engine below the quality tier set in `engines.yaml`, so a small local model can research but cannot buy.
- **Hosted FreeDuet is a different product.** Running FreeDuet for other people, or paying for their usage, falls under each provider's commercial terms. Anthropic, for example, requires its Commercial Terms for products that run Claude Code, and forbids paying for, reselling or intermediating end users' usage.

## Actions to take before launch

| Action | Owner | Status |
|---|---|---|
| Apply for an OpenAI "Sign in with ChatGPT" client ID for FreeDuet | Maintainer | To do |
| Ask Z.ai whether FreeDuet can be added to the supported-tools list | Maintainer | To do |
| Ask Google, on the Gemini developer forum, whether driving the official CLI headless from a self-hosted orchestrator is allowed | Maintainer | To do |
| Check xAI's terms for Grok CLI | Maintainer | To do |
| Re-read every source on this page and update the date | Release checklist | Every release |

## Sources

- Anthropic, Claude Code legal and compliance: https://code.claude.com/docs/en/legal-and-compliance
- Anthropic, monthly API credits for Max, Ultra and Team: https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans
- OpenAI, Sign in with ChatGPT for open-source apps with Codex app-server: https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- Google, Gemini CLI terms and privacy: https://www.geminicli.com/docs/resources/tos-privacy
- Z.ai, GLM Coding Plan usage policy: https://docs.z.ai/devpack/usage-policy
