import { useCallback, useRef } from "react";
import { type CardLanguage, cardText } from "@/freeduet/person-language/cards";
import { useCardLanguage } from "@/freeduet/person-language/use-card-text";
import type { CheckIn } from "@/lib/channels/check-in";

/**
 * How long before this page opened a check-in may have begun and still be news when it arrives:
 * the longest a check-in's turn runs. Anything older was already in the thread, and is history.
 */
export const CHECK_IN_ARRIVAL_SLACK_MS = 3 * 60_000;

/**
 * The notification for a check-in: the Bot's name, then the first task it offers.
 *
 * The one fixed sentence in it ("<task>, and 2 more") is in `language`, the card language (D26):
 * English for none, exactly as it was. The task's own title is the Bot's text and is left alone.
 */
export function checkInNotice(
  botName: string,
  checkIn: CheckIn,
  language: CardLanguage | null = null,
): { title: string; body: string } | null {
  const [first, ...rest] = checkIn.offers;
  if (!first) return null;
  return {
    title: botName,
    body:
      rest.length > 0
        ? cardText(
            "checkIn.notification.more",
            { title: first.title, count: rest.length },
            language,
          )
        : first.title,
  };
}

/** One check-in, however often its line is drawn again. */
function checkInKey(checkIn: CheckIn) {
  return `${checkIn.checkedAt ?? ""}:${checkIn.offers.map((offer) => offer.id).join(",")}`;
}

/**
 * A browser notification when a check-in arrives in Chat while the person is not looking, if they
 * allowed notifications and did not mute this Bot. The same opt-in `attention.tsx` follows: the
 * thread shows the check-in either way, and this is the interruption.
 *
 * Told by the transcript each time it draws a check-in's line, so it fires once per check-in, only
 * for one that began after this page opened (less the time a check-in takes), and only while the
 * page is hidden. A thread read back on arrival is history, not news.
 */
export function useCheckInNotifications(bot: { name: string; muted: boolean }) {
  const openedAt = useRef(Date.now());
  const seen = useRef(new Set<string>());
  const current = useRef(bot);
  current.current = bot;
  /*
   * The language is read where this hook runs, from the same context the cards below it use, and
   * kept in a ref like `bot`: the callback is told by the transcript later and outside any render,
   * so it reads what the last render held. No second request: the context is fed by the
   * capabilities query the app already runs (and, until it answers, by the kept first-paint code).
   */
  const language = useCardLanguage();
  const currentLanguage = useRef(language);
  currentLanguage.current = language;
  return useCallback((checkIn: CheckIn) => {
    const notice = checkInNotice(
      current.current.name,
      checkIn,
      currentLanguage.current,
    );
    const key = checkInKey(checkIn);
    if (!notice || seen.current.has(key)) return;
    seen.current.add(key);
    const at = Date.parse(checkIn.checkedAt ?? "");
    if (
      !Number.isFinite(at) ||
      at < openedAt.current - CHECK_IN_ARRIVAL_SLACK_MS
    )
      return;
    if (current.current.muted || typeof document === "undefined") return;
    if (!document.hidden) return;
    let permitted = false;
    try {
      permitted =
        typeof Notification !== "undefined" &&
        Notification.permission === "granted";
    } catch {
      permitted = false;
    }
    if (!permitted) return;
    try {
      new Notification(notice.title, {
        body: notice.body,
        tag: `openduet-check-in-${key}`,
      });
    } catch {
      // A browser that refuses the constructor still has the check-in in Chat.
    }
  }, []);
}
