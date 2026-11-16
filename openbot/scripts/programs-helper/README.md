# FreeDuet programs helper (Windows, read-only)

A small PowerShell script that lets a FreeDuet member ask what programs are installed on this Windows computer and which
have updates, through `winget`. It only reads. Design: `docs/design/programs-on-your-computer.md` (slice S2), decision D62
in `docs/M1_PLAN.md`.

Status: it has never run on a person's computer. The only Windows run so far is the `installer-windows` job in CI.

## Files

| File | What it is |
|---|---|
| `FreeDuetProgramsHelper.ps1` | The helper. Polls the FreeDuet server, listens on nothing, runs two fixed read-only winget commands |
| `setup.ps1` | Pairs with a one-time code, stores the secret, makes the scheduled task |
| `uninstall.ps1` | Removes the task and the helper's folder |
| `FreeDuetProgramsHelper.Tests.ps1` | Pester tests (run in CI) |
| `hmac-vectors.json` | Signing vectors made by the server's own code, kept equal by a server test |

## Running the scripts

Run them in a normal window as yourself, never as administrator (they refuse). The scripts are plain text: read them first. They come from the FreeDuet you downloaded them from (nothing is signed yet), so what you run is whatever that installation serves.

```
powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\setup.ps1
```

If Windows says the script is blocked because it came from the internet, run `Unblock-File .\*.ps1` once. It removes the "downloaded from the Internet" mark from those files, which is what lets Windows run them under `RemoteSigned`. The scripts are
not signed yet, which is why the policy is `RemoteSigned` plus `Unblock-File` and not `Bypass`: the helper's own task
runs with `RemoteSigned` too, and setup unblocks its copy. Nothing here changes the machine's execution policy.

## What the protection is

The helper's folder (`%LOCALAPPDATA%\FreeDuet\programs-helper`) is readable only by your Windows user, and the secret in it
is protected with DPAPI for that user. That keeps the secret from other Windows users and from the computers of FreeDuet's
members. It does not keep it from a program running as you: such a program can read the secret exactly as the helper does.
The approval card in FreeDuet is what stands in front of any action, and the helper can only run two fixed read-only commands.

## Options of setup.ps1

- `-Server <address>`: default `http://localhost:3010`. Only this computer is accepted.
- `-AllowRemoteServer`: another host, https only, with a warning naming the host. Certificate checks are never switched off.
- `-AllowWritableWingetFolder`: accept a winget.exe in a folder your user can write (not recommended).
- `-UseWindowsAppsAlias`: use the WindowsApps alias of winget (a link in a writable folder, not signature-checked). Setup prints that warning on the screen when you choose it and asks you to type `UNCHECKED` before anything is written; `-AcceptAliasRisk` gives that answer on the command line. The helper's log repeats it at every start.
- `-NoTask`, `-Yes`, `-Code`, `-WingetPath`.
