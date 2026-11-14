# Working on FreeDuet

This file is read by every Claude Code session that opens this repository. Keep it current: when a
session learns something the next one would otherwise rediscover the hard way, add it here.

## What this repository is

FreeDuet is a self-hosted team of AI employees: Iris (the head) and eleven members (Leo, Otto, Portia,
Penny, Jules, Wren, Gus, Basil, Vera, and, added after v0.1, Mark, the marketer, and Cam, the video maker). It is a thin fork of CopilotKit's OpenBot (under `openbot/`)
plus `openbot/agent-freeduet/`, a Python service (port 4230) that runs each member on the person's own
subscription login through a locked-down `claude -p`, with an MCP bridge for tools.

Read these before changing anything:

| File | What it holds |
|---|---|
| `docs/PROJECT.md` | Goals, rules, milestones M0–M5 |
| `docs/M1_PLAN.md` | Every decision (D1–D21) with its reason and limits |
| `docs/UPSTREAM_TOUCHES.md` | Every upstream OpenBot file FreeDuet changed, and why. Add a row for each new one |
| `docs/PROVIDERS.md` | Which engines are allowed and why (logins first) |
| `NOTICE.md` | Third-party code we carry and its licence |
| `evals/team/README.md` | The team evals: cases, live runner, thresholds |

## Rules that never bend

- **Logins first.** Members run on the person's subscription logins. A metered API is never first in
  any chain and never on by default. CopilotKit Intelligence is optional and off by default
  (`FREEDUET_INTELLIGENCE=off`, D20).
- **Third-party gateways are configuration only.** The engine plan is `docs/ENGINES_PLAN.md`: a
  gateway's code is never shipped, and AGPL gateway code is never copied.
- **Never read, copy or forward subscription credentials.** Never open the Claude CLI's login or
  config directories, in any container or volume.
- **No secrets and no personal data in the repository.** It has been public since 13 November 2026.
- **Public wording.** The repository, PR titles, docs and site never describe private sources of ideas
  or other private projects of the maintainer; the public comparison table (`docs/COMPARISON.md`) is fine.
- **The person's approval stays for real account actions** (sending email, payments, purchases). Team
  hand-offs along the hub grants (Iris ↔ members) are pre-approved (D21); delegation must never
  launder an account action. One exception, by the maintainer's decision (D27, D27a): the person's
  own written request is the approval. A NEW email goes out with no card when every recipient is
  typed in the person's latest message of their own live chat turn, directly or one hop through
  Iris; the server checks it, never the model. Everything else still asks: an address from a mail,
  a page or a tool, a corrected address, a routine, a check-in.
- **Full access** (`openbot/server/src/freeduet/full-access.ts`, `fullAccessOutcome` in
  `openbot/server/src/approvals/policy.ts`) is per person and per member, off by default, and applies
  only in the person's own live turn (a hand-off counts only when the server traces it to the person's
  typed message), never to routines. It has two settings besides off: Full access, which lifts only the
  payments safety requirement, and Full access without payments (D29), which lifts none, so a payment
  still asks. Credentials and security settings still go to the person in both. Plain Full access has
  no limit on the amount until spending caps exist (v0.4).
- **Change only what was asked.** A refactor nobody asked for is a regression risk.
- **Upstream changes stay minimal** and each one gets a row in `docs/UPSTREAM_TOUCHES.md`.

## How a session works here

The maintainer works in Italian and expects the session to act as the coordinator ("the brain, not
the hands"): plan, brief executors, verify with numbers, merge, report.

- **Executors.** Delegate implementation to subagents in their own worktrees. Haiku for well-scoped
  work, Sonnet for delicate runtime or security work. A brief states the goal, the evidence (with
  file:line), the files the executor owns and must not touch, the tests that must fail before and pass
  after, and the report format. Executors open the PR and stop: they do not wait on CI. Stop an
  executor as soon as it has delivered.
- **Parallel executors.** When several executors run at once, give each its own files: two executors
  must never own the same file.
- **Decision numbers.** When several executors work in parallel, the brief assigns each one its D-numbers,
  so no two executors pick the same number.
- **Worktree branches.** Create each executor's worktree on its own branch:
  `git worktree add -b <branch> <dir> origin/main`, then add the fetch refspec (see Git and pull
  requests). Never leave it detached: commits made on a detached HEAD get lost. The brief tells the
  executor to run `git branch --show-current` before it commits.
- **Verify before merging.** Re-run the executor's key tests yourself against a real Postgres and read
  the diff of anything security-related. Haiku sometimes misreports time ("waited three hours") or
  takes shortcuts (closing and reopening a PR to restart CI): check its claims.
- **Merge without asking.** When a pull request is ready (CI green and your own checks done), merge
  it and tell the maintainer afterwards. He asked for this on 2026-11-11, for the future too.
- **Token economy.** The maintainer pays for tokens. Do not react to every GitHub notification: check
  a PR once, when its CI has finished. Keep long conversations short-lived; hand off with a summary
  instead of letting one conversation grow past a few hundred thousand tokens.
- **Decisions belong to the maintainer** when they change product behaviour, security, cost, or
  anything public. Bring a recommendation and the trade-off, then wait.
- **Roadmap follows decisions at once.** When the maintainer takes a decision (a feature, a priority, a rule), update `docs/ROADMAP.md` in the same session, before reporting the decision as recorded, and the README roadmap table if a row there changes. A decision that is not in the roadmap is not recorded. (Asked on 2026-11-14.)

## Adding a team member

Mark (id `marketer`) was the first member added after v0.1, Cam (id `video`) the second. What a new member touches:

- `openbot/examples/freeduet/agents.yaml`: the entry (copy the shared-rules paragraph from Wren word
  for word, and the "Email." paragraph that stands before it from Penny, D30: only Otto sends email, and
  a test fails if another member's paragraph differs), and the team lists in Iris's and Leo's prompts
  (a test fails if Leo does not name him).
  `channels.yaml`: one channel. Hub grants and each person's conversation are built from the package,
  so nothing else wires him.
- `skills.yaml`: a skill's instructions can only be inline, there is no file reference. The loader
  expands `${NAME}` over the whole file and throws on one that is unset, so a third-party body that
  contains `${` breaks the load. A skill with `tools: []` reaches a run only as a `/` chip the
  person picks in the message box (`channel-chat` puts its text in front of the run); nothing else
  tells the model which skills it holds, so Mark's prompt says how to ask for one. The app loads
  every granted skill with its body for the `/` menu: his 53 add about 0.8 MB to that request.
- `evals/team/cases.yaml`: cases for the member, at least one `safety: true`. Pins to move with the
  count: `server/tests/freeduet-package.test.ts` (members), `freeduet-team.test.ts` (hub grants),
  `freeduet-person-language.test.ts` (prompts), and `evals/team/run.test.ts` (cases, safety cases,
  members, team channels, and the list of cases whose `[fixture: ...]` bracket has no `attachments`),
  `openbot/agent-freeduet/tests/test_report.py` and `openbot/scripts/freeduet-clean-start-check.sh`
  (members). Also `docs/TEAM.md`, `README.md`, `docs/CATALOG.md`, `docs/ROADMAP.md`, `docs/COMPARISON.md`
  and `docs/M0_DEMO.md` (case counts), `docs/PROJECT.md` (F20, the packs), `evals/team/README.md`, the
  two issue templates, `NOTICE.md` for third-party text. `site/` has its own copy of the roster.
- New cases are not certified until they run live on the eval stack. A case cannot send a skill picked
  with `/`, so it can only test what the member's own prompt says.
- A member that needs tools in his computer (Cam: ffmpeg, git, python3 with venv) gets them in the first
  `apt-get` line of `openbot/agent-computer/Dockerfile`, the image that Compose and the supervisor give
  each Bot (a Bot there runs as root with every capability dropped, `supervisor/src/docker.ts`, and the
  image has no sudo, so installing at run time is not something to rely on). The all-in-one
  `openbot/Dockerfile` is another image, where a Bot may `sudo apt-get`. Label the pull
  request `full-ci`, because `component dockerfiles` and `image` run only on main and on that label.
- A member hands a file to the person with `offer_file` (D38, `server/src/freeduet/member-files.ts`):
  a card with the name, the size and a Download button (`app/src/freeduet/member-file-card.tsx`) that
  fetches `GET /api/computers/:botId/files/download` as the signed-in person when it is pressed. The
  tool looks at the file through `computerGateway.downloadFile`, so the deployment's policy, the
  computer's confinement and its 100 MiB limit decide, and it moves no bytes. Chat attachments are
  still pictures and text, person to member only (`shared/attachments.ts`). A public member's computer
  is shared by everyone who can sign in, so any of them can press the button (`computer-access.ts`).
- `computer_run_command` has no timeout parameter and stops a command after about two minutes (and then
  kills its whole process group, `agent-computer/src/shell.ts`); every call goes through the approval
  gate. A member who renders starts long jobs in the background with the output sent to a file: a job
  that keeps the command's output open holds the command until the two minutes are over.
- An outside tool with split licences (Lemo-Opuscar: code MIT, every `*.md` CC BY-NC): wire it only as an
  optional tool the person installs, and write the skill text yourself; never copy or paraphrase its docs.

## Git and pull requests

- `gh pr create` and every GraphQL call fail in these sessions. Use REST:
  `gh api repos/MarcoDeliaBot/freeduet/pulls -f title=... -f head=<branch> -f base=main -f body=...`
  and merge with `gh api -X PUT repos/MarcoDeliaBot/freeduet/pulls/<n>/merge -f merge_method=merge -f sha=<head>`.
- A new branch needs its fetch refspec before stop hooks are happy:
  `git config --add remote.origin.fetch '+refs/heads/<b>:refs/remotes/origin/<b>'`, then
  `git push -u origin <b>` and `git branch -u origin/<b>`.
- `git fetch origin` (no arguments) fails once a branch that is not yet pushed has a fetch refspec:
  use `git fetch origin main`.
- Never rebase, amend or force-push a shared branch; merge `origin/main` into it instead. Never close
  and reopen a PR to restart CI. A job may be re-run once, after its run has completed.
- Commit messages and PR bodies end with the attribution lines the harness gives the session.

## CI

- `verify` aggregates the required jobs. The clean-start job (`openbot/scripts/freeduet-clean-start-check.sh`,
  no key, no sign-in) runs on main and on PRs labelled `full-ci`; `verify` requires it where it runs,
  and on other pull requests it is skipped and does not block.
- Known intermittent failures, re-run once before investigating: the all-in-one `image` job
  (`migrate` races the embedded Postgres start, 57P03, issue #50) and the app keyboard tests in
  `app/tests/live-screen-keyboard.test.tsx`.
- agent-freeduet tests: the settle timer (`segment.SETTLE_SECONDS`, 0.1 s in `fake_cli`) is a wall-clock
  race against the fake CLI's subprocess. A test or golden scenario whose CLI plays several steps and ends
  by itself sets `SETTLE_NEVER` (`tests/helpers.py`), so the CLI's result line ends the segment and no timer
  decides. Two such flakes cost CI re-runs on 14 November 2026 (`cli_runs differs from its golden`, and
  `assert ['computer_navigate'] == [...]` in `test_refused_offered_tool.py`).
- Real-browser tests (`computer (real browser)`): a browser asks for each page's `/favicon.ico` by itself,
  tens of milliseconds after the page and with as much jitter, so it lands on either side of a test's next
  step and is judged by the policy of the moment it arrives, like any request. A case that reads the
  proxy's request list across a policy change or a reset must not assert an exact list: it names the icons
  it can meet there (`askedFor` in `private-network-browser.test.ts`, whose third case failed 1 run in 10
  on a quiet machine and cost a CI re-run on 14 November 2026).
- The server suite runs in one process and every open pool is held to the end. CI Postgres has
  `max_connections=200`; locally the suite peaks near 90 connections. **Every test that opens a
  database pool closes it** (`await database.$client.close()`).
- `tests/assertion-shape.test.ts` has an allow-list with line numbers: editing a listed test file
  shifts them. It also rejects `?.` under `toBeUndefined` and `toBeFalsy`.
- `bun test` alone does not show every gate a new test file must pass. Also run
  `bun run typecheck:tests` from `openbot/`; its baseline is `server/tests/typecheck-baseline.txt`,
  and hand-edit a line there only when a baselined error's text changes. A `tsc` killed mid-run (exit 137, out of memory) now fails that gate with exit 2 and "tsc did not finish"; before, it passed as clean.
- Adding a value to a Postgres enum breaks `tests/schema.test.ts`.
- Some jobs run only on main (and on pull requests labelled `full-ci`): `component dockerfiles`,
  `image`, clean-start. A green pull request does not prove main is green: after a merge that adds a
  Dockerfile, a service or a compose change, look at main's own run. A new `*/Dockerfile` under
  `openbot/` must be added to `openbot/.github/published-images.json`.
- Biome runs from `openbot/`, not `openbot/server/`.

## Site (`site/`)

- No CI job covers `site/`: `site/index.html` is the build output and must equal a fresh build
  (`python3 site/tools/build.py site/src site/index.html`), and `node site/tools/checklang.js` checks that
  every language has the same keys and tags as English. Text-only changes must not touch layout, motion
  or spacing (PR #120 restyled the page on 2026-11-14), and in this sandbox the proxy returns 403 for
  Google Fonts, so screenshots need the fonts served locally.
- The build writes twelve pages (`site/index.html` and `site/<code>/index.html`) and `site/sitemap.xml`:
  commit all of them. `node site/tools/checklang.js` also runs `tools/checkpages.py`.

## Local testing

- Postgres 16 binaries are at `/usr/lib/postgresql/16/bin`. A sandbox running as root cannot `initdb`
  as root: reuse a running test cluster or start one as a non-root user. Point tests at it with
  `TEST_DATABASE_URL`. A fresh test database needs `bun scripts/migrate.ts` first, and that script
  reads `DATABASE_URL`, not `TEST_DATABASE_URL`: set both to the same database.
- A fresh git worktree has no `node_modules`: run `bun install --frozen-lockfile` in `openbot/` before
  any test, or the preload fails with "Cannot find package".
- With drizzle on Bun's SQL driver a `jsonb` parameter is sent as a JSON string: raw SQL must use
  `${JSON.stringify(x)}::text::jsonb`.
- In single-user mode the implicit administrator is this machine's loopback only (`server/src/auth/peer.ts`).
  `app.request(...)` in a test has no TCP peer and is nobody, so a test that needs the person passes
  `LOOPBACK_PEER` from `server/tests/support/loopback-peer.ts` as the third argument.
- The remaining gap in single-user mode is Docker Desktop: there containers appear as this machine's
  loopback, so who the person is still rests on network position alone. The planned fix, a
  per-installation secret, is tracked in `docs/ROADMAP.md`.
- In the sandbox the app suite fails about 138 tests on plain main: menus and popups do not open under
  happy-dom. Compare with main before blaming a change.
- A fresh worktree also needs `bun run generate:app-config` from `openbot/` before the app tests,
  or the suite stops early with "Cannot find module '@/lib/generated/application-config'".
- `bun run typecheck:tests` covers `server/tests` only. Three server tests fail in the sandbox on
  plain main (the two `learning-*` "real provider" tests and the Mastra bridge): compare with main.
- The Python harness (`openbot/agent-microsoft/requirements.txt`) is pinned since 2026-11-12: an
  unpinned upstream release turned `python harness regressions` red on every pull request. A red job
  in a service the diff does not touch may be dependency drift: compare the installed versions in
  the job log with the last green run.
- A session's server can restart and stop a background executor without a report. After a long
  silence, check `git status` in its worktree and resume it from its transcript.
- Gmail can be connected two ways. OAuth with the person's own Google Cloud project (`google-workspace`),
  or an app password plus an optional iCal secret link (`google-imap`, D24, the simple default for the
  public). An app password opens the whole mailbox, so the transport opens mailboxes read-only and
  replies only within existing threads.
- On this shared machine never use `pkill -f` with a pattern: stop only the PIDs you started, because
  other executors share the machine and the Postgres cluster.

## Things learned the hard way (Intelligence off, SSE mode)

- `Bun.serve` closes a connection silent for 10 s. Run and connect streams get our own keep-alive
  every 5 s (`server/src/freeduet/keep-alive.ts`); the runtime's own keep-alive is switched off.
- Stored runs must never get a synthetic `missing_terminal_event` result for a paused tool call
  (frontend tools, approvals). `sealRuns` only closes text, reasoning and tool-call ENDs.
- agent-freeduet ends a pause with a plain `RUN_FINISHED`; the approval interrupt is built on the
  OpenBot side by `HeadlessToolsMiddleware`.
- `PgAgentRunner.run()` starts the agent eagerly: a client that disconnects does not stop the run.
- A run needs its thread row first (`getOrCreateThread`); whoever takes the thread lock releases it.
- An exported `ANTHROPIC_BASE_URL` beats `.env`; the server pins the model base to agent-freeduet
  while the router is on (`server/src/freeduet/model-base.ts`).
- CopilotKit's runtime sends `licenseStatus` only with Intelligence on: identify the server by
  `/api/capabilities` instead.
- Hand-off turns differ on the computer (D22). The RELAY (the answer coming back to the Bot that asked,
  which runs in the person's own conversation) gets the member's computer tools through
  `toolsForTurn` in `server/src/agents/handoff-delivery.ts`, built like a routine's
  (`server/src/freeduet/relay-computer.ts`), approvals unchanged. The FORWARD hop (a scratch thread
  nobody sees) still runs with `tools: []`. When the person switches the computer or the browser off
  (`cloudComputer`, `cloudBrowser`, `cloudNetwork`, read per person through
  `enterpriseControls().capabilitiesFor`), NO server-run turn is offered the matching computer tools
  (`server/src/computer/offered.ts`, the rule of the app's `computerToolsOffered`); the gateway's
  refusal stays behind it, and `tool_notes.py` tells the member to say its browser is switched off in
  settings. The CLI answers a call for a tool the run did not list
  with "No such tool available" itself, so it reaches no stored transcript; agent-freeduet tells the
  member why (`tool_notes.py`) and logs it (`segment.py`).
- `server/src/approvals/policy.ts` `SAFETY_REQUIREMENTS` match words in a tool's reference. A catalogue
  key that contains "password", "credential" or "api-key" makes every write under it unapprovable
  ("changing a password is always done by the person"). That is why the app-password Gmail entry is
  keyed `google-imap` (D24). Test such changes through the real gate, not only `classifyTool`.

## Team evals

- Run on the separate eval stack (`openbot/scripts/freeduet-eval-stack.sh reset`; ports 3110, 3101,
  4231), never on a real deployment.
- `bun --env-file=openbot/.env.eval evals/team/run.ts --repeat 3` for certification, `--repeat 1` for
  quick checks. The runner clears memories between repeats and gives each turn 300 s (`--timeout`).
- A filtered run (`--member`, `--id`) writes `evals/team/reports/<date>-<engine>-partial.{json,md}`:
  a second filtered run on the same day overwrites it, so copy or read the report first. `reset`
  empties the eval database, so query it before resetting.
- Thresholds: each member at least 90%, safety cases 100%. A failure that repeats in every run is the
  member's prompt (`openbot/examples/freeduet/agents.yaml`); a failure that varies is usually the
  harness or the environment: check the eval database before blaming a member.
- `--cases <file>` writes the day's full (non-partial) report and overwrites a certification report from
  the same day. For a filtered run use `--id a,b` or `--member` instead.
- A `must` or `must_not` line has to stand on its own. The grader skipped "tells the person why" (no
  subject) in several runs. A check left without a verdict is retried once; its reason now says what
  the grader sent (#78, #80).
- The eval stack has no Gmail connected, so otto-4 and otto-5 are skipped ("needs Gmail"). Only Otto holds the send tools (D30): a case about Iris, Penny or any other member must not say `requires: [gmail]`, because the runner would skip it for ever, and a hop's tool calls are not in a case's transcript.
- A grader that fails is not a member that fails. A grader call that errors (HTTP 5xx, timeout,
  unreadable reply) is asked again, 4 calls at most; if none answers the run is `ungraded`, not
  failed. The thresholds say INCOMPLETE (exit code 2; FAIL is 1) while a safety run is ungraded or a
  case has no graded run. An INCOMPLETE run is not a certification: finish it with `--regrade`.
- Grade a saved report again without running the members:
  `bun --env-file=openbot/.env.eval evals/team/run.ts --regrade <report.json> --reason "..." [--id a,b]`.
  It calls no member, never changes the input, and marks each regraded case.
- Full reports in `evals/team/reports/` hold transcripts and the person's own name: never commit
  them. `bun evals/team/run.ts --public <report.json>` writes `<name>-public.{json,md}`, built by
  whitelist; only those are un-ignored. Check them for personal data before committing anyway.
- What code can read, code reads: a word or character limit goes under `measure:`, a sentence that
  must stand directly before the report under `position:` (checks.ts). The grader failed correct
  answers on both (wren-2 timed out counting, portia-1 failed a correct position three times in
  six). When a `must` line fails the same way in several runs, check the line before the member.
- On the maintainer's computer start anything that must outlive the Claude desktop app through
  `Invoke-CimMethod Win32_Process Create` (parent WmiPrvSE): an app update killed every `wsl`
  process started with `Start-Process`, and with them WSL, Docker and a two-hour eval run. When
  reading a long run, check the time of the log's last line, not only its counts.

## On the maintainer's computer

- The stack runs in WSL Ubuntu, with Docker inside WSL. A script started through `wsl.exe` that leaves
  processes running must end with `exec sleep infinity`, or WSL stops the distro when the last session
  ends and the stack dies.
- Start such scripts hidden from PowerShell with `Start-Process -WindowStyle Hidden wsl ...`.
- Write multi-line logic into a `.sh` file and run it. Inline regex through PowerShell breaks.
- A Windows watchdog restarts the stack whenever port 3010 stops answering. Before an update, expect it: stopping the
  stack by hand makes it run its own `start.sh` within a minute, and two starts collide once (container name conflict)
  before one wins. Back up the database first (`pg_dump -Fc` from the postgres container), then update.
