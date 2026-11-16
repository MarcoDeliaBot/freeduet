# FreeDuet compared

What FreeDuet does that the others don't, row by row.

**Legend:** ✅ available today · ⚠️ partly · 🚧 in progress · 🗓️ planned · ❌ no · — not documented by the project.
**FreeDuet is at v0.2.2, an early release (16 November 2026).** A ✅ means you can use it today, in a published version: never something still to come. Where FreeDuet does not have something yet, its cell says so with 🚧 (being built, not released) or 🗓️ (decided, not started) and the version it is meant for, as on the [roadmap](ROADMAP.md#how-to-read-the-tables). Nothing on the roadmap has a date.

_Last checked: 2026-11-08, from each project's public README and documentation, linked below. If we got something wrong about another project, open an issue and we will fix it within 48 hours._

| | **FreeDuet** | Claude Duet | OpenDuet / OpenBot | open-duet (Anil-matcha) | openbot (nightly-labs) | Agency (browser-use) | OpenMausBot |
|---|---|---|---|---|---|---|---|
| **Open source, free for business use** | ✅ MIT | ❌ closed product | ✅ MIT | ✅ Apache-2.0 | ❌ non-commercial license | ⚠️ code public, no license | ✅ Apache-2.0, with an `enterprise/` folder under its own licence |
| **Self-hosted, your data stays with you** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ local only | ✅ local-first |
| **Available outside the United States** | ✅ | ❌ US waitlist | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Runs on subscriptions you already pay for, through the official login** | ✅ | ✅ Claude plans only | ⚠️ only by storing a plan token | ✅ | ✅ | ✅ | ✅ Claude, Codex, Grok |
| **Works with zero API keys** | ✅ | ✅ | ⚠️ only with a stored plan token | ✅ | ✅ | ✅ | ✅ |
| **Several subscriptions, switching automatically when one hits its limit** | ⚠️ Built in v0.2, not yet run live: only test engines have switched (milestone v0.3) | ❌ | ❌ | ⚠️ one backup engine | — | — | — |
| **API keys optional, always last, with spending caps** | ⚠️ Built, off by default: a second engine kind, and a spend ledger with paid gateways closed (milestone v0.3) | — | — | — | — | — | — |
| **Savings meter: what the work would cost at token prices** | 🗓️ Planned (v0.3) | ❌ | ❌ | ⚠️ token use and cost | — | — | — |
| **Each agent has its own computer with a real browser** | ✅ | ✅ | ✅ | ⚠️ computer without a browser, experimental | ✅ shared with your machine | ⚠️ uses your own Chrome | ⚠️ cloud desktop (paid), local VM or your computer |
| **Asks before every send, payment, signature or deletion** | ✅ by default. Routines always ask, a tool nobody classified asks first, and a spoken yes never approves. An optional Full access, per member, off until you turn it on, in two settings: one lets it act without cards, the other still asks for payments (built; not yet run live) | ✅ | ✅ | ✅ | ❌ full access by design | ⚠️ policy followed by the agent, not enforced by the app | ⚠️ asks before commands and file edits |
| **Passwords never reach the AI (masked box, take over the screen)** | ✅ | — | ✅ | — | — | ⚠️ asks for none | — |
| **Shops and books for you, with your approval** | ⚠️ Built: Jules prepares carts and books with your approval. Permits and spending caps are planned (v0.4) | ❌ not suited to errands or bookings | ⚠️ browser and approvals, no purchase flow | ❌ | ⚠️ browser, no approvals | — | — |
| **Payments blocked without a single-use permit bound to shop and total** | 🗓️ Planned (v0.4) | — | ❌ | ❌ | ❌ | ❌ | — |
| **Spending cap per purchase, per day and per month** | 🗓️ Planned (v0.4) | — | ❌ | ❌ | ❌ | ❌ | — |
| **A lead agent that hands work to specialists and combines the results** | ⚠️ Iris hands each part to the right specialist and reports back; one combined answer from several specialists is planned (v0.3) | — | ⚠️ several agents in one channel | ✅ | ✅ | ✅ | ⚠️ channels with responder rules |
| **A ready-made team of specialists** | ✅ 12 members with a reviewer, and growing. Mark (marketing) and Cam (video) came after v0.1; only Otto sends email, and a member can offer a finished file with a Download button (built; not yet run live; their eval cases ran on 15 November 2026, and two of Cam's did not pass there) | ❌ one agent | ⚠️ 2 agents and example templates | ❌ | — | ❌ | ⚠️ teams from Markdown playbooks |
| **An agent that designs new agents, with tests** | ✅ | — | ⚠️ creator skill, no tests | — | ⚠️ skill creator | — | ⚠️ creates bots through MCP, no tests |
| **Guardian that pauses a looping agent to protect your limits** | 🗓️ Planned (v0.3) | — | — | — | — | — | — |
| **Owner-only operations no mode can lower** | ⚠️ v0.2: the one exception only you can make is Full access (off by default, per member, with or without payments). Permissions, passwords, keys and security settings stay with you: each installation makes its own secrets, each computer has its own token, and home network access is off until you switch it on. Chat can change only harmless, reversible settings, always with a card: how much a member may interrupt you (built; Undo not yet run in a browser), and, built in v0.2.1, not yet run live, a member's name, tone and language, with Undo | — | ⚠️ approvals, "Always allow" can lift them | — | ❌ | ⚠️ | — |
| **Nightly export of memory, rules and tasks to plain files** | 🗓️ Planned (v0.3) | ❌ | ❌ | — | — | ⚠️ local files | ⚠️ local transcripts |
| **Public test suite per agent, including attempts to break the rules** | ✅ 92 cases, 41 safety (the six newest, about Excel and Word files, about a program on the person's own computer, and two of Mark's, are not yet run live). Certified at v0.1 (43 of 43 scored cases passed). A full live run on v0.2.1 (15 November 2026) passed 66 of 73 scored cases and did not meet the thresholds; its report is not published yet | — | ⚠️ inbox triage only | — | — | — | — |
| **Free open-source creative suite (images, PDFs, vectors, video) inside each agent's computer** | ❌ Not built yet: planned in the connector catalogue (the ArtCraft apps, milestones M2 to M5). Cam's computer has ffmpeg, for video only | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| **Light helpers on free models for small jobs, saving your limits** | 🗓️ Planned (v0.3) | — | — | — | — | — | — |
| **Answers from your own documents, quoting the exact source** | ❌ Not built yet: the document member (Dewey) is only in the catalogue of planned members | — | ⚠️ document search | — | — | — | — |
| **Morning brief** | ✅ | ✅ | ✅ | ✅ | — | — | — |
| **Gmail and Google Calendar** | ✅ | ✅ connected apps | ✅ | ❌ not yet | — | ⚠️ through your coding agent | ✅ through Composio |
| **Import your agents from Grok Bot** | 🗓️ Planned (v1.0) | ❌ | ❌ | ❌ | ✅ | ❌ | — |
| **Phone** | In progress: a phone's browser with a real sign-in. The exact-address sign-in list is built. A remote session has limited powers, built in v0.2.1, not yet run live. A phone was paired with a one-time code on one installation on 16 November 2026; no real provider or tunnel has been tried | ✅ | ✅ | ⚠️ early, from source | ✅ | ❌ | ⚠️ in development |
| **Any language** | The app's interface is English for now, with some cards also in Italian; members answer in the person's language. | — | — | ✅ 13 interface languages | ✅ 5 interface languages | — | — |

## What others have that FreeDuet does not have yet

The rows above are mostly where FreeDuet differs. These rows are the other way round: things that at least one project below documents and FreeDuet lacks today. The FreeDuet cell is its status on the [roadmap](ROADMAP.md), in words. Same markers as above.

_Last checked: 2026-11-14, from each project's own README and the documentation pages it links, listed in Sources. Claude Duet is a closed product and we found no primary documentation for these rows, so its cells say — and we make no claim either way._

| | **FreeDuet** | Claude Duet | OpenDuet / OpenBot | open-duet (Anil-matcha) | openbot (nightly-labs) | Agency (browser-use) | OpenMausBot |
|---|---|---|---|---|---|---|---|
| **Desktop app with installers** | In progress: first-step scripts for Ubuntu 22.04 and 24.04 and for Windows through WSL2 (run from a terminal; the Windows one has never run on a real Windows machine). CI runs the check, apt and Bun steps of the Ubuntu script on fresh Ubuntu containers. No double-click installer yet: it will reuse the desktop app that already exists, Windows next, then macOS | — | ✅ macOS and Windows | ⚠️ desktop app that runs from a source checkout; its installers are experimental and unsigned | ✅ macOS, Windows, Linux (AppImage) | ❌ runs from a checkout with Node.js | ✅ macOS, Windows, Ubuntu (Ubuntu in beta) |
| **Automations written in chat, with a calendar of runs and a run history** | In progress: the Routines page has Next runs (the next 14 days) and History (the last 100 runs, up to 90 days back), both read-only; a missed run is marked Missed, and each run links to its conversation. Writing one in chat and setting one up out of the box are not built yet. Routines always ask for approval (built; not yet run live) | — | ⚠️ routines from a sentence, no calendar documented | ⚠️ routines (scheduled, webhook or manual) with a run history, and a tasks calendar; making one from a chat sentence is not documented | — | — | ✅ schedules, webhooks and app events, from a sentence, with a calendar and run history |
| **A whole team installed or shared from one file** | In progress: the file format and its checker are built. Export is built in v0.2.1, not yet seen in a browser: an administrator at the computer downloads one member or the whole team, with no credentials and no chat history in the file. Import is not built yet | — | — | ✅ team packages, importable from GitHub | ⚠️ imports agents from a Grok Bot export file; sharing a team is not documented | — | ✅ a team from one Markdown file, or a whole department shared as one file; no chat history, keys or computers inside |
| **Engines page showing each engine's status and limits** | An Engines page in Admin shows each engine's state, including until when a limit lasts, and each member's chain, with automatic or ask-first for each member and an Undo (built; not yet run live). No usage figures yet. In progress: usage, and the other controls (order, pin, off) | — | — | ✅ the engine picker shows "Usage limit · resets in …", and a fallback engine can take over | ⚠️ a usage popover with plan limits, documented for some providers | — | — |
| **A different engine for each agent, switchable in the middle of a chat** | In progress: each member's chain is set in the installation's engines file and shown on the Engines page. Choosing an engine on the page, and switching in the middle of a chat, are not built yet | — | — | ⚠️ engine and model chosen per agent or per new chat; switching in the middle is not documented | ⚠️ a model per agent; switching in the middle is not documented | — | ✅ a model per bot, switchable mid-conversation |
| **An Engines or Providers settings page** | The Engines page in Admin shows each member's chain and offers automatic or ask-first per member, with Undo (built; not yet run live). In progress: its other controls (order, pin, off) | — | — | ✅ Settings → Engines | ✅ a Providers screen in settings | — | ✅ Settings → Engines, and keys in App Settings |
| **Local models (Ollama, LM Studio)** | Built, off by default: a key-free entry for a model on your computer through Ollama's Anthropic-compatible endpoint, and a second engine kind for a local router you run. Neither has run with a real model yet. LM Studio is not set up as an entry | — | — | ✅ through an OpenAI-compatible API | ✅ finds local model servers | — | ✅ any OpenAI-compatible endpoint, set in configuration; its docs name vLLM, LM Studio and Ollama |
| **Control from other tools and scripts (an MCP server, a command line)** | Not on the roadmap yet | — | — | — | — | — | ✅ an MCP server for clients such as Claude Desktop and Cursor, and an `openmausbot` command line |

Importing agents from another tool is in the main table above (Grok Bot import: Planned, v1.0).

## The short version

FreeDuet is the only project that combines **all three**:

1. **Your subscriptions, no API key**, with automatic switching between them (built, not yet run live).
2. **Real-world actions made safe**: payments need your approval, unless you turn on Full access for that member, and permits bound to the shop and the total, and spending caps, are planned for v0.4.
3. **A ready-made, tested team**, led by a Chief of Staff who delegates.

## Sources

- Claude Duet: [Anthropic announcement](https://www.anthropic.com), [TechCrunch](https://techcrunch.com), [Engadget](https://www.engadget.com) coverage of the research preview (October 2026).
- OpenDuet: https://github.com/CopilotKit/OpenDuet · OpenBot: https://github.com/CopilotKit/openbot
- open-duet (Anil-matcha): https://github.com/Anil-matcha/open-duet (the repository now calls itself Suparagent) and its `docs/ENGINES.md`, `docs/COMPUTERS.md`, `docs/TEAMS.md`, `docs/ROUTINES.md`, `docs/TASKS.md`, `docs/TEMPLATES.md`
- openbot (nightly-labs): https://github.com/nightly-labs/openbot and its `docs/architecture/providers.md`
- Agency (browser-use): https://github.com/browser-use/open-duet
- OpenMausBot: https://github.com/milind-soni/OpenMausBot (README of the CuriosityOS fork, checked 2026-11-08; the rows added on 2026-11-14 also use its `docs/custom-engines.md`, `docs/team-sharing.md`, `docs/mcp-server.md` and `docs/headless-cli.md`)
