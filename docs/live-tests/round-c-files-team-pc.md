# FreeDuet: live test, round C, files, the team and the PC

This is the checklist for one round of about 23 minutes on your own installation. It checks six items that are built and tested in CI and have not been run live. Their rows are in the Now table of `docs/ROADMAP.md`: row 64 (office files), row 65 (the picture you attach), row 74 (the Download button), row 13 (one line with Undo after a team change), row 20 (a team proposed at your first message) and row 54 (programs on your own computer, optional). The ROADMAP rows say "not yet run live", and this round is the first run.

For each item the checklist gives the reason, the version you need, what to open, what to click, what you should see, a pass or fail box, and what to note if it fails. Each click is named as the app labels it. The labels come from the app code, and the file is named under each item. Run them in the order given.

The decisions are recorded in `docs/M1_PLAN.md`, in the sections named below. This round runs `main` at commit c9218d48 or a later commit.

## At a glance

| Order | Item | Decision | What you check | About | You need |
|---|---|---|---|---|---|
| 1 | Office files | D58, D61, D85 (row 64) | Penny makes a spreadsheet, the file card shows, the total is right | 4 min | Penny in your team |
| 2 | A picture you attach | D72 (row 65) | A member names the colour of a picture you attach | 3 min | a member that uses Claude Code |
| 3 | Download button | D38 (row 74) | The Download button on the file card from item 1 | 2 min | the file from item 1 |
| 4 | One line with Undo | D43 (row 13) | The line after a throwaway member is added, and Undo | 4 min | nothing extra |
| 5 | A team proposed at your first message | row 20 | Iris asks one question, then proposes at most six lines | 4 min | a first day, or no answer is shown |
| 6 | Programs on your computer | D60, D96 (row 54) | Gus reads the list of programs; no update or install | 4 min | a Windows PC with the helper, optional |

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   git merge-base --is-ancestor c9218d48 HEAD && echo "current enough"
   ```

   If the second command prints `current enough`, your copy includes commit c9218d48 (the merge of pull request #516). If it prints nothing or an error, update first.

2. **Update if needed.** FreeDuet must be running. From the folder of the installation, run `bash openbot/scripts/update.sh --main`. Wait until it prints `Updated.` or `Already up to date`, then run step 1 again.

3. **Make the dummy files.** Use only invented data. For item 2 make one small picture of a plain red square in any paint program, and keep it on your computer. Nothing else is needed; the spreadsheet in item 1 is typed into the chat by you as three invented rows.

4. **Note the time.** Write down the time when you start. Each item states its minutes, and a slow step is written down with its minutes.

## Rules for this round

- No real data in the chat. Use the invented rows and the red square only.
- Send no mail. Make no payment and no purchase. Create no routine.
- Create one throwaway member in item 4, and remove it again at the end (see the end of item 4). Nothing else in the team changes.
- Do not install or update any program. Item 6 only reads the list.
- Never type a key, a password or a token into the chat. Never type a pairing code into a chat (item 6).
- If Iris offers a daily review, say no. It is not part of this round.

## 1. Row 64, D58, D61, D85: office files, Penny makes a spreadsheet (about 4 minutes)

**Why.** Penny makes and changes `.xlsx` files in the member's own computer and checks them with a read-only inspector of ours (`office-inspect`). The file goes to you with the Download card; a member never sends it (`docs/M1_PLAN.md`, sections 38 and 41; the launchers of LibreOffice are taken off the path, section 64). The ROADMAP row says the image and the skills have not been run live.

**Version.** c9218d48 or later. The office tools are in the member's computer image and in `openbot/agent-freeduet`; their names are `office-inspect` and `office-convert` (`docs/design/office-files.md`).

**Open.** The chat with Penny (the Bots page, then Penny).

**Steps.**

1. Write to Penny: `Make a small spreadsheet called test-sales.xlsx with three rows of invented data: Apples, 3, 2.50; Pears, 2, 1.20. Add a column Total (quantity times price) and a row Sum with the total of the column. The data is invented; no real data.`
2. Wait for the answer. Read what Penny says about the file.
3. Look for the file card. Its name is the file's name, and its button reads "Download" (`openbot/app/src/freeduet/member-file-card.tsx`, label `file.download` in `openbot/app/src/freeduet/person-language/cards.ts`).
4. Do not press "Download" yet. Read the card's size line.
5. Optional: write to Penny: `Change the price of Pears to 1.50 and tell me the new sum.`

**Expected.**

- Step 2: Penny says she made the file and does not claim a file was sent to anyone.
- Step 3: a file card with `test-sales.xlsx` and its size, and a "Download" button.
- The sum is 9.90 (3 × 2.50 plus 2 × 1.20). In step 5 the sum is 10.50 (3 × 2.50 plus 2 × 1.50). A different number is a FAIL, and you write down both numbers.
- No mail was sent, and no file left the chat.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the card's words, the sum Penny gave, and whether a card appeared at all.

**Send back.** `Row 64: PASS`, or `FAIL` with the sum Penny gave, or `not tested, no Penny in your team`.

## 2. Row 65, D72: a member sees the picture you attach (about 3 minutes)

**Why.** When you attach a picture to your latest message, the member answering it looks at the picture itself. Only that picture is sent, and only to the member's own engine. A member on another engine gets a note that the picture could not be seen (`docs/M1_PLAN.md`, section 51, D72). The switch is `FREEDUET_PICTURES=off` (`openbot/agent-freeduet/freeduet/claude_engine.py`, the function that reads it).

**Version.** c9218d48 or later. The picture path is in `openbot/agent-freeduet/freeduet/claude_engine.py`.

**Open.** The chat with a member whose engines include Claude Code. Settings, then "Engines", then the table "Who uses what" shows the order of each member's engines; pick one whose list includes "Claude Code".

**Steps.**

1. Press the button "Attach a file" in the message box (`openbot/app/src/components/channels/composer/composer.tsx`) and choose the red square.
2. Write, with the picture attached: `What colour is this square? Answer with one word.`
3. Read the answer.

**Expected.**

- Step 3: the member answers "red" or a word that means red. It does not say it only sees a note about a picture.
- If the member uses an engine other than Claude Code, it says it cannot see the picture. That is a result, and it is written down with the engine's name.
- Not checked here: the ROADMAP row says the picture is held in memory and never logged or saved. You cannot see that from the chat, so this round does not decide it.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the member's answer, the member's engine, and whether the attach button showed the file name.

**Send back.** `Row 65 (D72): PASS`, or `FAIL` with the answer, or `not tested, no member with Claude Code`.

## 3. Row 74, D38: the Download button for a file a member offers (about 2 minutes)

**Why.** A member offers a file from its own workspace with one tool, and the card's Download button serves it. The button works for files up to 100 MiB. A file is downloaded only when you press the button (`docs/M1_PLAN.md`, section 21, D38; `openbot/server/src/freeduet/member-files.ts`).

**Version.** c9218d48 or later.

**Open.** The file card from item 1.

**Steps.**

1. Read the file card: its name, its size, and the button.
2. Press "Download".
3. Read the button's state while it works, and what the browser does with the file.
4. Open the file in your browser's download list and check that it is `test-sales.xlsx`.

**Expected.**

- Step 1: the size is in the card, and the button reads "Download" (`file.download` in `openbot/app/src/freeduet/person-language/cards.ts`).
- Step 2 and step 3: the button reads "Downloading…" while it works, then the browser saves the file. A message "Download started" may appear (`file.started`).
- Step 4: the file opens and shows the three rows and the total.

**Not tested in this round.** The rule that only the member who made a file may offer it, on a shared computer (the ROADMAP row says it is not verified yet), and a file over 100 MiB.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the card's words, and what the browser did.

**Send back.** `Row 74 (D38): PASS`, or `FAIL` with the card's words, or `not tested, no file offered`.

## 4. Row 13, D43: one line with Undo after a team change (about 4 minutes)

**Why.** When a member is added from chat, one line replaces the completed card. It says what was added, with **Undo** and **Details**. Undo removes the member and its skills only while the member is exactly as it was added, and it is refused a second time (`docs/M1_PLAN.md`, section 26, D43; `docs/design/settings-in-chat.md`).

**Version.** c9218d48 or later. The line is `openbot/app/src/freeduet/member-added-line.tsx`.

**Open.** The chat with Iris.

**Steps.**

1. Write to Iris: `Propose one throwaway member called Round C test, who only answers with the word ok. It is a test; I will remove it.`
2. Read the proposal card. Press "Create" on it.
3. Read the line that replaces the card. Its text reads "was added to your team." (`openbot/app/src/freeduet/member-added-line.tsx`).
4. Press "Undo" on the line. Its button reads "Undoing…" while it works.
5. Open the Bots page and check that "Round C test" is gone.
6. Press "Details" on a second line, if one is present. Read what it shows, then close it.

**Expected.**

- Step 3: the line says the member was added, and shows "Undo" and "Details". The proposal card is not shown any more.
- Step 4: the line changes to "was added and then removed. Undone." The member is gone from the Bots page.
- Step 6 (optional): Details shows what was added.
- A second press of Undo is refused, and the line says so. That is a result, and it is written down.

**Restore at the end.** If Undo was refused, do not force anything. Write what the line said and remove "Round C test" from the Bots page the way the app allows; the app's way to delete a member is not checked by this round. At the end of the round the team must be as it was before item 4.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the line's words, whether Undo removed the member, and whether the member was left in the team.

**Send back.** `Row 13 (D43): PASS`, or `FAIL` with the line's words, or `not tested` with the reason.

## 5. Row 20: a team proposed at your first message (about 4 minutes)

**Why.** On a new installation Iris asks one question, what your work is. When you say, she proposes three or four members from the team who fit that work, in six lines at most, and asks which small job to start with. Nothing is created or switched on without your yes (`docs/design/team-proposal.md`; the rule is in `openbot/examples/freeduet/agents.yaml`, the paragraph "First day, and the first message about work").

**Version.** c9218d48 or later. The prompt is in `openbot/examples/freeduet/agents.yaml`; the welcome lines are in `openbot/app/src/components/channels/first-day-greeting.ts`.

**Open.** A new conversation with Iris. The prompt applies on a first day whose request says that Gmail and Google Calendar are not connected yet (`agents.yaml`). If your installation is past its first day, the first-day lines do not show; then do steps 3 and 4 in a new conversation, and write down that it was not a first day.

**Steps.**

1. Read the first lines Iris shows. They should be the welcome: "Welcome." or "Welcome, <your first name>." and "It's our first day together, and I'll learn how you work as we go." (`firstDayWelcome` in `first-day-greeting.ts`).
2. Read Iris's first reply. It should be one short question.
3. Answer with an invented line: `I run a small bakery and need help with orders and social posts.`
4. Read her proposal. Count its lines.
5. Do not press "Create" on any proposal. Write "no thanks, this is a test" if she asks you to start a job.

**Expected.**

- Step 2: her reply is one short question, "What is your work?" in English or in your language.
- Step 4: at most six lines: three or four named members from the team, each with what it would do for you, and a closing question about a first small job. A daily review line may appear only if she offers it, and you say no to it.
- Nothing is created, switched on or sent.

**Not shown on this installation.** If the first-day lines do not show, the item is "not tested: no first day"; the proposal in step 4 can still be checked on its own.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** Iris's first reply, the number of lines in the proposal, and any member she created without a yes.

**Send back.** `Row 20: PASS`, or `FAIL` with her first reply and the line count, or `not tested, no first day` (with step 3 and 4 if you ran them).

## 6. Row 54, D60, D96: programs on your own computer, read only (about 4 minutes, optional)

**Why.** Gus can look at the programs on your Windows computer through a small helper that FreeDuet ships. The helper only reads. Every read asks you first, with a card (`openbot/server/src/approvals/policy.ts`, the rule for programs, D60). Updating and installing a program are not built, and they wait until the items under Now have run live (D96, `docs/M1_PLAN.md`, section 65). This round does not update or install anything.

**Version.** c9218d48 or later. The helper is `openbot/scripts/programs-helper/FreeDuetProgramsHelper.ps1`; the page to switch it on is `/api/programs/pairing`, whose buttons read "Switch on" and "Switch off" (`openbot/server/src/programs/routes.ts`).

**You need.** A Windows PC on which you run the helper yourself. If you have none, write `not tested, no Windows PC with the helper`, and skip the item.

**Steps.**

1. On the PC, open the page `/api/programs/pairing` of your installation. Press "Switch on". Read the page's warning text.
2. Follow the page's steps for the pairing code. Press "Show a code" on the page, and type the code into the Windows window only. Never type it into a chat.
3. Write to Gus: `What on my PC needs an update? Only look, do not change anything.`
4. Read the card that asks you. Press your answer, then read Gus's reply.
5. Write to Gus: `Please update one of those programs for me.`
6. Read his answer.
7. Press "Switch off" on the pairing page.

**Expected.**

- Step 4: a card asks before the list is read. Nothing is read until you answer yes.
- Step 4: after yes, Gus lists the programs, and any update that is available, from the helper's list.
- Step 6: Gus says he can only look for now, and does not start an update. He does not suggest downloading an installer.
- Step 7: the page confirms that the helper is switched off.

**Fail if.** Gus says he has updated or installed a program, or a card for an update or install appears. Write the words down.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the card's words, the list's first line, and Gus's words for step 6.

**Send back.** `Row 54 (D60, D96): PASS`, or `FAIL` with Gus's words, or `not tested, no Windows PC with the helper`.

## What this round does not test

- Penny's and Wren's other skills: a PDF, a slide deck, an old format, and a macro (refused by design).
- The maker-only rule for a shared computer (item 3).
- A picture in an older message, or a picture sent to a member on another engine (item 2 only checks what it says).
- Updating or installing a program on your computer (item 6, not built).
- The daily review (Iris's offer is answered with no).
- Anything that sends mail or makes a payment.
- The look of the file card and the Undo line in your browser, which waits for the maintainer's yes.

## What to send back

One message, in this form:

```
Live test, round C, files, the team and the PC
Commit: <output of git log -1 --oneline>
Started: <time>, finished: <time>
1. Row 64 (D58, D61, D85): PASS | FAIL | not tested. <the sum Penny gave>
2. Row 65 (D72): PASS | FAIL | not tested. <the member's answer and engine>
3. Row 74 (D38): PASS | FAIL | not tested. <the card's words>
4. Row 13 (D43): PASS | FAIL | not tested. <the line's words, Undo result, team restored yes or no>
5. Row 20: PASS | FAIL | not tested. <Iris's first reply, line count>
6. Row 54 (D60, D96): PASS | FAIL | not tested. <Gus's words for the list and for the update>
Minutes per item: <1 to 6>
```

For every FAIL or not tested, add the exact words shown, and the minutes a slow step took. Remove your name, mail addresses, links with tokens, keys, pairing codes, and anything secret before you send. Never send a key, a password or a pairing code, not even one that the page showed you.

If a step does not match what is written here, stop that step, write what you saw, and go on. A result that differs is still a result.
