import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../src/auth/guards";
import {
  ComputerUnavailableError,
  createComputerTransport,
  ElementNotFoundError,
  PageNotUsableError,
} from "../src/computer/client";
import type { ComputerGateway } from "../src/computer/gateway";
import type { PolicyStore } from "../src/computer/policy-store";
import { createComputerRoutes } from "../src/computer/routes";

/**
 * A page that would not settle, told apart from an element that is gone.
 *
 * Playwright words a navigation that ran out of time as `Timeout 20000ms exceeded`, the same words it
 * uses for a click on a ref that is no longer in the page. The transport used to read those words and
 * nothing else, so a navigate to a slow or redirecting page came back as "That element is not on the
 * page any more. Take a fresh snapshot", an instruction about refs that no navigate has ever had to
 * give. These pin the three things that keep the two apart: the path the words arrived on, the flag
 * the computer puts on a page it could not settle, and the status the surface answers with.
 */

const BASE = "http://agent-computer:4100";
const BOT = "bot-1";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function transportAnswering(
  answer: (url: string) => Response | Promise<Response>,
  log?: (entry: Record<string, unknown>) => void,
) {
  return createComputerTransport({
    fetchImpl: ((url: string) =>
      Promise.resolve(answer(url))) as unknown as typeof fetch,
    ...(log ? { log } : {}),
  });
}

const gotoTimeout = {
  error:
    'goto: Timeout 20000ms exceeded.\nCall log:\n  - navigating to "https://shop.example/cart?session=abc123", waiting until "domcontentloaded"\n',
};

describe("a navigate that ran out of time", () => {
  test("is not an element that went missing", async () => {
    const transport = transportAnswering(() => json(500, gotoTimeout));

    const failure = await transport
      .navigate(BASE, BOT, "https://shop.example/cart")
      .catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(ElementNotFoundError);
    expect(failure).toBeInstanceOf(PageNotUsableError);
    const message = (failure as Error).message;
    // Not the instruction about refs, which sends a Bot to snapshot a page it never reached.
    expect(message).not.toContain("fresh snapshot");
    expect(message).not.toContain("element");
    // Not Playwright's call log either, which carries the address with its query string.
    expect(message).not.toContain("Call log");
    expect(message).not.toContain("abc123");
  });

  test("keeps the sentence the computer chose when it flagged the page", async () => {
    const sentence =
      "This page kept reloading and never settled, so nothing could be read from it. Try again in a moment.";
    const transport = transportAnswering(() =>
      json(502, { error: sentence, pageNotReady: true }),
    );

    const failure = await transport
      .navigate(BASE, BOT, "https://shop.example/cart")
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PageNotUsableError);
    expect((failure as Error).message).toBe(sentence);
  });

  test("is not an unavailable computer either", async () => {
    const transport = transportAnswering(() =>
      json(502, { error: "Still loading.", pageNotReady: true }),
    );

    const failure = await transport
      .navigate(BASE, BOT, "https://shop.example/")
      .catch((error: unknown) => error);

    // The computer answered, and a caller that catches an unavailable computer to look for a
    // container that is down would be looking in the wrong place.
    expect(failure).not.toBeInstanceOf(ComputerUnavailableError);
  });

  test("a snapshot or a read that could not settle says so in the same way", async () => {
    for (const path of ["/snapshot", "/read"]) {
      const transport = transportAnswering(() => json(500, gotoTimeout));
      const failure = await transport
        .call(BASE, BOT, path)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(PageNotUsableError);
      expect(failure).not.toBeInstanceOf(ElementNotFoundError);
    }
  });
});

describe("a ref that is not on the page", () => {
  const clickTimeout = {
    error:
      "click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for locator('aria-ref=e5')\n",
  };

  test("is still an element that went missing, on every acting path", async () => {
    for (const path of ["/click", "/type", "/key"]) {
      const transport = transportAnswering(() => json(500, clickTimeout));
      const failure = await transport
        .post(BASE, BOT, path, { ref: "e5", snapshotId: 1 })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ElementNotFoundError);
      expect((failure as Error).message).toContain("e5");
      expect((failure as Error).message).toContain("fresh snapshot");
    }
  });
});

describe("a computer that answers busy", () => {
  test("says it is busy, in words, and not that it could not be reached", async () => {
    const transport = transportAnswering(() =>
      json(503, {
        error:
          "This computer is still busy with an earlier action. Wait a moment and try again.",
        busy: true,
      }),
    );

    const failure = await transport
      .navigate(BASE, BOT, "https://shop.example/")
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ComputerUnavailableError);
    expect((failure as Error).message).toContain("still busy");
    expect((failure as Error).message).not.toContain("could not be reached");
    expect((failure as Error).message).not.toContain("isn't running");
  });
});

/**
 * Why a call to the computer failed, in one line an operator can read afterwards.
 *
 * The person-facing sentence for a computer that did not answer is one sentence for several causes,
 * and the logs of a healthy-looking container did not say which. These lines name the cause and the
 * route, and leave out everything that identifies a person or a page: no query string, no body, no
 * page address.
 */
describe("a failed call to the computer leaves one line saying why", () => {
  function failing(error: Error) {
    const lines: Record<string, unknown>[] = [];
    const transport = createComputerTransport({
      fetchImpl: (() => Promise.reject(error)) as unknown as typeof fetch,
      log: (entry) => lines.push(entry),
    });
    return { transport, lines };
  }

  test("a deadline that passed", async () => {
    const timeout = new Error("The operation timed out.");
    timeout.name = "TimeoutError";
    const { transport, lines } = failing(timeout);

    await expect(
      transport.post(BASE, BOT, "/navigate", { url: "https://shop.example/" }),
    ).rejects.toThrow("didn't respond in time");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: "computer-transport-failure",
      reason: "timeout",
      path: "/navigate",
      botId: BOT,
    });
  });

  test("a computer nothing is listening on", async () => {
    const { transport, lines } = failing(new Error("connect ECONNREFUSED"));

    await expect(transport.call(BASE, BOT, "/snapshot")).rejects.toThrow(
      "isn't running",
    );

    expect(lines[0]).toMatchObject({
      reason: "connection-refused",
      path: "/snapshot",
    });
  });

  test("a connection the computer dropped while it was answering", async () => {
    const { transport, lines } = failing(
      new Error("The socket connection was closed unexpectedly."),
    );

    const failure = await transport
      .call(BASE, BOT, "/snapshot")
      .catch((error: unknown) => error);

    expect(lines[0]).toMatchObject({ reason: "connection-closed" });
    // A computer that closed the connection was running, so it is not reported as not running.
    expect((failure as Error).message).not.toContain("isn't running");
    expect((failure as Error).message).toContain("closed the connection");
  });

  test("names the route and nothing that was asked of it", async () => {
    const { transport, lines } = failing(new Error("connect ECONNREFUSED"));

    await transport
      .call(BASE, BOT, "/files/download?path=taxes-2025.pdf")
      .catch(() => undefined);

    const serialised = JSON.stringify(lines);
    expect(lines[0]).toMatchObject({ path: "/files/download" });
    expect(serialised).not.toContain("taxes");
    expect(serialised).not.toContain("?");
    expect(serialised).not.toContain(BASE);
  });

  test("a person pressing Stop is not a failure to log", async () => {
    const controller = new AbortController();
    const lines: Record<string, unknown>[] = [];
    const transport = createComputerTransport({
      fetchImpl: (() => {
        controller.abort();
        const aborted = new Error("aborted");
        aborted.name = "AbortError";
        return Promise.reject(aborted);
      }) as unknown as typeof fetch,
      log: (entry) => lines.push(entry),
    });

    await expect(
      transport.post(BASE, BOT, "/click", {}, controller.signal),
    ).rejects.toThrow("The action was stopped.");

    expect(lines).toHaveLength(0);
  });
});

describe("the route for a page that would not settle", () => {
  const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
    context,
    next,
  ) => {
    context.set("actor", {
      id: "user-1",
      email: "member@openbot.test",
      role: "user",
    });
    await next();
  };

  function routesFor(
    gateway: unknown,
    log?: (entry: Record<string, unknown>) => void,
  ) {
    return createComputerRoutes(
      gateway as ComputerGateway,
      {} as PolicyStore,
      requireUser,
      async () => true,
      undefined,
      undefined,
      log,
    );
  }

  const post = (path: string) =>
    new Request(`http://openbot.test/bot-17${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://shop.example/" }),
    });

  test("answers 502 with the computer's own words, and no stale-refs flag", async () => {
    const sentence = "This page kept reloading. Try again in a moment.";
    const routes = routesFor({
      navigate: async () => {
        throw new PageNotUsableError(sentence);
      },
      snapshot: async () => {
        throw new PageNotUsableError(sentence);
      },
    });

    for (const path of ["/navigate", "/snapshot"]) {
      const response = await routes.request(post(path));
      expect(response.status).toBe(502);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe(sentence);
      // 409 is how a stale ref is reported, and the surface turns a 409 into `staleRefs`.
      expect(body.stale).toBeUndefined();
    }
  });

  test("notes a call that failed on the server, without the address it was for", async () => {
    const lines: Record<string, unknown>[] = [];
    const routes = routesFor(
      {
        navigate: async () => {
          throw new ComputerUnavailableError(
            "The Bot's computer isn't running.",
          );
        },
      },
      (entry) => lines.push(entry),
    );

    const response = await routes.request(post("/navigate"));

    expect(response.status).toBe(503);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: "computer-route-call",
      botId: "bot-17",
      route: "navigate",
      status: 503,
      clientGone: false,
    });
    expect(JSON.stringify(lines)).not.toContain("shop.example");
  });

  test("notes a caller that went away while the computer was still working", async () => {
    const lines: Record<string, unknown>[] = [];
    const controller = new AbortController();
    const routes = routesFor(
      {
        snapshot: async () => {
          controller.abort();
          return { snapshotId: 1, text: "" };
        },
      },
      (entry) => lines.push(entry),
    );

    await routes.request(
      new Request("http://openbot.test/bot-17/snapshot", {
        method: "POST",
        signal: controller.signal,
      }),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ route: "snapshot", clientGone: true });
  });

  test("says nothing about a call that went well", async () => {
    const lines: Record<string, unknown>[] = [];
    const routes = routesFor(
      { screenshot: async () => ({ image: "aGk=", mimeType: "image/png" }) },
      (entry) => lines.push(entry),
    );

    const response = await routes.request(
      "http://openbot.test/bot-17/screenshot",
    );

    expect(response.status).toBe(200);
    expect(lines).toHaveLength(0);
  });
});
