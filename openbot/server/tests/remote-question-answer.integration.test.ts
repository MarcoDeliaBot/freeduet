/**
 * FreeDuet (docs/design/phone-and-remote.md 3.5.5, decision H): the answer to a member's question, typed
 * in a remote session, resumes a run that is marked as one.
 *
 * A member asks the person a question, in the person's own turn at the computer or from a hop. The answer is
 * the person's words and becomes the message of a new turn of that conversation, which runs with the
 * initiator the question was asked under. Typed in a browser that is not paired with the computer, those
 * words would otherwise resume a run that counts as the person's own, with Full access and the
 * typed-recipient shortcuts on a stolen phone's answer.
 *
 * Against a real database: the question is a work item, and the answer is queued as another.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  createApprovalQuestions,
  type PersonQuestion,
  personQuestionSchema,
} from "../src/approvals/questions";
import type { AuditInitiator } from "../src/audit";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema/core";
import { workItems } from "../src/db/schema/work";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `rq-${randomUUID()}`;
const owner = `${prefix}-owner`;
const questions = createApprovalQuestions(database, async () => undefined);
const keys: string[] = [];

beforeAll(async () => {
  await database
    .insert(users)
    .values({ id: owner, email: `${owner}@example.test` });
});
afterAll(async () => {
  if (keys.length)
    await database
      .delete(workItems)
      .where(
        and(
          inArray(workItems.kind, ["person.question", "person.response"]),
          inArray(workItems.key, keys),
        ),
      );
  await database.delete(users).where(eq(users.id, owner));
  await database.$client.close();
});

const question = (initiator?: AuditInitiator): PersonQuestion => ({
  actorId: owner,
  botId: "member",
  threadId: `${prefix}-thread`,
  runId: randomUUID(),
  question: "Which address should I send it to?",
  mode: "completed_question",
  ...(initiator ? { initiator } : {}),
});

/** Asks the question, answers it as the given kind of session, and reads the turn that was queued. */
async function answered(
  initiator: AuditInitiator | undefined,
  options?: { remote?: boolean },
) {
  const key = randomUUID();
  keys.push(key);
  await database.insert(workItems).values({
    kind: "person.question",
    key,
    payload: question(initiator),
  });
  await questions.respond(owner, key, "ana@example.test", options);
  const [response] = await database
    .select()
    .from(workItems)
    .where(and(eq(workItems.kind, "person.response"), eq(workItems.key, key)));
  if (!response) throw new Error("the answer was not queued");
  const saved = response.payload as { question: unknown; response: string };
  return {
    initiator: personQuestionSchema.parse(saved.question).initiator,
    response: saved.response,
  };
}

describe("the run an answer resumes", () => {
  test("control: answered at the computer, a question keeps the initiator it was asked under", async () => {
    expect((await answered(undefined)).initiator).toBeUndefined();
    expect((await answered({ kind: "person" })).initiator).toEqual({
      kind: "person",
    });
    expect(
      (await answered(undefined, { remote: false })).initiator,
    ).toBeUndefined();
  });

  test("answered from a remote session, a question asked in the person's own turn resumes a remote run", async () => {
    for (const asked of [undefined, { kind: "person" } as AuditInitiator]) {
      const turn = await answered(asked, { remote: true });
      expect(turn.initiator).toEqual({ kind: "remote" });
      // The words are the same: only what the run counts as changes.
      expect(turn.response).toBe("ana@example.test");
    }
  });

  test("and so does a question a hop asked, whose root this record does not keep", async () => {
    expect(
      (await answered({ kind: "handoff", id: "iris" }, { remote: true }))
        .initiator,
    ).toEqual({ kind: "remote" });
  });

  test("a routine's or a trigger's question comes back as itself, which asks a card for every write already", async () => {
    for (const asked of [
      { kind: "routine", id: "r1" },
      { kind: "responsibility", id: "t1" },
      { kind: "memory", id: "m1" },
      { kind: "deployment" },
    ] as AuditInitiator[])
      expect((await answered(asked, { remote: true })).initiator).toEqual(
        asked,
      );
  });

  test("a question asked in a remote run is read back as remote, never as a person", async () => {
    expect((await answered({ kind: "remote" })).initiator).toEqual({
      kind: "remote",
    });
  });
});
