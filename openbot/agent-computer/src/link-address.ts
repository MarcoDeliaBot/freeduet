/**
 * The address a link points to, in the form a Bot is shown.
 *
 * A Bot that reads a page cannot open one of its links unless it can see where the link goes, and
 * the page text and the snapshot said nothing about that. The rules for what is worth showing live
 * here, in one place, because the snapshot and the page text must agree on them and because they
 * decide what an outside page may put in front of a model.
 *
 * Pure: no Playwright and no imports, so every rule has a test that needs no browser.
 */

/** The longest address shown. Longer than this is nearly always tracking, and it eats the budget. */
export const LINK_ADDRESS_LIMIT = 300;

/**
 * Query parameters that only say where a visitor came from. Removed because they are noise and make
 * an address longer; nothing here is read by the page it points to. Anything not named is kept.
 */
const TRACKING_PARAMETER =
  /^(utm_[a-z0-9_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|yclid|mc_cid|mc_eid|igshid|srsltid|_ga|_gl)$/i;

/** The query without the tracking parameters, every other parameter left byte for byte as it was. */
function withoutTracking(url: URL): string {
  if (!url.search) return url.href;
  // Cut on `&` and rejoin rather than parse and serialise: serialising re-encodes what it keeps.
  const pairs = url.search.slice(1).split("&");
  const kept = pairs.filter(
    (pair) => !TRACKING_PARAMETER.test(pair.split("=")[0] ?? ""),
  );
  if (kept.length === pairs.length) return url.href;
  const search = kept.length ? `?${kept.join("&")}` : "";
  return `${url.origin}${url.pathname}${search}${url.hash}`;
}

/** Whether `url` is the page `base` itself, apart from the part after `#`. */
function isSameDocument(url: URL, base: string): boolean {
  try {
    return url.href.split("#")[0] === new URL(base).href.split("#")[0];
  } catch {
    return false;
  }
}

/**
 * The absolute web address a link points to, or null when there is nothing worth showing.
 *
 * `raw` is the `href` as the page wrote it and `base` the address it is relative to: the page's
 * `document.baseURI`, which is not always the page's own address because of `<base href>`. Without a
 * `base` only an address that is already absolute can be shown, which is the case for a link inside a
 * frame: the frame's own address is not known here, and resolving against the wrong one would hand
 * the Bot an address that is not where the link goes.
 *
 * Shown: `http` and `https`. Everything else is nothing to open: `javascript:` and `data:` run or
 * carry code, `blob:` points into the page's own memory, `mailto:` and `tel:` are not pages. The URL
 * parser has already removed the tabs, newlines and letter case that are used to slip `javascript:`
 * past a text match, which is why this reads `protocol` and does not look at the string.
 *
 * Not shown: an address with a user name or password in it, which is not for a model to carry; and a
 * link to `base` itself, which is an anchor and not somewhere to go. That is `base`, not the page: on a
 * page with a `<base href>` a link that is only a fragment is left out too, which is the safe way to
 * be wrong, as a Bot that does not see an address clicks instead of opening a wrong one.
 *
 * Over the length limit, the query and fragment are dropped, which for the long addresses of a shop's
 * search results leaves the product page; if the path alone is still too long there is no address.
 * Never cut: half an address opens the wrong page.
 */
export function linkAddress(raw: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (base && isSameDocument(url, base)) return null;

  const address = withoutTracking(url);
  if (address.length <= LINK_ADDRESS_LIMIT) return address;
  const path = `${url.origin}${url.pathname}`;
  return path.length <= LINK_ADDRESS_LIMIT ? path : null;
}
