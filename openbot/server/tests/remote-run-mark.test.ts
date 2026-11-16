/**
 * FreeDuet (docs/design/phone-and-remote.md 3.5.5, decision H): a run started from a REMOTE session, a
 * signed-in browser that is not paired with the computer, carries a mark the server sets, and none of the
 * shortcuts that let the person's own live turn act without a card applies to it.
 *
 * What this file holds, with no database:
 *
 *  1. WHERE THE MARK IS SET. `createRequestAgents` asks, of the very request it was given, whether it is a
 *     remote session, and builds the Bots with an initiator of `remote` if so. A request that is not remote
 *     (a paired browser, no sign-in, no secret) is built exactly as it was before: one argument, no
 *     context. A question that cannot be answered counts as remote.
 *  2. THAT IT TRAVELS. Through the real resolver and the real tool middleware: the approval context a tool
 *     runs in, and the signed run the Bot hands back, both say `remote`; and nothing the browser sends in
 *     `forwardedProps` changes either.
 *  3. THAT IT SURVIVES EVERY READER. The signed run, a hand-off's root and the saved question each read an
 *     initiator back, and one that reads a kind it does not know as a person would hand a stolen phone the
 *     person's own turn.
 *  4. THAT THE SHORTCUTS DO NOT READ IT AS THE PERSON: the typed-recipient rules (D27, D27a) and the
 *     rule that asks a card (`freeduet/always-ask.ts`).
 *  5. THE QUESTION ITSELF (`remoteRunQuestion`): the pairing cookie and nothing else, so a session that
 *     ended between the identification and the question cannot make the run the person's own.
 *
 * The gate itself, with a real database and Full access, is `remote-run-mark.integration.test.ts`.
 */
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { EventType, HttpAgent, type RunAgentInput } from "@ag-ui/client";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { of } from "rxjs";
import { z } from "zod";
import {
  type ActorAgentResolver,
  createActorAgentResolver,
} from "../src/agents/agent-resolver";
import {
  mintRunAssertion,
  readOrigin,
  readRunAssertion,
} from "../src/agents/callback-token";
import { delegatedWork } from "../src/agents/handoff-tool";
import { currentApprovalContext } from "../src/approvals/types";
import {
  type AuditInitiator,
  handoffInitiator,
  PERSON_INITIATOR,
  REMOTE_INITIATOR,
} from "../src/audit";
import { pairCookieName } from "../src/auth/browser-pairings";
import { signInGate } from "../src/auth/install-secret";
import { isRemoteSession, remoteRunQuestion } from "../src/auth/remote-limits";
import { createRequestAgents } from "../src/copilot";
import {
  alwaysAskReason,
  REMOTE_WRITE_REASON,
  startedRemote,
} from "../src/freeduet/always-ask";
import {
  recipientsTypedByPerson,
  recipientsTypedInHandedRequest,
} from "../src/plugins/typed-recipients";

import {
  legacyCookie,
  pairedCookie,
  SECRET,
  seedPairings,
  signInConfig,
} from "./support/signin-app";

const ACTOR = { id: "user-7", role: "user" as const };
const REMOTE: AuditInitiator = { kind: "remote" };
const KEY = "k".repeat(32);

/** A resolver that records what it was asked and builds nothing. */
function recordingResolver() {
  const resolveAgentsForActor = mock(
    async (
      ..._args: Parameters<ActorAgentResolver["resolveAgentsForActor"]>
    ) => ({}),
  );
  const resolver: ActorAgentResolver = {
    resolveAgentsForActor,
    resolveAgentForActor: async () => {
      throw new Error("not used");
    },
  };
  return { resolver, calls: resolveAgentsForActor.mock.calls };
}

describe("where the mark is set", () => {
  test("a request from a remote session builds the Bots with a run marked remote", async () => {
    const { resolver, calls } = recordingResolver();
    const asked: Request[] = [];
    const factory = createRequestAgents(
      async () => ACTOR,
      resolver,
      async (request) => {
        asked.push(request);
        return true;
      },
    );
    const request = new Request("http://openbot.test/api/copilotkit");
    await factory({ request });
    expect(asked).toEqual([request]);
    expect(calls).toEqual([[ACTOR, { initiator: { kind: "remote" } }]]);
  });

  test("a request that is not remote is built exactly as it was: one argument, no context", async () => {
    for (const remoteSession of [async () => false, undefined]) {
      const { resolver, calls } = recordingResolver();
      const factory = createRequestAgents(
        async () => ACTOR,
        resolver,
        remoteSession,
      );
      await factory({
        request: new Request("http://openbot.test/api/copilotkit"),
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual([ACTOR]);
      expect(calls[0]).toHaveLength(1);
    }
  });

  test("a question that cannot be answered counts as remote, so a fault refuses and never lifts", async () => {
    const { resolver, calls } = recordingResolver();
    const factory = createRequestAgents(
      async () => ACTOR,
      resolver,
      async () => {
        throw new Error("the session lookup failed");
      },
    );
    await factory({ request: new Request("http://openbot.test/x") });
    expect(calls).toEqual([[ACTOR, { initiator: { kind: "remote" } }]]);
  });

  test("the mark is the server's: nothing in the request's own body or headers is read for it", async () => {
    const { resolver, calls } = recordingResolver();
    const factory = createRequestAgents(
      async () => ACTOR,
      resolver,
      async () => true,
    );
    // A browser that says it is the person, in every place it can say anything.
    await factory({
      request: new Request("http://openbot.test/api/copilotkit/agent/a/run", {
        method: "POST",
        headers: {
          "x-openbot-initiator": "person",
          "x-forwarded-for": "127.0.0.1",
          cookie: "freeduet_install_3101=not-the-secret",
        },
        body: JSON.stringify({
          forwardedProps: {
            initiator: { kind: "person" },
            openbotInitiator: { kind: "person" },
          },
        }),
      }),
    });
    expect(calls).toEqual([[ACTOR, { initiator: { kind: "remote" } }]]);
  });
});

describe("that it travels, through the real resolver and the real tool middleware", () => {
  afterEach(() => mock.restore());

  /** What the resolver's collaborators were asked, and what one tool call met. */
  async function runOneToolCall(options: {
    remote: boolean;
    clientForwardedProps?: Record<string, unknown>;
  }) {
    const sent: RunAgentInput[] = [];
    spyOn(HttpAgent.prototype, "run").mockImplementation((input) => {
      sent.push(input);
      return of(
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "call-1",
          toolCallName: "mcp__vendor__write",
          parentMessageId: "m1",
        },
        { type: EventType.TOOL_CALL_ARGS, toolCallId: "call-1", delta: "{}" },
        { type: EventType.TOOL_CALL_END, toolCallId: "call-1" },
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        },
      );
    });
    const seen: {
      toolsInitiator: unknown[];
      signedInitiator: unknown[];
      context: ReturnType<typeof currentApprovalContext>;
    } = { toolsInitiator: [], signedInitiator: [], context: undefined };
    const resolver = createActorAgentResolver({
      loadAgents: async () => [
        {
          id: "member",
          name: "Member",
          type: "remote_ag_ui",
          endpoint: "https://member.test/ag-ui",
          standingMessage: {
            id: "standing-role:member",
            role: "system",
            content: "Member",
          },
        },
      ],
      model: { provider: "openai", defaultModel: "test" },
      resolveModelApiKey: async () => null,
      loadToolsForActor: (_actorId, initiator) => async () => {
        seen.toolsInitiator.push(initiator);
        return [
          {
            name: "mcp__vendor__write",
            ref: "vendor/write",
            description: "Write",
            parameters: z.object({}),
            execute: async () => {
              seen.context = currentApprovalContext();
              throw new HeadlessToolSuspension("Approve", {
                kind: "approval",
                requestId: "request",
              });
            },
          },
        ];
      },
      signRunForActor: (_actorId, initiator) => () => {
        seen.signedInitiator.push(initiator);
        return `signed:${initiator?.kind ?? "none"}`;
      },
    });
    const factory = createRequestAgents(
      async () => ACTOR,
      resolver,
      async () => options.remote,
    );
    const agents = await factory({
      request: new Request("http://openbot.test/api/copilotkit"),
    });
    const agent = agents.member;
    if (!agent) throw new Error("no agent was built");
    agent.threadId = "thread-1";
    agent.messages = [{ id: "u1", role: "user", content: "Send it." }];
    await agent.runAgent({
      runId: "run-1",
      ...(options.clientForwardedProps
        ? { forwardedProps: options.clientForwardedProps }
        : {}),
    });
    return { seen, sent };
  }

  test("the tool's approval context and the signed run both say remote", async () => {
    const { seen, sent } = await runOneToolCall({ remote: true });
    expect(seen.toolsInitiator).toEqual([{ kind: "remote" }]);
    expect(seen.signedInitiator).toEqual([{ kind: "remote" }]);
    expect(seen.context?.initiator).toEqual({ kind: "remote" });
    expect(sent[0]?.forwardedProps.openbotRun).toBe("signed:remote");
  });

  test("control: a request that is not remote is the person's own turn, as it always was", async () => {
    const { seen, sent } = await runOneToolCall({ remote: false });
    expect(seen.toolsInitiator).toEqual([undefined]);
    expect(seen.signedInitiator).toEqual([undefined]);
    expect(seen.context).toBeDefined();
    expect(
      seen.context ? seen.context.initiator : "no context",
    ).toBeUndefined();
    expect(sent[0]?.forwardedProps.openbotRun).toBe("signed:none");
  });

  test("a browser that sends its own run, initiator or marks changes none of it", async () => {
    const { seen, sent } = await runOneToolCall({
      remote: true,
      clientForwardedProps: {
        openbotRun: "forged-by-the-browser",
        initiator: { kind: "person" },
        openbotInitiator: { kind: "person" },
        openbotRemote: false,
      },
    });
    expect(seen.context?.initiator).toEqual({ kind: "remote" });
    // The deployment's own signed statement replaces the browser's, and says remote.
    expect(sent[0]?.forwardedProps.openbotRun).toBe("signed:remote");
  });
});

describe("that it survives every reader of an initiator", () => {
  test("the signed run reads it back as remote, never as a person", () => {
    const signed = mintRunAssertion(
      {
        botId: "member",
        actorId: "user-7",
        runId: "run-1",
        threadId: "thread-1",
        initiator: REMOTE_INITIATOR,
      },
      KEY,
    );
    expect(readRunAssertion(signed, KEY)?.initiator).toEqual({
      kind: "remote",
    });
  });

  test("a hop made from a remote run keeps remote as its root, in the assertion and in the work item", () => {
    const hop = handoffInitiator("iris", REMOTE_INITIATOR);
    expect(hop).toEqual({
      kind: "handoff",
      id: "iris",
      origin: { kind: "remote" },
    });
    const signed = mintRunAssertion(
      {
        botId: "otto",
        actorId: "user-7",
        runId: "run-2",
        threadId: "thread-1",
        initiator: hop,
        depth: 1,
        handoff: { key: "k1", owner: "worker-1" },
      },
      KEY,
    );
    expect(readRunAssertion(signed, KEY)?.initiator).toEqual(hop);
    expect(readOrigin({ kind: "remote" })).toEqual({ kind: "remote" });
    const work = delegatedWork.safeParse({
      fromBotId: "iris",
      toBotId: "otto",
      actorId: "user-7",
      threadId: "thread-1",
      runId: "run-1",
      depth: 1,
      task: "Send the email.",
      initiator: hop,
    });
    expect(work.success).toBe(true);
    expect(work.data?.initiator as unknown).toEqual(hop);
  });

  test("a kind nobody knows is still read as a person, which is why remote had to be taught", () => {
    const signed = mintRunAssertion(
      {
        botId: "member",
        actorId: "user-7",
        runId: "run-1",
        threadId: "thread-1",
        initiator: { kind: "somebody-new" } as unknown as AuditInitiator,
      },
      KEY,
    );
    // The reading that made remote's own survival a requirement of this change.
    expect(readRunAssertion(signed, KEY)?.initiator).toEqual(PERSON_INITIATOR);
  });
});

describe("that the shortcuts do not read it as the person", () => {
  const typed = {
    to: ["ana@example.test"],
    messages: [
      { id: "m1", role: "user", content: "Email ana@example.test the notes." },
    ],
  };

  test("a recipient the person typed counts only in the person's own live turn (D27)", () => {
    // Control: the person's own turn has no initiator, and the typed address is enough.
    expect(
      recipientsTypedByPerson({
        ...typed,
        runInitiator: undefined,
        callInitiator: undefined,
      }),
    ).toBe(true);
    // The same words from a remote session are not.
    expect(
      recipientsTypedByPerson({
        ...typed,
        runInitiator: REMOTE,
        callInitiator: undefined,
      }),
    ).toBe(false);
    // Nor when the call itself carries the mark, as it does at the callback door.
    expect(
      recipientsTypedByPerson({
        ...typed,
        runInitiator: undefined,
        callInitiator: REMOTE,
      }),
    ).toBe(false);
  });

  test("a recipient typed in a request handed on counts only when its root is the person (D27a)", () => {
    const request = typed.messages[0] ?? null;
    const hop = (origin: AuditInitiator): AuditInitiator => ({
      kind: "handoff",
      id: "iris",
      origin,
    });
    expect(
      recipientsTypedInHandedRequest({
        to: typed.to,
        request,
        runInitiator: hop(PERSON_INITIATOR),
        callInitiator: undefined,
      }),
    ).toBe(true);
    expect(
      recipientsTypedInHandedRequest({
        to: typed.to,
        request,
        runInitiator: hop(REMOTE),
        callInitiator: undefined,
      }),
    ).toBe(false);
  });
});

describe("the rule that asks a card of a remote session's write", () => {
  const write = {
    effect: "write",
    toolRef: "mcp/mail/send_email",
    runInitiator: REMOTE as AuditInitiator | undefined,
    callInitiator: undefined as AuditInitiator | undefined,
    configuresAutomation: false,
    answeredByCard: false,
  };

  test("a write in a run that began remote, or in a hop made from one, asks", () => {
    expect(startedRemote(REMOTE)).toBe(true);
    expect(startedRemote(handoffInitiator("iris", REMOTE))).toBe(true);
    expect(
      startedRemote(handoffInitiator("otto", handoffInitiator("iris", REMOTE))),
    ).toBe(true);
    expect(alwaysAskReason(write)).toBe(REMOTE_WRITE_REASON);
    expect(
      alwaysAskReason({
        ...write,
        runInitiator: handoffInitiator("iris", REMOTE),
      }),
    ).toBe(REMOTE_WRITE_REASON);
    // At the callback door the call carries the signed run's initiator and there is no context.
    expect(
      alwaysAskReason({
        ...write,
        runInitiator: undefined,
        callInitiator: REMOTE,
      }),
    ).toBe(REMOTE_WRITE_REASON);
  });

  test("the person's own turn, and a hop from it, are not asked by this rule", () => {
    for (const initiator of [
      undefined,
      PERSON_INITIATOR,
      handoffInitiator("iris", PERSON_INITIATOR),
    ]) {
      expect(startedRemote(initiator)).toBe(false);
      expect(alwaysAskReason({ ...write, runInitiator: initiator })).toBe(
        undefined,
      );
    }
  });

  test("a read, a hand-off, and an email the person just allowed are not asked", () => {
    expect(alwaysAskReason({ ...write, effect: "read" })).toBe(undefined);
    expect(alwaysAskReason({ ...write, effect: "delegate" })).toBe(undefined);
    expect(alwaysAskReason({ ...write, answeredByCard: true })).toBe(undefined);
  });

  test("a member's own workspace and commands are asked in a run that began remote, and only there", () => {
    for (const toolRef of [
      "computer_write_file",
      "computer_run_command",
      "host/open_file",
    ]) {
      expect([toolRef, alwaysAskReason({ ...write, toolRef })]).toEqual([
        toolRef,
        REMOTE_WRITE_REASON,
      ]);
      expect(
        alwaysAskReason({
          ...write,
          toolRef,
          runInitiator: undefined,
          callInitiator: REMOTE,
        }),
      ).toBe(REMOTE_WRITE_REASON);
      // The person's own turn and a routine's run are held to no card for them, as they always were.
      for (const initiator of [
        undefined,
        PERSON_INITIATOR,
        { kind: "routine", id: "r1" } as AuditInitiator,
      ])
        expect(
          alwaysAskReason({ ...write, toolRef, runInitiator: initiator }),
        ).toBe(undefined);
    }
    // Reading the workspace is a read, and a read is never asked.
    expect(
      alwaysAskReason({
        ...write,
        toolRef: "computer_read_file",
        effect: "read",
      }),
    ).toBe(undefined);
  });

  test("a routine or a setting keeps its own sentence, which names what it is", () => {
    expect(alwaysAskReason({ ...write, configuresAutomation: true })).not.toBe(
      REMOTE_WRITE_REASON,
    );
    expect(alwaysAskReason({ ...write, configuresAutomation: true })).toContain(
      "Routines and triggers",
    );
  });
});

describe("the question the mark asks: the pairing of THIS person, and nothing else", () => {
  const config = signInConfig();
  const gate = signInGate(config, seedPairings(config).service) as NonNullable<
    ReturnType<typeof signInGate>
  >;
  const request = (cookie?: string) =>
    new Request("http://localhost:3001/api/copilotkit/agent/iris/run", {
      method: "POST",
      headers: cookie ? { cookie } : {},
    });

  test("a browser without a live pairing is remote, and one with it is not", async () => {
    const ask = remoteRunQuestion(gate);
    expect(await ask(request(), "u-admin")).toBe(true);
    expect(await ask(request("better-auth.session_token=abc"), "u-admin")).toBe(
      true,
    );
    expect(await ask(request(pairedCookie(config)), "u-admin")).toBe(false);
    expect(
      await ask(
        request(`other=1; ${pairedCookie(config)}; better-auth=abc`),
        "u-admin",
      ),
    ).toBe(false);
  });

  test("a token of another person, a wrong one, or another installation's is not the pairing", async () => {
    const ask = remoteRunQuestion(gate);
    for (const cookie of [
      pairedCookie(config, "user"),
      `${pairCookieName(config.port)}=${"t".repeat(43)}`,
      `${pairCookieName(config.port)}=`,
      pairedCookie(config).replace(`_${config.port}`, "_3002"),
      // The old cookie, the secret itself, is not a pairing.
      legacyCookie(config),
      `${SECRET}`,
    ])
      expect([cookie, await ask(request(cookie), "u-admin")]).toEqual([
        cookie,
        true,
      ]);
  });

  test("a session that ended between the identification and the question does not make the run the person's own", async () => {
    const unpaired = request("better-auth.session_token=revoked-a-moment-ago");
    const ended = { api: { getSession: async () => null } };
    // What the middleware's question says of it: nobody's, left to the route's own guard. Right for a
    // request that has not been identified; wrong for the one that was identified a moment ago.
    expect(await isRemoteSession(gate, ended as never, unpaired)).toBe(false);
    // What the run's mark says: the person was identified, the browser has no pairing of theirs, so the
    // run is remote, whatever the session store says now.
    expect(await remoteRunQuestion(gate)(unpaired, "u-admin")).toBe(true);
  });
});
