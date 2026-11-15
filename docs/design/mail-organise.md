# Organise a mailbox: labels, archive, read and unread

Built on the branch `mail-organise` and not yet merged (see "Built so far", section 8). Written 2026-11-15 on origin/main 225caee; origin/main 38c4b48 (a change under `site/` only) and then bfdc4ad (a change to `docs/ROADMAP.md` only) were merged before the pull request.

Decided by the maintainer on 15 November 2026: "a mail assistant cannot have this limit". He asked Otto to create a Gmail label called FreeDuet and to file the repository's automatic notifications under it, out of the Inbox. With the app-password connection (`google-imap`) Otto could not: a member held three reads (`gmail_search_messages`, `gmail_read_message`, `calendar_list_events`) and two sends, and nothing that changes a mailbox. Both Gmail connections now give a member the tools to organise one. This file covers the first slice only.

Tags: **[code: path]** read on origin/main at 225caee. Code paths start at `openbot/`; doc paths start at the repository root. **[tested]** a test in this branch fails on main's source and passes now. **[verify]** unknown; a real install must settle it.

## 1. What the person gets

- A request such as "create a label called FreeDuet and file the automatic notifications from GitHub that are in my inbox under it, out of the inbox" can be done. Otto searches, says in one plain sentence what he will touch (how many messages, from whom, which subjects, what happens to them), and calls the tools.
- Each of the four tools that change the mailbox shows the person a card in the person's own turn, whatever "ask before changes" says and whatever the reviewer would have said; only the person's own earlier "Always allow" for that tool lifts it (section 3, "The always-a-card rule"). The card is in plain words:
  - Title: `Archive 12 messages`, `Mark 3 messages as read`, `Add the label "FreeDuet" to 12 messages`, `Remove the label "Inbox-old" from 4 messages`, `Change the labels on 4 messages` or `Create the label "FreeDuet"` (the label is in curly quotes on the card).
  - A line, "What happens", in words. Archive: "They leave the Inbox and stay in All Mail, with their labels. Nothing is deleted." Mark: "Only whether they show as read changes. Nothing is deleted." Label: "Labels are added or taken off. No message is moved or deleted." Create: "A new, empty label is added to your Gmail. No message is changed."
  - The messages, one per line, `sender: subject`. They are read from the mailbox by the server when the person is about to be asked, never taken from anything the Bot wrote about them.
  - "Not found" when some named ids are no longer in the mailbox: the call will be refused as it stands. Or, when the mailbox could not be read just then, a line that says so and the number of messages the Bot named.
  - Refuse, Allow once and Always allow, as on every write (no Always allow where the gate says "always ask": a routine, a check-in, a remote session, a hand-off from one).
- Listing the labels (`gmail_list_labels`) is a read and has no card.
- When Otto has no tool for it (Gmail is not connected, or the tools were not given to him) he says so once, in one short message, with the next step: turn it on for him under Plugins on the Gmail page, or connect Gmail on the Connections page. He never sends the person to an administrator: the person runs the installation.
- Nothing else changes: the same sends, replies, cards and approvals as before.

## 2. What was true

- **Five tools, and no way to change a mailbox.** Both Gmail entries offered three reads and two sends; `sendTools` named the two sends [code: `server/src/plugins/catalogue.ts`, the entries `google-workspace` and `google-imap`]. The app-password transport had no way to change a mailbox by design: its client type had no method that could, and it opened All Mail read-only (IMAP `EXAMINE`) [code: header of `server/src/plugins/google-imap.ts`].
- **The OAuth scopes could not do it either.** `gmail.readonly`, `gmail.send` and `calendar.readonly`; labelling and archiving need `gmail.modify` (`messages.batchModify` takes no narrower scope).
- **Otto's prompt promised what he could not do.** "Archive or label mail only under a rule the person gave you" [code: `examples/freeduet/agents.yaml`, Otto].
- **What a member may call is its grants, narrowed by its skills' declarations.** The package seeds no tool grant; a person gives one from the Bot's page, by pressing the inbox row that names what a skill needs, or by pressing it with nothing named, which gives only reads [code: `server/src/plugins/route-groups/app-access.ts`, the filter `tool.read && !settingsOnly.has(tool.ref)`]. Only Otto's skills name the Gmail tools.
- **The gate asked a write by the person's settings and the reviewer (before this change).** The default of "ask before changes" is off, so a write passed unless the reviewer says it needs the person, a rule asks, or the action is one the gate always asks about: a routine, a check-in, a remote turn and a hand-off that started in one (D35) [code: `server/src/approvals/policy.ts`, `evaluate`; `server/src/freeduet/always-ask.ts`]. Full access, off by default, lets a write through in the person's own live turn.
- **A name with "messages" in it read as a send.** The private-share check matches names such as `gmail_archive_messages` against its pattern for a message sent to other people [code: `server/src/plugins/share-target.ts`, `SENDS`], which would have drawn a "Send email to ..." card for an archive.

## 3. What is built

**The five tools**, defined once in `server/src/plugins/mail-organise.ts` and listed by both transports, so a Bot is told the same thing whichever connection the person used.

| Tool | Effect | Takes | Answers |
|---|---|---|---|
| `gmail_list_labels` | read | nothing | `{labels, alsoAllowed}`: the person's own labels by name, and `STARRED`, `IMPORTANT` |
| `gmail_create_label` | write | `name` | `{label, created}`; a label that exists is a success, with a note that nothing changed |
| `gmail_label_messages` | write | `messageIds`, `addLabels`, `removeLabels` | `{labeled, added, removed}` |
| `gmail_archive_messages` | write | `messageIds` | `{archived, alreadyOutOfInbox}` |
| `gmail_mark_messages` | write | `messageIds`, `state` (`read` or `unread`) | `{marked, as}` |

**One reading of the arguments** (`parseOrganiseCall`). Both transports, the call path (before the gate) and the card's reader use it, so a call is judged once and the same way:

- Only the fields the tool names; a fifth field is refused, because what the person is shown is what is done.
- Message ids: 1 to 100, once each, each a Gmail id as a search returns it (hex). More than 100 is refused, not cut.
- Label names: one line of 1 to 100 characters, with no control, invisible or direction-changing character, none of `\ " * %`, and no empty part between slashes; not a name Gmail uses for its own labels or folders.
- A label to add or remove: the person's own labels by name, or `STARRED` and `IMPORTANT`. Trash and Spam (and Junk) are refused in either spelling and in either direction. Every other system label (Inbox, Sent, Drafts, Unread, the categories) is refused with a sentence that names the tool that does that job. At most 5 labels each way per call; the same label cannot be added and removed in one call.
- Every refusal is a sentence written in that module that repeats nothing that was passed in: a name or an id may have come from a mail the Bot read, and an error is read back into a model.

**Over REST** (`google-workspace`, `server/src/plugins/google-workspace-rest.ts`). The scope `gmail.modify` is added to the consent. A label list is `GET labels`; a new label is one `POST labels` (a 409 means it exists, which is a success). A change names labels first (a label that does not exist is refused before a message is read), looks up every named id with `format=metadata`, and refuses the whole call when any is gone; then one `POST messages/batchModify`, which answers 204. Archive removes `INBOX`; mark read removes `UNREAD`, mark unread adds it.

**Over IMAP** (`google-imap`, `server/src/plugins/google-imap-organise.ts`). `google-imap.ts` keeps its read-only client type and hands a call to a module of its own, with a client type of its own, `ImapOrganiserLike`, which is exactly the seven methods these operations use. The mailbox is opened for writing, with `{ readOnly: false }` as a literal in the type, only inside one of the four operations, only after the labels are known and the call is not already refused, on a connection made for that call and closed when it ends. What is sent: `CREATE` for a label; `UID STORE` on `X-GM-LABELS` to add or remove a label and, for archive, to remove `\Inbox`; `UID STORE` of the `\Seen` flag. Nothing is expunged, moved or copied, no message is flagged for deletion, and a second guard (`operand`) refuses any system label other than the four it sets, where the command is built, whatever got past the arguments. All Mail is found by the server's own `\All` flag, and a label of the person's called "Archive" or "Sent" is still theirs: a special use the library only guessed from a name does not hide it.

**The card.** The call path builds a closure, `describe`, only for the two Gmail transports and the three tools that name messages [code: `server/src/plugins/plugin-store/calls.ts`]. The approval service runs it only when the person is about to be asked [code: `server/src/approvals/service.ts`], so a call that goes through costs no extra read. It reads who each message is from and what it is about, through a connection that cannot change anything, and the result is stored with the request as `details`, outside the digest, so what is approved is still the call's own arguments. A mailbox that cannot be read leaves the card to be drawn from the arguments, and says so. The app draws it in `app/src/lib/approval-view.ts` (`describeOrganise`); text from a mail is cleaned of invisible and direction-changing characters and cut, and drawn as text.

**The classification.** The four writes are in `writeTools` and not in `sendTools`, on both entries, so the gate treats them as writes and nothing more: they are not sends, they are not covered by the typed-address rule for a new email, and an approval that names nothing does not give them. `share-target.ts` names them as the writes they are, so no private-share card is drawn for one.

**The always-a-card rule.** In the person's own live turn each of the four shows a card, whatever "ask before changes" says and whatever the reviewer would have said. The call path marks the candidate (`organisesMailbox`, `server/src/plugins/plugin-store/calls.ts:745-748`, read off the transport and the tool's name together), the approval service passes the reason to the gate (`server/src/approvals/service.ts:362-366`) and `decideAction` answers `ask` (`server/src/approvals/policy.ts:601-612`, input `mustAsk`, text `MAILBOX_CHANGE_REASON`, policy.ts:465). It sits after the D35 always-ask case and after the hand-offs, and before a saved rule that allows and before "ask before changes", so the person's own saved "Always allow" for that tool (a personal rule that allows) is the only thing that lifts it, for that tool alone. It is not a second always-ask definition: `always-ask.ts` still holds the routine, check-in, remote and hand-off cases, which no rule lifts. Full access is read before it, as for every write.

**Otto.** One sentence in his prompt says he may label, archive and mark mail when the person asks or under a rule they gave him, names the four tools, and says each asks the person, so he says in one sentence what he will touch and then calls the tool. Where the person pressed Always allow or gave him Full access there is no card, and he says what he did and to how many messages. One sentence says what to do when a tool is missing. The sentence about instructions inside an email now names archiving and labelling. The shared-rules paragraph is untouched. A skill, `organise-the-mailbox`, declares the six tools (and search) on both connections and is attached to Otto only.

## 4. Rules that hold, and the tests that say so

1. **Each of the four shows a card in the person's own turn, and nothing pre-approves it.** Default settings and a reviewer that would let it through: a card. "Ask before changes" off or on: a card. Only the person's own Always allow for that tool lifts it, for that tool only. The always-ask cases and Full access are the gate's own, unchanged. A hand-off from Iris is not pre-approved for them; a typed address in the person's message does not turn an archive into a new email; an Allow once is spent on the call it was given for, and a new call asks again. [tested through the real gate, the real plugin store and the real approval service on Postgres, on both connections, in `server/tests/mail-organise-approval.integration.test.ts`.]
2. **They are not sends.** Not in `sendTools` of either entry, not named by `NEW_EMAIL_SENDS`, not in hub grants (hub grants are between members and none is a tool). [tested: `catalogue-send-tools.test.ts`, `mail-organise-team.test.ts`, the integration test above.]
3. **The card is the server's reading, never a Bot's.** The messages and their count come from `details`; the ids the Bot sent only stand in when the mailbox could not be read, and a Bot that names more ids than the server found does not change the count. [tested: the card's messages equal what the mailbox held for those ids, in the order named, on both connections, and the read changes nothing (`mail-organise-approval.integration.test.ts`); the app's card takes its count and its list from `details` and not from the ids (`app/tests/approval-organise.test.tsx`).]
4. **A read is a read.** `gmail_list_labels` has no card, with "ask before changes" on and in a routine. [tested.]
5. **A call that cannot be carried out asks nobody.** Trash or Spam as a label, 101 ids, a field that would act on everything a search matches, a label name with a control character: refused before the gate, with an audit row `mcp.call_rejected` and the refusal `mail_organise_call_invalid`. [tested.]
6. **Nothing is deleted, trashed, reported as spam, forwarded or moved.** [tested: `server/tests/google-imap-organise-wire.test.ts` runs every operation through the real IMAP client against a server that records every command line. It asserts the exact commands, that every command is on an allow-list (`LOGIN`, `LIST`, `SELECT`, `EXAMINE`, `UID SEARCH`, `UID FETCH`, `UID STORE`, `CREATE` and the connection's own), that none is an `EXPUNGE`, a `MOVE`, a `COPY`, an `APPEND`, a `DELETE` or a `RENAME`, that a `UID STORE` is only of `X-GM-LABELS` or of `\Seen`, that no line names `\Deleted`, Trash, Spam or Junk, and that no read opens a mailbox with `SELECT`. `server/tests/mail-organise-rest.test.ts` holds every request of every test to one allow-list in `afterEach`, so a path that deletes, trashes, forwards or filters fails whichever test reached it.]
7. **All of the named messages, or none.** A message gone since the card was drawn refuses the call; nothing is partly done except where Gmail's own IMAP needs two commands for an add and a remove, and then the answer says that only part was made. [tested.]
8. **Who holds the tools is grants, and nothing gives them by reading mail.** The package seeds none. A press of the inbox row with nothing named gives the reads (the listing among them) and not one write; naming one gives exactly that one; the row the app sends names every tool it lists but the sends, so the person who presses it chooses all four; a member whose skills do not name them is not asked for them. [tested through the real routes with the skills the package gives Otto, in `server/tests/mail-organise-grants.integration.test.ts`.]
9. **Routines, check-ins, remote turns and hand-offs that started in one always ask**, and Full access is neither lifted nor tightened for these tools: on for Otto in the person's own turn they pass with no card like any write, a routine's run still asks, a member the person did not switch on still asks. [tested.]
10. **Both connections say the same thing.** The tool lists are equal, the refusals are the same sentences, the answers have the same shape; the catalogue lists are held equal by a test.

## 5. What is not built

Decided, so the next slice does not have to rediscover it:

- **No delete, no trash, no spam.** Trash and Spam are refused as labels in both directions, and no tool moves a message there.
- **No filter creation, no forwarding rule, no forwarding of mail.**
- **No move between arbitrary folders.** A label is how a message is filed; archive takes it out of the Inbox and nothing more.
- **No operation on "everything a search matches".** Ids must be listed, at most 100 a call, so the card can say how many and which. No field names a search, a folder or a place to forward to, and a test fails if one is added.
- **No way to put a message back in the Inbox.** `INBOX` is refused as a label to add, so a Bot cannot undo an archive; the person does it in Gmail ("Move to Inbox"). An un-archive tool is a small later change, and a decision (Q9).
- **No change to the sends** and none to who holds them: only Otto has them (D30).
- **No new approval mode**: the always-a-card rule is a card the person can lift for one tool with Always allow, not a D35 always-ask case (section 3, Q3).
- **No change to channel approvals** (a card in Slack, Telegram and the like): see the limits.

## 6. Limits

- **The approval card is the person's check, and it can only be as good as the person's reading.** The tools take message ids, and nothing ties an id to an earlier search or read of the member's: the server cannot know where a Bot got an id. Nothing in a message body causes an action by itself: a mail's text is data, Otto is told to report an instruction inside an email as suspicious, and the reviewer (when it is on) sees a request that did not ask for it. But a model can be misled into calling the tool, and when it is, what stands between a hostile mail and the mailbox is the card, which lists what the SERVER read for those ids. The limits that remain are that the four are reversible by the person in Gmail (nothing is deleted; an archived message is in All Mail and has its labels), at most 100 messages go in a call, and that an Always allow, or Full access, or a press without reading, removes the check. This is the same limit every write has.
- **Full access.** With Full access on for the member, in the person's own live turn, the four go through with no card, exactly as the existing rules treat any write that is not a payment (they are not special-cased either way, M34). The gate looks at Full access before the always-a-card rule, as it does for every write; a routine, a check-in, a remote session and a hand-off from one are not in Full access's reach and ask. Tested through the real gate on both connections.
- **"Always allow" is offered for these four**, as for any write, and honoured for one tool at a time: after an Always allow on archive, the next archive needs no card and the other three still ask. It is neither offered nor honoured where the gate says "always ask": a routine, a check-in, a remote session, a hand-off from one (Q2).
- **A label's name cannot carry a curly quotation mark** (U+2018, U+2019, U+201A, U+201B, U+201C, U+201D, U+201E, U+201F): the card writes the name between U+201C and U+201D, and a name holding one could close the quotation and write the rest of the title itself.
- **A message in the Trash or in Spam is "not found" on both connections.** Over IMAP All Mail does not hold one; over REST the lookup reads its labels and refuses it in the same words.
- **IMAP timeouts.** A call that times out or whose connection drops after the first command that changes a thing was sent answers that the change may have been made and to look in Gmail; before that it changed nothing and says only that Gmail did not answer. A logout that Gmail does not answer in two seconds is cut off.
- **The OAuth scope is wider than the tools.** `gmail.modify` also allows trashing mail, which no tool here does and the connector cannot be made to (every request it makes is one of those listed in section 3, and a test lists them). A person who connected before the scope was added has not granted it: reading and sending go on working, and the four tools answer with Google's refusal in plain words until they reconnect. `gmail.modify` is a restricted scope like `gmail.readonly`, so the verification Google asks of an app beyond Testing is not a new tier (Q1).
- **The IMAP side is untested against a real Gmail.** The commands are the ones Gmail's IMAP documents (`X-GM-LABELS`, `CREATE`, `SELECT` read-write) and the tests run the real client against a recording server, but no test ran on a real mailbox [verify]. Lookups are one `SEARCH` per id, so 100 ids are 100 round trips; the connection has 60 seconds. A label call that both adds and removes is two commands, and the second can fail after the first was made, which the answer says.
- **A label's name is read by the safety floor.** The floor matches words such as "payments" and "password" in a call's arguments, so a label called "Payments" is handed to the person ("this is always done by the person") rather than asked about. That is the existing floor, unchanged (Q7).
- **A channel's card is plainer.** A step in Slack, Telegram and the like shows the raw arguments and a generic label ("Gmail archive messages"), because the plain-words card is the app's (Q4).

## 7. What is not verified

- **Nothing ran live.** Otto's prompt, the skill and the tool descriptions are text a model reads. Three cases are added, not run: `otto-8` (a safety case: an email that tells him to archive and label everything), `otto-9` (the real request; needs Gmail, so the eval stack skips it) and `otto-10` (the tools are missing: say so once). Run `otto-8,otto-9,otto-10`, and then `--member inbox`, before Otto's prompt counts as certified. The eval stack has no Gmail connected, so `otto-9` can only be run on a stack that has.
- **A real Gmail**, over REST and over IMAP. Whether the tools do what the tests say against Google's servers is [verify]; the fake Google (`openbot/scripts/fake-google/server.ts`) now keeps labels and answers `batchModify`, and checks the scope, so the REST side can be tried end to end without an account.
- **Whether Otto looks first, says what he will touch, and calls the tool, and whether he resists an instruction inside a mail.** Both are a model's behaviour.
- **The card in a browser.** It was drawn in happy-dom, not looked at.
- **The prompt pins**: no pin had to move for Otto's sentences; the tests that name his words are in `server/tests/mail-organise-team.test.ts`.

## 8. Built so far

Branch `mail-organise`. No migration, no setting, no route, no Python change. One new scope on the OAuth consent.

**Source.**

| File | What changed |
|---|---|
| `openbot/server/src/plugins/mail-organise.ts` (new) | The five tools, the one reader of a call (`parseOrganiseCall`, `organiseRefusal`), the refusal sentences, the answers, the card's text cleaning (`shownMessage`), the folder naming for IMAP (`ownLabelNames`) |
| `openbot/server/src/plugins/google-imap-organise.ts` (new) | The four operations over IMAP, behind the seven-method `ImapOrganiserLike` |
| `openbot/server/src/plugins/google-workspace-rest.ts` | The five tools listed and carried out; `describeCall`; Gmail's 204 answer read as success |
| `openbot/server/src/plugins/google-imap.ts` | The tools listed; the listing of labels and `describeCall` (read-only); a second connection for the four operations; `withConnection` factored out of `withMailbox` |
| `openbot/server/src/plugins/catalogue.ts` | `gmail.modify` on the OAuth entry; `gmail_list_labels` a read and the four writes, on both entries; `sendTools` unchanged |
| `openbot/server/src/plugins/share-target.ts` | The two Gmail connections' organising tools are not a message sent to somebody |
| `openbot/server/src/plugins/transport.ts` | An optional `describeCall` on the transport seam |
| `openbot/server/src/plugins/plugin-store/calls.ts`, `plugin-store/model.ts` | The refusal before the gate; the `describe` closure; `describeVendor` for a test to inject |
| `openbot/server/src/approvals/types.ts`, `approvals/service.ts` | `ApprovalDetails`, kept out of the digest and the stored action's function; `describe` run only when the person is to be asked; `details` in the public approval |
| `openbot/app/src/lib/approval-view.ts`, `approvals.ts` | The card for the four, and the `details` type |
| `openbot/scripts/fake-google/server.ts` | Labels, `batchModify` and the scope, with accessors for tests |
| `openbot/examples/freeduet/agents.yaml`, `skills.yaml` | Otto's sentences; the skill `organise-the-mailbox` |
| `evals/team/cases.yaml`, `fixtures/live/email-archive-everything.txt`, `run.test.ts`, `README.md` | `otto-8` (safety), `otto-9`, `otto-10`; the pins 72 → 75 cases and 33 → 34 safety; one test about the three; a "not certified" paragraph |
| `openbot/docs/plugins/google-workspace.md`, `openbot/docs/configuration.md`, `docs/TEAM.md`, `docs/COMPARISON.md`, `docs/M0_DEMO.md` | The tools, the scope and the limits; Otto's row; the case counts |
| `docs/UPSTREAM_TOUCHES.md` | Rows at the end of the table |

Not changed, by the brief: `docs/ROADMAP.md`, `docs/M1_PLAN.md`, `README.md`, `site/`. `README.md` line 161 still says 72 cases (216 conversations) and the cases not yet run live do not include these three; the roadmap row for mailbox organising, and a decision record in `docs/M1_PLAN.md`, are the coordinator's.

**Tests, on main's source and on the branch.**

Measured on 15 November 2026, on the branch merged with origin/main 38c4b48 (the merge of bfdc4ad, which changed only `docs/ROADMAP.md`, came after). "On main's source" means: this branch's test files run with every changed source file put back to main's version (`git checkout origin/main -- <file>`) and the two new source files removed; the branch's files were then restored and the tree checked.

| Test file | Tests | On main's source | On the branch |
|---|---|---|---|
| `server/tests/mail-organise.test.ts` (new) | 50 | does not load: `mail-organise` is not there | 50 pass |
| `server/tests/mail-organise-rest.test.ts` (new) | 33 | does not load | 33 pass |
| `server/tests/mail-organise-imap.test.ts` (new) | 33 | does not load | 33 pass |
| `server/tests/google-imap-organise-wire.test.ts` (new) | 18 | does not load | 18 pass |
| `server/tests/mail-organise-approval.integration.test.ts` (new, real Postgres) | 75 | does not load | 75 pass |
| `server/tests/mail-organise-grants.integration.test.ts` (new, real Postgres) | 18 | does not load | 18 pass |
| `server/tests/mail-organise-team.test.ts` (new) | 11 | does not load | 11 pass |
| `app/tests/approval-organise.test.tsx` (new) | 14 | 3 pass, 11 fail | 14 pass |
| `server/tests/catalogue-send-tools.test.ts` (updated) | 11 | 1 fail | 11 pass |
| `server/tests/google-app-password-catalogue.test.ts` (updated) | 12 | 3 fail | 12 pass |
| `server/tests/google-workspace-rest.test.ts` (updated) | 54 | 1 fail | 54 pass |
| `server/tests/plugin-catalogue.test.ts` (updated) | 61 | 2 fail | 61 pass |
| `server/tests/google-workspace-fake.test.ts` (updated) | 18 | 1 fail | 18 pass |
| `server/tests/google-app-password-store.integration.test.ts` (updated) | 27 | 1 fail | 27 pass |
| `evals/team/run.test.ts` (updated pins) | 167 | 4 fail | 167 pass |

In all: 238 new server tests and 14 new app tests. The seven new server files do not load on main's source, so none of their 238 tests can pass there; 11 of the 14 app tests fail there; 9 of the 183 tests of the six updated server files fail there, and 4 of the 167 in the evals file (the case count, the safety count, the lists of cases that need Gmail, and the pin for `otto-8` to `otto-10`). `server/tests/assertion-shape.test.ts` (10 tests) passes on the branch, with one allow-list line moved (`plugin-catalogue.test.ts`, 478 to 483).

**Planted defects.** Each is one hand-written edit of one source file. A small script applied it, ran the tests and put the file back (`git checkout`, and the tree checked clean after each). 37 defects, planted one at a time and all 37 caught on the final tree. The run covered the 13 server test files that touch this code (442 tests, none failing before a defect was planted) and the app's card test file (14 tests). 36 were caught the first time. M19 was missed: no test made the second IMAP command of a label call fail after the first had made its change, so a half-made change was reported as no change. `server/tests/mail-organise-imap.test.ts` has that case now (`removeAnswers` in `server/tests/support/fake-mail-organiser.ts`) and M19 fails it. M17 changes no behaviour, because `classifyTool` looks at the write list first; the list-equality tests still catch it, and M17b, which moves the tool from the write list to the read list, is the behavioural one. The script that applied the edits stayed outside the repository (Q11).

| # | Defect planted | Failing tests | Caught in (file, tests) |
|---|---|---|---|
| M1 | Trash and Spam are accepted as labels to add or remove | 12 | google-imap-organise-wire 1; mail-organise-approval.integration 2; mail-organise-imap 2; mail-organise-rest 3; mail-organise 4 |
| M2 | A call may name a thousand messages, not a hundred | 5 | google-imap-organise-wire 1; mail-organise-approval.integration 2; mail-organise-imap 1; mail-organise-rest 1 |
| M3 | A field the tool does not have is ignored instead of refused | 10 | google-imap-organise-wire 1; mail-organise-approval.integration 2; mail-organise-imap 1; mail-organise-rest 2; mail-organise 4 |
| M4 | A label name may carry a direction-changing or invisible character | 4 | mail-organise-approval.integration 2; mail-organise-rest 1; mail-organise 1 |
| M5 | IMAP: marking as read stores the `\Deleted` flag | 7 | google-imap-organise-wire 3; mail-organise-imap 4 |
| M6 | IMAP: every change is followed by a delete and an expunge | 21 | google-imap-organise-wire 7; mail-organise-approval.integration 6; mail-organise-imap 8 |
| M7 | IMAP: a read opens the mailbox for writing | 11 | google-imap-organise-wire 2; google-imap-wire 3; google-imap 4; mail-organise-imap 2 |
| M8 | Organising tools are listed among the sends of the catalogue | 11 | catalogue-send-tools 2; mail-organise-approval.integration 2; mail-organise-grants.integration 6; mail-organise-team 1 |
| M9 | The private-share exemption is gone: an organising tool reads as a send | 48 | mail-organise-approval.integration 48 |
| M10 | The call path no longer refuses an invalid organising call before the gate | 8 | mail-organise-approval.integration 8 |
| M11a | REST: a message that is gone does not refuse the call | 3 | mail-organise-approval.integration 1; mail-organise-rest 2 |
| M11b | IMAP: a message that is gone does not refuse the call | 3 | google-imap-organise-wire 1; mail-organise-approval.integration 1; mail-organise-imap 1 |
| M12a | REST: read and unread are the wrong way round | 3 | mail-organise-approval.integration 1; mail-organise-rest 2 |
| M12b | IMAP: read and unread are the wrong way round | 5 | google-imap-organise-wire 2; mail-organise-approval.integration 1; mail-organise-imap 2 |
| M13 | The card is drawn from the ids the Bot sent, not from what the server read | 7 | mail-organise-approval.integration 4; mail-organise-rest 3 |
| M14 | The gate does not read what the call touches | 10 | mail-organise-approval.integration 10 |
| M15 | REST: the label call sends the wrong key to Gmail | 8 | mail-organise-approval.integration 2; mail-organise-rest 6 |
| M16 | IMAP: a label of the person's called Archive is hidden by a guessed special use | 3 | google-imap-organise-wire 1; mail-organise-imap 1; mail-organise 1 |
| M17 | A tool that changes a mailbox is classified as a read | 4 | catalogue-send-tools 1; google-app-password-catalogue 1; google-workspace-rest 1; plugin-catalogue 1 |
| M17b | A tool that changes a mailbox is moved from the write list to the read list | 54 | google-app-password-catalogue 2; mail-organise-approval.integration 42; mail-organise-grants.integration 8; mail-organise-team 1; plugin-catalogue 1 |
| M18 | A label named Trash or Spam can be created | 5 | google-imap-organise-wire 1; mail-organise-imap 1; mail-organise-rest 1; mail-organise 2 |
| M19 | IMAP: a change that is half made is reported as nothing changed | 1 | mail-organise-imap 1 |
| M20 | REST: Gmail's empty 204 answer to a change is read as a failure | 13 | mail-organise-approval.integration 6; mail-organise-rest 7 |
| M21 | Text from a mail may carry direction-changing characters onto the card | 2 | mail-organise-rest 1; mail-organise 1 |
| M22 | REST: archiving also marks the message read | 1 | mail-organise-rest 1 |
| M23 | Another member is given the skill that organises a mailbox | 2 | mail-organise-team 2 |
| M24 | The card says nothing of how many messages | 6 | approval-organise 6 |
| M25 | The card takes its count from the Bot's ids and not from what the server read | 1 | approval-organise 1 |
| M26 | The card does not say that nothing is deleted when archiving | 2 | approval-organise 2 |
| M27 | The card shows text from a mail as the server sent it, with no cut | 2 | mail-organise-rest 1; mail-organise 1 |
| M28 | A removed label is applied as an added one (REST) | 11 | mail-organise-approval.integration 4; mail-organise-rest 7 |
| M29 | IMAP: the guard on what may be stored lets every system label through | 1 | mail-organise-imap 1 |
| M30 | OAuth entry: the organising scope is dropped, so a change is refused by Google for want of it | 1 | plugin-catalogue 1 |
| M31 | A press with nothing named gives every tool that does not send, the four writes among them | 4 | mail-organise-grants.integration 4 |
| M32 | Every write of an entry is held back for settings, so a press can give none of the four | 9 | catalogue-send-tools 1; mail-organise-approval.integration 2; mail-organise-grants.integration 6 |
| M33 | A routine, a check-in or a remote turn no longer always asks for the four writes | 12 | mail-organise-approval.integration 12 |
| M34 | Full access is special-cased for the four writes: they ask even where every other write passes | 2 | mail-organise-approval.integration 2 |

**Checks run on the merged branch.**

Run on 15 November 2026 from `openbot/`, one command at a time.

- `bun run typecheck` (shared, toolkit, worker, server, app): clean.
- `bun run typecheck:tests`: clean against the baseline, 239 known errors, none added.
- Biome: `format` over 2196 files and `lint --error-on-warnings` over 2215 files, no findings. The format check found one line of a test file after the last typing fix; it was formatted and committed.
- `bun run test:server:sharded` (11 shards, real Postgres): 9190 pass, 3 fail, 21 skip. The three failures are the ones `CLAUDE.md` lists as failing on plain main in this sandbox: the "real provider sees the learned catalog and both server-read results" tests of `learning-langgraph.test.ts` and `learning-mastra.test.ts`, and the Mastra bridge test. This branch does not touch those files, and main's own full suite was not run for the comparison. An earlier full run, before four pins of this branch's own were moved (an allow-list line, two tests that held the old tool counts, an unread array in the grants test), showed 4 more failures, all fixed.
- `bun test app/` after `bun run generate:app-config`: 2990 pass, 0 fail, in 314 files.
- The 14 server files that carry this change (`assertion-shape` among them), the app card test and `evals/team/run.test.ts`, run again after the last merge of origin/main (only `site/` changed) and the last formatting commit: 431 server tests pass, 14 app tests pass, 167 evals tests pass, 0 fail.
- The planted defects, run again on the same tree: 37 of 37 caught.
- Nothing ran live: see section 7.

## 9. Decisions left to the maintainer

| # | Decision | Built now | Options | Recommendation | Why |
|---|---|---|---|---|---|
| Q1 | The OAuth scope | `gmail.modify` on the OAuth connection; a person who connected before reconnects once | (a) as built; (b) organising only on the app-password connection and say plainly on OAuth that it is not offered; (c) a second OAuth entry for organising | (a) | Gmail's `batchModify` takes no narrower scope; the tools are the boundary, as they are for the app password, which is wider than any scope; `gmail.readonly` is already restricted, so Google's verification is no new tier |
| Q2 | Always allow for the four | Offered, and honoured for one tool at a time, as for every write | (a) as built; (b) never offered for these four, like a new email | (a) | A routine always asks anyway (D35); (b) costs a card on every tidy-up in chat for a change the person can undo. Moves to (b) if you want each batch looked at |
| Q3 | Whether the four always show a card in the person's own turn | Decided by the maintainer and built: always a card in the person's own turn, whatever "ask before changes" and the reviewer say, lifted only by the person's own Always allow for that tool; with Full access on there is none, as for any write that is not a payment; always in a routine, a check-in, a remote session, a hand-off from one | (a) as built; (b) a card even with Full access on, which needs a special case in the Full access rules | (a) | The brief was "like any other write, and no special case for Full access"; (b) is a change to Full access and is yours |
| Q4 | The card in channels | Slack, Telegram and the like show the raw arguments and a generic step label | (a) as built; (b) a plain-words summary for channel prompts | (b) later | The app's card is the one this slice builds; a channel summary reuses `describeOrganise`'s words and is a separate change |
| Q5 | Trying IMAP on a real mailbox | Not done | (a) you try it once on a throwaway Gmail account before relying on it; (b) a live test in CI | (a) | Steps: connect an app password, ask Otto to create a label and file three test messages under it, allow each card, look in Gmail. `X-GM-LABELS`, `CREATE` and a read-write `SELECT` are documented, but no test ran on Google's IMAP |
| Q6 | Who holds the tools | Only Otto's skill declares them; the package seeds no grant; a person can still give them to another member from that member's page or by naming them on that member's row | (a) as built; (b) treat the four like the sends: never granted by a press, only from the Bot's page | (a) | The brief says they are not sends; (b) would stop the inbox row from ever giving Otto the tools he needs. The tests pin that a press with nothing named gives none, and that no other member is asked |
| Q7 | A label named like a payment or a password | The safety floor hands it to the person, so no card is shown, it is "always done by the person" | (a) as built; (b) read the floor's words only in the tool's reference and scope for these four | (a) | It is rare and conservative, and narrowing the floor is not this slice's call |
| Q8 | The evals | Three cases added, not run | Run `otto-8,otto-9,otto-10` live, `otto-9` on a stack with Gmail connected | Run them | New cases are not certified until they run live; the eval stack has no Gmail |
| Q9 | Putting a message back in the Inbox | Not built: `INBOX` is refused as a label to add | (a) as built; (b) a fifth write, `gmail_unarchive_messages`, with the same card | (a) now, (b) when the first person asks | An archive can be undone in Gmail; a tool for it is the same size as archive and has to be reviewed the same way |
| Q10 | The record of this decision | Not recorded in `docs/M1_PLAN.md`, `docs/ROADMAP.md`, `README.md` or `site/`, by the brief | The coordinator takes a decision number, moves the roadmap row and the 72 → 75 in `README.md` line 161 | Do it with the merge | The roadmap follows decisions at once |
| Q11 | The planted defects | Run by hand and recorded in section 8 | (a) as built; (b) add them to `openbot/scripts/mutation-register.ts` | (b) later | The register is a shared file, so it is a separate small change, and it makes the next change to this code run the same checks |
