import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * FreeDuet (docs/M1_PLAN.md D28): the installation secret every fixture `.env` already holds, so the
 * tests that are about something else never meet a start that has to make one (which restarts the
 * server). The tests about the secret itself leave it out with `omitFromEnv`.
 */
const FIXTURE_INSTALL_SECRET = "ab".repeat(32);

async function writeExecutable(path: string, contents: string) {
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

/**
 * How this run differs from the ordinary one, which is the whole vocabulary these tests need.
 *
 * `shell` IS A PARAMETER BECAUSE THE INVOCATION IS PART OF WHAT IS UNDER TEST. `bash` is the
 * supported one and the one the docs name; `sh` is the one somebody reaches for out of habit, and
 * what it produced was exit 1 with no output at all.
 *
 * `omitFromEnv` IS THE OTHER HALF. Every key below has a default in the script, so a `.env` without
 * one is an ordinary `.env` rather than a broken one — `.env.example` does not list `APP_PORT` at
 * all.
 */
type Run = {
  script?: "start" | "stop" | "open";
  /** Arguments after the script's name (`scripts/open.sh --print`). */
  args?: readonly string[];
  worker?: "own" | "other";
  server?: "own" | "other";
  serverStops?: boolean;
  runningComputerToken?: string;
  computerStamp?: "current" | "missing" | "previous-process";
  repeatStart?: boolean;
  shell?: "bash" | "sh";
  omitFromEnv?: readonly string[];
  settings?: Record<string, string>;
  processEnvironment?: Record<string, string>;
  unavailableHealthPorts?: readonly number[];
  /**
   * FreeDuet: the settings file the run is for. Anything but `.env` is a second stack (the eval
   * stack's `.env.eval`) started with OPENBOT_ENV_FILE; `.env` then holds the person's own settings,
   * which that run must leave exactly as they are.
   */
  envFile?: string;
  /** Nothing holds the server's port until this run launches its own server there. */
  portFree?: boolean;
  /**
   * What the server reports. `intelligence` is a licence-valid fixture; `sse` is FREEDUET_INTELLIGENCE=off
   * (#42), which sends no licence, so the CopilotKit info route has no `licenseStatus` at all.
   */
  runtime?: "intelligence" | "sse";
};

async function runStartWithStaleServerProbe(
  status: 400 | 401 | 404,
  {
    script = "start",
    args = [],
    worker = "own",
    server = "own",
    serverStops = true,
    runningComputerToken,
    computerStamp = "current",
    repeatStart = false,
    shell = "bash",
    omitFromEnv = [],
    settings = {},
    processEnvironment = {},
    unavailableHealthPorts = [],
    envFile = ".env",
    portFree = false,
    runtime = "intelligence",
  }: Run = {},
) {
  const root =
    await Bun.$`mktemp -d ${tmpdir()}/openbot-start-guard-XXXXXX`.text();
  const directory = await realpath(root.trim());
  const fakeBin = join(directory, "bin");
  const scripts = join(directory, "scripts");
  const logPath = join(directory, "signals.log");
  const dockerLogPath = join(directory, "docker.log");
  const curlLogPath = join(directory, "curl.log");
  // FreeDuet (D28): what the fakes record about the installation secret. The config files curl was
  // handed (-K), the programs asked to open an address, and every child that was given the secret in
  // its environment.
  const curlConfigLogPath = join(directory, "curl-config.log");
  const browserLogPath = join(directory, "browser.log");
  const leakLogPath = join(directory, "leak.log");
  // Whether this file system keeps permission bits at all (a Windows drive mounted into WSL does
  // not): a mode is only asserted where it can be read back.
  const modeProbe = join(directory, "mode-probe");
  await writeFile(modeProbe, "");
  await chmod(modeProbe, 0o600);
  const modesSupported = ((await stat(modeProbe)).mode & 0o777) === 0o600;
  await mkdir(fakeBin, { recursive: true });
  await mkdir(scripts, { recursive: true });
  await mkdir(join(directory, "server"));
  await mkdir(join(directory, ".logs"));
  const storedToken = (settings.COMPUTER_TOKEN ?? "computer-token")
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
  const runtimeToken = runningComputerToken ?? storedToken;
  await writeFile(join(directory, "server-computer-token"), runtimeToken);
  if (computerStamp !== "missing") {
    const fingerprint = createHash("sha256").update(runtimeToken).digest("hex");
    await writeFile(
      join(directory, ".logs/server-computer.state"),
      `v1\n${fingerprint}\n91000001\n${computerStamp === "previous-process" ? "previous-start" : "fixture-start"}\n`,
    );
  }
  await writeFile(
    join(directory, "bash-env"),
    `kill() {
  printf '%s\\n' "$*" >> "$SIGNAL_LOG"
  if [ "$SERVER_STOPS" = 1 ]; then
    case "$1" in 91000001|91000002) : > "$SERVER_STOPPED" ;; esac
  fi
}\n`,
  );
  const environment = [
    "APP_PORT=3010",
    "SERVER_PORT=3001",
    "COMPUTER_PORT=4100",
    "BOT_PORT=4200",
    "LANGGRAPH_PORT=4201",
    "SUPERVISOR_PORT=4500",
    "SUPERVISOR_TOKEN=supervisor-token",
    "COMPUTER_TOKEN=computer-token",
    "WORKER_SHARED_SECRET=worker-secret",
    "MANAGED_AGENT_TOKEN=managed-token",
    "AGENT_TOOL_TOKEN=agent-tool-token",
    "MANAGED_AGENT_AG_UI_URL=http://localhost:4201/ag-ui",
    "OPENBOT_ONE_COMPUTER_EACH=true",
    "DATABASE_URL=postgres://openbot:openbot@localhost:5432/openbot",
    // FreeDuet: start.sh generates this key once and points the server's own model calls at it.
    "FREEDUET_LOCAL_KEY=freeduet-local-key",
    "ANTHROPIC_API_KEY=freeduet-local-key",
    // FreeDuet (#42): start.sh writes it when missing, and restarts the server to pick it up.
    "FREEDUET_INTELLIGENCE=off",
    // FreeDuet (D28): made once by start.sh, and a start that has to make it restarts the server.
    `FREEDUET_INSTALL_SECRET=${FIXTURE_INSTALL_SECRET}`,
  ].filter(
    (line) =>
      ![...omitFromEnv, ...Object.keys(settings)].some((key) =>
        line.startsWith(`${key}=`),
      ),
  );
  environment.push(
    ...Object.entries(settings).map(([key, value]) => `${key}=${value}`),
  );
  await writeFile(join(directory, envFile), `${environment.join("\n")}\n`);
  const initialEnvironment = `${environment.join("\n")}\n`;
  if (envFile !== ".env")
    await writeFile(join(directory, ".env"), "PERSON=untouched\n");
  await writeFile(
    join(scripts, `${script}.sh`),
    await readFile(`scripts/${script}.sh`),
  );
  await chmod(join(scripts, `${script}.sh`), 0o755);
  // Copied beside it because `start.sh` sources it by its own directory, so a temp root without it
  // would fail on a missing file rather than on whatever the test is about.
  await writeFile(
    join(scripts, "require-bash.sh"),
    await readFile("scripts/require-bash.sh"),
  );
  await writeFile(
    join(scripts, "processes.sh"),
    await readFile("scripts/processes.sh"),
  );
  // FreeDuet (D28): start.sh hands a browser to this one when it has just made the installation secret.
  await writeExecutable(
    join(scripts, "open.sh"),
    await readFile("scripts/open.sh"),
  );

  // The programs that could open an address on a real machine. Each one records the call and fails, so
  // a run that reaches one is seen and no window ever opens; `fake-browser` is the one that is named
  // through BROWSER, and the one a test lets succeed.
  for (const name of [
    "wslview",
    "xdg-open",
    "open",
    "explorer.exe",
    "cmd.exe",
  ]) {
    await writeExecutable(
      join(fakeBin, name),
      `#!/usr/bin/env bash\nprintf 'UNEXPECTED ${name} %s\\n' "$*" >> "$BROWSER_LOG"\nexit 1\n`,
    );
  }
  await writeExecutable(
    join(fakeBin, "fake-browser"),
    `#!/usr/bin/env bash
printf 'fake-browser %s\\n' "$*" >> "$BROWSER_LOG"
if [ "\${OPENER:-works}" = fails ]; then exit 1; fi
exit 0
`,
  );

  await writeExecutable(
    join(fakeBin, "lsof"),
    `#!/usr/bin/env bash
if [ "$1" = -a ]; then
  case "$3" in
    91000003) printf 'n%s/other/server\\n' "$STACK_ROOT" ;;
    91000005)
      if [ "$WORKER_OWNER" = own ] || [ -f "$WORKER_STARTED" ]; then
        printf 'n%s\\n' "$STACK_ROOT"
      else
        printf 'n%s/other\\n' "$STACK_ROOT"
      fi ;;
    *) printf 'n%s/server\\n' "$STACK_ROOT" ;;
  esac
elif [ "$PORT_FREE" = 1 ] && [ ! -f "$SERVER_STARTED" ]; then
  :
elif [ "$STOP_ONLY" != 1 ] && [ "$1" = -t ]; then
  if [ -f "$SERVER_STARTED" ]; then echo 91000006
  elif [ "$SERVER_OWNER" = own ]; then echo 91000001
  else echo 91000003; fi
elif [ "$STOP_ONLY" != 1 ]; then
  printf 'p123\\ncbun\\nn*:3001\\n'
fi
`,
  );
  // The two answers the server gives start.sh: the CopilotKit runtime's info (`licenseStatus` only with
  // Intelligence) and OpenBot's own capabilities (`durableHistory` in both modes, which is what
  // identifies it).
  const runtimeInfo =
    runtime === "sse"
      ? '{"version":"test","mode":"sse","agents":{"analyst":{}},"threadEndpoints":{"list":true}}'
      : '{"licenseStatus":"valid","mode":"test","agents":{"analyst":{}}}';
  const capabilities =
    runtime === "sse"
      ? '{"mode":"local","durableHistory":true}'
      : '{"mode":"intelligence","durableHistory":true}';
  await writeExecutable(
    join(fakeBin, "curl"),
    `#!/usr/bin/env bash
args="$*"
printf '%s\\n' "$args" >> "$CURL_LOG"
# FreeDuet (D28): what a -K config file held at the moment of the call and how it was protected, as
# one line: its mode, its path, what it held, then the whole command line. Only the person's own calls
# (curl as the person, scripts/open.sh) hand curl one.
prev=""
for arg in "$@"; do
  if [ "$prev" = -K ] && [ -f "$arg" ]; then
    mode="$(stat -c %a "$arg" 2>/dev/null || stat -f %Lp "$arg" 2>/dev/null || true)"
    printf '%s\\t%s\\t%s\\t%s\\n' "$mode" "$arg" "$(cat "$arg")" "$args" >> "$CURL_CONFIG_LOG"
  fi
  prev="$arg"
done
if [ -n "\${FREEDUET_INSTALL_SECRET:-}" ]; then printf 'curl\\n' >> "$LEAK_LOG"; fi
for port in ${unavailableHealthPorts.join(" ")}; do
  if [[ "$args" == *"http://localhost:$port/health"* ]]; then exit 7; fi
done
if [[ "$args" == *"/internal/routines/run"* ]]; then
  printf '${status}'
  exit 0
fi
# The one route only the person's script asks: a link that pairs a browser (or why there is none).
if [[ "$args" == *"/internal/pairing"* ]]; then
  case "\${PAIRING:-200}" in
    200) printf '{"path":"/api/pair?token=pairing-token-fixture_123"}\\n200' ;;
    bad-link) printf '{"path":"https://elsewhere.example/steal"}\\n200' ;;
    down) exit 7 ;;
    *) printf '{"error":"fixture"}\\n%s' "$PAIRING" ;;
  esac
  exit 0
fi
if [ -n "\${APP_DOWN:-}" ] && [[ "$args" == *"http://localhost:3010/"* ]]; then exit 7; fi
if [[ "$args" == *"/api/copilotkit/info"* || "$args" == *"/api/capabilities"* ]]; then
  if { [ -f "$SERVER_STOPPED" ] || [ "$PORT_FREE" = 1 ]; } && [ ! -f "$SERVER_STARTED" ]; then exit 7; fi
  if [[ "$args" == *"/api/capabilities"* ]]; then printf '${capabilities}'; else printf '${runtimeInfo}'; fi
  exit 0
fi
if [[ "$args" == *"http://localhost:3010/"* ]]; then
  printf '<title>OpenBot</title>'
  exit 0
fi
exit 0
`,
  );
  await writeExecutable(
    join(fakeBin, "docker"),
    `#!/usr/bin/env bash
args="$*"
printf '%s\\n' "$args" >> "$DOCKER_LOG"
if [ -n "\${FREEDUET_INSTALL_SECRET:-}" ]; then printf 'docker\\n' >> "$LEAK_LOG"; fi
if [ -n "\${COMPOSE_PROFILES:-}" ]; then printf 'COMPOSE_PROFILES=%s\\n' "$COMPOSE_PROFILES" >> "$DOCKER_LOG"; fi
if [[ "$args" == *"compose up"* ]]; then printf '%s' "$COMPUTER_TOKEN" > "$COMPOSE_COMPUTER_TOKEN"; fi
if [[ "$args" == *"to_regclass('public.agent_profiles')"* ]]; then echo agent_profiles; fi
if [[ "$args" == *"to_regclass('public.agent_preferences')"* ]]; then echo agent_preferences; fi
exit 0
`,
  );
  await writeExecutable(
    join(fakeBin, "pgrep"),
    `#!/usr/bin/env bash
if [[ "$*" == *worker/src/index.ts* ]]; then : > "$WORKER_CHECKED"; fi
if [ -f "$SERVER_STARTED" ]; then echo 91000006; else printf '%s\\n' 91000001 91000002; fi
printf '%s\\n' 91000003 91000004 91000005
`,
  );
  await writeExecutable(
    join(fakeBin, "ps"),
    `#!/usr/bin/env bash
case "$4" in
  lstart=) echo fixture-start ;;
  comm=) case "$2" in 91000004) echo /bin/bash ;; *) echo /opt/bun ;; esac ;;
  args=)
    case "$2" in
      91000006) printf 'bun --env-file=../%s %s/server/src/production-entry.ts\\n' "\${OPENBOT_ENV_FILE:-.env}" "$STACK_ROOT" ;;
      91000001|91000003) echo 'bun --env-file=../.env src/production-entry.ts' ;;
      91000002) echo 'bun --env-file=../.env src/index.ts' ;;
      91000004) echo 'bash -c bun --env-file=../.env src/production-entry.ts' ;;
      91000005) echo 'bun worker/src/index.ts' ;;
    esac ;;
esac
`,
  );
  await writeExecutable(
    join(fakeBin, "powershell.exe"),
    `#!/usr/bin/env bash
if [ -n "\${OPENBOT_PID:-}" ]; then
  echo fixture-start
elif [ "\${OPENBOT_ACTION:-}" = unscoped ]; then
  if [ "\${LEGACY_WINDOWS_PROCESS:-}" = 1 ]; then echo 91000001; fi
elif [ "\${OPENBOT_ACTION:-}" = stop ] && [ "\${OPENBOT_CWD:-}" = "$STACK_ROOT/server" ]; then
  : > "$SERVER_STOPPED"
elif [ "\${OPENBOT_PATTERN:-}" = 'bun worker/src/index.ts' ]; then
  : > "$WORKER_CHECKED"
  if [ -f "$WORKER_STARTED" ]; then echo 91000005; fi
elif [ "\${OPENBOT_PATTERN:-}" = 'bun --env-file=../.env src/production-entry.ts' ]; then
  if [ -f "$SERVER_STARTED" ]; then echo 91000006; else echo 91000001; fi
fi
`,
  );
  await writeExecutable(
    join(fakeBin, "pkill"),
    '#!/usr/bin/env bash\nprintf "GLOBAL %s\\n" "$*" >> "$SIGNAL_LOG"\nexit 0\n',
  );
  await writeExecutable(
    join(fakeBin, "sleep"),
    `#!/usr/bin/env bash
# A real, short delay while a fresh launch is pending (PORT_FREE=1 and no SERVER_STARTED yet). The
# server probe in wait_for_openbot gives the server 40 tries of one second each; with no delay here
# those 40 tries finish in a few hundred milliseconds, so a background launch that a loaded runner
# schedules late is never seen. 40 x 0.1 s gives it several real seconds. Other tests are untouched.
if [ "$PORT_FREE" = 1 ] && [ ! -f "$SERVER_STARTED" ]; then /bin/sleep 0.1; fi
# The first pause follows the signal, before the new API is launched. Later pauses wait for
# the fake background launch to acknowledge readiness, with a bounded fixture-only deadline.
if [ -f "$SERVER_STOPPED" ] && [ ! -f "$SERVER_STARTED" ]; then
  if [ -f "$SERVER_RESTART_PAUSED" ]; then
    for ((attempt=0; attempt<200; attempt++)); do
      [ -f "$SERVER_STARTED" ] && break
      /bin/sleep 0.01
    done
  else
    : > "$SERVER_RESTART_PAUSED"
  fi
fi
# The worker readiness check follows its launch immediately.
if [ -f "$WORKER_CHECKED" ] && [ ! -f "$WORKER_STARTED" ]; then
  for ((attempt=0; attempt<200; attempt++)); do
    [ -f "$WORKER_STARTED" ] && break
    /bin/sleep 0.01
  done
fi
`,
  );
  // The runtime health check is a script piped into `bun run -`, so that one invocation is the real
  // Bun: it is what decides whether the run carries on. Everything else Bun would start is faked.
  // The Learning container check answers with one line, which start.sh relays.
  await writeExecutable(
    join(fakeBin, "bun"),
    '#!/usr/bin/env bash\nif [ -n "$FREEDUET_INSTALL_SECRET" ]; then printf "bun\\n" >> "$LEAK_LOG"; fi\nif [[ "$2" == *server/src/production-entry.ts ]]; then printf "%s" "$COMPUTER_TOKEN" > "$SERVER_COMPUTER_TOKEN"; printf "%s\\n" "$*" > "$SERVER_STARTED"; fi\nif [[ "$2" == *server/src/production-entry.ts && -n "$FAKE_SERVER_HOLDS_SECONDS" ]]; then /bin/sleep "$FAKE_SERVER_HOLDS_SECONDS"; fi\nif [[ "$*" == *worker/src/index.ts ]]; then printf "%s\\n" "$*" > "$WORKER_STARTED"; fi\nif [ "$1" = run ] && [ "$2" = - ]; then exec "$REAL_BUN" "$@"; fi\nif [ "$1" = scripts/setup-learning.ts ]; then echo "noise"; echo "LEARNING-CHECK $*"; fi\nexit 0\n',
  );
  // What `python3` is on a stock Windows machine: the Microsoft Store alias, which runs nothing. A
  // script that still needed it would stop at the health check in every test in this file.
  await writeExecutable(
    join(fakeBin, "python3"),
    '#!/usr/bin/env bash\necho "Python was not found; run without arguments to install from the Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases." >&2\nexit 49\n',
  );

  try {
    const spawnOptions = {
      cmd: [shell, `scripts/${script}.sh`, ...args],
      cwd: directory,
      env: {
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        // FreeDuet (D28): a run of these scripts never opens a real window. A test about the browser
        // names the fake one through BROWSER and clears FREEDUET_NO_BROWSER.
        BROWSER: "fake-browser",
        FREEDUET_NO_BROWSER: "1",
        BROWSER_LOG: browserLogPath,
        LEAK_LOG: leakLogPath,
        CURL_CONFIG_LOG: curlConfigLogPath,
        REAL_BUN: process.execPath,
        OS: "",
        STOP_ONLY: script === "stop" ? "1" : "0",
        PORT_FREE: portFree ? "1" : "0",
        BASH_ENV: join(directory, "bash-env"),
        STACK_ROOT: directory,
        WORKER_OWNER: worker,
        SERVER_OWNER: server,
        SERVER_STOPS: serverStops ? "1" : "0",
        SERVER_COMPUTER_TOKEN: join(directory, "server-computer-token"),
        COMPOSE_COMPUTER_TOKEN: join(directory, "compose-computer-token"),
        WORKER_STARTED: join(directory, "worker-started"),
        WORKER_CHECKED: join(directory, "worker-checked"),
        SERVER_STOPPED: join(directory, "server-stopped"),
        SERVER_STARTED: join(directory, "server-started"),
        SERVER_RESTART_PAUSED: join(directory, "server-restart-paused"),
        SIGNAL_LOG: logPath,
        DOCKER_LOG: dockerLogPath,
        CURL_LOG: curlLogPath,
        ...(envFile === ".env" ? {} : { OPENBOT_ENV_FILE: envFile }),
        ...processEnvironment,
      },
      stdout: "pipe",
      stderr: "pipe",
    } as const;
    const child = Bun.spawn(spawnOptions);
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const signalLog = await Bun.file(logPath)
      .text()
      .catch(() => "");
    const dockerLog = await Bun.file(dockerLogPath)
      .text()
      .catch(() => "");
    const curlLog = await Bun.file(curlLogPath)
      .text()
      .catch(() => "");
    const computerState = await Bun.file(
      join(directory, ".logs/server-computer.state"),
    )
      .text()
      .catch(() => "");
    // What the first run left in the settings file, before a repeat can change it.
    const firstSavedEnvironment = await Bun.file(
      join(directory, envFile),
    ).text();
    let repeated:
      | { exitCode: number; stdout: string; stderr: string; signalLog: string }
      | undefined;
    if (repeatStart && exitCode === 0) {
      await writeFile(logPath, "");
      const next = Bun.spawn(spawnOptions);
      const [nextExitCode, nextStdout, nextStderr] = await Promise.all([
        next.exited,
        new Response(next.stdout).text(),
        new Response(next.stderr).text(),
      ]);
      repeated = {
        exitCode: nextExitCode,
        stdout: nextStdout,
        stderr: nextStderr,
        signalLog: await readFile(logPath, "utf8"),
      };
    }
    return {
      repeated,
      computerState,
      runtimeComputerToken: await readFile(
        join(directory, "server-computer-token"),
        "utf8",
      ),
      composeComputerToken: await Bun.file(
        join(directory, "compose-computer-token"),
      )
        .text()
        .catch(() => ""),
      exitCode,
      stdout,
      stderr,
      signalLog,
      dockerLog,
      curlLog,
      serverLaunch: await Bun.file(join(directory, "server-started"))
        .text()
        .catch(() => ""),
      workerLaunch: await Bun.file(join(directory, "worker-started"))
        .text()
        .catch(() => ""),
      directory,
      initialEnvironment,
      firstSavedEnvironment,
      savedEnvironment: await Bun.file(join(directory, envFile)).text(),
      savedEnvironmentMode: (await stat(join(directory, envFile))).mode & 0o777,
      modesSupported,
      personEnvironment: await Bun.file(join(directory, ".env")).text(),
      // FreeDuet (D28): over the whole run, a repeat included.
      browserLog: await Bun.file(browserLogPath)
        .text()
        .catch(() => ""),
      leakLog: await Bun.file(leakLogPath)
        .text()
        .catch(() => ""),
      curlConfigs: (
        await Bun.file(curlConfigLogPath)
          .text()
          .catch(() => "")
      )
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [mode, path, held, command] = line.split("\t");
          return { mode, path, held, command };
        }),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("start.sh server restart guard", () => {
  function expectServerRestart(signalLog: string) {
    expect(signalLog).toBe("91000001\n91000002\n");
  }

  test.each([401, 404] as const)(
    "stops both current and legacy server launch patterns after handoff probe %s",
    async (status) => {
      const result = await runStartWithStaleServerProbe(status);

      expect({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        signalLog: result.signalLog,
      }).toMatchObject({ exitCode: 0, stderr: "" });
      expectServerRestart(result.signalLog);
    },
  );

  test("a changed computer token restarts a healthy server whose worker secret still matches", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      processEnvironment: { COMPUTER_TOKEN: "new-development-token" },
    });

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(result.savedEnvironment).toMatch(
      /^COMPUTER_TOKEN=new-development-token$/m,
    );
    expectServerRestart(result.signalLog);
    expect(result.serverLaunch).toBe(
      `--env-file=../.env ${result.directory}/server/src/production-entry.ts\n`,
    );
  });

  test.each(["true", "false"])(
    "an edited .env refreshes the running API's computer credential with a healthy worker probe (one computer each: %s)",
    async (oneComputerEach) => {
      const result = await runStartWithStaleServerProbe(400, {
        settings: {
          COMPUTER_TOKEN: "manually-edited-token",
          OPENBOT_ONE_COMPUTER_EACH: oneComputerEach,
        },
        runningComputerToken: "previous-runtime-token",
        repeatStart: true,
      });
      expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
        exitCode: 0,
        stderr: "",
      });
      expectServerRestart(result.signalLog);
      expect(result.runtimeComputerToken).toBe("manually-edited-token");
      expect(result.composeComputerToken).toBe(result.runtimeComputerToken);
      expect(result.computerState).not.toContain("manually-edited-token");
      expect(result.stdout).not.toContain("manually-edited-token");
      expect(result.stdout).not.toContain("previous-runtime-token");
      expect(result.computerState).toBe(
        `v1\n${createHash("sha256").update("manually-edited-token").digest("hex")}\n91000006\nfixture-start\n`,
      );
      expect(result.repeated).toMatchObject({
        exitCode: 0,
        stderr: "",
        signalLog: "",
      });
    },
  );

  test("a server that remains alive is not stamped as having refreshed its computer credential", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      serverStops: false,
      settings: { COMPUTER_TOKEN: "manually-edited-token" },
      runningComputerToken: "previous-runtime-token",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("old API is still answering");
    expect(result.serverLaunch).toBe("");
    expect(result.runtimeComputerToken).toBe("previous-runtime-token");
    expect(result.computerState).toContain(
      createHash("sha256").update("previous-runtime-token").digest("hex"),
    );
  });

  test.each(["missing", "previous-process"] as const)(
    "%s launch state conservatively refreshes only the owned API",
    async (computerStamp) => {
      const result = await runStartWithStaleServerProbe(400, {
        computerStamp,
        repeatStart: true,
      });
      expect(result.exitCode).toBe(0);
      expectServerRestart(result.signalLog);
      expect(result.repeated).toMatchObject({
        exitCode: 0,
        stderr: "",
        signalLog: "",
      });
    },
  );

  test("an API owned by another checkout is never restarted or stamped", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      server: "other",
      computerStamp: "missing",
      settings: { COMPUTER_TOKEN: "manually-edited-token" },
      runningComputerToken: "previous-runtime-token",
    });
    expect(result.exitCode).toBe(1);
    expect(result.signalLog).toBe("");
    expect(result.serverLaunch).toBe("");
    expect(result.computerState).toBe("");
    expect(result.stdout).toContain("ownership");
  });

  test.each(["default", "process environment"])(
    "an unchanged resolved %s token leaves the API running",
    async (source) => {
      const token =
        source === "default" ? "openbot-dev-computer-token" : "process-token";
      const result = await runStartWithStaleServerProbe(400, {
        settings: { COMPUTER_TOKEN: "" },
        runningComputerToken: token,
        processEnvironment:
          source === "process environment" ? { COMPUTER_TOKEN: token } : {},
      });
      expect(result.exitCode).toBe(0);
      expect(result.signalLog).toBe("");
      expect(result.savedEnvironment).toContain(`COMPUTER_TOKEN=${token}\n`);
      expect(result.composeComputerToken).toBe(result.runtimeComputerToken);
    },
  );

  test.each([
    ["unquoted", "computer-token"],
    ["double-quoted", '"computer-token"'],
    ["single-quoted", "'computer-token'"],
    ["with an embedded quote", '"computer\'token"'],
  ])(
    "an unchanged computer token %s leaves a healthy server running",
    async (_, stored) => {
      const result = await runStartWithStaleServerProbe(400, {
        settings: { COMPUTER_TOKEN: stored },
      });

      expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
        exitCode: 0,
        stderr: "",
      });
      expect(result.savedEnvironment).toContain(`COMPUTER_TOKEN=${stored}\n`);
      expect(result.signalLog).toBe("");
      expect(result.serverLaunch).toBe("");
    },
  );
});

describe("start.sh deployment ownership", () => {
  test("another deployment's worker does not suppress this deployment's launch", async () => {
    const result = await runStartWithStaleServerProbe(400, { worker: "other" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("worker: started");
    expect(result.stdout).not.toContain("worker: did not stay up");
    expect(result.workerLaunch).toBe(
      `${result.directory}/worker/src/index.ts\n`,
    );
    expect(result.signalLog).toBe("");
  });

  test("an unchanged start reuses only this deployment's worker", async () => {
    const result = await runStartWithStaleServerProbe(400);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("worker: already running");
    expect(result.workerLaunch).toBe("");
    expect(result.signalLog).toBe("");
  });

  test("Windows launches identifiable absolute API and worker entry paths", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      processEnvironment: { OS: "Windows_NT" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.workerLaunch).toBe(
      `${result.directory}/worker/src/index.ts\n`,
    );
    expect(result.stdout).not.toContain("worker: did not stay up");
    expect(result.serverLaunch).toBe(
      `--env-file=../.env ${result.directory}/server/src/production-entry.ts\n`,
    );
  });

  test("Windows refuses ambiguous legacy processes with a manual restart instruction", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      processEnvironment: { OS: "Windows_NT", LEGACY_WINDOWS_PROCESS: "1" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("deployment cannot be verified");
    expect(result.stdout).toContain("Stop that process in Task Manager");
    expect(result.signalLog).toBe("");
    expect(result.workerLaunch).toBe("");
    expect(result.dockerLog).toBe("");
  });
});

describe("stop.sh deployment ownership", () => {
  test.each(["own", "other"] as const)(
    "stops only a worker owned by this deployment (%s)",
    async (worker) => {
      const result = await runStartWithStaleServerProbe(400, {
        script: "stop",
        worker,
      });
      expect(result.exitCode).toBe(0);
      expect(result.signalLog).toBe(worker === "own" ? "91000005\n" : "");
    },
  );
});

/*
 * FreeDuet's eval stack runs beside the person's FreeDuet from the same checkout, through these same
 * scripts, with OPENBOT_ENV_FILE=.env.eval (scripts/freeduet-eval-stack.sh). Its server and worker
 * have command lines of their own, so neither script may ever adopt, restart or stop the person's.
 */
describe("a second stack from OPENBOT_ENV_FILE (the eval stack)", () => {
  test("reads and writes its own file, names it to Compose, and never touches the person's server", async () => {
    // The API on the port is the person's (`bun --env-file=../.env ...` in this checkout).
    const result = await runStartWithStaleServerProbe(400, {
      envFile: ".env.eval",
      processEnvironment: { COMPUTER_TOKEN: "eval-computer-token" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "cannot verify listener ownership and launch time",
    );
    expect(result.signalLog).toBe("");
    expect(result.personEnvironment).toBe("PERSON=untouched\n");
    expect(result.savedEnvironment).toMatch(
      /^COMPUTER_TOKEN=eval-computer-token$/m,
    );
    const compose = result.dockerLog
      .split("\n")
      .filter((line) => line.startsWith("compose "));
    expect(compose.length).toBeGreaterThan(0);
    for (const line of compose)
      expect(line).toStartWith(
        `compose --env-file ${result.directory}/.env.eval `,
      );
  });

  test("launches its own server and worker with its file, beside the person's worker", async () => {
    // The worker already running is the person's (`bun worker/src/index.ts` in this checkout).
    const result = await runStartWithStaleServerProbe(400, {
      envFile: ".env.eval",
      portFree: true,
    });
    expect({
      exitCode: result.exitCode,
      stdoutOnFailure: result.exitCode === 0 ? "" : result.stdout,
    }).toEqual({ exitCode: 0, stdoutOnFailure: "" });
    expect(result.signalLog).toBe("");
    expect(result.serverLaunch).toBe(
      `--env-file=../.env.eval ${result.directory}/server/src/production-entry.ts\n`,
    );
    expect(result.stdout).toContain("worker: started");
    expect(result.workerLaunch).toBe(
      `--env-file=.env.eval ${result.directory}/worker/src/index.ts\n`,
    );
    expect(result.personEnvironment).toBe("PERSON=untouched\n");
  });

  test("stop.sh leaves the person's worker running and stops its own Compose project", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      script: "stop",
      worker: "own",
      envFile: ".env.eval",
    });
    expect(result.exitCode).toBe(0);
    expect(result.signalLog).toBe("");
    expect(result.dockerLog).toContain(
      `compose --env-file ${result.directory}/.env.eval ps --quiet`,
    );
    expect(result.stdout).toContain(
      "Start again: OPENBOT_ENV_FILE=.env.eval bash scripts/start.sh",
    );
  });

  test("a path is refused, so nothing outside the checkout is read or written", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      processEnvironment: { OPENBOT_ENV_FILE: "../.env" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("OPENBOT_ENV_FILE must name a file");
    expect(result.dockerLog).toBe("");
  });
});

describe("start.sh runtime health", () => {
  /**
   * THE LICENCE IS CHECKED WITHOUT PYTHON.
   *
   * The check used to be a `python3` heredoc. On Windows `python3` is usually the Microsoft Store
   * alias, which exits 49, so `set -e` ended the run at "3/4 Runtime health" with the server and
   * worker already up and the app never started. The fake `python3` beside this file's other fakes
   * is that alias; the line below is only printed if the check ran, in Bun, and passed.
   */
  test("checks the licence and names the Bots without python3", async () => {
    const result = await runStartWithStaleServerProbe(401);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(result.stdout).toContain(
      "licence valid · mode test · Bots: analyst",
    );
  });
});

describe("start.sh on the SSE runtime (FREEDUET_INTELLIGENCE=off, #21)", () => {
  /**
   * A FRESH SERVER WITH NO LICENCE IS STILL OPENBOT. The CopilotKit info route sends `licenseStatus`
   * only with Intelligence, so identity used to be read from it, and a clean start with no key gave
   * up at "never answered as OpenBot" after 40 seconds. Identity is now OpenBot's own capabilities.
   */
  test("a server that sends no licence is recognised and the run finishes", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      portFree: true,
      runtime: "sse",
    });

    expect({
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdoutOnFailure: result.exitCode === 0 ? "" : result.stdout,
    }).toEqual({ exitCode: 0, stderr: "", stdoutOnFailure: "" });
    expect(result.stdout).not.toContain("never answered as OpenBot");
    expect(result.stdout).toContain("server ready");
    expect(result.stdout).toContain(
      "conversations in this server's database · mode sse · Bots: analyst",
    );
    expect(result.serverLaunch).toContain("production-entry.ts");
  });

  /**
   * THE CALLER'S OUTPUT CLOSES WHEN START.SH EXITS. A background job keeps the stdout it inherited,
   * and `bash start.sh | tee` (the CI step) waits for that to close. The server never closes it, so
   * the step hung for an hour after start.sh had already printed why it stopped. Here the server
   * holds its stdout for 20 seconds: a run that waits for it cannot finish inside the timeout below.
   */
  test("a server that keeps running does not hold the caller's output open", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      portFree: true,
      runtime: "sse",
      processEnvironment: { FAKE_SERVER_HOLDS_SECONDS: "20" },
    });

    expect({
      exitCode: result.exitCode,
      stdoutOnFailure: result.exitCode === 0 ? "" : result.stdout,
    }).toEqual({ exitCode: 0, stdoutOnFailure: "" });
  }, 10_000);
});

describe("start.sh under the wrong shell", () => {
  /**
   * THE WRONG INVOCATION SAYS SO, AND SAYING NOTHING IS THE DEFECT.
   *
   * CRITERION. `sh scripts/start.sh` exits non-zero having named bash and the command to run
   * instead, on stderr.
   *
   * REASON. The shebang says bash and `sh` overrides it. On macOS `sh` IS bash, in POSIX mode,
   * where a failed assignment inside a function is fatal instead of survivable — so the script died
   * at the first setting it read out of `.env` and printed NOTHING: no line number, no failing
   * command, no exit message. The whole of what somebody had to go on was `1`, which reads as "this
   * script is broken" rather than "run it the other way", and it cost an afternoon.
   *
   * THE SENTENCE NAMES THE FIX AND NOT ONLY THE FAULT, because "wrong shell" is not actionable to
   * somebody who typed the only invocation they knew.
   */
  test("sh refuses with a sentence naming bash, rather than exiting in silence", async () => {
    const result = await runStartWithStaleServerProbe(401, { shell: "sh" });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/bash/);
    expect(result.stderr).toMatch(/bash scripts\/start\.sh/);
    // On stderr rather than stdout, so it survives a caller that is reading the progress output.
    expect(result.stdout).toBe("");
  });
});

describe("start.sh settings with no line in .env", () => {
  /**
   * A KEY THIS SCRIPT HAS A DEFAULT FOR IS ALLOWED TO BE ABSENT, WHICH IS WHAT THE DEFAULT IS FOR.
   *
   * CRITERION. With no `APP_PORT` line in `.env` at all, the run completes exactly as it does with
   * one — the app is probed on 3010, the port the script falls back to.
   *
   * THIS ONE PASSED BEFORE THE CHANGE IT GUARDS, AND THAT IS SAID PLAINLY RATHER THAN DRESSED UP.
   * `setting` reads the key with a `grep` pipeline, `grep` finding nothing is an exit status of 1,
   * and `pipefail` makes it the pipeline's — but under bash that status does not escape the command
   * substitution, so the fallback won and this run was already green. It was fatal only under `sh`,
   * where the sibling test now keeps anybody from arriving at all. So there is no invocation left
   * that can watch this fail, and what it does instead is pin the CONTRACT: the second argument to
   * `setting` is the value an absent key takes, and nothing about which shell is reading the script
   * may decide otherwise.
   *
   * THE `|| true` IN THE SCRIPT IS WHAT MAKES THAT TRUE BY CONSTRUCTION rather than by a subtlety
   * of where `set -e` applies. Both halves are worth having: the refusal stops the invocation that
   * was silently fatal, and this stops the fallback depending on a detail nobody should have to
   * know to add a setting.
   *
   * `APP_PORT` IS THE ONE OMITTED BECAUSE IT IS THE REAL CASE. `.env.example` lists `PORT` and
   * `SERVER_PORT` and not this one, so every `.env` copied from it is missing exactly this key, and
   * it is the first setting the script reads — which is why the silent exit under `sh` happened
   * before any output at all.
   *
   * THE ASSERTION IS THE WHOLE RUN rather than a printed port: the faked `curl` answers the app
   * probe for `http://localhost:3010/` and nothing else, so a fallback that produced any other port
   * fails the run instead of quietly reporting a different number.
   */
  test("a .env with no APP_PORT still starts, on the default port", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      omitFromEnv: ["APP_PORT"],
    });

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toMatchObject({
      exitCode: 0,
      stderr: "",
    });
    expect(result.stdout).toContain("http://localhost:3010");
  });

  // FreeDuet: a .env from before M1 has no MANAGED_AGENT_AG_UI_URL line. With the router on (the
  // default) the members must go to agent-freeduet, never quietly to LangGraph.
  test("with no managed endpoint line, members go to agent-freeduet", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      omitFromEnv: ["MANAGED_AGENT_AG_UI_URL"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "managed coworker endpoint: http://localhost:4230/",
    );
  });

  test("with the router off and no line, members go to LangGraph as upstream", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      omitFromEnv: ["MANAGED_AGENT_AG_UI_URL"],
      settings: { FREEDUET_ROUTER: "off" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "managed coworker endpoint: http://localhost:4201/ag-ui",
    );
  });
});

describe("start.sh one computer each", () => {
  /**
   * `OPENBOT_ONE_COMPUTER_EACH=false` IN `.env` TURNS THE SUPERVISOR OFF, AS THE DOCS SAY.
   *
   * The key was read from the environment alone, so a `.env` line was ignored: the supervisor was
   * still started and the server still told to use it. docs/configuration.md says to set it "in
   * `.env` or in the environment", and every other setting in this script is read that way.
   *
   * THE SUPERVISOR IS WHAT GIVES EACH BOT ITS OWN COMPUTER, so its absence from the services handed
   * to `docker compose up` is the observable half; the shared computer stays.
   */
  test("false in .env starts no supervisor", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      settings: { OPENBOT_ONE_COMPUTER_EACH: "false" },
    });

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(result.dockerLog).toContain(
      "compose up -d --build postgres agent-computer agent-bot agent-langgraph",
    );
    expect(result.dockerLog).not.toContain("supervisor");
  });

  test("false in the process environment starts no supervisor either", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      settings: { OPENBOT_ONE_COMPUTER_EACH: "true" },
      processEnvironment: { OPENBOT_ONE_COMPUTER_EACH: "false" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.dockerLog).not.toContain("supervisor");
  });

  test("true, or absent, still starts it", async () => {
    for (const omitFromEnv of [[], ["OPENBOT_ONE_COMPUTER_EACH"]] as const) {
      const result = await runStartWithStaleServerProbe(401, { omitFromEnv });

      expect(result.exitCode).toBe(0);
      expect(result.dockerLog).toContain(
        "compose up -d --build postgres supervisor agent-computer agent-bot agent-langgraph",
      );
    }
  });
});

describe("start.sh Learning container check", () => {
  /**
   * The server assigns `openbot` once it exists, but its runtime key cannot create it. start.sh asks
   * the setup helper, without a browser or a prompt, to make sure it exists, and relays its last line.
   */
  test("runs the non-interactive check when a key is set and nothing is assigned", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      // FreeDuet (#42): Learning is an Intelligence feature, so only with Intelligence on.
      settings: {
        INTELLIGENCE_API_KEY: "cpk-synthetic",
        FREEDUET_INTELLIGENCE: "on",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "LEARNING-CHECK scripts/setup-learning.ts --non-interactive",
    );
    expect(result.stdout).not.toContain("noise");
  });

  test.each([
    [
      "a container is named",
      { CPK_INTELLIGENCE_LEARNING_CONTAINER_ID: "mine" },
    ],
    ["it is switched off", { OPENBOT_LEARNING_AUTO_ASSIGN: "false" }],
    ["it is switched off with 0", { OPENBOT_LEARNING_AUTO_ASSIGN: "0" }],
    // FreeDuet (#42): no Intelligence, nothing to ask it.
    ["FREEDUET_INTELLIGENCE is off", { FREEDUET_INTELLIGENCE: "off" }],
  ])("is skipped when %s", async (_, settings) => {
    const result = await runStartWithStaleServerProbe(401, {
      settings: { INTELLIGENCE_API_KEY: "cpk-synthetic", ...settings },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("LEARNING-CHECK");
  });

  test("is skipped without a runtime key", async () => {
    const result = await runStartWithStaleServerProbe(401);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("LEARNING-CHECK");
  });
});

describe("start.sh FREEDUET_INTELLIGENCE (#42)", () => {
  test("writes off when the settings file has no line for it, and says so without naming a key", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      omitFromEnv: ["FREEDUET_INTELLIGENCE"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.savedEnvironment).toContain("FREEDUET_INTELLIGENCE=off\n");
    expect(result.stdout).toContain("Wrote FREEDUET_INTELLIGENCE=off to .env");
    // freeduet-clean-start-check.sh fails a start whose output asks for a key.
    expect(result.stdout).not.toMatch(/api[_ ]?key/i);
  });

  test("keeps a value somebody chose", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      settings: { FREEDUET_INTELLIGENCE: "on" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.savedEnvironment).toContain("FREEDUET_INTELLIGENCE=on\n");
    expect(result.stdout).not.toContain("Wrote FREEDUET_INTELLIGENCE");
  });

  /**
   * An install from before #42 has all three Intelligence settings, because the server would not
   * start without them, and its conversations are in Intelligence. Writing off would hide them.
   */
  test("writes on for an install already on Intelligence, and says how to switch", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      omitFromEnv: ["FREEDUET_INTELLIGENCE"],
      settings: {
        INTELLIGENCE_API_URL: "https://api.intelligence.example",
        INTELLIGENCE_GATEWAY_WS_URL: "wss://realtime.intelligence.example",
        INTELLIGENCE_API_KEY: "cpk-synthetic",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.savedEnvironment).toContain("FREEDUET_INTELLIGENCE=on\n");
    expect(result.savedEnvironment).not.toContain("FREEDUET_INTELLIGENCE=off");
    const said = result.stdout
      .split("\n")
      .filter((line) => line.includes("FREEDUET_INTELLIGENCE"));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(
      "Wrote FREEDUET_INTELLIGENCE=on to .env: your conversations stay in CopilotKit Intelligence. Set it to off to keep new ones in FreeDuet's own database.",
    );
  });

  test("a key without the addresses is not an install on Intelligence: off", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      omitFromEnv: ["FREEDUET_INTELLIGENCE"],
      settings: { INTELLIGENCE_API_KEY: "cpk-synthetic" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.savedEnvironment).toContain("FREEDUET_INTELLIGENCE=off\n");
    expect(result.stdout).toContain("Wrote FREEDUET_INTELLIGENCE=off to .env");
  });
});

describe("start.sh selected provider services", () => {
  test.each([".env", "process environment"])(
    "an Anthropic-only %s selection starts the managed Bot without the OpenAI-only sample",
    async (source) => {
      const selected = {
        BOT_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "synthetic-anthropic-key",
      };
      const result = await runStartWithStaleServerProbe(401, {
        settings: source === ".env" ? selected : { BOT_PROVIDER: "openai" },
        processEnvironment: source === "process environment" ? selected : {},
        unavailableHealthPorts: [4200],
      });
      expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
        exitCode: 0,
        stderr: "",
      });
      expect(result.dockerLog).toContain(
        "compose up -d --build postgres supervisor agent-computer agent-langgraph",
      );
      expect(result.dockerLog).not.toContain("agent-bot");
      expect(result.dockerLog).toContain("compose run --rm --build migrate");
      expect(result.curlLog).toContain("http://localhost:4100/health");
      expect(result.curlLog).toContain("http://localhost:4201/health");
      expect(result.curlLog).not.toContain("http://localhost:4200/health");
      expect(result.stdout).toContain("agent-bot: skipped for Anthropic");
      expect(result.stdout).not.toContain("agent-bot ready");
      expect(result.stdout).toContain("agent-langgraph ready");
      expect(result.stdout).toContain(
        "managed coworker endpoint: http://localhost:4201/ag-ui",
      );
      expect(result.stdout).toContain("Ready. http://localhost:3010");
    },
  );

  test("the default OpenAI startup still starts and checks the legacy sample", async () => {
    const result = await runStartWithStaleServerProbe(401);
    expect(result.exitCode).toBe(0);
    expect(result.dockerLog).toContain(
      "compose up -d --build postgres supervisor agent-computer agent-bot agent-langgraph",
    );
    expect(result.curlLog).toContain("http://localhost:4200/health");
    expect(result.stdout).toContain("agent-bot ready");
    expect(result.stdout).not.toContain("agent-bot: skipped");
  });

  test("Anthropic startup still fails if its managed LangGraph Bot is unavailable", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      settings: {
        BOT_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "synthetic-anthropic-key",
      },
      unavailableHealthPorts: [4200, 4201],
    });
    expect(result.exitCode).toBe(1);
    expect(result.curlLog).not.toContain("http://localhost:4200/health");
    expect(result.curlLog).toContain("http://localhost:4201/health");
    expect(result.stdout).toContain("agent-langgraph never became ready");
    expect(result.stdout).not.toContain("Ready. http://localhost:3010");
  });
});

test("start persists the computer token for direct server restarts", async () => {
  const result = await runStartWithStaleServerProbe(401, {
    settings: { COMPUTER_TOKEN: "" },
  });
  expect(result.exitCode).toBe(0);
  expect(result.savedEnvironment).toMatch(/^COMPUTER_TOKEN=.+$/m);
});

test("start persists an overriding computer token for direct server restarts", async () => {
  const result = await runStartWithStaleServerProbe(401, {
    processEnvironment: { COMPUTER_TOKEN: "new-development-token" },
  });
  expect(result.exitCode).toBe(0);
  expect(result.savedEnvironment).toMatch(
    /^COMPUTER_TOKEN=new-development-token$/m,
  );
});

/*
 * Dictation with a local Whisper (docs/M1_PLAN.md D25). Off unless .env says FREEDUET_DICTATION=local:
 * a start without it must add no service, write nothing and download nothing.
 */
describe("start.sh local dictation (D25)", () => {
  /** The service list of the `compose up` line, which is what Compose is asked to start. */
  const upLine = (dockerLog: string) =>
    dockerLog.split("\n").find((line) => line.startsWith("compose up")) ?? "";
  /** The list as it was before D25, recorded from the script before this change. */
  const BASELINE_UP =
    "compose up -d --build postgres supervisor agent-computer agent-bot agent-langgraph agent-freeduet";

  test.each([
    ["unset", {}],
    ["empty", { FREEDUET_DICTATION: "" }],
    ["off", { FREEDUET_DICTATION: "off" }],
  ])(
    "with the flag %s the service list and .env are what they were",
    async (_name, settings) => {
      const result = await runStartWithStaleServerProbe(401, { settings });
      expect(result.exitCode).toBe(0);
      expect(upLine(result.dockerLog)).toBe(BASELINE_UP);
      expect(result.dockerLog).not.toContain("whisper");
      // Not one byte of .env changed, and nothing was said about dictation.
      expect(result.savedEnvironment).toBe(result.initialEnvironment);
      expect(result.savedEnvironment).not.toContain("TRANSCRIPTION");
      expect(result.stdout).not.toContain("Dictation is local");
      expect(result.curlLog).not.toContain("4240");
    },
  );

  test("with the flag set the service is added and the three settings are written once", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      settings: { FREEDUET_DICTATION: "local" },
      repeatStart: true,
    });
    expect(result.exitCode).toBe(0);
    expect(upLine(result.dockerLog)).toBe(`${BASELINE_UP} whisper`);
    const lines = result.savedEnvironment.split("\n");
    for (const line of [
      "TRANSCRIPTION_PROVIDER=openai-compatible",
      "TRANSCRIPTION_BASE_URL=http://127.0.0.1:4240/v1",
      "TRANSCRIPTION_MODEL=local-whisper",
    ])
      expect(lines.filter((candidate) => candidate === line)).toEqual([line]);
    expect(
      lines.filter((line) => line.startsWith("TRANSCRIPTION_")).length,
    ).toBe(3);
    // Everything that was there is still there, in the order it was.
    expect(result.savedEnvironment.startsWith(result.initialEnvironment)).toBe(
      true,
    );
    expect(result.stdout).toContain(
      "Dictation is local: a Whisper on this computer hears the microphone and nothing leaves it. The first start downloads the model large-v3-turbo-q5_0 (574 MB) once, and until it has finished the microphone answers that it cannot reach the service.",
    );
    expect(result.stdout).toContain("Wrote TRANSCRIPTION_PROVIDER");
    // The second run finds them and writes nothing, but still says dictation is local.
    expect(result.repeated?.exitCode).toBe(0);
    expect(result.repeated?.stdout).not.toContain("Wrote TRANSCRIPTION");
    expect(result.repeated?.stdout).toContain("Dictation is local");
    // Nothing about the key a cloud service would need.
    expect(result.stdout).not.toMatch(/api[_ ]?key/i);
  });

  test.each([
    ["TRANSCRIPTION_PROVIDER", "openai-compatible"],
    ["TRANSCRIPTION_BASE_URL", "https://speech.example/v1"],
    ["TRANSCRIPTION_MODEL", "their-model"],
  ])(
    "a person's own %s means none of the three is written",
    async (key, value) => {
      const result = await runStartWithStaleServerProbe(401, {
        settings: { FREEDUET_DICTATION: "local", [key]: value },
      });
      expect(result.exitCode).toBe(0);
      const written = result.savedEnvironment
        .split("\n")
        .filter((line) => line.startsWith("TRANSCRIPTION_"));
      expect(written).toEqual([`${key}=${value}`]);
      expect(result.stdout).not.toContain("Wrote TRANSCRIPTION");
      // The service still starts: only the three settings are theirs.
      expect(upLine(result.dockerLog)).toBe(`${BASELINE_UP} whisper`);
    },
  );

  test("the model and the port come from .env", async () => {
    const result = await runStartWithStaleServerProbe(401, {
      settings: {
        FREEDUET_DICTATION: "local",
        FREEDUET_WHISPER_MODEL: "small",
        WHISPER_PORT: "4999",
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.savedEnvironment).toContain(
      "TRANSCRIPTION_BASE_URL=http://127.0.0.1:4999/v1\n",
    );
    expect(result.stdout).toContain("the model small (488 MB)");
  });

  test.each([
    [
      "a flag that is not local",
      { FREEDUET_DICTATION: "on" },
      "FREEDUET_DICTATION must be local",
    ],
    [
      "a model outside the closed list",
      { FREEDUET_DICTATION: "local", FREEDUET_WHISPER_MODEL: "large-v3" },
      "FREEDUET_WHISPER_MODEL must be one of: large-v3-turbo-q5_0, large-v3-turbo, small, base",
    ],
    [
      "a port that is not a number",
      { FREEDUET_DICTATION: "local", WHISPER_PORT: "4240/x" },
      "WHISPER_PORT must be a port number",
    ],
  ])(
    "%s is refused before anything starts or is written",
    async (_name, settings, message) => {
      const result = await runStartWithStaleServerProbe(401, { settings });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(message);
      expect(result.dockerLog).toBe("");
      expect(result.savedEnvironment).toBe(result.initialEnvironment);
    },
  );

  test("the models and sizes this script knows are the ones in shared/whisper-models.ts", async () => {
    const { WHISPER_MODELS } = await import("../shared/whisper-models");
    const script = await readFile("scripts/start.sh", "utf8");
    const known = [
      ...script.matchAll(
        /^\s+([a-z0-9._-]+)\) WHISPER_MODEL_SIZE="([^"]+)" ;;$/gm,
      ),
    ].map((match) => [match[1], match[2]]);
    expect(known).toEqual(
      Object.entries(WHISPER_MODELS).map(([name, model]) => [
        name,
        model.sizeLabel,
      ]),
    );
    expect(script).toContain(
      `FREEDUET_WHISPER_MODEL must be one of: ${Object.keys(WHISPER_MODELS).join(", ")}.`,
    );
  });

  test("stop.sh names the profile, so Compose stops the Whisper it started", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      script: "stop",
      worker: "own",
    });
    expect(result.exitCode).toBe(0);
    expect(result.dockerLog).toContain("COMPOSE_PROFILES=whisper");
    expect(result.dockerLog).toContain("compose ps --quiet");
  });
});

/*
 * The installation secret (docs/M1_PLAN.md D28). With no sign-in the person is whoever reaches the
 * server from this machine's loopback, and on Docker Desktop a Bot's computer reaches it as loopback
 * too, so what tells the person's browser from a Bot's computer is one random secret per installation.
 * start.sh makes it, once, in the settings file. Nothing else may carry it: not an argument (every
 * process on the machine reads those), not the environment of a child (Compose and the Bots'
 * containers are children), and not the output.
 */
describe("start.sh installation secret (D28)", () => {
  const secretIn = (environment: string) =>
    environment.match(/^FREEDUET_INSTALL_SECRET=([0-9a-f]{64})$/m)?.[1] ?? "";
  /** An install from before the secret existed: nothing in its settings file. */
  const fresh = { omitFromEnv: ["FREEDUET_INSTALL_SECRET"] } as const;
  const pairedLink =
    "http://localhost:3010/api/pair?token=pairing-token-fixture_123";

  test("an install with no secret gets one on its first start, and keeps its other settings", async () => {
    const result = await runStartWithStaleServerProbe(400, fresh);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(secretIn(result.savedEnvironment)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      result.savedEnvironment.match(/^FREEDUET_INSTALL_SECRET=/gm),
    ).toHaveLength(1);
    // Every setting the file already had is still there.
    for (const line of result.initialEnvironment.split("\n").filter(Boolean))
      expect(result.savedEnvironment).toContain(`${line}\n`);
  });

  /** `.env.example` ships the line empty, like FREEDUET_LOCAL_KEY: an empty line is no secret. */
  test("an empty line in the file is replaced, not repeated", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      settings: { FREEDUET_INSTALL_SECRET: "" },
    });

    expect(result.exitCode).toBe(0);
    expect(secretIn(result.savedEnvironment)).toMatch(/^[0-9a-f]{64}$/);
    expect(result.savedEnvironment).not.toMatch(/^FREEDUET_INSTALL_SECRET=$/m);
    expect(
      result.savedEnvironment.match(/^FREEDUET_INSTALL_SECRET=/gm),
    ).toHaveLength(1);
  });

  test("no two installations get the same one", async () => {
    const [first, second] = await Promise.all([
      runStartWithStaleServerProbe(400, fresh),
      runStartWithStaleServerProbe(400, fresh),
    ]);

    expect(secretIn(first.savedEnvironment)).not.toBe("");
    expect(secretIn(second.savedEnvironment)).not.toBe("");
    expect(secretIn(first.savedEnvironment)).not.toBe(
      secretIn(second.savedEnvironment),
    );
  });

  test("the file is readable by its owner alone, and the run says it made the secret without saying what it is", async () => {
    const result = await runStartWithStaleServerProbe(400, fresh);
    const secret = secretIn(result.savedEnvironment);

    expect(secret).not.toBe("");
    // Where this file system keeps permission bits at all.
    expect(result.modesSupported ? result.savedEnvironmentMode : 0o600).toBe(
      0o600,
    );
    expect(result.stdout).toContain(
      "Generated FREEDUET_INSTALL_SECRET and wrote it to .env.",
    );
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  });

  /** The server reads its settings once, at its start: one that was running cannot know the new secret. */
  test("a server that was already running is restarted to read it", async () => {
    const result = await runStartWithStaleServerProbe(400, fresh);

    expect(result.exitCode).toBe(0);
    expect(result.signalLog).toBe("91000001\n91000002\n");
    expect(result.serverLaunch).toBe(
      `--env-file=../.env ${result.directory}/server/src/production-entry.ts\n`,
    );
  });

  test("an install that has it is left alone: nothing written, nothing said, no restart", async () => {
    const result = await runStartWithStaleServerProbe(400);

    expect(result.exitCode).toBe(0);
    expect(result.signalLog).toBe("");
    expect(secretIn(result.savedEnvironment)).toBe(FIXTURE_INSTALL_SECRET);
    expect(result.stdout).not.toContain("FREEDUET_INSTALL_SECRET");
  });

  test("a later start keeps the same secret, restarts nothing and opens no second window", async () => {
    const result = await runStartWithStaleServerProbe(400, {
      ...fresh,
      repeatStart: true,
      processEnvironment: { FREEDUET_NO_BROWSER: "" },
    });
    const first = secretIn(result.firstSavedEnvironment);

    expect(first).not.toBe("");
    expect(secretIn(result.savedEnvironment)).toBe(first);
    expect(result.repeated).toMatchObject({
      exitCode: 0,
      stderr: "",
      signalLog: "",
    });
    expect(result.repeated?.stdout ?? "").not.toContain(
      "FREEDUET_INSTALL_SECRET",
    );
    // The first start opened one, because it had just made the secret and no browser held it yet.
    expect(result.browserLog).toBe(`fake-browser ${pairedLink}\n`);
  });

  /**
   * `export`, which the tokens above it need so that Compose can read them, is what this must not do:
   * everything exported reaches every child, and the Bots' containers are started by one.
   */
  test("no program the script starts is given the secret in its environment", async () => {
    const result = await runStartWithStaleServerProbe(400, fresh);

    // The probes saw Compose and the server's own launch at all.
    expect(result.dockerLog).toContain("compose up");
    expect(result.serverLaunch).not.toBe("");
    expect(result.leakLog).toBe("");
  });

  test.each([
    ["with no secret yet", fresh],
    ["with one already", {}],
  ] as const)(
    "the call it makes as the person carries the cookie in a file of its own, never in an argument (%s)",
    async (_name, run) => {
      const result = await runStartWithStaleServerProbe(400, run);
      const secret = secretIn(result.savedEnvironment);
      const asPerson = result.curlConfigs.filter((call) =>
        call.command.includes("/api/copilotkit/info"),
      );

      expect(secret).not.toBe("");
      expect(asPerson).toHaveLength(1);
      expect(asPerson[0].held).toBe(
        `header = "Cookie: freeduet_install_3001=${secret}"`,
      );
      expect(result.modesSupported ? asPerson[0].mode : "600").toBe("600");
      // Gone as soon as the call is over, and no call of the run carries the secret as an argument.
      expect(existsSync(asPerson[0].path)).toBe(false);
      expect(result.curlLog).not.toContain(secret);
    },
  );

  describe("the browser", () => {
    const opens = { FREEDUET_NO_BROWSER: "" };

    test("is opened on the paired link when the secret was just made, and told nothing else", async () => {
      const result = await runStartWithStaleServerProbe(400, {
        ...fresh,
        processEnvironment: opens,
      });
      const secret = secretIn(result.savedEnvironment);
      const asked = result.curlConfigs.filter((call) =>
        call.command.includes("/internal/pairing"),
      );

      expect(result.exitCode).toBe(0);
      expect(result.browserLog).toBe(`fake-browser ${pairedLink}\n`);
      // The link was asked for with the secret in a file of its own, and the secret is in none of what
      // the browser, the screen or the process list could show.
      expect(asked).toHaveLength(1);
      expect(asked[0].held).toBe(`header = "Authorization: Bearer ${secret}"`);
      expect(asked[0].command).toContain("-X POST");
      expect(result.browserLog).not.toContain(secret);
      expect(result.stdout).not.toContain(secret);
      expect(result.curlLog).not.toContain(secret);
    });

    test.each([
      ["CI is set", { CI: "true" }],
      ["FREEDUET_NO_BROWSER is 1", { FREEDUET_NO_BROWSER: "1" }],
    ] as const)("is not opened when %s", async (_name, environment) => {
      const result = await runStartWithStaleServerProbe(400, {
        ...fresh,
        processEnvironment: { ...opens, ...environment },
      });

      expect(result.exitCode).toBe(0);
      expect(secretIn(result.savedEnvironment)).not.toBe("");
      expect(result.browserLog).toBe("");
      // And the way to a browser is on the screen for whoever wants one.
      expect(result.stdout).toContain("bash scripts/open.sh");
    });

    test("is not opened on a start that made no secret: that browser holds it already", async () => {
      const result = await runStartWithStaleServerProbe(400, {
        processEnvironment: opens,
      });

      expect(result.exitCode).toBe(0);
      expect(result.browserLog).toBe("");
      expect(result.curlConfigs.map((call) => call.command)).not.toContain(
        "/internal/pairing",
      );
    });

    test("is not opened for a second stack (the eval stack has nobody to look at it)", async () => {
      const result = await runStartWithStaleServerProbe(400, {
        ...fresh,
        envFile: ".env.eval",
        portFree: true,
        processEnvironment: opens,
      });

      expect(result.exitCode).toBe(0);
      expect(secretIn(result.savedEnvironment)).not.toBe("");
      expect(result.browserLog).toBe("");
      expect(result.personEnvironment).toBe("PERSON=untouched\n");
    });

    test("a browser that cannot be opened does not stop the start, and says how to open one", async () => {
      const result = await runStartWithStaleServerProbe(400, {
        ...fresh,
        processEnvironment: { ...opens, PAIRING: "401" },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Ready. http://localhost:3010");
      expect(result.stdout).toContain(
        "Could not open a browser. Run: bash scripts/open.sh",
      );
      expect(result.browserLog).toBe("");
    });
  });
});

/*
 * scripts/open.sh (D28): the way a browser gets the secret. It asks the server for a link that is good
 * once and for two minutes, and hands the browser that, so the secret itself is never in a URL.
 */
describe("scripts/open.sh (D28)", () => {
  const open = (run: Run = {}) =>
    runStartWithStaleServerProbe(400, { script: "open", ...run });
  const link = "http://localhost:3010/api/pair?token=pairing-token-fixture_123";
  // The branch that falls through every program is the one a WSL kernel never reaches, since there the
  // address is always handed to Windows.
  const onWsl = /microsoft/i.test(
    existsSync("/proc/version") ? readFileSync("/proc/version", "utf8") : "",
  );

  test("asks for a link with the secret in a file of its own and opens the browser on it", async () => {
    const result = await open();
    const asked = result.curlConfigs.filter((call) =>
      call.command.includes("/internal/pairing"),
    );

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(result.stdout).toContain("Opened FreeDuet in your browser.");
    expect(result.browserLog).toBe(`fake-browser ${link}\n`);
    expect(asked).toHaveLength(1);
    expect(asked[0].held).toBe(
      `header = "Authorization: Bearer ${FIXTURE_INSTALL_SECRET}"`,
    );
    expect(asked[0].command).toContain("-X POST");
    expect(asked[0].command).toEndWith(
      "http://localhost:3001/internal/pairing",
    );
    expect(result.modesSupported ? asked[0].mode : "600").toBe("600");
    expect(existsSync(asked[0].path)).toBe(false);
    // Nowhere it could be read from: not an argument, not the screen, not the browser, not a child.
    for (const place of [
      result.curlLog,
      result.stdout,
      result.stderr,
      result.browserLog,
      result.leakLog,
    ])
      expect(place).not.toContain(FIXTURE_INSTALL_SECRET);
    expect(result.leakLog).toBe("");
  });

  test("--print prints the link and opens nothing", async () => {
    const result = await open({ args: ["--print"] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${link}\n`);
    expect(result.browserLog).toBe("");
  });

  test("a stack with its own settings file reads that one, and leaves the person's alone", async () => {
    const result = await open({ envFile: ".env.eval" });

    expect(result.exitCode).toBe(0);
    expect(result.browserLog).toBe(`fake-browser ${link}\n`);
    expect(result.personEnvironment).toBe("PERSON=untouched\n");
  });

  test("a server with nothing to pair (sign-in, or open beyond this machine) gets the plain address", async () => {
    const result = await open({ processEnvironment: { PAIRING: "404" } });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("has nothing to pair with");
    expect(result.browserLog).toBe("fake-browser http://localhost:3010/\n");
  });

  test("a server that does not accept the secret is a start that did not finish, and says so", async () => {
    const result = await open({ processEnvironment: { PAIRING: "401" } });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "The server did not accept this installation's secret.",
    );
    expect(result.stdout).toContain("Run: bash scripts/start.sh");
    expect(result.browserLog).toBe("");
  });

  test("any other answer from the server opens nothing", async () => {
    const result = await open({ processEnvironment: { PAIRING: "500" } });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("answered HTTP 500");
    expect(result.browserLog).toBe("");
  });

  test("a server that is not answering opens nothing", async () => {
    const result = await open({ processEnvironment: { PAIRING: "down" } });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("not answering on port 3001");
    expect(result.browserLog).toBe("");
  });

  /** A link opened at an app that is not there is a link spent: it is good once. */
  test("asks for no link while the app is not answering", async () => {
    const result = await open({ processEnvironment: { APP_DOWN: "1" } });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("app is not answering on port 3010");
    expect(result.curlLog).not.toContain("/internal/pairing");
    expect(result.browserLog).toBe("");
  });

  /** What the server answers is data: only a path of this app's own, with a token, is ever opened. */
  test("opens nothing but a link of the app's own", async () => {
    const result = await open({ processEnvironment: { PAIRING: "bad-link" } });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("was not a link");
    expect(result.browserLog).toBe("");
  });

  test("a settings file with no secret says to start, and asks the server nothing", async () => {
    const result = await open({ omitFromEnv: ["FREEDUET_INSTALL_SECRET"] });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      ".env has no FREEDUET_INSTALL_SECRET. Run: bash scripts/start.sh",
    );
    expect(result.curlLog).toBe("");
    expect(result.browserLog).toBe("");
  });

  test.skipIf(onWsl)(
    "when no program can open it, prints the link once, for the person to open",
    async () => {
      const result = await open({ processEnvironment: { OPENER: "fails" } });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.split("\n")).toContain(link);
      expect(result.stdout).toContain("within two minutes");
      expect(result.stdout).not.toContain("Opened FreeDuet");
      // The named program was tried first, then each of the usual ones in turn.
      expect(result.browserLog.split("\n")[0]).toBe(`fake-browser ${link}`);
      expect(result.browserLog).toContain("UNEXPECTED xdg-open");
    },
  );

  test("--help says what it is for, and an unknown argument is refused", async () => {
    const help = await open({ args: ["--help"] });
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("bash scripts/open.sh --print");
    expect(help.stdout).not.toContain("set -euo pipefail");

    const refused = await open({ args: ["--secret"] });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toContain("Unknown argument: --secret");
    expect(refused.curlLog).toBe("");
  });
});
