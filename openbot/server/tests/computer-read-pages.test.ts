import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import type { MiddlewareHandler } from "hono";
import { decideAction } from "../src/approvals/policy";
import type {
  ApprovalCandidate,
  ApprovalGate,
  ApprovalTeamRule,
} from "../src/approvals/types";
import type { AuditEventInput, AuditStore } from "../src/audit";
import type { AppVariables } from "../src/auth/guards";
import {
  ComputerUnavailableError,
  createComputerGateway,
  HumanHasControlError,
  type ComputerGateway,
  intentOf,
} from "../src/computer/gateway";
import {
  createHeadlessComputerTools,
  READ_PAGES_TOOL_DESCRIPTION,
} from "../src/computer/headless-tools";
import {
  type CapabilitySwitches,
  withOfferedComputerTools,
} from "../src/computer/offered";
import type { ActionPolicy } from "../src/computer/policy";
import type { PolicyStore } from "../src/computer/policy-store";
import type { ComputerProvider } from "../src/computer/provider";
import { createComputerRoutes } from "../src/computer/routes";
import {
  COMPUTER_ACTING_TOOLS,
  COMPUTER_TOOLS,
  READ_PAGES_MAX_URLS,
  READ_PAGES_PER_PAGE_CHARS,
  READ_PAGES_TOTAL_CHARS,
  readPagesLimit,
} from "../src/computer/schema";

/**
 * `computer_read_pages` (D127): several pages in one call, read only. Each address is decided on as a
 * navigation to it is, so these run the real gateway (policy, audit rows, approval gate, the transport's
 * target floor) against a fake computer, and the real route and the real headless tool.
 */

const ACTOR = { id: "owner-1" };
const PERMISSIVE: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
const GOOD = "https://good.example";

type Sent = { path: string; body: { url: string; limit?: number } };

/** A computer whose `/read-page` answers from `pages`, keyed by the address's path. */
function fakeComputer(
  pages: Record<
    string,
    () => Response | Promise<Response> | { text: string; notRead?: string }
  > = {},
) {
  const sent: Sent[] = [];
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
    if (path === "/navigate") {
      const body = JSON.parse(String(init?.body));
      sent.push({ path, body });
      return Response.json({
        url: body.url,
        title: "Opened",
        text: "opened text",
        truncated: false,
        elapsedMs: 1,
      });
    }
    if (path !== "/read-page")
      return Response.json({ error: `Unknown: ${path}` }, { status: 404 });
    const body = JSON.parse(String(init?.body));
    sent.push({ path, body });
    const key = new URL(body.url).pathname;
    const made = pages[key]?.();
    if (made instanceof Response || made instanceof Promise) return made;
    return Response.json({
      url: body.url,
      title: `Title ${key}`,
      text: made?.text ?? `Text of ${key}`,
      truncated: false,
      ...(made?.notRead ? { notRead: made.notRead } : {}),
      elapsedMs: 1,
    });
  }) as unknown as typeof fetch;
  return { provider, fetchImpl, sent };
}

function gatewayWith(
  options: {
    policy?: ActionPolicy;
    approvalGate?: ApprovalGate;
    pages?: Parameters<typeof fakeComputer>[0];
  } = {},
) {
  const { provider, fetchImpl, sent } = fakeComputer(options.pages);
  const rows: AuditEventInput[] = [];
  const auditStore: AuditStore = {
    insert: async (event) => void rows.push(event),
  };
  const gateway = createComputerGateway({
    provider,
    fetchImpl,
    auditStore,
    policy: () => options.policy ?? PERMISSIVE,
    ...(options.approvalGate ? { approvalGate: options.approvalGate } : {}),
  });
  return { gateway, sent, rows };
}

describe("the contract and the limits", () => {
  test("it is a governed tool, and its intent is the one a navigation has", () => {
    expect(COMPUTER_TOOLS).toContain("computer_read_pages");
    expect(COMPUTER_ACTING_TOOLS).toContain("computer_read_pages");
    // Each address is decided on under the navigation's own name and intent.
    expect(intentOf("computer_navigate", undefined)).toBe("navigate");
  });

  test("five pages at most, 6,000 characters each, 24,000 in all, shared equally", () => {
    expect(READ_PAGES_MAX_URLS).toBe(5);
    expect(READ_PAGES_PER_PAGE_CHARS).toBe(6000);
    expect(READ_PAGES_TOTAL_CHARS).toBe(24_000);
    expect(readPagesLimit(1)).toBe(6000);
    expect(readPagesLimit(4)).toBe(6000);
    expect(readPagesLimit(5)).toBe(4800);
    // Never more than the total, whatever the count.
    for (let count = 1; count <= READ_PAGES_MAX_URLS; count++)
      expect(readPagesLimit(count) * count).toBeLessThanOrEqual(24_000);
  });
});

describe("the gateway", () => {
  test("reads each page in order, one at a time, and returns url, final url, title, text and truncated", async () => {
    const { gateway, sent } = gatewayWith({
      pages: {
        "/b": () => ({ text: "Bee page" }),
      },
    });
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/a`, `${GOOD}/b`, `${GOOD}/c`],
    });
    expect(sent.map((call) => call.body.url)).toEqual([
      `${GOOD}/a`,
      `${GOOD}/b`,
      `${GOOD}/c`,
    ]);
    expect(sent.every((call) => call.path === "/read-page")).toBe(true);
    expect(sent.every((call) => call.body.limit === 6000)).toBe(true);
    expect(result.pages).toEqual([
      {
        url: `${GOOD}/a`,
        finalUrl: `${GOOD}/a`,
        title: "Title /a",
        text: "Text of /a",
        truncated: false,
      },
      {
        url: `${GOOD}/b`,
        finalUrl: `${GOOD}/b`,
        title: "Title /b",
        text: "Bee page",
        truncated: false,
      },
      {
        url: `${GOOD}/c`,
        finalUrl: `${GOOD}/c`,
        title: "Title /c",
        text: "Text of /c",
        truncated: false,
      },
    ]);
    expect(result.truncated).toBe(false);
    // The pages' words are outside content and say so.
    expect(result.untrusted).toContain("pages");
  });

  test("the computer is asked for each page's equal share of the total", async () => {
    const { gateway, sent } = gatewayWith();
    await gateway.readPages("bot-1", ACTOR, {
      urls: [1, 2, 3, 4, 5].map((n) => `${GOOD}/${n}`),
    });
    expect(sent.map((call) => call.body.limit)).toEqual([
      4800, 4800, 4800, 4800, 4800,
    ]);
  });

  test("one bad page does not fail the others: it carries its own error", async () => {
    const { gateway } = gatewayWith({
      pages: {
        "/broken": () =>
          Response.json(
            { error: "The page did not settle.", pageNotReady: true },
            { status: 502 },
          ),
        "/check": () => ({
          text: "",
          notRead: "This page asks for a human check, so it was not read.",
        }),
      },
    });
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/a`, `${GOOD}/broken`, `${GOOD}/check`, `${GOOD}/d`],
    });
    expect(
      result.pages.map((page) => [page.url, page.text, page.error]),
    ).toEqual([
      [`${GOOD}/a`, "Text of /a", undefined],
      [`${GOOD}/broken`, undefined, "The page did not settle."],
      [
        `${GOOD}/check`,
        undefined,
        "This page asks for a human check, so it was not read.",
      ],
      [`${GOOD}/d`, "Text of /d", undefined],
    ]);
  });

  test("a private-network address is refused as a navigation is, and never reaches the computer", async () => {
    const { gateway, sent } = gatewayWith();
    const refused = [
      "http://192.168.1.1/admin",
      "http://localhost:5432/",
      "http://169.254.169.254/latest/meta-data/",
    ];
    const asNavigation = await Promise.all(
      refused.map((url) =>
        gateway.navigate("bot-1", ACTOR, url).then(
          () => "opened",
          (error: Error) => error.message,
        ),
      ),
    );
    sent.length = 0;
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/a`, ...refused, `${GOOD}/z`],
    });
    expect(sent.map((call) => call.body.url)).toEqual([
      `${GOOD}/a`,
      `${GOOD}/z`,
    ]);
    expect(result.pages.map((page) => page.error)).toEqual([
      undefined,
      ...asNavigation,
      undefined,
    ]);
    for (const message of asNavigation) expect(message).not.toBe("opened");
    expect(result.pages[0]?.text).toBe("Text of /a");
    expect(result.pages[4]?.text).toBe("Text of /z");
  });

  test("a page that is not a web address (file:, javascript:, a word) is a page error", async () => {
    const { gateway, sent } = gatewayWith();
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: ["file:///etc/passwd", "javascript:alert(1)", "not a url"],
    });
    expect(sent).toEqual([]);
    expect(result.pages.every((page) => typeof page.error === "string")).toBe(
      true,
    );
  });

  test("a computer that sends too much is cut to the page's share, and says so", async () => {
    const { gateway } = gatewayWith({
      pages: {
        "/long": () => ({ text: "x".repeat(50_000) }),
        "/emoji": () => ({ text: `${"a".repeat(5999)}😀😀` }),
        "/short": () => ({ text: "short" }),
      },
    });
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/long`, `${GOOD}/emoji`, `${GOOD}/short`],
    });
    expect(result.pages[0]?.text).toHaveLength(6000);
    expect(result.pages[0]?.truncated).toBe(true);
    // Cut between characters, never through a surrogate pair.
    expect(result.pages[1]?.text).toHaveLength(5999);
    expect(result.pages[1]?.truncated).toBe(true);
    expect(result.pages[2]?.text).toBe("short");
    expect(result.pages[2]?.truncated).toBe(false);
    expect(result.truncated).toBe(true);
    // The five-page worst case stays inside the total.
    const five = await gateway.readPages("bot-1", ACTOR, {
      urls: [1, 2, 3, 4, 5].map((n) => `${GOOD}/long?${n}`),
    });
    const sum = five.pages.reduce((n, page) => n + (page.text?.length ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(READ_PAGES_TOTAL_CHARS);
  });

  test("the computer's own cut is passed on", async () => {
    const { provider, fetchImpl } = fakeComputer();
    const gateway = createComputerGateway({
      provider,
      fetchImpl: (async () =>
        Response.json({
          url: `${GOOD}/final`,
          title: "T",
          text: "cut text",
          truncated: true,
        })) as unknown as typeof fetch,
      auditStore: { insert: async () => undefined },
      policy: () => PERMISSIVE,
    });
    void fetchImpl;
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/start`],
    });
    expect(result.pages[0]).toMatchObject({
      url: `${GOOD}/start`,
      finalUrl: `${GOOD}/final`,
      truncated: true,
    });
  });

  test("an empty list, too many pages, and a non-string are refused before anything is read", async () => {
    const { gateway, sent, rows } = gatewayWith();
    for (const urls of [
      [],
      [1, 2, 3, 4, 5, 6].map((n) => `${GOOD}/${n}`),
      [`${GOOD}/a`, ""],
      [`${GOOD}/a`, 5 as unknown as string],
      undefined as unknown as string[],
    ]) {
      await expect(
        gateway.readPages("bot-1", ACTOR, { urls }),
      ).rejects.toThrow();
    }
    expect(sent).toEqual([]);
    expect(rows).toEqual([]);
  });

  test("a computer that cannot be reached is said once for every page, without waiting on each", async () => {
    let calls = 0;
    const { provider } = fakeComputer();
    const gateway = createComputerGateway({
      provider,
      fetchImpl: (async () => {
        calls += 1;
        throw new Error("connect ECONNREFUSED");
      }) as unknown as typeof fetch,
      auditStore: { insert: async () => undefined },
      policy: () => PERMISSIVE,
    });
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/a`, `${GOOD}/b`, `${GOOD}/c`],
    });
    expect(calls).toBe(1);
    expect(result.pages.every((page) => page.error)).toBe(true);
    expect(result.pages[0]?.error).toBe(result.pages[2]?.error ?? "");
  });

  test("a person holding the wheel ends the call, as it ends a navigation", async () => {
    const { gateway } = gatewayWith({
      pages: {
        "/b": () =>
          Response.json(
            { error: "A person has control.", humanHasControl: true },
            { status: 409 },
          ),
      },
    });
    await expect(
      gateway.readPages("bot-1", ACTOR, {
        urls: [`${GOOD}/a`, `${GOOD}/b`, `${GOOD}/c`],
      }),
    ).rejects.toBeInstanceOf(HumanHasControlError);
  });

  test("an aborted call stops and is not turned into page errors", async () => {
    const { gateway, sent } = gatewayWith();
    const controller = new AbortController();
    controller.abort(new Error("Stopped."));
    await expect(
      gateway.readPages(
        "bot-1",
        ACTOR,
        { urls: [`${GOOD}/a`, `${GOOD}/b`] },
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(sent).toEqual([]);
    void ComputerUnavailableError;
  });
});

describe("policy, audit and the approval gate see each page as a navigation", () => {
  test("each address leaves one audit row, named computer_navigate, with its own page", async () => {
    const { gateway, rows } = gatewayWith();
    await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/a`, `${GOOD}/b`],
    });
    expect(rows.map((row) => row.eventType)).toEqual([
      "computer.action_allowed",
      "computer.action_allowed",
    ]);
    expect(
      rows.map((row) => [
        (row.payload as Record<string, unknown>).action,
        (row.payload as Record<string, unknown>).page,
      ]),
    ).toEqual([
      ["computer_navigate", `${GOOD}/a`],
      ["computer_navigate", `${GOOD}/b`],
    ]);
  });

  test("a deny written for navigation refuses the page in a batch too, by tool name, by intent and by host", async () => {
    for (const deny of [
      'tool.name == "computer_navigate"',
      'intent == "navigate"',
      'page.host == "blocked.example"',
    ]) {
      const { gateway, sent, rows } = gatewayWith({
        policy: { ...PERMISSIVE, deny: [deny] },
      });
      const result = await gateway.readPages("bot-1", ACTOR, {
        urls: ["https://blocked.example/x"],
      });
      expect(result.pages[0]?.error).toBeString();
      expect(sent).toEqual([]);
      expect(rows[0]?.eventType).toBe("computer.action_refused");
    }
    // And a rule about one host leaves the others alone.
    const { gateway, sent } = gatewayWith({
      policy: { ...PERMISSIVE, deny: ['page.host == "blocked.example"'] },
    });
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: ["https://blocked.example/x", `${GOOD}/y`],
    });
    expect(result.pages.map((page) => Boolean(page.error))).toEqual([
      true,
      false,
    ]);
    expect(sent.map((call) => call.body.url)).toEqual([`${GOOD}/y`]);
  });

  test("the gate is asked once per address with the navigation's own tool, effect, scope and target", async () => {
    const seen: ApprovalCandidate[] = [];
    const gate: ApprovalGate = async (candidate) => {
      seen.push(candidate);
      return undefined;
    };
    const { gateway } = gatewayWith({ approvalGate: gate });
    await gateway.navigate("bot-1", ACTOR, `${GOOD}/a`);
    await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/a`, `${GOOD}/b`],
    });
    const [navigated, ...batch] = seen;
    expect(batch).toHaveLength(2);
    for (const candidate of batch) {
      expect(candidate.toolRef).toBe("computer_navigate");
      expect(candidate.effect).toBe("read");
      expect(candidate.effect).toBe(navigated?.effect);
    }
    expect(batch[0]?.scope).toBe(navigated?.scope);
    expect(batch[0]?.target).toEqual(navigated?.target);
    expect(batch[1]?.target).toEqual({ pageUrl: `${GOOD}/b` });
  });

  test("the real policy decides a batch page exactly as it decides the navigation: a team rule that asks, asks", async () => {
    const seen: ApprovalCandidate[] = [];
    const { gateway } = gatewayWith({
      approvalGate: async (candidate) => {
        seen.push(candidate);
        return undefined;
      },
    });
    await gateway.navigate("bot-1", ACTOR, "https://shop.example/a");
    await gateway.readPages("bot-1", ACTOR, {
      urls: ["https://shop.example/a"],
    });
    const [navigated, batched] = seen;
    expect(navigated && batched).toBeTruthy();
    const rule = (
      behaviour: ApprovalTeamRule["behaviour"],
      scope: string,
    ): ApprovalTeamRule => ({
      id: `rule-${behaviour}-${scope}`,
      botId: "*",
      toolRef: "computer_navigate",
      effect: "read",
      scope,
      behaviour,
      revokedAt: null,
      createdAt: new Date(0),
      createdBy: null,
    });
    const base = {
      personal: [],
      customRulesEnabled: true,
      autoReview: false,
      askBeforeChanges: true,
    };
    for (const team of [
      [],
      [rule("ask", "shop.example")],
      [rule("hand_off", "shop.example")],
      [rule("ask", "other.example")],
    ]) {
      const one = await decideAction({
        ...base,
        team,
        candidate: navigated as ApprovalCandidate,
      });
      const many = await decideAction({
        ...base,
        team,
        candidate: batched as ApprovalCandidate,
      });
      expect(many.behaviour).toBe(one.behaviour);
      expect(many.source).toBe(one.source);
    }
    // And the two outcomes the rules above stand for are not the same, so the comparison means something.
    expect(
      (
        await decideAction({
          ...base,
          team: [rule("ask", "shop.example")],
          candidate: batched as ApprovalCandidate,
        })
      ).behaviour,
    ).toBe("ask");
    expect(
      (
        await decideAction({
          ...base,
          team: [],
          candidate: batched as ApprovalCandidate,
        })
      ).behaviour,
    ).toBe("allow");
  });

  test("a gate that refuses one page leaves the other pages read", async () => {
    const gate: ApprovalGate = async (candidate) => {
      if ((candidate.target as { pageUrl: string }).pageUrl.includes("/no"))
        throw new Error("The person declined this.");
      return undefined;
    };
    const { gateway, sent } = gatewayWith({ approvalGate: gate });
    const result = await gateway.readPages("bot-1", ACTOR, {
      urls: [`${GOOD}/a`, `${GOOD}/no`, `${GOOD}/c`],
    });
    expect(result.pages.map((page) => page.error)).toEqual([
      undefined,
      "The person declined this.",
      undefined,
    ]);
    expect(sent.map((call) => call.body.url)).toEqual([
      `${GOOD}/a`,
      `${GOOD}/c`,
    ]);
  });

  test("a card for the first page pauses the call before any page is read", async () => {
    const gate: ApprovalGate = async () => {
      throw new HeadlessToolSuspension("waiting for approval", {
        kind: "approval",
      } as never);
    };
    const { gateway, sent } = gatewayWith({ approvalGate: gate });
    await expect(
      gateway.readPages("bot-1", ACTOR, { urls: [`${GOOD}/a`, `${GOOD}/b`] }),
    ).rejects.toBeInstanceOf(HeadlessToolSuspension);
    expect(sent).toEqual([]);
  });

  test("it never asks for a write: no page of a batch is a change", async () => {
    const seen: ApprovalCandidate[] = [];
    const { gateway } = gatewayWith({
      approvalGate: async (candidate) => {
        seen.push(candidate);
        return undefined;
      },
    });
    await gateway.readPages("bot-1", ACTOR, { urls: [`${GOOD}/a`] });
    expect(seen.map((candidate) => candidate.effect)).toEqual(["read"]);
  });
});

describe("which tools a turn is offered", () => {
  const names = (capabilities: CapabilitySwitches | undefined) =>
    withOfferedComputerTools(
      createHeadlessComputerTools({
        gateway: {} as ComputerGateway,
        botId: "bot-1",
        actor: ACTOR,
      }),
      capabilities,
    ).map((tool) => tool.definition.name);

  test("offered with the browser and the network on, and when the switches are unresolved", () => {
    expect(names({ cloudBrowser: true, cloudNetwork: true })).toContain(
      "computer_read_pages",
    );
    expect(names(undefined)).toContain("computer_read_pages");
  });

  test("not offered when the browser is switched off", () => {
    const offered = names({ cloudBrowser: false });
    expect(offered).not.toContain("computer_read_pages");
    expect(offered).not.toContain("computer_navigate");
  });

  test("not offered when the network is switched off, as computer_navigate is not", () => {
    const offered = names({ cloudBrowser: true, cloudNetwork: false });
    expect(offered).not.toContain("computer_read_pages");
    expect(offered).not.toContain("computer_navigate");
    expect(offered).toContain("computer_snapshot");
  });

  test("a computer switched off but a browser on still offers it (files and commands are another switch)", () => {
    expect(names({ cloudComputer: false })).toContain("computer_read_pages");
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
  const readPages = (list: ReturnType<typeof tools>) =>
    list.find((tool) => tool.definition.name === "computer_read_pages");

  test("says what it does, its limits and what it leaves to computer_navigate, and requires urls", () => {
    const tool = readPages(tools({} as ComputerGateway));
    expect(tool?.definition.description).toBe(READ_PAGES_TOOL_DESCRIPTION);
    expect(READ_PAGES_TOOL_DESCRIPTION).toMatch(/up to 5 web pages/);
    expect(READ_PAGES_TOOL_DESCRIPTION).toMatch(/6,000 characters per page/);
    expect(READ_PAGES_TOOL_DESCRIPTION).toMatch(/24,000 in all/);
    expect(READ_PAGES_TOOL_DESCRIPTION).toMatch(/Read only/);
    expect(READ_PAGES_TOOL_DESCRIPTION).toMatch(/computer_navigate/);
    const parameters = tool?.definition.parameters as {
      required?: string[];
      properties?: { urls?: { maxItems?: number; minItems?: number } };
    };
    expect(parameters.required).toEqual(["urls"]);
    expect(parameters.properties?.urls?.maxItems).toBe(READ_PAGES_MAX_URLS);
    expect(parameters.properties?.urls?.minItems).toBe(1);
  });

  test("the app registers the same text, as a literal the eval runner can read, for the same limits", () => {
    const app = readFileSync(
      join(import.meta.dir, "../../app/src/lib/copilot/computer-tools.tsx"),
      "utf8",
    );
    expect(app).toContain(`"${READ_PAGES_TOOL_DESCRIPTION}"`);
    expect(app).toContain('name: "computer_read_pages"');
    expect(app).toContain(".max(5)");
  });

  test("passes the list to the gateway and refuses extra keys, an empty list and a sixth page", async () => {
    const calls: unknown[] = [];
    const gateway = {
      readPages: async (_b: string, _a: unknown, input: unknown) => {
        calls.push(input);
        return { pages: [], truncated: false, elapsedMs: 0 };
      },
    } as unknown as ComputerGateway;
    const tool = readPages(tools(gateway));
    const context = {
      toolCallId: "t1",
      signal: new AbortController().signal,
    };
    await tool?.execute({ urls: [`${GOOD}/a`] }, context);
    expect(calls).toEqual([{ urls: [`${GOOD}/a`] }]);
    for (const bad of [
      { urls: [] },
      { urls: [1, 2, 3, 4, 5, 6].map((n) => `${GOOD}/${n}`) },
      { urls: [`${GOOD}/a`], submit: true },
      {},
    ]) {
      await expect(
        Promise.resolve().then(() => tool?.execute(bad, context)),
      ).rejects.toThrow();
    }
    expect(calls).toHaveLength(1);
  });
});

describe("POST /:botId/read-pages", () => {
  function app(calls: unknown[]) {
    const gateway = {
      readPages: async (_b: string, _a: unknown, input: unknown) => {
        calls.push(input);
        return { pages: [], truncated: false, elapsedMs: 0 };
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
    routes.request("http://openbot.test/bot-1/read-pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  test("a list reaches the gateway", async () => {
    const calls: unknown[] = [];
    expect(
      (await post(app(calls), `{"urls":["${GOOD}/a","${GOOD}/b"]}`)).status,
    ).toBe(200);
    expect(calls).toEqual([{ urls: [`${GOOD}/a`, `${GOOD}/b`] }]);
  });

  test("a missing or malformed list is a 400 and reaches nothing", async () => {
    const calls: unknown[] = [];
    const routes = app(calls);
    for (const body of [
      "{}",
      '{"urls":"https://a.example"}',
      '{"urls":["https://a.example",1]}',
      "not json",
    ]) {
      expect((await post(routes, body)).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});
