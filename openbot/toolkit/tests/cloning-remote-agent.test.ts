import { describe, expect, test } from "bun:test";
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  Middleware,
  type RunAgentInput,
} from "@ag-ui/client";
import { type Observable, of } from "rxjs";
import { CloningRemoteAgent } from "../src/copilotkit/agents";

/**
 * A remote Bot's per-request clone keeps the middleware added after construction (FreeDuet #33).
 *
 * The server adds the person's memory and the channel's purpose with `.use()` once the agent is
 * built, and the runtime runs a browser chat on a clone. Rebuilt from the constructor alone, the
 * clone lost both, so a remote Bot received them on a hop but never in a chat.
 */

/** The remote endpoint: records what it is sent and answers with an empty finished run. */
class RecordingRemote extends AbstractAgent {
  constructor(readonly sent: RunAgentInput[] = []) {
    super({ agentId: "remote" });
  }
  run(input: RunAgentInput): Observable<BaseEvent> {
    this.sent.push(input);
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
  }
  clone() {
    return new RecordingRemote(this.sent) as this;
  }
}

/** Puts one system row in front, as the server's personal-memory middleware does. */
class SystemRow extends Middleware {
  constructor(
    private readonly id: string,
    private readonly content: string,
  ) {
    super();
  }
  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    return this.runNext(
      {
        ...input,
        messages: [
          { id: this.id, role: "system", content: this.content },
          ...input.messages.filter((message) => message.id !== this.id),
        ],
      },
      next,
    );
  }
}

const standingRole = (target: AbstractAgent) => {
  target.use(new SystemRow("standing-role:bookkeeper", "You are Penny."));
};

async function idsSent(agent: AbstractAgent, remote: RecordingRemote) {
  agent.setMessages([{ id: "u1", role: "user", content: "Hi" }]);
  await agent.runAgent({ runId: `run-${remote.sent.length + 1}` });
  return remote.sent.at(-1)?.messages.map((message) => message.id);
}

describe("CloningRemoteAgent.clone", () => {
  test("a cloned remote agent's run carries the memory row added after construction", async () => {
    const remote = new RecordingRemote();
    const agent = new CloningRemoteAgent(remote, standingRole);
    agent.use(new SystemRow("openbot:personal-memory", "Invoices in EUR."));
    agent.use(new SystemRow("openduet:channel", "The Invoices channel."));

    const original = await idsSent(agent, remote);
    const cloned = await idsSent(agent.clone(), remote);

    // The constructor's middleware runs first, then the added ones in order, each putting its row
    // in front: the same messages on the clone as on the agent it was cloned from.
    expect(original).toEqual([
      "openduet:channel",
      "openbot:personal-memory",
      "standing-role:bookkeeper",
      "u1",
    ]);
    expect(cloned).toEqual(original);
    expect(remote.sent.at(-1)?.messages[1]).toEqual({
      id: "openbot:personal-memory",
      role: "system",
      content: "Invoices in EUR.",
    });
  });

  test("the constructor's middleware is attached once, also on a clone of a clone", async () => {
    const remote = new RecordingRemote();
    const agent = new CloningRemoteAgent(remote, standingRole);
    agent.use(new SystemRow("openbot:personal-memory", "Invoices in EUR."));
    const twice = agent.clone().clone();
    const ids = await idsSent(twice, remote);
    expect(ids).toEqual([
      "openbot:personal-memory",
      "standing-role:bookkeeper",
      "u1",
    ]);
  });

  test("a clone of an agent nothing was added to has the constructor's middleware only", async () => {
    const remote = new RecordingRemote();
    const ids = await idsSent(
      new CloningRemoteAgent(remote, standingRole).clone(),
      remote,
    );
    expect(ids).toEqual(["standing-role:bookkeeper", "u1"]);
  });

  test("middleware added to the clone stays on the clone", async () => {
    const remote = new RecordingRemote();
    const agent = new CloningRemoteAgent(remote, standingRole);
    const clone = agent.clone();
    clone.use(new SystemRow("openbot:personal-memory", "Only here."));
    expect(await idsSent(agent, remote)).toEqual([
      "standing-role:bookkeeper",
      "u1",
    ]);
    expect(await idsSent(clone, remote)).toEqual([
      "openbot:personal-memory",
      "standing-role:bookkeeper",
      "u1",
    ]);
  });
});
