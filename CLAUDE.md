# Working on FreeDuet

This file is read by every Claude Code session that opens this repository. Keep it current: when a
session learns something the next one would otherwise rediscover the hard way, add it here.

## What this repository is

FreeDuet is a self-hosted team of AI employees: Iris (the head) and nine members (Leo, Otto, Portia,
Penny, Jules, Wren, Gus, Basil, Vera). It is a thin fork of CopilotKit's OpenBot (under `openbot/`)
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
  launder an account action.
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
- **Verify before merging.** Re-run the executor's key tests yourself against a real Postgres and read
  the diff of anything security-related. Haiku sometimes misreports time ("waited three hours") or
  takes shortcuts (closing and reopening a PR to restart CI): check its claims.
- **Token economy.** The maintainer pays for tokens. Do not react to every GitHub notification: check
  a PR once, when its CI has finished. Keep long conversations short-lived; hand off with a summary
  instead of letting one conversation grow past a few hundred thousand tokens.
- **Decisions belong to the maintainer** when they change product behaviour, security, cost, or
  anything public. Bring a recommendation and the trade-off, then wait.

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

- `verify` aggregates the required jobs. The clean-start job (`scripts/freeduet-clean-start-check.sh`,
  no key, no sign-in) runs on main and on PRs labelled `full-ci`; `verify` requires it where it runs,
  and on other pull requests it is skipped and does not block.
- Known intermittent failures, re-run once before investigating: the all-in-one `image` job
  (`migrate` races the embedded Postgres start, 57P03, issue #50) and the app keyboard tests in
  `app/tests/live-screen-keyboard.test.tsx`.
- The server suite runs in one process and every open pool is held to the end. CI Postgres has
  `max_connections=200`; locally the suite peaks near 90 connections. **Every test that opens a
  database pool closes it** (`await database.$client.close()`).
- `tests/assertion-shape.test.ts` has an allow-list with line numbers: editing a listed test file
  shifts them.
- Biome runs from `openbot/`, not `openbot/server/`.

## Local testing

- Postgres 16 binaries are at `/usr/lib/postgresql/16/bin`. A sandbox running as root cannot `initdb`
  as root: reuse a running test cluster or start one as a non-root user. Point tests at it with
  `TEST_DATABASE_URL`. A fresh test database needs `bun scripts/migrate.ts` first.
- With drizzle on Bun's SQL driver a `jsonb` parameter is sent as a JSON string: raw SQL must use
  `${JSON.stringify(x)}::text::jsonb`.

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
- A hand-off turn (the forward hop and the relay of the answer back to the asker) carries no computer
  tools: `server/src/agents/handoff-delivery.ts` runs it with `tools: []`. Routines, wake-ups, group
  turns and approval resumes get them (`toolsForTurn`). The CLI answers a call for a tool the run did
  not list with "No such tool available" itself, so it reaches no stored transcript; agent-freeduet
  tells the member why (`tool_notes.py`) and logs it (`segment.py`). Whether hand-offs should get the
  person's computer is the maintainer's decision (PR for `m1-computer-tools-turn`).

## Team evals

- Run on the separate eval stack (`openbot/scripts/freeduet-eval-stack.sh reset`; ports 3110, 3101,
  4231), never on a real deployment.
- `bun --env-file=openbot/.env.eval evals/team/run.ts --repeat 3` for certification, `--repeat 1` for
  quick checks. The runner clears memories between repeats and gives each turn 300 s (`--timeout`).
- Thresholds: each member at least 90%, safety cases 100%. A failure that repeats in every run is the
  member's prompt (`openbot/examples/freeduet/agents.yaml`); a failure that varies is usually the
  harness or the environment: check the eval database before blaming a member.
