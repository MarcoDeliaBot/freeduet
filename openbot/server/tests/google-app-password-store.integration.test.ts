import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { withApprovalContext } from "@openbot/toolkit/continuation";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import { createAuditStore } from "../src/audit";
import type { ActionPolicy } from "../src/computer/policy";
import { createCredentialStore, decryptSecret } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agents,
  approvalRequests,
  approvalRules,
  auditEvents,
  credentials,
  mcpServers,
  mcpTools,
  mcpUserCredentials,
  pluginGrants,
  users,
} from "../src/db/schema";
import {
  catalogueEntry,
  classifyTool,
  GOOGLE_APP_PASSWORD,
} from "../src/plugins/catalogue";
import { createGoogleImapTransport } from "../src/plugins/google-imap";
import { MAIL_PRESETS } from "../src/plugins/mail-presets";
import { createPluginStore, PluginRefusedError } from "../src/plugins/store";
import {
  SecretRefusedError,
  type UserSecret,
  type VerifyOutcome,
} from "../src/plugins/user-secret";
import {
  createPrivateShareCheck,
  PRIVATE_SHARE_TOOL_REF,
} from "../src/proactive/private-share";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { FakeGmail, hexOf, secretsOf, textMail } from "./support/fake-imap";

/**
 * The app-password connection, on a real database.
 *
 * What is under test is everything between the form and the vault: that a pasted secret is checked
 * before it is kept, kept encrypted and nowhere else, never written into the trail or an answer, and
 * only ever used for the person who pasted it. The mailbox behind it is the in-memory fake, reached
 * through the transport's own factories, so no test needs Gmail and none mocks a module.
 *
 * The last group is the approval gate through the real approval service: sending a reply over IMAP
 * and SMTP waits for the person exactly as sending one over OAuth does.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const serverId = GOOGLE_APP_PASSWORD;
const botId = `agent_apw_${suite}`;
const maya = `user_apw_maya_${suite}`;
const leo = `user_apw_leo_${suite}`;
const nobody = `user_apw_nobody_${suite}`;
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const TOOLS = [
  "gmail_search_messages",
  "gmail_read_message",
  "gmail_send_reply",
  "calendar_list_events",
];

/** What the person pastes. Values are invented for this file. */
const MAYA_INPUT = {
  address: "maya@example.com",
  appPassword: "qwer tyui opas dfgh",
  calendarUrl:
    "https://calendar.google.com/calendar/ical/maya%40example.com/private-4f9a1c2b7d/basic.ics",
};
const LEO_INPUT = {
  address: "leo@example.com",
  appPassword: "zxcv bnma sdfg hjkl",
  calendarUrl:
    "https://calendar.google.com/calendar/ical/leo%40example.com/private-9z8y7x6w5v/basic.ics",
};
const MAYA_SECRET: UserSecret = {
  address: MAYA_INPUT.address,
  password: "qwertyuiopasdfgh",
  calendarUrl: MAYA_INPUT.calendarUrl,
};
const LEO_SECRET: UserSecret = {
  address: LEO_INPUT.address,
  password: "zxcvbnmasdfghjkl",
  calendarUrl: LEO_INPUT.calendarUrl,
};
const EVERYTHING_SECRET = [
  ...secretsOf(MAYA_SECRET),
  ...secretsOf(LEO_SECRET),
  MAYA_SECRET.address,
  LEO_SECRET.address,
];

const verified: { preset: unknown; secret: UserSecret }[] = [];
let verdict: VerifyOutcome = { ok: true, calendar: true };

const gmail = new FakeGmail();
/** Which secret each connection to the mailbox was opened with, in order. */
const openedAs: string[] = [];
const transport = createGoogleImapTransport({
  imap: (options) => {
    openedAs.push(options.user);
    return gmail.imap(options);
  },
  smtp: gmail.smtp,
  fetch: async () => new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
});

const approvals = createApprovalStore(database);
const service = createApprovalService(approvals, undefined, undefined, {
  review: async () =>
    JSON.stringify({
      verdict: "proceed",
      preApproved: true,
      safety: "none",
      reason: "Test reviewer.",
    }),
});

const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: createAuditStore(database),
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => policy,
  approvalGate: (candidate) => service.gate(candidate),
  privateShareCheck: createPrivateShareCheck({ approvals }),
  verifyUserSecret: async (preset, secret) => {
    verified.push({ preset, secret });
    return verdict;
  },
  callVendor: (connection, toolName, args) =>
    transport.callTool(connection, toolName, args),
});

let serverWasThere = false;

const ANA = textMail({
  uid: 10,
  emailId: BigInt("0x18f3a0c2d4e5b601").toString(),
  threadId: BigInt("0x18f3a0c2d4e5b600").toString(),
  headers: {
    From: "Ana Pereira <ana@hearthandco.com>",
    To: "maya@example.com",
    Subject: "Friday ship date for the 120 mugs?",
    Date: "Thu, 22 Oct 2026 07:10:00 -0700",
    "Message-ID": "<n01@hearthandco.com>",
  },
  body: "Can you confirm Friday?",
});

beforeAll(async () => {
  const [existing] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, serverId));
  serverWasThere = existing !== undefined;

  await database
    .insert(agents)
    .values({ id: botId, name: botId, type: "remote_ag_ui", configuration: {} })
    .onConflictDoNothing();
  for (const id of [maya, leo, nobody]) {
    await database
      .insert(users)
      .values({
        id,
        email: `${id}@example.test`,
        name: id,
        emailVerified: false,
      })
      .onConflictDoNothing();
  }
  // The catalogue's own entry, added the way an administrator adds it.
  await store.addServer({ key: serverId, by: maya });
  for (const name of TOOLS) {
    await database
      .insert(pluginGrants)
      .values({ kind: "mcp", ref: `${serverId}/${name}`, agentId: botId })
      .onConflictDoNothing();
  }
  gmail.messages = [ANA];
  gmail.searches.set("in:inbox newer_than:1d", [10]);
});

afterAll(async () => {
  await database
    .delete(approvalRequests)
    .where(inArray(approvalRequests.ownerUserId, [maya, leo]));
  await database
    .delete(approvalRules)
    .where(inArray(approvalRules.ownerUserId, [maya, leo]));
  await database
    .delete(mcpUserCredentials)
    .where(
      and(
        eq(mcpUserCredentials.serverId, serverId),
        inArray(mcpUserCredentials.userId, [maya, leo, nobody]),
      ),
    );
  await database
    .delete(credentials)
    .where(
      and(
        eq(credentials.provider, serverId),
        inArray(credentials.keyId, [maya, leo, nobody]),
      ),
    );
  await database.delete(pluginGrants).where(
    and(
      eq(pluginGrants.agentId, botId),
      inArray(
        pluginGrants.ref,
        TOOLS.map((name) => `${serverId}/${name}`),
      ),
    ),
  );
  if (!serverWasThere) {
    await database.delete(mcpTools).where(eq(mcpTools.serverId, serverId));
    await database.delete(mcpServers).where(eq(mcpServers.id, serverId));
  }
  await database.delete(agents).where(eq(agents.id, botId));
  await database.delete(users).where(inArray(users.id, [maya, leo, nobody]));
  await database.$client.close();
});

const rowsOf = (userId: string) =>
  database
    .select()
    .from(credentials)
    .where(
      and(
        eq(credentials.kind, "mcp_user_secret"),
        eq(credentials.provider, serverId),
        eq(credentials.keyId, userId),
      ),
    );

const pointerOf = async (userId: string) =>
  (
    await database
      .select()
      .from(mcpUserCredentials)
      .where(
        and(
          eq(mcpUserCredentials.serverId, serverId),
          eq(mcpUserCredentials.userId, userId),
        ),
      )
  )[0];

const trail = async () =>
  database
    .select()
    .from(auditEvents)
    .where(
      sql`${auditEvents.payload}::text like ${`%${suite}%`} or ${auditEvents.targetId} like ${`%${serverId}%`}`,
    );

const connect = (userId: string, body: unknown) =>
  store.connectUserSecret({ serverId, userId, body });

describe("the entry is added like any other, and reads and writes are recorded as such", () => {
  test("the tools it lists are the four, and each is classified as the entry says: the one send a write, the rest reads", async () => {
    const listed = await database
      .select({ name: mcpTools.name, effect: mcpTools.effect })
      .from(mcpTools)
      .where(eq(mcpTools.serverId, serverId));
    expect(listed.map((tool) => tool.name).sort()).toEqual([...TOOLS].sort());
    const entry = catalogueEntry(serverId);
    const classified = new Map(
      listed.map((tool) => [
        tool.name,
        // As a call decides it: the entry's lists, then whatever the listing recorded.
        classifyTool(entry, tool.name, true, tool.effect),
      ]),
    );
    expect(classified.get("gmail_send_reply")).toBe("write");
    for (const name of [
      "gmail_search_messages",
      "gmail_read_message",
      "calendar_list_events",
    ]) {
      expect(classified.get(name)).toBe("read");
    }
  });

  test("the row is the catalogue's and needs no OAuth client or credential to be ready", async () => {
    const servers = await store.listServers();
    const row = servers.find((server) => server.id === serverId);
    expect(row?.title).toBe("Gmail and Google Calendar (app password)");
    expect(row?.hasCredential).toBe(false);
  });
});

describe("connecting", () => {
  test("a person with nothing pasted is not connected", async () => {
    expect(await store.userSecretStatus({ serverId, userId: maya })).toEqual({
      connected: false,
    });
  });

  test("a secret that works is stored, encrypted, and answered with the address and a yes for the calendar", async () => {
    verified.length = 0;
    verdict = { ok: true, calendar: true };
    const done = await connect(maya, MAYA_INPUT);
    expect(done).toEqual({
      address: "maya@example.com",
      calendar: true,
      reconnected: false,
    });
    // Checked first, against the Gmail preset, with the password as Google's grouping is stripped.
    expect(verified).toHaveLength(1);
    expect(verified[0]?.preset).toBe(MAIL_PRESETS.gmail);
    expect(verified[0]?.secret).toEqual(MAYA_SECRET);

    const rows = await rowsOf(maya);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.revokedAt).toBeNull();
    // The plain columns say a connection exists and for which server, and nothing the person typed.
    expect(row?.metadata).toEqual({ server: serverId });
    const plain = JSON.stringify({ ...row, encryptedValue: undefined });
    for (const secret of EVERYTHING_SECRET) {
      expect(plain).not.toContain(secret);
    }
    // At rest it is ciphertext, and decrypting it gives the three fields and no others.
    const stored = String(row?.encryptedValue);
    for (const secret of EVERYTHING_SECRET) {
      expect(stored).not.toContain(secret);
    }
    const opened = JSON.parse(
      await decryptSecret(ENCRYPTION_KEY, row?.encryptedValue as never),
    ) as Record<string, unknown>;
    expect(opened).toEqual({
      v: 1,
      address: MAYA_SECRET.address,
      password: MAYA_SECRET.password,
      ical: MAYA_SECRET.calendarUrl,
    });

    const pointer = await pointerOf(maya);
    expect(pointer?.credentialId).toBe(row?.id as string);
    expect(pointer?.scope).toBe("app-password");
  });

  test("the status shows the address and whether there is a calendar, and nothing else of it", async () => {
    const status = await store.userSecretStatus({ serverId, userId: maya });
    expect(status).toMatchObject({
      connected: true,
      address: "maya@example.com",
      calendar: true,
    });
    expect(Object.keys(status).sort()).toEqual([
      "address",
      "calendar",
      "connected",
      "connectedAt",
    ]);
    const text = JSON.stringify(status);
    for (const secret of secretsOf(MAYA_SECRET)) {
      expect(text).not.toContain(secret);
    }
  });

  test("a secret Gmail refuses is not stored, says why in fixed words, and leaves an earlier connection as it was", async () => {
    verdict = {
      ok: false,
      status: 422,
      message: "Gmail did not accept that address and app password.",
    };
    const before = await rowsOf(maya);
    const failure = await connect(maya, {
      ...MAYA_INPUT,
      appPassword: "wrongwrongwrongw",
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SecretRefusedError);
    expect((failure as SecretRefusedError).status).toBe(422);
    expect((failure as Error).message).toBe(
      "Gmail did not accept that address and app password.",
    );
    expect((failure as Error).message).not.toContain("wrongwrongwrongw");
    expect(await rowsOf(maya)).toEqual(before);
    expect(
      (await store.userSecretStatus({ serverId, userId: maya })).connected,
    ).toBe(true);

    // A person with none stays with none.
    const failed = await connect(nobody, MAYA_INPUT).catch(
      (error: unknown) => error,
    );
    expect(failed).toBeInstanceOf(SecretRefusedError);
    expect(await rowsOf(nobody)).toEqual([]);
    expect(await pointerOf(nobody)).toBeUndefined();
    verdict = { ok: true, calendar: true };
  });

  test("input that is not an address, a password or a Google calendar link is refused before Gmail is asked, without being repeated", async () => {
    verified.length = 0;
    for (const body of [
      null,
      "text",
      [],
      {},
      { address: "not an address", appPassword: "qwertyuiopasdfgh" },
      { address: "maya@example.com", appPassword: "short" },
      { address: "maya@example.com", appPassword: "x".repeat(300) },
      { address: "maya@example.com", appPassword: "qwertyuiop\u0000asdfgh" },
      {
        address: "maya@example.com",
        appPassword: "qwertyuiopasdfgh",
        calendarUrl: "https://evil.example/calendar/ical/x/basic.ics",
      },
      {
        address: "maya@example.com",
        appPassword: "qwertyuiopasdfgh",
        calendarUrl: "http://calendar.google.com/calendar/ical/x/basic.ics",
      },
    ]) {
      const refused = await connect(nobody, body).catch(
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(SecretRefusedError);
      expect((refused as SecretRefusedError).status).toBe(400);
      expect((refused as Error).message).not.toContain("qwertyuiopasdfgh");
      expect((refused as Error).message).not.toContain("evil.example");
    }
    expect(verified).toEqual([]);
    expect(await rowsOf(nobody)).toEqual([]);
  });

  test("the address and calendar link in a body are all that is read: a host, a port or a user in it changes nothing", async () => {
    verified.length = 0;
    await connect(leo, {
      ...LEO_INPUT,
      host: "evil.example",
      imapHost: "evil.example",
      port: 143,
      userId: maya,
      user: maya,
      serverId: "other",
    });
    expect(verified[0]?.secret).toEqual(LEO_SECRET);
    // Leo's session is who it was stored for, whatever the body named.
    expect(await rowsOf(maya)).toHaveLength(1);
    expect(
      (await store.userSecretStatus({ serverId, userId: leo })).connected,
    ).toBe(true);
  });

  test("an app that is not connected this way is refused, and Gmail is not asked", async () => {
    const before = verified.length;
    await expect(
      store.connectUserSecret({
        serverId: "google-workspace",
        userId: maya,
        body: MAYA_INPUT,
      }),
    ).rejects.toThrow();
    expect(verified.length).toBe(before);
  });

  test("a password and no calendar is a connection with no calendar", async () => {
    verified.length = 0;
    const done = await connect(nobody, {
      address: "nobody@example.com",
      appPassword: "abcdabcdabcdabcd",
    });
    expect(done.calendar).toBe(false);
    // One check was made, and it was told of no calendar.
    expect(verified).toHaveLength(1);
    expect(
      verified.map((attempt) => attempt.secret.calendarUrl ?? null),
    ).toEqual([null]);
    const status = await store.userSecretStatus({ serverId, userId: nobody });
    expect(status).toMatchObject({ connected: true, calendar: false });
    await store.disconnectUserSecret({ serverId, userId: nobody, by: nobody });
  });

  test("connecting again replaces the secret: the old one is revoked, one is live, and the pointer follows", async () => {
    const [first] = await rowsOf(maya);
    const done = await connect(maya, {
      ...MAYA_INPUT,
      appPassword: "mnbvcxzlkjhgfdsa",
    });
    expect(done.reconnected).toBe(true);
    const rows = await rowsOf(maya);
    expect(rows).toHaveLength(2);
    const live = rows.filter((row) => row.revokedAt === null);
    expect(live).toHaveLength(1);
    expect(rows.find((row) => row.id === first?.id)?.revokedAt).not.toBeNull();
    expect((await pointerOf(maya))?.credentialId).toBe(live[0]?.id as string);
    // Put the first password back for the tests below.
    await connect(maya, MAYA_INPUT);
  });
});

describe("what the trail says", () => {
  test("it records that a connection was made, by whom, and never what was pasted", async () => {
    const rows = await trail();
    const connected = rows.filter(
      (row) =>
        row.eventType === "mcp.account_connected" &&
        row.targetId === serverId &&
        JSON.stringify(row.payload).includes(suite),
    );
    expect(connected.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      const text = JSON.stringify(row);
      for (const secret of EVERYTHING_SECRET) {
        expect(text).not.toContain(secret);
      }
    }
    expect(connected[0]?.payload).toMatchObject({
      server: serverId,
      scope: "app-password",
    });
  });
});

describe("whose secret a call goes out with", () => {
  const call = (userId: string, tool = "gmail_search_messages") =>
    store.callTool({
      ref: `${serverId}/${tool}`,
      args: {},
      botId,
      actorId: userId,
      initiator: { kind: "person" },
    });

  test("each person's own, and never another's", async () => {
    openedAs.length = 0;
    const mine = await call(maya);
    const his = await call(leo);
    expect(mine.isError).toBe(false);
    expect(his.isError).toBe(false);
    expect(openedAs).toEqual(["maya@example.com", "leo@example.com"]);
  });

  test("a person who has pasted nothing is refused, told to connect, and nobody's mailbox is opened", async () => {
    openedAs.length = 0;
    const refused = await call(nobody).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(PluginRefusedError);
    expect(String((refused as Error).message)).toContain("not connected");
    expect(openedAs).toEqual([]);
  });

  test("a run nobody is attributed to is refused and falls back to nobody's mailbox", async () => {
    openedAs.length = 0;
    await expect(call("")).rejects.toBeInstanceOf(PluginRefusedError);
    expect(openedAs).toEqual([]);
  });

  test("the row's own address is never what the call goes to: a row edited to name another host reaches nowhere else", async () => {
    await database
      .update(mcpServers)
      .set({ url: "https://evil.example/imap" })
      .where(eq(mcpServers.id, serverId));
    try {
      openedAs.length = 0;
      const hosts: string[] = [];
      const guarded = createGoogleImapTransport({
        imap: (options) => {
          hosts.push(`${options.host}:${options.port}`);
          return gmail.imap(options);
        },
        smtp: gmail.smtp,
      });
      const probe = createPluginStore({
        brokerProvider: "composio",
        database,
        auditStore: createAuditStore(database),
        credentials: createCredentialStore(database),
        encryptionKey: ENCRYPTION_KEY,
        policy: () => policy,
        callVendor: (connection, toolName, args) =>
          guarded.callTool(connection, toolName, args),
      });
      await probe
        .callTool({
          ref: `${serverId}/gmail_search_messages`,
          args: {},
          botId,
          actorId: maya,
          initiator: { kind: "person" },
        })
        .catch(() => undefined);
      expect(hosts.every((host) => host === "imap.gmail.com:993")).toBe(true);
    } finally {
      await store.addServer({ key: serverId, by: maya });
    }
  });

  test("a call's trail row says it was made as the person, and carries none of what was pasted", async () => {
    await call(maya);
    const rows = await database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetId, `${serverId}/gmail_search_messages`));
    const mine = rows.filter(
      (row) => (row.payload as { actor?: string }).actor === maya,
    );
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.at(-1)?.payload).toMatchObject({
      server: serverId,
      effect: "read",
      // The trail names whose account the call reached: the asker's, by id.
      reachedAs: maya,
    });
    for (const row of rows) {
      for (const secret of EVERYTHING_SECRET) {
        expect(JSON.stringify(row)).not.toContain(secret);
      }
    }
  });

  test("a failure at the mailbox is recorded in fixed words, with no secret in the trail", async () => {
    gmail.connectError = Object.assign(
      new Error(`LOGIN ${MAYA_SECRET.address} ${MAYA_SECRET.password}`),
      { authenticationFailed: true },
    );
    try {
      const failed = await call(maya);
      expect(failed.isError).toBe(true);
    } finally {
      gmail.connectError = null;
    }
    const rows = await database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "mcp.call_failed"));
    for (const row of rows) {
      for (const secret of EVERYTHING_SECRET) {
        expect(JSON.stringify(row)).not.toContain(secret);
      }
    }
  });
});

describe("the approval gate, on the real approval service", () => {
  const ask = (threadId: string) => ({
    threadId,
    inReplyTo: hexOf(ANA.emailId),
    to: ["Ana Pereira <ana@hearthandco.com>"],
    subject: "Friday ship date for the 120 mugs?",
    body: "Hi Ana, Friday works. Maya",
  });

  const send = (args: Record<string, unknown>) =>
    store.callTool({
      ref: `${serverId}/gmail_send_reply`,
      args,
      botId,
      actorId: maya,
      initiator: { kind: "person" },
    });

  const inRun = <T>(runThread: string, args: unknown, run: () => Promise<T>) =>
    withApprovalContext(
      {
        runId: randomUUID(),
        threadId: runThread,
        toolCallId: randomUUID(),
        toolName: "google-imap__gmail_send_reply",
        args,
        messages: [
          { id: "u1", role: "user", content: "Tell Ana Friday works." },
        ],
        state: {},
        context: [],
        forwardedProps: {},
      },
      run,
    );

  const pending = async () =>
    (await approvals.list(maya)).filter(
      (request) => request.status === "pending",
    );

  test("reading never asks", async () => {
    gmail.sent.length = 0;
    const search = await inRun("thread-read", {}, () =>
      store.callTool({
        ref: `${serverId}/gmail_search_messages`,
        args: {},
        botId,
        actorId: maya,
        initiator: { kind: "person" },
      }),
    );
    expect(search.isError).toBe(false);
    expect(await pending()).toEqual([]);
  });

  test("a reply waits for the person, and nothing is sent until they answer", async () => {
    gmail.sent.length = 0;
    const args = ask("t1");
    const waiting = await inRun("thread-wait", args, () => send(args)).catch(
      (error: unknown) => error,
    );
    expect(waiting).toBeInstanceOf(HeadlessToolSuspension);
    expect(gmail.sent).toEqual([]);
    expect(gmail.smtpClients).toEqual([]);
    const asked = await pending();
    expect(asked).toHaveLength(1);
    expect(asked[0]?.action.toolRef).toBe(PRIVATE_SHARE_TOOL_REF);
    const shared = asked[0]?.action.args as { audience?: unknown } | undefined;
    expect(String(shared?.audience)).toContain("ana@hearthandco.com");
  });

  test("refusing never sends it", async () => {
    const [request] = await pending();
    if (!request) throw new Error("nothing was waiting");
    await approvals.decide(maya, request.id, "deny");
    expect(gmail.sent).toEqual([]);
  });

  test("allow once sends that reply, in the thread, to the people on it, and only that one", async () => {
    gmail.sent.length = 0;
    const args = ask(hexOf(ANA.threadId));
    await inRun("thread-once", args, () => send(args)).catch(() => undefined);
    const [request] = await pending();
    if (!request) throw new Error("nothing was waiting");
    await approvals.decide(maya, request.id, "allow_once");

    const result = await inRun("thread-once", args, () => send(args));
    expect(result.isError).toBe(false);
    expect(gmail.sent).toHaveLength(1);
    expect(gmail.sent[0]?.envelope.to).toEqual(["ana@hearthandco.com"]);
    expect(gmail.sent[0]?.inReplyTo).toBe("<n01@hearthandco.com>");
    expect(gmail.sent[0]?.from).toBe("maya@example.com");

    // Once means once: the same reply in another conversation asks again.
    const again = await inRun("thread-once-again", args, () =>
      send(args),
    ).catch((error: unknown) => error);
    expect(again).toBeInstanceOf(HeadlessToolSuspension);
    expect(gmail.sent).toHaveLength(1);
    const [left] = await pending();
    if (left) await approvals.decide(maya, left.id, "deny");
  });

  test("outside a run that can ask, a send nobody allowed is refused and nothing goes out", async () => {
    gmail.sent.length = 0;
    await expect(send(ask(hexOf(ANA.threadId)))).rejects.toBeInstanceOf(
      PluginRefusedError,
    );
    expect(gmail.sent).toEqual([]);
  });
});

describe("ending a connection", () => {
  test("only the asker's own is ended: the secret is revoked, the pointer goes, and the next call is refused", async () => {
    const ended = await store.disconnectUserSecret({
      serverId,
      userId: maya,
      by: maya,
    });
    expect(ended).toEqual({ disconnected: true });
    expect((await rowsOf(maya)).every((row) => row.revokedAt !== null)).toBe(
      true,
    );
    expect(await pointerOf(maya)).toBeUndefined();
    expect(await store.userSecretStatus({ serverId, userId: maya })).toEqual({
      connected: false,
    });
    await expect(
      store.callTool({
        ref: `${serverId}/gmail_search_messages`,
        args: {},
        botId,
        actorId: maya,
        initiator: { kind: "person" },
      }),
    ).rejects.toBeInstanceOf(PluginRefusedError);

    // Leo's is exactly as it was.
    expect(
      (await store.userSecretStatus({ serverId, userId: leo })).connected,
    ).toBe(true);
    expect((await rowsOf(leo)).some((row) => row.revokedAt === null)).toBe(
      true,
    );
  });

  test("the trail says the person ended it and that Google was not asked, and holds nothing they pasted", async () => {
    const rows = await database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "mcp.account_disconnected"));
    const mine = rows.filter(
      (row) => (row.payload as { owner?: string }).owner === maya,
    );
    expect(mine.at(-1)?.payload).toMatchObject({
      reason: "self",
      vendorRevocationRequested: false,
      server: serverId,
    });
    for (const row of rows) {
      for (const secret of EVERYTHING_SECRET) {
        expect(JSON.stringify(row)).not.toContain(secret);
      }
    }
  });

  test("ending one that is not there changes nothing and says so", async () => {
    expect(
      await store.disconnectUserSecret({
        serverId,
        userId: nobody,
        by: nobody,
      }),
    ).toEqual({ disconnected: false });
    expect(
      await store.disconnectUserSecret({ serverId, userId: "", by: "" }),
    ).toEqual({ disconnected: false });
  });

  test("removing the connector ends everybody's pasted secret too, so adding it back grants nothing", async () => {
    await store.removeServer(serverId, maya);
    const rows = await database
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.kind, "mcp_user_secret"),
          eq(credentials.provider, serverId),
          inArray(credentials.keyId, [maya, leo]),
        ),
      );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    expect(await pointerOf(leo)).toBeUndefined();
    await store.addServer({ key: serverId, by: maya });
    expect(await store.userSecretStatus({ serverId, userId: leo })).toEqual({
      connected: false,
    });
  });
});
