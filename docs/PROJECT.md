# FreeDuet: project specification

_Version 1.0 of this document · 2026-11-07 · Status: approved for build_

## 1. In one sentence

FreeDuet is a self-hosted team of AI employees that runs on the AI subscriptions people already pay for, works on its own computers, asks before it acts, and never stops when one subscription runs out.

## 2. Why now

- Proactive "AI coworker" products launched through 2026: Claude Duet, OpenAI Dots, Meta Muse, Grok Bot and others. Claude Duet's research preview is open by waitlist only, and only in the United States.
- People already pay for one to three AI subscriptions. Agent apps make them pay again, per token.
- Open-source alternatives exist, but each one solves half the problem. OpenBot and OpenDuet have the best safety model (a computer per agent, approvals, audit) but run on metered API keys. Anil-matcha/open-duet and nightly-labs/openbot run on subscriptions through the official CLIs, but the first has no browser in its agent computers and the second runs agents with full access and no per-action approvals, under a non-commercial license.
- **No project has both: subscriptions and safe actions in the real world.** That is FreeDuet.

## 3. Who it is for

| Persona | Need | First win |
|---|---|---|
| Solo founder or freelancer | Admin eats the day: mail, invoices, contracts, bookings | "Iris, handle this morning's mail and invoice yesterday's job." |
| Small team | A shared assistant without per-seat agent fees | Each person signs in with their own plan; one install |
| Power user with several subscriptions | Get value from Claude, ChatGPT and more without paying twice | The savings meter |
| Self-hoster | Own the data, own the stack | One Docker command on a home server |

## 4. Principles

1. **Logins first; tokens only by choice.** Members run on the subscriptions the person signed in to. API keys and API credits, including those included in a plan, are off by default, switched on only by the person, always last in a chain, and capped. FreeDuet must start and work with zero API keys.
2. **Ask before acting.** Sending, paying, signing, booking, publishing and deleting always go through an approval the person sees.
3. **Never hold a subscription secret.** The person signs in to official tools through the provider's own flow.
4. **One member, one job.** Small, testable, replaceable members; a Chief of Staff in front.
5. **Thin fork, upstream first.** Extension points before patches; generic fixes go back to OpenBot.
6. **Every language.** Members reply in the language the person writes in; the interface is translatable.
7. **Measure before claiming.** Every member has evals; every release publishes its pass rate.

## 5. What we reuse, what we port, what we build

| Need | Source | How |
|---|---|---|
| Server, app, approvals, audit, a computer per member, secrets, routines, connectors | OpenBot (MIT) | Fork, unchanged |
| Morning brief, triage, tasks, pages, channels | OpenDuet (MIT) | Fork, unchanged |
| Engine adapters, limit detection, fallback rules, lead-and-specialists delegation | Anil-matcha/open-duet (Apache-2.0) | Port the design and, where the code fits, the code, with attribution |
| Importing agents from Grok Bot | Idea seen in nightly-labs/openbot (non-commercial license) | Build our own, from scratch |
| One-click decision cards | Idea seen in browser-use/open-duet (no license) | Our own design, later |
| The team of nine | New | Written from scratch for FreeDuet |
| Subscription router, engine chains, savings meter, purchase permits, Engines page | New | Built in this project |

## 6. Features

Each feature lists the milestone that delivers it and how we know it is done.

### F1. The team on your login (M1)

Nine members defined in `openbot/examples/freeduet/agents.yaml`: Iris (Chief of Staff), Leo (Creator), Otto (Inbox), Portia (Counsel), Penny (Bookkeeper), Jules (Concierge), Wren (Writer), Gus (Fixer), Basil (Chef), running through the subscription router on the person's own Claude Code login. Profiles in [TEAM.md](TEAM.md).

Done when: FreeDuet starts and works with **zero** API keys; every member passes its cases in `evals/team/cases.yaml` at **90%** or better on Claude Code, and **100%** of the safety cases (cases with `safety: true`).

### F2. Subscription router (M1 core, M2 more engines)

`agent-freeduet` runs each member on its own engine chain: logins first (Claude Code in M1; Codex and other permitted subscriptions in M2), then local models, then API engines only if the person switched them on. See [ARCHITECTURE.md §3](ARCHITECTURE.md).

Done when: approvals behave identically on every engine; a metered engine can never run first, whatever order a chain is written in; no credential file of a provider is ever read by FreeDuet code (checked by a test that watches file access).

### F3. Engines page (M2)

Status per engine (installed, signed in, available, limited until), sign-in instructions linking to the provider's own docs, the chain per member, the kill switch per provider.

Done when: a person with no engine signed in sees exactly what to do next, without reading any doc.

### F4. Never stops: engine chains and caps (M3)

Fallback only before an engine accepted the turn; metered engines only within caps; every switch shown in the conversation.

Done when: a simulated usage limit on the first engine moves the next turn to the second within one second; a limit hit mid-turn is reported, never moved; with the metered cap at €0 no metered call is ever made.

### F5. Savings meter (M3)

Ledger of usage per member and engine; API-equivalent value from the person's dated `prices.yaml`; monthly card in the app.

Done when: totals match the ledger to the cent; engines that do not report tokens are shown as "not measured", never estimated silently.

### F6. Real delegation (M3)

Iris's `delegate` tool, with results returning to her once all pieces are in.

Done when: the Iris cases that split one request across two or three members return one combined answer with no manual step.

### F7. Safe purchases and bookings (M4)

`request_purchase`, single-use permits bound to merchant and total, spending caps, the gateway rule on checkout clicks, hand-over on logins, codes and captchas, and a quality floor for the engine allowed to buy.

Done when: the red-team cases in `evals/team/cases.yaml` all fail safely; one real purchase of a low-cost item completes end to end with an approval, and one attempt above the cap is refused.

### F8. Import from Grok Bot (M5)

A prompt the person gives Grok Bot to export their agents as FreeDuet JSON ([import/grok-export-prompt.md](import/grok-export-prompt.md)), and an import page that maps them to new members, ready for review before saving.

Done when: an export with three agents imports as three draft members; nothing is saved without the person's confirmation; imported members get the shared rules added automatically.

### F9. Phone first (M5)

The OpenBot app on the phone, plus notifications for approvals. Optional Telegram channel if OpenBot's channel model allows it without patching the core.

## 7. Milestones

Durations are estimates for one maintainer with a coding agent.

| Milestone | Scope | Demo that closes it | Estimate |
|---|---|---|---|
| **M0 Fork** | Repository from OpenDuet with history; rename to FreeDuet; tenant package in place; OpenBot's plan-token option removed; telemetry off by default; list of every server-side model call; CI green | `scripts/start.sh` opens FreeDuet with Iris answering | 2–3 days |
| **M1 v0.1 The team on your login** | `agent-freeduet` with the Claude Code adapter and the tool bridge; nine members routed through it; server-side model calls routed too; eval runner; Docker one-command start on Linux | Iris handles a mixed request on a Claude login, with no API key configured | 2–3 weeks |
| **M2 v0.2 More subscriptions** | Codex (after OpenAI's approval), ACP and OpenAI-compatible adapters (local models first, API keys optional and last); Engines page | A day of work across two logins with zero metered spend | 2 weeks |
| **M3 v0.3 Never stops** | Engine chains, caps, ledger, savings card, `delegate` | A limit hit live, work continues, savings card updates | 2 weeks |
| **M4 v0.4 Safe purchases** | `request_purchase`, permits, caps, checkout rule, hand-over, red-team suite | A real low-cost purchase with approval; an over-cap attempt refused | 2 weeks |
| **M5 v1.0 Launch** | Grok import, docs site, demo video, signed images on GHCR, launch | Public launch | 2 weeks |

## 8. Security and safety

The full threat model is in [SECURITY.md](../SECURITY.md). The controls, in short:

| Threat | Control |
|---|---|
| Prompt injection from mail, documents or web pages | Every prompt treats read content as data; actions still need approval; Otto reports suspicious instructions instead of obeying them |
| An agent spends money it should not | Purchase permits bound to merchant and total, single use, 10 minutes; caps; no "Always allow" for purchases; quality floor for the buying engine |
| Credentials leak | Subscription credentials never enter FreeDuet; site logins through the masked box or take-over; API keys encrypted and write-only; secrets redacted from audit |
| An agent touches the host | CLI engines run with no built-in tools; only the member's granted tools through the gateway; computers isolated per member |
| Data leaves unintentionally | OpenBot's outgoing-message checks; telemetry off by default; nothing sent to FreeDuet maintainers |
| Bad advice taken as professional advice | Portia and Penny always label output as a first review; Gus refuses do-it-yourself steps for dangerous work |

## 9. Compliance

- Provider terms: [PROVIDERS.md](PROVIDERS.md), re-verified every release.
- Licenses: MIT for FreeDuet; ported Apache-2.0 files keep their license; no code from non-commercial or unlicensed projects ([NOTICE.md](../NOTICE.md)).
- Trademarks: no third-party logos; a clear "not affiliated" line in the README and the app's About page. A trademark check on the name "FreeDuet" is done before launch (see §13).
- Privacy: self-hosted by design; personal data stays in the person's database and computers.

## 10. Quality

- **Evals** (`evals/team/`): per-member cases with must-include and must-not checks, including safety cases. Run in CI on every change to a prompt, a skill or an adapter, against a fixed reference engine.
- **Tests**: adapter tests with fake CLIs (the approach Anil-matcha/open-duet uses), gateway rule tests for permits, ledger arithmetic tests.
- **Releases**: semantic versions; signed container images; a changelog entry for every user-visible change; PROVIDERS.md date bumped.

## 11. Launch plan (M5)

1. A 60-second demo video: one request to Iris, three members working, a limit hit and the switch, an approval on the phone, the savings card.
2. README with a GIF at the top and the one-command install.
3. Same-week launch on Hacker News (Show HN), Reddit (r/selfhosted, r/LocalLLaMA, r/ClaudeAI), Product Hunt and X, with the angle: "the Duet-style team for everyone outside the waitlist, on the subscriptions you already have".
4. Answer every issue within 48 hours during the first month.

## 12. Measures of success

| Measure | Target 3 months after launch |
|---|---|
| GitHub stars | 2,000 |
| Image pulls | 5,000 |
| Eval pass rate on the reference engine | ≥ 90%, safety cases 100% |
| Purchases completed without an incident | 100% |
| Median time from clone to first answer | under 10 minutes |

No usage telemetry is collected; adoption is measured only through public numbers (stars, pulls, issues).

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A provider tightens its terms | High | High | Kill switch per provider; API fallback; PROVIDERS.md per release; official programs first |
| "Duet" is Anthropic's product name | Medium | High | Trademark check before launch; a reserve name ready; "not affiliated" everywhere |
| Upstream OpenBot changes fast | High | Medium | Thin fork, weekly upstream merge, our code in separate folders |
| CopilotKit Intelligence dependency | Medium | Medium | Free plan by default; follow the self-hosted option; isolate memory calls |
| An agent mistake costs money | Low with controls | High | F7 controls; low default caps; red-team suite |
| Maintainer time | High | Medium | Tight scope per milestone; contributors welcome after M1 |

## 14. Decisions taken

| Decision | Choice |
|---|---|
| Base | OpenDuet (OpenBot inside), forked with history |
| Name | FreeDuet (trademark check pending) |
| License | MIT |
| Language of the code and docs | English; members reply in the person's language |
| What v0.1 runs on | The person's own Claude Code login, with no API key; API credits only as an optional last step |
| Gemini and GLM subscriptions | Off until terms allow; API keys work |
