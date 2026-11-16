import { describe, expect, test } from "bun:test";
import {
  INTELLIGENCE_SWITCH,
  type LocalRuntime,
  localRuntimeFrom,
} from "../src/freeduet/intelligence-switch";

// FREEDUET_INTELLIGENCE as localRuntimeFrom reads it. Unset and blank values give upstream's
// contract. `on` and `off` are read in any case, with spaces around them. Anything else is refused.
// With the switch off, ignoredIntelligenceVariables names the variables set to a non-blank value.

// The Intelligence variables the switch lists while it is off, in the order the code lists them.
const INTELLIGENCE_VARIABLES = [
  "INTELLIGENCE_API_KEY",
  "COPILOTKIT_LICENSE_TOKEN",
  "INTELLIGENCE_SERVICE_TOKEN",
  "INTELLIGENCE_PROJECT_ID",
  "CPK_INTELLIGENCE_LEARNING_CONTAINER_ID",
];

// Every listed variable set to a value, so the switch has something to list.
const EVERY_VARIABLE_SET: Record<string, string> = Object.fromEntries(
  INTELLIGENCE_VARIABLES.map((name) => [name, "set"]),
);

/** The local runtime the switch returns for `off`, with these variables listed. */
function offRuntime(ignoredIntelligenceVariables: string[]): LocalRuntime {
  return { mode: "local", durableHistory: true, ignoredIntelligenceVariables };
}

/** The message localRuntimeFrom throws for this value, or undefined when it accepts the value. */
function refusalFor(value: string): string | undefined {
  try {
    localRuntimeFrom({ [INTELLIGENCE_SWITCH]: value });
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

describe("unset or blank: no local runtime, so upstream's Intelligence contract applies", () => {
  test("unset: no local runtime, so upstream's contract applies, not the off the env files write", () => {
    expect(localRuntimeFrom({})).toBeUndefined();
  });

  test("unset with the Intelligence variables set: still no local runtime, so no list", () => {
    expect(
      localRuntimeFrom({
        INTELLIGENCE_API_KEY: "key",
        INTELLIGENCE_PROJECT_ID: "project",
      }),
    ).toBeUndefined();
  });

  test("explicitly undefined is read as unset", () => {
    expect(
      localRuntimeFrom({ [INTELLIGENCE_SWITCH]: undefined }),
    ).toBeUndefined();
  });

  test.each([
    ["the empty string", ""],
    ["three spaces", "   "],
    ["a tab", "\t"],
  ])("%s is read as unset", (_, value) => {
    expect(localRuntimeFrom({ [INTELLIGENCE_SWITCH]: value })).toBeUndefined();
  });
});

describe("on and off, in any case and with spaces around them", () => {
  test.each(["on", "ON", "On", " on "])(
    "%p is upstream's contract: no local runtime",
    (value) => {
      expect(
        localRuntimeFrom({ [INTELLIGENCE_SWITCH]: value }),
      ).toBeUndefined();
    },
  );

  test.each(["off", "OFF", "Off", " off "])(
    "%p is the local runtime",
    (value) => {
      expect(localRuntimeFrom({ [INTELLIGENCE_SWITCH]: value })).toEqual(
        offRuntime([]),
      );
    },
  );
});

describe("a value that is neither on nor off is refused, and the message quotes it as typed", () => {
  test('"of" is refused with the exact text a person reads', () => {
    expect(refusalFor("of")).toBe(
      'FREEDUET_INTELLIGENCE must be "on" or "off", not "of".',
    );
  });

  test('"true" is refused with the exact text a person reads', () => {
    expect(refusalFor("true")).toBe(
      'FREEDUET_INTELLIGENCE must be "on" or "off", not "true".',
    );
  });

  test.each([
    "false",
    "0",
    "1",
    "yes",
    "no",
    "enabled",
    "offf",
    "o ff",
    "on off",
  ])("%p is refused", (value) => {
    expect(refusalFor(value)).toBe(
      `FREEDUET_INTELLIGENCE must be "on" or "off", not "${value}".`,
    );
  });

  test("the case and spaces of the value are kept in the message", () => {
    expect(refusalFor(" Of ")).toBe(
      'FREEDUET_INTELLIGENCE must be "on" or "off", not " Of ".',
    );
  });
});

describe("ignoredIntelligenceVariables with the switch off", () => {
  test("none set: an empty list", () => {
    expect(localRuntimeFrom({ [INTELLIGENCE_SWITCH]: "off" })).toEqual(
      offRuntime([]),
    );
  });

  test.each(INTELLIGENCE_VARIABLES)(
    "%s set: that name alone is listed",
    (name) => {
      expect(
        localRuntimeFrom({ [INTELLIGENCE_SWITCH]: "off", [name]: "set" }),
      ).toEqual(offRuntime([name]));
    },
  );

  test("all five set: the exact list, in the code's order", () => {
    expect(
      localRuntimeFrom({ ...EVERY_VARIABLE_SET, [INTELLIGENCE_SWITCH]: "off" }),
    ).toEqual(offRuntime(INTELLIGENCE_VARIABLES));
  });

  test("set in another order: still the code's order, not the order they were given", () => {
    expect(
      localRuntimeFrom({
        CPK_INTELLIGENCE_LEARNING_CONTAINER_ID: "container",
        INTELLIGENCE_PROJECT_ID: "project",
        INTELLIGENCE_API_KEY: "key",
        [INTELLIGENCE_SWITCH]: "off",
      }),
    ).toEqual(
      offRuntime([
        "INTELLIGENCE_API_KEY",
        "INTELLIGENCE_PROJECT_ID",
        "CPK_INTELLIGENCE_LEARNING_CONTAINER_ID",
      ]),
    );
  });

  test.each(["", "   "])("%p counts as not set", (value) => {
    expect(
      localRuntimeFrom({
        [INTELLIGENCE_SWITCH]: "off",
        INTELLIGENCE_API_KEY: value,
      }),
    ).toEqual(offRuntime([]));
  });

  test("a value padded with spaces counts as set, and only its name is listed", () => {
    expect(
      localRuntimeFrom({
        [INTELLIGENCE_SWITCH]: "off",
        INTELLIGENCE_API_KEY: "  key  ",
      }),
    ).toEqual(offRuntime(["INTELLIGENCE_API_KEY"]));
  });
});

describe("ignoredIntelligenceVariables with the switch on", () => {
  test("every variable set: no local runtime, so no list at all", () => {
    expect(
      localRuntimeFrom({ ...EVERY_VARIABLE_SET, [INTELLIGENCE_SWITCH]: "on" }),
    ).toBeUndefined();
  });
});
