# FreeDuet: live round, long hand-offs (D166, D168, D170, D171)

This is the checklist for one round of about 30 minutes on your own installation. It checks how a long hand-off runs from start to finish: Iris asks a colleague for a read-back and goes on by herself (D166), the person sees who is working and on what (D168), a silent hand-off stops after ten minutes (D170), and a stalled hand-off offers a way forward (D171).

D166 and D168 are on `main`. Iris's read-back and the work-status card were built, and the first run of D166 was made on 27 November 2026. D170 and D171 are in open pull requests. They are described here from the brief and marked "needs PR merged first". Do not run their steps until that pull request is merged and your installation is updated.

The decisions are recorded in `docs/M1_PLAN.md`, in the sections named below. Cite them by id in your report.

## At a glance

| Order | Check | Decision | What you check | About | You need |
|---|---|---|---|---|---|
| 1 | Read-back and go | D160, D166 | Iris asks Kai for a read-back, then says go herself | 5 min | Iris, Kai |
| 2 | Work status | D168 | Kai is shown working, with what; "stuck" after 5 min, the job is not stopped | 6 min | the Bots page or Iris's page |
| 3 | Delivery | D159 (check-delivery) | The HTML file arrives; Iris checks it and reports | up to 25 min | Kai |
| 4 | Silence | D170 (needs PR merged first) | The hand-off stops after 10 min with no sign of life; Iris tells you | 12 min | a colleague and a way to stop its computer |
| 5 | Try again | D171 (needs PR merged first) | One click re-queues the hand-off once; no duplicate; the badge goes | 5 min | the Bots row |
| 6 | Record | all | Times, D170 messages, screenshot names | 3 min | nothing extra |

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   git merge-base --is-ancestor fd216e3 HEAD && echo "current enough for D166 and D168"
   ```

   The second command must print `current enough for D166 and D168`. For D170 and D171 you also need the commit of the merged pull request. Write its number in the results. Until it is merged, checks 4 and 5 are "not tested, PR not merged".

2. **Update if needed.** FreeDuet must be running. From the folder of the installation, run `bash openbot/scripts/update.sh --main`. Wait until it prints `Updated.` or `Already up to date`.

3. **Prepare the job.** Have this request ready, word for word:

   > Make me a browser Arkanoid in one HTML file: a score, three lives, pastel graphics, and music made with Web Audio that starts after the first tap.

4. **Write down the time** when you send the request, in your local time zone. Every later time in the results is measured from it.

## Rules for this round

- Send no mail. Make no payment and no purchase.
- Refuse every card that a step does not name.
- Save nothing extra. Do not create routines or change settings.
- Do not stop Kai or any other member by pattern, from a terminal or a script. Check 4 uses only the app's own control, and only if the app offers one. Otherwise the check is skipped.
- If Iris offers a routine or a daily review, say no.

## 1. Iris asks for a read-back and goes on by herself (about 5 minutes)

**Why.** For built work with more than one colleague, Iris asks the colleague for a read-back before the work starts (D160). Since D166, when the read-back comes back right, Iris says go to the colleague herself. The person's order is the go, so she does not ask you for "go" or "via".

**Steps.**

1. Start a conversation with Iris.
2. Send the request from "Prepare the job". Write the time.
3. Wait for the hand-off rows. Note the time of Iris's first message to Kai (the read-back request).
4. Wait for Kai's read-back, which is five short lines: Goal, Deliver, Steps, Assumptions and Questions.
5. Note the time when Iris writes to Kai that he goes ahead. Do not write anything to Iris in between.

**Expected.**

- Iris sends Kai a read-back request before the work starts. Kai answers with five short lines and waits.
- Iris compares his read-back with your request. If it matches, she answers Kai with go, in the same turn, without asking you (D166).
- After her go, Iris tells you in one line per colleague: "go", "corrected", "split" or "waiting for Leo".
- You are told who is working. Kai's dot in the team column is green (D168).
- Iris does not ask you for a "via", a "go" or a confirmation at any point before the go.

**How to record.** Times for the request, the read-back and the go. A screenshot of Iris's line about Kai. The words "matches, go in the same turn" or what differed.

## 2. Who is working and on what (about 6 minutes)

**Why.** Since D168, a hand-off has a live card under its line, and each member has a status dot in the team column. The card says what the member is doing by the name of the step (for example "writing a file"), not the file's name. "Stuck" means that the member has sent no event for five minutes. The server only shows the state. It does not stop the job (D168 and D170 are different things: D168 shows, D170 stops, see check 4).

**Steps.**

1. Open the Bots page, or Iris's page where the hand-off row is. Look for the work card under the hand-off line for Kai. If the page has an "In progress" heading, write it down with the exact words you see.
2. Read the card: the member's name, "working for N min", and "last step".
3. Open the team column and look at Kai's dot.
4. Click the card once. It must open Kai's own conversation.
5. Leave Kai alone. Do not write to him. Note the time at which the card first says "stuck".
6. Keep looking until Kai finishes or until 15 minutes after the start, whichever comes first.

**Expected.**

- While Kai works, the card says "working for N min · last step: <step name>". Only the step name appears, never a path, a command or an address.
- The dot is green and pulses (still when reduced motion is on).
- After five minutes without news, the card says "stuck: no sign of life for 5 min" and the dot turns red.
- The job is not stopped. Kai's status goes to "stuck" and nothing else changes. The hand-off keeps running. This is the point of the check: "stuck" is a warning, not a stop (D168; the stop comes at 10 minutes of silence in D170, check 4).
- The card says "done" when Kai finishes, and it stays for 30 minutes.

**How to record.** The exact card text at 1 minute, at 5 minutes and at the end. The exact heading of the work card. Screenshot names for the card and the red dot. If the card never shows "stuck", write "stuck not reached, Kai answered at <time>".

## 3. The file arrives and Iris checks it (up to 25 minutes)

**Why.** Kai's hand-off has an absolute cap of 25 minutes (D170, needs PR merged first). Within that time the HTML file should arrive, and Iris checks the delivery with the check-delivery skill (D159).

**Steps.**

1. Wait for Kai's answer to come back to Iris. Note the time.
2. Open the HTML file from the download card and open it in your own browser. Do not type anything except to play the game.
3. Read Iris's report in the conversation.

**Expected.**

- The HTML file arrives with a download card, within 25 minutes of the go.
- The game opens in the browser, shows a score and three lives, and plays its music after the first tap.
- Iris says in one line whether the delivery meets your request. If something is missing, she says what. Nothing is asked again by itself.

**How to record.** The time of arrival, minus the time of the go, in minutes. "Opened, score yes or no, lives yes or no, music yes or no after the first tap". Screenshot names for the game and Iris's report. If the file did not arrive within 25 minutes, write the time and what the row said.

## 4. Silence stops the hand-off after 10 minutes (about 12 minutes, needs PR merged first)

**Why.** A hand-off stops after 10 minutes with no sign of life, not after 300 seconds. The absolute cap is 25 minutes per hand-off, and there is no retry after the cap. Iris is told which of the two happened (D170, needs PR merged first). This check provokes silence, so it must not break anything.

**Provoke the silence only in a way the app offers.** Ask a colleague for a short job, such as Leo, who has no browser: "List three words that rhyme with cat." Then, while his answer is still running, stop his computer from the app, if the app has a "Stop" control on the member's computer. If the app has no such control, do not stop anything with a terminal and do not write "stopped" in the results. Write "not provoked, no stop control in the app" and skip to check 5.

**Steps.**

1. Ask Leo for the short job. Note the time.
2. If the app offers "Stop" on Leo's computer, press it once. Note the time.
3. Wait. Do not write to Leo or to Iris.
4. Note the time at which the hand-off says that it stopped, and the words of Iris.
5. Open the Bots row for Leo's hand-off and read what it shows.

**Expected.**

- At 5 minutes the work card says "stuck: no sign of life for 5 min" (D168). The job is still not stopped.
- At 10 minutes of silence the hand-off stops with the words "no sign of life for 10 minutes".
- Iris tells you in the conversation that the hand-off stopped and why, in plain words.
- The Bots row for the hand-off shows what happened, why, and a "Try again" button, plus an "Open conversation" button (D171, needs PR merged first).
- If the hand-off reached 25 minutes instead, Iris says so with the 25-minute cap, and there is no retry after the cap (D170).

**How to record.** The time of the stop, the time of "stopped", the 10-minute mark in minutes, the exact words of the hand-off row and of Iris. Screenshot names for the row. Or "not provoked", with the reason.

## 5. Try again re-queues once (about 5 minutes, needs PR merged first)

**Why.** The "Try again" button re-queues the same hand-off once. It must not create a duplicate while one is running, and the badge on Settings › Bots must disappear after a success (D171, needs PR merged first). This check needs check 4 to have stopped a hand-off. Without it, write "not tested, no stopped hand-off".

**Steps.**

1. On the Bots row of the stopped hand-off, press "Try again" once. Note the time.
2. Look at the row: it must show one running hand-off for Leo's job.
3. Press "Try again" a second time, straight after the first, and read what happens. The button must not create a second running job.
4. Wait for Leo's answer. Note the time.
5. Open Settings › Bots and look for the badge on the Bots entry, if there was one.

**Expected.**

- One click starts the same hand-off again, once.
- While it runs, a second click does not create a second job. Only one row is running.
- After Leo answers, the row shows done, and the badge on Settings › Bots disappears.
- The hand-off is not retried a second time by itself.

**How to record.** The number of running rows after each click. The time of Leo's answer. Whether the badge was there before and gone after. Screenshot names.

## 6. Record the round (about 3 minutes)

Fill in the results table below and the file list. Send the table and the screenshot names to the maintainer. Do not send screenshots that show a personal path, a mail address, a link with a token or a secret; cut or blur them first.

| Check | Decision | Result | Times | Notes |
|---|---|---|---|---|
| 1 Read-back and go | D160, D166 | | request: __:__, read-back: __:__, go: __:__ | |
| 2 Work status | D168 | | stuck at: __:__ (job still running: yes / no) | heading of the card: |
| 3 Delivery | D159 | | file arrived: __:__, minutes after go: | |
| 4 Silence | D170 | | stop: __:__, "stopped" at: __:__ | needs PR merged first |
| 5 Try again | D171 | | first click: __:__, answer: __:__ | needs PR merged first |

**Screenshot names.** Use one name per screen, with the check number and the time, such as `check2-kai-stuck-1405.png`. Do not use a person's name or an address in the name.

**What to send back.** One message in this form:

```
Live round, long hand-offs (D166, D168, D170, D171)
Commit: <output of git log -1 --oneline>
PR of D170 and D171 merged: yes | no, commit <sha>
Check 1 (D166): PASS | FAIL | not tested. <times, words of Iris about Kai>
Check 2 (D168): PASS | FAIL | not tested. <card text at 1, 5 and the end, heading>
Check 3 (D159): PASS | FAIL | not tested. <minutes after the go, what the game did>
Check 4 (D170): PASS | FAIL | not tested | not provoked. <times, Iris's words, row words>
Check 5 (D171): PASS | FAIL | not tested. <running rows after each click, badge before and after>
Screenshots: <names>
```

## What this round does not test

- Full access. The round uses the default settings.
- A hand-off with several replicas. The notes of the work status are kept per server process (D168, limits).
- The stop of Kai's computer by a script or a terminal. Only the app's own control is used.
- A routine or a mail trigger.
- A "Try again" after the 25-minute cap. D170 says there is no retry after the cap, and this round does not try to reach it.

## If something goes wrong

- Note the time, in your local time zone.
- Take a screenshot of the screen where the problem appeared, and remove anything private from it.
- Note the exact words of Iris or the member.
- Note any error message.

Send these details to the maintainer.
