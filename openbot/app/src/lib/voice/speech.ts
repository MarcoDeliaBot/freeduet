import { useSyncExternalStore } from "react";

/**
 * Read aloud, the first slice of the voice plan (docs/design/voice.md, section 3.1, slice S1).
 *
 * A member's reply is read by this computer's own speech voices, and only when the person has
 * switched it on in this browser. Off by default: nothing is spoken and no control is drawn.
 *
 * Only a voice local to the computer may read (`localService`). A network voice sends the text to a
 * remote service, and this slice sends nothing anywhere. The voice must be Italian, which is the
 * language this slice is for. If no such voice exists the switch says so and stays off.
 *
 * The decision is a pure function (`speechPlan`), so that "nothing is spoken without the switch" and
 * the voice filter are tested without a browser. The browser is touched only in `speakPlan`.
 */

export const READ_ALOUD_KEY = "freeduet.read-aloud";

/** The part of a browser speech voice this slice reads. */
export type SpeechVoiceLike = Pick<
  SpeechSynthesisVoice,
  "lang" | "localService" | "name"
>;

/** Local to the computer, and Italian: `it`, `it-IT`, `it_IT`. */
export function italianLocalVoice(voice: SpeechVoiceLike): boolean {
  return voice.localService === true && /^it(?:[-_]|$)/i.test(voice.lang);
}

export function pickVoice<T extends SpeechVoiceLike>(
  voices: readonly T[],
): T | null {
  return voices.find(italianLocalVoice) ?? null;
}

/**
 * What a reply reads as. Code, tables and addresses are left out, since read aloud they are noise:
 * a code block is skipped, a table row is skipped whole, a link reads as its text, a bare web
 * address is dropped, and the markdown marks are removed. The reply may still be arriving, so an
 * unclosed code fence runs to the end.
 */
export function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .split("\n")
    .filter((line) => !/^\s*\|/.test(line))
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S*[^\s.,;:!?)\]]/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, " ")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What to say and in which voice, or null when nothing may be spoken: the switch is off, no local
 * Italian voice is installed, or the reply has nothing to read once cleaned.
 */
export function speechPlan<T extends SpeechVoiceLike>(input: {
  enabled: boolean;
  voices: readonly T[];
  reply: string;
}): { text: string; voice: T } | null {
  if (!input.enabled) return null;
  const voice = pickVoice(input.voices);
  if (!voice) return null;
  const text = speechText(input.reply);
  return text ? { text, voice } : null;
}

type KeptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): KeptStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Kept in this browser only, as the voice outbox is. A browser that blocks storage keeps it off. */
export function readAloudEnabled(storage = defaultStorage()): boolean {
  try {
    return storage?.getItem(READ_ALOUD_KEY) === "on";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

export function setReadAloudEnabled(on: boolean, storage = defaultStorage()) {
  try {
    if (on) storage?.setItem(READ_ALOUD_KEY, "on");
    else storage?.removeItem(READ_ALOUD_KEY);
  } catch {
    // Storage refused: the switch is off for this page, which is the safe answer.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether read aloud is on, and it changes at once wherever the switch is drawn. */
export function useReadAloudEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readAloudEnabled(),
    () => false,
  );
}

/** The voices this computer has now; empty until the browser has listed them. */
export function installedVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return [];
  return window.speechSynthesis.getVoices();
}

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speaks a plan in its voice, replacing anything already being read. `onEnd` runs when it stops. */
export function speakPlan(
  plan: { text: string; voice: SpeechSynthesisVoice },
  onEnd: () => void,
) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(plan.text);
  utterance.lang = plan.voice.lang;
  utterance.voice = plan.voice;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  synth.speak(utterance);
}

export function stopSpeaking() {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
