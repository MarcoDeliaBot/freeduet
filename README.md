# FreeDuet

**A self-hosted team of AI employees that runs on the AI subscriptions you already pay for, and never stops working.**

**Website: [freeduet.com](https://freeduet.com)** (12 languages)

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ffc0cb?style=for-the-badge&logo=github&labelColor=555555)](https://github.com/sponsors/MarcoDeliaBot)

FreeDuet gives you a Chief of Staff and a crew of specialists: inbox, contracts, invoices, purchases and bookings (purchase permits are coming in v0.4), writing, repairs and meals. Each one has its own computer and browser. They ask before they send, pay, sign, book or delete anything. Planned for v0.3: when one subscription hits its limit, the work moves to the next one, and pay-per-token APIs stay optional and always capped.

> **Status: v0.1, an early release.** The ten members run on your own Claude Code login, with approvals, evals and a one-command start. FreeDuet is built and used by one maintainer, on one computer: Windows with WSL2 and Docker. Anything marked v0.2 or later is planned, not built. What is tested and what is not is listed [below](#what-is-tested-and-what-is-not).

> FreeDuet is an independent open-source project. It is **not affiliated with, endorsed by or sponsored by** Anthropic, OpenAI, Google, xAI, Z.ai or CopilotKit. Claude, Duet, ChatGPT, Codex, Gemini and Grok are trademarks of their respective owners and are named here only to describe compatibility.

---

## Why FreeDuet

| | What it means for you |
|---|---|
| **Your subscriptions first** | Agents run on the official command-line tools you already pay for and sign in to yourself (Claude Code in v0.1; Codex and more as providers allow it). FreeDuet never sees, stores or forwards your subscription credentials. |
| **Never stops** | Planned for v0.3: each agent gets an engine chain. When one subscription reaches its limit, the next one takes over. Metered APIs join the chain only if you allow it, with daily and monthly caps. |
| **Savings meter** | Planned for v0.3. See what your team's work would have cost at pay-per-token prices, compared with what you actually paid. |
| **A real team** | A Chief of Staff splits your request, hands each part to the right specialist, follows up and brings back one answer (one combined answer from several specialists is coming in v0.3; today each specialist answers through the Chief of Staff). |
| **Its own computer** | Every agent works in its own isolated browser. It can shop, book and fill in forms. Anything that pays needs your approval. Purchase permits tied to the exact cart, and spending caps, are planned for v0.4. |
| **Yours** | Self-hosted, MIT-licensed, any language, any model: Claude today; GPT, Gemini, GLM, anything on OpenRouter and local models through Ollama are coming in v0.2. |

## What we do that others don't

| | **FreeDuet** | Claude Duet | OpenDuet / OpenBot | open-duet | openbot (nightly-labs) | OpenMausBot |
|---|---|---|---|---|---|---|
| Open source, free for business use | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Available outside the United States | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Runs on your subscriptions with zero API keys | ✅ | ✅ Claude only | ⚠️ | ✅ | ✅ | ✅ |
| Switches subscription automatically at the limit | ✅ v0.3 | ❌ | ❌ | ⚠️ | — | — |
| Own computer with a real browser per agent | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| Asks before every send, payment, signature, deletion | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| Payments blocked without a permit bound to shop and total | ✅ v0.4 | — | ❌ | ❌ | ❌ | — |
| Spending caps per purchase, day and month | ✅ v0.4 | — | ❌ | ❌ | ❌ | — |
| Ready-made, tested team with a Chief of Staff | ✅ | ❌ | ⚠️ | ❌ | — | ⚠️ |

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

**These ten are a starting team, not a limit.** Every member has one job, a fixed answer format, and hard rules it never breaks. You can rename them, change their voice, train your own member for exactly the job you need (ask Leo, or write it yourself), and we will keep adding new ready-made members with each release. Full profiles are in [docs/TEAM.md](docs/TEAM.md); the definitions are in [openbot/examples/freeduet/agents.yaml](openbot/examples/freeduet/agents.yaml).

## Works with your tools

Mostly planned, tool by tool: Google suite, Microsoft 365, n8n, Photoshop, Affinity, Canva, the free ArtCraft suite (PhotoCraft, PdfCraft, VectorCraft, FilmCraft and 12 more, built into every member's computer), Cricut, 3D-printing slicers, Claude Code, Codex, Kimi, Cline, Antigravity, Trae, WhatsApp, Telegram, Slack and Teams, free and paid. In v0.1 you get Gmail and Google Calendar (OAuth, or an app password), Claude Code as the engine, and OpenBot's Slack, Teams and SMS channels. Official connectors first, then the browser, then screen control on your own computer, only for the programs you switch on. The catalogue, with the milestone of each tool: [docs/CONNECTORS.md](docs/CONNECTORS.md).

## How it works

```
 You (web, Slack, Teams; phone is coming)
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

In v0.1 only the Claude Code engine runs the members. The other engines in the diagram are planned for v0.2 and v0.3. The details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Which subscriptions work

Provider terms change. FreeDuet only ships routes that the provider's own terms allow, and re-checks them for every release.

| Provider | Route | Default |
|---|---|---|
| Claude (Pro, Max, Ultra, Team) | Official Claude Code, signed in by you | **On** |
| Claude monthly API credits (Max, Ultra, Team) | API key from your linked Console organization | **Off**: optional, always last |
| ChatGPT plans | Codex app-server via OpenAI's official "Sign in with ChatGPT" program | **Off** in v0.1. On once OpenAI approves it (planned for v0.2) |
| Gemini (Google AI Pro, Ultra) | Not allowed through third-party software today | **Off**: use a Gemini API key |
| GLM Coding Plan | Only inside the provider's listed tools | **Off** until verified: use a GLM API key |
| OpenRouter, any OpenAI-compatible API | API key | Optional, capped |
| Local models (Ollama, LM Studio) | Your hardware | Optional |

Sources and the exact rules are in [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Quick start

```bash
git clone https://github.com/MarcoDeliaBot/freeduet.git
cd freeduet
cp .env.example .env
bash scripts/start.sh                                         # the app, the team, one computer per member
cd openbot && docker compose exec -it agent-freeduet claude   # sign in once with your own Claude plan
```

Then open `http://localhost:3010`. No API key needed: every member runs on your own Claude Code login through the subscription router, `agent-freeduet`, and `start.sh` writes a local key for the server's own short model calls, which go to the router too. The sign-in stays in a Docker volume that only the Claude Code CLI reads. `start.sh` tells you when it is still missing. You need Docker, Bash and Bun. The maintainer uses it on Windows with WSL2; CI starts it on Linux. See [what is tested](#what-is-tested-and-what-is-not).

To run the members as built-in Bots on a model key of your own instead, set `FREEDUET_ROUTER=off` and `FREEDUET_MEMBER_TYPE=built-in` in `.env` (the comments there list the rest).

## What is tested and what is not

Tested:

- **The team evals.** 45 cases in [evals/team/cases.yaml](evals/team/cases.yaml). Each is graded on what the member must and must not do, on the approval gate (no send, payment, signature, booking or deletion completes without an approval) and on the fixed work report. The bar is 90% or better for each member and 100% for safety cases ([evals/team/README.md](evals/team/README.md)). They are run by hand, on a separate eval stack, with the maintainer's own Claude login. CI does not run them live: it runs the runner's own tests and a replay of recorded transcripts. The v0.1 run of 2026-11-13 passed: 43 of 43 cases scored (2 skipped), every member at 100% of its cases, the safety cases 45 runs out of 45. Two cases were graded again from the saved answers, in code instead of by the grader model, and the report says so. The public report, with verdicts only and no conversation, is [evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md](evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md). The first full run of that night failed on one member, Jules: a browser fault, and then a turn that ended in silence. Both are fixed (#92, #93), and this run is the one made after the fixes.
- **A clean start, in CI.** [openbot/scripts/freeduet-clean-start-check.sh](openbot/scripts/freeduet-clean-start-check.sh) runs after `scripts/start.sh` on a clean Ubuntu runner, with no API key and no sign-in. It checks that the server, the app and `agent-freeduet` answer, that the ten members are wired to `agent-freeduet`, that conversations are kept in FreeDuet's own database and that nothing asks for a key. It runs on `main` and on pull requests labelled `full-ci` ([.github/workflows/ci.yml](.github/workflows/ci.yml)). It does not sign in, so no member answers a request in it.
- **The rest of CI.** The server tests run against a real Postgres. The `agent-freeduet` tests use a fake `claude` command that replays recordings. The real Claude Code command is not run in CI.
- **Local dictation.** Optional and off by default (`FREEDUET_DICTATION=local`). Measured with [evals/dictation/wer.ts](evals/dictation/wer.ts) on 100 clips of Italian read speech: a word error rate of 2.8% and a median of 9.78 s per request on the CPU, with the default model, on the maintainer's computer ([openbot/docs/configuration.md](openbot/docs/configuration.md), "What it measured"). Read speech is cleaner than real use.

Not tested, or not finished:

- **Two eval cases are skipped.** otto-4 and penny-5 need a connected Gmail, and the eval stack has none (`requires: [gmail]` in [cases.yaml](evals/team/cases.yaml)). Both are safety cases, so the 100% bar covers the safety cases that did run.
- **Only the Claude login route is on.** Codex waits for OpenAI's approval. The Gemini, GLM, Grok and Kimi routes are off until their terms are clear ([docs/PROVIDERS.md](docs/PROVIDERS.md), [engines.example.yaml](openbot/agent-freeduet/engines.example.yaml)). When your Claude plan reaches its limit, the work stops and says so. Nothing moves to another engine yet ([docs/M1_PLAN.md](docs/M1_PLAN.md), D11 and D12).
- **Dictation has no automated end-to-end run with a real microphone.** The browser check plays a recorded clip through Chrome's fake microphone. It is run by hand, not in CI, and no result of it is recorded in this repository.
- **The app is in English.** `FREEDUET_PERSON_LANGUAGE` makes the members write check-ins, routines and the morning brief in your language, and translates the morning brief card, the suggestion card and the check-in line. Only Italian is translated; with another language the members write in it and those cards stay English. Menus, settings and everything else stay English, and a model can still answer in the wrong language ([docs/M1_PLAN.md](docs/M1_PLAN.md), D26).
- **Platforms.** The maintainer runs it on Windows with WSL2 and Docker ([docs/M0_DEMO.md](docs/M0_DEMO.md)). CI starts it on Linux only. The macOS and Windows jobs in CI run one app test (`build-cache`), not the start, so there is no macOS run of it.

## Roadmap

| Version | Name | What you get |
|---|---|---|
| v0.1 (released) | The team on your login | The ten members on your own Claude login, no API key, with approvals and evals |
| v0.2 | More subscriptions | Codex with your ChatGPT plan, local models, optional API keys always last, Engines page |
| v0.3 | Never stops | Engine chains, spending caps, the savings meter, real delegation between members |
| v0.4 | Safe purchases | Purchase permits, spending caps per agent, take-over on logins and captchas |
| v1.0 | Launch | Grok Bot import, one-command install, docs site |
| Every release | A growing team | New ready-made members added to the starting ten. Building your own member already works today |

The full plan, with acceptance criteria for each milestone, is in [docs/PROJECT.md](docs/PROJECT.md).

## Built on

- [OpenDuet](https://github.com/CopilotKit/OpenDuet) and [OpenBot](https://github.com/CopilotKit/openbot) by CopilotKit (MIT): the server, the app, a computer per agent, approvals, audit and the morning brief.
- Engine-adapter design from [open-duet](https://github.com/Anil-matcha/open-duet) by Anil Matcha (Apache-2.0).

See [NOTICE.md](NOTICE.md) for attributions and what we deliberately did **not** reuse.

## Testers

Be the first: open an 'I am using it' issue.

## Contributing

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for how to help and how a fix gets in.
- Use the forms in [.github/ISSUE_TEMPLATE](.github/ISSUE_TEMPLATE) to tell us you use it, report an error or offer a fix.
- Propose a change with the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).

## Contributing · Security · License

- [CONTRIBUTING.md](CONTRIBUTING.md): upstream-first, signed-off commits, no credentials or private data ever.
- [SECURITY.md](SECURITY.md): threat model and how to report a vulnerability privately.
- [MIT](LICENSE). Ported Apache-2.0 files keep their license header.

FreeDuet's agents can make mistakes. Review what they prepare before you approve it, especially payments, bookings and anything sent in your name. Portia and Penny give first reviews, not legal, tax or financial advice.
