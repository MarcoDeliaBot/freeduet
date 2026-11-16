import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { useWideBand } from "./band";

/**
 * Where a waiting approval card is pinned (D55): a strip at the top of the conversation it belongs to.
 *
 * Pinning is a place, not a second card. `InlineApproval` still reads the one request from the one
 * owner-scoped inbox, draws the one `ApprovalCard` and decides through the one route; when this strip
 * exists it hands the same card to a portal into it instead of drawing it in the flow. The line left
 * behind in the flow is empty, and once the request is decided the card goes back to its place folded,
 * as it always did.
 */
const PinContext = createContext<{
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
}>({ slot: null, setSlot: () => {} });

/** Held by the wide frame: one conversation is on screen at a time, and it registers its strip. */
export function PinnedApprovalsProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

/** The strip's element where a card may be pinned, or `null` (below 1024 px, or no conversation). */
export function usePinnedSlot(): HTMLElement | null {
  return useContext(PinContext).slot;
}

/**
 * The strip itself, drawn first in a conversation. Empty, it takes no room. Drawn only in the wide
 * layout; on a phone nothing registers and every card stays where it always was.
 */
export function PinnedApprovalsSlot() {
  const band = useWideBand();
  const { setSlot } = useContext(PinContext);
  if (band === "off") return null;
  return (
    <div
      className="mx-auto max-h-[60%] w-full max-w-[920px] shrink-0 space-y-3 overflow-y-auto px-6 pt-4 pb-3 empty:hidden"
      data-pinned-approvals=""
      ref={setSlot}
    />
  );
}
