import { expect, test } from "bun:test";
import { botNameForDecision } from "@/lib/agents/bot-names";

/**
 * The name shown where a person decides an action (docs/design/settings-in-chat.md, 8.10.1).
 *
 * A name the person gave a member is a label, and a label can look like somebody else's name. Where
 * they allow or refuse something the member wants to do, the label comes with the member's own name
 * beside it, so a card that says "Kiki" can never be read as a different member.
 */

test("a member the person renamed is shown by that name, with its own name beside it", () => {
  expect(
    botNameForDecision({ name: "Kiki", realName: "Otto" }, "agent-1"),
  ).toBe("Kiki (Otto)");
});

test("a member nobody renamed is shown by its own name, with nothing beside it", () => {
  expect(botNameForDecision({ name: "Otto" }, "agent-1")).toBe("Otto");
});

test("a name that is the member's own name is not said twice", () => {
  expect(
    botNameForDecision({ name: "Otto", realName: "Otto" }, "agent-1"),
  ).toBe("Otto");
});

test("a member the roster does not hold is its id, as before", () => {
  expect(botNameForDecision(undefined, "agent-1")).toBe("agent-1");
});
