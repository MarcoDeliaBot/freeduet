/**
 * The Whisper models the local dictation service may load (docs/M1_PLAN.md D25).
 *
 * A CLOSED LIST. `FREEDUET_WHISPER_MODEL` must be one of these names, and nothing else is ever
 * downloaded: a model is only trusted by the SHA-256 written here, which is the one the model's
 * own repository publishes.
 *
 * WHERE THE NUMBERS COME FROM. The Git LFS pointer of each file in
 * https://huggingface.co/ggerganov/whisper.cpp (`oid sha256:` and `size`), read from
 *   https://huggingface.co/ggerganov/whisper.cpp/raw/main/<file>
 * on 2026-11-11 and checked a second time against the "Git LFS Details" SHA256 on each file's page
 * (https://huggingface.co/ggerganov/whisper.cpp/blob/main/<file>). To check one by hand:
 *   curl -sL https://huggingface.co/ggerganov/whisper.cpp/raw/main/ggml-small.bin
 *   sha256sum ggml-small.bin
 * If the repository ever replaces a file, the download fails with a plain message instead of
 * loading a model nobody checked; update the row, and say where the new value was read.
 *
 * Imported by the API server (to refuse a mistyped name), by `openbot/whisper/fetch-model.ts` in the
 * whisper image, and by `scripts/start.sh` through a test that keeps its own list equal to this one.
 */

export type WhisperModel = {
  /** The file in the model repository. */
  file: string;
  /** SHA-256 of the whole file, lower case hex. */
  sha256: string;
  /** Size of the whole file in bytes. */
  bytes: number;
  /** For the one line start.sh prints. */
  sizeLabel: string;
  /** Where the file is, when it is not WHISPER_MODEL_REPOSITORY_URL. Ends with a slash. */
  baseUrl?: string;
};

export const WHISPER_MODEL_REPOSITORY_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

export const DEFAULT_WHISPER_MODEL = "large-v3-turbo-q5_0";

export const WHISPER_MODELS: Readonly<Record<string, WhisperModel>> = {
  "large-v3-turbo-q5_0": {
    file: "ggml-large-v3-turbo-q5_0.bin",
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    bytes: 574041195,
    sizeLabel: "574 MB",
  },
  "large-v3-turbo": {
    file: "ggml-large-v3-turbo.bin",
    sha256: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
    bytes: 1624555275,
    sizeLabel: "1.6 GB",
  },
  small: {
    file: "ggml-small.bin",
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    bytes: 487601967,
    sizeLabel: "488 MB",
  },
  base: {
    file: "ggml-base.bin",
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    bytes: 147951465,
    sizeLabel: "148 MB",
  },
};

export function whisperModelNames(): string[] {
  return Object.keys(WHISPER_MODELS);
}

/** The model for a name from the closed list, or undefined for anything else. */
export function whisperModel(name: string): WhisperModel | undefined {
  return Object.hasOwn(WHISPER_MODELS, name) ? WHISPER_MODELS[name] : undefined;
}

/**
 * The voice-activity-detection model the local service loads with `--vad` (docs/M1_PLAN.md D25):
 * Silero VAD v5.1.2 in whisper.cpp's ggml form, from https://huggingface.co/ggml-org/whisper-vad.
 * Same rules as the table above: pinned by SHA-256 and size, read from the file's Git LFS pointer
 *   https://huggingface.co/ggml-org/whisper-vad/raw/main/ggml-silero-v5.1.2.bin
 * on 2026-11-11 (`oid sha256:` and `size`), and equal to the value the maintainer got by downloading it.
 */
export const WHISPER_VAD_MODEL_NAME = "silero-v5.1.2";

export const WHISPER_VAD_MODELS: Readonly<Record<string, WhisperModel>> = {
  [WHISPER_VAD_MODEL_NAME]: {
    file: "ggml-silero-v5.1.2.bin",
    sha256: "29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf",
    bytes: 885098,
    sizeLabel: "0.9 MB",
    baseUrl: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/",
  },
};
