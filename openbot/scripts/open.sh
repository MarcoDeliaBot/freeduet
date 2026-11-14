#!/usr/bin/env bash
#
# Open FreeDuet in your browser, paired with this installation (docs/M1_PLAN.md D28).
#
# With no sign-in, you are whoever reaches the server from this machine, and on Docker Desktop (Windows,
# macOS) a Bot's computer that calls the server looks like that too. What tells your browser from a Bot's
# computer is this installation's secret, FREEDUET_INSTALL_SECRET in .env. A browser gets it, as a cookie,
# once: this script asks the server for a link, and the browser opens it. The link is good once and for
# two minutes. The secret is not in it, is never printed, and never leaves this machine.
#
# scripts/start.sh runs this by itself the first time it makes the secret. Run it again for another
# browser, or for this one after its cookies were cleared.
#
#   bash scripts/open.sh            open the app in your browser, paired
#   bash scripts/open.sh --print    print the link instead (good once, for two minutes)
#
# BROWSER names the program to open it with, when the usual ones are not the right ones.

. "$(dirname "$0")/require-bash.sh"

set -euo pipefail

# Before the `cd`, which would leave a relative $0 pointing nowhere.
SELF="$(cd "$(dirname "$0")" && pwd -P)/$(basename "$0")"
cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
ENV_NAME="${OPENBOT_ENV_FILE:-.env}"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
info()  { printf '\033[2m%s\033[0m\n' "$1"; }

PRINT_ONLY=false
case "${1:-}" in
  "") ;;
  --print) PRINT_ONLY=true ;;
  -h|--help) sed -n '2,16p' "$SELF" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) red "Unknown argument: $1. Try: bash scripts/open.sh --help"; exit 1 ;;
esac

if ! [[ "$ENV_NAME" =~ ^\.env(\.[A-Za-z0-9_-]+)?$ ]]; then
  red "OPENBOT_ENV_FILE must name a file beside docker-compose.yml, such as .env.eval."
  exit 1
fi
ENV_FILE="$ROOT/$ENV_NAME"
if [ ! -f "$ENV_FILE" ]; then
  red "$ENV_NAME is missing. Run: bash scripts/start.sh"
  exit 1
fi

# As start.sh reads a setting: the environment first, then the settings file, then the default.
setting() {
  local name="$1" fallback="$2" value="${!1:-}"
  if [ -z "$value" ]; then
    value="$(grep -E "^$name=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true)"
  fi
  printf '%s' "${value:-$fallback}"
}

APP_PORT="$(setting APP_PORT 3010)"
SERVER_PORT="$(setting SERVER_PORT 3001)"
SECRET="$(setting FREEDUET_INSTALL_SECRET "")"
if [ -z "$SECRET" ]; then
  red "$ENV_NAME has no FREEDUET_INSTALL_SECRET. Run: bash scripts/start.sh, which makes one."
  exit 1
fi

# Before a link is asked for: a link opened at an app that is not there is a link wasted.
if ! curl -fsS --max-time 3 "http://localhost:$APP_PORT/" >/dev/null 2>&1; then
  red "FreeDuet's app is not answering on port $APP_PORT. Start it with: bash scripts/start.sh"
  exit 1
fi

# The secret goes to the server in a curl config file of its own, readable by this user alone and
# removed at once: a command-line argument is visible to every process on this machine.
config="$(mktemp)"
chmod 600 "$config"
printf 'header = "Authorization: Bearer %s"\n' "$SECRET" > "$config"
status=0
reply="$(curl -sS --max-time 8 -K "$config" -X POST -w '\n%{http_code}' \
  "http://localhost:$SERVER_PORT/internal/pairing" 2>/dev/null)" || status=$?
rm -f "$config"
if [ "$status" -ne 0 ]; then
  red "The server is not answering on port $SERVER_PORT. Start it with: bash scripts/start.sh"
  exit 1
fi
code="${reply##*$'\n'}"
body="${reply%$'\n'*}"

case "$code" in
  200) ;;
  404)
    # A server with sign-in, or one opened beyond this machine, has nothing to pair: the browser is
    # the person's by other means, and the plain address is all there is.
    info "This FreeDuet has nothing to pair with (it has sign-in, or it was opened beyond this machine)."
    link="http://localhost:$APP_PORT/"
    ;;
  401)
    red "The server did not accept this installation's secret. It was started with another one, or before"
    red "this one was written. Run: bash scripts/start.sh"
    exit 1
    ;;
  *)
    red "The server answered HTTP $code to the request for a link."
    exit 1
    ;;
esac

if [ "$code" = 200 ]; then
  path="$(printf '%s' "$body" | sed -n 's/.*"path":"\([^"]*\)".*/\1/p')"
  if ! [[ "$path" =~ ^/api/pair\?token=[A-Za-z0-9_-]+$ ]]; then
    red "The server's answer was not a link."
    exit 1
  fi
  link="http://localhost:$APP_PORT$path"
fi

# Which program opens an address on this machine. Each one is only asked when it is there.
open_in_browser() {
  local url="$1"
  if [ -n "${BROWSER:-}" ] && command -v "$BROWSER" >/dev/null 2>&1; then
    "$BROWSER" "$url" >/dev/null 2>&1 && return 0
  fi
  if command -v wslview >/dev/null 2>&1; then
    wslview "$url" >/dev/null 2>&1 && return 0
  fi
  if grep -qi microsoft /proc/version 2>/dev/null; then
    # WSL: the browser is on Windows. `explorer.exe` reports failure for an address it opened.
    if command -v powershell.exe >/dev/null 2>&1; then
      powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1 && return 0
    fi
    if command -v explorer.exe >/dev/null 2>&1; then
      explorer.exe "$url" >/dev/null 2>&1 || true
      return 0
    fi
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 && return 0
  fi
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 && return 0
  fi
  # Git Bash on Windows.
  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe //c start "" "$url" >/dev/null 2>&1 && return 0
  fi
  return 1
}

if [ "$PRINT_ONLY" = "true" ]; then
  printf '%s\n' "$link"
  exit 0
fi
if open_in_browser "$link"; then
  green "Opened FreeDuet in your browser."
else
  info "No program here could open a browser. Open this address in the browser you want"
  info "to use, within two minutes (it works once):"
  printf '%s\n' "$link"
fi
