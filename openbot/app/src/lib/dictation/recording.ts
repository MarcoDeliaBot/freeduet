import {
  DICTATION_TIMEOUT_MS,
  dictationExtension,
  dictationMediaType,
  MAX_DICTATION_BYTES,
} from "@openbot/shared/dictation";

export interface Recording {
  /** Shared with the visualizer; the recorder owns this stream's lifetime. */
  readonly stream?: MediaStream;
  finish(): Promise<Blob>;
  cancel(): void;
}

export function recordingSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** The page cannot record at all. Its message is meant to be shown to the person as it is. */
export class RecordingUnsupportedError extends Error {
  override name = "RecordingUnsupportedError";
}

/**
 * One sentence on why this page has no microphone and what to do about it. A browser gives the
 * microphone only to https pages and to localhost, so a phone that opens http://<computer>:3010
 * has none; that is the case worth naming, the other being a browser too old to record.
 */
export function recordingUnsupportedMessage(): string {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "The microphone only works on a secure page. Open FreeDuet on the computer where it runs (localhost), or ask whoever runs it to put it behind https.";
  }
  return "This browser cannot record audio. Try an up-to-date Chrome, Edge, Firefox or Safari.";
}

export async function startRecording(
  onError: (error: Error) => void,
): Promise<Recording> {
  if (!recordingSupported())
    throw new RecordingUnsupportedError(recordingUnsupportedMessage());
  const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
  if (!mimeType)
    throw new Error("This browser cannot record a supported audio format.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch (error) {
    release();
    throw error;
  }
  let chunks: Blob[] = [];
  let size = 0;
  let done: ReturnType<typeof Promise.withResolvers<Blob>> | undefined;
  const cancel = () => {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== "inactive") recorder.stop();
    release();
    chunks = [];
    done?.reject(new DOMException("Recording cancelled", "AbortError"));
  };
  recorder.ondataavailable = (event) => {
    size += event.data.size;
    if (size > MAX_DICTATION_BYTES) {
      cancel();
      onError(new Error("Recording is too large. Try a shorter message."));
      return;
    }
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onerror = () => {
    cancel();
    onError(new Error("The microphone stopped recording. Please try again."));
  };
  recorder.onstop = () => {
    release();
    if (!done) {
      onError(new Error("Recording was interrupted. Please try again."));
      return;
    }
    done.resolve(
      new Blob(chunks, { type: dictationMediaType(recorder.mimeType) }),
    );
    chunks = [];
  };
  try {
    recorder.start(250);
  } catch (error) {
    cancel();
    throw error;
  }
  return {
    stream,
    cancel,
    finish() {
      if (done) return done.promise;
      done = Promise.withResolvers<Blob>();
      if (recorder.state === "inactive") {
        release();
        done.reject(
          new Error("Recording stopped before audio could be collected."),
        );
      } else {
        recorder.stop();
        release();
      }
      return done.promise;
    },
  };
}

export async function transcribeRecording(
  audio: Blob,
  signal: AbortSignal,
): Promise<string> {
  const type = dictationMediaType(audio.type);
  const extension = dictationExtension(type);
  if (!extension || !audio.size || audio.size > MAX_DICTATION_BYTES) {
    throw new Error(
      "The recording is empty or unsupported. Please record again.",
    );
  }
  const body = new FormData();
  body.set("file", audio, `recording.${extension}`);
  const response = await fetch("/api/audio/transcriptions", {
    method: "POST",
    credentials: "include",
    headers: { "x-openbot-dictation": "1" },
    body,
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(DICTATION_TIMEOUT_MS + 5_000),
    ]),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
        ? result.error
        : "Transcription failed. Please retry.",
    );
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("text" in result) ||
    typeof result.text !== "string" ||
    !result.text.trim()
  ) {
    throw new Error("No speech was detected. Try recording again.");
  }
  return result.text.trim();
}
