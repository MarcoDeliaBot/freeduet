/**
 * The Italian test split of Google FLEURS, fetched from its official dataset repository
 * (https://huggingface.co/datasets/google/fleurs, CC BY 4.0) into a cache folder that git ignores.
 * Nothing from it is committed: not the audio, not the transcripts.
 *
 * The repository keeps one tab-separated file per split (`data/it_it/test.tsv`: the human
 * transcript of every recording) and one archive of the audio (`data/it_it/audio/test.tar.gz`, about
 * 660 MB, one WAV per row, 16 kHz mono). The archive is downloaded once. Only the clips a run asks for
 * are unpacked, and `tar` does that, so it must be on the PATH (it is in WSL, macOS and Linux).
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFleursTsv, pickEvenly, wavDurationSeconds } from "./metrics";

const FLEURS_URL =
  "https://huggingface.co/datasets/google/fleurs/resolve/main/data/it_it/";

export type Clip = {
  id: string;
  fileName: string;
  /** Where the WAV is on disk. */
  path: string;
  /** The sentence as a person wrote it: case and punctuation included. */
  reference: string;
  seconds: number;
};

type Fetcher = (url: string) => Promise<Response>;

async function download(
  url: string,
  path: string,
  fetcher: Fetcher,
  log: (line: string) => void,
) {
  log(`Downloading ${url}`);
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}.`);
  }
  const partial = `${path}.partial`;
  await Bun.write(partial, response);
  const expected = Number(response.headers.get("content-length") ?? 0);
  const size = Bun.file(partial).size;
  if (expected > 0 && size !== expected) {
    rmSync(partial, { force: true });
    throw new Error(
      `${url} was cut short: ${size} bytes of ${expected}. Run again to retry.`,
    );
  }
  renameSync(partial, path);
}

async function run(command: string[], stdin?: string): Promise<string> {
  const child = Bun.spawn(command, {
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `${command.join(" ")} failed (${code}): ${err.trim().slice(0, 300)}`,
    );
  }
  return out;
}

export async function loadClips(options: {
  n: number;
  cacheDir: string;
  fetch?: Fetcher;
  log?: (line: string) => void;
}): Promise<Clip[]> {
  const fetcher: Fetcher =
    options.fetch ?? ((url) => fetch(url, { redirect: "follow" }));
  const log = options.log ?? (() => {});
  const root = join(options.cacheDir, "it_it");
  const clipsDir = join(root, "clips");
  mkdirSync(clipsDir, { recursive: true });

  const tsv = join(root, "test.tsv");
  if (!existsSync(tsv))
    await download(`${FLEURS_URL}test.tsv`, tsv, fetcher, log);
  const rows = pickEvenly(
    parseFleursTsv(await Bun.file(tsv).text()),
    options.n,
  );
  // A sentence read by several people is several rows with different files, so no two rows share one.
  const chosen = [...new Map(rows.map((row) => [row.fileName, row])).values()];

  const missing = chosen.filter(
    (row) => !existsSync(join(clipsDir, row.fileName)),
  );
  if (missing.length > 0) {
    const archive = join(root, "test.tar.gz");
    if (!existsSync(archive))
      await download(`${FLEURS_URL}audio/test.tar.gz`, archive, fetcher, log);
    log(`Unpacking ${missing.length} clips from the archive`);
    // The archive's own member names, because the folder inside it is not something to guess.
    const members = (await run(["tar", "-tzf", archive]))
      .split("\n")
      .filter((member) => member.endsWith(".wav"));
    const byName = new Map(members.map((member) => [basename(member), member]));
    const wanted = missing.map((row) => {
      const member = byName.get(row.fileName);
      if (!member) {
        throw new Error(
          `${row.fileName} is in test.tsv but not in the audio archive.`,
        );
      }
      return member;
    });
    const staging = join(root, "unpack");
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    await run(
      ["tar", "-xzf", archive, "-C", staging, "-T", "-"],
      `${wanted.join("\n")}\n`,
    );
    for (const member of wanted) {
      renameSync(join(staging, member), join(clipsDir, basename(member)));
    }
    rmSync(staging, { recursive: true, force: true });
  }

  return Promise.all(
    chosen.map(async (row) => {
      const path = join(clipsDir, row.fileName);
      return {
        id: row.id,
        fileName: row.fileName,
        path,
        reference: row.reference,
        seconds:
          row.samples > 0
            ? row.samples / 16000
            : wavDurationSeconds(
                new Uint8Array(await Bun.file(path).arrayBuffer()),
              ),
      };
    }),
  );
}
