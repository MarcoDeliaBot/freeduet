#!/usr/bin/env bash
#
# FreeDuet's eval stack: a second, fully separate FreeDuet on this machine, for the team evals
# (evals/team/README.md). The evals create conversations and memories as the person; run against
# the person's own FreeDuet they filled its sidebar and its memory with invented facts. This one has
# its own Compose project, ports, database, files, checkpoints and settings file (and, only with
# FREEDUET_INTELLIGENCE=on, its own CopilotKit Intelligence project), and is started and stopped
# through the same scripts/start.sh and stop.sh.
#
#   bash openbot/scripts/freeduet-eval-stack.sh up       start it (writes openbot/.env.eval the first time)
#   bash openbot/scripts/freeduet-eval-stack.sh reset    wipe its database, files and memories, start clean
#   bash openbot/scripts/freeduet-eval-stack.sh down     stop it; its data stays until the next reset
#   bash openbot/scripts/freeduet-eval-stack.sh status   what is running, and where
#
# Shared with the person's FreeDuet, on purpose: the Docker images (same checkout) and the Claude
# Code sign-in, whose volume agent-freeduet mounts as an external volume (scripts/freeduet-eval-compose.yml).
# Nothing here reads, copies or prints that sign-in: only the CLI does, as in the main stack.
# Ports and the rest: docs/M0_DEMO.md, "Eval stack".

. "$(dirname "$0")/require-bash.sh"

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
REPO_ROOT="$(dirname "$ROOT")"
ENV_NAME=.env.eval
ENV_FILE="$ROOT/$ENV_NAME"
PROJECT=freeduet-eval
COMPOSE_FILES="docker-compose.yml:scripts/freeduet-eval-compose.yml"
# The person's own settings: read for two things only, the Compose project whose sign-in volume is
# shared and the Intelligence key the eval stack must not share. Never written.
PERSON_ENV="$ROOT/.env"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
info()  { printf '\033[2m%s\033[0m\n' "$1"; }

usage() {
  sed -n '10,13p' "$0" | sed 's/^# \{0,1\}//'
}

# A value from a settings file, as start.sh reads one: the last line wins, quotes are dropped.
value_in() {
  [ -f "$1" ] || return 0
  grep -E "^$2=" "$1" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true
}
setting() { value_in "$ENV_FILE" "$1"; }

# Writes NAME=VALUE into .env.eval, replacing the line that was there.
set_line() {
  local tmp
  tmp="$(mktemp)"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

# The ports, all on this machine only (docker-compose.yml publishes on loopback). The first `up`
# writes them; FREEDUET_EVAL_<NAME> picks another one then, for a machine where one is taken.
PORTS="APP_PORT=3110 SERVER_PORT=3101 COMPUTER_PORT=4110 BOT_PORT=4210 LANGGRAPH_PORT=4211 FREEDUET_PORT=4231 SUPERVISOR_PORT=4510 POSTGRES_PORT=5442"

write_settings() {
  local pair name port token
  umask 077
  cp "$ROOT/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  for pair in $PORTS; do
    name="${pair%%=*}"
    token="FREEDUET_EVAL_$name"
    port="${!token:-${pair#*=}}"
    set_line "$name" "$port"
  done
  local server app freeduet postgres
  server="$(setting SERVER_PORT)"
  app="$(setting APP_PORT)"
  freeduet="$(setting FREEDUET_PORT)"
  postgres="$(setting POSTGRES_PORT)"
  set_line PORT "$server"
  set_line DATABASE_URL "postgres://openbot:openbot@localhost:$postgres/openbot"
  set_line OPENBOT_PUBLIC_URL "http://localhost:$server"
  set_line TRUSTED_ORIGINS "http://localhost:$app"
  # Its own Compose project, with the overlay that shares the person's sign-in volume.
  set_line COMPOSE_PROJECT_NAME "$PROJECT"
  set_line COMPOSE_FILE "$COMPOSE_FILES"
  # Its own Bot computers (the supervisor names containers and volumes by this) and its own name in
  # every thread id it mints.
  set_line COMPUTER_NAMESPACE "$PROJECT"
  set_line DEPLOYMENT_ID "$PROJECT"
  # The members at this stack's agent-freeduet, and its tools called back on this stack's server.
  set_line MANAGED_AGENT_AG_UI_URL "http://localhost:$freeduet/"
  set_line AGENT_ENDPOINT_ALLOWED_HOSTS "localhost:$freeduet"
  set_line ANTHROPIC_BASE_URL "http://localhost:$freeduet"
  set_line OPENBOT_TOOL_URL "http://host.docker.internal:$server/api/agent-tools/call"
  # Fresh secrets of its own. start.sh generates MANAGED_AGENT_TOKEN, AGENT_TOOL_TOKEN and
  # FREEDUET_LOCAL_KEY (the example leaves them empty); these four it would otherwise take from
  # fixed development defaults, the same ones the person's FreeDuet uses.
  set_line KEY_ENCRYPTION_KEY "$(openssl rand -base64 32)"
  set_line COMPUTER_TOKEN "$(openssl rand -hex 32)"
  set_line SUPERVISOR_TOKEN "$(openssl rand -hex 32)"
  set_line WORKER_SHARED_SECRET "$(openssl rand -hex 32)"
  # Evals never feed Automatic Learning: a learned skill would change the next run's answers.
  set_line OPENBOT_LEARNING_AUTO_ASSIGN false
  # A self-hosted Intelligence is the same service for both stacks; the key is not (see below).
  local url
  for name in INTELLIGENCE_API_URL INTELLIGENCE_GATEWAY_WS_URL; do
    url="$(value_in "$PERSON_ENV" "$name")"
    [ -z "$url" ] || set_line "$name" "$url"
  done
  green "  Wrote openbot/$ENV_NAME (ports: $(for pair in $PORTS; do printf '%s ' "${pair%%=*}=$(setting "${pair%%=*}")"; done))"
}

# The person's Claude Code sign-in volume, as Compose names it for the person's own project.
login_volume() {
  if [ -n "${FREEDUET_CLAUDE_LOGIN_VOLUME:-}" ]; then
    printf '%s' "$FREEDUET_CLAUDE_LOGIN_VOLUME"
    return
  fi
  local settings="$PERSON_ENV"
  [ -f "$settings" ] || settings="$ROOT/.env.example"
  env -u COMPOSE_FILE -u COMPOSE_PROJECT_NAME -u COMPOSE_ENV_FILES \
    docker compose --env-file "$settings" config --format json 2>/dev/null \
    | bun -e 'const config = JSON.parse(await Bun.stdin.text()); process.stdout.write(config.volumes?.["freeduet-claude-login"]?.name ?? "");'
}

# CopilotKit Intelligence keeps each person's memories, by user id, and with no sign-in both stacks
# are the same user. On one Intelligence project the evals would read the person's memories and
# write invented ones into them, whatever database this stack has. So: a project of its own.
#
# With FREEDUET_INTELLIGENCE=off (#42; .env.example's value, and start.sh writes it when the line is
# missing) there is no Intelligence: conversations and memories are in this stack's own database,
# which is already separate. No key is needed and none is asked for.
check_intelligence() {
  local key person shared
  if [ "$(setting FREEDUET_INTELLIGENCE)" != on ]; then
    info "  Intelligence: off. Conversations and memories are in the eval stack's own database."
    INTELLIGENCE_SHARED=false
    return 0
  fi
  key="$(setting INTELLIGENCE_API_KEY)"
  person="$(value_in "$PERSON_ENV" INTELLIGENCE_API_KEY)"
  shared="${FREEDUET_EVAL_SHARE_INTELLIGENCE:-$(setting FREEDUET_EVAL_SHARE_INTELLIGENCE)}"
  if [ -z "$key" ]; then
    red "  The eval stack needs a CopilotKit Intelligence project of its own."
    red "  Intelligence keeps memories per person, and both stacks are the same person, so on your"
    red "  FreeDuet's project the evals would read and change your real memories."
    red "  Create a second project at https://intelligence.copilotkit.ai, copy its runtime key"
    red "  (API Keys), then, from the repository root:"
    red "    FREEDUET_EVAL_INTELLIGENCE_API_KEY=<that key> bash openbot/scripts/freeduet-eval-stack.sh up"
    exit 1
  fi
  if [ -n "$person" ] && [ "$key" = "$person" ]; then
    if [ "$shared" != yes ]; then
      red "  openbot/$ENV_NAME has the same Intelligence key as your FreeDuet."
      red "  The evals would read and change your real memories. Use a second project's key:"
      red "    FREEDUET_EVAL_INTELLIGENCE_API_KEY=<key> bash openbot/scripts/freeduet-eval-stack.sh up"
      red "  (FREEDUET_EVAL_SHARE_INTELLIGENCE=yes accepts the risk; reset then leaves memories alone.)"
      exit 1
    fi
    info "  Intelligence: shared with your FreeDuet (FREEDUET_EVAL_SHARE_INTELLIGENCE=yes). Memories are not isolated."
    INTELLIGENCE_SHARED=true
  else
    INTELLIGENCE_SHARED=false
  fi
}

prepare() {
  if [ ! -f "$ENV_FILE" ]; then
    write_settings
  fi
  if [ -n "${FREEDUET_EVAL_INTELLIGENCE_API_KEY:-}" ]; then
    set_line INTELLIGENCE_API_KEY "$FREEDUET_EVAL_INTELLIGENCE_API_KEY"
  fi
  local volume
  volume="$(login_volume)"
  if [ -z "$volume" ] || ! docker volume inspect "$volume" >/dev/null 2>&1; then
    red "  Your FreeDuet's Claude Code sign-in volume (${volume:-unknown}) does not exist yet."
    red "  Start your FreeDuet once (bash scripts/start.sh) and sign in, then run this again."
    exit 1
  fi
  set_line FREEDUET_CLAUDE_LOGIN_VOLUME "$volume"
  check_intelligence
}

# Runs one of the stack scripts for the eval stack, with nothing from this shell but what Docker,
# Bun and a proxy need: .env.eval alone decides, so a port or key exported here for the person's
# FreeDuet cannot leak into it (start.sh reads the environment before the file).
stack() {
  local keep=() name
  for name in PATH HOME USER LOGNAME LANG LC_ALL TERM TMPDIR XDG_RUNTIME_DIR \
    DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG DOCKER_CERT_PATH DOCKER_TLS_VERIFY ENGINE_SOCKET \
    HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy NODE_EXTRA_CA_CERTS SSL_CERT_FILE; do
    [ -z "${!name:-}" ] || keep+=("$name=${!name}")
  done
  env -i "${keep[@]}" OPENBOT_ENV_FILE="$ENV_NAME" COMPOSE_PROJECT_NAME="$PROJECT" \
    COMPOSE_FILE="$COMPOSE_FILES" bash "$REPO_ROOT/scripts/$1.sh" "${@:2}"
}

answers() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" 2>/dev/null || true)" = 200 ]
}

# The eval stack's memories, all of them, through its own server: in its database and in its own
# Intelligence project. Never run when that project is shared with the person's FreeDuet.
wipe_memories() {
  local server="http://localhost:$(setting SERVER_PORT)"
  bun -e '
    const server = process.argv[1];
    let removed = 0;
    for (let pass = 0; pass < 10; pass++) {
      const response = await fetch(`${server}/api/memory`);
      if (response.status === 404) break;
      if (!response.ok) throw new Error(`listing memories answered HTTP ${response.status}`);
      const { memories = [] } = await response.json();
      if (memories.length === 0) break;
      for (const memory of memories) {
        const gone = await fetch(`${server}/api/memory/${encodeURIComponent(memory.id)}`, { method: "DELETE" });
        if (!gone.ok && gone.status !== 404) throw new Error(`removing a memory answered HTTP ${gone.status}`);
        removed++;
      }
    }
    console.log(`  memories removed: ${removed}`);
  ' "$server"
}

up() {
  echo
  echo "FreeDuet eval stack"
  echo "==================="
  prepare
  stack start
  summary
}

down() {
  [ -f "$ENV_FILE" ] || { info "  No openbot/$ENV_NAME: the eval stack was never started."; return 0; }
  stack stop
}

reset() {
  prepare
  down
  local volume login volumes computers
  login="$(setting FREEDUET_CLAUDE_LOGIN_VOLUME)"
  # Only volumes this project or its supervisor made. The sign-in volume belongs to the person's
  # project, so the label filter never lists it; the check below says so out loud anyway.
  volumes="$( { docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT"
    docker volume ls -q --filter "label=openbot.namespace=$PROJECT"; } | sort -u)"
  computers="$(docker ps -aq --filter "label=openbot.namespace=$PROJECT" 2>/dev/null || true)"
  # shellcheck disable=SC2086
  [ -z "$computers" ] || docker rm -f $computers >/dev/null
  for volume in $volumes; do
    if [ "$volume" = "$login" ]; then
      red "  Refusing to remove $volume: it is the Claude Code sign-in."
      exit 1
    fi
    docker volume rm "$volume" >/dev/null
    info "  removed volume $volume"
  done
  rm -f "$ROOT/.logs/eval/server-computer.state"
  up
  if [ "$INTELLIGENCE_SHARED" = true ]; then
    info "  Memories in Intelligence are shared with your FreeDuet and were left alone."
    green "Eval stack reset: no conversations; memories not checked."
    return 0
  fi
  # Its own Intelligence project still holds the last run's memories: the database was not their
  # only home.
  if ! wipe_memories; then
    red "  The eval stack's memories could not be removed, so it is not clean. Log: $ROOT/.logs/eval/server.log"
    exit 1
  fi
  green "Eval stack reset: no conversations, no memories."
}

summary() {
  local app server freeduet
  app="$(setting APP_PORT)"
  server="$(setting SERVER_PORT)"
  freeduet="$(setting FREEDUET_PORT)"
  cat <<EOF

Eval stack (Compose project $PROJECT, settings openbot/$ENV_NAME)
  app             http://localhost:$app
  server          http://localhost:$server
  agent-freeduet  http://localhost:$freeduet
  computer $(setting COMPUTER_PORT) · supervisor $(setting SUPERVISOR_PORT) · langgraph $(setting LANGGRAPH_PORT) · postgres $(setting POSTGRES_PORT)
  Claude Code sign-in: your FreeDuet's (volume $(setting FREEDUET_CLAUDE_LOGIN_VOLUME))

Run the evals against it, from the repository root:
  bun --env-file=openbot/$ENV_NAME evals/team/run.ts --repeat 3
EOF
}

status() {
  if [ ! -f "$ENV_FILE" ]; then
    info "No openbot/$ENV_NAME: the eval stack was never started. Start it: bash openbot/scripts/freeduet-eval-stack.sh up"
    return 0
  fi
  local server app freeduet signed
  server="http://localhost:$(setting SERVER_PORT)"
  app="http://localhost:$(setting APP_PORT)"
  freeduet="http://localhost:$(setting FREEDUET_PORT)"
  mark() { if answers "$1"; then green "up"; else red "down"; fi; }
  printf '  server          %-26s ' "$server"; mark "$server/health"
  printf '  app             %-26s ' "$app"; mark "$app/"
  printf '  agent-freeduet  %-26s ' "$freeduet"; mark "$freeduet/health"
  # Asked of the CLI itself, as start.sh does; only whether somebody is signed in is printed.
  signed="$(stack_compose exec -T agent-freeduet claude auth status --json 2>/dev/null || true)"
  if [[ "$signed" =~ \"loggedIn\"[[:space:]]*:[[:space:]]*true ]]; then
    printf '  Claude Code     signed in (volume %s, shared with your FreeDuet)\n' "$(setting FREEDUET_CLAUDE_LOGIN_VOLUME)"
  else
    printf '  Claude Code     not signed in, or agent-freeduet is down\n'
  fi
  if answers "$server/health"; then
    bun -e '
      const server = process.argv[1];
      let cursor = "", count = 0, mine = 0;
      do {
        const response = await fetch(`${server}/api/channels?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        if (!response.ok) process.exit(0);
        const page = await response.json();
        for (const channel of page.channels ?? []) {
          if (channel.openduetChannel) continue;
          count++;
          if (/^\[eval\]/.test(channel.name ?? "")) mine++;
        }
        cursor = page.nextCursor ?? "";
      } while (cursor);
      console.log(`  conversations   ${count} (${mine} named as evals), not counting the built-in ones`);
    ' "$server" || true
  fi
}

stack_compose() {
  env -u COMPOSE_FILE -u COMPOSE_PROJECT_NAME docker compose --env-file "$ENV_FILE" "$@"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  reset) reset ;;
  status) status ;;
  -h|--help|help) usage ;;
  *)
    usage
    exit 1
    ;;
esac
