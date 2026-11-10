import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser } from "playwright";
import { parseAriaSnapshot } from "../src/aria-snapshot";
import {
  collectPageLinks,
  composePageText,
  PAGE_LINK_LIMIT,
  pageBaseUrl,
} from "../src/page-links";
import { SECRET_ATTRIBUTE } from "../src/secret-masking";

/**
 * The addresses of a page's links, read from a real page.
 *
 * What `page-links.test.ts` and `aria-snapshot.test.ts` cannot say is that the browser gives what
 * they were written against: the `href` as the page wrote it, the base a `<base href>` moves, a link
 * inside a frame, and the one the person typed a secret into. This checks those on 127.0.0.1.
 *
 * Asked for by name, like `sign-in.test.ts`: it launches a real Chromium, which the machine running
 * `bun test` is not required to have, so Playwright is imported only then.
 *
 *   cd agent-computer && bunx playwright install chromium
 *   OPENBOT_COMPUTER_BROWSER=1 bun test tests/page-links-browser.test.ts
 */
const asked = process.env.OPENBOT_COMPUTER_BROWSER === "1";
const LIMIT = 6000;
const TOKEN = "tok_live_abc123";
let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
let origin = "";

const html = (head: string, body: string) =>
  new Response(
    `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const SHOP = `
  <header><a href="/">Home</a> <a href="/cart">Cart</a></header>
  <nav><a href="/category/gifts">Gifts</a></nav>
  <main>
    <h1>Gift ideas</h1>
    <p><a href="/product/vase?utm_source=news&color=blue">Blue vase</a> 19,90 EUR</p>
    <p><a href="/product/vase?color=blue"><img alt="Blue vase picture" src="/x.png"></a></p>
    <p><a href="product/lamp">Brass lamp</a> 42,00 EUR</p>
    <p><a href="https://other.example/deal">External deal</a></p>
    <p><a href="javascript:alert(1)">Script link</a>
       <a href="data:text/html,hi">Data link</a>
       <a href="mailto:a@b.it">Mail link</a>
       <a href="#reviews">Jump to reviews</a>
       <a href="/hidden" style="display:none">Hidden link</a></p>
    <p><a href="/account/reset?t=${TOKEN}" id="secret-link"><input id="token" value="${TOKEN}"> Reset</a></p>
  </main>
  <footer><a href="/terms">Terms</a></footer>
  <iframe srcdoc="<a href='/inframe'>Inframe link</a> <a href='https://frame.example/x'>Inframe absolute</a>"></iframe>`;

beforeAll(async () => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/shop/results") return html("", SHOP);
      if (pathname === "/based/page")
        return html(
          '<base href="/catalog/">',
          '<a href="item/1">Item one</a> <a href="#top">Top</a>',
        );
      if (pathname === "/crowded")
        return html(
          "",
          Array.from(
            { length: 400 },
            (_, index) => `<a href="/p/${index}">Product ${index}</a>`,
          ).join(" "),
        );
      return new Response("not found", { status: 404 });
    },
  });
  origin = `http://127.0.0.1:${server.port}`;
  if (!asked) return;
  const { chromium } = await import("playwright");
  browser = await chromium.launch();
});

afterAll(async () => {
  server?.stop(true);
  await browser?.close();
});

async function open(path: string) {
  const tab = await browser.newPage();
  await tab.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  return tab;
}

/** The text the way `readablePageText` builds it, without the server around it. */
async function readText(tab: Awaited<ReturnType<typeof open>>) {
  const body = await tab.evaluate(() => document.body.innerText);
  const { base, links } = await collectPageLinks(tab);
  return composePageText(body.trim(), links, base, LIMIT);
}

describe.skipIf(!asked)("the page text ends with its links' addresses", () => {
  test("relative links are absolute, and what is not a web address is not there", async () => {
    const tab = await open("/shop/results");
    const { text } = await readText(tab);
    await tab.close();

    expect(text).toContain(`- ${origin}/product/vase?color=blue | Blue vase`);
    // `product/lamp` is relative to the page's directory, `/shop/`.
    expect(text).toContain(`- ${origin}/shop/product/lamp | Brass lamp`);
    expect(text).toContain("- https://other.example/deal | External deal");
    // No scheme but http(s), no anchor on this page, no link nobody can see.
    for (const gone of [
      "javascript:",
      "data:",
      "mailto:",
      "#reviews",
      "/hidden",
    ]) {
      expect(text).not.toContain(gone);
    }
    // Tracking left off, and the same product listed once.
    expect(text).not.toContain("utm_source");
    expect(text.match(/\/product\/vase/g)).toHaveLength(1);
  });

  test("the header, navigation and footer come after the content", async () => {
    const tab = await open("/shop/results");
    const { text } = await readText(tab);
    await tab.close();
    const at = (needle: string) => text.indexOf(`${origin}${needle} |`);
    expect(at("/product/vase?color=blue")).toBeGreaterThan(0);
    for (const chrome of ["/", "/cart", "/category/gifts", "/terms"]) {
      expect(at(chrome)).toBeGreaterThan(at("/shop/product/lamp"));
    }
  });

  test("a link that holds a field a secret was typed into is left out", async () => {
    const tab = await open("/shop/results");
    await tab
      .locator("#token")
      .evaluate(
        (element, attribute) => element.setAttribute(attribute, "true"),
        SECRET_ATTRIBUTE,
      );
    const { text } = await readText(tab);
    await tab.close();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("/account/reset");
    expect(text).toContain("Blue vase");
  });

  test("a <base href> moves what a relative link is relative to", async () => {
    const tab = await open("/based/page");
    const { text } = await readText(tab);
    await tab.close();
    expect(text).toContain(`- ${origin}/catalog/item/1 | Item one`);
    // An anchor is an anchor, here too: it is not listed as somewhere to go.
    expect(text).not.toContain("#top");
  });

  test("lists no more than the limit and stays inside the text limit", async () => {
    const tab = await open("/crowded");
    const { text, truncated } = await readText(tab);
    await tab.close();
    const lines = text.split("\n").filter((line) => line.startsWith("- "));
    expect(lines.length).toBeLessThanOrEqual(PAGE_LINK_LIMIT);
    expect(text.length).toBeLessThanOrEqual(LIMIT);
    expect(text).toMatch(/\(\d+ more links not listed\)$/);
    expect(truncated).toBe(true);
  });
});

describe.skipIf(!asked)("a snapshot's links show their address", () => {
  test("a relative link is resolved against the page, a frame's only when absolute", async () => {
    const tab = await open("/shop/results");
    const yaml = await tab.ariaSnapshot({ mode: "ai" });
    const { elements } = parseAriaSnapshot(yaml, await pageBaseUrl(tab));
    await tab.close();

    const links = Object.fromEntries(
      elements
        .filter((element) => element.role === "link")
        .map((element) => [element.name || element.ref, element.href]),
    );
    expect(links["Blue vase"]).toBe(`${origin}/product/vase?color=blue`);
    expect(links["Brass lamp"]).toBe(`${origin}/shop/product/lamp`);
    expect(links["External deal"]).toBe("https://other.example/deal");
    // Still in the snapshot, because they can be clicked, and with no address.
    for (const name of ["Script link", "Jump to reviews", "Inframe link"]) {
      expect(name in links).toBe(true);
      expect(links[name]).toBeUndefined();
    }
    // The frame's own address is not in the snapshot, so a relative link there has none.
    expect(links["Inframe absolute"]).toBe("https://frame.example/x");
  });

  test("with a <base href> the snapshot resolves against it", async () => {
    const tab = await open("/based/page");
    const yaml = await tab.ariaSnapshot({ mode: "ai" });
    const { elements } = parseAriaSnapshot(yaml, await pageBaseUrl(tab));
    await tab.close();
    expect(elements.find((entry) => entry.name === "Item one")?.href).toBe(
      `${origin}/catalog/item/1`,
    );
  });
});
