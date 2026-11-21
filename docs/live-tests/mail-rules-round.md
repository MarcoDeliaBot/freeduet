# FreeDuet: live test, mail rules

This checklist checks mail rules (decision D46) on your own installation. You tell Otto a standing rule in your own words. FreeDuet keeps the rule and applies it to new mail about every five minutes. The rules are FreeDuet's own, not Gmail filters. The feature came out in v0.2.2 (CHANGELOG, 16 November 2026, PR #274). Only one rule, for one sender domain, has been run live (ROADMAP row 15). It takes about 10 to 20 minutes.

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   test -f openbot/server/src/plugins/mail-rules.ts && echo "has mail rules"
   ```

   The second command must print `has mail rules`. If it does not, update first.

2. **Update if needed.** FreeDuet must be running. From the folder of the installation, run `bash openbot/scripts/update.sh --main`. Wait until it prints `Updated.` or `Already up to date`. If the file `openbot/scripts/update.sh` is not there, your copy is older than v0.2.1. Then run `git pull --ff-only` in the folder, and then `openbot/scripts/start.sh`.

3. **Check the Gmail connection.** Otto must be connected to a Gmail account. Rules work with both ways of connecting: the app password (`google-imap`) and OAuth (`google-workspace`).

## Rules for this round

- Send no mail, except the test mail in step 3 if you can send one.
- Make no payment.
- Refuse every card that a step does not name.
- Save nothing extra. Do not create other rules or change other settings. Delete the rule in step 6.

## 1. Make a rule with a typed order (about 2 minutes)

**Steps.**

1. Open the chat with Otto.
2. Type this exact message: "From now on, put everything from github.com in a label called GitHub and archive it."
3. Wait for Otto's answer.

**Expected.**

- Otto confirms the rule in one line, and says FreeDuet keeps it.
- Otto does not say that Gmail has a filter.
- No card appears. Your own typed words are enough.

**Send back.** A screenshot of Otto's confirmation, and the time.

## 2. See the rule under Connections (about 2 minutes)

**Steps.**

1. Open Connections.
2. Find the "Mail rules" section. It is drawn only when at least one rule exists.
3. Read the rule.

**Expected.**

- The rule is written in words. For example: "From now on, mail from the domain github.com: label “GitHub” and archive."
- Under it, the status reads "On. Has not run yet."
- The buttons are **Switch off** and **Delete**.

**Send back.** A screenshot of the "Mail rules" section.

## 3. Wait for the job to run (about 10 minutes)

**Steps.**

1. Wait at least 5 minutes. The job runs about every five minutes.
2. Send a test mail from a GitHub address to your connected Gmail inbox. (to check: can you send a mail that comes from a GitHub address? If not, skip this step and write so.)
3. Wait another 5 minutes.

**Expected.**

- The mail is not in your Inbox.
- The mail has the label "GitHub".

**Send back.** A screenshot of the Gmail Inbox without the mail, and of the "GitHub" label with the mail in it. The time you sent the mail and the time you checked.

## 4. Check the rule again (about 1 minute)

**Steps.** Go back to Connections, to the "Mail rules" section.

**Expected.**

- The status reads "On. Last run" with a recent date and time, then a number of messages. The number is at least 1.
- No "Last problem" line is shown.

**Send back.** A screenshot of the updated rule.

## 5. Switch the rule off (about 1 minute)

**Steps.** Press **Switch off**.

**Expected.**

- The status reads "Off".
- The button now says **Switch on**.
- The rule is still listed.

**Send back.** A screenshot showing the status "Off".

## 6. Delete the rule (about 1 minute)

**Steps.** Press **Delete**. Confirm if asked.

**Expected.**

- The rule is gone from the list.
- Mail that the rule already changed keeps its label. The section says deleting "does not undo what it already did".
- If this was the only rule, the "Mail rules" section is not shown.

**Send back.** A screenshot of Connections without the rule.

## If something goes wrong

- Note the time.
- Take a screenshot of the error, or of the unexpected state.
- If the rule shows a "Last problem" line, copy its exact text.
- Note Otto's exact words if he says something unexpected.
- Note the Gmail label or Inbox state if the rule did not apply.

Send these to the maintainer, with a short note: which step failed, and what you expected to see.
