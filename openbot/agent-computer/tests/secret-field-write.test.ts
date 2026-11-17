import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright";
import { parseAriaSnapshot } from "../src/aria-snapshot";
import {
  fillUnlessSecret,
  inputTypes,
  keyMayWriteText,
  pressKeyUnlessSecret,
  SECRET_FIELD_REFUSAL,
  SENSITIVE_FIELD_SELECTOR,
  SecretFieldError,
} from "../src/secret-masking";

/**
 * A model cannot type into a password, a code or a card field (D76).
 *
 * The helpers here are the ones `/type` and `/key` in `index.ts` call, run against a real Chromium,
 * because what they decide is a page's own state: a field that turns into a password field when it
 * takes focus, one inside a frame or a shadow root, one hidden. Every refusal is read back from the
 * field: the sentence alone is not proof that nothing was typed.
 *
 * Asked for by name, like `page-links-browser.test.ts`:
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/tmp/pn-pw-browsers OPENBOT_COMPUTER_BROWSER=1 COMPUTER_BROWSER_MODE=headless \
 *     bun test tests/secret-field-write.test.ts
 */
const asked = process.env.OPENBOT_COMPUTER_BROWSER === "1";
const TIMEOUT = 2_000;
const acting = { timeout: TIMEOUT };
const SECRET = "hunter2-do-not-keep";
let browser: Browser;

beforeAll(async () => {
  if (!asked) return;
  const { chromium } = await import("playwright");
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function pageWith(body: string): Promise<Page> {
  const tab = await browser.newPage();
  await tab.setContent(`<!doctype html><body>${body}</body>`);
  return tab;
}

/** The ref a snapshot gives a field, found by its accessible name, as the dispatcher is handed it. */
async function refOf(tab: Page, name: string): Promise<string> {
  const parsed = parseAriaSnapshot(
    await tab.ariaSnapshot({ mode: "ai", timeout: TIMEOUT }),
    tab.url(),
  );
  const found = parsed.elements.find((element) => element.name === name);
  if (!found) throw new Error(`No element named ${name} in the snapshot.`);
  return found.ref;
}

const byRef = (tab: Page, ref: string) => tab.locator(`aria-ref=${ref}`);

async function refused(run: Promise<unknown>) {
  const error = await run.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SecretFieldError);
  expect((error as Error).message).toBe(SECRET_FIELD_REFUSAL);
}

const KINDS: Array<[string, string]> = [
  [
    "a password under a misleading label",
    `<input type="password" aria-label="Username">`,
  ],
  ["a password with no label", `<input type="password" id="f">`],
  [
    "a password labelled in another language",
    `<input type="password" aria-label="Parola d'ordine">`,
  ],
  [
    "a password with an upper-case type",
    `<input type="PASSWORD" aria-label="Notes">`,
  ],
  [
    "a text field with a one-time-code token",
    `<input type="text" autocomplete="one-time-code" aria-label="Notes">`,
  ],
  [
    "a token among others, in capitals",
    `<input type="text" autocomplete="Section-a ONE-TIME-CODE" aria-label="Notes">`,
  ],
  [
    "current-password",
    `<input type="text" autocomplete="current-password" aria-label="Notes">`,
  ],
  [
    "new-password",
    `<input type="text" autocomplete="new-password" aria-label="Notes">`,
  ],
  [
    "cc-number",
    `<input type="text" autocomplete="cc-number" aria-label="Notes">`,
  ],
  ["cc-csc", `<input type="text" autocomplete="cc-csc" aria-label="Notes">`],
  ["cc-exp", `<input type="text" autocomplete="cc-exp" aria-label="Notes">`],
  [
    "cc-exp-month",
    `<input type="text" autocomplete="cc-exp-month" aria-label="Notes">`,
  ],
  [
    "cc-exp-year",
    `<input type="text" autocomplete="cc-exp-year" aria-label="Notes">`,
  ],
  [
    "a textarea with a code token",
    `<textarea autocomplete="one-time-code" aria-label="Notes"></textarea>`,
  ],
  [
    "a field a secret was typed into earlier",
    `<input type="text" data-openbot-secret="true" aria-label="Notes">`,
  ],
  [
    "a text field drawn as dots",
    `<input type="text" style="-webkit-text-security: disc" aria-label="Notes">`,
  ],
  [
    "a contenteditable inside a marked block",
    `<div data-openbot-secret="true"><div contenteditable="true" role="textbox" aria-label="Notes"></div></div>`,
  ],
  [
    "a contenteditable drawn as dots",
    `<div contenteditable="true" role="textbox" style="-webkit-text-security: disc" aria-label="Notes"></div>`,
  ],
  [
    "a label that leads to a password",
    `<label for="p" aria-label="Notes">Notes</label><input id="p" type="password" aria-label="Elsewhere">`,
  ],
];

const fieldValue = (tab: Page) =>
  tab.evaluate(() => {
    const field = document.querySelector(
      "input, textarea, [contenteditable]",
    ) as HTMLInputElement | HTMLElement | null;
    if (!field) return "";
    return "value" in field
      ? (field as HTMLInputElement).value
      : (field.textContent ?? "");
  });

describe.skipIf(!asked)(
  "fill: every kind of sensitive field is refused, nothing typed",
  () => {
    for (const [label, markup] of KINDS) {
      test(label, async () => {
        const tab = await pageWith(markup);
        const field = byRef(
          tab,
          await refOf(
            tab,
            label.startsWith("a password with no label")
              ? ""
              : label === "a password under a misleading label"
                ? "Username"
                : label === "a password labelled in another language"
                  ? "Parola d'ordine"
                  : label === "a label that leads to a password"
                    ? "Elsewhere"
                    : "Notes",
          ).catch(() => "none"),
        );
        const target =
          label === "a label that leads to a password"
            ? tab.locator("label")
            : label.startsWith("a password with no label")
              ? tab.locator("#f")
              : field;
        await refused(fillUnlessSecret(target, SECRET, acting));
        expect(await fieldValue(tab)).toBe("");
        await tab.close();
      });
    }

    test("a field that is hidden is refused with the sentence, not a timeout", async () => {
      const tab = await pageWith(
        `<input id="h" type="password" style="display:none">`,
      );
      await refused(fillUnlessSecret(tab.locator("#h"), SECRET, acting));
      expect(await tab.locator("#h").inputValue()).toBe("");
      await tab.close();
    });

    test("a field that turns into a password field when it takes focus is refused before the fill", async () => {
      const tab = await pageWith(
        `<input id="f" type="text" aria-label="Notes" onfocus="this.type='password'">`,
      );
      await refused(fillUnlessSecret(tab.locator("#f"), SECRET, acting));
      expect(await tab.locator("#f").inputValue()).toBe("");
      await tab.close();
    });

    test("a field that flips while the text lands has it wiped, and is refused", async () => {
      const tab = await pageWith(
        `<input id="f" type="text" aria-label="Notes" oninput="this.type='password'">`,
      );
      await refused(fillUnlessSecret(tab.locator("#f"), SECRET, acting));
      expect(await tab.locator("#f").inputValue()).toBe("");
      expect(await tab.locator("#f").getAttribute("type")).toBe("password");
      await tab.close();
    });

    test("a password inside a frame is refused", async () => {
      const tab = await pageWith(
        `<iframe srcdoc="<input type='password' aria-label='Framed'>"></iframe>`,
      );
      await tab
        .frameLocator("iframe")
        .locator("input")
        .waitFor({ timeout: TIMEOUT });
      const field = byRef(tab, await refOf(tab, "Framed"));
      await refused(fillUnlessSecret(field, SECRET, acting));
      expect(
        await tab.frameLocator("iframe").locator("input").inputValue(),
      ).toBe("");
      await tab.close();
    });

    test("a password inside a shadow root is refused", async () => {
      const tab = await pageWith(`<div id="host"></div>`);
      await tab.evaluate(() => {
        const root = document
          .getElementById("host")
          ?.attachShadow({ mode: "open" });
        if (root)
          root.innerHTML = `<input type="password" aria-label="Shadowed">`;
      });
      const field = byRef(tab, await refOf(tab, "Shadowed"));
      await refused(fillUnlessSecret(field, SECRET, acting));
      expect(await tab.locator("#host input").inputValue()).toBe("");
      await tab.close();
    });

    test("an ordinary text field, a textarea and a contenteditable are still typed", async () => {
      const tab = await pageWith(
        `<input id="a" type="text" aria-label="Name"><textarea id="b" aria-label="Message"></textarea>
       <div id="c" contenteditable="true" role="textbox" aria-label="Note"></div>
       <input id="d" type="email" autocomplete="email" aria-label="Email">`,
      );
      await fillUnlessSecret(
        byRef(tab, await refOf(tab, "Name")),
        "Alice",
        acting,
      );
      await fillUnlessSecret(
        byRef(tab, await refOf(tab, "Message")),
        "Hello",
        acting,
      );
      await fillUnlessSecret(
        byRef(tab, await refOf(tab, "Note")),
        "Written",
        acting,
      );
      await fillUnlessSecret(tab.locator("#d"), "a@b.it", acting, {
        submit: false,
      });
      expect(await tab.locator("#a").inputValue()).toBe("Alice");
      expect(await tab.locator("#b").inputValue()).toBe("Hello");
      expect(await tab.locator("#c").textContent()).toBe("Written");
      expect(await tab.locator("#d").inputValue()).toBe("a@b.it");
      await tab.close();
    });

    test("submit presses Enter once the text is in, for an ordinary field", async () => {
      const tab = await pageWith(
        `<form onsubmit="document.title='sent';return false"><input id="a" type="text" aria-label="Search"></form>`,
      );
      await fillUnlessSecret(tab.locator("#a"), "boots", acting, {
        submit: true,
      });
      expect(await tab.title()).toBe("sent");
      await tab.close();
    });

    test("a ref that names nothing is a plain failure, not a typed value", async () => {
      const tab = await pageWith(`<input id="a" type="text">`);
      const error = await fillUnlessSecret(
        tab.locator("aria-ref=e999"),
        SECRET,
        {
          timeout: 300,
        },
      ).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeDefined();
      expect(error).not.toBeInstanceOf(SecretFieldError);
      expect(await tab.locator("#a").inputValue()).toBe("");
      await tab.close();
    });
  },
);

describe.skipIf(!asked)(
  "keys: text into a sensitive field is refused, the rest goes through",
  () => {
    const press = (tab: Page, key: string, field?: ReturnType<typeof byRef>) =>
      pressKeyUnlessSecret(tab, field, key, acting, () =>
        field ? field.press(key, acting) : tab.keyboard.press(key),
      );

    test("a character with a ref, and paste, are refused; the field stays empty", async () => {
      const tab = await pageWith(
        `<input id="p" type="password" aria-label="Pin">`,
      );
      const field = byRef(tab, await refOf(tab, "Pin"));
      await refused(press(tab, "a", field));
      await refused(press(tab, "Shift+A", field));
      await refused(press(tab, "KeyB", field));
      await refused(press(tab, "Digit5", field));
      await refused(press(tab, "Space", field));
      await refused(press(tab, "ControlOrMeta+v", field));
      await refused(press(tab, "Shift+Insert", field));
      expect(await tab.locator("#p").inputValue()).toBe("");
      await tab.close();
    });

    test("with no ref, a key goes where the focus is: a focused password field refuses it", async () => {
      const tab = await pageWith(
        `<input id="p" type="password" aria-label="Pin">`,
      );
      await tab.locator("#p").focus();
      await refused(press(tab, "7"));
      expect(await tab.locator("#p").inputValue()).toBe("");
      await tab.close();
    });

    test("with no ref, a password focused inside a frame refuses it", async () => {
      const tab = await pageWith(
        `<input id="t" type="text"><iframe srcdoc="<input id='p' type='password'>"></iframe>`,
      );
      const inner = tab.frameLocator("iframe").locator("#p");
      await inner.focus({ timeout: TIMEOUT });
      await refused(press(tab, "7"));
      expect(await inner.inputValue()).toBe("");
      await tab.close();
    });

    test("with no ref, a password focused inside a shadow root refuses it", async () => {
      const tab = await pageWith(`<div id="host"></div>`);
      await tab.evaluate(() => {
        const root = document
          .getElementById("host")
          ?.attachShadow({ mode: "open" });
        if (root) root.innerHTML = `<input type="password">`;
      });
      await tab.locator("#host input").focus();
      await refused(press(tab, "7"));
      expect(await tab.locator("#host input").inputValue()).toBe("");
      await tab.close();
    });

    test("a field that turns into a password field on the keypress is wiped", async () => {
      const tab = await pageWith(
        `<input id="f" type="text" aria-label="Notes" oninput="this.type='password'">`,
      );
      await tab.locator("#f").focus();
      await refused(press(tab, "x"));
      expect(await tab.locator("#f").inputValue()).toBe("");
      await tab.close();
    });

    test("keys that write nothing still reach a password field: Enter submits, Tab moves, select-all works", async () => {
      const tab = await pageWith(
        `<form onsubmit="document.title='sent';return false"><input id="p" type="password" aria-label="Pin"><input id="n" type="text"><button>Go</button></form>`,
      );
      const field = byRef(tab, await refOf(tab, "Pin"));
      await press(tab, "Control+a", field);
      await press(tab, "Tab", field);
      expect(await tab.evaluate(() => document.activeElement?.id)).toBe("n");
      await tab.locator("#p").focus();
      await press(tab, "Enter");
      expect(await tab.title()).toBe("sent");
      await tab.close();
    });

    test("an ordinary field is still typed with a key, with a ref and without", async () => {
      const tab = await pageWith(
        `<input id="a" type="text" aria-label="Name">`,
      );
      await press(tab, "x", byRef(tab, await refOf(tab, "Name")));
      await tab.locator("#a").focus();
      await press(tab, "y");
      expect(await tab.locator("#a").inputValue()).toBe("xy");
      await tab.close();
    });
  },
);

describe("which keys can write a character", () => {
  test.each([
    ["a", true],
    ["A", true],
    ["5", true],
    ["+", true],
    ["Shift+a", true],
    ["Control++", true],
    ["KeyA", true],
    ["Digit1", true],
    ["Numpad5", true],
    ["Space", true],
    ["Minus", true],
    ["ControlOrMeta+v", true],
    ["Meta+V", true],
    ["Control+x", true],
    ["Alt+Control+e", true],
    ["Shift+Insert", true],
    ["SomeNewKeyName", true],
    ["Enter", false],
    ["Tab", false],
    ["Escape", false],
    ["Backspace", false],
    ["Delete", false],
    ["ArrowLeft", false],
    ["Shift+ArrowLeft", false],
    ["PageDown", false],
    ["F5", false],
    ["Control+a", false],
    ["Meta+C", false],
    ["Insert", false],
    ["", false],
  ])("%s -> %p", (key, writes) => {
    expect(keyMayWriteText(key)).toBe(writes);
  });
});

describe.skipIf(!asked)("the snapshot tells the server what a field is", () => {
  test("a password field has type password whatever its label says, a text field text", async () => {
    const tab = await pageWith(
      `<input type="password" aria-label="Username"><input type="text" aria-label="Notes"><textarea aria-label="Message"></textarea>`,
    );
    const parsed = parseAriaSnapshot(
      await tab.ariaSnapshot({ mode: "ai", timeout: TIMEOUT }),
      tab.url(),
    );
    const types = await inputTypes(tab, parsed.elements);
    expect(types.get(await refOf(tab, "Username"))).toBe("password");
    expect(types.get(await refOf(tab, "Notes"))).toBe("text");
    expect(types.has(await refOf(tab, "Message"))).toBe(false);
    await tab.close();
  });
});

describe("the sensitive-field selector is one definition", () => {
  test("it names every kind the refusal and the masking rely on", () => {
    for (const token of [
      "input[type=password",
      "one-time-code",
      "current-password",
      "new-password",
      "cc-number",
      "cc-csc",
      "cc-exp",
      "cc-exp-month",
      "cc-exp-year",
      "data-openbot-secret",
    ]) {
      expect(SENSITIVE_FIELD_SELECTOR).toContain(token);
    }
  });
});
