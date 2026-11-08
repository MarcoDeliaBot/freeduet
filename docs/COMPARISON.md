# FreeDuet compared

What FreeDuet does that the others don't, row by row.

**Legend:** ✅ yes · ⚠️ partly · ❌ no · — not documented by the project.
**FreeDuet is pre-alpha.** A ✅ with a version (for example ✅ v0.3) means it is planned for that version and not available yet.

_Last checked: 2026-11-07, from each project's public README and documentation, linked below. If we got something wrong about another project, open an issue and we will fix it within 48 hours._

| | **FreeDuet** | Claude Duet | OpenDuet / OpenBot | open-duet (Anil-matcha) | openbot (nightly-labs) | Agency (browser-use) |
|---|---|---|---|---|---|---|
| **Open source, free for business use** | ✅ MIT | ❌ closed product | ✅ MIT | ✅ Apache-2.0 | ❌ non-commercial license | ⚠️ code public, no license |
| **Self-hosted, your data stays with you** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ local only |
| **Available outside the United States** | ✅ | ❌ US waitlist | ✅ | ✅ | ✅ | ✅ |
| **Runs on subscriptions you already pay for, through the official login** | ✅ v0.1 | ✅ Claude plans only | ⚠️ only by storing a plan token | ✅ | ✅ | ✅ |
| **Works with zero API keys** | ✅ v0.1 | ✅ | ⚠️ only with a stored plan token | ✅ | ✅ | ✅ |
| **Several subscriptions, switching automatically when one hits its limit** | ✅ v0.3 | ❌ | ❌ | ⚠️ one backup engine | — | — |
| **API keys optional, always last, with spending caps** | ✅ v0.3 | — | — | — | — | — |
| **Savings meter: what the work would cost at token prices** | ✅ v0.3 | ❌ | ❌ | ⚠️ token use and cost | — | — |
| **Each agent has its own computer with a real browser** | ✅ | ✅ | ✅ | ⚠️ computer without a browser, experimental | ✅ shared with your machine | ⚠️ uses your own Chrome |
| **Asks before every send, payment, signature or deletion** | ✅ | ✅ | ✅ | ✅ | ❌ full access by design | ⚠️ policy followed by the agent, not enforced by the app |
| **Passwords never reach the AI (masked box, take over the screen)** | ✅ | — | ✅ | — | — | ⚠️ asks for none |
| **Shops and books for you, with your approval** | ✅ v0.4 | ❌ not suited to errands or bookings | ⚠️ browser and approvals, no purchase flow | ❌ | ⚠️ browser, no approvals | — |
| **Payments blocked without a single-use permit bound to shop and total** | ✅ v0.4 | — | ❌ | ❌ | ❌ | ❌ |
| **Spending cap per purchase, per day and per month** | ✅ v0.4 | — | ❌ | ❌ | ❌ | ❌ |
| **A lead agent that hands work to specialists and combines the results** | ✅ v0.3 | — | ⚠️ several agents in one channel | ✅ | ✅ | ✅ |
| **A ready-made team of specialists** | ✅ 10 members, with a reviewer | ❌ one agent | ⚠️ 2 agents and example templates | ❌ | — | ❌ |
| **An agent that designs new agents, with tests** | ✅ | — | ⚠️ creator skill, no tests | — | ⚠️ skill creator | — |
| **Guardian that pauses a looping agent to protect your limits** | ✅ v0.3 | — | — | — | — | — |
| **Owner-only operations no mode can lower** | ✅ v0.1 | — | ⚠️ approvals, "Always allow" can lift them | — | ❌ | ⚠️ |
| **Nightly export of memory, rules and tasks to plain files** | ✅ v0.3 | ❌ | ❌ | — | — | ⚠️ local files |
| **Public test suite per agent, including attempts to break the rules** | ✅ 40 cases, 15 safety | — | ⚠️ inbox triage only | — | — | — |
| **Free open-source creative suite (images, PDFs, vectors, video) inside each agent's computer** | ✅ v0.2 | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Morning brief** | ✅ | ✅ | ✅ | ✅ | — | — |
| **Gmail and Google Calendar** | ✅ | ✅ connected apps | ✅ | ❌ not yet | — | ⚠️ through your coding agent |
| **Import your agents from Grok Bot** | ✅ v1.0 | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Phone** | ✅ | ✅ | ✅ | ⚠️ early, from source | ✅ | ❌ |
| **Any language** | ✅ | — | — | ✅ 13 interface languages | ✅ 5 interface languages | — |

## The short version

FreeDuet is the only project that combines **all three**:

1. **Your subscriptions, no API key**, with automatic switching between them.
2. **Real-world actions made safe**: payments physically blocked without a permit bound to the shop and the total, and spending caps.
3. **A ready-made, tested team**, led by a Chief of Staff who delegates.

## Sources

- Claude Duet: [Anthropic announcement](https://www.anthropic.com), [TechCrunch](https://techcrunch.com), [Engadget](https://www.engadget.com) coverage of the research preview (October 2026).
- OpenDuet: https://github.com/CopilotKit/OpenDuet · OpenBot: https://github.com/CopilotKit/openbot
- open-duet (Anil-matcha): https://github.com/Anil-matcha/open-duet and its `docs/ENGINES.md`, `docs/COMPUTERS.md`, `docs/TEAMS.md`
- openbot (nightly-labs): https://github.com/nightly-labs/openbot
- Agency (browser-use): https://github.com/browser-use/open-duet
