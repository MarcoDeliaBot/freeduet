import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type AuditStore, createAuditStore } from "../src/audit";
import { createAuth } from "../src/auth";
import { DOMAIN_REFUSAL_MESSAGE } from "../src/auth/email-domain";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import {
  accounts,
  auditEvents,
  sessions,
  userRoles,
  users,
} from "../src/db/schema/core";
import {
  ADDRESS_REFUSAL_MESSAGE,
  ADDRESS_REFUSAL_REASON,
} from "../src/freeduet/signin-allowlist";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { testEnvironment } from "./support/environment";

/*
 * SIGNIN_ALLOWED_EMAILS where it is enforced: the two Better Auth hooks that stand between a
 * provider's answer and a session, against a real database and the real `createAuth`.
 *
 * What is NOT here: a real identity provider. The tests call the internal adapter the way the OAuth
 * callback does (`createOAuthUser` for somebody new, then `createSession`), so the hooks that run are
 * the ones a callback runs, but nothing in this file speaks OAuth to anybody. The rule itself, and
 * what start-up refuses, are in `freeduet-signin-allowlist.test.ts`.
 *
 * Every address carries this run's id, because the audit trail is append-only and a row written here
 * is there for good.
 */
const database = createDatabase(testDatabaseUrl(), TEST_POOL);

const run = randomUUID().slice(0, 8);
const address = (name: string) => `${name}-${run}@openbot.test`;
const ADMIN = address("admin");
const ALICE = address("alice");
const BOB = address("bob");
const OUTSIDER = `outsider-${run}@elsewhere.test`;
/** An address no other test has used, for a test that counts the rows written about it. */
const fresh = (name: string) =>
  `${name}-${randomUUID().slice(0, 8)}@openbot.test`;

const REMOVED_MESSAGE = "Your access to OpenBot has been removed.";

/** Every address an account was made for, so the rows can go. Cascades take the sessions and roles. */
const made: string[] = [];

afterEach(async () => {
  if (made.length === 0) return;
  await database.delete(users).where(inArray(users.email, made));
  made.length = 0;
});

afterAll(async () => {
  await database.$client.close();
});

type AuthOptions = {
  /** Addresses an administrator has removed. */
  revoked?: readonly string[];
  /** Where the trail goes. The real one unless a test says otherwise. */
  auditStore?: AuditStore;
};

function authWith(
  environment: Record<string, string | undefined>,
  options: AuthOptions = {},
) {
  const config = loadConfig(
    testEnvironment({ INITIAL_ADMIN_EMAILS: ADMIN, ...environment }),
  );
  return createAuth(
    config,
    database,
    async (email) => (options.revoked ?? []).includes(email),
    options.auditStore ?? createAuditStore(database),
  );
}

async function adapterOf(auth: ReturnType<typeof createAuth>) {
  return (await auth.$context).internalAdapter;
}

/** What the OAuth callback does for somebody who has never been here: an account, then a session. */
async function signUp(auth: ReturnType<typeof createAuth>, email: string) {
  made.push(email.toLowerCase());
  const adapter = await adapterOf(auth);
  const { user } = await adapter.createOAuthUser(
    { email, name: email, emailVerified: false },
    {
      accountId: `subject-${email.toLowerCase()}`,
      providerId: "google",
    },
  );
  const session = await adapter.createSession(user.id);
  return { userId: user.id, session };
}

/** An account that was made before any list existed, which is every account a deployment has today. */
async function existingAccount(email: string): Promise<string> {
  const id = `allowlist-${randomUUID()}`;
  made.push(email);
  await database
    .insert(users)
    .values({ id, email, name: email, emailVerified: true });
  return id;
}

async function accountsFor(email: string) {
  return database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
}

async function sessionsFor(userId: string) {
  return database
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId));
}

async function refusalsFor(email: string) {
  return database
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.eventType, "session.refused"),
        sql`${auditEvents.payload}->>'email' = ${email}`,
      ),
    );
}

const LISTED = `${ADMIN},${ALICE}`;

describe("a deployment that names its addresses", () => {
  test("gives a listed address its account and its session", async () => {
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });

    const { userId } = await signUp(auth, ALICE);

    expect(await accountsFor(ALICE)).toHaveLength(1);
    expect(await sessionsFor(userId)).toHaveLength(1);
  });

  test("reads the provider's address in whatever case it writes it", async () => {
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });

    const { userId } = await signUp(auth, ALICE.toUpperCase());

    expect(await accountsFor(ALICE)).toHaveLength(1);
    expect(await sessionsFor(userId)).toHaveLength(1);
  });

  test("refuses an address that is not on the list before any account exists", async () => {
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });

    await expect(signUp(auth, BOB)).rejects.toMatchObject({
      status: "FORBIDDEN",
      message: ADDRESS_REFUSAL_MESSAGE,
    });

    expect(await accountsFor(BOB)).toHaveLength(0);
    const linked = await database
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.accountId, `subject-${BOB}`));
    expect(linked).toHaveLength(0);
  });

  test("refuses a lookalike of a listed address", async () => {
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });
    const lookalikes = [
      `x${ALICE}`,
      ALICE.replace("@openbot.test", "@openbot.test.attacker.test"),
      ALICE.replace("@openbot.test", "@sub.openbot.test"),
      ALICE.replace("-", "+"),
    ];

    for (const email of lookalikes) {
      await expect(signUp(auth, email)).rejects.toMatchObject({
        status: "FORBIDDEN",
        message: ADDRESS_REFUSAL_MESSAGE,
      });
      expect(await accountsFor(email.toLowerCase())).toHaveLength(0);
    }
  });

  test("gives no new session to an account that exists and is no longer on the list", async () => {
    const userId = await existingAccount(BOB);
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });
    const adapter = await adapterOf(auth);

    await expect(adapter.createSession(userId)).rejects.toMatchObject({
      status: "FORBIDDEN",
      message: ADDRESS_REFUSAL_MESSAGE,
    });

    expect(await sessionsFor(userId)).toHaveLength(0);
  });

  test("keeps signing in an account that exists and is on the list", async () => {
    const userId = await existingAccount(ALICE);
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });
    const adapter = await adapterOf(auth);

    await adapter.createSession(userId);

    expect(await sessionsFor(userId)).toHaveLength(1);
  });

  test("lets the administrator the configuration names sign in, and keeps the role", async () => {
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });

    const { userId } = await signUp(auth, ADMIN);

    const roles = await database
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    expect(roles.map((row) => row.role)).toEqual(["admin"]);
  });

  test("does not undo the removal an administrator made: a listed address that was removed stays out", async () => {
    const auth = authWith(
      { SIGNIN_ALLOWED_EMAILS: LISTED },
      { revoked: [ALICE] },
    );

    await expect(signUp(auth, ALICE)).rejects.toMatchObject({
      status: "FORBIDDEN",
      message: REMOVED_MESSAGE,
    });
    expect(await accountsFor(ALICE)).toHaveLength(0);

    const userId = await existingAccount(ALICE);
    const adapter = await adapterOf(auth);
    await expect(adapter.createSession(userId)).rejects.toMatchObject({
      status: "FORBIDDEN",
      message: REMOVED_MESSAGE,
    });
  });
});

describe("with the domain list as well", () => {
  const BOTH = {
    SIGNIN_ALLOWED_EMAIL_DOMAINS: "openbot.test",
    SIGNIN_ALLOWED_EMAILS: LISTED,
  };

  test("an address has to pass both: the list narrows the domain, never widens it", async () => {
    const auth = authWith(BOTH);

    await signUp(auth, ALICE);
    expect(await accountsFor(ALICE)).toHaveLength(1);

    // At the domain, and not on the list.
    await expect(signUp(auth, BOB)).rejects.toMatchObject({
      message: ADDRESS_REFUSAL_MESSAGE,
    });
    // Not at the domain, so the domain list says no first, in its own words.
    await expect(signUp(auth, OUTSIDER)).rejects.toMatchObject({
      message: DOMAIN_REFUSAL_MESSAGE,
    });
    expect(await accountsFor(BOB)).toHaveLength(0);
    expect(await accountsFor(OUTSIDER)).toHaveLength(0);
  });
});

describe("a deployment that has not set the list", () => {
  // Guards of unchanged behaviour. They hold on main as well, and the day one stops holding an
  // upgrade has begun refusing people nobody told it to refuse.
  test("admits whom it admitted before: new accounts and existing ones", async () => {
    const auth = authWith({});

    const { userId } = await signUp(auth, BOB);
    expect(await sessionsFor(userId)).toHaveLength(1);

    const existing = await existingAccount(ALICE);
    const adapter = await adapterOf(auth);
    await adapter.createSession(existing);
    expect(await sessionsFor(existing)).toHaveLength(1);
  });

  test("keeps the domain list exactly as it was", async () => {
    const auth = authWith({ SIGNIN_ALLOWED_EMAIL_DOMAINS: "openbot.test" });

    await signUp(auth, BOB);
    expect(await accountsFor(BOB)).toHaveLength(1);

    await expect(signUp(auth, OUTSIDER)).rejects.toMatchObject({
      status: "FORBIDDEN",
      message: DOMAIN_REFUSAL_MESSAGE,
    });
    expect(await accountsFor(OUTSIDER)).toHaveLength(0);
  });

  test("writes no refusal on the trail", async () => {
    const auth = authWith({});
    const visitor = fresh("visitor");

    await signUp(auth, visitor);

    expect(await refusalsFor(visitor)).toHaveLength(0);
  });
});

describe("the trail", () => {
  test("a refused new address is written down with the address and the reason, and nothing else about the list", async () => {
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });
    const stranger = fresh("stranger");

    await expect(signUp(auth, stranger)).rejects.toMatchObject({
      status: "FORBIDDEN",
    });

    const rows = await refusalsFor(stranger);
    expect(rows).toHaveLength(1);
    expect(rows[0].targetType).toBe("person");
    expect(rows[0].payload).toEqual({
      email: stranger,
      reason: ADDRESS_REFUSAL_REASON,
    });
  });

  test("a refused session is written down against the account it was for", async () => {
    const former = fresh("former");
    const userId = await existingAccount(former);
    const auth = authWith({ SIGNIN_ALLOWED_EMAILS: LISTED });
    const adapter = await adapterOf(auth);

    await expect(adapter.createSession(userId)).rejects.toMatchObject({
      status: "FORBIDDEN",
    });

    const rows = await refusalsFor(former);
    expect(rows).toHaveLength(1);
    expect(rows[0].targetId).toBe(userId);
    expect(rows[0].actorUserId).toBe(userId);
    expect((rows[0].payload as { reason: string }).reason).toBe(
      ADDRESS_REFUSAL_REASON,
    );
  });

  test("a trail that cannot be written does not turn a refusal into an admission", async () => {
    const broken: AuditStore = {
      insert: async () => {
        throw new Error("the trail is unavailable");
      },
    };
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const userId = await existingAccount(OUTSIDER);
      const auth = authWith(
        { SIGNIN_ALLOWED_EMAILS: LISTED },
        { auditStore: broken },
      );
      const adapter = await adapterOf(auth);

      await expect(signUp(auth, BOB)).rejects.toMatchObject({
        status: "FORBIDDEN",
        message: ADDRESS_REFUSAL_MESSAGE,
      });
      await expect(adapter.createSession(userId)).rejects.toMatchObject({
        status: "FORBIDDEN",
        message: ADDRESS_REFUSAL_MESSAGE,
      });

      expect(await accountsFor(BOB)).toHaveLength(0);
      expect(await sessionsFor(userId)).toHaveLength(0);
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});
