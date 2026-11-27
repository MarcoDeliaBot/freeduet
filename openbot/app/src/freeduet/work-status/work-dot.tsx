import "./work-status.css";
import type { DotState } from "./status";

/** The status dot on a member's face in the team column (D168). Decorative: the row's own label says the state. */
export function WorkDot({ state, title }: { state: DotState; title: string }) {
  return (
    <span
      aria-hidden
      className="fd-ws fd-ws-dot"
      data-on-face=""
      data-state={state}
      data-testid="work-dot"
      title={title}
    />
  );
}
