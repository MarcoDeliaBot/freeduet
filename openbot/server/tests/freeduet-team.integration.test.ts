/**
 * FreeDuet's team wiring against PostgreSQL: the hub grants (D14), each person's private
 * conversations with the members (#25) and Iris's daily review (D17).
 *
 * Real database rather than fakes, because the properties worth checking belong to it: that a grant
 * read through the plugin store lets one hop through and refuses another, that a conversation is
 * reachable only through its membership row, and that two first requests arriving together make one
 * set of conversations and one routine.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHandoffDesk } from "../src/agents/handoff";
import { createAgentProfileStore } from "../src/agents/profile-store";
import type { AgentActor } from "../src/agents/profile-types";
import { createAuditStore } from "../src/audit";
import { createChannelStore } from "../src/channels/routes";
import { createThreadIdentity } from "../src/channels/thread-identity";
import { createDatabase, type Database } from "../src/db/client";
import {
  agentProfiles,
  agents,
  channelAgents,
  channelMemberships,
  channels,
  pluginGrants,
  routines,
  users,
  workItems,
} from "../src/db/schema";
import {
  applyFreeDuetPackage,
  FREEDUET_GRANT,
  seedHubGrants,
} from "../src/freeduet/hub-grants";
import {
  createPersonTeam,
  DAILY_REVIEW_CRON,
  DAILY_REVIEW_INSTRUCTION,
  readTeamMark,
  TEAM_PREFERENCE,
  teamOnboarding,
} from "../src/freeduet/person-team";
import { createOnboardingStore } from "../src/people/onboarding";
import { createPluginStore } from "../src/plugins/store";
import { createRoutineStore } from "../src/routines/store";
import type { TenantPackage } from "../src/tenant-package";
import { createWorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { stubBroker } from "./support/stub-broker";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);

// Iris is the member whose id is the tenant id, as in FreeDuet's own package.
const IRIS = `fd-iris-${suite}`;
const PENNY = `fd-penny-${suite}`;
const OTTO = `fd-otto-${suite}`;
const MEMBERS = [IRIS, PENNY, OTTO];
const HOP_ACTOR = `fd-hop-actor-${suite}`;

const people = {
  alice: `fd-alice-${suite}`,
  bob: `fd-bob-${suite}`,
  carol: `fd-carol-${suite}`,
  dan: `fd-dan-${suite}`,
  erin: `fd-erin-${suite}`,
} as const;
const PEOPLE = Object.values(people);

function member(id: string, name: string): TenantPackage["agents"][number] {
  return {
    id,
    name,
    title: name,
    roleDescription: name,
    type: "built_in",
    configuration: { systemPrompt: "Help." },
    skills: [],
  };
}

const CHANNELS: TenantPackage["channels"] = [
  {
    id: `${suite}-main`,
    name: "FreeDuet",
    description:
      "Talk to Iris. She hands work to the team and brings the results back.",
    permittedAgents: [IRIS],
    allowedGroups: ["all"],
  },
  {
    id: `${suite}-books`,
    name: "Invoices & bills",
    description:
      "Penny drafts invoices, tracks who owes what and keeps the ledger.",
    permittedAgents: [PENNY],
    allowedGroups: ["all"],
  },
  {
    id: `${suite}-inbox`,
    name: "Inbox",
    description: "Otto sorts your mail and drafts the replies that matter.",
    permittedAgents: [OTTO],
    allowedGroups: ["all"],
  },
];

const tenantPackage = {
  tenantId: IRIS,
  agents: [
    member(IRIS, `Iris ${suite}`),
    member(PENNY, `Penny ${suite}`),
    member(OTTO, `Otto ${suite}`),
  ],
  channels: CHANNELS,
};

// A grant between Bots never reaches a connected app; any broker call throws and fails the test.
const { broker } = stubBroker({ grantIsLocal: true, authorizations: null });

const auditStore = createAuditStore(database);
const pluginStore = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore,
  // A grant between Bots holds no secret, so the vault is never reached.
  credentials: {} as never,
  encryptionKey: "x".repeat(44),
  policy: () => ({ mode: "enforce", deny: [], allow: ["true"] }),
  broker,
});

// Wired the way index.ts wires the desk: `mayAddress` is the plugin store's grant read, failing closed.
const desk = createHandoffDesk({
  queue: createWorkQueue(database),
  profiles: createAgentProfileStore(database, undefined),
  actorFor: async (id: string) => ({ id, role: "user" as const }),
  mayAddress: async (fromBotId, toBotId) =>
    (
      await pluginStore.botsReachableFrom(fromBotId).catch(() => [] as string[])
    ).includes(toBotId),
  auditStore,
  caps: { maxDepth: 1, maxPerRun: 3 },
});

let hop = 0;
const hand = (from: string, to: string) =>
  desk.send({
    from: {
      botId: from,
      actorId: HOP_ACTOR,
      runId: `run-${suite}-${++hop}`,
      threadId: `thread-${suite}`,
      depth: 0,
    },
    target: to,
    envelope: { task: "have a look" },
  });

const actorFor = async (id: string): Promise<AgentActor> => ({
  id,
  role: "user",
});

/**
 * Holds every pass that reaches the routine check until a second one arrives, or 500 ms pass.
 *
 * Without it the race this file is about is a matter of timing: the routine check only goes wrong
 * when two passes read "no routine" before either has made one. Here both would, unless the
 * person's lock keeps the second out until the first has written its mark.
 */
function meetAtRoutineCheck() {
  let arrived = 0;
  let release: () => void = () => undefined;
  const bothHere = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= 2) release();
    await Promise.race([bothHere, Bun.sleep(500)]);
  };
}

/** One replica's stores, on its own connection pool. */
function replica(
  handle: Database,
  beforeRoutineCheck?: () => Promise<void>,
  teamPackage: typeof tenantPackage = tenantPackage,
) {
  const channelStore = createChannelStore(
    handle,
    createAgentProfileStore(handle, undefined),
    createThreadIdentity("test-deployment"),
  );
  const routineStore = createRoutineStore(handle);
  return {
    channelStore,
    routineStore,
    /** A fresh team, as a server process starting up would build it. */
    team: () =>
      createPersonTeam({
        database: handle,
        channels: channelStore,
        routines: {
          create: (input) => routineStore.create(input),
          listFor: async (ownerUserId) => {
            await beforeRoutineCheck?.();
            return routineStore.listFor(ownerUserId);
          },
        },
        actorFor,
        tenantPackage: teamPackage,
      }),
  };
}

const here = replica(database);
const extraPools: Database[] = [];

/** The grants among this suite's members, as `holder>target` with who made them. */
async function grantsNow() {
  const rows = await database
    .select({
      agentId: pluginGrants.agentId,
      ref: pluginGrants.ref,
      grantedBy: pluginGrants.grantedBy,
      grantedAt: pluginGrants.grantedAt,
    })
    .from(pluginGrants)
    .where(
      and(eq(pluginGrants.kind, "bot"), inArray(pluginGrants.agentId, MEMBERS)),
    );
  return rows
    .map((row) => ({
      pair: `${row.agentId}>${row.ref}`,
      by: row.grantedBy,
      at: row.grantedAt.toISOString(),
    }))
    .sort((a, b) => a.pair.localeCompare(b.pair));
}

/** A person's live conversations, with the members in each and everybody who belongs to it. */
async function conversationsOf(userId: string) {
  const rows = await database
    .select({
      id: channels.id,
      name: channels.name,
      description: channels.description,
      packageId: channels.packageId,
    })
    .from(channels)
    .innerJoin(
      channelMemberships,
      and(
        eq(channelMemberships.channelId, channels.id),
        eq(channelMemberships.userId, userId),
      ),
    )
    .where(isNull(channels.deletedAt));
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      agentIds: (
        await database
          .select({ agentId: channelAgents.agentId })
          .from(channelAgents)
          .where(eq(channelAgents.channelId, row.id))
      ).map((agent) => agent.agentId),
      members: (
        await database
          .select({ userId: channelMemberships.userId })
          .from(channelMemberships)
          .where(eq(channelMemberships.channelId, row.id))
      ).map((membership) => membership.userId),
    })),
  );
}

async function routinesOf(userId: string) {
  return database
    .select()
    .from(routines)
    .where(eq(routines.ownerUserId, userId));
}

async function markOf(userId: string) {
  const [row] = await database
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId));
  const preferences = (row?.preferences ?? {}) as Record<string, unknown>;
  return { preferences, mark: readTeamMark(preferences[TEAM_PREFERENCE]) };
}

async function clean() {
  const owned = await database
    .select({ id: channelMemberships.channelId })
    .from(channelMemberships)
    .where(inArray(channelMemberships.userId, PEOPLE));
  if (owned.length > 0)
    await database.delete(channels).where(
      inArray(
        channels.id,
        owned.map((row) => row.id),
      ),
    );
  await database
    .delete(workItems)
    .where(sql`${workItems.payload}->>'actorId' = ${HOP_ACTOR}`);
  await database.delete(users).where(inArray(users.id, PEOPLE));
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.agentId, MEMBERS));
  await database
    .delete(agentProfiles)
    .where(inArray(agentProfiles.agentId, MEMBERS));
  await database.delete(agents).where(inArray(agents.id, MEMBERS));
}

beforeAll(async () => {
  await clean();
  for (const agent of tenantPackage.agents) {
    await database.insert(agents).values({
      id: agent.id,
      name: agent.name,
      type: "built_in",
      configuration: { systemPrompt: "Help." },
    });
    await database.insert(agentProfiles).values({
      agentId: agent.id,
      title: agent.title,
      roleDescription: agent.roleDescription,
      avatarSeed: agent.id,
      visibility: "public",
    });
  }
  await database.insert(users).values(
    PEOPLE.map((id) => ({
      id,
      email: `${id}@example.test`,
      // A preference of the person's own, which the mark must not disturb.
      preferences: { messageListEmphasis: "agent" as const },
    })),
  );
});

afterAll(async () => {
  await clean();
  for (const pool of extraPools) await pool.$client.end({ timeout: 5 });
  await database.$client.end({ timeout: 5 });
});

describe("hub grants (D14)", () => {
  test("Iris may address each member and each member Iris; a member may not address another", async () => {
    await seedHubGrants(database, tenantPackage);

    expect(await grantsNow()).toEqual(
      [
        `${IRIS}>${OTTO}`,
        `${IRIS}>${PENNY}`,
        `${OTTO}>${IRIS}`,
        `${PENNY}>${IRIS}`,
      ]
        .sort()
        .map((pair) => ({
          pair,
          by: FREEDUET_GRANT,
          at: expect.any(String),
        })),
    );

    expect(await hand(IRIS, PENNY)).toMatchObject({ ok: true, to: PENNY });
    expect(await hand(PENNY, IRIS)).toMatchObject({ ok: true, to: IRIS });
    const refused = await hand(PENNY, OTTO);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.refusal).toContain(
      "You have not been given",
    );
  });

  test("a second sync changes nothing", async () => {
    const before = await grantsNow();
    expect(await seedHubGrants(database, tenantPackage)).toEqual({
      added: 0,
      removed: 0,
    });
    expect(await grantsNow()).toEqual(before);
  });

  test("a grant an admin made by hand is never touched", async () => {
    // Member to member, which the hub never grants, and a pair the hub also wants, re-granted by hand.
    await pluginStore.grant("bot", OTTO, PENNY, "admin-1");
    await pluginStore.grant("bot", PENNY, IRIS, "admin-1");

    await seedHubGrants(database, tenantPackage);

    const now = await grantsNow();
    expect(now).toContainEqual({
      pair: `${PENNY}>${OTTO}`,
      by: "admin-1",
      at: expect.any(String),
    });
    expect(now).toContainEqual({
      pair: `${IRIS}>${PENNY}`,
      by: "admin-1",
      at: expect.any(String),
    });
    expect(await hand(PENNY, OTTO)).toMatchObject({ ok: true, to: OTTO });
  });

  test("a member taken out of the package loses the hub's grants, and only those", async () => {
    await seedHubGrants(database, {
      tenantId: IRIS,
      agents: tenantPackage.agents.filter((agent) => agent.id !== OTTO),
    });

    expect((await grantsNow()).map(({ pair, by }) => ({ pair, by }))).toEqual(
      [
        { pair: `${IRIS}>${PENNY}`, by: "admin-1" },
        { pair: `${PENNY}>${IRIS}`, by: FREEDUET_GRANT },
        { pair: `${PENNY}>${OTTO}`, by: "admin-1" },
      ].sort((a, b) => a.pair.localeCompare(b.pair)),
    );
  });

  test("a package that is not FreeDuet's is left alone", async () => {
    await database
      .delete(pluginGrants)
      .where(inArray(pluginGrants.agentId, MEMBERS));
    // This suite's tenant id is not "freeduet", so the boot-time call does nothing.
    await applyFreeDuetPackage(database, tenantPackage);
    expect(await grantsNow()).toEqual([]);
  });
});

describe("each person's conversations (#25) and daily review (D17)", () => {
  let mine: Awaited<ReturnType<typeof conversationsOf>> = [];

  test("on the first /api/me, one private conversation per package channel, named from channels.yaml", async () => {
    const onboarding = teamOnboarding(
      createOnboardingStore(database),
      here.team(),
    );
    expect(await onboarding.status(people.alice)).toEqual({
      step: 0,
      completedAt: null,
    });

    mine = await conversationsOf(people.alice);
    expect(
      mine
        .map(({ name, description, packageId, agentIds, members }) => ({
          name,
          description,
          packageId,
          agentIds,
          members,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual(
      CHANNELS.map((channel) => ({
        name: channel.name,
        description: channel.description,
        // Not a package channel: an ordinary conversation, reached through its membership.
        packageId: null,
        agentIds: channel.permittedAgents,
        members: [people.alice],
      })).sort((a, b) => a.name.localeCompare(b.name)),
    );

    const { preferences, mark } = await markOf(people.alice);
    expect(preferences.messageListEmphasis).toBe("agent");
    expect(Object.keys(mark.conversations).sort()).toEqual(
      CHANNELS.map((channel) => channel.id).sort(),
    );
    expect(mark.dailyReview).toEqual(expect.any(String));
  });

  test("another person can neither list nor open them", async () => {
    const bob: AgentActor = { id: people.bob, role: "user" };
    const listed = await here.channelStore.list(bob);
    const ids = listed.channels.map((channel) => channel.id);
    for (const conversation of mine) {
      expect(ids).not.toContain(conversation.id);
      expect(await here.channelStore.get(bob, conversation.id)).toBeNull();
    }
    const alice: AgentActor = { id: people.alice, role: "user" };
    expect(
      (await here.channelStore.list(alice)).channels.map(
        (channel) => channel.id,
      ),
    ).toEqual(
      expect.arrayContaining(mine.map((conversation) => conversation.id)),
    );
  });

  test("the daily review is Iris's, every morning at 08:30 Europe/Rome, in her conversation", async () => {
    const made = await routinesOf(people.alice);
    const main = mine.find((conversation) => conversation.name === "FreeDuet");
    expect(made.length).toBe(1);
    expect(made[0]).toMatchObject({
      agentId: IRIS,
      channelId: main?.id,
      instruction: DAILY_REVIEW_INSTRUCTION,
      cron: DAILY_REVIEW_CRON,
      timezone: "Europe/Rome",
      enabled: true,
    });
    expect((await markOf(people.alice)).mark.dailyReview).toBe(made[0]?.id);
  });

  test("asking again, or after a restart, makes nothing new and keeps the person's changes", async () => {
    const [routine] = await routinesOf(people.alice);
    if (!routine) throw new Error("no routine");
    await here.routineStore.update(people.alice, routine.id, {
      timezone: "America/New_York",
    });

    const team = here.team();
    await team.ensure(people.alice);
    await team.ensure(people.alice);
    await here.team().ensure(people.alice);

    expect((await conversationsOf(people.alice)).length).toBe(CHANNELS.length);
    const after = await routinesOf(people.alice);
    expect(after.map((row) => [row.id, row.timezone])).toEqual([
      [routine.id, "America/New_York"],
    ]);
  });

  test("a conversation or routine the person deleted stays deleted", async () => {
    const alice: AgentActor = { id: people.alice, role: "user" };
    const inbox = mine.find((conversation) => conversation.name === "Inbox");
    const [routine] = await routinesOf(people.alice);
    if (!inbox || !routine) throw new Error("nothing to delete");
    expect(await here.channelStore.softDelete(alice, inbox.id)).toBe(true);
    await here.routineStore.remove(people.alice, routine.id);

    await here.team().ensure(people.alice);

    const left = await conversationsOf(people.alice);
    expect(left.map((conversation) => conversation.name).sort()).toEqual([
      "FreeDuet",
      "Invoices & bills",
    ]);
    expect(await routinesOf(people.alice)).toEqual([]);
  });

  test("a conversation the person already has with a member is adopted, not doubled", async () => {
    const carol: AgentActor = { id: people.carol, role: "user" };
    // As the first-day greeting would make it, before the team was wired.
    const earlier = await here.channelStore.direct(carol, IRIS);

    await here.team().ensure(people.carol);

    const withIris = (await conversationsOf(people.carol)).filter(
      (conversation) =>
        conversation.agentIds.length === 1 && conversation.agentIds[0] === IRIS,
    );
    expect(withIris.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: earlier.id, name: "FreeDuet" },
    ]);
    expect(
      (await routinesOf(people.carol)).map((row) => row.channelId),
    ).toEqual([earlier.id]);
  });

  test("two first requests at once, on two replicas and on one, make one set", async () => {
    const meet = meetAtRoutineCheck();
    const otherPool = createDatabase(testDatabaseUrl(), TEST_POOL);
    extraPools.push(otherPool);
    const there = replica(otherPool, meet);
    const onHere = replica(database, meet).team();

    await Promise.all([
      onHere.ensure(people.dan),
      there.team().ensure(people.dan),
      onHere.ensure(people.dan),
    ]);

    const conversations = await conversationsOf(people.dan);
    expect(conversations.length).toBe(CHANNELS.length);
    expect(new Set(conversations.map((row) => row.name)).size).toBe(
      CHANNELS.length,
    );
    const made = await routinesOf(people.dan);
    expect(made.length).toBe(1);
    expect((await markOf(people.dan)).mark.dailyReview).toBe(made[0]?.id);
  });

  test("two passes that only owe the daily review make one routine", async () => {
    // Conversations made while the package had no Iris among its members, so no review yet.
    const withoutIris = {
      ...tenantPackage,
      agents: tenantPackage.agents.filter((agent) => agent.id !== IRIS),
    };
    await replica(database, undefined, withoutIris).team().ensure(people.erin);
    expect(await routinesOf(people.erin)).toEqual([]);

    // Iris joins; two replicas reach the person at once and both owe only the review.
    const meet = meetAtRoutineCheck();
    const otherPool = createDatabase(testDatabaseUrl(), TEST_POOL);
    extraPools.push(otherPool);
    await Promise.all([
      replica(database, meet).team().ensure(people.erin),
      replica(otherPool, meet).team().ensure(people.erin),
    ]);

    expect((await conversationsOf(people.erin)).length).toBe(CHANNELS.length);
    const made = await routinesOf(people.erin);
    expect(made.length).toBe(1);
    expect((await markOf(people.erin)).mark.dailyReview).toBe(made[0]?.id);
  });
});
