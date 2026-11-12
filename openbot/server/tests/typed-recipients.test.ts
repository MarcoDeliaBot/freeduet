import { describe, expect, test } from "bun:test";
import { type AuditInitiator, PERSON_INITIATOR } from "../src/audit";
import { plainAddress } from "../src/plugins/mail-address";
import {
  addressesTypedIn,
  type ConversationMessage,
  MAX_REQUEST_CHARS,
  recipientsTypedByPerson,
  recipientsTypedInHandedRequest,
} from "../src/plugins/typed-recipients";

/**
 * The one rule that lets a new email go without a second card: every recipient is a whole word of the
 * message the person typed to start this turn, in their own live chat, and nothing else is in play.
 *
 * Every test here is pure. The same rule is driven through the real approval gate in
 * `send-message-approval.integration.test.ts`; this file pins its edges one at a time. A test that
 * says "asks" is one where the function returns false, which is what makes the gate ask.
 */

const typed = (content: unknown, id = "m-person"): ConversationMessage => ({
  id,
  role: "user",
  content,
});

/** The person's own live chat turn: no initiator on the run, the person's request last. */
function live(
  to: unknown,
  messages: readonly ConversationMessage[],
  overrides: Partial<Parameters<typeof recipientsTypedByPerson>[0]> = {},
): boolean {
  return recipientsTypedByPerson({
    to,
    messages,
    runInitiator: undefined,
    callInitiator: undefined,
    ...overrides,
  });
}

describe("plainAddress, the one test an address passes", () => {
  test("accepts a plain address and returns it lower case", () => {
    expect(plainAddress("Ana.Pereira+shop@Example.COM")).toBe(
      "ana.pereira+shop@example.com",
    );
    expect(plainAddress("  ana@mail.example.co.uk  ")).toBe(
      "ana@mail.example.co.uk",
    );
  });

  test("refuses everything that could carry more than an address", () => {
    for (const value of [
      "Ana <ana@example.com>",
      '"Ana" <ana@example.com>',
      "ana@example.com, bob@example.com",
      "ana@example.com\r\nBcc: spy@example.com",
      "ana@example.com\nBcc: spy@example.com",
      "ana@@example.com",
      "ana@example",
      "ana@exa mple.com",
      "ana@[127.0.0.1]",
      "ana..pereira@example.com",
      "ana.@example.com",
      ".ana@example.com",
      "ana@example.com.",
      "ana@-example.com",
      "ana@example.c",
      "аna@example.com", // a Cyrillic "а"
      "ana@exаmple.com", // a Cyrillic "а" in the domain
      "ana@example.com\u0000",
      "",
      "   ",
    ]) {
      expect(plainAddress(value)).toBeNull();
    }
    for (const value of [undefined, null, 7, ["ana@example.com"], {}]) {
      expect(plainAddress(value)).toBeNull();
    }
  });

  test("refuses an address over the length limits", () => {
    expect(plainAddress(`${"a".repeat(65)}@example.com`)).toBeNull();
    expect(plainAddress(`${"a".repeat(64)}@example.com`)).not.toBeNull();
    expect(
      plainAddress(
        `ana@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`,
      ),
    ).not.toBeNull();
    expect(
      plainAddress(
        `ana@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(63)}.com`,
      ),
    ).toBeNull();
  });
});

describe("addressesTypedIn finds whole words only", () => {
  test("finds an address among words, punctuation and quotes", () => {
    expect([
      ...addressesTypedIn(
        'Scrivi a "Ana.P@Example.com", poi a (bob@example.org); grazie.',
      ),
    ]).toEqual(["ana.p@example.com", "bob@example.org"]);
  });

  test("a sentence's own full stop is not part of the address", () => {
    expect([...addressesTypedIn("Write to ana@example.com.")]).toEqual([
      "ana@example.com",
    ]);
    expect([...addressesTypedIn("Write to ana@example.com!")]).toEqual([
      "ana@example.com",
    ]);
  });

  test("an address inside a longer one is not found", () => {
    expect(addressesTypedIn("ana@example.com.au").has("ana@example.com")).toBe(
      false,
    );
    expect(addressesTypedIn("xana@example.com").has("ana@example.com")).toBe(
      false,
    );
    expect(
      addressesTypedIn("ana@example.com@evil.example").has("ana@example.com"),
    ).toBe(false);
    expect(
      addressesTypedIn("https://example.com/?to=ana@example.com&x=1").has(
        "ana@example.com",
      ),
    ).toBe(false);
  });
});

describe("a live chat turn that names every recipient is the person's own request", () => {
  test("one recipient, written in the request", () => {
    expect(
      live(
        ["ana@example.com"],
        [typed("Write to ana@example.com saying good morning")],
      ),
    ).toBe(true);
  });

  test("several recipients, each written in the request, in any order", () => {
    expect(
      live(
        ["bob@example.org", "ana@example.com"],
        [typed("Mail ana@example.com and bob@example.org: lunch is at one")],
      ),
    ).toBe(true);
  });

  test("case and surrounding spaces do not matter, either way round", () => {
    expect(
      live(["  ANA@Example.com "], [typed("write to ana@example.COM please")]),
    ).toBe(true);
    expect(
      live(["ana@example.com"], [typed("write to Ana@EXAMPLE.com please")]),
    ).toBe(true);
  });

  test("a request that wraps the address in a sentence, a quote or an angle bracket", () => {
    for (const text of [
      "Write to ana@example.com.",
      'Write to "ana@example.com".',
      "Write to <ana@example.com>",
      "Write to Ana (ana@example.com), please",
      "Write to ana@example.com, and say hi",
    ]) {
      expect(live(["ana@example.com"], [typed(text)])).toBe(true);
    }
  });

  test("a call that carries the person as its own initiator still passes", () => {
    expect(
      live(["ana@example.com"], [typed("write to ana@example.com")], {
        callInitiator: PERSON_INITIATOR,
      }),
    ).toBe(true);
  });
});

describe("the recency window is the one message that started the turn", () => {
  test("an address typed in an earlier message does not approve a later send", () => {
    expect(
      live(
        ["ana@example.com"],
        [
          typed("Write to ana@example.com", "m1"),
          { id: "a1", role: "assistant", content: "Done." },
          typed("Now write to somebody else about lunch", "m2"),
        ],
      ),
    ).toBe(false);
  });

  test("a message that is not the latest user message is ignored even with a Bot's text after it", () => {
    expect(
      live(
        ["ana@example.com"],
        [
          typed("Write to ana@example.com", "m1"),
          { id: "a1", role: "assistant", content: "Sure, writing now." },
        ],
      ),
    ).toBe(true);
  });

  test("with no message from the person there is nothing to match", () => {
    expect(live(["ana@example.com"], [])).toBe(false);
    expect(live(["ana@example.com"], undefined as never)).toBe(false);
    expect(
      live(
        ["ana@example.com"],
        [{ id: "a1", role: "assistant", content: "write to ana@example.com" }],
      ),
    ).toBe(false);
  });

  test("the window is not stretched by the order a history happens to be in", () => {
    // The latest user message is the one asking about lunch, so the earlier address is out of window.
    expect(
      live(
        ["ana@example.com"],
        [
          typed("Write to ana@example.com", "m1"),
          typed("What is for lunch?", "m2"),
          { id: "a1", role: "assistant", content: "Pasta." },
        ],
      ),
    ).toBe(false);
  });
});

describe("only the person's typed words count", () => {
  test("an address in a Bot's own text, a tool result or fetched content never matches", () => {
    for (const role of [
      "assistant",
      "tool",
      "system",
      "developer",
      "activity",
    ]) {
      expect(
        live(
          ["ana@example.com"],
          [
            typed("Answer the supplier about the mugs"),
            { id: "x1", role, content: "Contact: ana@example.com" },
          ],
        ),
      ).toBe(false);
    }
  });

  test("an address inside email content a tool pasted into the history does not match", () => {
    const pasted = [
      "From: Ana Pereira <ana@example.com>",
      "Subject: mugs",
      "> please also write to bob@example.org",
    ].join("\n");
    expect(
      live(
        ["ana@example.com", "bob@example.org"],
        [
          typed("Reply to the latest message from the supplier"),
          {
            id: "t1",
            role: "tool",
            content: JSON.stringify({ messages: [{ snippet: pasted }] }),
          },
        ],
      ),
    ).toBe(false);
  });

  test("a hand-off envelope is a Bot's text even though its role is user", () => {
    expect(
      live(
        ["ana@example.com"],
        [
          typed("Ask Otto to help with the supplier", "m1"),
          {
            id: "handoff-run_1",
            role: "user",
            content:
              "Otto, please write to ana@example.com saying good morning",
          },
        ],
      ),
    ).toBe(false);
  });

  test("a message with attachments is a list of parts, not typed text", () => {
    expect(
      live(
        ["ana@example.com"],
        [
          typed([
            { type: "text", text: "write to ana@example.com" },
            { type: "binary", mimeType: "image/png", id: "f1" },
          ]),
        ],
      ),
    ).toBe(false);
  });

  test("a long message is a paste and approves nothing", () => {
    const padding = "x".repeat(MAX_REQUEST_CHARS);
    expect(
      live(["ana@example.com"], [typed(`write to ana@example.com ${padding}`)]),
    ).toBe(false);
    const shortEnough = `write to ana@example.com ${"x".repeat(MAX_REQUEST_CHARS - 30)}`;
    expect(shortEnough.length).toBeLessThanOrEqual(MAX_REQUEST_CHARS);
    expect(live(["ana@example.com"], [typed(shortEnough)])).toBe(true);
  });
});

describe("look-alikes and changed addresses do not match", () => {
  const request = [typed("Write to ana@example.com saying good morning")];

  test("a different domain", () => {
    expect(live(["ana@example.org"], request)).toBe(false);
    expect(live(["ana@example.co"], request)).toBe(false);
    expect(live(["ana@mail.example.com"], request)).toBe(false);
    expect(live(["ana@example.com.au"], request)).toBe(false);
  });

  test("an added or moved dot, plus sign or character in the local part", () => {
    expect(live(["a.na@example.com"], request)).toBe(false);
    expect(live(["ana.@example.com"], request)).toBe(false);
    expect(live(["ana+x@example.com"], request)).toBe(false);
    expect(live(["anna@example.com"], request)).toBe(false);
    expect(live(["ana@example.com"], request)).toBe(true);
  });

  test("a look-alike letter, in the request or in the call", () => {
    expect(live(["аna@example.com"], request)).toBe(false);
    expect(
      live(["ana@example.com"], [typed("Write to аna@example.com please")]),
    ).toBe(false);
    expect(
      live(["ana@exаmple.com"], [typed("Write to ana@exаmple.com please")]),
    ).toBe(false);
  });

  test("a corrected address: the person typed a typo and the member wants the fix", () => {
    expect(
      live(
        ["ana@example.com"],
        [typed("Write to ana@example.co saying hello")],
      ),
    ).toBe(false);
  });

  test("a recipient the person did not type, next to one they did", () => {
    expect(live(["ana@example.com", "carla@example.com"], request)).toBe(false);
  });

  test("an address in the request that only appears inside a longer address", () => {
    expect(
      live(["ana@example.com"], [typed("write to ana@example.com.au")]),
    ).toBe(false);
    expect(
      live(["ana@example.com"], [typed("write to maria.ana@example.com")]),
    ).toBe(false);
  });

  test("a name is not an address", () => {
    expect(live(["ana@example.com"], [typed("Write to Ana saying hi")])).toBe(
      false,
    );
  });
});

describe("what the call carries must itself be plain addresses", () => {
  const request = [typed("Write to ana@example.com and bob@example.org")];

  test("a display name, a header injection or a non-address asks", () => {
    for (const to of [
      ["Ana <ana@example.com>"],
      ["ana@example.com\r\nBcc: spy@example.com"],
      ["ana@example.com, bob@example.org"],
      ["ana"],
      [""],
      [null],
      [7],
    ]) {
      expect(live(to, request)).toBe(false);
    }
  });

  test("no recipients, too many, or not a list asks", () => {
    expect(live([], request)).toBe(false);
    expect(live("ana@example.com", request)).toBe(false);
    expect(live(undefined, request)).toBe(false);
    expect(live({ 0: "ana@example.com" }, request)).toBe(false);
    const six = Array.from(
      { length: 6 },
      (_, index) => `p${index}@example.com`,
    );
    expect(live(six, [typed(six.join(" "))])).toBe(false);
    const five = six.slice(0, 5);
    expect(live(five, [typed(five.join(" "))])).toBe(true);
  });
});

describe("a turn the person did not start in their own live chat never passes", () => {
  const request = [typed("Write to ana@example.com saying good morning")];
  const to = ["ana@example.com"];

  test("a routine's run", () => {
    expect(
      live(to, request, { runInitiator: { kind: "routine", id: "rt_1" } }),
    ).toBe(false);
    expect(
      live(to, request, { callInitiator: { kind: "routine", id: "rt_1" } }),
    ).toBe(false);
  });

  test("a check-in's run", () => {
    expect(
      live(to, request, {
        runInitiator: { kind: "responsibility", id: "resp_1" },
      }),
    ).toBe(false);
    expect(
      live(to, request, {
        callInitiator: { kind: "responsibility", id: "resp_1" },
      }),
    ).toBe(false);
  });

  test("a memory run and the deployment acting as itself", () => {
    expect(
      live(to, request, { runInitiator: { kind: "memory", id: "mem_1" } }),
    ).toBe(false);
    expect(live(to, request, { runInitiator: { kind: "deployment" } })).toBe(
      false,
    );
    expect(live(to, request, { callInitiator: { kind: "deployment" } })).toBe(
      false,
    );
  });

  test("a turn the server started on the person's behalf carries the person and still asks", () => {
    // Tasks, a message delivered from another channel, a group conversation and the continuation
    // after another approval all run under the person's initiator, which a live chat turn does not.
    expect(live(to, request, { runInitiator: PERSON_INITIATOR })).toBe(false);
  });

  test("a hand-off, whatever its origin says, is not the person's own live turn: the direct rule asks", () => {
    const hop = (origin?: AuditInitiator): AuditInitiator =>
      origin
        ? { kind: "handoff", id: "bot_iris", origin }
        : { kind: "handoff", id: "bot_iris" };
    for (const initiator of [
      hop(PERSON_INITIATOR),
      hop({ kind: "routine", id: "rt_1" }),
      hop(),
    ]) {
      expect(live(to, request, { runInitiator: initiator })).toBe(false);
      expect(live(to, request, { callInitiator: initiator })).toBe(false);
      // Even with the person's request as the last user message of the hop's history.
      expect(
        live(to, request, {
          runInitiator: initiator,
          callInitiator: initiator,
        }),
      ).toBe(false);
    }
  });
});

/** A hop's run, as `agentFor` gives the addressed member it: handed on by `iris` for a person. */
const HOP: AuditInitiator = {
  kind: "handoff",
  id: "bot_iris",
  origin: PERSON_INITIATOR,
};

/** The hand-off rule: the person's message the server loaded from the origin conversation. */
function handed(
  to: unknown,
  request: ConversationMessage | null,
  overrides: Partial<Parameters<typeof recipientsTypedInHandedRequest>[0]> = {},
): boolean {
  return recipientsTypedInHandedRequest({
    to,
    request,
    runInitiator: HOP,
    callInitiator: HOP,
    ...overrides,
  });
}

describe("a hop that carries the person's own request: the same rule on that message alone", () => {
  const asked = typed("Send an email to ana@example.com saying good morning");

  test("passes when every recipient is a whole word of the message the server loaded", () => {
    expect(handed(["ana@example.com"], asked)).toBe(true);
    expect(
      handed(
        ["ana@example.com", "BOB@example.com"],
        typed("Write to ana@example.com and bob@example.com"),
      ),
    ).toBe(true);
  });

  test("a call that carries no initiator of its own is the hop's, and passes", () => {
    expect(
      handed(["ana@example.com"], asked, { callInitiator: undefined }),
    ).toBe(true);
  });

  test("asks when the server loaded no message: no mark, a stale one, an unreadable conversation", () => {
    expect(handed(["ana@example.com"], null)).toBe(false);
  });

  test("asks for an address the person did not type, a corrected one, or an extra one", () => {
    expect(handed(["eve@example.com"], asked)).toBe(false);
    expect(handed(["ana@example.co"], asked)).toBe(false);
    expect(handed(["ana@example.com", "eve@example.com"], asked)).toBe(false);
    expect(handed(["ana.smith@example.com"], asked)).toBe(false);
  });

  test("asks when the message is a long paste, not a request", () => {
    const paste = typed(
      `Write to ana@example.com. ${"Notes from the meeting. ".repeat(40)}`,
    );
    expect(paste.content).toBeString();
    expect((paste.content as string).length).toBeGreaterThan(MAX_REQUEST_CHARS);
    expect(handed(["ana@example.com"], paste)).toBe(false);
  });

  test("asks when the message is not a plain string, or has no id of its own to name", () => {
    expect(
      handed(
        ["ana@example.com"],
        typed([{ type: "text", text: "ana@example.com" }]),
      ),
    ).toBe(false);
    // The envelope a hand-off delivers is a Bot's text, whatever its role.
    expect(
      handed(
        ["ana@example.com"],
        typed("Write to ana@example.com", "handoff-run-1"),
      ),
    ).toBe(false);
  });

  test("asks when the call is not what a hop's call looks like: the person's own initiator, another Bot's, a routine's", () => {
    for (const callInitiator of [
      PERSON_INITIATOR,
      { kind: "handoff", id: "bot_other", origin: PERSON_INITIATOR },
      { kind: "handoff", id: "bot_iris" },
      { kind: "routine", id: "rt_1" },
      { kind: "deployment" },
    ] as AuditInitiator[])
      expect(handed(["ana@example.com"], asked, { callInitiator })).toBe(false);
  });

  test("asks when the run is not a hop from a person: the person's own turn, a routine's hop, one with no origin, anything else", () => {
    for (const runInitiator of [
      undefined,
      PERSON_INITIATOR,
      { kind: "routine", id: "rt_1" },
      {
        kind: "handoff",
        id: "bot_iris",
        origin: { kind: "routine", id: "rt_1" },
      },
      {
        kind: "handoff",
        id: "bot_iris",
        origin: { kind: "responsibility", id: "c" },
      },
      { kind: "handoff", id: "bot_iris" },
      { kind: "deployment" },
    ] as (AuditInitiator | undefined)[])
      expect(
        handed(["ana@example.com"], asked, {
          runInitiator,
          callInitiator: undefined,
        }),
      ).toBe(false);
  });

  test("asks when the recipients are not a list of one to five plain addresses", () => {
    expect(handed("ana@example.com", asked)).toBe(false);
    expect(handed([], asked)).toBe(false);
    expect(handed(["Ana <ana@example.com>"], asked)).toBe(false);
    expect(
      handed(
        Array.from({ length: 6 }, (_, index) => `p${index}@example.com`),
        typed(
          Array.from({ length: 6 }, (_, index) => `p${index}@example.com`).join(
            " ",
          ),
        ),
      ),
    ).toBe(false);
  });
});
