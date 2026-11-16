# Installer plan: from "set up Docker, Bash and Bun by hand" to one file

Plan plus a first small step, written 2026-11-14 for the roadmap item "One-file installer" ([ROADMAP.md](../ROADMAP.md), top priority). What ships with it is `openbot/scripts/install.sh` and its test, for Ubuntu 22.04 and 24.04 only. For Windows, `openbot/scripts/install.ps1` and its Pester test are written but have never run on Windows (section 10). The maintainer has decided nothing in this plan yet; section 7 lists what must be decided.

Tags: **[code]** read in this repository (`path:line`). **[doc]** stated by an official page or index of the vendor or distribution (section 9, read 2026-11-14). **[assumed]** my inference, not checked. **[verify]** unknown; a run on a real clean machine must settle it. Nothing tagged [assumed] or [verify] may be built on as if it were true.

## 1. Goal, and what this step is not

The roadmap promise: you download one file, double-click it, and FreeDuet starts, with no Docker, Bash or Bun to set up by hand. **Stage S is not that, and this step is only its first part.** On Ubuntu the person still gets the repository first (`git clone`, or GitHub's ZIP), opens a terminal and types one command. What goes away is the by-hand setup of Docker, Compose, Bun and the small tools, and the guessing when a first start fails. There is no double-click, no single file, no Windows and no macOS yet, and it has not run on a clean machine yet (section 8). Do not call the roadmap item done on its strength.

| # | Constraint | Source |
|---|---|---|
| 1 | The Claude sign-in stays the person's own step. The installer never reads, writes or forwards it and never opens the CLI's login or config directory. | CLAUDE.md; [PROVIDERS.md](../PROVIDERS.md) |
| 2 | No secret and no personal data in the repository or the installer. It creates `openbot/.env` from the example and writes no value into it. | CLAUDE.md [code: openbot/scripts/install.sh:772-778] |
| 3 | A platform is called supported only after a test run on that platform. | [ROADMAP.md](../ROADMAP.md):31 |
| 4 | FreeDuet still starts with no API key. | ROADMAP.md:31 |
| 5 | Nothing downloaded runs unchecked: a pinned checksum or signature where the vendor publishes one, a plain statement where it cannot be checked. No unpinned download piped into a shell. | this plan |
| 6 | No sudo before the person has said yes; every step that needs it is listed first. | this plan |

## 2. Where we start [code]

A first start today: the root launcher links `.env`, runs `bun install` if `openbot/node_modules` is missing, then hands over [code: scripts/start.sh:8-12]. `openbot/scripts/start.sh` builds and starts the Compose services and runs the one-shot `migrate` [code: openbot/scripts/start.sh:486-487]; the server, the worker and the app run on the host under Bun. It checks only its own server and app ports [code: openbot/scripts/start.sh:345], not the ports Docker publishes. So the host needs Docker with Compose 2.24 or newer (the compose file uses `env_file` with `required: false` [code: openbot/docker-compose.yml:99], which Docker's page dates "as of Docker Compose version 2.24.0" [doc]), Bash, Bun 1.4.3 [code: openbot/package.json:6], git, curl, openssl and lsof. Measured here: `openbot/node_modules` is 1458 MiB after `bun install`. CI's clean-start job runs on a runner image that already has Docker and Bun [code: .github/workflows/ci.yml:453-469], so it proves `start.sh`, never an installer.

The compose file already names each image it builds so that a release could be pulled instead [code: openbot/docker-compose.yml:52-61], and 20 images are listed for publishing [code: openbot/.github/published-images.json]. This fork has no release workflow, only `ci.yml` and `security_zizmor.yml` [code: .github/workflows/], so none is published.

**Upstream already ships an installer.** `openbot/desktop/` is a Tauri app (dmg, nsis, appimage, deb, rpm [code: openbot/desktop/src-tauri/tauri.conf.json:41]). It installs Podman, Compose and Bun at pinned digests [code: openbot/desktop/src-tauri/src/install.rs:44-47], fetches a pinned release tarball and an image manifest [code: openbot/desktop/src-tauri/src/deployment.rs:1-12,21-28], and raises the Compose services plus the three Bun host processes [code: openbot/desktop/src-tauri/src/stack.rs:1-12]. It knows nothing of FreeDuet (no `freeduet` anywhere in `desktop/src-tauri/src`), looks for releases of CopilotKit/OpenBot [code: openbot/desktop/src-tauri/src/deployment_release.rs:9], and still offers a Claude plan sign-in that must go before FreeDuet ships it [code: docs/UPSTREAM_TOUCHES.md:194].

## 3. Stage S: a launcher on today's stack

### 3.1 What the person does, and what we build

| Step | The person | We must build | State |
|---|---|---|---|
| **S1 Ubuntu 22.04, 24.04** | Gets the repository, runs `bash openbot/scripts/install.sh`, answers y once, logs out and in once if the docker group was just added, then signs in to Claude. | `install.sh` and its fake-command tests | This PR. Not run on a clean machine. |
| **S2 Windows** | Runs one PowerShell command. Windows turns on WSL 2 and Ubuntu, restarts once, and `install.sh` runs inside Ubuntu: the maintainer's own setup [code: README.md:172]. | A PowerShell script: checks the Windows build and virtualisation, runs `wsl --install` (needs elevation [code: openbot/desktop/src-tauri/src/acquire.rs:7-11]), survives the restart and Ubuntu's first-run user name [verify: can both be scripted]. | Written, never run on Windows: `openbot/scripts/install.ps1` and `openbot/scripts/install.Tests.ps1` (section 10). No restart resume: the person runs the script again after the restart. |
| **S3 macOS** | One command in Terminal. | A separate program, since there is no apt: a container engine (Docker Desktop, Colima or Podman), Bun's macOS build, the tool checks [verify]. Needs a Mac to test; today there is no macOS run of the start [code: README.md:172]. | Not started. `install.sh` refuses macOS and points to the README [code: openbot/scripts/install.sh:173-176]. |

### 3.2 What `install.sh` decides, and the limit of each

| Decision | Reason | Limit |
|---|---|---|
| Docker, Compose and Buildx from Ubuntu's own packages (`docker.io`, `docker-compose-v2`, `docker-buildx`), not Docker's third-party repository [code: openbot/scripts/install.sh:317-322]. | Both LTS archives carry docker.io 29.1.3, docker-compose-v2 2.40.3 and docker-buildx 0.30.1 in `-updates` [doc: archive indexes]. apt checks signatures, and nothing outside Ubuntu's archive has to be trusted. | Packaged by Ubuntu, so it may trail Docker's own releases [assumed]. Docker's install page calls these packages unofficial and says they "may conflict" with its own, to be removed first [doc]. On 22.04 Compose comes only from `-updates`, on by default [assumed]. |
| Bun at the version `package.json` pins, from Bun's GitHub release, compared with a SHA-256 written in the script before anything is unpacked, then copied to `/usr/local/bin` [code: openbot/scripts/install.sh:69-72,678-713]. | Three digests (x64, x64 baseline for CPUs without AVX2, aarch64), computed from the real release files and equal to Bun's `SHASUMS256.txt` [doc]. The baseline and aarch64 ones also equal the digests the upstream app pins [code: openbot/desktop/src-tauri/src/install.rs:244,248]. A test ties the script's version to the pin; an unknown pin stops it. | Bun also signs that checksum file; the script does not verify the signature. The digests were copied once and are reviewed with the code. |
| A new docker group needs a new login: it says so and stops with exit 3 [code: openbot/scripts/install.sh:755-768]. | Working around it with `sudo docker` or a world-writable socket would hide a real permission problem. | One extra run for the person. |
| A Docker it did not install (Docker Desktop's WSL integration, `DOCKER_HOST`, a rootless socket, a non-Ubuntu package) is reported, not replaced [code: openbot/scripts/install.sh:317-365]. | It is not the installer's to change. | The person fixes it, then runs again. |
| Disk, memory and the ports Docker publishes are checked before anything changes [code: openbot/scripts/install.sh:444-477,500-552]. | `start.sh` checks none of them (section 6). | Floors are estimates; `--ignore-resources` goes on anyway. |
| Exit 0 handed over, 1 stopped and said why, 2 `--check` found a gap, 3 log out and in. `--check` reads only and asks nothing [code: openbot/scripts/install.sh:42,822-830]. | One status per kind of answer. | |

### 3.3 Maintenance cost of S

1. Each Bun bump needs three new digests; a drift test fails until they are in (about ten minutes [assumed]).
2. A new published port needs `port_list` updated [code: openbot/scripts/install.sh:500-518].
3. Each new Ubuntu LTS needs a test run before the version check accepts it [code: openbot/scripts/install.sh:189-194]. 26.04 LTS is already out (Docker's install page lists it [doc]) and its archive carries the same three versions [doc: archive index], so adding it is small; `install.sh` refuses it until a clean run exists.
4. The test file is the real cost: about 2,000 lines of fake commands that must keep matching real ones. Docker's error wording already changed between releases. The real CLI here (29.9.2) says "failed to connect to the docker API at unix:///var/run/docker.sock", older ones "Cannot connect to the Docker daemon", so the script matches the part both keep [code: openbot/scripts/install.sh:344-355].
5. S2 and S3 each add a program in another language and a platform to test, with no CI machine for macOS.

## 4. Stage M: published images, no Bun on the host

**The person** downloads one small file (a launcher script or a desktop app) and runs it. No clone, no `bun install`, no image builds: the first start pulls images [verify: size and time]. A container engine is still needed.

| Piece | What | State |
|---|---|---|
| Release pipeline | Build, sign and push the images the compose file builds itself (server for `migrate`, supervisor, agent-computer, agent-bot, agent-langgraph, agent-freeduet, and whisper with local dictation [code: openbot/docker-compose.yml:46,78,188,276,362,410,466]) at a tag, plus a digest manifest like upstream's `container-images.json` [code: openbot/desktop/src-tauri/src/deployment.rs:21-28]. Postgres, busybox and the two SPIRE images are third party. | None in this fork. |
| Host processes in images | The server, worker and app run on the host with `bun run` [code: openbot/desktop/src-tauri/src/stack.rs:845-862]. Without Bun they go into images, or into Bun single-file executables [assumed]. The all-in-one `openbot/Dockerfile` already runs api, computer and migrate under s6 but has no agent-freeduet [code: openbot/Dockerfile:162; openbot/docker/s6/s6-rc.d/], and its Postgres is off unless `EMBEDDED_POSTGRES=on` [code: openbot/Dockerfile:164-171]. | Not started. |
| Fetch and pin | A launcher that fetches a release at a tag, checks its digests and runs Compose with `IMAGE_PULL_POLICY=missing` and the `*_IMAGE` variables [code: openbot/docker-compose.yml:52-61]. | Variables exist; no launcher. |
| Engine | Docker through S's steps on Ubuntu; elsewhere Podman and Compose binaries, as the upstream app does [code: openbot/desktop/src-tauri/src/install.rs:44-47]. | Ubuntu: S1. |

**Maintenance.** A registry and a signing key to keep safe; every image rebuilt when a base image gets a security fix (ubuntu:24.04, node, python, pgvector [code: openbot/Dockerfile:20-23]) and a release for each; retention. The alternative is the upstream desktop app, which already does the fetch, the engine and the supervision (D1).

## 5. Stage L: an app with no Docker

**The person** installs one native package per system (dmg, exe, deb), like any app. No container engine. Everything below is [assumed]; none of it exists.

- Postgres with pgvector, native. The all-in-one image runs `postgresql-16` and pgvector on Linux [code: openbot/Dockerfile:164-171]; macOS and Windows are unproven.
- agent-freeduet's Python 3.12, Node and the pinned Claude Code CLI shipped inside the app [code: openbot/agent-freeduet/Dockerfile:12-26], and a Chromium for agent-computer.
- The supervisor gives each member a container and needs a Docker socket [code: openbot/Dockerfile:12-15]; without Docker the members share one computer.
- Process supervision, auto-update, Apple and Windows code signing (paid certificates).
- **A risk to constraint 1.** Today the Claude sign-in lives in a Docker volume only the CLI reads [code: openbot/docker-compose.yml:434-435]. With no container it would sit in a folder of the person's own account, beside any other Claude login. "FreeDuet never opens it" would have to be proved again [verify].

**Maintenance.** Three installers, certificates, updates and per-system bugs, for a project built and used by one maintainer on one computer [code: README.md:16]. L is a different product: start it only after M has shipped and been measured.

## 6. The numbers in install.sh, and how they were obtained

| Number | Value | How obtained |
|---|---|---|
| Disk for Docker's data | 7 GB minimum, 20 GB recommended [code: openbot/scripts/install.sh:77-78] | [assumed]. Base images are ubuntu:24.04, node slim, oven/bun, python slim, pgvector; add agent-computer's Chromium and BuildKit's cache beside the loaded copy. CI deletes the Android SDK and .NET to make room for the same builds [code: .github/workflows/ci.yml:470-475]. Image sizes could not be measured here: registries are blocked. |
| Disk for the checkout | 3 GB minimum, 5 GB recommended [code: openbot/scripts/install.sh:79-80] | `node_modules` measured at 1458 MiB (`du -sm openbot/node_modules`, 2026-11-14); Bun's cache and logs on top [assumed]. |
| Memory | 3500 MiB minimum, 7000 MiB recommended [code: openbot/scripts/install.sh:81-82] | [assumed]: five to nine containers (Postgres, agent-computer with its Chromium, the agents; with one computer each also the supervisor and SPIRE [code: openbot/scripts/start.sh:438-476]), three Bun processes, and an image build at the same time. Not measured. |
| Ports Docker publishes | computer 4100, langgraph 4201, Postgres 5432, bot 4200 (unless the provider is anthropic), supervisor 4500 (one computer each), freeduet 4230 (unless the router is off), whisper 4240 (local dictation) | `docker-compose.yml` and the switches that turn each service on [code: openbot/scripts/install.sh:500-518]. The app and server ports stay with `start.sh`. |

All four are to be replaced by one measured clean run (section 8, step 4).

## 7. Open decisions (at most six)

| # | Decision | Options | Recommendation and trade-off |
|---|---|---|---|
| D1 | Build our own installer for M, or adopt the upstream desktop app | (a) own launcher plus published images; (b) extend `openbot/desktop` for FreeDuet: its services, its releases, no plan sign-in; (c) scripts for S, the app for M and L | Decided 14 November 2026: (c), the double-click installer reuses the desktop app that already exists; whether the spike comes first is not stated. **A spike first, then probably (c).** About two days [assumed] on a disposable machine: point the app at a FreeDuet release and list what breaks (no agent-freeduet service, CopilotKit's release URL, the plan sign-in). It already solves engine install per system, Windows elevation and digests. The price is Rust and Tauri to maintain, Podman instead of Docker, and upstream merges. |
| D2 | What "one file" means on Ubuntu before M | (a) the README's `git clone` plus `bash openbot/scripts/install.sh`; (b) a bootstrap script that fetches a pinned, checksummed release tarball; (c) a `.deb` | **(a) until M.** (b) needs a release with a published checksum and a signature, which this fork lacks. A bootstrap without them is the unpinned `curl \| sh` section 1 rules out. (c) belongs with the desktop app. |
| D3 | Next platform after Ubuntu | (a) Windows through WSL 2; (b) macOS | Decided 14 November 2026: Windows through WSL 2 first (a), then macOS (b). **(a).** It is the maintainer's own setup, so a real run is possible [code: README.md:172]. macOS has no machine to run on and is not called supported without one. |
| D4 | Docker from Ubuntu's archive, or from Docker's own apt repository | (a) Ubuntu's packages (as built); (b) `docker-ce` from Docker's repository, with its signing key | Decided 14 November 2026: Ubuntu's own packages (a), as built. **(a).** Nothing outside Ubuntu's archive to trust, and Compose sits far above the 2.24.0 floor. The trade-off is a version Ubuntu chose, possibly behind Docker's, which Docker calls unofficial [doc]. For (b) Docker's page names the key at `download.docker.com/linux/ubuntu/gpg` and states no fingerprint; that host was not reachable here, so the key is unchecked. |
| D5 | What counts as "tested on Ubuntu" | (a) the manual run of section 8 on clean 22.04 and 24.04 VMs before each release; (b) also a CI job running `install.sh --yes` on a clean image; (c) neither, and say "not run" | **Decided 14 November 2026: (b), for the check, apt and Bun steps only; the manual run (a) still covers Docker and the first start.** The README says which steps CI covers. GitHub's runners already hold Docker and Bun, so a CI job on them cannot prove the install path [code: .github/workflows/ci.yml:453-469]. A clean image with sudo and a Docker daemon may be possible for (b) [verify]. |
| D6 | Whether to do stage L at all | (a) not before M has shipped and been measured; (b) start now | **(a).** L needs the Claude sign-in outside a container (section 5), which touches constraint 1, and three signed installers for one maintainer. Decide the sign-in rule first. |

D1 chooses (c), so the desktop app is the installer a double-click reaches, and its secrets count as much as `start.sh`'s. Until this change it wrote the example database password `openbot` into `.env` (`openbot/desktop/src-tauri/src/env.rs`). A new database now gets 24 random bytes, written as `POSTGRES_PASSWORD` beside `DATABASE_URL`, and a `.env` that already records a password keeps it. An existing database with no recorded password keeps `openbot` until someone changes it with `ALTER ROLE`, which the app never does. The other generated values were already random. The app never calls `start.sh`, so the D39 rules in `start.sh` do not run on this path, and the desktop path writes no `FREEDUET_INSTALL_SECRET`. Whether the spike checks that the two agree is for the maintainer to decide.

## 8. What a real run must still show

The tests put fake commands on a private PATH [code: openbot/scripts/install.test.ts]. They prove what the script decides and in what order: nothing is changed by `--check`, no sudo comes before the yes, each missing tool triggers its own step and nothing else, a wrong checksum stops the install, root and unsupported systems are refused, and a second run does nothing. They cannot prove that apt, Docker, Bun's download or a real group change behave as the fakes say. On a clean Ubuntu 22.04 VM and a clean 24.04 VM, as a normal user with sudo:

1. `bash openbot/scripts/install.sh --check` exits 2, lists the gaps, and changes nothing.
2. A full run: read the plan, answer y, see the apt install finish and the line saying the Bun SHA-256 matches.
3. Follow the log-out message, log in, run again: `docker info` works without sudo, nothing is installed, and `start.sh` runs.
4. After the first start record `docker system df` and peak memory; replace the floors in section 6.
5. Check `docker compose version --short` is 2.24 or newer on both releases, and that 22.04 gets Compose from `-updates`.
6. Stop the Docker service and run `--check`: it must say the service is not running. The "permission denied" wording of the newest Docker CLI is assumed [verify].
7. Repeat on WSL 2 with systemd on and off.
8. Run `bash scripts/start.sh` to a signed-in member's first answer.

## 9. Sources and limits

Read 2026-11-14: the Ubuntu archive indexes `archive.ubuntu.com/ubuntu/dists/{jammy,noble,resolute}{,-updates,-security,-backports}/universe/binary-amd64/Packages.gz` [doc]; Bun's release files and `SHASUMS256.txt` under `github.com/oven-sh/bun/releases/download/bun-v1.4.3/` [doc], with the digests computed from the downloaded bytes; two Docker pages, [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) and [Set environment variables](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/) [doc]. `download.docker.com`, packages.ubuntu.com, Launchpad, the Ubuntu key server, the container registries and GitHub pages of other repositories (docker/compose) were not reachable from the sandbox and were not worked around, so Docker's apt key is unchecked and image sizes are unmeasured. `shellcheck` is not installed there and could not be, so only `bash -n` and the tests ran. A real Docker CLI (29.9.2) and Compose (5.7.0) were present, but no daemon, so no real Docker answer to a stopped or forbidden daemon was seen beyond the missing-socket one.

## 10. Built so far

**Windows (S2): written, never run on a Windows machine.** `openbot/scripts/install.ps1` and `openbot/scripts/install.Tests.ps1` were written on 2026-11-14 in a Linux sandbox, where PowerShell could not be installed: GitHub, the PowerShell Gallery, NuGet and Microsoft's own hosts were unreachable, and the npm and PyPI packages are a shim or need .NET. Nothing in them has executed. The only machine check is a parse with the tree-sitter PowerShell grammar (WebAssembly, not Microsoft's parser): neither file shows an error, and a deliberately broken file does show errors, so the check can fail. Both files are plain ASCII, as Windows PowerShell 5.1 needs.

What the script does:

- Default run: it reads this computer (Windows build, administrator or not, virtualisation, `wsl --status`, the Ubuntu entries in the registry, systemd and Docker only when Ubuntu already runs, free disk and memory, a pending restart, whether the folder is a checkout). It prints the plan, then asks once. `-Check` prints the same plan and changes nothing. `-Yes` skips the question. `-IgnoreResources` goes on below the disk and memory minimums, as install.sh does.
- The steps, only when they are missing: `wsl --install -d Ubuntu-24.04 --no-launch` through Windows' own permission prompt, in its own window; `wsl --set-default-version 2`; `wsl --set-version <Ubuntu> 2`. Then the Ubuntu user, which the person creates by opening Ubuntu. Then `wsl --distribution <Ubuntu> bash openbot/scripts/install.sh`, which asks its own question unless `-Yes` was given.
- Exit status: 0 done; 1 stopped, with the reason; 2 `-Check` found something missing; 3 one step is left for the person; 4 restart Windows, then run it again. install.sh's own statuses pass through.
- It downloads nothing and runs no script from the internet. Its only script is `install.sh` from this checkout, run through the hand-over. It never reads or writes a login, password or secret, never touches the Claude sign-in, refuses to run as administrator, adds no startup task, never restarts Windows, installs no Docker and replaces no Docker it did not install.

Microsoft's pages it relies on (read 2026-11-14):

- [Basic commands for WSL](https://learn.microsoft.com/en-us/windows/wsl/basic-commands): `--set-version <distribution name> <versionNumber>`, `--set-default-version <Version>`, `--status`, `--list --running --quiet`, `--terminate`, `--shutdown`, `--distribution <Distribution Name>` with `--user`, `--distribution` as an install option, and `--no-launch`, which the page describes as not launching the distribution automatically. Not on the page: `--exec`, and a bare `--` separator. The page refers to `wsl --help` for the full list, which was not run here.
- [Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install): `wsl --install -d <DistroName>`; open PowerShell in administrator mode before it; restart after the first install; the user name and password come afterwards.

Assumed, and to verify on a real machine (the script depends on each one):

1. `wsl --distribution <name> <command>` runs the command. The page shows this form with `--user`, and `wsl hostname -I` runs a Linux command directly, but no page read here shows a command after `--distribution`. The hand-over, the systemd read and the Docker probe (`which docker`, `readlink -f`) all use it.
2. `wsl --status` exits 0 when WSL works, and prints a line that ends with `Default Version: 2`. Only the number is read.
3. `wsl --list --running --quiet` prints one name per line, and what it prints when nothing runs.
4. The registry under `HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss\{GUID}`: `DistributionName`, `Version` and `DefaultUid`. The script takes a missing or zero `DefaultUid` to mean that no Ubuntu user exists yet. No page read here confirms that.
5. Whether `wsl --install -d` needs administrator rights when WSL is already installed (the script always asks), and whether `--set-default-version` and `--set-version` need none (the script assumes none).
6. Whether `wsl --install` returns non-zero when it needs a restart. If it does, the script stops and says to run it again.
7. Whether an elevation that asks for another administrator's password registers the distribution for that account, not for the person. On a managed machine that would leave nothing for the person after the restart.
8. Whether `Start-Process -NoNewWindow -Wait` gives install.sh a console on which its question shows and takes the answer, in Windows PowerShell 5.1.
9. The values of `Win32_ComputerSystem.HypervisorPresent` and `Win32_Processor.VirtualizationFirmwareEnabled` on the target machines.
10. Where Docker Desktop's docker command resolves inside Ubuntu: install.sh's own check treats a path under `/mnt/wsl/` as Docker Desktop's, and the script does the same.
11. PowerShell 5.1 runs the `.ps1` files as a Windows git checkout writes them. `openbot/.gitattributes` sets `eol=lf` for every file.

Left out on purpose: resuming after the restart (no startup task; the person runs the script again); writing `/etc/wsl.conf` to turn systemd on (when systemd is off, install.sh stops at the Docker start and says how to turn it on, and a system setting is the maintainer's decision); creating the Ubuntu user (a login the person chooses); macOS. The installer files are FreeDuet's own, not upstream OpenBot's, so `docs/UPSTREAM_TOUCHES.md` has no row for them, as it has none for `install.sh`.

Tests: 51 Pester 5 tests in `openbot/scripts/install.Tests.ps1`, in 8 blocks. None has run. They cover the exit codes, the text readers, the resource rules, each branch of the plan (including the exact WSL arguments), the formatting, the one question and `-Check` (with the WSL and elevation calls mocked, so a test fails if one is made), each exit path, and checks of the file itself (ASCII, parse, no download or script runner, no credential, no execution-policy, startup or registry change, no restart). They run in CI since 16 November 2026 (section 11, `installer-windows`).

**Manual check on a clean Windows 11 machine (or a snapshot of one).** Use a normal user account, with virtualisation turned on in the firmware. Write down each exit status with `echo $LASTEXITCODE`.

1. Get the repository into `C:\Users\<you>\freeduet`, with `git clone` or GitHub's ZIP. Do not use a network path or a OneDrive folder.
2. Open Windows PowerShell as yourself, not as administrator. Go to that folder.
3. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\openbot\scripts\install.ps1 -Check`. On a machine without WSL, expect the findings, the line "What I would do (-Check changes nothing)", and status 2. No permission prompt appears. `wsl --list --verbose` shows what it showed before.
4. Run the same command without `-Check`. Expect the plan and `Go ahead? [y/N]`. Answer `n`: expect "Nothing was changed." and status 1. Check that `wsl --list --verbose` is unchanged.
5. Run it again and answer `y`. Expect Windows' permission prompt; accept it. An elevated window runs `wsl --install -d Ubuntu-24.04 --no-launch`: wait until it closes. Expect "Restart Windows now" and status 4. Restart Windows.
6. Open Windows PowerShell as yourself, go to the folder, and run `-Check` again. Expect "One step is left, and only you can do it" and status 3.
7. Open Ubuntu-24.04 from the Start menu, create the user name and password, and close the window. Read the registry with `Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss | ForEach-Object { Get-ItemProperty $_.PSPath | Select-Object DistributionName, Version, DefaultUid }`. Write down `DefaultUid` before this step and after it: that is the check of assumption 4.
8. Run `-Check` again. Expect status 0. If the default version is 1, or Ubuntu is WSL 1, expect status 2: then run without `-Check` and answer `y`.
9. Run without `-Check` and answer `y`. Expect "Handing over to install.sh inside Ubuntu-24.04", then install.sh's own plan and its question `Go ahead and install these? [y/N]`. Its question must show and take the answer (assumption 8). Answer `y`: install.sh must run to the end, as section 8 describes, when systemd is on in that Ubuntu. When it is off, install.sh stops at the Docker start with exit 1 and says how to turn systemd on (section 11).
10. Negative checks, each with status 1 and the reason printed: run from an administrator PowerShell; run from a folder that is not a checkout; if possible, run from a `\\server\share` path; on a machine with virtualisation off in the firmware, or Windows 10 below build 19041.
11. Send the maintainer the output of `wsl --help`, `wsl --status`, `wsl --list --verbose`, and `wsl --distribution Ubuntu-24.04 cat /etc/wsl.conf`. The first one shows on your machine whether `--exec` exists (assumption 1). Say whether `--set-default-version` or `--set-version` showed a permission prompt (assumption 5), and whether the distribution is still listed for your account after the elevated install (assumption 7).

Every line of this section is unverified until that check has been done.

## 11. Built so far (Ubuntu, S1)

**Ubuntu 22.04 and 24.04: `install.sh` runs in CI on fresh containers.** The job `installer-clean-machine` [code: .github/workflows/ci.yml:514-659] has one leg per release. It runs on main and on pull requests labelled `full-ci`, with clean-start's gate, and `verify` requires it where it runs. Each leg starts `ubuntu:22.04` or `ubuntu:24.04` with `--pull always`, with no privilege, no Docker socket, no systemd and no Docker daemon, and the checkout mounted read-only. A green run means the four steps below behaved as written. It does not mean FreeDuet installs.

The setup a real machine does not have. These are the only lines the job adds to the image:

- a user `installer` with passwordless sudo (a fresh server asks for a password);
- `sudo` and `ca-certificates`, installed as root before the run;
- the `-updates` pocket and `universe`, added from archive.ubuntu.com only when the image lacks them;
- a marker file in `/tmp`, which step 1 uses to find any file written after the start;
- one login session started by `setpriv`, so the groups are read at that login, not at a terminal or SSH login.

The four steps, as the job asserts them:

1. `install.sh --check`: exit 2, `bun` and `docker` listed as missing, "Not ready yet", no package changed, and no file newer than the marker under `/etc`, `/usr/local`, `/var/lib` or the home folder.
2. `install.sh --yes`: the apt packages install, the Bun download is compared with the SHA-256 in the script before anything runs, and the run stops at "Step 3 of 4: Start Docker" with exit 1. Afterwards `bun` is the pinned version, `git`, `curl`, `openssl` and `lsof` exist, Compose is 2.24.0 or newer, and `docker info` fails.
3. `install.sh --check` again: exit 2, with `docker` listed as missing because the service is not running, and `bun` ok.
4. `install.sh --yes` again: exit 1 at "Step 1 of 2: Start Docker". Nothing is downloaded or installed, the package list is unchanged, and the installer user is not added to the docker group.

**What it proves:** the check changes nothing; the apt packages and the pinned Bun install in a fresh container of each release; the Bun checksum is compared; the installer stops at the Docker start, says why, and runs no service command; a second run installs nothing more.

**What it does not prove:**

- Docker itself. No daemon runs in CI, and the job asserts that none answers.
- The docker group step and the new login (exit 3). The group step never runs in CI, because the Docker step stops first.
- The first start of FreeDuet: `start.sh`, the images, Postgres and the members.
- A VM, WSL or Windows (`install.ps1` is in section 10).
- The base images: `ubuntu:22.04` and `ubuntu:24.04` are pulled by tag, so a base image update can change a result.
- The apt sources the images ship with. The job adds the archive only when a pocket or universe is missing.
- A VM run of section 8. Items 1 and 2 of section 8 now run in containers, and the VM run is still needed.

**Finding, found while checking the Docker step against the archive.** On a system without systemd, `install.sh` ran `service docker start`. Ubuntu's `docker.io` has no service script [code: openbot/scripts/install.sh:605-613,733-743], so `service` says "unrecognized service" and nothing starts. The script now stops before any command, with the reason and the systemd steps, and the earlier steps stay done. `install.test.ts` asserts that stop, and that no `service`, `systemctl` or `usermod` call is made.

**Tests.** `bun test` on `install.test.ts` (91 tests), run from a copy of `openbot/scripts` with `openbot/package.json`, with no `bun install` here:

- this change: 91 pass, 0 fail;
- the base commit's `install.sh` with the same test file: 90 pass, 1 fail (the changed test).

In CI the file runs in the `tests` job through `bun run test:ci`, which discovers it under `openbot/` and checks a floor of 400 tests.

**Not verified here:** the job itself (no containers and no Docker on this machine), the real Bun download, apt in the images, Docker Hub pulls on hosted runners, and the first CI run. shellcheck ran on `install.sh` and on the job's check script: only SC1091, an info note.

**Decisions for the maintainer.** Section 7 was written before this job existed. This table brings forward the choices that the job changes.

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Whether this job counts toward D5, "tested on Ubuntu" | (a) no: only the manual run of section 8 counts; (b) yes for the check, apt and Bun steps, and the manual run still covers Docker and the first start | Decided 14 November 2026: (b), for the check, apt and Bun steps only; the manual run still covers Docker and the first start. The README says which steps CI covers. | The job runs those steps on both releases for every `full-ci` pull request and on main |
| Docker without systemd | (a) stop with the reason, as built; (b) start `dockerd` by hand from the installer; (c) `install.ps1` writes `[boot] systemd=true` to `/etc/wsl.conf` | (a) now; (c) is the maintainer's call | (b) needs a root daemon the installer should not hold; (c) changes a system file and needs a WSL restart |
| Exit 1 at the Docker start as the job's green result | (a) green, as built; (b) red until a daemon can run in CI | (a) | A daemon needs privilege or a socket, which this job forbids; the stop is asserted, not hidden |
| Image pins | (a) tags with `--pull always`, as built; (b) digests in the job | (b), once someone owns the refresh | A tag moves under the job, so a base image update can change a result with no code change |

**The desktop crate builds in CI, on Linux (`desktop-crate`).** The job [code: .github/workflows/ci.yml, job `desktop-crate`] installs the packages that Tauri 2 lists for Debian and Ubuntu [doc: https://v2.tauri.app/guides/prerequisites/], installs Rust 1.88.0 and Bun 1.4.3, and runs `cargo check --locked` and `cargo test --locked` in `openbot/desktop/src-tauri`, the app the future installer is to reuse. No other job compiled that crate. What it proves: the crate builds and its tests run on Linux, with the committed lock. What it does not prove: a Windows or macOS build, packaging or signing, or a first start of the app. The toolchain is 1.88.0 because the lock's packages declare that they need it; `Cargo.toml` still says `rust-version = "1.77"`, which those packages do not allow, and changing that is the maintainer's decision. The first run of the job (PR #219, head 51cf9c9) failed two tests, and both are fixed here. `everything_the_unpacked_code_imports_is_unpacked_too` (`deployment.rs`) failed because the browser script `openbot/scripts/freeduet-dictation-e2e.ts` imported two files from the FreeDuet root `evals/` folder, outside `openbot/`; the script and its test now live in `evals/dictation/`, which the unpacking guard does not read. `credential_lock_excludes_bun_in_both_directions_and_recovers_after_kill` (`provider_oauth.rs`) starts `bun` on the runner, which had none; the job now installs it with the same pinned action and version as the other jobs.

**`install.ps1` and its Pester tests run in CI, on a hosted Windows runner (`installer-windows`).** Written 2026-11-16. The job [code: .github/workflows/ci.yml, job `installer-windows`] runs on `windows-latest`, on main, on `workflow_dispatch` and on pull requests labelled `full-ci`, with installer-clean-machine's gate, and `verify` requires it where it runs. It uses no secret. First run read: run 43847906359, head `aa54067`, PR #293. The image that run reported: `win25-vs2026` version `20261103.298.1`, Windows Server 2025 Datacenter 24H2 (build 26100), 4 logical processors, 16 GB, 30 GB free on `C:`, Windows PowerShell 5.1.26100.33648. `windows-latest` moves, so the job prints the image in its summary and a result belongs to the image it names. On that image the WSL and Virtual Machine Platform features are enabled, a hypervisor is present, and `wsl --status` answers (exit 0, default version 2), but no Ubuntu distribution is installed.

What the job does, and what the first run showed:

1. **Pester 5.9.0 in Windows PowerShell 5.1** runs `openbot/scripts/install.Tests.ps1`. First run, before the fix below: 52 tests, 51 passed, 1 failed. After it: **54 tests, 54 passed, 0 failed** (52, plus 2 added for the finding).
2. **`install.ps1 -Check` and `-Yes` as the runner's own user.** The runner user is an administrator and is already elevated, which `install.ps1` refuses by design. Both runs exit 1 and print "Stopped before changing anything: Do not run this script as administrator." Nothing is changed. This shows the refusal and the reading of the machine; it does not show a person's run.
3. **The same two runs as a standard local user** (`fdinstall`, created by the job, a member of Users only; the checkout is copied to `C:\fd-checkout`). `-Check` exits **2**: Windows, rights, virtualisation, disk, memory, WSL ("installed; default version 2") all read ok, Ubuntu "MISSING", and it says it would run `wsl --install -d Ubuntu-24.04 --no-launch`. `-Yes` goes as far as that step and stops with exit **1**: "Could not run wsl --install: This command cannot be run due to the error: The operation was canceled by the user. Nothing was installed." The step asks Windows for administrator permission through the prompt (`-Verb RunAs`); on a hosted runner nobody can answer it, so it is cancelled. That is the documented stop of this job: the Ubuntu install, the restart and everything after it were not reached.
4. **The job summary** has one row per run (exit code, verdict, the script's own stop line) and the full output in a block; the transcripts (the runner facts, the Pester output and results, one file per run) are uploaded as the artifact `installer-windows-transcripts`.

A stop that `install.ps1` itself explains (a block, a restart, the Ubuntu user step, a failed `wsl` command with its exit code) is a pass. An error it does not explain, a timeout, no exit code or a failed Pester test fails the job. A run that cannot be started at all (for example the standard user cannot be set up) is reported as "NOT REACHED" with the reason; it is not a failure of the script, and it is not a pass of that step either.

**Finding of the first run, fixed.** `ConvertFrom-WslNameList` and `Get-InstalledWslDistributions` ended in `return ,$array`, and the facts reader wraps both in `@()`. `@(,$array)` holds the array as one element, so the list of running distributions and the list of installed distributions each had a single nested element [code: openbot/scripts/install.ps1:683,694 (before the fix)]. Tests that pass the facts by hand never saw it; the Pester test "lists distribution names one per line" did, on its first run. In the real script, the check "is this Ubuntu running" (`RunningDistributions -contains`) could never succeed, so systemd and Docker inside Ubuntu were never read, and the distribution choice depended on array member enumeration. The two commas are removed, and two Pester tests guard the one-name and empty cases. No behaviour that a person sees changes except that those two reads now work as written. The test "lists distribution names..." failed on main's `install.ps1` and passes now; the two new tests also fail on main's `install.ps1`.

**What this proves:** the Pester tests pass in Windows PowerShell 5.1 on Windows Server 2025; `install.ps1` parses and runs there; its reading of the machine (build, rights, hypervisor, disk, memory, WSL, registry) works on a real Windows kernel; `-Check` changes nothing and exits 2 with the missing step named; `-Yes` goes as far as the Ubuntu install and stops with a reason.

**What it does not prove:**

- A person's PC, with a real UAC prompt, other Windows editions (this is Server 2025, not Windows 10 or 11), a firmware with virtualisation off, or Docker Desktop present.
- `wsl --install -d Ubuntu-24.04 --no-launch` itself, the Windows restart after it, and the step after the restart (the run again, now finding WSL and Ubuntu).
- The Ubuntu user step (the person opens Ubuntu and creates a user), so the hand-over to `install.sh` inside Ubuntu (`wsl --distribution <name> bash <path>`, the form that Microsoft's pages do not show) was never reached, and neither were Docker, the service (`-Service`) or the first start of FreeDuet.
- That `install.ps1` works as a person runs it with a double-click: it is still a script run from a checkout.
- The image: `windows-latest` is a moving tag, and a different image can change a result.

**Decisions left to the maintainer**

| Decision | Options | Advice |
|---|---|---|
| Should the CI job try to go past the Ubuntu install? On a hosted runner the administrator prompt cannot be answered. | (a) as built: stop there and say why; (b) a second leg that runs `wsl --install -d Ubuntu-24.04 --no-launch` itself in an elevated shell (outside `install.ps1`, so it proves WSL and Ubuntu but not the script), then a user created with `wsl --user root` commands, then `install.ps1 -Yes` hand-over to `install.sh`; (c) a larger runner or a self-hosted Windows VM | (a) now. (b) is the next useful step and changes no behaviour a person sees, but it makes the job slower and flakier (a download of about 400 MB from Microsoft on every run) and it needs the Ubuntu user created by a script, which the installer deliberately leaves to the person. Say yes to (b) only as a separate, non-required job. |
| Should `install.ps1` ask for administrator rights in a way that works without a prompt (for example a parameter that says "I am already elevated, go on")? | (a) no, as built: it refuses elevation by design; (b) an explicit `-AllowElevated` switch, off by default | (a). Refusing elevation protects the person's WSL setup (it would otherwise belong to the administrator account). A CI-only switch weakens the script to make a test easier, and this job does not need it. |
| Should the job stay a required check in `verify`? | (a) yes, as installer-clean-machine; (b) not required | (a) while it is stable. It runs only on main, on `full-ci` and by hand, and it never fails because a hosted Windows runner cannot do what a PC does: only a real error in the script or a failed test turns it red. If the image changes under it and makes it flaky, move it to (b) first. |

## 12. Built so far (Windows next step: FreeDuet as a service inside WSL)

Written 2026-11-16. What changed since sections 10 and 11: the stack can now be installed as a systemd service. It has **never run on a real Windows machine or under real systemd**; only the decisions of the scripts are tested, with fake commands.

**Gaps between today and "download one file, double-click, FreeDuet starts" on Windows**

1. No single file and no double-click: the person still needs a checkout first, then one PowerShell command [code: openbot/scripts/install.ps1:334, "get the repository first"].
2. The double-click path (D1, the Tauri app) has not started: no FreeDuet service in it, release URL still CopilotKit's, plan sign-in still offered [code: openbot/desktop/src-tauri/src/deployment_release.rs:9; docs/UPSTREAM_TOUCHES.md:194]. The spike of section 7 is not done.
3. `install.ps1` has run on a hosted Windows runner up to the Ubuntu install, and its Pester tests run in CI (section 11, `installer-windows`); it has never run on a person's PC.
4. No resume after the Windows restart: the person runs the script again [code: openbot/scripts/install.ps1:105, status 4].
5. The Ubuntu user is created by the person by opening Ubuntu [code: openbot/scripts/install.ps1:398,467].
6. systemd is not turned on by the installer. When it is off, `install.sh` stops at the Docker start [code: openbot/scripts/install.sh:737-742]; writing `/etc/wsl.conf` and `wsl --shutdown` is left to the person (section 11, decision (c)).
7. The stack died with its terminal or with WSL's idle stop: nothing started it again [code: openbot/scripts/start.sh:907, host processes are background children of the script]. **This step addresses this one.**
8. No published images, so the first start builds on the person's machine (section 4).
9. `install.ps1` text says that with systemd off "install.sh starts it by hand" [code: openbot/scripts/install.ps1:413]; install.sh stopped doing that (section 11). Stale wording, not changed here.

**What is built**

- `openbot/scripts/install-service.sh`: writes `/etc/systemd/system/freeduet.service`, runs `daemon-reload`, `enable`. The unit is `Type=oneshot` with `RemainAfterExit=yes`, runs as the person (`User=`, never root), requires and starts after `docker.service`, waits up to 5 minutes for `docker info`, runs `scripts/stop.sh --keep-computers`, then `scripts/start.sh`; `ExecStop` runs `scripts/stop.sh`. `--print` shows the unit and runs nothing (no sudo). `--remove` undoes it. It asks once before any sudo (or `--yes`), refuses root, refuses when systemd is not running (and says how to turn it on), refuses a path the unit cannot carry safely (space, `%`, `$`), and does nothing on a second run when the file is current and enabled. `enable` does not start it: a FreeDuet already running is not restarted.
- `install.sh --service` adds the step to its plan (after Docker; never on by default). Without systemd it stops before changing anything. `--check` is unchanged.
- `install.ps1 -Service` passes `--service` to `install.sh` in the hand-over.
- No approvals, auth, mail, payments or data code was touched. No upstream OpenBot file was touched (no row in `UPSTREAM_TOUCHES.md`).

**Tests** (`bun test`, from `openbot/`): `scripts/install-service.test.ts` 13 new tests (on main's tree, where the script does not exist, 13 fail); `scripts/install.test.ts` 96 (91 before; 5 added, 3 of them fail on main's `install.sh`, 2 guard unchanged behaviour: no step without the flag, "n" changes nothing). One Pester test added for `-Service` and **not run** (no PowerShell here).

**Not proven:** that real systemd accepts the unit; that `scripts/start.sh` leaves its Bun processes alive inside a oneshot unit's control group and `stop.sh` stops them at shutdown (the maintainer's own service, built by hand on 2026-11-16, is the evidence for the approach, not for this file); that a boot of WSL starts it; the `timeout`/`docker info` wait line under systemd's quoting; anything on Windows. `systemd-analyze verify` was not available here.

**Decisions left to the maintainer**

| Decision | Options | Advice |
|---|---|---|
| Should the service be on by default for Windows (so that `install.ps1` always passes `--service`)? It changes what runs on the person's computer at every boot, and a boot start uses CPU, memory and ports with no one at the keyboard. | (a) opt-in flag, as built; (b) on by default in `install.ps1`, off in `install.sh` for Ubuntu; (c) ask in the plan | (b) once a real Windows run shows it works: the roadmap promise is "FreeDuet starts" and a double-click user will not know the flag. Until then (a). |
| Should the installer write `[boot] systemd=true` to `/etc/wsl.conf` and run `wsl --shutdown`? Today the service needs it and the person does it by hand. | (a) no, as built; (b) yes, after a question | (b) in the plan, with its own yes: it is a system file and shuts down all of the person's WSL sessions. |
| Should the service wait for a signed-in Claude before starting members? | (a) no, as built; the sign-in is the person's step and is kept | (a): nothing here reads or checks it. |
