/**
 * How a team member talks to one person: the tone, through the real tool, the real database, the real
 * run builder and the real approval gate (docs/design/settings-in-chat.md, 8.10.2).
 *
 * Proved here: three fixed values and nothing else; the choice is per person and member; a card is asked;
 * Undo is exact; the audit keeps the member's real id and name; the run carries the tone only for the
 * person it belongs to and only for `warm` and `formal`; a caller cannot name a tone; `plain` and
 * "never chose" leave a run exactly as it was; the approval a gate stores does not change with the tone.
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
import {
  agentPreferences,
  agentProfiles,
  agents,
  deploymentPackages,
  users,
} from "../src/db/schema";
import {
  PERSON_TONE_PROP,
  personToneReaderFor,
} from "../src/freeduet/person-tone";
import { callTool, useSettingsTools } from "../src/plugins/builtin-settings";
import { createSettingChanges } from "../src/settings-in-chat/changes";
import { createSettingChangeRoutes } from "../src/settings-in-chat/routes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `tn-${randomUUID().slice(0, 8)}`;
const alice = `${prefix}-alice`;
const bob = `${prefix}-bob`;
const leo = `${prefix}-leo`;
const otto = `${prefix}-otto`;
const own = `${prefix}-own`;
const realNames = new Map([
  [leo, `Leo${prefix.replace(/\W|\d/g, "")}`],
  [otto, `Otto${prefix.replace(/\W|\d/g, "")}`],
]);
const audit = createAuditStore(database);
const reader = createAuditReader(database);
const changes = createSettingChanges({ database, audit, reader });
let packageId = "";

const asPerson =
  (id: string) => async (context: Context, next: () => Promise<void>) => {
    context.set("actor", { id, email: `${id}@example.test`, role: "user" });
    await next();
  };

async function say(member: string | undefined, value: string, caller = leo) {
  return callTool(
    { url: "", actorId: alice, botId: caller },
    "change_setting",
    { setting: "tone", value, ...(member ? { member } : {}) },
  );
}
const changeIdOf = (text: string) => JSON.parse(text).changeId as string;
async function undoAs(person: string, changeId: string) {
  const routes = createSettingChangeRoutes(changes, asPerson(person) as never);
  const response = await routes.request(`/${changeId}/undo`, {
    method: "POST",
  });
  return response.status;
}
async function stored(person: string, agentId: string) {
  const [row] = await database
    .select({ tone: agentPreferences.tone })
    .from(agentPreferences)
    .where(eq(agentPreferences.userId, person));
  void agentId;
  return row?.tone ?? null;
}

/** The run this person's member `agentId` sends to agent-freeduet, with `forwardedProps` as a caller sent them. */
async function runFor(
  person: string,
  agentId: string,
  forwardedProps: Record<string, unknown> = { original: true },
  load = personToneReaderFor(database, person),
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
  try {
    const built = await buildAgents(
      [
        {
          id: agentId,
          name: "Remote",
          type: "remote_ag_ui",
          endpoint: "https://remote.test/ag-ui",
          standingMessage: {
            id: `standing-role:${agentId}`,
            role: "system",
            content: "Remote job",
          },
        },
      ],
      { provider: "openai", defaultModel: "test" },
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      load,
    );
    const agent = built[agentId];
    if (!agent) throw new Error("Missing fixture agent");
    agent.threadId = "thread";
    agent.messages = [{ id: "person-message", role: "user", content: "Hi" }];
    await agent.runAgent({ runId: "run", forwardedProps });
    const [sent] = requests;
    if (!sent) throw new Error("The agent sent nothing");
    return sent;
  } finally {
    spy.mockRestore();
  }
}

beforeAll(async () => {
  await database
    .insert(users)
    .values([alice, bob].map((id) => ({ id, email: `${id}@example.test` })));
  const [pkg] = await database
    .insert(deploymentPackages)
    .values({ tenantId: prefix, sourcePath: "test", checksum: prefix })
    .returning();
  packageId = pkg!.id;
  for (const id of [leo, otto])
    await database.insert(agents).values({
      id,
      name: realNames.get(id)!,
      type: "built_in",
      configuration: {},
      packageId,
    });
  await database.insert(agents).values({
    id: own,
    name: "Alice's own bot",
    type: "built_in",
    configuration: {},
  });
  await database.insert(agentProfiles).values(
    [leo, otto, own].map((agentId) => ({
      agentId,
      title: "Member",
      roleDescription: "Test",
      avatarSeed: agentId,
      visibility: "public" as const,
    })),
  );
  useSettingsTools(changes);
});

afterEach(async () => {
  await database
    .delete(agentPreferences)
    .where(inArray(agentPreferences.agentId, [leo, otto, own]));
});

afterAll(async () => {
  useSettingsTools(null);
  await database.delete(agents).where(inArray(agents.id, [leo, otto, own]));
  await database
    .delete(deploymentPackages)
    .where(eq(deploymentPackages.id, packageId));
  await database.delete(users).where(inArray(users.id, [alice, bob]));
  await database.$client.close();
});

describe("what can be asked", () => {
  test("plain, warm and formal, and nothing else", async () => {
    for (const bad of ["sarcastic", "WARM", "warm.", "", "casual", "formal\n"])
      expect((await say(realNames.get(otto), bad)).isError).toBeTrue();
    expect(
      await database
        .select()
        .from(agentPreferences)
        .where(eq(agentPreferences.agentId, otto)),
    ).toHaveLength(0);
    expect((await say(realNames.get(otto), "warm")).isError).toBeFalse();
    expect(await stored(alice, otto)).toBe("warm");
  });

  test("a member that is asked sets its own, with no member given; a Bot the person made is refused", async () => {
    await say(undefined, "formal", leo);
    const [row] = await database
      .select()
      .from(agentPreferences)
      .where(eq(agentPreferences.agentId, leo));
    expect(row?.tone).toBe("formal");
    expect((await say(own, "warm")).isError).toBeTrue();
  });

  test("plain clears the choice", async () => {
    await say(realNames.get(otto), "warm");
    await say(realNames.get(otto), "plain");
    expect(await stored(alice, otto)).toBeNull();
  });

  test("the same value again changes nothing and records nothing", async () => {
    await say(realNames.get(otto), "warm");
    const again = await say(realNames.get(otto), "warm");
    expect(again.isError).toBeFalse();
    expect(() => JSON.parse(again.text)).toThrow();
  });
});

describe("the record and Undo", () => {
  test("the audit row holds the real id and name and the values", async () => {
    const id = changeIdOf((await say(realNames.get(otto), "warm")).text);
    const { events } = await reader.list({
      eventType: "configuration.changed",
      targetType: "bot_setting",
      targetId: id,
      actorUserId: alice,
      limit: 1,
    });
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      setting: "tone",
      agentId: otto,
      agentName: realNames.get(otto),
      previousValue: "plain",
      newValue: "warm",
    });
  });

  test("Undo puts the earlier tone back, only for the person, once; refused after a later change", async () => {
    const first = changeIdOf((await say(realNames.get(otto), "warm")).text);
    expect(await undoAs(bob, first)).toBe(404);
    expect(await undoAs(alice, first)).toBe(200);
    expect(await stored(alice, otto)).toBeNull();
    expect(await undoAs(alice, first)).toBe(409);
    const warm = changeIdOf((await say(realNames.get(otto), "warm")).text);
    await say(realNames.get(otto), "formal");
    expect(await undoAs(alice, warm)).toBe(409);
    expect(await stored(alice, otto)).toBe("formal");
  });

  test("the change list shows it as undoable", async () => {
    const id = changeIdOf((await say(realNames.get(otto), "formal")).text);
    const row = (await changes.list({ ownerUserId: alice })).find(
      (c) => c.changeId === id,
    );
    expect(row?.setting).toBe("tone");
    expect(row?.undoable).toBeTrue();
  });
});

describe("what the run carries", () => {
  test("warm and formal reach the member, for the person who chose them and for nobody else", async () => {
    await say(realNames.get(otto), "warm");
    const mine = await runFor(alice, otto);
    expect(mine.forwardedProps[PERSON_TONE_PROP]).toEqual({
      version: 1,
      tone: "warm",
    });
    const bobs = await runFor(bob, otto);
    expect(Object.keys(bobs.forwardedProps)).not.toContain(PERSON_TONE_PROP);
    // Another member of the same person has its own tone.
    const other = await runFor(alice, leo);
    expect(Object.keys(other.forwardedProps)).not.toContain(PERSON_TONE_PROP);
    await say(realNames.get(otto), "formal");
    expect(
      (await runFor(alice, otto)).forwardedProps[PERSON_TONE_PROP],
    ).toEqual({ version: 1, tone: "formal" });
  });

  test("plain and never-chose leave forwardedProps exactly as they were", async () => {
    const never = await runFor(alice, otto);
    await say(realNames.get(otto), "warm");
    await say(realNames.get(otto), "plain");
    const plain = await runFor(alice, otto);
    expect(plain.forwardedProps).toEqual(never.forwardedProps);
    expect(Object.keys(plain.forwardedProps)).toEqual([
      "original",
      "openbotBotId",
      "openbotDeploymentTools",
    ]);
  });

  test("a caller cannot name a tone, with a tone stored or not", async () => {
    const forged = { [PERSON_TONE_PROP]: { version: 1, tone: "warm" } };
    const none = await runFor(alice, otto, forged);
    expect(Object.keys(none.forwardedProps)).not.toContain(PERSON_TONE_PROP);
    await say(realNames.get(otto), "formal");
    const set = await runFor(alice, otto, forged);
    expect(set.forwardedProps[PERSON_TONE_PROP]).toEqual({
      version: 1,
      tone: "formal",
    });
  });

  test("a reader that fails costs the tone, not the run", async () => {
    const sent = await runFor(alice, otto, { original: true }, async () => {
      throw new Error("boom");
    });
    expect(Object.keys(sent.forwardedProps)).not.toContain(PERSON_TONE_PROP);
  });
});

describe("the gate", () => {
  async function stored_request(
    tone: "plain" | "warm" | "formal",
    asking: string,
  ) {
    const approvals = createApprovalStore(database);
    const service = createApprovalService(approvals, undefined, undefined);
    await service.setPreferences(alice, { enabled: false, autoReview: false });
    await say(realNames.get(otto), tone);
    const toolCallId = randomUUID();
    const args = { setting: "tone", member: "Otto", value: "warm" };
    const candidate: ApprovalCandidate = {
      actorId: alice,
      botId: asking,
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
    // Identical requests wait as one, so each tone is asked by another member; what differs is only who asked.
    const { botId: _bot, ...action } = request!.action;
    // Ids, and the digest taken over them, differ per request by design; everything else is compared.
    const text = JSON.stringify(action)
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        "<id>",
      )
      .replace(/[0-9a-f]{64}/g, "<digest>");
    return { source: request!.action.policy?.source, text };
  }

  test("a tone change asks a card, and the card a request makes is the same under every tone", async () => {
    const plain = await stored_request("plain", leo);
    expect(plain.source).toBe("always_ask");
    expect(await stored_request("warm", otto)).toEqual(plain);
    expect(await stored_request("formal", own)).toEqual(plain);
  });
});
