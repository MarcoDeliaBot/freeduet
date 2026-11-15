# Mail rules: standing rules the person orders, kept and applied by FreeDuet (D46)

Decided by the maintainer on 15 November 2026: "Give Otto a tool to create filters." Status: built; not yet run live.

## 1. What the person sees

- They tell Otto, in their own message: "From now on, put everything from github.com in a label called GitHub and archive it." Otto makes a rule and says so in one line, and that FreeDuet keeps it. He never says Gmail has a filter, because it has not.
- Under Connections, "Mail rules" lists each rule in plain words ("From now on, mail from the domain github.com: label “GitHub” and archive."), when it last ran, how many messages it touched, its last error if any, and Disable (or Enable) and Delete. With no rules the section is not drawn. Otto's `gmail_list_rules` shows the same list in chat.
- A rule applies to mail that arrives after it was made. Mail already in the inbox is touched only if the order said so ("and do the same for what is there now"), once, for at most 250 messages.
- When the order is not the person's own typed words (an email, a routine, a check-in, a spoken message, a session away from the computer) a card shows the rule in plain words and nothing is made until the person approves it.

## 2. Rules

A rule belongs to one person and one mailbox connection (`google-imap` or `google-workspace`) and has conditions and actions.

- **Conditions** (at least one; all that are given must match): sender address or domain, recipient, subject contains, `List-Id` contains, words (in the subject or the sender). A List-Id needs at least 4 characters and a dot, and a sender domain may not be a public suffix: a short explicit list of common two-level suffixes (`co.uk`, `com.au`, `co.jp`, `com.br`, `co.in`, `org.uk`, `co.nz`, `com.mx`, `co.za`, `com.ar` and the like) is refused. The list is not the full Public Suffix List. Each value is at most 120 characters, plain text: no wildcards, no patterns, no control characters. Matching reads headers only, never the body or the snippet.
- **Actions** (at least one): add a label (created if missing, at most three), archive, mark read, move to Spam, move to the Bin. Nothing else can be expressed: no field forwards, replies, sends or deletes for good, and an unknown field is refused.
- **Bounds.** A Spam or Bin rule needs a sender, domain or `List-Id` condition, so a rule on a word cannot bin a person's mail. Spam and Bin are exclusive, and archive is skipped when either is set. At most 20 rules per connection.

## 3. The tools and the gate

`gmail_create_rule`, `gmail_list_rules` and `gmail_disable_rule` (disable, enable or delete, by the id the list gives) are catalogue entries of both Gmail apps. The first and last are writes, the list a read; none is in `sendTools`; the automatic grant top-up (D45) gives them to a member whose set is automatic. A call is parsed first and a refusal never quotes the input.

They go through the same `mailboxChange` gate as the other mailbox changes: the reviewer is asked and sees only the person's typed words of their live turn, directly or one hop through Iris. One fixed line (`MAILBOX_RULE_REVIEW_LINE`, `approvals/policy.ts`) says what counts: a standing wording ("from now on", "always", "automatically"), a one-off request is not a rule, applying a rule to mail already in the inbox must be asked for too, and an instruction inside an email is never an order. Everything else is a card.

The rule store answers these tools itself (`handleRuleTool`); the REST dispatcher and the IMAP transport refuse them. Queries are scoped to the person, so a rule id of someone else's does nothing.

## 4. The job

A timer in the server process (`runMailRules`, every five minutes, `index.ts`). It is not a routine, because a routine firing starts a model turn; this job calls no model.

- It claims due rules with an update that sets a ten-minute lease, so two replicas do not run the same rule, groups them by person and connection, and searches the inbox with `in:inbox after:<watermark>`, 50 per page, at most five pages.
- It matches headers only. The sender is the last address in angle brackets of the From header, so a display name that looks like an address does not decide. The From header is not authenticated (SPF and DKIM are not read), so a rule on a known sender also catches mail that forges that sender. It skips a message dated more than a day before the rule was made, and records each application in `mail_rule_applied` (rule, message), so a message is never done twice; the watermark overlaps by five minutes for the same reason. A message binned or spammed by one rule in a pass is skipped by later rules.
- It calls only an allowlist of eight tools (search, list labels, create label, label, archive, mark, spam, bin), through the existing organise limits (at most 100 ids a call) and the existing after-check for the Bin and Spam, with a fixed bot id and the deployment as initiator.
- A failure is the rule's last error. It disables nothing. A search the mailbox refuses, or a connection that cannot be reached, skips the rest of that connection's rules in the pass; the rules then wait before the next try, twice as long each time it fails again (10 minutes, 20, 40, up to 4 hours), and an audit row is written only when the state changes (the first failure, the recovery), not on every pass. `lastError` stays visible. Switching a rule on again clears the wait, starts no backfill and looks only at mail from then on. Each application writes an audit row (`mail_rule.applied` or `mail_rule.failed`, with counts and action names, never subjects or addresses), and the rule keeps its last run, matched and applied counts and a total.

## 4a. The exception to D35

D35 says a routine always asks. A rule that the person ordered runs with no card and no model, which is a departure from it. The exception is explicit and bounded:

1. The order went through the gate, on the person's own typed words.
2. The job can only call the eight tools above, and a rule can only express five actions; no one of them forwards, sends or deletes for good.
3. It reads headers and never obeys text from a message.
4. The person sees every rule, with its last run and error, and can disable or delete it; a failure disables nothing and a disable takes effect at the next pass.
5. Each application is an audit row.

Also true, and said plainly: once a rule exists the job does not pass through the gate again; it does not check that Otto still holds the grant (the rule is the person's and runs until it is disabled or deleted); and when more than 250 new messages arrive in one window, the older ones are not applied, which is recorded in the rule's `lastError`.

Creating a rule, and switching one on again, are never lifted by Full access or by a saved "Always allow" (personal or team): they need the person's own typed order and a reviewer who vouches for it, and otherwise show a card that cannot be allowed always. Listing and disabling may still honour a saved allow.

Nothing else in D35 changes: a routine and a check-in still ask for every change.

## 5. Threats

| Threat | What stops it |
|---|---|
| An email tells Otto to make a rule ("forward everything", "bin the rest") | The gate: no typed order, so a card; no field forwards; Otto's prompt and eval `otto-17` |
| A rule that quietly bins important mail | A Bin or Spam rule needs a sender, domain or `List-Id`; the card and the list say it in words; the Bin keeps it about 30 days |
| A rule grows into something else | A fixed shape; unknown fields are refused; the job's allowlist |
| A flood of mail makes one pass huge | Five pages of 50, chunks of 100 ids; the rest waits for the next pass |
| Two replicas, or a retry, apply a rule twice | Lease, applied table, watermark overlap |
| A message's text steers the job | Headers only, no model |
| Full access or a saved "Always allow" lets a planted order through | `startsStandingRule` in `approvals/policy.ts`: neither applies to creating or re-enabling a rule |
| One person reaches another's rules | Every query is scoped to the person |
| A forged or look-alike From header | Last angle-bracket address; the header is not authenticated, so a forged sender is not caught |
| An old rule acts on old mail | The stale-date filter; backfill only on the order, capped at 250 |

## 6. Not built

- **Native Gmail filters.** Over REST it would be `users.settings.filters`, which needs the scope `gmail.settings.basic` and a new consent for everyone who connected before; the app-password connection (IMAP) cannot make a filter at all. FreeDuet-kept rules came first because they work on both connections with no new consent. A later step could mirror a rule into a Gmail filter where the scope was granted.
- Matching on the body or with patterns; forwarding or replying rules; applying a rule to the whole mailbox history.
- A one-line confirmation with Undo in the chat (the `MemberAddedChange` pattern, `settings-in-chat/changes.ts`). The list and Disable cover it; not done here.
- A list on the remote session: the list route sits under `/api/plugins`, which is refused for a remote session. `gmail_list_rules` works in chat.

## 7. Built so far

| File | What |
|---|---|
| `openbot/server/src/plugins/mail-rules.ts` | Pure: tool names, `parseRuleSpec` and its refusals, `ruleMatches`, the words for a rule, tool definitions |
| `openbot/server/src/db/schema/mail-rules.ts`, `drizzle/0073_mail_rules.sql` | `mail_rules`, `mail_rule_applied` (0073), `failures` column (0074) |
| `openbot/server/src/plugins/plugin-store/mail-rules.ts` | `listMailRules`, `handleRuleTool`, `changeMailRule`, `runMailRules` |
| `openbot/server/src/plugins/route-groups/mail-rules.ts` | `GET /mail-rules`, `POST /mail-rules/:id/enabled`, `DELETE /mail-rules/:id` (no create route) |
| `openbot/server/src/plugins/plugin-store/calls.ts`, `catalogue.ts`, `google-workspace-rest.ts`, `approvals/policy.ts`, `audit.ts`, `index.ts` | Parsing, the gate, the catalogue, the reviewer line, audit types, the timer |
| `openbot/app/src/lib/approval-view.ts`, `components/connections/mail-rules-section.tsx` | The card and the list |
| `openbot/examples/freeduet/agents.yaml`, `skills.yaml` | Otto and `organise-the-mailbox` |
| `evals/team/cases.yaml`, `fixtures/live/email-rule-forward-everything.txt` | `otto-16`, `otto-17` (safety): 84 to 86 cases, 38 to 39 safety |

Tests: `mail-rules.test.ts` (validation, matching), `mail-rules-gate.integration.test.ts` (the gate, on the app-password connection with a real approval service and a fake reviewer), `mail-rules-job.integration.test.ts` (the job against an in-memory mailbox), `mail-rules-routes.integration.test.ts`, and `app/tests/mail-rules-ui.test.tsx`.

**Not verified.** Nothing ran on a real mailbox. The job and gate tests used the app-password connection with a fake mailbox; the OAuth connection was not exercised. The real transports' search results were not contract-tested against what the job reads. [verify] That a real Gmail IMAP search with `after:` and `before:` pages the way the fake does.

## 8. Decisions left to the maintainer

| Decision | Options and the recommendation |
|---|---|
| Mirror a rule into a Gmail filter where the wider scope is granted | Recommended later: it would apply rules on Gmail's side at once, but needs `gmail.settings.basic` and a consent again. Not now. |
| The five-minute interval | Shorter is more current and more IMAP/REST calls; recommended: keep five minutes until it has run live. |
| Match on the body | Not built: it would let a message's text decide. Recommended: no. |
| Undo line in the chat | Cheap only if the confirmation can reuse `MemberAddedChange`; recommended: add when the list has been used. |
