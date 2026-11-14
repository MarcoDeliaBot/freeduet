# FreeDuet compared

What FreeDuet does that the others don't, row by row.

**Legend:** ✅ yes · ⚠️ partly · ❌ no · — not documented by the project.
**FreeDuet is at v0.1, an early release.** A ✅ with a later version (for example ✅ v0.3) means it is planned for that version and not available yet. Where FreeDuet does not have something yet, its cell says where it stands on the [roadmap](ROADMAP.md#how-to-read-the-tables) in words: Planned, In design, In progress, or Not on the roadmap yet (we have not decided). Nothing on the roadmap has a date.

_Last checked: 2026-11-08, from each project's public README and documentation, linked below. If we got something wrong about another project, open an issue and we will fix it within 48 hours._

| | **FreeDuet** | Claude Duet | OpenDuet / OpenBot | open-duet (Anil-matcha) | openbot (nightly-labs) | Agency (browser-use) | OpenMausBot |
|---|---|---|---|---|---|---|---|
| **Open source, free for business use** | ✅ MIT | ❌ closed product | ✅ MIT | ✅ Apache-2.0 | ❌ non-commercial license | ⚠️ code public, no license | ✅ Apache-2.0, with an `enterprise/` folder under its own licence |
| **Self-hosted, your data stays with you** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ local only | ✅ local-first |
| **Available outside the United States** | ✅ | ❌ US waitlist | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Runs on subscriptions you already pay for, through the official login** | ✅ v0.1 | ✅ Claude plans only | ⚠️ only by storing a plan token | ✅ | ✅ | ✅ | ✅ Claude, Codex, Grok |
| **Works with zero API keys** | ✅ v0.1 | ✅ | ⚠️ only with a stored plan token | ✅ | ✅ | ✅ | ✅ |
| **Several subscriptions, switching automatically when one hits its limit** | ✅ v0.3 | ❌ | ❌ | ⚠️ one backup engine | — | — | — |
| **API keys optional, always last, with spending caps** | ✅ v0.3 | — | — | — | — | — | — |
| **Savings meter: what the work would cost at token prices** | ✅ v0.3 | ❌ | ❌ | ⚠️ token use and cost | — | — | — |
| **Each agent has its own computer with a real browser** | ✅ | ✅ | ✅ | ⚠️ computer without a browser, experimental | ✅ shared with your machine | ⚠️ uses your own Chrome | ⚠️ cloud desktop (paid), local VM or your computer |
| **Asks before every send, payment, signature or deletion** | ✅ by default; an optional Full access switch, per member, off until you turn it on | ✅ | ✅ | ✅ | ❌ full access by design | ⚠️ policy followed by the agent, not enforced by the app | ⚠️ asks before commands and file edits |
| **Passwords never reach the AI (masked box, take over the screen)** | ✅ | — | ✅ | — | — | ⚠️ asks for none | — |
| **Shops and books for you, with your approval** | ✅ v0.4 | ❌ not suited to errands or bookings | ⚠️ browser and approvals, no purchase flow | ❌ | ⚠️ browser, no approvals | — | — |
| **Payments blocked without a single-use permit bound to shop and total** | ✅ v0.4 | — | ❌ | ❌ | ❌ | ❌ | — |
| **Spending cap per purchase, per day and per month** | ✅ v0.4 | — | ❌ | ❌ | ❌ | ❌ | — |
| **A lead agent that hands work to specialists and combines the results** | ✅ v0.3 | — | ⚠️ several agents in one channel | ✅ | ✅ | ✅ | ⚠️ channels with responder rules |
| **A ready-made team of specialists** | ✅ 12 members with a reviewer, and growing | ❌ one agent | ⚠️ 2 agents and example templates | ❌ | — | ❌ | ⚠️ teams from Markdown playbooks |
| **An agent that designs new agents, with tests** | ✅ | — | ⚠️ creator skill, no tests | — | ⚠️ skill creator | — | ⚠️ creates bots through MCP, no tests |
| **Guardian that pauses a looping agent to protect your limits** | ✅ v0.3 | — | — | — | — | — | — |
| **Owner-only operations no mode can lower** | ⚠️ v0.1: one exception only you can make, Full access (off by default, per member). Permissions, passwords, keys and security settings stay with you either way | — | ⚠️ approvals, "Always allow" can lift them | — | ❌ | ⚠️ | — |
| **Nightly export of memory, rules and tasks to plain files** | ✅ v0.3 | ❌ | ❌ | — | — | ⚠️ local files | ⚠️ local transcripts |
| **Public test suite per agent, including attempts to break the rules** | ✅ 55 cases, 23 safety | — | ⚠️ inbox triage only | — | — | — | — |
| **Free open-source creative suite (images, PDFs, vectors, video) inside each agent's computer** | ✅ v0.2 | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| **Light helpers on free models for small jobs, saving your limits** | ✅ v0.3 | — | — | — | — | — | — |
| **Answers from your own documents, quoting the exact source** | ✅ v0.2 | — | ⚠️ document search | — | — | — | — |
| **Morning brief** | ✅ | ✅ | ✅ | ✅ | — | — | — |
| **Gmail and Google Calendar** | ✅ | ✅ connected apps | ✅ | ❌ not yet | — | ⚠️ through your coding agent | ✅ through Composio |
| **Import your agents from Grok Bot** | ✅ v1.0 | ❌ | ❌ | ❌ | ✅ | ❌ | — |
| **Phone** | In design | ✅ | ✅ | ⚠️ early, from source | ✅ | ❌ | ⚠️ in development |
| **Any language** | ✅ | — | — | ✅ 13 interface languages | ✅ 5 interface languages | — | — |

## What others have that FreeDuet does not have yet

The rows above are mostly where FreeDuet differs. These rows are the other way round: things that at least one project below documents and FreeDuet lacks today. The FreeDuet cell is its status on the [roadmap](ROADMAP.md), in words. Same markers as above.

_Last checked: 2026-11-14, from each project's own README and the documentation pages it links, listed in Sources. Claude Duet is a closed product and we found no primary documentation for these rows, so its cells say — and we make no claim either way._

| | **FreeDuet** | Claude Duet | OpenDuet / OpenBot | open-duet (Anil-matcha) | openbot (nightly-labs) | Agency (browser-use) | OpenMausBot |
|---|---|---|---|---|---|---|---|
| **Desktop app with installers** | Planned: a one-file installer for Windows, macOS and Ubuntu, the top priority. Whether it becomes a native app window is not decided | — | ✅ macOS and Windows | ⚠️ desktop app that runs from a source checkout; its installers are experimental and unsigned | ✅ macOS, Windows, Linux (AppImage) | ❌ runs from a checkout with Node.js | ✅ macOS, Windows, Ubuntu (Ubuntu in beta) |
| **Automations written in chat, with a calendar of runs and a run history** | In design: routines from a sentence exist once a member has the routine tools; the calendar, the history and setting one up out of the box are planned | — | ⚠️ routines from a sentence, no calendar documented | ⚠️ routines (scheduled, webhook or manual) with a run history, and a tasks calendar; making one from a chat sentence is not documented | — | — | ✅ schedules, webhooks and app events, from a sentence, with a calendar and run history |
| **A whole team installed or shared from one file** | Planned: no credentials and no chat history in the file | — | — | ✅ team packages, importable from GitHub | ⚠️ imports agents from a Grok Bot export file; sharing a team is not documented | — | ✅ a team from one Markdown file, or a whole department shared as one file; no chat history, keys or computers inside |
| **Engines page showing each engine's status and limits** | Planned: it comes with the engine work | — | — | ✅ the engine picker shows "Usage limit · resets in …", and a fallback engine can take over | ⚠️ a usage popover with plan limits, documented for some providers | — | — |
| **A different engine for each agent, switchable in the middle of a chat** | Per member: Planned. Switching in the middle of a chat: Not on the roadmap yet | — | — | ⚠️ engine and model chosen per agent or per new chat; switching in the middle is not documented | ⚠️ a model per agent; switching in the middle is not documented | — | ✅ a model per bot, switchable mid-conversation |
| **An Engines or Providers settings page** | Planned: the Engines page comes with the engine work | — | — | ✅ Settings → Engines | ✅ a Providers screen in settings | — | ✅ Settings → Engines, and keys in App Settings |
| **Local models (Ollama, LM Studio)** | Planned: it comes with the engine work | — | — | ✅ through an OpenAI-compatible API | ✅ finds local model servers | — | ✅ any OpenAI-compatible endpoint, set in configuration; its docs name vLLM, LM Studio and Ollama |
| **Control from other tools and scripts (an MCP server, a command line)** | Not on the roadmap yet | — | — | — | — | — | ✅ an MCP server for clients such as Claude Desktop and Cursor, and an `openmausbot` command line |

Importing agents from another tool is in the main table above (Grok Bot import: Planned, v1.0).

## The short version

FreeDuet is the only project that combines **all three**:

1. **Your subscriptions, no API key**, with automatic switching between them.
2. **Real-world actions made safe**: payments physically blocked without a permit bound to the shop and the total, and spending caps.
3. **A ready-made, tested team**, led by a Chief of Staff who delegates.

## Sources

- Claude Duet: [Anthropic announcement](https://www.anthropic.com), [TechCrunch](https://techcrunch.com), [Engadget](https://www.engadget.com) coverage of the research preview (October 2026).
- OpenDuet: https://github.com/CopilotKit/OpenDuet · OpenBot: https://github.com/CopilotKit/openbot
- open-duet (Anil-matcha): https://github.com/Anil-matcha/open-duet (the repository now calls itself Suparagent) and its `docs/ENGINES.md`, `docs/COMPUTERS.md`, `docs/TEAMS.md`, `docs/ROUTINES.md`, `docs/TASKS.md`, `docs/TEMPLATES.md`
- openbot (nightly-labs): https://github.com/nightly-labs/openbot and its `docs/architecture/providers.md`
- Agency (browser-use): https://github.com/browser-use/open-duet
- OpenMausBot: https://github.com/milind-soni/OpenMausBot (README of the CuriosityOS fork, checked 2026-11-08; the rows added on 2026-11-14 also use its `docs/custom-engines.md`, `docs/team-sharing.md`, `docs/mcp-server.md` and `docs/headless-cli.md`)
