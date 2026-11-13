# Working on FreeDuet

This file is read by every Claude Code session that opens this repository. Keep it current: when a
session learns something the next one would otherwise rediscover the hard way, add it here.

## What this repository is

FreeDuet is a self-hosted team of AI employees: Iris (the head) and ten members (Leo, Otto, Portia,
Penny, Jules, Wren, Gus, Basil, Vera, and Mark, the marketer, added after v0.1). It is a thin fork of CopilotKit's OpenBot (under `openbot/`)
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
- **Never read, copy or forward subscription credentials.** Never open the Claude CLI's login or
  config directories, in any container or volume.
- **No secrets and no personal data in the repository.** It will become public at v0.1.
- **The person's approval stays for real account actions** (sending email, payments, purchases). Team
  hand-offs along the hub grants (Iris ↔ members) are pre-approved (D21); delegation must never
  launder an account action. One exception, by the maintainer's decision (D27, D27a): the person's
  own written request is the approval. A NEW email goes out with no card when every recipient is
  typed in the person's latest message of their own live chat turn, directly or one hop through
  Iris; the server checks it, never the model. Everything else still asks: an address from a mail,
  a page or a tool, a corrected address, a routine, a check-in.
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

## Adding a team member

Mark (id `marketer`) was the first member added after v0.1. What a new member touches:

- `openbot/examples/freeduet/agents.yaml`: the entry (copy the shared-rules paragraph from Wren word
  for word), and the team lists in Iris's and Leo's prompts (a test fails if Leo does not name him).
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
  members, team channels). Also `docs/TEAM.md`, `README.md`, `docs/CATALOG.md`, the two issue
  templates, `NOTICE.md` for third-party text. `site/` has its own copy of the roster.
- New cases are not certified until they run live on the eval stack.

## Git and pull requests

- `gh pr create` and every GraphQL call fail in these sessions. Use REST:
  `gh api repos/MarcoDeliaBot/freeduet/pulls -f title=... -f head=<branch> -f base=main -f body=...`
  and merge with `gh api -X PUT repos/MarcoDeliaBot/freeduet/pulls/<n>/merge -f merge_method=merge -f sha=<head>`.
- A new branch needs its fetch refspec before stop hooks are happy:
  `git config --add remote.origin.fetch '+refs/heads/<b>:refs/remotes/origin/<b>'`, then
  `git push -u origin <b>` and `git branch -u origin/<b>`.
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
- The server suite runs in one process and every open pool is held to the end. CI Postgres has
  `max_connections=200`; locally the suite peaks near 90 connections. **Every test that opens a
  database pool closes it** (`await database.$client.close()`).
- `tests/assertion-shape.test.ts` has an allow-list with line numbers: editing a listed test file
  shifts them. It also rejects `?.` under `toBeUndefined` and `toBeFalsy`.
- `bun test` alone does not show every gate a new test file must pass. Also run
  `bun run typecheck:tests` from `openbot/`; its baseline is `server/tests/typecheck-baseline.txt`,
  and hand-edit a line there only when a baselined error's text changes.
- Adding a value to a Postgres enum breaks `tests/schema.test.ts`.
- Some jobs run only on main (and on pull requests labelled `full-ci`): `component dockerfiles`,
  `image`, clean-start. A green pull request does not prove main is green: after a merge that adds a
  Dockerfile, a service or a compose change, look at main's own run. A new `*/Dockerfile` under
  `openbot/` must be added to `openbot/.github/published-images.json`.
- Biome runs from `openbot/`, not `openbot/server/`.

## Local testing

- Postgres 16 binaries are at `/usr/lib/postgresql/16/bin`. A sandbox running as root cannot `initdb`
  as root: reuse a running test cluster or start one as a non-root user. Point tests at it with
  `TEST_DATABASE_URL`. A fresh test database needs `bun scripts/migrate.ts` first, and that script
  reads `DATABASE_URL`, not `TEST_DATABASE_URL`: set both to the same database.
- A fresh git worktree has no `node_modules`: run `bun install --frozen-lockfile` in `openbot/` before
  any test, or the preload fails with "Cannot find package".
- With drizzle on Bun's SQL driver a `jsonb` parameter is sent as a JSON string: raw SQL must use
  `${JSON.stringify(x)}::text::jsonb`.
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
- The eval stack has no Gmail connected, so otto-4 and penny-5 are skipped ("needs Gmail").
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
