import { createHash } from "node:crypto";
import type { ApprovalContinuation } from "@openbot/toolkit/continuation";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { workItems } from "../db/schema";
import {
  type ConversationMessage,
  HANDOFF_MESSAGE_ID_PREFIX,
} from "../plugins/typed-recipients";
import { type RunAssertion, readRunAssertion } from "./callback-token";
import { HANDOFF_KIND } from "./handoff";

/**
 * Where a hop came from, when it came from the person's own words (docs/M1_PLAN.md, D27 amendment).
 *
 * THE PROBLEM. The person talks to Iris, not to Otto. "Send an email to ana@example.com saying good
 * morning" reaches Otto as a hop, and a hop's run holds a Bot's envelope, not that sentence. Nothing in
 * the hop said whether the person had really asked, or whether Iris was relaying a mail, a routine's
 * prompt or a group conversation, so every hop asked again, in a thread the person never sees.
 *
 * THE MARK. When a member hands work on during the person's own live chat turn, the SERVER records,
 * on the hop's row in its own queue, which turn that was: the person, the conversation, the run, and
 * the id and a hash of the person's message that started it. It is written by `handedRequestOf` from
 * the signed run assertion and the run's own input messages, never from the tool's arguments or from
 * any text, so nothing the model writes in the brief, the constraints or the arguments can set,
 * change or read it. Relays and notices are built elsewhere from scratch and never carry one.
 *
 * THE LOAD. At the approval gate, when the addressed member sends a new email, `createHandedRequestLoader`
 * reads the hop's row by the claim the signed run assertion names, and loads the person's message from
 * the ORIGIN conversation itself. It answers a message only when every one of these holds, and null
 * otherwise, so every doubt is a card:
 *
 * - the assertion is the deployment's own, for this member and this person, one hop deep;
 * - the row is that hop, still leased to this run, addressed to this member, for this person, and not
 *   a relay or a notice;
 * - the mark names this person, this hop's conversation and this hop's run;
 * - the origin conversation's LATEST message from the person is still the one the mark names, by id
 *   and by text. A newer message, or a hop left over from an earlier turn, fails here.
 *
 * What it cannot say, and the limits it leaves: the message in the origin conversation is whatever
 * the conversation holds as the person's, so a message a shared channel's other member typed, or one a
 * routine or task wrote into that conversation after the mark, is a latest message of its own and
 * fails the match rather than being trusted. A deployment that cannot read the conversation back
 * answers null. A member that hands on from inside a hop gets no mark.
 */

/** The payload key the mark lives under on the hop's row. */
export const HANDED_REQUEST_KEY = "request";

/** What the server records on a hop made in the person's own live chat turn. */
export type HandedRequest = {
  /** The person whose turn it was. */
  by: string;
  /** The conversation the hop was made in, which is where the person's message is loaded from. */
  threadId: string;
  /** The run the hop was made in. */
  runId: string;
  /** The person's message that started that turn, by id and by a hash of its text. */
  messageId: string;
  textHash: string;
};

/** What the gate is given: the person's message, and the conversation it was loaded from. */
export type LoadedRequest = {
  threadId: string;
  message: ConversationMessage;
};

export const hashText = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/**
 * The mark for a hop being made now, or null when this hop is not the person's own live request.
 *
 * Every condition is read from what the server holds: the signed assertion for who and how deep, and
 * the continuation for what started the run and what its input messages are. The tool's arguments are
 * not parameters here.
 *
 * - THE TURN IS THE PERSON'S OWN LIVE CHAT TURN: the continuation carries no initiator, which is what
 *   a turn started from the app has. A routine, a check-in, a memory run, a task, a message delivered
 *   from another channel, a group conversation and a hop all carry one.
 * - ONE HOP ONLY: the run is not itself a delivery (no handoff claim, depth zero) and its assertion
 *   says a person started it. A hop made from inside a hop carries no mark, so whoever receives that
 *   one is asked.
 * - THE RUN IS THE ONE ASSERTED: the assertion and the continuation name the same conversation and run.
 * - THE MESSAGE: the person's latest message in the run's input, a plain string with an id of its
 *   own. A message with attachments is parts, not a string, and is not marked.
 */
export function handedRequestOf(
  from: RunAssertion,
  continuation: ApprovalContinuation | undefined,
): HandedRequest | null {
  if (!continuation || continuation.initiator !== undefined) return null;
  if (from.handoff !== undefined || (from.depth ?? 0) !== 0) return null;
  if (from.initiator !== undefined && from.initiator.kind !== "person")
    return null;
  if (!from.threadId || !from.runId || !from.actorId) return null;
  if (
    continuation.threadId !== from.threadId ||
    continuation.runId !== from.runId
  )
    return null;

  const messages = continuation.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const content = (message as { content?: unknown }).content;
    const id = message.id;
    if (typeof content !== "string" || typeof id !== "string" || !id)
      return null;
    if (id.startsWith(HANDOFF_MESSAGE_ID_PREFIX)) return null;
    return {
      by: from.actorId,
      threadId: from.threadId,
      runId: from.runId,
      messageId: id,
      textHash: hashText(content),
    };
  }
  return null;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** The mark a row carries, read strictly; null for anything that is not exactly one. */
function markOf(payload: Record<string, unknown>): HandedRequest | null {
  const raw = payload[HANDED_REQUEST_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const mark = raw as Record<string, unknown>;
  const by = text(mark.by);
  const threadId = text(mark.threadId);
  const runId = text(mark.runId);
  const messageId = text(mark.messageId);
  const textHash = text(mark.textHash);
  if (!by || !threadId || !runId || !messageId || !textHash) return null;
  return { by, threadId, runId, messageId, textHash };
}

/**
 * Loads, at the approval gate, the person's message a hop was made from; see the module comment for
 * every condition. Resolves null on any doubt, including a failure to read anything at all.
 */
export function createHandedRequestLoader(options: {
  database: Database;
  /** The deployment key the run assertion was signed with. */
  encryptionKey: string;
  /**
   * A conversation's messages, as the person's own run would read them (`copilotRuntime.history`).
   * Scoped to the person, so a conversation that is not theirs reads as empty.
   */
  history: (input: {
    threadId: string;
    actorId: string;
  }) => Promise<readonly unknown[]>;
}) {
  const { database, encryptionKey, history } = options;

  return async function loadHandedRequest(input: {
    /** The run assertion the member's run carries, as presented: signed text, verified here. */
    assertion: unknown;
    /** The member making the call. */
    botId: string;
    /** The person the call is for. */
    actorId: string;
  }): Promise<LoadedRequest | null> {
    try {
      const run = readRunAssertion(input.assertion, encryptionKey);
      if (!run?.handoff) return null;
      if (run.botId !== input.botId || run.actorId !== input.actorId)
        return null;
      if ((run.depth ?? 0) !== 1) return null;

      // The hop this run is delivering: the claim is the deployment's own, signed, and the lease must
      // still be this run's. A finished or reclaimed row is not a hop that is running.
      const [row] = await database
        .select({ payload: workItems.payload })
        .from(workItems)
        .where(
          and(
            eq(workItems.kind, HANDOFF_KIND),
            eq(workItems.key, run.handoff.key),
            eq(workItems.claimedBy, run.handoff.owner),
            isNull(workItems.finishedAt),
            sql`${workItems.leaseUntil} > now()`,
          ),
        )
        .limit(1);
      const work = row?.payload as Record<string, unknown> | undefined;
      if (!work) return null;

      // Addressed to this member, for this person, a forward hop one deep, and not made from a
      // routine, a check-in or anything else that is not a person.
      if (work.toBotId !== input.botId || work.actorId !== input.actorId)
        return null;
      if (work.depth !== 1 || work.answerIn !== undefined) return null;
      const started = work.initiator as { kind?: unknown } | undefined;
      if (started !== undefined && started.kind !== "person") return null;

      const mark = markOf(work);
      if (
        !mark ||
        mark.by !== input.actorId ||
        mark.threadId !== work.threadId ||
        mark.runId !== work.runId
      )
        return null;

      // The person's latest message in the origin conversation, whatever it is: if it is not the one
      // the mark names, the turn the mark came from is no longer the person's latest word.
      const messages = await history({
        threadId: mark.threadId,
        actorId: input.actorId,
      });
      let latest:
        | { id?: unknown; role?: unknown; content?: unknown }
        | undefined;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const candidate = messages[index] as
          | { id?: unknown; role?: unknown; content?: unknown }
          | null
          | undefined;
        if (candidate && candidate.role === "user") {
          latest = candidate;
          break;
        }
      }
      if (!latest) return null;
      if (typeof latest.id !== "string" || latest.id !== mark.messageId)
        return null;
      if (
        typeof latest.content !== "string" ||
        hashText(latest.content) !== mark.textHash
      )
        return null;
      return {
        threadId: mark.threadId,
        message: { id: latest.id, role: "user", content: latest.content },
      };
    } catch {
      // A conversation that cannot be read, a database that blinked: nothing is trusted, so it asks.
      return null;
    }
  };
}
