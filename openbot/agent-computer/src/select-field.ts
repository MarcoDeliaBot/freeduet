/**
 * Choosing in a native `<select>` menu and filling a date or time field, for a model (D123, item 2).
 *
 * `computer_type` cannot do either: Playwright's `fill` refuses a `<select>` ("not an <input>,
 * <textarea> or [contenteditable] element"), and a date field only takes a value in one exact format.
 * So a member that met a drop-down could neither read its options nor choose one. This module is the
 * one place that does, behind `/select` in `index.ts`.
 *
 * It sits under the same guards as a typed entry and is not a way around them:
 *
 *  - It is on the computer's acting list and takes a turn like `/type` (`authorisation.ts`,
 *    `turns.ts`), so a person holding the wheel refuses it. On the server it is an acting tool, so the
 *    gateway's policy, the audit trail and the approval gate see it before it reaches here.
 *  - A field the page marks as sensitive (D76: `SENSITIVE_FIELD_SELECTOR`, which includes the card
 *    expiry `autocomplete` tokens a `<select>` often carries) is refused with the same sentence as a
 *    typed entry, and nothing is changed. That check cannot be lifted from above.
 *  - It writes only what the page itself offers: an option that exists and is not disabled, or a value
 *    that parses as the field's own format. Nothing is free text.
 *
 * Custom drop-downs (a `div` that opens a list when clicked) are NOT handled here: they are ordinary
 * elements, so a member opens one with `computer_click` and clicks an option.
 *
 * Everything the page is asked is a self-contained function passed to `evaluate`, because it is
 * serialised. Nothing in this module reads a secret's value: a sensitive field's options and value are
 * left out of the snapshot and refused for a write.
 */

import type { Frame, Locator, Page } from "playwright";
import {
  isNavigationRace,
  SETTLE_LOAD_WAIT_MS,
  SETTLE_QUIET_MS,
} from "./settle";
import {
  isSensitiveWriteTarget,
  SecretFieldError,
  SENSITIVE_FIELD_SELECTOR,
} from "./secret-masking";

/** How many options a snapshot lists for one menu. The rest are counted, not described. */
export const OPTIONS_LIMIT = 50;

/** The longest option label or value shown, in UTF-16 code units. */
const OPTION_TEXT_LIMIT = 120;

/** The five input types that hold a date or a time. */
export const DATE_INPUT_TYPES = [
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
] as const;
export type DateInputType = (typeof DATE_INPUT_TYPES)[number];

export type MenuOption = {
  label: string;
  /** Left off when it is the same as the label. */
  value?: string;
  disabled?: boolean;
  selected?: boolean;
};

/** What the page says about one field, read in one round trip. */
export type FieldDescription =
  | {
      kind: "select";
      multiple: boolean;
      disabled: boolean;
      sensitive: boolean;
      options: MenuOption[];
      /** How many options the menu has in all, which may be more than `options` lists. */
      total: number;
    }
  | {
      kind: "date";
      type: DateInputType;
      disabled: boolean;
      readOnly: boolean;
      sensitive: boolean;
      value: string;
      min?: string;
      max?: string;
    }
  | { kind: "other"; tag: string; type?: string };

/**
 * The page-side read. Self-contained: serialised by `evaluate`.
 *
 * `limit` caps the options that are described (all of them are counted). The menu's own options are
 * read, not an aria snapshot of them, so a label is the text the page shows and a value is the one it
 * submits, which is what a form sends.
 */
export function describeChoiceField(
  element: Element,
  arg: { selector: string; limit: number; textLimit: number },
): FieldDescription {
  const cut = (text: string): string => {
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (collapsed.length <= arg.textLimit) return collapsed;
    const sliced = collapsed.slice(0, arg.textLimit);
    const last = sliced.charCodeAt(sliced.length - 1);
    return last >= 0xd800 && last <= 0xdbff ? sliced.slice(0, -1) : sliced;
  };
  const sensitive = Boolean(
    element.closest(arg.selector) ||
      (() => {
        const security = getComputedStyle(element).getPropertyValue(
          "-webkit-text-security",
        );
        return security !== "" && security !== "none";
      })(),
  );
  if (element instanceof HTMLSelectElement) {
    const all = Array.from(element.options);
    return {
      kind: "select",
      multiple: element.multiple,
      disabled: element.disabled,
      sensitive,
      total: all.length,
      options: all.slice(0, arg.limit).map((option) => {
        const label = cut(option.label || option.text);
        const value = cut(option.value);
        return {
          label,
          ...(value !== label ? { value } : {}),
          ...(option.disabled || option.closest("optgroup[disabled]")
            ? { disabled: true }
            : {}),
          ...(option.selected ? { selected: true } : {}),
        };
      }),
    };
  }
  if (element instanceof HTMLInputElement) {
    const type = element.type;
    if (
      type === "date" ||
      type === "time" ||
      type === "datetime-local" ||
      type === "month" ||
      type === "week"
    ) {
      return {
        kind: "date",
        type,
        disabled: element.disabled,
        readOnly: element.readOnly,
        sensitive,
        value: element.value,
        ...(element.min ? { min: cut(element.min) } : {}),
        ...(element.max ? { max: cut(element.max) } : {}),
      };
    }
    return { kind: "other", tag: "input", type };
  }
  return { kind: "other", tag: element.tagName.toLowerCase() };
}

/**
 * The full list of a menu's options, for matching. Read separately from {@link describeChoiceField}
 * because matching must see every option, and a snapshot only describes the first few.
 */
export function readAllOptions(element: Element): MenuOption[] {
  if (!(element instanceof HTMLSelectElement)) return [];
  const clean = (text: string) => text.replace(/\s+/g, " ").trim();
  return Array.from(element.options).map((option) => ({
    label: clean(option.label || option.text),
    value: option.value,
    ...(option.disabled || option.closest("optgroup[disabled]")
      ? { disabled: true }
      : {}),
    ...(option.selected ? { selected: true } : {}),
  }));
}

/** Whether a snapshot element is one of a native menu's own options, which cannot be clicked. */
export function isNativeOption(element: Element): boolean {
  return element instanceof HTMLOptionElement;
}

/** Thrown for a request the page cannot honour. The sentence is what the member reads. */
export class ChoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChoiceError";
  }
}

/** The shape each date or time type accepts, which is what Playwright's `fill` requires too. */
const FORMATS: Record<DateInputType, { pattern: RegExp; example: string }> = {
  date: { pattern: /^(\d{4,})-(\d{2})-(\d{2})$/, example: "2026-03-28" },
  time: {
    pattern: /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/,
    example: "14:30",
  },
  "datetime-local": {
    pattern:
      /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/,
    example: "2026-03-28T14:30",
  },
  month: { pattern: /^(\d{4,})-(\d{2})$/, example: "2026-03" },
  week: { pattern: /^(\d{4,})-W(\d{2})$/, example: "2026-W13" },
};

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Whether `value` is a real value of `type`: right shape and a date that exists (no 31 February, no
 * 25:00). An empty string is not checked here: it clears the field.
 */
export function checkDateValue(
  type: DateInputType,
  value: string,
): string | undefined {
  const { pattern, example } = FORMATS[type];
  const match = pattern.exec(value);
  const bad = `That is not a ${type} value. Use the ISO form, such as ${example}.`;
  if (!match) return bad;
  const n = (index: number) => Number(match[index]);
  if (type === "date" || type === "datetime-local") {
    const [year, month, day] = [n(1), n(2), n(3)];
    if (
      year < 1 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > daysIn(year, month)
    )
      return bad;
  }
  if (type === "month") {
    if (n(1) < 1 || n(2) < 1 || n(2) > 12) return bad;
  }
  if (type === "week") {
    const year = n(1);
    // ISO weeks run to 53 only in a long year: 1 January or 31 December falls on a Thursday.
    const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
    const dec31 = new Date(Date.UTC(year, 11, 31)).getUTCDay();
    const weeks = jan1 === 4 || dec31 === 4 ? 53 : 52;
    if (year < 1 || n(2) < 1 || n(2) > weeks) return bad;
  }
  if (type === "time") {
    if (n(1) > 23 || n(2) > 59 || (match[3] !== undefined && n(3) > 59))
      return bad;
  }
  if (type === "datetime-local") {
    if (n(4) > 23 || n(5) > 59 || (match[6] !== undefined && n(6) > 59))
      return bad;
  }
  return undefined;
}

/** The sentence listing what a menu offers, for a refusal, cut so one huge menu cannot flood it. */
function offered(options: MenuOption[]): string {
  const shown = options
    .filter((option) => !option.disabled)
    .slice(0, 15)
    .map((option) => JSON.stringify(option.label));
  const more = options.length > 15 ? `, and ${options.length - 15} more` : "";
  return `${shown.join(", ")}${more}`;
}

/**
 * Which option a request names, by its index.
 *
 * Label first: the exact label, then the exact value, then the label ignoring case. The first step
 * that finds anything decides, so an option whose label equals another option's value wins by its label
 * (the label is what the page shows and what the member read in the snapshot). Within a step the
 * match must be ONE option: two options with the same label (or the same value) are refused rather than
 * guessed at, because choosing the wrong "Delivery" is worse than asking.
 */
export function matchOption(options: MenuOption[], wanted: string): number {
  const norm = (text: string) => text.replace(/\s+/g, " ").trim();
  const target = norm(wanted);
  const steps: Array<(option: MenuOption) => boolean> = [
    (option) => option.label === target,
    (option) => option.value === wanted,
    (option) => option.label.toLowerCase() === target.toLowerCase(),
  ];
  for (const step of steps) {
    const hits = options.flatMap((option, index) =>
      step(option) ? [index] : [],
    );
    if (hits.length === 1) {
      const option = options[hits[0] as number] as MenuOption;
      if (option.disabled)
        throw new ChoiceError(
          `The option ${JSON.stringify(option.label)} is disabled on this page, so it cannot be chosen. Nothing was changed.`,
        );
      return hits[0] as number;
    }
    if (hits.length > 1)
      throw new ChoiceError(
        `${hits.length} options match ${JSON.stringify(wanted)}, so it is not clear which you mean. Nothing was changed. Choose by the exact value instead, or ask the person.`,
      );
  }
  throw new ChoiceError(
    `This menu has no option ${JSON.stringify(wanted)}. Nothing was changed. It offers: ${offered(options)}.`,
  );
}

export type ChoiceResult =
  | ({
      kind: "select";
      /** What the menu shows as chosen; the requested option(s) when `navigated` and it could not be read. */
      selected: Array<{ label: string; value: string }>;
    } & Moved)
  | ({
      kind: "date";
      inputType: DateInputType;
      value: string;
      /** The page's own min, max or step rejects the value. Never set for a clear. */
      outOfRange?: true;
      /** The value was cleared, and the field is required by the page. */
      cleared?: true;
      required?: true;
    } & Moved);

/**
 * A change handler can move the page (`onchange="this.form.submit()"`) or start a request. When the
 * page navigated after the change, the field is gone, so the result says so and carries the request as
 * the thing that was chosen, not a read-back that could not happen. The new address is `url`.
 */
export type Moved = { navigated?: true };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Do a change, wait as long as the page takes to settle, and read the field back.
 *
 * The page gets one quiet period (`SETTLE_QUIET_MS`) and a bounded load wait (`SETTLE_LOAD_WAIT_MS`)
 * after the change, which is enough for a handler that submits a form or sets `location`. A main-frame
 * navigation counted at any point from the change to the end of the read means the change happened and
 * the read-back is not available: the caller's `fallback` is returned with `navigated: true`. A request
 * a handler sends without navigating needs nothing: the field is still there to read.
 */
async function changeAndRead<T>(
  page: Page,
  act: () => Promise<void>,
  read: () => Promise<T>,
  fallback: () => T,
): Promise<{ value: T } & Moved> {
  let navigations = 0;
  const main = page.mainFrame();
  const onNavigated = (frame: Frame) => {
    if (frame === main) navigations += 1;
  };
  page.on("framenavigated", onNavigated);
  const moved = async () => {
    await page
      .waitForLoadState("load", { timeout: SETTLE_LOAD_WAIT_MS })
      .catch(() => undefined);
    return { value: fallback(), navigated: true as const };
  };
  try {
    try {
      await act();
    } catch (error) {
      // The change landed and the page moved on while the action was finishing.
      if (navigations > 0 && isNavigationRace(error)) return await moved();
      throw error;
    }
    await pause(SETTLE_QUIET_MS);
    await page
      .waitForLoadState("load", { timeout: SETTLE_LOAD_WAIT_MS })
      .catch(() => undefined);
    if (navigations > 0) return await moved();
    try {
      const value = await read();
      if (navigations > 0) return await moved();
      return { value };
    } catch (error) {
      if (navigations > 0 || isNavigationRace(error)) return await moved();
      throw error;
    }
  } finally {
    page.off("framenavigated", onNavigated);
  }
}

/**
 * Choose in a menu or fill a date field, and read back what the field now shows.
 *
 * `fill` is used for a date because it sets the value and sends the page the `input` and `change`
 * events a person's pick would. `selectOption` does the same for a menu, by index so that two options
 * with one value cannot be mixed up.
 */
export async function chooseOnField(
  field: Locator,
  value: string | string[],
  options: { timeout: number; signal?: AbortSignal },
): Promise<ChoiceResult> {
  const describe = () =>
    field.evaluate(
      describeChoiceField,
      {
        selector: SENSITIVE_FIELD_SELECTOR,
        limit: 0,
        textLimit: OPTION_TEXT_LIMIT,
      },
      { timeout: options.timeout },
    );
  const before = await describe();
  // Asked before anything else, with the typed entry's own check and sentence (D76).
  if (before.kind !== "other" && before.sensitive) throw new SecretFieldError();
  if (
    await field.evaluate(isSensitiveWriteTarget, SENSITIVE_FIELD_SELECTOR, {
      timeout: options.timeout,
    })
  )
    throw new SecretFieldError();

  if (before.kind === "other") {
    throw new ChoiceError(
      before.tag === "input"
        ? `This is a ${before.type ?? "text"} field, not a menu or a date. Use computer_type for text.`
        : `This is not a native menu or a date field (it is a ${before.tag}). A custom drop-down is opened with computer_click, then its option is clicked.`,
    );
  }

  if (before.kind === "date") {
    if (typeof value !== "string")
      throw new ChoiceError(
        "A date or time field takes one value, not a list.",
      );
    if (before.disabled || before.readOnly)
      throw new ChoiceError(
        `This ${before.type} field is ${before.disabled ? "disabled" : "read-only"} on this page. Nothing was changed.`,
      );
    const problem =
      value === "" ? undefined : checkDateValue(before.type, value);
    if (problem) throw new ChoiceError(`${problem} Nothing was changed.`);
    const changed = await changeAndRead(
      field.page(),
      () => field.fill(value, options),
      async () => {
        const after = await field.evaluate(describeChoiceField, {
          selector: SENSITIVE_FIELD_SELECTOR,
          limit: 0,
          textLimit: OPTION_TEXT_LIMIT,
        });
        if (after.kind !== "date")
          throw new ChoiceError(
            "The field changed into something else while it was filled.",
          );
        // Playwright pads a seconds-less time the way the page does, so the read-back is the truth. A
        // value the page did not keep (the browser drops what it cannot parse) is said, not hidden.
        if (value !== "" && after.value === "")
          throw new ChoiceError(
            `The page did not keep ${JSON.stringify(value)}. The field is empty.`,
          );
        const state = await field.evaluate(
          (element) => {
            const input = element as HTMLInputElement;
            const v = input.validity;
            return {
              rejected: v.rangeUnderflow || v.rangeOverflow || v.stepMismatch,
              required: input.required,
            };
          },
          undefined,
          { timeout: options.timeout },
        );
        return { value: after.value, ...state };
      },
      () => ({ value, rejected: false, required: false }),
    );
    const read = changed.value;
    return {
      kind: "date",
      inputType: before.type,
      value: read.value,
      // Clearing is never "out of range": a required field that is now empty says it is required.
      ...(value === ""
        ? read.required
          ? { required: true as const }
          : {}
        : {}),
      ...(value === "" ? { cleared: true as const } : {}),
      ...(value !== "" && read.rejected ? { outOfRange: true as const } : {}),
      ...(changed.navigated ? { navigated: true as const } : {}),
    };
  }

  // A menu.
  if (before.disabled)
    throw new ChoiceError(
      "This menu is disabled on this page. Nothing was changed.",
    );
  const wanted = typeof value === "string" ? [value] : value;
  if (!before.multiple && wanted.length !== 1)
    throw new ChoiceError(
      "This menu takes exactly one option. Send one label or value. Nothing was changed.",
    );
  const all = await field.evaluate(readAllOptions, undefined, {
    timeout: options.timeout,
  });
  const indexes = [...new Set(wanted.map((entry) => matchOption(all, entry)))];
  const changed = await changeAndRead(
    field.page(),
    async () => {
      await field.selectOption(
        indexes.map((index) => ({ index })),
        options,
      );
    },
    async () => {
      const after = await field.evaluate(readAllOptions, undefined, {
        timeout: options.timeout,
      });
      return after
        .filter((option) => option.selected)
        .map((option) => ({ label: option.label, value: option.value ?? "" }));
    },
    () =>
      indexes.map((index) => ({
        label: all[index]?.label ?? "",
        value: all[index]?.value ?? "",
      })),
  );
  return {
    kind: "select",
    selected: changed.value,
    ...(changed.navigated ? { navigated: true as const } : {}),
  };
}
