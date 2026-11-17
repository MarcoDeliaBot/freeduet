/**
 * The whole point of the move, through a real sign-in: after `bun scripts/adopt-single-user-data.ts
 * --to <address> --apply --yes`, the person who signs in with that address is the person whose data
 * it was, and sees all of it (docs/design/single-user-to-sign-in.md, sections 4 and 6.2).
 *
 * WHAT RUNS. A scratch PostgreSQL database that holds an installation seeded through the real app with
 * no sign-in (tests/support/single-user-world.ts); the real command moves it; then a new "server" is
 * built over the same database with a sign-in provider and a real callback exchange against a
 * stand-in provider gives a real session cookie. What the person sees is read through the app's own
 * routes and stores, the same read before and after.
 *
 * WHY THE ROW THE MOVE LEAVES HAS THE SHAPE IT HAS. The two last describes are controls. They make the
 * row the move would have to make in two wrong shapes and show the sign-in refusing the one and
 * missing the other, so a later change to the row is held to what the sign-in actually reads.
 *
 * RED ON MAIN. The command does not exist there: this file cannot even load. The problem it answers is
 * in single-user-to-sign-in-problem.test.ts, which passes on main and shows the same sign-in finding
 * none of the data.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import {
  accounts,
  agentProfiles,
  composioConnections,
  savedLogins,
  users,
} from "../src/db/schema";
import { EXIT } from "../src/freeduet/adopt/command";
import { fakeBackup, moveWhileStopped } from "./support/adopt-run";
import {
  createWorld,
  IRIS,
  PERSON_ADDRESS,
  type Seen,
  seedAsSingleUser,
  seenBy,
  userByEmail,
  type World,
} from "./support/single-user-world";

const SLOW = 120_000;

type Me = { user: { id: string; email: string; role: string } };

async function usersWithAddress(world: World, address: string) {
  const [row] = await world.database
    .select({ n: count() })
    .from(users)
    .where(sql`lower(${users.email}) = ${address.toLowerCase()}`);
  return Number(row?.n);
}

async function accountsOf(world: World, userId: string) {
  const [row] = await world.database
    .select({ n: count() })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return Number(row?.n);
}

describe("signing in after the move, the address the person gave", () => {
  let world: World;
  let before: Seen;
  let seeded: Awaited<ReturnType<typeof seedAsSingleUser>>;
  let targetId: string;
  let provider: ReturnType<World["boot"]>;
  let cookie: string;

  beforeAll(async () => {
    world = await createWorld();
    const single = await world.startSingleUser();
    seeded = await seedAsSingleUser(world, single);
    before = await seenBy(single, DEV_ACTOR.id);

    const { backup } = fakeBackup();
    const moved = await moveWhileStopped(world, { backup });
    expect(moved.err).toBe("");
    expect(moved.code).toBe(EXIT.ok);

    // The row the sign-in will find, made by the move and not yet by anybody's sign-in.
    const row = await userByEmail(world.database, PERSON_ADDRESS);
    targetId = row?.id ?? "";
    expect(targetId).not.toBe("");
    expect(targetId).not.toBe(DEV_ACTOR.id);

    provider = world.boot({ kind: "provider" });
    const signedIn = await provider.signIn(PERSON_ADDRESS);
    expect(signedIn.status).toBe(302);
    cookie = signedIn.cookie;
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  test("the first sign-in is the person the move named, an administrator as the settings say", async () => {
    const me = (await provider.get("/api/me", cookie)).body as Me;
    expect(me.user.id).toBe(targetId);
    expect(me.user.email).toBe(PERSON_ADDRESS);
    expect(me.user.role).toBe("admin");
  });

  test("and sees all of it: the same conversations, routines, rules, questions, Full access, memories, logins and Bots", async () => {
    const after = await seenBy(provider, targetId, cookie);
    expect(after).toEqual(before);

    // Spelled out, so that a `before` that had gone empty could not make this pass by agreeing with it.
    expect(after.conversations).toHaveLength(2);
    expect(after.routines).toHaveLength(1);
    expect(after.instructions).toBe("Always answer in two sentences.");
    expect(after.rules).toBe(1);
    expect(after.questions).toBe(1);
    expect(after.fullAccessBots).toEqual([IRIS]);
    expect(after.memories).toBe(1);
    expect(after.savedLogins).toBe(1);
    expect(after.bots).toEqual([seeded.myBot]);
  });

  test("the sign-in found the person and made no second one, and no second team", async () => {
    expect(await usersWithAddress(world, PERSON_ADDRESS)).toBe(1);
    // The people of this installation: the single-user person's row and this one.
    const [everyone] = await world.database.select({ n: count() }).from(users);
    expect(Number(everyone?.n)).toBe(2);
    // The sign-in linked itself to the row the move made.
    expect(await accountsOf(world, targetId)).toBe(1);
  });

  test("the connected app, the saved login and the Bot belong to the address, and none is left on the old person", async () => {
    for (const [table, column] of [
      [composioConnections, composioConnections.userId],
      [savedLogins, savedLogins.ownerUserId],
      [agentProfiles, agentProfiles.ownerUserId],
    ] as const) {
      const [now] = await world.database
        .select({ n: count() })
        .from(table)
        .where(eq(column, targetId));
      const [left] = await world.database
        .select({ n: count() })
        .from(table)
        .where(eq(column, DEV_ACTOR.id));
      expect(Number(now?.n)).toBe(1);
      expect(Number(left?.n)).toBe(0);
    }
  });

  test("somebody else who signs in is not given any of it", async () => {
    const stranger = await provider.signIn("someone.else@example.com");
    expect(stranger.status).toBe(302);
    const me = (await provider.get("/api/me", stranger.cookie)).body as Me;
    expect(me.user.email).toBe("someone.else@example.com");
    expect(me.user.id).not.toBe(targetId);
    expect(me.user.role).toBe("user");

    const seen = await seenBy(provider, me.user.id, stranger.cookie);
    expect(seen.instructions).toBe("");
    expect(seen.rules).toBe(0);
    expect(seen.questions).toBe(0);
    expect(seen.fullAccessBots).toEqual([]);
    expect(seen.memories).toBe(0);
    expect(seen.savedLogins).toBe(0);
    expect(seen.bots).toEqual([]);
    for (const id of [...seen.conversations, ...seen.routines]) {
      expect([...before.conversations, ...before.routines]).not.toContain(id);
    }
  });
});

describe("signing in BEFORE running the move: the empty account the sign-in made is filled in", () => {
  let world: World;
  let before: Seen;
  let shellId: string;
  let cookie: string;

  beforeAll(async () => {
    world = await createWorld();
    const single = await world.startSingleUser();
    await seedAsSingleUser(world, single);
    before = await seenBy(single, DEV_ACTOR.id);

    // The person turned sign-in on, signed in, and saw nothing of theirs: that is the problem, and
    // the sign-in alone made only the account, because the team is made by the first request after it.
    const first = world.boot({ kind: "provider" });
    const signedIn = await first.signIn(PERSON_ADDRESS);
    expect(signedIn.status).toBe(302);
    cookie = signedIn.cookie;
    const row = await userByEmail(world.database, PERSON_ADDRESS);
    shellId = row?.id ?? "";
    expect(shellId).not.toBe("");
    expect(row?.preferences ?? {}).toEqual({});
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  test("the move fills that account in, and the session the person already has now shows their data", async () => {
    const { backup } = fakeBackup();
    const moved = await moveWhileStopped(world, { backup });
    expect(moved.err).toBe("");
    expect(moved.code).toBe(EXIT.ok);
    expect(moved.out).toContain(
      `Done. 12 rows now belong to ${PERSON_ADDRESS}.`,
    );

    // The server started again; the cookie the person's browser kept from the first sign-in is the same.
    const server = world.boot({ kind: "provider" });
    const me = (await server.get("/api/me", cookie)).body as Me;
    expect(me.user.id).toBe(shellId);
    expect(await seenBy(server, shellId, cookie)).toEqual(before);

    expect(await usersWithAddress(world, PERSON_ADDRESS)).toBe(1);
    expect(await accountsOf(world, shellId)).toBe(1);

    // The audit event says that the account was already there, and what was done to it.
    const [event] = (await world.database.execute(
      sql`select payload from audit_events where event_type = 'person.single_user_data_adopted'`,
    )) as unknown as { payload: Record<string, unknown> | string }[];
    const payload =
      typeof event?.payload === "string"
        ? (JSON.parse(event.payload) as Record<string, unknown>)
        : (event?.payload ?? {});
    expect(payload.createdTarget).toBe(false);
    expect(payload.toId).toBe(shellId);
  });
});

describe("why the move makes the account the way it does", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  test("an account the provider's answer cannot be matched to is refused by the sign-in: not verified, no session, no link", async () => {
    const id = `pre-made-${randomUUID()}`;
    await world.database.execute(
      sql`insert into users (id, email, name, email_verified) values (${id}, ${"unverified@example.com"}, 'x', false)`,
    );
    const server = world.boot({ kind: "provider" });
    const signedIn = await server.signIn("unverified@example.com");

    // Better Auth links a provider sign-in to an existing account only when the address on the
    // account is verified. Otherwise it stops, and the person is locked out of their own data. So the
    // move sets `email_verified`, and the test of the move above is the one that depends on it.
    const me = await server.get("/api/me", signedIn.cookie);
    expect(me.status).toBe(401);
    expect(await accountsOf(world, id)).toBe(0);
    expect(await usersWithAddress(world, "unverified@example.com")).toBe(1);
  });

  test("an account with the address in capitals is not found by the sign-in, which makes a second person", async () => {
    const id = `pre-made-${randomUUID()}`;
    await world.database.execute(
      sql`insert into users (id, email, name, email_verified) values (${id}, ${"Capitals@Example.com"}, 'x', true)`,
    );
    const server = world.boot({ kind: "provider" });
    const signedIn = await server.signIn("capitals@example.com");
    expect(signedIn.status).toBe(302);
    const me = (await server.get("/api/me", signedIn.cookie)).body as Me;

    // The sign-in looks the address up in lower case, so the move writes it in lower case.
    expect(me.user.id).not.toBe(id);
    expect(await usersWithAddress(world, "capitals@example.com")).toBe(2);
    expect(await accountsOf(world, id)).toBe(0);
  });
});
