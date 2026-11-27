import { expect, test } from "bun:test";
import { CATALOGS, SOURCE } from "@/freeduet/i18n/catalogs";
import { APP_LANGUAGES, resolveAppLanguage } from "@/freeduet/i18n/languages";
import {
  createTranslator,
  formatDate,
  formatNumber,
  type Plural,
} from "@/freeduet/i18n/translate";
import { APP_LANGUAGE_CODES } from "@openbot/shared/user-preferences";

/** D181: the app's own words, one catalogue per language, English the source. */

const ids = Object.keys(SOURCE).sort();
const placeholdersOf = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
/** Every string a catalogue holds for one id: one for a string, each form of a plural. */
const textsOf = (value: string | Plural): string[] =>
  typeof value === "string"
    ? [value]
    : Object.values(value).filter((v): v is string => typeof v === "string");

test("the twelve languages are the ones of the site and of the approval cards", () => {
  expect(APP_LANGUAGES.map((l) => l.code)).toEqual([...APP_LANGUAGE_CODES]);
  expect<string[]>([...APP_LANGUAGE_CODES].sort()).toEqual(
    "de en es fr it ja ko pl pt ru tr zh".split(" "),
  );
  // Every language but English has a catalogue.
  expect(Object.keys(CATALOGS).sort()).toEqual(
    APP_LANGUAGE_CODES.filter((code) => code !== "en").sort(),
  );
});

test("every catalogue has exactly the English keys: none missing, none extra", () => {
  expect(ids.length).toBeGreaterThan(100);
  for (const [code, catalog] of Object.entries(CATALOGS)) {
    expect({ code, keys: Object.keys(catalog ?? {}).sort() }).toEqual({
      code,
      keys: ids,
    });
  }
});

test("a plural is a plural in every language, and a string is a string", () => {
  for (const [code, catalog] of Object.entries(CATALOGS)) {
    for (const id of ids) {
      const source = SOURCE[id as keyof typeof SOURCE] as string | Plural;
      const own = (catalog as Record<string, string | Plural>)[id];
      expect({ code, id, plural: typeof own === "object" }).toEqual({
        code,
        id,
        plural: typeof source === "object",
      });
    }
  }
});

test("no translated string drops or invents a placeholder", () => {
  for (const [code, catalog] of Object.entries(CATALOGS)) {
    for (const id of ids) {
      const source = SOURCE[id as keyof typeof SOURCE] as string | Plural;
      const own = (catalog as Record<string, string | Plural>)[id];
      const wanted = [
        ...new Set(textsOf(source).flatMap(placeholdersOf)),
      ].sort();
      for (const text of textsOf(own)) {
        // An empty value is "not translated yet" and reads as English.
        if (text === "") continue;
        const got = [...new Set(placeholdersOf(text))].sort();
        // A plural form may leave out `{count}` ("un'altra"), never add or lose any other.
        const other = (list: string[]) => list.filter((p) => p !== "count");
        expect({ code, id, placeholders: other(got) }).toEqual({
          code,
          id,
          placeholders: other(wanted),
        });
        if (typeof source === "string")
          expect({ code, id, placeholders: got }).toEqual({
            code,
            id,
            placeholders: wanted,
          });
      }
    }
  }
});

test("the plural entries are complete in English and Italian, and `other` is never empty there", () => {
  for (const code of ["en", "it"] as const) {
    const table = (code === "en" ? SOURCE : CATALOGS.it) as Record<
      string,
      string | Plural
    >;
    for (const id of ids) {
      const value = table[id];
      for (const text of textsOf(value))
        expect({ code, id, text }).not.toEqual({ code, id, text: "" });
      if (typeof value === "object") expect(value.other).toBeTruthy();
    }
  }
});

test("Italian is translated: no key of it reads as the English by accident, except the shared words", () => {
  const same = ids.filter(
    (id) =>
      JSON.stringify(CATALOGS.it?.[id as keyof typeof SOURCE]) ===
      JSON.stringify(SOURCE[id as keyof typeof SOURCE]),
  );
  // Product words that are the same in both ("Chat", "Dashboard", "Team", "Bot", "Menu").
  expect(same.length).toBeLessThan(12);
});

test("a missing or empty value reads as English, never as a key or a blank", () => {
  const t = createTranslator(SOURCE, CATALOGS, "de");
  expect(t("shell.newChannel")).toBe("New channel");
  const italian = createTranslator(
    SOURCE,
    { it: { ...CATALOGS.it, "shell.newChannel": "" } as never },
    "it",
  );
  expect(italian("shell.newChannel")).toBe("New channel");
  expect(createTranslator(SOURCE, CATALOGS, "it")("shell.newChannel")).toBe(
    "Nuovo canale",
  );
  expect(t("no.such.key" as never)).toBe("");
  expect(createTranslator(SOURCE, CATALOGS, "xx")("shell.menu")).toBe("Menu");
});

test("plurals follow the language's own rules and values are filled in one pass", () => {
  const en = createTranslator(SOURCE, CATALOGS, "en");
  const it = createTranslator(SOURCE, CATALOGS, "it");
  expect(en("attention.approvals", { count: 1 })).toBe("1 approval");
  expect(en("attention.approvals", { count: 3 })).toBe("3 approvals");
  expect(it("attention.approvals", { count: 1 })).toBe("1 approvazione");
  expect(it("attention.approvals", { count: 3 })).toBe("3 approvazioni");
  expect(it("shell.unarchiveNamed", { name: "{count} Ana" })).toBe(
    "Ripristina {count} Ana",
  );
  // A placeholder with no value stays visible rather than turning into "undefined".
  expect(it("shell.unarchiveNamed")).toBe("Ripristina {name}");
});

test("the browser's languages choose the language, and a choice beats them", () => {
  expect(resolveAppLanguage("auto", ["it-IT", "en"])).toBe("it");
  expect(resolveAppLanguage(undefined, ["pt-BR"])).toBe("pt");
  expect(resolveAppLanguage(null, ["nl", "zh-TW"])).toBe("zh");
  expect(resolveAppLanguage("auto", ["nl", "sv"])).toBe("en");
  expect(resolveAppLanguage("auto", [])).toBe("en");
  expect(resolveAppLanguage("de", ["it-IT"])).toBe("de");
  expect(resolveAppLanguage("xx", ["fr_CA"])).toBe("fr");
});

test("numbers and dates use Intl in the app's language", () => {
  expect(formatNumber(12345.5, "en")).toBe("12,345.5");
  expect(formatNumber(12345.5, "it")).toBe("12.345,5");
  expect(formatNumber(12345.5, "not a language!")).toBe("12,345.5");
  const day = new Date(Date.UTC(2026, 10, 27, 12));
  expect(formatDate(day, "it", { month: "long", timeZone: "UTC" })).toBe(
    "novembre",
  );
});
