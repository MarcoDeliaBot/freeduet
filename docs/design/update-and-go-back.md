# Updates that can go back: the command

First slice, on the branch `update-that-goes-back`: the command `openbot/scripts/update.sh`, its tests, and a page about it in the configuration docs. **It has NOT been run on a real installation.** What was tested, and how, is in section 4. Written 2026-11-15 against origin/main 0259785.

The product decision is the roadmap row "Updates that can go back" [code: docs/ROADMAP.md:38]: one command updates FreeDuet, copies the data first, checks that the app answers, and if it does not, puts back the version and the data the person had, by itself. The copy stays on the person's computer, readable only by them. Nothing is updated without the person's command. The notice in the app that a newer version exists is the next slice and is not built here.

Markers: [code: path:line] is a line of this repository at that tree. [assumed] is not checked here. Paths are from the repository root.

## 1. What the person sees

In the folder they cloned FreeDuet into, with FreeDuet running:

```
bash openbot/scripts/update.sh --check        look, change nothing
bash openbot/scripts/update.sh                update to the newest release (the newest v* tag)
bash openbot/scripts/update.sh --to <ref>     a tag, a branch or a commit
bash openbot/scripts/update.sh --main         origin/main, the development version
```

It starts with a look: where they are, where it would go, where the copy will be, and the five steps in order. `--check` stops there ("This was only a look. Nothing was changed."). Without it, it runs the steps and says each one in plain words:

1. Stopping FreeDuet, then waiting to see that nothing starts it again (up to 75 seconds, `--watch`).
2. Making a copy of the data, with nothing else running.
3. Moving to the new version and installing what it needs.
4. Starting it. This is `scripts/start.sh`, which brings the database up to date.
5. Checking that the app and the API answer (about 120 seconds, `--wait`).

It ends in one of four ways:

| Exit | What the person reads | What is true |
|---|---|---|
| 0 | "Updated. FreeDuet is now on v0.3 and answers at http://localhost:3010." Or "Already up to date." | The new version runs and answers. Older copies beyond `--keep` were removed |
| 10 | "The update did not go through. You are back where you were: v0.2, with your database and your settings as they were." and where the copy is | Code, `.env` and database are what the copy held. The old version runs and answers |
| 20 | `Going back did not work:` and the reason, then the exact commands, in the order to run them | The person finishes by hand. The copy is never deleted. Also used when something started FreeDuet again while it was stopped, and for Ctrl-C after the stop |
| 1 | The reason, and "Nothing was changed." | It refused before it changed anything |

The copy is a folder, `~/.freeduet/updates/update-<YYYYMMDD-HHMMSS>` (`--copies` puts it elsewhere): `database.dump` (what `pg_restore` reads), `env.copy`, `role-password.sql`, and `record.txt` (what they were on, where it went, how the run ended: no secrets). The folder is 700 and each file 600. It holds every secret that `.env` and the database hold, and the command says so each time it names the folder.

## 2. Rules

The order is the safety. Everything from the stop on ends at the copy.

- **Looks first.** It refuses, says why, and says "Nothing was changed." when: a tracked file has changes of its own (modified or staged: an update would not keep them), a merge or rebase is half done, the database does not answer (FreeDuet has to be running to be updated), the settings point at another database than the one Docker starts here (user and database `openbot` [code: openbot/docker-compose.yml:18]), the folder is not a git checkout (the installer allows a ZIP [code: openbot/scripts/install.sh:7]), the target cannot be reached by moving forward (older, diverged, unknown), a file of the person's own is where the new version brings one, there is no room for the copy, the disk does not keep file permissions, another update is running, or a tool is missing.
- **The copy is made after the stop, with only the database running.** A copy taken from a running FreeDuet misses what happens between the copy and the stop, and going back would lose it. With the app, the API and the worker stopped and nothing else connected, asked twice a second apart through `pg_stat_activity` (as the adopt tool does [code: openbot/server/src/freeduet/adopt/preconditions.ts:185]), nothing can be missing.
- **Nothing changes until the copy exists and has been checked.** `pg_dump -Fc -C` runs inside the postgres container. The file must be at least 512 bytes, begin with `PGDMP` [code: openbot/server/src/freeduet/adopt/backup.ts:322] and be readable by `pg_restore --list`. `.env` is copied and compared byte for byte. The folder is 700 and the files 600, checked after they are written [code: openbot/server/src/freeduet/adopt/backup.ts:277] [code: openbot/server/src/freeduet/adopt/backup.ts:289]. If a check fails it goes back at once, with nothing changed.
- **Fast-forward only.** `git merge --ff-only`. The person's own commits, or a version that is not ahead, are refused and never merged.
- **Going back, in this order.** Stop what the new version started (`scripts/stop.sh`), reset the code to the recorded commit, put `.env` back, run `bun install --frozen-lockfile` if the code had moved, restore the database and the database user's password, start the old version with `scripts/start.sh`, check that it answers. The database is restored only if the new version had been started, because starting it is what migrates the database [code: openbot/scripts/start.sh:646]; before that the command says "database: not touched, so it is as it was". After a restore it compares the database with what was copied (number of tables and of migrations). If they differ it exits 20.
- **The restore is whole, or it says it is not.** The dump is made with `-C` and restored with `pg_restore --exit-on-error --clean --create --if-exists --no-owner -U openbot -d postgres`: the database is dropped and made again from the copy. This was checked on a PostgreSQL 16 test cluster, not on the pg17 image that Docker starts [code: openbot/docker-compose.yml:3], and the two are [assumed] to behave the same here: with plain `--clean --if-exists` over a database that a newer migration had added a table with a foreign key to, the restore stopped on that table and left a mix of the old and the new. It will not restore while anything else is connected.
- **The database user's password.** `start.sh` may set a new password on the `openbot` role [code: openbot/scripts/start.sh:612]. A role's password lives in the cluster, not in a dump, so restoring the database and `.env` would leave `.env` naming a password the role no longer has. The copy keeps the stored hash of the password (not the password) in `role-password.sql`, mode 600, and going back sends it to `psql` on standard input.
- **A watchdog.** Something on the computer may start FreeDuet again when it stops. One does exist: it restarts the stack within a minute of port 3010 going quiet, and two starts collide once before one wins [code: CLAUDE.md, last section]. The command looks for that for up to `--watch` seconds after the stop (75: that minute and 15 seconds more) and ends the wait the moment it sees the stack back. It asks again before the copy, before the move and before a restore. If the stack is back it exits 20 and does not touch the database or the code, and it never starts FreeDuet on top of whatever did. Pausing the watchdog first is the advice in the docs [code: openbot/docs/configuration.md, section "Moving from no sign-in to sign-in", step 3].
- **Secrets.** Never printed, logged, or on a command line. They are in the 600 files and on standard input only. A test plants canary values in `.env` and in the database user's stored password, and fails if any of them shows up in anything the command printed, ran or logged outside the private copy, or on a command line. The script holds no path of any CLI's login or settings folder and none of the published example values (both tested).
- **Logins first.** The command calls no model and no metered API. It talks to the git remote (`git fetch --tags origin`, the one thing `--check` asks the network) and runs what `start.sh` already runs.
- **Approvals.** No approval is touched. The person's own command is the approval, and nothing runs it for them.
- **What it deletes.** Only old copies it made for this installation (same folder of code, same settings file, named `update-<date>-<time>`, whose record says the run ended well or went back), beyond `--keep <n>` (default 5), only after an update that worked. Never this run's, never one whose run needs the person, never a link, never anything else in the folder.
- **Same style as the scripts beside it.** `require-bash.sh` first [code: openbot/scripts/require-bash.sh:24], bash 3.2 syntax, no `set -e` (every step is checked and an exit trap prints the way back for any that was not), `scripts/start.sh` and `scripts/stop.sh` do the starting and stopping [code: scripts/start.sh:12] [code: scripts/stop.sh:9], and "does it answer" is the same question `start.sh` and `stop.sh` already ask [code: openbot/scripts/start.sh:415] [code: openbot/scripts/stop.sh:96]. `OPENBOT_ENV_FILE` is honoured, the scripts it runs are told about it, and the commands it prints name it, because a terminal opened later does not have it.
- **The script is in the checkout it moves.** A merge may replace `update.sh` while bash is reading it. So everything is a function and the last line leaves. Tested both ways: the move replaces the file with another version, and a fake install overwrites it in place after the move.

## 3. What is not built

- The notice in the app that a newer version exists (the next slice).
- The first update. A checkout older than the command does not have it, so that one has to be moved forward once by hand (`git pull --ff-only`, then `scripts/start.sh`). The docs say so.
- Updating by itself, on a schedule. The roadmap row says nothing is updated without the person's command.
- A copy of each Bot's own computer. Its profile and its workspace are Docker volumes with the Bot's files and logins; a stop removes the container and keeps them [code: openbot/supervisor/src/docker.ts:519]. The update leaves them alone and the copy does not include them (decision 3).
- A database that Docker does not start here. It is refused, not copied.
- A folder that is not a git checkout (an unpacked ZIP), and the desktop app's own folder [assumed: not a git checkout]. Refused.
- Anything the new version wrote before a go-back. Going back returns the database to the moment of the copy, by design.
- Going back when the old images are gone. `start.sh` builds them again from the old code [code: openbot/scripts/start.sh:602], which needs what a build needs [assumed].
- Windows without bash, and macOS bash 3.2 as shipped: not run [assumed to work].

## 4. Built so far

Date 2026-11-15. Branch `update-that-goes-back`. Nothing outside this list changed.

| File | What |
|---|---|
| `openbot/scripts/update.sh` (new, executable) | The command. About 1100 lines, with the steps and exit codes at the top |
| `openbot/scripts/update.test.ts` (new) | 80 tests |
| `openbot/docs/configuration.md` | A section "Updating" (+44 lines), before "Moving from no sign-in to sign-in" |
| `docs/UPSTREAM_TOUCHES.md` | One row, for `configuration.md` |
| `docs/design/update-and-go-back.md` | This page |

**How it was tested.** `update.test.ts` runs the script in a real git checkout, a clone of a bare repository made in a temporary folder, with two release tags and a commit after them. So every git decision in it is the real git's. Everything else the script runs is a fake on a PATH that holds nothing but the fakes and links to the real coreutils: `docker` (compose, and `psql`, `pg_dump`, `pg_restore` inside the postgres container), `bun`, `curl`, `sleep`, `df`, `stat`, and the checkout's own `scripts/start.sh` and `scripts/stop.sh`. The fakes keep a small model: a stack that is up or down, a database that is a few lines of text, a role password, who is connected, a watchdog that starts the stack after the Nth sleep. `git` is a spy that records and runs the real one, and can be told to fail one subcommand.

The tests cover: what it is asked (bad options); the update that works, in order, for a branch, a tag, a detached checkout, `--main`, `--to`, `OPENBOT_ENV_FILE`, and a script replaced under it; the refusals, each of which must leave the checkout, the home folder and the model exactly as they were (compared before and after); `--check`; the copy (modes, contents, taken with nothing running, checked before the change); going back from every step from the stop on, in order; going back failing, with the printed commands run and shown to do the job; a watchdog at three moments; Ctrl-C at two; `--keep`; secrets.

- **Before and after.** On origin/main there is no `update.sh`, so all 80 tests fail there (0 pass, 80 fail). With the command, 80 pass in about 30 seconds.
- **Do they catch a defect?** 21 deliberate defects were put into `update.sh` one at a time (no refusal on local changes, a merge without `--ff-only`, a restore without `--create`, `.env` not put back, no wait for a watchdog, a secret printed, a go-back that exits 0, no quiet check before the copy or the move, a dump without `-C` or not private, the password not put back, `--keep` 50, the new stack not stopped before going back, `--check` going on, and others). 20 are caught by a test that names the behaviour. One is not: deleting this run's own copy from the removal list changes nothing, because the run's folder has no result line yet and is skipped for that reason too. The two protections overlap.
- **Checks.** `bash -n` and shellcheck (`-x -P SCRIPTDIR -s bash`, run here, not in CI) are clean on `update.sh`. Biome format and lint are clean on the whole of `openbot/`. `bun run typecheck:tests` is unchanged against its baseline, and `server/tests/assertion-shape.test.ts` passes (neither looks at the new test file: it is in `openbot/scripts/`, which has no type check). The new file type-checks on its own under the repository's strict base settings. All 429 tests of `openbot/scripts/` pass together, including the D39 guard in `start-restart-guard.test.ts`.
- **Not in the tests.** The tests prove the decisions and the order. They do not prove that a real Docker, a real `pg_dump`, a real `start.sh` or a real watchdog behave as the fakes do.

**NOT verified.** The command has NOT been run on a real installation: not against real Docker and the real postgres image, not with the real `start.sh` and `stop.sh`, not with a real `bun install`, not with a real watchdog, not on macOS or in Git Bash. The 75-second default wait is the documented minute plus a margin, and has not been measured on a real machine. The restore flags were checked once on a PostgreSQL 16 test cluster, not on a real FreeDuet database.

**Where it differs from the first sketch of the task, and why.**

- The copy is made after the stop, not before (section 2). FreeDuet is down a few seconds longer; no write can be missing from the copy.
- `-C` on the dump and `--create` on the restore, instead of a plain `--clean --if-exists` (section 2).
- A fourth file in the copy, `role-password.sql` (section 2).
- Three options beyond the ones asked for: `--watch`, `--wait`, `--copies`.
- `--check` runs `git fetch --tags origin`. Without it it cannot say what the newest release is. If the fetch fails it says so and uses what is already downloaded.
- Ctrl-C after the stop exits 20 and prints what to run. It does not start a go-back by itself while the person is at the keyboard.
- A run interrupted or refused before any copy exists leaves no folder behind.

## 5. Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| 1. Where the copies go | (a) `~/.freeduet/updates` (built); (b) `openbot/.logs/`, beside the adopt backups | (a) | A copy must outlive the checkout and survive a `git clean`. It is still on the person's computer and private. `--copies` moves it |
| 2. How long to wait for a watchdog by default | (a) 75 seconds (built); (b) 0; (c) 120 | (a), then measure on a real machine | It adds 75 seconds to every update, also on a computer with no watchdog, because the wait ends early only when the stack comes back. It prevents a database taken from under a running app. The minute is documented [code: CLAUDE.md, last section]; the margin is a guess |
| 3. Copy each Bot's profile and workspace volumes too | (a) no (built); (b) yes, in a separate private folder | (a) for this slice | The profile volume holds signed-in browser sessions: a copy is more secrets at rest, which is a security and public question. Not needed for the app's data to come back |
| 4. A `scripts/update.sh` at the root, like `start.sh` and `stop.sh` | (a) add one line that runs `openbot/scripts/update.sh`; (b) not now | (a), in the slice that adds the notice in the app | The person would type the same path they type for start and stop. The notice would name the command |
| 5. How the app learns that a newer version exists (next slice) | (a) the server asks the public releases list of the repository once a day; (b) only when the person presses a button; (c) not at all, `update.sh --check` is enough | (b) | (a) is an outbound call the person did not ask for, and reveals that this computer runs FreeDuet. (b) is one the person asked for |
