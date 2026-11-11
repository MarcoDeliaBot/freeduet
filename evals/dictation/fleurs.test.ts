import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadClips } from "./fleurs";
import { pcm16Wav } from "./metrics";

/**
 * A made-up miniature of the FLEURS Italian test split: four recordings of 0.5 to 2 seconds with the
 * dataset's own layout (a tab separated list and a tar.gz with a folder of WAV files), served by an
 * injected fetch. Nothing here touches the network or the real data.
 */
const ROWS = [
  { id: "11", file: "100.wav", text: "Ciao, Marco.", samples: 8000 },
  { id: "12", file: "101.wav", text: "Come stai?", samples: 16000 },
  { id: "13", file: "102.wav", text: "Va tutto bene.", samples: 24000 },
  { id: "14", file: "103.wav", text: "A domani!", samples: 32000 },
];

let work: string;
let archive: Uint8Array<ArrayBuffer>;
let tsv: string;
let requested: string[];

beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), "freeduet-fleurs-test-"));
  const source = join(work, "source", "test");
  mkdirSync(source, { recursive: true });
  for (const row of ROWS) {
    writeFileSync(
      join(source, row.file),
      pcm16Wav(new Int16Array(row.samples), 16000),
    );
  }
  const packed = Bun.spawnSync(
    [
      "tar",
      "-czf",
      join(work, "test.tar.gz"),
      "-C",
      join(work, "source"),
      "test",
    ],
    { stderr: "pipe" },
  );
  expect(packed.exitCode).toBe(0);
  archive = await Bun.file(join(work, "test.tar.gz")).bytes();
  // id, file name, transcript, normalised transcript, characters, samples, gender
  tsv = ROWS.map((row) =>
    [
      row.id,
      row.file,
      row.text,
      row.text.toLowerCase(),
      "c h a r s",
      row.samples,
      "MALE",
    ].join("\t"),
  ).join("\n");
  requested = [];
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

const served =
  (overrides: Record<string, () => Response> = {}) =>
  async (url: string) => {
    requested.push(url);
    const name = url.split("/").pop() as string;
    const override = overrides[name];
    if (override) return override();
    if (name === "test.tsv") return new Response(tsv);
    if (name === "test.tar.gz") return new Response(archive);
    return new Response("", { status: 404 });
  };

const cache = () => join(work, "cache");
const unpacked = () => readdirSync(join(cache(), "it_it", "clips")).sort();

describe("loadClips", () => {
  test("unpacks only the clips it picks, with their sentences and lengths", async () => {
    const clips = await loadClips({ n: 2, cacheDir: cache(), fetch: served() });
    expect(clips.map((clip) => clip.id)).toEqual(["100", "102"]);
    expect(clips.map((clip) => clip.reference)).toEqual([
      "Ciao, Marco.",
      "Va tutto bene.",
    ]);
    expect(clips.map((clip) => clip.seconds)).toEqual([0.5, 1.5]);
    expect(unpacked()).toEqual(["100.wav", "102.wav"]);
    // The staging folder of the unpacking is gone.
    expect(readdirSync(join(cache(), "it_it")).sort()).toEqual([
      "clips",
      "test.tar.gz",
      "test.tsv",
    ]);
    expect((await Bun.file(clips[0]?.path as string).bytes()).byteLength).toBe(
      44 + 8000 * 2,
    );
  });

  test("a second run uses the cache and downloads nothing; a bigger run unpacks only what is new", async () => {
    await loadClips({ n: 2, cacheDir: cache(), fetch: served() });
    expect(requested.map((url) => url.split("/").pop())).toEqual([
      "test.tsv",
      "test.tar.gz",
    ]);

    requested = [];
    await loadClips({ n: 2, cacheDir: cache(), fetch: served() });
    expect(requested).toEqual([]);

    await loadClips({ n: 4, cacheDir: cache(), fetch: served() });
    expect(requested).toEqual([]);
    expect(unpacked()).toEqual(["100.wav", "101.wav", "102.wav", "103.wav"]);
  });

  test("asks the official dataset repository, over https", async () => {
    await loadClips({ n: 1, cacheDir: cache(), fetch: served() });
    expect(requested).toEqual([
      "https://huggingface.co/datasets/google/fleurs/resolve/main/data/it_it/test.tsv",
      "https://huggingface.co/datasets/google/fleurs/resolve/main/data/it_it/audio/test.tar.gz",
    ]);
  });

  test("says which download failed", async () => {
    await expect(
      loadClips({
        n: 1,
        cacheDir: cache(),
        fetch: served({ "test.tsv": () => new Response("", { status: 503 }) }),
      }),
    ).rejects.toThrow(
      "https://huggingface.co/datasets/google/fleurs/resolve/main/data/it_it/test.tsv answered 503.",
    );
  });

  test("a clip in the list but not in the archive is named", async () => {
    tsv += "\n15\t999.wav\tManca.\tmanca\tm a n c a\t16000\tMALE";
    await expect(
      loadClips({ n: 5, cacheDir: cache(), fetch: served() }),
    ).rejects.toThrow("999.wav is in test.tsv but not in the audio archive.");
  });

  test("a list that is not the dataset's layout is refused naming the line", async () => {
    await expect(
      loadClips({
        n: 1,
        cacheDir: cache(),
        fetch: served({ "test.tsv": () => new Response("one\ttwo\n") }),
      }),
    ).rejects.toThrow(
      "FLEURS test.tsv line 1 does not have the expected columns",
    );
  });
});
