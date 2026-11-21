# CI

Moved out of `CLAUDE.md`. Read it before touching CI or a failing check, a workflow, a Dockerfile or the installer.

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
- Secret scan (`.github/workflows/secret-scan.yml`, `.gitleaks.toml`): gitleaks 8.21.2 runs on every pull request over the commits it adds (`base..head`) and on every push to main over the whole history. The binary is downloaded from the release and checked against its SHA-256 before it runs; upgrading means changing the version and the checksum together. The allowlist names files by exact path and has three groups: dummy credentials in redaction and engine tests, local or example database and service URLs with test users, and the signing test vectors (`openbot/scripts/programs-helper/hmac-vectors.json`, written by `openbot/server/src/programs/protocol.ts`). An allowlisted path hides every finding in that file, so add a file only after reading its flagged line. A finding that is not a fixture is a real secret: rotate it first, then remove it from the history.

