# Sealing the saved secrets again with a new key

Built in one slice on the branch `vault-rekey-tool`: the command, the part of it that touches the database, tests, and one line in `start.sh`. It has not been run on a real installation. Written 2026-11-14 against origin/main 3881bb6 with the branch merged. Reviewed independently the same day (section 8.6), which changed four things in it.

Markers: [code: path:line] is a line of this repository at that tree. [assumed] is not checked here. Paths are from the repository root.

## 1. What it is for

FreeDuet seals what it keeps secret with `KEY_ENCRYPTION_KEY`: the connections and tokens in the vault, saved logins, and the secrets of a company sign-in provider. `scripts/start.sh` makes each installation its own key, but it leaves the key alone when the database already holds sealed rows, because a new key would make every one of them unreadable [code: openbot/scripts/start.sh:675-705].

So an installation that started from `.env.example` and has used the vault since keeps the example key. That key is 32 zero bytes and is published in this repository [code: openbot/scripts/secrets.sh:25]. `start.sh` says so in red at every start and changes nothing. Whoever gets a copy of that database can open the secrets in it. Until this command existed nothing sealed the rows again.

`bun scripts/rekey-vault.ts` does that. A person runs it, once, on purpose, with FreeDuet stopped. Nothing starts it. `start.sh` never runs it and only names it in its warning [code: openbot/scripts/start.sh:704].

It replaces the published example key and nothing else. A key the person chose, or one the desktop app made, is "nothing to do". It is run from the `openbot` folder, against the settings file there (`.env`, or the file `OPENBOT_ENV_FILE` names, as `start.sh` does).

## 2. What you do

Before you start. If something starts FreeDuet again by itself when it stops (a service, a scheduled task, a watchdog), switch that off first. Otherwise FreeDuet is back within a minute, and the command refuses while it is running. If it comes up while the command is working, the command undoes its work (section 4). Then answer anything that is waiting for your approval in the app, so nothing is waiting when the key changes (section 5, "Approvals").

All commands are typed in the `openbot` folder.

1. Stop FreeDuet: `bash scripts/stop.sh`. This also stops the database.
2. Start the database alone: `docker compose up -d postgres`.
3. Look first: `bun scripts/rekey-vault.ts --yes`. It changes nothing and writes no file. It says whether FreeDuet is stopped and nothing else is connected to the database, then how many saved secrets there are in each place and how many open with the current key. It ends with "All N saved secrets open with the current key."
4. Change the key: `bun scripts/rekey-vault.ts --apply --yes`. It prints each step. At the end it says "Done. The new key is in .env." and where the backup is.
5. Start FreeDuet: `bash scripts/start.sh`. The red warning about the example key is gone. Open one connection and one saved login and check that they still work.
6. When you are sure, delete the backup file. It holds your secrets sealed with the old key, and the old key is public, so anyone who gets that file can read them. The command never deletes it for you.

Without `--yes` the command only says what it would do and stops. Nothing is ever changed without `--apply` and `--yes` together.

"Your environment", for the command, is what the shell gave it. Bun puts a `.env` in the folder it is started in into its own environment before the command runs, and the steps above are typed in that folder, so the command asks Linux for the environment it was really started with (`/proc/self/environ`) and a key that is only in `.env` is not taken for one you exported. Where there is no `/proc` (macOS) it cannot tell the two apart. If the key in the environment is the key in `.env` it refuses, and it says to type the command as `bun --no-env-file scripts/rekey-vault.ts --yes` (or `--apply --yes`), which makes Bun read no file.

If it stops, it says why in one or two sentences, and on every stop before the change it ends with "Nothing was changed." Section 6 lists the ones you can meet.

## 3. What it does, in order

Each of these ends it before any change, and it says "Nothing was changed." A refusal exits with code 2, "nothing to do" with 0, and a value that does not open with 1:

- It was started without `--yes`. It prints what it would do and stops.
- The settings file is missing, or the folder belongs to the desktop app (it keeps its key in `.secrets/KEY_ENCRYPTION_KEY.secret` and writes `.env` from it each time, so changing `.env` would change nothing) [code: openbot/desktop/src-tauri/src/env.rs:883-912].
- The key in the settings file is not the published example. That is "nothing to do", and it says so. This is also what a second run finds.
- `KEY_ENCRYPTION_KEY` is set in your environment (what the shell gave the command, section 2). If it is a different key it is yours and is left alone. If it is the same example key it is refused, because `start.sh` and the server read the environment before the file and would go on using the old key.
- FreeDuet's server answers, or anything else is connected to the database (section 4).
- `DATABASE_URL` in your environment names another database than the file does. It will not guess which one the server uses.
- A saved secret does not open with the current key. It names the table and the row id and nothing else, and changes nothing, because sealing the rest again would hide a problem that has to be sorted out first.

With `--apply --yes`, after those checks:

1. **Backup.** `pg_dump --data-only` of the three tables (credentials, saved_logins, sso_providers), plain SQL, into a new file next to the settings file named `.env.vault-backup-<UTC date and time>-<4 hex>.sql`. The file is created with mode 600 before anything is written to it. The password goes to `pg_dump` in its environment (`PGPASSWORD`), never on a command line. The command then reads the file back and counts the rows in it: they must equal what the database holds. If there is no `pg_dump` at least as new as the database, and the database is the one Docker Compose starts on this machine (user and database `openbot`), it asks that database's own `pg_dump` through `docker compose exec`, after checking that it is the same server (the same start time). If neither works it stops. `PG_DUMP` in the environment names a `pg_dump` to use instead of the one on the path.
2. **The new key.** 32 random bytes from the system's random source, in base64: the shape the server requires [code: openbot/server/src/config.ts:534-545] and the shape `start.sh` makes with `openssl rand -base64 32` [code: openbot/scripts/start.sh:700]. It is kept in a second file next to the settings file, `.env.vault-new-key-<UTC date and time>-<4 hex>`, mode 600, until `.env` has it.
3. **One transaction.** The three tables are locked against other writers (a lock not had within ten seconds is an error, not a wait). Every sealed value is opened with the current key and sealed again with the new one, in memory, before the first write, so a value that does not open stops everything with nothing written. Then every value is written. Then everything is read back and checked: the same number of rows and of sealed values; every value is different from what it was; every value opens with the new key to the secret it held (compared through a keyed digest, so no secret is kept or printed). One more look for other connections. Then it commits. Any failure rolls the whole transaction back, and the backup and the key file made for this run are removed.
4. **`.env`, only after the commit.** The new key goes into the settings file the way `start.sh` writes a setting (`freeduet_env_line` [code: openbot/scripts/start.sh:91-98]): every `KEY_ENCRYPTION_KEY=` line removed, the new one added at the end, mode 600. It is written to a temporary file next to the settings file, flushed, and renamed over it. The command reads it back, which must give exactly the new key, and checks the mode. A test runs `start.sh`'s own function and this one over seventeen file shapes (no final newline, Windows line endings, repeated lines, quotes, a name that only begins the same) and requires the same bytes.
5. **A last look**, with the key as `.env` now has it: every value opens, and none opens with the old key. Then the key file is removed; if it cannot be, the command says so and leaves it, because the work is done and `.env` has the key. Only the backup is left. Last of all it looks once more for a server on the port and for another connection to the database. Something that came up after the commit read `.env` before it had the new key, and `start.sh` leaves a server that is already running alone, so if there is such a thing it is named, and the first step of what to do next becomes `bash scripts/stop.sh`.

It never prints a secret, a key or a stored value. Every message that carries a database error goes through the server's own filter, which drops the statement and its parameters, and a final filter hides any value the command has seen that is twelve characters or more.

If `.env` cannot be written after the commit, the database already holds values only the new key opens, so it says so, exits with code 3, keeps the key in its file, and prints what to do (section 6). The one line it prints makes the new file under `umask 077`, so the copy of `.env` it builds is private from the moment it exists. If the database does not say whether the commit happened, it keeps the key file and says to run it again: the next run finds out which it was by trying the keys.

A second run finds a key that is not the example and says there is nothing to do. A run that was interrupted after the commit and before `.env` was written is finished by the next `--apply --yes`, which puts the key from its file into `.env` and does not touch the database.

## 4. How it tells that FreeDuet is running

There is no process-id file or lock file. `stop.sh` finds the server by the port, and so does this. Two checks, either of which refuses:

- **The port.** It asks `GET /api/capabilities` on 127.0.0.1 and on ::1 at `SERVER_PORT` (the environment, then `.env`, then 3001), and counts an answer only when the body holds the server's own field `"durableHistory"`, which is the question `start.sh` and `stop.sh` ask [code: openbot/scripts/stop.sh:96-113] [code: openbot/server/src/app.ts:529]. Any other program on that port is not taken for FreeDuet. The request does not go through a proxy.
- **The database's connections.** It lists the other connections to the same database (`pg_stat_activity`, client connections only, not its own, which carry the name `freeduet-rekey-vault`) and refuses if there is one, naming the programs by the name they gave. A running server or worker holds some even when idle. This finds one the port check cannot: on another port, or started by hand. It looks again inside the transaction, just before the commit, so something that connects after the first look undoes the work instead of racing it.

Limit. PostgreSQL shows a user only the connections of its own role, unless it is a superuser or a member of `pg_read_all_stats`. The server and the worker use the same address as this command, so they are always seen. When the user cannot see other users' connections, the command says so instead of "Nothing else is connected to the database."

## 5. What the key protects, and what a new key does to each

Read in the source at this tree. "Re-sealed" means the command opens the value with the old key and seals it with the new one. The others are not stored with the key's help: they are signed or sealed with keys made from it, they last minutes, and a new key makes the ones in flight unreadable. Nothing is lost with them.

| What | Where | What a new key does | Fine with FreeDuet stopped? |
|---|---|---|---|
| Connections, tokens and pasted secrets in the vault: connector tokens, refresh tokens, OAuth clients, model and agent keys, trigger secrets | `credentials.encrypted_value` [code: openbot/server/src/db/schema/core.ts:449], sealed and opened by `encryptSecret` and `decryptSecret` [code: openbot/server/src/credentials.ts:170] [code: openbot/server/src/credentials.ts:185] | Left alone, every one is unreadable. **Re-sealed.** | This is why it must be stopped: a running server would go on sealing new rows with the old key |
| Saved logins | `saved_logins.encrypted_password` [code: openbot/server/src/db/schema/passwords.ts:32] [code: openbot/server/src/passwords/service.ts:256] | Same. **Re-sealed.** | Same |
| A company sign-in provider's secret and signing material | `sso_providers.oidc_config` and `.saml_config`, sealed by the wrapper `auth/encrypt-sso-config.ts` [code: openbot/server/src/auth/encrypt-sso-config.ts:26] [code: openbot/server/src/auth/index.ts:359]. A value that is empty, or plain text from before the wrapper existed, is not sealed with the key and is left as it is; the server seals it the next time it is written | Same. **Re-sealed.** | Same |
| OAuth state of a connection being made: a connector's consent and GitHub linking | Sealed with a key made from the key, ten minutes, not stored [code: openbot/server/src/plugins/oauth.ts:34] [code: openbot/server/src/plugins/oauth.ts:43] [code: openbot/server/src/identity/github-oauth.ts:15] [code: openbot/server/src/identity/github-oauth.ts:16] | A consent started before the change fails its check when the vendor sends the person back. The person presses Connect again | Yes. A stopped server cannot receive the callback, and a person who was halfway has to start again |
| Run identities: the signed statement of which Bot and person a run is for | Signed, ten minutes [code: openbot/server/src/agents/callback-token.ts:37] [code: openbot/server/src/agents/callback-token.ts:45] [code: openbot/server/src/agents/callback-token.ts:142] | A run that was going when the server stopped is gone with the server. A new run is signed with the new key | Yes |
| Hand-offs between members | The queue holds no signature. The signed identity is made when the hop is delivered [code: openbot/server/src/agents/handoff-wiring.ts:64] [code: openbot/server/src/agents/handoff-signing.ts:28] | A hop queued before the stop is delivered after the start, signed with the new key. The one check that reads a signature back, whether a hop comes from the person's own typed message so that no card is needed [code: openbot/server/src/agents/handoff-request.ts:169], does not verify an old one and answers "not known", and the gate then asks the person with a card. That is the safe direction: it asks more, never less | Yes |
| Approvals | An approval waiting for an answer keeps the signed run identity it was opened with [code: openbot/server/src/approvals/execute.ts:148-165]. Read back for carrying the action out, with the signature checked and the expiry not [code: openbot/server/src/agents/callback-token.ts:407] [code: openbot/server/src/index.ts:2049] | The approval is still waiting and still asks. A hand-off approval answered after the change cannot read its identity, so the hand-off runs as a first-level request: depth zero, no hand-off claim, the person as the one who started it, as stored. The count of how many hand-offs follow one another starts again for that one. The person's decision is not weakened. Approvals for connectors and computer tools do not read the identity at all | Yes. Answer what is waiting before you stop, and nothing is affected |
| The key Bots sign web requests with, **only when** `WEB_BOT_AUTH=on` and `WEB_BOT_AUTH_KEY` is unset | Derived from the key with HKDF [code: openbot/server/src/web-bot-auth.ts:47] [code: openbot/server/src/web-bot-auth.ts:159] | The signing key and its key id change. A site that was told to trust the old public key will not recognise the new one until it is given it. The command says so when it sees those two settings | Yes, if no site depends on it. Otherwise set `WEB_BOT_AUTH_KEY` to a key of your own first, so it no longer depends on this one |

Not affected: callback tokens for agents are stored as hashes and do not use the key [code: openbot/server/src/agents/callback-token.ts:51]. The routines worker [code: openbot/worker/src/index.ts], the supervisor and the Bots' computers do not read `KEY_ENCRYPTION_KEY`; only the server does (a search of every source file outside the tests finds it nowhere else but the server, its start-up script and the desktop app). So stopping the server, and checking that nothing else is connected to the database, is enough.

What a new key cannot do: any copy of the database made before, such as an older backup or a snapshot, stays sealed with the old key, which is public. If you think a copy has left your hands, change the passwords and tokens themselves with their providers; sealing them again does not make what already left safe.

## 6. If something goes wrong

Exit codes: 0 done, or nothing to do, or the check found everything in order. 1 something was found wrong or the run failed, and nothing was changed (except as the messages below say). 2 it declined to start: nothing was changed. 3 the database was changed and `.env` could not be. 130 interrupted before anything was changed.

| You see | It means | What to do |
|---|---|---|
| "FreeDuet is running" | The server answered on its port | `bash scripts/stop.sh`, then `docker compose up -d postgres`, then run it again |
| "Something else is connected to the database (…)" | A program holds a connection, and it names it | Close it, stop FreeDuet, start the database alone, run it again |
| "KEY_ENCRYPTION_KEY is also set in your environment…", then "If you did not set KEY_ENCRYPTION_KEY yourself, Bun read it from a file in this folder" | On a system with no `/proc` the command cannot tell your environment from the `.env` Bun read | Type it as `bun --no-env-file scripts/rekey-vault.ts --yes` (or `--apply --yes`). If you did export the key yourself, `unset KEY_ENCRYPTION_KEY` first |
| "Stopped: N saved secrets do not open with the current key", then a table and row ids | Those were sealed with another key, or are damaged. It will not guess | Find the key that sealed them and put it in `.env`; or remove that connection or saved login in the app and add it again; then run the check again |
| "The backup could not be made. pg_dump was not found…" or "…older than the database…" | No usable `pg_dump` | Install the PostgreSQL client tools, of the same major version as the database or newer (17 for the Compose database). For the Compose database it asks Docker to make the copy by itself, when Docker is running |
| "The new key could NOT be written into .env" (exit 3) | The database is sealed with the new key and `.env` still has the old one. **Do not start FreeDuet** | Run `bun scripts/rekey-vault.ts --apply --yes` again: it puts the key from its file into `.env` and does not touch the database. If it cannot write `.env` either, it prints one line that does the same by hand. Delete the key file afterwards |
| "The database did not confirm the last step" (exit 3) | The connection broke at the commit, so it cannot know which way it went. **Do not start FreeDuet** | Run it again. It tries both keys and tells you where things stand. The key file and the backup are kept |
| "Unexpected: the final check failed" | The commit and the `.env` write happened and the last look found something else | Do not start FreeDuet. The new key is in `.env` and in its file, and the backup is kept. Read the message and the two files |
| "Something came up while this was running: …" (after "Done") | The work is done and `.env` has the new key. A server or another program connected after the commit and may have read the old key. `start.sh` leaves a running server alone | `bash scripts/stop.sh`, then `bash scripts/start.sh`. The step list printed with it says the same |
| "The file that kept the new key could not be removed" (after "Done") | The work is done and `.env` has the key. Only the file with the key in it is left | Delete the file it names |
| "Interrupted. Nothing was changed." (exit 130) | You pressed Ctrl-C before the change. One press during the work asks it to stop at the next safe point, where everything is undone, and a second stops it where it is; the database undoes an unfinished transaction by itself | Run it again. If you pressed twice, run it again and it says where things stand |

## 7. Going back

The backup holds the three tables as they were, sealed with the old key. To put them back (FreeDuet stopped, the database running, the database's main user, which is a superuser in the Compose database), from the `openbot` folder:

```
{
  echo "set session_replication_role = replica;"
  echo "delete from public.sso_providers;"
  echo "delete from public.saved_logins;"
  echo "delete from public.credentials;"
  cat .env.vault-backup-<the one you want>.sql
} | docker compose exec -T postgres psql --username openbot --dbname openbot --single-transaction --set ON_ERROR_STOP=1
```

Then put the old key back into `.env`: the line `KEY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`, the example key the rows were sealed with. Without it the restored rows do not open. The backup is from before the change: anything saved since, such as a connection added after FreeDuet was started again, is not in it and is lost by the restore.

The four lines before the backup are needed because other tables point at the rows of `credentials`, so a plain delete or `pg_dump --clean` would be refused or cascade. The first line stops those checks for this one transaction, which is why the database user must be a superuser, and the transaction either puts everything back or nothing. `psql` run on the host, against `DATABASE_URL`, takes the same script on its standard input.

## 8. Built so far

### 8.1 What is built

- `openbot/scripts/rekey-vault.ts`: the entry point. It reads the arguments, handles Ctrl-C and termination, asks for the environment the shell gave it (`shellEnvironment`, section 2) and calls the command. Run as `bun scripts/rekey-vault.ts` from `openbot/`.
- `openbot/server/src/freeduet/vault-rekey.ts`: the part that touches the three tables, using the server's own `encryptSecret` and `decryptSecret`, so there is no second implementation of the cryptography to keep right: counting what opens, sealing again in one transaction with the checks of section 3, the list of other connections, and whether the user can see them.
- `openbot/server/src/freeduet/vault-rekey-command.ts`: the arguments, the environment the shell gave, the checks before any change, the settings file read and written as `start.sh` does it, the backup (host `pg_dump`, and Docker for the Compose database), the order of the steps, the look at what came up meanwhile, the messages, and what is left behind.
- `openbot/scripts/start.sh`: one line. The red warning ends "To change it, run: bun scripts/rekey-vault.ts" where it pointed at the plan.
- Tests, section 8.3. Two helpers: `openbot/server/tests/support/throwaway-database.ts` (a database made for one file, with every migration applied) and `openbot/server/tests/support/vault-fixture.ts` (seven sealed values in the three tables, one plain legacy value, canary secrets).
- Documentation: this file, one sentence in `SECURITY.md`, a paragraph in `openbot/docs/configuration.md`, and rows in `docs/UPSTREAM_TOUCHES.md`.

### 8.2 Choices that are not in the brief

- The Bots' web-signing key (section 5) is mentioned in the command's own text when it applies.
- The same example key exported in the environment is refused (section 3).
- The command says so when its database user cannot see other users' connections (section 4).
- Docker makes the copy when the host has no usable `pg_dump` (decision Q2).
- Added by the review (section 8.6): the command reads the environment the shell gave it and not the one Bun built; a key file that cannot be removed is said and not fatal; the manual way to finish is made under `umask 077`; and the end of the run looks once more for something that came up meanwhile (decisions Q9 and Q10).

### 8.3 Tests and checks

Against a real PostgreSQL 16, one throwaway database per file, every migration applied. `PG_DUMP` points at a stand-in script for every case that is not about `pg_dump` itself, so the cases mean the same where the machine's `pg_dump` is older than its database, as CI's is (client 16, server 17).

- `openbot/server/tests/vault-rekey.integration.test.ts`, 24 tests: the three tables and four columns are the ones `scripts/secrets.sh` asks about, and are in the schema; "sealed" means what the server's own wrapper writes; a key is valid by the server's own rule; looking opens everything and changes nothing; every value opens with the new key to what it held and none with the old, with the rest of each row as it was; a second run changes nothing; a value that does not open stops it before the first write (shown with a counter a rollback does not undo); interruption before the commit and half way leave every row as it was; nothing else can write to the tables while it runs; the five ways the database can do something other than what was asked (a skipped write, a value that comes back as it was, a value sealed with another key, a different secret under the right key, a row that is gone) are each caught, name the table and not a value, and roll back; other connections are counted and named, and a user that cannot see them is told apart.
- `openbot/server/tests/vault-rekey-command.integration.test.ts`, 63 tests (62 run, 1 skips where `pg_dump` is as new as the database): every refusal of section 3; the check; a value that does not open; an empty vault; the change itself (new key in `.env`, mode 600, every row opens with the new key and none with the old, the backup, no key file left, nothing secret in the output); a second run; a stack named by `OPENBOT_ENV_FILE` keeps its own files; no `pg_dump`, a failing one, a short backup; interruption at each of the four stages and a real Ctrl-C sent to the script during the backup; something that connects late, and a table that changed after the backup; the `.env` write failing (the key file, the printed command run in bash, the next run finishing, a writer that lies, a commit the database does not confirm); the backup through a stand-in `pg_dump` and `docker`; and, against a real `pg_dump` and `psql`, the counts, the mode, the sealed data, and the restore of section 7 with a dependent row intact. Added by the review: the script itself run the way the steps say, in a folder with a `.env` Bun reads (the check, the change, a stack named by `OPENBOT_ENV_FILE` beside a `.env` with another key, an exported example key still refused, an exported key of another kind left alone); the refusals when the environment cannot be told from Bun's; a key file that cannot be removed, after a first run and after the run that finishes one; something that connects, or a server that answers, after the commit.
- `openbot/server/tests/vault-rekey-settings.test.ts`, 51 tests: `start.sh`'s `file_setting` and `freeduet_env_line` are taken out of the script and run, and the command's reading and writing must give the same result over seventeen file shapes (and the same file mode); the printed way to finish by hand works from a path with a space and an apostrophe; the arguments; how a dump is counted; the script starts and refuses an unknown option; the environment block read as Linux keeps it, and what is said where it cannot be read; the printed way to finish by hand makes its new file mode 600 from the start under a umask of 022.
- `openbot/scripts/start-restart-guard.test.ts`: the two existing cases that check the warning (a database that holds rows, and one that cannot be asked) also check that it names the command, at the first start and the next.

Fail before: on origin/main the three new files cannot load ("Cannot find module '../src/freeduet/vault-rekey'": 119 tests, none runs). The `start.sh` assertion: 2 of 2 cases fail against the unchanged `start.sh` and pass against the changed one. The review's tests, against the source as it was before the review: the script run the way the steps say fails three times (exit 2 and "also set in your environment" for the check and for `--apply`; and, with a second stack named by `OPENBOT_ENV_FILE`, exit 0 and "leaves it alone" with nothing done); the refusal that says how to start it without a file, the key file that cannot be removed (twice), and what came up after the commit (three) fail on their assertions; the umask case reads mode 644 where 600 is required; the six cases of the environment block cannot load against that source, because the functions they import do not exist. Three cases are guards, true before and after, and say so in the file: the example key a shell really exports is still refused, a different key it exports is left alone, and a run with nothing that came up says nothing of the kind.

Planted defects, each applied to the source in turn and each caught by at least one test (the source was restored and checked each time): the check that a value was replaced removed; the per-value check that it opens with the new key to the same secret removed; the row count check removed; the check that a write happened removed; opening every value before the first write removed; `.env` written before the database is changed (9 tests fail); the running-server check off; the other-connections check off; `--yes` no longer needed; a key that is not the example still changed; the new key printed straight to the output; the old key printed straight to the output; the example key exported in the environment no longer refused; the script ignoring a Ctrl-C. Printing the new key through the command's ordinary output function was not caught, because the filter of section 3 hides it before any test can see it, so it changes nothing a person sees.

### 8.4 Not verified

- **No real installation was re-keyed**, neither the maintainer's (WSL and Docker) nor any other.
- Everything ran against a PostgreSQL 16 on this machine. The Compose database is 17. The real `pg_dump` and `psql` cases run only where the client is as new as the server, so they did not run in CI's arrangement (client 16, server 17), and have never run against 17.
- The backup through Docker (`docker compose exec`) ran against a stand-in `docker` script only, never against Docker.
- The check for a running server ran against a stand-in HTTP server that answers like `/api/capabilities`, never against the real server.
- Windows without WSL has not been run. The file-mode checks do not apply there and are skipped on `win32` [assumed to behave as under WSL on Linux].
- Ctrl-C was sent for real once, during the backup. A signal during the transaction itself is covered by the database's own rollback and by tests that throw at that point, not by a signal.
- The command sees the environment of the shell it was started in. A `KEY_ENCRYPTION_KEY` that is set only in the environment `start.sh` runs in (a service, a watchdog) is not seen. After the change `start.sh` would read it ahead of `.env`.
- Where there is no `/proc/self/environ` (macOS) the command cannot tell an exported key from one Bun read out of `.env`. That path is covered by tests that make the block unreadable and by the message it gives, and has not been run on macOS.
- A watchdog or service that starts FreeDuet again is not prevented. If it brings the server up in the moments between the commit and the `.env` write, the last look (section 3, step 5) finds values sealed with the old key if the server wrote any, and the look that ends the run names a server that answers or a connection that is open. A server that came up in that window and went away again leaves nothing to find.
- The words of the messages have not been read by anyone but their author.

### 8.5 Decisions left to the maintainer

| # | Decision | Built now | Options | Recommendation | Why |
|---|---|---|---|---|---|
| Q1 | Does the check (no `--apply`) need `--yes` too? | Yes. Without `--yes` nothing runs and it prints what it would do | (a) as built; (b) the check runs on its own and only `--apply` needs `--yes` | (a) for now | The brief asks for it, and it is one more word. The check changes nothing, so (b) is friendlier |
| Q2 | A copy through Docker when the host has no usable `pg_dump` | Built, for the database Compose starts here only, after checking it is the same server | (a) as built; (b) stop when the host has no `pg_dump` at least as new as the database | (a) | On WSL and Docker the host often has no matching `pg_dump`. The brief says to stop when `pg_dump` is unavailable; (b) is the strict reading |
| Q3 | Which keys it replaces | Only the published example. Any other key is "nothing to do" | (a) as built; (b) an option to replace a key the person chose, with the same steps | (a) | The brief is about the example key. Rotating a chosen key is a different request |
| Q4 | Where the new key comes from | 32 random bytes from the system's random source, in base64 | (a) as built; (b) run `openssl rand -base64 32` | (a) | The same shape and strength as `start.sh` makes, and no program to find on the path |
| Q5 | Plain-text values in `sso_providers` | Left as they are, counted, and said | (a) as built; (b) seal them with the new key in the same run | (a) | The server seals a plain value the next time it is written [code: openbot/server/src/auth/encrypt-sso-config.ts:66]. Sealing them here would change more than the brief asks |
| Q6 | The backup and the files from interrupted runs | The command never deletes them. It tells the person to delete the backup | (a) as built; (b) delete the backup after the next successful start | (a) | The backup is the only way back, and the command cannot know the person is sure |
| Q7 | A database user that cannot see other users' connections | It says so and goes on | (a) as built; (b) refuse | (a) | The server and the worker use the same user and are always seen. (b) would block a setup where the check is not needed |
| Q8 | A service that restarts FreeDuet by itself | Not prevented. The steps say to switch it off, the command refuses or undoes its work if the server comes up before the commit, and names what came up after it | (a) as built; (b) look for known watchdogs | (a) | There is no list of them in the repository |
| Q9 | No `/proc/self/environ` (macOS): the command cannot tell an exported key from one Bun read out of `.env` | If the key in the environment is the key in `.env` it refuses and says to start it as `bun --no-env-file scripts/rekey-vault.ts ...` | (a) as built; (b) take an equal key for the file's; (c) start itself again without a file | (a) | (b) would let a key the person really exported win over the new one at the next start. (c) cannot work: the second program inherits the first one's environment, which already holds the file's values |
| Q10 | Something came up after the commit and may hold the old key | It is named, the first step becomes `bash scripts/stop.sh`, and the exit code stays 0 | (a) as built; (b) a separate exit code | (a) | The key was changed and `.env` has it, which is what exit 0 says. The person reads the text; nothing runs this command from a script |

Review: this touches the one key everything saved is sealed with, so a second reader went through `vault-rekey.ts` and the order of steps in `vault-rekey-command.ts` before merge. Section 8.6 has what was found.

### 8.6 Independent review (2026-11-14)

By a reader who did not write it. Read: the three source files, their tests, the one line of `start.sh` and the guard test that checks it. Run: the real script, in a folder of its own, against a real PostgreSQL 16, for the check and for the change; two runs started at once, three times; and a connection made between the look and the commit.

**What holds.** Every column the server seals with the key is re-sealed: `credentials.encrypted_value`, `saved_logins.encrypted_password`, `sso_providers.oidc_config` and `.saml_config`. The 95 tables of the schema were searched for any other encrypted or signed column, and every use of the key in the server was followed to the end. The rest is signed and not stored, or stored with a signature only (the run identity inside an approval that waits), and section 5 says what each does. Better Auth's account tokens use `BETTER_AUTH_SECRET`, SCIM tokens come from the environment, and the worker, the supervisor, the Bots' computers and the agent services never read the key. At each point where a run can stop (followed in the code, and in the author's tests that stop it at each stage), the rows and `.env` never name a key that exists nowhere: before the commit the key file and the backup exist and the transaction is undone; after it the key file is kept until `.env` has the key and has been read back. The key file, the backup and the new `.env` are mode 600 from the moment they exist. No key, decrypted value or stored value was found in the output, the error causes, the arguments of `pg_dump` and `docker`, their environment (the database password goes to the host `pg_dump` in `PGPASSWORD`, as section 3 says) or any temporary file.

**Found and changed.**

1. The command as documented could not run. Bun reads the `.env` of the folder it is started in into `process.env`, so the key in `.env` looked like one the person had exported, and the command (and the line `start.sh` prints in red at every start) refused with "also set in your environment" and told the person to unset a variable they had never set. Nothing was changed, so no data was at risk, but the feature did not work for anyone typing the documented command. With a second stack beside it (`.env` with a key of its own, and `OPENBOT_ENV_FILE=.env.eval`) it was worse: the key Bun read from `.env` was taken for an exported one that differs, and the command said "leaves it alone" and exited 0 having done nothing. `scripts/rekey-vault.ts` now passes the environment the shell gave (section 2). Reproduced with the script before the change and covered by the cases listed in section 8.3.
2. The one line printed to finish by hand made its new file, a copy of everything in `.env`, with the usual umask, so it was readable by every user until the `chmod` that follows it. It is now made under `umask 077`.
3. Something that came up between the commit and the end of the run (a watchdog, a service) could hold the old key in memory, and `start.sh` leaves a running server alone, so nothing told the person. The end of the run now looks once more and names it, and the first step becomes `bash scripts/stop.sh`.
4. If the key file could not be removed at the very end, the handler of last resort said "Nothing was changed" about a database that had been. The file is now removed on a best-effort basis: if it stays, that is said, and the run is done.

**Not changed, and why.**

- A closed terminal (SIGHUP) or a closed output pipe is not handled, and was not tried. It ends the command where it stands, which after the commit is the same as a crash: the next `--apply --yes` finishes the work from the key file. Before the commit the database undoes the transaction. Nothing more was added.
- The server reads `PORT` before `SERVER_PORT` [code: openbot/server/src/config.ts], and `start.sh` and this command read `SERVER_PORT`. They agree on every installation `start.sh` made.
- Two runs started in the same second get the same file names one time in 65 536; the second finds the first's file and stops.
- Section 5 names the approval that waits. A sign-in request or a routine's wait for an answer is stored with the same kind of signed identity, but that was not followed separately.
