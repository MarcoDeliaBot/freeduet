import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { applyMigrations } from "../src/db/apply-migrations";
import { createDatabase } from "../src/db/client";
import { agents, users } from "../src/db/schema/core";
import { proactiveSettings } from "../src/db/schema/proactive";
import { createMemoryDefaults } from "../src/memory/defaults";
import { createProactiveStore } from "../src/proactive/store";
import { testDatabaseUrl } from "./support/database";
import { throwawayDatabase } from "./support/throwaway-database";

/**
 * D80: every research setting that existed at the update is switched off once, and from then on a
 * row records who switched it on. Run against real databases: the migration is what a deployment
 * runs, so it is the migration file that is applied here, not a copy of its SQL.
 */

const migrations = join(import.meta.dir, "../drizzle");
const tag = randomUUID();
const ownerA = `d80-${tag}-a`;
const ownerB = `d80-${tag}-b`;
const bots = [1, 2, 3, 4].map((n) => `d80-${tag}-bot${n}`);

/** Seed with raw SQL: the point is rows written before the column existed. */
async function seed(client: postgres.Sql) {
  await client`insert into users (id, email) values (${ownerA}, ${`${ownerA}@example.test`}), (${ownerB}, ${`${ownerB}@example.test`})`;
  for (const id of bots)
    await client`insert into agents (id, name, type, configuration) values (${id}, ${id}, 'built_in', '{}'::jsonb)`;
}

describe("migration 0079 against a database at 0078", () => {
  const dropped: (() => Promise<void>)[] = [];
  let folder = "";

  beforeAll(async () => {
    // The real folder with the journal cut at 0078: 0079 is left out of the first pass.
    folder = await mkdtemp(join(tmpdir(), "d80-migrations-"));
    await cp(migrations, folder, { recursive: true });
    const journalPath = join(folder, "meta/_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    expect(journal.entries.at(-1)?.tag).toBe("0079_research_off_once");
    journal.entries = journal.entries.filter((entry) => entry.idx <= 78);
    await writeFile(journalPath, JSON.stringify(journal));
  });
  afterAll(async () => {
    for (const drop of dropped) await drop();
    await rm(folder, { recursive: true, force: true });
  });

  async function emptyDatabase() {
    const server = new URL(testDatabaseUrl());
    const administrative = new URL(server.href);
    administrative.pathname = "/postgres";
    const name = `d80_${Math.random().toString(36).slice(2, 10)}`;
    const admin = postgres(administrative.href, { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.end({ timeout: 5 });
    }
    dropped.push(async () => {
      const again = postgres(administrative.href, {
        max: 1,
        onnotice: () => {},
      });
      try {
        await again.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await again.end({ timeout: 5 });
      }
    });
    const url = new URL(server.href);
    url.pathname = `/${name}`;
    return url.href;
  }

  test("every existing row is off afterwards, with focus, interval and next run kept; a later row and a second run change nothing", async () => {
    const url = await emptyDatabase();
    const client = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await applyMigrations(client, folder);
      const columns =
        await client`select column_name from information_schema.columns where table_name = 'proactive_settings' and column_name = 'enabled_by_person'`;
      expect(columns).toHaveLength(0);

      await seed(client);
      const next = "2030-01-01T10:00:00.000Z";
      // Two rows on (one made by the old default, one by a person: the table cannot tell), one off.
      await client`insert into proactive_settings (id, owner_user_id, agent_id, channel_id, thread_id, focus, enabled, interval_minutes, next_run_at) values
        (${`${tag}-on-1`}, ${ownerA}, ${bots[0]}, 'c1', 't1', 'invoices', true, 60, ${next}),
        (${`${tag}-on-2`}, ${ownerA}, ${bots[1]}, 'c2', 't2', '', true, 240, ${next}),
        (${`${tag}-off`}, ${ownerB}, ${bots[0]}, 'c3', 't3', 'leads', false, 120, ${next})`;
      await client`insert into default_opt_outs (owner_user_id, agent_id, feature, scope) values (${ownerB}, ${bots[1]}, 'proactive_research', '')`;

      await applyMigrations(client, migrations);

      const rows =
        await client`select id, enabled, enabled_by_person, focus, interval_minutes, next_run_at from proactive_settings where owner_user_id in (${ownerA}, ${ownerB}) order by id`;
      expect(rows.map((row) => row.id)).toEqual(
        [`${tag}-off`, `${tag}-on-1`, `${tag}-on-2`].sort(),
      );
      for (const row of rows) {
        expect(row.enabled).toBe(false);
        expect(row.enabled_by_person).toBe(false);
        expect(new Date(row.next_run_at).toISOString()).toBe(next);
      }
      const kept = Object.fromEntries(
        rows.map((row) => [row.id, [row.focus, row.interval_minutes]]),
      );
      expect(kept[`${tag}-on-1`]).toEqual(["invoices", 60]);
      expect(kept[`${tag}-on-2`]).toEqual(["", 240]);
      expect(kept[`${tag}-off`]).toEqual(["leads", 120]);
      const optOuts =
        await client`select 1 from default_opt_outs where owner_user_id = ${ownerB}`;
      expect(optOuts).toHaveLength(1);

      // A row made after the update, on, by a person: a second run of the migrator leaves it on.
      await client`insert into proactive_settings (id, owner_user_id, agent_id, channel_id, thread_id, enabled, enabled_by_person) values (${`${tag}-later`}, ${ownerB}, ${bots[2]}, 'c4', 't4', true, true)`;
      await applyMigrations(client, migrations);
      const [later] =
        await client`select enabled, enabled_by_person from proactive_settings where id = ${`${tag}-later`}`;
      expect(later).toEqual({ enabled: true, enabled_by_person: true });
      const [still] =
        await client`select count(*)::int as n from proactive_settings where enabled and id <> ${`${tag}-later`} and owner_user_id in (${ownerA}, ${ownerB})`;
      expect(still?.n).toBe(0);
    } finally {
      await client.end({ timeout: 5 });
    }
  }, 120_000);
});

describe("who switched it on, on a fully migrated database", () => {
  let scratch: Awaited<ReturnType<typeof throwawayDatabase>>;
  let database: ReturnType<typeof createDatabase>;
  let store: ReturnType<typeof createProactiveStore>;

  beforeAll(async () => {
    scratch = await throwawayDatabase("d80_store");
    database = createDatabase(scratch.url, { max: 4 });
    store = createProactiveStore(database);
    await database.insert(users).values([
      { id: ownerA, email: `${ownerA}@example.test` },
      { id: ownerB, email: `${ownerB}@example.test` },
    ]);
    await database.insert(agents).values(
      bots.map((id) => ({
        id,
        name: id,
        type: "built_in" as const,
        configuration: {},
      })),
    );
  });
  afterAll(async () => {
    await database.$client.close();
    await scratch.drop();
  });

  const columnOf = async (id: string) => {
    const [row] = await database
      .select({
        enabled: proactiveSettings.enabled,
        byPerson: proactiveSettings.enabledByPerson,
      })
      .from(proactiveSettings)
      .where(eq(proactiveSettings.id, id));
    return row;
  };

  test("a person switching research on creates a row that is on, theirs, and due", async () => {
    const made = await store.create(
      ownerA,
      { agentId: bots[0], channelId: "c", intervalMinutes: 30 },
      `${tag}-th1`,
    );
    expect(await columnOf(made.id)).toEqual({ enabled: true, byPerson: true });
    const claimed = await store.claimDue(10);
    expect(claimed.map((row) => row.id)).toContain(made.id);
  });

  test("a placeholder row made switched off is not theirs; their later switch-on is, and keeps focus and interval", async () => {
    const made = await store.create(
      ownerA,
      {
        agentId: bots[1],
        channelId: "c",
        enabled: false,
        focus: "invoices",
        intervalMinutes: 90,
      },
      `${tag}-th2`,
    );
    expect(await columnOf(made.id)).toEqual({
      enabled: false,
      byPerson: false,
    });
    const on = await store.update(ownerA, made.id, { enabled: true });
    expect(on).toMatchObject({
      enabled: true,
      enabledByPerson: true,
      focus: "invoices",
      intervalMinutes: 90,
    });
    expect((await store.claimDue(10)).map((row) => row.id)).toContain(made.id);
  });

  test("switching off leaves the column as it was, and a row that is off is not claimed", async () => {
    const [row] = await database
      .select()
      .from(proactiveSettings)
      .where(eq(proactiveSettings.agentId, bots[1]));
    const off = await store.update(ownerA, row.id, { enabled: false });
    expect(off).toMatchObject({ enabled: false, enabledByPerson: true });
    await database
      .update(proactiveSettings)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(proactiveSettings.id, row.id));
    expect(
      (await store.claimDue(10)).map((claimed) => claimed.id),
    ).not.toContain(row.id);
    // A focus change on a switched-off row does not make it theirs, nor switch it on.
    const focused = await store.update(ownerA, row.id, { focus: "leads" });
    expect(focused).toMatchObject({ enabled: false, enabledByPerson: true });
  });

  test("a row the deployment default writes is on and not theirs; it never switches a row that exists back on", async () => {
    const defaults = (research: boolean) =>
      createMemoryDefaults({
        database,
        ingestion: {
          defaultSourceCandidates: async () => [],
          sync: async () => undefined as never,
        },
        sources: false,
        research,
        channelBots: async (_owner, _channel) => [bots[2]],
        canDeliver: async () => true,
        mintThreadId: () => `${tag}-th-${randomUUID()}`,
        minIntervalMs: 0,
        log: () => {},
      });
    expect(await defaults(true).adoptResearch(ownerB, bots[2], "chan")).toBe(
      true,
    );
    const [made] = await database
      .select()
      .from(proactiveSettings)
      .where(eq(proactiveSettings.agentId, bots[2]));
    expect(await columnOf(made.id)).toEqual({ enabled: true, byPerson: false });

    // Switched off by the update (or by the person): the default does not switch it back on.
    await database
      .update(proactiveSettings)
      .set({ enabled: false })
      .where(eq(proactiveSettings.id, made.id));
    expect(await defaults(true).adoptResearch(ownerB, bots[2], "chan")).toBe(
      false,
    );
    expect(await columnOf(made.id)).toEqual({
      enabled: false,
      byPerson: false,
    });
  });
});
