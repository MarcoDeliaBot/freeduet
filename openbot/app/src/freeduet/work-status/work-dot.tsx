import "./work-status.css";
import type { DotState } from "./status";

/**
 * D180: a ring around a member's face while they work, wait, are stuck or just finished (D168 drew a dot on every face).
 * Idle draws nothing, so the mascot stays clean. Decorative: the row's own label says the state.
 * Place it inside a position: relative wrapper around the face.
 */
export function WorkDot({ state, title }: { state: DotState; title: string }) {
  if (state === "idle") return null;
  return (
    <span
      aria-hidden
      className="fd-ws-ring"
      data-state={state}
      data-testid="work-dot"
      title={title}
    />
  );
}
