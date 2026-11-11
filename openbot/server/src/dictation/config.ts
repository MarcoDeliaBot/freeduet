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
   * Local service only: when `TRANSCRIPTION_LANGUAGE` is unset, the language the browser sends with
   * the recording (validated by the route) is passed on as `language`.
   */
  useRequestLanguage?: true;
};

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
          useRequestLanguage: true as const,
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
