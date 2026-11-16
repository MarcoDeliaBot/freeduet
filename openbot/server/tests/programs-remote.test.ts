/**
 * Programs and a remote session (docs/design/programs-on-your-computer.md 4.4 and 6.1, D60): a phone cannot
 * answer a programs card, and the programs routes are on the list of what a remote session may not reach.
 * The whole-app check that every registered route is on that list is `remote-limits-ledger.test.ts`.
 */
import { describe, expect, test } from "bun:test";
import { remoteMayAnswer } from "../src/approvals/remote-answer";
import type { ApprovalAction } from "../src/approvals/types";
import { decidingEntry, remoteMayReach } from "../src/auth/remote-limits";

const card = (toolRef: string, effect = "write") =>
  ({
    actorId: "u",
    botId: "fixer",
    toolRef,
    effect,
    scope: "programs",
    args: { kind: "list_installed" },
    runId: "r",
    threadId: "t",
    toolCallId: "c",
    actionDigest: "d",
    policy: {
      behaviour: "ask",
      source: "always_ask",
      reason: "Asked every time.",
    },
  }) as unknown as ApprovalAction;

describe("a card for a program on the person's computer", () => {
  test("a remote session may neither allow it once nor deny it, for any programs tool", () => {
    for (const toolRef of [
      "programs/list_installed",
      "programs/list_updates",
      "programs/update_one",
      "programs/install_one",
    ])
      for (const decision of ["allow_once", "deny"])
        expect(remoteMayAnswer(decision, card(toolRef)).allowed).toBe(false);
  });

  test("a card of an ordinary tool is still answered from a remote session, as before", () => {
    expect(
      remoteMayAnswer("allow_once", card("mcp/gmail/send_email")).allowed,
    ).toBe(true);
  });
});

describe("the routes", () => {
  const routes: [string, string][] = [
    ["POST", "/api/programs/helper/poll"],
    ["POST", "/api/programs/helper/result"],
    ["GET", "/api/programs"],
    ["PUT", "/api/programs/switch"],
    ["GET", "/api/programs/anything-later"],
  ];
  test("each is decided by a family the list names, and refused to a remote session", () => {
    for (const [method, path] of routes) {
      const entry = decidingEntry(method, path.split("/").filter(Boolean));
      expect(entry?.family).toBe("computers");
      expect(entry?.verdict).toBe("refuse");
      expect(remoteMayReach(method, path)).toBe(false);
    }
  });
});
