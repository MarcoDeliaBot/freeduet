# Connectors: FreeDuet works where you work

FreeDuet's team connects to the tools people already use, free or paid: creative suites, craft and making software, coding agents, messaging, office suites and automation. This page is the catalogue and the rules.

> **Status: catalogue.** Nothing below is connected yet unless a version is marked as shipped. Each connector is built and tested in the milestone shown.

## How a tool gets connected, in order of preference

1. **Official connector (MCP or API).** The safest and fastest route. The tool says what it allows; FreeDuet's gateway decides, asks the person where needed, and records every action.
2. **Browser.** For tools that live on a website, inside the member's own computer.
3. **Screen control on the person's computer.** For desktop programs with no connector. The member sees the screen and clicks like a person would, only in programs the person allowed, one by one.

Desktop programs such as Photoshop, Photograft or Cricut Design Space run on the person's own Windows or Mac, not in the members' Linux computers. They are reached through the **FreeDuet desktop bridge**: a small companion app the person installs, which exposes only the programs they switch on and passes every action through the same approvals as the rest of FreeDuet.

## Rules for every connector

- **The tool's own terms come first.** A connector that would break a tool's terms is not shipped, or ships off with a clear warning (see [PROVIDERS.md](PROVIDERS.md)).
- **FreeDuet never stores the tool's passwords or session tokens.** Sign-in happens in the tool's own flow.
- **Owner-only operations stay owner-only** (PROJECT.md F11), whatever the tool can do.
- **Per-program permission.** The person switches each program on, per member, and can switch it off at any time.
- **Files stay where they are.** Members work on copies unless the person asks for the original to be changed.

## Catalogue

| Area | Tool | Free or paid | Route | Milestone | Notes |
|---|---|---|---|---|---|
| **Google suite** | Gmail, Calendar, Drive, Docs, Sheets, Slides, Forms, Meet, Tasks, Keep, Contacts, Chat | Free and Workspace | Google Workspace APIs and connectors | M2 | Gmail and Calendar already come from OpenDuet. Uses Google's own OAuth for these apps, which is separate from Gemini's sign-in. |
| **Google for business** | Google Ads, Search Console, Analytics, Business Profile, YouTube | Free and paid | Official Google APIs | M3 | Read-only first; any change to a campaign or a budget is an owner-only operation. |
| **Microsoft 365** | Outlook, Teams, OneDrive, Word, Excel | Paid | Microsoft Graph and connectors | M3 | Teams already comes from OpenBot. |
| **Automation** | n8n | Free, self-hosted | Webhooks both ways | M2 | Members can start a workflow and workflows can hand work to a member. |
| **Automation** | Zapier, Make and hundreds of apps | Free and paid | Composio, already in OpenBot | M3 | |
| **Creative** | Adobe Photoshop | Paid | Desktop bridge: scripting where available, screen control otherwise | M4 | |
| **Creative** | Affinity | Paid | Affinity's own MCP server, through the desktop bridge | M4 | |
| **Creative** | Canva | Free and paid | Canva's official connector | M3 | |
| **Creative** | Photograft | — | Desktop bridge | M4 | Details to be added. |
| **Arts and crafts** | The ArtCraft program set | — | Desktop bridge | M4 | Program list to be added by the maintainer. |
| **Making** | Cricut Design Space | Free and paid | Desktop bridge, screen control | M5 | Sending a job to a machine is an approval, every time. |
| **Making** | 3D-printing slicers | Free | Command line where the slicer offers one, screen control otherwise | M5 | Starting a print is an approval, every time. |
| **Coding agents** | Claude Code | Subscription | Engine and tool: the official CLI, the person's own login | M1 | Also FreeDuet's first engine. |
| **Coding agents** | Codex | Subscription | Engine and tool: Codex app-server | M2 | After OpenAI approves FreeDuet's client ID. |
| **Coding agents** | Kimi | Free, subscription and API | Engine through Moonshot's OpenAI-compatible API; tool through Kimi's CLI | M2 | Subscription terms for third-party use to be verified before the CLI route is switched on. |
| **Coding agents** | Cline | Free, open source | Tool: hand a coding job to Cline in the person's editor through the desktop bridge | M3 | |
| **Coding agents** | Antigravity | Free and paid | Tool only, through the desktop bridge | M3 | FreeDuet never uses the Google sign-in behind it (PROVIDERS.md). |
| **Coding agents** | Trae | Free and paid | Tool only, through the desktop bridge | M3 | Terms to be verified. |
| **Messaging** | WhatsApp Business Platform | Paid per conversation | Official API | M5 | The supported WhatsApp route. |
| **Messaging** | OpenWA | Free | Optional plugin | M5 | Unofficial: WhatsApp may block the number. Off by default, with a clear warning; never part of the core. |
| **Messaging** | Telegram | Free | Bot API | M5 | |
| **Messaging** | Slack, Microsoft Teams, SMS | Free and paid | Already in OpenBot | v0.1 | |

## Adding a connector

A connector is a small, self-contained package:

```
connectors/<name>/
  connector.yaml     # name, area, route, tools exposed, which ones need an approval, terms link
  README.md          # what it does, how the person signs in, known limits
  tests/             # fake-tool tests, plus one real check the maintainer runs
```

Pull requests for new connectors are welcome; [CONTRIBUTING.md](../CONTRIBUTING.md) applies, and the terms link is mandatory.
