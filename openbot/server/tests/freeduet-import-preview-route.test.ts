/**
 * POST /api/freeduet/import/preview through the real app (docs/design/import-from-other-tools.md,
 * slice 2): signed in only, the person's own facts, a JSON envelope, and nothing written. The database
 * is a throwaway one, migrated for this file; the row counts are read from it.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import postgres from "postgres";
import { createApp } from "../src/app";
import type { AuthService, RoleRepository } from "../src/auth/guards";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import { IMPORT_PREVIEW_BODY_MAX_BYTES } from "../src/freeduet/import/preview-routes";
import { createMemoryStore } from "../src/memory/store";
import { removePeople, seedPeople } from "./support/people";
import { testEnvironment } from "./support/environment";
import { throwawayDatabase } from "./support/throwaway-database";

const ALICE = "person-alice";
const BOB = "person-bob";
/** The server's own address in testEnvironment (BETTER_AUTH_URL): the request is same-origin. */
const ORIGIN = "http://localhost:3001";
const URL_PREVIEW = `${ORIGIN}/api/freeduet/import/preview`;

/** Every table an import could write to. The counts must not change across any request. */
const TABLES = [
  "personal_memories",
  "skills",
  "skill_tools",
  "plugin_grants",
  "routines",
  "agents",
  "approval_rules",
  "audit_events",
] as const;

function exportOf(facts: string[], schedule: string | null = null): string {
  return JSON.stringify({
    format: "freeduet-import/1",
    agents: [
      {
        name: "Sample helper",
        title: "Sample",
        instructions: "Sample instructions, invented for a test.",
        schedule,
        facts,
      },
    ],
  });
}

let signedIn: string | null = ALICE;
let database: ReturnType<typeof createDatabase>;
let throwaway: Awaited<ReturnType<typeof throwawayDatabase>>;
let app: ReturnType<typeof createApp>;
let memory: ReturnType<typeof createMemoryStore>;
let counter: ReturnType<typeof postgres>;

beforeAll(async () => {
  throwaway = await throwawayDatabase("import_preview");
  database = createDatabase(throwaway.url, { max: 2 });
  await seedPeople(database, [ALICE, BOB]);
  memory = createMemoryStore(database);
  counter = postgres(throwaway.url, { max: 1, onnotice: () => {} });
  const auth = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () =>
        signedIn === null
          ? null
          : {
              user: {
                id: signedIn,
                email: `${signedIn}@example.invalid`,
                name: null,
                image: null,
              },
            },
    },
  } as unknown as AuthService;
  // A signed-in person with the ordinary role: the guard refuses a session with no role at all.
  const roles: RoleRepository = { rolesForUser: async () => ["user"] };
  const config = loadConfig(testEnvironment({ DATABASE_URL: throwaway.url }));
  app = createApp(
    config,
    auth,
    roles,
    ...(Array.from({ length: 31 }) as never[]),
    { memory: { store: memory, ingestion: undefined } } as never,
  );
}, 60_000);

afterAll(async () => {
  // Setup may have timed out before these existed: tear down only what was built.
  if (database) {
    await removePeople(database, [ALICE, BOB]);
    await database.$client.close();
  }
  await counter?.end({ timeout: 5 });
  await throwaway?.drop();
});

/** The same-origin headers a browser sends from the app's own page. */
function sent(body: string, contentType = "application/json") {
  return app.request(URL_PREVIEW, {
    method: "POST",
    headers: { "content-type": contentType, origin: ORIGIN },
    body,
  });
}

function postExport(text: string) {
  return sent(JSON.stringify({ export: text }));
}

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const [row] = await counter.unsafe(
      `select count(*)::int as n from ${table}`,
    );
    counts[table] = Number(row?.n);
  }
  return counts;
}

describe("the preview route", () => {
  test("a valid export is previewed, the answer says nothing was saved, and the schedule arrives switched off", async () => {
    signedIn = ALICE;
    const response = await postExport(
      exportOf(["Prefers short emails."], "Every weekday at nine"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      saved: boolean;
      preview: {
        facts: { keep: { text: string }[] };
        schedules: { arrivesSwitchedOff: boolean }[];
        bots: { imported: boolean }[];
      };
    };
    expect(body.saved).toBe(false);
    expect(body.preview.facts.keep.map((fact) => fact.text)).toEqual([
      "Prefers short emails.",
    ]);
    expect(body.preview.schedules).toEqual([
      expect.objectContaining({ arrivesSwitchedOff: true }),
    ]);
    expect(body.preview.bots).toEqual([
      expect.objectContaining({ imported: false }),
    ]);
  });

  test("the body must be application/json: plain text is refused with 415", async () => {
    signedIn = ALICE;
    const response = await sent(
      JSON.stringify({ export: exportOf(["Fact."]) }),
      "text/plain",
    );
    expect(response.status).toBe(415);
  });

  test("an envelope without the export text is refused with 400", async () => {
    signedIn = ALICE;
    const response = await sent(JSON.stringify({ text: "wrong key" }));
    expect(response.status).toBe(400);
  });

  test("a body over the envelope's limit is refused with 413 and a JSON answer", async () => {
    signedIn = ALICE;
    const padding = "x".repeat(IMPORT_PREVIEW_BODY_MAX_BYTES);
    const response = await sent(JSON.stringify({ export: padding }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "The request is larger than the limit.",
    });
  });

  test("an export of more than 1 MiB is refused by the parser with 422, whatever its envelope", async () => {
    signedIn = ALICE;
    const response = await postExport("x".repeat(1024 * 1024 + 1));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "The import is larger than 1 MiB.",
    });
  });

  test("text that is not an export is refused with 422 and the parser's reason", async () => {
    signedIn = ALICE;
    const response = await postExport("this is not json");
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error:
        "This is not valid JSON. Paste the whole code block that the export gave you.",
    });
  });

  test("a request with no sign-in is refused", async () => {
    signedIn = null;
    const response = await postExport(exportOf(["Fact."]));
    expect(response.status).toBe(401);
    signedIn = ALICE;
  });

  test("the cap and the duplicates are counted from the signed-in person's facts alone", async () => {
    signedIn = ALICE;
    for (let index = 0; index < 50; index += 1)
      await memory.create(ALICE, { content: `Alice holds fact ${index}.` });
    signedIn = BOB;
    await memory.create(BOB, {
      content: "Bob's private note stays with Bob.",
    });
    await memory.create(BOB, { content: "Prefers short emails." });

    const bob = (await (
      await postExport(exportOf(["Prefers short emails."]))
    ).json()) as {
      preview: {
        facts: { heldBefore: number; room: number; drop: { code: string }[] };
      };
    };
    expect(bob.preview.facts.heldBefore).toBe(2);
    expect(bob.preview.facts.room).toBe(48);
    expect(bob.preview.facts.drop.map((drop) => drop.code)).toEqual([
      "duplicate",
    ]);

    signedIn = ALICE;
    const response = await postExport(exportOf(["Prefers short emails."]));
    const alice = (await response.json()) as {
      preview: {
        facts: {
          heldBefore: number;
          room: number;
          keep: unknown[];
          drop: { code: string }[];
        };
      };
    };
    expect(alice.preview.facts.heldBefore).toBe(50);
    expect(alice.preview.facts.room).toBe(0);
    expect(alice.preview.facts.keep).toEqual([]);
    expect(alice.preview.facts.drop.map((drop) => drop.code)).toEqual(["cap"]);
    expect(JSON.stringify(alice)).not.toContain("Bob's private note");
  });

  test("nothing is written: the row counts of every table an import could touch are the same before and after", async () => {
    signedIn = ALICE;
    const before = await rowCounts();
    await postExport(exportOf(["Prefers short emails."], "Daily at nine"));
    await sent(JSON.stringify({ export: exportOf(["Fact."]) }), "text/plain");
    await sent(JSON.stringify({ text: "wrong key" }));
    await postExport("this is not json");
    const after = await rowCounts();
    expect(after).toEqual(before);
  });

  test("no log line carries the content: a canary in a fact and a canary in a secret appear in no log", async () => {
    signedIn = ALICE;
    const canary = `CANARY-${Math.random().toString(36).slice(2, 12)}`;
    const secret = `CANARY-SECRET-${Math.random().toString(36).slice(2, 12)}`;
    const spies = [
      spyOn(console, "log"),
      spyOn(console, "info"),
      spyOn(console, "warn"),
      spyOn(console, "error"),
      spyOn(console, "debug"),
      spyOn(process.stdout, "write"),
      spyOn(process.stderr, "write"),
    ];
    const logged: string[] = [];
    try {
      const kept = await postExport(
        exportOf([`A plain fact that holds ${canary}.`, `password: ${secret}`]),
      );
      expect(kept.status).toBe(200);
      const body = JSON.stringify(await kept.json());
      expect(body).toContain(canary);
      expect(body).not.toContain(secret);
      await postExport(`not json with ${canary} and ${secret}`);
      await sent(JSON.stringify({ export: `Fact ${canary}` }), "text/plain");
      await sent(JSON.stringify({ text: canary, secret }));
    } finally {
      for (const spy of spies) {
        for (const call of spy.mock.calls)
          logged.push(call.map(String).join(" "));
        spy.mockRestore();
      }
    }
    const output = logged.join("\n");
    expect(output).not.toContain(canary);
    expect(output).not.toContain(secret);
  });
});
