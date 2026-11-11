import { describe, expect, test } from "bun:test";
import { pcm16Wav, wavDurationSeconds } from "../../evals/dictation/metrics";
import {
  paddedWav,
  parseArguments,
  parseCookieHeader,
} from "./freeduet-dictation-e2e";

describe("parseArguments", () => {
  test("defaults: the stack on port 3010, three clips, 25 percent", () => {
    expect(parseArguments([], {})).toEqual({
      app: "http://localhost:3010",
      clips: 3,
      maxWer: 0.25,
      headed: false,
    });
  });

  test("the app is its origin, and E2E_CHROMIUM names the browser unless --chromium does", () => {
    const options = parseArguments(
      ["--app", "http://localhost:3110/channel/x?y=1", "--headed"],
      { E2E_CHROMIUM: "/opt/chrome" },
    );
    expect(options.app).toBe("http://localhost:3110");
    expect(options.chromium).toBe("/opt/chrome");
    expect(options.headed).toBe(true);
    expect(
      parseArguments(["--chromium", "/usr/bin/chromium"], {
        E2E_CHROMIUM: "/opt/chrome",
      }).chromium,
    ).toBe("/usr/bin/chromium");
  });

  test("refuses what it cannot use, in words", () => {
    expect(() => parseArguments(["--app", "not a url"], {})).toThrow(
      "--app must be an http(s) address such as http://localhost:3010.",
    );
    expect(() => parseArguments(["--app", "ftp://host"], {})).toThrow(
      "--app must be an http(s) address",
    );
    expect(() => parseArguments(["--clips", "0"], {})).toThrow(
      "--clips must be a whole number from 1 to 20.",
    );
    expect(() => parseArguments(["--max-wer", "-1"], {})).toThrow(
      "--max-wer is a percentage from 0 to 100.",
    );
    expect(() => parseArguments(["--app"], {})).toThrow("--app needs a value.");
    expect(() => parseArguments(["--nope"], {})).toThrow(
      "Unknown option --nope.",
    );
  });
});

describe("parseCookieHeader", () => {
  test("splits a Cookie header into cookies for the app, keeping an = inside a value", () => {
    expect(
      parseCookieHeader(
        "a=1; better-auth.session_token=abc=def.ghi",
        "http://localhost:3010",
      ),
    ).toEqual([
      { name: "a", value: "1", url: "http://localhost:3010" },
      {
        name: "better-auth.session_token",
        value: "abc=def.ghi",
        url: "http://localhost:3010",
      },
    ]);
  });

  test("a malformed header is refused without repeating what it held", () => {
    let message = "";
    try {
      parseCookieHeader("hunter2-no-equals-sign", "http://localhost:3010");
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toBe("E2E_COOKIE must look like name=value; name2=value2.");
  });
});

describe("paddedWav", () => {
  test("adds a second before and a second and a half after, and keeps the samples where they were", () => {
    const clip = new Int16Array(8000).fill(1234);
    const padded = paddedWav(pcm16Wav(clip, 16000));
    expect(wavDurationSeconds(padded)).toBe(1 + 0.5 + 1.5);
    const view = new DataView(
      padded.buffer,
      padded.byteOffset,
      padded.byteLength,
    );
    expect(view.getInt16(44 + 15999 * 2, true)).toBe(0);
    expect(view.getInt16(44 + 16000 * 2, true)).toBe(1234);
    expect(view.getInt16(44 + (16000 + 7999) * 2, true)).toBe(1234);
    expect(view.getInt16(44 + (16000 + 8000) * 2, true)).toBe(0);
  });
});

describe("paddedWav on a clip that is 32-bit float, as FLEURS is", () => {
  test("writes PCM 16-bit for Chrome's fake microphone, with the samples where they were", () => {
    const floats = new Float32Array(8000).fill(0.5);
    const header = new Uint8Array([
      ...[..."RIFF"].map((c) => c.charCodeAt(0)),
      0,
      0,
      0,
      0,
      ...[..."WAVE"].map((c) => c.charCodeAt(0)),
      ...[..."fmt "].map((c) => c.charCodeAt(0)),
      0x12,
      0,
      0,
      0,
      3,
      0,
      1,
      0,
      0x80,
      0x3e,
      0,
      0,
      0,
      0xfa,
      0,
      0,
      4,
      0,
      0x20,
      0,
      0,
      0,
      ...[..."fact"].map((c) => c.charCodeAt(0)),
      4,
      0,
      0,
      0,
      0x40,
      0x1f,
      0,
      0,
      ...[..."data"].map((c) => c.charCodeAt(0)),
      0x00,
      0x7d,
      0,
      0,
    ]);
    const padded = paddedWav(
      new Uint8Array([...header, ...new Uint8Array(floats.buffer)]),
    );
    const view = new DataView(
      padded.buffer,
      padded.byteOffset,
      padded.byteLength,
    );
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(wavDurationSeconds(padded)).toBe(1 + 0.5 + 1.5);
    expect(view.getInt16(44 + 16000 * 2, true)).toBe(16384);
    expect(view.getInt16(44 + 15999 * 2, true)).toBe(0);
  });
});
