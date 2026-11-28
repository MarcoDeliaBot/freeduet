import { MAX_DICTATION_SECONDS } from "@openbot/shared/dictation";
import { englishT, type T } from "@/freeduet/i18n/provider";
import { NoSpeechError, type Recording } from "./recording";

export type DictationState = {
  phase: "idle" | "requesting" | "recording" | "transcribing" | "error";
  seconds: number;
  error?: string;
  canRetry: boolean;
  /** Set on an idle state when the recording stopped by itself with nothing said: a hint, never an error. */
  notice?: string;
  stream?: MediaStream;
};

export type DictationIntent = "draft" | "send";

const idle: DictationState = { phase: "idle", seconds: 0, canRetry: false };

/** Owns a single recording, including results arriving after cancellation or navigation. */
export class DictationSession {
  private state = idle;
  private listeners = new Set<() => void>();
  private generation = 0;
  private recording?: Recording;
  private audio?: Blob;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private intent: DictationIntent = "draft";
  /** The person asked only to move on to typing: a recording with no words is then not an error. */
  private quiet = false;

  constructor(
    private readonly deps: {
      record: (onError: (error: Error) => void) => Promise<Recording>;
      transcribe: (audio: Blob, signal: AbortSignal) => Promise<string>;
      onTranscript: (text: string, intent: DictationIntent) => void;
      /** The app's translator for the words the composer shows (D181). English when none is given. */
      t?: T;
    },
  ) {}

  private get t(): T {
    return this.deps.t ?? englishT;
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(state: DictationState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private clearTimer() {
    clearInterval(this.timer);
  }

  cancel = () => {
    this.generation++;
    this.clearTimer();
    this.recording?.cancel();
    this.recording = undefined;
    this.abort?.abort();
    this.audio = undefined;
    this.intent = "draft";
    this.quiet = false;
    this.update(idle);
  };

  start = async () => {
    this.cancel();
    const generation = this.generation;
    this.update({ ...idle, phase: "requesting" });
    try {
      const recording = await this.deps.record((error) => {
        if (generation !== this.generation) return;
        this.cancel();
        this.update({ ...idle, phase: "error", error: error.message });
      });
      if (generation !== this.generation) {
        recording.cancel();
        return;
      }
      this.recording = recording;
      this.update({ ...idle, phase: "recording", stream: recording.stream });
      const started = Date.now();
      this.timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        if (seconds !== this.state.seconds)
          this.update({ ...this.state, seconds });
        if (seconds >= MAX_DICTATION_SECONDS) void this.finish();
      }, 250);
    } catch (error) {
      if (generation !== this.generation) return;
      this.update({
        ...idle,
        phase: "error",
        error:
          error instanceof Error && error.name === "NotAllowedError"
            ? this.t("dictation.session.denied")
            : // Its message names the page's problem and the way out, which "check your microphone" would hide.
              error instanceof Error &&
                error.name === "RecordingUnsupportedError"
              ? error.message
              : this.t("dictation.session.startFailed"),
      });
    }
  };

  /** Stop listening because nothing was said: no transcription and no error, only `notice` for the person to read. */
  stopWithNotice = (notice: string) => {
    if (this.state.phase !== "recording") return;
    this.cancel();
    this.update({ ...idle, notice });
  };

  finish = async (
    intent: DictationIntent = "draft",
    options: { quiet?: boolean } = {},
  ) => {
    if (this.state.phase !== "recording" || !this.recording) return;
    this.clearTimer();
    this.intent = intent;
    this.quiet = options.quiet === true;
    const generation = this.generation;
    this.update({ ...this.state, phase: "transcribing", stream: undefined });
    try {
      const audio = await this.recording.finish();
      if (generation !== this.generation) return;
      this.recording = undefined;
      this.audio = audio;
      await this.transcribe(generation);
    } catch {
      if (generation !== this.generation) return;
      this.recording?.cancel();
      this.recording = undefined;
      this.update({
        ...idle,
        phase: "error",
        error: this.t("dictation.session.finishFailed"),
      });
    }
  };

  retry = async () => {
    if (this.state.phase !== "error" || !this.audio) return;
    await this.transcribe(this.generation);
  };

  private async transcribe(generation: number) {
    if (!this.audio) return;
    this.abort = new AbortController();
    this.update({
      ...this.state,
      phase: "transcribing",
      error: undefined,
      canRetry: false,
    });
    try {
      const transcript = await this.deps.transcribe(
        this.audio,
        this.abort.signal,
      );
      if (generation !== this.generation) return;
      this.audio = undefined;
      const intent = this.intent;
      this.update(idle);
      this.deps.onTranscript(transcript, intent);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof NoSpeechError && this.quiet) {
        // Nothing was said and the person is going on to type: close without an error, with no words.
        this.audio = undefined;
        this.quiet = false;
        this.update(idle);
        this.deps.onTranscript("", this.intent);
        return;
      }
      this.update({
        ...this.state,
        phase: "error",
        canRetry: true,
        error:
          error instanceof Error
            ? error.message
            : this.t("dictation.session.transcribeFailed"),
      });
    }
  }
}
