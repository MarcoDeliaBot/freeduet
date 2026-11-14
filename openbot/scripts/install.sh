#!/usr/bin/env bash
#
# FreeDuet installer for Ubuntu 22.04 and 24.04 (docs/design/installer.md, stage S).
#
# One command for a machine with nothing installed: it checks what is there, installs only what is
# missing, then runs scripts/start.sh. It is NOT yet "download one file and double-click": you need
# this repository on the machine first (git clone, or GitHub's ZIP), and it is Ubuntu only.
#
#   bash openbot/scripts/install.sh                      explain, ask once, install what is missing, start
#   bash openbot/scripts/install.sh --check              only report what is missing; change nothing
#   bash openbot/scripts/install.sh --yes                the same, without the question (the plan is still printed)
#   bash openbot/scripts/install.sh --ignore-resources   go on although disk or memory is under the minimum
#
# WHAT IT LOOKS FOR, AND WHERE A MISSING ONE COMES FROM
#   git curl openssl lsof unzip   Ubuntu's own archive, with apt. apt checks every package's signature.
#   docker, compose, buildx       Ubuntu's own docker.io, docker-compose-v2 and docker-buildx. Not Docker's
#                                 repository: both releases carry a Compose far above the 2.24.0 that
#                                 docker-compose.yml needs (env_file `required: false`), so nothing outside
#                                 Ubuntu's archive has to be trusted.
#   bun                           The version openbot/package.json pins ("packageManager"), from Bun's
#                                 GitHub release, compared with a SHA-256 written in this file BEFORE
#                                 anything is unpacked or run, then put in /usr/local/bin. Never `curl | sh`.
#                                 Bun also signs its checksum file; this script does not check that
#                                 signature. The checksums here were copied from it once and are reviewed
#                                 with the code, which is what stands in for it.
#   bash                          You are in it.
# Only what is missing is installed. A tool already there, in another version, is left alone and named.
#
# WHAT IT NEVER DOES
#   - Touch the Claude sign-in. That stays your own step, after the start (start.sh says how).
#   - Read or write a credential. It creates openbot/.env from openbot/.env.example when you have no .env
#     (the README's `cp .env.example .env`) and writes no value into it. From an existing .env it reads
#     the port numbers, four switches (BOT_PROVIDER, OPENBOT_ONE_COMPUTER_EACH, FREEDUET_ROUTER,
#     FREEDUET_DICTATION) and COMPOSE_PROJECT_NAME, and nothing else.
#   - Run as root, or use sudo before you have said yes. Everything that needs sudo is listed first.
#   - Send telemetry. Its own network use is apt (Ubuntu's mirrors) and one download from GitHub. The start
#     it hands over to then downloads what a first start always does: npm packages and Docker images.
#
# Safe to rerun: with everything in place it installs nothing and goes straight to start.sh.
#
# Exit status: 0 done (a start hands over with exec, so it is then start.sh's own status), 1 stopped and
# said why, 2 --check found something missing, 3 installed, but you must log out and in once, then rerun.
#
# FREEDUET_INSTALL_ROOT exists for the tests. It moves where this file reads system files
# (/etc/os-release, /proc/...) and where Bun goes. Leave it unset.

# The same refusal start.sh gives, before the bash-only `set` below. See that file.
# shellcheck source=./require-bash.sh
. "$(dirname "$0")/require-bash.sh"
# `holder`: what listens on a port. See that file.
# shellcheck source=./processes.sh
. "$(dirname "$0")/processes.sh"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
OPENBOT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$OPENBOT_DIR")"
START_SH="$REPO_ROOT/scripts/start.sh"
ROOTFS="${FREEDUET_INSTALL_ROOT:-}"

# What docker-compose.yml needs: `env_file: required: false` arrived in Compose 2.24.0.
MIN_COMPOSE="2.24.0"

# THE BUN CHECKSUMS. Copied from SHASUMS256.txt of the Bun release named below, and each one
# recomputed from the downloaded file. The version has to be the one openbot/package.json pins:
# when Bun is bumped there, take the three lines for the new version from the release's
# SHASUMS256.txt and change all four values here (install.test.ts fails until you do).
BUN_TABLE_VERSION="1.4.3"
BUN_SHA256_X64="3e730528d89775f03f87f05c06787c4df4099d0a37f3f252e7b829cb23816e18"
BUN_SHA256_X64_BASELINE="1fc2edac843102909e3a1be1d8d9802cc6071cf074e67e88231f4ffe0f8b397b"
BUN_SHA256_AARCH64="efa9813da5ed72423bf847f916e8d2c47c0d776add972354026a75e10da9aa21"

# What the first start needs. ESTIMATES, not measurements (docs/design/installer.md, "Sizing"): the
# minimum is what it cannot go below, the recommendation is what leaves room to work. The disk is
# counted where Docker keeps its images and where this folder is; one disk holds both.
DISK_MIN_DOCKER_GB=7
DISK_REC_DOCKER_GB=20
DISK_MIN_CHECKOUT_GB=3
DISK_REC_CHECKOUT_GB=5
MEM_MIN_MIB=3500
MEM_REC_MIB=7000

CHECK=false
ASSUME_YES=false
IGNORE_RESOURCES=false

usage() {
  cat <<'EOF'
Usage: bash openbot/scripts/install.sh [--check] [--yes] [--ignore-resources]

Installs what FreeDuet needs on Ubuntu 22.04 or 24.04, then starts it (scripts/start.sh).

  --check             Only report what is missing. Changes nothing and asks nothing.
                      Exit status 0 when FreeDuet can start now, 2 when something is missing.
  --yes, -y           Do not ask before installing. The plan is still printed first.
  --ignore-resources  Go on although free disk space or memory is under the minimum.
  -h, --help          This text.

It never touches your Claude sign-in: that stays your own step, after the start.
Exit status: 0 done, 1 stopped (it says why), 2 --check found something missing,
3 installed, but you must log out and in once and run it again.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --check) CHECK=true ;;
    --yes|-y) ASSUME_YES=true ;;
    --ignore-resources) IGNORE_RESOURCES=true ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n\n' "$arg" >&2; usage >&2; exit 1 ;;
  esac
done

# ------------------------------------------------------------------------------------------------
# Output: plain words, colour only on a terminal. Failures go to stderr.
# ------------------------------------------------------------------------------------------------
if [ -t 1 ] && [ -t 2 ] && [ -z "${NO_COLOR:-}" ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
else
  RED=''; GREEN=''; DIM=''; BOLD=''; OFF=''
fi
say()     { printf '%s\n' "$*"; }
heading() { printf '\n%s%s%s\n' "$BOLD" "$*" "$OFF"; }
note()    { printf '%s%s%s\n' "$DIM" "$*" "$OFF"; }
good()    { printf '%s%s%s\n' "$GREEN" "$*" "$OFF"; }
row() {
  if [ -n "${3:-}" ]; then printf '  %-10s %-8s %s\n' "$1" "$2" "$3"; else printf '  %-10s %s\n' "$1" "$2"; fi
}
# die <status> <what went wrong> [<what to do next> ...]: on stderr, then stop.
die() {
  local status="$1" line
  shift
  printf '%s%s%s\n' "$RED" "$1" "$OFF" >&2
  shift
  for line in "$@"; do printf '%s\n' "$line" >&2; done
  exit "$status"
}

have() { type -P "$1" >/dev/null 2>&1; }

# version_ge <a> <b>: a is b or newer, as dotted numbers.
version_ge() {
  local IFS=. i
  local -a a b
  read -r -a a <<<"$1"
  read -r -a b <<<"$2"
  for i in 0 1 2; do
    if [ "${a[i]:-0}" -gt "${b[i]:-0}" ]; then return 0; fi
    if [ "${a[i]:-0}" -lt "${b[i]:-0}" ]; then return 1; fi
  done
  return 0
}

# ------------------------------------------------------------------------------------------------
# What this machine is. Refuses what it was not tested on.
# ------------------------------------------------------------------------------------------------
os_release_value() {
  awk -F= -v key="$1" '$1 == key { value = $2; gsub(/^"|"$/, "", value); print value; exit }' \
    "$ROOTFS/etc/os-release" 2>/dev/null || true
}

WSL=""
UBUNTU_VERSION=""
ARCH=""

check_platform() {
  local kernel id pretty osrelease
  kernel="$(uname -s)"
  case "$kernel" in
    Linux) ;;
    Darwin)
      die 1 "This installer is for Ubuntu, and this is macOS." \
        "Follow the Quick start in $REPO_ROOT/README.md: it needs Docker, Bash and Bun, set up by hand." \
        "A macOS installer is planned (docs/design/installer.md); there is none yet." ;;
    MINGW*|MSYS*|CYGWIN*)
      die 1 "This installer is for Ubuntu, and this is Windows." \
        "The maintainer runs FreeDuet on Windows as Ubuntu inside WSL 2: open that Ubuntu's terminal and run this script there." \
        "Or follow the Quick start in $REPO_ROOT/README.md." ;;
    *)
      die 1 "This installer is for Ubuntu, and this is $kernel." \
        "Follow the Quick start in $REPO_ROOT/README.md." ;;
  esac

  id="$(os_release_value ID)"
  UBUNTU_VERSION="$(os_release_value VERSION_ID)"
  pretty="$(os_release_value PRETTY_NAME)"
  if [ "$id" != ubuntu ] || { [ "$UBUNTU_VERSION" != 22.04 ] && [ "$UBUNTU_VERSION" != 24.04 ]; }; then
    die 1 "This installer supports Ubuntu 22.04 and 24.04 only. This is ${pretty:-an unknown system}." \
      "A system counts as supported only after a test run on it, and this one has not had one." \
      "To go on by hand: install Docker with the Compose plugin ($MIN_COMPOSE or newer), the Bun version in openbot/package.json," \
      "openssl, curl, lsof and git, then run: bash scripts/start.sh (README.md, Quick start)."
  fi

  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64|aarch64|arm64) ;;
    *) die 1 "This installer supports 64-bit Intel/AMD (x86_64) and ARM (aarch64) only. This computer is $ARCH." \
         "Follow the Quick start in $REPO_ROOT/README.md by hand." ;;
  esac

  osrelease="$(cat "$ROOTFS/proc/sys/kernel/osrelease" 2>/dev/null || true)"
  case "$osrelease" in
    *WSL2*) WSL=2 ;;
    *[Mm]icrosoft*|*WSL*) WSL=1 ;;
  esac
  if [ -z "$WSL" ] && [ -n "${WSL_DISTRO_NAME:-}" ]; then WSL=2; fi
  if [ "$WSL" = 1 ]; then
    die 1 "This is WSL 1, which cannot run Docker." \
      "Convert this Ubuntu to WSL 2 (in PowerShell: wsl --set-version <name of this Ubuntu> 2) and run this again."
  fi
}

check_not_root() {
  if [ "$(id -u)" = 0 ]; then
    die 1 "Do not run this installer as root, or with sudo." \
      "Why: Docker would be set up for root instead of you, and this folder and the .env it creates would belong to root." \
      "It asks for sudo itself, once, only for the steps that need it. Run it again as your own user:" \
      "  bash openbot/scripts/install.sh"
  fi
}

check_layout() {
  if [ ! -f "$START_SH" ] || [ ! -f "$OPENBOT_DIR/package.json" ] || [ ! -f "$OPENBOT_DIR/.env.example" ]; then
    die 1 "This does not look like a FreeDuet checkout: scripts/start.sh, openbot/package.json or openbot/.env.example is missing." \
      "Get the repository first (git clone https://github.com/MarcoDeliaBot/freeduet.git, or the ZIP from GitHub)," \
      "then run: bash openbot/scripts/install.sh from inside it."
  fi
}

BUN_PIN=""
read_bun_pin() {
  BUN_PIN="$(sed -n 's/^[[:space:]]*"packageManager":[[:space:]]*"bun@\([0-9][0-9A-Za-z.+-]*\)".*/\1/p' \
    "$OPENBOT_DIR/package.json" | head -n 1)"
  if [ -z "$BUN_PIN" ]; then
    die 1 "I cannot read the Bun version this repository pins (\"packageManager\" in openbot/package.json)." \
      "Without it I cannot know which Bun to install."
  fi
}

# ------------------------------------------------------------------------------------------------
# What is already here. Nothing in this section changes the machine.
# ------------------------------------------------------------------------------------------------
APT_PACKAGES=()
STEPS=()
BLOCKS=()
NEED_BUN=false
DOCKER_START=false
DOCKER_GROUP=false
RELOGIN=false
USER_NAME=""
BUN_FOUND=""
DOCKER_CLI=false
COMPOSE_OK=false
DAEMON_OK=false
DOCKER_ERR=""
COMPOSE_VERSION=""

add_block() { BLOCKS+=("$1"); }

# The Bun download for this CPU: its file name, and the SHA-256 this script holds for it.
bun_asset() {
  case "$ARCH" in
    aarch64|arm64) echo bun-linux-aarch64 ;;
    *)
      # Bun's standard x64 build needs AVX2; the baseline build runs on any x86-64.
      if grep -qw avx2 "$ROOTFS/proc/cpuinfo" 2>/dev/null; then echo bun-linux-x64; else echo bun-linux-x64-baseline; fi ;;
  esac
}
bun_expected_sha256() {
  case "$1" in
    bun-linux-x64) echo "$BUN_SHA256_X64" ;;
    bun-linux-x64-baseline) echo "$BUN_SHA256_X64_BASELINE" ;;
    bun-linux-aarch64) echo "$BUN_SHA256_AARCH64" ;;
  esac
}

detect_bun() {
  BUN_FOUND=""
  if have bun; then BUN_FOUND="$(bun --version 2>/dev/null | head -n 1 || true)"; fi
}

# A Docker command that cannot hang this script: a daemon that is starting can sit on `docker info`.
docker_run() {
  if have timeout; then timeout 30 docker "$@"; else docker "$@"; fi
}

detect_docker() {
  local status=0
  DOCKER_CLI=false
  COMPOSE_OK=false
  DAEMON_OK=false
  DOCKER_ERR=""
  COMPOSE_VERSION=""
  have docker || return 0
  DOCKER_CLI=true
  COMPOSE_VERSION="$(docker_run compose version --short 2>/dev/null || true)"
  COMPOSE_VERSION="${COMPOSE_VERSION#v}"
  COMPOSE_VERSION="${COMPOSE_VERSION%%[!0-9.]*}"
  if [ -n "$COMPOSE_VERSION" ] && version_ge "$COMPOSE_VERSION" "$MIN_COMPOSE"; then COMPOSE_OK=true; fi
  # stdout to nowhere, stderr kept: what it says is how a stopped daemon is told from a missing group.
  DOCKER_ERR="$(docker_run info 2>&1 >/dev/null)" || status=$?
  if [ "$status" -eq 0 ]; then
    DAEMON_OK=true
    DOCKER_ERR=""
  elif [ "$status" -eq 124 ]; then
    DOCKER_ERR="docker info did not answer within 30 seconds"
  fi
}

in_docker_group_now() { id -nG | tr ' ' '\n' | grep -Fx docker >/dev/null; }
in_docker_group_db() { getent group docker | cut -d: -f4 | tr ',' '\n' | grep -Fx "$USER_NAME" >/dev/null; }
docker_real_path() { readlink -f "$(type -P docker)" 2>/dev/null || true; }

# Docker's state decides which of the steps below are needed, and when no step can fix it.
plan_docker() {
  if ! $DOCKER_CLI; then
    APT_PACKAGES+=(docker.io docker-compose-v2 docker-buildx)
    DOCKER_START=true
    DOCKER_GROUP=true
    return 0
  fi
  if ! $COMPOSE_OK; then
    if dpkg -s docker.io >/dev/null 2>&1; then
      APT_PACKAGES+=(docker-compose-v2 docker-buildx)
    else
      add_block "Docker is here, but its Compose plugin is missing or older than $MIN_COMPOSE (found: ${COMPOSE_VERSION:-none}), and this Docker did not come from Ubuntu's docker.io package, so I will not change it. Add Compose the way you installed Docker (for Docker's own packages: sudo apt-get install docker-compose-plugin), then run this again."
      return 0
    fi
  fi
  if $DAEMON_OK; then return 0; fi
  # Docker Desktop's docker command, seen from WSL: nothing here to install or start.
  case "$(docker_real_path)" in
    */docker-desktop/*|/mnt/wsl/*)
      add_block "The docker command here is Docker Desktop's, and it is not answering. Start Docker Desktop on Windows, turn on WSL integration for this Ubuntu in its settings, then run this again."
      return 0 ;;
  esac
  # A docker pointed somewhere else (DOCKER_HOST, or a context) is not this machine's service to start.
  if [ -n "${DOCKER_HOST:-}" ]; then
    add_block "DOCKER_HOST is set in your environment, so docker talks to a Docker that is not this computer's own service, and it is not answering. I do not change that. Unset it (or start what it points to), then run this again."
    return 0
  fi
  # The wording of "the daemon is not there" changed between Docker releases ("Cannot connect to the Docker
  # daemon at unix:///var/run/docker.sock. Is the docker daemon running?", then "failed to connect to the docker
  # API at unix:///var/run/docker.sock; ..."), so what is matched is the part both keep: the local default
  # socket. "permission denied" comes first, because the newer sentence carries it too. An answer this does not
  # recognise, or about another socket (rootless Docker, a remote one), is reported as it is rather than guessed at.
  case "$DOCKER_ERR" in
    *"permission denied"*) ;;
    *"/run/docker.sock"*) DOCKER_START=true ;;
    *)
      add_block "Docker is installed but 'docker info' fails: $(printf '%s' "$DOCKER_ERR" | head -n 1). I do not know how to fix that. Fix it, then run this again."
      return 0 ;;
  esac
  # The daemon is, or is about to be, up. Can this account talk to it?
  if ! in_docker_group_db; then
    DOCKER_GROUP=true
  elif ! in_docker_group_now; then
    RELOGIN=true
  elif ! $DOCKER_START; then
    add_block "Docker answers \"permission denied\" although you are in the docker group, and a new login would not change that. Its message: $(printf '%s' "$DOCKER_ERR" | head -n 1). Check the permissions of /var/run/docker.sock, then run this again."
  fi
}

print_findings() {
  heading "This computer: Ubuntu $UBUNTU_VERSION, $ARCH${WSL:+, inside WSL 2}"
  row bash ok "$BASH_VERSION"
  local pair cmd package
  for pair in git:git curl:curl openssl:openssl lsof:lsof; do
    cmd="${pair%%:*}"
    package="${pair##*:}"
    if have "$cmd"; then
      row "$cmd" ok
    else
      row "$cmd" MISSING "Ubuntu package: $package"
    fi
  done
  if $NEED_BUN && ! have unzip; then
    row unzip MISSING "Ubuntu package: unzip (to unpack Bun, once)"
  fi
  if [ -z "$BUN_FOUND" ]; then
    row bun MISSING "this repository pins $BUN_PIN"
  elif [ "$BUN_FOUND" = "$BUN_PIN" ]; then
    row bun ok "$BUN_FOUND"
  else
    row bun ok "$BUN_FOUND, not the $BUN_PIN this repository pins. I leave it alone; if the start fails on it, install $BUN_PIN."
  fi
  if ! $DOCKER_CLI; then
    row docker MISSING "Ubuntu packages: docker.io, docker-compose-v2, docker-buildx"
  elif ! $COMPOSE_OK; then
    row docker MISSING "the Compose plugin ($MIN_COMPOSE or newer; found: ${COMPOSE_VERSION:-none})"
  elif $DAEMON_OK; then
    row docker ok "Compose $COMPOSE_VERSION, the daemon answers"
  else
    local why=""
    if $DOCKER_START; then why="installed, but the Docker service is not running"; fi
    if $DOCKER_GROUP; then why="${why:+$why; }your account is not in the docker group"; fi
    if $DOCKER_START || $DOCKER_GROUP; then
      row docker MISSING "$why"
    elif $RELOGIN; then
      row docker "LOG IN" "you are in the docker group, but this terminal does not know yet"
    else
      row docker PROBLEM "see below"
    fi
  fi
  case "$(docker_real_path)" in
    /snap/*|*/snap/*) note "             This Docker comes from snap. FreeDuet is tested with Ubuntu's docker.io; if the start fails on files it cannot reach, that is the first suspect." ;;
  esac
}

# ------------------------------------------------------------------------------------------------
# Disk, memory, ports.
# ------------------------------------------------------------------------------------------------
RESOURCE_STOP=false

nearest_existing() {
  local path="$1"
  while [ ! -e "$path" ] && [ "$path" != / ]; do path="$(dirname "$path")"; done
  printf '%s' "$path"
}
free_gb() { df -Pk -- "$1" 2>/dev/null | awk 'NR == 2 { printf "%d", $4 / 1048576 }'; }
disk_id() { df -Pk -- "$1" 2>/dev/null | awk 'NR == 2 { print $1 }'; }

# disk_row <where> <free GB> <minimum GB> <recommended GB>
disk_row() {
  local where="$1" free="$2" min="$3" rec="$4"
  if [ -z "$free" ]; then
    row disk "?" "could not read the free space on $where"
  elif [ "$free" -lt "$min" ]; then
    if $IGNORE_RESOURCES; then
      row disk LOW "$free GB free on $where; at least $min GB are needed. Going on because of --ignore-resources."
    else
      row disk STOP "$free GB free on $where; at least $min GB are needed ($rec GB recommended)."
      RESOURCE_STOP=true
    fi
  elif [ "$free" -lt "$rec" ]; then
    row disk LOW "$free GB free on $where; it will fit, but $rec GB are recommended."
  else
    row disk ok "$free GB free on $where"
  fi
}

check_resources() {
  local docker_dir docker_path checkout_free docker_free mem
  docker_dir="$ROOTFS/var/lib/docker"
  if $DAEMON_OK; then
    docker_dir="$(docker_run info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
    docker_dir="${docker_dir:-$ROOTFS/var/lib/docker}"
  fi
  docker_path="$(nearest_existing "$docker_dir")"
  docker_free="$(free_gb "$docker_path")"
  checkout_free="$(free_gb "$REPO_ROOT")"
  if [ -n "$docker_free" ] && [ "$(disk_id "$docker_path")" = "$(disk_id "$REPO_ROOT")" ]; then
    disk_row "the disk with Docker's data and this folder" "$docker_free" \
      $((DISK_MIN_DOCKER_GB + DISK_MIN_CHECKOUT_GB)) $((DISK_REC_DOCKER_GB + DISK_REC_CHECKOUT_GB))
  else
    disk_row "the disk with Docker's data ($docker_dir)" "$docker_free" "$DISK_MIN_DOCKER_GB" "$DISK_REC_DOCKER_GB"
    disk_row "the disk with this folder" "$checkout_free" "$DISK_MIN_CHECKOUT_GB" "$DISK_REC_CHECKOUT_GB"
  fi
  mem="$(awk '/^MemTotal:/ { printf "%d", $2 / 1024 }' "$ROOTFS/proc/meminfo" 2>/dev/null || true)"
  if [ -z "$mem" ]; then
    row memory "?" "could not read the memory size"
  elif [ "$mem" -lt "$MEM_MIN_MIB" ]; then
    if $IGNORE_RESOURCES; then
      row memory LOW "$mem MiB; at least $MEM_MIN_MIB MiB are needed. Going on because of --ignore-resources."
    else
      row memory STOP "$mem MiB; at least $MEM_MIN_MIB MiB are needed ($MEM_REC_MIB MiB recommended). The image builds would be killed."
      RESOURCE_STOP=true
    fi
  elif [ "$mem" -lt "$MEM_REC_MIB" ]; then
    row memory LOW "$mem MiB; it will start, but $MEM_REC_MIB MiB are recommended: builds are slow and several members at once may not fit."
  else
    row memory ok "$mem MiB"
  fi
}

# The settings file start.sh will read: the person's .env, or the example it is about to be copied from.
settings_file() {
  local file
  for file in "$OPENBOT_DIR/.env" "$REPO_ROOT/.env"; do
    if [ -f "$file" ]; then printf '%s' "$file"; return 0; fi
  done
  printf '%s' "$OPENBOT_DIR/.env.example"
}

# A setting the way start.sh reads it: the environment, then the file, then the default.
setting_of() {
  local name="$1" fallback="$2" value="${!1:-}"
  if [ -z "$value" ]; then
    value="$(grep -E "^$name=" "$(settings_file)" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true)"
  fi
  printf '%s' "${value:-$fallback}"
}

# The ports Docker publishes for FreeDuet's containers, with the ones start.sh leaves out in some settings left
# out here. start.sh does not look at these before it runs Compose, and Compose then stops in the middle of the
# first start with "port is already allocated". APP_PORT and SERVER_PORT are not here: start.sh checks those two
# itself, and can tell FreeDuet's own server and app from a stranger by asking them (require_free_or_ours).
port_list() {
  printf '%s\n' \
    "COMPUTER_PORT 4100 the Bot computer" \
    "LANGGRAPH_PORT 4201 the framework Bot" \
    "POSTGRES_PORT 5432 the database"
  if [ "$(setting_of BOT_PROVIDER openai | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')" != anthropic ]; then
    printf '%s\n' "BOT_PORT 4200 the built-in Bot"
  fi
  if [ "$(setting_of OPENBOT_ONE_COMPUTER_EACH true)" = true ]; then
    printf '%s\n' "SUPERVISOR_PORT 4500 the supervisor"
  fi
  if [ "$(setting_of FREEDUET_ROUTER on)" != off ]; then
    printf '%s\n' "FREEDUET_PORT 4230 the subscription router"
  fi
  if [ "$(setting_of FREEDUET_DICTATION "")" = local ]; then
    printf '%s\n' "WHISPER_PORT 4240 local dictation"
  fi
}

# Host ports that this FreeDuet's own containers publish, one per line.
own_published_ports() {
  $DAEMON_OK || return 0
  docker_run ps --filter "label=com.docker.compose.project=$(setting_of COMPOSE_PROJECT_NAME freeduet)" \
    --format '{{.Ports}}' 2>/dev/null | grep -oE ':[0-9]+->' | tr -dc '0-9\n' || true
}

PORT_PROBLEMS=()
# check_ports [quiet]: fills PORT_PROBLEMS. Quiet prints only the problems.
check_ports() {
  PORT_PROBLEMS=()
  if ! have lsof; then
    if [ "${1:-}" != quiet ]; then row ports "?" "not checked: lsof is missing"; fi
    return 0
  fi
  local own name fallback label port who problem
  own="$(own_published_ports)"
  while read -r name fallback label; do
    port="$(setting_of "$name" "$fallback")"
    case "$port" in
      ''|*[!0-9]*) PORT_PROBLEMS+=("$name in your .env is not a port number."); continue ;;
    esac
    who="$(holder "$port")"
    [ -n "$who" ] || continue
    # Docker publishes it for this FreeDuet's own container: already running, not a clash.
    if printf '%s\n' "$own" | grep -Fx "$port" >/dev/null; then continue; fi
    PORT_PROBLEMS+=("port $port ($label, $name) is in use by $who")
  done < <(port_list)
  if [ "${#PORT_PROBLEMS[@]}" -gt 0 ]; then
    for problem in "${PORT_PROBLEMS[@]}"; do row ports STOP "$problem"; done
  elif [ "${1:-}" != quiet ]; then
    row ports ok "none of the ports FreeDuet uses is taken by something else"
  fi
}

die_ports() {
  die 1 "A port FreeDuet needs cannot be used (named above), so I stopped before starting." \
    "If something else holds it: stop that program, or give FreeDuet another port by putting the setting named above in openbot/.env (for example COMPUTER_PORT=4101)." \
    "For POSTGRES_PORT, change the port inside DATABASE_URL to match. If a setting is not a port number: correct it in openbot/.env. Then run this again."
}

# ------------------------------------------------------------------------------------------------
# The plan, and the one question.
# ------------------------------------------------------------------------------------------------
BUN_ASSET=""
BUN_URL=""

plan_steps() {
  if [ "${#APT_PACKAGES[@]}" -gt 0 ]; then STEPS+=(packages); fi
  if $NEED_BUN; then STEPS+=(bun); fi
  if $DOCKER_START; then STEPS+=(docker-start); fi
  if $DOCKER_GROUP; then STEPS+=(docker-group); fi
}

systemd_is_running() { [ -d "$ROOTFS/run/systemd/system" ]; }
docker_start_command() {
  if systemd_is_running; then printf 'systemctl enable --now docker'; else printf 'service docker start'; fi
}

# Why a package is wanted, in words that fit after "package: ".
package_reason() {
  case "$1" in
    git) echo "git: to update FreeDuet later" ;;
    curl) echo "curl: to download" ;;
    openssl) echo "openssl: start.sh makes the random secrets it needs with it" ;;
    lsof) echo "lsof: start.sh uses it to see which program holds a port" ;;
    unzip) echo "unzip: to unpack Bun, once" ;;
    docker.io) echo "docker.io: Docker itself, which runs the services and each member's own computer" ;;
    docker-compose-v2) echo "docker-compose-v2: the \"docker compose\" command start.sh uses" ;;
    docker-buildx) echo "docker-buildx: Docker's image builder, which the first start uses to build the services" ;;
    *) echo "$1" ;;
  esac
}

# The first line names the step; the lines after it explain.
describe_step() {
  case "$1" in
    packages)
      say "Install from Ubuntu's own archive: ${APT_PACKAGES[*]}"
      for package in "${APT_PACKAGES[@]}"; do say "  - $(package_reason "$package")"; done
      say "  apt checks every package's signature with Ubuntu's keys."
      say "  \$ sudo apt-get update"
      say "  \$ sudo apt-get install -y ${APT_PACKAGES[*]}" ;;
    bun)
      say "Install Bun $BUN_PIN, the version this repository pins."
      say "  Why: FreeDuet's server, worker and app run on Bun."
      say "  I download $BUN_URL and compare its SHA-256 with the one written in this script"
      say "  ($(bun_expected_sha256 "$BUN_ASSET")) before anything is unpacked or run. Only then:"
      say "  \$ sudo install -m 0755 <the unpacked bun> $ROOTFS/usr/local/bin/bun" ;;
    docker-start)
      say "Start Docker, and make it start at every boot."
      say "  \$ sudo $(docker_start_command)"
      if ! systemd_is_running; then
        say "  (This Ubuntu does not run systemd, so Docker will not start by itself next time; see the WSL note.)"
      fi ;;
    docker-group)
      say "Add you ($USER_NAME) to the \"docker\" group."
      say "  Why: it lets you use Docker without sudo. Anybody in that group can control this whole computer"
      say "  through Docker, as with every Docker install."
      say "  \$ sudo usermod -aG docker $USER_NAME"
      say "  Afterwards you must log out and in once: a terminal learns about a new group only at login." ;;
  esac
}

print_plan() {
  local n=0 step text
  heading "What I will do (sudo asks for your password itself; I never see it)"
  for step in "${STEPS[@]}"; do
    n=$((n + 1))
    text="$(describe_step "$step")"
    say "$n. $(printf '%s\n' "$text" | head -n 1)"
    printf '%s\n' "$text" | tail -n +2
  done
  say ""
  say "Then, with no sudo: create openbot/.env from openbot/.env.example if you have no .env, check the ports,"
  say "and run scripts/start.sh, which downloads npm packages and Docker images and builds the services (several"
  say "minutes the first time). The Claude sign-in stays your own step; I never touch it."
}

ask_once() {
  local reply=""
  if $ASSUME_YES; then
    say ""
    say "--yes given: going ahead without asking."
    return 0
  fi
  printf '\nGo ahead and install these? [y/N] '
  IFS= read -r reply || reply=""
  case "$reply" in
    y|Y|yes|YES|Yes) return 0 ;;
  esac
  printf '\n'
  die 1 "Nothing was changed." \
    "Run this again and answer y when you agree, or add --yes. Or install the tools yourself (README.md, Quick start)."
}

# ------------------------------------------------------------------------------------------------
# The steps.
# ------------------------------------------------------------------------------------------------
WORKDIR=""
BUN_CANDIDATE=""
cleanup() { if [ -n "$WORKDIR" ]; then rm -rf "$WORKDIR"; fi; }
trap cleanup EXIT

# A hint printed when the next sudo command fails, for the failures people actually meet.
SUDO_HINT=""
run_sudo() {
  say "  \$ sudo $*"
  if ! sudo "$@"; then
    die 1 "That command failed: sudo $*" \
      "Read what it printed just above. ${SUDO_HINT}" \
      "If sudo itself refused or could not ask for a password, this account may not be allowed to use it, or this is not a terminal:" \
      "ask whoever administers this computer to run the commands listed in the plan, then run this again." \
      "Everything already done stays done; running this again picks up where it stopped."
  fi
  SUDO_HINT=""
}

# Downloads Bun, checks it, and leaves it unpacked. No sudo, no change to the machine.
fetch_bun() {
  local expected actual candidate version
  expected="$(bun_expected_sha256 "$BUN_ASSET")"
  WORKDIR="$(mktemp -d)"
  say "  Downloading $BUN_URL"
  if ! curl --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 30 -fSL --retry 3 \
       --output "$WORKDIR/bun.zip" "$BUN_URL"; then
    die 1 "Could not download Bun from $BUN_URL." \
      "Check the internet connection and try again. If curl said it could not verify a certificate: sudo apt-get install ca-certificates." \
      "Nothing was installed from this download."
  fi
  actual="$(sha256sum "$WORKDIR/bun.zip" | cut -d' ' -f1)"
  if [ "$actual" != "$expected" ]; then
    die 1 "The Bun download does not match the checksum written in this script, so I did not unpack or install it." \
      "  expected $expected" \
      "  got      $actual" \
      "A corrupt download, or a file that is not the release this script was written for. Try again; if it repeats, do not install it and tell the FreeDuet maintainers."
  fi
  say "  The SHA-256 matches the one written in this script."
  mkdir "$WORKDIR/unpacked"
  if ! unzip -q -o "$WORKDIR/bun.zip" -d "$WORKDIR/unpacked"; then
    die 1 "I could not unpack the Bun download, although its checksum was right." "Nothing was installed from it. Try again."
  fi
  candidate="$WORKDIR/unpacked/$BUN_ASSET/bun"
  if [ ! -f "$candidate" ]; then
    die 1 "The Bun download did not contain $BUN_ASSET/bun, so I stopped." "Nothing was installed from it."
  fi
  chmod 0755 "$candidate"
  version="$("$candidate" --version 2>/dev/null | head -n 1 || true)"
  if [ "$version" != "$BUN_PIN" ]; then
    die 1 "The downloaded Bun says it is version \"${version:-nothing}\", not $BUN_PIN, so I did not install it." \
      "It did not run here: a temporary folder that cannot run programs, or a CPU it was not built for." \
      "Install Bun $BUN_PIN yourself (https://bun.sh/docs/installation) and run this again."
  fi
  BUN_CANDIDATE="$candidate"
}

run_step() {
  case "$1" in
    packages)
      say "  \$ sudo apt-get update"
      if ! sudo apt-get -o DPkg::Lock::Timeout=300 update; then
        note "  apt-get update reported a problem (often a third-party source that has gone stale). Trying the install anyway."
      fi
      SUDO_HINT="If apt says it cannot locate a package, turn on Ubuntu's universe repository (sudo add-apt-repository universe), run sudo apt-get update, then run this again."
      run_sudo env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y "${APT_PACKAGES[@]}"
      hash -r ;;
    bun)
      # Needs curl and unzip, which the step before may just have installed.
      if ! have curl || ! have unzip; then
        die 1 "curl or unzip is still missing, so I cannot fetch Bun." "Install them (sudo apt-get install curl unzip) and run this again."
      fi
      fetch_bun
      run_sudo install -m 0755 "$BUN_CANDIDATE" "$ROOTFS/usr/local/bin/bun"
      hash -r ;;
    docker-start)
      # shellcheck disable=SC2046  # the command is two or three words on purpose
      run_sudo $(docker_start_command) ;;
    docker-group)
      run_sudo usermod -aG docker "$USER_NAME"
      RELOGIN=true ;;
  esac
}

# Docker can take a few seconds to answer after it starts (without systemd, `service` does not wait).
wait_for_docker() {
  local tries=0
  while [ "$tries" -lt 20 ]; do
    detect_docker
    if $DAEMON_OK; then return 0; fi
    # An answer of "permission denied" is an answer: the daemon is up.
    case "$DOCKER_ERR" in *"permission denied"*) return 0 ;; esac
    tries=$((tries + 1))
    sleep 1
  done
}

relogin_message() {
  say ""
  good "Everything is installed. One step is left, and only you can do it."
  say "Docker can be used without sudo once your account is in the \"docker\" group, and a terminal"
  say "learns about a new group only when you log in again."
  if [ -n "$WSL" ]; then
    say "  1. Close every Ubuntu window. In PowerShell run: wsl --terminate ${WSL_DISTRO_NAME:-<name of this Ubuntu>}   Then open Ubuntu again."
  else
    say "  1. Log out of Ubuntu and log in again. (Or, in this one terminal only: newgrp docker)"
  fi
  say "  2. Run the same command again: bash openbot/scripts/install.sh"
  say "     It will find everything in place and start FreeDuet."
}

# ------------------------------------------------------------------------------------------------
# Hand over to start.sh.
# ------------------------------------------------------------------------------------------------
ensure_env_file() {
  if [ -f "$OPENBOT_DIR/.env" ] || [ -f "$REPO_ROOT/.env" ]; then return 0; fi
  # From openbot/, not from the .env.example in the repository root: that one is a link, and GitHub's ZIP
  # turns a link into a text file holding its target. start.sh links the root .env to this file itself.
  ( umask 077; cp "$OPENBOT_DIR/.env.example" "$OPENBOT_DIR/.env" )
  note "Created openbot/.env from openbot/.env.example. start.sh adds the secrets it generates to it."
}

# ------------------------------------------------------------------------------------------------
# Main.
# ------------------------------------------------------------------------------------------------
check_platform
check_not_root
check_layout
read_bun_pin
USER_NAME="$(id -un)"
export PATH="$ROOTFS/usr/local/bin:$PATH"

for pair in git:git curl:curl openssl:openssl lsof:lsof; do
  if ! have "${pair%%:*}"; then APT_PACKAGES+=("${pair##*:}"); fi
done
detect_bun
if [ -z "$BUN_FOUND" ]; then NEED_BUN=true; fi
if $NEED_BUN && ! have unzip; then APT_PACKAGES+=(unzip); fi
detect_docker
plan_docker

if $NEED_BUN; then
  BUN_ASSET="$(bun_asset)"
  BUN_URL="https://github.com/oven-sh/bun/releases/download/bun-v${BUN_PIN}/${BUN_ASSET}.zip"
  if [ "$BUN_PIN" != "$BUN_TABLE_VERSION" ]; then
    add_block "This script only knows the checksums of Bun $BUN_TABLE_VERSION, and this repository now pins $BUN_PIN, so I will not download it. Install Bun $BUN_PIN yourself (https://bun.sh/docs/installation), run this again, and tell the FreeDuet maintainers that install.sh is out of date."
  fi
fi

print_findings
if [ -n "$WSL" ]; then
  note ""
  note "You are in WSL 2. Three things differ from a normal Ubuntu: Docker does not start by itself unless systemd is on"
  note "(in /etc/wsl.conf: [boot] systemd=true); keep this folder in your Linux home (~), not under /mnt/c, which is slow;"
  note "and with Docker Desktop's WSL integration its Docker answers here and I install no other."
  case "$REPO_ROOT" in /mnt/*) note "This folder is under /mnt: move it to your Linux home before you start FreeDuet." ;; esac
fi
check_resources
check_ports
if [ "${#BLOCKS[@]}" -gt 0 ]; then
  say ""
  for block in "${BLOCKS[@]}"; do printf '%s%s%s\n' "$RED" "$block" "$OFF" >&2; done
fi

if $CHECK; then
  say ""
  if [ "${#APT_PACKAGES[@]}" -eq 0 ] && ! $NEED_BUN && ! $DOCKER_START && ! $DOCKER_GROUP && ! $RELOGIN \
     && [ "${#BLOCKS[@]}" -eq 0 ] && ! $RESOURCE_STOP && [ "${#PORT_PROBLEMS[@]}" -eq 0 ]; then
    good "Ready: FreeDuet can start now. Run this without --check to start it."
    exit 0
  fi
  say "Not ready yet. This was only a check: nothing was changed. Run this without --check to fix what can be fixed."
  exit 2
fi

if [ "${#BLOCKS[@]}" -gt 0 ]; then
  die 1 "I stopped before changing anything: something needs your attention first (the paragraph above)."
fi
if $RESOURCE_STOP; then
  die 1 "This computer is under the minimum for FreeDuet's first start, so I stopped before changing anything." \
    "Free some disk space or add memory. The numbers are estimates (docs/design/installer.md); to go on anyway: add --ignore-resources."
fi
if [ "${#PORT_PROBLEMS[@]}" -gt 0 ]; then die_ports; fi

plan_steps
if [ "${#STEPS[@]}" -gt 0 ]; then
  if ! have sudo; then
    die 1 "sudo is not installed, and these steps need it." \
      "Ask whoever administers this computer to run the commands listed in the plan, or to give you sudo, then run this again."
  fi
  print_plan
  ask_once
  n=0
  for step in "${STEPS[@]}"; do
    n=$((n + 1))
    heading "Step $n of ${#STEPS[@]}: $(describe_step "$step" | head -n 1)"
    run_step "$step"
  done
  # What the steps were meant to leave behind.
  detect_bun
  wait_for_docker
  if [ -z "$BUN_FOUND" ] || ! have git || ! have curl || ! have openssl || ! have lsof || ! $DOCKER_CLI || ! $COMPOSE_OK; then
    die 1 "The steps finished, but something is still missing (bun: ${BUN_FOUND:-none}, docker: $($DOCKER_CLI && echo present || echo missing), compose: ${COMPOSE_VERSION:-none})." \
      "Run this with --check to see what, and read the output above."
  fi
  if $DAEMON_OK; then
    RELOGIN=false
  elif ! $RELOGIN; then
    case "$DOCKER_ERR" in
      *"permission denied"*) RELOGIN=true ;;
      *) die 1 "Docker is installed but still does not answer: $(printf '%s' "$DOCKER_ERR" | head -n 1)" \
           "Check it with: sudo systemctl status docker   then run this again." ;;
    esac
  fi
fi
if $RELOGIN; then
  relogin_message
  exit 3
fi

ensure_env_file
check_ports quiet
if [ "${#PORT_PROBLEMS[@]}" -gt 0 ]; then die_ports; fi

heading "Starting FreeDuet"
say "Running: bash scripts/start.sh"
note "The first start downloads npm packages and Docker images and builds the services: several minutes."
note "When it finishes it says how to sign in to Claude. That step is yours; this installer never touches it."
cleanup
trap - EXIT
unset FREEDUET_INSTALL_ROOT
cd "$REPO_ROOT"
exec bash scripts/start.sh
