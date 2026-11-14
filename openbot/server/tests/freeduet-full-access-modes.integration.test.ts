/**
 * Full access and its two settings (docs/FULL_ACCESS.md), against a real database and the real
 * approval gate: off, Full access, and Full access without payments.
 *
 * What must hold, and what this file pins:
 *   - THE TABLE. For each setting, for each kind of action, in each kind of turn, what the gate does.
 *     It is written out below (`TABLE`) and is the specification: "without payments" acts exactly as
 *     Full access does, except that a payment or a purchase asks, as it does with the switch off.
 *   - A HAND-OFF. When the server traces a hop to the person's own typed message, the stricter of the
 *     sender's and the receiver's settings holds for payments (the four combinations below).
 *   - STORAGE. An entry stored before the second setting existed is plain Full access, a value this
 *     build cannot read is off, and a build from before the second setting reads a "without payments"
 *     entry as off.
 *   - THE ROUTE. Raising what a member may do without asking needs the person's confirmation; moving
 *     down, or off, needs none.
 *   - THE TRAIL. An action taken without a card says which setting decided.
 * The reviewer is not given, so any test that reached it would fail closed and ask.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { fullAccessOutcome } from "../src/approvals/policy";
import { createApprovalRoutes } from "../src/approvals/routes";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import type {
  ApprovalCandidate,
  ApprovalTeamRule,
  FullAccessMode,
} from "../src/approvals/types";
import { type AuditInitiator, createAuditStore } from "../src/audit";
import type { AppVariables } from "../src/auth/guards";
import { createDatabase } from "../src/db/client";
import {
  approvalRules,
  approvalTeamRules,
  auditEvents,
  users,
} from "../src/db/schema";
import { workItems } from "../src/db/schema/work";
import {
  createFullAccess,
  FULL_ACCESS_PREFERENCE,
  modeOf,
  parseSetting,
} from "../src/freeduet/full-access";
import { Hono, type MiddlewareHandler } from "hono";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `fam-${randomUUID()}`;
const owner = `${prefix}-owner`;
const legacyPerson = `${prefix}-legacy`;
const unreadablePerson = `${prefix}-unreadable`;
const admin = `${prefix}-admin`;
const people = [owner, legacyPerson, unreadablePerson, admin];
const GHOST = `${prefix}-ghost`;
/** The member the table is run on, one per setting: this one is never switched on. */
type Mode = "off" | FullAccessMode;
const MODES = ["off", "full", "no_payments"] as const satisfies readonly Mode[];
const MEMBER: Record<Mode, string> = {
  off: `${prefix}-jules`,
  full: `${prefix}-penny`,
  no_payments: `${prefix}-otto`,
};
/** The member that hands work on in the table; never switched on there. */
const IRIS = `${prefix}-iris`;
const store = createApprovalStore(database);
const audit = createAuditStore(database);
const teamRuleIds: string[] = [];

/** What the stand-in for the hand-off loader answers: the person's own message, or nothing. */
let handedAnswer: unknown = null;
const fullAccess = createFullAccess({
  database,
  known: async (_userId, botId) => botId !== GHOST,
  handedRequest: async () => handedAnswer,
  audit,
});
const service = createApprovalService(store, undefined, undefined, {
  fullAccess,
});

const setMode = (bot: string, mode: Mode, person = owner) =>
  mode === "off"
    ? fullAccess.set(person, bot, false)
    : fullAccess.set(person, bot, true, mode);

beforeAll(async () => {
  await database
    .insert(users)
    .values(people.map((id) => ({ id, email: `${id}@example.test` })));
  // "Ask before making changes" is on, so an allowed action is one Full access let through.
  for (const person of [owner, legacyPerson, unreadablePerson])
    await service.setPreferences(person, { enabled: true, autoReview: false });
  await setMode(MEMBER.full, "full");
  await setMode(MEMBER.no_payments, "no_payments");
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

/** The eight kinds of action, each worded so the safety floor reads it the way a real one reads. */
const ACTIONS = {
  email: {
    toolRef: "mcp/gmail/send_email",
    scope: "gmail",
    args: { to: "sam@example.com", subject: "Hello" },
  },
  sign: {
    toolRef: "mcp/docusign/sign_document",
    scope: "docusign",
    args: { document: "contract-7" },
  },
  book: {
    toolRef: "mcp/hotel/book_room",
    scope: "hotel",
    args: { room: "r12", nights: 2 },
  },
  delete: {
    toolRef: "mcp/drive/delete_file",
    scope: "drive",
    args: { id: "f1" },
  },
  payment: {
    toolRef: "computer_click",
    scope: "shop.example",
    args: { element: "Pay now" },
  },
  purchase: {
    toolRef: "mcp/shop/checkout",
    scope: "shop",
    args: { cart: "c1", card: "on file" },
  },
  credential: {
    toolRef: "computer_type",
    scope: "bank.example",
    args: { text: "change my account password to hunter2" },
  },
  security: {
    toolRef: "mcp/drive/update",
    scope: "drive",
    args: { change: "make public" },
  },
} as const;
type Action = keyof typeof ACTIONS;
const ACTION_NAMES = Object.keys(ACTIONS) as Action[];

/**
 * What the gate does with one action:
 *   allowed     no card, the action runs
 *   asks        a card, because of the person's own "ask before making changes" (source `default`)
 *   handed_off  a card, because a safety requirement hands it to the person (source `safety`)
 */
type Outcome = "allowed" | "asks" | "handed_off";

type Situation =
  | "live"
  | "routine"
  | "check_in"
  | "handoff_traced"
  | "handoff_untraced";
const SITUATIONS = [
  "live",
  "routine",
  "check_in",
  "handoff_traced",
  "handoff_untraced",
] as const satisfies readonly Situation[];

const SENDER_HOP = (sender: string): AuditInitiator => ({
  kind: "handoff",
  id: sender,
  origin: { kind: "person" },
});
/** How each kind of turn reaches the gate, and whether the server can trace a hop to the person. */
const TURN: Record<
  Situation,
  { initiator?: AuditInitiator; traced?: boolean }
> = {
  live: {},
  routine: { initiator: { kind: "routine", id: "r1" } },
  check_in: { initiator: { kind: "responsibility", id: "check-in" } },
  handoff_traced: { initiator: SENDER_HOP(IRIS), traced: true },
  handoff_untraced: { initiator: SENDER_HOP(IRIS), traced: false },
};

const ASKS: Record<Action, Outcome> = {
  email: "asks",
  sign: "asks",
  book: "asks",
  delete: "asks",
  payment: "handed_off",
  purchase: "handed_off",
  credential: "handed_off",
  security: "handed_off",
};
/** Full access in a turn it applies to: everything but a password or a security setting. */
const FULL_LIFTED: Record<Action, Outcome> = {
  ...ASKS,
  email: "allowed",
  sign: "allowed",
  book: "allowed",
  delete: "allowed",
  payment: "allowed",
  purchase: "allowed",
};
/** Full access without payments in a turn it applies to: the same, but a payment or purchase asks. */
const NO_PAYMENTS_LIFTED: Record<Action, Outcome> = {
  ...FULL_LIFTED,
  payment: "handed_off",
  purchase: "handed_off",
};

/**
 * THE SPECIFICATION. Setting, then kind of turn, then kind of action. A turn Full access does not
 * apply to (a routine, a check-in, a hop the server cannot trace to the person) is the switch off.
 */
const TABLE: Record<Mode, Record<Situation, Record<Action, Outcome>>> = {
  off: {
    live: ASKS,
    routine: ASKS,
    check_in: ASKS,
    handoff_traced: ASKS,
    handoff_untraced: ASKS,
  },
  full: {
    live: FULL_LIFTED,
    routine: ASKS,
    check_in: ASKS,
    handoff_traced: FULL_LIFTED,
    handoff_untraced: ASKS,
  },
  no_payments: {
    live: NO_PAYMENTS_LIFTED,
    routine: ASKS,
    check_in: ASKS,
    handoff_traced: NO_PAYMENTS_LIFTED,
    handoff_untraced: ASKS,
  },
};

function candidate(
  botId: string,
  action: Action,
  options: { initiator?: AuditInitiator; person?: string } = {},
): ApprovalCandidate {
  const toolCallId = randomUUID();
  const { toolRef, scope, args } = ACTIONS[action];
  return {
    actorId: options.person ?? owner,
    botId,
    toolRef,
    effect: "write",
    scope,
    args,
    continuation: {
      runId: randomUUID(),
      threadId: `${prefix}-thread-${toolCallId}`,
      toolCallId,
      toolName: toolRef,
      args,
      messages: [],
      state: {},
      context: [],
      forwardedProps: { openbotRun: "signed-assertion" },
      ...(options.initiator ? { initiator: options.initiator } : {}),
    },
  };
}

const requestsFor = async (c: ApprovalCandidate) =>
  (await store.list(c.actorId)).filter(
    (row) => row.action.toolCallId === c.continuation?.toolCallId,
  );

/**
 * What the real gate did, read from what it left behind: "allowed" when it let the action through
 * with no card, otherwise the behaviour and the source of the one card it opened. Any error but a
 * pause is the test's own.
 */
async function policyOf(c: ApprovalCandidate): Promise<string> {
  const paused = await service.gate(c).then(
    () => false,
    (error: unknown) => {
      if (error instanceof HeadlessToolSuspension) return true;
      throw error;
    },
  );
  const requests = await requestsFor(c);
  if (!paused) return requests.length === 0 ? "allowed" : "allowed-with-card";
  const [request] = requests;
  return requests.length === 1
    ? `${request?.action.policy?.behaviour}/${request?.action.policy?.source}`
    : `${requests.length} cards`;
}

/** `policyOf`, in the three words the table uses; anything else is shown as it was. */
async function outcomeOf(c: ApprovalCandidate): Promise<Outcome | string> {
  const seen = await policyOf(c);
  if (seen === "ask/default") return "asks";
  if (seen === "hand_off/safety") return "handed_off";
  return seen;
}

async function observe(
  botId: string,
  situation: Situation,
): Promise<Record<Action, Outcome | string>> {
  const turn = TURN[situation];
  handedAnswer = turn.traced
    ? { threadId: "origin", message: { id: "m", role: "user" } }
    : null;
  const seen = {} as Record<Action, Outcome | string>;
  for (const action of ACTION_NAMES)
    seen[action] = await outcomeOf(
      candidate(botId, action, {
        ...(turn.initiator ? { initiator: turn.initiator } : {}),
      }),
    );
  handedAnswer = null;
  return seen;
}

describe("the table: each setting, each kind of turn, each kind of action, through the real gate", () => {
  for (const mode of MODES)
    for (const situation of SITUATIONS)
      test(`${mode}, ${situation}`, async () => {
        expect(await observe(MEMBER[mode], situation)).toEqual(
          TABLE[mode][situation],
        );
      });

  test("the table is what the maintainer decided: only a payment or a purchase tells the two settings apart", () => {
    for (const situation of SITUATIONS) {
      const full = TABLE.full[situation];
      const without = TABLE.no_payments[situation];
      const differing = ACTION_NAMES.filter(
        (action) => full[action] !== without[action],
      );
      expect(differing).toEqual(full === ASKS ? [] : ["payment", "purchase"]);
    }
  });

  test("a password and a security setting are handed to the person in every setting and every turn", () => {
    for (const mode of MODES)
      for (const situation of SITUATIONS) {
        expect(TABLE[mode][situation].credential).toBe("handed_off");
        expect(TABLE[mode][situation].security).toBe("handed_off");
      }
  });
});

describe("a payment under 'without payments' asks exactly as it does with the switch off", () => {
  test("the same card: same behaviour, same source, same reason", async () => {
    const without = candidate(MEMBER.no_payments, "payment");
    const off = candidate(MEMBER.off, "payment");
    await outcomeOf(without);
    await outcomeOf(off);
    const [asked] = await requestsFor(without);
    const [askedOff] = await requestsFor(off);
    expect(asked?.action.policy).toEqual(askedOff?.action.policy);
    expect(asked?.action.policy).toMatchObject({
      behaviour: "hand_off",
      source: "safety",
    });
  });

  test("so does a purchase, and the card cannot be remembered as an 'always allow'", async () => {
    const purchase = candidate(MEMBER.no_payments, "purchase");
    expect(await outcomeOf(purchase)).toBe("handed_off");
    const [asked] = await requestsFor(purchase);
    expect(asked?.action.policy?.source).toBe("safety");
  });
});

describe("the other rules do not change between the two settings", () => {
  test("a team rule that asks still wins, in both", async () => {
    const locked = await service.createTeamRule(admin, {
      botId: "*",
      toolRef: "mcp/crm/*",
      effect: "write",
      scope: "*",
      behaviour: "ask",
    });
    teamRuleIds.push(locked.id);
    for (const mode of ["full", "no_payments"] as const) {
      const guarded = {
        ...candidate(MEMBER[mode], "email"),
        toolRef: "mcp/crm/update",
        scope: "crm",
      };
      expect(await policyOf(guarded)).toBe("ask/team_rule");
    }
    await service.revokeTeamRule(admin, locked.id);
  });

  test("a read is never a verdict, in either setting", async () => {
    for (const mode of ["full", "no_payments"] as const) {
      const read = {
        ...candidate(MEMBER[mode], "payment"),
        effect: "read",
      };
      await expect(service.gate(read)).resolves.toBeUndefined();
      expect(await requestsFor(read)).toEqual([]);
    }
  });

  test("it is per member and per person, in both settings", async () => {
    const other = candidate(`${prefix}-someone-else`, "email");
    expect(await outcomeOf(other)).toBe("asks");
    for (const mode of ["full", "no_payments"] as const) {
      const forLegacy = candidate(MEMBER[mode], "email", {
        person: legacyPerson,
      });
      expect(await outcomeOf(forLegacy)).toBe("asks");
    }
  });

  test("a member whose id is a property of every object is not found by the lookup", async () => {
    for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty"])
      expect(await outcomeOf(candidate(id, "email"))).toBe("asks");
  });
});

describe("a hand-off traced to the person's own message: the stricter setting holds for payments", () => {
  const SENDER = `${prefix}-sender`;
  const RECEIVER = `${prefix}-receiver`;
  const hop = SENDER_HOP(SENDER);
  const tracedTo = { threadId: "origin", message: { id: "m", role: "user" } };

  /** What the receiver does with a payment, a purchase and an email, handed the work by the sender. */
  async function handed(sender: Mode, receiver: Mode) {
    await setMode(SENDER, sender);
    await setMode(RECEIVER, receiver);
    handedAnswer = tracedTo;
    const seen = {
      payment: await outcomeOf(
        candidate(RECEIVER, "payment", { initiator: hop }),
      ),
      purchase: await outcomeOf(
        candidate(RECEIVER, "purchase", { initiator: hop }),
      ),
      email: await outcomeOf(candidate(RECEIVER, "email", { initiator: hop })),
    };
    handedAnswer = null;
    return seen;
  }

  const COMBINATIONS: {
    sender: Mode;
    receiver: Mode;
    payment: Outcome;
    email: Outcome;
    why: string;
  }[] = [
    {
      sender: "no_payments",
      receiver: "no_payments",
      payment: "handed_off",
      email: "allowed",
      why: "both are without payments",
    },
    {
      sender: "full",
      receiver: "no_payments",
      payment: "handed_off",
      email: "allowed",
      why: "the receiver is without payments, whatever the sender is",
    },
    {
      sender: "no_payments",
      receiver: "full",
      payment: "handed_off",
      email: "allowed",
      why: "the sender is without payments, so the receiver's plain Full access does not get round it",
    },
    {
      sender: "full",
      receiver: "full",
      payment: "allowed",
      email: "allowed",
      why: "both are plain Full access",
    },
    // What was always true, and is not changed: a sender with the switch off adds nothing, and a
    // receiver with the switch off is not helped by a sender that has it on.
    {
      sender: "off",
      receiver: "full",
      payment: "allowed",
      email: "allowed",
      why: "a sender with Full access off adds nothing: the receiver's own setting stands",
    },
    {
      sender: "off",
      receiver: "no_payments",
      payment: "handed_off",
      email: "allowed",
      why: "the receiver is without payments",
    },
    {
      sender: "full",
      receiver: "off",
      payment: "handed_off",
      email: "asks",
      why: "the receiver is the member that is gated, and its switch is off",
    },
    {
      sender: "no_payments",
      receiver: "off",
      payment: "handed_off",
      email: "asks",
      why: "the receiver is the member that is gated, and its switch is off",
    },
  ];

  for (const combination of COMBINATIONS)
    test(`sender ${combination.sender}, receiver ${combination.receiver}: ${combination.why}`, async () => {
      const seen = await handed(combination.sender, combination.receiver);
      expect(seen).toEqual({
        payment: combination.payment,
        purchase: combination.payment,
        email: combination.email,
      });
    });

  test("the sender is the member the server's hop names: a hop from a member the person has not listed adds nothing", async () => {
    // SENDER is without payments, but this hop was made by IRIS, who is not in the person's list.
    await setMode(SENDER, "no_payments");
    await setMode(RECEIVER, "full");
    handedAnswer = tracedTo;
    const unlisted = await outcomeOf(
      candidate(RECEIVER, "payment", { initiator: SENDER_HOP(IRIS) }),
    );
    expect(unlisted).toBe("allowed");
    handedAnswer = null;
  });

  test("a hop the server cannot trace to the person's message asks, in every combination", async () => {
    for (const sender of MODES)
      for (const receiver of MODES) {
        await setMode(SENDER, sender);
        await setMode(RECEIVER, receiver);
        handedAnswer = null;
        expect(
          await outcomeOf(candidate(RECEIVER, "email", { initiator: hop })),
        ).toBe("asks");
      }
  });

  test("a sender's setting is the person's own: another person's setting for the same member counts for nothing", async () => {
    // SENDER is without payments for `owner`; for `legacyPerson` it is not listed, and the receiver's
    // own plain Full access stands for that person.
    await setMode(SENDER, "no_payments");
    await setMode(RECEIVER, "full", legacyPerson);
    handedAnswer = tracedTo;
    const forLegacy = await outcomeOf(
      candidate(RECEIVER, "payment", { initiator: hop, person: legacyPerson }),
    );
    expect(forLegacy).toBe("allowed");
    handedAnswer = null;
    await setMode(RECEIVER, "off", legacyPerson);
  });
});

describe("storage", () => {
  const stored = async (person: string) => {
    const [row] = await database
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, person));
    const preferences = (row?.preferences ?? {}) as Record<string, unknown>;
    return preferences[FULL_ACCESS_PREFERENCE] as
      | Record<string, Record<string, unknown>>
      | undefined;
  };
  const write = (person: string, value: unknown) =>
    database
      .update(users)
      .set({
        preferences: sql`${JSON.stringify({ [FULL_ACCESS_PREFERENCE]: value })}::text::jsonb`,
      })
      .where(eq(users.id, person));

  test("an entry stored before the second setting existed is plain Full access, and nothing is rewritten", async () => {
    const legacy = { [MEMBER.full]: { since: "2026-11-14T09:00:00.000Z" } };
    await write(legacyPerson, legacy);
    expect(await fullAccess.list(legacyPerson)).toEqual(legacy);
    const entry = (await fullAccess.list(legacyPerson))[MEMBER.full];
    expect(entry && modeOf(entry)).toBe("full");
    // Through the real gate: the person's own turn, plain Full access, a payment goes through.
    const paying = candidate(MEMBER.full, "payment", { person: legacyPerson });
    expect(await outcomeOf(paying)).toBe("allowed");
    const credential = candidate(MEMBER.full, "credential", {
      person: legacyPerson,
    });
    expect(await outcomeOf(credential)).toBe("handed_off");
    // Reading it, and acting on it, wrote nothing.
    expect(await stored(legacyPerson)).toEqual(legacy);
  });

  test("giving another member a setting leaves that entry exactly as it was", async () => {
    const before = await stored(legacyPerson);
    await fullAccess.set(legacyPerson, MEMBER.no_payments, true, "no_payments");
    const after = await stored(legacyPerson);
    expect(after?.[MEMBER.full]).toEqual(before?.[MEMBER.full]);
    expect(Object.keys(after ?? {}).sort()).toEqual(
      [MEMBER.full, MEMBER.no_payments].sort(),
    );
    await fullAccess.set(legacyPerson, MEMBER.no_payments, false);
  });

  test("plain Full access is written as it always was, and 'without payments' as a second shape", async () => {
    await setMode(MEMBER.full, "full");
    await setMode(MEMBER.no_payments, "no_payments");
    const entries = await stored(owner);
    expect(Object.keys(entries?.[MEMBER.full] ?? {})).toEqual(["since"]);
    expect(Object.keys(entries?.[MEMBER.no_payments] ?? {}).sort()).toEqual([
      "at",
      "mode",
    ]);
    expect(entries?.[MEMBER.no_payments]?.mode).toBe("no_payments");
  });

  test("a build from before the second setting reads a 'without payments' entry as off, never as Full access", async () => {
    // The rule that build applied, copied: only `{ since: <string> }` counts.
    const readByAnOlderBuild = (value: unknown) =>
      Object.entries((value ?? {}) as Record<string, unknown>)
        .filter(
          ([, entry]) =>
            typeof (entry as { since?: unknown } | null)?.since === "string",
        )
        .map(([bot]) => bot)
        .sort();
    const entries = await stored(owner);
    expect(readByAnOlderBuild(entries)).toEqual([MEMBER.full]);
    expect(Object.keys(entries ?? {})).toContain(MEMBER.no_payments);
  });

  test("changing a member's setting replaces its entry whole", async () => {
    const bot = `${prefix}-wren`;
    await setMode(bot, "full");
    expect(Object.keys((await stored(owner))?.[bot] ?? {})).toEqual(["since"]);
    await setMode(bot, "no_payments");
    expect(Object.keys((await stored(owner))?.[bot] ?? {}).sort()).toEqual([
      "at",
      "mode",
    ]);
    await setMode(bot, "full");
    expect(Object.keys((await stored(owner))?.[bot] ?? {})).toEqual(["since"]);
    await setMode(bot, "off");
    expect(Object.keys((await stored(owner)) ?? {})).not.toContain(bot);
  });

  test("a value this build cannot read is off, for that member only", () => {
    const at = "2026-11-14T09:00:00.000Z";
    expect(parseSetting({ a: { since: at } })).toEqual({ a: { since: at } });
    expect(parseSetting({ a: { mode: "no_payments", at } })).toEqual({
      a: { since: at, mode: "no_payments" },
    });
    for (const unreadable of [
      true,
      "yes",
      5,
      null,
      [],
      { since: 5 },
      { since: null },
      { mode: "no_payments" },
      { mode: "no_payments", at: 5 },
      { mode: "no_payments", since: at },
      { mode: "full", since: at },
      { mode: "full", at },
      { mode: "everything", at },
      { mode: "everything", since: at },
      { mode: null, since: at },
      { mode: 1, at },
      { mode: ["no_payments"], at },
    ])
      expect(parseSetting({ a: unreadable, b: { since: at } })).toEqual({
        b: { since: at },
      });
    expect(parseSetting("a")).toEqual({});
    expect(parseSetting([{ since: at }])).toEqual({});
  });

  test("a setting that cannot be read leaves the member asking, through the real gate", async () => {
    const at = "2026-11-14T09:00:00.000Z";
    for (const unreadable of [
      { mode: "everything", at },
      { mode: "no_payments" },
      { mode: "full", since: at },
      true,
    ]) {
      await write(unreadablePerson, { [MEMBER.full]: unreadable });
      expect(await fullAccess.list(unreadablePerson)).toEqual({});
      for (const action of ["email", "payment"] as const)
        expect(
          await outcomeOf(
            candidate(MEMBER.full, action, { person: unreadablePerson }),
          ),
        ).toBe(ASKS[action]);
    }
    await write(unreadablePerson, {});
  });

  test("a mode the writer does not know is refused, and nothing is written", async () => {
    const before = await stored(owner);
    await expect(
      fullAccess.set(owner, MEMBER.off, true, "everything" as FullAccessMode),
    ).rejects.toThrow("Choose a kind of Full access");
    expect(await stored(owner)).toEqual(before);
  });
});

describe("the policy function itself", () => {
  const send = {
    actorId: owner,
    botId: "m",
    toolRef: "mcp/gmail/send_email",
    effect: "write",
    scope: "gmail",
    args: {},
  } satisfies ApprovalCandidate;
  const askingRule = {
    id: "t1",
    botId: "*",
    toolRef: "mcp/gmail/*",
    effect: "write",
    scope: "*",
    behaviour: "ask",
  } as unknown as ApprovalTeamRule;

  test("it lifts a payment in plain Full access only", () => {
    const payments = { id: "payments" };
    expect(fullAccessOutcome(send, payments, [], "full")).toMatchObject({
      behaviour: "allow",
      source: "full_access",
      fullAccessMode: "full",
    });
    expect(
      fullAccessOutcome(send, payments, [], "no_payments"),
    ).toBeUndefined();
    for (const mode of ["full", "no_payments"] as const)
      for (const floor of ["credentials", "security_settings"])
        expect(
          fullAccessOutcome(send, { id: floor }, [], mode),
        ).toBeUndefined();
  });

  test("with nothing held back, the two settings answer alike, and say which one", () => {
    expect(fullAccessOutcome(send, undefined, [], "full")).toMatchObject({
      behaviour: "allow",
      fullAccessMode: "full",
    });
    expect(fullAccessOutcome(send, undefined, [], "no_payments")).toMatchObject(
      {
        behaviour: "allow",
        source: "full_access",
        fullAccessMode: "no_payments",
      },
    );
  });

  test("a read, an admin's rule that asks, and a mode it does not know all answer nothing", () => {
    for (const mode of ["full", "no_payments"] as const) {
      expect(
        fullAccessOutcome({ ...send, effect: "read" }, undefined, [], mode),
      ).toBeUndefined();
      expect(
        fullAccessOutcome(send, undefined, [askingRule], mode),
      ).toBeUndefined();
    }
    for (const unknown of ["everything", "", "FULL"])
      expect(
        fullAccessOutcome(
          send,
          undefined,
          [],
          unknown as unknown as FullAccessMode,
        ),
      ).toBeUndefined();
  });
});

describe("the trail says which setting decided", () => {
  const evaluated = async (bot: string) =>
    (
      await database
        .select({ payload: auditEvents.payload })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.actorUserId, owner),
            eq(auditEvents.eventType, "approval.evaluated"),
            sql`${auditEvents.payload} ->> 'bot' = ${bot}`,
          ),
        )
    ).map((row) => row.payload as { tool: string; outcome: unknown });

  test("an email sent without a card carries the setting, in both", async () => {
    for (const mode of ["full", "no_payments"] as const) {
      expect(await outcomeOf(candidate(MEMBER[mode], "email"))).toBe("allowed");
      expect(await evaluated(MEMBER[mode])).toContainEqual(
        expect.objectContaining({
          tool: "mcp/gmail/send_email",
          outcome: expect.objectContaining({
            behaviour: "allow",
            source: "full_access",
            fullAccessMode: mode,
          }),
        }),
      );
    }
  });

  test("a payment held back from a member 'without payments' is on the trail as the floor's, not as Full access", async () => {
    const bot = `${prefix}-trail`;
    await setMode(bot, "no_payments");
    expect(await outcomeOf(candidate(bot, "payment"))).toBe("handed_off");
    const rows = await evaluated(bot);
    expect(rows).toContainEqual(
      expect.objectContaining({
        outcome: expect.objectContaining({
          behaviour: "hand_off",
          source: "safety",
        }),
      }),
    );
    expect(
      rows.filter(
        (row) => (row.outcome as { source?: string }).source === "full_access",
      ),
    ).toEqual([]);
    await setMode(bot, "off");
  });

  test("each change of the setting is on the trail, by name", async () => {
    const bot = `${prefix}-changes`;
    await setMode(bot, "full");
    await setMode(bot, "no_payments");
    await setMode(bot, "off");
    const changes = (
      await database
        .select({ payload: auditEvents.payload })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.actorUserId, owner),
            eq(auditEvents.eventType, "configuration.changed"),
            eq(auditEvents.targetType, "full_access"),
            eq(auditEvents.targetId, bot),
          ),
        )
        .orderBy(auditEvents.createdAt)
    ).map((row) => row.payload);
    expect(changes).toEqual([
      { change: "full_access_on", bot },
      { change: "full_access_no_payments_on", bot },
      { change: "full_access_off", bot },
    ]);
  });

  test("what the person is shown afterwards lists the actions of both settings, and nothing the floor held back", async () => {
    const shown = await fullAccess.recent(owner, 100);
    for (const mode of ["full", "no_payments"] as const)
      expect(shown).toContainEqual(
        expect.objectContaining({
          bot: MEMBER[mode],
          tool: "mcp/gmail/send_email",
        }),
      );
    expect(shown.some((action) => action.bot === `${prefix}-trail`)).toBe(
      false,
    );
  });
});

describe("the route", () => {
  const session =
    (id: string | null): MiddlewareHandler<{ Variables: AppVariables }> =>
    async (context, next) => {
      if (!id) return context.json({ error: "Authentication required." }, 401);
      context.set("actor", {
        id,
        email: `${id}@example.test`,
        role: "user",
      });
      await next();
    };
  const app = (id: string | null) => {
    const routes = new Hono();
    routes.route("/api/approvals", createApprovalRoutes(service, session(id)));
    return routes;
  };
  const put = (bot: string, body: unknown, id: string | null = owner) =>
    app(id).request(`/api/approvals/full-access/${encodeURIComponent(bot)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const read = async (bot: string, id = owner) => {
    const response = await app(id).request("/api/approvals/full-access");
    const body = (await response.json()) as {
      bots: Record<string, { since: string; mode: string }>;
    };
    return body.bots[bot];
  };
  /** Each test starts from a setting it names, so none depends on another having run. */
  const start = (bot: string, mode: Mode) => setMode(bot, mode);

  test("the body that was always valid still means plain Full access", async () => {
    const bot = `${prefix}-route-legacy`;
    expect((await put(bot, { enabled: true })).status).toBe(400);
    expect(await read(bot)).toBeUndefined();
    expect((await put(bot, { enabled: true, confirm: true })).status).toBe(200);
    expect(await read(bot)).toMatchObject({ mode: "full" });
    expect(await outcomeOf(candidate(bot, "payment"))).toBe("allowed");
    expect((await put(bot, { enabled: false })).status).toBe(200);
    expect(await read(bot)).toBeUndefined();
  });

  test("turning either setting on needs the person's confirm", async () => {
    for (const mode of ["full", "no_payments"] as const) {
      const bot = `${prefix}-route-on-${mode}`;
      expect((await put(bot, { enabled: true, mode })).status).toBe(400);
      expect(
        (await put(bot, { enabled: true, mode, confirm: false })).status,
      ).toBe(400);
      expect(await read(bot)).toBeUndefined();
      const turned = await put(bot, { enabled: true, mode, confirm: true });
      expect(turned.status).toBe(200);
      expect(await read(bot)).toMatchObject({ mode });
      expect((await put(bot, { enabled: false })).status).toBe(200);
    }
  });

  test("going from 'without payments' to plain Full access needs a fresh confirm", async () => {
    const bot = `${prefix}-route-up`;
    await start(bot, "no_payments");
    const refused = await put(bot, { enabled: true, mode: "full" });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain(
      "Confirm",
    );
    // Nothing moved: it is still without payments, and a payment still asks.
    expect(await read(bot)).toMatchObject({ mode: "no_payments" });
    expect(
      (await put(bot, { enabled: true, mode: "full", confirm: false })).status,
    ).toBe(400);
    expect(await read(bot)).toMatchObject({ mode: "no_payments" });
    expect(await outcomeOf(candidate(bot, "payment"))).toBe("handed_off");
    const raised = await put(bot, {
      enabled: true,
      mode: "full",
      confirm: true,
    });
    expect(raised.status).toBe(200);
    expect(await read(bot)).toMatchObject({ mode: "full" });
    expect(await outcomeOf(candidate(bot, "payment"))).toBe("allowed");
  });

  test("going down, to 'without payments' or to off, needs no confirm and is immediate", async () => {
    const bot = `${prefix}-route-down`;
    await start(bot, "full");
    const lowered = await put(bot, { enabled: true, mode: "no_payments" });
    expect(lowered.status).toBe(200);
    expect(await read(bot)).toMatchObject({ mode: "no_payments" });
    // The very next action: a payment asks, an email does not.
    expect(await outcomeOf(candidate(bot, "payment"))).toBe("handed_off");
    expect(await outcomeOf(candidate(bot, "email"))).toBe("allowed");
    const off = await put(bot, { enabled: false });
    expect(off.status).toBe(200);
    expect(await read(bot)).toBeUndefined();
    expect(await outcomeOf(candidate(bot, "email"))).toBe("asks");
    // From plain Full access straight to off, too.
    await start(bot, "full");
    expect((await put(bot, { enabled: false })).status).toBe(200);
    expect(await read(bot)).toBeUndefined();
  });

  test("a request that contradicts itself, or names a setting that does not exist, changes nothing", async () => {
    const bot = `${prefix}-route-bad`;
    await start(bot, "no_payments");
    for (const body of [
      { enabled: false, mode: "full" },
      { enabled: false, mode: "no_payments" },
      { enabled: true, mode: "everything", confirm: true },
      { enabled: true, mode: "", confirm: true },
      { enabled: true, mode: null, confirm: true },
      { enabled: true, mode: "FULL", confirm: true },
      { mode: "full", confirm: true },
      { enabled: true, mode: "full", confirm: true, payments: true },
    ])
      expect((await put(bot, body)).status).toBe(400);
    expect(await read(bot)).toMatchObject({ mode: "no_payments" });
    await start(bot, "off");
  });

  test("the list says each member's setting, and when it was given", async () => {
    const a = `${prefix}-route-list-a`;
    const b = `${prefix}-route-list-b`;
    await put(a, { enabled: true, confirm: true });
    await put(b, { enabled: true, mode: "no_payments", confirm: true });
    const first = await read(a);
    const second = await read(b);
    expect(first?.mode).toBe("full");
    expect(second?.mode).toBe("no_payments");
    expect(Number.isNaN(Date.parse(first?.since ?? ""))).toBe(false);
    expect(Number.isNaN(Date.parse(second?.since ?? ""))).toBe(false);
    await start(a, "off");
    await start(b, "off");
  });

  test("without a session nothing is read or written, and a member nobody has is refused", async () => {
    const bot = `${prefix}-route-session`;
    expect((await app(null).request("/api/approvals/full-access")).status).toBe(
      401,
    );
    expect(
      (
        await put(
          bot,
          { enabled: true, mode: "no_payments", confirm: true },
          null,
        )
      ).status,
    ).toBe(401);
    expect(await read(bot)).toBeUndefined();
    expect(
      (await put(GHOST, { enabled: true, mode: "no_payments", confirm: true }))
        .status,
    ).toBe(400);
  });

  test("one person's request never reaches another person's setting", async () => {
    const bot = `${prefix}-route-person`;
    await put(
      bot,
      { enabled: true, mode: "no_payments", confirm: true },
      legacyPerson,
    );
    expect(await read(bot)).toBeUndefined();
    expect(await read(bot, legacyPerson)).toMatchObject({
      mode: "no_payments",
    });
    await put(bot, { enabled: false }, legacyPerson);
  });
});
