import { describe, expect, test } from "bun:test";
import {
  OFFER_FILE_TOOL,
  OFFERED_PATH_MAX,
  readOfferedFile,
} from "@openbot/shared/member-file";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import type { AgentProfile } from "../src/agents/profile-types";
import type { AuditInitiator } from "../src/audit";
import {
  ActionRefusedError,
  type ComputerGateway,
  ComputerUnavailableError,
  WorkspaceNotFoundError,
  WorkspaceRefusedError,
  WorkspaceRequestError,
  WorkspaceTooLargeError,
} from "../src/computer/gateway";
import { memberFileTools } from "../src/freeduet/member-files";

/**
 * The tool a member offers a file with, against a gateway that answers as told.
 *
 * What this file pins is what the tool does with what the gateway says: the card it returns, the
 * sentence a member is told for each way the look can fail, and what it hands the gateway. The file
 * itself is looked at for real, against a real workspace, in member-files.integration.test.ts.
 */

const PERSON = "person-1";
const MEMBER = "video";
const initiator: AuditInitiator = { kind: "person" };

type Look = { botId: string; actorId: string; userId?: string; path: string };

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: MEMBER,
    name: "Cam",
    title: "Video maker",
    roleDescription: "",
    avatarSeed: "cam",
    visibility: "public",
    ownerUserId: null,
    systemOwned: true,
    hidden: false,
    pinned: false,
    deletedAt: null,
    endpoint: null,
    hasAuth: false,
    hasCallbackToken: false,
    ...overrides,
  };
}

function stream(onCancel: () => void) {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
    },
    cancel: onCancel,
  });
}

/** A gateway whose download answers with `answer`, recording what it was asked and what became of the stream. */
function gatewayAnswering(
  answer: () => { name: string; bytes: number } | Error,
) {
  const looks: Look[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const state = { cancelled: 0 };
  const gateway = {
    downloadFile: async (
      botId: string,
      actor: { id: string; userId?: string },
      input: { path: string },
      signal?: AbortSignal,
    ) => {
      looks.push({
        botId,
        actorId: actor.id,
        ...(actor.userId ? { userId: actor.userId } : {}),
        path: input.path,
      });
      signals.push(signal);
      const result = answer();
      if (result instanceof Error) throw result;
      return {
        ...result,
        body: stream(() => {
          state.cancelled += 1;
        }),
      };
    },
  } as unknown as ComputerGateway;
  return { gateway, looks, signals, state };
}

function toolFor(
  gateway: ComputerGateway | undefined,
  options: {
    profile?: AgentProfile | null;
    role?: "admin" | "user";
    switches?: Record<string, boolean> | undefined;
    failWith?: Error;
  } = {},
) {
  const build = memberFileTools({
    computerGateway: gateway,
    agentProfileStore: {
      get: async () => {
        if (options.failWith) throw options.failWith;
        return "profile" in options ? (options.profile ?? null) : profile();
      },
    },
    actorFor: async (id) => ({ id, role: options.role ?? "user" }),
    capabilitiesOf: async () => options.switches as never,
  });
  return build({ ownerUserId: PERSON, agentId: MEMBER, initiator });
}

async function execute(
  gateway: ComputerGateway,
  args: unknown,
  options: Parameters<typeof toolFor>[1] = {},
) {
  const [tool] = await toolFor(gateway, options);
  if (!tool) throw new Error("The tool was not offered.");
  return tool.execute(args);
}

describe("when a member is offered the tool", () => {
  test("a member that may use its computer is offered one tool, offer_file", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a", bytes: 1 }));
    const tools = await toolFor(gateway);
    expect(tools.map((tool) => tool.name)).toEqual([OFFER_FILE_TOOL]);
    expect(tools[0]?.ref).toBe("freeduet/offer_file");
    expect(tools[0]?.initiator).toEqual(initiator);
  });

  test("the description tells a member what it does and what it does not", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a", bytes: 1 }));
    const [tool] = await toolFor(gateway);
    expect(tool?.description).toContain("Download button");
    expect(tool?.description).toContain("relative to it");
    expect(tool?.description).toContain("sends and publishes nothing");
    expect(tool?.description).toContain("asks for no approval");
  });

  test("a deployment with no computer offers nothing", async () => {
    expect(await toolFor(undefined)).toEqual([]);
  });

  test("a Bot the person may not use the computer of is not offered it", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a", bytes: 1 }));
    const somebodysTeamBot = profile({
      visibility: "private",
      ownerUserId: "somebody-else",
      systemOwned: false,
    });
    expect(await toolFor(gateway, { profile: somebodysTeamBot })).toEqual([]);
    expect(
      (await toolFor(gateway, { profile: somebodysTeamBot, role: "admin" }))
        .length,
    ).toBe(1);
  });

  test("a Bot that does not exist for this person is not offered it", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a", bytes: 1 }));
    expect(await toolFor(gateway, { profile: null })).toEqual([]);
  });

  test("a failing lookup of the person or the Bot means no tool, never a failed run", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a", bytes: 1 }));
    expect(
      await toolFor(gateway, { failWith: new Error("database is down") }),
    ).toEqual([]);
    const noRole = memberFileTools({
      computerGateway: gateway,
      agentProfileStore: { get: async () => profile() },
      actorFor: async () => {
        throw new Error("A routine requires an authorized owner.");
      },
    });
    expect(
      await noRole({ ownerUserId: PERSON, agentId: MEMBER, initiator }),
    ).toEqual([]);
  });

  test("a person who switched the computer off is not offered it", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a", bytes: 1 }));
    expect(
      await toolFor(gateway, { switches: { cloudComputer: false } }),
    ).toEqual([]);
  });

  test("the browser and the network switched off leave the files alone", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a", bytes: 1 }));
    const offered = await toolFor(gateway, {
      switches: { cloudBrowser: false, cloudNetwork: false },
    });
    expect(offered.length).toBe(1);
  });

  test("a switch that cannot be read counts as on, as it does for the other computer tools", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a", bytes: 1 }));
    expect((await toolFor(gateway, { switches: undefined })).length).toBe(1);
    expect(
      (await toolFor(gateway, { switches: { cloudComputer: true } })).length,
    ).toBe(1);
  });
});

describe("offering a file", () => {
  test("a file the gateway lets leave becomes the card's facts, and the stream is cancelled unread", async () => {
    const { gateway, looks, signals, state } = gatewayAnswering(() => ({
      name: "final.mp4",
      bytes: 12_345,
    }));
    const result = await execute(gateway, { path: "  out/final.mp4  " });

    const file = readOfferedFile(result);
    expect(file).toEqual({
      botId: MEMBER,
      path: "out/final.mp4",
      name: "final.mp4",
      bytes: 12_345,
    });
    expect(JSON.parse(result)).toMatchObject({
      note: expect.stringContaining("Download"),
    });
    expect(state.cancelled).toBe(1);
    // As this person, for this member, with the run's own initiator: that is what the trail records.
    expect(looks).toEqual([
      { botId: MEMBER, actorId: PERSON, userId: PERSON, path: "out/final.mp4" },
    ]);
    // A look is bounded: it is not allowed to hold the turn for as long as a download may.
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);
  });

  test("the note tells the member not to say it sent anything", async () => {
    const { gateway } = gatewayAnswering(() => ({ name: "a.pdf", bytes: 1 }));
    const result = await execute(gateway, { path: "a.pdf" });
    expect(JSON.parse(result).note).toContain(
      "You have not sent, emailed or uploaded anything",
    );
  });

  test("a name that is unsafe to save is cleaned in the card", async () => {
    const { gateway } = gatewayAnswering(() => ({
      name: "clip\u202Efdp.exe\r\n",
      bytes: 1,
    }));
    const result = await execute(gateway, { path: "clip" });
    // As the tool wrote it, not only as the card reads it back.
    expect(JSON.parse(result).name).toBe("clipfdp.exe");
    expect(readOfferedFile(result)?.name).toBe("clipfdp.exe");
  });

  test.each([
    ["no arguments", undefined],
    ["an empty path", { path: "" }],
    ["a path of spaces", { path: "   " }],
    ["a path that is not text", { path: 12 }],
    ["a path that is too long", { path: "a".repeat(OFFERED_PATH_MAX + 1) }],
    ["a path with a NUL", { path: "out/final.mp4\u0000.png" }],
    ["a path with a line break", { path: "out/a\nb.mp4" }],
    ["a path with DEL", { path: "out/a\u007fb.mp4" }],
    ["a second argument", { path: "a.mp4", botId: "wren" }],
    ["another member named in the arguments", { path: "a.mp4", bot: "wren" }],
  ])("%s is refused without asking the gateway", async (_name, args) => {
    const { gateway, looks } = gatewayAnswering(() => ({
      name: "a",
      bytes: 1,
    }));
    const result = await execute(gateway, args);
    expect(result.startsWith("Refused.")).toBe(true);
    expect(result).toContain("relative to it");
    expect(readOfferedFile(result)).toBeNull();
    expect(looks).toEqual([]);
  });

  test("a path of exactly the longest length is taken", async () => {
    const { gateway, looks } = gatewayAnswering(() => ({
      name: "a",
      bytes: 1,
    }));
    const path = "a".repeat(OFFERED_PATH_MAX);
    const file = readOfferedFile(await execute(gateway, { path }));
    expect(file?.path).toBe(path);
    expect(looks.length).toBe(1);
  });
});

describe("what a member is told when the file cannot be offered", () => {
  test.each([
    [
      "the file is not there",
      new WorkspaceNotFoundError("There is no file at out/x.mp4."),
      ["There is no file at out/x.mp4 in your workspace", "List the folder"],
    ],
    [
      "the file is too large",
      new WorkspaceTooLargeError(
        "That file is 200 bytes and the download limit is 100.",
      ),
      ["the download limit is 100", "Make the file smaller"],
    ],
    [
      "the path leaves the workspace",
      new WorkspaceRefusedError(
        "Use a path relative to your workspace, not an absolute one.",
      ),
      ["not an absolute one", "inside your own workspace"],
    ],
    [
      "the path is a folder",
      new WorkspaceRequestError("out is not a file."),
      ["out is not a file", "one file, not a folder"],
    ],
    [
      "the deployment's policy says no",
      new ActionRefusedError("Blocked by policy.", "file.extension == 'pem'"),
      ["Blocked by policy", "tell the person where it is"],
    ],
    [
      "the computer is not running",
      new ComputerUnavailableError("The Bot's computer isn't running."),
      ["The Bot's computer isn't running", "try again in a moment"],
    ],
  ])(
    "%s: it says so and what to do, and draws no card",
    async (_name, error, words) => {
      const { gateway, state } = gatewayAnswering(() => error);
      const result = await execute(gateway, { path: "out/x.mp4" });
      expect(result.startsWith("Refused.")).toBe(true);
      for (const word of words) expect(result).toContain(word);
      expect(readOfferedFile(result)).toBeNull();
      // There was no stream to give back.
      expect(state.cancelled).toBe(0);
    },
  );

  test("a failure that is ours is not described to a model that would repeat it", async () => {
    const { gateway } = gatewayAnswering(
      () => new Error("connect ECONNREFUSED 10.0.0.7:5432 password=hunter2"),
    );
    const result = await execute(gateway, { path: "out/x.mp4" });
    expect(result.startsWith("Refused.")).toBe(true);
    expect(result).not.toContain("hunter2");
    expect(result).not.toContain("10.0.0.7");
    expect(result).toContain("could not be checked just now");
  });

  test("a rule that asks the person first ends the offer without a card, and says nothing of it", async () => {
    const { gateway } = gatewayAnswering(
      () =>
        new HeadlessToolSuspension(
          "This action is waiting for your approval.",
          {
            kind: "approval",
            approvalId: "a-1",
            requestId: "a-1",
          } as never,
        ),
    );
    const result = await execute(gateway, { path: "out/x.mp4" });
    expect(result.startsWith("Refused.")).toBe(true);
    expect(readOfferedFile(result)).toBeNull();
  });
});
