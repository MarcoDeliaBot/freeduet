import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `/read-page` (D127) against the real process and a real Chromium, with the pages served from this
 * machine's own loopback (no address that nobody owns is dialled).
 *
 * Asked for by name, like navigation-settle-browser.test.ts, which launches a real Chromium:
 *
 *   cd agent-computer && bunx playwright install chromium
 *   OPENBOT_COMPUTER_BROWSER=1 bun test tests/read-page-browser.test.ts
 *
 * In this sandbox: PLAYWRIGHT_BROWSERS_PATH=/tmp/pn-pw-browsers.
 */
const asked = process.env.OPENBOT_COMPUTER_BROWSER === "1";
const TOKEN = "read-page-test-token";
const BOT = "readpage";

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
const LOAD_TIMEOUT_MS = 3_000;

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

const html = (body: string, title = "t", head = "") =>
  new Response(
    `<!doctype html><html><head><title>${title}</title>${head}</head><body>${body}</body></html>`,
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

type Answer = { status: number; body: Record<string, unknown> };
async function readPage(path: string, limit?: number): Promise<Answer> {
  const response = await api("/read-page", {
    method: "POST",
    body: JSON.stringify({
      url: path.startsWith("http") ? path : `${origin}${path}`,
      ...(limit === undefined ? {} : { limit }),
    }),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

beforeAll(async () => {
  if (!asked) return;
  root = await mkdtemp(join(tmpdir(), "agent-computer-readpage-"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  for (const name of SET) before[name] = process.env[name];
  process.env.COMPUTER_TOKEN = TOKEN;
  process.env.COMPUTER_BROWSER_MODE = "headless";
  process.env.PORT = String(port);
  process.env.EGRESS_POLICY_REQUIRED = "0";
  process.env.NAVIGATION_TIMEOUT_MS = String(LOAD_TIMEOUT_MS);
  process.env.PROFILES_DIR = join(root, "profiles");
  process.env.WORKSPACE_DIR = join(root, "workspace");
  await mkdir(process.env.PROFILES_DIR, { recursive: true });

  site = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 120,
    fetch(request) {
      const { pathname } = new URL(request.url);
      switch (pathname) {
        case "/one":
          return html(
            "<h1>Page one</h1><p>First page text</p><a href='/two'>Go to two</a>",
            "One",
          );
        case "/two":
          return html("<h1>Page two</h1><p>Second page text</p>", "Two");
        case "/long":
          return html(`<p>${"word ".repeat(5000)}</p>`, "Long");
        case "/redirect":
          return html(
            "<p>moving</p>",
            "Moving",
            "<script>location.replace('/two')</script>",
          );
        case "/check":
          return html(
            "<p>Please verify you are human</p><button>I'm not a robot</button>",
            "Check",
          );
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
        default:
          return html("<p>ok</p>");
      }
    },
  });
  origin = `http://127.0.0.1:${site.port}`;
  await import(`../src/index?read-page-browser=${Date.now()}`);
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

describe.skipIf(!asked)("one page of a batch", () => {
  test("opens the page in the Bot's tab and returns its title, text and links", async () => {
    const result = await readPage("/one");
    expect(result.status).toBe(200);
    expect(result.body.title).toBe("One");
    expect(result.body.url).toBe(`${origin}/one`);
    expect(String(result.body.text)).toContain("First page text");
    expect(String(result.body.text)).toContain(`${origin}/two`);
    expect(result.body.truncated).toBe(false);
  });

  test("pages read one after another each give their own text, and the tab ends on the last", async () => {
    const first = await readPage("/one");
    const second = await readPage("/two");
    expect(String(first.body.text)).toContain("First page text");
    expect(String(second.body.text)).toContain("Second page text");
    expect(String(second.body.text)).not.toContain("First page text");
    const open = await api("/read");
    expect(((await open.json()) as { url: string }).url).toBe(`${origin}/two`);
  });

  test("text is cut to the limit asked for and says so; the limit cannot be raised past 6,000", async () => {
    const small = await readPage("/long", 1000);
    expect(String(small.body.text).length).toBeLessThanOrEqual(1000);
    expect(small.body.truncated).toBe(true);
    const large = await readPage("/long", 100_000);
    expect(String(large.body.text).length).toBeLessThanOrEqual(6000);
    expect(large.body.truncated).toBe(true);
    expect((await readPage("/long", 10)).status).toBe(400);
  });

  test("a redirect is followed and the page it lands on is read", async () => {
    const result = await readPage("/redirect");
    expect(result.status).toBe(200);
    expect(result.body.url).toBe(`${origin}/two`);
    expect(String(result.body.text)).toContain("Second page text");
  });

  test("a human check is reported as not read, and no request for help is opened", async () => {
    const result = await readPage("/check");
    expect(result.status).toBe(200);
    expect(result.body.text).toBe("");
    expect(String(result.body.notRead)).toContain("computer_navigate");
    const control = await api("/control");
    const state = (await control.json()) as { request?: unknown };
    expect(state.request ?? null).toBeNull();
  });

  test(
    "a page that never finishes loading fails by itself, and the next page reads",
    async () => {
      const slow = await readPage("/never-loads");
      expect(slow.status).toBe(502);
      expect(String(slow.body.error).length).toBeGreaterThan(0);
      // A stopped computer asks for a snapshot before it is acted on again, as after any navigation.
      await api("/computers/stop", { method: "POST" });
      expect((await api("/snapshot", { method: "POST" })).status).toBe(200);
      const next = await readPage("/two");
      expect(next.status).toBe(200);
      expect(String(next.body.text)).toContain("Second page text");
    },
    { timeout: 30_000 },
  );

  test("an address that is not a web page is a 400 and nothing is opened", async () => {
    for (const url of ["file:///etc/passwd", "javascript:1", "", "nope"]) {
      const response = await api("/read-page", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      expect(response.status).toBe(400);
    }
  });
});
