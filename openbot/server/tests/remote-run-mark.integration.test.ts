/**
 * FreeDuet (docs/design/phone-and-remote.md 3.5.5, decision H), through the real approval gate, the real
 * Full access setting and a real database: a write made in a run that a REMOTE session started, a
 * signed-in browser that is not paired with the computer, asks a card whatever the person switched on.
 *
 * WHAT WAS FOUND BEFORE ANYTHING WAS CHANGED, and what each case that proves it is named for:
 *   (a) a chat run from a remote session reached the gate as "the person's own live turn" (no initiator),
 *       so a member with Full access, in either setting, wrote with no card on a stolen phone's words;
 *   (b) the same run satisfied the typed-recipient shortcut (D27), and a hop made from it could satisfy
 *       the hand-off one (D27a), so a new email to an address the phone typed went out with no card;
 *   (c) a rule the person saved at the computer, or the reviewer saying "proceed", answered it as well.
 * The control cases show each of those still true for the person's own turn, which is what a paired
 * browser is: nothing is limited there.
 *
 * "The vendor is not reached" is `went through`: the plugin store makes the call only when `gate` returns.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { remoteMayAnswer } from "../src/approvals/remote-answer";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import {
  type ApprovalCandidate,
  ApprovalRefusedError,
} from "../src/approvals/types";
import {
  type AuditInitiator,
  createAuditStore,
  handoffInitiator,
  PERSON_INITIATOR,
  REMOTE_INITIATOR,
} from "../src/audit";
import { createDatabase } from "../src/db/client";
import {
  approvalRules,
  approvalTeamRules,
  auditEvents,
  users,
} from "../src/db/schema";
import { workItems } from "../src/db/schema/work";
import { REMOTE_WRITE_REASON } from "../src/freeduet/always-ask";
import { createFullAccess } from "../src/freeduet/full-access";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `rm-${randomUUID()}`;
/** The person with the defaults: auto-review on, "ask before making changes" off. */
const owner = `${prefix}-owner`;
/** A person who switched both off, so nothing but the server's own rule can ask. */
const quiet = `${prefix}-quiet`;
const admin = `${prefix}-admin`;
const people = [owner, quiet, admin];
const FULL = `${prefix}-penny`;
const NO_PAYMENTS = `${prefix}-otto`;
const PLAIN = `${prefix}-jules`;
const store = createApprovalStore(database);
const audit = createAuditStore(database);
const teamRuleIds: string[] = [];

/** What the stand-in for the hand-off loader answers: the person's own message a hop was made from. */
let handedAnswer: unknown = null;
/** What the reviewer answers. */
let verdict: { verdict: string; safety: string } = {
  verdict: "proceed",
  safety: "none",
};
const fullAccess = createFullAccess({
  database,
  known: async () => true,
  handedRequest: async () => handedAnswer,
  audit,
});
const service = createApprovalService(store, undefined, undefined, {
  fullAccess,
  review: async () =>
    JSON.stringify({
      ...verdict,
      preApproved: true,
      reason: "Test reviewer.",
    }),
});

const REMOTE = REMOTE_INITIATOR;
const hop = (origin: AuditInitiator): AuditInitiator =>
  handoffInitiator(`${prefix}-iris`, origin);

beforeAll(async () => {
  await database
    .insert(users)
    .values(people.map((id) => ({ id, email: `${id}@example.test` })));
  await service.setPreferences(owner, { enabled: false, autoReview: true });
  await service.setPreferences(quiet, { enabled: false, autoReview: false });
  await fullAccess.set(owner, FULL, true);
  await fullAccess.set(owner, NO_PAYMENTS, true, "no_payments");
  await fullAccess.set(quiet, FULL, true);
});
afterEach(async () => {
  // A test that fails halfway leaves no rule, no setting and no answer behind for the next one.
  verdict = { verdict: "proceed", safety: "none" };
  handedAnswer = null;
  await database
    .update(approvalRules)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        inArray(approvalRules.ownerUserId, people),
        isNull(approvalRules.revokedAt),
      ),
    );
  if (teamRuleIds.length)
    await database
      .update(approvalTeamRules)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          inArray(approvalTeamRules.id, teamRuleIds),
          isNull(approvalTeamRules.revokedAt),
        ),
      );
  await service.setPreferences(owner, { enabled: false, autoReview: true });
});
afterAll(async () => {
  if (teamRuleIds.length)
    await database
      .delete(approvalTeamRules)
      .where(inArray(approvalTeamRules.id, teamRuleIds));
  await database
    .delete(approvalRules)
    .where(inArray(approvalRules.ownerUserId, people));
  await database.delete(workItems).where(
    and(
      eq(workItems.kind, "approval.resume"),
      inArray(
        workItems.key,
        (await Promise.all(people.map((person) => store.list(person)))).flatMap(
          (requests) => requests.map((request) => request.id),
        ),
      ),
    ),
  );
  // Audit rows are append-only by design and stay; they name only this run's throwaway ids.
  await database.delete(users).where(inArray(users.id, people));
  await database.$client.close();
});

/** A write on an account, in a run that can wait for the person. */
function candidate(
  over: Partial<ApprovalCandidate> = {},
  options: { initiator?: AuditInitiator; threadId?: string } = {},
): ApprovalCandidate {
  const toolCallId = randomUUID();
  return {
    actorId: owner,
    botId: PLAIN,
    toolRef: "mcp/crm/update_contact",
    effect: "write",
    scope: "crm",
    args: { id: "c1", note: "Called back" },
    continuation: {
      runId: randomUUID(),
      threadId: options.threadId ?? `${prefix}-thread-${toolCallId}`,
      toolCallId,
      toolName: "mcp/crm/update_contact",
      args: { id: "c1", note: "Called back" },
      messages: [],
      state: {},
      context: [],
      forwardedProps: { openbotRun: "signed-assertion" },
      ...(options.initiator ? { initiator: options.initiator } : {}),
    },
    ...over,
  };
}

const requestsFor = async (c: ApprovalCandidate) =>
  (await store.list(c.actorId)).filter(
    (row) => row.action.toolCallId === c.continuation?.toolCallId,
  );

/**
 * What the real gate did: "went through" when it returned (the vendor would be reached), otherwise the
 * behaviour and the source of the one card it opened. Any error but a pause is the test's own.
 */
async function outcomeOf(c: ApprovalCandidate): Promise<string> {
  const paused = await service.gate(c).then(
    () => false,
    (error: unknown) => {
      if (error instanceof HeadlessToolSuspension) return true;
      throw error;
    },
  );
  const requests = await requestsFor(c);
  if (!paused) return requests.length === 0 ? "went through" : "went+card";
  const [request] = requests;
  return requests.length === 1
    ? `${request?.action.policy?.behaviour}/${request?.action.policy?.source}`
    : `${requests.length} cards`;
}

const ALWAYS = "ask/always_ask";

describe("(a) Full access does not apply to a run a remote session started", () => {
  test("control: in the person's own live turn the same members are let through, in either setting", async () => {
    for (const botId of [FULL, NO_PAYMENTS])
      expect(await outcomeOf(candidate({ botId }))).toBe("went through");
    // The person's own turn may also name itself: an explicit `person` is the same turn.
    for (const botId of [FULL, NO_PAYMENTS])
      expect(
        await outcomeOf(candidate({ botId }, { initiator: PERSON_INITIATOR })),
      ).toBe("went through");
  });

  test("a write in a remote session's run asks, with Full access on for the member in either setting", async () => {
    for (const botId of [FULL, NO_PAYMENTS, PLAIN])
      expect(await outcomeOf(candidate({ botId }, { initiator: REMOTE }))).toBe(
        ALWAYS,
      );
  });

  test("and for a person who switched auto-review and 'ask before making changes' off, so nothing else could ask", async () => {
    const write = candidate(
      { actorId: quiet, botId: FULL },
      { initiator: REMOTE },
    );
    expect(await outcomeOf(write)).toBe(ALWAYS);
    const [asked] = await requestsFor(write);
    expect(asked?.action.policy?.reason).toBe(REMOTE_WRITE_REASON);
  });

  test("the card says why, in words the person reads on a phone", async () => {
    const write = candidate({}, { initiator: REMOTE });
    await outcomeOf(write);
    const [asked] = await requestsFor(write);
    expect(asked?.action.policy?.reason).toContain("not paired");
    expect(asked?.action.policy?.reason).toContain("always asks you first");
  });

  test("the connector's own send check reads the same answer: Full access does not apply to a remote run, or to a hop from one", async () => {
    const apply = (initiator: AuditInitiator | undefined) =>
      fullAccess.applies({
        actorId: owner,
        botId: FULL,
        continuation: candidate({}, initiator ? { initiator } : {})
          .continuation,
      });
    expect(await apply(undefined)).toBe(true);
    expect(await apply(PERSON_INITIATOR)).toBe(true);
    expect(await apply(REMOTE)).toBe(false);
    // Even where the hand-off loader were to answer with a record, a hop made from a remote run is not
    // the person's request: the root is what counts.
    handedAnswer = {
      id: "m1",
      role: "user",
      content: "Email ana@example.test.",
    };
    expect(await apply(hop(PERSON_INITIATOR))).toBe(true);
    expect(await apply(hop(REMOTE))).toBe(false);
  });
});

describe("(b) a hop made from a remote run asks, whatever the hand-off shortcut would have said", () => {
  test("with the person's own message loaded for the hop, the hop from the person goes through and the hop from a remote run asks", async () => {
    handedAnswer = {
      id: "m1",
      role: "user",
      content: "Ask Otto to email ana@example.test the notes.",
    };
    // Control: D27a as it is for the person's own turn.
    expect(
      await outcomeOf(
        candidate({ botId: FULL }, { initiator: hop(PERSON_INITIATOR) }),
      ),
    ).toBe("went through");
    // A remote session's.
    expect(
      await outcomeOf(candidate({ botId: FULL }, { initiator: hop(REMOTE) })),
    ).toBe(ALWAYS);
    expect(
      await outcomeOf(
        candidate({ botId: NO_PAYMENTS }, { initiator: hop(REMOTE) }),
      ),
    ).toBe(ALWAYS);
  });

  test("a hop of a hop keeps the root", async () => {
    expect(
      await outcomeOf(
        candidate(
          {},
          { initiator: handoffInitiator(`${prefix}-otto`, hop(REMOTE)) },
        ),
      ),
    ).toBe(ALWAYS);
  });
});

describe("(c) nothing the person saved at the computer answers it", () => {
  test("a rule that allows, or one that only pre-approves, and the reviewer's 'proceed'", async () => {
    const allow = await service.createRule(owner, {
      botId: "*",
      toolRef: "mcp/crm/*",
      effect: "*",
      scope: "*",
      behaviour: "allow",
    });
    const preApproved = await service.createRule(owner, {
      botId: "*",
      toolRef: "mcp/crm/*",
      effect: "*",
      scope: "*",
      behaviour: "pre_approved",
    });
    // Control: in the person's own turn the rules do their job.
    expect(await outcomeOf(candidate())).toBe("went through");
    expect(await outcomeOf(candidate({}, { initiator: REMOTE }))).toBe(ALWAYS);
    await service.revoke(owner, allow.id);
    await service.revoke(owner, preApproved.id);
  });

  test("a team rule that allows is answered by the stricter of it and the card", async () => {
    const allow = await service.createTeamRule(admin, {
      botId: "*",
      toolRef: "mcp/crm/*",
      effect: "write",
      scope: "*",
      behaviour: "allow",
    });
    teamRuleIds.push(allow.id);
    expect(await outcomeOf(candidate({}, { initiator: REMOTE }))).toBe(ALWAYS);
    await service.revokeTeamRule(admin, allow.id);
  });
});

describe("(d) what the card can and cannot be answered with", () => {
  test("it can be allowed once and never always, and the next run asks again", async () => {
    const first = candidate({}, { initiator: REMOTE, threadId: `${prefix}-t` });
    expect(await outcomeOf(first)).toBe(ALWAYS);
    const [asked] = await requestsFor(first);
    await expect(
      service.decide(owner, asked?.id as string, "allow_always"),
    ).rejects.toBeInstanceOf(ApprovalRefusedError);
    expect(
      await database
        .select({ id: approvalRules.id })
        .from(approvalRules)
        .where(
          and(
            eq(approvalRules.ownerUserId, owner),
            isNull(approvalRules.revokedAt),
          ),
        ),
    ).toEqual([]);
    await service.decide(owner, asked?.id as string, "allow_once");
    const next = candidate({}, { initiator: REMOTE, threadId: `${prefix}-t2` });
    expect(await outcomeOf(next)).toBe(ALWAYS);
  });

  test("the remote session itself may allow it once or deny it: that is what a card from there is for", async () => {
    const write = candidate({}, { initiator: REMOTE });
    await outcomeOf(write);
    const [asked] = await requestsFor(write);
    if (!asked) throw new Error("the gate opened no card");
    expect(remoteMayAnswer("allow_once", asked.action)).toEqual({
      allowed: true,
    });
    expect(remoteMayAnswer("deny", asked.action)).toEqual({ allowed: true });
    expect(remoteMayAnswer("allow_always", asked.action).allowed).toBe(false);
  });

  test("a hop's card is answerable the same way, and a hop is not what makes it a different kind of request", async () => {
    const write = candidate({}, { initiator: hop(REMOTE) });
    await outcomeOf(write);
    const [asked] = await requestsFor(write);
    if (!asked) throw new Error("the gate opened no card");
    expect(asked.action.policy?.source).toBe("always_ask");
    expect(remoteMayAnswer("allow_once", asked.action).allowed).toBe(true);
  });
});

describe("(e) what is stricter than a card still comes first, and what is not a write is not asked", () => {
  test("a payment is handed to the person, and a connection is not answered from there", async () => {
    const paying = candidate(
      {
        toolRef: "mcp/shop/checkout",
        args: { cart: "c1", card: "on file" },
      },
      { initiator: REMOTE },
    );
    expect(await outcomeOf(paying)).toBe("hand_off/safety");
    const [asked] = await requestsFor(paying);
    if (!asked) throw new Error("the gate opened no card");
    expect(remoteMayAnswer("allow_once", asked.action).allowed).toBe(false);
  });

  test("a read and a hand-off are not held to a card by this rule", async () => {
    expect(
      await outcomeOf(candidate({ effect: "read" }, { initiator: REMOTE })),
    ).toBe("went through");
    expect(
      await outcomeOf(
        candidate(
          { effect: "delegate", toolRef: "message_bot" },
          { initiator: REMOTE },
        ),
      ),
    ).toBe("went through");
  });

  test("a member's own workspace and commands are asked in a remote run, and the card is the computer's to answer", async () => {
    for (const toolRef of ["computer_write_file", "computer_run_command"]) {
      const own = (initiator?: AuditInitiator) =>
        candidate(
          { toolRef, scope: "workspace" },
          initiator ? { initiator } : {},
        );
      // Control: the person's own turn, and a routine's run (which never asked for these), as they were.
      expect([toolRef, await outcomeOf(own())]).toEqual([
        toolRef,
        "went through",
      ]);
      expect([
        toolRef,
        await outcomeOf(own({ kind: "routine", id: `${prefix}-routine` })),
      ]).toEqual([toolRef, "went through"]);
      // A remote session's run, and a hop made from it.
      for (const initiator of [REMOTE, hop(REMOTE)]) {
        const write = own(initiator);
        expect([toolRef, await outcomeOf(write)]).toEqual([toolRef, ALWAYS]);
        const [asked] = await requestsFor(write);
        if (!asked) throw new Error("the gate opened no card");
        // A member's computer is not driven from a browser that is not paired with this one.
        expect(remoteMayAnswer("allow_once", asked.action).allowed).toBe(false);
        expect(remoteMayAnswer("deny", asked.action).allowed).toBe(false);
      }
    }
  });

  test("a saved rule that allows them does not answer it, in a remote run", async () => {
    const allow = await service.createRule(owner, {
      botId: "*",
      toolRef: "computer_run_command",
      effect: "*",
      scope: "*",
      behaviour: "allow",
    });
    const run = (initiator?: AuditInitiator) =>
      candidate(
        { toolRef: "computer_run_command", scope: "workspace" },
        initiator ? { initiator } : {},
      );
    expect(await outcomeOf(run())).toBe("went through");
    expect(await outcomeOf(run(REMOTE))).toBe(ALWAYS);
    await service.revoke(owner, allow.id);
  });
});

describe("a call made with no approval context, which is how the callback door reaches the gate", () => {
  /** The same call with no approval context to ask in, carrying the signed run's initiator. */
  const bare = (initiator: AuditInitiator | undefined, toolRef: string) => {
    const { continuation: _held, ...rest } = candidate({
      botId: FULL,
      toolRef,
    });
    return { ...rest, ...(initiator ? { initiator } : {}) };
  };

  test("a remote session's write there is refused, nothing is let through, and the trail names the kind", async () => {
    const marker = `mcp/crm/door_${randomUUID()}`;
    await expect(service.gate(bare(REMOTE, marker))).rejects.toThrow(
      "not started from a conversation that can ask you",
    );
    const rows = await database
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorUserId, owner),
          eq(auditEvents.eventType, "approval.evaluated"),
          eq(auditEvents.initiatorKind, "remote"),
        ),
      );
    const mine = rows.filter((row) => row.payload.tool === marker);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.payload).toMatchObject({
      outcome: { behaviour: "ask", source: "always_ask" },
    });
  });

  test("control: the person's own call there, or one that names no initiator, goes on as before, Full access and all", async () => {
    await expect(
      service.gate(bare(undefined, "mcp/crm/door_person")),
    ).resolves.toBeUndefined();
    await expect(
      service.gate(bare(PERSON_INITIATOR, "mcp/crm/door_person")),
    ).resolves.toBeUndefined();
  });
});
