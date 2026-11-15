#!/usr/bin/env bash
#
# Update this FreeDuet installation to a newer version, and go back to exactly where it was if the
# update does not work. One command, built so that it cannot cost the person their data: nothing is
# changed until a copy of the database and of `.env` exists and has been checked, and every way out
# of a failed update ends at that copy. Design: docs/design/update-and-go-back.md.
#
#   bash openbot/scripts/update.sh [--check] [--to <tag|branch|commit> | --main] [--keep <n>]
#                                  [--watch <seconds>] [--wait <seconds>] [--copies <folder>]
#
# What it does, in order. Each step is said in plain words as it runs.
#   1. Looks. It refuses, and changes nothing, when the checkout has changes of its own, when the
#      database does not answer, or when the new version cannot be reached by moving forward.
#      `--check` stops here.
#   2. Stops FreeDuet (scripts/stop.sh) and waits to see that nothing starts it again.
#   3. Copies the database (`pg_dump -Fc`, taken inside the postgres container with nothing else
#      running, so nothing the person did can be missing from it) and `.env`, into a private folder on
#      this computer with the date in its name.
#   4. Moves the code forward (fast-forward only), `bun install --frozen-lockfile`, and starts FreeDuet
#      (scripts/start.sh), which brings the database up to date.
#   5. Checks that the app and the API answer.
#   6. If anything from step 2 on fails, or step 5 does not pass, goes back: the code, the database
#      and `.env` from the copy, then starts the old version again and checks it.
#
# Exit codes
#    0  updated, or there was nothing newer to update to
#   10  the update did not work and everything is back as it was
#   20  the person has to finish by hand; the exact commands are printed
#    1  it refused to start (or was asked something it cannot do) and changed nothing
#
# Ctrl-C. Before anything was changed it just stops (exit 1). After the stop it does not start going
# back by itself while the person is at the keyboard: it exits 20 and prints what to run, which is the
# same list it prints when going back fails. Once the update has worked, and only the tidying of the
# older copies is left, a Ctrl-C ends with exit 0: the update is done and nothing is printed to go back
# with. If it is stopped while the database is being put back, it says that the database may be half
# restored and that the printed commands are to be run again from the first one.
#
# THE COPY IS CHECKED AGAIN BEFORE IT IS USED. Putting the database back starts by dropping it, so a
# copy that has changed since it was made must never be restored from: its sha256 is recorded when it is
# made, and checked, with `pg_restore --list`, right before the restore. A copy that fails is not used,
# and the database is not touched.
#
# WHOSE POSTGRES. `docker compose` finds a stack by its project name, and with no COMPOSE_PROJECT_NAME the
# project is named after the folder, so two checkouts that both sit in a folder called "openbot" share
# containers. Before anything is stopped, the postgres container that Compose resolves has to be this
# checkout's (its labels name the folder) and this settings file's project (the second stack on a
# machine, .env.eval, has a project of its own); if it is not, or cannot be told, this refuses.
#
# NO `set -e`. A script that goes back from a failure has to look at every failure itself: under
# `-e` a command that fails inside a function called from an `if` does not stop anything, and one
# that fails anywhere else ends the run in the middle of a move with no way back printed. Every step
# is checked, and the EXIT trap below is the net under the ones that were not.
#
# THE SCRIPT IS IN THE CHECKOUT IT MOVES. A merge may replace this very file while bash is still
# reading it, so everything is a function and the last line runs `main` and leaves: bash never reads
# on from a file that changed under it.
#
# The copy holds every secret `.env` and the database hold, so it is a private folder (700, files
# 600) and nothing here prints a value out of either. Passwords are never on a command line.

# Before anything else, and before the `set` line below, which is itself bash-only. See that file.
. "$(dirname "$0")/require-bash.sh"

set -uo pipefail

INVOKED_FROM="$PWD"
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd -P)"
# The checkout this directory sits in: where scripts/start.sh and scripts/stop.sh are, and the thing
# that is moved.
REPO_ROOT="$(dirname "$ROOT")"
# Which settings file this stack is, as in start.sh and stop.sh.
ENV_NAME="${OPENBOT_ENV_FILE:-.env}"
ENV_FILE="$ROOT/$ENV_NAME"

# The one database this command copies: the one Docker Compose starts. Its user and name are fixed in
# docker-compose.yml (POSTGRES_USER, POSTGRES_DB); only the password is the person's.
PG_USER=openbot
PG_DB=openbot

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
info()  { printf '\033[2m%s\033[0m\n' "$1"; }
say()   { printf '%s\n' "$1"; }

compose() {
  if [ "$ENV_NAME" = .env ]; then
    docker compose "$@"
  else
    docker compose --env-file "$ENV_FILE" "$@"
  fi
}

# The checkout, from anywhere.
git_() { git -C "$REPO_ROOT" "$@"; }

# What the person asked for.
TARGET_REF=""
USE_MAIN=false
CHECK_ONLY=false
KEEP=5
WATCH=75
WAIT=120
COPIES=""

# Where the run has got to, which is what the EXIT trap goes by.
#   prepare  nothing has been changed
#   stopped  FreeDuet was stopped; the copy may not exist yet
#   copied   the copy exists and has been checked; the code and the database are as they were
#   moved    the code was moved forward
#   started  the new version was started, which is what migrates the database
#   finished it worked
PHASE=prepare
FINAL=false
LOCK_HELD=false
LOCK=""
RUN_DIR=""
COPY_MADE=false
CODE_MOVED=false
DB_TOUCHED=false
HAVE_ROLE_FILE=false
FINGERPRINT=""
# The sha256 of database.dump as it was when it was checked and kept; the tool this computer has for it;
# and whether the copy failed its check just before it was to be used.
DUMP_SHA256=""
SHA_TOOL=""
DUMP_BAD=false
# True while the database is being put back from the copy: a stop in that time can leave it half done.
RESTORING=false
# The Docker Compose project of the postgres container this run is about, as that container says.
COMPOSE_PROJECT=""
FETCH_FAILED=false
RELATION=""
OLD_SHA=""
OLD_SHORT=""
OLD_LABEL=""
BRANCH=""
TARGET_SHA=""
TARGET_SHORT=""
TARGET_NAME=""
TARGET_LABEL=""
# APP_PORT, SERVER_PORT and POSTGRES_PORT are not given a value here on purpose: setting() asks the
# environment first by the variable's own name, so a default assigned at this level would hide both the
# person's environment and the settings file. main() resolves them: environment, .env, then the default.

# A value from the settings file alone: the last line wins, quotes are dropped.
file_setting() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true
}

# The environment first, then .env, then the default: the resolution order start.sh and stop.sh use.
setting() {
  local name="$1" fallback="$2" value="${!1:-}"
  if [ -z "$value" ]; then
    value="$(file_setting "$name")"
  fi
  printf '%s' "${value:-$fallback}"
}

# A path as the person can paste it into a shell, whatever is in it.
shq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null; }

human_size() {
  awk -v b="$1" 'BEGIN {
    if (b >= 1073741824) printf "%.1f GB", b / 1073741824
    else if (b >= 1048576) printf "%.1f MB", b / 1048576
    else printf "%.0f KB", b / 1024 }'
}

# The tool this computer has for a sha256, as the person would type it. Looked for before anything is
# changed: the copy of the database is checked with it twice, and a computer with neither cannot do that.
find_sha_tool() {
  if type -P sha256sum >/dev/null 2>&1; then
    SHA_TOOL="sha256sum"
  elif type -P shasum >/dev/null 2>&1; then
    SHA_TOOL="shasum -a 256"
  else
    return 1
  fi
}

# The sha256 of a file, and nothing else; empty when it cannot be read.
sha256_of() {
  case "$SHA_TOOL" in
    sha256sum) sha256sum "$1" 2>/dev/null | cut -d' ' -f1 ;;
    *) shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1 ;;
  esac
}

# Does whatever holds this port answer as OpenBot, rather than merely answer? The same two questions
# start.sh and stop.sh ask: a field only this server's payload has, and the marker in the app's head.
identifies_as_openbot() {
  local port="$1" name="$2"
  case "$name" in
    server)
      curl -fsS --max-time 3 "http://localhost:$port/api/capabilities" 2>/dev/null \
        | grep '"durableHistory"' >/dev/null
      ;;
    app)
      curl -fsS --max-time 3 "http://localhost:$port/" 2>/dev/null \
        | grep -iE '<meta name="openbot" content="app"|<title>[^<]*OpenBot' >/dev/null
      ;;
  esac
}

# One value out of the database, asked inside the postgres container, whose socket trusts the local
# user: no password is needed and none is on a command line.
sql_value() {
  compose exec -T postgres psql -U "$PG_USER" -d "$1" -tA -v ON_ERROR_STOP=1 -c "$2" </dev/null 2>/dev/null \
    | tr -d '\r' | sed -n '1p'
}

# ---------------------------------------------------------------------------------------------------
# Ways out
# ---------------------------------------------------------------------------------------------------

refuse() {
  local line
  for line in "$@"; do red "$line"; done
  red "Nothing was changed."
  FINAL=true
  exit 1
}

# The folder of this run, when no copy was made in it: there is nothing in it worth keeping.
forget_stub_folder() {
  local name
  [ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ] && [ ! -L "$RUN_DIR" ] || return 0
  name="${RUN_DIR##*/}"
  [[ "$name" =~ ^update-[0-9]{8}-[0-9]{6}$ ]] || return 0
  [ -e "$RUN_DIR/database.dump" ] && return 0
  rm -rf -- "$RUN_DIR"
  RUN_DIR=""
}

# The copy failed its check just before the restore, so the restore was not made. A restore from a
# damaged copy drops the database first and then stops, so no command that restores from it is printed:
# the person gets how to check the copy, and how to run the new version again on the database as it is.
print_bad_copy_commands() {
  local compose_cmd="$1" with_env="$2" dump="$RUN_DIR/database.dump"
  say "The copy of your database, $dump,"
  say "did not pass the check made just before it was to be used, so it was not used, and your database"
  say "was not touched. Do NOT restore from it: a restore from a damaged copy deletes the database first"
  say "and then stops."
  say ""
  say "Your database is as the new version left it. FreeDuet is stopped; the code is back on $OLD_LABEL and"
  say "your settings are as they were."
  say ""
  say "To check the copy yourself, run these. The first must say OK; the second must list what is in the"
  say "copy and not stop on an error:"
  say ""
  if [ -n "$DUMP_SHA256" ]; then
    say "  echo $(shq "$DUMP_SHA256  $dump") | $SHA_TOOL -c -"
  fi
  say "  $compose_cmd up -d postgres"
  say "  $compose_cmd exec -T postgres pg_restore --list < $(shq "$dump") > /dev/null"
  say ""
  say "If you have another copy of that file that passes both, restore your database from that one."
  say ""
  say "To run $TARGET_LABEL again on your database as it is now, run these in this order:"
  say ""
  say "  cd $(shq "$ROOT")"
  say "  git -C $(shq "$REPO_ROOT") merge --ff-only $TARGET_SHA"
  say "  bun install --frozen-lockfile"
  say "  ${with_env}bash $(shq "$REPO_ROOT/scripts/start.sh")"
  say ""
  say "If something on this computer starts FreeDuet by itself (a watchdog or a service), pause it before you run these."
  say "The copy is in $RUN_DIR. It holds all your secrets. Keep it private."
}

# The commands to go back by hand, for the person to read and run. Only paths and flags: no value out
# of `.env` or the database is in them (the checksum is neither).
print_hand_commands() {
  local compose_cmd="docker compose" with_env=""
  if [ "$ENV_NAME" != .env ]; then
    compose_cmd="docker compose --env-file $(shq "$ENV_NAME")"
    # start.sh and stop.sh read which settings file is meant from this variable, so it goes in front
    # of them: a terminal opened later does not have it.
    with_env="OPENBOT_ENV_FILE=$(shq "$ENV_NAME") "
  fi
  say ""
  if [ "$DUMP_BAD" = true ]; then
    print_bad_copy_commands "$compose_cmd" "$with_env"
  elif [ -n "$RUN_DIR" ] && [ -f "$RUN_DIR/database.dump" ] && [ -f "$RUN_DIR/env.copy" ] && [ -n "$OLD_SHA" ]; then
    say "To go back by hand, run these in this order, in a terminal. Nothing here deletes your copy."
    say ""
    say "  cd $(shq "$ROOT")"
    say "  ${with_env}bash $(shq "$REPO_ROOT/scripts/stop.sh")"
    say "  git -C $(shq "$REPO_ROOT") reset --hard $OLD_SHA"
    say "  cp $(shq "$RUN_DIR/env.copy") $(shq "$ENV_FILE")"
    say "  bun install --frozen-lockfile"
    say "  $compose_cmd up -d postgres"
    if [ -n "$DUMP_SHA256" ]; then
      # The restore below starts by dropping the database. This stops a copy that is not the one that
      # was checked from reaching it: the line must say OK before the next one is run.
      say "  echo $(shq "$DUMP_SHA256  $RUN_DIR/database.dump") | $SHA_TOOL -c -"
    fi
    say "  $compose_cmd exec -T postgres pg_restore --exit-on-error --clean --create --if-exists --no-owner -U $PG_USER -d postgres < $(shq "$RUN_DIR/database.dump")"
    if [ "$HAVE_ROLE_FILE" = true ]; then
      say "  $compose_cmd exec -T postgres psql -U $PG_USER -d postgres -v ON_ERROR_STOP=1 -q < $(shq "$RUN_DIR/role-password.sql")"
    fi
    say "  ${with_env}bash $(shq "$REPO_ROOT/scripts/start.sh")"
    say ""
    say "Your database and your settings are in the copy at $RUN_DIR"
    say "That folder holds all your secrets. Keep it private."
    say "If something on this computer starts FreeDuet by itself (a watchdog or a service), pause it before you run these."
  else
    say "FreeDuet may be stopped. Your database, your settings and your code were not changed."
    say "To start it again, run: ${with_env}bash $(shq "$REPO_ROOT/scripts/start.sh")"
  fi
}

record() {
  [ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ] || return 0
  ( umask 077; printf '%s=%s\n' "$1" "$2" >> "$RUN_DIR/record.txt" )
}

finish_updated() {
  FINAL=true
  record result updated
  record finished "$(date +%Y-%m-%dT%H:%M:%S)"
  exit 0
}

finish_went_back() {
  FINAL=true
  record result went-back
  record finished "$(date +%Y-%m-%dT%H:%M:%S)"
  forget_stub_folder
  exit 10
}

finish_needs_person() {
  FINAL=true
  record result needs-person
  record finished "$(date +%Y-%m-%dT%H:%M:%S)"
  exit 20
}

# The update worked and was checked; only the tidying of the older copies was cut short. That is not a
# failed update, so there is nothing to go back to and nothing is printed to go back with. The result
# stays "updated", and the copies that were not tidied are left for the next update.
# shellcheck disable=SC2329  # run by the traps in main
updated_but_not_tidied() {
  green "The update is done: FreeDuet is on $TARGET_LABEL and answers at http://localhost:$APP_PORT"
  say "$1 Some of the older copies may be left over; the next update tidies them."
  say "A copy of what you had before is in $RUN_DIR"
  finish_updated
}

# Going back did not work. Print how to finish it by hand and stop.
give_up() {
  red ""
  red "Going back did not work: $1"
  red "The update did not go through, and FreeDuet is not back where it was yet. Nothing was deleted."
  print_hand_commands
  finish_needs_person
}

# The safety net. Whatever ends the script before it has said how it ended (a command that was not
# checked, an unset variable, Ctrl-C, a closed terminal), once something has been changed it must not
# leave the person with a stopped stack and no instructions.
# shellcheck disable=SC2329  # run by the traps in main
on_exit() {
  local status=$?
  if [ "$LOCK_HELD" = true ] && [ -n "$LOCK" ]; then
    rm -rf "$LOCK" 2>/dev/null
    LOCK_HELD=false
  fi
  if [ "$FINAL" = false ] && [ "$PHASE" = finished ]; then
    red ""
    red "The script stopped after the update was done."
    updated_but_not_tidied "Tidying the older copies did not finish."
  fi
  if [ "$FINAL" = false ] && [ "$PHASE" != prepare ]; then
    FINAL=true
    red ""
    red "The update stopped before it finished (exit $status), and FreeDuet may be stopped."
    if [ "$RESTORING" = true ]; then
      red "The database was being put back from the copy when it stopped, so it may be only half restored."
      red "Do not start FreeDuet on it. Run the commands below again, from the first one: they put the database back whole."
    fi
    print_hand_commands
    record result needs-person
    forget_stub_folder
    exit 20
  fi
}

# shellcheck disable=SC2329  # run by the traps in main
on_signal() {
  red ""
  red "Interrupted."
  case "$PHASE" in
    prepare)
      FINAL=true
      exit 1
      ;;
    finished)
      updated_but_not_tidied "Tidying the older copies did not finish."
      ;;
  esac
  exit 20
}

# ---------------------------------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: bash openbot/scripts/update.sh [options]

Updates this FreeDuet installation to a newer version. Before it changes anything it copies your
database and your settings (.env) into a private folder on this computer. If the update does not
work it goes back to where you were, using that copy, and says so.

  --check            Show what it would do and change nothing.
  --to <ref>         Update to this tag, branch or commit instead of the newest release.
  --main             Update to the newest development version (origin/main) instead of the newest
                     release.
  --keep <n>         Keep the newest n copies (default 5). The copy made in this run is never deleted.
  --watch <seconds>  After stopping FreeDuet, wait this long to see whether something starts it again
                     (a watchdog). Default 75. 0 does not wait.
  --wait <seconds>   How long to wait for the app and the API to answer at the end. Default 120.
  --copies <folder>  Where the copies go. Default: ~/.freeduet/updates

Exit codes: 0 updated (or nothing newer), 10 it did not work and you are back where you were,
20 you have to finish by hand (the commands are printed), 1 it did not start and changed nothing.
EOF
}

# `--option value`: there is a value, and it is not the next option.
need_value() {
  [ $# -ge 2 ] && [ -n "$2" ] && case "$2" in --*) false ;; *) true ;; esac
}

parse_args() {
  local number='^[0-9]+$' ref_ok='^[A-Za-z0-9][A-Za-z0-9._/@+^~-]*$'
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help) usage; FINAL=true; exit 0 ;;
      --check) CHECK_ONLY=true; shift ;;
      --main) USE_MAIN=true; shift ;;
      --to)
        need_value "$@" || refuse "--to needs a tag, a branch or a commit. Try --help."
        TARGET_REF="$2"; shift 2 ;;
      --keep)
        need_value "$@" && [[ "$2" =~ $number ]] && [ "${#2}" -le 4 ] || refuse "--keep needs a number, such as --keep 5."
        KEEP="$2"; shift 2 ;;
      --watch)
        need_value "$@" && [[ "$2" =~ $number ]] && [ "${#2}" -le 4 ] || refuse "--watch needs a number of seconds, such as --watch 75."
        WATCH="$2"; shift 2 ;;
      --wait)
        need_value "$@" && [[ "$2" =~ $number ]] && [ "${#2}" -le 4 ] && [ "$2" -ge 1 ] || refuse "--wait needs a number of seconds, such as --wait 120."
        WAIT="$2"; shift 2 ;;
      --copies)
        need_value "$@" || refuse "--copies needs a folder."
        case "$2" in
          /*) COPIES="$2" ;;
          *) COPIES="$INVOKED_FROM/$2" ;;
        esac
        shift 2 ;;
      *) refuse "Unknown argument: $1. Try --help." ;;
    esac
  done
  if [ -n "$TARGET_REF" ] && [ "$USE_MAIN" = true ]; then
    refuse "Use --to or --main, not both."
  fi
  if [ -n "$TARGET_REF" ] && ! [[ "$TARGET_REF" =~ $ref_ok ]]; then
    refuse "--to: that is not a tag, a branch or a commit name: $TARGET_REF"
  fi
  return 0
}

# ---------------------------------------------------------------------------------------------------
# Step 1: look
# ---------------------------------------------------------------------------------------------------

# Is the database in `.env` the one Docker Compose starts here? That is the only one this copies. No
# line at all is fine: start.sh writes the Compose one.
database_is_compose_one() {
  local url user host port database
  local shape='^postgres(ql)?://([^:@/]*)(:[^@]*)?@(\[[^]]+\]|[^:/@?#]+)(:([0-9]+))?/([^?#]*)'
  url="$(setting DATABASE_URL "")"
  [ -z "$url" ] && return 0
  [[ "$url" =~ $shape ]] || return 1
  user="${BASH_REMATCH[2]}"
  host="${BASH_REMATCH[4]}"
  port="${BASH_REMATCH[6]:-5432}"
  database="${BASH_REMATCH[7]}"
  case "$host" in localhost|127.0.0.1|'[::1]') ;; *) return 1 ;; esac
  [ "$user" = "$PG_USER" ] && [ "$database" = "$PG_DB" ] && [ "$port" = "$POSTGRES_PORT" ]
}

check_tools() {
  local tool
  for tool in git docker bun curl; do
    type -P "$tool" >/dev/null 2>&1 || refuse "$tool is not installed, or is not on the PATH of this shell. This command needs git, docker, bun and curl."
  done
  docker compose version >/dev/null 2>&1 || refuse "docker compose does not answer. Is Docker running?"
  find_sha_tool || refuse "Neither sha256sum nor shasum is installed. This command checks its copy of your database with one of them, before it is used."
}

check_checkout() {
  local git_dir marker changes
  if [ "$(git_ rev-parse --is-inside-work-tree 2>/dev/null || true)" != true ]; then
    refuse "$REPO_ROOT is not a git checkout." \
      "This command updates a checkout made with git (the installer makes one). A downloaded zip cannot be updated this way."
  fi
  OLD_SHA="$(git_ rev-parse HEAD 2>/dev/null || true)"
  [ -n "$OLD_SHA" ] || refuse "Could not read which version this checkout is on (git rev-parse HEAD failed)."
  OLD_SHORT="$(git_ rev-parse --short "$OLD_SHA" 2>/dev/null || true)"
  [ -n "$OLD_SHORT" ] || OLD_SHORT="${OLD_SHA:0:7}"
  BRANCH="$(git_ symbolic-ref --short -q HEAD 2>/dev/null || true)"
  OLD_LABEL="$(git_ describe --tags --always 2>/dev/null || true)"
  [ -n "$OLD_LABEL" ] || OLD_LABEL="$OLD_SHORT"

  git_dir="$(git_ rev-parse --git-dir 2>/dev/null || true)"
  case "$git_dir" in
    /*) ;;
    *) git_dir="$REPO_ROOT/$git_dir" ;;
  esac
  for marker in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG rebase-merge rebase-apply; do
    if [ -e "$git_dir/$marker" ]; then
      refuse "A git operation is half done in this checkout ($marker). Finish it or abandon it first, then run this again."
    fi
  done

  changes="$(git_ status --porcelain --untracked-files=no 2>/dev/null || true)"
  if [ -n "$changes" ]; then
    red "This checkout has changes of its own that an update would not keep:"
    printf '%s\n' "$changes" | sed -n '1,10p' | while IFS= read -r line; do red "  $line"; done
    refuse "Put them away first (git stash), or throw them away if they are not yours. Then run this again."
  fi
}

check_database() {
  local answer
  answer="$(sql_value "$PG_DB" "select 1" || true)"
  if [ "$answer" != 1 ]; then
    refuse "The database does not answer, so there is nothing to copy." \
      "FreeDuet has to be running to be updated. Start it with: bash scripts/start.sh, and run this again."
  fi
  if ! database_is_compose_one; then
    refuse "$ENV_NAME points FreeDuet at a database that is not the one Docker starts here (another host, port, user or database)." \
      "This command copies only that one, so it cannot protect yours. Update by hand, or move to the Docker database first."
  fi
}

# One label that Docker Compose put on a container; empty when there is none.
container_label() {
  local value
  value="$(docker inspect --format "{{ index .Config.Labels \"$2\" }}" "$1" 2>/dev/null | tr -d '\r' | sed -n '1p')"
  [ "$value" = "<no value>" ] && value=""
  printf '%s' "$value"
}

# Is this folder the folder of this installation, by its name and then by where it really is?
is_this_folder() {
  [ -n "$1" ] || return 1
  [ "$1" = "$ROOT" ] && return 0
  [ -d "$1" ] && [ "$(cd "$1" 2>/dev/null && pwd -P)" = "$ROOT" ]
}

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# The postgres container that `docker compose` finds here has to be this installation's: in this
# checkout, and in the Docker project this settings file names. Compose finds a stack by its project
# name, and with no COMPOSE_PROJECT_NAME that is the name of the folder, so two checkouts that both sit
# in a folder called "openbot" share their containers, and a command run in one would copy, stop and
# restore the other's database. The second stack of a machine (.env.eval) is the same checkout with a
# project of its own: the folder cannot tell the two apart, the project can.
check_compose_project() {
  local ids count id project working_dir config_files first belongs from_shell from_file named
  ids="$(compose ps --quiet postgres 2>/dev/null | tr -d '\r' | sed '/^$/d' || true)"
  count="$(printf '%s' "$ids" | sed -n '$=')"
  if [ "${count:-0}" != 1 ]; then
    refuse "Docker does not show exactly one database container for this folder (it shows ${count:-0}), so this cannot tell which one is this installation's."
  fi
  id="$ids"
  project="$(container_label "$id" com.docker.compose.project)"
  working_dir="$(container_label "$id" com.docker.compose.project.working_dir)"
  config_files="$(container_label "$id" com.docker.compose.project.config_files)"
  if [ -z "$project" ] || { [ -z "$working_dir" ] && [ -z "$config_files" ]; }; then
    refuse "Docker would not say which folder and which Docker project the database container belongs to, so this cannot be sure it is this installation's." \
      "Update by hand."
  fi

  belongs=false
  first="${config_files%%,*}"
  is_this_folder "$working_dir" && belongs=true
  if [ "$belongs" = false ] && [ -n "$first" ] && is_this_folder "$(dirname "$first")"; then
    belongs=true
  fi
  if [ "$belongs" = false ]; then
    refuse "The database container that Docker finds for this folder belongs to another folder: ${working_dir:-$config_files} (Docker project $project)." \
      "Two FreeDuet folders that share a Docker project name share their containers, so stopping or copying from here could act on the other one's database." \
      "Give each folder its own COMPOSE_PROJECT_NAME (docs/configuration.md, the part about two deployments on one Docker host), or update by hand."
  fi

  from_shell="${COMPOSE_PROJECT_NAME:-}"
  from_file="$(file_setting COMPOSE_PROJECT_NAME)"
  if [ -n "$from_shell" ] && [ -n "$from_file" ] && [ "$(lower "$from_shell")" != "$(lower "$from_file")" ]; then
    refuse "COMPOSE_PROJECT_NAME is set in this shell ($from_shell) and is different in $ENV_NAME ($from_file). Docker uses the shell's, which can be another stack's."
  fi
  named="${from_shell:-$from_file}"
  if [ -n "$named" ] && [ "$(lower "$named")" != "$(lower "$project")" ]; then
    refuse "$ENV_NAME names the Docker project $named, but the database container that Docker found is in the project $project." \
      "Copying it would copy another stack's database."
  fi
  COMPOSE_PROJECT="$project"
}

# The folder for the copies must be outside the repository. The copy holds every secret, and a git
# command run in the repository (add, clean, stash) could publish or delete it. Where it really is
# counts, links resolved, even when the folder is not made yet: the nearest folder that exists is
# resolved and the rest is put after it.
check_copies_folder() {
  local path="$COPIES" tail="" head base where
  while [ ! -d "$path" ] && [ "$path" != / ] && [ -n "$path" ]; do
    base="${path##*/}"
    if [ "$base" = .. ]; then
      refuse "--copies: $COPIES goes through '..' where the folder does not exist yet. Write the folder out in full."
    fi
    tail="/$base$tail"
    head="${path%/*}"
    [ "$head" = "$path" ] && break
    path="${head:-/}"
  done
  where="$(cd "$path" 2>/dev/null && pwd -P)" || return 0
  case "$where$tail/" in
    "$REPO_ROOT"/*)
      refuse "The folder for the copies is inside the repository: $COPIES" \
        "The copy holds all your secrets, and a git command run there (add, clean, stash) could publish or delete it." \
        "Use --copies <folder> with a folder outside $REPO_ROOT."
      ;;
  esac
}

# The newest release tag: v1.2 or v1.2.3, not a pre-release.
newest_release_tag() {
  local tags tag release='^v[0-9]+\.[0-9]+(\.[0-9]+)?$'
  tags="$(git_ tag --list 'v[0-9]*' --sort=-v:refname 2>/dev/null || true)"
  while IFS= read -r tag; do
    if [[ "$tag" =~ $release ]]; then
      printf '%s' "$tag"
      return 0
    fi
  done <<EOF
$tags
EOF
  return 1
}

# What --to <name> means here, and it says which one it took. A name can be a tag, a local branch, a
# branch on origin (origin/<name>) or a commit. A local branch is whatever it was when it was last
# updated, which may be long ago, while origin/<name> was just fetched: so when both exist and the local
# one is behind, origin/<name> is the one meant. A local branch that has commits origin does not have is
# the person's own, and is used as it is.
resolve_named_ref() {
  local name="$TARGET_REF" here there kind
  here="$(git_ rev-parse --verify --quiet "$name^{commit}" 2>/dev/null || true)"
  there="$(git_ rev-parse --verify --quiet "origin/$name^{commit}" 2>/dev/null || true)"
  if git_ show-ref --verify --quiet "refs/tags/$name" 2>/dev/null; then
    kind="the tag $name"
  elif git_ show-ref --verify --quiet "refs/heads/$name" 2>/dev/null; then
    kind="the local branch $name"
  else
    kind="$name"
  fi
  TARGET_SHA=""
  TARGET_NAME="$name"
  if [ -n "$here" ] && [ -n "$there" ] && [ "$here" != "$there" ]; then
    if git_ merge-base --is-ancestor "$here" "$there" 2>/dev/null; then
      TARGET_SHA="$there"
      TARGET_NAME="origin/$name"
      info "  --to $name: using origin/$name, because $kind is behind it"
    else
      TARGET_SHA="$here"
      info "  --to $name: using $kind, which has commits that origin/$name does not have"
    fi
  elif [ -n "$here" ]; then
    TARGET_SHA="$here"
    info "  --to $name: using $kind"
  elif [ -n "$there" ]; then
    TARGET_SHA="$there"
    TARGET_NAME="origin/$name"
    info "  --to $name: using origin/$name"
  fi
}

# Where this is going, and how it relates to where we are. Sets TARGET_SHA, TARGET_NAME and RELATION:
# "same", "ahead" (the target is newer), "behind" (the target is older) or "diverged".
resolve_target() {
  if ! git_ fetch --quiet --tags origin >/dev/null 2>&1; then
    FETCH_FAILED=true
  fi
  if [ "$USE_MAIN" = true ]; then
    TARGET_NAME="origin/main"
    TARGET_SHA="$(git_ rev-parse --verify --quiet "origin/main^{commit}" 2>/dev/null || true)"
  elif [ -n "$TARGET_REF" ]; then
    resolve_named_ref
  else
    TARGET_NAME="$(newest_release_tag || true)"
    if [ -z "$TARGET_NAME" ]; then
      if [ "$FETCH_FAILED" = true ]; then
        refuse "Could not reach the repository to see which version is newest (git fetch failed). Check the connection and run this again."
      fi
      refuse "No release has been published to move to. Use --main for the development version, or --to <tag|branch|commit>."
    fi
    TARGET_SHA="$(git_ rev-parse --verify --quiet "$TARGET_NAME^{commit}" 2>/dev/null || true)"
  fi
  if [ -z "$TARGET_SHA" ]; then
    if [ "$FETCH_FAILED" = true ]; then
      refuse "Could not reach the repository (git fetch failed), and ${TARGET_REF:-$TARGET_NAME} is not known here." \
        "Check the connection and run this again."
    fi
    refuse "Cannot find ${TARGET_REF:-$TARGET_NAME} in this repository. Check the name."
  fi
  if [ "$FETCH_FAILED" = true ]; then
    info "Could not reach the repository, so this uses the versions already downloaded."
  fi
  TARGET_SHORT="$(git_ rev-parse --short "$TARGET_SHA" 2>/dev/null || true)"
  [ -n "$TARGET_SHORT" ] || TARGET_SHORT="${TARGET_SHA:0:7}"
  TARGET_LABEL="$TARGET_NAME ($TARGET_SHORT)"

  if [ "$TARGET_SHA" = "$OLD_SHA" ]; then
    RELATION=same
  elif git_ merge-base --is-ancestor "$OLD_SHA" "$TARGET_SHA" 2>/dev/null; then
    RELATION=ahead
  elif git_ merge-base --is-ancestor "$TARGET_SHA" "$OLD_SHA" 2>/dev/null; then
    RELATION=behind
  else
    RELATION=diverged
  fi
}

# A file the new version adds, where this checkout already has one of its own that git does not
# track: the merge would stop on it, after FreeDuet had been stopped. Better to say so now.
check_nothing_in_the_way() {
  local path clash=""
  while IFS= read -r -d '' path; do
    if [ -e "$REPO_ROOT/$path" ] && ! git_ check-ignore -q -- "$path" 2>/dev/null; then
      clash="$clash $path"
    fi
  done < <(git_ -c core.quotepath=off diff -z --name-only --diff-filter=A "$OLD_SHA" "$TARGET_SHA" 2>/dev/null)
  if [ -n "$clash" ]; then
    refuse "These files are in the new version and in your folder, where git does not know them:$clash" \
      "Move them away, then run this again."
  fi
}

check_disk_space() {
  local size_bytes probe available_kb needed_kb
  size_bytes="$(sql_value "$PG_DB" "select pg_database_size(current_database())" || true)"
  [[ "$size_bytes" =~ ^[0-9]+$ ]] || return 0
  probe="$COPIES"
  while [ ! -d "$probe" ] && [ "$probe" != / ] && [ "$probe" != . ]; do probe="$(dirname "$probe")"; done
  available_kb="$(df -Pk "$probe" 2>/dev/null | awk 'NR == 2 { print $4 }')"
  [[ "$available_kb" =~ ^[0-9]+$ ]] || return 0
  needed_kb=$(( size_bytes / 1024 + size_bytes / 10240 + 1024 ))
  if [ "$available_kb" -lt "$needed_kb" ]; then
    refuse "Not enough room for the copy: the database is $(human_size "$size_bytes") and the folder for the copies has $(human_size $(( available_kb * 1024 ))) free." \
      "Free some space, or use --copies <folder> on a bigger disk."
  fi
}

print_plan() {
  local ahead
  ahead="$(git_ rev-list --count "$OLD_SHA..$TARGET_SHA" 2>/dev/null || true)"
  say "Where you are:   $OLD_LABEL${BRANCH:+, on branch $BRANCH}"
  say "Going to:        $TARGET_LABEL${ahead:+, $ahead changes newer}"
  say "Docker project:  $COMPOSE_PROJECT (the database it copies is the one of this folder)"
  say "The copy goes:   $COPIES/update-<date and time>"
  say ""
  say "Checked: no changes of your own in this folder, the database answers, and $TARGET_NAME is ahead of"
  say "where you are, so moving there goes forward only."
  say ""
  say "What it will do, in order:"
  say "  1. Stop FreeDuet. It is off from here until the end, which takes several minutes."
  say "  2. Copy your database and your settings (.env) into that private folder, with nothing else"
  say "     running, so nothing you did can be missing from the copy."
  say "  3. Move the code to $TARGET_LABEL and install what it needs."
  say "  4. Start FreeDuet again, which brings the database up to date."
  say "  5. Check that the app and the API answer, for about $WAIT seconds."
  say "If any of that fails, it goes back: the code, the database and the settings from the copy, and"
  say "it starts the version you had. Then it tells you plainly that the update did not go through."
  say ""
  say "Before you go on: pause anything that restarts FreeDuet by itself (a watchdog or a service). It would start FreeDuet again in the middle of the update."
  say ""
}

# ---------------------------------------------------------------------------------------------------
# The lock, and the private folder
# ---------------------------------------------------------------------------------------------------

take_lock() {
  local other i
  LOCK="$ROOT/.logs/update.lock"
  ( umask 077; mkdir -p "$ROOT/.logs" ) 2>/dev/null
  if ! mkdir "$LOCK" 2>/dev/null; then
    other="$(cat "$LOCK/pid" 2>/dev/null || true)"
    # A run that has just made the folder has not written its process number into it yet. That is a
    # lock whose owner is about to say who it is, not one that is stale: give it a few seconds.
    i=0
    while [ -z "$other" ] && [ "$i" -lt 5 ]; do
      sleep 1
      other="$(cat "$LOCK/pid" 2>/dev/null || true)"
      i=$((i + 1))
    done
    if [ -n "$other" ] && kill -0 "$other" 2>/dev/null; then
      LOCK=""
      refuse "Another update is running (process $other). Two at once would undo each other." \
        "If you are sure none is, delete the folder $ROOT/.logs/update.lock and run this again."
    fi
    rm -rf "$LOCK"
    if ! mkdir "$LOCK" 2>/dev/null; then
      LOCK=""
      refuse "Could not take the update lock in $ROOT/.logs."
    fi
  fi
  printf '%s\n' "$$" > "$LOCK/pid"
  LOCK_HELD=true
}

make_private_folder() {
  RUN_DIR="$COPIES/update-$(date +%Y%m%d-%H%M%S)"
  if ! ( umask 077; mkdir -p "$COPIES" && mkdir "$RUN_DIR" ) 2>/dev/null; then
    RUN_DIR=""
    refuse "Could not make a folder for the copy in $COPIES." "Use --copies <folder> to put it somewhere else."
  fi
  chmod 700 "$RUN_DIR" 2>/dev/null
  if [ "$(file_mode "$RUN_DIR")" != 700 ]; then
    rmdir "$RUN_DIR" 2>/dev/null
    RUN_DIR=""
    refuse "The folder for the copy cannot be made private: this disk does not keep file permissions ($COPIES)." \
      "Use --copies <folder> on a disk that does, such as your home folder."
  fi
  ( umask 077
    {
      printf 'started=%s\n' "$(date +%Y-%m-%dT%H:%M:%S)"
      printf 'repository=%s\n' "$REPO_ROOT"
      printf 'env_file=%s\n' "$ENV_NAME"
      printf 'compose_project=%s\n' "$COMPOSE_PROJECT"
      printf 'commit=%s\n' "$OLD_SHA"
      printf 'branch=%s\n' "${BRANCH:-none (detached)}"
      printf 'target=%s\n' "$TARGET_SHA"
      printf 'target_name=%s\n' "$TARGET_NAME"
    } > "$RUN_DIR/record.txt" )
}

# ---------------------------------------------------------------------------------------------------
# Stopping, and watching that nothing starts it again
# ---------------------------------------------------------------------------------------------------

stack_answers_any() {
  identifies_as_openbot "$SERVER_PORT" server || identifies_as_openbot "$APP_PORT" app
}

# Is anything running in Docker for this installation?
compose_has_containers() {
  [ -n "$(compose ps --quiet 2>/dev/null | head -c 1)" ]
}

# Anything of the stack up that this script did not start, before the database was brought up.
stack_came_back() {
  stack_answers_any || compose_has_containers
}

watch_for_a_restart() {
  local i
  if [ "$WATCH" -le 0 ]; then
    info "  not waiting to see whether something starts it again (--watch 0)"
    return 0
  fi
  info "  waiting up to $WATCH seconds to see whether something starts FreeDuet again, such as a watchdog"
  for i in $(seq 1 "$WATCH"); do
    if stack_came_back; then return 1; fi
    sleep 1
  done
  return 0
}

# Nothing else is using the database: no app, no API, and no other connection to it. The postgres of
# this installation is the only thing that may be up. Answers 0 when it is quiet, 1 when something
# is using it (the stack came back), 2 when it could not be asked.
database_is_quiet() {
  local count query
  query="select count(*) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and backend_type = 'client backend'"
  stack_answers_any && return 1
  count="$(sql_value "$PG_DB" "$query")" || return 2
  [[ "$count" =~ ^[0-9]+$ ]] || return 2
  [ "$count" = 0 ] || return 1
  sleep 1
  count="$(sql_value "$PG_DB" "$query")" || return 2
  [[ "$count" =~ ^[0-9]+$ ]] || return 2
  [ "$count" = 0 ] || return 1
  stack_answers_any && return 1
  return 0
}

# Something started FreeDuet again while it was meant to be stopped: a watchdog or a service. Moving
# or restoring now would pull the database from under it, and starting FreeDuet from here would race
# it, so this stops and says so. Nothing was changed except the copy, if it was made.
stack_returned() {
  forget_stub_folder
  record result stopped-by-a-watchdog
  FINAL=true
  red ""
  red "Something started FreeDuet again while it was being stopped: a watchdog or a service on this computer."
  red "Your database, your settings and your code were not touched. If FreeDuet is not running now, start it with: bash scripts/start.sh"
  if [ -n "$RUN_DIR" ] && [ "$COPY_MADE" = true ]; then
    red "The copy made before that is in $RUN_DIR"
  fi
  red "Pause what starts it, then run this again."
  exit 20
}

# The database is quiet, or this stops: the stack came back (exit 20), or it could not be asked (a way back).
require_quiet() {
  local status=0
  database_is_quiet || status=$?
  case "$status" in
    0) return 0 ;;
    1) stack_returned ;;
    *) go_back "$1" ;;
  esac
}

start_postgres_alone() {
  local i
  COMPOSE_PROGRESS=quiet compose up -d postgres >/dev/null 2>&1 || return 1
  for i in $(seq 1 60); do
    [ "$(sql_value postgres "select 1" || true)" = 1 ] && return 0
    sleep 1
  done
  return 1
}

# ---------------------------------------------------------------------------------------------------
# Step 2: the copy
# ---------------------------------------------------------------------------------------------------

database_fingerprint() {
  local tables journal
  tables="$(sql_value "$PG_DB" "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")" || return 1
  [[ "$tables" =~ ^[0-9]+$ ]] || return 1
  journal="$(sql_value "$PG_DB" "select count(*) from drizzle.__drizzle_migrations" || true)"
  [ -n "$journal" ] || journal=none
  printf 'tables=%s journal=%s' "$tables" "$journal"
}

# The database role's password, as the stored hash, so that going back can put the role back exactly
# as it was. start.sh may replace the example password with one made for this installation (D39),
# and a role's password lives in the cluster and not in the database, so restoring the database and
# `.env` alone would leave `.env` naming a password the role no longer has. The hash is not the
# password, and it goes into a file that only the person can read; it is sent back on standard input.
copy_role_password() {
  local verifier scram md5
  scram='^SCRAM-SHA-256\$[0-9]+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'
  md5='^md5[0-9a-f]{32}$'
  if ! verifier="$(sql_value postgres "select coalesce(rolpassword, '') from pg_authid where rolname = '$PG_USER'")"; then
    info "  the database user's password could not be read; going back will leave it as it is then"
    return 0
  fi
  if [ -z "$verifier" ]; then
    ( umask 077; printf 'ALTER ROLE %s WITH PASSWORD NULL;\n' "$PG_USER" > "$RUN_DIR/role-password.sql" )
  elif [[ "$verifier" =~ $scram ]] || [[ "$verifier" =~ $md5 ]]; then
    ( umask 077; printf "ALTER ROLE %s WITH PASSWORD '%s';\n" "$PG_USER" "$verifier" > "$RUN_DIR/role-password.sql" )
  else
    info "  the database user's password is stored in a form this does not know; going back will leave it as it is then"
    return 0
  fi
  HAVE_ROLE_FILE=true
}

make_the_copy() {
  local part size
  part="$RUN_DIR/database.dump.part"
  if ! FINGERPRINT="$(database_fingerprint)"; then
    red "  could not read the state of the database"
    return 1
  fi
  # -C puts "create the database" into the copy, so that going back can drop the database and make it
  # again whatever a failed update left in it: a plain --clean restore over a migrated database stops
  # on the first table that a foreign key still holds.
  if ! ( umask 077; compose exec -T postgres pg_dump -U "$PG_USER" -Fc -C "$PG_DB" > "$part" </dev/null ); then
    red "  pg_dump failed"
    rm -f "$part"
    return 1
  fi
  size="$(wc -c < "$part" | tr -d ' ')"
  if ! [[ "$size" =~ ^[0-9]+$ ]] || [ "$size" -lt 512 ] || [ "$(head -c 5 "$part")" != PGDMP ]; then
    red "  the copy of the database is too small, or is not a database copy"
    rm -f "$part"
    return 1
  fi
  if ! compose exec -T postgres pg_restore --list < "$part" >/dev/null 2>&1; then
    red "  the copy of the database cannot be read back"
    rm -f "$part"
    return 1
  fi
  if ! mv "$part" "$RUN_DIR/database.dump"; then
    rm -f "$part"
    return 1
  fi
  # What the copy is, as of now: checked again before it is ever restored from.
  DUMP_SHA256="$(sha256_of "$RUN_DIR/database.dump")"
  if ! [[ "$DUMP_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
    red "  could not take a checksum of the copy of the database"
    DUMP_SHA256=""
    rm -f "$RUN_DIR/database.dump"
    return 1
  fi
  if ! ( umask 077; cp "$ENV_FILE" "$RUN_DIR/env.copy" ) || ! cmp -s "$ENV_FILE" "$RUN_DIR/env.copy"; then
    red "  could not copy $ENV_NAME"
    rm -f "$RUN_DIR/database.dump" "$RUN_DIR/env.copy"
    return 1
  fi
  copy_role_password
  if [ "$(file_mode "$RUN_DIR/database.dump")" != 600 ] || [ "$(file_mode "$RUN_DIR/env.copy")" != 600 ]; then
    red "  the copy is not private (the mode of its files)"
    rm -f "$RUN_DIR/database.dump" "$RUN_DIR/env.copy" "$RUN_DIR/role-password.sql"
    return 1
  fi
  COPY_MADE=true
  record database_bytes "$size"
  record database_sha256 "$DUMP_SHA256"
  record fingerprint "$FINGERPRINT"
  record role_password "$([ "$HAVE_ROLE_FILE" = true ] && printf copied || printf not-copied)"
  say "  database: $(human_size "$size"), $FINGERPRINT"
  say "  settings: $ENV_NAME"
  say "  in: $RUN_DIR (private; it holds all your secrets)"
  return 0
}

# ---------------------------------------------------------------------------------------------------
# Going back
# ---------------------------------------------------------------------------------------------------

restore_env() {
  local temp
  if cmp -s "$RUN_DIR/env.copy" "$ENV_FILE" 2>/dev/null; then
    info "  $ENV_NAME: already as it was"
    return 0
  fi
  temp="$ENV_FILE.restore.$$"
  if ! ( umask 077; cp "$RUN_DIR/env.copy" "$temp" ); then
    rm -f "$temp"
    return 1
  fi
  chmod 600 "$temp" 2>/dev/null
  if ! mv -f "$temp" "$ENV_FILE"; then
    rm -f "$temp"
    return 1
  fi
  say "  $ENV_NAME: put back from the copy"
}

# The copy is the only way back, and a restore starts by dropping the database. So the copy is checked
# again here, right before, against what was recorded when it was made: a file that is not that file is
# not restored from, and the database is not touched.
verify_the_copy() {
  local now
  if [ ! -f "$RUN_DIR/database.dump" ]; then
    DUMP_BAD=true
    give_up "the copy of your database is no longer where it was put, so it was not used"
  fi
  now="$(sha256_of "$RUN_DIR/database.dump")"
  if [ -z "$DUMP_SHA256" ] || [ "$now" != "$DUMP_SHA256" ]; then
    DUMP_BAD=true
    give_up "the copy of your database is not the file that was checked when it was made (its checksum changed), so it was not used"
  fi
  if ! compose exec -T postgres pg_restore --list < "$RUN_DIR/database.dump" >/dev/null 2>&1; then
    DUMP_BAD=true
    give_up "the copy of your database can no longer be read back, so it was not used"
  fi
}

restore_database() {
  local now quiet=0
  if ! start_postgres_alone; then
    give_up "the database would not start"
  fi
  database_is_quiet || quiet=$?
  case "$quiet" in
    0) ;;
    1)
      red "  Something else is using the database, or the app is up again."
      red "  If a watchdog or a service starts FreeDuet by itself, pause it first."
      give_up "the database is in use, so it was not restored"
      ;;
    *) give_up "could not tell whether the database is in use, so it was not restored" ;;
  esac
  verify_the_copy
  RESTORING=true
  if ! compose exec -T postgres pg_restore --exit-on-error --clean --create --if-exists --no-owner -U "$PG_USER" -d postgres < "$RUN_DIR/database.dump"; then
    give_up "restoring the database from the copy failed"
  fi
  if ! now="$(database_fingerprint)"; then
    give_up "the database was restored but could not be read afterwards"
  fi
  if [ "$now" != "$FINGERPRINT" ]; then
    give_up "the restored database is not the one that was copied ($now now, $FINGERPRINT then)"
  fi
  say "  database: restored from the copy ($now)"
  if [ "$HAVE_ROLE_FILE" = true ]; then
    if compose exec -T postgres psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -q < "$RUN_DIR/role-password.sql" >/dev/null 2>&1; then
      say "  database user: password put back as it was"
    else
      give_up "the database user's password could not be put back"
    fi
  fi
  RESTORING=false
}

wait_until_answers() {
  local tries i
  tries=$(( ($1 + 2) / 3 ))
  [ "$tries" -ge 1 ] || tries=1
  for i in $(seq 1 "$tries"); do
    if identifies_as_openbot "$SERVER_PORT" server && identifies_as_openbot "$APP_PORT" app; then
      return 0
    fi
    sleep 3
  done
  return 1
}

which_is_silent() {
  local silent=""
  identifies_as_openbot "$SERVER_PORT" server || silent="the API (port $SERVER_PORT)"
  identifies_as_openbot "$APP_PORT" app || silent="${silent:+$silent and }the app (port $APP_PORT)"
  printf '%s' "${silent:-something}"
}

start_the_old_version() {
  info "  starting FreeDuet as it was"
  if ! bash "$REPO_ROOT/scripts/start.sh"; then
    give_up "start.sh did not finish on the version you had"
  fi
  if ! wait_until_answers "$WAIT"; then
    give_up "FreeDuet was started as it was, but $(which_is_silent) does not answer"
  fi
}

# Everything after the stop that did not work. Says plainly what happened, undoes what was done, and
# ends the run: 10 when it is all back, 20 when it is not.
go_back() {
  local why="$1"
  red ""
  red "$why"
  say ""
  if [ "$COPY_MADE" = true ]; then
    say "Going back to $OLD_LABEL. Your data is in the copy at $RUN_DIR"
  else
    say "Going back to $OLD_LABEL. Your database, your settings and your code were not changed."
  fi

  # Before the new version has been started nothing of it runs, so there is nothing to stop.
  if [ "$PHASE" = started ]; then
    info "  stopping what the new version started"
    if ! bash "$REPO_ROOT/scripts/stop.sh"; then
      give_up "scripts/stop.sh did not finish"
    fi
  fi
  if [ "$(git_ rev-parse HEAD 2>/dev/null || true)" != "$OLD_SHA" ]; then
    if ! git_ reset --hard --quiet "$OLD_SHA" || [ "$(git_ rev-parse HEAD 2>/dev/null || true)" != "$OLD_SHA" ]; then
      give_up "could not put the code back to $OLD_LABEL"
    fi
    say "  code: back to $OLD_LABEL"
  fi
  if [ "$COPY_MADE" = true ]; then
    restore_env || give_up "could not put $ENV_NAME back from the copy"
  fi
  if [ "$CODE_MOVED" = true ]; then
    info "  installing what $OLD_LABEL needs (bun install --frozen-lockfile)"
    if ! ( cd "$ROOT" && bun install --frozen-lockfile ); then
      give_up "bun install failed on $OLD_LABEL"
    fi
  fi
  if [ "$DB_TOUCHED" = true ]; then
    restore_database
  else
    say "  database: not touched, so it is as it was"
  fi
  start_the_old_version

  green ""
  green "The update did not go through. You are back where you were: $OLD_LABEL, with your database and your settings as they were."
  green "FreeDuet is running again at http://localhost:$APP_PORT"
  if [ "$COPY_MADE" = true ]; then
    say "The copy made before the update is in $RUN_DIR. It holds all your secrets; delete it when you do not need it."
  fi
  finish_went_back
}

# ---------------------------------------------------------------------------------------------------
# After a success: old copies
# ---------------------------------------------------------------------------------------------------

# Keep the newest $KEEP copies of this installation, this run's among them. Only folders that this
# script made for this installation, that say how their run ended, and where that was not "the person
# has to finish by hand". Never a link, never anything else in the folder.
prune_old_copies() {
  local keep="$KEEP" kept=1 removed=0 dir name i
  local candidates=()
  [ "$keep" -ge 1 ] || keep=1
  shopt -s nullglob
  for dir in "$COPIES"/update-*; do candidates+=("$dir"); done
  shopt -u nullglob
  i=${#candidates[@]}
  while [ "$i" -gt 0 ]; do
    i=$((i - 1))
    dir="${candidates[$i]}"
    name="${dir##*/}"
    [ "$dir" = "$RUN_DIR" ] && continue
    [ -d "$dir" ] && [ ! -L "$dir" ] || continue
    [[ "$name" =~ ^update-[0-9]{8}-[0-9]{6}$ ]] || continue
    [ -f "$dir/record.txt" ] && [ ! -L "$dir/record.txt" ] || continue
    grep -Fx "repository=$REPO_ROOT" "$dir/record.txt" >/dev/null || continue
    grep -Fx "env_file=$ENV_NAME" "$dir/record.txt" >/dev/null || continue
    if ! grep -Fx "result=updated" "$dir/record.txt" >/dev/null \
       && ! grep -Fx "result=went-back" "$dir/record.txt" >/dev/null; then
      continue
    fi
    if [ "$kept" -lt "$keep" ]; then
      kept=$((kept + 1))
      continue
    fi
    rm -rf -- "$dir"
    removed=$((removed + 1))
    info "  removed the older copy $name"
  done
  info "  copies kept: $kept (--keep $KEEP), removed: $removed"
}

# ---------------------------------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------------------------------

main() {
  trap on_exit EXIT
  trap on_signal INT TERM HUP

  parse_args "$@"

  if ! [[ "$ENV_NAME" =~ ^\.env(\.[A-Za-z0-9_-]+)?$ ]]; then
    refuse "OPENBOT_ENV_FILE must name a file beside docker-compose.yml, such as .env.eval."
  fi
  if [ ! -f "$ENV_FILE" ]; then
    refuse "$ENV_NAME is missing, so this does not look like a FreeDuet that has been started."
  fi
  APP_PORT="$(setting APP_PORT 3010)"
  SERVER_PORT="$(setting SERVER_PORT 3001)"
  POSTGRES_PORT="$(setting POSTGRES_PORT 5432)"
  if [ -z "$COPIES" ]; then
    if [ -z "${HOME:-}" ] || [ ! -d "$HOME" ]; then
      refuse "HOME is not set, so there is no default place for the copy. Use --copies <folder>."
    fi
    COPIES="$HOME/.freeduet/updates"
  fi
  check_copies_folder

  echo
  echo "FreeDuet update"
  echo "==============="
  info "Looking first, without changing anything"
  check_tools
  check_checkout
  check_database
  check_compose_project
  resolve_target
  case "$RELATION" in
    same)
      if [ "$FETCH_FAILED" = true ]; then
        green "Nothing newer is known here: $OLD_LABEL is the newest version already downloaded. Check the connection to see whether there is a newer one."
      else
        green "Already up to date: $OLD_LABEL. Nothing to do."
      fi
      FINAL=true
      exit 0
      ;;
    behind)
      if [ -n "$TARGET_REF" ] || [ "$USE_MAIN" = true ]; then
        refuse "$TARGET_LABEL is older than where you are ($OLD_LABEL). This command only moves forward."
      fi
      green "Already up to date: you are on $OLD_LABEL, which is newer than the latest release ($TARGET_LABEL). Nothing to do."
      FINAL=true
      exit 0
      ;;
    diverged)
      refuse "$OLD_LABEL has changes that $TARGET_LABEL does not have, and the other way round. This command only moves forward, so it cannot get from one to the other." \
        "If the changes in this folder are yours and you want to keep them, update by hand."
      ;;
  esac
  check_nothing_in_the_way
  check_disk_space
  say ""
  print_plan

  if [ "$CHECK_ONLY" = true ]; then
    green "This was only a look. Nothing was changed."
    FINAL=true
    exit 0
  fi

  take_lock
  make_private_folder

  # ----- stop
  info "1  Stopping FreeDuet"
  PHASE=stopped
  if ! bash "$REPO_ROOT/scripts/stop.sh"; then
    go_back "scripts/stop.sh did not finish."
  fi
  if compose_has_containers; then
    go_back "scripts/stop.sh finished, but Docker services are still running."
  fi
  if ! watch_for_a_restart; then
    stack_returned
  fi
  if ! start_postgres_alone; then
    go_back "The database could not be brought up alone to copy it."
  fi
  require_quiet "Could not tell whether something else is using the database."

  # ----- the copy
  info "2  Making a copy of your data, with nothing else running"
  if ! make_the_copy; then
    go_back "The copy could not be made. Nothing has been changed."
  fi
  PHASE=copied

  # ----- move
  info "3  Moving to $TARGET_LABEL"
  require_quiet "Could not tell whether something else is using the database."
  if ! git_ merge --ff-only --quiet "$TARGET_SHA"; then
    go_back "Could not move the code forward to $TARGET_LABEL."
  fi
  CODE_MOVED=true
  PHASE=moved
  if [ "$(git_ rev-parse HEAD 2>/dev/null || true)" != "$TARGET_SHA" ]; then
    go_back "The code is not at $TARGET_LABEL after moving it."
  fi
  say "  code: now at $TARGET_LABEL"
  info "  installing what it needs (bun install --frozen-lockfile)"
  if ! ( cd "$ROOT" && bun install --frozen-lockfile ); then
    go_back "bun install did not finish."
  fi

  # ----- start
  info "4  Starting $TARGET_LABEL (this builds what changed and updates the database; it can take several minutes)"
  PHASE=started
  DB_TOUCHED=true
  if ! bash "$REPO_ROOT/scripts/start.sh"; then
    go_back "scripts/start.sh did not finish on $TARGET_LABEL."
  fi

  # ----- check
  info "5  Checking that it answers (up to $WAIT seconds)"
  if ! wait_until_answers "$WAIT"; then
    go_back "On $TARGET_LABEL, $(which_is_silent) did not answer within $WAIT seconds."
  fi
  green "  the app and the API answer"

  # It worked. Said now, before the tidying, so that a stop in the tidying cannot take it back.
  PHASE=finished
  green ""
  green "Updated. FreeDuet is now on $TARGET_LABEL and answers at http://localhost:$APP_PORT"
  say "A copy of what you had before is in $RUN_DIR"
  say "It holds all your secrets. Keep it private, and delete it when you do not need it."
  info "Old copies"
  prune_old_copies
  finish_updated
}

main "$@"
# shellcheck disable=SC2317  # main always leaves; this line is for a file that changed under bash
exit $?
