import { useReducedMotion } from "motion/react";

/** Seconds as the person reads a clock: 7 is "0:07". */
export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

const BARS = 28;

/**
 * Shows that the microphone is hearing: a row of bars that follows the volume, and the time recorded.
 * Under reduced motion the bars give way to one still bar that holds the current level, and the timer stays.
 */
export function LevelMeter({
  level,
  history,
  seconds,
}: {
  level: number;
  history: number[];
  seconds: number;
}) {
  const reduced = useReducedMotion() ?? false;
  const percent = Math.round(Math.min(1, Math.max(0, level)) * 100);
  const padded = [
    ...Array<number>(Math.max(0, BARS - history.length)).fill(0),
    ...history,
  ];
  return (
    <div className="mt-6 flex w-full max-w-[300px] flex-col items-center gap-2">
      {/* biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot hold the bars drawn inside it */}
      <div
        aria-label="Microphone level"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="flex h-10 w-full items-center justify-center gap-[3px]"
        data-testid="voice-level"
        role="meter"
      >
        {reduced ? (
          <span className="block h-2 w-full overflow-hidden rounded-full bg-duet-ink/10">
            <span
              className="block h-full rounded-full bg-duet-violet"
              data-testid="voice-level-bar"
              style={{ width: `${percent}%` }}
            />
          </span>
        ) : (
          padded.map((value, index) => (
            <span
              className="w-[3px] rounded-full bg-duet-violet"
              data-testid="voice-level-bar"
              // The bars are positions in a rolling window, so the index is their identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: positions in a fixed window
              key={index}
              style={{
                height: `${Math.max(4, Math.round(value * 40))}px`,
                opacity: value > 0 ? 1 : 0.25,
              }}
            />
          ))
        )}
      </div>
      <span
        className="type-label tabular-nums text-duet-ink-2"
        data-testid="voice-timer"
      >
        {formatSeconds(seconds)}
      </span>
    </div>
  );
}
