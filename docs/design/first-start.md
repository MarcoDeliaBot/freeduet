# First start in three clicks

Design for the roadmap row "First start in three clicks" ([ROADMAP.md](../ROADMAP.md), Now, status Planned). Written 2026-11-15. The maintainer decided its six open decisions on 16 November 2026, taking the note's own recommendation each time (section 8). S1, S2, S4 and S5 in its option-(b) form are built (section 10).

Markers. **[code: path:line]** read on origin/main (2d49770). **[docs: file]** stated in this repository's docs. **[doc: URL]** stated by an outside official page, read 2026-11-15. **[assumed]** my inference; nothing marked so may be built on as if true. Line numbers are of that commit.

## 0. The promise, and what "three clicks" counts

The row promises: open FreeDuet, press one button to connect your Claude plan (FreeDuet installs Claude's own program for you and opens Claude's sign-in page), and Iris is ready. A missing engine is said in plain words in the chat with the button beside it. **Check again** works without restarting anything [docs: docs/ROADMAP.md:36].

**What counts.** Clicks are counted from the moment the FreeDuet page is open in the person's browser. Installing Docker, restarting Windows and starting the stack are the installer's job ([design/installer.md](installer.md)), not clicks, and section 2 says plainly where they stay in the way. Typing in Claude's own sign-in page is the person's step on Claude's page and is not a FreeDuet click. This definition is open decision D4.

## 1. What happens today, from a clean machine to Iris's first answer

Ubuntu 22.04 or 24.04 with nothing installed, the path the README gives plus the installer.

| # | The person does | Where it can stop | Evidence |
|---|---|---|---|
| 1 | `git clone` the repository | no git, no network | [code: README.md:144-148] |
| 2 | `cp .env.example .env` | wrong folder | [code: README.md:148] |
| 3 | `bash openbot/scripts/install.sh`, answers `y` once (Docker, Compose, Bun, small tools) | no sudo; unsupported OS; low disk or memory; a port in use | [code: openbot/scripts/install.sh:173-176]; [docs: docs/design/installer.md:34,46] |
| 4 | Logs out and in once, if the docker group was just added, and runs step 3 again | forgets; exit status 3 | [docs: docs/design/installer.md:44] |
| 5 | `bash scripts/start.sh`: builds images, starts the stack (minutes) | Docker not running, a build or pull fails, a port taken | [code: README.md:149]; [docs: docs/design/installer.md:22] |
| 6 | In the same terminal, `cd openbot && docker compose exec -it agent-freeduet claude`: Claude's own first-run screens, its login choice, a browser page, and a pasted code where the browser cannot reach the CLI | only the last line of `start.sh` mentions it; the person must find the command, which is long and names a container; the container name is wrong if the compose project differs | [code: README.md:150]; [code: openbot/scripts/start.sh:659-662]; [doc: https://code.claude.com/docs/en/authentication] |
| 7 | Opens `http://localhost:3010`. `start.sh` opens it by itself the first time it makes the installation secret | pairing link expired (good two minutes) | [code: README.md:153]; [code: openbot/scripts/open.sh:15-17] |
| 8 | Onboarding: welcome, computer, roster, then apps, notifications and the checklist. Six screens, none of them about Claude | none stops it; none helps the Claude step either | [code: openbot/app/src/routes/_authed/onboarding.tsx:508-512,652-675]; grep of `claude` in `app/src/components/onboarding/` finds nothing |
| 9 | Writes to Iris (or the first-day greeting goes by itself) | **Not signed in** and the answer is one red sentence: "Claude Code is not signed in. Sign in once with `docker compose exec -it agent-freeduet claude`, then send your message again." | [code: openbot/agent-freeduet/freeduet/claude_cli.py:39-42,214]; [code: openbot/app/src/components/channels/channel-chat.tsx:1393-1406,1903-1907] |

**Count.** 9 steps, of which 5 are in a terminal; 7 if the docker group needs no new login and onboarding is not counted. Not one of them is a click on a button in FreeDuet that connects Claude. The only Claude step is a command typed in a terminal.

Facts that matter for the design:

- **The Claude program is already installed, silently, by the image build.** `agent-freeduet`'s Dockerfile runs `npm install -g @anthropic-ai/claude-code@2.1.311` while the person's own machine builds the image [code: openbot/agent-freeduet/Dockerfile:21-26]. So on a source install a *missing* engine cannot normally happen. It can after a failed or offline build, with a wrong `CLAUDE_BIN`, or, later, with published images that must not carry it (D2).
- **Where the sign-in lives.** `CLAUDE_CONFIG_DIR=/home/freeduet/.claude`, a named volume mounted only in `agent-freeduet` [code: openbot/docker-compose.yml:447,463,542]. The container runs as user `freeduet`, uid 10001 [code: openbot/agent-freeduet/Dockerfile:39-43]. No other service mounts it.
- **How a turn finds Claude.** Each turn and each server-side text call starts a fresh `claude` process from `claude_bin()`, which reads `CLAUDE_BIN` or falls back to `claude` on PATH at the moment of the call [code: openbot/agent-freeduet/freeduet/claude_cli.py:107-108,172-183; claude_engine.py:104-108]. Nothing about the binary or the login is cached in the service.
- **What the person is told when it is missing.** "Claude Code is not installed in this service." No button, no next step [code: openbot/agent-freeduet/freeduet/claude_engine.py:107-108; claude_cli.py:261-262].
- **A probe exists and costs no model call.** `claude --version` then `claude auth status`, 8 seconds in all, reading only `loggedIn` [code: openbot/agent-freeduet/freeduet/claude_cli.py:74-80,323-333,336-374]. `auth status` exits 0 signed in, 1 not, and prints JSON [doc: https://code.claude.com/docs/en/cli-reference].
- **The upstream desktop app has a Claude button, and it is the wrong kind.** It starts a sign-in container, opens the browser itself, takes the pasted code and hands the plan token back to the app, which writes it as `CLAUDE_CODE_OAUTH_TOKEN` [code: openbot/desktop/src-tauri/src/main.rs:2943-2995,2991-3004; env.rs:493-496]. That stores a plan token, which FreeDuet's rules forbid [docs: docs/PROVIDERS.md:13,25]. It knows nothing of FreeDuet [docs: docs/design/installer.md:26].

## 2. The target flow, per platform

**Target: two clicks, a third only as a fallback.** From an open FreeDuet page with the stack running:

1. **Connect your Claude plan** (the card in the chat, or the same button on the Engines page). FreeDuet starts Claude's own sign-in, and the browser opens Claude's page in a new tab.
2. The person signs in on Claude's page (not a FreeDuet click). If Claude's page shows a code, the person pastes it into the box on the card and presses **Continue**. This is click 2.
3. FreeDuet checks by itself. If it did not see the sign-in, the card says so in words and offers **Check again** (click 3).

Iris is ready: the card turns into "Claude is connected" and the held first message is sent (S7).

| Platform | How the stack gets running today | Clicks after the page is open | What is not reachable in three clicks, and why |
|---|---|---|---|
| **Linux (Ubuntu 22.04, 24.04) with Docker** | `install.sh` then `start.sh`, two terminal commands [docs: docs/design/installer.md:34]; CI proves the check, apt and Bun steps only [docs: docs/design/installer.md:101] | 2 (3 with Check again) | Getting Docker and the stack: terminal commands, one possible new login, minutes of build. The three clicks start after that |
| **Windows 11 with WSL 2 and Docker** (the maintainer's own setup) | `install.ps1`, a Windows restart, creating the Ubuntu user, then `install.sh` inside Ubuntu [docs: docs/design/installer.md:35,125-153]. `install.ps1` has never run on a real Windows machine | 2 (3) once the stack runs | Windows features, the restart, the Ubuntu user name and password, virtualisation in the firmware: Windows and Microsoft's rules, not ours. Never in three clicks |
| **Windows desktop app** (upstream Tauri app, to be reused, decided 14 Nov) | It installs Podman and Bun and raises the stack, but has no `agent-freeduet`, looks for CopilotKit's releases and offers the plan-token sign-in above [docs: docs/design/installer.md:26,97] | not countable yet | Nothing runs FreeDuet's members in it today. The click flow of this note needs `agent-freeduet` first (the installer's spike, D1 there). Its own Claude sign-in must go (D5) |
| **macOS** | `install.sh` refuses it; Docker, Bash and Bun by hand [code: openbot/scripts/install.sh:173-176] | not countable | No installer, no CI run, no machine to test on [docs: README.md:172 "Platforms"]. The click flow is the same container code, so it should work once the stack runs, but that is [assumed] and not called supported until a run on a Mac |

What is honestly not reachable: the installer part on every platform, the Claude page itself (Claude's own sign-in, which may ask for a password, a code from an email or a second factor), and a person who has no Claude plan (the card says so and does not offer a key; keys stay off by default [docs: docs/PROVIDERS.md:9]).

## 3. How Claude gets installed without us shipping it, and how sign-in opens

### 3.1 Install

Anthropic's page says Claude Code is installed as published, unmodified, and that preinstalling or running it in a product needs its Commercial Terms [doc: https://code.claude.com/docs/en/legal-and-compliance]. FreeDuet therefore never puts the program in a file of this repository or in an image it publishes. Two cases:

- **Source install (today).** The person's own `docker compose build` runs Anthropic's npm package at a pinned version on the person's machine [code: openbot/agent-freeduet/Dockerfile:21-26]. Nothing changes. The button never has to install anything here. [assumed: this counts as the person installing it; D2 asks whether to keep that reading.]
- **Published images (installer Stage M, not built).** The image carries Node and npm but no Claude [code: openbot/agent-freeduet/Dockerfile:12-19 gives the node toolchain, 23 the Claude line to drop]. On the person's click, `agent-freeduet` runs `npm install --prefix /data/engines/claude @anthropic-ai/claude-code@<pinned version>` as user `freeduet` (uid 10001, no root, no sudo; the image has none [docs: CLAUDE.md "Adding a team member"]), into the `freeduet-data` volume so it survives an image update [code: openbot/docker-compose.yml:465]. Anthropic's page lists npm as a supported install that gives "the same native binary" [doc: https://code.claude.com/docs/en/setup]. `claude_bin()` then looks in two places, `CLAUDE_BIN`, then `/data/engines/claude/node_modules/.bin/claude`, then PATH, on every call, so no restart is needed [code: openbot/agent-freeduet/freeduet/claude_cli.py:107-108]. `DISABLE_AUTOUPDATER` stays set [code: openbot/agent-freeduet/freeduet/claude_cli.py:96-100]. Whether the package's post-install step needs scripts enabled, and its size and time, are [assumed] and a spike must measure them. The official install script is not used: a piped download is ruled out by the installer plan [docs: docs/design/installer.md:17], and the native installer updates itself in the background [doc: https://code.claude.com/docs/en/setup] against the pin (D3).

### 3.2 Sign-in, in a container, with the browser on the host

Facts. The CLI keeps its login in `CLAUDE_CONFIG_DIR` [doc: https://code.claude.com/docs/en/authentication]. On first run it opens a browser; if the browser cannot reach the CLI's local callback, "common in WSL2, SSH sessions, and containers", the page shows a code to paste into the terminal [doc: https://code.claude.com/docs/en/authentication]. `claude auth login` exists as its own command [doc: https://code.claude.com/docs/en/cli-reference]. Whether it needs a terminal (a pty) and what exact line holds the URL are [assumed]; the spike (S3) must record both with the pinned version.

Design.

1. **Who runs what.** `agent-freeduet` (inside its container, user `freeduet`, the same `CLAUDE_CONFIG_DIR` as every turn [code: openbot/docker-compose.yml:447]) starts `claude auth login` as a child, in its own session so stopping it stops everything under it, the way turns are stopped today [code: openbot/agent-freeduet/freeduet/claude_cli.py:186-200]. The environment is the allowlist the turns use, with no `ANTHROPIC_*` and no token variable [code: openbot/agent-freeduet/freeduet/claude_cli.py:90-121]. No Docker socket is needed and nothing runs on the host.
2. **The URL.** FreeDuet reads the child's output only to find one `https://` address, and shows it only if its host is on a short list (Claude's own hosts, [assumed] `claude.ai`, `claude.com`; the spike fixes the list). Anything else is refused and the card says the sign-in could not start. The address is a public authorisation link, not a credential.
3. **The browser on the host.** The page is in the person's browser, so the page opens the tab. The click on **Connect** calls `window.open` at once with a blank tab, then points it at the address when the server answers. [assumed: popup blockers allow a tab opened inside the click; if one blocks it, the card shows the same address as a link to press.] The desktop app does the same with `open_url` [code: openbot/desktop/src-tauri/src/main.rs:2979].
4. **The code.** If Claude's page shows a code, the person pastes it into one box on the card. The server passes it to the agent, which writes it to the child's input and forgets it: never stored, never logged, never in the audit trail, length-limited, once. FreeDuet never gets a token back. Afterwards the CLI has written its own login inside the volume. FreeDuet then runs the existing probe and reads `loggedIn` only [code: openbot/agent-freeduet/freeduet/claude_cli.py:323-333]. **This is the one place the design touches Anthropic's rule** "may not collect, store, or intermediate Claude.ai credentials or session tokens" [doc: https://code.claude.com/docs/en/legal-and-compliance]: a one-time authorisation code is not a token, but FreeDuet would carry it. D1 puts it to the maintainer, with the safe fallback built first: the card shows the exact command ready to copy and the person pastes the code in a terminal themselves.
5. **Limits.** One login at a time; ends after 10 minutes [assumed] or on **Cancel**; the person's pasted code is refused after the child has exited.
6. **Who may press.** The routes need an administrator at the computer, exactly as the Engines page's changes do: not a remote session, not a tunnel [code: openbot/server/src/freeduet/engines-routes.ts:480-484; at-the-computer.ts:1-25]. With sign-in on and a remote session, the card says to open FreeDuet on the computer.
7. **Hosted FreeDuet.** The hosted version must not offer sign-in with a Claude plan [docs: docs/ROADMAP.md:86]. No deployment switch for that exists today (a search of `server/src` and `shared` for "hosted" found only unrelated comments [code: openbot/server/src/app.ts:1562-1568]). The new routes check a setting on the server, `FREEDUET_DEPLOYMENT=hosted` ([assumed] name, D6), and answer 404 when it is set; the app also hides the button, but the server is what enforces it.

## 4. "Check again", with nothing restarted

**What holds state today.**

- The CLI and the login: nothing. A fresh process reads both at each turn (section 1). The person's next message already works after signing in, with no restart.
- The breaker's `signed_out` verdict and the last probe: `agent-freeduet`'s memory (`EngineState._probed`) [code: openbot/agent-freeduet/freeduet/engine_state.py:229,327-338,364-386]. `GET /engines` only reads it; nothing probes [code: openbot/agent-freeduet/freeduet/app.py:115-123]. A probe runs only inside the router, when a turn would walk past a `signed_out` engine, at most once a minute [code: openbot/agent-freeduet/freeduet/engine_router.py:92,253-263], and the router acts only for a member with a chain or a pin [code: openbot/agent-freeduet/freeduet/app.py:225-228]. So for the default member, a page showing "signed out" can stay stale, and the Engines page refreshes every 30 seconds from the same stale read [code: openbot/app/src/freeduet/engines-section.tsx:46-47].
- The server holds nothing about Claude; it forwards `GET /engines` [code: openbot/server/src/freeduet/engines-routes.ts:447-478].

**Design.** A new `POST /engines/claude/check` in agent-freeduet calls `EngineState.probe(ClaudeEngine())` [code: openbot/agent-freeduet/freeduet/engine_state.py:315-325], which stores the result and tells the breaker (`signed_in` clears `signed_out`) and returns `{installed, signedIn, version}`: no account, no email. The server exposes it as `POST /api/freeduet/engines/claude/check`, administrator at the computer, no payload. The card's **Check again** calls it and shows the answer in words; on "signed in" it offers **Send my message again**, reusing the retry the chat already has for a failed send [code: openbot/app/src/components/channels/channel-chat.tsx:1288-1300] [assumed: the retry fits a failed first message; S7 verifies]. The probe is 8 seconds at most [code: openbot/agent-freeduet/freeduet/claude_cli.py:77], so the button shows "Checking" and cannot be pressed twice. When Claude has just been installed, the probe finds it because the path is resolved on each call (3.1).

## 5. Failure messages in plain words

The app turns the engine reading and the run error into a card under the failed message. Interface text is English [docs: CLAUDE.md]. The current texts are in `claude_cli.py:39-42`, `claude_engine.py:108` and `claude_cli.py:262`.

| Situation | Words | Button beside it |
|---|---|---|
| Claude's program is missing (published image, build failed) | "Claude is not installed on this computer yet. FreeDuet can add it for you; it comes from Anthropic's own package." | **Install and connect** |
| The install failed: offline | "FreeDuet could not reach Anthropic's package server. Check the internet connection and try again." | **Try again** |
| The install failed: disk full or other | "The install stopped: there is not enough room on the disk." (one sentence per cause, never the raw output) | **Try again** |
| Installed, not signed in | "Claude is not connected yet. You sign in on Claude's own page; FreeDuet never sees your password." | **Connect your Claude plan** |
| Sign-in started, waiting for the person | "Finish signing in on Claude's page. If it shows a code, paste it here." | **Continue**, **Cancel** |
| The code was wrong or too late | "That code did not work. Start again to get a new one." | **Connect your Claude plan** |
| Sign-in page did not open | "Your browser blocked the page. Open it from this link." | the link, **Check again** |
| Signed in elsewhere but not seen | "FreeDuet cannot see the sign-in yet." | **Check again** |
| Signed in but the plan is at its limit | Not this card: the existing limit notice with its time [code: openbot/agent-freeduet/freeduet/claude_cli.py:221-226] | none |
| The account has no Claude plan | "This Claude account has no plan that can run FreeDuet. Choose another account." (the page's own message, never ours [assumed]) | **Connect your Claude plan** |
| Remote session, or not an administrator | "Connecting Claude is done at the computer FreeDuet runs on." | none |
| Hosted FreeDuet | no card: that deployment does not offer it | none |
| The agent does not answer | "FreeDuet's engine is not running." | **Check again** |

## 6. Security review, one line per hard rule

- **Never read, copy or forward subscription credentials.** The program reads only `loggedIn` and exit codes; it carries the one-time code in memory to the CLI's input and never stores it (the single point on this rule, D1). The token never leaves the CLI. Test: a canary code never appears in a file, log or audit row.
- **Never open the CLI's login or config directory.** Nothing in the design opens `~/.claude`; `claude auth status` is the CLI reading it [code: openbot/agent-freeduet/freeduet/claude_cli.py:336-340]. The install goes under `/data/engines/claude`, a different path and volume. Test: a scan fails on any open of `CLAUDE_CONFIG_DIR`.
- **The person signs in on Claude's own page.** FreeDuet only opens the address the CLI printed, from a short host list, in the person's own browser.
- **Logins first, no metered API by default.** The button writes no key and sets no `ANTHROPIC_*` variable; the child environment keeps the allowlist [code: openbot/agent-freeduet/freeduet/claude_cli.py:90-121]. Tests keep the existing check that no key reaches the child.
- **Third-party code is not shipped.** Nothing from Anthropic enters this repository or a published image; the install is the person's own, from the vendor's package, at a pinned version (D2, D3). NOTICE.md needs no new row [docs: NOTICE.md].
- **No Claude sign-in in the hosted cloud.** Enforced by the server routes (3.2 item 7), not by hiding a button. Test: with the setting on, every new route answers 404.
- **Approval for real account actions.** Connecting Claude is a setting on the person's own machine, not a send or a payment. It is still asked of the administrator at the computer only, and audited as "Claude connected" with no code in it.
- **Change only what was asked, minimal upstream.** New files are FreeDuet's own (`agent-freeduet/freeduet/`, `server/src/freeduet/`, `app/src/freeduet/`). The one upstream file touched is `app/src/lib/copilot/provider.tsx` or the chat screen's error slot (S5), with a row in `docs/UPSTREAM_TOUCHES.md`. No wizard step is added (D4), so `onboarding.tsx` stays untouched.
- **Command safety.** The child's command and arguments are fixed in code; the pasted code goes to its input, never to a shell or an argument list.

## 7. Slices, in build order

One PR each. S = under 300 changed lines, M 300 to 1000. "Sonnet" marks the delicate ones [docs: CLAUDE.md].

| # | Builds | Files it owns | Tests that prove it | Needs first | Size, who |
|---|---|---|---|---|---|
| S1 | **Check again, backend.** `POST /engines/claude/check` in the agent and `POST /api/freeduet/engines/claude/check` in the server | `agent-freeduet/freeduet/app.py`; `server/src/freeduet/engines-routes.ts`; two new test files | Agent: with a fake `claude` that flips from signed out to signed in, `GET /engines` says signed out, the POST says signed in and the next `GET` agrees, with no restart. Server: administrator at the computer only (remote, tunnel, non-admin refused); payload carries no account | nothing | S, Haiku with review |
| S2 | **Plain words and one status.** One module that turns the probe and the run error into the situations of section 5, in English; replace the three current sentences | `agent-freeduet/freeduet/engine_notices.py` or a new `claude_status.py`; `claude_cli.py` strings; their tests | Each row of section 5 reached by a fake CLI; no raw CLI output in any sentence; the existing pinned tests updated | S1 | S, Haiku |
| S3 | **Login child.** `claude_login.py`: starts `claude auth login`, finds the URL (host list), takes the code once, times out, cancels, never logs the code; endpoints `/claude/login/start`, `/code`, `/cancel`, `/status` | new `agent-freeduet/freeduet/claude_login.py`, `app.py` routes, fake-CLI fixtures | Fake login CLI prints a URL; a wrong host is refused; the code reaches the fake's input and appears nowhere in logs, files or the audit; second start while one runs is refused; stop kills the whole process group; no open of `CLAUDE_CONFIG_DIR` | S1; the spike of 3.2 (pty? URL line?) | M, **Sonnet** |
| S4 | **Server routes and the hosted gate.** Start, code, cancel under `/api/freeduet/engines/claude/login`; `FREEDUET_DEPLOYMENT=hosted` answers 404; audit event without the code | `server/src/freeduet/claude-login-routes.ts`; its mount in `app.ts` (one line, a row in UPSTREAM_TOUCHES); `docs/UPSTREAM_TOUCHES.md` | Administrator at the computer only; hosted setting makes every route 404; remote-session list in `createApp` updated so the test that lists routes passes [docs: CLAUDE.md "remote session"]; audit row has no code | S3 | M, **Sonnet** |
| S5 | **The card.** "Connect your Claude plan" in the chat under a failed turn and on the Engines page: states of section 5, `window.open` inside the click, the code box, **Cancel**, **Check again** | `app/src/freeduet/claude-connect-card.tsx` (new), a small hook in `channel-chat.tsx`'s error slot, `app/src/freeduet/engines-section.tsx` | App tests with a faked server: every row of section 5; the tab opens inside the press; the code is not kept in the query cache or storage | S2, S4 | M, Sonnet |
| S6 | **First message waits for Claude.** The first-day greeting does not send into a signed-out engine; after connect, the held message goes | `app/src/components/shell/first-day.tsx` hook, or the card; tests | Signed out: no greeting sent, card shown; connected: sent once; the claim [code: openbot/app/src/lib/channels/first-day-claim.ts:19] is not spent by a failed send | S5 | S, Haiku with review |
| S7 | **The words around it.** `start.sh` last line, the README Quick start and `install.sh`'s closing note say "open the app and press Connect Claude" and keep the terminal command as the fallback | `openbot/scripts/start.sh:659-662`, `README.md:143-153`, `openbot/scripts/install.sh` closing note, their tests | `start.sh` output test; clean-start check still green | S5 | S, Haiku |
| S8 | **Install on click** (only when published images exist): `claude_install.py`, path resolution in `claude_bin()`, the Dockerfile drops the Claude line for the published image | `agent-freeduet/freeduet/claude_install.py`, `claude_cli.py` (`claude_bin`), `agent-freeduet/Dockerfile`, `openbot/.github/published-images.json` if it changes | Fake npm: install runs as non-root, to the volume; offline and disk-full messages; the new path is found with no restart; the Dockerfile test shows no Claude in the published target | the installer's Stage M; D2, D3 | M, **Sonnet** |
| S9 | **Desktop app:** remove the Claude plan sign-in before a FreeDuet build ships it | part of the installer's spike, not this note | n/a | the installer's D1 | not here |

Order reason: S1 and S2 fix today's worst moment (a red sentence with a command) with no new risk. S3 to S5 are the click flow. S8 waits for published images; until then the source install already installs the program.

## 8. Decided

Decided by the maintainer on 16 November 2026: each took the recommendation written under it. The numbers D1 to D6 are this note's own, not those of `docs/M1_PLAN.md`; M1_PLAN records all six in one section, D54. Each decision stands alone.

**D1. May FreeDuet carry the one-time code from Claude's page to the CLI?**
**Decided (16 November 2026):** option (b). For now FreeDuet does not carry the one-time code. The card shows the command to copy and the person pastes the code in a terminal. Option (a), a box on the card, may be built only behind a setting that is off by default, and is switched on only after Anthropic answers in writing; the question is in the "Actions to take before launch" list of PROVIDERS.md.
Context: in a container the browser on the host cannot reach the CLI, so Claude's page shows a code that must reach the CLI. Anthropic's page forbids third parties from offering Claude.ai login in their apps and from intermediating Claude.ai credentials or session tokens, and allows the end user to sign in to the unmodified binary with their own plan [doc: https://code.claude.com/docs/en/legal-and-compliance].
Options: (a) a box on the card; the code goes server, agent, CLI input, nowhere stored; (b) the card shows the command to copy and the person pastes in a terminal (not three clicks, no code through FreeDuet); (c) (a) behind a setting off by default.
Recommendation: build (b) first in S5 and (a) behind a setting, then turn (a) on only after Anthropic answers in writing; add the question to the "Actions to take before launch" list in PROVIDERS.md. Why: it is the one place the design touches a rule that can get the person's account restricted; the cost of waiting is one extra terminal step for a few weeks.

**D2. Where Claude's program lives.**
**Decided (16 November 2026):** option (a). The program stays installed at build time for source builds; install on click only for published images (S8).
Context: today the image build installs it on the person's machine [code: openbot/agent-freeduet/Dockerfile:21-26]. Anthropic says preinstalling it in a product needs its Commercial Terms [doc: https://code.claude.com/docs/en/legal-and-compliance].
Options: (a) keep build-time install for source builds, install on click for published images; (b) install on click everywhere; (c) bake it into published images and sign the Commercial Terms.
Recommendation: (a). Why: no change for today's users; published images carry no Anthropic code, so no licence is needed to publish them; (b) adds a download for people who do not need one; (c) is a contract the project does not have.

**D3. How the click installs it.**
**Decided (16 November 2026):** option (a). The click installs it with npm at a pinned version.
Context: Anthropic documents an install script (self-updating) and an npm package (the same binary) [doc: https://code.claude.com/docs/en/setup]. The service pins the CLI version and turns its updater off [code: openbot/agent-freeduet/freeduet/claude_cli.py:96-100].
Options: (a) npm at a pinned version; (b) the official script; (c) ask the person to install it.
Recommendation: (a). Why: it keeps the pin and checks the package through npm; (b) is a piped download the installer plan rules out [docs: docs/design/installer.md:17]; (c) is not one button.

**D4. What "three clicks" counts, and the wizard.**
**Decided (16 November 2026):** option (a). The three clicks count from the open FreeDuet page, the card lives in the chat, and no wizard step is added. The roadmap row says so.
Context: the stack's install and start are terminal steps today. The onboarding wizard has six screens and none is about Claude [code: openbot/app/src/routes/_authed/onboarding.tsx:508-512,652-675].
Options: (a) count from the open page, put the card in the chat, add no wizard step; (b) count from the open page and add a "Connect Claude" wizard step first; (c) count from the installer.
Recommendation: (a), and say in the roadmap row that the count starts with the page open. Why: (b) adds a screen to the six and an upstream file change; (c) cannot be met on Windows (restart, Ubuntu user).

**D5. The upstream desktop app's Claude plan sign-in.**
**Decided (16 November 2026):** option (a). The upstream desktop app's Claude plan sign-in is removed in the desktop reuse spike, before any FreeDuet desktop build is published (S9).
Context: it mints a plan token and stores it as `CLAUDE_CODE_OAUTH_TOKEN` [code: openbot/desktop/src-tauri/src/env.rs:493-496]. PROVIDERS.md removes that option for FreeDuet [docs: docs/PROVIDERS.md:25].
Options: (a) remove it in the desktop reuse spike; (b) keep it for non-FreeDuet use.
Recommendation: (a), before any FreeDuet desktop build is published. Why: a FreeDuet build that keeps it breaks rule 1 in the one place the person clicks.

**D6. How hosted FreeDuet is told apart.**
**Decided (16 November 2026):** option (a). `FREEDUET_DEPLOYMENT=hosted`, default self-hosted, enforced by the server; built in S4.
Context: the hosted version must not offer sign-in with a Claude plan [docs: docs/ROADMAP.md:86]; no such switch exists.
Options: (a) a server setting `FREEDUET_DEPLOYMENT=hosted`, default self-hosted, enforced by the server; (b) a build flag; (c) decide it when the cloud is built.
Recommendation: (a), in S4. Why: the gate is a safety line, so it is cheap to build now and costs more to retrofit; the default keeps every current install unchanged.

## 9. What was not verified

- Nothing ran: no code, no test, no container, no Claude CLI. `claude auth login`'s behaviour in a container (pty, the URL line, the host list, the code prompt) is from Anthropic's pages only [doc: https://code.claude.com/docs/en/authentication, https://code.claude.com/docs/en/cli-reference].
- Whether `window.open` inside the click survives every browser's popup rules.
- npm's post-install step, size and time for the Claude package; the container's outbound access to the package server.
- Whether `docker compose exec` into a non-default compose project name fails the way section 1 step 6 says.
- Step counts are of the written path, not of a stopwatch run on a clean machine; the installer's own manual runs are still open [docs: docs/design/installer.md:106-117].
- The Anthropic pages were read through a page reader on 2026-11-15; their wording may change, as the rules in PROVIDERS.md say it must be re-read before each release.

## 10. Built so far

Slices S1 and S2 (branch `first-start-s1-s2`, merged) and, on branch `first-start-decisions-and-slices`, S4 and S5 in its option-(b) form. S3, S6, S7, S8 and S9 are not built.

**S1, Check again (backend): built.**

- Service: `POST /engines/claude/check` in `openbot/agent-freeduet/freeduet/app.py` runs `EngineState.probe(ClaudeEngine())`. Its answer holds `installed`, `signed_in`, `version` and `status`, and is sent with `Cache-Control: no-store`.
- Server: `POST /api/freeduet/engines/claude/check` in `openbot/server/src/freeduet/engines-routes.ts` (`checkClaude`) is guarded like the Engines page's changes: an administrator at the computer. It passes on only `installed`, `signedIn` and a `reason`, which is `null` when the check ran and otherwise `off`, `not_set_up` or `unreachable`. The version and the account stay in the service.
- The route falls under the existing refusal `ALL /api/freeduet/engines/*` (`openbot/server/src/auth/remote-limits.ts:250`), so no line was added to the remote list. The test "a remote session is refused by the list" pins that.
- New tests: `openbot/agent-freeduet/tests/test_engine_check.py` (5) and `openbot/server/tests/freeduet-engines-check.test.ts` (9).

**S2, plain words: built.**

- `openbot/agent-freeduet/freeduet/claude_status.py` (new) gives the probe one status, `missing`, `not_signed_in`, `signed_in` or `unknown`, and holds the two sentences below. `claude_cli.py` and `claude_engine.py` now use them in place of their three old sentences (`claude_cli.py:39-42`, `claude_engine.py:108`, `claude_cli.py:262`).
- The sentences a person reads, before and after:

| Situation | Before | After |
|---|---|---|
| Signed out | "Claude Code is not signed in. Sign in once with `docker compose exec -it agent-freeduet claude`, then send your message again." | "Claude is not connected yet. You sign in on Claude's own page; FreeDuet never sees your password. For now, run this once in a terminal, then send your message again: `docker compose exec -it agent-freeduet claude`" |
| Program missing | "Claude Code is not installed in this service." | "Claude is not installed on this computer yet. Rebuild the service with `bash scripts/start.sh`, then send your message again." |

- The missing sentence says what works today: rebuild the service with `bash scripts/start.sh`, the command that README.md:149 gives. It does not say "FreeDuet can add it for you", as section 5 row 1 does; that promise waits for D2 and D3 (S8).
- New tests: `openbot/agent-freeduet/tests/test_claude_status.py` (16). Pins moved to the new sentences: `test_segment_loop.py` (2), `test_app_hooks.py` (1) and six goldens, edited by hand and not regenerated. Each stream hash changed with its sentence.

**Decisions D1 to D6: all decided on 16 November 2026** (section 8).

| Decision | State |
|---|---|
| D1, the one-time code | Decided, option (b). No code passes through FreeDuet: the card shows the command, the person signs in in a terminal. Option (a) is not built; S3 would build it behind a setting that is off by default. |
| D2, where the program lives | Decided, option (a). S8 is not built; the missing sentence still promises no install. |
| D3, how the click installs | Decided, option (a). S8 is not built. |
| D4, what "three clicks" counts | Decided, option (a). The card is in the chat (S5); no wizard step was added; `onboarding.tsx` is untouched. |
| D5, the desktop app's plan sign-in | Decided, option (a). S9 is not started. |
| D6, the hosted switch | Decided, option (a), and built (S4 below). |

**Interim gap, decided by the maintainer (relayed by the coordinator): option (a).** Until the card (S5) exists, the signed-out sentence keeps the one command the old sentence had, so a person who reads only the chat can still sign in. S5 has landed and the app draws the card in place of the sentence, so the command is on screen once; the sentence in the service keeps the command for any other reader, and changing it means six hand-edited goldens, so it is left for S7. The command has no `cd openbot &&` in front, as the old sentence had; `README.md:150` and `start.sh` say to run it from `openbot/`, so the sentence and the README differ until the words are changed (S7).

**S4, the hosted switch (D6): built.**

- `openbot/server/src/freeduet/deployment.ts` (new): `deploymentOf(environment)` reads `FREEDUET_DEPLOYMENT`. Unset, empty or `self-hosted` is a person's own installation, which is every installation today. `hosted` is hosted. A value nobody knows counts as hosted, so a typo closes the safety line instead of opening it.
- With `hosted`, `POST /api/freeduet/engines/claude/check` answers 404 before any other question, and the agent is not asked. `GET /api/capabilities` carries `deployment: "hosted"` only then (the key is absent by default, so its pinned key list is unchanged); the app reads it to leave the card out.
- Slice S4's other parts (start, code and cancel routes, the audit event) are not built: they belong to S3, which D1(b) leaves unbuilt. The route list of `createApp` needed no line: the new switch adds no route, and the check route falls under the refusal `ALL /api/freeduet/engines/*`.
- `.env.example` has the commented setting.

**S5, the card, in its option-(b) form: built.**

- `openbot/app/src/freeduet/claude-connect.ts` (new, pure) holds the words, the two commands and the reading of the check's answer. `claude-connect-card.tsx` (new) is the card: it says in plain words that Claude is not connected (or not installed), shows the exact command to copy (`cd openbot && docker compose exec -it agent-freeduet claude`, or `bash scripts/start.sh` for a missing program), has Copy and **Check again**, and says the result in words (connected, sign-in not seen yet, still not installed, not at the computer, engine not running), in green when Claude is connected and in the app's existing problem red otherwise (grey while FreeDuet could not tell; the maintainer's look change of 16 November 2026, the sentence stays so colour is never the only signal). Main has no separate coral token, so the card uses `text-duet-red`, the status "problem" colour (5.4:1 green and 6.5:1 red on a light card, 9.8:1 and 6.2:1 on a dark one).
- It replaces the red sentence under a failed turn (`Stopped` in `chat-transcript.tsx`) when the sentence is one of the two the service gives for Claude (matched by its first words), and only once `/api/capabilities` has said this is not a hosted deployment; until then, and on a hosted deployment, the sentence stands alone. Any other stop reason is untouched.
- **Check again works with nothing restarted**: it calls `POST /api/freeduet/engines/claude/check` (S1), which probes now. The card has no input of any kind. It does not yet offer "Send my message again" (S6) and it is not on the Engines page.
- New tests: `server/tests/freeduet-claude-connect.test.ts` (10), `app/tests/freeduet-claude-connect-card.test.tsx` (11), `agent-freeduet/tests/test_no_code_route.py` (2, a guard of unchanged behaviour: the service has no login or code route and the check route ignores a body).

**Not built.**

- S3 (the login child and the code), S6, S7, S8 and S9; the install messages of section 5 (S8); the card's sentences for "the code was wrong", "the page did not open" and "no plan" (they belong to S3's flow). The card is not on the Engines page.
- "Signed in elsewhere but not seen" (a card state, S5), "the account has no Claude plan" (the CLI's wording is not known), and the remote, hosted and "agent does not answer" rows (S4 and S5).
- Old sentences still in code: `engine_notices.py` ("Claude Code is not signed in", pinned by `test_engine_router.py:283`), `compatible_engine.py` ("the Claude Code CLI is not installed in this service") and the generic "could not finish this turn" path.

**Not verified.**

- No live run: no container, no real `claude` binary, no browser. The probe was tested with a fake CLI whose answer changes between two calls.
- The server was tested in its targeted sets only, not in the full sharded suite.
