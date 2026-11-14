/**
 * Full access (docs/FULL_ACCESS.md), against a real database and the real approval gate.
 *
 * The person can switch one member to Full access, and that member then acts without approval cards.
 * What must hold: it is off until the person says so; it is the person's alone to change; it is per
 * person and per member; it applies in the person's own live turn and nowhere unattended; credentials
 * and security settings are still handed to the person; every action taken without a card is on the
 * trail. The reviewer is not given here, so any test that reached it would fail closed and ask.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { createApprovalRoutes } from "../src/approvals/routes";
import {
  createApprovalService,
  DECLINED_BY_PERSON,
} from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import type { ApprovalCandidate } from "../src/approvals/types";
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
  parseSetting,
  withFullAccess,
} from "../src/freeduet/full-access";
import { createPrivateShareCheck } from "../src/proactive/private-share";
import { createUserPreferencesStore } from "../src/user-preferences";
import { userPreferencesRoutes } from "../src/user-preferences-routes";
import { Hono, type MiddlewareHandler } from "hono";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { sourceFiles, stripComments } from "./support/source-scan";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `fa-${randomUUID()}`;
const owner = `${prefix}-owner`;
const other = `${prefix}-other`;
const admin = `${prefix}-admin`;
const FULL = `${prefix}-jules`;
const NORMAL = `${prefix}-otto`;
const GHOST = `${prefix}-ghost`;
const store = createApprovalStore(database);
const audit = createAuditStore(database);
const teamRuleIds: string[] = [];

/** What the stand-in for the hand-off loader answers, and what it was asked. */
let handedAnswer: unknown = null;
let handedFails = false;
const handedAsked: { assertion: unknown; botId: string; actorId: string }[] =
  [];
const fullAccess = createFullAccess({
  database,
  known: async (_userId, botId) => botId !== GHOST,
  handedRequest: async (input) => {
    handedAsked.push(input);
    if (handedFails) throw new Error("the conversation could not be read");
    return handedAnswer;
  },
  audit,
});
// The service with Full access, and the service as it was before it existed.
const service = createApprovalService(store, undefined, undefined, {
  fullAccess,
});
const before = createApprovalService(store);

beforeAll(async () => {
  await database.insert(users).values(
    [owner, other, admin].map((id) => ({
      id,
      email: `${id}@example.test`,
    })),
  );
  // "Ask before making changes" is on, so an allowed action is one Full access let through.
  for (const person of [owner, other])
    await service.setPreferences(person, { enabled: true, autoReview: false });
});
afterAll(async () => {
  if (teamRuleIds.length)
    await database
      .delete(approvalTeamRules)
      .where(inArray(approvalTeamRules.id, teamRuleIds));
  await database
    .delete(approvalRules)
    .where(inArray(approvalRules.ownerUserId, [owner, other]));
  await database.delete(workItems).where(
    and(
      eq(workItems.kind, "approval.resume"),
      inArray(
        workItems.key,
        (await store.list(owner)).map((request) => request.id),
      ),
    ),
  );
  // Audit rows are append-only by design and stay; they name only this run's throwaway ids.
  await database.delete(users).where(inArray(users.id, [owner, other, admin]));
  await database.$client.close();
});

function candidate(
  over: Partial<ApprovalCandidate> = {},
  options: { initiator?: AuditInitiator; threadId?: string } = {},
): ApprovalCandidate {
  const toolCallId = randomUUID();
  return {
    actorId: owner,
    botId: FULL,
    toolRef: "mcp/gmail/send_email",
    effect: "write",
    scope: "gmail",
    args: { to: "sam@example.com", subject: "Hello" },
    continuation: {
      runId: randomUUID(),
      threadId: options.threadId ?? `${prefix}-thread-${toolCallId}`,
      toolCallId,
      toolName: "mcp/gmail/send_email",
      args: { to: "sam@example.com", subject: "Hello" },
      messages: [],
      state: {},
      context: [],
      forwardedProps: { openbotRun: "signed-assertion" },
      ...(options.initiator ? { initiator: options.initiator } : {}),
    },
    ...over,
  };
}

const suspends = (promise: Promise<unknown>) =>
  promise.then(
    () => false,
    (error: unknown) => error instanceof HeadlessToolSuspension,
  );
const requestsFor = async (c: ApprovalCandidate) =>
  (await store.list(owner)).filter(
    (row) => row.action.toolCallId === c.continuation?.toolCallId,
  );
const on = (bot: string, person = owner) => fullAccess.set(person, bot, true);
const off = (bot: string, person = owner) => fullAccess.set(person, bot, false);

describe("off by default", () => {
  test("with nothing stored a member asks, exactly as before Full access existed", async () => {
    expect(await fullAccess.list(owner)).toEqual({});
    const withOption = candidate();
    const without = candidate();
    expect(await suspends(service.gate(withOption))).toBeTrue();
    expect(await suspends(before.gate(without))).toBeTrue();
    const [asked] = await requestsFor(withOption);
    const [askedBefore] = await requestsFor(without);
    expect(asked?.action.policy).toEqual(askedBefore?.action.policy);
    expect(asked?.action.policy?.source).toBe("default");
  });

  test("a garbled stored value reads as off, member by member", () => {
    expect(parseSetting(null)).toEqual({});
    expect(parseSetting("yes")).toEqual({});
    expect(parseSetting([FULL])).toEqual({});
    expect(parseSetting({ [FULL]: true, [NORMAL]: { since: 5 } })).toEqual({});
    expect(parseSetting({ [FULL]: { since: "2026-11-14" } })).toEqual({
      [FULL]: { since: "2026-11-14" },
    });
  });
});

describe("on for one member", () => {
  beforeAll(async () => {
    await on(FULL);
  });

  test("no card in the person's own live turn, and the action is on the trail", async () => {
    const send = candidate();
    await expect(service.gate(send)).resolves.toBeUndefined();
    expect(await requestsFor(send)).toEqual([]);
    const rows = await database
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorUserId, owner),
          eq(auditEvents.eventType, "approval.evaluated"),
          sql`${auditEvents.payload} -> 'outcome' ->> 'source' = 'full_access'`,
        ),
      );
    expect(rows).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          bot: FULL,
          tool: "mcp/gmail/send_email",
          effect: "write",
          outcome: expect.objectContaining({
            behaviour: "allow",
            source: "full_access",
          }),
        }),
      }),
    );
    // What the person is shown afterwards: the member, the tool and the place, never the arguments.
    const shown = await fullAccess.recent(owner);
    expect(shown[0]).toMatchObject({
      bot: FULL,
      tool: "mcp/gmail/send_email",
      scope: "gmail",
    });
    expect(JSON.stringify(shown)).not.toContain("sam@example.com");
  });

  test("it covers payments and deleting, the actions that always asked", async () => {
    const paying = candidate({
      toolRef: "computer_click",
      scope: "shop.example",
      args: { element: "Pay now" },
    });
    await expect(service.gate(paying)).resolves.toBeUndefined();
    const buying = candidate({
      toolRef: "mcp/shop/checkout",
      args: { cart: "c1", card: "on file" },
    });
    await expect(service.gate(buying)).resolves.toBeUndefined();
    const deleting = candidate({
      toolRef: "mcp/drive/delete_file",
      scope: "drive",
      args: { id: "f1" },
    });
    await expect(service.gate(deleting)).resolves.toBeUndefined();
  });

  test("credentials and security settings are still handed to the person", async () => {
    const password = candidate({
      toolRef: "computer_type",
      scope: "bank.example",
      args: { text: "change my account password to hunter2" },
    });
    expect(await suspends(service.gate(password))).toBeTrue();
    const [handed] = await requestsFor(password);
    expect(handed?.action.policy).toMatchObject({
      behaviour: "hand_off",
      source: "safety",
    });
    const apiKey = candidate({
      toolRef: "mcp/vendor/rotate",
      args: { target: "api key" },
    });
    expect(await suspends(service.gate(apiKey))).toBeTrue();
    const sharing = candidate({
      toolRef: "mcp/drive/update",
      scope: "drive",
      args: { change: "make public" },
    });
    expect(await suspends(service.gate(sharing))).toBeTrue();
    const [security] = await requestsFor(sharing);
    expect(security?.action.policy).toMatchObject({
      behaviour: "hand_off",
      source: "safety",
    });
  });

  test("a read leaves nothing on the trail", async () => {
    const countBefore = (await fullAccess.recent(owner, 100)).length;
    const read = candidate({ toolRef: "mcp/gmail/search", effect: "read" });
    await expect(service.gate(read)).resolves.toBeUndefined();
    expect((await fullAccess.recent(owner, 100)).length).toBe(countBefore);
  });

  test("it is per member: another member of the same person still asks", async () => {
    const send = candidate({ botId: NORMAL });
    expect(await suspends(service.gate(send))).toBeTrue();
  });

  test("it is per person: the same member, for another person, still asks", async () => {
    const send = candidate({ actorId: other });
    expect(await suspends(service.gate(send))).toBeTrue();
  });

  test("it applies to the person's own turn, and to the app's own computer calls", async () => {
    await expect(
      service.gate(candidate({}, { initiator: { kind: "person" } })),
    ).resolves.toBeUndefined();
  });

  // Whose own account the card is for: a routine's and a trigger's write asks on the server's own
  // account (D35, `always_ask`), the others on the person's "ask before making changes" (`default`).
  for (const [initiator, source] of [
    [{ kind: "routine", id: "r1" }, "always_ask"],
    [{ kind: "responsibility", id: "check-in" }, "always_ask"],
    [{ kind: "memory", id: "m1" }, "default"],
    [{ kind: "deployment" }, "default"],
  ] as [AuditInitiator, "always_ask" | "default"][]) {
    test(`it never applies unattended: a ${initiator.kind} still asks`, async () => {
      const send = candidate({}, { initiator });
      expect(await suspends(service.gate(send))).toBeTrue();
      const [asked] = await requestsFor(send);
      expect(asked?.action.policy?.source).toBe(source);
    });
  }

  test("a hop that is not the person's own typed request asks, however the loader fails", async () => {
    const hop: AuditInitiator = {
      kind: "handoff",
      id: "iris",
      origin: { kind: "person" },
    };
    handedAnswer = null;
    expect(
      await suspends(service.gate(candidate({}, { initiator: hop }))),
    ).toBeTrue();
    handedFails = true;
    expect(
      await suspends(service.gate(candidate({}, { initiator: hop }))),
    ).toBeTrue();
    handedFails = false;
  });

  test("a hop the server traces to the person's own message applies it, to the receiver only", async () => {
    const hop: AuditInitiator = {
      kind: "handoff",
      id: "iris",
      origin: { kind: "person" },
    };
    handedAnswer = { threadId: "origin", message: { id: "m", role: "user" } };
    handedAsked.length = 0;
    await expect(
      service.gate(candidate({}, { initiator: hop })),
    ).resolves.toBeUndefined();
    expect(handedAsked).toEqual([
      { assertion: "signed-assertion", botId: FULL, actorId: owner },
    ]);
    // The member that was handed the work is gated on its own switch: a normal member asks, and the
    // loader is not even consulted for it.
    expect(
      await suspends(
        service.gate(candidate({ botId: NORMAL }, { initiator: hop })),
      ),
    ).toBeTrue();
    expect(handedAsked).toHaveLength(1);
    handedAnswer = null;
  });

  test("a team rule that asks still wins; the person's own rules and 'ask before changes' do not", async () => {
    const locked = await service.createTeamRule(admin, {
      botId: FULL,
      toolRef: "mcp/crm/*",
      effect: "write",
      scope: "*",
      behaviour: "ask",
    });
    teamRuleIds.push(locked.id);
    const guarded = candidate({ toolRef: "mcp/crm/update", scope: "crm" });
    expect(await suspends(service.gate(guarded))).toBeTrue();
    const [asked] = await requestsFor(guarded);
    expect(asked?.action.policy?.source).toBe("team_rule");
    await service.revokeTeamRule(admin, locked.id);

    const own = await service.createRule(owner, {
      botId: FULL,
      toolRef: "mcp/crm/*",
      effect: "*",
      scope: "*",
      behaviour: "hand_off",
    });
    const update = () => candidate({ toolRef: "mcp/crm/update", scope: "crm" });
    await expect(service.gate(update())).resolves.toBeUndefined();
    // Without Full access the same personal rule hands the action to the person.
    await off(FULL);
    const handed = update();
    expect(await suspends(service.gate(handed))).toBeTrue();
    const [asked2] = await requestsFor(handed);
    expect(asked2?.action.policy).toMatchObject({
      behaviour: "hand_off",
      source: "personal_rule",
    });
    await on(FULL);
    await service.revoke(owner, own.id);
  });

  test("the person's earlier 'no' in a conversation still stands", async () => {
    await off(FULL);
    const first = candidate({}, { threadId: `${prefix}-declined` });
    expect(await suspends(service.gate(first))).toBeTrue();
    const [asked] = await requestsFor(first);
    await service.decide(owner, asked?.id as string, "deny");
    await on(FULL);
    await expect(
      service.gate(candidate({}, { threadId: `${prefix}-declined` })),
    ).rejects.toThrow(DECLINED_BY_PERSON);
  });
});

describe("turning it off", () => {
  test("is immediate: the very next action asks", async () => {
    await on(FULL);
    await expect(service.gate(candidate())).resolves.toBeUndefined();
    await off(FULL);
    expect(await fullAccess.list(owner)).toEqual({});
    expect(await suspends(service.gate(candidate()))).toBeTrue();
  });
});

describe("the setting", () => {
  test("is kept in the person's preferences beside what else is there, and audited", async () => {
    await database
      .update(users)
      .set({ preferences: sql`'{"freeduetTeam":{"conversations":{}}}'::jsonb` })
      .where(eq(users.id, other));
    const saved = await on(NORMAL, other);
    expect(Object.keys(saved)).toEqual([NORMAL]);
    const [row] = await database
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, other));
    expect(row?.preferences).toMatchObject({
      freeduetTeam: { conversations: {} },
      [FULL_ACCESS_PREFERENCE]: { [NORMAL]: { since: expect.any(String) } },
    });
    const trail = await database
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.actorUserId, other),
          eq(auditEvents.eventType, "configuration.changed"),
          eq(auditEvents.targetType, "full_access"),
        ),
      );
    expect(trail).toContainEqual(
      expect.objectContaining({
        targetId: NORMAL,
        payload: { change: "full_access_on", bot: NORMAL },
      }),
    );
    await off(NORMAL, other);
    const [after] = await database
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, other));
    expect(after?.preferences).toMatchObject({
      freeduetTeam: { conversations: {} },
      [FULL_ACCESS_PREFERENCE]: {},
    });
  });

  test("turning it on for a member the person cannot open is refused; turning one off never is", async () => {
    await expect(on(GHOST)).rejects.toThrow("not one of yours");
    await expect(on("")).rejects.toThrow("Choose one of your members");
    await expect(off(GHOST)).resolves.toEqual({});
    expect(await fullAccess.list(owner)).toEqual({});
  });
});

describe("the connector's send check", () => {
  const share = (over: { botId?: string; initiator?: AuditInitiator } = {}) => {
    const c = candidate({ botId: over.botId ?? FULL }, over);
    return {
      ownerUserId: owner,
      botId: over.botId ?? FULL,
      audience: {
        kind: "external" as const,
        id: "ana@example.com",
        recipientUserIds: [],
      },
      content: "Good morning, Ana.",
      origin: { kind: "unknown" as const },
      askEveryTime: true as const,
      ...(c.continuation ? { continuation: c.continuation } : {}),
    };
  };
  const check = withFullAccess(
    createPrivateShareCheck({ approvals: store }),
    fullAccess,
  );

  test("a new email is asked about every time, unless that member has Full access in the person's turn", async () => {
    const asked = await check(share({ botId: NORMAL }));
    expect(asked.status).toBe("pending");
    await on(FULL);
    expect(await check(share())).toMatchObject({
      status: "allowed",
      byPerson: true,
    });
    // Unattended, the same member is asked.
    const routine = await check(
      share({ initiator: { kind: "routine", id: "r1" } }),
    );
    expect(routine.status).toBe("pending");
    await off(FULL);
    expect((await check(share())).status).toBe("pending");
  });
});

describe("only the person can change it", () => {
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
  const put = (
    id: string | null,
    bot: string,
    body: unknown,
    path = "/api/approvals/full-access",
  ) =>
    app(id).request(`${path}/${encodeURIComponent(bot)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("without a session nothing is read or written", async () => {
    expect((await app(null).request("/api/approvals/full-access")).status).toBe(
      401,
    );
    expect(
      (await put(null, FULL, { enabled: true, confirm: true })).status,
    ).toBe(401);
    expect(await fullAccess.list(owner)).toEqual({});
  });

  test("turning it on needs the person's confirm; turning it off does not", async () => {
    expect((await put(owner, FULL, { enabled: true })).status).toBe(400);
    expect(await fullAccess.list(owner)).toEqual({});
    const turnedOn = await put(owner, FULL, { enabled: true, confirm: true });
    expect(turnedOn.status).toBe(200);
    expect(Object.keys(await fullAccess.list(owner))).toEqual([FULL]);
    expect((await put(owner, FULL, { enabled: false })).status).toBe(200);
    expect(await fullAccess.list(owner)).toEqual({});
  });

  test("a body with anything else in it is refused", async () => {
    for (const body of [
      { enabled: true, confirm: true, routines: true },
      { enabled: "yes", confirm: true },
      {},
    ])
      expect((await put(owner, FULL, body)).status).toBe(400);
    expect(
      (await put(owner, GHOST, { enabled: true, confirm: true })).status,
    ).toBe(400);
    expect(await fullAccess.list(owner)).toEqual({});
  });

  test("one person's request never reaches another person's setting", async () => {
    await put(other, FULL, { enabled: true, confirm: true });
    expect(await fullAccess.list(owner)).toEqual({});
    expect(Object.keys(await fullAccess.list(other))).toEqual([FULL]);
    const read = await app(owner).request("/api/approvals/full-access");
    expect((await read.json()).bots).toEqual({});
    await off(FULL, other);
  });

  test("the other settings routes refuse the key, so nothing else can write it", async () => {
    const preferences = await app(owner).request("/api/approvals/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullAccess: true }),
    });
    expect(preferences.status).toBe(400);
    const generic = new Hono();
    generic.route(
      "/api/preferences",
      userPreferencesRoutes(
        session(owner),
        createUserPreferencesStore(database),
      ),
    );
    const patched = await generic.request("/api/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        [FULL_ACCESS_PREFERENCE]: { [FULL]: { since: "x" } },
      }),
    });
    expect(patched.status).toBe(400);
    expect(await fullAccess.list(owner)).toEqual({});
  });

  test("in the source, only the person's route writes the setting and only one module names it", () => {
    const root = new URL("../src", import.meta.url).pathname;
    const files = sourceFiles(root, [".ts"]).map((file) => ({
      file: file.slice(root.length + 1),
      text: stripComments(readFileSync(file, "utf8")),
    }));
    const naming = files
      .filter(({ text }) => text.includes(FULL_ACCESS_PREFERENCE))
      .map(({ file }) => file);
    expect(naming).toEqual(["freeduet/full-access.ts"]);
    // The writer is called from one place.
    const writers = files
      .filter(({ text }) => /fullAccess\??\.set\(/.test(text))
      .map(({ file }) => file);
    expect(writers).toEqual(["freeduet/full-access-routes.ts"]);
    // Nothing a member runs, and no unattended work, so much as imports the module.
    const importing = files
      .filter(({ text }) => /freeduet\/full-access(?!-routes)["']/.test(text))
      .map(({ file }) => file);
    expect(importing).toEqual([
      "approvals/service.ts",
      "approvals/wiring.ts",
      "index.ts",
    ]);
  });
});
