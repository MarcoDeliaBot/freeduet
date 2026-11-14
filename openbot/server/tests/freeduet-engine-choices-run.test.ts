/**
 * How the person's engine choices reach agent-freeduet (docs/design/engines-dashboard.md, docs/ENGINES_PLAN.md slice 7).
 *
 * The choices are kept on this server. A run carries them as one `forwardedProps` entry, `openbotEngineChoices`, for the
 * Bot the run is for: `{ version: 1, mode }`, a number and one of two words. Pinned here, without a database and through
 * the real run path (`buildAgents`, the middleware that builds each run for a remote member):
 *   - a Bot with a choice sends it, and a Bot with none sends no such entry at all;
 *   - another Bot's choice never rides on this Bot's run;
 *   - a caller cannot set its own choices: whatever it sent under that name is removed before the server's own is added;
 *   - stored choices that cannot be read send nothing, so the engines file's values apply;
 *   - nothing else about the run changes.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  type BaseEvent,
  EventType,
  HttpAgent,
  type RunAgentInput,
} from "@ag-ui/client";
import { of } from "rxjs";
import { buildAgents } from "../src/copilot";
import {
  type ChoicesSnapshot,
  ENGINE_CHOICES_PROP,
  useEngineChoices,
  withEngineChoices,
} from "../src/freeduet/engine-choices";

/** What `current()` of the real service gives: here with a choice for Iris and none for anybody else. */
function saved(members: Record<string, "automatic" | "ask-first">) {
  const snapshot: ChoicesSnapshot = {
    state: "ok",
    members: new Map(
      Object.entries(members).map(([id, mode]) => [id, { mode }]),
    ),
  };
  return { current: () => snapshot };
}

const unreadable = {
  current: (): ChoicesSnapshot => ({ state: "unreadable" }),
};

afterEach(() => {
  useEngineChoices(null);
});

describe("withEngineChoices", () => {
  test("the name is the one agent-freeduet reads", () => {
    expect(ENGINE_CHOICES_PROP).toBe("openbotEngineChoices");
  });

  test("a Bot with a choice gets it as a version and one word, and nothing else is added", () => {
    const props = { openbotBotId: "iris", other: 1 };
    const sent = withEngineChoices(props, "iris", saved({ iris: "ask-first" }));
    expect(sent).toEqual({
      openbotBotId: "iris",
      other: 1,
      openbotEngineChoices: { version: 1, mode: "ask-first" },
    });
    expect(Object.keys(sent[ENGINE_CHOICES_PROP] as object)).toEqual([
      "version",
      "mode",
    ]);
  });

  test("both words are carried as they are", () => {
    for (const mode of ["automatic", "ask-first"] as const) {
      expect(
        withEngineChoices({}, "leo", saved({ leo: mode }))[ENGINE_CHOICES_PROP],
      ).toEqual({ version: 1, mode });
    }
  });

  test("a Bot with no choice gets no entry at all, and another Bot's choice is not sent to it", () => {
    const props = { openbotBotId: "leo" };
    const sent = withEngineChoices(props, "leo", saved({ iris: "ask-first" }));
    expect(sent).toEqual(props);
    expect(Object.keys(sent)).not.toContain(ENGINE_CHOICES_PROP);
  });

  test("choices that cannot be read send nothing", () => {
    const sent = withEngineChoices({ a: 1 }, "iris", unreadable);
    expect(sent).toEqual({ a: 1 });
  });

  test("with no source installed, nothing is added", () => {
    expect(withEngineChoices({ a: 1 }, "iris", null)).toEqual({ a: 1 });
    expect(withEngineChoices({ a: 1 }, "iris")).toEqual({ a: 1 });
  });

  test("whatever a caller put under the name is removed first, with a choice or without", () => {
    const forged = {
      a: 1,
      [ENGINE_CHOICES_PROP]: { version: 1, mode: "automatic", pin: "gateway" },
    };
    expect(Object.keys(withEngineChoices(forged, "iris", null))).toEqual(["a"]);
    expect(Object.keys(withEngineChoices(forged, "iris", unreadable))).toEqual([
      "a",
    ]);
    expect(
      Object.keys(
        withEngineChoices(forged, "leo", saved({ iris: "ask-first" })),
      ),
    ).toEqual(["a"]);
    expect(
      withEngineChoices(forged, "iris", saved({ iris: "ask-first" }))[
        ENGINE_CHOICES_PROP
      ],
    ).toEqual({ version: 1, mode: "ask-first" });
  });

  test("the props it was given are not changed", () => {
    const forged = Object.freeze({
      a: 1,
      [ENGINE_CHOICES_PROP]: { version: 1, mode: "automatic" },
    });
    expect(() =>
      withEngineChoices(forged, "iris", saved({ iris: "ask-first" })),
    ).not.toThrow();
    expect(forged[ENGINE_CHOICES_PROP]).toEqual({
      version: 1,
      mode: "automatic",
    });
  });

  test("the installed source is the default, and installing nothing turns it off", () => {
    useEngineChoices(saved({ iris: "ask-first" }));
    expect(withEngineChoices({}, "iris")[ENGINE_CHOICES_PROP]).toEqual({
      version: 1,
      mode: "ask-first",
    });
    useEngineChoices(null);
    expect(withEngineChoices({}, "iris")).toEqual({});
  });

  test("a change in what is saved reaches the next call with no further wiring", () => {
    const members = new Map<string, { mode: "automatic" | "ask-first" }>();
    let snapshot: ChoicesSnapshot = { state: "ok", members };
    useEngineChoices({ current: () => snapshot });
    expect(withEngineChoices({}, "iris")).toEqual({});
    snapshot = {
      state: "ok",
      members: new Map([["iris", { mode: "automatic" }]]),
    };
    expect(withEngineChoices({}, "iris")[ENGINE_CHOICES_PROP]).toEqual({
      version: 1,
      mode: "automatic",
    });
  });
});

/** A remote member's run as OpenBot sends it to agent-freeduet, with the given props from the caller. */
async function requestSent(
  botId: string,
  forwardedProps: Record<string, unknown> = { original: true },
): Promise<RunAgentInput> {
  const requests: RunAgentInput[] = [];
  const run = spyOn(HttpAgent.prototype, "run").mockImplementation((input) => {
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
    const agent = (
      await buildAgents(
        [
          {
            id: botId,
            name: "Remote",
            type: "remote_ag_ui",
            endpoint: "https://remote.test/ag-ui",
            standingMessage: {
              id: `standing-role:${botId}`,
              role: "system",
              content: "Remote job",
            },
          },
        ],
        { provider: "openai", defaultModel: "test" },
        null,
      )
    )[botId];
    if (!agent) throw new Error("Missing fixture agent");
    agent.threadId = "thread";
    agent.messages = [{ id: "person-message", role: "user", content: "Hi" }];
    await agent.runAgent({ runId: "run", forwardedProps });
    const [sent] = requests;
    if (!sent) throw new Error("The agent sent nothing");
    return sent;
  } finally {
    run.mockRestore();
  }
}

describe("what OpenBot sends agent-freeduet for a run", () => {
  test("a Bot with a choice sends it beside the other per-run facts", async () => {
    useEngineChoices(saved({ remote: "ask-first" }));
    const sent = await requestSent("remote");
    expect(sent.forwardedProps).toEqual({
      original: true,
      openbotBotId: "remote",
      openbotDeploymentTools: [],
      [ENGINE_CHOICES_PROP]: { version: 1, mode: "ask-first" },
    });
  });

  test("with nothing installed, forwardedProps are exactly what they were: no entry, nothing else changed", async () => {
    useEngineChoices(null);
    const sent = await requestSent("remote");
    expect(sent.forwardedProps).toEqual({
      original: true,
      openbotBotId: "remote",
      openbotDeploymentTools: [],
    });
    expect(Object.keys(sent.forwardedProps)).toEqual([
      "original",
      "openbotBotId",
      "openbotDeploymentTools",
    ]);
  });

  test("a Bot with no choice of its own sends none, whoever else has one", async () => {
    useEngineChoices(saved({ iris: "ask-first", leo: "automatic" }));
    const sent = await requestSent("remote");
    expect(Object.keys(sent.forwardedProps)).not.toContain(ENGINE_CHOICES_PROP);
  });

  test("stored choices that cannot be read send nothing, so the file's values apply", async () => {
    useEngineChoices(unreadable);
    const sent = await requestSent("remote");
    expect(Object.keys(sent.forwardedProps)).not.toContain(ENGINE_CHOICES_PROP);
  });

  test("a caller cannot choose for itself: what it sent is removed, and the server's own choice, if any, stands", async () => {
    const forged = {
      [ENGINE_CHOICES_PROP]: { version: 1, mode: "automatic", pin: "gateway" },
    };
    useEngineChoices(null);
    const none = await requestSent("remote", forged);
    expect(Object.keys(none.forwardedProps)).not.toContain(ENGINE_CHOICES_PROP);

    useEngineChoices(saved({ other: "automatic" }));
    const another = await requestSent("remote", forged);
    expect(Object.keys(another.forwardedProps)).not.toContain(
      ENGINE_CHOICES_PROP,
    );

    useEngineChoices(saved({ remote: "ask-first" }));
    const own = await requestSent("remote", forged);
    expect(own.forwardedProps[ENGINE_CHOICES_PROP]).toEqual({
      version: 1,
      mode: "ask-first",
    });
  });
});
