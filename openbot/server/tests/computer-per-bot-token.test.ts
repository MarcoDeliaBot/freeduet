import { describe, expect, test } from "bun:test";
import type { AuditEventInput, AuditStore } from "../src/audit";
import {
  ComputerUnavailableError,
  createComputerTransport,
} from "../src/computer/client";
import { createComputerGateway } from "../src/computer/gateway";
import type { ActionPolicy } from "../src/computer/policy";
import {
  type EgressPolicy,
  pushEgressPolicies,
  withPolicyPushOnWake,
} from "../src/computer/policy-network";
import {
  type ComputerLocation,
  type ComputerProvider,
  tokenForBot,
} from "../src/computer/provider";
import { createInMemorySnapshotStore } from "../src/computer/snapshot-store";
import {
  createDockerSupervisorProvider,
  TOKEN_MEMORY_MAX_AGE_MS,
  TOKEN_MEMORY_MAX_BOTS,
} from "../src/computer/supervisor";
import { createComputerCheck } from "../src/openduet/computer-check";

/**
 * Each Bot's computer takes a token of its own, and the server presents that one and no other
 * (docs/design/per-computer-token.md).
 *
 * Every computer used to take the deployment's one `COMPUTER_TOKEN`, and a Bot's shell can read what
 * its computer holds, so the secret that opened every other Bot's computer was in the one place a
 * prompt-injected page gets to run commands. The supervisor now makes a token for each Bot and says it
 * on `/ensure`; the server learns it there (or by asking for it, once), and a computer that has one is
 * never sent the deployment's.
 *
 * The questions here are what the server SENDS and to WHOM, against a supervisor and computers that
 * are only records of what they were asked.
 */

const SHARED = "the-deployment-computer-token";
const tokenOf = (botId: string) => `own-token-of-${botId}`;

const PERMISSIVE: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };

type Call = { method: string; path: string; authorization: string | null };

/**
 * A supervisor that makes computers and says their tokens: `/ensure` answers with the token the
 * computer takes, `/token` answers the same for a computer nobody just ensured, and a listing names
 * computers and no token, which is what the real one does.
 */
function fakeSupervisor(
  options: {
    held?: Record<string, string>;
    leaveTokenOut?: boolean;
    onToken?: (botId: string) => Promise<void> | void;
  } = {},
) {
  const calls: Call[] = [];
  const held: Record<string, string> = { ...options.held };
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    calls.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      authorization: headers.get("authorization"),
    });
    const ensure = /^\/computers\/([^/]+)\/ensure$/.exec(url.pathname);
    if (ensure) {
      const botId = decodeURIComponent(ensure[1] as string);
      held[botId] = tokenOf(botId);
      return Response.json({
        botId,
        status: "running",
        url: `http://${botId}.computer:4100`,
        startedAt: "2026-11-14T10:00:00.000Z",
        ...(options.leaveTokenOut ? {} : { token: held[botId] }),
      });
    }
    const asked = /^\/computers\/([^/]+)\/token$/.exec(url.pathname);
    if (asked) {
      const botId = decodeURIComponent(asked[1] as string);
      await options.onToken?.(botId);
      if (options.leaveTokenOut)
        return new Response("Not Found", { status: 404 });
      const token = held[botId];
      return token === undefined
        ? Response.json({ error: "This Bot has no computer." }, { status: 404 })
        : Response.json({ botId, token });
    }
    if (url.pathname === "/computers") {
      return Response.json({
        computers: Object.keys(held).map((botId) => ({
          botId,
          status: "running",
          url: `http://${botId}.computer:4100`,
          startedAt: "2026-11-14T10:00:00.000Z",
        })),
      });
    }
    return Response.json({ error: url.pathname }, { status: 404 });
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    calls,
    held,
    tokenReads: () =>
      calls.filter((call) => call.path.endsWith("/token")).map((c) => c.path),
  };
}

describe("the token a Docker supervisor's computer takes", () => {
  test("is learned from `/ensure` and not asked for again", async () => {
    const supervisor = fakeSupervisor();
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      token: "supervisor-secret",
      fetchImpl: supervisor.fetchImpl,
    });

    await provider.locate("alpha");

    expect(await provider.tokenFor?.("alpha")).toBe(tokenOf("alpha"));
    expect(supervisor.tokenReads()).toEqual([]);
  });

  test("two Bots are told two tokens", async () => {
    const supervisor = fakeSupervisor();
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: supervisor.fetchImpl,
    });

    await provider.locate("alpha");
    await provider.locate("beta");

    expect(await provider.tokenFor?.("alpha")).toBe(tokenOf("alpha"));
    expect(await provider.tokenFor?.("beta")).toBe(tokenOf("beta"));
    expect(tokenOf("alpha")).not.toBe(tokenOf("beta"));
  });

  test("a computer nothing here has located is asked of the supervisor ONCE, with its own bearer, and then remembered", async () => {
    const supervisor = fakeSupervisor({ held: { alpha: tokenOf("alpha") } });
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      token: "supervisor-secret",
      fetchImpl: supervisor.fetchImpl,
    });

    expect(await provider.tokenFor?.("alpha")).toBe(tokenOf("alpha"));
    expect(await provider.tokenFor?.("alpha")).toBe(tokenOf("alpha"));
    expect(await provider.tokenFor?.("alpha")).toBe(tokenOf("alpha"));

    expect(supervisor.calls).toEqual([
      {
        method: "GET",
        path: "/computers/alpha/token",
        authorization: "Bearer supervisor-secret",
      },
    ]);
  });

  test("a crowd asking for a token nobody has yet is one question, not one each", async () => {
    let release: () => void = () => {};
    const open = new Promise<void>((resolve) => {
      release = resolve;
    });
    const supervisor = fakeSupervisor({
      held: { alpha: tokenOf("alpha") },
      onToken: () => open,
    });
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: supervisor.fetchImpl,
    });

    const crowd = Promise.all(
      [1, 2, 3, 4, 5].map(() => provider.tokenFor?.("alpha")),
    );
    await Bun.sleep(10);
    release();

    expect(await crowd).toEqual(Array(5).fill(tokenOf("alpha")));
    expect(supervisor.tokenReads()).toEqual(["/computers/alpha/token"]);
  });

  test("is remembered for at most a minute, and then asked again", async () => {
    expect(TOKEN_MEMORY_MAX_AGE_MS).toBe(60_000);
    let clock = 1_000_000;
    const supervisor = fakeSupervisor({ held: { alpha: tokenOf("alpha") } });
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: supervisor.fetchImpl,
      now: () => clock,
    });

    await provider.tokenFor?.("alpha");
    clock += TOKEN_MEMORY_MAX_AGE_MS - 1;
    await provider.tokenFor?.("alpha");
    expect(supervisor.tokenReads()).toHaveLength(1);

    clock += 1;
    await provider.tokenFor?.("alpha");
    expect(supervisor.tokenReads()).toHaveLength(2);
  });

  test("a computer replaced behind this server's back is presented the token it now holds as soon as its Bot is next ensured", async () => {
    const clock = 0;
    const supervisor = fakeSupervisor({ held: { alpha: "the-shared-token" } });
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: supervisor.fetchImpl,
      now: () => clock,
    });

    // Before it is replaced: what the container holds, which is what has to be presented to it.
    expect(await provider.tokenFor?.("alpha")).toBe("the-shared-token");
    // The Bot is next used (here, by this server's own `/ensure`), and the answer follows at once.
    await provider.locate("alpha");
    expect(await provider.tokenFor?.("alpha")).toBe(tokenOf("alpha"));
    expect(supervisor.tokenReads()).toHaveLength(1);
  });

  test("an older answer does not overwrite what an `/ensure` said while it was out", async () => {
    let clock = 0;
    let release: () => void = () => {};
    const open = new Promise<void>((resolve) => {
      release = resolve;
    });
    const supervisor = fakeSupervisor({
      held: { alpha: "the-shared-token" },
      // The read has left, and answers with the old token only when let go.
      onToken: () => open,
    });
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: supervisor.fetchImpl,
      now: () => clock,
    });

    const pending = provider.tokenFor?.("alpha");
    await Bun.sleep(10);
    // While it is out, the Bot's computer is replaced and `/ensure` says the new token.
    clock += 5;
    supervisor.held.alpha = tokenOf("alpha");
    await provider.locate("alpha");
    release();
    await pending;

    // What is remembered is the newer answer, not the one that finished last.
    expect(await provider.tokenFor?.("alpha")).toBe(tokenOf("alpha"));
  });

  test("no more than a thousand and twenty-four Bots are remembered, the longest remembered going first", async () => {
    expect(TOKEN_MEMORY_MAX_BOTS).toBe(1024);
    let clock = 0;
    const supervisor = fakeSupervisor();
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: supervisor.fetchImpl,
      now: () => clock,
    });

    for (let index = 0; index < TOKEN_MEMORY_MAX_BOTS + 1; index++) {
      clock += 1;
      await provider.locate(`bot-${index}`);
    }
    // Every one of them was told its token by its own `/ensure`: nothing has been asked for yet.
    expect(supervisor.tokenReads()).toEqual([]);

    // The newest is still remembered; the first is not, and is asked for.
    expect(await provider.tokenFor?.(`bot-${TOKEN_MEMORY_MAX_BOTS}`)).toBe(
      tokenOf(`bot-${TOKEN_MEMORY_MAX_BOTS}`),
    );
    expect(supervisor.tokenReads()).toEqual([]);
    expect(await provider.tokenFor?.("bot-0")).toBe(tokenOf("bot-0"));
    expect(supervisor.tokenReads()).toEqual(["/computers/bot-0/token"]);
  }, 30_000);

  test("is forgotten when the computer is reset, because the computer it belonged to is gone", async () => {
    const supervisor = fakeSupervisor();
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: ((input: string, init?: RequestInit) =>
        new URL(input).pathname.endsWith("/reset")
          ? Promise.resolve(Response.json({ reset: true }))
          : supervisor.fetchImpl(input, init)) as unknown as typeof fetch,
    });
    await provider.locate("alpha");
    await provider.tokenFor?.("alpha");
    expect(supervisor.tokenReads()).toEqual([]);

    await provider.reset("alpha");
    await provider.tokenFor?.("alpha");

    expect(supervisor.tokenReads()).toEqual(["/computers/alpha/token"]);
  });

  test("is refused, in words, by a supervisor too old to say it", async () => {
    const supervisor = fakeSupervisor({ leaveTokenOut: true });
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: supervisor.fetchImpl,
    });

    // The address still comes back: a supervisor of the release before this one is not a supervisor
    // that cannot start a computer.
    expect(await provider.locate("alpha")).toBe("http://alpha.computer:4100");
    await expect(provider.tokenFor?.("alpha")).rejects.toThrow(
      /older than this server/,
    );
  });

  test("is refused when the supervisor answers with no token at all", async () => {
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: (async () =>
        Response.json({ botId: "alpha" })) as unknown as typeof fetch,
    });

    await expect(provider.tokenFor?.("alpha")).rejects.toThrow(
      /did not say which token/,
    );
  });

  test("a Bot with no computer is a refusal the supervisor words itself", async () => {
    const supervisor = fakeSupervisor();
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      fetchImpl: supervisor.fetchImpl,
    });

    await expect(provider.tokenFor?.("nobody")).rejects.toThrow(
      "This Bot has no computer.",
    );
  });
});

describe("which token goes to which computer", () => {
  const withTokens = {
    tokenFor: async (botId: string) => tokenOf(botId),
  };

  test("a provider with a token for each Bot is asked, and the deployment's token is not used", async () => {
    expect(await tokenForBot(withTokens, "alpha", SHARED)).toBe(
      tokenOf("alpha"),
    );
  });

  test("and when it cannot say, the deployment's token is not used in its place", async () => {
    await expect(
      tokenForBot(
        {
          tokenFor: async () => {
            throw new Error("the supervisor could not be reached");
          },
        },
        "alpha",
        SHARED,
      ),
    ).rejects.toThrow("could not be reached");
  });

  // A guard of behaviour that did not change: a deployment with one computer, or a cluster whose
  // Sandboxes take one secret, still presents the one it has.
  test("a provider without one has one token for every computer, and that is presented", async () => {
    expect(await tokenForBot({}, "alpha", SHARED)).toBe(SHARED);
    expect(await tokenForBot(undefined, "alpha", SHARED)).toBe(SHARED);
    expect(await tokenForBot({}, "alpha", undefined)).toBeUndefined();
  });
});

describe("the transport", () => {
  const recorded = () => {
    const seen: { url: string; token: string | null }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({
        url,
        token: new Headers(init?.headers).get("x-openbot-computer-token"),
      });
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    return { seen, fetchImpl };
  };

  test("presents each Bot its own computer's token, on one transport, and never the deployment's", async () => {
    const { seen, fetchImpl } = recorded();
    const transport = createComputerTransport({
      token: SHARED,
      tokenFor: async (botId) => tokenOf(botId),
      fetchImpl,
    });

    await transport.post("http://alpha.computer:4100", "alpha", "/click", {});
    await transport.post("http://beta.computer:4100", "beta", "/click", {});
    await transport.call("http://alpha.computer:4100", "alpha", "/read");

    expect(seen.map((request) => request.token)).toEqual([
      tokenOf("alpha"),
      tokenOf("beta"),
      tokenOf("alpha"),
    ]);
    expect(JSON.stringify(seen)).not.toContain(SHARED);
  });

  test("sends nothing at all when the token cannot be learned, and says so in the log", async () => {
    const { seen, fetchImpl } = recorded();
    const log: Record<string, unknown>[] = [];
    const transport = createComputerTransport({
      token: SHARED,
      tokenFor: async () => {
        throw new Error("secret detail the person must not read");
      },
      fetchImpl,
      log: (entry) => log.push(entry),
    });

    const failure = await transport
      .post("http://alpha.computer:4100", "alpha", "/click", {})
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ComputerUnavailableError);
    expect((failure as Error).message).toContain("access token");
    expect((failure as Error).message).not.toContain("secret detail");
    // Not even the deployment's token went anywhere: there was no request.
    expect(seen).toEqual([]);
    expect(log).toMatchObject([
      {
        type: "computer-transport-failure",
        reason: "token-unavailable",
        path: "/click",
        botId: "alpha",
      },
    ]);
    expect(JSON.stringify(log)).not.toContain("secret detail");
  });

  // A guard of behaviour that did not change.
  test("without a token for each Bot it presents the one it has, as it always did", async () => {
    const { seen, fetchImpl } = recorded();
    const transport = createComputerTransport({ token: SHARED, fetchImpl });

    await transport.post("http://computer:4100", "alpha", "/click", {});
    await transport.post("http://computer:4100", "beta", "/click", {});

    expect(seen.map((request) => request.token)).toEqual([SHARED, SHARED]);
  });
});

describe("the gateway over a Docker supervisor", () => {
  /**
   * Computers that open for their own token alone: each host answers 401 to every other, the
   * deployment's included, and writes down what it was shown.
   */
  function fakeComputers() {
    const shown: { host: string; token: string | null }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const target = new URL(url);
      const botId = target.hostname.replace(".computer", "");
      const token = new Headers(init?.headers).get("x-openbot-computer-token");
      shown.push({ host: target.hostname, token });
      if (token !== tokenOf(botId)) {
        return Response.json({ error: "Not authorised." }, { status: 401 });
      }
      if (target.pathname === "/screenshot")
        return Response.json({ mimeType: "image/png", data: botId });
      return Response.json({ error: target.pathname }, { status: 404 });
    }) as unknown as typeof fetch;
    return { fetchImpl, shown };
  }

  function stackWith(supervisor: ReturnType<typeof fakeSupervisor>) {
    const computers = fakeComputers();
    const rows: AuditEventInput[] = [];
    const auditStore: AuditStore = {
      insert: async (event) => void rows.push(event),
    };
    const provider = createDockerSupervisorProvider({
      baseUrl: "http://supervisor:4300",
      token: "supervisor-secret",
      fetchImpl: supervisor.fetchImpl,
    });
    const gateway = createComputerGateway({
      provider,
      auditStore,
      policy: () => PERMISSIVE,
      snapshots: createInMemorySnapshotStore(),
      fetchImpl: computers.fetchImpl,
      // The deployment's own token, which this configuration used to present to every computer.
      token: SHARED,
    });
    return { gateway, provider, computers };
  }

  test("reaches each Bot's computer with that computer's own token, and none of them is shown the deployment's", async () => {
    const supervisor = fakeSupervisor();
    const { gateway, computers } = stackWith(supervisor);

    const alpha = await gateway.screenshot("alpha");
    const beta = await gateway.screenshot("beta");

    expect(alpha).toMatchObject({ data: "alpha" });
    expect(beta).toMatchObject({ data: "beta" });
    expect(computers.shown).toEqual([
      { host: "alpha.computer", token: tokenOf("alpha") },
      { host: "beta.computer", token: tokenOf("beta") },
    ]);
    expect(JSON.stringify(computers.shown)).not.toContain(SHARED);
    // And nothing was asked for twice: the token came with the `/ensure` each action makes.
    expect(supervisor.tokenReads()).toEqual([]);
  });

  test("hands the live screen the same token, for the same Bot", async () => {
    const supervisor = fakeSupervisor();
    const { gateway } = stackWith(supervisor);

    await gateway.locate("alpha");
    await gateway.locate("beta");

    expect(await gateway.tokenFor("alpha")).toBe(tokenOf("alpha"));
    expect(await gateway.tokenFor("beta")).toBe(tokenOf("beta"));
  });

  test("a computer whose token the supervisor cannot give is not sent anything, and the deployment's token is not tried", async () => {
    const supervisor = fakeSupervisor({ leaveTokenOut: true });
    const { gateway, computers } = stackWith(supervisor);

    await expect(gateway.screenshot("alpha")).rejects.toThrow(
      "access token isn't available",
    );

    expect(computers.shown).toEqual([]);
  });

  // A guard of behaviour that did not change: a gateway over a provider with no token for each Bot
  // presents the deployment's, whatever the Bot.
  test("over a provider with one token for every computer, the gateway presents that one", async () => {
    const shown: (string | null)[] = [];
    const provider: ComputerProvider = {
      name: "one computer",
      isolation: "shared",
      locate: async () => "http://computer:4100",
      status: async (botId) => ({ botId, state: "ready" }),
      stop: async () => ({ wasRunning: false }),
      reset: async () => ({ cleared: false }),
      list: async () => [],
    };
    const gateway = createComputerGateway({
      provider,
      auditStore: { insert: async () => {} },
      policy: () => PERMISSIVE,
      snapshots: createInMemorySnapshotStore(),
      token: SHARED,
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        shown.push(new Headers(init?.headers).get("x-openbot-computer-token"));
        return Response.json({ mimeType: "image/png", data: "x" });
      }) as unknown as typeof fetch,
    });

    await gateway.screenshot("alpha");
    await gateway.screenshot("beta");

    expect(shown).toEqual([SHARED, SHARED]);
    expect(await gateway.tokenFor("alpha")).toBe(SHARED);
  });
});

describe("the network policy pushed to every computer", () => {
  const POLICY: EgressPolicy = { mode: "allow_all", rules: [] };
  const running = (...bots: string[]): ComputerLocation[] =>
    bots.map((botId) => ({
      botId,
      status: "running",
      url: `http://${botId}.computer:4100`,
    }));

  function pushes() {
    const seen: { url: string; botId: string | null; token: string | null }[] =
      [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({
        url,
        botId: headers.get("x-openbot-bot-id"),
        token: headers.get("x-openbot-computer-token"),
      });
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    return { seen, fetchImpl };
  }

  const providerOf = (
    computers: ComputerLocation[],
    tokenFor?: (botId: string) => Promise<string>,
  ): ComputerProvider => ({
    name: "test",
    isolation: "per-bot",
    locate: async (botId) => `http://${botId}.computer:4100`,
    status: async (botId) => ({ botId, state: "ready" }),
    stop: async () => ({ wasRunning: false }),
    reset: async () => ({ cleared: false }),
    list: async () => computers,
    ...(tokenFor ? { tokenFor } : {}),
  });

  test("goes to each running computer with its own token, and the deployment's token goes to none", async () => {
    const { seen, fetchImpl } = pushes();

    const report = await pushEgressPolicies({
      provider: providerOf(running("alpha", "beta"), async (b) => tokenOf(b)),
      token: SHARED,
      policyForBot: async () => POLICY,
      fetchImpl,
    });

    expect(report).toEqual({ pushed: ["alpha", "beta"], failed: [] });
    expect(seen.map(({ botId, token }) => [botId, token])).toEqual([
      ["alpha", tokenOf("alpha")],
      ["beta", tokenOf("beta")],
    ]);
    expect(JSON.stringify(seen)).not.toContain(SHARED);
  });

  test("a computer whose token cannot be learned is reported failed and is sent nothing, the others unaffected", async () => {
    const { seen, fetchImpl } = pushes();

    const report = await pushEgressPolicies({
      provider: providerOf(running("alpha", "gamma", "beta"), async (b) => {
        if (b === "gamma") throw new Error("no token for gamma");
        return tokenOf(b);
      }),
      token: SHARED,
      policyForBot: async () => POLICY,
      fetchImpl,
    });

    expect(report.pushed).toEqual(["alpha", "beta"]);
    expect(report.failed).toEqual([
      { botId: "gamma", reason: "no token for gamma" },
    ]);
    expect(seen.map((request) => request.botId)).toEqual(["alpha", "beta"]);
  });

  // A guard of behaviour that did not change.
  test("over a provider with one token for every computer it presents that one", async () => {
    const { seen, fetchImpl } = pushes();

    await pushEgressPolicies({
      provider: providerOf(running("alpha", "beta")),
      token: SHARED,
      policyForBot: async () => POLICY,
      fetchImpl,
    });

    expect(seen.map((request) => request.token)).toEqual([SHARED, SHARED]);
  });

  test("on the way to the action that woke a computer, goes with the token of the computer that woke", async () => {
    const { seen, fetchImpl } = pushes();
    const wrapped = withPolicyPushOnWake(
      providerOf([], async (b) => tokenOf(b)),
      { policyForBot: async () => POLICY, token: SHARED, fetchImpl },
    );

    expect(await wrapped.locate("alpha")).toBe("http://alpha.computer:4100");
    expect(await wrapped.locate("beta")).toBe("http://beta.computer:4100");

    expect(seen.map(({ botId, token }) => [botId, token])).toEqual([
      ["alpha", tokenOf("alpha")],
      ["beta", tokenOf("beta")],
    ]);
    // The wrapper hands the provider's own method through, so the callers that ask it get the answer.
    expect(await wrapped.tokenFor?.("alpha")).toBe(tokenOf("alpha"));
  });

  test("the setup check pushes to each running computer with its own token", async () => {
    const { seen, fetchImpl } = pushes();

    const verdict = await createComputerCheck({
      provider: providerOf(running("alpha", "beta"), async (b) => tokenOf(b)),
      controls: () => ({ policyForBot: async () => POLICY }),
      token: SHARED,
      fetchImpl,
    })();

    expect(verdict).toBe("ready");
    expect(seen.map(({ botId, token }) => [botId, token])).toEqual([
      ["alpha", tokenOf("alpha")],
      ["beta", tokenOf("beta")],
    ]);
    expect(JSON.stringify(seen)).not.toContain(SHARED);
  });
});
