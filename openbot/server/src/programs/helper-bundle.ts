/**
 * The helper's files, handed to the person who is at the computer (docs/design/programs-on-your-computer.md,
 * slice S5a): a plain zip of the four files the running server itself carries, so nobody has to find a folder inside
 * WSL or a source checkout.
 *
 * WHERE THE FILES ARE. `openbot/scripts/programs-helper/`, which from this file is `../../../scripts/programs-helper`:
 * a source checkout started by `scripts/start.sh` has it there, and both images (server/Dockerfile and the all-in-one
 * Dockerfile) copy that one folder to `/app/scripts/programs-helper`, beside `/app/server`. A deployment that lacks the
 * folder answers 404 with a plain sentence; nothing is looked for anywhere else.
 *
 * WHAT IS SERVED. A fixed list of four names, never a name from a request, so no path can be steered. The zip is built
 * here with "stored" entries (no compression): the format is a few dozen bytes of header around each file, so no
 * package is needed. The names, sizes and CRC-32 are the files' own; the time stamp is fixed so the same files always
 * give the same bytes.
 */
import { crc32 } from "node:zlib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The four files, in the order they are put in the zip. */
export const HELPER_FILES = [
  "FreeDuetProgramsHelper.ps1",
  "setup.ps1",
  "uninstall.ps1",
  "README.md",
] as const;

/** The name the browser saves it under. */
export const HELPER_ZIP_NAME = "freeduet-programs-helper.zip";

export const DEFAULT_HELPER_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "scripts",
  "programs-helper",
);

/** A file that is not there, or not readable. */
export class HelperFilesMissingError extends Error {}

function u16(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}
function u32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
}

/** A zip of already-read files (name, bytes), "stored", with a fixed time stamp (1 January 2026, 00:00). */
export function zipStored(
  files: ReadonlyArray<{ name: string; data: Buffer }>,
): Buffer {
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800), // UTF-8 names
      u16(0), // stored
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(DOS_TIME),
        u16(DOS_DATE),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  return Buffer.concat([
    ...locals,
    central,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
}

/** Reads the four files from `directory` and returns the zip. Throws `HelperFilesMissingError` when one is absent. */
export async function buildHelperZip(
  directory: string = DEFAULT_HELPER_DIR,
): Promise<Buffer> {
  const files: Array<{ name: string; data: Buffer }> = [];
  for (const name of HELPER_FILES) {
    try {
      files.push({ name, data: await readFile(join(directory, name)) });
    } catch {
      throw new HelperFilesMissingError(name);
    }
  }
  return zipStored(files);
}
