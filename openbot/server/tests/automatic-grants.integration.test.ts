/**
 * Tools an update adds reach the member that holds the mailbox (docs/design/connect-from-chat.md, D45),
 * against PostgreSQL. The mark is written only by the Connect button; the top-up is for the two Gmail
 * apps and for members of FreeDuet's package only; a set is automatic only when EVERY row of it is
 * marked; the one-off command refuses what it must and never relabels a send.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { createAuditStore } from "../src/audit";
import { createDatabase } from "../src/db/client";
import {
  agents,
  auditEvents,
  deploymentPackages,
  pluginGrants,
} from "../src/db/schema";
import { applyAutomaticGrants } from "../src/freeduet/automatic-grants";
import { FREEDUET_TENANT_ID } from "../src/freeduet/hub-grants";
import {
  AUTOMATIC_GRANT,
  automaticToolRefs,
  FREEDUET_PACKAGE_TENANT,
  MarkRefused,
  markGrantsAutomatic,
  topUpAutomaticGrants,
} from "../src/plugins/plugin-store/automatic";
import { createPluginStore } from "../src/plugins/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { stubBroker } from "./support/stub-broker";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const auditStore = createAuditStore(database);
const suite = randomUUID().slice(0, 8);
const SERVER = "google-imap";
const bot = (name: string) => `ag-${name}-${suite}`;
const MEMBERS = [
  "auto",
  "hand",
  "old",
  "trim",
  "mixed",
  "notion",
  "other",
  "one",
  "send",
  "chat",
].map(bot);
const USER_MADE = bot("usermade");
const ADMIN = `admin-${suite}@example.com`;
const { broker } = stubBroker({ grantIsLocal: true, authorizations: null });
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore,
  credentials: {} as never,
  encryptionKey: "x".repeat(44),
  policy: () => ({ mode: "enforce", deny: [], allow: ["true"] }),
  broker,
});

const ref = (name: string, server = SERVER) => `${server}/${name}`;
const OLD_SET = ["gmail_search_messages", "gmail_read_message"];
let madePackage: string | null = null;

async function held(agentId: string) {
  const rows = await database
    .select({ ref: pluginGrants.ref, by: pluginGrants.grantedBy })
    .from(pluginGrants)
    .where(eq(pluginGrants.agentId, agentId));
  return new Map(rows.map((row) => [row.ref, row.by]));
}

async function put(
  agentId: string,
  name: string,
  by: string | null,
  server = SERVER,
) {
  await database
    .insert(pluginGrants)
    .values({ kind: "mcp", ref: ref(name, server), agentId, grantedBy: by });
}

beforeAll(async () => {
  const [existing] = await database
    .select({ id: deploymentPackages.id })
    .from(deploymentPackages)
    .where(eq(deploymentPackages.tenantId, FREEDUET_TENANT_ID));
  let packageId = existing?.id;
  if (!packageId) {
    const [made] = await database
      .insert(deploymentPackages)
      .values({ tenantId: FREEDUET_TENANT_ID, sourcePath: "x", checksum: "x" })
      .returning({ id: deploymentPackages.id });
    packageId = made?.id;
    madePackage = packageId ?? null;
  }
  for (const id of MEMBERS)
    await database.insert(agents).values({
      id,
      name: id,
      type: "built_in",
      configuration: { systemPrompt: "Help." },
      packageId,
    });
  // A Bot nobody's package made: what a person created or imported.
  await database.insert(agents).values({
    id: USER_MADE,
    name: USER_MADE,
    type: "built_in",
    configuration: { systemPrompt: "Help." },
  });
});

afterAll(async () => {
  await database
    .delete(agents)
    .where(inArray(agents.id, [...MEMBERS, USER_MADE]));
  if (madePackage)
    await database
      .delete(deploymentPackages)
      .where(eq(deploymentPackages.id, madePackage));
  await database.$client.end({ timeout: 5 });
});

test("the package tenant this checks is FreeDuet's own", () => {
  expect(FREEDUET_PACKAGE_TENANT).toBe(FREEDUET_TENANT_ID);
});

describe("what an automatic grant may give", () => {
  test("the declared reads and organising writes, never a send", () => {
    const refs = automaticToolRefs(SERVER);
    expect(refs).toContain(ref("gmail_bin_messages"));
    expect(refs).toContain(ref("gmail_spam_messages"));
    expect(refs).not.toContain(ref("gmail_send_message"));
    expect(refs).not.toContain(ref("gmail_send_reply"));
  });

  test("an app with no catalogue entry declares nothing", () => {
    expect(automaticToolRefs("added-by-url")).toEqual([]);
  });
});

describe("top-up at start", () => {
  test("adds the declared tools a fully marked member lacks, once, audited", async () => {
    await store.grantAutomatically(SERVER, bot("auto"), "test");
    await store.revoke(
      "mcp",
      ref("gmail_spam_messages"),
      bot("auto"),
      AUTOMATIC_GRANT,
    );
    // Revoking by the product's own mark keeps the set automatic: put the old state back by hand-free means.
    await database
      .update(pluginGrants)
      .set({ grantedBy: AUTOMATIC_GRANT })
      .where(eq(pluginGrants.agentId, bot("auto")));
    const first = await topUpAutomaticGrants(database, auditStore);
    expect(first.find((done) => done.bot === bot("auto"))?.added).toEqual([
      ref("gmail_spam_messages"),
    ]);
    const second = await topUpAutomaticGrants(database, auditStore);
    expect(second.find((done) => done.bot === bot("auto"))).toBeUndefined();
    const after = await held(bot("auto"));
    expect(after.has(ref("gmail_send_message"))).toBe(false);
    const audited = await database
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.targetId, ref("gmail_spam_messages")));
    expect(audited.length).toBeGreaterThan(0);
  });

  test("leaves a set a person made by hand alone", async () => {
    for (const name of OLD_SET)
      await store.grant("mcp", ref(name), bot("hand"), ADMIN);
    await topUpAutomaticGrants(database, auditStore);
    expect([...(await held(bot("hand"))).keys()].sort()).toEqual(
      OLD_SET.map((n) => ref(n)).sort(),
    );
  });

  test("leaves an installation's unmarked rows alone (no guessing)", async () => {
    for (const name of OLD_SET) await put(bot("old"), name, null);
    await topUpAutomaticGrants(database, auditStore);
    expect((await held(bot("old"))).size).toBe(OLD_SET.length);
  });

  test("one hand row among marked rows skips the whole Bot and server", async () => {
    await put(bot("mixed"), "gmail_search_messages", AUTOMATIC_GRANT);
    await put(bot("mixed"), "gmail_read_message", ADMIN);
    await topUpAutomaticGrants(database, auditStore);
    expect((await held(bot("mixed"))).size).toBe(2);
  });

  test("an app that is not on the allow-list is never topped up, marked rows or not", async () => {
    await put(bot("notion"), "search", AUTOMATIC_GRANT, "notion");
    await topUpAutomaticGrants(database, auditStore);
    expect((await held(bot("notion"))).size).toBe(1);
  });

  test("a Bot nobody's package made is never topped up, and is refused the button's grant", async () => {
    await put(USER_MADE, "gmail_search_messages", AUTOMATIC_GRANT);
    await topUpAutomaticGrants(database, auditStore);
    expect((await held(USER_MADE)).size).toBe(1);
    expect(await store.grantAutomatically(SERVER, USER_MADE, "test")).toEqual(
      [],
    );
    expect(await store.automaticEligible(SERVER, USER_MADE)).toBe(false);
    expect(await store.automaticEligible("notion", bot("auto"))).toBe(false);
    expect(await store.automaticEligible(SERVER, bot("auto"))).toBe(true);
  });

  test("a tool a person takes away by hand is not handed back", async () => {
    await store.grantAutomatically(SERVER, bot("trim"), "test");
    await store.revoke("mcp", ref("gmail_spam_messages"), bot("trim"), ADMIN);
    await topUpAutomaticGrants(database, auditStore);
    const after = await held(bot("trim"));
    expect(after.has(ref("gmail_spam_messages"))).toBe(false);
    expect(after.get(ref("gmail_bin_messages"))).toBe(ADMIN);
  });

  test("a hand-made row is not relabelled by an automatic grant", async () => {
    await put(bot("other"), "gmail_bin_messages", ADMIN);
    // Mixed set: the button adds nothing at all.
    expect(
      await store.grantAutomatically(SERVER, bot("other"), "test"),
    ).toEqual([]);
    expect((await held(bot("other"))).get(ref("gmail_bin_messages"))).toBe(
      ADMIN,
    );
  });

  test("runs at start for FreeDuet's package only", async () => {
    await put(bot("chat"), "gmail_search_messages", AUTOMATIC_GRANT);
    await applyAutomaticGrants(database, auditStore, { tenantId: "other" });
    expect((await held(bot("chat"))).size).toBe(1);
    await applyAutomaticGrants(database, auditStore, { tenantId: "freeduet" });
    expect((await held(bot("chat"))).size).toBe(
      automaticToolRefs(SERVER).length,
    );
  });
});

describe("the one-off command", () => {
  test("refuses an unknown Bot, a Bot that is not a package member, and an app off the list", async () => {
    const run = (agentId: string, serverId = SERVER) =>
      markGrantsAutomatic(database, auditStore, {
        agentId,
        serverId,
        apply: true,
      });
    await expect(run(`nobody-${suite}`)).rejects.toBeInstanceOf(MarkRefused);
    await expect(run(USER_MADE)).rejects.toThrow("not a member");
    await expect(run(bot("one"), "notion")).rejects.toBeInstanceOf(MarkRefused);
  });

  test("a dry run lists the grants and writes nothing", async () => {
    for (const name of OLD_SET)
      await store.grant("mcp", ref(name), bot("one"), ADMIN);
    const done = await markGrantsAutomatic(database, auditStore, {
      agentId: bot("one"),
      serverId: SERVER,
      apply: false,
    });
    expect(done.marked).toEqual(OLD_SET.map((n) => ref(n)).sort());
    expect(done.added).toEqual([]);
    for (const by of (await held(bot("one"))).values()) expect(by).toBe(ADMIN);
  });

  test("--apply marks, audits, tops up at once, and a second run says there is nothing", async () => {
    const done = await markGrantsAutomatic(database, auditStore, {
      agentId: bot("one"),
      serverId: SERVER,
      apply: true,
    });
    expect(done.marked.length).toBe(OLD_SET.length);
    expect(done.added.length).toBe(
      automaticToolRefs(SERVER).length - OLD_SET.length,
    );
    for (const by of (await held(bot("one"))).values())
      expect(by).toBe(AUTOMATIC_GRANT);
    const again = await markGrantsAutomatic(database, auditStore, {
      agentId: bot("one"),
      serverId: SERVER,
      apply: true,
    });
    expect(again).toEqual({ marked: [], leftSend: [], added: [] });
  });

  test("never relabels a row for a send; the set is then not topped up", async () => {
    await put(bot("send"), "gmail_search_messages", ADMIN);
    await put(bot("send"), "gmail_send_message", ADMIN);
    const done = await markGrantsAutomatic(database, auditStore, {
      agentId: bot("send"),
      serverId: SERVER,
      apply: true,
    });
    expect(done.leftSend).toEqual([ref("gmail_send_message")]);
    const after = await held(bot("send"));
    expect(after.get(ref("gmail_send_message"))).toBe(ADMIN);
    expect(after.get(ref("gmail_search_messages"))).toBe(AUTOMATIC_GRANT);
    expect(done.added).toEqual([]);
    expect(after.size).toBe(2);
  });
});
