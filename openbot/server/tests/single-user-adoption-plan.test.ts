/**
 * The dry run of the move from "no sign-in" to a signed-in account: what it reads, what it says,
 * what it refuses, and that it writes nothing
 * (docs/design/single-user-to-sign-in.md, sections 6.1 and 6.2).
 *
 * WHAT RUNS. The real command (`run`, which `scripts/adopt-single-user-data.ts` calls), against a
 * real PostgreSQL scratch database that holds an installation seeded through the real app
 * (tests/support/single-user-world.ts): the conversations, the memory, the saved login, the rule,
 * the routine, the connected app and the Bot a person who used FreeDuet with no sign-in has.
 *
 * "STOPPED" MEANS WHAT IT MEANS FOR THE PERSON. The command refuses while anything else is
 * connected to the database, so each run happens after the world has closed every connection it
 * holds and the database has finished closing them (`world.whileStopped`), and the tests of that
 * refusal leave a connection open on purpose.
 *
 * RED ON MAIN. The command does not exist there: this file cannot even load, and the problem it
 * answers is shown by single-user-to-sign-in-problem.test.ts, which passes on main.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import { createDatabase } from "../src/db/client";
import {
  EXIT,
  parseArguments,
  run,
  USAGE,
} from "../src/freeduet/adopt/command";
import { readPlan } from "../src/freeduet/adopt/plan";
import { serverAnswersOn } from "../src/freeduet/adopt/preconditions";
import {
  createWorld,
  type Mode,
  PERSON_ADDRESS,
  seedAsSingleUser,
  snapshot,
  userByEmail,
  type World,
} from "./support/single-user-world";

const SLOW = 60_000;
const OPENBOT = resolve(import.meta.dir, "..", "..");

type Env = Record<string, string | undefined>;
type Ran = { code: number; out: string; err: string };

/** One run of the command, with everything it printed. */
async function invoke(
  argv: string[],
  environment: Env,
  settleMs = 0,
): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(
    argv,
    environment,
    { out: (line) => out.push(line), err: (line) => err.push(line) },
    { settleMs },
  );
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** The command as the person runs it: after the server is stopped, so nothing of the world is connected. */
function stopped(world: World, argv: string[], environment?: Env) {
  return world.whileStopped(() =>
    invoke(argv, environment ?? world.environment()),
  );
}

/** Runs `action` and proves that no table in the database changed while it ran. */
async function writingNothing<T>(
  world: World,
  action: () => Promise<T>,
): Promise<T> {
  const before = await snapshot(world.database);
  const result = await action();
  expect(await snapshot(world.database)).toEqual(before);
  return result;
}

/** The settings of a provider-mode installation that uses Google, which is what will be configured. */
function googleOnly(world: World): Env {
  const environment = world.environment(
    { kind: "provider" },
    {
      GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
    },
  );
  delete environment.OKTA_OAUTH_CLIENT_ID;
  delete environment.OKTA_OAUTH_CLIENT_SECRET;
  delete environment.OKTA_OAUTH_ISSUER;
  return environment;
}

describe("the dry run, for an installation that ran with no sign-in", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  });

  test(
    "says what would move, family by family, and writes nothing to any table",
    async () => {
      const plan = await readPlan(world.database, PERSON_ADDRESS);
      expect(plan.blockers).toEqual([]);

      const ran = await writingNothing(world, () =>
        stopped(world, ["--to", PERSON_ADDRESS]),
      );

      expect(ran.err).toBe("");
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.out).toContain("This is a dry run. Nothing is written.");
      expect(ran.out).toContain(`From  ${DEV_ACTOR.id}`);
      expect(ran.out).toContain(
        `To    ${PERSON_ADDRESS} (no account yet: the move makes one, and your first sign-in finds it)`,
      );
      // What the person made, as the seeding made it: one of each, two routines (the daily review and
      // the Friday list), and the two conversations the team opened.
      expect(ran.out).toContain("  Settings: 1");
      expect(ran.out).toContain("    standing instructions: 1");
      expect(ran.out).toContain("    conversations the person is in: 2");
      expect(ran.out).toContain("    memories: 1");
      expect(ran.out).toContain("    routines: 2");
      expect(ran.out).toContain(
        "    queued work, follow-ups, waiting questions and Activity: 1",
      );
      expect(ran.out).toContain("    always-allow and never rules: 1");
      expect(ran.out).toContain("    saved logins: 1");
      expect(ran.out).toContain("    connected apps (brokered): 1");
      expect(ran.out).toContain("    Bots the person made: 1");
      // The total is the sum of what is listed, and the same figure the plan reports.
      const listed = [...plan.moves, ...plan.special].reduce(
        (sum, entry) => sum + entry.count,
        0,
      );
      expect(plan.total).toBe(listed);
      expect(ran.out).toContain(`What moves, ${plan.total} rows:`);
      // Nothing is said about a family that has nothing in it.
      expect(ran.out).not.toContain("Pages and tasks");
      expect(ran.out).not.toContain("Usage:");
    },
    SLOW,
  );

  test(
    "says what the person is handing over besides rows: Full access, rules, apps",
    async () => {
      const plan = await readPlan(world.database, PERSON_ADDRESS);
      expect(plan.sourceExists).toBe(true);
      expect(plan.target).toBeNull();
      expect(plan.earlier).toBeNull();
      expect(plan.standing.fullAccess).toEqual(["world-iris"]);
      expect(plan.standing.alwaysAllowRules).toBe(1);
      expect(plan.apps).toEqual(["gmail"]);

      const ran = await stopped(world, ["--to", PERSON_ADDRESS]);
      expect(ran.out).toContain(
        `Standing permissions that will belong to ${PERSON_ADDRESS}:`,
      );
      expect(ran.out).toContain("  Full access is on for: world-iris");
      expect(ran.out).toContain("  1 always-allow rule");
      expect(ran.out).toContain(
        "Connected apps (an app may ask you to connect it again): gmail",
      );
    },
    SLOW,
  );

  test(
    "reads the address in any capitals, as the sign-in does",
    async () => {
      const ran = await stopped(world, ["--to", "You@Example.COM"]);
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.out).toContain(`To    ${PERSON_ADDRESS} `);
    },
    SLOW,
  );

  test(
    "accepts Google, which is the provider that will be configured",
    async () => {
      const ran = await stopped(
        world,
        ["--to", PERSON_ADDRESS],
        googleOnly(world),
      );
      expect(ran.err).toBe("");
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.out).toContain("This is a dry run. Nothing is written.");
    },
    SLOW,
  );

  describe("refuses, in words, and writes nothing", () => {
    test(
      "an address the settings do not name as an administrator",
      async () => {
        const ran = await writingNothing(world, () =>
          stopped(world, ["--to", "someone@example.org"]),
        );
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.out).toBe("");
        expect(ran.err).toContain("Nothing was written");
        expect(ran.err).toContain(
          "someone@example.org is not in INITIAL_ADMIN_EMAILS",
        );
      },
      SLOW,
    );

    test(
      "an address the sign-in itself would turn away, by each of its three lists",
      async () => {
        const lists = world.environment(
          { kind: "provider" },
          {
            SIGNIN_ALLOWED_EMAILS: PERSON_ADDRESS,
            SIGNIN_ALLOWED_EMAIL_DOMAINS: "example.com",
          },
        );
        const ran = await stopped(
          world,
          ["--to", "someone@example.org"],
          lists,
        );
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.err).toContain("is outside SIGNIN_ALLOWED_EMAIL_DOMAINS");
        expect(ran.err).toContain("is not in SIGNIN_ALLOWED_EMAILS");

        // An address an administrator removed is turned away by the sign-in, so it is here.
        await world.database.execute(
          sql`insert into revoked_access (email, revoked_by) values (${PERSON_ADDRESS}, 'a test')`,
        );
        try {
          const removed = await stopped(world, ["--to", PERSON_ADDRESS]);
          expect(removed.code).toBe(EXIT.refused);
          expect(removed.err).toContain(
            `${PERSON_ADDRESS} was removed by an administrator`,
          );
        } finally {
          await world.database.execute(
            sql`delete from revoked_access where email = ${PERSON_ADDRESS}`,
          );
        }
      },
      SLOW,
    );

    test(
      "something that is not an address, and the address of the person with no sign-in",
      async () => {
        const notAnAddress = await stopped(world, ["--to", "not-an-address"]);
        expect(notAnAddress.code).toBe(EXIT.refused);
        expect(notAnAddress.err).toContain("is not an email address");

        const theDevPerson = await stopped(world, ["--to", DEV_ACTOR.email]);
        expect(theDevPerson.code).toBe(EXIT.refused);
        expect(theDevPerson.err).toContain(
          "is the address of the person who has no sign-in",
        );
      },
      SLOW,
    );

    test(
      "settings that do not load, which the sign-in would not start with either",
      async () => {
        // The exact-address list leaves the administrator out: the server would refuse to start.
        const broken = world.environment(
          { kind: "provider" },
          { SIGNIN_ALLOWED_EMAILS: "someone-else@example.com" },
        );
        const ran = await stopped(world, ["--to", PERSON_ADDRESS], broken);
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.err).toContain("The settings do not load");
      },
      SLOW,
    );

    test(
      "no sign-in provider in the settings: the move is for an installation about to turn one on",
      async () => {
        const ran = await stopped(
          world,
          ["--to", PERSON_ADDRESS],
          world.environment({ kind: "single-user" }),
        );
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.err).toContain("No sign-in provider is configured");
      },
      SLOW,
    );

    test(
      "an installation that keeps its conversations in Intelligence",
      async () => {
        const ran = await stopped(
          world,
          ["--to", PERSON_ADDRESS],
          world.environment(
            { kind: "provider" },
            { FREEDUET_INTELLIGENCE: "on" },
          ),
        );
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.err).toContain("CopilotKit Intelligence");
      },
      SLOW,
    );

    test(
      "Microsoft alone, whose sign-in is not expected to find an account made ahead of it",
      async () => {
        const microsoft = world.environment(
          { kind: "provider" },
          {
            MICROSOFT_OAUTH_CLIENT_ID: "microsoft-client-id",
            MICROSOFT_OAUTH_CLIENT_SECRET: "microsoft-client-secret",
            MICROSOFT_OAUTH_TENANT_ID: "11111111-2222-3333-4444-555555555555",
          },
        );
        delete microsoft.OKTA_OAUTH_CLIENT_ID;
        delete microsoft.OKTA_OAUTH_CLIENT_SECRET;
        delete microsoft.OKTA_OAUTH_ISSUER;
        const ran = await stopped(world, ["--to", PERSON_ADDRESS], microsoft);
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.err).toContain("Microsoft is the only sign-in provider");
      },
      SLOW,
    );

    test(
      "while the server is answering on its port, even when the database shows nobody",
      async () => {
        const server = Bun.serve({
          port: 0,
          hostname: "127.0.0.1",
          fetch: (request) =>
            new URL(request.url).pathname === "/api/capabilities"
              ? Response.json({ durableHistory: true })
              : new Response("not found", { status: 404 }),
        });
        try {
          const port = server.port as number;
          expect(await serverAnswersOn(port)).toBe(true);
          const ran = await stopped(
            world,
            ["--to", PERSON_ADDRESS],
            world.environment({ kind: "provider" }, { PORT: String(port) }),
          );
          expect(ran.code).toBe(EXIT.refused);
          expect(ran.err).toContain(
            `The OpenBot server is answering on port ${port}`,
          );
        } finally {
          server.stop(true);
        }
      },
      SLOW,
    );

    test(
      "but not because something else answers on that port: a stranger's service is not the server",
      async () => {
        const stranger = Bun.serve({
          port: 0,
          hostname: "127.0.0.1",
          fetch: () => Response.json({ hello: "world" }),
        });
        try {
          const port = stranger.port as number;
          expect(await serverAnswersOn(port)).toBe(false);
          const ran = await stopped(
            world,
            ["--to", PERSON_ADDRESS],
            world.environment({ kind: "provider" }, { PORT: String(port) }),
          );
          expect(ran.code).toBe(EXIT.ok);
        } finally {
          stranger.stop(true);
        }
      },
      SLOW,
    );

    test(
      "while anything else is connected to the database: the worker, a console, a restarted stack",
      async () => {
        // The world's own connections stand for the server and the worker, and are left open.
        await world.database.execute(sql`select 1`);
        const ran = await invoke(["--to", PERSON_ADDRESS], world.environment());
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.out).toBe("");
        expect(ran.err).toMatch(
          /\d+ other connections? (is|are) using the database/,
        );
        expect(ran.err).toContain("Stop the server and the worker");
      },
      SLOW,
    );

    test(
      "but gives a connection that is closing a moment to finish, and no more",
      async () => {
        const ran = await world.whileStopped(async () => {
          const desk = createDatabase(world.url, { max: 1 });
          await desk.execute(sql`select 1`);
          setTimeout(() => void desk.$client.close(), 300);
          return invoke(["--to", PERSON_ADDRESS], world.environment(), 5000);
        });
        expect(ran.err).toBe("");
        expect(ran.code).toBe(EXIT.ok);

        // And one that stays is still a refusal after the moment is up.
        const staying = await world.whileStopped(async () => {
          const desk = createDatabase(world.url, { max: 1 });
          try {
            await desk.execute(sql`select 1`);
            return await invoke(
              ["--to", PERSON_ADDRESS],
              world.environment(),
              300,
            );
          } finally {
            await desk.$client.close();
          }
        });
        expect(staying.code).toBe(EXIT.refused);
        expect(staying.err).toContain(
          "1 other connection is using the database",
        );
      },
      SLOW,
    );

    test(
      "a place that holds the person's id and that nobody classified, in a text, array or JSON column",
      async () => {
        await world.database.execute(
          sql`create table adoption_residue_probe (note text, tags text[], extra jsonb)`,
        );
        await world.database.execute(
          sql`insert into adoption_residue_probe values (${DEV_ACTOR.id}, array[${DEV_ACTOR.id}]::text[], ${JSON.stringify({ deep: { by: [DEV_ACTOR.id] } })}::text::jsonb)`,
        );
        try {
          const ran = await stopped(world, ["--to", PERSON_ADDRESS]);
          expect(ran.code).toBe(EXIT.refused);
          expect(ran.err).toContain("adoption_residue_probe.note (1 row)");
          expect(ran.err).toContain("adoption_residue_probe.tags (1 row)");
          expect(ran.err).toContain("adoption_residue_probe.extra (1 row)");
          expect(ran.err).toContain("has no rule for");
        } finally {
          await world.database.execute(sql`drop table adoption_residue_probe`);
        }
        const clean = await stopped(world, ["--to", PERSON_ADDRESS]);
        expect(clean.code).toBe(EXIT.ok);
      },
      SLOW,
    );

    test(
      "what is still waiting for an answer, which is bound to who asked, and not what was answered",
      async () => {
        await world.database.execute(sql`
        insert into approval_requests (id, owner_user_id, run_id, tool_call_id, action_digest, action, status)
        values ('probe-approval', ${DEV_ACTOR.id}, 'run-1', 'call-1', 'digest', ${JSON.stringify({})}::text::jsonb, 'pending')`);
        await world.database.execute(sql`
        insert into sign_in_requests (id, owner_user_id, bot_id, origin, status, expires_at)
        values ('probe-sign-in', ${DEV_ACTOR.id}, 'world-penny', 'https://bank.example.com', 'filling', now() + interval '1 hour')`);
        try {
          const waiting = await stopped(world, ["--to", PERSON_ADDRESS]);
          expect(waiting.code).toBe(EXIT.refused);
          expect(waiting.err).toContain(
            "There is 1 approval request still waiting for an answer. It is bound to who asked",
          );
          expect(waiting.err).toContain("There is 1 sign-in form still open.");

          await world.database.execute(
            sql`update approval_requests set status = 'completed' where id = 'probe-approval'`,
          );
          await world.database.execute(
            sql`update sign_in_requests set status = 'signed_in' where id = 'probe-sign-in'`,
          );
          const answered = await stopped(world, ["--to", PERSON_ADDRESS]);
          expect(answered.err).toBe("");
          expect(answered.code).toBe(EXIT.ok);
        } finally {
          await world.database.execute(
            sql`delete from approval_requests where id = 'probe-approval'`,
          );
          await world.database.execute(
            sql`delete from sign_in_requests where id = 'probe-sign-in'`,
          );
        }
      },
      SLOW,
    );

    test(
      "a person who has somebody signed in as them: this is not an installation that ran with no sign-in",
      async () => {
        await world.database.execute(sql`
        insert into accounts (id, account_id, provider_id, user_id)
        values ('probe-account', 'subject-1', 'okta', ${DEV_ACTOR.id})`);
        try {
          const ran = await stopped(world, ["--to", PERSON_ADDRESS]);
          expect(ran.code).toBe(EXIT.refused);
          expect(ran.err).toContain("accounts.user_id");
          expect(ran.err).toContain("the tool will not guess");
        } finally {
          await world.database.execute(
            sql`delete from accounts where id = 'probe-account'`,
          );
        }
      },
      SLOW,
    );
  });
});

describe("an address that has signed in already", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  });

  test(
    "an account with nothing in it is fine: the move fills it in, and the dry run says so",
    async () => {
      const provider = world.boot({ kind: "provider" });
      const signedIn = await provider.signIn(PERSON_ADDRESS);
      expect(signedIn.status).toBe(302);
      const made = await userByEmail(world.database, PERSON_ADDRESS);
      expect(made?.emailVerified).toBe(true);

      const ran = await writingNothing(world, () =>
        stopped(world, ["--to", PERSON_ADDRESS]),
      );
      expect(ran.err).toBe("");
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.out).toContain(
        `To    ${PERSON_ADDRESS} (it has an account already, with nothing in it)`,
      );
    },
    SLOW,
  );

  test(
    "an account that already owns the team is refused, and nothing is mixed",
    async () => {
      // A restart, a sign-in, and the first request, which is when the team's conversations and the
      // daily review are made for a new person.
      const provider = world.boot({ kind: "provider" });
      const signedIn = await provider.signIn(PERSON_ADDRESS);
      const me = await provider.get("/api/me", signedIn.cookie);
      expect(me.status).toBe(200);

      const ran = await writingNothing(world, () =>
        stopped(world, ["--to", PERSON_ADDRESS]),
      );
      expect(ran.code).toBe(EXIT.refused);
      expect(ran.out).toBe("");
      expect(ran.err).toContain(`${PERSON_ADDRESS} already owns data`);
      expect(ran.err).toContain("conversations the person is in");
      expect(ran.err).toContain(
        "Restore the backup you took before turning sign-in on, run this, and then sign in.",
      );
    },
    SLOW,
  );
});

describe("an installation with nothing to move, and addresses that are not clean", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  });

  test(
    "an empty database is nothing to move, and not an error",
    async () => {
      const ran = await stopped(world, ["--to", PERSON_ADDRESS]);
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.err).toBe("");
      expect(ran.out).toBe(
        `Nothing to move: ${DEV_ACTOR.email} owns nothing in this database.`,
      );
    },
    SLOW,
  );

  test(
    "the person's row alone, with nothing under it, is nothing to move",
    async () => {
      await world.startSingleUser();
      const ran = await stopped(world, ["--to", PERSON_ADDRESS]);
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.out).toContain("Nothing to move");
    },
    SLOW,
  );

  test(
    "an account for the address written in other capitals, which the sign-in would not find",
    async () => {
      await world.database.execute(
        sql`insert into users (id, email, email_verified) values ('mixed-case', 'You@Example.com', true)`,
      );
      try {
        const ran = await stopped(world, ["--to", PERSON_ADDRESS]);
        expect(ran.code).toBe(EXIT.refused);
        expect(ran.err).toContain(
          `An account exists for ${PERSON_ADDRESS} with the address written as You@Example.com`,
        );

        // And two of them, in two spellings, are not guessed between.
        await world.database.execute(
          sql`insert into users (id, email, email_verified) values ('plain-case', ${PERSON_ADDRESS}, true)`,
        );
        const two = await stopped(world, ["--to", PERSON_ADDRESS]);
        expect(two.code).toBe(EXIT.refused);
        expect(two.err).toContain("More than one account has the address");
      } finally {
        await world.database.execute(
          sql`delete from users where id in ('mixed-case', 'plain-case')`,
        );
      }
    },
    SLOW,
  );
});

describe("the command line", () => {
  test("reads --to in both spellings, and --help", () => {
    expect(parseArguments(["--to", "a@example.com"])).toEqual({
      to: "a@example.com",
      help: false,
    });
    expect(parseArguments(["--to=a@example.com"])).toEqual({
      to: "a@example.com",
      help: false,
    });
    expect(parseArguments(["--help"])).toEqual({ to: undefined, help: true });
    expect(parseArguments(["-h"])).toEqual({ to: undefined, help: true });
  });

  test("an unknown flag, and --to with nothing after it, are mistakes in the command and not guessed at", async () => {
    expect(parseArguments(["--apply-everything"])).toEqual({
      error:
        "--apply-everything is not something this tool knows. Run it with --help.",
    });
    expect(parseArguments(["--to"])).toEqual({
      error: "--to needs an address: --to you@example.com",
    });
    expect(parseArguments(["--to", "--help"])).toEqual({
      error: "--to needs an address: --to you@example.com",
    });

    const unknown = await invoke(["--force"], {});
    expect(unknown.code).toBe(EXIT.usage);
    expect(unknown.err).toContain("--force is not something this tool knows");

    const noAddress = await invoke([], {});
    expect(noAddress.code).toBe(EXIT.usage);
    expect(noAddress.err).toContain("Say whose data this becomes");
  });

  test("--help prints how to use it and touches nothing, not even the settings", async () => {
    const ran = await invoke(["--help"], {});
    expect(ran.code).toBe(EXIT.ok);
    expect(ran.out).toBe(USAGE);
    expect(USAGE).toContain("With only --to it writes");
  });
});

describe("the script itself, run the way the person runs it", () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  });

  /** `bun scripts/adopt-single-user-data.ts ...` from the openbot folder, with only these settings. */
  async function script(argv: string[], environment: Env) {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
    };
    for (const [key, value] of Object.entries(environment)) {
      if (value !== undefined) env[key] = value;
    }
    const child = Bun.spawn(
      [process.execPath, "scripts/adopt-single-user-data.ts", ...argv],
      { cwd: OPENBOT, env, stdout: "pipe", stderr: "pipe" },
    );
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, out, err };
  }

  test(
    "exit 0 and the plan for a clean dry run, and not one row written",
    async () => {
      const before = await snapshot(world.database);
      const ran = await world.whileStopped(() =>
        script(["--to", PERSON_ADDRESS], world.environment()),
      );
      expect(ran.code).toBe(EXIT.ok);
      expect(ran.out).toContain("This is a dry run. Nothing is written.");
      expect(ran.out).toContain("    routines: 2");
      expect(await snapshot(world.database)).toEqual(before);
    },
    SLOW,
  );

  test(
    "exit 1 and the reason on the error stream for a refusal",
    async () => {
      const single: Mode = { kind: "single-user" };
      const ran = await world.whileStopped(() =>
        script(["--to", PERSON_ADDRESS], world.environment(single)),
      );
      expect(ran.code).toBe(EXIT.refused);
      expect(ran.err).toContain("No sign-in provider is configured");
      expect(ran.out).toBe("");
    },
    SLOW,
  );

  test(
    "exit 2 for a command line it does not understand",
    async () => {
      const ran = await script(["--to"], {});
      expect(ran.code).toBe(EXIT.usage);
      expect(ran.err).toContain("--to needs an address");
    },
    SLOW,
  );
});
