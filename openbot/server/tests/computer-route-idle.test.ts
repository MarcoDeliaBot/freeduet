/**
 * A browser route that waits on the computer is not cut by Bun's idle limit, and nothing else is let off.
 *
 * `Bun.serve` closes a request that has sent nothing for ten seconds (it noticed at about twelve here,
 * on a coarse tick) and does so to a request that carried no body: a GET, or the POST that
 * `computer_snapshot` makes. A request with a JSON body is not cut, which is why a navigate, which has
 * one, never showed it, and why a snapshot that merely waited behind a slow page came back to the app
 * as a closed connection: "The assistant's computer could not be reached." The server's own log of the
 * failing eval run held the one warning Bun prints for it, "Bun.serve() timed out a request after 10
 * seconds".
 *
 * Served by the real `startHttpServer` with Bun's own settings and the real computer routes over a
 * gateway that stays silent. Real time: the silent cases run together and take about thirteen seconds.
 */
import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../src/auth/guards";
import {
  COMPUTER_ROUTE_IDLE_SECONDS,
  isComputerBrowserPath,
} from "../src/computer/browser-routes";
import { DEFAULT_COMPUTER_TIMEOUT_MS } from "../src/computer/client";
import type { ComputerGateway } from "../src/computer/gateway";
import type { PolicyStore } from "../src/computer/policy-store";
import { createComputerRoutes } from "../src/computer/routes";
import { loadConfig } from "../src/config";
import { startHttpServer } from "../src/http-server";
import { testEnvironment } from "./support/environment";

/** Longer than the time Bun took to cut a silent request, which is what the real-server case is for. */
const QUIET_MS = 13_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port;
  probe.stop(true);
  return port as number;
}

function singleUser() {
  const {
    GOOGLE_OAUTH_CLIENT_ID: _id,
    GOOGLE_OAUTH_CLIENT_SECRET: _secret,
    BETTER_AUTH_SECRET: _auth,
    BETTER_AUTH_URL: _url,
    INITIAL_ADMIN_EMAILS: _admins,
    ...rest
  } = testEnvironment();
  return { ...rest, OPENBOT_SINGLE_USER: "true" };
}

/** What a caller sees: an answer with its status, or a connection that was closed under it. */
async function ask(
  port: number,
  path: string,
  init?: RequestInit,
): Promise<{ status: number } | { cut: true }> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
    await response.text();
    return { status: response.status };
  } catch {
    return { cut: true };
  }
}

describe("which paths are the browser routes", () => {
  test("the nine routes one segment after the Bot, and nothing else", () => {
    for (const route of [
      "status",
      "screenshot",
      "read",
      "navigate",
      "snapshot",
      "click",
      "type",
      "key",
      "scroll",
    ])
      expect(isComputerBrowserPath(`/api/computers/bot-1/${route}`)).toBe(true);

    // A Bot id that needed escaping is still the Bot's route.
    expect(isComputerBrowserPath("/api/computers/bot%2D1/snapshot")).toBe(true);

    for (const path of [
      "/api/computers/bot-1/files/read",
      "/api/computers/bot-1/exec",
      "/api/computers/bot-1/stream",
      "/api/computers/bot-1/control/request",
      "/api/computers/bot-1/human/click",
      "/api/computers/bot-1/snapshot/extra",
      "/api/computers/policy",
      "/api/computers/fleet",
      "/api/voice/calls",
      "/api/threads",
      "/snapshot",
    ])
      expect(isComputerBrowserPath(path)).toBe(false);
  });

  test("the leash is longer than the transport's own deadline, and finite", () => {
    expect(COMPUTER_ROUTE_IDLE_SECONDS * 1000).toBeGreaterThan(
      DEFAULT_COMPUTER_TIMEOUT_MS,
    );
    // Bun takes at most 255 seconds.
    expect(COMPUTER_ROUTE_IDLE_SECONDS).toBeLessThanOrEqual(255);
  });
});

describe("a request that waits on the computer for longer than Bun's default", () => {
  test("a browser route still answers, and a route that is not one is cut as before", async () => {
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
    // Silent for longer than Bun's limit, then an answer: a snapshot or a read behind a slow page.
    const gateway = {
      snapshot: async () => {
        await sleep(QUIET_MS);
        return { snapshotId: 1, elements: [] };
      },
      read: async () => {
        await sleep(QUIET_MS);
        return { text: "the page" };
      },
      navigate: async () => {
        await sleep(QUIET_MS);
        return { url: "https://example.com/", title: "Example", text: "" };
      },
    } as unknown as ComputerGateway;

    const app = new Hono<{ Variables: AppVariables }>();
    app.route(
      "/api/computers",
      createComputerRoutes(
        gateway,
        {} as PolicyStore,
        requireUser,
        async () => true,
        undefined,
        undefined,
        () => undefined,
      ),
    );
    // Not a computer route, and as slow as the ones above.
    app.get("/api/plain/slow", async (context) => {
      await sleep(QUIET_MS);
      return context.json({ ok: true });
    });
    app.post("/api/plain/slow", async (context) => {
      await sleep(QUIET_MS);
      return context.json({ ok: true });
    });

    const port = freePort();
    const server = startHttpServer({
      port,
      config: {
        ...loadConfig(singleUser(), {}),
        listen: [{ host: "127.0.0.1", required: true, local: true }],
      },
      resolveRequestActor: async () => {
        throw new Error("not asked");
      },
      agentProfileStore: {} as never,
      computerGateway: undefined,
      demonstrationStore: {} as never,
      demonstrationRecorder: {} as never,
      app: { fetch: (request, env) => app.fetch(request, env) },
    });
    try {
      const json = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/" }),
      };
      const [snapshot, read, navigate, plainGet, plainPost] = await Promise.all(
        [
          // What computer_snapshot sends: a POST with no body.
          ask(port, "/api/computers/bot-1/snapshot", { method: "POST" }),
          // What computer_read sends: a GET.
          ask(port, "/api/computers/bot-1/read"),
          // Carries a body, so it was never cut; here to say it still is not.
          ask(port, "/api/computers/bot-1/navigate", json),
          ask(port, "/api/plain/slow"),
          ask(port, "/api/plain/slow", { method: "POST" }),
        ],
      );

      expect(snapshot).toEqual({ status: 200 });
      expect(read).toEqual({ status: 200 });
      expect(navigate).toEqual({ status: 200 });
      // Today's behaviour, for everything that is not a browser route.
      expect(plainGet).toEqual({ cut: true });
      expect(plainPost).toEqual({ cut: true });
    } finally {
      server.stop();
    }
  }, 45_000);
});
