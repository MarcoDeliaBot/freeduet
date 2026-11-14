#!/usr/bin/env bash
#
# Start the local OpenDuet stack (OpenBot underneath) and verify each service answers as OpenBot.
# Safe to rerun: matching services are left running, and unrelated port holders are reported.

# Before anything else, and before the `set` line below, which is itself bash-only: this file is
# bash, and being read by `sh` used to end it with exit 1 and no output at all. See that file.
. "$(dirname "$0")/require-bash.sh"
# `holder`, `running` and `stop_matching`, which also work in Git Bash on Windows. See that file.
. "$(dirname "$0")/processes.sh"
# FreeDuet (docs/M1_PLAN.md D39): the values this repository used to publish as defaults, so that a
# `.env` still holding one is told from a secret somebody chose. Only questions, no side effects.
. "$(dirname "$0")/secrets.sh"

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

# The settings file's own line for NAME, read as `setting` reads it from the file (the last one wins, one
# pair of quotes is dropped) but without the environment, which `own_secret` has to tell apart.
file_setting() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true
}

# FreeDuet: writes NAME=VALUE into the settings file, replacing the line that was there. Mode 600, because
# the file holds secrets. Defined here, before the first secret is made below.
freeduet_env_line() {
  local tmp
  tmp="$(mktemp)"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

# FreeDuet (docs/M1_PLAN.md D39): a secret this installation makes for itself, so that no two installations
# share one. Settings that used to fall back to a value published in this repository (the computer, the
# supervisor and the worker's secrets, the database's password, the key that seals saved logins) get a
# random one instead, once, the way FREEDUET_INSTALL_SECRET does below.
#
#   own_secret NAME BYTES hex|base64
#
# - A value in the ENVIRONMENT is the person's own and is used as it is, never written anywhere.
# - Otherwise the settings file's value is kept, unless it is empty or one of the examples this repository
#   used to publish (secrets.sh). Those are no choice anybody made: an older start.sh wrote them, or an
#   older .env.example said them, and every other installation holds the same one.
# - Otherwise a value is made, written to the settings file with freeduet_env_line, and never printed.
#
# Sets NAME, and OWN_SECRET_MADE to whether a value was made. Not for the key that seals saved logins, or
# the database's password: replacing those can lose data, so each has a step of its own further down.
OWN_SECRET_MADE=false
PUBLIC_SECRETS_REPLACED=false
own_secret() {
  local name="$1" bytes="$2" encoding="$3" value="${!1:-}" stored
  OWN_SECRET_MADE=false
  if [ -z "$value" ]; then
    stored="$(file_setting "$name")"
    if [ -n "$stored" ] && ! secret_is_public_default "$name" "$stored"; then
      value="$stored"
    else
      value="$(openssl rand "-$encoding" "$bytes")"
      freeduet_env_line "$name" "$value"
      OWN_SECRET_MADE=true
      SECRETS_ROTATED=true
      if [ -n "$stored" ]; then
        PUBLIC_SECRETS_REPLACED=true
        printf '\033[2m%s\033[0m\n' "Replaced $name, which was the example value published in this repository, with one generated for this installation, and wrote it to $ENV_NAME."
      else
        printf '\033[2m%s\033[0m\n' "Generated $name and wrote it to $ENV_NAME."
      fi
    fi
  fi
  printf -v "$name" '%s' "$value"
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
# Whether this run made a value the worker holds. The worker is started once and left running, so one
# started before this run keeps the old value for as long as it lives: see where it is launched.
WORKER_SETTINGS_CHANGED=false

# FreeDuet (docs/M1_PLAN.md D39): these three used to fall back to a fixed string published in this
# repository, the same one on every installation. Each is now made for this installation, once, and kept
# in the settings file (own_secret, above). A `.env` that still holds the old string gets a new value on
# this start: the containers that hold the token are recreated by Compose (the Bots' computers, which
# Compose does not own, are replaced by the supervisor the next time each is used, with their files and
# logins kept), and the server and the worker are restarted below.
own_secret SUPERVISOR_TOKEN 32 hex
own_secret COMPUTER_TOKEN 32 hex
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

# What the worker presents to the server's /internal/routines/run to hand it a due routine. It used to be
# a fixed string, on the argument that the endpoint accepts nothing but an unguessable `routine_run_<uuid>`
# id and so guards nothing sensitive. That holds, and it is still no reason to publish a credential: a
# secret that is the same on every installation is not a secret, and D39 makes none of them so. Made for
# this installation like the two above. The worker keeps its copy until it is restarted, so a run that
# made a new one restarts the worker too (see where it is launched).
own_secret WORKER_SHARED_SECRET 32 hex
[ "$OWN_SECRET_MADE" = false ] || WORKER_SETTINGS_CHANGED=true

# The secret the server sends to a managed Bot, generated and written back on first run.
#
# Made for this installation like the three above (D39), and it was the first of them to be: a Bot
# publishes a port, so a well-known token from a public repository would be no boundary at all.
# Generated once per machine and persisted, because the server and the Bot are separate processes
# that have to agree on it across restarts.
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

# FreeDuet (docs/M1_PLAN.md D28): this installation's own secret, which tells the person's browser
# from a Bot's computer. With no sign-in the person is whoever reaches the server from this machine's
# loopback, and on Docker Desktop a container calling the server arrives as loopback too. Generated
# once and kept in the settings file like the keys above, for the same reason (the server and anything
# started by hand later must agree on it), and for an install from before this existed it is made on
# the first start after the update, which restarts the server through SECRETS_ROTATED.
#
# NOT EXPORTED, unlike the tokens above: those are exported so Compose can read them, and anything
# exported reaches every child, Compose and the Bots' containers included. The server reads it from
# the settings file by itself. Never printed, and never in a URL: scripts/open.sh hands a browser a
# link that is good once, and the secret itself is only ever sent in a header or a cookie.
FREEDUET_INSTALL_SECRET="$(setting FREEDUET_INSTALL_SECRET "")"
INSTALL_SECRET_NEW=false
if [ -z "$FREEDUET_INSTALL_SECRET" ]; then
  SECRETS_ROTATED=true
  INSTALL_SECRET_NEW=true
  FREEDUET_INSTALL_SECRET="$(openssl rand -hex 32)"
  freeduet_env_line FREEDUET_INSTALL_SECRET "$FREEDUET_INSTALL_SECRET"
  printf '\033[2m%s\033[0m\n' "Generated FREEDUET_INSTALL_SECRET and wrote it to $ENV_NAME."
fi

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
info()  { printf '\033[2m%s\033[0m\n' "$1"; }

# FreeDuet: dictation with a local Whisper, off unless .env says FREEDUET_DICTATION=local (docs/M1_PLAN.md
# D25). Unset, nothing below runs: no service is added, nothing is written to .env and nothing is
# downloaded. The list of models, and the size of each, is shared/whisper-models.ts: a test keeps
# these two in step.
FREEDUET_DICTATION="$(setting FREEDUET_DICTATION "")"
FREEDUET_WHISPER_MODEL="$(setting FREEDUET_WHISPER_MODEL large-v3-turbo-q5_0)"
WHISPER_PORT="$(setting WHISPER_PORT 4240)"
LOCAL_DICTATION=false
case "$FREEDUET_DICTATION" in
  ""|off) ;;
  local) LOCAL_DICTATION=true ;;
  *)
    red "FREEDUET_DICTATION must be local, or unset. It is \"$FREEDUET_DICTATION\" in $ENV_NAME."
    exit 1
    ;;
esac
if [ "$LOCAL_DICTATION" = "true" ]; then
  case "$FREEDUET_WHISPER_MODEL" in
    large-v3-turbo-q5_0) WHISPER_MODEL_SIZE="574 MB" ;;
    large-v3-turbo) WHISPER_MODEL_SIZE="1.6 GB" ;;
    small) WHISPER_MODEL_SIZE="488 MB" ;;
    base) WHISPER_MODEL_SIZE="148 MB" ;;
    *)
      red "FREEDUET_WHISPER_MODEL must be one of: large-v3-turbo-q5_0, large-v3-turbo, small, base. It is \"$FREEDUET_WHISPER_MODEL\" in $ENV_NAME."
      exit 1
      ;;
  esac
  if ! [[ "$WHISPER_PORT" =~ ^[0-9]{1,5}$ ]]; then
    red "WHISPER_PORT must be a port number. It is \"$WHISPER_PORT\" in $ENV_NAME."
    exit 1
  fi
  export FREEDUET_WHISPER_MODEL WHISPER_PORT
  # The three settings the dictation adapter reads, pointed at this service. Only when all three are
  # unset: a person who set any of them chose their own service, and none of them is overwritten. The
  # model name is a label (the service serves the model it was started with); the server is restarted
  # to read the new lines, like for the keys above.
  if [ -z "$(setting TRANSCRIPTION_PROVIDER "")" ] && [ -z "$(setting TRANSCRIPTION_BASE_URL "")" ] \
     && [ -z "$(setting TRANSCRIPTION_MODEL "")" ]; then
    SECRETS_ROTATED=true
    freeduet_env_line TRANSCRIPTION_PROVIDER openai-compatible
    freeduet_env_line TRANSCRIPTION_BASE_URL "http://127.0.0.1:$WHISPER_PORT/v1"
    freeduet_env_line TRANSCRIPTION_MODEL local-whisper
    info "Wrote TRANSCRIPTION_PROVIDER, TRANSCRIPTION_BASE_URL and TRANSCRIPTION_MODEL to $ENV_NAME: dictation uses the Whisper on this computer."
  fi
  info "Dictation is local: a Whisper on this computer hears the microphone and nothing leaves it. The first start downloads the model $FREEDUET_WHISPER_MODEL ($WHISPER_MODEL_SIZE) once, and until it has finished the microphone answers that it cannot reach the service."
fi

# curl as the person (D28), for the calls this script makes that only the person may make. The
# cookie goes in a config file of its own, readable by this user alone and removed at once, because a
# command-line argument is visible to every process on this machine and the secret must not be.
person_curl() {
  local config status=0
  config="$(mktemp)"
  chmod 600 "$config"
  printf 'header = "Cookie: freeduet_install_%s=%s"\n' "$SERVER_PORT" "$FREEDUET_INSTALL_SECRET" > "$config"
  curl -K "$config" "$@" || status=$?
  rm -f "$config"
  return "$status"
}

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
        | grep '"durableHistory"' >/dev/null
      ;;
    # The app is static HTML with nothing to interrogate, so a marker in its head is the identity
    # available. Not the title: a fork that renames the product changes the title with it.
    app)
      curl -fsS --max-time 3 "http://localhost:$port/" 2>/dev/null \
        | grep -iE '<meta name="openbot" content="app"|<title>[^<]*OpenBot' >/dev/null
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
# FreeDuet: the local Whisper (D25). Named here, so Compose starts it although it sits behind a profile.
# Not waited for: the first start downloads the model, which takes longer than a health check should.
if [ "$LOCAL_DICTATION" = "true" ]; then
  SERVICES+=(whisper)
fi

# FreeDuet (docs/M1_PLAN.md D39): the database's password. Not made with own_secret like the others,
# because a database that already exists keeps the password it was created with: writing a new one to the
# settings file alone would lock the server out of its own data. So it is decided here, done after Compose
# has started the database, and written to the settings file last, once the database holds it.
#
# What is replaced is the password the example always named, `openbot`, on Compose's own database on this
# machine, or a DATABASE_URL with no line at all. A DATABASE_URL anybody set (another password, user, host
# or database, or one in the environment) is theirs, and is left exactly as it is.
DATABASE_PASSWORD_NEW=""
DATABASE_URL_NEW=""
DATABASE_URL_STORED=""
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL_STORED="$(file_setting DATABASE_URL)"
  if [ -z "$DATABASE_URL_STORED" ]; then
    DATABASE_PASSWORD_NEW="$(new_database_password)"
    DATABASE_URL_NEW="postgres://openbot:$DATABASE_PASSWORD_NEW@localhost:$(setting POSTGRES_PORT 5432)/openbot"
  elif database_url_is_public_default "$DATABASE_URL_STORED"; then
    DATABASE_PASSWORD_NEW="$(new_database_password)"
    DATABASE_URL_NEW="$(database_url_with_password "$DATABASE_URL_STORED" "$DATABASE_PASSWORD_NEW")"
  fi
fi

export SUPERVISOR_TOKEN COMPUTER_TOKEN WORKER_SHARED_SECRET
export COMPUTER_PORT BOT_PORT LANGGRAPH_PORT SUPERVISOR_PORT
# Quiet progress, because stdout is /dev/null while stderr is still the terminal. Seeing that
# terminal, newer Compose (v5 and later) picks its interactive build display and tries to draw it on
# stdout, and stops with "failed to get console: provided file is not a console". An environment
# variable rather than `--progress`, because a Compose too old to know the flag refuses it, and one
# too old to know the variable ignores it.
COMPOSE_PROGRESS=quiet compose up -d --build "${SERVICES[@]}" >/dev/null

# FreeDuet (D39): the new database password, set on the running database and only then written down.
# Through the container's own socket, which trusts the local user (the checks below rely on it too), so
# the old password is not needed whatever it was; and the new one goes in on standard input, so it is on
# no command line. `-d postgres`, because that database exists before a first start has finished making
# ours. A database that is still starting is asked again for half a minute.
set_database_password() {
  local password="$1"
  for _ in $(seq 1 30); do
    if printf "ALTER ROLE openbot WITH PASSWORD '%s';\n" "$password" \
       | compose exec -T postgres psql -U openbot -d postgres -v ON_ERROR_STOP=1 -q >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}
if [ -n "$DATABASE_PASSWORD_NEW" ]; then
  if set_database_password "$DATABASE_PASSWORD_NEW"; then
    # Written last: from here the file and the database agree, and so does a start that dies right now.
    freeduet_env_line POSTGRES_PASSWORD "$DATABASE_PASSWORD_NEW"
    freeduet_env_line DATABASE_URL "$DATABASE_URL_NEW"
    SECRETS_ROTATED=true
    WORKER_SETTINGS_CHANGED=true
    if [ -n "$DATABASE_URL_STORED" ]; then
      PUBLIC_SECRETS_REPLACED=true
      info "  database: its password was the example one this repository publishes. It is now one generated for this installation, written to $ENV_NAME. Your data is untouched."
    else
      info "  database: generated its password and wrote it to $ENV_NAME."
    fi
    # Compose's copy of the password (what a database made from nothing would be created with), so that
    # the next run compares equal and leaves the database container alone.
    COMPOSE_PROGRESS=quiet compose up -d postgres >/dev/null
  elif [ -z "$DATABASE_URL_STORED" ]; then
    red "  database: its password could not be set, and $ENV_NAME has no DATABASE_URL to fall back to."
    red "  Run this again. If it keeps failing: $COMPOSE_HINT logs postgres"
    exit 1
  else
    red "  database: its password is still the example one this repository publishes, because it could not be changed just now."
    red "  Everything works as it did. Anything that can reach this computer's port $(setting POSTGRES_PORT 5432) can open the database with it."
    red "  Run this again; if it keeps failing, $COMPOSE_HINT logs postgres says why."
  fi
fi
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
       | grep "^$table$" >/dev/null; then
    red "  $table is missing. Run: bun run --cwd server db:migrate"
    exit 1
  fi
done
green "  coworker tables migrated"

# FreeDuet (docs/M1_PLAN.md D39): the key that seals what the database keeps secret: saved logins, the
# connections to Gmail and the rest, a company sign-in provider's secret. The example key every clone
# used to start with is public, so a copy of the database would open all of it.
#
# Not made like the other secrets, because it cannot simply be replaced: whatever was sealed with the old
# key is unreadable under a new one, and nothing here re-seals it. So a key that is missing is made, and
# the public example is replaced only when the database is asked and holds nothing it could have sealed
# (a first start, or one before anything was saved). Otherwise it is left, and said so, on every start.
# A key somebody set is theirs, and a database that cannot be asked is taken to be in use.
#
# After the migration, because the tables it asks about are made by it, and before the server starts,
# which reads the key once.
vault_rows() {
  compose exec -T postgres psql -U openbot -d openbot -tA -v ON_ERROR_STOP=1 -c "$(vault_rows_query)" 2>/dev/null | tr -d '[:space:]'
}
KEY_LEFT_PUBLIC=""
if [ -z "${KEY_ENCRYPTION_KEY:-}" ] && secret_is_public_default KEY_ENCRYPTION_KEY "$(file_setting KEY_ENCRYPTION_KEY)"; then
  VAULT_ROWS="$(vault_rows || true)"
  case "$VAULT_ROWS" in
    0) ;;
    ''|*[!0-9]*) KEY_LEFT_PUBLIC="could not be checked" ;;
    *) KEY_LEFT_PUBLIC="already holds saved logins or connections" ;;
  esac
fi
if [ -z "$KEY_LEFT_PUBLIC" ]; then
  own_secret KEY_ENCRYPTION_KEY 32 base64
else
  red "  KEY_ENCRYPTION_KEY is still the example key this repository publishes. Your database $KEY_LEFT_PUBLIC, and"
  red "  a new key would make anything sealed with this one unreadable, so it was left as it is. Whoever gets a copy"
  red "  of the database can read what it holds. docs/M1_PLAN.md D39 says what changing it takes."
fi
if [ "$PUBLIC_SECRETS_REPLACED" = "true" ]; then
  info "  Secrets that were the same on every installation have been replaced. The server and the worker restart once to use them, and so do the Docker services and Bot computers that held them. Nothing you saved is lost."
fi

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
# FreeDuet (D39): a worker started before this run holds the secret and the database password it was
# started with, and a run that made new ones has made them useless to it: the server refuses its secret
# and the database its password, and every routine silently stops firing. So it is stopped here and
# started again below, with this run's.
if [ "$WORKER_SETTINGS_CHANGED" = "true" ] && running "$WORKER_ENTRY" "$ROOT"; then
  info "  worker: its secret or the database's password changed, so it is restarted"
  stop_matching "$WORKER_ENTRY" "$ROOT"
  for _ in 1 2 3 4 5; do
    running "$WORKER_ENTRY" "$ROOT" || break
    sleep 1
  done
fi
if ! running "$WORKER_ENTRY" "$ROOT"; then
  # No fallback address: the one this used to have named the public password. By here the settings file
  # holds a DATABASE_URL, one way or another, because the server could not have started without one.
  WORKER_DATABASE_URL="$(setting DATABASE_URL "")"
  if [ -z "$WORKER_DATABASE_URL" ]; then
    red "  worker: $ENV_NAME has no DATABASE_URL, so there is no database to give it."
    exit 1
  fi
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
INFO="$(person_curl -fsS --max-time 8 "http://localhost:$SERVER_PORT/api/copilotkit/info")"
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

# FreeDuet (D28): a secret made this run is one no browser holds yet, so open one now, paired. A browser
# that already holds it (every later start) is left alone. Only the person's own stack: the eval stack
# and CI have nobody to look at a window. FREEDUET_NO_BROWSER=1 skips it. scripts/open.sh is also the
# way to pair another browser, or this one after its cookies were cleared.
if [ "$INSTALL_SECRET_NEW" = "true" ] && [ "$ENV_NAME" = .env ] && [ -z "${CI:-}" ] \
   && [ "${FREEDUET_NO_BROWSER:-}" != "1" ]; then
  bash "$ROOT/scripts/open.sh" || info "  Could not open a browser. Run: bash scripts/open.sh"
fi

cat <<EOF

$(green "Ready. http://localhost:$APP_PORT")

Next steps:

  - The app:               http://localhost:$APP_PORT/
  - Another browser, or one that says it is not paired:   bash scripts/open.sh
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
