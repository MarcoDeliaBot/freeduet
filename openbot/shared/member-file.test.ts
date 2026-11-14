import { describe, expect, test } from "bun:test";
import {
  OFFER_FILE_TOOL,
  OFFERED_PATH_MAX,
  offeredFileResult,
  offeredFileUrl,
  readOfferedFile,
  savedFileName,
} from "./member-file";

const FILE = {
  botId: "video",
  path: "out/final.mp4",
  name: "final.mp4",
  bytes: 1_234_567,
};

describe("the file a member offers", () => {
  test("the tool is called offer_file", () => {
    expect(OFFER_FILE_TOOL).toBe("offer_file");
  });

  test("a result the tool wrote is read back as the same file", () => {
    expect(readOfferedFile(offeredFileResult(FILE, "A note."))).toEqual(FILE);
  });

  test("a result the runtime encoded once more is read back too", () => {
    const result = JSON.stringify(offeredFileResult(FILE, "A note."));
    expect(readOfferedFile(result)).toEqual(FILE);
  });

  test("the note is for the member and never reaches the card", () => {
    const file = readOfferedFile(offeredFileResult(FILE, "A note."));
    expect(file).not.toHaveProperty("note");
  });

  test.each([
    [
      "a refusal",
      "Refused. There is no file at out/final.mp4 in your workspace.",
    ],
    ["text that is not JSON", "done"],
    ["an array", "[]"],
    ["null", "null"],
    ["a number", "42"],
    ["a result that is not text", undefined],
    ["an object that is not text", { ...FILE }],
  ])("%s draws nothing", (_name, result) => {
    expect(readOfferedFile(result)).toBeNull();
  });

  test.each([
    ["no member", { ...FILE, botId: "" }],
    ["a member that is not text", { ...FILE, botId: 7 }],
    ["no path", { ...FILE, path: "" }],
    [
      "a path that is too long",
      { ...FILE, path: "a".repeat(OFFERED_PATH_MAX + 1) },
    ],
    ["no name", { ...FILE, name: "" }],
    ["no size", { botId: "video", path: "a", name: "a" }],
    ["a size that is not a number", { ...FILE, bytes: "12" }],
    ["a negative size", { ...FILE, bytes: -1 }],
    ["a size with a fraction", { ...FILE, bytes: 1.5 }],
    ["a size no number can hold", { ...FILE, bytes: 1e300 }],
  ])("%s draws nothing", (_name, value) => {
    expect(readOfferedFile(JSON.stringify(value))).toBeNull();
  });

  test("a name in a result is made safe to save before it is drawn", () => {
    const hostile = { ...FILE, name: "../../evil\u202Efdp.exe\n" };
    expect(readOfferedFile(JSON.stringify(hostile))?.name).toBe(
      ".._.._evilfdp.exe",
    );
  });
});

describe("the name a file is saved under", () => {
  test("an ordinary name is kept as it is", () => {
    expect(savedFileName("final cut (v2).mp4")).toBe("final cut (v2).mp4");
    expect(savedFileName("relazione è pronta.pdf")).toBe(
      "relazione è pronta.pdf",
    );
  });

  test.each([
    ["a slash", "a/b.txt", "a_b.txt"],
    ["a backslash", "a\\b.txt", "a_b.txt"],
    ["a line break", "a\r\nb.txt", "ab.txt"],
    ["a NUL", "a\u0000b.txt", "ab.txt"],
    ["a right-to-left override", "video\u202Efdp.exe", "videofdp.exe"],
    ["an isolate", "a\u2066b\u2069.txt", "ab.txt"],
    ["a C1 control", "a\u0085b.txt", "ab.txt"],
    ["a paragraph separator", "a\u2029b.txt", "ab.txt"],
  ])("%s never reaches the saved name", (_what, name, expected) => {
    expect(savedFileName(name)).toBe(expected);
  });

  test.each([[""], ["   "], ["."], [".."], ["\u202E"]])(
    "%j has nothing left to be called, so it is download",
    (name) => {
      expect(savedFileName(name)).toBe("download");
    },
  );

  test("a long name is cut to 255 characters", () => {
    expect(Array.from(savedFileName(`${"é".repeat(400)}.mp4`)).length).toBe(
      255,
    );
  });
});

describe("where the Download button fetches from", () => {
  test("it is the computer download route of that member, on the same origin", () => {
    expect(offeredFileUrl(FILE)).toBe(
      "/api/computers/video/files/download?path=out%2Ffinal.mp4",
    );
  });

  test("a member and a path that hold separators or reserved characters stay one value each", () => {
    const url = offeredFileUrl({
      botId: "a/b?c",
      path: "x y/../z&w=1#t.mp4",
    });
    expect(url).toBe(
      "/api/computers/a%2Fb%3Fc/files/download?path=x%20y%2F..%2Fz%26w%3D1%23t.mp4",
    );
    const parsed = new URL(url, "http://app.test");
    expect(parsed.origin).toBe("http://app.test");
    expect(parsed.searchParams.get("path")).toBe("x y/../z&w=1#t.mp4");
  });
});
