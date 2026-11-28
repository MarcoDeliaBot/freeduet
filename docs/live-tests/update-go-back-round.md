# FreeDuet: live test, updates that can go back

This checklist checks the update command `bash openbot/scripts/update.sh`. It copies your data first, updates, checks that the app answers, and puts the old version and data back if the update fails. The command came out in v0.2.1 (the CHANGELOG lists it as PR #245). Its checks ran on a test copy. The step that puts the version and data back has not been run live (ROADMAP row 14, "Updates that can go back").

Run live on one installation on 15 November 2026 (ROADMAP row 14): the update was run four times, each time with a database backup taken first. The step that puts the version and data back is not among those runs.

## Before you start

1. **Check the version.** In the folder where FreeDuet is installed, run:

   ```bash
   git log -1 --oneline
   grep -c 'This was only a look' openbot/scripts/update.sh
   ```

   The second command must print a number above 0. If the file is missing, your copy is older than v0.2.1. Then run `git pull --ff-only` in the folder, and then `openbot/scripts/start.sh`. After that, run the check again.

2. **Update if needed.** FreeDuet must be running. From the folder of the installation, run `bash openbot/scripts/update.sh --main`. Wait until it prints `Updated.` or `Already up to date`.

3. **Pause anything that restarts FreeDuet by itself.** A watchdog or a service can start FreeDuet while the update stops it. The command waits up to 75 seconds to see whether something starts it again. Pausing it first is safer. `openbot/docs/configuration.md` says how.

## Rules for this round

- Send no mail. Make no payment.
- The command asks no questions and shows no cards.
- Save nothing extra. The only files this round makes are the copies the command makes, and the test files in steps 3 and 4, which you remove.

## 1. Check mode (about 2 minutes)

**Why.** `--check` looks and changes nothing. It fetches the list of versions from the network first.

**Steps.**

1. Run: `bash openbot/scripts/update.sh --check`
2. Read the output.

**Expected.**

- It shows where the copy will go, the target version, and the five steps.
- It ends with: "This was only a look. Nothing was changed."
- FreeDuet still answers at `http://localhost:3010`.

## 2. Successful update (about 5 minutes)

**Why.** This is the normal path: stop, copy, move, start, check.

**Steps.**

1. Make sure FreeDuet is running.
2. Run: `bash openbot/scripts/update.sh --main`
3. Wait until it finishes.

**Expected.**

- It prints the steps in order: "1 Stopping FreeDuet", "2 Making a copy of your data", "3 Moving to ...", "4 Starting ...", "5 Checking that it answers".
- It ends with "Updated. FreeDuet is now on <version> and answers at http://localhost:3010", or "Already up to date".
- A folder `~/.freeduet/updates/update-<date>-<time>` exists. It holds `database.dump`, `env.copy`, `role-password.sql` and `record.txt`.
- Run `ls -ld ~/.freeduet/updates/update-*` and `ls -l` in that folder. The folder should show `drwx------`, and each file `-rw-------`.

**Send back.** The last lines of the output, and the `ls` lines.

## 3. Refusal: local changes (about 2 minutes)

**Why.** The command refuses when a tracked file has changes of its own. A new file that git does not track does not count.

**Steps.**

1. In the folder of the installation, add a line to a tracked file: `echo "test" >> README.md`
2. Run: `bash openbot/scripts/update.sh --main`
3. Undo your change: `git checkout -- README.md`

**Expected.**

- The command refuses and says "Nothing was changed."
- FreeDuet still answers at `http://localhost:3010`.
- No new copy folder appears.

## 4. Refusal: another database (about 3 minutes)

**Why.** The command copies only the database that Docker starts on this computer. If the settings file names another database, it refuses.

**Steps.**

1. Copy the settings file: `cp openbot/.env openbot/.env.mismatch`. The name matches `.env.*`, which git ignores.
2. Open `openbot/.env.mismatch`. On the `DATABASE_URL` line, change the database name at the end to `openbot_other`. Do not change `openbot/.env`. If `DATABASE_URL` is empty, write "not tested" and skip to step 4.
3. Run: `OPENBOT_ENV_FILE=.env.mismatch bash openbot/scripts/update.sh --main`
4. Delete the copy: `rm openbot/.env.mismatch`

**Expected.**

- The command refuses, because the database is not the one Docker starts here. It says "Nothing was changed."
- FreeDuet still answers at `http://localhost:3010`.
- No new copy folder appears.

## 5. Going back (not run on your only installation)

**Why.** The roadmap says this step has not been run live. It is the most important check.

**Steps.** (to check: the docs give no safe way to force a failure on a real installation.) Do not run this step on the installation that holds your data. Leave it for the maintainer's test copy, or write "not run".

**Expected, on a test copy.**

- Exit code 10: "The update did not go through. You are back where you were: <old version>, with your database and your settings as they were."
- Exit code 20: "Going back did not work:", then commands to run by hand. In this case FreeDuet may be stopped, and you follow the printed commands.
- Run `echo $?` right after the command to read the exit code.

**Send back.** The exit code, and the last lines of the output.

## If something goes wrong

- Note the time of the failure.
- Take a screenshot of the terminal output.
- Note the exact words the command printed, and the exit code.
- Note whether FreeDuet answers at `http://localhost:3010`.
- Note the copy folder's path, if one was made.
- Do not fix anything by hand until you have written these down.

Send these details to the maintainer.
