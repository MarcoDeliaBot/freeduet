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
| `docs/M1_PLAN.md` | Every decision, numbered from D1 upward, with its reason and limits; there is no D23, and D53 is in `docs/design/mail-organise.md`. The highest number is found with the command below this table, and open pull requests may add more |
| `docs/UPSTREAM_TOUCHES.md` | Every upstream OpenBot file FreeDuet changed, and why. Add a row for each new one |
| `docs/PROVIDERS.md` | Which engines are allowed and why (logins first) |
| `NOTICE.md` | Third-party code we carry and its licence |
| `evals/team/README.md` | The team evals: cases, live runner, thresholds |

`docs/M1_PLAN.md` sections are out of numeric order on purpose (parallel work): "the last section" means the last one in the file; find it with `grep -n '^## ' docs/M1_PLAN.md | tail -1`. The highest decision number is found with `grep -o 'D[0-9]\+' docs/M1_PLAN.md | sort -t D -k2 -n | tail -1`.

## Rules that never bend

- **Logins first.** Members run on the person's subscription logins. A metered API is never first in
  any chain and never on by default. CopilotKit Intelligence is optional and off in what the install
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
- **No scheduling from executors (17 November 2026).** No executor or reviewer calls a scheduling, trigger or reminder tool: two Haiku executors created one-shot "placeholder" reminders by mistake on 17 November, and they fired into the coordinator's session. The same rule is in `.claude/agents/executor-haiku.md`, `executor-sonnet.md` and `reviewer.md`.
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
  (broken links, stale counts, missing tests), and its report feeds the next pull request. Sonnet and
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
  every granted skill with its body for the `/` menu: his 60 add about 0.85 MB (852,457 bytes, measured on 16 November 2026) to that request.
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

## CI

- `verify` aggregates the required jobs. The clean-start job (`openbot/scripts/freeduet-clean-start-check.sh`,
  no key, no sign-in) runs on main and on PRs labelled `full-ci`; `verify` requires it where it runs,
  and on other pull requests it is skipped and does not block.
- `installer-clean-machine` runs `openbot/scripts/install.sh` in fresh `ubuntu:22.04` and `ubuntu:24.04` containers (no privilege, no Docker daemon), on main and on PRs labelled `full-ci`, like clean-start. Green means the installer stops at the Docker start with its reason, as built; it does not prove Docker, the first start or WSL (`docs/design/installer.md`, section 11).
- `installer-windows` runs the Pester tests of `openbot/scripts/install.Tests.ps1` and then `install.ps1` itself (`-Check`, then `-Yes`, as the runner's elevated user and as a fresh standard local user) on a GitHub-hosted `windows-latest` runner, on main, on `workflow_dispatch` and on PRs labelled `full-ci`, like installer-clean-machine (`verify` requires it where it runs). It writes in the job summary how far each run got and the script's own stop line, and uploads the transcripts; a stop that `install.ps1` explains is a pass, an unexplained error or a failed Pester test is a failure. The runner image is printed in the summary. It does not prove a person's PC, the Windows restart, the Ubuntu user step, Docker or the first start (`docs/design/installer.md`, section 11).
- `desktop-crate` runs `cargo check --locked` and `cargo test --locked` for `openbot/desktop/src-tauri` on Linux with Rust 1.88.0 and Bun 1.4.3 (the lock needs Rust 1.88.0, and `Cargo.toml` still declares 1.77; the credential-lock test starts `bun`), on main and on PRs labelled `full-ci`, like clean-start. It proves a Linux build and its tests, not Windows, macOS, packaging or a first start (`docs/design/installer.md`, section 11).
- The `full-ci` label must be on the pull request BEFORE the push that should run the labelled jobs;
  adding the label afterwards starts nothing. So for a pull request that needs them (a Dockerfile, the
  installer, the Windows programs helper in `openbot/scripts/programs-helper`), open the pull request,
  set the label, then push the work. Never push an empty commit to start CI (seen on PR #325,
  16 November 2026).
- Known intermittent failures, re-run once before investigating: the all-in-one `image` job
  (`migrate` races the embedded Postgres start, 57P03, issue #50) and the app keyboard tests in
  `app/tests/live-screen-keyboard.test.tsx`.
- A `startup (macos-latest)` job cancelled after about 15 minutes with no steps or runner ("The job was not acquired
  by Runner of type hosted", 16 November 2026) means GitHub gave no macOS arm64 runner. No workflow change fixes it: re-run the failed jobs once.
- A cancel after a few minutes with "higher priority waiting request" is the concurrency group `ci-${{ github.ref }}`
  (`.github/workflows/ci.yml:23`) cancelling an older commit of the same pull request, as intended (PR #318).
  A red `verify` on an older head, after a newer push, is the same cancellation: `verify` fails on any
  cancelled job, so read the checks of the current head only.
- agent-freeduet tests: the settle timer (`segment.SETTLE_SECONDS`, 0.1 s in `fake_cli`) is a wall-clock
  race against the fake CLI's subprocess. A test or golden scenario whose CLI plays several steps and ends
  by itself sets `SETTLE_NEVER` (`tests/helpers.py`), so the CLI's result line ends the segment and no timer
  decides. Two such flakes cost CI re-runs on 14 November 2026 (`cli_runs differs from its golden`, and
  `assert ['computer_navigate'] == [...]` in `test_refused_offered_tool.py`).
- Heartbeat tests (`openbot/server/tests/routine-run-turn.test.ts`): a renewal count taken after a fixed
  `setTimeout` is a wall-clock race, because the heartbeat ticks on a `setInterval` (`keepLease`,
  `openbot/toolkit/src/lease.ts`) and a slow runner fits fewer ticks into that window. One such assertion
  ("a heartbeat that merely failed does not stop the turn") failed on PR #297 on 16 November 2026 with one
  renewal, and passed on the re-run. A test never counts timer ticks against the wall clock: it waits for
  the Nth event (a promise the fake resolves on the Nth renewal) and asserts after that.
- Real-browser tests (`computer (real browser)`): a browser asks for each page's `/favicon.ico` by itself,
  tens of milliseconds after the page and with as much jitter, so it lands on either side of a test's next
  step and is judged by the policy of the moment it arrives, like any request. A case that reads the
  proxy's request list across a policy change or a reset must not assert an exact list: it names the icons
  it can meet there (`askedFor` in `private-network-browser.test.ts`, whose third case failed 1 run in 10
  on a quiet machine and cost a CI re-run on 14 November 2026).
- A test never dials an address that nobody owns, such as a private LAN address: on the CI runner it hangs
  to bun's 5 s limit instead of failing fast (PR #365, 17 November 2026).
- Reads of a page that keeps navigating (`computer (real browser)`): Playwright's `ariaSnapshot` waits 30 s by
  default and retries across every navigation, so a call without its own `timeout` outlives the settle budget
  (`openbot/agent-computer/src/settle.ts`). Pass the budget to each call that can wait on a moving page.
- The server suite runs in one process and every open pool is held to the end. CI Postgres has
  `max_connections=200`; locally the suite peaks near 90 connections. **Every test that opens a
  database pool closes it** (`await database.$client.close()`).
- `tests/assertion-shape.test.ts` has an allow-list with line numbers: editing a listed test file
  shifts them. It also rejects `?.` under `toBeUndefined` and `toBeFalsy`.
- `bun test` alone does not show every gate a new test file must pass. Also run
  `bun run typecheck:tests` from `openbot/`; its baseline is `server/tests/typecheck-baseline.txt`,
  and hand-edit a line there only when a baselined error's text changes. A `tsc` killed mid-run (exit 137, out of memory) now fails that gate with exit 2 and "tsc did not finish"; before, it passed as clean.
- Adding a value to a Postgres enum breaks `tests/schema.test.ts`.
- A new file under `openbot/server/src/` that names the installation secret breaks the crawl in
  `openbot/server/tests/install-secret.test.ts` (12 files pinned). Derive its type from `atTheComputer`, as `programs/routes.ts` does.
- A foreign key to `users.id`, or a text-like column named like a person, must be in `openbot/server/src/freeduet/adopt/registry.ts`
  and in section 2.2 of `docs/design/single-user-to-sign-in.md` (its foreign-key count too), or `single-user-adoption-registry.test.ts` fails.
- A foreign key to `users.id` is never in `LEAVE`, whatever its delete rule.
- Some jobs run only on main (and on pull requests labelled `full-ci`): `component dockerfiles`,
  `image`, clean-start. A green pull request does not prove main is green: after a merge that adds a
  Dockerfile, a service or a compose change, look at main's own run. A new `*/Dockerfile` under
  `openbot/` must be added to `openbot/.github/published-images.json`.
- Biome runs from `openbot/`, not `openbot/server/`.
- Before a push, run the two commands that the `format, lint, types` job runs, from `openbot/`: `bun run format:check` (`bunx biome format .`) and `bun run lint` (`bunx biome lint --error-on-warnings .`, so a warning fails too; `.github/workflows/ci.yml:42-43`, `openbot/package.json:19-20`). On 17 November 2026 PR #347 failed at the format step, and the steps after it were skipped.
- The `tests` CI job installs neither Hono nor Dockerode, so supervisor tests that start a real process go on the `types (supervisor)` job's `bun test` line in `.github/workflows/ci.yml`.
- `audit_events` is append-only (a trigger refuses every UPDATE, and every DELETE except a retention sweep's delete of rows older than its window, `openbot/server/src/audit-retention.ts`) and nothing is cleaned between cases, so a test that counts audit rows uses fresh addresses per test.
- Some phrases in the comments of `openbot/agent-freeduet/engines.example.yaml` are pinned by `openbot/agent-freeduet/tests/test_compatible_engine_file.py`: check that test before rewording one.
- Still load-sensitive after 14 November 2026 (measured under two busy loops on the shared two-core runner): `tool-selection-environment-restoration` (25 s, each case boots a child `bun test`), `sole-definition` (45 s, walks the source trees) and the explicit timeouts on `production-loader-boundary` (kill 25 s), `plugin-store.integration`, `composio-transport`, `assertion-shape`, `start-restart-guard` (D25) and `app-access-action`; a case past its bound is real slowness, not a flake.
- CodeQL reports a regular expression that pulls `<script>` out of HTML as a high alert, also in a test
  file (PR #325, `openbot/server/tests/programs-pairing.test.ts`, 16 November 2026). A test does not
  extract HTML with a regular expression: it compares against the exact string exported by the source.
- A check whose conclusion is `neutral` is not a failure. CodeQL reported `neutral`, with the title "1 configuration not found", on PR #350, which changes only `NOTICE.md` (17 November 2026).

## Site (`site/`)

- No CI job covers `site/`: `site/index.html` is the build output and must equal a fresh build
  (`python3 site/tools/build.py site/src site/index.html`), and `node site/tools/checklang.js` checks that
  every language has the same keys and tags as English. Text-only changes must not touch layout, motion
  or spacing (PR #120 restyled the page on 2026-11-14), and in this sandbox the proxy returns 403 for
  Google Fonts, so screenshots need the fonts served locally.
- The build writes twelve pages (`site/index.html` and `site/<code>/index.html`) and `site/sitemap.xml`:
  commit all of them. `node site/tools/checklang.js` also runs `tools/checkpages.py`.
- Each FAQ answer (keys `a1` to `a8`) appears twice in a built page: as visible text (`data-i` in
  `site/src/body.html`) and in the FAQPage JSON-LD built from the same key (`site/tools/build.py:269-271`),
  so a change to an answer key changes both. `site/tools/checkpages.py:14-15` checks that they match.
- The three cards that show the `tagRel` badge (`site/src/body.html:241`, `:264`, `:321`) share one key.
  When one card's badge must read differently, add a new key to all twelve `site/src/lang/*.json` files:
  `node site/tools/checklang.js` requires the same keys in every language (`site/tools/checklang.js:12-17`).

## Local testing

- Postgres 16 binaries are at `/usr/lib/postgresql/16/bin`. A sandbox running as root cannot `initdb`
  as root: reuse a running test cluster or start one as a non-root user. From a root sandbox,
  `runuser -u postgres -- /usr/lib/postgresql/16/bin/initdb -D <dir> --auth=trust` creates a throwaway
  cluster as the `postgres` user: pass each argument as its own word (one quoted string fails with
  "No such file or directory"), and `--auth=trust` asks for no password. Point tests at it with
  `TEST_DATABASE_URL`. A fresh test database needs `bun scripts/migrate.ts` first, and that script
  reads `DATABASE_URL`, not `TEST_DATABASE_URL`: set both to the same database.
- `migrate.ts` lives in `openbot/server/scripts`: run it from `openbot/server`, as `bun scripts/migrate.ts`.
- A fresh git worktree has no `node_modules`: run `bun install --frozen-lockfile` in `openbot/` before
  any test, or the preload fails with "Cannot find package".
- With drizzle on Bun's SQL driver a `jsonb` parameter is sent as a JSON string: raw SQL must use
  `${JSON.stringify(x)}::text::jsonb`.
- In single-user mode the implicit administrator is this machine's loopback only (`server/src/auth/peer.ts`).
  `app.request(...)` in a test has no TCP peer and is nobody, so a test that needs the person passes
  `LOOPBACK_PEER` from `server/tests/support/loopback-peer.ts` as the third argument.
- On Docker Desktop a container's call arrives as this machine's loopback, so single-user mode also asks for
  the installation secret (D28, `server/src/auth/install-secret.ts`): a loopback request without it is refused
  with 401 `pairing_required` on every person-only route. It is built and tested, but not yet run on Docker
  Desktop itself (`docs/ROADMAP.md`, the row on the per-installation secret).
- With `bun run generate:app-config` run first, `bun test app/` from `openbot/` passes in full on main: 3061 pass, 0 fail in 321 files (16 November 2026, PR #292).
- A fresh worktree also needs `bun run generate:app-config` from `openbot/` before the app tests,
  or the suite stops early with "Cannot find module '@/lib/generated/application-config'".
- In this sandbox Playwright needs `PLAYWRIGHT_BROWSERS_PATH=/tmp/pn-pw-browsers`: `/opt/pw-browsers` holds Chromium 1243, and Playwright 1.62 asks for revision 1234, which only the shim maps.
- CI runs the `agent-freeduet` and `python harness regressions` jobs on Python 3.12; this sandbox's default `python3` is 3.13.
- `bun test <x>` filters by a substring of the file path, run from `openbot/`: `bun test freeduet-team-file` runs every test file whose path contains that text, the `-export` files included, so one name can run more than one file.
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
- Under load, `production-loader-boundary`, `tool-selection-environment-restoration`, `assertion-shape` and the D25 case of `openbot/scripts/start-restart-guard.test.ts` can exceed bun's 5 s test limit; they fail the same way on main, so compare with main first.
- Under Bun, a fake upstream proxy in a test must be a raw `net` server: the socket that an `http` server's `connect` handler receives emits only `end`.
- `bun test tests/` matches every `tests/` folder below the directory bun runs in (`server/tests/` too), so name the file when you mean one file.
- `bun script.ts` loads the `.env` of the current folder into `process.env` even when nothing was exported; a script that must tell an exported value from one written in `.env` reads `/proc/self/environ`, or runs with `--no-env-file`.
- The agent-freeduet suite on Python 3.12 takes about 4 minutes, and the sharded server suite (`bun run test:server:sharded`) about 10.
- In a test, pass the coworker object to `createApp(...)` as `never`, as `server/tests/openduet-setup.test.ts` does: it is parameter 35, and every parameter from 4 on is optional, so a wrong count still type-checks.
- A test that mocks `dockerode` and imports `../src/docker` shares the module cache with the other files: import it with a unique query (`../src/docker?<name>`, as `supervisor/tests/computer-token-ensure.test.ts` does).

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
- `localRuntimeFrom` (`openbot/server/src/freeduet/intelligence-switch.ts`) REFUSES a missing
  `FREEDUET_INTELLIGENCE` (unset, empty or only spaces, D65) with `INTELLIGENCE_SWITCH_MISSING`; it
  returns `undefined`, upstream's Intelligence contract, only for `on`. The server has no default: the
  install files write the line (`openbot/.env.example:382` is `off`, `openbot/scripts/start.sh:301-308`
  writes `off` when it is missing, `on` when `INTELLIGENCE_API_URL`, `INTELLIGENCE_GATEWAY_WS_URL` and
  `INTELLIGENCE_API_KEY` are all set), the Helm chart writes `on` unless `config.extraEnv` names the switch, and the desktop app writes `off` when its `.env` holds no value (D67; a value the person wrote stays, `on` included). A test or a
  script that starts the server or calls `loadConfig` must say `on` or `off` itself
  (`server/tests/support/environment.ts` says `on`).
- The desktop app runs the upstream example package, not the FreeDuet team: `openbot/desktop/src-tauri/src/env.rs:790` sets `TENANT_PACKAGE_DIR` to `../examples/fintech`, and `openbot/desktop/src-tauri/src/stack.rs:25` and `:84-95` start no `agent-freeduet`. So D65 and D67 on the desktop decide where conversations are kept, not what the members do (D67, `docs/M1_PLAN.md`, 17 November 2026).
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
- With sign-in on and an installation secret present, a signed-in session is REMOTE unless its browser holds the
  token of a live `browser_pairings` row of that same person (`server/src/auth/remote-limits.ts`,
  `auth/browser-pairings.ts`, D49, PR #283). Each paired browser has its own revocable token, and a phone is
  paired with a one-time code made in a browser paired as a `computer`. The old cookie, which is the installation
  secret itself, is upgraded once and only for a request made directly at this machine; it is refused from
  16 February 2027 (`LEGACY_UPGRADE_ENDS`). Every route is refused unless one deny-by-default list in `createApp`
  allows it: a new route must be added to that list, and a test fails until it is. A chat turn from a remote
  session carries the server-set initiator `remote`, which earns neither D27 nor Full access. "At the computer"
  has one definition, `at-the-computer.ts`: never write a second one.
- FreeDuet advertises nobody (D51): for FreeDuet's own package, the upstream self-host bar and the onboarding
  slide with product links are off. The credit to the upstream authors stays.
- A card raised inside a hand-off is also drawn in the conversation that asked (D52). The chat takes it from the
  person's approval inbox, where `askedIn` names the conversation that asked. One request, one decision route.
- A picture attached in chat reaches `agent-freeduet` as a base64 `image` part (`resolvePart` in
  `openbot/server/src/channels/attachment-parts.ts`). Since D72 (`docs/M1_PLAN.md`, section 51), a picture
  in the person's latest message goes to the Claude CLI engine on stdin as base64, with
  `--input-format stream-json` (`openbot/agent-freeduet/freeduet/claude_engine.py`, `transcript.py`). At
  most 20 pictures, 5 MiB each and 10 MiB per turn are sent. Older pictures, the compatible engine and
  hand-offs keep the D68 note from `_part_text`, which says the member cannot see the picture.
  `FREEDUET_PICTURES=off` sends no picture. The full flag combination of a member's segment is not run
  live (17 November 2026).
- What decides whether a card was due: a call the gate allows by a personal rule, by the auto-review model or by Full access writes an `approval.evaluated` row in `audit_events`, and no `approval_requests` row (`openbot/server/src/approvals/store.ts:545`; the allow returns at `openbot/server/src/approvals/service.ts:528`, before `store.open` at `service.ts:550`). An allow that is only the default writes no row at all (`service.ts:396`). So "no card appeared" is not evidence that a tool was not called (16–17 November 2026).
- In the app's chat, a member's next turn is built from the messages the app sends with the request (`openbot/server/src/copilot.ts:1435`, `sanitizeSeededHistory` over `input.messages`), not from the stored thread, so what the screen does not hold, the member does not see (16–17 November 2026). A headless turn, such as a routine, loads the stored thread instead (`openbot/toolkit/src/run-turn.ts:741`).

## Team evals

- Run on the separate eval stack (`openbot/scripts/freeduet-eval-stack.sh reset`; ports 3110, 3101,
  4231), never on a real deployment.
- `freeduet-eval-stack.sh up` brings the eval server back without emptying its database; `reset` empties it
  (17 November 2026).
- `freeduet-eval-stack.sh reset` fails ("volume is in use") while exited containers of the eval project
  still hold a volume. Remove only the exited containers labelled `com.docker.compose.project=freeduet-eval`,
  then reset; a script that starts a run stops when reset does not return 0 or the eval server does not
  answer 200 (16 November 2026).
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
- A `must` line that needs a file to exist (the member re-opens a file it wrote, or hands it over with
  `offer_file`) can fail in a repeat where the approval gate asks. A change in the member's computer,
  such as `computer_write_file` or `computer_run_command`, goes to the approval gate first
  (`evals/team/README.md`, section "The Bot's computer"), and the runner never allows an approval
  (`evals/team/README.md`, section "How it drives the server"), so no file is written. A safety case
  needs 100% (`evals/team/README.md`, section "Run it on the eval stack"), so write such a line
  for both outcomes: "when a file was made, ...; when none was made, the member says so."
- A case cannot send a skill picked with `/`, so a `must` line that checks an instruction needs that instruction in the member's own prompt (see Adding a team member).
- The eval stack has no Gmail connected, so otto-4 to otto-7 are skipped ("needs Gmail"). Only Otto holds the send tools (D30): a case about Iris, Penny or any other member must not say `requires: [gmail]`, because the runner would skip it for ever, and a hop's tool calls are not in a case's transcript.
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
  process started with `Start-Process`, and with them WSL, Docker and a two-hour eval run. On 17 November
  2026 a run started that way still died after 35 minutes, with no line in the log. Start a long run detached
  inside WSL instead (`setsid nohup bash -l <script> >/dev/null 2>&1 < /dev/null &`), and read its `PASS`,
  `FAIL`, `SKIP` and `UNGRADED` lines in the log: the runner writes its report only at the end. When reading a
  long run, check the time of the log's last line, not only its counts.
- To list the eval cases added or reworded since a certification run, compare the cases by `id`: `git diff <commit> origin/main -- evals/team/cases.yaml`, then compare `request`, `must` and `must_not` of each id on both sides. Take no count from a document: on 17 November 2026 the team docs said twelve cases were not yet run live, while the comparison with commit 4e8b4e6 found seventeen added or reworded (four added, thirteen reworded); commit 27ef0fd corrected them.

## On the maintainer's computer

- The stack runs in WSL Ubuntu, with Docker inside WSL. A script started through `wsl.exe` that leaves
  processes running must end with `exec sleep infinity`, or WSL stops the distro when the last session
  ends and the stack dies.
- Start such scripts hidden from PowerShell with `Start-Process -WindowStyle Hidden wsl ...`.
- Write multi-line logic into a `.sh` file and run it. Inline regex through PowerShell breaks.
- A Windows watchdog restarts the stack whenever port 3010 stops answering. Before an update, expect it: stopping the
  stack by hand makes it run its own `start.sh` within a minute, and two starts collide once (container name conflict)
  before one wins. Back up the database first (`pg_dump -Fc` from the postgres container), then update.
- The stack runs as a systemd service inside WSL (`freeduet.service`, a `oneshot` unit with `RemainAfterExit`).
  To update, back up the database, pull, run `systemctl restart --no-block freeduet.service` as root, then poll
  port 3010 until it answers. A holder process must still keep the distro alive. The Windows watchdog now checks
  every minute and starts its fallback with a hidden window, because a visible console took the keyboard focus.
  `/tmp` inside WSL is emptied when the distro restarts, so a script that must survive lives in a persistent
  folder. Inline SQL with `||` through PowerShell breaks: write it in a `.sh` file.
- Seen on one installation on 16 November 2026: the shared documents folder, mounted at `/workspace/documenti`, is a read-only 9p mount of a Windows drive, so a member never writes there.
  It writes in its own `/workspace` volume (`openbot/supervisor/src/docker.ts:462`) and hands a file to the person with `offer_file`, so `user.*` extended attributes matter only inside that volume.
