import { describe, expect, test } from "bun:test";
import * as catalogue from "../src/plugins/catalogue";
import {
  CATALOGUE,
  type CatalogueEntry,
  catalogueEntry,
  classifyTool,
} from "../src/plugins/catalogue";

/**
 * The list of what sends, on every catalogue entry, and the rule that reads it.
 *
 * Decided by the maintainer on 14 November 2026: approving a request in the inbox never gives a
 * Bot a tool that sends (an email, a message, a post, a form, a payment). Which tools send is NOT
 * recognised by a word in a name. A person reads each entry's tools and writes the ones that send
 * on the entry, in the same style as `readTools`, and everything else asks, as D33 says.
 *
 * Tests whose names carry "(guard)" pin behaviour that did not change. Every other test in this
 * file fails on the code that was on main before.
 */

/**
 * What each entry's send list must be, written out. A new entry has to be added here by somebody who
 * has read its tools, so an entry added without a decision about what sends fails twice: the type
 * wants the field and this table wants the entry.
 */
const FIRECRAWL_SENDS = [
  "firecrawl_interact",
  "firecrawl_feedback",
  "firecrawl_search_feedback",
];
const GMAIL_SENDS = ["gmail_send_reply", "gmail_send_message"];
const EXPECTED_SENDS: Record<string, readonly string[]> = {
  parallel: [],
  "parallel-authenticated": [],
  exa: [],
  "exa-authenticated": [],
  firecrawl: FIRECRAWL_SENDS,
  "firecrawl-authenticated": FIRECRAWL_SENDS,
  "google-drive": [],
  "google-workspace": GMAIL_SENDS,
  "google-imap": GMAIL_SENDS,
  notion: ["notion-create-comment"],
  routines: [],
  settings: [],
};

/** The one check "every entry carries a send list" is made of, so a test can show it catches a gap. */
function lacksSendList(entry: unknown): boolean {
  const list = (entry as { sendTools?: unknown }).sendTools;
  return !Array.isArray(list) || list.some((name) => typeof name !== "string");
}

describe("every catalogue entry carries a send list", () => {
  test("none lacks one", () => {
    for (const entry of CATALOGUE)
      expect(`${entry.key}: ${lacksSendList(entry)}`).toBe(
        `${entry.key}: false`,
      );
  });

  test("(guard) the check does catch an entry written without one", () => {
    const { sendTools: _dropped, ...without } = CATALOGUE[0] as CatalogueEntry;
    expect(lacksSendList(without)).toBe(true);
    expect(lacksSendList({ ...without, sendTools: "gmail_send_message" })).toBe(
      true,
    );
    expect(lacksSendList({ ...without, sendTools: [] })).toBe(false);
  });

  test("each list is the one somebody read and wrote down, entry by entry", () => {
    // A key the table does not know is a new entry nobody has decided about yet.
    expect(Object.keys(EXPECTED_SENDS).sort()).toEqual(
      CATALOGUE.map((entry) => entry.key).sort(),
    );
    for (const entry of CATALOGUE)
      expect([entry.key, entry.sendTools]).toEqual([
        entry.key,
        EXPECTED_SENDS[entry.key],
      ]);
  });

  test("a send is never also a read, and is always a write the gate asks about", () => {
    for (const entry of CATALOGUE)
      for (const name of entry.sendTools) {
        expect(entry.readTools).not.toContain(name);
        // On the reviewed write list too, so the classification of every send is unchanged by this list.
        expect(entry.writeTools).toContain(name);
        // And a recorded read cannot narrow it.
        for (const recorded of [null, "read", "write", ""] as const)
          expect(classifyTool(entry, name, true, recorded)).toBe("write");
      }
  });

  test("no list repeats a name", () => {
    for (const entry of CATALOGUE)
      expect(new Set(entry.sendTools).size).toBe(entry.sendTools.length);
  });

  test("both ways of connecting Gmail send through the same two tools, and nothing else on either sends", () => {
    const oauth = catalogueEntry("google-workspace");
    const imap = catalogueEntry("google-imap");
    expect(oauth?.sendTools).toEqual(GMAIL_SENDS);
    expect(imap?.sendTools).toEqual(oauth?.sendTools ?? []);
    // The other seven tools of either entry are the reads and the four that organise a mailbox: a
    // label created, labels added or removed, messages archived, messages marked read or unread. None of
    // those reaches anybody, so none is a send (docs/design/mail-organise.md).
    const others = [
      "calendar_list_events",
      "gmail_archive_messages",
      "gmail_create_label",
      "gmail_label_messages",
      "gmail_list_labels",
      "gmail_mark_messages",
      "gmail_read_message",
      "gmail_search_messages",
    ];
    expect(
      [...(oauth?.readTools ?? []), ...(oauth?.writeTools ?? [])].sort(),
    ).toEqual([...others, ...GMAIL_SENDS].sort());
    expect(
      [...(imap?.readTools ?? []), ...(imap?.writeTools ?? [])].sort(),
    ).toEqual([...others, ...GMAIL_SENDS].sort());
    for (const name of others) {
      expect(oauth?.sendTools).not.toContain(name);
      expect(imap?.sendTools).not.toContain(name);
    }
  });
});

describe("what makes a tool settings-only", () => {
  const rule = () => {
    const fn = (
      catalogue as unknown as {
        settingsOnlyBecause?: (
          entry: CatalogueEntry | null,
          toolName: string,
          recorded?: string | null,
        ) => "send" | "unreviewed" | null;
      }
    ).settingsOnlyBecause;
    if (!fn) throw new Error("settingsOnlyBecause does not exist");
    return fn;
  };

  test("a tool on an entry's send list is a send, whatever the listing recorded for it", () => {
    for (const entry of CATALOGUE)
      for (const name of entry.sendTools)
        for (const recorded of [null, undefined, "read", "write", ""])
          expect(rule()(entry, name, recorded)).toBe("send");
  });

  test("a tool the entry reads is not one", () => {
    for (const entry of CATALOGUE)
      for (const name of entry.readTools)
        expect(rule()(entry, name, "read")).toBeNull();
  });

  test("(guard) a write nobody listed as a send stays a write that asks, and is not one", () => {
    const notion = catalogueEntry("notion");
    for (const name of ["notion-update-page", "notion-create-pages"])
      expect(rule()(notion, name, "write")).toBeNull();
    // Not even a name this entry has never heard of: a vendor-added tool is a write, as D33 says.
    expect(rule()(notion, "notion-send-a-letter", "write")).toBeNull();
    expect(rule()(notion, "notion-send-a-letter", null)).toBeNull();
  });

  test("a name that says send is not a send on an entry that did not list it", () => {
    // Sends are never recognised by a word in the name: only the list decides.
    const drive = catalogueEntry("google-drive");
    expect(rule()(drive, "send_file", "write")).toBeNull();
    expect(rule()(drive, "share_file", "write")).toBeNull();
    const exa = catalogueEntry("exa");
    expect(rule()(exa, "post_message", "write")).toBeNull();
  });

  test("an app with no entry has no list, so only what the vendor labelled a read is not a send", () => {
    // A server an administrator added by URL, or an app a broker hosts.
    expect(rule()(null, "LIST_FILES", "read")).toBeNull();
    expect(rule()(null, "SEND_MAIL", "write")).toBe("unreviewed");
    expect(rule()(null, "UPDATE_ROW", "write")).toBe("unreviewed");
    // Nobody said it reads: it is not taken for one.
    expect(rule()(null, "LIST_FILES", null)).toBe("unreviewed");
    expect(rule()(null, "LIST_FILES", undefined)).toBe("unreviewed");
    expect(rule()(null, "LIST_FILES", "")).toBe("unreviewed");
    expect(rule()(null, "LIST_FILES", "Read")).toBe("unreviewed");
    // A name with the words of a credential is not taken as a read on a vendor's word alone.
    expect(rule()(null, "GET_PASSWORD_HINT", "read")).toBe("unreviewed");
  });
});
