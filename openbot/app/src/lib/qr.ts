/**
 * A QR code, drawn here and nowhere else (docs/M1_PLAN.md D49).
 *
 * The pairing link for a phone is shown as a QR code, and the link carries a one-time code, so it is not
 * sent to a service that draws it. This is a small encoder of the QR Code standard (ISO/IEC 18004) for what it is
 * used for: a short text in byte mode, error correction M, versions 1 to 10 (up to 213 bytes). A longer text is
 * refused. The page then shows the link and the code to type, which always works.
 *
 * `qrModules(text)` returns the square of dark (true) and light (false) modules, without the quiet zone.
 * The tests decode what it draws with an independent decoder.
 */

/** Error correction codewords per block, and blocks, for level M, by version (index 0 unused). */
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;
/** Level M's two format bits. */
const FORMAT_BITS_M = 0;

/** Data modules in a symbol of this version, before the error correction is taken out. */
function rawModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const aligns = Math.floor(version / 7) + 2;
    result -= (25 * aligns - 10) * aligns - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCapacity(version: number): number {
  return (
    Math.floor(rawModules(version) / 8) -
    (ECC_PER_BLOCK[version] as number) * (BLOCKS[version] as number)
  );
}

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> bit) & 1) * x;
  }
  return z;
}

function divisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j] as number, root);
      if (j + 1 < result.length)
        result[j] = (result[j] as number) ^ (result[j + 1] as number);
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function remainder(data: number[], div: number[]): number[] {
  const result = new Array<number>(div.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    for (const [index, coefficient] of div.entries())
      result[index] =
        (result[index] as number) ^ gfMultiply(coefficient, factor);
  }
  return result;
}

function utf8(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

/** The data codewords for this text at this version: mode, length, bytes, terminator and padding. */
function dataWords(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let index = count - 1; index >= 0; index -= 1)
      bits.push((value >>> index) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version >= 10 ? 16 : 8);
  for (const byte of bytes) push(byte, 8);
  const capacityBits = dataCapacity(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const words: number[] = [];
  for (let index = 0; index < bits.length; index += 8)
    words.push(parseInt(bits.slice(index, index + 8).join(""), 2));
  for (let pad = 0xec; words.length < dataCapacity(version); pad ^= 0xec ^ 0x11)
    words.push(pad);
  return words;
}

/** The data with its error correction, in blocks, interleaved the way the standard says. */
function codewords(data: number[], version: number): number[] {
  const blocks = BLOCKS[version] as number;
  const eccLength = ECC_PER_BLOCK[version] as number;
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const div = divisor(eccLength);
  const all: number[][] = [];
  for (let index = 0, offset = 0; index < blocks; index += 1) {
    const take = shortLength - eccLength + (index < shortBlocks ? 0 : 1);
    const part = data.slice(offset, offset + take);
    offset += take;
    const ecc = remainder(part, div);
    if (index < shortBlocks) part.push(0);
    all.push(part.concat(ecc));
  }
  const out: number[] = [];
  for (let column = 0; column < (all[0] as number[]).length; column += 1)
    for (const [row, block] of all.entries())
      if (column !== shortLength - eccLength || row >= shortBlocks)
        out.push(block[column] as number);
  return out;
}

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step)
    result.splice(1, 0, position);
  return result;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** How bad a pattern is to read: long runs, blocks of one colour, and a lopsided balance (the standard's N1, N2, N4). */
function penalty(grid: boolean[][]): number {
  const size = grid.length;
  let score = 0;
  for (const lines of [
    grid,
    grid[0]?.map((_, x) => grid.map((row) => row[x] as boolean)) as boolean[][],
  ]) {
    for (const line of lines) {
      let run = 1;
      for (let index = 1; index < size; index += 1) {
        if (line[index] === line[index - 1]) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }
  for (let y = 0; y < size - 1; y += 1)
    for (let x = 0; x < size - 1; x += 1) {
      const color = (grid[y] as boolean[])[x];
      if (
        color === (grid[y] as boolean[])[x + 1] &&
        color === (grid[y + 1] as boolean[])[x] &&
        color === (grid[y + 1] as boolean[])[x + 1]
      )
        score += 3;
    }
  const dark = grid.flat().filter(Boolean).length;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Whether this text can be drawn: it fits in version 10 at level M. */
export function qrFits(text: string): boolean {
  return utf8(text).length <= dataCapacity(MAX_VERSION) - 3;
}

/** The modules of the QR code for `text`, dark as true. Throws when the text is too long (`qrFits`). */
export function qrModules(text: string): boolean[][] {
  const bytes = utf8(text);
  let version = 1;
  const needed = (v: number) =>
    Math.ceil((4 + (v >= 10 ? 16 : 8) + bytes.length * 8) / 8);
  while (version <= MAX_VERSION && needed(version) > dataCapacity(version))
    version += 1;
  if (version > MAX_VERSION)
    throw new Error("That text is too long for a QR code here.");

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const reserved = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const set = (x: number, y: number, dark: boolean) => {
    (modules[y] as boolean[])[x] = dark;
    (reserved[y] as boolean[])[x] = true;
  };

  for (let index = 0; index < size; index += 1) {
    set(6, index, index % 2 === 0);
    set(index, 6, index % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy += 1)
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size)
          set(x, y, distance !== 2 && distance !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const aligns = alignmentPositions(version, size);
  for (const [i, cx] of aligns.entries())
    for (const [j, cy] of aligns.entries()) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === aligns.length - 1) ||
        (i === aligns.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1)
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }

  const drawFormat = (mask: number) => {
    const data = (FORMAT_BITS_M << 3) | mask;
    let rest = data;
    for (let index = 0; index < 10; index += 1)
      rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const bits = ((data << 10) | rest) ^ 0x5412;
    const bit = (index: number) => ((bits >>> index) & 1) !== 0;
    for (let index = 0; index <= 5; index += 1) set(8, index, bit(index));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let index = 9; index < 15; index += 1) set(14 - index, 8, bit(index));
    for (let index = 0; index < 8; index += 1)
      set(size - 1 - index, 8, bit(index));
    for (let index = 8; index < 15; index += 1)
      set(8, size - 15 + index, bit(index));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rest = version;
    for (let index = 0; index < 12; index += 1)
      rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
    const bits = (version << 12) | rest;
    for (let index = 0; index < 18; index += 1) {
      const dark = ((bits >>> index) & 1) !== 0;
      const a = size - 11 + (index % 3);
      const b = Math.floor(index / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  const all = codewords(dataWords(bytes, version), version);
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1)
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!(reserved[y] as boolean[])[x] && bitIndex < all.length * 8) {
          (modules[y] as boolean[])[x] =
            (((all[bitIndex >>> 3] as number) >>> (7 - (bitIndex & 7))) & 1) !==
            0;
          bitIndex += 1;
        }
      }
  }

  let best: { mask: number; grid: boolean[][]; score: number } | undefined;
  for (let mask = 0; mask < 8; mask += 1) {
    const masker = MASKS[mask] as (x: number, y: number) => boolean;
    const grid = modules.map((row, y) =>
      row.map((dark, x) =>
        !(reserved[y] as boolean[])[x] && masker(x, y) ? !dark : dark,
      ),
    );
    // The format bits name the mask, so they are drawn again into this copy.
    const copy = grid.map((row) => row.slice());
    const saved = modules.map((row) => row.slice());
    for (let y = 0; y < size; y += 1)
      modules[y] = (copy[y] as boolean[]).slice();
    drawFormat(mask);
    const finished = modules.map((row) => row.slice());
    for (let y = 0; y < size; y += 1)
      modules[y] = (saved[y] as boolean[]).slice();
    const score = penalty(finished);
    if (!best || score < best.score) best = { mask, grid: finished, score };
  }
  return (best as { grid: boolean[][] }).grid;
}
