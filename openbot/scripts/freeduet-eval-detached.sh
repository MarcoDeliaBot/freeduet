#!/usr/bin/env bash
#
# Runs the team evals on the eval stack, detached, and reports on them while they run
# (evals/team/README.md, "Detached run"). Never touches the person's own FreeDuet.
#
# Start it detached, from the repository root, so that it outlives the shell that started it.
# On the maintainer's PC this is WSL, and WSL stops when its last session ends:
#
#   setsid nohup bash -l openbot/scripts/freeduet-eval-detached.sh --repeat 3 >/dev/null 2>&1 < /dev/null &
#
#   --repeat N        runs per case (default 3)
#   --id a,b          passed to evals/team/run.ts (optional)
#   --member name     passed to evals/team/run.ts (optional)
#   --dry-run         prints the steps, runs none, writes nothing
#   --status          the newest run: its status line, the time of its last log line, PASS/FAIL/SKIP/UNGRADED counts
#
# Steps: (1) remove the exited containers of the eval Compose project, (2) reset the eval stack and
# stop when that does not return 0, (3) wait until its server answers /health with 200 and stop after
# FREEDUET_EVAL_WAIT_SECONDS (default 300), (4) run the runner with its output in
# evals/team/reports/run-<UTC>.log, (5) write evals/team/reports/run-<UTC>.status: RUNNING first, then
# DONE or FAILED with the exit code (0 PASS, 1 FAIL, 2 INCOMPLETE, as the runner reports).
# The runner writes its report only at the end, so read the PASS, FAIL, SKIP and UNGRADED lines of the log.
#
# Refused, before anything runs: openbot/.env.eval missing, a COMPOSE_PROJECT_NAME other than
# freeduet-eval, a port or URL in it on 3010 (the person's own FreeDuet), no SERVER_PORT.

. "$(dirname "$0")/require-bash.sh"

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
REPO_ROOT="$(dirname "$ROOT")"
ENV_FILE="$ROOT/.env.eval"
PROJECT=freeduet-eval
REPORTS="$REPO_ROOT/evals/team/reports"
REAL_PORT=3010
WAIT_SECONDS="${FREEDUET_EVAL_WAIT_SECONDS:-300}"

usage() {
  cat <<'EOF'
usage: freeduet-eval-detached.sh [--repeat N] [--id a,b] [--member name] [--dry-run]
       freeduet-eval-detached.sh --status
EOF
}

refuse() {
  echo "refused: $1" >&2
  exit 1
}

# A value from openbot/.env.eval: the last line wins, quotes are dropped.
setting() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true
}

check_env() {
  [ -f "$ENV_FILE" ] || refuse "openbot/.env.eval is missing: start the eval stack once (freeduet-eval-stack.sh up)."
  local project
  project="$(setting COMPOSE_PROJECT_NAME)"
  [ "$project" = "$PROJECT" ] || refuse "openbot/.env.eval names the Compose project '${project:-nothing}', not $PROJECT: this is not the eval stack."
  # Any port or URL that points at 3010 (PORT=3010, SERVER_PORT=3010, http://localhost:3010...).
  if grep -qE "(PORT=|:)${REAL_PORT}([^0-9]|\$)" "$ENV_FILE"; then
    refuse "openbot/.env.eval points at port $REAL_PORT, the port of the person's own FreeDuet."
  fi
  [ -n "$(setting SERVER_PORT)" ] || refuse "SERVER_PORT is not set in openbot/.env.eval."
}

# The newest run's status file, by name (the UTC stamp sorts), or nothing.
newest_status() {
  ls -1 "$REPORTS"/run-*.status 2>/dev/null | sort | tail -1 || true
}

status_report() {
  local latest log line pid word count
  latest="$(newest_status)"
  if [ -z "$latest" ]; then
    echo "no run has been started (no $REPORTS/run-*.status)"
    return 0
  fi
  line="$(cat "$latest")"
  echo "status: $line"
  log="${latest%.status}.log"
  echo "log:    $log"
  if [ -f "$log" ]; then
    echo "last log line: $(date -u -r "$log" +%Y-%m-%dT%H:%M:%SZ) (time of the file)"
    echo "last line: $(tail -n 1 "$log")"
    for word in PASS FAIL SKIP UNGRADED; do
      count="$(grep -cE "^$word " "$log" || true)"
      printf '%s=%s ' "$word" "$count"
    done
    echo
  fi
  case "$line" in
    RUNNING*)
      pid="$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9]*\).*/\1/p')"
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        echo "not running: pid $pid has gone and no DONE or FAILED line was written (killed)"
      fi
      ;;
  esac
}

# Validates the arguments that the runner receives.
MODE=run
REPEAT=3
IDS=""
MEMBER=""
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repeat|--id|--member)
      [ $# -ge 2 ] || { echo "$1 needs a value" >&2; usage >&2; exit 2; }
      case "$1" in
        --repeat) REPEAT="$2" ;;
        --id) IDS="$2" ;;
        --member) MEMBER="$2" ;;
      esac
      shift 2
      ;;
    --dry-run) DRY=1; shift ;;
    --status) MODE=status; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ "$MODE" = status ]; then
  status_report
  exit 0
fi

[[ "$REPEAT" =~ ^[1-9][0-9]*$ ]] || { echo "--repeat must be a whole number of at least 1" >&2; exit 2; }
for value in "$IDS" "$MEMBER"; do
  if [ -n "$value" ] && ! [[ "$value" =~ ^[A-Za-z0-9_.,-]+$ ]]; then
    echo "--id and --member take letters, digits, dot, comma, dash and underscore only" >&2
    exit 2
  fi
done

check_env

RUNNER=(bun --env-file=openbot/.env.eval evals/team/run.ts --repeat "$REPEAT")
[ -z "$IDS" ] || RUNNER+=(--id "$IDS")
[ -z "$MEMBER" ] || RUNNER+=(--member "$MEMBER")

if [ "$DRY" = 1 ]; then
  echo "dry run: nothing is executed or written. The steps:"
  echo "  1. remove the exited containers labelled com.docker.compose.project=$PROJECT (docker ps -aq --filter status=exited)"
  echo "  2. bash openbot/scripts/freeduet-eval-stack.sh reset (stop when it does not return 0)"
  echo "  3. wait for http://localhost:$(setting SERVER_PORT)/health to answer 200, up to $WAIT_SECONDS s"
  echo "  4. ${RUNNER[*]}   in $REPO_ROOT, output to evals/team/reports/run-<UTC>.log"
  echo "  5. evals/team/reports/run-<UTC>.status: RUNNING, then DONE or FAILED with the exit code"
  exit 0
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$REPORTS"
LOG="$REPORTS/run-$STAMP.log"
STATUS="$REPORTS/run-$STAMP.status"
FINISHED=0
CHILD=""

# Every exit that is not the last line of the run leaves a FAILED line, so a status file never says RUNNING for good.
on_exit() {
  local code=$?
  if [ "$FINISHED" = 0 ]; then
    printf 'FAILED exit=%s log=%s\n' "$code" "run-$STAMP.log" > "$STATUS"
  fi
}
trap on_exit EXIT
trap 'exit 130' INT TERM HUP

printf 'RUNNING pid=%s log=run-%s.log\n' "$$" "$STAMP" > "$STATUS"
# From here on the script's output goes to the log, because the caller starts it detached.
exec >>"$LOG" 2>&1
echo "eval run $STAMP: repeat $REPEAT${IDS:+, ids $IDS}${MEMBER:+, member $MEMBER}"

echo "step 1: exited containers of $PROJECT"
EXITED="$(docker ps -aq --filter status=exited --filter "label=com.docker.compose.project=$PROJECT")"
if [ -n "$EXITED" ]; then
  # shellcheck disable=SC2086
  docker rm $EXITED
fi

echo "step 2: reset the eval stack"
bash openbot/scripts/freeduet-eval-stack.sh reset || { echo "reset did not return 0: stopping"; exit 1; }

echo "step 3: wait for the eval server"
URL="http://localhost:$(setting SERVER_PORT)/health"
waited=0
while :; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$URL" 2>/dev/null || true)"
  [ "$code" = 200 ] && break
  if [ "$waited" -ge "$WAIT_SECONDS" ]; then
    echo "the eval server did not answer 200 at $URL in $WAIT_SECONDS s: stopping"
    exit 1
  fi
  sleep 5
  waited=$((waited + 5))
done
echo "the eval server answers 200"

echo "step 4: the runner"
cd "$REPO_ROOT"
"${RUNNER[@]}" &
CHILD=$!
trap 'kill "$CHILD" 2>/dev/null || true; exit 130' INT TERM HUP
code=0
wait "$CHILD" || code=$?
CHILD=""

if [ "$code" = 0 ]; then WORD=DONE; else WORD=FAILED; fi
printf '%s exit=%s log=run-%s.log\n' "$WORD" "$code" "$STAMP" > "$STATUS"
FINISHED=1
echo "runner finished: $WORD exit=$code"
exit "$code"
