import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  interfaceLanguage,
  transcribeRecording,
} from "../src/lib/dictation/recording";

const original = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  "language",
);
function setLanguage(value: unknown) {
  Object.defineProperty(globalThis.navigator, "language", {
    value,
    configurable: true,
  });
}
afterEach(() => {
  if (original)
    Object.defineProperty(globalThis.navigator, "language", original);
});

describe("the language sent with a recording", () => {
  test("is the primary subtag of the browser's language", () => {
    setLanguage("it-IT");
    expect(interfaceLanguage()).toBe("it");
    setLanguage("EN");
    expect(interfaceLanguage()).toBe("en");
  });

  test("is nothing when the browser says something that is not a two-letter code", () => {
    for (const value of ["", "fil-PH", "x", "i-klingon", undefined, 7]) {
      setLanguage(value);
      expect(interfaceLanguage()).toBeUndefined();
    }
  });

  test("goes in the upload as the language field, and is left out when there is none", async () => {
    const bodies: FormData[] = [];
    const fetcher = spyOn(globalThis, "fetch").mockImplementation((async (
      _url: unknown,
      init?: RequestInit,
    ) => {
      bodies.push(init?.body as FormData);
      return Response.json({ text: "ciao" });
    }) as typeof fetch);
    try {
      const audio = new Blob([new Uint8Array(8)], { type: "audio/webm" });
      setLanguage("it-IT");
      await transcribeRecording(audio, new AbortController().signal);
      setLanguage("");
      await transcribeRecording(audio, new AbortController().signal);
      expect(bodies[0]?.get("language")).toBe("it");
      expect(bodies[1]?.has("language")).toBe(false);
    } finally {
      fetcher.mockRestore();
    }
  });
});
