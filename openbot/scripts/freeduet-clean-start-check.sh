#!/usr/bin/env bash
#
# FreeDuet (#21): what a person gets from the one-command start on a clean machine, with no API key
# and no Claude Code sign-in. Run after the README's Quick start (`cp .env.example .env` and
# `bash scripts/start.sh`), with what start.sh printed. CI's `clean start` job runs it.
#
#   bash openbot/scripts/freeduet-clean-start-check.sh <start.sh output> [start.sh exit status]
#
# Every check is reported, then the run fails if any did:
#   - start.sh finished (exit status 0)
#   - the server answers /health with 200
#   - the app answers, as FreeDuet's app
#   - agent-freeduet answers /health with 200
#   - the twelve members of examples/freeduet/agents.yaml are remote Bots at agent-freeduet, and the
#     runtime has them
#   - conversations are kept in FreeDuet's own database, not in CopilotKit Intelligence (#42)
#   - start.sh said how to sign in to Claude Code
#   - nothing asked for a key: no API key named in start.sh's output, no key the server refused to
#     start without

. "$(dirname "$0")/require-bash.sh"

set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
START_LOG="${1:?usage: freeduet-clean-start-check.sh <start.sh output> [start.sh exit status]}"
START_STATUS="${2:-}"
SERVER_LOG="$ROOT/.logs/server.log"

# The ports of .env.example, which is what a clean start runs on.
SERVER="http://localhost:${SERVER_PORT:-3001}"
APP="http://localhost:${APP_PORT:-3010}"
FREEDUET="http://localhost:${FREEDUET_PORT:-4230}"

FAILED=0
pass() { printf '\033[32mPASS\033[0m %s\n' "$1"; }
fail() {
  FAILED=$((FAILED + 1))
  printf '\033[31mFAIL\033[0m %s: %s\n' "$1" "$2"
  # An annotation on the run's summary page when this runs in GitHub Actions.
  [ -z "${GITHUB_ACTIONS:-}" ] || printf '::error title=%s::%s\n' "$1" "$2"
}
status_of() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null || true
}

if [ -n "$START_STATUS" ]; then
  if [ "$START_STATUS" = 0 ]; then
    pass "start.sh finished"
  else
    fail "start.sh finished" "it stopped with exit status $START_STATUS (its last lines: $(tail -n 3 "$START_LOG" | tr '\n' ' '))"
  fi
fi

code="$(status_of "$SERVER/health")"
if [ "$code" = 200 ]; then
  pass "server $SERVER/health answers 200"
else
  fail "server $SERVER/health answers 200" "it answered ${code:-nothing}$( [ -f "$SERVER_LOG" ] && printf '; server.log ends: %s' "$(tail -n 3 "$SERVER_LOG" | tr '\n' ' ')")"
fi

if curl -fsS --max-time 5 "$APP/" 2>/dev/null | grep -qiE '<meta name="openbot" content="app"'; then
  pass "app $APP answers"
else
  fail "app $APP answers" "no FreeDuet app there (status $(status_of "$APP/"))"
fi

code="$(status_of "$FREEDUET/health")"
if [ "$code" = 200 ]; then
  pass "agent-freeduet $FREEDUET/health answers 200"
else
  fail "agent-freeduet $FREEDUET/health answers 200" "it answered ${code:-nothing}"
fi

# Each member, asked of the server by id: a remote Bot whose endpoint is agent-freeduet, and one the
# runtime registered. The ids come from the package the server loaded.
MEMBERS="$(bun -e '
  const { parse } = await import("yaml");
  const file = await Bun.file(process.argv[1]).text();
  const ids = (parse(file).agents ?? []).map((agent) => agent.id);
  const server = process.argv[2];
  const want = new URL(process.argv[3]);
  const problems = [];
  let info = {};
  try {
    const response = await fetch(`${server}/api/copilotkit/info`);
    info = response.ok ? ((await response.json()).agents ?? {}) : {};
  } catch {
    console.log(`${ids.length}|the server is not answering`);
    process.exit(0);
  }
  for (const id of ids) {
    try {
      const response = await fetch(`${server}/api/agents/${encodeURIComponent(id)}`);
      if (!response.ok) { problems.push(`${id}: HTTP ${response.status}`); continue; }
      const body = await response.json();
      const endpoint = (body.agent ?? body).endpoint;
      const at = endpoint ? new URL(endpoint) : null;
      const local = at && ["localhost", "127.0.0.1", "[::1]"].includes(at.hostname);
      if (!local || at.port !== want.port) problems.push(`${id}: endpoint ${endpoint ?? "none"}`);
      else if (!(id in info)) problems.push(`${id}: not registered in the runtime`);
    } catch (error) {
      problems.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`${ids.length}|${problems.join("; ")}`);
' "$ROOT/examples/freeduet/agents.yaml" "$SERVER" "$FREEDUET" 2>&1 | tail -n 1)"
COUNT="${MEMBERS%%|*}"
PROBLEMS="${MEMBERS#*|}"
if [ "$COUNT" = 12 ] && [ -z "$PROBLEMS" ]; then
  pass "the twelve members are remote Bots at agent-freeduet"
else
  fail "the twelve members are remote Bots at agent-freeduet" "${COUNT} members in agents.yaml; ${PROBLEMS:-$MEMBERS}"
fi

# FreeDuet (#42): with no Intelligence key, conversations are kept in the server's own database.
# /api/capabilities answers anybody, signed in or not.
MODE="$(curl -fsS --max-time 5 "$SERVER/api/capabilities" 2>/dev/null \
  | bun -e 'try { process.stdout.write(String(JSON.parse(await Bun.stdin.text()).mode ?? "")); } catch {}' 2>/dev/null || true)"
if [ "$MODE" = local ]; then
  pass "conversations are kept in FreeDuet's own database (FREEDUET_INTELLIGENCE=off)"
else
  fail "conversations are kept in FreeDuet's own database (FREEDUET_INTELLIGENCE=off)" "the server says mode ${MODE:-nothing}"
fi

if grep -qF "Claude Code is not signed in yet" "$START_LOG"; then
  pass "start.sh said how to sign in to Claude Code"
else
  fail "start.sh said how to sign in to Claude Code" "no sign-in line in its output"
fi

ASKED="$(grep -iE 'api[_ ]?key|licen[cs]e is ' "$START_LOG" | head -n 3)"
if [ -f "$SERVER_LOG" ]; then
  ASKED="$ASKED$(grep -iE 'is required and is not configured|Missing: [A-Z_]*KEY' "$SERVER_LOG" | head -n 3)"
fi
if [ -z "$ASKED" ]; then
  pass "nothing asked for a key"
else
  fail "nothing asked for a key" "$(printf '%s' "$ASKED" | tr '\n' ' ' | cut -c1-400)"
fi

echo
if [ "$FAILED" -gt 0 ]; then
  printf '\033[31m%s\033[0m\n' "$FAILED check(s) failed: the one-command start does not work on a clean machine yet."
  exit 1
fi
printf '\033[32m%s\033[0m\n' "The one-command start works on a clean machine with no key and no sign-in."
