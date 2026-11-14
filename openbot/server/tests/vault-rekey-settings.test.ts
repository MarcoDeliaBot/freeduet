import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  manualRecoveryCommand,
  parseArguments,
  replaceSetting,
  rowsInDump,
  settingFrom,
  writeSetting,
} from "../src/freeduet/vault-rekey-command";

/**
 * The parts of `scripts/rekey-vault.ts` that do not need a database: the arguments, and reading and
 * writing the settings file the way `scripts/start.sh` does.
 *
 * start.sh is bash and cannot be imported, and the brief for this command is to use the writer start.sh
 * uses. So the two functions of start.sh that read and write a setting (`file_setting`,
 * `freeduet_env_line`) are taken out of the script and run, and the command's own versions are held to
 * the same output over the same files. If start.sh changes how it writes a setting, these fail until the
 * command does too.
 */

const START = readFileSync(
  join(import.meta.dir, "../../scripts/start.sh"),
  "utf8",
);

/** A function of start.sh, whole, from its first line to the `}` that closes it in column 0. */
function bashFunction(name: string): string {
  const found = START.match(
    new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, "m"),
  );
  if (!found) throw new Error(`${name} is not in start.sh`);
  return found[0];
}

async function inBash(script: string, ...args: string[]) {
  const child = Bun.spawn(["bash", "-c", script, "bash", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

const FILES: Record<string, string> = {
  "an empty file": "",
  "only the key": "KEY_ENCRYPTION_KEY=abc\n",
  "the key in the middle": "A=1\nKEY_ENCRYPTION_KEY=abc\nB=2\n",
  "no newline at the end": "A=1\nKEY_ENCRYPTION_KEY=abc",
  "two key lines, of which the last counts":
    "KEY_ENCRYPTION_KEY=one\nA=1\nKEY_ENCRYPTION_KEY=two\n",
  "a double-quoted value": 'KEY_ENCRYPTION_KEY="quoted"\n',
  "a single-quoted value": "KEY_ENCRYPTION_KEY='quoted'\n",
  "both kinds of quote": `KEY_ENCRYPTION_KEY="'nested'"\n`,
  "an unbalanced quote": 'KEY_ENCRYPTION_KEY="open\n',
  "an empty value": "KEY_ENCRYPTION_KEY=\nA=1\n",
  "equals signs in the value": "KEY_ENCRYPTION_KEY=a=b==\n",
  "names that are not it":
    "KEY_ENCRYPTION_KEY_OLD=old\n#KEY_ENCRYPTION_KEY=commented\n KEY_ENCRYPTION_KEY=indented\nXKEY_ENCRYPTION_KEY=prefixed\n",
  "Windows line endings": "A=1\r\nKEY_ENCRYPTION_KEY=abc\r\nB=2\r\n",
  "blank lines and comments": "# c\n\nKEY_ENCRYPTION_KEY=abc\n\n# d\n",
  "spaces in the value": "KEY_ENCRYPTION_KEY= spaced value \n",
  "shell characters in the value": "KEY_ENCRYPTION_KEY=$HOME`id`;&|\n",
  "just a newline": "\n",
};

describe("reading a setting", () => {
  for (const [name, content] of Object.entries(FILES)) {
    test(`is what start.sh's file_setting reads: ${name}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "rekey-settings-"));
      try {
        const file = join(directory, ".env");
        await writeFile(file, content, "latin1");

        const ran = await inBash(
          `ENV_FILE="$1"\n${bashFunction("file_setting")}\nfile_setting "$2"`,
          file,
          "KEY_ENCRYPTION_KEY",
        );

        expect(ran.code).toBe(0);
        // The shell prints the value and a newline; the value itself has none.
        expect(settingFrom(content, "KEY_ENCRYPTION_KEY")).toBe(
          ran.stdout.replace(/\n$/, ""),
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

describe("writing a setting", () => {
  const VALUES = [
    "Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmE=",
    "a b $c `d` 'e' \"f\" \\g",
  ];
  for (const [name, content] of Object.entries(FILES)) {
    test(`gives the bytes start.sh's freeduet_env_line gives: ${name}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "rekey-settings-"));
      try {
        for (const value of VALUES) {
          const viaBash = join(directory, "bash.env");
          const viaCommand = join(directory, "command.env");
          await writeFile(viaBash, content, {
            encoding: "latin1",
            mode: 0o644,
          });
          await writeFile(viaCommand, content, {
            encoding: "latin1",
            mode: 0o644,
          });

          const ran = await inBash(
            `ENV_FILE="$1"\n${bashFunction("freeduet_env_line")}\nfreeduet_env_line "$2" "$3"`,
            viaBash,
            "KEY_ENCRYPTION_KEY",
            value,
          );
          await writeSetting(viaCommand, "KEY_ENCRYPTION_KEY", value);

          expect(ran.code).toBe(0);
          expect(await readFile(viaCommand, "latin1")).toBe(
            await readFile(viaBash, "latin1"),
          );
          expect(await readFile(viaCommand, "latin1")).toBe(
            replaceSetting(content, "KEY_ENCRYPTION_KEY", value),
          );
          // Both leave the file readable by its owner alone, whatever it was before.
          expect((await stat(viaBash)).mode & 0o777).toBe(0o600);
          expect((await stat(viaCommand)).mode & 0o777).toBe(0o600);
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }

  test("leaves no temporary file beside the settings file, and the other lines in their order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rekey-settings-"));
    try {
      const file = join(directory, ".env");
      await writeFile(file, "A=1\nKEY_ENCRYPTION_KEY=old\nB=2\n");

      await writeSetting(file, "KEY_ENCRYPTION_KEY", "new");

      expect(await readFile(file, "utf8")).toBe(
        "A=1\nB=2\nKEY_ENCRYPTION_KEY=new\n",
      );
      expect(await readdir(directory)).toEqual([".env"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("a file it cannot read is an error, and leaves nothing behind", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rekey-settings-"));
    try {
      await expect(
        writeSetting(join(directory, "missing.env"), "A", "1"),
      ).rejects.toThrow();
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("a read-only directory stops it before the old file is touched", async () => {
    if (process.getuid?.() === 0) return; // root writes anywhere; the case is about everybody else
    const directory = await mkdtemp(join(tmpdir(), "rekey-settings-"));
    try {
      const file = join(directory, ".env");
      await writeFile(file, "KEY_ENCRYPTION_KEY=old\n");
      await chmod(directory, 0o500);
      await expect(
        writeSetting(file, "KEY_ENCRYPTION_KEY", "new"),
      ).rejects.toThrow();
      await chmod(directory, 0o700);
      expect(await readFile(file, "utf8")).toBe("KEY_ENCRYPTION_KEY=old\n");
      expect(await readdir(directory)).toEqual([".env"]);
    } finally {
      await chmod(directory, 0o700);
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("the way to finish by hand", () => {
  test("quotes a path with a space and an apostrophe in it, and writes the key from its file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rekey it's-"));
    try {
      const env = join(directory, ".env");
      const keyFile = join(directory, ".env.vault-new-key-1");
      await writeFile(env, "A=1\nKEY_ENCRYPTION_KEY=old\n");
      await writeFile(keyFile, "the-new-key-value=\n");

      const command = manualRecoveryCommand(env, keyFile);
      const ran = await inBash(command);

      expect(ran.code).toBe(0);
      expect(await readFile(env, "utf8")).toBe(
        "A=1\nKEY_ENCRYPTION_KEY=the-new-key-value=\n",
      );
      expect((await stat(env)).mode & 0o777).toBe(0o600);
      // The key is read from its file by the shell: it is not in the text that is printed.
      expect(command).not.toContain("the-new-key-value");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("the arguments", () => {
  test("--yes and --apply are the only options, in either order", () => {
    expect(parseArguments([])).toEqual({
      kind: "run",
      apply: false,
      yes: false,
    });
    expect(parseArguments(["--yes"])).toEqual({
      kind: "run",
      apply: false,
      yes: true,
    });
    expect(parseArguments(["--apply"])).toEqual({
      kind: "run",
      apply: true,
      yes: false,
    });
    expect(parseArguments(["--yes", "--apply"])).toEqual({
      kind: "run",
      apply: true,
      yes: true,
    });
    expect(parseArguments(["--apply", "--yes"])).toEqual({
      kind: "run",
      apply: true,
      yes: true,
    });
    expect(parseArguments(["--help"])).toEqual({ kind: "help" });
    expect(parseArguments(["-h"])).toEqual({ kind: "help" });
  });

  test("anything else is a problem, and only the option's name is quoted back", () => {
    expect(parseArguments(["--force"])).toEqual({
      kind: "problem",
      message: "Unknown option: --force",
    });
    expect(parseArguments(["--yes", "--key=AAAA-secret-value"])).toEqual({
      kind: "problem",
      message: "Unknown option: --key",
    });
    expect(parseArguments(["apply"])).toMatchObject({ kind: "problem" });
  });
});

describe("reading a dump", () => {
  const dump = (body: string, footer = true) =>
    [
      "--",
      "-- PostgreSQL database dump",
      "--",
      "",
      body,
      ...(footer ? ["-- PostgreSQL database dump complete", "--", ""] : []),
    ].join("\n");

  test("counts the rows of each of the three tables, one to a line", () => {
    const text = dump(
      [
        "COPY public.credentials (id, encrypted_value) FROM stdin;",
        "one\t{...}",
        "two\t{...}",
        "\\.",
        "",
        "COPY public.saved_logins (id) FROM stdin;",
        "\\.",
        "",
        "COPY public.users (id) FROM stdin;",
        "not counted",
        "\\.",
        "",
        "COPY public.sso_providers (id, oidc_config) FROM stdin;",
        "a\t\\N",
        "b\tx\\ny",
        "c\t",
        "\\.",
      ].join("\n"),
    );
    expect(rowsInDump(text)).toEqual({
      credentials: 2,
      saved_logins: 0,
      sso_providers: 3,
    });
  });

  test("a dump that was cut off before its last line is not a dump", () => {
    expect(
      rowsInDump(
        dump("COPY public.credentials (id) FROM stdin;\none\n\\.\n", false),
      ),
    ).toBeUndefined();
    expect(rowsInDump("")).toBeUndefined();
  });
});

describe("the script", () => {
  test("starts, and prints how to use it, without reading any settings", async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "../../scripts/rekey-vault.ts"),
        "--help",
      ],
      { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH } },
    );
    const [code, out] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
    ]);
    expect(code).toBe(0);
    expect(out).toContain("bun scripts/rekey-vault.ts --apply --yes");
  });

  test("refuses an option it does not know, with exit code 2", async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "../../scripts/rekey-vault.ts"),
        "--nope",
      ],
      { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH } },
    );
    const [code, err] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(2);
    expect(err).toContain("Unknown option: --nope");
  });
});
