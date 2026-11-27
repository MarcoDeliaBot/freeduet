import { useEffect } from "react";
import type { VisibleChatItem } from "@/components/channels/chat-messages";

/**
 * D172: "Read newest" opens the conversation at the first message the person has not read, not at
 * the bottom of a long reply they would then have to scroll back up through.
 *
 * WHAT "UNREAD" MEANS HERE. A message has no time on screen, so the only honest marker is the person's
 * own last message: what a Bot said after it is what arrived while they were away. The first item
 * after that message is the target. With nothing after the person's last message, or no message of
 * theirs at all, the newest message is the target (the scroller's own default, the end).
 */
export function firstUnreadItemId(
  items: ReadonlyArray<
    Pick<VisibleChatItem, "kind" | "id"> & { role?: string }
  >,
): string | null {
  const lastOwn = items.findLastIndex(
    (item) =>
      (item.kind === "text" && item.role === "user") ||
      item.kind === "attachments",
  );
  const next = items[lastOwn + 1];
  // Nothing of theirs yet and the whole conversation is the Bot's: start at its first message only when
  // there is something after the person to land on; otherwise the end.
  return next && lastOwn >= 0 ? next.id : null;
}

/** How long a click on "Read newest" stays valid; a conversation that takes longer to open is not it. */
const WANT_FOR_MS = 15_000;
let wantedUntil = 0;

/** The click on "Read newest": the next conversation that finishes opening scrolls to its first unread. */
export function wantFirstUnread(now: number = Date.now()): void {
  wantedUntil = now + WANT_FOR_MS;
}

/** True once per click, while it is still valid. */
export function takeFirstUnread(now: number = Date.now()): boolean {
  const wanted = now < wantedUntil;
  wantedUntil = 0;
  return wanted;
}

export type UnreadScroller = {
  scrollToMessage: (id: string) => boolean;
  scrollToEnd: () => boolean;
};

/**
 * Once the history is drawn, scroll to the first unread message when "Read newest" asked for it. Runs
 * once per click: the flag is taken only when there are items to land on and the restore has ended.
 */
export function useFirstUnreadScroll(
  items: ReadonlyArray<
    Pick<VisibleChatItem, "kind" | "id"> & { role?: string }
  >,
  restoring: boolean,
  scroller: UnreadScroller,
): void {
  const ready = !restoring && items.length > 0;
  const target = ready ? firstUnreadItemId(items) : null;
  const { scrollToMessage, scrollToEnd } = scroller;
  useEffect(() => {
    if (!ready || !takeFirstUnread()) return;
    // After the scroller has placed the conversation itself, so this is the last word, not the first.
    // Not cleared on a change of items: the flag is already taken, so a cleared timer would lose the scroll.
    setTimeout(() => {
      if (target === null || !scrollToMessage(target)) scrollToEnd();
    }, 50);
  }, [ready, target, scrollToMessage, scrollToEnd]);
}
