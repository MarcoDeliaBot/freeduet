import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright";
import { parseAriaSnapshot } from "../src/aria-snapshot";
import {
  SecretFieldError,
  fillUnlessSecret,
  SENSITIVE_FIELD_SELECTOR,
} from "../src/secret-masking";
import {
  checkDateValue,
  ChoiceError,
  chooseOnField,
  describeChoiceField,
  isNativeOption,
  matchOption,
  OPTIONS_LIMIT,
} from "../src/select-field";

/**
 * Native menus and date fields for a model (D123, item 2).
 *
 * The pure half (matching an option, checking a date) runs everywhere. The browser half runs on a local
 * page set with `setContent`, so it dials nothing, and is asked for by name like the other real-browser
 * tests:
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/tmp/pn-pw-browsers OPENBOT_COMPUTER_BROWSER=1 COMPUTER_BROWSER_MODE=headless \
 *     bun test tests/select-field.test.ts
 */
const options = [
  { label: "Choose", value: "" },
  { label: "Italy", value: "it" },
  { label: "France", value: "fr", disabled: true },
  { label: "Spain", value: "es" },
  { label: "Delivery", value: "d1" },
  { label: "Delivery", value: "d2" },
  { label: "Other", value: "Italy" },
];

describe("matching an option", () => {
  test("by label, then value, then label ignoring case", () => {
    expect(matchOption(options, "Spain")).toBe(3);
    expect(matchOption(options, "  Spain ")).toBe(3);
    expect(matchOption(options, "es")).toBe(3);
    expect(matchOption(options, "spain")).toBe(3);
    // A label wins over another option's value.
    expect(matchOption(options, "Italy")).toBe(1);
  });
  test("a disabled option, an unknown one and an ambiguous one are refused, never guessed", () => {
    expect(() => matchOption(options, "France")).toThrow(/disabled/);
    expect(() => matchOption(options, "Mars")).toThrow(/no option "Mars"/);
    expect(() => matchOption(options, "Delivery")).toThrow(/2 options match/);
    expect(() => matchOption(options, "Mars")).toThrow(ChoiceError);
  });
});

describe("checking a date or time value", () => {
  test("accepts the ISO forms of the five input types", () => {
    for (const [type, value] of [
      ["date", "2026-02-28"],
      ["date", "2028-02-29"],
      ["time", "14:30"],
      ["time", "14:30:15"],
      ["datetime-local", "2026-03-28T14:30"],
      ["month", "2026-03"],
      ["week", "2026-W13"],
      ["week", "2026-W53"],
    ] as const) {
      expect(checkDateValue(type, value)).toBeUndefined();
    }
  });
  test("refuses a shape or a date that does not exist, and says the form", () => {
    for (const [type, value] of [
      ["date", "28/03/2026"],
      ["date", "2026-02-30"],
      ["date", "2027-02-29"],
      ["date", "tomorrow"],
      ["time", "25:00"],
      ["time", "2:30pm"],
      ["datetime-local", "2026-03-28 14:30"],
      ["datetime-local", "2026-13-01T10:00"],
      ["month", "2026-13"],
      ["week", "2026-W54"],
      ["week", "2027-W53"],
    ] as const) {
      expect(checkDateValue(type, value)).toMatch(/ISO form/);
    }
  });
});

/**
 * The error a call ends with. Not `expect(...).rejects`: under bun it took seconds to settle on a
 * rejection that arrives after a browser round trip, and this keeps the test fast and the assertion plain.
 */
async function failure(call: Promise<unknown>): Promise<Error> {
  return call.then(
    () => {
      throw new Error("The call was expected to be refused and was not.");
    },
    (caught: unknown) => caught as Error,
  );
}

const asked = process.env.OPENBOT_COMPUTER_BROWSER === "1";
const TIMEOUT = 2_000;
const acting = { timeout: TIMEOUT };
let browser: Browser;

beforeAll(async () => {
  if (!asked) return;
  const { chromium } = await import("playwright");
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

const PAGE = `
<label>Country <select id="country">
  <option value="">Choose</option><option value="it">Italy</option>
  <option value="fr" disabled>France</option><option value="es">Spain</option>
  <optgroup label="Locked" disabled><option value="de">Germany</option></optgroup>
</select></label>
<label>Toppings <select id="toppings" multiple>
  <option value="ham">Ham</option><option value="olives" selected>Olives</option><option value="egg">Egg</option>
</select></label>
<label>Day <input id="day" type="date" min="2026-01-01" max="2026-12-31"></label>
<label>At <input id="at" type="time"></label>
<label>Slot <input id="slot" type="datetime-local"></label>
<label>Month <input id="month" type="month"></label>
<label>Week <input id="week" type="week"></label>
<label>Frozen <input id="frozen" type="date" disabled></label>
<label>Name <input id="name" type="text"></label>
<label>Expiry month <select id="exp" autocomplete="cc-exp-month"><option value="01">01</option><option value="02">02</option></select></label>
<div role="combobox" aria-label="Custom menu" tabindex="0">Pick</div>
<label>Big <select id="big"></select></label>
<script>
  window.events = [];
  for (const id of ["country", "toppings", "day", "at"]) {
    for (const type of ["input", "change"])
      document.getElementById(id).addEventListener(type, () => window.events.push(id + ":" + type));
  }
  const big = document.getElementById("big");
  for (let i = 0; i < 80; i++) big.add(new Option("Option " + i, "v" + i));
</script>`;

async function pageWithFixture(): Promise<Page> {
  const tab = await browser.newPage();
  await tab.setContent(`<!doctype html><body>${PAGE}</body>`);
  return tab;
}

async function refOf(tab: Page, name: string): Promise<string> {
  const parsed = parseAriaSnapshot(
    await tab.ariaSnapshot({ mode: "ai", timeout: TIMEOUT }),
    tab.url(),
  );
  const found = parsed.elements.find((element) => element.name === name);
  if (!found) throw new Error(`No element named ${name} in the snapshot.`);
  return found.ref;
}
const field = async (tab: Page, name: string) =>
  tab.locator(`aria-ref=${await refOf(tab, name)}`);
const valueIn = (tab: Page, id: string) => tab.locator(`#${id}`).inputValue();
const selectedOf = (tab: Page, id: string) =>
  tab
    .locator(`#${id}`)
    .evaluate((el) =>
      Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value),
    );

describe.skipIf(!asked)("in a real browser", () => {
  test("before: the typing helper cannot fill a menu, which is the gap", async () => {
    const tab = await pageWithFixture();
    const error = await fillUnlessSecret(
      await field(tab, "Country"),
      "Italy",
      acting,
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(String(error)).toMatch(/not an <input>/);
    expect(await valueIn(tab, "country")).toBe("");
    await tab.close();
  }, 15_000);

  test("chooses by label, by value and by label in another case, and says what the menu now shows", async () => {
    const tab = await pageWithFixture();
    const menu = await field(tab, "Country");
    expect(await chooseOnField(menu, "Italy", acting)).toEqual({
      kind: "select",
      selected: [{ label: "Italy", value: "it" }],
    });
    expect(await valueIn(tab, "country")).toBe("it");
    expect(await chooseOnField(menu, "es", acting)).toMatchObject({
      selected: [{ label: "Spain" }],
    });
    expect(await chooseOnField(menu, "italy", acting)).toMatchObject({
      selected: [{ value: "it" }],
    });
    // The page heard it as a person's pick: input and change both fired.
    const events = (await tab.evaluate(
      () => (window as unknown as { events: string[] }).events,
    )) as string[];
    expect(events).toContain("country:input");
    expect(events).toContain("country:change");
    await tab.close();
  }, 15_000);

  test("a disabled option, a disabled group, an unknown one and a list for a single menu change nothing", async () => {
    const tab = await pageWithFixture();
    const menu = await field(tab, "Country");
    await chooseOnField(menu, "Italy", acting);
    for (const wanted of ["France", "Germany"]) {
      expect(
        (await failure(chooseOnField(menu, wanted, acting))).message,
      ).toMatch(/disabled/);
    }
    expect(
      (await failure(chooseOnField(menu, "Mars", acting))).message,
    ).toMatch(/offers: .*Italy/);
    expect(
      (await failure(chooseOnField(menu, ["Italy", "Spain"], acting))).message,
    ).toMatch(/exactly one/);
    expect(await valueIn(tab, "country")).toBe("it");
    await tab.close();
  }, 15_000);

  test("a multiple menu takes a list, replaces the choice, and an empty list clears it", async () => {
    const tab = await pageWithFixture();
    const menu = await field(tab, "Toppings");
    expect(await selectedOf(tab, "toppings")).toEqual(["olives"]);
    const result = await chooseOnField(menu, ["Ham", "egg"], acting);
    expect(result).toEqual({
      kind: "select",
      selected: [
        { label: "Ham", value: "ham" },
        { label: "Egg", value: "egg" },
      ],
    });
    expect(await selectedOf(tab, "toppings")).toEqual(["ham", "egg"]);
    await chooseOnField(menu, [], acting);
    expect(await selectedOf(tab, "toppings")).toEqual([]);
    await tab.close();
  }, 15_000);

  test("fills each date and time type and reads back the value, with the events", async () => {
    const tab = await pageWithFixture();
    for (const [name, id, value] of [
      ["Day", "day", "2026-03-28"],
      ["At", "at", "14:30"],
      ["Slot", "slot", "2026-03-28T14:30"],
      ["Month", "month", "2026-03"],
      ["Week", "week", "2026-W13"],
    ] as const) {
      const result = await chooseOnField(await field(tab, name), value, acting);
      expect(result).toMatchObject({ kind: "date", value });
      expect(await valueIn(tab, id)).toBe(value);
    }
    const events = (await tab.evaluate(
      () => (window as unknown as { events: string[] }).events,
    )) as string[];
    expect(events).toContain("day:change");
    expect(events).toContain("at:input");
    // An empty value clears.
    expect(
      await chooseOnField(await field(tab, "Day"), "", acting),
    ).toMatchObject({ value: "" });
    await tab.close();
  }, 20_000);

  test("a malformed date, a read-only one and a text field are refused and nothing changes", async () => {
    const tab = await pageWithFixture();
    const day = await field(tab, "Day");
    await chooseOnField(day, "2026-03-28", acting);
    expect(
      (await failure(chooseOnField(day, "2026-02-30", acting))).message,
    ).toMatch(/ISO form/);
    expect(
      (await failure(chooseOnField(day, ["2026-03-01"], acting))).message,
    ).toMatch(/one value/);
    expect(await valueIn(tab, "day")).toBe("2026-03-28");
    expect(
      (
        await failure(
          chooseOnField(await field(tab, "Frozen"), "2026-03-01", acting),
        )
      ).message,
    ).toMatch(/disabled/);
    expect(
      (await failure(chooseOnField(await field(tab, "Name"), "x", acting)))
        .message,
    ).toMatch(/computer_type/);
    await tab.close();
  }, 15_000);

  test("a date outside the field's own range is kept but flagged", async () => {
    const tab = await pageWithFixture();
    const result = await chooseOnField(
      await field(tab, "Day"),
      "2030-01-01",
      acting,
    );
    expect(result).toEqual({
      kind: "date",
      inputType: "date",
      value: "2030-01-01",
      outOfRange: true,
    });
    await tab.close();
  }, 15_000);

  test("a custom drop-down is not handled here and the member is told how to use it", async () => {
    const tab = await pageWithFixture();
    expect(
      (
        await failure(
          chooseOnField(await field(tab, "Custom menu"), "x", acting),
        )
      ).message,
    ).toMatch(/computer_click/);
    await tab.close();
  }, 15_000);

  test("a sensitive menu is refused with the typed entry's sentence and stays as it was", async () => {
    const tab = await pageWithFixture();
    const menu = await field(tab, "Expiry month");
    const error = await chooseOnField(menu, "02", acting).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SecretFieldError);
    expect(await valueIn(tab, "exp")).toBe("01");
    // And a menu inside a block the page marks as secret.
    await tab.evaluate(() =>
      document
        .getElementById("country")
        ?.setAttribute("data-openbot-secret", ""),
    );
    expect(
      await failure(
        chooseOnField(await field(tab, "Country"), "Italy", acting),
      ),
    ).toBeInstanceOf(SecretFieldError);
    expect(await valueIn(tab, "country")).toBe("");
    await tab.close();
  }, 15_000);

  test("the snapshot side lists options with label, value, disabled and selected, capped", async () => {
    const tab = await pageWithFixture();
    const read = async (name: string, limit = OPTIONS_LIMIT) =>
      (await field(tab, name)).evaluate(describeChoiceField, {
        selector: SENSITIVE_FIELD_SELECTOR,
        limit,
        textLimit: 120,
      });
    const country = await read("Country");
    expect(country).toMatchObject({
      kind: "select",
      multiple: false,
      total: 5,
    });
    if (country.kind !== "select") throw new Error("not a menu");
    expect(country.options).toEqual([
      { label: "Choose", value: "", selected: true },
      { label: "Italy", value: "it" },
      { label: "France", value: "fr", disabled: true },
      { label: "Spain", value: "es" },
      { label: "Germany", value: "de", disabled: true },
    ]);
    const toppings = await read("Toppings");
    expect(toppings).toMatchObject({ kind: "select", multiple: true });
    const big = await read("Big");
    if (big.kind !== "select") throw new Error("not a menu");
    expect(big.options).toHaveLength(OPTIONS_LIMIT);
    expect(big.total).toBe(80);
    const day = await read("Day");
    expect(day).toMatchObject({
      kind: "date",
      type: "date",
      min: "2026-01-01",
      max: "2026-12-31",
    });
    // The options a menu draws in the tree cannot be clicked, so the snapshot drops them.
    const optionRef = parseAriaSnapshot(
      await tab.ariaSnapshot({ mode: "ai", timeout: TIMEOUT }),
      tab.url(),
    ).elements.find((element) => element.role === "option");
    if (optionRef) {
      expect(
        await tab.locator(`aria-ref=${optionRef.ref}`).evaluate(isNativeOption),
      ).toBe(true);
    }
    await tab.close();
  }, 20_000);
});
