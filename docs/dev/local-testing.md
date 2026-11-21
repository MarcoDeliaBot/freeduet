# Local testing

Moved out of `CLAUDE.md`. Read it before running tests in a worktree or a sandbox.

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

