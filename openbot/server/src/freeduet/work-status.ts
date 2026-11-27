/**
 * Who is working and on what (D168): the live half of a hand-off, read-only.
 *
 * WHAT IS REAL AND WHAT IS NEW. Whether a hand-off is queued, running or done is already in the hop
 * queue (`work_items`, the ledger Activity reads); whether a card waits on the person is in the approval
 * and question ledgers (`activity.attention`). The one thing nobody kept is "what did the member do last":
 * a hop's events go past `handoff-delivery.ts` and are gone. This file keeps ONE small in-memory note per
 * running hop (the time of its last event and a plain label of its last tool step) so a person can see
 * a member is alive. It is not a ledger: it is lost on a restart, and then a running hop shows no step
 * until its next event.
 *
 * NO ARGUMENTS, EVER. The label comes from the tool's NAME alone, through `stepLabel`: not a path, not a
 * page address, not a command, not a word of the task.
 */

/** A running hop with no event for this long is shown as stuck. One place; the server decides, the app only draws. */
export const STUCK_AFTER_MS = 5 * 60 * 1000;

/** A finished hop stays on the card this long, so the person sees "done" and not just a card that vanished. */
export const DONE_VISIBLE_MS = 30 * 60 * 1000;

/** A note for a hop nobody finished (a crash) is dropped after this long. */
const NOTE_KEEP_MS = 6 * 60 * 60 * 1000;

const LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /write_file|create_file|edit_file|^(write|edit|multiedit)$/,
    "writing a file",
  ],
  [/read_file|list_files|^(read|ls|glob|grep)$/, "reading files"],
  [/run_command|^bash$|shell|execute/, "running a command"],
  [
    /screenshot|snapshot|page_frame|read_page|navigate|^(read|open)_?page|web_?fetch|browse/,
    "reading a page",
  ],
  [/click|type|select|scroll|key|sign_in|secret|download/, "using a page"],
  [/search/, "searching"],
  [/mail|email|inbox|draft/, "working on mail"],
  [/calendar|event|meeting/, "checking the calendar"],
  [/hand_?off|message_bot|ask_/, "asking a colleague"],
  [/memory|remember/, "using its notes"],
  [/image|picture|draw|design/, "working on a picture"],
  [/video/, "working on a video"],
];

/** A short human label for a tool NAME. A prefix such as `mcp__freeduet__` is ignored; the arguments are never seen. */
export function stepLabel(toolName: unknown): string {
  const raw = typeof toolName === "string" ? toolName : "";
  const name = (raw.split("__").pop() ?? "").toLowerCase().trim();
  for (const [pattern, label] of LABELS) if (pattern.test(name)) return label;
  return "working";
}

type Note = {
  startedAt: number;
  lastEventAt: number;
  step: { label: string; at: number } | null;
};

export type WorkNotes = ReturnType<typeof createWorkNotes>;

/** The in-memory notes, keyed by `handoffKey`. The clock is injected so a test needs no waiting. */
export function createWorkNotes(now: () => number = Date.now) {
  const notes = new Map<string, Note>();
  const sweep = () => {
    for (const [key, note] of notes)
      if (now() - note.lastEventAt > NOTE_KEEP_MS) notes.delete(key);
  };
  const noteFor = (key: string): Note => {
    let found = notes.get(key);
    if (!found) {
      found = { startedAt: now(), lastEventAt: now(), step: null };
      notes.set(key, found);
    }
    return found;
  };
  return {
    /** A delivery began. */
    begin(key: string) {
      sweep();
      notes.set(key, { startedAt: now(), lastEventAt: now(), step: null });
    },
    /** Any event of the run: a sign of life. A tool call also becomes the last step. */
    event(key: string, type: string, toolName?: unknown) {
      const note = noteFor(key);
      note.lastEventAt = now();
      if (type === "TOOL_CALL_START")
        note.step = { label: stepLabel(toolName), at: now() };
    },
    /** The delivery ended, one way or the other. */
    end(key: string) {
      notes.delete(key);
    },
    get(key: string): Note | undefined {
      return notes.get(key);
    },
  };
}

/** The process-wide notes the hand-off delivery writes and the route reads. */
export const workNotes = createWorkNotes();

/** The key of a hop for the notes: the fields of the hop that never change between attempts. */
export function handoffNoteKey(work: {
  fromBotId?: string;
  toBotId?: string;
  threadId?: string;
  runId?: string;
}): string {
  return [work.fromBotId, work.toBotId, work.threadId, work.runId].join("|");
}

export type HandoffState = "working" | "waiting" | "stuck" | "queued" | "done";

export type WorkStatusHandoff = {
  /** The hop's key on the queue; the app opens the member's conversation from `toBotId`. */
  id: string;
  fromBotId: string;
  toBotId: string;
  toName: string;
  /** The conversation that asked, where the card is drawn. */
  threadId: string | null;
  state: HandoffState;
  /** ISO time the work started, or finished when `state` is done. */
  since: string;
  /** A short clip of the task as the asking member wrote it. */
  title: string;
  lastStep: { label: string; at: string } | null;
};

export type WorkStatusMemberState = "working" | "waiting" | "stuck" | "idle";

export type WorkStatusMember = {
  agentId: string;
  name: string;
  state: WorkStatusMemberState;
  since: string | null;
  handoffId: string | null;
  title: string | null;
  lastStep: { label: string; at: string } | null;
};

export type HopRow = {
  key: string;
  payload: unknown;
  attempts: number;
  claimedBy: string | null;
  leaseUntil: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
};

type Payload = {
  fromBotId?: string;
  toBotId?: string;
  toName?: string;
  threadId?: string;
  runId?: string;
  task?: string;
};

const clip = (text: string | undefined, max = 120) =>
  text ? Array.from(text).slice(0, max).join("") : "Delegated task";
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Turn the person's hop rows, the notes and the "needs you" counts into what the card and the dots draw.
 * Pure: the rows, the clock and the maximum attempts come in, so the stuck rule is tested with a fake clock.
 */
export function buildWorkStatus(input: {
  hops: readonly HopRow[];
  notes: Pick<WorkNotes, "get">;
  /** Per member id: how many cards or questions wait on the person. */
  needsYou: ReadonlyMap<string, number>;
  names: ReadonlyMap<string, string>;
  now: number;
  maxAttempts: number;
}): { handoffs: WorkStatusHandoff[]; members: WorkStatusMember[] } {
  const handoffs: WorkStatusHandoff[] = [];
  for (const hop of input.hops) {
    const work = hop.payload as Payload;
    if (!work.toBotId || !work.fromBotId) continue;
    const note = input.notes.get(handoffNoteKey(work));
    const finished = hop.finishedAt !== null;
    const stopped = hop.lastError === "Stopped by the person";
    if (
      finished &&
      (stopped || input.now - hop.finishedAt!.getTime() > DONE_VISIBLE_MS)
    )
      continue;
    const running =
      !finished &&
      hop.claimedBy !== null &&
      hop.leaseUntil !== null &&
      hop.leaseUntil.getTime() > input.now;
    const gaveUp = !finished && hop.attempts >= input.maxAttempts;
    const startedAt = note?.startedAt ?? hop.updatedAt.getTime();
    const alive = note?.lastEventAt ?? hop.updatedAt.getTime();
    let state: HandoffState;
    if (finished) state = "done";
    else if (gaveUp) state = "waiting";
    else if (running)
      state =
        (input.needsYou.get(work.toBotId) ?? 0) > 0
          ? "waiting"
          : input.now - alive >= STUCK_AFTER_MS
            ? "stuck"
            : "working";
    else state = "queued";
    handoffs.push({
      id: hop.key,
      fromBotId: work.fromBotId,
      toBotId: work.toBotId,
      toName: work.toName ?? input.names.get(work.toBotId) ?? work.toBotId,
      threadId: work.threadId ?? null,
      state,
      since: iso(finished ? hop.finishedAt!.getTime() : startedAt),
      title: clip(work.task),
      lastStep:
        note?.step && !finished
          ? { label: note.step.label, at: iso(note.step.at) }
          : null,
    });
  }

  // One line per member: the most pressing of its hops (a stuck one beats a waiting one beats a working one).
  const rank: Record<HandoffState, number> = {
    stuck: 4,
    waiting: 3,
    working: 2,
    queued: 1,
    done: 0,
  };
  const members = new Map<string, WorkStatusMember>();
  for (const hop of handoffs) {
    if (hop.state === "done") continue;
    const current = members.get(hop.toBotId);
    if (current && rank[hop.state] <= rank[current.state as HandoffState])
      continue;
    members.set(hop.toBotId, {
      agentId: hop.toBotId,
      name: hop.toName,
      state:
        hop.state === "queued"
          ? "working"
          : (hop.state as WorkStatusMemberState),
      since: hop.since,
      handoffId: hop.id,
      title: hop.title,
      lastStep: hop.lastStep,
    });
  }
  // A member with a card waiting but no hop (its own chat) is still "waiting for you".
  for (const [agentId, count] of input.needsYou) {
    if (count > 0 && !members.has(agentId))
      members.set(agentId, {
        agentId,
        name: input.names.get(agentId) ?? agentId,
        state: "waiting",
        since: null,
        handoffId: null,
        title: null,
        lastStep: null,
      });
  }
  return { handoffs, members: [...members.values()] };
}
