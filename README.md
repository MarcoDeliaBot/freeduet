# FreeDuet

**A self-hosted team of AI employees that runs on the AI subscriptions you already pay for, and never stops working.**

FreeDuet gives you a Chief of Staff and a crew of specialists: inbox, contracts, invoices, purchases and bookings, writing, repairs and meals. Each one has its own computer and browser. They ask before they send, pay, sign, book or delete anything. When one subscription hits its limit, the work moves to the next one. Pay-per-token APIs are optional and always capped.

> **Status: pre-alpha, design stage.** This repository currently holds the specification, the team definitions and the build plan on top of [OpenDuet](https://github.com/CopilotKit/OpenDuet). Nothing here is production-ready yet. See the [roadmap](#roadmap).

> FreeDuet is an independent open-source project. It is **not affiliated with, endorsed by or sponsored by** Anthropic, OpenAI, Google, xAI, Z.ai or CopilotKit. Claude, Duet, ChatGPT, Codex, Gemini and Grok are trademarks of their respective owners and are named here only to describe compatibility.

---

## Why FreeDuet

| | What it means for you |
|---|---|
| **Your subscriptions first** | Agents run on the official command-line tools you already pay for and sign in to yourself (Claude Code, Codex, and more as providers allow it). FreeDuet never sees, stores or forwards your subscription credentials. |
| **Never stops** | Each agent has an engine chain. When one subscription reaches its limit, the next one takes over. Metered APIs join the chain only if you allow it, with daily and monthly caps. |
| **Savings meter** | See what your team's work would have cost at pay-per-token prices, compared with what you actually paid. |
| **A real team** | A Chief of Staff splits your request, hands each part to the right specialist, follows up and brings back one answer. |
| **Its own computer** | Every agent works in its own isolated browser. It can shop, book and fill in forms. Payments need your approval for the exact cart and never exceed your spending cap. |
| **Yours** | Self-hosted, MIT-licensed, any language, any model: Claude, GPT, Gemini, GLM, anything on OpenRouter, or local models through Ollama. |

## What we do that others don't

| | **FreeDuet** | Claude Duet | OpenDuet / OpenBot | open-duet | openbot (nightly-labs) |
|---|---|---|---|---|---|
| Open source, free for business use | ✅ | ❌ | ✅ | ✅ | ❌ |
| Available outside the United States | ✅ | ❌ | ✅ | ✅ | ✅ |
| Runs on your subscriptions with zero API keys | ✅ v0.1 | ✅ Claude only | ⚠️ | ✅ | ✅ |
| Switches subscription automatically at the limit | ✅ v0.3 | ❌ | ❌ | ⚠️ | — |
| Own computer with a real browser per agent | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Asks before every send, payment, signature, deletion | ✅ | ✅ | ✅ | ✅ | ❌ |
| Payments blocked without a permit bound to shop and total | ✅ v0.4 | — | ❌ | ❌ | ❌ |
| Spending caps per purchase, day and month | ✅ v0.4 | — | ❌ | ❌ | ❌ |
| Ready-made, tested team with a Chief of Staff | ✅ | ❌ | ⚠️ | ❌ | — |

✅ yes · ⚠️ partly · ❌ no · — not documented. A version means planned, not available yet. Full table with sources: [docs/COMPARISON.md](docs/COMPARISON.md).

## Meet the team

| | Name | Role | Typical request |
|---|---|---|---|
| 🧭 | **Iris** | Chief of Staff | "Handle everything that came in this morning." |
| 🛠️ | **Leo** | Creator: designs new team members | "I need someone who tracks my domain renewals." |
| 📬 | **Otto** | Inbox | "Sort my mail and draft the replies that matter." |
| ⚖️ | **Portia** | Counsel | "Can I sign this lease?" |
| 🧾 | **Penny** | Bookkeeper | "Invoice Acme for last week's work and list who still owes me." |
| 🛎️ | **Jules** | Concierge | "Book a table for four on Friday" · "Find flights to Lisbon under €300." |
| ✍️ | **Wren** | Writer | "Turn this voice note into a LinkedIn post in my style." |
| 🔧 | **Gus** | Fixer | "The office door won't latch. Here's a photo." |
| 🍳 | **Basil** | Chef | "Here's my fridge. What can I make that uses up the spinach?" |
| 🔍 | **Vera** | Reviewer: checks important work before it reaches you | Works behind the scenes: Iris sends her every invoice, contract review, post and cart. |

Every member has one job, a fixed answer format, and hard rules it never breaks. You can rename them, change their voice, or ask Leo to design new ones. Full profiles are in [docs/TEAM.md](docs/TEAM.md); the definitions are in [openbot/examples/freeduet/agents.yaml](openbot/examples/freeduet/agents.yaml).

## Works with your tools

Google suite, Microsoft 365, n8n, Photoshop, Affinity, Canva, the free ArtCraft suite (PhotoCraft, PdfCraft, VectorCraft, FilmCraft and 12 more, built into every member's computer), Cricut, 3D-printing slicers, Claude Code, Codex, Kimi, Cline, Antigravity, Trae, WhatsApp, Telegram, Slack and Teams, free and paid. Official connectors first, then the browser, then screen control on your own computer, only for the programs you switch on. The catalogue, with the status of each tool: [docs/CONNECTORS.md](docs/CONNECTORS.md).

## How it works

```
 You (web, phone, Slack, Teams)
        │
        ▼
 FreeDuet server ── approvals · audit · spending caps · savings ledger
        │
        ├── Iris, Chief of Staff ── delegates ──► Otto · Portia · Penny · Jules · Wren · Gus · Basil
        │                         └── checks with Vera, Reviewer, before you see the result
        │
        ▼
 Subscription router (agent-freeduet)
        ├── Claude Code   (your Claude plan, your login)
        ├── Codex         (your ChatGPT plan, your login)
        ├── API engines   (Anthropic, OpenAI, Gemini, GLM, OpenRouter): optional, capped
        └── Local models  (Ollama, LM Studio)
        │
        ▼
 Each agent's own computer: isolated browser, files, shell
```

The details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Which subscriptions work

Provider terms change. FreeDuet only ships routes that the provider's own terms allow, and re-checks them for every release.

| Provider | Route | Default |
|---|---|---|
| Claude (Pro, Max, Ultra, Team) | Official Claude Code, signed in by you | **On** |
| Claude monthly API credits (Max, Ultra, Team) | API key from your linked Console organization | **Off**: optional, always last |
| ChatGPT plans | Codex app-server via OpenAI's official "Sign in with ChatGPT" program | **On** once approved |
| Gemini (Google AI Pro, Ultra) | Not allowed through third-party software today | **Off**: use a Gemini API key |
| GLM Coding Plan | Only inside the provider's listed tools | **Off** until verified: use a GLM API key |
| OpenRouter, any OpenAI-compatible API | API key | Optional, capped |
| Local models (Ollama, LM Studio) | Your hardware | Optional |

Sources and the exact rules are in [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Quick start (planned for v0.1)

```bash
git clone https://github.com/<owner>/freeduet.git
cd freeduet
cp .env.example .env
bash scripts/start.sh                              # the app, the team, one computer per member
docker compose exec -it agent-freeduet claude      # sign in once with your own Claude plan
```

Then open `http://localhost:3010`. No API key needed. Linux, macOS and Windows (WSL2) with Docker.

## Roadmap

| Version | Name | What you get |
|---|---|---|
| v0.1 | The team on your login | The ten members on your own Claude login, no API key, with approvals and evals |
| v0.2 | More subscriptions | Codex with your ChatGPT plan, local models, optional API keys always last, Engines page |
| v0.3 | Never stops | Engine chains, spending caps, the savings meter, real delegation between members |
| v0.4 | Safe purchases | Purchase permits, spending caps per agent, take-over on logins and captchas |
| v1.0 | Launch | Grok Bot import, one-command install, docs site |

The full plan, with acceptance criteria for each milestone, is in [docs/PROJECT.md](docs/PROJECT.md).

## Built on

- [OpenDuet](https://github.com/CopilotKit/OpenDuet) and [OpenBot](https://github.com/CopilotKit/openbot) by CopilotKit (MIT): the server, the app, a computer per agent, approvals, audit and the morning brief.
- Engine-adapter design from [open-duet](https://github.com/Anil-matcha/open-duet) by Anil Matcha (Apache-2.0).

See [NOTICE.md](NOTICE.md) for attributions and what we deliberately did **not** reuse.

## Contributing · Security · License

- [CONTRIBUTING.md](CONTRIBUTING.md): upstream-first, signed-off commits, no credentials or private data ever.
- [SECURITY.md](SECURITY.md): threat model and how to report a vulnerability privately.
- [MIT](LICENSE). Ported Apache-2.0 files keep their license header.

FreeDuet's agents can make mistakes. Review what they prepare before you approve it, especially payments, bookings and anything sent in your name. Portia and Penny give first reviews, not legal, tax or financial advice.
