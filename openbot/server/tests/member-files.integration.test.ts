import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadHeaders } from "@openbot/shared/file-download";
import {
  OFFER_FILE_TOOL,
  offeredFileUrl,
  readOfferedFile,
} from "@openbot/shared/member-file";
import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import {
  createWorkspace,
  DEFAULT_WORKSPACE_LIMITS,
  WorkspaceFileError,
  WorkspaceFileNotFoundError,
  WorkspaceFileTooLargeError,
  WorkspacePathError,
} from "../../agent-computer/src/workspace";
import { computerAccessCheck } from "../src/agents/computer-access";
import { createAgentProfileStore } from "../src/agents/profile-store";
import { createRequireUser, createRoleRepository } from "../src/auth/guards";
import type { AuthService } from "../src/auth/guards";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import type { AuditEventInput, AuditStore } from "../src/audit";
import { createComputerGateway } from "../src/computer/gateway";
import type { ActionPolicy } from "../src/computer/policy";
import type { PolicyStore } from "../src/computer/policy-store";
import type { ComputerProvider } from "../src/computer/provider";
import { createComputerRoutes } from "../src/computer/routes";
import { createDatabase } from "../src/db/client";
import { agentProfiles, agents, userRoles, users } from "../src/db/schema";
import { memberFileTools } from "../src/freeduet/member-files";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * D38 end to end: a member offers a file from its own computer and the person downloads it.
 *
 * Real from the tool to the bytes. The tool, the computer gateway (policy, audit, approval gate) and
 * the download route are the ones the server runs; the Bots and the people are rows in Postgres, read
 * through the real profile store, the real access rule and the real sign-in guard; and the computer
 * is the real workspace of agent-computer (`createWorkspace`) behind a socket, with the same status
 * mapping as `agent-computer/src/index.ts`, over a real temporary directory with real symlinks. So
 * the path rules proved here are the ones that decide on a real stack, not a stand-in that agrees
 * with the test.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `mfd-${randomUUID().slice(0, 8)}`;
const owner = `${prefix}-owner`;
const stranger = `${prefix}-stranger`;
const admin = `${prefix}-admin`;
const withoutRole = `${prefix}-no-role`;
const people = [owner, stranger, admin, withoutRole];
const videoId = `${prefix}-video`;
const wrenId = `${prefix}-wren`;
const privateId = `${prefix}-private`;
const botIds = [videoId, wrenId, privateId];

/** Small enough for a test to be over it, and not the real limit, which a test below pins. */
const TEST_LIMIT_BYTES = 4096;

type Computer = {
  workspace: string;
  url: string;
  asked: string[];
  stop: () => void;
};

/** The computer's answer to a failed file request, as `agent-computer/src/index.ts` `fileStatus` gives it. */
function fileStatus(error: unknown): 400 | 403 | 404 | 413 | 500 {
  if (error instanceof WorkspacePathError) return 403;
  if (error instanceof WorkspaceFileTooLargeError) return 413;
  if (error instanceof WorkspaceFileNotFoundError) return 404;
  if (error instanceof WorkspaceFileError) return 400;
  return 500;
}

/** The real workspace behind the one route a download uses (`/files/download` in agent-computer). */
function startComputer(workspace: string): Computer {
  const files = createWorkspace(workspace, {
    ...DEFAULT_WORKSPACE_LIMITS,
    downloadBytes: TEST_LIMIT_BYTES,
  });
  const asked: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      asked.push(`${request.method} ${url.pathname}`);
      if (url.pathname !== "/files/download" || request.method !== "GET")
        return Response.json({ error: "No such route." }, { status: 404 });
      try {
        const file = await files.download(url.searchParams.get("path") ?? "");
        return new Response(file.body, {
          headers: downloadHeaders(file.name, file.bytes),
        });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "The file could not be downloaded.",
          },
          { status: fileStatus(error) },
        );
      }
    },
  });
  return {
    workspace,
    url: `http://127.0.0.1:${server.port}`,
    asked,
    stop: () => server.stop(true),
  };
}

let root = "";
const computers = new Map<string, Computer>();
const auditRows: AuditEventInput[] = [];
const gateCalls: { toolRef: string; effect: string }[] = [];
let policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
let switches: Record<string, boolean> | undefined;

/** Every byte value, so a download that changed a byte, or read the file as text, cannot match. */
const VIDEO_BYTES = Uint8Array.from(
  { length: 3000 },
  (_, index) => index % 256,
);
const HTML = "<!doctype html><script>fetch('/api/admin/users')</script>";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>';
const HOSTILE_NAME = 'evil"\r\nX-Injected: yes.txt';
/** A right-to-left override makes "clip" + "fdp.exe" read as "clipexe.pdf". */
const OVERRIDE_NAME = "clip\u202Efdp.exe";
/** What sits where a path that climbs out would land: none of it may ever appear in an answer. */
const OUTSIDE = "TOP-SECRET-OUTSIDE-9f3a1c";
const SIBLING = "TOP-SECRET-SIBLING-9f3a1c";
const WREN = "WREN-NOTES-9f3a1c";

const store = createApprovalStore(database);
const service = createApprovalService(store, undefined, async () => {
  throw new Error("nothing is executed by this test's service");
});

const provider: ComputerProvider = {
  name: "test",
  isolation: "per-bot",
  locate: async (botId) => {
    const computer = computers.get(botId);
    if (!computer) throw new Error(`No computer for ${botId}.`);
    return computer.url;
  },
  status: async (botId) => ({ botId, state: "ready" }),
  list: async () => [],
  stop: async () => ({ wasRunning: true }),
  reset: async () => ({ cleared: true }),
};

const gateway = createComputerGateway({
  provider,
  auditStore: {
    insert: async (event: AuditEventInput) => {
      auditRows.push(event);
    },
  } as unknown as AuditStore,
  policy: () => policy,
  approvalGate: async (candidate) => {
    gateCalls.push({ toolRef: candidate.toolRef, effect: candidate.effect });
    return service.gate(candidate);
  },
});

const profiles = createAgentProfileStore(database, undefined);
const actorFor = async (id: string) => ({
  id,
  role: id === admin ? ("admin" as const) : ("user" as const),
});
const offerTools = memberFileTools({
  computerGateway: gateway,
  agentProfileStore: profiles,
  actorFor,
  capabilitiesOf: async () => switches as never,
});
const initiator = { kind: "person" as const };

/** The tool as a member of `botId` holds it in a run of `person`, or none. */
async function toolFor(person: string, botId = videoId) {
  const [tool] = await offerTools({
    ownerUserId: person,
    agentId: botId,
    initiator,
  });
  return tool;
}

async function offer(path: unknown, person = owner, botId = videoId) {
  const tool = await toolFor(person, botId);
  if (!tool) throw new Error("The tool was not offered.");
  return tool.execute({ path });
}

/** The sign-in guard the server uses, over a session this test hands out in a header. */
const auth: AuthService = {
  handler: async () => new Response(null, { status: 404 }),
  api: {
    getSession: async ({ headers }) => {
      const id = headers.get("x-test-person");
      return id ? { user: { id, email: `${id}@example.invalid` } } : null;
    },
  },
};
const app = new Hono().route(
  "/api/computers",
  createComputerRoutes(
    gateway,
    {} as PolicyStore,
    createRequireUser(auth, createRoleRepository(database)),
    computerAccessCheck(profiles),
  ),
);

/** What the Download button does: the card's own URL, as the signed-in person. */
function press(url: string, person: string | null = owner) {
  return app.request(
    `http://app.test${url}`,
    person ? { headers: { "x-test-person": person } } : {},
  );
}

function downloadRows(botId = videoId) {
  return auditRows.filter(
    (row) =>
      row.targetId === botId && row.payload.action === "computer_download_file",
  );
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "member-files-"));
  const videoWorkspace = join(root, "video", "workspace");
  const wrenWorkspace = join(root, "wren", "workspace");
  const privateWorkspace = join(root, "private", "workspace");
  await mkdir(join(videoWorkspace, "out"), { recursive: true });
  await mkdir(wrenWorkspace, { recursive: true });
  await mkdir(privateWorkspace, { recursive: true });

  await writeFile(join(videoWorkspace, "out", "final.mp4"), VIDEO_BYTES);
  await writeFile(join(videoWorkspace, "out", "page.html"), HTML);
  await writeFile(join(videoWorkspace, "out", "drawing.svg"), SVG);
  await writeFile(join(videoWorkspace, HOSTILE_NAME), "hostile name");
  await writeFile(join(videoWorkspace, OVERRIDE_NAME), "override name");
  await writeFile(
    join(videoWorkspace, "exact.bin"),
    new Uint8Array(TEST_LIMIT_BYTES),
  );
  await writeFile(
    join(videoWorkspace, "big.bin"),
    new Uint8Array(TEST_LIMIT_BYTES + 1),
  );
  await writeFile(
    join(videoWorkspace, "key.pem"),
    "-----BEGIN PRIVATE KEY-----",
  );
  // What a path that climbs out of the workspace would land on.
  await writeFile(join(root, "outside-secret.txt"), OUTSIDE);
  await writeFile(join(root, "video", "sibling-secret.txt"), SIBLING);
  await writeFile(join(wrenWorkspace, "secret.txt"), WREN);
  await writeFile(
    join(privateWorkspace, "plan.txt"),
    "somebody's private plan",
  );

  await symlink(
    join(root, "outside-secret.txt"),
    join(videoWorkspace, "link-out.txt"),
  );
  await symlink(root, join(videoWorkspace, "link-dir"));
  await symlink(
    join(wrenWorkspace, "secret.txt"),
    join(videoWorkspace, "link-to-wren.txt"),
  );
  await symlink(wrenWorkspace, join(videoWorkspace, "link-to-wren-dir"));
  // A link that stays inside the workspace is just another name for a file that is there.
  await symlink(
    join(videoWorkspace, "out", "final.mp4"),
    join(videoWorkspace, "link-in.mp4"),
  );

  computers.set(videoId, startComputer(videoWorkspace));
  computers.set(wrenId, startComputer(wrenWorkspace));
  computers.set(privateId, startComputer(privateWorkspace));

  await database
    .insert(users)
    .values(people.map((id) => ({ id, email: `${id}@example.test` })));
  await database.insert(userRoles).values([
    { userId: owner, role: "user" },
    { userId: stranger, role: "user" },
    { userId: admin, role: "admin" },
  ]);
  await database.insert(agents).values(
    botIds.map((id) => ({
      id,
      name: id,
      type: "remote_ag_ui" as const,
      configuration: {},
    })),
  );
  await database.insert(agentProfiles).values([
    // Every member of the team is public: the computer of a public Bot is shared by everyone who can sign in.
    {
      agentId: videoId,
      title: "Video maker",
      roleDescription: "",
      avatarSeed: "video",
      visibility: "public",
    },
    {
      agentId: wrenId,
      title: "Writer",
      roleDescription: "",
      avatarSeed: "wren",
      visibility: "public",
    },
    // A Bot somebody made for themselves.
    {
      agentId: privateId,
      ownerUserId: owner,
      title: "Mine",
      roleDescription: "",
      avatarSeed: "private",
      visibility: "private",
    },
  ]);
  await store.setEnabled(owner, true);
});

afterAll(async () => {
  for (const computer of computers.values()) computer.stop();
  await rm(root, { recursive: true, force: true });
  await database.delete(agents).where(inArray(agents.id, botIds));
  await database.delete(users).where(inArray(users.id, people));
  await database.$client.close();
});

describe("a member offers a finished file", () => {
  test("the card holds the member, the path, the name and the size, and nothing of the file", async () => {
    const result = await offer("out/final.mp4");
    expect(readOfferedFile(result)).toEqual({
      botId: videoId,
      path: "out/final.mp4",
      name: "final.mp4",
      bytes: VIDEO_BYTES.byteLength,
    });
    expect(result).not.toContain(HTML);
  });

  test("the card's own URL downloads that file, byte for byte, through the existing route", async () => {
    const file = readOfferedFile(await offer("out/final.mp4"));
    if (!file) throw new Error("There was no card.");

    const response = await press(offeredFileUrl(file));

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(VIDEO_BYTES);
    expect(response.headers.get("content-length")).toBe(
      String(VIDEO_BYTES.byteLength),
    );
  });

  test("it asks the person for nothing: the gate sees a read and no approval is opened", async () => {
    gateCalls.length = 0;
    await offer("out/final.mp4");

    const downloads = gateCalls.filter(
      (call) => call.toolRef === "computer_download_file",
    );
    expect(downloads).toEqual([
      { toolRef: "computer_download_file", effect: "read" },
    ]);
    expect(await store.list(owner)).toEqual([]);
  });

  test("the look is on the trail as an allowed download by this person, with the path and never the bytes", async () => {
    const before = downloadRows().length;
    await offer("out/page.html");

    const rows = downloadRows().slice(before);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      eventType: "computer.action_allowed",
      targetType: "computer",
      actorUserId: owner,
      initiator,
      payload: {
        action: "computer_download_file",
        bot: videoId,
        actor: owner,
        file: "out/page.html",
      },
    });
    expect(JSON.stringify(rows[0])).not.toContain("fetch(");
  });

  test("a link that stays inside the workspace is another name for a file that is there", async () => {
    const file = readOfferedFile(await offer("link-in.mp4"));
    expect(file).toMatchObject({
      name: "link-in.mp4",
      bytes: VIDEO_BYTES.byteLength,
    });
  });

  test("a file exactly at the limit is offered and one byte over is not", async () => {
    expect(readOfferedFile(await offer("exact.bin"))?.bytes).toBe(
      TEST_LIMIT_BYTES,
    );

    const over = await offer("big.bin");
    expect(over.startsWith("Refused.")).toBe(true);
    expect(over).toContain(`the download limit is ${TEST_LIMIT_BYTES}`);
    expect(readOfferedFile(over)).toBeNull();
  });

  test("the limit on a real computer is 100 MiB, the same for the offer and for the button", () => {
    expect(DEFAULT_WORKSPACE_LIMITS.downloadBytes).toBe(100 * 1024 * 1024);
  });

  test("a file that is not there, and a folder, are refused with what to do", async () => {
    const missing = await offer("out/nothing.mp4");
    expect(missing).toContain(
      "There is no file at out/nothing.mp4 in your workspace",
    );

    const folder = await offer("out");
    expect(folder.startsWith("Refused.")).toBe(true);
    expect(folder).toContain("out is not a file");
    expect(readOfferedFile(folder)).toBeNull();
  });
});

describe("a path that leaves the member's workspace is refused", () => {
  const escapes: [string, string][] = [
    ["a parent folder", "../sibling-secret.txt"],
    ["two parent folders", "../../outside-secret.txt"],
    ["a parent folder in the middle", "out/../../sibling-secret.txt"],
    ["a parent folder with backslashes", "..\\sibling-secret.txt"],
    ["a mix of separators", "out/..\\..\\sibling-secret.txt"],
    ["an absolute path", "/etc/passwd"],
    [
      "an absolute path to a file that is in the workspace",
      "/workspace/out/final.mp4",
    ],
    [
      "an absolute path to the member's own folder on the host",
      "/tmp/anything",
    ],
    ["a link to a file outside", "link-out.txt"],
    ["a file under a link to a folder outside", "link-dir/outside-secret.txt"],
  ];

  test.each(escapes)(
    "%s: %s never becomes a card, and the attempt is on the trail",
    async (_what, path) => {
      const before = downloadRows().length;
      const result = await offer(path);

      expect(result.startsWith("Refused.")).toBe(true);
      expect(readOfferedFile(result)).toBeNull();
      // Nothing of what sits at the other end of the path came back.
      for (const secret of [OUTSIDE, SIBLING, WREN])
        expect(result).not.toContain(secret);
      const rows = downloadRows().slice(before);
      expect(rows.map((row) => row.eventType)).toEqual([
        "computer.action_allowed",
        "computer.action_failed",
      ]);
      expect(rows.map((row) => row.payload.file)).toEqual([path, path]);
    },
  );

  test("the words the computer gives are passed on, so a member can correct itself", async () => {
    expect(await offer("../sibling-secret.txt")).toContain(
      "may not contain '..'",
    );
    expect(await offer("/etc/passwd")).toContain("relative to your workspace");
    expect(await offer("link-out.txt")).toContain("outside your workspace");
  });

  test("a path with a NUL, or a control character, never reaches the computer", async () => {
    const asked = computers.get(videoId)?.asked.length ?? 0;
    for (const path of [
      "out/final.mp4\u0000.png",
      "out/a\nb.mp4",
      "out/\u007f.mp4",
    ]) {
      const result = await offer(path);
      expect(result.startsWith("Refused.")).toBe(true);
    }
    expect(computers.get(videoId)?.asked.length).toBe(asked);
  });

  test("an encoded path is only a name: it cannot climb, and it is not found", async () => {
    for (const path of [
      "%2e%2e/sibling-secret.txt",
      "..%2fsibling-secret.txt",
      "out/%2e%2e/%2e%2e/outside-secret.txt",
      "%252e%252e%252fsibling-secret.txt",
      "．．/sibling-secret.txt",
    ]) {
      const result = await offer(path);
      expect(result).toContain(`There is no file at ${path} in your workspace`);
      expect(readOfferedFile(result)).toBeNull();
    }
  });
});

describe("another member's workspace is not reachable from this one", () => {
  test.each([
    ["by climbing to it", () => "../../wren/workspace/secret.txt"],
    [
      "by its absolute path",
      () => join(computers.get(wrenId)?.workspace ?? "", "secret.txt"),
    ],
    ["through a link to its file", () => "link-to-wren.txt"],
    ["through a link to its folder", () => "link-to-wren-dir/secret.txt"],
  ])("%s", async (_what, pathOf) => {
    const wrenAsked = computers.get(wrenId)?.asked.length ?? 0;
    const result = await offer(pathOf());

    expect(result.startsWith("Refused.")).toBe(true);
    expect(readOfferedFile(result)).toBeNull();
    expect(result).not.toContain(WREN);
    // Wren's computer was never asked: the question went to Cam's only, which refused it.
    expect(computers.get(wrenId)?.asked.length).toBe(wrenAsked);
  });

  test("the card of a member names that member, whatever path it was given", async () => {
    const wrens = readOfferedFile(await offer("secret.txt", owner, wrenId));
    expect(wrens).toEqual({
      botId: wrenId,
      path: "secret.txt",
      name: "secret.txt",
      bytes: WREN.length,
    });
    // The same name in Cam's workspace is a file that is not there.
    expect(await offer("secret.txt", owner, videoId)).toContain(
      "There is no file at secret.txt",
    );
  });

  test("the tool has no argument that names another member", async () => {
    const tool = await toolFor(owner);
    if (!tool) throw new Error("The tool was not offered.");
    expect(
      tool.parameters.safeParse({ path: "secret.txt", botId: wrenId }).success,
    ).toBe(false);
    expect(
      tool.parameters.safeParse({ path: "secret.txt", bot: wrenId }).success,
    ).toBe(false);
    expect(tool.parameters.safeParse({ path: "secret.txt" }).success).toBe(
      true,
    );
  });
});

describe("who is offered the tool", () => {
  test("a person who may use the member's computer is offered offer_file", async () => {
    expect((await toolFor(stranger))?.name).toBe(OFFER_FILE_TOOL);
    expect((await toolFor(owner, privateId))?.name).toBe(OFFER_FILE_TOOL);
  });

  test("somebody else's own Bot is not offered it to a person who cannot use it, and is to an administrator", async () => {
    expect(await toolFor(stranger, privateId)).toBeUndefined();
    expect((await toolFor(admin, privateId))?.name).toBe(OFFER_FILE_TOOL);
  });

  test("a Bot that does not exist is not offered it", async () => {
    expect(await toolFor(owner, `${prefix}-nobody`)).toBeUndefined();
  });

  test("a person who switched the computer off is not offered it", async () => {
    switches = { cloudComputer: false };
    try {
      expect(await toolFor(owner)).toBeUndefined();
    } finally {
      switches = undefined;
    }
    expect((await toolFor(owner))?.name).toBe(OFFER_FILE_TOOL);
  });

  test("a card made before a rule forbids the file is not a way round it", async () => {
    // The gateway decides again at the button; the tool's absence is only the first line of defence.
    const file = readOfferedFile(await offer("out/final.mp4"));
    if (!file) throw new Error("There was no card.");
    const saved = policy;
    policy = { mode: "enforce", deny: ["true"], allow: [] };
    try {
      expect((await press(offeredFileUrl(file))).status).toBe(403);
    } finally {
      policy = saved;
    }
    expect((await press(offeredFileUrl(file))).status).toBe(200);
  });
});

describe("the computer policy decides what may leave, for the offer and for the button", () => {
  test("a rule against a kind of file refuses the offer and the download alike", async () => {
    const saved = policy;
    policy = {
      mode: "enforce",
      deny: ["intent == 'download_file' && file.extension == 'pem'"],
      allow: ["true"],
    };
    try {
      const offered = await offer("key.pem");
      expect(offered.startsWith("Refused.")).toBe(true);
      expect(readOfferedFile(offered)).toBeNull();

      const response = await press(
        offeredFileUrl({ botId: videoId, path: "key.pem" }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        rule: expect.stringContaining("pem"),
      });

      // Another kind of file is untouched by it.
      expect(readOfferedFile(await offer("out/final.mp4"))?.name).toBe(
        "final.mp4",
      );
    } finally {
      policy = saved;
    }
  });
});

describe("pressing Download", () => {
  test("the file arrives as an attachment, opaque, never sniffed and never stored", async () => {
    const response = await press(
      offeredFileUrl({ botId: videoId, path: "out/final.mp4" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename=\"final.mp4\"; filename*=UTF-8''final.mp4",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test.each([
    ["an HTML page", "out/page.html", HTML],
    ["an SVG drawing", "out/drawing.svg", SVG],
  ])(
    "%s a member made is handed over as bytes to save and is never rendered in the app's origin",
    async (_what, path, text) => {
      const response = await press(offeredFileUrl({ botId: videoId, path }));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/octet-stream",
      );
      expect(response.headers.get("content-type")).not.toMatch(
        /html|svg|xml|javascript/,
      );
      expect(response.headers.get("content-disposition")).toStartWith(
        "attachment;",
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await response.text()).toBe(text);
    },
  );

  test("a file name cannot add a header or break out of the filename", async () => {
    const response = await press(
      offeredFileUrl({ botId: videoId, path: HOSTILE_NAME }),
    );

    expect(response.status).toBe(200);
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toStartWith("attachment;");
    expect(response.headers.get("x-injected")).toBeNull();
  });

  test("a name with a control character is not offered at all, and one with a bidirectional control is offered cleaned", async () => {
    const refused = await offer(HOSTILE_NAME);
    expect(refused.startsWith("Refused.")).toBe(true);
    expect(readOfferedFile(refused)).toBeNull();

    const cleaned = await offer(OVERRIDE_NAME);
    expect(JSON.parse(cleaned).name).toBe("clipfdp.exe");
    expect(readOfferedFile(cleaned)?.path).toBe(OVERRIDE_NAME);
  });

  test.each([
    ["a parent folder", "../sibling-secret.txt", 403],
    ["two parent folders", "../../outside-secret.txt", 403],
    ["an absolute path", "/etc/passwd", 403],
    ["a link to a file outside", "link-out.txt", 403],
    ["another member's file through a link", "link-to-wren.txt", 403],
    ["a missing file", "out/nothing.mp4", 404],
    ["a folder", "out", 400],
    ["a file over the limit", "big.bin", 413],
    [
      "a name that is encoded twice, which is only a name",
      "%252e%252e%252fsibling-secret.txt",
      404,
    ],
  ])("%s is refused by the route with %i", async (_what, path, status) => {
    const response = await press(offeredFileUrl({ botId: videoId, path }));
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test.each([
    ["a parent folder with an encoded slash", "..%2fsibling-secret.txt"],
    ["parent folders with encoded slashes", "..%2f..%2foutside-secret.txt"],
    ["an encoded parent folder", "%2e%2e/sibling-secret.txt"],
    ["an encoded absolute path", "%2fetc%2fpasswd"],
  ])(
    "%s, written into the URL by hand, is decoded once and refused",
    async (_what, raw) => {
      const response = await press(
        `/api/computers/${videoId}/files/download?path=${raw}`,
      );
      expect(response.status).toBe(403);
    },
  );

  test("a NUL in the URL is not a way to a file", async () => {
    const response = await press(
      `/api/computers/${videoId}/files/download?path=out%2Ffinal.mp4%00.png`,
    );
    expect(response.status).toBe(404);
  });

  test("the file of one member cannot be fetched as another's", async () => {
    const wrens = await press(
      offeredFileUrl({ botId: wrenId, path: "secret.txt" }),
    );
    expect(await wrens.text()).toBe(WREN);

    const asCam = await press(
      offeredFileUrl({ botId: videoId, path: "secret.txt" }),
    );
    expect(asCam.status).toBe(404);
  });
});

describe("who may press it", () => {
  const own = () => offeredFileUrl({ botId: privateId, path: "plan.txt" });

  test("the owner of a Bot, and an administrator, may", async () => {
    expect(await (await press(own(), owner)).text()).toBe(
      "somebody's private plan",
    );
    expect((await press(own(), admin)).status).toBe(200);
  });

  test("another signed-in person is told there is no such Bot, and the computer is not asked", async () => {
    const asked = computers.get(privateId)?.asked.length ?? 0;
    const response = await press(own(), stranger);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "There is no such Bot." });
    expect(computers.get(privateId)?.asked.length).toBe(asked);
  });

  test("nobody signed in gets nothing, and the computer is not asked", async () => {
    const asked = computers.get(videoId)?.asked.length ?? 0;
    const response = await press(
      offeredFileUrl({ botId: videoId, path: "out/final.mp4" }),
      null,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Authentication required.",
    });
    expect(computers.get(videoId)?.asked.length).toBe(asked);
  });

  test("a session that holds no role gets nothing either", async () => {
    const asked = computers.get(videoId)?.asked.length ?? 0;
    const response = await press(
      offeredFileUrl({ botId: videoId, path: "out/final.mp4" }),
      withoutRole,
    );

    expect(response.status).toBe(403);
    expect(computers.get(videoId)?.asked.length).toBe(asked);
  });

  test("a Bot's own computer calling the route with its token and no session gets nothing", async () => {
    const asked = computers.get(videoId)?.asked.length ?? 0;
    const response = await app.request(
      `http://app.test${offeredFileUrl({ botId: videoId, path: "out/final.mp4" })}`,
      {
        headers: {
          "x-openbot-bot-id": videoId,
          "x-openbot-computer-token": "the-token-the-computer-holds",
        },
      },
    );

    expect(response.status).toBe(401);
    expect(computers.get(videoId)?.asked.length).toBe(asked);
  });

  test("a member's computer is shared by everyone who can sign in, as the computer routes say", async () => {
    // Not something the offer adds: a public member's computer has always answered every signed-in
    // person (agents/computer-access.ts). Stated here so a change to it is made on purpose.
    const response = await press(
      offeredFileUrl({ botId: videoId, path: "out/final.mp4" }),
      stranger,
    );
    expect(response.status).toBe(200);
  });
});
