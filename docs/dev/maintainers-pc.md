# On the maintainer's computer

Moved out of `CLAUDE.md`. Read it before updating or restarting the stack on the maintainer's computer.

- The stack runs in WSL Ubuntu, with Docker inside WSL. A script started through `wsl.exe` that leaves
  processes running must end with `exec sleep infinity`, or WSL stops the distro when the last session
  ends and the stack dies.
- Start such scripts hidden from PowerShell with `Start-Process -WindowStyle Hidden wsl ...`.
- Write multi-line logic into a `.sh` file and run it. Inline regex through PowerShell breaks.
- A Windows watchdog restarts the stack whenever port 3010 stops answering. Before an update, expect it: stopping the
  stack by hand makes it run its own `start.sh` within a minute, and two starts collide once (container name conflict)
  before one wins. Back up the database first (`pg_dump -Fc` from the postgres container), then update.
- The stack runs as a systemd service inside WSL (`freeduet.service`, a `oneshot` unit with `RemainAfterExit`).
  To update, back up the database, pull, run `systemctl restart --no-block freeduet.service` as root, then poll
  port 3010 until it answers. A holder process must still keep the distro alive. The Windows watchdog now checks
  every minute and starts its fallback with a hidden window, because a visible console took the keyboard focus.
  `/tmp` inside WSL is emptied when the distro restarts, so a script that must survive lives in a persistent
  folder. Inline SQL with `||` through PowerShell breaks: write it in a `.sh` file.
- Seen on one installation on 16 November 2026: the shared documents folder, mounted at `/workspace/documenti`, is a read-only 9p mount of a Windows drive, so a member never writes there.
  It writes in its own `/workspace` volume (`openbot/supervisor/src/docker.ts:462`) and hands a file to the person with `offer_file`, so `user.*` extended attributes matter only inside that volume.
