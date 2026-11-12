/**
 * D26 amendment: the app learns the person's language from `/api/capabilities`.
 *
 * The morning brief card and the suggestion card are drawn by the app, which cannot read the server's
 * environment. `FREEDUET_PERSON_LANGUAGE` is validated at start (`personLanguageFrom`) and the
 * validated code is served as `personLanguage`. This endpoint answers anybody, signed in or not, so
 * pinned here: the code is there when set, the key is absent (not null, not empty) when it is not,
 * and the only value that can ever be served is a code from the dictation list.
 */
import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { DICTATION_LANGUAGES } from "../src/dictation/languages";
import { PERSON_LANGUAGE_VARIABLE } from "../src/freeduet/person-language";
import { testEnvironment } from "./support/environment";

async function capabilities(language: string | undefined) {
  const app = createApp(
    loadConfig(testEnvironment({ [PERSON_LANGUAGE_VARIABLE]: language })),
  );
  const response = await app.request("http://openbot.local/api/capabilities");
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

describe("/api/capabilities carries the person's language", () => {
  test("a set language is served as its two-letter code", async () => {
    expect((await capabilities("it")).personLanguage).toBe("it");
    expect((await capabilities("en")).personLanguage).toBe("en");
    // A code the cards have no table for is still served: the app decides what it can draw.
    expect((await capabilities("de")).personLanguage).toBe("de");
  });

  test("the setting is read as the server reads it: trimmed", async () => {
    expect((await capabilities(" it ")).personLanguage).toBe("it");
  });

  test("unset or blank, the key is not there, and the answer is the one it always was", async () => {
    const baseline = Object.keys(await capabilities(undefined));
    expect(baseline).toEqual([
      "mode",
      "durableHistory",
      "generativeUi",
      "selfHostBanner",
      "localEvaluation",
      "transcription",
      "voice",
      "authProviders",
      "ssoConfigured",
      "ssoRequired",
    ]);
    for (const blank of ["", "   "])
      expect(Object.keys(await capabilities(blank))).toEqual(baseline);
  });

  test("with the language set only that key is added, after the others it sits beside", async () => {
    const withLanguage = Object.keys(await capabilities("it"));
    expect(withLanguage).toEqual([
      "mode",
      "durableHistory",
      "generativeUi",
      "selfHostBanner",
      "localEvaluation",
      "transcription",
      "voice",
      "personLanguage",
      "authProviders",
      "ssoConfigured",
      "ssoRequired",
    ]);
  });

  test("anything but a code from the dictation list stops the server before it can be served", () => {
    for (const value of [
      "italian",
      "it-IT",
      "IT",
      "xx",
      "<script>",
      "it\nde",
      "../../etc",
    ])
      expect(() =>
        createApp(
          loadConfig(testEnvironment({ [PERSON_LANGUAGE_VARIABLE]: value })),
        ),
      ).toThrow(PERSON_LANGUAGE_VARIABLE);
  });

  test("every code the list allows is a two-letter lowercase code the app will accept", () => {
    for (const code of DICTATION_LANGUAGES) expect(code).toMatch(/^[a-z]{2}$/);
  });
});
