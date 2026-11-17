/**
 * Keeping secrets typed into the page out of everything that reads the page back.
 *
 * A password field shows dots, and it is tempting to stop there. The snapshot does not: Playwright's
 * aria snapshot reports a textbox's current value, and for `<input type=password>` that is the
 * password in plain text (checked against Playwright 1.62: `textbox [ref=e4]: hunter2`). So a person
 * who typed their password through the private form, or through a secret request, would hand it to
 * the model on the Bot's very next snapshot. The same goes for a token or a one-time code typed into
 * an ordinary text field, which shows no dots at all on the live screen or in a screenshot.
 *
 * Three places, one rule:
 *  - the snapshot replaces the value of any sensitive field with a placeholder;
 *  - a screenshot masks sensitive fields (Playwright's documented `mask` option);
 *  - a field a secret was typed into is marked, and drawn with `-webkit-text-security: disc`, so the
 *    live screencast shows dots for it even when it is not a password field.
 *
 * Only a type import of Playwright, so the pure parts have tests that need no browser.
 */

import type { Locator, Page } from "playwright";
import type { SnapshotElement } from "./aria-snapshot";

/** The attribute a field gets once a secret has been typed into it. */
export const SECRET_ATTRIBUTE = "data-openbot-secret";

/** What a sensitive value is replaced with. Says a value is there without saying what it is. */
export const MASKED_VALUE = "[hidden: sensitive field]";

/**
 * Every field whose contents are never read back and that no model ever types into: passwords,
 * one-time codes, card numbers, and marked fields.
 *
 * Also the one definition of "a field only the person fills" (D76): `/type` and `/key` refuse these
 * through {@link refuseSecretField}. The `autocomplete` entries name no element, so a textarea or a
 * contenteditable that carries the token is covered like an input. `i` because a token is
 * case-insensitive. `cc-exp` stands for the three expiry tokens.
 */
export const SENSITIVE_FIELD_SELECTOR = [
  "input[type=password i]",
  '[autocomplete~="one-time-code" i]',
  '[autocomplete~="current-password" i]',
  '[autocomplete~="new-password" i]',
  '[autocomplete~="cc-number" i]',
  '[autocomplete~="cc-csc" i]',
  '[autocomplete~="cc-exp" i]',
  '[autocomplete~="cc-exp-month" i]',
  '[autocomplete~="cc-exp-year" i]',
  `[${SECRET_ATTRIBUTE}]`,
].join(", ");

/** The roles whose `value` in a snapshot is text somebody typed. */
const VALUE_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);

/** Whether an element's value is worth asking the page about at all. */
export function mayHoldTypedValue(element: SnapshotElement): boolean {
  return VALUE_ROLES.has(element.role) && element.value !== undefined;
}

/** The snapshot's elements with every sensitive value replaced. Pure, so it can be tested alone. */
export function maskSensitiveValues(
  elements: SnapshotElement[],
  sensitiveRefs: ReadonlySet<string>,
): SnapshotElement[] {
  return elements.map((element) =>
    sensitiveRefs.has(element.ref) && element.value !== undefined
      ? { ...element, value: MASKED_VALUE }
      : element,
  );
}

/**
 * The page-side check, passed to `locator.evaluate`. Written as a plain function over the element so
 * it serialises; it must not close over anything in this module.
 */
export function isSensitiveElement(
  element: Element,
  selector: string,
): boolean {
  return element.matches(selector);
}

/** The page-side mark, passed to `locator.evaluate` after a secret lands in a field. */
export function markElementSecret(element: Element, attribute: string): void {
  element.setAttribute(attribute, "true");
  (element as HTMLElement).style?.setProperty(
    "-webkit-text-security",
    "disc",
    "important",
  );
}

/**
 * Which of a snapshot's filled fields hold a secret, asked of the page itself.
 *
 * Only fields that carry a value are asked about, and each question is answered from the element the
 * ref resolves to right now. A field that cannot be asked is treated as sensitive: hiding an ordinary
 * value is a small cost, and showing a password is not.
 */
export async function sensitiveRefs(
  target: Page,
  elements: SnapshotElement[],
): Promise<Set<string>> {
  const sensitive = new Set<string>();
  await Promise.all(
    elements.filter(mayHoldTypedValue).map(async (element) => {
      const matches = await target
        .locator(`aria-ref=${element.ref}`)
        .evaluate(isSensitiveElement, SENSITIVE_FIELD_SELECTOR, {
          timeout: 1_000,
        })
        .catch(() => true);
      if (matches) sensitive.add(element.ref);
    }),
  );
  return sensitive;
}

/** The page-side read of an input's type (`password`, `text`, `email`...). Other elements have none. */
export function inputTypeOf(element: Element): string | undefined {
  return element instanceof HTMLInputElement ? element.type : undefined;
}

/**
 * The `type` of each form control in a snapshot, so the server's own floor and an operator's rules
 * (`element.type`) see a password field whatever it is labelled (D76, defence in depth: the computer's
 * refusal is the control). A field that cannot be asked simply has no type.
 */
export async function inputTypes(
  target: Page,
  elements: SnapshotElement[],
): Promise<Map<string, string>> {
  const types = new Map<string, string>();
  await Promise.all(
    elements
      .filter((element) => VALUE_ROLES.has(element.role))
      .map(async (element) => {
        const type = await target
          .locator(`aria-ref=${element.ref}`)
          .evaluate(inputTypeOf, undefined, { timeout: 1_000 })
          .catch(() => undefined);
        if (type) types.set(element.ref, type);
      }),
  );
  return types;
}

/*
 * A model never types into a field the page marks as sensitive (D76).
 *
 * The server's safety floor sees only a field's label and the typed text, so a password field with
 * another label, no label or a label in another language was filled. The refusal lives here, on the
 * computer, where the field itself can be asked: its type, its `autocomplete`, the mark a secret
 * leaves, and a text field drawn as dots with `-webkit-text-security`. It is unconditional: Full access,
 * a routine and a hand-off do not lift it, because the person's own path (`/human/secret`, the
 * private sign-in form, a takeover) does not go through here.
 */

/** The sentence a member repeats to the person. Plain words, no technical names but the tool. */
export const SECRET_FIELD_REFUSAL =
  "This field is for a password, a code or a card number, so the person types it themselves, in the live browser view or on the site. Nothing was typed. Click the field and ask with computer_request_secret.";

/** Thrown when a model's write is refused. The dispatcher answers 403 with this sentence. */
export class SecretFieldError extends Error {
  constructor() {
    super(SECRET_FIELD_REFUSAL);
    this.name = "SecretFieldError";
  }
}

/**
 * The page-side question, passed to `evaluate` on the element a write would land in. Self-contained,
 * because it is serialised. A `<label>` is followed to its control, as Playwright's `fill` does.
 * Anything that matches the selector on the element or an ancestor counts (a contenteditable inside
 * a marked block), and so does a field drawn as dots.
 */
export function isSensitiveWriteTarget(
  element: Element,
  selector: string,
): boolean {
  const tag = element.tagName.toLowerCase();
  const target =
    tag === "label"
      ? ((element as HTMLLabelElement).control ?? element)
      : element;
  if (target.closest(selector)) return true;
  const security = getComputedStyle(target).getPropertyValue(
    "-webkit-text-security",
  );
  return security !== "" && security !== "none";
}

/** The page-side wipe, for a field that turned out to be sensitive while a write was landing. */
export function wipeWriteTarget(element: Element): void {
  const tag = element.tagName.toLowerCase();
  const target =
    tag === "label"
      ? ((element as HTMLLabelElement).control ?? element)
      : element;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const proto =
      target instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(target, "");
    target.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    target.textContent = "";
  }
}

/** The page-side lookup of the element holding the keyboard focus, through shadow roots. */
function focusedElementOfFrame(): Element | null {
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement)
    active = active.shadowRoot.activeElement;
  if (!active || active === document.body) return null;
  return /^i?frame$/i.test(active.tagName) ? null : active;
}

/**
 * Keys that never put a character in a field. Anything else, including a key this list has never heard
 * of, a physical key code such as `KeyA` or `Digit5`, and paste, counts as typing.
 */
const NON_TEXT_KEYS = new Set([
  "enter",
  "tab",
  "escape",
  "esc",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "pageup",
  "pagedown",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "shift",
  "control",
  "alt",
  "meta",
  "controlormeta",
  "capslock",
  "contextmenu",
  "numpadenter",
  ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`),
]);

/** Whether pressing this key could put text into the focused field. Fail closed. */
export function keyMayWriteText(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  // "+" is a key as well as the separator: "+" alone, or "Control++".
  const parts =
    trimmed === "+"
      ? ["+"]
      : trimmed.endsWith("++")
        ? [...trimmed.slice(0, -2).split("+"), "+"]
        : trimmed.split("+");
  const last = parts[parts.length - 1] ?? "";
  const modifiers = new Set(
    parts.slice(0, -1).map((part) => part.toLowerCase()),
  );
  const name = last.toLowerCase();
  if (NON_TEXT_KEYS.has(name))
    return name === "insert" && modifiers.has("shift");
  const shortcut = [...modifiers].some(
    (m) => m.includes("control") || m.includes("meta"),
  );
  // Select all and copy write nothing. Paste (v), cut, undo and redo are left as typing.
  if (shortcut && !modifiers.has("alt") && (name === "a" || name === "c"))
    return false;
  return true;
}

type FieldPage = Pick<Page, "frames">;

/** Whether any frame's focused field is sensitive. A frame that cannot be asked counts as yes. */
async function focusedFieldIsSensitive(page: FieldPage): Promise<boolean> {
  const answers = await Promise.all(
    page.frames().map(async (frame) => {
      try {
        const handle = await frame.evaluateHandle(focusedElementOfFrame);
        const element = handle.asElement();
        if (!element) return false;
        return await element.evaluate(
          isSensitiveWriteTarget,
          SENSITIVE_FIELD_SELECTOR,
        );
      } catch {
        return true;
      }
    }),
  );
  return answers.some(Boolean);
}

async function wipeFocusedField(page: FieldPage): Promise<void> {
  for (const frame of page.frames()) {
    try {
      const handle = await frame.evaluateHandle(focusedElementOfFrame);
      const element = handle.asElement();
      if (
        element &&
        (await element.evaluate(
          isSensitiveWriteTarget,
          SENSITIVE_FIELD_SELECTOR,
        ))
      )
        await element.evaluate(wipeWriteTarget);
    } catch {
      // A frame that went away has nothing left to wipe.
    }
  }
}

/**
 * Fill a field for a model, unless the page marks it sensitive.
 *
 * Asked three times against the same element: before the fill, after focusing it (a page that turns
 * a text field into a password field when it takes focus), and after the fill (a flip that came
 * during it, which wipes what landed and refuses). The text is never returned and the wipe is
 * the computer's, so what the model sees is the refusal.
 */
export async function fillUnlessSecret(
  field: Locator,
  text: string,
  options: { timeout: number; signal?: AbortSignal },
  extra?: { submit?: boolean },
): Promise<void> {
  const ask = () =>
    field.evaluate(isSensitiveWriteTarget, SENSITIVE_FIELD_SELECTOR, {
      timeout: options.timeout,
    });
  if (await ask()) throw new SecretFieldError();
  await field.focus({ timeout: options.timeout });
  if (await ask()) throw new SecretFieldError();
  await field.fill(text, options);
  if (await ask().catch(() => false)) {
    await field
      .evaluate(wipeWriteTarget, undefined, { timeout: 1_000 })
      .catch(() => undefined);
    throw new SecretFieldError();
  }
  if (extra?.submit) await field.press("Enter", options);
}

/**
 * Press a key for a model. A key that cannot write text goes straight through. One that can is
 * refused when the field it would land in (the ref's, or the focused one in any frame) is
 * sensitive, and checked again afterwards like a fill.
 */
export async function pressKeyUnlessSecret(
  page: FieldPage,
  field: Locator | undefined,
  key: string,
  options: { timeout: number; signal?: AbortSignal },
  press: () => Promise<void>,
): Promise<void> {
  if (!keyMayWriteText(key)) return press();
  const ask = async (): Promise<boolean> =>
    field
      ? field.evaluate(isSensitiveWriteTarget, SENSITIVE_FIELD_SELECTOR, {
          timeout: options.timeout,
        })
      : focusedFieldIsSensitive(page);
  if (await ask()) throw new SecretFieldError();
  await press();
  if (await ask().catch(() => false)) {
    if (field)
      await field
        .evaluate(wipeWriteTarget, undefined, { timeout: 1_000 })
        .catch(() => undefined);
    else await wipeFocusedField(page);
    throw new SecretFieldError();
  }
}
