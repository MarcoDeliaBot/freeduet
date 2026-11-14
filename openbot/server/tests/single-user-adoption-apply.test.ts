/**
 * The move itself: what it changes, what it must never change, and that stopping it anywhere leaves
 * the database as it was (docs/design/single-user-to-sign-in.md, sections 3, 5 and 6.3 to 6.5).
 *
 * WHAT RUNS. The real command (`run`) and the real move (`applyAdoption`) against a real PostgreSQL
 * scratch database that holds an installation seeded through the real app
 * (tests/support/single-user-world.ts). The backup is stood in for where the backup is not the subject
 * (the real `pg_dump` is in single-user-adoption-backup.test.ts); the subject here is what happens
 * to the data. What the app shows after the move, to a real sign-in, is in
 * single-user-adoption-signin.test.ts.
 *
 * HOW "NOTHING CHANGED" IS SHOWN. By a digest of every row of every table (or, inside the loop that
 * stops the move at every step, of every table the move may touch), taken before and after. A test
 * that says "refused" and does not look at the data proves only the message.
 *
 * RED ON MAIN. The command does not exist there: this file cannot even load.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import { createDatabase, type Database } from "../src/db/client";
import {
  type ApplyOptions,
  applyAdoption,
  replaceExactStrings,
  tablesToLock,
} from "../src/freeduet/adopt/apply";
import {
  EXIT,
  type Options,
  shellWord,
  wayBack,
} from "../src/freeduet/adopt/command";
import { readPlan } from "../src/freeduet/adopt/plan";
import { adoptionConfig, Refusal } from "../src/freeduet/adopt/preconditions";
import { createMemoryStore } from "../src/memory/store";
import {
  type Env,
  fakeBackup,
  invoke,
  MOVE_ARGUMENTS,
  moveWhileStopped,
  type Ran,
} from "./support/adopt-run";
import {
  createWorld,
  freePort,
  IRIS,
  type Mode,
  PERSON_ADDRESS,
  seedAsSingleUser,
  snapshot,
  type World,
} from "./support/single-user-world";

const SLOW = 120_000;
const CHILD = resolve(import.meta.dir, "support", "adopt-child.ts");

async function countWhere(
  database: Database,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const [row] = (await database.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)} = ${value}`,
  )) as unknown as { n: number }[];
  return Number(row?.n);
}

/** The tables the move may write, from the registry and the live schema. */
function touchedTables(taken: Record<string, string>): string[] {
  return tablesToLock(new Set(Object.keys(taken)));
}

describe("the move, from the seeded installation to the address", () => {
  let world: World;
  let toId: string;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  test(
    "moves everything the person owns, family by family, and changes no other table",
    async () => {
      const before = await snapshot(world.database);
      const oldAuditRows = await countWhere(
        world.database,
        "audit_events",
        "actor_user_id",
        DEV_ACTOR.id,
      );
      // Full access set through the app writes to the trail, so there is something to keep.
      expect(oldAuditRows).toBeGreaterThan(0);

      const { calls, backup } = fakeBackup();
      const events: string[] = [];
      const ran = await moveWhileStopped(world, {
        backup: async (request) => {
          events.push("backup");
          return backup(request);
        },
        checkpoint: (step) => {
          if (step === "begun") events.push("begun");
        },
      });

      expect(ran.err).toBe("");
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.out).toContain(`Moving 13 rows to ${PERSON_ADDRESS}.`);
      expect(ran.out).toContain(
        `Done. 13 rows now belong to ${PERSON_ADDRESS}.`,
      );
      expect(ran.out).toContain("pg_restore --clean --if-exists");
      // The way back is made first, once, and the move starts after it.
      expect(calls).toHaveLength(1);
      expect(events).toEqual(["backup", "begun"]);

      // The account the sign-in will find: lower case, verified, the address as its name.
      const [target] = (await world.database.execute(
        sql`select id, email, name, email_verified from users where email = ${PERSON_ADDRESS}`,
      )) as unknown as {
        id: string;
        email: string;
        name: string;
        email_verified: boolean;
      }[];
      expect(target?.email_verified).toBe(true);
      expect(target?.name).toBe(PERSON_ADDRESS);
      toId = String(target?.id);
      expect(toId).not.toBe(DEV_ACTOR.id);

      // Every family the seeding made is the target's now, and the person with no sign-in has none.
      const owns = async (id: string) => ({
        instructions: await countWhere(
          world.database,
          "user_instructions",
          "user_id",
          id,
        ),
        conversations: await countWhere(
          world.database,
          "channel_memberships",
          "user_id",
          id,
        ),
        memories: await countWhere(
          world.database,
          "personal_memories",
          "owner_user_id",
          id,
        ),
        routines: await countWhere(
          world.database,
          "routines",
          "owner_user_id",
          id,
        ),
        rules: await countWhere(
          world.database,
          "approval_rules",
          "owner_user_id",
          id,
        ),
        savedLogins: await countWhere(
          world.database,
          "saved_logins",
          "owner_user_id",
          id,
        ),
        apps: await countWhere(
          world.database,
          "composio_connections",
          "user_id",
          id,
        ),
        bots: await countWhere(
          world.database,
          "agent_profiles",
          "owner_user_id",
          id,
        ),
      });
      expect(await owns(toId)).toEqual({
        instructions: 1,
        conversations: 2,
        memories: 1,
        routines: 2,
        rules: 1,
        savedLogins: 1,
        apps: 1,
        bots: 1,
      });
      expect(await owns(DEV_ACTOR.id)).toEqual({
        instructions: 0,
        conversations: 0,
        memories: 0,
        routines: 0,
        rules: 0,
        savedLogins: 0,
        apps: 0,
        bots: 0,
      });
      // The waiting question's payload names the person inside JSON, and was rewritten there.
      expect(
        (
          (await world.database.execute(
            sql`select count(*)::int as n from work_items where payload ->> 'actorId' = ${toId}`,
          )) as unknown as { n: number }[]
        )[0]?.n,
      ).toBe(1);
      expect(
        (
          (await world.database.execute(
            sql`select count(*)::int as n from work_items where payload ->> 'actorId' = ${DEV_ACTOR.id}`,
          )) as unknown as { n: number }[]
        )[0]?.n,
      ).toBe(0);

      // The profile moved with it, and the old row keeps nothing of what moved (so that the team's mark
      // does not say "made" for a person who has no conversations).
      const [movedProfile] = (await world.database.execute(
        sql`select preferences from users where id = ${toId}`,
      )) as unknown as { preferences: Record<string, unknown> | string }[];
      const preferences =
        typeof movedProfile?.preferences === "string"
          ? JSON.parse(movedProfile.preferences)
          : movedProfile?.preferences;
      expect(Object.keys(preferences ?? {})).toContain("freeduetFullAccess");
      expect(Object.keys(preferences ?? {})).toContain("freeduetTeam");
      const [oldRow] = (await world.database.execute(
        sql`select preferences, onboarding_step from users where id = ${DEV_ACTOR.id}`,
      )) as unknown as { preferences: unknown; onboarding_step: number }[];
      expect(String(JSON.stringify(oldRow?.preferences))).toBe("{}");
      expect(
        (
          (await world.database.execute(
            sql`select count(*)::int as n from users`,
          )) as unknown as {
            n: number;
          }[]
        )[0]?.n,
      ).toBe(2);

      // No table the move does not own was touched, and the trail was only added to.
      const after = await snapshot(world.database);
      const touched = new Set(touchedTables(before));
      for (const table of Object.keys(before)) {
        if (touched.has(table)) continue;
        expect([table, after[table]]).toEqual([table, before[table]]);
      }
      expect(
        await countWhere(
          world.database,
          "audit_events",
          "actor_user_id",
          DEV_ACTOR.id,
        ),
      ).toBe(oldAuditRows);
    },
    SLOW,
  );

  test(
    "says what moved in one new audit event, with the backup's name and never its path",
    async () => {
      const events = (await world.database.execute(
        sql`select actor_user_id, target_id, target_type, payload
          from audit_events where event_type = 'person.single_user_data_adopted'`,
      )) as unknown as {
        actor_user_id: string;
        target_id: string;
        target_type: string;
        payload: Record<string, unknown> | string;
      }[];
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event?.actor_user_id).toBe(toId);
      expect(event?.target_id).toBe(toId);
      expect(event?.target_type).toBe("person");
      const payload = (
        typeof event?.payload === "string"
          ? JSON.parse(event.payload)
          : event?.payload
      ) as Record<string, unknown>;
      expect(payload.toEmail).toBe(PERSON_ADDRESS);
      expect(payload.fromId).toBe(DEV_ACTOR.id);
      expect(payload.toId).toBe(toId);
      expect(payload.createdTarget).toBe(true);
      expect(payload.total).toBe(13);
      expect(payload.backup).toBe("fake.dump");
      expect(
        (payload.rows as Record<string, number>)["routines.owner_user_id"],
      ).toBe(2);
      expect(JSON.stringify(payload)).not.toContain("/nowhere");
    },
    SLOW,
  );

  test(
    "a second run finds nothing to move, says when it was moved, takes no backup and writes nothing",
    async () => {
      const before = await snapshot(world.database);
      const { calls, backup } = fakeBackup();
      const again = await moveWhileStopped(world, { backup });
      expect(again.err).toBe("");
      expect(again.code).toBe(EXIT.ok);
      expect(again.out).toContain(
        `Nothing to move: ${DEV_ACTOR.email} owns nothing now, and the data was already moved to ${PERSON_ADDRESS} on `,
      );
      expect(calls).toHaveLength(0);

      // Asked for another address, it says where the data went, and still writes nothing.
      const other = await moveWhileStopped(world, { backup }, undefined, [
        "--to",
        "someone@example.org",
        "--apply",
        "--yes",
      ]);
      expect(other.code).toBe(EXIT.ok);
      expect(other.out).toContain(`was moved to ${PERSON_ADDRESS}`);
      expect(other.out).toContain("not to someone@example.org");
      expect(calls).toHaveLength(0);
      expect(await snapshot(world.database)).toEqual(before);
    },
    SLOW,
  );
});

describe("refused before the backup, and before a single row is written", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  /** Runs the move expecting a refusal, and proves that no backup was taken and no table changed. */
  async function refusedWith(
    action: (backup: BackupBackend) => Promise<Ran>,
    expectedMessage: string,
  ) {
    const before = await snapshot(world.database);
    const { calls, backup } = fakeBackup();
    const ran = await action({ backup });
    expect(ran.code).toBe(EXIT.refused);
    expect(ran.err).toContain(expectedMessage);
    expect(calls).toHaveLength(0);
    expect(await snapshot(world.database)).toEqual(before);
  }
  type BackupBackend = { backup: Options["backup"] };

  test(
    "a wrong address: one the settings do not name as an administrator",
    async () => {
      await refusedWith(
        ({ backup }) =>
          moveWhileStopped(world, { backup }, undefined, [
            "--to",
            "someone@example.org",
            "--apply",
            "--yes",
          ]),
        "someone@example.org is not in INITIAL_ADMIN_EMAILS",
      );
    },
    SLOW,
  );

  test(
    "settings with no sign-in provider",
    async () => {
      const single: Mode = { kind: "single-user" };
      await refusedWith(
        ({ backup }) =>
          moveWhileStopped(world, { backup }, world.environment(single)),
        "No sign-in provider is configured",
      );
    },
    SLOW,
  );

  test(
    "a server that answers on its port",
    async () => {
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => Response.json({ durableHistory: true }),
      });
      try {
        await refusedWith(
          ({ backup }) =>
            moveWhileStopped(
              world,
              { backup },
              world.environment(
                { kind: "provider" },
                { PORT: String(server.port) },
              ),
            ),
          "The OpenBot server is answering on port",
        );
      } finally {
        server.stop(true);
      }
    },
    SLOW,
  );

  test(
    "anything else connected to the database",
    async () => {
      await world.database.execute(sql`select 1`);
      await refusedWith(
        ({ backup }) => invoke(MOVE_ARGUMENTS, world.environment(), { backup }),
        "using the database",
      );
    },
    SLOW,
  );

  test(
    "an approval still waiting for the person's answer",
    async () => {
      await world.database.execute(sql`
      insert into approval_requests (id, owner_user_id, run_id, tool_call_id, action_digest, action, status)
      values ('waiting', ${DEV_ACTOR.id}, 'run-1', 'call-1', 'digest', ${JSON.stringify({})}::text::jsonb, 'pending')`);
      try {
        await refusedWith(
          ({ backup }) => moveWhileStopped(world, { backup }),
          "approval request still waiting for an answer",
        );
      } finally {
        await world.database.execute(
          sql`delete from approval_requests where id = 'waiting'`,
        );
      }
    },
    SLOW,
  );

  test(
    "the backup cannot be made: nothing is moved, and the move never starts",
    async () => {
      const before = await snapshot(world.database);
      const started: string[] = [];
      const ran = await moveWhileStopped(world, {
        backup: async () => {
          throw new Refusal(
            "A backup cannot be made, so nothing was changed: no pg_dump.",
          );
        },
        checkpoint: (step) => {
          started.push(step);
        },
      });
      expect(ran.code).toBe(EXIT.refused);
      expect(ran.err).toContain("A backup cannot be made");
      expect(started).toEqual([]);
      expect(await snapshot(world.database)).toEqual(before);
    },
    SLOW,
  );
});

describe("an address that already owns the team a first sign-in makes", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  test(
    "is refused, with no backup and no change: the two people's data is never mixed",
    async () => {
      // The person signed in before running the tool, and opened the app.
      const provider = world.boot({ kind: "provider" });
      const signedIn = await provider.signIn(PERSON_ADDRESS);
      expect((await provider.get("/api/me", signedIn.cookie)).status).toBe(200);

      const before = await snapshot(world.database);
      const { calls, backup } = fakeBackup();
      const ran = await moveWhileStopped(world, { backup });
      expect(ran.code).toBe(EXIT.refused);
      expect(ran.err).toContain(`${PERSON_ADDRESS} already owns data`);
      expect(calls).toHaveLength(0);
      expect(await snapshot(world.database)).toEqual(before);
    },
    SLOW,
  );
});

describe("stopping the move, anywhere, leaves the database as it was", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  class Injected extends Error {
    constructor(readonly step: string) {
      super(`injected at ${step}`);
    }
  }

  test("an error injected after every one of its steps, one at a time, is no change at all", async () => {
    const untouched = await snapshot(world.database);
    const tables = touchedTables(untouched);
    const stoppedAt: string[] = [];
    let committedAfter = -1;

    await world.whileStopped(async () => {
      const database = createDatabase(world.url, { max: 1 });
      try {
        const config = adoptionConfig(world.environment());
        const expected = await readPlan(database, PERSON_ADDRESS);
        for (let at = 0; at < 500; at += 1) {
          let count = 0;
          const outcome = await applyAdoption(database, {
            config,
            address: PERSON_ADDRESS,
            expected,
            backupName: "test.dump",
            settleMs: 0,
            checkpoint: (step) => {
              if (count++ === at) throw new Injected(step);
            },
          }).then(
            () => "committed" as const,
            (error: unknown) => error,
          );
          if (outcome === "committed") {
            committedAfter = at;
            break;
          }
          expect(outcome).toBeInstanceOf(Injected);
          stoppedAt.push((outcome as Injected).step);
          // The digest of every table the move may write, after the transaction was abandoned.
          expect(await snapshot(database, tables)).toEqual(
            Object.fromEntries(
              tables.map((table) => [table, untouched[table]]),
            ),
          );
        }
      } finally {
        await database.$client.close();
      }
    });

    // Every step was tried: the ones that are always there, and one per column the registry moves.
    for (const step of [
      "begun",
      "serialised",
      "locked",
      "still-quiet",
      "planned",
      "target-ready",
      "moved:routines.owner_user_id",
      "moved:personal_memories.owner_user_id",
      "special:work_items.payload",
      "source-emptied",
      "verified",
      "audited",
      "quiet-at-the-end",
    ]) {
      expect(stoppedAt).toContain(step);
    }
    expect(stoppedAt.length).toBeGreaterThan(50);
    expect(committedAfter).toBe(stoppedAt.length);

    // Nothing was left behind by the failures, and the one run that was not stopped is a real move.
    expect(await snapshot(world.database, ["audit_events"])).not.toEqual({
      audit_events: untouched.audit_events,
    });
    const plan = await readPlan(world.database, PERSON_ADDRESS);
    expect(plan.total).toBe(0);
    expect(plan.earlier?.toEmail).toBe(PERSON_ADDRESS);
  }, 600_000);
});

describe("what appears while the move is under way stops it", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  /** Runs the move with `checkpoint` injected and proves that it refuses and that nothing changed. */
  async function refusedDuring(
    checkpoint: NonNullable<ApplyOptions["checkpoint"]>,
    expectedMessage: string,
    environment: Env = world.environment(),
    lockTimeoutMs = 10_000,
  ) {
    const before = await snapshot(world.database);
    const outcome = await world
      .whileStopped(async () => {
        const database = createDatabase(world.url, { max: 1 });
        try {
          return await applyAdoption(database, {
            config: adoptionConfig(environment),
            address: PERSON_ADDRESS,
            expected: await readPlan(database, PERSON_ADDRESS),
            backupName: "test.dump",
            settleMs: 0,
            lockTimeoutMs,
            checkpoint,
          });
        } finally {
          await database.$client.close();
        }
      })
      .then(
        () => "committed" as const,
        (error: unknown) => error,
      );
    expect(outcome).not.toBe("committed");
    expect(String((outcome as Error).message)).toContain(expectedMessage);
    expect(await snapshot(world.database)).toEqual(before);
  }

  test(
    "a server that begins to answer on its port before the commit",
    async () => {
      const port = freePort();
      let server: ReturnType<typeof Bun.serve> | undefined;
      try {
        await refusedDuring(
          (step) => {
            if (step === "audited") {
              server = Bun.serve({
                port,
                hostname: "127.0.0.1",
                fetch: () => Response.json({ durableHistory: true }),
              });
            }
          },
          "The OpenBot server is answering on port",
          world.environment({ kind: "provider" }, { PORT: String(port) }),
        );
      } finally {
        server?.stop(true);
      }
    },
    SLOW,
  );

  test(
    "a move that stops after the backup says where the backup is, and the command refuses",
    async () => {
      const { backup } = fakeBackup();
      const before = await snapshot(world.database);
      const port = freePort();
      let server: ReturnType<typeof Bun.serve> | undefined;
      try {
        const ran = await moveWhileStopped(
          world,
          {
            backup,
            checkpoint: (step) => {
              if (step === "audited") {
                server = Bun.serve({
                  port,
                  hostname: "127.0.0.1",
                  fetch: () => Response.json({ durableHistory: true }),
                });
              }
            },
          },
          world.environment({ kind: "provider" }, { PORT: String(port) }),
        );
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.err).toContain(
          "The backup taken before the move is at /nowhere/fake.dump.",
        );
        expect(ran.err).toContain("Nothing was changed.");
        expect(ran.out).not.toContain("Done.");
      } finally {
        server?.stop(true);
      }
      expect(await snapshot(world.database)).toEqual(before);
    },
    SLOW,
  );

  test(
    "something that connects to the database before the commit",
    async () => {
      let desk: Database | undefined;
      try {
        await refusedDuring(async (step) => {
          if (step === "verified") {
            desk = createDatabase(world.url, { max: 1 });
            await desk.execute(sql`select 1`);
          }
        }, "other connection is using the database");
      } finally {
        await desk?.$client.close();
      }
    },
    SLOW,
  );

  test(
    "a row that did not move, which the count at the end notices",
    async () => {
      await refusedDuring(async (step, transaction) => {
        // A queued item for the single-user person arrives after the rewrite of queued work.
        if (step === "special:work_items.payload") {
          await transaction.execute(
            sql`insert into work_items (kind, key, payload)
              values ('person.question', 'late-arrival', ${JSON.stringify({ actorId: DEV_ACTOR.id, botId: IRIS })}::text::jsonb)`,
          );
        }
      }, "did not add up for work_items.payload");
    },
    SLOW,
  );

  test(
    "data that changed between the plan the person saw and the lock",
    async () => {
      // The plan is read, then a saved login is removed by somebody, then the move reads it again.
      const outcome = await world.whileStopped(async () => {
        const database = createDatabase(world.url, { max: 1 });
        try {
          const expected = await readPlan(database, PERSON_ADDRESS);
          await database.execute(
            sql`delete from saved_logins where owner_user_id = ${DEV_ACTOR.id}`,
          );
          const mid = await snapshot(database);
          const result = await applyAdoption(database, {
            config: adoptionConfig(world.environment()),
            address: PERSON_ADDRESS,
            expected,
            backupName: "test.dump",
            settleMs: 0,
          }).then(
            () => "committed" as const,
            (error: unknown) => error,
          );
          // Whatever the move did, it changed nothing after the plan was found to be stale.
          expect(await snapshot(database)).toEqual(mid);
          return result;
        } finally {
          await database.$client.close();
        }
      });
      expect(outcome).not.toBe("committed");
      expect(String((outcome as Error).message)).toContain(
        "The data changed between the moment it was read and the moment it was locked",
      );
    },
    SLOW,
  );

  test(
    "a writer that holds a table and does not let go: the move gives up and changes nothing",
    async () => {
      const before = await snapshot(world.database);
      // Another connection, in the middle of writing to one of the tables the move needs to lock.
      let release: () => void = () => {};
      const held = new Promise<void>((resolveHeld) => {
        release = resolveHeld;
      });
      const holder = createDatabase(world.url, { max: 1 });
      let ready: () => void = () => {};
      const holding = new Promise<void>((resolveReady) => {
        ready = resolveReady;
      });
      const writer = holder.transaction(async (transaction) => {
        await transaction.execute(
          sql`update personal_memories set content = content where owner_user_id = ${DEV_ACTOR.id}`,
        );
        ready();
        await held;
      });
      await holding;
      let outcome: unknown;
      try {
        // The holder is connected on purpose, so the move is run directly, past the command's own
        // checks, to look at the lock and at nothing else.
        const database = createDatabase(world.url, { max: 1 });
        try {
          outcome = await applyAdoption(database, {
            config: adoptionConfig(world.environment()),
            address: PERSON_ADDRESS,
            expected: await readPlan(database, PERSON_ADDRESS),
            backupName: "test.dump",
            settleMs: 0,
            lockTimeoutMs: 400,
          }).then(
            () => "committed" as const,
            (error: unknown) => error,
          );
        } finally {
          await database.$client.close();
        }
        expect(outcome).not.toBe("committed");
        expect(String((outcome as Error).message)).toContain(
          "Something is using the data and did not let go in time",
        );
      } finally {
        release();
        await writer;
        await holder.$client.close();
      }
      expect(await snapshot(world.database)).toEqual(before);
    },
    SLOW,
  );

  test(
    "a writer that arrives once the tables are locked has to wait, and its being there stops the move",
    async () => {
      const before = await snapshot(world.database);
      const writerPool = createDatabase(world.url, { max: 1 });
      let late: Promise<unknown> | undefined;
      let seenWaiting = false;
      let outcome: unknown;
      try {
        outcome = await world
          .whileStopped(async () => {
            const database = createDatabase(world.url, { max: 1 });
            try {
              return await applyAdoption(database, {
                config: adoptionConfig(world.environment()),
                address: PERSON_ADDRESS,
                expected: await readPlan(database, PERSON_ADDRESS),
                backupName: "test.dump",
                settleMs: 0,
                checkpoint: async (step, transaction) => {
                  if (step !== "planned") return;
                  // A memory written by something that did not know that the move had begun.
                  late = createMemoryStore(writerPool).create(DEV_ACTOR.id, {
                    content: "Arrived during the move.",
                  });
                  const deadline = Date.now() + 10_000;
                  while (!seenWaiting && Date.now() < deadline) {
                    await transaction.execute(
                      sql`select pg_stat_clear_snapshot()`,
                    );
                    const [row] = (await transaction.execute(
                      sql`select count(*)::int as n from pg_stat_activity
                        where datname = current_database() and wait_event_type = 'Lock'`,
                    )) as unknown as { n: number }[];
                    seenWaiting = Number(row?.n) > 0;
                    if (!seenWaiting)
                      await new Promise((resolveWait) =>
                        setTimeout(resolveWait, 50),
                      );
                  }
                },
              });
            } finally {
              await database.$client.close();
            }
          })
          .then(
            () => "committed" as const,
            (error: unknown) => error,
          );
        // The writer, which was waiting behind the move's locks, goes through once the move is undone.
        await late;
      } finally {
        await writerPool.$client.close();
      }

      expect(seenWaiting).toBe(true);
      expect(outcome).not.toBe("committed");
      expect(String((outcome as Error).message)).toContain(
        "other connection is using the database",
      );
      // Nothing moved; the only change is the late memory, still under the person it was written for.
      const after = await snapshot(world.database);
      const others = (digests: Record<string, string>) =>
        Object.fromEntries(
          Object.entries(digests).filter(
            ([table]) => table !== "personal_memories",
          ),
        );
      expect(others(after)).toEqual(others(before));
      expect(
        await countWhere(
          world.database,
          "personal_memories",
          "owner_user_id",
          DEV_ACTOR.id,
        ),
      ).toBe(2);
    },
    SLOW,
  );
});

describe("a process killed in the middle of the move", () => {
  let world: World;
  let folder: string;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
    folder = mkdtempSync(join(tmpdir(), "adopt-child-"));
  }, SLOW);

  afterAll(async () => {
    rmSync(folder, { recursive: true, force: true });
    await world.dispose();
  }, SLOW);

  test(
    "is no change, leaves nothing locked, and the move can then be run again",
    async () => {
      const before = await snapshot(world.database);
      const marker = join(folder, "stopped-here");

      await world.whileStopped(async () => {
        const environment: Record<string, string> = {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
        };
        for (const [key, value] of Object.entries(world.environment())) {
          if (value !== undefined) environment[key] = value;
        }
        // Stops after several tables have been moved, inside the transaction, with the locks held.
        const child = Bun.spawn(
          [
            process.execPath,
            CHILD,
            "moved:personal_memories.owner_user_id",
            marker,
            ...MOVE_ARGUMENTS,
          ],
          { env: environment, stdout: "pipe", stderr: "pipe" },
        );
        const deadline = Date.now() + 60_000;
        while (!existsSync(marker) && Date.now() < deadline) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 50));
        }
        expect(existsSync(marker)).toBe(true);
        expect(readFileSync(marker, "utf8")).toBe(
          "moved:personal_memories.owner_user_id",
        );
        child.kill("SIGKILL");
        await child.exited;
      });

      // The database notices the connection is gone and abandons the transaction.
      const deadline = Date.now() + 15_000;
      let open = 1;
      while (open > 0 && Date.now() < deadline) {
        const [row] = (await world.database.execute(
          sql`select count(*)::int as n from pg_stat_activity
            where datname = current_database() and pid <> pg_backend_pid()
              and state like 'idle in transaction%'`,
        )) as unknown as { n: number }[];
        open = Number(row?.n);
        if (open > 0)
          await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
      expect(open).toBe(0);
      expect(await snapshot(world.database)).toEqual(before);

      // Nothing is held: the same move, run again, goes through.
      const { backup } = fakeBackup();
      const again = await moveWhileStopped(world, { backup });
      expect(again.err).toBe("");
      expect(again.code).toBe(EXIT.ok);
      expect(again.out).toContain(
        `Done. 13 rows now belong to ${PERSON_ADDRESS}.`,
      );
    },
    SLOW,
  );
});

describe("telling the person how to go back", () => {
  test("a plain path is printed as it is, and one with a space, a quote or a dollar sign is quoted for the shell", () => {
    expect(shellWord("/home/me/openbot/.logs/single-user-backup-1.dump")).toBe(
      "/home/me/openbot/.logs/single-user-backup-1.dump",
    );
    expect(shellWord("/home/me/my backups/x.dump")).toBe(
      '"/home/me/my backups/x.dump"',
    );
    expect(shellWord('/tmp/a"b$c`d\\e.dump')).toBe(
      '"/tmp/a\\"b\\$c\\`d\\\\e.dump"',
    );
  });

  test("a dump made on this computer is restored there, and one made in the container is restored in it", () => {
    const made = {
      path: "/x/y.dump",
      name: "y.dump",
      bytes: 9,
      via: "pg_dump" as const,
    };
    const url = "postgres://openbot:secret@localhost:5432/openbot";
    const local = wayBack(made, url).join("\n");
    expect(local).toContain(
      'pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" /x/y.dump',
    );
    expect(local).not.toContain("docker");

    const inside = wayBack({ ...made, via: "docker" }, url).join("\n");
    expect(inside).toContain(
      "docker compose exec -T postgres pg_restore --clean --if-exists --no-owner -U openbot -d openbot < /x/y.dump",
    );
    // Neither carries the password.
    expect(local + inside).not.toContain("secret");
  });
});

describe("rewriting the person's id inside JSON", () => {
  test("replaces a string equal to the id at any depth, and only that", () => {
    const from = "dev-local-user";
    const result = replaceExactStrings(
      {
        actorId: from,
        nested: { members: [from, "someone-else", `${from}-and-more`] },
        counts: [1, null, true],
        key: "stays",
      },
      from,
      "new-id",
    );
    expect(result.count).toBe(2);
    expect(result.value).toEqual({
      actorId: "new-id",
      nested: { members: ["new-id", "someone-else", `${from}-and-more`] },
      counts: [1, null, true],
      key: "stays",
    });
  });

  test("keeps a key named __proto__ as a key, and does not change the object's own shape", () => {
    const parsed = JSON.parse(
      '{"__proto__": {"by": "dev-local-user"}, "ok": 1}',
    );
    const result = replaceExactStrings(parsed, "dev-local-user", "new-id");
    expect(result.count).toBe(1);
    expect(JSON.stringify(result.value)).toBe(
      '{"__proto__":{"by":"new-id"},"ok":1}',
    );
    expect(({} as Record<string, unknown>).by).toBeUndefined();
  });
});
