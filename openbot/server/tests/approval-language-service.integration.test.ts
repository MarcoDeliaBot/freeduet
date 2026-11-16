import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { inArray } from "drizzle-orm";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import type { ApprovalCandidate } from "../src/approvals/types";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema/core";
import { workItems } from "../src/db/schema/work";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * D50, from the gate to the inbox: the language the person reads reaches the reviewer's prompt when a
 * card is opened, and the inbox the app draws cards from carries it. Against real tables.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `lang-${randomUUID()}`;
const owner = `${prefix}-owner`;
const store = createApprovalStore(database);

beforeAll(async () => {
  await database
    .insert(users)
    .values([{ id: owner, email: `${owner}@example.test` }]);
});
afterAll(async () => {
  await database.delete(workItems).where(
    inArray(
      workItems.key,
      (await store.list(owner)).map((request) => request.id),
    ),
  );
  await database.delete(users).where(inArray(users.id, [owner]));
  await database.$client.close();
});

function candidate(): ApprovalCandidate {
  const toolCallId = randomUUID();
  return {
    actorId: owner,
    botId: `${prefix}-bot`,
    toolRef: "mcp/gmail/send_email",
    effect: "write",
    scope: "gmail",
    args: { to: "sam@example.com" },
    continuation: {
      runId: randomUUID(),
      threadId: `${prefix}-thread-${toolCallId}`,
      toolCallId,
      toolName: "mcp/gmail/send_email",
      args: { to: "sam@example.com" },
      messages: [],
      state: {},
      context: [],
      forwardedProps: {},
    },
  };
}

const VERDICT =
  '{"verdict":"needs_approval","preApproved":false,"safety":"none","reason":"Motivo scritto dal revisore."}';

async function open(
  personLanguage: (
    id: string,
  ) => Promise<{ code: string; name: string } | null>,
) {
  const prompts: string[] = [];
  const service = createApprovalService(store, undefined, undefined, {
    review: async (prompt) => {
      prompts.push(prompt);
      return VERDICT;
    },
    personLanguage,
  });
  await service.setPreferences(owner, { autoReview: true });
  const asked = await service.gate(candidate()).then(
    () => false,
    (error: unknown) => error instanceof HeadlessToolSuspension,
  );
  return { service, prompts, asked };
}

test("the person's language reaches the reviewer's prompt and the inbox", async () => {
  const { service, prompts, asked } = await open(async () => ({
    code: "it",
    name: "Italian",
  }));
  expect(asked).toBe(true);
  expect(prompts.at(-1)).toContain('Write "reason" in Italian');
  const inbox = await service.inbox(owner);
  expect(inbox.language).toBe("it");
  const request = inbox.requests.at(-1);
  expect(request?.action.policy?.reason).toBe("Motivo scritto dal revisore.");
  expect(request?.action.policy?.behaviour).toBe("ask");
});

test("no language, or a failed read, leaves the prompt and the inbox as they were", async () => {
  for (const personLanguage of [
    async () => null,
    async () => {
      throw new Error("database is down");
    },
  ]) {
    const { service, prompts, asked } = await open(personLanguage);
    expect(asked).toBe(true);
    expect(prompts.at(-1)).not.toContain('Write "reason" in');
    expect("language" in (await service.inbox(owner))).toBe(false);
  }
});
