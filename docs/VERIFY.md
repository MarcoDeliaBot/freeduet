# Check it yourself

One person maintains this project. You do not have to take anyone's word for what it does. This page says where each claim is proven, and gives the commands to run the checks yourself. Every line says what a check proves and what it does not.

Contents: [1. Five-minute check](#1-the-five-minute-check) · [2. Where each claim is proven](#2-where-each-claim-on-the-front-page-is-proven) · [3. Run the team evals](#3-run-the-team-evals-yourself) · [4. Check a release archive](#4-check-a-release-archive) · [5. Check how the repository is run](#5-check-how-the-repository-is-run)

## 1. The five-minute check

"Five minutes" is the time of the clean start once the images are built. The first start builds every image the stack runs, so allow longer the first time (CI allows up to 60 minutes for the job). What you need: Docker with Compose, Bash, Bun, `curl`, `lsof` and `git`.

From a clean clone:

```bash
git clone https://github.com/MarcoDeliaBot/freeduet.git
cd freeduet
cp .env.example .env
set -o pipefail
status=0
bash scripts/start.sh 2>&1 | tee /tmp/freeduet-start.log || status=$?
bash openbot/scripts/freeduet-clean-start-check.sh /tmp/freeduet-start.log "$status"
```

These are the commands of the CI job `clean start (no key, no sign-in)` in [.github/workflows/ci.yml](../.github/workflows/ci.yml), minus the runner's disk clean-up. No API key is set and Claude Code is not signed in.

What the first part does: `scripts/start.sh` runs [openbot/scripts/start.sh](../openbot/scripts/start.sh). It makes a secret of its own for each value the installation needs and writes them to `.env`, builds and starts the Compose services, runs the database migration and starts the server. It tells you when Claude Code is not signed in yet.

What the check script then tests ([openbot/scripts/freeduet-clean-start-check.sh](../openbot/scripts/freeduet-clean-start-check.sh)). It prints PASS or FAIL for each, and exits 1 if any failed:

| Check | What a PASS means |
|---|---|
| `start.sh finished` | The start exited with status 0 |
| server `/health` answers 200 | The server is up on port 3001 |
| app answers | Port 3010 serves FreeDuet's app |
| agent-freeduet `/health` answers 200 | The Python service that runs the members is up on port 4230 |
| a team of sixteen: Iris and fifteen members are remote Bots at agent-freeduet | `examples/freeduet/agents.yaml` has 16 entries, Iris and fifteen members; each is registered in the runtime and points to agent-freeduet on this machine |
| conversations are kept in FreeDuet's own database | `/api/capabilities` says `mode: local` (no CopilotKit Intelligence) |
| a request without the installation secret is refused (401), and with it answered (200) | A request from this machine that holds no secret is not taken for the person ([docs/M1_PLAN.md](M1_PLAN.md) D28) |
| `start.sh said how to sign in to Claude Code` | The output contains the sign-in line |
| `nothing asked for a key` | No API key or licence is named in the start output, and the server did not refuse to start for a missing key |

The last line is green, "The one-command start works on a clean machine with no key and no sign-in", only when all of them passed.

**What a pass does NOT prove.** It does not sign in to Claude Code, so no member answers a request in it. It does not run the team evals, test any approval, send any mail or open a browser. It proves that the stack starts with no key and that the wiring is in place. It was run by CI on Linux; the maintainer uses the stack on Windows with WSL2. It does not cover macOS.

When you are done: `bash scripts/stop.sh`.

To go further and sign in with your own Claude plan: `cd openbot && docker compose exec -it agent-freeduet claude` (the README's Quick start). FreeDuet never reads that sign-in; only the Claude Code command does ([docs/PROVIDERS.md](PROVIDERS.md), rule 1).

## 2. Where each claim on the front page is proven

| Claim | Where to look | Kind of evidence | Limit |
|---|---|---|---|
| A send, payment, purchase, booking, signature or deletion asks the person first | [openbot/server/src/approvals/policy.ts](../openbot/server/src/approvals/policy.ts) (`decideAction`, `safetyRequirement`); tests `approvals-policy.test.ts`, `approvals-safety-floor-it.test.ts`, `approvals-policy.integration.test.ts`, `unclassified-tools-ask.integration.test.ts` in [openbot/server/tests](../openbot/server/tests) | Code and tests | The categories are matched on words, and a reviewer model judges some cases: [THREAT_MODEL.md](THREAT_MODEL.md) |
| Without a card, only with the person's own written request | [docs/M1_PLAN.md](M1_PLAN.md) D27 and `openbot/server/src/plugins/typed-recipients.ts`; test `typed-recipients.test.ts` | Code and tests | A new email only; mailbox changes are judged by a model ([docs/design/mail-organise.md](design/mail-organise.md)) |
| Full access is off by default, per member, and never reaches routines | [docs/FULL_ACCESS.md](FULL_ACCESS.md), `openbot/server/src/freeduet/full-access.ts`, `fullAccessOutcome` in policy.ts; tests `freeduet-full-access.integration.test.ts`, `freeduet-full-access-modes.integration.test.ts` | Code and tests | Plain Full access has no limit on an amount |
| Members run on your own login, never an API key first by default (D115) | [docs/PROVIDERS.md](PROVIDERS.md); `openbot/agent-freeduet/freeduet/claude_cli.py` (`LOCKDOWN_ARGS`, `child_env`); tests `test_command.py` (`test_the_cli_environment_never_carries_a_key_or_a_token`) | Code and tests | Terms of the providers are read, not tested; the page dates each reading |
| FreeDuet never reads your login | The rule in [CLAUDE.md](../CLAUDE.md) and [docs/PROVIDERS.md](PROVIDERS.md); test `openbot/agent-freeduet/tests/test_credentials_untouched.py` (a child process with decoy credential folders and an audit hook, plus a static scan) | Test | It covers the Python service. The Claude Code command itself reads its own sign-in, by design |
| The team's behaviour (129 cases, forty-one of them added or reworded since commit 4e8b4e6 (fifteen added, twenty-six reworded); four are now run live (gus-6 and wren-docx-1 on 17 November 2026 at 18:01, iris-10 and penny-5 at 16:48, 3 of 3 each; penny-xlsx-2 passed then but failed on 22 November 2026 and was reworded, so it is not run live) and fifty-six are not yet run live: basil-2, basil-3, cam-3, cam-4, gus-2, gus-5, gus-7, iris-8, iris-19, iris-22, iris-24, iris-25, iris-26, iris-27, iris-28, jules-1, jules-4, jules-6, leo-5, mark-3, mark-5, mark-6, mark-7, mark-8, otto-3, otto-8, otto-11, otto-17, penny-xlsx-1, penny-xlsx-2, rex-1, rex-2, rex-3, rex-4, rex-5, rex-6, vera-4, mark-9, mark-10, cam-8, portia-5, jules-7, basil-4, ada-1, ada-2, ada-3, ada-4, kai-1, kai-2, kai-3, kai-4, lumi-1, lumi-2, lumi-3, lumi-4 and iris-29; gus-5, gus-6 and gus-7 run on the eval stack with the programs function off, so they test Gus's words, not his behaviour with the tools; 90% per member, 100% on safety) | [evals/team/README.md](../evals/team/README.md); public report [evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md](../evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md) | A report from a live run | Certified at v0.1 for the 45 cases of the starting members; later cases are not certified. [CHANGELOG.md](../CHANGELOG.md) and the README say which |
| Member computers cannot reach your home network | `openbot/agent-computer/src/egress.ts`, `private-network.ts`; tests in `openbot/agent-computer/tests` (`egress*.test.ts`, `private-network*.test.ts`) | Code and tests | A raw socket that ignores the proxy settings is not covered ([SECURITY.md](../SECURITY.md)) |
| The approval trail cannot be rewritten | `openbot/server/drizzle/0000_schema.sql` (trigger `audit_events_append_only`) and `0012_truncate_is_not_a_way_around_append_only.sql`; `audit.test.ts` | Code and tests | The database owner can still change the schema |
| How to report a vulnerability, and what is especially valuable | [SECURITY.md](../SECURITY.md) | Policy | Response times are the maintainer's intention, not measured |
| What attackers and assets were considered | [THREAT_MODEL.md](THREAT_MODEL.md) | Document with a code or test reference per statement, or "not verified" | A model of one reader's reading of the code, not an audit |
| How the repository is run (branch rule, scanning, pinned actions) | [.github/workflows](../.github/workflows) (`security_zizmor.yml`, `codeql.yml`, `scorecard.yml`, `release-provenance.yml`); the Scorecard result at `https://api.securityscorecards.dev/projects/github.com/MarcoDeliaBot/freeduet` | Public result, recomputed weekly | The score has low checks, listed in [design/best-practices-badge.md](design/best-practices-badge.md) |
| What was run live and what was not | [CHANGELOG.md](../CHANGELOG.md), the release notes, [ROADMAP.md](ROADMAP.md) | Statements by the maintainer | Not independently verifiable except through the evals above |
| What FreeDuet changed in the upstream it forks | [docs/UPSTREAM_TOUCHES.md](UPSTREAM_TOUCHES.md), [NOTICE.md](../NOTICE.md) | Document | You can compare with the upstream repository |

## 3. Run the team evals yourself

You need a Claude plan to sign in with: the evals run real members on the Claude Code command, and each case costs some of your plan's usage. Never run them on an installation you use: they create conversations and memories. They run on a separate stack with its own ports (3110, 3101, 4231) and database.

```bash
# 1. Offline, no model, no sign-in: the runner's own tests and a replay of recorded transcripts
bun evals/team/run.ts --fake
bun test evals/team/run.test.ts

# 2. Live, on the separate eval stack
bash openbot/scripts/freeduet-eval-stack.sh reset        # starts it clean
# the eval stack shares the Claude Code sign-in of the main stack (openbot/scripts/freeduet-eval-compose.yml), so sign in once as in the Quick start
bun --env-file=openbot/.env.eval evals/team/run.ts --repeat 1                  # quick check
bun --env-file=openbot/.env.eval evals/team/run.ts --repeat 3                  # certification, as the thresholds ask
bun --env-file=openbot/.env.eval evals/team/run.ts --member bookkeeper         # one member (ids in agents.yaml)
bash openbot/scripts/freeduet-eval-stack.sh down
```

Read the result: the thresholds are each member at 90% or better and the safety cases at 100%. The runner prints PASS, FAIL (exit 1) or INCOMPLETE (exit 2, a grader could not be reached; finish with `--regrade`). A case that needs Gmail, routines or settings is skipped on the eval stack, and the report says so. Each case is graded by a model for what the member must and must not do, and by code for the approval gate and the report lines. The grader is a model too: the README of the evals says what the code checks and what the model checks. A filtered run (`--member`, `--id`) writes a "partial" report.

To publish a report without the conversations, use `bun evals/team/run.ts --public <report.json>`.

## 4. Check a release archive

From a release published after this workflow existed, the release has two extra files, built by [.github/workflows/release-provenance.yml](../.github/workflows/release-provenance.yml): `freeduet-<tag>-source.tar.gz` (the tracked files of the tagged commit, made with `git archive`) and `SHA256SUMS`. Each has a signed build-provenance attestation (GitHub artifact attestation, SLSA provenance) that names this repository, this workflow, and the commit it ran on.

```bash
# download both files from the release page, then:
sha256sum --check SHA256SUMS
gh attestation verify freeduet-<tag>-source.tar.gz --repo MarcoDeliaBot/freeduet
gh attestation verify SHA256SUMS --repo MarcoDeliaBot/freeduet
```

`sha256sum --check` proves the archive is the file the checksum file names. `gh attestation verify` proves, against GitHub's and Sigstore's records, that a workflow of this repository produced those exact bytes, and prints the workflow and the commit. Compare that commit with the tag:

```bash
git ls-remote https://github.com/MarcoDeliaBot/freeduet refs/tags/<tag>
```

What this does not prove: that the code is free of bugs or malice (only that it is the tagged code, built in the open), or anything about a container image or an installed application. It does not cover releases made before the workflow existed (v0.1, v0.2 and v0.2.1), which only have the archive GitHub itself makes. GitHub's own "Source code" archives on the release page are not the attested files and may differ byte for byte.

## 5. Check how the repository is run

| Check | Command or place |
|---|---|
| Branch rule on `main` | `gh api repos/MarcoDeliaBot/freeduet/branches/main/protection` (a pull request and the `verify` check are required; the review count is 0, as one person maintains it) |
| Workflow scanning | The `security / zizmor` workflow; locally `zizmor --config .github/zizmor.yml .github/workflows/` |
| Code scanning | The Security tab, "Code scanning", from `security / CodeQL` |
| Scorecard | `https://api.securityscorecards.dev/projects/github.com/MarcoDeliaBot/freeduet` |
| Actions pinned | Every `uses:` in [.github/workflows](../.github/workflows) is a full commit SHA with the version in a comment |
