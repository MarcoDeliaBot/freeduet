# Installer plan: from "set up Docker, Bash and Bun by hand" to one file

Plan plus a first small step, written 2026-11-14 for the roadmap item "One-file installer" ([ROADMAP.md](../ROADMAP.md), top priority). What ships with it is `openbot/scripts/install.sh` and its test, for Ubuntu 22.04 and 24.04 only. The maintainer has decided nothing in this plan yet; section 7 lists what must be decided.

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
| **S2 Windows** | Runs one PowerShell command. Windows turns on WSL 2 and Ubuntu, restarts once, and `install.sh` runs inside Ubuntu: the maintainer's own setup [code: README.md:172]. | A PowerShell script: checks the Windows build and virtualisation, runs `wsl --install` (needs elevation [code: openbot/desktop/src-tauri/src/acquire.rs:7-11]), survives the restart and Ubuntu's first-run user name [verify: can both be scripted]. | Not started. `install.sh` already detects WSL 1 and 2 and says what differs [code: openbot/scripts/install.sh:203-212,808-814]. |
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
| D1 | Build our own installer for M, or adopt the upstream desktop app | (a) own launcher plus published images; (b) extend `openbot/desktop` for FreeDuet: its services, its releases, no plan sign-in; (c) scripts for S, the app for M and L | **A spike first, then probably (c).** About two days [assumed] on a disposable machine: point the app at a FreeDuet release and list what breaks (no agent-freeduet service, CopilotKit's release URL, the plan sign-in). It already solves engine install per system, Windows elevation and digests. The price is Rust and Tauri to maintain, Podman instead of Docker, and upstream merges. |
| D2 | What "one file" means on Ubuntu before M | (a) the README's `git clone` plus `bash openbot/scripts/install.sh`; (b) a bootstrap script that fetches a pinned, checksummed release tarball; (c) a `.deb` | **(a) until M.** (b) needs a release with a published checksum and a signature, which this fork lacks. A bootstrap without them is the unpinned `curl \| sh` section 1 rules out. (c) belongs with the desktop app. |
| D3 | Next platform after Ubuntu | (a) Windows through WSL 2; (b) macOS | **(a).** It is the maintainer's own setup, so a real run is possible [code: README.md:172]. macOS has no machine to run on and is not called supported without one. |
| D4 | Docker from Ubuntu's archive, or from Docker's own apt repository | (a) Ubuntu's packages (as built); (b) `docker-ce` from Docker's repository, with its signing key | **(a).** Nothing outside Ubuntu's archive to trust, and Compose sits far above the 2.24.0 floor. The trade-off is a version Ubuntu chose, possibly behind Docker's, which Docker calls unofficial [doc]. For (b) Docker's page names the key at `download.docker.com/linux/ubuntu/gpg` and states no fingerprint; that host was not reachable here, so the key is unchecked. |
| D5 | What counts as "tested on Ubuntu" | (a) the manual run of section 8 on clean 22.04 and 24.04 VMs before each release; (b) also a CI job running `install.sh --yes` on a clean image; (c) neither, and say "not run" | **(a), and the README says "not run" until it has.** GitHub's runners already hold Docker and Bun, so a CI job on them cannot prove the install path [code: .github/workflows/ci.yml:453-469]. A clean image with sudo and a Docker daemon may be possible for (b) [verify]. |
| D6 | Whether to do stage L at all | (a) not before M has shipped and been measured; (b) start now | **(a).** L needs the Claude sign-in outside a container (section 5), which touches constraint 1, and three signed installers for one maintainer. Decide the sign-in rule first. |

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
