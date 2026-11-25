/**
 * Read-only page checks in Firefox and WebKit (D156).
 *
 * `computer_read_pages` may name an engine so a member can see how a page reads in the engines that
 * Chromium is not (WebKit is what Safari uses). This module is the whole of what that adds on the
 * computer, and it is built so that it can only ever be as safe as the Chromium path:
 *
 *  - Every load goes through the network-policy filter (`egress.ts`) as a proxy carrying the Bot's id,
 *    exactly as a Bot's Chromium does, so the Bot's own policy, the home-network switch and the
 *    refusal of this computer's own loopback and of cloud metadata apply unchanged. With no filter
 *    running there is no engine check at all: there would be nothing to judge the load.
 *  - Nothing is shared with the Bot's Chromium. Each check launches its own browser with a fresh
 *    in-memory context (no profile directory, no stored cookies, no downloads, no service workers) and
 *    closes it afterwards, so no login of the Bot's can reach another engine and nothing a page in
 *    another engine sets survives the check.
 *  - How a browser handles its proxy settings differs by engine (Playwright forces Chromium to send
 *    loopback through the proxy; for the others that is the browser's own behaviour), and this code
 *    cannot know that from reading it. So an engine is used only after it has PROVEN it, in this
 *    process, against this filter: a canary Bot with the default policy is sent to a server on this
 *    computer's loopback and to a home-network address, and the engine is enabled only if the filter
 *    refused both (HTTP 403 with the filter's header) and the server was never reached. An engine
 *    that fails the canary is refused for every check until the process restarts, with the reason.
 *  - WebRTC can send UDP past a proxy. It is removed from the page before any script runs and the canary
 *    checks that it is gone; Firefox has it switched off as well.
 *
 * Nothing here clicks, types or fills: a check opens an address and reads the page, which is all the
 * tool offers.
 */
import {
  type Browser,
  type BrowserContext,
  firefox,
  type Page,
  webkit,
} from "playwright";
import type { OtherEngine } from "./browser-engine";
import { egressFilterRunning, egressFor, setEgressPolicy } from "./egress";

const VIEWPORT = { width: 1280, height: 800 };
const LAUNCH_TIMEOUT_MS = 30_000;
const CANARY_NAV_TIMEOUT_MS = 15_000;
const CANARY_BOT = "engine-canary";

const NAMES: Record<OtherEngine, string> = {
  firefox: "Firefox",
  webkit: "WebKit",
};

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

type Proxy = { server: string; username?: string; password?: string };

async function launch(engine: OtherEngine, proxy: Proxy): Promise<Browser> {
  const options = {
    headless: true,
    timeout: LAUNCH_TIMEOUT_MS,
    proxy,
    handleSIGTERM: false,
    handleSIGINT: false,
    handleSIGHUP: false,
  };
  if (engine === "firefox")
    return firefox.launch({
      ...options,
      firefoxUserPrefs: { "media.peerconnection.enabled": false },
    });
  return webkit.launch(options);
}

/** Removes WebRTC from every document and frame before its own scripts run. */
const WITHOUT_WEBRTC = `(() => {
  for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "mozRTCPeerConnection", "RTCDataChannel"]) {
    try { Object.defineProperty(window, name, { value: undefined, configurable: false, writable: false }); } catch {}
  }
})();`;

async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    acceptDownloads: false,
    serviceWorkers: "block",
    permissions: [],
  });
  await context.addInitScript(WITHOUT_WEBRTC);
  return context;
}

/**
 * Whether this engine, launched as a check launches it, is judged by the filter.
 * Returns a reason when it is not.
 */
async function canary(
  engine: OtherEngine,
  proxy: Proxy,
): Promise<string | undefined> {
  let reached = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      reached += 1;
      return new Response("a service on this computer");
    },
  });
  let browser: Browser | undefined;
  try {
    browser = await launch(engine, proxy);
    const context = await newContext(browser);
    const page = await context.newPage();
    for (const target of [
      `http://127.0.0.1:${server.port}/`,
      "http://192.168.1.1/",
    ]) {
      const response = await page
        .goto(target, { timeout: CANARY_NAV_TIMEOUT_MS })
        .catch(() => null);
      if (
        !response ||
        response.status() !== 403 ||
        response.headers()["x-openbot-egress"] !== "refused"
      )
        return `${target} was not refused by the network filter`;
    }
    if (reached > 0) return "a service on this computer was reached";
    const webrtc = await page
      .evaluate(
        () =>
          typeof (window as unknown as { RTCPeerConnection?: unknown })
            .RTCPeerConnection !== "undefined",
      )
      .catch(() => true);
    if (webrtc) return "WebRTC could not be switched off";
    return undefined;
  } catch (error) {
    return `it could not be started (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`;
  } finally {
    await browser?.close().catch(() => undefined);
    server.stop(true);
  }
}

export function createEngineChecker() {
  // Keyed by the filter this process has now: a filter that restarts is proven again.
  const verdicts = new Map<string, string | null>();
  let line: Promise<unknown> = Promise.resolve();

  async function proven(engine: OtherEngine, proxy: Proxy): Promise<void> {
    const key = `${engine}|${proxy.server}|${proxy.password ?? ""}`;
    if (!verdicts.has(key)) {
      // The canary has a Bot of its own with the default policy, so the home-network switch cannot
      // make the probe look allowed, and nothing of a member's is touched.
      setEgressPolicy(CANARY_BOT, { mode: "allow_all", rules: [] });
      try {
        const canaryProxy = egressFor(CANARY_BOT, process.env);
        const reason = canaryProxy
          ? await canary(engine, canaryProxy)
          : "no network filter";
        // A browser that would not start is tried again next time; an engine that bypassed the filter is not.
        if (reason?.startsWith("it could not be started")) {
          throw new EngineUnavailableError(
            `${NAMES[engine]} is not available on this computer: ${reason}.`,
          );
        }
        verdicts.set(key, reason ?? null);
      } finally {
        setEgressPolicy(CANARY_BOT, null);
      }
    }
    const verdict = verdicts.get(key);
    if (verdict)
      throw new EngineUnavailableError(
        `${NAMES[engine]} is not used on this computer, because it did not pass the network check: ${verdict}.`,
      );
  }

  return {
    /**
     * Run `use` on a page of a fresh, private browser of this engine. One at a time, so a check never
     * competes with another for memory, and the browser is closed whatever `use` does.
     */
    check<T>(
      botId: string,
      engine: OtherEngine,
      use: (page: Page) => Promise<T>,
    ): Promise<T> {
      const run = line.then(async () => {
        if (!egressFilterRunning())
          throw new EngineUnavailableError(
            `${NAMES[engine]} is not used on this computer, because the network filter is not running.`,
          );
        const proxy = egressFor(botId, process.env);
        if (!proxy)
          throw new EngineUnavailableError(
            `${NAMES[engine]} is not used on this computer, because no network filter is set for it.`,
          );
        await proven(engine, proxy);
        let browser: Browser | undefined;
        try {
          browser = await launch(engine, proxy);
          const context = await newContext(browser);
          return await use(await context.newPage());
        } finally {
          await browser?.close().catch(() => undefined);
        }
      });
      line = run.catch(() => undefined);
      return run;
    },
  };
}

export type EngineChecker = ReturnType<typeof createEngineChecker>;
