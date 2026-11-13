import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Pages that move while they are read, and calls that overlap, against the real process and a real
 * Chromium.
 *
 * What settle.test.ts and turns.test.ts cannot say is that Chromium behaves the way they assume: that
 * a script's redirect really surfaces as "Execution context was destroyed" in the middle of a read,
 * that `document.open()` really cancels the load `goto` is waiting for, and that the answers the
 * computer gives are the ones the server maps. This starts `index.ts`, as the headed test does, and
 * talks to the port it opens, with the pages served from 127.0.0.1.
 *
 * Asked for by name, like page-links-browser.test.ts: it launches a real Chromium, which the machine
 * running `bun test` is not required to have.
 *
 *   cd agent-computer && bunx playwright install chromium
 *   OPENBOT_COMPUTER_BROWSER=1 bun test tests/navigation-settle-browser.test.ts
 */
const asked = process.env.OPENBOT_COMPUTER_BROWSER === "1";
const TOKEN = "navigation-settle-test-token";
const BOT = "settle";

/** What the environment is set to for this file, and what it was, so the next file finds it as it was. */
const SET = [
  "COMPUTER_TOKEN",
  "COMPUTER_BROWSER_MODE",
  "PORT",
  "PROFILES_DIR",
  "WORKSPACE_DIR",
  "EGRESS_POLICY_REQUIRED",
  "NAVIGATION_TIMEOUT_MS",
  "COMPUTER_TURN_WAIT_MS",
] as const;
const before: Partial<Record<(typeof SET)[number], string | undefined>> = {};

/** The load of a page that never finishes is given up on after this long. */
const LOAD_TIMEOUT_MS = 3_000;
/** A call that cannot get its turn gives up after this long. */
const TURN_WAIT_MS = 1_500;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        reject(new Error("The port probe did not return a TCP address."));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });
}

const html = (body: string, head = "") =>
  new Response(
    `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

let base = "";
let root = "";
let origin = "";
let site: ReturnType<typeof Bun.serve> | undefined;

function api(path: string, init?: RequestInit) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-openbot-bot-id": BOT,
      "x-openbot-computer-token": TOKEN,
      ...(init?.headers ?? {}),
    },
  });
}

type Answer = {
  status: number;
  elapsedMs: number;
  body: Record<string, unknown>;
};

async function answer(response: Promise<Response>): Promise<Answer> {
  const started = Date.now();
  const resolved = await response;
  return {
    status: resolved.status,
    elapsedMs: Date.now() - started,
    body: (await resolved.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

/**
 * A browser with nothing running in it. A page that was refused for never holding still is still
 * navigating, and would hijack the next address; stopping the computer closes it, and the snapshot
 * that follows opens a new one (a stopped computer asks for a snapshot before it is acted on again).
 */
async function freshBrowser() {
  await api("/computers/stop", { method: "POST" });
  expect((await snapshot()).status).toBe(200);
}

const navigate = (path: string) =>
  answer(
    api("/navigate", {
      method: "POST",
      body: JSON.stringify({ url: `${origin}${path}` }),
    }),
  );
const snapshot = () => answer(api("/snapshot", { method: "POST" }));
const read = () => answer(api("/read"));

beforeAll(async () => {
  if (!asked) return;
  root = await mkdtemp(join(tmpdir(), "agent-computer-settle-"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  for (const name of SET) before[name] = process.env[name];
  process.env.COMPUTER_TOKEN = TOKEN;
  process.env.COMPUTER_BROWSER_MODE = "headless";
  process.env.PORT = String(port);
  process.env.EGRESS_POLICY_REQUIRED = "0";
  process.env.NAVIGATION_TIMEOUT_MS = String(LOAD_TIMEOUT_MS);
  process.env.COMPUTER_TURN_WAIT_MS = String(TURN_WAIT_MS);
  process.env.PROFILES_DIR = join(root, "profiles");
  process.env.WORKSPACE_DIR = join(root, "workspace");
  await mkdir(process.env.PROFILES_DIR, { recursive: true });

  site = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    // The page that never loads holds a response open on purpose; Bun's own limit would cut it first.
    idleTimeout: 120,
    fetch(request) {
      const { pathname, searchParams } = new URL(request.url);
      const delay = Number(searchParams.get("d") ?? 0);
      switch (pathname) {
        case "/landing":
          return html("<h1>Landing page</h1><button>Search</button>");
        // A script redirects the moment the page is parsed: goto answers at DOMContentLoaded, and the
        // redirect lands while the read is running.
        case "/redirect-fast":
          return html(
            "<p>The first page</p>",
            "<script>location.replace('/landing')</script>",
          );
        // The same, `d` ms later: after a read that is quick enough to finish on the first page.
        case "/redirect-late":
          return html(
            "<p>The first page</p><button>First</button>",
            `<script>setTimeout(() => location.replace('/landing'), ${delay})</script>`,
          );
        // Two hops, then a page that stays.
        case "/hop": {
          const n = Number(searchParams.get("n") ?? 0);
          return html(
            `<p>Hop ${n}</p>`,
            `<script>setTimeout(() => location.replace(${JSON.stringify(n >= 2 ? "/landing" : `/hop?n=${n + 1}`)}), 40)</script>`,
          );
        }
        // The whole document rewritten while goto is still waiting for its load: Chromium cancels the
        // load with net::ERR_ABORTED although the page is there.
        case "/rewrite":
          return html(
            "<p>Before the rewrite</p>",
            `<script>setTimeout(() => { document.open(); document.write('<title>w</title><body><h1>After the rewrite</h1><button>Go</button></body>'); document.close(); }, ${delay || 50})</script>`,
          );
        // The body replaced, as a framework does once its script has run, a few times and then for good.
        case "/swap-body":
          return html(
            "<p>Swap 0</p>",
            "<script>let n = 0; const t = setInterval(() => { document.documentElement.replaceChildren(document.createElement('body')); document.body.innerHTML = '<h1>Swap ' + (++n) + '</h1><button>b</button>'; if (n >= 4) clearInterval(t); }, 100)</script>",
          );
        // Never stops: every 150 ms it goes to a new address.
        case "/loop":
          return html(
            "<p>Looping</p>",
            "<script>setTimeout(() => location.replace('/loop?t=' + Date.now()), 150)</script>",
          );
        // A document whose end never arrives, so the load is given up on.
        case "/never-loads":
          return new Response(
            new ReadableStream({
              async start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    "<!doctype html><title>slow</title><body>starting",
                  ),
                );
                await Bun.sleep(60_000);
                controller.close();
              },
            }),
            { headers: { "content-type": "text/html" } },
          );
        // An answer that takes its time, so a load of it is still pending when another navigation starts.
        case "/slow-response":
          return Bun.sleep(600).then(() =>
            html("<h1>Slow response</h1><button>Go</button>"),
          );
        default:
          return html("<p>ok</p>");
      }
    },
  });
  origin = `http://127.0.0.1:${site.port}`;
  await import(`../src/index?settle-browser=${Date.now()}`);
});

afterAll(async () => {
  if (!asked) return;
  await api("/computers/stop", { method: "POST" }).catch(() => undefined);
  site?.stop(true);
  for (const name of SET) {
    if (before[name] === undefined) delete process.env[name];
    else process.env[name] = before[name];
  }
  await rm(root, { recursive: true, force: true });
}, 30_000);

describe.skipIf(!asked)("a page that moves right after it loads", () => {
  test("a redirect from a script is followed, and the page it ends on is returned", async () => {
    const result = await navigate("/redirect-fast");
    expect(result.status).toBe(200);
    expect(result.body.url).toBe(`${origin}/landing`);
    expect(String(result.body.text)).toContain("Landing page");
    expect(String(result.body.text)).not.toContain("The first page");
  }, 30_000);

  test("a redirect that fires after a quick read would have finished is still followed", async () => {
    // Before the quiet pause this returned the first page: the read finished in a few milliseconds
    // and the redirect landed after it.
    const result = await navigate("/redirect-late?d=120");
    expect(result.status).toBe(200);
    expect(result.body.url).toBe(`${origin}/landing`);
    expect(String(result.body.text)).toContain("Landing page");
  }, 30_000);

  test("several hops in a row end on the page that stays", async () => {
    const result = await navigate("/hop?n=0");
    expect(result.status).toBe(200);
    expect(result.body.url).toBe(`${origin}/landing`);
  }, 30_000);

  test("a navigation that is cancelled because the page rewrote its own document returns the page", async () => {
    // goto answered "net::ERR_ABORTED" for this in a few percent of runs, with the page perfectly
    // fine. Several tries, so a run that happened to miss the window does not pass it by luck.
    for (const delay of [20, 45, 50, 60, 70]) {
      const result = await navigate(`/rewrite?d=${delay}`);
      expect(result.status).toBe(200);
      expect(String(result.body.text)).toContain("After the rewrite");
    }
  }, 60_000);

  test("a page that swaps its body for a while returns the body it ended with", async () => {
    const result = await navigate("/swap-body");
    expect(result.status).toBe(200);
    expect(String(result.body.text)).toContain("Swap 4");
  }, 30_000);

  test("a snapshot and a read right after, on a page still moving, work", async () => {
    // Before, a read made while a script's redirect was landing failed with "Execution context was
    // destroyed" in about one of five tries. Repeated, so one lucky run is not a pass.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await navigate(`/redirect-late?d=${20 + attempt * 6}`);
      const [shot, page] = await Promise.all([snapshot(), read()]);
      expect(shot.status).toBe(200);
      expect(page.status).toBe(200);
    }
  }, 120_000);
});

describe.skipIf(!asked)("a page that never holds still, or never loads", () => {
  test("one that keeps navigating is refused in plain words, within the bound, and the computer carries on", async () => {
    const result = await navigate("/loop");
    expect(result.status).toBe(502);
    expect(result.body.pageNotReady).toBe(true);
    const message = String(result.body.error);
    expect(message).toContain("kept reloading or redirecting");
    expect(message).not.toContain("element");
    expect(message).not.toContain("Timeout");
    // Four attempts and a quarter of a second each, well inside what the server allows a call.
    expect(result.elapsedMs).toBeLessThan(10_000);

    const after = await snapshot();
    expect(after.status).toBe(200);
    await freshBrowser();
  }, 60_000);

  test("an address opened while that page is still navigating is never answered with the wrong page, nor with an address in the message", async () => {
    // The page the Bot left behind goes on redirecting, and its navigation can cut the next load
    // short. Either the new address loads, or the Bot is told in plain words that it did not; what it
    // must never get is the looping page handed over as the page it asked for.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await navigate("/loop");
      const result = await navigate("/slow-response");
      if (result.status === 200) {
        expect(result.body.url).toBe(`${origin}/slow-response`);
      } else {
        expect(result.status).toBe(502);
        expect(result.body.pageNotReady).toBe(true);
        const message = String(result.body.error);
        expect(message).not.toContain("/loop");
        expect(message).not.toContain("Call log");
        expect(message).not.toContain(origin);
      }
    }
    await freshBrowser();
  }, 90_000);

  test("one whose load never finishes says so, and does not call it a missing element", async () => {
    const result = await navigate("/never-loads");
    expect(result.status).toBe(502);
    expect(result.body.pageNotReady).toBe(true);
    const message = String(result.body.error);
    expect(message).toContain("did not finish loading within 3 seconds");
    expect(message).not.toContain("element");
    expect(message).not.toContain("Timeout");
    // Nor Playwright's call log, which carries the address.
    expect(message).not.toContain("Call log");
    expect(message).not.toContain(origin);

    const after = await snapshot();
    expect(after.status).toBe(200);
  }, 60_000);
});

describe.skipIf(!asked)("calls that overlap on one Bot", () => {
  test("a read that arrives while a navigation is still moving waits for it and sees the page it ended on", async () => {
    // Before, it ran beside the navigation and described the first page.
    const moving = navigate("/redirect-late?d=200");
    await Bun.sleep(100);
    const page = await read();
    expect((await moving).status).toBe(200);
    expect(page.status).toBe(200);
    expect(page.body.url).toBe(`${origin}/landing`);
    expect(String(page.body.text)).toContain("Landing page");
  }, 30_000);

  test("a snapshot that arrives during a navigation waits its turn, and is stamped after it", async () => {
    const moving = navigate("/hop?n=0");
    await Bun.sleep(60);
    const shot = await snapshot();
    const finished = await moving;
    expect(finished.status).toBe(200);
    expect(shot.status).toBe(200);
    expect(shot.body.url).toBe(`${origin}/landing`);
  }, 30_000);

  test("a call that cannot get its turn in time is told the computer is busy, not that it cannot be reached", async () => {
    // The navigation to a page that never loads holds the page for 3 s; the snapshot waits 1.5 s.
    const stuck = navigate("/never-loads");
    await Bun.sleep(200);
    const refused = await snapshot();
    expect(refused.status).toBe(503);
    expect(refused.body.busy).toBe(true);
    const message = String(refused.body.error);
    expect(message).toContain("still busy with an earlier action");
    expect(message).not.toContain("reached");
    expect(refused.elapsedMs).toBeGreaterThanOrEqual(TURN_WAIT_MS - 200);
    expect(refused.elapsedMs).toBeLessThan(LOAD_TIMEOUT_MS);

    await stuck;
    // And the computer was never the problem: the next call is answered.
    expect((await snapshot()).status).toBe(200);
  }, 30_000);
});
