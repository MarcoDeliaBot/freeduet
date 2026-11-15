/**
 * Tools an update adds reach the member that holds the mailbox (docs/design/connect-from-chat.md, D45),
 * against PostgreSQL: a grant the product made carries the automatic mark and is topped up at start;
 * a grant a person made by hand, or one from before the mark, is never touched; the one-off command
 * marks an existing set only when told to.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createAuditStore } from "../src/audit";
import { createDatabase } from "../src/db/client";
import { agents, auditEvents, pluginGrants } from "../src/db/schema";
import { applyAutomaticGrants } from "../src/freeduet/automatic-grants";
import {
  AUTOMATIC_GRANT,
  automaticToolRefs,
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
const BOTS = {
  auto: `ag-auto-${suite}`,
  hand: `ag-hand-${suite}`,
  old: `ag-old-${suite}`,
  trim: `ag-trim-${suite}`,
  chat: `ag-chat-${suite}`,
  other: `ag-other-${suite}`,
};
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

const ref = (name: string) => `${SERVER}/${name}`;
const OLD_SET = ["gmail_search_messages", "gmail_read_message"];

async function held(agentId: string) {
  const rows = await database
    .select({ ref: pluginGrants.ref, by: pluginGrants.grantedBy })
    .from(pluginGrants)
    .where(eq(pluginGrants.agentId, agentId));
  return new Map(rows.map((row) => [row.ref, row.by]));
}

async function giveOld(agentId: string, by: string) {
  for (const name of OLD_SET) await store.grant("mcp", ref(name), agentId, by);
}

beforeAll(async () => {
  for (const id of Object.values(BOTS)) {
    await database.insert(agents).values({
      id,
      name: id,
      type: "built_in",
      configuration: { systemPrompt: "Help." },
    });
  }
});

afterAll(async () => {
  await database.delete(agents).where(inArray(agents.id, Object.values(BOTS)));
  await database.$client.end({ timeout: 5 });
});

describe("what an automatic grant may give", () => {
  test("the declared reads and organising writes, never a send", () => {
    const refs = automaticToolRefs(SERVER);
    expect(refs).toContain(ref("gmail_bin_messages"));
    expect(refs).toContain(ref("gmail_spam_messages"));
    expect(refs).toContain(ref("gmail_search_messages"));
    expect(refs).not.toContain(ref("gmail_send_message"));
    expect(refs).not.toContain(ref("gmail_send_reply"));
  });

  test("an app with no catalogue entry declares nothing", () => {
    expect(automaticToolRefs("added-by-url")).toEqual([]);
  });
});

describe("top-up at start", () => {
  test("adds the declared tools a marked member lacks, once", async () => {
    await giveOld(BOTS.auto, ADMIN);
    // The product's own default set carries the mark.
    await database
      .update(pluginGrants)
      .set({ grantedBy: AUTOMATIC_GRANT })
      .where(eq(pluginGrants.agentId, BOTS.auto));
    const first = await topUpAutomaticGrants(database, auditStore);
    const mine = first.find((done) => done.bot === BOTS.auto);
    expect(mine?.added.length).toBe(automaticToolRefs(SERVER).length - 2);
    const after = await held(BOTS.auto);
    expect(after.get(ref("gmail_bin_messages"))).toBe(AUTOMATIC_GRANT);
    expect(after.has(ref("gmail_send_message"))).toBe(false);
    // Idempotent: the second start adds nothing for this member.
    const second = await topUpAutomaticGrants(database, auditStore);
    expect(second.find((done) => done.bot === BOTS.auto)).toBeUndefined();
    const audited = await database
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.targetId, ref("gmail_bin_messages")));
    expect(audited.length).toBeGreaterThan(0);
  });

  test("leaves a set a person made by hand alone", async () => {
    await giveOld(BOTS.hand, ADMIN);
    await topUpAutomaticGrants(database, auditStore);
    expect([...(await held(BOTS.hand)).keys()].sort()).toEqual(
      OLD_SET.map(ref).sort(),
    );
  });

  test("leaves an installation's unmarked rows alone (no guessing)", async () => {
    await database.insert(pluginGrants).values(
      OLD_SET.map((name) => ({
        kind: "mcp",
        ref: ref(name),
        agentId: BOTS.old,
        grantedBy: null,
      })),
    );
    await topUpAutomaticGrants(database, auditStore);
    expect((await held(BOTS.old)).size).toBe(OLD_SET.length);
  });

  test("a tool a person takes away by hand is not handed back", async () => {
    await store.grantAutomatically(SERVER, BOTS.trim, "test");
    expect((await held(BOTS.trim)).get(ref("gmail_bin_messages"))).toBe(
      AUTOMATIC_GRANT,
    );
    await store.revoke("mcp", ref("gmail_spam_messages"), BOTS.trim, ADMIN);
    await topUpAutomaticGrants(database, auditStore);
    const after = await held(BOTS.trim);
    expect(after.has(ref("gmail_spam_messages"))).toBe(false);
    expect(after.get(ref("gmail_bin_messages"))).toBe(ADMIN);
  });

  test("a hand-made row is not relabelled by an automatic grant", async () => {
    await store.grant("mcp", ref("gmail_bin_messages"), BOTS.other, ADMIN);
    const added = await store.grantAutomatically(SERVER, BOTS.other, "test");
    expect(added).not.toContain(ref("gmail_bin_messages"));
    expect((await held(BOTS.other)).get(ref("gmail_bin_messages"))).toBe(ADMIN);
  });

  test("runs at start for FreeDuet's package only", async () => {
    await database.insert(pluginGrants).values({
      kind: "mcp",
      ref: ref("gmail_search_messages"),
      agentId: BOTS.chat,
      grantedBy: AUTOMATIC_GRANT,
    });
    await applyAutomaticGrants(database, auditStore, { tenantId: "other" });
    expect((await held(BOTS.chat)).size).toBe(1);
    await applyAutomaticGrants(database, auditStore, { tenantId: "freeduet" });
    expect((await held(BOTS.chat)).size).toBe(automaticToolRefs(SERVER).length);
  });
});

describe("the one-off command", () => {
  const OTHER = `ag-one-${suite}`;
  beforeAll(async () => {
    await database.insert(agents).values({
      id: OTHER,
      name: OTHER,
      type: "built_in",
      configuration: { systemPrompt: "Help." },
    });
    await giveOld(OTHER, ADMIN);
  });
  afterAll(async () => {
    await database.delete(agents).where(eq(agents.id, OTHER));
  });

  test("a dry run lists the grants and writes nothing", async () => {
    const listed = await markGrantsAutomatic(database, auditStore, {
      agentId: OTHER,
      serverId: SERVER,
      apply: false,
    });
    expect(listed).toEqual(OLD_SET.map(ref).sort());
    for (const by of (await held(OTHER)).values()) expect(by).toBe(ADMIN);
  });

  test("--apply marks them, audits each, and a second run finds nothing", async () => {
    const done = await markGrantsAutomatic(database, auditStore, {
      agentId: OTHER,
      serverId: SERVER,
      apply: true,
    });
    expect(done.length).toBe(OLD_SET.length);
    for (const by of (await held(OTHER)).values())
      expect(by).toBe(AUTOMATIC_GRANT);
    const again = await markGrantsAutomatic(database, auditStore, {
      agentId: OTHER,
      serverId: SERVER,
      apply: true,
    });
    expect(again).toEqual([]);
    const audited = await database
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(eq(auditEvents.targetId, ref(OLD_SET[0] as string))));
    expect(audited.length).toBeGreaterThan(0);
  });

  test("never marks another app's grants or the hub mark", async () => {
    await database.insert(pluginGrants).values({
      kind: "mcp",
      ref: "notion/search",
      agentId: OTHER,
      grantedBy: ADMIN,
    });
    const listed = await markGrantsAutomatic(database, auditStore, {
      agentId: OTHER,
      serverId: SERVER,
      apply: true,
    });
    expect(listed).toEqual([]);
    expect((await held(OTHER)).get("notion/search")).toBe(ADMIN);
  });
});

describe("approving the default set", () => {
  test("marks the default set automatic and leaves an existing row", async () => {
    await store.grant("mcp", ref("gmail_search_messages"), BOTS.chat, ADMIN);
    await store.grantByDefault(ref("gmail_search_messages"), BOTS.chat, ADMIN);
    expect((await held(BOTS.chat)).get(ref("gmail_search_messages"))).toBe(
      ADMIN,
    );
  });
});
