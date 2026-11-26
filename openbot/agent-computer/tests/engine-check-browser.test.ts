import { afterEach, describe, expect, test } from "bun:test";
import { createServer, type IncomingMessage } from "node:http";
import type { Page } from "playwright";
import { createEngineChecker } from "../src/engine-check";
import {
  type EgressPolicy,
  setEgressPolicy,
  setEgressResolver,
  startEgressFilter,
  stopEgressFilter,
} from "../src/egress";

/**
 * Firefox and WebKit as read-only page checks (D156), behind the same egress filter as a Bot's Chromium.
 *
 * Each engine is launched the way a check launches it, with the filter in front, and the cases are those
 * of `private-network-browser.test.ts`: this computer's own loopback (by address, by name and by a name
 * that resolves to it, with the home-network switch off and on), the home network, cloud metadata, and a
 * public page that reaches for the home network by an image, a script and a redirect. Each counts what
 * reached a server on this machine and what the upstream stand-in was asked for, so a refusal that
 * connected first would fail it. The last cases are that nothing is shared between checks.
 *
 * Asked for by name: it launches real Firefox and WebKit.
 *
 *   cd agent-computer && bunx playwright install firefox webkit
 *   OPENBOT_COMPUTER_BROWSER=1 bun test tests/engine-check-browser.test.ts
 */
const asked = process.env.OPENBOT_COMPUTER_BROWSER === "1";
const BOT = "engine-check-test";
/** Whether this host has an IPv6 loopback; the [::1] case is skipped where it has none. */
const ipv6 = (() => {
  try {
    Bun.listen({ hostname: "::1", port: 0, socket: { data() {} } }).stop(true);
    return true;
  } catch {
    return false;
  }
})();
const blocked: EgressPolicy = { mode: "allow_all", rules: [] };
const switchedOn: EgressPolicy = {
  mode: "allow_all",
  rules: [],
  allowPrivateNetwork: true,
};

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

/** An upstream proxy standing in for the internet: public.test reaches for the home network three ways. */
async function internet(localPort: number) {
  const seen: string[] = [];
  const server = createServer((request: IncomingMessage, response) => {
    const url = request.url ?? "";
    seen.push(url);
    if (url === "http://public.test/") {
      response
        .writeHead(200, {
          "content-type": "text/html",
          "set-cookie": "from_check=1; Path=/",
        })
        .end(
          `<!doctype html><body><img src="http://192.168.1.1/pixel.png"><script>
            window.results = {};
            const settle = (n, p) => p.then(() => (results[n] = "sent"), () => (results[n] = "failed"));
            settle("router", fetch("http://192.168.1.1/api", { mode: "no-cors" }));
            settle("local", fetch("http://127.0.0.1:${localPort}/", { mode: "no-cors" }));
            window.webrtc = typeof RTCPeerConnection;
          </script>the page</body>`,
        );
      return;
    }
    if (url === "http://public.test/redirect") {
      response.writeHead(302, { location: "http://192.168.1.1/admin" }).end();
      return;
    }
    if (url === "http://public.test/cookie")
      response.end(`cookie:${request.headers.cookie ?? "none"}`);
    else response.end(`the internet answered ${url}`);
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

async function visit(page: Page, url: string) {
  try {
    const response = await page.goto(url, { timeout: 15_000 });
    return {
      status: response?.status() ?? 0,
      refused: response?.headers()["x-openbot-egress"] === "refused",
      text: ((await page.textContent("body")) ?? "").trim(),
    };
  } catch (error) {
    return { status: 0, refused: false, text: String(error).split("\n")[0] };
  }
}

describe.skipIf(!asked)("Firefox and WebKit page checks", () => {
  afterEach(async () => {
    await stopEgressFilter();
    setEgressResolver(null);
  });

  for (const engine of ["firefox", "webkit"] as const) {
    test(`${engine}: this computer, the home network and cloud metadata are refused with the switch off and on, and none connected`, async () => {
      const local = origin();
      await startEgressFilter({ env: {} });
      setEgressResolver(async (host) => {
        if (host === "nas.test" || host === "localhost") return ["127.0.0.1"];
        throw new Error(`no such host ${host}`);
      });
      const checker = createEngineChecker();
      try {
        for (const policy of [blocked, switchedOn]) {
          setEgressPolicy(BOT, policy);
          const outcomes = await checker.check(BOT, engine, async (page) => {
            const results: Record<string, unknown> = {};
            for (const target of [
              `http://127.0.0.1:${local.port}/`,
              `http://localhost:${local.port}/`,
              `http://nas.test:${local.port}/`,
              "http://192.168.1.1/",
              ...(ipv6 ? [`http://[::1]:${local.port}/`] : []),
              "http://169.254.169.254/latest/meta-data/",
            ]) {
              const outcome = await visit(page, target);
              results[target] = {
                status: outcome.status,
                refused: outcome.refused,
              };
            }
            return results;
          });
          for (const [target, outcome] of Object.entries(outcomes)) {
            // The home network is lifted by the switch (D73) and the rest never is; with the switch on
            // there is no host answering at 192.168.1.1 in a test, so only the others are pinned.
            if (policy === switchedOn && target === "http://192.168.1.1/")
              continue;
            expect({ target, outcome }).toEqual({
              target,
              outcome: { status: 403, refused: true },
            });
          }
        }
        // A WebSocket to this computer is refused too, and never connected.
        const socket = await checker.check(BOT, engine, async (page) => {
          await page
            .goto("http://127.0.0.1:1/", { timeout: 5_000 })
            .catch(() => null);
          return page.evaluate(
            (port) =>
              new Promise<string>((resolve) => {
                // A browser may refuse to even construct it; that is a refusal too.
                try {
                  const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
                  ws.onopen = () => resolve("open");
                  ws.onerror = () => resolve("refused");
                } catch {
                  resolve("refused");
                }
                setTimeout(() => resolve("refused"), 8000);
              }),
            local.port,
          );
        });
        expect(socket).toBe("refused");
        expect(local.reached()).toBe(0);
      } finally {
        local.stop();
      }
    }, 180_000);

    test(`${engine}: a public page cannot reach the home network by an image, a script, a redirect or WebRTC`, async () => {
      const local = origin();
      const net = await internet(local.port);
      await startEgressFilter({
        env: { EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${net.port}` },
      });
      setEgressPolicy(BOT, blocked);
      const checker = createEngineChecker();
      try {
        const loaded = await checker.check(BOT, engine, async (page) => {
          const first = await visit(page, "http://public.test/");
          await page.waitForFunction(
            () =>
              Object.keys(
                (window as unknown as { results?: object }).results ?? {},
              ).length === 2,
            undefined,
            { timeout: 15_000 },
          );
          const webrtc = await page.evaluate(
            () => (window as unknown as { webrtc: string }).webrtc,
          );
          const redirect = await visit(page, "http://public.test/redirect");
          return { first, webrtc, redirect };
        });
        expect(loaded.first.status).toBe(200);
        expect(loaded.first.text).toContain("the page");
        expect(loaded.webrtc).toBe("undefined");
        expect(loaded.redirect.refused).toBe(true);
        expect(local.reached()).toBe(0);
        // The proxy standing in for the internet was never asked for a home-network address.
        expect(
          net.seen.filter(
            (url) => url.includes("192.168.1.1") || url.includes("127.0.0.1"),
          ),
        ).toEqual([]);
        expect(net.seen).toContain("http://public.test/");
      } finally {
        local.stop();
        await net.close();
      }
    }, 180_000);

    test(`${engine}: nothing is kept between checks`, async () => {
      const net = await internet(0);
      await startEgressFilter({
        env: { EGRESS_PROXY_DEFAULT: `http://127.0.0.1:${net.port}` },
      });
      setEgressPolicy(BOT, blocked);
      const checker = createEngineChecker();
      try {
        await checker.check(BOT, engine, (page) =>
          visit(page, "http://public.test/"),
        );
        const second = await checker.check(BOT, engine, async (page) => ({
          text: (await visit(page, "http://public.test/cookie")).text,
          cookies: await page.context().cookies(),
        }));
        expect(second.text).toBe("cookie:none");
        expect(second.cookies).toEqual([]);
      } finally {
        await net.close();
      }
    }, 180_000);
  }
});
