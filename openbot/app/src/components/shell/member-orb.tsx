import type { CSSProperties } from "react";
import {
  motion,
  type TargetAndTransition,
  type Transition,
  useReducedMotion,
} from "motion/react";
import type { MicOrbState } from "@/components/duet/mic-orb";
import { MemberPicture } from "@/freeduet/wide/mascot";

/** The ring's stroke, in CSS px. It sits inside the box the orb occupies, never past it. */
const RING = 2;
/** The mascot's bubble as a share of the box: the rest is the ring's room. */
const FACE = 0.8;
/** Seconds one turn of the thinking arc takes. */
const TURN_S = 1.2;
/** Seconds one breath of the listening ring takes. */
const BREATH_S = 2.4;
/** Seconds the landing (done, finished) plays once. */
const LAND_S = 1.4;

const ACCENT = "var(--duet-accent)";
const FAINT = "color-mix(in srgb, var(--duet-accent) 22%, transparent)";

/**
 * A FreeDuet team member's face in the header's orb place: the member's drawn mascot, with a ring round it
 * that shows the orb's state. The orb's own states, as the ring shows them:
 *
 * - idle: a faint still ring.
 * - listening: a steady ring that breathes.
 * - thinking: a bright arc that turns round the ring.
 * - done, finished: the ring lands once, a swell and a settle.
 *
 * Under reduced motion nothing moves: each state keeps its colour and shape (the arc stays put, the
 * landing is a solid ring), so the state still reads. The ring is decorative: the header's link has its
 * name for a screen reader.
 */
export function MemberOrb({
  agentId,
  size,
  state = "idle",
}: {
  /** The member's id, the one `MEMBER_MASCOT` lists. */
  agentId: string;
  /** The footprint in CSS px: the same box the mic orb takes. */
  size: number;
  state?: MicOrbState;
}) {
  const reduced = useReducedMotion() ?? false;
  const face = Math.round(size * FACE);
  return (
    <span
      aria-hidden
      className="pointer-events-none relative grid shrink-0 place-items-center"
      data-face={agentId}
      data-state={state}
      style={{ width: size, height: size }}
    >
      <Ring reduced={reduced} size={size} state={state} />
      <MemberPicture agentId={agentId} size={face} />
    </span>
  );
}

/** The ring round the face, drawn for `state`. */
function Ring({
  reduced,
  size,
  state,
}: {
  reduced: boolean;
  size: number;
  state: MicOrbState;
}) {
  const base = {
    position: "absolute" as const,
    inset: 0,
    width: size,
    height: size,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: RING,
    borderColor: FAINT,
  };
  const frame = (
    extra: CSSProperties,
    animate: TargetAndTransition,
    transition: Transition,
  ) => (
    <motion.span
      animate={reduced ? undefined : animate}
      data-ring-state={state}
      style={{ ...base, ...extra }}
      transition={transition}
    />
  );

  if (state === "listening") {
    return frame(
      { borderColor: ACCENT },
      { opacity: [0.45, 1, 0.45] },
      {
        duration: BREATH_S,
        ease: "easeInOut",
        repeat: Number.POSITIVE_INFINITY,
      },
    );
  }
  if (state === "thinking") {
    return frame(
      { borderTopColor: ACCENT },
      { rotate: 360 },
      { duration: TURN_S, ease: "linear", repeat: Number.POSITIVE_INFINITY },
    );
  }
  if (state === "done" || state === "finished") {
    return frame(
      { borderColor: ACCENT },
      state === "finished"
        ? { scale: [1, 1.18, 1], opacity: [1, 0.6, 1] }
        : { scale: [1, 1.1, 1] },
      { duration: LAND_S, ease: "easeOut" },
    );
  }
  return frame({}, {}, {});
}
