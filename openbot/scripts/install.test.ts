import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * `scripts/install.sh` on a machine that is not there.
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT. Every program the installer looks at or runs is a fake on a
 * PATH that holds nothing else (plus symlinks to the real coreutils): apt-get, dpkg, docker, sudo,
 * curl, unzip, bun, systemctl, usermod, id, uname, df, lsof. The system files it reads come from a
 * fixture directory (`FREEDUET_INSTALL_ROOT`). So these tests prove the installer's DECISIONS: what it
 * asks for, in which order, what it refuses, what it runs only after a yes, and that a wrong checksum
 * stops it. They do not prove that Ubuntu's real packages install, that a real Docker answers the way
 * the fake does, or that the Bun release still has the checksums written in the script. That is one
 * run on a clean Ubuntu (docs/design/installer.md, "What a real run must still show").
 *
 * THE FAKE SUDO IS A WHITELIST, not a pass-through: a command it does not know exits 99, so an
 * installer that started running something new fails here instead of passing. It prints each call
 * to the same stdout the installer writes to, which is what lets a test say "the question came
 * before the first sudo".
 *
 * `shellcheck` is not run here; it was not available where this was written (see the report).
 */

const scriptsDirectory = import.meta.dir;
const realInstaller = join(scriptsDirectory, "install.sh");
const bash = Bun.which("bash") as string;
const slow = 30_000;

const GIB_KB = 1024 * 1024;

// The real coreutils the installer needs, linked in beside the fakes. Everything else is absent.
const REAL_TOOLS = [
  "awk",
  "basename",
  "bash",
  "cat",
  "chmod",
  "cp",
  "cut",
  "dirname",
  "env",
  "grep",
  "head",
  "install",
  "ln",
  "mkdir",
  "mktemp",
  "readlink",
  "rm",
  "sed",
  "sha256sum",
  "sort",
  "tail",
  "timeout",
  "tr",
  "wc",
];

// What a fake may stand in for, linked into the PATH unless a scenario says it is missing.
const FAKE_TOOLS = [
  "apt-get",
  "bun",
  "curl",
  "df",
  "docker",
  "dpkg",
  "getent",
  "git",
  "id",
  "lsof",
  "openssl",
  "service",
  "sleep",
  "sudo",
  "systemctl",
  "uname",
  "unzip",
  "usermod",
];

const FAKES: Record<string, string> = {
  id: `#!/bin/sh
case "$1" in
  -u) cat "$STATE/uid" ;;
  -un) echo tester ;;
  -nG) cat "$STATE/session_groups" ;;
  *) echo "fake id: $*" >&2; exit 1 ;;
esac
`,
  uname: `#!/bin/sh
case "$1" in
  -s) cat "$STATE/uname_s" ;;
  -m) cat "$STATE/uname_m" ;;
  *) echo "fake uname: $*" >&2; exit 1 ;;
esac
`,
  getent: String.raw`#!/bin/sh
if [ "$1" = group ] && [ "$2" = docker ] && [ -f "$STATE/group_members" ]; then
  printf 'docker:x:998:%s\n' "$(cat "$STATE/group_members")"
  exit 0
fi
exit 2
`,
  dpkg: `#!/bin/sh
if [ "$1" = -s ] && grep -Fx "$2" "$STATE/dpkg" >/dev/null 2>&1; then exit 0; fi
exit 1
`,
  sleep: String.raw`#!/bin/sh
printf 'sleep %s\n' "$*" >> "$STATE/sleep.log"
`,
  git: "#!/bin/sh\nexit 0\n",
  openssl: "#!/bin/sh\nexit 0\n",
  bun: `#!/bin/sh
cat "$STATE/bun_version"
`,
  // Two wordings of the same failures, because Docker changed its own between releases.
  docker: String.raw`#!/bin/sh
printf '%s\n' "$*" >> "$STATE/docker.log"
case "$1" in
  compose)
    if [ -f "$STATE/compose_missing" ]; then
      echo "docker: unknown command: docker compose" >&2
      exit 1
    fi
    cat "$STATE/compose_version"
    exit 0 ;;
  info)
    style="$(cat "$STATE/docker_error_style")"
    if [ "$(cat "$STATE/daemon")" != up ]; then
      case "$style" in
        api) echo "failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory" >&2 ;;
        odd) echo "something this installer has never seen" >&2 ;;
        rootless) echo "failed to connect to the docker API at unix:///run/user/1000/docker.sock; check if the path is correct and if the daemon is running: dial unix /run/user/1000/docker.sock: connect: no such file or directory" >&2 ;;
        *) echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" >&2 ;;
      esac
      exit 1
    fi
    case " $(cat "$STATE/session_groups") " in
      *" docker "*) if [ -f "$STATE/docker_denies" ]; then denied=1; fi ;;
      *) denied=1 ;;
    esac
    if [ -n "$denied" ]; then
      case "$style" in
        api) echo "failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: permission denied" >&2 ;;
        *) echo "permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: connect: permission denied" >&2 ;;
      esac
      exit 1
    fi
    if [ "$2" = --format ]; then echo "$DOCKER_ROOT"; fi
    exit 0 ;;
  ps)
    cat "$STATE/docker_ps" 2>/dev/null
    exit 0 ;;
esac
echo "fake docker: not expected: $*" >&2
exit 1
`,
  // Installing a package makes the commands it provides appear, the way a real one would.
  "apt-get": String.raw`#!/bin/sh
printf '%s\n' "$*" >> "$STATE/apt.log"
verb=""; pkgs=""; skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case "$a" in
    -o) skip=1 ;;
    -*) ;;
    *) if [ -z "$verb" ]; then verb="$a"; else pkgs="$pkgs $a"; fi ;;
  esac
done
case "$verb" in
  update)
    if [ -f "$STATE/apt_update_fails" ]; then
      echo "E: The repository 'http://ppa.example.test jammy Release' is no longer signed." >&2
      exit 100
    fi
    exit 0 ;;
  install)
    if [ -f "$STATE/apt_install_fails" ]; then
      echo "E: Unable to locate package docker.io" >&2
      exit 100
    fi
    for p in $pkgs; do
      echo "$p" >> "$STATE/dpkg"
      case "$p" in
        git|curl|openssl|lsof|unzip) ln -sf "$FAKE_STASH/$p" "$FAKE_BIN/$p" ;;
        docker.io)
          ln -sf "$FAKE_STASH/docker" "$FAKE_BIN/docker"
          [ -f "$STATE/group_members" ] || echo "" > "$STATE/group_members"
          if [ -d "$FREEDUET_INSTALL_ROOT/run/systemd/system" ]; then echo up > "$STATE/daemon"; fi ;;
        docker-compose-v2)
          rm -f "$STATE/compose_missing"
          echo 2.40.3 > "$STATE/compose_version" ;;
      esac
    done
    exit 0 ;;
esac
exit 0
`,
  systemctl: String.raw`#!/bin/sh
printf '%s\n' "$*" >> "$STATE/systemctl.log"
if [ "$1 $2 $3" = "enable --now docker" ] && [ ! -f "$STATE/daemon_wont_start" ]; then echo up > "$STATE/daemon"; fi
exit 0
`,
  service: String.raw`#!/bin/sh
printf '%s\n' "$*" >> "$STATE/service.log"
if [ "$1 $2" = "docker start" ] && [ ! -f "$STATE/daemon_wont_start" ]; then echo up > "$STATE/daemon"; fi
exit 0
`,
  usermod: String.raw`#!/bin/sh
printf '%s\n' "$*" >> "$STATE/usermod.log"
if [ "$1 $2" = "-aG docker" ] && [ -f "$STATE/group_members" ]; then
  current="$(cat "$STATE/group_members")"
  if [ -z "$current" ]; then echo "$3" > "$STATE/group_members"; else echo "$current,$3" > "$STATE/group_members"; fi
  exit 0
fi
echo "usermod: group 'docker' does not exist" >&2
exit 6
`,
  sudo: String.raw`#!/bin/sh
printf 'FAKE-SUDO: %s\n' "$*"
printf '%s\n' "$*" >> "$STATE/sudo.log"
case "$1" in
  apt-get|env|install|systemctl|service|usermod) exec "$@" ;;
esac
echo "fake sudo: not on the whitelist: $1" >&2
exit 99
`,
  curl: String.raw`#!/bin/sh
printf '%s\n' "$*" >> "$STATE/curl.log"
out=""; prev=""
for a in "$@"; do
  if [ "$prev" = --output ]; then out="$a"; fi
  prev="$a"
done
if [ -f "$STATE/curl_fails" ]; then
  echo "curl: (22) The requested URL returned error: 404" >&2
  exit 22
fi
cp "$STATE/payload.zip" "$out"
`,
  unzip: String.raw`#!/bin/sh
printf '%s\n' "$*" >> "$STATE/unzip.log"
zip=""; dest=""; prev=""
for a in "$@"; do
  case "$a" in
    -*) ;;
    *) if [ "$prev" = -d ]; then dest="$a"; elif [ -z "$zip" ]; then zip="$a"; fi ;;
  esac
  prev="$a"
done
asset="$(head -n 1 "$zip")"
mkdir -p "$dest/$asset"
if [ ! -f "$STATE/unzip_empty" ]; then
  printf '#!/bin/sh\necho %s\n' "$(cat "$STATE/downloaded_bun_version")" > "$dest/$asset/bun"
  chmod 755 "$dest/$asset/bun"
fi
`,
  df: `#!/bin/sh
for a in "$@"; do path="$a"; done
case "$path" in
  "$FAKE_REPO"*) kb="$(cat "$STATE/df_checkout_kb")"; fs=fsA ;;
  *) kb="$(cat "$STATE/df_docker_kb")"; fs="$(cat "$STATE/df_docker_fs")" ;;
esac
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "$fs 999999999 1 $kb 1% /"
`,
  lsof: String.raw`#!/bin/sh
port=""
for a in "$@"; do
  case "$a" in -iTCP:*) port="$(printf '%s' "$a" | sed 's/^-iTCP://')" ;; esac
done
if [ -f "$STATE/busy" ]; then
  line="$(grep "^$port " "$STATE/busy" | head -n 1)"
  if [ -n "$line" ]; then
    printf 'p4242\nc%s\nn*:%s\n' "$(printf '%s' "$line" | cut -d' ' -f2)" "$port"
  fi
fi
exit 0
`,
};

const FAKE_START = String.raw`#!/bin/sh
printf 'cwd=%s args=%s knob=%s\n' "$PWD" "$#" "$FREEDUET_INSTALL_ROOT" > "$STATE/started"
echo "FAKE-START: ran"
exit "$(cat "$STATE/start_status")"
`;

const ubuntu = (version: string) =>
  `PRETTY_NAME="Ubuntu ${version} LTS"\nNAME="Ubuntu"\nVERSION_ID="${version}"\nVERSION="${version} LTS"\nID=ubuntu\nID_LIKE=debian\n`;

const DEBIAN =
  'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';

const ENV_EXAMPLE = [
  "DATABASE_URL=postgres://openbot:openbot@localhost:5432/openbot",
  "COMPOSE_PROJECT_NAME=freeduet",
  "# POSTGRES_PORT=5432",
  "FREEDUET_ROUTER=on",
  "BOT_PROVIDER=anthropic",
  "",
].join("\n");

type Scenario = {
  /** Programs that are not on the PATH at the start (`apt-get install` can bring them). */
  missing?: readonly string[];
  uid?: number;
  uname?: string;
  machine?: string;
  osRelease?: string;
  kernel?: string;
  avx2?: boolean;
  memoryKb?: number;
  checkoutKb?: number;
  /** Docker's data on another disk than the checkout, with this many KB free. */
  dockerKb?: number;
  composeVersion?: string | null;
  daemon?: "up" | "down";
  /** The Ubuntu package names `dpkg -s` knows. */
  dpkg?: readonly string[];
  /** Members of the docker group, or null when the group does not exist. */
  groupMembers?: string | null;
  /** What `id -nG` says in the terminal the installer runs in. */
  sessionGroups?: string;
  systemd?: boolean;
  dockerDesktop?: boolean;
  dockerErrorStyle?: "classic" | "api" | "odd" | "rootless";
  bunVersion?: string;
  downloadedBunVersion?: string;
  /** A Bun download whose bytes are not the ones the script's table was written for. */
  tamperedDownload?: boolean;
  pin?: string;
  envFile?: string | null;
  rootEnvFile?: string | null;
  startStatus?: number;
  withoutStartScript?: boolean;
  busy?: Record<number, string>;
  dockerPs?: string;
  environment?: Record<string, string>;
  /** apt_update_fails, apt_install_fails, curl_fails, daemon_wont_start, unzip_empty */
  flags?: readonly string[];
};

const READY = {
  missing: [] as readonly string[],
  uid: 1000,
  uname: "Linux",
  machine: "x86_64",
  osRelease: ubuntu("24.04"),
  kernel: "6.8.0-45-generic",
  avx2: true,
  memoryKb: 16_000_000,
  checkoutKb: 400 * GIB_KB,
  dockerKb: null as number | null,
  composeVersion: "2.40.3" as string | null,
  daemon: "up" as "up" | "down",
  dpkg: ["docker.io"] as readonly string[],
  groupMembers: "tester" as string | null,
  sessionGroups: "tester docker",
  systemd: true,
  dockerDesktop: false,
  dockerErrorStyle: "api" as "classic" | "api" | "odd" | "rootless",
  bunVersion: "1.4.3",
  downloadedBunVersion: "1.4.3",
  tamperedDownload: false,
  pin: "1.4.3",
  envFile: null as string | null,
  rootEnvFile: null as string | null,
  startStatus: 0,
  withoutStartScript: false,
  busy: {} as Record<number, string>,
  dockerPs: "",
  environment: {} as Record<string, string>,
  flags: [] as readonly string[],
};

type Result = { exitCode: number; stdout: string; stderr: string };

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function writeExecutable(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

async function snapshot(root: string): Promise<string[]> {
  const lines: string[] = [];
  for (const entry of (await readdir(root, { recursive: true })).sort()) {
    const path = join(root, entry);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      lines.push(`${entry} -> ${await readlink(path)}`);
    } else if (info.isDirectory()) {
      lines.push(`${entry}/`);
    } else {
      const digest = createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
      lines.push(`${entry} ${digest}`);
    }
  }
  return lines;
}

/**
 * The Bun release file is whatever bytes the fake curl hands over. The script holds the SHA-256 it
 * was written for, so a run that is meant to succeed rewrites that table to the bytes' own hash in a
 * copy of the script, and a run meant to be refused leaves the real one, which cannot match.
 */
async function build(overrides: Scenario = {}) {
  const o = { ...READY, ...overrides };
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "freeduet-install-")),
  );
  directories.push(dir);
  const [bin, stash, state, root, repo, home, tmp] = [
    "bin",
    "stash",
    "state",
    "root",
    "repo",
    "home",
    "tmp",
  ].map((name) => join(dir, name)) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  for (const directory of [bin, stash, state, home, tmp]) {
    await mkdir(directory, { recursive: true });
  }
  const put = (name: string, value: string) =>
    writeFile(join(state, name), `${value}\n`);

  await put("uid", String(o.uid));
  await put("uname_s", o.uname);
  await put("uname_m", o.machine);
  await put("session_groups", o.sessionGroups);
  await put("daemon", o.daemon);
  await put("compose_version", o.composeVersion ?? "");
  if (o.composeVersion === null) await put("compose_missing", "1");
  if (o.groupMembers !== null) await put("group_members", o.groupMembers);
  await put("dpkg", o.dpkg.join("\n"));
  await put("bun_version", o.bunVersion);
  await put("downloaded_bun_version", o.downloadedBunVersion);
  await put("docker_error_style", o.dockerErrorStyle);
  await put("df_checkout_kb", String(o.checkoutKb));
  await put("df_docker_kb", String(o.dockerKb ?? o.checkoutKb));
  await put("df_docker_fs", o.dockerKb === null ? "fsA" : "fsB");
  await put("start_status", String(o.startStatus));
  await put("docker_ps", o.dockerPs);
  await put(
    "busy",
    Object.entries(o.busy)
      .map(([port, command]) => `${port} ${command}`)
      .join("\n"),
  );
  for (const flag of o.flags) await put(flag, "1");

  const asset =
    o.machine === "aarch64"
      ? "bun-linux-aarch64"
      : o.avx2
        ? "bun-linux-x64"
        : "bun-linux-x64-baseline";
  const payload = Buffer.from(
    `${asset}\n${o.tamperedDownload ? "tampered" : "release"}-bytes\n`,
  );
  await writeFile(join(state, "payload.zip"), payload);
  const payloadHash = createHash("sha256").update(payload).digest("hex");

  for (const [path, contents] of [
    ["etc/os-release", o.osRelease],
    ["proc/sys/kernel/osrelease", `${o.kernel}\n`],
    [
      "proc/meminfo",
      `MemTotal:       ${o.memoryKb} kB\nMemFree:        1 kB\n`,
    ],
    [
      "proc/cpuinfo",
      `processor\t: 0\nflags\t\t: fpu sse sse2${o.avx2 ? " avx avx2" : ""}\n`,
    ],
  ] as const) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  await mkdir(join(root, "usr/local/bin"), { recursive: true });
  if (o.systemd)
    await mkdir(join(root, "run/systemd/system"), { recursive: true });

  for (const name of REAL_TOOLS) {
    const real = Bun.which(name);
    if (real) await symlink(real, join(bin, name));
  }
  for (const name of FAKE_TOOLS) {
    const target =
      name === "docker" && o.dockerDesktop
        ? join(stash, "docker-desktop", "docker")
        : join(stash, name);
    await writeExecutable(target, FAKES[name] ?? "#!/bin/sh\nexit 0\n");
    if (name === "docker" && o.dockerDesktop) {
      await writeExecutable(join(stash, "docker"), FAKES.docker as string);
    }
    if (!o.missing.includes(name)) await symlink(target, join(bin, name));
  }

  // The checkout: the script under test, the two it sources, a stand-in for start.sh.
  const scripts = join(repo, "openbot/scripts");
  await mkdir(scripts, { recursive: true });
  await mkdir(join(repo, "scripts"), { recursive: true });
  let installer = await readFile(realInstaller, "utf8");
  if (!o.tamperedDownload) {
    installer = installer.replace(
      /^(BUN_SHA256_[A-Z0-9_]+=)"[0-9a-f]{64}"$/gm,
      `$1"${payloadHash}"`,
    );
  }
  await writeExecutable(join(scripts, "install.sh"), installer);
  for (const name of ["require-bash.sh", "processes.sh"]) {
    await writeFile(
      join(scripts, name),
      await readFile(join(scriptsDirectory, name)),
    );
  }
  await writeFile(
    join(repo, "openbot/package.json"),
    `{\n  "name": "openbot",\n  "packageManager": "bun@${o.pin}",\n  "private": true\n}\n`,
  );
  await writeFile(join(repo, "openbot/.env.example"), ENV_EXAMPLE);
  if (o.envFile !== null)
    await writeFile(join(repo, "openbot/.env"), o.envFile);
  if (o.rootEnvFile !== null)
    await writeFile(join(repo, ".env"), o.rootEnvFile);
  if (!o.withoutStartScript) {
    await writeExecutable(join(repo, "scripts/start.sh"), FAKE_START);
  }
  await mkdir(join(home, ".claude"), { recursive: true });
  await writeFile(
    join(home, ".claude/credentials-canary"),
    "canary-login-token\n",
  );

  const environment: Record<string, string> = {
    PATH: bin,
    STATE: state,
    FAKE_STASH: stash,
    FAKE_BIN: bin,
    FAKE_REPO: repo,
    FREEDUET_INSTALL_ROOT: root,
    DOCKER_ROOT: join(root, "var/lib/docker"),
    HOME: home,
    TMPDIR: tmp,
    ...o.environment,
  };

  async function run(args: string[] = [], input?: string): Promise<Result> {
    const child = Bun.spawn({
      cmd: [bash, join(repo, "openbot/scripts/install.sh"), ...args],
      cwd: home,
      env: environment,
      stdin: input === undefined ? null : new Blob([input]),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  }

  async function log(name: string): Promise<string[]> {
    const text = await readFile(join(state, name), "utf8").catch(() => "");
    return text.split("\n").filter((line) => line.length > 0);
  }

  return {
    dir,
    repo,
    root,
    home,
    tmp,
    state,
    run,
    log,
    sudo: () => log("sudo.log"),
    started: () => readFile(join(state, "started"), "utf8").catch(() => ""),
    write: (name: string, value: string) => put(name, value),
    read: (path: string) => readFile(join(dir, path), "utf8"),
    snapshots: async () => ({
      repo: await snapshot(repo),
      root: await snapshot(root),
      bin: await snapshot(bin),
      home: await snapshot(home),
      tmp: await snapshot(tmp),
    }),
  };
}

/** What a failed assertion should show: the status and everything the run said. */
const outcome = (result: Result) => ({
  exitCode: result.exitCode,
  output: `${result.stdout}${result.stderr}`,
});

const UPDATE = "apt-get -o DPkg::Lock::Timeout=300 update";
const install = (...packages: string[]) =>
  `env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y ${packages.join(" ")}`;
const DOCKER_PACKAGES = ["docker.io", "docker-compose-v2", "docker-buildx"];
const BUN_URL = (asset: string) =>
  `https://github.com/oven-sh/bun/releases/download/bun-v1.4.3/${asset}.zip`;

describe("install.sh as a file", () => {
  test("is valid bash", async () => {
    const child = Bun.spawn({
      cmd: [bash, "-n", realInstaller],
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  });

  test("stops on the first error and on an unset variable", async () => {
    expect(await readFile(realInstaller, "utf8")).toMatch(
      /^set -euo pipefail$/m,
    );
  });

  test("holds the checksums of the Bun version the repository pins", async () => {
    const script = await readFile(realInstaller, "utf8");
    const pinned = (
      await readFile(join(scriptsDirectory, "..", "package.json"), "utf8")
    ).match(/"packageManager":\s*"bun@([0-9][0-9A-Za-z.+-]*)"/)?.[1];
    const table = script.match(/^BUN_TABLE_VERSION="([^"]+)"$/m)?.[1];
    const hashes = [
      ...script.matchAll(/^BUN_SHA256_[A-Z0-9_]+="([0-9a-f]{64})"$/gm),
    ].map((match) => match[1]);

    // When this fails after a Bun bump in openbot/package.json: take the three lines for the new version
    // from the release's SHASUMS256.txt and change the four values at the top of install.sh.
    expect(pinned).toBeDefined();
    expect(table).toBe(pinned as string);
    expect(hashes).toHaveLength(3);
    expect(new Set(hashes).size).toBe(3);
  });

  test("never mentions a Claude login or settings location", async () => {
    const script = await readFile(realInstaller, "utf8");
    for (const forbidden of [
      /\.claude/,
      /claude\.json/,
      /\.credentials/,
      /CLAUDE_CONFIG_DIR/,
      /\.config\/claude/i,
      /ANTHROPIC_API_KEY/,
      /\$\{?HOME\b/,
    ]) {
      expect(script).not.toMatch(forbidden);
    }
  });

  test("has no pipe into a shell, no eval, and reads no password", async () => {
    const code = (await readFile(realInstaller, "utf8"))
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    for (const forbidden of [
      /\|\s*(sudo\s+)?(ba|da)?sh\b/,
      /\beval\b/,
      /\bsudo\s+-S\b/,
      /SUDO_ASKPASS/,
      /\bread\s+-[a-z]*s/,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
  });
});

describe("refusals: nothing is installed and nothing is started", () => {
  async function refused(overrides: Scenario, args: string[] = []) {
    const machine = await build(overrides);
    const before = await machine.snapshots();
    const result = await machine.run(args, "y\n");
    expect(await machine.snapshots()).toEqual(before);
    expect(await machine.sudo()).toEqual([]);
    expect(await machine.log("apt.log")).toEqual([]);
    expect(await machine.log("curl.log")).toEqual([]);
    expect(await machine.started()).toBe("");
    return result;
  }

  test("root is refused, and the reason is given", async () => {
    const result = await refused({ uid: 0 });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Do not run this installer as root");
    expect(result.stderr).toContain("Why:");
  });

  test("macOS is pointed at the README", async () => {
    const result = await refused({ uname: "Darwin", machine: "arm64" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("this is macOS");
    expect(result.stderr).toContain("README.md");
  });

  test("Windows (Git Bash) is pointed at WSL and the README", async () => {
    const result = await refused({ uname: "MINGW64_NT-10.0-22631" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("this is Windows");
    expect(result.stderr).toContain("WSL 2");
  });

  test("an Ubuntu that has not had a test run is refused with its name", async () => {
    const result = await refused({ osRelease: ubuntu("20.04") });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("22.04 and 24.04 only");
    expect(result.stderr).toContain("Ubuntu 20.04 LTS");
  });

  test("another distribution is refused with its name", async () => {
    const result = await refused({ osRelease: DEBIAN });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Debian GNU/Linux 12 (bookworm)");
  });

  test("a 32-bit ARM computer is refused", async () => {
    const result = await refused({ machine: "armv7l" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("armv7l");
  });

  test("WSL 1 is refused, because it cannot run Docker", async () => {
    const result = await refused({ kernel: "4.4.0-19041-Microsoft" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("WSL 1");
    expect(result.stderr).toContain("wsl --set-version");
  });

  test("a folder that is not a FreeDuet checkout is refused", async () => {
    const result = await refused({ withoutStartScript: true });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("does not look like a FreeDuet checkout");
  });

  test("an option it does not know is refused with the usage", async () => {
    const result = await refused({}, ["--frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown option: --frobnicate");
    expect(result.stderr).toContain("Usage:");
  });

  test("Ubuntu 22.04 is accepted", async () => {
    const machine = await build({ osRelease: ubuntu("22.04") });
    const result = await machine.run(["--check"]);
    expect(outcome(result)).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain("Ubuntu 22.04");
  });
});

describe("--check changes nothing", () => {
  test(
    "on a machine with nothing installed it reports every gap and exits 2",
    async () => {
      const machine = await build({
        missing: ["git", "curl", "openssl", "lsof", "unzip", "bun", "docker"],
        dpkg: [],
        groupMembers: null,
      });
      const before = await machine.snapshots();

      const result = await machine.run(["--check"], "y\n");

      expect(result.exitCode).toBe(2);
      for (const gap of [
        "git",
        "curl",
        "openssl",
        "lsof",
        "unzip",
        "bun",
        "docker",
      ]) {
        expect(result.stdout).toMatch(new RegExp(`\\s${gap}\\s+MISSING`));
      }
      expect(result.stdout).toContain("Not ready yet");
      expect(await machine.snapshots()).toEqual(before);
      expect(await machine.sudo()).toEqual([]);
      expect(await machine.log("apt.log")).toEqual([]);
      expect(await machine.log("curl.log")).toEqual([]);
      expect(await machine.started()).toBe("");
    },
    slow,
  );

  test(
    "on a machine that is ready it says so, creates no .env and does not start",
    async () => {
      const machine = await build();
      const before = await machine.snapshots();

      const result = await machine.run(["--check"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain("Ready: FreeDuet can start now");
      expect(await machine.snapshots()).toEqual(before);
      expect(await machine.started()).toBe("");
    },
    slow,
  );

  test(
    "only reads Docker: no run, pull, build, up or down",
    async () => {
      const machine = await build({ dockerPs: "0.0.0.0:5432->5432/tcp" });

      await machine.run(["--check"]);

      const calls = await machine.log("docker.log");
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call).toMatch(
          /^(compose version --short|info( --format .*)?|ps --filter .*)$/,
        );
      }
    },
    slow,
  );

  test(
    "asks nothing, even with nothing to read the answer from",
    async () => {
      const machine = await build({ missing: ["git"] });

      const result = await machine.run(["--check"]);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).not.toContain("Go ahead");
    },
    slow,
  );

  test(
    "--help prints the usage and changes nothing",
    async () => {
      const machine = await build();
      const before = await machine.snapshots();

      const result = await machine.run(["--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage: bash openbot/scripts/install.sh");
      expect(await machine.snapshots()).toEqual(before);
    },
    slow,
  );
});

describe("nothing missing: install nothing and hand over to start.sh", () => {
  test(
    "no sudo, no apt, no download; start.sh runs in the checkout, without the test knob",
    async () => {
      const machine = await build();

      const result = await machine.run();

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain("FAKE-START: ran");
      expect(await machine.sudo()).toEqual([]);
      expect(await machine.log("apt.log")).toEqual([]);
      expect(await machine.log("curl.log")).toEqual([]);
      expect(await machine.started()).toBe(
        `cwd=${machine.repo} args=0 knob=\n`,
      );
    },
    slow,
  );

  test(
    "start.sh's own exit status is the installer's",
    async () => {
      const machine = await build({ startStatus: 7 });

      const result = await machine.run();

      expect(result.exitCode).toBe(7);
    },
    slow,
  );

  test(
    "a second and a third run change nothing either",
    async () => {
      const machine = await build();
      await machine.run();
      const afterFirst = await machine.snapshots();

      const second = await machine.run();
      const third = await machine.run();

      expect(outcome(second)).toMatchObject({ exitCode: 0 });
      expect(outcome(third)).toMatchObject({ exitCode: 0 });
      expect(await machine.snapshots()).toEqual(afterFirst);
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "creates openbot/.env from the example when there is none, private to the person",
    async () => {
      const machine = await build();

      await machine.run();

      expect(await machine.read("repo/openbot/.env")).toBe(ENV_EXAMPLE);
      expect(
        (await stat(join(machine.repo, "openbot/.env"))).mode & 0o777,
      ).toBe(0o600);
    },
    slow,
  );

  test(
    "leaves a .env that exists as it is, and prints nothing out of it",
    async () => {
      const env = "COMPUTER_TOKEN=canary-secret-value\nAPP_PORT=3011\n";
      const machine = await build({ envFile: env });

      const result = await machine.run();

      expect(await machine.read("repo/openbot/.env")).toBe(env);
      expect(result.stdout + result.stderr).not.toContain(
        "canary-secret-value",
      );
    },
    slow,
  );

  test(
    "a .env at the repository root counts, so openbot/.env is not made beside it",
    async () => {
      const machine = await build({ rootEnvFile: "APP_PORT=3011\n" });

      await machine.run();

      expect(await machine.read("repo/.env")).toBe("APP_PORT=3011\n");
      expect(
        await readFile(join(machine.repo, "openbot/.env"), "utf8").catch(
          () => "absent",
        ),
      ).toBe("absent");
    },
    slow,
  );

  test(
    "a Bun in another version is left alone and named, not replaced",
    async () => {
      const machine = await build({ bunVersion: "1.3.0" });

      const result = await machine.run();

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain(
        "1.3.0, not the 1.4.3 this repository pins",
      );
      expect(await machine.sudo()).toEqual([]);
      expect(await machine.log("curl.log")).toEqual([]);
    },
    slow,
  );

  test(
    "unzip is wanted only to unpack Bun, so a machine with Bun does not get it",
    async () => {
      const machine = await build({ missing: ["unzip"] });

      const result = await machine.run();

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "no sudo on the machine matters only when something has to be installed",
    async () => {
      const machine = await build({ missing: ["sudo"] });

      const result = await machine.run();

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
    },
    slow,
  );
});

describe("each missing tool triggers exactly its own install step", () => {
  for (const [tool, packageName] of [
    ["git", "git"],
    ["curl", "curl"],
    ["openssl", "openssl"],
    ["lsof", "lsof"],
  ] as const) {
    test(
      `${tool}: one apt install of ${packageName} and nothing else`,
      async () => {
        const machine = await build({ missing: [tool] });

        const result = await machine.run(["--yes"]);

        expect(outcome(result)).toMatchObject({ exitCode: 0 });
        expect(await machine.sudo()).toEqual([UPDATE, install(packageName)]);
        expect(await machine.log("curl.log")).toEqual([]);
        expect(await machine.log("systemctl.log")).toEqual([]);
        expect(await machine.log("usermod.log")).toEqual([]);
        expect(await machine.started()).not.toBe("");
      },
      slow,
    );
  }

  test(
    "Bun: one download of the pinned release, checked, then one install into /usr/local/bin",
    async () => {
      const machine = await build({ missing: ["bun"] });

      const result = await machine.run(["--yes"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      const calls = await machine.sudo();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatch(
        new RegExp(
          `^install -m 0755 \\S+/unpacked/bun-linux-x64/bun ${machine.root}/usr/local/bin/bun$`,
        ),
      );
      const downloads = await machine.log("curl.log");
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toContain("--proto =https");
      expect(downloads[0]).toContain("--tlsv1.2");
      expect(downloads[0]?.endsWith(BUN_URL("bun-linux-x64"))).toBe(true);
      expect(result.stdout).toContain("The SHA-256 matches");
      expect(
        await readFile(join(machine.root, "usr/local/bin/bun"), "utf8"),
      ).toContain("echo 1.4.3");
      expect(await machine.started()).not.toBe("");
    },
    slow,
  );

  test(
    "Bun leaves no temporary folder behind",
    async () => {
      const machine = await build({ missing: ["bun"] });

      await machine.run(["--yes"]);

      expect(await snapshot(machine.tmp)).toEqual([]);
    },
    slow,
  );

  test(
    "Bun and unzip both missing: unzip first, then Bun",
    async () => {
      const machine = await build({ missing: ["bun", "unzip"] });

      const result = await machine.run(["--yes"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      const calls = await machine.sudo();
      expect(calls.slice(0, 2)).toEqual([UPDATE, install("unzip")]);
      expect(calls[2]).toMatch(/^install -m 0755 /);
      expect(calls).toHaveLength(3);
    },
    slow,
  );

  for (const [name, scenario, asset] of [
    ["an ARM computer", { machine: "aarch64" }, "bun-linux-aarch64"],
    [
      "an Intel/AMD computer without AVX2",
      { avx2: false },
      "bun-linux-x64-baseline",
    ],
  ] as const) {
    test(
      `Bun on ${name} is the ${asset} build`,
      async () => {
        const machine = await build({ missing: ["bun"], ...scenario });

        const result = await machine.run(["--yes"]);

        expect(outcome(result)).toMatchObject({ exitCode: 0 });
        const downloads = await machine.log("curl.log");
        expect(downloads[0]?.endsWith(BUN_URL(asset))).toBe(true);
      },
      slow,
    );
  }

  test(
    "Docker missing: Ubuntu's three packages, the service, the group, then a re-login",
    async () => {
      const machine = await build({
        missing: ["docker"],
        dpkg: [],
        groupMembers: null,
        composeVersion: null,
        sessionGroups: "tester",
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(3);
      expect(await machine.sudo()).toEqual([
        UPDATE,
        install(...DOCKER_PACKAGES),
        "systemctl enable --now docker",
        "usermod -aG docker tester",
      ]);
      expect(result.stdout).toContain("Log out of Ubuntu and log in again");
      expect(await machine.started()).toBe("");
    },
    slow,
  );

  test(
    "after the re-login a second run installs nothing and starts FreeDuet",
    async () => {
      const machine = await build({
        missing: ["docker"],
        dpkg: [],
        groupMembers: null,
        composeVersion: null,
        sessionGroups: "tester",
      });
      await machine.run(["--yes"]);
      const callsAfterInstall = await machine.sudo();
      const appsAfterInstall = await machine.log("apt.log");

      await machine.write("session_groups", "tester docker");
      const second = await machine.run();

      expect(outcome(second)).toMatchObject({ exitCode: 0 });
      expect(await machine.sudo()).toEqual(callsAfterInstall);
      expect(await machine.log("apt.log")).toEqual(appsAfterInstall);
      expect(await machine.started()).not.toBe("");
    },
    slow,
  );

  test(
    "everything missing at once: one apt run, then Bun, the service, the group",
    async () => {
      const machine = await build({
        missing: ["git", "curl", "openssl", "lsof", "unzip", "bun", "docker"],
        dpkg: [],
        groupMembers: null,
        composeVersion: null,
        sessionGroups: "tester",
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(3);
      const calls = await machine.sudo();
      expect(calls.slice(0, 2)).toEqual([
        UPDATE,
        install("git", "curl", "openssl", "lsof", "unzip", ...DOCKER_PACKAGES),
      ]);
      expect(calls[2]).toMatch(/^install -m 0755 \S+\/bun-linux-x64\/bun /);
      expect(calls.slice(3)).toEqual([
        "systemctl enable --now docker",
        "usermod -aG docker tester",
      ]);
      expect(await machine.log("curl.log")).toHaveLength(1);
    },
    slow,
  );

  test(
    "Docker without systemd (WSL 2 with systemd off): the packages go in, then the installer stops at the start, says why, and runs no service command",
    async () => {
      const machine = await build({
        missing: ["docker"],
        dpkg: [],
        groupMembers: null,
        composeVersion: null,
        sessionGroups: "tester",
        systemd: false,
        kernel: "5.15.153.1-microsoft-standard-WSL2",
      });

      const result = await machine.run(["--yes"]);

      // Ubuntu's docker.io ships no service script, so `service docker start` cannot start it here.
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("does not run systemd");
      expect(result.stderr).toContain("The Docker service is not running");
      expect(result.stderr).toContain("wsl --shutdown");
      expect(await machine.sudo()).toEqual([
        UPDATE,
        install(...DOCKER_PACKAGES),
      ]);
      expect(await machine.log("service.log")).toEqual([]);
      expect(await machine.log("systemctl.log")).toEqual([]);
      expect(await machine.log("usermod.log")).toEqual([]);
      expect(await machine.started()).toBe("");
    },
    slow,
  );

  test(
    "Ubuntu's Docker without its Compose plugin: only the plugin and buildx",
    async () => {
      const machine = await build({ composeVersion: null });

      const result = await machine.run(["--yes"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(await machine.sudo()).toEqual([
        UPDATE,
        install("docker-compose-v2", "docker-buildx"),
      ]);
    },
    slow,
  );

  test(
    "a Compose older than 2.24.0 counts as missing",
    async () => {
      const machine = await build({ composeVersion: "2.20.0" });

      const result = await machine.run(["--yes"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(await machine.sudo()).toEqual([
        UPDATE,
        install("docker-compose-v2", "docker-buildx"),
      ]);
    },
    slow,
  );

  test(
    "a Docker that did not come from Ubuntu is not changed when Compose is missing",
    async () => {
      const machine = await build({ composeVersion: null, dpkg: [] });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("I will not change it");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "a stopped Docker service is started, and only that",
    async () => {
      const machine = await build({ daemon: "down" });

      const result = await machine.run(["--yes"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(await machine.sudo()).toEqual(["systemctl enable --now docker"]);
    },
    slow,
  );

  test(
    "a stopped Docker service is recognised in the older wording too",
    async () => {
      const machine = await build({
        daemon: "down",
        dockerErrorStyle: "classic",
      });

      const result = await machine.run(["--yes"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(await machine.sudo()).toEqual(["systemctl enable --now docker"]);
    },
    slow,
  );

  test(
    "a stopped service and a missing group are both said, and both fixed, in that order",
    async () => {
      const machine = await build({
        daemon: "down",
        groupMembers: "",
        sessionGroups: "tester",
      });

      const check = await machine.run(["--check"]);
      const result = await machine.run(["--yes"]);

      expect(check.exitCode).toBe(2);
      expect(check.stdout).toContain(
        "the Docker service is not running; your account is not in the docker group",
      );
      expect(result.exitCode).toBe(3);
      expect(await machine.sudo()).toEqual([
        "systemctl enable --now docker",
        "usermod -aG docker tester",
      ]);
    },
    slow,
  );

  test(
    "an answer it does not recognise is reported as it is, with nothing run",
    async () => {
      const machine = await build({ daemon: "down", dockerErrorStyle: "odd" });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "something this installer has never seen",
      );
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "a DOCKER_HOST that points elsewhere is not this machine's service to start",
    async () => {
      const machine = await build({
        daemon: "down",
        environment: { DOCKER_HOST: "tcp://build-host.example.test:2375" },
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("DOCKER_HOST is set");
      expect(result.stderr).not.toContain("build-host.example.test");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "a refusal about another socket (rootless, remote) is reported, not answered with systemctl",
    async () => {
      const machine = await build({
        daemon: "down",
        dockerErrorStyle: "rootless",
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("/run/user/1000/docker.sock");
      expect(await machine.sudo()).toEqual([]);
      expect(await machine.log("systemctl.log")).toEqual([]);
    },
    slow,
  );

  test(
    "not in the docker group: usermod, and then the person logs in again",
    async () => {
      // The group exists and has no members yet.
      const machine = await build({
        groupMembers: "",
        sessionGroups: "tester",
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(3);
      expect(await machine.sudo()).toEqual(["usermod -aG docker tester"]);
      expect(await machine.started()).toBe("");
    },
    slow,
  );

  test(
    "in the group but in a terminal that does not know yet: no sudo, only the way to log in again",
    async () => {
      const machine = await build({
        groupMembers: "tester",
        sessionGroups: "tester",
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(3);
      expect(await machine.sudo()).toEqual([]);
      expect(result.stdout).toContain("newgrp docker");
    },
    slow,
  );

  test(
    "a refusal that a new login cannot explain is reported, and not worked around with sudo",
    async () => {
      // The group file and the terminal agree that the account is a member, and Docker still refuses.
      const machine = await build({ flags: ["docker_denies"] });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("although you are in the docker group");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "Docker Desktop that is not running is not replaced by an install",
    async () => {
      const machine = await build({
        dockerDesktop: true,
        daemon: "down",
        kernel: "5.15.153.1-microsoft-standard-WSL2",
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Docker Desktop");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "a service that will not start is reported after a bounded wait",
    async () => {
      const machine = await build({
        daemon: "down",
        flags: ["daemon_wont_start"],
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("still does not answer");
      expect(await machine.log("sleep.log")).toHaveLength(20);
    },
    slow,
  );
});

describe("nothing needs sudo until the person has said yes", () => {
  const needsDocker = {
    missing: ["docker"] as const,
    dpkg: [] as const,
    groupMembers: null,
    composeVersion: null,
    sessionGroups: "tester",
  };

  test(
    "the plan lists every sudo command before the question",
    async () => {
      const machine = await build(needsDocker);

      const result = await machine.run([], "n\n");
      const question = result.stdout.indexOf("Go ahead and install these?");

      expect(question).toBeGreaterThan(-1);
      const plan = result.stdout.slice(0, question);
      expect(plan).toContain(
        `$ sudo apt-get install -y ${DOCKER_PACKAGES.join(" ")}`,
      );
      expect(plan).toContain("$ sudo systemctl enable --now docker");
      expect(plan).toContain("$ sudo usermod -aG docker tester");
    },
    slow,
  );

  test(
    "no answer: nothing changed",
    async () => {
      const machine = await build(needsDocker);
      const before = await machine.snapshots();

      const result = await machine.run([]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Nothing was changed");
      expect(await machine.sudo()).toEqual([]);
      expect(await machine.log("apt.log")).toEqual([]);
      expect(await machine.snapshots()).toEqual(before);
    },
    slow,
  );

  test(
    "a no: nothing changed",
    async () => {
      const machine = await build(needsDocker);

      const result = await machine.run([], "n\n");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Nothing was changed");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "anything but a yes is a no",
    async () => {
      const machine = await build(needsDocker);

      const result = await machine.run([], "maybe\n");

      expect(result.exitCode).toBe(1);
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "a yes: the question comes before the first sudo",
    async () => {
      const machine = await build({ missing: ["git"] });

      const result = await machine.run([], "y\n");

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      const question = result.stdout.indexOf("Go ahead and install these?");
      const firstSudo = result.stdout.indexOf("FAKE-SUDO:");
      expect(question).toBeGreaterThan(-1);
      expect(firstSudo).toBeGreaterThan(question);
      expect(await machine.sudo()).toEqual([UPDATE, install("git")]);
    },
    slow,
  );

  test(
    "the plan explains each package it installs and no other",
    async () => {
      const machine = await build({ missing: ["git", "lsof"] });

      // -y is --yes.
      const result = await machine.run(["-y"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain("git: to update FreeDuet later");
      expect(result.stdout).toContain(
        "lsof: start.sh uses it to see which program holds a port",
      );
      expect(result.stdout).not.toContain("openssl:");
      expect(result.stdout).not.toContain("docker.io:");
    },
    slow,
  );

  test(
    "--yes skips the question, says so, and still prints the plan first",
    async () => {
      const machine = await build({ missing: ["git"] });

      const result = await machine.run(["--yes"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).not.toContain("Go ahead and install these?");
      expect(result.stdout).toContain(
        "--yes given: going ahead without asking",
      );
      expect(
        result.stdout.indexOf("$ sudo apt-get install -y git"),
      ).toBeLessThan(result.stdout.indexOf("FAKE-SUDO:"));
    },
    slow,
  );

  test(
    "with nothing to install there is no question at all",
    async () => {
      const machine = await build();

      const result = await machine.run();

      expect(result.stdout).not.toContain("Go ahead");
      expect(outcome(result)).toMatchObject({ exitCode: 0 });
    },
    slow,
  );

  test(
    "something to install and no sudo: it says so before changing anything",
    async () => {
      const machine = await build({ missing: ["git", "sudo"] });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("sudo is not installed");
      expect(await machine.log("apt.log")).toEqual([]);
    },
    slow,
  );
});

describe("downloads are verified before anything is unpacked or installed", () => {
  test(
    "a wrong checksum stops the install, and names both values",
    async () => {
      const machine = await build({ missing: ["bun"], tamperedDownload: true });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "does not match the checksum written in this script",
      );
      expect(result.stderr).toMatch(/expected [0-9a-f]{64}/);
      expect(result.stderr).toMatch(/got +[0-9a-f]{64}/);
      expect(await machine.sudo()).toEqual([]);
      expect(await machine.log("unzip.log")).toEqual([]);
      expect(
        await readFile(join(machine.root, "usr/local/bin/bun")).catch(
          () => "absent",
        ),
      ).toBe("absent");
      expect(await machine.started()).toBe("");
      expect(await snapshot(machine.tmp)).toEqual([]);
    },
    slow,
  );

  test(
    "a download that fails stops with the next step, and installs nothing",
    async () => {
      const machine = await build({ missing: ["bun"], flags: ["curl_fails"] });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Could not download Bun");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "a download without the program inside is not installed",
    async () => {
      const machine = await build({ missing: ["bun"], flags: ["unzip_empty"] });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("did not contain");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "a download that runs as another version is not installed",
    async () => {
      const machine = await build({
        missing: ["bun"],
        downloadedBunVersion: "1.2.9",
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('says it is version "1.2.9"');
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "when the repository pins a Bun the script has no checksum for, nothing is downloaded",
    async () => {
      const machine = await build({ missing: ["bun"], pin: "1.5.0" });
      const before = await machine.snapshots();

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("only knows the checksums of Bun 1.4.3");
      expect(await machine.log("curl.log")).toEqual([]);
      expect(await machine.sudo()).toEqual([]);
      expect(await machine.snapshots()).toEqual(before);
    },
    slow,
  );

  test(
    "a pinned Bun the script knows nothing about does not matter when Bun is already there",
    async () => {
      const machine = await build({ pin: "1.5.0", bunVersion: "1.5.0" });

      const result = await machine.run();

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
    },
    slow,
  );
});

describe("disk, memory and ports are checked before anything is changed", () => {
  test(
    "too little disk (the disk with Docker's data and the checkout) stops it",
    async () => {
      const machine = await build({ missing: ["git"], checkoutKb: 9 * GIB_KB });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/disk\s+STOP\s+9 GB free/);
      expect(result.stderr).toContain("--ignore-resources");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "--ignore-resources goes on, and says it is going on anyway",
    async () => {
      const machine = await build({ missing: ["git"], checkoutKb: 9 * GIB_KB });

      const result = await machine.run(["--yes", "--ignore-resources"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain("Going on because of --ignore-resources");
      expect(await machine.sudo()).toEqual([UPDATE, install("git")]);
    },
    slow,
  );

  test(
    "Docker's data on another disk is counted on its own",
    async () => {
      const machine = await build({
        dockerKb: 5 * GIB_KB,
        checkoutKb: 100 * GIB_KB,
      });

      const result = await machine.run();

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(
        /disk\s+STOP\s+5 GB free on the disk with Docker's data/,
      );
    },
    slow,
  );

  test(
    "between the minimum and the recommendation it warns and goes on",
    async () => {
      const machine = await build({ checkoutKb: 15 * GIB_KB });

      const result = await machine.run();

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toMatch(/disk\s+LOW\s+15 GB free/);
    },
    slow,
  );

  test(
    "too little memory stops it",
    async () => {
      const machine = await build({ memoryKb: 2_000_000 });

      const result = await machine.run();

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/memory\s+STOP\s+1953 MiB/);
      expect(await machine.started()).toBe("");
    },
    slow,
  );

  test(
    "memory between the minimum and the recommendation warns and goes on",
    async () => {
      const machine = await build({ memoryKb: 5_000_000 });

      const result = await machine.run();

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toMatch(/memory\s+LOW\s+4882 MiB/);
    },
    slow,
  );

  test(
    "--check reports a shortage as not ready",
    async () => {
      const machine = await build({ memoryKb: 2_000_000 });

      const result = await machine.run(["--check"]);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain("memory     STOP");
    },
    slow,
  );

  test(
    "a stranger on a port FreeDuet uses stops it before any change",
    async () => {
      const machine = await build({
        missing: ["git"],
        busy: { 4100: "nginx" },
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(
        "port 4100 (the Bot computer, COMPUTER_PORT) is in use by nginx",
      );
      expect(result.stderr).toContain("A port FreeDuet needs cannot be used");
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "the app's and the server's ports are left to start.sh, which tells its own from a stranger",
    async () => {
      const machine = await build({ busy: { 3010: "node", 3001: "bun" } });

      const result = await machine.run();

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain("FAKE-START: ran");
    },
    slow,
  );

  test(
    "this FreeDuet's own database container on 5432 is not a clash; a stranger there is",
    async () => {
      const own = await build({
        busy: { 5432: "docker-proxy" },
        dockerPs: "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp",
      });
      const stranger = await build({ busy: { 5432: "docker-proxy" } });

      expect(outcome(await own.run())).toMatchObject({ exitCode: 0 });
      const result = await stranger.run();
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(
        "port 5432 (the database, POSTGRES_PORT)",
      );
    },
    slow,
  );

  test(
    "a port moved in .env is the one that is checked",
    async () => {
      const machine = await build({
        envFile: "COMPUTER_PORT=4101\n",
        busy: { 4100: "nginx" },
      });

      expect(outcome(await machine.run())).toMatchObject({ exitCode: 0 });

      const moved = await build({
        envFile: "COMPUTER_PORT=4101\n",
        busy: { 4101: "nginx" },
      });
      expect((await moved.run()).exitCode).toBe(1);
    },
    slow,
  );

  test(
    "the built-in Bot's port counts only when .env does not use Anthropic",
    async () => {
      const anthropic = await build({ busy: { 4200: "node" } });
      const other = await build({
        envFile: "BOT_PROVIDER=openai\n",
        busy: { 4200: "node" },
      });

      expect(outcome(await anthropic.run())).toMatchObject({ exitCode: 0 });
      const result = await other.run();
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("port 4200");
    },
    slow,
  );

  test(
    "a setting that is not a port number is named, and its value is not repeated",
    async () => {
      const machine = await build({ envFile: "COMPUTER_PORT=zzzzz\n" });

      const result = await machine.run();

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(
        "COMPUTER_PORT in your .env is not a port number",
      );
      expect(result.stdout + result.stderr).not.toContain("zzzzz");
    },
    slow,
  );

  test(
    "without lsof the ports are not checked, and --check says it is not ready",
    async () => {
      const machine = await build({ missing: ["lsof"] });

      const result = await machine.run(["--check"]);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain("not checked: lsof is missing");
    },
    slow,
  );
});

describe("WSL 2", () => {
  test(
    "is detected, and what differs is said",
    async () => {
      const machine = await build({
        kernel: "5.15.153.1-microsoft-standard-WSL2",
      });

      const result = await machine.run(["--check"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain("inside WSL 2");
      expect(result.stdout).toContain("/etc/wsl.conf");
      expect(result.stdout).toContain("not under /mnt/c");
    },
    slow,
  );
});

describe("failures say what happened and what to do", () => {
  test(
    "a failed apt install names the command and the usual cause, and goes no further",
    async () => {
      const machine = await build({
        missing: ["git", "bun"],
        flags: ["apt_install_fails"],
      });

      const result = await machine.run(["--yes"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "That command failed: sudo env DEBIAN_FRONTEND=noninteractive apt-get",
      );
      expect(result.stderr).toContain("universe");
      expect(await machine.log("curl.log")).toEqual([]);
      expect(await machine.started()).toBe("");
    },
    slow,
  );

  test(
    "a failed apt update (a stale third-party source) does not stop the install",
    async () => {
      const machine = await build({
        missing: ["git"],
        flags: ["apt_update_fails"],
      });

      const result = await machine.run(["--yes"]);

      expect(outcome(result)).toMatchObject({ exitCode: 0 });
      expect(result.stdout).toContain("apt-get update reported a problem");
      expect(await machine.sudo()).toEqual([UPDATE, install("git")]);
    },
    slow,
  );

  test(
    "a sudo that refuses is reported as the person's to resolve",
    async () => {
      const machine = await build({
        missing: ["git"],
        flags: ["apt_install_fails"],
      });

      const result = await machine.run(["--yes"]);

      expect(result.stderr).toContain("ask whoever administers this computer");
      expect(result.stderr).toContain(
        "running this again picks up where it stopped",
      );
    },
    slow,
  );
});

describe("what it never touches", () => {
  test(
    "the Claude sign-in directory in the home folder is neither read nor changed",
    async () => {
      const machine = await build({
        missing: ["git", "bun", "docker"],
        dpkg: [],
        groupMembers: null,
        composeVersion: null,
        sessionGroups: "tester",
      });
      const before = await machine.snapshots();

      const result = await machine.run(["--yes"]);

      expect(result.stdout + result.stderr).not.toContain("canary-login-token");
      expect((await machine.snapshots()).home).toEqual(before.home);
    },
    slow,
  );

  test(
    "no credential is read or written: the secrets of an existing .env are not in the output and the file is unchanged",
    async () => {
      const env =
        "COMPUTER_TOKEN=canary-secret-value\nDATABASE_URL=postgres://u:canary-db-password@localhost/db\n";
      const machine = await build({ envFile: env, missing: ["git"] });

      const result = await machine.run(["--yes"]);

      expect(await machine.read("repo/openbot/.env")).toBe(env);
      expect(result.stdout + result.stderr).not.toContain(
        "canary-secret-value",
      );
      expect(result.stdout + result.stderr).not.toContain("canary-db-password");
    },
    slow,
  );
});
