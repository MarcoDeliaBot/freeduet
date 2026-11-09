#!/usr/bin/env bash
#
# Start the local OpenDuet stack (OpenBot underneath) and verify each service answers as OpenBot.
# Safe to rerun: matching services are left running, and unrelated port holders are reported.

# Before anything else, and before the `set` line below, which is itself bash-only: this file is
# bash, and being read by `sh` used to end it with exit 1 and no output at all. See that file.
. "$(dirname "$0")/require-bash.sh"
# `holder`, `running` and `stop_matching`, which also work in Git Bash on Windows. See that file.
. "$(dirname "$0")/processes.sh"

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
# The repository this directory sits in, where OpenDuet's README is. Only used to say where to read.
REPO_ROOT="$(dirname "$ROOT")"
# FreeDuet: which settings file this stack is. `.env` is the person's own; OPENBOT_ENV_FILE names
# another beside it (`.env.eval`, written by scripts/freeduet-eval-stack.sh) for a second, separate
# stack started through this same script. Its own logs, its own server and worker command lines (so
# neither stack ever adopts or stops the other's processes) and its own Compose settings.
ENV_NAME="${OPENBOT_ENV_FILE:-.env}"
if ! [[ "$ENV_NAME" =~ ^\.env(\.[A-Za-z0-9_-]+)?$ ]]; then
  printf '\033[31m%s\033[0m\n' "OPENBOT_ENV_FILE must name a file beside docker-compose.yml, such as .env.eval."
  exit 1
fi
ENV_FILE="$ROOT/$ENV_NAME"
if [ "$ENV_NAME" = .env ]; then
  LOGS="$ROOT/.logs"
else
  LOGS="$ROOT/.logs/${ENV_NAME#.env.}"
fi
mkdir -p "$LOGS"
# Compose reads `.env` by itself; any other file has to be named on every call.
compose() {
  if [ "$ENV_NAME" = .env ]; then
    docker compose "$@"
  else
    docker compose --env-file "$ENV_FILE" "$@"
  fi
}
COMPOSE_HINT="docker compose"
[ "$ENV_NAME" = .env ] || COMPOSE_HINT="docker compose --env-file $ENV_NAME"
SERVER_ENTRY="bun --env-file=../$ENV_NAME src/production-entry.ts"
SERVER_DEV_ENTRY="bun --env-file=../$ENV_NAME src/index.ts"
if [ "$ENV_NAME" = .env ]; then
  WORKER_ENTRY="bun worker/src/index.ts"
else
  WORKER_ENTRY="bun --env-file=$ENV_NAME worker/src/index.ts"
fi

if [ ! -f "$ENV_FILE" ]; then
  printf '\033[31m%s\033[0m\n' "$ENV_NAME is missing. Copy .env.example to .env and fill in the required settings."
  exit 1
fi

# The environment first, then .env, then the default. Compose and the API server both read .env, so a
# port or token configured there is what this script must use as well.
setting() {
  local name="$1" fallback="$2" value="${!1:-}"
  if [ -z "$value" ]; then
    # `|| true`, BECAUSE A KEY THIS FUNCTION HAS A DEFAULT FOR IS ROUTINELY ABSENT FROM `.env`.
    #
    # That is the whole reason the second argument exists: `.env.example` does not list `APP_PORT`,
    # so a perfectly ordinary `.env` has no line for it. `grep` finding nothing is an exit status of
    # 1, `pipefail` makes it the pipeline's, and `set -e` then killed the script on the way to the
    # fallback that was sitting right there — before the first line of output, so the failure
    # named neither the key nor the file.
    #
    # Under bash that status did not escape the command substitution and the fallback won, which is
    # why this stood for as long as it did: the bug was invisible until somebody ran the script with
    # `sh`, where the same code exits 1 in silence. The refusal at the top of this file now names
    # that, and this closes the trap underneath it — an absent key takes the default in either
    # shell, which is what the argument always promised.
    value="$(grep -E "^$name=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true)"
  fi
  printf '%s' "${value:-$fallback}"
}

APP_PORT="$(setting APP_PORT 3010)"
SERVER_PORT="$(setting SERVER_PORT 3001)"
COMPUTER_PORT="$(setting COMPUTER_PORT 4100)"
BOT_PORT="$(setting BOT_PORT 4200)"
LANGGRAPH_PORT="$(setting LANGGRAPH_PORT 4201)"
BOT_PROVIDER="$(setting BOT_PROVIDER openai | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
SUPERVISOR_PORT="$(setting SUPERVISOR_PORT 4500)"
# Through `setting`, like every other key here, so `.env` counts as the comment above says and as
# docs/configuration.md tells people to rely on. Read from the environment alone, `false` in `.env`
# was ignored: the supervisor was still started and the server still told to use it.
ONE_COMPUTER_EACH="$(setting OPENBOT_ONE_COMPUTER_EACH true)"
# FreeDuet: agent-freeduet's port on this machine (docker-compose.yml publishes it from this).
FREEDUET_PORT="$(setting FREEDUET_PORT 4230)"
export APP_PORT SERVER_PORT
# Where the server and the app listen (shared/listen-host.ts): unset is this machine only when there
# is no sign-in. The server reads it from `.env` itself; the app is handed it here, because Vite
# reads only its own environment, and an app left on every interface proxies `/api` to the network.
OPENBOT_HOST="$(setting OPENBOT_HOST "")"
if [ -n "$OPENBOT_HOST" ]; then
  export OPENBOT_HOST
fi

# Whether this run changed a secret that something already running may not have.
#
# A process that is answering is not necessarily a process holding the current configuration, and
# the two are easy to confuse because one is observable and the other is not. Everything below that
# skips work because a service "is already up" has to consult this first.
SECRETS_ROTATED=false

SUPERVISOR_TOKEN="$(setting SUPERVISOR_TOKEN openbot-dev-supervisor-token)"
COMPUTER_TOKEN="$(setting COMPUTER_TOKEN openbot-dev-computer-token)"
# Keep the file and Compose in agreement even when someone later starts Bun directly.
# An empty example value used to leave the API unauthenticated after that restart.
STORED_COMPUTER_TOKEN="$(grep -E '^COMPUTER_TOKEN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true)"
if [ "$STORED_COMPUTER_TOKEN" != "$COMPUTER_TOKEN" ]; then
  token_env="$(mktemp)"
  grep -vE '^COMPUTER_TOKEN=' "$ENV_FILE" > "$token_env" || true
  printf '\nCOMPUTER_TOKEN=%s\n' "$COMPUTER_TOKEN" >> "$token_env"
  chmod 600 "$token_env"
  mv "$token_env" "$ENV_FILE"
fi
unset STORED_COMPUTER_TOKEN
# File equality cannot detect a token edited before this run. Record only its digest, tied below
# to the owned API listener's PID and start time; a direct restart cannot inherit an old stamp.
COMPUTER_TOKEN_FINGERPRINT="$(printf '%s' "$COMPUTER_TOKEN" | openssl dgst -sha256 -r | cut -d ' ' -f1)"
COMPUTER_STATE_FILE="$LOGS/server-computer.state"

# A fixed default is fine here, unlike `AGENT_TOOL_TOKEN` below, but not because of where the server
# listens — it binds no hostname, so this port is reachable from the network like any other. It is
# fine because this is a dev-only default on a machine's own dev stack, and the endpoint it guards
# accepts nothing but an unguessable `routine_run_<uuid>` id: the server re-reads the routine, the
# owner and the channel from its own tables rather than trusting anything else the caller says, so
# the fixed default gates nothing sensitive here. That is also why it is generated fresh and
# persisted for AGENT_TOOL_TOKEN (see the SECRETS_ROTATED block) but not for this one — production
# must set a real WORKER_SHARED_SECRET.
WORKER_SHARED_SECRET="$(setting WORKER_SHARED_SECRET openbot-dev-worker-secret)"

# The secret the server sends to a managed Bot, generated and written back on first run.
#
# Not a fixed default like the two above. Those reach services bound to loopback; a Bot publishes a
# port, so a well-known token from a public repository would be no boundary at all. Generated once
# per machine and persisted, because the server and the Bot are separate processes that have to
# agree on it across restarts.
#
# Written into .env rather than exported for this run alone, so `docker compose up` by hand later
# sees the same value the script used.
# The laptop stack runs agent-langgraph on LANGGRAPH_PORT. The one-container image does not, so
# this default stays in the script rather than in .env: a `docker run --env-file .env` must not
# inherit a URL that points at a process the image does not contain.
# FreeDuet: with the subscription router on (the default), the members live at agent-freeduet
# (docs/M1_PLAN.md D1), so a .env from before M1 without this line must not send them to LangGraph.
if [ "$(setting FREEDUET_ROUTER on)" != "off" ]; then
  MANAGED_AGENT_AG_UI_DEFAULT="http://localhost:${FREEDUET_PORT}/"
else
  MANAGED_AGENT_AG_UI_DEFAULT="http://localhost:${LANGGRAPH_PORT}/ag-ui"
fi
MANAGED_AGENT_AG_UI_URL="$(setting MANAGED_AGENT_AG_UI_URL "$MANAGED_AGENT_AG_UI_DEFAULT")"
export MANAGED_AGENT_AG_UI_URL

MANAGED_AGENT_TOKEN="$(setting MANAGED_AGENT_TOKEN "")"
if [ -z "$MANAGED_AGENT_TOKEN" ]; then
  SECRETS_ROTATED=true
  MANAGED_AGENT_TOKEN="$(openssl rand -base64 32)"
  if grep -qE '^MANAGED_AGENT_TOKEN=' "$ENV_FILE"; then
    # A present but empty line, which is what .env.example ships.
    tmp="$(mktemp)"
    grep -vE '^MANAGED_AGENT_TOKEN=' "$ENV_FILE" > "$tmp"
    printf 'MANAGED_AGENT_TOKEN=%s\n' "$MANAGED_AGENT_TOKEN" >> "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '\nMANAGED_AGENT_TOKEN=%s\n' "$MANAGED_AGENT_TOKEN" >> "$ENV_FILE"
  fi
  printf '\033[2m%s\033[0m\n' "Generated MANAGED_AGENT_TOKEN and wrote it to $ENV_NAME."
fi
export MANAGED_AGENT_TOKEN

# The secret a framework Bot presents when it calls a tool back through this server. The other
# direction of the pair above: that one is the server proving itself to the Bot, this one is the Bot
# proving itself to the server, and they are deliberately two different secrets.
#
# Generated here for the same reason, and it has to be. `.env.example` ships it empty, which is the
# right default for a deployment: absent, no Bot may call tools back and it is told so rather than
# quietly allowed. On a laptop that default meant every MCP tool was dead on arrival. An
# administrator could enable Google Drive, grant `search_files` to a Bot, read "May call this tool"
# on the grant screen, and get "This Bot has no credential for calling tools back through its
# deployment" on every single call, with no audit row, because the call never reached the server to
# be recorded.
AGENT_TOOL_TOKEN="$(setting AGENT_TOOL_TOKEN "")"
if [ -z "$AGENT_TOOL_TOKEN" ]; then
  SECRETS_ROTATED=true
  AGENT_TOOL_TOKEN="$(openssl rand -base64 32)"
  if grep -qE '^AGENT_TOOL_TOKEN=' "$ENV_FILE"; then
    # A present but empty line, which is what .env.example ships.
    tmp="$(mktemp)"
    grep -vE '^AGENT_TOOL_TOKEN=' "$ENV_FILE" > "$tmp"
    printf 'AGENT_TOOL_TOKEN=%s\n' "$AGENT_TOOL_TOKEN" >> "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '\nAGENT_TOOL_TOKEN=%s\n' "$AGENT_TOOL_TOKEN" >> "$ENV_FILE"
  fi
  printf '\033[2m%s\033[0m\n' "Generated AGENT_TOOL_TOKEN and wrote it to $ENV_NAME."
fi
export AGENT_TOOL_TOKEN

# FreeDuet: the subscription router, agent-freeduet, unless FREEDUET_ROUTER=off (docs/M1_PLAN.md).
FREEDUET_ROUTER="$(setting FREEDUET_ROUTER on)"
freeduet_env_line() {
  local tmp
  tmp="$(mktemp)"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}
if [ "$FREEDUET_ROUTER" != "off" ]; then
  # The key the server presents on agent-freeduet's /v1/messages, generated once like the two above.
  FREEDUET_LOCAL_KEY="$(setting FREEDUET_LOCAL_KEY "")"
  if [ -z "$FREEDUET_LOCAL_KEY" ]; then
    SECRETS_ROTATED=true
    FREEDUET_LOCAL_KEY="$(openssl rand -hex 32)"
    freeduet_env_line FREEDUET_LOCAL_KEY "$FREEDUET_LOCAL_KEY"
    printf '\033[2m%s\033[0m\n' "Generated FREEDUET_LOCAL_KEY and wrote it to $ENV_NAME."
  fi
  # The server's own model calls (titles, routing, auto-review...) go to agent-freeduet's
  # /v1/messages through ANTHROPIC_BASE_URL, so the "Anthropic key" they send is this local key.
  # Only when empty: a key somebody set is theirs to keep.
  if [ -z "$(setting ANTHROPIC_API_KEY "")" ]; then
    SECRETS_ROTATED=true
    freeduet_env_line ANTHROPIC_API_KEY "$FREEDUET_LOCAL_KEY"
  fi
  export FREEDUET_LOCAL_KEY
  # The server refuses a localhost agent endpoint unless it is named (server/src/config.ts).
  AGENT_ENDPOINT_ALLOWED_HOSTS="$(setting AGENT_ENDPOINT_ALLOWED_HOSTS "localhost:$FREEDUET_PORT")"
  export AGENT_ENDPOINT_ALLOWED_HOSTS
fi
# FreeDuet: conversations and memory in this server's own database unless FREEDUET_INTELLIGENCE=on
# (#42). Written when the settings file has no line for it, like the keys above, so a later
# `docker compose up` by hand runs the same way. A file with all three Intelligence settings is an
# install from before #42 whose conversations are in Intelligence: it gets `on`, and keeps them.
# Anything else gets `off`, and the server is restarted to pick it up. A new install copies
# `.env.example`, which already says `off`.
if [ -z "$(setting FREEDUET_INTELLIGENCE "")" ]; then
  if [ -n "$(setting INTELLIGENCE_API_URL "")" ] && [ -n "$(setting INTELLIGENCE_GATEWAY_WS_URL "")" ] \
     && [ -n "$(setting INTELLIGENCE_API_KEY "")" ]; then
    freeduet_env_line FREEDUET_INTELLIGENCE on
    printf '\033[2m%s\033[0m\n' "Wrote FREEDUET_INTELLIGENCE=on to $ENV_NAME: your conversations stay in CopilotKit Intelligence. Set it to off to keep new ones in FreeDuet's own database."
  else
    SECRETS_ROTATED=true
    freeduet_env_line FREEDUET_INTELLIGENCE off
    printf '\033[2m%s\033[0m\n' "Wrote FREEDUET_INTELLIGENCE=off to $ENV_NAME: conversations and memory stay in FreeDuet's own database."
    if [ -n "$(setting INTELLIGENCE_API_KEY "")" ]; then
      printf '\033[2m%s\033[0m\n' "Your CopilotKit Intelligence settings are kept and not used. Set FREEDUET_INTELLIGENCE=on to use them."
    fi
  fi
fi
FREEDUET_INTELLIGENCE="$(setting FREEDUET_INTELLIGENCE off)"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
info()  { printf '\033[2m%s\033[0m\n' "$1"; }

# Does whatever holds this port answer as OpenBot, rather than merely answer?
#
# `curl -f` proves something is listening and returned 2xx. That is not the same claim, and the gap
# between them is not academic: any single-page app serves its own index.html for every path it does
# not recognise, so an unrelated dashboard sitting on a default port answers 200 to
# `/api/capabilities` as readily as this server does.
#
# When that happened here the cost was not a wrong answer, it was a wrong answer three stages later.
# `require_free_or_ours` reported "already up", the server was therefore never started, `wait_for`
# printed a green "server ready", and the run died at stage 3 parsing a mouthful of HTML as JSON —
# a JSON parse error standing in for "that port belongs to something else".
#
# So each surface is asked for something only it can produce.
identifies_as_openbot() {
  local port="$1" name="$2"
  case "$name" in
    # A field of this server's own payload. A stray 200 does not carry it. Not the CopilotKit info
    # route: its `licenseStatus` is sent only with Intelligence, so a FreeDuet server with
    # FREEDUET_INTELLIGENCE=off (the default, #42) never matched, and start.sh gave up on it.
    # `durableHistory` is sent in both runtime modes (server/src/app.ts).
    server)
      curl -fsS --max-time 3 "http://localhost:$port/api/capabilities" 2>/dev/null \
        | grep -q '"durableHistory"'
      ;;
    # The app is static HTML with nothing to interrogate, so a marker in its head is the identity
    # available. Not the title: a fork that renames the product changes the title with it.
    app)
      curl -fsS --max-time 3 "http://localhost:$port/" 2>/dev/null \
        | grep -qiE '<meta name="openbot" content="app"|<title>[^<]*OpenBot'
      ;;
    # Compose services on dedicated loopback ports, answering a route named for this stack.
    *)
      curl -fsS --max-time 3 "http://localhost:$port/health" >/dev/null 2>&1
      ;;
  esac
}

require_free_or_ours() {
  local port="$1" name="$2" who
  who="$(holder "$port")"
  [ -z "$who" ] && return 0
  if identifies_as_openbot "$port" "$name"; then
    info "  $name: already up on $port ($who)"
    return 0
  fi
  red "  $name: port $port is held by something that is not OpenBot: $who"
  # `tr`, not `${name^^}`, which is bash 4. macOS ships bash 3.2, where that expansion is a "bad
  # substitution" and the run ended on it instead of on this hint.
  red "  Re-run with $(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')_PORT=<free port>, or stop that process yourself."
  exit 1
}

# As wait_for, but satisfied only by OpenBot answering, not by anything answering.
wait_for_openbot() {
  local port="$1" name="$2" tries="${3:-40}"
  for _ in $(seq 1 "$tries"); do
    identifies_as_openbot "$port" "$name" && { green "  $name ready"; return 0; }
    sleep 1
  done
  red "  $name never answered as OpenBot on port $port"
  red "  Either it failed to start, or that port belongs to another process."
  red "  Log: $LOGS/${name}.log"
  exit 1
}

wait_for() {
  local url="$1" name="$2" tries="${3:-40}"
  for _ in $(seq 1 "$tries"); do
    curl -fsS --max-time 3 "$url" >/dev/null 2>&1 && { green "  $name ready"; return 0; }
    sleep 1
  done
  red "  $name never became ready at $url"
  red "  Log: $LOGS/${name}.log"
  exit 1
}

# The worker handoff probe says nothing about the API's computer credential. Reuse requires a
# stamp from a successful launch with this token AND this same owned listener. The start time
# prevents a recycled PID from making a stale stamp look current. Never inspect process secrets.
server_computer_state() {
  local pid started owned
  pid="$(port_pids "$SERVER_PORT")"
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  owned="$(openbot_matching_pids "$SERVER_ENTRY" "$ROOT/server")
$(openbot_matching_pids "$SERVER_DEV_ENTRY" "$ROOT/server")"
  # Not `grep -q`: it exits at the first match, but printf writes each line with its own write(2), so
  # the next write met a closed pipe, and under `pipefail` the match failed with status 141 (SIGPIPE).
  # Without -q, grep reads to the end of its input, so printf is never cut short.
  printf '%s\n' "$owned" | grep -Fx "$pid" >/dev/null || return 1
  if [ "${OS:-}" = Windows_NT ]; then
    started="$(OPENBOT_PID="$pid" openbot_powershell '
      Get-Process -Id $env:OPENBOT_PID -ErrorAction SilentlyContinue |
        ForEach-Object { $_.StartTime.ToUniversalTime().Ticks }')"
  else
    started="$(ps -p "$pid" -o lstart= 2>/dev/null)" || return 1
  fi
  [ -n "$started" ] || return 1
  printf 'v1\n%s\n%s\n%s\n' "$COMPUTER_TOKEN_FINGERPRINT" "$pid" "$started"
}

stop_server_processes_for_restart() {
  stop_matching "$SERVER_ENTRY" "$ROOT/server"
  stop_matching "$SERVER_DEV_ENTRY" "$ROOT/server"
}

# A pre-fix Windows launch has no absolute entry path, and CIM cannot tell us its cwd. Refuse
# to guess which deployment owns it, including before reusing a stale API or duplicating a worker.
if [ "${OS:-}" = Windows_NT ]; then
  for pattern in "$SERVER_ENTRY" "$SERVER_DEV_ENTRY" "$WORKER_ENTRY"; do
    UNSCOPED_PIDS="$(openbot_windows_matching "$pattern" "$ROOT" unscoped)"
    if [ -n "$UNSCOPED_PIDS" ]; then
      red "A legacy Bun process uses a relative entry path; its deployment cannot be verified (PIDs: $(printf '%s' "$UNSCOPED_PIDS" | tr '\n' ' '))."
      red "Stop that process in Task Manager, then rerun bash scripts/start.sh in its checkout."
      exit 1
    fi
  done
fi

# The product's name, from the tenant package the server will load, so a renamed fork prints its own.
# The server resolves a relative TENANT_PACKAGE_DIR from server/, so this does the same.
# FreeDuet: the default is FreeDuet's package (docs/UPSTREAM_TOUCHES.md).
TENANT_DIR="$(setting TENANT_PACKAGE_DIR ../examples/freeduet)"
case "$TENANT_DIR" in /*) ;; *) TENANT_DIR="$ROOT/server/$TENANT_DIR" ;; esac
PRODUCT_NAME="$(sed -n 's/^[[:space:]]*product_name:[[:space:]]*//p' "$TENANT_DIR/brand.yaml" 2>/dev/null | head -1 || true)"
PRODUCT_NAME="${PRODUCT_NAME:-OpenBot}"
echo
echo "$PRODUCT_NAME"
echo "$PRODUCT_NAME" | sed 's/./=/g'

info "1/4  Docker services"
SERVICES=(postgres)
if [ "$ONE_COMPUTER_EACH" = "true" ]; then
  SERVICES+=(supervisor)
fi
#
# Every selected Bot service, every run, whether or not it is already answering.
#
# This used to skip one that answered its health route, which sounds like an optimisation and is
# actually a correctness bug: answering says the process is alive, not that its environment still
# matches the deployment's. A skipped service is never handed to `docker compose up`, so compose
# never compares its configuration and never recreates it.
#
# Which is how a Bot ends up holding a secret this deployment no longer accepts. `AGENT_TOOL_TOKEN`
# is generated above and written to .env; if the container was answering, it kept the previous one,
# and every tool call it made was refused at the door. It returns nothing to its own model, and the
# model tells the person there were no results — a false negative delivered as an answer.
#
# `docker compose up -d` is declarative and does nothing for a service whose configuration has not
# changed, so naming them all costs a comparison and buys the guarantee that what is running is what
# this run configured.
SERVICES+=(agent-computer)
# The managed coworker uses LangGraph. The separate legacy sample only accepts OpenAI keys,
# so requiring it would prevent an Anthropic-only deployment from reaching its managed Bot.
if [ "$BOT_PROVIDER" = "anthropic" ]; then
  info "  agent-bot: skipped for Anthropic (OpenAI-only sample)"
else
  SERVICES+=(agent-bot)
fi
SERVICES+=(agent-langgraph)
if [ "$FREEDUET_ROUTER" != "off" ]; then
  SERVICES+=(agent-freeduet)
  # agent-freeduet reads the prompts from the package the server loads.
  FREEDUET_TENANT_DIR="$(setting FREEDUET_TENANT_DIR "$TENANT_DIR")"
  export FREEDUET_TENANT_DIR
fi

export SUPERVISOR_TOKEN COMPUTER_TOKEN WORKER_SHARED_SECRET
export COMPUTER_PORT BOT_PORT LANGGRAPH_PORT SUPERVISOR_PORT
# Quiet progress, because stdout is /dev/null while stderr is still the terminal. Seeing that
# terminal, newer Compose (v5 and later) picks its interactive build display and tries to draw it on
# stdout, and stops with "failed to get console: provided file is not a console". An environment
# variable rather than `--progress`, because a Compose too old to know the flag refuses it, and one
# too old to know the variable ignores it.
COMPOSE_PROGRESS=quiet compose up -d --build "${SERVICES[@]}" >/dev/null
if ! compose run --rm --build migrate >"$LOGS/migrate.log" 2>&1; then
  red "  Migrations did not apply. The database is not the schema this server expects."
  red "  Log: $LOGS/migrate.log"
  exit 1
fi
wait_for "http://localhost:$COMPUTER_PORT/health" "agent-computer"
if [ "$BOT_PROVIDER" != "anthropic" ]; then
  wait_for "http://localhost:$BOT_PORT/health" "agent-bot"
fi
wait_for "http://localhost:$LANGGRAPH_PORT/health" "agent-langgraph"
if [ "$FREEDUET_ROUTER" != "off" ]; then
  wait_for "http://localhost:$FREEDUET_PORT/health" "agent-freeduet"
  # Asked of the CLI itself; nothing here reads its sign-in directory.
  CLAUDE_AUTH_STATUS="$(compose exec -T agent-freeduet claude auth status --json 2>/dev/null || true)"
  if ! [[ "$CLAUDE_AUTH_STATUS" =~ \"loggedIn\"[[:space:]]*:[[:space:]]*true ]]; then
    info "  Claude Code is not signed in yet. Sign in once, from openbot/: $COMPOSE_HINT exec -it agent-freeduet claude"
  fi
fi

for table in agent_profiles agent_preferences; do
  if ! compose exec -T postgres \
       psql -U openbot -d openbot -tAc "select to_regclass('public.$table')" 2>/dev/null \
       | grep -q "^$table$"; then
    red "  $table is missing. Run: bun run --cwd server db:migrate"
    exit 1
  fi
done
green "  coworker tables migrated"

# Resolved at the top, where the default that .env deliberately does not carry is applied. Reading
# .env again here would have demanded the line be present in a file the comment above that default
# says must not contain it, which is how this came to refuse every fresh clone: `cp .env.example
# .env` leaves it commented out, so the grep matched nothing.
#
# It failed silently, too. Under `set -o pipefail` a grep that matches nothing fails its whole
# pipeline, and `set -e` then aborts the assignment before the check below could say why. The same
# grep survives inside `setting()` only because `local v="$(...)"` takes `local`'s own exit status
# and masks it. So: report what was resolved, and do not re-read the file.
green "  managed coworker endpoint: $MANAGED_AGENT_AG_UI_URL"

# Automatic Learning collects nothing until a container is assigned. The server assigns this
# project's `openbot` container on its own once it exists (server/src/learning/auto-assign.ts), but
# the runtime key it holds cannot create one. A CopilotKit CLI login can, whether or not a project is
# selected here, and so can INTELLIGENCE_SERVICE_TOKEN on a local evaluation install, so make sure the
# container exists before the server looks. Never fatal and never interactive: one line, whatever
# happens, and with nothing that can create it the line says exactly what to run.
LEARNING_CONTAINER="$(setting CPK_INTELLIGENCE_LEARNING_CONTAINER_ID "")"
LEARNING_AUTO_ASSIGN="$(setting OPENBOT_LEARNING_AUTO_ASSIGN true)"
# Only for `.env`: the helper reads and writes that file, never another stack's (OPENBOT_ENV_FILE).
# FreeDuet: Learning is an Intelligence feature, so not with FREEDUET_INTELLIGENCE=off (#42).
if [ "$ENV_NAME" = .env ] && [ -z "$LEARNING_CONTAINER" ] && [ "$LEARNING_AUTO_ASSIGN" != "false" ] \
   && [ "$LEARNING_AUTO_ASSIGN" != "0" ] && [ -n "$(setting INTELLIGENCE_API_KEY "")" ] \
   && [ "$FREEDUET_INTELLIGENCE" = on ]; then
  LEARNING_LINE="$(bun scripts/setup-learning.ts --non-interactive 2>>"$LOGS/learning-setup.log" | tail -1 || true)"
  info "  ${LEARNING_LINE:-Automatic Learning: the container check did not run. Log: $LOGS/learning-setup.log}"
fi

info "2/4  Server"
require_free_or_ours "$SERVER_PORT" server
COMPUTER_TOKEN_CHANGED=false
if identifies_as_openbot "$SERVER_PORT" server; then
  if ! CURRENT_COMPUTER_STATE="$(server_computer_state)"; then
    red "  server: cannot verify listener ownership and launch time for this checkout"
    red "  Stop that API yourself, then rerun bash scripts/start.sh in its checkout."
    exit 1
  fi
  # A pre-stamp API is unknown, so restart it once. Never stamp a reused process whose actual
  # launch credential is unknown, even when today's .env and Compose already agree.
  if [ ! -r "$COMPUTER_STATE_FILE" ] || [ "$(cat "$COMPUTER_STATE_FILE")" != "$CURRENT_COMPUTER_STATE" ]; then
    COMPUTER_TOKEN_CHANGED=true
  fi
fi
#
# A running server is left alone when its computer-token stamp matches and no other secret was
# generated this run. It read its environment once at startup and cannot notice later file edits.
#
# Skipping it on "already answering" is the same mistake the Bot containers had: answering proves the
# process is alive, not that it agrees with the deployment. A server holding the previous
# `AGENT_TOOL_TOKEN` refuses every callback its own Bots make, which reaches a person as "no results"
# rather than as an error.
if [ "$SECRETS_ROTATED" = "true" ] || [ "$COMPUTER_TOKEN_CHANGED" = "true" ]; then
  info "  server: its computer credential is unverified or a secret changed, so it is restarted"
  stop_server_processes_for_restart
  sleep 1
fi
#
# A server that answers as OpenBot can still be one no worker can hand a routine to. The worker
# below is started unconditionally with this run's WORKER_SHARED_SECRET, and every dispatch it makes
# is one POST to this server's /internal/routines/run — a door that a server started from an older
# checkout does not have (404), and that a server started before this secret existed in its
# environment holds shut (401, `workerSharedSecret` undefined or different). Either way routines
# never fire, and nothing at start time says why.
#
# So before keeping a running server, ask it the one thing only a compatible one answers well: POST
# the handoff route with this run's secret and a deliberately empty body. In server/src/app.ts the
# secret is checked before the body is parsed, so a server holding this same secret rejects the
# empty body with 400 — the healthy answer. 401 means it does not hold this secret; 404 means it
# predates the route. Both are cured by a restart into this run's environment, so fall through to
# the launch below. Anything else — including a probe that could not connect at all — keeps the
# philosophy of leaving an answering server alone.
if identifies_as_openbot "$SERVER_PORT" server; then
  HANDOFF_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
    -X POST "http://localhost:$SERVER_PORT/internal/routines/run" \
    -H "Authorization: Bearer $WORKER_SHARED_SECRET" \
    -H "Content-Type: application/json" --data '{}' 2>/dev/null || true)"
  case "$HANDOFF_STATUS" in
    401)
      info "  server: up, but refuses the worker's secret (401), so it is restarted to pick it up"
      stop_server_processes_for_restart
      sleep 1
      ;;
    404)
      info "  server: up, but has no /internal/routines/run (404: an older checkout), so it is restarted"
      stop_server_processes_for_restart
      sleep 1
      ;;
  esac
fi
SERVER_LAUNCHED=false
if ! identifies_as_openbot "$SERVER_PORT" server; then
  rm -f "$COMPUTER_STATE_FILE"
  SERVER_LAUNCHED=true
  # Every background launch below has its own stdout and stderr sent to /dev/null; the server's output
  # still goes to its log. A background job keeps the stdout it inherited open for as long as it
  # runs, and a caller that reads that stdout (CI's `bash start.sh | tee`) waits for it to close. A
  # server never closes it, so the caller hung after start.sh had already exited (#21).
  if [ "$ONE_COMPUTER_EACH" = "true" ]; then
    (cd server && PORT="$SERVER_PORT" \
      COMPUTER_SUPERVISOR_URL="http://localhost:$SUPERVISOR_PORT" \
      SUPERVISOR_TOKEN="$SUPERVISOR_TOKEN" \
      COMPUTER_TOKEN="$COMPUTER_TOKEN" \
      WORKER_SHARED_SECRET="$WORKER_SHARED_SECRET" \
      bun "--env-file=../$ENV_NAME" "$ROOT/server/src/production-entry.ts" >"$LOGS/server.log" 2>&1 &) </dev/null >/dev/null 2>&1
  else
    (cd server && PORT="$SERVER_PORT" \
      WORKER_SHARED_SECRET="$WORKER_SHARED_SECRET" \
      bun "--env-file=../$ENV_NAME" "$ROOT/server/src/production-entry.ts" >"$LOGS/server.log" 2>&1 &) </dev/null >/dev/null 2>&1
  fi
fi
wait_for_openbot "$SERVER_PORT" server
if [ "$SERVER_LAUNCHED" = "true" ]; then
  if ! CURRENT_COMPUTER_STATE="$(server_computer_state)"; then
    red "  server: cannot verify the launched listener's ownership and start time"
    exit 1
  fi
  state_tmp="$(mktemp "$LOGS/server-computer.XXXXXX")"
  chmod 600 "$state_tmp"
  printf '%s\n' "$CURRENT_COMPUTER_STATE" > "$state_tmp"
  mv "$state_tmp" "$COMPUTER_STATE_FILE"
elif [ "$COMPUTER_TOKEN_CHANGED" = "true" ]; then
  red "  server: the old API is still answering; its computer credential was not refreshed"
  exit 1
fi

# The worker: a local stand-in for the routines CronJob, looping the same sweep
# (`offerDueRoutines`/`dispatchClaimedRoutines`) a cluster would run on a schedule instead. Started
# only now, because dispatching a claimed routine is one HTTP call to this server's own
# /internal/routines/run, and the wait_for above is what confirms that call has somewhere to land.
#
# The worker has no HTTP endpoint, so only a matching process owned by this checkout is reused.
# Its absolute entry path also distinguishes deployments on Windows, where CIM cannot report cwd.
if ! running "$WORKER_ENTRY" "$ROOT"; then
  WORKER_DATABASE_URL="$(setting DATABASE_URL postgres://openbot:openbot@localhost:5432/openbot)"
  # Another stack's worker names its settings file, which also keeps Bun from loading `.env`.
  WORKER_ENV_ARG=()
  [ "$ENV_NAME" = .env ] || WORKER_ENV_ARG=("--env-file=$ENV_NAME")
  (cd "$ROOT" && \
    DATABASE_URL="$WORKER_DATABASE_URL" \
    SERVER_INTERNAL_URL="http://localhost:$SERVER_PORT" \
    WORKER_SHARED_SECRET="$WORKER_SHARED_SECRET" \
    bun ${WORKER_ENV_ARG[@]+"${WORKER_ENV_ARG[@]}"} "$ROOT/worker/src/index.ts" >"$LOGS/worker.log" 2>&1 &) </dev/null >/dev/null 2>&1
  info "  worker: started (routine sweep loop)"
  sleep 1
  if ! running "$WORKER_ENTRY" "$ROOT"; then
    red "  worker: did not stay up, check $LOGS/worker.log"
  fi
else
  info "  worker: already running"
fi

info "3/4  Runtime health"
INFO="$(curl -fsS --max-time 8 "http://localhost:$SERVER_PORT/api/copilotkit/info")"
# Read with Bun, which every run of this script already needs, rather than python3, which not every
# machine has. On Windows `python3` is usually the Microsoft Store alias, which prints "Python was not
# found" and exits 49, so the run stopped here with the server and worker up and the app never
# started.
bun run - "$INFO" <<'JS'
const info = JSON.parse(process.argv[2]);
const status = info.licenseStatus;
const agents = Object.keys(info.agents ?? {});
// FreeDuet (#42): without Intelligence the runtime runs in SSE mode and has no licence to check.
const local = info.mode === "sse";
if (!local && status !== "valid") {
  console.log(`\x1b[31m  licence is '${status}', not 'valid'.\x1b[0m`);
  console.log("\x1b[31m  Check INTELLIGENCE_API_KEY. From the repository root: npx copilotkit@latest login && npx copilotkit@latest project select && bun openbot/scripts/setup-learning.ts\x1b[0m");
  console.log("\x1b[31m  The Quick start in the repository's README.md has the steps.\x1b[0m");
  process.exit(1);
}
if (agents.length === 0) {
  console.log("\x1b[31m  No Bots registered.\x1b[0m");
  process.exit(1);
}
console.log(`\x1b[32m  ${local ? "conversations in this server's database" : "licence valid"} · mode ${info.mode} · Bots: ${agents.join(", ")}\x1b[0m`);
JS

info "4/4  App"
require_free_or_ours "$APP_PORT" app
if ! identifies_as_openbot "$APP_PORT" app; then
  (cd app && bun run dev --port "$APP_PORT" --strictPort >"$LOGS/app.log" 2>&1 &) </dev/null >/dev/null 2>&1
fi
wait_for_openbot "$APP_PORT" app

cat <<EOF

$(green "Ready. http://localhost:$APP_PORT")

Next steps:

  - The app:               http://localhost:$APP_PORT/
  - Setup checklist:       http://localhost:$APP_PORT/settings/setup
  - Approval rules:        http://localhost:$APP_PORT/settings/approvals
  - Routines:              http://localhost:$APP_PORT/routines
  - Audit trail:           http://localhost:$APP_PORT/admin/audit
  - Setup docs:            $REPO_ROOT/README.md
  - Configuration docs:    $ROOT/docs/configuration.md

Try:

  1. Ask $PRODUCT_NAME to do something in its own browser, and watch it work on its computer.
  2. Choose what it must ask you about first, at /settings/approvals.
  3. Ask it to do something on a schedule. You will find it at /routines.
  4. Connect Gmail and Google Calendar. The setup checklist shows what is still open, and the
     Quick start in README.md lists the steps, including the fake Google for trying it without
     an account.

Logs: $LOGS
  Routine sweep worker: $LOGS/worker.log

Stop all of it: $([ "$ENV_NAME" = .env ] || printf 'OPENBOT_ENV_FILE=%s ' "$ENV_NAME")bash scripts/stop.sh
  The app, the worker, the API server, the Docker services, and this deployment's Bot computers
  (those with its COMPUTER_NAMESPACE), which compose does not own because the supervisor makes them.
  Pass --keep-computers to leave the browsers signed in. No data is deleted either way: the
  database, the files and the browser profiles are volumes.
EOF
