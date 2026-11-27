import { useEffect, useRef } from "react";
import type { MicLevel } from "./use-mic-level";

/**
 * When the voice sheet stops listening by itself (D173). Everything that decides it is here, so a
 * change is one edit. A setting for these is not offered yet.
 *
 * The longest recording is not here: it is `MAX_DICTATION_SECONDS` (120 s) in `shared/dictation.ts`,
 * which the session already enforces by finishing the recording into the message box.
 */
/** Quiet for this long after the person has spoken: stop and put the words in the message box. */
export const SILENCE_STOP_MS = 2000;
/** Nothing said at all for this long: stop quietly and say so, with no error. */
export const FIRST_SPEECH_TIMEOUT_MS = 8000;
/** How often the rules are checked, in ms. */
export const AUTO_STOP_CHECK_MS = 250;

export type AutoStopVerdict = "keep" | "silence" | "no-speech";

/** What to do now, given how long it has been quiet (null: nobody has spoken yet) and how long it has listened. */
export function autoStopVerdict(
  silentMs: number | null,
  listenedMs: number,
): AutoStopVerdict {
  if (silentMs === null)
    return listenedMs >= FIRST_SPEECH_TIMEOUT_MS ? "no-speech" : "keep";
  return silentMs >= SILENCE_STOP_MS ? "silence" : "keep";
}

/**
 * Watches the microphone level while `active` and calls `onSilence` once the person has spoken and
 * then paused, or `onNoSpeech` if they never began. It does nothing when the level cannot be
 * measured (`mic.measuring` false), and it never sends anything: the callbacks only stop the recording.
 */
export function useAutoStop(
  active: boolean,
  mic: MicLevel,
  handlers: { onSilence: () => void; onNoSpeech: () => void },
) {
  const latest = useRef({ mic, handlers });
  latest.current = { mic, handlers };
  const measuring = mic.measuring;
  useEffect(() => {
    if (!active || !measuring) return;
    const timer = setInterval(() => {
      const { mic: current, handlers: on } = latest.current;
      const verdict = autoStopVerdict(current.silentMs(), current.listenedMs());
      if (verdict === "keep") return;
      clearInterval(timer);
      if (verdict === "silence") on.onSilence();
      else on.onNoSpeech();
    }, AUTO_STOP_CHECK_MS);
    return () => clearInterval(timer);
  }, [active, measuring]);
}
