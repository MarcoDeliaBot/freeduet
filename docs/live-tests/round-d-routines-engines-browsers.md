# FreeDuet: live test, round D, routines, engines and browsers

This is the checklist for one round of about 22 minutes on your own installation. It checks six items that are built and tested in CI and not yet run live, from the Now and Next tables of `docs/ROADMAP.md` (rows 25, 10, 7, 124, 92 and 94), and one optional section on pairing (row 32). The ROADMAP rows say "not yet run live"; this round is the first live run of each.

For each item the checklist gives the reason, the version you need, what to open, what to click, what you should see, a pass or fail box, and what to note if it fails. Each click is named as the app labels it. The labels come from the app code, and the file is named under each item. Run them in the order given.

The decisions are recorded in `docs/M1_PLAN.md`, in the sections named below. This round runs `main` at commit c9218d48 or a later commit.

## At a glance

| Order | Item | Decision | What you check | About | You need |
|---|---|---|---|---|---|
| 1 | Routines always ask | D35, D6, D46 | A new routine asks a card; Refuse creates nothing; Allow once creates it, then it is deleted | 5 min | Iris in your team |
| 2 | OpenRouter free model as a member engine | D100, D101, D107 | The OpenRouter card, its free-only rule and its warnings; the switch stays off | 3 min | an OpenRouter key is optional |
| 3 | Connect and Message buttons | D129 | The Message button on a Bot row; the Connect button on an app with one consent screen | 2 min | one Bot; one app that connects with one consent screen |
| 4 | Firefox and WebKit in the members' computer | ROADMAP row 124 | Ada runs the release check and names the browsers it ran | 3 min | Ada in your team; Docker on your computer is optional |
| 5 | Native menus and date fields | D123 (row 92) | A member chooses an option in a native drop-down | 3 min | a public page with a drop-down |
| 6 | Read several pages in one call | D123, D127 (row 94) | A member reads three public pages in one call | 2 min | nothing extra |
| 7 | Pairing checks (optional) | D49, D74 (row 32) | Revoke a phone, the two-minute code, a second phone, an approval from the phone | 5 min | a second phone or browser |

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   git merge-base --is-ancestor c9218d48 HEAD && echo "current enough"
   ```

   If the second command prints `current enough`, your copy includes commit c9218d48 (pull request #516). If it prints nothing or an error, update first.

2. **Update if needed.** FreeDuet must be running. From the folder of the installation, run `bash openbot/scripts/update.sh --main`. The script copies the database and `.env` first, moves the code to the newest `main`, starts FreeDuet again (which rebuilds the images), and checks that the app answers. If the app does not answer, it puts the old version and your data back. Wait until it prints `Updated.` or `Already up to date`, then run step 1 again.

3. **Note your starting state.** Before you begin, write down:
   - which engines are switched on for each member, as the Engines page shows them;
   - whether Full access is on for you, under the person's settings;
   - the list of routines, which should be empty or hold only routines you made before this round.
   Every change in this round is put back to what you wrote here.

4. **Choose a public page for item 5.** Use a page on a public site that has a native drop-down (a select menu) and no form you must send. The maintainer's own site is a good choice. Do not use a page that needs a sign-in.

## Rules for this round

- Create only the routines a step names, and delete each one at the end of its item. Deleting a routine asks a card too, so answer it as the step says.
- Switch on only the engine a step names (OpenRouter in item 2). Switch off again whatever you switched on, and put each member's engine order back to your note.
- Never type a key, a password or a token into the chat. A key is typed only in the app's own form, and only where a step says so.
- Press "Test" only where a step says so. A Test sends one real request to a provider, and the test text is always `Reply with the word ok.`
- Submit no form on any site. A drop-down is changed and nothing is sent. Do not press a button that says Submit, Send, Buy or Pay on a page you visit.
- Connect no app in this round. Read the Connect button and do not press it: it starts an account connection, which is a real account action.
- Send no mail. Make no payment and no purchase. Create no mail rule.
- Browse only harmless public pages: `https://example.com`, `https://www.iana.org/domains/reserved`, and the maintainer's own site. No sign-in, no login wall, no page of a third party's account.
- If Iris offers a daily review, say no. It is not part of this round.

## 1. D35, D6, D46: routines always ask (about 5 minutes)

**Why.** A routine or a trigger that acts on an account asks you with the approval card first, and so does a change to its setup. Full access does not unlock this (D35, `docs/M1_PLAN.md`, section on the routine rule). Round 1 checked the routine step under D81. This item checks the decisions that round 1 did not cover: the card on a change to the routine (D35), the way a card's answer resumes the run as a new run (D6), and the one exception, a standing mail rule, which runs by itself (D46). The rule is built in `openbot/server/src/freeduet/always-ask.ts`, and the card's answers are in `openbot/app/src/components/approvals/approval-card.tsx`.

**Version.** c9218d48 or later.

**Open.** The chat with Iris.

**Steps.**

1. Write to Iris: `Create a routine named Round D test that every day at nine reads https://example.com and says whether it answers. Make no other change.`
2. An approval card appears. Read its title and its text. Press "Refuse". Do not press "Always allow": there is no such choice for a routine.
3. Open Settings, then "Routines". Check that no routine named Round D test is listed.
4. Back in the chat with Iris, write the same message again. When the card appears, press "Allow once".
5. Open "Routines" again. Find Round D test. Open it and read its time and its instruction.
6. Press "Delete" on Round D test. A card appears for the deletion (the routine's setup is changed). Press "Allow once".
7. Check that the list holds no Round D test.
8. Optional, for D46: open the Connections page and find "Mail rules". Read the note that a standing rule runs by itself. Do not create or change a rule (`openbot/app/src/components/connections/mail-rules-section.tsx`).

**Expected.**

- Step 1: a card asks for the routine, and it names a change to the Routines page. It is not an answer in the chat.
- Step 2: Refuse ends the request. Nothing is created (step 3 shows none).
- Step 4: the card appears again and "Allow once" creates the routine.
- Step 5: the routine shows a time of nine in the morning and the instruction you wrote.
- Step 6: the card for the deletion appears, and "Allow once" removes it.
- Step 8: the note says that a standing rule runs without a card, as D46 says. Nothing is created.

**Not tested here.** A routine that acts on an account every day, such as a write to a mailbox. That needs a real account and a run nobody watches, so it is not part of this round. Mark it "not tested" in the report.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the card's words, whether "Always allow" appeared for the routine, whether a refused routine was created anyway, and whether Allow once resumed the request as a fresh answer.

**Send back.** `D35, D6, D46: PASS`, or `FAIL` with the card's words, or `not tested` with the reason.

## 2. D100, D101, D107: OpenRouter's free models as a member engine (about 3 minutes)

**Why.** A member can run on OpenRouter's free models through its Anthropic-format address, so the team keeps working when a plan is used up (D107, `docs/M1_PLAN.md`, the OpenRouter section). The entry is off by default and never first in a chain (D100). A free cloud service may keep what it is sent, so FreeDuet shows a warning before you add it to a member (D101). The guard that refuses any other model is in `openbot/agent-freeduet/freeduet/engines.py`, and the example entry is `openbot/agent-freeduet/engines.example.yaml`.

**Version.** c9218d48 or later.

**Open.** Settings, then "Engines", then "Add an engine", then the OpenRouter card.

**Steps.**

1. Read the OpenRouter card: its name, its line "Only models that cost nothing: an id ending in :free, or openrouter/free." and its suggested model `openrouter/free` (`openbot/app/src/freeduet/engines-providers-text.ts`).
2. Open the model field. Read the choice "openrouter/free (OpenRouter picks a free model)" and the line under the list: "Free models change often and may keep what you send."
3. Type `openrouter/auto` into the model field, and read what the field says. Do not press "Save". A paid model is refused; if the field shows nothing, write that down.
4. Clear the field again.
5. Leave the switch for OpenRouter off. If you want the member test, go on to the optional step.
6. Optional, and only if you have your own OpenRouter key: type it into the key field of the card and press "Save". Then press "Test" once. Afterwards press "Remove" on the card to take the key out, and switch the engine off. If "Remove" is not there, write that down and remove the key from the installation's `.env` by hand, without copying it anywhere.
7. Optional: the card's "Use for" list shows which members may use a free cloud engine. A ticked member shows its warning: "Sends your mail to this service." for the mail member, and "Sends your bookings to this service." for the bookings member (`warningFor` in `openbot/app/src/freeduet/engines-providers-text.ts`). Read it and untick again.

**Expected.**

- Step 1 and 2: the card shows the free-only rule, the suggested model and the warning about what the service may keep.
- Step 3: the field refuses `openrouter/auto`, or says the model is not free. Nothing is saved.
- Step 6 (optional): "Test" reports that the engine answered `ok`. It sends one request to OpenRouter with the words `Reply with the word ok.`, and nothing else.
- Step 7: the mail and bookings members show their warning, and the others show none.
- At the end: the switch is off, the key (if typed) is removed, and the member's engine order is the one you wrote down.

**Do not.** Put OpenRouter first in any member's chain. Turn on a paid engine. Send any real message.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the card's words, whether the paid model was accepted, and whether the switch stayed off after you left the page.

**Send back.** `D100, D101, D107: PASS`, or `FAIL` with the card's words, or `not tested, no OpenRouter key` (steps 1 to 4 need no key).

## 3. D129: the Connect and Message buttons (about 2 minutes)

**Why.** Each Bot row in the Bots list has a Message button that opens a new conversation with that Bot. Each row of an app that connects with one consent screen has a Connect (or Reconnect) button (D129, `docs/M1_PLAN.md`, the menu section; the flat menu was later withdrawn for the entries, but the two buttons stay, by the decision of 22 November 2026). The button is drawn in FreeDuet's package only, and not for an app that needs a form.

**Version.** c9218d48 or later.

**Open.** Settings, then "Bots" (the Bots list), and then Settings, then "Connections".

**Steps.**

1. In the Bots list, find a Bot row. Read the button "Message" beside it (`openbot/app/src/components/bots/bot-roster.tsx`, the label "Message" followed by the Bot's name).
2. Press "Message" once. A new conversation opens with that Bot, and its name is shown at the top. Go back.
3. Open "Connections". Find an app that connects with one consent screen. Read its button: "Connect" or "Reconnect" (`openbot/app/src/components/plugins/app-access-action.tsx`).
4. Find an app that needs a form, such as an app password. Check that it has no Connect button and that it opens its own page instead.
5. Do not press Connect on any app.

**Expected.**

- Step 1: each Bot row has a Message button.
- Step 2: a new conversation opens with that Bot, and nothing is sent to it.
- Step 3: the one-consent-screen app shows "Connect" or "Reconnect".
- Step 4: the form app shows no Connect button.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** which row lacked the button, and whether the Message button opened the Bot.

**Send back.** `D129: PASS`, or `FAIL` with the row and its words, or `not tested, no app with one consent screen`.

## 4. ROADMAP row 124: Firefox and WebKit in the members' computer (about 3 minutes)

**Why.** The computer image installs Firefox and WebKit (the engine Safari uses) beside Chromium, so Ada can check a page in those engines. A build check and a test fail if one of them is missing (`openbot/agent-computer/Dockerfile`, `openbot/agent-computer/tests/browser-image.test.ts`). Ada's release check names the engines in its skill (`web-release-check` in `openbot/examples/freeduet/skills.yaml`). Real Safari and a real phone are not checked, and the report must say so.

**Important.** A member's browser tool launches Chromium only (`openbot/agent-computer/src/browser-runtime.ts`, and the persistent profiles in `openbot/agent-computer/src/profiles.ts`). No tool lets a member choose Firefox or WebKit. So this item checks two things: that the image holds the engines, and that Ada's release check reports them. It does not check that a member opens a page in Firefox or WebKit: no code path does that, and the report of this round says so.

**Version.** c9218d48 or later, with the computer image rebuilt by the update.

**Open.** The chat with Ada.

**Steps.**

1. Optional, if FreeDuet runs with Docker on your computer: run `docker run --rm --entrypoint sh openbot-agent-computer:latest -c "ls -d /ms-playwright/*"`. The list should name a chromium, a firefox and a webkit folder. Write what it printed.
2. Write to Ada: `Run your web-release-check on https://example.com. Read the page only. Say which browsers you ran, and list under "did not run" what you could not check.`
3. Read Ada's answer. Look for the browsers line.

**Expected.**

- Step 1: the three folders are listed. Without Docker the step is not tested.
- Step 2: Ada runs the check and names the browsers. The answer says that WebKit is the engine Safari uses and not Safari itself, and that a real phone and real Safari are under "did not run".
- Step 3: the answer names the engines, not a claim that a member opened the page in each.

**Do not.** Ask Ada to sign in to a site or to change a site. This item reads one public page.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the folder list, and the browsers line of Ada's answer.

**Send back.** `Row 124: PASS` (image holds the three engines and Ada names them), or `FAIL` with what was missing, or `not tested` with the reason. Always add: `member opening a page in Firefox or WebKit: not mapped to code`.

## 5. D123 (row 92): native menus and date fields (about 3 minutes)

**Why.** A member chooses an option in a native drop-down (a select) with the tool `computer_select`. The same approval gate and policy as typing apply, and the answer says what the field now shows (D123, `docs/M1_PLAN.md`, the eight items section; `openbot/server/src/computer/schema.ts`). Custom drop-downs are out of scope: the member clicks them.

**Version.** c9218d48 or later.

**Open.** The chat with Ada, and the public page you chose in "Before you start".

**Steps.**

1. Write to Ada: `Open <the public page you chose> with your browser. Find the first native drop-down on it, choose one of its options, and tell me what the field now shows. Submit nothing and change nothing else.`
2. Read the answer. It should name the drop-down and the option it now shows.
3. If the page has a date field, ask Ada to fill it with a date. Read what the field shows.
4. Check that no form was sent: the page did not change to a thank-you or a confirmation.

**Expected.**

- Step 2: the answer names the option the drop-down now shows.
- Step 3: the date field shows the date given, or the answer says why it could not.
- Step 4: nothing was sent.

**Not tested here.** A drop-down on a site with a sign-in, and a custom drop-down. Mark them "not tested".

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the page's name, the option asked and the field's words in Ada's answer.

**Send back.** `D123 (row 92): PASS`, or `FAIL` with Ada's answer, or `not tested, no public page with a drop-down`.

## 6. D123, D127 (row 94): read several pages in one call (about 2 minutes)

**Why.** A member reads a list of pages in one browser call and gets each page's text, cut to a fixed size. The tool is `computer_read_pages`: up to five pages, 6,000 characters each and 24,000 in all. It is read-only, and each page is decided on as `computer_navigate` is (D127, `docs/M1_PLAN.md`, the read-pages section; `openbot/server/src/computer/headless-tools.ts`).

**Version.** c9218d48 or later.

**Open.** The chat with Ada.

**Steps.**

1. Write to Ada: `Read these three public pages in one call and give me the first line of each: https://example.com, https://www.iana.org/domains/reserved, and the maintainer's own site. Read only.`
2. Read the answer. It should give three first lines, one for each page.
3. Ask Ada: `How many pages did you read in that one call?`

**Expected.**

- Step 2: three first lines, one for each address, and no page left out without a reason.
- Step 3: the answer says three, in one call.

**Do not.** Ask Ada to read a page behind a login, or a list of more than five.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** which page is missing and what Ada said about the call.

**Send back.** `D127 (row 94): PASS`, or `FAIL` with the missing page, or `not tested`.

## 7. Optional: pairing checks of ROADMAP row 32 (about 5 minutes)

**Why.** Row 32 is built and was run live in part on 16 November 2026: a computer's browser and a phone were paired. The row lists four checks that no checklist has run: revoking a pairing, the two-minute expiry of the code, a second phone, and an approval allowed from the paired phone. The code lives for two minutes and works once (`CODE_LIFETIME_MS` in `openbot/server/src/auth/browser-pairings.ts`). Revoking ends the pairing: the browser is cut off at its next request and signed out (`openbot/app/src/components/settings/pair-devices.tsx`). This section is optional: it needs a second phone or browser.

**Version.** c9218d48 or later.

**Open.** Settings, then "Pair a phone or another browser".

**Steps.**

1. Press "Make a code" on the computer. Note the time. Do not open the code yet.
2. Wait at least two minutes. Then open the link or type the code on the phone. Read what it says. It should refuse an expired code.
3. Press "Make a code" again. Open the code on the phone within two minutes. It should pair. Note the time.
4. Check the list: the phone appears with a name. Use "Revoke" beside it (`openbot/app/src/components/settings/pair-devices.tsx`, the button "Revoke").
5. On the phone, reload the page. It should be signed out at its next request.
6. Pair the phone again with a new code, if you want to keep it.
7. Second phone: if you have a second phone or browser, pair it with a new code and check that both appear in the list. Then revoke only one of them, and check that the other still works.
8. Approval from the phone: ask Iris to create the round's test routine from item 1 with the chat on the computer. The approval card should appear on the paired phone as well. Press "Refuse" on the phone, and check that nothing was created. Do not press Allow on the phone unless you read in the card that it allows one answer.

**Expected.**

- Step 2: the expired code is refused and no pairing is made.
- Step 3: the new code pairs within two minutes.
- Step 5: after the revoke, the phone is cut off and shows the sign-in page.
- Step 7: the second phone is listed; a revoke of one leaves the other working.
- Step 8: the card shows on the phone, and Refuse creates nothing.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the time of the code, the phone's words, and whether revoke signed the phone out.

**Send back.** `Row 32 optional: PASS`, or `FAIL` with the words, or `not tested, no second phone`.

## Cleanup at the end (about 2 minutes)

1. Open "Routines". If a Round D test routine is still listed, press "Delete" on it and press "Allow once" on the card. A deletion always asks.
2. Open "Engines". Switch off OpenRouter if you switched it on, and remove any key you typed in item 2. Put each member's engine order back to the note you wrote in "Before you start".
3. Check that no routine is left from this round, and that no mail rule or app connection was changed.

Routines created for this round are cancelled at the end, and any free engine switched on is switched off or restored.

## What this round does not test

- A routine that acts on an account every day, and a run nobody watches (item 1).
- A member opening a page in Firefox or WebKit. No tool lets a member choose those engines (item 4).
- Real Safari and a real phone (item 4).
- Connecting an app. Connect is read only in this round (item 3).
- A paid engine. No paid engine is switched on.
- A custom drop-down, and a drop-down behind a sign-in (item 5).
- The look of the Connect and Message buttons in your browser.

## What to send back

One message, in this form:

```
Live test, round D, routines, engines and browsers, main c9218d48 or later
Commit: <output of git log -1 --oneline>
1. Row 25 (D35, D6, D46): PASS | FAIL | not tested. <the card's words>
2. Row 10 (D100, D101, D107): PASS | FAIL | not tested. <what the card showed>
3. Row 7 (D129): PASS | FAIL | not tested. <which row, what it showed>
4. Row 124: PASS | FAIL | not tested. <folder list, Ada's browsers line>
5. Row 92 (D123): PASS | FAIL | not tested. <Ada's answer>
6. Row 94 (D127): PASS | FAIL | not tested. <the three first lines>
7. Row 32 optional: PASS | FAIL | not tested. <the words>
Minutes: <per item, and the total>
Cleanup: <routines deleted, engines switched off, keys removed>
```

For every FAIL or not tested, add the exact words shown, and the minutes a slow step took. Remove your name, mail addresses, links with tokens, keys, and anything secret before you send. Never send a key or a password, not even one that the page showed you.

If a step does not match what is written here, stop that step, write what you saw, and go on. A result that differs is still a result, and it counts toward which items the notes of the next version can call run live.
