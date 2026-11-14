import { describe, expect, test } from "bun:test";
import {
  aloneText,
  blockText,
  CHOICES_UNREADABLE,
  chainText,
  ENGINE_MODES,
  type LeftOutWhy,
  leftOutText,
  modeLabel,
  pinText,
  SAVED_TEXT,
  sourceText,
  UNDONE_TEXT,
} from "@/freeduet/engines-text";

/**
 * The sentences of the Engines page's member section (docs/design/engines-dashboard.md, slice 7a). Pure: the words are
 * checked without a page. Each control has one sentence for what happens next, in the words the router itself uses to the
 * person when an engine runs out (agent-freeduet's engine_notices.py).
 */

const NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gateway: "A gateway",
};
const nameOf = (id: string) => NAMES[id] ?? id;

describe("the two answers to what happens when an engine runs out", () => {
  test("there are two, each with a label and one sentence of what happens next", () => {
    expect(ENGINE_MODES).toEqual([
      {
        mode: "automatic",
        label: "Switch automatically",
        effect:
          "When an engine runs out, the next one answers and you are told which.",
      },
      {
        mode: "ask-first",
        label: "Ask me first",
        effect:
          "When an engine runs out, you are asked: switch, wait, or name another engine.",
      },
    ]);
  });

  test("a mode has its label, and a word nobody knows is shown as it is", () => {
    expect(modeLabel("automatic")).toBe("Switch automatically");
    expect(modeLabel("ask-first")).toBe("Ask me first");
    expect(modeLabel("something-new" as never)).toBe("something-new");
  });
});

describe("the engines a member will try", () => {
  test("in the order they will be tried, by name", () => {
    expect(chainText(["claude", "codex"], nameOf)).toBe(
      "Tries Claude Code, then Codex.",
    );
    expect(chainText(["claude", "codex", "gateway"], nameOf)).toBe(
      "Tries Claude Code, then Codex, then A gateway.",
    );
  });

  test("one engine says it is the only one, and none says nothing can answer", () => {
    expect(chainText(["claude"], nameOf)).toBe("Tries only Claude Code.");
    expect(chainText([], nameOf)).toBe(
      "No engine can answer for this member now.",
    );
  });

  test("an engine the list does not know is named by its id", () => {
    expect(chainText(["unlisted"], nameOf)).toBe("Tries only unlisted.");
  });
});

describe("an engine that will not run", () => {
  const WHY: Record<LeftOutWhy, string> = {
    locked: "the installation's file does not allow it",
    disabled: "it is switched off",
    paid_gateway: "it is a paid gateway, which FreeDuet does not run yet",
    metered_off: "paid engines are switched off",
    cap_zero: "its spending cap is zero",
    not_set_up: "it is not set up on this installation",
    other: "it will not run",
  };

  test("each reason has its own words", () => {
    for (const [why, words] of Object.entries(WHY))
      expect(
        leftOutText({ id: "gateway", why: why as LeftOutWhy }, nameOf),
      ).toBe(`Not used: A gateway, because ${words}.`);
  });

  test("a reason the page was not written for reads as the general one, and says nothing it does not know", () => {
    expect(
      leftOutText({ id: "gateway", why: "brand-new" as never }, nameOf),
    ).toBe("Not used: A gateway, because it will not run.");
  });
});

describe("a pin, a single engine and whose value it is", () => {
  test("a pin says the member never switches, and that the installation's file did it", () => {
    expect(pinText("claude", nameOf)).toBe(
      "Pinned to Claude Code by the installation's file: it never switches to another engine.",
    );
  });

  test("a member with one engine is told there is nothing to switch to yet, and that the choice is kept", () => {
    expect(aloneText(["claude"], nameOf)).toBe(
      "Only Claude Code is set up for this member, so there is nothing to switch to yet. Your choice is kept for when there is.",
    );
    expect(aloneText(["claude", "codex"], nameOf)).toBeNull();
    expect(aloneText([], nameOf)).toBeNull();
  });

  test("the file's value and the person's own are different sentences, and the person's says what the file has", () => {
    expect(sourceText({ chosen: false, fileMode: "automatic" })).toBe(
      "From the installation's file.",
    );
    expect(sourceText({ chosen: true, fileMode: "automatic" })).toBe(
      "Your choice. The installation's file says: switch automatically.",
    );
    expect(sourceText({ chosen: true, fileMode: "ask-first" })).toBe(
      "Your choice. The installation's file says: ask me first.",
    );
  });
});

describe("why the controls do not work, and what a change says", () => {
  test("each reason the server gives has one sentence", () => {
    expect(blockText("not_at_the_computer")).toBe(
      "Change these on the computer FreeDuet runs on.",
    );
    expect(blockText("agent_too_old")).toBe("Update FreeDuet to change this.");
    expect(blockText("choices_unreadable")).toBe(CHOICES_UNREADABLE);
  });

  test("choices that cannot be read say the installation's settings are in use and that nothing was lost", () => {
    expect(CHOICES_UNREADABLE).toBe(
      "Your choices could not be read, so the installation's settings are in use. Nothing you chose is lost.",
    );
  });

  test("a change says when it applies, and so does an Undo", () => {
    expect(SAVED_TEXT).toBe(
      "Saved. It applies from the member's next message.",
    );
    expect(UNDONE_TEXT).toBe(
      "Undone. The previous setting applies from the member's next message.",
    );
  });

  test("no sentence names a key, an address, a provider's price or the way to get a key", () => {
    const all = [
      ...ENGINE_MODES.flatMap((entry) => [entry.label, entry.effect]),
      CHOICES_UNREADABLE,
      SAVED_TEXT,
      UNDONE_TEXT,
      blockText("not_at_the_computer"),
      blockText("agent_too_old"),
      aloneText(["claude"], nameOf) ?? "",
      pinText("claude", nameOf),
      ...Object.keys({
        locked: 1,
        disabled: 1,
        paid_gateway: 1,
        metered_off: 1,
        cap_zero: 1,
        not_set_up: 1,
        other: 1,
      }).map((why) =>
        leftOutText({ id: "gateway", why: why as LeftOutWhy }, nameOf),
      ),
    ].join("\n");
    expect(all).not.toMatch(/api[ _-]?key|https?:|per token|\$\d|no api fees/i);
  });
});
