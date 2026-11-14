/**
 * D35 (docs/M1_PLAN.md section 18), through the real approval gate and a real database: a routine or a
 * trigger never acts on the person's accounts without the approval card, and Full access never unlocks
 * setting one up, changing it or deleting it.
 *
 * Two findings were verified on main before anything was changed, and every case that proves one is
 * marked (a) or (b) in its name:
 *   (a) a write made by a routine's or a trigger's run passed with no card whenever the reviewer said
 *       "proceed" (the default) or the person's own settings did not ask, and a saved rule answered it;
 *   (b) Full access, in either setting, let a Bot create, change or delete a routine or a trigger in the
 *       person's own chat with no card.
 *
 * The reviewer is a stand-in that says "proceed" unless a test says otherwise, because that is what the
 * deployment's model says about an unremarkable write, and it is what let a routine's write through.
 * "The vendor is not reached" is `goesThrough`: the plugin store makes the call only when `gate` returns.
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
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import {
  type ApprovalCandidate,
  ApprovalRefusedError,
} from "../src/approvals/types";
import { type AuditInitiator, createAuditStore } from "../src/audit";
import { createDatabase } from "../src/db/client";
import {
  approvalRules,
  approvalTeamRules,
  auditEvents,
  users,
} from "../src/db/schema";
import { workItems } from "../src/db/schema/work";
import { createFullAccess } from "../src/freeduet/full-access";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `ra-${randomUUID()}`;
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

const ROUTINE: AuditInitiator = { kind: "routine", id: "r1" };
const TRIGGER: AuditInitiator = { kind: "responsibility", id: "t1" };
const hop = (origin: AuditInitiator): AuditInitiator => ({
  kind: "handoff",
  id: `${prefix}-iris`,
  origin,
});

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
  // A test that fails halfway leaves no rule, no setting and no answer behind for the next one: what a
  // test proves on main must be that test's own failure, not the one before it.
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

/** A setup tool of the Routines connector, as the plugin store marks it. */
const configuring = (
  over: Partial<ApprovalCandidate> = {},
  options: { initiator?: AuditInitiator } = {},
) =>
  candidate(
    {
      toolRef: "routines/create_routine",
      scope: "routines",
      args: { instruction: "Check the shared inbox.", cron: "0 9 * * 1-5" },
      configuresAutomation: true,
      ...over,
    },
    options,
  );

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

describe("(a) a routine's or a trigger's write asks, whatever else is on", () => {
  for (const [name, initiator] of [
    ["a routine", ROUTINE],
    ["an event trigger", TRIGGER],
    ["a hand-off that began in a routine", hop(ROUTINE)],
    ["a hand-off that began in a trigger", hop(TRIGGER)],
  ] as const)
    for (const person of [owner, quiet])
      test(`${name}, for a person whose reviewer says proceed${person === quiet ? " and who asks for nothing" : ""}`, async () => {
        const write = candidate({ actorId: person }, { initiator });
        expect(await outcomeOf(write)).toBe(ALWAYS);
        const [asked] = await requestsFor(write);
        expect(asked?.action.policy?.reason).toContain(
          "routine or a trigger running on its own",
        );
      });

  test("with Full access on for the member, in either setting", async () => {
    for (const botId of [FULL, NO_PAYMENTS])
      expect(
        await outcomeOf(candidate({ botId }, { initiator: ROUTINE })),
      ).toBe(ALWAYS);
    // Control: the same members, in the person's own live turn, are let through by it.
    for (const botId of [FULL, NO_PAYMENTS])
      expect(await outcomeOf(candidate({ botId }))).toBe("went through");
  });

  test("a rule the person saved, or one that allows only what was asked for, does not answer it", async () => {
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
    expect(await outcomeOf(candidate({}, { initiator: ROUTINE }))).toBe(ALWAYS);
    await service.revoke(owner, allow.id);
    await service.revoke(owner, preApproved.id);
  });

  test("a team rule that allows, asks or hands off is answered by the stricter of it and the card", async () => {
    const allow = await service.createTeamRule(admin, {
      botId: "*",
      toolRef: "mcp/crm/*",
      effect: "write",
      scope: "*",
      behaviour: "allow",
    });
    teamRuleIds.push(allow.id);
    expect(await outcomeOf(candidate({}, { initiator: ROUTINE }))).toBe(ALWAYS);
    await service.revokeTeamRule(admin, allow.id);
    const handOff = await service.createTeamRule(admin, {
      botId: "*",
      toolRef: "mcp/crm/*",
      effect: "write",
      scope: "*",
      behaviour: "hand_off",
    });
    teamRuleIds.push(handOff.id);
    expect(await outcomeOf(candidate({}, { initiator: ROUTINE }))).toBe(
      "hand_off/team_rule",
    );
    await service.revokeTeamRule(admin, handOff.id);
  });

  test("it can be allowed once and never always, and a saved answer never answers the next run", async () => {
    const first = candidate(
      {},
      { initiator: ROUTINE, threadId: `${prefix}-t` },
    );
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
    // The next run of the same routine is a new question.
    const next = candidate(
      {},
      { initiator: ROUTINE, threadId: `${prefix}-t2` },
    );
    expect(await outcomeOf(next)).toBe(ALWAYS);
  });

  test("what is stricter than a card still wins: a payment, a password, the reviewer's own hand-off", async () => {
    const paying = candidate(
      { toolRef: "mcp/shop/checkout", args: { cart: "c1", card: "on file" } },
      { initiator: ROUTINE },
    );
    expect(await outcomeOf(paying)).toBe("hand_off/safety");
    const password = candidate(
      { toolRef: "computer_type", args: { text: "change my password" } },
      { initiator: ROUTINE },
    );
    expect(await outcomeOf(password)).toBe("hand_off/safety");
    verdict = { verdict: "hand_off", safety: "none" };
    try {
      expect(await outcomeOf(candidate({}, { initiator: ROUTINE }))).toBe(
        "hand_off/auto_review",
      );
    } finally {
      verdict = { verdict: "proceed", safety: "none" };
    }
  });

  test("the decision is on the trail, with the routine that made the call", async () => {
    const write = candidate(
      { toolRef: "mcp/crm/trail_marker" },
      { initiator: { kind: "routine", id: `${prefix}-trail` } },
    );
    expect(await outcomeOf(write)).toBe(ALWAYS);
    const rows = await database
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorUserId, owner),
          eq(auditEvents.eventType, "approval.evaluated"),
          eq(auditEvents.initiatorKind, "routine"),
          eq(auditEvents.initiatorId, `${prefix}-trail`),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({
      tool: "mcp/crm/trail_marker",
      effect: "write",
      outcome: { behaviour: "ask", source: "always_ask" },
    });
  });
});

describe("what a routine does that reaches no account, or only reads, is as it was", () => {
  test("a read asks nothing and leaves nothing on the trail", async () => {
    const read = candidate(
      { toolRef: "routines/list_routines", effect: "read" },
      { initiator: ROUTINE },
    );
    expect(await outcomeOf(read)).toBe("went through");
    expect(
      await database
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.actorUserId, owner),
            sql`${auditEvents.payload} ->> 'tool' = 'routines/list_routines'`,
          ),
        ),
    ).toEqual([]);
  });

  test("the Bot's own workspace and commands on the person's computer are not held", async () => {
    for (const toolRef of [
      "computer_write_file",
      "computer_run_command",
      "host/write_file",
      "host/run_command",
    ])
      expect(
        await outcomeOf(
          candidate(
            { toolRef, scope: "workspace", args: { path: "notes.txt" } },
            { initiator: ROUTINE },
          ),
        ),
      ).toBe("went through");
  });

  test("the browser reaches accounts as the person does, so a routine's click or typing is held", async () => {
    for (const toolRef of ["computer_click", "computer_type"])
      expect(
        await outcomeOf(
          candidate(
            { toolRef, scope: "shop.example", args: { element: "Save" } },
            { initiator: ROUTINE },
          ),
        ),
      ).toBe(ALWAYS);
  });

  test("handing work to another Bot is not an account action, and a hop is judged on what it writes", async () => {
    expect(
      await outcomeOf(
        candidate(
          { toolRef: "bot/handoff", effect: "delegate", scope: "otto" },
          { initiator: ROUTINE },
        ),
      ),
    ).toBe("went through");
  });

  test("a memory run and the deployment are gated exactly as before", async () => {
    for (const initiator of [
      { kind: "memory", id: "m1" },
      { kind: "deployment" },
    ] satisfies AuditInitiator[])
      expect(await outcomeOf(candidate({}, { initiator }))).toBe(
        "went through",
      );
  });

  test("a hop with no known root, or one that began with the person and is not traced to their message, is as before", async () => {
    handedAnswer = null;
    expect(
      await outcomeOf(
        candidate({}, { initiator: { kind: "handoff", id: `${prefix}-iris` } }),
      ),
    ).toBe("went through");
    expect(
      await outcomeOf(candidate({}, { initiator: hop({ kind: "person" }) })),
    ).toBe("went through");
  });
});

describe("the person's own live turn is not changed", () => {
  test("with the defaults, a write goes through, and with 'ask before making changes' it asks as before", async () => {
    expect(await outcomeOf(candidate())).toBe("went through");
    expect(
      await outcomeOf(candidate({}, { initiator: { kind: "person" } })),
    ).toBe("went through");
    await service.setPreferences(owner, { enabled: true });
    try {
      expect(await outcomeOf(candidate())).toBe("ask/default");
    } finally {
      await service.setPreferences(owner, { enabled: false });
    }
  });

  test("with Full access on, in either setting, a write goes through with no card and says so on the trail", async () => {
    for (const botId of [FULL, NO_PAYMENTS]) {
      const write = candidate({
        botId,
        toolRef: `mcp/crm/update_${botId.slice(-5)}`,
      });
      expect(await outcomeOf(write)).toBe("went through");
    }
    const [last] = await fullAccess.recent(owner);
    expect(last).toMatchObject({ bot: NO_PAYMENTS });
  });

  test("a hop the server traces to the person's own message keeps Full access, as before", async () => {
    handedAnswer = { threadId: "origin", message: { id: "m", role: "user" } };
    try {
      expect(
        await outcomeOf(
          candidate({ botId: FULL }, { initiator: hop({ kind: "person" }) }),
        ),
      ).toBe("went through");
    } finally {
      handedAnswer = null;
    }
  });
});

describe("(b) setting up, changing or deleting a routine or a trigger asks, with Full access on or off", () => {
  test("in the person's own live turn, with Full access in either setting, or with none", async () => {
    for (const botId of [FULL, NO_PAYMENTS, PLAIN]) {
      const write = configuring({ botId });
      expect(await outcomeOf(write)).toBe(ALWAYS);
      const [asked] = await requestsFor(write);
      expect(asked?.action.policy?.reason).toContain(
        "setting one up, changing it or deleting it",
      );
    }
  });

  test("for a person who asks for nothing, and with a reviewer that says proceed", async () => {
    expect(await outcomeOf(configuring({ actorId: quiet, botId: FULL }))).toBe(
      ALWAYS,
    );
  });

  test("with Full access in the person's own turn it is the only thing that is held: the same member's other write goes through", async () => {
    expect(await outcomeOf(candidate({ botId: FULL }))).toBe("went through");
    expect(await outcomeOf(configuring({ botId: FULL }))).toBe(ALWAYS);
  });

  test("a routine that sets up another is held, and with the reason of a routine's run", async () => {
    const write = configuring({ botId: FULL }, { initiator: ROUTINE });
    expect(await outcomeOf(write)).toBe(ALWAYS);
    const [asked] = await requestsFor(write);
    expect(asked?.action.policy?.reason).toContain("routine or a trigger");
  });

  test("it is allowed once and never always, and a saved rule for the tool does not answer it", async () => {
    const rule = await service.createRule(owner, {
      botId: "*",
      toolRef: "routines/*",
      effect: "*",
      scope: "*",
      behaviour: "allow",
    });
    const write = configuring({ botId: FULL });
    expect(await outcomeOf(write)).toBe(ALWAYS);
    const [asked] = await requestsFor(write);
    await expect(
      service.decide(owner, asked?.id as string, "allow_always"),
    ).rejects.toBeInstanceOf(ApprovalRefusedError);
    await service.revoke(owner, rule.id);
  });

  test("a call that is a read on the Routines connector asks nothing", async () => {
    const read = candidate(
      { toolRef: "routines/list_triggers", scope: "routines", effect: "read" },
      {},
    );
    expect(await outcomeOf(read)).toBe("went through");
  });
});

describe("a call made with no approval context, which is how the callback door reaches the gate", () => {
  /** The same call with no approval context to ask in. */
  const bare = (
    from: ApprovalCandidate = candidate(),
    over: Partial<ApprovalCandidate> = {},
  ): ApprovalCandidate => {
    const { continuation: _held, ...rest } = from;
    return { ...rest, ...over };
  };

  test("(a) a routine's write there is refused, nothing is let through, and the trail names the routine", async () => {
    const write = bare(undefined, {
      toolRef: "mcp/crm/bare_marker",
      initiator: { kind: "routine", id: `${prefix}-bare` },
    });
    await expect(service.gate(write)).rejects.toThrow(
      "not started from a conversation that can ask you",
    );
    const rows = await database
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorUserId, owner),
          eq(auditEvents.eventType, "approval.evaluated"),
          eq(auditEvents.initiatorId, `${prefix}-bare`),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({
      outcome: { behaviour: "ask", source: "always_ask" },
    });
  });

  test("(a) the same for a trigger's, and for one that sets up a routine", async () => {
    await expect(
      service.gate(bare(undefined, { initiator: TRIGGER })),
    ).rejects.toThrow("not started from a conversation that can ask you");
    await expect(service.gate(bare(configuring()))).rejects.toThrow(
      "not started from a conversation that can ask you",
    );
  });

  test("the person's own call, or one that names no initiator, goes on as before", async () => {
    await expect(service.gate(bare())).resolves.toBeUndefined();
    await expect(
      service.gate(bare(undefined, { initiator: { kind: "person" } })),
    ).resolves.toBeUndefined();
  });
});

describe("a new email the person has just allowed on its own card is not asked about again", () => {
  test("so the send is not held by a second card that its answer could never be spent on", async () => {
    const send = candidate(
      { toolRef: "google-imap/gmail_send_message", scope: "google-imap" },
      { initiator: ROUTINE },
    );
    expect(await outcomeOf({ ...send, answeredByCard: true })).toBe(
      "went through",
    );
    // Without that answer, the same call is held.
    expect(
      await outcomeOf(
        candidate(
          { toolRef: "google-imap/gmail_send_message", scope: "google-imap" },
          { initiator: ROUTINE },
        ),
      ),
    ).toBe(ALWAYS);
  });
});
