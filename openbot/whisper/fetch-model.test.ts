import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_WHISPER_MODEL,
  WHISPER_MODEL_REPOSITORY_URL,
  WHISPER_MODELS,
  WHISPER_VAD_MODEL_NAME,
  WHISPER_VAD_MODELS,
  type WhisperModel,
} from "../shared/whisper-models";
import { ensureModel, ModelDownloadError } from "./fetch-model";

const content = new TextEncoder().encode(
  "pretend these are 40 bytes of a model.",
);
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const table: Record<string, WhisperModel> = {
  tiny: {
    file: "ggml-tiny.bin",
    sha256: sha(content),
    bytes: content.length,
    sizeLabel: "38 B",
  },
};

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "whisper-model-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A response whose body arrives in small pieces, like a real download. */
function download(bytes: Uint8Array, init: ResponseInit = {}) {
  const pieces: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += 7)
    pieces.push(bytes.slice(at, at + 7));
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const piece of pieces) controller.enqueue(piece);
        controller.close();
      },
    }),
    init,
  );
}

function recordingFetch(respond: () => Response) {
  const requested: string[] = [];
  return {
    requested,
    fetch: async (url: string) => {
      requested.push(url);
      return respond();
    },
  };
}

describe("ensureModel", () => {
  test("downloads from the official repository, checks it, and leaves only the model", async () => {
    const { fetch, requested } = recordingFetch(() => download(content));
    const lines: string[] = [];
    const path = await ensureModel({
      model: "tiny",
      dir,
      models: table,
      fetch,
      log: (line) => lines.push(line),
    });
    expect(path).toBe(join(dir, "ggml-tiny.bin"));
    expect(requested).toEqual([
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    ]);
    expect(sha(new Uint8Array(await Bun.file(path).arrayBuffer()))).toBe(
      sha(content),
    );
    expect(await readdir(dir)).toEqual(["ggml-tiny.bin"]);
    expect(lines.join("\n")).toContain("checked");
  });

  test("a checksum mismatch deletes the file and fails with a plain message", async () => {
    const wrong = new TextEncoder().encode(
      "pretend these are 40 bytes of a MODEL!",
    );
    expect(wrong.length).toBe(content.length);
    const { fetch } = recordingFetch(() => download(wrong));
    const failure = await ensureModel({
      model: "tiny",
      dir,
      models: table,
      fetch,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ModelDownloadError);
    expect((failure as Error).message).toBe(
      `The model "tiny" did not download correctly: its checksum is not the one its repository publishes. The file was deleted. Start again to retry, and tell the maintainer if it keeps happening.`,
    );
    expect(await readdir(dir)).toEqual([]);
  });

  test("a download of the wrong size fails the same way", async () => {
    for (const bytes of [
      content.slice(0, 20),
      new Uint8Array([...content, ...content]),
    ]) {
      const { fetch } = recordingFetch(() => download(bytes));
      await expect(
        ensureModel({ model: "tiny", dir, models: table, fetch }),
      ).rejects.toThrow("did not download correctly");
      expect(await readdir(dir)).toEqual([]);
    }
  });

  test("a download that never ends is stopped once it is longer than the model can be", async () => {
    let pulls = 0;
    const endless = new Response(
      new ReadableStream({
        pull(controller) {
          pulls++;
          controller.enqueue(new Uint8Array(7));
        },
      }),
    );
    const { fetch } = recordingFetch(() => endless);
    await expect(
      ensureModel({ model: "tiny", dir, models: table, fetch }),
    ).rejects.toThrow("did not download correctly");
    expect(pulls).toBeLessThan(20);
    expect(await readdir(dir)).toEqual([]);
  });

  test("a file already on disk with the right checksum is not downloaded again", async () => {
    await writeFile(join(dir, "ggml-tiny.bin"), content);
    const { fetch, requested } = recordingFetch(() => {
      throw new Error("Must not download");
    });
    const path = await ensureModel({
      model: "tiny",
      dir,
      models: table,
      fetch,
    });
    expect(path).toBe(join(dir, "ggml-tiny.bin"));
    expect(requested).toEqual([]);
  });

  test("a damaged file on disk is deleted and downloaded again", async () => {
    await writeFile(join(dir, "ggml-tiny.bin"), "half a model");
    await writeFile(
      join(dir, "ggml-tiny.bin.partial"),
      "left by a stopped download",
    );
    const { fetch, requested } = recordingFetch(() => download(content));
    await ensureModel({ model: "tiny", dir, models: table, fetch });
    expect(requested.length).toBe(1);
    expect(await readdir(dir)).toEqual(["ggml-tiny.bin"]);
    expect(await Bun.file(join(dir, "ggml-tiny.bin")).text()).toBe(
      new TextDecoder().decode(content),
    );
  });

  test("a damaged file stays deleted when the new download is wrong too", async () => {
    await writeFile(join(dir, "ggml-tiny.bin"), "half a model");
    const { fetch } = recordingFetch(() => download(content.slice(0, 5)));
    await expect(
      ensureModel({ model: "tiny", dir, models: table, fetch }),
    ).rejects.toThrow(ModelDownloadError);
    expect(await readdir(dir)).toEqual([]);
  });

  test("an answer that is not a success is a plain message, and nothing is left behind", async () => {
    const { fetch } = recordingFetch(
      () => new Response("secret-looking body", { status: 503 }),
    );
    const failure = await ensureModel({
      model: "tiny",
      dir,
      models: table,
      fetch,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect((failure as Error).message).toBe(
      `The model "tiny" could not be downloaded: its repository answered 503. Start again to retry.`,
    );
    expect(await readdir(dir)).toEqual([]);
  });

  test("a redirect that ends anywhere but https is refused", async () => {
    const insecure = download(content);
    Object.defineProperty(insecure, "url", {
      value: "http://mirror.example/ggml-tiny.bin",
    });
    const { fetch } = recordingFetch(() => insecure);
    await expect(
      ensureModel({ model: "tiny", dir, models: table, fetch }),
    ).rejects.toThrow("not over https");
    expect(await readdir(dir)).toEqual([]);
  });

  test("a name outside the closed list is refused before anything is requested", async () => {
    const { fetch, requested } = recordingFetch(() => download(content));
    for (const model of ["large-v3", "../etc/passwd", "ggml-small.bin", ""]) {
      await expect(ensureModel({ model, dir, fetch })).rejects.toThrow(
        "FREEDUET_WHISPER_MODEL must be one of",
      );
    }
    expect(requested).toEqual([]);
  });
});

describe("the closed list", () => {
  test("every model has a pinned SHA-256, a size and an https repository file", () => {
    expect(DEFAULT_WHISPER_MODEL in WHISPER_MODELS).toBe(true);
    expect(WHISPER_MODEL_REPOSITORY_URL).toBe(
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/",
    );
    const files = new Set<string>();
    for (const [name, model] of Object.entries(WHISPER_MODELS)) {
      expect(name).toMatch(/^[a-z0-9._-]+$/);
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(model.file).toMatch(/^ggml-[a-z0-9._-]+\.bin$/);
      expect(model.bytes).toBeGreaterThan(100_000_000);
      files.add(model.file);
    }
    expect(files.size).toBe(Object.keys(WHISPER_MODELS).length);
  });
});

describe("the voice-activity detection model", () => {
  test("is pinned to the checksum and size read from its repository's LFS pointer", () => {
    expect(WHISPER_VAD_MODELS[WHISPER_VAD_MODEL_NAME]).toEqual({
      file: "ggml-silero-v5.1.2.bin",
      sha256:
        "29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf",
      bytes: 885098,
      sizeLabel: "0.9 MB",
      baseUrl: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/",
    });
  });

  test("is fetched from its own repository, checked, and kept", async () => {
    const vad = {
      silero: {
        file: "ggml-silero.bin",
        sha256: sha(content),
        bytes: content.length,
        sizeLabel: "1 B",
        baseUrl: "https://example.test/vad/",
      },
    };
    const served = recordingFetch(() => download(content));
    const path = await ensureModel({
      model: "silero",
      models: vad,
      dir,
      fetch: served.fetch,
    });
    expect(path).toBe(join(dir, "ggml-silero.bin"));
    expect(served.requested).toEqual([
      "https://example.test/vad/ggml-silero.bin",
    ]);
  });

  test("a file that is not the pinned one is deleted, as for a Whisper model", async () => {
    const vad = {
      silero: {
        file: "ggml-silero.bin",
        sha256: sha(content),
        bytes: content.length,
        sizeLabel: "1 B",
        baseUrl: "https://example.test/vad/",
      },
    };
    const wrong = new TextEncoder().encode(
      "pretend these are 40 bytes of a model!",
    );
    const served = recordingFetch(() => download(wrong));
    await expect(
      ensureModel({ model: "silero", models: vad, dir, fetch: served.fetch }),
    ).rejects.toThrow("did not download correctly");
    expect(await readdir(dir)).toEqual([]);
  });
});
