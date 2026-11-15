import { describe, expect, test } from "bun:test";
import type { Message } from "@ag-ui/client";
import type { ApprovalContinuation } from "@openbot/toolkit/continuation";
import type { RunAssertion } from "../src/agents/callback-token";
import { handedRequestOf } from "../src/agents/handoff-request";
import { taskExecutionId } from "../src/proactive/engine";
import {
  type ConversationMessage,
  recipientsTypedByPerson,
  recipientsTypedInHandedRequest,
} from "../src/plugins/typed-recipients";

/**
 * WORDS THAT CAME FROM THE MICROPHONE ARE NOT THE PERSON'S OWN WRITTEN REQUEST (docs/design/voice.md,
 * D7 and D8), at the two pure places the server decides what the person's own request is: the rule
 * that lets a new email go with no card because the person typed every recipient
 * (`recipientsTypedByPerson`, and the hand-off's copy of it), and the mark a hop is given when it is
 * made in the person's own turn (`handedRequestOf`).
 *
 * The app puts the prefix `voice-` on the id of a message that was dictated and sent with one press, or
 * written by the voice call's model on the person's behalf. The prefix is written out as a literal
 * here, as in the gate's own test: it is the contract with the app. The same rule is driven through
 * the real approval gate in `voice-message-gate.integration.test.ts`.
 *
 * A case that says "asks" is one where the function answers no, which is what makes the gate ask. A
 * case that says "guard" passes on the source before this change as well.
 */

const ASKED = "Send an email to ana@example.com saying good morning";

const typed = (content: unknown, id = "msg-typed-1"): ConversationMessage => ({
  id,
  role: "user",
  content,
});

/** The person's own live chat turn: no initiator on the run, the person's request last. */
function live(to: unknown, messages: readonly ConversationMessage[]): boolean {
  return recipientsTypedByPerson({
    to,
    messages,
    runInitiator: undefined,
    callInitiator: undefined,
  });
}

describe("recipientsTypedByPerson: the id of the person's latest message says where its words came from", () => {
  test("guard: a plain id, typed or sent with the Send button, names the recipient", () => {
    expect(live(["ana@example.com"], [typed(ASKED, "msg-1")])).toBe(true);
    expect(
      live(
        ["ana@example.com"],
        [typed(ASKED, "9f1c2d4e-0b7a-4c55-8a39-2e6d1f3b7a10")],
      ),
    ).toBe(true);
  });

  test("asks: the same words with the voice id, because nobody read them", () => {
    expect(live(["ana@example.com"], [typed(ASKED, "voice-1")])).toBe(false);
    expect(
      live(
        ["ana@example.com"],
        [typed(ASKED, "voice-9f1c2d4e-0b7a-4c55-8a39-2e6d1f3b7a10")],
      ),
    ).toBe(false);
  });

  test("asks: the latest message decides, so a dictated one after a typed one asks", () => {
    expect(
      live(
        ["ana@example.com"],
        [
          typed(ASKED, "msg-1"),
          { id: "msg-2", role: "assistant", content: "Writing to Ana now." },
          typed(ASKED, "voice-2"),
        ],
      ),
    ).toBe(false);
  });

  test("guard: and a typed one after a dictated one is the person writing again", () => {
    expect(
      live(
        ["ana@example.com"],
        [
          typed(ASKED, "voice-1"),
          { id: "msg-2", role: "assistant", content: "Writing to Ana now." },
          typed(ASKED, "msg-3"),
        ],
      ),
    ).toBe(true);
  });

  test("guard: the id of a Bot's message or a tool's changes nothing, only the person's counts", () => {
    expect(
      live(
        ["ana@example.com"],
        [
          typed(ASKED, "msg-1"),
          { id: "voice-3", role: "assistant", content: "On it." },
          { id: "voice-4", role: "tool", content: "ok" },
        ],
      ),
    ).toBe(true);
  });

  test("guard: it is a prefix, as the hand-off's is: the word anywhere else in an id is not a mark", () => {
    for (const id of [
      "a-voice-1",
      "Voice-1",
      "voice",
      "invoice-1",
      "msg-voice-",
    ])
      expect(live(["ana@example.com"], [typed(ASKED, id)])).toBe(true);
  });

  test("asks: a hand-off's envelope still asks, as before", () => {
    expect(live(["ana@example.com"], [typed(ASKED, "handoff-1")])).toBe(false);
  });
});

describe("recipientsTypedInHandedRequest: the person's message a hop was made from", () => {
  const hop = (request: ConversationMessage | null) =>
    recipientsTypedInHandedRequest({
      to: ["ana@example.com"],
      request,
      runInitiator: {
        kind: "handoff",
        id: "iris",
        origin: { kind: "person" },
      },
      callInitiator: {
        kind: "handoff",
        id: "iris",
        origin: { kind: "person" },
      },
    });

  test("guard: a typed message names the recipient", () => {
    expect(hop(typed(ASKED, "msg-1"))).toBe(true);
  });

  test("asks: a dictated message does not, even if a mark names it", () => {
    expect(hop(typed(ASKED, "voice-1"))).toBe(false);
  });
});

describe("handedRequestOf: a hop made from a message that came from the microphone carries no mark", () => {
  const THREAD = "thread-origin-1";
  const RUN = "run-origin-1";
  const from: RunAssertion = {
    botId: "iris",
    actorId: "user-ana-1",
    runId: RUN,
    threadId: THREAD,
    depth: 0,
    initiator: { kind: "person" },
  };
  const turn = (messages: Message[]): ApprovalContinuation => ({
    runId: RUN,
    threadId: THREAD,
    toolCallId: "call-1",
    toolName: "message_bot",
    args: {},
    messages,
    state: {},
    context: [],
    forwardedProps: {},
  });
  const said = (content: string, id: string): Message => ({
    id,
    role: "user",
    content,
  });

  test("guard: a typed message is marked, by id and by a hash of its text", () => {
    expect(handedRequestOf(from, turn([said(ASKED, "msg-1")]))).toMatchObject({
      by: "user-ana-1",
      threadId: THREAD,
      runId: RUN,
      messageId: "msg-1",
    });
  });

  test("asks: a dictated message is not marked, so whoever receives the hop is asked", () => {
    expect(handedRequestOf(from, turn([said(ASKED, "voice-1")]))).toBeNull();
  });

  test("asks: the latest message decides, so a dictated one after a typed one is not marked", () => {
    expect(
      handedRequestOf(
        from,
        turn([said(ASKED, "msg-1"), said("go on, send it", "voice-2")]),
      ),
    ).toBeNull();
  });

  test("guard: a typed one after a dictated one is marked, and it is that one", () => {
    expect(
      handedRequestOf(
        from,
        turn([said("hello there", "voice-1"), said(ASKED, "msg-2")]),
      ),
    ).toMatchObject({ messageId: "msg-2" });
  });
});

describe("taskExecutionId: the run of a task reply keeps the mark when it is tried again", () => {
  /*
   * The browser gives a reply a message id, and the first run of the reply is run under it, which is
   * how the server reads where the words came from. A run tried again (its replica died, or the
   * person pressed Try again) is run under an id of the server's own, so the mark has to be carried
   * over by hand or the retry would be taken for a typed reply.
   */
  const reply = { taskId: "task-1", workKey: "task:task-1:reply:m1" };

  test("guard: the first attempt runs under the id the browser gave, whatever it is", () => {
    expect(
      taskExecutionId({ ...reply, attempt: 1, messageId: "msg-1234abcd" }),
    ).toBe("msg-1234abcd");
    expect(
      taskExecutionId({ ...reply, attempt: 1, messageId: "voice-1234abcd" }),
    ).toBe("voice-1234abcd");
  });

  test("guard: a retry of a typed reply, and a task with no reply at all, are named as they were", () => {
    const retried = taskExecutionId({
      ...reply,
      attempt: 2,
      messageId: "msg-1234abcd",
    });
    expect(retried).toMatch(/^task-task-1-[0-9a-f]{16}$/);
    expect(
      taskExecutionId({ taskId: "task-1", workKey: "k", attempt: 1 }),
    ).toBe("task-task-1");
    expect(
      taskExecutionId({ taskId: "task-1", workKey: "k", attempt: 2 }),
    ).toMatch(/^task-task-1-[0-9a-f]{16}$/);
  });

  test("a retry of a dictated reply keeps the mark, and is the same id the typed one's retry would be after it", () => {
    const typedRetry = taskExecutionId({
      ...reply,
      attempt: 2,
      messageId: "msg-1234abcd",
    });
    const voiceRetry = taskExecutionId({
      ...reply,
      attempt: 2,
      messageId: "voice-1234abcd",
    });
    expect(voiceRetry).toBe(`voice-${typedRetry}`);
  });

  test("Try again with a dictated reply keeps the mark on its first attempt and on a retry of it", () => {
    expect(
      taskExecutionId({
        ...reply,
        attempt: 1,
        messageId: "voice-1234abcd",
        again: true,
      }),
    ).toBe("voice-1234abcd");
    expect(
      taskExecutionId({
        ...reply,
        attempt: 2,
        messageId: "voice-1234abcd",
        again: true,
      }),
    ).toMatch(/^voice-task-task-1-[0-9a-f]{16}$/);
  });
});
