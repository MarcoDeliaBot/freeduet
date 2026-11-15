/**
 * The problem, shown through the real app: an installation that ran with no sign-in, then turned
 * sign-in on, and a person who signs in to find nothing of theirs.
 *
 * WHAT HAPPENS TODAY. With no sign-in every request is one fixed person, `dev-local-user`
 * (`auth/dev-actor.ts`). When a provider is configured the first sign-in creates a NEW user, with a
 * new id, and everything is looked up by that id. So the conversations, the memories, the saved
 * logins, the approval rules, the Full access choices, the routines and the Bots the person made are
 * all still there, in the database, attached to a person nobody can sign in as.
 *
 * THIS FILE ASSERTS THE PROBLEM, so it passes on main and is the evidence for it. It is not a test of
 * a fix: `docs/design/single-user-to-sign-in.md` section 1 cites it, and `scripts/adopt-single-user-data.ts`
 * is the tool that fixes it on purpose. If a later change ever makes the sign-in find the data by
 * itself, this file is to be changed to say so, not worked around.
 *
 * Everything runs against a real PostgreSQL scratch database through the real `createApp`, and the
 * sign-in is the real callback exchange against a stand-in provider (tests/support/single-user-world.ts).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { count, eq, sql } from "drizzle-orm";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import {
  agentProfiles,
  composioConnections,
  routines,
  savedLogins,
  users,
  workItems,
} from "../src/db/schema";
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

let world: World;

beforeAll(async () => {
  world = await createWorld();
}, 60_000);

afterAll(async () => {
  await world.dispose();
}, 60_000);

describe("turning sign-in on for an installation that ran with none", () => {
  let before: Seen;
  let after: Seen;
  let newUserId: string;

  test("with no sign-in the person has all of it", async () => {
    const single = await world.startSingleUser();
    await seedAsSingleUser(world, single);

    before = await seenBy(single, DEV_ACTOR.id);

    // The team's two conversations and the daily review were made by the first request, and then
    // the person added the rest.
    expect(before.conversations).toHaveLength(2);
    expect(before.instructions).toBe("Always answer in two sentences.");
    expect(before.routines).toHaveLength(2);
    expect(before.rules).toBe(1);
    expect(before.questions).toBe(1);
    expect(before.fullAccessBots).toEqual([IRIS]);
    expect(before.memories).toBe(1);
    expect(before.savedLogins).toBe(1);
    expect(before.bots).toHaveLength(1);
  });

  test("the first sign-in is a different person, who finds none of it", async () => {
    const provider = world.boot({ kind: "provider" });
    const signedIn = await provider.signIn(PERSON_ADDRESS);
    expect(signedIn.status).toBe(302);

    const me = (await provider.get("/api/me", signedIn.cookie)).body as {
      user: { id: string; email: string; role: string };
    };
    // An administrator, because the address is in INITIAL_ADMIN_EMAILS, but not the person whose
    // data this is.
    expect(me.user.email).toBe(PERSON_ADDRESS);
    expect(me.user.role).toBe("admin");
    expect(me.user.id).not.toBe(DEV_ACTOR.id);
    newUserId = me.user.id;

    after = await seenBy(provider, newUserId, signedIn.cookie);

    expect(after.instructions).toBe("");
    expect(after.rules).toBe(0);
    expect(after.questions).toBe(0);
    expect(after.fullAccessBots).toEqual([]);
    expect(after.memories).toBe(0);
    expect(after.savedLogins).toBe(0);
    expect(after.bots).toEqual([]);
    // What looks like the same conversations are new ones, which the first request made for this
    // new person: not one of the old ids is among them, and the history is not there.
    expect(after.conversations).toHaveLength(2);
    for (const id of after.conversations) {
      expect(before.conversations).not.toContain(id);
    }
    // One routine: the daily review, made again, not the Friday list the person asked for.
    expect(after.routines).toHaveLength(1);
    expect(before.routines).not.toContain(after.routines[0]);
  });

  test("all of it is still in the database, attached to the person nobody can sign in as", async () => {
    const { database } = world;
    const [routineRows] = await database
      .select({ n: count() })
      .from(routines)
      .where(eq(routines.ownerUserId, DEV_ACTOR.id));
    expect(routineRows?.n).toBe(2);

    const [questionRows] = await database
      .select({ n: count() })
      .from(workItems)
      .where(sql`${workItems.payload}->>'actorId' = ${DEV_ACTOR.id}`);
    expect(questionRows?.n).toBe(1);

    const [loginRows] = await database
      .select({ n: count() })
      .from(savedLogins)
      .where(eq(savedLogins.ownerUserId, DEV_ACTOR.id));
    expect(loginRows?.n).toBe(1);

    const [connectionRows] = await database
      .select({ n: count() })
      .from(composioConnections)
      .where(eq(composioConnections.userId, DEV_ACTOR.id));
    expect(connectionRows?.n).toBe(1);

    const [botRows] = await database
      .select({ n: count() })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerUserId, DEV_ACTOR.id));
    expect(botRows?.n).toBe(1);

    // The preferences, which hold the team's mark and the Full access choice, are on the old row.
    const old = await userByEmail(database, DEV_ACTOR.email);
    expect(old?.id).toBe(DEV_ACTOR.id);
    const oldPreferences = (old?.preferences ?? {}) as Record<string, unknown>;
    expect(Object.keys(oldPreferences)).toContain("freeduetFullAccess");
    expect(Object.keys(oldPreferences)).toContain("freeduetTeam");

    // And the new person has none of that.
    const [fresh] = await database
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, newUserId));
    expect(Object.keys((fresh?.preferences ?? {}) as object)).not.toContain(
      "freeduetFullAccess",
    );
  });
});
