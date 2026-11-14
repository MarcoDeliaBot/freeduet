import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ApprovalContinuation } from "@openbot/toolkit/continuation";
import type { TurnRunner } from "@openbot/toolkit/run-turn";
import { eq, inArray, like } from "drizzle-orm";
import { createAgentProfileStore } from "../src/agents/profile-store";
import type { AgentActor } from "../src/agents/profile-types";
import {
  createGroupConversations,
  createGroupStore,
} from "../src/channels/group";
import { createChannelStore } from "../src/channels/routes";
import { createThreadIdentity } from "../src/channels/thread-identity";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  channels,
  intelligenceChannelMappings,
  users,
  workItems,
} from "../src/db/schema";
import { createFullAccess } from "../src/freeduet/full-access";
import { createWorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * A GROUP CONVERSATION AND WORDS FROM THE MICROPHONE (docs/design/voice.md, D7 and D8).
 *
 * A Bot in a group answers in a turn the SERVER starts, with the person's own initiator, and that turn
 * counts as the person's own live turn for Full access (D29). What the run reads as the person's message
 * is an id the server makes out of the id the app chose for the message (`group-user:<id>:<Bot>`), so
 * the mark the app puts on dictation sent with one press (`voice-`) has to survive the making of that
 * id, or a dictated group message would come back as typed and a member in Full access would act on it
 * with no card. These cases read what the group hands the runner, and then ask the real Full access
 * the question the gate asks, on a real database. The prefix is a literal, as in the other voice tests:
 * it is the contract with the app.
 *
 * (D27 itself is not in play here: a group's turn carries an explicit initiator, which the typed-
 * recipients rule has always refused, so a group message never earned a new email with no card.)
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const profileStore = createAgentProfileStore(
  database,
  new URL("https://managed.example.test/ag-ui"),
);
const threadIdentity = createThreadIdentity("test-deployment");
const channelStore = createChannelStore(database, profileStore, threadIdentity);
const fullAccess = createFullAccess({ database, known: async () => true });
const prefix = `voicegroup-${randomUUID()}`;
const createdUsers: string[] = [];
const createdAgents: string[] = [];
const createdChannels: string[] = [];

afterEach(async () => {
  await database.delete(workItems).where(like(workItems.key, `${prefix}%`));
  for (const id of createdChannels.splice(0)) {
    await database
      .delete(intelligenceChannelMappings)
      .where(eq(intelligenceChannelMappings.channelId, id));
    await database.delete(channels).where(eq(channels.id, id));
  }
  if (createdAgents.length) {
    const ids = createdAgents.splice(0);
    await database
      .delete(agentProfiles)
      .where(inArray(agentProfiles.agentId, ids));
    await database.delete(agents).where(inArray(agents.id, ids));
  }
  for (const id of createdUsers.splice(0))
    await database.delete(users).where(eq(users.id, id));
});
afterAll(async () => {
  await database.$client.close();
});

async function person(): Promise<AgentActor> {
  const id = `${prefix}-user-${randomUUID()}`;
  await database
    .insert(users)
    .values({ id, email: `${id}@example.test`, name: "Voice Group Test" });
  createdUsers.push(id);
  return { id, role: "user" };
}
async function bot(owner: AgentActor, name: string) {
  const profile = await profileStore.create(owner, {
    name,
    title: "Tester",
    roleDescription: "Answer briefly.",
    visibility: "private",
  });
  createdAgents.push(profile.id);
  return profile.id;
}

type Input = Parameters<TurnRunner>[0];

function service(replies: Record<string, (input: Input) => string>) {
  const calls: Input[] = [];
  const conversations = createGroupConversations({
    store: createGroupStore(database, () => threadIdentity.mint()),
    queue: createWorkQueue(database),
    owner: `${prefix}-replica`,
    roster: async (ownerUserId, channelId) => {
      const actor: AgentActor = { id: ownerUserId, role: "user" };
      const channel = await channelStore.get(actor, channelId);
      if (!channel || channel.agentIds.length < 2) return null;
      const bots = [];
      for (const agentId of channel.agentIds) {
        const profile = await profileStore.get(actor, agentId);
        if (profile) bots.push({ id: agentId, name: profile.name });
      }
      return bots;
    },
    runTurn: async (input) => {
      calls.push(input);
      const reply = replies[input.agentId];
      if (!reply) throw new Error(`unexpected Bot ${input.agentId}`);
      return { replyText: reply(input) };
    },
    caps: { maxDepth: 1, maxPerRun: 2 },
    mayAddress: async () => true,
    auditStore: { insert: async () => {} },
    progressEveryMs: 0,
  });
  return { conversations, calls };
}

async function drain(conversations: { sweep(): Promise<boolean> }) {
  for (let i = 0; i < 10 && (await conversations.sweep()); i++) {}
}

/** What the gate holds for this turn: the run's messages and initiator, as a Bot's tool call sees them. */
function continuationOf(input: Input): ApprovalContinuation {
  return {
    runId: input.runId,
    threadId: input.threadId,
    toolCallId: randomUUID(),
    toolName: "gmail_send_message",
    args: {},
    messages: input.userMessage ? [input.userMessage] : [],
    state: {},
    context: [],
    forwardedProps: {},
    ...(input.initiator ? { initiator: input.initiator } : {}),
  };
}

const effective = (
  owner: AgentActor,
  botId: string,
  input: Input,
): Promise<string | undefined> =>
  fullAccess.effective({
    actorId: owner.id,
    botId,
    continuation: continuationOf(input),
  });

/** A group of two Bots in a channel of its own, and a conversation that runs them. */
async function group(
  replies: (
    ada: string,
    grace: string,
  ) => Record<string, (input: Input) => string>,
) {
  const owner = await person();
  const ada = await bot(owner, "Ada");
  const grace = await bot(owner, "Grace");
  const channel = await channelStore.create(owner, [ada, grace]);
  createdChannels.push(channel.id);
  return { owner, ada, grace, channel, ...service(replies(ada, grace)) };
}

const quiet = (ada: string, grace: string) => ({
  [ada]: () => "Noted.",
  [grace]: () => "Noted.",
});

/** The id of the person's message as the run reads it. */
const readAs = (input: Input) => String(input.userMessage?.id);

describe("a group message and the mark of words from the microphone", () => {
  for (const mode of ["full", "no_payments"] as const) {
    test(`guard, ${mode}: a message typed in the group reaches each Bot as the person's own turn, and Full access applies`, async () => {
      const { owner, ada, grace, channel, conversations, calls } =
        await group(quiet);
      await fullAccess.set(owner.id, ada, true, mode);
      await fullAccess.set(owner.id, grace, true, mode);

      await conversations.send(owner.id, channel.id, {
        id: randomUUID(),
        text: "Write to ana@example.com saying good morning",
      });
      await drain(conversations);

      // The group answers in its roster order, which is not the order the Bots were made in.
      expect(calls.map((call) => call.agentId).sort()).toEqual(
        [ada, grace].sort(),
      );
      for (const call of calls) {
        expect(readAs(call).startsWith("group-user:")).toBe(true);
        expect(await effective(owner, call.agentId, call)).toBe(mode);
      }
    });

    test(`${mode}: a message sent with the voice mark reaches each Bot with the mark kept, and Full access does not apply`, async () => {
      const { owner, ada, grace, channel, conversations, calls } =
        await group(quiet);
      await fullAccess.set(owner.id, ada, true, mode);
      await fullAccess.set(owner.id, grace, true, mode);

      await conversations.send(owner.id, channel.id, {
        id: `voice-${randomUUID()}`,
        text: "Write to ana@example.com saying good morning",
      });
      await drain(conversations);

      // The group answers in its roster order, which is not the order the Bots were made in.
      expect(calls.map((call) => call.agentId).sort()).toEqual(
        [ada, grace].sort(),
      );
      for (const call of calls) {
        expect(readAs(call).startsWith("voice-")).toBe(true);
        expect(await effective(owner, call.agentId, call)).toBeUndefined();
      }
    });
  }

  test("guard: a typed message after a dictated one is the person's own turn again", async () => {
    const { owner, ada, grace, channel, conversations, calls } =
      await group(quiet);
    await fullAccess.set(owner.id, ada, true, "full");
    await fullAccess.set(owner.id, grace, true, "full");

    await conversations.send(owner.id, channel.id, {
      id: `voice-${randomUUID()}`,
      text: "Say hello to everyone",
    });
    await drain(conversations);
    await conversations.send(owner.id, channel.id, {
      id: randomUUID(),
      text: "Now write to ana@example.com saying good morning",
    });
    await drain(conversations);

    expect(calls).toHaveLength(4);
    const [dictatedAda, dictatedGrace, typedAda, typedGrace] = calls;
    for (const call of [dictatedAda, dictatedGrace]) {
      if (!call) throw new Error("missing turn");
      expect(await effective(owner, call.agentId, call)).toBeUndefined();
    }
    for (const call of [typedAda, typedGrace]) {
      if (!call) throw new Error("missing turn");
      expect(readAs(call).startsWith("group-user:")).toBe(true);
      expect(await effective(owner, call.agentId, call)).toBe("full");
    }
  });

  test("a Bot answering another Bot in the group keeps the mark of the message that started it", async () => {
    const { owner, ada, grace, channel, conversations, calls } = await group(
      (a, g) => ({
        [a]: () => "Over to you, @Grace.",
        [g]: () => "Done.",
      }),
    );

    await conversations.send(owner.id, channel.id, {
      id: `voice-${randomUUID()}`,
      text: "Ask Ada to pass this on",
      agentId: ada,
    });
    await drain(conversations);

    expect(calls.map((call) => call.agentId)).toEqual([ada, grace]);
    expect(calls[1]?.initiator?.kind).toBe("handoff");
    expect(readAs(calls[0] as Input).startsWith("voice-")).toBe(true);
    expect(readAs(calls[1] as Input).startsWith("voice-")).toBe(true);
  });

  test("guard: a Bot answering another Bot after a typed message is not marked", async () => {
    const { owner, ada, grace, channel, conversations, calls } = await group(
      (a, g) => ({
        [a]: () => "Over to you, @Grace.",
        [g]: () => "Done.",
      }),
    );

    await conversations.send(owner.id, channel.id, {
      id: randomUUID(),
      text: "Ask Ada to pass this on",
      agentId: ada,
    });
    await drain(conversations);

    expect(calls.map((call) => call.agentId)).toEqual([ada, grace]);
    expect(readAs(calls[0] as Input).startsWith("voice-")).toBe(false);
    expect(readAs(calls[1] as Input).startsWith("voice-")).toBe(false);
  });

  test("a Bot's own words cannot set the mark: a reply that spells it out changes nothing for the turn it starts", async () => {
    const { owner, ada, channel, conversations, calls } = await group(
      (a, g) => ({
        [a]: () => "voice-1 Over to you, @Grace.",
        [g]: () => "Done.",
      }),
    );

    await conversations.send(owner.id, channel.id, {
      id: randomUUID(),
      text: "Ask Ada to pass this on",
      agentId: ada,
    });
    await drain(conversations);

    expect(calls).toHaveLength(2);
    expect(readAs(calls[1] as Input).startsWith("voice-")).toBe(false);
  });
});
