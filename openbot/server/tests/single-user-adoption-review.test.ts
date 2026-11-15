/**
 * Defects found by an independent review of the move (PR #220), each with the test that failed on the
 * source the review started from. The file is read top to bottom as a list of findings: a describe
 * names one, says what the person would have met, and holds the test that is red without the fix.
 *
 * A real PostgreSQL scratch database per describe, built by the same stand-in world as the rest of
 * the single-user-adoption tests (tests/support/single-user-world.ts), moved by the real command.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { count, eq, sql } from "drizzle-orm";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import { approvalRequests } from "../src/db/schema";
import { replaceJsonStrings } from "../src/freeduet/adopt/apply";
import { databaseLine, EXIT } from "../src/freeduet/adopt/command";
import { fakeBackup, invoke, moveWhileStopped } from "./support/adopt-run";
import {
  createWorld,
  PENNY,
  PERSON_ADDRESS,
  seedAsSingleUser,
  userByEmail,
  type World,
} from "./support/single-user-world";

const SLOW = 120_000;

describe("finding: a person who has ever answered an approval card could not be moved", () => {
  // WHAT THE PERSON MET. `approval_requests.action` is a jsonb column holding the whole request,
  // including `actorId`, which is the id of the person it was asked of. The registry moved the row
  // (`owner_user_id`) but had no rule for the JSON inside it, so the search for an unclassified
  // place that holds the id found it and stopped the move: "a column this tool has no rule for".
  // Every installation that has ever shown an approval card has such a row, so the tool refused to
  // run on nearly every real installation, and the refusal gave the person nothing to do about it.
  let world: World;
  const ids: Record<"denied" | "completed" | "inFlight", string> = {
    denied: "",
    completed: "",
    inFlight: "",
  };

  beforeAll(async () => {
    world = await createWorld();
    const single = await world.startSingleUser();
    await seedAsSingleUser(world, single);
    const store = world.stores().approvalStore;
    const open = async (n: number) =>
      store.open({
        actorId: DEV_ACTOR.id,
        botId: PENNY,
        toolRef: "gmail",
        effect: "send",
        scope: "someone@example.com",
        args: { to: "someone@example.com" },
        runId: `run-${n}`,
        threadId: `thread-${n}`,
        toolCallId: `call-${n}`,
        actionDigest: `digest-${n}`,
        policy: { behaviour: "ask", source: "default", reason: "asks" },
      });

    // Declined by the person.
    const denied = await open(1);
    await store.decide(DEV_ACTOR.id, denied.id, "deny");
    ids.denied = denied.id;

    // Allowed, carried out and finished.
    const completed = await open(2);
    await store.decide(DEV_ACTOR.id, completed.id, "allow_once");
    await store.consume(DEV_ACTOR.id, completed.id, "digest-2");
    await store.saveResult(DEV_ACTOR.id, completed.id, { content: "sent" });
    await store.finish(DEV_ACTOR.id, completed.id);
    ids.completed = completed.id;

    // Started, and the process that ran it stopped before saving what happened.
    const inFlight = await open(3);
    await store.decide(DEV_ACTOR.id, inFlight.id, "allow_once");
    await store.consume(DEV_ACTOR.id, inFlight.id, "digest-3");
    ids.inFlight = inFlight.id;
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  test("the dry run is not stopped by a finished request", async () => {
    const ran = await world.whileStopped(() =>
      invoke(["--to", PERSON_ADDRESS], world.environment(), {}),
    );
    expect(ran.err).toBe("");
    expect(ran.code).toBe(EXIT.ok);
    expect(ran.out).toContain("This is a dry run. Nothing is written.");
  });

  test("the move leaves every request, finished or started, asked of the new account and not of the old one", async () => {
    const { backup } = fakeBackup();
    const moved = await moveWhileStopped(world, { backup });
    expect(moved.err).toBe("");
    expect(moved.code).toBe(EXIT.ok);

    const target = await userByEmail(world.database, PERSON_ADDRESS);
    const targetId = target?.id ?? "";
    expect(targetId).not.toBe("");

    const history = await world.stores().approvalStore.list(targetId);
    expect(history.map((request) => request.id).sort()).toEqual(
      Object.values(ids).sort(),
    );
    // The person it was asked of, inside the request, is the account that now owns it: a resume that
    // checks the two against each other (approvals/service.ts) finds the same person.
    for (const request of history)
      expect(request.action.actorId).toBe(targetId);

    const [old] = await world.database
      .select({ n: count() })
      .from(approvalRequests)
      .where(eq(approvalRequests.ownerUserId, DEV_ACTOR.id));
    expect(Number(old?.n)).toBe(0);
    const [named] = (await world.database.execute(
      sql`select count(*)::int as n from approval_requests where action::text like ${`%${DEV_ACTOR.id}%`}`,
    )) as unknown as { n: number }[];
    expect(named?.n).toBe(0);
  });
});

describe("finding: the tool did not say which database it was working on", () => {
  // WHAT THE PERSON MET. `bun scripts/adopt-single-user-data.ts` takes its settings from the
  // environment it is started in, and Bun adds the `.env` of the current folder to it without a
  // word. A `DATABASE_URL` exported in the shell from other work, or a run from another folder,
  // therefore points the tool at a different database than the server's. Nothing it printed said
  // which one: the answer was "Nothing to move" (a fresh empty database) or a move of some other
  // installation's data, and the person found out when the first sign-in showed an empty team.
  let world: World;
  let empty: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
    empty = await createWorld();
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
    await empty.dispose();
  }, SLOW);

  const said = (url: string) => {
    const parsed = new URL(url);
    const host = parsed.searchParams.get("host") ?? parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : "";
    return `In    the database ${decodeURIComponent(parsed.pathname.slice(1))} on ${host}${port} (as ${decodeURIComponent(parsed.username)})`;
  };

  test("names the database, the machine and the user, and never the password", () => {
    const line = databaseLine(
      "postgres://app:s3cret%21pass@db.example.com:6543/openbot",
    );
    expect(line).toBe(
      "In    the database openbot on db.example.com:6543 (as app)",
    );
    expect(line).not.toContain("s3cret");
    expect(databaseLine("postgres://app@localhost/openbot")).toBe(
      "In    the database openbot on localhost (as app)",
    );
  });

  test("the dry run, the move and the answer 'nothing to move' each say it", async () => {
    const dry = await world.whileStopped(() =>
      invoke(["--to", PERSON_ADDRESS], world.environment(), {}),
    );
    expect(dry.code).toBe(EXIT.ok);
    expect(dry.out).toContain(said(world.url));

    const { backup } = fakeBackup();
    const moved = await moveWhileStopped(world, { backup });
    expect(moved.code).toBe(EXIT.ok);
    expect(moved.out).toContain(said(world.url));

    const idle = await empty.whileStopped(() =>
      invoke(["--to", PERSON_ADDRESS], empty.environment(), {}),
    );
    expect(idle.code).toBe(EXIT.ok);
    expect(idle.out).toContain("Nothing to move");
    expect(idle.out).toContain(said(empty.url));
    // Two installations, two different answers: that is what lets the person tell them apart.
    expect(said(empty.url)).not.toBe(said(world.url));
  });
});

describe("finding: an account the address was never verified for was filled in, and handed to whoever made it", () => {
  // WHAT THE PERSON MET. The move filled in any existing account for the address that owned nothing,
  // whatever made it. Two ways such an account is not verified. (1) Nobody signed in to it: made by
  // hand or by SCIM, with no provider linked. The sign-in joins a provider to an existing account only
  // when its address is marked verified, so the person's first real sign-in was refused and the data
  // was out of reach: worse than the empty team the move exists to cure. (2) Somebody signed in to it
  // with a provider that could not vouch for the address (a Microsoft tenant writes the address of its
  // own users) before the person ever signed in. The move then gave that account the person's data,
  // the team mark and the Full access choices: an account takeover by typing an address.
  let world: World;
  const PRE_MADE = "pre-made-unverified";

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  async function stillTheirs() {
    const [mine] = (await world.database.execute(
      sql`select count(*)::int as n from user_instructions where user_id = ${DEV_ACTOR.id}`,
    )) as unknown as { n: number }[];
    return mine?.n;
  }

  test("an account nobody signed in to is refused with what to do, and nothing is written", async () => {
    await world.database.execute(
      sql`insert into users (id, email, name, email_verified) values (${PRE_MADE}, ${PERSON_ADDRESS}, 'x', false)`,
    );
    const { backup, calls } = fakeBackup();
    const ran = await moveWhileStopped(world, { backup });

    expect(ran.code).toBe(EXIT.refused);
    expect(ran.err).toContain(
      "no sign-in provider ever vouched for its address",
    );
    expect(ran.err).toContain("no sign-in is linked to it");
    expect(ran.err).toContain(`delete from users where id = '${PRE_MADE}';`);
    expect(calls).toHaveLength(0);
    expect(await stillTheirs()).toBe(1);
  });

  test("an account somebody signed in to with a provider that could not vouch for the address is refused, and the provider is named", async () => {
    await world.database.execute(
      sql`insert into accounts (id, account_id, provider_id, user_id) values ('acc-1', 'their-directory-id', 'microsoft', ${PRE_MADE})`,
    );
    const ran = await moveWhileStopped(world, { backup: fakeBackup().backup });

    expect(ran.code).toBe(EXIT.refused);
    expect(ran.err).toContain("it is linked to a sign-in with microsoft");
    expect(await stillTheirs()).toBe(1);
    // What the person gave away is still all theirs, and the account did not get any of it.
    const [row] = (await world.database.execute(
      sql`select preferences::text as preferences from users where id = ${PRE_MADE}`,
    )) as unknown as { preferences: string }[];
    expect(JSON.parse(row?.preferences ?? "null")).toEqual({});
  });

  test("once the account is removed as the message says, the move makes a verified one and goes through", async () => {
    await world.database.execute(sql`delete from users where id = ${PRE_MADE}`);
    const { backup } = fakeBackup();
    const ran = await moveWhileStopped(world, { backup });

    expect(ran.err).toBe("");
    expect(ran.code).toBe(EXIT.ok);
    const made = await userByEmail(world.database, PERSON_ADDRESS);
    expect(made?.emailVerified).toBe(true);
    expect(made?.id).not.toBe(PRE_MADE);
  });
});

describe("finding: the advice for a request still waiting led back to the account the tool refuses", () => {
  // WHAT THE PERSON MET. A request still waiting for an answer cannot be moved (it is bound to who
  // asked), and the dry run said "Answer or dismiss them in the app, then stop the server again".
  // That can only be done in the app, and with the provider settings in .env (which the tool needs
  // in order to read the address) the app is the sign-in one. Following the advice as written meant
  // signing in with the address, and the first request after that makes the team of that account:
  // the very account the tool then refuses to fill ("already owns data"), with the way out being a
  // restore of a backup taken before sign-in was turned on, which most people do not have.
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
    await world.database.execute(sql`
      insert into approval_requests (id, owner_user_id, run_id, tool_call_id, action_digest, action, status)
      values ('probe-approval', ${DEV_ACTOR.id}, 'run-1', 'call-1', 'digest', ${JSON.stringify({})}::text::jsonb, 'pending')`);
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  test("the refusal says how to answer it without signing in, and what not to do", async () => {
    const ran = await world.whileStopped(() =>
      invoke(["--to", PERSON_ADDRESS], world.environment(), {}),
    );
    expect(ran.code).toBe(EXIT.refused);
    expect(ran.err).toContain(
      "There is 1 approval request still waiting for an answer.",
    );
    expect(ran.err).toContain("take the sign-in provider settings out of .env");
    expect(ran.err).toContain("keep OPENBOT_SINGLE_USER=true");
    expect(ran.err).toContain("Do not sign in with your address in between");
    // Said once, however many kinds of request are waiting.
    expect(ran.err.split("Do not sign in with your address").length).toBe(2);
  });
});

describe("finding: the move re-wrote numbers it had no reason to touch", () => {
  // WHAT THE PERSON MET. The JSON that names the person (a request's `actorId`, a queued item's
  // `ownerUserId`) was re-addressed in JavaScript: read out, parsed, changed and written back. A JSON
  // number is a 64-bit float there, so an integer past 2^53 (the 19-digit identifier a service sends
  // as a number, which a tool call can carry in its arguments) came back as a different number, and
  // 1.10 came back as 1.1, in the very row that was only meant to change its owner. The row count
  // matched, so nothing said so, and the person's history of what was asked, or a queued item, held
  // a value that was never there.
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    await seedAsSingleUser(world, await world.startSingleUser());
    // Written as text, so that what is stored is exactly these digits and not what a float prints.
    const text = `{"actorId":"${DEV_ACTOR.id}","botId":"${PENNY}","args":{"messageId":1234567890123456789,"ratio":1.10}}`;
    await world.database.execute(sql`
      insert into approval_requests (id, owner_user_id, run_id, tool_call_id, action_digest, action, status)
      values ('precise-approval', ${DEV_ACTOR.id}, 'run-9', 'call-9', 'digest-9', ${text}::text::jsonb, 'completed')`);
    await world.database.execute(sql`
      insert into work_items (kind, key, run_at, payload)
      values ('review.probe', 'precise-item', now(), ${`{"ownerUserId":"${DEV_ACTOR.id}","amount":1234567890123456789,"ratio":1.10}`}::text::jsonb)`);
  }, SLOW);

  afterAll(async () => {
    await world.dispose();
  }, SLOW);

  test("every number in the rows it re-addressed is the number that was there", async () => {
    const { backup } = fakeBackup();
    const moved = await moveWhileStopped(world, { backup });
    expect(moved.err).toBe("");
    expect(moved.code).toBe(EXIT.ok);
    const target =
      (await userByEmail(world.database, PERSON_ADDRESS))?.id ?? "";

    const [approval] = (await world.database.execute(
      sql`select action->'args'->>'messageId' as id, (action->'args'->'ratio')::text as ratio, action->>'actorId' as actor
          from approval_requests where id = 'precise-approval'`,
    )) as unknown as { id: string; ratio: string; actor: string }[];
    expect(approval?.actor).toBe(target);
    expect(approval?.id).toBe("1234567890123456789");
    expect(approval?.ratio).toBe("1.10");

    const [item] = (await world.database.execute(
      sql`select payload->>'amount' as amount, (payload->'ratio')::text as ratio, payload->>'ownerUserId' as owner
          from work_items where kind = 'review.probe'`,
    )) as unknown as { amount: string; ratio: string; owner: string }[];
    expect(item?.owner).toBe(target);
    expect(item?.amount).toBe("1234567890123456789");
    expect(item?.ratio).toBe("1.10");
  });
});

describe("the id is replaced only where it is a whole string value, and nothing else is touched", () => {
  const from = "dev-local-user";
  const swap = (text: string) => replaceJsonStrings(text, from, "new-id");

  test("a number keeps every digit and its trailing zero, because the text around the id is copied as it is", () => {
    const text = `{"amount": 1234567890123456789, "ratio": 1.10, "big": 1e400, "by": "${from}"}`;
    expect(swap(text)).toEqual({
      text: `{"amount": 1234567890123456789, "ratio": 1.10, "big": 1e400, "by": "new-id"}`,
      count: 1,
    });
  });

  test("a string that only ends with the id after a quote is not the id", () => {
    // `a"dev-local-user` is written `"a\"dev-local-user"`: a text search for the quoted id would find
    // the escaped quote, the id and the closing quote, and cut the string in two.
    const text = JSON.stringify({ said: `a"${from}`, by: from });
    const result = swap(text);
    expect(result.count).toBe(1);
    expect(JSON.parse(result.text)).toEqual({
      said: `a"${from}`,
      by: "new-id",
    });
  });

  test("a string that holds the id with other text, an escape or a backslash before it is not the id", () => {
    const values = [
      `${from}-2`,
      `x ${from}`,
      `${from}\\`,
      `\\${from}`,
      `"${from}"`,
      from.toUpperCase(),
    ];
    const text = JSON.stringify({ values, by: [from] });
    const result = swap(text);
    expect(result.count).toBe(1);
    expect(JSON.parse(result.text)).toEqual({ values, by: ["new-id"] });
  });

  test("a key equal to the id stays a key, and a value in the same row is still replaced", () => {
    const result = swap(`{"${from}": 1, "by": "${from}"}`);
    expect(result).toEqual({
      text: `{"${from}": 1, "by": "new-id"}`,
      count: 1,
    });
    expect(swap(`{"${from}" : 1}`).count).toBe(0);
  });

  test("an id that needs an escape in JSON is found and written back escaped", () => {
    const odd = 'a"b\\c';
    const result = replaceJsonStrings(JSON.stringify({ by: odd }), odd, 'x"y');
    expect(result.count).toBe(1);
    expect(JSON.parse(result.text)).toEqual({ by: 'x"y' });
  });
});
