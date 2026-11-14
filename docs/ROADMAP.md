# FreeDuet roadmap

This page lists what is planned, in the order we currently think it matters. **Nothing here is promised with a date.** A feature is called available only after it runs and is tested ([README: what is tested](../README.md#what-is-tested-and-what-is-not)).

## Where FreeDuet is today

- **Version:** v0.1, 13 November 2026, an early release built and used by one maintainer.
- **Team:** twelve members. Iris is the Chief of Staff; the others each have one job ([TEAM.md](TEAM.md)).
- **Engine:** your own Claude subscription, through the unmodified Claude Code login. No API key.
- **Where it runs:** Windows with WSL2, and Linux. macOS has not been tested.
- **What you need:** Docker, Bash and Bun, set up by hand.
- **Tests:** the team evals passed on v0.1 (each member at 100% of its scored cases, safety cases 45 of 45 runs). The cases of Mark (four) and Cam (six) have not been run live yet.

## How to read the tables

| Word | Meaning |
|---|---|
| **Now** | The next things to be worked on. |
| **Next** | After that. Several of these can start once the first group is done. |
| **Later** | Wanted, but waiting on a decision, a design or something in Now or Next. |
| **Planned** | We want it and have not started designing it. |
| **In design** | The shape is being worked out; options are still open. |
| **In progress** | Work has started. |

The order inside a group is not a ranking, except that the one-file installer is the top priority overall: it is today's biggest barrier.

## Now

| Item | What you get | Status | Constraints |
|---|---|---|---|
| **One-file installer** for Windows, macOS and Ubuntu | You download one file, double-click it, and FreeDuet starts. No Docker, Bash or Bun to set up by hand. | Planned | Top priority. FreeDuet must still start with no API key, and the Claude sign-in stays yours: FreeDuet never reads or stores it. A platform is called supported only after a test run on that platform. |
| **A growing team** | New ready-made members added over time. Mark, the marketer, and Cam, the video maker, are the first two after v0.1. Anyone can already train their own member (ask Leo, or write it yourself). | In progress (ongoing) | A member is added with its own evals. The catalogue of planned members is in [CATALOG.md](CATALOG.md). |
| **More evals for each new member** | A new member is tested before it is called ready. | Planned | Each member must reach at least 90% of its cases and the safety cases 100% ([evals/team/README.md](../evals/team/README.md)). The cases of Mark and Cam still need their first live run. Evals run by hand on a separate stack. |
| **New connector tools reach existing connections** (issue #102) | Today a connector connected before a tool existed never gets that tool. With this, the tool list refreshes by itself at start (for connectors whose list is built in, such as Gmail), and you get one card to allow the new tool. The message that says "ask an administrator" will say you can do it yourself, because on your own installation that is you. | Planned (decided 14 November 2026) | No member gets a new sending tool by itself: you allow it once. Approvals do not change: a tool that sends, pays, signs, books or deletes still asks. |
| **Email goes through the member who sends it** | Only the member with the sending tools (Otto) sends email. Another member either hands Iris a finished draft for Otto to send, or asks Iris and Otto writes and sends it. Iris is the judge: when she says no, the question comes to you and you decide. | Planned (decided 14 November 2026) | No other member is given sending tools to save a step. A hand-off never turns into an approval: the send still meets the approval gate, with the two exceptions listed under "What will not change". Needs its own eval cases. |
| **A secret per installation for the no-sign-in mode** | On installs where containers reach the server as if they were this machine (Docker Desktop), who you are must not rest on network position alone. | Planned | Closed on 14 November 2026 for Linux and WSL: the implicit administrator is this machine's loopback only. The Docker Desktop case is what this item is for. |

## Next

| Item | What you get | Status | Constraints |
|---|---|---|---|
| **Every engine, chosen per member** | You pick the engine for each team member: Claude, Codex, Grok, local models and others. When one engine reaches its limit, FreeDuet moves to the next one in that member's list by itself, and tells you. An Engines dashboard shows every engine (signed in, available or limited until, usage) and is where you set the order, choose automatic or ask-first, pin one engine, or turn one off. OpenRouter, and any Anthropic-compatible endpoint you run or choose yourself, are part of the first release. You can also change a member's engine in the middle of a conversation. | Planned | **Logins first** ([PROVIDERS.md](PROVIDERS.md)): an engine comes in through your own subscription login first. A metered API key is never first in a chain and never on by default. A switch never silently repeats something already done. A gateway is the provider's own service, with its own limits and terms, and FreeDuet ships none. A model counts as supported only after the evals pass on it. A route whose provider terms are unclear ships off. Codex waits for OpenAI's approval, and Codex and Grok are offered only after their terms are checked. The goal is that Iris picks the engine that fits each task by herself; the first version only proposes and records, so its choices can be checked. The plan: [ENGINES_PLAN.md](ENGINES_PLAN.md). |
| **Never stops: engine chains, caps and the savings meter** (milestone v0.3 in [PROJECT.md](PROJECT.md)) | When one subscription reaches its limit, the work moves to the next, and you can see what the work would have cost at pay-per-token prices. | Planned | Needs more than one engine first. Metered engines only if you switch them on, always last, always capped. |
| **Real delegation** (v0.3) | You ask Iris once; she splits the job across members and brings back one combined answer. | Planned | Today each member answers through Iris. A hand-off never turns into an approval for an account action. |
| **Teams and members from one file** | Export a whole team, or a single member, as one portable file. Import one someone shared with you. People can share and install members. | Planned | No credentials and no chat history inside the file. An imported member goes through the same approval gate as any other. Fits "the team grows". |
| **Bring your data from other agents** | Import skills, memory and settings from the agent tools you already use, so you do not start from zero. | Planned | Nothing is saved without your confirmation. Approvals do not change. |
| **Automations written in chat**, with a calendar and history | You say "every Monday at 9, do this", and see a calendar of scheduled runs and a history of what ran. | In design | Routines already exist in the OpenBot base: a member makes one from a sentence once it has been granted the routine tools, and FreeDuet makes the daily review routine for you. The calendar view, the history and setting one up out of the box are what is planned. An automation never sends, pays, signs, books or deletes without your approval. |
| **Settings changed in chat, with Undo** | You tell a member "send the summary at 7 instead of 8:30" or "pause that routine until Monday" and it is done, with an Undo button in the chat and a list of every change members made. | Planned | Only harmless, reversible settings: routine times, tone, language, names, notifications, pausing a routine. Security settings (approvals, Full access, connected accounts, members' permissions, paid engines) are never changed by a member: only by you, in the app. Shares its mechanism with automations written in chat. |
| **A control dashboard** | One place in the app where you see and decide everything: every setting of the team, and which settings members may change in chat. You do not have to be technical to use it. | Planned | The person always has the last word. Builds on the Engines dashboard. It also gets a credentials panel: one place to add, see and remove the keys of gateways and metered engines. Subscription logins are never stored there. |
| **Many more connected apps** | Hundreds of apps, not the few of today (Gmail, Calendar and a handful of others). A connector hub such as Composio is one option under evaluation. | In design | Official connector first, then the browser, then screen control ([CONNECTORS.md](CONNECTORS.md)). A tool's own terms come first. Whether a hub fits FreeDuet's rule that sign-in happens in the tool's own flow and FreeDuet stores no passwords is part of the evaluation. Account actions keep asking for approval. |
| **Phone** | Use FreeDuet from your phone, and get approval requests there. | In design | Pairing with a link is the design under evaluation, next to sign-in with Google for remote access. Never exposed publicly without a login. Not available in v0.1. |
| **Remote access to your own FreeDuet** | Reach your FreeDuet from outside your home network. | In design | A real sign-in, in front of TLS ([SECURITY.md](../SECURITY.md)). Today the app listens on localhost only. |
| **macOS certification** | A tested start on a real Mac. | Planned | Today CI starts FreeDuet on Linux only, and the maintainer runs it on Windows. Goes with the installer. |
| **The app in more languages** | Italian and other languages in menus and settings. | Planned | Today the app is in English. Members already reply in your language, and a few cards are translated into Italian ([M1_PLAN.md](M1_PLAN.md), D26). |

## Later

| Item | What you get | Status | Constraints |
|---|---|---|---|
| **Voice** | Members read answers aloud, and you can call them. | Planned | Optional local dictation exists today and is off by default. The voice engine for reading aloud and calls is not chosen yet. |
| **Cam, the video member** | A member that cuts and assembles short videos from your footage (given as a link) or from a script, adds subtitles, music and sound, and exports 16:9, 9:16 and 1:1 MP4 files, with ffmpeg in his own computer. | Built; not yet run live | **Built:** his prompt, six eval cases, five skills of his own (cut and assemble, subtitles, music and sound, export formats, and an optional outside library for films drawn by code that you install yourself), and ffmpeg, git and python3 with venv in the computer image. **Not built:** handing a finished file over from the chat (the files stay in his computer and he says where; the server has a download route that no screen or member tool uses yet, and what to do about it is not decided), footage attached to the chat (it takes pictures and text, not video), and a live eval run. He never publishes or uploads: publishing a video is always your own step or an approval, and music, footage, faces and voices are used only after you say the rights are yours. |
| **"Full access" option** | An optional setting, chosen per member in Settings, that lets a member act without approval cards. In this setting it covers every action, payments and purchases included. | Built; not yet run live | Safe by default: off for every member until you turn it on, after a warning. **There is no limit on the amount until spending caps exist (v0.4)**, and the warning says so; the next row keeps payments asking. Passwords, credentials and security settings still go to you; it applies to your own chats and never to routines or check-ins; admin team rules still apply. What it does and does not cover: [FULL_ACCESS.md](FULL_ACCESS.md). |
| **"Full access" without payments** | A second setting of the same choice: the member sends, signs, books, publishes and deletes without asking, but a payment or a purchase always asks you. | Built; not yet run live | Decided 14 November 2026. You choose per member: off, Full access, or Full access without payments, and raising a choice needs a confirmation. A payment is whatever the safety checks already treat as one, the same checks as with the switch off, so a message that only talks about a payment may ask too, and a payment worded in an unusual way might not be caught. When one member hands work to another, the stricter of the two holds for payments. Same limits as Full access: your own chats only, never routines or check-ins; passwords, credentials and security settings still go to you. [FULL_ACCESS.md](FULL_ACCESS.md). |
| **Safe purchases** (v0.4) | Purchase permits tied to the exact shop and total, and spending caps. | Planned | Needs the engine work above. Payments stay blocked without an approval. |
| **Import from Grok Bot** (v1.0) | Bring the agents you built in Grok Bot into FreeDuet ([how](import/grok-export-prompt.md)). | Planned | Nothing is saved without your confirmation. Our own code, written from scratch ([NOTICE.md](../NOTICE.md)). |

## Smaller items already known

- Local models and the Engines page ([PROJECT.md](PROJECT.md), F2 and F3) come with the engine work above.
- The other connectors in the catalogue ([CONNECTORS.md](CONNECTORS.md)) are built one by one, each with the milestone shown there.

## What will not change

These hold whatever else on this page moves.

- **Logins first.** Members run on the subscriptions you signed in to. A metered API key or API credit is never first, never on by default, and always capped ([PROVIDERS.md](PROVIDERS.md)).
- **Your approval for real account actions, by default.** Sending, paying, signing, booking, publishing and deleting wait for you. There are two exceptions, and both are yours: a new email to an address you typed yourself in your own message (D27 in [M1_PLAN.md](M1_PLAN.md)), and "Full access", which only you can turn on, member by member, after a warning, in one of two settings: with payments, or without them, so that payments and purchases still ask ([FULL_ACCESS.md](FULL_ACCESS.md)). It stays off until you do, and passwords, credentials and security settings stay with you either way.
- **No secrets taken, no telemetry by default.** FreeDuet never reads, stores or forwards your subscription login. FreeDuet sends no usage data to its maintainers, and the runtime's own telemetry is off in `.env.example` (`COPILOTKIT_TELEMETRY_DISABLED=true`). Optional CopilotKit Intelligence is off by default too ([telemetry.md](telemetry.md), [PROVIDERS.md](PROVIDERS.md)).
- **Self-hosted, and your data stays with you.** Your conversations and memory stay in your own database.
- **MIT.** One free licence for everyone, with no paid-only or enterprise part. A few ported files keep their original notices ([NOTICE.md](../NOTICE.md)).
- **We say what is tested and what is not.** Planned means planned.

Want something moved up? Open an issue and say what you need it for.
