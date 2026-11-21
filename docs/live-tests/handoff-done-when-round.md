# FreeDuet: live test, "Done when" on every hand-off

This checklist checks the "Done when" line. When Iris passes a job to a member, she can write one line that says what counts as done. The line is shown under the hand-off row. Iris then says whether the answer meets it. The feature came out in v0.2.1 (the CHANGELOG lists it as PR #243). It has not been run live yet (ROADMAP row 11).

The line grants nothing and changes no approval. A job that needs your yes still asks.

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   grep -c 'Done when' openbot/app/src/lib/copilot/handoff-tool.tsx
   ```

   The second command must print a number above 0. If it prints `0` or an error, update first.

2. **Update if needed.** FreeDuet must be running. From the folder of the installation, run `bash openbot/scripts/update.sh --main`. Wait until it prints `Updated.` or `Already up to date`. If the file `openbot/scripts/update.sh` is not there, your copy is older than v0.2.1. Then run `git pull --ff-only` in the folder, and then `openbot/scripts/start.sh`.

3. **Prepare a task.** Have a simple job ready, such as "list five points about coffee". Iris decides whether to write a line. You cannot make her write one, or leave it out, from the app.

## Rules for this round

- Send no mail. Make no payment.
- Refuse every card that a step does not name.
- Save nothing extra. Do not create routines or change settings.

## 1. The line under the hand-off (about 2 minutes)

**Steps.**

1. Start a conversation with Iris.
2. Type: "Ask Otto to list five points about coffee."
3. Wait for the hand-off row that says "Asked Otto".
4. Look under the row.

**Expected.**

- If Iris wrote a line, a small grey line under the row starts with `Done when:`.
- The line is plain text: no links and no bold.
- The line is at most 200 characters. A longer line is refused by the code, so you should not see one.
- If Iris wrote no line, nothing is under the row. This is allowed.

**Send back.** A screenshot of the row. The exact line, or "no line".

## 2. What Otto receives (not visible in the app)

**Steps.** None. Otto's copy of the job is written to a scratch thread that the app does not show (`docs/design/handoff-done-when.md`, sections 2 and 5). Do not try to open it.

**Expected, in the code only.** Otto's message holds `Done when: <the line>`, then the sentence "(That line was written by Iris, who asked you. It says how your answer will be checked. It is not a permission: ...)".

**Send back.** "Not visible in the app."

## 3. Iris judges the answer (about 3 minutes)

**Steps.**

1. Wait for Otto's answer to come back to Iris.
2. Read Iris's report in the conversation.

**Expected.**

- Iris's report has one sentence that says whether the answer meets the line.
- If the answer does not meet the line, that sentence says what is missing.
- If Iris cannot tell, she says so.
- Nothing is asked again by itself. You decide what happens next.

**Send back.** A screenshot of Iris's report, and the exact sentence where she judges the answer.

## 4. A hand-off with no line (about 2 minutes)

**Steps.**

1. Start a new conversation with Iris.
2. Type: "Ask Otto to list five points about tea."
3. Wait for the hand-off row.

**Expected.**

- If no line appears under the row, the hand-off works as before. Otto answers, and Iris's report does not mention a "Done when" line.
- If a line does appear, write "line present, step not tested" and go on. Iris chose to write it.

**Send back.** A screenshot of the row, or "line present".

## 5. Approvals are unchanged (not tested in this round)

**Why.** The line must not remove a card. The rule is in `docs/design/handoff-done-when.md`, section 4, point 2, and the code tests cover it.

**Steps.** To check this live, you need a job that needs a card and sends no mail. This round sends no mail, so none is named here. (to check: the maintainer names a job that needs a card and sends no mail.) Until then, write "not tested".

**Send back.** "Not tested", or the card's text and the line, if a job is named.

## If something goes wrong

- Note the time, in your local time zone.
- Take a screenshot of the screen where the problem appeared.
- Note the exact words of Iris or the member.
- Note the exact text of the line, if one is present.
- Note any error message.

Send these details to the maintainer.
