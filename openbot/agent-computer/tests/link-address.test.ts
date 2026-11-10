import { describe, expect, test } from "bun:test";
import { LINK_ADDRESS_LIMIT, linkAddress } from "../src/link-address";

const PAGE = "https://shop.example/a/b/page?x=1";

describe("linkAddress: what a link is resolved to", () => {
  test("a relative link becomes an absolute address on the page's own site", () => {
    expect(linkAddress("/rel/product?x=1", PAGE)).toBe(
      "https://shop.example/rel/product?x=1",
    );
    expect(linkAddress("sibling", PAGE)).toBe(
      "https://shop.example/a/b/sibling",
    );
    expect(linkAddress("../up", PAGE)).toBe("https://shop.example/a/up");
    expect(linkAddress("//cdn.example/x", PAGE)).toBe("https://cdn.example/x");
    expect(linkAddress("?page=2", PAGE)).toBe(
      "https://shop.example/a/b/page?page=2",
    );
  });

  test("is relative to the base it is given, which a <base href> moves", () => {
    expect(linkAddress("item/1", "https://shop.example/catalog/")).toBe(
      "https://shop.example/catalog/item/1",
    );
  });

  test("an absolute link is kept, and normalised the way a browser would", () => {
    expect(linkAddress("https://other.example/Path?q=1", PAGE)).toBe(
      "https://other.example/Path?q=1",
    );
    expect(linkAddress("HTTP://Other.Example", PAGE)).toBe(
      "http://other.example/",
    );
  });

  test("without a base only an absolute address can be shown", () => {
    expect(linkAddress("https://other.example/x")).toBe(
      "https://other.example/x",
    );
    expect(linkAddress("/relative")).toBeNull();
  });

  test("a fragment is kept on a link to another page", () => {
    expect(linkAddress("/other#section", PAGE)).toBe(
      "https://shop.example/other#section",
    );
  });
});

describe("linkAddress: what is not an address to open", () => {
  test.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:void(0)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD4=",
    "blob:https://shop.example/0f6c",
    "mailto:someone@example.com",
    "tel:+390000000",
    "file:///etc/passwd",
    "ftp://files.example/x",
    "about:blank",
    "chrome://settings",
    "vbscript:msgbox(1)",
  ])("%j is dropped", (raw) => {
    expect(linkAddress(raw, PAGE)).toBeNull();
    expect(linkAddress(raw)).toBeNull();
  });

  test("an address that cannot be parsed is dropped", () => {
    expect(linkAddress("http://", PAGE)).toBeNull();
    expect(linkAddress("https://exa mple.com/", PAGE)).toBeNull();
  });

  test("an address that carries a user name or a password is dropped", () => {
    expect(linkAddress("https://user:secret@shop.example/x", PAGE)).toBeNull();
    expect(linkAddress("https://user@shop.example/x", PAGE)).toBeNull();
  });

  test("a link to the page itself is not somewhere to go", () => {
    expect(linkAddress("#top", PAGE)).toBeNull();
    expect(linkAddress("", PAGE)).toBeNull();
    expect(linkAddress("/a/b/page?x=1#reviews", PAGE)).toBeNull();
    // A different query is a different page.
    expect(linkAddress("/a/b/page?x=2", PAGE)).toBe(
      "https://shop.example/a/b/page?x=2",
    );
  });

  test("with a <base href>, an anchor is judged against the base", () => {
    const base = "https://shop.example/catalog/";
    expect(linkAddress("#top", base)).toBeNull();
    expect(linkAddress("/other#top", base)).toBe(
      "https://shop.example/other#top",
    );
  });
});

describe("linkAddress: tracking parameters", () => {
  test("removes the ones that only say where the visitor came from", () => {
    expect(
      linkAddress(
        "/p?id=7&utm_source=news&utm_medium=mail&gclid=zz&fbclid=yy&color=blue",
        PAGE,
      ),
    ).toBe("https://shop.example/p?id=7&color=blue");
  });

  test("leaves every other parameter exactly as the page wrote it", () => {
    // `+`, `%20`, a repeated name and an empty pair would all change if the query were re-serialised.
    expect(
      linkAddress("/p?q=red+shoes&n=%20x&a=1&a=2&&utm_term=t&z=", PAGE),
    ).toBe("https://shop.example/p?q=red+shoes&n=%20x&a=1&a=2&&z=");
  });

  test("drops the whole query when nothing else was in it, and keeps the fragment", () => {
    expect(linkAddress("/p?utm_source=a&utm_campaign=b#reviews", PAGE)).toBe(
      "https://shop.example/p#reviews",
    );
    expect(linkAddress("/p?gclid=1", PAGE)).toBe("https://shop.example/p");
  });

  test("matches the name exactly, whatever its case, and not a name that merely starts alike", () => {
    expect(linkAddress("/p?UTM_Source=a&k=1", PAGE)).toBe(
      "https://shop.example/p?k=1",
    );
    expect(linkAddress("/p?utmost=1&gclidx=2&_gax=3", PAGE)).toBe(
      "https://shop.example/p?utmost=1&gclidx=2&_gax=3",
    );
  });
});

describe("linkAddress: length", () => {
  const withQuery = (length: number) => {
    const head = "https://shop.example/p?q=";
    return head + "a".repeat(length - head.length);
  };

  test("an address of exactly the limit is kept whole", () => {
    const address = withQuery(LINK_ADDRESS_LIMIT);
    expect(address).toHaveLength(LINK_ADDRESS_LIMIT);
    expect(linkAddress(address, PAGE)).toBe(address);
  });

  test("one over the limit loses its query, so the page it names is still there", () => {
    const address = withQuery(LINK_ADDRESS_LIMIT + 1);
    expect(linkAddress(address, PAGE)).toBe("https://shop.example/p");
    expect(linkAddress(`${address}#frag`, PAGE)).toBe("https://shop.example/p");
  });

  test("a path that is too long on its own gives no address, and is never cut", () => {
    const address = `https://shop.example/${"x".repeat(LINK_ADDRESS_LIMIT)}`;
    expect(linkAddress(address, PAGE)).toBeNull();
  });

  test("the limit counts what is shown: tracking removed first", () => {
    const noise = `&utm_content=${"n".repeat(LINK_ADDRESS_LIMIT)}`;
    expect(linkAddress(`/p?id=7${noise}`, PAGE)).toBe(
      "https://shop.example/p?id=7",
    );
  });
});
