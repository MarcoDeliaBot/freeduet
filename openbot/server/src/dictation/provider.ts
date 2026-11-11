import type { TranscriptionConfig } from "./config";

/** What the person's browser says about the recording. Already validated by the route. */
export type TranscriptionHint = {
  /** A two-letter code from Whisper's list: the person's interface language. */
  language?: string;
};

export interface TranscriptionProvider {
  transcribe(
    file: File,
    signal: AbortSignal,
    hint?: TranscriptionHint,
  ): Promise<string>;
}

/** A safe, actionable message; upstream response bodies can contain deployment secrets. */
export class TranscriptionError extends Error {}

type Transport = (url: string, init: RequestInit) => Promise<Response>;

export function createTranscriptionProvider(
  config: TranscriptionConfig,
  transport: Transport = fetch,
): TranscriptionProvider {
  switch (config.provider) {
    case "openai-compatible":
      return {
        async transcribe(file, signal, hint) {
          const body = new FormData();
          body.set("file", file);
          body.set("model", config.model);
          // Only when set, so the request is the same as it was before they existed. The setting
          // wins; the person's interface language is only for the local service, where telling it
          // halves the wait (automatic detection is a second pass over the audio).
          const language =
            config.language ??
            (config.useRequestLanguage ? hint?.language : undefined);
          if (language) body.set("language", language);
          if (config.prompt) body.set("prompt", config.prompt);
          const response = await transport(
            `${config.baseUrl}/audio/transcriptions`,
            {
              method: "POST",
              headers: config.apiKey
                ? { authorization: `Bearer ${config.apiKey}` }
                : {},
              body,
              signal,
              // A redirect must never send a recording to an unconfigured destination.
              redirect: "error",
            },
          );
          if (!response.ok) {
            throw new TranscriptionError(
              response.status === 429
                ? "The transcription service is busy. Please retry shortly."
                : "Couldn't process this recording. Try again, or ask an admin if it keeps happening.",
            );
          }
          const result: unknown = await response.json().catch(() => null);
          if (
            !result ||
            typeof result !== "object" ||
            !("text" in result) ||
            typeof result.text !== "string"
          ) {
            throw new TranscriptionError(
              "The transcription service returned an invalid response. Please retry.",
            );
          }
          const text = result.text.trim();
          // The local Whisper separates its segments with line breaks; dictation is one run of text.
          return config.joinSegments ? text.replace(/\s*\n\s*/g, " ") : text;
        },
      };
  }
}
