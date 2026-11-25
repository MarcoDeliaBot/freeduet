#!/usr/bin/env bash
#
# FreeDuet: a read-only pre-check for the engines live round (docs/live-tests/v0.2.3-round-2-engines.md),
# run on your own installation before you start the round.
#
#   bash openbot/scripts/freeduet-engines-precheck.sh
#
# It sends only GET requests: to the local server (its Engines page and token counter, with the same
# installation-secret cookie the browser holds after pairing) and to agent-freeduet on its loopback port
# (with the agent token). It reads .env for the ports and for those two values. A value goes from .env
# straight into a mode-600 curl config file: it is never assigned to a shell variable, printed, or put on
# a command line. Only counts and the names of engines and states are printed.
#
# One line per check: OK, FAIL (with what to look at), or SKIP (with why). The run exits 0 when no check
# FAILs. A SKIP needs your browser or is a note for item 1 of the round; it does not fail the run.

. "$(dirname "$0")/require-bash.sh"

set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
REPO="$(cd "$ROOT/.." && pwd -P)"
ENV_FILE="$ROOT/.env"

FAILS=0
SKIPS=0
ok() { printf 'OK    %s\n' "$1"; }
fail() {
  FAILS=$((FAILS + 1))
  printf 'FAIL  %s. Look at: %s\n' "$1" "$2"
}
skip() {
  SKIPS=$((SKIPS + 1))
  printf 'SKIP  %s\n' "$1"
}

if [ ! -f "$ENV_FILE" ]; then
  fail "openbot/.env is there" "no .env: run bash openbot/scripts/start.sh on this installation first"
  printf '%s failed, %s skipped\n' "$FAILS" "$SKIPS"
  exit 1
fi

# The value of one .env setting, without its quotes. Only ever a pipe source.
env_value() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
port_or() {
  local value
  value="$(env_value "$1")"
  printf '%s' "${value:-$2}"
}

SERVER="http://localhost:$(port_or SERVER_PORT 3001)"
AGENT="http://localhost:$(port_or FREEDUET_PORT 4230)"

CFG="$(mktemp)"
BODY="$(mktemp)"
chmod 600 "$CFG" "$BODY"
trap 'rm -f "$CFG" "$BODY"' EXIT

# One header line in the curl config file, its value copied from .env by the pipe, never through a variable.
header_from_env() { # $1 header name, $2 .env setting, $3 text before the value (may be empty)
  {
    printf 'header = "%s: %s' "$1" "$3"
    env_value "$2" | tr -d '\n'
    printf '"\n'
  } > "$CFG"
}

# GET only. Prints the HTTP status; the body is left in $BODY.
get() { # $1 URL, $2 curl config file (optional)
  curl -s -K "${2:-/dev/null}" -o "$BODY" -w '%{http_code}' --max-time 5 "$1" 2>/dev/null || true
}

# Reads $BODY and prints key=value pairs: counts and the names of engines and states only.
summary() { # $1 agent, server or usage
  bun -e '
    const body = JSON.parse(await Bun.file(process.argv[1]).text());
    const what = process.argv[2];
    const list = (value) => (Array.isArray(value) ? value : []);
    const members = list(body.members);
    const running = members.filter((m) => list(m.chain).length >= 2).length;
    const pairs = [];
    if (what === "agent") {
      pairs.push(`members=${members.length}`, `multi=${running}`, `choices_version=${body.choices_version ?? "none"}`);
      pairs.push(`engines=${list(body.engines).map((e) => `${e.id}:${e.state}`).join(",") || "none"}`);
    } else if (what === "server") {
      pairs.push(`reason=${body.reason ?? "none"}`, `can_change=${body.canChange === true ? "yes" : "no"}`);
      pairs.push(`cannot_change=${body.cannotChange ?? "none"}`, `members=${members.length}`, `multi=${running}`);
    } else {
      pairs.push(`problem=${body.problem === true ? "yes" : "no"}`, `rows=${list(body.rows).length}`);
    }
    console.log(pairs.join(" "));
  ' "$BODY" "$1" 2>/dev/null || true
}
field() { # $1 summary line, $2 key
  printf '%s\n' "$1" | tr ' ' '\n' | grep "^$2=" | head -n 1 | cut -d= -f2-
}
no_secret_configured() {
  [ -z "$(env_value "$1")" ]
}

# 1. The installation includes the commit the round is run on.
if git -C "$REPO" cat-file -e 5f006fe8 2>/dev/null && git -C "$REPO" merge-base --is-ancestor 5f006fe8 HEAD 2>/dev/null; then
  ok "this copy includes commit 5f006fe8 (HEAD: $(git -C "$REPO" log -1 --oneline 2>/dev/null))"
else
  fail "this copy includes commit 5f006fe8" "git log -1 --oneline in the FreeDuet folder; then bash openbot/scripts/update.sh --main"
fi

# 2. The server answers.
code="$(get "$SERVER/health")"
if [ "$code" = 200 ]; then
  ok "server answers $SERVER/health with 200"
else
  fail "server answers /health with 200" "it answered ${code}; the last lines of openbot/.logs/server.log"
fi

# 3. agent-freeduet answers on its loopback port (open path, no token needed).
code="$(get "$AGENT/health")"
if [ "$code" = 200 ]; then
  ok "agent-freeduet answers $AGENT/health with 200"
else
  fail "agent-freeduet answers /health with 200" "it answered ${code}; FREEDUET_PORT in openbot/.env and the agent-freeduet container"
fi

# 4. agent-freeduet's engine state and members, with the agent token from .env.
if no_secret_configured MANAGED_AGENT_TOKEN; then
  fail "agent token is in openbot/.env" "no MANAGED_AGENT_TOKEN: run bash openbot/scripts/start.sh, which writes one"
else
  header_from_env x-openbot-agent-token MANAGED_AGENT_TOKEN ""
  code="$(get "$AGENT/engines" "$CFG")"
  if [ "$code" = 200 ]; then
    line="$(summary agent)"
    if [ -z "$(field "$line" choices_version)" ] || [ "$(field "$line" choices_version)" = none ]; then
      fail "agent-freeduet reads the engines file ($(field "$line" members) members)" "agent-freeduet is older than this page: update the installation"
    elif [ "$(field "$line" members)" = 0 ]; then
      fail "agent-freeduet lists members" "no member is listed: the team file or the engines file is missing; the agent-freeduet log"
    else
      ok "agent-freeduet reads the engines: members=$(field "$line" members), engines $(field "$line" engines)"
      if [ "$(field "$line" multi)" = 0 ]; then
        skip "item 1 needs a member with two engines running: none has, so item 1 can only be 'not tested, one engine only'"
      else
        ok "item 1 can run: $(field "$line" multi) member(s) have two or more engines running"
      fi
    fi
  else
    fail "agent-freeduet answers GET /engines with 200" "it answered ${code}; the agent token in openbot/.env matches the agent's"
  fi

  # 5. The token counter, from agent-freeduet.
  code="$(get "$AGENT/engines/usage" "$CFG")"
  if [ "$code" = 200 ]; then
    line="$(summary usage)"
    if [ "$(field "$line" problem)" = yes ]; then
      fail "agent-freeduet token counter (D102)" "it reports a problem; the agent-freeduet log for the usage counter"
    else
      ok "agent-freeduet token counter answers: rows=$(field "$line" rows)"
    fi
  else
    fail "agent-freeduet answers GET /engines/usage with 200" "it answered ${code}"
  fi
fi

# 6 and 7. The server's Engines page and token counter, with the installation-secret cookie of the
# browser. That is a sign-in for the page: without the secret, or without an administrator behind it,
# the check is skipped and the browser step stands.
SERVER_PORT_VALUE="$(port_or SERVER_PORT 3001)"
browser_checks() { # $1 path, $2 label
  if no_secret_configured FREEDUET_INSTALL_SECRET; then
    skip "$2: no installation secret in openbot/.env, so this needs your browser (Settings, then Engines)"
    return 1
  fi
  header_from_env Cookie FREEDUET_INSTALL_SECRET "freeduet_install_${SERVER_PORT_VALUE}="
  code="$(get "$SERVER$1" "$CFG")"
  case "$code" in
    200) return 0 ;;
    401 | 403)
      skip "$2: the server did not accept this installation as an administrator; check it in your browser (Settings, then Engines)"
      return 1
      ;;
    *)
      fail "$2 answers with 200" "it answered ${code}; the last lines of openbot/.logs/server.log"
      return 1
      ;;
  esac
}

if browser_checks /api/freeduet/engines "server's Engines page"; then
  line="$(summary server)"
  if [ "$(field "$line" reason)" = none ]; then
    ok "server's Engines page is read through agent-freeduet: members=$(field "$line" members)"
  else
    fail "server's Engines page is read through agent-freeduet" "the page's reason is '$(field "$line" reason)'; the Engines page's note says what to do"
  fi
  if [ "$(field "$line" can_change)" = yes ]; then
    ok "the page allows changes, so the round's item 1 can run"
  else
    fail "the page allows changes" "cannot_change=$(field "$line" cannot_change): open the page on the computer FreeDuet runs on, or pair this browser with it (bash openbot/scripts/open.sh there)"
  fi
fi

if browser_checks /api/freeduet/engines/usage "server's token counter"; then
  line="$(summary usage)"
  if [ "$(field "$line" problem)" = yes ]; then
    fail "server's token counter (D102)" "it reports a problem; the server log"
  else
    ok "server's token counter answers: rows=$(field "$line" rows)"
  fi
fi

printf '%s failed, %s skipped\n' "$FAILS" "$SKIPS"
if [ "$FAILS" -eq 0 ]; then
  exit 0
fi
exit 1
