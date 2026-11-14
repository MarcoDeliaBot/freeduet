# Connectors: FreeDuet works where you work

FreeDuet's team connects to the tools people already use, free or paid: creative suites, craft and making software, coding agents, messaging, office suites and automation. This page is the catalogue and the rules.

> **Status: catalogue.** Nothing below is connected yet unless a version is marked as shipped. Each connector is built and tested in the milestone shown.

## How a tool gets connected, in order of preference

1. **Official connector (MCP or API).** The safest and fastest route. The tool says what it allows; FreeDuet's gateway decides, asks the person where needed, and records every action.
2. **Browser.** For tools that live on a website, inside the member's own computer.
3. **Screen control on the person's computer.** For desktop programs with no connector. The member sees the screen and clicks like a person would, only in programs the person allowed, one by one.

Desktop programs such as Photoshop or Cricut Design Space run on the person's own Windows or Mac, not in the members' Linux computers. They are reached through the **FreeDuet desktop bridge**: a small companion app the person installs, which exposes only the programs they switch on and passes every action through the same approvals as the rest of FreeDuet.

## Rules for news and social sources

- Official APIs and feeds only; no scraping that breaks a site's terms.
- Summaries always link the original, with its date. Full articles are never copied.
- Posting to social networks is publishing: an owner-only operation, every time.

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
| **Automation** | n8n | Free self-hosted, or paid n8n Cloud | Webhooks and n8n's API, both ways | M2 | Same connector for a private install and for n8n Cloud: only the address and key change. Members can start a workflow and workflows can hand work to a member. |
| **Automation** | Activepieces, Node-RED, Windmill, Huginn, Kestra | Free, open source, self-hosted | Webhooks and each tool's API | M3 | For people who prefer another engine to n8n. |
| **Automation** | Make, Pipedream | Free and paid, online | Webhooks and each tool's API | M3 | Zapier is covered through Composio. |
| **News and social** | RSS and Atom feeds, Google News feeds | Free | Feed reader | M3 | The simplest and most reliable source. |
| **News and social** | YouTube, Reddit, Bluesky, Mastodon, Hacker News | Free within each API's limits | Official APIs | M3 | Each API's own terms and rate limits apply. |
| **News and social** | X | Paid API only | Official API | M4 | Off unless the person has X API access. |
| **Automation** | Zapier, Make and hundreds of apps | Free and paid | Composio, already in OpenBot | M3 | |
| **Creative** | Adobe Photoshop | Paid | Desktop bridge: scripting where available, screen control otherwise | M4 | |
| **Creative** | Affinity | Paid | Affinity's own MCP server, through the desktop bridge | M4 | |
| **Creative** | Canva | Free and paid | Canva's official connector | M3 | |
| **Creative** | The ArtCraft suite | Free, open source | Inside each member's own computer, through each app's MCP server or headless CLI | M2–M5 | See the next section. |
| **Making** | Cricut Design Space | Free and paid | Desktop bridge, screen control | M5 | Sending a job to a machine is an approval, every time. |
| **Making** | 3D-printing slicers | Free | Command line where the slicer offers one, screen control otherwise | M5 | Starting a print is an approval, every time. |
| **Games** | Godot, Phaser, PixiJS, three.js, Bevy, pygame, LÖVE, Defold, Ebitengine | Free, open source | Inside Nico's own computer, driven by the coding agent with the game-development skills ([CATALOG.md](CATALOG.md)) | M2 onwards, with the Tech pack | Building and test runs are free; uploading to a store is an owner-only operation. |
| **Games** | Unity, Unreal Engine, Roblox Studio | Free tiers and paid, each with its own license | Desktop bridge, on the person's computer | M4 | Only if the person already has them. |
| **Coding agents** | Claude Code | Subscription | Engine and tool: the official CLI, the person's own login | M1 | Also FreeDuet's first engine. |
| **Coding agents** | Codex | Subscription | Engine and tool: Codex app-server | M2 | Through Codex's own official login, which FreeDuet never reads. Planned, not built. |
| **Coding agents** | Kimi | Free, subscription and API | Engine through Moonshot's OpenAI-compatible API; tool through Kimi's CLI | M2 | Subscription terms for third-party use to be verified before the CLI route is switched on. |
| **Coding agents** | Cline | Free, open source | Tool: hand a coding job to Cline in the person's editor through the desktop bridge | M3 | |
| **Coding agents** | Antigravity | Free and paid | Tool only, through the desktop bridge | M3 | FreeDuet never uses the Google sign-in behind it (PROVIDERS.md). |
| **Coding agents** | Trae | Free and paid | Tool only, through the desktop bridge | M3 | Terms to be verified. |
| **Messaging** | WhatsApp Business Platform | Paid per conversation | Official API | M5 | The supported WhatsApp route. |
| **Messaging** | OpenWA | Free | Optional plugin | M5 | Unofficial: WhatsApp may block the number. Off by default, with a clear warning; never part of the core. |
| **Messaging** | Telegram | Free | Bot API | M5 | |
| **Messaging** | Slack, Microsoft Teams, SMS | Free and paid | Already in OpenBot, as chat channels | v0.1 | Slack's connector was removed from the curated catalogue, because each entry was a reviewed source contract for a vendor nobody had connected; re-adding it is a review of that vendor |

## The ArtCraft suite: a free creative studio inside every member's computer

[ArtCraft](https://getartcraft.com/apps) ([GitHub: storytold](https://github.com/storytold)) is a family of free, open-source creative apps written in Rust. Every app is built to be driven by an agent: a headless CLI, an MCP server and a JSON control channel, over one registry of commands. They run natively on Linux, so FreeDuet installs them **inside each member's own computer**, with no desktop bridge and no cost.

_Checked 2026-11-08 from getartcraft.com/apps and the PhotoCraft README. Status is the project's own label._

| App | What it does | Project status | Used by | Milestone |
|---|---|---|---|---|
| **PhotoCraft** | Image editing (`photocraft-cli run`, `batch`, `mcp`) | Early alpha | Wren, Jules, Leo | M2 |
| **PdfCraft** | Read, organise, combine, split and secure PDFs | Early alpha | Portia, Penny, Otto | M2 |
| **FigCraft** | Interface design and prototyping | Early alpha | Leo | M3 |
| **Craft Anything** | Explore how software works and build your own | Early alpha | Leo | M3 |
| **VectorCraft** | Vector illustration, logos, cutting files | In development | Wren, Gus | M4 |
| **LightCraft** | Photo library and raw developing | In development | Wren | M4 |
| **DesignCraft** | Page layout and publishing | In development | Wren, Penny | M4 |
| **DeckCraft** | Slide presentations | In development | Wren, Iris | M4 |
| **WordCraft** | Word processing | In development | Wren, Portia, Penny | M4 |
| **GridCraft** | Spreadsheets and data analysis | In development | Penny | M4 |
| **FilmCraft** | Video editing (desktop only) | In development | Wren | M5 |
| **EffectCraft** | Motion graphics and visual effects | In development | Wren | M5 |
| **SoundCraft** | Audio recording, editing and mixing | In development | Wren | M5 |
| **CADCraft** | Computer-aided design and drafting | In development | Gus | M5 |
| **TextureCraft** | 3D texture painting | In development | Gus | M5 |
| **MaterialCraft** | Node-based procedural materials | In development | Gus | M5 |

Rules for the suite:

- An app joins FreeDuet only once it reaches at least early alpha and its agent interface passes FreeDuet's connector tests.
- The apps are installed in the member's computer image and reached only through their own MCP server or CLI; the JSON control channel stays on loopback inside that computer.
- Files are edited as copies; the original is replaced only when the person asks.
- ArtCraft apps are Apache-2.0 (PhotoCraft is MIT or Apache-2.0). FreeDuet keeps their license and NOTICE files when it ships them in an image.
- ArtCraft Studio, the project's separate AI image and video app, is not part of this plan; it can be added later as its own connector.

## Adding a connector

A connector is a small, self-contained package:

```
connectors/<name>/
  connector.yaml     # name, area, route, tools exposed, which ones need an approval, terms link
  README.md          # what it does, how the person signs in, known limits
  tests/             # fake-tool tests, plus one real check the maintainer runs
```

Pull requests for new connectors are welcome; [CONTRIBUTING.md](../CONTRIBUTING.md) applies, and the terms link is mandatory.
