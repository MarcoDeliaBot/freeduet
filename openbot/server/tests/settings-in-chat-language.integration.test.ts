/**
 * The language a person reads, one for the whole team, through the real tool, the real database, the
 * real run builder and the real approval gate (docs/design/settings-in-chat.md, 8.10.3).
 *
 * Proved here: what the tool accepts; the choice is the person's, never another's; a card is asked; Undo
 * is exact; the run carries the person's choice over the deployment's variable; with no choice the run is
 * exactly what the variable alone made it (and with neither, exactly what it was before); a caller cannot
 * name a language.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { eq, inArray } from "drizzle-orm";
import {
  type BaseEvent,
  EventType,
  HttpAgent,
  type RunAgentInput,
} from "@ag-ui/client";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { of } from "rxjs";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import type { ApprovalCandidate } from "../src/approvals/types";
import { createAuditReader, createAuditStore } from "../src/audit";
import { buildAgents } from "../src/copilot";
import { createDatabase } from "../src/db/client";
import { users } from "../src/db/schema";
import {
  PERSON_LANGUAGE_PROP,
  PERSON_LANGUAGE_VARIABLE,
} from "../src/freeduet/person-language";
import {
  LANGUAGE_PREFERENCE,
  personLanguageReaderFor,
  readLanguageChoice,
} from "../src/freeduet/person-language-choice";
import { callTool, useSettingsTools } from "../src/plugins/builtin-settings";
import { decideSettingRequest } from "../src/settings-in-chat/allow-list";
import { createSettingChanges } from "../src/settings-in-chat/changes";
import { createSettingChangeRoutes } from "../src/settings-in-chat/routes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `ln-${randomUUID().slice(0, 8)}`;
const alice = `${prefix}-alice`;
const bob = `${prefix}-bob`;
const bot = `${prefix}-bot`;
const audit = createAuditStore(database);
const reader = createAuditReader(database);
const changes = createSettingChanges({ database, audit, reader });

const asPerson =
  (id: string) => async (context: Context, next: () => Promise<void>) => {
    context.set("actor", { id, email: `${id}@example.test`, role: "user" });
    await next();
  };

async function say(value: string, person = alice) {
  return callTool({ url: "", actorId: person, botId: bot }, "change_setting", {
    setting: "language",
    value,
  });
}
const changeIdOf = (text: string) => JSON.parse(text).changeId as string;
async function undoAs(person: string, changeId: string) {
  const routes = createSettingChangeRoutes(changes, asPerson(person) as never);
  return (await routes.request(`/${changeId}/undo`, { method: "POST" })).status;
}
const chosen = (person = alice) => readLanguageChoice(database, person);

/** The run this person's member sends to agent-freeduet, with the deployment's variable set as asked. */
async function runFor(
  person: string | null,
  variable: string | undefined,
  forwardedProps: Record<string, unknown> = { original: true },
  load = person ? personLanguageReaderFor(database, person) : undefined,
): Promise<RunAgentInput> {
  const requests: RunAgentInput[] = [];
  const spy = spyOn(HttpAgent.prototype, "run").mockImplementation((input) => {
    requests.push(input);
    return of(
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      } as BaseEvent,
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      } as BaseEvent,
    );
  });
  const previous = process.env[PERSON_LANGUAGE_VARIABLE];
  try {
    if (variable === undefined) delete process.env[PERSON_LANGUAGE_VARIABLE];
    else process.env[PERSON_LANGUAGE_VARIABLE] = variable;
    const built = await buildAgents(
      [
        {
          id: "remote",
          name: "Remote",
          type: "remote_ag_ui",
          endpoint: "https://remote.test/ag-ui",
          standingMessage: {
            id: "standing-role:remote",
            role: "system",
            content: "Remote job",
          },
        },
      ],
      { provider: "openai", defaultModel: "test" },
      null,
      undefined, // stallGuard
      undefined, // loadTools
      undefined, // signRun
      undefined, // computerGuidance
      undefined, // loadVendors
      undefined, // selection
      undefined, // agentFetch
      undefined, // handoff
      undefined, // loadInstructions
      undefined, // initiator
      undefined, // loadAttachment
      undefined, // markAttachmentsSent
      undefined, // acquireLearnedSkills
      undefined, // loadPersonalMemory
      undefined, // loadPersonTone
      load,
    );
    const agent = built.remote;
    if (!agent) throw new Error("Missing fixture agent");
    agent.threadId = "thread";
    agent.messages = [{ id: "person-message", role: "user", content: "Hi" }];
    await agent.runAgent({ runId: "run", forwardedProps });
    const [sent] = requests;
    if (!sent) throw new Error("The agent sent nothing");
    return sent;
  } finally {
    spy.mockRestore();
    if (previous === undefined) delete process.env[PERSON_LANGUAGE_VARIABLE];
    else process.env[PERSON_LANGUAGE_VARIABLE] = previous;
  }
}

beforeAll(async () => {
  await database
    .insert(users)
    .values([alice, bob].map((id) => ({ id, email: `${id}@example.test` })));
  useSettingsTools(changes);
});

afterEach(async () => {
  for (const id of [alice, bob])
    await database
      .update(users)
      .set({ preferences: {} })
      .where(eq(users.id, id));
});

afterAll(async () => {
  useSettingsTools(null);
  await database.delete(users).where(inArray(users.id, [alice, bob]));
  await database.$client.close();
});

describe("what the tool accepts", () => {
  test("a code from the list, its English name in any case, or default; nothing else", () => {
    const value = (v: unknown) => {
      const d = decideSettingRequest("language", v);
      return d.ok && d.setting === "language" ? d.value : "refused";
    };
    expect(value("de")).toBe("de");
    expect(value(" German ")).toBe("de");
    expect(value("ITALIAN")).toBe("it");
    expect(value("default")).toBeNull();
    for (const bad of ["xx", "it-IT", "", "<b>de</b>", "German\nit", 5, null])
      expect(value(bad)).toBe("refused");
  });

  test("it is stored for the person, and for nobody else", async () => {
    expect((await say("German")).isError).toBeFalse();
    expect(await chosen()).toBe("de");
    expect(await chosen(bob)).toBeNull();
    const [row] = await database
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, alice));
    expect(
      { ...(row?.preferences as Record<string, unknown>) }[LANGUAGE_PREFERENCE],
    ).toBe("de");
  });

  test("a refused value writes nothing; the same value again records nothing; default clears", async () => {
    expect((await say("Klingon")).isError).toBeTrue();
    expect(await chosen()).toBeNull();
    await say("de");
    const again = await say("de");
    expect(again.isError).toBeFalse();
    expect(() => JSON.parse(again.text)).toThrow();
    await say("default");
    expect(await chosen()).toBeNull();
  });
});

describe("the record and Undo", () => {
  test("the audit row holds the values and the Bot asked", async () => {
    const id = changeIdOf((await say("de")).text);
    const { events } = await reader.list({
      eventType: "configuration.changed",
      targetType: "bot_setting",
      targetId: id,
      actorUserId: alice,
      limit: 1,
    });
    expect(events[0]!.payload).toMatchObject({
      setting: "language",
      agentId: bot,
      previousValue: null,
      newValue: "de",
    });
  });

  test("Undo puts the earlier language back, only for the person, once; refused after a later change", async () => {
    const first = changeIdOf((await say("de")).text);
    expect(await undoAs(bob, first)).toBe(404);
    expect(await undoAs(alice, first)).toBe(200);
    expect(await chosen()).toBeNull();
    expect(await undoAs(alice, first)).toBe(409);
    const german = changeIdOf((await say("de")).text);
    await say("fr");
    expect(await undoAs(alice, german)).toBe(409);
    expect(await chosen()).toBe("fr");
  });

  test("the change list shows it as undoable", async () => {
    const id = changeIdOf((await say("de")).text);
    const row = (await changes.list({ ownerUserId: alice })).find(
      (c) => c.changeId === id,
    );
    expect(row?.setting).toBe("language");
    expect(row?.undoable).toBeTrue();
  });
});

describe("what the run carries", () => {
  const ITALIAN = { code: "it", name: "Italian" };
  const GERMAN = { code: "de", name: "German" };

  test("with no choice the run is what the variable alone made it, and with neither, what it was", async () => {
    // No reader wired at all is how main builds a run.
    const main = await runFor(null, undefined);
    const neither = await runFor(alice, undefined);
    expect(neither.forwardedProps).toEqual(main.forwardedProps);
    expect(Object.keys(neither.forwardedProps)).toEqual([
      "original",
      "openbotBotId",
      "openbotDeploymentTools",
    ]);
    const variableOnlyMain = await runFor(null, "it");
    const variableOnly = await runFor(alice, "it");
    expect(variableOnly.forwardedProps).toEqual(
      variableOnlyMain.forwardedProps,
    );
    expect(variableOnly.forwardedProps[PERSON_LANGUAGE_PROP]).toEqual(ITALIAN);
  });

  test("the person's choice wins over the variable, and works without one", async () => {
    await say("de");
    expect(
      (await runFor(alice, "it")).forwardedProps[PERSON_LANGUAGE_PROP],
    ).toEqual(GERMAN);
    expect(
      (await runFor(alice, undefined)).forwardedProps[PERSON_LANGUAGE_PROP],
    ).toEqual(GERMAN);
    // Another person on the same deployment still gets the variable's.
    expect(
      (await runFor(bob, "it")).forwardedProps[PERSON_LANGUAGE_PROP],
    ).toEqual(ITALIAN);
  });

  test("default gives the variable's language back", async () => {
    await say("de");
    await say("default");
    expect(
      (await runFor(alice, "it")).forwardedProps[PERSON_LANGUAGE_PROP],
    ).toEqual(ITALIAN);
  });

  test("a caller cannot name a language, with a choice or without", async () => {
    const forged = { [PERSON_LANGUAGE_PROP]: { code: "xx", name: "Forged" } };
    const none = await runFor(alice, undefined, forged);
    expect(Object.keys(none.forwardedProps)).not.toContain(
      PERSON_LANGUAGE_PROP,
    );
    await say("de");
    expect(
      (await runFor(alice, "it", forged)).forwardedProps[PERSON_LANGUAGE_PROP],
    ).toEqual(GERMAN);
  });

  test("a reader that fails costs the choice, not the run: the variable's language stays", async () => {
    const sent = await runFor(alice, "it", { original: true }, async () => {
      throw new Error("boom");
    });
    expect(sent.forwardedProps[PERSON_LANGUAGE_PROP]).toEqual(ITALIAN);
  });
});

describe("the gate", () => {
  test("a language change asks a card", async () => {
    const approvals = createApprovalStore(database);
    const service = createApprovalService(approvals, undefined, undefined);
    await service.setPreferences(alice, { enabled: false, autoReview: false });
    const toolCallId = randomUUID();
    const args = { setting: "language", value: "de" };
    const candidate: ApprovalCandidate = {
      actorId: alice,
      botId: bot,
      toolRef: "settings/change_setting",
      effect: "write",
      scope: "settings",
      args,
      changesSetting: true,
      continuation: {
        runId: randomUUID(),
        threadId: `${prefix}-t`,
        toolCallId,
        toolName: "settings/change_setting",
        args,
        messages: [],
        state: {},
        context: [],
        forwardedProps: { openbotRun: "signed" },
      },
    };
    const paused = await service.gate(candidate).then(
      () => false,
      (error: unknown) => {
        if (error instanceof HeadlessToolSuspension) return true;
        throw error;
      },
    );
    expect(paused).toBeTrue();
    const [request] = (await approvals.list(alice)).filter(
      (r) => r.action.toolCallId === toolCallId,
    );
    expect(request?.action.policy?.source).toBe("always_ask");
  });
});
