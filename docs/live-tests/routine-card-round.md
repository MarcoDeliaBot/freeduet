# FreeDuet: live test, the routine's card in the chat

This checklist checks the card that appears under a routine made in chat. The card shows what the routine does, cut to 160 characters, and when it runs next. It has the buttons **Pause** (or **Resume**), **Edit** and **Cancel**. The feature came out in v0.2.1 (the CHANGELOG lists it as PR #241). It has not been run live yet (ROADMAP row 10).

Creating and changing a routine still ask for approval, as decision D35 says. The card's own buttons do not ask.

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   grep -c 'Cancel this routine' openbot/app/src/components/routines/routine-chat-card.tsx
   ```

   The second command must print a number above 0. If it prints `0` or an error, update first.

2. **Update if needed.** FreeDuet must be running. From the folder of the installation, run `bash openbot/scripts/update.sh --main`. Wait until it prints `Updated.` or `Already up to date`. If the file `openbot/scripts/update.sh` is not there, your copy is older than v0.2.1. Then run `git pull --ff-only` in the folder, and then `openbot/scripts/start.sh`.

3. **Check the member.** In FreeDuet's own package, Iris holds the routines grant by default (D81). For another setup, check that the member you use has the `routines` grant.

## Rules for this round

- Send no mail. Make no payment.
- Refuse every card that a step does not name.
- Create one routine for this test, and cancel it in step 6. Do not change other routines.

## 1. Create a routine in chat (about 2 minutes)

**Steps.**

1. Open the chat with Iris.
2. Type: "Create a routine that says 'Hello' every day at 10:00."
3. When the approval card for the new routine appears, press **Approve**.

**Expected.**

- The routine is created.
- A card appears under the tool line for the routine.
- The card shows the instruction, cut to 160 characters.
- The card shows "Next run:" with a date, a time and the time zone in brackets, for example (Europe/Rome).
- The card has **Pause**, **Edit** and **Cancel**.

**Send back.** A screenshot of the chat and the card. The exact instruction text, the next run and the time zone.

## 2. Check the card (about 1 minute)

**Steps.** Look at the card from step 1.

**Expected.**

- The instruction is plain text, with no links.
- The next run is in the future.
- The buttons can be pressed.

**Send back.** Whether the card matches this list, and any text that is unclear.

## 3. Pause (about 1 minute)

**Steps.** Press **Pause**.

**Expected.**

- The card shows "Paused" and no next run time.
- The button now says **Resume**.
- No approval card appears. The person's own presses have no card (decision R2 in `docs/design/automations-in-chat.md`, section 9.6).

**Send back.** A screenshot of the card after Pause.

## 4. Resume (about 1 minute)

**Steps.** Press **Resume**.

**Expected.**

- The next run time shows again.
- The button says **Pause** again.
- No approval card appears.

**Send back.** A screenshot of the card after Resume.

## 5. Edit (about 3 minutes)

**Steps.**

1. Press **Edit**. A box asks "What should change?".
2. Type: "Change the time to 11:00."
3. Press **Send change**.
4. When the approval card for the routine update appears, press **Approve**.
5. Reopen the conversation. The card does not refresh by itself. It reads the routine each time the chat is drawn.

**Expected.**

- The chat shows your message: "Change my routine with id <id>: Change the time to 11:00."
- The member asks for approval, and an approval card appears for the routine update.
- After you approve and reopen the conversation, the card shows the new next run time.

**Send back.** Three screenshots: your message, the approval card, and the card after reopening.

## 6. Cancel (about 2 minutes)

**Steps.**

1. Press **Cancel**.
2. A question appears: "Cancel this routine?" with **Yes, cancel it** and **No, keep it**.
3. Press **Yes, cancel it**.

**Expected.**

- The card shows "Routine cancelled" and no buttons.
- No approval card appears.
- The routine is gone from the Routines list.
- After you reopen the conversation, the card says "This routine no longer exists".

**Send back.** A screenshot of the question, a screenshot of the card, and the Routines list without this routine.

## If something goes wrong

- Note the time and the button you pressed.
- Take a screenshot of the card and of any error.
- Note the exact words of the member or the error.
- Open the browser console and note any red errors.
- If the card does not appear, check the Routines list. Was the routine made?

Send these details to the maintainer.
