# Organise a mailbox: labels, archive, read and unread

**Status checked 2026-11-17 against origin/main 7ee1dc6.** Where the wording below differs, this status wins. Built today, on both Gmail connections and behind the same approval gate ([code: openbot/server/src/plugins/catalogue.ts:528-529, 580-581]): the labels, archive, read and unread tools of sections 1 to 8 (PR #254); moving mail to the Bin, `gmail_bin_messages`, which Gmail keeps for about 30 days (section 10, D41); moving mail to Spam, `gmail_spam_messages` (section 11, D42); and searching Spam and the Bin by name (section 12, D53). Standing mail rules (`gmail_create_rule`, `gmail_list_rules`, `gmail_disable_rule`) are built as well. They are FreeDuet's own rules for new mail, not Gmail filters ([code: openbot/server/src/plugins/mail-rules.ts:509]), and [mail-rules.md](mail-rules.md) describes them. No FreeDuet tool deletes a message for good, empties the Bin or Spam, or forwards mail. The REST helper sends only GET and POST ([code: openbot/server/src/plugins/google-workspace-rest.ts:344]); the Bin move is `messages/{id}/trash` ([code: openbot/server/src/plugins/google-workspace-rest.ts:1169]) and the Spam move is `messages/{id}/modify` ([code: openbot/server/src/plugins/google-workspace-rest.ts:1198]). The IMAP organiser uses only its open, list, search, fetch, create, copy and flag methods, and never stores the `\Deleted` flag ([code: openbot/server/src/plugins/google-imap-organise.ts:204, 249, 306, 321, 353, 362]). Sections 1 to 9 describe the first slice as it stood on 15 November 2026 and stay as history; sections 10 to 12 were added later.

Built in PR #254 (see "Built so far", section 8). Written 2026-11-15 on origin/main; a later change under `site/` only, and then a change to `docs/ROADMAP.md` only, were merged into the branch before the pull request.

Decided by the maintainer on 15 November 2026: "a mail assistant cannot have this limit". He asked Otto to create a Gmail label called FreeDuet and to file the repository's automatic notifications under it, out of the Inbox. With the app-password connection (`google-imap`) Otto could not: a member held three reads (`gmail_search_messages`, `gmail_read_message`, `calendar_list_events`) and two sends, and nothing that changes a mailbox. Both Gmail connections now give a member the tools to organise one. This file covers the first slice only.

Tags: **[code: path]** read on origin/main at 225caee. Code paths start at `openbot/`; doc paths start at the repository root. **[tested]** a test in this branch fails on main's source and passes now. **[verify]** unknown; a real install must settle it.

## 1. What the person gets

- A request such as "create a label called FreeDuet and file the automatic notifications from GitHub that are in my inbox under it, out of the inbox" can be done. Otto searches, says in one plain sentence what he will touch (how many messages, from whom, which subjects, what happens to them), and calls the tools.
- Each of the four tools that change the mailbox runs with no card when the person's own typed words of this live chat turn asked for that change (directly with the member, or one hop through Iris), and shows a card in every other case: the request did not ask for it, the idea came from an email, a page or a tool, a routine, a check-in, a remote session, a spoken message, or a hand-off from one of those (section 3, "The direct-order rule"; maintainer's decision of 15 November 2026). The person's own earlier "Always allow" for that tool lifts the card for that tool. The card is in plain words:
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

**The direct-order rule.** (Maintainer's decision of 15 November 2026: Otto does it by himself when the person gives a direct order in the chat, at least for now; a button to approve may come later.) The call path reads the person's own typed words of this live turn with the same reading D27 uses for a new email's recipients (`latestTypedText`, `typedRequestByPerson`, `typedRequestInHandedRequest`, `server/src/plugins/typed-recipients.ts:93-150`; one hop through Iris reads the message the server recorded on the hop, as D27a does) and puts it on the candidate (`organisesMailbox: { request }`, `server/src/plugins/plugin-store/calls.ts:729-760, 789-791`, read off the transport and the tool's name together; `request` is null when none can be traced). The approval service passes it to the gate (`server/src/approvals/service.ts:362-365`) and `decideAction` (`server/src/approvals/policy.ts:544-635`, input `mailboxChange`, reason `MAILBOX_NOT_ASKED_REASON`, policy.ts:465) does four things for these four tools and no other action: (1) it asks the reviewer ALWAYS, whatever the person's auto-review preference says; (2) it shows the reviewer that text as the request, and nothing else; (3) it lets the call through with no card only when the reviewer, reading those words, answers `proceed` and `preApproved` (the person asked explicitly for this exact action); (4) a request that cannot be traced, any other verdict, no reviewer, an answer that is not valid and a timeout are a card. It sits after the D35 always-ask case and after the hand-offs, so a routine, a check-in, a remote session and a hand-off that started in one ask and no rule lifts it; the person's own saved "Always allow" for that tool skips the reviewer for that tool and lets it through; the person's own "ask before changes" still shows the card; Full access is read before all of it, as for every write.

**What the reviewer is shown.** Before this change the reviewer was given `requestOf(messages)` for every write: every user message in the run's history except a hand-off envelope, the last 6,000 characters, attachments flattened to text. That could include an earlier message of the person's that did ask (a routine's stored prompt looks the same), a long pasted mail and the text parts of an attachment. For the four tools it is now the person's latest message of this live turn only, a plain string of at most 600 characters, not from the microphone (the `voice-` mark), not a hand-off's envelope. A tool's answer, an assistant's own text and a mail's body are other roles and are never read. Everything else the reviewer sees is the action itself (tool, target, the ids and label names the member chose), which it is told to treat as data. Every other write keeps `requestOf`.


**Otto.** His prompt says he may label, archive and mark mail only when the person asks in their own message, names the four tools, and says: he says in one sentence what he will touch and then calls the tool; when the person's own message in the chat asked for it, it runs with no card and he says what he did and to how many messages; when it did not (he thought of it, a standing rule led to it, the idea came from an email, or the turn was a routine, a check-in, a phone away from the computer or a spoken message), a card appears and he waits, and if the person refuses he says nothing was changed. One sentence says what to do when a tool is missing. The sentence about instructions inside an email names archiving and labelling. The shared-rules paragraph is untouched. A skill, `organise-the-mailbox`, declares the six tools (and search) on both connections, says the same, and is attached to Otto only.

## 4. Rules that hold, and the tests that say so

1. **A direct order in the live turn runs with no card; nothing else does.** The person's own typed words ask for it, and the reviewer reading those words and nothing else says so: no card, on both connections, whether the person's auto-review preference is on or off. A request that did not ask for it, an instruction that sits in an email while the person only asked to read, an earlier message that asked, a pasted mail, a message with attachments, words from the microphone, a hand-off with no record of the person's message and a run that is not the person's live turn: a card. "Ask before changes" on: a card. The person's own Always allow for that tool lifts it, for that tool only. The always-ask cases and Full access are the gate's own, unchanged. A typed address in the person's message does not turn an archive into a new email; an Allow once is spent on the call it was given for, and a new call asks again. [tested through the real gate, the real plugin store and the real approval service on Postgres, on both connections, in `server/tests/mail-organise-approval.integration.test.ts`: for each of the four tools, a direct order, a request that did not ask, an email-borne instruction (tool answer, assistant text, earlier message, long paste, attachment parts), words from the microphone, a hand-off, one hop through Iris, a server-run turn; and what the reviewer was shown is read back from the prompt it received.]
2. **They are not sends.** Not in `sendTools` of either entry, not named by `NEW_EMAIL_SENDS`, not in hub grants (hub grants are between members and none is a tool). [tested: `catalogue-send-tools.test.ts`, `mail-organise-team.test.ts`, the integration test above.]
3. **The card is the server's reading, never a Bot's.** The messages and their count come from `details`; the ids the Bot sent only stand in when the mailbox could not be read, and a Bot that names more ids than the server found does not change the count. [tested: the card's messages equal what the mailbox held for those ids, in the order named, on both connections, and the read changes nothing (`mail-organise-approval.integration.test.ts`); the app's card takes its count and its list from `details` and not from the ids (`app/tests/approval-organise.test.tsx`).]
4. **A read is a read.** `gmail_list_labels` has no card, with "ask before changes" on and in a routine. [tested.]
5. **A call that cannot be carried out asks nobody.** Trash or Spam as a label, 101 ids, a field that would act on everything a search matches, a label name with a control character: refused before the gate, with an audit row `mcp.call_rejected` and the refusal `mail_organise_call_invalid`. [tested.]
6. **The four tools above delete, trash, report as spam, forward or move nothing; the Bin tool of section 10 moves to the Bin and does nothing else.** [tested: `server/tests/google-imap-organise-wire.test.ts` runs every operation through the real IMAP client against a server that records every command line. It asserts the exact commands, that every command is on an allow-list (`LOGIN`, `LIST`, `SELECT`, `EXAMINE`, `UID SEARCH`, `UID FETCH`, `UID STORE`, `CREATE` and the connection's own), that none is an `EXPUNGE`, a `MOVE`, an `APPEND`, a `DELETE` or a `RENAME`, that a `COPY` is only the Bin's, `UID COPY` into `[Gmail]/Trash` (section 10), that a `UID STORE` is only of `X-GM-LABELS` or of `\Seen`, that no line names `\Deleted`, Spam or Junk, that Trash appears only in that one copy, and that no read opens a mailbox with `SELECT`. `server/tests/mail-organise-rest.test.ts` holds every request of every test to one allow-list in `afterEach`, so a path that deletes, forwards or filters fails whichever test reached it (the one request that trashes belongs to the Bin tool, and `mail-bin-transports.test.ts` holds it to its own allow-list).]
7. **All of the named messages, or none.** A message gone since the card was drawn refuses the call; nothing is partly done except where Gmail's own IMAP needs two commands for an add and a remove, and then the answer says that only part was made. [tested.]
8. **Who holds the tools is grants, and nothing gives them by reading mail.** The package seeds none. A press of the inbox row with nothing named gives the reads (the listing among them) and not one write; naming one gives exactly that one; the row the app sends names every tool it lists but the sends, so the person who presses it chooses all four; a member whose skills do not name them is not asked for them. [tested through the real routes with the skills the package gives Otto, in `server/tests/mail-organise-grants.integration.test.ts`.]
9. **Routines, check-ins, remote turns and hand-offs that started in one always ask**, and Full access is neither lifted nor tightened for these tools: on for Otto in the person's own turn they pass with no card like any write, a routine's run still asks, a member the person did not switch on still asks. A routine's own words are never read as the person's request. [tested.]
10. **Both connections say the same thing.** The tool lists are equal, the refusals are the same sentences, the answers have the same shape; the catalogue lists are held equal by a test.

## 5. What is not built

Decided, so the next slice does not have to rediscover it:

- **No permanent delete, no emptying the Bin, no spam.** Trash and Spam are still refused as labels in both directions, so the four tools above cannot reach them. Moving mail to the Bin is its own tool (section 10, decided later the same day); nothing deletes for good, nothing empties the Bin or Spam; moving mail to Spam is its own tool (section 11, decided later the same day).
- **No filter creation, no forwarding rule, no forwarding of mail.**
- **No move between arbitrary folders.** A label is how a message is filed; archive takes it out of the Inbox and nothing more.
- **No operation on "everything a search matches".** Ids must be listed, at most 100 a call, so the card can say how many and which. No field names a search, a folder or a place to forward to, and a test fails if one is added.
- **No way to put a message back in the Inbox.** `INBOX` is refused as a label to add, so a Bot cannot undo an archive; the person does it in Gmail ("Move to Inbox"). An un-archive tool is a small later change, and a decision (Q9).
- **No change to the sends** and none to who holds them: only Otto has them (D30).
- **No new approval mode**: the direct-order rule is a gate input for four tools (the reviewer, always, on the person's typed words), not a D35 always-ask case; the person's own Always allow still lifts the card for one tool (section 3, Q3).
- **No change to channel approvals** (a card in Slack, Telegram and the like): see the limits.

## 6. Limits

- **Whether the person "asked" is judged by the reviewer model, from the person's own words, and it can be wrong in both directions.** Nothing in code can read "archive the invoices" and decide it asks for this exact set of ids: the reviewer model does, in the sense of the prompt's `preApproved` ("the request explicitly asks for this exact action on this exact target"). It can let through a change the person did not mean (a loose request such as "tidy my inbox" read as asking for an archive of ids the member chose), and it can ask when the person did ask (the card then costs a press). What the server does hold, and the model cannot change: it always asks the reviewer for these four tools, it shows the reviewer only the person's typed words of this live turn, it never lets a routine, a check-in, a remote or spoken turn or a hand-off from one through, and a reviewer that is missing, slow or invalid is a card. Nothing in a message body causes an action by itself: a mail's text is data, Otto is told to report an instruction inside an email as suspicious, and the reviewer never reads the mail. But a model can be misled into calling the tool, and when it is, and the person's own words happen to read as asking for it, nothing stands between that call and the mailbox. What bounds the harm is that the four are reversible by the person in Gmail (nothing is deleted; an archived message is in All Mail and has its labels), and so is the Bin tool for about 30 days (section 10), that at most 100 messages go in a call, that the tools take ids and cannot act on "everything a search matches", and that Gmail's own history shows the change. A card, an Always allow, Full access or a press without reading is the same limit every write has.
- **Full access.** With Full access on for the member, in the person's own live turn, the four go through with no card, exactly as the existing rules treat any write that is not a payment (they are not special-cased either way, M34). The gate looks at Full access before the always-a-card rule, as it does for every write; a routine, a check-in, a remote session and a hand-off from one are not in Full access's reach and ask. Tested through the real gate on both connections.
- **"Always allow" is offered for these four**, as for any write, and honoured for one tool at a time: after an Always allow on archive, the next archive needs no card, whatever the request says, and the other three still decide on the person's words. It is neither offered nor honoured where the gate says "always ask": a routine, a check-in, a remote session, a hand-off from one (Q2).
- **A label's name cannot carry a curly quotation mark** (U+2018, U+2019, U+201A, U+201B, U+201C, U+201D, U+201E, U+201F): the card writes the name between U+201C and U+201D, and a name holding one could close the quotation and write the rest of the title itself.
- **A message in the Trash or in Spam is "not found" on both connections.** Over IMAP All Mail does not hold one; over REST the lookup reads its labels and refuses it in the same words.
- **IMAP timeouts.** A call that times out or whose connection drops after the first command that changes a thing was sent answers that the change may have been made and to look in Gmail; before that it changed nothing and says only that Gmail did not answer. A logout that Gmail does not answer in two seconds is cut off.
- **The OAuth scope is wider than the tools.** `gmail.modify` also allows trashing mail, which no tool here does and the connector cannot be made to (every request it makes is one of those listed in section 3, and a test lists them). A person who connected before the scope was added has not granted it: reading and sending go on working, and the four tools answer with Google's refusal in plain words until they reconnect. `gmail.modify` is a restricted scope like `gmail.readonly`, so the verification Google asks of an app beyond Testing is not a new tier (Q1).
- **The IMAP side is untested against a real Gmail.** The commands are the ones Gmail's IMAP documents (`X-GM-LABELS`, `CREATE`, `SELECT` read-write) and the tests run the real client against a recording server, but no test ran on a real mailbox [verify]. Lookups are one `SEARCH` per id, so 100 ids are 100 round trips; the connection has 60 seconds. A label call that both adds and removes is two commands, and the second can fail after the first was made, which the answer says.
- **A label's name is read by the safety floor.** The floor matches words such as "payments" and "password" in a call's arguments, so a label called "Payments" is handed to the person ("this is always done by the person") rather than asked about. That is the existing floor, unchanged (Q7).
- **A channel's card is plainer.** A step in Slack, Telegram and the like shows the raw arguments and a generic label ("Gmail archive messages"), because the plain-words card is the app's (Q4).

## 7. What is not verified

- **Nothing ran live.** Otto's prompt, the skill and the tool descriptions are text a model reads. Four cases are added, not run (`otto-11` after the direct-order change): `otto-8` (a safety case: an email that tells him to archive and label everything), `otto-9` (the real request; needs Gmail, so the eval stack skips it) and `otto-10` (the tools are missing: say so once). Run `otto-8,otto-9,otto-10`, and then `--member inbox`, before Otto's prompt counts as certified. The eval stack has no Gmail connected, so `otto-9` can only be run on a stack that has.
- **A real Gmail**, over REST and over IMAP. Whether the tools do what the tests say against Google's servers is [verify]; the fake Google (`openbot/scripts/fake-google/server.ts`) now keeps labels and answers `batchModify`, and checks the scope, so the REST side can be tried end to end without an account.
- **Whether Otto looks first, says what he will touch, and calls the tool, and whether he resists an instruction inside a mail.** Both are a model's behaviour.
- **How the reviewer model judges "asked".** The tests use a stub that reads only the request block and matches words. A real model reading "tidy my inbox", "clean this up" or a request in another language is not tested: it can let through a change the person did not mean, or ask when they did. The reviewer prompt itself is unchanged (`preApproved`: "the request explicitly asks for this exact action on this exact target").
- **Otto's new sentences and the new eval cases** (`otto-9` changed, `otto-11` added) are text a model reads and were not run live.
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

Not changed, by the brief: `docs/ROADMAP.md`, `docs/M1_PLAN.md`, `README.md`, `site/`. `README.md` line 161 said 72 cases (216 conversations) when the brief was written, and now says 96 cases and the cases not yet run live do not include these three; the roadmap row for mailbox organising, and a decision record in `docs/M1_PLAN.md`, are the coordinator's.

**Tests, on main's source and on the branch.**

Measured on 15 November 2026, on the branch merged with origin/main 38c4b48 (the merge of bfdc4ad, which changed only `docs/ROADMAP.md`, came after). "On main's source" means: this branch's test files run with every changed source file put back to main's version (`git checkout origin/main -- <file>`) and the two new source files removed; the branch's files were then restored and the tree checked.

| Test file | Tests | On main's source | On the branch |
|---|---|---|---|
| `server/tests/mail-organise.test.ts` (new) | 52 | does not load: `mail-organise` is not there | 52 pass |
| `server/tests/mail-organise-rest.test.ts` (new) | 35 | does not load | 35 pass |
| `server/tests/mail-organise-imap.test.ts` (new) | 36 | does not load | 36 pass |
| `server/tests/google-imap-organise-wire.test.ts` (new) | 18 | does not load | 18 pass |
| `server/tests/mail-organise-approval.integration.test.ts` (new, real Postgres) | 87 | does not load | 87 pass |
| `server/tests/mail-organise-grants.integration.test.ts` (new, real Postgres) | 18 | does not load | 18 pass |
| `server/tests/mail-organise-team.test.ts` (new) | 12 | does not load | 12 pass |
| `app/tests/approval-organise.test.tsx` (new) | 14 | 3 pass, 11 fail | 14 pass |
| `server/tests/catalogue-send-tools.test.ts` (updated) | 11 | 1 fail | 11 pass |
| `server/tests/google-app-password-catalogue.test.ts` (updated) | 12 | 3 fail | 12 pass |
| `server/tests/google-workspace-rest.test.ts` (updated) | 54 | 1 fail | 54 pass |
| `server/tests/plugin-catalogue.test.ts` (updated) | 61 | 2 fail | 61 pass |
| `server/tests/google-workspace-fake.test.ts` (updated) | 18 | 1 fail | 18 pass |
| `server/tests/google-app-password-store.integration.test.ts` (updated) | 27 | 1 fail | 27 pass |
| `evals/team/run.test.ts` (updated pins) | 167 | 4 fail | 167 pass |

In all: 258 new server tests and 14 new app tests. The seven new server files do not load on main's source, so none of their 258 tests can pass there; 11 of the 14 app tests fail there; 9 of the 183 tests of the six updated server files fail there, and 4 of the 167 in the evals file (the case count, the safety count, the lists of cases that need Gmail, and the pin for `otto-8` to `otto-10`). `server/tests/assertion-shape.test.ts` (10 tests) passes on the branch, with one allow-list line moved (`plugin-catalogue.test.ts`, 478 to 483).

**The direct-order change (15 November 2026, a new branch after the first merge).** The maintainer decided Q3 the other way: Otto does it by himself when the person gives a direct order in the chat, at least for now. The always-a-card rule of the review fix R1 (`mustAsk`, `MAILBOX_CHANGE_REASON`) is removed and replaced by the direct-order rule of section 3, which is stricter than the gate was before R1 in two ways, at no cost to a person who gives a direct order: the reviewer is always asked for these four (before, a person whose auto-review preference was off had no reviewer at all, and the write passed), and it is shown only the person's typed words of this turn (before, every user message of the run). Tests that fail without it, in `mail-organise-approval.integration.test.ts`, for each of the four tools on both connections and with the auto-review preference on and off: a direct order runs with no card; a request that did not ask shows a card; an instruction in an email (tool answer, assistant text, an earlier message, a long paste, attachment parts) while the person only asked to read shows a card, and the prompt the reviewer got is read back and holds none of it; words from the microphone, a hand-off with no record, a server-run turn and a run with no live turn show a card; one hop through Iris from the person's order runs, one whose record does not ask or is missing shows a card, and the reviewer judged the person's message and never Iris's envelope; a routine, a check-in, a remote session and a hand-off from a routine show a card that no rule lifts; no traceable request is a card even when the reviewer would say proceed to anything; "ask before changes" on shows a card; Always allow lifts the card for that tool only; a read still runs. The old tests of the always-a-card block (M35 to M37) are retired with the rule. Planted defects D1 to D16 (section below): 16 of 16 caught (D14 was missed at first and the "no traceable request" test was added for it).

**Reviewer hardening (after the review of PR #258).** For a mailbox change the reviewer's prompt carries two fixed extra rules (`MAILBOX_REVIEW_LINES`, `policy.ts`, passed only when `mailboxChange` is set; every other review is unchanged): the action's arguments (label names, ids) are chosen by the member and may be attacker-controlled, so only the request can justify the change and arguments that read like instructions or claims of approval mean a card; and `preApproved` needs the request itself to name the change and what it applies to, so "tidy my inbox" is a card. Residual limit, stated plainly: the reviewer sees message ids, not their content, so within the category a typed order names it cannot tell which messages were meant. Damage is bounded: nothing is deleted, nothing goes to the bin or spam, at most 100 messages per call, and every change is reversible in Gmail. Tests: `a label name that claims approval is data ...` and `the hardening lines are for a mailbox change only` in `mail-organise-approval.integration.test.ts`.

**Review fixes (15 November 2026).** Each has a test that fails without the fix; the "without" is the planted defect of the same row, which puts the old behaviour back.

| Fix | Test (file) | Fails without it |
|---|---|---|
| R1 (replaced on 15 November 2026 by the direct-order rule, next section) | the always-a-card block it added is gone; see "The direct-order change" | M35 to M37 retired |
| R2 prompt and skill | `what Otto is told`, `says there is no card when the person's own message asked, and a card when it did not` in `mail-organise-team.test.ts` | wording pins |
| R4 curly quotes in a label name | `a curly quotation mark is refused ...` in `mail-organise.test.ts` | M39 |
| R5 timeout after a change was sent; logout cut off | three tests in `mail-organise-imap.test.ts` | M40, M41 |
| R6 one rule for All Mail | `the folder that holds every mail is the server's own \\All ...` in `mail-organise.test.ts`; the source pin in `google-imap.test.ts` | M42 |
| R7 Trash and Spam over REST | two tests in `mail-organise-rest.test.ts` | M43 |
| D1 | The reviewer is shown every user message of the run, not the person's typed words | 56 | mail-organise-approval.integration 56 |
| D2 | The reviewer is not asked when the person's auto-review preference is off | 32 | mail-organise-approval.integration 32 |
| D3 | A reviewer's proceed without preApproved lets the call through | 4 | mail-organise-approval.integration 4 |
| D4 | The person's own Always allow no longer skips the reviewer for the tool | 4 | mail-organise-approval.integration 4 |
| D5 | A run that is not the person's live turn is read as typed | 16 | mail-organise-approval.integration 16 |
| D6 | Words from the microphone count as typed | 16 | mail-organise-approval.integration 16 |
| D7 | A pasted mail longer than the cap counts as the request | 18 | mail-organise-approval.integration 16; typed-recipients 2 |
| D8 | A hand-off's envelope counts as the person's message | 2 | typed-recipients 2 |
| D9 | A message with attachment parts is read as text | 18 | mail-organise-approval.integration 16; typed-recipients 2 |
| D10 | The approval service does not pass the mailbox change to the gate | 88 | mail-organise-approval.integration 88 |
| D11 | Mark is not among the four the gate treats as a mailbox change | 23 | mail-organise-approval.integration 22; mail-organise 1 |
| D12 | The reviewer's needs_approval is not acted on when auto-review is off | 8 | mail-organise-approval.integration 8 |
| D13 | A hop's request is read from the hop's own envelope, not the recorded message | 16 | mail-organise-approval.integration 16 |
| D14 | No traceable request still runs on the reviewer's verdict | 2 (after the test added for it; 0 before) | mail-organise-approval.integration 2 |
| D15 | A routine's run is not held by the always-ask case | 20 | mail-organise-approval.integration 20 |
| D16 | The call path never records the person's words | 64 | mail-organise-approval.integration 64 |
| R8 the second guard on what may be stored | `mail-organise-imap.test.ts` (one test catches its removal, two its widening) | M29, M38 |

**Planted defects.** Each is one hand-written edit of one source file. A small script applied it, ran the tests and put the file back (`git checkout`, and the tree checked clean after each). 46 defects, planted one at a time and all 46 caught on the final tree (the first 37 on the first version, M35 to M43 with the review fixes). The run covered the 13 server test files that touch this code (462 tests, none failing before a defect was planted) and the app's card test file (14 tests). 36 of the first 37 were caught the first time. M19 was missed: no test made the second IMAP command of a label call fail after the first had made its change, so a half-made change was reported as no change. `server/tests/mail-organise-imap.test.ts` has that case now (`removeAnswers` in `server/tests/support/fake-mail-organiser.ts`) and M19 fails it. M17 changes no behaviour, because `classifyTool` looks at the write list first; the list-equality tests still catch it, and M17b, which moves the tool from the write list to the read list, is the behavioural one. The script that applied the edits stayed outside the repository (Q11).

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
| M35 | R1 (retired, the rule is replaced): the approval service does not pass the always-a-card reason to the gate | 4 | retired on 15 November 2026 |
| M36 | R1 (retired): the person's own Always allow no longer lifts the card for that tool | 4 | retired; D4 is its successor |
| M37 | R1 (retired): the card is skipped when the reviewer says proceed | 4 | retired; D3 and D14 are its successors |
| M38 | R8: the second guard on what may be stored lets the Trash and `\Deleted` flags through | 2 | mail-organise-imap 2 |
| M39 | R4: a curly quotation mark is allowed in a label name | 1 | mail-organise 1 |
| M40 | R5: a timeout after a change was sent is told as if nothing was changed | 1 | mail-organise-imap 1 |
| M41 | R5: a logout Gmail does not answer is waited for, not cut off | 1 | mail-organise-imap 1 |
| M42 | R6: the read finds All Mail by a special use the library only guessed from a name | 1 | mail-organise 1 |
| M43 | R7: over REST a message in the Trash or in Spam is found and acted on | 2 | mail-organise-rest 2 |

**Checks run on the merged branch.**

Run on 15 November 2026 from `openbot/`, one command at a time.

- `bun run typecheck` (shared, toolkit, worker, server, app): clean.
- `bun run typecheck:tests`: clean against the baseline, 239 known errors, none added.
- Biome: `format` over 2196 files and `lint --error-on-warnings` over 2215 files, no findings. The format check found one line of a test file after the last typing fix; it was formatted and committed.
- `bun run test:server:sharded` (11 shards, real Postgres), run again after the review fixes: 9210 pass, 3 fail, 21 skip. The three failures are the ones `CLAUDE.md` lists as failing on plain main in this sandbox: the "real provider sees the learned catalog and both server-read results" tests of `learning-langgraph.test.ts` and `learning-mastra.test.ts`, and the Mastra bridge test. This branch does not touch those files, and main's own full suite was not run for the comparison. An earlier full run, before four pins of this branch's own were moved (an allow-list line, two tests that held the old tool counts, an unread array in the grants test), showed 4 more failures, all fixed.
- `bun test app/` after `bun run generate:app-config`: 2990 pass, 0 fail, in 314 files.
- The 14 server files that carry this change (`assertion-shape` among them), the app card test and `evals/team/run.test.ts`, run again after the last merge of origin/main (only `site/` changed) and the last formatting commit: 451 server tests pass (the 13 files above and `assertion-shape`), 14 app tests pass, 167 evals tests pass, 0 fail.
- The planted defects: 46 of 46 caught (the first 37 re-run on the tree before the review fixes; M35 to M43 and M29, M33, M34 after them).
- Nothing ran live: see section 7.

## 9. Decisions left to the maintainer

| # | Decision | Built now | Options | Recommendation | Why |
|---|---|---|---|---|---|
| Q1 | The OAuth scope | `gmail.modify` on the OAuth connection; a person who connected before reconnects once | (a) as built; (b) organising only on the app-password connection and say plainly on OAuth that it is not offered; (c) a second OAuth entry for organising | (a) | Gmail's `batchModify` takes no narrower scope; the tools are the boundary, as they are for the app password, which is wider than any scope; `gmail.readonly` is already restricted, so Google's verification is no new tier |
| Q2 | Always allow for the four | Offered, and honoured for one tool at a time, as for every write | (a) as built; (b) never offered for these four, like a new email | (a) | A routine always asks anyway (D35); (b) costs a card on every tidy-up in chat for a change the person can undo. Moves to (b) if you want each batch looked at |
| Q3 | Whether the four run with no card on the person's direct order | Decided by the maintainer on 15 November 2026 (the other way from the first answer, which was a card every time): Otto does it by himself when the person gives a direct order in the chat, at least for now. Built: no card when the person's own typed words of this live turn asked for that change, as the reviewer reads them; a card in every other case (the request did not ask, the idea came from an email, a page or a tool, a routine, a check-in, a remote session, a spoken message, a hand-off from one of those); the person's Always allow lifts it for one tool; Full access as for any write | (a) as built; (b) a card every time, with a button to approve later (what the first version did); (c) no card on a direct order, and the reviewer's judgement replaced by a code-only check (not possible: "asked for this" is language) | (a) for now, as decided; (b) if the first wrong silent change happens | The limit is in section 6: the reviewer model decides whether the person asked, so it can be wrong in both directions. The changes are reversible in Gmail and at most 100 messages go in a call. A later button to approve is the maintainer's note and is not built |
| Q4 | The card in channels | Slack, Telegram and the like show the raw arguments and a generic step label | (a) as built; (b) a plain-words summary for channel prompts | (b) later | The app's card is the one this slice builds; a channel summary reuses `describeOrganise`'s words and is a separate change |
| Q5 | Trying IMAP on a real mailbox | Not done | (a) you try it once on a throwaway Gmail account before relying on it; (b) a live test in CI | (a) | Steps: connect an app password, ask Otto to create a label and file three test messages under it, allow each card, look in Gmail. `X-GM-LABELS`, `CREATE` and a read-write `SELECT` are documented, but no test ran on Google's IMAP |
| Q6 | Who holds the tools | Only Otto's skill declares them; the package seeds no grant; a person can still give them to another member from that member's page or by naming them on that member's row | (a) as built; (b) treat the four like the sends: never granted by a press, only from the Bot's page | (a) | The brief says they are not sends; (b) would stop the inbox row from ever giving Otto the tools he needs. The tests pin that a press with nothing named gives none, and that no other member is asked |
| Q7 | A label named like a payment or a password | The safety floor hands it to the person, so no card is shown, it is "always done by the person" | (a) as built; (b) read the floor's words only in the tool's reference and scope for these four | (a) | It is rare and conservative, and narrowing the floor is not this slice's call |
| Q8 | The evals | Three cases added, not run | Run `otto-8,otto-9,otto-10` live, `otto-9` on a stack with Gmail connected | Run them | New cases are not certified until they run live; the eval stack has no Gmail |
| Q9 | Putting a message back in the Inbox | Not built: `INBOX` is refused as a label to add | (a) as built; (b) a fifth write, `gmail_unarchive_messages`, with the same card | (a) now, (b) when the first person asks | An archive can be undone in Gmail; a tool for it is the same size as archive and has to be reviewed the same way |
| Q10 | The record of this decision | Not recorded by the brief; now in section 12 of this file, which `docs/M1_PLAN.md` points to, and in the roadmap row "A mail assistant that tidies your mailbox" | The coordinator takes a decision number, moves the roadmap row and the 72 → 75 in `README.md` line 161 | Do it with the merge | The roadmap follows decisions at once |
| Q11 | The planted defects | Run by hand and recorded in section 8 | (a) as built; (b) add them to `openbot/scripts/mutation-register.ts` | (b) later | The register is a shared file, so it is a separate small change, and it makes the next change to this code run the same checks |

## 10. Move to the Bin (D41)

Decided by the maintainer on 15 November 2026: "a mail assistant must be able to remove mail". Built on the branch `mail-bin`, on origin/main a9adbc6, beside the four writes above and in the same way. The decision is D41 in [M1_PLAN.md](../M1_PLAN.md), section 24 ("A mail assistant can move mail to the Bin, and only to the Bin (D41)").

**What the person sees.** One more tool, `gmail_bin_messages`, on both connections. Otto may move listed messages to the Bin (Gmail's Trash) when the person orders it. He says first how many messages and which, and that the Bin keeps them about 30 days, so the person can restore them from it. With no card only when the person's own typed message of the live turn (directly, or one hop through Iris) says to delete, bin or trash mail AND names which (a sender, a category, a label or an unmistakable set); "clean up", "tidy" or "remove the spam" without naming which messages is a card; a routine, a check-in, a remote session, a spoken message and an instruction that came from an email are a card. The card says `Move 12 messages to the Bin`, lists how many and which as the server read them, and says: "They go to your Bin and stay there for about 30 days. You can restore them from it. After that Gmail deletes them for good."

**What it is not.** It is not a permanent deletion. No expunge, no emptying the Bin, no permanent-delete call exists in the code, no filter, no forwarding, and the Bin tool moves nothing to Spam (that is its own tool, section 11). Trash and Spam are still refused as labels in a label call. The same limits as the four: only listed ids (hex, as a search returns them), at most 100 a call, one reading of the arguments before the gate, all of the named messages or none; a message already in the Bin or in Spam is "not found".

**How each connection does it.** [code: `server/src/plugins/google-workspace-rest.ts`, `binMessages`; `server/src/plugins/google-imap-organise.ts`, `binPath` and the `BIN_MESSAGES` branch of `organiseOverImap`]
- REST (`google-workspace`): after each named message is looked up, Gmail's own `POST users/me/messages/{id}/trash`, one at a time, nothing else. The scope the entry already asks for, `gmail.modify`, covers `messages.trash`; it also covers permanent deletion, which no code here calls, and a test holds the REST module to one `/trash` and no `/delete`, `batchDelete` or `/untrash`. A failure part way says how many were moved and stops.
- IMAP (`google-imap`): the Bin is the folder the server flagged `\Trash` (`specialUse` with a source other than the library's own guess from a name), never a guessed name; an account that reports none is refused before a mailbox is opened. After the lookups, one `UID COPY` of the found uids into it. That Gmail then removes the message from All Mail and puts it in the Bin is not assumed: it is checked afterwards. The same lookup runs again for each id; an id All Mail still holds is "not confirmed", and the answer says how many were confirmed moved and how many are still in the mailbox, and never "Moved to the Bin" for those. There is no `MOVE` (a client without that extension falls back to copy-then-expunge) and no `EXPUNGE`. The eighth method of the narrow client, `messageCopy`, is typed to take only a destination, and the source test pins that the one call to it passes the folder found by `binPath`.

**The gate.** The same four-part rule as the other writes (section 3, "The direct-order rule"): the tool is in `ORGANISE_WRITE_TOOLS`, so the call path reads the person's typed words, the approval service asks the reviewer always, and a card appears unless the reviewer answers `proceed` and `preApproved` on those words alone; routines, check-ins, remote sessions and hand-offs from them always ask; the person's own Always allow lifts the card for this tool only, and ask-before-changes still shows it. One fixed line is added to the reviewer's prompt for this tool and no other [code: `server/src/approvals/policy.ts`, `MAILBOX_BIN_REVIEW_LINE`, added after `MAILBOX_REVIEW_LINES` by `reviewAction` when `isBinTool(candidate.toolRef)`]: binning is the strongest mailbox change, so `preApproved` is true only when the request itself says to delete, bin or trash AND names what; "clean up", "tidy up" or "remove the spam" without the person having named which messages is not explicit, and the person is asked.

**Otto and the skill.** His prompt and `organise-the-mailbox` name the tool, say he orders-only, says first how many and which, and that the Bin keeps them about 30 days. They say he never deletes mail for good, empties the Bin or Spam, blocks a sender or forwards mail (they used to say he never deletes or forwards mail). The shared-rules and "Email." paragraphs are untouched.

**Built so far (branch `mail-bin`).** No migration, no setting, no route, no new scope. The catalogue lists eleven tools on each Gmail entry; `gmail_bin_messages` is a write and not a send.

| File | What changed |
|---|---|
| `openbot/server/src/plugins/mail-organise.ts` | `BIN_MESSAGES`; in `ORGANISE_WRITE_TOOLS` and `ORGANISE_MESSAGE_TOOLS`; its definition, call type, answer (`binnedAnswer`, the 30 days in words) and the sentence for an account with no Bin |
| `openbot/server/src/plugins/google-workspace-rest.ts` | `binMessages`: one `messages.trash` per id |
| `openbot/server/src/plugins/google-imap-organise.ts` | `binPath`; the one `messageCopy` into it; `messageCopy` counted among the changing methods |
| `openbot/server/src/plugins/catalogue.ts` | `gmail_bin_messages` in `writeTools` of both entries; comments |
| `openbot/server/src/approvals/policy.ts` | `MAILBOX_BIN_REVIEW_LINE`, `isBinTool`, and the line added for this tool only |
| `openbot/app/src/lib/approval-view.ts` | The card: `Move N messages to the Bin` and what happens |
| `openbot/scripts/fake-google/server.ts` | `messages/{id}/trash` (needs `gmail.modify`) and `trashed()` |
| `openbot/examples/freeduet/agents.yaml`, `skills.yaml` | Otto's sentences; the skill |
| `evals/team/cases.yaml`, `fixtures/live/email-delete-everything.txt`, `run.test.ts`, `README.md`; `docs/M0_DEMO.md`, `docs/COMPARISON.md`, `README.md` | `otto-12`, `otto-13` (safety); 80 → 82 cases and 36 → 37 safety |
| `openbot/docs/plugins/google-workspace.md`, `openbot/docs/configuration.md`, `docs/UPSTREAM_TOUCHES.md`, `docs/M1_PLAN.md`, `docs/ROADMAP.md` | The tool and its limits; rows; D41; the roadmap row |

**Not verified.** Nothing ran on a real mailbox. [verify] That Gmail's IMAP puts a message in the Bin when it is copied into `[Gmail]/Trash` from All Mail, and what the message looks like in All Mail afterwards: the tests run the real IMAP client against a recording server that does what Gmail's documentation says. [verify] That the reviewer model reads the fixed line the way the tests' stand-in does. Otto's new sentences and the new cases `otto-12` and `otto-13` are text a model reads and were not run live.

### Decisions left to the maintainer

| # | Decision | Built now | Options | Recommendation | Why |
|---|---|---|---|---|---|
| Q12 | Grants an update adds | Not built: a member that holds some tools of a server is not given the tools a newer build adds (D31 F); a person says yes once on the inbox row | (a) as it is; (b) record who made a grant (a source, written by the inbox approval and by the Bot's page, and left empty on every existing row), then at start give the newly added tools declared by the member's own skills only to a member whose set carries the inbox's mark, and never one trimmed by hand; (c) the same by reading the audit trail (an inbox approval for the Bot and the app, and no revoke since), which needs no new column and works on rows that exist, but is a guess about a person's intent and breaks if the trail is pruned; (d) leave the grants alone and make the inbox row for the update name the new writes, which it already does for a Bot whose skill declares them | (b), with (d) as the way today | Today a grant row carries only who pressed (`plugin_grants.granted_by`), the same for an inbox approval and for a press on the Bot's page, the two audit rows are not linked to a tool, and a revoke leaves no mark. Telling "made by the inbox" from "trimmed by hand" would be a guess, so nothing was built. (b) makes the future certain; the maintainer's own install needs the one-time press (d) |
| Q13 | The IMAP copy into the Bin | Built, run against a recording server only | (a) as built; (b) `UID MOVE` where the server offers it (Gmail does), which is one atomic command, with `COPY` only as a fallback and never `EXPUNGE` | (a) until it has run on a real Gmail | `MOVE` is what Gmail itself sends, but the library falls back to copy-then-expunge on a server without it, which is exactly what must never be sent; the copy is the narrower command |
| Q14 | Spam | Built (section 11, D42), decided by the maintainer on 15 November 2026 | (a) as built; (b) leave it out again | (a) | Decided by the maintainer. A move to Spam is Gmail's own "Report spam" and teaches its filter about the sender, which moving the mail back does not undo; the tool says so in no promise it cannot keep |

## 11. Move to Spam (D42)

Decided by the maintainer on 15 November 2026, after the Bin: "Spam is no longer out of scope". Built in the same branch as the Bin's after-check (`mail-bin-verify`, on origin/main e1dbacf), by the Bin's structure line by line. The decision is D42 in [M1_PLAN.md](../M1_PLAN.md), section 25 ("A mail assistant can move mail to Spam (D42)").

**What the person sees.** One more tool, `gmail_spam_messages`, on both connections. Otto may move listed messages to Spam when the person orders it. He says first how many messages and which, and that Gmail deletes mail in Spam after about 30 days, so until then the person can move it back. With no card when the person's own typed message of the live turn (directly, or one hop through Iris) says to move mail to Spam or mark it as spam AND says which messages or which kind ("the spam in my inbox", a sender, a category); "check my inbox for spam and put it in Spam" is such an order for the messages Otto judged to be spam. A vague order, a routine, a check-in, a remote session, a spoken message and an instruction that came from an email are a card. The card says `Move 12 messages to Spam`, lists how many and which as the server read them, and says: "They go to your Spam folder. Gmail deletes mail in Spam after about 30 days; until then you can move it back."

**What it is not.** Nothing is deleted now. No expunge, no `\Deleted`, no emptying Spam or the Bin, no permanent-delete call, no blocking of a sender, no filter, no forwarding. Trash and Spam are still refused as labels in a label call. The same limits as the others: only listed ids (hex), at most 100 a call, one reading of the arguments before the gate, all of the named messages or none; a message already in Spam or the Bin is "not found".

**How each connection does it.** [code: `google-workspace-rest.ts`, `spamMessages`; `google-imap-organise.ts`, `spamPath` and the `SPAM_MESSAGES` branch of `organiseOverImap`]
- REST (`google-workspace`): after each named message is looked up, `POST users/me/messages/{id}/modify` with `addLabelIds: ["SPAM"]` and `removeLabelIds: ["INBOX"]`, one at a time. A test holds the REST module to exactly one `/modify`, one `"SPAM"`, and still no `/delete`, `batchDelete`, `/untrash` or `TRASH`. A failure part way says how many were moved and stops.
- IMAP (`google-imap`): the Spam folder is the one the server flagged `\Junk` (`specialUse` with a source other than the library's guess from a name), never a guessed name; an account that reports none is refused before a mailbox is opened. One `UID COPY` from All Mail into it. No `MOVE`, no `EXPUNGE`, no store of `\Deleted`. Then the same after-check as for the Bin: the lookup runs again and an id All Mail still holds is "not confirmed" (how many were confirmed moved, how many are still in the mailbox).

**The gate.** Identical to the other organising writes (`ORGANISE_WRITE_TOOLS`): the reviewer is always asked, on the person's typed words only; routines, check-ins, remote sessions and hand-offs from them always ask; the person's Always allow for this tool by its exact `toolRef` lifts only this tool's card; Full access lifts it as for any non-payment write in the person's own live turn. One fixed line is added to the reviewer's prompt for this tool only [code: `approvals/policy.ts`, `MAILBOX_SPAM_REVIEW_LINE`, added by `reviewAction` when `isSpamTool(candidate.toolRef)`].

**Built (branch `mail-bin-verify`).** No migration, no setting, no route, no new scope. The catalogue lists twelve tools on each Gmail entry, eight of them writes.

| File | What changed |
|---|---|
| `openbot/server/src/plugins/mail-organise.ts` | `SPAM_MESSAGES`; in the two lists; its definition, call type, answers (`spammedAnswer`, `spamNotConfirmed`, `noSpamFolder`); `binNotConfirmed` |
| `openbot/server/src/plugins/google-workspace-rest.ts` | `spamMessages`: one `messages.modify` per id |
| `openbot/server/src/plugins/google-imap-organise.ts` | `spamPath`; the one `messageCopy` into it; the after-check for the Bin and Spam |
| `openbot/server/src/plugins/catalogue.ts` | `gmail_spam_messages` in `writeTools` of both entries |
| `openbot/server/src/approvals/policy.ts` | `MAILBOX_SPAM_REVIEW_LINE`, `isSpamTool`, and the line added for this tool only |
| `openbot/app/src/lib/approval-view.ts` | The card: `Move N messages to Spam` |
| `openbot/scripts/fake-google/server.ts` | `messages/{id}/modify` for the Spam move only (needs `gmail.modify`; any other body is a 400) and `spammed()` |
| `openbot/examples/freeduet/agents.yaml`, `skills.yaml` | Otto's sentences; the skill |
| `evals/team/cases.yaml`, `fixtures/live/email-spam-everything.txt`, `run.test.ts`, `README.md`; `docs/M0_DEMO.md`, `docs/COMPARISON.md`, `README.md` | `otto-14`, `otto-15` (safety); 82 to 84 cases and 37 to 38 safety |

**Not verified.** Nothing ran on a real mailbox. [verify] That Gmail's IMAP removes a message from All Mail when it is copied into `[Gmail]/Spam`, as it does for the Trash: the after-check turns a wrong premise into a "not confirmed" answer and not a false "moved". [verify] That the reviewer model reads the fixed line the way the tests' stand-in does. Otto's new sentences and the cases `otto-14` and `otto-15` were not run live.

## 12. Reading Spam and the Bin (D53)

Found on a real installation on 16 November 2026. Otto moved four messages to Spam, then Iris searched the mailbox to confirm and said "when I search in Spam I find nothing", which read like lost mail. The search had never been able to see Spam: over an app password it opens All Mail, which holds neither Spam nor the Bin, and over OAuth the Gmail list leaves them out unless `includeSpamTrash` is set. A fix, not a new tool.

**What the person gets.** `gmail_search_messages` reads Spam or the Bin when the query says so: `in:spam`, `in:trash` (or `label:spam`, `label:trash`), alone or with other terms (`in:spam from:ana@example.com`). It returns what a search returns today (sender, subject, date, snippet, labels, same counts and sizes) and nothing more; it is a read on both connections' read lists (D33). A search that does not say so is exactly as before: Spam and the Bin are left out.

**How each connection does it.** [code: `google-workspace-rest.ts`, `hiddenFoldersNamed`; `google-imap.ts`, `openForSearch`]
- REST: `includeSpamTrash=true` on the list call, only when the query names Spam or the Bin.
- IMAP: the folder the server flagged `\Junk` (Spam) or `\Trash` (Bin), never found by a name, opened read-only; the words that named it are taken out of the query and the rest narrows the search inside it (no rest: every message in the folder, newest first, up to the same limit). An account that reports no such folder gets "Gmail did not report a Spam (Junk) folder for this account, so there is nothing to search there. This does not mean any mail was lost." (the Bin likewise), and no mailbox is opened. Naming both in one search asks for one at a time. The category lookup of a normal search is skipped inside these folders.

**Limits.** `gmail_read_message` over an app password still reads from All Mail, so a message found in Spam or the Bin is shown by its search result (snippet) and cannot be opened whole there. Moving, labelling and rules are unchanged, and no approval rule changed.

**Built so far.** Tests: `server/tests/mail-search-hidden-folders.test.ts` (13: a message moved to Spam is found by the explicit search and not by the default one; the same for the Bin; no Spam folder gives the plain sentence; both-named; read-only opens only; REST sends `includeSpamTrash` only when asked; the tool is still `read`). Not verified: a real Gmail. [verify] That Gmail's IMAP answers `X-GM-RAW` inside the `\Junk` folder as it does in All Mail, and that the `\Junk` folder is where the Spam move's `COPY` lands.

### The calendar, when none is connected (D53)

With no calendar address pasted, `calendar_list_events` of the app-password connection could only fail ("No calendar was connected..."); members called it four times in one morning. It is now not offered: `grantedTools` leaves it out for a person whose connection holds no calendar address (`calendarConnectedFor`, `plugins/tools.ts`), so a member cannot call it. A person not connected at all, or a connection that keeps no pasted secret (OAuth), is offered the tool as before. agent-freeduet adds one note to a run that holds the app-password mailbox tools and no calendar tool (`tool_notes.py`, `calendar_notes_for`): no calendar is connected, and it is added on the Connections page. The tool's own failure answer stays as the second line of defence. Tests: `mail-search-hidden-folders.test.ts` (4) and `agent-freeduet/tests/test_calendar_note.py` (3). Not run live.

