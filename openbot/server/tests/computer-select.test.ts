import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import {
  COMPUTER_ACTING_TOOLS,
  COMPUTER_TOOLS,
  isActingTool,
} from "../src/computer/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideAction, safetyRequirement } from "../src/approvals/policy";
import type { AuditEventInput, AuditStore } from "../src/audit";
import type { AppVariables } from "../src/auth/guards";
import {
  ActionRefusedError,
  type ComputerGateway,
  createComputerGateway,
  intentOf,
} from "../src/computer/gateway";
import {
  createHeadlessComputerTools,
  SELECT_TOOL_DESCRIPTION,
} from "../src/computer/headless-tools";
import type { ActionPolicy } from "../src/computer/policy";
import type { PolicyStore } from "../src/computer/policy-store";
import type { ComputerProvider } from "../src/computer/provider";
import { createComputerRoutes } from "../src/computer/routes";
import type { SnapshotResult } from "../src/computer/schema";
import type { ApprovalCandidate, ApprovalGate } from "../src/approvals/types";

/**
 * `computer_select` (D123, item 2): a native menu or a date field is an acting tool that goes through
 * the same door as `computer_type`: the policy, the audit trail and the approval gate see it first, and
 * a refusal means nothing reaches the page. Tested on the real gateway, the real gate's pure parts and
 * the real route, with a fake computer.
 */

const SNAPSHOT: SnapshotResult = {
  snapshotId: 4,
  url: "https://shop.example/order",
  title: "Order",
  truncated: false,
  elements: [
    {
      ref: "e1",
      role: "combobox",
      name: "Country",
      options: [
        { label: "Italy", value: "it", selected: true },
        { label: "France", value: "fr", disabled: true },
      ],
    },
    { ref: "e2", role: "textbox", name: "Delivery day", type: "date" },
    { ref: "e3", role: "combobox", name: "Pay now" },
  ],
};

function fakeComputer() {
  const bodies: Array<{ path: string; body: unknown }> = [];
  const provider: ComputerProvider = {
    name: "test",
    isolation: "per-bot",
    locate: async () => "http://agent-computer:4100",
    status: async (botId) => ({ botId, state: "ready" }),
    stop: async () => ({ wasRunning: true }),
    reset: async () => ({ cleared: true }),
    list: async () => [],
  };
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === "/snapshot") return Response.json(SNAPSHOT);
    if (path === "/select") {
      bodies.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json({
        action: "select",
        kind: "select",
        selected: [{ label: "Italy", value: "it" }],
        url: SNAPSHOT.url,
        elapsedMs: 1,
      });
    }
    if (path === "/type") {
      bodies.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json({ action: "type", url: SNAPSHOT.url, elapsedMs: 1 });
    }
    return Response.json(
      { error: `Unknown endpoint: ${path}` },
      { status: 404 },
    );
  }) as unknown as typeof fetch;
  return { provider, fetchImpl, bodies };
}

const ACTOR = { id: "owner-1" };
const PERMISSIVE: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };

async function gatewayWith(policy: ActionPolicy, approvalGate?: ApprovalGate) {
  const { provider, fetchImpl, bodies } = fakeComputer();
  const rows: AuditEventInput[] = [];
  const auditStore: AuditStore = {
    insert: async (event) => void rows.push(event),
  };
  const gateway = createComputerGateway({
    provider,
    fetchImpl,
    auditStore,
    policy: () => policy,
    ...(approvalGate ? { approvalGate } : {}),
  });
  await gateway.snapshot("bot-1");
  return { gateway, bodies, rows };
}

describe("the contract", () => {
  test("it is an acting tool, so the gateway must decide on it", () => {
    expect(COMPUTER_TOOLS).toContain("computer_select");
    expect(COMPUTER_ACTING_TOOLS).toContain("computer_select");
    expect(isActingTool("computer_select")).toBe(true);
  });

  test("its intent is the one typing has, and it has no key of its own", () => {
    expect(intentOf("computer_select", undefined)).toBe("type");
    expect(intentOf("computer_type", undefined)).toBe("type");
    // A select never carries a key, so it can never become an activation.
    expect(intentOf("computer_select", "Enter")).toBe("activate");
  });
});

describe("the gateway", () => {
  test("an allowed choice reaches the computer once, with its value, and carries the element's label", async () => {
    const { gateway, bodies, rows } = await gatewayWith(PERMISSIVE);
    const result = await gateway.select("bot-1", ACTOR, {
      ref: "e1",
      snapshotId: 4,
      value: "Italy",
    });
    expect(bodies).toEqual([
      { path: "/select", body: { ref: "e1", snapshotId: 4, value: "Italy" } },
    ]);
    expect(result).toMatchObject({
      action: "select",
      selected: [{ label: "Italy", value: "it" }],
      element: { role: "combobox", name: "Country" },
    });
    expect(rows.map((row) => row.eventType)).toEqual([
      "computer.action_allowed",
    ]);
  });

  test("a list for a multiple menu is passed through whole", async () => {
    const { gateway, bodies } = await gatewayWith(PERMISSIVE);
    await gateway.select("bot-1", ACTOR, {
      ref: "e1",
      snapshotId: 4,
      value: ["Italy", "Spain"],
    });
    expect(bodies[0]?.body).toMatchObject({ value: ["Italy", "Spain"] });
  });

  test("a policy refusal still works: nothing reaches the page and the trail has the attempt", async () => {
    for (const deny of [
      'intent == "type"',
      'tool.name == "computer_select"',
      'contains(element.name, "country")',
      'element.type == "date"',
    ]) {
      const { gateway, bodies, rows } = await gatewayWith({
        ...PERMISSIVE,
        deny: [deny],
      });
      const ref = deny.includes("date") ? "e2" : "e1";
      const error = await gateway
        .select("bot-1", ACTOR, { ref, snapshotId: 4, value: "x" })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );
      expect(error).toBeInstanceOf(ActionRefusedError);
      expect(bodies).toEqual([]);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.eventType).toBe("computer.action_refused");
    }
  });

  test("a rule written for typing by intent covers a choice too, and one written by tool name covers only typing", async () => {
    const byIntent = await gatewayWith({
      ...PERMISSIVE,
      deny: ['intent == "type"'],
    });
    expect(
      await byIntent.gateway
        .type("bot-1", ACTOR, { ref: "e1", snapshotId: 4, text: "x" })
        .then(
          () => "ran",
          () => "refused",
        ),
    ).toBe("refused");
    expect(
      await byIntent.gateway
        .select("bot-1", ACTOR, { ref: "e1", snapshotId: 4, value: "x" })
        .then(
          () => "ran",
          () => "refused",
        ),
    ).toBe("refused");
    // Documented limit (docs/design/browser-select-date.md): a rule that names only `computer_type`
    // does not name this tool. Operators write rules by intent for exactly this reason.
    const byName = await gatewayWith({
      ...PERMISSIVE,
      deny: ['tool.name == "computer_type"'],
    });
    expect(
      await byName.gateway
        .select("bot-1", ACTOR, { ref: "e1", snapshotId: 4, value: "Italy" })
        .then(
          () => "ran",
          () => "refused",
        ),
    ).toBe("ran");
  });

  test("a stale ref is refused before anything is sent", async () => {
    const { gateway, bodies } = await gatewayWith(PERMISSIVE);
    const error = await gateway
      .select("bot-1", ACTOR, { ref: "e99", snapshotId: 4, value: "Italy" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(Error);
    expect(bodies).toEqual([]);
  });
});

describe("the approval gate treats it like computer_type", () => {
  function recordingGate() {
    const seen: ApprovalCandidate[] = [];
    const gate: ApprovalGate = async (candidate) => {
      seen.push(candidate);
      return undefined;
    };
    return { seen, gate };
  }

  test("the same effect, scope and target as a typed entry, under its own name", async () => {
    const { seen, gate } = recordingGate();
    const { gateway } = await gatewayWith(PERMISSIVE, gate);
    await gateway.type("bot-1", ACTOR, {
      ref: "e1",
      snapshotId: 4,
      text: "Italy",
    });
    await gateway.select("bot-1", ACTOR, {
      ref: "e1",
      snapshotId: 4,
      value: "Italy",
    });
    const [typed, chosen] = seen;
    expect(chosen?.toolRef).toBe("computer_select");
    expect(chosen?.effect).toBe("write");
    expect(chosen?.effect).toBe(typed?.effect);
    expect(chosen?.scope).toBe(typed?.scope);
    expect(chosen?.target).toEqual(typed?.target);
    expect(
      (chosen?.target as { element?: unknown } | undefined)?.element,
    ).toMatchObject({
      role: "combobox",
      name: "Country",
    });
  });

  test("a gate that refuses stops it before the page", async () => {
    const gate: ApprovalGate = async () => {
      throw new Error("The person has to approve this.");
    };
    const { gateway, bodies } = await gatewayWith(PERMISSIVE, gate);
    const error = await gateway
      .select("bot-1", ACTOR, { ref: "e1", snapshotId: 4, value: "Italy" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect((error as Error).message).toBe("The person has to approve this.");
    expect(bodies).toEqual([]);
  });

  test("the safety floor reads the menu's label and the chosen value as it reads a typed entry", () => {
    const base = {
      actorId: "owner-1",
      botId: "bot-1",
      effect: "write" as const,
      scope: "shop.example",
    };
    const asked = (
      toolRef: string,
      name: string,
      args: Record<string, unknown>,
    ) =>
      safetyRequirement({
        ...base,
        toolRef,
        args,
        target: {
          pageUrl: "https://shop.example/page",
          element: { role: "combobox", name },
        },
      })?.id;
    for (const name of ["Pay now", "Numero carta", "Codice OTP"]) {
      expect(
        asked("computer_select", name, { ref: "e3", value: "x" }),
      ).toBeDefined();
      expect(asked("computer_select", name, { ref: "e3", value: "x" })).toBe(
        asked("computer_type", name, { ref: "e3", text: "x" }),
      );
    }
    // And the chosen text itself is read, like typed text.
    expect(
      asked("computer_select", "Plan", { ref: "e3", value: "Confirm payment" }),
    ).toBe(
      asked("computer_type", "Plan", { ref: "e3", text: "Confirm payment" }),
    );
  });

  test("with no rule and no safety word it still asks: a write, never an automatic allow", async () => {
    const candidate: ApprovalCandidate = {
      actorId: "owner-1",
      botId: "bot-1",
      toolRef: "computer_select",
      effect: "write",
      scope: "shop.example",
      args: { ref: "e1", value: "Italy" },
    };
    const rules = {
      team: [],
      personal: [],
      customRulesEnabled: true,
      autoReview: false,
      askBeforeChanges: true,
    };
    const typed = await decideAction({
      ...rules,
      candidate: { ...candidate, toolRef: "computer_type" },
    });
    const chosen = await decideAction({ ...rules, candidate });
    expect(chosen.behaviour).toBe(typed.behaviour);
    expect(chosen.behaviour).toBe("ask");
  });
});

describe("the headless tool", () => {
  function tools(gateway: ComputerGateway) {
    return createHeadlessComputerTools({
      gateway,
      botId: "bot-1",
      actor: ACTOR,
    });
  }
  const select = (list: ReturnType<typeof tools>) =>
    list.find((tool) => tool.definition.name === "computer_select");

  test("is offered, says what it is for and what it is not for, and requires a value", () => {
    const tool = select(tools({} as ComputerGateway));
    expect(tool?.definition.description).toBe(SELECT_TOOL_DESCRIPTION);
    expect(SELECT_TOOL_DESCRIPTION).toMatch(/custom drop-down/);
    expect(SELECT_TOOL_DESCRIPTION).toMatch(/computer_click/);
    const parameters = tool?.definition.parameters as { required?: string[] };
    expect(parameters.required).toEqual(["ref", "snapshotId", "value"]);
  });

  test("the app registers the same text, as a literal the eval runner can read", () => {
    const app = readFileSync(
      join(import.meta.dir, "../../app/src/lib/copilot/computer-tools.tsx"),
      "utf8",
    );
    expect(app).toContain(`"${SELECT_TOOL_DESCRIPTION}"`);
    expect(app).toContain('name: "computer_select"');
  });

  test("passes the model's arguments to the gateway and refuses extra keys", async () => {
    const calls: unknown[] = [];
    const gateway = {
      select: async (_b: string, _a: unknown, input: unknown) => {
        calls.push(input);
        return { action: "select", url: "https://shop.example/" };
      },
    } as unknown as ComputerGateway;
    const tool = select(tools(gateway));
    const signal = new AbortController().signal;
    await tool?.execute(
      { ref: "e1", snapshotId: 4, value: ["a", "b"] },
      { toolCallId: "t1", signal },
    );
    expect(calls).toEqual([{ ref: "e1", snapshotId: 4, value: ["a", "b"] }]);
    // A submit flag does not exist here: choosing never presses Enter.
    await expect(
      Promise.resolve().then(() =>
        tool?.execute(
          { ref: "e1", snapshotId: 4, value: "a", submit: true },
          { toolCallId: "t2", signal },
        ),
      ),
    ).rejects.toThrow();
    await expect(
      Promise.resolve().then(() =>
        tool?.execute(
          { ref: "e1", snapshotId: 4 },
          { toolCallId: "t3", signal },
        ),
      ),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});

describe("POST /:botId/select", () => {
  function app(calls: unknown[]) {
    const gateway = {
      select: async (_b: string, _a: unknown, input: unknown) => {
        calls.push(input);
        return { action: "select", url: "https://shop.example/" };
      },
    } as unknown as ComputerGateway;
    const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
      context,
      next,
    ) => {
      context.set("actor", {
        id: "user-1",
        email: "u@openbot.test",
        role: "admin",
      });
      await next();
    };
    return createComputerRoutes(
      gateway,
      {} as PolicyStore,
      requireUser,
      async () => true,
    );
  }
  const post = (routes: ReturnType<typeof app>, body: string) =>
    routes.request("http://openbot.test/bot-1/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  test("a string or a list reaches the gateway", async () => {
    const calls: unknown[] = [];
    const routes = app(calls);
    expect(
      (await post(routes, '{"ref":"e1","snapshotId":4,"value":"Italy"}'))
        .status,
    ).toBe(200);
    expect(
      (await post(routes, '{"ref":"e1","snapshotId":4,"value":["a","b"]}'))
        .status,
    ).toBe(200);
    expect(calls).toEqual([
      { ref: "e1", snapshotId: 4, value: "Italy" },
      { ref: "e1", snapshotId: 4, value: ["a", "b"] },
    ]);
  });

  test("a missing or malformed value, ref or snapshot is a 400 and reaches nothing", async () => {
    const calls: unknown[] = [];
    const routes = app(calls);
    for (const body of [
      '{"ref":"e1","snapshotId":4}',
      '{"ref":"e1","snapshotId":4,"value":5}',
      '{"ref":"e1","snapshotId":4,"value":["a",1]}',
      '{"snapshotId":4,"value":"x"}',
      '{"ref":"e1","snapshotId":1.5,"value":"x"}',
    ]) {
      expect((await post(routes, body)).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});
