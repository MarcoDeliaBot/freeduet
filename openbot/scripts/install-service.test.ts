import { afterEach, describe, expect, test } from "bun:test";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * `scripts/install-service.sh`, which writes a systemd unit that starts FreeDuet after Docker.
 *
 * WHAT THIS PROVES: what the script decides (the text of the unit, what it refuses, that it asks before
 * any sudo, that `--print` runs nothing, that a second run does nothing). WHAT IT CANNOT PROVE: that real
 * systemd accepts the unit and runs it at a WSL boot. `id`, `sudo` and `systemctl` are fakes on a PATH in
 * front of the real one; the fake sudo is a whitelist, so a new command fails here.
 */

const scriptsDirectory = import.meta.dir;
const bash = Bun.which("bash") as string;
const slow = 30_000;
const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length > 0) {
    await rm(dirs.pop() as string, { recursive: true, force: true });
  }
});

async function executable(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  await chmod(path, 0o755);
}

type Options = {
  systemd?: boolean;
  uid?: string;
  folder?: string;
  withSudo?: boolean;
};

async function build(o: Options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "freeduet-service-"));
  dirs.push(dir);
  const root = join(dir, "root");
  const state = join(dir, "state");
  const bin = join(dir, "bin");
  const home = join(dir, "home");
  const repo = join(home, o.folder ?? "freeduet");
  await mkdir(state, { recursive: true });
  await mkdir(join(root, "etc/systemd/system"), { recursive: true });
  if (o.systemd !== false)
    await mkdir(join(root, "run/systemd/system"), { recursive: true });
  const scripts = join(repo, "openbot/scripts");
  await mkdir(scripts, { recursive: true });
  for (const name of ["install-service.sh", "require-bash.sh"]) {
    await cp(join(scriptsDirectory, name), join(scripts, name));
  }
  await executable(
    join(bin, "id"),
    `#!/bin/sh\ncase "$1" in -un) echo tester ;; -u) echo "${o.uid ?? "1000"}" ;; esac\n`,
  );
  if (o.withSudo !== false) {
    await executable(
      join(bin, "sudo"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$STATE/sudo.log"
case "$1" in install|systemctl|rm) exec "$@" ;; esac
echo "fake sudo: not on the whitelist: $1" >&2
exit 99
`,
    );
  }
  await executable(
    join(bin, "systemctl"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$STATE/systemctl.log"
case "$1" in
  enable) touch "$STATE/enabled" ;;
  disable) rm -f "$STATE/enabled" ;;
  is-enabled) [ -f "$STATE/enabled" ] || exit 1 ;;
esac
exit 0
`,
  );
  // A PATH that holds the fakes and a few real tools, nothing else: a real sudo or systemctl can never answer.
  const tools = join(dir, "tools");
  await mkdir(tools, { recursive: true });
  for (const name of [
    "bash",
    "cat",
    "cmp",
    "mktemp",
    "rm",
    "dirname",
    "install",
    "env",
    "touch",
  ]) {
    const real = Bun.which(name);
    if (real) await symlink(real, join(tools, name));
  }
  const env: Record<string, string> = {
    PATH: `${bin}:${tools}`,
    STATE: state,
    HOME: home,
    FREEDUET_INSTALL_ROOT: root,
  };
  const script = join(scripts, "install-service.sh");
  async function run(args: string[] = [], input?: string) {
    const child = Bun.spawn({
      cmd: [bash, script, ...args],
      cwd: home,
      env,
      stdin: input === undefined ? null : new Blob([input]),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  }
  const lines = async (name: string) =>
    (await readFile(join(state, name), "utf8").catch(() => ""))
      .split("\n")
      .filter(Boolean);
  const unitPath = join(root, "etc/systemd/system/freeduet.service");
  return {
    repo,
    home,
    run,
    unitPath,
    sudo: () => lines("sudo.log"),
    systemctl: () => lines("systemctl.log"),
    unit: () => readFile(unitPath, "utf8"),
  };
}

describe("install-service.sh", () => {
  test(
    "--print shows the unit and runs nothing: no sudo, no systemctl, no file",
    async () => {
      const machine = await build({ systemd: false });
      const result = await machine.run(["--print"]);
      expect(result.exitCode).toBe(0);
      expect(await machine.sudo()).toEqual([]);
      expect(await machine.systemctl()).toEqual([]);
      expect(await Bun.file(machine.unitPath).exists()).toBe(false);
      const text = result.stdout;
      expect(text).toContain("[Unit]");
      expect(text).toContain("Requires=docker.service");
      expect(text).toContain("After=network-online.target docker.service");
      expect(text).toContain("Type=oneshot");
      expect(text).toContain("RemainAfterExit=yes");
      expect(text).toContain("User=tester");
      expect(text).toContain(`WorkingDirectory=${machine.repo}`);
      expect(text).toContain(
        `ExecStartPre=/bin/bash ${machine.repo}/scripts/stop.sh --keep-computers`,
      );
      expect(text).toContain(
        `ExecStart=/bin/bash ${machine.repo}/scripts/start.sh`,
      );
      expect(text).toContain(
        `ExecStop=/bin/bash ${machine.repo}/scripts/stop.sh\n`,
      );
      expect(text).toContain("docker info");
      expect(text).toContain("WantedBy=multi-user.target");
      expect(text).not.toMatch(/^User=root$/m);
    },
    slow,
  );

  test(
    "the unit waits for Docker, then clears, then starts: in that order",
    async () => {
      const machine = await build();
      const text = (await machine.run(["--print"])).stdout;
      const wait = text.indexOf("docker info");
      const clear = text.indexOf("stop.sh --keep-computers");
      const start = text.indexOf("ExecStart=");
      expect(wait).toBeGreaterThan(0);
      expect(clear).toBeGreaterThan(wait);
      expect(start).toBeGreaterThan(clear);
    },
    slow,
  );

  test(
    "it asks first; with no answer it changes nothing and runs no sudo",
    async () => {
      const machine = await build();
      const result = await machine.run([], "n\n");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Nothing was changed");
      expect(await machine.sudo()).toEqual([]);
      expect(await Bun.file(machine.unitPath).exists()).toBe(false);
    },
    slow,
  );

  test(
    "after a yes: writes the file, reloads, enables; does not start it now",
    async () => {
      const machine = await build();
      const result = await machine.run([], "y\n");
      expect(result.exitCode).toBe(0);
      const calls = await machine.sudo();
      expect(calls).toHaveLength(3);
      expect(calls[0]).toMatch(
        /^install -m 0644 \S+ \S+\/etc\/systemd\/system\/freeduet\.service$/,
      );
      expect(calls[1]).toBe("systemctl daemon-reload");
      expect(calls[2]).toBe("systemctl enable freeduet.service");
      expect(await machine.unit()).toContain("ExecStart=/bin/bash");
      const everything = (await machine.systemctl()).join("\n");
      expect(everything).not.toMatch(/\b(start|restart|enable --now)\b/);
    },
    slow,
  );

  test(
    "a second run, with the file current and the unit enabled, does nothing",
    async () => {
      const machine = await build();
      await machine.run(["--yes"]);
      const before = (await machine.sudo()).length;
      const result = await machine.run(["--yes"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Nothing to do");
      expect((await machine.sudo()).length).toBe(before);
    },
    slow,
  );

  test(
    "a changed file is rewritten (the checkout moved, say)",
    async () => {
      const machine = await build();
      await machine.run(["--yes"]);
      await writeFile(machine.unitPath, "[Unit]\nDescription=old\n");
      const before = (await machine.sudo()).length;
      const result = await machine.run(["--yes"]);
      expect(result.exitCode).toBe(0);
      expect((await machine.sudo()).length).toBe(before + 3);
      expect(await machine.unit()).toContain("Requires=docker.service");
    },
    slow,
  );

  test(
    "without systemd it stops before any command and says how to turn it on",
    async () => {
      const machine = await build({ systemd: false });
      const result = await machine.run(["--yes"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("systemd=true");
      expect(await machine.sudo()).toEqual([]);
      expect(await Bun.file(machine.unitPath).exists()).toBe(false);
    },
    slow,
  );

  test(
    "as root it refuses: the service must run as the person",
    async () => {
      const machine = await build({ uid: "0" });
      for (const args of [["--print"], ["--yes"]]) {
        const result = await machine.run(args);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("not as root");
      }
      expect(await machine.sudo()).toEqual([]);
    },
    slow,
  );

  test(
    "a folder with a space or a percent sign is refused, so the unit cannot say something else",
    async () => {
      for (const folder of ["my freeduet", "free%duet"]) {
        const machine = await build({ folder });
        const result = await machine.run(["--print"]);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("cannot carry safely");
        expect(result.stdout).toBe("");
      }
    },
    slow,
  );

  test(
    "no sudo on the machine: stops with the reason, changes nothing",
    async () => {
      const machine = await build({ withSudo: false });
      const result = await machine.run(["--yes"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("sudo is not installed");
      expect(await Bun.file(machine.unitPath).exists()).toBe(false);
    },
    slow,
  );

  test(
    "--remove disables, deletes and reloads, after a yes; with nothing installed it does nothing",
    async () => {
      const machine = await build();
      const none = await machine.run(["--remove", "--yes"]);
      expect(none.exitCode).toBe(0);
      expect(none.stdout).toContain("Nothing to do");
      expect(await machine.sudo()).toEqual([]);

      await machine.run(["--yes"]);
      const before = (await machine.sudo()).length;
      const result = await machine.run(["--remove", "--yes"]);
      expect(result.exitCode).toBe(0);
      expect((await machine.sudo()).slice(before)).toEqual([
        "systemctl disable freeduet.service",
        `rm -f ${machine.unitPath}`,
        "systemctl daemon-reload",
      ]);
      expect(await Bun.file(machine.unitPath).exists()).toBe(false);
    },
    slow,
  );

  test(
    "the script reads no credential and touches no login folder",
    async () => {
      const text = await readFile(
        join(scriptsDirectory, "install-service.sh"),
        "utf8",
      );
      const code = text
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      expect(code).not.toMatch(/\.claude|credential|password|\.env\b/i);
      expect(code).not.toMatch(/curl|wget/);
    },
    slow,
  );

  test("bash -n accepts it", async () => {
    const child = Bun.spawn({
      cmd: [bash, "-n", join(scriptsDirectory, "install-service.sh")],
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(0);
  });
});
