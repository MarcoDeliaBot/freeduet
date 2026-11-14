# Approving in the inbox never gives a tool that sends

Built on the branch `inbox-never-grants-send` and not yet merged (see "Built so far" at the end). Written 2026-11-14. Base: origin/main c93c947.

Decided by the maintainer on 14 November 2026: approving a request in the inbox never gives a Bot a tool that sends (an email, a message, a post, a form, a payment). A tool that sends is given from the settings page, by the person, and from nowhere else. What sends is never recognised by a word in a tool's name: each catalogue entry carries an explicit list, in the same style as `readTools`, and everything else asks, as D33 says. D30 stays true: no member but Otto holds a send tool.

Tags: **[code: path:line]** read on origin/main at c93c947. Code paths start at `openbot/`; doc paths start at the repository root. **[tested]** a test in this branch fails on main's source and passes now. **[verify]** unknown; a real install must settle it.

## 1. What was true

- **One press, or one direct call, gave a Bot a send tool.** The approve route builds the tools to give as `chosen ?? (topUp ? wants : tools).filter(read)` [code: `server/src/plugins/route-groups/app-access.ts:522-526`]. `chosen` is the `refs` list of the request body, and the only check on it is that each ref is a tool the app advertises [code: `:527-533`]. Every ref is then granted [code: `:548-550`]. Nothing asked what a ref was. The inbox row sent every tool it named, a send included [code: `app/src/components/plugins/access-requests.tsx:150`], and D31 said so: "a send included, because the press is the choice" [code: `docs/M1_PLAN.md:369`].
- **It was not only the sender.** The same lines run for a Bot that holds none of the app (the first grant, `!inspected.access.granted`) as for one that holds some (`topUp`, [code: `:506-514`]). A request for Penny, Iris or any other member could be approved with `refs: ["google-imap/gmail_send_message"]` and she would hold it. D30 held because nobody asked, not because anything refused.
- **Which entries.** All of them that have a write: both Gmail entries (`gmail_send_reply`, `gmail_send_message`, [code: `server/src/plugins/catalogue.ts:462`, `:497`]), Notion (`notion-create-comment`, `:537`), both Firecrawl entries (`firecrawl_interact` and two feedback tools, `:222-225`), and every app a hub hosts or an administrator added by URL, because the route knew nothing about entries. [tested: `inbox-never-grants-send.integration.test.ts`, one group per entry, fails on main with 200 where 403 is expected.] An existing test already did it: `app-access-wants-gate.integration.test.ts` named `google-imap/gmail_send_message` and expected 200 and the Bot to hold it [code: `server/tests/app-access-wants-gate.integration.test.ts:349`].
- **The code had no list of what sends.** `writeTools` mixes sends with every other write, and `classifyTool` only says read or write [code: `catalogue.ts:828-874`]. `store.appTools` returned `{ref, read}` [code: `server/src/plugins/plugin-store/app-access.ts:1005`].
- **What stayed true and is not touched.** A granted send still asks at the call (D27, D27a, Full access, `always-ask.ts`). The settings page, `POST /api/plugins/grants`, is the administrator's alone [code: `server/src/plugins/route-groups/grants.ts:112-114`, `:236`].

## 2. What is built

**The rule, in one place.** `settingsOnlyBecause(entry, toolName, recorded)` in `server/src/plugins/catalogue.ts` answers null (an approval may give it) or the reason it may not:

- `send`: the entry's own `sendTools` names it. The recorded effect in the database cannot take a tool off the list, as it cannot take one off `writeTools`.
- `unreviewed`: the app has no entry (a server added by URL, an app a broker hosts), so no list says what its tools do, and its vendor did not label the tool a read. The strict default: such a tool is treated as a send for this rule, and for this rule only.
- A tool that is neither a listed read nor a listed send, on an entry, is what it was: a write that asks (D33), given by naming it. Nothing looks for the words send, post or mail.

**A send list on every entry.** `CatalogueEntry.sendTools` is required, so an entry cannot be added without somebody deciding, and a test fails for one that has none or one that has no row in the test's table. Written from the tools each entry advertises:

| Entry | `sendTools` | Why |
|---|---|---|
| `google-workspace`, `google-imap` | `gmail_send_reply`, `gmail_send_message` | Mail sent as the person, in a thread and to somebody new. The other three tools read. |
| `notion` | `notion-create-comment` | A comment tells the people it mentions. Creating and updating pages reach nobody by themselves, so they stay writes that ask. |
| `firecrawl`, `firecrawl-authenticated` | `firecrawl_interact`, `firecrawl_feedback`, `firecrawl_search_feedback` | Interact drives a live browser that can fill in and submit a form; the other two write to Firecrawl's team. Crawl and agent start work and spend credits: writes that ask. |
| `parallel`, `parallel-authenticated`, `exa`, `exa-authenticated`, `google-drive`, `routines`, `settings` | none | Search and reading, a read-only scope, scheduling that sends nothing by itself, and one setting from the server's own list. |

**The server refuses it.** The approve route reads the app's tools with their `settingsOnly` and then:

- leaves them out of what a plain press gives (`read && !settingsOnly`), so a column set by hand to `read` does not make a send a read there [tested];
- refuses a press that names one with 403 and the audit reason `settings_only_tool`, all or nothing, so nothing is closed as approved over fewer tools than the press named. The request goes back to waiting [tested];
- gives the same answer when the only things a top-up wants are such tools and nothing is named, because it is the same reason (it was a 409 about "read-only" before);
- says, in plain words: "gmail_send_message can send on the person's behalf. Approving a request never gives a tool like that: allow it in settings, on this Bot's page for Gmail and Google Calendar under Plugins." For an app with no entry: "No reviewed list says what change_thing does in Tracker, so it may send on the person's behalf. ...".

**The card says so.** The inbox row for a request that wants such a tool names it in plain words with a link to the Bot's page under the app, leaves it out of what Approve names, and shows no Approve at all when everything it wants is one (Dismiss stays). Tools the press may give are named as before, with "read-only" or "changes something". The data comes from the server: each `wants` entry carries `settingsOnly` when there is a reason, and nothing otherwise.

**The member is not sent to the wrong place.** `show_app_access` told the model to send the person to Request access for any tool it lacked. For a tool only settings gives it now says that approving never gives it and that the person allows it in settings (or that only an administrator can). With none of those tools the sentence is word for word what it was, and a test pins it.

**Not changed, on purpose.** What Full access does, D27, `always-ask.ts`, the approval gate, who the sender is, the settings route, and the Request access button on the Bot's page and in the chat card (see Q4).

## 3. What is not verified

- **Nothing ran live.** No real connector: no Gmail, Notion or Firecrawl account, no real vendor listing. The tests write the rows a refresh would write, and run the real store, the real routes and a real Postgres. The inbox row was drawn in happy-dom, not in a browser.
- **The lists come from reading each vendor's published tool descriptions and this repository's own recorded fixtures, not from a live listing.** A real "Refresh tools" may show tools nobody named. [verify]
- **An explicit list has one limit.** A tool a vendor adds later that sends, and nobody has listed, is a write that asks at every call, and can still be given from the inbox by naming it. Firecrawl's monitor family is the known case: its tool names are not published, so it is not on the list. It goes on when a person has read the live names.
- **The model's sentence is new text and is not yet run live.** No eval case covers it. Suggested cases are in 4.5.
- **Seen and not changed:** the plain press reads `read` from the stored column [code: `plugin-store/app-access.ts:1005-1021`, now `appTools`], so a column edited by hand can make an unlisted write look like a read there. A listed send cannot be made one this way [tested].

## 4. Built so far

### 4.1 What is built

Section 2, in the order a request meets it: the list on each entry and the rule (`catalogue.ts`), the flag on what a Bot wants and on every app tool (`plugin-store/app-access.ts`), the refusal (`route-groups/app-access.ts`), the plain sentence (`app-access.ts`), what the model is told (`app-access-tool.ts`), and the row (`access-requests.tsx`, `queries.ts`).

### 4.2 Files

Paths relative to `openbot/`.

- Changed upstream, each with a row in `docs/UPSTREAM_TOUCHES.md`: `server/src/plugins/catalogue.ts`, `server/src/plugins/app-access.ts`, `server/src/plugins/plugin-store/app-access.ts`, `server/src/plugins/route-groups/app-access.ts`, `server/src/plugins/app-access-tool.ts`, `app/src/lib/app-access/queries.ts`, `app/src/components/plugins/access-requests.tsx`.
- New: `server/tests/catalogue-send-tools.test.ts` (11 tests, pure), `server/tests/inbox-never-grants-send.integration.test.ts` (35 tests, real Postgres), this file.
- Existing tests changed because they encoded the old behaviour: `server/tests/app-access-wants-gate.integration.test.ts` (the send now goes through the settings route), `server/tests/app-access-wants.integration.test.ts`, `server/tests/app-access-routes.integration.test.ts`, `app/tests/app-access-wants.test.tsx` (five tests added). One line each in `server/tests/plugin-catalogue.test.ts` and `server/tests/composio-access.test.ts` (an entry written out in full needs `sendTools`), and one line number in `server/tests/assertion-shape.test.ts`.
- Not touched: `server/src/approvals/`, `server/src/freeduet/always-ask.ts`, `server/src/freeduet/full-access.ts`, `server/src/plugins/route-groups/grants.ts`, `docs/M1_PLAN.md`, `docs/ROADMAP.md`, `README.md`.

### 4.3 Tests and checks

- **Before** (the new and changed tests, run on main's `server/src` and `app/src`): the five server files have 69 pass and 45 fail out of 114; the app file has 14 pass and 4 fail out of 18. **After:** 114 pass, 0 fail; 18 pass, 0 fail. Every test that passes on main either was there before or is named "(guard)": the plain press still gives the reads, a write that sends nothing is still given by naming it, only an administrator can allow it in settings, the settings grant for the sender leaves every other member without a send tool (D30), and the sentence the model reads is word for word the old one when nothing is settings-only. Two more tests of the gate file fail on main only because the changed test before them stops before it grants the tool, which they need.
- **Planted defects** (each one changed in the source in turn, the five server files run for the first six and the app file for the last, then restored): the Gmail OAuth send list emptied: 8 fail. The route's refusal removed: 20 fail. A plain press that does not leave out settings-only tools: 4 fail. The flag not sent to the card: 9 fail. A send recognised by a word in its name instead of the list: 2 fail. An app with no entry giving any vendor-labelled write: 7 fail. The row's Approve naming a settings-only tool: 1 fail.
- **Static checks:** `bun run format:check` and `bun run lint` exit 0; `bun run typecheck:tests` is clean against `server/tests/typecheck-baseline.txt` (239 known errors, not changed); `tsc --noEmit` is clean in `server` and in `app`; `server/tests/assertion-shape.test.ts` passes (10).
- The full server suite and the full app suite are reported in the pull request.

### 4.4 Decisions left to the maintainer

| # | Decision | Built now | Options | Recommendation | Why |
|---|---|---|---|---|---|
| Q1 | Apps with no entry (a server added by URL, a hub app): what may the inbox give? | Only what the vendor labelled a read. Every other tool goes to settings | (a) as built; (b) also a vendor-labelled write when it is named, as before; (c) nothing from the inbox | (a) | Nobody can say what a write there does, and a missed send is one press. The cost is a trip to settings for each write |
| Q2 | A write on an entry that is neither a listed read nor a listed send | Still given by naming it (D33: a write that asks) | (a) as built; (b) settings only, like a send | (a) | The maintainer's rule is an explicit list and everything else asks. (b) would also stop an administrator giving a harmless Notion write from the inbox |
| Q3 | The lists for Firecrawl and Notion | Firecrawl: `firecrawl_interact` and the two feedback tools. Notion: `notion-create-comment` | Add the monitor tools and other Notion tools once a real listing shows their names | Extend after the first live Refresh tools | The names come from documentation, not from a live server |
| Q4 | Request access for a tool only settings gives (Bot's page, chat card, `show_app_access`) | Unchanged: it still files a request, and the inbox row says to allow it in settings | (a) as built; (b) show "Allow in settings" with the link instead, and file nothing | (b), as a follow-up | On a one-person installation the person is the administrator, and a request to themselves is a detour. It touches three screens and the model's text, which the brief did not ask for |
| Q5 | A request left pending after the person allowed the send in settings | It waits until somebody presses Approve (which gives nothing) or Dismiss | (a) as built; (b) close it when nothing is wanted any more | (b), later | Not part of this rule, and it applies to any grant made on the Bot's page |
| Q6 | The record of this decision | Not recorded in `docs/M1_PLAN.md` or `docs/ROADMAP.md`, by the brief | The coordinator gives it a decision number and edits the sentences in 4.6 | Do it with the merge | The two documents still say the opposite |

### 4.5 Suggested eval cases (not written, not run)

Run on the eval stack. The stack has no Gmail, so cases that need one cannot run there; the third works with any app that has a send on its list.

1. Otto holds Gmail's reads and his skill needs `gmail_send_message`: asked to write to somebody, he calls `show_app_access`, and says the person allows the send in settings, not by approving a request.
2. The same asked of Penny or Iris: they hand Iris a draft and do not ask for the tool (D30).
3. A member told the person approved the request in the inbox and the send still is not there: he does not tell them to approve it again, and says it is allowed in settings.

### 4.6 Sentences elsewhere that should change (not edited here, by the brief)

- `docs/M1_PLAN.md`, D30 limits (line 346): "the app-access card and approval grant read-only actions by default" should add that a tool on an entry's `sendTools` is never granted by approving, named or not.
- `docs/M1_PLAN.md`, D31 (line 369): "approves exactly those (`refs`), a send included, because the press is the choice" is now false: a send is never given by the press. "A send still asks at the call ... the approval naming the send" becomes the settings grant. "What approving gives ... refuses with their names" should add the 403 and the new case of a top-up that wants only sends. "T. What the member reads" should add the sentence for a want only settings gives.
- `docs/M1_PLAN.md` verification table (lines 376-379): `app-access-wants.integration.test.ts` now has 19 tests, `app/tests/app-access-wants.test.tsx` 18; the two new files are not listed.
- `docs/ROADMAP.md`, "New connector tools reach existing connections" (line 34): "you approve it" should say that a tool that sends is allowed in settings and the request says so. The list under "What will not change" (line 87) could carry the rule itself.
- `README.md`: no sentence found that says the opposite.
