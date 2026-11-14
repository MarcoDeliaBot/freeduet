import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import {
  type EgressPolicy,
  setEgressPolicy,
  setEgressResolver,
  startEgressFilter,
  stopEgressFilter,
} from "../src/egress";

/**
 * A Bot's real browser and the network around its computer (D36).
 *
 * Launched through the real profile path with the egress filter in front of it, as on a computer,
 * because what a browser does with a proxy is not something a unit test can know: Playwright forces
 * `<-loopback>` into Chromium's proxy bypass list, which makes loopback go THROUGH the filter, and
 * that is what lets the filter refuse a Bot's own `localhost`. Each case counts connections that
 * reached a server on this machine, so a refusal that connected first would fail it.
 *
 * Asked for by name, like `web-bot-auth-browser.test.ts`: it launches a real Chromium.
 *
 *   cd agent-computer && bunx playwright install chromium
 *   OPENBOT_COMPUTER_BROWSER=1 COMPUTER_BROWSER_MODE=headless bun test tests/private-network-browser.test.ts
 */
const asked = process.env.OPENBOT_COMPUTER_BROWSER === "1";
const BOT = "private-network-browser-test";

const blocked: EgressPolicy = { mode: "allow_all", rules: [] };
const switchedOn: EgressPolicy = {
  mode: "allow_all",
  rules: [],
  allowPrivateNetwork: true,
};

/** A server on this machine that counts how many requests reached it. */
function origin() {
  let reached = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      reached += 1;
      return new Response("a service on this computer", {
        headers: { "access-control-allow-origin": "*" },
      });
    },
  });
  return {
    port: server.port,
    reached: () => reached,
    stop: () => server.stop(true),
  };
}

/**
 * An upstream proxy standing in for the internet. `public.test` is a page that reaches for the home
 * network three ways (an image, a script's `fetch`, and a redirect), and everything the proxy is
 * ever asked for is recorded.
 */
async function internet(localPort: number) {
  const seen: string[] = [];
  const redirectTo = { location: "http://192.168.1.1/admin" };
  const server = createServer((request: IncomingMessage, response) => {
    const url = request.url ?? "";
    seen.push(url);
    if (url === "http://public.test/") {
      response.writeHead(200, { "content-type": "text/html" }).end(
        `<!doctype html><body>
          <img src="http://192.168.1.1/pixel.png">
          <script>
            window.results = {};
            const settle = (name, promise) => promise.then(
              () => (results[name] = "sent"),
              () => (results[name] = "failed"),
            );
            settle("router", fetch("http://192.168.1.1/api", { mode: "no-cors" }));
            settle("local", fetch("http://127.0.0.1:${localPort}/", { mode: "no-cors" }));
            settle("name", fetch("http://nas.lan/api", { mode: "no-cors" }));
          </script>
          the page</body>`,
      );
      return;
    }
    if (url === "http://public.test/redirect") {
      response.writeHead(302, { location: redirectTo.location }).end();
      return;
    }
    response.end(`the internet answered ${url}`);
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    seen,
    redirectTo,
    // A browser keeps its connections open between requests, and `close` waits for every one of them.
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/**
 * Wait for a server to finish closing, but not for ever.
 *
 * `server.close` calls back only when every connection it accepted has ended, and Bun can keep one
 * that Chromium opened ahead of a request and dropped with the browser, half-closed, for good. The
 * server has stopped listening by then, which is all the next case needs, so a cleanup waits a
 * moment and goes on rather than holding the whole file to the case's own timeout.
 */
async function closedWithin(closing: Promise<void>, ms = 2_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    closing,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * The icons a browser asks for by itself, one for each page it has shown (`/favicon.ico` of the page's
 * own origin).
 *
 * It asks some tens of milliseconds after the page, give or take as much, which is about when a case
 * moves on: it lands on either side of the next step, and it is judged by the policy of the moment it
 * arrives, like any request. Measured, one run in ten (on a quiet machine) saw the router's icon come
 * after the case had switched the network on and cleared what the proxy had seen. So a case that reads
 * the list of requests across such a step names the icons it can meet there, and nothing else is let
 * pass: an icon of any other place is a request that must not have been made.
 */
const PUBLIC_ICON = "http://public.test/favicon.ico";
const ROUTER_ICON = "http://192.168.1.1/favicon.ico";

/** What a proxy was asked for, except the named icons. */
function askedFor(seen: readonly string[], icons: readonly string[]) {
  return seen.filter((url) => !icons.includes(url));
}

/** Navigate, and say what came back: the status and the text of the page. */
async function visit(page: Page, url: string) {
  try {
    const response = await page.goto(url, { timeout: 15_000 });
    return {
      status: response?.status() ?? 0,
      refused: response?.headers()["x-openbot-egress"] === "refused",
      text: ((await page.textContent("body")) ?? "").trim(),
      url: page.url(),
    };
  } catch (error) {
    return {
      status: 0,
      refused: false,
      text: String(error).split("\n")[0] ?? "",
      url: page.url(),
    };
  }
}

describe.skipIf(!asked)("a Bot's browser and the home network", () => {
  afterEach(async () => {
    await closedWithin(stopEgressFilter());
    setEgressResolver(null);
  });

  async function launch() {
    const { createProfiles } = await import("../src/profiles");
    const root = await mkdtemp(join(tmpdir(), "openbot-private-network-"));
    const profiles = createProfiles(root);
    return {
      profiles,
      page: () => profiles.page(BOT),
      done: async () => {
        await profiles.stop(BOT).catch(() => undefined);
        await rm(root, { recursive: true, force: true }).catch(() => undefined);
      },
    };
  }

  test("a service on the computer itself is refused by default, by address, by name and by a name that resolves to it, and is reached once the switch is on", async () => {
    const local = origin();
    await startEgressFilter({ env: {} });
    // The browser hands a name to the filter unresolved, and the filter resolves it here.
    setEgressResolver(async (host) => {
      if (host === "nas.test" || host === "localhost") return ["127.0.0.1"];
      throw new Error(`no such host ${host}`);
    });
    const browser = await launch();
    try {
      const page = await browser.page();
      const targets = [
        `http://127.0.0.1:${local.port}/`,
        `http://localhost:${local.port}/`,
        `http://nas.test:${local.port}/`,
      ];
      setEgressPolicy(BOT, blocked);
      for (const target of targets) {
        const outcome = await visit(page, target);
        expect({
          target,
          status: outcome.status,
          refused: outcome.refused,
        }).toEqual({
          target,
          status: 403,
          refused: true,
        });
        expect(outcome.text).toContain("Home and office network access");
      }
      // Not one of them connected.
      expect(local.reached()).toBe(0);

      // The person switches it on, and the next navigation is judged by the new policy.
      setEgressPolicy(BOT, switchedOn);
      for (const target of targets) {
        const before = local.reached();
        const outcome = await visit(page, target);
        expect({ target, status: outcome.status, text: outcome.text }).toEqual({
          target,
          status: 200,
          text: "a service on this computer",
        });
        expect(local.reached()).toBeGreaterThan(before);
      }

      // And switched off again, it is refused again.
      setEgressPolicy(BOT, blocked);
      expect((await visit(page, targets[0] as string)).status).toBe(403);
    } finally {
      await browser.done();
      local.stop();
    }
  }, 120_000);

  test("cloud metadata is refused with the switch on, in the address and in a number that means it", async () => {
    await startEgressFilter({ env: {} });
    const browser = await launch();
    try {
      const page = await browser.page();
      // Off, the home network is refused too, and for its own reason: the switch.
      setEgressPolicy(BOT, blocked);
      const router = await visit(page, "http://192.168.1.1/");
      expect({ status: router.status, refused: router.refused }).toEqual({
        status: 403,
        refused: true,
      });
      expect(router.text).toContain("Home and office network access");
      // On, it is not metadata that the switch lets through.
      setEgressPolicy(BOT, switchedOn);
      for (const target of [
        "http://169.254.169.254/latest/meta-data/",
        // The URL parser turns this into the same dotted address before the browser sends it.
        "http://2852039166/latest/meta-data/",
        "http://169.254.170.2/v2/credentials",
      ]) {
        const outcome = await visit(page, target);
        expect({
          target,
          status: outcome.status,
          refused: outcome.refused,
        }).toEqual({
          target,
          status: 403,
          refused: true,
        });
        expect(outcome.text).toContain("cloud metadata");
      }
    } finally {
      await browser.done();
    }
  }, 120_000);

  test("a page on the internet cannot reach the home network, by an image, a script or a redirect, and everything it is allowed still loads", async () => {
    const local = origin();
    const net = await internet(local.port);
    await startEgressFilter({
      env: { EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${net.port}` },
    });
    const browser = await launch();
    try {
      const page = await browser.page();
      setEgressPolicy(BOT, blocked);

      // The page itself is a public name, so it is asked for.
      const loaded = await visit(page, "http://public.test/");
      expect(loaded.status).toBe(200);
      expect(loaded.text).toContain("the page");
      // Wait for the script to have settled all three requests, one way or the other.
      await page.waitForFunction(
        () =>
          Object.keys((window as unknown as { results?: object }).results ?? {})
            .length === 3,
        undefined,
        { timeout: 15_000 },
      );
      // Nothing that reached for the home network got there: the proxy standing in for the internet
      // was never asked for it, and the service on this computer was never connected to.
      expect(net.seen).toContain("http://public.test/");
      expect(
        net.seen.filter((url) => /192\.168\.|127\.0\.0\.1|nas\.lan/.test(url)),
      ).toEqual([
        // A name is the one thing the filter cannot judge here: the proxy resolves it, and it is the
        // proxy's network that decides where it leads. Asked for by name, answered by the proxy.
        "http://nas.lan/api",
      ]);
      expect(local.reached()).toBe(0);

      // A redirect from the internet to the router is a new request, and the filter refuses it.
      net.seen.length = 0;
      net.redirectTo.location = "http://192.168.1.1/admin";
      const redirected = await visit(page, "http://public.test/redirect");
      expect(redirected.url).toBe("http://192.168.1.1/admin");
      expect(redirected.status).toBe(403);
      expect(redirected.refused).toBe(true);
      // The switch is off, so the proxy was asked for the redirect and for nothing at the router: not
      // the page, and not its icon either. (The icon of the page before this one may still arrive.)
      expect(askedFor(net.seen, [PUBLIC_ICON])).toEqual([
        "http://public.test/redirect",
      ]);

      // To metadata too, with the switch on.
      setEgressPolicy(BOT, switchedOn);
      net.seen.length = 0;
      net.redirectTo.location = "http://169.254.169.254/latest/meta-data/";
      const toMetadata = await visit(page, "http://public.test/redirect");
      expect(toMetadata.status).toBe(403);
      // The page the router's refusal came as may ask for its icon only now, with the switch on, and be
      // answered: that one is let by. Metadata is not: neither its address nor its icon may be asked for.
      expect(askedFor(net.seen, [PUBLIC_ICON, ROUTER_ICON])).toEqual([
        "http://public.test/redirect",
      ]);

      // With the switch on, a redirect inside the network is followed.
      net.seen.length = 0;
      net.redirectTo.location = "http://192.168.1.1/admin";
      const inside = await visit(page, "http://public.test/redirect");
      expect(inside.status).toBe(200);
      expect(inside.text).toContain(
        "the internet answered http://192.168.1.1/admin",
      );
      // (The browser asks for the page's icon as well, which says nothing here.)
      expect(net.seen.filter((url) => !url.endsWith("/favicon.ico"))).toEqual([
        "http://public.test/redirect",
        "http://192.168.1.1/admin",
      ]);
    } finally {
      await browser.done();
      await closedWithin(stopEgressFilter());
      await closedWithin(net.close());
      local.stop();
    }
  }, 120_000);
});
