/**
 * Running the Bot that was addressed, and letting its answer land in the conversation.
 *
 * The delivery half of a hop. `handoff-runner.ts` decides which hop and holds the lease; this knows
 * how to turn one into a turn.
 *
 * THROUGH THE PLATFORM'S OWN RUNNER, not by calling the agent and writing the result somewhere. The
 * runner is what persists a turn to a thread, so an answer delivered this way is the same kind of
 * object as one a person's run produced: it appears in the transcript, it is in the history the next
 * run reads, and it survives whichever pod produced it. Calling `agent.run` directly would produce
 * an answer nothing had recorded, which is the failure nobody can debug: the first Bot says it handed
 * the work over, the second says it answered, and no row anywhere agrees.
 */
import type { AbstractAgent, BaseEvent } from "@ag-ui/client";
import { THREAD_LOCK_TTL_SECONDS } from "@openbot/toolkit/copilotkit/thread-lock";
import {
  type HeadlessTool,
  HeadlessToolsMiddleware,
} from "@openbot/toolkit/headless-tools";
import { keepLease } from "@openbot/toolkit/lease";
import type { ThreadLock, TurnAdmission } from "@openbot/toolkit/ports";
import {
  OFFER_FILE_TOOL,
  type OfferedFile,
  readOfferedFile,
} from "@openbot/shared/member-file";
import type { Observable } from "rxjs";
import { type AuditInitiator, handoffInitiator } from "../audit";
import { handoffNoteKey, workNotes } from "../freeduet/work-status";
import type { HandoffDelivery, HandoffWork } from "./handoff-runner";
import { textOf } from "./message-text";

/**
 * D177: the only names `offer_file` arrives under: plain, and with the one prefix FreeDuet registers its
 * server tools by (`mcp__freeduet__<name>`, agent-freeduet `transcript.py`). A tool of another server that
 * ends in `__offer_file` is not it.
 */
export const OFFER_FILE_NAMES: ReadonlySet<string> = new Set([
  OFFER_FILE_TOOL,
  `mcp__freeduet__${OFFER_FILE_TOOL}`,
]);

/** D177: the most `offer_file` results one hop records. A run that offers more is not a delivery. */
export const MAX_OFFERS_PER_HOP = 10;

/** Whatever runs an agent against a thread and records what it did. */

/**
 * The conversation an answer belongs in has a run going. Usually the Bot that asked, still finishing
 * the sentence that said it had asked, so the first retry comes quickly rather than a minute later.
 */
export class ThreadBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadBusyError";
  }
}

export type ThreadRunner = {
  run: (request: {
    threadId: string;
    agent: AbstractAgent;
    input: unknown;
    /** What the conversation keeps, when that is not the whole of what the model was sent. */
    persistedInputMessages?: readonly unknown[];
  }) => Observable<BaseEvent>;
  /** Stop a run in flight, as a pause does for every other turn. */
  stop?: (input: { threadId: string; runId: string }) => Promise<unknown>;
};

export function createHandoffDelivery(options: {
  /**
   * The addressed Bot, built for the person whose conversation this is.
   *
   * Built per hop and for that person, because a Bot's tools are resolved against their grants: the
   * second Bot runs as the same person, with its own role and its own grants, and must see what they
   * may see and no more.
   */
  agentFor: (input: {
    actorId: string;
    botId: string;
    /** The Bot that handed the work on, so the trail says a hop ran this and not the person. */
    fromBotId: string;
    /** What started the original run, so a Bot built for a hop still knows who it ultimately acts for. */
    initiator?: AuditInitiator;
  }) => Promise<AbstractAgent | null>;
  /**
   * The conversation so far, read only for a BACKWARDS hop (a relay or a notice), which speaks into the
   * thread it reads. A forward hop reads none of the asking conversation (D176).
   *
   * PASSED THROUGH UNTOUCHED, which is why its shape is the reader's rather than named here. The
   * platform holds a thread's messages in its own type and takes them back in the same one; sitting
   * in the middle with a stricter type would mean inventing a conversion between two shapes that
   * already agree, and a conversion is a place to lose a message.
   */
  history: (input: {
    threadId: string;
    actorId: string;
  }) => Promise<readonly unknown[]>;
  runner: ThreadRunner;
  lock: ThreadLock;
  /**
   * A fresh thread of the addressed Bot's own, where its working happens out of sight.
   *
   * NOT THE CONVERSATION THAT ASKED, and this is a property of the platform rather than a choice. An
   * Intelligence thread is owned by exactly one agent: `assertThreadAgentOwnership` refuses any other
   * one, and the managed-channel path that relaxes USER ownership still enforces agent ownership. A
   * second Bot answering inside the first Bot's thread is not something this platform can express
   * today, whatever the caller does.
   *
   * A scratch thread rather than the Bot's own channel with the person, which is where answers used
   * to land. Two conversations for one question meant the person read the answer somewhere they
   * never asked anything; now the runner relays what came back through the Bot that asked, in the
   * conversation they are actually watching, and the scratch thread is never mapped to a channel so
   * nobody is shown it. It still exists on the platform, which is what makes the turn a recorded
   * run rather than an unlogged model call.
   */
  mintThreadId: () => string;
  /**
   * Tell the roster a conversation moved, when a turn put words in it.
   *
   * A HOP HAS NOBODY WATCHING. A conversation's place in the list and the line under its name are
   * written by the browser when somebody's own run finishes; a hop finishes on a server with no
   * browser attached, so without this a relayed answer lands in a conversation that never bumps,
   * never reads as unread, and is found by accident. Routines have the same problem and the same
   * answer: `recordActivity`, from the server, when the turn is on record.
   *
   * Keyed by thread rather than channel, because the thread is all a delivery knows. The wiring
   * resolves which channel shows that thread — and a scratch thread resolves to nothing, which is
   * a no-op rather than a mistake.
   */
  announce?: (input: {
    actorId: string;
    threadId: string;
    agentId: string;
    text: string;
  }) => Promise<void>;
  /**
   * Show the asking conversation as working while a FORWARD hop runs, and stop when it is over.
   *
   * Only the forward leg, and keyed on the asking thread — `work.threadId`, the conversation the
   * person is waiting in — because that leg runs in a scratch thread nobody watches. A backwards
   * hop runs in the asking thread itself, whose lock the runtime already lights through its own
   * busy signal, so this leaves that leg alone rather than double it. Best-effort and paired in a
   * `finally`, so a channel never stays lit because a run threw.
   */
  setBusy?: (input: {
    threadId: string;
    runId: string;
    busy: boolean;
  }) => Promise<void>;
  newRunId: () => string;
  /**
   * How long one delivery may go with no event at all before it is given up on (D170: silence, not
   * wall-clock time; every event from the run starts the wait again; see `HOP_SILENCE_MS`).
   *
   * A HOP MUST BE BOUNDED, because nothing else bounds it. The addressed Bot's run is an ordinary
   * agent turn: a model that stops mid-stream, a tool waiting on something that never arrives, a
   * browser that never loads the page. On a person's own run there is somebody watching who can
   * reload the page; a hop has nobody, and an unbounded one holds the conversation's lock, holds its
   * place on the queue and leaves the person waiting on an answer that is never coming, with the
   * conversation it was asked in locked against them for as long as the process lives.
   */
  deadlineMs?: number;
  /**
   * D170: the longest one hop may run in total, however lively. Overridden by tests; see
   * `HOP_CAP_MS`. A hop that reaches it fails with a `HopCapError`, which the runner does not retry.
   */
  capMs?: number;
  /** How often the lock is renewed while the Bot works. Overridden by tests; see `LOCK_RENEW_EVERY_MS`. */
  renewEveryMs?: number;
  /**
   * How long the lock lives without a renewal. Renewals failing for longer than this mean it has
   * lapsed, and the hop stops. Overridden by tests; the platform applies its own 120 seconds.
   */
  lockLifetimeMs?: number;
  /**
   * The same admission every headless turn meets: the pause guard and the enterprise controls. See
   * `serverTurnAdmission` in turn-admission.ts.
   */
  admission: TurnAdmission;
  /**
   * The computer tools a hop gets: the same ones an ordinary turn of that Bot gets (FreeDuet,
   * docs/M1_PLAN.md D22 for the relay, D130 for the forward hop). Asked for every hop: the relay of
   * an answer or a notice (`work.answerIn`, in the conversation the person is watching) and the
   * forward hop (a scratch thread nobody sees). Without it a member asked by a colleague could never
   * use its own browser. A card a forward hop raises is drawn in the conversation that asked (D48,
   * D52) and the decision resumes the hop (`handoff-resume.ts`), so it can be answered. Absent, as
   * upstream has it, no hop gets any.
   */
  toolsForTurn?: (input: {
    ownerUserId: string;
    agentId: string;
    initiator: AuditInitiator;
  }) => Promise<readonly HeadlessTool[]>;
  /**
   * D177: the files the addressed member offered with `offer_file` during a FORWARD hop, read from the
   * tool's own results as they went past (never from what the model said). Records them for the person's
   * conversation and for the asking Bot (`freeduet/handoff-files.ts`) and returns the server's note that
   * goes in front of the answer, or null. Never called for a relay or a notice. A throw is swallowed: the
   * turn happened, and the answer still goes back.
   */
  offeredFiles?: (input: {
    work: HandoffWork;
    files: readonly OfferedFile[];
  }) => Promise<string | null>;
}): HandoffDelivery {
  const {
    admission,
    agentFor,
    history,
    runner,
    lock,
    mintThreadId,
    announce,
    setBusy,
    newRunId,
    deadlineMs = HOP_SILENCE_MS,
    capMs = HOP_CAP_MS,
    renewEveryMs = LOCK_RENEW_EVERY_MS,
    lockLifetimeMs = THREAD_LOCK_TTL_SECONDS * 1000,
    toolsForTurn,
    offeredFiles,
  } = options;

  return {
    async deliver({ work, message, shown, assertion }) {
      /*
       * Admitted before anything else, as every headless turn is: refused if the person paused the
       * Bot while this hop waited, or if "Use Bots" or the model allowlist refuse it, before the Bot
       * is built, the history read or the conversation locked. A refused hop used to take the lock
       * first, so a paused Bot's relay held the person's own channel for a moment on every retry.
       * The signal it returns aborts if they pause the Bot while it works, on this replica at once
       * and from any other through the watcher. The runner's check before claiming is not enough on
       * its own, because a hop runs for minutes.
       */
      const paused = await admission({
        ownerUserId: work.actorId,
        agentId: work.toBotId,
      });
      const agent = await agentFor({
        actorId: work.actorId,
        botId: work.toBotId,
        fromBotId: work.fromBotId,
        ...(work.initiator ? { initiator: work.initiator } : {}),
      });
      if (!agent) {
        /*
         * Thrown rather than swallowed, so the hop is released and tried again. A Bot that cannot be
         * built right now is usually a Bot whose endpoint is briefly unreachable or whose row is
         * mid-edit, and both of those come back.
         */
        throw new Error(`${work.toBotId} could not be built for this run`);
      }

      /*
       * What the addressed Bot actually did, kept so a hop that failed can say so.
       *
       * A hop has nobody watching it. When one goes wrong the only question worth answering first is
       * how far it got: a Bot that said twenty things and stopped is a stalled model, and one that
       * said nothing at all never reached its model. Those are different faults with different
       * fixes, and without this they are the same silence.
       *
       * The runner publishes events to the platform rather than through the observable it returns,
       * so the count has to be taken at the agent. Patched onto the instance, which is built fresh
       * for this one delivery, rather than wrapped: the runner reads the agent's own fields and
       * calls its methods, and a stand-in that proxies them is a second thing to keep in step.
       */
      const seen = { count: 0, last: "" };
      // D170: when the run last showed a sign of life; `settled` stops a hop for silence, not for time.
      const life = { at: Date.now() };
      /*
       * What the addressed Bot said, gathered from the stream as it goes past.
       *
       * The runner publishes the turn to the platform rather than back through the observable, so
       * the text exists nowhere this function can read after the fact — the events are the one
       * chance to hear it. It is what the relay carries back to the conversation that asked, and
       * with the answer no longer landing in a channel of its own, this is the only copy a person
       * will ever be shown.
       */
      const said: string[] = [];
      /*
       * Cards the addressed Bot's run stopped on (D48): the run ends with a pause for the person's
       * decision, which is not an answer and not a failure, and the hop used to end there in silence.
       */
      let waiting = 0;
      let saying = "";
      // D177: `offer_file` results of this run, by the call that made them. The server's own tool made
      // each text; the member can name a path but cannot write the result.
      const calls = new Map<string, string>();
      const offered: OfferedFile[] = [];
      const runAgent =
        typeof agent.runAgent === "function"
          ? agent.runAgent.bind(agent)
          : undefined;
      if (runAgent)
        (agent as { runAgent: unknown }).runAgent = (
          input: unknown,
          config?: { onEvent?: (emitted: unknown) => void },
        ) =>
          runAgent(
            input as never,
            {
              ...(config ?? {}),
              onEvent: (emitted: {
                event?: {
                  type?: unknown;
                  delta?: unknown;
                  name?: unknown;
                  value?: { kind?: unknown };
                };
              }) => {
                seen.count += 1;
                life.at = Date.now();
                const type = String(emitted?.event?.type ?? "");
                seen.last = type;
                // D168: a sign of life, and the last tool step by its NAME only, for the work-status card.
                if (!work.answerIn)
                  workNotes.event(
                    handoffNoteKey(work),
                    type,
                    (emitted?.event as { toolCallName?: unknown } | undefined)
                      ?.toolCallName,
                  );
                if (offeredFiles && !work.answerIn) {
                  const event = emitted?.event as
                    | {
                        toolCallId?: unknown;
                        toolCallName?: unknown;
                        content?: unknown;
                      }
                    | undefined;
                  if (
                    type === "TOOL_CALL_START" &&
                    typeof event?.toolCallId === "string" &&
                    typeof event.toolCallName === "string"
                  )
                    calls.set(event.toolCallId, event.toolCallName);
                  if (
                    type === "TOOL_CALL_RESULT" &&
                    typeof event?.toolCallId === "string" &&
                    OFFER_FILE_NAMES.has(calls.get(event.toolCallId) ?? "")
                  ) {
                    const file = readOfferedFile(event.content);
                    if (
                      file &&
                      offered.length < MAX_OFFERS_PER_HOP &&
                      !offered.some((each) => each.path === file.path)
                    )
                      offered.push(file);
                  }
                }
                if (type === "TEXT_MESSAGE_START") saying = "";
                if (type === "TEXT_MESSAGE_CONTENT")
                  saying += String(emitted?.event?.delta ?? "");
                if (type === "TEXT_MESSAGE_END" && saying.trim().length > 0)
                  said.push(saying.trim());
                if (
                  type === "CUSTOM" &&
                  emitted?.event?.name === "openbot.headless.waiting" &&
                  emitted.event.value?.kind === "approval"
                )
                  waiting += 1;
                config?.onEvent?.(emitted);
              },
            } as never,
          );

      /*
       * The conversation this turn runs in.
       *
       * Named on the hop for the kind that goes backwards — the asking Bot speaking in the
       * conversation the person is watching, to relay an answer or a failure. Every forward hop
       * runs in a scratch thread of the addressed Bot's own, because a thread has exactly one
       * agent; what it says there comes back to the person through the relay, not the thread.
       */
      const where: { threadId: string } = work.answerIn
        ? { threadId: work.answerIn }
        : { threadId: mintThreadId() };

      /*
       * A forward hop lights the asking channel while it runs, because its own run is in a scratch
       * thread nobody sees. A backwards hop — a relay or a notice — runs in the asking thread
       * itself, so the runtime's own thread lock already lights it through `onRunBusy`, and
       * signalling here too would double up. So this covers only the leg the lock cannot: the
       * addressed Bot thinking, off-screen, on behalf of a channel the person is watching.
       */
      const lightsAskingChannel = !work.answerIn;
      if (lightsAskingChannel) workNotes.begin(handoffNoteKey(work));
      const busyOwner = `handoff:${crypto.randomUUID()}`;
      if (lightsAskingChannel) {
        await setBusy?.({
          threadId: work.threadId,
          runId: busyOwner,
          busy: true,
        }).catch(() => {});
      }
      try {
        /*
         * D176: what the addressed Bot is shown beforehand.
         *
         * A FORWARD hop is shown nothing of the conversation that asked: that is the person's
         * private conversation with another Bot, and the hop was handed a task, not that
         * conversation (a hand-off must not widen what a member reads). It gets its framing
         * message and nothing before it, so the task has to carry what the member needs. The
         * conversation was read whole until 27 November 2026, and a hop resumed after a card then
         * replayed it (a 6.5 MB input on the person's subscription, and an answer built on the
         * asker's stale lines). A BACKWARDS hop runs in the asking thread itself, so its tail is
         * its own conversation: the tail is kept, as before.
         */
        const prior = work.answerIn
          ? conversationOnly(
              await history({ threadId: work.threadId, actorId: work.actorId }),
            )
          : [];

        /*
         * The hop's computer, resolved before the lock is taken so a failure here leaks nothing. The
         * same call a routine or a wake-up makes, under the same middleware: a gated action stops the
         * run with an approval, and nothing runs before the person decides. For a relay that card is
         * in the conversation they are watching; for a forward hop it is drawn in the conversation
         * that asked (D52). See `toolsForTurn` above.
         */
        const computer = toolsForTurn
          ? await toolsForTurn({
              ownerUserId: work.actorId,
              agentId: work.toBotId,
              initiator: handoffInitiator(work.fromBotId, work.initiator),
            })
          : [];

        /*
         * The conversation's lock, before a single event is streamed.
         *
         * The platform's run id is the one it hands back, not the one asked for: it is the identity the
         * gateway will check every streamed event against, so using the local one would be claiming to
         * be a run that does not exist.
         */
        const held = await lock.acquire({
          threadId: where.threadId,
          runId: newRunId(),
          userId: work.actorId,
          agentId: work.toBotId,
        });
        if (!held) {
          /*
           * Somebody else is running in this conversation. Thrown so the hop goes back on the queue
           * and is tried again: a person mid-question, or the Bot that asked still finishing its own
           * sentence, is a wait rather than a failure.
           */
          throw new ThreadBusyError(
            `${where.threadId} is busy with another run; the hop will be tried again`,
          );
        }

        const runId = held.runId;

        /*
         * THE CONVERSATION GOES ON THE AGENT, NOT IN THE RUN.
         *
         * `runAgent` takes `runId`, `tools`, `context` and `forwardedProps` and nothing else: AG-UI
         * keeps the messages and the thread on the agent itself, and builds the run's input from them.
         * A `messages` array passed as a parameter is silently ignored, which is the worst shape a
         * mistake can take. Nothing failed. The addressed Bot ran, against an empty conversation, and
         * answered "how can I help?" to a question it had never been shown, in a transcript that
         * displayed the question directly above the answer.
         */
        const asked = [
          /*
           * A backwards hop gets the tail, not the whole. Its task already carries everything it has
           * to say — the answer, or the failure — and the person is waiting through this run's
           * time-to-first-token: a long channel read in full would make relaying an answer slower
           * the longer the conversation that wanted it. A few recent turns keep the voice and the
           * pronouns right; the rest is weight.
           */
          ...prior.slice(-RELAY_CONTEXT_MESSAGES),
          { id: `handoff-${runId}`, role: "user", content: message },
        ];
        agent.threadId = where.threadId;
        if (computer.length > 0)
          agent.use(
            new HeadlessToolsMiddleware(
              [...computer],
              handoffInitiator(work.fromBotId, work.initiator),
            ),
          );
        // The platform's own message type rather than AG-UI's, which is what `history` returns: the
        // two agree where it matters, and converting between them is a place to lose a message.
        agent.setMessages(asked as Parameters<AbstractAgent["setMessages"]>[0]);
        /*
         * Renewed while the addressed Bot works, because the lock expires on its own. A run is minutes
         * and the platform's window is short; a lock that lapses mid-answer lets a second run into the
         * conversation, which is the thing it exists to prevent.
         *
         * A renewal refused as a conflict means somebody else now holds this conversation — on a
         * relay, most likely the person, having typed in their own channel. The run is stopped as a
         * pause would stop it and the hop fails into a retry, rather than writing this Bot's answer
         * into their run. A renewal that merely failed is skipped; see `keepLease`.
         */
        const lockLost = new AbortController();
        const heartbeat = keepLease({
          renew: () => lock.renew({ threadId: where.threadId, runId }),
          everyMs: renewEveryMs,
          lifetimeMs: lockLifetimeMs,
          onLost: (error) => lockLost.abort(error),
        });

        try {
          await settled(
            runner.run({
              threadId: where.threadId,
              agent,
              /*
               * What the conversation KEEPS, which is not what the model was sent.
               *
               * The runner persists whatever it is given here, and given nothing it persists the whole
               * prompt: the asking conversation's history repeated into a second conversation, and a
               * paragraph of instructions to a model sitting in a bubble that looks like something the
               * person typed. What belongs in a transcript is the one line saying why this Bot spoke.
               */
              persistedInputMessages: shown
                ? [{ id: `handoff-${runId}`, role: "user", content: shown }]
                : [],
              /*
               * NOTHING IS PASSED FOR THE CONNECTION, and that is load-bearing.
               *
               * The lock hands back a join token as well as a run id, and it reads like the thing to
               * present here. It is not: it is what a BROWSER presents to join a conversation and
               * watch it, and the runner's socket is a different connection with its own credential.
               * Handing it in overrides that credential, the socket is refused, and because the runner
               * treats a socket that will not connect as something to keep retrying rather than as a
               * failed run, nothing is ever emitted and nothing ever completes. The hop hangs, in
               * total silence, until the deadline below ends it.
               *
               * What makes this run legitimate is the lock itself: the gateway compares the run id on
               * every event to the one the lock holds. Taking the lock is the whole of the ceremony.
               */
              input: {
                threadId: where.threadId,
                runId,
                /*
                 * The same conversation the agent was given, so the run's own record of what it was
                 * asked agrees with what it read.
                 */
                messages: asked,
                tools: computer
                  .filter((tool) => !tool.hidden)
                  .map((tool) => tool.definition),
                context: [],
                state: {},
                /*
                 * The deployment's own statement of what this run is, carrying how deep the chain has
                 * gone. It is what stops the addressed Bot handing the work on for ever, and it is
                 * signed, so the Bot cannot edit its own depth on the way past.
                 */
                forwardedProps: { openbotRun: assertion },
              },
            }),
            { silenceMs: deadlineMs, capMs, life },
            AbortSignal.any([paused, lockLost.signal]),
            () => {
              void runner
                .stop?.({ threadId: where.threadId, runId })
                .catch(() => undefined);
            },
            (why) => {
              const progress =
                seen.count === 0
                  ? "and never reached its model"
                  : `after ${seen.count} events, the last ${seen.last}`;
              return why === "cap"
                ? `${work.toBotId} was still working after ${plainMinutes(capMs)} and was stopped at the limit for one hand-off ${progress}`
                : `${work.toBotId} showed no sign of life for ${plainMinutes(deadlineMs)} ${progress}`;
            },
          );
          /*
           * Only once the run is on record, and only when it said something: a conversation lifted to
           * the top of somebody's list for a turn that failed, or said nothing, is a conversation
           * they open to find nothing new.
           */
          if (announce && said.length > 0) {
            await announce({
              actorId: work.actorId,
              threadId: where.threadId,
              agentId: work.toBotId,
              text: said.join("\n\n"),
            }).catch(() => {
              // The turn happened. A roster that has not caught up is worth less than a hop reported
              // as failed and run a second time.
            });
          }
        } finally {
          heartbeat.stop();
          /*
           * Given back whatever happened. Left held, the conversation is unusable by anybody until the
           * lock expires: the person cannot ask a follow-up and the next hop is refused, which turns
           * one failed delivery into a conversation that has stopped working.
           */
          /*
           * The conversation the lock was taken on, which is the one being answered in and NOT the one
           * that asked. Releasing the asking conversation's lock instead leaves this one held until it
           * lapses: the person cannot type in it and the next hop to the same Bot is refused, while a
           * lock somebody else may be holding on the asking side is dropped from under them.
           */
          await lock
            .release({ threadId: where.threadId, runId })
            .catch(() => {});
        }
      } finally {
        if (lightsAskingChannel) {
          workNotes.end(handoffNoteKey(work));
          await setBusy?.({
            threadId: work.threadId,
            runId: busyOwner,
            busy: false,
          }).catch(() => {});
        }
      }

      // D177: the files offered in this forward hop reach the person's conversation and the asker.
      if (offeredFiles && !work.answerIn && offered.length > 0) {
        const fileNote = await offeredFiles({ work, files: offered }).catch(
          () => null,
        );
        if (fileNote) said.unshift(fileNote);
      }

      /*
       * What came back, for the runner to relay. Null when the turn produced no words at all —
       * a run that only called tools — which the runner treats as nothing worth carrying back.
       */
      if (waiting > 0 && !work.answerIn) {
        const name = work.toName ?? work.toBotId;
        return {
          answer: [
            ...said,
            `${name} has not finished: it stopped on ${waiting === 1 ? "a card" : `${waiting} cards`} that only the person can decide. The card is in this conversation, under your hand-off line, and also in Tasks (Needs input). Nothing it was waiting on has been done. If the person allows it, ${name} carries on from there and its result comes back to you; if they refuse, you are told that too. Tell the person the card is waiting for their yes right here under your hand-off, and do not hand the same job over again while it is open.`,
          ].join("\n\n"),
        };
      }
      return { answer: said.length > 0 ? said.join("\n\n") : null };
    },
  };
}

/**
 * The conversation, as a person would read it, with the asking Bot's tool traffic left out.
 *
 * A THREAD'S STORED HISTORY IS NOT A VALID PROMPT ON ITS OWN. What the platform keeps is what a
 * person is shown: the messages, and the results of the tools that ran. It does not keep the
 * assistant message that made a tool call, so the result is stored as a `tool` message whose
 * `toolCallId` matches nothing in the thread. Sent to a model as-is that is a malformed request, and
 * a hop delivered it every time: the asking Bot's own call to hand the work on is always the last
 * thing to have run, so the poison was in the history of every conversation that had asked.
 *
 * It is the right message to leave out on its own terms, too. The addressed Bot is being brought
 * into a conversation, not into another Bot's workings: those calls name tools it does not have,
 * carry arguments it was never meant to read, and say nothing about what the person wants. What
 * carries across a hop is what was said.
 */
function conversationOnly(messages: readonly unknown[]): readonly unknown[] {
  return messages.filter((message) => {
    if (typeof message !== "object" || message === null) return false;
    const { role, content } = message as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return false;
    // An assistant message with nothing in it is a tool call and nothing else. Keeping it would put
    // back the half of the pair that has no counterpart, which is the failure being fixed.
    return textOf(content).length > 0;
  });
}

/**
 * How much of the asking conversation a backwards hop reads.
 *
 * Six messages is about three exchanges: enough for the relaying Bot to keep its footing in the
 * conversation it is speaking into, and small enough that the read never grows with the channel.
 */
const RELAY_CONTEXT_MESSAGES = 6;

/**
 * How often the conversation's lock is refreshed while a Bot is working.
 *
 * Comfortably inside the platform's window, because a renewal that lands after it has lapsed is not
 * a renewal: the conversation is already free and something else may be in it.
 */
const LOCK_RENEW_EVERY_MS = 30_000;

/**
 * D170: a hop is stopped for SILENCE, not for wall-clock time. Both limits live here.
 *
 * Built work (a game, a site, a design) takes longer than any fixed wall-clock bound that is also
 * short enough to catch a hang: a member busy for ten minutes was killed at five, retried, and
 * killed again five times. So a hop runs for as long as events keep coming (tool calls, results,
 * text) and is stopped only after `HOP_SILENCE_MS` with none. `HOP_CAP_MS` is the absolute limit so
 * nothing runs for ever. It is below the engine's own turn limit (`SEGMENT_TIMEOUT_SECONDS`, 1800 s,
 * in agent-freeduet's segment.py) on purpose: the hop must end the run, not find it already killed.
 * The work-status card's "stuck" state (D168, 5 minutes) is a display and comes earlier than both.
 */
export const HOP_SILENCE_MS = 10 * 60_000;
export const HOP_CAP_MS = 25 * 60_000;

/** A hop that hit `HOP_CAP_MS`. Not retried: the same job would run into the same limit. */
export class HopCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HopCapError";
  }
}

function plainMinutes(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} seconds`;
  const minutes = Math.round(ms / 60_000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Wait for the run to be over, and fail if it failed.
 *
 * A RUN_ERROR has to reject, or the hop is finished and never retried while nothing was ever said in
 * the conversation. The stream completing without one is a turn that happened, whatever the Bot
 * decided to say: "I could not find that" is an answer, and asking again would spend another model
 * call on the same non-answer.
 */
function settled(
  events: Observable<BaseEvent>,
  limits: { silenceMs: number; capMs: number; life: { at: number } },
  /**
   * Aborts when the person pauses the Bot or the conversation's lock is lost; the run is stopped and
   * the hop fails with the reason.
   */
  paused: AbortSignal,
  stop: () => void,
  /** Written when a limit passes, so it can say which one and how far the run had got by then. */
  timedOut: (why: "silence" | "cap") => string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let failure: Error | undefined;
    let done = false;
    /*
     * Declared before the subscription rather than closed over it, because an observable is entitled
     * to finish inside `subscribe` itself: a stream that is already complete calls back before the
     * call that started it has returned, and a `const subscription` would not exist yet.
     */
    let subscription: { unsubscribe: () => void } | undefined;
    /*
     * Unsubscribed on the way out, not merely abandoned. The subscription is what holds the run's
     * socket open, so a delivery that walked away from a stalled one would leak a connection per
     * attempt and go on paying for a run nobody is reading.
     */
    const onPause = () => {
      stop();
      finish(() => reject(paused.reason));
    };
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      paused.removeEventListener("abort", onPause);
      subscription?.unsubscribe();
      settle();
    };
    /*
     * D170: checked again at whichever limit is nearer, counted from the run's last event, so a run
     * that keeps working keeps the wait from ending and a silent one ends it on time.
     */
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const now = Date.now();
      const capLeft = startedAt + limits.capMs - now;
      if (capLeft <= 0) {
        stop();
        finish(() => reject(new HopCapError(timedOut("cap"))));
        return;
      }
      const silentLeft = limits.life.at + limits.silenceMs - now;
      if (silentLeft <= 0) {
        stop();
        finish(() => reject(new Error(timedOut("silence"))));
        return;
      }
      timer = setTimeout(check, Math.min(capLeft, silentLeft));
    };
    timer = setTimeout(check, Math.min(limits.capMs, limits.silenceMs));
    if (paused.aborted) {
      onPause();
      return;
    }
    paused.addEventListener("abort", onPause, { once: true });
    subscription = events.subscribe({
      next: (event) => {
        limits.life.at = Date.now();
        // Compared as a string rather than through the enum: `@ag-ui/client` re-exports the types
        // this file needs and not that value, and adding a second AG-UI package for one constant
        // would be a dependency to keep in step for no gain.
        if (event.type === "RUN_ERROR") {
          failure = new Error(
            (event as { message?: string }).message ??
              "the run ended in an error",
          );
        }
      },
      error: (error: unknown) =>
        finish(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        ),
      complete: () => finish(() => (failure ? reject(failure) : resolve())),
    });
    // The stream that finished inside `subscribe`: `finish` had nothing to unsubscribe from at the
    // time, and the subscription it could not reach is this one.
    if (done) subscription.unsubscribe();
  });
}
