#!/usr/bin/env bash
#
# Run FreeDuet as a system service (docs/design/installer.md, section 12).
#
# Without it, the stack lives in the terminal that started it: close the terminal, or let WSL stop its
# Ubuntu, and the host processes are gone. With it, systemd starts the stack after Docker at every boot
# of this Ubuntu, and stops it cleanly at shutdown.
#
#   bash openbot/scripts/install-service.sh --print    print the unit file; change nothing, ask nothing, no sudo
#   bash openbot/scripts/install-service.sh            write /etc/systemd/system/freeduet.service and enable it
#   bash openbot/scripts/install-service.sh --remove   disable it and delete the file
#   bash openbot/scripts/install-service.sh --yes      do not ask before the sudo commands
#
# What the unit does (the same text --print shows):
#   - Type=oneshot with RemainAfterExit: systemd shows it as active after the start script returns;
#     the Bun processes that scripts/start.sh leaves running stay in its control group.
#   - It runs as YOU (User=), never as root, so FreeDuet gets no extra rights and every file it writes
#     stays yours.
#   - It waits for Docker to answer (up to 5 minutes), then runs scripts/stop.sh --keep-computers to clear
#     what a crash left behind (the Bot computers stay, so their browsers stay signed in), then
#     scripts/start.sh. ExecStop runs scripts/stop.sh.
#   - Enabling it does not start it now: if FreeDuet runs already, nothing is restarted. It starts at the
#     next boot of this Ubuntu, or when you run: sudo systemctl start freeduet
#
# What it never does: read or write a credential, touch the Claude sign-in, run as root, change any file
# except /etc/systemd/system/freeduet.service, or run any command before you have said yes (--print apart,
# which runs none). It needs systemd (on WSL 2: [boot] systemd=true in /etc/wsl.conf) and sudo.
#
# Safe to rerun: when the file on disk is already the one it would write and the unit is enabled, it does
# nothing. Exit status: 0 done (or nothing to do), 1 stopped and said why.
#
# FREEDUET_INSTALL_ROOT exists for the tests, as in install.sh. Leave it unset.

# shellcheck source=./require-bash.sh
. "$(dirname "$0")/require-bash.sh"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
OPENBOT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$OPENBOT_DIR")"
ROOTFS="${FREEDUET_INSTALL_ROOT:-}"
UNIT_NAME="freeduet.service"
UNIT_PATH="$ROOTFS/etc/systemd/system/$UNIT_NAME"

MODE=install
ASSUME_YES=false

usage() {
  cat <<'USAGE'
Usage: bash openbot/scripts/install-service.sh [--print | --remove] [--yes]

Makes FreeDuet start by itself after Docker, at every boot of this Ubuntu (a systemd service that runs as you).

  --print    Print the service file and stop. Changes nothing, asks nothing, needs no sudo.
  --remove   Disable the service and delete its file.
  --yes, -y  Do not ask before the sudo commands. They are printed first.
  -h, --help This text.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --print) MODE=print ;;
    --remove) MODE=remove ;;
    --yes|-y) ASSUME_YES=true ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n\n' "$arg" >&2; usage >&2; exit 1 ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() {
  local status="$1" line
  shift
  printf '%s\n' "$1" >&2
  shift
  for line in "$@"; do printf '%s\n' "$line" >&2; done
  exit "$status"
}

USER_NAME="$(id -un)"
if [ "$(id -u)" = 0 ]; then
  die 1 "Run this as your own user, not as root: the service must run as you." \
    "It asks for sudo itself, for the two commands that need it."
fi

# The unit is one text file. A path that systemd would read differently (spaces split a command, % and $
# are expanded) is refused, because a wrong path here would make the service run something else.
case "$REPO_ROOT$USER_NAME" in
  *[!A-Za-z0-9._/+@-]*)
    die 1 "This folder or user name has a character that a service file cannot carry safely: $REPO_ROOT ($USER_NAME)." \
      "Use a folder whose path has only letters, digits and . _ / + @ - (for example ~/freeduet), then run this again." ;;
esac
if [ -n "${HOME:-}" ]; then
  case "$HOME" in
    *[!A-Za-z0-9._/+@-]*) die 1 "Your home folder has a character that a service file cannot carry safely: $HOME." ;;
  esac
fi

unit_text() {
  cat <<UNIT
# Written by openbot/scripts/install-service.sh. Remove with: bash openbot/scripts/install-service.sh --remove
[Unit]
Description=FreeDuet (the stack in $REPO_ROOT)
Wants=network-online.target
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=$USER_NAME
WorkingDirectory=$REPO_ROOT
Environment=PATH=${HOME:-/home/$USER_NAME}/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
TimeoutStartSec=1800
TimeoutStopSec=300
ExecStartPre=/usr/bin/timeout 300 /bin/bash -c 'until docker info >/dev/null 2>&1; do sleep 2; done'
ExecStartPre=/bin/bash $REPO_ROOT/scripts/stop.sh --keep-computers
ExecStart=/bin/bash $REPO_ROOT/scripts/start.sh
ExecStop=/bin/bash $REPO_ROOT/scripts/stop.sh

[Install]
WantedBy=multi-user.target
UNIT
}

if [ "$MODE" = print ]; then
  unit_text
  exit 0
fi

systemd_is_running() { [ -d "$ROOTFS/run/systemd/system" ]; }
if ! systemd_is_running; then
  die 1 "This Ubuntu does not run systemd, so a service cannot be installed. Nothing was changed." \
    "On WSL 2: put [boot] systemd=true in /etc/wsl.conf, run wsl --shutdown in Windows, open Ubuntu again, then run this again."
fi
if ! type -P sudo >/dev/null 2>&1; then
  die 1 "sudo is not installed, and writing a service file needs it." \
    "Ask whoever administers this computer to run the commands --print and the plan show."
fi

TMP_UNIT=""
cleanup() { if [ -n "$TMP_UNIT" ]; then rm -f "$TMP_UNIT"; fi; }
trap cleanup EXIT

run_sudo() {
  say "  \$ sudo $*"
  if ! sudo "$@"; then
    die 1 "That command failed: sudo $*" "Everything already done stays done; run this again to pick up where it stopped."
  fi
}

ask_once() {
  local reply=""
  if $ASSUME_YES; then say "--yes given: going ahead without asking."; return 0; fi
  printf '\nGo ahead? [y/N] '
  IFS= read -r reply || reply=""
  case "$reply" in y|Y|yes|YES|Yes) return 0 ;; esac
  printf '\n'
  die 1 "Nothing was changed." "Run this again and answer y when you agree, or add --yes."
}

if [ "$MODE" = remove ]; then
  if [ ! -e "$UNIT_PATH" ]; then
    say "FreeDuet is not installed as a service ($UNIT_PATH does not exist). Nothing to do."
    exit 0
  fi
  say "I will disable the service and delete $UNIT_PATH. A FreeDuet that is running now keeps running."
  say "  \$ sudo systemctl disable $UNIT_NAME"
  say "  \$ sudo rm -f $UNIT_PATH"
  say "  \$ sudo systemctl daemon-reload"
  ask_once
  run_sudo systemctl disable "$UNIT_NAME"
  run_sudo rm -f "$UNIT_PATH"
  run_sudo systemctl daemon-reload
  say "Removed."
  exit 0
fi

TMP_UNIT="$(mktemp)"
unit_text >"$TMP_UNIT"

ENABLED=false
if systemctl is-enabled "$UNIT_NAME" >/dev/null 2>&1; then ENABLED=true; fi
if [ -f "$UNIT_PATH" ] && cmp -s "$TMP_UNIT" "$UNIT_PATH" && $ENABLED; then
  say "FreeDuet already starts as a service ($UNIT_PATH is current and enabled). Nothing to do."
  exit 0
fi

say "I will make FreeDuet start by itself after Docker, at every boot of this Ubuntu, running as $USER_NAME:"
say "  \$ sudo install -m 0644 <the service text, see --print> $UNIT_PATH"
say "  \$ sudo systemctl daemon-reload"
say "  \$ sudo systemctl enable $UNIT_NAME"
say "It does not start FreeDuet now. Start it yourself with: sudo systemctl start freeduet"
ask_once
run_sudo install -m 0644 "$TMP_UNIT" "$UNIT_PATH"
run_sudo systemctl daemon-reload
run_sudo systemctl enable "$UNIT_NAME"
say "Done. FreeDuet will start after Docker at the next boot of this Ubuntu."
