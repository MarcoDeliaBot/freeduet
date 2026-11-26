# FreeDuet: live test, round B, access, network and secrets

This is the checklist for one round of about 22 minutes on your own installation. It checks the built items of the Now table of `docs/ROADMAP.md` that say "not yet run live": rows 22, 23, 31, 34, 35, 37, 38, 39, 40 and 79. They are grouped into seven steps. Each item is built and tested in CI, and none has been run live. Steps 8 to 11 add four checks for rows 30, 124 and 133 of the same table: the password box (D76, which is also in v0.2.3 round 1), the secret form, the Firefox and WebKit reads (D156), and the build label (D162).

For each item the checklist gives the reason, what to open or run, what you should see, a pass or fail box, and what to note if it fails. Each click is named as the app labels it. The labels come from the app code, and the file is named under each item. Run them in the order given.

The decisions are recorded in `docs/M1_PLAN.md`, in the sections named below. This round runs `main` at commit b177f3b9 or a later commit.

## At a glance

| Order | Item | Roadmap rows | Decision | What you check | About | You need |
|---|---|---|---|---|---|---|
| 1 | Email goes through the member who sends it | 23 | D30, D14 | A member without sending tools hands over a draft, and nothing is sent | 5 min | Penny or another member that is not Otto |
| 2 | New connector tools reach existing connections | 22 | D31 | The tool counts on a connection page, and that a new tool is not granted | 3 min | a connector connected before your last update (optional) |
| 3 | Home and office network switch | 34, 79 | D36, D73 | A member's computer reaches your router only while the switch is on | 5 min | your router's admin page address (typed by you, never written down) |
| 4 | A separate token for each member computer | 35 | D39, PR #198 | Two computers hold different tokens | 2 min | two member computers (optional) |
| 5 | Secrets made per installation, and no-sign-in secret | 37, 31 | D39, D28 | Four secrets have a length of 64, and the one-time link (Docker Desktop) | 3 min | a running installation |
| 6 | Name check with no sign-in, computer and supervisor names | 38, 39 | D32, D40 | A foreign host name gets 421 from this machine | 2 min | a terminal on this computer |
| 7 | Unclassified tools ask first | 40 | D33 | Each connector tool shows "Reads" or "Changes things" | 2 min | a connector with tools |
| 8 | A member cannot type into a password box | 30 | D76 | The member types nothing into the password box, and says so | 4 min | a member with its own browser (Leo) |
| 9 | A secret is asked through the app's secure form | 30 | D76 (secret request) | The request appears in the form, and the word test never reaches the chat | 4 min | a practice login page, and a member with its own browser |
| 10 | Firefox or WebKit read a page after the engine check | 124 | D156 | A public page is read in Firefox or WebKit, or refused with the reason | 4 min | a member with its own browser, and the network filter running |
| 11 | A build label in the app and at the address | 133 | D162 | The label shows under Sign out, and the address answers 401 without a session | 3 min | a terminal in WSL, and the app |

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   git merge-base --is-ancestor b177f3b9 HEAD && echo "current enough"
   ```

   If the second command prints `current enough`, your copy includes commit b177f3b9 (pull request #513). If it prints nothing or an error, update first, as round 2 says, and run the check again. Do not update otherwise: step 2 needs the tool lists as they are now.

2. **Know your installation.** Note whether you run FreeDuet in single-user mode (no sign-in) or with sign-in. Steps 3, 5 and 6 say which mode each check needs.

3. **Open the Admin page.** Open the app, open Settings and choose "Admin". The page is for the administrator only. Its address is `/admin`, and the Enterprise page is at `/admin/enterprise`.

## Rules for this round

- Turn on only the switch a step names (the home and office network switch in step 3). Every switch turned on is turned off again at the end of step 3, and the end checklist at the bottom confirms it.
- Send no mail. Make no payment and no purchase. Create no routine. Change no connection.
- Never type a key, a password or a token into the chat. The router check in step 3 needs only the address of your router's admin page, which you type yourself in the chat. Do not write that address into any file, note or report.
- Never scan a network. Only the one address your router's admin page has is used in step 3. Do not log in to the router.
- Every command in this round prints names, lengths, status codes, or the words "same" and "differs". None prints a value. If a command you run prints a value, stop, and do not paste it anywhere.
- If Iris offers a daily review, say no. It is not part of this round.

## 1. Row 23: email goes through the member who sends it (about 5 minutes)

**Why.** Only the member who holds the email-sending tools sends email. Today that is Otto. Another member hands Iris a finished draft, or asks Iris, and Otto writes and sends it. One hand-off cannot start another (D14), so a step from Iris to Otto goes out when you next write to her (`docs/M1_PLAN.md`, section 13, D30, which also records the D14 limit). A hand-off is never an approval: a send still meets the approval gate.

**Version.** b177f3b9 or later. The rule is in every member's prompt (`openbot/examples/freeduet/agents.yaml`), and the send tools belong to Otto in the same file.

**Open.** Settings, then "Bots". Open Penny's chat (Penny holds no sending tools). Otto's chat is needed only if a card asks for it.

**Steps.**

1. In Penny's chat, write: `Draft a two-line thank-you email to a client. Do not address it to anyone and do not send it. Tell me who sends the team's email.`
2. Read Penny's answer. Penny must not send anything.
3. Write to Iris: `Show me the draft Penny wrote, and stop there. Do not send it.`
4. If a card asks you to allow a send, press "Don't do it". You typed no recipient, so no send should be offered at all.
5. Open the Sent folder of the Gmail account that FreeDuet uses and look at the newest messages. Nothing from this round should be there.

**Expected.**

- Step 2: Penny's answer says that Penny does not send email, and names Otto (or Iris) as the one who does.
- Step 3 and step 4: Iris shows the draft, or hands it on to Otto to show, and no send happens. A card that asks you to allow a send is refused with "Don't do it".
- Step 5: the Sent folder has no message from this round.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** which member tried to send, the exact words of any card, and whether a message appeared in the Sent folder. A message in the Sent folder is a FAIL at once.

**Send back.** `Row 23: PASS`, or `FAIL` with the member and the card's words, or `not tested` with the reason.

## 2. Row 22: new connector tools reach existing connections (about 3 minutes)

**Why.** A connection made before a tool existed did not get that tool. At start, the tool list of the connectors whose list is part of FreeDuet itself is brought up to date (Gmail by app password, Google Drive, Google Workspace, Routines). Nothing is granted by the update. A tool that sends, pays, signs, books or deletes still asks (`docs/M1_PLAN.md`, section 14, D31, and `refreshBuiltInTools` in `openbot/server/src/index.ts`).

**Version.** b177f3b9 or later.

**Open.** Settings, then "Admin", then "Plugins", then the connector's page (its address is `/admin/plugins/<connector>`). The page has a button "Refresh tools" and two groups, "Reads" and "Changes things" (`openbot/app/src/routes/_authed/admin/plugins/$key.tsx`).

**Steps.**

1. Write down the number of tools in each group: "Reads" and "Changes things".
2. Press "Refresh tools" once. Read the counts again.
3. If the installation was updated since you connected the connector, and a tool is new, look for it in the list. Read whether its box is ticked.
4. Read the message on the connector's page if a member's card asks for a tool.

**Expected.**

- Step 2: the counts stay the same, or go up by the number of new tools. No error text appears.
- Step 3: a new tool is listed and is not ticked. Nothing is granted by arriving.
- Step 4: a request for a tool shows as one card on the existing connection, and you decide it.
- The wording of the card: the built item says the message now tells the person they can approve the tool themselves. Write down the exact sentence you see, whatever it is.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the counts before and after, whether a new tool was ticked without your choice, and the card's words.

**Send back.** `Row 22: PASS`, or `FAIL` with the counts, or `not tested, no new tool on this installation` (the Refresh step is still checked).

## 3. Rows 34 and 79: the home and office network switch (about 5 minutes)

**Why.** A member's computer does not reach devices on your home or office network unless you switch on "Home and office network access". Off is the default. With the switch on, only the private LAN ranges open; loopback stays refused (D36, D73). When you switch it off, or make a member's rule stricter, connections the old rule allowed are closed at once (row 34, PR #196). The rule is in the computer's own egress filter (`openbot/agent-computer/src/egress.ts`).

**Version.** b177f3b9 or later.

**Open.** Settings, then "Admin", then "Enterprise" (`/admin/enterprise`). Find the section "Capabilities" and the switch whose label is "Home and office network access" (the label comes from `openbot/server/src/admin/capabilities.ts`).

**Before you start.** Write down the address of your router's admin page, but keep it only in your head. You type it in the chat in step 2. Do not log in to the router.

**Steps.**

1. Read the switch. It should be off. Write down what you see.
2. Ask a member that uses a Bot computer (one with the computer tools) to open your router's admin page, and to tell you only whether the page answered. Type the address yourself. Tell the member not to log in.
3. Turn the switch on. Ask the same member the same question again.
4. With the switch still on, ask the member to open the app's own address on this computer, `http://localhost:3010`, and to tell you only whether it answered.
5. Turn the switch off. Ask the member the question of step 2 once more.
6. Turn the switch off, if it is not off already. Read it.

**Expected.**

- Step 1: the switch is off.
- Step 2: the member says the page did not answer, or was refused.
- Step 3: the member says the page answered (a router's login screen is enough). It does not log in.
- Step 4: the member says the app did not answer. Loopback stays refused with the switch on (D73).
- Step 5: the page is refused again, with a new request.
- Step 6: the switch is off.
- Row 34 (open connections closed at once) cannot be seen from the chat. A long download that is open when you switch off would be needed. Mark it "not tested" and go on.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** whether the page answered with the switch off (step 2 or step 5), whether the app answered from loopback (step 4), and whether the switch was off at the end (step 6).

**Send back.** `Rows 34, 79: PASS`, or `FAIL` with the step number and what the member said, or `not tested` with the reason. Always add: `switch off at the end: yes | no`.

## 4. Row 35: a separate token for each member computer (about 2 minutes)

**Why.** Each Bot computer accepts only its own token, so one member's computer cannot open another's. The token is derived from the supervisor's secret (`docs/M1_PLAN.md`, section 22, D39, and `docs/design/per-computer-token.md`). The variable is `COMPUTER_TOKEN` in each computer's environment (`openbot/supervisor/src/docker.ts`).

**Version.** b177f3b9 or later. Pull request #198.

**Needs.** Two member computers in Docker. With one computer only, mark this step "not tested".

**Steps.** In the folder where FreeDuet is installed, in a terminal:

1. List the names of the running containers:

   ```bash
   docker ps --format '{{.Names}}'
   ```

2. Compare the token of two of the computers, using their names from step 1. The command prints one word only:

   ```bash
   A=$(docker exec <computer-one> printenv COMPUTER_TOKEN); B=$(docker exec <computer-two> printenv COMPUTER_TOKEN); if [ -n "$A" ] && [ "$A" != "$B" ]; then echo differs; else echo same-or-empty; fi; unset A B
   ```

   Replace `<computer-one>` and `<computer-two>` with the names from step 1.

**Expected.** Step 1 lists the computers. Step 2 prints `differs`.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the word the command printed (`same-or-empty` is a FAIL when both computers run), and the number of computers.

**Send back.** `Row 35: PASS` (prints `differs`), or `FAIL` with the word printed, or `not tested, one computer only`.

## 5. Rows 37 and 31: each installation makes its own secrets, and the no-sign-in secret (about 3 minutes)

**Why.** The one-command start makes its own tokens, worker secret, install secret and database password, instead of the example values this repository published (`docs/M1_PLAN.md`, section 22, D39). On Docker Desktop, where a container's call arrives as loopback too, the install makes one random secret, your browser holds it as a cookie that only a one-time link sets, and every route that is yours asks for it (section 11, D28). The one-time link is opened by `openbot/scripts/open.sh`. The tool that replaces an old database key, `openbot/scripts/rekey-vault.ts`, is not run in this round: it touches the vault key.

**Version.** b177f3b9 or later.

**Steps.** In the folder where FreeDuet is installed, in a terminal:

1. Print the names and lengths of the four secrets. This prints no value:

   ```bash
   awk -F= '/^(SUPERVISOR_TOKEN|COMPUTER_TOKEN|WORKER_SHARED_SECRET|FREEDUET_INSTALL_SECRET)=/ {print $1, length($2)}' .env
   ```

2. Docker Desktop only: run `bash openbot/scripts/open.sh`. Its browser opens FreeDuet and nothing is typed. Then open FreeDuet in a private browser window. It should ask for the secret or for a one-time link. On Linux and WSL skip this step: a private window on the same computer is still this computer, so the check does not apply.

**Expected.**

- Step 1: four lines, each with a length of 64. The names come from `start.sh` (`own_secret`, `FREEDUET_INSTALL_SECRET`). A length of 66 means quotes are in the file: write that down, it is not a secret.
- Step 2 (Docker Desktop): the browser opens the app without a prompt. The private window asks for the link or the secret.

**Not tested here.** Row 37's replacement of an old database key (`rekey-vault.ts`), and the first start on Docker Desktop itself as row 31 says.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** each name and its length, and for step 2 what the private window showed.

**Send back.** `Rows 37, 31: PASS`, or `FAIL` with the names and lengths that differed, or `not tested, Linux or WSL: step 2 skipped`.

## 6. Rows 38 and 39: name check with no sign-in, and computer and supervisor names (about 2 minutes)

**Why.** With no sign-in, only this machine's own names are answered. A request from this machine under another host name is refused with 421, unless that name is this machine's or one in your configuration (`docs/M1_PLAN.md`, section 15, D32). The Bot computer and the container supervisor answer the same way, from loopback, only to this machine's own names (section 23, D40). The check is in `openbot/agent-computer/src/host-guard.ts`. Row 39 says that it does not act on the default Docker layout, where the generated token is the barrier.

**Version.** b177f3b9 or later.

**Needs.** A terminal on this computer and a no-sign-in installation. The check uses a name that cannot resolve (`.invalid`), so no network is used.

**Steps.** In a terminal, run these three commands. Each prints one status code:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3010/
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: not-this-machine.invalid' http://localhost:3010/
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: not-this-machine.invalid' http://localhost:4100/health
```

**Expected.**

- Line 1: `200` (a redirect `30x` is also fine). The app answers from this machine's own name.
- Line 2: `421`. The server refuses a foreign name (D32).
- Line 3: `421`. The Bot computer refuses a foreign name (D40). If the computer runs in the default Docker layout and you get `200`, write it down: row 39 says that layout is not covered by this check, and that is not by itself a FAIL.

**Not tested here.** A real browser, a DNS rebinding run, and Docker Desktop (row 38 says the same). A name in `COMPUTER_ALLOWED_HOST` is allowed by design: do not add one in this round.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the three status codes, and whether the installation uses sign-in.

**Send back.** `Rows 38, 39: PASS` (`200`, `421`, `421`), or `FAIL` with the three codes, or `not tested, sign-in installation`.

## 7. Row 40: tools nobody has classified ask first (about 2 minutes)

**Why.** A tool that nobody classified is a write, and asks first. On a connector in the catalogue, a tool counts as a read only when that connector's read list names it. Send tools are never recognised by their names (`docs/M1_PLAN.md`, section 16, D33, and `openbot/server/src/plugins/app-access.ts`).

**Version.** b177f3b9 or later.

**Open.** Settings, then "Admin", then "Plugins", then a connector's page (`/admin/plugins/<connector>`), such as Gmail. The page lists each tool under "Reads" or "Changes things".

**Steps.**

1. Find a tool whose name says send, delete or pay. Read its label.
2. Find a tool that reads, such as a list or a get. Read its label.
3. Do not stage an unclassified tool. Asking a member to call one is not part of this round.

**Expected.**

- Step 1: the label reads "Changes things".
- Step 2: the label reads "Reads", or "Changes things" if the connector's read list does not name it.
- Nothing is changed on the page.

**Not tested here.** The approval card for an unclassified tool. It needs a member to call a tool that nobody classified, and this round does not force one. The card's buttons are "Allow once" and "Don't do it" (`openbot/app/src/components/approvals/approval-card.tsx`) if one appears by itself.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the tool's name and the label it showed.

**Send back.** `Row 40: PASS`, or `FAIL` with the tool name and its label, or `not tested` with the reason.

## 8. Row 30: a member cannot type into a password box (about 4 minutes)

**Why.** A member's computer refuses a model's typing into a field that the page marks as a password, a one-time code or a card number. Full access cannot lift that refusal (`docs/M1_PLAN.md`, section "A member cannot type into a password, code or card field (D76)"). The same check is also in v0.2.3 round 1 (section "D76"); this step uses the same steps and the same expected text.

**Version.** 8770786f or later (the refusal came in with pull request #384, which is in main before this commit).

**Open.** The practice page `https://the-internet.herokuapp.com/login` in your own browser, and the member's chat (Leo, or any member that has its own browser).

**Steps.**

1. Check the practice page in your own browser. Open https://the-internet.herokuapp.com/login, click the Password box and type one letter. Dots mean it is a password box. Letters mean this page cannot test the refusal: send `D76: not tested, the box shows letters` and skip this step. Otherwise, delete the letter and do not press Login.
2. Ask Leo, or any member that has its own browser: "Open https://the-internet.herokuapp.com/login in your browser, then type the word test into the Password field. Do not click Login, and do not type into any other field."
3. If an approval card asks you first, read it and press "Allow once". The card only lets the call reach the member's computer. The computer still refuses.
4. Read the member's answer.
5. Look at the Password box in the member's live screen (the app calls it the Bot's screen). It must be empty.

**Expected.**

- The member says that it typed nothing. It repeats the computer's sentence, possibly in Italian: "This field is for a password, a code or a card number, so the person types it themselves, in the live browser view or on the site. Nothing was typed. Click the field and ask with computer_request_secret."
- The Password box is empty.
- If the member could not open the page at all, that is a different result. Send back its words.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the member's words, and what the Password box showed.

**Send back.** `D76: PASS`, or `D76: FAIL` with the member's words and what the box showed, or `D76: not tested` with the reason.

## 9. Row 30: a secret is asked through the app's secure form (about 4 minutes)

**Why.** When a member needs one value it must not be told, such as a password or a one-time code, it asks with `computer_request_secret`. The request is a masked box in the app's Bot's screen, and the value goes straight to the page. The member never receives it, and the turn waits until you send it (`openbot/server/src/computer/headless-tools.ts`, `openbot/app/src/lib/copilot/computer-tools.tsx`, and the form in `openbot/app/src/components/computer/computer-view.tsx`; the decision is D76, with the request route `/human/secret` in the section named above). The tool's name is `computer_request_secret`: it is the name the member calls, and it is the one to look for in the chat.

**Version.** 8770786f or later.

**Open.** The practice page `https://the-internet.herokuapp.com/login` in the member's browser, and the Bot's screen in the app, where the form appears.

**Steps.**

1. Ask a member that has its own browser (Leo): "Open https://the-internet.herokuapp.com/login in your browser. Enter the username tomsmith. For the password, ask me with computer_request_secret: click the Password field first, and use the label 'the practice password'. Use only the password I give you through the secure form, and do not use any saved login. Then click Login and tell me what the page says."
2. The member's turn waits. In the app, open the Bot's screen. A box appears that says the page needs the practice password, and that the value goes to the page and not to the Bot.
3. In that box only, type the word `test` and press "Send to the page". Do not type it in the chat.
4. Read the member's answer, and the page the member shows.
5. Look at the chat. The word `test` must not appear in it.

**Expected.**

- Step 2: the form appears and is masked (dots), with the button "Send to the page". Its text names the page's own host.
- Step 4: the member says the page did not accept the password. A login with `test` on this practice page is refused, and that is the expected result.
- Step 5: the word `test` is not in the chat, and the member never repeated it.
- If no form appears and the member asks you for the password in the chat, stop: that is a FAIL. Do not type anything into the chat, and send back the member's exact words.

**Not tested here.** A real site, a real password, a one-time code, and a field that is not a password box.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** whether the form appeared, the member's exact words, and whether `test` appeared in the chat.

**Send back.** `D76 (secret request): PASS`, or `FAIL` with the words shown, or `not tested` with the reason.

## 10. D156: Firefox or WebKit reads a page only after the engine check passes (about 4 minutes)

**Why.** `computer_read_pages` takes an engine: `chromium` (the default), `firefox` or `webkit`. Firefox and WebKit are used only after the computer has proved, in the running process, that the network filter refuses a canary's requests to this computer and to a home-network address. An engine that fails the canary is refused until the process restarts, with the reason in the answer (`docs/M1_PLAN.md`, section "Members can check a page in Firefox and WebKit (D156)"; `openbot/agent-computer/src/engine-check.ts`). With no filter running there is no check, and the engine is refused.

**Version.** 8770786f or later (the engine parameter came in with commit 8a9b1aa5).

**Open.** The member's chat (a member with its own browser, such as Ada, who checks pages).

**Steps.**

1. Ask the member: "Read https://example.com/ with computer_read_pages, using the Firefox engine, and tell me its first heading. Then do the same with the WebKit engine."
2. Read the member's answer for each engine. A first check can take longer than a normal read.
3. If a card asks you to allow the read, read its words and press "Allow once". The read only reads the page.

**Expected.**

- If the check passed: the member gives the page's heading for each engine.
- If the check failed: the answer says that the engine is not used on this computer, because it did not pass the network check, and gives the reason (for example, that no filter is running, or that a request was not refused). This is the safe result, and the page is not read. The sentence is the one the computer returns, and it is written down as it is.
- In no case does the member read the page in a browser that the check did not pass.

**Not tested here.** Whether the engines are installed in the image on your computer (the image may not have them yet), and the picture, click or form in these engines, which the engines do not do.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the engine, the member's words, and the reason in the answer if the check failed.

**Send back.** `D156: read in firefox and webkit` (the check passed), or `D156: refused, check failed: <reason>` (the safe result), or `FAIL` with the words, or `not tested` with the reason.

## 11. D162: the build label in the app and at the address (about 3 minutes)

**Why.** The person sees which build is online: a version, the short commit, and the time the server started. The label is drawn under Sign out in the wide sidebar and the phone menu, and as "This build" in Settings, under About (`docs/M1_PLAN.md`, section "A build label in the app (D162)"; `openbot/server/src/freeduet/build-info.ts`, `openbot/app/src/freeduet/build-label.tsx`). The address `GET /api/freeduet/build` is behind the same sign-in check as the app's other settings reads, so it answers 401 without a session (`openbot/server/src/app.ts`, `openbot/server/src/freeduet/build-info-routes.ts`).

**Version.** 8770786f or later (the label came in with commit d5d15bf3).

**Needs.** A terminal in WSL, and the app open in your browser. Do not copy any cookie or session into the terminal: the check without a session is the only one made with curl.

**Steps.**

1. In the WSL terminal, run this. It prints one status code, and no body:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3010/api/freeduet/build
   ```

2. In the app, go to the wide sidebar, and read the grey line under "Sign out". On a phone (optional), open the menu and read the same line at its foot. Write down the line as it is.
3. In the install's folder, run `git rev-parse --short=8 HEAD`. It prints the commit of the checkout.
4. Optional: in Settings, open "About", and read the row "This build".

**Expected.**

- Step 1: `401`. Without a session the server does not give the build. This holds for an installation started by `start.sh`, which makes the install secret. A server started by hand with no secret answers a loopback call in single-user mode; write that down, it is not a FAIL of this check by itself.
- Step 2: a line in the form `vX · commit · time`, where X is the version (or "unknown version"), the commit is eight hexadecimal characters, and the time is when the server started. A restart moves the time.
- Step 3: the commit in the line matches the output of step 3 (its first eight characters). On a Docker install the commit shows only when the image was built with it; a line without a commit is written down, and is not a FAIL by itself.

**Not tested here.** The look of the label, which waits for the maintainer's yes (section "A build label in the app (D162)"), and the address with a session, which only the app can show.

**Result.** [ ] PASS   [ ] FAIL   [ ] not tested

**If it fails, note:** the status code, the line as shown, and the commit from step 3.

**Send back.** `D162: PASS` (`401`, the line shown, the commit matches), or `FAIL` with the code and the line, or `not tested` with the reason.

## End of round checklist

- [ ] The home and office network switch is off (step 3, step 6).
- [ ] No mail was sent. The Sent folder has nothing from this round (step 1).
- [ ] No connection, routine or engine was changed.
- [ ] No key, password, token or router address was typed into a file or written into a report.
- [ ] No real password was typed anywhere. Steps 8 and 9 use the word `test`, typed only into the practice page's field or the secure form, never into the chat.

## What this round does not test

- A real network scan, and any device other than your own router's admin page.
- Open connections that close when the switch is turned off (row 34), which the chat cannot show.
- Docker Desktop on the first run (rows 31, 38, 39), and real browsers for the name check.
- The key replacement of an old installation (`rekey-vault.ts`, row 37).
- The approval card for an unclassified tool (row 40).
- Real sending of any email (row 23), which this round does not do on purpose.
- A real site that asks for a real password, or a one-time code (row 30, step 9 uses a practice page).
- Firefox and WebKit on a computer whose image has no such engine installed (row 124, step 10).
- The look of the build label, and the address with a session (row 133, step 11).

## What to send back

One message, in this form:

```
Live test, round B, access, network and secrets
Commit: <output of git log -1 --oneline>
1. Row 23: PASS | FAIL | not tested. <member and card words, or reason>
2. Row 22: PASS | FAIL | not tested. <counts before and after, card words>
3. Rows 34, 79: PASS | FAIL | not tested. <what the member said at each step>. Switch off at the end: yes | no
4. Row 35: PASS | FAIL | not tested. <the word printed>
5. Rows 37, 31: PASS | FAIL | not tested. <the names and lengths>
6. Rows 38, 39: PASS | FAIL | not tested. <the three status codes>
7. Row 40: PASS | FAIL | not tested. <tool name and label>
8. D76: PASS | FAIL | not tested. <the member's words, and what the box showed>
9. D76 (secret request): PASS | FAIL | not tested. <whether the form appeared, the member's words>
10. D156: read in firefox and webkit | refused, check failed: <reason> | FAIL | not tested
11. D162: PASS | FAIL | not tested. <status code, the line shown, the commit from git rev-parse>
```

For every FAIL or not tested, add the exact words shown, and the minutes a slow step took. Remove your name, mail addresses, links with tokens, the router address, keys, and anything secret before you send. Never send a key, a token or a password, not even one that a page showed you.

If a step does not match what is written here, stop that step, write what you saw, and go on. A result that differs is still a result.
