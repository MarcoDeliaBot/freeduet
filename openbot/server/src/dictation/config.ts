import {
  whisperModel,
  whisperModelNames,
} from "@openbot/shared/whisper-models";
import { DICTATION_LANGUAGES } from "./languages";

export const MAX_TRANSCRIPTION_PROMPT_CHARACTERS = 500;

export type TranscriptionConfig = {
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Sent as the `language` field. Unset: the service decides, which is today's request. */
  language?: string;
  /** Sent as the `prompt` field: names and terms the speaker is likely to use. */
  prompt?: string;
  /**
   * whisper.cpp ends every segment of its text with a line break. Set for the local service
   * (`FREEDUET_DICTATION=local`), where the segments are joined into one run of text.
   */
  joinSegments?: true;
  /**
   * Local service only. When set, the request asks for whisper.cpp's verbose response and a segment
   * whose `no_speech_prob` is above this is dropped. Unset (every other provider), the request is the
   * plain one.
   */
  noSpeechThreshold?: number;
};

/** whisper.cpp's own default no-speech threshold (examples/server/server.cpp:90 at v1.9.5). */
export const DEFAULT_NO_SPEECH_THRESHOLD = 0.6;

export function transcriptionConfig(
  environment: Record<string, string | undefined>,
): TranscriptionConfig | undefined {
  const provider = environment.TRANSCRIPTION_PROVIDER?.trim();
  const baseUrl = environment.TRANSCRIPTION_BASE_URL?.trim();
  const model = environment.TRANSCRIPTION_MODEL?.trim();
  const apiKey = environment.TRANSCRIPTION_API_KEY?.trim();
  const local = localDictation(environment);
  if (!provider && !baseUrl && !model && !apiKey) return undefined;
  if (provider !== "openai-compatible") {
    throw new Error("TRANSCRIPTION_PROVIDER must be openai-compatible.");
  }
  if (!baseUrl || !model) {
    throw new Error(
      "TRANSCRIPTION_BASE_URL and TRANSCRIPTION_MODEL are required.",
    );
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("TRANSCRIPTION_BASE_URL must be an HTTP(S) URL.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "TRANSCRIPTION_BASE_URL must be HTTP(S), without credentials, query, or fragment.",
    );
  }
  const language = environment.TRANSCRIPTION_LANGUAGE?.trim();
  if (language && !DICTATION_LANGUAGES.has(language)) {
    throw new Error(
      "TRANSCRIPTION_LANGUAGE must be a two-letter language code Whisper supports, such as it or en.",
    );
  }
  const prompt = environment.TRANSCRIPTION_PROMPT?.trim();
  if (prompt && [...prompt].length > MAX_TRANSCRIPTION_PROMPT_CHARACTERS) {
    throw new Error(
      `TRANSCRIPTION_PROMPT must be at most ${MAX_TRANSCRIPTION_PROMPT_CHARACTERS} characters.`,
    );
  }
  return {
    provider,
    baseUrl: url.href.replace(/\/+$/, ""),
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(language ? { language } : {}),
    ...(prompt ? { prompt } : {}),
    ...(local
      ? {
          joinSegments: true as const,
          noSpeechThreshold: noSpeechThreshold(environment),
        }
      : {}),
  };
}

/**
 * `FREEDUET_DICTATION=local` runs a Whisper beside the stack (docs/M1_PLAN.md D25). Unset, empty or
 * `off` is today's behaviour. Anything else is refused, and so is a model outside the closed list,
 * because a typo here would otherwise only show as a download that never starts.
 */
function localDictation(
  environment: Record<string, string | undefined>,
): boolean {
  const flag = environment.FREEDUET_DICTATION?.trim();
  if (!flag || flag === "off") return false;
  if (flag !== "local") {
    throw new Error("FREEDUET_DICTATION must be local, or unset.");
  }
  const model = environment.FREEDUET_WHISPER_MODEL?.trim();
  if (model && !whisperModel(model)) {
    throw new Error(
      `FREEDUET_WHISPER_MODEL must be one of: ${whisperModelNames().join(", ")}.`,
    );
  }
  return true;
}

function noSpeechThreshold(
  environment: Record<string, string | undefined>,
): number {
  const raw = environment.WHISPER_NO_SPEECH_THRESHOLD?.trim();
  if (!raw) return DEFAULT_NO_SPEECH_THRESHOLD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(
      "WHISPER_NO_SPEECH_THRESHOLD must be a number from 0 to 1.",
    );
  }
  return value;
}
