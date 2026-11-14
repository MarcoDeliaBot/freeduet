import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import type { AuditStore } from "../src/audit";
import { createComputerGateway } from "../src/computer/gateway";
import type { ActionPolicy } from "../src/computer/policy";
import {
  type EgressPolicy,
  pushEgressPolicies,
} from "../src/computer/policy-network";
import type { SnapshotResult } from "../src/computer/schema";
import { createSnapshotStore } from "../src/computer/snapshot-store";
import { createDockerSupervisorProvider } from "../src/computer/supervisor";
import { createDatabase } from "../src/db/client";
import { computerSnapshot } from "../src/db/schema";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * Two replicas and a supervisor, over Postgres, with a computer for each of two Bots that opens for
 * its own token and for no other (docs/design/per-computer-token.md).
 *
 * The snapshot a ref is resolved against crosses processes through Postgres, which is why this is a
 * database test: an action taken by one replica is followed by one from a replica that has never
 * located the Bot, and each has to reach the computer with the token it takes. The supervisor says a
 * Bot's token on `/ensure`, and on request for a computer nothing here has located, which is the case
 * after a restart and for a computer that was already running when this server started.
 *
 * The computers are records: each host answers 401 to every token but its own, and writes down what it
 * was shown, so what the server sent is a fact about what they saw.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);

const suite = randomUUID().slice(0, 8);
const ALPHA = `agent-alpha-${suite}`;
const BETA = `agent-beta-${suite}`;
const bots = [ALPHA, BETA];

const SHARED = `shared-deployment-token-${suite}`;
const PERMISSIVE: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const ACTOR = { id: "dev-local-user" };
const POLICY: EgressPolicy = { mode: "allow_all", rules: [] };

/** What the supervisor derives for each Bot; what a computer made since the change holds. */
const ownToken = (botId: string) => `own-token-of-${botId}`;
const hostOf = (botId: string) => `${botId}.computer`;
const botOf = (host: string) => host.replace(/\.computer$/, "");

const SNAPSHOT: SnapshotResult = {
  snapshotId: 7,
  url: "https://example.com/order",
  title: "Order",
  truncated: false,
  elements: [{ ref: "e9", role: "button", name: "Submit order" }],
};

/**
 * The computers the supervisor makes, and the tokens they hold now.
 *
 * `held` starts as the shared token for any Bot named in `legacy`: a computer made when every
 * computer shared one. `/ensure` replaces such a computer, as the real supervisor does at a Bot's next
 * use, and from then on it holds the token derived for it.
 */
function world(legacy: string[] = []) {
  const held = new Map<string, string>(
    legacy.map((botId) => [botId, SHARED] as [string, string]),
  );
  const supervisorCalls: string[] = [];
  const shown: { botId: string; token: string | null; path: string }[] = [];

  const supervisor = (async (input: string) => {
    const path = new URL(input).pathname;
    supervisorCalls.push(path);
    const ensure = /^\/computers\/([^/]+)\/ensure$/.exec(path);
    if (ensure) {
      const botId = decodeURIComponent(ensure[1] as string);
      held.set(botId, ownToken(botId));
      return Response.json({
        botId,
        status: "running",
        url: `http://${hostOf(botId)}:4100`,
        startedAt: "2026-11-14T10:00:00.000Z",
        token: held.get(botId),
      });
    }
    const asked = /^\/computers\/([^/]+)\/token$/.exec(path);
    if (asked) {
      const botId = decodeURIComponent(asked[1] as string);
      const token = held.get(botId);
      return token
        ? Response.json({ botId, token })
        : Response.json(
            { error: "This Bot has no computer." },
            { status: 404 },
          );
    }
    return Response.json({
      computers: [...held.keys()].map((botId) => ({
        botId,
        status: "running",
        url: `http://${hostOf(botId)}:4100`,
        startedAt: "2026-11-14T10:00:00.000Z",
      })),
    });
  }) as unknown as typeof fetch;

  const computers = (async (url: string, init?: RequestInit) => {
    const target = new URL(url);
    const botId = botOf(target.hostname);
    const token = new Headers(init?.headers).get("x-openbot-computer-token");
    shown.push({ botId, token, path: target.pathname });
    // Each computer opens for the token it holds and for no other: not another Bot's, not the
    // deployment's, unless it still holds the deployment's.
    if (token === null || token !== held.get(botId)) {
      return Response.json({ error: "Not authorised." }, { status: 401 });
    }
    if (target.pathname === "/snapshot") return Response.json(SNAPSHOT);
    if (target.pathname === "/click")
      return Response.json({
        action: "click",
        url: SNAPSHOT.url,
        elapsedMs: 1,
      });
    if (target.pathname === "/egress-policy")
      return Response.json({ applied: true });
    return Response.json({ error: target.pathname }, { status: 404 });
  }) as unknown as typeof fetch;

  return { held, supervisor, computers, supervisorCalls, shown };
}

/** One server replica: its own provider and gateway, sharing only Postgres. */
function replica(w: ReturnType<typeof world>) {
  const store: AuditStore = { insert: async () => {} };
  const provider = createDockerSupervisorProvider({
    baseUrl: "http://supervisor:4300",
    token: "supervisor-secret",
    fetchImpl: w.supervisor,
  });
  const gateway = createComputerGateway({
    provider,
    fetchImpl: w.computers,
    auditStore: store,
    policy: () => PERMISSIVE,
    snapshots: createSnapshotStore(database),
    // The deployment's own token: configured, and never presented to a Bot's computer.
    token: SHARED,
  });
  return { provider, gateway };
}

const clean = () =>
  database
    .delete(computerSnapshot)
    .where(inArray(computerSnapshot.computerId, bots));

beforeAll(clean);
afterAll(async () => {
  await clean();
  await database.$client.close();
});

describe("two Bots' computers, each opening for its own token", () => {
  test("a replica reaches each with that computer's token, a cold replica does too, and the deployment's is shown to neither", async () => {
    const w = world();
    const a = replica(w);

    for (const bot of bots) await a.gateway.snapshot(bot);
    // The snapshots are in Postgres, written by the first replica.
    const stored = await database
      .select({ id: computerSnapshot.computerId })
      .from(computerSnapshot)
      .where(inArray(computerSnapshot.computerId, bots));
    expect(stored.map((row) => row.id).sort()).toEqual([...bots].sort());

    // Another replica, which has never located either Bot, acts on both.
    const b = replica(w);
    for (const bot of bots) {
      expect(
        await b.gateway.click(bot, ACTOR, { ref: "e9", snapshotId: 7 }),
      ).toMatchObject({ action: "click" });
    }

    for (const bot of bots) {
      const seen = w.shown.filter((request) => request.botId === bot);
      expect(seen.length).toBeGreaterThanOrEqual(2);
      expect(new Set(seen.map((request) => request.token))).toEqual(
        new Set([ownToken(bot)]),
      );
    }
    expect(JSON.stringify(w.shown)).not.toContain(SHARED);
    // And the supervisor was never asked for a token: every action's `/ensure` said it.
    expect(w.supervisorCalls.filter((path) => path.endsWith("/token"))).toEqual(
      [],
    );
  });

  test("a computer's own token does not open the other's, so a refusal here is the computer's doing", async () => {
    const w = world();
    const a = replica(w);
    await a.gateway.snapshot(ALPHA);
    await a.gateway.snapshot(BETA);

    // What a prompt-injected shell in alpha's computer would do with the token it can read: show it to
    // beta's computer. Refused, which is the property this whole change exists for.
    const attempt = await w.computers(`http://${hostOf(BETA)}:4100/snapshot`, {
      headers: { "x-openbot-computer-token": ownToken(ALPHA) },
    });
    expect(attempt.status).toBe(401);
    const withShared = await w.computers(
      `http://${hostOf(BETA)}:4100/snapshot`,
      {
        headers: { "x-openbot-computer-token": SHARED },
      },
    );
    expect(withShared.status).toBe(401);
  });
});

describe("a computer made before each Bot had a token of its own", () => {
  test("is asked of the supervisor once, remembered, and then replaced at the Bot's next use with the token it now holds", async () => {
    const w = world([ALPHA]);
    const a = replica(w);

    // The policy push to every running computer reaches alpha before any action does. Its token is
    // not known here, so the supervisor is asked, once, and answers what the container holds.
    const first = await pushEgressPolicies({
      provider: a.provider,
      policyForBot: async () => POLICY,
      fetchImpl: w.computers,
    });
    expect(first).toEqual({ pushed: [ALPHA], failed: [] });
    await pushEgressPolicies({
      provider: a.provider,
      policyForBot: async () => POLICY,
      fetchImpl: w.computers,
    });
    expect(w.supervisorCalls.filter((path) => path.endsWith("/token"))).toEqual(
      [`/computers/${ALPHA}/token`],
    );
    // It took the token the old computer holds, because that is the one it opens for.
    expect(w.shown.map((request) => request.token)).toEqual([SHARED, SHARED]);

    // The Bot is used. The supervisor replaces the computer, and the server presents the new token.
    w.shown.length = 0;
    await a.gateway.snapshot(ALPHA);
    expect(w.held.get(ALPHA)).toBe(ownToken(ALPHA));
    expect(w.shown.map((request) => request.token)).toEqual([ownToken(ALPHA)]);

    // And the next push uses what the `/ensure` said, with no second question.
    w.shown.length = 0;
    const callsBefore = w.supervisorCalls.length;
    await pushEgressPolicies({
      provider: a.provider,
      policyForBot: async () => POLICY,
      fetchImpl: w.computers,
    });
    expect(w.shown.map((request) => request.token)).toEqual([ownToken(ALPHA)]);
    expect(
      w.supervisorCalls
        .slice(callsBefore)
        .filter((path) => path.endsWith("/token")),
    ).toEqual([]);
  });
});
