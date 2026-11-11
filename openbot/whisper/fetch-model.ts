/**
 * Get the Whisper model for the local dictation service, and trust nothing that was not checked
 * (docs/M1_PLAN.md D25). Runs in the `whisper` image before the server starts.
 *
 *   bun whisper/fetch-model.ts
 *
 * Reads FREEDUET_WHISPER_MODEL (default large-v3-turbo-q5_0, and only a name from
 * shared/whisper-models.ts is accepted) and WHISPER_MODEL_DIR (default /models, a named volume).
 * Progress goes to stderr; the path of the checked model file is the only thing written to stdout,
 * which is how entrypoint.sh learns it.
 *
 * - The model comes over https from the official repository named in shared/whisper-models.ts, and
 *   from nowhere else. A redirect may go to the repository's file host, but never to plain http.
 * - Its SHA-256 and size must be the ones pinned in that file. A file that does not match is
 *   deleted, never loaded, and the failure says so in plain words.
 * - A file already on disk is hashed again on every start, so a half-written or edited file is
 *   found rather than loaded.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_WHISPER_MODEL,
  WHISPER_MODEL_REPOSITORY_URL,
  WHISPER_MODELS,
  type WhisperModel,
  whisperModelNames,
} from "../shared/whisper-models";

/** A failure with a sentence a person can act on. Anything else is a bug and keeps its stack. */
export class ModelDownloadError extends Error {}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type EnsureModelOptions = {
  model: string;
  dir: string;
  /** Injected by the tests. */
  fetch?: Fetcher;
  /** Injected by the tests. */
  models?: Readonly<Record<string, WhisperModel>>;
  log?: (line: string) => void;
};

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

export async function ensureModel(
  options: EnsureModelOptions,
): Promise<string> {
  const { model, dir } = options;
  const fetcher: Fetcher = options.fetch ?? fetch;
  const log = options.log ?? (() => {});
  const models = options.models ?? WHISPER_MODELS;
  const entry = Object.hasOwn(models, model) ? models[model] : undefined;
  if (!entry) {
    throw new ModelDownloadError(
      `FREEDUET_WHISPER_MODEL must be one of: ${whisperModelNames().join(", ")}.`,
    );
  }
  await mkdir(dir, { recursive: true });
  const path = join(dir, entry.file);
  const partial = `${path}.partial`;
  // What a stopped download left behind is never resumed: it was not checked.
  await rm(partial, { force: true });

  if (await exists(path)) {
    const sameSize = (await stat(path)).size === entry.bytes;
    if (sameSize && (await sha256OfFile(path)) === entry.sha256) {
      log(`Model ${model} is already here, and its checksum was checked.`);
      return path;
    }
    log(`Model ${model} on disk does not match its checksum. Deleting it.`);
    await rm(path, { force: true });
  }

  const url = `${WHISPER_MODEL_REPOSITORY_URL}${entry.file}`;
  log(`Downloading model ${model} (${entry.sizeLabel}) from ${url}`);
  const mismatch = new ModelDownloadError(
    `The model "${model}" did not download correctly: its checksum is not the one its repository publishes. The file was deleted. Start again to retry, and tell the maintainer if it keeps happening.`,
  );
  try {
    const response = await fetcher(url, { redirect: "follow" });
    if (!response.ok) {
      throw new ModelDownloadError(
        `The model "${model}" could not be downloaded: its repository answered ${response.status}. Start again to retry.`,
      );
    }
    // `url` is empty on a response that was not the product of a real request.
    if (response.url && !response.url.startsWith("https://")) {
      throw new ModelDownloadError(
        `The model "${model}" was not downloaded: the repository sent it to an address that is not over https.`,
      );
    }
    if (!response.body) {
      throw new ModelDownloadError(
        `The model "${model}" could not be downloaded: the repository sent nothing. Start again to retry.`,
      );
    }
    const hash = createHash("sha256");
    const reader = response.body.getReader();
    const file = await open(partial, "w");
    let received = 0;
    let reported = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > entry.bytes) {
          // Longer than the pinned size cannot be the pinned file: stop taking it.
          await reader.cancel();
          throw mismatch;
        }
        hash.update(value);
        await file.write(value);
        const percent = Math.floor((received / entry.bytes) * 10) * 10;
        if (percent > reported) {
          reported = percent;
          log(`Downloading model ${model}: ${percent}%`);
        }
      }
    } finally {
      await file.close();
    }
    if (received !== entry.bytes || hash.digest("hex") !== entry.sha256) {
      throw mismatch;
    }
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    await rm(path, { force: true });
    throw error;
  }
  log(`Model ${model} downloaded and its checksum was checked.`);
  return path;
}

if (import.meta.main) {
  const model =
    process.env.FREEDUET_WHISPER_MODEL?.trim() || DEFAULT_WHISPER_MODEL;
  const dir = process.env.WHISPER_MODEL_DIR?.trim() || "/models";
  try {
    const path = await ensureModel({
      model,
      dir,
      log: (line) => console.error(`whisper: ${line}`),
    });
    console.log(path);
  } catch (error) {
    if (error instanceof ModelDownloadError) {
      console.error(`whisper: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
