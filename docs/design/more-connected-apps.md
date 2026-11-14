# Design: connected apps beyond today's few

- Status: design only, no code change. Date: 2026-11-14. Base: origin/main at 452e060.
- Roadmap row: "Many more connected apps" [code: docs/ROADMAP.md:49], status In design.
- Markers: `[code: path:line]` was read on origin/main at 452e060, paths from the repository root. `[doc: URL]` was read on 2026-11-14. `[assumed]` was not checked here; section 7 lists each one.
- The golden rule ("keep the person's life simple": connecting an app must not need a developer console) comes from the brief. The phrase is not in the repository: a search of docs/, CLAUDE.md and README.md finds nothing [assumed].

## 1. What the person gets

1. Connect a common app (mail, calendar, documents, invoices, contracts, chat, files) by signing in on that app's own page. Where that is not possible, the list says what it would take: a developer account, an API key or a paid plan.
2. See every connected app in one list, with who holds the sign-in, which members may use it, and a switch that stops it at once.
3. Nothing that sends, pays, signs, books or deletes runs without the person's approval, whichever app it uses.

## 2. What exists today

Connectors
- Eleven curated entries: parallel, parallel-authenticated, exa, exa-authenticated, firecrawl, firecrawl-authenticated, google-drive, google-workspace, google-imap, notion, routines [code: openbot/server/src/plugins/catalogue.ts:257-563].
- Dynamic client registration (RFC 7591) is an option of the user-OAuth kind [code: openbot/server/src/plugins/catalogue.ts:81-83]. Only Notion uses it: host mcp.notion.com, endpoints from the vendor's own discovery, registration at /register [code: openbot/server/src/plugins/catalogue.ts:502, 506-510, 517-518]. The two Google OAuth entries need a Google OAuth client [code: openbot/server/src/plugins/catalogue.ts:369-370, 421-422]; among the OAuth entries, only Notion registers its client on the fly.
- Gmail has two routes. OAuth (google-workspace) asks for gmail.readonly, gmail.send and calendar.readonly [code: openbot/server/src/plugins/catalogue.ts:432-434] and lists gmail_send_reply and gmail_send_message as writes [code: openbot/server/src/plugins/catalogue.ts:454]. The app-password route (google-imap) needs no console, but needs 2-Step Verification and opens the whole mailbox [code: docs/M1_PLAN.md:125, 131]. Neither route has a calendar write tool [code: openbot/server/src/plugins/catalogue.ts:454, 489].
- Google Drive asks for drive.readonly [code: openbot/server/src/plugins/catalogue.ts:375] and lists two write tools, create_file and copy_file [code: openbot/server/src/plugins/catalogue.ts:393]. Either the writes cannot succeed, or the real scope is wider than the entry says [assumed; to check].
- Eight of the eleven entries carry a readTools list [code: openbot/server/src/plugins/catalogue.ts:266, 279, 292, 306, 319, 332, 449, 484]. google-drive, notion and routines do not [code: openbot/server/src/plugins/catalogue.ts:337-563].

Classification and the gate
- A tool is a write when it is not advertised, when it is on the write list, when its entry has a readTools list and the tool is not on it, or when a recorded vendor label is anything but exactly "read" [code: openbot/server/src/plugins/catalogue.ts:817-826]. A server added by URL has no entry, so its tools are writes [code: openbot/server/src/plugins/catalogue.ts:827-829]. Otherwise a curated tool is a read [code: openbot/server/src/plugins/catalogue.ts:832].
- MCP's readOnlyHint is withheld on purpose, so a server cannot make its own tool a read [code: openbot/server/src/plugins/mcp.ts:394-405]. Composio's readOnlyHint does decide a read [code: openbot/server/src/plugins/composio.ts:334], and its labels are the only source for a broker's catalogue [code: openbot/server/src/plugins/catalogue.ts:800-803].
- The gate skips the word check for reads [code: openbot/server/src/approvals/policy.ts:235]. Other tools are matched against credential words (policy.ts:189) and payment words (policy.ts:204), over the tool name, the scope, every argument and the target [code: openbot/server/src/approvals/policy.ts:241-253]. A hit hands the action to the person [code: openbot/server/src/approvals/policy.ts:450-455]. Full access can grant it first [code: openbot/server/src/approvals/policy.ts:446-449]. Auto-review is on by default [code: openbot/server/src/approvals/store.ts:33], and a model reviewer can also hand an action over [code: openbot/server/src/approvals/policy.ts:508-511].
- A hand-off between members skips the word check [code: openbot/server/src/approvals/policy.ts:240]. A send whose body says "pay" is handed to the person; the team recorded this and left it unchanged [code: docs/UPSTREAM_TOUCHES.md:198].
- Slack was removed from the curated list, because each entry was "a reviewed source contract for a vendor nobody had connected" [code: openbot/server/src/plugins/catalogue.ts:237-240]. docs/CONNECTORS.md still says Slack is "Already in OpenBot" [code: docs/CONNECTORS.md:60].

Hubs and transport
- `@composio/core` ^0.18.1 and `@arcadeai/arcadejs` 2.4.1 are dependencies [code: openbot/server/package.json:18, 24]. Keys come from COMPOSIO_API_KEY and ARCADE_API_KEY [code: openbot/server/src/config.ts:1424-1425]; the example file lists only the first [code: openbot/.env.example:573].
- With both keys set and no OPENBOT_BROKER_PROVIDER, no provider is active [code: openbot/server/src/plugins/provider-wiring.ts:76]. A provider cannot be switched while the other holds connections [code: openbot/server/src/plugins/provider-wiring.ts:180]. Arcade's verifier is a manual dashboard step and needs a public origin [code: openbot/server/src/plugins/provider-wiring.ts:193, 212-215].
- FreeDuet turns off the Composio SDK's telemetry, which would post to a third party's analytics [code: openbot/server/src/plugins/composio-adapter.ts:181-186, 212].
- MCP servers are reached over Streamable HTTP only [code: openbot/server/src/plugins/mcp.ts:2, 359]. The transport list has no stdio kind [code: openbot/server/src/plugins/transport.ts:124-131].
- A server added by URL must use https [code: openbot/server/src/plugins/catalogue.ts:913-915]. localhost and .internal names are refused [code: openbot/server/src/plugins/catalogue.ts:977-981]; the reason is in the comment at [code: openbot/server/src/plugins/catalogue.ts:895-899].

Grants and roadmap
- A grant is one row per kind (mcp, skill or bot), reference and agent [code: openbot/server/src/plugins/plugin-store/grants.ts:16-28; openbot/server/src/plugins/plugin-store/model.ts:57]. There is no per-tool switch: skippedTools lists names left out of the last listing because no model could be offered them [code: openbot/server/src/db/schema/plugins.ts:141-147].
- A connector connected before a tool existed never gets that tool; the fix is planned [code: docs/ROADMAP.md:34].
- The roadmap asks whether a hub fits the rule that sign-in happens in the tool's own flow and FreeDuet stores no passwords [code: docs/ROADMAP.md:49; docs/CONNECTORS.md:23-24].
- The persona has "mail, invoices, contracts, bookings" [code: docs/PROJECT.md:20]. The team is Iris and eleven members [code: CLAUDE.md:8-9]; their jobs are listed in [code: docs/TEAM.md:9-20].

## 3. Design

### 3.1 Which route meets the golden rule

| Route | Data stays with you | Cost by default | Developer console needed | Verdict |
|---|---|---|---|---|
| Hosted MCP, dynamic registration (Notion today) | Yes; no third party between vendor and FreeDuet [assumed] | Vendor's plan only [assumed] | No [code: openbot/server/src/plugins/catalogue.ts:517-518] | Default for any vendor that offers it |
| Hosted MCP, no dynamic registration (Slack, DocuSign, Google, Xero) | Yes, as above | Vendor's plan [assumed] | Yes, for whoever runs the client: Slack needs a registered app [doc: https://docs.slack.dev/ai/slack-mcp-server/]; DocuSign an integration key [doc: https://www.docusign.com/blog/developers/docusign-mcp-server-general-availability]; Google a Cloud project and OAuth client [doc: https://developers.google.com/workspace/guides/configure-mcp-servers] | Only where the project runs one client for all deployments [assumed] |
| Plain OAuth per service | Yes | Free; Google verification and a yearly assessment apply to outside users [doc: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification] | Yes, once per deployment [assumed] | Not for the default set |
| Self-run MCP server | Yes | The person's own hosting | Yes: the vendor's key or sign-in still applies [assumed]; localhost is refused [code: openbot/server/src/plugins/catalogue.ts:977-981] | Not by default |
| Hosted broker: Composio, Arcade, Pipedream Connect, Nango | No: the broker holds tokens and runs calls [doc: https://docs.composio.dev/docs/security/token-custody]. Self-hosted Nango runs on the person's own infrastructure [doc: https://nango.dev/blog/best-self-hosted-api-integration-platforms-for-ai-agents/] | Free tiers are capped (below) | No, for managed OAuth [doc: https://docs.composio.dev/toolkits/managed-auth] | Opt-in, off by default |

Judged against the rules:
- Data stays with you. A broker adds a party that holds tokens and runs calls [doc: https://docs.composio.dev/docs/security/token-custody]. Composio's self-hosting is "available at the Enterprise tier" [doc: https://composio.dev/enterprise].
- No cost by default. Arcade's free plan allows 2,000 tool calls a month; its Team plan costs $25 a month plus $0.01 per tool call [doc: https://www.arcade.dev/pricing/]. Pipedream Connect is free in development, and production needs a paid plan [doc: https://pipedream.com/docs/pricing]. Nango is under the Elastic License 2.0, and its free self-hosted edition covers managed auth and the API proxy only [doc: https://nango.dev/blog/best-self-hosted-api-integration-platforms-for-ai-agents/]. Composio's free-tier caps were not found (section 7).
- Approval. Every route passes FreeDuet's gate before the call, because OpenBot executes calls through its own gate [code: docs/M1_PLAN.md:26].
- Golden rule. Hosted MCP with dynamic registration and brokers with managed OAuth pass. Plain OAuth, self-run servers and vendors without dynamic registration do not.

No single route passes all four rules. Hosted MCP with dynamic registration is the default. A broker is the only route to no-console for vendors without it, so it stays opt-in, off by default, and never first in a chain [code: CLAUDE.md:26-28].

### 3.2 Smallest worth shipping

Two small PRs make today's connectors fail closed and consistent (S1, S2). A third states the broker path and its costs, off by default (S7). No new vendor is added in this step, so the person gets a safer base and a clear answer for each app.

### 3.3 What comes after, in order

1. One no-console vendor per PR, and only when its hosted MCP supports dynamic registration, checked on the vendor's own page before the PR (S5). Notion already qualifies. Xero's FAQ does not describe client set-up, so Xero is not confirmed [doc: https://developer.xero.com/faq/remote-mcp].
2. Google calendar writes and the app-password default (S6), after decision D-d.
3. The word check (S3, S4), after decision D-c. It is a security change, so the maintainer decides it.
4. Vendors that need a developer app or allowlisting (Slack, DocuSign, Microsoft): only through a broker or the person's own app. Each one is a reviewed source contract [code: openbot/server/src/plugins/catalogue.ts:237-240].
5. Self-run MCP on loopback (S8), only after D-b.

### 3.4 First ten apps

| # | App | Member and job | Route today | Phase |
|---|---|---|---|---|
| 1 | Gmail | Otto (mail), Wren (emails), Iris (morning brief) [code: docs/TEAM.md:9-11, 15] | OAuth or app password [code: openbot/server/src/plugins/catalogue.ts:398-489] | 0, then D-d |
| 2 | Google Calendar | Jules (bookings, appointments) [code: docs/TEAM.md:14] | Read only [code: openbot/server/src/plugins/catalogue.ts:434, 454] | 2 (D-d) |
| 3 | Google Drive | Storage for contract copies and receipts [assumed] | Read scope, two write tools [code: openbot/server/src/plugins/catalogue.ts:375, 393] | 0 (S2) |
| 4 | Google Docs | Portia (redlines) [code: docs/TEAM.md:12] | New, on the Google route [assumed] | 2 (D-d) |
| 5 | Notion | Documents for Wren's drafts [assumed] | Exists, dynamic registration [code: openbot/server/src/plugins/catalogue.ts:517-518] | 0 (S1) |
| 6 | Microsoft Outlook | Otto, for Microsoft 365 users [assumed] | New; Microsoft's enterprise MCP lists no mail scope [doc: https://learn.microsoft.com/en-us/graph/mcp-server/get-started] | 3 (D-f) |
| 7 | OneDrive | Storage, for the same people [assumed] | New, same Microsoft route [assumed] | 3 (D-f) |
| 8 | Xero | Penny (invoices, bills, reminders) [code: docs/TEAM.md:13] | Hosted MCP on Core plan and up; client set-up not described [doc: https://developer.xero.com/faq/remote-mcp] | 1, if registration is confirmed |
| 9 | DocuSign | Portia (contract review); the person signs [code: docs/TEAM.md:12] | Hosted MCP; integration key; custom agents allowlisted before production [doc: https://www.docusign.com/blog/developers/docusign-mcp-server-general-availability] | 3 (broker or own app) |
| 10 | Slack | Team messaging, if the person has a team [assumed] | Hosted MCP, no dynamic registration [doc: https://docs.slack.dev/ai/slack-mcp-server/] | 3, or Telegram (M5 [code: docs/CONNECTORS.md:59]) |

Why these ten: they cover the eleven members' jobs. Mail (1, 6), calendar (2), documents (4, 5), invoices (8), contracts (9), messaging (10) and storage (3, 7). Penny never pays or moves money [code: docs/TEAM.md:13], but her reminders depend on the word check (D-c).

## 4. Slices, one PR each

| # | Slice | Builds | Tests | Needs first | Size |
|---|---|---|---|---|---|
| S1 | Drive and Notion fail closed | readTools lists on google-drive and notion | A new advertised tool not on the list is a write; classification tests; one gate test | None | S |
| S2 | Drive scope matches its writes | A write scope, or no write tools | Each writeTools name is backed by a scope in its entry | A Google check [assumed] | S |
| S3 | Word check reads structured fields (D-c) | Tool name, scope and structured arguments; bodies go to the reviewer | "pay" in a body asks; a payment argument hands off; the real gate | D-c | S |
| S4 | Word check on brokered reads (D-c) | safetyRequirement also runs for brokered reads | A brokered read with a payment word hands off | D-c, S1 | S |
| S5 | One no-console vendor | Catalogue entry, discovery, readTools, writeTools | Per-tool classification; gate test | Registration confirmed on the vendor's page | S |
| S6 | Calendar writes on the Google route | calendar.events scope; create, update, delete tools | Scopes; classification; gate test | D-d; verification plan | M |
| S7 | Broker opt-in made explicit | ARCADE_API_KEY line; cost and custody note | No provider when OPENBOT_BROKER_PROVIDER is unset | D-a | S |
| S8 | Loopback MCP as explicit opt-in | Per-server switch; default refusal kept | Default still refuses localhost [code: openbot/server/src/plugins/catalogue.ts:977-981] | D-b; security review | M |

Each PR that touches policy.ts or catalogue.ts adds or updates its row in docs/UPSTREAM_TOUCHES.md [code: CLAUDE.md:49]. Sizes use the definitions in [code: docs/ENGINES_PLAN.md:24]: S under 300 changed lines, M 300 to 1000.

## 5. Rules that must hold

- Logins first: a metered API is never first in a chain and never on by default [code: CLAUDE.md:26-28]. Brokers are opt-in and off by default.
- Gateway code is never shipped [code: CLAUDE.md:29-30]. A broker such as Nango runs as a service the person chooses; no broker code is copied into the repository.
- Subscription credentials are never read, copied or forwarded [code: CLAUDE.md:31-32].
- No secrets and no personal data in the repository [code: CLAUDE.md:33]. No shared vendor client secret goes into it. Fixtures stay redacted [code: openbot/server/tests/fixtures/arcade-catalogue.json:2].
- Public wording: vendor claims cite public pages only [code: CLAUDE.md:34-35].
- The person's approval stays for real account actions; only the D27 and D27a exceptions apply [code: CLAUDE.md:36-42]. Full access lifts only payments [code: CLAUDE.md:43-47].
- Change only what was asked [code: CLAUDE.md:48]. Upstream changes stay minimal, one row each [code: CLAUDE.md:49]; rows exist for policy.ts and catalogue.ts [code: docs/UPSTREAM_TOUCHES.md:41, 84, 170].
- No telemetry by default; one free licence with no paid-only part [code: docs/ROADMAP.md:76, 78].
- Sign-in happens in the tool's own flow, and FreeDuet stores no tool passwords or session tokens [code: docs/CONNECTORS.md:23-24]. A broker holds the tokens, so FreeDuet does not store them, but the person's data then passes through the broker (D-a).
- Sends, payments, signatures, bookings and deletions keep asking [code: docs/PROJECT.md:28].

## 6. Open decisions

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| D-a | Golden rule scope and broker role | (1) no-console apps by default, others via an opt-in broker or the person's own app; (2) a broker for every app; (3) no broker | (1) | (2) puts custody and metered calls on the default path; (3) leaves out vendors without dynamic registration, for which a broker's managed OAuth is the console-free route [doc: https://docs.composio.dev/toolkits/managed-auth] |
| D-b | Self-run MCP on the person's machine | (1) keep the refusal; (2) an explicit switch per server | (1) now; (2) after S1 | The refusal blocks private addresses [code: openbot/server/src/plugins/catalogue.ts:895-899]; the need is narrow |
| D-c | Word check on free text and brokered reads | (1) as today; (2) tool name, scope and structured arguments only; (3) also check brokered reads | (2) and (3), after S1 | "pay" in a reminder hands the send to the person [code: docs/UPSTREAM_TOUCHES.md:198]; brokered reads skip the check [code: openbot/server/src/approvals/policy.ts:235]. A security change, so the maintainer decides |
| D-d | Google route | (1) app password as default, OAuth for people with their own Cloud project; (2) one project-wide OAuth app with verification and a yearly assessment; (3) Testing mode for a few users | (1) now; (2) only if its cost is accepted | Restricted Gmail scopes need verification and a security assessment every 12 months for outside users [doc: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification]; Testing allows 100 users and 7-day refresh tokens [doc: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview] |
| D-e | First ten and messaging | Confirm the ten; messaging: Slack (needs a registered app; for teams) or Telegram (M5) | Confirm the ten; Telegram for a solo person, Slack only with a team | The persona is solo [code: docs/PROJECT.md:20]; Slack has no dynamic registration [doc: https://docs.slack.dev/ai/slack-mcp-server/] |
| D-f | Microsoft (Outlook, OneDrive) | (1) defer; (2) the person's own Entra app; (3) a broker | (1) until D-a is settled | Microsoft's enterprise MCP lists no mail, calendar or file scope [doc: https://learn.microsoft.com/en-us/graph/mcp-server/get-started]; Graph needs an app registration [assumed] |

## 7. What was not verified

- Design only: no account, live connection, sandbox or test run was used.
- Prices and limits come from vendor pages read on 2026-11-14. Composio's free-tier caps were not found. Nango's licence is taken from a vendor blog, not from the licence file.
- Xero's dynamic registration: its FAQ does not say, so it is not confirmed [doc: https://developer.xero.com/faq/remote-mcp].
- Whether Slack, DocuSign, Google and Microsoft accept one redirect address per deployment [assumed].
- Microsoft Graph's mail and calendar set-up was not read [assumed].
- The Google Drive scope mismatch was not tested against Google (S2) [assumed].
- Where OAuth tokens are kept on the person's machine today was not traced [assumed].
- Pipedream's page does not say in plain words that every request passes through Pipedream [assumed].
- The golden rule's wording comes from the brief, not from the repository [assumed].
- Size estimates are judgements, not measurements.
- Code claims come from reading; no test was run.
- The model reviewer's behaviour was read in code, not observed.
