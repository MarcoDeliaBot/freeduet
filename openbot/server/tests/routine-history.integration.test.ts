import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { createAgentProfileStore } from "../src/agents/profile-store";
import type { AgentActor } from "../src/agents/profile-types";
import type { AppVariables } from "../src/auth/guards";
import { createChannelStore } from "../src/channels/routes";
import { createThreadIdentity } from "../src/channels/thread-identity";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  channels,
  intelligenceChannelMappings,
  routineRuns,
  routines,
  users,
} from "../src/db/schema";
import { createRoutineRoutes } from "../src/routines/routes";
import { createRoutineStore } from "../src/routines/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/*
 * The calendar's and the history's read side, on real rows. Every read is owner-guarded in the store, so
 * a stranger's routines and runs must be absent, not filtered out afterwards: the HTTP cases below go
 * through the real routes and the real store with two different people.
 */

const databaseUrl = testDatabaseUrl();
const database = createDatabase(databaseUrl, TEST_POOL);
const profileStore = createAgentProfileStore(
  database,
  new URL("https://managed.example.test/ag-ui"),
);
const channelStore = createChannelStore(
  database,
  profileStore,
  createThreadIdentity("test-deployment"),
);
const store = createRoutineStore(database);

const testPrefix = `routine-history-${randomUUID()}`;
const createdUserIds: string[] = [];
const createdAgentIds: string[] = [];
const createdChannelIds: string[] = [];

/** Every day at 09:00 UTC: above the floor and stable to read. */
const DAILY = "0 9 * * *";

afterEach(async () => {
  for (const userId of createdUserIds) {
    await database.delete(routines).where(eq(routines.ownerUserId, userId));
  }
  for (const channelId of createdChannelIds.splice(0)) {
    await database
      .delete(intelligenceChannelMappings)
      .where(eq(intelligenceChannelMappings.channelId, channelId));
    await database.delete(channels).where(eq(channels.id, channelId));
  }
  for (const agentId of createdAgentIds.splice(0)) {
    await database
      .delete(agentProfiles)
      .where(eq(agentProfiles.agentId, agentId));
    await database.delete(agents).where(eq(agents.id, agentId));
  }
  for (const userId of createdUserIds.splice(0)) {
    await database.delete(users).where(eq(users.id, userId));
  }
});

afterAll(async () => {
  await database.$client.close();
});

async function createUser(): Promise<AgentActor> {
  const id = `${testPrefix}-user-${randomUUID()}`;
  await database.insert(users).values({
    id,
    email: `${id}@example.test`,
    name: "Routine History Test User",
  });
  createdUserIds.push(id);
  return { id, role: "user" };
}

async function createAgent(owner: AgentActor, name: string) {
  const profile = await profileStore.create(owner, {
    name,
    title: "Operations",
    roleDescription: "Carry out what the person asks.",
    visibility: "private",
  });
  createdAgentIds.push(profile.id);
  return profile.id;
}

async function createChannel(owner: AgentActor, agentIds: string[]) {
  const channel = await channelStore.create(owner, agentIds);
  createdChannelIds.push(channel.id);
  return channel;
}

/** A person with two Bots, each with a conversation of its own, and a second person with one of each. */
async function setUp() {
  const owner = await createUser();
  const irisId = await createAgent(owner, "Iris");
  const leoId = await createAgent(owner, "Leo");
  const irisChannel = await createChannel(owner, [irisId]);
  const leoChannel = await createChannel(owner, [leoId]);
  const stranger = await createUser();
  const strangerAgent = await createAgent(stranger, "Otto");
  const strangerChannel = await createChannel(stranger, [strangerAgent]);
  return {
    owner,
    irisId,
    leoId,
    irisChannel: irisChannel.id,
    leoChannel: leoChannel.id,
    stranger,
    strangerAgent,
    strangerChannel: strangerChannel.id,
  };
}

async function setStartedAt(runId: string, iso: string) {
  await database
    .update(routineRuns)
    .set({ startedAt: new Date(iso) })
    .where(eq(routineRuns.id, runId));
}

/** The middleware the routes sit behind, reading the caller from a header so one app can serve two people. */
const requireTestUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
  context,
  next,
) => {
  const id = context.req.header("x-test-user") ?? "";
  context.set("actor", { id, email: `${id}@example.test`, role: "user" });
  await next();
};

function app() {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.route("/", createRoutineRoutes(store, requireTestUser));
  return routes;
}

describe("the calendar's and the history's owner guard, on real rows", () => {
  test("scheduleFor gives each person only their own routines, with the clock the calendar reads", async () => {
    const f = await setUp();
    const mine = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.irisId,
      channelId: f.irisChannel,
      instruction: "Summarise the inbox.",
      cron: DAILY,
    });
    await store.create({
      ownerUserId: f.stranger.id,
      agentId: f.strangerAgent,
      channelId: f.strangerChannel,
      instruction: "Check the shop.",
      cron: DAILY,
    });

    const schedules = await store.scheduleFor(f.owner.id);

    expect(schedules.map((schedule) => schedule.id)).toEqual([mine.id]);
    expect(schedules[0]).toEqual({
      id: mine.id,
      agentId: f.irisId,
      cron: DAILY,
      timezone: "UTC",
      enabled: true,
      nextRunAt: mine.nextRunAt,
    });
    expect(await store.scheduleFor(f.stranger.id)).toHaveLength(1);
  });

  test("listRunsFor gives the owner's firings newest first, each with its routine and Bot", async () => {
    const f = await setUp();
    const iris = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.irisId,
      channelId: f.irisChannel,
      instruction: "Summarise the inbox.",
      cron: DAILY,
    });
    const leo = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.leoId,
      channelId: f.leoChannel,
      instruction: "Check the stock.",
      cron: DAILY,
    });

    const first = await store.insertRun(iris.id);
    await store.finishRun(first.runId, "succeeded");
    await setStartedAt(first.runId, "2027-02-01T09:00:00.000Z");

    const second = await store.insertRun(iris.id);
    await store.finishRun(second.runId, "failed", "The model stopped early.");
    await setStartedAt(second.runId, "2027-02-02T09:00:00.000Z");

    const third = await store.insertRun(iris.id);
    await store.finishRun(third.runId, "waiting");
    await setStartedAt(third.runId, "2027-02-03T09:00:00.000Z");

    const manual = await store.startManualRun(f.owner.id, leo.id);
    await store.finishRun(manual.runId, "skipped", "The channel is gone.");
    await setStartedAt(manual.runId, "2027-02-04T09:00:00.000Z");

    const open = await store.insertRun(iris.id);
    await setStartedAt(open.runId, "2027-02-05T09:00:00.000Z");

    const history = await store.listRunsFor(f.owner.id);

    expect(
      history.map((run) => [run.id, run.status, run.agentId, run.routineId]),
    ).toEqual([
      [open.runId, null, f.irisId, iris.id],
      [manual.runId, "skipped", f.leoId, leo.id],
      [third.runId, "waiting", f.irisId, iris.id],
      [second.runId, "failed", f.irisId, iris.id],
      [first.runId, "succeeded", f.irisId, iris.id],
    ]);
    expect(history[1]?.source).toBe("run_now");
    expect(history[1]?.error).toBe("The channel is gone.");
  });

  test("a stranger sees none of the owner's runs, and no runs of their own", async () => {
    const f = await setUp();
    const iris = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.irisId,
      channelId: f.irisChannel,
      instruction: "Summarise the inbox.",
      cron: DAILY,
    });
    const run = await store.insertRun(iris.id);
    await store.finishRun(run.runId, "succeeded");

    expect(await store.listRunsFor(f.stranger.id)).toEqual([]);
  });

  test("a Bot filter is applied before the limit, so one Bot's runs are not cut short by another's", async () => {
    const f = await setUp();
    const iris = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.irisId,
      channelId: f.irisChannel,
      instruction: "Summarise the inbox.",
      cron: DAILY,
    });
    const leo = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.leoId,
      channelId: f.leoChannel,
      instruction: "Check the stock.",
      cron: DAILY,
    });
    const older = await store.insertRun(leo.id);
    await setStartedAt(older.runId, "2027-02-01T09:00:00.000Z");
    for (let index = 0; index < 3; index += 1) {
      const newer = await store.insertRun(iris.id);
      await setStartedAt(newer.runId, `2027-02-1${index + 2}T09:00:00.000Z`);
    }

    const leoOnly = await store.listRunsFor(f.owner.id, 2, f.leoId);

    expect(leoOnly.map((run) => run.id)).toEqual([older.runId]);
  });

  test("the limit is kept between one and one hundred runs, and the newest come first", async () => {
    const f = await setUp();
    const iris = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.irisId,
      channelId: f.irisChannel,
      instruction: "Summarise the inbox.",
      cron: DAILY,
    });
    for (let index = 0; index < 105; index += 1) {
      const run = await store.insertRun(iris.id);
      await setStartedAt(
        run.runId,
        new Date(Date.UTC(2027, 0, 1, 0, index)).toISOString(),
      );
    }

    expect(await store.listRunsFor(f.owner.id, 500)).toHaveLength(100);
    const three = await store.listRunsFor(f.owner.id, 3);
    expect(three.map((run) => run.startedAt.toISOString())).toEqual([
      "2027-01-01T01:44:00.000Z",
      "2027-01-01T01:43:00.000Z",
      "2027-01-01T01:42:00.000Z",
    ]);
  });
});

describe("GET /calendar and GET /runs through the real store, for two people", () => {
  test("the owner sees their switched-on routines' runs and their own history; a stranger sees nothing", async () => {
    const f = await setUp();
    const iris = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.irisId,
      channelId: f.irisChannel,
      instruction: "Summarise the inbox.",
      cron: DAILY,
    });
    const leo = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.leoId,
      channelId: f.leoChannel,
      instruction: "Check the stock.",
      cron: DAILY,
    });
    await store.setEnabled(f.owner.id, leo.id, false);
    const run = await store.insertRun(iris.id);
    await store.finishRun(run.runId, "waiting");

    const window = "from=2027-01-01T00:00:00Z&to=2027-01-03T00:00:00Z";
    const asOwner = { headers: { "x-test-user": f.owner.id } };
    const asStranger = { headers: { "x-test-user": f.stranger.id } };

    const calendarForOwner = await app().request(
      `http://openbot.test/calendar?${window}`,
      asOwner,
    );
    const calendarBody = (await calendarForOwner.json()) as {
      runs: { routineId: string; agentId: string; at: string }[];
    };
    expect(calendarForOwner.status).toBe(200);
    expect(
      calendarBody.runs.map((item) => [item.routineId, item.agentId, item.at]),
    ).toEqual([
      [iris.id, f.irisId, "2027-01-01T09:00:00.000Z"],
      [iris.id, f.irisId, "2027-01-02T09:00:00.000Z"],
    ]);

    const calendarForStranger = await app().request(
      `http://openbot.test/calendar?${window}`,
      asStranger,
    );
    expect(await calendarForStranger.json()).toEqual({
      from: "2027-01-01T00:00:00.000Z",
      to: "2027-01-03T00:00:00.000Z",
      runs: [],
      truncated: false,
    });

    const historyForOwner = await app().request(
      "http://openbot.test/runs",
      asOwner,
    );
    const historyBody = (await historyForOwner.json()) as {
      runs: { id: string; status: string; agentId: string }[];
    };
    expect(
      historyBody.runs.map((item) => [item.id, item.status, item.agentId]),
    ).toEqual([[run.runId, "waiting", f.irisId]]);

    const historyForStranger = await app().request(
      "http://openbot.test/runs",
      asStranger,
    );
    expect(await historyForStranger.json()).toEqual({ runs: [] });
  });

  test("a Bot filter on the history names only that Bot's runs", async () => {
    const f = await setUp();
    const iris = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.irisId,
      channelId: f.irisChannel,
      instruction: "Summarise the inbox.",
      cron: DAILY,
    });
    const leo = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.leoId,
      channelId: f.leoChannel,
      instruction: "Check the stock.",
      cron: DAILY,
    });
    const irisRun = await store.insertRun(iris.id);
    await store.finishRun(irisRun.runId, "succeeded");
    const leoRun = await store.insertRun(leo.id);
    await store.finishRun(leoRun.runId, "failed", "The stock file was empty.");

    const response = await app().request(
      `http://openbot.test/runs?agentId=${encodeURIComponent(f.leoId)}`,
      { headers: { "x-test-user": f.owner.id } },
    );
    const body = (await response.json()) as {
      runs: { id: string; status: string; error: string }[];
    };

    expect(body.runs.map((item) => [item.id, item.status, item.error])).toEqual(
      [[leoRun.runId, "failed", "The stock file was empty."]],
    );
  });
});
