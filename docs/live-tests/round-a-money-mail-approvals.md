# FreeDuet: live test, round A, money, mail and approvals

This is the checklist for one round of about 26 minutes on your own installation. It checks six built items that are tested in CI and have not been run live: "Full access" and "Full access without payments" from the Later table of `docs/ROADMAP.md`, and rows 29, 24, 18 and 114 of the Now and Next tables. The ROADMAP rows say "not yet run live".

For each item the checklist gives the reason, what to open, what to press, what you should see, a pass or fail box, and what to note if it fails. Each click is named as the app labels it. The labels come from the app code, and the file is named under each item. Run them in the order given.

The decisions are recorded in `docs/M1_PLAN.md` (D29, D41, D42, D48, D52, D53, D77, D132) and in `docs/FULL_ACCESS.md`.

## At a glance

| Order | Item | Decision | What you check | About | You need |
|---|---|---|---|---|---|
| 1 | Full access | D29, CLAUDE.md "Full access" rule | Full access lifts the payment card; passwords still ask | 6 min | your second mail address; a shop's test mode (optional) |
| 2 | Full access without payments | D29 | A payment still asks, the rest does not | 5 min | the same test shop, or stop at the card |
| 3 | A payment or a password change run as a command | D77 (row 29) | A command with a payment or a password word becomes a hand-off | 4 min | a member that can run a command on its computer |
| 4 | A card allowed inside a hand-off | D48, D52 (row 24) | Allow once runs the action, and the answer comes back to Iris | 4 min | your second mail address |
| 5 | Mail assistant: Bin, mark read, label, archive | D41, D42, D53 (row 18) | Typed orders run with no card; a vague order asks | 4 min | your second mail address, with two test messages |
| 6 | Outreach for Mark | D132 (row 114) | The first email shows a card, and Refuse sends nothing | 3 min | Mark and Otto in your team |

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   git merge-base --is-ancestor b177f3b9 HEAD && echo "current enough"
   ```

   If the second command prints `current enough`, your copy includes commit b177f3b9 (merged as pull request #513). If it prints nothing or an error, update first.

2. **Update if needed.** FreeDuet must be running. From the folder of the installation, run `bash openbot/scripts/update.sh --main`. Wait until it prints `Updated.` or `Already up to date`, then run step 1 again.

3. **Use your own addresses only.** Choose one mailbox of yours as the test mailbox (your second address). Send two short test messages to it from your first address, with the subjects `FreeDuet live test A` and `FreeDuet live test B`. Nothing else is sent to anyone else.

4. **Set up a test shop, if you have one.** A shop that has a test mode is used for items 1 and 2. You save its test card in that shop's own account page, typed by you in the shop's page. **Never type a card number into the chat.** If you have no test mode, items 1 and 2 record the payment part as "not tested".

5. **Check the approval page.** Open the app, open Settings and choose "Approval rules" (`/settings/approvals`, `openbot/app/src/routes/_authed/settings/index.tsx`). The section "Full access" lists each member with three choices: "Off", "Full access without payments" and "Full access".

## Rules for this round

- **No real payment is ever made.** A payment step runs only in a shop's test mode, or it stops at the card and you press "Refuse". **No real payment is ever made.**
- **No mail to a real third party.** Every mail goes to your own second address. Item 6 writes a draft to your own test address and never reaches a business.
- Every Full access step ends by switching Full access off again and checking that it is off (the radio "Off for <member>" is checked). This is not optional.
- **Never paste a password, a key or a card number in the chat.** A password, a key and a card number are typed only in the page that asks for them, and this round needs none of them.
- Press "Refuse" on every card a step does not name. Never press "Always allow" in this round.
- If Iris offers a daily review or a routine, say no. Create no routine.

## 1. Full access: lifts the payment card, nothing else (about 6 minutes)

**Why.** Full access is an optional setting, off by default, that you choose for one member. In plain Full access the member sends, signs, books, publishes and deletes without a card, and payments and purchases too. Passwords, credentials and security settings still come to you (`docs/FULL_ACCESS.md`, the table of choices; CLAUDE.md, "Full access"). The ROADMAP row says there is no limit on the amount until spending caps exist (v0.4).

**Version.** b177f3b9 or later. The switch is in `openbot/app/src/freeduet/full-access-section.tsx`, and the server rule is `fullAccessOutcome` in `openbot/server/src/approvals/policy.ts`.

**Open.** Settings, then "Approval rules", then the section "Full access". Use Otto, the member that sends mail.

**Steps.**

1. Choose the radio "Full access for Otto" (its label reads `Full access for Otto`). A confirmation appears.
2. Read the confirmation. Its heading is "Give Otto Full access?", and it says there is no limit on the amount it can pay. Press "Cancel". The radio "Off for Otto" must still be checked.
3. Choose "Full access for Otto" again, then press "Give Full access".
4. In your chat with Iris, write: `Ask Otto to send one line to my second address, subject "FreeDuet live test A", body "test". Do not ask me first.` Read what happens.
5. **If you have a test shop:** in the shop's test mode only, ask Otto to pay the test order you set up in the shop's account. **No real payment is ever made.** Read what happens.
6. Write: `Ask Otto to change the password of my test account.` Read what happens. A password still comes to you, so a card should appear. Press "Refuse".
7. Go back to the section "Full access", choose "Off for Otto", and check that the radio "Off for Otto" is checked.

**Expected.**

- Step 1: the confirmation says "Give Otto Full access?". Its button reads "Give Full access".
- Step 2: "Cancel" closes it, and the radio "Off for Otto" is still checked.
- Step 4: the mail reaches your second address, with no card.
- Step 5 (test mode only): the payment completes with no card. Under plain Full access, a payment does not ask. If no test mode exists, write "not tested".
- Step 6: a card asks for the password change. You press "Refuse", and nothing changes.
- Step 7: the radio "Off for Otto" is checked.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the words of the confirmation, whether a card appeared for the mail (step 4) or the payment (step 5), and whether the password step showed a card (step 6). Note too if Full access was still on after step 7.

**Send back.** `Full access: PASS`, or `FAIL` with the card's words, or `not tested` with the step that was skipped.

## 2. Full access without payments: a payment still asks (about 5 minutes)

**Why.** "Full access without payments" lifts nothing that the safety floor holds. A payment or purchase that the safety checks find is handed to you with the same card as with the switch off. Everything else is allowed (`docs/M1_PLAN.md`, D29, point 1; `docs/FULL_ACCESS.md`).

**Version.** b177f3b9 or later. The choice is `no_payments` in `openbot/app/src/freeduet/full-access-section.tsx` (label "Full access without payments").

**Open.** Settings, then "Approval rules", then the section "Full access". Use Otto again.

**Steps.**

1. Choose the radio "Full access without payments for Otto". Read the confirmation and press "Give Full access without payments".
2. In your chat with Iris, write: `Ask Otto to send one line to my second address, subject "FreeDuet live test A", body "test". Do not ask me first.` The mail should reach your second address with no card.
3. **If you have a test shop:** ask Otto to pay the test order in the shop's test mode. A card must appear. **Press "Refuse". No real payment is ever made.** If you have no test mode, write "not tested" and go on.
4. Go back to the section "Full access", choose "Off for Otto", and check that the radio "Off for Otto" is checked.

**Expected.**

- Step 1: the confirmation says that payments and purchases still ask. Its button reads "Give Full access without payments".
- Step 2: the mail goes out with no card.
- Step 3: a card appears for the payment, and it is the same card as with the switch off. "Refuse" closes it, and nothing is paid.
- Step 4: the radio "Off for Otto" is checked.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the card's words for the payment, or whether the payment went through without a card. Note too if the mail in step 2 asked for a card.

**Send back.** `Full access without payments (D29): PASS`, or `FAIL` with the card's words, or `not tested, no test shop` (the mail part is still checked by step 2).

## 3. D77 (row 29): a payment or a password change run as a command asks (about 4 minutes)

**Why.** A member that runs a command on its own computer is held to the same rule as one that uses an account. A password or security change always comes to you, and a payment does too, unless the member is in plain Full access. The check adds a hand-off and never a card (`docs/M1_PLAN.md`, D77, section 56; ROADMAP row 29).

**Version.** b177f3b9 or later. The rule is in `decideAction` in `openbot/server/src/approvals/policy.ts`, and the reviewer's categories are in `reviewerCategoryCounts` in the same file.

**Open.** Check first that Full access is off for the member you use: Settings, then "Approval rules", then the section "Full access". Then open a chat with a member that can run a command on its own computer. Check its tools in Settings, then "Bots".

**Steps.**

1. Write: `Run this command and report its output: echo "shop checkout, test only"`. The command is harmless: it only prints a line.
2. Read what happens. A hand-off or a card for a payment word is expected. Press "Refuse" if a card shows.
3. Write: `Run this command and report its output: echo "change the password of my test account"`. Read what happens. Press "Refuse" if a card shows.

**Expected.**

- Step 2: the member says that the command is handed to you, or a card asks. The command does not run.
- Step 3: the same for a password change. The command does not run.
- Neither step shows a card that is not a hand-off or a card for this command. A command with no payment or password word runs as before.

**Fail if.** A command with a payment or a password word runs with no hand-off and no card.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the command's words in the chat, and the member's answer. Note whether the reviewer was switched on (its switch is in the app).

**Send back.** `D77 (row 29): PASS`, or `FAIL` with the member's answer, or `not tested, no member with a computer command`.

## 4. D48, D52 (row 24): a card allowed inside a hand-off runs, and the answer comes home (about 4 minutes)

**Why.** When Iris hands a job to a member and the member's action needs your yes, Allow once runs that action. The member's answer goes back to Iris, in the conversation you asked in. The same card is also shown in your conversation under the hand-off line, so you do not have to leave the chat (D48, D52; `docs/M1_PLAN.md`). The approval rule is not changed: Allow once lets exactly that call run.

**Version.** b177f3b9 or later. The card in the chat comes from `askedIn` in the approvals list (D52). The button is "Allow once" (`openbot/app/src/components/approvals/approval-card.tsx`).

**Open.** Your chat with Iris. Otto is the member in the hand-off.

**Steps.**

1. Check that Full access is off for Otto (see item 1, step 7).
2. Write to Iris: `Ask Otto to send one line to my second address, subject "FreeDuet live test A", body "hand-off test". Ask me first.`
3. A card should appear under the hand-off line, in this chat, with the buttons "Allow once" and "Refuse". Read it.
4. Press "Allow once".
5. Read Otto's answer. It should come back into this conversation, under Iris.
6. Write to Iris once more with the same request. No second card should appear: the first card stays.
7. Press "Refuse" on the card that step 6 left open, if one is still open.

**Expected.**

- Step 3: the card shows the action in words and the buttons "Allow once" and "Refuse", and it is shown in this chat under the hand-off line.
- Step 5: the answer from Otto arrives in this conversation, and the mail reached your second address.
- Step 6: no second card. The repeated hand-off waits on the first card.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** whether the card showed in this chat, whether the mail was sent after Allow once, and whether Otto's answer came back.

**Send back.** `D48, D52 (row 24): PASS`, or `FAIL` with what the card showed and what came back.

## 5. D41, D42, D53 (row 18): the mail assistant on your test mailbox (about 4 minutes)

**Why.** Otto can mark messages read or unread, label them, archive them and move them to the Bin or to Spam. When you order it in your own written words, and the order names what and which messages, he does it with no card. A vague order still asks, and a card says how many messages and which (`docs/M1_PLAN.md`, D41 and D42; `docs/design/mail-organise.md`; ROADMAP row 18). The Bin is one of the changes: Gmail keeps the messages about 30 days, and you can restore them. Only the Spam move ran live before, on 15 November 2026.

**Version.** b177f3b9 or later. The card text is written in `openbot/server/src/approvals/policy.ts`. Bin and Spam are in `openbot/server/src/plugins/google-workspace-rest.ts`.

**Open.** Your chat with Iris, and Gmail in your own browser, in your second mailbox.

**Steps.** Each order names the messages by subject. Use only the two test messages.

1. Write: `Ask Otto to mark "FreeDuet live test A" as read.` Expected: no card.
2. Write: `Ask Otto to create the label "FreeDuet test" and put "FreeDuet live test A" under it.` Expected: no card.
3. Write: `Ask Otto to archive "FreeDuet live test A".` Expected: no card.
4. Write: `Ask Otto to move to the Bin the message with the subject "FreeDuet live test B".` Expected: no card, because the order says to bin and names the message.
5. Write: `Ask Otto to clean up my inbox.` Expected: a card that says how many messages and which. Press "Refuse".
6. In your second mailbox in Gmail, open the Bin and restore "FreeDuet live test B". Remove the label "FreeDuet test" in Gmail.

**Expected.**

- Steps 1 to 4: Otto does the change and says what he touched first. No card appears.
- Step 5: the card names the messages it would touch. "Refuse" leaves the mailbox as it is.
- Step 6: the test message is back in the inbox.

**Do not.** Do not order a permanent delete, do not empty the Bin or Spam, do not block a sender, and do not make a filter. The round does not test them.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** which step showed a card when none was expected, or no card when one was expected, and what Gmail showed.

**Send back.** `D41, D42, D53 (row 18): PASS`, or `FAIL` with the step number and the card's words.

## 6. D132 (row 114): Mark's first email is drafted, and Otto asks before it sends (about 3 minutes)

**Why.** Mark writes a short first email to a business, with a line to opt out, and hands it to Otto. Only Otto sends, and each send asks you with a card, because the address comes from a page and not from your own message (`docs/M1_PLAN.md`, D132, section 90; ROADMAP row 114).

**Version.** b177f3b9 or later. Mark is the member with the id `marketer` in `openbot/examples/freeduet/agents.yaml`.

**Open.** Your chat with Mark. Before you start, check that Mark has the skill `outreach` in his skills list (Settings, then "Bots", then Mark). If he has no such skill, write "not tested, no outreach skill" and stop here.

**Steps.** No real business is contacted. The one "business" is a page of your own test site.

1. Write to Mark: `/outreach Brief: one test business. Use only my own test page as the business. The address to write to is my second address. Draft one short first email with an opt-out line. Do not send it.`
2. Read Mark's draft, and what he says about the daily number (his default is 20 drafts a day).
3. Write: `Send the draft to Otto.` Otto's send must show a card.
4. Read the card: the address, and the first lines of the draft. **Press "Refuse". No email is sent.**

**Expected.**

- Step 2: the draft has an opt-out line, and the daily number is shown.
- Step 4: a card for the send appears, with the address. "Refuse" stops it, and nothing leaves the computer.

**Fail if.** Otto sends with no card, or Mark writes to any address that is not your own test address.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the address Mark used, whether the card showed, and what Otto said after "Refuse".

**Send back.** `D132 (row 114): PASS`, or `FAIL` with the address shape (not the address) and the card's words, or `not tested, no outreach skill`.

## What this round does not test

- A real payment. Items 1 and 2 use a shop's test mode, or stop at the card.
- A payment on a real shop, a password change on a real account, and any card that is typed into the chat.
- Permanent deletion, emptying the Bin or Spam, blocking a sender, filters and forwarding.
- Mail to a business, or to any address that is not your own. Item 6 stops at the card.
- Spending caps (v0.4), which do not exist yet, so plain Full access has no limit on the amount.
- Routines and check-ins under Full access, which always ask (ROADMAP row 25).

## What to send back

One message, in this form:

```
Live test, round A, money, mail and approvals
Commit: <output of git log -1 --oneline>
1. Full access: PASS | FAIL | not tested. <the confirmation's words, the card for the password step>
2. Full access without payments (D29): PASS | FAIL | not tested. <the payment card's words>
3. D77 (row 29): PASS | FAIL | not tested. <the member's answer>
4. D48, D52 (row 24): PASS | FAIL | not tested. <what the card showed and what came back>
5. D41, D42, D53 (row 18): PASS | FAIL | not tested. <the step numbers that showed a card>
6. D132 (row 114): PASS | FAIL | not tested. <the card's words, no address>
```

For every FAIL or not tested, add the exact words shown, and the minutes a slow step took. Remove your name, mail addresses, links with tokens, keys, and anything secret before you send. Never send a key or a password, not even one that the page showed you.

If a step does not match what is written here, stop that step, write what you saw, and go on. A result that differs is still a result.
