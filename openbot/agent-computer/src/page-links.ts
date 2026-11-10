/**
 * The links of a page, as a short list a Bot can read and open from.
 *
 * `computer_navigate` and `computer_read` return the page's text, and the text of a link is its
 * words, not where it goes. A Bot that wants the product page it just read about had no address to
 * open, so it clicked, and a click is the one thing a research turn is told never to do.
 *
 * A list at the end of the text, and not an address after each link inside it, for three reasons:
 *  - the text is the page and keeps its shape: an address after every link doubles the length of a
 *    page that is mostly links, and the 6000 characters are spent before the article starts;
 *  - the list has a budget of its own, so the page text loses what the list needs and no more, and a
 *    page with no links gives back exactly the text it always did;
 *  - it can be put in order. A shop's header and filters come first in the page and the products
 *    after them, so the links inside a header, navigation, footer or sidebar are listed last.
 *
 * Only a type import of Playwright, so the choosing and the layout are tested without a browser.
 * `collectPageLinks` is the one function that needs a page.
 */

import type { Page } from "playwright";
import { cutAtCodeUnits } from "./aria-snapshot";
import { linkAddress } from "./link-address";
import { SENSITIVE_FIELD_SELECTOR } from "./secret-masking";

/** How many links are listed. The first ones in the page, after the repeats are taken out. */
export const PAGE_LINK_LIMIT = 150;

/** How much of the text limit the list may take. The page text gets the rest. */
const LINKS_SHARE = 0.4;

/** What a link says, cut. It is there to tell links apart, not to repeat the page. */
const LINK_LABEL_LIMIT = 80;

/** Room kept inside the list's budget for the line that says how many links were left out. */
const OMITTED_NOTE_ROOM = 40;

/** Anchors read from a page, and the longest `href` read from one: bounds on what leaves the page. */
const ANCHOR_SCAN_LIMIT = 1500;
const RAW_HREF_LIMIT = 4096;

const LIST_HEADING =
  "Links on this page, main content first (address | link text):";

/** One link as the page has it, before anything is decided about it. */
export type RawLink = {
  /** The `href` attribute as written: relative, or not a web address at all. */
  href: string;
  /** What the link says, as the page shows it. */
  label: string;
  /** Inside a header, navigation, footer or sidebar. */
  chrome: boolean;
  /** Is, or holds, a field a secret was typed into. */
  sensitive: boolean;
};

export type PageLink = { address: string; label: string };

/** What the page says about a link, on one line. */
function tidyLabel(label: string): string {
  return cutAtCodeUnits(
    // Control characters and line breaks become spaces, so a label can never start a line of its own.
    label.replace(/[\s\p{Cc}]+/gu, " ").trim(),
    LINK_LABEL_LIMIT,
  );
}

/**
 * The links worth listing, in the order to list them.
 *
 * - Only an address `linkAddress` accepts; a link that is, or holds, a field a secret was typed into
 *   is left out, because what the page shows for such a link may be that secret.
 * - One entry for each address. The same product is linked from its picture, its title and its
 *   reviews, and a Bot needs it once, with the first words the page gave it.
 * - A link with no words is left out: an address with nothing to match it to is noise in a short list.
 * - The page's own content first, then its header, navigation, footer and sidebars, each in the order
 *   of the page. An address that appears in both is content.
 */
export function selectLinks(
  raw: readonly RawLink[],
  base: string | undefined,
  limit: number = PAGE_LINK_LIMIT,
): { links: PageLink[]; omitted: number } {
  const byAddress = new Map<string, { label: string; chrome: boolean }>();
  for (const link of raw) {
    if (link.sensitive) continue;
    const address = linkAddress(link.href, base);
    if (!address) continue;
    const label = tidyLabel(link.label);
    const seen = byAddress.get(address);
    if (!seen) {
      byAddress.set(address, { label, chrome: link.chrome });
      continue;
    }
    if (!seen.label) seen.label = label;
    seen.chrome = seen.chrome && link.chrome;
  }

  const labelled = [...byAddress].filter(([, entry]) => entry.label);
  const ordered = [
    ...labelled.filter(([, entry]) => !entry.chrome),
    ...labelled.filter(([, entry]) => entry.chrome),
  ];
  const links = ordered
    .slice(0, limit)
    .map(([address, entry]) => ({ address, label: entry.label }));
  return { links, omitted: ordered.length - links.length };
}

/** The list as text, as many links as fit in `budget` characters, and a line for the ones that did not. */
function listBlock(
  links: readonly PageLink[],
  omittedBefore: number,
  budget: number,
): { block: string; omitted: number } {
  if (links.length === 0) return { block: "", omitted: omittedBefore };
  let block = LIST_HEADING;
  let listed = 0;
  for (const link of links) {
    const line = `\n- ${link.address} | ${link.label}`;
    if (block.length + line.length > budget - OMITTED_NOTE_ROOM) break;
    block += line;
    listed += 1;
  }
  const omitted = omittedBefore + links.length - listed;
  if (omitted > 0) {
    block += `\n(${omitted} more link${omitted === 1 ? "" : "s"} not listed)`;
  }
  return { block, omitted };
}

/**
 * The text of a page and the list of its links, together no longer than `limit`.
 *
 * Without a link to list this is the text cut at `limit`, as it always was. With links, the list
 * takes what it needs up to `LINKS_SHARE` of the limit and the text is cut to the rest. `truncated`
 * is true when either was cut: a Bot told the page is complete does not look for what is missing.
 */
export function composePageText(
  pageText: string,
  raw: readonly RawLink[],
  base: string | undefined,
  limit: number,
): { text: string; truncated: boolean } {
  const { links, omitted: overLimit } = selectLinks(raw, base);
  const { block, omitted } = listBlock(
    links,
    overLimit,
    Math.floor(limit * LINKS_SHARE),
  );

  if (!block) {
    /*
     * Cut between characters, not through one. #539 fixed this for a control's name and value in the
     * snapshot and left the page text, which is the same bug at thirty times the length: `slice`
     * counts UTF-16 code units, an emoji is two, and a limit landing between the halves hands the Bot
     * a lone high surrogate that reads as U+FFFD, a character that is not on the page.
     */
    return {
      text: cutAtCodeUnits(pageText, limit),
      // Unaffected by the cut above: dropping one more unit cannot make an over-limit string fit.
      truncated: pageText.length > limit,
    };
  }

  const separator = pageText ? "\n\n" : "";
  const room = Math.max(limit - block.length - separator.length, 0);
  const text = cutAtCodeUnits(pageText, room).trimEnd();
  return {
    text: text ? `${text}${separator}${block}` : block,
    truncated: pageText.length > room || omitted > 0,
  };
}

/**
 * Every link of the page the Bot is on, as the page has it, and the address they are relative to.
 *
 * The address is `document.baseURI` and not the page's address: a `<base href>` moves every relative
 * link, and the browser's own answer is the one a click would have followed.
 *
 * Links that are not drawn are left out, as the people looking at the page could not use them
 * either. Reads at most `ANCHOR_SCAN_LIMIT` anchors, and nothing whose `href` is longer than
 * `RAW_HREF_LIMIT`: a page can hold a `data:` link of several megabytes, and none of it should cross
 * to this process to be thrown away. The selector for sensitive fields is passed in, not closed
 * over, because the function is serialised into the page.
 *
 * A page that cannot be read gives no links. The text of the page is what was asked for, and a list
 * of addresses is not worth failing it.
 */
export async function collectPageLinks(
  target: Page,
): Promise<{ base: string; links: RawLink[] }> {
  try {
    return await target.evaluate(
      ({ sensitive, scan, hrefLimit }) => {
        const chrome =
          "header, nav, footer, aside, [role=banner], [role=navigation], [role=contentinfo], [role=complementary]";
        const links: RawLink[] = [];
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        for (const anchor of anchors.slice(0, scan)) {
          const href = anchor.getAttribute("href") ?? "";
          if (!href || href.length > hrefLimit) continue;
          // Not drawn (a closed menu, a hidden panel): nobody could click it, and `innerText` of
          // something not drawn is all of its text, hidden or not.
          if (anchor.getClientRects().length === 0) continue;
          // What a person would call the link: its visible words, else its accessible name.
          const label =
            (anchor as HTMLElement).innerText ||
            anchor.getAttribute("aria-label") ||
            anchor.getAttribute("title") ||
            anchor.querySelector("img[alt]")?.getAttribute("alt") ||
            "";
          links.push({
            href,
            label: label.slice(0, 400),
            chrome: anchor.closest(chrome) !== null,
            sensitive:
              anchor.closest(sensitive) !== null ||
              anchor.querySelector(sensitive) !== null,
          });
        }
        return { base: document.baseURI, links };
      },
      {
        sensitive: SENSITIVE_FIELD_SELECTOR,
        scan: ANCHOR_SCAN_LIMIT,
        hrefLimit: RAW_HREF_LIMIT,
      },
    );
  } catch {
    return { base: target.url(), links: [] };
  }
}

/** What the page's relative links are relative to: `document.baseURI`, else the page's address. */
export async function pageBaseUrl(target: Page): Promise<string> {
  try {
    return await target.evaluate(() => document.baseURI);
  } catch {
    return target.url();
  }
}
