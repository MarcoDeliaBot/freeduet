import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { qrFits, qrModules } from "./qr";

const rows = (text: string) =>
  qrModules(text).map((row) => row.map((dark) => (dark ? "1" : "0")).join(""));

/*
 * The encoder was checked against an independent decoder (OpenCV's QR detector) for texts from one byte to the
 * longest it accepts, in every version it draws, and each decoded to the text. Those two codes are pinned here, so a
 * change to any step of the encoder (the error correction, the masks, the format bits, the layout) fails.
 */
test("a short text is the symbol an independent decoder read back as the text (version 1)", () => {
  expect(rows("hello")).toEqual([
    "111111100110001111111",
    "100000100110001000001",
    "101110100100101011101",
    "101110100011001011101",
    "101110100110101011101",
    "100000101001101000001",
    "111111101010101111111",
    "000000000001100000000",
    "100101101100010100000",
    "001011000010001000011",
    "000110111100110001101",
    "111011001001000001011",
    "011010110010101010000",
    "000000001101000110101",
    "111111100010010101110",
    "100000101011110110000",
    "101110100001001110001",
    "101110101101000101111",
    "101110100110100010101",
    "100000100110011000000",
    "111111101111100101010",
  ]);
});

test("the pairing link is the symbol the same decoder read back as the link (version 4)", () => {
  const link = "https://duet.example.test/settings#pair=ABCDEFGHJK";
  const grid = rows(link);
  expect(grid).toHaveLength(33);
  expect(createHash("sha256").update(grid.join("")).digest("hex")).toBe(
    "502b61594d6789fc537c71ee170584904ffcea50c54d9451404d4dc5f3d7d92c",
  );
});

test("the size follows the text: 21 modules to 14 bytes, 25 from 15, 57 at the longest (213 bytes)", () => {
  expect(qrModules("x".repeat(14))).toHaveLength(21);
  expect(qrModules("x".repeat(15))).toHaveLength(25);
  expect(qrModules("y".repeat(213))).toHaveLength(57);
});

test("every symbol is square, has its three finder patterns and its timing pattern", () => {
  for (const text of [
    "a",
    "http://localhost:3010/settings#pair=ABCDEFGHJK",
    "z".repeat(120),
  ]) {
    const grid = qrModules(text);
    const size = grid.length;
    for (const [x, y] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ] as const)
      for (let dy = 0; dy < 7; dy += 1)
        for (let dx = 0; dx < 7; dx += 1) {
          const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          expect((grid[y + dy] as boolean[])[x + dx]).toBe(edge || core);
        }
    for (let index = 8; index < size - 8; index += 1)
      expect((grid[6] as boolean[])[index]).toBe(index % 2 === 0);
    for (const row of grid) expect(row).toHaveLength(size);
  }
});

test("the same text is the same symbol, and a different text is not", () => {
  expect(rows("same")).toEqual(rows("same"));
  expect(rows("same")).not.toEqual(rows("sane"));
});

test("a text that does not fit is refused, and qrFits says so first", () => {
  expect(qrFits("y".repeat(213))).toBe(true);
  expect(qrFits("y".repeat(214))).toBe(false);
  expect(() => qrModules("y".repeat(214))).toThrow("too long");
});
