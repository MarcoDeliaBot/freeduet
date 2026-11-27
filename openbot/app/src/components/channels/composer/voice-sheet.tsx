import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { IconKeyboard } from "@tabler/icons-react";
import { useReducedMotion } from "motion/react";
import { useRef } from "react";
import { DuetIcon } from "@/components/duet/icons";
import { MicOrb, type MicOrbState } from "@/components/duet/mic-orb";
import { MemberOrb } from "@/components/shell/member-orb";
import { Button } from "@/components/ui/button";
import { useAutoStop } from "@/freeduet/voice/auto-stop";
import { LevelMeter } from "@/freeduet/voice/level-meter";
import { useMicLevel } from "@/freeduet/voice/use-mic-level";
import { mascotKeyOf } from "@/freeduet/wide/mascot";
import { useActiveBotId } from "@/lib/copilot/active-bot";
import { cn } from "@/lib/utils";
import type { useDictation } from "./use-dictation";
import { useT } from "@/freeduet/i18n/provider";

type Dictation = ReturnType<typeof useDictation>;

/** The two round controls either side of Send: the same frosted glass as the chrome under the sheet. */
const SIDE_CONTROL =
  "duet-glass size-14 rounded-full p-0 text-duet-ink shadow-duet-glass hover:bg-duet-card hover:text-duet-ink";

/**
 * A brain dump, spoken. Chat's composer opens this over the whole screen and starts recording; the
 * person says everything they need to do and then picks what happens to the words: × throws them
 * away, the microphone stops and sends them as their message, and the keyboard puts them in the
 * composer to edit first (with nothing said, it just closes and leaves the caret in the box).
 *
 * It drives the composer's own dictation session rather than one of its own, so the words reach the
 * conversation through exactly the path inline dictation uses: appended to the draft, and sent
 * through the composer's submit, which parks the message when a turn is already in flight. That is
 * also why it closes itself: when the session goes back to idle (a transcript landed, or it was
 * cancelled) the composer stops passing `open`.
 */
export function VoiceSheet({
  dictation,
  open,
  canSend,
  onType,
}: {
  dictation: Dictation;
  open: boolean;
  /** Whether the words could be sent now, or parked behind the turn in flight. */
  canSend: boolean;
  /** The keyboard with nothing said: close the sheet and put the caret in the box. */
  onType: () => void;
}) {
  const t = useT();
  const { state, session } = dictation;
  // A FreeDuet team member wears its drawn mascot here, as in the header; any other Bot keeps the mic orb.
  const botId = useActiveBotId();
  const popup = useRef<HTMLDivElement>(null);
  const recording = state.phase === "recording";
  const mic = useMicLevel(recording ? state.stream : undefined);
  const notice = state.notice;
  // Pausing after speaking puts the words in the message box (never sent); saying nothing stops quietly.
  useAutoStop(recording, mic, {
    onSilence: () => void session.finish("draft", { quiet: true }),
    onNoSpeech: () => session.stopWithNotice(t("voice.heardNothing")),
  });
  const reduced = useReducedMotion() ?? false;
  const typeInstead = () => {
    // Nothing was heard: there is nothing to write down, so no transcription and no error.
    if (mic.measuring && !mic.heard()) {
      onType();
      return;
    }
    void session.finish("draft", { quiet: true });
  };
  const orb: MicOrbState =
    state.phase === "transcribing"
      ? "thinking"
      : state.phase === "error" || notice !== undefined
        ? "idle"
        : "listening";
  return (
    <DialogPrimitive.Root
      disablePointerDismissal
      // Esc is the only way this closes on its own, and it means what × means.
      onOpenChange={(next) => {
        if (!next) session.cancel();
      }}
      open={open}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          aria-modal="true"
          className={cn(
            "duet-veil duet-face group fixed inset-0 z-50 flex flex-col overflow-y-auto text-duet-ink outline-none",
            "transition-opacity duration-[var(--duet-dur-enter)] data-ending-style:duration-[var(--duet-dur-swap)] data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
          // The sheet itself takes focus, not ×: a stray Enter or Space should not throw the words away.
          initialFocus={popup}
          ref={popup}
        >
          <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col items-center px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),28px)]">
            <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
              {mascotKeyOf(botId) !== null ? (
                <span
                  className="inline-flex transition-transform duration-100 ease-out"
                  data-testid="voice-orb"
                  style={
                    reduced || !recording
                      ? undefined
                      : { transform: `scale(${1 + mic.level * 0.14})` }
                  }
                >
                  <MemberOrb agentId={botId} size={132} state={orb} />
                </span>
              ) : (
                <MicOrb size={132} state={orb} />
              )}
              <DialogPrimitive.Title className="type-big mt-14 max-w-[300px] text-balance font-semibold">
                {t("composer.dictateTitle")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="type-sub mt-2 text-duet-ink-2">
                {t("voice.tapWhenDone")}
              </DialogPrimitive.Description>
              {recording ? (
                <LevelMeter
                  history={mic.history}
                  level={mic.level}
                  seconds={state.seconds}
                />
              ) : null}
            </div>
            <Status dictation={dictation} heard={mic.heard()} />
            <div className="mt-7 flex items-center justify-center gap-8 transition-transform duration-[var(--duet-dur-sheet)] motion-safe:group-data-starting-style:translate-y-3">
              <Button
                aria-label={t("voice.discard")}
                className={SIDE_CONTROL}
                onClick={session.cancel}
                size="icon"
                title={t("voice.discard")}
                type="button"
                variant="ghost"
              >
                <DuetIcon className="size-[22px]" name="x" size={22} />
              </Button>
              <Button
                aria-label={notice ? t("voice.start") : t("voice.stopAndSend")}
                className="size-[68px] rounded-full bg-duet-black p-0 text-duet-on-black hover:bg-duet-black hover:brightness-125 disabled:opacity-30"
                disabled={notice ? false : !recording || !canSend}
                onClick={() =>
                  notice ? void session.start() : void session.finish("send")
                }
                size="icon"
                title={notice ? t("voice.start") : t("voice.stopAndSend")}
                type="button"
              >
                <DuetIcon
                  className="size-[28px]"
                  name="mic"
                  size={28}
                  stroke={2.2}
                />
              </Button>
              <Button
                aria-label={t("voice.typeInstead")}
                className={SIDE_CONTROL}
                disabled={!recording && !notice}
                onClick={notice ? onType : typeInstead}
                size="icon"
                title={t("voice.typeInstead")}
                type="button"
                variant="ghost"
              >
                <IconKeyboard
                  aria-hidden
                  className="size-[22px]"
                  stroke={1.9}
                />
              </Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The glass pill over the controls: what the sheet is doing, or what went wrong and what to do. */
function Status({
  dictation,
  heard,
}: {
  dictation: Dictation;
  heard: boolean;
}) {
  const t = useT();
  const { state, session } = dictation;
  const pill =
    "duet-glass type-label flex min-h-10 max-w-full items-center gap-2.5 rounded-[20px] px-4 py-2.5 shadow-duet-glass animate-in fade-in duration-[var(--duet-dur-swap)]";
  if (state.phase === "error") {
    return (
      <div className={cn(pill, "py-1.5 pr-1.5")}>
        <p className="min-w-0 text-duet-red" role="alert">
          {state.error}
        </p>
        <Button
          className="h-8 shrink-0 rounded-full px-3 text-duet-ink"
          onClick={() =>
            void (state.canRetry ? session.retry() : session.start())
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          {state.canRetry ? t("voice.retry") : t("voice.recordAgain")}
        </Button>
      </div>
    );
  }
  const message = state.notice
    ? state.notice
    : state.phase === "transcribing"
      ? t("voice.writing")
      : state.phase === "recording"
        ? heard
          ? t("voice.listeningStop")
          : t("voice.listening")
        : t("voice.permission");
  // The live region stays put and only its words change, so a screen reader hears each change.
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={cn(pill, "text-duet-ink-2")}
      role="status"
    >
      <span
        className="flex items-center gap-2.5 animate-in fade-in duration-[var(--duet-dur-swap)]"
        key={state.phase}
      >
        {state.phase === "recording" ? (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-duet-violet motion-safe:animate-pulse"
          />
        ) : null}
        {message}
      </span>
    </div>
  );
}
