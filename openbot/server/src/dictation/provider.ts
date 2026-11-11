import type { TranscriptionConfig } from "./config";

export interface TranscriptionProvider {
  transcribe(file: File, signal: AbortSignal): Promise<string>;
}

/** One segment of whisper.cpp's verbose response, as the proofs print it. */
export type WhisperSegment = {
  text: string;
  noSpeechProb: number;
  avgLogprob: number | null;
};

/** The local service's segments for a recording, before any is dropped. For the proofs. */
export interface SegmentInspector {
  segments(file: File, signal: AbortSignal): Promise<WhisperSegment[]>;
}

/** A safe, actionable message; upstream response bodies can contain deployment secrets. */
export class TranscriptionError extends Error {}

type Transport = (url: string, init: RequestInit) => Promise<Response>;

export function createTranscriptionProvider(
  config: TranscriptionConfig,
  transport: Transport = fetch,
): TranscriptionProvider & SegmentInspector {
  async function post(file: File, signal: AbortSignal, verbose: boolean) {
    const body = new FormData();
    body.set("file", file);
    body.set("model", config.model);
    // Only when set, so the request is the same as it was before they existed.
    if (config.language) body.set("language", config.language);
    if (config.prompt) body.set("prompt", config.prompt);
    if (verbose) {
      body.set("response_format", "verbose_json");
      // whisper.cpp wraps every segment at 60 characters, in the middle of a word, once token
      // timestamps are on, and verbose_json turns them on unless told not to (server.cpp:632-636).
      body.set("token_timestamps", "false");
    }
    const response = await transport(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: config.apiKey
        ? { authorization: `Bearer ${config.apiKey}` }
        : {},
      body,
      signal,
      // A redirect must never send a recording to an unconfigured destination.
      redirect: "error",
    });
    if (!response.ok) {
      throw new TranscriptionError(
        response.status === 429
          ? "The transcription service is busy. Please retry shortly."
          : "Couldn't process this recording. Try again, or ask an admin if it keeps happening.",
      );
    }
    return response.json().catch(() => null) as Promise<unknown>;
  }
  const invalid = () =>
    new TranscriptionError(
      "The transcription service returned an invalid response. Please retry.",
    );
  function parseSegments(result: unknown): WhisperSegment[] {
    const list =
      result && typeof result === "object" && "segments" in result
        ? result.segments
        : undefined;
    if (!Array.isArray(list)) throw invalid();
    return list.map((item: unknown) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("text" in item) ||
        typeof item.text !== "string"
      ) {
        throw invalid();
      }
      const probability =
        "no_speech_prob" in item && typeof item.no_speech_prob === "number"
          ? item.no_speech_prob
          : 0;
      const logprob =
        "avg_logprob" in item && typeof item.avg_logprob === "number"
          ? item.avg_logprob
          : null;
      return {
        text: item.text,
        noSpeechProb: probability,
        avgLogprob: logprob,
      };
    });
  }
  const verbose = config.noSpeechThreshold !== undefined;
  return {
    async segments(file, signal) {
      return parseSegments(await post(file, signal, true));
    },
    async transcribe(file, signal) {
      const result = await post(file, signal, verbose);
      if (verbose) {
        const threshold = config.noSpeechThreshold as number;
        return parseSegments(result)
          .filter((segment) => segment.noSpeechProb <= threshold)
          .map((segment) => segment.text.trim())
          .filter(Boolean)
          .join(" ");
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("text" in result) ||
        typeof result.text !== "string"
      ) {
        throw invalid();
      }
      const text = result.text.trim();
      // The local Whisper separates its segments with line breaks; dictation is one run of text.
      return config.joinSegments ? text.replace(/\s*\n\s*/g, " ") : text;
    },
  };
}
