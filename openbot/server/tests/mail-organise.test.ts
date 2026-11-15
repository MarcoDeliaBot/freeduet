import { describe, expect, test } from "bun:test";
import {
  ALL_MAIL_FALLBACK,
  allMailPath,
  ARCHIVE_MESSAGES,
  BIN_MESSAGES,
  SPAM_MESSAGES,
  binnedAnswer,
  CREATE_LABEL,
  createdAnswer,
  isOrganiseMessageTool,
  isOrganiseTool,
  isOrganiseWrite,
  LABEL_MESSAGES,
  LABEL_NAME_MAX_CHARS,
  LIST_LABELS,
  labelsAnswer,
  MARK_MESSAGES,
  MAX_LABELS_PER_CALL,
  MAX_ORGANISE_MESSAGES,
  ORGANISE_READ_TOOLS,
  ORGANISE_REFUSALS,
  ORGANISE_TOOL_DEFINITIONS,
  ORGANISE_WRITE_TOOLS,
  organiseRefusal,
  ownLabelNames,
  parseLabelName,
  parseLabelRef,
  parseMessageIds,
  parseOrganiseCall,
  shownMessage,
  shownText,
} from "../src/plugins/mail-organise";

/**
 * Organising a mailbox, the part that touches no network: what a call may say, and what is refused.
 *
 * Every refusal is a fixed sentence and none quotes what it was handed. A label name or an id may have
 * come out of a mail the Bot read, and an error is read back into its model, so the sentences are
 * asserted whole and asserted not to hold the input. Both ways of connecting Gmail read the arguments
 * with these same functions before they make a connection, and the call path reads them before the
 * person is asked, so what is pinned here is what both transports and the approval card rely on.
 */

const ID = "1a2b3c4d5e6f7a8b";
const OTHER = "ffee0011";

const refused = (result: { ok: boolean; message?: string }) =>
  result.ok ? null : (result.message ?? null);

describe("the tools and how they are told apart", () => {
  test("one tool only reads, and six change a mailbox", () => {
    expect([...ORGANISE_READ_TOOLS]).toEqual(["gmail_list_labels"]);
    expect([...ORGANISE_WRITE_TOOLS]).toEqual([
      "gmail_create_label",
      "gmail_label_messages",
      "gmail_archive_messages",
      "gmail_mark_messages",
      "gmail_bin_messages",
      "gmail_spam_messages",
    ]);
    for (const name of ORGANISE_READ_TOOLS) {
      expect(isOrganiseTool(name)).toBe(true);
      expect(isOrganiseWrite(name)).toBe(false);
    }
    for (const name of ORGANISE_WRITE_TOOLS) {
      expect(isOrganiseTool(name)).toBe(true);
      expect(isOrganiseWrite(name)).toBe(true);
    }
  });

  test("five of the six name messages, and so can show the person which", () => {
    expect(isOrganiseMessageTool(BIN_MESSAGES)).toBe(true);
    expect(isOrganiseMessageTool(SPAM_MESSAGES)).toBe(true);
    expect(isOrganiseMessageTool(LABEL_MESSAGES)).toBe(true);
    expect(isOrganiseMessageTool(ARCHIVE_MESSAGES)).toBe(true);
    expect(isOrganiseMessageTool(MARK_MESSAGES)).toBe(true);
    expect(isOrganiseMessageTool(CREATE_LABEL)).toBe(false);
    expect(isOrganiseMessageTool(LIST_LABELS)).toBe(false);
  });

  test("the sends and the other tools of the connection are not organising tools", () => {
    for (const name of [
      "gmail_send_message",
      "gmail_send_reply",
      "gmail_search_messages",
      "gmail_read_message",
      "calendar_list_events",
      "gmail_delete_message",
      "gmail_trash_message",
      "gmail_empty_bin",
      "gmail_delete_permanently",
    ]) {
      expect(isOrganiseTool(name)).toBe(false);
    }
  });

  test("the definitions are exactly the seven tools, each with an object schema", () => {
    expect(ORGANISE_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      LIST_LABELS,
      CREATE_LABEL,
      LABEL_MESSAGES,
      ARCHIVE_MESSAGES,
      MARK_MESSAGES,
      BIN_MESSAGES,
      SPAM_MESSAGES,
    ]);
    for (const tool of ORGANISE_TOOL_DEFINITIONS) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  test("a Bot is told that the person is asked, and that nothing is deleted", () => {
    for (const tool of ORGANISE_TOOL_DEFINITIONS) {
      if (tool.name === LIST_LABELS) continue;
      expect(tool.description).toContain("the person is asked first");
    }
    const labelling = ORGANISE_TOOL_DEFINITIONS.find(
      (tool) => tool.name === LABEL_MESSAGES,
    );
    expect(labelling?.description).toContain("cannot delete anything");
    expect(labelling?.description).toContain("Trash and Spam are refused");
    expect(labelling?.description).toContain(
      "no way to act on everything a search matches",
    );
  });

  test("no schema has a field that could name a search, a folder or a place to forward to", () => {
    const words =
      /\b(query|filter|forward|everything|all|folder|destination|thread|trash|delete)\b/i;
    for (const tool of ORGANISE_TOOL_DEFINITIONS) {
      expect(JSON.stringify(tool.inputSchema)).not.toMatch(words);
    }
  });

  test("the only fields the schemas take are the ones the parser reads", () => {
    const named = (tool: string) => {
      const definition = ORGANISE_TOOL_DEFINITIONS.find(
        (entry) => entry.name === tool,
      );
      if (!definition) throw new Error(`no definition for ${tool}`);
      const schema = definition.inputSchema as {
        properties: Record<string, unknown>;
      };
      return Object.keys(schema.properties).sort();
    };
    expect(named(LIST_LABELS)).toEqual([]);
    expect(named(CREATE_LABEL)).toEqual(["name"]);
    expect(named(LABEL_MESSAGES)).toEqual([
      "addLabels",
      "messageIds",
      "removeLabels",
    ]);
    expect(named(ARCHIVE_MESSAGES)).toEqual(["messageIds"]);
    expect(named(MARK_MESSAGES)).toEqual(["messageIds", "state"]);
    expect(named(BIN_MESSAGES)).toEqual(["messageIds"]);
  });

  test("a Bot is told the Bin is not a deletion, that the person can restore for about 30 days, and that it is the strongest change", () => {
    const bin = ORGANISE_TOOL_DEFINITIONS.find(
      (tool) => tool.name === BIN_MESSAGES,
    );
    expect(bin?.description).toContain("the person is asked first");
    expect(bin?.description).toContain("restore them for about 30 days");
    expect(bin?.description).toContain("not a permanent deletion");
    expect(bin?.description).toContain("no tool that empties the Bin");
    expect(bin?.description).toContain("strongest change");
    expect(bin?.description).toContain(
      "no way to act on everything a search matches",
    );
    expect(binnedAnswer(3)).toMatchObject({ binned: 3 });
    expect(binnedAnswer(3).note).toContain("about 30 days");
  });
});

describe("a label's name", () => {
  test("an ordinary name, with a space, a slash or an accent, is accepted as it is", () => {
    for (const name of ["FreeDuet", "Clients/Acme", "Fatture 2026", "Città"]) {
      expect(parseLabelName(name)).toEqual({ ok: true, value: name });
    }
  });

  test("it is trimmed, and nothing else about it is changed", () => {
    expect(parseLabelName("  FreeDuet \n")).toEqual({
      ok: true,
      value: "FreeDuet",
    });
  });

  test("empty, blank and missing need a name; anything that is not a string is not one", () => {
    for (const value of ["", "   ", undefined, null]) {
      expect(refused(parseLabelName(value))).toBe(ORGANISE_REFUSALS.noName);
    }
    for (const value of [7, ["a"], {}, true]) {
      expect(refused(parseLabelName(value))).toBe(ORGANISE_REFUSALS.labelName);
    }
  });

  test("one hundred characters pass and one hundred and one do not", () => {
    expect(parseLabelName("a".repeat(LABEL_NAME_MAX_CHARS)).ok).toBe(true);
    expect(refused(parseLabelName("a".repeat(LABEL_NAME_MAX_CHARS + 1)))).toBe(
      ORGANISE_REFUSALS.labelName,
    );
  });

  test("a control character is refused, whichever it is", () => {
    for (const bad of [
      "a\nb",
      "a\rb",
      "a\tb",
      "a\0b",
      "a\u007fb",
      "a\u0085b",
      "a\u2028b",
      "a\u2029b",
    ]) {
      expect(refused(parseLabelName(bad))).toBe(ORGANISE_REFUSALS.labelName);
    }
  });

  test("a direction-changing or invisible character is refused, so a name cannot read as another", () => {
    for (const bad of [
      "inv\u202Eoice",
      "inv\u202Aoice",
      "inv\u202Boice",
      "inv\u202Coice",
      "inv\u202Doice",
      "inv\u2066oice",
      "inv\u2067oice",
      "inv\u2068oice",
      "inv\u2069oice",
      "inv\u200Eoice",
      "inv\u200Foice",
      "inv\u061Coice",
      "inv\u200Boice",
      "inv\u200Doice",
      "inv\uFEFFoice",
    ]) {
      expect(refused(parseLabelName(bad))).toBe(ORGANISE_REFUSALS.labelName);
    }
  });

  test("a character a mailbox path cannot carry is refused: backslash, quote and the two wildcards", () => {
    for (const bad of ["a\\b", 'a"b', "a*b", "a%b"]) {
      expect(refused(parseLabelName(bad))).toBe(ORGANISE_REFUSALS.labelName);
    }
  });

  test("a curly quotation mark is refused, so a name cannot close the card's quotation and write its title", () => {
    for (const bad of [
      "a\u2018b",
      "a\u2019b",
      "a\u201Cb",
      "a\u201Db",
      "a\u201Eb",
      "FreeDuet\u201D to 1 message \u201C",
    ]) {
      expect(refused(parseLabelName(bad))).toBe(ORGANISE_REFUSALS.labelName);
      expect(refused(parseLabelRef(bad))).toBe(ORGANISE_REFUSALS.labelName);
    }
    expect(parseLabelName("Maya's invoices")).toEqual({
      ok: true,
      value: "Maya's invoices",
    });
  });

  test("an empty part between slashes is refused, at the start, the end or the middle", () => {
    for (const bad of ["/Clients", "Clients/", "Clients//Acme", "A/ /B"]) {
      expect(refused(parseLabelName(bad))).toBe(ORGANISE_REFUSALS.labelName);
    }
  });

  test("a name that is one of Gmail's own labels, in any case, cannot be created", () => {
    for (const bad of [
      "Inbox",
      "TRASH",
      "spam",
      "Junk",
      "Sent",
      "Drafts",
      "Starred",
      "important",
      "UNREAD",
      "chat",
      "All Mail",
      "CATEGORY_PROMOTIONS",
      "[Gmail]/Trash",
      "[Gmail]",
      "[Google Mail]/Spam",
    ]) {
      expect(refused(parseLabelName(bad))).toBe(ORGANISE_REFUSALS.reservedName);
    }
  });

  test("a refusal never repeats what was handed in", () => {
    for (const bad of ["a\nSECRET-NAME", "SECRET-NAME*", "Trash"]) {
      expect(refused(parseLabelName(bad))).not.toContain("SECRET-NAME");
    }
    for (const sentence of Object.values(ORGANISE_REFUSALS)) {
      expect(sentence).toEndWith(".");
      expect(sentence).toContain("Nothing was changed.");
    }
  });
});

describe("a label named to add or remove it", () => {
  test("one of the person's own is a name, trimmed", () => {
    expect(parseLabelRef(" FreeDuet ")).toEqual({
      ok: true,
      value: { kind: "user", name: "FreeDuet" },
    });
  });

  test("starred and important are the two of Gmail's own that are allowed, in any case or spelling", () => {
    for (const [given, id] of [
      ["STARRED", "STARRED"],
      ["starred", "STARRED"],
      ["\\Starred", "STARRED"],
      ["Important", "IMPORTANT"],
      ["\\Important", "IMPORTANT"],
    ] as const) {
      expect(parseLabelRef(given)).toEqual({
        ok: true,
        value: { kind: "system", id },
      });
    }
  });

  test("Trash and Spam are refused in every spelling, because they delete or hide mail", () => {
    for (const bad of [
      "TRASH",
      "Trash",
      "trash",
      "\\Trash",
      " \\trash ",
      "SPAM",
      "Spam",
      "\\Spam",
      "JUNK",
      "\\Junk",
    ]) {
      expect(refused(parseLabelRef(bad))).toBe(ORGANISE_REFUSALS.hidesMail);
    }
  });

  test("every other label of Gmail's own is refused, with the tool to use instead", () => {
    for (const bad of [
      "INBOX",
      "\\Inbox",
      "Inbox",
      "UNREAD",
      "SENT",
      "DRAFT",
      "CATEGORY_SOCIAL",
      "[Gmail]/All Mail",
    ]) {
      expect(refused(parseLabelRef(bad))).toBe(ORGANISE_REFUSALS.systemLabel);
    }
    expect(ORGANISE_REFUSALS.systemLabel).toContain("gmail_archive_messages");
    expect(ORGANISE_REFUSALS.systemLabel).toContain("gmail_mark_messages");
  });

  test("a flag that would mark mail for removal is refused as a name, not carried through", () => {
    for (const bad of ["\\Deleted", "\\Seen", "\\Flagged", "\\Answered"]) {
      expect(refused(parseLabelRef(bad))).toBe(ORGANISE_REFUSALS.labelName);
    }
  });

  test("a name that is not a string is refused", () => {
    for (const value of [undefined, null, 3, {}, ["a"]]) {
      expect(refused(parseLabelRef(value))).toBe(ORGANISE_REFUSALS.labelName);
    }
  });
});

describe("message ids", () => {
  test("hex ids, once each and in the order given, lower-cased", () => {
    expect(parseMessageIds([ID, OTHER.toUpperCase(), ID])).toEqual({
      ok: true,
      value: [ID, OTHER],
    });
  });

  test("a bare string is a list of one", () => {
    expect(parseMessageIds(ID)).toEqual({ ok: true, value: [ID] });
  });

  test("none, an empty list and a missing argument are refused", () => {
    for (const value of [undefined, null, [], "", {}, 5]) {
      expect(refused(parseMessageIds(value))).toBe(ORGANISE_REFUSALS.noIds);
    }
  });

  test("an id that is not a Gmail id is refused, and so is a list with one in it", () => {
    for (const bad of [
      "xyz",
      "",
      " ",
      "12345678901234567",
      "0x1a",
      "1a 2b",
      "-1",
      "1a;DROP",
      "ana@example.com",
      7,
      null,
      {},
    ]) {
      expect(refused(parseMessageIds([ID, bad]))).toBe(
        ORGANISE_REFUSALS.badIds,
      );
    }
  });

  test("one hundred ids pass and one hundred and one are refused whole, never cut", () => {
    const ids = (n: number) =>
      Array.from({ length: n }, (_, i) => (i + 1).toString(16));
    expect(parseMessageIds(ids(MAX_ORGANISE_MESSAGES))).toEqual({
      ok: true,
      value: ids(MAX_ORGANISE_MESSAGES),
    });
    expect(refused(parseMessageIds(ids(MAX_ORGANISE_MESSAGES + 1)))).toBe(
      ORGANISE_REFUSALS.tooManyIds,
    );
  });

  test("the limit counts messages, not entries: a repeated id is one", () => {
    const entries = [
      ...Array.from({ length: MAX_ORGANISE_MESSAGES }, (_, i) =>
        (i + 1).toString(16),
      ),
      "1",
      "2",
    ];
    expect(parseMessageIds(entries).ok).toBe(true);
  });
});

describe("one call to a tool", () => {
  test("listing labels takes no arguments, and extra ones change nothing", () => {
    expect(parseOrganiseCall(LIST_LABELS, {})).toEqual({
      ok: true,
      value: { tool: LIST_LABELS },
    });
    expect(parseOrganiseCall(LIST_LABELS, { query: "everything" }).ok).toBe(
      true,
    );
  });

  test("creating a label takes a name and nothing else", () => {
    expect(parseOrganiseCall(CREATE_LABEL, { name: "FreeDuet" })).toEqual({
      ok: true,
      value: { tool: CREATE_LABEL, name: "FreeDuet" },
    });
    expect(
      refused(
        parseOrganiseCall(CREATE_LABEL, { name: "FreeDuet", color: "red" }),
      ),
    ).toBe(ORGANISE_REFUSALS.extra);
    expect(refused(parseOrganiseCall(CREATE_LABEL, {}))).toBe(
      ORGANISE_REFUSALS.noName,
    );
  });

  test("archiving takes message ids and nothing else", () => {
    expect(
      parseOrganiseCall(ARCHIVE_MESSAGES, { messageIds: [ID, OTHER] }),
    ).toEqual({
      ok: true,
      value: { tool: ARCHIVE_MESSAGES, ids: [ID, OTHER] },
    });
    expect(refused(parseOrganiseCall(ARCHIVE_MESSAGES, {}))).toBe(
      ORGANISE_REFUSALS.noIds,
    );
  });

  test("binning takes message ids and nothing else, at most one hundred, and is a write that names messages", () => {
    expect(
      parseOrganiseCall(BIN_MESSAGES, { messageIds: [ID, OTHER, ID] }),
    ).toEqual({ ok: true, value: { tool: BIN_MESSAGES, ids: [ID, OTHER] } });
    expect(refused(parseOrganiseCall(BIN_MESSAGES, {}))).toBe(
      ORGANISE_REFUSALS.noIds,
    );
    const hundred = Array.from({ length: 100 }, (_, n) =>
      n.toString(16).padStart(4, "0"),
    );
    expect(parseOrganiseCall(BIN_MESSAGES, { messageIds: hundred }).ok).toBe(
      true,
    );
    expect(
      refused(
        parseOrganiseCall(BIN_MESSAGES, {
          messageIds: [...hundred, "ffff"],
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.tooManyIds);
    // Nothing that would act on a search, a folder or permanence is a field here.
    for (const extra of [
      { query: "from:x" },
      { permanent: true },
      { folder: "Spam" },
      { destination: "Spam" },
      { to: "Spam" },
      { all: true },
      { state: "read" },
    ]) {
      expect(
        refused(
          parseOrganiseCall(BIN_MESSAGES, { messageIds: [ID], ...extra }),
        ),
      ).toBe(ORGANISE_REFUSALS.extra);
    }
    expect(isOrganiseWrite(BIN_MESSAGES)).toBe(true);
    expect(isOrganiseMessageTool(BIN_MESSAGES)).toBe(true);
  });

  test("marking takes ids and a state of read or unread, and no other", () => {
    expect(
      parseOrganiseCall(MARK_MESSAGES, { messageIds: [ID], state: "read" }),
    ).toEqual({
      ok: true,
      value: { tool: MARK_MESSAGES, ids: [ID], state: "read" },
    });
    expect(
      parseOrganiseCall(MARK_MESSAGES, { messageIds: [ID], state: " unread " }),
    ).toEqual({
      ok: true,
      value: { tool: MARK_MESSAGES, ids: [ID], state: "unread" },
    });
    for (const state of ["READ", "deleted", "spam", "", undefined, 1]) {
      expect(
        refused(parseOrganiseCall(MARK_MESSAGES, { messageIds: [ID], state })),
      ).toBe(ORGANISE_REFUSALS.state);
    }
  });

  test("labelling takes ids and labels to add, to remove or both", () => {
    expect(
      parseOrganiseCall(LABEL_MESSAGES, {
        messageIds: [ID],
        addLabels: ["FreeDuet", "starred"],
        removeLabels: ["Old"],
      }),
    ).toEqual({
      ok: true,
      value: {
        tool: LABEL_MESSAGES,
        ids: [ID],
        add: [
          { kind: "user", name: "FreeDuet" },
          { kind: "system", id: "STARRED" },
        ],
        remove: [{ kind: "user", name: "Old" }],
      },
    });
    // One bare name is a list of one.
    expect(
      parseOrganiseCall(LABEL_MESSAGES, {
        messageIds: ID,
        addLabels: "FreeDuet",
      }),
    ).toEqual({
      ok: true,
      value: {
        tool: LABEL_MESSAGES,
        ids: [ID],
        add: [{ kind: "user", name: "FreeDuet" }],
        remove: [],
      },
    });
  });

  test("labelling with no label to add or remove is refused", () => {
    expect(
      refused(parseOrganiseCall(LABEL_MESSAGES, { messageIds: [ID] })),
    ).toBe(ORGANISE_REFUSALS.noLabels);
    expect(
      refused(
        parseOrganiseCall(LABEL_MESSAGES, {
          messageIds: [ID],
          addLabels: [],
          removeLabels: [],
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.noLabels);
  });

  test("Trash and Spam are refused in both directions, whatever else the call says", () => {
    for (const field of ["addLabels", "removeLabels"]) {
      for (const bad of ["TRASH", "\\Trash", "SPAM", "Spam"]) {
        expect(
          refused(
            parseOrganiseCall(LABEL_MESSAGES, {
              messageIds: [ID],
              [field]: ["FreeDuet", bad],
            }),
          ),
        ).toBe(ORGANISE_REFUSALS.hidesMail);
      }
    }
  });

  test("the Inbox cannot be removed by labelling: that is archiving, which says what it does", () => {
    expect(
      refused(
        parseOrganiseCall(LABEL_MESSAGES, {
          messageIds: [ID],
          removeLabels: ["INBOX"],
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.systemLabel);
    expect(
      refused(
        parseOrganiseCall(LABEL_MESSAGES, {
          messageIds: [ID],
          addLabels: ["UNREAD"],
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.systemLabel);
  });

  test("a label added and removed in the same call is refused, in any case", () => {
    expect(
      refused(
        parseOrganiseCall(LABEL_MESSAGES, {
          messageIds: [ID],
          addLabels: ["FreeDuet"],
          removeLabels: ["freeduet"],
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.sameLabel);
    expect(
      refused(
        parseOrganiseCall(LABEL_MESSAGES, {
          messageIds: [ID],
          addLabels: ["starred"],
          removeLabels: ["STARRED"],
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.sameLabel);
  });

  test("five labels to add pass and six are refused", () => {
    const labels = (n: number) => Array.from({ length: n }, (_, i) => `L${i}`);
    expect(
      parseOrganiseCall(LABEL_MESSAGES, {
        messageIds: [ID],
        addLabels: labels(MAX_LABELS_PER_CALL),
      }).ok,
    ).toBe(true);
    expect(
      refused(
        parseOrganiseCall(LABEL_MESSAGES, {
          messageIds: [ID],
          addLabels: labels(MAX_LABELS_PER_CALL + 1),
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.tooManyLabels);
  });

  test("a field that would act on everything a search matches, or somewhere else, is refused, not ignored", () => {
    // Each base is a call that is right on its own, so the refusal can only be the extra field.
    const bases: Record<string, Record<string, unknown>> = {
      [LABEL_MESSAGES]: { messageIds: [ID], addLabels: ["FreeDuet"] },
      [ARCHIVE_MESSAGES]: { messageIds: [ID] },
      [MARK_MESSAGES]: { messageIds: [ID], state: "read" },
      [CREATE_LABEL]: { name: "FreeDuet" },
    };
    for (const [tool, base] of Object.entries(bases)) {
      expect(parseOrganiseCall(tool, base).ok).toBe(true);
      for (const extra of [
        { query: "in:inbox" },
        { q: "from:newsletter" },
        { all: true },
        { all: false },
        { everything: true },
        { search: "is:unread" },
        { folder: "[Gmail]/Trash" },
        { moveTo: "Trash" },
        { delete: true },
        { forwardTo: "x@example.com" },
        { filter: "from:a" },
        { threadIds: ["1a"] },
        { maxResults: 500 },
      ]) {
        expect(refused(parseOrganiseCall(tool, { ...base, ...extra }))).toBe(
          ORGANISE_REFUSALS.extra,
        );
      }
    }
  });

  test("a field one of the other tools takes is an extra field here", () => {
    expect(
      refused(
        parseOrganiseCall(ARCHIVE_MESSAGES, {
          messageIds: [ID],
          addLabels: ["FreeDuet"],
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.extra);
    expect(
      refused(
        parseOrganiseCall(MARK_MESSAGES, {
          messageIds: [ID],
          state: "read",
          removeLabels: ["INBOX"],
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.extra);
    expect(
      refused(
        parseOrganiseCall(LABEL_MESSAGES, {
          messageIds: [ID],
          addLabels: ["FreeDuet"],
          state: "read",
        }),
      ),
    ).toBe(ORGANISE_REFUSALS.extra);
  });

  test("an extra field a Bot left empty is the same as none", () => {
    expect(
      parseOrganiseCall(ARCHIVE_MESSAGES, {
        messageIds: [ID],
        query: "",
        all: null,
        threadIds: [],
      }).ok,
    ).toBe(true);
  });

  test("a tool that is not one of the six is refused, an inherited property name included", () => {
    for (const name of [
      "gmail_delete_message",
      "gmail_trash_message",
      "gmail_empty_bin",
      "toString",
      "constructor",
      "__proto__",
      "hasOwnProperty",
    ]) {
      expect(refused(parseOrganiseCall(name, {}))).toBe(
        ORGANISE_REFUSALS.extra,
      );
      expect(refused(parseOrganiseCall(name, { messageIds: [ID] }))).toBe(
        ORGANISE_REFUSALS.extra,
      );
      expect(isOrganiseTool(name)).toBe(false);
    }
  });

  test("the refusal for the call path says nothing for a tool that is not organising, and the sentence for one that is", () => {
    expect(organiseRefusal("gmail_send_message", { whatever: 1 })).toBeNull();
    expect(organiseRefusal(ARCHIVE_MESSAGES, { messageIds: [ID] })).toBeNull();
    expect(organiseRefusal(ARCHIVE_MESSAGES, {})).toBe(ORGANISE_REFUSALS.noIds);
  });

  test("no refusal holds anything a call handed in", () => {
    const hostile = "HOSTILE-VALUE-7731";
    const seen = [
      parseOrganiseCall(ARCHIVE_MESSAGES, { messageIds: [hostile] }),
      parseOrganiseCall(LABEL_MESSAGES, {
        messageIds: [ID],
        addLabels: [`${hostile}\\`],
      }),
      parseOrganiseCall(CREATE_LABEL, { name: `${hostile}*` }),
      parseOrganiseCall(MARK_MESSAGES, { messageIds: [ID], state: hostile }),
      parseOrganiseCall(ARCHIVE_MESSAGES, { messageIds: [ID], [hostile]: 1 }),
      parseOrganiseCall(BIN_MESSAGES, { messageIds: [hostile] }),
      parseOrganiseCall(BIN_MESSAGES, { messageIds: [ID], [hostile]: 1 }),
    ];
    for (const result of seen) {
      expect(result.ok).toBe(false);
      expect(refused(result)).not.toContain(hostile);
    }
  });
});

describe("what is shown, and what is answered", () => {
  test("a sender and a subject from a mail are one line, free of invisible and direction-changing characters, and cut", () => {
    expect(shownText("  Ana\n\tPereira \u202E<ana@example.com>", 120)).toBe(
      "Ana Pereira <ana@example.com>",
    );
    expect(shownText(undefined, 10)).toBe("");
    expect(shownText("a".repeat(30), 10)).toBe(`${"a".repeat(9)}…`);
    const shown = shownMessage("x".repeat(500), "y".repeat(500));
    expect(shown.from.length).toBeLessThanOrEqual(120);
    expect(shown.subject.length).toBeLessThanOrEqual(200);
  });

  test("the labels answer lists the person's own, sorted, and says which of Gmail's may be added", () => {
    expect(labelsAnswer(["b", "A", "c"])).toEqual({
      labels: ["A", "b", "c"],
      alsoAllowed: ["STARRED", "IMPORTANT"],
    });
  });

  test("creating a label that is there is a success that says so", () => {
    expect(createdAnswer("FreeDuet", true)).toEqual({
      label: "FreeDuet",
      created: true,
    });
    const again = createdAnswer("FreeDuet", false);
    expect(again.created).toBe(false);
    expect("note" in again ? again.note : "").toContain("already exists");
  });

  test("the person's own labels in an IMAP listing leave out the inbox, the special folders and Gmail's prefix", () => {
    expect(
      ownLabelNames([
        { path: "INBOX" },
        { path: "FreeDuet" },
        { path: "Clients/Acme" },
        { path: "[Gmail]", specialUse: undefined },
        { path: "[Gmail]/All Mail", specialUse: "\\All" },
        { path: "[Gmail]/Trash", specialUse: "\\Trash" },
        { path: "[Google Mail]/Spam" },
        { path: "Sent Items", specialUse: "\\Sent" },
      ]),
    ).toEqual(["FreeDuet", "Clients/Acme"]);
    expect(ALL_MAIL_FALLBACK).toBe("[Gmail]/All Mail");
  });

  test("the folder that holds every mail is the server's own \\All, never one a library guessed from a name, and a read and a change find it the same way", () => {
    expect(
      allMailPath([
        { path: "Tous les messages", specialUse: "\\All" },
        { path: "INBOX" },
      ]),
    ).toBe("Tous les messages");
    // A label called "All Mail" that the library only guessed at from its name is not it.
    expect(
      allMailPath([
        { path: "Archive", specialUse: "\\All", specialUseSource: "name" },
        {
          path: "[Gmail]/All Mail",
          specialUse: "\\All",
          specialUseSource: "extension",
        },
      ]),
    ).toBe("[Gmail]/All Mail");
    expect(
      allMailPath([
        { path: "Archive", specialUse: "\\All", specialUseSource: "name" },
      ]),
    ).toBe(ALL_MAIL_FALLBACK);
    expect(allMailPath([])).toBe(ALL_MAIL_FALLBACK);
  });

  test("a label whose name only looks like a special folder is the person's own, and one the server flagged is not", () => {
    expect(
      ownLabelNames([
        // The library guessed these from the names; the server said nothing about them.
        { path: "Archive", specialUse: "\\Archive", specialUseSource: "name" },
        { path: "Sent", specialUse: "\\Sent", specialUseSource: "name" },
        { path: "Drafts", specialUse: "\\Drafts", specialUseSource: "name" },
        // The server named this one, whatever it is called.
        {
          path: "Everything",
          specialUse: "\\All",
          specialUseSource: "extension",
        },
        { path: "Receipts" },
      ]),
    ).toEqual(["Archive", "Sent", "Drafts", "Receipts"]);
  });
});
