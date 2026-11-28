import { useEffect, useRef, useState } from "react";

/** How often the level is read, in ms. A timer rather than a frame loop, so it also runs in a background tab and in tests. */
export const LEVEL_INTERVAL_MS = 70;
/** A level at or above this counts as speech (the sound of a room sits well under it). */
export const SPEECH_LEVEL = 0.12;

/** One reading of the analyser as 0..1: the root mean square of the waveform, lifted so ordinary speech fills most of the scale. */
export function levelOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = ((samples[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

export type MicLevel = {
  /** The latest level, 0..1. */
  level: number;
  /** Recent levels, oldest first, for a waveform. */
  history: number[];
  /** Whether the level was ever at speech height since this stream began. Read it when the person acts. */
  heard: () => boolean;
  /** Milliseconds since the level was last at speech height; null while nobody has spoken yet. */
  silentMs: () => number | null;
  /** Milliseconds since this stream began being measured. */
  listenedMs: () => number;
  /** False when this page cannot analyse the stream: nothing can then be said about whether anyone spoke. */
  measuring: boolean;
};

const HISTORY = 28;

/**
 * The microphone's volume, read from an AnalyserNode on the stream the dictation already holds.
 * It never opens a microphone of its own and never stops the stream's tracks.
 */
export function useMicLevel(stream: MediaStream | undefined): MicLevel {
  const [state, setState] = useState<{ level: number; history: number[] }>({
    level: 0,
    history: [],
  });
  const [measuring, setMeasuring] = useState(false);
  const peak = useRef(0);
  const lastSpeech = useRef<number | null>(null);
  const began = useRef(Date.now());
  useEffect(() => {
    peak.current = 0;
    lastSpeech.current = null;
    began.current = Date.now();
    setState({ level: 0, history: [] });
    setMeasuring(false);
    const Context: typeof AudioContext | undefined =
      typeof globalThis.AudioContext === "function"
        ? globalThis.AudioContext
        : undefined;
    if (!stream || !Context) return;
    let context: AudioContext | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      context = new Context();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      setMeasuring(true);
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        const level = levelOf(samples);
        peak.current = Math.max(peak.current, level);
        if (level >= SPEECH_LEVEL) lastSpeech.current = Date.now();
        setState((previous) => ({
          level,
          history: [...previous.history, level].slice(-HISTORY),
        }));
      }, LEVEL_INTERVAL_MS);
    } catch {
      setMeasuring(false);
    }
    return () => {
      clearInterval(timer);
      // Only the analysing context is closed; the stream belongs to the recorder.
      void context?.close().catch(() => {});
    };
  }, [stream]);
  return {
    level: state.level,
    history: state.history,
    heard: () => peak.current >= SPEECH_LEVEL,
    silentMs: () =>
      lastSpeech.current === null ? null : Date.now() - lastSpeech.current,
    listenedMs: () => Date.now() - began.current,
    measuring,
  };
}
