import { expect, test } from "bun:test";
import type { ComposerDraft } from "@/components/channels/composer/draft";
import {
  type QueuedMessage,
  reduceQueue,
} from "@/components/channels/composer/queue";

/**
 * WORDS FROM THE MICROPHONE KEEP THEIR MARK THROUGH THE QUEUE (docs/design/voice.md, D7 and D8).
 *
 * Dictation sent with one press is marked on its draft (`ComposerDraft.voice`), and a message parked
 * while the Bot is working is rebuilt field by field, so the mark has to be carried on purpose: a
 * parked message that lost it would run later as if the person had typed it, and the server would give
 * it the shortcut the decision denies. A turn drained from several parked messages is one message to
 * the Bot, so it is marked when any one of them is. Nothing here sets the mark on words that were
 * typed: a draft without it never gets one.
 */

const draft = (text: string, voice = false): ComposerDraft => ({
  text,
  agentId: null,
  commandIds: [],
  isEmpty: text.length === 0,
  attachments: [],
  ...(voice ? { voice: true as const } : {}),
});

const parked = (text: string, voice = false, id = text): QueuedMessage => ({
  id,
  text,
  commandIds: [],
  attachments: [],
  ...(voice ? { voice: true as const } : {}),
});

test("guard: an idle send is the draft itself, mark or no mark", () => {
  const typed = draft("Write to ana@example.com");
  expect(
    reduceQueue([], { type: "submit", id: "a", draft: typed, busy: false }).run,
  ).toBe(typed);
  const spoken = draft("Write to ana@example.com", true);
  const run = reduceQueue([], {
    type: "submit",
    id: "a",
    draft: spoken,
    busy: false,
  }).run;
  expect(run).toBe(spoken);
  expect(run?.voice).toBe(true);
});

test("a message parked while the Bot is busy keeps the mark of the draft it was made from", () => {
  const { queue } = reduceQueue([], {
    type: "submit",
    id: "a",
    draft: draft("Write to ana@example.com", true),
    busy: true,
  });
  expect(queue).toEqual([parked("Write to ana@example.com", true, "a")]);
});

test("guard: a typed message parked while the Bot is busy is not marked, and has no mark field at all", () => {
  const { queue } = reduceQueue([], {
    type: "submit",
    id: "a",
    draft: draft("Write to ana@example.com"),
    busy: true,
  });
  expect(queue).toEqual([parked("Write to ana@example.com", false, "a")]);
  expect(Object.keys(queue[0] ?? {})).not.toContain("voice");
});

test("the turn drained from the queue is marked when any message in it is", () => {
  const settled = (queue: readonly QueuedMessage[]) =>
    reduceQueue(queue, { type: "settle" }).run;
  expect(
    settled([parked("first"), parked("then send it", true), parked("last")])
      ?.voice,
  ).toBe(true);
  expect(settled([parked("only", true)])?.voice).toBe(true);
  expect(settled([parked("first", true), parked("second")])?.voice).toBe(true);
});

test("guard: a turn drained from typed messages only is not marked", () => {
  const run = reduceQueue([parked("first"), parked("second")], {
    type: "settle",
  }).run;
  expect(run?.text).toBe("first\nsecond");
  expect(Object.keys(run ?? {})).not.toContain("voice");
});

test("a live send that joins a parked message from the microphone is marked, a typed one on its own is not", () => {
  const joined = reduceQueue([parked("go ahead", true)], {
    type: "submit",
    id: "b",
    draft: draft("and tell Ana"),
    busy: false,
  }).run;
  expect(joined?.text).toBe("go ahead\nand tell Ana");
  expect(joined?.voice).toBe(true);

  const livePlusSpoken = reduceQueue([parked("typed first")], {
    type: "submit",
    id: "b",
    draft: draft("then dictated", true),
    busy: false,
  }).run;
  expect(livePlusSpoken?.voice).toBe(true);

  const allTyped = reduceQueue([parked("typed first")], {
    type: "submit",
    id: "b",
    draft: draft("typed second"),
    busy: false,
  }).run;
  expect(Object.keys(allTyped ?? {})).not.toContain("voice");
});

test("a drain that fails puts the messages back with their marks, so the retry is marked too", () => {
  const drained = reduceQueue([parked("go ahead", true), parked("typed")], {
    type: "settle",
  });
  expect(drained.restoreIfRunFails).toEqual([
    parked("go ahead", true),
    parked("typed"),
  ]);
  const restored = reduceQueue([], {
    type: "restore",
    messages: drained.restoreIfRunFails,
  });
  expect(restored.queue).toEqual([parked("go ahead", true), parked("typed")]);
  expect(reduceQueue(restored.queue, { type: "settle" }).run?.voice).toBe(true);
});
