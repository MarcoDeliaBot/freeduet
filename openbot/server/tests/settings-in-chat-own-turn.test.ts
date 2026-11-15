/**
 * A setting is changed only in a conversation with the person (docs/design/settings-in-chat.md, 8.9),
 * the pure decision: which runs are the person's own turn, and which are not.
 *
 * No database here. The same decision is proved through the real plugin store, the real approval
 * service and the real hand-off chain in `settings-in-chat-never-unattended.integration.test.ts`.
 *
 * What these pin:
 *   - only a run that began with the person's own message is the person's, and only a hand-off that
 *     the signed run shows is the RELAY of such a turn, in the conversation that asked;
 *   - every other kind of initiator, every hand-off the server cannot trace and every call made outside a
 *     run that can wait is refused, and a kind added to the union later is refused until someone decides.
 */
import { describe, expect, test } from "bun:test";
import {
  mintRunAssertion,
  type RunAssertion,
} from "../src/agents/callback-token";
import { signHandoffDeliveryRun } from "../src/agents/handoff-signing";
import type { HandoffWork } from "../src/agents/handoff-runner";
import {
  type AuditInitiator,
  auditInitiatorKinds,
  handoffInitiator,
} from "../src/audit";
import {
  checkInInitiator,
  proactiveInitiator,
} from "../src/proactive/restriction";
import {
  NOT_IN_A_CONVERSATION,
  type OwnTurnFacts,
  ownTurn,
  settingChangeRefusal,
} from "../src/settings-in-chat/own-turn";

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const PERSON: AuditInitiator = { kind: "person" };
const ROUTINE: AuditInitiator = { kind: "routine", id: "routine-1" };

const ASKER = "iris";
const TARGET = "otto";
const ACTOR = "person-1";
/** The conversation the person is in, which asked for the hop. */
const ASKING = "thread-asking";
const SCRATCH = "thread-scratch";

/** A hop's run as the deployment signs it: the addressed Bot, the asking conversation, one hop deep. */
function hopAssertion(overrides: Partial<RunAssertion> = {}): RunAssertion {
  return {
    botId: TARGET,
    actorId: ACTOR,
    runId: "run-hop",
    threadId: ASKING,
    depth: 1,
    initiator: PERSON,
    handoff: { key: "hop:1", owner: "replica" },
    ...overrides,
  };
}

/** The facts of a call made in the person's own live turn. */
const live = (overrides: Partial<OwnTurnFacts> = {}): OwnTurnFacts => ({
  inRun: true,
  runInitiator: undefined,
  callInitiator: PERSON,
  runThreadId: ASKING,
  assertion: null,
  botId: ASKER,
  actorId: ACTOR,
  ...overrides,
});

/** The facts of a call made in a hop's run: the Bot that was asked (forward) or the one that asked (relay). */
const hop = (
  where: string,
  overrides: Partial<OwnTurnFacts> = {},
): OwnTurnFacts => ({
  inRun: true,
  runInitiator: handoffInitiator(ASKER, PERSON),
  callInitiator: handoffInitiator(ASKER, PERSON),
  runThreadId: where,
  assertion: hopAssertion(),
  botId: TARGET,
  actorId: ACTOR,
  ...overrides,
});

describe("the person's own turn", () => {
  test("a turn started from the app carries no initiator, and the call carries the person's", () => {
    expect(ownTurn(live())).toEqual({ ok: true, leg: "live" });
  });

  test("a turn that carries the person's initiator on both is the same", () => {
    expect(
      ownTurn(live({ runInitiator: PERSON, callInitiator: PERSON })),
    ).toEqual({ ok: true, leg: "live" });
  });

  test("a call that names no initiator at all is the person's, as the in-process door omits it", () => {
    expect(ownTurn(live({ callInitiator: undefined }))).toEqual({
      ok: true,
      leg: "live",
    });
  });
});

describe("a call made where nobody can be asked", () => {
  test("with no run that can wait, even the person's own initiator is refused", () => {
    for (const initiator of [undefined, PERSON])
      expect(
        ownTurn(
          live({
            inRun: false,
            runInitiator: undefined,
            callInitiator: initiator,
          }),
        ),
      ).toEqual({ ok: false, why: "no_conversation" });
  });
});

describe("a run nobody is attending", () => {
  const unattended: [string, AuditInitiator][] = [
    ["a routine", ROUTINE],
    ["an event trigger", { kind: "responsibility", id: "goal-1" }],
    ["a check-in", checkInInitiator("run-1")],
    ["background research", proactiveInitiator("run-1")],
    ["a memory run", { kind: "memory", id: "sync-1" }],
    ["the deployment", { kind: "deployment" }],
  ];

  for (const [name, initiator] of unattended) {
    test(`${name} is refused, whichever carrier says so`, () => {
      const refused = { ok: false, why: "not_the_persons_run" } as const;
      expect(
        ownTurn(live({ runInitiator: initiator, callInitiator: initiator })),
      ).toEqual(refused);
      // The callback door: the signed run's initiator, and no run initiator.
      expect(ownTurn(live({ callInitiator: initiator }))).toEqual(refused);
      // One carrier saying "routine" is enough, even when the other says the person.
      expect(
        ownTurn(live({ runInitiator: initiator, callInitiator: PERSON })),
      ).toEqual(refused);
    });
  }

  test("a kind this build does not know is not the person's", () => {
    const future = { kind: "scheduler", id: "x" } as unknown as AuditInitiator;
    expect(
      ownTurn(live({ runInitiator: future, callInitiator: future })),
    ).toEqual({ ok: false, why: "not_the_persons_run" });
  });

  test("every kind of initiator is decided: only the person's own turn passes, with nothing else to go on", () => {
    // Built from the union's own list, so a kind added later is refused here until it is decided.
    const sample = (kind: (typeof auditInitiatorKinds)[number]) =>
      (kind === "person" || kind === "deployment"
        ? { kind }
        : kind === "handoff"
          ? { kind, id: ASKER, origin: PERSON }
          : { kind, id: "x" }) as AuditInitiator;
    for (const kind of auditInitiatorKinds) {
      const initiator = sample(kind);
      const verdict = ownTurn(
        live({ runInitiator: initiator, callInitiator: initiator }),
      );
      if (kind === "person") expect(verdict).toEqual({ ok: true, leg: "live" });
      // A hand-off has the signed run to prove, and here there is none.
      else if (kind === "handoff")
        expect(verdict).toEqual({ ok: false, why: "untraced_hop" });
      else expect(verdict).toEqual({ ok: false, why: "not_the_persons_run" });
    }
  });
});

describe("a hand-off", () => {
  test("the RELAY of a hop made from the person's own turn is the person's, in the conversation that asked", () => {
    expect(
      ownTurn(
        hop(ASKING, {
          botId: ASKER,
          assertion: hopAssertion({ botId: ASKER }),
        }),
      ),
    ).toEqual({
      ok: true,
      leg: "relay",
    });
  });

  test("the FORWARD hop runs in a conversation of its own, which the person is not shown", () => {
    expect(ownTurn(hop(SCRATCH))).toEqual({ ok: false, why: "forward_hop" });
  });

  test("a hop made from a routine, a trigger or anything but the person is refused, in either leg", () => {
    for (const root of [
      ROUTINE,
      { kind: "responsibility", id: "goal-1" } as AuditInitiator,
      checkInInitiator("run-1"),
      { kind: "memory", id: "sync-1" } as AuditInitiator,
      { kind: "deployment" } as AuditInitiator,
    ])
      for (const where of [ASKING, SCRATCH]) {
        const chain = handoffInitiator(ASKER, root);
        expect(
          ownTurn(
            hop(where, {
              runInitiator: chain,
              callInitiator: chain,
              assertion: hopAssertion({ initiator: root }),
            }),
          ),
        ).toEqual({ ok: false, why: "not_the_persons_run" });
      }
  });

  test("a hop that names no root, or a root that is itself a hop, is not traced to the person", () => {
    for (const chain of [
      { kind: "handoff", id: ASKER } as AuditInitiator,
      {
        kind: "handoff",
        id: ASKER,
        origin: { kind: "handoff", id: "x", origin: PERSON },
      } as AuditInitiator,
    ])
      expect(
        ownTurn(hop(ASKING, { runInitiator: chain, callInitiator: chain })),
      ).toEqual({ ok: false, why: "not_the_persons_run" });
  });

  test("the relay is established only by the signed run, and every doubt refuses", () => {
    const cases: [string, Partial<OwnTurnFacts>][] = [
      ["no signed run", { assertion: null }],
      [
        "a run that is not a delivery",
        { assertion: hopAssertion({ handoff: undefined as never }) },
      ],
      ["another Bot's run", { assertion: hopAssertion({ botId: "someone" }) }],
      [
        "another person's run",
        { assertion: hopAssertion({ actorId: "someone-else" }) },
      ],
      [
        "a run that names no conversation",
        { assertion: hopAssertion({ threadId: "" }) },
      ],
      ["a call that knows no conversation", { runThreadId: undefined }],
      ["a hop two deep", { assertion: hopAssertion({ depth: 2 }) }],
      ["a hop no deep", { assertion: hopAssertion({ depth: 0 }) }],
      [
        "an asking run that was not the person's",
        { assertion: hopAssertion({ initiator: ROUTINE }) },
      ],
    ];
    for (const [name, overrides] of cases) {
      const verdict = ownTurn(
        hop(ASKING, {
          botId: ASKER,
          assertion: hopAssertion({ botId: ASKER }),
          ...overrides,
        }),
      );
      expect({ name, ok: verdict.ok }).toEqual({ name, ok: false });
    }
  });

  test("a hop is no leg when the two carriers disagree about it", () => {
    expect(
      ownTurn(
        hop(ASKING, {
          callInitiator: PERSON,
          botId: ASKER,
          assertion: hopAssertion({ botId: ASKER }),
        }),
      ),
    ).toEqual({ ok: false, why: "untraced_hop" });
    expect(
      ownTurn(
        hop(ASKING, {
          runInitiator: undefined,
          botId: ASKER,
          assertion: hopAssertion({ botId: ASKER }),
        }),
      ),
    ).toEqual({ ok: false, why: "untraced_hop" });
  });

  test("a delivery is never the person's own turn, even when both carriers say the person", () => {
    // A delivery always carries the hop's initiator. One whose carriers say otherwise is mislabelled, and
    // the signed run, which says it is a delivery, decides.
    expect(
      ownTurn(live({ assertion: hopAssertion({ botId: ASKER }) })),
    ).toEqual({ ok: false, why: "untraced_hop" });
  });

  test("a signed run that is not a delivery changes nothing for the person's own turn", () => {
    expect(
      ownTurn(
        live({ assertion: hopAssertion({ handoff: undefined as never }) }),
      ),
    ).toEqual({ ok: true, leg: "live" });
  });
});

describe("the refusal the plugin store gives", () => {
  const context = (
    run: RunAssertion | null,
    overrides: {
      initiator?: AuditInitiator;
      threadId?: string;
      forwardedProps?: unknown;
    } = {},
  ) => ({
    threadId: ASKING,
    forwardedProps: run ? { openbotRun: mintRunAssertion(run, KEY) } : {},
    ...overrides,
  });
  const ask = (
    ctx: ReturnType<typeof context> | undefined,
    callInitiator: AuditInitiator | undefined,
    botId = ASKER,
  ) =>
    settingChangeRefusal({
      context: ctx,
      callInitiator,
      botId,
      actorId: ACTOR,
      encryptionKey: KEY,
    });

  test("the person's own turn goes on to the gate, which still asks", () => {
    expect(ask(context(null), PERSON)).toBeNull();
    expect(ask(context(null, { initiator: PERSON }), PERSON)).toBeNull();
  });

  test("a refused call gets the one plain sentence, and the reason for the trail", () => {
    expect(ask(context(null, { initiator: ROUTINE }), ROUTINE)).toEqual({
      why: "not_the_persons_run",
      message: NOT_IN_A_CONVERSATION,
    });
    expect(ask(undefined, PERSON)).toEqual({
      why: "no_conversation",
      message: NOT_IN_A_CONVERSATION,
    });
    expect(NOT_IN_A_CONVERSATION).toBe(
      "Settings can only be changed in a conversation with you. Ask me again there.",
    );
  });

  test("the relay is read from the run assertion the deployment signed, in the form the approval holds it", () => {
    const chain = handoffInitiator(TARGET, PERSON);
    const relay = hopAssertion({ botId: ASKER });
    expect(ask(context(relay, { initiator: chain }), chain, ASKER)).toBeNull();
    // Another conversation than the one that asked: the forward hop.
    expect(
      ask(
        context(relay, { initiator: chain, threadId: SCRATCH }),
        chain,
        ASKER,
      ),
    ).toEqual({ why: "forward_hop", message: NOT_IN_A_CONVERSATION });
  });

  test("an approval answered long after the run's ten minutes still reads the run", () => {
    const chain = handoffInitiator(TARGET, PERSON);
    const old = mintRunAssertion(
      hopAssertion({ botId: ASKER }),
      KEY,
      Date.now() - 6 * 60 * 60 * 1000,
    );
    expect(
      ask(
        {
          threadId: ASKING,
          initiator: chain,
          forwardedProps: { openbotRun: old },
        },
        chain,
      ),
    ).toBeNull();
  });

  test("a run assertion signed with another key, or not signed, establishes nothing", () => {
    const chain = handoffInitiator(TARGET, PERSON);
    const forged = mintRunAssertion(
      hopAssertion({ botId: ASKER }),
      "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    );
    for (const openbotRun of [forged, "not-a-token", "", 7, null, {}])
      expect(
        ask(
          {
            threadId: ASKING,
            initiator: chain,
            forwardedProps: { openbotRun },
          },
          chain,
        ),
      ).toEqual({ why: "untraced_hop", message: NOT_IN_A_CONVERSATION });
    for (const forwardedProps of [null, "x", 7, [], undefined])
      expect(
        ask({ threadId: ASKING, initiator: chain, forwardedProps }, chain),
      ).toEqual({ why: "untraced_hop", message: NOT_IN_A_CONVERSATION });
  });

  test("the signed run is the one the deployment's own delivery signs, forward hop and relay", () => {
    // Signed by the function the hand-off wiring uses, from work shaped as the desk and the relay write it.
    const forward: HandoffWork = {
      fromBotId: ASKER,
      toBotId: TARGET,
      actorId: ACTOR,
      threadId: ASKING,
      runId: "run-asking",
      depth: 1,
      initiator: PERSON,
      task: "find it",
    };
    const relay: HandoffWork = {
      ...forward,
      fromBotId: TARGET,
      toBotId: ASKER,
      answerIn: ASKING,
    };
    const claim = { key: "hop:1", owner: "replica" };
    const forwardRun = signHandoffDeliveryRun(forward, KEY, "run-f", claim);
    const relayRun = signHandoffDeliveryRun(relay, KEY, "run-r", claim);

    // The forward hop's agent is built for the addressed Bot, and runs in a scratch conversation.
    const forwardChain = handoffInitiator(forward.fromBotId, forward.initiator);
    expect(
      ask(
        {
          threadId: SCRATCH,
          initiator: forwardChain,
          forwardedProps: { openbotRun: forwardRun },
        },
        forwardChain,
        TARGET,
      ),
    ).toEqual({ why: "forward_hop", message: NOT_IN_A_CONVERSATION });
    // The relay's agent is built for the asking Bot, and runs in the conversation that asked.
    const relayChain = handoffInitiator(relay.fromBotId, relay.initiator);
    expect(
      ask(
        {
          threadId: ASKING,
          initiator: relayChain,
          forwardedProps: { openbotRun: relayRun },
        },
        relayChain,
        ASKER,
      ),
    ).toBeNull();
  });
});
