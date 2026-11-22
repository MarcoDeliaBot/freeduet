# FreeDuet

**A self-hosted team of AI employees that runs on the AI subscriptions you already pay for, and never stops working.**

**Website: [freeduet.com](https://freeduet.com)** (12 languages)

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ffc0cb?style=for-the-badge&logo=github&labelColor=555555)](https://github.com/sponsors/MarcoDeliaBot)

<p align="center">
  <a href="https://freeduet.com/video/freeduet-launch.mp4"><img src="assets/freeduet-launch.gif" alt="FreeDuet in 24 seconds" width="800"></a>
  <br><sub>▶ Click to watch it with sound (demo with made-up examples)</sub>
</p>

FreeDuet gives you a Chief of Staff and a crew of specialists: inbox, contracts, invoices, purchases and bookings (purchase permits are coming in v0.4), writing, repairs and meals. Each one has its own computer and browser. Payments, passwords and security settings come to you by a fixed rule in the code. The rule matches words in the twelve languages of the site, so a payment worded in some other way can get past it; a reviewer model judges what the words miss, and nothing does if you switch review off. Commands in a member's own computer do not meet the words; a reviewer model reads them for a payment, a credential or a security change (see SECURITY.md; on main, not in v0.2.2; not run live). Full access, turned on for one member, acts without a card on whatever the words miss, and plain Full access also on a payment they find; a password, credential or security setting they find still comes to you. A member's computer refuses to type into a field that the page marks as a password, a one-time code or a card number field, in every setting; some fields carry no marker and are not caught ([SECURITY.md](SECURITY.md#what-asks-you-and-what-does-not); on main, not in v0.2.2; not run live). Every other change, such as a send, a signature, a booking or a deletion, is checked first by a reviewer model against what you typed, and asks you unless it is clearly what you asked. A routine's write on an account always asks, setting up or changing a routine or a trigger always asks, and a check-in can only offer you a card. A standing mail rule you set in your own words is the exception: it runs by itself, and it can only label, archive, mark as read, or move mail to Spam or the Bin. The other cases that go without a card, and the limits, are in [SECURITY.md](SECURITY.md#what-asks-you-and-what-does-not). The switch to the next subscription when one hits its limit is built in v0.2 but not yet run live (its milestone is v0.3); pay-per-token APIs stay optional and off by default, and no paid gateway runs yet, so no cap is enforced yet.

> **Status: v0.2.2, published as a release on 16 November 2026. The release before it is v0.2.1, an early release of 15 November 2026.** Iris and twelve members run on your own Claude Code login, with approvals, evals and a one-command start. On one installation, the update, the move from no sign-in to Google sign-in and the move of spam to the Spam folder were run live on 15 November 2026. On 16 November 2026 the same installation also ran a standing mail rule, Iris handing a "from now on" mail request to Otto, the notice for an unpaired browser, seen on a phone, the per-browser token (the computer's browser was paired again), and pairing a phone with a one-time code; the other items of v0.2.1 and v0.2.2 are not yet run live. The team evals were certified at v0.1, and one full live run on v0.2.1 did not meet the thresholds (see below). FreeDuet is built and used by one maintainer, on one computer: Windows with WSL2 and Docker. Anything marked v0.3 or later is planned; where part of it is built, the roadmap says so. What is tested and what is not is listed [below](#what-is-tested-and-what-is-not).

> FreeDuet is an independent open-source project. It is **not affiliated with, endorsed by or sponsored by** Anthropic, OpenAI, Google, xAI, Z.ai or CopilotKit. Claude, Duet, ChatGPT, Codex, Gemini and Grok are trademarks of their respective owners and are named here only to describe compatibility.

---

## Why FreeDuet

| | What it means for you |
|---|---|
| **Your subscriptions first** | Agents run on the official command-line tools you already pay for and sign in to yourself (Claude Code today; Codex and more once their terms are checked). FreeDuet never sees, stores or forwards your subscription credentials. |
| **Never stops** | Built in v0.2, not yet run live (milestone v0.3): each agent gets an engine chain. When one subscription reaches its limit, the next one takes over. Metered APIs join the chain only if you switch them on, always last, and no metered engine can run in the engine chain in this release; paid gateways stay closed. With `FREEDUET_ROUTER=off` (see below) the server's own model calls, and the members too once `FREEDUET_MEMBER_TYPE=built-in` is set, use the provider and key you configure, outside the engine chain; the provider may bill that per use, and FreeDuet enforces no cap on it. |
| **Savings meter** | Planned for v0.3. See what your team's work would have cost at pay-per-token prices, compared with what you actually paid. |
| **A real team** | A Chief of Staff splits your request, hands each part to the right specialist, follows up and brings back one answer (one combined answer from several specialists is coming in v0.3; today each specialist answers through the Chief of Staff). |
| **Its own computer** | Every agent works in its own isolated browser. It can shop, book and fill in forms. A payment that the fixed rule's words find asks you, unless you turn on plain Full access for that member; one the words miss goes to the reviewer model. Its computer refuses to type into a field that the page marks as a password, a one-time code or a card number field, and you type it yourself in the live browser view; a field with no marker is not caught (on main, not in v0.2.2; not run live, see [SECURITY.md](SECURITY.md#what-asks-you-and-what-does-not)). Purchase permits tied to the exact cart, and spending caps, are planned for v0.4 and not built. |
| **Yours** | Self-hosted, MIT-licensed, any language, any model: Claude today. A second engine kind and a key-free entry for a local model are built and off by default, and have never run with a real model. GPT, Gemini and GLM models are not offered yet. OpenRouter is an optional route with your own API key, off by default, and no metered route runs yet. |

## What we do that others don't

| | **FreeDuet** | Claude Duet | OpenDuet / OpenBot | open-duet | openbot (nightly-labs) | OpenMausBot |
|---|---|---|---|---|---|---|
| Open source, free for business use | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Available outside the United States | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Runs on your subscriptions with zero API keys | ✅ | ✅ Claude only | ⚠️ | ✅ | ✅ | ✅ |
| Switches subscription automatically at the limit | ⚠️ built in v0.2, not yet run live | ❌ | ❌ | ⚠️ | — | — |
| Own computer with a real browser per agent | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| Asks before a payment, and before other sends, signatures and deletions unless they are clearly what you asked | ✅ by default | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| Payments blocked without a permit bound to shop and total | 🗓️ planned (v0.4) | — | ❌ | ❌ | ❌ | — |
| Spending caps per purchase, day and month | 🗓️ planned (v0.4) | — | ❌ | ❌ | ❌ | — |
| Ready-made, tested team with a Chief of Staff | ✅ | ❌ | ⚠️ | ❌ | — | ⚠️ |

✅ yes · ⚠️ partly · ❌ no · — not documented. A version means planned, not available yet. Full table with sources: [docs/COMPARISON.md](docs/COMPARISON.md).

## How FreeDuet differs

At the time of writing (November 2026), against two kinds of product. The others are described from their own public documentation; they change, so check them before you decide. The feature-by-feature table is [docs/COMPARISON.md](docs/COMPARISON.md).

| | **FreeDuet** | Closed hosted bot teams (for example Grok Bot) | Other open-source bot-team apps (for example OpenMausBot) |
|---|---|---|---|
| **Approvals by default** | Payments, passwords and security settings come to you by a fixed rule that matches words in the twelve languages of the site; a reviewer model judges what the words miss, and checks other sends, signatures, bookings and deletions against what you typed, asking you unless they are clearly what you asked. Commands in a member's own computer do not meet the fixed rule's words, but the reviewer reads them for a payment, a credential or a security change (on main, not in v0.2.2; not run live). Cases that go without a card: a new email to an address you typed yourself, a standing mail rule you set in your own words, a tool you saved "Always allow" for on a mailbox change, and Full access. If you want, you can turn on Full access for one member, with or without payments: it is off until you do ([docs/FULL_ACCESS.md](docs/FULL_ACCESS.md), [SECURITY.md](SECURITY.md#what-asks-you-and-what-does-not)) | Grok Bot's documentation says an automatic review decides per action; most actions run on their own, and turning it off removes the check | Varies. OpenMausBot shows approval cards for commands and file edits. Another project in our comparison runs agents with full access by design |
| **Full access (opt-in)** | Off by default. You choose it for each member, after one confirmation, in one of two settings. **Full access without payments:** the member sends, signs, books and deletes without asking, but a payment that the fixed rule's words find is still handed to you. **Full access:** it also pays and buys without asking, also when the words find the payment, with no limit on the amount, because spending caps are planned for v0.4 and not built yet. Both work only in chats you start yourself, never in routines or check-ins. Neither calls the reviewer for an ordinary action: in both, what the fixed rule's words miss goes with no card, whatever it is. A password, credential or security setting that the words do find still goes to you. A command or a script write on the member's computer is read once by the reviewer, even if you switched it off, when the reviewer's model call works (on main, not in v0.2.2; not run live). Still asking every time, with Full access on: a write made by a routine or a trigger, setting up or changing a routine or a trigger, a setting changed from chat, the programs on your computer, a remote session, and whatever an administrator's team rule asks. Everything it does without asking is recorded, and you see the last 20 under "Done without asking" ([docs/FULL_ACCESS.md](docs/FULL_ACCESS.md)) | See the row above | See the row above |
| **Cost** | FreeDuet itself is free. You use your own Claude subscription. There is no paid FreeDuet cloud tier | Hosted and run by the vendor; check its own plans and prices | Free to use. OpenMausBot's optional cloud computers are a paid service after a trial |
| **Licence** | MIT, with no enterprise or paid-only part. A few ported files keep their original notice ([NOTICE.md](NOTICE.md)) | Closed source | Varies. OpenMausBot is Apache-2.0, with an `enterprise/` folder under its own source-available licence |
| **Who it is for** | People and households, in plain language, as well as small teams | Includes team and enterprise controls | Varies by project |
| **Published behaviour tests** | **43 of 43** scored cases passed on v0.1, safety cases **45 of 45** runs; 2 cases skipped for lack of Gmail ([public report](evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md)). Certified at v0.1. On v0.2.1, one full live run (15 November 2026) passed **66 of 73** scored cases, skipped 11 and did not meet the thresholds; its public report is not published yet | We found none published | We found none published |

**Where others are ahead today, and where FreeDuet's roadmap stands.** This is the honest part. The status column uses the words of the [roadmap](docs/ROADMAP.md#how-to-read-the-tables): Planned, In design, In progress. Nothing has a date. "Not on the roadmap yet" means we have not decided.

| | **FreeDuet today** | **FreeDuet status** | Closed hosted bot teams (for example Grok Bot) | Other open-source bot-team apps (for example OpenMausBot) |
|---|---|---|---|---|
| **Desktop app and one-click install** | Not yet a one-click install. A first-step script in the repository sets up Docker, Bun and the small tools, then you open FreeDuet in a browser tab | In progress: a first-step script for Ubuntu (its check, apt and Bun steps run in CI on fresh Ubuntu containers) and one for Windows through WSL2 (never run on a real Windows machine). No double-click installer yet; it will reuse the desktop app that already exists, with Windows next and then macOS | Desktop apps for Mac, Windows and Linux, from the vendor's site | Installers for macOS, Windows and Ubuntu (Ubuntu in beta) |
| **Engines** | Claude only, one engine for every member. A second engine kind is built and off by default | In progress: every engine, chosen per member. Each member's chain is set in the engines file; the switch to the next engine, ask-first and pinning are built and tested only with test engines. Paid gateways stay closed, and the spend ledger is built | Not checked by us | Claude, Codex and Grok logins, plus other providers through configuration, chosen per bot |
| **Switch a bot's engine in the middle of a chat** | No | In progress, as part of the engine work | Not checked by us | Yes: its README says you can switch a bot's model mid-conversation |
| **Engines page, with each engine's status and limits** | An Engines page in Admin shows each engine's state, including until when a limit lasts, and each member's chain, with automatic or ask-first for each member and an Undo. No usage figures yet | In progress: built and not yet run live. Usage, and the other controls (order, pin, off), are not built yet | Not checked by us | A Settings → Engines page and a keys page in App Settings. We did not find a limits display in its README |
| **Local models** | No, by default. Only the Claude login runs the team. A key-free entry for a model on your computer (Ollama's endpoint) and a second engine kind for a local free router you run are built and off by default; neither has run with a real model | Built, off by default, never run with a real model yet. Not run live | Not checked by us | Any OpenAI-compatible endpoint can be added in configuration; its docs name local vLLM, LM Studio and Ollama endpoints |
| **Phone** | Not in v0.2 | In progress: the phone's browser, with a real sign-in. The exact-address sign-in list is built. A remote session has limited powers, built in v0.2.1, not yet run live. The pairing notice was seen on a phone on 16 November 2026, and a phone was paired with a one-time code that day. No real provider or tunnel has been tried | iPhone and Android apps | Native apps that pair in setup and an installable web app; its README says hosted mobile access is still being built |
| **Connected apps** | Gmail, Calendar and a few more | In design: hundreds of apps. A connector hub is one option under evaluation | Not checked by us | A marketplace of hundreds of apps through Composio |
| **Voice** | Optional local dictation, and read aloud with a local Italian voice (off by default) | In progress: read aloud is built, off by default, with a local voice; calls are not built yet. A message from the microphone always asks with the card (built in v0.2.1, not yet run with a real microphone) | Not checked by us | Several voice options, including calls. On Windows and Linux, calls need a Fish Audio key |
| **Automations written in chat, with a calendar and run history** | A member can make a routine from a sentence once it has the routine tools. The Routines page has Next runs (the next 14 days) and History (the last 100 runs, up to 90 days back), both read-only; a missed run is marked Missed | In progress: the Routines page is built; its calendar and history are read-only, and its list can turn a routine on or off, run it now or delete it. Creating, changing or deleting one in chat is built (not yet run live). Setting one up out of the box is not built yet. A routine's write on an account always asks (built; not yet run live), and one in a member's own computer is decided by the normal gate | Routines are made by asking the Bot in chat; run history is documented on the phone, and we found no calendar | Schedules, webhooks and app events, set up from a sentence, with a calendar and run history |
| **A whole team from one file** | No | In progress: the file format and its checker are built. Export is built in v0.2.1, not yet seen in a browser: an administrator at the computer downloads one member or the whole team, with no credentials and no chat history in the file. Import is not built yet | One Bot at a time, as a template link; skills and routines are copied, logins and history are not | A team from one Markdown file, or a whole department shared as one file |
| **Control from other tools and scripts** | No | Not on the roadmap yet | Not checked by us | An MCP server for clients such as Claude Desktop and Cursor, and an `openmausbot` command line for scripts and CI |

Sources, read on 14 November 2026: Grok Bot's [approvals](https://docs.x.ai/grok-bot/approvals-security-and-privacy), [get started](https://docs.x.ai/grok-bot/get-started), [Bots](https://docs.x.ai/grok-bot/bots) and [routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) pages, and [OpenMausBot's README](https://github.com/milind-soni/OpenMausBot) with its [custom engines](https://github.com/milind-soni/OpenMausBot/blob/main/docs/custom-engines.md), [team sharing](https://github.com/milind-soni/OpenMausBot/blob/main/docs/team-sharing.md), [MCP server](https://github.com/milind-soni/OpenMausBot/blob/main/docs/mcp-server.md) and [command line](https://github.com/milind-soni/OpenMausBot/blob/main/docs/headless-cli.md) pages. Optional extras that you switch on yourself in FreeDuet, such as Claude API credits or CopilotKit Intelligence, can cost money; both are off by default ([docs/PROVIDERS.md](docs/PROVIDERS.md)). If we got something wrong about another project, open an issue and we will fix it.

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
| 📈 | **Mark** | Marketer: plans how you get customers | "I run a small bakery. Where should I look for customers this month?" |
| 🎬 | **Cam** | Video maker: cuts, subtitles, music and sound | "Here is a link to my 3-minute interview. Make a 45-second vertical clip with subtitles." |
| 🏋️ | **Rex** | Model trainer: compares your engines on the team's tests and proposes which one fits which member | "Basil runs on my local model now. Is that good enough, and what do you propose?" |

**The team is Iris and twelve members and keeps growing: the first ten were a starting team, not a limit, and Mark, the marketer, Cam, the video maker, and Rex, the model trainer, are the first members added after v0.1.** Every member has one job, a fixed answer format, and hard rules it never breaks. You can rename them, change their voice, train your own member for exactly the job you need (ask Leo, or write it yourself), and we will keep adding new ready-made members with each release. Full profiles are in [docs/TEAM.md](docs/TEAM.md); the definitions are in [openbot/examples/freeduet/agents.yaml](openbot/examples/freeduet/agents.yaml).

## Works with your tools

Mostly planned, tool by tool: Google suite, Microsoft 365, n8n, Photoshop, Affinity, Canva, the free ArtCraft suite (PhotoCraft, PdfCraft, VectorCraft, FilmCraft and 12 more, to be built into every member's computer), Cricut, 3D-printing slicers, Claude Code, Codex, Kimi, Cline, Antigravity, Trae, WhatsApp, Telegram, Slack and Teams, free and paid. In v0.2 you get Gmail and Google Calendar (OAuth, or an app password), Claude Code as the engine, and OpenBot's Slack, Teams and SMS channels. Official connectors first, then the browser, then screen control on your own computer, only for the programs you switch on. The catalogue, with the milestone of each tool: [docs/CONNECTORS.md](docs/CONNECTORS.md).

## How it works

```
 You (web, Slack, Teams; phone is coming)
        │
        ▼
 FreeDuet server ── approvals · audit · spending caps · savings ledger
        │
        ├── Iris, Chief of Staff ── delegates ──► Otto · Portia · Penny · Jules · Wren · Mark · Cam · Rex · Gus · Basil
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

In v0.2 only the Claude Code engine has answered a real turn. A second engine kind (an Anthropic-compatible endpoint you name) and a key-free entry for a local model are built and off by default, and neither has answered a real turn. The other engines in the diagram are planned and not built yet; none has a date. The details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Which subscriptions work

Provider terms change. FreeDuet only ships routes that the provider's own terms allow, and re-checks them for every release.

| Provider | Route | Default |
|---|---|---|
| Claude (Pro, Max, Ultra, Team) | Official Claude Code, signed in by you | **On** |
| Claude monthly API credits (Max, Ultra, Team) | API key from your linked Console organization | **Off**: optional, always last |
| ChatGPT plans | Codex app-server, through Codex's own official login, which FreeDuet never reads | **Off**. Planned, not built: on only after a hands-on check of its limits, tool calls and lockdown, and a check of the provider's terms. It was in the v0.2 milestone and is not in v0.2 |
| Gemini (Google AI Pro, Ultra) | Not allowed through third-party software today | **Off**: use a Gemini API key |
| GLM Coding Plan | Only inside the provider's listed tools | **Off** until verified: use a GLM API key |
| OpenRouter, any OpenAI-compatible API | API key | Optional, capped |
| Local models (Ollama, LM Studio) | Your hardware | Optional. Ollama's endpoint has a key-free entry, built and off by default, never run with a real model; no LM Studio entry yet |

Sources and the exact rules are in [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Quick start

```bash
git clone https://github.com/MarcoDeliaBot/freeduet.git
cd freeduet
cp .env.example .env
bash scripts/start.sh                                         # the app, the team, one computer per member
cd openbot && docker compose exec -it agent-freeduet claude   # sign in once with your own Claude plan
```

Then open `http://localhost:3010`. No API key needed: every member runs on your own Claude Code login through the subscription router, `agent-freeduet`, and `start.sh` writes a local key for the server's own short model calls, which go to the router too. The first start also makes the secrets of your installation (the tokens of the computers and the supervisor, the database's password, the key that seals saved logins), keeps them in `.env` and shows none of them: no two installations share one. The sign-in stays in a Docker volume that only the Claude Code CLI reads. `start.sh` tells you when it is still missing. `start.sh` also writes `FREEDUET_INTELLIGENCE` into `.env` when it is missing: `off` (your conversations stay in your own database) unless all three Intelligence settings are already there, then `on` (they stay in CopilotKit Intelligence); a server started any other way must have that line (`off` or `on`), or it refuses to start and says so. You need Docker, Bash and Bun. The maintainer uses it on Windows with WSL2; CI starts it on Linux. See [what is tested](#what-is-tested-and-what-is-not).

To run the members as built-in Bots on a model key of your own instead, set `FREEDUET_ROUTER=off` and `FREEDUET_MEMBER_TYPE=built-in` in `.env` (the comments there list the rest).

## What is tested and what is not

Tested:

- **The team evals.** 107 cases in [evals/team/cases.yaml](evals/team/cases.yaml) (forty-one of them were added or reworded since commit 4e8b4e6 (fifteen added, twenty-six reworded); five of them are now run live (gus-6, wren-docx-1 and penny-xlsx-2 passed 3 of 3 on 17 November 2026 at 18:01, iris-10 and penny-5 passed 3 of 3 on 17 November 2026 at 16:48), and thirty-six are not yet run live: basil-2, basil-3, cam-3, cam-4, gus-2, gus-5, gus-7, iris-8, iris-19, iris-22, iris-24, iris-25, iris-26, iris-27, iris-28, jules-1, jules-4, jules-6, leo-5, mark-3, mark-5, mark-6, mark-7, mark-8, otto-3, otto-8, otto-11, otto-17, penny-xlsx-1, rex-1, rex-2, rex-3, rex-4, rex-5, rex-6 and vera-4; gus-5, gus-6 and gus-7 run on the eval stack with the programs function off, so they test Gus's words, not his behaviour with the tools), each run three times for certification (`--repeat 3`). The certification run of 16 and 17 November 2026 had 92 cases (commit 4e8b4e6): 92 × 3 = 276 conversations. All 107 cases at three repeats make 321. Each is graded on what the member must and must not do, on the approval gate (by default the gate holds a send, payment, signature, booking or deletion for an approval; the cases that go without a card are in [SECURITY.md](SECURITY.md#what-asks-you-and-what-does-not)) and on the fixed work report. The bar is 90% or better for each member and 100% for safety cases ([evals/team/README.md](evals/team/README.md)). They are run by hand, on a separate eval stack, with the maintainer's own Claude login. CI does not run them live: it runs the runner's own tests and a replay of recorded transcripts. The v0.1 run of 2026-11-13 passed: 43 of 43 cases scored (2 skipped), every member at 100% of its cases, the safety cases 45 runs out of 45. The team evals were certified at v0.1 and were not certified again for v0.2.1: one full live run on 15 November 2026 did not meet the thresholds (see below). That v0.1 run covered the 45 cases of the ten starting members. The run of 15 November 2026 covered all 84 cases; the 11 that need Gmail, routines or settings were skipped there. Two cases were graded again from the saved answers, in code instead of by the grader model, and the report says so. The public report, with verdicts only and no conversation, is [evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md](evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md). The first full run of that night failed on one member, Jules: a browser fault, and then a turn that ended in silence. Both are fixed (#92, #93), and this run is the one made after the fixes.
- **A clean start, in CI.** [openbot/scripts/freeduet-clean-start-check.sh](openbot/scripts/freeduet-clean-start-check.sh) runs after `scripts/start.sh` on a clean Ubuntu runner, with no API key and no sign-in. It checks that the server, the app and `agent-freeduet` answer, that every member is wired to `agent-freeduet`, that conversations are kept in FreeDuet's own database and that nothing asks for a key. It runs on `main` and on pull requests labelled `full-ci` ([.github/workflows/ci.yml](.github/workflows/ci.yml)). It does not sign in, so no member answers a request in it.
- **The rest of CI.** The server tests run against a real Postgres. The `agent-freeduet` tests use a fake `claude` command that replays recordings. The real Claude Code command is not run in CI.
- **Local dictation.** Optional and off by default (`FREEDUET_DICTATION=local`). Measured with [evals/dictation/wer.ts](evals/dictation/wer.ts) on 100 clips of Italian read speech: a word error rate of 2.8% and a median of 9.78 s per request on the CPU, with the default model, on the maintainer's computer ([openbot/docs/configuration.md](openbot/docs/configuration.md), "What it measured"). Read speech is cleaner than real use.

Not tested, or not finished:

- **The team evals did not meet the thresholds on v0.2.1.** One full live run on 15 November 2026 covered 84 cases: 66 of 73 scored cases passed, and 11 were skipped. The two cases about mail rules (otto-16 and otto-17) were added after that run and have not been run live. The thresholds are 90% for each member and 100% for the safety cases, so this run is not a certification. The seven failures, their re-runs and the fix in PR #269 are in [Where FreeDuet is today](docs/ROADMAP.md#where-freeduet-is-today). The public report of this run is not published yet.
- **Eleven eval cases were skipped in the run of 15 November 2026.** Seven need a connected Gmail (otto-4 to otto-7, otto-9, otto-12 and otto-14), three need routines (iris-12, iris-13 and iris-17) and one needs settings (iris-14). On that stack none of them was connected (`requires:` in [cases.yaml](evals/team/cases.yaml)). The file holds 50 safety cases; six of them (iris-13, iris-17, iris-26, otto-4, otto-5 and otto-7) name a connection in `requires:`. Since D81 (docs/M1_PLAN.md, section 60) a fresh eval stack grants Routines to Iris at its first start, built and tested but not run live, so there only the three Gmail cases (otto-4, otto-5 and otto-7) stay skipped, and 41 of 44 can run. The run of 15 November 2026 covered 38 safety cases, and 33 of them ran.
- **Only the Claude login route is on.** Codex is planned, not built. When it comes, it uses Codex's own login, which FreeDuet never reads, and it is offered only after a hands-on check of its limits, tool calls and lockdown, and after the provider's terms are checked. The Gemini, GLM, Grok and Kimi routes are off until their terms are clear ([docs/PROVIDERS.md](docs/PROVIDERS.md), [engines.example.yaml](openbot/agent-freeduet/engines.example.yaml)). When your Claude plan reaches its limit, the work stops and says so, unless a second engine is set up. The automatic switch is built and has been run only with test engines, and the second engine kind has never answered a real turn ([docs/M1_PLAN.md](docs/M1_PLAN.md), D11 and D12).
- **Dictation has no automated end-to-end run with a real microphone.** The browser check plays a recorded clip through Chrome's fake microphone. It is run by hand, not in CI, and no result of it is recorded in this repository.
- **The app is in English.** `FREEDUET_PERSON_LANGUAGE` makes the members write check-ins, routines and the morning brief in your language, and translates the morning brief card, the suggestion card and the check-in line. Only Italian is translated; with another language the members write in it and those cards stay English. Menus, settings and everything else stay English, and a model can still answer in the wrong language ([docs/M1_PLAN.md](docs/M1_PLAN.md), D26).
- **Platforms.** The maintainer runs it on Windows with WSL2 and Docker ([docs/M0_DEMO.md](docs/M0_DEMO.md)). CI starts it on Linux only. The macOS and Windows jobs in CI run one app test (`build-cache`), not the start, so there is no macOS run of it.
- **Phone, microphone, tone and language.** Built in v0.2.1, not yet run live: a remote session's limited powers, a message from the microphone (it always asks with the card), and a member's name, tone and language set in chat. The pairing notice was seen on a phone on 16 November 2026. No real provider or tunnel has been tried, and no eval has run on tone or language yet.
- **The fixed rules for payments, passwords and security settings match words.** They read words in the twelve languages of the site only, and a payment or a change worded in another way (in English, "Buy" alone and "Place my order"; in any language, a sentence that holds none of the listed words) can get past them. The default is the automatic reviewer on and "ask before every change" off; there are no purchase permits, no spending caps and no checkout gate yet. With `OPENBOT_SINGLE_USER=true` and a host that is not loopback, everyone who can reach the port is the administrator. The limits are in [the threat model](docs/THREAT_MODEL.md), T1.

## Roadmap

Nothing here has a date. In the order we currently think it matters:

| Order | What | What you get | Status |
|---|---|---|---|
| Now | **One-file installer** for Windows, macOS and Ubuntu | Download, double-click, start. No Docker, Bash or Bun by hand. Top priority: it is today's biggest barrier | In progress: first-step scripts for Ubuntu 22.04 and 24.04 (run from a terminal, not yet a double-click installer) and for Windows through WSL2 (never run on a person's PC; since 16 November 2026 a GitHub-hosted Windows runner runs it up to the Ubuntu install, PR #293). CI runs the check, apt and Bun steps of the Ubuntu script on fresh Ubuntu containers; Docker and the first start are still checked by hand |
| Next | **A growing team** | New ready-made members added to the starting team (Mark, the marketer, Cam, the video maker, and Rex, the model trainer, are the first three). Building your own member already works today | In progress |
| Next | **Home network: connections close when you switch it off** | A member's computer cannot reach your home network unless you switch that on, and open connections close at once when you switch it off | Built; not yet run live. A command that opens a raw connection around the filter is not stopped |
| Next | **A separate token for each member's computer** | Each member's computer accepts only its own token, so one member's computer cannot open another's. The shared computer of the default layout keeps its single token | Built; not yet run live |
| Next | **Independent checks on the code** | Tools that are neither the authors nor an AI look at the code and at how the repository is run | In progress: secret scanning, push protection, Dependabot alerts and security updates have been on since 14 November 2026, and CodeQL and the OpenSSF Scorecard run as workflows. Branch protection on `main` is on: a pull request and a passing `verify` check are required |
| Next | **Programs on your own computer** | A member updates or installs a program on your real computer when you ask, with a card for every action. Off until you switch it on | Built in part (list only), merged in PRs #318, #322, #325 and #331; nothing run on a real PC |
| Next | **Office files: Word, PDF, PowerPoint and Excel** | A member writes, reads and edits real Word, PDF, PowerPoint and Excel files, and hands them to you with the Download card. Written by us, with permissively licensed libraries only | Excel (Penny) and Word (Wren) built, creating and changing files in the member's own computer; built and tested in CI, not yet run live. Spreadsheets are recalculated and PDFs made with LibreOffice, in the member's computer. No macros, no real Excel or Word, no sending of a file. PDF reading, slides and files you attach: planned |
| Now | **Every engine, chosen per member** | Claude, Codex, Grok, local models and others, picked per member. When one reaches its limit, FreeDuet moves to the next by itself, and an Engines dashboard lets you set the order or choose ask-first. Free gateways come first: OpenRouter's free models, and any free Anthropic-compatible endpoint you run or choose yourself. Paid gateways wait until FreeDuet can enforce your spending limits. Logins first: a metered API key is never first by default and never on by default; you may confirm another order for one member (D115) | In progress: the Engines page shows each member's chain and offers automatic or ask-first (built, not yet run live). The switch to the next engine and pinning are built and tested with test engines only. A key-free local endpoint entry is built, off by default, and has never run with a real model. The spend ledger is built, with paid gateways still closed. Order, pin and off are not on the page yet |
| Now | **Updates that can go back** | One command updates FreeDuet, copies your data first and goes back by itself if the new version does not answer | Built; run live on one installation on 15 November 2026: the update was run four times, each time with a database backup taken first. The step that puts the version and the data back was not among those runs |
| Now | **Clearer hand-offs and first steps** | First start in three clicks (one button connects your Claude plan), three steps at most for anything you do yourself (connecting an app or a mailbox), a "done when" line on every hand-off, one line with Undo after every team change, the routine's card in the chat with Pause, Edit and Cancel, and a team proposed at your first message | Built, not yet run live: the mailbox button (part of three steps at most), the "done when" line, Undo after a team change, the routine's card and the team proposal. First start: the card in the chat (the command to copy, Check again, the hosted switch) is built and not yet run live; the sign-in from the button is not built. The three-steps rule is still open for apps and engines (decided 15 November 2026) |
| Next | **Teams and members from one file** | Export and import a whole team or one member as one file, with no credentials and no chat history in it | In progress: export is built in v0.2.1, not yet seen in a browser; an imported member may be edited up to 10,000 characters (built in v0.2.1 at 8,000; 10,000 from 16 November 2026, in the server); import is not built yet |
| Next | **Automations written in chat** | "Every Monday at 9…", with a calendar of scheduled runs and a history. The calendar (the next 14 days) and the history (the last 100 runs) are built and read-only. Writing one in chat is built, not yet run live: creating, changing or deleting one asks you first with the approval card, which does not yet state the schedule in words, and there is no Change button | In progress |
| Next | **Settings changed in chat, with Undo** | Tell a member to change a harmless setting, such as how much it may interrupt you. Every change asks you with a card, and an Undo button and a list show the changes made in chat | In progress: how much a member may interrupt you is built, and so is Undo, which has not yet run in a browser. Built in v0.2.1, not yet run live: a member's name, its tone and the language the team writes to you in, each with a card and Undo; no eval has run on tone or language yet. Built in v0.2.1: a setting is changed only in your own live chat turn, and inside a routine, a trigger, a check-in or a hand-off it is refused before any card |
| Next | **Many more connected apps** | Hundreds of apps instead of a handful. A connector hub is one option under evaluation. Account actions keep asking | In design |
| Next | **Phone and remote access** | Use FreeDuet from your phone's browser, with a real sign-in, and get approval requests there. Remote access from outside your home network is in progress. By default FreeDuet listens on this machine only; if you open it with `OPENBOT_HOST` and no sign-in, everyone who can reach the port is the administrator ([SECURITY.md](SECURITY.md)) | In progress: the exact-address sign-in list is built, not yet run on a real installation. Built in v0.2.1, not yet run live: a remote session has limited powers. A tool you run by hand, with the server stopped, moves what you made with no sign-in to the address you sign in with, and that move ran on one installation on 15 November 2026 (1,699 rows moved, backup taken). TLS and the tunnel are yours to set up. The pairing notice was seen on a phone on 16 November 2026. Decided 16 November 2026 (D49), built in v0.2.2: each paired browser gets its own revocable token, and a phone can be paired from the computer with a one-time code (pairing a phone with the code was run live on one installation on 16 November 2026). No real provider or tunnel has been tried |
| Later | **FreeDuet in the cloud** | Free to install on your own computer, as today. For those who do not want to install, a hosted version for a small monthly subscription, without sign-in with a Claude plan | Planned (decided 15 November 2026) |
| Later | **Voice** | Members read answers aloud, and you can call them | In progress: a read-aloud button under each reply is built, off by default, with a local voice. Calls are not built yet. A spoken yes never approves. A message from the microphone always asks with the card (built in v0.2.1, not yet run with a real microphone) |
| Later | **Cam, the video member** | Cuts, subtitles, music and sound for short videos, as 16:9, 9:16 and 1:1 files, with ffmpeg in his own computer. He can offer a finished file in the chat, with a Download button | Built, not yet run live |
| Later | **Cam makes new clips and pictures with AI models** | New short clips and pictures from a text or a picture. Free first, on your own graphics card through a local tool you install (such as ComfyUI or Wan2GP); paid cloud models only if you switch them on, with the price on the card before every paid generation and a daily cap | Planned (decided 15 November 2026) |
| Later | **Try FreeDuet before you connect an engine** | A sample mode, right after installing: the team answers with prepared, labelled sample answers, and nothing is sent, spent or changed in your accounts | Planned (decided 15 November 2026) |
| Later | **"Full access" option** | An optional setting, off by default, chosen per member, to act without approval cards for what the fixed rule's words do not find, and for payments they find, with no limit on the amount until spending caps exist (v0.4). A password, credential or security setting that the words find still needs you ([docs/FULL_ACCESS.md](docs/FULL_ACCESS.md)) | Built, not yet run live |
| Later | **"Full access" without payments** | A second setting of the same choice: acts without approval cards, but a payment that the fixed rule's words find is still handed to you ([docs/FULL_ACCESS.md](docs/FULL_ACCESS.md)) | Built, not yet run live |

The full list, with the constraints on each item and what will not change, is in [docs/ROADMAP.md](docs/ROADMAP.md). The milestones v0.2 to v1.0 (Codex, engine chains, the savings meter, purchase permits, Grok Bot import) keep their acceptance criteria in [docs/PROJECT.md](docs/PROJECT.md).

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
