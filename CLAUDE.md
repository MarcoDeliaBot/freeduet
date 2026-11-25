# Working on FreeDuet

This file is read by every Claude Code session that opens this repository. Keep it current: when a
session learns something the next one would otherwise rediscover the hard way, add it here.

## What this repository is

FreeDuet is a self-hosted team of AI employees: Iris (the head) and fifteen members (Leo, Otto, Portia,
Penny, Jules, Wren, Gus, Basil, Vera, and, added after v0.1, Mark, the marketer, Cam, the video maker, Rex, the model trainer, Ada, the web developer, Kai, the game and app developer, and Lumi, the graphic designer). It is a thin fork of CopilotKit's OpenBot (under `openbot/`)
plus `openbot/agent-freeduet/`, a Python service (port 4230) that runs each member on the person's own
subscription login through a locked-down `claude -p`, with an MCP bridge for tools.

Read these before changing anything:

| File | What it holds |
|---|---|
| `docs/PROJECT.md` | Goals, rules, milestones M0–M5 |
| `docs/M1_PLAN.md` | Every decision, numbered from D1 upward, with its reason and limits; there is no D23, and D53 is in `docs/design/mail-organise.md`. The highest number is found with the command below this table, and open pull requests may add more |
| `docs/UPSTREAM_TOUCHES.md` | Every upstream OpenBot file FreeDuet changed, and why. Add a row for each new one |
| `docs/PROVIDERS.md` | Which engines are allowed and why (logins first) |
| `NOTICE.md` | Third-party code we carry and its licence |
| `evals/team/README.md` | The team evals: cases, live runner, thresholds |

`docs/M1_PLAN.md` sections are out of numeric order on purpose (parallel work): "the last section" means the last one in the file; find it with `grep -n '^## ' docs/M1_PLAN.md | tail -1`. The highest decision number is found with `grep -o 'D[0-9]\+' docs/M1_PLAN.md | sort -t D -k2 -n | tail -1`.

## Rules that never bend

- **Logins first, by default.** Members run on the person's subscription logins, and in every chain the
  person has not reordered the router puts subscription logins first, then free engines, then metered ones
  (`engines.order_logins_first`). A metered API is never on by default and never first in such a chain. The
  person is free to choose the order of one member's engines (D115): an order that leaves that group order is
  written only after the person ticked "I understand, use this order" and pressed Confirm, the server never
  decides it, and it applies to that member alone (`own_order` in the engines file). It switches nothing on: a
  paid engine still runs only under the person's own `metered:` words and caps. CopilotKit Intelligence is optional and off in what the install
  scripts write (`FREEDUET_INTELLIGENCE=off`, D20); the server has no default and refuses a missing line (D65).
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
  The standing part of an executor's or a reviewer's instructions is in `.claude/agents/` (`executor-haiku`,
  `executor-sonnet`, `reviewer`); a brief adds only the task-specific part.
- **Parallel executors.** When several executors run at once, give each its own files: two executors
  must never own the same file.
- **No scheduling from executors (17 November 2026).** No executor or reviewer calls a scheduling, trigger or reminder tool: two Haiku executors created one-shot "placeholder" reminders by mistake on 17 November, and they fired into the coordinator's session. The same rule is in `.claude/agents/executor-haiku.md`, `executor-sonnet.md` and `reviewer.md`. Each of those files also has a `tools:` allowlist with no scheduling, trigger, Agent or MCP tool (24 November 2026), and says that a blocked command is reported, not retried in another form.
- **Token limits (16–17 November 2026).** A Haiku executor can stop with a weekly-limit error (HTTP 429) in the middle of a task. Its work so far stays in its worktree, uncommitted. Briefs ask every executor to commit early, so the coordinator resumes the same executor rather than starting a new one.
- **Haiku swarm (rule of 2026-11-15).** For humble work, send four to six Haiku executors at a time
  with maximum effort, never twenty: the sandbox has 2 CPUs and 7 GB, every executor runs tests, and
  each delivery must still be read and checked with numbers. Humble work is work whose files do not
  overlap: one site language per executor, new eval cases, extra tests on existing code, sweeps
  (broken links, counts in the docs). Approvals, mail, payments and data stay with Sonnet and a
  review. More code is not the bottleneck when what was merged has not been run live.
- **Haiku always on (rule of 2026-11-16).** While a session works on FreeDuet, Haiku executors at maximum
  effort are always at work on humble tasks, four to six at a time as the swarm rule says; when one
  delivers, the coordinator starts the next. When no humble task with files of its own is free (open
  pull requests own the files), an idle Haiku executor does a report-only sweep that edits nothing
  (broken links, stale counts, missing tests), and its report feeds the next pull request. When choosing the
  next humble task, prefer one that helps a built item run live (a script, a checklist, a measurement) over a
  new feature (D97, 18 November 2026): the roadmap holds dozens of items built and not run live. Sonnet and
  a review stay for approvals, mail, payments, data and security.
- **Decision numbers.** When several executors work in parallel, the brief assigns each one its D-numbers,
  so no two executors pick the same number. The same goes for sections of `docs/M1_PLAN.md`: parallel pull
  requests that each append a section conflict, so the brief gives each its section number, and the later one
  merges `origin/main` and keeps the file order (17 November 2026).
- **Worktree branches.** Create each executor's worktree on its own branch:
  `git worktree add -b <branch> <dir> origin/main`, then add the fetch refspec (see Git and pull
  requests). Never leave it detached: commits made on a detached HEAD get lost. The brief tells the
  executor to run `git branch --show-current` before it commits.
- **Worktree cleanup (rule of 2026-11-17).** Each worktree has its own `node_modules` (see Local
  testing), so kept worktrees use up disk space. After a pull request is merged, the coordinator removes
  that executor's worktree with `git worktree remove` only when `git merge-base --is-ancestor <branch>
  origin/main` succeeds and `git status` shows no change. A report-only executor reads files with
  `git show origin/main:<path>` and creates no worktree.
- **Verify before merging.** Re-run the executor's key tests yourself against a real Postgres and read
  the diff of anything security-related. Haiku sometimes misreports time ("waited three hours") or
  takes shortcuts (closing and reopening a PR to restart CI): check its claims. A brief's premise can be wrong
  too: the executor checks each finding against the code and says which it rejected or narrowed (several were,
  correctly, on 17 November 2026).
- **Whole server suite first.** A pull request that adds a file, a table or a route under `openbot/server` runs
  `bun run test:server:sharded` (from `openbot/`, about 10 minutes) before it is opened, or says that it did not; two pins on PR #318 were found by CI.
- **Shared network rules (17 November 2026).** `openbot/server/src/computer/policy-network.ts` imports
  `egressDecision` from `openbot/agent-computer/src/egress.ts`, and `openbot/server/src/admin/controls.ts` calls
  it for a page's host. So a change to `egress.ts` or `private-network.ts` also changes what the server decides:
  run the server suite too. PR #365 was red twice when only the agent-computer suite had run.
- **Review fingerprint (rule of 2026-11-16).** An independent review is valid only for the exact head sha it read. The
  reviewer writes that sha at the top of the report; a later push needs a review of the delta before the merge.
- **Re-check a figure before it goes on.** On 16 November 2026 `docs/M1_PLAN.md` said Leo was at 7,999 of 8,000
  characters; the measured value was 8,873 (`system_prompt` of `creator` in `openbot/examples/freeduet/agents.yaml`).
- **Cite by name, not by line.** Cite another document by its section name or decision id, never by line
  number: after one edit, 22 line citations of `docs/ENGINES_PLAN.md` pointed at the wrong lines (PR #364,
  17 November 2026).
- **Check each 'never' first.** A security sentence with 'never', 'always' or 'every' is checked against the
  code before it is written. On 17 November 2026 a report-only sweep found two exceptions to such sentences in
  the docs: the audit trail's retention delete, and loopback with the home-network switch. A review of PR #375 the same day found two more in the safety documents: "a trigger's address alone does not fire it" (an email trigger with no allowed senders was then started by a mail from anyone; D84 changed that on 18 November 2026) and "a member never types a password" (the refusal reads the page's markers only).
- **Merge without asking.** When a pull request is ready (CI green and your own checks done), merge
  it and tell the maintainer afterwards. He asked for this on 2026-11-11, for the future too.
- **Token economy.** The maintainer pays for tokens. Do not react to every GitHub notification: check
  a PR once, when its CI has finished. Keep long conversations short-lived; hand off with a summary
  instead of letting one conversation grow past a few hundred thousand tokens.
- **Decisions belong to the maintainer** when they change product behaviour, security, cost, or
  anything public. Bring a recommendation and the trade-off, then wait.
- **Go with the recommendation (rule of 2026-11-16).** When you bring the maintainer a choice with a recommendation, start on the recommendation at once and tell him afterwards; do not stop the work to wait. Two exceptions still wait for his explicit yes: a change to the look of the public site or of the app (preview first), and anything that costs money. An ambiguous "ok" never covers those two: ask which item it means.
- **Roadmap follows decisions at once.** When the maintainer takes a decision (a feature, a priority, a rule), update `docs/ROADMAP.md` in the same session, before reporting the decision as recorded, and the README roadmap table if a row there changes. A decision that is not in the roadmap is not recorded. (Asked on 2026-11-14.)
- **Site and app previews.** A design change to the site or the app is shown to the maintainer first, as a preview: Cloudflare Pages builds `https://<branch>.freeduet.pages.dev` for every branch, and the change goes online only after the maintainer's yes. Executors' site PRs conflict on the built pages, so the second one merges `origin/main` and rebuilds before it opens.

## Git and pull requests

- `gh pr create` and every GraphQL call fail in these sessions. Use REST:
  `gh api repos/MarcoDeliaBot/freeduet/pulls -f title=... -f head=<branch> -f base=main -f body=...`
  and merge with `gh api -X PUT repos/MarcoDeliaBot/freeduet/pulls/<n>/merge -f merge_method=merge -f sha=<head>`.
- A draft PR cannot be marked ready through REST: push the same commits to a new branch, open a normal PR from it, and close the draft.
- A new branch needs its fetch refspec before stop hooks are happy:
  `git config --add remote.origin.fetch '+refs/heads/<b>:refs/remotes/origin/<b>'`, then
  `git push -u origin <b>` and `git branch -u origin/<b>`.
- `git fetch origin` (no arguments) fails once a branch that is not yet pushed has a fetch refspec:
  use `git fetch origin main`.
- Never rebase, amend or force-push a shared branch; merge `origin/main` into it instead. Never close
  and reopen a PR to restart CI. A job may be re-run once, after its run has completed.
- Commit messages and PR bodies end with the attribution lines the harness gives the session.
- Worktrees share `refs/remotes/origin/main`: another executor's `git fetch origin main` moves it under you, so run `git rev-list --left-right --count origin/main...HEAD` right before a push.
- Rows appended to `docs/UPSTREAM_TOUCHES.md` conflict between parallel PRs: keep main's rows first, then your own.
- `git merge --no-edit` leaves `# Conflicts:` lines in the merge message, and `git commit --no-edit` keeps them: finish a conflicted merge with `git commit -m '<message>'`.
- The platform rewrites the last attribution line of a PR body. That is expected, so do not retry the edit.


## When to read the other files (docs/dev/)

This file holds only what every session needs every time. The rest moved, unchanged in meaning, to files under `docs/dev/`: read the one that matches your task before you start. Other documents that cite a section of the old long `CLAUDE.md` by name ("CI", "Local testing", "Adding a team member", "Team evals", and so on) mean the file below.

- Adding or changing a team member, his prompt, skills, computer or files: `docs/dev/adding-a-member.md`.
- Touching CI, a workflow, a Dockerfile, the installer, or a failing or flaky check: `docs/dev/ci.md`.
- Changing anything under `site/`: `docs/dev/site.md`.
- Running tests in a worktree or sandbox (Postgres, `node_modules`, app config, gates a new test must pass): `docs/dev/local-testing.md`.
- Changing the server's run, stream, approval, hand-off, sign-in or Intelligence-off code: `docs/dev/lessons-intelligence-off.md`.
- Running, writing or reading team evals: `docs/dev/evals.md`.
- Updating, restarting or debugging the stack on the maintainer's computer: `docs/dev/maintainers-pc.md`.
